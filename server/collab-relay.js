// The relay of shared projects (#3180, #3181): a WebSocket at /api/collab of Silinx's own server, which forwards a
// room's sealed messages (core/collab-client.js) between its owner and its followers. It reads none of them (they are
// encrypted with the link's key, which it never sees) and reaches no project, no file, no route of the API: a shared
// link gives what the owner's page sends, nothing else. What it checks:
// - opening a room needs the server's token (the owner is this server's user); joining one needs its room id;
// - only the owner's updates are forwarded: a follower's are dropped and answered with an error (read only), only
//   their awareness (who they are, what they look at) goes through;
// - frames: RELAY_LIMITS (the owner's, a follower's), followers per room, rooms per server;
// - a room ends with its owner (stopping sharing, or the connection lost): its followers are told and closed.
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { KIND, PROTOCOL } from '../core/collab-client.js';

export const RELAY_PATH = '/api/collab';
export const RELAY_LIMITS = Object.freeze({ ownerFrame: 16 << 20, followerFrame: 64 << 10, followers: 64, rooms: 32, helloWait: 10_000, ping: 30_000 });

const json = (ws, msg) => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
const fail = (ws, message) => { json(ws, { type: 'error', message }); ws.close(1008, 'refused'); };
const clientId = v => (Number.isSafeInteger(v) && v >= 0 ? v : null);

/**
 * The relay on an HTTP server: `allowed(req)` says why an upgrade is refused (null: accepted, the API's checks of
 * its host and origin); `tokenOk(token)`, whether a token opens a room. Returns { rooms (Map), close() }.
 */
export function attachRelay(server, { allowed = () => null, tokenOk = () => true, limits = RELAY_LIMITS } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: limits.ownerFrame, perMessageDeflate: false });
  const rooms = new Map();   // room -> { owner, ownerClient, followers: Map<ws, client> }

  server.on('upgrade', (req, socket, head) => {
    let pathname = '';
    try { pathname = new URL(req.url, 'http://relay').pathname; } catch { /* a bad address */ }
    const why = pathname === RELAY_PATH ? allowed(req) : 'not found';
    if (why) { socket.end(`HTTP/1.1 ${why === 'not found' ? '404 Not Found' : '403 Forbidden'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); return; }
    wss.handleUpgrade(req, socket, head, ws => welcome(ws));
  });

  function closeRoom(id, reason) {
    const r = rooms.get(id);
    if (!r) return;
    rooms.delete(id);
    for (const ws of r.followers.keys()) { json(ws, { type: 'closed', reason }); ws.close(1000, 'closed'); }
    if (r.owner.readyState === 1) r.owner.close(1000, 'closed');
  }

  function welcome(ws) {
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
        if (msg.type === 'open') {
          if (!tokenOk(msg.token)) return fail(ws, 'sharing a project needs this Silinx server\'s token');
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
      // a follower: their awareness only, small; an edit is refused (read only, #3181)
      if (data.length > limits.followerFrame) return json(ws, { type: 'error', message: 'a message too large for a follower' });
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
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, limits.ping);
  beat.unref?.();
  server.on('close', () => { clearInterval(beat); for (const id of [...rooms.keys()]) closeRoom(id, 'the Silinx server stopped'); wss.close(); });
  return { rooms, close: () => { clearInterval(beat); for (const id of [...rooms.keys()]) closeRoom(id, 'the Silinx server stopped'); wss.close(); } };
}
