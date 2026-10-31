#!/usr/bin/env node
// The test files of the modules a pull request changes (#637), run on GitHub before the merge: CI runs at a
// release only (#607), and a change merged after a single test of its module, run by name, broke the
// module's other tests (#635). For each file the change touches, every unit test file (test/*.test.js, and the
// toolchain package's, packages/silinx-fpga/test/*.test.js, #1680) that imports it, directly or through one of the
// tests' helper modules (the .js and .mjs of those folders, at any depth but test/ui/, that are not tests), and through a module that only
// re-exports it (the toolchain package's entries, #1677, #1678); a changed test file itself; <name>.test.js of
// those folders for a changed <name>.js; a test that names a changed
// file in quotes, by its path or its name (one that reads it: docs.test.js CLAUDE.md, ci-workflow.test.js the
// workflows); test/code-size.test.js for a changed source of core/, web/js/, server/ or scripts/ (it measures them
// all, #405); test/toolchain-boundary.test.js and test/layering.test.js for a changed source of the IDE or the
// package (they read every source's imports, #2356). The UI tests (test/ui/) run when they changed, or when the page script of their name did
// (web/js/<name>.js), or when they name a changed file. A changed data file (any file not JavaScript: the bit
// database's JSON, a device description, an example, a fixture, #772) counts as a change of every source that
// reads it, found from the code (a file or folder named from the source's own place: path.join(path.dirname(
// fileURLToPath(import.meta.url)), '..', 'db'), a constant holding one, new URL('../db/', import.meta.url)), and
// of the modules that import one of those, at any depth.
//
//   node scripts/related-tests.mjs <base> <head> [--shard i/n] [--list] [node --test options …]
//   → runs node --test with those options on the unit tests, then (one at a time) on the UI tests; --list
//     prints them instead. --shard i/n: part i of n of them, of about the same time (scripts/test-shard.mjs,
//     the UI tests balanced too, #1032). No test related to the change: nothing runs, the exit is 0.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { weights, balance, parseShard, readTimings, UNIT_DIRS, UNIT_TESTS } from './test-shard.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The relative module paths a source imports (static imports and exports, import() of a literal). */
export function imports(text) {
  const out = new Set();
  for (const m of text.matchAll(/(?:^|[;\s])(?:import|export)\s[^'";]*?from\s*['"](\.{1,2}\/[^'"]+)['"]/g)) out.add(m[1]);
  for (const m of text.matchAll(/(?:^|[;\s])import\s*['"](\.{1,2}\/[^'"]+)['"]/g)) out.add(m[1]);
  for (const m of text.matchAll(/\bimport\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)/g)) out.add(m[1]);
  return [...out];
}

/** The folders of the repository's JavaScript (sources()). */
const SOURCE_DIRS = ['core', 'packages', 'server', 'web', 'scripts', 'test', 'bin', 'research'];
// a source's own folder; path.join / path.resolve of it (or of a constant) and literal parts; new URL(…, import.meta.url)
const HERE = String.raw`(?:path\.)?dirname\(\s*(?:fileURLToPath\(\s*import\.meta\.url\s*\)|new URL\(\s*import\.meta\.url\s*\)\.pathname)\s*\)`;
const LIT = String.raw`'[^'\n]*'|"[^"\n]*"`;
const JOIN = String.raw`\b(?:path\.)?(?:join|resolve)\(\s*(${HERE}|[A-Za-z_$][\w$]*)((?:\s*,\s*(?:${LIT}))*)`;
const URL_OF = String.raw`\bnew URL\(\s*(?:'([^'\n]*)'|"([^"\n]*)"|\x60([^\x60$\n]*)(\$\{)?[^\x60\n]*\x60)\s*,\s*import\.meta\.url\s*\)`;

/** The repository paths (files or folders, from the root) a source names as data it reads, from its own place:
 *  path.join / path.resolve of its folder, or of a constant holding a path, with literal parts; new URL of a literal
 *  and import.meta.url (of a template: its folder before the first ${…}). The root, a folder of the sources as a
 *  whole (web/, which a server serves) and a path out of the repository are no data. */
export function dataPaths(file, text) {
  const dir = path.posix.dirname(file);
  const named = new Map(), out = new Set();
  const at = (from, ...parts) => path.posix.normalize(path.posix.join(from, ...parts)).replace(/\/$/, '');
  const evaluate = m => {   // the path of a match of JOIN or URL_OF; null for a constant not known
    if (m[0].startsWith('new')) return at(dir, m[1] ?? m[2] ?? (m[4] ? m[3].replace(/[^/]*$/, '') : m[3]));
    const from = new RegExp(`^(?:${HERE})$`).test(m[1]) ? dir : named.get(m[1]);
    return from == null ? null : at(from, ...[...m[2].matchAll(new RegExp(LIT, 'g'))].map(l => l[0].slice(1, -1)));
  };
  const sticky = (re, i) => Object.assign(new RegExp(re, 'y'), { lastIndex: i });
  // the constants that hold a path, in order (const ROOT = path.join(HERE, '..'); const DB = path.join(ROOT, 'db'))
  for (const d of text.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:fileURLToPath\(\s*)?/g)) {
    const i = d.index + d[0].length;
    const m = sticky(JOIN, i).exec(text) ?? sticky(URL_OF, i).exec(text);
    const v = m ? evaluate(m) : sticky(HERE, i).test(text) ? dir : null;
    if (v != null) named.set(d[1], v);
  }
  for (const re of [JOIN, URL_OF]) for (const m of text.matchAll(new RegExp(re, 'g'))) {
    const p = evaluate(m);
    if (p != null && p !== '.' && !p.startsWith('../') && !SOURCE_DIRS.includes(p)) out.add(p);
  }
  return [...out];
}

/** Does a module only re-export others (export … from, comments)? */
export function reexportsOnly(text) {
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').trim();
  return code !== '' && code.split(/;\s*/).filter(Boolean).every(s => /^export\s+(\*|\{[^}]*\})\s+from\s+['"][^'"]+['"]$/.test(s.trim()));
}

/** files: { 'test/a.test.js': text, … } (paths relative to the root, with '/'); changed: the paths changed. */
/** A page script's absolute imports (static): '/core/schdoc.js', '/js/ui.js'. */
export function pageImports(text) {
  return [...new Set([...String(text).matchAll(/(?:^|[;\s])(?:import|export)\s[^'";]*?from\s*['"](\/(?:core|js|packages)\/[^'"]+)['"]/g)].map(m => m[1]))];
}

/** The modules a module's text re-exports names of (export { … } from '…', export * from '…'), as written. */
export function reexported(text) {
  return [...String(text).matchAll(/^\s*export\s+(?:\*(?:\s+as\s+\w+)?|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/gm)].map(m => m[1]);
}

export function relatedTests(files, changed) {
  // (a page script's absolute import, as the server serves it: /core/… the repository's core/, /js/… web/js/, #2093)
  const resolve = (from, spec) => (spec.startsWith('/') ? (spec.startsWith('/js/') ? `web${spec}` : spec.slice(1))
    : path.posix.normalize(path.posix.join(path.posix.dirname(from), spec)));
  // (a page script's absolute imports too, /core/… and /js/…, as the browser loads them, #2093)
  const deps = Object.fromEntries(Object.entries(files).map(([f, t]) => [f, [...imports(t), ...(f.startsWith('web/js/') ? pageImports(t) : [])].map(s => resolve(f, s))]));
  const isUnit = f => UNIT_TESTS.test(f);
  const isUi = f => /^test\/ui\/[^/]+\.test\.js$/.test(f);
  // (a helper at any depth of the tests' folders but the UI tests': test/schematic-corpus/lib.mjs, #2058)
  const isHelper = f => /^(?:test|packages\/silinx-fpga\/test)\/.+\.m?js$/.test(f) && !f.startsWith('test/ui/') && !isUnit(f);
  const inTests = f => f.startsWith('test/') || f.startsWith('packages/silinx-fpga/test/');
  // a changed data file (#772): the sources that read it count as changed, and the modules that import one of them,
  // at any depth (what a module reads reaches its importers: the bit database, through bitdb-node.js, the open flow)
  const data = changed.filter(f => !/\.m?js$/.test(f));
  const reads = f => dataPaths(f, files[f]).some(p => data.some(d => d === p || d.startsWith(`${p}/`)));
  const readers = new Set(data.length ? Object.keys(files).filter(reads) : []);
  for (let grew = readers.size > 0; grew;) {
    grew = false;
    for (const f of Object.keys(files)) if (!inTests(f) && !readers.has(f) && deps[f].some(d => readers.has(d))) { readers.add(f); grew = true; }
  }
  const ch = new Set([...changed, ...readers]);
  // a module that only re-exports a changed one (the toolchain package's entries, #1677, #1678), or that re-exports
  // names of it (a module split, its old module exporting what moved: core/schdoc.js of core/schdoc-symbols.js, #2093)
  // counts as changed
  const again = Object.fromEntries(Object.entries(files).map(([f, t]) => [f, reexported(t).map(s => resolve(f, s))]));
  for (let grew = true; grew;) {
    grew = false;
    for (const f of Object.keys(files)) if (!ch.has(f) && ((reexportsOnly(files[f]) && deps[f].some(d => ch.has(d))) || again[f].some(d => ch.has(d)))) { ch.add(f); grew = true; }
  }
  // a helper of the tests that imports a changed file (or changed itself) counts as changed for its tests
  const touched = new Set(ch);
  for (const f of Object.keys(files)) if (isHelper(f) && deps[f].some(d => ch.has(d))) touched.add(f);
  const unit = new Set(), ui = new Set();
  for (const f of Object.keys(files)) {
    if (isUnit(f) && (ch.has(f) || deps[f].some(d => touched.has(d)))) unit.add(f);
    // (a UI test that imports a changed module, as its sheet's newDoc of core/schdoc.js, #2093)
    if (isUi(f) && (ch.has(f) || deps[f].some(d => ch.has(d) && !inTests(d)))) ui.add(f);
  }
  // a test that names a changed file it reads ('CLAUDE.md', '.github/workflows/ci.yml', 'ci.yml')
  const quoted = n => new RegExp(`['"\`/]${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`);
  for (const f of changed) {
    const names = [quoted(f), quoted(path.posix.basename(f))];
    for (const [t, text] of Object.entries(files))
      if ((isUnit(t) || isUi(t)) && t !== f && names.some(r => r.test(text))) (isUnit(t) ? unit : ui).add(t);
  }
  // the size of every source (#405): a source changed may have grown past the limit
  if (files['test/code-size.test.js'] != null && changed.some(f => /^(core|packages\/silinx-fpga\/src|web\/js|server|scripts)\/.+\.m?js$/.test(f))) unit.add('test/code-size.test.js');
  // the imports of every source (#1678, #407): a source changed may import across the package's API or the research
  if (changed.some(f => /^(core|server|web|scripts|bin|packages\/silinx-fpga\/src)\/.+\.m?js$/.test(f)))
    for (const t of ['test/toolchain-boundary.test.js', 'test/layering.test.js']) if (files[t] != null) unit.add(t);
  for (const f of ch) {
    if (!/\.m?js$/.test(f) || inTests(f)) continue;
    const name = path.posix.basename(f).replace(/\.m?js$/, '');
    for (const dir of UNIT_DIRS) if (files[`${dir}/${name}.test.js`] != null) unit.add(`${dir}/${name}.test.js`);
    if (f.startsWith('web/js/') && files[`test/ui/${name}.test.js`] != null) ui.add(`test/ui/${name}.test.js`);
  }
  // the UI test of a page script that imports a changed module (web/js/sch-props.js of core/schdoc.js: a symbol's new
  // parameter in its properties, #2093)
  for (const f of Object.keys(files)) {
    if (!/^web\/js\/[^/]+\.m?js$/.test(f) || !deps[f].some(d => ch.has(d))) continue;
    const t = `test/ui/${path.posix.basename(f).replace(/\.m?js$/, '')}.test.js`;
    if (files[t] != null) ui.add(t);
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
  for (const d of SOURCE_DIRS) if (fs.existsSync(path.join(root, d))) walk(d);
  return out;
}

/** The files changed from the merge base of base and head to head; null when base is unknown. */
function changedFiles(base, head, cwd = ROOT) {
  try { return execFileSync('git', ['diff', '--name-only', `${base}...${head}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean); }
  catch { return null; }
}

/** Part i of n of the tests: the unit tests and the UI tests each balanced by their measured times, the
 *  heaviest part of the UI tests with the lightest of the unit tests (all of them in part 1 passed its time, #1032). */
export function shardOf({ unit, ui }, { i, n }, timings = {}) {
  const parts = balance(unit, weights(unit, timings), n);
  const uiParts = balance(ui, weights(ui, timings), n).sort((a, b) => b.time - a.time);
  const byUnit = parts.map((p, k) => k).sort((a, b) => parts[a].time - parts[b].time || a - b);
  return { unit: parts[i - 1].files, ui: uiParts[byUnit.indexOf(i - 1)].files };
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
