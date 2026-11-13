// A project's paths by the import gate's rules where the server writes them: an imported silinx.json's constraints and
// files (#3411: not the description, not a hidden file), the board's constraints written there (boardConstraints), and
// a file written by PUT /projects/:p/file (#3414: no backslash, stream, trailing dot, invisible character…).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, startApp } from './server-helpers.js';

let tmp, app;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-project-names-test-')); app = await startApp(); });
after(async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const P = await import('../server/projects.js');
const { createZip } = await import('../core/zip.js');
const codec = (await import('../server/impl-routes.js')).NODE_CODEC;
const VHD = 'entity top is port (clk : in std_logic; led : out std_logic); end;\narchitecture a of top is begin led <= clk; end;\n';
const DEVICE = { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' };
const enc = s => new TextEncoder().encode(s);

test('#3411 an imported silinx.json\'s constraints and files that name the description or a hidden file: dropped, said', async () => {
  for (const [name, constraints, why] of [['ZipPj', 'silinx.json', "silinx.json, the project's description"], ['ZipHidden', '.vscode/tasks.json', "hidden file or folder ('.vscode')"]]) {
    const pj = { name: 'x', version: 1, top: 'top', device: DEVICE, board: 'basys2', constraints,
      files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }, { path: '.git/config', lang: 'text' }, { path: 'SILINX.JSON', lang: 'text' }] };
    const zip = await createZip([{ path: 'silinx.json', data: enc(JSON.stringify(pj)) }, { path: 'src/top.vhd', data: enc(VHD) }], codec);
    const r = await app.call('POST', `/projects/import-zip?name=${name}`, zip);
    assert.equal(r.status, 200, name);
    assert.deepEqual(r.body.warnings, [
      "silinx.json: file path '.git/config' dropped: hidden file or folder ('.git')",
      "silinx.json: file path 'SILINX.JSON' dropped: another spelling of silinx.json, the project's description ('SILINX.JSON')",
      `silinx.json: constraints path '${constraints}' dropped: ${why}`,
    ], name);
    const saved = await P.readProject(name);
    assert.deepEqual([saved.trusted, saved.files.map(f => f.path), saved.constraints], [false, ['src/top.vhd'], 'constraints/top.ucf'], name);
    assert.equal(fs.existsSync(path.join(P.projectDir(name), '.vscode')), false);
  }
});

test('#3411 boardConstraints refuses a hand-made constraints path that names the description or a hidden file', async () => {
  await P.createProject({ name: 'HandMade', device: DEVICE, board: 'basys2' });
  await P.writeFile('HandMade', 'src/top.vhd', VHD);
  const dir = P.projectDir('HandMade');
  const before = fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8');
  for (const [constraints, why] of [['silinx.json', "silinx.json, the project's description"], ['.vscode/tasks.json', "hidden file or folder ('.vscode')"],
    ['src/a\\b.ucf', 'backslash in the name']]) {
    const pj = { ...await P.readProject('HandMade'), top: 'top', constraints };
    await assert.rejects(P.boardConstraints(dir, pj), { status: 400, message: `the constraints file '${constraints}' is not written: ${why}` }, constraints);
  }
  assert.equal(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(dir, '.vscode')), false);
  // (the project's own, as before)
  await P.boardConstraints(dir, { ...await P.readProject('HandMade'), top: 'top', constraints: 'constraints/top.ucf' });
  assert.match(fs.readFileSync(path.join(dir, 'constraints', 'top.ucf'), 'utf8'), /^# UCF for top 'top' on /);
});

test('#3414 PUT file: a name the import gate refuses is not written, with its reason', async () => {
  await P.createProject({ name: 'PutNames', device: DEVICE });
  const dir = P.projectDir('PutNames');
  for (const [p, why] of [['src/a.vhd::$DATA', "character not allowed in a name (< > : \" | ? *): 'a.vhd::$DATA'"],
    ['src/a.vhd.', "name ending with a space or a dot ('a.vhd.')"], ['src/a.vhd ', "name ending with a space or a dot ('a.vhd ')"],
    ['src/a\u200cb.vhd', 'control, invisible or direction character in the name (U+200C)'], ['src/a\u202eb.vhd', 'control, invisible or direction character in the name (U+202E)'],
    ['src/COM\u00b9.v', "reserved name ('COM\u00b9.v')"], ['__proto__', "reserved name ('__proto__')"]]) {
    const r = await app.call('PUT', `/projects/PutNames/file?path=${encodeURIComponent(p)}`, 'x\n');
    assert.deepEqual([r.status, r.body?.error], [400, `'${p}': not written: ${why}`], p);
  }
  // (a backslash: refused as a path, by the browser store's rule, #3598)
  assert.deepEqual(Object.values((await app.call('PUT', `/projects/PutNames/file?path=${encodeURIComponent('src/a\\b.vhd')}`, 'x\n')).body), ["'src/a\\b.vhd': invalid path: backslash in the name"]);
  assert.deepEqual(fs.readdirSync(dir).filter(f => f !== 'silinx.json').sort(), ['constraints', 'sim', 'src']);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'src')), []);
  // (build/ is the browser's open synthesis's, written here: its files by the rest of their path)
  for (const p of ['src/ok.vhd', 'build/open/top.json']) assert.equal((await app.call('PUT', `/projects/PutNames/file?path=${p}`, 'x\n')).status, 200, p);
  // (the MCP's write_file the same, through the same function)
  const { handle } = await import('../server/mcp.js');
  const r = (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'write_file', arguments: { project: 'PutNames', path: 'src/a\u200cb.vhd', text: 'x' } } })).result;
  assert.deepEqual([r.isError, r.content[0].text], [true, "write_file: src/a\u200cb.vhd: not written: control, invisible or direction character in the name (U+200C)"]);
  for (const [p, why] of [['build/a\u200b.json', 'control, invisible or direction character in the name (U+200B)'], ['build/a:b.json', "character not allowed in a name (< > : \" | ? *): 'a:b.json'"]]) {
    const r = await app.call('PUT', `/projects/PutNames/file?path=${encodeURIComponent(p)}`, 'x\n');
    assert.deepEqual([r.status, r.body?.error], [400, `'${p}': not written: ${why}`], p);
  }
  // (a rename the same, the name as it was given: on Windows a backslash would be a folder's separator, #3611)
  await assert.rejects(P.renameFile('PutNames', 'src/ok.vhd', 'src/x\\y.vhd'), { status: 400, message: "'src/x\\y.vhd': invalid path: backslash in the name" });
  assert.deepEqual(fs.readdirSync(path.join(dir, 'src')), ['ok.vhd']);
});
