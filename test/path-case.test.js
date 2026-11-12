// A project's paths in another case (#3536): SRC/extra.vhd is written into the project's src/ folder by a
// case-insensitive file system (macOS, Windows), so the project records it as src/extra.vhd, on every system (the
// local server, the browser's stores): its description, its file tree and its exported zip name the same file, and a
// clone on a case-sensitive system (Linux) finds it. A rename to a name taken in another case is refused, but a
// rename of a file's own case.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import { fakeDirectory } from './fixtures/fs-access-fake.js';
import { sameNameIn, spelledAs } from '../core/fold-name.js';
import { readZip, textOf } from '../core/zip.js';
import { browserStore, folderStore, projectOps } from '../web/js/project-store.js';

let tmp;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-case-test-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));
const P = await import('../server/projects.js');
const { exportProjectZip } = await import('../server/project-zip.js');
const { NODE_CODEC } = await import('../server/impl-routes.js');

test('#3536 sameNameIn / spelledAs: a name as the folder already spells it', async () => {
  assert.equal(sameNameIn('src', ['SRC', 'src']), 'src', 'its own spelling first');
  assert.equal(sameNameIn('SRC', ['lib', 'src']), 'src');
  assert.equal(sameNameIn('ſrc', ['src']), 'src', 'the full case fold');
  assert.equal(sameNameIn('sim', ['src']), null);
  assert.equal(sameNameIn('a', []), null);
  const tree = { '': ['src', 'Sim', 'top.ucf'], src: ['Core', 'a.vhd'], 'src/Core': ['alu.vhd'] };
  const names = async f => tree[f] || [];
  assert.equal(await spelledAs('SRC/extra.vhd', names), 'src/extra.vhd');
  assert.equal(await spelledAs('src/core/ALU.VHD', names), 'src/Core/alu.vhd');
  assert.equal(await spelledAs('sim/tb.vhd', names), 'Sim/tb.vhd');
  assert.equal(await spelledAs('new/dir/x.v', names), 'new/dir/x.v', 'folders not there: as asked');
  assert.equal(await spelledAs('SRC/A.VHD', names, { last: false }), 'src/A.VHD', 'the last name kept');
  assert.equal(await spelledAs('TOP.UCF', f => tree[f] || []), 'top.ucf', 'a synchronous lister');
});

const zipOf = async name => Object.fromEntries((await readZip((await exportProjectZip(P, name, 'silinx')).zip, NODE_CODEC)).map(e => [e.path, textOf(e)]));

test('#3536 the local server: written, renamed, read and deleted by the project\'s own spelling; the export\'s silinx.json names its files', async () => {
  await P.createProject({ name: 'Cases' });
  await P.writeFile('Cases', 'src/a.vhd', 'entity a is end;\n');
  await P.writeFile('Cases', 'SRC/extra.vhd', 'entity extra is end;\n');
  await P.writeFile('Cases', 'Src/A.vhd', 'entity a is end; -- again\n');
  const dir = P.projectDir('Cases');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'src')).sort(), ['a.vhd', 'extra.vhd']);
  assert.deepEqual(fs.readdirSync(dir).filter(n => /^src$/i.test(n)), ['src'], 'one folder');
  assert.deepEqual((await P.readProject('Cases')).files.map(f => f.path), ['src/a.vhd', 'src/extra.vhd']);
  assert.deepEqual(await P.fileTree('Cases'), ['src/a.vhd', 'src/extra.vhd']);
  assert.equal(await P.readFile('Cases', 'SRC/A.VHD'), 'entity a is end; -- again\n');
  // a rename into a folder by another spelling, to a name taken in another case (refused), of a file's own case
  fs.mkdirSync(path.join(dir, 'sim'), { recursive: true });
  await P.renameFile('Cases', 'SRC/extra.vhd', 'SIM/tb_extra.vhd');
  assert.deepEqual((await P.readProject('Cases')).files.map(f => f.path), ['src/a.vhd', 'sim/tb_extra.vhd']);
  await P.writeFile('Cases', 'src/b.vhd', 'entity b is end;\n');
  await assert.rejects(P.renameFile('Cases', 'src/b.vhd', 'src/A.VHD'), { status: 409, message: "'src/A.VHD' already exists" });
  await P.renameFile('Cases', 'src/a.vhd', 'src/A.vhd');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'src')).sort(), ['A.vhd', 'b.vhd']);
  assert.deepEqual((await P.readProject('Cases')).files.map(f => f.path), ['src/A.vhd', 'sim/tb_extra.vhd', 'src/b.vhd']);
  await P.renameFile('Cases', 'src', 'Src');
  assert.deepEqual((await P.readProject('Cases')).files.map(f => f.path), ['Src/A.vhd', 'sim/tb_extra.vhd', 'Src/b.vhd']);
  // the exported zip: its silinx.json names the files it holds
  const z = await zipOf('Cases');
  assert.deepEqual(Object.keys(z).sort(), ['Src/A.vhd', 'Src/b.vhd', 'silinx.json', 'sim/tb_extra.vhd']);
  for (const f of JSON.parse(z['silinx.json']).files) assert.ok(f.path in z, f.path);
  // deleted by another spelling: gone from the description too
  await P.deleteFile('Cases', 'SIM');
  assert.deepEqual((await P.readProject('Cases')).files.map(f => f.path), ['Src/A.vhd', 'Src/b.vhd']);
  assert.deepEqual(await P.fileTree('Cases'), ['Src/A.vhd', 'Src/b.vhd']);
  // the build folder in another case: still refused (the import gate's rule)
  await assert.rejects(P.writeFile('Cases', 'BUILD/x.vhd', '-- x\n'), { status: 400, message: "'BUILD/x.vhd': not written: the project's build folder (build/) is Silinx's own" });
});

const memStorage = () => { const m = new Map(); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; };

test('#3536 the browser\'s stores: the same paths as the server\'s', async () => {
  const stores = [['browser', browserStore(memStorage())], ['folder', folderStore(fakeDirectory('Silinx-projects'))]];
  for (const [kind, store] of stores) {
    const ops = projectOps(() => store, {});
    await ops.create({ name: 'Cases' });
    await ops.writeFile('Cases', 'src/a.vhd', 'entity a is end;\n');
    await ops.writeFile('Cases', 'SRC/extra.vhd', 'entity extra is end;\n');
    await ops.writeFile('Cases', 'Src/A.vhd', 'entity a is end; -- again\n');
    let pj = await ops.project('Cases');
    assert.deepEqual(pj.files.map(f => f.path), ['src/a.vhd', 'src/extra.vhd'], kind);
    assert.deepEqual(pj.fileTree, ['src/a.vhd', 'src/extra.vhd'], kind);
    assert.equal(await ops.readFile('Cases', 'SRC/A.VHD'), 'entity a is end; -- again\n', kind);
    await ops.writeFile('Cases', 'sim/keep.txt', '');
    await ops.renameFile('Cases', 'SRC/extra.vhd', 'SIM/tb_extra.vhd');
    await ops.writeFile('Cases', 'src/b.vhd', 'entity b is end;\n');
    await assert.rejects(ops.renameFile('Cases', 'src/b.vhd', 'src/A.VHD'), { message: "'src/A.VHD' already exists" }, kind);
    await ops.renameFile('Cases', 'src/a.vhd', 'src/A.vhd');
    await ops.renameFile('Cases', 'src', 'Src');
    pj = await ops.project('Cases');
    assert.deepEqual(pj.files.map(f => f.path), ['Src/A.vhd', 'sim/tb_extra.vhd', 'Src/b.vhd'], kind);
    assert.deepEqual(pj.fileTree, ['Src/A.vhd', 'Src/b.vhd', 'sim/keep.txt', 'sim/tb_extra.vhd'], kind);
    assert.equal(await ops.readFile('Cases', 'Src/A.vhd'), 'entity a is end; -- again\n', kind);
    await ops.deleteFile('Cases', 'SIM');
    pj = await ops.project('Cases');
    assert.deepEqual(pj.files.map(f => f.path), ['Src/A.vhd', 'Src/b.vhd'], kind);
    assert.deepEqual(pj.fileTree, ['Src/A.vhd', 'Src/b.vhd'], kind);
  }
});
