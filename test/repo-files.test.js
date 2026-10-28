// The repository's files (#1645): none named as the copies a file sync or the Finder makes ("name 2.js", "name
// copy.js"), committed by mistake.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

test('no tracked file is a duplicate copy ("name 2.ext", "name copy.ext")', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  assert.deepEqual(files.filter((f) => / (\d+|copy)(\.[^./]+)*$/.test(f.split('/').pop())), []);
});

// A worktree's links (#1792): `.cache -> ../../../.cache` committed by mistake dangles on the runners, and the
// Nightly's cache restore and fetches failed on it before any design ran.
test('no tracked file is a symbolic link', () => {
  const links = execFileSync('git', ['ls-files', '-s'], { encoding: 'utf8' }).split('\n')
    .filter((l) => l.startsWith('120000 ')).map((l) => l.split('\t')[1]);
  assert.deepEqual(links, []);
});
