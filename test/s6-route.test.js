// The Spartan-6 router (#730): packages/silinx-fpga/src/fpga/s6/route.js (PathFinder on the device's routing graph), route-nets.js
// (the nets, the general interconnect, the route-throughs, the TIEOFFs), route-output.js (the routed design as
// XDL), route-check.js (its rules): small designs and every example on the Nexys3's XC6SLX16 and the Atlys's
// XC6SLX45 routed completely, no node of two nets, the clocks on the global network, the routes legal by the graph,
// the switches per connection near ISE's routing of the same netlists (packages/silinx-fpga/research/s6/measured/route-compare.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { placeS6 } from '../packages/silinx-fpga/src/fpga/s6/place.js';
import { placedXdlS6 } from '../packages/silinx-fpga/src/fpga/s6/xdl.js';
import { routeS6, routedXdlS6, RouteError } from '../packages/silinx-fpga/src/fpga/s6/route.js';
import { routingResources } from '../packages/silinx-fpga/src/fpga/s6/route-nets.js';
import { checkRoutingS6 } from '../packages/silinx-fpga/src/fpga/s6/route-check.js';
import { parseXdl, writeXdl } from '../packages/silinx-fpga/src/xdl.js';
import { EXAMPLES } from './examples-lib.mjs';
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
const ucfOf = lines => lines.map(([net, loc]) => `NET "${net}" LOC = "${loc}" ;`).join('\n');

test('the general interconnect: the switch boxes\' singles, doubles, quads and logic pins, not the clock and set / reset pin wires', () => {
  const { device } = s6Device(LX16);
  const res = routingResources(device);
  const g = (tile, wire) => res.general[device.node(tile, wire)];
  assert.deepEqual(['EE2B0', 'SS4E0', 'NR1B3', 'LOGICIN_B34', 'LOGICOUT0', 'GFAN0', 'VCC_WIRE'].map(w => g('INT_X11Y28', w)), [1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(['GCLK12', 'CLK0', 'SR1'].map(w => g('INT_X11Y28', w)), [0, 0, 0]);
  // a TIEOFF in every switch box: HARD1 onto VCC_WIRE
  const t = res.tieoffs.get(device.tile('INT_X11Y28'));
  assert.equal(t.site, 'TIEOFF_X19Y56');
  assert.equal(t.hard1, device.node('INT_X11Y28', 'VCC_WIRE'));
});

test('an accumulator routed: complete, no node of two nets, the carry COUT -> CIN, the clock on the global network, the power nets from TIEOFFs', async () => {
  // (a counter and its addend: the carry's constant DI, the O5 LUTs tied high)
  const nl = await s6Verilog('module m(input clk, input [15:0] d, output reg [15:0] q, output reg [15:0] c); always @(posedge clk) begin q <= q + d; c <= c + 16\'d1; end endmodule');
  const { r, out, check } = routed(s6Phys(nl, ucfOf([['clk', 'V10']])));
  assert.deepEqual(check.problems, []);
  assert.deepEqual([r.failed, r.stats.overused, r.warnings], [[], 0, []]);
  // the carry between stages: a PIP from COUT to the CIN above (the same column)
  const carry = out.nets.filter(n => n.outpins[0]?.pin === 'COUT');
  assert.equal(carry.length, 6);
  for (const n of carry) assert.ok(n.pips.length >= 1 && n.pips.length <= 2, `${n.name}: ${n.pips.map(p => `${p.from}->${p.to}`).join(' ')}`);
  // the clock: from its pad by the dedicated path to BUFGMUX_X3Y13, from there on the global wires (GCLK, HCLK)
  const clk = out.nets.find(n => n.outpins[0]?.inst === 'clk');
  assert.ok(clk.pips.every(p => !/^(INT|IOI_INT)/.test(p.tile)), 'no switch box on the pad\'s way to its buffer');
  const gclk = out.nets.find(n => out.insts.find(i => i.name === n.outpins[0]?.inst)?.type === 'BUFG');
  assert.ok(gclk.pips.some(p => /GCLK/.test(p.to)) && gclk.pips.every(p => !/^(LOGICIN|EE|WW|NN|SS)/.test(p.to)));
  // the inputs through the I/O logic (ILOGIC2 D -> FABRICOUT), the outputs through OLOGIC2 (D1 -> OQ): their
  // XDL_DUMMY instances, configured for it
  const dummies = out.insts.filter(i => i.name.startsWith('XDL_DUMMY_'));
  assert.ok(dummies.some(i => i.type === 'ILOGIC2' && i.cfg.some(c => c.attr === '_ROUTETHROUGH' && c.name === 'D' && c.value === 'FABRICOUT')));
  assert.ok(dummies.some(i => i.type === 'OLOGIC2' && i.cfg.some(c => c.attr === '_ROUTETHROUGH' && c.name === 'D1' && c.value === 'OQ')));
  // the constant DI of the carry (the O5 LUTs tied high: A6), each part from a TIEOFF's HARD1, a net a TIEOFF
  const vcc = out.nets.filter(n => n.type === 'vcc');
  assert.ok(vcc.length >= 1 && vcc.every(n => /^GLOBAL_LOGIC1_\d+$/.test(n.name) && n.outpins[0].pin === 'HARD1'));
  assert.ok(vcc.every(n => out.insts.find(i => i.name === n.outpins[0].inst)?.type === 'TIEOFF'));
});

test('checkRoutingS6: the errors of routings that break the rules', async () => {
  const nl = await s6Verilog('module m(input clk, input a, input b, output reg y); always @(posedge clk) y <= a ^ b; endmodule');
  const { out, device } = routed(s6Phys(nl, ucfOf([['clk', 'V10'], ['a', 'T10'], ['b', 'T9'], ['y', 'U16']])));
  const copy = () => JSON.parse(JSON.stringify(out));
  // a sink cut off: its last PIP removed
  let bad = copy();
  const a = bad.nets.find(n => n.outpins[0]?.inst === 'a');
  const sp = device.sitePin(bad.insts.find(i => i.name === a.inpins[0].inst).site, a.inpins[0].pin);
  const last = a.pips.findIndex(p => p.tile === sp.tileName && p.to === sp.wire);
  assert.ok(last >= 0);
  a.pips.splice(last, 1);
  assert.ok(checkRoutingS6(bad, device).problems.includes(`net ${a.name}: sink ${a.inpins[0].inst}.${a.inpins[0].pin} not reached`));
  // the I/O logic's route-through no instance declares, or one not configured for it
  bad = copy();
  const il = bad.insts.findIndex(i => i.type === 'ILOGIC2');
  const site = bad.insts[il].site;
  bad.insts.splice(il, 1);
  assert.ok(checkRoutingS6(bad, device).problems.some(p => p.endsWith(`: a route-through of ${site} no instance declares`)));
  bad = copy();
  const d = bad.insts.find(i => i.type === 'ILOGIC2');
  d.cfg = d.cfg.filter(c => c.attr !== '_ROUTETHROUGH');
  assert.ok(checkRoutingS6(bad, device).problems.some(p => /through .* not configured for it \(D -> FABRICOUT\)$/.test(p)));
  // two nets on one node: b's PIPs given to a too
  bad = copy();
  const [na, nb] = ['a', 'b'].map(x => bad.nets.find(n => n.outpins[0]?.inst === x));
  na.pips.push(...nb.pips);
  assert.ok(checkRoutingS6(bad, device).problems.some(p => p.startsWith('node ') && p.endsWith(` used by ${na.name} and ${nb.name}`) || p.endsWith(` used by ${nb.name} and ${na.name}`)));
  // a power net without a TIEOFF source
  bad = copy();
  bad.nets.push({ name: 'v', type: 'vcc', outpins: [], inpins: [{ inst: bad.insts[0].name, pin: 'A6' }], pips: [] });
  assert.ok(checkRoutingS6(bad, device).problems.includes('net v: a power net not from a TIEOFF nor a slice\'s constant'));
});

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

// ISE's routing of the same netlists (night 1, packages/silinx-fpga/research/s6/compare-route.mjs): the routing switches of the signal
// nets per connection, the Silinx router's no more than 30 % above ISE's (night 1: 1.03 … 1.22 of it)
test('the switches per connection against ISE\'s routing of the same netlists (night 1)', { timeout: 900000 }, async () => {
  const cmp = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/research/s6/measured/route-compare.json', import.meta.url), 'utf8'));
  for (const { board, part } of S6_BOARDS) {
    for (const name of EXAMPLES) {
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

// ISE's check of the routings (2026-10-24, packages/silinx-fpga/research/s6/ise-place-check.sh, measured/ise-check.json): ISE reads every
// example's routed XDL on both boards and its DRC finds no error; the one warning, of xdl2ncd and of the DRC, is
// stopwatch's 9K block RAM note (PhysDesignRules:2410, ISE's own implementation of stopwatch has it too)
test('ISE\'s DRC of every example\'s routing on both boards: no error, the warnings', () => {
  const rec = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/research/s6/measured/ise-check.json', import.meta.url), 'utf8'));
  assert.deepEqual(Object.keys(rec.designs), S6_BOARDS.flatMap(({ board }) => EXAMPLES.map(n => `${n}-${board}`)).sort());
  for (const [d, { routed }] of Object.entries(rec.designs)) {
    const sw = d.startsWith('stopwatch-');
    assert.equal(routed.xdl2ncd, 'ok', d);
    assert.deepEqual(routed.messages, sw ? { 'WARNING:PhysDesignRules:2410': 1 } : {}, d);
    assert.deepEqual(routed.drc, sw ? { errors: 0, warnings: 1, messages: { 'WARNING:PhysDesignRules:2410': 1 } } : { errors: 0, warnings: 0, messages: {} }, d);
  }
});
