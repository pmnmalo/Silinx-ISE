// A shared project's participants (#3180, #3181), in the page and in the MCP server alike: the owner, who shares a
// project's Yjs document (core/collab-doc.js), and a follower, who receives it read only. Both talk to a relay
// (server/collab-relay.js) over a WebSocket:
//   text frames, JSON, the control:  { type: 'open', token, client } -> { type: 'opened', room }   (the owner)
//                                    { type: 'join', room, client }  -> { type: 'joined', owner }  (a follower; the
//                                                                       owner's client id)
//                                    the relay's { type: 'join' | 'leave', client }, { type: 'closed', reason },
//                                    { type: 'error', message }; the owner's { type: 'close' }
//   binary frames, sealed (core/collab-crypto.js): KIND.update (a Yjs update: the owner's only, the relay drops a
//                                    follower's), KIND.awareness (y-protocols' awareness: who is in, their view)
// The relay never reads them: a hosted one, for the browser edition, can be the same.
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import { newKey, keyOf, seal, unseal } from './collab-crypto.js';

export const PROTOCOL = 1;
export const KIND = Object.freeze({ update: 1, awareness: 2 });
/** The colours of the participants, by their client id. */
export const COLORS = ['#d9480f', '#1971c2', '#2f9e44', '#9c36b5', '#e8590c', '#0c8599', '#c2255c', '#5c940d'];
export const colorOf = client => COLORS[Math.abs(Number(client) || 0) % COLORS.length];
const OPEN_WAIT = 10_000;

function connection(url, WS, onControl, onFrame) {
  const ws = new WS(url);
  ws.binaryType = 'arraybuffer';
  let chain = Promise.resolve();   // (frames opened in their order: unsealing is asynchronous)
  ws.addEventListener('message', ev => {
    if (typeof ev.data === 'string') {
      let msg = null;
      try { msg = JSON.parse(ev.data); } catch { /* not ours */ }
      if (msg && typeof msg.type === 'string') chain = chain.then(() => onControl(msg));
    } else chain = chain.then(() => onFrame(new Uint8Array(ev.data))).catch(() => {});
  });
  const opened = new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', () => reject(new Error(`cannot reach the relay at ${url}`)), { once: true });
  });
  let out = Promise.resolve();   // (sent in their order too)
  return {
    ws, opened,
    control: msg => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); },
    frame: make => { out = out.then(make).then(f => { if (f && ws.readyState === 1) ws.send(f); }).catch(() => {}); return out; },
  };
}

// the first answer of the relay to an open or a join (its error: thrown)
function firstAnswer(c, want) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('the relay does not answer')), OPEN_WAIT);
    c.first = msg => {
      if (msg.type === want) { clearTimeout(t); resolve(msg); return true; }
      if (msg.type === 'error' || msg.type === 'closed') { clearTimeout(t); reject(new Error(msg.message || msg.reason || 'refused by the relay')); return true; }
      return false;
    };
    c.ws.addEventListener('close', () => { clearTimeout(t); reject(new Error('the relay closed the connection')); }, { once: true });
  });
}

// the participants an awareness knows but `self`: [{ client, name, color, role, view }]; the owner is the client the
// relay says (a follower's own state could claim the role)
function peersOf(awareness, owner) {
  const out = [];
  for (const [client, st] of awareness.getStates()) {
    if (client === awareness.clientID || !st?.user) continue;
    out.push({ client, name: String(st.user.name || '').slice(0, 64) || '?', color: colorOf(client), role: client === owner ? 'owner' : 'follower', view: viewOf(st.view) });
  }
  return out.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.name.localeCompare(b.name)));
}
const viewOf = v => (v && typeof v.path === 'string' ? { path: v.path, line: Number.isInteger(v.line) ? v.line : null, ch: Number.isInteger(v.ch) ? v.ch : null } : null);

function participant({ c, room, key, doc, awareness, owner, onEvent }) {
  const send = (kind, bytes) => c.frame(() => seal(key, room, kind, bytes));
  awareness.on('update', ({ added, updated, removed }, origin) => {
    if (origin === 'local') send(KIND.awareness, encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]));
  });
  awareness.on('change', () => onEvent({ type: 'peers' }));
  c.ws.addEventListener('close', () => { awareness.destroy(); onEvent({ type: 'closed', reason: c.closedReason || 'the connection to the relay ended' }); }, { once: true });
  return {
    room, doc, awareness,
    send,
    /** The participants but this one: [{ client, name, color, role, view: { path, line, ch } | null }]. */
    peers: () => peersOf(awareness, owner),
    /** What this participant looks at (null: nothing open). */
    setView: view => {
      const v = viewOf(view), st = awareness.getLocalState();
      if (JSON.stringify(st?.view ?? null) !== JSON.stringify(v)) awareness.setLocalStateField('view', v);
    },
    closed: () => c.ws.readyState >= 2,
  };
}

/** The owner shares `doc`: the room opened on the relay at `url` ({ type: 'open' } with the server's token).
 *  Returns { room, key (the link's), peers(), setView(), close(), ... }. onEvent({ type: 'peers' | 'closed' |
 *  'error', ... }). */
export async function shareRoom({ url, token = null, doc, user, WebSocket: WS = globalThis.WebSocket, onEvent = () => {} }) {
  const { key, text } = await newKey();
  const awareness = new Awareness(doc);
  awareness.setLocalState({ user, role: 'owner', view: null });
  let p = null;
  const c = connection(url, WS, async msg => {
    if (c.first?.(msg)) { c.first = null; return; }
    if (msg.type === 'join') {   // (someone joined: the whole document and who is in, for them)
      await p.send(KIND.update, Y.encodeStateAsUpdate(doc));
      await p.send(KIND.awareness, encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()]));
    } else if (msg.type === 'leave') removeAwarenessStates(awareness, [Number(msg.client)], 'relay');
    else if (msg.type === 'closed') c.closedReason = msg.reason;
    else if (msg.type === 'error') onEvent({ type: 'error', message: String(msg.message || '') });
  }, async frame => {
    const { kind, bytes } = await unseal(key, p.room, frame);
    if (kind === KIND.awareness) applyAwarenessUpdate(awareness, bytes, 'remote');   // (a follower's update: never applied)
  });
  try { await c.opened; } catch (e) { awareness.destroy(); throw e; }
  const answer = firstAnswer(c, 'opened');
  c.control({ type: 'open', v: PROTOCOL, token, client: doc.clientID });
  let room;
  try { ({ room } = await answer); } catch (e) { awareness.destroy(); c.ws.close(); throw e; }
  p = participant({ c, room, key, doc, awareness, owner: doc.clientID, onEvent });
  const onUpdate = (u, origin) => { if (origin !== 'remote') p.send(KIND.update, u); };
  doc.on('update', onUpdate);
  c.ws.addEventListener('close', () => doc.off('update', onUpdate), { once: true });
  return {
    ...p, key: text,
    /** Stops sharing: the room closed for everyone. */
    close: async () => { c.closedReason = 'sharing stopped'; c.control({ type: 'close' }); await c.frame(() => null); c.ws.close(); },
  };
}

/** A follower joins a room with its link's key: { doc (the project, as it arrives), ready (resolves once it has
 *  arrived), peers(), owner(), setView(), close() }. Read only: nothing it does reaches the owner but its view. */
export async function followRoom({ url, room, key: keyText, user, WebSocket: WS = globalThis.WebSocket, onEvent = () => {} }) {
  const key = await keyOf(keyText);
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  awareness.setLocalState({ user, role: 'follower', view: null });
  let synced, failed = null;
  const ready = new Promise((resolve, reject) => { synced = resolve; failed = reject; });
  ready.catch(() => {});
  let warned = false;
  const c = connection(url, WS, msg => {
    if (c.first?.(msg)) { c.first = null; return; }
    if (msg.type === 'leave') removeAwarenessStates(awareness, [Number(msg.client)], 'relay');
    else if (msg.type === 'closed') c.closedReason = msg.reason;
    else if (msg.type === 'error') onEvent({ type: 'error', message: String(msg.message || '') });
  }, async frame => {
    let m;
    try { m = await unseal(key, room, frame); } catch (e) {
      if (!warned) { warned = true; onEvent({ type: 'error', message: e.message }); failed(e); }
      return;
    }
    if (m.kind === KIND.update) { Y.applyUpdate(doc, m.bytes, 'remote'); synced(); }
    else if (m.kind === KIND.awareness) applyAwarenessUpdate(awareness, m.bytes, 'remote');
  });
  try { await c.opened; } catch (e) { awareness.destroy(); throw e; }
  const answer = firstAnswer(c, 'joined');
  c.control({ type: 'join', v: PROTOCOL, room, client: doc.clientID });
  let owner;
  try { ({ owner } = await answer); } catch (e) { awareness.destroy(); c.ws.close(); throw e; }
  const p = participant({ c, room, key, doc, awareness, owner: Number(owner), onEvent });
  c.ws.addEventListener('close', () => failed(new Error(c.closedReason || 'the connection to the relay ended')), { once: true });
  p.send(KIND.awareness, encodeAwarenessUpdate(awareness, [doc.clientID]));
  return {
    ...p, ready,
    owner: () => p.peers().find(x => x.role === 'owner') || null,
    close: async () => { await c.frame(() => null); c.ws.close(); },
  };
}
