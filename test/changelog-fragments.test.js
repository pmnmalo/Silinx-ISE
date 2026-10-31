// The changelog fragments (#519): one file per change in changes/ instead of an edit of CHANGELOG.md; the
// fragments of the repository well formed, their parser and checker, and a release assembling them into
// CHANGELOG.md (scripts/changelog-release.mjs) then deleting them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseFragment, checkFragments, sortFragments, mergeFragments, assembleRelease, parseChangelog, changesOf } from '../core/changelog.js';
import { readFragments } from '../scripts/changelog-release.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const A = { name: '490-generate-and-simulate.md', text: 'In short:\n\n- **Generate and Simulate:** short a\n  more a\n\nIn detail:\n\n- **Model (#490):** detail a\n  more\n' };
const B = { name: '511-wide-muxes.md', text: 'In detail:\n\n- **Muxes (#511):** detail b\n- **Muxes, the test (#511):** detail b2\n' };
const C = { name: '490-generate-and-emulate.md', text: 'In short:\n\n- **Emulate:** short c\n\nIn detail:\n\n- **Emulate (#490):** detail c\n' };

test('fragments of the repository: well formed, README.md apart', () => {
  const files = readFragments();
  assert.ok(!files.some(f => f.name === 'README.md'));
  assert.ok(fs.existsSync(path.join(ROOT, 'changes/README.md')), 'changes/README.md documents the format');
  assert.deepEqual(checkFragments(files), []);
  // nothing else in changes/ (a stray file would never be assembled)
  assert.deepEqual(fs.readdirSync(path.join(ROOT, 'changes')).filter(f => !f.endsWith('.md')), []);
});

// silinx-fpga's own changelog (#1681): its fragments in packages/silinx-fpga/changes, the same format
test('silinx-fpga\'s fragments: well formed, README.md apart; its CHANGELOG.md', () => {
  const dir = path.join(ROOT, 'packages/silinx-fpga/changes');
  assert.ok(fs.existsSync(path.join(dir, 'README.md')));
  assert.deepEqual(checkFragments(readFragments(dir)), []);
  assert.deepEqual(fs.readdirSync(dir).filter(f => !f.endsWith('.md')), []);
  const md = fs.readFileSync(path.join(ROOT, 'packages/silinx-fpga/CHANGELOG.md'), 'utf8');
  assert.match(md, /^# Changelog\n\nWhat changed in each version of silinx-fpga/);
  // its versions are its own, 0.x, with their own notes: a number Silinx ISE once had too (its early 0.1.0) is no
  // clash (the tags differ, silinx-fpga-v0.1.0 and v0.1.0), a section copied from its changelog is
  const ide = new Map(parseChangelog(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8')).map(s => [s.version, s.body]));
  const own = parseChangelog(md);
  assert.ok(own.every(s => /^0\./.test(s.version) && s.body && ide.get(s.version) !== s.body), own.map(s => s.version).join(', '));
  assert.ok(ide.has('0.1.0'));
});

test('parseFragment: the lists, In short optional, continuation lines kept', () => {
  assert.deepEqual(parseFragment(A.text), { short: ['- **Generate and Simulate:** short a\n  more a'], detail: ['- **Model (#490):** detail a\n  more'] });
  assert.deepEqual(parseFragment(B.text), { short: [], detail: ['- **Muxes (#511):** detail b', '- **Muxes, the test (#511):** detail b2'] });
  assert.deepEqual(parseFragment('In detail:\r\n\r\n- x (#1)   \r\n'), { short: [], detail: ['- x (#1)'] }, 'CRLF, trailing spaces');
});

test('parseFragment: what a malformed fragment says', () => {
  const bad = [
    ['', /no "In detail:" item/],
    ['In short:\n\n- a\n', /no "In detail:" item/],
    ['In detail:\n', /no "In detail:" item/],
    ['In short:\n\nIn detail:\n\n- a\n', /an empty "In short:" list/],
    ['Title\n\nIn detail:\n\n- a\n', /line 1: text before "In short:" \/ "In detail:"/],
    ['In detail:\n\n- a\n\nIn short:\n\n- b\n', /line 5: "In short:" again, or after "In detail:"/],
    ['In detail:\n\n- a\n\nIn detail:\n\n- b\n', /line 5: "In detail:" again/],
    ['In detail:\n\n- a\n\n- b\n', /line 5: a blank line inside a list/],
    ['In detail:\n\n- a\nb\n', /line 4: neither a "- " item nor its indented continuation/],
    ['In detail:\n\n  a\n', /line 3: neither/],
    ['In detail:\n\n* a\n', /line 3: neither/],
    ['## 1.0.0\n\nIn detail:\n\n- a\n', /line 1: text before/],
  ];
  for (const [text, re] of bad) assert.throws(() => parseFragment(text), re, JSON.stringify(text));
});

test('checkFragments: the name, the format, the issue number, no slug twice', () => {
  assert.deepEqual(checkFragments([A, B, C]), []);
  assert.deepEqual(checkFragments([
    { name: 'generate.md', text: A.text },
    { name: '490-Generate.md', text: A.text },
    { name: '490_generate.md', text: A.text },
    { name: '490-generate-.md', text: A.text },
    { name: '490-generate.txt', text: A.text },
    { name: '12-x.md', text: 'In detail:\n\n- x (#123)\n' },
    { name: '13-y.md', text: 'In short:\n\n- y (#13)\n\nIn detail:\n\n- y\n' },
    { name: '14-z.md', text: 'oops' },
    { name: '15-x.md', text: 'In detail:\n\n- x (#15, #4)\n' },
  ]), [
    'generate.md: not named <issue>-<slug>.md (lower case, e.g. 490-generate-and-simulate.md)',
    '490-Generate.md: not named <issue>-<slug>.md (lower case, e.g. 490-generate-and-simulate.md)',
    '490_generate.md: not named <issue>-<slug>.md (lower case, e.g. 490-generate-and-simulate.md)',
    '490-generate-.md: not named <issue>-<slug>.md (lower case, e.g. 490-generate-and-simulate.md)',
    '490-generate.txt: not named <issue>-<slug>.md (lower case, e.g. 490-generate-and-simulate.md)',
    '12-x.md: its "In detail:" items do not name #12',
    '13-y.md: its "In detail:" items do not name #13',
    '14-z.md: line 1: text before "In short:" / "In detail:"',
    '15-x.md: the same slug as 12-x.md',
  ]);
});

test('sortFragments: the newest issue first, the same issue by name', () => {
  assert.deepEqual(sortFragments([A, B, C, { name: '9-a.md' }, { name: '1000-a.md' }]).map(f => f.name),
    ['1000-a.md', '511-wide-muxes.md', '490-generate-and-emulate.md', '490-generate-and-simulate.md', '9-a.md']);
});

test('mergeFragments: the fragments first in each list; the lists made when missing; an introduction kept', () => {
  assert.equal(mergeFragments('', [A, B, C]), [
    'In short:', '',
    '- **Emulate:** short c',
    '- **Generate and Simulate:** short a', '  more a', '',
    'In detail:', '',
    '- **Muxes (#511):** detail b', '- **Muxes, the test (#511):** detail b2',
    '- **Emulate (#490):** detail c',
    '- **Model (#490):** detail a', '  more',
  ].join('\n'));
  assert.equal(mergeFragments('', [B]), 'In detail:\n\n- **Muxes (#511):** detail b\n- **Muxes, the test (#511):** detail b2', 'no In short at all');
  // a section written by hand: its introduction, its items after the fragments'
  const hand = 'A new minor version.\n\nIn short:\n\n- **Old:** s\n\nIn detail:\n\n- **Old (#400):** d\n  more';
  assert.equal(mergeFragments(hand, [C]),
    'A new minor version.\n\nIn short:\n\n- **Emulate:** short c\n- **Old:** s\n\nIn detail:\n\n- **Emulate (#490):** detail c\n- **Old (#400):** d\n  more');
  assert.equal(mergeFragments('In detail:\n\n- **Old (#400):** d', [A]),
    'In short:\n\n- **Generate and Simulate:** short a\n  more a\n\nIn detail:\n\n- **Model (#490):** detail a\n  more\n- **Old (#400):** d', 'In short added before In detail');
  assert.equal(mergeFragments(hand, []), hand, 'no fragments: the section unchanged');
});

const MD = '# Changelog\n\nWhat changed.\n\n## 2.0.1\n\nIn short:\n\n- **Fix:** f\n\nIn detail:\n\n- **Fix (#300):** f\n\n## 2.0.0\n\n- First.\n';

test('assembleRelease: a new section at the top, exactly; the rest of the file unchanged', () => {
  const out = assembleRelease(MD, '2.1.0', [B, A]);
  assert.equal(out, '# Changelog\n\nWhat changed.\n\n## 2.1.0\n\n' +
    'In short:\n\n- **Generate and Simulate:** short a\n  more a\n\n' +
    'In detail:\n\n- **Muxes (#511):** detail b\n- **Muxes, the test (#511):** detail b2\n- **Model (#490):** detail a\n  more\n\n' +
    MD.slice(MD.indexOf('## 2.0.1')));
  assert.deepEqual(parseChangelog(out).map(s => s.version), ['2.1.0', '2.0.1', '2.0.0']);
  assert.equal(assembleRelease(MD, 'v2.1.0', [B]), assembleRelease(MD, '2.1.0', [B]), 'a "v" before the version');
  // no section yet in the file
  assert.equal(assembleRelease('# Changelog\n\nIntro.\n', '0.1.0', [B]),
    '# Changelog\n\nIntro.\n\n## 0.1.0\n\nIn detail:\n\n- **Muxes (#511):** detail b\n- **Muxes, the test (#511):** detail b2\n');
});

test('assembleRelease: into a section written by hand (the transition), at the top or the end of the file', () => {
  const out = assembleRelease(MD, '2.0.1', [C]);
  assert.equal(changesOf(out, '2.0.1').body, 'In short:\n\n- **Emulate:** short c\n- **Fix:** f\n\nIn detail:\n\n- **Emulate (#490):** detail c\n- **Fix (#300):** f');
  assert.equal(out.slice(out.indexOf('## 2.0.0')), '## 2.0.0\n\n- First.\n');
  assert.match(out, /- \*\*Fix \(#300\):\*\* f\n\n## 2\.0\.0/);
  // the last section of the file
  const last = assembleRelease(MD, '2.0.0', [B]);
  assert.equal(last.slice(last.indexOf('## 2.0.0')), '## 2.0.0\n\n- First.\n\nIn detail:\n\n- **Muxes (#511):** detail b\n- **Muxes, the test (#511):** detail b2\n');
  assert.equal(assembleRelease(MD, '2.0.1', []), MD, 'a section and no fragments: unchanged');
});

test('assembleRelease: its errors', () => {
  assert.throws(() => assembleRelease(MD, '2.1.0', []), /^Error: no changelog fragments and no "## 2\.1\.0" section in CHANGELOG\.md: nothing to release$/);
  assert.throws(() => assembleRelease(MD, '2.0.0-x', [B]), /not newer/);
  assert.throws(() => assembleRelease(MD, '1.9.9', [B]), /^Error: 1\.9\.9 is not newer than 2\.0\.1, the newest version in CHANGELOG\.md$/);
  assert.throws(() => assembleRelease(MD, '2.1.0', [{ name: '1-a.md', text: 'x' }]), /line 1: text before/);
});

// scripts/changelog-release.mjs on a copy of the repository's files it uses
function sandbox(t, fragments) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-changelog-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  for (const f of ['scripts/changelog-release.mjs', 'core/changelog.js', 'core/version.js']) {
    fs.mkdirSync(path.join(dir, path.dirname(f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(dir, f));
  }
  fs.writeFileSync(path.join(dir, 'CHANGELOG.md'), MD);
  fs.mkdirSync(path.join(dir, 'changes'));
  fs.writeFileSync(path.join(dir, 'changes/README.md'), '# Changelog fragments\n');
  for (const f of fragments) fs.writeFileSync(path.join(dir, 'changes', f.name), f.text);
  const run = (...a) => spawnSync(process.execPath, [path.join(dir, 'scripts/changelog-release.mjs'), ...a], { cwd: dir, encoding: 'utf8' });
  return { dir, run, changes: () => fs.readdirSync(path.join(dir, 'changes')).sort(), md: () => fs.readFileSync(path.join(dir, 'CHANGELOG.md'), 'utf8') };
}

test('scripts/changelog-release.mjs: assembles, deletes the fragments (not the README), says so', (t) => {
  const s = sandbox(t, [A, B]);
  const dry = s.run('2.1.0', '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(dry.stderr, '', 'no warnings');
  assert.equal(dry.stdout, `## 2.1.0\n\n${changesOf(assembleRelease(MD, '2.1.0', [A, B]), '2.1.0').body}\n`);
  assert.equal(s.md(), MD, '--dry-run changes nothing');
  assert.deepEqual(s.changes(), ['490-generate-and-simulate.md', '511-wide-muxes.md', 'README.md']);
  const r = s.run('v2.1.0');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', 'no warnings');
  assert.equal(r.stdout, 'CHANGELOG.md: 2 fragment(s) assembled into "## 2.1.0" and deleted from changes/.\n');
  assert.equal(s.md(), assembleRelease(MD, '2.1.0', [A, B]));
  assert.deepEqual(s.changes(), ['README.md']);
});

test('scripts/changelog-release.mjs: refuses a malformed fragment, a bad version, nothing to release', (t) => {
  const s = sandbox(t, [A, { name: '7-bad.md', text: 'In detail:\n\n- no issue\n' }]);
  let r = s.run('2.1.0');
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'changes/: malformed fragments:\n  7-bad.md: its "In detail:" items do not name #7\n');
  assert.equal(s.md(), MD);
  assert.equal(s.changes().length, 3, 'nothing deleted');
  r = s.run('2.1');
  assert.equal(r.status, 2);
  assert.match(r.stderr, /^usage: node scripts\/changelog-release\.mjs <version> \[--dry-run\] \[--package <name>\]\n$/);
  const e = sandbox(t, []);
  r = e.run('2.1.0');
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'no changelog fragments and no "## 2.1.0" section in CHANGELOG.md: nothing to release\n');
  r = sandbox(t, [B]).run('2.0.0');
  assert.equal(r.status, 0, 'the version\'s section exists (written by hand): the fragments added to it');
});

test('scripts/sync-version.mjs (npm version): refuses a version while fragments are left, then sets it', (t) => {
  const s = sandbox(t, [B]);
  fs.copyFileSync(path.join(ROOT, 'scripts/sync-version.mjs'), path.join(s.dir, 'scripts/sync-version.mjs'));
  fs.writeFileSync(path.join(s.dir, 'package.json'), JSON.stringify({ type: 'module', version: '2.1.0' }));
  const sync = () => spawnSync(process.execPath, [path.join(s.dir, 'scripts/sync-version.mjs')], { cwd: s.dir, encoding: 'utf8' });
  const version = () => /VERSION = '([^']*)'/.exec(fs.readFileSync(path.join(s.dir, 'core/version.js'), 'utf8'))[1];
  const before = version();
  let r = sync();
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'CHANGELOG.md has no "## 2.1.0" section: write what changed in 2.1.0 before releasing it.\n');
  // a section, but a fragment left (written after the assembling)
  fs.writeFileSync(path.join(s.dir, 'CHANGELOG.md'), assembleRelease(MD, '2.1.0', [A]));
  r = sync();
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'changes/ has fragments not in CHANGELOG.md (511-wide-muxes.md): run node scripts/changelog-release.mjs 2.1.0 first.\n');
  assert.equal(version(), before, 'core/version.js unchanged');
  assert.equal(s.run('2.1.0').status, 0);
  r = sync();
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', 'no warnings');
  assert.equal(r.stdout, 'core/version.js: 2.1.0\n');
  assert.equal(version(), '2.1.0');
});

// a workspace's changelog (#1681): --package silinx-fpga, its packages/silinx-fpga/changes into its CHANGELOG.md
const PKG_MD = '# Changelog\n\nWhat changed in each version of silinx-fpga.\n';
function packageSandbox(t, fragments, version = '0.1.0') {
  const s = sandbox(t, [A]);
  fs.copyFileSync(path.join(ROOT, 'scripts/sync-version.mjs'), path.join(s.dir, 'scripts/sync-version.mjs'));
  const pkg = path.join(s.dir, 'packages/silinx-fpga');
  fs.mkdirSync(path.join(pkg, 'changes'), { recursive: true });
  fs.writeFileSync(path.join(pkg, 'CHANGELOG.md'), PKG_MD);
  fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify({ name: 'silinx-fpga', version }));
  fs.writeFileSync(path.join(pkg, 'changes/README.md'), '# Fragments\n');
  for (const f of fragments) fs.writeFileSync(path.join(pkg, 'changes', f.name), f.text);
  const sync = (...a) => spawnSync(process.execPath, [path.join(s.dir, 'scripts/sync-version.mjs'), ...a], { cwd: s.dir, encoding: 'utf8' });
  return { ...s, sync, pkgMd: () => fs.readFileSync(path.join(pkg, 'CHANGELOG.md'), 'utf8'), pkgChanges: () => fs.readdirSync(path.join(pkg, 'changes')).sort(),
    versionJs: () => fs.readFileSync(path.join(s.dir, 'core/version.js'), 'utf8') };
}

test('scripts/changelog-release.mjs --package silinx-fpga: its fragments into its CHANGELOG.md; the IDE\'s untouched', (t) => {
  const s = packageSandbox(t, [B, C]);
  const dry = s.run('0.1.0', '--package', 'silinx-fpga', '--dry-run');
  assert.equal(dry.status, 0, dry.stderr);
  assert.equal(dry.stdout, `## 0.1.0\n\n${changesOf(assembleRelease(PKG_MD, '0.1.0', [C, B]), '0.1.0').body}\n`);
  assert.equal(s.pkgMd(), PKG_MD);
  const r = s.run('0.1.0', '--package', 'silinx-fpga');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', 'no warnings');
  assert.equal(r.stdout, 'packages/silinx-fpga/CHANGELOG.md: 2 fragment(s) assembled into "## 0.1.0" and deleted from packages/silinx-fpga/changes/.\n');
  assert.equal(s.pkgMd(), assembleRelease(PKG_MD, '0.1.0', [B, C]));
  assert.deepEqual(s.pkgChanges(), ['README.md']);
  assert.equal(s.md(), MD, 'the IDE\'s CHANGELOG.md unchanged');
  assert.deepEqual(s.changes(), ['490-generate-and-simulate.md', 'README.md'], 'the IDE\'s fragments kept');
  // errors: nothing to release, a package with no changelog, a bad name
  let e = s.run('0.1.1', '--package', 'silinx-fpga');
  assert.equal(e.status, 1);
  assert.equal(e.stderr, 'no changelog fragments and no "## 0.1.1" section in packages/silinx-fpga/CHANGELOG.md: nothing to release\n');
  e = s.run('0.1.0', '--package', 'silinx-hdl');
  assert.equal(e.status, 1);
  assert.equal(e.stderr, 'packages/silinx-hdl/CHANGELOG.md: no such file\n');
  for (const bad of [['--package'], ['--package', '../x']]) assert.equal(s.run('0.1.0', ...bad).status, 2, bad.join(' '));
});

test('scripts/sync-version.mjs --package silinx-fpga: refuses its version with no section or fragments left, then passes; writes nothing', (t) => {
  const s = packageSandbox(t, [B]);
  const before = s.versionJs();
  let r = s.sync('--package', 'silinx-fpga');
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'packages/silinx-fpga/CHANGELOG.md has no "## 0.1.0" section: write what changed in 0.1.0 before releasing it.\n');
  fs.writeFileSync(path.join(s.dir, 'packages/silinx-fpga/CHANGELOG.md'), assembleRelease(PKG_MD, '0.1.0', [A]));
  r = s.sync('--package', 'silinx-fpga');
  assert.equal(r.status, 1);
  assert.equal(r.stderr, 'packages/silinx-fpga/changes/ has fragments not in packages/silinx-fpga/CHANGELOG.md (511-wide-muxes.md): run node scripts/changelog-release.mjs 0.1.0 --package silinx-fpga first.\n');
  assert.equal(s.run('0.1.0', '--package', 'silinx-fpga').status, 0);
  r = s.sync('--package', 'silinx-fpga');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, '', 'no warnings');
  assert.equal(r.stdout, 'silinx-fpga 0.1.0: packages/silinx-fpga/CHANGELOG.md has its section, no fragment left\n');
  assert.equal(s.versionJs(), before, 'core/version.js unchanged');
});
