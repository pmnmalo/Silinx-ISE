// research/s6 stage S6-G (#731), without ISE: a trce report's paths read (twr6.mjs), the Spartan-6's wire classes and
// a connection's features (timing-fit6.mjs), the non-negative least squares the fit uses (research/s3e-route), the arcs'
// table and a path re-evaluated by the model (timing6.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTwr } from '../research/s6/twr6.mjs';
import { wireClass6, CLASSES6, nodeWire, features } from '../research/s6/timing-fit6.mjs';
import { nnls } from '../research/s3e-route/timing-fit.mjs';
import { arcKey, arcTable, modelPath } from '../research/s6/timing6.mjs';
import { s6Device } from './s6-lib.mjs';

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

test('twr6: a report\'s paths, their slack and figures and their elements in order (no hold path)', () => {
  const ps = parseTwr(TWR);
  assert.equal(ps.length, 1);
  const p = ps[0];
  assert.deepEqual({ ...p, elements: undefined }, { constraint: 'TS_clk = PERIOD TIMEGRP "clk" 10 ns HIGH 50%;', slack: 6.5, source: 'a', dest: 'b', requirement: 10, dataPath: 3.4, skew: -0.02, uncertainty: 0.035, elements: undefined });
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
  assert.deepEqual(features({ counts: [0, 1, 2, 0, 1, 1, 0, 0, 0], fanout: 3 }), [1, 0, 1, 2, 0, 1, 1, 0, 0, 0, 2]);
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
  assert.equal(modelPath(paths[0], xdl, null, table, []), 0.65);
  assert.equal(modelPath({ elements: [paths[0].elements[0], { loc: 'SLICE_X3Y3.A1', type: 'net', fanout: 1, delay: 1, name: 'n' }] }, xdl, null, table, []), null);
});
