// A Yosys update reviewed, not merged on green alone (#352): scripts/yosys-update-report.mjs (whether a pull
// request changes @yowasp/yosys, the size and speed with both Yosys versions, Yosys's test designs against
// their expectations, the table of the differences), the workflow that runs it (.github/workflows/yosys-update.yml:
// GitHub's runners only), Dependabot's configuration (.github/dependabot.yml) and CLAUDE.md's rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { yosysVersion, yosysChange, yosysTag, qualityRows, designQualities, mergeCorpus, reportMarkdown, readSide, DESIGN_SUBSET, MARK, PACKAGE } from '../scripts/yosys-update-report.mjs';
import { EXAMPLE_ORDER } from '../core/examples.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SCRIPT = path.join(ROOT, 'scripts/yosys-update-report.mjs');

test('yosys update: the version of @yowasp/yosys asked for and resolved; whether a pull request changes it', () => {
  const pkg = { dependencies: { '@yowasp/yosys': '0.68.1207', elkjs: '^0.12.0' } };
  const lock = { packages: { 'node_modules/@yowasp/yosys': { version: '0.68.1207' } } };
  assert.deepEqual(yosysVersion(pkg, lock), { spec: '0.68.1207', resolved: '0.68.1207' });
  assert.deepEqual(yosysVersion({}, {}), { spec: null, resolved: null });
  assert.deepEqual(yosysVersion(null, null), { spec: null, resolved: null });
  const base = yosysVersion(pkg, lock);
  assert.deepEqual(yosysChange(base, base), { changed: false, base: '0.68.1207', head: '0.68.1207' });
  assert.deepEqual(yosysChange(base, { spec: '0.70.1258', resolved: '0.70.1258' }), { changed: true, base: '0.68.1207', head: '0.70.1258' });
  // only the lock moved (a range resolved anew): a change
  assert.equal(yosysChange({ spec: '^0.68.1', resolved: '0.68.1' }, { spec: '^0.68.1', resolved: '0.68.2' }).changed, true);
  // only another package changed: none
  assert.equal(yosysChange(base, yosysVersion({ dependencies: { ...pkg.dependencies, express: '^4.22.4' } }, lock)).changed, false);
  assert.equal(yosysTag('0.70.1258'), 'v0.70');
  assert.equal(yosysTag('nonsense'), null);
  // the repository's own: package.json and the lock agree
  const own = yosysVersion(JSON.parse(read('package.json')), JSON.parse(read('package-lock.json')));
  assert.equal(own.spec, own.resolved);
});

test('yosys update: the "versions" command writes the step\'s outputs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-yosys-update-'));
  const w = (f, x) => { fs.writeFileSync(path.join(dir, f), JSON.stringify(x)); return path.join(dir, f); };
  const args = [w('bp.json', { dependencies: { [PACKAGE]: '0.68.1207' } }), w('bl.json', { packages: { [`node_modules/${PACKAGE}`]: { version: '0.68.1207' } } }),
    w('hp.json', { dependencies: { [PACKAGE]: '0.70.1258' } }), w('hl.json', { packages: { [`node_modules/${PACKAGE}`]: { version: '0.70.1258' } } })];
  const out = path.join(dir, 'out.txt');
  const r = spawnSync(process.execPath, [SCRIPT, 'versions', ...args], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '@yowasp/yosys: 0.68.1207 → 0.70.1258\n');
  assert.equal(fs.readFileSync(out, 'utf8'), 'changed=true\nbase=0.68.1207\nhead=0.70.1258\n');
  const same = spawnSync(process.execPath, [SCRIPT, 'versions', args[0], args[1], args[0], args[1]], { encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: '' } });
  assert.equal(same.stdout, '@yowasp/yosys: 0.68.1207 → 0.68.1207 (unchanged)\n');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('yosys update: size and speed with both Yosys versions, a change beyond the noise marked', () => {
  const q = (slices, luts, ffs, period, part = 'xc3s250ecp132-4') => ({ part, slices, luts, ffs, period });
  const rows = qualityRows(
    { same: q(10, 20, 5, 4.5), larger: q(100, 200, 50, 10), faster: q(100, 200, 50, 10), noise: q(100, 200, 50, 10), comb: q(10, 20, 0, null), gone: q(1, 2, 3, 4), moved: q(1, 2, 3, 4) },
    { same: q(10, 20, 5, 4.5), larger: q(110, 200, 50, 10), faster: q(100, 200, 50, 8), noise: q(103, 196, 50, 11), comb: q(10, 20, 0, null), gone: null, moved: q(1, 2, 3, 4, 'xc3s500efg320-4'), fresh: q(5, 6, 7, 8) });
  const by = Object.fromEntries(rows.map(r => [r.name, r]));
  assert.deepEqual(by.same.cells, { slices: '10', luts: '20', ffs: '5', period: '4.500' });
  assert.deepEqual([by.same.worse, by.same.better, by.same.note], [[], [], '']);
  assert.equal(by.larger.cells.slices, '100 → 110 (+10.0%) **worse**');
  assert.deepEqual(by.larger.worse, ['slices']);
  assert.equal(by.faster.cells.period, '10.000 → 8.000 (-20.0%) **better**');
  assert.deepEqual(by.faster.better, ['period']);
  // within the tolerance (5% size, 15% critical path): shown, unmarked
  assert.deepEqual([by.noise.cells.slices, by.noise.cells.luts, by.noise.cells.period], ['100 → 103 (+3.0%)', '200 → 196 (-2.0%)', '10.000 → 11.000 (+10.0%)']);
  assert.deepEqual([by.noise.worse, by.noise.better], [[], []]);
  assert.equal(by.comb.cells.period, '-');
  // the flow no longer completes: worse
  assert.deepEqual(by.gone.worse, ['flow']);
  assert.match(by.gone.note, /no result with the new Yosys/);
  assert.match(by.fresh.note, /a result with the new Yosys only/);
  assert.match(by.moved.note, /built on the xc3s500efg320-4 \(the base's on the xc3s250ecp132-4\): not compared/);
  assert.deepEqual(by.moved.worse, []);
  assert.deepEqual(designQualities({ a: { quality: q(1, 2, 3, 4) }, b: { flow: 'fail: x' } }, ['a', 'b', 'c']), { a: q(1, 2, 3, 4), b: null, c: null });
});

test('yosys update: the corpus\'s shards together, a shard without a result named', () => {
  const s1 = { tag: 'v0.68', results: { 'a.v:a': 'pass', 'a.v:a (synth)': 'mismatch: x' }, expected: { 'a.v:a (synth)': 'pass' }, regress: ['a.v:a (synth)'], fixed: [], fresh: [], timedOut: [], newWarnings: ['a.v: 1: w'], goneWarnings: [] };
  const s2 = { tag: 'v0.68', results: { 'b.v:b': 'pass' }, expected: { 'b.v:b': 'mismatch: y' }, regress: [], fixed: ['b.v:b'], fresh: ['n.v:n'], timedOut: ['t.v'], newWarnings: [], goneWarnings: ['b.v: 2: v'] };
  const m = mergeCorpus({ 1: s1, 2: s2 });
  assert.deepEqual([m.tag, m.shards, m.missing, m.regress, m.fixed, m.fresh, m.timedOut, m.newWarnings, m.goneWarnings],
    ['v0.68', [1, 2], [], ['a.v:a (synth)'], ['b.v:b'], ['n.v:n'], ['t.v'], ['a.v: 1: w'], ['b.v: 2: v']]);
  assert.deepEqual(Object.keys(m.results), ['a.v:a', 'a.v:a (synth)', 'b.v:b']);
  assert.deepEqual(mergeCorpus({ 1: s1, 2: null }).missing, [2]);
});

test('yosys update: the table of the differences', () => {
  const q = (slices, period) => ({ part: 'xc3s250ecp132-4', slices, luts: 2 * slices, ffs: slices, period });
  const examples = qualityRows({ blinky: q(86, 7.3), gates: q(1, null) }, { blinky: q(95, 7.3), gates: q(1, null) });
  const designs = qualityRows({ serv: q(191, 13.2) }, { serv: q(180, 13.2) });
  const corpus = mergeCorpus({ 1: { tag: 'v0.68', results: { 'a.v:a': 'pass', 'a.v:a (synth)': 'mismatch: x' }, expected: { 'a.v:a (synth)': 'pass' }, regress: ['a.v:a (synth)'], fixed: [], fresh: [], timedOut: [], newWarnings: [], goneWarnings: [] }, 2: null });
  const md = reportMarkdown({ baseVersion: '0.68.1207', headVersion: '0.70.1258', examples, designs, corpus, testsPin: { tag: 'v0.68', commit: 'x' }, runUrl: 'https://github.com/o/r/actions/runs/1' });
  assert.ok(md.startsWith(`${MARK}\n## Yosys update: @yowasp/yosys 0.68.1207 → 0.70.1258\n`));
  assert.match(md, /\*\*Summary\*\*: 1 worse \(blinky\); 1 better \(serv\); Yosys's test designs: 1 regression\(s\), 0 newly passing, 0 new warning\(s\), shard\(s\) 2 without a result\./);
  assert.match(md, /### Examples \(Basys2-250\)\n\n\| design \| slices \| LUTs \| FFs \| critical path \(ns\) \| \|\n\|---\|---\|---\|---\|---\|---\|\n\| blinky \| 86 → 95 \(\+10\.5%\) \*\*worse\*\* \| 172 → 190 \(\+10\.5%\) \*\*worse\*\* \| 86 → 95 \(\+10\.5%\) \*\*worse\*\* \| 7\.300 \|  \|\n\| gates \| 1 \| 2 \| 1 \| - \|  \|/);
  assert.match(md, /\| serv \| 191 → 180 \(-5\.8%\) \*\*better\*\* \|/);
  assert.match(md, /- Yosys reading the source: pass 1, mismatch 0, unsupported 0, error 0\n- Silinx's open synthesis: pass 0, mismatch 1, unsupported 0, error 0\n- shard\(s\) 2: no result/);
  assert.match(md, /\*\*Regressions\*\* \(1: expected to pass\):\n\n- `a\.v:a \(synth\)`: mismatch: x/);
  // the test designs pinned at the old Yosys: to update in the same pull request
  assert.match(md, /\*\*To do in this pull request\*\*: test\/corpus\/expected\.json \(and warnings\.json\) belong to the Yosys test designs pinned by `YOSYS_TESTS_PIN` \(scripts\/fetch-yosys-tests\.mjs, v0\.68\); the new Yosys is v0\.70\. Pin v0\.70 .*refs\/tags\/v0\.70`.*`npm run fetch:yosys-tests && npm run test:corpus -- --update`/);
  assert.match(md, /never merged on green alone \(CLAUDE\.md, Integration\).*test\/synth-quality\.test\.js \(the size budgets\) and test\/synth-diff\*\.test\.js.*Actions ▸ Quality ▸ Run workflow.*docs\/QUALITY\.md will move/);
  assert.match(md, /\(Written by https:\/\/github\.com\/o\/r\/actions\/runs\/1, scripts\/yosys-update-report\.mjs\.\)\n$/);
  // a Yosys of the same release as the test designs: nothing to do; no corpus result
  const same = reportMarkdown({ baseVersion: '0.68.1', headVersion: '0.68.2', examples: [], designs: [], corpus: null, testsPin: { tag: 'v0.68' } });
  assert.ok(!same.includes('To do in this pull request'));
  assert.match(same, /none worse; none better; Yosys's test designs: no result\./);
  assert.match(same, /### Examples \(Basys2-250\)\n\nNo result \(see the run\)\./);
  // long lists are cut, the artifact has them all
  const many = mergeCorpus({ 1: { tag: 'v0.68', results: {}, expected: {}, regress: Array.from({ length: 35 }, (_, i) => `f${i}.v:m`), fixed: [], fresh: [], timedOut: [], newWarnings: [], goneWarnings: [] }, 2: null });
  assert.match(reportMarkdown({ baseVersion: 'a', headVersion: 'b', examples: [], designs: [], corpus: many }), /- `f29\.v:m`: no result\n- … and 5 more \(the artifact has them all\)/);
});

test('yosys update: the report from the jobs\' artifacts (a side, the corpus\'s shards)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-yosys-report-'));
  const q = { part: 'xc3s250ecp132-4', slices: 86, luts: 171, ffs: 97, period: 7.309 };
  for (const side of ['base', 'head']) {
    fs.mkdirSync(path.join(dir, side, 'examples'), { recursive: true });
    fs.writeFileSync(path.join(dir, side, 'examples', 'blinky.json'), JSON.stringify(side === 'base' ? q : { ...q, slices: 80 }));
    fs.writeFileSync(path.join(dir, side, 'designs.json'), JSON.stringify({ serv: { quality: q }, other: { quality: q } }));
  }
  const side = readSide(path.join(dir, 'head'));
  assert.deepEqual(Object.keys(side.examples), EXAMPLE_ORDER);
  assert.equal(side.examples.blinky.slices, 80);
  assert.equal(side.examples.gates, null);
  assert.deepEqual(Object.keys(side.designs), DESIGN_SUBSET);
  fs.mkdirSync(path.join(dir, 'corpus'));
  fs.writeFileSync(path.join(dir, 'corpus', 'shard-1.json'), JSON.stringify({ tag: 'v0.68', results: {}, expected: {}, regress: [], fixed: [], fresh: [], timedOut: [], newWarnings: [], goneWarnings: [] }));
  const r = spawnSync(process.execPath, [SCRIPT, 'report', '--base', path.join(dir, 'base'), '--head', path.join(dir, 'head'), '--corpus', path.join(dir, 'corpus'), '--base-version', '0.68.1', '--head-version', '0.68.2', '--out', path.join(dir, 'out.md')],
    { encoding: 'utf8', env: { ...process.env, GITHUB_RUN_ID: '' } });
  assert.equal(r.status, 0, r.stderr);
  const md = fs.readFileSync(path.join(dir, 'out.md'), 'utf8');
  assert.match(md, /\| blinky \| 86 → 80 \(-7\.0%\) \*\*better\*\* \|/);
  assert.match(md, /\| gates \| - \| - \| - \| - \| no result with either Yosys \|/);
  assert.match(md, /shard\(s\) 2: no result/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('yosys update: the design corpus\'s subset: designs of the manifest whose flow completes, fast enough', () => {
  const manifest = JSON.parse(read('test/designs-corpus/manifest.json'));
  const expected = JSON.parse(read('test/designs-corpus/expected.json'));
  const times = JSON.parse(read('test/designs-corpus/times.json')).ci || {};
  const names = manifest.designs.map(d => d.name);
  let total = 0;
  for (const n of DESIGN_SUBSET) {
    assert.ok(names.includes(n), n);
    assert.ok(expected[n]?.quality, `${n}: its flow completes (a recorded quality)`);
    // run.mjs --filter takes a name that contains another's: each picks itself only
    assert.deepEqual(names.filter(x => x === n || x.includes(n)), [n], n);
    total += times[n] ? (times[n].frontend || 0) + times[n].synth + times[n].flow : 0;
  }
  // VHDL and Verilog, CPUs and benchmarks
  const lang = n => manifest.designs.find(d => d.name === n).files.some(f => /\.vhdl?$/.test(f));
  assert.ok(DESIGN_SUBSET.some(lang) && DESIGN_SUBSET.some(n => !lang(n)));
  // the stages run (frontend, synth, flow) under 40 min of one job on CI (4 jobs in the workflow)
  assert.ok(total < 40 * 60000, `${(total / 60000).toFixed(0)} min`);
  const r = spawnSync(process.execPath, [SCRIPT, 'subset'], { encoding: 'utf8' });
  assert.equal(r.stdout.trim(), DESIGN_SUBSET.join(','));
});

test('yosys update: the workflow on pull requests that change @yowasp/yosys, GitHub\'s runners only', () => {
  const yml = read('.github/workflows/yosys-update.yml');
  assert.match(yml, /\non:\n  pull_request:\n    paths: \[package\.json, package-lock\.json\]\n/);
  // no pull_request_target (a fork's code never gets a writing token), never the self-hosted runner
  assert.doesNotMatch(yml, /^\s*pull_request_target:/m);
  assert.ok(!/runs-on: .*self-hosted/.test(yml));
  for (const m of yml.matchAll(/runs-on: (.+)/g)) assert.equal(m[1], 'ubuntu-latest');
  assert.match(yml, /\npermissions:\n  contents: read\n/);
  // the check of the diff: the base's versions against the pull request's; the label
  assert.match(yml, /git show \$\{\{ github\.event\.pull_request\.base\.sha \}\}:package\.json/);
  assert.match(yml, /node scripts\/yosys-update-report\.mjs versions /);
  assert.match(yml, /gh pr edit .* --add-label "yosys update"/);
  for (const job of ['measure', 'corpus']) assert.match(yml, new RegExp(`\\n  ${job}:\\n    needs: check\\n    if: needs\\.check\\.outputs\\.changed == 'true'\\n`), job);
  assert.match(yml, /\n  report:\n    needs: \[check, measure, corpus\]\n    if: always\(\) && needs\.check\.outputs\.changed == 'true'\n/);
  // both sides, the base's Yosys installed over the same code
  assert.match(yml, /side: \[base, head\]/);
  assert.match(yml, /if: matrix\.side == 'base'\n\s+run: \|\n\s+npm install --no-save --ignore-scripts @yowasp\/yosys@\$\{\{ needs\.check\.outputs\.base \}\}/);
  // every example, in their order, through the open flow with --quality
  const ex = /for ex in ([\w ]+); do/.exec(yml)[1].split(' ');
  assert.deepEqual(ex, EXAMPLE_ORDER);
  assert.match(yml, /open-flow\.mjs "examples\/\$ex" .* --quality "out\/examples\/\$ex\.json"/);
  assert.match(yml, /run\.mjs --filter "\$\(node scripts\/yosys-update-report\.mjs subset\)" --stages frontend,synth,flow .* --json out\/designs\.json/);
  // the corpus sharded as the nightly's
  const nightly = read('.github/workflows/nightly.yml');
  assert.equal(/shard: (\[[\d, ]+\])/.exec(yml)[1], /shard: (\[[\d, ]+\])/.exec(nightly)[1]);
  assert.match(yml, /npm run test:corpus -- --jobs 4 --shard \$\{\{ matrix\.shard \}\}\/2 --json out\/shard-\$\{\{ matrix\.shard \}\}\.json/);
  // the table: the job summary, the artifact, and the comment (which may fail with a read-only token)
  assert.match(yml, /cat yosys-update\.md >> "\$GITHUB_STEP_SUMMARY"/);
  assert.match(yml, /name: yosys-update-report/);
  assert.match(yml, /- name: The pull request's comment\n\s+continue-on-error: true\n\s+run: node scripts\/yosys-update-report\.mjs comment yosys-update\.md/);
  const report = yml.slice(yml.indexOf('\n  report:\n'));
  assert.match(report, /pull-requests: write/);
});

test('yosys update: Dependabot weekly, npm grouped but for Yosys, the majors with issues of their own ignored', () => {
  const y = read('.github/dependabot.yml');
  const [npm, actions] = y.split('\n  - package-ecosystem: ').slice(1);
  assert.match(npm, /^npm\n/);
  assert.match(actions, /^github-actions\n/);
  for (const part of [npm, actions]) {
    assert.match(part, /directory: \/\n/);
    assert.match(part, /interval: weekly/);
    assert.match(part, /open-pull-requests-limit: [1-3]\n/);
    assert.match(part, /labels: \[dependencies\]/);
  }
  // one group of minor / patch updates, without Yosys (never grouped: a pull request of its own)
  const patterns = /patterns: \[([^\]]+)\]/.exec(npm)[1].split(',').map(s => s.trim());
  const pkg = JSON.parse(read('package.json'));
  assert.deepEqual(patterns.sort(), Object.keys({ ...pkg.dependencies, ...pkg.devDependencies }).filter(n => n !== PACKAGE).sort());
  assert.ok(!npm.includes('yowasp'));
  assert.match(npm, /update-types: \[minor, patch\]/);
  assert.match(actions, /patterns: \['\*'\]/);
  // the ignored updates, each with its issue
  assert.match(npm, /# CodeMirror 5 to 6.*\(#349\)\n\s+- dependency-name: codemirror\n\s+update-types: \[version-update:semver-major\]/);
  // Express 5 since #350: its majors are no longer ignored
  assert.match(npm, /# Express: on 5 since #350/);
  assert.ok(!/dependency-name: express/.test(npm));
  // elkjs no longer ignored (0.12, #351)
  assert.ok(!/dependency-name: elkjs/.test(npm));
  assert.match(read('.github/dependabot.yml'), /# elkjs is no longer ignored \(0\.9 to 0\.12 in #351\)/);
});

test('yosys update: CLAUDE.md says a "yosys update" pull request is never merged on green alone', () => {
  const md = read('CLAUDE.md');
  assert.match(md, /"yosys update" pull request is never merged on green alone/);
  assert.match(md, /Actions ▸ Quality ▸ Run workflow/);
});
