// The MCP server's timing_paths (#3178, #2674: what the interface's Paths panel does): the slowest paths of the Silinx
// toolchain's timing analysis, one path's stages and what Show Path highlights, through the same functions
// (packages/silinx-fpga/src/fpga/timing-paths.js), and the elements of the drawings its lines are generated from
// (core/path-drawing.js: gates' schematic, blinky's ASM chart); its refusals; blinky's paths after run_process timing,
// against get_report's timing report.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-timing-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle, TOOLS } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true); assert.equal(r.text, `${name}: ${message}`); };

const stage = (kind, inst, pin, delay, arrival, extra = {}) => ({ kind, inst, pin, site: `S_${inst}`, delay, arrival, sources: [], ...extra });
const PATHS = { top: 'top', paths: [
  { clock: 'clk', port: 'clk', required: 20, delay: 3.3, period: 3.3, half: false, slack: 16.7, lines: [{ file: 'src/a.vhd', line: 12 }, { file: 'src/b.v', line: 4 }],
    stages: [stage('clock-to-out', 'a', 'XQ', 1, 1, { sources: [{ file: 'src/a.vhd', line: 12, block: 'process_12' }] }), stage('net', 'b', 'F1', 2, 3, { net: 'n1' }),
      stage('setup', 'b', 'F1', 0.3, 3.3, { sources: [{ file: 'src/b.v', line: 4, block: 'always_4' }] })] },
  { clock: 'clk', port: null, required: null, delay: 1.5, period: 1.5, half: false, slack: null, lines: [],
    stages: [stage('clock-to-out', 'c', 'YQ', 1, 1), stage('net', 'd', 'BY', 0.2, 1.2, { net: 'n2' }), stage('setup', 'd', 'BY', 0.3, 1.5)] }] };

test('timing_paths: listed with the read-only tools; its schema', () => {
  const t = TOOLS.find(x => x.name === 'timing_paths');
  assert.equal(t.annotations.readOnlyHint, true);
  assert.deepEqual(Object.keys(t.inputSchema.properties), ['project', 'count', 'path', 'from', 'to']);
  assert.deepEqual(t.inputSchema.required, ['project']);
});

test('timing_paths: the list, one path\'s stages and highlight, count; none before a timing run; the refusals', async () => {
  await ok('new_project_from_example', { name: 't1', example: 'gates' });
  const none = await ok('timing_paths', { project: 't1' });
  assert.equal(none.text, 'No timing paths for \'t1\': run_process timing first (the Silinx toolchain\'s timing analysis).');
  assert.deepEqual(none.data, { project: 't1', toolchain: 'silinx', available: false });
  fs.mkdirSync(path.join(P.projectDir('t1'), 'build', 'open'), { recursive: true });
  fs.writeFileSync(path.join(P.projectDir('t1'), 'build', 'open', 'paths.json'), JSON.stringify(PATHS));
  const list = await ok('timing_paths', { project: 't1' });
  assert.equal(list.text, [
    'path 1: a.XQ -> b.F1, clock clk: 3.300 ns, required 20.000 ns, slack 16.700 ns',
    'path 2: c.YQ -> d.BY, clock clk: 1.500 ns (no PERIOD constraint)'].join('\n'));
  assert.deepEqual(list.data.paths.map(p => [p.from, p.to, p.slack, p.lines.length]), [['a.XQ', 'b.F1', 16.7, 2], ['c.YQ', 'd.BY', null, 0]]);
  assert.equal((await ok('timing_paths', { project: 't1', count: 1 })).data.paths.length, 1);
  const one = await ok('timing_paths', { project: 't1', path: 1 });
  assert.equal(one.text, [
    'path 1: a.XQ -> b.F1, clock clk: 3.300 ns, required 20.000 ns, slack 16.700 ns',
    '  clock-to-out   1.000    1.000  a.XQ (S_a)  <- src/a.vhd:12',
    '  net            2.000    3.000  b.F1 (S_b), net n1',
    '  setup          0.300    3.300  b.F1 (S_b)  <- src/b.v:4'].join('\n'));
  assert.equal(one.data.path.number, 1);
  assert.deepEqual(one.data.highlight, { files: { 'src/a.vhd': [12], 'src/b.v': [4] }, insts: ['a', 'b'], sites: ['S_a', 'S_b'], nets: ['n1'], drawings: {} });
  await fails('timing_paths', { project: 't1', path: 3 }, 'path: from 1 to 2');
  await fails('timing_paths', { project: 't1', path: 0 }, 'path: from 1 to 2');
  await fails('timing_paths', { project: 't1', count: 0 }, 'count: a whole number from 1');
  // a path through the module generated from gates' schematic: its wire and the symbol that drives it, as
  // core/path-drawing.js finds them (by the net p1, in the module of src/gates.vhd); a drawing none of whose names is on it
  const { drawingPath, pathNames } = await import('../core/path-drawing.js');
  const SCH_PATH = { ...PATHS.paths[0], lines: [{ file: 'src/gates.vhd', line: 44 }], stages: [stage('clock-to-out', 'a', 'XQ', 1, 1),
    stage('net', 'b', 'F1', 2, 3, { net: 'p1' }), stage('setup', 'b', 'F1', 0.3, 3.3, { sources: [{ file: 'src/gates.vhd', line: 44, block: 'assign_44' }] })] };
  fs.writeFileSync(path.join(P.projectDir('t1'), 'build', 'open', 'paths.json'), JSON.stringify({ top: 'gates', paths: [SCH_PATH, { ...SCH_PATH, stages: SCH_PATH.stages.map(x => (x.net ? { ...x, net: 'n7' } : x)) }] }));
  const sch = await ok('timing_paths', { project: 't1', path: 1 });
  const want = drawingPath('sch', JSON.parse(fs.readFileSync(path.join(P.projectDir('t1'), 'src', 'gates.sch.json'), 'utf8')), pathNames(SCH_PATH, 'src/gates.vhd'));
  assert.deepEqual(want.map(x => `${x.type} ${x.label}`), ['sym and_p1', 'wire p1']);
  assert.deepEqual(sch.data.highlight.drawings, { 'src/gates.sch.json': want });
  assert.equal(sch.text.split('\n').at(-1), '  in src/gates.sch.json: symbol and_p1; wire p1');
  assert.equal((await ok('timing_paths', { project: 't1', path: 2 })).text.split('\n').at(-1), '  in src/gates.sch.json: none of its elements by name');
  // between two registers: the pairs' worst paths from one and / or into one, by its name or its last part
  const pair = (from, to, delay) => ({ ...PATHS.paths[0], from, to, delay, period: delay, slack: +(20 - delay).toFixed(3) });
  const PAIRS = { top: 'top', paths: PATHS.paths, points: ['u_a.cnt', 'u_a.q', 'u_b.cnt'],
    pairs: [pair('u_a.cnt', 'u_a.q', 3.3), pair('u_a.cnt', 'u_b.cnt', 2.5), pair('u_b.cnt', 'u_a.q', 2.9)] };
  fs.writeFileSync(path.join(P.projectDir('t1'), 'build', 'open', 'paths.json'), JSON.stringify(PAIRS));
  const fromA = await ok('timing_paths', { project: 't1', from: 'u_a.cnt' });
  assert.deepEqual(fromA.data.paths.map(p => [p.fromRegister, p.toRegister, p.delay, p.from]), [['u_a.cnt', 'u_a.q', 3.3, 'a.XQ'], ['u_a.cnt', 'u_b.cnt', 2.5, 'a.XQ']]);
  assert.deepEqual([fromA.data.from, fromA.data.to, fromA.data.registers], ['u_a.cnt', undefined, PAIRS.points]);
  assert.equal(fromA.text.split('\n')[0], 'path 1: u_a.cnt -> u_a.q (a.XQ -> b.F1), clock clk: 3.300 ns, required 20.000 ns, slack 16.700 ns');
  assert.deepEqual((await ok('timing_paths', { project: 't1', to: 'q' })).data.paths.map(p => p.fromRegister), ['u_a.cnt', 'u_b.cnt'], 'into u_a.q, by its last part; slowest first');
  const both = await ok('timing_paths', { project: 't1', from: 'u_b.cnt', to: 'u_a.q', path: 1 });
  assert.deepEqual([both.data.path.number, both.data.path.from, both.data.path.to, both.data.path.delay], [1, 'u_b.cnt', 'u_a.q', 2.9]);
  assert.equal((await ok('timing_paths', { project: 't1', from: 'u_b.cnt', to: 'u_b.cnt' })).text, 'No path from u_b.cnt to u_b.cnt in \'t1\'.');
  await fails('timing_paths', { project: 't1', from: 'u_b.cnt', to: 'u_b.cnt', path: 1 }, 'path: no path from u_b.cnt to u_b.cnt');
  await fails('timing_paths', { project: 't1', from: 'cnt' }, 'from: \'cnt\' is several registers: u_a.cnt, u_b.cnt');
  await fails('timing_paths', { project: 't1', to: 'nope' }, 'to: no register \'nope\' (the registers: u_a.cnt, u_a.q, u_b.cnt)');
  await fails('timing_paths', { project: 't1', from: 'u_a.cnt', path: 3 }, 'path: from 1 to 2');
  // (the slowest paths as before when neither is given)
  assert.equal((await ok('timing_paths', { project: 't1', from: '' })).data.paths.length, 2);
  // an older analysis: no registers
  fs.writeFileSync(path.join(P.projectDir('t1'), 'build', 'open', 'paths.json'), JSON.stringify(PATHS));
  await fails('timing_paths', { project: 't1', from: 'u_a.cnt' }, 'from: the timing paths of \'t1\' name no registers (an older analysis): run_process timing again');
  // no path to time (a design with no two flip-flops on a clock)
  fs.writeFileSync(path.join(P.projectDir('t1'), 'build', 'open', 'paths.json'), JSON.stringify({ top: 'top', paths: [] }));
  assert.equal((await ok('timing_paths', { project: 't1' })).text, 'No path between two flip-flops of a clock to time in \'t1\'.');
  await fails('timing_paths', { project: 't1', path: 1 }, 'path: \'t1\' has no path between two flip-flops to time');
  assert.equal((await call('timing_paths', { project: 'nope' })).isError, true);
});

test('timing_paths on blinky after run_process timing: the timing report\'s critical path first, every path back to its sources', { timeout: 300000 }, async () => {
  await ok('new_project_from_example', { name: 'b1', example: 'blinky' });
  const run = await ok('run_process', { project: 'b1', process: 'timing', toolchain: 'silinx' });
  assert.deepEqual(run.data.warnings, []);
  const report = (await ok('get_report', { project: 'b1', report: 'timing' })).text;
  const period = +/^clock \S+: minimum period (\d+\.\d+) ns/m.exec(report)[1];
  const list = await ok('timing_paths', { project: 'b1', count: 20 });
  assert.equal(list.data.paths.length, 20);
  assert.equal(list.data.paths[0].period, period);
  assert.ok(list.data.paths.every(p => p.required === 20 && p.lines.length && p.slack === +(20 - p.delay).toFixed(3)));
  const one = await ok('timing_paths', { project: 'b1', path: 1 });
  const crit = report.split('\n').filter(l => /^ {2}(clock-to-out|net|logic|setup) /.test(l)).slice(0, one.data.path.stages.length);
  assert.deepEqual(one.text.split('\n').slice(1, 1 + one.data.path.stages.length).map(l => l.replace(/ \(\S+\)(, net \S+)?( {2}<- .*)?$/, '')), crit);
  assert.ok(Object.keys(one.data.highlight.files).every(f => fs.existsSync(path.join(P.projectDir('b1'), f))), 'the highlighted files are the project\'s');
  assert.ok(one.data.highlight.nets.length && one.data.highlight.sites.length);
  // (through speed_ctrl, generated from its ASM chart: the boxes of level and ticks, the comparison's among them)
  const asm = one.data.highlight.drawings['src/speed_ctrl.asm.json'];
  assert.deepEqual(Object.keys(one.data.highlight.drawings), ['src/speed_ctrl.asm.json']);
  assert.ok(asm.some(x => x.type === 'node' && x.label === 'ticks >= (1 << level) - 1'), JSON.stringify(asm));
  assert.match(one.text, /^ {2}in src\/speed_ctrl\.asm\.json: box level != 0; .*box ticks >= \(1 << level\) - 1; /m);
  // between two of its registers: speed_ctrl's level into its ticks, the slowest path's (the same delay)
  assert.ok(list.data.registers.includes('u_speed.level') && list.data.registers.includes('u_speed.ticks'));
  const lt = await ok('timing_paths', { project: 'b1', from: 'level', to: 'ticks' });
  assert.deepEqual(lt.data.paths.map(p => [p.fromRegister, p.toRegister]), [['u_speed.level', 'u_speed.ticks']]);
  assert.equal(lt.data.paths[0].delay, list.data.paths[0].delay);
  // (each register's worst path into ticks no slower than the slowest into it)
  const into = await ok('timing_paths', { project: 'b1', to: 'u_speed.ticks', count: 100 });
  assert.ok(into.data.paths.length > 1 && into.data.paths.every(p => p.toRegister === 'u_speed.ticks' && p.delay <= lt.data.paths[0].delay));
});

// Xilinx ISE's paths (#3178): the last run ISE's (its synthesis report there), its trce report read (blinky's, ISE 14.7's:
// test/fixtures/trce), each stage back to the project's HDL by XST's names; the drawings; no paths between two registers
test('timing_paths after an ISE run: trce\'s paths, back to the project\'s processes and its ASM chart; no registers to choose', async () => {
  await ok('new_project_from_example', { name: 'i1', example: 'blinky' });
  const build = path.join(P.projectDir('i1'), 'build');
  assert.equal((await ok('timing_paths', { project: 'i1' })).data.toolchain, 'silinx', 'no run yet: the Silinx toolchain\'s, none');
  fs.mkdirSync(build, { recursive: true });
  fs.writeFileSync(path.join(build, 'top.syr'), 'Release 14.7 - xst P.20131013 (lin64)\n');
  const none = await ok('timing_paths', { project: 'i1' });
  assert.deepEqual([none.text, none.data], ['No timing paths for \'i1\': run_process timing first (Xilinx ISE\'s trce).', { project: 'i1', toolchain: 'ise', available: false }]);
  const twr = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'trce', 'blinky-ise-paths.twr.txt'), 'utf8');
  fs.writeFileSync(path.join(build, 'top.twr'), twr);
  const list = await ok('timing_paths', { project: 'i1', count: 20 });
  assert.equal(list.data.toolchain, 'ise');
  assert.equal(list.data.paths.length, 20);
  assert.equal(list.data.paths[0].period, +/Minimum period is +([\d.]+)ns/.exec(twr)[1]);
  assert.ok(list.data.paths.every(p => p.lines.length && p.fromRegister && p.toRegister), 'every path back to the HDL');
  assert.match(list.text.split('\n')[0], /^path 1: \S+ -> \S+ \(SLICE_\w+\.\w+ -> SLICE_\w+\.\w+\), clock clk_BUFGP: [\d.]+ ns, required 20\.000 ns, slack [\d.]+ ns$/);
  // a path through speed_ctrl (its HDL generated from its ASM chart): its boxes
  const n = list.data.paths.findIndex(p => p.lines.some(l => l.file === 'src/speed_ctrl.vhd'));
  assert.ok(n >= 0);
  const one = await ok('timing_paths', { project: 'i1', path: n + 1 });
  assert.ok(one.data.highlight.drawings['src/speed_ctrl.asm.json'].length);
  assert.match(one.text, /^ {2}in src\/speed_ctrl\.asm\.json: box /m);
  assert.ok(Object.keys(one.data.highlight.files).every(f => fs.existsSync(path.join(P.projectDir('i1'), f))));
  await fails('timing_paths', { project: 'i1', from: 'level' }, 'from: Xilinx ISE\'s timing paths name no registers: the paths between two are the Silinx toolchain\'s (run_process timing with toolchain silinx)');
  // both analyses there: the newer one's
  fs.mkdirSync(path.join(build, 'open'), { recursive: true });
  fs.writeFileSync(path.join(build, 'open', 'paths.json'), JSON.stringify(PATHS));
  const t = Date.now() / 1000;
  fs.utimesSync(path.join(build, 'open', 'paths.json'), t - 60, t - 60);
  assert.equal((await ok('timing_paths', { project: 'i1' })).data.toolchain, 'ise');
  fs.utimesSync(path.join(build, 'top.twr'), t - 120, t - 120);
  const open = await ok('timing_paths', { project: 'i1' });
  assert.deepEqual([open.data.toolchain, open.data.paths.length], ['silinx', 2]);
});

// AMD Vivado's paths (#3178): its report_timing_summary (blinky's, Vivado 2025.2's: test/fixtures/vivado), the newest
// analysis; each stage back to the project's HDL by Vivado's names; none before its run; no registers to choose
test('timing_paths after a Vivado run: report_timing_summary\'s paths, back to the project\'s processes; the newest analysis', async () => {
  await ok('new_project_from_example', { name: 'v1', example: 'blinky' });
  const build = path.join(P.projectDir('v1'), 'build');
  fs.mkdirSync(build, { recursive: true });
  fs.writeFileSync(path.join(build, 'run.tcl'), '# Vivado\n');
  const none = await ok('timing_paths', { project: 'v1' });
  assert.deepEqual([none.text, none.data.toolchain], ['No timing paths for \'v1\': run_process timing first (AMD Vivado\'s report_timing_summary).', 'vivado']);
  const rpt = fs.readFileSync(path.join(import.meta.dirname, 'fixtures', 'vivado', 'blinky-timing.rpt.txt'), 'utf8');
  fs.writeFileSync(path.join(build, 'top_timing.rpt'), rpt);
  const list = await ok('timing_paths', { project: 'v1', count: 20 });
  assert.equal(list.data.toolchain, 'vivado');
  assert.ok(list.data.paths.length >= 3 && list.data.paths.every(p => p.lines.length));
  assert.equal(list.data.paths[0].slack, Math.min(...list.data.paths.map(p => p.slack)), 'the slowest first');
  assert.match(list.text.split('\n')[0], /^path 1: u_speed\/step_reg_reg -> u_count\/thousands_reg\[\d\] \(u_speed\/step_reg_reg\.Q -> u_count\/thousands_reg\[\d\]\.R\), clock clk: [\d.]+ ns, required 10\.000 ns, slack 5\.071 ns$/);
  const one = await ok('timing_paths', { project: 'v1', path: 1 });
  assert.deepEqual(Object.keys(one.data.highlight.files).sort(), ['src/bcd_counter.vhd', 'src/speed_ctrl.vhd']);
  assert.ok(one.data.highlight.drawings['src/speed_ctrl.asm.json'].length, 'speed_ctrl\'s ASM chart: step');
  await fails('timing_paths', { project: 'v1', to: 'tens' }, 'to: AMD Vivado\'s timing paths name no registers: the paths between two are the Silinx toolchain\'s (run_process timing with toolchain silinx)');
  // (the Silinx toolchain's paths written after it: theirs)
  fs.mkdirSync(path.join(build, 'open'), { recursive: true });
  fs.writeFileSync(path.join(build, 'open', 'paths.json'), JSON.stringify(PATHS));
  const t = Date.now() / 1000;
  fs.utimesSync(path.join(build, 'top_timing.rpt'), t - 60, t - 60);
  assert.equal((await ok('timing_paths', { project: 'v1' })).data.toolchain, 'silinx');
});

// #3178 with the logic analyzer (#3176): the paths read the netlist the run routed, its wrapper's (silinx_capture_top,
// the design at dut), not the build folder's netlist of the project's top, an earlier run's without the capture, which
// matched no cell of the routed design (every path "could not be traced back to its source lines")
test('timing_paths after a timing run with a capture: every path back to the clock example\'s source lines', { timeout: 600000 }, async () => {
  await ok('new_project_from_example', { name: 'c1', example: 'clock' });
  await ok('run_process', { project: 'c1', process: 'timing', toolchain: 'silinx' });
  await ok('capture_settings', { project: 'c1', probes: ['led'], clock: 'clk', depth: 1024, pre: 0 });
  const run = await ok('run_process', { project: 'c1', process: 'timing', toolchain: 'silinx' });
  assert.deepEqual(run.data.warnings, []);
  const build = path.join(P.projectDir('c1'), 'build', 'open');
  assert.ok(fs.existsSync(path.join(build, 'silinx_capture_top.json')) && fs.existsSync(path.join(build, 'digital_clock.json')), 'both netlists there');
  const list = await ok('timing_paths', { project: 'c1', count: 20 });
  assert.equal(list.data.paths.length, 20);
  for (const p of list.data.paths) assert.ok(p.lines.length, `${p.to} traced back`);
  assert.ok(list.data.paths.some(p => p.lines.some(l => /^src\//.test(l.file))), 'the design\'s own files');
});
