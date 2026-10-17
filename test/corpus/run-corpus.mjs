#!/usr/bin/env node
// Corpus test: Yosys's own test designs (YosysHQ/yosys tests/simple, asicworld, hana, various; ISC
// licence; fetched by scripts/fetch-yosys-tests.mjs at a pinned commit, never committed) through
// Silinx's front end and simulator, compared with Yosys's netlists (test/diff-synth.js).
//
//   node test/corpus/run-corpus.mjs [--update] [--filter text] [--shard k/n] [--jobs n] [--cycles n] [--timeout s] [--json file]
//   (npm run test:corpus)
//
// --json file writes the run against the expectations ({ tag, results, regress, fixed, fresh, timedOut,
// newWarnings, goneWarnings }), for the comparison of a Yosys update (#352, scripts/yosys-update-report.mjs).
//
// --shard k/n runs the k-th of n parts of the files (every n-th file, the nightly's jobs in parallel, #343);
// --timeout s is the time a file may take (1500 s): a file that takes longer fails the run (its modules have
// no result, #343), unless expected.json has the file itself failing as a whole ('error: …', hana/hana_vlib.v);
// the slowest files and their times are printed.
//
// Every Verilog file is parsed and elaborated by Silinx; each of its top modules (the modules no
// other module of the file instantiates) is then simulated with seeded random stimulus and compared
// cycle by cycle with two netlists:
//   "<dir>/<file>:<top>"          Yosys reads the original file (its own front end): checks Silinx's
//                                 parser, elaborator and simulator against Yosys's reading
//   "<dir>/<file>:<top> (synth)"  Silinx's open synthesis (core/synth-verilog.js, then Yosys)
// A result is 'pass', 'unsupported: <stage>: <reason>' (Silinx cannot read / elaborate / translate
// it, or there is nothing to compare: no outputs, inout ports), 'mismatch: <reason>' or
// 'error: <stage>: <reason>' (Yosys fails on the file, the run times out…).
//
// test/corpus/expected.json holds the expected result of every key. The run fails only on a
// regression: a key expected to 'pass' that does not. Keys that pass now and did not before are
// listed (newly passing); --update rewrites expected.json with the results of this run.
//
// test/corpus/warnings.json holds the warnings (and notes) Silinx gives for each file and top module
// ("<dir>/<file>": the parser's, "<dir>/<file>:<top>": the elaborator's), as "line: message". A
// warning that is new fails the run (a construct read with a spurious warning, or a new check to
// review); one that vanished is listed. --update records them too.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED = path.join(HERE, 'expected.json');
const WARNINGS = path.join(HERE, 'warnings.json');
const TIMEOUT = 1500;   // s, per file (hana/test_intermout.v: 33 modules, two netlists each; 650 s with Yosys 0.68, 841-900+ with 0.70, #378)

/** The files of shard 'k/n' (1 <= k <= n): every n-th, from the k-th; all of them without a shard. */
export function shardOf(files, spec) {
  if (!spec) return files;
  const m = /^(\d+)\/(\d+)$/.exec(spec);
  const k = m ? +m[1] : 0, n = m ? +m[2] : 0;
  if (!(n >= 1 && k >= 1 && k <= n)) throw new Error(`--shard ${spec}: k/n with 1 <= k <= n`);
  return files.filter((_, i) => i % n === k - 1);
}

/**
 * The results against the expectations: { regress, fixed, fresh, timedOut }. A key expected to pass that
 * does not, or has no result while its file ran (the file failed as a whole: a crash; results gets its
 * 'missing (…)'), is a regression; a file that timed out is one too, even when none of its keys was
 * expected to pass (a design that hangs or got too slow is never skipped in silence, #343), unless the file
 * itself is expected to fail as a whole (an 'error: …' of its own: hana/hana_vlib.v, out of memory or out of
 * time, the cell library Yosys fails on module after module).
 */
export function compareResults(expected, results, ran) {
  const regress = [], fixed = [], fresh = [];
  const keys = Object.keys(results).sort();
  for (const k of keys) {
    const e = expected[k];
    if (e === undefined) fresh.push(k);
    else if (e === 'pass' && results[k] !== 'pass') regress.push(k);
    else if (e !== 'pass' && results[k] === 'pass') fixed.push(k);
  }
  for (const [k, e] of Object.entries(expected)) {
    const f = k.split(':')[0];
    if (e === 'pass' && ran.has(f) && !(k in results)) { regress.push(k); results[k] = `missing (${results[f] || 'no result'})`; }
  }
  const timedOut = [...ran].filter(f => /^error: timeout\b/.test(results[f] || '')).sort();
  for (const f of timedOut) if (!regress.includes(f) && !/^error: /.test(expected[f] || '')) regress.push(f);
  return { regress, fixed, fresh, timedOut };
}

/**
 * A run against the expectations as --json writes it: { tag, results (every key's), expected (the expected
 * result of each regression and newly passing key), regress, fixed, fresh, timedOut, newWarnings, goneWarnings }
 * (the warnings' lines without their indent).
 */
export function runSummary({ tag, results, expected, regress, fixed, fresh, timedOut, newWarnings, goneWarnings }) {
  return { tag, results: Object.fromEntries(Object.keys(results).sort().map(k => [k, results[k]])), expected: Object.fromEntries([...regress, ...fixed].map(k => [k, expected[k] ?? null])),
    regress, fixed, fresh, timedOut, newWarnings: newWarnings.map(w => w.trim()), goneWarnings: goneWarnings.map(w => w.trim()) };
}

/** One line of a reason: no newlines, no absolute paths, bounded. */
const clean = s => String(s).replace(/\s+/g, ' ').replace(/(src\d+_)/g, '').slice(0, 160);

/** Results of one file: { key: status }. */
async function runFile(dir, rel, cycles) {
  const { compile, topCandidates } = await import('../../core/compile.js');
  const { elaborate } = await import('../../core/elaborate.js');
  const { diffSynth } = await import('../diff-synth.js');
  const text = fs.readFileSync(path.join(dir, rel), 'utf8');
  const src = { path: path.basename(rel), lang: 'verilog', text };
  const out = {};
  let lib;
  try { lib = compile([src]); }
  catch (e) { out[rel] = `unsupported: parse: ${clean(e.message)}`; return out; }
  const perr = lib.errors.filter(d => d.severity === 'error');
  if (perr.length) { out[rel] = `unsupported: parse: line ${perr[0].line}: ${clean(perr[0].message)}`; return out; }
  const tops = topCandidates(lib);
  if (!tops.length) { out[rel] = 'unsupported: parse: no module'; return out; }
  // the warnings: of the parser (the file), of the elaboration (each top module)
  const warns = list => [...new Set(list.filter(d => d.severity !== 'error').map(d => `${d.line}: ${clean(d.message)}`))].sort();
  out[`${rel}#warnings`] = warns(lib.errors);
  for (const top of tops) {
    try { out[`${rel}:${top}#warnings`] = warns(elaborate(lib, top).diags); } catch (e) { out[`${rel}:${top}#warnings`] = [`elaboration failed: ${clean(e.message)}`]; }
    for (const from of ['source', 'silinx']) {
      const key = `${rel}:${top}${from === 'silinx' ? ' (synth)' : ''}`;
      let r;
      try { r = await diffSynth({ name: key, sources: [src], top, from, seed: key, sim: { cycles } }); }
      catch (e) { r = { status: 'error', stage: 'harness', reason: e.message }; }
      out[key] = r.status === 'pass' ? 'pass' : r.status === 'mismatch' ? `mismatch: ${clean(r.reason)}` : `${r.status}: ${r.stage}: ${clean(r.reason)}`;
      if (r.report) out[`${key}#report`] = r.report;
      // nothing more to learn from the second netlist when Silinx cannot elaborate the module
      if (r.stage === 'parse' || r.stage === 'elaborate') break;
    }
  }
  return out;
}

if (!isMainThread) {
  const { dir, cycles } = workerData;
  parentPort.on('message', async rel => {
    let res;
    try { res = await runFile(dir, rel, cycles); }
    catch (e) { res = { [rel]: `error: harness: ${clean(e.message)}` }; }
    parentPort.postMessage({ rel, res });
  });
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  const update = args.includes('--update');
  const filter = opt('--filter', '');
  const jobs = Math.max(1, +opt('--jobs', Math.max(1, Math.min(8, os.availableParallelism?.() ?? os.cpus().length) - 1)));
  const cycles = +opt('--cycles', 100);
  const shard = opt('--shard', '');
  const timeout = +opt('--timeout', TIMEOUT);
  const jsonOut = opt('--json', null);
  const { fetchYosysTests, YOSYS_TEST_DIRS, YOSYS_TESTS_PIN } = await import(pathToFileURL(path.join(HERE, '..', '..', 'scripts', 'fetch-yosys-tests.mjs')).href);
  const dir = await fetchYosysTests();
  const files = [];
  for (const d of YOSYS_TEST_DIRS) {
    const abs = path.join(dir, d);
    if (!fs.existsSync(abs)) continue;
    for (const f of fs.readdirSync(abs).sort()) if (/\.s?v$/.test(f)) files.push(`${d.replace(/^tests\//, '')}/${f}`);
  }
  const todo = shardOf(files.filter(f => f.includes(filter)), shard);
  const partial = !!(filter || shard);
  const testsDir = path.join(dir, 'tests');
  const results = {}, reports = {}, warnings = {}, times = {};
  const t0 = Date.now();
  let next = 0, doneN = 0;
  await new Promise(resolve => {
    let live = 0;
    const spawn = () => {
      if (next >= todo.length) { if (!live) resolve(); return; }
      live++;
      const w = new Worker(fileURLToPath(import.meta.url), { workerData: { dir: testsDir, cycles } });
      let cur = null, timer = null, since = 0;
      const give = () => {
        if (next >= todo.length) { w.terminate(); return; }
        cur = todo[next++];
        since = Date.now();
        timer = setTimeout(() => {
          results[cur] = `error: timeout (over ${timeout} s)`;
          times[cur] = Date.now() - since;
          doneN++;
          process.stderr.write(`\r${doneN}/${todo.length} ${cur}: timed out (over ${timeout} s)\n`);
          cur = null;
          w.terminate();
        }, timeout * 1000);
        w.postMessage(cur);
      };
      w.on('message', ({ rel, res }) => {
        clearTimeout(timer);
        times[rel] = Date.now() - since;
        for (const [k, v] of Object.entries(res)) (k.endsWith('#report') ? reports : k.endsWith('#warnings') ? warnings : results)[k.replace(/#(report|warnings)$/, '')] = v;
        doneN++;
        process.stderr.write(`\r${doneN}/${todo.length} ${rel.padEnd(60).slice(0, 60)}`);
        cur = null;
        give();
      });
      w.on('error', e => { clearTimeout(timer); if (cur) { results[cur] = `error: harness: ${clean(e.message)}`; doneN++; } });
      w.on('exit', () => { clearTimeout(timer); live--; if (cur) { results[cur] = results[cur] || 'error: worker exited'; doneN++; } spawn(); });
      give();
    };
    for (let i = 0; i < Math.min(jobs, todo.length); i++) spawn();
    if (!todo.length) resolve();
  });
  process.stderr.write('\n');

  // summary
  const keys = Object.keys(results).sort();
  const kind = v => v.split(':')[0];
  const count = (pred) => keys.filter(pred).length;
  const src = keys.filter(k => !k.endsWith(' (synth)')), syn = keys.filter(k => k.endsWith(' (synth)'));
  const fileOf = k => k.split(':')[0];
  const fileSet = new Set(keys.map(fileOf));
  const parsed = [...fileSet].filter(f => !(results[f] || '').startsWith('unsupported: parse'));
  const elaborated = src.filter(k => k.includes(':') && !/^unsupported: (parse|elaborate)/.test(results[k]));
  const tally = list => ['pass', 'mismatch', 'unsupported', 'error'].map(s => `${s} ${list.filter(k => kind(results[k]) === s).length}`).join(', ');
  console.log(`Yosys ${YOSYS_TESTS_PIN.tag} tests: ${fileSet.size} files, ${parsed.length} parsed by Silinx; ${src.filter(k => k.includes(':')).length} top modules, ${elaborated.length} elaborated`);
  console.log(`  vs Yosys reading the source:  ${tally(src.filter(k => k.includes(':')))}`);
  console.log(`  vs Silinx's open synthesis:   ${tally(syn)}`);
  console.log(`  (${((Date.now() - t0) / 1000).toFixed(0)} s, ${jobs} jobs, ${cycles} cycles${shard ? `, shard ${shard}` : ''})`);
  // the slowest files: what to look at when the run gets near its job's time limit
  const slowest = Object.entries(times).sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (slowest.length) console.log(`  slowest: ${slowest.map(([f, ms]) => `${f} ${(ms / 1000).toFixed(0)} s`).join(', ')}`);
  for (const k of keys) if (kind(results[k]) === 'mismatch' && reports[k]) console.log(`\n${reports[k]}`);

  // against the expectations
  const expected = fs.existsSync(EXPECTED) ? JSON.parse(fs.readFileSync(EXPECTED, 'utf8')) : {};
  const ran = new Set(todo);
  const { regress, fixed, fresh, timedOut } = compareResults(expected, results, ran);
  if (fixed.length) console.log(`\nnewly passing (${fixed.length}; npm run test:corpus -- --update records them):\n${fixed.map(k => `  ${k}  (was: ${expected[k]})`).join('\n')}`);
  const freshBad = fresh.filter(k => results[k] !== 'pass');
  if (fresh.length && !update) console.log(`\nnot in expected.json: ${fresh.length} (${fresh.length - freshBad.length} pass)${freshBad.slice(0, 60).map(k => `\n  ${k}: ${results[k]}`).join('')}`);
  if (update) {
    const merged = partial ? { ...expected, ...Object.fromEntries(keys.map(k => [k, results[k]])) } : Object.fromEntries(keys.map(k => [k, results[k]]));
    const sorted = Object.fromEntries(Object.keys(merged).sort().map(k => [k, merged[k]]));
    fs.writeFileSync(EXPECTED, JSON.stringify(sorted, null, 1) + '\n');
    console.log(`\nwrote ${path.relative(process.cwd(), EXPECTED)} (${Object.keys(sorted).length} entries)`);
  }
  // warnings: new ones fail the run, vanished ones are listed
  const expW = fs.existsSync(WARNINGS) ? JSON.parse(fs.readFileSync(WARNINGS, 'utf8')) : {};
  const newW = [], goneW = [];
  for (const [k, ws] of Object.entries(warnings)) {
    const old = new Set(expW[k] || []), now = new Set(ws);
    for (const w of ws) if (!old.has(w)) newW.push(`  ${k}: ${w}`);
    for (const w of old) if (!now.has(w)) goneW.push(`  ${k}: ${w}`);
  }
  for (const [k, ws] of Object.entries(expW)) if (ran.has(k.split(':')[0]) && !(k in warnings)) for (const w of ws) goneW.push(`  ${k}: ${w}`);
  if (goneW.length) console.log(`\nwarnings no longer given (${goneW.length}):\n${goneW.join('\n')}`);
  if (newW.length) console.log(`\nNEW WARNINGS (${newW.length}; review them, then --update records them):\n${newW.join('\n')}`);
  if (update) {
    const mergedW = partial ? { ...Object.fromEntries(Object.entries(expW).filter(([k]) => !ran.has(k.split(':')[0]))), ...warnings } : warnings;
    const sortedW = Object.fromEntries(Object.keys(mergedW).sort().filter(k => mergedW[k].length).map(k => [k, mergedW[k]]));
    fs.writeFileSync(WARNINGS, JSON.stringify(sortedW, null, 1) + '\n');
    console.log(`wrote ${path.relative(process.cwd(), WARNINGS)} (${Object.keys(sortedW).length} entries)`);
  } else if (newW.length) process.exitCode = 1;
  if (timedOut.length) console.log(`\nTIMED OUT (${timedOut.length}; over ${timeout} s each): ${timedOut.join(', ')}`);
  if (regress.length) {
    console.log(`\nREGRESSIONS (${regress.length}): expected to pass\n${regress.map(k => `  ${k}: ${results[k]}`).join('\n')}`);
    if (!update) process.exitCode = 1;
  }
  if (jsonOut) {
    const out = runSummary({ tag: YOSYS_TESTS_PIN.tag, results, expected, regress, fixed, fresh, timedOut, newWarnings: newW, goneWarnings: goneW });
    fs.mkdirSync(path.dirname(path.resolve(jsonOut)), { recursive: true });
    fs.writeFileSync(jsonOut, `${JSON.stringify(out, null, 1)}\n`);
  }
}
