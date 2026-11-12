// The browser edition's GitHub sign-in, its two ways (#3196, web/js/github-app.js, web/js/git-browser.js): with a relay
// and the OAuth App's client ID, the device flow; without them (the placeholders), a pasted fine-grained personal access
// token, checked with GitHub (a stand-in, test/fake-github.mjs) before it is kept in the browser's storage; a token that
// is not one, or that GitHub refuses, never kept and never in a message. #3356: the token in the browser's storage
// (localStorage, Remember me: the default), in this tab's (sessionStorage) when the user unticks it, under the edition's
// own key; the device flow
// asks for the public repositories and the gists, the private ones only when the user asks.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGitHub } from './fake-github.mjs';
import { githubSettings, relayOrigin, PLACEHOLDER, GITHUB_OAUTH_CLIENT_ID, GITHUB_DEVICE_RELAY } from '../web/js/github-app.js';

const store = new Map(), session = new Map();
const area = (m) => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) });
let gh, git, keep;
before(async () => {
  keep = { fetch: globalThis.fetch, localStorage: globalThis.localStorage, sessionStorage: globalThis.sessionStorage };
  globalThis.localStorage = area(store);
  globalThis.sessionStorage = area(session);
  gh = fakeGitHub();
  globalThis.fetch = gh.fetch;
  const { browserGit } = await import('../web/js/git-browser.js');
  git = browserGit({ store: () => ({ kind: 'browser', label: null }), ops: {} });
});
after(() => { Object.assign(globalThis, keep); delete globalThis.SILINX_GITHUB; });

test('the settings: the placeholders until the maintainer sets them; the device flow only with a relay and a client ID', () => {
  assert.equal(GITHUB_OAUTH_CLIENT_ID, PLACEHOLDER);
  assert.equal(GITHUB_DEVICE_RELAY, '');
  delete globalThis.SILINX_GITHUB;
  assert.deepEqual(githubSettings(), { api: 'https://api.github.com', login: '', clientId: '', signIn: 'token' });
  globalThis.SILINX_GITHUB = { relay: 'https://silinx-github-relay.example.workers.dev', clientId: 'Ov23liX' };
  assert.deepEqual(githubSettings(), { api: 'https://api.github.com', login: 'https://silinx-github-relay.example.workers.dev', clientId: 'Ov23liX', signIn: 'device' });
  globalThis.SILINX_GITHUB = { relay: 'https://silinx-github-relay.example.workers.dev' };
  assert.equal(githubSettings().signIn, 'token');
  for (const u of ['http://relay.example', 'https://relay.example/path', 'https://u:p@relay.example', 'https://relay.example/?x=1', 'relay.example', '']) assert.equal(relayOrigin(u), null, u);
  assert.equal(relayOrigin('https://relay.example/'), 'https://relay.example');
});

test('a pasted token: one that is not a token, one GitHub refuses, never kept; a good one kept, its user said', async () => {
  globalThis.SILINX_GITHUB = { api: 'https://api.github.com' };
  assert.equal(git.githubSignInWay(), 'token');
  assert.equal(git.githubSignedIn(), false);
  await assert.rejects(git.githubSetToken('not a token'), { message: 'that is not a GitHub token', hint: 'Paste the token GitHub showed when it was generated (github_pat_…).' });
  await assert.rejects(git.githubSetToken('github_pat_11AAAAAAA0_refusedrefusedrefused'), (e) => {
    assert.equal(e.message, 'GitHub refused the sign-in (Bad credentials)');
    assert.equal(e.hint, 'GitHub refused this token: check it was copied whole, and that it has not expired.');
    assert.ok(!`${e.message} ${e.hint}`.includes('refusedrefused'));
    return true;
  });
  assert.equal(git.githubSignedIn(), false);
  // (#3356: in this browser, Remember me being the default)
  assert.deepEqual(await git.githubSetToken(`  ${gh.token}\n`), { signedIn: true, remembered: true, login: 'student' });
  assert.deepEqual([store.get('silinx.github-token'), session.has('silinx.github-token')], [gh.token, false]);
  assert.equal(git.githubSignedIn(), true);
  // (the token only in the Authorization header)
  assert.ok(gh.requests.every((r) => !r.url.includes(gh.token)));
  await git.githubSignOut();
  assert.equal(session.has('silinx.github-token') || store.has('silinx.github-token'), false);
});

test('#3356 where the token is kept: this browser (remembered, the default), or this tab when not (the other place cleared), the edition\'s own key; Sign out forgets both', async () => {
  globalThis.SILINX_GITHUB = { api: 'https://api.github.com' };
  assert.deepEqual(await git.githubSetToken(gh.token, { remember: false }), { signedIn: true, remembered: false, login: 'student' });
  assert.deepEqual([session.get('silinx.github-token'), store.has('silinx.github-token')], [gh.token, false]);
  assert.equal(git.githubSignedIn(), true);
  await git.githubSetToken(gh.token);
  assert.deepEqual([store.get('silinx.github-token'), session.has('silinx.github-token')], [gh.token, false], 'remembered now: the tab\'s copy cleared');
  await git.githubSetToken(gh.token, { remember: false });
  await git.githubSignOut();
  assert.equal(session.has('silinx.github-token') || store.has('silinx.github-token'), false);
  assert.equal(git.githubSignedIn(), false);
  // the development site's edition: its own key, the release's sign-in not its
  const { browserGit } = await import('../web/js/git-browser.js');
  const dev = browserGit({ store: () => ({ kind: 'browser', label: null }), ops: {}, prefix: 'silinx.dev.' });
  await git.githubSetToken(gh.token, { remember: false });
  assert.equal(dev.githubSignedIn(), false);
  await dev.githubSetToken(gh.token);
  assert.deepEqual([...store.keys()].filter((k) => /github-token/.test(k)), ['silinx.dev.github-token']);
  await dev.githubSignOut();
  await git.githubSignOut();
});

test('#3530 regression: at file: (the single file opened from the disk) the token is kept in this tab only, Remember me or not; one left in localStorage neither read nor kept', async () => {
  globalThis.SILINX_GITHUB = { api: 'https://api.github.com' };
  const { canRemember } = await import('../web/js/git-browser.js');
  const had = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { value: { protocol: 'file:' }, configurable: true });
  try {
    assert.equal(canRemember(), false);
    // (a token an older Silinx remembered: not read at file:)
    store.set('silinx.github-token', gh.token);
    assert.equal(git.githubSignedIn(), false);
    assert.deepEqual(await git.githubSetToken(gh.token), { signedIn: true, remembered: false, login: 'student' });
    assert.deepEqual([session.get('silinx.github-token'), store.has('silinx.github-token')], [gh.token, false]);
    assert.equal(git.githubSignedIn(), true);
    // (the device flow too)
    const g2 = fakeGitHub({ interval: 0.01 });
    globalThis.fetch = g2.fetch;
    try {
      globalThis.SILINX_GITHUB = { relay: 'https://silinx-github-relay.example.workers.dev', clientId: g2.clientId };
      assert.deepEqual(await git.githubSignIn({ onCode: ({ userCode }) => g2.authorize(userCode), remember: true }), { signedIn: true, remembered: false });
      assert.deepEqual([session.get('silinx.github-token'), store.has('silinx.github-token')], [g2.token, false]);
    } finally { globalThis.fetch = gh.fetch; }
  } finally {
    await git.githubSignOut();
    if (had) Object.defineProperty(globalThis, 'location', had); else delete globalThis.location;
  }
  assert.equal(session.has('silinx.github-token') || store.has('silinx.github-token'), false);
  assert.equal(canRemember(), true);
});

test('#3356 the device flow asks for the public repositories and the gists, the private ones only when asked; the token kept as chosen', async () => {
  const g2 = fakeGitHub({ interval: 0.01 });
  globalThis.fetch = g2.fetch;
  try {
    globalThis.SILINX_GITHUB = { relay: 'https://silinx-github-relay.example.workers.dev', clientId: g2.clientId };
    assert.equal(git.githubSignInWay(), 'device');
    const authorize = ({ userCode }) => g2.authorize(userCode);
    assert.deepEqual(await git.githubSignIn({ onCode: authorize }), { signedIn: true, remembered: true });
    assert.deepEqual([store.get('silinx.github-token'), session.has('silinx.github-token')], [g2.token, false]);
    assert.deepEqual(await git.githubSignIn({ onCode: authorize, privateRepos: true, remember: false }), { signedIn: true, remembered: false });
    assert.deepEqual([session.get('silinx.github-token'), store.has('silinx.github-token')], [g2.token, false]);
    assert.deepEqual(g2.scopes(), ['public_repo gist', 'repo gist']);
    await git.githubSignOut();
  } finally { globalThis.fetch = gh.fetch; }
});

test('a short link\'s gist (#3223) in the browser edition: with the sign-in only, a secret gist of the user, read back with no token', async () => {
  globalThis.SILINX_GITHUB = { api: 'https://api.github.com' };
  assert.equal(await git.gistAvailable(), false);
  await assert.rejects(git.gistSave('the design'), { message: 'GitHub refused the sign-in (Requires authentication)' });
  await git.githubSetToken(gh.token);
  assert.equal(await git.gistAvailable(), true);
  const g = await git.gistSave('the design');
  assert.deepEqual(Object.keys(g).sort(), ['deleted', 'expires', 'id', 'key']);
  assert.deepEqual([g.expires, g.deleted], [null, 0]);
  assert.equal(gh.gists.get(g.id).public, false);
  const { loadGist } = await import('../core/gist-link.js');
  assert.equal(await loadGist(g, { fetch: gh.fetch }), 'the design');
  // (an expiry, #3629: in a week)
  const w = await git.gistSave('the design', 7);
  assert.ok(Math.abs(Date.parse(w.expires) - Date.now() - 7 * 86400000) < 60000, w.expires);
  assert.equal(await loadGist(w, { fetch: gh.fetch }), 'the design');
  await git.githubSignOut();
});
