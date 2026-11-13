// The Spartan-6's JTAG user access (#3766, the logic analyzer's link), in Silinx's Map: a BSCAN_SPARTAN6 synthesized with
// no global buffer on DRCK (synth-brams-s6.js S6_CLOCK_DRIVERS: no switch from the fabric into a BUFGMUX is known), packed
// onto a site of its own (pack.js, phys.js: kind bscan, its pins the primitive's, its chain), placed by Silinx's placer on
// its JTAG chain's site, BSCAN_X0Y<chain - 1> (sites.js, place.js: the site decides the chain, as ISE's bitgen shows) and
// written as ISE's XDL writes it (xdl.js: BSCAN, JTAG_CHAIN, JTAG_TEST), on both parts; two on one chain refused; the BEL
// handed to nextpnr's packer (nextpnr-pack.js packInput).
import test from 'node:test';
import assert from 'node:assert/strict';
import { placeS6 } from '../packages/silinx-fpga/src/fpga/s6/place.js';
import { placedXdlS6 } from '../packages/silinx-fpga/src/fpga/s6/xdl.js';
import { S6_CLOCK_DRIVERS } from '../packages/silinx-fpga/src/synth-brams-s6.js';
import { packInput } from '../packages/silinx-fpga/src/fpga/s6/nextpnr-pack.js';
import { s6Device, s6Verilog, s6Phys, S6_BOARDS, NEXYS3_LD } from './s6-lib.mjs';

// BSCANs on the chains given (1 … n by default), each one's DRCK clocking a counter that SHIFT enables, TDO its top bit;
// the LEDs the first's
const design = (n = 1, chains = Array.from({ length: n }, (_, k) => k + 1)) => `module m (output [7:0] led);
${chains.map((chain, k) => `  wire drck${k}, shift${k}; reg [7:0] c${k} = 0;
  BSCAN_SPARTAN6 #(.JTAG_CHAIN(${chain})) u${k} (.DRCK(drck${k}), .SHIFT(shift${k}), .TDO(c${k}[7]));
  always @(posedge drck${k}) if (shift${k}) c${k} <= c${k} + 1;`).join('\n')}
  assign led = c0;
endmodule
`;
const UCF = NEXYS3_LD.map((p, i) => `NET "led<${i}>" LOC = "${p}" ;`).join('\n');

test('#3766 a BSCAN_SPARTAN6 synthesized for the Spartan-6: its DRCK a clock driver of its own (no BUFG), the counter clocked by it directly', async () => {
  assert.equal(S6_CLOCK_DRIVERS, 'setattr -set clkbuf_driver 1 =BSCAN_SPARTAN6/w:DRCK');
  const nl = await s6Verilog(design());
  const types = nl.cells.map(c => c.type);
  assert.equal(types.filter(t => t === 'BSCAN_SPARTAN6').length, 1);
  assert.equal(types.filter(t => /^BUFG/.test(t)).length, 0, types.join(' '));
});

test('#3766 the BSCAN packed onto a site of its own (its pins the primitive\'s), placed on BSCAN_X0Y0, written as ISE\'s XDL (JTAG_CHAIN, JTAG_TEST), on both parts', async () => {
  const nl = await s6Verilog(design());
  for (const { part } of S6_BOARDS) {
    const { sites } = s6Device(part);
    assert.deepEqual(sites.bscans.map(b => [b.name, b.tile.replace(/_X\d+Y\d+$/, '')]), [['BSCAN_X0Y0', 'UR_UPPER'], ['BSCAN_X0Y1', 'UR_UPPER'], ['BSCAN_X0Y2', 'UR_LOWER'], ['BSCAN_X0Y3', 'UR_LOWER']], part);
    const { packed, phys } = s6Phys(nl, part === 'xc6slx16csg324-3' ? UCF : null);
    const b = phys.insts.findIndex(i => i.kind === 'bscan');
    assert.deepEqual([phys.insts[b].type, phys.insts.filter(i => i.kind === 'bscan').length], ['BSCAN', 1], part);
    // (its pins as the site's: DRCK and SHIFT out, TDO in)
    const pins = phys.nets.flatMap(n => [...(n.driver?.inst === b ? [`${n.driver.pin}>`] : []), ...n.loads.filter(l => l.inst === b).map(l => `>${l.pin}`)]).sort();
    assert.deepEqual(pins, ['>TDO', 'DRCK>', 'SHIFT>'], part);
    const placement = placeS6(phys, sites, { seed: 1 });
    assert.deepEqual([placement.site[b], placement.tile[b].replace(/_X\d+Y\d+$/, '')], ['BSCAN_X0Y0', 'UR_UPPER'], part);
    const xdl = placedXdlS6(nl, packed, phys, placement, { part, name: 'm' });
    const inst = xdl.insts.find(i => i.type === 'BSCAN');
    assert.deepEqual([inst.site, inst.cfg.map(c => `${c.attr}:${c.name}:${c.value}`)], ['BSCAN_X0Y0', ['BSCAN:u0:', 'JTAG_CHAIN::1', 'JTAG_TEST::0']], part);
  }
});

test('#3766 each BSCAN on its JTAG chain\'s site (chains 4 and 2: BSCAN_X0Y3, X0Y1); two on one chain, or a chain past 4, refused', async () => {
  const { device, sites } = s6Device('xc6slx16csg324-3');
  const nl = await s6Verilog(design(2, [4, 2]));
  const { packed, phys } = s6Phys(nl);
  assert.deepEqual(phys.insts.filter(i => i.kind === 'bscan').map(i => i.chain).sort(), [2, 4]);
  const placement = placeS6(phys, sites, { seed: 1 });
  const xdl = placedXdlS6(nl, packed, phys, placement, { part: 'xc6slx16csg324-3', name: 'm' });
  assert.deepEqual(xdl.insts.filter(i => i.type === 'BSCAN').map(i => [i.site, i.cfg.find(c => c.attr === 'JTAG_CHAIN').value]).sort(), [['BSCAN_X0Y1', '2'], ['BSCAN_X0Y3', '4']]);
  // (nextpnr's packer: each BSCAN_SPARTAN6 with the BEL of its chain's site, nextpnr-spartan6 0.5.1)
  const text = JSON.stringify({ modules: { m: { attributes: { top: '1' }, cells: Object.fromEntries(nl.cells.map(c => [c.name, { type: c.type, attributes: {}, parameters: {}, connections: {} }])) } } });
  const cells = Object.values(packInput(text, phys, device).modules.m.cells).filter(c => c.type === 'BSCAN_SPARTAN6');
  assert.deepEqual(cells.map(c => c.attributes.BEL).sort(), ['X58Y2/S1_BSCAN', 'X58Y3/S1_BSCAN']);
  const same = s6Phys(await s6Verilog(design(2, [3, 3])));
  assert.throws(() => placeS6(same.phys, sites, { seed: 1 }), /place: two BSCANs on the JTAG chain 3 \(u\d, u\d\)/);
  const far = s6Phys(await s6Verilog(design(1, [5])));
  assert.throws(() => placeS6(far.phys, sites, { seed: 1 }), /place: u0: its JTAG_CHAIN 5 is not one of the xc6slx16csg324-3's 1 to 4/);
});
