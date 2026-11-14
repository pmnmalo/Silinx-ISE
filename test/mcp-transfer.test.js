// The MCP server's tools of a project's import and export (#2674, server/mcp-transfer.js): export_project (a Xilinx ISE
// or a Silinx .zip, never over a file) and import_project (a .zip, a .xise with its folder, a project folder),
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
// (a path of the exchange folder as the results name it, never absolute, #3418)
const shown = f => `<exchange folder>/${f}`;
const entryNames = async f => (await readZip(fs.readFileSync(f), NODE_CODEC)).map(e => e.path).sort();
const enc = s => new TextEncoder().encode(s);

test('export_project / import_project: traffic as a Xilinx ISE project and back, Check Syntax as before', async () => {
  await ok('new_project_from_example', { name: 'traffic', example: 'traffic' });
  const x = await ok('export_project', { project: 'traffic', path: out('traffic.zip') });
  assert.equal(x.text, `Exported 'traffic' as a Xilinx ISE project: ${shown('traffic.zip')} (${fs.statSync(out('traffic.zip')).size} bytes).`);
  assert.deepEqual(x.data.warnings, []);
  // the .xise and the sources; no Silinx-only file (silinx.json, the FSM and the truth table)
  assert.deepEqual(await entryNames(out('traffic.zip')), ['constraints/traffic.ucf', 'sim/tb_traffic.vhd', 'src/lamps.vhd', 'src/sevenseg.v', 'src/timer.vhd', 'src/top.vhd', 'src/traffic.vhd', 'traffic.xise']);
  const i = await ok('import_project', { name: 'traffic_x', from: out('traffic.zip') });
  assert.equal(i.text, 'Imported the Xilinx ISE project as \'traffic_x\': top top, test bench tb_traffic, no board (xc3s250ecp132-4), 6 source(s).');
  assert.deepEqual([i.data.kind, i.data.missing, i.data.warnings], ['xilinx', [], []]);
  assert.equal((await ok('check_syntax', { project: 'traffic_x' })).text, 'Process "Check Syntax" of <top> completed successfully (44 signals, 33 processes).');
  // its .xise alone: its folder's files with it
  for (const e of await readZip(fs.readFileSync(out('traffic.zip')), NODE_CODEC)) {
    fs.mkdirSync(path.dirname(out(`ise/${e.path}`)), { recursive: true });
    fs.writeFileSync(out(`ise/${e.path}`), e.data);
  }
  const f = await ok('import_project', { name: 'traffic_ise', from: out('ise/traffic.xise') });
  assert.equal(f.text, 'Imported the Xilinx ISE project as \'traffic_ise\': top top, test bench tb_traffic, no board (xc3s250ecp132-4), 6 source(s).');
  assert.equal((await ok('check_syntax', { project: 'traffic_ise', simulation: true })).text, 'Process "Check Syntax" of <tb_traffic> completed successfully (45 signals, 35 processes).');
});

test('export_project / import_project: a Silinx project, its drawings and board kept; a project folder', async () => {
  await ok('new_project_from_example', { name: 'gates', example: 'gates' });
  const x = await ok('export_project', { project: 'gates', kind: 'silinx', path: out('gates-silinx.zip') });
  assert.equal(x.text, `Exported 'gates' as a Silinx project: ${shown('gates-silinx.zip')} (${fs.statSync(out('gates-silinx.zip')).size} bytes).`);
  assert.ok((await entryNames(out('gates-silinx.zip'))).includes('silinx.json'));
  const i = await ok('import_project', { name: 'gates_s', from: out('gates-silinx.zip') });
  assert.match(i.text, /^Imported the Silinx project as 'gates_s': top gates, test bench tb_gates, basys2 \(xc3s250ecp132-4\), 2 source\(s\), \d+ other file\(s\)\.$/);
  assert.ok(i.data.extra.includes('src/gates.sch.json'));
  assert.equal((await ok('check_syntax', { project: 'gates_s' })).text, 'Process "Check Syntax" of <gates> completed successfully (22 signals, 21 processes).');
  // a project folder (a workspace's, copied into the exchange folder)
  fs.cpSync(P.projectDir('gates'), out('gates-folder'), { recursive: true });
  const d = await ok('import_project', { name: 'gates_f', from: 'gates-folder' });
  assert.match(d.text, /^Imported the Silinx project as 'gates_f': top gates, test bench tb_gates, basys2 \(xc3s250ecp132-4\), 2 source\(s\), \d+ other file\(s\)\.$/);
  assert.deepEqual((await P.readProject('gates_f')).files, (await P.readProject('gates')).files);
});

test('import_project: a hostile zip, what is sound imported, what was dropped said', async () => {
  const pj = { top: 'top', files: [{ path: '../evil.vhd', lang: 'vhdl' }, { path: 'src/top.vhd', lang: 'vhdl' }, { path: 'src/gone.vhd', lang: 'vhdl' }], constraints: '../x.ucf' };
  fs.writeFileSync(out('hostile.zip'), await createZip([{ path: 'silinx.json', data: enc(JSON.stringify(pj)) },
    { path: 'src/top.vhd', data: enc('entity top is end;\narchitecture a of top is begin end;\n') }, { path: '.git/config', data: enc('[core]') }], NODE_CODEC));
  const r = await ok('import_project', { name: 'hostile', from: out('hostile.zip') });
  // (the import gate's refusals first, #2830)
  assert.equal(r.text, ["WARNING: .git/config: not imported: hidden file or folder ('.git')", 'WARNING: silinx.json: file path outside the project dropped (../evil.vhd)', 'WARNING: silinx.json: constraints path outside the project dropped (../x.ucf)',
    'WARNING: src/gone.vhd: listed by the project, not found', 'Imported the Silinx project as \'hostile\': top top, test bench (none), no board (xc3s250ecp132-4), 2 source(s), 1 other file(s).'].join('\n'));
  assert.ok(!fs.existsSync(path.join(P.projectDir('hostile'), '.git')));
  assert.ok(!fs.existsSync(path.join(P.workspaceDir(), 'evil.vhd')));
  assert.deepEqual(r.data.warnings, [".git/config: not imported: hidden file or folder ('.git')", 'silinx.json: file path outside the project dropped (../evil.vhd)',
    'silinx.json: constraints path outside the project dropped (../x.ucf)']);
});

test('import_project: the project is from outside (#2830): no Xilinx ISE for it, and no tool trusts it (only the user, in the interface)', async () => {
  const pj = { top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], trusted: true };
  fs.writeFileSync(out('outside.zip'), await createZip([{ path: 'silinx.json', data: enc(JSON.stringify(pj)) }, { path: 'src/top.vhd', data: enc('entity top is end;\narchitecture a of top is begin end;\n') }], NODE_CODEC));
  await ok('import_project', { name: 'outside', from: 'outside.zip' });
  assert.equal((await P.readProject('outside')).trusted, false);
  await fails('run_process', { project: 'outside', process: 'synthesize', toolchain: 'ise' },
    "project 'outside' came from outside (imported): Xilinx ISE runs only once you trust it (Trust Project, in the console when the project opens)");
  const { result } = await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/list', params: {} });
  assert.deepEqual(result.tools.filter(t => /trust/i.test(t.name)), []);
});

test('import_project: the import gate (#2830): a zip bomb, an XXE .xise, a script in a name, refused with their reasons', async () => {
  const zeros = new Uint8Array(4 << 20);
  const bomb = await createZip([{ path: 'silinx.json', data: enc('{}') }, { path: 'big.mem', data: zeros }], NODE_CODEC);
  // the central directory says big.mem is 100 bytes: inflating stops there
  const dv = new DataView(bomb.buffer, bomb.byteOffset, bomb.byteLength);
  let p = dv.getUint32(bomb.length - 22 + 16, true);
  p += 46 + dv.getUint16(p + 28, true) + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  dv.setUint32(p + 24, 100, true);
  fs.writeFileSync(out('bomb.zip'), bomb);
  const b = await call('import_project', { name: 'bomb', from: 'bomb.zip' });
  assert.equal(b.isError, true);
  assert.match(b.text, /^import_project: cannot read zip: zip entry larger than it declares or corrupt \(big\.mem\)/);
  assert.ok(!fs.existsSync(P.projectDir('bomb')));
  fs.writeFileSync(out('xxe.zip'), await createZip([{ path: 'p.xise', data: enc('<?xml version="1.0"?><!DOCTYPE p [<!ENTITY x SYSTEM "file:///etc/passwd">]><project>&x;</project>') }], NODE_CODEC));
  await fails('import_project', { name: 'xxe', from: 'xxe.zip' }, 'p.xise: not imported: XML with a DTD (<!DOCTYPE>): external entities and entity expansion are not accepted');
  fs.writeFileSync(out('xss.zip'), await createZip([{ path: 'silinx.json', data: enc('{}') }, { path: 'src/<img src=x onerror=alert(1)>.vhd', data: enc('x') }], NODE_CODEC));
  const x = await ok('import_project', { name: 'xss', from: 'xss.zip' });
  assert.deepEqual(x.data.warnings, ['src/<img src=x onerror=alert(1)>.vhd: not imported: character not allowed in a name (< > : " | ? *): \'<img src=x onerror=alert(1)>.vhd\'']);
  assert.deepEqual(x.data.extra, []);
});

test('export_project / import_project: the errors', async () => {
  await ok('new_project_from_example', { name: 'blinky', example: 'blinky' });
  await ok('export_project', { project: 'blinky', path: out('blinky.zip') });
  const size = fs.statSync(out('blinky.zip')).size;
  await fails('export_project', { project: 'blinky', path: out('blinky.zip') }, `'${shown('blinky.zip')}' exists: an export does not replace a file (give another path)`);
  assert.equal(fs.statSync(out('blinky.zip')).size, size);
  // a name or a path in the exchange folder is one of its files
  assert.equal((await ok('export_project', { project: 'blinky', path: 'sub/../blinky2.zip' })).data.path, shown('blinky2.zip'));
  await fails('export_project', { project: 'blinky', path: out('blinky.tar') }, `path: '${shown('blinky.tar')}' is not a .zip`);
  await fails('export_project', { project: 'blinky', path: out('nofolder/b.zip') }, `no folder '${shown('nofolder')}'`);
  await fails('export_project', { project: 'blinky', kind: 'ise', path: out('b2.zip') }, 'kind: one of xilinx, silinx');
  await fails('export_project', { project: 'nosuch', path: out('b3.zip') }, 'no project \'nosuch\' in the workspace');
  await fails('import_project', { name: 'blinky', from: out('blinky.zip') }, 'project \'blinky\' already exists (delete_project, or another name)');
  assert.equal((await ok('import_project', { name: 'blinky2', from: 'blinky2.zip' })).data.top, 'top');
  await fails('import_project', { name: 'n1', from: out('none.zip') }, `no file or folder '${shown('none.zip')}'`);
  fs.writeFileSync(out('notes.txt'), 'x');
  await fails('import_project', { name: 'n1', from: out('notes.txt') }, `from: '${shown('notes.txt')}' is not a .zip, a .xise or a folder`);
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
  const outside = (what, p) => `${what}: '${p}' is outside the exchange folder (SILINX_MCP_FOLDER sets another)`;
  await fails('export_project', { project: 'vga', path: path.join(away, 'vga.zip') }, outside('path', path.join(away, 'vga.zip')));
  await fails('export_project', { project: 'vga', path: '../vga.zip' }, outside('path', '../vga.zip'));
  await fails('import_project', { name: 'v1', from: P.projectDir('vga') }, outside('from', '<workspace>/vga'));
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
    assert.equal((await ok('export_project', { project: 'vga', path: 'inside/vga.zip' })).data.path, shown('inside/vga.zip'));
    assert.ok(fs.existsSync(path.join(dir, 'real/vga.zip')));
  }
  assert.ok(!fs.existsSync(P.projectDir('v1')));
  // no exchange folder
  process.env.SILINX_MCP_FOLDER = path.join(tmp, 'none');
  try { await fails('export_project', { project: 'vga', path: 'vga.zip' }, 'no exchange folder (the user\'s Downloads, or the folder SILINX_MCP_FOLDER names)'); }
  finally { process.env.SILINX_MCP_FOLDER = dir; }
});

test('#2981 a project the MCP server makes is untrusted: no Xilinx ISE for it until the user trusts it, its messages saying who made it', async () => {
  const UNTRUSTED = ' It is untrusted, as every project an assistant makes: Xilinx ISE and programming a board or a PROM wait until the user trusts it in the interface (Trust Project); the Silinx toolchain runs.';
  let r = await ok('new_project', { name: 'byai' });
  assert.equal(r.text, "Empty project 'byai' made: no board (xc3s250ecp132-4). Write its sources with write_file, then set_top." + UNTRUSTED);
  r = await ok('new_project_from_example', { name: 'byai2', example: 'blinky' });
  assert.ok(r.text.endsWith(UNTRUSTED), r.text);
  for (const name of ['byai', 'byai2']) {
    const pj = await P.readProject(name);
    assert.deepEqual([pj.trusted, pj.madeBy], [false, 'mcp'], name);
  }
  await ok('write_file', { project: 'byai', path: 'src/top.vhd', text: 'entity top is end;\narchitecture a of top is begin end;\n' });
  await ok('set_top', { project: 'byai', top: 'top' });
  await fails('run_process', { project: 'byai', process: 'synthesize', toolchain: 'ise' },
    "project 'byai' was made through the MCP server (by an assistant): Xilinx ISE runs only once you trust it (Trust Project, in the console when the project opens)");
  // the interface's description written whole keeps it so; the user's trust clears both marks
  await P.writeProject('byai', { ...(await P.readProject('byai')), trusted: true, madeBy: undefined });
  assert.deepEqual([(await P.readProject('byai')).trusted, (await P.readProject('byai')).madeBy], [false, 'mcp']);
  await P.trustProject('byai');
  const t = await P.readProject('byai');
  assert.deepEqual(['trusted' in t, 'madeBy' in t], [false, false]);
  // exported and imported again: an imported project (madeBy gone), as any zip
  await ok('export_project', { project: 'byai2', kind: 'silinx', path: out('byai2.zip') });
  await ok('import_project', { name: 'byai3', from: 'byai2.zip' });
  const i = await P.readProject('byai3');
  assert.deepEqual([i.trusted, 'madeBy' in i], [false, false]);
});

test('#2981 the trust messages: who made the project', async () => {
  const { untrustedMessage, untrustedNotice, markUntrusted, markMadeByMcp } = await import('../core/trust.js');
  assert.equal(untrustedMessage('p', 'Xilinx ISE'), "project 'p' came from outside (imported): Xilinx ISE runs only once you trust it (Trust Project, in the console when the project opens)");
  assert.equal(untrustedMessage('p', 'programming the board', { madeBy: 'mcp' }), "project 'p' was made through the MCP server (by an assistant): programming the board runs only once you trust it (Trust Project, in the console when the project opens)");
  assert.match(untrustedNotice('p', { madeBy: 'mcp' }), /^Project "p" was made through the MCP server \(by an assistant\): it is edited/);
  assert.deepEqual(markMadeByMcp({ name: 'p' }), { name: 'p', trusted: false, madeBy: 'mcp' });
  assert.deepEqual(markUntrusted({ name: 'p', madeBy: 'mcp' }), { name: 'p', trusted: false });
});
