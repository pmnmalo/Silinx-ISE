// The unit tests in parts of about the same time (#573), and the UI tests (#912): scripts/test-shard.mjs, the
// reporter of each file's time (scripts/test-times-reporter.mjs) and the timings refreshed from CI
// (scripts/update-test-timings.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { testFiles, weights, balance, parseShard, readTimings, TIMINGS } from '../scripts/test-shard.mjs';
import { merge, readParts } from '../scripts/update-test-timings.mjs';
import { addFileTime } from '../scripts/test-times-reporter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = (t) => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-test-shard-')); t.after(() => fs.rmSync(d, { recursive: true, force: true })); return d; };

test('test shard: i/n parsed, out of range refused', () => {
  assert.deepEqual(parseShard('1/4'), { i: 1, n: 4 });
  assert.deepEqual(parseShard('4/4'), { i: 4, n: 4 });
  for (const bad of ['0/4', '5/4', '1/0', '1', '', undefined, 'a/b', '1/4/2'])
    assert.throws(() => parseShard(bad), /^Error: the part as i\/n, 1 ≤ i ≤ n: /, String(bad));
});

test('test shard: a file not measured weighs the median of the measured ones; none measured: 1 each', () => {
  assert.deepEqual(weights(['a', 'b', 'c', 'd'], { a: 10, b: 2, c: 4, x: 99 }), { a: 10, b: 2, c: 4, d: 4 });
  assert.deepEqual(weights(['a', 'b'], { a: 3, b: 5 }), { a: 3, b: 5 });
  assert.deepEqual(weights(['a', 'b', 'c'], { a: 3, b: 5, c: 'x' }), { a: 3, b: 5, c: 3 }, 'a value that is not a time: the median');
  assert.deepEqual(weights(['a', 'b'], {}), { a: 1, b: 1 });
});

test('test shard: the heaviest first into the lightest part; every file in one part only; deterministic', () => {
  const w = { a: 16, b: 10, c: 9, d: 7, e: 6, f: 5, g: 3, h: 1 };
  const parts = balance(Object.keys(w).reverse(), w, 3);
  // a 16; b 10; c 9; d into c's (16); e into b's (16); f, g, h each into the first of the lightest
  assert.deepEqual(parts.map(p => p.files), [['a', 'f'], ['b', 'e', 'g'], ['c', 'd', 'h']]);
  assert.deepEqual(parts.map(p => p.time), [21, 19, 17]);
  assert.deepEqual(balance(Object.keys(w), w, 3), parts, 'the order given does not matter');
  // as many parts as files, more parts than files, one part
  assert.deepEqual(balance(['x', 'y'], { x: 1, y: 1 }, 2).map(p => p.files), [['x'], ['y']]);
  assert.deepEqual(balance(['x'], { x: 1 }, 3).map(p => p.files), [['x'], [], []]);
  assert.deepEqual(balance(['y', 'x'], { x: 1, y: 2 }, 1).map(p => p.files), [['x', 'y']]);
  for (const n of [0, 1.5, -1]) assert.throws(() => balance(['x'], { x: 1 }, n), /the number of parts must be a whole number from 1/);
});

// the parts of the repository's files by its timings: within a fifth of each other, or the longest file's time
function assertBalanced(files, t, n) {
  const w = weights(files, t);
  const parts = balance(files, w, n);
  assert.deepEqual(parts.flatMap(p => p.files).sort(), files, 'every file once');
  const longest = Math.max(...Object.values(w));
  const [lo, hi] = [Math.min(...parts.map(p => p.time)), Math.max(...parts.map(p => p.time))];
  assert.ok(hi <= Math.max(lo * 1.2, longest + lo * 0.2), `parts ${parts.map(p => Math.round(p.time)).join(' / ')} s`);
}

test('test shard: the repository\'s timings — measured files that exist, in seconds; the unit tests\' three parts and each interface\'s three UI parts within a fifth of each other or one file long', () => {
  const files = testFiles(), uiFiles = testFiles(ROOT, 'test/ui');
  assert.ok(files.length > 100 && files.every(f => /^test\/[\w.-]+\.test\.js$/.test(f)), String(files.length));
  assert.ok(uiFiles.length > 50 && uiFiles.every(f => /^test\/ui\/[\w.-]+\.test\.js$/.test(f)), String(uiFiles.length));
  assert.ok(!uiFiles.includes('test/ui/harness.js'), 'test files only');
  for (const l of [files, uiFiles]) assert.deepEqual(l, [...l].sort());
  const t = readTimings();
  const keys = Object.keys(t);
  for (const [l, what] of [[files, 'unit'], [uiFiles, 'UI']]) {
    const n = l.filter(f => f in t).length;
    assert.ok(n >= l.length * 0.8, `${n} of ${l.length} ${what} files measured (node scripts/update-test-timings.mjs <run id>)`);
  }
  for (const f of keys) {
    assert.ok(files.includes(f) || uiFiles.includes(f), `${TIMINGS}: ${f} is not a test file any more`);
    assert.ok(typeof t[f] === 'number' && t[f] >= 0, `${f}: ${t[f]}`);
  }
  assert.deepEqual(keys, [...keys].sort(), 'sorted (a refresh changes only the times)');
  assertBalanced(files, t, 3);
  assertBalanced(uiFiles, t, 3);
  // a UI file not measured weighs the UI files' median, not the unit files'
  const w = weights([...uiFiles, 'test/ui/new.test.js'], t);
  const ui = uiFiles.map(f => t[f]).filter(v => v != null).sort((a, b) => a - b);
  assert.equal(w['test/ui/new.test.js'], ui[Math.floor((ui.length - 1) / 2)]);
});

test('test shard: the command line — the dry run lists the parts, a part runs its files with node --test, a bad part refused', (t) => {
  const run = (...a) => spawnSync(process.execPath, [path.join(ROOT, 'scripts/test-shard.mjs'), ...a], { cwd: ROOT, encoding: 'utf8' });
  const dry = run('1/4', '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(dry.stderr, '', 'no warnings');
  const lines = dry.stdout.trim().split('\n');
  assert.equal(lines.length, 4);
  lines.forEach((l, k) => assert.match(l, new RegExp(`^${k + 1}/4: \\d+ files, ~\\d+ min$`)));
  assert.equal(lines.reduce((s, l) => s + Number(/: (\d+) files/.exec(l)[1]), 0), testFiles().length);
  // the UI tests' parts (#912): every UI file in one of them
  const uiDry = run('2/3', '--ui', '--dry-run');
  assert.equal(uiDry.status, 0, uiDry.stderr);
  assert.equal(uiDry.stderr, '', 'no warnings');
  const uiLines = uiDry.stdout.trim().split('\n');
  assert.equal(uiLines.length, 3);
  uiLines.forEach((l, k) => assert.match(l, new RegExp(`^${k + 1}/3: \\d+ files, ~\\d+ min$`)));
  assert.equal(uiLines.reduce((s, l) => s + Number(/: (\d+) files/.exec(l)[1]), 0), testFiles(ROOT, 'test/ui').length);
  const bad = run('5/4');
  assert.equal(bad.status, 2);
  assert.equal(bad.stdout, '');
  assert.equal(bad.stderr, 'the part as i/n, 1 ≤ i ≤ n: 5/4\n');
  // a part's run: in a copy with three test files, one of which fails; its status is node --test's
  const dir = tmp(t);
  fs.mkdirSync(path.join(dir, 'scripts')); fs.mkdirSync(path.join(dir, 'test'));
  for (const f of ['test-shard.mjs', 'test-times-reporter.mjs']) fs.copyFileSync(path.join(ROOT, 'scripts', f), path.join(dir, 'scripts', f));
  fs.writeFileSync(path.join(dir, 'test', 'a.test.js'), "import { test } from 'node:test'; test('a', () => {});\n");
  fs.writeFileSync(path.join(dir, 'test', 'b.test.js'), "import { test } from 'node:test'; test('b', () => { throw new Error('b fails'); });\n");
  fs.writeFileSync(path.join(dir, 'test', 'c.test.js'), "import { test } from 'node:test'; test('c1', () => {}); test('c2', () => {});\n");
  fs.writeFileSync(path.join(dir, 'test', 'timings.json'), JSON.stringify({ 'test/a.test.js': 1, 'test/b.test.js': 5, 'test/c.test.js': 3 }));
  // (without NODE_TEST_CONTEXT, which this test's own runner sets: with it a node --test reports to its
  // parent runner and ends 0)
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const part = (i) => spawnSync(process.execPath, ['scripts/test-shard.mjs', `${i}/2`, '--test-reporter=tap', '--test-reporter-destination=stdout',
    '--test-reporter=./scripts/test-times-reporter.mjs', `--test-reporter-destination=times-${i}.json`], { cwd: dir, encoding: 'utf8', env });
  const p1 = part(1), p2 = part(2);
  assert.match(p1.stdout, /^unit tests, part 1\/2: 1 of 3 files, ~0 min measured\n/);
  assert.equal(p1.status, 1, 'b fails');
  assert.match(p1.stdout, /^not ok 1 - b$/m);
  assert.match(p2.stdout, /^unit tests, part 2\/2: 2 of 3 files, ~0 min measured\n/);
  assert.equal(p2.status, 0, p2.stdout);
  assert.match(p2.stdout, /^ok 1 - a$/m);
  assert.match(p2.stdout, /^ok \d - c2$/m);
  // each file's time, as the reporter writes it
  const times = [1, 2].map(i => JSON.parse(fs.readFileSync(path.join(dir, `times-${i}.json`), 'utf8')));
  assert.deepEqual(Object.keys(times[0]), ['test/b.test.js']);
  assert.deepEqual(Object.keys(times[1]), ['test/a.test.js', 'test/c.test.js']);
  for (const v of [...Object.values(times[0]), ...Object.values(times[1])]) assert.ok(typeof v === 'number' && v >= 0 && v < 30, String(v));
  // a UI part (#912): test/ui's files, the options before them (--test-concurrency=1: one file after the
  // other), each file's time though its tests are declared by a helper (as the UI tests' uiTest())
  fs.mkdirSync(path.join(dir, 'test', 'ui'));
  fs.writeFileSync(path.join(dir, 'test', 'ui', 'helper.js'), "import { test } from 'node:test';\nimport fs from 'node:fs';\n" +
    "export const slow = (name) => test(name, async () => { fs.appendFileSync('order.log', `start ${name}\\n`); await new Promise(r => setTimeout(r, 300)); fs.appendFileSync('order.log', `end ${name}\\n`); });\n");
  for (const n of ['x', 'y', 'z']) fs.writeFileSync(path.join(dir, 'test', 'ui', `${n}.test.js`), `import { slow } from './helper.js'; slow('${n}');\n`);
  const ui = spawnSync(process.execPath, ['scripts/test-shard.mjs', '1/1', '--ui', '--test-concurrency=1', '--test-reporter=tap', '--test-reporter-destination=stdout',
    '--test-reporter=./scripts/test-times-reporter.mjs', '--test-reporter-destination=times-ui.json'], { cwd: dir, encoding: 'utf8', env });
  assert.equal(ui.status, 0, ui.stdout + ui.stderr);
  assert.match(ui.stdout, /^UI tests, part 1\/1: 3 of 3 files, ~0 min measured\n/);
  assert.equal(fs.readFileSync(path.join(dir, 'order.log'), 'utf8'), 'start x\nend x\nstart y\nend y\nstart z\nend z\n', 'one file at a time');
  const uiTimes = JSON.parse(fs.readFileSync(path.join(dir, 'times-ui.json'), 'utf8'));
  assert.deepEqual(Object.keys(uiTimes), ['test/ui/x.test.js', 'test/ui/y.test.js', 'test/ui/z.test.js'], 'the test files, not the helper');
  for (const v of Object.values(uiTimes)) assert.ok(v >= 0.3 && v < 30, String(v));
});

test('test times reporter: each file\'s own summary (#912), the run\'s and the tests\' events ignored', () => {
  const times = {};
  const sum = (file, ms) => ({ type: 'test:summary', data: { file, duration_ms: ms, success: true, counts: {} } });
  for (const e of [sum(path.resolve('test/ui/a.test.js'), 1500), sum(path.resolve('test/b.test.js'), 200), sum(undefined, 9999),
    { type: 'test:pass', data: { file: path.resolve('test/ui/harness.js'), nesting: 0, details: { duration_ms: 9999 } } },
    { type: 'test:summary', data: { file: path.resolve('test/c.test.js') } }])
    addFileTime(times, e);
  assert.deepEqual(times, { 'test/ui/a.test.js': 1.5, 'test/b.test.js': 0.2 });
});

test('test timings: merged from the parts, the files that no longer exist left out; read from the downloaded artifacts', (t) => {
  assert.deepEqual(merge([{ 'test/b.test.js': 2 }, { 'test/a.test.js': 1.5, 'test/gone.test.js': 9, 'test/c.test.js': 'x' }], ['test/a.test.js', 'test/b.test.js', 'test/c.test.js']),
    { 'test/a.test.js': 1.5, 'test/b.test.js': 2 });
  // a UI file measured in each interface (#912): the longer time
  assert.deepEqual(merge([{ 'test/ui/u.test.js': 4 }, { 'test/ui/u.test.js': 6 }, { 'test/ui/u.test.js': 5 }], ['test/ui/u.test.js']), { 'test/ui/u.test.js': 6 });
  const dir = tmp(t);
  for (const [k, v] of [['unit-times-1', { 'test/a.test.js': 1 }], ['ui-times-modern-2', { 'test/b.test.js': 2 }]]) {
    fs.mkdirSync(path.join(dir, k));
    fs.writeFileSync(path.join(dir, k, 'test-times.json'), JSON.stringify(v));
  }
  fs.writeFileSync(path.join(dir, 'other.json'), '{}');
  assert.deepEqual(readParts(dir).sort((a, b) => Object.keys(a)[0].localeCompare(Object.keys(b)[0])), [{ 'test/a.test.js': 1 }, { 'test/b.test.js': 2 }]);
  // the command line without a run: its usage
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/update-test-timings.mjs')], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.equal(r.stderr, 'usage: node scripts/update-test-timings.mjs <run id> | --from <folder>\n');
});
