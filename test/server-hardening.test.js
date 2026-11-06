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

// (Windows refuses " and a line break in a file name: there the folder cannot exist, #2620)
test("a folder name that would end XST's quotes: refused", { skip: !POSIX }, async () => {
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

// #2956: silinx.json by another spelling (U+017F, the long s: 'ſilinx.json' is silinx.json on a case-insensitive file
// system such as APFS, and toLowerCase leaves it as it is), imports untrusted from their first write, an ISE project's
// paths through the import gate, the build's copies inside build/src
const LONG_S = 'ſilinx.json';
const mcp = async (name, args) => (await handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).result;
const imported = async name => { await project(name); await P.writeProject(name, { ...await P.readProject(name), trusted: false }); return P.projectDir(name); };

test('#2956 foldName: the full case fold and NFKC, as a case-insensitive file system may read a name', () => {
  assert.equal('ſilinx.json'.toLowerCase(), 'ſilinx.json');   // (what the check was)
  for (const s of ['silinx.json', 'SILINX.JSON', LONG_S, 'SİLINX.JSON'.normalize('NFC').replace('İ', 'I'), 'ｓilinx.json']) assert.equal(P.foldName(s), 'silinx.json', s);
  assert.equal(P.foldName('buıld'), 'build');   // (the dotless i)
  for (const s of ['src/silinx.json', 'silinx.json5', 'xilinx.json']) assert.equal(P.isProjectFile(s), false, s);
});

test('#2956 silinx.json by another spelling: not written, renamed or deleted through the file routes, and the project stays untrusted', async () => {
  const dir = await imported('LongS');
  await assert.rejects(P.writeFile('LongS', LONG_S, '{"name":"LongS"}'), /project's description/);
  await assert.rejects(P.deleteFile('LongS', LONG_S), /cannot be deleted/);
  await assert.rejects(P.renameFile('LongS', LONG_S, 'x.json'), /cannot be renamed/);
  await P.writeFile('LongS', 'src/x.json', '{}');
  await assert.rejects(P.renameFile('LongS', 'src/x.json', LONG_S), /cannot be renamed/);
  // the very same file under another name (a hard link): refused as silinx.json itself
  if (POSIX) {
    fs.linkSync(path.join(dir, 'silinx.json'), path.join(dir, 'alias.json'));
    await assert.rejects(P.writeFile('LongS', 'alias.json', '{}'), /project's description/);
    await assert.rejects(P.deleteFile('LongS', 'alias.json'), /cannot be deleted/);
    fs.rmSync(path.join(dir, 'alias.json'));
  }
  assert.equal((await P.readProject('LongS')).trusted, false);
});

test('#2956 silinx.json by another spelling: the MCP tools write_file, rename_file, delete_file refuse it', async () => {
  await imported('LongSMcp');
  let r = await mcp('write_file', { project: 'LongSMcp', path: LONG_S, text: '{"name":"LongSMcp"}' });
  assert.deepEqual([r.isError, r.content[0].text], [true, `write_file: '${LONG_S}' is written by Silinx itself`]);
  r = await mcp('write_file', { project: 'LongSMcp', path: 'buıld/run.sh', text: 'x' });
  assert.deepEqual([r.isError, r.content[0].text], [true, "write_file: 'buıld/run.sh' is written by Silinx itself"]);
  for (const [tool, args] of [['delete_file', { path: LONG_S }], ['rename_file', { from: LONG_S, to: 'x.json' }], ['rename_file', { from: 'src/top.vhd', to: LONG_S }]]) {
    r = await mcp(tool, { project: 'LongSMcp', ...args });
    assert.deepEqual([r.isError, r.content[0].text], [true, `${tool}: silinx.json is the project's description`], tool);
  }
  assert.equal((await P.readProject('LongSMcp')).trusted, false);
  assert.ok(fs.existsSync(path.join(P.projectDir('LongSMcp'), 'src', 'top.vhd')));
});

test('#2956 MCP rename_file: the new name as the import gate takes a name', async () => {
  await project('RenameGate');
  for (const [to, reason] of [['src/CON.vhd', "reserved name ('CON.vhd')"], ['src/top.vhd.', "name ending with a space or a dot ('top.vhd.')"], ['src/a|b.vhd', "character not allowed in a name (< > : \" | ? *): 'a|b.vhd'"]]) {
    const r = await mcp('rename_file', { project: 'RenameGate', from: 'src/top.vhd', to });
    assert.deepEqual([r.isError, r.content[0].text], [true, `rename_file: '${to}': not renamed: ${reason}`], to);
  }
  assert.ok(fs.existsSync(path.join(P.projectDir('RenameGate'), 'src', 'top.vhd')));
});

test('#2956 a zip: no silinx.json by another spelling restored, and the project untrusted', async () => {
  const pj = { name: 'x', version: 1, top: 'top', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, files: [{ path: 'src/ok.vhd', lang: 'vhdl', role: 'design' }], trusted: true };
  const zip = await createZip([
    { path: 'silinx.json', data: new TextEncoder().encode(JSON.stringify(pj)) },
    { path: 'src/ok.vhd', data: new TextEncoder().encode(VHD) },
    { path: LONG_S, data: new TextEncoder().encode('{"name":"x","version":1,"files":[]}') },
  ], codec);
  const r = await app.call('POST', '/projects/import-zip?name=ZipLongS', zip);
  assert.equal(r.status, 200);
  const saved = await P.readProject('ZipLongS');
  assert.deepEqual([saved.trusted, saved.top, saved.files.map(f => f.path)], [false, 'top', ['src/ok.vhd']]);
});

const xise = (files, top = 'Architecture|top|rtl') => `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://www.xilinx.com/XMLSchema" xmlns:xil_pn="http://www.xilinx.com/XMLSchema"><files>
${files.map(f => `<file xil_pn:name="${f}" xil_pn:type="FILE_VHDL"><association xil_pn:name="Implementation" xil_pn:seqID="1"/></file>`).join('\n')}
</files><properties>
<property xil_pn:name="Device" xil_pn:value="xc3s250e" xil_pn:valueState="non-default"/>
<property xil_pn:name="Device Family" xil_pn:value="Spartan3E" xil_pn:valueState="non-default"/>
<property xil_pn:name="Package" xil_pn:value="cp132" xil_pn:valueState="non-default"/>
<property xil_pn:name="Speed Grade" xil_pn:value="-4" xil_pn:valueState="non-default"/>
<property xil_pn:name="Implementation Top" xil_pn:value="${top}" xil_pn:valueState="non-default"/>
</properties></project>`;

test('#2956 an ISE project whose import stops halfway leaves no trusted project', async () => {
  const r = await app.call('POST', '/projects/import-xise', { name: 'XiseHalf', xise: xise(['src/top.vhd'], 'Module|../../x'), files: { 'src/top.vhd': VHD } });
  assert.equal(r.status, 400);
  assert.equal((await P.readProject('XiseHalf')).trusted, false);
});

test('#2956 an ISE project: no file written in a hidden folder or in build/', async () => {
  const r = await app.call('POST', '/projects/import-xise', { name: 'XiseDots', xise: xise(['src/top.vhd', '.git/config', 'build/run.vhd']), files: { 'src/top.vhd': VHD, '.git/config': '[core]\n', 'build/run.vhd': VHD } });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const dir = P.projectDir('XiseDots');
  assert.equal(fs.existsSync(path.join(dir, '.git')), false);
  assert.equal(fs.existsSync(path.join(dir, 'build', 'run.vhd')), false);
  assert.deepEqual(r.body.project.files.map(f => f.path).sort(), ['src/config', 'src/run.vhd', 'src/top.vhd']);
  assert.equal(r.body.project.trusted, false);
});

test("#2956 the build copies a source by its path inside the project: silinx.json's '..' reaches nothing outside build/src", async () => {
  const dir = await project('DotDot');
  const back = `../${path.basename(dir)}/src/top.vhd`;   // (back into the project: kept by the import, as before)
  await P.writeProject('DotDot', { ...await P.readProject('DotDot'), files: [{ path: back, lang: 'vhdl', role: 'design' }] });
  const before = fs.readdirSync(path.dirname(dir)).sort();
  const b = await generate(dir, 'DotDot');
  assert.ok(fs.existsSync(path.join(dir, 'build', 'src', 'src', 'top.vhd')));
  assert.deepEqual(fs.readdirSync(path.dirname(dir)).sort(), before);
  assert.deepEqual(b.warnings, ['no constraints file (constraints/top.ucf) - do NOT program real hardware with this bitstream']);
});

test("#2956 a drawn source's name that would end XST's quotes: refused, as an HDL file's", { skip: !POSIX }, async () => {
  const dir = await project('DrawnQuote');
  fs.copyFileSync(path.resolve('examples/traffic/src/lamps.bool.json'), path.join(dir, 'src', 'la"mps.bool.json'));
  await assert.rejects(generate(dir, 'DrawnQuote'), /file path not allowed in XST's script: "src\/la\\"mps.bool.json"/);
});
