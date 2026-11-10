// The MCP server's tools of a shared project (#3181, server/mcp.js, #2674), as the interface's Share Project… and the
// opening of a link to follow: share_project shares a project of the workspace live, read only, through the relay of
// a running Silinx server (server/collab-relay.js; its token read as a second launch reads it, server/server.js
// tokenFile), its files published from the disk and kept as they change (the project watcher, #2843);
// follow_project follows a link, read only, and gives the project's files, who is in it, the owner's view and a file's
// text. Both through core/collab-*.js, the page's own modules: the document, the encryption, the protocol. With editors
// (#3182): share_project gives an editor's link too, and writes what an editor changes in a text file to the disk
// (anything else an editor changes undone: the project published again from the disk); follow_project with an editor's
// link writes a file's text, merged as one participant's edit.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import * as P from './projects.js';
import { toolError, readProject, STR, PROJECT } from './mcp-util.js';
import { projectDoc, publishProject, sharedPath, docProject, docFile, watchDoc, editFile, editablePath } from '../core/collab-doc.js';
import { shareRoom, followRoom } from '../core/collab-client.js';
import { followLink, parseFollowLink, relayUrl } from '../core/collab-link.js';

export const DEFAULT_SERVER = 'http://127.0.0.1:8642';
const ARRIVE_MS = 15_000;
const shares = new Map();    // project -> { session, link, server, off }
const follows = new Map();   // room:role -> { session, link }

const WebSocketImpl = async () => globalThis.WebSocket || (await import('ws')).WebSocket;
const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);

// a Silinx address (http(s), its origin only)
function serverOf(server = DEFAULT_SERVER) {
  let u;
  try { u = new URL(server); } catch { throw toolError(`server: '${server}' is not an address`); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw toolError(`server: '${server}' is not an http(s) address`);
  return u.origin;
}
// the token of the Silinx server on this computer at that port (none: a server started without one, as the tests')
async function tokenOf(origin) {
  const u = new URL(origin);
  const { tokenFile } = await import('./server.js');
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  try { return fs.readFileSync(tokenFile(port), 'utf8').trim(); } catch { return null; }
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
// published again from the disk, the owner's)
function ownerWrites(name, doc, owner) {
  return watchDoc(doc, async ({ changes, project }) => {
    const gen = generated(doc);
    const write = changes.filter(c => c.kind === 'changed' && editablePath(c.path) && !gen.has(c.path));
    for (const c of write) {
      const text = docFile(doc, c.path);
      const file = P.safeJoin(P.projectDir(name), c.path);
      if (typeof text !== 'string' || !fs.existsSync(file)) continue;
      try { await fsp.writeFile(file, text); } catch { /* the next change */ }
    }
    if (project || changes.length > write.length) { try { publishProject(doc, { ...await readAll(name), owner }); } catch { /* the next change */ } }
  });
}

const peerLines = peers => (peers.length ? peers.map(p => `${p.name} (${p.role})${p.view ? `: ${p.view.path}${p.view.line !== null ? ` line ${p.view.line + 1}` : ''}` : ''}`).join('\n') : 'nobody');

export const COLLAB_TOOLS = [
  {
    name: 'share_project', title: 'Share Project (live, read only)',
    description: 'Share a project of the workspace live, read only, as the interface\'s Share Project… does: action start gives the link that anyone opens to follow it (in Silinx, or follow_project), its files and drawings as they change on disk; status, who follows it and what they look at; stop ends it for them all. It goes through the relay of a running Silinx server (server: its address, default http://127.0.0.1:8642; on this computer, its token read from the configuration folder); the relay reads nothing of the project (end-to-end encrypted with a key in the link\'s fragment). Its builds (build/) are not shared.',
    inputSchema: { type: 'object', properties: {
      project: PROJECT,
      action: { type: 'string', enum: ['start', 'status', 'stop'], description: 'start (default), status or stop.' },
      name: STR('The name the followers see (default: "MCP agent").'),
      server: STR(`The address of the Silinx server whose relay shares it (default ${DEFAULT_SERVER}).`),
      editors: { type: 'boolean', description: 'start: editors may change its text files too (the result: an editor\'s link besides the follower\'s; what they change written to the disk).' },
      key: STR('start: the key of a relay on another computer (its config.json\'s relay.key, #3227), instead of the token of a Silinx server on this one.'),
    }, required: ['project'], additionalProperties: false },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run({ project: name, action = 'start', name: who, server, editors = false, key }) {
      if (!['start', 'status', 'stop'].includes(action)) throw toolError('action: start, status or stop');
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
        return { text: `'${name}' is shared: ${cur.link}\nFollowers:\n${peerLines(peers)}`, data: { project: name, shared: true, link: cur.link, followers: peers } };
      }
      await readProject(name);
      if (cur && !cur.session.closed()) return { text: `'${name}' is shared already: ${cur.link}`, data: { project: name, shared: true, link: cur.link, followers: cur.session.peers() } };
      const origin = serverOf(server);
      const owner = cleanName(who) || 'MCP agent';
      const doc = projectDoc();
      publishProject(doc, { ...await readAll(name), owner });
      let session;
      try {
        session = await shareRoom({ url: relayUrl(origin, 'share'), token: key ? String(key) : await tokenOf(origin), doc, user: { name: owner }, editors: !!editors, WebSocket: await WebSocketImpl() });
      } catch (e) { throw toolError(`cannot share through ${origin}: ${e.message} (is Silinx running there? silinx serve)`); }
      // (what changes on disk, published again; the relay's end, the share's)
      const { createProjectWatcher } = await import('./project-watch.js');
      const watcher = createProjectWatcher({ dirOf: P.projectDir });
      const unsub = watcher.subscribe(name, async () => { try { publishProject(doc, { ...await readAll(name), owner }); } catch { /* the next change */ } });
      const unwatch = session.editKey ? ownerWrites(name, doc, owner) : () => {};
      const off = () => { unsub(); unwatch(); watcher.close?.(); };
      const link = followLink(`${origin}/`, session.room, session.key);
      const editLink = session.editKey ? followLink(`${origin}/`, session.room, session.key, 'relay', session.editKey) : null;
      shares.set(name, { session, link, editLink, server: origin, off });
      return {
        text: `Sharing '${name}' live, read only, as ${owner}. Anyone with this link follows it (until share_project stop):\n${link}${editLink ? `\nAnyone with this one edits its text files too:\n${editLink}` : ''}`,
        data: { project: name, shared: true, link, ...(editLink ? { editLink } : {}), followers: [] },
      };
    },
  },
  {
    name: 'follow_project', title: 'Follow a shared project (read only)',
    description: 'Follow a project someone shares (a link …/#follow=… of Share Project… or share_project), read only (an editor\'s link, …/#edit=…: write changes its text files), as the interface does when opened at that link: gives the project\'s files, who is in it, the file the owner has open and their cursor; path: that file\'s text as it is now (call again to see it change). stop: leave. The project is not copied into the workspace (import nothing; read it here).',
    inputSchema: { type: 'object', properties: {
      link: STR('The link to follow (the whole address).'),
      path: STR('A file of the project: its text as it is now.'),
      name: STR('The name the owner sees (default: "MCP agent").'),
      write: { type: 'object', description: 'With an editor\'s link (…#edit=…): a text file\'s new text, merged into the shared project as this participant\'s edit (HDL, constraints, C / C++, notes; not a drawing).', properties: { path: STR('The file.'), text: STR('Its new text.') }, required: ['path', 'text'], additionalProperties: false },
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
      const origin = serverOf(l.relay || l.base);
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
        try { editFile(cur.session.doc, String(write.path), String(write.text)); } catch (e) { throw toolError(`write: ${e.message}`); }
        await cur.session.flush();
      }
      const { project, owner, fileTree } = docProject(cur.session.doc);
      const peers = cur.session.peers();
      const view = cur.session.owner()?.view || null;
      let text = null;
      if (path !== undefined) {
        text = docFile(cur.session.doc, String(path));
        if (text === null) throw toolError(`'${path}' is not a file of the shared project (${fileTree.join(', ')})`);
      }
      const lines = [
        `Following ${owner}'s project '${project?.name}' (${cur.session.editor ? 'an editor: its text files' : 'read only'}).`,
        `Files: ${fileTree.join(', ')}`,
        `In it:\n${peerLines(peers)}`,
        ...(write !== undefined ? [`Wrote ${write.path} (merged as this participant's edit).`] : []),
        ...(text !== null ? [`${path}:`, text] : []),
      ];
      return { text: lines.join('\n'), data: { following: true, editor: cur.session.editor, owner, project: project?.name ?? null, files: fileTree, participants: peers, ownerView: view, ...(text !== null ? { path, text } : {}) } };
    },
  },
];

/** The shares and follows of this MCP server, ended (its client gone). */
export async function endCollab() {
  for (const s of shares.values()) { s.off(); await s.session.close().catch(() => {}); }
  for (const f of follows.values()) await f.session.close().catch(() => {});
  shares.clear();
  follows.clear();
}
