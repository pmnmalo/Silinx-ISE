// The public meeting point of a room the owner's page hosts (#3227, the browser edition): opening the link is enough,
// the codes exchanged by hand (core/collab-codes.js) staying as the fall-back. The meeting point (Trystero's torrent
// strategy: public WebTorrent trackers, web/js/collab-meet.js) connects every page that joins the room's topic (a hash
// of the room's id) with the link's key as its password (the signalling encrypted with it), each to every other. So
// the link's key alone cannot tell the owner: a follower could pose as the owner to another follower. The owner's page
// makes an owner's key pair (ECDSA P-256, distinct from the editors' signing key), whose public half is in the link
// (core/collab-link.js `.host.<owner's key>`); to each peer that joins, it sends first a proof, its signature of
//   silinx-collab:host:<room>:<that peer's id>:<the owner's connection's fingerprint>:<the peer's>
// A follower talks to the one peer whose proof checks with the link's key, over the very connection it was signed for
// (WebRTC's DTLS fingerprints: a peer in the middle has connections of its own), and ignores every other: it sends it
// nothing and takes nothing from it. Over the owner's connection go the room's messages, as over a data channel: sealed
// frames and the control's JSON (core/collab-client.js); the owner's page attaches each follower as a socket of its
// room (core/collab-loop.js hostedRooms().follower, with a follower's frame limit).
//   A meeting point: { join({ topic, password, maxReceive, accept(id, bytes) }) -> Promise<a meeting> }, a meeting:
//   { self, onPeer(f(id)), onLeave(f(id)), onData(f(id, data: string | Uint8Array)), send(id, data), binding(id) ->
//   Promise<{ local, remote }> (the connection's two fingerprints, this side's first), drop(id), leave() }
//   meetAsHost({ meeting, room, key, hostKey, attach }) -> { leave() }    meetOwner({ meeting, room, key, host, ms })
//   -> a WebSocket (followRoom's) to the owner; channelMeeting(name): a meeting point of a page's own, between the
//   pages of one browser (a BroadcastChannel: the tests', no network); trysteroMeeting({ joinRoom, selfId, … }).
import { b64url } from './collab-crypto.js';
import { newSigner, PUB_RE, SIG } from './collab-sign.js';

const subtle = () => globalThis.crypto.subtle;
const HASH = { name: 'ECDSA', hash: 'SHA-256' };
const PROOF = 0xF8;
const LINGER_MS = 1000;   // (a connection the owner's page ends, kept that long: its last messages delivered)   // (a proof's first byte: never a frame's kind, a part's 0xF0 nor a code's)
/** How long a follower looks for the owner at the meeting point before the codes take over. */
export const MEET_MS = 15_000;
/** Trystero's application id (its topics' namespace). */
export const APP_ID = 'silinx-collab';
/** The public WebTorrent trackers (Trystero's own list; the pages' CSP lets them in: server/csp.js). */
export const TRACKERS = Object.freeze(['wss://open.ftorrent.com', 'wss://tracker.webtorrent.dev', 'wss://tracker.openwebtorrent.com', 'wss://tracker.btorrent.xyz', 'wss://tracker.files.fm:7073/announce']);

const proofText = (room, peer, owner, follower) => new TextEncoder().encode(`silinx-collab:host:${room}:${peer}:${owner}:${follower}`);

/** A room's meeting topic: a hash of its id (the trackers never see the id). */
export async function meetTopic(room) {
  return b64url(new Uint8Array(await subtle().digest('SHA-256', new TextEncoder().encode(`silinx-collab:meet:${room}`)))).slice(0, 32);
}

/** The owner's new key pair: { key (to sign, never leaves the page), pub (the link's) }. */
export async function newHostKey() {
  const { key, pub } = await newSigner();
  return { key, pub };
}

/** The key that checks the owner's proofs (an error for a link's owner's key that is not one). */
export async function hostVerifier(pub) {
  const bad = () => new Error('the link\'s owner\'s key is not valid (copy the link again)');
  if (!PUB_RE.test(String(pub))) throw bad();
  try { return await subtle().importKey('jwk', { kty: 'EC', crv: 'P-256', x: pub.slice(0, 43), y: pub.slice(43), ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']); }
  catch { throw bad(); }
}

/** The owner's proof for a peer: its message, [PROOF][signature]. binding: the owner's side's { local, remote }. */
export async function hostProof(key, room, peer, binding) {
  const sig = new Uint8Array(await subtle().sign(HASH, key, proofText(room, peer, binding.local, binding.remote)));
  const out = new Uint8Array(1 + SIG);
  out[0] = PROOF;
  out.set(sig, 1);
  return out;
}

/** A proof checked by a follower (`self`, its id; binding, its side's): true when it is the owner's, for it, here. */
export async function checkProof(verifier, room, self, binding, proof) {
  if (!(proof instanceof Uint8Array) || proof.length !== 1 + SIG || proof[0] !== PROOF) return false;
  try { return await subtle().verify(HASH, verifier, proof.subarray(1), proofText(room, self, binding.remote, binding.local)); } catch { return false; }
}

/** A session description's DTLS fingerprint (upper case), or null. */
export function fingerprintOf(sdp) {
  const m = /^a=fingerprint:(\S+) ([0-9A-Fa-f:]+)\s*$/m.exec(String(sdp || ''));
  return m ? `${m[1].toLowerCase()} ${m[2].toUpperCase()}` : null;
}

const STATES = { open: 1, closed: 3 };
// a connection's fingerprints (its descriptions may still be settling as it joins: a few tries), or null
async function bound(m, id, tries = 10) {
  for (let i = 0; i < tries; i++) {
    let b = null;
    try { b = await m.binding(id); } catch { /* not yet */ }
    if (b?.local && b?.remote) return b;
    await new Promise(r => setTimeout(r, 100));
  }
  return null;
}

/** The owner's side: every peer that joins gets the proof, then is attached as a follower (a room's socket). */
export async function meetAsHost({ meeting: point, room, key, hostKey, attach, maxReceive }) {
  const m = await point.join({ topic: await meetTopic(room), password: key, maxReceive });
  const ends = new Map();   // id -> the room's socket of that peer
  m.onPeer(async id => {
    if (ends.has(id)) return;
    const binding = await bound(m, id);
    if (!binding) return;
    const end = { readyState: 1, onmessage: () => {}, onclose: () => {} };
    end.send = d => { if (end.readyState === 1) m.send(id, typeof d === 'string' ? d : new Uint8Array(d)); };
    // (its connection dropped a moment later: what the room sent it last, its reason, still reaches it)
    end.close = () => { if (end.readyState !== 1) return; end.readyState = 3; ends.delete(id); end.onclose(); setTimeout(() => m.drop(id), LINGER_MS); };
    ends.set(id, end);
    m.send(id, await hostProof(hostKey, room, id, binding));
    attach(end);
  });
  m.onData((id, d) => { const end = ends.get(id); if (end?.readyState === 1) end.onmessage(d, typeof d !== 'string'); });
  m.onLeave(id => { const end = ends.get(id); if (!end) return; ends.delete(id); end.readyState = 3; end.onclose(); });
  // (left a moment after the room's end: its last messages, why it ended, reach the followers first)
  const leave = async () => { await new Promise(r => setTimeout(r, LINGER_MS)); for (const e of [...ends.values()]) e.close(); await m.leave(); };
  return { meeting: m, ends, leave };
}

/** The follower's side: the owner found at the meeting point (the one peer whose proof checks), as a WebSocket
 *  (core/collab-client.js followRoom); an error when no owner proved itself in `ms`, or on `signal`'s abort. */
export async function meetOwner({ meeting: point, room, key, host, ms = MEET_MS, signal, maxReceive }) {
  const verifier = await hostVerifier(host);
  let owner = null, ws = null;
  const tried = new Set();   // (the peers whose first message was taken: the owner's proof, or ignored for good)
  const m = await point.join({
    topic: await meetTopic(room), password: key, maxReceive,
    // (from the owner, anything; from another peer, its first message only, as small as a proof)
    accept: (id, bytes) => id === owner || (!owner && !tried.has(id) && bytes <= 1 + SIG + 8),
  });
  return new Promise((resolve, reject) => {
    const fail = e => { clearTimeout(t); m.leave(); reject(e); };
    const t = setTimeout(() => fail(new Error('the owner was not found at the meeting point')), ms);
    signal?.addEventListener('abort', () => { if (!owner) fail(new Error('the meeting point was left')); }, { once: true });
    m.onData(async (id, d) => {
      if (id === owner) { if (ws.readyState === 1) ws.fire('message', { data: typeof d === 'string' ? d : (d.byteLength === d.buffer.byteLength ? d.buffer : d.slice().buffer) }); return; }
      if (owner || tried.has(id)) return;
      tried.add(id);
      let ok = false;
      const b = await bound(m, id);
      ok = !!b && await checkProof(verifier, room, m.self, b, d);
      if (!ok || owner || signal?.aborted) return;
      owner = id;
      clearTimeout(t);
      ws = ownerSocket(m, id);
      resolve(function MeetOwnerSocket() { setTimeout(() => ws.fire('open'), 0); return ws; });
    });
    m.onLeave(id => { if (id === owner && ws.readyState === 1) { ws.readyState = 3; ws.fire('close', { code: 1000, reason: '' }); m.leave(); } });
  });
}

// the owner's connection as a WebSocket
function ownerSocket(m, id) {
  const ws = new EventTarget();
  ws.fire = (type, props = {}) => ws.dispatchEvent(Object.assign(new Event(type), props));
  Object.assign(ws, {
    readyState: STATES.open, binaryType: 'arraybuffer', protocol: '',
    send: d => { if (ws.readyState === 1) m.send(id, typeof d === 'string' ? d : new Uint8Array(d)); },
    close: () => { if (ws.readyState !== 1) return; ws.readyState = 3; m.leave(); setTimeout(() => ws.fire('close', { code: 1000, reason: '' }), 0); },
  });
  return ws;
}

const later = f => setTimeout(f, 0);
const randomId = () => b64url(globalThis.crypto.getRandomValues(new Uint8Array(15)));

/** A meeting point between the pages of one browser (a BroadcastChannel per topic and password; each peer's
 *  "fingerprint" a random token of its join). The tests' (node, the UI's pages of one browser): no network. */
export function channelMeeting(name = 'silinx-meet') {
  return {
    async join({ topic, password, accept = () => true }) {
      const tag = b64url(new Uint8Array(await subtle().digest('SHA-256', new TextEncoder().encode(`${topic}:${password}`)))).slice(0, 22);
      const ch = new BroadcastChannel(`${name}:${tag}`);
      const self = randomId(), mine = randomId();
      const peers = new Map();   // id -> its token
      const dropped = new Set();
      const on = { peer: () => {}, leave: () => {}, data: () => {} };
      let left = false;
      const post = msg => { if (!left) ch.postMessage({ ...msg, from: self }); };
      ch.onmessage = ({ data: msg }) => {
        if (left || msg.from === self || (msg.to && msg.to !== self) || dropped.has(msg.from)) return;
        if (msg.type === 'hello' || msg.type === 'welcome') {
          if (msg.type === 'hello') post({ type: 'welcome', to: msg.from, token: mine });
          if (!peers.has(msg.from)) { peers.set(msg.from, msg.token); on.peer(msg.from); }
        } else if (msg.type === 'data' && peers.has(msg.from)) {
          const d = typeof msg.data === 'string' ? msg.data : new Uint8Array(msg.data);
          if (accept(msg.from, typeof d === 'string' ? d.length : d.byteLength)) on.data(msg.from, d);
        } else if (msg.type === 'bye' && peers.delete(msg.from)) on.leave(msg.from);
      };
      later(() => post({ type: 'hello', token: mine }));
      return {
        self,
        onPeer: f => { on.peer = f; }, onLeave: f => { on.leave = f; }, onData: f => { on.data = f; },
        send: (id, d) => { if (peers.has(id)) post({ type: 'data', to: id, data: typeof d === 'string' ? d : d.slice() }); },
        binding: async id => (peers.has(id) ? { local: mine, remote: peers.get(id) } : null),
        drop: id => { if (peers.delete(id)) { dropped.add(id); post({ type: 'bye', to: id }); } },
        leave: async () => { if (left) return; post({ type: 'bye' }); left = true; ch.close(); },
      };
    },
  };
}

/** Trystero's meeting point (its joinRoom and selfId: @trystero-p2p/torrent's), its trackers and WebRTC's settings.
 *  The room's messages go as one action: a string or bytes, marked by a first byte. */
export function trysteroMeeting({ joinRoom, selfId, trackers = TRACKERS, rtcConfig } = {}) {
  return {
    async join({ topic, password, maxReceive = 16 << 20, accept = () => true }) {
      const room = joinRoom({ appId: APP_ID, password, relayConfig: { urls: [...trackers] }, rtcConfig, maxReceiveBytes: maxReceive + 1 }, topic);
      const on = { peer: () => {}, leave: () => {}, data: () => {} };
      const dropped = new Set();
      const act = room.makeAction('frame', {
        onReceive: ctx => !dropped.has(ctx.peerId) && accept(ctx.peerId, ctx.byteLength - 1),
        onMessage: (data, ctx) => {
          if (dropped.has(ctx.peerId)) return;
          const b = data instanceof Uint8Array ? data : new Uint8Array(data instanceof ArrayBuffer ? data : data.buffer);
          if (!b.length) return;
          on.data(ctx.peerId, b[0] === 0 ? new TextDecoder().decode(b.subarray(1)) : b.slice(1));
        },
      });
      room.onPeerJoin = id => { if (!dropped.has(id)) on.peer(id); };
      room.onPeerLeave = id => { dropped.delete(id); on.leave(id); };
      return {
        self: selfId,
        onPeer: f => { on.peer = f; }, onLeave: f => { on.leave = f; }, onData: f => { on.data = f; },
        send: (id, d) => {
          const body = typeof d === 'string' ? new TextEncoder().encode(d) : d;
          const out = new Uint8Array(body.length + 1);
          out[0] = typeof d === 'string' ? 0 : 1;
          out.set(body, 1);
          act.send(out, { target: id }).catch(() => {});
        },
        binding: async id => {
          const pc = room.getPeers()[id];
          return pc ? { local: fingerprintOf(pc.localDescription?.sdp), remote: fingerprintOf(pc.remoteDescription?.sdp) } : null;
        },
        drop: id => { dropped.add(id); try { room.getPeers()[id]?.close(); } catch { /* gone */ } },
        leave: () => room.leave(),
      };
    },
  };
}
