// packages/silinx-fpga/src/fpga/place-route.js: the one place and route of the Silinx toolchain's flows (the app's,
// packages/silinx-fpga/research/s3e-route/open-flow.mjs, the design corpus's: #79, #88). A placement is exactly the
// placer's with the delay table, the clock and global buffer sites of known bits; the routing the
// timing-driven router's; tries keep the fastest; register replication (#4) is tried on the best
// and kept only when faster.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { readYosysJson } from '../packages/silinx-fpga/src/fpga/netlist.js';
import { pack } from '../packages/silinx-fpga/src/fpga/pack.js';
import { deviceSites, place, placedXdl } from '../packages/silinx-fpga/src/fpga/place.js';
import { loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';
import { routeDesign, clockReach, bufgReach, checkRouting } from '../packages/silinx-fpga/src/fpga/route.js';
import { knownRouting } from '../packages/silinx-fpga/src/fpga/bitgen.js';
import { analyzeTiming, delayTable } from '../packages/silinx-fpga/src/fpga/timing.js';
import { parseXdl, writeXdl } from '../packages/silinx-fpga/src/xdl.js';
import { loadDb } from '../packages/silinx-fpga/src/fpga/bitdb-node.js';
import { placeRoute, placeRouteBest, placeOnly, RETRY_SEEDS, HIGH_TRIES, NORMAL_TRIES, HIGH_EXTRA, effortTries, effortExtra } from '../packages/silinx-fpga/src/fpga/place-route.js';

const PART = 'xc3s250ecp132-4';
// a flip-flop (s) that selects 64 registers spread over the chip, on the critical path: replicated
// (as test/open-flow.test.js's)
const FAN64 = `module fan(input clk, input sel, input din, output reg y);
  reg s;
  reg [63:0] a, q;
  reg [15:0] r1;
  reg [3:0] r2;
  integer i;
  always @(posedge clk) begin
    s <= sel;
    a <= {a[62:0], din};
    for (i = 0; i < 64; i = i + 1) q[i] <= s ? a[i] : a[63 - i];
    for (i = 0; i < 16; i = i + 1) r1[i] <= ^q[4*i +: 4];
    for (i = 0; i < 4; i = i + 1) r2[i] <= ^r1[4*i +: 4];
    y <= ^r2;
  end
endmodule
`;
let ctx = null;
const setup = async () => {
  if (ctx) return ctx;
  const r = await synthesizeOpen(elaborate(compile([{ path: 'fan.v', lang: 'verilog', text: FAN64 }]), 'fan'), { run: yosysNode });
  assert.deepEqual(r.warnings, []);
  const netlist = readYosysJson(r.files['fan.json']);
  const packed = pack(netlist, { part: PART });
  assert.deepEqual(packed.warnings, []);
  const device = loadDeviceCache(PART);
  const known = knownRouting(loadDb(PART, { graph: device }));
  return (ctx = { netlist, packed, device, known });
};

test('placeRoute: the placer with the delay table and the clock / global buffer sites of known bits, the timing-driven router, the STA of the routed design', { timeout: 300000 }, async () => {
  const { packed, device, known } = await setup();
  const seen = [];
  const pr = placeRoute(packed, device, known, { seed: 2, onPlaced: (pl, info) => seen.push(['placed', pl.delay, info]), onRouted: (x, info) => seen.push(['routed', x.period, info]) });
  // the same placement and routing as the steps by hand
  const allowPip = known.allowPip;
  const pl = place(packed, deviceSites(device, known), { seed: 2, effort: 1, delays: delayTable(device, { allowPip }),
    clockSites: site => clockReach(device, site, allowPip), bufgSites: (site, pin, to) => bufgReach(device, site, pin, allowPip, to) });
  const placedText = writeXdl(placedXdl(packed, pl));
  assert.equal(pr.placedText, placedText);
  assert.deepEqual(pr.placement.warnings, []);
  const routed = routeDesign(parseXdl(placedText), device, { ...known, timing: true });
  assert.equal(writeXdl(pr.routed.design), writeXdl(routed.design));
  assert.deepEqual([pr.routed.errors, pr.routed.failed], [[], []]);
  const sta = analyzeTiming(parseXdl(writeXdl(routed.design)), device);
  assert.equal(pr.sta.period, sta.period);
  assert.equal(pr.period, sta.period);
  assert.equal(pr.seed, 2);
  assert.equal(pr.packed, packed);
  assert.ok(pr.placeMs >= 0 && pr.routeMs >= 0);
  // the callbacks, in order, with the placement's info
  assert.deepEqual(seen.map(s => s[0]), ['placed', 'routed']);
  assert.equal(seen[0][1], pl.delay);
  assert.deepEqual({ ...seen[0][2], placeMs: 0 }, { seed: 2, try: 0, replication: null, placeMs: 0 });
  assert.deepEqual(seen[1][2], { seed: 2, try: 0, replication: null });
  assert.equal(seen[1][1], sta.period);
  // #651: the placement alone (placeOnly) is placeRoute's, and placeRoute routes it as given (not placed again)
  const only = placeOnly(packed, device, known, { seed: 2 });
  assert.equal(only.seed, 2);
  assert.ok(only.placeMs >= 0);
  assert.equal(writeXdl(placedXdl(packed, only.placement)), placedText);
  assert.equal(only.placement.delay, pl.delay);
  const again = placeRoute(packed, device, known, { seed: 2, placed: only });
  assert.equal(again.placement, only.placement);
  assert.equal(again.placeMs, only.placeMs);
  assert.equal(writeXdl(again.routed.design), writeXdl(routed.design));
  assert.equal(again.period, sta.period);
});

// #662: after the routing is legal, the critical path's connections one at a time, each one's own branch
// routed again on free wires or on less critical nets' (those nets routed again around it), kept when the
// critical path is no longer. On FAN64's placement of seed 2 the router alone leaves its critical path at
// 3.41 ns (by the analysis), the polish at 3.15; the routing stays legal and complete
test('routeDesign: the polish of the critical path shortens it on a routing that is already legal, never lengthens it (#662)', { timeout: 300000 }, async () => {
  const { packed, device, known } = await setup();
  const { placedText } = placeRoute(packed, device, known, { seed: 2 });
  const route = o => {
    const r = routeDesign(parseXdl(placedText), device, { ...known, timing: true, ...o });
    const d = parseXdl(writeXdl(r.design));
    assert.deepEqual([r.errors, r.failed, r.unreached, r.overused], [[], [], [], 0]);
    assert.deepEqual(checkRouting(d, device).problems, []);
    const sta = analyzeTiming(d, device);
    assert.ok(Math.abs(sta.period - r.period) < 1e-9, 'the period the router returns is its routing\'s');
    return sta.period;
  };
  const without = route({ polish: 0 }), polished = route({}), free = route({ stealCost: 0 });
  assert.ok(polished <= without - 0.2, `polished ${polished.toFixed(3)} ns, without ${without.toFixed(3)} ns`);
  assert.ok(free <= without, `on free wires only ${free.toFixed(3)} ns`);
  // the router as before #662 (2 timing passes at the congestion factor the passes left, no polish): no faster
  assert.ok(route({ polish: 0, timingPasses: 2, timingPf: null }) >= polished);
});

// #651: an enable computed from eight flip-flops by two levels of LUTs, on the CE pins of a 64-bit
// register: its loads are all about as critical, so no change of one load's branch shortens the critical
// path (each new branch slows the others), where the whole net routed again does
const CE64 = `module ce64(input clk, input [3:0] k, input [3:0] m, input din, output y);
  reg [3:0] kr, mr;
  reg [63:0] a;
  reg [15:0] r1;
  reg [3:0] r2;
  reg yy;
  integer i;
  always @(posedge clk) begin
    kr <= k; mr <= m;
    if ((&kr) | (&mr)) a <= {a[62:0], din ^ a[63]};
    for (i = 0; i < 16; i = i + 1) r1[i] <= ^a[4*i +: 4];
    for (i = 0; i < 4; i = i + 1) r2[i] <= ^r1[4*i +: 4];
    yy <= ^r2;
  end
  assign y = yy;
endmodule
`;

// #651: the polish's two more moves, the whole net of a critical connection routed again (polishNet) and
// the lookahead when no change gains; on CE64's placements (by the analysis, with the LUT inputs' delays by
// pin, #1359; the carry's XOR and XB delays trce's, #2286): seed 25, the router as before 5.434 ns, the whole-net move
// 5.149; the lookahead on the first of seeds 6, 28, 8 where it gains (on macOS 5.742 -> 5.496 on seed 6; a placement
// may differ on Linux, as seed 2's did before); never longer, the routing legal and complete
test('routeDesign: the polish routes a critical connection\'s whole net again, and looks ahead when stuck (#651)', { timeout: 300000 }, async () => {
  const r = await synthesizeOpen(elaborate(compile([{ path: 'ce64.v', lang: 'verilog', text: CE64 }]), 'ce64'), { run: yosysNode });
  assert.deepEqual(r.warnings, []);
  const packed = pack(readYosysJson(r.files['ce64.json']), { part: PART });
  assert.deepEqual(packed.warnings, []);
  const { device, known } = await setup();
  const periods = seed => {
    const { placedText, placement } = placeRoute(packed, device, known, { seed });
    assert.deepEqual(placement.warnings, []);
    const route = o => {
      const x = routeDesign(parseXdl(placedText), device, { ...known, timing: true, ...o });
      const d = parseXdl(writeXdl(x.design));
      assert.deepEqual([x.errors, x.failed, x.unreached, x.overused], [[], [], [], 0]);
      assert.deepEqual(checkRouting(d, device).problems, []);
      const sta = analyzeTiming(d, device);
      assert.ok(Math.abs(sta.period - x.period) < 1e-9, 'the period the router returns is its routing\'s');
      return sta.period;
    };
    return { before: route({ polishNet: false, lookahead: 0 }), net: route({ lookahead: 0 }), look: route({ polishNet: false }), both: route({}) };
  };
  const never = p => { for (const k of ['net', 'look', 'both']) assert.ok(p[k] <= p.before + 1e-9, `${k} ${p[k].toFixed(3)} ns, before ${p.before.toFixed(3)} ns`); };
  const s25 = periods(25);
  never(s25);
  assert.ok(s25.net <= s25.before - 0.15, `seed 25: the whole net again ${s25.net.toFixed(3)} ns, before ${s25.before.toFixed(3)} ns`);
  assert.ok(s25.both <= s25.before - 0.15);
  const tried = [];
  for (const seed of [6, 28, 8]) {
    const p = periods(seed);
    never(p);
    tried.push(`seed ${seed} ${p.before.toFixed(3)} -> ${p.look.toFixed(3)} ns`);
    if (p.look <= p.before - 0.15) { assert.ok(p.both <= p.before - 0.15); break; }
    assert.ok(tried.length < 3, `the lookahead: ${tried.join(', ')}`);
  }
});

test('placeRouteBest: tries from the seed on, the fastest kept; then register replication, kept only when faster; replicate: false tries none', { timeout: 600000 }, async () => {
  const { netlist, packed, device, known } = await setup();
  // two tries, no replication: the faster of seeds 3 and 4
  const tries = [];
  const two = placeRouteBest(netlist, packed, device, known, { seed: 3, tries: 2, replicate: false, onRouted: (x, info) => tries.push([info.seed, info.try, x.period]) });
  assert.deepEqual(tries.map(t => t.slice(0, 2)), [[3, 0], [4, 1]]);
  const fastest = tries.reduce((a, t) => (t[2] < a[2] ? t : a));
  assert.equal(two.seed, fastest[0]);
  assert.equal(two.period, fastest[2]);
  assert.equal(two.first.seed, 3);
  assert.equal(two.replication, null);
  // seed 1 with replication (the flows' default): the flip-flop s copied, the design placed again
  // from the first placement (#87) and routed; kept when faster
  const placed = [];
  let reported = null;
  const best = placeRouteBest(netlist, packed, device, known, { seed: 1, pack: { part: PART }, onPlaced: (pl, info) => placed.push(info.replication), onReplication: x => { reported = x; } });
  const plain = placeRouteBest(netlist, packed, device, known, { seed: 1, replicate: false });
  assert.equal(best.first.period, plain.period, 'the same first placement and routing');
  const r = best.replication;
  assert.equal(reported, r);
  assert.equal(r.flipFlops, 1);
  assert.equal(r.plan.length, 1);
  assert.ok(r.copies >= 2, 'its 64 loads in groups of up to 16');
  assert.equal(r.before, plain.period);
  assert.equal(r.error, null);
  assert.ok(r.result.sta);
  assert.equal(r.result.seed, 1);
  assert.deepEqual(placed, [null, { flipFlops: 1, luts: 0, copies: r.copies }]);
  // placed from the first placement (#87): most instances of the first that the replicated design has
  // (by name) on their sites (the greedy pass moves some once the copies take loads; a placement from
  // scratch keeps hardly any)
  const site = new Map(best.first.packed.insts.map((x, k) => [x.name, best.first.placement.sites[k].site]));
  const both = r.result.packed.insts.map((x, k) => [site.get(x.name), r.result.placement.sites[k].site]).filter(([a]) => a);
  assert.ok(both.length >= 0.9 * best.first.packed.insts.length, 'the instances of the first in the replicated design');
  assert.ok(both.filter(([a, b]) => a === b).length >= 0.5 * both.length, `${both.filter(([a, b]) => a === b).length} of ${both.length} on their sites`);
  assert.equal(r.kept, r.result.period < plain.period);
  assert.equal(best.period, Math.min(r.result.period, plain.period));
  // the kept circuit has the copies of the flip-flop
  assert.equal(best.packed.stats.ffs, packed.stats.ffs + (r.kept ? r.copies : 0));
  assert.equal(/_rep\d+"/.test(writeXdl(best.routed.design)), r.kept);
});

test('placeRouteBest: a replicated design that cannot be placed is not kept (the error reported, the first placement kept)', { timeout: 600000 }, async () => {
  const { netlist, packed, device, known } = await setup();
  // the replicated netlist packed with an output on a pin the package does not have: the placer fails
  const best = placeRouteBest(netlist, packed, device, known, { seed: 1, pack: { part: PART, ucf: 'NET "y" LOC = "ZZ99";' } });
  const r = best.replication;
  assert.ok(r.error instanceof Error, 'the error of the replicated placement');
  assert.match(r.error.message, /ZZ99/);
  assert.equal(r.result, null);
  assert.equal(r.kept, false);
  assert.equal(best.period, r.before);
  assert.equal(best.packed, packed);
});

test('the three flows (the app\'s, open-flow.mjs, the design corpus\'s) place and route through placeRouteBest only (#79, #88)', () => {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
  for (const f of ['packages/silinx-fpga/src/open-flow-core.js', 'packages/silinx-fpga/research/s3e-route/open-flow.mjs', 'test/designs-corpus/run.mjs']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    // (the app's: placeRouteBest unless its io gives another place and route, #1678)
    assert.match(src, /placeRouteBest\)?\(netlist, packed, /, f);
    // no placement, routing or replication of their own
    for (const call of ['place(', 'routeDesign(', 'replicationPlan(', 'replicateCells(', 'placedXdl(']) assert.ok(!new RegExp(`[^\\w.]${call.replace('(', '\\(')}`).test(src), `${f}: ${call}`);
  }
});

// Regression (#249): a routing the router leaves with nodes shared (it did not converge: secworks-sha256 on
// CI's placement) is placed again with the next seeds, a few; a net that cannot be routed is not (another
// placement does not give the switches the bit database lacks). A fake placeRoute: seed -> its outcome.
test('placeRouteBest: no placement routed completely for nodes left shared: the next seeds, up to RETRY_SEEDS more (#249)', () => {
  const fake = (outcome) => {
    const calls = [];
    const fn = (packed, device, known, { seed, info }) => {
      calls.push([seed, info.try, !!info.retry]);
      const o = outcome(seed);
      return { seed, packed, placement: {}, sta: o === 'ok' ? {} : null, period: o === 'ok' ? 10 + seed : Infinity,
        routed: { overused: o === 'shared' ? 2 : 0, errors: [], failed: o === 'unroutable' ? ['n'] : [] } };
    };
    return { fn, calls };
  };
  const run = (outcome, opts = {}) => { const f = fake(outcome); const r = placeRouteBest(null, {}, null, {}, { delays: {}, replicate: false, placeRouteFn: f.fn, ...opts }); return { r, calls: f.calls }; };
  assert.equal(RETRY_SEEDS, 3);
  // seed 1 and 2 do not converge, seed 3 does: kept, two placements more
  let { r, calls } = run(s => (s >= 3 ? 'ok' : 'shared'));
  assert.deepEqual(calls, [[1, 0, false], [2, 1, true], [3, 2, true]]);
  assert.deepEqual([r.seed, r.retried, r.period], [3, 2, 13]);
  // none converges: RETRY_SEEDS more, then the incomplete routing is returned (the flow says so)
  ({ r, calls } = run(() => 'shared'));
  assert.deepEqual(calls.map(c => c[0]), [1, 2, 3, 4]);
  assert.deepEqual([r.retried, r.sta, r.routed.overused], [3, null, 2]);
  // with tries: the retries start after them
  ({ r, calls } = run(s => (s === 5 ? 'ok' : 'shared'), { seed: 2, tries: 2 }));
  assert.deepEqual(calls, [[2, 0, false], [3, 1, false], [4, 2, true], [5, 3, true]]);
  assert.deepEqual([r.seed, r.retried], [5, 2]);
  // the first routes: no retry; a net that cannot be routed: no retry; retries: 0
  assert.deepEqual(run(() => 'ok').calls.length, 1);
  assert.deepEqual(run(() => 'unroutable').calls.length, 1);
  assert.deepEqual(run(() => 'shared', { retries: 0 }).calls.length, 1);
});

// #651: the placements of the flows: two at High (and one more, routed when its estimate is promising, below), two at
// Normal for a design of 500 slices at most, one for a larger one
test('effortTries: two placements at High, at Normal two up to NORMAL_TRIES.maxSlices slices and one above (#651)', () => {
  assert.equal(HIGH_TRIES, 2);
  assert.deepEqual(NORMAL_TRIES, { tries: 2, maxSlices: 500 });
  for (const slices of [1, 500, 501, 4000]) assert.equal(effortTries('high', slices), 2, `high ${slices}`);
  assert.deepEqual([1, 25, 499, 500].map(n => effortTries('normal', n)), [2, 2, 2, 2]);
  assert.deepEqual([501, 960, 4656].map(n => effortTries('normal', n)), [1, 1, 1]);
  // (no effort given: Normal's)
  assert.deepEqual([effortTries(undefined, 100), effortTries(undefined, 600)], [2, 1]);
});

// #651: at High one placement more (seed 3), routed only when the placer's estimate of its critical path (placement.delay)
// is shorter than the longest of the first two's; kept when its routing is faster. A fake placer and router: seed ->
// [estimate, routed period].
test('placeRouteBest: the extra placements, routed only when their estimate is shorter than one of the first ones\' (#651)', () => {
  assert.equal(HIGH_EXTRA, 1);
  assert.deepEqual(['high', 'normal', undefined].map(effortExtra), [1, 0, 0]);
  const run = (table, opts = {}) => {
    const placed = [], routed = [];
    const placeFn = (packed, device, known, { seed }) => { placed.push(seed); return { seed, placeMs: 0, placement: { delay: table[seed][0] } }; };
    const placeRouteFn = (packed, device, known, { seed, placed: pre, info }) => {
      routed.push([seed, info.try, !!pre]);
      const [est, period] = table[seed];
      return { seed, packed, placement: pre ? pre.placement : { delay: est }, sta: Number.isFinite(period) ? {} : null, period,
        routed: { overused: Number.isFinite(period) ? 0 : 2, errors: [], failed: [] } };
    };
    const r = placeRouteBest(null, {}, null, {}, { delays: {}, replicate: false, tries: 2, extra: 1, placeFn, placeRouteFn, ...opts });
    return { r, placed, routed };
  };
  // the third's estimate shorter than the second's (the longer of the two): routed (its placement, not placed again), and kept
  let { r, placed, routed } = run({ 1: [10, 12], 2: [11, 13], 3: [10.5, 11.5] });
  assert.deepEqual(placed, [3]);
  assert.deepEqual(routed, [[1, 0, false], [2, 1, false], [3, 2, true]]);
  assert.deepEqual([r.seed, r.period, r.unrouted], [3, 11.5, []]);
  // routed, slower: the faster of the first two kept
  ({ r } = run({ 1: [10, 12], 2: [11, 13], 3: [10.5, 14] }));
  assert.deepEqual([r.seed, r.period, r.unrouted], [1, 12, []]);
  // its estimate no shorter than both (equal to the longer): placed, not routed, said in unrouted
  ({ r, placed, routed } = run({ 1: [10, 12], 2: [11, 13], 3: [11, 9] }));
  assert.deepEqual(placed, [3]);
  assert.deepEqual(routed.map(x => x[0]), [1, 2]);
  assert.deepEqual([r.seed, r.unrouted], [1, [3]]);
  // the first ones not routed completely (nodes left shared): the retries start after the extra placement
  ({ r, routed } = run({ 1: [10, Infinity], 2: [11, Infinity], 3: [12, 9], 4: [9, Infinity], 5: [9, 14] }));
  assert.deepEqual(routed, [[1, 0, false], [2, 1, false], [4, 3, false], [5, 4, false]]);
  assert.deepEqual([r.seed, r.retried, r.unrouted], [5, 2, [3]]);
  // extra 0 (Normal; the default): no placement more
  ({ r, placed } = run({ 1: [10, 12], 2: [11, 13] }, { extra: 0 }));
  assert.deepEqual([placed, r.unrouted], [[], []]);
  ({ r, placed } = run({ 1: [10, 12], 2: [11, 13] }, { extra: undefined }));
  assert.deepEqual([placed, r.unrouted], [[], []]);
  // the placer's error on the extra placement: thrown, as on the first ones
  assert.throws(() => placeRouteBest(null, {}, null, {}, { delays: {}, replicate: false, tries: 1, extra: 1,
    placeRouteFn: () => ({ seed: 1, placement: { delay: 1 }, sta: {}, period: 2, routed: { overused: 0, errors: [], failed: [] } }),
    placeFn: () => { throw new Error('place: no room'); } }), /no room/);
});

test('the XC3S1200E\'s long-line splitters (#23, #709): the router takes one where it is faster, the placer\'s delay table leaves them out; bitgen gives it its direction', { timeout: 300000 }, async () => {
  const { example, exampleUcf } = await import('./examples-lib.mjs');
  const { bitgen, pipFeatures } = await import('../packages/silinx-fpga/src/fpga/bitgen.js');
  const part = 'xc3s1200efg320-4';
  // the stopwatch example (blinky's routing took none once the LUT inputs' delays were by pin, #1359; traffic's none
  // once the carry's delays were trce's, #2286)
  const ex = example('stopwatch');
  const r = await synthesizeOpen(elaborate(compile(ex.design), ex.project.top), { run: yosysNode });
  const ucf = exampleUcf('stopwatch', { board: 'nexys2', variant: '1200' }).text;
  const netlist = readYosysJson(r.files[`${ex.project.top}.json`]);
  const packed = pack(netlist, { ucf, part });
  const device = loadDeviceCache(part);
  const db = loadDb(part, { graph: device });
  const known = knownRouting(db);
  // without the splitters (a database whose splitter types are noRoute, as CLKH_LL's before #23 and the others' before #709)
  const noSplit = knownRouting({ ...db, types: Object.fromEntries(Object.entries(db.types).map(([k, t]) => [k, t.splitter ? { ...t, noRoute: true } : t])) });
  assert.equal(known.allowPip('CLKH_LL_X35Y30', 'CLKH_LLB_LV17', 'CLKH_LLT_LV17'), true);
  assert.equal(known.delayPip('CLKH_LL_X35Y30', 'CLKH_LLB_LV17', 'CLKH_LLT_LV17'), false);
  assert.equal(known.delayPip('CLB_X35Y30', 'OMUX0', 'E2BEG0'), known.allowPip('CLB_X35Y30', 'OMUX0', 'E2BEG0'));
  // the placer's delay table is the one without the splitters: the same placements
  assert.deepEqual(delayTable(device, { allowPip: known.delayPip }).d, delayTable(device, { allowPip: noSplit.allowPip }).d);
  assert.notDeepEqual(delayTable(device, { allowPip: known.allowPip }).d, delayTable(device, { allowPip: noSplit.allowPip }).d, 'the splitters shorten some far vertical offsets');
  const best = placeRouteBest(netlist, packed, device, known, { seed: 1 });
  const before = placeRouteBest(netlist, packed, device, noSplit, { seed: 1 });
  assert.equal(best.placedText, before.placedText);
  // the router: a splitter on this placement, the routing legal; bitgen: its direction, every feature known
  const design = best.routed.design;
  const split = design.nets.flatMap(n => n.pips.filter(p => /_LL[LRBT]_L[HV]\d+$/.test(p.from)).map(p => ({ n, p })));
  assert.ok(split.length >= 1, 'a splitter used');
  assert.ok(split.every(({ p }) => p.dir === '=-'), 'written "a =- b", as ISE does');
  assert.ok(checkRouting(parseXdl(writeXdl(design)), device).ok);
  const siteOf = name => design.insts.find(i => i.name === name)?.site;
  for (const { n, p } of split) assert.match(pipFeatures(n, device, siteOf)[n.pips.indexOf(p)], /^\w+_LL[LRBT]_L[HV]\d+->\w+_LL[LRBT]_L[HV]\d+$/);
  assert.deepEqual(bitgen(writeXdl(design), db).unknown, []);
  assert.ok(best.period <= before.period + 0.05, `${best.period} ns against ${before.period} ns without the splitters`);
});
