// GitHub's REST API (#3196, phase 2 of #3194): the client of the browser edition's git (core/git-rest.js), which has no
// git and no proxy: api.github.com answers a page's requests (CORS), git's own HTTP endpoints do not. Its sign-in is
// OAuth's device flow (signIn: Silinx shows a code, the user authorizes it at github.com/login/device), with the public
// client ID of Silinx's GitHub OAuth App and no secret. The token is the caller's (token(): kept in the user's browser
// only): sent in the Authorization header to the API, never in a URL, never in a message. Isomorphic (fetch given).

/** A request's failure: its message, a hint for the user, the HTTP status (GitHub's), as server/git.js's GitError. */
export class GitHubError extends Error {
  constructor(message, hint = null, status = 400, extra = {}) { super(message); Object.assign(this, { hint, status }, extra); }
}

export const API = 'https://api.github.com';
export const LOGIN = 'https://github.com';
// the OAuth App's scope: the user's repositories, public and private (a Classroom assignment's is private)
export const SCOPE = 'repo';

export const HINT = {
  signIn: 'Sign in with GitHub first (Sign in with GitHub…, with the Git commands).',
  again: 'Your GitHub sign-in is no longer valid: sign out, then sign in with GitHub again.',
  notFound: 'Check the repository\'s address, and that your GitHub account can see it (a private repository needs the sign-in).',
  network: 'GitHub could not be reached: check the network.',
  rate: 'GitHub limits how many requests an account makes in an hour: wait a little, then try again.',
  rejected: 'GitHub has commits that this project does not: Pull first, then Push again.',
};

// a path's segments in a URL (a file's path keeps its slashes)
const seg = s => encodeURIComponent(String(s));
const pathOf = p => String(p).split('/').map(seg).join('/');

/** The client: request(method, path, body) -> GitHub's answer (JSON), or a GitHubError. token(): the user's, or null. */
export function githubClient({ fetch: f = globalThis.fetch, token = () => null, api = API } = {}) {
  async function request(method, path, body, { allow = [] } = {}) {
    const t = token();
    const headers = { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (t) headers.Authorization = `Bearer ${t}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    let r;
    try { r = await f(`${api}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }); }
    catch { throw new GitHubError('GitHub could not be reached', HINT.network, 503); }
    let j = null;
    try { j = await r.json(); } catch { /* no body */ }
    if (r.ok || allow.includes(r.status)) return r.ok ? j : { status: r.status, ...(j || {}) };
    throw failure(r.status, j, !!t, r.headers);
  }
  return {
    request,
    repo: (o, r) => `/repos/${seg(o)}/${seg(r)}`,
    pathOf,
  };
}

// GitHub's answer, as the console says it (GitHub's own message: never the token, which is never in one)
function failure(status, j, signedIn, headers) {
  const said = String(j?.message || '').slice(0, 300);
  if (status === 401) return new GitHubError(`GitHub refused the sign-in (${said || 'Bad credentials'})`, signedIn ? HINT.again : HINT.signIn, 401);
  if (status === 403 || status === 429) {
    const limited = /rate limit/i.test(said) || headers?.get?.('x-ratelimit-remaining') === '0';
    return new GitHubError(`GitHub refused the request (${said || status})`, limited ? HINT.rate : signedIn ? 'Your GitHub account has no permission to do this in the repository.' : HINT.signIn, 403);
  }
  if (status === 404) return new GitHubError('GitHub has no such repository, or your account cannot see it', signedIn ? HINT.notFound : `${HINT.notFound} ${HINT.signIn}`, 404);
  return new GitHubError(`GitHub refused the request (${status}${said ? `: ${said}` : ''})`, null, status >= 500 ? 502 : status);
}

// ------------------------------------------------------------------ the device flow (OAuth)
const form = o => new URLSearchParams(o).toString();
async function post(f, url, body) {
  let r;
  try { r = await f(url, { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: form(body) }); }
  catch { throw new GitHubError('GitHub\'s sign-in could not be reached', HINT.network, 503); }
  let j = null;
  try { j = await r.json(); } catch { /* none */ }
  if (!r.ok && !j?.error) throw new GitHubError(`GitHub's sign-in refused the request (${r.status})`, null, r.status);
  return j || {};
}

/** The device flow's first step: { deviceCode, userCode, verificationUri, interval (s), expiresIn (s) }. login: GitHub's
 *  (or what forwards to it). */
export async function startDeviceFlow({ clientId, fetch: f = globalThis.fetch, login = LOGIN, scope = SCOPE }) {
  if (!clientId) throw new GitHubError('no GitHub OAuth App is set up for this edition of Silinx', 'Its client ID is a setting of the edition (the maintainer registers the OAuth App).', 400);
  const j = await post(f, `${login}/login/device/code`, { client_id: clientId, scope });
  if (j.error || !j.device_code) throw new GitHubError(`GitHub's sign-in refused the request (${j.error_description || j.error || 'no device code'})`, j.error === 'device_flow_disabled' ? 'The OAuth App must have its device flow enabled (its settings on GitHub).' : null, 400);
  return { deviceCode: j.device_code, userCode: j.user_code, verificationUri: j.verification_uri, interval: Number(j.interval) || 5, expiresIn: Number(j.expires_in) || 900 };
}

const sleeper = (ms, signal) => new Promise((resolve, reject) => {
  const t = setTimeout(resolve, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); reject(new GitHubError('the sign-in was cancelled', null, 499)); }, { once: true });
});

/** The device flow's second step: GitHub asked until the user authorizes (or refuses, or the code expires) -> the
 *  token. signal: Cancel; sleep: the tests' clock. */
export async function pollDeviceFlow({ clientId, deviceCode, interval = 5, expiresIn = 900 }, { fetch: f = globalThis.fetch, login = LOGIN, signal = null, sleep = sleeper, now = () => Date.now() } = {}) {
  const end = now() + expiresIn * 1000;
  let wait = interval;
  for (;;) {
    if (signal?.aborted) throw new GitHubError('the sign-in was cancelled', null, 499);
    await sleep(wait * 1000, signal);
    const j = await post(f, `${login}/login/oauth/access_token`, { client_id: clientId, device_code: deviceCode, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' });
    if (j.access_token) return j.access_token;
    if (j.error === 'authorization_pending') { if (now() > end) break; continue; }
    if (j.error === 'slow_down') { wait = Number(j.interval) || wait + 5; continue; }
    if (j.error === 'access_denied') throw new GitHubError('the sign-in was refused on GitHub', null, 403);
    if (j.error === 'expired_token') break;
    throw new GitHubError(`GitHub's sign-in failed (${j.error_description || j.error || 'no token'})`, null, 400);
  }
  throw new GitHubError('the sign-in code expired before it was authorized', 'Sign in with GitHub again: a new code is given.', 408);
}

// ------------------------------------------------------------------ git's objects
const utf8 = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');

/** A file's git blob hash (SHA-1 of "blob <size>\0" and its bytes), as GitHub's tree gives it: a text as UTF-8. */
export async function blobSha(data) {
  const body = typeof data === 'string' ? utf8.encode(data) : new Uint8Array(data);
  const head = utf8.encode(`blob ${body.length}\0`);
  const all = new Uint8Array(head.length + body.length);
  all.set(head); all.set(body, head.length);
  return hex(await globalThis.crypto.subtle.digest('SHA-1', all));
}

/** A blob's content from GitHub (base64) -> its bytes. */
export function fromBase64(b64) {
  const s = atob(String(b64 || '').replace(/\s+/g, ''));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Bytes as text when they are UTF-8 (a project's file), else null (a binary file: left as it is in the repository). */
export function textOf(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
}
