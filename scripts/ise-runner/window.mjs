#!/usr/bin/env node
// The ISE runner's on-line window (#482): the runner (the maintainer's machine, label "ise") is on line
// only while the ISE and Quality workflows need it, so that a job it is not meant for has less time to
// reach it. launchd (install.sh: an agent of the runner's user, or with --system a daemon of root) runs
// `window.sh tick` every 15 minutes and at start:
//   - every evening at OPEN (local time, before ise.yml's cron, 21:47 UTC) the window opens and the
//     runner's service starts;
//   - it stops when the runner is idle, no run of ise.yml / quality.yml is queued or running, and the
//     window's workflows have run (ise.yml; on Saturdays quality.yml too, its cron is Saturday 23:00
//     UTC), or HARD_CLOSE hours after the opening; GitHub starts scheduled runs hours late (ONBOARDING),
//     and a job queued while the runner is off waits for it (up to 24 hours).
// The window is not the protection: GitHub keeps a job queued for its runner, which then runs it at the
// next opening. job-started.sh refuses, before its first step, every job that is not one of these two.
//   window.sh tick | open | close | status
//     open: on line now (a run by hand: Actions > ISE > Run workflow), closed by the same rule, once a
//     run of either workflow has finished; close: off now, when idle.
// No token: the repository's runs are public (GitHub's API, 60 requests an hour; a tick makes 7).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REPO = 'pmnmalo/Silinx';
export const WORKFLOWS = ['ise.yml', 'quality.yml'];
export const OPEN = { hour: 21, minute: 15 };
export const HARD_CLOSE = 18;               // hours after the opening
const ACTIVE = ['queued', 'in_progress', 'waiting', 'requested', 'pending'];
const HOUR = 3600e3;

/** The latest scheduled opening not after `now` (local time): today's, or yesterday's before OPEN. */
export function lastOpening(now, open = OPEN) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), open.hour, open.minute);
  if (d > now) d.setDate(d.getDate() - 1);
  return d;
}

/** The workflows a window opened by the schedule waits for: ISE, and Quality on Saturdays. */
export function needs(opened) {
  return opened.getDay() === 6 ? ['ise.yml', 'quality.yml'] : ['ise.yml'];
}

/**
 * What a tick does: { action: 'start' | 'stop' | 'none', state, why }.
 * state: { opened: ms, needs: [workflow] | 'any' } of the current window (null before the first one).
 * running: the runner's service on; busy: a job on it; active: runs of the two workflows queued or
 * running (null: GitHub not reached); ran: { workflow: true } for those with a finished run since the
 * opening (null: not reached).
 */
export function decide({ now, state, running, busy, active, ran }) {
  const opening = lastOpening(now);
  if (!state || state.opened < opening.getTime()) {
    const s = { opened: opening.getTime(), needs: needs(opening) };
    return { action: running ? 'none' : 'start', state: s, why: `the window of ${opening.toString()} opens` };
  }
  if (!running) return { action: 'none', state, why: 'closed' };
  if (busy) return { action: 'none', state, why: 'a job is running' };
  if (now.getTime() >= state.opened + HARD_CLOSE * HOUR) return { action: 'stop', state, why: `${HARD_CLOSE} hours since the opening` };
  if (active == null || ran == null) return { action: 'none', state, why: 'GitHub not reached' };
  if (active > 0) return { action: 'none', state, why: `${active} run(s) queued or running` };
  const done = state.needs === 'any' ? WORKFLOWS.some(w => ran[w]) : state.needs.every(w => ran[w]);
  return done ? { action: 'stop', state, why: 'the window\'s runs have finished' } : { action: 'none', state, why: 'waiting for the runs' };
}

/**
 * The runs of the two workflows queued or running, and those finished since `since` (ms): the scheduled
 * ones only when `scheduled` (a window opened by the schedule waits for its scheduled runs; a run by
 * hand inside it does not close it, #901).
 */
export async function runs(since, fetchJson = getJson, scheduled = false) {
  let active = 0;
  for (const s of ACTIVE) {
    const r = await fetchJson(`https://api.github.com/repos/${REPO}/actions/runs?status=${s}&per_page=100`);
    active += (r.workflow_runs || []).filter(w => WORKFLOWS.some(f => w.path === `.github/workflows/${f}`)).length;
  }
  const ran = {};
  const created = new Date(since).toISOString().replace(/\.\d+Z$/, 'Z');
  for (const f of WORKFLOWS) {
    const r = await fetchJson(`https://api.github.com/repos/${REPO}/actions/workflows/${f}/runs?status=completed&created=%3E%3D${created}${scheduled ? '&event=schedule' : ''}&per_page=1`);
    ran[f] = r.total_count > 0;
  }
  return { active, ran };
}

async function getJson(url) {
  const r = await fetch(url, { headers: { accept: 'application/vnd.github+json', 'user-agent': 'silinx-runner-window' } });
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

/** One command against the machine; `sys` holds what touches it (replaced in the tests). */
export async function run(cmd, sys) {
  const state = sys.readState();
  const running = sys.running(), busy = sys.busy();
  const now = sys.now();
  let d;
  if (cmd === 'open') d = { action: running ? 'none' : 'start', state: { opened: now.getTime(), needs: 'any' }, why: 'opened by hand' };
  else if (cmd === 'close') d = { action: running && !busy ? 'stop' : 'none', state, why: busy ? 'a job is running: not closed' : 'closed by hand' };
  else if (cmd === 'tick' || cmd === 'status') {
    let active = null, ran = null;
    if (state && running && !busy && state.opened >= lastOpening(now).getTime()) {
      try { ({ active, ran } = await sys.runs(state.opened, undefined, state.needs !== 'any')); } catch (e) { sys.log(`GitHub: ${e.message}`); }
    }
    d = decide({ now, state, running, busy, active, ran });
    if (cmd === 'status') {
      sys.log(`runner ${running ? (busy ? 'on line, running a job' : 'on line') : 'off'}; window ${d.state.opened ? new Date(d.state.opened).toString() : '-'}; next tick: ${d.action} (${d.why})`);
      return d;
    }
  } else throw new Error(`usage: window.sh tick | open | close | status (not '${cmd}')`);
  if (d.action !== 'none') sys.service(d.action);
  sys.writeState(d.state);
  if (d.action !== 'none' || cmd !== 'tick') sys.log(`${d.action}: ${d.why}`);
  return d;
}

/**
 * The commands that start or stop the runner's service: [{ cmd, args, cwd, optional }]. RUNNER_DAEMON
 * (install.sh --system): the runner's launchd daemon, run as its own user, loaded and unloaded by root
 * (unloaded first when starting, as a daemon that exited stays loaded, and loaded again once launchd has let
 * it go); otherwise the logged-in user's
 * agent, through the runner's svc.sh.
 */
export function serviceCommands(action, env = process.env) {
  if (action !== 'start' && action !== 'stop') throw new Error(`service: start or stop, not '${action}'`);
  const plist = env.RUNNER_DAEMON;
  if (!plist) return [{ cmd: './svc.sh', args: [action], cwd: env.RUNNER_DIR, optional: false }];
  const label = `system/${path.basename(plist, '.plist')}`;
  const bootout = { cmd: 'launchctl', args: ['bootout', label], cwd: '/' };
  if (action === 'stop') return [{ ...bootout, optional: false }];
  // launchd refuses a bootstrap while the unloaded daemon is still exiting (5: Input/output error): wait for it
  const gone = { cmd: '/bin/sh', args: ['-c', `i=0; while launchctl print ${label} >/dev/null 2>&1 && [ $i -lt 30 ]; do sleep 1; i=$((i+1)); done`], cwd: '/', optional: true };
  return [{ ...bootout, optional: true }, gone, { cmd: 'launchctl', args: ['bootstrap', 'system', plist], cwd: '/', optional: false }];
}

/** The real machine: the runner's service (svc.sh or its daemon), its processes, the state file. */
function machine(env = process.env) {
  const dir = env.RUNNER_DIR;
  if (!dir) throw new Error('RUNNER_DIR: the runner\'s folder');
  const stateFile = path.join(env.STATE_DIR || path.join(os.homedir(), 'Library', 'Silinx-runner'), 'window.json');
  const pgrep = p => { try { execFileSync('pgrep', ['-f', p], { stdio: 'ignore' }); return true; } catch { return false; } };
  return {
    now: () => new Date(),
    readState: () => { try { return JSON.parse(fs.readFileSync(stateFile, 'utf8')); } catch { return null; } },
    writeState: s => { fs.mkdirSync(path.dirname(stateFile), { recursive: true }); fs.writeFileSync(stateFile, JSON.stringify(s) + '\n'); },
    running: () => pgrep('Runner.Listener'),
    busy: () => pgrep('Runner.Worker'),
    runs,
    service: action => {
      for (const c of serviceCommands(action, env)) {
        try { execFileSync(c.cmd, c.args, { cwd: c.cwd, stdio: c.optional ? 'ignore' : 'inherit' }); } catch (e) { if (!c.optional) throw e; }
      }
    },
    log: m => console.log(`${new Date().toISOString()} ${m}`),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  run(process.argv[2] || 'tick', machine()).catch(e => { console.error(e.message); process.exit(1); });
}
