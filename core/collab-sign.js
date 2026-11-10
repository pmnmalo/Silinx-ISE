// An editor's signature (#3182, shared projects, phase 2: the roles enforced by keys). The owner's page makes a signing
// key pair per room (ECDSA P-256: Web Crypto has it in every browser and in Node); an editor's link carries its private
// half (core/collab-link.js), the room's owner gives its public half to the relay or host that runs the room
// (core/collab-room.js) and to every participant (in the project's document: core/collab-doc.js). An editor's change
// is a sealed frame (core/collab-crypto.js) with its signature after it, over the frame and the room: the relay or
// host forwards it, and each participant applies it, only when the signature is the room's.
//   signed frame = [kind][iv][ciphertext][signature (64 bytes)]
import { b64url } from './collab-crypto.js';

const subtle = () => globalThis.crypto.subtle;
const ALG = { name: 'ECDSA', namedCurve: 'P-256' }, HASH = { name: 'ECDSA', hash: 'SHA-256' };
export const SIG = 64;
export const SIGN_RE = /^[A-Za-z0-9_-]{129}$/;   // (the link's: the private scalar, then the public point's x and y)
export const PUB_RE = /^[A-Za-z0-9_-]{86}$/;     // (the public point's x and y)
const part = (t, i) => t.slice(43 * i, 43 * (i + 1));
const message = (room, frame) => {
  const head = new TextEncoder().encode(`silinx-collab:edit:${room}:`);
  const out = new Uint8Array(head.length + frame.length);
  out.set(head);
  out.set(frame, head.length);
  return out;
};

/** A room's new signing key: { key (to sign), text (the editor link's), pub (its public half's text) }. */
export async function newSigner() {
  const pair = await subtle().generateKey(ALG, true, ['sign', 'verify']);
  const j = await subtle().exportKey('jwk', pair.privateKey);
  return { key: pair.privateKey, text: `${j.d}${j.x}${j.y}`, pub: `${j.x}${j.y}` };
}

/** The public half of an editor link's key. */
export const pubOf = text => (SIGN_RE.test(String(text)) ? text.slice(43) : null);

/** The signing key of an editor link's text (an error for one that is not). */
export async function signerOf(text) {
  if (!SIGN_RE.test(String(text))) throw new Error('the editor link\'s key is not valid');
  return subtle().importKey('jwk', { kty: 'EC', crv: 'P-256', d: part(text, 0), x: part(text, 1), y: part(text, 2), ext: false }, ALG, false, ['sign']);
}

/** The key that checks a room's signatures (an error for a public half that is not one). */
export async function verifierOf(pub) {
  if (!PUB_RE.test(String(pub))) throw new Error('the room\'s editors\' key is not valid');
  try { return await subtle().importKey('jwk', { kty: 'EC', crv: 'P-256', x: part(pub, 0), y: part(pub, 1), ext: true }, ALG, false, ['verify']); }
  catch { throw new Error('the room\'s editors\' key is not valid'); }
}

/** A sealed frame signed: the frame and its signature. */
export async function signFrame(key, room, frame) {
  const sig = new Uint8Array(await subtle().sign(HASH, key, message(room, frame)));
  const out = new Uint8Array(frame.length + SIG);
  out.set(frame);
  out.set(sig, frame.length);
  return out;
}

/** A signed frame checked: the frame without its signature, or null when the signature is not the room's. */
export async function verifyFrame(key, room, signed) {
  const s = signed instanceof Uint8Array ? signed : new Uint8Array(signed);
  if (s.length <= SIG) return null;
  const frame = s.subarray(0, s.length - SIG);
  try { return (await subtle().verify(HASH, key, s.subarray(s.length - SIG), message(room, frame))) ? frame : null; } catch { return null; }
}

export { b64url };
