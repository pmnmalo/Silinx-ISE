#!/usr/bin/env node
// The unit tests in parts of about the same time (#573), for CI's unit jobs run at once. node --test's own
// --test-shard splits the files by their order, so one part took twice the others (24 min against 12 and 10).
// Here each file weighs its time measured in CI (test/timings.json, seconds; a file not in it, a new one,
// weighs the median), and the files go, the longest first, each into the part with the least time so far.
//
//   node scripts/test-shard.mjs <i>/<n> [node --test options …]
//   → runs node --test with those options on the files of part i of n (test/*.test.js); --dry-run prints
//     the parts and their estimated times instead
//
// The timings are refreshed from a run of CI on main (its unit jobs on Linux upload their measurements,
// scripts/test-times-reporter.mjs): node scripts/update-test-timings.mjs <run id>.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TIMINGS = 'test/timings.json';

/** The unit test files, relative to the root with '/', sorted. */
export function testFiles(root = ROOT) {
  return fs.readdirSync(path.join(root, 'test')).filter(f => f.endsWith('.test.js')).sort().map(f => `test/${f}`);
}

/** The weight of each file: its time, or the median of the known ones (1 when none is known). */
export function weights(files, timings = {}) {
  const known = files.map(f => timings[f]).filter(t => typeof t === 'number' && t >= 0).sort((a, b) => a - b);
  const median = known.length ? known[Math.floor((known.length - 1) / 2)] : 1;
  return Object.fromEntries(files.map(f => [f, typeof timings[f] === 'number' && timings[f] >= 0 ? timings[f] : median]));
}

/** n parts of about the same weight: the heaviest file first, into the lightest part (the first on a tie). */
export function balance(files, weight, n) {
  if (!Number.isInteger(n) || n < 1) throw new Error(`the number of parts must be a whole number from 1: ${n}`);
  const parts = Array.from({ length: n }, () => ({ files: [], time: 0 }));
  const order = [...files].sort((a, b) => weight[b] - weight[a] || (a < b ? -1 : a > b ? 1 : 0));
  for (const f of order) {
    let best = parts[0];
    for (const p of parts) if (p.time < best.time) best = p;
    best.files.push(f);
    best.time += weight[f];
  }
  for (const p of parts) p.files.sort();
  return parts;
}

/** { i, n } from 'i/n' (1 ≤ i ≤ n), or an error. */
export function parseShard(arg) {
  const m = /^(\d+)\/(\d+)$/.exec(arg ?? '');
  const i = m && Number(m[1]), n = m && Number(m[2]);
  if (!m || n < 1 || i < 1 || i > n) throw new Error(`the part as i/n, 1 ≤ i ≤ n: ${arg ?? '(none)'}`);
  return { i, n };
}

export function readTimings(root = ROOT) {
  try { return JSON.parse(fs.readFileSync(path.join(root, TIMINGS), 'utf8')); } catch { return {}; }
}

function main() {
  const [arg, ...rest] = process.argv.slice(2);
  let shard;
  try { shard = parseShard(arg); } catch (e) { console.error(e.message); process.exit(2); }
  const dry = rest.includes('--dry-run');
  const files = testFiles();
  const w = weights(files, readTimings());
  const parts = balance(files, w, shard.n);
  if (dry) {
    parts.forEach((p, k) => console.log(`${k + 1}/${shard.n}: ${p.files.length} files, ~${Math.round(p.time / 60)} min`));
    return;
  }
  const part = parts[shard.i - 1];
  console.log(`unit tests, part ${shard.i}/${shard.n}: ${part.files.length} of ${files.length} files, ~${Math.round(part.time / 60)} min measured`);
  if (!part.files.length) return;
  const r = spawnSync(process.execPath, ['--test', ...rest, ...part.files], { cwd: ROOT, stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
