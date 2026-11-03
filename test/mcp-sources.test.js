// The MCP server's tools of a project's sources (#2674, server/mcp-sources.js): unset_top, remove_from_project and
// add_to_project, rename_file, delete_file and delete_project, on the examples (traffic: an FSM and a truth table
// linked to their HDL files; gates: a schematic); every result's text, Check Syntax's after each change (no warnings,
// or its error), the tops a removal leaves, and the errors.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-mcp-sources-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true); assert.equal(r.text, `${name}: ${message}`); };
const files = async name => (await P.readProject(name)).files.map(f => f.path).sort();
const drawingLink = (name, f) => JSON.parse(fs.readFileSync(path.join(P.projectDir(name), f), 'utf8')).generatedFile;

test('unset_top: the top module, the test bench; nothing to unset', async () => {
  await ok('new_project_from_example', { name: 'u', example: 'traffic' });
  assert.equal((await ok('unset_top', { project: 'u', simulation: true })).text, 'Top-level simulation module \'tb_traffic\' unset: the project has no test bench (set_top makes one).');
  assert.equal((await ok('unset_top', { project: 'u', simulation: true })).text, 'The project \'u\' has no test bench: nothing to unset.');
  const r = await ok('unset_top', { project: 'u' });
  assert.equal(r.text, 'Top-level module \'top\' unset: the project has no top module (set_top makes one).');
  assert.deepEqual([r.data.top, r.data.simTop], [null, null]);
  assert.equal((await ok('unset_top', { project: 'u' })).text, 'The project \'u\' has no top module: nothing to unset.');
});

test('remove_from_project / add_to_project: a drawing with its HDL file, Check Syntax\'s error, then back', async () => {
  await ok('new_project_from_example', { name: 'r', example: 'traffic' });
  assert.equal((await ok('check_syntax', { project: 'r' })).text, 'Process "Check Syntax" of <top> completed successfully (41 signals, 30 processes).');
  const r = await ok('remove_from_project', { project: 'r', path: 'src/lamps.bool.json' });
  assert.equal(r.text, 'Removed src/lamps.bool.json and its HDL file src/lamps.vhd from the project (the files are kept in the project folder).');
  assert.deepEqual(r.data.removed, ['src/lamps.bool.json', 'src/lamps.vhd']);
  assert.ok(fs.existsSync(path.join(P.projectDir('r'), 'src/lamps.vhd')));
  assert.ok(!(await files('r')).includes('src/lamps.vhd'));
  assert.deepEqual((await P.readProject('r')).excluded, ['src/lamps.bool.json']);
  assert.equal((await ok('check_syntax', { project: 'r' })).text, 'ERROR:HDLCompiler - "src/top.vhd" Line 83: module/entity \'lamps\' not found (instance \'u_lamps\')\nProcess "Check Syntax" of <top> failed (1 error(s), 0 warning(s)).');
  await fails('remove_from_project', { project: 'r', path: 'src/lamps.bool.json' }, '\'src/lamps.bool.json\' is not in the project (add_to_project brings it back)');
  // back: the drawing, then its HDL file
  assert.equal((await ok('add_to_project', { project: 'r', path: 'src/lamps.bool.json' })).text, 'src/lamps.bool.json added to the project.');
  assert.equal((await ok('add_to_project', { project: 'r', path: 'src/lamps.vhd' })).text, 'src/lamps.vhd added to the project (vhdl, design).');
  assert.equal((await ok('add_to_project', { project: 'r', path: 'src/lamps.vhd' })).text, 'src/lamps.vhd is in the project already.');
  assert.deepEqual((await P.readProject('r')).excluded, []);
  assert.equal((await ok('check_syntax', { project: 'r' })).text, 'Process "Check Syntax" of <top> completed successfully (41 signals, 30 processes).');
  // the drawing alone (with_hdl false): its HDL file stays
  assert.equal((await ok('remove_from_project', { project: 'r', path: 'src/lamps.bool.json', with_hdl: false })).text, 'Removed src/lamps.bool.json from the project (the file is kept in the project folder).');
  assert.ok((await files('r')).includes('src/lamps.vhd'));
});

test('remove_from_project: the top\'s file, the tops it leaves (none, or the one root of the view)', async () => {
  await ok('new_project_from_example', { name: 'g', example: 'gates' });
  const r = await ok('remove_from_project', { project: 'g', path: 'src/gates.sch.json' });
  assert.equal(r.text, 'INFO: The top-level module \'gates\' is no longer in the project, nor any other module.\nRemoved src/gates.sch.json and its HDL file src/gates.vhd from the project (the files are kept in the project folder).');
  assert.deepEqual([r.data.top, r.data.simTop], [null, 'tb_gates']);
  // several roots left: a warning, no top
  await ok('new_project_from_example', { name: 't2', example: 'traffic' });
  const s = await ok('remove_from_project', { project: 't2', path: 'src/top.vhd' });
  assert.equal(s.text, 'WARNING: The top-level module \'top\' is no longer in the project: set the top module (set_top).\nRemoved src/top.vhd from the project (the file is kept in the project folder).');
  assert.equal(s.data.top, null);
  // one root left: the top
  await ok('new_project', { name: 'one' });
  await ok('write_file', { project: 'one', path: 'src/a.vhd', text: 'entity a is end;\narchitecture r of a is begin end;\n' });
  await ok('write_file', { project: 'one', path: 'src/b.vhd', text: 'entity b is end;\narchitecture r of b is begin end;\n' });
  await ok('set_top', { project: 'one', top: 'a' });
  const o = await ok('remove_from_project', { project: 'one', path: 'src/a.vhd' });
  assert.equal(o.text, 'INFO: The top-level module \'a\' is no longer in the project: the top is now \'b\' (another one: set_top).\nRemoved src/a.vhd from the project (the file is kept in the project folder).');
  assert.equal((await P.readProject('one')).top, 'b');
});

test('rename_file: a file and a folder, the project\'s files, the drawings\' links, Check Syntax as before', async () => {
  await ok('new_project_from_example', { name: 'n', example: 'traffic' });
  const r = await ok('rename_file', { project: 'n', from: 'src/lamps.vhd', to: 'hdl/lamps.vhd' });
  assert.equal(r.text, 'Rename: src/lamps.vhd → hdl/lamps.vhd (the link of src/lamps.bool.json updated).');
  assert.equal(drawingLink('n', 'src/lamps.bool.json'), 'hdl/lamps.vhd');
  const f = await ok('rename_file', { project: 'n', from: 'src', to: 'rtl' });
  assert.equal(f.text, 'Rename: src → rtl (the link of rtl/traffic.fsm.json updated).');
  assert.equal(drawingLink('n', 'rtl/traffic.fsm.json'), 'rtl/traffic.vhd');
  assert.deepEqual(await files('n'), ['hdl/lamps.vhd', 'rtl/sevenseg.v', 'rtl/timer.vhd', 'rtl/top.vhd', 'rtl/traffic.vhd', 'sim/tb_traffic.vhd']);
  assert.equal((await ok('check_syntax', { project: 'n' })).text, 'Process "Check Syntax" of <top> completed successfully (41 signals, 30 processes).');
  // the constraints file follows
  await ok('rename_file', { project: 'n', from: 'constraints/traffic.ucf', to: 'constraints/basys2.ucf' });
  assert.equal((await P.readProject('n')).constraints, 'constraints/basys2.ucf');
  assert.equal((await ok('rename_file', { project: 'n', from: 'rtl/top.vhd', to: './rtl/top.vhd' })).text, 'rtl/top.vhd: the same path, nothing renamed.');
  await fails('rename_file', { project: 'n', from: 'rtl/top.vhd', to: 'rtl/timer.vhd' }, '\'rtl/timer.vhd\' already exists');
  await fails('rename_file', { project: 'n', from: 'rtl/none.vhd', to: 'rtl/x.vhd' }, 'file \'rtl/none.vhd\' not found');
  await fails('rename_file', { project: 'n', from: 'rtl', to: 'rtl/inner' }, 'cannot move \'rtl\' into itself');
  await fails('rename_file', { project: 'n', from: 'silinx.json', to: 'x.json' }, 'silinx.json is the project\'s description');
  await fails('rename_file', { project: 'n', from: 'rtl/top.vhd', to: '../top.vhd' }, 'path escapes project');
  await fails('rename_file', { project: 'n', from: 'rtl/top.vhd', to: 'build/top.vhd' }, 'build/ is written by Silinx itself');
  await fails('rename_file', { project: 'n', from: 'rtl/top.vhd', to: '.hidden/top.vhd' }, '\'.hidden/top.vhd\': a hidden file or folder');
});

test('delete_file: a drawing\'s HDL file (the drawing\'s HDL made from it then), a folder; delete_project', async () => {
  await ok('new_project_from_example', { name: 'd', example: 'gates' });
  const r = await ok('delete_file', { project: 'd', path: 'src/gates.vhd' });
  assert.equal(r.text, 'src/gates.vhd deleted.');
  assert.ok(!fs.existsSync(path.join(P.projectDir('d'), 'src/gates.vhd')));
  assert.deepEqual(await files('d'), ['sim/tb_gates.vhd']);
  // the schematic is a module by itself again (#231): the top stays, Check Syntax as before
  assert.equal(r.data.top, 'gates');
  assert.equal((await ok('check_syntax', { project: 'd' })).text, 'Process "Check Syntax" of <gates> completed successfully (22 signals, 21 processes).');
  const f = await ok('delete_file', { project: 'd', path: 'src' });
  assert.equal(f.text, 'INFO: The top-level module \'gates\' is no longer in the project, nor any other module.\nsrc deleted (a folder: 1 file(s)).');
  await fails('delete_file', { project: 'd', path: 'src' }, 'no file or folder \'src\' in the project \'d\'');
  await fails('delete_file', { project: 'd', path: 'silinx.json' }, 'silinx.json is the project\'s description');
  await fails('delete_file', { project: 'd', path: '.' }, 'path: a file\'s path in the project, not the project\'s folder');
  // the project: into the workspace's .trash
  assert.equal((await ok('delete_project', { project: 'd' })).text, 'Project \'d\' deleted (moved to the workspace\'s .trash folder).');
  assert.ok(!fs.existsSync(P.projectDir('d')));
  assert.ok(fs.readdirSync(path.join(P.workspaceDir(), '.trash')).some(n => /^d-\d+$/.test(n)));
  await fails('delete_project', { project: 'd' }, 'no project \'d\' in the workspace');
});

test('rename_module: its references, the drawing it is made from, the top; the file following or kept; Check Syntax and the test bench after', async () => {
  await ok('new_project_from_example', { name: 'm', example: 'traffic' });
  const r = await ok('rename_module', { project: 'm', module: 'traffic', to: 'crossing' });
  assert.equal(r.text, 'Rename: module \'traffic\' renamed to \'crossing\' (3 file(s) updated); src/traffic.fsm.json → src/crossing.fsm.json; src/traffic.vhd → src/crossing.vhd.\nsrc/crossing.vhd updated from src/crossing.fsm.json');
  assert.equal(drawingLink('m', 'src/crossing.fsm.json'), 'src/crossing.vhd');
  assert.match(fs.readFileSync(path.join(P.projectDir('m'), 'src/top.vhd'), 'utf8'), /entity work\.crossing|: crossing\b|component crossing/i);
  // the top: renamed with its module
  assert.equal((await ok('rename_module', { project: 'm', module: 'top', to: 'traffic_top' })).data.top, 'traffic_top');
  // the file kept, or given
  assert.equal((await ok('rename_module', { project: 'm', module: 'timer', to: 'tick', file: 'keep' })).text, 'Rename: module \'timer\' renamed to \'tick\' (2 file(s) updated).');
  assert.equal((await ok('rename_module', { project: 'm', module: 'lamps', to: 'lights', file: 'rtl/lights.vhd' })).text,
    'Rename: module \'lamps\' renamed to \'lights\' (3 file(s) updated); src/lamps.bool.json → src/lights.bool.json; src/lamps.vhd → rtl/lights.vhd.\nrtl/lights.vhd updated from src/lights.bool.json');
  assert.deepEqual(await files('m'), ['rtl/lights.vhd', 'sim/tb_traffic.vhd', 'src/crossing.vhd', 'src/sevenseg.v', 'src/timer.vhd', 'src/traffic_top.vhd']);
  assert.equal((await ok('check_syntax', { project: 'm', simulation: true })).text, 'Process "Check Syntax" of <tb_traffic> completed successfully (42 signals, 32 processes).');
  const s = await ok('simulate', { project: 'm', time_ns: 100000, signals: [] });
  assert.deepEqual([s.data.failed, s.data.log.map(l => l.text), s.data.warnings], [false, ['Simulation finished OK'], []]);
  // a schematic's module
  await ok('new_project_from_example', { name: 'mg', example: 'gates' });
  assert.equal((await ok('rename_module', { project: 'mg', module: 'gates', to: 'gate_set' })).text,
    'Rename: module \'gates\' renamed to \'gate_set\' (3 file(s) updated); src/gates.sch.json → src/gate_set.sch.json; src/gates.vhd → src/gate_set.vhd.\nsrc/gate_set.vhd updated from src/gate_set.sch.json');
  assert.equal(JSON.parse(fs.readFileSync(path.join(P.projectDir('mg'), 'src/gate_set.sch.json'), 'utf8')).name, 'gate_set');
  assert.equal((await ok('check_syntax', { project: 'mg', simulation: true })).text, 'Process "Check Syntax" of <tb_gates> completed successfully (22 signals, 22 processes).');
  // the dialog's refusals
  for (const [args, message] of [
    [{ module: 'nosuch', to: 'x' }, 'no module \'nosuch\' in the project\'s HDL files (a drawing with no HDL file: write_file its name)'],
    [{ module: 'tick', to: 'signal' }, '\'signal\' is a reserved word of VHDL: choose another name.'],
    [{ module: 'tick', to: 'logic' }, '\'logic\' is a reserved word of SystemVerilog: choose another name.'],
    [{ module: 'tick', to: 'crossing' }, 'A module named \'crossing\' already exists.'],
    [{ module: 'tick', to: '9x' }, 'The module name must start with a letter and contain only letters, digits and _.'],
    [{ module: 'tick', to: 'tock', file: 'src/sevenseg.v' }, 'src/sevenseg.v already exists.'],
  ]) await fails('rename_module', { project: 'm', ...args }, message);
});
