// The server's token kept off command lines (#2955): the browser a launcher opens gets a one-time code (single use, a
// short life, from the page itself only), a second launch takes a server for Silinx only when it proves it holds the
// token of its file, and the page replaces the token it keeps only with one the server accepts.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { scratchEnv, startApp } from './server-helpers.js';

let tmp;
before(async () => { tmp = fs.realpathSync(await scratchEnv('silinx-open-code-test-')); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const { createOpenCodes, tokenProof, holdsToken } = await import('../server/open-code.js');
const { startServer } = await import('../server/server.js');
const { tokenOf } = await import('../web/js/api.js');
const TOKEN = 'abcdefghijklmnopqrstuvwx';

const quiet = async fn => { const log = console.log; console.log = () => {}; try { return await fn(); } finally { console.log = log; } };

test('one-time codes: each redeemed once, before it expires; anything else refused', () => {
  let t = 1000;
  const codes = createOpenCodes({ ttl: 500, now: () => t, max: 3 });
  const a = codes.issue(), b = codes.issue();
  assert.match(a, /^[\w-]{24}$/);
  assert.notEqual(a, b);
  assert.equal(codes.redeem(a), true);
  assert.equal(codes.redeem(a), false, 'single use');
  t += 500;
  assert.equal(codes.redeem(b), false, 'expired');
  for (const x of [undefined, null, '', 42, {}, 'nope']) assert.equal(codes.redeem(x), false);
  // a few at most: the oldest goes first
  const c = [codes.issue(), codes.issue(), codes.issue(), codes.issue()];
  assert.equal(codes.redeem(c[0]), false);
  assert.deepEqual(c.slice(1).map(x => codes.redeem(x)), [true, true, true]);
});

test('regression #3014: a second launch opens the code only when it is one issue() makes; any other answer, the server alone', async () => {
  const OC = await import('../server/open-code.js');
  const url = 'http://127.0.0.1:8765';
  const code = createOpenCodes().issue();
  assert.equal(OC.openCodeUrl(url, code), `${url}/#code=${code}`);
  for (const x of [undefined, null, '', 42, {}, ['a'], 'short', `${code}x`, `${code.slice(0, 23)}&`, 'a&calc|b"c^d%e<f>g(h)i!jk',
    `${code.slice(0, 12)} ${code.slice(13)}`, `${code.slice(0, 23)}\n`]) assert.equal(OC.openCodeUrl(url, x), url, String(x));
  // the launcher builds its URL with it, not from the answer as it is
  const bin = fs.readFileSync(new URL('../bin/silinx.js', import.meta.url), 'utf8');
  assert.match(bin, /openBrowser\(openCodeUrl\(url, code\)\)/);
  assert.doesNotMatch(bin, /#code=\$\{code\}/);
});

test('POST /api/token: the token for a code, once, from the page only (its Origin); expired codes refused', async () => {
  let t = 0;
  const codes = createOpenCodes({ ttl: 60_000, now: () => t });
  const app = await startApp({ token: TOKEN, codes });
  const post = (code, headers = { origin: app.origin }) => app.raw('POST', '/api/token', { headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify({ code }) });
  try {
    const code = codes.issue();
    // without an Origin (not the page's fetch) or from another one: refused, the code not spent
    assert.deepEqual([(await post(code, {})).status, (await post(code, {})).body], [403, { error: 'cross-origin request refused' }]);
    assert.equal((await post(code, { origin: 'http://evil.example' })).status, 403);
    assert.equal((await post(code, { origin: app.origin, 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.deepEqual((await post(code)).body, { token: TOKEN }, 'the code refused above is still good');
    assert.deepEqual((await post(code)).body, { error: 'this address has expired: open the URL Silinx printed at start-up' });
    const c2 = codes.issue();
    const ok = await post(c2);
    assert.deepEqual([ok.status, ok.body], [200, { token: TOKEN }]);
    assert.equal((await post(c2)).status, 403, 'single use');
    const c3 = codes.issue();
    t += 60_000;
    assert.equal((await post(c3)).status, 403, 'expired');
    assert.equal((await post('made-up-code')).status, 403);
    // a code for a second launch: with the token only
    assert.equal((await app.raw('POST', '/api/open-code', { headers: { origin: app.origin } })).status, 403);
    const issued = await app.raw('POST', '/api/open-code', { headers: { 'x-silinx-token': TOKEN } });
    assert.equal(issued.status, 200);
    t = 0;
    assert.deepEqual((await post(issued.body.code)).body, { token: TOKEN });
    // the other routes still need the token
    assert.equal((await app.raw('GET', '/api/projects')).status, 403);
  } finally { await app.close(); }
});

test('GET /api/proof: an HMAC of the nonce, never the token; without a token, no such route', async () => {
  const app = await startApp({ token: TOKEN });
  try {
    const r = await app.raw('GET', '/api/proof?nonce=0123456789abcdef');
    assert.deepEqual([r.status, r.body], [200, { proof: tokenProof(TOKEN, '0123456789abcdef') }]);
    assert.ok(!JSON.stringify(r.body).includes(TOKEN));
    assert.notEqual(tokenProof(TOKEN, 'a'.repeat(16)), tokenProof(TOKEN, 'b'.repeat(16)));
    assert.deepEqual((await app.raw('GET', '/api/proof?nonce=short')).body, { error: 'a nonce is required' });
    assert.equal((await app.raw('GET', '/api/proof?nonce=0123456789abcdef', { headers: { 'sec-fetch-site': 'cross-site' } })).status, 403);
    assert.equal((await app.raw('GET', '/api/proof?nonce=0123456789abcdef', { headers: { host: 'rebound.example' } })).status, 403);
    assert.equal(await holdsToken(app.origin, TOKEN), true);
    assert.equal(await holdsToken(app.origin, 'another-token-of-24-chars'), false);
    assert.equal(await holdsToken(app.origin, null), false);
  } finally { await app.close(); }
  const open = await startApp();
  try {
    assert.equal((await open.raw('GET', '/api/proof?nonce=0123456789abcdef')).status, 404);
    assert.equal((await open.raw('POST', '/api/token', { headers: { origin: open.origin, 'content-type': 'application/json' }, body: '{"code":"x"}' })).status, 404);
    assert.equal(await holdsToken(open.origin, TOKEN), false);
  } finally { await open.close(); }
});

test('regression: a server that answers every request is not taken for Silinx', async () => {
  // (the old check: any 200 on /api/templates, the token sent to it)
  const seen = [];
  const other = http.createServer((req, res) => { seen.push(req.headers['x-silinx-token']); res.setHeader('content-type', 'application/json'); res.end('{"proof":"x"}'); });
  await new Promise(r => other.listen(0, '127.0.0.1', r));
  try {
    assert.equal(await holdsToken(`http://127.0.0.1:${other.address().port}`, TOKEN), false);
    assert.deepEqual(seen, [undefined], 'the token is never sent to it');
  } finally { other.closeAllConnections?.(); await new Promise(r => other.close(r)); }
  assert.equal(await holdsToken('http://127.0.0.1:1', TOKEN), false, 'nothing listening');
});

test('startServer: the address to open has a one-time code, not the token; the printed one keeps the token', async () => {
  const srv = await quiet(() => startServer({ port: 0, host: '127.0.0.1' }));
  const url = `http://127.0.0.1:${srv.address().port}`;
  try {
    assert.equal(srv.silinxUrl, `${url}/#token=${srv.silinxToken}`);
    const open = srv.silinxOpenUrl();
    assert.match(open, new RegExp(`^${url}/#code=[\\w-]{24}$`));
    assert.ok(!open.includes(srv.silinxToken));
    assert.notEqual(srv.silinxOpenUrl(), open, 'a new code each time');
    const code = open.split('#code=')[1];
    const exchange = () => fetch(`${url}/api/token`, { method: 'POST', headers: { origin: url, 'content-type': 'application/json' }, body: JSON.stringify({ code }) });
    assert.deepEqual(await (await exchange()).json(), { token: srv.silinxToken });
    assert.equal((await exchange()).status, 403);
  } finally { srv.closeAllConnections?.(); await new Promise(r => srv.close(r)); }
});

test('the page: an address\'s token only when the server accepts it, a code exchanged for the token', async () => {
  const codes = createOpenCodes();
  const app = await startApp({ token: TOKEN, codes });
  // the page's fetch: relative to the server, with its Origin
  const f = (u, init = {}) => fetch(app.origin + u, { ...init, headers: { origin: app.origin, ...init.headers } });
  try {
    assert.equal(await tokenOf('token', TOKEN, f), TOKEN);
    // regression: any #token=… replaced the token kept
    assert.equal(await tokenOf('token', 'junk', f), null);
    const code = codes.issue();
    assert.equal(await tokenOf('code', code, f), TOKEN);
    assert.equal(await tokenOf('code', code, f), null, 'single use');
    assert.equal(await tokenOf('code', 'junk', f), null);
  } finally { await app.close(); }
  assert.equal(await tokenOf('token', TOKEN, () => Promise.reject(new TypeError('offline'))), null, 'server not reached');
});
