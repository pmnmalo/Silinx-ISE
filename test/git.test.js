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
  await rejects(G.gitClone({ url: bareWith('binary', d => { gates(d); write(path.join(d, 'src', 'bad.vhd'), 'entity\0x'); }) }), 'not opened: src/bad.vhd: not imported: binary content (a NUL byte) in a text file');
  await rejects(G.gitClone({ url: bareWith('json', d => { gates(d); write(path.join(d, 'silinx.json'), '{'); }) }), 'not opened: its silinx.json is not valid JSON');
  await assert.rejects(G.gitClone({ url: path.join(tmp, 'remotes', 'missing.git') }), e => { assert.match(e.message, /^git clone: /); assert.equal(e.hint, 'Check the repository\'s address, and that your GitHub account can see it.'); return true; });
  // nothing left behind
  assert.deepEqual(fs.readdirSync(ws).filter(n => n.startsWith('.silinx-clone') || ['several', 'none', 'binary', 'json', 'missing'].includes(n)), []);
});

// #3359: a hidden file is no part of a project: a clone leaves the repository's out of the folder (git's sparse
// checkout), in the repository, untouched by a commit; what a pull brings passes the import gate: a hidden file, a
// tool's output, another spelling of silinx.json taken out of the folder with its message, another refusal undoes it
const HIDDEN = { '.vscode/tasks.json': '{"tasks":[]}\n', '.envrc': 'export X=1\n', '.gitattributes': '*.vhd filter=x\n', '.github/workflows/ci.yml': 'on: push\n', 'src/.idea/x.xml': '<x/>\n' };
const onDisk = dir => fs.readdirSync(dir, { recursive: true }).map(f => f.split(path.sep).join('/')).filter(f => !f.startsWith('.git/') && f !== '.git' && fs.statSync(path.join(dir, f)).isFile()).sort();

test('clone: the repository\'s hidden files stay out of the project\'s folder, in the repository; a commit leaves them', async () => {
  const bare = bareWith('dotted', d => { gates(d); write(path.join(d, '.gitignore'), 'build/\n'); for (const [f, t] of Object.entries(HIDDEN)) write(path.join(d, f), t); });
  const r = await G.gitClone({ url: bare, name: 'dotted' });
  assert.deepEqual(r.warnings, []);
  const dir = path.join(ws, 'dotted');
  for (const f of Object.keys(HIDDEN)) assert.equal(fs.existsSync(path.join(dir, f)), false, f);
  assert.deepEqual(['.vscode', '.github', 'src/.idea'].filter(d => fs.existsSync(path.join(dir, d))), []);
  assert.equal(read(path.join(dir, '.gitignore')), 'build/\n');
  assert.deepEqual(onDisk(dir).filter(f => f.split('/').some(s => s.startsWith('.'))), ['.gitignore']);
  assert.deepEqual((await G.gitStatus('dotted')).files, []);
  write(path.join(dir, 'src', 'extra.v'), 'module extra; endmodule\n');
  assert.deepEqual((await G.gitCommit('dotted', 'Extra')).files, [{ path: 'src/extra.v', state: 'new' }]);
  await G.gitPush('dotted');
  for (const [f, t] of Object.entries(HIDDEN)) assert.equal(sh(bare, 'show', `main:${f}`), t, f);
  // a pull that changes them: still out of the folder
  const theirs = other(bare, 'dotted');
  write(path.join(theirs, '.vscode', 'tasks.json'), '{"tasks":[1]}\n');
  write(path.join(theirs, '.vscode', 'launch.json'), '{}\n');
  write(path.join(theirs, 'src', 'theirs.v'), 'module theirs; endmodule\n');
  sh(theirs, 'add', '-A'); sh(theirs, 'commit', '--quiet', '-m', 'Theirs'); sh(theirs, 'push', '--quiet');
  assert.deepEqual(await G.gitPull('dotted'), { project: 'dotted', branch: 'main', upToDate: false, files: ['src/theirs.v'] });
  assert.equal(fs.existsSync(path.join(dir, '.vscode')), false);
  assert.deepEqual((await G.gitStatus('dotted')).files, []);
});

test('pull: its files pass the import gate; a hidden file, a tool\'s output, another spelling of silinx.json taken out, with their messages; another refusal pulls nothing', async () => {
  const bare = bareWith('pulled', gates);
  // a project cloned by hand into the workspace (no sparse checkout): what a pull brings is gated all the same
  sh(ws, 'clone', '--quiet', bare, 'pulled');
  const dir = path.join(ws, 'pulled');
  const theirs = other(bare, 'pulled');
  for (const [f, t] of Object.entries(HIDDEN)) write(path.join(theirs, f), t);
  write(path.join(theirs, 'build', 'top.bit'), 'bits');
  write(path.join(theirs, 'src', 'SILINX.JSON'), '{"trusted":true}\n');
  write(path.join(theirs, 'src', 'theirs.v'), 'module theirs; endmodule\n');
  write(path.join(theirs, '.gitignore'), 'xst/\n');
  sh(theirs, 'add', '-A'); sh(theirs, 'commit', '--quiet', '-m', 'Theirs'); sh(theirs, 'push', '--quiet');
  const p = await G.gitPull('pulled');
  assert.deepEqual(p, { project: 'pulled', branch: 'main', upToDate: false, files: ['.gitignore', 'src/theirs.v'], warnings: [
    '.envrc: not pulled into the project: hidden file or folder (\'.envrc\')',
    '.gitattributes: not pulled into the project: hidden file or folder (\'.gitattributes\')',
    '.github/workflows/ci.yml: not pulled into the project: hidden file or folder (\'.github\')',
    '.vscode/tasks.json: not pulled into the project: hidden file or folder (\'.vscode\')',
    'build/top.bit: not pulled into the project: a tool\'s output, made again from the sources',
    'src/.idea/x.xml: not pulled into the project: hidden file or folder (\'.idea\')',
    'src/SILINX.JSON: not pulled into the project: another spelling of silinx.json, the project\'s description (\'SILINX.JSON\')',
  ] });
  assert.deepEqual(onDisk(dir).filter(f => !fs.existsSync(path.join(ROOT, 'examples', 'gates', f))), ['.gitignore', 'src/theirs.v']);
  assert.deepEqual(['.vscode', '.github', 'build', 'src/.idea'].filter(d => fs.existsSync(path.join(dir, d))), []);
  // in the repository still: no commit deletes them
  assert.deepEqual((await G.gitStatus('pulled')).files, []);
  write(path.join(dir, 'src', 'mine.v'), 'module mine; endmodule\n');
  assert.deepEqual((await G.gitCommit('pulled', 'Mine')).files, [{ path: 'src/mine.v', state: 'new' }]);
  assert.equal(sh(dir, 'show', 'HEAD:.envrc'), HIDDEN['.envrc']);
  await G.gitPush('pulled');
  // another refusal (a NUL byte in a source): nothing pulled, the branch where it was
  sh(theirs, 'pull', '--quiet', '--no-rebase');
  write(path.join(theirs, 'src', 'bad.vhd'), 'entity\0x');
  write(path.join(theirs, 'src', 'good.v'), 'module good; endmodule\n');
  write(path.join(theirs, '.vscode', 'tasks.json'), '{"tasks":[2]}\n');
  sh(theirs, 'add', '-A'); sh(theirs, 'commit', '--quiet', '-m', 'Bad'); sh(theirs, 'push', '--quiet');
  write(path.join(dir, 'src', 'notes.txt'), 'not committed\n');
  const head = sh(dir, 'rev-parse', 'HEAD');
  await assert.rejects(G.gitPull('pulled'), e => {
    assert.equal(e.message, 'git pull: src/bad.vhd: not imported: binary content (a NUL byte) in a text file: nothing was pulled, the project\'s files are as they were');
    assert.deepEqual([e.hint, e.status], [null, 422]);
    return true;
  });
  assert.equal(sh(dir, 'rev-parse', 'HEAD'), head);
  assert.deepEqual(['src/bad.vhd', 'src/good.v', '.vscode'].filter(f => fs.existsSync(path.join(dir, f))), []);
  assert.equal(read(path.join(dir, 'src', 'notes.txt')), 'not committed\n');
  assert.deepEqual((await G.gitStatus('pulled')).files, [{ path: 'src/notes.txt', state: 'new' }]);
});

// #3524: a pulled name that another tracked file has but for its case is one file on a case-insensitive file system
// (macOS's, Windows'): a pulled SILINX.JSON wrote over the project's silinx.json, then the gate's taking it out (another
// spelling of silinx.json) deleted it, and the project was gone. Such a pull is refused and undone on any file system
// (as a clone's gate refuses the name); the other file as it was, its changes not committed too.
test('pull: a name another tracked file has but for its case is refused and undone; silinx.json kept, the project opens (#3524)', async () => {
  const bare = bareWith('clash', gates);
  await G.gitClone({ url: bare, name: 'clash' });
  const dir = path.join(ws, 'clash');
  const pj = read(path.join(dir, 'silinx.json')), vhd = read(path.join(dir, 'src', 'gates.vhd'));
  const head = sh(dir, 'rev-parse', 'HEAD');
  // whether this file system is case-insensitive (the case the issue's loss happened on)
  const folds = fs.existsSync(path.join(dir, 'SILINX.JSON'));
  // another author's commit of names that differ from tracked ones only by their case (written into git's index, so
  // that it is made on any file system)
  const theirs = other(bare, 'clash');
  sh(theirs, 'config', 'core.ignorecase', 'false');
  const add = (f, t) => { write(path.join(tmp, 'blob'), t); sh(theirs, 'update-index', '--add', '--cacheinfo', `100644,${sh(theirs, 'hash-object', '-w', path.join(tmp, 'blob')).trim()},${f}`); };
  add('SILINX.JSON', '{"name":"other","trusted":true}\n');
  add('src/GATES.vhd', '-- theirs\n');
  add('src/theirs.v', 'module theirs; endmodule\n');
  sh(theirs, 'commit', '--quiet', '-m', 'Clash'); sh(theirs, 'push', '--quiet');
  // a change of silinx.json not committed: kept as it is
  const mine = pj.replace(/\n$/, '') + ' \n';
  write(path.join(dir, 'silinx.json'), mine);
  await rejects(G.gitPull('clash'), 'git pull: SILINX.JSON: not imported: same name as \'silinx.json\' but for its case; src/GATES.vhd: not imported: same name as \'src/gates.vhd\' but for its case: nothing was pulled, the project\'s files are as they were');
  assert.equal(sh(dir, 'rev-parse', 'HEAD'), head);
  assert.deepEqual(fs.readdirSync(dir).filter(f => /^silinx\.json$/i.test(f)), ['silinx.json'], `case-insensitive: ${folds}`);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'src')).sort(), ['gates.sch.json', 'gates.vhd']);
  assert.equal(read(path.join(dir, 'silinx.json')), mine);
  assert.equal(read(path.join(dir, 'src', 'gates.vhd')), vhd);
  assert.deepEqual((await G.gitStatus('clash')).files, [{ path: 'silinx.json', state: 'modified' }]);
  assert.ok((await P.listProjects()).some(p => (p.name ?? p) === 'clash'));
  assert.equal((await P.readProject('clash')).name, 'clash');
  assert.equal((await P.readProject('clash')).trusted, false);
  // the same pull again, with nothing changed here: refused the same way, the commit's silinx.json kept
  write(path.join(dir, 'silinx.json'), pj);
  await assert.rejects(G.gitPull('clash'), e => e instanceof G.GitError && e.status === 422 && /^git pull: SILINX\.JSON: not imported: same name as 'silinx\.json' but for its case; /.test(e.message));
  assert.equal(read(path.join(dir, 'silinx.json')), pj);
  assert.deepEqual((await G.gitStatus('clash')).files, []);
  // once the other author takes the names back, the pull brings the rest
  sh(theirs, 'rm', '--quiet', '--cached', 'SILINX.JSON', 'src/GATES.vhd');
  sh(theirs, 'commit', '--quiet', '-m', 'Names back'); sh(theirs, 'push', '--quiet');
  assert.deepEqual(await G.gitPull('clash'), { project: 'clash', branch: 'main', upToDate: false, files: ['src/theirs.v'] });
  assert.equal(read(path.join(dir, 'silinx.json')), pj);
  assert.equal(read(path.join(dir, 'src', 'gates.vhd')), vhd);
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

// #3523: a repository's own configuration can name programs git runs (a filter, a driver, a helper), files to include
// and addresses rewritten: git runs in no such repository; every URL of the remote is checked
test('a repository whose own configuration names a program, an included file or a rewritten address: no git command runs in it; every push URL checked', async () => {
  await P.createProject({ name: 'own-config', template: 'gates' });
  const dir = path.join(ws, 'own-config');
  sh(dir, 'init', '--quiet'); sh(dir, 'add', '-A'); sh(dir, 'commit', '--quiet', '-m', 'First');
  const flag = path.join(tmp, 'config-ran');
  const run = `sh -c "echo ran >> '${flag}'; cat"`;
  const refused = key => ({ message: `the repository's own configuration sets '${key}': Silinx runs no git command in it`, status: 409,
    hint: `A repository made or cloned by Silinx has no such setting: remove it if you trust it (git config --local --unset-all ${key}), or open the repository again with Open from Repository….` });
  // a filter, named by the repository's own attributes file: nothing runs, by a status, a commit or the log
  write(path.join(dir, '.git', 'info', 'attributes'), '* filter=x\n');
  for (const [key, value] of [['filter.x.clean', run], ['filter.x.smudge', run], ['filter.x.process', run], ['merge.x.driver', run], ['diff.x.textconv', run],
    ['diff.x.command', run], ['gpg.program', run], ['gpg.ssh.program', run], ['credential.helper', `!${run}`], ['core.sshCommand', run], ['core.pager', run], ['core.editor', run],
    ['core.gitProxy', run], ['core.askPass', run], ['core.attributesFile', flag], ['core.worktree', tmp], ['include.path', flag], ['includeIf.gitdir:/.path', flag],
    ['url.https://example.com/.insteadOf', 'https://github.com/'], ['remote.origin.vcs', 'x'], ['remote.origin.uploadpack', run], ['remote.origin.receivepack', run],
    ['remote.origin.proxy', 'http://example.com'], ['uploadpack.packObjectsHook', run], ['sequence.editor', run], ['alias.status', `!${run}`]]) {
    sh(dir, 'config', key, value);
    const listed = key.replace(/^[^.]+/, s => s.toLowerCase()).replace(/[^.]+$/, s => s.toLowerCase());
    if (key === 'core.worktree') { assert.deepEqual(await G.gitStatus('own-config'), { project: 'own-config', repository: false, files: [] }); }   // (no repository of the project's: nothing runs)
    else {
      await assert.rejects(G.gitStatus('own-config'), refused(listed), key);
      await assert.rejects(G.gitCommit('own-config', 'x'), refused(listed), key);
      await assert.rejects(G.gitLog('own-config'), refused(listed), key);
    }
    sh(dir, 'config', '--unset-all', key);
  }
  assert.equal(fs.existsSync(flag), false);
  // the attributes file alone names a filter no configuration defines: git runs, and nothing else does
  assert.deepEqual((await G.gitStatus('own-config')).files, []);
  // the settings a clone, Silinx and the usual tools write: accepted
  for (const [key, value] of [['user.name', 'Ana'], ['branch.main.description', 'x'], ['branch.main.vscode-merge-base', 'origin/main'], ['remote.origin.gh-resolved', 'base'], ['pull.rebase', 'false'], ['core.autocrlf', 'input'], ['commit.gpgsign', 'false']]) sh(dir, 'config', key, value);
  assert.equal((await G.gitStatus('own-config')).repository, true);
  assert.equal(fs.existsSync(flag), false);
  // a second push URL that is not GitHub's: the push refused before git pushes to any
  G.GIT_TESTING.localRemotes = false;
  try {
    sh(dir, 'config', 'remote.origin.url', 'https://github.com/a/b');
    sh(dir, 'remote', 'set-url', '--push', 'origin', 'https://github.com/a/b');
    sh(dir, 'remote', 'set-url', '--add', '--push', 'origin', 'https://elsewhere.example/a/b');
    await assert.rejects(G.gitPush('own-config'), { message: 'not a GitHub repository\'s address: https://elsewhere.example/a/b' });
    sh(dir, 'remote', 'set-url', '--add', 'origin', 'https://elsewhere.example/c/d');
    sh(dir, 'config', '--unset-all', 'remote.origin.pushurl');
    await assert.rejects(G.gitPull('own-config'), { message: 'not a GitHub repository\'s address: https://elsewhere.example/c/d' });
  } finally { G.GIT_TESTING.localRemotes = true; }
});

// #3613: Windows' temporary folder can be a short (8.3) name (RUNNER~1 for runneradmin), which fs.realpathSync leaves
// as it is while git names the repository by its long name: the project's folder in its native form, as git's.
// Emulated: the workspace through a symbolic link, which git resolves and a realpath that resolves nothing leaves
test('#3613 a workspace named by an alias the system resolves (Windows\' short names): its projects\' repositories found', async () => {
  const alias = path.join(tmp, 'alias-ws');
  fs.symlinkSync(ws, alias, 'junction');
  const realpathSync = fs.realpathSync;
  fs.realpathSync = Object.assign(p => path.resolve(String(p)), { native: realpathSync.native });
  process.env.SILINX_WORKSPACE = alias;
  try {
    const s = await G.gitStatus('gates');
    assert.deepEqual([s.repository, s.root, s.branch], [true, 'project', 'main']);
  } finally { fs.realpathSync = realpathSync; process.env.SILINX_WORKSPACE = ws; fs.rmSync(alias); }
});
