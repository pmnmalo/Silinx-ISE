// The isomorphic parts of git (#3195): core/github-url.js (a GitHub repository's address checked, a URL's credentials
// removed, a project's name from a repository's), which the server's git and the interface's dialogs share, and
// core/git-messages.js, the console's and the MCP server's texts of a clone, an init, a commit, a push, a pull.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkUrl, redact, nameFromRepo, URL_HINT } from '../core/github-url.js';
import { cloneText, initText, commitText, pushText, pullText, fileLines, shortCommit } from '../core/git-messages.js';

test('checkUrl: GitHub\'s https and ssh addresses only, with their hint; a Classroom invitation', () => {
  for (const [u, owner, repo] of [['https://github.com/pmnmalo/Silinx', 'pmnmalo', 'Silinx'], ['https://github.com/ds-2026/lab1-ana.git', 'ds-2026', 'lab1-ana'],
    [' git@github.com:a/b.c.git ', 'a', 'b.c'], ['ssh://git@github.com:22/a/b', 'a', 'b'], ['https://github.com/a/b/', 'a', 'b']]) assert.deepEqual(checkUrl(u), { url: u.trim(), owner, repo }, u);
  for (const u of ['http://github.com/a/b', 'https://github.com/a', 'https://www.github.com/a/b', 'https://github.com/a/b?x=1', 'git@github.com:a/b/c', ' ', null])
    assert.throws(() => checkUrl(u), e => /^not a GitHub repository's address: /.test(e.message) && e.hint === URL_HINT && e.status === 400, String(u));
  assert.throws(() => checkUrl('https://classroom.github.com/a/AbC'), { message: 'a GitHub Classroom invitation, not a repository' });
});

test('redact, nameFromRepo', () => {
  assert.equal(redact('fatal: https://x:y@host/a and ssh://u@h/b'), 'fatal: https://host/a and ssh://h/b');
  assert.equal(redact('git@github.com:a/b'), 'git@github.com:a/b');
  assert.equal(redact(null), '');
  assert.deepEqual(['lab1', 'lab.1', '_x', 'a'.repeat(80)].map(nameFromRepo), ['lab1', 'lab_1', 'p_x', 'a'.repeat(64)]);
});

test('the messages', () => {
  const files = [{ path: 'src/a.v', state: 'new' }, { path: 'src/b.vhd', state: 'modified' }, { path: 'c.ucf', state: 'deleted' }, { path: 'd.v', state: 'conflict' }];
  assert.deepEqual(fileLines(files), ['  src/a.v (new)', '  src/b.vhd (changed)', '  c.ucf (deleted)', '  d.v (in conflict)']);
  assert.equal(shortCommit('0123456789abcdef'), '0123456');
  assert.equal(cloneText({ project: 'lab1', repository: 'ds/lab1' }), 'Project \'lab1\' opened from the GitHub repository ds/lab1.');
  assert.equal(initText('p', { created: true, remote: null, gitignore: true }), 'Repository made for \'p\'; .gitignore written.');
  assert.equal(initText('p', { created: true, remote: 'https://github.com/a/b', gitignore: false }), 'Repository made for \'p\', its remote https://github.com/a/b.');
  assert.equal(initText('p', { created: false, remote: 'https://github.com/a/b' }), '\'p\': its remote is now https://github.com/a/b.');
  assert.equal(commitText({ commit: 'abcdef0123', branch: 'main', files: files.slice(0, 2) }), 'Committed abcdef0 on main: 2 file(s).\n  src/a.v (new)\n  src/b.vhd (changed)');
  assert.equal(pushText({ pushed: true, branch: 'main', remote: 'a/b' }), 'Pushed main to a/b.');
  assert.equal(pushText({ pushed: false, branch: 'main', remote: 'a/b' }), 'Nothing to push: a/b has every commit of main.');
  assert.equal(pullText({ upToDate: true, branch: 'main' }), 'Already up to date: main has every commit of GitHub\'s.');
  assert.equal(pullText({ upToDate: false, branch: 'main', files: ['x.v'] }), 'Pulled into main: 1 file(s) changed.\n  x.v');
});
