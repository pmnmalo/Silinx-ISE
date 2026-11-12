// The menu of a document's toolbar (#2257, #2259, as the schematic editor's, #2208): three dots always at the right of
// the toolbar's first line (absolute, the CSS), open until a click elsewhere, Esc or one of its commands. The keyboard
// (#2839): Enter or Space on the dots opens it on its first entry (↓ too), ↑ / ↓ / Home / End move through its entries,
// Esc closes it back on the dots. It holds menu items, never form fields (#2846): a choice is a section title and its
// options, checkable items, a ✓ on the current one (menuChoice), a setting on or off one checkable item (menuCheck).
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

/** A section title of a toolbar menu. */
export const menuTitle = (label) => h('div', { class: 'tb-menu-title', role: 'presentation' }, label);

// a checkable item: the ✓ in its own column, its label; role the ARIA one (menuitemradio, menuitemcheckbox)
const checkItem = (role, label, { checked, disabled = false, title = null, onclick }) => h('button', {
  type: 'button', class: `tb-menu-item tb-menu-check${checked ? ' checked' : ''}`, role, 'aria-checked': String(!!checked), disabled, title, onclick
}, h('span', { class: 'tb-menu-tick', 'aria-hidden': 'true' }, checked ? '✓' : ''), h('span', {}, label));

/** An item's ✓ put or taken away. */
function setChecked(item, on) {
  item.classList.toggle('checked', on);
  item.setAttribute('aria-checked', String(on));
  item.firstChild.textContent = on ? '✓' : '';
}

/** A choice in a toolbar menu: its title, then an item for each of options ({ value, label, disabled, title: the
 *  reason it is disabled, or its tip }), ✓ on the one of value, which follows the one chosen; onChange(value) when
 *  another is chosen. */
export function menuChoice(label, options, { value, onChange, title = null }) {
  const head = menuTitle(label);
  if (title) head.title = title;
  const items = options.map((o, i) => checkItem('menuitemradio', o.label, {
    checked: o.value === value, disabled: !!o.disabled, title: o.title ?? title, onclick: () => {
      if (items[i].getAttribute('aria-checked') === 'true') return;   // (the ✓, which setChoice may have moved)
      items.forEach((it, j) => setChecked(it, j === i));
      onChange(o.value);
    }
  }));
  items.forEach((it, i) => { it.dataset.value = String(options[i].value); });   // (its option's value: the tests')
  return [head, ...items];
}

/** A menuChoice's ✓ moved to the item of value, without onChange (the setting changed elsewhere: an undo, #3289). */
export function setChoice(entries, value) {
  for (const it of entries) if (it.dataset?.value !== undefined) setChecked(it, it.dataset.value === String(value));
}

/** A setting on or off in a toolbar menu: one item, ✓ when on; onChange(on) when clicked. */
export function menuCheck(label, { checked, onChange, title = null }) {
  const item = checkItem('menuitemcheckbox', label, { checked, title, onclick: () => {
    const on = item.getAttribute('aria-checked') !== 'true';
    setChecked(item, on);
    onChange(on);
  } });
  return item;
}
