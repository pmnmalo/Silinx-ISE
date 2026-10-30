// packages/silinx-fpga/research/s6 stage S6-G (#731), without ISE: a trce report's paths read (twr6.mjs), the Spartan-6's wire classes and
// a connection's features and load pin (timing-fit6.mjs), every connection of reportgen's report on a routed design
// (dlySamples), the non-negative least squares the fit uses (packages/silinx-fpga/research/s3e-route), the arcs' table and a path
// re-evaluated by the model (timing6.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTwr } from '../packages/silinx-fpga/research/s6/twr6.mjs';
import { wireClass6, CLASSES6, nodeWire, features, pinKind, PIN_KINDS, dlySamples } from '../packages/silinx-fpga/research/s6/timing-fit6.mjs';
import { nnls } from '../packages/silinx-fpga/research/s3e-route/timing-fit.mjs';
import { arcKey, arcTable, modelPath } from '../packages/silinx-fpga/research/s6/timing6.mjs';
import { placeS6 } from '../packages/silinx-fpga/src/fpga/s6/place.js';
import { placedXdlS6 } from '../packages/silinx-fpga/src/fpga/s6/xdl.js';
import { routeS6, routedXdlS6 } from '../packages/silinx-fpga/src/fpga/s6/route.js';
import { parseXdl, writeXdl } from '../packages/silinx-fpga/src/xdl.js';
import { s6Device, s6Phys, s6Verilog } from './s6-lib.mjs';

// a report in trce's layout, its numbers made up
const TWR = `Timing constraint: TS_clk = PERIOD TIMEGRP "clk" 10 ns HIGH 50%;
 12 paths analyzed, 4 endpoints analyzed, 0 failing endpoints
--------------------------------------------------------------------------------
Slack:                  6.500ns (requirement - (data path - clock path skew + uncertainty))
  Source:               a (FF)
  Destination:          b (FF)
  Requirement:          10.000ns
  Data Path Delay:      3.400ns (Levels of Logic = 1)
  Clock Path Skew:      -0.020ns (0.200 - 0.220)
  Source Clock:         clk_BUFGP rising at 0.000ns
  Destination Clock:    clk_BUFGP rising at 10.000ns
  Clock Uncertainty:    0.035ns

  Clock Uncertainty:          0.035ns  ((TSJ^2 + TIJ^2)^1/2 + DJ) / 2 + PE
    Total System Jitter (TSJ):  0.070ns
    Total Input Jitter (TIJ):   0.000ns

  Maximum Data Path at Slow Process Corner: a to b
    Location             Delay type         Delay(ns)  Physical Resource
                                                       Logical Resource(s)
    -------------------------------------------------  -------------------
    SLICE_X1Y1.AQ        Tcko                  0.400   a
                                                       a
    SLICE_X2Y2.B3        net (fanout=2)        1.100   a
    SLICE_X2Y2.B         Tilo                  0.200   n
                                                       n_lut
    SLICE_X3Y3.CX        net (fanout=1)        1.500   n
    SLICE_X3Y3.CLK       Tdick                 0.200   b
                                                       b
    -------------------------------------------------  ---------------------------
    Total                                      3.400ns (0.800ns logic, 2.600ns route)

--------------------------------------------------------------------------------
Hold Paths: TS_clk = PERIOD TIMEGRP "clk" 10 ns HIGH 50%;
--------------------------------------------------------------------------------
Slack (hold path):      0.400ns (requirement - (clock path skew + uncertainty - data path))
`;

test('twr6: a report\'s paths, their slack, figures and clocks and their elements in order (no hold path)', () => {
  const ps = parseTwr(TWR);
  assert.equal(ps.length, 1);
  const p = ps[0];
  assert.deepEqual({ ...p, elements: undefined }, { constraint: 'TS_clk = PERIOD TIMEGRP "clk" 10 ns HIGH 50%;', slack: 6.5, source: 'a', dest: 'b', requirement: 10, dataPath: 3.4, skew: -0.02, uncertainty: 0.035, srcClock: 'clk_BUFGP', destClock: 'clk_BUFGP', elements: undefined });
  assert.deepEqual(p.elements, [
    { loc: 'SLICE_X1Y1.AQ', type: 'Tcko', delay: 0.4, name: 'a' },
    { loc: 'SLICE_X2Y2.B3', type: 'net', fanout: 2, delay: 1.1, name: 'a' },
    { loc: 'SLICE_X2Y2.B', type: 'Tilo', delay: 0.2, name: 'n' },
    { loc: 'SLICE_X3Y3.CX', type: 'net', fanout: 1, delay: 1.5, name: 'n' },
    { loc: 'SLICE_X3Y3.CLK', type: 'Tdick', delay: 0.2, name: 'b' },
  ]);
  // the elements add up to the data path, as trce's Total
  assert.equal(+p.elements.reduce((a, e) => a + e.delay, 0).toFixed(3), p.dataPath);
});

test('timing-fit6: the wire classes, a node\'s first wire, a connection\'s features; nnls', () => {
  const c = n => CLASSES6[wireClass6(n)];
  assert.deepEqual(['LOGICOUT13', 'INT_INTERFACE_LOGICOUT_3', 'WL1E0', 'SR1B2', 'SW2B2', 'NN2E1', 'SS4B2', 'EE4M3', 'LOGICIN_B29', 'GFAN1', 'M_AMUX', 'BYP_B3', 'B11_DSP48A1_SITE', 'GCLK7', 'XYZ'].map(c),
    ['logicout', 'logicout', 'single', 'single', 'double', 'double', 'quad', 'quad', 'logicin', 'fan', 'site', 'site', 'site', 'clock', 'other']);
  const { device } = s6Device('xc6slx16csg324-3'), n = device.sitePinNode('SLICE_X2Y2', 'A1');
  assert.ok(n >= 0);
  const [tile, wire] = nodeWire(device, n);
  assert.match(tile, /^(CLEX[LM]|INT)_X\d+Y\d+$/);
  assert.match(wire, /A1|LOGICIN/);
  // the counts, the fanout beyond one, the load pin's kind one-hot
  assert.deepEqual(features({ counts: [0, 1, 2, 0, 1, 1, 0, 0, 0], fanout: 3, pin: 0 }), [1, 0, 1, 2, 0, 1, 1, 0, 0, 0, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(features({ counts: new Array(9).fill(0), fanout: 1, pin: 11 }).at(-1), 1);
  assert.deepEqual(['M_A1', 'L_B6', 'XX_C3', 'X_D4', 'M_AX', 'XX_DX', 'L_CE', 'M_SR', 'M_CIN', 'BIOB_O0_PINW', 'D1_OLOGIC_SITE', 'RAMB8BWER_1_DIA3'].map(n => PIN_KINDS[pinKind(n)]),
    ['1', '6', '3', '4', 'X', 'X', 'CE', 'SR', 'CIN', 'IO', 'IO', 'other']);
  // y = 0.1 + 0.2 a + 0.5 b, found back
  const X = [[1, 1, 0], [1, 0, 1], [1, 2, 1], [1, 3, 2]], y = X.map(([, a, b]) => 0.1 + 0.2 * a + 0.5 * b), w = nnls(X, y);
  assert.deepEqual(w.map(v => +v.toFixed(6)), [0.1, 0.2, 0.5]);
});

test('timing6: an arc\'s key (a setup through its LUT by the flip-flop\'s input mux), the arcs\' table, a path re-evaluated', () => {
  const inst = (tile, cfg) => ({ tile, cfg: Object.entries(cfg).map(([attr, value]) => ({ attr, name: '', value })) });
  assert.equal(arcKey({ type: 'Tilo', loc: 'SLICE_X2Y2.B' }, inst('CLEXL_X1Y2', {})), 'Tilo CLEXL');
  assert.equal(arcKey({ type: 'Tas', loc: 'SLICE_X2Y2.CLK' }, inst('CLEXM_X1Y2', { AFFMUX: 'O6', CFFMUX: '#OFF' })), 'Tas CLEXM LUT');
  assert.equal(arcKey({ type: 'Tas', loc: 'SLICE_X2Y2.CLK' }, inst('CLEXM_X1Y2', { DFFMUX: 'XOR' })), 'Tas CLEXM XOR');
  assert.equal(arcKey({ type: 'Tcko', loc: 'SLICE_X9Y9.AQ' }, undefined), 'Tcko SLICE');
  const xdl = { insts: [{ site: 'SLICE_X1Y1', tile: 'CLEXL_X1Y1', cfg: [] }, { site: 'SLICE_X3Y3', tile: 'CLEXM_X3Y3', cfg: [] }], nets: [] };
  const paths = [{ elements: [{ loc: 'SLICE_X1Y1.AQ', type: 'Tcko', delay: 0.4 }, { loc: 'SLICE_X3Y3.CLK', type: 'Tdick', delay: 0.1 }] },
    { elements: [{ loc: 'SLICE_X1Y1.AQ', type: 'Tcko', delay: 0.5 }, { loc: 'SLICE_X3Y3.CLK', type: 'Tdick', delay: 0.2 }] },
    { elements: [{ loc: 'SLICE_X1Y1.AQ', type: 'Tcko', delay: 0.45 }] }];
  const table = arcTable([{ xdl, paths }]);
  assert.deepEqual(table.arcs, { 'Tcko CLEXL': 0.45, 'Tdick CLEXM': 0.2 });
  assert.deepEqual(table.types, { Tcko: 0.45, Tdick: 0.2 });
  // a path of arcs only: the table's; a net not in the XDL: null
  assert.equal(modelPath(paths[0], xdl, null, table, () => 0), 0.65);
  assert.equal(modelPath({ elements: [paths[0].elements[0], { loc: 'SLICE_X3Y3.A1', type: 'net', fanout: 1, delay: 1, name: 'n' }] }, xdl, null, table, () => 0), null);
});

test('timing-fit6: every connection of reportgen\'s report on a routed design, the clock left out', async () => {
  const part = 'xc6slx16csg324-3', { device, sites } = s6Device(part);
  const d = s6Phys(await s6Verilog('module m(input clk, input a, input b, output reg y); always @(posedge clk) y <= a ^ b; endmodule'));
  const x = placedXdlS6(d.nl, d.packed, d.phys, placeS6(d.phys, sites, { nl: d.nl, seed: 1 }), { part, device });
  const xdl = parseXdl(writeXdl(routedXdlS6(x, device, routeS6(x, device))));
  // reportgen's layout: the net, its driver, each load's delay and name; a clock net and an unknown load too
  const nets = xdl.nets.filter(n => n.outpins.length && n.inpins.length && n.pips?.length);
  const data = nets.find(n => !n.inpins.some(p => /CLK/.test(p.pin))), clock = nets.find(n => n.inpins.some(p => /CLK/.test(p.pin)) && n !== data);
  const block = (n, v) => `${n.name}\n   ${n.outpins[0].inst}.${n.outpins[0].pin}\n${n.inpins.map(p => `         ${v}  ${p.inst}.${p.pin}`).join('\n')}\n         9.999  nowhere.A1\n`;
  const dly = `File: top.dly\n\n-------\n                               Net Delays\n-------\n\n${block(data, '0.777')}\n${clock ? block(clock, '0.500') : ''}`;
  const s = dlySamples(xdl, dly, device);
  assert.equal(s.length, data.inpins.length);
  for (const c of s) {
    assert.equal(c.net, data.name);
    assert.equal(c.delay, 0.777);
    assert.equal(c.fanout, data.inpins.length);
    assert.equal(c.counts.reduce((a, v) => a + v, 0), c.nodes.length - 1);
    assert.ok(c.pin >= 0 && c.pin < PIN_KINDS.length);
  }
  assert.deepEqual(dlySamples(xdl, 'Net Delays\n', device), []);
});
