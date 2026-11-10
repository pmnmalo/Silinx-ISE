// The MCP server's timing_paths (#3178, #2674: what the interface's Paths panel does): the slowest paths of the Silinx
// toolchain's timing analysis, one path's stages and what Show Path highlights, through the same functions
// (packages/silinx-fpga/src/fpga/timing-paths.js); its refusals; blinky's paths after run_process timing, against
// get_report's timing report.
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
  assert.deepEqual(Object.keys(t.inputSchema.properties), ['project', 'count', 'path']);
  assert.deepEqual(t.inputSchema.required, ['project']);
});

test('timing_paths: the list, one path\'s stages and highlight, count; none before a timing run; the refusals', async () => {
  await ok('new_project_from_example', { name: 't1', example: 'gates' });
  const none = await ok('timing_paths', { project: 't1' });
  assert.equal(none.text, 'No timing paths for \'t1\': run_process timing first (the Silinx toolchain\'s timing analysis).');
  assert.deepEqual(none.data, { project: 't1', available: false });
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
  assert.deepEqual(one.data.highlight, { files: { 'src/a.vhd': [12], 'src/b.v': [4] }, insts: ['a', 'b'], sites: ['S_a', 'S_b'], nets: ['n1'] });
  await fails('timing_paths', { project: 't1', path: 3 }, 'path: from 1 to 2');
  await fails('timing_paths', { project: 't1', path: 0 }, 'path: from 1 to 2');
  await fails('timing_paths', { project: 't1', count: 0 }, 'count: a whole number from 1');
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
  assert.deepEqual(one.text.split('\n').slice(1).map(l => l.replace(/ \(\S+\)(, net \S+)?( {2}<- .*)?$/, '')), crit);
  assert.ok(Object.keys(one.data.highlight.files).every(f => fs.existsSync(path.join(P.projectDir('b1'), f))), 'the highlighted files are the project\'s');
  assert.ok(one.data.highlight.nets.length && one.data.highlight.sites.length);
});
