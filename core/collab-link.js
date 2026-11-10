// A shared project's link (#3181): the address of Silinx that serves the relay, and in its fragment the room and its
// key (core/collab-crypto.js); the fragment never reaches a server.
//   <Silinx's address>/#follow=<room>.<key>
import { KEY_RE } from './collab-crypto.js';

export const ROOM_RE = /^[A-Za-z0-9_-]{22}$/;   // (128 bits, base64url)

/** The link that follows a room. */
export function followLink(base, room, key) {
  if (!ROOM_RE.test(room) || !KEY_RE.test(key)) throw new Error('not a room and its key');
  const u = new URL(base);
  u.hash = `follow=${room}.${key}`;
  u.search = '';
  return u.href;
}

/** A link's (or an address's hash's) room: { base (the address without its fragment), room, key }, or null when it is
 *  not a link to follow; an error when it is one but broken. */
export function parseFollowLink(text) {
  const s = String(text || '').trim();
  const at = s.indexOf('#');
  const hash = at >= 0 ? s.slice(at + 1) : '';
  if (!/^follow=/.test(hash)) return null;
  const m = /^follow=([^.&]+)\.([^.&]+)$/.exec(hash);
  if (!m || !ROOM_RE.test(m[1]) || !KEY_RE.test(m[2])) throw new Error('the link to follow is broken (copy it again from the owner\'s Share Project)');
  return { base: at > 0 ? s.slice(0, at) : null, room: m[1], key: m[2] };
}

/** The relay's WebSocket address of a Silinx address (http -> ws, https -> wss), for a role: 'share' (the owner's) or
 *  'follow' (a follower's). */
export function relayUrl(base, role) {
  if (role !== 'share' && role !== 'follow') throw new Error(`relayUrl: a role, share or follow (not ${role})`);
  const u = new URL(base);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = `/api/collab/${role}`;
  u.search = '';
  u.hash = '';
  return u.href;
}
