#!/usr/bin/env node
// A scheduled workflow's failure as an issue (#251): the nightly corpora, the ISE tests and the weekly
// comparison with ISE run unattended, so a job that fails opens an issue (one per workflow and job,
// '<workflow> failed: <job>', labels bug and tests & CI), or comments on it when it is open already:
// the run, the commit, and the lines of the job's log that say what failed. A job that hit its time limit
// (timeout-minutes) is reported too (#343): GitHub ends it 'cancelled', not 'failure', and says so in an
// annotation, which a job cancelled by hand or by a newer run does not have. Issues are public: the
// lines are cleaned of home folders, logins, addresses and e-mails (the ISE jobs run on a machine of
// our own).
//
//   node scripts/report-failure.mjs
//   (in GitHub Actions: GITHUB_TOKEN with issues: write, actions: read and checks: read, GITHUB_REPOSITORY,
//   GITHUB_RUN_ID, GITHUB_WORKFLOW, GITHUB_SHA, GITHUB_SERVER_URL); REPORT_DRY_RUN=1 prints what it would
//   write instead (a try on a past run)
import { fileURLToPath } from 'node:url';

/** A log line without what must not be public: home folders, logins (user@host), addresses, e-mails. */
export function clean(line) {
  return String(line)
    .replace(/(\/Users|\/home|\b[A-Z]:\\Users)[\\/][^\\/\s'"`:]+/g, '$1/<user>')
    .replace(/\b[\w.+-]+@[\w-]+(\.[\w-]+)*\.[a-z]{2,}\b/gi, '<e-mail>')
    .replace(/\b[\w.-]+@(\d{1,3}(\.\d{1,3}){3}|[\w-]+(\.[\w-]+)*)\b/g, '<user>@<host>')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, (ip) => (/^(127\.|0\.0\.0\.0)/.test(ip) ? ip : '<address>'));
}

// the lines that say what failed: a test's 'not ok' and its error, a corpus design's failure, an error
const FAILURE = /\bnot ok \d+\b|^\s*✖|\bfail(?![-\w])|\bmismatch\b|\bfailed\b|\bERROR\b|\berror\b:|^\s*(Error|AssertionError|TypeError|RangeError)\b|timed out|^(LARGER OR SLOWER|NEW WARNINGS|VANISHED WARNINGS)\b|##\[error\]/;

/** The lines of a job's log that say what failed: their timestamps off, cleaned, each once, `max` at most. */
export function failureLines(log, max = 40) {
  const out = [];
  for (const raw of String(log).split(/\r?\n/)) {
    const line = raw.replace(/^﻿?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
    if (!line.trim() || !FAILURE.test(line)) continue;
    const c = clean(line).slice(0, 300);
    if (!out.includes(c)) out.push(c);
    if (out.length >= max) break;
  }
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
      ...(lines.length ? ['', '```', ...lines, '```'] : []),
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
    const issue = open.find(i => i.title === title);
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
