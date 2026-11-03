// The MCP server's tools of a project's import and export (#2674, server/mcp-transfer.js): export_project (a Xilinx ISE
// or a Silinx ISE .zip, never over a file) and import_project (a .zip, a .xise with its folder, a project folder),
// only in the exchange folder (SILINX_MCP_FOLDER; the symbolic links that leave it refused); round trips of the
// examples with Check Syntax after them (no warnings), a hostile zip's warnings, and the errors.
// The zip's own format and the routes are tested in server-api.test.js and server-hardening.test.js.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-mcp-transfer-'));
  fs.mkdirSync(path.join(tmp, 'exchange'));
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'exchange');
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
const { createZip, readZip } = await import('../core/zip.js');
const { NODE_CODEC } = await import('../server/impl-routes.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true); assert.equal(r.text, `${name}: ${message}`); };
const out = f => path.join(tmp, 'exchange', f);
const entryNames = async f => (await readZip(fs.readFileSync(f), NODE_CODEC)).map(e => e.path).sort();
const enc = s => new TextEncoder().encode(s);

test('export_project / import_project: traffic as a Xilinx ISE project and back, Check Syntax as before', async () => {
  await ok('new_project_from_example', { name: 'traffic', example: 'traffic' });
  const x = await ok('export_project', { project: 'traffic', path: out('traffic.zip') });
  assert.equal(x.text, `Exported 'traffic' as a Xilinx ISE project: ${out('traffic.zip')} (${fs.statSync(out('traffic.zip')).size} bytes).`);
  assert.deepEqual(x.data.warnings, []);
  // the .xise and the sources; no Silinx-only file (silinx.json, the FSM and the truth table)
  assert.deepEqual(await entryNames(out('traffic.zip')), ['constraints/traffic.ucf', 'sim/tb_traffic.vhd', 'src/lamps.vhd', 'src/sevenseg.v', 'src/timer.vhd', 'src/top.vhd', 'src/traffic.vhd', 'traffic.xise']);
  const i = await ok('import_project', { name: 'traffic_x', from: out('traffic.zip') });
  assert.equal(i.text, 'Imported the Xilinx ISE project as \'traffic_x\': top top, test bench tb_traffic, no board (xc3s250ecp132-4), 6 source(s).');
  assert.deepEqual([i.data.kind, i.data.missing, i.data.warnings], ['xilinx', [], []]);
  assert.equal((await ok('check_syntax', { project: 'traffic_x' })).text, 'Process "Check Syntax" of <top> completed successfully (41 signals, 30 processes).');
  // its .xise alone: its folder's files with it
  for (const e of await readZip(fs.readFileSync(out('traffic.zip')), NODE_CODEC)) {
    fs.mkdirSync(path.dirname(out(`ise/${e.path}`)), { recursive: true });
    fs.writeFileSync(out(`ise/${e.path}`), e.data);
  }
  const f = await ok('import_project', { name: 'traffic_ise', from: out('ise/traffic.xise') });
  assert.equal(f.text, 'Imported the Xilinx ISE project as \'traffic_ise\': top top, test bench tb_traffic, no board (xc3s250ecp132-4), 6 source(s).');
  assert.equal((await ok('check_syntax', { project: 'traffic_ise', simulation: true })).text, 'Process "Check Syntax" of <tb_traffic> completed successfully (42 signals, 32 processes).');
});

test('export_project / import_project: a Silinx ISE project, its drawings and board kept; a project folder', async () => {
  await ok('new_project_from_example', { name: 'gates', example: 'gates' });
  const x = await ok('export_project', { project: 'gates', kind: 'silinx', path: out('gates-silinx.zip') });
  assert.equal(x.text, `Exported 'gates' as a Silinx ISE project: ${out('gates-silinx.zip')} (${fs.statSync(out('gates-silinx.zip')).size} bytes).`);
  assert.ok((await entryNames(out('gates-silinx.zip'))).includes('silinx.json'));
  const i = await ok('import_project', { name: 'gates_s', from: out('gates-silinx.zip') });
  assert.match(i.text, /^Imported the Silinx ISE project as 'gates_s': top gates, test bench tb_gates, basys2 \(xc3s250ecp132-4\), 2 source\(s\), \d+ other file\(s\)\.$/);
  assert.ok(i.data.extra.includes('src/gates.sch.json'));
  assert.equal((await ok('check_syntax', { project: 'gates_s' })).text, 'Process "Check Syntax" of <gates> completed successfully (22 signals, 21 processes).');
  // a project folder (a workspace's, copied into the exchange folder)
  fs.cpSync(P.projectDir('gates'), out('gates-folder'), { recursive: true });
  const d = await ok('import_project', { name: 'gates_f', from: 'gates-folder' });
  assert.match(d.text, /^Imported the Silinx ISE project as 'gates_f': top gates, test bench tb_gates, basys2 \(xc3s250ecp132-4\), 2 source\(s\), \d+ other file\(s\)\.$/);
  assert.deepEqual((await P.readProject('gates_f')).files, (await P.readProject('gates')).files);
});

test('import_project: a hostile zip, what is sound imported, what was dropped said', async () => {
  const pj = { top: 'top', files: [{ path: '../evil.vhd', lang: 'vhdl' }, { path: 'src/top.vhd', lang: 'vhdl' }, { path: 'src/gone.vhd', lang: 'vhdl' }], constraints: '../x.ucf' };
  fs.writeFileSync(out('hostile.zip'), await createZip([{ path: 'silinx.json', data: enc(JSON.stringify(pj)) },
    { path: 'src/top.vhd', data: enc('entity top is end;\narchitecture a of top is begin end;\n') }, { path: '.git/config', data: enc('[core]') }], NODE_CODEC));
  const r = await ok('import_project', { name: 'hostile', from: out('hostile.zip') });
  assert.equal(r.text, ['WARNING: silinx.json: file path outside the project dropped (../evil.vhd)', 'WARNING: silinx.json: constraints path outside the project dropped (../x.ucf)',
    'WARNING: src/gone.vhd: listed by the project, not found', 'Imported the Silinx ISE project as \'hostile\': top top, test bench (none), no board (xc3s250ecp132-4), 2 source(s), 1 other file(s).'].join('\n'));
  assert.ok(!fs.existsSync(path.join(P.projectDir('hostile'), '.git')));
  assert.ok(!fs.existsSync(path.join(P.workspaceDir(), 'evil.vhd')));
});

test('export_project / import_project: the errors', async () => {
  await ok('new_project_from_example', { name: 'blinky', example: 'blinky' });
  await ok('export_project', { project: 'blinky', path: out('blinky.zip') });
  const size = fs.statSync(out('blinky.zip')).size;
  await fails('export_project', { project: 'blinky', path: out('blinky.zip') }, `'${out('blinky.zip')}' exists: an export does not replace a file (give another path)`);
  assert.equal(fs.statSync(out('blinky.zip')).size, size);
  // a name or a path in the exchange folder is one of its files
  assert.equal((await ok('export_project', { project: 'blinky', path: 'sub/../blinky2.zip' })).data.path, out('blinky2.zip'));
  await fails('export_project', { project: 'blinky', path: out('blinky.tar') }, `path: '${out('blinky.tar')}' is not a .zip`);
  await fails('export_project', { project: 'blinky', path: out('nofolder/b.zip') }, `no folder '${out('nofolder')}'`);
  await fails('export_project', { project: 'blinky', kind: 'ise', path: out('b2.zip') }, 'kind: one of xilinx, silinx');
  await fails('export_project', { project: 'nosuch', path: out('b3.zip') }, 'no project \'nosuch\' in the workspace');
  await fails('import_project', { name: 'blinky', from: out('blinky.zip') }, 'project \'blinky\' already exists (delete_project, or another name)');
  assert.equal((await ok('import_project', { name: 'blinky2', from: 'blinky2.zip' })).data.top, 'top');
  await fails('import_project', { name: 'n1', from: out('none.zip') }, `no file or folder '${out('none.zip')}'`);
  fs.writeFileSync(out('notes.txt'), 'x');
  await fails('import_project', { name: 'n1', from: out('notes.txt') }, `from: '${out('notes.txt')}' is not a .zip, a .xise or a folder`);
  fs.writeFileSync(out('junk.zip'), 'not a zip');
  await fails('import_project', { name: 'n1', from: out('junk.zip') }, 'cannot read zip: not a zip file');
  fs.writeFileSync(out('plain.zip'), await createZip([{ path: 'readme.txt', data: enc('x') }], NODE_CODEC));
  await fails('import_project', { name: 'n1', from: out('plain.zip') }, 'the zip contains no .xise (ISE project) and no silinx.json');
  assert.ok(!fs.existsSync(P.projectDir('n1')));
});

test('export_project / import_project: the exchange folder only, its symbolic links that leave it refused', async () => {
  await ok('new_project_from_example', { name: 'vga', example: 'vga' });
  const dir = path.join(tmp, 'exchange');
  const away = path.join(tmp, 'elsewhere');
  fs.mkdirSync(away);
  const outside = (what, p) => `${what}: '${p}' is outside the exchange folder ${dir} (SILINX_MCP_FOLDER sets another)`;
  await fails('export_project', { project: 'vga', path: path.join(away, 'vga.zip') }, outside('path', path.join(away, 'vga.zip')));
  await fails('export_project', { project: 'vga', path: '../vga.zip' }, outside('path', '../vga.zip'));
  await fails('import_project', { name: 'v1', from: P.projectDir('vga') }, outside('from', P.projectDir('vga')));
  await fails('import_project', { name: 'v1', from: '/' }, outside('from', '/'));
  assert.deepEqual(fs.readdirSync(away), []);
  if (process.platform !== 'win32') {
    // a link in the exchange folder to a folder out of it, and to a file out of it
    fs.symlinkSync(away, path.join(dir, 'link'));
    await fails('export_project', { project: 'vga', path: 'link/vga.zip' }, outside('path', 'link/vga.zip'));
    assert.deepEqual(fs.readdirSync(away), []);
    fs.symlinkSync(P.projectDir('vga'), path.join(dir, 'project-link'));
    await fails('import_project', { name: 'v1', from: 'project-link' }, outside('from', 'project-link'));
    // a link that leads into the exchange folder is in it
    fs.mkdirSync(path.join(dir, 'real'));
    fs.symlinkSync(path.join(dir, 'real'), path.join(dir, 'inside'));
    assert.equal((await ok('export_project', { project: 'vga', path: 'inside/vga.zip' })).data.path, path.join(dir, 'inside/vga.zip'));
    assert.ok(fs.existsSync(path.join(dir, 'real/vga.zip')));
  }
  assert.ok(!fs.existsSync(P.projectDir('v1')));
  // no exchange folder
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'none');
  try { await fails('export_project', { project: 'vga', path: 'vga.zip' }, `no exchange folder ${path.join(tmp, 'none')} (SILINX_MCP_FOLDER sets another)`); }
  finally { process.env.SILINX_MCP_FOLDER = dir; }
});
