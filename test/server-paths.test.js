// The local server's project paths (#1229, #1234): a path is confined to its project by name and once its
// symbolic links are followed (server/paths.js, safeJoin, ISE's build), and a file written by any spelling of
// its path is listed once, by its plain path; silinx.json is not a file the file route writes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp, ws;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-paths-test-')); ws = process.env.SILINX_WORKSPACE; });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const P = await import('../server/projects.js');
const { realOf, within } = await import('../server/paths.js');
const ise = await import('../server/ise.js');
const link = (target, at) => fs.symlinkSync(target, at, fs.statSync(target).isDirectory() ? (process.platform === 'win32' ? 'junction' : 'dir') : 'file');
// (a symbolic link to a file needs rights on Windows; a link to a folder there is a junction)
const canLinkFiles = process.platform !== 'win32';

test('realOf / within: by name, and once the symbolic links are followed', () => {
  const d = path.join(tmp, 'w'), out = path.join(tmp, 'out');
  fs.mkdirSync(path.join(d, 'src'), { recursive: true });
  fs.mkdirSync(out);
  link(out, path.join(d, 'away'));
  link(path.join(d, 'src'), path.join(d, 'here'));
  assert.equal(realOf(path.join(d, 'away', 'x', 'y.v')), path.join(out, 'x', 'y.v'));   // not there yet: its folder resolved
  assert.equal(realOf(path.join(d, 'src', 'new.v')), path.join(d, 'src', 'new.v'));
  assert.equal(within(d, d), true);
  assert.equal(within(d, path.join(d, 'src', 'a.v')), true);
  assert.equal(within(d, path.join(d, 'here', 'a.v')), true, 'a link to a folder of the project');
  assert.equal(within(d, path.join(d, 'away', 'a.v')), false, 'a link out of the project');
  assert.equal(within(d, path.join(d, 'away')), false);
  assert.equal(within(d, path.join(tmp, 'w2', 'a.v')), false, 'a sibling whose name starts the same');
  assert.equal(within(d, path.join(tmp, 'out', 'a.v')), false);
  // the workspace (or the project) itself reached through a link: its files are its own
  link(d, path.join(tmp, 'wlink'));
  assert.equal(within(path.join(tmp, 'wlink'), path.join(tmp, 'wlink', 'src', 'a.v')), true);
  assert.equal(within(path.join(tmp, 'wlink'), path.join(tmp, 'wlink', 'away', 'a.v')), false);
});

test('#1229 writeFile: ./src/a.vhd, src//a.vhd and src/a.vhd are one file, listed once; silinx.json refused', async () => {
  await P.createProject({ name: 'Norm' });
  for (const p of ['src/a.vhd', './src/a.vhd', 'src//a.vhd', 'src/./x/../a.vhd']) await P.writeFile('Norm', p, 'entity a is end;\n');
  await P.writeFile('Norm', './sim//tb_a.vhd', 'entity tb_a is end;\n');
  const pj = await P.readProject('Norm');
  assert.deepEqual(pj.files.map(f => `${f.path} ${f.role}`), ['src/a.vhd design', 'sim/tb_a.vhd sim']);
  assert.deepEqual((await P.readSources('Norm')).map(s => s.path), ['src/a.vhd', 'sim/tb_a.vhd']);
  // a file removed from the project and written again by another spelling is back (not excluded)
  await P.updateProject('Norm', p => { p.excluded = ['src/a.vhd']; });
  await P.writeFile('Norm', './src/a.vhd', 'entity a is end;\n');
  assert.deepEqual((await P.readProject('Norm')).excluded, []);
  // the description: by any spelling, never through the file route (as the browser store refuses it)
  const before = fs.readFileSync(path.join(ws, 'Norm', 'silinx.json'), 'utf8');
  for (const p of ['silinx.json', './silinx.json', 'src/../silinx.json'])
    await assert.rejects(P.writeFile('Norm', p, '{}'), e => e.status === 400 && e.message === "silinx.json is the project's description", p);
  await assert.rejects(P.writeFile('Norm', '.', 'x'), e => e.status === 400 && e.message === 'missing path');
  await assert.rejects(P.writeFile('Norm', '../Other/x.v', 'x'), e => e.status === 400 && e.message === 'path escapes project');
  assert.equal(fs.readFileSync(path.join(ws, 'Norm', 'silinx.json'), 'utf8'), before);
});

test('#1234 a symbolic link in a project to a folder outside it: not read, written, built or listed as a source', async () => {
  await P.createProject({ name: 'Linked', template: 'blinky' });
  const out = path.join(tmp, 'private');
  fs.mkdirSync(out);
  fs.writeFileSync(path.join(out, 'secret.vhd'), 'secret');
  link(out, path.join(ws, 'Linked', 'lib'));
  await assert.rejects(P.readFile('Linked', 'lib/secret.vhd'), e => e.status === 400 && e.message === 'path escapes project');
  await assert.rejects(P.writeFile('Linked', 'lib/new.vhd', 'x'), e => e.message === 'path escapes project');
  await assert.rejects(P.renameFile('Linked', 'lib/secret.vhd', 'src/stolen.vhd'), e => e.message === 'path escapes project');
  await assert.rejects(P.deleteFile('Linked', 'lib/secret.vhd'), e => e.message === 'path escapes project');
  assert.deepEqual(fs.readdirSync(out), ['secret.vhd']);
  assert.equal(fs.readFileSync(path.join(out, 'secret.vhd'), 'utf8'), 'secret');
  // listed in silinx.json (a hand-edited or cloned project): not read by the sources (missing), refused by ISE's build
  const pj = await P.updateProject('Linked', p => { p.files.push({ path: 'lib/secret.vhd', lang: 'vhdl', role: 'design' }); });
  assert.deepEqual((await P.readSources('Linked')).find(s => s.path === 'lib/secret.vhd'), { path: 'lib/secret.vhd', lang: 'vhdl', role: 'design', text: '', missing: true });
  await assert.rejects(ise.generateBuild(pj, P.projectDir('Linked')), /^Error: file path escapes project: lib\/secret\.vhd$/);
  // a link to a folder of the project itself is fine
  link(path.join(ws, 'Linked', 'src'), path.join(ws, 'Linked', 'alias'));
  assert.equal(await P.readFile('Linked', 'alias/top.vhd'), await P.readFile('Linked', 'src/top.vhd'));
});

test('#3036 writeFile: a hidden file or folder refused, by its name or through a symbolic link in the project; build/ written', async () => {
  await P.createProject({ name: 'Hidden' });
  const dir = path.join(ws, 'Hidden');
  fs.mkdirSync(path.join(dir, '.git/hooks'), { recursive: true });
  link(path.join(dir, '.git'), path.join(dir, 'gitlink'));
  for (const [p, seg] of [['.git/hooks/pre-commit', '.git'], ['src/.vscode/tasks.json', '.vscode'], ['.env', '.env'], ['gitlink/hooks/pre-commit', '.git']])
    await assert.rejects(P.writeFile('Hidden', p, 'x'), e => e.status === 400 && e.message === `'${p}': not written: hidden file or folder ('${seg}')`, p);
  assert.deepEqual(fs.readdirSync(path.join(dir, '.git/hooks')), []);
  assert.ok(!fs.existsSync(path.join(dir, 'src/.vscode')) && !fs.existsSync(path.join(dir, '.env')));
  await P.writeFile('Hidden', 'build/open/top.v', 'module top; endmodule\n');   // (not a source of the project)
  assert.equal(fs.readFileSync(path.join(dir, 'build/open/top.v'), 'utf8'), 'module top; endmodule\n');
  assert.deepEqual((await P.readProject('Hidden')).files, []);
});

test('#1234 a symbolic link to a file outside the project', { skip: !canLinkFiles && 'no rights to make links to files' }, async () => {
  await P.createProject({ name: 'FileLink' });
  fs.writeFileSync(path.join(tmp, 'id_rsa'), 'KEY');
  fs.mkdirSync(path.join(ws, 'FileLink', 'src'), { recursive: true });
  link(path.join(tmp, 'id_rsa'), path.join(ws, 'FileLink', 'src', 'top.vhd'));
  await assert.rejects(P.readFile('FileLink', 'src/top.vhd'), e => e.message === 'path escapes project');
  await assert.rejects(P.writeFile('FileLink', 'src/top.vhd', 'overwritten'), e => e.message === 'path escapes project');
  assert.equal(fs.readFileSync(path.join(tmp, 'id_rsa'), 'utf8'), 'KEY');
});

test('#2917 projectDir: a project name that is not a string is refused as invalid (400), never joined into a path', () => {
  for (const name of [['demo'], { toString: () => 'demo' }, 7, null, undefined]) {
    assert.throws(() => P.projectDir(name), e => e instanceof P.HttpError && e.status === 400 && /^invalid project name/.test(e.message), String(name));
  }
  assert.equal(P.projectDir('demo'), path.join(ws, 'demo'));
  assert.throws(() => P.projectDir('../demo'), e => e.status === 400);
});
