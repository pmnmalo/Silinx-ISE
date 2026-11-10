// The settings of the browser edition's GitHub sign-in (#3196), the maintainer's. A page cannot run OAuth's device flow
// by itself (github.com's two endpoints send no CORS headers): with a relay (relay/github-device-flow, a Cloudflare
// Worker the maintainer deploys, its URL GITHUB_DEVICE_RELAY) and Silinx's GitHub OAuth App (registered by the maintainer:
// github.com ▸ Settings ▸ Developer settings ▸ OAuth Apps ▸ New OAuth App, "Enable Device Flow" ticked; its client ID
// public, the device flow has no secret), Sign in with GitHub… runs the device flow through the relay; without them, the
// user pastes a fine-grained personal access token of theirs. Either way the token is kept in the browser only. The
// site's Content-Security-Policy allows the relay's origin (scripts/build-standalone.mjs). A UI test points the page at
// a stand-in for GitHub instead (globalThis.SILINX_GITHUB = { api, login, clientId }: test/fake-github.mjs).

// The placeholders: replace them with the OAuth App's client ID (it starts "Ov23li" or "Iv1.") and the relay's URL (the
// deployed worker's, https://…workers.dev), then build the site again.
export const PLACEHOLDER = 'REPLACE-ME-with-the-client-ID-of-Silinx-GitHub-OAuth-App';
export const GITHUB_OAUTH_CLIENT_ID = PLACEHOLDER;
export const GITHUB_DEVICE_RELAY = '';

/** A relay's URL, checked (https only, no path but /): its origin, or null. */
export function relayOrigin(url) {
  try { const u = new URL(String(url || '')); return u.protocol === 'https:' && (u.pathname === '/' || u.pathname === '') && !u.search && !u.hash && !u.username ? u.origin : null; } catch { return null; }
}

const own = () => globalThis.SILINX_GITHUB || {};
/** Where the API and the sign-in are, the client ID ('' while it is the placeholder), and the sign-in's way: 'device'
 *  (the device flow, through the relay) or 'token' (a pasted personal access token). */
export function githubSettings() {
  const t = own();
  const id = t.clientId ?? GITHUB_OAUTH_CLIENT_ID;
  const clientId = id === PLACEHOLDER ? '' : id;
  const login = t.login || relayOrigin(t.relay ?? GITHUB_DEVICE_RELAY) || '';
  return { api: t.api || 'https://api.github.com', login, clientId, signIn: login && clientId ? 'device' : 'token' };
}
