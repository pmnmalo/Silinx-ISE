// A follower's and an editor's connection lost and made again (#3835, phase 4 of #3180: core/collab-client.js
// followRoom's reconnect): over the room a page hosts (core/collab-loop.js, sockets in the page, no network), whose
// follower's end the test closes as a network would. The follower rejoins, with the same document and client id: what
// the owner changed meanwhile arrives, who is in comes back on both sides; an editor's changes made offline, and those
// sent into a connection already lost, reach the owner, its deletions too, and nothing else of the document; a follower
// sends nothing; the end with the owner, a room no longer shared, the time given up after, close() while lost, and
// reconnect: false end the session as before, with their reasons.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import * as Y from 'yjs';
import { socketPair, hostedRooms } from '../core/collab-loop.js';
import { shareRoom, followRoom, NOT_SHARED, RECONNECT } from '../core/collab-client.js';
import { projectDoc, publishProject, putFile, docFile, editFile } from '../core/collab-doc.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(5); } };
const PROJECT = { name: 'traffic', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }, { path: 'src/tb.vhd', lang: 'vhdl' }], device: { part: 'xc3s250e' } };
const FILES = { 'src/top.vhd': 'entity top is end;\n', 'src/tb.vhd': '-- the test bench\n' };
const owned = () => { const doc = projectDoc(); publishProject(doc, { project: { ...PROJECT, fileTree: Object.keys(FILES) }, files: FILES, owner: 'Ana' }); return doc; };
const FAST = { delays: [5, 10, 20], for: 2000 };
const live = [];
after(async () => { for (const p of live) await p.close().catch(() => {}); });
const keep = p => { live.push(p); return p; };
// a follower's sockets to the page's room; `ends`: the room's ends of them, the last one the follower's now
const followerSocket = (h, ends) => function FollowerSocket() { const { client, room } = socketPair(); ends.push(h.follower(room)); return client; };

async function setup({ editors = false, reconnect = FAST } = {}) {
  const h = hostedRooms();
  const doc = owned();
  const ownerEv = [];
  const owner = keep(await shareRoom({ url: 'silinx-host:', doc, user: { name: 'Ana' }, editors, WebSocket: h.owner, onEvent: e => ownerEv.push(e) }));
  const ends = [], ev = [];
  const f = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, sign: editors ? owner.editKey : null, user: { name: 'Rui' }, WebSocket: followerSocket(h, ends), onEvent: e => ev.push(e), reconnect }));
  await f.ready;
  await until(() => owner.peers().length === 1 && f.owner(), 'both see each other');
  return { h, doc, owner, ownerEv, f, ends, ev };
}
const types = ev => ev.map(e => e.type).filter(t => t !== 'peers');

test('the reconnection\'s defaults: tries after 1, 2, 4, 8 then every 15 s, for 5 minutes', () => {
  assert.deepEqual(RECONNECT, { delays: [1000, 2000, 4000, 8000, 15_000], for: 300_000 });
  assert.equal(NOT_SHARED, 'this shared project is no longer shared (its owner stopped sharing it)');
});

test('a follower\'s connection lost is made again: the owner\'s changes meanwhile arrive, who is in comes back on both sides', async () => {
  const { h, doc, owner, ownerEv, f, ends, ev } = await setup();
  const id = f.doc.clientID;
  ends.at(-1).close();   // (the network's end)
  await until(() => types(ev).includes('offline'), 'offline');
  assert.equal(f.connected(), false);
  assert.equal(f.closed(), false);
  assert.deepEqual(f.peers(), []);   // (no one while lost)
  putFile(doc, 'src/top.vhd', 'entity top is port (a : in bit); end;\n');   // (meanwhile, at the owner's)
  await until(() => f.connected(), 'online again');
  assert.equal(ends.length, 2);
  await until(() => docFile(f.doc, 'src/top.vhd') === 'entity top is port (a : in bit); end;\n', 'the change made meanwhile');
  assert.equal(f.doc.clientID, id);   // (the same participant)
  await until(() => f.owner()?.name === 'Ana' && owner.peers().map(p => p.name).join() === 'Rui', 'who is in, both sides');
  assert.equal(h.rooms.values().next().value.followers.size, 1);
  assert.deepEqual(types(ev), ['offline', 'online']);
  assert.deepEqual(ev.find(e => e.type === 'offline'), { type: 'offline', reason: 'the connection to the relay was lost' });
  assert.deepEqual(types(ownerEv), []);   // (no error at the owner's)
  // (and the later changes too)
  putFile(doc, 'src/tb.vhd', '-- later\n');
  await until(() => docFile(f.doc, 'src/tb.vhd') === '-- later\n', 'a later change');
});

test('an editor\'s changes made while lost reach the owner once it is back, a deletion too, and the owner\'s meanwhile reach it', async () => {
  const { doc, owner, ownerEv, f, ends, ev } = await setup({ editors: true });
  editFile(f.doc, 'src/tb.vhd', '-- the test bench\n-- one\n');   // (connected: arrives)
  await until(() => docFile(doc, 'src/tb.vhd') === '-- the test bench\n-- one\n', 'the first edit');
  ends.at(-1).close();
  await until(() => types(ev).includes('offline'), 'offline');
  editFile(f.doc, 'src/tb.vhd', '-- the test bench\n-- one\n-- two, offline\n');
  editFile(f.doc, 'src/top.vhd', 'entity top is\n');   // (a deletion only)
  putFile(doc, 'src/tb.vhd', '-- by Ana\n-- the test bench\n-- one\n');   // (the owner's meanwhile)
  await until(() => f.connected(), 'online again');
  const both = '-- by Ana\n-- the test bench\n-- one\n-- two, offline\n';
  await until(() => docFile(doc, 'src/tb.vhd') === both && docFile(f.doc, 'src/tb.vhd') === both, 'merged on both sides');
  await until(() => docFile(doc, 'src/top.vhd') === 'entity top is\n', 'the deletion');
  assert.deepEqual(Y.encodeStateVector(doc), Y.encodeStateVector(f.doc));
  assert.equal(owner.doc.getMap('files').get('src/top.vhd').toString(), f.doc.getMap('files').get('src/top.vhd').toString());
  assert.deepEqual(types(ownerEv), []);   // (nothing refused: the editor's own changes only, in the files)
});

test('an editor\'s changes sent into a connection already lost (no close yet) are not lost: sent again at the rejoin', async () => {
  const { doc, ownerEv, f, ends, ev } = await setup({ editors: true });
  const end = ends.at(-1);
  end.onmessage = () => {};   // (the network gone: what the editor sends, lost)
  editFile(f.doc, 'src/tb.vhd', '-- the test bench\n-- lost on the way\n');
  await sleep(30);
  assert.equal(docFile(doc, 'src/tb.vhd'), FILES['src/tb.vhd']);
  end.close();   // (its loss found out)
  await until(() => types(ev).includes('online'), 'online again');
  await until(() => docFile(doc, 'src/tb.vhd') === '-- the test bench\n-- lost on the way\n', 'the edit, sent again');
  assert.deepEqual(types(ownerEv), []);
});

test('a follower sends nothing at a rejoin: the owner refuses nothing, its document unchanged', async () => {
  const { doc, ownerEv, f, ends } = await setup();
  const before = Y.encodeStateVector(doc);
  ends.at(-1).close();
  await until(() => !f.connected(), 'offline');
  await until(() => f.connected(), 'online again');
  await sleep(30);
  assert.deepEqual(Y.encodeStateVector(doc), before);
  assert.deepEqual(types(ownerEv), []);
});

test('the owner stops sharing: the follower\'s session ends, with no try to join again', async () => {
  const { owner, f, ends, ev } = await setup();
  await owner.close();
  await until(() => f.closed(), 'closed');
  await sleep(50);
  assert.equal(ends.length, 1);
  assert.deepEqual(types(ev), ['closed']);
  assert.equal(ev.at(-1).reason, 'the owner stopped sharing');
  assert.equal(f.connected(), false);
});

test('a room its owner stopped sharing while the follower was lost: the rejoin refused, the session ended', async () => {
  const { h, owner, f, ends, ev } = await setup({ reconnect: { delays: [80], for: 2000 } });
  ends.at(-1).close();
  await until(() => types(ev).includes('offline'), 'offline');
  h.closeRoom(owner.room, 'the owner stopped sharing');
  await until(() => f.closed(), 'closed');
  assert.deepEqual(types(ev), ['offline', 'closed']);
  assert.equal(ev.at(-1).reason, NOT_SHARED);
  await f.ready;   // (it had arrived: still resolved)
});

test('given up after `for`: the session ends, said; no more tries', async () => {
  const { f, ends, ev } = await setup({ reconnect: { delays: [10], for: 60 } });
  // (every new socket the room's: closed at once, as a network that does not come back)
  const n = ends.length;
  ends.at(-1).close();
  const t = setInterval(() => { for (const e of ends.slice(n)) e.close(); }, 1);
  try { await until(() => f.closed(), 'given up'); } finally { clearInterval(t); }
  assert.equal(ev.at(-1).reason, 'the connection was lost and could not be made again in 0 minutes');
  const tries = ends.length;
  await sleep(50);
  assert.equal(ends.length, tries);
});

test('close() while lost: ended at once, no more tries; reconnect: false ends at the loss, as before', async () => {
  const a = await setup({ reconnect: { delays: [100], for: 2000 } });
  a.ends.at(-1).close();
  await until(() => types(a.ev).includes('offline'), 'offline');
  await a.f.close();
  assert.equal(a.f.closed(), true);
  assert.deepEqual(types(a.ev), ['offline', 'closed']);
  await sleep(150);
  assert.equal(a.ends.length, 1);

  const b = await setup({ reconnect: false });
  b.ends.at(-1).close();
  await until(() => b.f.closed(), 'closed');
  assert.deepEqual(types(b.ev), ['closed']);
  assert.equal(b.ev.at(-1).reason, 'the connection to the relay ended');
  await sleep(50);
  assert.equal(b.ends.length, 1);
});

test('a transport that gives no socket (a room reached by codes): the session ends at the loss, said', async () => {
  const h = hostedRooms();
  const doc = owned();
  const owner = keep(await shareRoom({ url: 'silinx-host:', doc, user: { name: 'Ana' }, WebSocket: h.owner }));
  const ends = [], ev = [];
  const f = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, user: { name: 'Rui' }, WebSocket: followerSocket(h, ends), onEvent: e => ev.push(e), reconnect: FAST, transport: async () => null }));
  await f.ready;
  ends.at(-1).close();
  await until(() => f.closed(), 'closed');
  assert.deepEqual(types(ev), ['offline', 'closed']);
  assert.equal(ev.at(-1).reason, 'the connection was lost and cannot be made again from here');
});

test('#3835 a transport that fails (the owner not found at the meeting point yet): tried again later, then joined', async () => {
  const h = hostedRooms();
  const doc = owned();
  const owner = keep(await shareRoom({ url: 'silinx-host:', doc, user: { name: 'Ana' }, WebSocket: h.owner }));
  const ends = [], ev = [];
  let tries = 0;
  const transport = async () => { if (++tries < 3) throw new Error('the owner was not found at the meeting point'); return followerSocket(h, ends); };
  const f = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, user: { name: 'Rui' }, WebSocket: followerSocket(h, ends), onEvent: e => ev.push(e), reconnect: FAST, transport }));
  await f.ready;
  ends.at(-1).close();
  await until(() => types(ev).includes('offline'), 'offline');
  await until(() => f.connected(), 'online again');
  assert.equal(tries, 3);
  assert.equal(ends.length, 2);
  assert.deepEqual(types(ev), ['offline', 'online']);
  // (and one that keeps failing: given up after `for`, as any)
  const g = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, user: { name: 'Eva' }, WebSocket: followerSocket(h, ends), onEvent: e => ev.push(e), reconnect: { delays: [5], for: 60 }, transport: async () => { throw new Error('not found'); } }));
  await g.ready;
  ends.at(-1).close();
  await until(() => g.closed(), 'given up');
  assert.equal(ev.at(-1).reason, 'the connection was lost and could not be made again in 0 minutes');
});

test('a connection lost before the project arrived is not made again: the join fails as before', async () => {
  const h = hostedRooms();
  const doc = owned();
  const owner = keep(await shareRoom({ url: 'silinx-host:', doc, user: { name: 'Ana' }, WebSocket: h.owner }));
  const ends = [], ev = [];
  // (the room's end closed as soon as the join is answered, before the document)
  const S = function CutSocket() { const { client, room } = socketPair(); const end = h.follower(room); const m = end.onmessage; end.onmessage = (d, b) => { m(d, b); setTimeout(() => end.close(), 0); }; ends.push(end); return client; };
  const f = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, user: { name: 'Rui' }, WebSocket: S, onEvent: e => ev.push(e), reconnect: FAST }));
  await assert.rejects(f.ready);
  await until(() => f.closed(), 'closed');
  assert.deepEqual(types(ev), ['closed']);
  assert.equal(ends.length, 1);
});

test('a connection the room ends itself (a refusal, 1008; a frame too large, 1009) is not made again', async () => {
  for (const code of [1008, 1009]) {
    const { f, ends, ev } = await setup();
    ends.at(-1).close(code, 'refused');
    await until(() => f.closed(), `closed (${code})`);
    assert.deepEqual(types(ev), ['closed']);
    await sleep(30);
    assert.equal(ends.length, 1);
  }
});
