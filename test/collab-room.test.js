// A shared project's rooms (core/collab-room.js, #3227: out of server/collab-relay.js), alone, on sockets of the test's
// own (no network): an owner opens a room, followers join it; the owner's frames reach every follower, a follower's
// awareness everyone else, a follower's update nobody (read only); who joins and leaves told; the first message
// checked (the role's, the version, a client id), the time to it; the limits (rooms, followers); a room ended with its
// owner, by Stop Sharing or the connection lost. The rooms over the server's WebSockets: test/collab.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collabRooms, ROOM_LIMITS } from '../core/collab-room.js';
import { KIND, PROTOCOL } from '../core/collab-client.js';
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
  assert.deepEqual(owner.got, [{ type: 'opened', room: id }]);
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
  assert.deepEqual([owner.got, a.got.length, b.got.at(-1)], [[[KIND.awareness, 5]], 1, [KIND.awareness, 5]]);
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
  assert.equal(a.closed, null);
  // (the owner's connection lost)
  const r2 = room();
  const [c] = r2.join(9);
  r2.o.close();
  assert.equal(r2.host.rooms.size, 0);
  assert.deepEqual(c.got.at(-1), { type: 'closed', reason: 'the owner stopped sharing' });
});

test('the first message: the role\'s, this version, a client id; the time to it', async () => {
  const host = collabRooms();
  const refused = (role, data, binary = false) => { const s = socket(); host.welcome(s, role).message(data, binary); return [s.got, s.closed]; };
  const NOT = [[{ type: 'error', message: 'not a Silinx participant of this version' }], [1008, 'refused']];
  assert.deepEqual(refused('follower', text({ type: 'open', client: 1 })), NOT);
  assert.deepEqual(refused('owner', text({ type: 'join', room: 'x', client: 1 })), NOT);
  assert.deepEqual(refused('owner', JSON.stringify({ type: 'open', v: 0, client: 1 })), NOT);
  assert.deepEqual(refused('owner', text({ type: 'open', client: -1 })), NOT);
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
