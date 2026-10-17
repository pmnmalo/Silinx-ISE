#!/usr/bin/env node
// A Yosys update reviewed, not merged on green alone (#352): .github/workflows/yosys-update.yml, on a pull
// request that changes @yowasp/yosys, measures the open synthesis with the pull request's Yosys and with
// the base branch's (the same code, only @yowasp/yosys installed over it differs), and runs Yosys's test
// designs against test/corpus/expected.json; this script tells whether the pull request changes Yosys,
// names the designs measured, and writes the table of the differences (the job summary, an artifact and a
// comment on the pull request).
//
//   node scripts/yosys-update-report.mjs versions <base package.json> <base package-lock.json> <head package.json> <head package-lock.json>
//        the versions of @yowasp/yosys (changed=true|false, base=…, head=… also to $GITHUB_OUTPUT)
//   node scripts/yosys-update-report.mjs subset
//        the design corpus's designs measured (run.mjs --filter)
//   node scripts/yosys-update-report.mjs report --base dir --head dir --corpus dir --base-version v --head-version v [--out file]
//        dir: examples/<name>.json (research/s3e-route/open-flow.mjs --quality) and designs.json
//        (test/designs-corpus/run.mjs --json); corpus: shard-<k>.json (test/corpus/run-corpus.mjs --json)
//   node scripts/yosys-update-report.mjs comment <file>
//        the table as the pull request's comment (one, updated by later runs): GITHUB_TOKEN with
//        pull-requests: write, GITHUB_REPOSITORY, PR_NUMBER. A token that may not comment (a Dependabot
//        pull request can get a read-only one) is not an error: the job summary and the artifact have it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALITY_TOLERANCE } from '../test/designs-corpus/lib.mjs';
import { EXAMPLE_ORDER } from '../core/examples.js';
import { YOSYS_TESTS_PIN } from './fetch-yosys-tests.mjs';

export const PACKAGE = '@yowasp/yosys';
// the comment's mark: a later run updates the same comment
export const MARK = '<!-- silinx:yosys-update -->';
// a representative subset of the design corpus (test/designs-corpus/manifest.json), each built through the
// whole flow in a few minutes on GitHub's runner: CPUs (Verilog and VHDL), peripherals, arithmetic, a hash,
// EPFL and VTR benchmarks, combinational and sequential
export const DESIGN_SUBSET = ['serv', 'picorv32', 'femtorv32-quark', 'light8080', 'verilog-uart', 'verilog-i2c-master', 'nandland-spi-vhdl',
  'fpu-adder', 'secworks-siphash', 'epfl-dec', 'epfl-priority', 'epfl-ctrl', 'vtr-ch-intrinsics', 'vtr-stereovision3'];
const METRICS = [['slices', 'slices'], ['luts', 'LUTs'], ['ffs', 'FFs'], ['period', 'critical path (ns)']];

/** The version of @yowasp/yosys a package.json asks for and its package-lock.json resolves: { spec, resolved }. */
export function yosysVersion(pkg, lock) {
  return { spec: pkg?.dependencies?.[PACKAGE] ?? pkg?.devDependencies?.[PACKAGE] ?? null, resolved: lock?.packages?.[`node_modules/${PACKAGE}`]?.version ?? null };
}

/** Whether a pull request changes Yosys: { changed, base, head } (the resolved versions, else the specs). */
export function yosysChange(base, head) {
  const b = base.resolved ?? base.spec, h = head.resolved ?? head.spec;
  return { changed: b !== h || base.spec !== head.spec, base: b, head: h };
}

/** 'v0.70' of a YoWASP version '0.70.1258' (the Yosys release it runs), null if it is not one. */
export function yosysTag(version) {
  const m = /^(\d+)\.(\d+)\./.exec(String(version || ''));
  return m ? `v${m[1]}.${m[2]}` : null;
}

const fmt = (m, x) => (x === null || x === undefined ? '-' : m === 'period' ? x.toFixed(3) : String(x));
const pct = x => `${x > 0 ? '+' : ''}${(100 * x).toFixed(1)}%`;

/**
 * The size and speed of each design with both Yosys versions: [{ name, cells: { metric: text }, worse: [metric],
 * better: [metric], note }]. base / head: { name: quality | null } (quality: { part, slices, luts, ffs, period },
 * null: the flow did not complete). A change beyond QUALITY_TOLERANCE (the design corpus's noise) is worse or
 * better; within it the cell shows it, unmarked.
 */
export function qualityRows(base, head, tolerance = QUALITY_TOLERANCE) {
  const rows = [];
  for (const name of [...new Set([...Object.keys(base), ...Object.keys(head)])]) {
    const b = base[name] ?? null, h = head[name] ?? null;
    const row = { name, cells: {}, worse: [], better: [], note: '' };
    if (!b || !h) {
      row.note = !b && !h ? 'no result with either Yosys' : !h ? 'no result with the new Yosys (it did with the base\'s)' : 'a result with the new Yosys only';
      for (const [m] of METRICS) row.cells[m] = fmt(m, (h || b)?.[m]);
      if (!h && b) row.worse.push('flow');
      rows.push(row);
      continue;
    }
    if (b.part !== h.part) row.note = `built on the ${h.part} (the base's on the ${b.part}): not compared`;
    for (const [m] of METRICS) {
      const x = b[m], y = h[m];
      if (x === y || typeof x !== 'number' || typeof y !== 'number' || row.note) { row.cells[m] = x === y ? fmt(m, y) : `${fmt(m, x)} → ${fmt(m, y)}`; continue; }
      const change = x ? (y - x) / x : y > 0 ? 1 : -1;
      const beyond = Math.abs(change) > (tolerance[m] ?? 0);
      row.cells[m] = `${fmt(m, x)} → ${fmt(m, y)} (${pct(change)})${beyond ? (change > 0 ? ' **worse**' : ' **better**') : ''}`;
      if (beyond) (change > 0 ? row.worse : row.better).push(m);
    }
    rows.push(row);
  }
  return rows;
}

/** The qualities of a designs.json (test/designs-corpus/run.mjs --json): { name: quality | null }. */
export function designQualities(results, names = Object.keys(results || {})) {
  return Object.fromEntries(names.map(n => [n, results?.[n]?.quality ?? null]));
}

/** The corpus's shards together: { tag, shards: [k], missing: [k], regress, fixed, fresh, timedOut, newWarnings, goneWarnings, results, expected }. */
export function mergeCorpus(shards, count = 2) {
  const out = { tag: null, shards: [], missing: [], regress: [], fixed: [], fresh: [], timedOut: [], newWarnings: [], goneWarnings: [], results: {}, expected: {} };
  for (let k = 1; k <= count; k++) {
    const s = shards[k];
    if (!s) { out.missing.push(k); continue; }
    out.shards.push(k);
    out.tag = out.tag || s.tag;
    for (const f of ['regress', 'fixed', 'fresh', 'timedOut', 'newWarnings', 'goneWarnings']) out[f].push(...(s[f] || []));
    Object.assign(out.results, s.results || {});
    Object.assign(out.expected, s.expected || {});
  }
  return out;
}

const cap = (list, n, f) => [...list.slice(0, n).map(f), ...(list.length > n ? [`- … and ${list.length - n} more (the artifact has them all)`] : [])];

/** The table of the differences (Markdown), the comment's and the job summary's. */
export function reportMarkdown({ baseVersion, headVersion, examples, designs, corpus, testsPin = YOSYS_TESTS_PIN, runUrl = '' }) {
  const L = [MARK, `## Yosys update: ${PACKAGE} ${baseVersion} → ${headVersion}`, '',
    'The open synthesis measured with this pull request\'s Yosys and with the base branch\'s, on GitHub\'s runner: the same code (this pull request\'s), only `@yowasp/yosys` differs. '
    + `A change beyond the design corpus's noise (size ${(100 * QUALITY_TOLERANCE.slices).toFixed(0)}%, critical path ${(100 * QUALITY_TOLERANCE.period).toFixed(0)}%) is marked.`, ''];
  const all = [...examples, ...designs];
  const worse = all.filter(r => r.worse.length), better = all.filter(r => r.better.length);
  L.push(`**Summary**: ${worse.length ? `${worse.length} worse (${worse.map(r => r.name).join(', ')})` : 'none worse'}; ${better.length ? `${better.length} better (${better.map(r => r.name).join(', ')})` : 'none better'}; `
    + (corpus ? `Yosys's test designs: ${corpus.regress.length} regression(s), ${corpus.fixed.length} newly passing, ${corpus.newWarnings.length} new warning(s)${corpus.missing.length ? `, shard(s) ${corpus.missing.join(', ')} without a result` : ''}.` : 'Yosys\'s test designs: no result.'), '');
  const table = (title, rows) => {
    L.push(`### ${title}`, '');
    if (!rows.length) { L.push('No result (see the run).', ''); return; }
    L.push(`| design | ${METRICS.map(([, t]) => t).join(' | ')} | |`, `|---|${METRICS.map(() => '---').join('|')}|---|`);
    for (const r of rows) L.push(`| ${r.name} | ${METRICS.map(([m]) => r.cells[m]).join(' | ')} | ${r.note} |`);
    L.push('');
  };
  table('Examples (Basys2-250)', examples);
  table('Design corpus (a representative subset)', designs);
  L.push(`### Yosys's test designs (test/corpus, ${corpus?.tag || testsPin.tag}) against test/corpus/expected.json`, '');
  if (!corpus || !corpus.shards.length) L.push('No result (see the run).', '');
  else {
    const kind = v => String(v).split(':')[0];
    const keys = Object.keys(corpus.results).filter(k => k.includes(':'));
    const tally = list => ['pass', 'mismatch', 'unsupported', 'error'].map(s => `${s} ${list.filter(k => kind(corpus.results[k]) === s).length}`).join(', ');
    L.push(`- Yosys reading the source: ${tally(keys.filter(k => !k.endsWith(' (synth)')))}`, `- Silinx's open synthesis: ${tally(keys.filter(k => k.endsWith(' (synth)')))}`);
    if (corpus.missing.length) L.push(`- shard(s) ${corpus.missing.join(', ')}: no result (the job failed or was cancelled: see the run)`);
    L.push('');
    if (corpus.regress.length) L.push(`**Regressions** (${corpus.regress.length}: expected to pass):`, '', ...cap(corpus.regress, 30, k => `- \`${k}\`: ${corpus.results[k] ?? 'no result'}`), '');
    if (corpus.timedOut.length) L.push(`**Timed out** (${corpus.timedOut.length}): ${corpus.timedOut.map(f => `\`${f}\``).join(', ')}`, '');
    if (corpus.fixed.length) L.push(`Newly passing (${corpus.fixed.length}):`, '', ...cap(corpus.fixed, 30, k => `- \`${k}\` (was: ${corpus.expected[k] ?? '?'})`), '');
    if (corpus.newWarnings.length) L.push(`**New warnings** (${corpus.newWarnings.length}):`, '', ...cap(corpus.newWarnings, 20, w => `- ${w}`), '');
    if (corpus.goneWarnings.length) L.push(`Warnings no longer given: ${corpus.goneWarnings.length}`, '');
    if (corpus.fresh.length) L.push(`Not in expected.json: ${corpus.fresh.length}`, '');
    if (!corpus.regress.length && !corpus.fixed.length && !corpus.newWarnings.length && !corpus.timedOut.length) L.push('No change against the expectations.', '');
  }
  const tag = yosysTag(headVersion);
  if (tag && tag !== testsPin.tag) {
    L.push(`**To do in this pull request**: test/corpus/expected.json (and warnings.json) belong to the Yosys test designs pinned by \`YOSYS_TESTS_PIN\` `
      + `(scripts/fetch-yosys-tests.mjs, ${testsPin.tag}); the new Yosys is ${tag}. Pin ${tag} (its tag and commit: \`git ls-remote https://github.com/YosysHQ/yosys refs/tags/${tag}\`), `
      + 'then regenerate the expectations with the new Yosys in this pull request: `npm run fetch:yosys-tests && npm run test:corpus -- --update` '
      + '(writes expected.json and warnings.json), review their diff, and update the coverage and the version in test/corpus/README.md (and research/synth-quality/README.md).', '');
  }
  L.push('### Before merging', '',
    'A `yosys update` pull request is never merged on green alone (CLAUDE.md, Integration): review these differences, then decide. '
    + 'CI gates it too: test/synth-quality.test.js (the size budgets) and test/synth-diff*.test.js (netlists against the RTL) must pass. '
    + 'After merging, run the quality comparison against ISE (Actions ▸ Quality ▸ Run workflow, on the self-hosted ISE runner): '
    + 'the numbers of docs/QUALITY.md will move with the new Yosys; review them when its results are merged.', '');
  if (runUrl) L.push(`(Written by ${runUrl}, scripts/yosys-update-report.mjs.)`);
  return `${L.join('\n').trimEnd()}\n`;
}

const readJson = (f, def = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };

/** One side's measurements: { examples: { name: quality | null }, designs: { name: quality | null } }. */
export function readSide(dir) {
  return {
    examples: Object.fromEntries(EXAMPLE_ORDER.map(n => [n, readJson(path.join(dir, 'examples', `${n}.json`))])),
    designs: designQualities(readJson(path.join(dir, 'designs.json'), {}), DESIGN_SUBSET),
  };
}

async function comment(file) {
  const { GITHUB_TOKEN: token, GITHUB_REPOSITORY: repo, PR_NUMBER: pr } = process.env;
  if (!token || !repo || !pr) { console.error('usage: comment <file> (GITHUB_TOKEN, GITHUB_REPOSITORY, PR_NUMBER)'); process.exit(2); }
  const body = fs.readFileSync(file, 'utf8');
  const api = (p, opts = {}) => fetch(`https://api.github.com/repos/${repo}/${p}`, { ...opts, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', ...(opts.body && { 'Content-Type': 'application/json' }) } });
  const list = await api(`issues/${pr}/comments?per_page=100`);
  const mine = list.ok ? (await list.json()).find(c => String(c.body || '').startsWith(MARK)) : null;
  const r = mine ? await api(`issues/comments/${mine.id}`, { method: 'PATCH', body: JSON.stringify({ body }) })
    : await api(`issues/${pr}/comments`, { method: 'POST', body: JSON.stringify({ body }) });
  if (r.ok) { console.log(mine ? `updated the comment ${mine.id}` : `commented on #${pr}`); return; }
  // a read-only token (a Dependabot pull request, a fork's): the summary and the artifact have the table
  console.log(`::notice::No comment on #${pr} (GitHub API ${r.status}: the token may not write): the table is in the job summary and the artifact yosys-update-report`);
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (cmd === 'versions') {
    const [bp, bl, hp, hl] = args;
    const c = yosysChange(yosysVersion(readJson(bp), readJson(bl)), yosysVersion(readJson(hp), readJson(hl)));
    console.log(`${PACKAGE}: ${c.base} → ${c.head}${c.changed ? '' : ' (unchanged)'}`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${c.changed}\nbase=${c.base}\nhead=${c.head}\n`);
  } else if (cmd === 'subset') {
    console.log(DESIGN_SUBSET.join(','));
  } else if (cmd === 'report') {
    const base = readSide(opt('--base')), head = readSide(opt('--head'));
    const dir = opt('--corpus');
    const shards = {};
    for (const k of [1, 2]) shards[k] = dir ? readJson(path.join(dir, `shard-${k}.json`)) : null;
    const md = reportMarkdown({ baseVersion: opt('--base-version'), headVersion: opt('--head-version'),
      examples: qualityRows(base.examples, head.examples), designs: qualityRows(base.designs, head.designs), corpus: dir ? mergeCorpus(shards) : null,
      runUrl: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '' });
    if (opt('--out')) fs.writeFileSync(opt('--out'), md); else process.stdout.write(md);
  } else if (cmd === 'comment') {
    await comment(args[0]);
  } else {
    console.error('usage: yosys-update-report.mjs versions|subset|report|comment …'); process.exit(2);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
