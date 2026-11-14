// A shared project's rooms (core/collab-room.js, #3227: out of server/collab-relay.js), alone, on sockets of the test's
// own (no network): an owner opens a room, followers join it; the owner's frames reach every follower, a follower's
// awareness everyone else, a follower's update nobody (read only); who joins and leaves told; the first message
// checked (the role's, the version, a client id), the time to it; the limits (rooms, followers); a room ended with its
// owner, by Stop Sharing or the connection lost. The rooms over the server's WebSockets: test/collab.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collabRooms, ROOM_LIMITS, OWNER_LOST } from '../core/collab-room.js';
import { KIND, PROTOCOL, NOT_SHARED, fromFrame, toFrame, senderOf } from '../core/collab-client.js';
import { ROOM_RE } from '../core/collab-link.js';

// a participant: what it was sent (text as JSON, binary as bytes), how it was closed
function socket() {
  const s = { readyState: 1, got: [], closed: null };
  s.send = (data, { binary } = {}) => s.got.push(binary ? [...data] : JSON.parse(data));
  s.close = (code, reason) => { s.readyState = 3; s.closed = [code, reason]; };
  return s;
}
const text = o => JSON.stringify({ v: PROTOCOL, ...o });
const frame = (kind, ...b) => Uint8Array.from([kind, ...b]);

function room(limits) {
  const host = collabRooms({ limits: { ...ROOM_LIMITS, ...limits } });
  const owner = socket(), o = host.welcome(owner, 'owner');
  o.message(text({ type: 'open', client: 1 }), false);
  const id = owner.got[0].room;
  const join = client => { const s = socket(), p = host.welcome(s, 'follower'); p.message(text({ type: 'join', room: id, client }), false); return [s, p]; };
  return { host, owner, o, id, join };
}

test('an owner opens a room; followers join it: the owner told, each follower the owner\'s client', () => {
  const { host, owner, id, join } = room();
  assert.match(id, ROOM_RE);
  assert.deepEqual(owner.got, [{ type: 'opened', room: id, resume: owner.got[0].resume }]);
  assert.match(owner.got[0].resume, /^[A-Za-z0-9_-]{22}$/);   // (#3835: its resume's secret, 128 bits)
  assert.notEqual(room().owner.got[0].resume, owner.got[0].resume);
  const [a] = join(7), [b] = join(8);
  assert.deepEqual(a.got, [{ type: 'joined', owner: 1 }]);
  assert.deepEqual(b.got, [{ type: 'joined', owner: 1 }]);
  assert.deepEqual(owner.got.slice(1), [{ type: 'join', client: 7 }, { type: 'join', client: 8 }]);
  assert.deepEqual([...host.rooms.get(id).followers.values()], [7, 8]);
});

test('what passes: the owner\'s frames to every follower; a follower\'s awareness to the others; a follower\'s update to nobody', () => {
  const { owner, o, join } = room();
  const [a, pa] = join(7), [b] = join(8);
  for (const s of [owner, a, b]) s.got.length = 0;
  o.message(frame(KIND.update, 9, 9), true);
  assert.deepEqual([a.got, b.got], [[[KIND.update, 9, 9]], [[KIND.update, 9, 9]]]);
  pa.message(frame(KIND.awareness, 5), true);
  // (marked with the client id the follower joined with, #3360)
  assert.deepEqual([owner.got, a.got.length, b.got.at(-1)], [[[KIND.from, 0, 0, 0, 7, KIND.awareness, 5]], 1, [KIND.from, 0, 0, 0, 7, KIND.awareness, 5]]);
  assert.deepEqual([...fromFrame(7, frame(KIND.awareness, 5))], [KIND.from, 0, 0, 0, 7, KIND.awareness, 5]);
  pa.message(frame(KIND.update, 6), true);
  assert.deepEqual(a.got.at(-1), { type: 'error', message: 'read only: a follower cannot change the shared project' });
  assert.equal(owner.got.length, 1);
  assert.equal(b.got.length, 2);
  // (a follower's text after its join: ignored; a frame to a closed follower: not sent)
  pa.message('{"type":"close"}', false);
  b.readyState = 3;
  o.message(frame(KIND.update, 1), true);
  assert.deepEqual([a.got.at(-1), b.got.length], [[KIND.update, 1], 2]);
});

test('#3529 the owner\'s frame for one follower: to that follower only, its mark taken off; to a follower gone, to nobody', () => {
  const { owner, o, join } = room();
  const [a] = join(7), [b, pb] = join(8);
  for (const s of [owner, a, b]) s.got.length = 0;
  const f = toFrame(8, frame(KIND.update, 9, 9));
  assert.deepEqual([...f], [KIND.to, 0, 0, 0, 8, KIND.update, 9, 9]);
  assert.deepEqual(senderOf(f, KIND.to), { client: 8, frame: frame(KIND.update, 9, 9) });
  assert.equal(senderOf(f), null);
  o.message(f, true);
  assert.deepEqual([a.got, b.got, owner.got], [[], [[KIND.update, 9, 9]], []]);
  // (a client not in the room, a follower that left, a mark cut short: nobody)
  o.message(toFrame(9, frame(KIND.update, 1)), true);
  pb.close();
  o.message(toFrame(8, frame(KIND.update, 2)), true);
  o.message(Uint8Array.from([KIND.to, 0, 0]), true);
  assert.deepEqual([a.got.filter(m => Array.isArray(m)), b.got.length], [[], 1]);
});

test('who leaves: the others told; the room ends with its owner, by Stop Sharing or the connection lost', () => {
  const { host, owner, o, id, join } = room();
  const [a, pa] = join(7), [b] = join(8);
  pa.close();
  assert.deepEqual([owner.got.at(-1), b.got.at(-1)], [{ type: 'leave', client: 7 }, { type: 'leave', client: 7 }]);
  pa.close();   // (once only)
  assert.equal(b.got.filter(m => m.type === 'leave').length, 1);
  o.message(JSON.stringify({ type: 'close' }), false);
  assert.equal(host.rooms.has(id), false);
  assert.deepEqual([b.got.at(-1), b.closed, owner.closed], [{ type: 'closed', reason: 'the owner stopped sharing' }, [1000, 'closed'], [1000, 'closed']]);
  assert.deepEqual(owner.got.at(-1), { type: 'closed', reason: 'the owner stopped sharing' });   // (#3835: no loss to resume)
  assert.equal(a.closed, null);
  // (the owner's connection lost)
  const r2 = room();
  const [c] = r2.join(9);
  r2.o.close();
  assert.equal(r2.host.rooms.size, 0);
  assert.deepEqual(c.got.at(-1), { type: 'closed', reason: 'the owner stopped sharing' });
});

test('#3835 the owner\'s connection lost, with a grace: the room kept, its followers with it; resumed with its secret, every follower a join again', () => {
  const { host, owner, o, id, join } = room({ grace: 60_000 });
  const secret = owner.got[0].resume;
  const [a, pa] = join(7);
  o.close();
  assert.equal(host.rooms.has(id), true);
  assert.equal(a.closed, null);
  assert.equal(host.rooms.get(id).owner, null);
  // meanwhile: another follower joins, a follower's awareness reaches the others only (no owner), one leaves
  const [b] = join(8);
  assert.deepEqual(b.got, [{ type: 'joined', owner: 1 }]);
  pa.message(frame(KIND.awareness, 9), true);
  assert.deepEqual(b.got.at(-1), [...fromFrame(7, frame(KIND.awareness, 9))]);
  const [c, pc] = join(9);
  pc.close();
  assert.equal(c.closed, null);
  // refused: another room, another secret, another client id; a follower's endpoint
  const tryResume = (msg, role = 'owner') => { const s = socket(); host.welcome(s, role).message(text({ type: 'resume', room: id, resume: secret, client: 1, ...msg }), false); return s; };
  for (const bad of [{ room: 'x'.repeat(22) }, { resume: 'y'.repeat(22) }, { resume: secret.slice(1) }, { resume: undefined }, { client: 2 }]) {
    const s = tryResume(bad);
    assert.deepEqual([s.got, s.closed], [[{ type: 'error', message: NOT_SHARED }], [1008, 'refused']], JSON.stringify(bad));
  }
  assert.deepEqual(tryResume({}, 'follower').closed, [1008, 'refused']);
  // resumed: opened again, each follower a join; the owner's frames reach them again
  const s = socket(), ps = host.welcome(s, 'owner');
  ps.message(text({ type: 'resume', room: id, resume: secret, client: 1 }), false);
  assert.deepEqual(s.got, [{ type: 'opened', room: id, resume: secret }, { type: 'join', client: 7 }, { type: 'join', client: 8 }]);
  ps.message(frame(KIND.update, 5), true);
  assert.deepEqual([a.got.at(-1), b.got.at(-1)], [[KIND.update, 5], [KIND.update, 5]]);
  // (and it ends as any: Stop Sharing)
  ps.message(JSON.stringify({ type: 'close' }), false);
  assert.equal(host.rooms.has(id), false);
  assert.deepEqual(a.got.at(-1), { type: 'closed', reason: 'the owner stopped sharing' });
});

test('#3835 a resume replaces an owner\'s connection not seen lost yet: the old one closed, its frames and its end ignored; past the grace, the followers told', async () => {
  const { host, owner, o, id, join } = room({ grace: 60_000 });
  const [a] = join(7);
  const s = socket(), ps = host.welcome(s, 'owner');
  ps.message(text({ type: 'resume', room: id, resume: owner.got[0].resume, client: 1 }), false);
  assert.deepEqual(owner.closed, [1000, 'resumed']);
  owner.readyState = 1;   // (as if its frames still came)
  o.message(frame(KIND.update, 1), true);
  assert.deepEqual(a.got, [{ type: 'joined', owner: 1 }]);
  o.close();
  assert.equal(host.rooms.get(id).owner, s);
  // past the grace (here 20 ms): closed, the followers told why
  const r = room({ grace: 20 });
  const [b] = r.join(8);
  r.o.close();
  await new Promise(res => setTimeout(res, 60));
  assert.equal(r.host.rooms.size, 0);
  assert.deepEqual([b.got.at(-1), b.closed], [{ type: 'closed', reason: OWNER_LOST }, [1000, 'closed']]);
  assert.equal(OWNER_LOST, 'the owner\'s connection was lost');
  // (no grace, the default but on the relay: closed at once, as before)
  assert.equal(ROOM_LIMITS.grace, 0);
});

test('the first message: the role\'s, this version, a client id; the time to it', async () => {
  const host = collabRooms();
  const refused = (role, data, binary = false) => { const s = socket(); host.welcome(s, role).message(data, binary); return [s.got, s.closed]; };
  const NOT = [[{ type: 'error', message: 'not a Silinx participant of this version' }], [1008, 'refused']];
  assert.deepEqual(refused('follower', text({ type: 'open', client: 1 })), NOT);
  assert.deepEqual(refused('owner', text({ type: 'join', room: 'x', client: 1 })), NOT);
  assert.deepEqual(refused('owner', JSON.stringify({ type: 'open', v: 0, client: 1 })), NOT);
  assert.deepEqual(refused('owner', text({ type: 'open', client: -1 })), NOT);
  assert.deepEqual(refused('owner', text({ type: 'open', client: 2 ** 32 })), NOT);   // (Yjs's client ids: 32 bits)
  assert.deepEqual(refused('owner', 'not json'), NOT);
  assert.deepEqual(refused('owner', Uint8Array.from([1, 2]), true), NOT);
  assert.deepEqual(refused('follower', text({ type: 'join', room: 'Z'.repeat(22), client: 1 })),
    [[{ type: 'error', message: 'this shared project is no longer shared (its owner stopped sharing it)' }], [1008, 'refused']]);
  assert.equal(host.rooms.size, 0);
  const slow = collabRooms({ limits: { ...ROOM_LIMITS, helloWait: 20 } });
  const s = socket();
  slow.welcome(s, 'follower');
  await new Promise(r => setTimeout(r, 60));
  assert.deepEqual([s.got, s.closed], [[{ type: 'error', message: 'no open nor join' }], [1008, 'refused']]);
});

test('a follower cannot join with the owner\'s client id nor another follower\'s (#3360)', () => {
  const { host, owner, id, join } = room();
  join(7);
  const TAKEN = [[{ type: 'error', message: 'another participant of this shared project has this client id' }], [1008, 'refused']];
  for (const client of [1, 7]) { const [s] = join(client); assert.deepEqual([s.got, s.closed], TAKEN); }
  assert.deepEqual([...host.rooms.get(id).followers.values()], [7]);
  assert.deepEqual(owner.got.slice(1), [{ type: 'join', client: 7 }]);
});

test('the limits: rooms per host, followers per room', () => {
  const { host, join } = room({ rooms: 1, followers: 1 });
  const s = socket();
  host.welcome(s, 'owner').message(text({ type: 'open', client: 2 }), false);
  assert.deepEqual(s.got, [{ type: 'error', message: 'this Silinx server shares 1 projects already' }]);
  join(7);
  const [b] = join(8);
  assert.deepEqual(b.got, [{ type: 'error', message: 'this shared project has 1 followers already' }]);
  assert.deepEqual(b.closed, [1008, 'refused']);
});
