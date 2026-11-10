// A shared project's link (#3181): the address of Silinx that serves the relay, and in its fragment the room and its
// key (core/collab-crypto.js); the fragment never reaches a server. A room the owner's page hosts (#3227, the browser
// edition: no relay) says so, `.host`: the follower's page reaches it over WebRTC (web/js/collab-host.js).
//   <Silinx's address>/#follow=<room>.<key>        <Silinx's address>/#follow=<room>.<key>.host
// An editor's link (#3182) also carries the room's signing key (core/collab-sign.js): its changes are the room's.
//   <Silinx's address>/#edit=<room>.<key>.<signing key>[.host]
// A hosted room found at the public meeting point (core/collab-meet.js) carries the owner's public key after `.host`,
// which tells the owner from the other pages that have the link: …#follow=<room>.<key>.host.<owner's key>.
import { KEY_RE } from './collab-crypto.js';
import { SIGN_RE, PUB_RE } from './collab-sign.js';

export const ROOM_RE = /^[A-Za-z0-9_-]{22}$/;   // (128 bits, base64url)

export const VIAS = Object.freeze(['relay', 'host']);

/** The link that follows a room (via: 'relay', its server's; 'host', the owner's page); with `sign`, an editor's;
 *  with `host` (via 'host'), the owner's public key, for the meeting point. */
export function followLink(base, room, key, via = 'relay', sign = null, host = null) {
  if (!ROOM_RE.test(room) || !KEY_RE.test(key)) throw new Error('not a room and its key');
  if (!VIAS.includes(via)) throw new Error(`a room is reached through a relay or its host (not ${via})`);
  if (sign !== null && !SIGN_RE.test(sign)) throw new Error('not an editor\'s key');
  if (host !== null && (via !== 'host' || !PUB_RE.test(host))) throw new Error('not an owner\'s key of a hosted room');
  const u = new URL(base);
  u.hash = `${sign ? 'edit' : 'follow'}=${room}.${key}${sign ? `.${sign}` : ''}${via === 'host' ? '.host' : ''}${host ? `.${host}` : ''}`;
  u.search = '';
  return u.href;
}

/** A link's (or an address's hash's) room: { base (the address without its fragment), room, key, via, sign (an
 *  editor's link's key, or null), host (a hosted room's owner's key, or null) }, or null when it is not a link to follow; an error when it is one but broken. */
export function parseFollowLink(text) {
  const s = String(text || '').trim();
  const at = s.indexOf('#');
  const hash = at >= 0 ? s.slice(at + 1) : '';
  if (!/^(follow|edit)=/.test(hash)) return null;
  const m = /^(follow|edit)=([^.&]+)\.([^.&]+)(?:\.([^.&]+))??(\.host(?:\.([^.&]+))?)?$/.exec(hash);
  const sign = m?.[1] === 'edit' ? m[4] : null;
  if (!m || !ROOM_RE.test(m[2]) || !KEY_RE.test(m[3]) || (m[1] === 'edit' ? !SIGN_RE.test(sign || '') : m[4] !== undefined) || (m[6] !== undefined && !PUB_RE.test(m[6]))) throw new Error('the link to follow is broken (copy it again from the owner\'s Share Project)');
  return { base: at > 0 ? s.slice(0, at) : null, room: m[2], key: m[3], via: m[5] ? 'host' : 'relay', sign, host: m[6] ?? null };
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
