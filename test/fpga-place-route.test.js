// core/fpga/place-route.js: the one place and route of the Silinx toolchain's flows (the app's,
// research/s3e-route/open-flow.mjs, the design corpus's: #79, #88). A placement is exactly the
// placer's with the delay table, the clock and global buffer sites of known bits; the routing the
// timing-driven router's; tries keep the fastest; register replication (#4) is tried on the best
// and kept only when faster.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-open.js';
import { yosysNode } from '../core/synth-open-node.js';
import { readYosysJson } from '../core/fpga/netlist.js';
import { pack } from '../core/fpga/pack.js';
import { deviceSites, place, placedXdl } from '../core/fpga/place.js';
import { loadDeviceCache } from '../core/fpga/device-node.js';
import { routeDesign, clockReach, bufgReach } from '../core/fpga/route.js';
import { knownRouting } from '../core/fpga/bitgen.js';
import { analyzeTiming, delayTable } from '../core/fpga/timing.js';
import { parseXdl, writeXdl } from '../core/xdl.js';
import { loadDb } from '../core/fpga/bitdb-node.js';
import { placeRoute, placeRouteBest, RETRY_SEEDS } from '../core/fpga/place-route.js';

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
  const packed = pack(netlist, { part: PART, carryOut: 'xor' });
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
  // seed 1 with replication (the flows' default): the flip-flop s copied, the design placed and
  // routed again with the same seed; kept when faster
  const placed = [];
  let reported = null;
  const best = placeRouteBest(netlist, packed, device, known, { seed: 1, pack: { part: PART, carryOut: 'xor' }, onPlaced: (pl, info) => placed.push(info.replication), onReplication: x => { reported = x; } });
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
  assert.deepEqual(placed, [null, { flipFlops: 1, copies: r.copies }]);
  assert.equal(r.kept, r.result.period < plain.period);
  assert.equal(best.period, Math.min(r.result.period, plain.period));
  // the kept circuit has the copies of the flip-flop
  assert.equal(best.packed.stats.ffs, packed.stats.ffs + (r.kept ? r.copies : 0));
  assert.equal(/_rep\d+"/.test(writeXdl(best.routed.design)), r.kept);
});

test('placeRouteBest: a replicated design that cannot be placed is not kept (the error reported, the first placement kept)', { timeout: 600000 }, async () => {
  const { netlist, packed, device, known } = await setup();
  // the replicated netlist packed with an output on a pin the package does not have: the placer fails
  const best = placeRouteBest(netlist, packed, device, known, { seed: 1, pack: { part: PART, carryOut: 'xor', ucf: 'NET "y" LOC = "ZZ99";' } });
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
  for (const f of ['core/open-flow-core.js', 'research/s3e-route/open-flow.mjs', 'test/designs-corpus/run.mjs']) {
    const src = fs.readFileSync(path.join(root, f), 'utf8');
    assert.match(src, /placeRouteBest\(netlist, packed, /, f);
    // no placement, routing or replication of their own
    for (const call of ['place(', 'routeDesign(', 'replicationPlan(', 'replicateFlipFlops(', 'placedXdl(']) assert.ok(!new RegExp(`[^\\w.]${call.replace('(', '\\(')}`).test(src), `${f}: ${call}`);
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
