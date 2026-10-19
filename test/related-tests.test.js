// The test files of the modules a pull request changes, run before the merge (#637): scripts/related-tests.mjs
// and .github/workflows/pr-tests.yml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { imports, relatedTests, shardOf, sources } from '../scripts/related-tests.mjs';

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
});

test('related tests: in parts of about the same time, the UI tests in the first', () => {
  const all = { unit: ['test/a.test.js', 'test/b.test.js', 'test/c.test.js'], ui: ['test/ui/x.test.js'] };
  const t = { 'test/a.test.js': 10, 'test/b.test.js': 6, 'test/c.test.js': 5 };
  assert.deepEqual(shardOf(all, { i: 1, n: 2 }, t), { unit: ['test/a.test.js'], ui: ['test/ui/x.test.js'] });
  assert.deepEqual(shardOf(all, { i: 2, n: 2 }, t), { unit: ['test/b.test.js', 'test/c.test.js'], ui: [] });
  assert.deepEqual(shardOf({ unit: [], ui: [] }, { i: 3, n: 3 }), { unit: [], ui: [] });
});

test('related tests: the repository — the synthesis\'s tests for a change of core/synth-open.js (#635\'s), its helpers read', () => {
  const files = sources();
  assert.ok(Object.keys(files).some(f => f === 'test/examples-lib.mjs'), 'the helpers');
  assert.ok(!Object.keys(files).some(f => f.startsWith('node_modules/') || f.includes('/fixtures/')));
  const { unit } = relatedTests(files, ['core/synth-open.js']);
  for (const f of ['test/synth-open.test.js', 'test/carry-chain.test.js']) assert.ok(unit.includes(f), f);
  assert.ok(!unit.includes('test/schdoc.test.js'));
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
