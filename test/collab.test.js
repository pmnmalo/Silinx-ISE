// Shared projects, phase 1 (#3181): the document's layout (core/collab-doc.js), the encryption (core/collab-crypto.js),
// the link (core/collab-link.js), and two participants on the relay of Silinx's own server (server/collab-relay.js
// through server/server.js createApp): the project arrives, an edit arrives, the owner's view and the presence, a
// follower's edit refused (read only), a wrong key, an unknown room, stopping sharing; the server's checks (the token
// to open a room, the host, the origin, another path); the relay sees no file (a raw follower without the key gets
// only sealed bytes); its limits.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { scratchEnv } from './server-helpers.js';
import { newKey, keyOf, seal, unseal, KEY_RE } from '../core/collab-crypto.js';
import { followLink, parseFollowLink, relayUrl, ROOM_RE } from '../core/collab-link.js';
import { projectDoc, publishProject, putFile, putProject, moveFile, dropFile, docFile, docProject, setText, sharedPath, watchDoc, FILE_MAX } from '../core/collab-doc.js';
import { shareRoom, followRoom, KIND, PROTOCOL, colorOf, COLORS } from '../core/collab-client.js';
import { attachRelay, RELAY_LIMITS } from '../server/collab-relay.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(10); } };

let tmp, srv, base;
before(async () => {
  tmp = await scratchEnv('silinx-collab-');
  const { createApp } = await import('../server/server.js');
  const app = await createApp({ host: '127.0.0.1', token: 'the-token' });
  srv = app.listen(0, '127.0.0.1');
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}/`;
});
after(async () => { srv?.closeAllConnections?.(); await new Promise(r => srv.close(r)); const fs = await import('node:fs'); fs.rmSync(tmp, { recursive: true, force: true }); });

const PROJECT = { name: 'traffic', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], device: { part: 'xc3s250e' } };
const FILES = { 'src/top.vhd': 'entity top is end;\n', 'src/top.ucf': 'NET "clk" LOC = "B8";\n' };
const owned = () => { const doc = projectDoc(); publishProject(doc, { project: { ...PROJECT, fileTree: Object.keys(FILES) }, files: FILES, owner: 'Ana' }); return doc; };
const url = () => relayUrl(base);

test('crypto: a sealed message opens with its key, room and kind only; a key\'s text round trips', async () => {
  const { key, text } = await newKey();
  assert.match(text, KEY_RE);
  const again = await keyOf(text);
  const msg = new TextEncoder().encode('entity top is end;');
  const f = await seal(key, 'room1', KIND.update, msg);
  assert.equal(f[0], KIND.update);
  assert.equal(f.length, 1 + 12 + msg.length + 16);
  assert.ok(!Buffer.from(f).includes(Buffer.from('entity')), 'the text is not in the frame');
  assert.deepEqual(await unseal(again, 'room1', f), { kind: KIND.update, bytes: msg });
  // (another room, another kind, another key, a frame cut: refused)
  await assert.rejects(unseal(key, 'room2', f), /the link's key does not open/);
  const changed = f.slice(); changed[0] = KIND.awareness;
  await assert.rejects(unseal(key, 'room1', changed), /the link's key does not open/);
  await assert.rejects(unseal((await newKey()).key, 'room1', f), /the link's key does not open/);
  await assert.rejects(unseal(key, 'room1', f.subarray(0, 20)), /too short/);
  await assert.rejects(keyOf('short'), /the link's key is not valid/);
  // (two seals of one message differ: a fresh IV each)
  assert.notDeepEqual(await seal(key, 'room1', 1, msg), f);
});

test('link: made and parsed; another hash is not one; a broken one is said', () => {
  const room = 'A'.repeat(22), key = 'b'.repeat(43);
  const l = followLink('http://localhost:8642/?x=1#old', room, key);
  assert.equal(l, `http://localhost:8642/#follow=${room}.${key}`);
  assert.deepEqual(parseFollowLink(l), { base: 'http://localhost:8642/', room, key });
  assert.deepEqual(parseFollowLink(`#follow=${room}.${key}`), { base: null, room, key });
  assert.equal(parseFollowLink('http://x/#design=abc'), null);
  assert.equal(parseFollowLink('http://x/'), null);
  assert.throws(() => parseFollowLink('http://x/#follow=abc'), /the link to follow is broken/);
  assert.throws(() => parseFollowLink(`#follow=${room}.${key}&view=try`), /broken/);
  assert.throws(() => followLink('http://x/', 'bad', key), /not a room/);
  assert.equal(relayUrl('https://silinx.example.org/app/?q#h'), 'wss://silinx.example.org/api/collab');
  assert.equal(relayUrl('http://127.0.0.1:8642/'), 'ws://127.0.0.1:8642/api/collab');
  assert.match('x'.repeat(22), ROOM_RE);
});

test('doc: a project published, its files as texts, build/, hidden files, silinx.json and paths out of it never', () => {
  for (const p of ['src/a.vhd', 'a.ucf', 'sim/tb_a.vhd', 'src/x.sch.json']) assert.ok(sharedPath(p), p);
  for (const p of ['', '/etc/passwd', '../x', 'src/../x', 'src/./x', 'build/top.bit', 'BUILD/x', '.git/config', 'src/.env', 'a\\b', 'C:/x', 'silinx.json', 'x'.repeat(600), 7, null]) assert.ok(!sharedPath(p), String(p));
  const doc = projectDoc();
  publishProject(doc, { project: { ...PROJECT, fileTree: ['x'] }, files: { ...FILES, 'build/top.bit': 'x', '.env': 'secret', 'big.txt': 'x'.repeat(FILE_MAX + 1) }, owner: 'Ana' });
  const d = docProject(doc);
  assert.deepEqual(d, { version: 1, owner: 'Ana', project: PROJECT, fileTree: ['src/top.ucf', 'src/top.vhd'] });
  assert.equal(docFile(doc, 'src/top.vhd'), FILES['src/top.vhd']);
  assert.equal(docFile(doc, 'build/top.bit'), null);
  assert.equal(docFile(doc, 'nope'), null);
  moveFile(doc, 'src/top.ucf', 'src/board.ucf');
  assert.deepEqual(docProject(doc).fileTree, ['src/board.ucf', 'src/top.vhd']);
  dropFile(doc, 'src/board.ucf');
  assert.deepEqual(docProject(doc).fileTree, ['src/top.vhd']);
  // (published again: a file gone from the project removed)
  publishProject(doc, { project: PROJECT, files: { 'src/b.v': 'module b; endmodule\n' }, owner: 'Ana' });
  assert.deepEqual(docProject(doc).fileTree, ['src/b.v']);
});

test('doc: a text changed by its middle only (the update carries the edit), equal texts no update', () => {
  const doc = new Y.Doc(), yt = doc.getText('t');
  setText(yt, 'architecture rtl of top is begin end;');
  const before = Y.encodeStateVector(doc);
  assert.equal(setText(yt, 'architecture rtl of top is begin end;'), false);
  assert.equal(setText(yt, 'architecture rtl of top is signal s : bit; begin end;'), true);
  assert.equal(yt.toString(), 'architecture rtl of top is signal s : bit; begin end;');
  const upd = Y.encodeStateAsUpdate(doc, before);
  assert.ok(upd.length < 60, `${upd.length} bytes`);
  for (const [a, b] of [['abc', ''], ['', 'abc'], ['aaa', 'aa'], ['ab', 'aXb'], ['héllo', 'hello'], ['x\ny\n', 'x\nz\ny\n']]) {
    const d2 = new Y.Doc(), t2 = d2.getText('t');
    setText(t2, a); setText(t2, b);
    assert.equal(t2.toString(), b, `${a} -> ${b}`);
  }
});

test('doc: watchDoc tells the remote changes by path and kind, the project\'s too; local changes not', () => {
  const a = owned(), b = projectDoc();
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a), 'remote');
  const seen = [];
  const off = watchDoc(b, ev => seen.push(ev));
  const send = fn => { const sv = Y.encodeStateVector(b); fn(); Y.applyUpdate(b, Y.encodeStateAsUpdate(a, sv), 'remote'); };
  send(() => putFile(a, 'src/top.vhd', 'entity top is port (a : in bit); end;\n'));
  send(() => putFile(a, 'src/new.v', 'module n; endmodule\n'));
  send(() => dropFile(a, 'src/top.ucf'));
  send(() => putProject(a, { ...PROJECT, top: 'n' }));
  putFile(b, 'src/local.vhd', 'x');   // (local: not told)
  off();
  send(() => putFile(a, 'src/new.v', 'module n2; endmodule\n'));
  assert.deepEqual(seen, [
    { changes: [{ path: 'src/top.vhd', kind: 'changed' }], project: false },
    { changes: [{ path: 'src/new.v', kind: 'created' }], project: false },
    { changes: [{ path: 'src/top.ucf', kind: 'deleted' }], project: false },
    { changes: [], project: true },
  ]);
});

test('two participants on the server\'s relay: the project arrives, an edit arrives, the owner\'s view, the presence both ways', async () => {
  const doc = owned();
  const evs = [];
  const owner = await shareRoom({ url: url(), token: 'the-token', doc, user: { name: 'Ana' }, onEvent: e => evs.push(e.type) });
  assert.match(owner.room, ROOM_RE);
  const link = followLink(base, owner.room, owner.key);
  const l = parseFollowLink(link);
  owner.setView({ path: 'src/top.vhd', line: 0, ch: 7 });
  const fol = await followRoom({ url: relayUrl(l.base), room: l.room, key: l.key, user: { name: 'Rui' } });
  await fol.ready;
  assert.deepEqual(docProject(fol.doc), { version: 1, owner: 'Ana', project: PROJECT, fileTree: ['src/top.ucf', 'src/top.vhd'] });
  assert.equal(docFile(fol.doc, 'src/top.vhd'), FILES['src/top.vhd']);
  const changes = [];
  watchDoc(fol.doc, ev => changes.push(...ev.changes));
  putFile(doc, 'src/top.vhd', 'entity top is end entity;\n');
  await until(() => docFile(fol.doc, 'src/top.vhd') === 'entity top is end entity;\n', 'the edit');
  assert.deepEqual(changes, [{ path: 'src/top.vhd', kind: 'changed' }]);
  const o = await until(() => fol.owner()?.view && fol.owner(), 'the owner\'s view');
  assert.deepEqual(o, { client: doc.clientID, name: 'Ana', color: colorOf(doc.clientID), role: 'owner', view: { path: 'src/top.vhd', line: 0, ch: 7 } });
  fol.setView({ path: 'src/top.ucf', line: 0, ch: 0 });
  await until(() => owner.peers()[0]?.view?.path === 'src/top.ucf', 'the follower\'s view');
  assert.deepEqual(owner.peers().map(p => [p.name, p.role]), [['Rui', 'follower']]);
  // a second follower sees the owner and the first
  const fol2 = await followRoom({ url: url(), room: owner.room, key: owner.key, user: { name: 'Eva' } });
  await fol2.ready;
  await until(() => fol2.peers().length === 2, 'Eva sees both');
  assert.deepEqual(fol2.peers().map(p => [p.name, p.role]), [['Ana', 'owner'], ['Rui', 'follower']]);
  assert.equal(docFile(fol2.doc, 'src/top.vhd'), 'entity top is end entity;\n');
  // one leaves: the others are told
  await fol2.close();
  await until(() => owner.peers().length === 1 && fol.peers().length === 1, 'Eva gone');
  assert.ok(evs.includes('peers'));
  await owner.close();
  await until(() => fol.closed(), 'the follower closed');
});

test('read only: a follower\'s edit is refused by the relay and never reaches the owner; the presence a follower claims is not the owner\'s', async () => {
  const doc = owned();
  const owner = await shareRoom({ url: url(), token: 'the-token', doc, user: { name: 'Ana' } });
  const errors = [];
  const fol = await followRoom({ url: url(), room: owner.room, key: owner.key, user: { name: 'Rui' }, onEvent: e => { if (e.type === 'error') errors.push(e.message); } });
  await fol.ready;
  // (a real update made with the room's key, sent as a follower)
  const other = projectDoc();
  Y.applyUpdate(other, Y.encodeStateAsUpdate(fol.doc));
  const sv = Y.encodeStateVector(other);
  putFile(other, 'src/top.vhd', 'hacked');
  fol.send(KIND.update, Y.encodeStateAsUpdate(other, sv));
  await until(() => errors.length, 'the refusal');
  assert.deepEqual(errors, ['read only: a follower cannot change the shared project']);
  await sleep(100);
  assert.equal(docFile(doc, 'src/top.vhd'), FILES['src/top.vhd'], 'the owner\'s project unchanged');
  // (a follower calling itself the owner is still a follower)
  fol.awareness.setLocalStateField('role', 'owner');
  await sleep(100);
  assert.deepEqual(owner.peers().map(p => p.role), ['follower']);
  await owner.close();
});

test('a wrong key, an unknown room, a room no longer shared: refused, said', async () => {
  const owner = await shareRoom({ url: url(), token: 'the-token', doc: owned(), user: { name: 'Ana' } });
  const errors = [];
  const bad = await followRoom({ url: url(), room: owner.room, key: (await newKey()).text, user: { name: 'Eve' }, onEvent: e => { if (e.type === 'error') errors.push(e.message); } });
  await assert.rejects(bad.ready, /the link's key does not open/);
  assert.deepEqual(errors, ['a message that the link\'s key does not open']);
  assert.deepEqual(docProject(bad.doc).fileTree, []);
  await bad.close();
  await assert.rejects(followRoom({ url: url(), room: 'Z'.repeat(22), key: owner.key, user: { name: 'Rui' } }), /no longer shared/);
  const room = owner.room;
  await owner.close();
  await sleep(50);
  await assert.rejects(followRoom({ url: url(), room, key: owner.key, user: { name: 'Rui' } }), /no longer shared/);
});

test('the server: opening a room needs its token; the host, the origin and the path checked as the API\'s', async () => {
  await assert.rejects(shareRoom({ url: url(), token: 'wrong', doc: owned(), user: { name: 'x' } }), /sharing a project needs this Silinx server's token/);
  await assert.rejects(shareRoom({ url: url(), token: null, doc: owned(), user: { name: 'x' } }), /needs this Silinx server's token/);
  const upgrade = (path, headers = {}) => new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.address().port}${path}`, { headers });
    ws.on('open', () => { ws.close(); resolve('open'); });
    ws.on('unexpected-response', (_, res) => resolve(res.statusCode));
    ws.on('error', () => resolve('error'));
  });
  assert.equal(await upgrade('/api/collab'), 'open');
  assert.equal(await upgrade('/api/collab', { Origin: base.replace(/\/$/, '') }), 'open');
  assert.equal(await upgrade('/api/collab', { Origin: 'https://evil.example' }), 403);
  assert.equal(await upgrade('/api/collab', { Host: 'evil.example' }), 403);
  assert.equal(await upgrade('/api/other'), 404);
  assert.equal(await upgrade('/api/projects'), 404);
});

test('the relay reads nothing: a participant without the key gets only sealed frames, never a file\'s text; a stranger\'s first message refused', async () => {
  const owner = await shareRoom({ url: url(), token: 'the-token', doc: owned(), user: { name: 'Ana' } });
  const raw = new WebSocket(url());
  const frames = [];
  const texts = [];
  raw.on('message', (d, bin) => (bin ? frames.push(Buffer.from(d)) : texts.push(JSON.parse(String(d)))));
  await new Promise(r => raw.on('open', r));
  raw.send(JSON.stringify({ type: 'join', v: PROTOCOL, room: owner.room, client: 7 }));
  await until(() => frames.length >= 2, 'the snapshot and the awareness');
  assert.deepEqual(texts[0], { type: 'joined', owner: owner.doc.clientID });
  for (const f of frames) {
    assert.ok([KIND.update, KIND.awareness].includes(f[0]));
    for (const s of ['entity top', 'NET "clk"', 'traffic', 'Ana', 'src/top.vhd']) assert.ok(!f.includes(Buffer.from(s)), `"${s}" not in a frame`);
  }
  raw.close();
  await owner.close();
  // (no hello, an old protocol, a binary first: closed with the reason)
  for (const first of [JSON.stringify({ type: 'join', v: 0, room: 'x', client: 1 }), JSON.stringify({ type: 'hello', v: PROTOCOL, client: 1 }), Buffer.from([1, 2, 3])]) {
    const ws = new WebSocket(url());
    const got = [];
    ws.on('message', d => got.push(JSON.parse(String(d))));
    await new Promise(r => ws.on('open', r));
    ws.send(first);
    await new Promise(r => ws.on('close', r));
    assert.deepEqual(got, [{ type: 'error', message: 'not a Silinx participant of this version' }]);
  }
});

test('the relay\'s limits: followers per room, rooms, a follower\'s message size; a room ends with its owner\'s connection', async () => {
  const s = http.createServer();
  const relay = attachRelay(s, { limits: { ...RELAY_LIMITS, followers: 1, rooms: 1, followerFrame: 100 } });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const u = `ws://127.0.0.1:${s.address().port}/api/collab`;
  const owner = await shareRoom({ url: u, doc: owned(), user: { name: 'Ana' } });
  await assert.rejects(shareRoom({ url: u, doc: owned(), user: { name: 'Bo' } }), /shares 1 projects already/);
  const errors = [];
  const fol = await followRoom({ url: u, room: owner.room, key: owner.key, user: { name: 'Rui' }, onEvent: e => { if (e.type === 'error') errors.push(e.message); } });
  await fol.ready;
  await assert.rejects(followRoom({ url: u, room: owner.room, key: owner.key, user: { name: 'Eva' } }), /has 1 followers already/);
  fol.send(KIND.awareness, new Uint8Array(200));
  await until(() => errors.length, 'the size refused');
  assert.deepEqual(errors, ['a message too large for a follower']);
  // (the owner's connection lost, not closed by Stop Sharing: the room ends, the follower told)
  [...relay.rooms.values()][0].owner.terminate();
  await until(() => fol.closed(), 'the follower closed');
  assert.equal(relay.rooms.size, 0);
  relay.close();
  await new Promise(r => s.close(r));
  assert.ok(COLORS.includes(colorOf(5)));
});
