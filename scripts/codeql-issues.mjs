#!/usr/bin/env node
// Code scanning's alerts as issues (#2021): CodeQL's findings are seen only in Security ▸ Code scanning, where they
// piled up between reviews (#585, #2011). After each analysis (codeql.yml's job `issues`) every open alert of the
// default branch with no issue yet gets one, to be decided there: fixed (Fixes #N) or dismissed with its reason.
// Issues are public and a vulnerability is reported privately (SECURITY.md): an issue says nothing of the alert
// but its number and its link, which only the maintainers can open ('CodeQL: a new alert to review (alert #N)',
// labels bug and security; no rule, file, line or message, no dismissal's comment). An issue holds its alert's
// number in a marker, so an alert is never opened twice (its issue closed by hand included); an open issue whose
// alert is fixed or dismissed is closed with a comment saying which.
//
//   node scripts/codeql-issues.mjs
//   (in GitHub Actions: GITHUB_TOKEN with issues: write and security-events: read, GITHUB_REPOSITORY);
//   CODEQL_ISSUES_DRY_RUN=1 prints what it would do instead
import { fileURLToPath } from 'node:url';

const MARK = /<!-- codeql-alert:(\d+) -->/;
export const marker = (n) => `<!-- codeql-alert:${n} -->`;

/** The alert's number an issue's body holds (its marker), or null. */
export const alertOf = (issue) => { const m = MARK.exec(issue.body || ''); return m ? +m[1] : null; };

/** The issue of an alert: { title, body, labels }, with nothing of the alert but its number and link. */
export function alertIssue(a) {
  return {
    title: `CodeQL: a new alert to review (Security ▸ Code scanning, alert #${a.number})`,
    body: [
      `CodeQL found something to review on the default branch: ${a.html_url} (the maintainers only).`,
      '',
      'To decide: fix it (a regression test, `Fixes #N`), or dismiss the alert with its reason: the next analysis closes this issue then. Its details stay in Security ▸ Code scanning, not here (SECURITY.md).',
      '',
      `(Opened by the workflow, scripts/codeql-issues.mjs.) ${marker(a.number)}`,
    ].join('\n'),
    labels: ['bug', 'security'],
  };
}

/** What to do: the open alerts with no issue (any state) to open, the open issues whose alert was fixed or dismissed
 *  to close ({ issue, alert }). */
export function plan(alerts, issues) {
  const issueOf = new Map();
  for (const i of issues) { const n = alertOf(i); if (n !== null && (!issueOf.has(n) || i.state === 'open')) issueOf.set(n, i); }
  const byNumber = new Map(alerts.map((a) => [a.number, a]));
  return {
    open: alerts.filter((a) => a.state === 'open' && !issueOf.has(a.number)),
    close: [...issueOf].filter(([n, i]) => i.state === 'open' && ['fixed', 'dismissed'].includes(byNumber.get(n)?.state))
      .map(([n, issue]) => ({ issue, alert: byNumber.get(n) })),
  };
}

/** The comment that closes an alert's issue: fixed, or dismissed with its reason (one of GitHub's: false positive,
 *  won't fix, used in tests), never its comment. */
export function closeComment(a) {
  if (a.state === 'fixed') return `CodeQL's alert ${a.html_url} is fixed: no longer found on the default branch.`;
  return `CodeQL's alert ${a.html_url} was dismissed${a.dismissed_reason ? ` (${a.dismissed_reason})` : ''}.`;
}

async function main() {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo } = process.env, dry = !!process.env.CODEQL_ISSUES_DRY_RUN;
  if (!token || !repo) { console.error('usage: codeql-issues.mjs (in GitHub Actions)'); process.exit(2); }
  const api = async (p, opts = {}) => {
    const r = await fetch(`https://api.github.com/repos/${repo}/${p}`, { ...opts, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(opts.body && { 'Content-Type': 'application/json' }) } });
    if (!r.ok) throw new Error(`GitHub API ${p}: ${r.status} ${r.statusText}`);
    return r;
  };
  const all = async (p) => {
    const out = [];
    for (let page = 1; page <= 20; page++) {
      const batch = await (await api(`${p}&per_page=100&page=${page}`)).json();
      out.push(...batch);
      if (batch.length < 100) break;
    }
    return out;
  };
  const alerts = await all('code-scanning/alerts?tool_name=CodeQL');
  const issues = (await all('issues?state=all&labels=security')).filter((i) => !i.pull_request);
  const { open, close } = plan(alerts, issues);
  for (const a of open) {
    const it = alertIssue(a);
    if (dry) { console.log(`new issue: ${it.title}\n${it.body}\n`); continue; }
    const made = await (await api('issues', { method: 'POST', body: JSON.stringify(it) })).json();
    console.log(`alert ${a.number}: opened #${made.number}`);
  }
  for (const { issue, alert } of close) {
    const body = closeComment(alert);
    if (dry) { console.log(`close #${issue.number}: ${body}`); continue; }
    await api(`issues/${issue.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
    await api(`issues/${issue.number}`, { method: 'PATCH', body: JSON.stringify({ state: 'closed', state_reason: alert.state === 'fixed' ? 'completed' : 'not_planned' }) });
    console.log(`alert ${alert.number}: closed #${issue.number}`);
  }
  if (!open.length && !close.length) console.log('no alert to open or close an issue for');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
