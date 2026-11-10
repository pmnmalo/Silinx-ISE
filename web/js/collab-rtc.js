// The WebRTC transport of a shared project whose owner's page hosts the room (#3227, the browser edition): one data
// channel per follower, in a star around the owner's page. The first contact is an offer of the follower's and the
// owner's answer, exchanged as codes (core/collab-codes.js: sealed with the link's key, so only someone with the link
// connects, and the codes reveal no address to whoever carries them); each description is gathered whole (its network
// candidates in it, no trickle), through a public STUN server for the addresses behind a NAT. Over the channel go the
// room's messages, as over the relay's WebSocket: sealed frames and the control's JSON (core/collab-client.js); a frame
// larger than a data channel's message goes as parts, joined again at the other end (core/collab-frag.js).
//   followerOffer({ key, room }) -> { code, accept(answerCode) -> the channel, open; close() }
//   ownerAnswer({ key, room, code }) -> { code (the answer), channel (a promise: the channel, open), close() }
//   channelSocket(dc, pc): a channel as a WebSocket (followRoom's); channelEnd(dc, pc): as a room's socket (the host's)
import { prefKey } from './prefs.js';
import { sealCode, openCode } from '/core/collab-codes.js';
import { keyOf } from '/core/collab-crypto.js';
import { splitFrame, frameJoiner } from '/core/collab-frag.js';
import { FOLLOWER_JOIN } from '/core/collab-loop.js';

/** The STUN servers: a public one, or this browser's own list (JSON, [] for none: a classroom's one network). */
export const STUN_KEY = prefKey('silinx.collab.stun');
export const STUN = Object.freeze(['stun:stun.l.google.com:19302']);
const LABEL = 'silinx-collab';
const GATHER_MS = 4000, CONNECT_MS = 60_000;
// (a frame joined again at most: the owner's, the whole project, as on the relay; a follower's, a follower's frame)
const OWNER_MAX = 16 << 20, FOLLOWER_MAX = FOLLOWER_JOIN;
// a channel's sending: a frame in parts when it is larger than a message
const sendOn = (dc, d) => { if (typeof d === 'string') dc.send(d); else for (const p of splitFrame(d)) dc.send(p); };

function iceServers() {
  let list = STUN;
  try { const v = localStorage.getItem(STUN_KEY); if (v !== null) list = JSON.parse(v); } catch { /* the public one */ }
  return Array.isArray(list) && list.length ? [{ urls: list.map(String) }] : [];
}
// a description's candidates gathered (or what came in GATHER_MS: a STUN server out of reach)
function gathered(pc) {
  return new Promise(resolve => {
    if (pc.iceGatheringState === 'complete') { resolve(); return; }
    const t = setTimeout(resolve, GATHER_MS);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); resolve(); } });
  });
}
// a channel open, or why not
function opened(dc, pc) {
  return new Promise((resolve, reject) => {
    if (dc.readyState === 'open') { resolve(dc); return; }
    const t = setTimeout(() => reject(new Error('no connection: the codes were not exchanged in time')), CONNECT_MS);
    dc.addEventListener('open', () => { clearTimeout(t); resolve(dc); }, { once: true });
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed') { clearTimeout(t); reject(new Error('no connection: the network between you lets no WebRTC through (no UDP)')); }
    });
  });
}

/** The follower's side: the offer's code, for the owner; accept(the owner's answer code) connects. */
export async function followerOffer({ key: keyText, room }) {
  const key = await keyOf(keyText);
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const dc = pc.createDataChannel(LABEL, { ordered: true });
  dc.binaryType = 'arraybuffer';
  await pc.setLocalDescription(await pc.createOffer());
  await gathered(pc);
  return {
    code: await sealCode(key, room, 'offer', pc.localDescription.sdp), dc, pc,
    async accept(answer) {
      const sdp = await openCode(key, room, 'answer', answer);
      await pc.setRemoteDescription({ type: 'answer', sdp });
      return opened(dc, pc);
    },
    close: () => pc.close(),
  };
}

/** The owner's side: a follower's code taken; the answer's code, for them, and their channel once open. */
export async function ownerAnswer({ key: keyText, room, code }) {
  const key = await keyOf(keyText);
  const sdp = await openCode(key, room, 'offer', code);
  const pc = new RTCPeerConnection({ iceServers: iceServers() });
  const channel = new Promise((resolve, reject) => {
    pc.addEventListener('datachannel', ev => {
      const dc = ev.channel;
      if (dc.label !== LABEL) { dc.close(); return; }
      dc.binaryType = 'arraybuffer';
      opened(dc, pc).then(resolve, reject);
    });
  });
  channel.catch(() => {});
  await pc.setRemoteDescription({ type: 'offer', sdp });
  await pc.setLocalDescription(await pc.createAnswer());
  await gathered(pc);
  return { code: await sealCode(key, room, 'answer', pc.localDescription.sdp), channel, pc, close: () => pc.close() };
}

const STATES = { connecting: 0, open: 1, closing: 2, closed: 3 };

/** A channel as a WebSocket, for a follower's participant (core/collab-client.js followRoom). */
export function channelSocket(dc, pc) {
  const ws = new EventTarget();
  const fire = (type, props = {}) => ws.dispatchEvent(Object.assign(new Event(type), props));
  Object.defineProperty(ws, 'readyState', { get: () => STATES[dc.readyState] });
  Object.assign(ws, { binaryType: 'arraybuffer', protocol: '', send: d => sendOn(dc, d), close: () => { dc.close(); pc?.close(); } });
  const join = frameJoiner(OWNER_MAX);
  dc.addEventListener('message', e => {
    if (typeof e.data === 'string') { fire('message', { data: e.data }); return; }
    let f;
    try { f = join.push(new Uint8Array(e.data)); } catch { ws.close(); return; }
    if (f) fire('message', { data: f.buffer.byteLength === f.length ? f.buffer : f.slice().buffer });
  });
  dc.addEventListener('close', () => fire('close', { code: 1000, reason: '' }), { once: true });
  dc.addEventListener('error', () => fire('error'));
  if (dc.readyState === 'open') setTimeout(() => fire('open'), 0);
  else dc.addEventListener('open', () => fire('open'), { once: true });
  return ws;
}

/** A channel as a room's socket, for a follower at the owner's page (core/collab-loop.js hostedRooms().follower). */
export function channelEnd(dc, pc) {
  const end = { onmessage: () => {}, onclose: () => {} };
  Object.defineProperty(end, 'readyState', { get: () => STATES[dc.readyState] });
  end.send = d => { if (dc.readyState === 'open') sendOn(dc, d); };
  end.close = () => { dc.close(); pc?.close(); };
  const join = frameJoiner(FOLLOWER_MAX);
  dc.addEventListener('message', e => {
    if (typeof e.data === 'string') { end.onmessage(e.data, false); return; }
    let f;
    try { f = join.push(new Uint8Array(e.data)); } catch { end.close(); return; }
    if (f) end.onmessage(f, true);   // (whole: the room's own limit then, a follower's)
  });
  dc.addEventListener('close', () => end.onclose(), { once: true });
  return end;
}
