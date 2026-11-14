// The owner's connection lost and its room resumed (#3835, phase 4c of #3180: core/collab-client.js shareRoom's
// reconnect, core/collab-room.js's grace and resume): over the room a page hosts (core/collab-loop.js, sockets in the
// page, no network), given a grace as the relay's, whose owner's socket the test closes as a network would. The room is
// kept, its followers with it, none of them told; the owner resumes it with its secret: what it changed meanwhile
// reaches every follower, an editor's change made meanwhile reaches the owner, who is in comes back on both sides. A
// room the relay no longer keeps (no grace), close() while lost, and reconnect: false end the session, with reasons.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { socketPair, hostedRooms, HOST_LIMITS } from '../core/collab-loop.js';
import { shareRoom, followRoom } from '../core/collab-client.js';
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
const types = ev => ev.map(e => e.type).filter(t => t !== 'peers');
const followerSocket = h => function FollowerSocket() { const { client, room } = socketPair(); h.follower(room); return client; };

// the owner's room (a grace as the relay's, but short), its sockets kept: the last one its connection now
async function setup({ grace = 2000, editors = false, reconnect = FAST } = {}) {
  const h = hostedRooms({ limits: { ...HOST_LIMITS, grace } });
  const socks = [];
  const OwnerSocket = function OwnerSocket(...a) { const s = new h.owner(...a); socks.push(s); return s; };
  const doc = owned();
  const ownerEv = [];
  const owner = keep(await shareRoom({ url: 'silinx-host:', doc, user: { name: 'Ana' }, editors, WebSocket: OwnerSocket, onEvent: e => ownerEv.push(e), reconnect }));
  const ev = [];
  const f = keep(await followRoom({ url: 'silinx-host:', room: owner.room, key: owner.key, sign: editors ? owner.editKey : null, user: { name: 'Rui' }, WebSocket: followerSocket(h), onEvent: e => ev.push(e) }));
  await f.ready;
  await until(() => owner.peers().length === 1 && f.owner(), 'both see each other');
  return { h, socks, doc, owner, ownerEv, f, ev };
}

test('#3835 the owner\'s connection lost: the room resumed, the owner\'s change meanwhile reaches the follower, who is in comes back; the follower never told', async () => {
  const { h, socks, doc, owner, ownerEv, f, ev } = await setup();
  socks.at(-1).close();   // (the network's end)
  await until(() => types(ownerEv).includes('offline'), 'offline');
  assert.equal(owner.connected(), false);
  assert.equal(owner.closed(), false);
  assert.equal(h.rooms.size, 1);   // (kept, its follower with it)
  putFile(doc, 'src/top.vhd', 'entity top is port (a : in bit); end;\n');   // (meanwhile, at the owner's)
  await until(() => owner.connected(), 'resumed');
  assert.equal(socks.length, 2);
  await until(() => docFile(f.doc, 'src/top.vhd') === 'entity top is port (a : in bit); end;\n', 'the change made meanwhile');
  await until(() => owner.peers().map(p => p.name).join() === 'Rui' && f.owner()?.name === 'Ana', 'who is in, both sides');
  assert.deepEqual(types(ownerEv), ['offline', 'online']);
  assert.deepEqual(ownerEv.find(e => e.type === 'offline'), { type: 'offline', reason: 'the connection to the relay was lost' });
  assert.deepEqual(types(ev), []);   // (the follower: no loss, no error)
  assert.equal(f.connected(), true);
  // (and the later changes too; then Stop Sharing ends it for the follower, as before)
  putFile(doc, 'src/tb.vhd', '-- later\n');
  await until(() => docFile(f.doc, 'src/tb.vhd') === '-- later\n', 'a later change');
  await owner.close();
  await until(() => f.closed(), 'the follower told');
  assert.equal(ev.at(-1).reason, 'the owner stopped sharing');
});

test('#3835 an editor\'s change made while the owner was lost reaches the owner once resumed; the owner\'s meanwhile reaches the editor', async () => {
  const { socks, doc, owner, ownerEv, f } = await setup({ editors: true });
  socks.at(-1).close();
  await until(() => types(ownerEv).includes('offline'), 'offline');
  editFile(f.doc, 'src/tb.vhd', '-- the test bench\n-- by Rui\n');   // (the room has no owner to give it to)
  putFile(doc, 'src/top.vhd', '-- by Ana\nentity top is end;\n');
  await until(() => owner.connected(), 'resumed');
  await until(() => docFile(doc, 'src/tb.vhd') === '-- the test bench\n-- by Rui\n', 'the editor\'s change at the owner\'s');
  await until(() => docFile(f.doc, 'src/top.vhd') === '-- by Ana\nentity top is end;\n', 'the owner\'s at the editor\'s');
  assert.deepEqual(types(ownerEv), ['offline', 'online']);   // (nothing refused)
});

test('#3835 a room the relay no longer keeps (no grace): the resume refused, the owner\'s session ended, said; the follower told', async () => {
  const { socks, owner, ownerEv, f, ev } = await setup({ grace: 0 });
  socks.at(-1).close();
  await until(() => owner.closed(), 'ended');
  assert.deepEqual(types(ownerEv), ['offline', 'closed']);
  assert.equal(ownerEv.at(-1).reason, 'the connection to the relay was lost and the relay no longer kept the room');
  await until(() => f.closed(), 'the follower told');
  assert.equal(ev.at(-1).reason, 'the owner stopped sharing');
});

test('#3835 close() while lost: ended at once, no more tries; reconnect: false ends at the loss, as before', async () => {
  const a = await setup({ reconnect: { delays: [200], for: 5000 } });
  a.socks.at(-1).close();
  await until(() => types(a.ownerEv).includes('offline'), 'offline');
  await a.owner.close();
  assert.equal(a.owner.closed(), true);
  assert.deepEqual(types(a.ownerEv), ['offline', 'closed']);
  assert.equal(a.ownerEv.at(-1).reason, 'sharing stopped');
  await sleep(300);
  assert.equal(a.socks.length, 1);

  const b = await setup({ reconnect: false });
  b.socks.at(-1).close();
  await until(() => b.owner.closed(), 'closed');
  assert.deepEqual(types(b.ownerEv), ['closed']);
  assert.equal(b.ownerEv.at(-1).reason, 'the connection to the relay ended');
  assert.equal(b.socks.length, 1);
});
