// A shared project's participants (#3180, #3181), in the page and in the MCP server alike: the owner, who shares a
// project's Yjs document (core/collab-doc.js), and a follower, who receives it read only. Both talk to a relay
// (server/collab-relay.js) over a WebSocket:
// at its share endpoint (the owner: the server's token in the subprotocols, `silinx-collab`, `token.<token>`) or its
// follow endpoint (a follower: `silinx-collab`):
//   text frames, JSON, the control:  { type: 'open', client }        -> { type: 'opened', room }   (the owner)
//                                    { type: 'join', room, client }  -> { type: 'joined', owner }  (a follower; the
//                                                                       owner's client id)
//                                    the relay's { type: 'join' | 'leave', client }, { type: 'closed', reason },
//                                    { type: 'error', message }; the owner's { type: 'close' }
//   binary frames, sealed (core/collab-crypto.js): KIND.update (a Yjs update: the owner's only, the relay drops a
//                                    follower's), KIND.awareness (y-protocols' awareness: who is in, their view),
//                                    KIND.edit (an editor's Yjs update, signed with the editor link's key:
//                                    core/collab-sign.js; forwarded and applied only when its signature is the room's,
//                                    #3182; the room's public key in the owner's open, and in the document's meta),
//                                    KIND.from (#3360: a follower's awareness as the room forwards it, [KIND.from][its
//                                    client id, 4 bytes][the sealed frame]: the room's word for who sent it, so that a
//                                    follower's awareness speaks for that follower only), KIND.to (#3529: the owner's
//                                    frame for one follower, [KIND.to][its client id, 4 bytes][the sealed frame]: the
//                                    room gives the sealed frame to that follower only; the whole document a join asks
//                                    for, which the others have already)
// The relay never reads them: a hosted one, for the browser edition, can be the same.
import * as Y from 'yjs';
import { Awareness, encodeAwarenessUpdate, applyAwarenessUpdate, removeAwarenessStates } from 'y-protocols/awareness';
import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';
import { newKey, keyOf, seal, unseal } from './collab-crypto.js';
import { newSigner, signerOf, verifierOf, signFrame, verifyFrame } from './collab-sign.js';
import { docTooLarge, docMeter, editOutside, updateOutside, FOLLOW_LIMITS } from './collab-doc.js';

export const PROTOCOL = 4;   // (2: an editor's signed edits, #3182; 3: a follower's awareness marked with its sender, #3360; 4: the owner's frame for one follower, #3529)
export const SUBPROTOCOL = 'silinx-collab';   // (the WebSockets', server/collab-relay.js's)
export const KIND = Object.freeze({ update: 1, awareness: 2, edit: 3, from: 4, to: 5 });

/** A follower's frame as the room forwards it (#3360): marked with the client id it joined with. */
export function fromFrame(client, frame) {
  const out = new Uint8Array(frame.length + 5);
  out[0] = KIND.from;
  new DataView(out.buffer).setUint32(1, client);
  out.set(frame, 5);
  return out;
}

/** The owner's frame for one follower (#3529): the room gives `frame` to the follower of that client id only. */
export function toFrame(client, frame) {
  const out = fromFrame(client, frame);
  out[0] = KIND.to;
  return out;
}

/** A frame the room marked: { client, frame } (null: not one); kind KIND.to: the owner's frame for one follower. */
export function senderOf(frame, kind = KIND.from) {
  if (frame[0] !== kind || frame.length < 6) return null;
  return { client: new DataView(frame.buffer, frame.byteOffset).getUint32(1), frame: frame.subarray(5) };
}

/** An awareness update applied with only the states its sender may speak for (#3360): a follower's own (`only`, the
 *  client id the room says sent it), or any but this participant's own (the owner's, the room's authority: who is in
 *  for a newcomer); never this participant's own state. Returns the client ids applied. */
export function applyAwarenessFrom(awareness, update, only = null) {
  const d = decoding.createDecoder(update);
  const e = encoding.createEncoder();
  const kept = [];
  const entries = [];
  for (let n = decoding.readVarUint(d); n > 0; n--) {
    const client = decoding.readVarUint(d), clock = decoding.readVarUint(d), state = decoding.readVarString(d);
    if (client === awareness.clientID || (only !== null && client !== only)) continue;
    entries.push([client, clock, state]);
    kept.push(client);
  }
  if (!entries.length) return kept;
  encoding.writeVarUint(e, entries.length);
  for (const [client, clock, state] of entries) { encoding.writeVarUint(e, client); encoding.writeVarUint(e, clock); encoding.writeVarString(e, state); }
  applyAwarenessUpdate(awareness, encoding.toUint8Array(e), 'remote');
  return kept;
}
/** The colours of the participants, by their client id. */
export const COLORS = ['#d9480f', '#1971c2', '#2f9e44', '#9c36b5', '#e8590c', '#0c8599', '#c2255c', '#5c940d'];
export const colorOf = client => COLORS[Math.abs(Number(client) || 0) % COLORS.length];
const OPEN_WAIT = 10_000;

function connection(url, WS, protocols, onControl, onFrame) {
  const ws = new WS(url, protocols);
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
    // (closed before it opened, or not opened in time: #3835, a rejoin waits for neither)
    ws.addEventListener('close', () => reject(new Error(`cannot reach the relay at ${url}`)), { once: true });
    setTimeout(() => reject(new Error(`cannot reach the relay at ${url}`)), OPEN_WAIT).unref?.();
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
    // (an editor as it says: the room checks its edits, not its name)
    out.push({ client, name: String(st.user.name || '').slice(0, 64) || '?', color: colorOf(client), role: client === owner ? 'owner' : st.role === 'editor' ? 'editor' : 'follower', view: viewOf(st.view) });
  }
  return out.sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : a.name.localeCompare(b.name)));
}
const viewOf = v => (v && typeof v.path === 'string' ? { path: v.path, line: Number.isInteger(v.line) ? v.line : null, ch: Number.isInteger(v.ch) ? v.ch : null } : null);

function participant({ conn, room, key, doc, awareness, owner, onEvent }) {
  const send = (kind, bytes) => conn().frame(() => seal(key, room, kind, bytes));
  awareness.on('update', ({ added, updated, removed }, origin) => {
    if (origin === 'local') send(KIND.awareness, encodeAwarenessUpdate(awareness, [...added, ...updated, ...removed]));
  });
  awareness.on('change', () => onEvent({ type: 'peers' }));
  return {
    room, doc, awareness,
    send,
    /** A frame for one follower only (#3529: the room gives it to that client). */
    sendTo: (client, kind, bytes) => conn().frame(async () => toFrame(client, await seal(key, room, kind, bytes))),
    /** The participants but this one: [{ client, name, color, role, view: { path, line, ch } | null }]. */
    peers: () => peersOf(awareness, owner()),
    /** What this participant looks at (null: nothing open). */
    setView: view => {
      const v = viewOf(view), st = awareness.getLocalState();
      if (JSON.stringify(st?.view ?? null) !== JSON.stringify(v)) awareness.setLocalStateField('view', v);
    },
    closed: () => conn().ws.readyState >= 2,
    /** Once what this participant sent before is on its way. */
    flush: () => conn().frame(() => null),
  };
}

// an editor's edit, at its arrival: applied when its signature is the room's (the key: `verifier()`) and `admit(bytes)`
// (#3527: what it changes, its size)
async function applyEdit(doc, key, room, verifier, frame, admit = () => true) {
  const v = await verifier();
  const f = v && await verifyFrame(v, room, frame);
  if (!f) return false;
  const { bytes } = await unseal(key, room, f);
  if (!admit(bytes)) return false;
  Y.applyUpdate(doc, bytes, 'remote');
  return true;
}

/** The owner shares `doc`: the room opened on the relay at `url` (its share endpoint, with the server's token).
 *  Returns { room, key (the link's), editKey (an editor link's, with `editors`), peers(), setView(), close(), ... }.
 *  onEvent({ type: 'peers' | 'closed' | 'error', ... }). editors: editors may change it (their link signs, #3182); an
 *  editor's change refused (an error event) past `limits.total` or outside the files and the drawings (#3527). */
export async function shareRoom({ url, token = null, doc, user, editors = false, WebSocket: WS = globalThis.WebSocket, onEvent = () => {}, limits = FOLLOW_LIMITS }) {
  const { key, text } = await newKey();
  const signer = editors ? await newSigner() : null;
  // (the room's public key, for every participant: in the document)
  if (signer) doc.getMap('meta').set('editors', signer.pub); else doc.getMap('meta').delete('editors');
  const verifier = signer ? await verifierOf(signer.pub) : null;
  // (#3527: an editor's edit refused, said, when it changes another part than the files and the drawings, or would take
  // the document past what a follower takes)
  const meter = docMeter(doc);
  const admit = bytes => {
    const why = editOutside(doc, bytes) || meter.over(limits.total, bytes.length);
    if (why) { onEvent({ type: 'error', message: `an editor's change was refused: ${why}` }); return false; }
    meter.add(bytes.length);
    return true;
  };
  const awareness = new Awareness(doc);
  awareness.setLocalState({ user, role: 'owner', view: null });
  let p = null;
  const c = connection(url, WS, [SUBPROTOCOL, ...(token ? [`token.${token}`] : [])], async msg => {
    if (c.first?.(msg)) { c.first = null; return; }
    if (msg.type === 'join') {   // (someone joined: the whole document and who is in, for them only, #3529)
      const client = Number(msg.client);
      if (!Number.isSafeInteger(client) || client < 0 || client > 0xFFFFFFFF) return;
      await p.sendTo(client, KIND.update, Y.encodeStateAsUpdate(doc));
      await p.sendTo(client, KIND.awareness, encodeAwarenessUpdate(awareness, [...awareness.getStates().keys()]));
    } else if (msg.type === 'leave') removeAwarenessStates(awareness, [Number(msg.client)], 'relay');
    else if (msg.type === 'closed') c.closedReason = msg.reason;
    else if (msg.type === 'error') onEvent({ type: 'error', message: String(msg.message || '') });
  }, async frame => {
    if (frame[0] === KIND.edit) { await applyEdit(doc, key, p.room, () => verifier, frame, admit).catch(() => false); return; }
    // (a follower's awareness, marked by the room with who sent it: that follower's own state only, #3360; a follower's
    // update: never applied)
    const from = senderOf(frame);
    if (!from) return;
    const { kind, bytes } = await unseal(key, p.room, from.frame);
    if (kind === KIND.awareness) applyAwarenessFrom(awareness, bytes, from.client);
  });
  try { await c.opened; } catch (e) { awareness.destroy(); throw e; }
  const answer = firstAnswer(c, 'opened');
  c.control({ type: 'open', v: PROTOCOL, client: doc.clientID, ...(signer ? { editors: signer.pub } : {}) });
  let room;
  try { ({ room } = await answer); } catch (e) { awareness.destroy(); c.ws.close(); throw e; }
  p = participant({ conn: () => c, room, key, doc, awareness, owner: () => doc.clientID, onEvent });
  c.ws.addEventListener('close', () => { awareness.destroy(); onEvent({ type: 'closed', reason: c.closedReason || 'the connection to the relay ended' }); }, { once: true });
  const onUpdate = (u, origin) => { if (origin !== 'remote') p.send(KIND.update, u); };
  doc.on('update', onUpdate);
  c.ws.addEventListener('close', () => { doc.off('update', onUpdate); meter.stop(); }, { once: true });
  return {
    ...p, key: text, editKey: signer?.text || null,
    /** Stops sharing: the room closed for everyone. */
    close: async () => { c.closedReason = 'sharing stopped'; c.control({ type: 'close' }); await c.frame(() => null); c.ws.close(); },
  };
}


/** A room its owner no longer shares, as the room says it to a follower that joins (core/collab-room.js). */
export const NOT_SHARED = 'this shared project is no longer shared (its owner stopped sharing it)';
/** A follower's connection lost (#3835, phase 4 of #3180), not ended, made again: after these delays (the last one
 *  repeated), for `for` ms at most since it was lost. */
export const RECONNECT = Object.freeze({ delays: [1000, 2000, 4000, 8000, 15_000], for: 5 * 60_000 });
// (the close codes of a connection the room ended itself: a refusal, a frame too large; never made again)
const REFUSED = [1003, 1008, 1009];

/** A follower joins a room with its link's key: { doc (the project, as it arrives), ready (resolves once it has
 *  arrived), peers(), owner(), setView(), connected(), close() }. Read only: nothing it does reaches the owner but its
 *  view. With `sign` (an editor link's key, #3182), an editor: what changes in its document (core/collab-doc.js
 *  editFile) is sent, signed, to everyone. A room whose document passes `limits` (its files, their total size:
 *  core/collab-doc.js FOLLOW_LIMITS, #3361; its bytes, a root of no shared project's, #3527) is left at once: an error
 *  event ({ fatal: true }), `ready` rejected, nothing more applied.
 *  Its connection lost once the project has arrived (#3835), not ended (the owner did not stop sharing, `close()` was
 *  not called, no limit was passed, the room did not refuse it: REFUSED), it is made again (`reconnect`: RECONNECT; false: never), with the same document
 *  and client id, through a new socket of `transport()` (a WebSocket class; null: none, the session ends; an error: tried
 *  again later; default: `WebSocket` again): an event { type: 'offline', reason } at its loss, { type: 'online' } once joined again. The owner
 *  sends the whole document again, as at any join; an editor then sends, signed, what of its own changes the owner's
 *  document lacks (its own updates past the owner's clock of it): nothing it changed meanwhile is lost. */
export async function followRoom({ url, room, key: keyText, sign = null, user, WebSocket: WS = globalThis.WebSocket, onEvent = () => {}, limits = FOLLOW_LIMITS, reconnect = RECONNECT, transport = null }) {
  const key = await keyOf(keyText);
  const signer = sign ? await signerOf(sign) : null;
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  awareness.setLocalState({ user, role: signer ? 'editor' : 'follower', view: null });
  // (the room's public key, from the owner's document: an editor's edit checked with it)
  let verifier = null, verifierPub = null;
  const verifierOfDoc = async () => {
    const pub = doc.getMap('meta').get('editors');
    if (pub !== verifierPub) { verifierPub = pub; verifier = typeof pub === 'string' ? await verifierOf(pub).catch(() => null) : null; }
    return verifier;
  };
  let synced, failed = null, arrived = false;
  const ready = new Promise((resolve, reject) => { synced = () => { arrived = true; resolve(); }; failed = reject; });
  ready.catch(() => {});
  let warned = false, left = false;
  let cur = null, owner = null;   // (the connection now; the owner's client id)
  let ended = null, stopped = false, lostAt = null, timer = null;   // (why it ended; close() called; since when lost)
  // (the document past what a follower takes: left, said once; #3527: its bytes, whatever they hold, the updates and
  // the edits received counted; an editor's edit the owner refuses, refused here too, not applied)
  const meter = docMeter(doc);
  const capped = (c, n = 0, why = null) => {
    meter.add(n);
    why ||= docTooLarge(doc, limits) || meter.over(limits.total);
    if (!why) return false;
    left = true;
    onEvent({ type: 'error', message: why, fatal: true });
    failed(new Error(why));
    c.closedReason = why;
    c.ws.close();
    return true;
  };
  // an editor's own changes, signed (what arrives is 'remote': never sent again), and kept (#3835: what of them the
  // owner lacks sent again at a rejoin, those sent into a connection that was already lost included)
  const mine = [];
  const sendEdit = u => cur.frame(async () => signFrame(signer, room, await seal(key, room, KIND.edit, u)));
  const onUpdate = (u, origin) => {
    if (origin === 'remote') return;
    mine.push(u);
    if (mine.length > 32) mine.splice(0, mine.length, Y.mergeUpdates(mine));
    sendEdit(u);
  };
  // (the whole document, as the owner sends it at a join: every client's from its start, the owner's first)
  const catchUp = bytes => {
    if (!signer || !mine.length) return;
    const { from, to } = Y.parseUpdateMeta(bytes);
    if (from.get(owner) !== 0) return;
    const theirs = Y.encodeStateVector(new Map([[doc.clientID, to.get(doc.clientID) ?? 0]]));
    sendEdit(Y.diffUpdate(Y.mergeUpdates(mine), theirs));
  };
  const control = (c, msg) => {
    if (c.first?.(msg)) { c.first = null; return; }
    if (msg.type === 'leave') removeAwarenessStates(awareness, [Number(msg.client)], 'relay');
    else if (msg.type === 'closed') c.closedReason = msg.reason;
    else if (msg.type === 'error') onEvent({ type: 'error', message: String(msg.message || '') });
  };
  const frameIn = async (c, frame) => {
    if (left || ended) return;
    if (frame[0] === KIND.edit) { let n = 0; if (await applyEdit(doc, key, room, verifierOfDoc, frame, b => { n = b.length; return !editOutside(doc, b) && !meter.over(limits.total, n); }).catch(() => false)) capped(c, n); return; }
    // (another follower's awareness, marked by the room with who sent it, #3360; anything else is the owner's)
    const from = senderOf(frame);
    let m;
    try { m = await unseal(key, room, from ? from.frame : frame); } catch (e) {
      if (!warned) { warned = true; onEvent({ type: 'error', message: e.message }); failed(e); }
      return;
    }
    if (from) { if (m.kind === KIND.awareness) applyAwarenessFrom(awareness, m.bytes, from.client); return; }
    if (m.kind === KIND.update) {
      // (#3527: an update that changes a root of no shared project's: left, not applied)
      const outside = updateOutside(doc, m.bytes);
      if (!outside) Y.applyUpdate(doc, m.bytes, 'remote');
      if (!capped(c, m.bytes.length, outside)) { synced(); if (!outside) catchUp(m.bytes); }
    }
    else if (m.kind === KIND.awareness) applyAwarenessFrom(awareness, m.bytes);   // (the owner's: who is in)
  };
  // a connection, joined: { c, owner }; its failure thrown (the relay's answer: its message)
  const join = async S => {
    const c = connection(url, S, [SUBPROTOCOL], msg => control(c, msg), f => frameIn(c, f));
    try { await c.opened; } catch (e) { c.ws.close?.(); throw e; }
    const answer = firstAnswer(c, 'joined');
    c.control({ type: 'join', v: PROTOCOL, room, client: doc.clientID });
    try { return { c, owner: Number((await answer).owner) }; } catch (e) { c.ws.close(); throw e; }
  };
  const end = reason => {
    if (ended) return;
    ended = reason;
    clearTimeout(timer);
    globalThis.removeEventListener?.('online', now);
    doc.off('update', onUpdate);
    awareness.destroy();
    failed(new Error(reason));
    onEvent({ type: 'closed', reason });
  };
  // the connection now: its end, an end of the session or a loss
  const use = c => {
    cur = c;
    c.ws.addEventListener('close', e => {
      if (c !== cur || ended) return;
      const why = c.closedReason || 'the connection to the relay ended';
      // (the room's own end of it, a refusal or a frame too large: never made again)
      if (stopped || left || c.closedReason || REFUSED.includes(e?.code) || !reconnect || !arrived) { end(why); return; }
      lostAt = Date.now();
      // (the others gone until the owner says again who is in: their clocks forgotten, so that their states, sent
      // again as they are, are taken)
      const others = [...awareness.getStates().keys()].filter(k => k !== doc.clientID);
      removeAwarenessStates(awareness, others, 'relay');
      for (const k of others) awareness.meta.delete(k);
      onEvent({ type: 'offline', reason: 'the connection to the relay was lost' });
      later(0);
    }, { once: true });
  };
  const minutes = ms => `${Math.round(ms / 60_000)} minute${Math.round(ms / 60_000) === 1 ? '' : 's'}`;
  const later = n => {
    const ms = reconnect.delays[Math.min(n, reconnect.delays.length - 1)];
    if (Date.now() + ms - lostAt > reconnect.for) { end(`the connection was lost and could not be made again in ${minutes(reconnect.for)}`); return; }
    timer = setTimeout(() => { timer = null; attempt(n); }, ms);
  };
  async function attempt(n) {
    let S = null;
    // (a transport that fails, the owner not found at the meeting point yet: tried again later; none: the end)
    try { S = transport ? await transport() : WS; } catch { if (!ended) later(n + 1); return; }
    if (ended) return;
    if (!S) { end('the connection was lost and cannot be made again from here'); return; }
    let j;
    try { j = await join(S); } catch (e) {
      if (ended) return;
      if (e.message === NOT_SHARED) end(NOT_SHARED); else later(n + 1);
      return;
    }
    if (ended) { j.c.ws.close(); return; }
    lostAt = null;
    use(j.c);
    // (this participant's state, its clock past the one the others knew: theirs, removed at its leave, taken again)
    awareness.setLocalState({ ...awareness.getLocalState() });
    onEvent({ type: 'online' });
  }
  // (the browser back online: the next try at once)
  function now() { if (timer !== null) { clearTimeout(timer); timer = null; attempt(0); } }
  let first;
  try { first = await join(WS); } catch (e) { awareness.destroy(); throw e; }
  owner = first.owner;
  const p = participant({ conn: () => cur, room, key, doc, awareness, owner: () => owner, onEvent });
  use(first.c);
  if (reconnect) globalThis.addEventListener?.('online', now);
  p.send(KIND.awareness, encodeAwarenessUpdate(awareness, [doc.clientID]));
  if (signer) doc.on('update', onUpdate);
  return {
    ...p, ready, editor: !!signer,
    owner: () => p.peers().find(x => x.role === 'owner') || null,
    closed: () => ended !== null,
    /** Joined now (false: its connection lost, being made again, or the session ended). */
    connected: () => !ended && lostAt === null,
    close: async () => {
      stopped = true;
      if (lostAt !== null) { end('the connection to the relay ended'); return; }
      await cur.frame(() => null);
      cur.ws.close();
    },
  };
}
