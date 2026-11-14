// A commit's checks on GitHub (#3194): what GitHub's workflows said of a pushed commit, read through GitHub's REST API
// (core/github-api.js's client: the browser's sign-in, a server's GH_TOKEN, or none for a public repository). A GitHub
// Classroom assignment's workflow (server/classroom.js) runs the exercise's visible tests on each push and says each
// verdict as an annotation of its check run (core/grade-annotations.js): Git ▸ Checks and the MCP's git_checks give them
// to the student where the student works. A check's name, title and annotations are the repository's text (its
// workflows', a design's names): data, which the callers mark untrusted. Isomorphic.
import { GitHubError } from './github-api.js';

const PER_PAGE = 100;
const MAX_ANNOTATIONS = 50;   // (of a run: GitHub keeps fifty of a job's)
const clip = (s, n = 1000) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t; };
const FAILED = new Set(['failure', 'timed_out', 'cancelled', 'action_required', 'startup_failure', 'stale']);
// a branch's name as git allows it (no .. or // or a segment starting with a dot): never a path of the API's own
const isBranch = b => /^[A-Za-z0-9._/-]{1,250}$/.test(b) && !b.split('/').some(x => !x || x.startsWith('.') || x.endsWith('.lock'));
const LEVEL = { notice: 'info', warning: 'warning', failure: 'error' };

/** A commit's checks: { commit, state ('none' | 'pending' | 'completed'), conclusion ('success' | 'failure' | null), runs:
 *  [{ name, status, conclusion, url, title, annotations: [{ level ('info' | 'warning' | 'error'), title, message }] }] }.
 *  ref: the commit's hash (or a branch). A run's annotations are read once it is completed. */
export async function commitChecks(client, { owner, repo, ref }) {
  if (!/^[0-9a-f]{40}$/.test(String(ref)) && !isBranch(String(ref))) throw new GitHubError(`not a commit or a branch: ${clip(ref, 80)}`, null, 400);
  const base = client.repo(owner, repo);
  const j = await client.request('GET', `${base}/commits/${client.pathOf(ref)}/check-runs?per_page=${PER_PAGE}`);
  const runs = [];
  for (const c of (j?.check_runs || []).slice().sort((a, b) => String(a.name).localeCompare(String(b.name)))) {
    const run = { name: clip(c.name, 200), status: c.status, conclusion: c.conclusion ?? null, url: safeUrl(c.html_url), title: c.output?.title ? clip(c.output.title, 300) : null, annotations: [] };
    if (c.status === 'completed' && c.output?.annotations_count > 0 && Number.isInteger(c.id)) {
      const list = await client.request('GET', `${base}/check-runs/${c.id}/annotations?per_page=${MAX_ANNOTATIONS}`);
      run.annotations = (Array.isArray(list) ? list : []).slice(0, MAX_ANNOTATIONS)
        .map(a => ({ level: LEVEL[a.annotation_level] || 'info', title: a.title ? clip(a.title, 200) : null, message: clip(a.message) }));
    }
    runs.push(run);
  }
  const state = !runs.length ? 'none' : runs.every(r => r.status === 'completed') ? 'completed' : 'pending';
  const conclusion = runs.some(r => FAILED.has(r.conclusion)) ? 'failure' : state === 'completed' ? 'success' : null;
  return { commit: ref, state, conclusion, runs };
}

// a run's page on GitHub, only if it is one (the console makes it a link)
const safeUrl = u => (typeof u === 'string' && /^https:\/\/github\.com\/[^\s"'<>]+$/.test(u) ? u : null);

const STATE = { queued: 'queued', in_progress: 'running', waiting: 'waiting', pending: 'waiting', requested: 'waiting' };

/** The console's lines of a commit's checks: [{ level ('info' | 'warning' | 'error'), text }]. */
export function checksLines({ commit, state, runs }) {
  const short = String(commit).slice(0, 7);
  if (state === 'none') return [{ level: 'info', text: `No check on GitHub for commit ${short}: the repository has no workflow, or it has not started yet.` }];
  const lines = [];
  for (const r of runs) {
    if (r.status !== 'completed') { lines.push({ level: 'info', text: `${r.name}: ${STATE[r.status] || r.status} (commit ${short}); Checks again shows its result.` }); continue; }
    const failed = FAILED.has(r.conclusion);
    lines.push({ level: failed ? 'error' : 'info', text: `${r.name}: ${r.conclusion}${r.title ? ` (${r.title})` : ''} (commit ${short})${r.url ? `: ${r.url}` : ''}` });
    for (const a of r.annotations) lines.push({ level: a.level, text: `  ${a.title ? `${a.title}: ` : ''}${a.message}` });
  }
  return lines;
}
