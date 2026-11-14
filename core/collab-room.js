// A shared project's rooms (#3180, #3181, #3227: out of server/collab-relay.js, the server's relay, so that the owner's
// page can host its room too, the browser edition's): who owns each room, its followers, and what passes between them.
// It reads no message (they are sealed with the link's key, which it never sees). What it checks:
// - a participant's first message: an owner's `open` (a new room), a follower's `join` (a room's id), of this version,
//   with a client id of its own (#3360: not the owner's nor another follower's);
// - the owner's frames go to every follower, but one it addresses to a follower (#3529: the whole document a join asks
//   for), which goes to that follower only;
// - only the owner's updates are forwarded: a follower's are dropped and answered with an error (read only), only
//   their awareness (who they are, what they look at) goes through, marked with the client id they joined with (#3360:
//   a follower's awareness speaks for that follower only, never for the owner nor another); and, when the owner lets editors in (its open
//   gives the room's public key, #3182), an editor's edits whose signature is the room's (core/collab-sign.js),
//   each sender's in its order;
// - followers per room, rooms per host, the time to the first message;
// - a room ends with its owner: at once when it stops sharing; its connection lost, after `limits.grace` (#3835: 0, at
//   once, but on the relay), in which the owner resumes it with the secret its open was answered with (`resume`, a
//   connection of its own, the relay's token again): its followers stay, and each is a join again for the owner (the
//   whole document sent again); past it, its followers are told and closed.
// A participant is a socket: send(data, { binary }), close(code, reason), readyState (1: open), as a WebSocket of
// `ws`; its transport gives each message to `message(data, binary)` and its end to `close()`.
import { KIND, PROTOCOL, NOT_SHARED, fromFrame, senderOf } from './collab-client.js';
import { b64url } from './collab-crypto.js';
import { verifierOf, verifyFrame, PUB_RE } from './collab-sign.js';

export const ROOM_LIMITS = Object.freeze({ followers: 64, rooms: 32, helloWait: 10_000, grace: 0 });
/** A room its owner's connection left (#3835), as its followers are told when it ends. */
export const OWNER_LOST = 'the owner\'s connection was lost';

const json = (ws, msg) => { if (ws?.readyState === 1) ws.send(JSON.stringify(msg)); };
// (two secrets compared in a time that does not depend on where they differ)
const same = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};
/** A participant refused: the reason said, its connection closed. */
export const fail = (ws, message) => { json(ws, { type: 'error', message }); ws.close(1008, 'refused'); };
const clientId = v => (Number.isSafeInteger(v) && v >= 0 && v <= 0xFFFFFFFF ? v : null);   // (Yjs's: 32 bits)

/** Rooms: { rooms (Map: room -> { owner (null: its connection lost, #3835), ownerClient, followers: Map<socket,
 *  client>, verify (a promise of the editors' key, or null), resume (its secret), grace (its timer while lost) }),
 *  welcome(socket, role)
 *  -> { message(data, binary), close() }, closeRoom(id, reason) }. role: 'owner' | 'follower'. */
export function collabRooms({ limits = ROOM_LIMITS } = {}) {
  const rooms = new Map();   // room -> { owner, ownerClient, followers: Map<ws, client> }

  function closeRoom(id, reason) {
    const r = rooms.get(id);
    if (!r) return;
    rooms.delete(id);
    clearTimeout(r.grace);
    for (const ws of r.followers.keys()) { json(ws, { type: 'closed', reason }); ws.close(1000, 'closed'); }
    // (the owner told why too: its connection's end is no loss to resume, #3835)
    if (r.owner?.readyState === 1) { json(r.owner, { type: 'closed', reason }); r.owner.close(1000, 'closed'); }
  }

  function welcome(ws, role) {
    let me = null;   // { role: 'owner' | 'follower', room, client }
    let chain = Promise.resolve();   // (an editor's edits, checked in their order)
    const hello = setTimeout(() => { if (!me) fail(ws, 'no open nor join'); }, limits.helloWait);
    const message = (data, binary) => {
      if (!me) {
        let msg = null;
        if (!binary) { try { msg = JSON.parse(String(data)); } catch { /* below */ } }
        if (!msg || msg.v !== PROTOCOL || clientId(msg.client) === null) return fail(ws, 'not a Silinx participant of this version');
        clearTimeout(hello);
        if (!(role === 'owner' ? ['open', 'resume'] : ['join']).includes(msg.type)) return fail(ws, 'not a Silinx participant of this version');
        if (msg.type === 'open') {
          if (rooms.size >= limits.rooms) return fail(ws, `this Silinx server shares ${limits.rooms} projects already`);
          if (msg.editors !== undefined && !PUB_RE.test(String(msg.editors))) return fail(ws, 'not a Silinx participant of this version');
          const verify = msg.editors === undefined ? null : verifierOf(msg.editors);
          verify?.catch(() => {});
          const room = b64url(crypto.getRandomValues(new Uint8Array(16)));
          const resume = b64url(crypto.getRandomValues(new Uint8Array(16)));
          rooms.set(room, { owner: ws, ownerClient: msg.client, followers: new Map(), verify, resume, grace: null });
          me = { role: 'owner', room, client: msg.client };
          return json(ws, { type: 'opened', room, resume });
        }
        if (msg.type === 'resume') {
          // (#3835: the owner's room resumed, its secret and its client id the open's; a connection of the owner's
          // that the relay has not seen lost yet, replaced; every follower a join again)
          const r = typeof msg.room === 'string' ? rooms.get(msg.room) : null;
          if (!r || !same(msg.resume, r.resume) || msg.client !== r.ownerClient) return fail(ws, NOT_SHARED);
          clearTimeout(r.grace);
          r.grace = null;
          const old = r.owner;
          r.owner = ws;
          if (old?.readyState === 1) old.close(1000, 'resumed');
          me = { role: 'owner', room: msg.room, client: msg.client };
          json(ws, { type: 'opened', room: msg.room, resume: r.resume });
          for (const client of r.followers.values()) json(ws, { type: 'join', client });
          return;
        }
        if (msg.type === 'join') {
          const r = typeof msg.room === 'string' ? rooms.get(msg.room) : null;
          if (!r) return fail(ws, NOT_SHARED);
          if (r.followers.size >= limits.followers) return fail(ws, `this shared project has ${limits.followers} followers already`);
          if (msg.client === r.ownerClient || [...r.followers.values()].includes(msg.client)) return fail(ws, 'another participant of this shared project has this client id');
          r.followers.set(ws, msg.client);
          me = { role: 'follower', room: msg.room, client: msg.client };
          json(ws, { type: 'joined', owner: r.ownerClient });
          return json(r.owner, { type: 'join', client: msg.client });
        }
        return fail(ws, 'not a Silinx participant of this version');
      }
      const r = rooms.get(me.room);
      if (!r || (me.role === 'owner' && r.owner !== ws)) return;
      if (me.role === 'owner') {
        if (!binary) { let msg = null; try { msg = JSON.parse(String(data)); } catch { /* ignored */ } if (msg?.type === 'close') closeRoom(me.room, 'the owner stopped sharing'); return; }
        // (a frame for one follower: to it only, its mark taken off; to no one when it has left, #3529)
        if (data[0] === KIND.to) {
          const to = senderOf(new Uint8Array(data), KIND.to);
          const f = to && [...r.followers].find(([, c]) => c === to.client)?.[0];
          if (f?.readyState === 1) f.send(to.frame, { binary: true });
          return;
        }
        for (const f of r.followers.keys()) if (f.readyState === 1) f.send(data, { binary: true });
        return;
      }
      if (!binary) return;
      // a follower: their awareness only (small: their endpoint's maximum); an edit is refused (read only, #3181)
      const others = () => [r.owner, ...r.followers.keys()].filter(o => o && o !== ws && o.readyState === 1);
      if (data[0] === KIND.awareness) { const f = fromFrame(me.client, new Uint8Array(data)); for (const o of others()) o.send(f, { binary: true }); return; }
      if (data[0] !== KIND.edit || !r.verify) return json(ws, { type: 'error', message: 'read only: a follower cannot change the shared project' });
      // an editor's edit: forwarded once its signature is the room's (in the order they came)
      const frame = new Uint8Array(data);
      chain = chain.then(async () => {
        const ok = await verifyFrame(await r.verify, me.room, frame).catch(() => null);
        if (!ok) return json(ws, { type: 'error', message: 'read only: this link cannot change the shared project (not an editor\'s)' });
        if (rooms.get(me.room) === r) for (const o of others()) o.send(frame, { binary: true });
      });
    };
    const close = () => {
      clearTimeout(hello);
      if (!me) return;
      if (me.role === 'owner') {
        const r = rooms.get(me.room);
        if (!r || r.owner !== ws) return;   // (a connection the owner's resume replaced)
        if (!limits.grace) return closeRoom(me.room, 'the owner stopped sharing');
        // (#3835: kept for the owner's resume, its followers with it)
        r.owner = null;
        r.grace = setTimeout(() => closeRoom(me.room, OWNER_LOST), limits.grace);
        r.grace.unref?.();
        return;
      }
      const r = rooms.get(me.room);
      if (!r || !r.followers.delete(ws)) return;
      for (const other of [r.owner, ...r.followers.keys()]) json(other, { type: 'leave', client: me.client });
    };
    return { message, close };
  }

  return { rooms, welcome, closeRoom };
}
