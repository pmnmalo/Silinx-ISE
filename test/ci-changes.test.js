// CI on every push and pull request, its long jobs only when more than the documentation changed, and
// one required check, ci-ok (#409): scripts/ci-changes.mjs and .github/workflows/ci.yml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BUILD_INPUTS, documentation, decide, changedFiles, interfaceFile, decideUi } from '../scripts/ci-changes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SCRIPT = path.join(ROOT, 'scripts/ci-changes.mjs');

test('ci changes: documentation, apart from the Markdown files a build reads', () => {
  for (const f of ['README.md', 'ONBOARDING.md', 'CLAUDE.md', 'docs/QUALITY.md', 'docs/img/x.png', 'test/corpus/README.md', 'examples/vga/README.MD',
    'changes/README.md', 'changes/519-changelog-fragments.md'])
    assert.ok(documentation(f), f);
  for (const f of ['CHANGELOG.md', 'THIRD-PARTY-NOTICES.md', '.github/release-notes.md', 'core/ucf.js', 'test/docs.test.js',
    '.github/workflows/ci.yml', 'package.json', 'NOTICE', 'web/js/i18n.js', 'docsx/a.js'])
    assert.ok(!documentation(f), f);
});

test('ci changes: the decision and its reason', () => {
  assert.deepEqual(decide(null), { code: true, reason: 'the changed files are not known (a new branch, or the base is not in the history)' });
  assert.deepEqual(decide(['README.md', 'docs/QUALITY.md']), { code: false, reason: 'only documentation changed (2 file(s)): the unit tests only' });
  assert.deepEqual(decide([]), { code: false, reason: 'only documentation changed (0 file(s)): the unit tests only' });
  assert.deepEqual(decide(['README.md', 'CHANGELOG.md']), { code: true, reason: '1 file(s) besides the documentation changed: CHANGELOG.md' });
  assert.deepEqual(decide(['a.js', 'b.js', 'c.js', 'd.js', 'e.js', 'f.js', 'g.md']),
    { code: true, reason: '6 file(s) besides the documentation changed: a.js, b.js, c.js, d.js, e.js, …' });
});

test('ci changes: the interface, for the classic interface\'s and the other browsers\' UI tests on a pull request (#573)', () => {
  for (const f of ['web/js/app.js', 'web/index.html', 'web/css/classic.css', 'test/ui/undo.test.js', 'test/ui/harness.js', 'scripts/test-browsers.mjs',
    'scripts/build-standalone.mjs', 'package.json', 'package-lock.json', '.github/workflows/ci.yml', '.github/actions/setup/action.yml'])
    assert.ok(interfaceFile(f), f);
  for (const f of ['core/synth-open.js', 'core/fpga/route.js', 'server/ise.js', 'test/synth-open.test.js', 'scripts/ci-changes.mjs', 'examples/vga/vga.vhd',
    'changes/573-ci-parts.md', 'README.md', 'webx/a.js', 'test/uix.test.js'])
    assert.ok(!interfaceFile(f), f);
  assert.deepEqual(decideUi(null), { ui: true, reason: 'the changed files are not known' });
  assert.deepEqual(decideUi(['core/synth-open.js', 'test/synth-open.test.js', 'changes/1-x.md']),
    { ui: false, reason: 'the interface did not change: on a pull request, the modern interface in Chrome only' });
  assert.deepEqual(decideUi([]), { ui: false, reason: 'the interface did not change: on a pull request, the modern interface in Chrome only' });
  assert.deepEqual(decideUi(['core/a.js', 'web/js/a.js', 'web/js/b.js', 'web/js/c.js', 'web/js/d.js', 'web/js/e.js', 'test/ui/f.test.js']),
    { ui: true, reason: '6 file(s) of the interface changed: web/js/a.js, web/js/b.js, web/js/c.js, web/js/d.js, web/js/e.js, …' });
});

test('ci changes: the files a build reads are the Markdown files the scripts read', () => {
  const read$ = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'scripts')).filter(f => f.endsWith('.mjs')))
    for (const m of read(`scripts/${f}`).matchAll(/readFileSync\(path\.join\(\w+, '([^']+\.md)'\)/g)) read$.add(m[1]);
  assert.deepEqual([...read$].sort(), [...BUILD_INPUTS].sort());
});

test('ci changes: the files changed in a git history; a base not in it, or none, is unknown', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ci-changes-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...a) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...a], { cwd: dir, encoding: 'utf8' }).trim();
  git('init', '-q');
  fs.writeFileSync(path.join(dir, 'README.md'), 'a\n');
  git('add', '.'); git('commit', '-q', '-m', '1');
  const first = git('rev-parse', 'HEAD');
  fs.mkdirSync(path.join(dir, 'docs'));
  fs.writeFileSync(path.join(dir, 'docs', 'x.md'), 'x\n');
  fs.writeFileSync(path.join(dir, 'README.md'), 'b\n');
  git('add', '.'); git('commit', '-q', '-m', '2');
  const second = git('rev-parse', 'HEAD');
  assert.deepEqual(changedFiles(first, 'HEAD', dir), ['README.md', 'docs/x.md']);
  fs.writeFileSync(path.join(dir, 'a.js'), '1\n');
  git('add', '.'); git('commit', '-q', '-m', '3');
  assert.deepEqual(changedFiles(second, 'HEAD', dir), ['a.js']);
  assert.deepEqual(changedFiles('HEAD^1', 'HEAD', dir), ['a.js'], "a pull request's merge commit against its first parent");
  assert.equal(changedFiles('0'.repeat(40), 'HEAD', dir), null, 'a new branch');
  assert.equal(changedFiles('', 'HEAD', dir), null);
  assert.equal(changedFiles('f'.repeat(40), 'HEAD', dir), null, 'not in the history (a forced push)');
  // the command line: its output for GitHub Actions
  const out = path.join(dir, 'out');
  for (const [base, head, code, line] of [[first, second, 'false', /^documentation: only documentation changed/], [second, 'HEAD', 'true', /^code: 1 file\(s\) besides the documentation changed: a\.js$/]]) {
    fs.writeFileSync(out, '');
    const r = spawnSync(process.execPath, [SCRIPT, base, head], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: '' } });
    assert.equal(r.status, 0, r.stderr);
    const [first$, second$] = r.stdout.trim().split('\n');
    assert.match(first$, line);
    assert.equal(second$, 'no interface: the interface did not change: on a pull request, the modern interface in Chrome only');
    assert.equal(r.stderr, '', 'no warnings');
    assert.equal(fs.readFileSync(out, 'utf8'), `code=${code}\nui=false\n`);
  }
  // a change of the interface (#573); an unknown base: everything
  fs.mkdirSync(path.join(dir, 'web'));
  fs.writeFileSync(path.join(dir, 'web', 'app.js'), '1\n');
  git('add', '.'); git('commit', '-q', '-m', '4');
  for (const [base, ui] of [['HEAD^1', /^interface: 1 file\(s\) of the interface changed: web\/app\.js$/], ['f'.repeat(40), /^interface: the changed files are not known$/]]) {
    fs.writeFileSync(out, '');
    const r = spawnSync(process.execPath, [SCRIPT, base, 'HEAD'], { cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_OUTPUT: out, GITHUB_STEP_SUMMARY: '' } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout.trim().split('\n')[1], ui);
    assert.equal(fs.readFileSync(out, 'utf8'), 'code=true\nui=true\n');
  }
});

// the jobs of a workflow and the lines of each (two-space keys under jobs:)
function jobs(yml) {
  const body = yml.slice(yml.indexOf('\njobs:\n') + 7);
  const out = {};
  let name = null;
  for (const line of body.split('\n')) {
    const m = line.match(/^  ([\w-]+):$/);
    if (m) out[name = m[1]] = [];
    else if (name && /^    /.test(line)) out[name].push(line);
  }
  return out;
}

test('CI: on every push to main and pull request; the long jobs gated on the change; ci-ok needs them all', () => {
  const ci = read('.github/workflows/ci.yml');
  assert.doesNotMatch(ci, /paths(-ignore)?:/, 'no path filters: ci-ok is always reported');
  assert.match(ci, /^on:\n  push:\n    branches: \[main\]\n  pull_request:\n/m);
  assert.ok(!fs.existsSync(path.join(ROOT, '.github/workflows/docs.yml')), 'docs.yml folded into CI');
  const j = jobs(ci);
  assert.deepEqual(Object.keys(j), ['changes', 'unit', 'ui', 'webkit-standalone', 'release-zip', 'browsers', 'os', 'private-data-history', 'dependency-review', 'ci-ok']);
  assert.match(j.changes.join('\n'), /fetch-depth: 0[\s\S]*node scripts\/ci-changes\.mjs "\$BASE" HEAD[\s\S]*BASE: \$\{\{ github\.event_name == 'pull_request' && 'HEAD\^1' \|\| github\.event\.before \}\}/);
  // the unit tests always (the documentation's tests are among them), the others only for code
  assert.ok(!j.unit.some(l => /needs:|^    if:/.test(l)), 'unit: not gated');
  // in three parts of about the same time (#573), each Linux part's file times uploaded
  const unit = j.unit.join('\n');
  assert.match(unit, /^        shard: \[1, 2, 3\]$/m);
  assert.match(unit, /node scripts\/test-shard\.mjs "\$SHARD\/3"\n\s+--test-reporter=tap --test-reporter-destination=stdout\n\s+--test-reporter=\.\/scripts\/test-file-times\.mjs --test-reporter-destination=stdout\n\s+--test-reporter=\.\/scripts\/test-times-reporter\.mjs --test-reporter-destination=test-times\.json\n\s+shell: bash/);
  assert.match(unit, /- if: always\(\) && matrix\.os == 'ubuntu-latest'\n\s+uses: actions\/upload-artifact@.+\n\s+with:\n\s+name: unit-times-\$\{\{ matrix\.shard \}\}\n\s+path: test-times\.json\n/);
  assert.doesNotMatch(unit, /--test-shard=/, "node's own shards split by order, not time");
  // a pull request: the modern interface always, the classic one and the other browsers when the interface changed (#573)
  assert.match(ci, /^      ui: \$\{\{ steps\.changes\.outputs\.ui \}\}$/m);
  assert.ok(j.ui.includes(`        interface: \${{ fromJSON((github.event_name != 'pull_request' || needs.changes.outputs.ui == 'true') && '["modern", "classic"]' || '["modern"]') }}`));
  assert.ok(j.browsers.includes(`    if: needs.changes.outputs.code == 'true' && (github.event_name != 'pull_request' || needs.changes.outputs.ui == 'true')`));
  for (const t of ['docs', 'changelog', 'quality-page']) assert.ok(fs.existsSync(path.join(ROOT, `test/${t}.test.js`)), t);
  for (const job of ['ui', 'webkit-standalone', 'release-zip', 'browsers', 'os']) {
    assert.ok(j[job].includes('    needs: changes'), job);
    assert.ok(j[job].some(l => l.startsWith("    if: needs.changes.outputs.code == 'true'")), job);
  }
  // the security checks (#498): the history scan on every run (#555: HEAD's history, on a pull request
  // too, before its lines reach main), the dependency review on a pull request; on the event, not on the
  // change (a documentation-only push adds lines to the history too)
  const hist = j['private-data-history'].join('\n');
  assert.ok(!j['private-data-history'].some(l => /^    if:/.test(l)), 'private-data-history: on every run');
  assert.match(hist, /fetch-depth: 0[\s\S]*node scripts\/check-private-data\.mjs --history/);
  assert.doesNotMatch(hist, /npm ci/, 'only node built-ins');
  const dep = j['dependency-review'].join('\n');
  assert.match(dep, /^    if: github\.event_name == 'pull_request'$/m);
  assert.match(dep, /uses: actions\/dependency-review-action@[0-9a-f]{40} # v\d+\.\d+\.\d+\n\s+with:\n\s+fail-on-severity: moderate\n\s+comment-summary-in-pr: never/);
  assert.doesNotMatch(dep, /allow-licenses|deny-licenses/, 'the licences are tracked by scripts/third-party.mjs');
  assert.match(dep, /^    permissions:\n      contents: read$/m);
  for (const job of ['private-data-history', 'dependency-review']) assert.ok(!j[job].some(l => /needs:/.test(l)), `${job}: on the event, not the change`);
  // ci-ok: every other job, run always, red only on a failure or a cancellation
  const ok = j['ci-ok'].join('\n');
  assert.match(ok, /^    if: always\(\)$/m);
  assert.equal(ok.match(/^    needs: \[(.*)\]$/m)[1], Object.keys(j).filter(n => n !== 'ci-ok').join(', '));
  assert.match(ok, /- if: contains\(needs\.\*\.result, 'failure'\) \|\| contains\(needs\.\*\.result, 'cancelled'\)\n\s+run: exit 1/);
  // the required check's name in the rules (CLAUDE.md, ONBOARDING.md)
  for (const f of ['CLAUDE.md', 'ONBOARDING.md']) assert.match(read(f), /`ci-ok`/, f);
});

test('CodeQL (#498): a workflow of its own, on pull requests, pushes to main and weekly; its token writes the findings only; its actions pinned', () => {
  const yml = read('.github/workflows/codeql.yml');
  assert.match(yml, /^on:\n  push:\n    branches: \[main\]\n  pull_request:\n  schedule:\n    - cron: '[^']+'/m);
  assert.match(yml, /^concurrency:\n  group: codeql-/m);
  assert.match(yml, /^permissions:\n  contents: read\n/m, 'a read-only token at the top');
  const j = jobs(yml);
  assert.deepEqual(Object.keys(j), ['analyze']);
  const a = j.analyze.join('\n');
  assert.match(a, /^    permissions:\n      contents: read\n      security-events: write\s*(#.*)?\n      actions: read\s*(#.*)?\n/m);
  assert.match(a, /uses: github\/codeql-action\/init@[0-9a-f]{40} # v\d+\.\d+\.\d+\n[\s\S]*languages: javascript-typescript\n\s+build-mode: none\n/);
  const init = a.match(/codeql-action\/init@(.+)/)[1], analyze = a.match(/codeql-action\/analyze@(.+)/)[1];
  assert.match(init, /^[0-9a-f]{40} # v\d+\.\d+\.\d+$/, 'pinned by commit, its version in a comment (#414)');
  assert.equal(init, analyze, 'init and analyze at the same commit');
  assert.match(a, /paths-ignore:\n\s+- node_modules\n\s+- research\n/, 'the vendored data left out, nothing else');
  assert.doesNotMatch(a, /npm ci|runs-on: \[self-hosted/, "GitHub's runner, no install");
  // not a job of ci.yml (ci-ok unaffected), and the documentation says so
  assert.doesNotMatch(read('.github/workflows/ci.yml'), /codeql/i);
  for (const f of ['CLAUDE.md', 'ONBOARDING.md', 'SECURITY.md']) assert.match(read(f), /CodeQL/, f);
});
