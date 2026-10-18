// A release only of a commit that main's CI passed, the tests not run again (#416): scripts/wait-for-ci.mjs
// and .github/workflows/release.yml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verdict } from '../scripts/wait-for-ci.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (id, status, conclusion = null, event = 'push', head_branch = 'main') =>
  ({ id, status, conclusion, event, head_branch, html_url: `https://github.com/o/r/actions/runs/${id}` });

test('wait for CI: the verdict from the runs of the commit', () => {
  assert.deepEqual(verdict([run(1, 'completed', 'success')]), { state: 'success', reason: 'CI passed on main: https://github.com/o/r/actions/runs/1' });
  assert.deepEqual(verdict([run(2, 'in_progress')]), { state: 'pending', reason: 'CI on main is in progress: https://github.com/o/r/actions/runs/2' });
  assert.deepEqual(verdict([run(3, 'queued')]), { state: 'pending', reason: 'CI on main is queued: https://github.com/o/r/actions/runs/3' });
  assert.deepEqual(verdict([run(4, 'completed', 'failure')]), { state: 'failure', reason: 'CI on main did not pass (failure): https://github.com/o/r/actions/runs/4' });
  assert.deepEqual(verdict([run(4, 'completed', 'failure'), run(5, 'completed', 'cancelled')]),
    { state: 'failure', reason: 'CI on main did not pass (failure, cancelled): https://github.com/o/r/actions/runs/4, https://github.com/o/r/actions/runs/5' });
  assert.deepEqual(verdict([]), { state: 'none', reason: 'no CI run on main for this commit' });
  // a pull request's run, or a branch's, is not main's
  assert.equal(verdict([run(6, 'completed', 'success', 'pull_request', 'claude/x')]).state, 'none');
  assert.equal(verdict([run(7, 'completed', 'success', 'push', 'claude/x')]).state, 'none');
  // one passed (a re-run, a second push of the same commit) is enough; one still running is waited for
  assert.equal(verdict([run(8, 'completed', 'failure'), run(9, 'completed', 'success')]).state, 'success');
  assert.equal(verdict([run(8, 'completed', 'failure'), run(10, 'in_progress')]).state, 'pending');
  assert.equal(verdict([{ id: 11, status: 'completed', conclusion: 'success', event: 'push', head_branch: 'main' }]).reason, 'CI passed on main: run 11');
});

test('wait for CI: the command line without its arguments', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/wait-for-ci.mjs')], { encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: '' } });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'usage: wait-for-ci.mjs <sha> [--timeout <minutes>] [--appear <minutes>] (in GitHub Actions)\n');
});

test('release: main\'s CI on the tagged commit instead of npm test; the packages still checked', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
  assert.doesNotMatch(yml, /npm test\b/);
  assert.match(yml, /\npermissions:\n {2}actions: read .*\n {2}contents: write\n/);
  assert.match(yml, /- name: CI passed on main\n\s+run: node scripts\/wait-for-ci\.mjs "\$GITHUB_SHA" --timeout (\d+) --appear \d+\n\s+env:\n\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  // the job's limit above the wait's, with time to package and check
  const wait = +/--timeout (\d+)/.exec(yml)[1], job = +/\n {4}timeout-minutes: (\d+)\n/.exec(yml)[1];
  assert.ok(job >= wait + 15, `${job} >= ${wait} + 15`);
  // in order: CI, the single-file edition, the packages, their test, the release
  const at = s => { const i = yml.indexOf(s); assert.ok(i > 0, s); return i; };
  const order = ['run: node scripts/wait-for-ci.mjs', 'run: node scripts/build-standalone.mjs', 'run: node scripts/package-release.mjs', 'run: npm run test:release', 'gh release create'].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});
