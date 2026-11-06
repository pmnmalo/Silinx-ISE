#!/usr/bin/env node
// A nextpnr update reviewed, not merged on green alone (#2935), as a Yosys update is (scripts/yosys-update-report.mjs):
// .github/workflows/nextpnr-update.yml, on a pull request that changes a nextpnr package (@silinx/nextpnr-himbaechel-
// spartan3e, -spartan6: Dependabot's, a release of pmnmalo/nextpnr-spartan pinned by hand, #2934), builds every example
// through the application's flow (server/open-flow.js: nextpnr places and routes) on a board of each family with the
// pull request's packages and with the base branch's (the same code, only the nextpnr packages installed over it
// differ); this script tells whether the pull request changes them, measures a board's examples, and writes the table
// of the differences (the job summary, an artifact and a comment on the pull request).
//
//   node scripts/nextpnr-update-report.mjs versions <base package.json> <base package-lock.json> <head package.json> <head package-lock.json>
//        the nextpnr packages' versions (changed=true|false, base=<the base's packages to install: name@spec …>,
//        summary=<what changes> also to $GITHUB_OUTPUT)
//   node scripts/nextpnr-update-report.mjs boards
//        the boards measured (the workflow's matrix)
//   node scripts/nextpnr-update-report.mjs measure <board> <out dir>
//        every example the board builds through the application's flow: <out dir>/<board>/<example>.json
//   node scripts/nextpnr-update-report.mjs report --base dir --head dir --summary text [--out file]
//   node scripts/nextpnr-update-report.mjs comment <file>
//        the table as the pull request's comment (one, updated by later runs): GITHUB_TOKEN with pull-requests: write,
//        GITHUB_REPOSITORY, PR_NUMBER; a token that may not comment is not an error (the summary and the artifact have it)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QUALITY_TOLERANCE } from '../test/designs-corpus/lib.mjs';
import { EXAMPLE_ORDER } from '../core/examples.js';
import { qualityRows, postComment } from './yosys-update-report.mjs';

export const PACKAGES = ['@silinx/nextpnr-himbaechel-spartan3e', '@silinx/nextpnr-himbaechel-spartan6'];
// the repository whose releases a package may be pinned by (the fork, #2131): a release's tarball, spartan6-vX.Y.Z
export const FORK = 'pmnmalo/nextpnr-spartan';
const RELEASE = /^https:\/\/github\.com\/pmnmalo\/nextpnr-spartan\/releases\/download\/[a-z0-9]+-v\d+\.\d+\.\d+\/[\w.-]+\.tgz$/;
export const MARK = '<!-- silinx:nextpnr-update -->';
// a board of each family's nextpnr, with the device of each: the Spartan-3E's (the examples' Basys2-250), the Spartan-6's two
export const BOARDS = { 'basys2-250': { board: 'basys2', variant: '250' }, nexys3: { board: 'nexys3' }, atlys: { board: 'atlys' } };
export const METRICS = [['slices', 'slices'], ['luts', 'LUTs'], ['ffs', 'FFs'], ['period', 'min. period (ns)'], ['seconds', 'run time (s)']];
// the run time is the runner's too (two machines, one for each side): only a large change is marked
export const TOLERANCE = { ...QUALITY_TOLERANCE, seconds: 0.25 };

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

/** One example's measurement from the flow's job: { part, slices, luts, ffs, period, seconds }, or null (the flow did not complete). */
export function measurementOf(job, part, seconds) {
  const r = job?.result?.reports;
  if (job?.status !== 'ok' || !r?.summary?.routed) return null;
  const u = r.summary.utilization || {};
  return { part, slices: u.slices?.used ?? null, luts: u.luts?.used ?? null, ffs: u.ffs?.used ?? null,
    period: r.timing?.minPeriodNs ?? null, seconds: Math.round(seconds * 10) / 10 };
}

/** A board's examples through the application's flow, each written to <out>/<board>/<example>.json (null: it did not complete). */
async function measure(boardKey, out) {
  const target = BOARDS[boardKey];
  if (!target) throw new Error(`not a board measured: ${boardKey} (${Object.keys(BOARDS).join(', ')})`);
  const { exampleProject, silinxFlow, targetsOf, targetName } = await import('../test/examples-lib.mjs');
  const dir = path.join(out, boardKey), tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nextpnr-update-'));
  fs.mkdirSync(dir, { recursive: true });
  for (const name of EXAMPLE_ORDER) {
    if (!targetsOf(name).some(t => targetName(t) === targetName(target))) continue;
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

/** One side's measurements: { 'example (board)': measurement | null }, in the examples' order, board by board. */
export function readSide(dir) {
  const out = {};
  for (const board of Object.keys(BOARDS)) for (const name of EXAMPLE_ORDER) {
    const f = path.join(dir, board, `${name}.json`);
    if (fs.existsSync(f)) out[`${name} (${board})`] = readJson(f);
  }
  return out;
}

/** The table of the differences (Markdown), the comment's and the job summary's. */
export function reportMarkdown({ summary, rows, runUrl = '' }) {
  const L = [MARK, `## nextpnr update: ${summary || '?'}`, '',
    'The examples built through the application\'s flow (nextpnr packs, places and routes) with this pull request\'s nextpnr packages and with the base branch\'s, '
    + 'on GitHub\'s runners: the same code (this pull request\'s), only the nextpnr packages differ. '
    + `A change beyond the noise (size ${(100 * TOLERANCE.slices).toFixed(0)}%, period ${(100 * TOLERANCE.period).toFixed(0)}%, run time ${(100 * TOLERANCE.seconds).toFixed(0)}%) is marked.`, ''];
  const worse = rows.filter(r => r.worse.length), better = rows.filter(r => r.better.length);
  L.push(`**Summary**: ${worse.length ? `${worse.length} worse (${worse.map(r => r.name).join(', ')})` : 'none worse'}; ${better.length ? `${better.length} better (${better.map(r => r.name).join(', ')})` : 'none better'}.`, '');
  if (!rows.length) L.push('No result (see the run).', '');
  else {
    L.push(`| design | ${METRICS.map(([, t]) => t).join(' | ')} | |`, `|---|${METRICS.map(() => '---').join('|')}|---|`);
    for (const r of rows) L.push(`| ${r.name} | ${METRICS.map(([m]) => r.cells[m]).join(' | ')} | ${r.note} |`);
    L.push('');
  }
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
      if (c.base.spec !== null) base.push(installSpec(c.name, c.base.spec));
    }
    const summary = changeSummary(changes);
    console.log(changes.length ? summary : 'the nextpnr packages: unchanged');
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changes.length > 0}\nbase=${base.join(' ')}\nsummary=${summary}\n`);
  } else if (cmd === 'boards') {
    console.log(JSON.stringify(Object.keys(BOARDS)));
  } else if (cmd === 'measure') {
    await measure(args[0], args[1]);
  } else if (cmd === 'report') {
    const rows = qualityRows(readSide(opt('--base')), readSide(opt('--head')), TOLERANCE, { metrics: METRICS, tool: 'nextpnr' });
    const md = reportMarkdown({ summary: opt('--summary'), rows,
      runUrl: process.env.GITHUB_RUN_ID ? `${process.env.GITHUB_SERVER_URL || 'https://github.com'}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '' });
    if (opt('--out')) fs.writeFileSync(opt('--out'), md); else process.stdout.write(md);
  } else if (cmd === 'comment') {
    await postComment(args[0], { mark: MARK, artifact: 'nextpnr-update-report' });
  } else {
    console.error('usage: nextpnr-update-report.mjs versions|boards|measure|report|comment …'); process.exit(2);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(e => { console.error(e.message); process.exit(1); });
