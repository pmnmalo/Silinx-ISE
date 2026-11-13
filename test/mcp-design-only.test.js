// The MCP server in a design and simulation project (#3780, server/mcp-design-only.js, core/project-kind.js): new_project
// with design_only (no board, no device, no constraints), project_info without HDL, the flow's and the HDL's tools refused
// with the interface's messages, the drawings, the Test Bench Wizard and the simulation as in any project, and
// set_design_properties both ways (a board makes it an FPGA project; design_only, refused when it has HDL of its own).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, ROOT } from './server-helpers.js';

let tmp;
before(async () => {
  tmp = await scratchEnv('silinx-mcp-design-only-');
  fs.mkdirSync(path.join(tmp, 'exchange'));
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'exchange');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };
const FSM = fs.readFileSync(path.join(ROOT, 'examples/traffic/src/traffic.fsm.json'), 'utf8');
const HDL = path => `${path}: a design and simulation project has drawings only: choose a board in Design Properties to add HDL sources`;
const HIDDEN = path => `${path}: a design and simulation project does not show its HDL (its drawings are its sources)`;
const FLOW = name => `the project '${name}' is a design and simulation project (no FPGA): choose a board in Design Properties to implement, emulate or program it`;

/** A design project with the traffic example's state diagram as its top. */
async function designProject(name) {
  await ok('new_project', { name, design_only: true });
  await ok('write_file', { project: name, path: 'src/traffic.fsm.json', text: FSM });
  await ok('set_top', { project: name, top: 'traffic' });
}

test('new_project design_only: no board, no device, no constraints; refused with a board', async () => {
  const r = await ok('new_project', { name: 'd0', design_only: true });
  assert.equal(r.text, 'Empty design and simulation project \'d0\' made (no FPGA). Add its drawings with new_source, then set_top.');
  assert.deepEqual(r.data, { project: 'd0', kind: 'design', board: null, device: null, trusted: false });
  const pj = await P.readProject('d0');
  assert.deepEqual([pj.kind, pj.board, pj.constraints], ['design', null, null]);
  assert.equal(fs.existsSync(path.join(P.projectDir('d0'), 'constraints')), false, 'no constraints folder');
  await fails('new_project', { name: 'd00', design_only: true, board: 'basys2' }, 'a design and simulation project has no board: give design_only or a board, not both');
  // (an FPGA project as before)
  const f = await ok('new_project', { name: 'f0' });
  assert.equal((await P.readProject('f0')).kind, undefined);
  assert.equal(f.data.board, null);
});

test('a design project: its drawings, Check Syntax, the Test Bench Wizard and the simulation; project_info without HDL', async () => {
  await designProject('d1');
  const tb = await ok('test_bench_wizard', { project: 'd1', module: 'traffic' });
  assert.match(tb.text, /^Test Bench Wizard: created sim\/tb_traffic\.vhd/);
  await ok('set_top', { project: 'd1', sim_top: 'tb_traffic' });
  const chk = await ok('check_syntax', { project: 'd1' });
  assert.equal(chk.text, 'Process "Check Syntax" of <traffic> completed successfully (8 signals, 3 processes).');
  const sim = await ok('simulate', { project: 'd1', time_ns: 400 });
  // (the core simulates the drawing's HDL, as in any project)
  assert.match(sim.text, /^\[200\.000 ns\] NOTE: TEST PASSED: 8 vector\(s\) \(no expected values\)\nSimulation of <tb_traffic> stopped at 400 ns\.\n/);
  assert.doesNotMatch(sim.text, /ERROR|WARNING/);
  const info = await ok('project_info', { project: 'd1' });
  assert.equal(info.text, 'd1: a design and simulation project (no FPGA), top traffic, test bench tb_traffic\n  src/traffic.fsm.json');
  assert.deepEqual(info.data, { project: 'd1', kind: 'design', top: 'traffic', simTop: 'tb_traffic', device: null, board: null, constraints: null, files: ['src/traffic.fsm.json'], untrusted: info.data.untrusted });
});

test('a design project: the flow\'s tools refused', async () => {
  await designProject('d2');
  for (const [tool, args] of [['run_process', { process: 'synthesize' }], ['get_report', {}], ['timing_paths', {}], ['check_constraints', {}],
    ['constraints_wizard', {}], ['set_process_properties', { optimization: 'fast' }], ['capture_settings', {}], ['clock_manager', { name: 'clk0' }]]) {
    const r = await call(tool, { project: 'd2', ...args });
    assert.equal(r.isError, true, tool);
    assert.match(r.text, new RegExp(`^${tool}: `), tool);
    assert.equal(r.text, `${tool}: ${FLOW('d2')}`);
  }
  await fails('run_process', { project: 'd2', process: 'implement' }, FLOW('d2'));
  await fails('set_design_properties', { project: 'd2', preferred_language: 'verilog' }, FLOW('d2'));
  await fails('set_design_properties', { project: 'd2', board: 'none' }, FLOW('d2'));
  await fails('set_design_properties', { project: 'd2', design_only: false }, 'the project \'d2\' is a design and simulation project: give a board (or a device) to make it an FPGA project');
});

test('a design project: the HDL\'s files and actions refused, the drawings\' kept', async () => {
  await designProject('d3');
  await fails('new_source', { project: 'd3', type: 'module', name: 'm' }, HDL('m'));
  await fails('new_source', { project: 'd3', type: 'test_bench', name: 'tb' }, HDL('tb'));
  await fails('new_source', { project: 'd3', type: 'c', name: 'f' }, HDL('f'));
  await ok('new_source', { project: 'd3', type: 'schematic', name: 'sheet' });
  await fails('write_file', { project: 'd3', path: 'src/x.vhd', text: '' }, HDL('src/x.vhd'));
  await fails('write_file', { project: 'd3', path: 'constraints/top.ucf', text: '' }, HDL('constraints/top.ucf'));
  await fails('write_file', { project: 'd3', path: 'src/traffic.vhd', text: '' }, HDL('src/traffic.vhd'));
  await fails('add_to_project', { project: 'd3', path: 'src/traffic.vhd' }, HDL('src/traffic.vhd'));
  await fails('read_file', { project: 'd3', path: 'src/traffic.vhd' }, HIDDEN('src/traffic.vhd'));
  assert.equal((await ok('read_file', { project: 'd3', path: 'src/traffic.fsm.json' })).text.includes('"states"'), true);
  await fails('set_source_properties', { project: 'd3', path: 'src/traffic.fsm.json', language: 'verilog' }, HIDDEN('src/traffic.fsm.json'));
  await fails('convert_module', { project: 'd3', module: 'traffic', to: 'asm' }, HIDDEN('traffic'));
  await fails('related_view', { project: 'd3', path: 'src/traffic.fsm.json', view: 'translation' }, HIDDEN('src/traffic.fsm.json'));
  await ok('related_view', { project: 'd3', path: 'src/traffic.fsm.json', view: 'asm' });
  const exch = process.env.SILINX_MCP_FOLDER;
  fs.writeFileSync(path.join(exch, 'extra.vhd'), 'entity extra is end;');
  await fails('import_source', { project: 'd3', files: ['extra.vhd'] }, HDL('extra.vhd'));
});

test('set_design_properties: a board makes a design project an FPGA project, design_only the reverse', async () => {
  await designProject('d4');
  const r = await ok('set_design_properties', { project: 'd4', board: 'basys2', update_constraints: true });
  assert.equal(r.text, 'd4: an FPGA project now: its HDL and its implementation shown.\nDevice set to xc3s250e-4-cp132 (board basys2); synthesis tool of Toolchain Settings; constraints/top.ucf written from the basys2\'s pins.');
  let pj = await P.readProject('d4');
  assert.deepEqual([pj.kind, pj.board, pj.constraints], [undefined, 'basys2', 'constraints/top.ucf']);
  assert.ok(fs.existsSync(path.join(P.projectDir('d4'), 'constraints/top.ucf')));
  assert.match((await ok('project_info', { project: 'd4' })).text, /^d4: top traffic, test bench \(none\), basys2 \(xc3s250ecp132-4\), constraints constraints\/top\.ucf/);
  // (and back: its sources all drawings; the constraints left on the disk)
  const b = await ok('set_design_properties', { project: 'd4', design_only: true });
  assert.equal(b.text, 'd4: a design and simulation project now (no FPGA): no board, no constraints (constraints/top.ucf left on the disk, out of the project); its HDL is not shown.');
  pj = await P.readProject('d4');
  assert.deepEqual([pj.kind, pj.board, pj.constraints], ['design', null, null]);
  await fails('set_design_properties', { project: 'd4', design_only: true }, 'the project \'d4\' is a design and simulation project already');
  // a device with no board makes it an FPGA project too
  const d = await ok('set_design_properties', { project: 'd4', part: 'xc3s500e', package: 'fg320', speed: '-4' });
  assert.match(d.text, /^d4: an FPGA project now: its HDL and its implementation shown\.\nDevice set to xc3s500e-4-fg320; /);
  assert.equal((await P.readProject('d4')).kind, undefined);
});

test('set_design_properties design_only: refused with HDL sources of the user\'s own, or with a board', async () => {
  await ok('new_project_from_example', { name: 'e1', example: 'traffic' });
  await fails('set_design_properties', { project: 'e1', design_only: true },
    'the project \'e1\' cannot become a design and simulation project: its HDL and C sources are not drawings (src/timer.vhd, src/sevenseg.v, src/top.vhd)');
  await fails('set_design_properties', { project: 'e1', design_only: true, board: 'basys2' }, 'design_only: a design and simulation project has no board');
  assert.equal((await P.readProject('e1')).kind, undefined, 'unchanged');
});

test('the local server\'s implementation refuses a design project with the same message (POST /projects/:p/implement)', async () => {
  await designProject('d5');
  const { startImplementation } = await import('../server/impl-routes.js');
  await assert.rejects(startImplementation('d5', { steps: ['synth'] }), { status: 400, message: FLOW('d5') });
});
