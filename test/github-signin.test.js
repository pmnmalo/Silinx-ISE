// The browser edition's GitHub sign-in, its two ways (#3196, web/js/github-app.js, web/js/git-browser.js): with a relay
// and the OAuth App's client ID, the device flow; without them (the placeholders), a pasted fine-grained personal access
// token, checked with GitHub (a stand-in, test/fake-github.mjs) before it is kept in the browser's storage; a token that
// is not one, or that GitHub refuses, never kept and never in a message.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fakeGitHub } from './fake-github.mjs';
import { githubSettings, relayOrigin, PLACEHOLDER, GITHUB_OAUTH_CLIENT_ID, GITHUB_DEVICE_RELAY } from '../web/js/github-app.js';

const store = new Map();
let gh, git, keep;
before(async () => {
  keep = { fetch: globalThis.fetch, localStorage: globalThis.localStorage };
  globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
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
  assert.deepEqual(await git.githubSetToken(`  ${gh.token}\n`), { signedIn: true, login: 'student' });
  assert.equal(store.get('silinx.github-token'), gh.token);
  assert.equal(git.githubSignedIn(), true);
  // (the token only in the Authorization header)
  assert.ok(gh.requests.every((r) => !r.url.includes(gh.token)));
  await git.githubSignOut();
  assert.equal(store.has('silinx.github-token'), false);
});
