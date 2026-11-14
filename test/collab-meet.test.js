// The public meeting point of a room the owner's page hosts (#3227, core/collab-meet.js), on a meeting point of the
// tests' own (a BroadcastChannel, no network; Trystero's public trackers are never reached): the owner's proof (its
// signature of the follower's id and of their connection) checked with the link's owner's key; a proof for another
// peer, another connection, another room or by another key refused; the project arriving at two followers through it;
// an impostor with the link (posing as the owner, or replaying the owner's proof of its own) ignored, sent nothing; no
// owner, or the follower's own choice: the codes then (MEET_MS). And Trystero's adapter: it loads, its trackers are the
// CSP's, and its calls are wired (a joinRoom of the test's).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { meetTopic, newHostKey, hostVerifier, hostProof, checkProof, fingerprintOf, meetAsHost, meetOwner, channelMeeting, trysteroMeeting, TRACKERS, APP_ID, MEET_MS } from '../core/collab-meet.js';
import { hostedRooms, FOLLOWER_JOIN } from '../core/collab-loop.js';
import { shareRoom, followRoom } from '../core/collab-client.js';
import { projectDoc, publishProject, putFile, docFile, docProject } from '../core/collab-doc.js';
import { followLink, parseFollowLink } from '../core/collab-link.js';
import { newSigner } from '../core/collab-sign.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const until = async (fn, what, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error(`timed out: ${what}`); await sleep(5); } };
const PROJECT = { name: 'traffic', top: 'top', files: [{ path: 'src/top.vhd', lang: 'vhdl' }], device: { part: 'xc3s250e' } };
const owned = () => { const doc = projectDoc(); publishProject(doc, { project: { ...PROJECT, fileTree: ['src/top.vhd'] }, files: { 'src/top.vhd': 'entity top is end;\n' }, owner: 'Ana' }); return doc; };
const live = [];
after(async () => { for (const p of live) await p.close?.().catch?.(() => {}); for (const p of live) await p.leave?.(); });
const keep = p => { live.push(p); return p; };
let seq = 0;
const point = () => channelMeeting(`silinx-meet-test-${++seq}`);
// the owner's page: its room, its participant, at the meeting point
async function owner(meeting) {
  const h = hostedRooms();
  const session = keep(await shareRoom({ url: 'silinx-host:', doc: owned(), user: { name: 'Ana' }, WebSocket: h.owner }));
  const hk = await newHostKey();
  const at = keep(await meetAsHost({ meeting, room: session.room, key: session.key, hostKey: hk.key, maxReceive: FOLLOWER_JOIN, attach: end => h.follower(end) }));
  return { h, session, hk, at };
}

test('the meeting\'s topic: a hash of the room (never its id), one per room', async () => {
  const room = 'A'.repeat(22);
  const t = await meetTopic(room);
  assert.match(t, /^[A-Za-z0-9_-]{32}$/);
  assert.equal(await meetTopic(room), t);
  assert.notEqual(await meetTopic('B'.repeat(22)), t);
  assert.ok(!t.includes('AAAA'));
});

test('the owner\'s proof: checked with its key, for this follower, this connection and this room only', async () => {
  const hk = await newHostKey();
  const v = await hostVerifier(hk.pub);
  const room = 'r'.repeat(22);
  const at = { local: 'sha-256 AA:01', remote: 'sha-256 BB:02' };   // (the owner's side)
  const there = { local: at.remote, remote: at.local };             // (the follower's)
  const p = await hostProof(hk.key, room, 'peer1', at);
  assert.equal(p.length, 65);
  assert.equal(await checkProof(v, room, 'peer1', there, p), true);
  assert.equal(await checkProof(v, room, 'peer2', there, p), false, 'another peer\'s');
  assert.equal(await checkProof(v, room, 'peer1', { local: 'sha-256 CC:03', remote: at.local }, p), false, 'another connection (a peer in the middle)');
  assert.equal(await checkProof(v, room, 'peer1', at, p), false, 'the sides swapped');
  assert.equal(await checkProof(v, 's'.repeat(22), 'peer1', there, p), false, 'another room');
  assert.equal(await checkProof(await hostVerifier((await newHostKey()).pub), room, 'peer1', there, p), false, 'another owner\'s key');
  const bad = p.slice(); bad[10] ^= 1;
  assert.equal(await checkProof(v, room, 'peer1', there, bad), false, 'altered');
  assert.equal(await checkProof(v, room, 'peer1', there, p.subarray(0, 64)), false, 'short');
  assert.equal(await checkProof(v, room, 'peer1', there, 'a proof'), false, 'not bytes');
  // (an editor's signature, of the same curve, is no owner's proof: another message)
  await assert.rejects(hostVerifier('x'.repeat(85)), /the link's owner's key is not valid/);
  await assert.rejects(hostVerifier('A'.repeat(86)), /the link's owner's key is not valid/);
});

test('a session description\'s fingerprint', () => {
  const sdp = 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\na=group:BUNDLE 0\r\na=fingerprint:SHA-256 ab:CD:01\r\na=setup:actpass\r\n';
  assert.equal(fingerprintOf(sdp), 'sha-256 AB:CD:01');
  assert.equal(fingerprintOf('v=0\r\n'), null);
  assert.equal(fingerprintOf(undefined), null);
});

test('the link of a hosted room with the owner\'s key: made, parsed; a broken key refused', async () => {
  const room = 'A'.repeat(22), key = 'b'.repeat(43), { pub } = await newHostKey();
  const l = followLink('https://silinx.example.org/', room, key, 'host', null, null, pub);
  assert.equal(l, `https://silinx.example.org/#follow=${room}.${key}.host.${pub}`);
  assert.equal(l.length - followLink('https://silinx.example.org/', room, key, 'host').length, 87);
  assert.deepEqual(parseFollowLink(l), { base: 'https://silinx.example.org/', room, key, via: 'host', sign: null, host: pub });
  const s = await newSigner();
  const el = followLink('https://silinx.example.org/', room, key, 'host', s.text, null, pub);
  assert.equal(el, `https://silinx.example.org/#edit=${room}.${key}.${s.text}.host.${pub}`);
  assert.deepEqual(parseFollowLink(el), { base: 'https://silinx.example.org/', room, key, via: 'host', sign: s.text, host: pub });
  assert.throws(() => followLink('https://x/', room, key, 'relay', null, null, pub), /not an owner's key of a hosted room/);
  assert.throws(() => followLink('https://x/', room, key, 'host', null, null, 'short'), /not an owner's key/);
  assert.throws(() => parseFollowLink(`#follow=${room}.${key}.host.short`), /broken/);
  assert.throws(() => parseFollowLink(`#follow=${room}.${key}.${pub}`), /broken/);
  assert.throws(() => parseFollowLink(`#follow=${room}.${key}.host.${pub}.x`), /broken/);
  // (a relay's link names no owner's key: a hosted room is reached at the meeting point or with codes, #3281's relay never)
  assert.throws(() => followLink('https://x/', room, key, 'host', null, 'https://relay.example.org', pub), /not a relay's address/);
  assert.throws(() => parseFollowLink(`#follow=${room}.${key}.host.${pub}&relay=${encodeURIComponent('https://relay.example.org')}`), /broken/);
  assert.equal(parseFollowLink(`#follow=${room}.${key}&relay=${encodeURIComponent('https://relay.example.org')}`).host, undefined);
});

test('at the meeting point: two followers find the owner, the project arrives, an edit arrives, the presence; the end with the owner', async () => {
  const m = point();
  const o = await owner(m);
  const ended = [];
  const find = async name => {
    const WS = await meetOwner({ meeting: m, room: o.session.room, key: o.session.key, host: o.hk.pub, ms: 3000 });
    return keep(await followRoom({ url: 'silinx-host:', room: o.session.room, key: o.session.key, user: { name }, WebSocket: WS, onEvent: ev => { if (ev.type === 'closed') ended.push(`${name}: ${ev.reason}`); } }));
  };
  const [rui, eva] = await Promise.all([find('Rui'), find('Eva')]);
  await rui.ready; await eva.ready;
  assert.deepEqual(docProject(rui.doc).project, PROJECT);
  putFile(o.session.doc, 'src/top.vhd', 'entity top is end entity;\n');
  await until(() => docFile(rui.doc, 'src/top.vhd') === 'entity top is end entity;\n' && docFile(eva.doc, 'src/top.vhd') === 'entity top is end entity;\n', 'the edit at both');
  await until(() => o.session.peers().length === 2, 'both in');
  assert.deepEqual(o.session.peers().map(p => p.name).sort(), ['Eva', 'Rui']);
  assert.equal(o.at.ends.size, 2);
  // (the page's way: the meeting point left at once, the room closed: the followers told why first)
  const left = o.at.leave();
  await o.session.close();
  await until(() => rui.closed() && eva.closed(), 'the followers told');
  await left;
  assert.deepEqual(ended.sort(), ['Eva: the owner stopped sharing', 'Rui: the owner stopped sharing']);
});

test('#3835 a follower\'s connection to the owner lost: found again at the meeting point (followRoom\'s transport), the owner\'s change meanwhile arrives, each sees the other again', async () => {
  const m = point();
  const o = await owner(m);
  const ev = [];
  const again = () => meetOwner({ meeting: m, room: o.session.room, key: o.session.key, host: o.hk.pub, ms: 3000 });
  const rui = keep(await followRoom({ url: 'silinx-host:', room: o.session.room, key: o.session.key, user: { name: 'Rui' }, WebSocket: await again(), onEvent: e => { if (e.type !== 'peers') ev.push(e.type); }, reconnect: { delays: [10, 20], for: 5000 }, transport: again }));
  await rui.ready;
  await until(() => o.session.peers().length === 1, 'Rui in');
  const id = rui.doc.clientID;
  // (the connection dropped: the owner's end of it gone, then the follower's)
  for (const end of [...o.at.ends.values()]) end.close();
  await until(() => ev.includes('offline'), 'offline');
  putFile(o.session.doc, 'src/top.vhd', 'entity top is end entity;\n');
  await until(() => rui.connected(), 'online again', 6000);
  await until(() => docFile(rui.doc, 'src/top.vhd') === 'entity top is end entity;\n', 'the change made meanwhile');
  assert.equal(rui.doc.clientID, id);
  await until(() => o.session.peers().map(p => p.name).join() === 'Rui' && rui.owner()?.name === 'Ana', 'each sees the other again');
  assert.equal(o.at.ends.size, 1);
  assert.deepEqual(ev, ['offline', 'online']);
});

test('an impostor with the link, posing as the owner: its proof (forged, or the owner\'s of its own) refused, it is ignored and sent nothing; the follower finds the real owner', async () => {
  const m = point();
  const o = await owner(m);
  // the impostor: another page with the link (its key and room) at the meeting point, first there
  const imp = keep(await m.join({ topic: await meetTopic(o.session.room), password: o.session.key }));
  const toImp = [];
  let ownerProof = null;
  imp.onData((id, d) => { if (id === o.at.meeting.self) ownerProof ??= d; else toImp.push(d); });
  const forged = await hostProof((await newHostKey()).key, o.session.room, 'x', { local: 'a', remote: 'b' });
  await until(() => ownerProof, 'the owner\'s proof of the impostor');
  const posed = [];
  imp.onPeer(async id => {
    if (id === o.at.meeting.self) return;
    posed.push(id);
    // (to the follower: a forged proof, then the owner's proof that was the impostor's, then a project of its own)
    imp.send(id, forged);
    imp.send(id, ownerProof);
    imp.send(id, '{"type":"joined"}');
  });
  const WS = await meetOwner({ meeting: m, room: o.session.room, key: o.session.key, host: o.hk.pub, ms: 3000 });
  const rui = keep(await followRoom({ url: 'silinx-host:', room: o.session.room, key: o.session.key, user: { name: 'Rui' }, WebSocket: WS }));
  await rui.ready;
  assert.equal(docProject(rui.doc).owner, 'Ana');
  await sleep(50);
  assert.equal(posed.length, 1, 'the impostor met the follower');
  assert.deepEqual(toImp, [], 'the follower sent the impostor nothing');
  // (the impostor is a follower of the owner's room, as anyone with the link: read only)
  assert.equal(o.at.ends.size, 2);
});

test('an impostor alone at the meeting point, with the owner\'s proof of its own: no owner found', async () => {
  const m = point();
  const o = await owner(m);
  const imp = keep(await m.join({ topic: await meetTopic(o.session.room), password: o.session.key }));
  let ownerProof = null;
  imp.onData((id, d) => { ownerProof ??= d; });
  await until(() => ownerProof, 'the owner\'s proof of the impostor');
  await o.at.leave();   // (the owner gone: the impostor alone)
  const posed = [];
  imp.onPeer(id => { posed.push(id); imp.send(id, ownerProof); });
  await assert.rejects(meetOwner({ meeting: m, room: o.session.room, key: o.session.key, host: o.hk.pub, ms: 300 }), /the owner was not found at the meeting point/);
  assert.equal(posed.length, 1, 'the impostor met the follower');
});

test('the owner\'s proof replayed by a peer in the middle, on its own connection: refused', async () => {
  const room = 'r'.repeat(22);
  const hk = await newHostKey();
  // a meeting point of the test's: one peer, the "owner", whose proof was signed for the follower's id but for the
  // connection of a peer in the middle (its fingerprints, not the follower's)
  const proof = await hostProof(hk.key, room, 'fol', { local: 'sha-256 MM:00', remote: 'sha-256 OO:00' });
  const on = {};
  const meeting = { join: async () => ({ self: 'fol', onPeer: f => { on.peer = f; }, onLeave: () => {}, onData: f => { on.data = f; }, send: () => { throw new Error('sent to the impostor'); }, binding: async () => ({ local: 'sha-256 FF:00', remote: 'sha-256 MM:00' }), drop: () => {}, leave: async () => { on.left = true; } }) };
  const found = meetOwner({ meeting, room, key: 'k'.repeat(43), host: hk.pub, ms: 200 });
  await sleep(10);
  on.data('mid', proof);
  await assert.rejects(found, /the owner was not found at the meeting point/);
  assert.equal(on.left, true, 'the meeting left');
});

test('no owner at the meeting point: given up after MEET_MS (here less), or at the follower\'s choice; a broken owner\'s key refused', async () => {
  assert.equal(MEET_MS, 15000);
  const m = point();
  const room = 'q'.repeat(22), key = 'k'.repeat(43), { pub } = await newHostKey();
  const t0 = Date.now();
  await assert.rejects(meetOwner({ meeting: m, room, key, host: pub, ms: 150 }), /the owner was not found at the meeting point/);
  assert.ok(Date.now() - t0 >= 140);
  const ac = new AbortController();
  const p = meetOwner({ meeting: m, room, key, host: pub, ms: 5000, signal: ac.signal });
  setTimeout(() => ac.abort(), 20);
  await assert.rejects(p, /the meeting point was left/);
  await assert.rejects(meetOwner({ meeting: m, room, key, host: 'nope' }), /the link's owner's key is not valid/);
});

test('a meeting point is per topic and password: another link\'s pages never meet', async () => {
  const m = point();
  const a = keep(await m.join({ topic: 't', password: 'one' })), b = keep(await m.join({ topic: 't', password: 'two' })), c = keep(await m.join({ topic: 't', password: 'one' }));
  const seen = [];
  a.onPeer(id => seen.push(id));
  b.onPeer(id => seen.push(`b:${id}`));
  await until(() => seen.length, 'a meets c');
  await sleep(30);
  assert.deepEqual(seen, [c.self]);
  // (dropped: its messages ignored, it is told)
  const got = [], left = [];
  a.onData((id, d) => got.push(d));
  c.onLeave(id => left.push(id));
  a.drop(c.self);
  await until(() => left.length, 'c told');
  c.send(a.self, 'after');
  await sleep(30);
  assert.deepEqual([got, left], [[], [a.self]]);
});

test('Trystero\'s adapter: the package loads, its trackers are the CSP\'s; its calls wired (a joinRoom of the test\'s, no network)', async () => {
  const tr = await import('@trystero-p2p/torrent');
  assert.equal(typeof tr.joinRoom, 'function');
  assert.match(tr.selfId, /^[A-Za-z0-9]{20}$/);
  assert.deepEqual(TRACKERS, tr.defaultRelayUrls);
  // a joinRoom of the test's
  const calls = [], sent = [];
  const pc = { closed: false, localDescription: { sdp: 'a=fingerprint:sha-256 aa:bb\r\n' }, remoteDescription: { sdp: 'a=fingerprint:sha-256 cc:dd\r\n' }, close() { this.closed = true; } };
  let action;
  const room = {
    makeAction(ns, cfg) { calls.push(['makeAction', ns]); action = { ...cfg, send: async (d, opt) => { sent.push([[...d], opt]); } }; return action; },
    getPeers: () => ({ p1: pc }),
    leave: async () => { calls.push(['leave']); },
    onPeerJoin: null, onPeerLeave: null,
  };
  const joinRoom = (config, topic) => { calls.push(['joinRoom', config, topic]); return room; };
  const meet = trysteroMeeting({ joinRoom, selfId: 'me', rtcConfig: { iceServers: [] } });
  const accepted = [];
  const m = await meet.join({ topic: 'T', password: 'K', maxReceive: 100, accept: (id, n) => { accepted.push([id, n]); return n < 10; } });
  assert.deepEqual(calls.slice(0, 2), [['joinRoom', { appId: APP_ID, password: 'K', relayConfig: { urls: TRACKERS }, rtcConfig: { iceServers: [] }, maxReceiveBytes: 101 }, 'T'], ['makeAction', 'frame']]);
  assert.equal(m.self, 'me');
  const ev = [];
  m.onPeer(id => ev.push(['peer', id]));
  m.onLeave(id => ev.push(['leave', id]));
  m.onData((id, d) => ev.push(['data', id, typeof d === 'string' ? d : [...d]]));
  room.onPeerJoin('p1');
  m.send('p1', 'hi');
  m.send('p1', Uint8Array.from([7, 8]));
  assert.deepEqual(sent, [[[0, 104, 105], { target: 'p1' }], [[1, 7, 8], { target: 'p1' }]]);
  assert.equal(action.onReceive({ peerId: 'p1', byteLength: 5 }), true);
  assert.equal(action.onReceive({ peerId: 'p1', byteLength: 50 }), false);
  action.onMessage(Uint8Array.from([0, 111, 107]), { peerId: 'p1' });
  action.onMessage(Uint8Array.from([1, 5]).buffer, { peerId: 'p1' });
  assert.deepEqual(await m.binding('p1'), { local: 'sha-256 AA:BB', remote: 'sha-256 CC:DD' });
  assert.equal(await m.binding('p2'), null);
  m.drop('p1');
  assert.equal(pc.closed, true);
  assert.equal(action.onReceive({ peerId: 'p1', byteLength: 1 }), false, 'dropped');
  action.onMessage(Uint8Array.from([0, 120]), { peerId: 'p1' });
  room.onPeerJoin('p1');
  room.onPeerLeave('p1');
  await m.leave();
  assert.deepEqual(ev, [['peer', 'p1'], ['data', 'p1', 'ok'], ['data', 'p1', [5]], ['leave', 'p1']]);
  assert.deepEqual(accepted, [['p1', 4], ['p1', 49]]);
  assert.deepEqual(calls.at(-1), ['leave']);
});
