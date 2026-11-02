// The local server's defences against a project or a request that is not what it seems (#2549): links in a project's
// build folder and in the settings path, hidden files from a zip or an MCP client, Silinx's own files whatever the case,
// the pages' headers however the URL is spelled, error responses without a stack trace.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv, startApp } from './server-helpers.js';

let tmp, ws, app;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-hardening-test-')); ws = process.env.SILINX_WORKSPACE; app = await startApp(); });
after(async () => { await app.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

const P = await import('../server/projects.js');
const ise = await import('../server/ise.js');
const { createZip } = await import('../core/zip.js');
const { saveConfig } = await import('../server/toolchain.js');
const { handle } = await import('../server/mcp.js');
const POSIX = process.platform !== 'win32';
const VHD = 'entity top is end;\narchitecture a of top is begin end;\n';
const codec = (await import('../server/impl-routes.js')).NODE_CODEC;

async function project(name) {
  await P.createProject({ name, top: 'top', device: { family: 'spartan3e', part: 'xc3s100e', package: 'cp132', speed: '-4' } });
  await P.writeFile(name, 'src/top.vhd', VHD);
  await P.writeProject(name, { ...await P.readProject(name), top: 'top' });
  return P.projectDir(name);
}
const generate = async (dir, name) => ise.generateBuild(await P.readProject(name), dir, { steps: ise.STEPS });

test('a build folder that is a link out of the project: refused, its target untouched', { skip: !POSIX }, async () => {
  const dir = await project('LinkBuild');
  const out = path.join(tmp, 'victim');
  fs.mkdirSync(path.join(out, 'src'), { recursive: true });
  fs.writeFileSync(path.join(out, 'src', 'keep.txt'), 'keep');
  fs.rmSync(path.join(dir, 'build'), { recursive: true, force: true });
  fs.symlinkSync(out, path.join(dir, 'build'));
  await assert.rejects(generate(dir, 'LinkBuild'), /link out of the project/);
  assert.deepEqual(fs.readdirSync(out), ['src']);
  assert.equal(fs.readFileSync(path.join(out, 'src', 'keep.txt'), 'utf8'), 'keep');
});

test('links inside the build folder are removed, not written through', { skip: !POSIX }, async () => {
  const dir = await project('LinkInside');
  const target = path.join(tmp, 'note');
  fs.writeFileSync(target, 'mine');
  fs.mkdirSync(path.join(dir, 'build'), { recursive: true });
  fs.symlinkSync(target, path.join(dir, 'build', 'run.sh'));
  const gen = await generate(dir, 'LinkInside');
  assert.deepEqual(gen.warnings, ['no constraints file (constraints/top.ucf) - do NOT program real hardware with this bitstream']);
  assert.equal(fs.readFileSync(target, 'utf8'), 'mine');
  assert.equal(fs.lstatSync(path.join(dir, 'build', 'run.sh')).isSymbolicLink(), false);
});

test('an include file that is a link is not copied into the build', { skip: !POSIX }, async () => {
  const dir = await project('LinkInclude');
  const secret = path.join(tmp, 'secret');
  fs.writeFileSync(secret, 'secret');
  fs.symlinkSync(secret, path.join(dir, 'src', 'loot.vh'));
  await generate(dir, 'LinkInclude');
  assert.equal(fs.existsSync(path.join(dir, 'build', 'src', 'src', 'loot.vh')), false);
});

test("a folder name that would end XST's quotes: refused", async () => {
  const dir = await project('XstName');
  const evil = 'src/dir" }\n-lso evil';
  fs.mkdirSync(path.join(dir, evil), { recursive: true });
  fs.writeFileSync(path.join(dir, evil, 'x.vh'), '');
  await assert.rejects(generate(dir, 'XstName'), /not allowed in XST's script/);
});

test('sync-xise does not write through a link', { skip: !POSIX }, async () => {
  const dir = await project('LinkXise');
  const target = path.join(tmp, 'xise-note');
  fs.writeFileSync(target, 'mine');
  fs.symlinkSync(target, path.join(dir, 'LinkXise.xise'));
  const r = await app.call('POST', '/projects/LinkXise/sync-xise', { direction: 'export' });
  assert.equal(r.status, 400);
  assert.equal(fs.readFileSync(target, 'utf8'), 'mine');
});

test('the settings path through the API is kept as its real file: a link changed later has no effect', { skip: !POSIX }, async () => {
  const d = path.join(tmp, 'ise');
  fs.mkdirSync(d, { recursive: true, mode: 0o755 });
  fs.chmodSync(d, 0o755);
  const real = path.join(d, 'settings64.sh');
  fs.writeFileSync(real, ':\n', { mode: 0o644 });
  const lnk = path.join(d, 'link', 'settings64.sh');
  fs.mkdirSync(path.dirname(lnk));
  fs.chmodSync(path.dirname(lnk), 0o755);
  fs.symlinkSync(real, lnk);
  let cfg;
  try { cfg = await saveConfig({ local: { settings: lnk } }, { fromApi: true }); }
  catch (e) { if (/other users/.test(e.message)) return; throw e; }   // (a temporary folder others may write: the check itself refuses)
  assert.equal(cfg.local.settings, real);
});

test('a zip restores no hidden file or folder, and no SILINX.JSON', async () => {
  const zip = await createZip([
    { path: 'silinx.json', data: new TextEncoder().encode(JSON.stringify({ name: 'x', version: 1, top: 'top', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, files: [] })) },
    { path: 'src/ok.vhd', data: new TextEncoder().encode(VHD) },
    { path: '.git/config', data: new TextEncoder().encode('[core]\n') },
    { path: 'src/.vscode/tasks.json', data: new TextEncoder().encode('{}') },
    { path: 'SILINX.JSON', data: new TextEncoder().encode('{}') },
  ], codec);
  const r = await app.call('POST', '/projects/import-zip?name=ZipDots', zip);
  assert.equal(r.status, 200);
  const dir = P.projectDir('ZipDots');
  assert.equal(fs.existsSync(path.join(dir, 'src', 'ok.vhd')), true);
  assert.equal(fs.existsSync(path.join(dir, '.git')), false);
  assert.equal(fs.existsSync(path.join(dir, 'src', '.vscode')), false);
  assert.ok(fs.readdirSync(dir).filter(f => f.toLowerCase() === 'silinx.json').length === 1);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find(f => f.toLowerCase() === 'silinx.json')), 'utf8')).top, 'top');
});

test("Silinx's own files whatever the case: the file routes and MCP", async () => {
  await project('Cased');
  await assert.rejects(P.writeFile('Cased', 'SILINX.JSON', '{}'), /project's description/);
  await assert.rejects(P.deleteFile('Cased', 'Silinx.Json'), /cannot be deleted/);
  await assert.rejects(P.renameFile('Cased', 'SILINX.JSON', 'x.json'), /cannot be renamed/);
  const call = async args => (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'write_file', arguments: args } })).result;
  for (const p of ['SILINX.JSON', 'BUILD/run.sh', 'Build']) {
    const r = await call({ project: 'Cased', path: p, text: 'x' });
    assert.equal(r.isError, true, p);
    assert.match(r.content[0].text, /written by Silinx itself/);
  }
  for (const p of ['.git/config', 'src/.hidden/x.vhd']) {
    const r = await call({ project: 'Cased', path: p, text: 'x' });
    assert.equal(r.isError, true, p);
    assert.match(r.content[0].text, /hidden file or folder/);
  }
});

test("the pages' policy however the URL is spelled", async () => {
  const origin = app.base.replace(/\/api$/, '');
  for (const u of ['/', '/index.html', '/index.htm%6c', '/%69ndex.html', '/asm-demo.htm%6c']) {
    const r = await fetch(origin + u);
    assert.equal(r.status, 200, u);
    assert.match(r.headers.get('content-security-policy') || '', /frame-ancestors 'none'/, u);
  }
});

test('errors carry no stack trace, and a body outside the API is not parsed', async () => {
  const origin = app.base.replace(/\/api$/, '');
  for (const [u, init] of [
    ['/api/projects', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' }],
    ['/api/projects/%E0%A4%A', {}],
  ]) {
    const r = await fetch(origin + u, init);
    const text = await r.text();
    assert.equal(r.status, 400, u);
    assert.doesNotMatch(text, /\/node_modules\/|\bat [\w.]+ \(|server\.js/, u);
    assert.ok(JSON.parse(text).error, u);
  }
  const out = await fetch(`${origin}/x`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{bad' });
  assert.equal(out.status, 404);
  assert.doesNotMatch(await out.text(), /node_modules/);
});

test('a token of any bytes is refused, not a crash', async () => {
  const exposed = await startApp({ host: '0.0.0.0', token: 'abcdefghijklmnopqrstuvwx' });
  try {
    const r = await exposed.raw('GET', '/api/projects', { headers: { host: 'lan.example', 'x-silinx-token': '\u00e9'.repeat(24) } });
    assert.equal(r.status, 403);
  } finally { await exposed.close(); }
});
