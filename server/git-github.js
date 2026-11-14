// Git through GitHub's REST API on a server (#3196): the second back end of the interface's routes (git-routes.js) and
// the MCP's tools (mcp-git.js), SILINX_GIT=github, for a computer or a server with no git (the first, server/git.js:
// the system's git). The same functions and results as server/git.js, through the browser edition's back end
// (core/git-rest.js) on the workspace's project folders. The token is the environment's (GH_TOKEN or GITHUB_TOKEN:
// GitHub's command line, a CI's), sent only to GitHub's API in a header: Silinx never asks for, stores or logs it. What a
// project was at its last commit or pull is kept in Silinx's configuration folder, out of the workspace (the MCP's file
// tools cannot point a project's commits at another repository).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as P from './projects.js';
import { githubClient, textOf, GitHubError } from '../core/github-api.js';
import { restGit } from '../core/git-rest.js';
import { markUntrusted, markMadeByMcp } from '../core/trust.js';

export { GitHubError as GitError };
// the tests' GitHub (test/fake-github.mjs): its fetch; never set by the server or the MCP
export const GITHUB_TESTING = { fetch: null };

/** Whether this back end is the one in use (SILINX_GIT=github). */
export const githubBackend = () => String(process.env.SILINX_GIT || '').toLowerCase() === 'github';
const token = () => process.env.GH_TOKEN || process.env.GITHUB_TOKEN || null;
const TOKEN_HINT = 'set GH_TOKEN before starting Silinx (with GitHub\'s command line: GH_TOKEN=$(gh auth token)); Silinx never stores it';
export const HINTS = { signIn: `GitHub's API needs a token: ${TOKEN_HINT}.`, again: `GitHub refused the token of GH_TOKEN: ${TOKEN_HINT}.` };

// the project's own files, as text (its hidden ones, build/ and its binary ones apart: core/git-rest.js leaves them)
async function walk(dir, base = '', out = {}) {
  for (const e of await fsp.readdir(path.join(dir, base), { withFileTypes: true })) {
    if (e.name.startsWith('.') || (!base && e.name === 'build')) continue;
    const rel = base ? `${base}/${e.name}` : e.name;
    if (e.isDirectory()) await walk(dir, rel, out);
    else if (e.isFile()) { const t = textOf(await fsp.readFile(path.join(dir, rel))); if (t !== null) out[rel] = t; }
  }
  return out;
}
const render = json => `${JSON.stringify(json, null, 2)}\n`;
const exists = name => fs.existsSync(path.join(P.projectDir(name), P.PROJECT_FILE));

function backend({ madeBy = null } = {}) {
  const projects = {
    exists: async name => exists(name),
    // silinx.json as committed: without the trust mark, which is this computer's (#2830)
    files: async name => {
      const dir = P.projectDir(name);
      const files = await walk(dir);
      try { const { trusted, madeBy: m, ...json } = JSON.parse(files[P.PROJECT_FILE]); files[P.PROJECT_FILE] = render(json); } catch { /* as it is */ }   // eslint-disable-line no-unused-vars
      return files;
    },
    // a clone: written into a folder of its own, then moved into place; untrusted
    create: async (name, files) => {
      const dir = P.projectDir(name), ws = P.workspaceDir();
      await fsp.mkdir(ws, { recursive: true });
      const tmp = path.join(ws, `.silinx-clone-${crypto.randomBytes(6).toString('hex')}`);
      try {
        for (const [rel, text] of Object.entries(files)) {
          const json = rel === P.PROJECT_FILE ? JSON.parse(text) : null;
          const full = P.safeJoin(tmp, rel);
          await fsp.mkdir(path.dirname(full), { recursive: true });
          await fsp.writeFile(full, json ? render(madeBy === 'mcp' ? markMadeByMcp(json) : markUntrusted(json)) : text);
        }
        if (fs.existsSync(dir)) throw new GitHubError(`project '${name}' already exists`, 'Choose another name for the project.', 409);
        await fsp.rename(tmp, dir);
      } finally { await fsp.rm(tmp, { recursive: true, force: true }).catch(() => {}); }
    },
    write: async (name, rel, text) => {
      if (rel === P.PROJECT_FILE) return P.writeProject(name, JSON.parse(text));
      const full = P.safeJoin(P.projectDir(name), rel);
      await fsp.mkdir(path.dirname(full), { recursive: true });
      await fsp.writeFile(full, text);
    },
    remove: async (name, rel) => { if (rel !== P.PROJECT_FILE) await fsp.rm(P.safeJoin(P.projectDir(name), rel), { force: true }); },
    // a merged drawing's HDL file made from it again (#3197)
    regenerate: async (name, rel) => (await import('./drawing-sync.js')).syncDrawing(P, name, rel),
  };
  // (one folder per workspace: the same project name in two workspaces is two projects)
  const metaFile = async name => {
    const { configDir } = await import('./toolchain.js');
    const ws = crypto.createHash('sha256').update(path.resolve(P.workspaceDir())).digest('hex').slice(0, 16);
    return path.join(configDir(), 'github-git', ws, `${P.projectDir(name) && name}.json`);
  };
  const meta = {
    get: async name => { try { return JSON.parse(await fsp.readFile(await metaFile(name), 'utf8')); } catch { return null; } },
    set: async (name, m) => {
      const f = await metaFile(name);
      if (!m) { await fsp.rm(f, { force: true }); return; }
      await fsp.mkdir(path.dirname(f), { recursive: true });
      await fsp.writeFile(f, JSON.stringify(m));
    },
  };
  const f = GITHUB_TESTING.fetch || globalThis.fetch;
  return restGit({ client: githubClient({ fetch: (...a) => f(...a), token, hints: HINTS }), projects, meta });
}

// server/git.js's functions, through GitHub's API
const known = async name => { await P.readProject(name); return name; };
export const gitStatus = async name => backend().status(await known(name));
export const gitInit = async (name, { remote = null } = {}) => backend().init(await known(name), { remote });
export const gitCommit = async (name, message) => backend().commit(await known(name), message);
export const gitPush = async name => backend().push(await known(name));
export const gitChecks = async name => backend().checks(await known(name));
export const gitPull = async (name, { resolve = null } = {}) => backend().pull(await known(name), { resolve });
export const gitLog = async (name, { limit = 100 } = {}) => backend().log(await known(name), { limit });
export const gitShow = async (name, commit, rel) => backend().show(await known(name), commit, rel);
export const gitClone = ({ url, name = null, madeBy = null }) => backend({ madeBy }).clone({ url, name });

/** GitHub's API with the environment's token (or none: a public repository's), for the system git's back end's checks
 *  (server/git.js gitChecks, #3194). */
export function apiClient() {
  const f = GITHUB_TESTING.fetch || globalThis.fetch;
  return githubClient({ fetch: (...a) => f(...a), token, hints: HINTS });
}

// ------------------------------------------------------------------ a short link's gist (#3223, core/gist-link.js)
/** Whether this server can make a short link: a GitHub token in its environment (GH_TOKEN, GITHUB_TOKEN). */
export const gistAvailable = () => !!token();
/** A short link's secret gist, made with the environment's token -> { id, key, url }. */
export async function makeGist(design, { days = 0 } = {}) {
  if (!token()) throw new GitHubError('a short link needs a GitHub token on this server', `Set GH_TOKEN before starting Silinx (with GitHub's command line: GH_TOKEN=$(gh auth token)), or copy the full link; Silinx never stores it.`, 409);
  const { saveGist } = await import('../core/gist-link.js');
  const f = GITHUB_TESTING.fetch || globalThis.fetch;
  return saveGist(githubClient({ fetch: (...a) => f(...a), token, hints: HINTS }), design, { days });
}
/** The short links of the token's account (#3635, core/gist-link.js listGists). */
export async function listShortLinks() {
  if (!token()) throw new GitHubError('the short links need a GitHub token on this server', 'Set GH_TOKEN before starting Silinx (with GitHub\'s command line: GH_TOKEN=$(gh auth token)); Silinx never stores it.', 409);
  const { listGists } = await import('../core/gist-link.js');
  const f = GITHUB_TESTING.fetch || globalThis.fetch;
  return listGists(githubClient({ fetch: (...a) => f(...a), token, hints: HINTS }));
}
/** Short links of the token's account deleted: `ids`, or the expired ones (expired: true) -> the ids deleted. */
export async function deleteShortLinks({ ids = [], expired = false } = {}) {
  if (!token()) throw new GitHubError('the short links need a GitHub token on this server', 'Set GH_TOKEN before starting Silinx (with GitHub\'s command line: GH_TOKEN=$(gh auth token)); Silinx never stores it.', 409);
  const { deleteGists, deleteExpiredGists } = await import('../core/gist-link.js');
  const f = GITHUB_TESTING.fetch || globalThis.fetch;
  const client = githubClient({ fetch: (...a) => f(...a), token, hints: HINTS });
  return expired ? deleteExpiredGists(client) : deleteGists(client, ids);
}
/** A short link's design, read from its gist (no token needed). */
export async function readGist(ref) {
  const { loadGist } = await import('../core/gist-link.js');
  const f = GITHUB_TESTING.fetch || globalThis.fetch;
  return loadGist(ref, { fetch: (...a) => f(...a) });
}
