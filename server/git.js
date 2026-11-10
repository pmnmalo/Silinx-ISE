// Git, phase 1 (#3195, the plan #3194): a project of the server editions in a GitHub repository, through the system's
// git: clone (Open from Repository), init, status (the Design pane's marks), commit, push, pull, the history and a file
// as it was in a commit. The interface's routes (git-routes.js) and the MCP's tools (mcp-git.js) call these functions.
//
// The repository is the one holding the project's folder: the folder itself (a clone, a Classroom assignment), or the
// workspace when it is a clone of a repository of several projects; never one above the workspace
// (GIT_CEILING_DIRECTORIES), and every command limited to the project's folder (the pathspec '.').
// How git runs (the security notes of #3195): spawned with an argument array, never through a shell, with a timeout;
// no prompt (GIT_TERMINAL_PROMPT=0, ssh in batch mode); no hook of a repository runs (core.hooksPath, an empty folder of
// Silinx's), nor its fsmonitor; https and ssh only (protocol.allow), the remotes github.com's (checkUrl); no symbolic link
// checked out. The credentials are the system's credential helper's: Silinx never asks for, stores or logs one (an
// error's URLs lose their user:password@).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as P from './projects.js';

/** A git command's failure: its message (git's own line), a hint for the user, the HTTP status; files: a conflict's. */
export class GitError extends Error {
  constructor(message, hint = null, status = 400, extra = {}) { super(message); Object.assign(this, { hint, status }, extra); }
}

// the tests' remotes (a local bare repository, no network): a folder's absolute path taken for a URL; never set by the
// server or the MCP
export const GIT_TESTING = { localRemotes: false };

/** git turned off (SILINX_GIT=off: a hosted server whose operator does not want its account's credentials used). */
export const gitEnabled = () => String(process.env.SILINX_GIT || '').toLowerCase() !== 'off';

// ------------------------------------------------------------------ the URLs
const OWNER = '([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))', REPO = '([A-Za-z0-9._-]{1,100}?)';
const URL_FORMS = [
  new RegExp(`^https://github\\.com/${OWNER}/${REPO}(?:\\.git)?/?$`),
  new RegExp(`^ssh://git@github\\.com(?::22)?/${OWNER}/${REPO}(?:\\.git)?/?$`),
  new RegExp(`^git@github\\.com:${OWNER}/${REPO}(?:\\.git)?$`),
];
const URL_HINT = 'Give the repository\'s address on GitHub: https://github.com/owner/repository, or git@github.com:owner/repository.git.';

/** A remote's URL, checked: github.com's, https or ssh -> { url, owner, repo }; or a GitError. */
export function checkUrl(url) {
  const u = String(url ?? '').trim();
  if (GIT_TESTING.localRemotes && path.isAbsolute(u)) return { url: u, owner: 'local', repo: path.basename(u).replace(/\.git$/, '') };
  if (/^https:\/\/classroom\.github\.com\//i.test(u)) throw new GitError('a GitHub Classroom invitation, not a repository', 'Accept the assignment on GitHub first, then give its repository\'s address (https://github.com/…).');
  for (const re of URL_FORMS) {
    const m = re.exec(u);
    if (m && m[2] !== '.' && m[2] !== '..') return { url: u, owner: m[1], repo: m[2] };
  }
  throw new GitError(`not a GitHub repository's address: ${redact(u) || '(none)'}`, URL_HINT);
}

/** A text with its URLs' credentials removed (a user:token@ after the scheme). */
export const redact = s => String(s ?? '').replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/@\s]+@/gi, '$1');

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
  try { ws = fs.realpathSync(ws); } catch { /* not made yet */ }
  env.GIT_CEILING_DIRECTORIES = path.dirname(ws);
  if (!env.GIT_SSH_COMMAND) env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes';
  return env;
}

const MAX_OUT = 16 << 20;

/** Run git: { code, stdout, stderr }; ENOENT (no git) a GitError. */
export async function git(args, { cwd, timeout = 60_000 } = {}) {
  const base = ['-c', `core.hooksPath=${await noHooksDir()}`, '-c', 'core.fsmonitor=false', '-c', 'core.symlinks=false',
    '-c', 'core.quotePath=false', '-c', 'color.ui=false', '-c', 'submodule.recurse=false',
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
export function explain(op, r) {
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
const real = p => { try { return path.resolve(fs.realpathSync(p)); } catch { return path.resolve(p); } };
const same = (a, b) => (process.platform === 'win32' || process.platform === 'darwin' ? a.toLowerCase() === b.toLowerCase() : a === b);

/** The repository holding a project: { dir, top, prefix, root: 'project' | 'workspace' }, or null (none, or one above
 *  the workspace). */
export async function repoOf(name) {
  await P.readProject(name);
  const dir = P.projectDir(name);
  const r = await git(['rev-parse', '--show-toplevel', '--show-prefix'], { cwd: dir });
  if (r.code) return null;
  const [top, prefix = ''] = r.stdout.split(/\r?\n/);
  const t = real(top), d = real(dir), ws = real(P.workspaceDir());
  const root = same(t, d) ? 'project' : same(t, ws) ? 'workspace' : null;
  return root ? { dir, top: t, prefix: prefix.trim(), root } : null;
}

async function needRepo(name) {
  const repo = await repoOf(name);
  if (!repo) throw new GitError(`the project '${name}' is not in a git repository`, 'Initialize Repository… makes one, or Open from Repository… opens a project from GitHub.', 409);
  return repo;
}

// the tools' outputs, never committed whatever the repository's .gitignore says (pathspecs, relative to the project)
const OUTPUTS = ['build', 'xst', '_xmsgs', 'iseconfig', 'isim', '.Xil', '*.bit', '*.ncd', '*.ngc', '*.ngd', '*.xdl', '*.xdlrc', '*.wdb'];
const GLOBS = OUTPUTS.map(p => (p.startsWith('*') ? `**/${p}` : `${p}/**`));
const EXCLUDE = GLOBS.map(g => `:(exclude,glob)${g}`);
const isOutput = rel => {
  const parts = rel.split('/');
  return OUTPUTS.some(p => (p.startsWith('*') ? rel.toLowerCase().endsWith(p.slice(1)) : parts[0] === p));
};

/** The .gitignore Silinx writes into a project (Initialize Repository…, and before a commit when it has none). */
export const GITIGNORE = `# Silinx (#3195): what the tools make again from the sources is not committed
build/
xst/
_xmsgs/
iseconfig/
isim/
.Xil/
*.bit
*.ncd
*.ngc
*.ngd
*.xdl
*.xdlrc
*.wdb
.DS_Store
`;

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
  const push = (await git(['remote', 'get-url', '--push', 'origin'], { cwd })).stdout.trim();
  checkUrl(push || r.stdout.trim());
  return checkUrl(r.stdout.trim());
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
    await ok('remote', ['remote', 'add', 'origin', url], { cwd: repo.dir });
    return { project: name, created: false, remote: url, gitignore: false };
  }
  const dir = P.projectDir(name);
  await ok('init', ['init', '--quiet'], { cwd: dir });
  await ok('init', ['symbolic-ref', 'HEAD', 'refs/heads/main'], { cwd: dir });
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

/** Pull GitHub's commits into the project (a merge, never a rebase): { branch, files, upToDate }. A conflict pulls
 *  nothing (the merge aborted: the files as they were) and is a GitError with its files. */
export async function gitPull(name) {
  const repo = await needRepo(name);
  await origin(repo.dir);
  const branch = await branchOf(repo.dir);
  if (!branch) throw new GitError('the project is on no branch (a detached HEAD)', 'Check out a branch with git, then Pull.', 409);
  const upstream = !(await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { cwd: repo.dir })).code;
  const before = await headOf(repo.dir);
  const r = await git(['pull', '--no-rebase', '--ff', '--no-edit', ...(upstream ? [] : ['origin', branch])], { cwd: repo.dir, timeout: 180_000 });
  if (r.code) {
    const u = await git(['diff', '--name-only', '--relative', '--diff-filter=U'], { cwd: repo.dir });
    const files = u.stdout.split('\n').filter(Boolean);
    if (files.length) {
      await git(['merge', '--abort'], { cwd: repo.dir });
      throw new GitError(`git pull: a conflict in ${files.join(', ')}: nothing was pulled, the project's files are as they were`,
        'The same lines changed here and on GitHub. Commit your version under another name, or ask the other author, then Pull again.', 409, { files });
    }
    throw explain('pull', r);
  }
  const after = await headOf(repo.dir);
  if (!upstream) await git(['branch', `--set-upstream-to=origin/${branch}`], { cwd: repo.dir });
  const files = before === after ? [] : (await ok('diff', before ? ['diff', '--name-only', '--relative', before, after, '--', '.'] : ['ls-files', '--', '.'], { cwd: repo.dir })).split('\n').filter(Boolean);
  return { project: name, branch, upToDate: before === after, files };
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

// a project's name from a repository's (letters, digits, - and _; a letter first)
export const nameFromRepo = repo => {
  const n = String(repo).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  return /^[A-Za-z]/.test(n) ? n : `p${n}`.slice(0, 64);
};

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
    const r = await git(['clone', '--quiet', '--no-recurse-submodules', '--', remote.url, tmp], { cwd: ws, timeout: 300_000 });
    if (r.code) throw explain('clone', r);
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
