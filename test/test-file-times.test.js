// The node --test reporter of each test file's time (scripts/test-file-times.mjs, #566): each file's
// summary, the slowest first, a warning annotation for a file over the budget;
// and CI's unit tests use it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { addTime, report, BUDGET_MINUTES } from '../scripts/test-file-times.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sum = (file, ms) => ({ type: 'test:summary', data: { file, duration_ms: ms, success: true, counts: {} } });

test('test file times: each file\'s summary, the run\'s own and the tests\' events ignored', () => {
  const times = {};
  for (const e of [sum('/r/test/a.test.js', 1500), sum('/r/test/b.test.js', 200), sum(undefined, 9999),
    { type: 'test:pass', data: { file: '/r/test/lib.mjs', nesting: 0, details: { duration_ms: 9999 } } }, { type: 'test:diagnostic', data: { message: 'x' } },
    { type: 'test:summary', data: { file: '/r/test/c.test.js' } }])
    addTime(times, e);
  assert.deepEqual(times, { '/r/test/a.test.js': 1500, '/r/test/b.test.js': 200, '/r/test/c.test.js': 0 });
});

test('test file times: the report, the slowest first, a warning for each file over the budget, none under it', () => {
  const root = path.resolve('/r'), f = n => path.join(root, 'test', n);
  const times = { [f('a.test.js')]: 3 * 60000, [f('slow.test.js')]: 20.5 * 60000, [f('b.test.js')]: 12 * 60000 };
  assert.equal(BUDGET_MINUTES, 15);
  assert.deepEqual(report(times, { root }), [
    '# the slowest test files (minutes, the tests of a file one after another): 3 files',
    '#   20.5  test/slow.test.js',
    '#   12.0  test/b.test.js',
    '#    3.0  test/a.test.js',
    '::warning file=test/slow.test.js::test/slow.test.js takes 20.5 minutes, over the 15 of a test file (#566): split it or make it lighter',
  ]);
  assert.deepEqual(report(times, { root, budget: 10, count: 1 }), [
    '# the slowest test files (minutes, the tests of a file one after another): 3 files',
    '#   20.5  test/slow.test.js',
    '::warning file=test/slow.test.js::test/slow.test.js takes 20.5 minutes, over the 10 of a test file (#566): split it or make it lighter',
    '::warning file=test/b.test.js::test/b.test.js takes 12.0 minutes, over the 10 of a test file (#566): split it or make it lighter',
  ]);
  assert.deepEqual(report({}, { root }), ['# the slowest test files (minutes, the tests of a file one after another): 0 files']);
});

test('test file times: as node --test\'s reporter, the files of a run and their times', () => {
  const dir = fs.mkdtempSync(path.join(ROOT, 'test', '.tmp-times-'));
  try {
    // (one file's tests declared by a helper module: still that file's time)
    fs.writeFileSync(path.join(dir, 'lib.mjs'), "import { test } from 'node:test';\nexport const t = n => test(n, () => {});\n");
    fs.writeFileSync(path.join(dir, 'one.test.mjs'), "import { t } from './lib.mjs';\nt('a'); t('b');\n");
    fs.writeFileSync(path.join(dir, 'two.test.mjs'), "import { test } from 'node:test';\ntest('c', () => {});\n");
    const r = spawnSync(process.execPath, ['--test', '--test-reporter', './scripts/test-file-times.mjs',   // (as CI gives it: on Windows an absolute path is not a module URL)
      path.join(dir, 'one.test.mjs'), path.join(dir, 'two.test.mjs')], { cwd: ROOT, encoding: 'utf8', env: { ...process.env, NODE_TEST_CONTEXT: undefined, SILINX_TEST_FILE_MINUTES: '' } });
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.trim().split('\n');
    assert.equal(lines[0], '# the slowest test files (minutes, the tests of a file one after another): 2 files');
    const rel = path.relative(ROOT, dir).split(path.sep).join('/');
    assert.deepEqual(lines.slice(1).map(l => l.replace(/^#\s+[\d.]+\s+/, '')).sort(), [`${rel}/one.test.mjs`, `${rel}/two.test.mjs`]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('test file times: CI\'s unit tests report them, TAP the tests as before', () => {
  const ci = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'ci.yml'), 'utf8');
  // (the parts of about the same time, #573: scripts/test-shard.mjs passes the reporters on to node --test)
  assert.match(ci, /node scripts\/test-shard\.mjs "\$SHARD\/3"\n\s+--test-reporter=tap --test-reporter-destination=stdout\n\s+--test-reporter=\.\/scripts\/test-file-times\.mjs --test-reporter-destination=stdout\n/);
});
