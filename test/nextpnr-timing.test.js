// nextpnr's own timing as the reports show it (#2300): the Design Summary's timing (nextpnrTiming), the critical paths stage
// by stage back to the source lines (nextpnrPaths: the Paths panel's and timing_paths' shape), the Static Timing Report's
// text, the timing step; on a report and a netlist made here (each value worked out by hand), then on a design through
// each family's nextpnr (the iCE40's, the ECP5's, the Gowin's): Place & Route writes the timing, the timing step writes it
// again from an earlier run's report, a clock no constraint asks for has none, a constraint not met is warned.
import test from 'node:test';
import assert from 'node:assert/strict';
import { nextpnrTiming, nextpnrPaths, nextpnrTimingText, mountNextpnrTiming } from '../packages/silinx-fpga/src/nextpnr-timing.js';
import { askedClocks } from '../packages/silinx-fpga/src/open-flow-ice40.js';
import { gowinPlaced } from '../packages/silinx-fpga/src/open-flow-gowin.js';
import { runFlow, nextpnrIce40Node, nextpnrEcp5Node, nextpnrGowinNode, yosysNode } from '../packages/silinx-fpga/src/node.js';
import { StepError } from '../packages/silinx-fpga/src/open-flow-core.js';

// a flip-flop q_reg (q <= ~q, top_syn.v's line 3, src/top.v:3) and its inverter, an abc LUT (its src Yosys's map file); an
// input d into a second flip-flop d_reg
const SYN = 'module top(input clk, input d, output q);\n  // process_3 (src/top.v:3)\n  always @(posedge clk) q <= ~q;\n  // process_4 (src/top.v:4)\n  always @(posedge clk) dq <= d;\nendmodule\n';
const io = (dir, bits) => ({ dir, bits });
const cell = (type, src, ports) => ({ type, attributes: { src }, port_directions: Object.fromEntries(Object.entries(ports).map(([p, x]) => [p, x.dir])), connections: Object.fromEntries(Object.entries(ports).map(([p, x]) => [p, x.bits])) });
const NETLIST = { modules: { top: { attributes: { top: 1 },
  cells: {
    q_reg: cell('SB_DFF', 'top_syn.v:3.3-3.30', { C: io('input', [2]), D: io('input', [5]), Q: io('output', [3]) }),
    lut: cell('SB_LUT4', '/share/ice40/cells_map.v:6.21-6.22', { I0: io('input', [3]), O: io('output', [5]) }),
    d_reg: cell('SB_DFF', 'top_syn.v:5.3-5.31', { C: io('input', [2]), D: io('input', [6]), Q: io('output', [7]) }),
  },
  netnames: { clk: { bits: [2] }, q: { bits: [3] }, '$abc$5': { bits: [5], hide_name: 1 }, d: { bits: [6] }, dq: { bits: [7] } } } } };
const at = (cell, port, x, y) => ({ cell, port, loc: [x, y] });
const seg = (type, delay, to, net) => ({ type, delay, from: to, to, ...(net && { net }) });
const CLK = 'clk$SB_IO_IN_$glb_clk';
const REG = { from: `posedge ${CLK}`, to: `posedge ${CLK}`, path: [
  seg('clk-to-q', 1.39, at('q_reg_DFFLC', 'O', 1, 2)), seg('routing', 2, at('lut_LC', 'I0', 3, 4), 'q'), seg('logic', 1.2, at('lut_LC', 'O', 3, 4)),
  seg('routing', 1, at('q_reg_DFFLC', 'D', 1, 2), '$abc$5'), seg('setup', 0.1, at('q_reg_DFFLC', 'D', 1, 2))] };
const IN = { from: '<async>', to: `posedge ${CLK}`, path: [seg('source', 0, at('d$sb_io', 'D_IN_0', 0, 9)), seg('routing', 3.5, at('d_reg_DFFLC', 'D', 5, 6), 'd$SB_IO_IN'), seg('setup', 0.1, at('d_reg_DFFLC', 'D', 5, 6))] };
const clockName = n => n.replace(/\$SB_IO_IN_\$glb_clk$/, '');
const paths = (report, fmax, more = {}) => nextpnrPaths(report, { clockName, fmax, netlist: NETLIST, synText: SYN, top: 'top', ...more });

test('nextpnrTiming: a clock its constraint asks for, met and not met; a clock with none; no clock', () => {
  assert.deepEqual(nextpnrTiming([{ clock: 'clk', achieved: 100, constraint: 12 }]), {
    met: true, timingErrors: 0, score: null, minPeriodNs: 10, maxFreqMHz: 100, engine: 'nextpnr',
    clocks: [{ clock: 'clk', minPeriodNs: 10, maxFreqMHz: 100, constraintMHz: 12 }],
    constraints: [{ name: 'clock clk', constraint: 'clk at 12 MHz (83.333 ns)', required: 83.333, constraintMHz: 12, minPeriodNs: 10, maxFreqMHz: 100, timingErrors: 0, slackNs: 73.333 }],
  });
  const slow = nextpnrTiming([{ clock: 'clk', achieved: 10, constraint: 12 }, { clock: 'fast', achieved: 250, constraint: 200 }]);
  assert.deepEqual([slow.met, slow.timingErrors, slow.minPeriodNs, slow.maxFreqMHz], [false, 1, 100, 10]);
  assert.deepEqual(slow.constraints.map(c => [c.name, c.timingErrors, c.slackNs]), [['clock clk', 1, -16.667], ['clock fast', 0, 1]]);
  // (nextpnr's default frequency, no constraint's: no row, the clock's frequency alone)
  const none = nextpnrTiming(askedClocks([{ clock: 'clk', achieved: 50, constraint: 12 }], []));
  assert.deepEqual([none.met, none.constraints, none.clocks], [true, [], [{ clock: 'clk', minPeriodNs: 20, maxFreqMHz: 50, constraintMHz: null }]]);
  assert.deepEqual(askedClocks([{ clock: 'clk', constraint: 12 }, { clock: 'b', constraint: 12 }], ['b']), [{ clock: 'clk', constraint: null }, { clock: 'b', constraint: 12 }]);
  assert.deepEqual(nextpnrTiming([]), { met: true, timingErrors: 0, score: null, minPeriodNs: null, maxFreqMHz: null, clocks: [], constraints: [], engine: 'nextpnr' });
});

test('nextpnrPaths: a path between two flip-flops, stage by stage, each one\'s cell back to its source line; an input\'s path', () => {
  const r = paths({ critical_paths: [REG, IN] }, [{ clock: 'clk', achieved: 100, constraint: 12 }]);
  assert.equal(r.top, 'top');
  const P3 = [{ file: 'src/top.v', line: 3, block: 'process_3' }];
  assert.deepEqual(r.paths, [{ clock: 'clk', port: null, required: 83.333, delay: 5.69, period: 5.69, half: false, slack: 77.643, lines: [{ file: 'src/top.v', line: 3 }], stages: [
    // (the flip-flop that drives q, not the logic cell's name: q_reg_DFFLC is nextpnr's)
    { kind: 'clock-to-out', inst: 'q_reg_DFFLC', pin: 'O', site: 'X1Y2', delay: 1.39, arrival: 1.39, sources: P3, signals: ['q'] },
    { kind: 'net', inst: 'lut_LC', pin: 'I0', site: 'X3Y4', delay: 2, arrival: 3.39, net: 'q', sources: [], signals: [] },
    // (abc's LUT: its src Yosys's map file, its source the flip-flop's it feeds)
    { kind: 'logic', inst: 'lut_LC', pin: 'O', site: 'X3Y4', delay: 1.2, arrival: 4.59, sources: P3, signals: [] },
    { kind: 'net', inst: 'q_reg_DFFLC', pin: 'D', site: 'X1Y2', delay: 1, arrival: 5.59, net: '$abc$5', sources: [], signals: [] },
    { kind: 'setup', inst: 'q_reg_DFFLC', pin: 'D', site: 'X1Y2', delay: 0.1, arrival: 5.69, sources: P3, signals: ['q'] },
  ] }]);
  assert.deepEqual(r.points, ['q']);
  assert.deepEqual(r.pairs.map(p => [p.from, p.to, p.delay]), [['q', 'q', 5.69]]);
  // (the input's net nextpnr names after its buffer: d$SB_IO_IN, the netlist's d)
  assert.deepEqual(r.inputs.map(p => [p.clock, p.delay, p.stages.map(s => [s.kind, s.sources.map(x => x.line), s.signals])]),
    [['clk', 3.6, [['input', [], ['d']], ['net', [], []], ['setup', [4], ['dq']]]]]);
  assert.deepEqual([r.outputs, r.through], [[], []]);
});

test('nextpnrPaths: between a clock\'s two edges, between two clocks, a clock with no constraint, none; the slowest first', () => {
  const neg = { ...REG, to: `negedge ${CLK}` };
  const cross = { ...REG, from: 'posedge other' };
  const r = paths({ critical_paths: [REG, neg, cross, { from: '<async>', to: '<async>', path: IN.path.slice(0, 2) }] }, [{ clock: 'clk', achieved: 100, constraint: 12 }]);
  assert.deepEqual(r.paths.map(p => [p.clock, p.fromClock, p.half, p.period, p.required, p.slack]), [
    ['clk', undefined, true, 11.38, 41.667, 35.977], ['clk', undefined, false, 5.69, 83.333, 77.643], ['clk', 'other', false, 5.69, null, null]]);
  assert.deepEqual(r.through.map(p => p.delay), [3.5]);
  const free = paths({ critical_paths: [REG] }, [{ clock: 'clk', achieved: 100, constraint: null }]);
  assert.deepEqual([free.paths[0].required, free.paths[0].slack], [null, null]);
  assert.deepEqual(paths({}, []), { top: 'top', paths: [], points: [], pairs: [], inputs: [], outputs: [], through: [] });
  // (no netlist: the stages, no sources; a register its cell's name)
  const bare = nextpnrPaths({ critical_paths: [REG] }, { clockName });
  assert.deepEqual(bare.paths[0].stages.map(s => s.sources.length + s.signals.length), [0, 0, 0, 0, 0]);
  assert.deepEqual(bare.points, ['q_reg_DFFLC']);
});

test('nextpnrTimingText: the clocks, each critical path stage by stage, the end; no clock', () => {
  const fmax = [{ clock: 'clk', achieved: 100, constraint: 12 }];
  const timing = nextpnrTiming(fmax);
  const text = nextpnrTimingText({ top: 'top', part: 'ice40up5ksg48', tool: 'nextpnr-ice40', timing, paths: paths({ critical_paths: [REG, IN] }, fmax) });
  assert.equal(text, [
    'Static timing of top on ice40up5ksg48 after Place & Route: nextpnr-ice40\'s timing analysis (its report), the worst path of each clock.', '',
    'Clock clk: 100 MHz (10.000 ns), constraint 12 MHz (83.333 ns): met, slack 73.333 ns', '',
    'Critical path of clock clk: 5.690 ns, required 83.333 ns, slack 77.643 ns',
    '  kind           delay  arrival  to',
    '  clock-to-out   1.390    1.390  q_reg_DFFLC.O (X1Y2)  <- src/top.v:3',
    '  net            2.000    3.390  lut_LC.I0 (X3Y4), net q',
    '  logic          1.200    4.590  lut_LC.O (X3Y4)  <- src/top.v:3',
    '  net            1.000    5.590  q_reg_DFFLC.D (X1Y2), net $abc$5',
    '  setup          0.100    5.690  q_reg_DFFLC.D (X1Y2)  <- src/top.v:3', '',
    'Critical path from the inputs to clock clk: 3.600 ns',
    '  kind           delay  arrival  to',
    '  input          0.000    0.000  d$sb_io.D_IN_0 (X0Y9)',
    '  net            3.500    3.500  d_reg_DFFLC.D (X5Y6), net d$SB_IO_IN',
    '  setup          0.100    3.600  d_reg_DFFLC.D (X5Y6)  <- src/top.v:4', '',
    'All constraints were met.', ''].join('\n'));
  const free = nextpnrTiming([{ clock: 'clk', achieved: 50, constraint: null }]);
  assert.match(nextpnrTimingText({ top: 't', part: 'p', tool: 'nextpnr-ecp5', timing: free, paths: paths({}, []) }), /\nClock clk: 50 MHz \(20\.000 ns\), no constraint\n\nNo clock constraint\.\n$/);
  assert.match(nextpnrTimingText({ top: 't', part: 'p', tool: 'nextpnr-ecp5', timing: nextpnrTiming([]), paths: paths({}, []) }), /\n\nNo clock: no path between two flip-flops to time\.\n\nNo clock constraint\.\n$/);
  const slow = nextpnrTiming([{ clock: 'clk', achieved: 10, constraint: 12 }]);
  assert.match(nextpnrTimingText({ top: 't', part: 'p', tool: 'x', timing: slow, paths: paths({}, []) }), /constraint 12 MHz \(83\.333 ns\): NOT met, slack -16\.667 ns\n\n1 constraint\(s\) not met\.\n$/);
});

test('the timing step: its files and log from an earlier run\'s report, a constraint not met warned; none: no routed design', () => {
  const files = {}, log = [], report = { files: {} };
  const ctx = { io: { write: (n, d) => { files[n] = d; return `build/${n}`; }, read: n => files[n] ?? null }, spec: { part: 'ice40up5ksg48' }, log: l => log.push(l), report, top: 'top', StepError,
    netlistText: () => JSON.stringify(NETLIST) };
  files['open/top_syn.v'] = SYN;
  mountNextpnrTiming(ctx, { tool: 'nextpnr-ice40', clockName }).record({ critical_paths: [REG] }, [{ clock: 'clk', achieved: 10, constraint: 12 }]);
  assert.deepEqual(Object.keys(files).sort(), ['open/nextpnr-report.json', 'open/paths.json', 'open/timing.txt', 'open/top_syn.v']);
  assert.deepEqual(JSON.parse(files['open/nextpnr-report.json']).clocks, [{ clock: 'clk', achieved: 10, constraint: 12 }]);
  assert.deepEqual([report.timing.met, report.files], [false, { timing: 'build/open/timing.txt', paths: 'build/open/paths.json' }]);
  assert.deepEqual(log, []);
  const first = { ...files };
  // (a later run: the timing step alone, from the report Place & Route kept)
  delete files['open/timing.txt'];
  const again = { ...ctx, report: { files: {} } };
  mountNextpnrTiming(again, { tool: 'nextpnr-ice40', clockName }).runTiming();
  assert.deepEqual(files, first);
  assert.deepEqual(log, ['Timing (nextpnr-ice40\'s analysis): 1 constraint(s) not met, minimum period 100 ns (10 MHz).',
    'WARNING:Timing - the clock clk reaches 10 MHz, not the 12 MHz of its constraint.', 'Timing report: build/open/timing.txt']);
  const none = { ...ctx, io: { ...ctx.io, read: () => null } };
  assert.throws(() => mountNextpnrTiming(none, { tool: 'nextpnr-ice40', clockName }).runTiming(), e => e instanceof StepError && e.message === 'no routed design: run Place & Route first');
});

test('the Gowin\'s resources: nextpnr\'s constants, its global set / reset and its placeholders are none of the device\'s', () => {
  const r = { utilization: { LUT4: { used: 3, available: 8640 }, DFF: { used: 0, available: 6480 }, GND: { used: 1, available: 1 }, VCC: { used: 1, available: 1 }, GSR: { used: 1, available: 1 }, DUMMY_CELL: { used: 12, available: 0 }, IOB: { used: 3, available: 276 } } };
  assert.deepEqual(gowinPlaced(r), [['LUT4', { used: 3, available: 8640 }], ['IOB', { used: 3, available: 276 }]]);
  assert.deepEqual(gowinPlaced({}), []);
});

// a design through each family's nextpnr: a 24-bit counter, its clock constrained
const BLINKY = 'module blinky(input clk, output reg [1:0] led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23:22]; end\nendmodule\n';
const FAMILIES = [
  { family: 'ice40', spec: { device: 'ice40up5k', pkg: 'sg48' }, tool: 'nextpnr-ice40', part: 'ice40up5ksg48', net: 'clk$SB_IO_IN_$glb_clk', nextpnr: { ice40: nextpnrIce40Node() }, name: 'blinky.pcf', mhz: 12,
    pins: f => `set_io clk 35\nset_io led[0] 11\nset_io led[1] 12\n${f ? `set_frequency clk ${f}\n` : ''}` },
  { family: 'ecp5', spec: { device: 'lfe5u-85f', pkg: 'cabga381', speed: '-6' }, tool: 'nextpnr-ecp5', part: 'lfe5u-85f-6cabga381', net: '$glbnet$clk$TRELLIS_IO_IN', nextpnr: { ecp5: nextpnrEcp5Node() }, name: 'blinky.lpf', mhz: 25,
    pins: f => `LOCATE COMP "clk" SITE "G2";\nLOCATE COMP "led[0]" SITE "B2";\nLOCATE COMP "led[1]" SITE "C2";\n${f ? `FREQUENCY PORT "clk" ${f} MHZ;\n` : ''}` },
  { family: 'gowin', spec: { device: 'gw1nr-9c', pkg: 'qn88', speed: '-6' }, tool: 'nextpnr-himbaechel-gowin', part: 'gw1nr-9c-6qn88', net: 'clk_IBUF_I_O', nextpnr: { gowin: nextpnrGowinNode() }, name: 'blinky.cst', mhz: 27,
    pins: f => `IO_LOC "clk" 52;\nIO_LOC "led[0]" 10;\nIO_LOC "led[1]" 11;\n${f ? `// create_clock -name clk -period ${(1000 / f).toFixed(3)} [get_ports {clk}]\n` : ''}` },
];
function memoryIo(fam, pins) {
  const log = [], files = {};
  return { log, files, io: { log: l => log.push(l), sources: () => [{ path: 'blinky.v', lang: 'verilog', text: BLINKY }], ucf: pins, ucfName: fam.name,
    yosys: yosysNode, nextpnr: fam.nextpnr, write: (n, d) => { files[n] = d; return `build/${n}`; }, read: n => files[n] ?? null, save: () => {} } };
}
const warnings = log => log.filter(l => /^WARNING/.test(l));

for (const fam of FAMILIES) {
  test(`${fam.family}: Place & Route writes nextpnr's timing, the counter's path; the timing step writes it again`, { timeout: 300000 }, async () => {
    const spec = { top: 'blinky', family: fam.family, ...fam.spec, part: fam.part };
    const { log, files, io } = memoryIo(fam, fam.pins(fam.mhz));
    const r = await runFlow({ ...spec, steps: ['synth', 'translate', 'par', 'trce'] }, io);
    assert.ok(r.ok, r.error);
    assert.deepEqual(warnings(log), []);
    const t = r.report.timing;
    const [clk] = t.clocks;
    assert.deepEqual([t.met, t.timingErrors, t.engine, t.clocks.length, clk.clock, clk.constraintMHz], [true, 0, 'nextpnr', 1, 'clk', fam.mhz]);
    assert.equal(clk.minPeriodNs, +(1000 / clk.maxFreqMHz).toFixed(3));
    assert.equal(clk.maxFreqMHz, r.report.par.fmax[0].achieved);
    assert.deepEqual(t.constraints.map(c => [c.name, c.constraint, c.timingErrors]), [['clock clk', `clk at ${fam.mhz} MHz (${(1000 / fam.mhz).toFixed(3)} ns)`, 0]]);
    // the paths: the counter's, from a flip-flop of c to another (its source lines: the IDE's flat Verilog's, test/mcp-nextpnr-reports.test.js)
    const p = JSON.parse(files['open/paths.json']);
    assert.equal(p.paths.length, 1);
    const [path] = p.paths;
    assert.deepEqual([path.clock, path.half, path.required], ['clk', false, +(1000 / fam.mhz).toFixed(3)]);
    assert.equal(path.slack, +(path.required - path.delay).toFixed(3));
    assert.equal(path.stages[0].kind, 'clock-to-out');
    assert.equal(path.stages.at(-1).kind, 'setup');
    assert.equal(path.delay, path.stages.at(-1).arrival);
    assert.ok(path.stages.every(s => /^X\d+Y\d+$/.test(s.site)), 'each stage\'s place');
    assert.ok(p.points.length && p.points.every(x => /^(c|led)$/.test(x)), p.points.join());
    const text = files['open/timing.txt'];
    assert.ok(text.startsWith(`Static timing of blinky on ${fam.part} after Place & Route: ${fam.tool}'s timing analysis (its report), the worst path of each clock.\n\n`
      + `Clock clk: ${clk.maxFreqMHz} MHz (${clk.minPeriodNs.toFixed(3)} ns), constraint ${fam.mhz} MHz (${(1000 / fam.mhz).toFixed(3)} ns): met, slack ${t.constraints[0].slackNs.toFixed(3)} ns\n\n`
      + `Critical path of clock clk: ${path.delay.toFixed(3)} ns, required ${path.required.toFixed(3)} ns, slack ${path.slack.toFixed(3)} ns\n`), text.slice(0, 600));
    assert.ok(text.endsWith('\nAll constraints were met.\n'));
    assert.deepEqual(log.filter(l => /^Timing/.test(l)), [`Timing (${fam.tool}'s analysis): all constraints met, minimum period ${t.minPeriodNs} ns (${t.maxFreqMHz} MHz).`, 'Timing report: build/open/timing.txt']);
    // (the timing step of a later run, from the report Place & Route kept: the same files)
    const next = memoryIo(fam, fam.pins(fam.mhz));
    for (const f of ['open/nextpnr-report.json', 'open/blinky.json', 'open/blinky_syn.v']) next.files[f] = files[f];
    const r2 = await runFlow({ ...spec, steps: ['trce'] }, next.io);
    assert.ok(r2.ok, r2.error);
    assert.deepEqual([next.files['open/timing.txt'], next.files['open/paths.json']], [text, files['open/paths.json']]);
  });

  test(`${fam.family}: a constraint not met is warned by the timing step; no constraint, the clock alone`, { timeout: 300000 }, async () => {
    const spec = { top: 'blinky', family: fam.family, ...fam.spec, part: fam.part };
    const fast = memoryIo(fam, fam.pins(500));
    const r = await runFlow({ ...spec, steps: ['synth', 'translate', 'par', 'trce'] }, fast.io);
    assert.ok(r.ok, r.error);
    const c = r.report.timing.constraints[0];
    assert.deepEqual([r.report.timing.met, c.timingErrors], [false, 1]);
    // (nextpnr's own warning at Place & Route, its net's name; the timing step's)
    assert.deepEqual(warnings(fast.log), [`WARNING:Place - Max frequency for clock '${fam.net}': ${c.maxFreqMHz.toFixed(2)} MHz (FAIL at 500.00 MHz)`,
      `WARNING:Timing - the clock clk reaches ${c.maxFreqMHz} MHz, not the 500 MHz of its constraint.`]);
    assert.ok(fast.files['open/timing.txt'].endsWith('\n1 constraint(s) not met.\n'));
    const free = memoryIo(fam, fam.pins(0));
    const r2 = await runFlow({ ...spec, steps: ['synth', 'translate', 'par', 'trce'] }, free.io);
    assert.ok(r2.ok, r2.error);
    assert.deepEqual(warnings(free.log), []);
    assert.deepEqual([r2.report.timing.met, r2.report.timing.constraints, r2.report.timing.clocks.map(x => [x.clock, x.constraintMHz])], [true, [], [['clk', null]]]);
    const p = JSON.parse(free.files['open/paths.json']).paths;
    assert.deepEqual(p.map(x => [x.clock, x.required, x.slack]), [['clk', null, null]]);
    assert.match(free.files['open/timing.txt'], /\nClock clk: [\d.]+ MHz \([\d.]+ ns\), no constraint\n[^]*\nNo clock constraint\.\n$/);
  });
}
