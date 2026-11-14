// Git in the browser edition (#3196): the api's git functions (as web/js/api.js's of the server editions, #3195) through
// GitHub's REST API (core/git-rest.js), on the projects of the storage in use (web/js/project-store.js: the browser's,
// or a folder on the disk); the GitHub sign-in (OAuth's device flow through web/js/github-app.js's relay, else a pasted
// fine-grained personal access token, checked with GitHub's API before it is kept). The token is kept
// in this browser (localStorage: Remember me, the default), or in this tab only (sessionStorage: forgotten when it closes)
// when the user unticks it (#3356: every page of the site's origin, another GitHub Pages site of its account too, reads its
// localStorage), under the edition's own key (the development site's: silinx.dev.); sent only to GitHub's API in a
// header; never in a URL, never in a message; Sign out forgets it. The device flow asks for the public repositories and
// the gists only, the private ones when the user asks (core/github-api.js SCOPE, PRIVATE_SCOPE). What a project was at
// its last commit or pull is kept beside the storage (localStorage, one key per project of each storage). The single file
// opened from the disk (file:, #3530) keeps the token in its tab only, never in localStorage: every page opened from the
// disk shares that one origin's storage.
import { githubClient, startDeviceFlow, pollDeviceFlow, GitHubError, SCOPE, PRIVATE_SCOPE } from '../../core/github-api.js';
import { restGit } from '../../core/git-rest.js';
import { markUntrusted } from '../../core/trust.js';
import { githubSettings } from './github-app.js';
import { projectJsonText, normalizeProjectJson } from './project-store.js';

const area = kind => { try { return globalThis[kind] ?? null; } catch { return null; } };
const get = (k, kind = 'localStorage') => { try { return area(kind)?.getItem(k) ?? null; } catch { return null; } };
const put = (k, v, kind = 'localStorage') => { try { if (v === null) area(kind)?.removeItem(k); else area(kind)?.setItem(k, v); } catch { /* not kept */ } };
/** Whether the sign-in may be remembered in this browser: not at file: (#3530), whose storage every local page reads. */
export const canRemember = () => { try { return globalThis.location?.protocol !== 'file:'; } catch { return true; } };

/** The api's git functions: store() the storage in use, ops its projectOps, prefix its keys' (the development site's own). */
export function browserGit({ store, ops, prefix = 'silinx.' }) {
  const TOKEN = `${prefix}github-token`;
  const metaKey = name => `${prefix}git:${store().kind}:${store().label || ''}:${name}`;
  const token = () => get(TOKEN, 'sessionStorage') ?? (canRemember() ? get(TOKEN) : null);
  // the token kept: in this tab, or remembered in this browser (the other place cleared); at file: in this tab only
  const keep = (t, wanted) => {
    const remember = !!wanted && canRemember();
    put(TOKEN, null, remember ? 'sessionStorage' : 'localStorage');
    put(TOKEN, t, remember ? 'localStorage' : 'sessionStorage');
    return { signedIn: true, remembered: !!remember };
  };

  // the project's files as the repository holds them: silinx.json as committed (without the trust mark, which is this
  // browser's: #2830), the others as they are
  const projects = {
    exists: name => store().exists(name),
    files: async name => {
      const p = await store().load(name);
      const { trusted, madeBy, ...json } = p.json;   // eslint-disable-line no-unused-vars
      return { ...p.files, 'silinx.json': projectJsonText(name, json) };
    },
    // a clone: a project from outside, untrusted until the user trusts it
    create: async (name, files) => {
      const { 'silinx.json': pj, ...rest } = files;
      await ops.put(name, markUntrusted(JSON.parse(pj)), rest);
    },
    write: async (name, path, text) => {
      if (path !== 'silinx.json') return store().writeFile(name, path, text);
      const cur = (await store().load(name)).json;
      const json = normalizeProjectJson(JSON.parse(text), name).json;
      if (cur.trusted === false) json.trusted = false;
      if (cur.madeBy) json.madeBy = cur.madeBy;
      return store().saveJson(name, json);
    },
    remove: (name, path) => (path === 'silinx.json' ? null : store().removePath(name, path)),
    // a merged drawing's HDL file made from it again (#3197), as the server's (core/drawing-sync.js) on this storage
    regenerate: async (name, path) => {
      const { syncDrawing } = await import('../../core/drawing-sync.js');
      const P = {
        readProject: n => ops.project(n), fileTree: async n => (await ops.project(n)).fileTree,
        readFile: ops.readFile, writeFile: ops.writeFile, deleteFile: ops.deleteFile, readSources: ops.sources,
      };
      return syncDrawing(P, name, path);
    },
  };
  const meta = {
    get: async name => { try { return JSON.parse(get(metaKey(name))); } catch { return null; } },
    set: async (name, m) => put(metaKey(name), m ? JSON.stringify(m) : null),
  };
  const backend = () => {
    const s = githubSettings();
    return restGit({ client: githubClient({ fetch: (...a) => globalThis.fetch(...a), token, api: s.api }), projects, meta });
  };

  return {
    gitEnabled: async () => ({ enabled: true, backend: 'github-api', signedIn: !!token() }),
    gitClone: async (url, name = null) => {
      const r = await backend().clone({ url, name });
      return { ...r, trusted: false };
    },
    gitStatus: name => backend().status(name),
    gitInit: (name, remote = null) => backend().init(name, { remote }),
    gitCommit: (name, message) => backend().commit(name, message),
    gitPush: name => backend().push(name),
    gitPull: (name, opts = {}) => backend().pull(name, opts),
    gitLog: (name, limit = 100) => backend().log(name, { limit }),
    gitChecks: name => backend().checks(name),
    gitShow: (name, commit, path) => backend().show(name, commit, path),
    // a project deleted: what it was in its repository forgotten (a new one of its name is no clone)
    gitForget: name => meta.set(name, null),

    // ---- the sign-in
    githubSignedIn: () => !!token(),
    /** How this edition signs in: 'device' (the device flow, through the relay) or 'token' (a pasted token). */
    githubSignInWay: () => githubSettings().signIn,
    /** A pasted fine-grained personal access token: checked with GitHub (its user), then kept (in this browser; remember
     *  false: in this tab) -> { signedIn, remembered, login }. */
    githubSetToken: async (pasted, { remember = true } = {}) => {
      const t = String(pasted ?? '').trim();
      if (!/^[A-Za-z0-9_]{20,255}$/.test(t)) throw new GitHubError('that is not a GitHub token', 'Paste the token GitHub showed when it was generated (github_pat_…).', 400);
      const me = await githubClient({ fetch: (...a) => globalThis.fetch(...a), token: () => t, api: githubSettings().api, hints: { again: 'GitHub refused this token: check it was copied whole, and that it has not expired.' } }).request('GET', '/user');
      return { ...keep(t, remember), login: String(me?.login || '') };
    },
    /** Sign in with GitHub (the device flow): onCode({ userCode, verificationUri }) shows the code; signal: Cancel;
     *  privateRepos: the private repositories too (else the public ones and the gists); remember: kept in this browser
     *  (the default; false: in this tab) -> { signedIn, remembered }. */
    githubSignIn: async ({ onCode, signal, privateRepos = false, remember = true } = {}) => {
      const s = githubSettings();
      const d = await startDeviceFlow({ clientId: s.clientId, login: s.login, scope: privateRepos ? PRIVATE_SCOPE : SCOPE, fetch: (...a) => globalThis.fetch(...a) });
      onCode?.({ userCode: d.userCode, verificationUri: d.verificationUri, expiresIn: d.expiresIn });
      const t = await pollDeviceFlow({ clientId: s.clientId, ...d }, { login: s.login, signal, fetch: (...a) => globalThis.fetch(...a) });
      return keep(t, remember);
    },
    githubSignOut: async () => { put(TOKEN, null, 'sessionStorage'); put(TOKEN, null); return { signedIn: false }; },
    // ---- a short link's gist (#3223): a secret gist of the signed-in user
    gistAvailable: async () => !!token(),
    gistSave: async (design, days = 0) => {
      const { saveGist } = await import('../../core/gist-link.js');
      const { id, key, expires, deleted } = await saveGist(githubClient({ fetch: (...a) => globalThis.fetch(...a), token, api: githubSettings().api }), design, { days });
      return { id, key, expires, deleted: deleted.length };
    },
    // (#3635: the short links of the signed-in user, listed and deleted)
    gistList: async () => {
      const { listGists } = await import('../../core/gist-link.js');
      return listGists(githubClient({ fetch: (...a) => globalThis.fetch(...a), token, api: githubSettings().api }));
    },
    gistDelete: async ({ ids = [], expired = false } = {}) => {
      const { deleteGists, deleteExpiredGists } = await import('../../core/gist-link.js');
      const client = githubClient({ fetch: (...a) => globalThis.fetch(...a), token, api: githubSettings().api });
      return expired ? deleteExpiredGists(client) : deleteGists(client, ids);
    },
  };
}
