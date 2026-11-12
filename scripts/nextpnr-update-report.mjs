#!/usr/bin/env node
// A nextpnr update reviewed, not merged on green alone (#2935), as a Yosys update is (scripts/yosys-update-report.mjs):
// .github/workflows/nextpnr-update.yml, on a pull request that changes a nextpnr package (@silinx/nextpnr-himbaechel-
// spartan3e, -spartan6: Dependabot's, a release of pmnmalo/nextpnr-spartan pinned by hand, #2934), builds every example
// through the application's flow (server/open-flow.js: nextpnr places and routes) on a board of each family with the
// pull request's packages and with the base branch's (the same code, only the nextpnr packages installed over it
// differ); this script tells whether the pull request changes them, measures a board's examples, and writes the table
// of the differences (the job summary, an artifact and a comment on the pull request). Both sides of a board are
// measured in one job, on the same runner, alternated (base, head, head, base, base, head), each run time the median of
// its runs (#3030: a side per job, the runners alone moved run times by 20-39 %); a board whose package does not change
// is not measured.
//
//   node scripts/nextpnr-update-report.mjs versions <base package.json> <base package-lock.json> <head package.json> <head package-lock.json>
//        the nextpnr packages' versions (changed=true|false, base=<the base's packages to install: name@spec …>,
//        summary=<what changes>, boards=<the boards whose package changes, JSON> also to $GITHUB_OUTPUT)
//   node scripts/nextpnr-update-report.mjs boards
//        the boards measured (the workflow's matrix)
//   node scripts/nextpnr-update-report.mjs measure <board> <out dir> [--shard k/n]
//        every example the board builds through the application's flow (the k-th of n shards): <out dir>/<board>/<example>.json
//   node scripts/nextpnr-update-report.mjs report --base dir --head dir --summary text [--boards json] [--out file]
//        dir: r<run>/<board>/<example>.json (or <board>/<example>.json, one run); --boards: the boards measured (the
//        others' package unchanged)
//   node scripts/nextpnr-update-report.mjs comment <file>
//        the table as the pull request's comment (one, updated by later runs): GITHUB_TOKEN with pull-requests: write,
//        GITHUB_REPOSITORY, PR_NUMBER; a token that may not comment is not an error (the summary and the artifact have it)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALITY_TOLERANCE } from '../test/designs-corpus/lib.mjs';
import { EXAMPLE_ORDER } from '../core/examples.js';
import { qualityRows, postComment, VERSION_SHAPE, githubOutputLines } from './yosys-update-report.mjs';

export const PACKAGES = ['@silinx/nextpnr-himbaechel-spartan3e', '@silinx/nextpnr-himbaechel-spartan6'];
// the repository whose releases a package may be pinned by (the fork, #2131): a release's tarball, spartan6-vX.Y.Z
export const FORK = 'pmnmalo/nextpnr-spartan';
const RELEASE = /^https:\/\/github\.com\/pmnmalo\/nextpnr-spartan\/releases\/download\/[a-z0-9]+-v\d+\.\d+\.\d+\/[\w.-]+\.tgz$/;
export const MARK = '<!-- silinx:nextpnr-update -->';
// a board of each family's nextpnr, with the device of each and the package that places and routes it: the Spartan-3E's
// (the examples' Basys2-250), the Spartan-6's two
export const BOARDS = { 'basys2-250': { board: 'basys2', variant: '250', pkg: PACKAGES[0] }, nexys3: { board: 'nexys3', pkg: PACKAGES[1] },
  atlys: { board: 'atlys', pkg: PACKAGES[1] } };
// the jobs of a board (--shard k/SHARDS: its examples alternately), each measuring both sides within its time limit
export const SHARDS = 2;
const METRICS = [['slices', 'slices'], ['luts', 'LUTs'], ['ffs', 'FFs'], ['period', 'min. period (ns)'], ['seconds', 'run time (s)']];
// the run time, both sides on the same runner (#3030): marked past 10 % and past its runs' own noise, when they agree
export const TOLERANCE = { ...QUALITY_TOLERANCE, seconds: 0.1 };

/** A nextpnr package's version, as package.json asks for it and package-lock.json resolves it: { spec, resolved }. */
export function packageVersion(pkg, lock, name) {
  return { spec: pkg?.dependencies?.[name] ?? pkg?.optionalDependencies?.[name] ?? null, resolved: lock?.packages?.[`node_modules/${name}`]?.version ?? null };
}

/** What npm installs for a spec: `name@spec` for a version or a release of the fork; null for anything else (an alias, a tag, a
 *  range, another repository: a pull request's files are not trusted further, #479). */
export function installSpec(name, spec) {
  if (!PACKAGES.includes(name)) return null;
  if (/^\d+\.\d+\.\d+$/.test(String(spec))) return `${name}@${spec}`;
  return RELEASE.test(String(spec)) ? `${name}@${spec}` : null;
}

/** The packages a pull request changes: [{ name, base, head }] (the specs, and the versions resolved). */
export function nextpnrChanges(basePkg, baseLock, headPkg, headLock) {
  const out = [];
  for (const name of PACKAGES) {
    const b = packageVersion(basePkg, baseLock, name), h = packageVersion(headPkg, headLock, name);
    if (b.spec !== h.spec || b.resolved !== h.resolved) out.push({ name, base: b, head: h });
  }
  return out;
}

const short = name => name.replace('@silinx/nextpnr-himbaechel-', '');
/** The changes in a line: 'spartan3e 1.0.0 → 1.1.0, spartan6 0.1.3 → 0.1.4'. */
export const changeSummary = changes => changes.map(c => `${short(c.name)} ${c.base.resolved ?? c.base.spec ?? 'none'} → ${c.head.resolved ?? c.head.spec ?? 'none'}`).join(', ');

/** The boards whose package a pull request changes (the others build with the same code on both sides: not measured). */
export const changedBoards = changes => Object.keys(BOARDS).filter(b => changes.some(c => c.name === BOARDS[b].pkg));

/** The k-th of n shards of a list (1-based): its items k, k + n, k + 2n … */
export function shardOf(list, k = 1, n = 1) {
  if (!(Number.isInteger(k) && Number.isInteger(n) && k >= 1 && k <= n)) throw new Error(`not a shard: ${k}/${n}`);
  return list.filter((_, i) => i % n === k - 1);
}

/** The median of numbers (the mean of the middle two of an even count); null for none. */
export function median(xs) {
  const s = xs.filter(x => typeof x === 'number').sort((a, b) => a - b);
  if (!s.length) return null;
  const h = s.length >> 1;
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}

/** The spread of a side's runs, relative to their median: (max - min) / median (0 for one run). */
export function spread(xs) {
  const s = xs.filter(x => typeof x === 'number'), m = median(s);
  return m ? (Math.max(...s) - Math.min(...s)) / m : 0;
}

/**
 * A design's run time, the base's runs against the head's (one job, one runner): { cell, mark: 'worse' | 'better' | null }.
 * The medians' change is marked only past the tolerance and past the noise (the larger spread of either side's runs), and
 * only when the runs agree: two or more on each side, every head's run slower (worse) or faster (better) than every base's.
 */
export function runTimeCell(baseRuns, headRuns, tolerance = TOLERANCE.seconds) {
  const b = baseRuns.filter(x => typeof x === 'number'), h = headRuns.filter(x => typeof x === 'number');
  const r1 = x => Math.round(x * 10) / 10;
  const x = median(b), y = median(h);
  if (x === null || y === null) return { cell: x === null && y === null ? '-' : String(r1(x ?? y)), mark: null };
  const change = x ? (y - x) / x : y > 0 ? 1 : 0;
  const noise = Math.max(spread(b), spread(h));
  const agree = b.length > 1 && h.length > 1 && (Math.min(...h) > Math.max(...b) || Math.max(...h) < Math.min(...b));
  const mark = agree && Math.abs(change) > Math.max(tolerance, noise) ? (change > 0 ? 'worse' : 'better') : null;
  const many = b.length > 1 || h.length > 1;
  return { cell: `${r1(x)} → ${r1(y)} (${change > 0 ? '+' : ''}${(100 * change).toFixed(1)}%${many ? `, noise ${(100 * noise).toFixed(0)}%` : ''})${mark ? ` **${mark}**` : ''}`, mark };
}

/** One example's measurement from the flow's job: { part, slices, luts, ffs, period, seconds }, or null (the flow did not complete). */
export function measurementOf(job, part, seconds) {
  const r = job?.result?.reports;
  if (job?.status !== 'ok' || !r?.summary?.routed) return null;
  const u = r.summary.utilization || {};
  return { part, slices: u.slices?.used ?? null, luts: u.luts?.used ?? null, ffs: u.ffs?.used ?? null,
    period: r.timing?.minPeriodNs ?? null, seconds: Math.round(seconds * 10) / 10 };
}

/** A board's examples (the k-th of n shards) through the application's flow, each written to <out>/<board>/<example>.json
 *  (null: it did not complete). */
async function measure(boardKey, out, k = 1, n = 1) {
  const target = BOARDS[boardKey];
  if (!target) throw new Error(`not a board measured: ${boardKey} (${Object.keys(BOARDS).join(', ')})`);
  const { exampleProject, silinxFlow, targetsOf, targetName } = await import('../test/examples-lib.mjs');
  const dir = path.join(out, boardKey), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nextpnr-update-'));
  fs.mkdirSync(dir, { recursive: true });
  for (const name of shardOf(EXAMPLE_ORDER.filter(e => targetsOf(e).some(t => targetName(t) === targetName(target))), k, n)) {
    const { dir: proj, project } = exampleProject(name, target, tmp);
    const t0 = performance.now();
    const job = await silinxFlow(proj, project, ['synth', 'translate', 'map', 'par', 'trce']);
    const d = project.device || {};
    const m = measurementOf(job, `${d.part}${d.package}${d.speed}`, (performance.now() - t0) / 1000);
    fs.writeFileSync(path.join(dir, `${name}.json`), `${JSON.stringify(m)}\n`);
    console.log(`${name} (${boardKey}): ${m ? `${m.slices} slices, ${m.period} ns, ${m.seconds} s` : `the flow did not complete (${job.status})`}`);
    if (!m) console.log(job.lines?.filter(l => /ERROR/.test(l)).slice(0, 5).join('\n') || '');
  }
  fs.rmSync(tmp, { recursive: true, force: true });
}

const readJson = (f, def = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };

/** One side's measurements: { 'example (board)': measurement | null }, in the examples' order, board by board; of its
 *  runs (dir/r<k>/, else dir itself) the first's size and period (the same in every run), every run's time (`runs`) and
 *  their median (`seconds`). */
export function readSide(dir) {
  const reps = fs.existsSync(dir) ? fs.readdirSync(dir).filter(d => /^r\d+$/.test(d)).sort((a, b) => a.slice(1) - b.slice(1)) : [];
  const dirs = reps.length ? reps.map(d => path.join(dir, d)) : [dir];
  const out = {};
  for (const board of Object.keys(BOARDS)) for (const name of EXAMPLE_ORDER) {
    const files = dirs.map(d => path.join(d, board, `${name}.json`)).filter(f => fs.existsSync(f));
    if (!files.length) continue;
    const ms = files.map(f => readJson(f)).filter(Boolean);
    out[`${name} (${board})`] = ms.length ? { ...ms[0], runs: ms.map(m => m.seconds), seconds: median(ms.map(m => m.seconds)) } : null;
  }
  return out;
}

/** The table's rows: the size and period as qualityRows compares them, the run time by runTimeCell (of the runs). */
export function nextpnrRows(base, head, tolerance = TOLERANCE) {
  const rows = qualityRows(base, head, tolerance, { metrics: METRICS.filter(([m]) => m !== 'seconds'), tool: 'nextpnr' });
  for (const r of rows) {
    const b = base[r.name] ?? null, h = head[r.name] ?? null;
    const t = runTimeCell(b?.runs ?? [b?.seconds], h?.runs ?? [h?.seconds], tolerance.seconds);
    // a design not compared (a side without a result, built on another part): its run time shown, unmarked
    if (b && h && !r.note && t.mark) r[t.mark].push('seconds');
    r.cells.seconds = b && h && !r.note ? t.cell : t.cell.replace(/ \*\*\w+\*\*$/, '');
  }
  return rows;
}

/** The table of the differences (Markdown), the comment's and the job summary's. */
export function reportMarkdown({ summary, rows, unmeasured = [], runUrl = '' }) {
  const L = [MARK, `## nextpnr update: ${summary || '?'}`, '',
    'The examples built through the application\'s flow (nextpnr packs, places and routes) with this pull request\'s nextpnr packages and with the base branch\'s, '
    + 'on GitHub\'s runners: the same code (this pull request\'s), only the nextpnr packages differ. Both sides of a board run in one job, on the same runner, '
    + 'alternated; a run time is the median of the side\'s runs, its noise the larger spread of either side\'s runs. '
    + `A change beyond the noise (size ${(100 * TOLERANCE.slices).toFixed(0)}%, period ${(100 * TOLERANCE.period).toFixed(0)}%, run time ${(100 * TOLERANCE.seconds).toFixed(0)}% `
    + 'and its runs\' noise, every run of one side slower than every run of the other) is marked.', ''];
  const worse = rows.filter(r => r.worse.length), better = rows.filter(r => r.better.length);
  L.push(`**Summary**: ${worse.length ? `${worse.length} worse (${worse.map(r => r.name).join(', ')})` : 'none worse'}; ${better.length ? `${better.length} better (${better.map(r => r.name).join(', ')})` : 'none better'}.`, '');
  if (!rows.length) L.push('No result (see the run).', '');
  else {
    L.push(`| design | ${METRICS.map(([, t]) => t).join(' | ')} | |`, `|---|${METRICS.map(() => '---').join('|')}|---|`);
    for (const r of rows) L.push(`| ${r.name} | ${METRICS.map(([m]) => r.cells[m]).join(' | ')} | ${r.note} |`);
    L.push('');
  }
  if (unmeasured.length) L.push(`Not measured (unchanged package, the same code on both sides): ${unmeasured.map(b => `${b} (${short(BOARDS[b].pkg)})`).join(', ')}.`, '');
  L.push('### Before merging', '',
    'A `nextpnr update` pull request is never merged on green alone (CLAUDE.md, Integration): review these differences, then decide. '
    + 'Its related tests gate it too (the examples on every device, test/examples-*.test.js). '
    + 'After merging, check the open flow against ISE on the self-hosted ISE runner (`npm run check:open-flow`: a clean DRC).', '');
  if (runUrl) L.push(`(Written by ${runUrl}, scripts/nextpnr-update-report.mjs.)`);
  return `${L.join('\n').trimEnd()}\n`;
}

async function main() {
  const [cmd, ...args] = process.argv.slice(2);
  const opt = (k, d = null) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  if (cmd === 'versions') {
    const [bp, bl, hp, hl] = args.map(f => readJson(f));
    const changes = nextpnrChanges(bp, bl, hp, hl);
    // the base's to install, and the pull request's checked the same way (its summary goes into the comment)
    const base = [];
    for (const c of changes) {
      for (const side of ['base', 'head']) if (c[side].spec !== null && !installSpec(c.name, c[side].spec)) { console.error(`${c.name}: the ${side}'s is not a version or a release of ${FORK}: ${JSON.stringify(c[side].spec)}`); process.exit(1); }
      // the versions package-lock.json resolves go into the summary (the step's outputs, the comment): a version's shape only (#2959)
      for (const side of ['base', 'head']) if (c[side].resolved !== null && !VERSION_SHAPE.test(String(c[side].resolved))) { console.error(`${c.name}: the ${side}'s package-lock.json version is not a version: ${JSON.stringify(c[side].resolved)}`); process.exit(1); }
      if (c.base.spec !== null) base.push(installSpec(c.name, c.base.spec));
    }
    const summary = changeSummary(changes);
    console.log(changes.length ? summary : 'the nextpnr packages: unchanged');
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, githubOutputLines({ changed: changes.length > 0, base: base.join(' '), summary, boards: JSON.stringify(changedBoards(changes)) }));
  } else if (cmd === 'boards') {
    console.log(JSON.stringify(Object.keys(BOARDS)));
  } else if (cmd === 'measure') {
    const [k, n] = (opt('--shard') ?? '1/1').split('/').map(Number);
    await measure(args[0], args[1], k, n);
  } else if (cmd === 'report') {
    const rows = nextpnrRows(readSide(opt('--base')), readSide(opt('--head')));
    const measured = opt('--boards') ? JSON.parse(opt('--boards')) : Object.keys(BOARDS);
    const md = reportMarkdown({ summary: opt('--summary'), rows, unmeasured: Object.keys(BOARDS).filter(b => !measured.includes(b)),
      runUrl: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '' });
    if (opt('--out')) fs.writeFileSync(opt('--out'), md); else process.stdout.write(md);
  } else if (cmd === 'comment') {
    await postComment(args[0], { mark: MARK, artifact: 'nextpnr-update-report' });
  } else {
    console.error('usage: nextpnr-update-report.mjs versions|boards|measure|report|comment …'); process.exit(2);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
