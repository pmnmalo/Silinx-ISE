// The sources pinned outside npm against their upstream (scripts/check-pins.mjs, #352): the pins found in
// the repository, ls-remote's output, the comparison of each kind of pin, the issue's text and what is done
// with it; the whole check with the network replaced (no network in the tests); the monthly workflow.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectPins, parseLsRemote, compareTags, latestReleaseTag, yowaspTag, checkYosysTests, checkCommit, checkMcc, issueBody, issueAction, checkAll, TITLE, LABELS } from '../scripts/check-pins.mjs';
import { YOSYS_TESTS_PIN } from '../scripts/fetch-yosys-tests.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const A = 'a'.repeat(40), B = 'b'.repeat(40), C = 'c'.repeat(40), D = 'd'.repeat(40);

test('check-pins: every pin of the repository (Yosys\'s test designs, each corpus source, the MCC year)', () => {
  const pins = collectPins(ROOT);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'test/designs-corpus/manifest.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const y = pins.find(p => p.kind === 'yosys-tests');
  assert.deepEqual([y.repo, y.tag, y.commit, y.yowasp], ['YosysHQ/yosys', YOSYS_TESTS_PIN.tag, YOSYS_TESTS_PIN.commit, pkg.dependencies['@yowasp/yosys']]);
  const commits = pins.filter(p => p.kind === 'commit');
  assert.equal(commits.length, Object.keys(manifest.sources).length);
  for (const p of commits) {
    const src = manifest.sources[p.name.replace('design corpus: ', '')];
    assert.equal(p.repo, src.repo);
    assert.match(p.commit, /^[0-9a-f]{40}$/);
    assert.ok(p.used.includes(src.licenceFile), p.name);
    assert.ok(p.used.every(f => !f.startsWith('local:')), p.name);
  }
  // a design's files are its source's used files
  const serv = commits.find(p => p.repo === 'olofk/serv');
  for (const d of manifest.designs.filter(x => x.source === 'serv')) for (const f of d.files.filter(x => !x.startsWith('local:'))) assert.ok(serv.used.includes(f), f);
  const mcc = pins.find(p => p.kind === 'mcc');
  assert.equal(mcc.year, 2026);
  assert.ok(mcc.models.length >= 2);
  assert.equal(pins.length, 2 + commits.length);
});

test('check-pins: ls-remote\'s output, an annotated tag by its commit', () => {
  const refs = parseLsRemote(`${A}\tHEAD\n${B}\trefs/tags/v0.70\n${C}\trefs/tags/v0.70^{}\n${D}\trefs/tags/v0.9\nnot a line\n`);
  assert.deepEqual(refs, { HEAD: A, 'refs/tags/v0.70': C, 'refs/tags/v0.9': D });
  // the peeled line first: the tag object's line does not replace it
  assert.deepEqual(parseLsRemote(`${C}\trefs/tags/x^{}\n${B}\trefs/tags/x\n`), { 'refs/tags/x': C });
  assert.deepEqual(parseLsRemote(''), {});
});

test('check-pins: release tags compared as numbers, the latest without release candidates', () => {
  assert.equal(compareTags('v0.68', 'v0.70'), -1);
  assert.equal(compareTags('v0.9', 'v0.10'), -1);
  assert.equal(compareTags('v0.70', 'v0.70.0'), 0);
  assert.equal(compareTags('v1.0', 'v0.99'), 1);
  const refs = { 'refs/tags/v0.9': A, 'refs/tags/v0.70': A, 'refs/tags/v0.71-rc1': A, 'refs/tags/yosys-0.72': A, 'refs/tags/v0.69.1': A, HEAD: A };
  assert.equal(latestReleaseTag(refs), 'v0.70');
  assert.equal(latestReleaseTag({ HEAD: A }), null);
  assert.equal(yowaspTag('0.68.1207'), 'v0.68');
  assert.equal(yowaspTag('^0.70.1258'), 'v0.70');
  assert.equal(yowaspTag(null), null);
});

test('check-pins: Yosys\'s test designs: behind a newer Yosys, out of step with YoWASP, the wrong commit', () => {
  const pin = { kind: 'yosys-tests', name: 'Yosys\'s test designs', tag: 'v0.68', commit: A, yowasp: '0.68.1207' };
  const current = checkYosysTests(pin, { 'refs/tags/v0.68': A, 'refs/tags/v0.67': B });
  assert.deepEqual([current.behind, current.latest, current.notes], [false, 'v0.68', []]);
  const newer = checkYosysTests(pin, { 'refs/tags/v0.68': A, 'refs/tags/v0.70': B });
  assert.equal(newer.behind, true);
  assert.equal(newer.latest, 'v0.70');
  assert.match(newer.notes.join(), /follow the Yosys of @yowasp\/yosys \(v0\.68\)/);
  // YoWASP updated, the test designs not: out of step, even with no newer Yosys
  const step = checkYosysTests({ ...pin, yowasp: '0.70.1258' }, { 'refs/tags/v0.68': A, 'refs/tags/v0.70': B, });
  assert.equal(step.behind, true);
  assert.match(step.notes[0], /out of step: @yowasp\/yosys 0\.70\.1258 runs Yosys v0\.70, the test designs are v0\.68's/);
  const wrong = checkYosysTests(pin, { 'refs/tags/v0.68': C });
  assert.equal(wrong.behind, true);
  assert.match(wrong.notes[0], /the commit pinned \(aaaaaaa\) is not v0\.68's \(ccccccc\)/);
});

test('check-pins: a commit pin against its repository\'s head: commits behind, the used files changed', () => {
  const pin = { kind: 'commit', name: 'design corpus: x', repo: 'o/x', commit: A, used: ['LICENSE', 'rtl/a.v', 'rtl/b.v'] };
  assert.deepEqual(checkCommit(pin, A), { pin, current: 'aaaaaaa', latest: 'aaaaaaa', behind: false, notes: [] });
  const moved = checkCommit(pin, B, { ahead_by: 3, files: ['README.md', 'rtl/b.v'] });
  assert.equal(moved.behind, true);
  assert.deepEqual(moved.notes, ['3 commits behind', 'files the designs use changed: `rtl/b.v`']);
  assert.deepEqual(checkCommit(pin, B, { ahead_by: 1, files: ['docs/x.md'] }).notes, ['1 commit behind', 'none of the files the designs use changed']);
  // without GitHub's comparison: behind, nothing more known
  assert.deepEqual(checkCommit(pin, B).notes, []);
  const unread = checkCommit(pin, null);
  assert.equal(unread.behind, false);
  assert.match(unread.notes[0], /could not be read/);
});

test('check-pins: the MCC models against the latest contest', () => {
  const pin = { kind: 'mcc', name: 'MCC', year: 2024 };
  assert.equal(checkMcc(pin, []).behind, false);
  const r = checkMcc(pin, [2026, 2025]);
  assert.deepEqual([r.behind, r.current, r.latest], [true, '2024', '2026']);
  assert.match(r.notes[0], /MCC 2026 \(https:\/\/mcc\.lip6\.fr\/2026\/models\.php\)/);
});

test('check-pins: the issue\'s text lists what is behind, how to update it, what could not be checked', () => {
  const checks = [
    checkYosysTests({ kind: 'yosys-tests', name: 'Yosys\'s test designs', file: 'scripts/fetch-yosys-tests.mjs', repo: 'YosysHQ/yosys', tag: 'v0.68', commit: A, yowasp: '0.68.1' }, { 'refs/tags/v0.68': A, 'refs/tags/v0.70': B }),
    checkCommit({ kind: 'commit', name: 'design corpus: x', file: 'test/designs-corpus/manifest.json', repo: 'o/x', commit: A, used: [] }, A),
    checkCommit({ kind: 'commit', name: 'design corpus: y', file: 'test/designs-corpus/manifest.json', repo: 'o/y', commit: A, used: ['a.v'] }, B, { ahead_by: 2, files: ['a.v'] }),
    checkCommit({ kind: 'commit', name: 'design corpus: z', file: 'test/designs-corpus/manifest.json', repo: 'o/z', commit: A, used: [] }, null),
  ];
  const body = issueBody(checks, '2026-11-01');
  assert.match(body, /checked 2026-11-01 by \.github\/workflows\/pins\.yml/);
  assert.match(body, /\| Yosys's test designs \(\[YosysHQ\/yosys\]\(https:\/\/github\.com\/YosysHQ\/yosys\)\) \| scripts\/fetch-yosys-tests\.mjs \| v0\.68 \| v0\.70 \|/);
  assert.match(body, /\| design corpus: y \(\[o\/y\]\(https:\/\/github\.com\/o\/y\)\) \| test\/designs-corpus\/manifest\.json \| aaaaaaa \| bbbbbbb \| 2 commits behind; files the designs use changed: `a\.v` \|/);
  assert.ok(!body.includes('design corpus: x'), 'a current pin is not listed');
  assert.match(body, /Not checked:\n\n- design corpus: z: the head of the repository could not be read/);
  assert.match(body, /- Yosys's test designs: with the Yosys update/);
  assert.match(body, /- the design corpus: test\/designs-corpus\/manifest\.json \(the commit\)/);
  assert.ok(!/the MCC models:/.test(body));
});

test('check-pins: the issue opened, updated, closed or left alone; its title and labels', () => {
  assert.equal(issueAction(null, 2), 'open');
  assert.equal(issueAction({ number: 9 }, 1), 'update');
  assert.equal(issueAction({ number: 9 }, 0), 'close');
  assert.equal(issueAction(null, 0), 'none');
  assert.equal(TITLE, 'Pinned sources: newer versions available');
  assert.deepEqual(LABELS, ['enhancement', 'tests & CI']);
});

test('check-pins: the whole check with the network replaced; a pin that cannot be read is not behind', async () => {
  const pins = [
    { kind: 'yosys-tests', name: 'Y', repo: 'YosysHQ/yosys', tag: 'v0.68', commit: A, yowasp: '0.68.1' },
    { kind: 'commit', name: 'c1', repo: 'o/one', commit: A, used: ['f.v'] },
    { kind: 'commit', name: 'c2', repo: 'o/two', commit: A, used: ['f.v'] },
    { kind: 'commit', name: 'c3', repo: 'o/missing', commit: A, used: [] },
    { kind: 'mcc', name: 'M', year: 2024 },
  ];
  const asked = [];
  const net = {
    lsRemote: async (url, ...refs) => {
      asked.push([url, ...refs].join(' '));
      if (url.includes('yosys')) return { 'refs/tags/v0.68': A, 'refs/tags/v0.69': B };
      if (url.includes('one')) return { HEAD: A };
      if (url.includes('two')) return { HEAD: C };
      throw new Error('fatal: repository not found\nmore');
    },
    compare: async (repo, base, head) => { assert.deepEqual([repo, base, head], ['o/two', A, C]); return { ahead_by: 5, files: ['f.v'] }; },
    exists: async url => url.endsWith('/2025/models.php'),
  };
  const r = await checkAll(pins, net);
  assert.deepEqual(r.map(c => [c.pin.name, c.behind, c.latest]), [['Y', true, 'v0.69'], ['c1', false, 'aaaaaaa'], ['c2', true, 'ccccccc'], ['c3', false, '?'], ['M', true, '2025']]);
  assert.deepEqual(r[2].notes, ['5 commits behind', 'files the designs use changed: `f.v`']);
  assert.deepEqual(r[3].notes, ['could not be checked: fatal: repository not found']);
  assert.deepEqual(asked.slice(0, 2), ['https://github.com/YosysHQ/yosys.git refs/tags/v*', 'https://github.com/o/one.git HEAD']);
});

test('check-pins: the monthly workflow on GitHub\'s runner, by hand too, may write issues', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github/workflows/pins.yml'), 'utf8');
  assert.match(yml, /\n  schedule:\n    - cron: '\d+ \d+ 1 \* \*'/);
  assert.match(yml, /\n  workflow_dispatch:\n/);
  assert.match(yml, /runs-on: ubuntu-latest/);
  assert.ok(!yml.includes('self-hosted'));
  assert.match(yml, /issues: write/);
  assert.match(yml, /run: node scripts\/check-pins\.mjs\n\s+env:\n\s+GITHUB_TOKEN: \$\{\{ github\.token \}\}/);
});
