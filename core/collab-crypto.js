// A shared project's end-to-end encryption (#3180, #3181): every message of a room (the project's Yjs updates, the
// participants' awareness) is sealed with the room's key, an AES-GCM 256 key made in the owner's page and given in the
// link's fragment only (core/collab-link.js), so the relay that forwards them (server/collab-relay.js, a hosted one
// later) sees opaque bytes and their kind, never a file. The same code in the browser and in Node (Web Crypto).
//   frame = [kind (1 byte)][iv (12 bytes)][ciphertext]   the kind and the room authenticated with it (AES-GCM's
//                                                         additional data): a frame cannot change kind nor room
const subtle = () => globalThis.crypto.subtle;
const ALG = 'AES-GCM';
const IV = 12;
export const KEY_RE = /^[A-Za-z0-9_-]{43}$/;   // (32 bytes, base64url, no padding)

const b64url = bytes => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));
const aad = (kind, room) => new TextEncoder().encode(`silinx-collab:${kind}:${room}`);

/** A new room key: { key (CryptoKey), text (base64url, the link's) }. */
export async function newKey() {
  const key = await subtle().generateKey({ name: ALG, length: 256 }, true, ['encrypt', 'decrypt']);
  return { key, text: b64url(new Uint8Array(await subtle().exportKey('raw', key))) };
}

/** The key of a link's text (an error for one that is not a key). */
export async function keyOf(text) {
  if (typeof text !== 'string' || !KEY_RE.test(text)) throw new Error('the link\'s key is not valid');
  return subtle().importKey('raw', unb64url(text), { name: ALG }, false, ['encrypt', 'decrypt']);
}

/** A message sealed: its frame (Uint8Array). */
export async function seal(key, room, kind, bytes) {
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV));
  const ct = new Uint8Array(await subtle().encrypt({ name: ALG, iv, additionalData: aad(kind, room) }, key, bytes));
  const out = new Uint8Array(1 + IV + ct.length);
  out[0] = kind;
  out.set(iv, 1);
  out.set(ct, 1 + IV);
  return out;
}

/** A frame opened: { kind, bytes } (an error when it was not sealed with this key for this room). */
export async function unseal(key, room, frame) {
  const f = frame instanceof Uint8Array ? frame : new Uint8Array(frame);
  if (f.length < 1 + IV + 16) throw new Error('a message too short');
  const kind = f[0];
  try {
    const bytes = new Uint8Array(await subtle().decrypt({ name: ALG, iv: f.subarray(1, 1 + IV), additionalData: aad(kind, room) }, key, f.subarray(1 + IV)));
    return { kind, bytes };
  } catch { throw new Error('a message that the link\'s key does not open'); }
}
