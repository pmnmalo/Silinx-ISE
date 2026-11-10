// The packages a checkout runs on against its package-lock.json (#2949): scripts/installed-packages.mjs, which the design
// corpus (test/designs-corpus/run.mjs) reads before it measures anything.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { installMismatches, mismatchLines } from '../scripts/installed-packages.mjs';

const ROOT = path.join(import.meta.dirname, '..');

/** A folder tree: { 'a/b.json': {…} } written under a new temporary folder, returned. */
function tree(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'installed-packages-'));
  for (const [f, v] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    fs.writeFileSync(path.join(dir, f), JSON.stringify(v));
  }
  return dir;
}
const lock = packages => ({ lockfileVersion: 3, packages: { '': { name: 'x' }, ...packages } });
const pkg = version => ({ version });

test('a checkout installed as locked: no mismatch', () => {
  const dir = tree({
    'package-lock.json': lock({ 'node_modules/a': { version: '1.0.0' }, 'node_modules/@s/b': { version: '2.1.0' },
      'node_modules/a/node_modules/c': { version: '3.0.0' }, 'node_modules/w': { resolved: 'packages/w', link: true } }),
    'node_modules/a/package.json': pkg('1.0.0'), 'node_modules/@s/b/package.json': pkg('2.1.0'),
  });
  assert.deepEqual(installMismatches(dir), []);
  assert.deepEqual(mismatchLines(dir, []), []);
});

test('a package of another version than the locked one, and one missing', () => {
  const dir = tree({
    'package-lock.json': lock({ 'node_modules/a': { version: '1.0.0' }, 'node_modules/@s/b': { version: '2.1.0' } }),
    'node_modules/a/package.json': pkg('0.9.0'),
  });
  const list = installMismatches(dir);
  assert.deepEqual(list, [{ name: 'a', locked: '1.0.0', installed: '0.9.0', from: dir }, { name: '@s/b', locked: '2.1.0', installed: null, from: null }]);
  assert.deepEqual(mismatchLines(dir, list), ['a 0.9.0, package-lock.json 1.0.0', '@s/b not installed, package-lock.json 2.1.0']);
});

test('an optional package not installed (another platform\'s) is left out; installed, it is checked', () => {
  const dir = tree({
    'package-lock.json': lock({ 'node_modules/o': { version: '1.0.0', optional: true }, 'node_modules/d': { version: '1.0.0', devOptional: true } }),
    'node_modules/d/package.json': pkg('1.1.0'),
  });
  assert.deepEqual(installMismatches(dir), [{ name: 'd', locked: '1.0.0', installed: '1.1.0', from: dir }]);
});

test('a worktree with no node_modules of its own runs on the one above it: every package said, its stale ones by version', () => {
  const main = tree({
    'node_modules/a/package.json': pkg('1.0.0'), 'node_modules/n/package.json': pkg('0.15.0'),
    'wt/x/package-lock.json': lock({ 'node_modules/a': { version: '1.0.0' }, 'node_modules/n': { version: '1.1.0' } }),
  });
  const wt = path.join(main, 'wt', 'x');
  const list = installMismatches(wt);
  assert.deepEqual(list, [{ name: 'a', locked: '1.0.0', installed: '1.0.0', from: main }, { name: 'n', locked: '1.1.0', installed: '0.15.0', from: main }]);
  assert.deepEqual(mismatchLines(wt, list), [`2 package(s) from ${path.join('..', '..', 'node_modules')}, not from this checkout's node_modules`,
    'n 0.15.0, package-lock.json 1.1.0']);
  // once installed in the worktree, its own node_modules wins
  fs.mkdirSync(path.join(wt, 'node_modules', 'a'), { recursive: true });
  fs.writeFileSync(path.join(wt, 'node_modules', 'a', 'package.json'), JSON.stringify(pkg('1.0.0')));
  assert.deepEqual(installMismatches(wt), [{ name: 'n', locked: '1.1.0', installed: '0.15.0', from: main }]);
});

test('the repository\'s own lock file reads (every top-level entry a name)', () => {
  const list = installMismatches(ROOT);
  assert.ok(Array.isArray(list));
  for (const x of list) assert.match(x.name, /^(@[^/]+\/)?[^/]+$/);
});

test('the design corpus refuses --update on packages that are not package-lock.json\'s', () => {
  const src = fs.readFileSync(path.join(ROOT, 'test', 'designs-corpus', 'run.mjs'), 'utf8');
  assert.match(src, /installMismatches\(ROOT\)/);
  assert.match(src, /if \(installNote\.length && update\) \{[^}]*process\.exit\(2\)/);
});
