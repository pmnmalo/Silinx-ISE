// Git, phase 1 (#3195, server/git.js): a project in a repository through the system's git, against local bare
// repositories (no network; GIT_TESTING.localRemotes takes a folder for a GitHub URL): the URL checks, clone (untrusted,
// its silinx.json unchanged; the import gate; a repository of several projects), status, commit (the project's files
// only, the tools' outputs never, the .gitignore), push, a rejected push, pull, a conflict that pulls nothing, the
// history and a file as it was, init, no hook of a repository run, a repository above the workspace never used, the
// workspace as the repository, a remote that is not GitHub's, git not installed; the routes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { scratchEnv, startApp, ROOT } from './server-helpers.js';

let tmp, ws, remote;
const G = await import('../server/git.js');
const P = await import('../server/projects.js');

const sh = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const write = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); };
const read = f => fs.readFileSync(f, 'utf8');
// a bare repository holding `files` (a folder copied, then changed), on main
function bareWith(name, fill) {
  const bare = path.join(tmp, 'remotes', `${name}.git`);
  fs.mkdirSync(bare, { recursive: true });
  sh(bare, 'init', '--quiet', '--bare');
  sh(bare, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  const work = path.join(tmp, 'seed', name);
  fs.mkdirSync(work, { recursive: true });
  fill(work);
  sh(work, 'init', '--quiet');
  sh(work, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  sh(work, 'add', '-A');
  sh(work, 'commit', '--quiet', '-m', 'Starter');
  sh(work, 'push', '--quiet', bare, 'main');
  return bare;
}
const gates = dir => fs.cpSync(path.join(ROOT, 'examples', 'gates'), dir, { recursive: true });
// another author's clone of a remote
function other(bare, name) {
  const dir = path.join(tmp, 'others', name);
  fs.mkdirSync(path.dirname(dir), { recursive: true });
  sh(path.dirname(dir), 'clone', '--quiet', bare, dir);
  return dir;
}
const rejects = async (p, message, hint = null) => {
  await assert.rejects(p, e => { assert.ok(e instanceof G.GitError, e.stack); assert.equal(e.message, message); assert.equal(e.hint, hint); return true; });
};

before(async () => {
  tmp = fs.realpathSync(await scratchEnv('silinx-git-'));
  ws = process.env.SILINX_WORKSPACE;
  // git's own configuration, the tests': an author, no system's file
  write(path.join(tmp, 'gitconfig'), '[user]\n\tname = Ana Aluna\n\temail = ana@example.com\n[init]\n\tdefaultBranch = main\n');
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: path.join(tmp, 'gitconfig'), GIT_CONFIG_NOSYSTEM: '1', HOME: tmp });
  G.GIT_TESTING.localRemotes = true;
  remote = bareWith('gates', gates);
});
after(() => { G.GIT_TESTING.localRemotes = false; fs.rmSync(tmp, { recursive: true, force: true }); });

test('checkUrl: GitHub\'s https and ssh addresses only; a Classroom invitation; credentials never in a message', () => {
  G.GIT_TESTING.localRemotes = false;
  try {
    for (const [u, owner, repo] of [['https://github.com/pmnmalo/Silinx', 'pmnmalo', 'Silinx'], ['https://github.com/ds-2026/lab1-ana.git', 'ds-2026', 'lab1-ana'],
      ['git@github.com:a/b.c.git', 'a', 'b.c'], ['ssh://git@github.com/a/b', 'a', 'b'], ['https://github.com/a/b/', 'a', 'b']]) assert.deepEqual(G.checkUrl(u), { url: u, owner, repo }, u);
    for (const u of ['http://github.com/a/b', 'https://gitlab.com/a/b', 'https://github.com.evil.io/a/b', 'https://github.com/a/b/tree/main', 'ext::sh -c touch% /tmp/x',
      'file:///tmp/x', '/tmp/x.git', 'https://github.com/a_b/c', 'https://github.com/a/..', 'git@github.com:a/b;rm', '--upload-pack=x', 'https://github.com/-a/b'])
      assert.throws(() => G.checkUrl(u), e => e instanceof G.GitError && e.message.startsWith('not a GitHub repository\'s address: ') && /^Give the repository's address on GitHub/.test(e.hint), u);
    assert.throws(() => G.checkUrl('https://user:ghp_secret@gitlab.com/a/b'), { message: 'not a GitHub repository\'s address: https://gitlab.com/a/b' });
    assert.throws(() => G.checkUrl('https://classroom.github.com/a/xyz'), { message: 'a GitHub Classroom invitation, not a repository', hint: 'Accept the assignment on GitHub first, then give its repository\'s address (https://github.com/…).' });
    assert.throws(() => G.checkUrl(''), { message: 'not a GitHub repository\'s address: (none)' });
  } finally { G.GIT_TESTING.localRemotes = true; }
  assert.equal(G.redact('fatal: unable to access \'https://ana:tok@github.com/a/b/\': x'), 'fatal: unable to access \'https://github.com/a/b/\': x');
  assert.equal(G.nameFromRepo('lab1-ana.v2'), 'lab1-ana_v2');
  assert.equal(G.nameFromRepo('2026-lab'), 'p2026-lab');
});

test('clone: the project untrusted, its silinx.json the repository\'s (no change), then status, commit, push, the history and a file as it was', async () => {
  const r = await G.gitClone({ url: remote });
  assert.deepEqual(r, { project: 'gates', url: remote, repository: 'local/gates', warnings: [] });
  const pj = await P.readProject('gates');
  assert.equal(pj.trusted, false);
  assert.ok(fs.existsSync(path.join(ws, 'gates', '.git', 'silinx-trust.json')));
  assert.deepEqual(fs.readdirSync(ws).filter(n => n.startsWith('.silinx-clone')), []);
  // a write of its description leaves the mark in .git: silinx.json as the repository has it
  await P.writeProject('gates', pj);
  assert.equal(read(path.join(ws, 'gates', 'silinx.json')).includes('"trusted"'), false);
  let s = await G.gitStatus('gates');
  assert.deepEqual(s, { project: 'gates', repository: true, root: 'project', branch: 'main', upstream: 'origin/main', ahead: 0, behind: 0, files: [] });
  await rejects(G.gitCommit('gates', 'Nothing'), 'nothing to commit: the project has no change since the last commit');
  // a change, a new file, the tools' outputs
  const src = path.join(ws, 'gates', 'src', 'gates.vhd');
  const first = read(src);
  write(src, `${first}-- changed\n`);
  write(path.join(ws, 'gates', 'src', 'extra.v'), 'module extra; endmodule\n');
  write(path.join(ws, 'gates', 'build', 'gates.bit'), 'x');
  write(path.join(ws, 'gates', 'gates.ncd'), 'x');
  s = await G.gitStatus('gates');
  assert.deepEqual(s.files, [{ path: 'src/extra.v', state: 'new' }, { path: 'src/gates.vhd', state: 'modified' }]);
  await rejects(G.gitCommit('gates', '  '), 'a commit needs a message', 'Say in a few words what changed.');
  const c = await G.gitCommit('gates', 'An extra module');
  assert.match(c.commit, /^[0-9a-f]{40}$/);
  assert.deepEqual([c.branch, c.gitignore, c.files], ['main', true, [{ path: '.gitignore', state: 'new' }, { path: 'src/extra.v', state: 'new' }, { path: 'src/gates.vhd', state: 'modified' }]]);
  assert.equal(read(path.join(ws, 'gates', '.gitignore')), G.GITIGNORE);
  assert.equal(sh(path.join(ws, 'gates'), 'ls-files', 'build', 'gates.ncd'), '');
  assert.equal(sh(path.join(ws, 'gates'), 'log', '-1', '--format=%an|%s'), 'Ana Aluna|An extra module\n');
  assert.deepEqual((await G.gitStatus('gates')).ahead, 1);
  assert.deepEqual(await G.gitPush('gates'), { project: 'gates', branch: 'main', remote: 'local/gates', pushed: true });
  assert.deepEqual(await G.gitPush('gates'), { project: 'gates', branch: 'main', remote: 'local/gates', pushed: false });
  assert.equal(sh(remote, 'log', '-1', '--format=%s', 'main'), 'An extra module\n');
  // the history, the newest first; a file as it was
  const log = await G.gitLog('gates');
  assert.deepEqual(log.map(e => [e.author, e.message, e.files.length]), [['Ana Aluna', 'An extra module', 3], ['Ana Aluna', 'Starter', fs.readdirSync(path.join(ROOT, 'examples', 'gates'), { recursive: true }).filter(f => fs.statSync(path.join(ROOT, 'examples', 'gates', f)).isFile()).length]]);
  assert.match(log[0].date, /^\d{4}-\d\d-\d\dT/);
  assert.equal((await G.gitLog('gates', { limit: 1 })).length, 1);
  assert.equal((await G.gitShow('gates', log[1].commit, 'src/gates.vhd')).text, first);
  assert.equal((await G.gitShow('gates', log[0].commit.slice(0, 7), './src/gates.vhd')).text, `${first}-- changed\n`);
  await rejects(G.gitShow('gates', log[1].commit, 'src/extra.v'), `no file 'src/extra.v' in the commit ${log[1].commit.slice(0, 7)}`);
  await rejects(G.gitShow('gates', 'HEAD~1', 'src/gates.vhd'), 'not a commit: HEAD~1', 'Give a commit\'s hash, as the history lists it.');
  await rejects(G.gitShow('gates', log[0].commit, '.git/config'), '\'.git/config\': not a file of the project');
  await assert.rejects(G.gitShow('gates', log[0].commit, '../x'), { message: 'path escapes project' });
  // trusted by the user: the mark goes
  await P.trustProject('gates');
  assert.equal((await P.readProject('gates')).trusted, undefined);
  assert.equal(fs.existsSync(path.join(ws, 'gates', '.git', 'silinx-trust.json')), false);
});

test('push rejected (GitHub has commits this project has not), pull merges them; a conflict pulls nothing', async () => {
  const bare = bareWith('team', gates);
  await G.gitClone({ url: bare, name: 'team' });
  const mine = path.join(ws, 'team');
  const theirs = other(bare, 'team');
  // they change one file and push; we change another and commit
  write(path.join(theirs, 'constraints', 'notes.txt'), 'theirs\n');
  sh(theirs, 'add', '-A'); sh(theirs, 'commit', '--quiet', '-m', 'Their notes'); sh(theirs, 'push', '--quiet');
  write(path.join(mine, 'src', 'mine.v'), 'module mine; endmodule\n');
  await G.gitCommit('team', 'My module');
  await assert.rejects(G.gitPush('team'), e => {
    assert.equal(e.message, 'git push: rejected by GitHub (fetch first)');
    assert.equal(e.hint, 'GitHub has commits that this project does not: Pull first, then Push again.');
    assert.equal(e.status, 409);
    return true;
  });
  const p = await G.gitPull('team');
  assert.deepEqual(p, { project: 'team', branch: 'main', upToDate: false, files: ['constraints/notes.txt'] });
  assert.equal(read(path.join(mine, 'constraints', 'notes.txt')), 'theirs\n');
  assert.deepEqual((await G.gitPull('team')).upToDate, true);
  assert.equal((await G.gitPush('team')).pushed, true);
  // the same lines changed on both sides: nothing pulled, the files as they were, no merge left half done
  sh(theirs, 'pull', '--quiet', '--no-rebase');
  write(path.join(theirs, 'constraints', 'notes.txt'), 'theirs, again\n');
  sh(theirs, 'commit', '--quiet', '-am', 'Their change'); sh(theirs, 'push', '--quiet');
  write(path.join(mine, 'constraints', 'notes.txt'), 'mine\n');
  await G.gitCommit('team', 'My change');
  const head = sh(mine, 'rev-parse', 'HEAD');
  await assert.rejects(G.gitPull('team'), e => {
    assert.equal(e.message, 'git pull: a conflict in constraints/notes.txt: nothing was pulled, the project\'s files are as they were');
    assert.equal(e.hint, 'The same lines changed here and on GitHub. Commit your version under another name, or ask the other author, then Pull again.');
    assert.deepEqual([e.status, e.files], [409, ['constraints/notes.txt']]);
    return true;
  });
  assert.equal(read(path.join(mine, 'constraints', 'notes.txt')), 'mine\n');
  assert.equal(sh(mine, 'rev-parse', 'HEAD'), head);
  assert.equal(fs.existsSync(path.join(mine, '.git', 'MERGE_HEAD')), false);
  assert.deepEqual((await G.gitStatus('team')).files, []);
  // a change not committed that the pull would overwrite
  sh(mine, 'reset', '--quiet', '--hard', 'HEAD~1');
  write(path.join(mine, 'constraints', 'notes.txt'), 'not committed\n');
  await assert.rejects(G.gitPull('team'), e => { assert.equal(e.hint, 'Commit your changes first, then Pull.'); assert.match(e.message, /^git pull: Your local changes to the following files would be overwritten by merge:/); return true; });
});

test('init: a repository of a new project (the .gitignore, main, its GitHub remote), committed and pushed; already one', async () => {
  await P.createProject({ name: 'fresh', template: 'blinky' });
  assert.deepEqual(await G.gitStatus('fresh'), { project: 'fresh', repository: false, files: [] });
  await rejects(G.gitCommit('fresh', 'x'), 'the project \'fresh\' is not in a git repository', 'Initialize Repository… makes one, or Open from Repository… opens a project from GitHub.');
  await rejects(G.gitLog('fresh'), 'the project \'fresh\' is not in a git repository', 'Initialize Repository… makes one, or Open from Repository… opens a project from GitHub.');
  assert.deepEqual(await G.gitInit('fresh'), { project: 'fresh', created: true, remote: null, gitignore: true });
  assert.deepEqual(await G.gitLog('fresh'), []);
  await rejects(G.gitPush('fresh'), 'the repository has no remote (origin)', 'Initialize Repository… with the GitHub repository\'s address sets it.');
  const bare = path.join(tmp, 'remotes', 'fresh.git');
  fs.mkdirSync(bare, { recursive: true });
  sh(bare, 'init', '--quiet', '--bare');
  assert.deepEqual(await G.gitInit('fresh', { remote: bare }), { project: 'fresh', created: false, remote: bare, gitignore: false });
  await rejects(G.gitInit('fresh', { remote: bare }), 'the project \'fresh\' is already in a git repository with a remote');
  await rejects(G.gitPush('fresh'), 'nothing to push: the repository has no commit yet', 'Commit first.');
  await rejects(G.gitPull('fresh'), 'git pull: couldn\'t find remote ref main', 'The GitHub repository has nothing on this branch yet: Push first.');
  const c = await G.gitCommit('fresh', 'Blinky');
  assert.ok(c.files.some(f => f.path === 'silinx.json') && c.files.some(f => f.path === '.gitignore'));
  assert.equal((await G.gitPush('fresh')).pushed, true);
  assert.equal((await G.gitStatus('fresh')).upstream, 'origin/main');
  await rejects(G.gitInit('fresh'), 'the project \'fresh\' is already in a git repository with a remote');
  // a remote that is not GitHub's (written into the repository's configuration by hand): refused before git runs
  G.GIT_TESTING.localRemotes = false;
  try {
    await assert.rejects(G.gitPush('fresh'), { message: `not a GitHub repository's address: ${bare}` });
    await assert.rejects(G.gitPull('fresh'), { message: `not a GitHub repository's address: ${bare}` });
    sh(path.join(ws, 'fresh'), 'remote', 'set-url', 'origin', 'https://github.com/a/b');
    sh(path.join(ws, 'fresh'), 'remote', 'set-url', '--push', 'origin', 'https://evil.example/a/b');
    await assert.rejects(G.gitPush('fresh'), { message: 'not a GitHub repository\'s address: https://evil.example/a/b' });
  } finally { G.GIT_TESTING.localRemotes = true; }
});

test('no hook of a repository runs: its .git/hooks, a core.hooksPath of its own; git\'s own fsmonitor neither', async () => {
  const dir = path.join(ws, 'team');
  const flag = path.join(tmp, 'hook-ran');
  const hook = `#!/bin/sh\necho ran > '${flag}'\n`;
  for (const h of ['pre-commit', 'commit-msg', 'post-commit', 'pre-push', 'post-merge', 'post-checkout']) { write(path.join(dir, '.git', 'hooks', h), hook); fs.chmodSync(path.join(dir, '.git', 'hooks', h), 0o755); }
  write(path.join(dir, 'hooks2', 'pre-commit'), hook); fs.chmodSync(path.join(dir, 'hooks2', 'pre-commit'), 0o755);
  sh(dir, 'config', 'core.hooksPath', path.join(dir, 'hooks2'));
  sh(dir, 'config', 'core.fsmonitor', `sh -c "echo ran > '${flag}'"`);
  await G.gitStatus('team');
  await G.gitCommit('team', 'Hooks');
  await G.gitPull('team').catch(() => {});
  assert.equal(fs.existsSync(flag), false);
  // a filter of git's configuration (git-lfs's) that a repository's .gitattributes names: never run, by clone, commit or
  // pull; nor a submodule fetched
  const lfs = path.join(tmp, 'lfs-filter.sh');
  write(lfs, `#!/bin/sh\necho ran > '${flag}'\ncat\n`); fs.chmodSync(lfs, 0o755);
  const withLfs = bareWith('lfs', d => { gates(d); write(path.join(d, '.gitattributes'), '*.vhd filter=lfs\n'); write(path.join(d, '.gitmodules'), `[submodule "x"]\n\tpath = x\n\turl = ${remote}\n`); });
  const global = fs.readFileSync(process.env.GIT_CONFIG_GLOBAL, 'utf8');
  fs.appendFileSync(process.env.GIT_CONFIG_GLOBAL, `[filter "lfs"]\n\tsmudge = ${lfs}\n\tclean = ${lfs}\n\trequired = true\n`);
  try {
    await G.gitClone({ url: withLfs, name: 'lfs' });
    write(path.join(ws, 'lfs', 'src', 'gates.vhd'), '-- changed\n');
    await G.gitCommit('lfs', 'Through no filter');
    await G.gitPush('lfs');
    await G.gitPull('lfs');
  } finally { fs.writeFileSync(process.env.GIT_CONFIG_GLOBAL, global); }
  assert.equal(fs.existsSync(flag), false);
  assert.equal(fs.existsSync(path.join(ws, 'lfs', 'x', 'silinx.json')), false);
  // (the hooks folder of Silinx's is empty)
  const { configDir } = await import('../server/toolchain.js');
  assert.deepEqual(fs.readdirSync(path.join(configDir(), 'git-no-hooks')), []);
});

test('clone: refused into an existing project, for a repository of several projects, with no silinx.json, with a file the import gate refuses', async () => {
  await rejects(G.gitClone({ url: remote }), 'project \'gates\' already exists', 'Choose another name for the project.');
  const several = bareWith('several', d => { gates(path.join(d, 'lab1')); gates(path.join(d, 'lab2')); write(path.join(d, 'README.md'), '# labs\n'); });
  await assert.rejects(G.gitClone({ url: several }), e => {
    assert.equal(e.message, 'the repository holds several Silinx projects (lab1, lab2), not one');
    assert.equal(e.hint, 'Clone it with git as the Silinx workspace (SILINX_WORKSPACE): its projects then commit, push and pull through it.');
    assert.deepEqual(e.projects, ['lab1', 'lab2']);
    return true;
  });
  await rejects(G.gitClone({ url: bareWith('none', d => write(path.join(d, 'README.md'), 'x\n')) }), 'the repository is not a Silinx project: it has no silinx.json');
  await rejects(G.gitClone({ url: bareWith('nul', d => { gates(d); write(path.join(d, 'src', 'bad.vhd'), 'entity\0x'); }) }), 'not opened: src/bad.vhd: not imported: binary content (a NUL byte) in a text file');
  await rejects(G.gitClone({ url: bareWith('json', d => { gates(d); write(path.join(d, 'silinx.json'), '{'); }) }), 'not opened: its silinx.json is not valid JSON');
  await assert.rejects(G.gitClone({ url: path.join(tmp, 'remotes', 'missing.git') }), e => { assert.match(e.message, /^git clone: /); assert.equal(e.hint, 'Check the repository\'s address, and that your GitHub account can see it.'); return true; });
  // nothing left behind
  assert.deepEqual(fs.readdirSync(ws).filter(n => n.startsWith('.silinx-clone') || ['several', 'none', 'nul', 'json', 'missing'].includes(n)), []);
});

test('the repository: never one above the workspace; the workspace as the repository of several projects, each commit its project\'s', async () => {
  const outer = path.join(tmp, 'outer');
  const prev = process.env.SILINX_WORKSPACE;
  process.env.SILINX_WORKSPACE = path.join(outer, 'ws');
  try {
    // a repository holding the workspace (a home folder kept in git): not the projects'
    fs.mkdirSync(outer, { recursive: true });
    sh(outer, 'init', '--quiet');
    await P.createProject({ name: 'a', template: 'gates' });
    await P.createProject({ name: 'b', template: 'gates' });
    assert.deepEqual(await G.gitStatus('a'), { project: 'a', repository: false, files: [] });
    // the workspace itself a repository
    const wsDir = process.env.SILINX_WORKSPACE;
    sh(wsDir, 'init', '--quiet');
    const s = await G.gitStatus('a');
    assert.equal(s.root, 'workspace');
    assert.ok(s.files.length && s.files.every(f => f.state === 'new' && !f.path.startsWith('a/')));
    await G.gitCommit('a', 'Project a');
    assert.deepEqual(sh(wsDir, 'ls-files').split('\n').filter(Boolean).every(f => f.startsWith('a/')), true);
    assert.ok(fs.existsSync(path.join(wsDir, 'a', '.gitignore')));
    assert.ok((await G.gitStatus('b')).files.length);
    assert.deepEqual((await G.gitLog('a')).map(c => c.message), ['Project a']);
    assert.deepEqual(await G.gitLog('b'), []);
  } finally { process.env.SILINX_WORKSPACE = prev; }
});

test('git not installed: its message and hint; SILINX_GIT=off', async () => {
  const prev = process.env.PATH;
  process.env.PATH = path.join(tmp, 'no-such-bin');
  try { await rejects(G.gitStatus('gates'), 'git is not installed (or not on the PATH)', 'Install git (https://git-scm.com) and start Silinx again.'); }
  finally { process.env.PATH = prev; }
  assert.equal(G.gitEnabled(), true);
  process.env.SILINX_GIT = 'off';
  try { assert.equal(G.gitEnabled(), false); } finally { delete process.env.SILINX_GIT; }
});

test('the routes: status, commit, push, log, show; a failure\'s message and hint; SILINX_GIT=off refused', async () => {
  const app = await startApp();
  try {
    assert.deepEqual((await app.call('GET', '/git')).body, { enabled: true });
    write(path.join(ws, 'gates', 'src', 'route.v'), 'module route; endmodule\n');
    let r = await app.call('GET', '/projects/gates/git/status');
    assert.deepEqual([r.status, r.body.files], [200, [{ path: 'src/route.v', state: 'new' }]]);
    r = await app.call('POST', '/projects/gates/git/commit', { message: '' });
    assert.deepEqual([r.status, r.body], [400, { error: 'a commit needs a message', hint: 'Say in a few words what changed.' }]);
    r = await app.call('POST', '/projects/gates/git/commit', { message: 'Route' });
    assert.deepEqual([r.status, r.body.files], [200, [{ path: 'src/route.v', state: 'new' }]]);
    assert.equal((await app.call('POST', '/projects/gates/git/push')).body.pushed, true);
    assert.equal((await app.call('POST', '/projects/gates/git/pull')).body.upToDate, true);
    const log = (await app.call('GET', '/projects/gates/git/log?limit=2')).body;
    assert.deepEqual(log.map(c => c.message), ['Route', 'An extra module']);
    r = await app.call('GET', `/projects/gates/git/show?commit=${log[0].commit}&path=src/route.v`);
    assert.equal(r.body.text, 'module route; endmodule\n');
    r = await app.call('POST', '/git/clone', { url: 'https://gitlab.com/a/b' });
    assert.deepEqual([r.status, r.body.error], [400, 'not a GitHub repository\'s address: https://gitlab.com/a/b']);
    r = await app.call('GET', '/projects/nope/git/status');
    assert.deepEqual([r.status, r.body], [404, { error: 'project \'nope\' not found' }]);
    process.env.SILINX_GIT = 'off';
    try {
      r = await app.call('GET', '/projects/gates/git/status');
      assert.deepEqual([r.status, r.body], [403, { error: 'git is turned off on this server (SILINX_GIT=off)' }]);
      assert.deepEqual((await app.call('GET', '/git')).body, { enabled: false });
    } finally { delete process.env.SILINX_GIT; }
  } finally { await app.close(); }
});
