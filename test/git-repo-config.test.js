// A repository's own configuration (#3523, server/git-repo-config.js): the settings a clone, Silinx and the usual tools
// write are allowed; any other (a program git runs, an included file, a rewritten address) is named.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { refusedSetting, repoConfigProblem } from '../server/git-repo-config.js';

const list = pairs => pairs.map(([k, v]) => `${k}\n${v}`).join('\0') + '\0';

test('the allowed settings, and the first refused one named as git lists it', async () => {
  const plain = [['core.repositoryformatversion', '0'], ['core.filemode', 'true'], ['core.bare', 'false'], ['core.logallrefupdates', 'true'], ['core.ignorecase', 'true'],
    ['core.precomposeunicode', 'true'], ['core.sparsecheckout', 'true'], ['core.sparsecheckoutcone', 'false'], ['remote.origin.url', 'https://github.com/a/b'],
    ['remote.origin.fetch', '+refs/heads/*:refs/remotes/origin/*'], ['remote.up.stream.pushurl', 'x'], ['branch.main.remote', 'origin'], ['branch.feature/a.b.merge', 'refs/heads/x'],
    ['user.name', 'Ana'], ['core.hookspath', '/x'], ['core.fsmonitor', 'x'], ['filter.lfs.clean', 'git-lfs clean -- %f']];
  assert.equal(refusedSetting(list(plain)), null);
  assert.equal(refusedSetting(''), null);
  for (const key of ['filter.x.clean', 'filter.lfs.other', 'merge.x.driver', 'diff.x.textconv', 'gpg.program', 'credential.helper', 'credential.https://github.com.helper', 'core.sshcommand',
    'core.pager', 'include.path', 'includeif.gitdir:/.path', 'url.https://x/.insteadof', 'remote.origin.vcs', 'remote.origin.uploadpack', 'alias.st', 'branch.main', 'remote.url', 'unknown.key'])
    assert.equal(refusedSetting(list([...plain, [key, 'v'], ['gpg.program', 'later']])), key, key);
  // (a value over several lines is its key's)
  assert.equal(refusedSetting(list([['user.name', 'a\nfilter.x.clean\nb']])), null);
  // both scopes read, the local one first
  const scopes = [];
  assert.equal(await repoConfigProblem(async s => { scopes.push(s); return s === 'worktree' ? list([['core.editor', 'x']]) : list(plain); }), 'core.editor');
  assert.deepEqual(scopes, ['local', 'worktree']);
  assert.equal(await repoConfigProblem(async () => ''), null);
});
