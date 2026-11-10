// Who is in a shared project (#3181), at the right end of the main toolbar: a round badge per participant (their
// initial, in their colour; their name and role its tip), the owner's first, then a button: the owner's "Sharing", a
// follower's "Following <owner>" (or "Follow <owner>" when they browse alone), its menu the participants and the
// commands (the link, stop sharing; follow, stop following). Shown in both interfaces, while the project is shared.
import { h, popupMenu } from './ui.js';
import { collab } from './collab-state.js';

let box = null;
let commands = () => [];   // the menu's commands (collab-share.js, collab-follow.js)

/** The menu's commands while a project is shared or followed: () => [items]. */
export function setPresenceCommands(fn) { commands = fn; }

const initial = name => (String(name).trim()[0] || '?').toUpperCase();
const badge = p => h('span', { class: `collab-badge${p.role === 'owner' ? ' owner' : ''}`, style: { background: p.color }, title: p.name, 'data-no-i18n': '', 'data-peer': p.name }, initial(p.name));

/** The presence, drawn again (hidden when nothing is shared): `label` the button's, `me` this participant. */
export function renderPresence({ label = '', me = null, peers = [] } = {}) {
  const tb = document.getElementById('toolbar');
  if (!tb) return;
  if (!collab.role) { box?.remove(); box = null; return; }
  if (!box || !box.isConnected) { box = h('div', { class: 'collab-presence', role: 'group', 'aria-label': 'Shared project' }); tb.append(box); }
  const all = [...(me ? [me] : []), ...peers].sort((a, b) => (a.role === 'owner' ? -1 : b.role === 'owner' ? 1 : 0));
  const btn = h('button', { class: 'tb-btn collab-btn', title: 'Shared project: who is in it, and its commands', 'aria-haspopup': 'menu' }, label);
  btn.addEventListener('click', () => { const r = btn.getBoundingClientRect(); popupMenu(menuItems(all), r.left, r.bottom + 2); });
  box.replaceChildren(h('span', { class: 'collab-badges' }, ...all.map(badge)), btn);
}

function menuItems(all) {
  // (a name is the participant's, not translated; their role beside it)
  const people = all.map(p => ({ label: p.name, raw: true, shortcut: p.me ? 'you' : p.role === 'owner' ? 'owner' : 'follower', disabled: true }));
  return [...people, '-', ...commands()];
}
