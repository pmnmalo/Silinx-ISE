#!/usr/bin/env node
// A scheduled workflow's failure as an issue (#251): the nightly corpora, the ISE tests and the weekly
// comparison with ISE run unattended, so a job that fails opens an issue (one per workflow and job,
// '<workflow> failed: <job>', labels bug and tests & CI), or comments on it when it is open already:
// the run, the commit, and the lines of the job's log that say what failed. A job that hit its time limit
// (timeout-minutes) is reported too (#343): GitHub ends it 'cancelled', not 'failure', and says so in an
// annotation, which a job cancelled by hand or by a newer run does not have. Issues are public: the
// lines are cleaned of home folders, logins, addresses, e-mails, computer names, the runner's folders
// and ids (the ISE jobs run on a machine of our own), and a line that still matches a rule of
// scripts/check-private-data.mjs is withheld (#1437).
//
//   node scripts/report-failure.mjs
//   (in GitHub Actions: GITHUB_TOKEN with issues: write, actions: read and checks: read, GITHUB_REPOSITORY,
//   GITHUB_RUN_ID, GITHUB_WORKFLOW, GITHUB_SHA, GITHUB_SERVER_URL); REPORT_DRY_RUN=1 prints what it would
//   write instead (a try on a past run)
import { fileURLToPath } from 'node:url';
import { scanText } from './check-private-data.mjs';
import { codeBlock, ownIssue } from './github-text.mjs';

// the runner's own name and folders, from its environment (set on a self-hosted runner, and in Actions; the
// GitHub-hosted ones' are harmless but no less replaced): each a literal, replaced by its placeholder
const RUNNER_ENV = [['RUNNER_NAME', '<runner>'], ['HOSTNAME', '<host>'], ['RUNNER_DIR', '<runner dir>'], ['RUNNER_TEMP', '<runner temp>'],
  ['RUNNER_WORKSPACE', '<workspace>'], ['GITHUB_WORKSPACE', '<workspace>'], ['RUNNER_TOOL_CACHE', '<tool cache>']];
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** The runner's names and folders to replace: [RegExp, placeholder]; a value shorter than three characters or a
 *  plain number would hit everything, and is not. */
export function runnerLiterals(env = process.env) {
  return RUNNER_ENV.flatMap(([name, to]) => {
    const v = (env[name] || '').trim().replace(/[\\/]+$/, '');
    return v.length >= 3 && !/^\d+$/.test(v) ? [[new RegExp(escapeRe(v), 'gi'), to]] : [];
  });
}

// a computer's name: a name under .local / .lan / .home / .internal / .home.arpa (mDNS, a home router's domain), or a
// tailnet's (Tailscale's MagicDNS, .ts.net, #3520)
const HOST_NAME = /\b[\w-]+(?:\.[\w-]+)*\.(?:local|lan|home|internal|home\.arpa|ts\.net)\b/gi;
// an IPv6 address: eight groups, or a compressed one (::) with a group at least (a time, 08:13:55, has no ::),
// with its zone (%en0) if any
const IPV6 = /(?<![\w:.])(?:(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}|(?:[0-9a-f]{1,4}:){1,7}:(?:[0-9a-f]{1,4}(?::[0-9a-f]{1,4}){0,6})?|::(?:[0-9a-f]{1,4}:){0,6}[0-9a-f]{1,4})(?:%\w+)?(?![\w:.])/gi;
const MAC = /\b(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}\b/gi;
// a container's id: 12 or 64 hex digits, with a letter and a digit both (not a number, not a word)
const CONTAINER_ID = /\b(?=[0-9a-f]*[a-f])(?=[a-f]*\d)(?:[0-9a-f]{64}|[0-9a-f]{12})\b/gi;

/** A log line without what must not be public: the runner's name and folders, home folders, volumes, logins
 *  (user@host), e-mails, computer names, addresses (IPv4 but loopback, IPv6 but ::1, MAC), container ids. */
export function clean(line, env = process.env) {
  let s = String(line);
  for (const [re, to] of runnerLiterals(env)) s = s.replace(re, to);
  return s
    .replace(/(\/Users|\/home|\b[A-Z]:\\Users)[\\/][^\\/\s'"`:]+/g, '$1/<user>')
    .replace(/\/Volumes\/[^\\/\s'"`:]+/g, '/Volumes/<volume>')
    .replace(/\b[\w.+-]+@[\w-]+(\.[\w-]+)*\.[a-z]{2,}\b/gi, '<e-mail>')
    .replace(/\b[\w.-]+@(\d{1,3}(\.\d{1,3}){3}|[\w-]+(\.[\w-]+)*)\b/g, '<user>@<host>')
    .replace(HOST_NAME, '<host>')
    .replace(MAC, '<mac>')
    .replace(IPV6, (ip) => (ip === '::1' ? ip : '<address>'))
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, (ip) => (/^(127\.|0\.0\.0\.0)/.test(ip) ? ip : '<address>'))
    .replace(CONTAINER_ID, '<id>');
}

/** Whether a cleaned line still holds what the private-data rules (scripts/check-private-data.mjs) look for:
 *  such a line is withheld rather than published (#1437). */
export const holdsPrivateData = (line) => scanText("(a job's log)", line, { whole: false }).some((x) => x.line > 0);

// the lines that say what failed: a test's 'not ok' and its error, a corpus design's failure, an error
const FAILURE = /\bnot ok \d+\b|^\s*✖|\bfail(?![-\w])|\bmismatch\b|\bfailed\b|\bERROR\b|\berror\b:|^\s*(Error|AssertionError|TypeError|RangeError)\b|timed out|^(LARGER OR SLOWER|NEW WARNINGS|VANISHED WARNINGS)\b|##\[error\]/;

/** The lines of a job's log that say what failed: their timestamps off, cleaned, each once, `max` at most; a line
 *  that still holds private data is left out, and a last line says how many were (#1437). */
export function failureLines(log, max = 40, env = process.env) {
  const out = [];
  let withheld = 0;
  for (const raw of String(log).split(/\r?\n/)) {
    const line = raw.replace(/^﻿?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
    if (!line.trim() || !FAILURE.test(line)) continue;
    const c = clean(line, env).slice(0, 300);
    if (holdsPrivateData(c)) { withheld++; continue; }
    if (!out.includes(c)) out.push(c);
    if (out.length >= max) break;
  }
  if (withheld) out.push(`(${withheld} line${withheld > 1 ? 's' : ''} withheld: private data; see the run)`);
  return out;
}

// the annotation of a job that hit its timeout-minutes ('The job has exceeded the maximum execution time of
// 1h0m0s'); one cancelled by a newer run says 'Canceling since a higher priority waiting request … exists'
export const TIMED_OUT = /\bexceeded the maximum execution time\b/;

/**
 * The jobs of a run to report: [{ job, timedOut }], those that failed (timedOut null) and those cancelled
 * at their time limit (timedOut: the annotation's message); a job cancelled otherwise (by hand, by a newer
 * run) is not. annotationsOf(job) resolves with the annotations of the job's check run.
 */
export async function jobsToReport(jobs, annotationsOf) {
  const out = [];
  for (const job of jobs) {
    if (job.conclusion === 'failure') out.push({ job, timedOut: null });
    else if (job.conclusion === 'cancelled') {
      let notes = [];
      try { notes = await annotationsOf(job); } catch (e) { console.error(`the annotations of ${job.name}: ${e.message}`); }
      const t = notes.find(a => TIMED_OUT.test(a.message || ''));
      if (t) out.push({ job, timedOut: t.message });
    }
  }
  return out;
}

/** The issue of a failed job: { title, body } (body: also the comment when the issue is open already);
 *  timedOut: the annotation of a job cancelled at its time limit. */
export function issueText({ workflow, job, runUrl, sha, lines, timedOut = null }) {
  return {
    title: `${workflow} failed: ${job}`,
    body: [
      timedOut ? `The scheduled run ${runUrl} timed out in the job **${job}** (${timedOut}), on ${sha.slice(0, 7)}.`
        : `The scheduled run ${runUrl} failed in the job **${job}**, on ${sha.slice(0, 7)}.`,
      '',
      lines.length ? 'What its log says:' : 'Its log says nothing more (see the run).',
      // (in a code block that no fence of the log closes: its text inert, no markup, no @mention, #3417)
      ...(lines.length ? ['', ...codeBlock(lines)] : []),
      '',
      '(Opened by the workflow, scripts/report-failure.mjs: a later failure of this job is added here while the issue is open.)',
    ].join('\n'),
  };
}

async function main() {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, GITHUB_RUN_ID: runId, GITHUB_WORKFLOW: workflow, GITHUB_SHA: sha,
    GITHUB_SERVER_URL: server = 'https://github.com' } = process.env;
  if (!token || !repo || !runId || !workflow || !sha) { console.error('usage: report-failure.mjs (in GitHub Actions)'); process.exit(2); }
  const api = async (p, opts = {}) => {
    const r = await fetch(`https://api.github.com/repos/${repo}/${p}`, { ...opts, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(opts.body && { 'Content-Type': 'application/json' }) } });
    if (!r.ok) throw new Error(`GitHub API ${p}: ${r.status} ${r.statusText}`);
    return r;
  };
  const jobs = (await (await api(`actions/runs/${runId}/jobs?per_page=100`)).json()).jobs || [];
  // (a job's check run: its check_run_url, the job's id otherwise)
  const failed = await jobsToReport(jobs, async j => (await api(`check-runs/${String(j.check_run_url || j.id).split('/').pop()}/annotations?per_page=100`)).json());
  if (!failed.length) { console.log('no failed or timed-out job'); return; }
  const open = [];
  for (let page = 1; page <= 5; page++) {
    const batch = await (await api(`issues?state=open&per_page=100&page=${page}`)).json();
    open.push(...batch.filter(i => !i.pull_request));
    if (batch.length < 100) break;
  }
  for (const { job: j, timedOut } of failed) {
    let lines = [];
    try { lines = failureLines(await (await api(`actions/jobs/${j.id}/logs`)).text()); } catch (e) { console.error(`the log of ${j.name}: ${e.message}`); }
    const { title, body } = issueText({ workflow, job: j.name, runUrl: `${server}/${repo}/actions/runs/${runId}`, sha, lines, timedOut });
    // (the bot's own issue only: one of the same title by anyone else is not taken, #3417)
    const issue = ownIssue(open, title);
    if (process.env.REPORT_DRY_RUN) { console.log(`${issue ? `comment on #${issue.number}` : 'new issue'}: ${title}\n${body}\n`); continue; }
    if (issue) {
      await api(`issues/${issue.number}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
      console.log(`${j.name}: commented on #${issue.number}`);
    } else {
      const made = await (await api('issues', { method: 'POST', body: JSON.stringify({ title, body, labels: ['bug', 'tests & CI'] }) })).json();
      console.log(`${j.name}: opened #${made.number}`);
    }
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
