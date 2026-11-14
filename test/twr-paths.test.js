// ISE's timing paths (#3178, core/twr-paths.js) and where a signal is assigned (core/hdl-drivers.js): trce's verbose
// report (ISE 14.7 on blinky: test/fixtures/trce) read path by path, stage by stage, its logic and route against the
// report's own totals and the quality comparison's reading of it (test/designs-corpus/compare-lib.mjs); several paths,
// a falling edge, an estimated delay, a report with no detailed path; XST's names back to the processes of blinky's
// VHDL and Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseTwrPaths, twrSignal, twrSources } from '../core/twr-paths.js';
import { signalDrivers } from '../core/hdl-drivers.js';
import { compile } from '../core/compile.js';
import { trcePaths } from './designs-corpus/compare-lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const TWR = fs.readFileSync(path.join(ROOT, 'test/fixtures/trce/blinky-ise.twr.txt'), 'utf8');
function blinky() {
  const dir = path.join(ROOT, 'examples/blinky'), pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  const sources = pj.files.filter(f => f.role === 'design' && /\.(vhd|v)$/.test(f.path))
    .map(f => ({ path: f.path, lang: /\.v$/.test(f.path) ? 'verilog' : 'vhdl', text: fs.readFileSync(path.join(dir, f.path), 'utf8') }));
  return { lib: compile(sources), top: pj.top };
}

test('twrSignal: XST\'s name as a signal, its hierarchy with dots, its bit dropped', () => {
  assert.equal(twrSignal('u_pre/cnt<1>'), 'u_pre.cnt');
  assert.equal(twrSignal('u_pre/cnt_1'), 'u_pre.cnt_1');
  assert.equal(twrSignal('clk_BUFGP'), 'clk_BUFGP');
});

test('parseTwrPaths: blinky\'s critical path from ISE\'s trce, stage by stage, against the report\'s totals and the quality comparison', () => {
  const { paths } = parseTwrPaths(TWR);
  assert.equal(paths.length, 1);
  const p = paths[0];
  assert.deepEqual([p.clock, p.constraint, p.required, p.delay, p.period, p.half, p.slack, p.from, p.to], ['clk_BUFGP', 'TS_clk', 20, 6.701, 6.701, false, 13.299, 'u_pre/cnt_1', 'u_pre/cnt_1']);
  assert.deepEqual(p.stages.map(s => `${s.kind} ${s.type} ${s.site}.${s.pin} ${s.delay} ${s.arrival}`), [
    'clock-to-out Tcko SLICE_X29Y34.YQ 0.587 0.587', 'net net SLICE_X31Y38.F4 0.964 1.551', 'logic Topcyf SLICE_X31Y38.COUT 1.162 2.713',
    'net net SLICE_X31Y39.CIN 0 2.713', 'logic Tcinxb SLICE_X31Y39.XB 0.404 3.117', 'net net SLICE_X28Y34.F1 0.724 3.841',
    'logic Tilo SLICE_X28Y34.X 0.759 4.6', 'net net SLICE_X29Y34.SR 1.191 5.791', 'setup Tsrck SLICE_X29Y34.CLK 0.91 6.701']);
  // (the report's "Total 6.701ns (3.822ns logic, 2.879ns route)", as compare-lib reads it)
  const sum = k => +p.stages.filter(s => (s.kind === 'net') === k).reduce((a, s) => a + s.delay, 0).toFixed(3);
  const ref = trcePaths(TWR)[0];
  assert.deepEqual([sum(false), sum(true), p.stages.at(-1).arrival], [ref.path.logic, ref.path.route, ref.ns]);
  assert.deepEqual([p.stages[1].net, p.stages[1].signals], ['u_pre/cnt<1>', ['u_pre.cnt']]);
  // (a register's flip-flop: its bit's name and its signal's)
  assert.deepEqual(p.stages[0].signals, ['u_pre.cnt', 'u_pre.cnt_1']);
  assert.deepEqual(p.stages[2].resources, ['u_pre/cnt_cmp_eq0000_wg_cy<3>', 'u_pre/cnt_cmp_eq0000_wg_lut<2>', 'u_pre/cnt_cmp_eq0000_wg_cy<2>', 'u_pre/cnt_cmp_eq0000_wg_cy<3>']);
  assert.deepEqual([p.lines, p.stages.every(s => Array.isArray(s.sources))], [[], true]);
});

test('parseTwrPaths: several paths slowest first, a falling edge (half the period), an estimated delay; none detailed; nothing', () => {
  const block = TWR.slice(TWR.indexOf('Slack:'), TWR.indexOf('(…)', TWR.indexOf('Slack:')));
  const slower = block.replace('13.299ns', '12.000ns').replace('6.701ns (Levels', '8.000ns (Levels').replace('Tsrck                 0.910', 'Tsrck               e 2.209')
    .replace('u_pre/cnt_1 (FF)\n  Destination', 'u_pre/cnt_2 (FF)\n  Destination');
  const falling = block.replace('13.299ns', '6.000ns').replace('6.701ns (Levels', '4.000ns (Levels').replace('rising at 20.000ns', 'falling at 10.000ns').replace('Requirement:          20.000ns', 'Requirement:          10.000ns');
  const r = parseTwrPaths(`Timing constraint: TS_clk = PERIOD TIMEGRP "clk" 20 ns HIGH 50%;\n${block}\n${slower}\n${falling}`);
  assert.deepEqual(r.paths.map(p => [p.from, p.delay, p.period, p.half, p.required, p.slack]), [
    ['u_pre/cnt_2', 8, 8, false, 20, 12], ['u_pre/cnt_1', 4, 8, true, 10, 6], ['u_pre/cnt_1', 6.701, 6.701, false, 20, 13.299]]);
  assert.deepEqual(r.paths[0].stages.at(-1), { ...r.paths[0].stages.at(-1), kind: 'setup', delay: 2.209 }, 'the estimate read');
  assert.equal(r.paths[0].stages.at(-1).arrival, 8);
  // ISE's own flow's report of a design (test/fixtures/ise: its path's header only, no data path): none
  assert.deepEqual(parseTwrPaths(fs.readFileSync(path.join(ROOT, 'test/fixtures/ise/top.twr'), 'utf8')).paths, []);
  assert.deepEqual(parseTwrPaths('').paths, []);
  assert.deepEqual(parseTwrPaths(null).paths, []);
});

test('signalDrivers: a hierarchical name to the processes and assignments that drive it, in VHDL and Verilog; none', () => {
  const { lib, top } = blinky();
  const where = signalDrivers(lib, top);
  const at = n => where(n).map(x => `${x.file}:${x.line} ${x.block}`);
  assert.deepEqual(at('u_pre.cnt'), ['src/counter.v:19 process_19'], 'Verilog: an always block');
  assert.deepEqual(at('u_speed.level'), ['src/speed_ctrl.vhd:99 state_register'], 'VHDL: a labelled process');
  assert.deepEqual(at('U_SPEED.Level'), at('u_speed.level'), 'VHDL\'s names in any case');
  assert.deepEqual(at('step'), ['src/top.vhd:88 assign_88'], 'the top\'s concurrent assignment');
  // (each line its text: the process or the assignment)
  for (const n of ['u_pre.cnt', 'u_speed.level', 'step']) for (const x of where(n)) {
    assert.match(fs.readFileSync(path.join(ROOT, 'examples/blinky', x.file), 'utf8').split('\n')[x.line - 1], /process|always|<=/, n);
  }
  assert.deepEqual([at('u_pre.cnt_1'), at('nobody.x'), at('u_pre.nothing'), at('')], [[], [], [], []]);
  assert.deepEqual(signalDrivers(null, 'top')('x'), []);
});

test('twrSources: blinky\'s ISE path back to its prescaler\'s always block, through XST\'s names', () => {
  const { lib, top } = blinky();
  const r = twrSources(parseTwrPaths(TWR), signalDrivers(lib, top));
  const p = r.paths[0];
  assert.deepEqual(p.lines, [{ file: 'src/counter.v', line: 19 }]);
  // (its logic too: XST's names made from cnt, cnt_cmp_eq0000 and cnt_or0000)
  assert.deepEqual(p.stages.filter(s => s.sources.length).map(s => s.kind), ['clock-to-out', 'logic', 'logic', 'logic', 'setup']);
  assert.ok(p.stages.filter(s => s.kind === 'net').every(s => !s.sources.length));
});

// ISE 14.7's own reports of three examples (trce -v 1 -n 20, as the ISE flow runs it: the worst path into each of 20
// ends; test/fixtures/trce/*-ise-paths.twr.txt, their setup paths): every path's stages add up to its delay, the
// slowest is the report's minimum period, every logic stage reaches a source line of the example, and a path through
// traffic's state machine (XST's state_reg_FSM_FFd…) marks the state diagram's states
const example = (name) => {
  const dir = path.join(ROOT, 'examples', name), pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  const sources = pj.files.filter(f => f.role === 'design' && /\.(vhd|v)$/.test(f.path))
    .map(f => ({ path: f.path, lang: /\.v$/.test(f.path) ? 'verilog' : 'vhdl', text: fs.readFileSync(path.join(dir, f.path), 'utf8') }));
  return { dir, lib: compile(sources), top: pj.top, text: fs.readFileSync(path.join(ROOT, `test/fixtures/trce/${name}-ise-paths.twr.txt`), 'utf8') };
};
for (const name of ['blinky', 'traffic', 'pong']) {
  test(`ISE's paths of ${name}: 20, the slowest the minimum period, every stage back to a process or an assignment of the example`, () => {
    const ex = example(name);
    const r = twrSources(parseTwrPaths(ex.text), signalDrivers(ex.lib, ex.top));
    assert.equal(r.paths.length, 20);
    assert.equal(r.paths[0].period, +/Minimum period is +([\d.]+)ns/.exec(ex.text)[1]);
    // (an end: a flip-flop's pin, its data, set / reset or clock enable)
    assert.equal(new Set(r.paths.map(p => `${p.to} ${p.end}`)).size, 20, 'one path into each end');
    for (const p of r.paths) {
      assert.ok(Math.abs(p.stages.reduce((a, s) => a + s.delay, 0) - p.delay) < 0.002, 'the stages add up to the delay');
      // (trce's slack: the requirement less the delay, the clock's skew and uncertainty)
      assert.ok(Math.abs(p.slack - (p.required - p.delay)) < 0.1, `${p.slack} ${p.required} ${p.delay}`);
      assert.deepEqual([p.stages[0].kind, p.stages.at(-1).kind], ['clock-to-out', 'setup']);
      for (const s of p.stages.filter(x => x.kind !== 'net')) assert.ok(s.sources.length, `${name}: ${s.site}.${s.pin} (${s.resources.join(' ')}) traced back`);
      for (const l of p.lines) assert.match(fs.readFileSync(path.join(ex.dir, l.file), 'utf8').split('\n')[l.line - 1], /process|always|<=|assign|=/, `${l.file}:${l.line}`);
    }
  });
}

test('xstBase: the signal XST made a name from; none for the signal\'s own name', async () => {
  const { xstBase } = await import('../core/twr-paths.js');
  assert.equal(xstBase('u_timer/last_cmp_eq0000_wg_lut<3>'), 'u_timer.last');
  assert.equal(xstBase('Mcompar_period_cmp_gt0000_cy<9>'), 'period');
  assert.equal(xstBase('u_count/ones_or00001'), 'u_count.ones');
  assert.equal(xstBase('u_fsm/state_reg_FSM_FFd3'), 'u_fsm.state_reg');
  assert.equal(xstBase('u_timer/seconds_not0001'), 'u_timer.seconds');
  assert.equal(xstBase('u_pre/cnt<1>'), null);
  assert.equal(xstBase('N88'), null);
});

test('ISE\'s paths in the drawings: traffic\'s state machine through XST\'s state flip-flops, its state diagram\'s states', async () => {
  const { pathNames, drawingPath } = await import('../core/path-drawing.js');
  const ex = example('traffic');
  const r = twrSources(parseTwrPaths(ex.text), signalDrivers(ex.lib, ex.top));
  const fsm = JSON.parse(fs.readFileSync(path.join(ex.dir, 'src/traffic.fsm.json'), 'utf8'));
  const through = r.paths.filter(p => p.lines.some(l => l.file === 'src/traffic.vhd'));
  assert.ok(through.length);
  for (const p of through) assert.deepEqual(drawingPath('fsm', fsm, pathNames(p, 'src/traffic.vhd')).filter(x => x.type === 'state').map(x => x.id), fsm.states.map(s => s.id));
});
