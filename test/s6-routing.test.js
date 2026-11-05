// The Spartan-6's routing modules nextpnr's Place & Route uses (#730, #2824): route-nets.js (the nets, the general
// interconnect, the route-throughs, the TIEOFFs), route-output.js (the routed design as XDL: nextpnr's PIPs, the I/O logic's
// route-throughs, the power nets from TIEOFFs), route-check.js (its rules), on designs the Spartan-6's placer placed and
// nextpnr routed on the Nexys3's XC6SLX16 (test/s6-lib.mjs s6RouteNextpnr).
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeS6 } from '../packages/silinx-fpga/src/fpga/s6/place.js';
import { placedXdlS6 } from '../packages/silinx-fpga/src/fpga/s6/xdl.js';
import { routingResources } from '../packages/silinx-fpga/src/fpga/s6/route-nets.js';
import { checkRoutingS6 } from '../packages/silinx-fpga/src/fpga/s6/route-check.js';
import { parseXdl, writeXdl } from '../packages/silinx-fpga/src/xdl.js';
import { s6Device, s6Phys, s6Verilog, s6RouteNextpnr, NEXYS3_SW, NEXYS3_LD } from './s6-lib.mjs';

const LX16 = 'xc6slx16csg324-3';
// placed, routed by nextpnr, the routed design read back from its XDL, checked
async function routed(d, part = LX16) {
  const { device, sites } = s6Device(part);
  const pl = placeS6(d.phys, sites, { nl: d.nl, seed: 1 });
  const x = placedXdlS6(d.nl, d.packed, d.phys, pl, { part, device });
  const out = parseXdl(writeXdl(await s6RouteNextpnr(x, part)));
  return { x, out, check: checkRoutingS6(out, device), device };
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
  // (the outputs the sums' high bytes, the counter's XORed in: every pad on the Nexys3's switches and LEDs)
  const nl = await s6Verilog('module m(input clk, input [7:0] d, output [7:0] y); reg [15:0] q, c; always @(posedge clk) begin q <= q + {8\'b0, d}; c <= c + 16\'d1; end assign y = q[15:8] ^ c[15:8]; endmodule');
  const { out, check } = await routed(s6Phys(nl, ucfOf([['clk', 'V10'], ...NEXYS3_SW.map((l, i) => [`d<${i}>`, l]), ...NEXYS3_LD.map((l, i) => [`y<${i}>`, l])])));
  assert.deepEqual(check.problems, []);
  // the carry between stages: a PIP from COUT to the CIN above (the same column)
  const carry = out.nets.filter(n => n.outpins[0]?.pin === 'COUT');
  assert.equal(carry.length, 6);
  for (const n of carry) assert.ok(n.pips.length === 1, `${n.name}: ${n.pips.map(p => `${p.from}->${p.to}`).join(' ')}`);
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
  const { out, device } = await routed(s6Phys(nl, ucfOf([['clk', 'V10'], ['a', 'T10'], ['b', 'T9'], ['y', 'U16']])));
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
