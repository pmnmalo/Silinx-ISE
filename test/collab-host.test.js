// A shared project hosted by the owner's page (#3227, the browser edition): its room in the page (core/collab-loop.js
// hostedRooms over core/collab-room.js), the owner's participant through a pair of sockets in the page, each follower
// through a socket of their own (a data channel in the page: here a socket pair, no network). The participants are
// the relay's (core/collab-client.js), unchanged: the project arrives, an edit arrives, the presence both ways, a
// follower's edit refused, a follower's frame too large closing their socket, the end with the owner. And the codes
// exchanged by hand to connect (core/collab-codes.js): sealed, of their kind and their project only, their size capped.
import { test, after } from 'node:test';
import * as Y from 'yjs';
import assert from 'node:assert/strict';
import { socketPair, hostedRooms, HOST_LIMITS } from '../core/collab-loop.js';
import { sealCode, openCode, CODE_KINDS, CODE_MAX, SDP_MAX } from '../core/collab-codes.js';
import { shareRoom, followRoom, KIND } from '../core/collab-client.js';
import { newKey, keyOf, seal, b64url } from '../core/collab-crypto.js';
import { projectDoc, publishProject, putFile, docFile, docProject } from '../core/collab-doc.js';
import { ROOM_RE } from '../core/collab-link.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(5); } };
const PROJECT = { name: 'traffic', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], device: { part: 'xc3s250e' } };
const FILES = { 'src/top.vhd': 'entity top is end;\n' };
const owned = () => { const doc = projectDoc(); publishProject(doc, { project: { ...PROJECT, fileTree: Object.keys(FILES) }, files: FILES, owner: 'Ana' }); return doc; };
// a follower's socket to the page's room (`ends`: the room's ends, as the test sees them)
// (every participant closed at the end, a failed test's too: their awareness's timers would keep the run alive)
const live = [];
after(async () => { for (const p of live) await p.close().catch(() => {}); });
const keep = p => { live.push(p); return p; };
const followerSocket = (h, ends = []) => function FollowerSocket() { const { client, room } = socketPair(); ends.push(h.follower(room)); return client; };

test('a socket pair: open, both ways, text and bytes (copies), closed once on both sides', async () => {
  const { client, room } = socketPair();
  const got = [], ev = [];
  room.onmessage = (d, bin) => got.push([bin, typeof d === 'string' ? d : [...d]]);
  room.onclose = () => ev.push('room closed');
  client.addEventListener('open', () => ev.push('open'));
  client.addEventListener('message', e => got.push(['client', typeof e.data === 'string' ? e.data : [...new Uint8Array(e.data)]]));
  client.addEventListener('close', e => ev.push(`close ${e.code}`));
  assert.equal(client.readyState, 0);
  assert.throws(() => client.send('x'), /not open/);
  await until(() => client.readyState === 1, 'open');
  const bytes = Uint8Array.from([1, 2, 3]);
  client.send('hi'); client.send(bytes); bytes[0] = 9;
  room.send('back'); room.send(Uint8Array.from([4]), { binary: true });
  await until(() => got.length === 4, 'four messages');
  assert.deepEqual(got, [[false, 'hi'], [true, [1, 2, 3]], ['client', 'back'], ['client', [4]]]);
  room.close(1009, 'too large'); client.close();
  await until(() => ev.length === 3, 'closed');
  assert.deepEqual(ev, ['open', 'room closed', 'close 1009']);
  assert.equal(room.readyState, 3);
  room.send('after');   // (nothing: closed)
  await sleep(10);
  assert.equal(got.length, 4);
});

test('the owner\'s page hosts the room: the project arrives at two followers, an edit arrives, the presence both ways, the end with the owner', async () => {
  const h = hostedRooms();
  const doc = owned();
  const owner = keep(await shareRoom({ url: 'silinx-host:', doc, user: { name: 'Ana' }, WebSocket: h.owner }));
  assert.match(owner.room, ROOM_RE);
  assert.equal(h.rooms.size, 1);
  owner.setView({ path: 'src/top.vhd', line: 0, ch: 3 });
  const fol = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, user: { name: 'Rui' }, WebSocket: followerSocket(h) }));
  await fol.ready;
  assert.deepEqual(docProject(fol.doc), { version: 1, owner: 'Ana', project: PROJECT, fileTree: ['src/top.vhd'] });
  putFile(doc, 'src/top.vhd', 'entity top is end entity;\n');
  await until(() => docFile(fol.doc, 'src/top.vhd') === 'entity top is end entity;\n', 'the edit');
  const o = await until(() => fol.owner()?.view && fol.owner(), 'the owner\'s view');
  assert.deepEqual([o.name, o.role, o.view], ['Ana', 'owner', { path: 'src/top.vhd', line: 0, ch: 3 }]);
  const fol2 = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, user: { name: 'Eva' }, WebSocket: followerSocket(h) }));
  await fol2.ready;
  await until(() => owner.peers().length === 2 && fol2.peers().length === 2, 'all in');
  assert.deepEqual(owner.peers().map(p => [p.name, p.role]).sort(), [['Eva', 'follower'], ['Rui', 'follower']]);
  assert.equal(docFile(fol2.doc, 'src/top.vhd'), 'entity top is end entity;\n');
  // one room only: the page's project
  await assert.rejects(shareRoom({ url: 'silinx-host:', doc: owned(), user: { name: 'Bo' }, WebSocket: h.owner }), /shares 1 projects already/);
  await owner.close();
  await until(() => fol.closed() && fol2.closed(), 'the followers closed');
  assert.equal(h.rooms.size, 0);
});

test('read only in the page\'s room: a follower\'s edit refused, never at the owner\'s; a frame larger than a follower\'s maximum closes their socket, the others kept', async () => {
  const h = hostedRooms({ limits: { ...HOST_LIMITS, followerFrame: 100 } });
  const doc = owned();
  const owner = keep(await shareRoom({ url: 'silinx-host:', doc, user: { name: 'Ana' }, WebSocket: h.owner }));
  const errors = [];
  const fol = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, user: { name: 'Rui' }, WebSocket: followerSocket(h), onEvent: e => { if (e.type === 'error') errors.push(e.message); } }));
  await fol.ready;
  // (an edit forged by the follower's page: its client never sends one)
  const other = new Y.Doc();
  Y.applyUpdate(other, Y.encodeStateAsUpdate(fol.doc));
  const sv = Y.encodeStateVector(other);
  other.getMap('files').get('src/top.vhd').insert(0, '-- mine\n');
  await fol.send(KIND.update, Y.encodeStateAsUpdate(other, sv));
  await until(() => errors.length, 'the edit refused');
  assert.deepEqual(errors, ['read only: a follower cannot change the shared project']);
  await sleep(20);
  assert.equal(docFile(doc, 'src/top.vhd'), FILES['src/top.vhd']);
  // a second follower whose frame is too large: closed (1009), the room, the owner and the first follower kept
  const ends = [];
  const big = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, user: { name: 'Eva' }, WebSocket: followerSocket(h, ends) }));
  await big.ready;
  await big.send(KIND.awareness, new Uint8Array(300));
  await until(() => big.closed(), 'the large one closed');
  assert.equal(ends[0].readyState, 3);
  await until(() => h.rooms.get(owner.room).followers.size === 1, 'one follower left');
  putFile(doc, 'src/top.vhd', 'entity top is end top;\n');
  await until(() => docFile(fol.doc, 'src/top.vhd') === 'entity top is end top;\n', 'the edit after it');
  assert.equal(fol.closed(), false);
  await owner.close();
});

test('the codes exchanged by hand: sealed, opened by their project\'s key and kind only, their size capped', async () => {
  const { key, text } = await newKey();
  const room = 'R'.repeat(22);
  const sdp = `v=0\r\no=- 46117 2 IN IP4 127.0.0.1\r\ns=-\r\n${'a=candidate:1 1 udp 2122260223 192.0.2.20 54321 typ host\r\n'.repeat(4)}`;
  const offer = await sealCode(key, room, 'offer', sdp);
  assert.match(offer, /^S1\.[A-Za-z0-9_-]+$/);
  assert.ok(!offer.includes('192.0.2') && offer.length < sdp.length + 100, 'sealed, compressed');
  assert.equal(await openCode(await keyOf(text), room, 'offer', `  ${offer.slice(0, 40)}\n${offer.slice(40)} `), sdp);   // (spaces and line breaks of a paste)
  await assert.rejects(openCode(key, room, 'answer', offer), /^Error: not the owner's code: a follower's instead$/);
  const answer = await sealCode(key, room, 'answer', 'v=0\r\n');
  await assert.rejects(openCode(key, room, 'offer', answer), /^Error: not a follower's code: the owner's instead$/);
  await assert.rejects(openCode((await newKey()).key, room, 'offer', offer), /^Error: a follower's code is not of this shared project \(or not whole\)$/);
  await assert.rejects(openCode(key, 'S'.repeat(22), 'offer', offer), /not of this shared project/);
  await assert.rejects(openCode(key, room, 'offer', offer.slice(0, -4)), /not of this shared project \(or not whole\)/);
  for (const bad of ['', 'hello', 'S1.', 'S1.abc+/=', null]) await assert.rejects(openCode(key, room, 'offer', bad), /^Error: not a follower's code \(copy it again, whole\)$/);
  await assert.rejects(openCode(key, room, 'offer', `S1.${'A'.repeat(CODE_MAX)}`), /^Error: a follower's code too long$/);
  await assert.rejects(sealCode(key, room, 'frame', sdp), /an offer or an answer/);
  // a code whose description inflates past its maximum (sealed with the right key: a follower's own): refused
  const bomb = new Uint8Array(await new Response(new Blob([new Uint8Array(SDP_MAX + 1)]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  await assert.rejects(openCode(key, room, 'offer', `S1.${b64url(await seal(key, room, CODE_KINDS.offer, bomb))}`), /^Error: a follower's code is broken$/);
  // (a description that is not text: broken too)
  const notText = new Uint8Array(await new Response(new Blob([Uint8Array.from([0xff, 0xfe, 0xfd])]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
  await assert.rejects(openCode(key, room, 'offer', `S1.${b64url(await seal(key, room, CODE_KINDS.offer, notText))}`), /is broken/);
});
