// Following a shared project (#3181): the page opened at a link …/#follow=<room>.<key> (core/collab-link.js) asks the
// follower's name, joins the room on the relay of the server that served it (server/collab-relay.js), and opens the
// owner's project as it arrives, read only (collab-follow-api.js stands for api.js: nothing is written, nothing runs on
// the server). The project changes as the owner changes it (web/js/project-watch.js reloads what changed, "Changed
// by <owner>" in the console); the follower follows the owner's editor, the document they have in front and their
// cursor, or browses alone (opening another document); the toolbar shows who is in (collab-presence.js), its menu
// follows the owner again or stops following. Every message in the console. A room the owner's page hosts (#3227, a
// link …/#follow=<room>.<key>.host) is reached over WebRTC, with codes exchanged by hand (collab-host.js). An editor's
// link (#3182, …#edit=…) also edits the project's text files: their editors bound live (collab-bind.js); and its
// drawings edited live (#3183, every drawing: state diagrams, truth tables, ASM charts, Petri nets, schematics): their editors bound to the drawings' structures (collab-drawing.js).
// A connection to a relay lost is made again on its own (#3835): "Reconnecting to <owner>…" in the toolbar meanwhile,
// the loss and the return in the console (an editor's changes made meanwhile sent once it is back).
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { S, app, activateDoc } from './app.js';
import { collab, editsDrawingHere } from './collab-state.js';
import { renderPresence, setPresenceCommands } from './collab-presence.js';
import { followApi } from './collab-follow-api.js';
import { NAME_KEY, cleanName, relaysHere, notHere } from './collab-share.js';
import { docProject } from '/core/collab-doc.js';
import { keepBound } from './collab-bind.js';
import { keepDrawingsBound } from './collab-drawing.js';
import { gateEdit } from '/core/collab-doc.js';
import { drawingText } from '/core/collab-model.js';
import { followRoom, colorOf } from '/core/collab-client.js';
import { parseFollowLink, relayUrl } from '/core/collab-link.js';

const TRACK_MS = 300, ARRIVE_MS = 20_000;
let fol = null;   // { name, session, following, driven (the owner's view last followed), mine (the follower's), top (a module's link's
                  //   module, opened once the project is, #3631) }

const d0 = p => S.docs.find(x => x.path === p && x.editor?.view);
const docPath = d => d?.path || (/^(sch|asm|tt|fsm|pn):/.test(String(d?.id || '')) ? String(d.id).replace(/^[a-z]+:/, '') : null);

/** At start-up, an address to follow (#follow=…): joined, the project's name returned once it arrived (null: not a
 *  link to follow, broken, refused, or the follower did not agree). The hash is cleared (a reload does not join again). */
export async function startFollowing(hash = location.hash) {
  let link;
  try { link = parseFollowLink(hash); } catch (e) { history.replaceState(null, '', location.pathname + location.search); app.log(`ERROR: Follow a shared project: ${e.message}.`, 'err'); return null; }
  if (!link) return null;
  history.replaceState(null, '', location.pathname + location.search);
  // (another Silinx's relay, #3227: one of this Silinx's relays only, as its Content-Security-Policy lets it connect to)
  if (link.relay && !(await relaysHere()).includes(link.relay)) { app.log(`ERROR: Follow a shared project: ${notHere(link.relay)}: not followed.`, 'err'); return null; }
  if (api.standalone && link.via === 'relay' && !link.relay) { app.log('ERROR: Follow a shared project: open its link at the address of the Silinx that shares it (the browser edition has no relay).', 'err'); return null; }
  let saved = '';
  try { saved = localStorage.getItem(NAME_KEY) || ''; } catch { /* none */ }
  const input = h('input', { type: 'text', value: saved, 'data-field': 'name', maxlength: 40, style: { width: '100%' } });
  // (a room the owner's page hosts: the public servers its follower reaches, named first, #3361)
  const servers = link.via === 'host' ? (await import('./collab-meet.js')).publicServers(link) : null;
  const name = await dialog({
    title: 'Follow a Shared Project',
    body: h('div', { class: 'collab-dlg' },
      h('p', {}, 'This link follows a project someone shares: you see its files and drawings as they change, read only, and where its owner is.'),
      link.relay ? h('p', {}, `Through the relay at ${new URL(link.relay).host}.`) : null,
      servers ? h('p', { class: 'collab-servers' }, servers) : null,
      h('label', {}, 'Your name, as they see it:'), input),
    buttons: [{ label: 'Follow', primary: true, value: () => cleanName(input.value) || 'Guest' }, { label: 'Cancel', value: null }],
  });
  if (!name) return null;
  try { localStorage.setItem(NAME_KEY, name); } catch { /* this page only */ }
  const WS = link.via === 'host' ? await (await import('./collab-host.js')).hostSocket(link) : undefined;
  if (link.via === 'host' && !WS) return null;
  let session;
  try {
    // (a room the owner's page hosts: its channel not made again yet; a relay's connection, made again, #3835)
    session = await followRoom({ url: WS ? 'silinx-host:' : relayUrl(link.relay || location.href, 'follow'), WebSocket: WS, room: link.room, key: link.key, sign: link.sign, user: { name }, onEvent: ev => onEvent(ev), ...(WS ? { reconnect: false } : {}) });
    await Promise.race([session.ready, new Promise((_, no) => setTimeout(() => no(new Error('the project did not arrive (is its owner still sharing it?)')), ARRIVE_MS))]);
  } catch (e) { session?.close(); app.log(`ERROR: Follow a shared project: ${e.message}.`, 'err'); return null; }
  const { project, owner } = docProject(session.doc);
  fol = { name, session, following: true, driven: null, mine: null, bound: new Map(), drawn: new Map(), top: link.top || null };
  Object.assign(collab, { role: 'follower', owner: owner || session.owner()?.name || '?', project: project.name, session, editor: session.editor });
  Object.assign(api, followApi(api, session.doc, { warn: text => app.log(`WARNING: Follow a shared project: ${text}.`, 'warn') }));
  setPresenceCommands(commands);
  setInterval(track, TRACK_MS);
  draw();
  if (session.editor) app.log(`Editing ${collab.owner}'s project "${project.name}" with them: its text files and drawings change as you all edit them (Following ${collab.owner}, in the toolbar).`, 'ok');
  else app.log(`Following ${collab.owner}'s project "${project.name}", read only: their changes appear as they make them, and their open editor while you follow them (Following ${collab.owner}, in the toolbar).`, 'ok');
  return project.name;
}

/** A module's link (Share Module…, #3631), once the project followed is open: that module opened (its drawing,
 *  else its HDL), its follower browsing alone on it (Follow <owner>, in the toolbar, follows the owner's editor). */
export async function openFollowedTop() {
  if (!fol?.top) return;
  const top = fol.top;
  fol.top = null;
  fol.following = false;   // (the owner's view not brought to the front meanwhile)
  await (await import('./link-open.js')).showModule(top, true);
  app.log(`Browsing alone on ${top}, the link's module (Follow ${collab.owner}, in the toolbar, follows ${collab.owner}'s editor).`, 'info');
  draw();
}

/** A link to follow pasted into the address bar of this page, already open (#3318): only its fragment changed, so the
 *  page loads it again, as a new tab does (the browser asks first when a document is not saved). Not in the page that
 *  shares a project, whose sharing that would end: the console says so. */
export function followPasted() {
  if (collab.role !== 'owner') { location.reload(); return; }
  history.replaceState(null, '', location.pathname + location.search);
  app.log('WARNING: Follow a shared project: this page shares a project, which loading the link here would stop: open the link in another tab or window.', 'warn');
}

const commands = () => [
  fol?.session && !fol.session.closed() ? { label: `Follow ${collab.owner}`, checked: fol.following, action: () => setFollowing(!fol.following) } : null,
  fol?.session && !fol.session.closed() ? { label: 'Stop Following', action: () => stopFollowing() } : null,
].filter(Boolean);

function setFollowing(on) {
  if (!fol) return;
  fol.following = on;
  fol.driven = null;
  fol.drivenKey = null;   // (the owner's view brought to the front again, even unchanged since: #3631)
  app.log(on ? `Following ${collab.owner}'s editor.` : `Browsing alone: ${collab.owner}'s editor is no longer followed (Follow ${collab.owner}, in the toolbar, follows it again).`, 'info');
  draw();
  track();
}

/** Stops following: the project stays as it was, read only. */
export async function stopFollowing() {
  if (!fol?.session || fol.session.closed()) return;
  await fol.session.close();
}

function draw() {
  if (!fol) return;
  const closed = fol.session.closed(), lost = !closed && !fol.session.connected();
  const label = closed ? 'Not shared any more' : lost ? `Reconnecting to ${collab.owner}…` : fol.following ? `Following ${collab.owner}` : `Follow ${collab.owner}`;
  renderPresence({ label, me: { name: fol.name, role: 'follower', color: colorOf(fol.session.doc.clientID), me: true }, peers: closed || lost ? [] : fol.session.peers() });
}

function onEvent(ev) {
  if (!fol) return;
  if (ev.type === 'peers') { draw(); track(); }
  else if (ev.type === 'offline') {
    app.log(`WARNING: The connection to ${collab.owner}'s project "${collab.project}" was lost: reconnecting${collab.editor ? ' (your changes meanwhile are sent once it is back)' : ' (what you see is as it was then until it is back)'}.`, 'warn');
    draw();
    for (const d of S.docs) d.editor?.setPeers?.([]);
  } else if (ev.type === 'online') { app.log(`Reconnected to ${collab.owner}'s project "${collab.project}"${collab.editor ? ': your changes made meanwhile are sent' : ''}.`, 'ok'); draw(); track(); }
  else if (ev.type === 'closed') { app.log(`WARNING: ${collab.owner}'s project "${collab.project}" is no longer followed (${ev.reason}): what you see is as it was then.`, 'warn'); draw(); for (const d of S.docs) d.editor?.setPeers?.([]); }
  else if (ev.type === 'error') app.log(`${ev.fatal ? 'ERROR' : 'WARNING'}: Follow a shared project: ${ev.message}.`, ev.fatal ? 'err' : 'warn');
}

// a drawing's merged model through the import gate (#3361): refused, not shown, said once
const refusedDrawings = new Set();
function shownDrawing(path, model) {
  try { gateEdit(path, drawingText(path, model)); return true; } catch (e) {
    const why = `${path}: ${e.reason || e.message}`;
    if (!refusedDrawings.has(why)) { refusedDrawings.add(why); app.log(`WARNING: Follow a shared project: ${path}: not shown: ${e.reason || e.message}.`, 'warn'); }
    return false;
  }
}

// the owner's view followed; the follower's own, told; the others' cursors in the open text editors
let busy = false;
async function track() {
  if (!fol || busy || fol.session.closed()) return;
  busy = true;
  try {
    const owner = fol.session.owner();
    const v = owner?.view;
    const mine = docPath(S.active);
    // (another document brought to the front by the follower: they browse alone)
    if (fol.following && fol.driven && mine !== fol.driven.path && mine !== fol.mine) setFollowing(false);
    if (fol.following && v?.path && S.project?.name === collab.project) {
      const key = JSON.stringify(v);
      if (fol.drivenKey !== key) {
        fol.drivenKey = key;
        if (mine !== v.path) await app.openFile(v.path);
        const d = S.docs.find(x => docPath(x) === v.path);
        if (d && S.active !== d) activateDoc(d);
        if (d?.editor && v.line !== null) d.editor.setCursor({ line: v.line, ch: v.ch ?? 0 });
        fol.driven = v;
      }
    }
    fol.mine = docPath(S.active);
    // (the open text editors, live, #3182: an editor's own files to edit, the others read only)
    keepBound(fol.bound, S.docs, fol.session.doc.getMap('files'), p => !!d0(p) && api.shown(p));
    // (an editor's drawings edited live, #3183: a merged model shown once it passes the import gate, as any file, #3361)
    keepDrawingsBound(fol.drawn, S.docs, fol.session.doc, editsDrawingHere, { say: text => app.log(text, 'warn'), accept: (m, path) => shownDrawing(path, m) });
    fol.session.setView(fol.mine ? { path: fol.mine, line: S.active?.editor?.getCursor?.().line ?? null, ch: S.active?.editor?.getCursor?.().ch ?? null } : null);
    const peers = fol.session.peers();
    for (const d of S.docs) {
      if (!d.editor?.setPeers) continue;
      const p = docPath(d);
      d.editor.setPeers(peers.filter(x => x.view?.path === p && x.view.line !== null).map(x => ({ name: x.name, color: x.color, line: x.view.line, ch: x.view.ch ?? 0 })));
    }
  } finally { busy = false; }
}

