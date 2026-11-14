// A commit's checks on GitHub (#3194, core/github-checks.js), against the stand-in for GitHub (test/fake-github.mjs), no
// network:
// - none yet; running; done, with the annotations the Classroom workflow writes (core/grade-annotations.js, read back as
//   GitHub's runner parses them), its conclusion; several runs, one failed: the whole a failure;
// - by a branch's name as by a commit's hash; a private repository's only with the sign-in; a wrong ref refused before
//   any request; the token only in the Authorization header, never in a URL;
// - a check's link only if it is one of github.com's; long texts clipped;
// - the console's lines of each state.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGitHub } from './fake-github.mjs';
import { githubClient, GitHubError } from '../core/github-api.js';
import { commitChecks, checksLines } from '../core/github-checks.js';

const REPO = 'course/counter4-student';
function setup({ priv = false, signed = true } = {}) {
  const gh = fakeGitHub();
  gh.seed(REPO, { 'silinx.json': '{}\n' }, { private: priv });
  const client = githubClient({ fetch: gh.fetch, token: () => (signed ? gh.token : null) });
  return { gh, client, head: gh.head(REPO) };
}
const GRADED = [
  { level: 'failure', title: 'Silinx: counter4', message: '10 / 40 points, Wrong Answer' },
  { level: 'failure', title: 'Silinx: count', message: 'WA Wrong Answer, 0 / 30: cycle 1 (vectors line 4): q is 0000, expected 0001' },
  { level: 'notice', title: 'Silinx: impl', message: 'AC Accepted, 10 / 10' },
];

test('#3194 no check yet, then running, then done with the verdicts as annotations', async () => {
  const { gh, client, head } = setup();
  const at = { owner: 'course', repo: 'counter4-student', ref: head };
  assert.deepEqual(await commitChecks(client, at), { commit: head, state: 'none', conclusion: null, runs: [] });
  gh.setChecks(REPO, head, [{ name: 'grade', status: 'in_progress' }]);
  const running = await commitChecks(client, at);
  assert.deepEqual([running.state, running.conclusion, running.runs.map(r => [r.name, r.status, r.annotations.length])], ['pending', null, [['grade', 'in_progress', 0]]]);
  gh.setChecks(REPO, head, [{ name: 'grade', status: 'completed', conclusion: 'failure', annotations: GRADED }]);
  const done = await commitChecks(client, at);
  assert.deepEqual(done, { commit: head, state: 'completed', conclusion: 'failure', runs: [{
    name: 'grade', status: 'completed', conclusion: 'failure', url: `https://github.com/${REPO}/runs/${1002}`, title: null,
    annotations: [
      { level: 'error', title: 'Silinx: counter4', message: '10 / 40 points, Wrong Answer' },
      { level: 'error', title: 'Silinx: count', message: 'WA Wrong Answer, 0 / 30: cycle 1 (vectors line 4): q is 0000, expected 0001' },
      { level: 'info', title: 'Silinx: impl', message: 'AC Accepted, 10 / 10' },
    ] }] });
  // (the token in the header only)
  for (const r of gh.requests) assert.ok(!r.url.includes(gh.token), r.url);
  assert.ok(gh.requests.filter(r => r.url.includes('check-runs')).every(r => r.headers.authorization === `Bearer ${gh.token}`));
});

test('#3194 several runs: sorted by name, one failed makes the whole a failure; all passed a success', async () => {
  const { gh, client, head } = setup();
  const at = { owner: 'course', repo: 'counter4-student', ref: 'main' };   // (a branch's name)
  gh.setChecks(REPO, head, [{ name: 'lint', status: 'completed', conclusion: 'success' }, { name: 'grade', status: 'completed', conclusion: 'success', annotations: [GRADED[2]] }]);
  const ok = await commitChecks(client, at);
  assert.deepEqual([ok.commit, ok.state, ok.conclusion, ok.runs.map(r => r.name)], ['main', 'completed', 'success', ['grade', 'lint']]);
  gh.setChecks(REPO, head, [{ name: 'lint', status: 'completed', conclusion: 'timed_out' }, { name: 'grade', status: 'queued' }]);
  const bad = await commitChecks(client, at);
  assert.deepEqual([bad.state, bad.conclusion], ['pending', 'failure']);
});

test('#3194 a private repository\'s checks only with the sign-in; a wrong ref refused before any request', async () => {
  const { gh, head } = setup({ priv: true });
  const anon = githubClient({ fetch: gh.fetch, token: () => null });
  await assert.rejects(commitChecks(anon, { owner: 'course', repo: 'counter4-student', ref: head }), e => e instanceof GitHubError && e.status === 404 && /Sign in with GitHub first/.test(e.hint));
  const n = gh.requests.length;
  for (const ref of ['', '../../user', 'a b', 'x?y=1', `${'a'.repeat(251)}`]) {
    await assert.rejects(commitChecks(anon, { owner: 'course', repo: 'counter4-student', ref }), /not a commit or a branch/);
  }
  assert.equal(gh.requests.length, n);
});

test('#3194 a check\'s link only github.com\'s; long texts clipped', async () => {
  const { client } = setup();
  const runs = [{ id: 7, name: 'x'.repeat(300), status: 'completed', conclusion: 'success', html_url: 'javascript:alert(1)', output: { title: 'T', annotations_count: 1 } }];
  const fake = { repo: client.repo, pathOf: client.pathOf, request: async (m, p) => (p.includes('/annotations') ? [{ annotation_level: 'warning', title: null, message: 'm'.repeat(2000) }] : { check_runs: runs }) };
  const [r] = (await commitChecks(fake, { owner: 'o', repo: 'r', ref: 'main' })).runs;
  assert.deepEqual([r.url, r.name.length, r.title, r.annotations[0].level, r.annotations[0].title, r.annotations[0].message.length], [null, 201, 'T', 'warning', null, 1001]);
});

test('#3194 the console\'s lines: none, running, done with each verdict', () => {
  const sha = 'abcdef0123456789abcdef0123456789abcdef01';
  assert.deepEqual(checksLines({ commit: sha, state: 'none', runs: [] }), [{ level: 'info', text: 'No check on GitHub for commit abcdef0: the repository has no workflow, or it has not started yet.' }]);
  assert.deepEqual(checksLines({ commit: sha, state: 'pending', runs: [{ name: 'grade', status: 'queued', annotations: [] }] }), [{ level: 'info', text: 'grade: queued (commit abcdef0); Checks again shows its result.' }]);
  assert.deepEqual(checksLines({ commit: sha, state: 'completed', runs: [
    { name: 'grade', status: 'completed', conclusion: 'failure', url: 'https://github.com/o/r/runs/1', title: null, annotations: [{ level: 'error', title: 'Silinx: count', message: 'WA Wrong Answer, 0 / 30' }, { level: 'info', title: null, message: 'ok' }] },
    { name: 'lint', status: 'completed', conclusion: 'success', url: null, title: 'All good', annotations: [] }] }), [
    { level: 'error', text: 'grade: failure (commit abcdef0): https://github.com/o/r/runs/1' },
    { level: 'error', text: '  Silinx: count: WA Wrong Answer, 0 / 30' },
    { level: 'info', text: '  ok' },
    { level: 'info', text: 'lint: success (All good) (commit abcdef0)' },
  ]);
});
