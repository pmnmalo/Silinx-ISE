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
  for (const p of ['src/a.vhd', './src/a.vhd', 'src//a.vhd']) await P.writeFile('Norm', p, 'entity a is end;\n');
  // (through a '..': refused, as the browser's store refuses it, not resolved to src/a.vhd, #3598)
  await assert.rejects(P.writeFile('Norm', 'src/./x/../a.vhd', 'x'), { status: 400, message: "'src/./x/../a.vhd': invalid path: path leaves the project ('..')" });
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
  for (const p of ['silinx.json', './silinx.json'])
    await assert.rejects(P.writeFile('Norm', p, '{}'), e => e.status === 400 && e.message === "silinx.json is the project's description", p);
  // (through a '..', the project's folder, out of the project: refused as paths, as the browser's store does, #3598)
  await assert.rejects(P.writeFile('Norm', 'src/../silinx.json', '{}'), { status: 400, message: "'src/../silinx.json': invalid path: path leaves the project ('..')" });
  await assert.rejects(P.writeFile('Norm', '.', 'x'), { status: 400, message: "'.': invalid path: the project's folder, not a file's path" });
  await assert.rejects(P.writeFile('Norm', '../Other/x.v', 'x'), { status: 400, message: "'../Other/x.v': invalid path: path leaves the project ('..')" });
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

test('#3275 a project\'s descriptor, its clone mark and a template\'s constraints: in the project only (CodeQL js/path-injection)', async () => {
  // a name that is not one (a separator, a dot, too long) is refused before any path is made of it, by every operation
  const before = fs.readdirSync(tmp).sort();
  const ops = { read: n => P.readProject(n), write: n => P.writeProject(n, { files: [] }), update: n => P.updateProject(n, pj => pj),
    trust: n => P.trustProject(n), create: n => P.createProject({ name: n }), example: n => P.createProject({ name: n, template: 'blinky' }) };
  for (const name of ['..', '../Esc', 'a/b', 'a\\b', '/abs', 'C:\\x', '.git', 'A/../../Esc', `A${'b'.repeat(64)}`, 'A.b', '', ' A'])
    for (const [op, f] of Object.entries(ops))
      await assert.rejects(async () => f(name), e => e.status === 400 && /^invalid project name/.test(e.message), `${op} ${JSON.stringify(name)}`);
  assert.deepEqual(fs.readdirSync(tmp).sort(), before, 'nothing made outside the workspace');
  // a valid name: the descriptor (its temporary file too) and the clone's mark written and removed in its folder
  await P.createProject({ name: 'Inside' });
  const dir = path.join(ws, 'Inside');
  fs.mkdirSync(path.join(dir, '.git'));
  fs.writeFileSync(path.join(dir, P.CLONE_TRUST), '{}');
  assert.equal((await P.readProject('Inside')).trusted, false);
  await P.trustProject('Inside');
  assert.equal(fs.existsSync(path.join(dir, P.CLONE_TRUST)), false);
  assert.deepEqual(fs.readdirSync(dir).filter(f => f.endsWith('.tmp')), []);
  // a template's constraints (createProject's safeJoin): a path out of the project refused
  for (const rel of ['../x.ucf', '/x.ucf', 'src/../../x.ucf', path.join(tmp, 'x.ucf')])
    assert.throws(() => P.safeJoin(dir, rel), e => e.status === 400 && e.message === 'path escapes project', rel);
});

test('#3648 the file routes (read, write, rename, delete, its trash): a path out of the project refused, by any spelling, nothing outside touched (CodeQL js/path-injection)', async () => {
  await P.createProject({ name: 'Routes' });
  const dir = path.join(ws, 'Routes');
  fs.writeFileSync(path.join(tmp, 'outside.vhd'), 'KEEP');
  fs.mkdirSync(path.join(ws, 'Other', 'src'), { recursive: true });
  fs.writeFileSync(path.join(ws, 'Other', 'src', 'b.vhd'), 'OTHER');
  await P.writeFile('Routes', 'src/a.vhd', 'A');
  const before = [fs.readdirSync(tmp).sort(), fs.readdirSync(ws).sort()];
  const escapes = ['../outside.vhd', '../../outside.vhd', 'src/../../Other/src/b.vhd', 'SRC/../../../outside.vhd', '/outside.vhd', path.join(tmp, 'outside.vhd'), '..', '../Other'];
  const ops = { read: r => P.readFile('Routes', r), write: r => P.writeFile('Routes', r, 'x'), renameFrom: r => P.renameFile('Routes', r, 'src/c.vhd'),
    renameTo: r => P.renameFile('Routes', 'src/a.vhd', r), delete: r => P.deleteFile('Routes', r), trash: r => P.deleteFile('Routes', r, { trash: true, mustExist: true }) };
  // (the temporary folder's absolute path: a drive letter on Windows, #3862)
  const reasonOf = r => (/^[A-Za-z]:/.test(r) ? 'absolute path (a drive letter)' : r.startsWith('/') ? 'absolute path' : "path leaves the project ('..')");
  for (const rel of escapes)
    for (const [op, f] of Object.entries(ops))
      // (by the path's rule first, the browser store's, #3598: a '..' or an absolute path; the system's escape after it)
      await assert.rejects(async () => f(rel), e => e.status === 400 && e.message === `'${rel}': invalid path: ${reasonOf(rel)}`, `${op} ${rel}`);
  assert.deepEqual([fs.readdirSync(tmp).sort(), fs.readdirSync(ws).sort()], before, 'nothing made or moved outside the project');
  assert.equal(fs.readFileSync(path.join(tmp, 'outside.vhd'), 'utf8'), 'KEEP');
  assert.equal(fs.readFileSync(path.join(ws, 'Other', 'src', 'b.vhd'), 'utf8'), 'OTHER');
  // the project's own paths as before: '.' its folder, a file in another case its own (#3536), its trash named after it
  assert.equal(P.safeJoin(dir, '.'), dir);
  assert.equal(await P.readFile('Routes', 'SRC/a.vhd'), 'A');
  const { trashed } = await P.deleteFile('Routes', 'src/a.vhd', { trash: true });
  assert.match(trashed, /^\.trash\/Routes-\d+\/src\/a\.vhd$/);
  assert.equal(fs.readFileSync(path.join(ws, ...trashed.split('/')), 'utf8'), 'A');
  // projectDir: the project's folder in the workspace, whatever the workspace's spelling
  const was = process.env.SILINX_WORKSPACE;
  try {
    process.env.SILINX_WORKSPACE = `${ws}${path.sep}.${path.sep}`;
    assert.equal(P.projectDir('Routes'), dir);
  } finally { process.env.SILINX_WORKSPACE = was; }
});
