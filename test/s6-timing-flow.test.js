// The Spartan-6's static timing in the Silinx toolchain (#732): packages/silinx-fpga/src/fpga/s6/timing.js (the
// delays, analyzeTimingS6), timing-arcs.js (the arcs) and timing-model.js (S6_SPEED_3, fitted by
// packages/silinx-fpga/research/s6/fit-model6.mjs); fpga/timing.js's timing graph given a family's arcs, clock pins and the clocks' skew.
// A design synthesized, placed and routed by the open flow, timed: its clock's period and paths, its pads' paths.
import test from 'node:test';
import assert from 'node:assert/strict';
import { timingGraph } from '../packages/silinx-fpga/src/fpga/timing.js';
import { analyzeTimingS6, arcsS6, wireDelay, clockArrivalsS6, S6_CLOCK_PIN, CLASSES6, PIN_KINDS } from '../packages/silinx-fpga/src/fpga/s6/timing.js';
import { S6_SPEED_3 } from '../packages/silinx-fpga/src/fpga/s6/timing-model.js';
import { placeS6 } from '../packages/silinx-fpga/src/fpga/s6/place.js';
import { placedXdlS6 } from '../packages/silinx-fpga/src/fpga/s6/xdl.js';
import { routeS6, routedXdlS6 } from '../packages/silinx-fpga/src/fpga/s6/route.js';
import { parseXdl, writeXdl } from '../packages/silinx-fpga/src/xdl.js';
import { s6Device, s6Phys, s6Verilog } from './s6-lib.mjs';

const inst = (name, type, cfg = {}, site = 'SLICE_X2Y2') => ({ name, type, site, tile: 'CLEXL_X1Y2', placed: true, cfg: Object.entries(cfg).map(([attr, value]) => ({ attr, name: '', value })) });

test('timing.js: the timing graph on a family\'s arcs and clock pins, the clocks\' skew in the period', () => {
  // a -> b through one connection; b's clock 0.2 later than a's: the period 1 + 0.5 + 0.3 - 0.2
  const design = { insts: [inst('a', 'X'), inst('b', 'X')], nets: [
    { name: 'clk', outpins: [{ inst: 'g', pin: 'O' }], inpins: [{ inst: 'a', pin: 'CK' }, { inst: 'b', pin: 'CK' }] },
    { name: 'n', outpins: [{ inst: 'a', pin: 'Q' }], inpins: [{ inst: 'b', pin: 'D' }] }] };
  const arcs = i => ({ comb: [], setup: i.name === 'b' ? [['D', 0.3]] : [], clkToOut: i.name === 'a' ? [['Q', 1]] : [], input: [], output: [], clock: true });
  const tg = timingGraph(design, { clock: { minScale: 1, hold: 0 } }, { arcs, clockPin: /^CK$/ });
  assert.equal(tg.conns.length, 1);
  assert.equal(+tg.analyze([0.5]).period.toFixed(6), 1.8);
  const r = tg.analyze([0.5], new Map([['a', 0], ['b', 0.2]]));
  assert.equal(+r.period.toFixed(6), 1.6);
  assert.deepEqual(r.clocks[0].path.map(p => `${p.inst}.${p.pin} ${p.kind}`), ['a.Q clock-to-out', 'b.D net', 'b.D setup']);
  // the Spartan-3E's clock pins by default: CK not one, no clock, no period
  assert.equal(timingGraph(design, { clock: { minScale: 1, hold: 0 } }, { arcs }).analyze([0.5]).period, 0);
});

test('s6/timing: the wire model\'s delay, the arcs of an IOB and a slice by its site class, the model fitted', () => {
  const w = { base: 0.1, classes: { single: 0.2 }, fanout: 0.01, pins: { 1: 0.3 }, types: { 'EE#B#': 0.05 }, other: 0.02 };
  const counts = CLASSES6.map(c => (c === 'single' ? 2 : 0));
  // 0.1 + 2 × 0.01 + 0.3 + 2 × 0.2 + 0.05 + 0.02
  assert.equal(+wireDelay(w, { counts, fanout: 3, pin: 0, wires: ['EE#B#', 'XX#'] }).toFixed(6), 0.89);
  assert.equal(wireDelay({ ...w, base: -5 }, { counts, fanout: 1, pin: 5, wires: [] }), 0);
  const design = { insts: [inst('p', 'IOB', {}, 'B8'), inst('q', 'IOB', {}, 'N14'), inst('s', 'SLICEX', { A6LUT: '#LUT:O6=A1', AFF: '#FF', AFFMUX: 'O6' }, 'SLICE_X3Y2')],
    nets: [{ name: 'a', outpins: [{ inst: 'p', pin: 'I' }], inpins: [{ inst: 's', pin: 'A1' }] }, { name: 'b', outpins: [{ inst: 's', pin: 'AQ' }], inpins: [{ inst: 'q', pin: 'O' }] }] };
  const arcs = arcsS6(design);
  assert.deepEqual(arcs(design.insts[0]).input, [['I', S6_SPEED_3.pad.Tiopi]]);
  assert.deepEqual(arcs(design.insts[1]).output, [['O', S6_SPEED_3.pad.Tioop]]);
  const s = arcs(design.insts[2]), cls = S6_SPEED_3.arcs.classes['CLEXL x'];
  assert.ok(s.clock);
  assert.deepEqual(s.comb, [['A1', 'A', cls.Tilo]]);
  assert.deepEqual(s.clkToOut, [['AQ', cls.Tcko]]);
  // the model: an odd column's SLICEX slower through its LUT than an even column's slice
  assert.ok(S6_SPEED_3.arcs.classes['CLEXL x'].Tilo > S6_SPEED_3.arcs.classes['CLEXL lm'].Tilo);
  assert.ok(Object.keys(S6_SPEED_3.wires.types).length > 100);
  assert.deepEqual(Object.keys(S6_SPEED_3.wires.pins), PIN_KINDS);
  assert.ok(S6_SPEED_3.clock.late[0] > S6_SPEED_3.clock.early[0]);
  assert.ok(['CLK', 'CLKAWRCLK', 'CLKB'].every(p => S6_CLOCK_PIN.test(p)) && !S6_CLOCK_PIN.test('CE'));
});

test('s6/timing: a design routed by the open flow timed: its clock\'s period and critical path, its pads\' paths', async () => {
  const part = 'xc6slx16csg324-3', { device, sites } = s6Device(part);
  const d = s6Phys(await s6Verilog('module m(input clk, input [7:0] a, output reg [7:0] q); reg [7:0] r; always @(posedge clk) begin r <= a; q <= q + r; end endmodule'));
  const x = placedXdlS6(d.nl, d.packed, d.phys, placeS6(d.phys, sites, { nl: d.nl, seed: 1 }), { part, device });
  const design = parseXdl(writeXdl(routedXdlS6(x, device, routeS6(x, device))));
  const r = analyzeTimingS6(design, device);
  // one clock: a period of a few ns (an 8-bit adder), its path from a clock-to-out through nets and logic to a setup
  assert.equal(r.clocks.length, 1);
  const c = r.clocks[0];
  assert.ok(c.period > 1 && c.period < 10, String(c.period));
  assert.equal(c.path[0].kind, 'clock-to-out');
  assert.equal(c.path.at(-1).kind, 'setup');
  assert.ok(c.path.some(p => p.kind === 'net') && c.path.some(p => p.kind === 'logic'));
  // every connection's delay from its routed path, none below 0; the clock's arrivals at each flip-flop
  assert.ok(r.conns.length > 10 && r.conns.every(k => Number.isFinite(k.delay) && k.delay >= 0));
  const clk = clockArrivalsS6(design, device);
  assert.ok(clk.net.size >= 2 && [...clk.net.values()].every(v => v > 0));
  assert.ok([...clk.late].every(([i, v]) => v > clk.late.early.get(i)));
  // the pads: a to the registers (OFFSET IN), q's out (OFFSET OUT), both on the clock
  assert.ok(r.pads.inputs.length >= 8 && r.pads.inputs.every(p => p.clock === c.clock && Number.isFinite(p.setup)));
  assert.ok(r.pads.outputs.length >= 8 && r.pads.outputs.every(p => p.delay > S6_SPEED_3.pad.Tioop));
});
