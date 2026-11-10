// Following a shared project (#3181): the page opened at a link …/#follow=<room>.<key> (core/collab-link.js) asks the
// follower's name, joins the room on the relay of the server that served it (server/collab-relay.js), and opens the
// owner's project as it arrives, read only (collab-follow-api.js stands for api.js: nothing is written, nothing runs on
// the server). The project changes as the owner changes it (web/js/project-watch.js reloads what changed, "Changed
// by <owner>" in the console); the follower follows the owner's editor, the document they have in front and their
// cursor, or browses alone (opening another document); the toolbar shows who is in (collab-presence.js), its menu
// follows the owner again or stops following. Every message in the console.
import { api } from './api.js';
import { h, dialog } from './ui.js';
import { S, app, activateDoc } from './app.js';
import { collab } from './collab-state.js';
import { renderPresence, setPresenceCommands } from './collab-presence.js';
import { followApi } from './collab-follow-api.js';
import { NAME_KEY, cleanName } from './collab-share.js';
import { docProject } from '/core/collab-doc.js';
import { followRoom, colorOf } from '/core/collab-client.js';
import { parseFollowLink, relayUrl } from '/core/collab-link.js';

const TRACK_MS = 300, ARRIVE_MS = 20_000;
let fol = null;   // { name, session, following, driven (the owner's view last followed), mine (the follower's) }

const docPath = d => d?.path || (/^(sch|asm|tt|fsm|pn):/.test(String(d?.id || '')) ? String(d.id).replace(/^[a-z]+:/, '') : null);

/** At start-up, an address to follow (#follow=…): joined, the project's name returned once it arrived (null: not a
 *  link to follow, broken, refused, or the follower did not agree). The hash is cleared (a reload does not join again). */
export async function startFollowing(hash = location.hash) {
  let link;
  try { link = parseFollowLink(hash); } catch (e) { history.replaceState(null, '', location.pathname + location.search); app.log(`ERROR: Follow a shared project: ${e.message}.`, 'err'); return null; }
  if (!link) return null;
  history.replaceState(null, '', location.pathname + location.search);
  if (api.standalone) { app.log('ERROR: Follow a shared project: open its link at the address of the Silinx that shares it (the browser edition has no relay yet).', 'err'); return null; }
  let saved = '';
  try { saved = localStorage.getItem(NAME_KEY) || ''; } catch { /* none */ }
  const input = h('input', { type: 'text', value: saved, 'data-field': 'name', maxlength: 40, style: { width: '100%' } });
  const name = await dialog({
    title: 'Follow a Shared Project',
    body: h('div', { class: 'collab-dlg' },
      h('p', {}, 'This link follows a project someone shares: you see its files and drawings as they change, read only, and where its owner is.'),
      h('label', {}, 'Your name, as they see it:'), input),
    buttons: [{ label: 'Follow', primary: true, value: () => cleanName(input.value) || 'Guest' }, { label: 'Cancel', value: null }],
  });
  if (!name) return null;
  try { localStorage.setItem(NAME_KEY, name); } catch { /* this page only */ }
  let session;
  try {
    session = await followRoom({ url: relayUrl(location.href, 'follow'), room: link.room, key: link.key, user: { name }, onEvent: ev => onEvent(ev) });
    await Promise.race([session.ready, new Promise((_, no) => setTimeout(() => no(new Error('the project did not arrive (is its owner still sharing it?)')), ARRIVE_MS))]);
  } catch (e) { session?.close(); app.log(`ERROR: Follow a shared project: ${e.message}.`, 'err'); return null; }
  const { project, owner } = docProject(session.doc);
  fol = { name, session, following: true, driven: null, mine: null };
  Object.assign(collab, { role: 'follower', owner: owner || session.owner()?.name || '?', project: project.name, session });
  Object.assign(api, followApi(api, session.doc));
  setPresenceCommands(commands);
  setInterval(track, TRACK_MS);
  draw();
  app.log(`Following ${collab.owner}'s project "${project.name}", read only: their changes appear as they make them, and their open editor while you follow them (Following ${collab.owner}, in the toolbar).`, 'ok');
  return project.name;
}

const commands = () => [
  fol?.session && !fol.session.closed() ? { label: `Follow ${collab.owner}`, checked: fol.following, action: () => setFollowing(!fol.following) } : null,
  fol?.session && !fol.session.closed() ? { label: 'Stop Following', action: () => stopFollowing() } : null,
].filter(Boolean);

function setFollowing(on) {
  if (!fol) return;
  fol.following = on;
  fol.driven = null;
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
  const closed = fol.session.closed();
  const label = closed ? 'Not shared any more' : fol.following ? `Following ${collab.owner}` : `Follow ${collab.owner}`;
  renderPresence({ label, me: { name: fol.name, role: 'follower', color: colorOf(fol.session.doc.clientID), me: true }, peers: closed ? [] : fol.session.peers() });
}

function onEvent(ev) {
  if (!fol) return;
  if (ev.type === 'peers') { draw(); track(); }
  else if (ev.type === 'closed') { app.log(`WARNING: ${collab.owner}'s project "${collab.project}" is no longer followed (${ev.reason}): what you see is as it was then.`, 'warn'); draw(); for (const d of S.docs) d.editor?.setPeers?.([]); }
  else if (ev.type === 'error') app.log(`WARNING: Follow a shared project: ${ev.message}.`, 'warn');
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
    fol.session.setView(fol.mine ? { path: fol.mine, line: S.active?.editor?.getCursor?.().line ?? null, ch: S.active?.editor?.getCursor?.().ch ?? null } : null);
    const peers = fol.session.peers();
    for (const d of S.docs) {
      if (!d.editor?.setPeers) continue;
      const p = docPath(d);
      d.editor.setPeers(peers.filter(x => x.view?.path === p && x.view.line !== null).map(x => ({ name: x.name, color: x.color, line: x.view.line, ch: x.view.ch ?? 0 })));
    }
  } finally { busy = false; }
}

