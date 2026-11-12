// A shared project's link (#3181): the address of Silinx that serves the relay, and in its fragment the room and its
// key (core/collab-crypto.js); the fragment never reaches a server. A room the owner's page hosts (#3227, the browser
// edition: no relay) says so, `.host`: the follower's page reaches it over WebRTC (web/js/collab-host.js).
//   <Silinx's address>/#follow=<room>.<key>        <Silinx's address>/#follow=<room>.<key>.host
// An editor's link (#3182) also carries the room's signing key (core/collab-sign.js): its changes are the room's.
//   <Silinx's address>/#edit=<room>.<key>.<signing key>[.host]
// A room on another Silinx's relay (#3227: the browser edition through a relay in its settings) says which:
//   <Silinx's address>/#follow=<room>.<key>&relay=<the relay's address, its origin, http(s)>
// A hosted room found at the public meeting point (core/collab-meet.js) carries the owner's public key after `.host`,
// which tells the owner from the other pages that have the link: …#follow=<room>.<key>.host.<owner's key>.
// A module's link (#3631, Share Module…) names the module its follower opens on, last: …#follow=…&top=<module>.
import { KEY_RE } from './collab-crypto.js';
import { SIGN_RE, PUB_RE } from './collab-sign.js';
import { MODULE_RE } from './design-link.js';

export const ROOM_RE = /^[A-Za-z0-9_-]{22}$/;   // (128 bits, base64url)

export const VIAS = Object.freeze(['relay', 'host']);

/** A relay's address as a link carries it: its origin, http(s), no user nor password; null when it is not one. */
export function relayAddress(text) {
  let u;
  try { u = new URL(String(text ?? '')); } catch { return null; }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password) return null;
  return u.origin;
}

/** A list of relays' addresses (origins, separated by commas or spaces), each once; an error (named `what`) for one
 *  that is not an http(s) origin. */
export function relayList(text = '', what = 'the relays') {
  const out = [];
  for (const t of String(text ?? '').split(/[\s,]+/).filter(Boolean)) {
    const r = relayAddress(t);
    if (!r) throw new Error(`${what}: not a relay's address (an http(s) origin): ${t}`);
    out.push(r);
  }
  return [...new Set(out)];
}

/** The link that follows a room (via: 'relay', its server's; 'host', the owner's page); with `sign`, an editor's; with
 *  `relay`, through that Silinx's relay (its address), not the link's own; with `host` (via 'host'), the owner's public
 *  key, for the meeting point. */
export function followLink(base, room, key, via = 'relay', sign = null, relay = null, host = null) {
  if (!ROOM_RE.test(room) || !KEY_RE.test(key)) throw new Error('not a room and its key');
  if (!VIAS.includes(via)) throw new Error(`a room is reached through a relay or its host (not ${via})`);
  if (sign !== null && !SIGN_RE.test(sign)) throw new Error('not an editor\'s key');
  const r = relay === null ? null : relayAddress(relay);
  if (relay !== null && (!r || via !== 'relay')) throw new Error(`not a relay's address: ${relay}`);
  if (host !== null && (via !== 'host' || !PUB_RE.test(host))) throw new Error('not an owner\'s key of a hosted room');
  const u = new URL(base);
  u.hash = `${sign ? 'edit' : 'follow'}=${room}.${key}${sign ? `.${sign}` : ''}${via === 'host' ? '.host' : ''}${host ? `.${host}` : ''}${r ? `&relay=${encodeURIComponent(r)}` : ''}`;
  u.search = '';
  return u.href;
}

/** A link to follow that opens on a module (Share Module…, #3631): the link with `&top=<module>` (one only). */
export function withTop(link, top) {
  if (!MODULE_RE.test(String(top ?? ''))) throw new Error(`'${String(top ?? '').slice(0, 64)}' is not a module name`);
  const l = parseFollowLink(link);
  if (!l) throw new Error('not a link to follow');
  return `${String(link).trim().replace(/&top=[^&]*$/, '')}&top=${top}`;
}

/** A link's (or an address's hash's) room: { base (the address without its fragment), room, key, via, sign (an
 *  editor's link's key, or null), relay (another Silinx's relay's address: only when the link names one), host (a
 *  hosted room's owner's key: only when the link carries one), top (the module it opens on: only when the link names
 *  one, #3631) }, or null when it is not a link to follow; an error when
 *  it is one but broken. */
export function parseFollowLink(text) {
  const s = String(text || '').trim();
  const at = s.indexOf('#');
  const hash = at >= 0 ? s.slice(at + 1) : '';
  if (!/^(follow|edit)=/.test(hash)) return null;
  const m = /^(follow|edit)=([^.&]+)\.([^.&]+)(?:\.([^.&]+))??(\.host(?:\.([^.&]+))?)?(?:&relay=([^&]+))?(?:&top=([^&]+))?$/.exec(hash);
  const sign = m?.[1] === 'edit' ? m[4] : null;
  let relay = null;
  if (m?.[7] !== undefined) { try { relay = relayAddress(decodeURIComponent(m[7])); } catch { relay = null; } }
  if (!m || !ROOM_RE.test(m[2]) || !KEY_RE.test(m[3]) || (m[1] === 'edit' ? !SIGN_RE.test(sign || '') : m[4] !== undefined) || (m[6] !== undefined && !PUB_RE.test(m[6])) || (m[7] !== undefined && (!relay || m[5])) || (m[8] !== undefined && !MODULE_RE.test(m[8]))) throw new Error('the link to follow is broken (copy it again from the owner\'s Share Project)');
  return { base: at > 0 ? s.slice(0, at) : null, room: m[2], key: m[3], via: m[5] ? 'host' : 'relay', sign, ...(relay ? { relay } : {}), ...(m[6] ? { host: m[6] } : {}), ...(m[8] ? { top: m[8] } : {}) };
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
