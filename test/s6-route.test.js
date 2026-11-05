// The Spartan-6 router (#730): packages/silinx-fpga/src/fpga/s6/route.js (PathFinder on the device's routing graph; the
// modules nextpnr's routing uses too, route-nets.js, route-output.js and route-check.js, in test/s6-routing.test.js, #2824): small designs and every example on the Nexys3's XC6SLX16 and the Atlys's
// XC6SLX45 routed completely, no node of two nets, the clocks on the global network, the routes legal by the graph,
// the switches per connection near ISE's routing of the same netlists (packages/silinx-fpga/research/s6/measured/route-compare.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { placeS6 } from '../packages/silinx-fpga/src/fpga/s6/place.js';
import { placedXdlS6 } from '../packages/silinx-fpga/src/fpga/s6/xdl.js';
import { routeS6, routedXdlS6, RouteError } from '../packages/silinx-fpga/src/fpga/s6/route.js';
import { checkRoutingS6 } from '../packages/silinx-fpga/src/fpga/s6/route-check.js';
import { parseXdl, writeXdl, evalLut } from '../packages/silinx-fpga/src/xdl.js';
import { S6_EXAMPLES as EXAMPLES, ISE_RECORDED } from './examples-lib.mjs';
import { S6_BOARDS, s6Device, s6Example, s6Phys, s6Verilog } from './s6-lib.mjs';

const LX16 = 'xc6slx16csg324-3';
// placed, routed, the routed design read back from its XDL, checked
function routed(d, part = LX16, opts = {}) {
  const { device, sites } = s6Device(part);
  const pl = placeS6(d.phys, sites, { nl: d.nl, seed: 1 });
  const x = placedXdlS6(d.nl, d.packed, d.phys, pl, { part, device });
  const r = routeS6(x, device, opts);
  const out = parseXdl(writeXdl(routedXdlS6(x, device, r)));
  return { x, r, out, check: checkRoutingS6(out, device), device };
}
test('the router\'s errors and its restriction to known switches: an unplaced instance, a sink no allowed switch reaches', async () => {
  const nl = await s6Verilog('module m(input a, output y); assign y = ~a; endmodule');
  const d = s6Phys(nl);
  const { device, sites } = s6Device(LX16);
  const pl = placeS6(d.phys, sites, { nl, seed: 1 });
  const x = placedXdlS6(nl, d.packed, d.phys, pl, { part: LX16, device });
  const unplaced = { ...x, insts: x.insts.map((i, k) => (k === 0 ? { ...i, placed: false } : i)) };
  assert.throws(() => routeS6(unplaced, device), e => e instanceof RouteError && /instance not placed or unknown/.test(e.message));
  // no switch allowed in the switch boxes: nothing reaches the LUT
  const r = routeS6(x, device, { allowPip: k => !/^INT/.test(device.tileType(k)), maxPasses: 2 });
  assert.ok(r.failed.length >= 1);
  assert.deepEqual(r.stats.overused, 0);
  // (#732) a sink no allowed switch reaches is not searched again: one pass, not the 50 allowed, every sink left out
  // marked dead
  const one = routeS6(x, device, { allowPip: k => !/^INT/.test(device.tileType(k)) });
  assert.equal(one.stats.passes, 1);
  assert.deepEqual(one.failed, r.failed);
  assert.ok(one.failedSinks.length && one.failedSinks.every(f => f.dead));
});

test('every example routed on the XC6SLX16 and the XC6SLX45: complete, no node of two nets, legal, no warnings, in seconds', { timeout: 900000 }, async () => {
  for (const { board, part } of S6_BOARDS) {
    for (const name of EXAMPLES) {
      const { r, check } = routed(await s6Example(name, board), part);
      assert.deepEqual(check.problems, [], `${board} ${name}`);
      assert.deepEqual([r.failed, r.stats.overused, r.warnings], [[], 0, []], `${board} ${name}`);
      assert.ok(r.stats.passes <= 10, `${board} ${name}: ${r.stats.passes} passes`);
      assert.ok(r.stats.seconds < 30, `${board} ${name}: ${r.stats.seconds} s`);
    }
  }
});

// a design's LUT positions as functions of their nets: { 'inst A6LUT': (values of the nets) -> 0 / 1 }, from its
// equations and the nets on its pins (A6 high under an O5, as the power net leaves it)
function lutFunctions(x) {
  const netOf = new Map();
  for (const n of x.nets) for (const p of n.inpins) netOf.set(`${p.inst} ${p.pin}`, n.name.replace(/^(GLOBAL_LOGIC[01])_\d+$/, '$1'));
  const out = new Map();
  for (const i of x.insts) for (const c of i.cfg || []) {
    if (!/^[A-D][56]LUT$/.test(c.attr) || !/^#LUT:/.test(c.value)) continue;
    const pins = [1, 2, 3, 4, 5, 6].map(k => netOf.get(`${i.name} ${c.attr[0]}${k}`));
    out.set(`${i.name} ${c.attr}`, val => evalLut(c.value.slice(5), Object.fromEntries(pins.map((n, k) => [`A${k + 1}`, n === 'GLOBAL_LOGIC1' ? 1 : n ? val(n) : 0]))) ? 1 : 0);
  }
  return out;
}

test('LUT inputs swapped (#1152): a net on any free pin of its LUT position, the equations rewritten, every LUT the same function of its nets; fewer switches', { timeout: 300000 }, async () => {
  const d = await s6Example('stopwatch', 'nexys3');
  const off = routed(d, LX16, { swapLutPins: false }), on = routed(d, LX16);
  for (const r of [off, on]) {
    assert.deepEqual(r.check.problems, []);
    assert.deepEqual([r.r.failed, r.r.stats.overused, r.r.warnings], [[], 0, []]);
  }
  assert.equal(off.r.lutGroups.length, 0);
  assert.ok(on.r.lutGroups.length > 100, `${on.r.lutGroups.length} LUT positions`);
  // (A6 under an O5 stays: high)
  for (const g of on.r.lutGroups) if (g.inst.cfg.some(c => c.attr === `${g.letter}5LUT` && c.value !== '#OFF')) assert.ok(!g.free.includes(`${g.letter}6`));
  const moved = on.out.nets.flatMap(n => n.inpins).filter(p => /^[A-D][1-6]$/.test(p.pin)).length;
  const before = lutFunctions(on.x), after = lutFunctions(on.out);
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  let changed = 0;
  for (const i of on.out.insts) for (const c of i.cfg || []) if (/^[A-D][56]LUT$/.test(c.attr) && on.x.insts.find(j => j.name === i.name)?.cfg.find(e => e.attr === c.attr)?.value !== c.value) changed++;
  assert.ok(changed > 20, `${changed} equations rewritten (${moved} LUT pins)`);
  // every LUT the same function of its nets (random values, the same for both)
  for (let t = 0; t < 64; t++) {
    const v = new Map(), val = n => (v.has(n) ? v.get(n) : v.set(n, Math.random() < 0.5 ? 1 : 0).get(n));
    for (const [k, f] of before) assert.equal(after.get(k)(val), f(val), k);
  }
  const perConn = r => { let p = 0, c = 0; for (const n of r.out.nets) if (n.type === 'wire' && n.outpins.length && !/^BUFG/.test(r.out.insts.find(i => i.name === n.outpins[0].inst).type)) { p += n.pips.length; c += n.inpins.length; } return p / c; };
  assert.ok(perConn(on) < perConn(off), `${perConn(on).toFixed(2)} < ${perConn(off).toFixed(2)} switches a connection`);
});

// ISE's routing of the same netlists (night 1, packages/silinx-fpga/research/s6/compare-route.mjs): the routing switches of the signal
// nets per connection, the Silinx router's no more than 30 % above ISE's (night 1: 1.03 … 1.22 of it)
test('the switches per connection against ISE\'s routing of the same netlists (night 1)', { timeout: 900000 }, async () => {
  const cmp = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/research/s6/measured/route-compare.json', import.meta.url), 'utf8'));
  for (const { board, part } of S6_BOARDS) {
    for (const name of ISE_RECORDED) {
      const { out } = routed(await s6Example(name, board), part);
      const type = new Map(out.insts.map(i => [i.name, i.type]));
      let pips = 0, conns = 0;
      for (const n of out.nets) {
        if (n.type !== 'wire' || !n.outpins.length || /^BUFG/.test(type.get(n.outpins[0].inst))) continue;
        pips += n.pips.length; conns += n.inpins.length;
      }
      const ise = cmp.boards[board][name].ise;
      assert.equal(pips, cmp.boards[board][name].silinx.pips, `${board} ${name}: the measured routing`);
      assert.ok(pips / conns <= 1.3 * ise.perConnection, `${board} ${name}: ${(pips / conns).toFixed(2)} a connection, ISE ${ise.perConnection}`);
    }
  }
});

// ISE's check of the routings (2026-10-24, packages/silinx-fpga/research/s6/ise-place-check.sh, measured/ise-check.json; the
// routed designs again on 2026-11-02 with the LUT inputs swapped, #1152): ISE reads every example's routed XDL on both
// boards and its DRC finds no error and no warning (stopwatch's 9K block RAM note, PhysDesignRules:2410, gone with its
// RAMB16BWER)
test('ISE\'s DRC of every example\'s routing on both boards: no error, the warnings', () => {
  const rec = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/research/s6/measured/ise-check.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(rec.designs), S6_BOARDS.flatMap(({ board }) => ISE_RECORDED.map(n => `${n}-${board}`)).sort());
  for (const [d, { routed }] of Object.entries(rec.designs)) {
    assert.equal(routed.xdl2ncd, 'ok', d);
    assert.deepEqual(routed.messages, {}, d);
    assert.deepEqual(routed.drc, { errors: 0, warnings: 0, messages: {} }, d);
  }
});
