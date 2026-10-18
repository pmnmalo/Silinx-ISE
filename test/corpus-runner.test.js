// The logic of the runner of Yosys's test designs (test/corpus/run-corpus.mjs, npm run test:corpus), on
// synthetic data (#343): the shards the nightly runs in parallel, and the comparison with the expectations,
// where a file that timed out is a failure even when nothing of it was expected to pass. The corpus itself
// (fetched) is not run here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { shardOf, compareResults, runSummary } from './corpus/run-corpus.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

test('corpus runner: the shards (--shard k/n) take every n-th file, together all of them once', () => {
  const files = Array.from({ length: 11 }, (_, i) => `simple/f${String(i).padStart(2, '0')}.v`);
  assert.deepEqual(shardOf(files, ''), files);
  assert.deepEqual(shardOf(files, '1/1'), files);
  assert.deepEqual(shardOf(files, '1/2'), files.filter((_, i) => i % 2 === 0));
  assert.deepEqual(shardOf(files, '2/2'), files.filter((_, i) => i % 2 === 1));
  for (const n of [2, 3, 4]) {
    const parts = Array.from({ length: n }, (_, k) => shardOf(files, `${k + 1}/${n}`));
    assert.deepEqual(parts.flat().sort(), files, `${n} shards`);
    // as even as can be: the slow files (hana's) are next to each other, alternated between the shards
    assert.ok(Math.max(...parts.map(p => p.length)) - Math.min(...parts.map(p => p.length)) <= 1, `${n} shards`);
  }
  assert.deepEqual(shardOf([], '2/2'), []);
  for (const bad of ['0/2', '3/2', '1/0', '2', 'a/b', '1/2/3']) assert.throws(() => shardOf(files, bad), /--shard .*: k\/n with 1 <= k <= n/, bad);
});

test('corpus runner: regressions, newly passing and new keys against expected.json', () => {
  const expected = { 'a.v:a': 'pass', 'a.v:a (synth)': 'pass', 'b.v:b': 'mismatch: x', 'c.v:c': 'pass', 'd.v:d': 'pass' };
  const results = { 'a.v:a': 'pass', 'a.v:a (synth)': 'mismatch: y', 'b.v:b': 'pass', 'c.v': 'error: harness: out of memory', 'e.v:e': 'pass' };
  // d.v did not run (another shard, a filter): its key is no regression
  const r = compareResults(expected, results, new Set(['a.v', 'b.v', 'c.v', 'e.v']));
  assert.deepEqual(r, { regress: ['a.v:a (synth)', 'c.v:c'], fixed: ['b.v:b'], fresh: ['c.v', 'e.v:e'], timedOut: [] });
  assert.equal(results['c.v:c'], 'missing (error: harness: out of memory)');
});

test('corpus runner: a file that timed out fails the run, even when none of its modules was expected to pass, not when expected to fail as a whole (#343)', () => {
  const expected = { 'slow.v:m': 'unsupported: elaborate: x', 'slow.v:m (synth)': 'error: yosys: y', 'hang.v:h': 'pass', 'ok.v:o': 'pass' };
  const results = { 'slow.v': 'error: timeout (over 900 s)', 'hang.v': 'error: timeout (over 900 s)', 'ok.v:o': 'pass' };
  const r = compareResults(expected, results, new Set(['slow.v', 'hang.v', 'ok.v']));
  assert.deepEqual(r.timedOut, ['hang.v', 'slow.v']);
  assert.deepEqual(r.regress, ['hang.v:h', 'hang.v', 'slow.v']);
  assert.equal(results['hang.v:h'], 'missing (error: timeout (over 900 s))');
  // a timeout is no 'error: timeout…' of a key of a module
  assert.deepEqual(compareResults({}, { 'x.v:t': 'error: yosys: timeout of ABC' }, new Set(['x.v'])).timedOut, []);
  // unless the file itself is expected to fail as a whole (hana/hana_vlib.v: out of memory, or out of time)
  const vlib = compareResults({ 'hana/hana_vlib.v': 'error: harness: Worker terminated due to reaching memory limit: JS heap out of memory' },
    { 'hana/hana_vlib.v': 'error: timeout (over 900 s)' }, new Set(['hana/hana_vlib.v']));
  assert.deepEqual([vlib.timedOut, vlib.regress], [['hana/hana_vlib.v'], []]);
  // a file expected unsupported (it does not parse) that times out: a failure
  assert.deepEqual(compareResults({ 'p.v': 'unsupported: parse: x' }, { 'p.v': 'error: timeout (over 900 s)' }, new Set(['p.v'])).regress, ['p.v']);
});

test('corpus runner: the nightly runs the corpus in shards that cover every file, each with its time limit (#343)', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/nightly.yml'), 'utf8');
  const job = yml.slice(yml.indexOf('\n  corpus:\n'), yml.indexOf('\n  vloghammer:\n'));
  const shards = JSON.parse(/shard: (\[[\d, ]+\])/.exec(job)[1]);
  const n = +/--shard "\$SHARD\/(\d+)"/.exec(job)[1];
  assert.match(job, /env:\n\s+SHARD: \$\{\{ matrix\.shard \}\}/);
  assert.deepEqual(shards, Array.from({ length: n }, (_, i) => i + 1));
  assert.match(job, /name: corpus \(\$\{\{ matrix\.shard \}\}\/\d+\)/);
  assert.match(job, /fail-fast: false/);
  assert.match(job, /timeout-minutes: 60/);
});

test('corpus runner: --json writes the run against the expectations, for the comparison of a Yosys update (#352)', () => {
  const expected = { 'a.v:a': 'pass', 'b.v:b': 'mismatch: x', 'c.v:c': 'pass' };
  const results = { 'c.v:c': 'pass', 'b.v:b': 'pass', 'a.v:a': 'mismatch: y' };
  const cmp = compareResults(expected, results, new Set(['a.v', 'b.v', 'c.v']));
  const out = runSummary({ tag: 'v0.68', results, expected, ...cmp, newWarnings: ['  a.v: 3: w'], goneWarnings: [] });
  assert.deepEqual(out, {
    tag: 'v0.68', results: { 'a.v:a': 'mismatch: y', 'b.v:b': 'pass', 'c.v:c': 'pass' }, expected: { 'a.v:a': 'pass', 'b.v:b': 'mismatch: x' },
    regress: ['a.v:a'], fixed: ['b.v:b'], fresh: [], timedOut: [], newWarnings: ['a.v: 3: w'], goneWarnings: [],
  });
  assert.deepEqual(Object.keys(out.results), ['a.v:a', 'b.v:b', 'c.v:c']);
});
