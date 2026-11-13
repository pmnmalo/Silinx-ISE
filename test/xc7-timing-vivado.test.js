// The 7-series' timing against Vivado's (#3516, scripts/xc7-timing-vivado.mjs, xc7-timing-parse.mjs, xc7-timing-fit.mjs):
// the parsing of what Vivado writes (hand-written snippets in its format, 2025.2's: an SDF, report_timing's paths, the
// routes measure.tcl lists; not Vivado's files), the cells' and routes' numbers made of them, the fit of the wire classes
// (on delays made from known ones), the table for the fork's chip database, the Tcl and the shell script run on the host.
// No Vivado: the measurement itself runs on the ISE runner's machine.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sexpr, timescalePs, parseSdf, parseTimingPaths, parseRoutes, connections, wireClass, lutBelPin, nextpnrPathSplit } from '../scripts/xc7-timing-parse.mjs';
import { cellSamples, cellStats, wireSamples, groupWires, mergeCellStats, mergeGroups, nnls, fitWires, chipdbTable, compareFmax, fitMeasurement, CLASSES } from '../scripts/xc7-timing-fit.mjs';
import { edifScript, measureTcl, runSh, selectDesigns, nameFilter, designNumbers, mergeMeasurement, keepsRun, jobContainers, BOARDS, OUTPUTS } from '../scripts/xc7-timing-vivado.mjs';
import { parseTimingSummary } from '../server/vivado-reports.js';

const SDF = `(DELAYFILE
  (SDFVERSION "3.0")
  (DESIGN "top")
  (DATE "Thu Nov 12 20:00:00 2026")
  (VENDOR "Xilinx")
  (PROGRAM "Vivado")
  (VERSION "2025.2")
  (DIVIDER /)
  (TIMESCALE 1 ps)
  (CELL
    (CELLTYPE "top")
    (INSTANCE )
    (DELAY
      (ABSOLUTE
        (INTERCONNECT cnt_reg\\[0\\]/Q cnt\\[0\\]_i_2/I0 (452.0:513.0:513.0) (452.0:520.0:520.0))
        (INTERCONNECT cnt\\[0\\]_i_2/O cnt_reg\\[0\\]_i_1/S\\[0\\] (0.0:0.0:0.0) (0.0:0.0:0.0))
        (INTERCONNECT cnt_reg\\[0\\]_i_1/O\\[0\\] cnt_reg\\[0\\]/D (300.0:390.0:390.0) (300.0:390.0:390.0))
      )
    )
  )
  (CELL
    (CELLTYPE "LUT2")
    (INSTANCE cnt\\[0\\]_i_2)
    (DELAY
      (ABSOLUTE
        (IOPATH I0 O (100.0:124.0:124.0) (100.0:124.0:124.0))
        (IOPATH I1 O (90.0:105.0:105.0) (90.0:110.0:110.0))
      )
    )
  )
  (CELL
    (CELLTYPE "CARRY4")
    (INSTANCE cnt_reg\\[0\\]_i_1)
    (DELAY
      (ABSOLUTE
        (IOPATH S\\[0\\] O\\[0\\] (300.0:398.0:398.0) (300.0:424.0:424.0))
        (IOPATH CI CO\\[3\\] (100.0:114.0:114.0) (100.0:114.0:114.0))
      )
    )
  )
  (CELL
    (CELLTYPE "FDRE")
    (INSTANCE cnt_reg\\[0\\])
    (DELAY
      (ABSOLUTE
        (IOPATH (posedge C) Q (400.0:456.0:456.0) (400.0:456.0:456.0))
      )
    )
    (TIMINGCHECK
      (SETUPHOLD (posedge D) (posedge C) (50.0:62.0:62.0) (-10.0:20.0:20.0))
      (SETUPHOLD (negedge D) (posedge C) (40.0:47.0:47.0) (-10.0:30.0:30.0))
      (SETUPHOLD (posedge CE) (posedge C) (150.0:205.0:205.0) (0.0:10.0:10.0))
      (SETUPHOLD (posedge R) (posedge C) (400.0:524.0:524.0) (0.0:5.0:5.0))
      (WIDTH (posedge C) (500.0:500.0:500.0))
    )
  )
)
`;

test('#3516 an SDF: its cells, delays (each the worst of rise and fall, its maximum) and checks, in ps; escapes and edges read', () => {
  const sdf = parseSdf(SDF);
  assert.equal(sdf.timescalePs, 1);
  assert.deepEqual(sdf.cells.map((c) => [c.type, c.instance]), [['top', ''], ['LUT2', 'cnt[0]_i_2'], ['CARRY4', 'cnt_reg[0]_i_1'], ['FDRE', 'cnt_reg[0]']]);
  assert.deepEqual(sdf.cells[0].interconnects, [
    { from: 'cnt_reg[0]/Q', to: 'cnt[0]_i_2/I0', ps: 520 }, { from: 'cnt[0]_i_2/O', to: 'cnt_reg[0]_i_1/S[0]', ps: 0 },
    { from: 'cnt_reg[0]_i_1/O[0]', to: 'cnt_reg[0]/D', ps: 390 }]);
  assert.deepEqual(sdf.cells[1].iopaths, [{ from: 'I0', to: 'O', ps: 124 }, { from: 'I1', to: 'O', ps: 110 }]);
  assert.deepEqual(sdf.cells[2].iopaths, [{ from: 'S[0]', to: 'O[0]', ps: 424 }, { from: 'CI', to: 'CO[3]', ps: 114 }]);
  assert.deepEqual(sdf.cells[3].iopaths, [{ from: 'C', to: 'Q', ps: 456 }]);
  assert.deepEqual(sdf.cells[3].checks.filter((k) => k.kind === 'setup').map((k) => [k.pin, k.clock, k.ps]), [['D', 'C', 62], ['D', 'C', 47], ['CE', 'C', 205], ['R', 'C', 524]]);
  assert.deepEqual(sdf.cells[3].checks.filter((k) => k.kind === 'hold').map((k) => k.ps), [20, 30, 10, 5]);
  // the timescale: ns (and the standard's default), a single value, an empty one, a conditional path
  const ns = parseSdf('(DELAYFILE (TIMESCALE 1ns) (CELL (CELLTYPE "LUT1") (INSTANCE a) (DELAY (ABSOLUTE (IOPATH I0 O (0.124) ()) (COND I0 (IOPATH I0 O (0.2::0.25) (0.1:0.1:0.1)))))))');
  assert.deepEqual(ns.cells[0].iopaths, [{ from: 'I0', to: 'O', ps: 124 }, { from: 'I0', to: 'O', ps: 250 }]);
  assert.equal(timescalePs(['TIMESCALE', '100', 'ps']), 100);
  assert.equal(timescalePs(['TIMESCALE']), 1000);
  assert.deepEqual(sexpr('(A "b c" d\\[1\\] (e))'), [['A', 'b c', 'd[1]', ['e']]]);
  assert.throws(() => parseSdf('(NOTSDF)'), /not an SDF/);
});

const PATHS = `Timing Report

Slack (MET) :             5.712ns  (required time - arrival time)
  Source:                 cnt_reg[0]/C
                            (rising edge-triggered cell FDRE clocked by clk  {rise@0.000ns fall@5.000ns period=10.000ns})
  Destination:            cnt_reg[7]/D
                            (rising edge-triggered cell FDRE clocked by clk  {rise@0.000ns fall@5.000ns period=10.000ns})
  Path Group:             clk
  Path Type:              Setup (Max at Slow Process Corner)
  Requirement:            10.000ns  (clk rise@10.000ns - clk rise@0.000ns)
  Data Path Delay:        4.250ns  (logic 1.716ns (40.376%)  route 2.534ns (59.624%))
  Logic Levels:           2  (CARRY4=1 LUT2=1)
  Clock Path Skew:        -0.025ns (DCD - SCD + CPR)

    Location             Delay type                Incr(ns)  Path(ns)    Netlist Resource(s)
  -------------------------------------------------------------------    -------------------
                         (clock clk rise edge)        0.000     0.000 r
    W5                                                0.000     0.000 r  clk (IN)
                         net (fo=0)                   0.000     0.000    clk
    W5                   IBUF (Prop_ibuf_I_O)         1.458     1.458 r  clk_IBUF_inst/O
                         net (fo=1, routed)           1.967     3.425    clk_IBUF
    BUFGCTRL_X0Y0        BUFG (Prop_bufg_I_O)         0.096     3.521 r  clk_IBUF_BUFG_inst/O
                         net (fo=33, routed)          1.568     5.089    clk_IBUF_BUFG
    SLICE_X0Y10          FDRE                                         r  cnt_reg[0]/C
  -------------------------------------------------------------------    -------------------
    SLICE_X0Y10          FDRE (Prop_fdre_C_Q)         0.456     5.545 r  cnt_reg[0]/Q
                         net (fo=2, routed)           0.763     6.308    cnt_reg[0]
    SLICE_X1Y10                                                       r  cnt[0]_i_2/I0
    SLICE_X1Y10          LUT2 (Prop_lut2_I0_O)        0.124     6.432 r  cnt[0]_i_2/O
                         net (fo=1, routed)           0.000     6.432    cnt[0]_i_2_n_0
    SLICE_X1Y10                                                       r  cnt_reg[0]_i_1/S[0]
    SLICE_X1Y10          CARRY4 (Prop_carry4_S[0]_CO[3])
                                                      0.532     6.964 r  cnt_reg[0]_i_1/CO[3]
                         net (fo=1, routed)           1.771     8.735    cnt_reg[0]_i_1_n_0
    SLICE_X1Y11          FDRE                                         r  cnt_reg[7]/D
  -------------------------------------------------------------------    -------------------

                         (clock clk rise edge)       10.000    10.000 r
    W5                                                0.000    10.000 r  clk (IN)
                         net (fo=0)                   0.000    10.000    clk
    W5                   IBUF (Prop_ibuf_I_O)         1.388    11.388 r  clk_IBUF_inst/O
                         net (fo=1, routed)           1.862    13.250    clk_IBUF
    BUFGCTRL_X0Y0        BUFG (Prop_bufg_I_O)         0.091    13.341 r  clk_IBUF_BUFG_inst/O
                         net (fo=33, routed)          1.443    14.784    clk_IBUF_BUFG
    SLICE_X1Y11          FDRE                                         r  cnt_reg[7]/C
                         clock pessimism              0.280    15.064
                         clock uncertainty           -0.035    15.029
    SLICE_X1Y11          FDRE (Setup_fdre_C_D)       -0.047    14.982    cnt_reg[7]
  -------------------------------------------------------------------
                         required time                         14.982
                         arrival time                          -8.735
  -------------------------------------------------------------------
                         slack                                  6.247

Slack (VIOLATED) :        -0.150ns  (required time - arrival time)
  Source:                 a_reg/C
  Destination:            b_reg/D
  Path Group:             clk
  Requirement:            10.000ns  (clk rise@10.000ns - clk rise@0.000ns)
  Data Path Delay:        10.100ns  (logic 2.000ns (19.802%)  route 8.100ns (80.198%))
  Logic Levels:           0
`;

test('#3516 report_timing\'s paths: the header\'s numbers, the data path\'s elements (a wrapped delay type, the input pins), the setup', () => {
  const [p, q] = parseTimingPaths(PATHS);
  assert.deepEqual([p.slackNs, p.met, p.source, p.destination, p.group, p.requirementNs, p.dataPathNs, p.logicNs, p.routeNs, p.levels],
    [5.712, true, 'cnt_reg[0]/C', 'cnt_reg[7]/D', 'clk', 10, 4.25, 1.716, 2.534, 2]);
  assert.deepEqual(p.elements, [
    { kind: 'cell', site: 'SLICE_X0Y10', type: 'FDRE', arc: { kind: 'Prop', lib: 'fdre', from: 'C', to: 'Q' }, ns: 0.456, pin: 'cnt_reg[0]/Q' },
    { kind: 'net', fanout: 2, routed: true, ns: 0.763, net: 'cnt_reg[0]', to: 'cnt[0]_i_2/I0' },
    { kind: 'cell', site: 'SLICE_X1Y10', type: 'LUT2', arc: { kind: 'Prop', lib: 'lut2', from: 'I0', to: 'O' }, ns: 0.124, pin: 'cnt[0]_i_2/O' },
    { kind: 'net', fanout: 1, routed: true, ns: 0, net: 'cnt[0]_i_2_n_0', to: 'cnt_reg[0]_i_1/S[0]' },
    { kind: 'cell', site: 'SLICE_X1Y10', type: 'CARRY4', arc: { kind: 'Prop', lib: 'carry4', from: 'S[0]', to: 'CO[3]' }, ns: 0.532, pin: 'cnt_reg[0]_i_1/CO[3]' },
    { kind: 'net', fanout: 1, routed: true, ns: 1.771, net: 'cnt_reg[0]_i_1_n_0', to: 'cnt_reg[7]/D' }]);
  assert.deepEqual(p.check, { type: 'FDRE', arc: { kind: 'Setup', lib: 'fdre', from: 'C', to: 'D' }, ns: 0.047 });
  // (the clock paths' cells not among the data path's)
  assert.ok(!p.elements.some((e) => e.type === 'IBUF' || e.type === 'BUFG'));
  // a path with no table: its header's numbers
  assert.deepEqual([q.slackNs, q.met, q.logicNs, q.routeNs, q.levels, q.elements, q.check], [-0.15, false, 2, 8.1, 0, [], null]);
  assert.deepEqual(parseTimingPaths('No timing paths found.'), []);
});

const ROUTES = [
  'NET\tcnt_reg[0]',
  'DRV\tcnt_reg[0]/Q\tCLBLM_R_X3Y10/CLBLM_M_AQ',
  'SNK\tcnt[0]_i_2/I0\tCLBLM_R_X3Y10/CLBLM_M_B3',
  'SNK\tcnt_reg[0]_i_1/DI[0]\t',
  'PIP\tCLBLM_R_X3Y10/CLBLM_M_AQ\tINT_R_X3Y10/LOGIC_OUTS4',
  'PIP\tINT_R_X3Y10/LOGIC_OUTS4\tINT_R_X3Y10/NN2BEG0',
  'PIP\tINT_R_X3Y12/NN2END0\tINT_R_X3Y12/SS2BEG0',
  'PIP\tINT_R_X3Y10/NN2BEG0\tINT_R_X3Y12/NN2END0',
  'PIP\tINT_R_X3Y12/SS2BEG0\tINT_R_X3Y10/IMUX_L13',
  'PIP\tINT_R_X3Y10/IMUX_L13\tCLBLM_R_X3Y10/CLBLM_M_B3',
  'NET\tq_OBUF',
  'DRV\tq_reg/Q\tCLBLL_L_X2Y3/CLBLL_L_AQ',
  'SNK\tq_OBUF_inst/I\tLIOI3_X0Y3/LIOI_OLOGIC0_D1',
  'LUTPIN\tcnt[0]_i_2/I0\tSLICE_X1Y10/B6LUT/A3',
  'LUTPIN\tcnt[0]_i_2/I1\tSLICE_X1Y10/B5LUT/A1',
  'garbage line',
].join('\n');

test('#3516 the routes measure.tcl lists: each sink\'s nodes from its driver\'s; inside a site, or not reached by the PIPs: none', () => {
  const r = parseRoutes(ROUTES);
  assert.deepEqual(r.nets.map((n) => [n.name, n.drivers.length, n.sinks.length, n.pips.length]), [['cnt_reg[0]', 1, 2, 6], ['q_OBUF', 1, 1, 0]]);
  assert.equal(r.lutPins.get('cnt[0]_i_2/I0'), 'SLICE_X1Y10/B6LUT/A3');
  assert.deepEqual(connections(r.nets[0]), [
    { from: 'cnt_reg[0]/Q', to: 'cnt[0]_i_2/I0', nodes: ['CLBLM_R_X3Y10/CLBLM_M_AQ', 'INT_R_X3Y10/LOGIC_OUTS4', 'INT_R_X3Y10/NN2BEG0', 'INT_R_X3Y12/NN2END0', 'INT_R_X3Y12/SS2BEG0', 'INT_R_X3Y10/IMUX_L13', 'CLBLM_R_X3Y10/CLBLM_M_B3'] },
    { from: 'cnt_reg[0]/Q', to: 'cnt_reg[0]_i_1/DI[0]', nodes: [] }]);
  assert.deepEqual(connections(r.nets[1]), [{ from: 'q_reg/Q', to: 'q_OBUF_inst/I', nodes: [] }]);
  // (a loop in the PIPs does not hang)
  assert.deepEqual(connections({ drivers: [{ pin: 'a/O', node: 'X/A' }], sinks: [{ pin: 'b/I', node: 'X/C' }], pips: [['X/B', 'X/C'], ['X/C', 'X/B']] }), [{ from: 'a/O', to: 'b/I', nodes: [] }]);
});

test('#3516 the wire classes of the 7-series\' nodes, and a LUT\'s physical pin of its bel pin', () => {
  const cases = { 'INT_L_X2Y3/EL1BEG_N3': 'single', 'INT_R_X3Y4/SR1END3': 'single', 'INT_L_X2Y3/NN2BEG0': 'double', 'INT_L_X2Y3/NE2A1': 'double',
    'INT_L_X2Y3/WW4BEG2': 'quad', 'INT_L_X2Y3/NN6BEG1': 'hex', 'INT_L_X2Y3/SS6E2': 'hex', 'INT_L_X2Y3/LV_L18': 'long', 'INT_R_X3Y4/LH12': 'long',
    'INT_R_X3Y4/LVB12': 'long', 'INT_L_X2Y3/LOGIC_OUTS_L4': 'output', 'INT_L_X2Y3/IMUX_L34': 'imux', 'INT_R_X3Y4/IMUX5': 'imux',
    'INT_L_X2Y3/BYP_ALT1': 'bypass', 'INT_L_X2Y3/FAN_ALT5': 'fan', 'INT_L_X2Y3/GFAN0': 'fan', 'INT_L_X2Y3/CTRL_L1': 'ctrl',
    'INT_L_X2Y3/GCLK_L_B6': 'clock', 'INT_L_X2Y3/CLK_L0': 'clock', 'INT_L_X2Y3/GND_WIRE': 'const', 'CLBLM_R_X3Y10/CLBLM_M_AQ': 'site',
    'LIOI3_X0Y3/LIOI_OLOGIC0_D1': 'site', 'HCLK_L_X4Y26/HCLK_LEAF_CLK_B_BOT4': 'clock', 'CMT_TOP_R_X5Y1/SOMETHING': 'other' };
  for (const [n, c] of Object.entries(cases)) assert.equal(wireClass(n), c, n);
  assert.ok(Object.values(cases).every((c) => CLASSES.includes(c)));
  assert.deepEqual(lutBelPin('SLICE_X1Y10/B6LUT/A3'), { bel: 'B6LUT', pin: 'A3', out: 'O6' });
  assert.deepEqual(lutBelPin('SLICE_X1Y10/D5LUT/A5'), { bel: 'D5LUT', pin: 'A5', out: 'O5' });
  assert.equal(lutBelPin('SLICE_X1Y10/AFF/D'), null);
  assert.equal(lutBelPin(undefined), null);
});

test('#3516 a design\'s numbers: the cells\' delays by nextpnr\'s arcs (a LUT\'s physical pin), the routes by wire class', () => {
  const sdf = parseSdf(SDF), routes = parseRoutes(ROUTES);
  const cells = cellSamples(sdf, routes.lutPins);
  assert.deepEqual(cells, { 'LUT.A3.O6': [124], 'LUT.A1.O5': [110], 'CARRY4.S0.O0': [424], 'CARRY4.CI.CO3': [114], 'FF.C.Q': [456], 'FF.setup.D': [62], 'FF.setup.CE': [205], 'FF.setup.SR': [524] });
  // (a LUT with no bel pin listed: its logical arc)
  assert.deepEqual(Object.keys(cellSamples(sdf)).filter((k) => k.startsWith('LUT2')), ['LUT2.I0.O', 'LUT2.I1.O']);
  assert.deepEqual(cellStats({ a: [1, 2, 6] }), { a: { n: 3, min: 1, mean: 3, max: 6 } });
  const wires = wireSamples(sdf, routes.nets.flatMap(connections));
  assert.deepEqual(wires, [{ counts: { site: 2, output: 1, double: 3, imux: 1 }, ps: 520 }]);
  assert.deepEqual(groupWires([{ counts: { b: 1, a: 2 }, ps: 10 }, { counts: { a: 2, b: 1 }, ps: 20 }, { counts: { a: 1 }, ps: 5 }]),
    [{ counts: { a: 1 }, n: 1, min: 5, mean: 5, max: 5 }, { counts: { a: 2, b: 1 }, n: 2, min: 10, mean: 15, max: 20 }]);
  // designs merged: n-weighted
  assert.deepEqual(mergeCellStats({ x: { n: 1, min: 2, mean: 2, max: 2 } }, { x: { n: 3, min: 1, mean: 6, max: 9 }, y: { n: 1, min: 1, mean: 1, max: 1 } }),
    { x: { n: 4, min: 1, mean: 5, max: 9 }, y: { n: 1, min: 1, mean: 1, max: 1 } });
  assert.deepEqual(mergeGroups([{ counts: { a: 1 }, n: 1, min: 4, mean: 4, max: 4 }], [{ counts: { a: 1 }, n: 3, min: 6, mean: 8, max: 9 }]),
    [{ counts: { a: 1 }, n: 4, min: 4, mean: 7, max: 9 }]);
});

test('#3516 the fit: non-negative least squares recovers known wire-class delays; a negative one held at 0; unused classes null', () => {
  // delays made from known ones: base 150, single 120, double 180, hex 320, imux 90, output 60 (ps)
  const truth = { single: 120, double: 180, hex: 320, imux: 90, output: 60 };
  const shapes = [{ output: 1, imux: 1, single: 1 }, { output: 1, imux: 1, double: 1 }, { output: 1, imux: 1, hex: 1 }, { output: 1, imux: 1, double: 2 },
    { output: 1, imux: 1, hex: 1, single: 2 }, { output: 1, imux: 1, hex: 2, double: 1 }, { output: 1, imux: 2, single: 1 }, { output: 2, imux: 1 }];
  const groups = shapes.map((counts, i) => ({ counts, n: i + 1, mean: 150 + Object.entries(counts).reduce((s, [c, k]) => s + k * truth[c], 0), min: 0, max: 0 }));
  const fit = fitWires(groups);
  assert.equal(fit.base, 150);
  for (const [c, v] of Object.entries(truth)) assert.equal(fit.classes[c], v, c);
  assert.equal(fit.classes.long, null);
  assert.deepEqual([fit.rmsPs, fit.maxErrPs, fit.samples], [0, 0, 36]);
  // a coefficient that would be negative is fixed at 0, the rest fitted again
  assert.deepEqual(nnls([[1, 0], [1, 1], [1, 2]], [10, 8, 6]).map((x) => +x.toFixed(6)), [8, 0]);
  assert.deepEqual(nnls([[1, 0], [0, 1]], [3, 4]), [3, 4]);
  assert.deepEqual(nnls([[0, 1]], [2]), [0, 2]);
});

test('#3516 the chip database\'s table (xilinx_gen.py\'s cells: the stubs replaced) and the Fmax comparison', () => {
  const cells = { 'LUT.A1.O6': { n: 4, min: 90, mean: 100, max: 105.4 }, 'LUT.A6.O6': { n: 1, min: 40, mean: 40, max: 43 }, 'LUT.A2.O5': { n: 1, min: 120, mean: 120, max: 120 },
    'FF.C.Q': { n: 9, min: 456, mean: 456, max: 456 }, 'FF.setup.D': { n: 2, min: 47, mean: 55, max: 62 }, 'CARRY4.CI.CO3': { n: 3, min: 114, mean: 114, max: 114 },
    'MUXF7.S.O': { n: 1, min: 296, mean: 296, max: 296 } };
  const t = chipdbTable(cells, { base: 150, classes: { single: 120, long: null } });
  assert.deepEqual(t.SLICE_LUTX.A1, { O6: { min: 90, max: 105 }, O5: null });
  assert.deepEqual(t.SLICE_LUTX.A6, { O6: { min: 40, max: 43 } });
  assert.deepEqual(t.SLICE_LUTX.A2.O5, { min: 120, max: 120 });
  assert.deepEqual(t.SLICE_FFX, { clkToQ: { min: 456, max: 456 }, setup: { D: { min: 47, max: 62 }, CE: null, SR: null } });
  assert.deepEqual([t.CARRY4, t.SELMUX2_1, t.MUXF8], [{ 'CI->CO3': { min: 114, max: 114 } }, { 'S->O': { min: 296, max: 296 } }, {}]);
  assert.deepEqual(t.wires, { base: 150, single: 120, long: null });
  assert.equal(chipdbTable({}, null).wires, null);
  const f = compareFmax({ basys3: { blinky: { vivado: { fmaxMHz: 200, logicNs: 2, routeNs: 3 }, nextpnr: { fmaxMHz: 260, logicNs: 1.6, routeNs: 2.2 } },
    gates: { vivado: { fmaxMHz: null }, nextpnr: { fmaxMHz: null } } } });
  assert.deepEqual(f.rows, [{ board: 'basys3', name: 'blinky', vivado: 200, nextpnr: 260, ratio: 1.3 }, { board: 'basys3', name: 'gates', vivado: null, nextpnr: null, ratio: null }]);
  assert.deepEqual([f.logicScale, f.routeScale], [1.25, 1.364]);
});

test('#3516 the Vivado run: the EDIF\'s Yosys commands, measure.tcl, run.sh; the designs; a design\'s numbers; the file\'s merge', () => {
  assert.equal(edifScript('top'), 'read_verilog -lib -specify +/xilinx/cells_sim.v; read_verilog -lib +/xilinx/cells_xtra.v; read_json netlist.json; hierarchy -top top -purge_lib; select -clear; delete t:$scopeinfo; write_edif -pvector bra netlist.edf');
  assert.throws(() => edifScript('top; shell'), /invalid top module name/);
  const tcl = measureTcl();
  // the same netlist: linked, placed and routed (no synthesis, no opt_design), its timing written, the routes listed
  for (const l of ['file copy -force netlist.edf $top.edf\nread_edif $top.edf', 'read_xdc netlist.xdc', 'link_design -top $top -part $part', 'place_design', 'route_design',
    'report_timing -delay_type max -max_paths 100 -nworst 1 -unique_pins -input_pins -sort_by slack -file paths.rpt',
    'write_sdf -force -process_corner slow -mode timesim design.sdf', 'puts $f "NET\\t$net"', 'get_nodes -quiet -uphill -of_objects $pip', 'puts $f "LUTPIN\\t$p\\t[get_bel_pins -quiet -of_objects $p]"']) assert.ok(tcl.includes(l), l);
  // #3738: Vivado's link_design -top found no 'top' in netlist.edf (Project 1-68): the EDIF is read as <top>.edf
  assert.ok(!tcl.includes('read_edif netlist.edf'));
  assert.ok(!/synth_design|opt_design|write_bitstream|write_checkpoint/.test(tcl));
  for (const f of OUTPUTS) assert.ok(tcl.includes(f), f);
  const sh = runSh();
  assert.match(sh, /timeout "\$T" vivado -mode batch -nojournal -notrace -log "\$R\/vivado.log" -source "\$W\/measure.tcl" -tclargs "\$D" "\$top" "\$part"/);
  assert.match(sh, /for f in route\.rpt summary\.rpt paths\.rpt design\.sdf routes\.txt; do/);
  assert.match(sh, /touch "\$W\/done"\n$/);
  assert.deepEqual(BOARDS, { basys3: 'xc7a35tcpg236-1', 'nexys-a7': 'xc7a100tcsg324-1' });
  assert.deepEqual(selectDesigns(['gates', 'blinky', 'pong'], ['basys3', 'nexys-a7'], '^(blinky|pong)$').map((d) => [d.id, d.part]),
    [['basys3-blinky', 'xc7a35tcpg236-1'], ['basys3-pong', 'xc7a35tcpg236-1'], ['nexys-a7-blinky', 'xc7a100tcsg324-1'], ['nexys-a7-pong', 'xc7a100tcsg324-1']]);
  assert.equal(selectDesigns(['gates', 'blinky'], ['basys3']).length, 2);
  assert.throws(() => selectDesigns(['gates'], ['basys2']), /no 7-series board basys2/);
  assert.equal(keepsRun(['--collect', 'x']), true);
  assert.equal(keepsRun(['--collect', 'x', '--update']), false);

  // a design's numbers from its results (the summary's Fmax, the worst path's split, the cells, the routes)
  const SUMMARY = `------------------------------------------------------------------------------------------------
| Design Timing Summary
| ---------------------
------------------------------------------------------------------------------------------------

    WNS(ns)      TNS(ns)  TNS Failing Endpoints  TNS Total Endpoints      WHS(ns)      THS(ns)  THS Failing Endpoints  THS Total Endpoints     WPWS(ns)     TPWS(ns)  TPWS Failing Endpoints  TPWS Total Endpoints
    -------      -------  ---------------------  -------------------      -------      -------  ---------------------  -------------------     --------     --------  ----------------------  --------------------
      5.712        0.000                      0                   66        0.167        0.000                      0                   66        4.500        0.000                       0                    34


All user specified timing constraints are met.


------------------------------------------------------------------------------------------------
| Clock Summary
| -------------
------------------------------------------------------------------------------------------------

Clock  Waveform(ns)       Period(ns)      Frequency(MHz)
-----  ------------       ----------      --------------
clk    {0.000 5.000}      10.000          100.000


------------------------------------------------------------------------------------------------
| Intra Clock Table
| -----------------
------------------------------------------------------------------------------------------------

Clock             WNS(ns)      TNS(ns)  TNS Failing Endpoints  TNS Total Endpoints      WHS(ns)      THS(ns)  THS Failing Endpoints  THS Total Endpoints     WPWS(ns)     TPWS(ns)  TPWS Failing Endpoints  TPWS Total Endpoints
-----             -------      -------  ---------------------  -------------------      -------      -------  ---------------------  -------------------     --------     --------  ----------------------  --------------------
clk                 5.712        0.000                      0                   66        0.167        0.000                      0                   66        4.500        0.000                       0                    34
`;
  const files = { 'status.txt': 'vivado 0\n', 'summary.rpt': SUMMARY, 'paths.rpt': PATHS, 'design.sdf': SDF, 'routes.txt': ROUTES };
  const n = designNumbers((f) => files[f] ?? '', parseTimingSummary);
  assert.deepEqual(n.vivado, { fmaxMHz: 233.209, minPeriodNs: 4.288, wnsNs: 5.712, logicNs: 1.716, routeNs: 2.534, levels: 2 });
  assert.deepEqual(n.cells['FF.C.Q'], { n: 1, min: 456, mean: 456, max: 456 });
  assert.deepEqual(n.wires, [{ counts: { double: 3, imux: 1, output: 1, site: 2 }, n: 1, min: 520, mean: 520, max: 520 }]);
  assert.deepEqual(designNumbers((f) => (f === 'status.txt' ? 'vivado 124\n' : ''), parseTimingSummary), { status: '124', error: 'Vivado exited with 124' });
  assert.deepEqual(designNumbers(() => '', parseTimingSummary), { status: null, error: 'Vivado did not run' });

  // the measurement file: a design measured again replaced, a failed one left out, sorted; then fitted
  const old = { examples: { basys3: { pong: { vivado: { fmaxMHz: 1 } }, blinky: { vivado: { fmaxMHz: 2 } } } } };
  const m = mergeMeasurement(old, { a: { board: 'basys3', name: 'blinky', ...n, nextpnr: { fmaxMHz: 300, logicNs: 1, routeNs: 2 }, sameNetlist: true },
    b: { board: 'nexys-a7', name: 'gates', error: 'Vivado exited with 1' } }, { image: 'xilinx/vitis-hls:2025.2' });
  assert.deepEqual(Object.keys(m.examples), ['basys3']);
  assert.deepEqual(Object.keys(m.examples.basys3), ['blinky', 'pong']);
  assert.equal(m.examples.basys3.blinky.vivado.fmaxMHz, 233.209);
  assert.deepEqual([m.issue, m.vivado, m.image, m.units], [3516, '2025.2', 'xilinx/vitis-hls:2025.2', { delays: 'ps', fmax: 'MHz', paths: 'ns' }]);
  // (only numbers and names: no file of Vivado's)
  assert.ok(!/DELAYFILE|Timing Report|NET\t/.test(JSON.stringify(m)));
  const fit = fitMeasurement(m);
  assert.deepEqual(fit.chipdb.SLICE_FFX.clkToQ, { min: 456, max: 456 });
  assert.equal(fit.wires.samples, 1);
  assert.deepEqual(fit.fmax.rows.find((r) => r.name === 'blinky'), { board: 'basys3', name: 'blinky', vivado: 233.209, nextpnr: 300, ratio: 1.286 });
});

test('#3516 nextpnr\'s critical paths split into logic and routing', () => {
  const report = { critical_paths: [{ from: 'posedge clk', path: [{ type: 'clk-to-q', delay: 0.35 }, { type: 'routing', delay: 0.632 }, { type: 'logic', delay: 0.125 }, { type: 'routing', delay: 0 }, { type: 'setup', delay: 0.1 }] }] };
  assert.deepEqual(nextpnrPathSplit(report), { 'posedge clk': { logicNs: 0.575, routeNs: 0.632, totalNs: 1.207 } });
  assert.deepEqual(nextpnrPathSplit({}), {});
});

test('#3516 the host\'s jobs: a Xilinx image\'s container or a silinx-* run is one; the host\'s services (its proxy, tailscale) are not', () => {
  const ps = ['alpine/socat:latest\tsocat-proxy', 'tailscale/tailscale:stable\ttailscale', ''].join('\n');
  assert.deepEqual(jobContainers(ps), []);
  assert.deepEqual(jobContainers(''), []);
  assert.deepEqual(jobContainers(`${ps}\nxilinx/ise:14.7\tadmiring_turing`), ['admiring_turing']);
  assert.deepEqual(jobContainers(`${ps}\nxilinx/vitis-hls:2025.2\tsilinx-vitis-abc123`), ['silinx-vitis-abc123']);
  assert.deepEqual(jobContainers('ubuntu:22.04\tsilinx-xc7t-x1y2'), ['silinx-xc7t-x1y2']);
  assert.deepEqual(jobContainers('my/vivado:2025.2\tjob', 'my/vivado:2025.2'), ['job']);
  assert.deepEqual(jobContainers('my/vivado:2025.2\tjob'), []);
  assert.deepEqual(jobContainers('notxilinx/ise:1\tx'), []);
});

test('#3752 --filter: examples\' names, matched as the same regular expression would, never a regular expression built from the command line', async () => {
  const { EXAMPLES } = await import('./examples-lib.mjs');
  const names = [...EXAMPLES, 'blinky2', 'myblinky'];
  // (the reference: the pattern as a regular expression, as --filter was before; every form nameFilter takes)
  const filters = ['^blinky$', '^(blinky|pong)$', '^(blinky)$', 'blinky|pong', '(blinky|pong)', '^b', '^(b|c)', 'k$', '(k|o)$', 'o', 'micro80', '^micro80$', '^(gates|traffic|blinky|pong|stopwatch|clock|vga|isqrt|uart|micro80)$', 'none'];
  for (const f of filters) assert.deepEqual(names.filter(nameFilter(f)), names.filter((n) => new RegExp(f).test(n)), f);
  // a comma as |
  assert.deepEqual(names.filter(nameFilter('^(blinky,pong)$')), ['blinky', 'pong']);
  assert.deepEqual(names.filter(nameFilter('blinky,pong')), names.filter((n) => /blinky|pong/.test(n)));
  assert.deepEqual(selectDesigns(['gates', 'blinky', 'pong'], ['basys3'], '^blinky$').map((d) => d.id), ['basys3-blinky']);
  assert.deepEqual(selectDesigns(['gates', 'blinky'], ['basys3'], 'x'), []);
  // anything but names: an error naming the filter (the old code built a regular expression of any of these)
  for (const f of ['(a+)+$', '.*', 'blink.', '^(blinky|pong$', '^blinky)$', 'blinky||pong', '|blinky', 'a b', '^$', '$^blinky', '[a-z]+', '\\w']) {
    assert.throws(() => selectDesigns(['gates', 'blinky'], ['basys3'], f), (e) => e.message === `--filter: examples' names separated by | or , (as '^(blinky|pong)$'), not ${f}`, f);
  }
});
