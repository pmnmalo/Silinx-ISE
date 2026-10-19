#!/usr/bin/env node
// test/timings.json from a run of CI (#573): each unit job on Linux uploads how long its files took
// (artifact unit-times-<part>, scripts/test-times-reporter.mjs); this merges them, the files that no longer
// exist left out, and writes the timings that scripts/test-shard.mjs balances the parts by.
//
//   node scripts/update-test-timings.mjs <run id>     (gh, logged in; or --from <folder> of the artifacts)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { TIMINGS, testFiles } from './test-shard.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The timings of the existing files from the parts' JSON objects, sorted by file. */
export function merge(parts, files) {
  const all = {};
  for (const p of parts) for (const [f, t] of Object.entries(p)) if (typeof t === 'number') all[f] = t;
  return Object.fromEntries(files.filter(f => f in all).map(f => [f, all[f]]));
}

/** Every test-times.json under a folder (the downloaded artifacts). */
export function readParts(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true, recursive: true }))
    if (e.isFile() && e.name === 'test-times.json') out.push(JSON.parse(fs.readFileSync(path.join(e.parentPath ?? e.path, e.name), 'utf8')));
  return out;
}

function main() {
  const args = process.argv.slice(2);
  let dir;
  if (args[0] === '--from') dir = args[1];
  else if (/^\d+$/.test(args[0] ?? '')) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-test-times-'));
    execFileSync('gh', ['run', 'download', args[0], '--pattern', 'unit-times-*', '--dir', dir], { cwd: ROOT, stdio: 'inherit' });
  } else { console.error('usage: node scripts/update-test-timings.mjs <run id> | --from <folder>'); process.exit(2); }
  const parts = readParts(dir);
  if (!parts.length) { console.error(`no test-times.json in ${dir}`); process.exit(1); }
  const files = testFiles(ROOT);
  const t = merge(parts, files);
  fs.writeFileSync(path.join(ROOT, TIMINGS), `${JSON.stringify(t, null, 2)}\n`);
  const missing = files.filter(f => !(f in t));
  console.log(`${TIMINGS}: ${Object.keys(t).length} files, ${Math.round(Object.values(t).reduce((a, b) => a + b, 0) / 60)} min in all${missing.length ? `; not measured: ${missing.join(', ')}` : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
