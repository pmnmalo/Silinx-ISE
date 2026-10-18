// CI on every push and pull request, its long jobs only when more than the documentation changed, and
// one required check, ci-ok (#409): scripts/ci-changes.mjs and .github/workflows/ci.yml.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BUILD_INPUTS, documentation, decide, changedFiles } from '../scripts/ci-changes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const SCRIPT = path.join(ROOT, 'scripts/ci-changes.mjs');

test('ci changes: documentation, apart from the Markdown files a build reads', () => {
  for (const f of ['README.md', 'ONBOARDING.md', 'CLAUDE.md', 'docs/QUALITY.md', 'docs/img/x.png', 'test/corpus/README.md', 'examples/vga/README.MD'])
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
    assert.match(r.stdout.trim(), line);
    assert.equal(r.stderr, '', 'no warnings');
    assert.equal(fs.readFileSync(out, 'utf8'), `code=${code}\n`);
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
  assert.deepEqual(Object.keys(j), ['changes', 'unit', 'ui', 'webkit-standalone', 'release-zip', 'browsers', 'os', 'ci-ok']);
  assert.match(j.changes.join('\n'), /fetch-depth: 0[\s\S]*node scripts\/ci-changes\.mjs "\$BASE" HEAD[\s\S]*BASE: \$\{\{ github\.event_name == 'pull_request' && 'HEAD\^1' \|\| github\.event\.before \}\}/);
  // the unit tests always (the documentation's tests are among them), the others only for code
  assert.ok(!j.unit.some(l => /needs:|^    if:/.test(l)), 'unit: not gated');
  assert.match(j.unit.join('\n'), /node --test --test-shard="\$SHARD\/3" "test\/\*\.test\.js"/);
  for (const t of ['docs', 'changelog', 'quality-page']) assert.ok(fs.existsSync(path.join(ROOT, `test/${t}.test.js`)), t);
  for (const job of ['ui', 'webkit-standalone', 'release-zip', 'browsers', 'os']) {
    assert.ok(j[job].includes('    needs: changes'), job);
    assert.ok(j[job].some(l => l.startsWith("    if: needs.changes.outputs.code == 'true'")), job);
  }
  // ci-ok: every other job, run always, red only on a failure or a cancellation
  const ok = j['ci-ok'].join('\n');
  assert.match(ok, /^    if: always\(\)$/m);
  assert.equal(ok.match(/^    needs: \[(.*)\]$/m)[1], Object.keys(j).filter(n => n !== 'ci-ok').join(', '));
  assert.match(ok, /- if: contains\(needs\.\*\.result, 'failure'\) \|\| contains\(needs\.\*\.result, 'cancelled'\)\n\s+run: exit 1/);
  // the required check's name in the rules (CLAUDE.md, ONBOARDING.md)
  for (const f of ['CLAUDE.md', 'ONBOARDING.md']) assert.match(read(f), /`ci-ok`/, f);
});
