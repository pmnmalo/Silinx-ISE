// The test files of the modules a pull request changes, run before the merge (#637): scripts/related-tests.mjs
// and .github/workflows/pr-tests.yml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { imports, dataPaths, relatedTests, reexportsOnly, shardOf, sources } from '../scripts/related-tests.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('related tests: the relative imports of a source (static, re-exports, import() of a literal)', () => {
  const text = [
    "import fs from 'node:fs';",
    "import { a, b } from '../core/a.js';",
    "import * as c from \"./c-lib.mjs\";",
    "export { d } from '../core/d.js';",
    "import '../core/side.js';",
    "const e = await import('../core/e.js');",
    "const f = await import(name);",
    "// from '../core/comment.js' in a comment of no import",
  ].join('\n');
  assert.deepEqual(imports(text).sort(), ['../core/a.js', '../core/d.js', '../core/e.js', '../core/side.js', './c-lib.mjs']);
  assert.deepEqual(imports("import x from 'pkg';"), [], 'a package, not a file of the repository');
});

test('related tests: the unit tests that import a changed module, directly or through a helper; a changed test; the test of the same name', () => {
  const files = {
    'core/a.js': "import { b } from './b.js';",
    'core/b.js': '',
    'core/c.js': '',
    'web/js/menus.js': '',
    'test/a.test.js': "import { a } from '../core/a.js';",
    'test/b.test.js': "import { b } from '../core/b.js';",
    'test/lib.mjs': "export { c } from '../core/c.js';",
    'test/c.test.js': "import { c } from './lib.mjs';",
    'test/other.test.js': "import x from 'node:fs';",
    'test/ui/menus.test.js': "import { uiTest } from './harness.js';",
    'test/ui/app.test.js': "import { uiTest } from './harness.js';",
    'test/ui/harness.js': '',
  };
  // a module: its direct importers only (core/b.js is imported by core/a.js, not test/a.test.js)
  assert.deepEqual(relatedTests(files, ['core/b.js']), { unit: ['test/b.test.js'], ui: [] });
  assert.deepEqual(relatedTests(files, ['core/a.js']), { unit: ['test/a.test.js'], ui: [] });
  // through a test helper; the helper changed itself
  assert.deepEqual(relatedTests(files, ['core/c.js']), { unit: ['test/c.test.js'], ui: [] });
  assert.deepEqual(relatedTests(files, ['test/lib.mjs']), { unit: ['test/c.test.js'], ui: [] });
  // a test changed; a UI test changed; a page script with a UI test of its name
  assert.deepEqual(relatedTests(files, ['test/other.test.js', 'test/ui/app.test.js']), { unit: ['test/other.test.js'], ui: ['test/ui/app.test.js'] });
  assert.deepEqual(relatedTests(files, ['web/js/menus.js']), { unit: [], ui: ['test/ui/menus.test.js'] });
  // the test of the same name, though it does not import the module (scripts run as programs)
  assert.deepEqual(relatedTests({ ...files, 'scripts/other.mjs': '' }, ['scripts/other.mjs']), { unit: ['test/other.test.js'], ui: [] });
  // a test that names a file it reads, by its path or its name, in quotes
  const reads = { ...files, 'test/docs.test.js': "const DOCS = ['README.md', 'CLAUDE.md'];", 'test/wf.test.js': "read('.github/workflows/ci.yml')", 'test/ui/notes.test.js': "page.open('/notes/README.md')" };
  assert.deepEqual(relatedTests(reads, ['CLAUDE.md']), { unit: ['test/docs.test.js'], ui: [] });
  assert.deepEqual(relatedTests(reads, ['.github/workflows/ci.yml']), { unit: ['test/wf.test.js'], ui: [] });
  assert.deepEqual(relatedTests(reads, ['README.md']), { unit: ['test/docs.test.js'], ui: ['test/ui/notes.test.js'] });
  assert.deepEqual(relatedTests(reads, ['docs/CLAUDE.mdx']), { unit: [], ui: [] }, 'the whole name, not a part of it');
  // nothing related: documentation, a file no test reads; a deleted file is no test
  assert.deepEqual(relatedTests(files, ['README.md', 'changes/1-x.md', 'core/gone.js']), { unit: [], ui: [] });
  // the size of the sources (#405): test/code-size.test.js for any source of core/, web/js/, server/, scripts/
  const sized = { ...files, 'test/code-size.test.js': "const DIRS = ['core', 'web/js'];" };
  assert.deepEqual(relatedTests(sized, ['core/b.js']), { unit: ['test/b.test.js', 'test/code-size.test.js'], ui: [] });
  assert.deepEqual(relatedTests(sized, ['web/js/menus.js']), { unit: ['test/code-size.test.js'], ui: ['test/ui/menus.test.js'] });
  assert.deepEqual(relatedTests(sized, ['README.md', 'test/other.test.js', 'web/css/app.css']), { unit: ['test/other.test.js'], ui: [] });
});

test('related tests: the data a source reads, named from its own place (#772)', () => {
  const here = 'path.dirname(fileURLToPath(import.meta.url))';
  // the folder of the source joined with literal parts; a constant holding a path, then joined; path.resolve
  assert.deepEqual(dataPaths('core/fpga/db-node.js', `export const DB_DIR = path.join(${here}, '..', '..', 'research', 's3e-bitstream', 'db');`), ['research/s3e-bitstream/db']);
  assert.deepEqual(dataPaths('core/fpga/dev-node.js', `export const SHIPPED = path.join(${here}, 'devices');`), ['core/fpga/devices']);
  assert.deepEqual(dataPaths('server/projects.js', `const HERE = ${here};\nexport const EXAMPLES_DIR = path.join(HERE, '..', 'examples');`), ['examples']);
  assert.deepEqual(dataPaths('test/a.test.js', `const ROOT = path.resolve(${here}, '..');\nconst f = path.join(ROOT, 'research/s6/measured', name);\nconst g = path.join(ROOT, "docs", 'A.md');`).sort(), ['docs/A.md', 'research/s6/measured']);
  assert.deepEqual(dataPaths('test/a.test.js', `const ROOT = fileURLToPath(new URL('..', import.meta.url));\nread(path.join(ROOT, 'package.json'));`), ['package.json']);
  assert.deepEqual(dataPaths('test/a.test.js', `const R = path.join(path.dirname(new URL(import.meta.url).pathname), '..');\nread(path.join(R, 'x', 'y.json'));`), ['x/y.json']);
  assert.deepEqual(dataPaths('test/a.test.js', `const FIX = path.join(${here}, 'fixtures', 'fpga');`), ['test/fixtures/fpga']);
  // new URL of a literal, of a template (its folder before the first \${…}), of a template with no \${…}
  assert.deepEqual(dataPaths('research/s3e-bitstream/pad-delays.mjs', "JSON.parse(fs.readFileSync(new URL('./measured/fix-28.json', import.meta.url)));"), ['research/s3e-bitstream/measured/fix-28.json']);
  assert.deepEqual(dataPaths('test/a.test.js', 'const p = new URL(`../research/s3e-bitstream/db/${f}`, import.meta.url);'), ['research/s3e-bitstream/db']);
  assert.deepEqual(dataPaths('test/a.test.js', 'const p = new URL(`../research/s3e-bitstream/db-${f}.json`, import.meta.url);'), ['research/s3e-bitstream']);
  assert.deepEqual(dataPaths('test/a.test.js', 'const p = new URL(`../CHANGELOG.md`, import.meta.url);'), ['CHANGELOG.md']);
  // no data: the root, a folder of the sources as a whole, a path out of the repository, a constant not known,
  // a part that is no literal (the path up to it), a join of no path (an array's), a comment of no call
  assert.deepEqual(dataPaths('scripts/x.mjs', `const ROOT = path.join(${here}, '..');\nconst y = path.join(ROOT, name);`), []);
  assert.deepEqual(dataPaths('server/server.js', `const ROOT = path.join(${here}, '..');\napp.use('/', express.static(path.join(ROOT, 'web')));\napp.use(path.join(ROOT, 'core'));`), []);
  assert.deepEqual(dataPaths('scripts/x.mjs', `const out = path.join(${here}, '..', '..', 'elsewhere');`), []);
  assert.deepEqual(dataPaths('scripts/x.mjs', "const f = path.join(dir, 'a.json'); const g = path.join(os.tmpdir(), 'b');"), []);
  assert.deepEqual(dataPaths('core/a.js', `const d = path.join(${here}, 'db', \`\${device}-lut.json\`);`), ['core/db']);
  assert.deepEqual(dataPaths('core/a.js', "const s = parts.join(', '); const t = names.join(sep);"), []);
  assert.deepEqual(dataPaths('core/a.js', ''), []);
});

test('related tests: a changed data file, the tests of the sources that read it and of their importers (#772)', () => {
  const here = 'path.dirname(fileURLToPath(import.meta.url))';
  const files = {
    'core/fpga/bitdb-node.js': `export const DB_DIR = path.join(${here}, '..', '..', 'research', 's3e-bitstream', 'db');`,
    'core/fpga/device-node.js': `export const SHIPPED = path.join(${here}, 'devices');`,
    'core/fpga/bitgen.js': '',
    'server/open-flow.js': "import { DB_DIR } from '../core/fpga/bitdb-node.js';",
    'server/server.js': "import { run } from './open-flow.js';",
    'research/s3e-bitstream/db.mjs': "export { DB_DIR } from '../../core/fpga/bitdb-node.js';",
    'research/s3e-bitstream/pad-delays.mjs': "const m = JSON.parse(fs.readFileSync(new URL('./measured/delays.json', import.meta.url)));",
    'test/bitdb-node.test.js': '',
    'test/fpga-hard.test.js': "import { DB_DIR } from '../core/fpga/bitdb-node.js';",
    'test/open-flow.test.js': "import { run } from '../server/open-flow.js';",
    'test/server.test.js': "import { start } from '../server/server.js';",
    'test/s3e-devices.test.js': "import { DB_DIR } from '../research/s3e-bitstream/db.mjs';",
    'test/fpga-bitgen.test.js': "import { bitgen } from '../core/fpga/bitgen.js';\nconst dbDir = new URL('../research/s3e-bitstream/db/', import.meta.url);",
    'test/fpga-device.test.js': "import { SHIPPED } from '../core/fpga/device-node.js';",
    'test/flow-lib.mjs': "import { DB_DIR } from '../core/fpga/bitdb-node.js';",
    'test/flow.test.js': "import { flow } from './flow-lib.mjs';",
    'test/iob-reg.test.js': "const tool = s => fileURLToPath(new URL(`../research/s3e-bitstream/${s}`, import.meta.url));",
    'test/other.test.js': "import { bitgen } from '../core/fpga/bitgen.js';",
    'test/ui/open-toolchain.test.js': "const db = new URL('../../research/s3e-bitstream/db/', import.meta.url);",
    'test/ui/app.test.js': '',
  };
  const db = ['test/bitdb-node.test.js', 'test/fpga-bitgen.test.js', 'test/fpga-hard.test.js', 'test/flow.test.js', 'test/iob-reg.test.js',
    'test/open-flow.test.js', 'test/s3e-devices.test.js', 'test/server.test.js'].sort();
  // the bit database's JSON: the loader's tests and its importers', at any depth; through a helper; the tests that
  // read the folder themselves (a unit test, a UI test); the test of the loader's name
  assert.deepEqual(relatedTests(files, ['research/s3e-bitstream/db/xc3s1200e-layout.json']), { unit: db, ui: ['test/ui/open-toolchain.test.js'] });
  // a new file of the database, which no source names: the same
  assert.deepEqual(relatedTests(files, ['research/s3e-bitstream/db/xc3s1600e-lut.json']), { unit: db, ui: ['test/ui/open-toolchain.test.js'] });
  // a device description: device-node.js's tests
  assert.deepEqual(relatedTests(files, ['core/fpga/devices/xc3s500efg320-4.json.gz']), { unit: ['test/fpga-device.test.js'], ui: [] });
  // a file a research tool reads: the tests that run the tools of its folder
  assert.deepEqual(relatedTests(files, ['research/s3e-bitstream/measured/delays.json']), { unit: ['test/iob-reg.test.js'], ui: [] });
  // not the folder: a name that only begins like it; another folder; JavaScript in the folder (its importers only)
  assert.deepEqual(relatedTests(files, ['research/s3e-bitstream/db2/x.json']), { unit: ['test/iob-reg.test.js'], ui: [] });
  assert.deepEqual(relatedTests(files, ['research/other/db/x.json', 'docs/x.md']), { unit: [], ui: [] });
  assert.deepEqual(relatedTests(files, ['core/fpga/devices/make.js']), { unit: [], ui: [] });
});

test('related tests: the repository — the bit database, a device description, an example select the tests that read them (#772)', () => {
  const files = sources();
  assert.ok(Object.keys(files).includes('research/s3e-bitstream/db.mjs'), 'the research tools, which read the database too');
  // #748: the database alone changed, its tests not run; a file of the database that is not there yet, the same
  for (const f of ['packages/silinx-fpga/bitdb/xc3s1200e-tiles.json', 'packages/silinx-fpga/bitdb/xc3s9999e-lut.json']) {
    const { unit } = relatedTests(files, [f]);
    for (const t of ['packages/silinx-fpga/test/fpga-hard.test.js', 'test/open-flow.test.js', 'test/s3e-devices.test.js', 'test/fpga-bitgen.test.js', 'test/open-flow-core.test.js']) assert.ok(unit.includes(t), `${f}: ${t}`);
    assert.ok(!unit.includes('test/schdoc.test.js') && !unit.includes('test/code-size.test.js'), f);
  }
  const dev = relatedTests(files, ['packages/silinx-fpga/devices/xc3s500efg320-4.json.gz']).unit;
  for (const t of ['packages/silinx-fpga/test/fpga-device.test.js', 'test/open-flow.test.js', 'test/s3e-devices.test.js']) assert.ok(dev.includes(t), t);
  const ex = relatedTests(files, ['examples/gates/silinx.json']).unit;
  for (const t of ['test/examples.test.js', 'test/gates-example.test.js']) assert.ok(ex.includes(t), t);
  // the measurements a research tool reads; a test's fixture
  assert.ok(relatedTests(files, ['research/s3e-bitstream/measured/fix-28-pad-delays.json']).unit.includes('test/iob-reg.test.js'));
  assert.ok(relatedTests(files, ['packages/silinx-fpga/test/fixtures/fpga/new.xdl']).unit.includes('packages/silinx-fpga/test/fpga-pack.test.js'));
  // a style sheet: no server test (a server serves web/ as a whole), documentation: none of the flow's
  assert.ok(!relatedTests(files, ['web/css/app.css']).unit.includes('test/server.test.js'));
  assert.ok(!relatedTests(files, ['changes/1-x.md']).unit.includes('test/open-flow.test.js'));
});

test('related tests: in parts of about the same time, the UI tests balanced too, the heaviest with the lightest unit part (#1032)', () => {
  const all = { unit: ['test/a.test.js', 'test/b.test.js', 'test/c.test.js'], ui: ['test/ui/x.test.js'] };
  const t = { 'test/a.test.js': 10, 'test/b.test.js': 6, 'test/c.test.js': 5 };
  // (one UI test: with the lighter unit part, 10 against 11)
  assert.deepEqual(shardOf(all, { i: 1, n: 2 }, t), { unit: ['test/a.test.js'], ui: ['test/ui/x.test.js'] });
  assert.deepEqual(shardOf(all, { i: 2, n: 2 }, t), { unit: ['test/b.test.js', 'test/c.test.js'], ui: [] });
  assert.deepEqual(shardOf(all, { i: 1, n: 2 }, { ...t, 'test/c.test.js': 3 }).ui, [], 'b and c the lighter: 9 against 10');
  assert.deepEqual(shardOf({ unit: [], ui: [] }, { i: 3, n: 3 }), { unit: [], ui: [] });
  // many UI tests (#983's 22: all of them in part 1 passed its 45 minutes): spread over the parts, every test once
  const ui = Array.from({ length: 22 }, (_, k) => `test/ui/u${String(k).padStart(2, '0')}.test.js`);
  const tu = { ...t, ...Object.fromEntries(ui.map((f, k) => [f, 60 + 10 * k])) };
  const parts = [1, 2, 3].map((i) => shardOf({ unit: all.unit, ui }, { i, n: 3 }, tu));
  assert.deepEqual(parts.flatMap((p) => p.ui).sort(), ui);
  assert.deepEqual(parts.flatMap((p) => p.unit).sort(), all.unit);
  const time = (p) => [...p.unit, ...p.ui].reduce((s, f) => s + tu[f], 0);
  const times = parts.map(time), total = times.reduce((a, b) => a + b, 0);
  assert.ok(Math.max(...times) < 0.4 * total, `${times} of ${total}`);
  assert.ok(parts.every((p) => p.ui.length >= 7), parts.map((p) => p.ui.length).join(' '));
});

test('related tests: the repository — the synthesis\'s tests for a change of the package\'s synth-open.js (#635\'s), its helpers read', () => {
  const files = sources();
  assert.ok(Object.keys(files).some(f => f === 'test/examples-lib.mjs'), 'the helpers');
  assert.ok(!Object.keys(files).some(f => f.startsWith('node_modules/') || f.includes('/fixtures/')));
  const { unit } = relatedTests(files, ['packages/silinx-fpga/src/synth-open.js']);
  for (const f of ['test/synth-open.test.js', 'test/carry-chain.test.js']) assert.ok(unit.includes(f), f);
  assert.ok(!unit.includes('test/schdoc.test.js'));
});

test('related tests: a module of the toolchain\'s package, through core/\'s old path that re-exports it (#1677)', () => {
  assert.equal(reexportsOnly("// moved\nexport * from '../packages/p/src/a.js';\nexport { b, c } from './b.js';\n"), true);
  assert.equal(reexportsOnly("export * from './a.js';\nexport const x = 1;\n"), false);
  assert.equal(reexportsOnly("import { a } from './a.js';\nexport { a };\n"), false);
  assert.equal(reexportsOnly('// nothing\n'), false);
  const files = {
    'packages/p/src/fpga/route.js': '',
    'packages/p/src/fpga/place.js': "import { r } from './route.js';",
    'core/fpga/route.js': "// moved\nexport * from '../../packages/p/src/fpga/route.js';\n",
    'core/fpga/place.js': "export * from '../../packages/p/src/fpga/place.js';\n",
    'core/flow.js': "import { r } from './fpga/route.js';\nexport const flow = r;",
    'test/fpga-route.test.js': "import { r } from '../core/fpga/route.js';",
    'test/fpga-place.test.js': "import { p } from '../core/fpga/place.js';",
    'test/flow.test.js': "import { flow } from '../core/flow.js';",
  };
  // the module, its re-export, the tests that import the re-export; not the importers of a module that does more
  assert.deepEqual(relatedTests(files, ['packages/p/src/fpga/route.js']).unit, ['test/fpga-route.test.js']);
  assert.deepEqual(relatedTests(files, ['packages/p/src/fpga/place.js']).unit, ['test/fpga-place.test.js']);
  // the repository: a change of the package's router runs the router's tests, in the package's folder of tests too (#1680)
  const { unit } = relatedTests(sources(), ['packages/silinx-fpga/src/fpga/route.js']);
  for (const f of ['packages/silinx-fpga/test/fpga-route.test.js', 'packages/silinx-fpga/test/route-parts.test.js', 'test/code-size.test.js']) assert.ok(unit.includes(f), f);
  // its test helper changed: the tests that import it, in both folders
  const sim = relatedTests(sources(), ['packages/silinx-fpga/test/fpga-sim.js']).unit;
  for (const f of ['packages/silinx-fpga/test/fpga-pack.test.js', 'test/iob-pack.test.js']) assert.ok(sim.includes(f), f);
});

test('related tests: the command line, in a repository of its own — the list, a part, a failing test, no test', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-related-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd: dir, encoding: 'utf8' }).trim();
  fs.mkdirSync(path.join(dir, 'scripts')); fs.mkdirSync(path.join(dir, 'core')); fs.mkdirSync(path.join(dir, 'test'));
  for (const f of ['related-tests.mjs', 'test-shard.mjs']) fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(dir, 'scripts', f));
  fs.writeFileSync(path.join(dir, 'core', 'a.js'), 'export const a = 1;\n');
  fs.writeFileSync(path.join(dir, 'test', 'a.test.js'), "import { test } from 'node:test'; import assert from 'node:assert'; import { a } from '../core/a.js'; test('a', () => assert.equal(a, 1));\n");
  fs.writeFileSync(path.join(dir, 'README.md'), 'x\n');
  git('init', '-q'); git('add', '.'); git('commit', '-q', '-m', '1');
  const base = git('rev-parse', 'HEAD');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const run = (...a) => spawnSync(process.execPath, ['scripts/related-tests.mjs', ...a], { cwd: dir, encoding: 'utf8', env });
  // documentation only: nothing to run
  fs.writeFileSync(path.join(dir, 'README.md'), 'y\n'); git('commit', '-qam', '2');
  let r = run(base, 'HEAD');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '1 file(s) changed; the tests of their modules: 0 unit, 0 UI\n');
  // the module changed, wrongly: its test listed, then failing
  fs.writeFileSync(path.join(dir, 'core', 'a.js'), 'export const a = 2;\n'); git('commit', '-qam', '3');
  r = run(base, 'HEAD', '--list');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '2 file(s) changed; the tests of their modules: 1 unit, 0 UI\n  test/a.test.js\n');
  assert.equal(run(base, 'HEAD', '--shard', '2/2', '--list').stdout, '2 file(s) changed; the tests of their modules: 1 unit, 0 UI; part 2/2: 0 unit, 0 UI\n');
  r = run(base, 'HEAD', '--test-reporter=tap');
  assert.equal(r.status, 1, r.stdout);
  assert.match(r.stdout, /^not ok 1 - a$/m);
  // errors: no arguments; a base that is not there; a bad part
  r = run();
  assert.equal(r.status, 2);
  assert.equal(r.stderr, 'usage: node scripts/related-tests.mjs <base> <head> [--shard i/n] [--list] [node --test options …]\n');
  r = run('f'.repeat(40), 'HEAD');
  assert.equal(r.status, 2);
  assert.equal(r.stderr, `the files changed from ${'f'.repeat(40)} to HEAD are not known (is ${'f'.repeat(40)} fetched?)\n`);
  assert.equal(run(base, 'HEAD', '--shard', '4/3').status, 2);
});

test('PR tests: every pull request, three parts, the related-tests verdict main requires', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/pr-tests.yml'), 'utf8');
  assert.match(yml, /^on:\n {2}pull_request:\npermissions:\n {2}contents: read\n/m);
  assert.match(yml, /^concurrency:\n {2}group: pr-tests-\$\{\{ github\.ref \}\}\n {2}cancel-in-progress: true\n/m);
  assert.match(yml, /\n {8}shard: \[1, 2, 3\]\n {4}runs-on: ubuntu-latest\n/, "GitHub's runner, never the self-hosted one");
  assert.match(yml, /fetch-depth: 0\n\s+- uses: \.\/\.github\/actions\/setup\n\s+- run: >-\n\s+node scripts\/related-tests\.mjs "origin\/\$BASE" HEAD --shard "\$SHARD\/3"\n\s+--test-reporter=tap --test-reporter-destination=stdout\n\s+env:\n\s+BASE: \$\{\{ github\.base_ref \}\}/);
  assert.match(yml, /\n {2}related-tests:\n {4}if: always\(\)\n {4}needs: \[tests\]\n[\s\S]*- if: contains\(needs\.\*\.result, 'failure'\) \|\| contains\(needs\.\*\.result, 'cancelled'\)\n\s+run: exit 1\n/);
  for (const f of ['CLAUDE.md', 'ONBOARDING.md']) assert.match(fs.readFileSync(path.join(ROOT, f), 'utf8'), /related-tests/, f);
});
