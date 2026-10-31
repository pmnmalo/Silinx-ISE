// The menu of a document's toolbar (#2257, #2259, as the schematic editor's, #2208): three dots always at the right of
// the toolbar's first line (absolute, the CSS), open until a click elsewhere, Esc or one of its commands.
import { h } from './ui.js';

const DOTS = '<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><circle cx="8" cy="3" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="8" cy="13" r="1.5"/></svg>';

/** The menu of the buttons `items`: { el, close() }. */
export function toolbarMenu(items, { title, btnClass = 'tb-btn' }) {
  const menu = h('div', { class: 'tb-more-menu', hidden: true, onclick: e => { if (e.target.closest('button')) show(false); } }, ...items);
  const button = h('button', { type: 'button', class: `${btnClass} tb-more-btn`, title, 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: () => show(menu.hidden), html: DOTS });
  const el = h('span', { class: 'tb-more' }, button, menu);
  const onOutside = e => { if (!el.contains(e.target)) show(false); };
  const onEsc = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); show(false); button.focus(); } };
  function show(open) {
    menu.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    document[open ? 'addEventListener' : 'removeEventListener']('pointerdown', onOutside, true);
    document[open ? 'addEventListener' : 'removeEventListener']('keydown', onEsc, true);
  }
  return { el, close: () => show(false) };
}
