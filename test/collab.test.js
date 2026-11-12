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
import * as encoding from 'lib0/encoding';
import { scratchEnv } from './server-helpers.js';
import { closable } from './server-close.js';
import { newKey, keyOf, seal, unseal, KEY_RE } from '../core/collab-crypto.js';
import { followLink, parseFollowLink, relayUrl, ROOM_RE, withTop } from '../core/collab-link.js';
import { projectDoc, publishProject, putFile, putProject, moveFile, dropFile, docFile, docProject, setText, sharedPath, watchDoc, FILE_MAX, gatedDocFile, FOLLOW_LIMITS } from '../core/collab-doc.js';
import { shareRoom, followRoom, KIND, PROTOCOL, SUBPROTOCOL, colorOf, COLORS } from '../core/collab-client.js';
import { attachRelay, RELAY_LIMITS } from '../server/collab-relay.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(10); } };

// (its close ends every connection, the relay's WebSockets too: a test that fails leaves its own open, and the
// server's close waited for it with no end, the CI's part timed out, #3614; test/server-close.js)
let tmp, srv, base, closeSrv;
before(async () => {
  tmp = await scratchEnv('silinx-collab-');
  const { createApp } = await import('../server/server.js');
  const app = await createApp({ host: '127.0.0.1', token: 'the-token' });
  srv = app.listen(0, '127.0.0.1');
  closeSrv = closable(srv);
  await new Promise(r => srv.once('listening', r));
  base = `http://127.0.0.1:${srv.address().port}/`;
});
after(async () => { await closeSrv(); const fs = await import('node:fs'); fs.rmSync(tmp, { recursive: true, force: true }); });

const PROJECT = { name: 'traffic', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], device: { part: 'xc3s250e' } };
const FILES = { 'src/top.vhd': 'entity top is end;\n', 'src/top.ucf': 'NET "clk" LOC = "B8";\n' };
const owned = () => { const doc = projectDoc(); publishProject(doc, { project: { ...PROJECT, fileTree: Object.keys(FILES) }, files: FILES, owner: 'Ana' }); return doc; };
const url = () => relayUrl(base, 'share'), furl = () => relayUrl(base, 'follow');

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
  assert.deepEqual(parseFollowLink(l), { base: 'http://localhost:8642/', room, key, via: 'relay', sign: null });
  assert.deepEqual(parseFollowLink(`#follow=${room}.${key}`), { base: null, room, key, via: 'relay', sign: null });
  // (a room the owner's page hosts, #3227)
  const hl = followLink('https://silinx.example.org/app/', room, key, 'host');
  assert.equal(hl, `https://silinx.example.org/app/#follow=${room}.${key}.host`);
  assert.deepEqual(parseFollowLink(hl), { base: 'https://silinx.example.org/app/', room, key, via: 'host', sign: null });
  assert.throws(() => followLink('http://x/', room, key, 'peer'), /through a relay or its host/);
  assert.throws(() => parseFollowLink(`#follow=${room}.${key}.peer`), /broken/);
  assert.equal(parseFollowLink('http://x/#design=abc'), null);
  assert.equal(parseFollowLink('http://x/'), null);
  assert.throws(() => parseFollowLink('http://x/#follow=abc'), /the link to follow is broken/);
  assert.throws(() => parseFollowLink(`#follow=${room}.${key}&view=try`), /broken/);
  assert.throws(() => followLink('http://x/', 'bad', key), /not a room/);
  assert.equal(relayUrl('https://silinx.example.org/app/?q#h', 'share'), 'wss://silinx.example.org/api/collab/share');
  assert.equal(relayUrl('http://127.0.0.1:8642/', 'follow'), 'ws://127.0.0.1:8642/api/collab/follow');
  assert.throws(() => relayUrl('http://127.0.0.1:8642/'), /a role, share or follow/);
  assert.match('x'.repeat(22), ROOM_RE);
});
test('#3631 a module\'s link (Share Module…): &top=<module> last, of every form; parsed; one only; a bad name refused', () => {
  const room = 'A'.repeat(22), key = 'b'.repeat(43), sign = 'c'.repeat(129);
  const l = followLink('http://localhost:8642/', room, key);
  assert.equal(withTop(l, 'speed_ctrl'), `${l}&top=speed_ctrl`);
  assert.deepEqual(parseFollowLink(withTop(l, 'speed_ctrl')), { base: 'http://localhost:8642/', room, key, via: 'relay', sign: null, top: 'speed_ctrl' });
  assert.equal(withTop(withTop(l, 'a'), 'b'), `${l}&top=b`, 'one module: the last given');
  // (a hosted room's, a relay's, an editor's link: the module after the rest)
  const hosted = followLink('https://s.example/', room, key, 'host');
  assert.equal(parseFollowLink(withTop(hosted, 'top')).top, 'top');
  assert.equal(parseFollowLink(withTop(hosted, 'top')).via, 'host');
  const relayed = followLink('https://s.example/', room, key, 'relay', null, 'https://relay.example.org');
  assert.deepEqual(parseFollowLink(withTop(relayed, 'm1')), { ...parseFollowLink(relayed), top: 'm1' });
  assert.deepEqual(parseFollowLink(withTop(followLink('https://s.example/', room, key, 'relay', sign), 'm1')), { base: 'https://s.example/', room, key, via: 'relay', sign, top: 'm1' });
  // (no module: none in the parsed link)
  assert.equal('top' in parseFollowLink(l), false);
  // refused: not a module name, not a link to follow; a broken top in a link
  for (const bad of ['', 'a b', '1abc', 'x'.repeat(129), 'a&top=b', null]) assert.throws(() => withTop(l, bad), /is not a module name/, String(bad));
  assert.throws(() => withTop('http://x/#design=abc', 'm1'), /not a link to follow/);
  for (const bad of [`#follow=${room}.${key}&top=`, `#follow=${room}.${key}&top=a%20b`, `#follow=${room}.${key}&top=a&top=b`, `#follow=${room}.${key}&top=m1&relay=https%3A%2F%2Fr.example`]) assert.throws(() => parseFollowLink(bad), /broken/, bad);
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
  const fol = await followRoom({ url: relayUrl(l.base, 'follow'), room: l.room, key: l.key, user: { name: 'Rui' } });
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
  const fol2 = await followRoom({ url: furl(), room: owner.room, key: owner.key, user: { name: 'Eva' } });
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
  const fol = await followRoom({ url: furl(), room: owner.room, key: owner.key, user: { name: 'Rui' }, onEvent: e => { if (e.type === 'error') errors.push(e.message); } });
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

// an awareness update as y-protocols encodes it: [[client, clock, state], …]
const awarenessUpdate = entries => {
  const e = encoding.createEncoder();
  encoding.writeVarUint(e, entries.length);
  for (const [client, clock, state] of entries) { encoding.writeVarUint(e, client); encoding.writeVarUint(e, clock); encoding.writeVarString(e, JSON.stringify(state)); }
  return encoding.toUint8Array(e);
};

test('a follower\'s awareness speaks for that follower only (#3360): the owner\'s state, another\'s, ghosts dropped everywhere', async () => {
  const doc = owned();
  const owner = await shareRoom({ url: url(), token: 'the-token', doc, user: { name: 'Ana' } });
  owner.setView({ path: 'src/top.vhd', line: 3, ch: 0 });
  const fol = await followRoom({ url: furl(), room: owner.room, key: owner.key, user: { name: 'Rui' } });
  const eva = await followRoom({ url: furl(), room: owner.room, key: owner.key, user: { name: 'Eva' } });
  await Promise.all([fol.ready, eva.ready]);
  await until(() => eva.peers().length === 2 && owner.peers().length === 2 && eva.owner()?.view, 'everyone in');
  // Rui, with the room's key, seals an update that names the owner, Eva and a ghost, and his own state
  const forged = { user: { name: 'Mallory' }, role: 'owner', view: { path: 'src/top.ucf', line: 9, ch: 0 } };
  fol.send(KIND.awareness, awarenessUpdate([
    [doc.clientID, 1000, forged], [eva.doc.clientID, 1000, forged], [4242, 1, forged], [fol.doc.clientID, 1000, { user: { name: 'Rui 2' }, role: 'follower', view: null }],
  ]));
  await until(() => eva.peers().some(p => p.name === 'Rui 2') && owner.peers().some(p => p.name === 'Rui 2'), 'Rui\'s own state');
  await sleep(100);
  // the owner is still Ana, where she is; no ghost; Eva's own state and the owner's in her page unchanged
  assert.deepEqual(eva.owner(), { client: doc.clientID, name: 'Ana', color: colorOf(doc.clientID), role: 'owner', view: { path: 'src/top.vhd', line: 3, ch: 0 } });
  assert.deepEqual(eva.peers().map(p => [p.name, p.role]), [['Ana', 'owner'], ['Rui 2', 'follower']]);
  assert.deepEqual(eva.awareness.getLocalState().user, { name: 'Eva' });
  assert.deepEqual(owner.peers().map(p => [p.name, p.role]).sort(), [['Eva', 'follower'], ['Rui 2', 'follower']]);
  assert.deepEqual(owner.awareness.getLocalState(), { user: { name: 'Ana' }, role: 'owner', view: { path: 'src/top.vhd', line: 3, ch: 0 } });
  // (a raw follower joining with the owner's client id: refused)
  const raw = new WebSocket(furl(), [SUBPROTOCOL]);
  const texts = [];
  raw.on('message', (d, bin) => { if (!bin) texts.push(JSON.parse(String(d))); });
  await new Promise(r => raw.on('open', r));
  raw.send(JSON.stringify({ type: 'join', v: PROTOCOL, room: owner.room, client: doc.clientID }));
  await until(() => texts.length, 'the refusal');
  assert.deepEqual(texts, [{ type: 'error', message: 'another participant of this shared project has this client id' }]);
  await owner.close();
});

// a hostile owner's file: written into the document directly (an honest owner's putFile refuses a large one)
const plant = (doc, path, text) => { const yt = new Y.Text(); yt.insert(0, text); doc.getMap('files').set(path, yt); };

test('#3361 a followed room\'s files through the import gate: a web page, a NUL byte, an XML DTD, a file too large not shown, their reason said', async () => {
  const doc = owned();
  plant(doc, 'src/page.vhd', '<!doctype html><script>alert(1)</script>');
  plant(doc, 'src/zero.vhd', 'entity a is\0 end;');
  plant(doc, 'src/nul.vhd', 'entity a is end;');
  plant(doc, 'src/a.sch', '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><x>&e;</x>');
  plant(doc, 'src/big.vhd', `-- ${'x'.repeat(FILE_MAX)}\n`);
  const owner = await shareRoom({ url: url(), token: 'the-token', doc, user: { name: 'Ana' } });
  const fol = await followRoom({ url: furl(), room: owner.room, key: owner.key, user: { name: 'Rui' } });
  await fol.ready;
  const g = p => gatedDocFile(fol.doc, p);
  assert.deepEqual(g('src/top.vhd'), { text: FILES['src/top.vhd'] });
  assert.deepEqual(g('src/page.vhd'), { reason: 'a web page (HTML), not the file its name says' });
  assert.deepEqual(g('src/zero.vhd'), { reason: 'binary content (a NUL byte) in a text file' });
  assert.deepEqual(g('src/nul.vhd'), { reason: 'reserved name (\'nul.vhd\')' });
  assert.deepEqual(g('src/a.sch'), { reason: 'XML with a DTD (<!DOCTYPE>): external entities and entity expansion are not accepted' });
  assert.deepEqual(g('src/big.vhd'), { reason: 'file larger than 1 MB' });
  assert.deepEqual(g('src/none.vhd'), { text: null });
  assert.deepEqual(g('build/top.bit'), { text: null });
  await owner.close();
});

test('#3361 a followed room past its caps (files, total size): left at once, said; ready rejected before it arrives', async () => {
  const limits = { files: 3, total: 4096 };
  // (too many files in the first update: never ready)
  const doc = owned();
  plant(doc, 'src/b.vhd', 'b'); plant(doc, 'src/c.vhd', 'c');
  const owner = await shareRoom({ url: url(), token: 'the-token', doc, user: { name: 'Ana' } });
  const evs = [];
  const fol = await followRoom({ url: furl(), room: owner.room, key: owner.key, user: { name: 'Rui' }, limits, onEvent: e => evs.push(e) });
  await assert.rejects(fol.ready, { message: 'the shared project has more files than a follower takes (4, at most 3)' });
  await until(() => fol.closed(), 'left');
  // (said once; before it arrived, the page's console says it from ready's rejection)
  assert.deepEqual(evs.filter(e => e.type === 'error'), [{ type: 'error', message: 'the shared project has more files than a follower takes (4, at most 3)', fatal: true }]);
  // (the total past its cap after it arrived: left, nothing more applied)
  const fol2 = await followRoom({ url: furl(), room: owner.room, key: owner.key, user: { name: 'Eva' }, limits: { files: 10, total: 4096 }, onEvent: e => evs.push(e) });
  await fol2.ready;
  evs.length = 0;
  putFile(doc, 'src/top.vhd', 'x'.repeat(5000));
  // (the event of its end, which comes once the connection has closed: closed() is true from its closing, #3614)
  await until(() => evs.some(e => e.type === 'closed'), 'Eva left');
  assert.deepEqual(evs.filter(e => e.type !== 'peers'), [
    { type: 'error', message: 'the shared project is larger than a follower takes (5 KB, at most 4 KB)', fatal: true },
    { type: 'closed', reason: 'the shared project is larger than a follower takes (5 KB, at most 4 KB)' },
  ]);
  putFile(doc, 'src/top.vhd', 'y');
  await sleep(100);
  assert.equal(docFile(fol2.doc, 'src/top.vhd').length, 5000);
  // (the default caps: the gate's file count, 64 MB, the drawings' objects, #3183)
  assert.deepEqual(FOLLOW_LIMITS, { files: 5000, total: 64 << 20, objects: 100_000 });
  await owner.close();
});

test('#3527 regression: a followed room\'s whole document bounded: a root of no shared project\'s, values that are no text, left at once, said', async () => {
  const limits = { files: 10, total: 4096 };
  const evs = [];
  const errs = () => evs.filter(e => e.type === 'error');
  // (another root in the document: never ready)
  const doc = owned();
  doc.getMap('evil').set('k', 'v');
  const owner = await shareRoom({ url: url(), token: 'the-token', doc, user: { name: 'Ana' } });
  const fol = await followRoom({ url: furl(), room: owner.room, key: owner.key, user: { name: 'Rui' }, limits, onEvent: e => evs.push(e) });
  // (bounded: the old code's follower stayed, its ready never settled)
  await assert.rejects(Promise.race([fol.ready.then(() => { throw new Error('followed'); }), sleep(5000).then(() => { throw new Error('not left'); })]), { message: 'the shared project holds a part that no shared project has ("evil")' });
  await until(() => fol.closed(), 'left');
  assert.deepEqual(errs(), [{ type: 'error', message: 'the shared project holds a part that no shared project has ("evil")', fatal: true }]);
  await owner.close();
  // (values that are no text, in the parts a shared project has: their bytes counted, past the total left; nothing more applied)
  const doc2 = owned();
  const owner2 = await shareRoom({ url: url(), token: 'the-token', doc: doc2, user: { name: 'Ana' } });
  for (const put of [d => d.getMap('meta').set('junk', 'x'.repeat(5000)), d => d.getMap('files').set('src/a.vhd', 'x'.repeat(5000)), d => d.getMap('project').set('more', new Y.Map([['k', 'x'.repeat(5000)]]))]) {
    evs.length = 0;
    const f2 = await followRoom({ url: furl(), room: owner2.room, key: owner2.key, user: { name: 'Eva' }, limits, onEvent: e => evs.push(e) });
    await f2.ready;
    put(doc2);
    await until(() => evs.some(e => e.type === 'closed'), 'Eva left');   // (its end's event, #3614)
    const why = `the shared project is larger than a follower takes (${Math.ceil(Y.encodeStateAsUpdate(f2.doc).length / 1024)} KB, at most 4 KB)`;
    assert.ok(Y.encodeStateAsUpdate(f2.doc).length > 4096);
    assert.deepEqual(evs.filter(e => e.type !== 'peers'), [{ type: 'error', message: why, fatal: true }, { type: 'closed', reason: why }]);
    doc2.transact(() => { for (const n of ['meta', 'files', 'project']) for (const k of [...doc2.getMap(n).keys()]) if (['junk', 'src/a.vhd', 'more'].includes(k)) doc2.getMap(n).delete(k); });
  }
  // (under the total: followed, no error)
  evs.length = 0;
  const f3 = await followRoom({ url: furl(), room: owner2.room, key: owner2.key, user: { name: 'Bo' }, limits, onEvent: e => evs.push(e) });
  await f3.ready;
  doc2.getMap('meta').set('junk', 'x'.repeat(1000));
  await until(() => f3.doc.getMap('meta').get('junk'), 'the value arrived');
  assert.deepEqual(errs(), []);
  assert.equal(f3.closed(), false);
  await owner2.close();
});

test('a wrong key, an unknown room, a room no longer shared: refused, said', async () => {
  const owner = await shareRoom({ url: url(), token: 'the-token', doc: owned(), user: { name: 'Ana' } });
  const errors = [];
  const bad = await followRoom({ url: furl(), room: owner.room, key: (await newKey()).text, user: { name: 'Eve' }, onEvent: e => { if (e.type === 'error') errors.push(e.message); } });
  await assert.rejects(bad.ready, /the link's key does not open/);
  assert.deepEqual(errors, ['a message that the link\'s key does not open']);
  assert.deepEqual(docProject(bad.doc).fileTree, []);
  await bad.close();
  await assert.rejects(followRoom({ url: furl(), room: 'Z'.repeat(22), key: owner.key, user: { name: 'Rui' } }), /no longer shared/);
  const room = owner.room;
  await owner.close();
  await sleep(50);
  await assert.rejects(followRoom({ url: furl(), room, key: owner.key, user: { name: 'Rui' } }), /no longer shared/);
});

test('the server: opening a room needs its token, at the upgrade; the host, the origin and the path checked as the API\'s', async () => {
  await assert.rejects(shareRoom({ url: url(), token: 'wrong', doc: owned(), user: { name: 'x' } }), /sharing a project needs this Silinx server's token/);
  await assert.rejects(shareRoom({ url: url(), token: null, doc: owned(), user: { name: 'x' } }), /needs this Silinx server's token/);
  const upgrade = (path, headers = {}, protocols = [SUBPROTOCOL]) => new Promise(resolve => {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.address().port}${path}`, protocols, { headers });
    ws.on('open', () => { ws.close(); resolve('open'); });
    ws.on('unexpected-response', (_, res) => resolve(res.statusCode));
    ws.on('error', () => resolve('error'));
  });
  assert.equal(await upgrade('/api/collab/follow'), 'open');
  assert.equal(await upgrade('/api/collab/share', {}, [SUBPROTOCOL, 'token.the-token']), 'open');
  assert.equal(await upgrade('/api/collab/follow', { Origin: base.replace(/\/$/, '') }), 'open');
  for (const p of ['/api/collab/follow', '/api/collab/share']) {
    assert.equal(await upgrade(p, { Origin: 'https://evil.example' }), 403);
    assert.equal(await upgrade(p, { Host: 'evil.example' }), 403);
  }
  // (the token not in the open message: a socket without it, or with another, refused at once, never an owner's)
  const refused = async (protocols) => {
    const ws = new WebSocket(url(), protocols);
    const got = [];
    ws.on('message', d => got.push(JSON.parse(String(d))));
    const code = await new Promise(r => ws.on('close', c => r(c)));
    return [code, got];
  };
  const NO_TOKEN = [1008, [{ type: 'error', message: 'sharing a project needs this Silinx server\'s token' }]];
  assert.deepEqual(await refused([SUBPROTOCOL]), NO_TOKEN);
  assert.deepEqual(await refused([SUBPROTOCOL, 'token.wrong']), NO_TOKEN);
  assert.equal(await upgrade('/api/collab'), 404);
  assert.equal(await upgrade('/api/other'), 404);
  assert.equal(await upgrade('/api/projects'), 404);
});

test('#3529 a follower\'s join: the whole document to that follower only; one already in gets nothing of it while others join and leave', async () => {
  const doc = owned();
  const owner = await shareRoom({ url: url(), token: 'the-token', doc, user: { name: 'Ana' } });
  const fol = await followRoom({ url: furl(), room: owner.room, key: owner.key, user: { name: 'Eva' } });
  await fol.ready;
  // (a raw follower already in: what reaches it counted, by kind)
  const raw = new WebSocket(furl(), [SUBPROTOCOL]);
  const frames = [];
  raw.on('message', (d, bin) => { if (bin) frames.push(Buffer.from(d)); });
  await new Promise(r => raw.on('open', r));
  raw.send(JSON.stringify({ type: 'join', v: PROTOCOL, room: owner.room, client: 7 }));
  await until(() => frames.length >= 2, 'its own snapshot and the awareness');
  await sleep(100);
  assert.deepEqual(frames.map(f => f[0]), [KIND.update, KIND.awareness]);
  frames.length = 0;
  // (five joins and leaves: each joiner has the project; the one in gets their awareness only, never a snapshot)
  for (let k = 0; k < 5; k++) {
    const other = await followRoom({ url: furl(), room: owner.room, key: owner.key, user: { name: `Rui ${k}` } });
    await other.ready;
    assert.equal(docFile(other.doc, 'src/top.vhd'), FILES['src/top.vhd']);
    await other.close();
  }
  await sleep(150);
  assert.equal(frames.filter(f => f[0] === KIND.update).length, 0);
  assert.ok(frames.every(f => f[0] === KIND.from), frames.map(f => f[0]).join());
  // (an owner's change still reaches every follower)
  putFile(doc, 'src/top.vhd', 'entity top is end; -- 2\n');
  await until(() => docFile(fol.doc, 'src/top.vhd') === 'entity top is end; -- 2\n', 'the change');
  await until(() => frames.some(f => f[0] === KIND.update), 'the change, to the raw follower too');
  raw.close();
  await fol.close();
  await owner.close();
});

test('the relay reads nothing: a participant without the key gets only sealed frames, never a file\'s text; a stranger\'s first message refused', async () => {
  const owner = await shareRoom({ url: url(), token: 'the-token', doc: owned(), user: { name: 'Ana' } });
  const raw = new WebSocket(furl(), [SUBPROTOCOL]);
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
  // (no hello, an old protocol, a binary first, a room opened at the follow endpoint: closed with the reason)
  for (const first of [JSON.stringify({ type: 'join', v: 0, room: 'x', client: 1 }), JSON.stringify({ type: 'hello', v: PROTOCOL, client: 1 }), Buffer.from([1, 2, 3]), JSON.stringify({ type: 'open', v: PROTOCOL, client: 1 })]) {
    const ws = new WebSocket(furl(), [SUBPROTOCOL]);
    const got = [];
    ws.on('message', d => got.push(JSON.parse(String(d))));
    await new Promise(r => ws.on('open', r));
    ws.send(first);
    await new Promise(r => ws.on('close', r));
    assert.deepEqual(got, [{ type: 'error', message: 'not a Silinx participant of this version' }]);
  }
});

test('the relay\'s limits: followers per room, rooms, a follower\'s frame size (its connection closed, the room and the others kept); a room ends with its owner\'s connection', async () => {
  const s = http.createServer();
  const relay = attachRelay(s, { limits: { ...RELAY_LIMITS, followers: 2, rooms: 1, followerFrame: 100 } });
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const at = role => `ws://127.0.0.1:${s.address().port}/api/collab/${role}`;
  const owner = await shareRoom({ url: at('share'), doc: owned(), user: { name: 'Ana' } });
  await assert.rejects(shareRoom({ url: at('share'), doc: owned(), user: { name: 'Bo' } }), /shares 1 projects already/);
  const errors = [];
  const fol = await followRoom({ url: at('follow'), room: owner.room, key: owner.key, user: { name: 'Rui' }, onEvent: e => { if (e.type === 'error') errors.push(e.message); } });
  await fol.ready;
  // a second follower whose frame is larger than a follower's maximum: closed by the relay (1009), as soon as its
  // frame's length is read
  const big = new WebSocket(at('follow'), [SUBPROTOCOL]);
  await new Promise(r => big.on('open', r));
  big.send(JSON.stringify({ type: 'join', v: PROTOCOL, room: owner.room, client: 9 }));
  await until(() => relay.rooms.get(owner.room).followers.size === 2, 'the second follower in');
  await assert.rejects(followRoom({ url: at('follow'), room: owner.room, key: owner.key, user: { name: 'Eva' } }), /has 2 followers already/);
  big.send(new Uint8Array(200));
  assert.equal(await new Promise(r => big.on('close', c => r(c))), 1009);
  await until(() => relay.rooms.get(owner.room).followers.size === 1, 'the large one gone');
  // the room, the owner and the other follower kept: an edit still arrives
  owner.doc.getMap('files').get('src/top.vhd').insert(0, '-- kept\n');
  await until(() => docFile(fol.doc, 'src/top.vhd')?.startsWith('-- kept'), 'the edit after it');
  assert.equal(fol.closed(), false);
  assert.deepEqual(errors, []);
  // (the owner's connection lost, not closed by Stop Sharing: the room ends, the follower told)
  [...relay.rooms.values()][0].owner.terminate();
  await until(() => fol.closed(), 'the follower closed');
  assert.equal(relay.rooms.size, 0);
  relay.close();
  await new Promise(r => s.close(r));
  assert.ok(COLORS.includes(colorOf(5)));
});
