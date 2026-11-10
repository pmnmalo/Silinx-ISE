// The codes a follower and the owner exchange by hand to connect, when the owner's page hosts the room (#3227, the
// browser edition; the meeting point exchanges the same): the follower's WebRTC offer, then the owner's answer, each
// a session description (SDP) compressed and sealed with the link's key (core/collab-crypto.js), its kind and the room
// authenticated. So a code reveals nothing (its addresses) to whoever carries it, and only someone with the link makes
// one the other side takes: an offer is not taken as an answer, nor a code of another shared project.
//   sealCode(key, room, kind, sdp) -> 'S1.<base64url>'      openCode(key, room, kind, code) -> sdp (or an error)
import { seal, unseal, b64url } from './collab-crypto.js';

export const CODE_KINDS = Object.freeze({ offer: 16, answer: 17 });   // (never a frame's kind: core/collab-client.js KIND)
const PREFIX = 'S1.';
export const CODE_MAX = 64 << 10;   // (a code's length at most: an SDP is a few kilobytes)
export const SDP_MAX = 256 << 10;   // (its description inflated, at most: never a bomb)

const unb64url = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
// bytes through a (de)compression stream, `max` bytes out at most (an error past them)
async function through(stream, bytes, max = Infinity) {
  const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
  const parts = [];
  let n = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { await reader.cancel(); throw new Error('too large'); }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}

/** A session description sealed as a code. */
export async function sealCode(key, room, kind, sdp) {
  if (!Object.hasOwn(CODE_KINDS, kind)) throw new Error(`a code is an offer or an answer (not ${kind})`);
  const packed = await through(new CompressionStream('deflate-raw'), new TextEncoder().encode(String(sdp)));
  return PREFIX + b64url(await seal(key, room, CODE_KINDS[kind], packed));
}

/** A code opened: its session description. Errors: not a code, too long, not this kind, not this shared project's. */
export async function openCode(key, room, kind, code) {
  const what = kind === 'offer' ? 'a follower\'s code' : 'the owner\'s code';
  const text = String(code ?? '').replace(/\s+/g, '');
  if (text.length > CODE_MAX) throw new Error(`${what} too long`);
  if (!text.startsWith(PREFIX) || !/^[A-Za-z0-9_-]+$/.test(text.slice(PREFIX.length))) throw new Error(`not ${what} (copy it again, whole)`);
  let frame;
  try { frame = unb64url(text.slice(PREFIX.length)); } catch { throw new Error(`not ${what} (copy it again, whole)`); }
  let opened;
  try { opened = await unseal(key, room, frame); } catch { throw new Error(`${what} is not of this shared project (or not whole)`); }
  if (opened.kind !== CODE_KINDS[kind]) throw new Error(`not ${what}: ${opened.kind === CODE_KINDS.offer ? 'a follower\'s' : 'the owner\'s'} instead`);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(await through(new DecompressionStream('deflate-raw'), opened.bytes, SDP_MAX)); } catch { throw new Error(`${what} is broken`); }
}
