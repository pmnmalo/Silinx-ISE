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
  assert.equal((await ok('check_syntax', { project: 'r' })).text, 'Process "Check Syntax" of <top> completed successfully (44 signals, 33 processes).');
  const r = await ok('remove_from_project', { project: 'r', path: 'src/lamps.bool.json' });
  assert.equal(r.text, 'Removed src/lamps.bool.json and its HDL file src/lamps.vhd from the project (the files are kept in the project folder).');
  assert.deepEqual(r.data.removed, ['src/lamps.bool.json', 'src/lamps.vhd']);
  assert.ok(fs.existsSync(path.join(P.projectDir('r'), 'src/lamps.vhd')));
  assert.ok(!(await files('r')).includes('src/lamps.vhd'));
  assert.deepEqual((await P.readProject('r')).excluded, ['src/lamps.bool.json']);
  assert.equal((await ok('check_syntax', { project: 'r' })).text, 'ERROR:HDLCompiler - "src/top.vhd" Line 103: module/entity \'lamps\' not found (instance \'u_lamps\')\nProcess "Check Syntax" of <top> failed (1 error(s), 0 warning(s)).');
  await fails('remove_from_project', { project: 'r', path: 'src/lamps.bool.json' }, '\'src/lamps.bool.json\' is not in the project (add_to_project brings it back)');
  // back: the drawing, then its HDL file
  assert.equal((await ok('add_to_project', { project: 'r', path: 'src/lamps.bool.json' })).text, 'src/lamps.bool.json added to the project.');
  assert.equal((await ok('add_to_project', { project: 'r', path: 'src/lamps.vhd' })).text, 'src/lamps.vhd added to the project (vhdl, design).');
  assert.equal((await ok('add_to_project', { project: 'r', path: 'src/lamps.vhd' })).text, 'src/lamps.vhd is in the project already.');
  assert.deepEqual((await P.readProject('r')).excluded, []);
  assert.equal((await ok('check_syntax', { project: 'r' })).text, 'Process "Check Syntax" of <top> completed successfully (44 signals, 33 processes).');
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
  assert.equal((await ok('check_syntax', { project: 'n' })).text, 'Process "Check Syntax" of <top> completed successfully (44 signals, 33 processes).');
  // the constraints file follows
  await ok('rename_file', { project: 'n', from: 'constraints/traffic.ucf', to: 'constraints/basys2.ucf' });
  assert.equal((await P.readProject('n')).constraints, 'constraints/basys2.ucf');
  assert.equal((await ok('rename_file', { project: 'n', from: 'rtl/top.vhd', to: './rtl/top.vhd' })).text, 'rtl/top.vhd: the same path, nothing renamed.');
  await fails('rename_file', { project: 'n', from: 'rtl/top.vhd', to: 'rtl/timer.vhd' }, '\'rtl/timer.vhd\' already exists');
  await fails('rename_file', { project: 'n', from: 'rtl/none.vhd', to: 'rtl/x.vhd' }, 'file \'rtl/none.vhd\' not found');
  await fails('rename_file', { project: 'n', from: 'rtl', to: 'rtl/inner' }, 'cannot move \'rtl\' into itself');
  await fails('rename_file', { project: 'n', from: 'silinx.json', to: 'x.json' }, 'silinx.json is the project\'s description');
  await fails('rename_file', { project: 'n', from: 'rtl/top.vhd', to: '../top.vhd' }, "'../top.vhd': invalid path: path leaves the project ('..')");
  await fails('rename_file', { project: 'n', from: 'rtl/top.vhd', to: 'build/top.vhd' }, 'build/ is written by Silinx itself');
  await fails('rename_file', { project: 'n', from: 'rtl/top.vhd', to: '.hidden/top.vhd' }, '\'.hidden/top.vhd\': not renamed: hidden file or folder (\'.hidden\')');   // (the import gate's message, as Rename's, #2973)
});

// #3537: a file system error as the HTTP API answers it: the project's path and a plain message, no absolute path
test('write_file / rename_file / delete_file: a path onto a folder or through a file, by its path in the project (#3537)', async () => {
  await ok('new_project_from_example', { name: 'fse', example: 'gates' });
  await fails('write_file', { project: 'fse', path: 'src', text: 'x' }, '\'src\' is a folder, not a file');
  await fails('write_file', { project: 'fse', path: 'src/gates.vhd/b.v', text: 'module b; endmodule\n' }, '\'src/gates.vhd\' is a file, not a folder');
  await fails('rename_file', { project: 'fse', from: 'sim/tb_gates.vhd', to: 'src/gates.vhd/tb.vhd' }, '\'src/gates.vhd\' is a file, not a folder');
  await fails('delete_file', { project: 'fse', path: 'src/none.vhd' }, 'no file or folder \'src/none.vhd\' in the project \'fse\'');
  assert.deepEqual(await files('fse'), ['sim/tb_gates.vhd', 'src/gates.vhd']);
  const tree = await P.fileTree('fse');
  assert.ok(tree.includes('sim/tb_gates.vhd') && tree.includes('src/gates.vhd'));
  // P.deleteFile itself: nothing at the path is nothing to do, unless it must exist (the route's, the MCP's)
  assert.deepEqual(await P.deleteFile('fse', 'src/none.vhd'), { trashed: null });
  await assert.rejects(P.deleteFile('fse', 'src/none.vhd', { mustExist: true }), { status: 404, message: 'no file or folder \'src/none.vhd\' in the project \'fse\'' });
});

test('delete_file: a drawing\'s HDL file (the drawing\'s HDL made from it then), a folder; delete_project', async () => {
  await ok('new_project_from_example', { name: 'd', example: 'gates' });
  const r = await ok('delete_file', { project: 'd', path: 'src/gates.vhd' });
  assert.equal(r.text, `src/gates.vhd deleted (moved to the workspace's .trash folder: ${r.data.trashed}).`);
  assert.match(r.data.trashed, /^\.trash\/d-\d+\/src\/gates\.vhd$/);   // (#3364: into the workspace's .trash)
  assert.ok(fs.existsSync(path.join(P.workspaceDir(), r.data.trashed)));
  assert.ok(!fs.existsSync(path.join(P.projectDir('d'), 'src/gates.vhd')));
  assert.deepEqual(await files('d'), ['sim/tb_gates.vhd']);
  // the schematic is a module by itself again (#231): the top stays, Check Syntax as before
  assert.equal(r.data.top, 'gates');
  assert.equal((await ok('check_syntax', { project: 'd' })).text, 'Process "Check Syntax" of <gates> completed successfully (22 signals, 21 processes).');
  const f = await ok('delete_file', { project: 'd', path: 'src' });
  assert.equal(f.text, `INFO: The top-level module 'gates' is no longer in the project, nor any other module.\nsrc deleted (a folder: 1 file(s); moved to the workspace's .trash folder: ${f.data.trashed}).`);
  await fails('delete_file', { project: 'd', path: 'src' }, 'no file or folder \'src\' in the project \'d\'');
  await fails('delete_file', { project: 'd', path: 'silinx.json' }, 'silinx.json is the project\'s description');
  await fails('delete_file', { project: 'd', path: '.' }, "'.': invalid path: the project's folder, not a file's path");
  // the project: into the workspace's .trash
  assert.equal((await ok('delete_project', { project: 'd' })).text, 'Project \'d\' deleted (moved to the workspace\'s .trash folder).');
  assert.ok(!fs.existsSync(P.projectDir('d')));
  assert.ok(fs.readdirSync(path.join(P.workspaceDir(), '.trash')).some(n => /^d-\d+$/.test(n)));
  await fails('delete_project', { project: 'd' }, 'no project \'d\' in the workspace');
});

test('a hidden file or folder of a project (.git, .env, .vscode) refused by every tool that takes a path (#3035); an ordinary file and a report of build/ read as before', async () => {
  await ok('new_project_from_example', { name: 'h', example: 'traffic' });
  const dir = P.projectDir('h');
  fs.mkdirSync(path.join(dir, '.git/hooks'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.git/config'), '[remote "origin"]\n\turl = https://token@example.com/r.git\n');
  fs.writeFileSync(path.join(dir, '.env'), 'KEY=1\n');
  fs.mkdirSync(path.join(dir, '.vscode'));
  fs.writeFileSync(path.join(dir, '.vscode/x.fsm.json'), fs.readFileSync(path.join(dir, 'src/traffic.fsm.json')));
  fs.writeFileSync(path.join(dir, '.git/x.c'), 'int f(int a) { return a; }\n');
  fs.symlinkSync('.git', path.join(dir, 'gitlink'), process.platform === 'win32' ? 'junction' : 'dir');   // (a link in the project to it)
  await fails('read_file', { project: 'h', path: 'src/../.git/config' }, "'src/../.git/config': invalid path: path leaves the project ('..')");   // (#3598)
  for (const p of ['.git/config', './.git/config', '.env', 'gitlink/config'])
    await fails('read_file', { project: 'h', path: p }, `'${p}': a hidden file or folder cannot be read`);
  await fails('write_file', { project: 'h', path: '.git/hooks/pre-commit', text: 'x' }, '\'.git/hooks/pre-commit\': a hidden file or folder cannot be written');
  await fails('write_file', { project: 'h', path: 'gitlink/hooks/pre-commit', text: 'x' }, '\'gitlink/hooks/pre-commit\': a hidden file or folder cannot be written');
  await fails('rename_file', { project: 'h', from: '.git', to: 'gitcopy' }, '\'.git\': a hidden file or folder cannot be renamed');
  await fails('rename_file', { project: 'h', from: '.git/config', to: 'config' }, '\'.git/config\': a hidden file or folder cannot be renamed');
  await fails('delete_file', { project: 'h', path: '.git' }, '\'.git\': a hidden file or folder cannot be deleted');
  await fails('delete_file', { project: 'h', path: '.git/config' }, '\'.git/config\': a hidden file or folder cannot be deleted');
  await fails('remove_from_project', { project: 'h', path: '.env' }, '\'.env\': a hidden file or folder cannot be removed');
  await fails('add_to_project', { project: 'h', path: '.git/x.vhd' }, '\'.git/x.vhd\': a hidden file or folder cannot be added');
  await fails('rename_module', { project: 'h', module: 'timer', to: 'tick', file: '.git/tick.vhd' }, '\'.git/tick.vhd\': a hidden file or folder cannot be renamed');
  // the tools that read a drawing or a source a path names
  await fails('check_drawing', { project: 'h', file: '.vscode/x.fsm.json' }, '\'.vscode/x.fsm.json\': a hidden file or folder cannot be read');
  await fails('simulate_drawing', { project: 'h', file: '.vscode/x.fsm.json', cycles: [{}] }, '\'.vscode/x.fsm.json\': a hidden file or folder cannot be read');
  await fails('related_view', { project: 'h', path: '.vscode/x.fsm.json', view: 'translation' }, '\'.vscode/x.fsm.json\': a hidden file or folder cannot be read');
  await fails('convert_drawing', { project: 'h', path: '.vscode/x.fsm.json', to: 'asm' }, '\'.vscode/x.fsm.json\': a hidden file or folder cannot be read');
  await fails('c_simulation', { project: 'h', path: '.git/x.c' }, '\'.git/x.c\': a hidden file or folder cannot be read');
  // nothing renamed, deleted or written; the git folder as it was
  assert.deepEqual(fs.readdirSync(path.join(dir, '.git')).sort(), ['config', 'hooks', 'x.c']);
  assert.deepEqual(fs.readdirSync(path.join(dir, '.git/hooks')), []);
  assert.ok(!fs.existsSync(path.join(dir, 'gitcopy')));
  // an ordinary file, a report of build/, a drawing: read as before
  assert.equal((await ok('read_file', { project: 'h', path: 'src/timer.vhd' })).text, fs.readFileSync(path.join(dir, 'src/timer.vhd'), 'utf8'));
  fs.mkdirSync(path.join(dir, 'build/open'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'build/open/top_stat.txt'), 'Number of cells: 12\n');
  assert.equal((await ok('read_file', { project: 'h', path: 'build/open/top_stat.txt' })).text, 'Number of cells: 12\n');
  assert.equal((await ok('check_drawing', { project: 'h', file: 'src/traffic.fsm.json' })).isError, false);
  await fails('read_file', { project: 'h', path: 'src/none.vhd' }, 'no file \'src/none.vhd\' in the project \'h\'');
  await fails('check_drawing', { project: 'h', file: 'src/none.fsm.json' }, 'no drawing \'src/none.fsm.json\' in the project \'h\'');
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
  assert.equal((await ok('check_syntax', { project: 'm', simulation: true })).text, 'Process "Check Syntax" of <tb_traffic> completed successfully (45 signals, 35 processes).');
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

// #2877: the top set on a module another one instantiates (b under a): set_top, project_info, Check Syntax and
// synthesis on b alone, as the Design pane's root; a again: as before. The one warning, the pins' (no board), either way.
test('set_top on an instantiated module (#2877): project_info, Check Syntax and synthesis on it; the former parent again', { timeout: 120000 }, async () => {
  await ok('new_project', { name: 'nested' });
  await ok('write_file', { project: 'nested', path: 'src/a.vhd', text: 'library ieee; use ieee.std_logic_1164.all;\nentity a is port (x : in std_logic; y : out std_logic); end a;\narchitecture r of a is begin u_b : entity work.b port map (x => x, y => y); end r;\n' });
  await ok('write_file', { project: 'nested', path: 'src/b.v', text: 'module b(input x, output y); assign y = ~x; endmodule\n' });
  const PINS = 'WARNING: 2 port bit(s) have no LOC constraint (x, y): Silinx assigns free I/O pins automatically - do NOT program real hardware with this bitstream';
  for (const top of ['b', 'a']) {
    assert.equal((await ok('set_top', { project: 'nested', top })).text, `nested: top ${top}, test bench (none).`);
    const info = await ok('project_info', { project: 'nested' });
    assert.equal(info.data.top, top);
    assert.match(info.text, new RegExp(`^nested: top ${top}, `));
    assert.equal((await ok('check_syntax', { project: 'nested' })).text, `Process "Check Syntax" of <${top}> completed successfully (2 signals, 1 processes).`);
    const synth = await ok('run_process', { project: 'nested', process: 'synthesize', log_lines: 3 });
    assert.equal(synth.text.split('\n').pop(), `Process "synthesize" of <${top}> completed successfully with 1 warning(s) (Silinx toolchain).`);
    assert.deepEqual(synth.data.errors, []);
    assert.deepEqual(synth.data.warnings, [PINS]);
  }
});

test('#3536 write_file / rename_file: a path by another case is the project\'s own spelling (on every system)', async () => {
  await ok('new_project_from_example', { name: 'cs', example: 'traffic' });
  const t = 'entity extra is end;\narchitecture r of extra is begin end;\n';
  assert.equal((await ok('write_file', { project: 'cs', path: 'SRC/extra.vhd', text: t })).text, `Created src/extra.vhd (${t.length} characters), added to the project.`);
  assert.equal((await ok('read_file', { project: 'cs', path: 'Src/Extra.VHD' })).text, t);
  assert.equal((await ok('rename_file', { project: 'cs', from: 'SRC/extra.vhd', to: 'SIM/Extra.vhd' })).text, 'Rename: src/extra.vhd → sim/Extra.vhd.');
  await fails('rename_file', { project: 'cs', from: 'sim/Extra.vhd', to: 'SRC/TOP.vhd' }, '\'src/TOP.vhd\' already exists');
  assert.equal((await ok('rename_file', { project: 'cs', from: 'SRC/LAMPS.VHD', to: 'src/Lamps.vhd' })).text, 'Rename: src/lamps.vhd → src/Lamps.vhd (the link of src/lamps.bool.json updated).');
  assert.equal(drawingLink('cs', 'src/lamps.bool.json'), 'src/Lamps.vhd');
  assert.ok((await files('cs')).includes('sim/Extra.vhd') && (await files('cs')).includes('src/Lamps.vhd'));
  assert.deepEqual((await P.fileTree('cs')).filter(f => /extra|lamps\.vhd/i.test(f)), ['sim/Extra.vhd', 'src/Lamps.vhd']);
  assert.equal((await ok('check_syntax', { project: 'cs' })).text, 'Process "Check Syntax" of <top> completed successfully (44 signals, 33 processes).');
});
