// A nextpnr update reviewed, not merged on green alone (#2935): scripts/nextpnr-update-report.mjs (whether a pull request
// changes a nextpnr package, what the base's side installs, a board's examples measured, the table of the differences),
// the workflow that runs it (.github/workflows/nextpnr-update.yml: GitHub's runners only), Dependabot's configuration
// (the packages never grouped) and CLAUDE.md's rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkoutLayout } from './workflows-lib.mjs';
import { PACKAGES, FORK, MARK, BOARDS, SHARDS, TOLERANCE, packageVersion, installSpec, nextpnrChanges, changeSummary, changedBoards, shardOf, median, spread, runTimeCell,
  measurementOf, readSide, nextpnrRows, reportMarkdown } from '../scripts/nextpnr-update-report.mjs';
import { githubOutputLines } from '../scripts/yosys-update-report.mjs';
import { EXAMPLE_ORDER } from '../core/examples.js';
import { TARGETS, S3E_TARGETS, S6_TARGETS, targetName } from './examples-lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const S3E = '@silinx/nextpnr-himbaechel-spartan3e', S6 = '@silinx/nextpnr-himbaechel-spartan6';
const url = v => `https://github.com/pmnmalo/nextpnr-spartan/releases/download/spartan6-v${v}/silinx-nextpnr-himbaechel-spartan6-${v}.tgz`;
const side = (v3, v6) => [{ dependencies: { [S3E]: v3, [S6]: url(v6), other: '1.0.0' } },
  { packages: { [`node_modules/${S3E}`]: { version: v3 }, [`node_modules/${S6}`]: { version: v6 } } }];

test('nextpnr update: the packages\' versions asked for and resolved; the repository\'s own unchanged', () => {
  assert.deepEqual(PACKAGES, [S3E, S6]);
  const pkg = JSON.parse(read('package.json')), lock = JSON.parse(read('package-lock.json'));
  for (const name of PACKAGES) {
    const v = packageVersion(pkg, lock, name);
    assert.equal(v.spec, pkg.dependencies[name]);
    assert.match(v.resolved, /^\d+\.\d+\.\d+$/);
    // what the repository pins is what the base's side may install
    assert.equal(installSpec(name, v.spec), `${name}@${v.spec}`);
  }
  // the toolchain's package pins them alike
  const fpga = JSON.parse(read('packages/silinx-fpga/package.json'));
  for (const name of PACKAGES) assert.equal(fpga.dependencies[name], pkg.dependencies[name], name);
  assert.deepEqual(nextpnrChanges(pkg, lock, pkg, lock), []);
  assert.deepEqual(packageVersion({}, {}, S3E), { spec: null, resolved: null });
});

test('nextpnr update: a pull request\'s changes, each package, in a line', () => {
  const [bp, bl] = side('1.0.0', '0.1.3');
  assert.deepEqual(nextpnrChanges(bp, bl, bp, bl), []);
  const [hp, hl] = side('1.1.0', '0.1.3');
  const one = nextpnrChanges(bp, bl, hp, hl);
  assert.deepEqual(one.map(c => [c.name, c.base.resolved, c.head.resolved]), [[S3E, '1.0.0', '1.1.0']]);
  assert.equal(changeSummary(one), 'spartan3e 1.0.0 → 1.1.0');
  const [h2p, h2l] = side('1.1.0', '0.1.4');
  assert.equal(changeSummary(nextpnrChanges(bp, bl, h2p, h2l)), 'spartan3e 1.0.0 → 1.1.0, spartan6 0.1.3 → 0.1.4');
  // a lockfile resolved again with the same spec is a change too
  assert.equal(nextpnrChanges(bp, bl, bp, { packages: { ...bl.packages, [`node_modules/${S3E}`]: { version: '1.0.1' } } }).length, 1);
  // a package added
  assert.equal(changeSummary(nextpnrChanges({ dependencies: {} }, {}, hp, hl)), 'spartan3e none → 1.1.0, spartan6 none → 0.1.3');
});

test('nextpnr update: what the base\'s side installs: a version or a release of the fork, nothing else (#479)', () => {
  assert.equal(FORK, 'pmnmalo/nextpnr-spartan');
  assert.equal(installSpec(S3E, '1.0.0'), `${S3E}@1.0.0`);
  assert.equal(installSpec(S6, url('0.1.3')), `${S6}@${url('0.1.3')}`);
  for (const [name, spec] of [[S3E, '^1.0.0'], [S3E, 'latest'], [S3E, 'npm:evil@1.0.0'], [S3E, '1.0.0 x'], [S3E, '1.0'], [S3E, '1.0.0-rc1'], [S3E, ''], [S3E, null],
    [S6, url('0.1.3').replace('pmnmalo', 'someone')], [S6, `${url('0.1.3')}\nchanged=true`], [S6, `${url('0.1.3')} x`], [S6, url('0.1.3').replace('.tgz', '.sh')],
    [S6, 'github:pmnmalo/nextpnr-spartan#spartan6-v0.1.3'], ['@yowasp/yosys', '0.70.1258'], ['other', '1.0.0']])
    assert.equal(installSpec(name, spec), null, `${name} ${JSON.stringify(spec)}`);
});

test('nextpnr update: the "versions" command writes the step\'s outputs; a spec that is not one is refused', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextpnr-update-'));
  try {
    const write = (f, j) => { fs.writeFileSync(path.join(dir, f), JSON.stringify(j)); return path.join(dir, f); };
    const [bp, bl] = side('1.0.0', '0.1.3'), [hp, hl] = side('1.0.0', '0.1.4');
    const files = [write('bp.json', bp), write('bl.json', bl), write('hp.json', hp), write('hl.json', hl)];
    const out = path.join(dir, 'out');
    const run = args => spawnSync(process.execPath, [path.join(ROOT, 'scripts/nextpnr-update-report.mjs'), 'versions', ...args], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out } });
    let r = run(files);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(r.stdout.trim(), 'spartan6 0.1.3 → 0.1.4');
    // the boards measured: the Spartan-6's, whose package changes (#3030)
    assert.equal(fs.readFileSync(out, 'utf8'), `changed=true\nbase=${S6}@${url('0.1.3')}\nsummary=spartan6 0.1.3 → 0.1.4\nboards=["nexys3","atlys"]\n`);
    fs.rmSync(out);
    r = run([files[0], files[1], files[0], files[1]]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(out, 'utf8'), 'changed=false\nbase=\nsummary=\nboards=[]\n');
    // the pull request's own spec refused (it goes into the comment), its output never written
    fs.rmSync(out);
    const evil = write('evil.json', { dependencies: { [S3E]: 'npm:evil@1.0.0', [S6]: url('0.1.3') } });
    r = run([files[0], files[1], evil, files[3]]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /@silinx\/nextpnr-himbaechel-spartan3e: the head's is not a version or a release of pmnmalo\/nextpnr-spartan: "npm:evil@1\.0\.0"/);
    assert.ok(!fs.existsSync(out));
    // a version package-lock.json resolves that is not one (a line break would write outputs of its own) refused, nothing written (#2959)
    for (const v of ['0.1.4\nbase=x', '0.1.4\r\nchanged=false', '0.1.4 x']) {
      const lock = write('lock.json', { packages: { [`node_modules/${S3E}`]: { version: '1.0.0' }, [`node_modules/${S6}`]: { version: v } } });
      r = run([files[0], files[1], files[2], lock]);
      assert.equal(r.status, 1, JSON.stringify(v));
      assert.equal(r.stderr.trim(), `${S6}: the head's package-lock.json version is not a version: ${JSON.stringify(v)}`);
      assert.equal(r.stdout, '');
      assert.ok(!fs.existsSync(out));
    }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('nextpnr and Yosys updates: a step\'s outputs never hold a line break (#2959)', () => {
  assert.equal(githubOutputLines({ changed: true, base: 'a@1 b@2', summary: 'spartan6 0.1.3 → 0.1.4' }), 'changed=true\nbase=a@1 b@2\nsummary=spartan6 0.1.3 → 0.1.4\n');
  assert.equal(githubOutputLines({ changed: false, base: '', summary: '' }), 'changed=false\nbase=\nsummary=\n');
  for (const v of ['x\ny', 'x\r', '\n']) assert.throws(() => githubOutputLines({ changed: false, summary: v }), new RegExp(`^Error: the output summary holds a line break: ${JSON.stringify(v).replace(/\\/g, '\\\\')}$`));
});

test('nextpnr update: an example\'s measurement from the flow\'s job; none when it did not complete', () => {
  const reports = { summary: { routed: true, utilization: { slices: { used: 53 }, luts: { used: 102 }, ffs: { used: 130 } } }, timing: { minPeriodNs: 4.796 } };
  assert.deepEqual(measurementOf({ status: 'ok', result: { reports } }, 'xc6slx16csg324-3', 8.6421),
    { part: 'xc6slx16csg324-3', slices: 53, luts: 102, ffs: 130, period: 4.796, seconds: 8.6 });
  // a combinational design: no period
  assert.equal(measurementOf({ status: 'ok', result: { reports: { ...reports, timing: {} } } }, 'p', 1).period, null);
  assert.equal(measurementOf({ status: 'error', result: { reports } }, 'p', 1), null);
  assert.equal(measurementOf({ status: 'ok', result: { reports: { ...reports, summary: { ...reports.summary, routed: false } } } }, 'p', 1), null);
  assert.equal(measurementOf({ status: 'ok', result: {} }, 'p', 1), null);
  assert.equal(measurementOf(null, 'p', 1), null);
});

test('nextpnr update: the boards measured, one of each family\'s nextpnr, boards of the examples', () => {
  const names = TARGETS.map(targetName);
  for (const [key, t] of Object.entries(BOARDS)) assert.equal(targetName(t), key);
  for (const key of Object.keys(BOARDS)) assert.ok(names.includes(key), key);
  assert.ok(S3E_TARGETS.some(t => targetName(t) in BOARDS), 'a Spartan-3E board');
  for (const t of S6_TARGETS) assert.ok(targetName(t) in BOARDS, `the Spartan-6's ${targetName(t)}`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/nextpnr-update-report.mjs'), 'boards'], { encoding: 'utf8' });
  assert.deepEqual(JSON.parse(r.stdout), Object.keys(BOARDS));
  // each board's package: the Spartan-3E's for the Basys2-250, the Spartan-6's for the others
  for (const t of S3E_TARGETS) if (targetName(t) in BOARDS) assert.equal(BOARDS[targetName(t)].pkg, S3E);
  for (const t of S6_TARGETS) assert.equal(BOARDS[targetName(t)].pkg, S6);
});

test('nextpnr update: the boards measured are those whose package changes (#3030)', () => {
  const [bp, bl] = side('1.0.0', '0.1.3');
  const boards = (v3, v6) => changedBoards(nextpnrChanges(bp, bl, ...side(v3, v6)));
  assert.deepEqual(boards('1.0.0', '0.1.3'), []);
  assert.deepEqual(boards('1.1.0', '0.1.3'), ['basys2-250']);
  assert.deepEqual(boards('1.0.0', '0.1.4'), ['nexys3', 'atlys']);
  assert.deepEqual(boards('1.1.0', '0.1.4'), Object.keys(BOARDS));
});

test('nextpnr update: a board\'s examples in shards, each example in one, in the examples\' order', () => {
  assert.equal(SHARDS, 2);
  const list = EXAMPLE_ORDER;
  assert.deepEqual(shardOf(list, 1, 1), list);
  const parts = [1, 2, 3].map(k => shardOf(list, k, 3));
  assert.deepEqual(parts.flat().sort(), [...list].sort());
  assert.deepEqual(shardOf(['a', 'b', 'c', 'd', 'e'], 1, 2), ['a', 'c', 'e']);
  assert.deepEqual(shardOf(['a', 'b', 'c', 'd', 'e'], 2, 2), ['b', 'd']);
  assert.deepEqual(shardOf([], 2, 2), []);
  for (const [k, n] of [[0, 2], [3, 2], [1, 0], [1.5, 2], [NaN, 2]]) assert.throws(() => shardOf(list, k, n), new RegExp(`^Error: not a shard: ${k}/${n}$`));
});

test('nextpnr update: the median and the spread of a side\'s run times', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([7]), 7);
  assert.equal(median([]), null);
  assert.equal(median([null, 5, undefined]), 5);
  // against a reference: the middle of the sorted list
  for (const xs of [[9.1, 8.7, 9.4], [12, 30, 11], [5, 5, 5]]) assert.equal(median(xs), [...xs].sort((a, b) => a - b)[1]);
  assert.equal(spread([10, 11, 12]), 2 / 11);
  assert.equal(spread([8]), 0);
  assert.equal(spread([]), 0);
  assert.equal(spread([0, 0]), 0);
});

test('nextpnr update: a run time marked only past the tolerance and the runs\' noise, when the runs agree (#3030)', () => {
  // slower on every run, past 10 % and past the spread of either side
  assert.deepEqual(runTimeCell([10, 10.5, 10.2], [12, 12.4, 12.1]), { cell: '10.2 → 12.1 (+18.6%, noise 5%) **worse**', mark: 'worse' });
  assert.deepEqual(runTimeCell([12, 12.4, 12.1], [10, 10.5, 10.2]), { cell: '12.1 → 10.2 (-15.7%, noise 5%) **better**', mark: 'better' });
  // the medians apart, but a base's run as slow as the head's (an outlier of the runner): not marked
  assert.deepEqual(runTimeCell([10, 13, 10.2], [12, 12.4, 12.1]), { cell: '10.2 → 12.1 (+18.6%, noise 29%)', mark: null });
  // the runs apart, the change within the noise of a side
  assert.equal(runTimeCell([10, 10.1, 12.3], [12.31, 12.32, 12.33]).mark, null);
  // within the tolerance: not marked, however steady
  assert.deepEqual(runTimeCell([10, 10, 10], [10.8, 10.8, 10.8]), { cell: '10 → 10.8 (+8.0%, noise 0%)', mark: null });
  assert.equal(runTimeCell([10, 10, 10], [10.8, 10.8, 10.8], 0.05).mark, 'worse');
  // one run of a side: shown, never marked (the runs cannot agree)
  assert.deepEqual(runTimeCell([8.6], [20]), { cell: '8.6 → 20 (+132.6%)', mark: null });
  assert.equal(runTimeCell([10, 10.2], [20]).mark, null);
  // two runs each: the median the mean of both
  assert.deepEqual(runTimeCell([10, 10.2], [13, 13.2]), { cell: '10.1 → 13.1 (+29.7%, noise 2%) **worse**', mark: 'worse' });
  // a side without a run
  assert.deepEqual(runTimeCell([], [9]), { cell: '9', mark: null });
  assert.deepEqual(runTimeCell([null], [null]), { cell: '-', mark: null });
});

test('nextpnr update: a side\'s runs read together (r<k>/), the first run\'s size, the median of the times', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextpnr-update-'));
  try {
    const m = seconds => ({ part: 'xc3s250ecp132-4', slices: 40, luts: 70, ffs: 30, period: 5.1, seconds });
    const put = (r, board, name, v) => { fs.mkdirSync(path.join(dir, r, board), { recursive: true }); fs.writeFileSync(path.join(dir, r, board, `${name}.json`), `${JSON.stringify(v)}\n`); };
    put('r1', 'basys2-250', 'blinky', m(9)); put('r2', 'basys2-250', 'blinky', m(7)); put('r10', 'basys2-250', 'blinky', m(8.5));
    // a run that did not complete is left out; none that did: null
    put('r1', 'basys2-250', 'pong', m(20)); put('r2', 'basys2-250', 'pong', null);
    put('r1', 'atlys', 'uart', null);
    // another folder is not a run
    put('notes', 'atlys', 'gates', m(1));
    const s = readSide(dir);
    assert.deepEqual(Object.keys(s), ['blinky (basys2-250)', 'pong (basys2-250)', 'uart (atlys)']);
    assert.deepEqual(s['blinky (basys2-250)'], { ...m(8.5), runs: [9, 7, 8.5] });
    assert.deepEqual(s['pong (basys2-250)'], { ...m(20), runs: [20] });
    assert.equal(s['uart (atlys)'], null);
    assert.deepEqual(readSide(path.join(dir, 'none')), {});
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('nextpnr update: the table of the differences from both sides\' measurements, a change beyond the noise marked', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextpnr-update-'));
  try {
    const m = (slices, period, seconds) => ({ part: 'xc6slx16csg324-3', slices, luts: 100, ffs: 100, period, seconds });
    const put = (s, board, name, v) => { fs.mkdirSync(path.join(dir, s, board), { recursive: true }); fs.writeFileSync(path.join(dir, s, board, `${name}.json`), `${JSON.stringify(v)}\n`); };
    put('base', 'nexys3', 'blinky', m(53, 4.8, 8.6)); put('head', 'nexys3', 'blinky', m(53, 4.8, 9.0));
    put('base', 'nexys3', 'vga', m(52, 6.6, 8.0)); put('head', 'nexys3', 'vga', m(60, 5.0, 20));
    put('base', 'atlys', 'uart', m(52, 6.0, 17)); put('head', 'atlys', 'uart', null);
    // the board's examples in their order, board by board
    const base = readSide(path.join(dir, 'base')), head = readSide(path.join(dir, 'head'));
    assert.deepEqual(Object.keys(head), ['blinky (nexys3)', 'vga (nexys3)', 'uart (atlys)']);
    assert.equal(head['uart (atlys)'], null);
    const rows = nextpnrRows(base, head);
    const [blinky, vga, uart] = rows;
    // the run time within the tolerance (10 %): unmarked
    assert.deepEqual([blinky.worse, blinky.better], [[], []]);
    assert.equal(blinky.cells.seconds, '8.6 → 9 (+4.7%)');
    // one run of each side (an old artifact's layout): the run time never marked
    assert.deepEqual([vga.worse, vga.better], [['slices'], ['period']]);
    assert.equal(vga.cells.period, '6.600 → 5.000 (-24.2%) **better**');
    assert.equal(vga.cells.seconds, '8 → 20 (+150.0%)');
    assert.deepEqual(uart.worse, ['flow']);
    assert.equal(uart.cells.seconds, '17');
    assert.equal(uart.note, 'no result with the new nextpnr (it did with the base\'s)');
    const md = reportMarkdown({ summary: 'spartan6 0.1.3 → 0.1.4', rows, runUrl: 'https://example.invalid/run' });
    assert.ok(md.startsWith(`${MARK}\n## nextpnr update: spartan6 0.1.3 → 0.1.4\n`));
    assert.match(md, /size 5%, period 15%, run time 10% and its runs' noise/);
    assert.match(md, /Both sides of a board run in one job, on the same runner, alternated/);
    assert.doesNotMatch(md, /Not measured/);
    assert.match(md, /\*\*Summary\*\*: 2 worse \(vga \(nexys3\), uart \(atlys\)\); 1 better \(vga \(nexys3\)\)\./);
    assert.match(md, /\| design \| slices \| LUTs \| FFs \| min\. period \(ns\) \| run time \(s\) \| \|\n\|---\|---\|---\|---\|---\|---\|---\|\n\| blinky \(nexys3\) \| 53 \| 100 \| 100 \| 4\.800 \| 8\.6 → 9 \(\+4\.7%\) \|  \|/);
    assert.match(md, /never merged on green alone/);
    assert.match(md, /npm run check:open-flow/);
    assert.match(md, /\(Written by https:\/\/example\.invalid\/run, scripts\/nextpnr-update-report\.mjs\.\)\n$/);
    assert.match(reportMarkdown({ summary: '', rows: [] }), /No result \(see the run\)\./);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('nextpnr update: the report of a board\'s runs, both sides alternated in one job; the boards not measured said (#3030)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nextpnr-update-'));
  try {
    const m = (seconds, part = 'xc3s250ecp132-4') => ({ part, slices: 40, luts: 70, ffs: 30, period: 5.1, seconds });
    const put = (s, r, name, v) => { fs.mkdirSync(path.join(dir, s, `r${r}`, 'basys2-250'), { recursive: true }); fs.writeFileSync(path.join(dir, s, `r${r}`, 'basys2-250', `${name}.json`), `${JSON.stringify(v)}\n`); };
    // gates: slower on every run (worse); blinky: the medians +20 %, a run of the base's as slow (unmarked); pong: another part
    [[8, 10], [8.2, 10.1], [8.1, 9.9]].forEach(([b, h], i) => { put('base', i + 1, 'gates', m(b)); put('head', i + 1, 'gates', m(h)); });
    [[10, 12], [12.5, 12.1], [9.9, 11.9]].forEach(([b, h], i) => { put('base', i + 1, 'blinky', m(b)); put('head', i + 1, 'blinky', m(h)); });
    [[10, 20], [10, 20]].forEach(([b, h], i) => { put('base', i + 1, 'pong', m(b)); put('head', i + 1, 'pong', m(h, 'xc3s100ecp132-4')); });
    const rows = nextpnrRows(readSide(path.join(dir, 'base')), readSide(path.join(dir, 'head')));
    assert.deepEqual(rows.map(r => [r.name, r.worse, r.better, r.cells.seconds]), [
      ['gates (basys2-250)', ['seconds'], [], '8.1 → 10 (+23.5%, noise 2%) **worse**'],
      ['blinky (basys2-250)', [], [], '10 → 12 (+20.0%, noise 26%)'],
      ['pong (basys2-250)', [], [], '10 → 20 (+100.0%, noise 0%)'],
    ]);
    // the sizes and periods as before: equal, unmarked
    assert.deepEqual(rows[0].cells, { slices: '40', luts: '70', ffs: '30', period: '5.100', seconds: rows[0].cells.seconds });
    const out = path.join(dir, 'report.md');
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/nextpnr-update-report.mjs'), 'report', '--base', path.join(dir, 'base'), '--head', path.join(dir, 'head'),
      '--summary', 'spartan3e 1.0.0 → 1.1.0', '--boards', '["basys2-250"]', '--out', out], { encoding: 'utf8', env: { ...process.env, GITHUB_RUN_ID: '' } });
    assert.equal(r.status, 0, r.stderr);
    const md = fs.readFileSync(out, 'utf8');
    assert.match(md, /\*\*Summary\*\*: 1 worse \(gates \(basys2-250\)\); none better\./);
    assert.match(md, /\| gates \(basys2-250\) \| 40 \| 70 \| 30 \| 5\.100 \| 8\.1 → 10 \(\+23\.5%, noise 2%\) \*\*worse\*\* \|  \|/);
    assert.match(md, /\nNot measured \(unchanged package, the same code on both sides\): nexys3 \(spartan6\), atlys \(spartan6\)\.\n/);
    // no --boards (or an empty one, the check job of a base without it): every board measured
    for (const extra of [[], ['--boards', '']]) {
      const r2 = spawnSync(process.execPath, [path.join(ROOT, 'scripts/nextpnr-update-report.mjs'), 'report', '--base', path.join(dir, 'base'), '--head', path.join(dir, 'head'), '--summary', 'x', ...extra], { encoding: 'utf8' });
      assert.equal(r2.status, 0, r2.stderr);
      assert.doesNotMatch(r2.stdout, /Not measured/);
    }
    assert.match(reportMarkdown({ summary: 'x', rows, unmeasured: ['basys2-250'] }), /Not measured \(unchanged package, the same code on both sides\): basys2-250 \(spartan3e\)\./);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('nextpnr update: the workflow on pull requests that change a nextpnr package, GitHub\'s runners only', () => {
  const yml = read('.github/workflows/nextpnr-update.yml');
  assert.match(yml, /\non:\n  pull_request:\n    paths: \[package\.json, package-lock\.json, packages\/silinx-fpga\/package\.json\]\n/);
  assert.doesNotMatch(yml, /^\s*pull_request_target:/m);
  for (const m of yml.matchAll(/runs-on: (.+)/g)) assert.equal(m[1], 'ubuntu-latest');
  assert.match(yml, /\npermissions:\n  contents: read\n/);
  assert.match(yml, /gh pr edit .* --add-label "nextpnr update"/);
  assert.match(yml, /\n  measure:\n    needs: check\n    if: needs\.check\.outputs\.changed == 'true'\n/);
  assert.match(yml, /\n  report:\n    needs: \[check, measure\]\n    if: always\(\) && needs\.check\.outputs\.changed == 'true'\n/);
  // a job per board whose package changes and per shard, both sides in it (#3030): no side in the matrix; every board when
  // the check job does not say (a base's script without the output)
  assert.doesNotMatch(yml, /side: \[base, head\]|matrix\.side/);
  assert.match(yml, /\n      boards: \$\{\{ steps\.v\.outputs\.boards \}\}\n/);
  const boards = /\n {8}board: \$\{\{ fromJSON\(needs\.check\.outputs\.boards \|\| '(\[[^']+\])'\) \}\}\n {8}shard: \[([\d, ]+)\]\n/.exec(yml);
  assert.ok(boards, 'the matrix: the boards, the shards');
  assert.deepEqual(JSON.parse(boards[1]), Object.keys(BOARDS));
  assert.deepEqual(boards[2].split(', ').map(Number), Array.from({ length: SHARDS }, (_, i) => i + 1));
  assert.match(yml, /name: measure \(\$\{\{ matrix\.board \}\}, \$\{\{ matrix\.shard \}\}\/2\)/);
  // both sides alternated, three runs each or the pairs that fit the time limit, each into its own folder
  const loop = /- name: The examples, both sides alternately\n {8}env:\n {10}BOARD: \$\{\{ matrix\.board \}\}\n {10}SHARD: \$\{\{ matrix\.shard \}\}\n {8}run: \|\n((?: {10}.*\n)+)/.exec(yml);
  assert.ok(loop, 'the examples\' step');
  const sh = loop[1];
  assert.match(sh, /for run in 1 2 3; do\n/);
  assert.match(sh, /if \(\( run > 1 && SECONDS > (\d+) \)\); then .*break; fi/);
  const budget = Number(/SECONDS > (\d+)/.exec(sh)[1]), limit = Number(/\n  measure:[\s\S]*?\n    timeout-minutes: (\d+)\n/.exec(yml)[1]);
  assert.ok(budget / 60 + 15 <= limit, 'a last pair (up to about 10 minutes on an Atlys shard) and the setup within the time limit');
  assert.match(sh, /if \(\( run % 2 \)\); then order="base head"; else order="head base"; fi/);
  assert.match(sh, /dir="\$GITHUB_WORKSPACE"; \[ "\$side" = base \] && dir="\$RUNNER_TEMP\/base"/);
  assert.match(sh, /\(cd "\$dir" && node scripts\/nextpnr-update-report\.mjs measure "\$BOARD" "\$GITHUB_WORKSPACE\/out\/\$side\/r\$run" --shard "\$SHARD\/2"\)/);
  assert.match(yml, /name: nextpnr-measure-\$\{\{ matrix\.board \}\}-\$\{\{ matrix\.shard \}\}\n {10}path: out\n/);
  // the report: every job's artifact, both sides, and the boards measured
  assert.match(yml, /for d in results\/nextpnr-measure-\*\/; do for side in base head; do \[ ! -d "\$d\$side" \] \|\| cp -r "\$d\$side\/\." "results\/\$side\/"; done; done/);
  assert.match(yml, /--summary "\$SUMMARY" --boards "\$BOARDS" --out nextpnr-update\.md/);
  // the table: the job summary, the artifact, the comment (which may fail with a read-only token)
  assert.match(yml, /cat nextpnr-update\.md >> "\$GITHUB_STEP_SUMMARY"/);
  assert.match(yml, /name: nextpnr-update-report/);
  assert.match(yml, /- name: The pull request's comment\n\s+continue-on-error: true\n\s+run: node base\/scripts\/nextpnr-update-report\.mjs comment nextpnr-update\.md/);
});

test('nextpnr update: the steps with a writing token run the base\'s code; the base\'s packages checked before npm install (#1440)', () => {
  const yml = read('.github/workflows/nextpnr-update.yml');
  const j = {};
  let name = null;
  for (const line of yml.slice(yml.indexOf('\njobs:\n') + 7).split('\n')) {
    const m = /^  ([\w-]+):$/.exec(line);
    if (m) j[name = m[1]] = [];
    else if (name && /^ {4}/.test(line)) j[name].push(line);
  }
  assert.deepEqual(Object.keys(j), ['check', 'measure', 'report']);
  // the check job's base at the root, the pull request under head/, read as data (#3038); the report job's base under base/
  assert.deepEqual(checkoutLayout(j.check.join('\n')), { base: '', head: 'head', clean: true });
  const baseCheckout = /\n      - uses: actions\/checkout@[0-9a-f]{40} # v[\d.]+\n        with:\n          ref: \$\{\{ github\.event\.pull_request\.base\.sha \}\}\n          path: base\n          persist-credentials: false\n/;
  assert.match(`\n${j.report.join('\n')}\n`, baseCheckout, 'report');
  assert.ok(!j.check.some(l => /\bhead\/(?!package(-lock)?\.json\b)/.test(l.replace(/#.*$/, ''))), 'check: the pull request\'s package files only');
  assert.ok(!j.report.some(l => /(?<!base\/)\bscripts\//.test(l.replace(/#.*$/, ''))), 'report: the base\'s scripts only');
  for (const job of ['check', 'report'])
    assert.ok(!j[job].some(l => /uses: \.\/\.github\/actions\/setup|\bnpm (ci|install)\b/.test(l)), `${job}: no dependency installed`);
  assert.equal(j.report.filter(l => /uses: actions\/checkout@/.test(l)).length, 1, 'report: the base\'s checkout only');
  assert.ok(j.check.includes('        run: node scripts/nextpnr-update-report.mjs versions package.json package-lock.json head/package.json head/package-lock.json'));
  assert.ok(j.report.some(l => /^ {10}node base\/scripts\/nextpnr-update-report\.mjs report --base results\/base --head results\/head --summary "\$SUMMARY"/.test(l)));
  // the measure job: the check step before the install, the install into the base's side (a copy of the checkout) only
  const m = j.measure;
  const checked = m.indexOf('      - name: The base\'s packages checked');
  const copy = m.indexOf('      - name: The base\'s side');
  const install = m.findIndex(l => l.includes('npm install --no-save --ignore-scripts --workspace silinx-fpga --include-workspace-root $BASE_INSTALL'));
  assert.ok(checked > 0 && copy > checked && install > copy, 'the check step, the copy, then the install');
  assert.equal(m[copy + 1], '        run: cp -a . "$RUNNER_TEMP/base"');
  assert.equal(m.filter(l => /\bnpm install\b/.test(l.replace(/#.*$/, ''))).length, 1, 'one install');
  const into = m.slice(copy, install).join('\n');
  assert.match(into, /- name: The base's nextpnr\n {8}working-directory: \$\{\{ runner\.temp \}\}\/base\n/);
  const step = m.slice(checked, copy).join('\n');
  assert.match(step, /^        env:\n          BASE_INSTALL: \$\{\{ needs\.check\.outputs\.base \}\}\n/m);
  // bash's pattern accepts and refuses as installSpec does (bash's =~ is an extended regular expression, as JavaScript's here)
  const re = new RegExp(/\[\[ "\$s" =~ (\S+) \]\]/.exec(step)[1]);
  for (const s of [`${S3E}@1.0.0`, `${S6}@${url('0.1.3')}`]) assert.ok(re.test(s), s);
  for (const s of [`${S3E}@^1.0.0`, `${S3E}@latest`, `${S3E}@npm:evil@1`, `${S6}@${url('0.1.3').replace('pmnmalo', 'x')}`, `@yowasp/yosys@0.70.1258`, `${S6}@${url('0.1.3').replace('.tgz', '.sh')}`])
    assert.ok(!re.test(s), s);
  // the base's packages into the toolchain's workspace too, and the versions it resolves checked on both sides (#3156):
  // installed at the root only, npm kept the pull request's nested in packages/silinx-fpga/node_modules
  assert.ok(!m.some(l => /npm install(?!.*--workspace silinx-fpga --include-workspace-root)/.test(l.replace(/#.*$/, ''))), 'every install into the workspace');
  const resolved = m.indexOf('      - name: The nextpnr packages resolved');
  const examples = m.indexOf('      - name: The examples, both sides alternately');
  assert.ok(resolved > install && examples > resolved, 'the check after the install, before the examples');
  assert.equal(m.slice(resolved, examples).filter(l => !/^\s*#/.test(l)).join('\n'), [
    '      - name: The nextpnr packages resolved',
    '        env:',
    '          BASE_INSTALL: ${{ needs.check.outputs.base }}',
    '        run: |',
    `          node scripts/resolved-package.mjs packages/silinx-fpga ${PACKAGES.join(' ')}`,
    `          cd "$RUNNER_TEMP/base" && node scripts/resolved-package.mjs packages/silinx-fpga ${PACKAGES.join(' ')} $BASE_INSTALL`,
  ].join('\n'), 'both sides, every package');
  assert.ok(!yml.includes("require('./node_modules/"), 'no version read from the root\'s node_modules alone');
});

test('nextpnr update: Dependabot never groups the nextpnr packages; CLAUDE.md says such a pull request is never merged on green alone', () => {
  const npm = read('.github/dependabot.yml').split('\n  - package-ecosystem: ')[1];
  const patterns = /patterns: \[([^\]]+)\]/.exec(npm)[1].split(',').map(s => s.trim().replace(/^'(.*)'$/, '$1'));
  for (const name of PACKAGES) assert.ok(!patterns.some(p => (p.endsWith('*') ? name.startsWith(p.slice(0, -1)) : p === name)), name);
  assert.match(read('.github/dependabot.yml'), /nextpnr-update\.yml labels "nextpnr update"/);
  assert.match(read('CLAUDE.md'), /\*\*"nextpnr update" pull request\*\*[\s\S]{0,400}`nextpnr-update\.yml`/);
});
