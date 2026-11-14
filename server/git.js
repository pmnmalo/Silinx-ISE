// Git, phase 1 (#3195, the plan #3194): a project of the server editions in a GitHub repository, through the system's
// git: clone (Open from Repository), init, status (the Design pane's marks), commit, push, pull, the history and a file
// as it was in a commit. The interface's routes (git-routes.js) and the MCP's tools (mcp-git.js) call these functions.
//
// The repository is the one holding the project's folder: the folder itself (a clone, a Classroom assignment), or the
// workspace when it is a clone of a repository of several projects; never one above the workspace
// (GIT_CEILING_DIRECTORIES), and every command limited to the project's folder (the pathspec '.').
// How git runs (the security notes of #3195): spawned with an argument array, never through a shell, with a timeout;
// no prompt (GIT_TERMINAL_PROMPT=0, ssh in batch mode); no hook of a repository runs (core.hooksPath, an empty folder of
// Silinx's), nor its fsmonitor, nor git-lfs's filter; no submodule is fetched; https and ssh only (protocol.allow), the remotes github.com's (checkUrl); no symbolic link
// checked out. The credentials are the system's credential helper's: Silinx never asks for, stores or logs one (an
// error's URLs lose their user:password@).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as P from './projects.js';
import { checkUrl as checkGithubUrl, redact, nameFromRepo } from '../core/github-url.js';
import { foldName } from '../core/fold-name.js';

/** A git command's failure: its message (git's own line), a hint for the user, the HTTP status; files: a conflict's. */
export class GitError extends Error {
  constructor(message, hint = null, status = 400, extra = {}) { super(message); Object.assign(this, { hint, status }, extra); }
}

// the tests' remotes (a local bare repository, no network): a folder's absolute path taken for a URL; remoteOf: the
// folder a GitHub address is cloned from (the UI tests', test/ui/serve.js); never set by the server or the MCP
export const GIT_TESTING = { localRemotes: false, remoteOf: null };

/** git turned off (SILINX_GIT=off: a hosted server whose operator does not want its account's credentials used). */
export const gitEnabled = () => String(process.env.SILINX_GIT || '').toLowerCase() !== 'off';

// ------------------------------------------------------------------ the URLs (core/github-url.js, the interface's too)
/** A remote's URL, checked: github.com's, https or ssh -> { url, owner, repo }; or a GitError. */
export function checkUrl(url) {
  const u = String(url ?? '').trim();
  if (GIT_TESTING.localRemotes && path.isAbsolute(u)) return { url: u, owner: 'local', repo: path.basename(u).replace(/\.git$/, '') };
  try { return checkGithubUrl(u); } catch (e) { throw new GitError(e.message, e.hint); }
}
export { redact, nameFromRepo };

// ------------------------------------------------------------------ running git
const noHooksDir = async () => {
  const { configDir } = await import('./toolchain.js');
  const dir = path.join(configDir(), 'git-no-hooks');
  await fsp.mkdir(dir, { recursive: true });
  return dir;
};

// the environment: the server's, without what would point git at another repository, with no prompt, in English (the
// messages are recognised), never looking for a repository above the workspace
function gitEnv() {
  const env = { ...process.env, GIT_TERMINAL_PROMPT: '0', LC_ALL: 'C', LANGUAGE: 'C' };
  for (const k of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES']) delete env[k];
  let ws = P.workspaceDir();
  try { ws = fs.realpathSync.native(ws); } catch { /* not made yet */ }   // (a Windows short name expanded, as git does)
  env.GIT_CEILING_DIRECTORIES = path.dirname(ws);
  if (!env.GIT_SSH_COMMAND) env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes';
  return env;
}

const MAX_OUT = 16 << 20;

/** Run git: { code, stdout, stderr }; ENOENT (no git) a GitError. */
export async function git(args, { cwd, timeout = 60_000 } = {}) {
  const base = ['-c', `core.hooksPath=${await noHooksDir()}`, '-c', 'core.fsmonitor=false', '-c', 'core.symlinks=false',
    '-c', 'core.quotePath=false', '-c', 'color.ui=false', '-c', 'submodule.recurse=false', '-c', 'fetch.recurseSubmodules=false',
    // (a repository's .gitattributes names a filter; its command is git's configuration's, never the repository's: the
    // user's git-lfs, the one such filter commonly set, off, its pointer files kept)
    '-c', 'filter.lfs.smudge=', '-c', 'filter.lfs.clean=', '-c', 'filter.lfs.process=', '-c', 'filter.lfs.required=false',
    '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', '-c', 'protocol.ssh.allow=always',
    ...(GIT_TESTING.localRemotes ? ['-c', 'protocol.file.allow=always'] : [])];
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawn('git', [...base, ...args], { cwd, env: gitEnv(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false }); } catch (e) { reject(e); return; }
    const out = [], err = [];
    let size = 0;
    const take = (list, d) => { size += d.length; if (size <= MAX_OUT) list.push(d); };
    child.stdout.on('data', d => take(out, d));
    child.stderr.on('data', d => take(err, d));
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeout);
    timer.unref?.();
    child.on('error', e => {
      clearTimeout(timer);
      reject(e.code === 'ENOENT' ? new GitError('git is not installed (or not on the PATH)', 'Install git (https://git-scm.com) and start Silinx again.', 501) : e);
    });
    child.on('close', code => {
      clearTimeout(timer);
      if (timedOut) { reject(new GitError(`git ${args[0]} took longer than ${Math.round(timeout / 1000)} s and was stopped`, 'Check the network and the repository\'s address, then try again.', 504)); return; }
      resolve({ code, stdout: Buffer.concat(out).toString('utf8'), stderr: redact(Buffer.concat(err).toString('utf8')) });
    });
  });
}

// git's message of a failure: its first error line (fatal:, error:, a rejected ref), else its last line
const firstLine = text => {
  const lines = String(text).split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const l = lines.find(x => /^(fatal|error):/.test(x)) || lines.find(x => /^! \[/.test(x)) || lines.filter(x => !/^hint:/.test(x)).pop() || 'failed';
  return l.replace(/^(fatal|error):\s*/, '');
};

/** A failed command's GitError: git's line and the hint of the known cases. */
function explain(op, r) {
  const t = `${r.stderr}\n${r.stdout}`;
  const line = firstLine(r.stderr || r.stdout);
  const hint =
    /\[rejected\]|non-fast-forward|fetch first|Updates were rejected/.test(t) ? 'GitHub has commits that this project does not: Pull first, then Push again.'
    : /Authentication failed|could not read Username|terminal prompts disabled|Permission denied \(publickey|Invalid username or password|The requested URL returned error: 40[13]/.test(t)
      ? 'git has no credentials for GitHub: sign in once with GitHub\'s command line (gh auth login) or Git Credential Manager, or add an SSH key to GitHub; Silinx itself never asks for a password or a token.'
    : /Repository not found|repository '.*' does not exist|does not appear to be a git repository|returned error: 404/.test(t) ? 'Check the repository\'s address, and that your GitHub account can see it.'
    : /Could not resolve host|unable to access|Connection timed out|Network is unreachable/.test(t) ? 'GitHub could not be reached: check the network.'
    : /Please tell me who you are|Author identity unknown|empty ident name/.test(t) ? 'Tell git who you are, once: git config --global user.name "Your Name" and git config --global user.email you@example.com.'
    : /would be overwritten by merge|Please commit your changes or stash them/.test(t) ? 'Commit your changes first, then Pull.'
    : /refusing to merge unrelated histories/.test(t) ? 'This project and the GitHub repository have no commit in common: open the repository with Open from Repository… instead.'
    : /couldn't find remote ref|no such ref was fetched/.test(t) ? 'The GitHub repository has nothing on this branch yet: Push first.'
    : /Not possible to fast-forward/.test(t) ? 'Pull merges GitHub\'s commits with yours; check git\'s pull.ff setting.'
    : /already exists and is not an empty directory/.test(t) ? 'Choose another name for the project.'
    : null;
  // (a rejected push: its reason, not git's "failed to push some refs to <the remote's path>")
  const rejected = /\[rejected\]\s*\(([^)]+)\)/.exec(t);
  return new GitError(`git ${op}: ${rejected ? `rejected by GitHub (${rejected[1]})` : line}`, hint, rejected ? 409 : 400);
}

const ok = async (op, args, opt) => {
  const r = await git(args, opt);
  if (r.code) throw explain(op, r);
  return r.stdout;
};

// ------------------------------------------------------------------ a project's repository
// (the system's resolution, as git's own: on Windows the temporary folder is often a short (8.3) name, RUNNER~1, that
// git reports by its long one and fs.realpathSync keeps as it is, #3611)
const real = p => { try { return path.resolve(fs.realpathSync.native(p)); } catch { return path.resolve(p); } };
const same = (a, b) => (process.platform === 'win32' || process.platform === 'darwin' ? a.toLowerCase() === b.toLowerCase() : a === b);

/** The repository holding a project: { dir, top, prefix, root: 'project' | 'workspace' }, or null (none, or one above
 *  the workspace). */
async function repoOf(name) {
  await P.readProject(name);
  const dir = P.projectDir(name);
  const r = await git(['rev-parse', '--show-toplevel', '--show-prefix'], { cwd: dir });
  if (r.code) return null;
  const [top, prefix = ''] = r.stdout.split(/\r?\n/);
  const t = real(top), d = real(dir), ws = real(P.workspaceDir());
  const root = same(t, d) ? 'project' : same(t, ws) ? 'workspace' : null;
  if (!root) return null;
  await checkRepoConfig(dir);
  return { dir, top: t, prefix: prefix.trim(), root };
}

// the repository's own configuration holds nothing that makes git run a program or read another file (#3523,
// git-repo-config.js): checked before any other command runs in it
async function checkRepoConfig(cwd) {
  const list = async scope => { const c = await git(['config', `--${scope}`, '--no-includes', '--list', '-z'], { cwd }); return c.code ? '' : c.stdout; };
  const setting = await repoConfigProblem(list);
  if (setting) throw new GitError(`the repository's own configuration sets '${setting}': Silinx runs no git command in it`, `A repository made or cloned by Silinx has no such setting: remove it if you trust it (git config --local --unset-all ${setting}), or open the repository again with Open from Repository….`, 409);
}

async function needRepo(name) {
  const repo = await repoOf(name);
  if (!repo) throw new GitError(`the project '${name}' is not in a git repository`, 'Initialize Repository… makes one, or Open from Repository… opens a project from GitHub.', 409);
  return repo;
}

// the tools' outputs and Silinx's .gitignore (core/git-ignore.js, the browser's back end's too)
import { GLOBS, EXCLUDE, isOutput, GITIGNORE } from '../core/git-ignore.js';
import { repoConfigProblem } from './git-repo-config.js';
export { GITIGNORE };

async function ensureGitignore(dir) {
  const f = path.join(dir, '.gitignore');
  if (fs.existsSync(f)) return false;
  await fsp.writeFile(f, GITIGNORE);
  return true;
}

const branchOf = async cwd => (await git(['symbolic-ref', '--quiet', '--short', 'HEAD'], { cwd })).stdout.trim() || null;
const headOf = async cwd => { const r = await git(['rev-parse', '--verify', '--quiet', 'HEAD'], { cwd }); return r.code ? null : r.stdout.trim(); };

// origin's URLs (fetch and push), checked: github.com's
async function origin(cwd) {
  const r = await git(['remote', 'get-url', 'origin'], { cwd });
  if (r.code) throw new GitError('the repository has no remote (origin)', 'Initialize Repository… with the GitHub repository\'s address sets it.', 409);
  // (every URL of the remote, #3523: git fetches from the first, and pushes to each push URL)
  const all = async flags => (await git(['remote', 'get-url', ...flags, '--all', 'origin'], { cwd })).stdout.split(/\r?\n/).map(u => u.trim()).filter(Boolean);
  for (const u of [...await all([]), ...await all(['--push'])]) checkUrl(u);
  return checkUrl(r.stdout.trim());
}

// the trust of the projects whose files a git command changes (#2830): an untrusted project's mark kept in the
// repository's .git first (P.keepTrustInRepo), so that no commit checked out (a pull, a merge) trusts it, whatever its
// silinx.json says; the workspace's repository: every project of it. -> the projects' names, for broughtUntrusted
async function keepTrust(name, repo) {
  const names = repo.root === 'workspace' ? (await P.listProjects()).map(p => p.name) : [name];
  for (const n of names) {
    try { await P.keepTrustInRepo(n, repo.root); }
    catch (e) { throw new GitError(`the project '${n}' is untrusted and its mark could not be kept in the repository's .git (${e.code || e.message}): nothing was done`, null, 500); }
  }
  return new Set(names.map(n => n.toLowerCase()));
}
// a project that a pull into the workspace's repository brought: from outside, untrusted
async function broughtUntrusted(repo, had) {
  if (repo.root !== 'workspace') return;
  // each on its own (#3522): one that cannot be marked never leaves the ones after it trusted
  const failed = [];
  for (const p of await P.listProjects()) {
    if (had.has(p.name.toLowerCase())) continue;
    try { await P.keepTrustInRepo(p.name, 'workspace', { fromOutside: true }); }
    catch (e) { failed.push(`'${p.name}' (${e.code || e.message})`); }
  }
  if (failed.length) throw new GitError(`the pull brought ${failed.join(', ')}, which could not be marked untrusted in the repository's .git`, 'Do not run Xilinx ISE nor program a board from it: move its folder out of the workspace.', 500);
}

// ------------------------------------------------------------------ the commands
/** The project's changes: { repository, root, branch, upstream, ahead, behind, files: [{ path, state }] }, the state
 *  'modified', 'new', 'deleted' or 'conflict'; the paths the project's. Not a repository: { repository: false }. */
export async function gitStatus(name) {
  const repo = await repoOf(name);
  if (!repo) return { project: name, repository: false, files: [] };
  const out = await ok('status', ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all', '--', '.'], { cwd: repo.dir });
  const s = { project: name, repository: true, root: repo.root, branch: null, upstream: null, ahead: 0, behind: 0, files: [] };
  const recs = out.split('\0');
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i];
    if (!rec) continue;
    if (rec.startsWith('# branch.head ')) s.branch = rec.slice(14) === '(detached)' ? null : rec.slice(14);
    else if (rec.startsWith('# branch.upstream ')) s.upstream = rec.slice(18);
    else if (rec.startsWith('# branch.ab ')) { const m = /\+(\d+) -(\d+)/.exec(rec); if (m) [s.ahead, s.behind] = [+m[1], +m[2]]; }
    else {
      const kind = rec[0];
      let file, state;
      if (kind === '?') { file = rec.slice(2); state = 'new'; }
      else if (kind === '1' || kind === '2') {
        const f = rec.split(' ');
        const xy = f[1];
        file = f.slice(kind === '1' ? 8 : 9).join(' ');
        state = kind === '2' || xy[0] === 'A' ? 'new' : xy.includes('D') ? 'deleted' : 'modified';
        if (kind === '2') i++;   // (the rename's old path follows)
      } else if (kind === 'u') { file = rec.split(' ').slice(10).join(' '); state = 'conflict'; }
      else continue;
      if (!file.startsWith(repo.prefix)) continue;
      const rel = file.slice(repo.prefix.length);
      if (!isOutput(rel)) s.files.push({ path: rel, state });
    }
  }
  s.files.sort((a, b) => a.path.localeCompare(b.path));
  return s;
}

/** Make a repository of a project (or give one with no remote its origin): git init, the .gitignore; remote: the GitHub
 *  repository's address (optional). */
export async function gitInit(name, { remote = null } = {}) {
  const repo = await repoOf(name);
  const url = remote ? checkUrl(remote).url : null;
  if (repo) {
    const has = !(await git(['remote', 'get-url', 'origin'], { cwd: repo.dir })).code;
    if (!url || has) throw new GitError(`the project '${name}' is already in a git repository${has ? ' with a remote' : ''}`, null, 409);
    await keepTrust(name, repo);
    await ok('remote', ['remote', 'add', 'origin', url], { cwd: repo.dir });
    return { project: name, created: false, remote: url, gitignore: false };
  }
  const dir = P.projectDir(name);
  await ok('init', ['init', '--quiet'], { cwd: dir });
  await ok('init', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: dir });
  await keepTrust(name, { root: 'project' });
  if (url) await ok('remote', ['remote', 'add', 'origin', url], { cwd: dir });
  const gitignore = await ensureGitignore(dir);
  return { project: name, created: true, remote: url, gitignore };
}

/** Commit the project's changes (its folder's files only, the tools' outputs never): { commit, branch, files }. */
export async function gitCommit(name, message) {
  const msg = String(message ?? '').trim();
  if (!msg) throw new GitError('a commit needs a message', 'Say in a few words what changed.');
  if (msg.length > 10_000) throw new GitError('the commit message is too long (at most 10000 characters)');
  const repo = await needRepo(name);
  const nothing = () => new GitError('nothing to commit: the project has no change since the last commit', null, 409);
  if (!(await gitStatus(name)).files.length) throw nothing();
  const gitignore = await ensureGitignore(repo.dir);
  // (everything added, then the outputs taken out again: git add refuses a pathspec its .gitignore ignores)
  await ok('add', ['add', '--all', '--', '.'], { cwd: repo.dir });
  await ok('reset', ['reset', '--quiet', '--', ...GLOBS.map(g => `:(glob)${g}`)], { cwd: repo.dir });
  const staged = (await ok('diff', ['diff', '--cached', '--name-status', '--relative', '--', '.', ...EXCLUDE], { cwd: repo.dir })).split('\n').filter(Boolean);
  if (!staged.length) throw nothing();
  await ok('commit', ['commit', '--quiet', '--no-verify', '-m', msg, '--', '.', ...EXCLUDE], { cwd: repo.dir });
  const files = staged.map(l => { const [st, ...p] = l.split('\t'); return { path: p.pop(), state: st[0] === 'A' || st[0] === 'R' ? 'new' : st[0] === 'D' ? 'deleted' : 'modified' }; });
  return { project: name, commit: await headOf(repo.dir), branch: await branchOf(repo.dir), files, gitignore };
}

/** Push the project's branch to GitHub (origin; its upstream set the first time): { branch, remote, pushed }. */
export async function gitPush(name) {
  const repo = await needRepo(name);
  const remote = await origin(repo.dir);
  const branch = await branchOf(repo.dir);
  if (!branch) throw new GitError('the project is on no branch (a detached HEAD)', 'Check out a branch with git, then Push.', 409);
  if (!await headOf(repo.dir)) throw new GitError('nothing to push: the repository has no commit yet', 'Commit first.', 409);
  const r = await git(['push', '--porcelain', '--set-upstream', 'origin', `HEAD:refs/heads/${branch}`], { cwd: repo.dir, timeout: 180_000 });
  if (r.code) throw explain('push', r);
  const flag = (r.stdout.split('\n').find(l => /^[ +\-*!=]\t/.test(l)) || '')[0];
  return { project: name, branch, remote: `${remote.owner}/${remote.repo}`, pushed: flag !== '=' };
}

/** The checks GitHub ran on the project's last pushed commit (#3194: a Classroom assignment's visible tests): the
 *  branch's upstream, read through GitHub's API with the environment's token (GH_TOKEN; none: a public repository's). */
export async function gitChecks(name) {
  const repo = await needRepo(name);
  const remote = await origin(repo.dir);
  const up = await git(['rev-parse', '--verify', '--quiet', '@{upstream}'], { cwd: repo.dir });
  if (up.code || !up.stdout.trim()) throw new GitError('nothing pushed to GitHub yet: the branch has no upstream', 'Push first: GitHub then runs the repository\'s workflows on the commit.', 409);
  const [{ apiClient }, { commitChecks }] = await Promise.all([import('./git-github.js'), import('../core/github-checks.js')]);
  return { project: name, remote: `${remote.owner}/${remote.repo}`, ...await commitChecks(apiClient(), { owner: remote.owner, repo: remote.repo, ref: up.stdout.trim() }) };
}

/** Pull GitHub's commits into the project (a merge, never a rebase): { branch, files, upToDate, resolved }. The
 *  drawings both sides changed are merged by their objects (server/git-merge.js), by the choices of `resolve` where an
 *  object is in conflict; any other conflict pulls nothing (the merge aborted: the files as they were) and is a
 *  GitError with its files, and the drawings' conflicts still to choose (`drawings`). An untrusted project stays so,
 *  whatever the pulled silinx.json says (#2830, keepTrust). */
export async function gitPull(name, { resolve = null } = {}) {
  const repo = await needRepo(name);
  await origin(repo.dir);
  const branch = await branchOf(repo.dir);
  if (!branch) throw new GitError('the project is on no branch (a detached HEAD)', 'Check out a branch with git, then Pull.', 409);
  const upstream = !(await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd: repo.dir })).code;
  const had = await keepTrust(name, repo);
  try { return await pull(name, repo, branch, upstream, resolve); }
  finally { await broughtUntrusted(repo, had); }
}
// (the pull itself, the trust kept around it)
async function pull(name, repo, branch, upstream, resolve) {
  const before = await headOf(repo.dir);
  const kept = await keptOut(repo);
  const changed = await changedFiles(repo);
  const M = await import('./git-merge.js');
  await M.ensureDrawingAttributes((await ok('rev-parse', ['rev-parse', '--absolute-git-dir'], { cwd: repo.dir })).trim());
  const r = await git(['pull', '--no-rebase', '--ff', '--no-edit', ...(upstream ? [] : ['origin', branch])], { cwd: repo.dir, timeout: 180_000 });
  let resolved = [];
  if (r.code) {
    const u = await git(['diff', '--name-only', '--relative', '--diff-filter=U'], { cwd: repo.dir });
    const files = u.stdout.split('\n').filter(Boolean);
    if (!files.length) throw explain('pull', r);
    let m;
    try { m = await M.resolveOnPull({ run: a => git(a, { cwd: repo.dir }), prefix: repo.prefix, name, files, resolve }); }
    catch (e) { await git(['merge', '--abort'], { cwd: repo.dir }); throw new GitError(`git pull: ${e.message}: nothing was pulled`, 'Choose the other side for an object, then Pull again.', e.status || 422, { files }); }
    if (!m.done) {
      await git(['merge', '--abort'], { cwd: repo.dir });
      const only = !m.others.length;
      throw new GitError(`git pull: a conflict in ${files.join(', ')}: nothing was pulled, the project's files are as they were`,
        only ? 'The same objects of a drawing changed here and on GitHub: choose mine or theirs for each, then Pull again.'
          : 'The same lines changed here and on GitHub. Commit your version under another name, or ask the other author, then Pull again.',
        409, { files, drawings: m.drawings });
    }
    await ok('add', ['add', '--all', '--', ...new Set([...files, ...m.written])], { cwd: repo.dir });
    await ok('commit', ['commit', '--quiet', '--no-edit', '--no-verify'], { cwd: repo.dir });
    resolved = m.resolved;
  }
  const after = await headOf(repo.dir);
  const gated = before === after ? { out: [], warnings: [] } : await gatePulled(repo, before, after, kept, changed);
  if (!upstream) await git(['branch', `--set-upstream-to=origin/${branch}`], { cwd: repo.dir });
  const files = before === after ? [] : (await ok('diff', before ? ['diff', '--name-only', '--relative', before, after, '--', '.'] : ['ls-files', '--', '.'], { cwd: repo.dir })).split('\n').filter(f => f && !gated.out.includes(f));
  return { project: name, branch, upToDate: before === after, files, ...(resolved.length ? { resolved } : {}), ...(gated.warnings.length ? { warnings: gated.warnings } : {}) };
}

// what a pull brought passes the import gate (#3359), as a clone's files do (the workspace's repository: every
// project's, each on its own): a hidden file (a project's .gitignore apart), a tool's output or another spelling of
// silinx.json is taken out of the folder and left in the repository (skip-worktree: a commit neither deletes nor
// changes it), each with its message; a file the gate refuses otherwise (a name, a NUL byte, a DTD, a size) undoes the
// pull. -> { out: the project's paths not in its folder (taken out, or left out by a sparse checkout), warnings }
async function gatePulled(repo, before, after, kept, changed) {
  const { gateEntries, gateMessages, normalizePath, GateError } = await import('../core/import-gate.js');
  const listed = await ok('diff', before ? ['diff', '-z', '--name-only', '--diff-filter=d', before, after] : ['ls-files', '-z'], { cwd: repo.top });
  // (a pulled name another tracked file has but for its case: one file on a case-insensitive file system, #3524)
  const clashes = caseClashes(listed.split('\0').filter(Boolean), await trackedPaths(repo));
  if (clashes.length) {
    await undoClashes(repo, before, clashes, kept, changed);
    throw new GitError(`git pull: ${clashes.map(([p, q]) => `${p}: not imported: same name as '${q}' but for its case`).join('; ')}: nothing was pulled, the project's files are as they were`, null, 422);
  }
  const left = [], absent = [], warnings = [], groups = new Map();
  for (const file of listed.split('\0').filter(Boolean)) {
    const full = path.join(repo.top, ...file.split('/'));
    let st = null;
    try { st = await fsp.lstat(full); } catch { absent.push(file); continue; }   // (not in the folder: a sparse checkout's)
    // (its project, and its path in it: the workspace's repository holds the projects' folders)
    const cut = repo.root === 'workspace' ? file.indexOf('/') : -1;
    const [group, rel] = cut > 0 ? [file.slice(0, cut), file.slice(cut + 1)] : ['', file];
    if (rel === '.gitignore') continue;   // (git's own, as Silinx writes it)
    const out = outOfProject(rel, normalizePath);
    if (out) { left.push(file); warnings.push(`${file}: not pulled into the project: ${out}`); continue; }
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push({ path: rel, data: st.isFile() ? await fsp.readFile(full) : new Uint8Array(), symlink: st.isSymbolicLink() });
  }
  await takeOut(repo, left);
  const errors = [];
  for (const [group, entries] of groups) {
    const at = m => (group ? `${group}/${m}` : m);
    try {
      const gated = gateEntries(entries);
      errors.push(...gateMessages({ refusals: gated.refusals, warnings: [] }).map(at));
      warnings.push(...gated.warnings.map(at));
    } catch (e) { if (!(e instanceof GateError)) throw e; errors.push(group ? `${group}: ${e.message}` : e.message); }
  }
  if (errors.length) {
    await undoPull(repo, before, [...groups].flatMap(([g, es]) => es.map(e => (g ? `${g}/${e.path}` : e.path))), kept);
    throw new GitError(`git pull: ${errors.join('; ')}: nothing was pulled, the project's files are as they were`, null, 422);
  }
  const mine = p => (repo.prefix && p.startsWith(repo.prefix) ? p.slice(repo.prefix.length) : p);
  return { out: [...left, ...absent].map(mine), warnings };
}
// why a pulled file stays out of the project's folder, or null: a hidden one, a tool's output, another spelling of
// silinx.json (the import gate's reasons)
function outOfProject(rel, normalizePath) {
  if (isOutput(rel)) return 'a tool\'s output, made again from the sources';
  const { reason } = normalizePath(rel);
  return reason && (/^hidden |^a short \(8\.3\) name|build folder|^another spelling of /.test(reason)) ? reason : null;
}
// the folders a file taken out leaves empty, up to the project's
async function pruneEmpty(top, dir) {
  for (let d = dir; d.startsWith(top + path.sep); d = path.dirname(d)) {
    try { await fsp.rmdir(d); } catch { return; }
  }
}
// the files of the repository a pull left out of the folder (skip-worktree), before the next pull
async function keptOut(repo) {
  const r = await git(['ls-files', '-v', '-z'], { cwd: repo.top });
  return r.code ? [] : r.stdout.split('\0').filter(l => l.startsWith('S ')).map(l => l.slice(2));
}
// the repository's tracked paths (its index)
async function trackedPaths(repo) {
  return (await ok('ls-files', ['ls-files', '-z'], { cwd: repo.top })).split('\0').filter(Boolean);
}
// the pulled paths that differ from another tracked path only by their case (or form), as a case-insensitive file
// system reads them: [[pulled, other]], each pulled path once
function caseClashes(pulled, tracked) {
  const byKey = new Map();
  for (const t of tracked) { const k = foldName(t); if (!byKey.has(k)) byKey.set(k, []); byKey.get(k).push(t); }
  return pulled.flatMap(p => { const q = (byKey.get(foldName(p)) || []).find(t => t !== p); return q ? [[p, q]] : []; });
}
// the tracked files changed and not committed, before a pull: { path: their bytes } (a name clash's pull writes over
// them on a case-insensitive file system, #3524)
async function changedFiles(repo) {
  const r = await git(['diff', '-z', '--name-only', '--diff-filter=M'], { cwd: repo.top });
  const out = {};
  for (const f of r.code ? [] : r.stdout.split('\0').filter(Boolean)) {
    try { out[f] = await fsp.readFile(path.join(repo.top, ...f.split('/'))); } catch { /* (gone meanwhile) */ }
  }
  return out;
}
// a pull that brought a name clash undone (#3524): the branch back where it was (reset --keep, as undoPull), then the
// other paths' files as they were before the pull (on a case-insensitive file system the pull wrote over them, and
// putting the branch back deleted the pulled spelling: their file): their changes not committed, else the commit's
async function undoClashes(repo, before, clashes, kept, changed) {
  if (!before) return undoPull(repo, before, [...new Set(clashes.map(([p]) => p))], kept);
  await undoPull(repo, before, [], kept);
  const was = new Set((await ok('ls-tree', ['ls-tree', '-r', '-z', '--name-only', before], { cwd: repo.top })).split('\0'));
  const back = [...new Set(clashes.map(([, q]) => q))].filter(q => was.has(q));
  if (back.length) await ok('checkout', ['checkout', before, '--', ...back], { cwd: repo.top });
  for (const q of back) if (changed[q]) await fsp.writeFile(path.join(repo.top, ...q.split('/')), changed[q]);
}
// files of the repository out of the folder, and out of the commits (skip-worktree), the folders they leave empty too;
// a file another tracked path names but for its case (the same file on a case-insensitive file system) left in the
// folder (#3524)
async function takeOut(repo, files) {
  if (!files.length) return;
  const out = new Set(files), keys = new Set((await trackedPaths(repo)).filter(t => !out.has(t)).map(foldName));
  for (const f of files) if (!keys.has(foldName(f))) await fsp.rm(path.join(repo.top, ...f.split('/')), { force: true });
  await ok('update-index', ['update-index', '--skip-worktree', '--', ...files], { cwd: repo.top });
  for (const f of files) await pruneEmpty(repo.top, path.dirname(path.join(repo.top, ...f.split('/'))));
}
// a pull the gate refused: the branch back where it was (the changes not committed kept: reset --keep), the files a
// pull had left out still out; a first pull (no commit before it): its files out of the index and the folder
async function undoPull(repo, before, files, kept) {
  if (before) {
    await ok('reset', ['reset', '--quiet', '--keep', before], { cwd: repo.top });
    const tracked = new Set((await ok('ls-files', ['ls-files', '-z'], { cwd: repo.top })).split('\0'));
    await takeOut(repo, kept.filter(f => tracked.has(f)));
    return;
  }
  await git(['update-ref', '-d', 'HEAD'], { cwd: repo.top });
  await git(['rm', '-r', '-q', '--cached', '--ignore-unmatch', '--', '.'], { cwd: repo.top });
  for (const f of files) await fsp.rm(path.join(repo.top, ...f.split('/')), { force: true });
}

/** The project's commits, the newest first: [{ commit, author, date, message, files: [{ path, state }] }]. */
export async function gitLog(name, { limit = 100 } = {}) {
  const repo = await needRepo(name);
  const n = Math.max(1, Math.min(1000, Math.floor(Number(limit) || 100)));
  if (!await headOf(repo.dir)) return [];
  const out = await ok('log', ['log', `-n${n}`, '--relative', '--name-status', '--format=%x1e%H%x1f%an%x1f%aI%x1f%s', '--', '.'], { cwd: repo.dir });
  return out.split('\x1e').filter(s => s.trim()).map(rec => {
    const [head, ...rest] = rec.split('\n');
    const [commit, author, date, message] = head.split('\x1f');
    const files = rest.filter(Boolean).map(l => { const [st, ...p] = l.split('\t'); return { path: p.pop(), state: st[0] === 'A' || st[0] === 'R' ? 'new' : st[0] === 'D' ? 'deleted' : 'modified' }; });
    return { commit, author, date, message, files };
  });
}

/** A file of the project as it was in a commit (read only): its text. */
export async function gitShow(name, commit, rel) {
  if (!/^[0-9a-f]{7,64}$/i.test(String(commit ?? ''))) throw new GitError(`not a commit: ${String(commit ?? '')}`, 'Give a commit\'s hash, as the history lists it.');
  const repo = await needRepo(name);
  const key = P.relKey(repo.dir, P.safeJoin(repo.dir, rel));
  if (!key || key.split('/').some(s => s.startsWith('.'))) throw new GitError(`'${rel}': not a file of the project`);
  const r = await git(['show', `${commit}:${repo.prefix}${key}`], { cwd: repo.dir });
  if (r.code) throw new GitError(`no file '${key}' in the commit ${String(commit).slice(0, 7)}`, null, 404);
  return { project: name, commit, path: key, text: r.stdout };
}

// the files of a clone (its hidden ones apart: .git, .github, .gitignore are no part of the project), for the gate
async function cloneEntries(dir, base = '') {
  const out = [];
  for (const ent of await fsp.readdir(path.join(dir, base), { withFileTypes: true })) {
    if (ent.name.startsWith('.')) continue;
    const rel = base ? `${base}/${ent.name}` : ent.name;
    if (ent.isDirectory()) out.push(...await cloneEntries(dir, rel));
    else out.push({ path: rel, data: ent.isFile() ? await fsp.readFile(path.join(dir, rel)) : new Uint8Array(), symlink: ent.isSymbolicLink() });
  }
  return out;
}

// a clone's files checked out but its hidden ones (#3359): a hidden file is no part of a project (.vscode's tasks,
// .envrc, a .gitattributes naming filters: other tools act on them), so git's sparse checkout leaves them in the
// repository, out of the folder, for its pulls too (but the .gitignore, which Silinx writes itself); a commit leaves
// them as they are
const SPARSE = '/*\n!.*\n/.gitignore\n';
async function checkoutSparse(dir) {
  await ok('config', ['config', 'core.sparseCheckout', 'true'], { cwd: dir });
  await ok('config', ['config', 'core.sparseCheckoutCone', 'false'], { cwd: dir });
  await fsp.mkdir(path.join(dir, '.git', 'info'), { recursive: true });
  await fsp.writeFile(path.join(dir, '.git', 'info', 'sparse-checkout'), SPARSE);
  if (await headOf(dir)) await ok('checkout', ['read-tree', '-mu', 'HEAD'], { cwd: dir });
}

/** Open from Repository: clone a GitHub repository into the workspace as a project, untrusted (#2830: the trust mark in
 *  .git, so its silinx.json stays the repository's): { project, url, warnings }. madeBy 'mcp': the MCP's. */
export async function gitClone({ url, name = null, madeBy = null }) {
  const remote = checkUrl(url);
  const project = name || nameFromRepo(remote.repo);
  const dir = P.projectDir(project);
  if (fs.existsSync(dir)) throw new GitError(`project '${project}' already exists`, 'Choose another name for the project.', 409);
  const ws = P.workspaceDir();
  await fsp.mkdir(ws, { recursive: true });
  const tmp = path.join(ws, `.silinx-clone-${crypto.randomBytes(6).toString('hex')}`);
  try {
    const r = await git(['clone', '--quiet', '--no-checkout', '--no-recurse-submodules', '--', GIT_TESTING.remoteOf?.(remote) || remote.url, tmp], { cwd: ws, timeout: 300_000 });
    if (r.code) throw explain('clone', r);
    await checkoutSparse(tmp);
    if (!fs.existsSync(path.join(tmp, P.PROJECT_FILE))) {
      const inside = (await fsp.readdir(tmp, { withFileTypes: true })).filter(d => d.isDirectory() && !d.name.startsWith('.') && fs.existsSync(path.join(tmp, d.name, P.PROJECT_FILE))).map(d => d.name).sort();
      throw inside.length
        ? new GitError(`the repository holds several Silinx projects (${inside.join(', ')}), not one`, 'Clone it with git as the Silinx workspace (SILINX_WORKSPACE): its projects then commit, push and pull through it.', 422, { projects: inside })
        : new GitError('the repository is not a Silinx project: it has no silinx.json', null, 422);
    }
    // what comes from outside passes the import gate (#2830): a file it refuses stops the clone
    const { gateEntries, gateMessages, GateError } = await import('../core/import-gate.js');
    let gated;
    try { gated = gateEntries(await cloneEntries(tmp)); } catch (e) { throw e instanceof GateError ? new GitError(`not opened: ${e.message}`, null, 422) : e; }
    if (gated.refusals.length) throw new GitError(`not opened: ${gateMessages({ refusals: gated.refusals, warnings: [] }).join('; ')}`, null, 422);
    try { JSON.parse(await fsp.readFile(path.join(tmp, P.PROJECT_FILE), 'utf8')); } catch { throw new GitError('not opened: its silinx.json is not valid JSON', null, 422); }
    await fsp.writeFile(path.join(tmp, P.CLONE_TRUST), JSON.stringify({ trusted: false, ...(madeBy ? { madeBy } : {}) }) + '\n');
    if (fs.existsSync(dir)) throw new GitError(`project '${project}' already exists`, 'Choose another name for the project.', 409);
    await fsp.rename(tmp, dir);
    return { project, url: remote.url, repository: `${remote.owner}/${remote.repo}`, warnings: gated.warnings };
  } finally {
    await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}
