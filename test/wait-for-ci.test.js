// A release only of a commit that CI passed, the tests not run again (#416); CI at a release only, started
// by the tag (#607): scripts/wait-for-ci.mjs and .github/workflows/release.yml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { verdict } from '../scripts/wait-for-ci.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (id, status, conclusion = null, event = 'push', head_branch = 'v15.12.0') =>
  ({ id, status, conclusion, event, head_branch, html_url: `https://github.com/o/r/actions/runs/${id}` });

test('wait for CI: the verdict from the runs of the commit', () => {
  assert.deepEqual(verdict([run(1, 'completed', 'success')]), { state: 'success', reason: 'CI passed (v15.12.0): https://github.com/o/r/actions/runs/1' });
  assert.deepEqual(verdict([run(2, 'in_progress')]), { state: 'pending', reason: 'CI (v15.12.0) is in progress: https://github.com/o/r/actions/runs/2' });
  assert.deepEqual(verdict([run(3, 'queued')]), { state: 'pending', reason: 'CI (v15.12.0) is queued: https://github.com/o/r/actions/runs/3' });
  assert.deepEqual(verdict([run(4, 'completed', 'failure')]), { state: 'failure', reason: 'CI did not pass (failure): https://github.com/o/r/actions/runs/4' });
  assert.deepEqual(verdict([run(4, 'completed', 'failure'), run(5, 'completed', 'cancelled')]),
    { state: 'failure', reason: 'CI did not pass (failure, cancelled): https://github.com/o/r/actions/runs/4, https://github.com/o/r/actions/runs/5' });
  assert.deepEqual(verdict([]), { state: 'none', reason: 'no CI run of the tag or of main for this commit' });
  // a run of main counts: by hand (Actions ▸ Run workflow), or a push from before #607
  assert.equal(verdict([run(12, 'completed', 'success', 'workflow_dispatch', 'main')]).reason, 'CI passed (main): https://github.com/o/r/actions/runs/12');
  assert.equal(verdict([run(13, 'completed', 'success', 'push', 'main')]).state, 'success');
  // a pull request's run, a branch's, or one by hand on a branch, is not the release's
  assert.equal(verdict([run(6, 'completed', 'success', 'pull_request', 'claude/x')]).state, 'none');
  assert.equal(verdict([run(7, 'completed', 'success', 'push', 'claude/x')]).state, 'none');
  assert.equal(verdict([run(14, 'completed', 'success', 'workflow_dispatch', 'claude/x')]).state, 'none');
  assert.equal(verdict([run(15, 'completed', 'success', 'push', 'version-notes')]).state, 'none', 'a branch named like a word, not a tag');
  // one passed (a re-run) is enough; one still running is waited for
  assert.equal(verdict([run(8, 'completed', 'failure'), run(9, 'completed', 'success')]).state, 'success');
  assert.equal(verdict([run(8, 'completed', 'failure'), run(10, 'in_progress')]).state, 'pending');
  assert.equal(verdict([{ id: 11, status: 'completed', conclusion: 'success', event: 'push', head_branch: 'v1.2.3' }]).reason, 'CI passed (v1.2.3): run 11');
});

test('wait for CI: the command line without its arguments', () => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/wait-for-ci.mjs')], { encoding: 'utf8', env: { ...process.env, GITHUB_REPOSITORY: '' } });
  assert.equal(r.status, 2);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, 'usage: wait-for-ci.mjs <sha> [--timeout <minutes>] [--appear <minutes>] (in GitHub Actions)\n');
});

test('release: CI on the tagged commit instead of npm test, the commit on main; the packages still checked', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/release.yml'), 'utf8');
  assert.doesNotMatch(yml, /npm test\b/);
  assert.match(yml, /\npermissions:\n {2}actions: read .*\n {2}contents: write\n/);
  assert.match(yml, /- name: CI passed\n\s+run: node scripts\/wait-for-ci\.mjs "\$GITHUB_SHA" --timeout (\d+) --appear \d+\n\s+env:\n\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
  // the tagged commit on main (#607: CI runs on the tag, so a tag elsewhere would pass it too)
  assert.match(yml, /uses: actions\/checkout@.+\n\s+with:\n\s+fetch-depth: 0\n/);
  assert.match(yml, /- name: The commit is on main\n\s+run: git merge-base --is-ancestor "\$GITHUB_SHA" origin\/main\n/);
  // CI starts on the tag, with the release (ci.yml)
  assert.match(fs.readFileSync(path.join(ROOT, '.github/workflows/ci.yml'), 'utf8'), /^on:\n {2}push:\n {4}tags: \['v\*'\]\n {2}workflow_dispatch:\n/m);
  // the job's limit above the wait's, with time to package and check
  const wait = +/--timeout (\d+)/.exec(yml)[1], job = +/\n {4}timeout-minutes: (\d+)\n/.exec(yml)[1];
  assert.ok(job >= wait + 15, `${job} >= ${wait} + 15`);
  // in order: CI, the single-file edition, the packages, their test, the release
  const at = s => { const i = yml.indexOf(s); assert.ok(i > 0, s); return i; };
  const order = ['run: git merge-base --is-ancestor', 'run: node scripts/wait-for-ci.mjs', 'run: node scripts/build-standalone.mjs', 'run: node scripts/package-release.mjs', 'run: npm run test:release', 'gh release create'].map(at);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
});
