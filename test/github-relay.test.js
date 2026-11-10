// Silinx's GitHub sign-in relay (#3196, relay/github-device-flow/worker.js), its Cloudflare Worker run here with a stand-in
// for GitHub (test/fake-github.mjs): only the device flow's two POSTs forwarded, with only their own fields; only Silinx's
// origins (ALLOWED_ORIGINS too); the CORS preflight; CLIENT_ID; GitHub out of reach; nothing logged, nothing kept (no
// console, no storage in its code); and the browser edition's whole sign-in through it (core/github-api.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import worker, { ORIGINS } from '../relay/github-device-flow/worker.js';
import { fakeGitHub } from './fake-github.mjs';
import { startDeviceFlow, pollDeviceFlow } from '../core/github-api.js';

const RELAY = 'https://silinx-github-relay.example.workers.dev';
const SITE = 'https://pmnmalo.github.io';
const post = (p, body, { origin = SITE, method = 'POST' } = {}) => new Request(`${RELAY}${p}`, { method, headers: { Origin: origin, 'Content-Type': 'application/x-www-form-urlencoded' }, body: method === 'POST' ? body : undefined });
// GitHub as the relay reaches it: the stand-in, every request it got recorded
function github() {
  const gh = fakeGitHub();
  const seen = [];
  const fetcher = async (url, o) => { seen.push({ url, body: o.body, headers: o.headers }); return gh.fetch(url, o); };
  return { gh, seen, run: (req, env = {}) => worker.fetch(req, env, {}, fetcher) };
}

test('only the device flow\'s two POSTs, with only their own fields, to github.com; the answer with CORS for the origin', async () => {
  const { gh, seen, run } = github();
  const r = await run(post('/login/device/code', `client_id=${gh.clientId}&scope=repo&redirect_uri=https://evil.example&client_secret=x`));
  assert.equal(r.status, 200);
  assert.deepEqual([r.headers.get('access-control-allow-origin'), r.headers.get('vary'), r.headers.get('cache-control')], [SITE, 'Origin', 'no-store']);
  const j = await r.json();
  assert.match(j.user_code, /^WDJB-\d{4}$/);
  assert.deepEqual(seen.map((s) => [s.url, s.body]), [['https://github.com/login/device/code', `client_id=${encodeURIComponent(gh.clientId)}&scope=repo`]]);
  gh.authorize(j.user_code);
  const t = await run(post('/login/oauth/access_token', `client_id=${gh.clientId}&device_code=${j.device_code}&grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Adevice_code&extra=1`));
  assert.equal((await t.json()).access_token, gh.token);
  assert.equal(seen[1].url, 'https://github.com/login/oauth/access_token');
  assert.equal(new URLSearchParams(seen[1].body).has('extra'), false);
  // nothing else: another path, another method
  assert.equal((await run(post('/repos/a/b', 'x'))).status, 404);
  assert.equal((await run(post('/login/oauth/authorize', 'x'))).status, 404);
  assert.equal((await run(post('/login/device/code', null, { method: 'GET' }))).status, 405);
  assert.equal(seen.length, 2);
});

test('only Silinx\'s origins (ALLOWED_ORIGINS too); the preflight; CLIENT_ID; a body too large; GitHub out of reach', async () => {
  const { gh, seen, run } = github();
  assert.deepEqual(ORIGINS, [SITE]);
  for (const origin of ['https://evil.example', 'https://pmnmalo.github.io.evil.example', '', 'null']) {
    const r = await run(post('/login/device/code', `client_id=${gh.clientId}`, { origin }));
    assert.equal(r.status, 403, origin);
    assert.equal(r.headers.get('access-control-allow-origin'), null);
  }
  assert.equal((await run(post('/login/device/code', `client_id=${gh.clientId}`, { origin: 'http://127.0.0.1:8642' }), { ALLOWED_ORIGINS: 'http://127.0.0.1:8642, https://x.example' })).status, 200);
  assert.equal((await run(post('/login/device/code', `client_id=${gh.clientId}`), { ALLOWED_ORIGINS: 'https://x.example' })).status, 403);
  const pre = await run(new Request(`${RELAY}/login/oauth/access_token`, { method: 'OPTIONS', headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST' } }));
  assert.equal(pre.status, 204);
  assert.deepEqual([pre.headers.get('access-control-allow-origin'), pre.headers.get('access-control-allow-methods')], [SITE, 'POST']);
  assert.equal((await run(post('/login/device/code', 'client_id=Iv1.other'), { CLIENT_ID: gh.clientId })).status, 403);
  assert.equal((await run(post('/login/device/code', `client_id=${gh.clientId}`), { CLIENT_ID: gh.clientId })).status, 200);
  assert.equal((await run(post('/login/device/code', `client_id=${'x'.repeat(5000)}`))).status, 413);
  const off = await worker.fetch(post('/login/device/code', `client_id=${gh.clientId}`), {}, {}, async () => { throw new TypeError('fetch failed'); });
  assert.deepEqual([off.status, await off.json()], [502, { error: 'github_unreachable' }]);
  assert.equal(seen.length, 2);
});

test('nothing logged, nothing kept: no console in its code, no storage; nothing written to the console while it runs', async () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, '..', 'relay', 'github-device-flow', 'worker.js'), 'utf8');
  for (const re of [/console\./, /\bcaches\b/, /\bKV\b|\.put\(/, /indexedDB|localStorage/, /waitUntil/]) assert.ok(!re.test(src), String(re));
  const toml = fs.readFileSync(path.join(import.meta.dirname, '..', 'relay', 'github-device-flow', 'wrangler.toml'), 'utf8');
  assert.match(toml, /\[observability\]\nenabled = false/);
  assert.ok(!/kv_namespaces|d1_databases|r2_buckets/.test(toml));
  const { gh, run } = github();
  const said = [];
  const keep = { ...console };
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) console[k] = (...a) => said.push(a.join(' '));
  try {
    const j = await (await run(post('/login/device/code', `client_id=${gh.clientId}`))).json();
    gh.authorize(j.user_code);
    await run(post('/login/oauth/access_token', `client_id=${gh.clientId}&device_code=${j.device_code}&grant_type=x`));
  } finally { Object.assign(console, keep); }
  assert.deepEqual(said, []);
});

test('the browser edition\'s sign-in through the relay: the code, then the token', async () => {
  const { gh, run } = github();
  // (the page's fetch: the relay's URL answered by the worker, as Cloudflare would)
  const page = async (url, o) => { assert.ok(url.startsWith(RELAY), url); const r = await run(new Request(url, { ...o, headers: { ...o.headers, Origin: SITE } })); return r; };
  const d = await startDeviceFlow({ clientId: gh.clientId, login: RELAY, fetch: page });
  gh.authorize(d.userCode);
  assert.equal(await pollDeviceFlow({ clientId: gh.clientId, ...d }, { login: RELAY, fetch: page, sleep: async () => {} }), gh.token);
});
