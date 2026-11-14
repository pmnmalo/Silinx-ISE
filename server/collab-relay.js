// The relay of shared projects (#3180, #3181): WebSockets at /api/collab/share (the owner) and /api/collab/follow (a
// follower) of Silinx's own server, which run a project's room (core/collab-room.js, the owner's page's too in the
// browser edition, #3227) over them. It reads none of the room's messages (they are encrypted with the link's key,
// which it never sees) and reaches no project, no file, no route of the API: a shared link gives what the owner's page
// sends, nothing else. What it checks, its room's checks besides:
// - opening a room needs the server's token (the owner is this server's user), checked before the WebSocket is
//   accepted (in its subprotocols: `silinx-collab`, `token.<token>`); joining one needs its room id;
// - frames: RELAY_LIMITS, by role: each endpoint its own maximum, so a follower's frame larger than theirs closes its
//   connection (1009) before it is received whole, and only a token opens a socket that takes the owner's;
// - a connection that no longer answers its pings: closed (an owner's room kept RELAY_LIMITS.grace for its resume,
//   #3835, then closed).
import { WebSocketServer } from 'ws';
import { SUBPROTOCOL } from '../core/collab-client.js';
import { collabRooms, fail, ROOM_LIMITS } from '../core/collab-room.js';

const RELAY_PATH = '/api/collab';
export { SUBPROTOCOL };
// (grace: an owner's connection lost, its room kept that long for its resume, #3835)
export const RELAY_LIMITS = Object.freeze({ ownerFrame: 16 << 20, followerFrame: 64 << 10, ...ROOM_LIMITS, ping: 30_000, grace: 120_000 });
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
  const host = collabRooms({ limits });
  const { rooms, closeRoom } = host;

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

  function welcome(ws, role) {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    const p = host.welcome(ws, role);
    ws.on('message', p.message);
    ws.on('close', p.close);
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
