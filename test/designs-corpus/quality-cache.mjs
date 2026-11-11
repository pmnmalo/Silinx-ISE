// The Quality comparison's builds kept between runs (#3292). compare-ise.mjs --cache <dir> writes each build's result (a
// design by one flow at one goal) to <dir> as soon as it is measured, under a key of what decides it, and a later run takes
// it from there instead of building it again: a run stopped by its deadline or its job's timeout, run again, measures only
// what is missing. A Silinx build's key holds the commit compared (the toolchain's code, Yosys's and nextpnr's versions in
// its package-lock), an ISE build's the ISE image, the build scripts Silinx writes for it (server/ise.js) and the
// comparison's own code, not the commit: XST, map and par of the same project at the same goal give the same result.
// Both hold the project (its files' hash), the goal and its Process Properties, the device and, for ISE, the PERIOD.
//
// <dir>/pending: the commit of a comparison left partial, which the next run of .github/workflows/quality.yml resumes
// (on that commit, its Silinx builds in the cache) rather than starting main's latest from nothing.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// (a new version: every entry built again)
export const CACHE_VERSION = 1;
const sha = x => crypto.createHash('sha256').update(x).digest('hex');

/** The hash of a folder's files (their paths and contents), `build` folders and size.json left out (a project's outputs). */
export function hashTree(dir) {
  const files = [];
  const walk = rel => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (e.name !== 'build') walk(r); } else if (e.isFile() && r !== 'size.json') files.push(r);
    }
  };
  walk('');
  const h = crypto.createHash('sha256');
  for (const f of files.sort()) h.update(`${f}\0`).update(fs.readFileSync(path.join(dir, f))).update('\0');
  return h.digest('hex');
}

/** The hash of files' contents (the comparison's code in an ISE build's key). */
export const hashFiles = files => sha(files.map(f => `${path.basename(f)}\0${fs.readFileSync(f, 'utf8')}`).join('\0'));

/** A build's key: what decides its result ({ side, design, project, goal, … }), in a stable order. */
export function cacheKey(parts) {
  const sorted = Object.fromEntries(Object.keys(parts).sort().map(k => [k, parts[k]]));
  return sha(JSON.stringify({ v: CACHE_VERSION, ...sorted }));
}

/** The result kept under a key, or null. */
export function cacheGet(dir, key) {
  try {
    const e = JSON.parse(fs.readFileSync(path.join(dir, `${key}.json`), 'utf8'));
    return e.key === key && e.result && typeof e.result === 'object' ? e.result : null;
  } catch { return null; }
}

/** Keep a build's result (written whole: a run killed while writing leaves no half entry). */
export function cachePut(dir, key, parts, result) {
  fs.mkdirSync(dir, { recursive: true });
  const f = path.join(dir, `${key}.json`), tmp = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify({ key, parts, savedAt: new Date().toISOString(), result })}\n`);
  fs.renameSync(tmp, f);
}

/** Remove the entries not used for `days` days (a Silinx build's key changes with every commit): their number. */
export function cachePrune(dir, days, now = Date.now()) {
  let n = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const f of fs.readdirSync(dir)) {
    if (!/^[0-9a-f]{64}\.json$/.test(f)) continue;
    const p = path.join(dir, f);
    if (now - fs.statSync(p).mtimeMs > days * 86400e3) { fs.rmSync(p, { force: true }); n++; }
  }
  return n;
}

/** Mark a cache entry as used now (cachePrune keeps it). */
export function cacheTouch(dir, key) {
  const t = new Date();
  try { fs.utimesSync(path.join(dir, `${key}.json`), t, t); } catch { /* gone */ }
}

/** The builds in the order they run: design after design, each at every goal by Silinx, then by ISE (a run stopped
 *  part-way leaves whole designs). [{ name, goal, side }] */
export const buildOrder = (names, goals) => names.flatMap(name => ['silinx', 'ise'].flatMap(side => goals.map(goal => ({ name, goal, side }))));

/** Whether a build may still start: before the deadline (seconds since the epoch; none: always). */
export const mayStart = (deadline, now = Date.now()) => !deadline || now < deadline * 1000;

/**
 * Make the builds (buildOrder's), each taken from the cache when kept there, else made by build(b) while mayStart(deadline),
 * else left missing; a result is kept as soon as it is made, but a failed one (the tools' error or the machine's: ISE
 * not available, a time limit), made again by the next run, and one whose timing could not be checked (`unchecked`). concurrency(side): how many builds of a side at once; serial: one build at a time of either side.
 * Returns { results (by build, undefined for a missing one), account: { measured, cached, timedOut, missing } }.
 */
export async function runBuilds({ builds, cache = null, keyParts, build, deadline = 0, serial = true, concurrency = () => 1, log = () => {}, now = Date.now }) {
  const account = { measured: [], cached: [], timedOut: [], missing: [] };
  const results = new Array(builds.length);
  async function one(b) {
    const parts = keyParts(b), key = cache && cacheKey(parts);
    const hit = cache && cacheGet(cache, key);
    if (hit) { cacheTouch(cache, key); account.cached.push(b); log(b, hit, true); return hit; }
    if (!mayStart(deadline, now())) { account.missing.push(b); return undefined; }
    const r = await build(b);
    (r.timedOut ? account.timedOut : account.measured).push(b);
    if (cache && !r.error && !r.unchecked) cachePut(cache, key, parts, r);
    log(b, r, false);
    return r;
  }
  const pool = async (list, n) => {
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
      while (next < list.length) { const b = list[next++]; results[builds.indexOf(b)] = await one(b); }
    }));
  };
  if (serial) await pool(builds, 1);
  else await Promise.all(['silinx', 'ise'].map(side => pool(builds.filter(b => b.side === side), concurrency(side))));
  // (the account in the builds' order, whatever order they finished in)
  for (const k of Object.keys(account)) account[k].sort((a, b) => builds.indexOf(a) - builds.indexOf(b));
  return { results, account };
}

/** <dir>/pending: the commit of a partial comparison (missing builds), removed once a comparison is whole. */
export function markPending(dir, commit, missing) {
  const f = path.join(dir, 'pending');
  if (missing) { fs.mkdirSync(dir, { recursive: true }); if (!fs.existsSync(f) || fs.readFileSync(f, 'utf8').trim() !== commit) fs.writeFileSync(f, `${commit}\n`); }
  else fs.rmSync(f, { force: true });
}

const SIDE = { silinx: 'Silinx', ise: 'ISE' };
const GOAL = { area: 'Area', speed: 'Speed', fast: 'Fast' };
/** A list of builds, by design: 'b01 (Silinx at Area, Speed; ISE at Area)'. */
export function buildsText(builds) {
  const by = new Map();
  for (const b of builds) {
    const d = by.get(b.name) || new Map();
    d.set(b.side, [...(d.get(b.side) || []), GOAL[b.goal] || b.goal]);
    by.set(b.name, d);
  }
  return [...by].map(([n, d]) => `${n} (${[...d].map(([s, gs]) => `${SIDE[s]} at ${gs.join(', ')}`).join('; ')})`).join(', ');
}

/** The run's account: how many builds were measured, taken from the cache, timed out, left for the next run, and which. */
export function runSummary({ measured, cached, timedOut, missing }) {
  const L = [`builds: ${measured.length} measured, ${cached.length} from the cache, ${timedOut.length} timed out, ${missing.length} left for the next run`];
  if (measured.length) L.push(`measured: ${buildsText(measured)}`);
  if (cached.length) L.push(`from the cache: ${buildsText(cached)}`);
  if (timedOut.length) L.push(`timed out: ${buildsText(timedOut)}`);
  if (missing.length) L.push(`left for the next run: ${buildsText(missing)}`);
  return L;
}

// The projects of a comparison (run.mjs --sizes <dir> --resume, #3342): each design marked in <dir>/.done/<name> as soon as
// it is processed (its project written, or none: a design Silinx cannot build), so that a run stopped part-way through the
// projects leaves the ones it made, and the next run makes only the others.
const doneDir = dir => path.join(dir, '.done');
/** The designs already processed in a projects folder (not .all, the workflow's mark of the whole step). */
export const doneDesigns = dir => new Set(fs.existsSync(doneDir(dir)) ? fs.readdirSync(doneDir(dir)).filter(n => !n.startsWith('.')) : []);
/** Mark a design processed. */
export function markDesignDone(dir, name) {
  fs.mkdirSync(doneDir(dir), { recursive: true });
  fs.writeFileSync(path.join(doneDir(dir), name), '');
}
