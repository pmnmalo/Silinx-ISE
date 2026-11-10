// Share Project… (#3181): the owner shares the open project live, read only, through the relay of Silinx's server
// (server/collab-relay.js). Its files go into a Yjs document (core/collab-doc.js), kept as the project changes: what
// the page saves, renames, deletes, the project's settings, and what another process changes on disk (#2843); the
// editor in front and its cursor go into the owner's awareness. The link (core/collab-link.js) carries the room and
// its key, so the relay sees nothing of the project. The followers are shown in the toolbar (collab-presence.js),
// their coming and going in the console; Stop Sharing closes the room for them all. Opening another project stops
// sharing too.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { S, app } from './app.js';
import { writeClip } from './clipboard.js';
import { prefKey } from './prefs.js';
import { collab } from './collab-state.js';
import { renderPresence, setPresenceCommands } from './collab-presence.js';
import { projectDoc, publishProject, putFile, putProject, sharedPath } from '/core/collab-doc.js';
import { shareRoom, colorOf } from '/core/collab-client.js';
import { followLink, relayUrl } from '/core/collab-link.js';

export const NAME_KEY = prefKey('silinx.collab.name');
const TRACK_MS = 300;
const savedName = () => { try { return localStorage.getItem(NAME_KEY) || ''; } catch { return ''; } };
const keepName = n => { try { localStorage.setItem(NAME_KEY, n); } catch { /* this page only */ } };
/** The name of a participant, as the others see it (trimmed, at most 40 characters). */
export const cleanName = n => String(n || '').replace(/\s+/g, ' ').trim().slice(0, 40);

let share = null;   // { name, session, doc, link, restore, timer, known: Map<client, name>, view }

/** Share Project…: shares the open project (asks the name first), or shows the link of the one shared. */
export async function shareProjectDialog() {
  if (!S.project) return null;
  if (!api.collab) { app.log('ERROR: Share Project: sharing a project needs Silinx\'s server (silinx serve, on this computer or hosted); the browser edition has no relay yet.', 'err'); return null; }
  if (share) return linkDialog();
  const input = h('input', { type: 'text', value: savedName(), 'data-field': 'name', maxlength: 40, style: { width: '100%' } });
  const ok = await dialog({
    title: 'Share Project',
    body: h('div', { class: 'collab-dlg' },
      h('p', {}, 'Others follow this project live with its link, read only: its files and drawings as they change, the editor you have open and your cursor. Its builds are not shared.'),
      h('label', {}, 'Your name, as they see it:'), input),
    buttons: [{ label: 'Share', primary: true, value: () => cleanName(input.value) }, { label: 'Cancel', value: null }],
  });
  if (!ok) return null;
  keepName(ok);
  try { await startSharing(ok); } catch (e) { app.log(`ERROR: Share Project: ${e.message}.`, 'err'); return null; }
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

/** Shares the open project as `name` (the link: share.link). */
export async function startSharing(name) {
  const project = S.project.name;
  const doc = projectDoc();
  publishProject(doc, { ...await readAll(project), owner: name });
  const session = await shareRoom({ url: relayUrl(location.href, 'share'), token: await api.collabToken(), doc, user: { name }, onEvent: ev => onEvent(ev) });
  share = { name, project, session, doc, link: followLink(location.origin + location.pathname, session.room, session.key), known: new Map(), view: null };
  Object.assign(collab, { role: 'owner', owner: name, project, session });
  share.restore = hookApi(project, doc);
  share.timer = setInterval(track, TRACK_MS);
  addEventListener('silinx:disk-changes', onDisk);
  setPresenceCommands(commands);
  draw();
  app.log(`Sharing project "${project}": anyone with its link follows it live, read only (Share Project… shows the link; Stop Sharing ends it).`, 'ok');
  return share.link;
}

/** Stops sharing: the followers are told, and see the project no longer. */
export async function stopSharing(why = null) {
  if (!share) return;
  const s = share;
  share = null;
  clearInterval(s.timer);
  removeEventListener('silinx:disk-changes', onDisk);
  s.restore();
  for (const o of S.docs) o.editor?.setPeers?.([]);
  Object.assign(collab, { role: null, owner: '', project: null, session: null });
  await s.session.close().catch(() => {});
  draw();
  app.log(why || `Stopped sharing "${s.project}": its followers no longer see it.`, why ? 'warn' : 'info');
}
export const sharedLink = () => share?.link || null;

function linkDialog() {
  const link = share.link;
  const field = h('input', { type: 'text', value: link, readonly: '', 'data-field': 'link', 'data-no-i18n': '', style: { width: '100%' } });
  return dialog({
    title: 'Share Project',
    body: h('div', { class: 'collab-dlg' },
      h('p', {}, `Anyone with this link follows "${share.project}" live, read only, as long as you share it.`),
      field),
    buttons: [
      { label: 'Copy Link', primary: true, value: () => { writeClip('text', link); app.log('Shared project\'s link copied.', 'ok'); return link; } },
      { label: 'Stop Sharing', value: () => { stopSharing(); return null; } },
      { label: 'Close', value: link },
    ],
    onOpen: () => setTimeout(() => field.select(), 0),
  });
}

const commands = () => [
  { label: 'Copy Link', action: () => { writeClip('text', share.link); app.log('Shared project\'s link copied.', 'ok'); } },
  { label: 'Stop Sharing', action: () => stopSharing() },
];

function draw() {
  if (!share) { renderPresence(); return; }
  const peers = share.session.peers();
  renderPresence({ label: peers.length ? `Sharing (${peers.length})` : 'Sharing', me: { name: share.name, role: 'owner', color: colorOf(share.doc.clientID), me: true }, peers });
}

function onEvent(ev) {
  if (!share) return;
  if (ev.type === 'peers') {
    const now = new Map(share.session.peers().map(p => [p.client, p.name]));
    for (const [c, n] of now) if (!share.known.has(c)) app.log(`${n} follows your project "${share.project}".`, 'info');
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
  return () => Object.assign(api, orig);
}
