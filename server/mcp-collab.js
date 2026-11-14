// The MCP server's tools of a shared project (#3181, server/mcp.js, #2674), as the interface's Share Project… and the
// opening of a link to follow: share_project shares a project of the workspace live, read only, through the relay of
// a running Silinx server (server/collab-relay.js; its token read as a second launch reads it, server/server.js
// tokenFile), its files published from the disk and kept as they change (the project watcher, #2843);
// follow_project follows a link, read only, and gives the project's files, who is in it, the owner's view and a file's
// text. Both through core/collab-*.js, the page's own modules: the document, the encryption, the protocol. With editors
// (#3182): share_project gives an editor's link too, and writes what an editor changes in a text file to the disk
// (through the import gate, the project untrusted, #3355; anything else an editor changes undone: the project published
// again from the disk); follow_project with an editor's
// link writes a file's text, merged as one participant's edit. The drawings edited live (#3183, every drawing: state diagrams, truth tables, ASM charts, Petri nets, schematics):
// share_project writes what an editor changes in one to the disk (the gate, the project untrusted) and its HDL made again
// from it; follow_project reads one as merged (and its Check), and writes one as this participant's edit, merged per
// object and per field with the others' (core/collab-model.js). A follow's connection lost is made again (#3835): its
// result says so meanwhile (connected: false), a write merged then and sent once it is back; a share's, its room resumed
// on the relay (its status: connected: false meanwhile).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';
import { projectDoc, publishProject, sharedPath, docProject, docFile, gatedDocFile, watchDoc, editFile, editablePath, gateEdit } from '../core/collab-doc.js';
import { isTrusted, markEditedByEditor } from '../core/trust.js';
import { relayConfig } from './toolchain.js';
import { liveDrawing, drawingText, sameDrawing, drawingModel, drawingPathsOf, putDrawing, pruneDrawing, revertDrawing } from '../core/collab-model.js';
import { checkDrawing } from './mcp-check.js';
import { shareRoom, followRoom } from '../core/collab-client.js';
import { followLink, parseFollowLink, relayUrl, withTop } from '../core/collab-link.js';
import { MODULE_RE, viewProblem } from '../core/design-link.js';
import { qrSvg } from '../core/qr.js';

export const DEFAULT_SERVER = 'http://127.0.0.1:8642';
const ARRIVE_MS = 15_000;
const shares = new Map();    // project -> { session, link, server, off }
const follows = new Map();   // room:role -> { session, link }

const WebSocketImpl = async () => globalThis.WebSocket || (await import('ws')).WebSocket;
const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);

// a Silinx address (http(s), its origin only): this computer's (loopback), or a relay the user's settings name
// (relay.relays in config.json, #3363: never a host an assistant chose alone, a network's or another site's)
function serverOf(server = DEFAULT_SERVER, what = 'server') {
  let u;
  try { u = new URL(server); } catch { throw toolError(`server: '${server}' is not an address`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw toolError(`server: '${server}' is not an http(s) address`);
  if (!LOOPBACK.has(u.hostname.toLowerCase()) && !relayConfig().relays.includes(u.origin)) {
    throw toolError(`${what}: ${u.origin} is neither a Silinx server on this computer nor a relay the user's settings name (relay.relays in config.json): the MCP server shares and follows through those only`);
  }
  return u.origin;
}
// the token of the Silinx server on this computer at that port (none: a server started without one, as the tests'),
// sent only to that server: a loopback address (127.0.0.1, [::1], localhost), and the server there proving that it holds
// the token (server/open-code.js holdsToken, the token never sent for it); any other host: its relay's key (key)
const LOOPBACK = new Set(['127.0.0.1', '[::1]', 'localhost']);
async function tokenOf(origin) {
  const u = new URL(origin);
  if (!LOOPBACK.has(u.hostname.toLowerCase())) throw toolError(`server: ${origin} is not a Silinx server on this computer: sharing through another computer's relay needs that relay's key (key); this computer's server token is sent only to its own server`);
  const { tokenFile } = await import('./server.js');
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  let token;
  try { token = fs.readFileSync(tokenFile(port), 'utf8').trim(); } catch { return null; }
  const { holdsToken } = await import('./open-code.js');
  if (!await holdsToken(origin, token)) throw toolError(`server: the server at ${origin} is not the Silinx server whose token this computer keeps for port ${port} (another program, or one started since): not shared; start Silinx again (silinx serve)`);
  return token;
}

// the project from the disk: { project (silinx.json, as the API gives it), files: { path: text } }
async function readAll(name) {
  const project = await P.readProject(name);
  const files = {};
  for (const rel of await P.fileTree(name)) {
    if (!sharedPath(rel)) continue;
    try { files[rel] = await fsp.readFile(P.safeJoin(P.projectDir(name), rel), 'utf8'); } catch { /* unreadable: left out */ }
  }
  return { project, files };
}

// the HDL files the project's drawings generate (never an editor's to change: the drawing's)
function generated(doc) {
  const out = new Set();
  for (const [path, yt] of doc.getMap('files')) {
    if (!/\.json$/.test(path)) continue;
    try { const g = JSON.parse(yt.toString())?.generatedFile; if (typeof g === 'string') out.add(g); } catch { /* not a drawing */ }
  }
  return out;
}
// an editor's changes, at the owner's (#3182): a text file's, written to the disk; anything else, undone (the project
// published again from the disk, the owner's). The text passes the import gate first, as any file from outside, and the
// project is untrusted before it is written (#3355): an editor's link reaches no ISE nor board until the user trusts it
// again; what the gate refuses is not written (undone too), its reason among the share's warnings (`warn`).
function ownerWrites(name, doc, owner, warn, bases) {
  const offDrawings = drawingWrites(name, doc, owner, warn, bases);
  const offFiles = watchDoc(doc, async ({ changes, project }) => {
    const gen = generated(doc);
    const write = changes.filter(c => c.kind === 'changed' && editablePath(c.path) && !gen.has(c.path));
    let refused = false;
    for (const c of write) {
      const text = docFile(doc, c.path);
      const file = P.safeJoin(P.projectDir(name), c.path);
      if (typeof text !== 'string' || !fs.existsSync(file)) continue;
      let gated;
      try { gated = gateEdit(c.path, text); } catch (e) { warn(`${c.path}: an editor's change not written: ${e.reason || e.message}`); refused = true; continue; }
      try {
        if (isTrusted(await P.readProject(name))) await P.updateProject(name, markEditedByEditor);
        await P.writeAtomic(file, gated);   // (#3183: a reader never sees it half-written)
      } catch { refused = true; /* the next change */ }
    }
    if (project || refused || changes.length > write.length) { try { publishProject(doc, { ...await readAll(name), owner, bases }); } catch { /* the next change */ } }
  });
  return () => { offFiles(); offDrawings(); };
}
// an editor's changes of the drawings edited live (#3183): each one's merged model written to the disk (the gate, the
// project untrusted, as a text file's), its HDL made again from it (server/drawing-sync.js), one write after the other;
// a structure an editor may not change (no drawing of the project's): published again from the disk
function drawingWrites(name, doc, owner, warn, bases) {
  let chain = Promise.resolve();
  const write = async paths => {
    let undo = false;
    for (const path of paths) {
      const file = P.safeJoin(P.projectDir(name), path);
      const r = liveDrawing(path) && fs.existsSync(file) ? drawingModel(doc, path) : null;
      if (!r) { undo = true; continue; }
      if (r.dropped.length) pruneDrawing(doc, path);
      const text = drawingText(path, r.model);
      if (sameDrawing(text, bases.get(path))) continue;
      let gated;
      try { gated = gateEdit(path, text); } catch (e) { warn(`${path}: an editor's change not written: ${e.reason || e.message}`); revertDrawing(doc, path, bases); continue; }
      if (isTrusted(await P.readProject(name))) await P.updateProject(name, markEditedByEditor);
      await P.writeAtomic(file, gated);
      bases.set(path, gated);
      const { syncDrawing } = await import('./drawing-sync.js');
      const s = await syncDrawing(P, name, path).catch(e => ({ messages: [`WARNING: HDL not synchronized: ${e.message}`] }));
      for (const m of s?.messages || []) if (/^WARNING: /.test(m)) warn(m.replace(/^WARNING: /, ''));
    }
    if (undo) publishProject(doc, { ...await readAll(name), owner, bases });
  };
  const fn = tr => {
    if (tr.local) return;
    const paths = drawingPathsOf(tr);
    if (paths.length) chain = chain.then(() => write(paths)).catch(() => { /* the next change */ });
  };
  doc.on('afterTransaction', fn);
  return () => doc.off('afterTransaction', fn);
}

const peerLines = peers => (peers.length ? peers.map(p => `${p.name} (${p.role})${p.view ? `: ${p.view.path}${p.view.line !== null ? ` line ${p.view.line + 1}` : ''}` : ''}`).join('\n') : 'nobody');

export const COLLAB_TOOLS = [
  {
    name: 'share_project', title: 'Share a project live (read only)',
    description: 'Share a project of the workspace live, read only, as the interface\'s Share Project… does with Live chosen (Share Module… with top): action start gives the link that anyone opens to follow it (in Silinx, or follow_project), its files and drawings as they change on disk; status, who follows it and what they look at; stop ends it for them all. It goes through the relay of a running Silinx server (server: its address, default http://127.0.0.1:8642; on this computer, its token read from the configuration folder; another computer\'s relay only when the user\'s settings name it, relay.relays in config.json); the relay reads nothing of the project (end-to-end encrypted with a key in the link\'s fragment). Its builds (build/) are not shared. Its connection to the relay lost, its room is resumed on its own (status: connected: false meanwhile; its followers get what changed once it is back).',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      action: { type: 'string', enum: ['start', 'status', 'stop'], description: 'start (default), status or stop.' },
      name: STR('The name the followers see (default: "MCP agent").'),
      server: STR(`The address of the Silinx server whose relay shares it (default ${DEFAULT_SERVER}).`),
      editors: { type: 'boolean', description: 'start: editors may change its text files and drawings too (the result: an editor\'s link besides the follower\'s; what they change written to the disk, a drawing\'s HDL made again from it, through the import gate, the project untrusted from their first change: Xilinx ISE waits until the user trusts it in the interface).' },
      qr: { type: 'boolean', description: 'start, status: the follow link\'s QR code too, as the interface shows it (#3637): qr, an SVG (black on white).' },
      key: STR('start: the key of a relay on another computer (its config.json\'s relay.key, #3227), instead of the token of a Silinx server on this one.'),
      top: STR('start: a module of the project the links open on, as Share Module… does, live (#3631): …#follow=…&top=<module>; the project shared as it is.'),
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run({ project: name, action = 'start', name: who, server, editors = false, key, top, qr = false }) {
      // (the follow link's QR code, #3637)
      const withQr = link => (qr ? { qr: qrSvg(link) } : {});
      if (!['start', 'status', 'stop'].includes(action)) throw toolError('action: start, status or stop');
      if (top !== undefined && action !== 'start') throw toolError('top: with action start only');
      if (top !== undefined && !MODULE_RE.test(top)) throw toolError(`top: '${String(top).slice(0, 64)}' is not a module name`);
      const cur = shares.get(name);
      if (action === 'stop') {
        if (!cur) throw toolError(`'${name}' is not shared`);
        shares.delete(name);
        cur.off();
        await cur.session.close();
        return { text: `Stopped sharing '${name}': its followers no longer see it.`, data: { project: name, shared: false } };
      }
      if (action === 'status') {
        if (!cur || cur.session.closed()) { if (cur) { shares.delete(name); cur.off(); } return { text: `'${name}' is not shared.`, data: { project: name, shared: false } }; }
        const peers = cur.session.peers();
        const warns = cur.warnings.map(w => `\nWARNING: ${w}`).join('');
        // (#3835: its connection to the relay lost, being made again: said)
        const lost = cur.session.connected() ? '' : '\nThe connection to the relay was lost: reconnecting (its followers see the project as it was until it is back).';
        return { text: `'${name}' is shared: ${cur.link}${lost}\nFollowers:\n${peerLines(peers)}${warns}`, data: { project: name, shared: true, connected: cur.session.connected(), link: cur.link, ...withQr(cur.link), followers: peers, warnings: [...cur.warnings] }, untrusted: peers.length || cur.warnings.length ? [...(peers.length ? ['the followers\' names and views'] : []), ...(cur.warnings.length ? ['the warnings, which name the shared project\'s files'] : [])].join(', ') : undefined };
      }
      await readProject(name);
      // (a module's links, Share Module…: one of the design's modules, #3631)
      const all = await readAll(name);
      const problem = top === undefined ? null : viewProblem(all.project, all.files, { top });
      if (problem) throw toolError(`top: ${problem}`);
      const on = l => (l && top !== undefined ? withTop(l, top) : l);
      const at = top !== undefined ? `, opening on ${top}` : '';
      if (cur && !cur.session.closed()) return { text: `'${name}' is shared already${at}: ${on(cur.link)}`, data: { project: name, shared: true, link: on(cur.link), ...withQr(on(cur.link)), ...(cur.editLink ? { editLink: on(cur.editLink) } : {}), ...(top !== undefined ? { top } : {}), followers: cur.session.peers() } };
      const origin = serverOf(server);
      const owner = cleanName(who) || 'MCP agent';
      const doc = projectDoc(), bases = new Map();
      publishProject(doc, { ...all, owner, bases });
      const token = key ? String(key) : await tokenOf(origin);
      let session;
      // (an editor's change the owner refused among them too, #3527)
      const warnings = [];
      const onEvent = ev => { if (ev.type === 'error' && ev.message) warnings.push(ev.message); };
      try {
        session = await shareRoom({ url: relayUrl(origin, 'share'), token, doc, user: { name: owner }, editors: !!editors, WebSocket: await WebSocketImpl(), onEvent });
      } catch (e) { throw toolError(`cannot share through ${origin}: ${e.message} (is Silinx running there? silinx serve)`); }
      // (what changes on disk, published again; the relay's end, the share's)
      const { createProjectWatcher } = await import('./project-watch.js');
      const watcher = createProjectWatcher({ dirOf: P.projectDir });
      const unsub = watcher.subscribe(name, async () => { try { publishProject(doc, { ...await readAll(name), owner, bases }); } catch { /* the next change */ } });
      const unwatch = session.editKey ? ownerWrites(name, doc, owner, w => warnings.push(w), bases) : () => {};
      const off = () => { unsub(); unwatch(); watcher.close?.(); };
      const link = followLink(`${origin}/`, session.room, session.key);
      const editLink = session.editKey ? followLink(`${origin}/`, session.room, session.key, 'relay', session.editKey) : null;
      shares.set(name, { session, link, editLink, server: origin, off, warnings });
      return {
        text: `Sharing '${name}' live, read only, as ${owner}${at}. Anyone with this link follows it (until share_project stop)${qr ? '; its QR code: qr, an SVG' : ''}:\n${on(link)}${editLink ? `\nAnyone with this one edits its text files and drawings too:\n${on(editLink)}` : ''}`,
        data: { project: name, shared: true, link: on(link), ...withQr(on(link)), ...(editLink ? { editLink: on(editLink) } : {}), ...(top !== undefined ? { top } : {}), followers: [] },
      };
    },
  },
  {
    name: 'follow_project', title: 'Follow a shared project (read only)',
    description: 'Follow a project someone shares (a link …/#follow=… of Share Project… or share_project), read only (an editor\'s link, …/#edit=…: write changes its text files and drawings), as the interface does when opened at that link: gives the project\'s files, who is in it, the file the owner has open and their cursor; path: that file\'s text as it is now (call again to see it change; a drawing as its participants have merged it, with its Check (but a truth table and a schematic)). stop: leave. Its connection lost is made again on its own (connected: false meanwhile, what it gives as it was then; a write sent once it is back). The project is not copied into the workspace (import nothing; read it here).',
    inputSchema: { type: 'object', properties: {
      link: STR('The link to follow (the whole address).'),
      path: STR('A file of the project: its text as it is now.'),
      name: STR('The name the owner sees (default: "MCP agent").'),
      write: { type: 'object', description: 'With an editor\'s link (…#edit=…): a text file\'s new text, merged into the shared project as this participant\'s edit (HDL, constraints, C / C++, notes); or a state diagram\'s (.fsm.json), a truth table\'s (.bool.json), an ASM chart\'s (.asm.json), a Petri net\'s (.pn.json) or a schematic\'s (.sch.json) new JSON, merged with the others\' changes per object (a state, a transition, an output and its cells, a box, a link, a place, an arc, a symbol, a wire) and per field (its Check given after the merge, but a truth table\'s and a schematic\'s: check_syntax). Other drawings: not.', properties: { path: STR('The file.'), text: STR('Its new text.') }, required: ['path', 'text'], additionalProperties: false },
      stop: { type: 'boolean', description: 'Stop following it.' },
    }, required: ['link'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run({ link, path, name: who, write, stop = false }) {
      let l;
      try { l = parseFollowLink(link); } catch (e) { throw toolError(e.message); }
      if (!l || !l.base) throw toolError('link: a link to follow (http(s)://…/#follow=…)');
      // (a room the owner's page hosts, #3227: reached over WebRTC, which this server has not)
      if (l.via === 'host') throw toolError('link: a project its owner\'s page hosts (…#follow=….host) is followed in a browser, over WebRTC: open the link in Silinx');
      // (through the relay the link names, #3227, else the link's own Silinx)
      const origin = serverOf(l.relay || l.base, 'link');
      const slot = `${l.room}:${l.sign ? 'edit' : 'follow'}`;   // (a room followed and edited: two participants)
      let cur = follows.get(slot);
      if (cur?.session.closed()) { follows.delete(slot); cur = null; }
      if (stop) {
        if (!cur) throw toolError('this link is not followed');
        follows.delete(slot);
        await cur.session.close();
        return { text: 'Stopped following.', data: { following: false } };
      }
      if (!cur) {
        let session;
        try {
          session = await followRoom({ url: relayUrl(origin, 'follow'), room: l.room, key: l.key, sign: l.sign, user: { name: cleanName(who) || 'MCP agent' }, WebSocket: await WebSocketImpl() });
          await Promise.race([session.ready, new Promise((_, no) => setTimeout(() => no(new Error('the project did not arrive (is its owner still sharing it?)')), ARRIVE_MS))]);
        } catch (e) { session?.close(); throw toolError(`cannot follow: ${e.message}`); }
        // (who is in it comes right after the project: the owner awaited a little)
        for (let t = 0; t < 40 && !session.owner(); t++) await new Promise(r => setTimeout(r, 25));
        follows.set(slot, cur = { session, link });
      }
      if (write !== undefined) {
        if (!cur.session.editor) throw toolError('write: this link follows only (an editor\'s link, …#edit=…, writes)');
        try { writeShared(cur.session.doc, String(write.path), String(write.text)); } catch (e) { throw toolError(`write: ${e.message}`); }
        await cur.session.flush();
      }
      const { project, owner, fileTree } = docProject(cur.session.doc);
      const peers = cur.session.peers();
      const view = cur.session.owner()?.view || null;
      let text = null, check = null;
      if (path !== undefined) {
        // (through the import gate, as the interface's follower reads it, #3361; a drawing edited live: as merged, #3183)
        const live = liveDrawing(String(path)) ? drawingModel(cur.session.doc, String(path)) : null;
        const g = live ? gatedText(String(path), drawingText(String(path), live.model)) : gatedDocFile(cur.session.doc, String(path));
        if (g.reason) throw toolError(`${path}: not shown: ${g.reason}`);
        text = g.text;
        if (text === null) throw toolError(`'${path}' is not a file of the shared project (${fileTree.join(', ')})`);
        if (live) check = await checkDrawing(String(path), live.model);
      }
      const lines = [
        `Following ${owner}'s project '${project?.name}' (${cur.session.editor ? 'an editor: its text files and drawings' : 'read only'})${l.top ? `, its link opening on ${l.top}` : ''}.`,
        `Files: ${fileTree.join(', ')}`,
        `In it:\n${peerLines(peers)}`,
        // (its connection lost, being made again, #3835: what it shows as it was then; a write sent once it is back)
        ...(cur.session.connected() ? [] : ['The connection to the relay was lost: reconnecting (what this shows is as it was then).']),
        ...(write !== undefined ? [`Wrote ${write.path} (merged as this participant's edit${cur.session.connected() ? '' : ', sent once the connection is back'}).`] : []),
        ...(text !== null ? [`${path}:`, text] : []),
        ...(check ? check.lines : []),
      ];
      return { text: lines.join('\n'), data: { following: true, connected: cur.session.connected(), editor: cur.session.editor, owner, project: project?.name ?? null, files: fileTree, participants: peers, ownerView: view, ...(l.top ? { top: l.top } : {}), ...(text !== null ? { path, text } : {}), ...(check ? { check: { errors: check.errors, warnings: check.warnings } } : {}) }, untrusted: text !== null ? `the shared project's files, names and the file ${path}` : 'the shared project\'s files and names' };
    },
  },
];

// an editor's write (#3182, #3183): a text file's text (core/collab-doc.js editFile), or a drawing's JSON merged
// into its structure as this participant's edit (its new objects' ids its own), what it leaves dangling pruned
function writeShared(doc, path, text) {
  if (!liveDrawing(path)) { editFile(doc, path, text); return; }
  if (!drawingModel(doc, path)) throw new Error(`${path}: not a drawing of the project that an editor can change`);
  let m;
  try { m = JSON.parse(text); } catch { throw new Error(`${path}: not a drawing's JSON`); }
  if (!m || typeof m !== 'object' || Array.isArray(m)) throw new Error(`${path}: not a drawing's JSON`);
  gateEdit(path, text);
  putDrawing(doc, path, m, { client: doc.clientID });
  pruneDrawing(doc, path);
}
// a text through the import gate, as gatedDocFile gives it
function gatedText(path, text) {
  try { return { text: gateEdit(path, text) }; } catch (e) { return { reason: e.reason || e.message }; }
}

/** The shares and follows of this MCP server, ended (its client gone). */
export async function endCollab() {
  for (const s of shares.values()) { s.off(); await s.session.close().catch(() => {}); }
  for (const f of follows.values()) await f.session.close().catch(() => {});
  shares.clear();
  follows.clear();
}
