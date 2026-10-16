#!/usr/bin/env node
// Whether a scheduled workflow has anything new to test (#148): the long runs (the nightly corpora, the
// ISE tests, the weekly comparison with ISE) are skipped when main has not changed since the commit of
// the workflow's last successful run, apart from files that cannot change their results (the
// documentation, the comparison's own results). A run started by hand always runs; so does a run
// with no successful run before it, or one whose last commit is no longer in main's history.
//
//   node scripts/changed-since-last-run.mjs <workflow file, e.g. ise.yml> [--only <prefix>,<prefix>…]
//   (--only: a scheduled run runs only when a changed file starts with one of the prefixes, the
//   workflow's own inputs: the ISE tests are not affected by the web interface or the UI tests)
//   (in GitHub Actions: GITHUB_TOKEN, GITHUB_REPOSITORY, GITHUB_SHA, GITHUB_EVENT_NAME; a checkout with
//   the history, fetch-depth: 0) → writes run=true|false to GITHUB_OUTPUT and the reason to the summary
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** The files whose change cannot change a test's result. */
export const irrelevant = f => /\.md$/i.test(f) || f.startsWith('docs/') || f === 'test/designs-corpus/ise-comparison.json';

/** { run, reason } from the event, the commit to test, the last successful run's commit and the files changed since. */
export function decide({ event, current, last, changed, only = null }) {
  if (event !== 'schedule') return { run: true, reason: `started by ${event}` };
  if (!last) return { run: true, reason: 'no successful run before' };
  if (last === current) return { run: false, reason: `main is ${current.slice(0, 7)}, as at the last successful run` };
  if (changed == null) return { run: true, reason: `${last.slice(0, 7)} (the last successful run) is not in main's history` };
  const relevant = changed.filter(f => !irrelevant(f));
  if (!relevant.length) return { run: false, reason: `since ${last.slice(0, 7)} (the last successful run) only documentation changed (${changed.length} file(s))` };
  if (only) {
    const inputs = relevant.filter(f => only.some(p => f.startsWith(p)));
    if (!inputs.length) return { run: false, reason: `since ${last.slice(0, 7)} (the last successful run) none of this workflow's inputs changed (${relevant.length} other file(s): ${relevant.slice(0, 5).join(', ')}${relevant.length > 5 ? ', …' : ''})` };
    return { run: true, reason: `${inputs.length} file(s) of this workflow's inputs changed since ${last.slice(0, 7)} (the last successful run): ${inputs.slice(0, 5).join(', ')}${inputs.length > 5 ? ', …' : ''}` };
  }
  return { run: true, reason: `${relevant.length} file(s) changed since ${last.slice(0, 7)} (the last successful run): ${relevant.slice(0, 5).join(', ')}${relevant.length > 5 ? ', …' : ''}` };
}

async function main() {
  const file = process.argv[2];
  const at = process.argv.indexOf('--only');
  const only = at > 0 ? process.argv[at + 1].split(',').map(p => p.trim()).filter(Boolean) : null;
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, GITHUB_SHA: current, GITHUB_EVENT_NAME: event = 'workflow_dispatch' } = process.env;
  if (!file || !repo || !current) { console.error('usage: changed-since-last-run.mjs <workflow file> (in GitHub Actions)'); process.exit(2); }
  let last = null, changed = null;
  if (event === 'schedule') {
    const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${file}/runs?branch=main&status=success&per_page=1`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } });
    if (!r.ok) throw new Error(`GitHub API: ${r.status} ${r.statusText}`);
    last = (await r.json()).workflow_runs?.[0]?.head_sha || null;
    if (last && last !== current) {
      try {
        execFileSync('git', ['merge-base', '--is-ancestor', last, current], { stdio: 'ignore' });
        changed = execFileSync('git', ['diff', '--name-only', last, current], { encoding: 'utf8' }).split('\n').filter(Boolean);
      } catch { changed = null; }
    }
  }
  const { run, reason } = decide({ event, current, last, changed, only });
  console.log(`${run ? 'run' : 'skip'}: ${reason}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `run=${run}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${run ? 'Running' : 'Skipped'}: ${reason}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
