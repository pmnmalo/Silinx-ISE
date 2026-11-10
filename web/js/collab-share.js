// Share Project… (#3181): the owner shares the open project live, read only, through the relay of Silinx's server
// (server/collab-relay.js). Its files go into a Yjs document (core/collab-doc.js), kept as the project changes: what
// the page saves, renames, deletes, the project's settings, and what another process changes on disk (#2843); the
// editor in front and its cursor go into the owner's awareness. The link (core/collab-link.js) carries the room and
// its key, so the relay sees nothing of the project. The followers are shown in the toolbar (collab-presence.js),
// their coming and going in the console; Stop Sharing closes the room for them all. Opening another project stops
// sharing too. The browser edition, which has no relay, hosts the room in the owner's page (#3227, collab-host.js):
// each follower finds it at the public meeting point (collab-meet.js: the link carries the owner's key), or connects
// with codes exchanged by hand (Add a Follower…). Editors (#3182, phase 2): its editors' link (Copy Editor Link) signs
// their changes; the page's open text editors are bound live to the document (collab-bind.js), and what an editor
// changes in a text file is written to the disk, anything else undone from it (the disk is the owner's).
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { S, app } from './app.js';
import { writeClip } from './clipboard.js';
import { prefKey } from './prefs.js';
import { collab } from './collab-state.js';
import { renderPresence, setPresenceCommands } from './collab-presence.js';
import { projectDoc, publishProject, putFile, putProject, sharedPath, watchDoc, docFile, editablePath } from '/core/collab-doc.js';
import { keepBound, unbindAll } from './collab-bind.js';
import { shareRoom, colorOf } from '/core/collab-client.js';
import { followLink, relayUrl, relayAddress } from '/core/collab-link.js';
import { newHostKey } from '/core/collab-meet.js';

export const NAME_KEY = prefKey('silinx.collab.name');
const TRACK_MS = 300;
const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const keepName = n => { try { localStorage.setItem(NAME_KEY, n); } catch { /* this page only */ } };
// the browser edition's relay (#3227): another Silinx's, that lets this site in, among the site's (its address, its key),
// this browser's
export const RELAY_KEY = prefKey('silinx.collab.relay');
/** The relays this Silinx's pages may share and follow through (their Content-Security-Policy's too): the site's, set
 *  when it is built, or config.json's relay.relays. */
export const relaysHere = async () => { try { return (await api.collabRelays?.()) || []; } catch { return []; } };
/** Why a relay is refused here. */
export const notHere = r => `the relay at ${new URL(r).host} is not among this Silinx's relays (${api.standalone ? 'the site\'s, set when it is built' : 'config.json\'s relay.relays'})`;
const savedRelay = () => { try { const r = JSON.parse(localStorage.getItem(RELAY_KEY) || 'null'); return { on: !!r?.on, address: String(r?.address || ''), key: String(r?.key || '') }; } catch { return { on: false, address: '', key: '' }; } };
const keepRelay = r => { try { localStorage.setItem(RELAY_KEY, JSON.stringify(r)); } catch { /* this page only */ } };
/** The name of a participant, as the others see it (trimmed, at most 40 characters). */
export const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);

let share = null;   // { name, session, doc, link, editLink, restore, orig, timer, known: Map<client, name>, view, hosted (a room of the page's), bound, unwatch }

/** Share Project…: shares the open project (asks the name first), or shows the link of the one shared. */
export async function shareProjectDialog() {
  if (!S.project) return null;
  if (share) return linkDialog();
  // (a page opened from a file has no address the followers could open: the site's has, #3227)
  if (location.protocol === 'file:') { app.log('ERROR: Share Project: a Silinx opened from a file has no address that others can open; open Silinx from its site to share a project.', 'err'); return null; }
  const input = h('input', { type: 'text', value: savedName(), 'data-field': 'name', maxlength: 40, style: { width: '100%' } });
  // (the browser edition: this page hosts the room, or a relay of the settings does, #3227)
  const r0 = savedRelay(), relays = api.collab ? [] : await relaysHere();
  const viaRelay = h('input', { type: 'checkbox', 'data-field': 'via-relay', checked: r0.on && relays.includes(r0.address) });
  const address = h('select', { 'data-field': 'relay', 'data-no-i18n': '', style: { width: '100%' } }, ...relays.map(r => h('option', { value: r, selected: r === r0.address }, r)));
  const key = h('input', { type: 'password', 'data-field': 'relay-key', value: r0.key, autocomplete: 'off', style: { width: '100%' } });
  const relayPart = !relays.length ? null : h('div', { class: 'collab-relay' },
    h('label', { class: 'collab-check' }, viaRelay, ' Through a relay (a Silinx server that lets this site in); else this page hosts it'),
    h('label', {}, 'The relay\'s address:'), address, h('label', {}, 'Its key (from its administrator):'), key);
  const ok = await dialog({
    title: 'Share Project',
    body: h('div', { class: 'collab-dlg' },
      h('p', {}, 'Others follow this project live with its link, read only: its files and drawings as they change, the editor you have open and your cursor. Its builds are not shared.'),
      h('label', {}, 'Your name, as they see it:'), input, relayPart),
    buttons: [{ label: 'Share', primary: true, value: () => ({ name: cleanName(input.value), relay: { on: viaRelay.checked, address: address.value.trim(), key: key.value } }) }, { label: 'Cancel', value: null }],
  });
  if (!ok?.name) return null;
  keepName(ok.name);
  if (!api.collab) keepRelay(ok.relay);
  const how = !api.collab && ok.relay.on ? { via: 'relay', relay: ok.relay } : {};
  try { await startSharing(ok.name, how); } catch (e) { app.log(`ERROR: Share Project: ${e.message}.`, 'err'); return null; }
  return linkDialog();
}

// the project as the API gives it, and its files' texts: { project, files }
async function readAll(name) {
  const pj = await api.project(name);
  const files = {};
  for (const p of pj.fileTree || []) {
    if (!sharedPath(p)) continue;
    try { files[p] = await api.readFile(name, p); } catch { /* unreadable: left out */ }
  }
  return { project: pj, files };
}

/** Shares the open project as `name` (the link: share.link); via: 'relay' (the server's: a server edition's default;
 *  with `relay`, { address, key }, another Silinx's, that lets this site in: the browser edition's, #3227) or 'host'
 *  (this page hosts the room: the browser edition's default). */
export async function startSharing(name, { via = api.collab ? 'relay' : 'host', relay = null } = {}) {
  const other = relay ? relayAddress(relay.address) : null;
  if (relay && !other) throw new Error(`the relay's address is not an http(s) address: '${relay.address}'`);
  if (other && !(await relaysHere()).includes(other)) throw new Error(notHere(other));
  if (via === 'relay' && !other && !api.collab) throw new Error('the browser edition shares through a relay of its settings, or its own page');
  const project = S.project.name;
  const doc = projectDoc();
  publishProject(doc, { ...await readAll(project), owner: name });
  const host = via === 'host' ? (await import('./collab-host.js')).hostRoom() : null;
  const hostKey = host ? await newHostKey() : null;
  const session = host
    ? await shareRoom({ url: 'silinx-host:', WebSocket: host.WebSocket, doc, user: { name }, editors: true, onEvent: ev => onEvent(ev) })
    : await shareRoom({ url: relayUrl(other || location.href, 'share'), token: other ? relay.key || null : await api.collabToken(), doc, user: { name }, editors: true, onEvent: ev => onEvent(ev) });
  const base = location.origin + location.pathname, pub = hostKey?.pub ?? null;
  share = { name, project, session, doc, link: followLink(base, session.room, session.key, via, null, other, pub), editLink: followLink(base, session.room, session.key, via, session.editKey, other, pub), known: new Map(), view: null, hosted: host?.hosted || null, bound: new Map() };
  Object.assign(collab, { role: 'owner', owner: name, project, session });
  ({ restore: share.restore, orig: share.orig } = hookApi(project, doc));
  share.unwatch = watchDoc(doc, ev => onEdits(share, ev));
  share.timer = setInterval(track, TRACK_MS);
  addEventListener('silinx:disk-changes', onDisk);
  setPresenceCommands(commands);
  draw();
  app.log(`Sharing project "${project}": anyone with its link follows it live, read only (Share Project… shows the link; Stop Sharing ends it).`, 'ok');
  if (other) app.log(`Shared through the relay at ${new URL(other).host}: it sees no file, only who is in.`, 'info');
  if (host) {
    app.log('This page hosts the shared project: its followers find it at the meeting point when they open the link, or send you a code (Add a Follower…, in the toolbar, takes it); it lasts while this page is open.', 'info');
    const s = share;
    s.meet = (await import('./collab-meet.js')).meetFollowers(s, hostKey.key);
  }
  return share.link;
}

/** Stops sharing: the followers are told, and see the project no longer. */
export async function stopSharing(why = null) {
  if (!share) return;
  const s = share;
  share = null;
  s.hosted = null;
  clearInterval(s.timer);
  removeEventListener('silinx:disk-changes', onDisk);
  s.unwatch();
  unbindAll(s.bound);
  s.restore();
  for (const o of S.docs) o.editor?.setPeers?.([]);
  Object.assign(collab, { role: null, owner: '', project: null, session: null });
  await s.session.close().catch(() => {});
  s.meet?.then(m => m?.leave()).catch(() => {});   // (once the followers were told)
  draw();
  app.log(why || `Stopped sharing "${s.project}": its followers no longer see it.`, why ? 'warn' : 'info');
}
export const sharedLink = () => share?.link || null;
export const editorsLink = () => share?.editLink || null;

function linkDialog() {
  const link = share.link;
  const field = h('input', { type: 'text', value: link, readonly: '', 'data-field': 'link', 'data-no-i18n': '', style: { width: '100%' } });
  const editField = h('input', { type: 'text', value: share.editLink, readonly: '', 'data-field': 'edit-link', 'data-no-i18n': '', style: { width: '100%' } });
  return dialog({
    title: 'Share Project',
    body: h('div', { class: 'collab-dlg' },
      h('p', {}, `Anyone with this link follows "${share.project}" live, read only, as long as you share it.`),
      field,
      h('p', {}, 'Anyone with the editors\' link changes its text files with you, live; its drawings stay yours.'),
      editField,
      share.hosted ? h('p', {}, 'This page hosts it: its followers find it when they open the link, or send you a code, which Add a Follower… takes.') : null),
    buttons: [
      { label: 'Copy Link', primary: true, value: () => { writeClip('text', link); app.log('Shared project\'s link copied.', 'ok'); return link; } },
      { label: 'Copy Editor Link', value: () => { copyEditorLink(); return link; } },
      ...(share.hosted ? [{ label: 'Add a Follower…', value: () => { addFollower(); return link; } }] : []),
      { label: 'Stop Sharing', value: () => { stopSharing(); return null; } },
      { label: 'Close', value: link },
    ],
    onOpen: () => setTimeout(() => field.select(), 0),
  });
}

const copyEditorLink = () => { writeClip('text', share.editLink); app.log('Shared project\'s editors\' link copied: whoever opens it changes its text files with you.', 'ok'); };
const addFollower = () => { const s = share; if (s?.hosted) import('./collab-host.js').then(m => m.addFollowerDialog(s)); };
const commands = () => [
  { label: 'Copy Link', action: () => { writeClip('text', share.link); app.log('Shared project\'s link copied.', 'ok'); } },
  { label: 'Copy Editor Link', action: () => copyEditorLink() },
  share?.hosted ? { label: 'Add a Follower…', action: () => addFollower() } : null,
  { label: 'Stop Sharing', action: () => stopSharing() },
].filter(Boolean);

function draw() {
  if (!share) { renderPresence(); return; }
  const peers = share.session.peers();
  renderPresence({ label: peers.length ? `Sharing (${peers.length})` : 'Sharing', me: { name: share.name, role: 'owner', color: colorOf(share.doc.clientID), me: true }, peers });
}

function onEvent(ev) {
  if (!share) return;
  if (ev.type === 'peers') {
    const now = new Map(share.session.peers().map(p => [p.client, p.name]));
    const role = new Map(share.session.peers().map(p => [p.client, p.role]));
    for (const [c, n] of now) if (!share.known.has(c)) app.log(role.get(c) === 'editor' ? `${n} edits your project "${share.project}" with you.` : `${n} follows your project "${share.project}".`, 'info');
    for (const [c, n] of share.known) if (!now.has(c)) app.log(`${n} no longer follows your project.`, 'info');
    share.known = now;
    draw();
  } else if (ev.type === 'closed') stopSharing(`Sharing "${share.project}" ended: ${ev.reason}.`);
  else if (ev.type === 'error') app.log(`WARNING: Share Project: ${ev.message}.`, 'warn');
}

// the editor in front and its cursor, for the followers; another project opened: sharing stops
function track() {
  if (!share) return;
  if (S.project?.name !== share.project) { stopSharing(`Stopped sharing "${share.project}": another project was opened.`); return; }
  keepBound(share.bound, S.docs, share.doc.getMap('files'), editableHere, { mine: true });   // (its text editors, live, #3182)
  const d = S.active, path = d?.path || (/^(sch|asm|tt|fsm|pn):/.test(String(d?.id || '')) ? String(d.id).replace(/^[a-z]+:/, '') : null);
  const c = path && d.editor?.getCursor ? d.editor.getCursor() : null;
  share.session.setView(path ? { path, line: c?.line ?? null, ch: c?.ch ?? null } : null);
  // (the followers' cursors, in the text editors they look at)
  const peers = share.session.peers();
  for (const o of S.docs) o.editor?.setPeers?.(peers.filter(x => x.view?.path === o.path && x.view.line !== null).map(x => ({ name: x.name, color: x.color, line: x.view.line, ch: x.view.ch ?? 0 })));
}

// what changes on disk outside the page (#2843): read again into the document
async function onDisk(ev) {
  if (!share || ev.detail?.project !== share.project) return;
  await resync();
}
async function resync() {
  const s = share;
  if (!s) return;
  try { const all = await readAll(s.project); if (share === s) publishProject(s.doc, { ...all, owner: s.name }); } catch { /* the next change reads it */ }
}

// the page's own changes of the project, into the document as they are made (the functions of api.js wrapped while
// the project is shared; restored after)
function hookApi(project, doc) {
  const orig = { writeFile: api.writeFile, renameFile: api.renameFile, deleteFile: api.deleteFile, saveProject: api.saveProject };
  const mine = name => name === project;
  api.writeFile = async (name, path, text) => { const r = await orig.writeFile(name, path, text); if (mine(name)) { putFile(doc, path, text); if (!doc.getMap('files').has(path)) resync(); } return r; };
  api.saveProject = async (name, pj) => { const r = await orig.saveProject(name, pj); if (mine(name)) { putProject(doc, pj); resync(); } return r; };
  api.renameFile = async (name, from, to) => { const r = await orig.renameFile(name, from, to); if (mine(name)) resync(); return r; };
  api.deleteFile = async (name, path) => { const r = await orig.deleteFile(name, path); if (mine(name)) resync(); return r; };
  return { restore: () => Object.assign(api, orig), orig };
}

// the files an editor may change here: a text file of the project's that no drawing generates
const editableHere = p => editablePath(p) && !S.hdlToSch?.[p] && S.fileTree?.includes(p);

// what the editors change (the document's remote transactions): a text file's, written to the disk (its open editor, bound,
// shows it already); anything else, undone (the project published again from the disk), said in the console
async function onEdits(s, { changes, project }) {
  if (share !== s) return;
  const write = changes.filter(c => c.kind === 'changed' && editableHere(c.path));
  for (const c of write) {
    const text = docFile(s.doc, c.path);
    if (typeof text !== 'string') continue;
    try {
      await s.orig.writeFile(s.project, c.path, text);
      for (const d of S.docs) if (d.path === c.path && d.editor?.getValue() === text) { d.editor.markClean?.(); app.setDirty(d, false); }
    } catch (e) { app.log(`WARNING: ${c.path}: an editor's change not written: ${e.message}.`, 'warn'); }
  }
  const undone = changes.filter(c => !write.includes(c)).map(c => c.path);
  if (project || undone.length) {
    app.log(`WARNING: An editor's change undone (an editor changes the text of the project's text files only): ${[...(project ? ['silinx.json'] : []), ...undone].join(', ')}.`, 'warn');
    await resync();
  }
}
