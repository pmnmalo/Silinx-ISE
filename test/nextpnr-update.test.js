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
import { PACKAGES, FORK, MARK, BOARDS, METRICS, TOLERANCE, packageVersion, installSpec, nextpnrChanges, changeSummary, measurementOf, readSide, reportMarkdown } from '../scripts/nextpnr-update-report.mjs';
import { qualityRows, githubOutputLines } from '../scripts/yosys-update-report.mjs';
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
    assert.equal(fs.readFileSync(out, 'utf8'), `changed=true\nbase=${S6}@${url('0.1.3')}\nsummary=spartan6 0.1.3 → 0.1.4\n`);
    fs.rmSync(out);
    r = run([files[0], files[1], files[0], files[1]]);
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(out, 'utf8'), 'changed=false\nbase=\nsummary=\n');
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
    const rows = qualityRows(base, head, TOLERANCE, { metrics: METRICS, tool: 'nextpnr' });
    const [blinky, vga, uart] = rows;
    // the run time within its noise (25 %): unmarked
    assert.deepEqual([blinky.worse, blinky.better], [[], []]);
    assert.equal(blinky.cells.seconds, '8.6 → 9 (+4.7%)');
    assert.deepEqual([vga.worse, vga.better], [['slices', 'seconds'], ['period']]);
    assert.equal(vga.cells.period, '6.600 → 5.000 (-24.2%) **better**');
    assert.deepEqual(uart.worse, ['flow']);
    assert.equal(uart.note, 'no result with the new nextpnr (it did with the base\'s)');
    const md = reportMarkdown({ summary: 'spartan6 0.1.3 → 0.1.4', rows, runUrl: 'https://example.invalid/run' });
    assert.ok(md.startsWith(`${MARK}\n## nextpnr update: spartan6 0.1.3 → 0.1.4\n`));
    assert.match(md, /size 5%, period 15%, run time 25%/);
    assert.match(md, /\*\*Summary\*\*: 2 worse \(vga \(nexys3\), uart \(atlys\)\); 1 better \(vga \(nexys3\)\)\./);
    assert.match(md, /\| design \| slices \| LUTs \| FFs \| min\. period \(ns\) \| run time \(s\) \| \|\n\|---\|---\|---\|---\|---\|---\|---\|\n\| blinky \(nexys3\) \| 53 \| 100 \| 100 \| 4\.800 \| 8\.6 → 9 \(\+4\.7%\) \|  \|/);
    assert.match(md, /never merged on green alone/);
    assert.match(md, /npm run check:open-flow/);
    assert.match(md, /\(Written by https:\/\/example\.invalid\/run, scripts\/nextpnr-update-report\.mjs\.\)\n$/);
    assert.match(reportMarkdown({ summary: '', rows: [] }), /No result \(see the run\)\./);
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
  // both sides on each board measured
  assert.match(yml, /side: \[base, head\]/);
  assert.deepEqual(/\n {8}board: \[([\w, -]+)\]/.exec(yml)[1].split(', '), Object.keys(BOARDS));
  assert.match(yml, /run: node scripts\/nextpnr-update-report\.mjs measure "\$BOARD" out\n/);
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
  // the measure job: the check step before the install, the base's side only
  const m = j.measure;
  const checked = m.indexOf('      - name: The base\'s packages checked');
  const install = m.findIndex(l => l.includes('npm install --no-save --ignore-scripts --workspace silinx-fpga --include-workspace-root $BASE_INSTALL'));
  assert.ok(checked > 0 && install > checked, 'the check step before the install');
  const step = m.slice(checked, install).join('\n');
  assert.match(step, /^        if: matrix\.side == 'base'\n        env:\n          BASE_INSTALL: \$\{\{ needs\.check\.outputs\.base \}\}\n/m);
  // bash's pattern accepts and refuses as installSpec does (bash's =~ is an extended regular expression, as JavaScript's here)
  const re = new RegExp(/\[\[ "\$s" =~ (\S+) \]\]/.exec(step)[1]);
  for (const s of [`${S3E}@1.0.0`, `${S6}@${url('0.1.3')}`]) assert.ok(re.test(s), s);
  for (const s of [`${S3E}@^1.0.0`, `${S3E}@latest`, `${S3E}@npm:evil@1`, `${S6}@${url('0.1.3').replace('pmnmalo', 'x')}`, `@yowasp/yosys@0.70.1258`, `${S6}@${url('0.1.3').replace('.tgz', '.sh')}`])
    assert.ok(!re.test(s), s);
  // the base's packages into the toolchain's workspace too, and the versions it resolves checked on both sides (#3156):
  // installed at the root only, npm kept the pull request's nested in packages/silinx-fpga/node_modules
  assert.ok(!m.some(l => /npm install(?!.*--workspace silinx-fpga --include-workspace-root)/.test(l.replace(/#.*$/, ''))), 'every install into the workspace');
  const resolved = m.indexOf('      - name: The nextpnr packages resolved');
  const examples = m.indexOf('      - name: The examples');
  assert.ok(resolved > install && examples > resolved, 'the check after the install, before the examples');
  assert.equal(m.slice(resolved, examples).join('\n'), [
    '      - name: The nextpnr packages resolved',
    '        env:',
    "          BASE_INSTALL: ${{ matrix.side == 'base' && needs.check.outputs.base || '' }}",
    `        run: node scripts/resolved-package.mjs packages/silinx-fpga ${PACKAGES.join(' ')} $BASE_INSTALL`,
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
