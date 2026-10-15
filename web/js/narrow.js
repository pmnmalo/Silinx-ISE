// Narrow screens (#266): an iPad in portrait, a narrow window. At 1024 px wide or less (NARROW_QUERY:
// every iPad in portrait, 768 to 1024 px; in landscape, from 1080 px, the layout is the desktop's):
// - the left side (Start / Design / Files / Libraries and the Processes) is a drawer over the
//   workspace, shown and hidden by the header's button (#drawer-btn) and, in the modern interface,
//   by the activity bar; a tap beside it, or a document opened, closes it;
// - the diagram editors' side panels (properties; the schematic's symbols) go over the canvas, shown
//   and hidden by a button of the editor's toolbar (panelToggle);
// - the link banner of a drawing is one short line, its whole text in its tip.
// Whether each is open is remembered per viewer (localStorage). The look: app.css and modern.css (the
// drawer), asm-editor.css and sch-editor.css (the side panels); the same width there.

export const NARROW_QUERY = '(max-width: 1024px)';
export const DRAWER_KEY = 'silinx.drawer';
export const PROPS_KEY = 'silinx.narrow.props';       // the diagram editors' properties panel
export const SYMBOLS_KEY = 'silinx.narrow.symbols';   // the schematic editor's symbols
export const isNarrow = () => !!globalThis.matchMedia?.(NARROW_QUERY).matches;

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
}
/** A document opened or brought to the front: on a narrow screen the open drawer gives way to it. */
export function drawerGiveWay() { if (isNarrow() && drawerOpen()) setDrawer(false); }
/** A button of the left side's tabs clicked (`page`; `shown`: the page shown before): on a narrow
 *  screen it opens the drawer; in the modern interface the shown page's button closes it again. */
export function leftTabClicked(page, shown) {
  if (!isNarrow()) return;
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
