// A Silinx server as the relay of another site's pages (#3227: the browser edition through a relay of its settings),
// opted in by config.json's relay (server/toolchain.js relayConfig): its origins let in on the relay's endpoints only,
// never on the API; its key opening a room as the token does, a wrong one refused; a link through that relay
// (core/collab-link.js …&relay=…) followed; the setting refused through the API (config.json only).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { scratchEnv } from './server-helpers.js';
import { shareRoom, followRoom, SUBPROTOCOL } from '../core/collab-client.js';
import { projectDoc, publishProject, docFile } from '../core/collab-doc.js';
import { followLink, parseFollowLink, relayUrl } from '../core/collab-link.js';

const KEY = 'a-relay-key-of-the-university-0123456789';
const SITE = 'https://site.example';
let tmp, srv, base;
before(async () => {
  tmp = await scratchEnv('silinx-relay-config-');
  const { createApp } = await import('../server/server.js');
  const app = await createApp({ host: '127.0.0.1', token: 'the-token', relay: { origins: [SITE], key: KEY } });
  srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}`;
});
after(async () => { srv?.closeAllConnections?.(); await new Promise(r => srv.close(r)); const fs = await import('node:fs'); fs.rmSync(tmp, { recursive: true, force: true }); });

const until = async (fn, what, ms = 4000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await new Promise(r => setTimeout(r, 10)); } };
const upgrade = (path, origin, protocols = [SUBPROTOCOL]) => new Promise(resolve => {
  const ws = new WebSocket(`${base.replace('http', 'ws')}${path}`, protocols, { headers: origin ? { Origin: origin } : {} });
  ws.on('open', () => { ws.close(); resolve('open'); });
  ws.on('unexpected-response', (_, res) => resolve(res.statusCode));
  ws.on('error', () => resolve('error'));
});

test('relayConfig: the origins as the browser sends them, http(s) only, once; a key of 24 characters at least', async () => {
  const { relayConfig, DEFAULT_CONFIG, FILE_ONLY } = await import('../server/toolchain.js');
  assert.deepEqual(relayConfig({ relay: { origins: ['https://a.example/app/', 'http://b.example:8080', 'https://a.example', 'ftp://c.example', 'https://u:p@d.example', 'not one', 5], key: 'x'.repeat(24), relays: ['https://r.example/x', 'ws://s.example'] } }),
    { origins: ['https://a.example', 'http://b.example:8080'], key: 'x'.repeat(24), relays: ['https://r.example'] });
  assert.deepEqual(relayConfig({ relay: { origins: 'https://a.example', key: 'short', relays: 'https://r.example' } }), { origins: [], key: '', relays: [] });
  assert.deepEqual(relayConfig({}), { origins: [], key: '', relays: [] });
  assert.deepEqual(DEFAULT_CONFIG.relay, { origins: [], key: '', relays: [] });
  assert.ok(FILE_ONLY.includes('relay'));
});

test('the setting: config.json only, never through the API', async () => {
  const { saveConfig } = await import('../server/toolchain.js');
  await assert.rejects(saveConfig({ relay: { origins: ['https://evil.example'], key: 'k'.repeat(30) } }, { fromApi: true }), /relay can only be set in .*config\.json/);
});

test('the site\'s pages: let in on the relay\'s endpoints, never on the API; another site refused', async () => {
  assert.equal(await upgrade('/api/collab/follow', SITE), 'open');
  assert.equal(await upgrade('/api/collab/share', SITE, [SUBPROTOCOL, `token.${KEY}`]), 'open');
  assert.equal(await upgrade('/api/collab/follow', 'https://evil.example'), 403);
  assert.equal(await upgrade('/api/collab/share', 'https://evil.example', [SUBPROTOCOL, `token.${KEY}`]), 403);
  // (the API: the site's page has no token, and its writes are cross-origin)
  const get = await fetch(`${base}/api/projects`, { headers: { Origin: SITE } });
  assert.equal(get.status, 403);
  const post = await fetch(`${base}/api/projects`, { method: 'POST', headers: { Origin: SITE, 'X-Silinx-Token': KEY, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(post.status, 403, 'the relay\'s key is no token of the API');
});

test('the relay\'s key opens a room, a wrong one does not; a link through that relay followed', async () => {
  const doc = projectDoc();
  publishProject(doc, { project: { name: 'p', fileTree: ['src/a.vhd'] }, files: { 'src/a.vhd': 'entity a is end;\n' }, owner: 'Ana' });
  await assert.rejects(shareRoom({ url: relayUrl(base, 'share'), token: `${KEY}x`, doc: projectDoc(), user: { name: 'x' } }), /sharing a project needs this Silinx server's token/);
  const owner = await shareRoom({ url: relayUrl(base, 'share'), token: KEY, doc, user: { name: 'Ana' } });
  // (the link: the site's address, the relay's in it)
  const link = followLink(`${SITE}/`, owner.room, owner.key, 'relay', null, base);
  assert.equal(link, `${SITE}/#follow=${owner.room}.${owner.key}&relay=${encodeURIComponent(base)}`);
  const l = parseFollowLink(link);
  assert.equal(l.relay, base);
  const fol = await followRoom({ url: relayUrl(l.relay, 'follow'), room: l.room, key: l.key, user: { name: 'Rui' } });
  await fol.ready;
  assert.equal(docFile(fol.doc, 'src/a.vhd'), 'entity a is end;\n');
  await owner.close();
  await until(() => fol.closed(), 'the follower closed');
});

test('a link through another relay: its address an http(s) origin, no user nor password, never with .host', () => {
  const room = 'R'.repeat(22), key = 'K'.repeat(43);
  assert.equal(followLink('https://site.example/app/', room, key, 'relay', null, 'https://relay.example.org:8642/some/path?q'),
    `https://site.example/app/#follow=${room}.${key}&relay=${encodeURIComponent('https://relay.example.org:8642')}`);
  assert.equal('relay' in parseFollowLink(`#follow=${room}.${key}`), false, 'no relay named: none in the link\'s room');
  for (const bad of [`#follow=${room}.${key}&relay=${encodeURIComponent('ftp://x.example')}`, `#follow=${room}.${key}.host&relay=${encodeURIComponent('https://x.example')}`,
    `#follow=${room}.${key}&relay=${encodeURIComponent('https://u:p@x.example')}`, `#follow=${room}.${key}&relay=%E0`, `#follow=${room}.${key}&relay=`, `#follow=${room}.${key}&other=1`]) {
    assert.throws(() => parseFollowLink(bad), /the link to follow is broken/, bad);
  }
  assert.throws(() => followLink('https://site.example/', room, key, 'relay', null, 'ftp://x'), /not a relay's address/);
  assert.throws(() => followLink('https://site.example/', room, key, 'host', null, 'https://x.example'), /not a relay's address/);
});

test('the relays a server\'s pages may use: config.json\'s relay.relays, in their Content-Security-Policy and GET /api/collab/relays; none, none', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { pageCsp } = await import('../server/server.js');
  const { configPath } = await import('../server/toolchain.js');
  const page = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'web', 'index.html');
  const connect = () => /connect-src ([^;]*)/.exec(pageCsp(page))[1].split(' ');
  const { TRACKER_SOURCES } = await import('../server/csp.js');
  const BASE = ["'self'", 'https://api.github.com', 'https://raw.githubusercontent.com', 'https://registry.npmjs.org', ...TRACKER_SOURCES];
  fs.rmSync(configPath(), { force: true });
  assert.deepEqual(connect(), BASE, 'none: no other');
  assert.deepEqual((await (await fetch(`${base}/api/collab/relays`, { headers: { 'X-Silinx-Token': 'the-token' } })).json()).relays, []);
  fs.writeFileSync(configPath(), JSON.stringify({ relay: { relays: ['https://relay.example.org/x', 'not one'] } }));
  try {
    assert.deepEqual(connect(), [...BASE, 'https://relay.example.org', 'wss://relay.example.org'], 'the listed one only, and its WebSockets');
    assert.ok(!connect().some(c => /^wss?:$/.test(c)), 'never a scheme alone');
    assert.deepEqual((await (await fetch(`${base}/api/collab/relays`, { headers: { 'X-Silinx-Token': 'the-token' } })).json()).relays, ['https://relay.example.org']);
  } finally { fs.rmSync(configPath(), { force: true }); }
});

test('relayList: the build\'s relays (SILINX_SITE_RELAYS), origins once each; one that is not refused, named', async () => {
  const { relayList } = await import('../core/collab-link.js');
  assert.deepEqual(relayList(' https://a.example/x, http://b.example:8080 https://a.example'), ['https://a.example', 'http://b.example:8080']);
  assert.deepEqual(relayList(''), []);
  assert.deepEqual(relayList(undefined), []);
  assert.throws(() => relayList('https://a.example ftp://x', 'SILINX_SITE_RELAYS'), /^Error: SILINX_SITE_RELAYS: not a relay's address \(an http\(s\) origin\): ftp:\/\/x$/);
});
