// The relay of shared projects (#3180, #3181): WebSockets at /api/collab/share (the owner) and /api/collab/follow (a
// follower) of Silinx's own server, which forward a
// room's sealed messages (core/collab-client.js) between its owner and its followers. It reads none of them (they are
// encrypted with the link's key, which it never sees) and reaches no project, no file, no route of the API: a shared
// link gives what the owner's page sends, nothing else. What it checks:
// - opening a room needs the server's token (the owner is this server's user), checked before the WebSocket is
//   accepted (in its subprotocols: `silinx-collab`, `token.<token>`); joining one needs its room id;
// - only the owner's updates are forwarded: a follower's are dropped and answered with an error (read only), only
//   their awareness (who they are, what they look at) goes through;
// - frames: RELAY_LIMITS, by role: each endpoint its own maximum, so a follower's frame larger than theirs closes its
//   connection (1009) before it is received whole, and only a token opens a socket that takes the owner's; followers
//   per room, rooms per server;
// - a room ends with its owner (stopping sharing, or the connection lost): its followers are told and closed.
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { KIND, PROTOCOL, SUBPROTOCOL } from '../core/collab-client.js';

export const RELAY_PATH = '/api/collab';
export { SUBPROTOCOL };
export const RELAY_LIMITS = Object.freeze({ ownerFrame: 16 << 20, followerFrame: 64 << 10, followers: 64, rooms: 32, helloWait: 10_000, ping: 30_000 });

const json = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const fail = (ws, message) => { json(ws, { type: 'error', message }); ws.close(1008, 'refused'); };
const clientId = v => (Number.isSafeInteger(v) && v >= 0 ? v : null);
// the token an owner's upgrade carries in its subprotocols (`token.<token>`), or null
const tokenOfUpgrade = req => String(req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim()).find(s => s.startsWith('token.'))?.slice(6) || null;
const ROLES = { [`${RELAY_PATH}/share`]: 'owner', [`${RELAY_PATH}/follow`]: 'follower' };

/**
 * The relay on an HTTP server: `allowed(req)` says why an upgrade is refused (null: accepted, the API's checks of
 * its host and origin); `tokenOk(token)`, whether a token opens a room. Returns { rooms (Map), close() }.
 */
export function attachRelay(server, { allowed = () => null, tokenOk = () => true, limits = RELAY_LIMITS } = {}) {
  const handleProtocols = ps => (ps.has(SUBPROTOCOL) ? SUBPROTOCOL : false);
  const servers = {
    owner: new WebSocketServer({ noServer: true, maxPayload: limits.ownerFrame, perMessageDeflate: false, handleProtocols }),
    follower: new WebSocketServer({ noServer: true, maxPayload: limits.followerFrame, perMessageDeflate: false, handleProtocols }),
  };
  const rooms = new Map();   // room -> { owner, ownerClient, followers: Map<ws, client> }

  server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try { pathname = new URL(req.url, 'http://relay').pathname; } catch { /* a bad address */ }
    const role = Object.hasOwn(ROLES, pathname) ? ROLES[pathname] : null;
    const why = role ? allowed(req) : 'not found';
    if (why) { socket.end(`HTTP/1.1 ${why === 'not found' ? '404 Not Found' : '403 Forbidden'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); return; }
    // (no token, or not this server's: refused on a follower's socket, its frames small, with the owner's message)
    if (role === 'owner' && !tokenOk(tokenOfUpgrade(req))) { servers.follower.handleUpgrade(req, socket, head, ws => fail(ws, 'sharing a project needs this Silinx server\'s token')); return; }
    servers[role].handleUpgrade(req, socket, head, ws => welcome(ws, role));
  });

  function closeRoom(id, reason) {
    const r = rooms.get(id);
    if (!r) return;
    rooms.delete(id);
    for (const ws of r.followers.keys()) { json(ws, { type: 'closed', reason }); ws.close(1000, 'closed'); }
    if (r.owner.readyState === 1) r.owner.close(1000, 'closed');
  }

  function welcome(ws, role) {
    let me = null;   // { role: 'owner' | 'follower', room, client }
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const hello = setTimeout(() => { if (!me) fail(ws, 'no open nor join'); }, limits.helloWait);
    ws.on('message', (data, binary) => {
      if (!me) {
        let msg = null;
        if (!binary) { try { msg = JSON.parse(String(data)); } catch { /* below */ } }
        if (!msg || msg.v !== PROTOCOL || clientId(msg.client) === null) return fail(ws, 'not a Silinx participant of this version');
        clearTimeout(hello);
        if (msg.type !== (role === 'owner' ? 'open' : 'join')) return fail(ws, 'not a Silinx participant of this version');
        if (msg.type === 'open') {
          if (rooms.size >= limits.rooms) return fail(ws, `this Silinx server shares ${limits.rooms} projects already`);
          const room = crypto.randomBytes(16).toString('base64url');
          rooms.set(room, { owner: ws, ownerClient: msg.client, followers: new Map() });
          me = { role: 'owner', room, client: msg.client };
          return json(ws, { type: 'opened', room });
        }
        if (msg.type === 'join') {
          const r = typeof msg.room === 'string' ? rooms.get(msg.room) : null;
          if (!r) return fail(ws, 'this shared project is no longer shared (its owner stopped sharing it)');
          if (r.followers.size >= limits.followers) return fail(ws, `this shared project has ${limits.followers} followers already`);
          r.followers.set(ws, msg.client);
          me = { role: 'follower', room: msg.room, client: msg.client };
          json(ws, { type: 'joined', owner: r.ownerClient });
          return json(r.owner, { type: 'join', client: msg.client });
        }
        return fail(ws, 'not a Silinx participant of this version');
      }
      const r = rooms.get(me.room);
      if (!r) return;
      if (me.role === 'owner') {
        if (!binary) { let msg = null; try { msg = JSON.parse(String(data)); } catch { /* ignored */ } if (msg?.type === 'close') closeRoom(me.room, 'the owner stopped sharing'); return; }
        for (const f of r.followers.keys()) if (f.readyState === 1) f.send(data, { binary: true });
        return;
      }
      if (!binary) return;
      // a follower: their awareness only (small: their endpoint's maximum); an edit is refused (read only, #3181)
      if (data[0] !== KIND.awareness) return json(ws, { type: 'error', message: 'read only: a follower cannot change the shared project' });
      for (const other of [r.owner, ...r.followers.keys()]) if (other !== ws && other.readyState === 1) other.send(data, { binary: true });
    });
    ws.on('close', () => {
      clearTimeout(hello);
      if (!me) return;
      if (me.role === 'owner') return closeRoom(me.room, 'the owner stopped sharing');
      const r = rooms.get(me.room);
      if (!r || !r.followers.delete(ws)) return;
      for (const other of [r.owner, ...r.followers.keys()]) json(other, { type: 'leave', client: me.client });
    });
    ws.on('error', () => {});
  }

  // (a connection that no longer answers: closed, its room's owner too)
  const beat = setInterval(() => {
    for (const ws of [...servers.owner.clients, ...servers.follower.clients]) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, limits.ping);
  beat.unref?.();
  const close = () => { clearInterval(beat); for (const id of [...rooms.keys()]) closeRoom(id, 'the Silinx server stopped'); servers.owner.close(); servers.follower.close(); };
  server.on('close', close);
  return { rooms, close };
}
