// The menu of a document's toolbar (#2257, #2259, as the schematic editor's, #2208): three dots always at the right of
// the toolbar's first line (absolute, the CSS), open until a click elsewhere, Esc or one of its commands. The keyboard
// (#2839): Enter or Space on the dots opens it on its first entry (↓ too), ↑ / ↓ / Home / End move through its entries,
// Esc closes it back on the dots.
import { h } from './ui.js';

const DOTS = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>';
// the entries the arrows move through, and those whose own arrows they leave alone (a list's, a field's)
const ENTRY = 'button:not([disabled]), input:not([disabled]), select:not([disabled])';
const OWN_ARROWS = 'select, input:not([type=checkbox]):not([type=radio])';

/** The menu of the buttons `items`: { el, button, menu, close() }. */
export function toolbarMenu(items, { title, btnClass = 'tb-btn' }) {
  const menu = h('div', { class: 'tb-more-menu', role: 'menu', hidden: true, onclick: e => { if (e.target.closest('button')) { show(false); if (e.detail === 0) button.focus(); } } }, ...items);
  for (const b of menu.querySelectorAll('button')) if (!b.hasAttribute('role')) b.setAttribute('role', 'menuitem');
  const button = h('button', { type: 'button', class: `${btnClass} tb-more-btn`, title, 'aria-label': title, 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: DOTS,
    // (a click by the keyboard, Enter or Space: detail 0, the first entry focused)
    onclick: e => { show(menu.hidden); if (!menu.hidden && e.detail === 0) move(0); } });
  const el = h('span', { class: 'tb-more' }, button, menu);
  const entries = () => [...menu.querySelectorAll(ENTRY)].filter(e => e.getClientRects().length);
  function move(to) {
    const list = entries();
    if (!list.length) return;
    const at = list.indexOf(document.activeElement);
    const i = to === 'next' ? (at + 1) % list.length : to === 'prev' ? (at - 1 + list.length) % list.length : to === 'last' ? list.length - 1 : 0;
    list[i].focus();
  }
  button.addEventListener('keydown', e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); show(true); move(e.key === 'ArrowDown' ? 0 : 'last'); }
  });
  menu.addEventListener('keydown', e => {
    if (e.target.matches?.(OWN_ARROWS)) return;
    const to = { ArrowDown: 'next', ArrowUp: 'prev', Home: 0, End: 'last' }[e.key];
    if (to === undefined) return;
    e.preventDefault(); e.stopPropagation(); move(to);
  });
  const onOutside = e => { if (!el.contains(e.target)) show(false); };
  const onEsc = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); show(false); button.focus(); } };
  function show(open) {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    document[open ? 'addEventListener' : 'removeEventListener']('pointerdown', onOutside, true);
    document[open ? 'addEventListener' : 'removeEventListener']('keydown', onEsc, true);
  }
  return { el, button, menu, close: () => show(false) };
}
