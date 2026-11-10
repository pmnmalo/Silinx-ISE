// packages/silinx-fpga/src/fpga/timing-paths.js (#3178): the slowest paths of the timing analysis (timing.js
// analyze().paths), stage by stage, back to their source lines through Yosys's netlist and the synthesis Verilog; the
// open flow's open/paths.json on blinky (VHDL) and pong (Verilog), checked against the timing report's critical path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { timingGraph } from '../packages/silinx-fpga/src/fpga/timing.js';
import { synBlocks, cellSources, stageCells, timingPaths, pathsText, pathHighlight, betweenPaths } from '../packages/silinx-fpga/src/fpga/timing-paths.js';
import { PATHS } from '../packages/silinx-fpga/src/open-flow-reports.js';
import { flow } from './timesim-lib.mjs';
import { example, exampleUcf } from './examples-lib.mjs';

const SYN = [
  'module t (input wire clk);',
  '  logic [3:0] q = 4\'h0;',
  '  function automatic [3:0] inc(input [3:0] v);',
  '    inc = v + 4\'h1;',
  '  endfunction',
  '  function automatic [3:0] inc2(input [3:0] v);',
  '    inc2 = inc(inc(v));',
  '  endfunction',
  '  // process_12 (src/t.vhd:12)',
  '  always @(posedge clk) begin',
  '    q <= inc2(q);',
  '  end',
  '  // assign_20 (src/t.vhd:20)',
  '  always @* begin',
  '    \\u.y  = q[0] == 1\'h1;',
  '  end',
  'endmodule',
].join('\n');

test('synBlocks: each block from its `// name (file:line)` line, what it assigns and calls; the functions', () => {
  const b = synBlocks(SYN);
  assert.deepEqual(b.map(x => [x.from, x.to, x.file, x.line, x.name, [...x.writes]]), [
    [10, 12, 'src/t.vhd', 12, 'process_12', ['q']],
    [14, 16, 'src/t.vhd', 20, 'assign_20', ['u.y']],
  ]);
  assert.ok(b[0].calls.has('inc2') && !b[1].calls.has('inc2'));
  assert.deepEqual(b.funcs.map(f => [f.from, f.to, f.name, [...f.calls]]), [[3, 5, 'inc', []], [6, 8, 'inc2', ['inc']]]);
  assert.deepEqual([...synBlocks('')], []);
});

test('cellSources: a cell\'s own src (in a function: its callers), the named signals on its outputs, the cells it feeds; none', () => {
  const cell = (src, conns, dirs) => ({ attributes: src ? { src } : {}, connections: conns, port_directions: dirs });
  const netlist = { modules: { t: {
    attributes: { top: '1' },
    cells: {
      '$auto$ff.cc:337:slice$1': cell('t_syn.v:10.3-12.6|/share/xilinx/ff_map.v:68.41-68.95', { D: [5], Q: [2] }, { D: 'input', Q: 'output' }),
      '$add$t_syn.v:4$2': cell('t_syn.v:4.10-4.20', { A: [2], Y: [3] }, { A: 'input', Y: 'output' }),
      '$abc$9$lut$o1': cell('/share/xilinx/lut_map.v:47.26-48.41', { I0: [2], O: [6] }, { I0: 'input', O: 'output' }),
      '$abc$9$lut$o2': cell('/share/xilinx/lut_map.v:47.26-48.41', { I0: [6], O: [5] }, { I0: 'input', O: 'output' }),
      'ram.0.0': cell('/share/xilinx/brams_map.v:1.1-2.2', { DO: [7] }, { DO: 'output' }),
      lonely: cell(null, { O: [9] }, { O: 'output' }),
    },
    netnames: { q: { bits: [2, 2, 2, 2], attributes: {} }, 'u.y': { bits: [7], attributes: {} }, '$abc$x': { bits: [6], attributes: {} }, hidden: { hide_name: 1, bits: [9] } },
  } } };
  const of = cellSources(netlist, SYN, 't');
  const at = n => of(n).map(x => `${x.file}:${x.line} ${x.block}`);
  assert.deepEqual(at('$auto$ff.cc_337_slice$1'), ['src/t.vhd:12 process_12'], 'its own src, the XDL\'s name');
  assert.deepEqual(at('$add$t_syn.v_4$2'), ['src/t.vhd:12 process_12'], 'in inc, called by inc2, called by process_12');
  assert.deepEqual(at('ram.0.0.RAMB16'), ['src/t.vhd:20 assign_20'], 'a block RAM\'s part: the block assigning u.y, on its output');
  assert.deepEqual(at('$abc$9$lut$o1'), ['src/t.vhd:12 process_12'], 'abc\'s LUT: the flip-flop two levels on');
  assert.deepEqual(at('lonely'), [], 'nothing named on its output, nothing fed');
  assert.deepEqual(at('nowhere'), []);
  assert.deepEqual(cellSources(null, SYN, 't')('x'), []);
  // the named signals a cell drives (#3178's drawings): a register's, none of Yosys's own names, a block RAM's part's
  assert.deepEqual(of.signals('$auto$ff.cc_337_slice$1'), ['q']);
  assert.deepEqual(of.signals('$abc$9$lut$o1'), []);
  assert.deepEqual(of.signals('ram.0.0.RAMB16'), ['u.y']);
  assert.deepEqual([of.signals('lonely'), of.signals('nowhere'), cellSources(null, SYN, 't').signals('x')], [[], [], []]);
});

test('timingPaths: each stage\'s signals, its cells\': a clock-to-out\'s flip-flop\'s, a logic stage\'s LUT\'s (not the flip-flop beside it), a setup\'s both', () => {
  const cell = (conns, dirs) => ({ attributes: {}, connections: conns, port_directions: dirs });
  const netlist = { modules: { t: { attributes: { top: '1' }, cells: {
    ffa: cell({ D: [3], Q: [1] }, { D: 'input', Q: 'output' }), lutb: cell({ I0: [1], O: [2] }, { I0: 'input', O: 'output' }),
    ffb: cell({ D: [2], Q: [3] }, { D: 'input', Q: 'output' }) },
  netnames: { 'u.a': { bits: [1] }, 'u.b_next': { bits: [2] }, 'u.b': { bits: [3] } } } } };
  const cfg = s => s.split(' ').map(x => { const [attr, name, value] = x.split(':'); return { attr, name, value }; });
  const design = { insts: [{ name: 'sa', site: 'S0', cfg: cfg('FFX:ffa:#FF') }, { name: 'sb', site: 'S1', cfg: cfg('F:lutb:#LUT FFX:ffb:#FF') }],
    nets: [{ name: 'u/a', inpins: [{ inst: 'sb', pin: 'F1' }] }] };
  const path = [{ kind: 'clock-to-out', inst: 'sa', pin: 'XQ', delay: 1, arrival: 1 }, { kind: 'net', inst: 'sb', pin: 'F1', delay: 1, arrival: 2 },
    { kind: 'logic', inst: 'sb', pin: 'X', delay: 1, arrival: 3 }, { kind: 'setup', inst: 'sb', pin: 'F1', delay: 0.5, arrival: 3.5 }];
  const sta = { paths: () => [{ clock: 'clk', delay: 3.5, period: 3.5, half: false, path }] };
  const r = timingPaths(sta, design, { netlist, top: 't' });
  assert.deepEqual(r.paths[0].stages.map(s => [s.kind, s.signals]), [['clock-to-out', ['u.a']], ['net', []], ['logic', ['u.b_next']], ['setup', ['u.b_next', 'u.b']]]);
});

test('stageCells: the cells of the pin\'s lane (the Spartan-3E\'s F / X and G / Y, the Spartan-6\'s A … D), else all; an instance that is its cell', () => {
  const cfg = s => s.split(' ').map(x => { const [attr, name, value] = x.split(':'); return { attr, name, value }; });
  const s3e = { name: 's', cfg: cfg('F:lf:#LUT G:lg:#LUT FFX:fx:#FF FFY:fy:#FF XORF:xf: CYINIT::CIN') };
  assert.deepEqual(stageCells(s3e, 'F4'), ['lf', 'fx', 'xf']);
  assert.deepEqual(stageCells(s3e, 'YQ'), ['lg', 'fy']);
  assert.deepEqual(stageCells(s3e, 'COUT'), ['lf', 'lg', 'fx', 'fy', 'xf'], 'no lane: the slice\'s');
  const s6 = { name: 's6', cfg: cfg('A6LUT:la:#LUT B6LUT:lb:#LUT AFF:fa:#FF BFF:fb:#FF') };
  assert.deepEqual(stageCells(s6, 'A3'), ['la', 'fa']);
  assert.deepEqual(stageCells(s6, 'BQ'), ['lb', 'fb']);
  assert.deepEqual(stageCells(s6, 'C'), ['la', 'lb', 'fa', 'fb'], 'no cell in its lane: the slice\'s');
  assert.deepEqual(stageCells({ name: '$mul$t_syn.v_60$98', cfg: [] }, 'P18'), ['$mul$t_syn.v_60$98']);
  assert.deepEqual(stageCells(undefined, 'X'), []);
});

// a -> b -> c on one clock, a -> d into a falling-edge flip-flop (half a period), on a family's arcs (the Spartan-6's way)
function smallGraph() {
  const inst = name => ({ name, type: 'X', site: `S_${name}`, placed: true, cfg: name === 'd' ? [{ attr: 'CLKINV', name: '', value: 'CLK_B' }] : [] });
  const design = { insts: ['a', 'b', 'c', 'd'].map(inst), nets: [
    { name: 'clk', outpins: [{ inst: 'g', pin: 'O' }], inpins: ['a', 'b', 'c', 'd'].map(i => ({ inst: i, pin: 'CLK' })) },
    { name: 'n1', outpins: [{ inst: 'a', pin: 'Q' }], inpins: [{ inst: 'b', pin: 'D' }, { inst: 'd', pin: 'D' }] },
    { name: 'n2', outpins: [{ inst: 'b', pin: 'Q' }], inpins: [{ inst: 'c', pin: 'D' }] }] };
  const arcs = () => ({ comb: [], setup: [['D', 0.3]], clkToOut: [['Q', 1]], input: [], output: [], clock: true });
  return { design, tg: timingGraph(design, { clock: { minScale: 1, hold: 0 } }, { arcs }) };
}

test('analyze().paths: the worst path into each end, slowest first (a path between the clock\'s edges counted twice); n of them', () => {
  const { tg } = smallGraph();
  const conn = new Map(tg.conns.map((c, i) => [`${c.net}>${c.toPin.inst}`, i]));
  const delays = new Array(tg.conns.length);
  delays[conn.get('n1>b')] = 0.5; delays[conn.get('n1>d')] = 0.4; delays[conn.get('n2>c')] = 2;
  const r = tg.analyze(delays);
  const ps = r.paths(10);
  assert.deepEqual(ps.map(p => [p.path.at(-1).inst, +p.delay.toFixed(6), +p.period.toFixed(6), p.half]), [
    ['d', 1.7, 3.4, true], ['c', 3.3, 3.3, false], ['b', 1.8, 1.8, false]]);
  assert.equal(+r.period.toFixed(6), 3.4, 'the worst path is the period\'s');
  assert.deepEqual(ps[1].path.map(s => `${s.inst}.${s.pin} ${s.kind} ${+s.delay.toFixed(6)} ${+s.arrival.toFixed(6)}`), ['b.Q clock-to-out 1 1', 'c.D net 2 3', 'c.D setup 0.3 3.3']);
  assert.equal(r.paths(1).length, 1);
  assert.deepEqual(r.paths(0), []);
});

// two starts into one end through a gate (a: 1 + 0.5 + 1 + ..., e: slower), for the paths between two points
function twoStarts() {
  const design = { insts: ['a', 'e', 'm', 'c'].map(name => ({ name, type: 'X', site: `S_${name}`, placed: true, cfg: [] })), nets: [
    { name: 'clk', outpins: [{ inst: 'g', pin: 'O' }], inpins: ['a', 'e', 'c'].map(i => ({ inst: i, pin: 'CLK' })) },
    { name: 'n1', outpins: [{ inst: 'a', pin: 'Q' }], inpins: [{ inst: 'm', pin: 'A' }] },
    { name: 'n2', outpins: [{ inst: 'e', pin: 'Q' }], inpins: [{ inst: 'm', pin: 'B' }] },
    { name: 'n3', outpins: [{ inst: 'm', pin: 'O' }], inpins: [{ inst: 'c', pin: 'D' }] }] };
  const arcs = i => (i.name === 'm' ? { comb: [['A', 'O', 0.5], ['B', 'O', 0.5]], setup: [], clkToOut: [], input: [], output: [], clock: false }
    : { comb: [], setup: [['D', 0.3]], clkToOut: [['Q', 1]], input: [], output: [], clock: true });
  const tg = timingGraph(design, { clock: { minScale: 1, hold: 0 } }, { arcs });
  const conn = new Map(tg.conns.map((c, i) => [c.net, i]));
  const delays = new Array(tg.conns.length).fill(0);
  delays[conn.get('n1')] = 1; delays[conn.get('n2')] = 2; delays[conn.get('n3')] = 0.7;
  return { design, r: tg.analyze(delays) };
}

test('analyze().paths between two points: from some starts (their own pass), into some ends; none when they do not meet', () => {
  const { r } = twoStarts();
  const at = p => p.map(x => `${x.path[0].inst}->${x.path.at(-1).inst} ${+x.delay.toFixed(6)}`);
  // (into c: e's path is the worst, 1 + 2 + 0.5 + 0.7 + 0.3; from a only: 1 + 1 + 0.5 + 0.7 + 0.3)
  assert.deepEqual(at(r.paths(10)), ['e->c 4.5']);
  assert.deepEqual(at(r.paths(10, { from: x => x.inst === 'a' })), ['a->c 3.5']);
  assert.deepEqual(r.paths(10, { from: x => x.inst === 'a' })[0].path.map(s => `${s.inst}.${s.pin} ${s.kind}`), ['a.Q clock-to-out', 'm.A net', 'm.O logic', 'c.D net', 'c.D setup']);
  assert.deepEqual(at(r.paths(10, { from: x => x.inst === 'e', to: x => x.inst === 'c' })), ['e->c 4.5']);
  assert.deepEqual(r.paths(10, { from: x => x.inst === 'c' }), [], 'c reaches no end');
  assert.deepEqual(r.paths(10, { from: x => x.inst === 'nobody' }), []);
  assert.deepEqual(r.paths(10, { to: x => x.inst === 'a' }), []);
});

test('timingPaths between: the registers (a flip-flop\'s signal, else its instance) and the worst path of each pair; betweenPaths', () => {
  const { design, r } = twoStarts();
  const t = timingPaths(r, design, { between: true });
  assert.deepEqual(t.points, ['a', 'c', 'e']);
  assert.deepEqual(t.pairs.map(p => `${p.from}->${p.to} ${p.delay}`), ['a->c 3.5', 'e->c 4.5']);
  assert.deepEqual(betweenPaths(t, '', 'c').map(p => p.from), ['e', 'a'], 'slowest first');
  assert.deepEqual(betweenPaths(t, 'a').map(p => p.to), ['c']);
  assert.deepEqual(betweenPaths(t, 'a', 'c')[0].stages.map(s => s.inst), ['a', 'm', 'm', 'c', 'c']);
  assert.deepEqual(betweenPaths(t, 'c'), []);
  assert.deepEqual(betweenPaths({ paths: [] }, 'a'), [], 'an older analysis: no pairs');
  assert.equal(pathsText({ paths: betweenPaths(t, 'a') })[0], 'path 1: a -> c (a.Q -> c.D), clock clk: 3.500 ns (no PERIOD constraint)');
  assert.equal(timingPaths(r, design).pairs, undefined, 'only when asked');
});

test('timingPaths: the stages with their sites and nets, the slack against the PERIOD (half of it between the edges); the text; the highlight', () => {
  const { design, tg } = smallGraph();
  const r0 = tg.analyze(tg.conns.map(c => (c.toPin.inst === 'c' ? 2 : 0.5)));
  const r = timingPaths(r0, design, { n: 2, periods: [{ clock: 'clk', port: 'clk', required: 5 }, { port: 'other', required: 1, missing: true }] });
  assert.deepEqual(r.paths.map(p => [p.stages.at(-1).inst, p.required, p.slack, p.half]), [['d', 2.5, 0.7, true], ['c', 5, 1.7, false]]);
  assert.deepEqual(r.paths[1].stages.map(s => [s.kind, s.inst, s.site, s.net ?? null, s.delay, s.arrival, s.sources]), [
    ['clock-to-out', 'b', 'S_b', null, 1, 1, []], ['net', 'c', 'S_c', 'n2', 2, 3, []], ['setup', 'c', 'S_c', null, 0.3, 3.3, []]]);
  assert.deepEqual(pathsText(r), [
    'path 1: a.Q -> d.D, clock clk (between its two edges): 1.800 ns, required 2.500 ns, slack 0.700 ns',
    'path 2: b.Q -> c.D, clock clk: 3.300 ns, required 5.000 ns, slack 1.700 ns']);
  assert.deepEqual(pathsText(r, 1).slice(1), ['  clock-to-out   1.000    1.000  b.Q (S_b)', '  net            2.000    3.000  c.D (S_c), net n2', '  setup          0.300    3.300  c.D (S_c)']);
  assert.deepEqual(pathHighlight(r.paths[1]), { files: {}, insts: ['b', 'c'], sites: ['S_b', 'S_c'], nets: ['n2'] });
  // no PERIOD on the clock: no required time, no slack
  const free = timingPaths(r0, design, { n: 1 });
  assert.deepEqual([free.paths[0].required, free.paths[0].slack], [null, null]);
  assert.match(pathsText(free)[0], /: 1\.800 ns \(no PERIOD constraint\)$/);
  // an analysis without paths (another family's): none
  assert.deepEqual(timingPaths({ clocks: [] }, design).paths, []);
});

// a source line a path goes through: a VHDL process or assignment, a Verilog always block or assignment
const SRC_LINE = /process|<=|always|assign|=/i;

// the open flow's paths.json against its timing report (the critical path's steps, the period), the stages' source lines
async function checkExample(name, srcLine, { allTraced = true } = {}) {
  const ex = example(name);
  const r = await flow({ top: ex.project.top, steps: ['synth', 'translate', 'map', 'par', 'trce'] }, ex.design, ex.sim, exampleUcf(name, { board: 'basys2', variant: '250' }).text);
  assert.ok(r.ok, r.lines.join('\n'));
  const paths = JSON.parse(r.store['open/paths.json']);
  assert.equal(paths.top, ex.project.top);
  assert.equal(paths.paths.length, PATHS);
  const timing = r.store['open/timing.txt'];
  const period = +/^clock \S+: minimum period (\d+\.\d+) ns/m.exec(timing)[1];
  const req = +/^constraint PERIOD (\S+) ns on/m.exec(timing)[1];
  const worst = paths.paths[0];
  assert.equal(worst.period, period, 'the slowest path is the minimum period\'s');
  // its steps are the report's critical path's, as the report writes them
  const steps = timing.split('\n').slice(timing.split('\n').findIndex(l => /^clock \S+: minimum period/.test(l)) + 1).filter(l => /^ {2}\S/.test(l)).slice(0, worst.stages.length);
  assert.deepEqual(worst.stages.map(s => `  ${s.kind.padEnd(12)} ${s.delay.toFixed(3).padStart(7)} ${s.arrival.toFixed(3).padStart(8)}  ${s.inst}.${s.pin}`), steps);
  for (const p of paths.paths) {
    assert.ok(p.period <= period + 1e-9);
    assert.ok(Math.abs(p.stages.reduce((a, s) => a + s.delay, 0) - p.delay) < 0.005, 'the stages add up to the delay');
    assert.ok(Math.abs(p.stages.at(-1).arrival - p.delay) < 0.002);
    assert.equal(p.required, req);
    assert.equal(p.slack, +(req - p.delay).toFixed(3));
    assert.ok(p.stages.every(s => s.site), 'every stage placed');
    assert.ok(p.stages.filter(s => s.kind === 'net').every(s => s.net), 'every net stage names its net');
    assert.ok(p.lines.length, 'the path goes through source lines');
    for (const l of p.lines) {
      const text = ex.design.find(f => f.path === l.file)?.text.split('\n')[l.line - 1];
      assert.match(text ?? '', srcLine, `${l.file}:${l.line} is a process or an assignment`);
    }
  }
  const logic = paths.paths.flatMap(p => p.stages).filter(s => s.kind !== 'net'), traced = logic.filter(s => s.sources.length);
  if (allTraced) for (const s of logic) assert.ok(s.sources.length, `${s.inst}.${s.pin} traced back`);
  return { ...r, logic: logic.length, traced: traced.length };
}

test('the open flow: blinky\'s (VHDL, a Verilog counter) paths.json, the timing report\'s critical path first, every stage back to a process', { timeout: 300000 }, async () => {
  const r = await checkExample('blinky', SRC_LINE);
  assert.deepEqual(r.lines.filter(l => /WARNING/.test(l)), []);
  // (the slowest path: from speed_ctrl's level, the register it reads, into its ticks, the one it writes)
  const worst = JSON.parse(r.store['open/paths.json']).paths[0];
  assert.deepEqual([worst.stages[0].signals, worst.stages.at(-1).signals], [['u_speed.level'], ['u_speed.ticks']]);
  // between two registers: level into ticks is that path; the slowest pair the slowest path; a pair's path from a flip-flop
  // of its register into one of the other; each register into ticks no slower than level
  const t = JSON.parse(r.store['open/paths.json']);
  assert.ok(t.points.includes('u_speed.level') && t.points.includes('u_speed.ticks'));
  const lt = betweenPaths(t, 'u_speed.level', 'u_speed.ticks');
  assert.deepEqual([lt.length, lt[0].delay, lt[0].stages.length], [1, worst.delay, worst.stages.length]);
  assert.equal(Math.max(...t.pairs.map(p => p.period)), worst.period);
  const on = (s, x) => s.signals.includes(x) || s.inst === x;   // (a register, or an instance with no named signal)
  for (const p of t.pairs) assert.ok(on(p.stages[0], p.from) && on(p.stages.at(-1), p.to), `${p.from} -> ${p.to}`);
  assert.ok(betweenPaths(t, '', 'u_speed.ticks').every(p => p.delay <= worst.delay));
  assert.equal(new Set(t.pairs.map(p => `${p.from}>${p.to}`)).size, t.pairs.length, 'one path a pair');
});

test('the open flow: pong\'s (Verilog) paths.json, every path back to an always block or an assignment', { timeout: 300000 }, async () => {
  const r = await checkExample('pong', SRC_LINE, { allTraced: false });
  // (its LUTs whose cone leads to no block within four levels: their stages name their instance only)
  assert.ok(r.traced >= 0.9 * r.logic, `${r.traced} of ${r.logic} stages traced back`);
  assert.deepEqual(r.lines.filter(l => /WARNING/.test(l)), []);
});
