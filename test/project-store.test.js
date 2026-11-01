// Unit tests of the browser edition's project storage (web/js/project-store.js): the browser's
// storage and a workspace folder on the disk (File System Access API, here an in-memory
// FileSystemDirectoryHandle: test/fixtures/fs-access-fake.js), behind the same project operations;
// a project in the folder is written exactly as the full application's server writes it
// (server/projects.js: silinx.json and the files).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { scratchEnv, HERE } from './server-helpers.js';
import { fakeDirectory, dump } from './fixtures/fs-access-fake.js';
import { byLastUsed, browserStore, folderStore, projectOps, copyProjects, projectJsonText, saveBuildResults, readBuildResults, BUILD_REPORTS, BUILD_VIEW } from '../web/js/project-store.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-store-test-'); });
after(async () => { await fsp.rm(tmp, { recursive: true, force: true }); });
const P = await import('../server/projects.js');

// the examples as the single-file build embeds them (scripts/build-standalone.mjs)
function readTree(dir, base = '') {
  const out = {};
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    // hidden files (a Mac's .DS_Store) are not part of a project: the server skips them too
    if (e.name.startsWith('.')) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) Object.assign(out, readTree(dir, rel));
    else if (rel !== 'silinx.json') out[rel] = fs.readFileSync(path.join(dir, rel), 'utf8');
  }
  return out;
}
const EXDIR = path.join(HERE, '..', 'examples');
const EXAMPLES = Object.fromEntries(fs.readdirSync(EXDIR).filter((n) => fs.existsSync(path.join(EXDIR, n, 'silinx.json')))
  .map((n) => [n, { json: JSON.parse(fs.readFileSync(path.join(EXDIR, n, 'silinx.json'), 'utf8')), files: readTree(path.join(EXDIR, n)) }]));

// a project folder of the server's workspace as { 'path': text, 'dir/': null } (dump's shape)
function diskTree(dir, base = '', out = {}) {
  for (const e of fs.readdirSync(path.join(dir, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) { out[`${rel}/`] = null; diskTree(dir, rel, out); } else out[rel] = fs.readFileSync(path.join(dir, rel), 'utf8');
  }
  return out;
}
const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const under = (tree, name) => sorted(Object.fromEntries(Object.entries(tree).filter(([k]) => k.startsWith(`${name}/`) && k !== `${name}/`).map(([k, v]) => [k.slice(name.length + 1), v])));
const memStorage = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }; };
const folder = () => { const root = fakeDirectory('Silinx-projects'); const store = folderStore(root); return { root, store, ops: projectOps(() => store, EXAMPLES) }; };

test('folder: a new empty project is the server\'s (silinx.json text, src/ sim/ constraints/)', async () => {
  const { root, ops } = folder();
  const pj = await ops.create({ name: 'Empty', board: 'basys2' });
  await P.createProject({ name: 'Empty', board: 'basys2' });
  const server = diskTree(P.projectDir('Empty'));
  assert.deepEqual(under(await dump(root), 'Empty'), sorted(server));
  assert.deepEqual(Object.keys(server).sort(), ['constraints/', 'silinx.json', 'sim/', 'src/']);
  assert.equal(server['silinx.json'], projectJsonText('Empty', pj));
  // (modified: its project file's date, #1156)
  const [listed] = await ops.list();
  assert.ok(listed.modified > Date.now() - 60e3 && listed.modified <= Date.now());
  assert.deepEqual([listed], [{ name: 'Empty', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, top: '', board: 'basys2', modified: listed.modified }]);
});

test('folder: a project from each example is the server\'s, file for file', async () => {
  const { root, ops } = folder();
  for (const t of Object.keys(EXAMPLES)) {
    const name = `Ex_${t}`;
    await ops.create({ name, template: t });
    await P.createProject({ name, template: t });
    assert.deepEqual(under(await dump(root), name), sorted(diskTree(P.projectDir(name))), t);
  }
  assert.deepEqual(Object.keys(EXAMPLES).sort(), ['blinky', 'clock', 'gates', 'isqrt', 'pong', 'stopwatch', 'traffic', 'vga']);
});

test('folder: writing, renaming (files and folders), deleting and saving keep silinx.json as the server does', async () => {
  const { root, ops, store } = folder();
  await ops.create({ name: 'Edit' });
  await P.createProject({ name: 'Edit' });
  const both = async (fn, sfn) => { await fn(); await sfn(); };
  await both(() => ops.writeFile('Edit', 'src/a.vhd', 'entity a is end;\n'), () => P.writeFile('Edit', 'src/a.vhd', 'entity a is end;\n'));
  await both(() => ops.writeFile('Edit', 'sim/tb_a.vhd', '-- tb\n'), () => P.writeFile('Edit', 'sim/tb_a.vhd', '-- tb\n'));
  await both(() => ops.writeFile('Edit', 'notes.txt', 'n'), () => P.writeFile('Edit', 'notes.txt', 'n'));
  await both(() => ops.writeFile('Edit', 'ip/deep/er/x.v', 'module x; endmodule\n'), () => P.writeFile('Edit', 'ip/deep/er/x.v', 'module x; endmodule\n'));
  await both(() => ops.writeFile('Edit', 'constraints/top.ucf', 'NET "a" LOC = "P1";\n'), () => P.writeFile('Edit', 'constraints/top.ucf', 'NET "a" LOC = "P1";\n'));
  await both(() => ops.renameFile('Edit', 'src/a.vhd', 'src/b.vhd'), () => P.renameFile('Edit', 'src/a.vhd', 'src/b.vhd'));
  await both(() => ops.renameFile('Edit', 'ip', 'lib'), () => P.renameFile('Edit', 'ip', 'lib'));
  await both(() => ops.renameFile('Edit', 'constraints', 'ucf'), () => P.renameFile('Edit', 'constraints', 'ucf'));
  await both(() => ops.deleteFile('Edit', 'sim/tb_a.vhd'), () => P.deleteFile('Edit', 'sim/tb_a.vhd'));
  const pj = await ops.project('Edit');
  assert.deepEqual(pj.fileTree, ['lib/deep/er/x.v', 'notes.txt', 'src/b.vhd', 'ucf/top.ucf']);
  await both(() => ops.saveProject('Edit', { ...pj, top: 'b' }), async () => P.writeProject('Edit', { ...await P.readProject('Edit'), top: 'b' }));
  const tree = under(await dump(root), 'Edit');
  assert.deepEqual(tree, sorted(diskTree(P.projectDir('Edit'))));
  assert.deepEqual(JSON.parse(tree['silinx.json']).files, [{ path: 'src/b.vhd', lang: 'vhdl', role: 'design' }, { path: 'lib/deep/er/x.v', lang: 'verilog', role: 'design' }]);
  assert.equal(JSON.parse(tree['silinx.json']).constraints, 'ucf/top.ucf');
  assert.equal(await ops.readFile('Edit', 'lib/deep/er/x.v'), 'module x; endmodule\n');
  assert.deepEqual((await ops.sources('Edit')).map((s) => [s.path, s.text, !!s.missing]), [['src/b.vhd', 'entity a is end;\n', false], ['lib/deep/er/x.v', 'module x; endmodule\n', false]]);
  // a file written again leaves the excluded list; a folder deleted with everything in it
  await ops.saveProject('Edit', { ...await ops.project('Edit'), excluded: ['notes.txt'] });
  await ops.writeFile('Edit', 'notes.txt', 'again');
  assert.equal((await ops.project('Edit')).excluded.length, 0);
  await ops.deleteFile('Edit', 'lib');
  assert.deepEqual((await ops.project('Edit')).fileTree, ['notes.txt', 'src/b.vhd', 'ucf/top.ucf']);
  assert.deepEqual((await ops.project('Edit')).files, [{ path: 'src/b.vhd', lang: 'vhdl', role: 'design' }]);
  assert.equal(Object.keys(await dump(root)).some((k) => k.startsWith('Edit/lib')), false);
  // the build's files: in build/, not in the project's files; read back as bytes
  await store.writeBuild('Edit', 'build/top.bit', new Uint8Array([0, 9, 255]));
  assert.deepEqual([...await store.readBinary('Edit', 'build/top.bit')], [0, 9, 255]);
  assert.equal(await store.readBinary('Edit', 'build/none.bit'), null);
  assert.deepEqual((await ops.project('Edit')).fileTree, ['notes.txt', 'src/b.vhd', 'ucf/top.ucf']);
});

test('folder: the exact errors (as the browser storage\'s)', async () => {
  for (const make of [() => folder(), () => { const s = browserStore(memStorage()); return { ops: projectOps(() => s, EXAMPLES) }; }]) {
    const { ops } = make();
    await ops.create({ name: 'Err' });
    await ops.writeFile('Err', 'src/a.vhd', 'a');
    await ops.writeFile('Err', 'src/b.vhd', 'b');
    await ops.writeFile('Err', 'lib/x.v', 'x');
    const errs = [
      [() => ops.create({ name: 'Err' }), "project 'Err' already exists"],
      [() => ops.create({ name: '1bad' }), "invalid project name '1bad'"],
      [() => ops.create({ name: 'T', template: 'nope' }), "unknown template 'nope'"],
      [() => ops.project('Nope'), "project 'Nope' not found"],
      [() => ops.readFile('Err', 'src/zz.vhd'), "file 'src/zz.vhd' not found"],
      [() => ops.renameFile('Err', 'src/zz.vhd', 'src/y.vhd'), "file 'src/zz.vhd' not found"],
      [() => ops.renameFile('Err', 'src/a.vhd', 'src/b.vhd'), "'src/b.vhd' already exists"],
      [() => ops.renameFile('Err', 'lib', 'lib/inner'), "cannot move 'lib' into itself"],
      [() => ops.renameFile('Err', 'lib', 'src'), "'src' already exists"],
      [() => ops.writeFile('Err', '../out.v', 'x'), 'invalid path'],
    ];
    for (const [fn, msg] of errs) await assert.rejects(fn, { message: msg });
  }
});

test('folder: listing (no hidden folders, no folders without silinx.json), reading again what changed on the disk, delete to .trash', async () => {
  const { root, ops } = folder();
  await ops.create({ name: 'Bbb' });
  await ops.create({ name: 'Aaa', template: 'blinky' });
  await root.getDirectoryHandle('not-a-project', { create: true });
  await (await root.getDirectoryHandle('.hidden', { create: true })).getDirectoryHandle('Ccc', { create: true });
  assert.deepEqual((await ops.list()).map((p) => p.name), ['Aaa', 'Bbb']);
  // another program changed a file: opening the project reads it again
  await ops.readFile('Aaa', 'src/top.vhd');
  const w = await (await (await (await root.getDirectoryHandle('Aaa')).getDirectoryHandle('src')).getFileHandle('top.vhd')).createWritable();
  await w.write('-- changed outside\n'); await w.close();
  await ops.project('Aaa');
  assert.equal(await ops.readFile('Aaa', 'src/top.vhd'), '-- changed outside\n');
  // deleted: into .trash/<name>-<time>, as the server does
  await ops.deleteProject('Aaa');
  assert.deepEqual((await ops.list()).map((p) => p.name), ['Bbb']);
  const tree = await dump(root);
  const trashed = Object.keys(tree).find((k) => /^\.trash\/Aaa-\d+\/$/.test(k));
  assert.ok(trashed, Object.keys(tree).join(' '));
  assert.equal(tree[`${trashed}src/top.vhd`], '-- changed outside\n');
  assert.ok(tree[`${trashed}silinx.json`].includes('"name": "Aaa"'));
  await assert.rejects(() => ops.project('Aaa'), { message: "project 'Aaa' not found" });
});

test('browser storage: the same operations, kept in localStorage under silinx.standalone.fs (the format of earlier versions)', async () => {
  const ls = memStorage();
  ls.setItem('silinx.standalone.fs', JSON.stringify({ Old: { json: { name: 'Old', version: 1, files: [], top: 'x' }, files: { 'src/x.vhd': '-- x' } } }));
  const s = browserStore(ls);
  const ops = projectOps(() => s, EXAMPLES);
  assert.deepEqual((await ops.list()).map((p) => p.name), ['Old']);
  await ops.create({ name: 'New', template: 'pong' });
  await ops.writeFile('New', 'src/extra.v', 'module extra; endmodule');
  await ops.renameFile('New', 'src', 'rtl');
  const saved = JSON.parse(ls.getItem('silinx.standalone.fs'));
  assert.deepEqual(Object.keys(saved), ['Old', 'New']);
  assert.ok(saved.New.json.files.every((f) => f.path.startsWith('rtl/') || f.path.startsWith('sim/')));
  assert.equal(saved.New.files['rtl/extra.v'], 'module extra; endmodule');
  await ops.deleteProject('Old');
  assert.deepEqual(Object.keys(JSON.parse(ls.getItem('silinx.standalone.fs'))), ['New']);
  // a full localStorage: why, and what to do
  const full = browserStore({ getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } });
  await assert.rejects(() => projectOps(() => full).create({ name: 'Big' }),
    { message: 'browser storage is full or unavailable (QuotaExceededError); download your project bundle to keep it' });
});

test('copying the browser\'s projects into the folder: the same projects; one of the same name already there is not copied', async () => {
  const ls = memStorage();
  const b = browserStore(ls);
  const bops = projectOps(() => b, EXAMPLES);
  await bops.create({ name: 'One', template: 'blinky' });
  await bops.writeFile('One', 'src/mine.vhd', '-- mine\n');
  await bops.create({ name: 'Two' });
  const { root, store, ops } = folder();
  await ops.create({ name: 'Two' });
  assert.deepEqual(await copyProjects(b, store), { copied: ['One'], skipped: ['Two'] });
  assert.deepEqual((await ops.list()).map((p) => p.name), ['One', 'Two']);
  const one = await bops.project('One');
  assert.deepEqual(await ops.project('One'), one);
  const tree = await dump(root);
  assert.equal(tree['One/silinx.json'], projectJsonText('One', (await b.load('One')).json));
  assert.equal(tree['One/src/mine.vhd'], '-- mine\n');
  // the browser's projects stay
  assert.deepEqual((await bops.list()).map((p) => p.name), ['One', 'Two']);
});

test('the fake folder: kept in a Storage and read back (a page reload), its permission asked again', async () => {
  const ls = memStorage();
  const a = fakeDirectory('Silinx-projects', { storage: ls, key: 'k' });
  await projectOps(() => folderStore(a), EXAMPLES).create({ name: 'Kept', template: 'clock' });
  const b = fakeDirectory('Silinx-projects', { storage: ls, key: 'k', permission: 'prompt' });
  assert.equal(await b.queryPermission({ mode: 'readwrite' }), 'prompt');
  assert.deepEqual((await projectOps(() => folderStore(b)).list()).map((p) => p.name), ['Kept']);
  await assert.rejects(() => projectOps(() => folderStore(b)).create({ name: 'No' }), { name: 'NotAllowedError' });
  assert.equal(await b.requestPermission({ mode: 'readwrite' }), 'granted');
  await projectOps(() => folderStore(b)).create({ name: 'Yes' });
  assert.deepEqual(Object.keys(await dump(fakeDirectory('x', { storage: ls, key: 'k' }))).filter((k) => k.endsWith('silinx.json')), ['Kept/silinx.json', 'Yes/silinx.json']);
});

// a hidden file in an example's folder (a Mac's .DS_Store, left by the Finder) is not copied into a
// project, neither by the server nor by the single-file edition's build (scripts/build-standalone.mjs)
test('hidden files of an example (.DS_Store) are not part of the projects made from it', async () => {
  const hidden = path.join(EXDIR, 'pong', '.silinx-hidden-test');
  fs.writeFileSync(hidden, 'not a project file\n');
  try {
    await P.createProject({ name: 'HiddenPong', template: 'pong' });
    assert.deepEqual(Object.keys(diskTree(P.projectDir('HiddenPong'))).filter((k) => k.split('/').some((s) => s.startsWith('.'))), []);
    const build = fs.readFileSync(path.join(HERE, '..', 'scripts', 'build-standalone.mjs'), 'utf8');
    assert.match(build, /if \(e\.name\.startsWith\('\.'\)\) continue;/, 'the single-file edition skips hidden files too');
  } finally { fs.rmSync(hidden, { force: true }); }
});

// #126: a build's results in the project's build/ folder (as the full application keeps them), read
// back after a reload: build/reports.json (the Design Summary) and build/open/fpga-view.json (the
// FPGA view's model of the Silinx toolchain's routed design)
const REPORT = { generatedAt: '2026-10-12T10:00:00.000Z', top: 'top', device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, source: 'open',
  synthesis: { warnings: 0 }, map: { summary: { slices: { used: 12, available: 2448 } } }, par: { routed: true }, timing: { met: true, maxFreqMHz: 123.4 },
  simModels: {}, files: { routed: 'build/open/routed.xdl' },
  summary: { synthesized: true, mapped: true, routed: true, timingMet: true, maxFreqMHz: 123.4, utilization: { slices: { used: 12, available: 2448 } }, bitstream: false } };
const VIEW = { available: true, source: 'open', modelVersion: 2, device: { part: 'xc3s250ecp132-4' }, sites: [{ name: 'SLICE_X0Y0' }] };

test('folder: a build\'s reports and FPGA view written into build/ and read back after a reload (#126)', async () => {
  const ls = memStorage();
  const a = fakeDirectory('Silinx-projects', { storage: ls, key: 'k' });
  const sa = folderStore(a);
  await projectOps(() => sa, EXAMPLES).create({ name: 'Built', template: 'blinky' });
  await saveBuildResults(sa, 'Built', { report: REPORT, view: VIEW, modelVersion: 2 });
  const tree = await dump(a);
  assert.equal(tree[`Built/${BUILD_REPORTS}`], JSON.stringify(REPORT, null, 2) + '\n', 'build/reports.json as the server writes it');
  assert.deepEqual(JSON.parse(tree[`Built/${BUILD_VIEW}`]), { key: 'browser:2', model: VIEW });
  // the page reloaded: the same folder, a new store
  const b = fakeDirectory('Silinx-projects', { storage: ls, key: 'k' });
  const sb = folderStore(b);
  assert.deepEqual(await readBuildResults(sb, 'Built', { modelVersion: 2 }), { report: REPORT, view: VIEW });
  // build/ is not among the project's files, but its files can be read (build/silinx-status.json)
  const ob = projectOps(() => sb, EXAMPLES);
  assert.deepEqual((await ob.project('Built')).fileTree.filter((f) => f.startsWith('build/')), []);
  assert.equal(await sb.readText('Built', BUILD_REPORTS), tree[`Built/${BUILD_REPORTS}`]);
  assert.equal(await sb.readText('Built', 'build/none.txt'), null);
  await assert.rejects(() => sb.readText('Nope', BUILD_REPORTS), { message: "project 'Nope' not found" });
  // another model format (an older Silinx's cache): no view (the reports still)
  assert.deepEqual(await readBuildResults(sb, 'Built', { modelVersion: 3 }), { report: REPORT, view: null });
  // a run without a view (it failed before Place & Route): the view of the earlier run removed
  await saveBuildResults(sb, 'Built', { report: { ...REPORT, summary: { ...REPORT.summary, routed: null } }, view: null, modelVersion: 2 });
  assert.equal((await dump(b))[`Built/${BUILD_VIEW}`], undefined);
  assert.equal((await readBuildResults(sb, 'Built', { modelVersion: 2 })).view, null);
});

test('folder: the FPGA view read back only of the Silinx toolchain\'s routed design, also as the full application caches it (#126)', async () => {
  const { store, ops } = folder();
  await ops.create({ name: 'Mixed', template: 'blinky' });
  const write = (p, v) => store.writeBuild('Mixed', p, typeof v === 'string' ? v : JSON.stringify(v));
  // the full application's cache (server/impl-routes.js: open:<model version>:<routed.xdl>:<graph>:…)
  await write(BUILD_REPORTS, REPORT);
  await write(BUILD_VIEW, { key: 'open:2:1760000000000:/x/xc3s250ecp132-4.json.gz:1750000000000', model: VIEW });
  assert.deepEqual(await readBuildResults(store, 'Mixed', { modelVersion: 2 }), { report: REPORT, view: VIEW });
  assert.equal((await readBuildResults(store, 'Mixed', { modelVersion: 3 })).view, null);
  // an ISE run's reports (the FPGA view of ISE's design is not in open/): no view
  await write(BUILD_REPORTS, { ...REPORT, source: 'ise' });
  assert.deepEqual(await readBuildResults(store, 'Mixed', { modelVersion: 2 }), { report: { ...REPORT, source: 'ise' }, view: null });
  // not routed: no view
  await write(BUILD_REPORTS, { ...REPORT, summary: { ...REPORT.summary, routed: false } });
  assert.equal((await readBuildResults(store, 'Mixed', { modelVersion: 2 })).view, null);
  // an unreadable cache, unreadable reports, none: nothing
  await write(BUILD_REPORTS, REPORT);
  await write(BUILD_VIEW, '{"key":');
  assert.deepEqual(await readBuildResults(store, 'Mixed', { modelVersion: 2 }), { report: REPORT, view: null });
  await write(BUILD_REPORTS, 'not json');
  assert.deepEqual(await readBuildResults(store, 'Mixed', { modelVersion: 2 }), { report: null, view: null });
  await ops.create({ name: 'Fresh', template: 'blinky' });
  assert.deepEqual(await readBuildResults(store, 'Fresh', { modelVersion: 2 }), { report: null, view: null });
});

test('browser storage: a build\'s results are not kept (this session only), nothing read back (#126)', async () => {
  const ls = memStorage();
  const store = browserStore(ls);
  await projectOps(() => store, EXAMPLES).create({ name: 'InMemory', template: 'blinky' });
  const kept = ls.getItem('silinx.standalone.fs');
  await saveBuildResults(store, 'InMemory', { report: REPORT, view: VIEW, modelVersion: 2 });
  assert.equal(ls.getItem('silinx.standalone.fs'), kept);
  assert.equal(await store.readText('InMemory', BUILD_REPORTS), null);
  assert.deepEqual(await readBuildResults(store, 'InMemory', { modelVersion: 2 }), { report: null, view: null });
});

// ---- #483: every path inside the project, the imported silinx.json normalised
import { safePath, cleanPath, normalizeProjectJson, projectFromZip, emptyProjectJson } from '../web/js/project-store.js';
import { textOf } from '../core/zip.js';

test('#483 safePath / cleanPath: hostile paths refused, odd but harmless ones normalised', () => {
  const bad = ['', '/etc/passwd', '//host/share/x', '\\\\host\\share\\x', 'C:\\Windows\\x.v', 'c:/x.v', '../out.v', 'src/../../out.v', 'src/..', '..', 'src/a\u0000.v', 'src/a\n.v', null, undefined, 42, ['src/a.v'], { path: 'src/a.v' }, '.', './', 'src/./..'];
  for (const p of bad) {
    assert.equal(safePath(p), null, `safePath(${JSON.stringify(p)})`);
    assert.throws(() => cleanPath(p), { message: 'invalid path' }, `cleanPath(${JSON.stringify(p)})`);
  }
  const ok = { 'src/top.vhd': 'src/top.vhd', 'src\\sub\\x.v': 'src/sub/x.v', './src/a.v': 'src/a.v', 'src//a.v': 'src/a.v', 'src/./a.v': 'src/a.v', 'a/b/': 'a/b', 'src/..a.v': 'src/..a.v', 'src/a..v': 'src/a..v', 'C:x.v': 'C:x.v', 'é/ü.vhd': 'é/ü.vhd', 'build/top.bit': 'build/top.bit' };
  for (const [p, n] of Object.entries(ok)) { assert.equal(safePath(p), n); assert.equal(cleanPath(p), n); }
});

test('#483 normalizeProjectJson: the examples\' descriptions unchanged; a broken one in shape, what was dropped said', () => {
  for (const [n, ex] of Object.entries(EXAMPLES)) {
    const r = normalizeProjectJson(ex.json, n);
    assert.deepEqual(r, { json: ex.json, warnings: [] }, n);
  }
  // not a description at all
  for (const bad of [null, 'x', 42, ['files'], undefined]) {
    assert.deepEqual(normalizeProjectJson(bad, 'P'), { json: emptyProjectJson('P'), warnings: ['silinx.json is not a project description: an empty project'] });
  }
  // every field of the wrong type, the paths leaving the project
  const r = normalizeProjectJson({
    name: 'Other', version: 'x', device: 'xc3s250e', board: 7, top: ['top'], simTop: null,
    files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }, { path: '../../etc/passwd', lang: 'vhdl', role: 'design' }, 'junk', { path: 'C:\\win\\x.v' }, { path: 'sim\\tb.v', lang: 'nope', role: 'sim' },
      { path: 'src/top.vhd', lang: 'vhdl', role: 'design' }, { path: 'silinx.json' }, { path: 'docs/notes.txt' }, 7, null],
    constraints: ['not', 'a', 'string'], excluded: ['src/old.vhd', '../x.vhd', 3], stimuli: 5, impl: 'fast', preferredLanguage: 'c', synthTool: 1,
  }, 'P');
  assert.deepEqual(r.warnings, [
    'silinx.json: file path outside the project dropped (../../etc/passwd)',
    'silinx.json: file path outside the project dropped ("junk")',
    'silinx.json: file path outside the project dropped (C:\\win\\x.v)',
    'silinx.json: file path outside the project dropped (silinx.json)',
    'silinx.json: file path outside the project dropped (7)',
    'silinx.json: file path outside the project dropped (null)',
    'silinx.json: constraints path outside the project dropped (["not","a","string"])',
  ]);
  assert.deepEqual(r.json, {
    name: 'P', version: 1, device: { family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, board: null, top: '', simTop: '',
    files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }, { path: 'sim/tb.v', lang: 'verilog', role: 'sim' }, { path: 'docs/notes.txt', lang: 'text', role: 'design' }],
    constraints: null, excluded: ['src/old.vhd'], stimuli: {}, impl: { optMode: 'Speed', optLevel: 1, startupClk: 'JtagClk' },
  });
  // the device's known fields only, the constraints outside the project
  const d = normalizeProjectJson({ device: { family: 'spartan3e', part: 'xc3s500e', package: 'fg320', speed: '-5', secret: 1 }, constraints: '../../x.ucf', impl: { optLevel: 2 } }, 'Q');
  assert.deepEqual(d.warnings, ['silinx.json: constraints path outside the project dropped (../../x.ucf)']);
  assert.deepEqual(d.json.device, { family: 'spartan3e', part: 'xc3s500e', package: 'fg320', speed: '-5' });
  assert.equal(d.json.constraints, null);
  assert.deepEqual(d.json.impl, { optMode: 'Speed', optLevel: 2, startupClk: 'JtagClk' });
});

test('#483 projectFromZip: entries leaving the project skipped with a warning, silinx.json normalised, the files it lists but the zip has not', () => {
  const enc = new TextEncoder();
  const E = (path, data) => ({ path, data: enc.encode(data) });
  const pj = { name: 'Evil', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }, { path: '../../etc/passwd', lang: 'vhdl', role: 'design' }, { path: 'src/gone.vhd', lang: 'vhdl', role: 'design' }], constraints: 'constraints/top.ucf', device: 'nope', stimuli: 5 };
  const entries = [E('silinx.json', JSON.stringify(pj)), E('src/top.vhd', 'entity top is end;'), E('../escape.txt', 'x'), E('/abs.txt', 'x'), E('sub\\win.v', 'module m; endmodule'),
    E('a/./b.txt', 'b'), E('build/top.bit', 'bits'), E('C:\\x.v', 'x')];
  const r = projectFromZip('Hostile', entries, { textOf, xiseProject: () => { throw new Error('no .xise here'); } });
  assert.deepEqual(r.warnings, ['zip entry outside the project skipped (../escape.txt)', 'zip entry outside the project skipped (/abs.txt)', 'zip entry outside the project skipped (C:\\x.v)',
    'silinx.json: file path outside the project dropped (../../etc/passwd)']);
  assert.deepEqual(Object.keys(r.files).sort(), ['a/b.txt', 'src/top.vhd', 'sub/win.v']);
  assert.deepEqual(r.missing, ['src/gone.vhd', 'constraints/top.ucf']);
  // (a project read with no Optimization: Fast, #2470)
  assert.deepEqual(r.json, { ...emptyProjectJson('Hostile'), impl: { optMode: 'Speed', optLevel: 1, startupClk: 'JtagClk' }, top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl', role: 'design' }, { path: 'src/gone.vhd', lang: 'vhdl', role: 'design' }], constraints: 'constraints/top.ucf' });
  // the project in a folder of the zip, silinx.json not JSON: an empty project with the files
  const r2 = projectFromZip('Sub', [E('MyProj/silinx.json', '{ not json'), E('MyProj/src/a.v', 'a'), E('MyProj/../outside.v', 'o'), E('other/x.v', 'x')], { textOf, xiseProject: null });
  assert.deepEqual(r2.warnings, ['zip entry outside the project skipped (../outside.v)', 'silinx.json is not valid JSON: ignored']);
  assert.deepEqual(Object.keys(r2.files), ['src/a.v']);
  assert.deepEqual(r2.json, emptyProjectJson('Sub'));
  assert.deepEqual(r2.missing, []);
  assert.throws(() => projectFromZip('X', [E('readme.txt', 'x')], { textOf }), { message: 'the zip contains no .xise (ISE project) and no silinx.json' });
});

test('#1228 #1230 a folder renamed or deleted: the files removed from the project stay removed, the deleted UCF is not the constraints, in both stores', async () => {
  const { ops } = folder();
  const both = async (fn, sfn) => { await fn(); await sfn(); };
  await ops.create({ name: 'Excl' });
  await P.createProject({ name: 'Excl' });
  for (const [f, t] of [['src/a.vhd', 'entity a is end;\n'], ['src/x.sch.json', '{}'], ['src/old.vhd', 'entity old is end;\n'], ['notes.txt', 'n'], ['constraints/top.ucf', '']])
    await both(() => ops.writeFile('Excl', f, t), () => P.writeFile('Excl', f, t));
  await both(async () => ops.saveProject('Excl', { ...await ops.project('Excl'), excluded: ['src/x.sch.json', 'src/old.vhd', 'notes.txt'] }),
    async () => P.writeProject('Excl', { ...await P.readProject('Excl'), excluded: ['src/x.sch.json', 'src/old.vhd', 'notes.txt'] }));
  const json = async () => { const b = await ops.project('Excl'), sv = await P.readProject('Excl'); delete b.fileTree; delete sv.fileTree; assert.deepEqual(b, sv, 'the two stores agree'); return b; };
  // a folder renamed: its removed files are removed at their new paths
  await both(() => ops.renameFile('Excl', 'src', 'hdl'), () => P.renameFile('Excl', 'src', 'hdl'));
  let pj = await json();
  assert.deepEqual(pj.excluded, ['hdl/x.sch.json', 'hdl/old.vhd', 'notes.txt']);
  assert.deepEqual(pj.files.map(f => f.path), ['hdl/a.vhd', 'hdl/old.vhd']);
  // a removed file renamed: still removed
  await both(() => ops.renameFile('Excl', 'notes.txt', 'doc/notes.txt'), () => P.renameFile('Excl', 'notes.txt', 'doc/notes.txt'));
  assert.deepEqual((await json()).excluded, ['hdl/x.sch.json', 'hdl/old.vhd', 'doc/notes.txt']);
  // the constraints' folder deleted: no constraints file (a UCF added later is adopted); a deleted folder's removed files forgotten
  await both(() => ops.deleteFile('Excl', 'constraints'), () => P.deleteFile('Excl', 'constraints'));
  assert.equal((await json()).constraints, null);
  await both(() => ops.deleteFile('Excl', 'doc'), () => P.deleteFile('Excl', 'doc'));
  pj = await json();
  assert.deepEqual(pj.excluded, ['hdl/x.sch.json', 'hdl/old.vhd']);
  // a file that is not the constraints deleted: the constraints stay
  await both(() => ops.writeFile('Excl', 'ucf/top.ucf', ''), () => P.writeFile('Excl', 'ucf/top.ucf', ''));
  await both(async () => ops.saveProject('Excl', { ...await ops.project('Excl'), constraints: 'ucf/top.ucf' }), async () => P.writeProject('Excl', { ...await P.readProject('Excl'), constraints: 'ucf/top.ucf' }));
  await both(() => ops.deleteFile('Excl', 'hdl/a.vhd'), () => P.deleteFile('Excl', 'hdl/a.vhd'));
  pj = await json();
  assert.equal(pj.constraints, 'ucf/top.ucf');
  assert.deepEqual(pj.files.map(f => f.path), ['hdl/old.vhd']);
});

test('#483 the project operations refuse a path that leaves the project, in both stores, and silinx.json as a file', async () => {
  for (const make of [() => folder(), () => { const s = browserStore(memStorage()); return { ops: projectOps(() => s, EXAMPLES) }; }]) {
    const { ops } = make();
    await ops.create({ name: 'Trav', template: 'blinky' });
    const before = await ops.project('Trav');
    for (const bad of ['../out.v', '/etc/passwd', 'C:\\x.v', 'src/../../x.v', '']) {
      await assert.rejects(ops.readFile('Trav', bad), { message: 'invalid path' }, `readFile ${bad}`);
      await assert.rejects(ops.writeFile('Trav', bad, 'x'), { message: 'invalid path' }, `writeFile ${bad}`);
      await assert.rejects(ops.renameFile('Trav', 'src/top.vhd', bad), { message: 'invalid path' }, `renameFile to ${bad}`);
      await assert.rejects(ops.renameFile('Trav', bad, 'src/x.vhd'), { message: 'invalid path' }, `renameFile from ${bad}`);
      await assert.rejects(ops.deleteFile('Trav', bad), { message: 'invalid path' }, `deleteFile ${bad}`);
      await assert.rejects(ops.put('Put', emptyProjectJson('Put'), { [bad]: 'x' }), { message: 'invalid path' }, `put ${bad}`);
    }
    for (const op of [() => ops.writeFile('Trav', 'silinx.json', '{}'), () => ops.renameFile('Trav', 'src/top.vhd', 'silinx.json'), () => ops.deleteFile('Trav', 'silinx.json')]) {
      await assert.rejects(op, { message: "silinx.json is the project's description" });
    }
    // a backslash path is the same file with forward slashes
    await ops.writeFile('Trav', 'src\\sub\\new.v', 'module n; endmodule');
    assert.equal(await ops.readFile('Trav', 'src/sub/new.v'), 'module n; endmodule');
    await ops.deleteFile('Trav', './src/sub/new.v');
    assert.deepEqual(await ops.project('Trav'), before, 'nothing else changed');
    // put: the description normalised, silinx.json among the files ignored
    const put = await ops.put('Put', { ...emptyProjectJson('Put'), top: 'a', files: 'none', constraints: 7, extra: true }, { 'silinx.json': '{}', 'src\\a.v': 'module a; endmodule' });
    assert.deepEqual(put, { ...emptyProjectJson('Put'), top: 'a', constraints: null });
    assert.deepEqual((await ops.project('Put')).fileTree, ['src/a.v']);
  }
});

// #1156: Open Project's order: by when each project was last used (its last change, or its last opening in this
// browser when later), the newest first, then by name; the browser's storage says when each project last changed
test('#1156 byLastUsed: the newest change or opening first, then by name; the browser storage\'s projects dated by their changes', async () => {
  const list = [{ name: 'b', modified: 100 }, { name: 'a', modified: 300 }, { name: 'c', modified: 0 }, { name: 'd' }, { name: 'e', modified: 200 }];
  assert.deepEqual(byLastUsed(list).map((p) => [p.name, p.used]), [['a', 300], ['e', 200], ['b', 100], ['c', 0], ['d', 0]]);
  // opened later than changed: its opening counts; earlier: its change
  assert.deepEqual(byLastUsed(list, { b: 500, e: 50, x: 900 }).map((p) => [p.name, p.used]), [['b', 500], ['a', 300], ['e', 200], ['c', 0], ['d', 0]]);
  assert.deepEqual(byLastUsed([]), []);
  // the browser's storage: each write dates its project; one saved before has none (0)
  const mem = new Map(), storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const s = browserStore(storage);
  const t0 = Date.now();
  await s.create('p1', { name: 'p1', files: [] }, { 'src/a.vhd': 'x' });
  const [m1] = (await s.list()).map((p) => p.modified);
  assert.ok(m1 >= t0 && m1 <= Date.now());
  for (const change of [() => s.writeFile('p1', 'src/a.vhd', 'y'), () => s.saveJson('p1', { name: 'p1', files: [] }), () => s.renamePath('p1', 'src/a.vhd', 'src/b.vhd'), () => s.removePath('p1', 'src/b.vhd')]) {
    const before = (await s.list())[0].modified;
    await new Promise((r) => setTimeout(r, 3));
    await change();
    assert.ok((await s.list())[0].modified > before);
  }
  mem.set('silinx.standalone.fs', JSON.stringify({ old: { json: { name: 'old', files: [] }, files: {} } }));
  assert.deepEqual((await browserStore(storage).list()).map((p) => [p.name, p.modified]), [['old', 0]]);
  // the listing of the operations passes it on
  assert.deepEqual((await projectOps(() => browserStore(storage)).list()).map((p) => p.modified), [0]);
});
