// In-memory job manager for long-running tool invocations (ISE flow, programming, JTAG scans).
//
//   const job = createJob('implement', async job => { job.log('hi'); await runCommand(job, 'xst', [...]); return result; });
//   getJob(job.id, since) -> { id, kind, status, lines, next, result, error, ... }
//
// Jobs keep their log in memory (capped) and are garbage-collected some time after finishing.

import { spawn } from 'node:child_process';
import crypto from 'node:crypto';

const jobs = new Map();
const MAX_LINES = 50_000;         // per job; older lines are dropped (offsets stay stable)
const KEEP_FINISHED_MS = 60 * 60 * 1000;
const MAX_JOBS = 200;

export class JobCancelled extends Error {
  constructor() { super('cancelled by user'); this.cancelled = true; }
}

/**
 * Create and start a job. `fn(job)` runs asynchronously; its resolved value becomes `job.result`
 * and status 'ok'; a throw sets status 'error' (with `job.error`).
 */
export function createJob(kind, fn, { meta } = {}) {
  gc();
  const job = {
    id: crypto.randomBytes(6).toString('hex'),
    kind,
    meta: meta || {},
    status: 'running',
    startedAt: new Date().toISOString(),
    endedAt: null,
    result: null,
    error: null,
    cancelled: false,
    lines: [],
    dropped: 0,              // number of lines dropped from the front
    procs: new Set(),        // child processes, killed on cancel
    log(line) {
      for (const l of String(line).split(/\r?\n/)) {
        this.lines.push(l);
      }
      if (this.lines.length > MAX_LINES) {
        const n = this.lines.length - MAX_LINES;
        this.lines.splice(0, n);
        this.dropped += n;
      }
    },
    checkCancelled() { if (this.cancelled) throw new JobCancelled(); },
  };
  jobs.set(job.id, job);
  // Run on next tick so the caller can return the job id before any output.
  setImmediate(async () => {
    try {
      const r = await fn(job);
      if (job.cancelled) throw new JobCancelled();
      job.result = r ?? job.result;
      job.status = 'ok';
    } catch (e) {
      job.status = 'error';
      job.error = e?.message || String(e);
      if (e?.result) job.result = e.result;
      job.log(`ERROR: ${job.error}`);
    } finally {
      job.endedAt = new Date().toISOString();
    }
  });
  return job;
}

/** Public view of a job; `since` is the absolute line offset already seen by the client. */
export function getJob(id, since = 0) {
  const job = jobs.get(id);
  if (!job) return null;
  since = Math.max(0, parseInt(since, 10) || 0);
  const start = Math.max(0, since - job.dropped);
  return {
    id: job.id,
    kind: job.kind,
    meta: job.meta,
    status: job.status,
    cancelled: job.cancelled,
    startedAt: job.startedAt,
    endedAt: job.endedAt,
    lines: job.lines.slice(start),
    next: job.dropped + job.lines.length,
    result: job.result,
    error: job.error,
  };
}

export function listJobs() {
  return [...jobs.values()].map(j => ({ id: j.id, kind: j.kind, status: j.status, startedAt: j.startedAt, endedAt: j.endedAt, meta: j.meta }));
}

/** Request cancellation: kills running child processes; the job ends with status 'error'. */
export function cancelJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status === 'running') {
    job.cancelled = true;
    job.log('*** cancel requested ***');
    for (const p of job.procs) killTree(p);
  }
  return getJob(id, job.dropped + job.lines.length);
}

function killTree(p) {
  try {
    // Children are spawned detached (own process group) on POSIX so the whole tree can be killed.
    if (process.platform !== 'win32' && p.pid) process.kill(-p.pid, 'SIGTERM');
    else p.kill('SIGTERM');
  } catch { try { p.kill('SIGTERM'); } catch { /* already gone */ } }
  setTimeout(() => {
    if (p.exitCode === null && p.signalCode === null) {
      try { if (process.platform !== 'win32') process.kill(-p.pid, 'SIGKILL'); else p.kill('SIGKILL'); } catch { /* gone */ }
    }
  }, 3000).unref();
}

function gc() {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (j.status !== 'running' && j.endedAt && now - Date.parse(j.endedAt) > KEEP_FINISHED_MS) jobs.delete(id);
  }
  if (jobs.size > MAX_JOBS) {
    for (const [id, j] of jobs) { if (jobs.size <= MAX_JOBS) break; if (j.status !== 'running') jobs.delete(id); }
  }
}

/**
 * Spawn `cmd args...` (no shell), stream stdout/stderr line by line into the job log and
 * resolve with the exit code (or reject if the binary cannot be started / the job is cancelled).
 *
 * @param {object} job
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} [o]
 * @param {string} [o.cwd]
 * @param {object} [o.env]      merged over process.env
 * @param {string} [o.input]    written to stdin, then stdin is closed
 * @param {string} [o.prefix]   prefix for stderr lines (default '')
 * @param {boolean} [o.echo=true] log the command line first
 * @param {(line:string, stream:'stdout'|'stderr')=>void} [o.onLine]
 */
export function runCommand(job, cmd, args = [], { cwd, env, input, prefix = '', echo = true, onLine } = {}) {
  return new Promise((resolve, reject) => {
    if (job?.cancelled) return reject(new JobCancelled());
    if (echo) job?.log(`$ ${[cmd, ...args].map(displayArg).join(' ')}`);
    let child;
    try {
      child = spawn(cmd, args, {
        cwd,
        env: { ...process.env, ...(env || {}) },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      });
    } catch (e) { return reject(e); }
    job?.procs.add(child);

    const pump = (stream, name) => {
      let buf = '';
      stream.setEncoding('utf8');
      stream.on('data', d => {
        buf += d;
        // '\r' alone (progress bars) also ends a line; keep a trailing '\r' buffered in case
        // the matching '\n' arrives in the next chunk.
        const parts = buf.split(/\r\n|\n|\r(?!$)/);
        buf = parts.pop();
        for (const line of parts) emit(line, name);
      });
      stream.on('end', () => { buf = buf.replace(/\r$/, ''); if (buf) emit(buf, name); buf = ''; });
    };
    const emit = (line, name) => {
      job?.log(name === 'stderr' ? prefix + line : line);
      onLine?.(line, name);
    };
    pump(child.stdout, 'stdout');
    pump(child.stderr, 'stderr');

    child.stdin.on('error', () => { /* process may not read stdin */ });
    if (input !== undefined) child.stdin.end(input); else child.stdin.end();

    child.on('error', e => {
      job?.procs.delete(child);
      if (e.code === 'ENOENT') reject(new Error(`command not found: ${cmd}`));
      else reject(e);
    });
    child.on('close', (code, signal) => {
      job?.procs.delete(child);
      if (job?.cancelled) return reject(new JobCancelled());
      resolve(code ?? (signal ? 128 : 1));
    });
  });
}

/** Run and capture output without a job (for cheap probes like `--version`). */
export function capture(cmd, args = [], { cwd, env, timeoutMs = 4000, input } = {}) {
  return new Promise(resolve => {
    let out = '', done = false;
    let child;
    try {
      child = spawn(cmd, args, { cwd, env: { ...process.env, ...(env || {}) }, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) { return resolve({ code: -1, out: '', error: e.message }); }
    const finish = r => { if (!done) { done = true; clearTimeout(t); resolve(r); } };
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* */ } finish({ code: -1, out, error: 'timeout' }); }, timeoutMs);
    child.stdout.on('data', d => { out += d; });
    child.stderr.on('data', d => { out += d; });
    child.stdin.on('error', () => {});
    child.stdin.end(input ?? '');
    child.on('error', e => finish({ code: -1, out, error: e.code === 'ENOENT' ? 'not found' : e.message }));
    child.on('close', code => finish({ code, out }));
  });
}

function displayArg(a) {
  a = String(a);
  return /^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, `'\\''`)}'`;
}
