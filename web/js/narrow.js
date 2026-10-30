// Narrow screens (#266): an iPad in portrait, a narrow window. Under 1024 px wide (NARROW_QUERY:
// every iPad in portrait, 768 to 1023 px; at 1024 px, an iPad in landscape, the layout is the desktop's, #1418):
// - the left side (Start / Design / Files / Libraries and the Processes) is a drawer over the
//   workspace, shown and hidden by the header's button (#drawer-btn) and, in the modern interface,
//   by the activity bar; a tap beside it, or a document opened, closes it;
// - the diagram editors' side panels (properties; the schematic's symbols) go over the canvas, shown
//   and hidden by a button of the editor's toolbar (panelToggle);
// - the link banner of a drawing is one short line, its whole text in its tip.
// Whether each is open is remembered per viewer (localStorage). The look: app.css and modern.css (the
// drawer), asm-editor.css and sch-editor.css (the side panels); the same width there.

import { prefKey } from './prefs.js';

export const NARROW_QUERY = '(max-width: 1023px)';
export const DRAWER_KEY = prefKey('silinx.drawer');
export const PROPS_KEY = prefKey('silinx.narrow.props');       // the diagram editors' properties panel
export const SYMBOLS_KEY = prefKey('silinx.narrow.symbols');   // the schematic editor's symbols
export const isNarrow = () => !!globalThis.matchMedia?.(NARROW_QUERY).matches;
// the left side a drawer: a narrow screen, not the Tasks interface (its side panel docked beside the document, #1463)
const asDrawer = () => isNarrow() && document.documentElement.dataset.layout !== 'tasks';

// 'open' | 'closed' kept per viewer; `def` when nothing is kept (or no storage)
function readOpen(key, def) {
  try { const v = localStorage.getItem(key); return v === 'open' ? true : v === 'closed' ? false : def; } catch { return def; }
}
function writeOpen(key, open) { try { localStorage.setItem(key, open ? 'open' : 'closed'); } catch { /* storage unavailable */ } }

// ------------------------------------------------------------------ the drawer (the left side)
export const drawerOpen = () => document.documentElement.dataset.drawer === 'open';
/** Shows or hides the drawer (<html data-drawer="open|closed">), remembered unless `remember` is false. */
export function setDrawer(open, { remember = true } = {}) {
  document.documentElement.dataset.drawer = open ? 'open' : 'closed';
  document.getElementById('drawer-btn')?.setAttribute('aria-expanded', String(open));
  if (remember) writeOpen(DRAWER_KEY, open);
}
/** The header's button and the scrim beside the open drawer; the drawer as the viewer left it (open the first time). */
export function initDrawer() {
  setDrawer(readOpen(DRAWER_KEY, true), { remember: false });
  document.getElementById('drawer-btn')?.addEventListener('click', () => setDrawer(!drawerOpen()));
  document.getElementById('drawer-scrim')?.addEventListener('click', () => setDrawer(false));
  globalThis.addEventListener?.('silinx:project-opened', drawerProjectOpened);
  globalThis.addEventListener?.('silinx:project-closed', drawerProjectOpened);
}
/** A project opened or closed: on a narrow screen the drawer shown, its Design page (#1557) or its Start page (#2169) with it. */
export function drawerProjectOpened() { if (asDrawer() && !drawerOpen()) setDrawer(true); }
/** A document opened or brought to the front: on a narrow screen the open drawer gives way to it. */
export function drawerGiveWay() { if (asDrawer() && drawerOpen()) setDrawer(false); }
/** A button of the left side's tabs clicked (`page`; `shown`: the page shown before): on a narrow
 *  screen it opens the drawer; in the modern interface the shown page's button closes it again. */
export function leftTabClicked(page, shown) {
  if (!asDrawer()) return;
  if (!drawerOpen()) setDrawer(true);
  else if (page === shown && document.documentElement.dataset.ui === 'modern') setDrawer(false);
}

// ------------------------------------------------------------------ the editors' side panels
/** Makes `button` show / hide a side panel of an editor over its canvas on a narrow screen: `root`
 *  has the class `cls` while it is shown (remembered under `key`; hidden the first time). On a wide
 *  screen the button is not shown (.narrow-only) and the panel is always there. Returns the button. */
export function panelToggle(root, button, { cls = 'side-open', key }) {
  const set = (open, remember = true) => {
    root.classList.toggle(cls, open);
    button.classList.toggle('on', open);
    button.setAttribute('aria-pressed', String(open));
    if (remember) writeOpen(key, open);
  };
  button.classList.add('narrow-only');
  button.addEventListener('click', () => set(!root.classList.contains(cls)));
  set(readOpen(key, false), false);
  return button;
}
