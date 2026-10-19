#!/usr/bin/env node
// A release only of a commit that CI passed (#416): the Release workflow does not run the tests itself, it
// waits for the CI run of the tagged commit and fails when that run failed, or when the commit has no CI
// run. CI runs at a release only (#607): the push of the tag v* starts it (a run of the tag), alongside the
// Release workflow, so it is usually still running and the script waits for it; a run of main started by
// hand (Actions ▸ CI ▸ Run workflow) on that commit counts too. A pull request's or a branch's does not.
//
//   node scripts/wait-for-ci.mjs <sha> [--timeout <minutes, 60>] [--appear <minutes, 10>]
//   (in GitHub Actions: GITHUB_TOKEN with actions: read, GITHUB_REPOSITORY)
import { fileURLToPath } from 'node:url';

/** { state: 'success' | 'failure' | 'pending' | 'none', reason } from the CI runs of a commit (the API's workflow_runs). */
export function verdict(runs) {
  const ours = runs.filter(r => (r.event === 'push' && /^v\d/.test(r.head_branch)) || (['push', 'workflow_dispatch'].includes(r.event) && r.head_branch === 'main'));
  const url = r => r.html_url || `run ${r.id}`;
  const passed = ours.find(r => r.status === 'completed' && r.conclusion === 'success');
  if (passed) return { state: 'success', reason: `CI passed (${passed.head_branch}): ${url(passed)}` };
  const going = ours.find(r => r.status !== 'completed');
  if (going) return { state: 'pending', reason: `CI (${going.head_branch}) is ${going.status.replace('_', ' ')}: ${url(going)}` };
  if (ours.length) return { state: 'failure', reason: `CI did not pass (${ours.map(r => r.conclusion).join(', ')}): ${ours.map(url).join(', ')}` };
  return { state: 'none', reason: 'no CI run of the tag or of main for this commit' };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (name, d) => { const i = args.indexOf(name); return i >= 0 ? +args[i + 1] : d; };
  const sha = args[0];
  const timeout = opt('--timeout', 60), appear = opt('--appear', 10);
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env;
  if (!sha || !repo) { console.error('usage: wait-for-ci.mjs <sha> [--timeout <minutes>] [--appear <minutes>] (in GitHub Actions)'); process.exit(2); }
  const start = Date.now();
  for (;;) {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/ci.yml/runs?head_sha=${sha}&per_page=20`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(`GitHub API: ${r.status} ${r.statusText}`);
    const { state, reason } = verdict((await r.json()).workflow_runs || []);
    const minutes = (Date.now() - start) / 60000;
    console.log(`${sha.slice(0, 7)}: ${reason}`);
    if (state === 'success') return;
    if (state === 'failure') throw new Error(reason);
    if (state === 'none' && minutes >= appear) throw new Error(`${reason} after ${appear} minutes: did CI start on the tag?`);
    if (minutes >= timeout) throw new Error(`${reason} after ${timeout} minutes`);
    await new Promise(res => setTimeout(res, 60000));
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
