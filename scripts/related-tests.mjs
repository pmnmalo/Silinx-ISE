#!/usr/bin/env node
// The test files of the modules a pull request changes (#637), run on GitHub before the merge: CI runs at a
// release only (#607), and a change merged after a single test of its module, run by name, broke the
// module's other tests (#635). For each file the change touches, every unit test file (test/*.test.js) that
// imports it, directly or through one of the tests' helper modules (test/*.js and test/*.mjs that are not
// tests); a changed test file itself; test/<name>.test.js for a changed <name>.js; a test that names a changed
// file in quotes, by its path or its name (one that reads it: docs.test.js CLAUDE.md, ci-workflow.test.js the
// workflows). The UI tests (test/ui/) run when they changed, or when the page script of their name did
// (web/js/<name>.js), or when they name a changed file.
//
//   node scripts/related-tests.mjs <base> <head> [--shard i/n] [--list] [node --test options …]
//   → runs node --test with those options on the unit tests, then (one at a time) on the UI tests; --list
//     prints them instead. --shard i/n: part i of n of them, of about the same time (scripts/test-shard.mjs,
//     the UI tests in the first part). No test related to the change: nothing runs, the exit is 0.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { weights, balance, parseShard, readTimings } from './test-shard.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The relative module paths a source imports (static imports and exports, import() of a literal). */
export function imports(text) {
  const out = new Set();
  for (const m of text.matchAll(/(?:^|[;\s])(?:import|export)\s[^'";]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) out.add(m[1]);
  for (const m of text.matchAll(/(?:^|[;\s])import\s*['"](\.{1,2}\/[^'"]+)['"]/g)) out.add(m[1]);
  for (const m of text.matchAll(/\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) out.add(m[1]);
  return [...out];
}

/** files: { 'test/a.test.js': text, … } (paths relative to the root, with '/'); changed: the paths changed. */
export function relatedTests(files, changed) {
  const resolve = (from, spec) => path.posix.normalize(path.posix.join(path.posix.dirname(from), spec));
  const deps = Object.fromEntries(Object.entries(files).map(([f, t]) => [f, imports(t).map(s => resolve(f, s))]));
  const isUnit = f => /^test\/[^/]+\.test\.js$/.test(f);
  const isUi = f => /^test\/ui\/[^/]+\.test\.js$/.test(f);
  const isHelper = f => /^test\/[^/]+\.m?js$/.test(f) && !isUnit(f);
  const ch = new Set(changed);
  // a helper of the tests that imports a changed file (or changed itself) counts as changed for its tests
  const touched = new Set(changed);
  for (const f of Object.keys(files)) if (isHelper(f) && deps[f].some(d => ch.has(d))) touched.add(f);
  const unit = new Set(), ui = new Set();
  for (const f of Object.keys(files)) {
    if (isUnit(f) && (ch.has(f) || deps[f].some(d => touched.has(d)))) unit.add(f);
    if (isUi(f) && ch.has(f)) ui.add(f);
  }
  // a test that names a changed file it reads ('CLAUDE.md', '.github/workflows/ci.yml', 'ci.yml')
  const quoted = n => new RegExp(`['"\`/]${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
  for (const f of changed) {
    const names = [quoted(f), quoted(path.posix.basename(f))];
    for (const [t, text] of Object.entries(files))
      if ((isUnit(t) || isUi(t)) && t !== f && names.some(r => r.test(text))) (isUnit(t) ? unit : ui).add(t);
  }
  for (const f of changed) {
    if (!/\.m?js$/.test(f) || f.startsWith('test/')) continue;
    const name = path.posix.basename(f).replace(/\.m?js$/, '');
    if (files[`test/${name}.test.js`] != null) unit.add(`test/${name}.test.js`);
    if (f.startsWith('web/js/') && files[`test/ui/${name}.test.js`] != null) ui.add(`test/ui/${name}.test.js`);
  }
  return { unit: [...unit].sort(), ui: [...ui].sort() };
}

/** The repository's JavaScript the tests and their modules are made of: { path: text }. */
export function sources(root = ROOT) {
  const out = {};
  const walk = dir => {
    for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (!/^(node_modules|\.|fixtures$)/.test(e.name)) walk(p); }
      else if (/\.m?js$/.test(e.name)) out[p] = fs.readFileSync(path.join(root, p), 'utf8');
    }
  };
  for (const d of ['core', 'server', 'web', 'scripts', 'test', 'bin']) if (fs.existsSync(path.join(root, d))) walk(d);
  return out;
}

/** The files changed from the merge base of base and head to head; null when base is unknown. */
export function changedFiles(base, head, cwd = ROOT) {
  try { return execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); }
  catch { return null; }
}

/** Part i of n of the tests: the unit tests balanced by their measured times; the UI tests in part 1. */
export function shardOf({ unit, ui }, { i, n }, timings = {}) {
  const parts = balance(unit, weights(unit, timings), n);
  return { unit: parts[i - 1].files, ui: i === 1 ? ui : [] };
}

function main() {
  const [base, head, ...args] = process.argv.slice(2);
  const at = args.indexOf('--shard');
  let shard = null;
  if (at >= 0) { try { shard = parseShard(args[at + 1]); } catch (e) { console.error(e.message); process.exit(2); } args.splice(at, 2); }
  const rest = args;
  if (!base || !head) { console.error('usage: node scripts/related-tests.mjs <base> <head> [--shard i/n] [--list] [node --test options …]'); process.exit(2); }
  const changed = changedFiles(base, head);
  if (changed == null) { console.error(`the files changed from ${base} to ${head} are not known (is ${base} fetched?)`); process.exit(2); }
  const all = relatedTests(sources(), changed);
  const { unit, ui } = shard ? shardOf(all, shard, readTimings()) : all;
  console.log(`${changed.length} file(s) changed; the tests of their modules: ${all.unit.length} unit, ${all.ui.length} UI${shard ? `; part ${shard.i}/${shard.n}: ${unit.length} unit, ${ui.length} UI` : ''}`);
  for (const f of [...unit, ...ui]) console.log(`  ${f}`);
  if (rest.includes('--list')) return;
  const unitArgs = rest.filter(a => a !== '--list');
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;   // (when run from a test: its own runner, not the parent's)
  let status = 0;
  for (const [files, extra] of [[unit, unitArgs], [ui, ['--test-concurrency=1']]]) {
    if (!files.length) continue;
    const r = spawnSync(process.execPath, ['--test', ...extra, ...files], { cwd: ROOT, stdio: 'inherit', env });
    status ||= r.status ?? 1;
  }
  process.exit(status);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
