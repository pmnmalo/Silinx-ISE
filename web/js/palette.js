// Command palette (Ctrl+K / Cmd+K, Ctrl+Shift+P): search the menu commands and the project files by
// name and run / open the chosen one, all from the keyboard. Matching: web/js/modern.js.
import { h } from './ui.js';
import { t } from './i18n.js';
import { rankEntries } from './modern.js';

let current = null;
export const paletteOpen = () => !!current;

/** commands: from menuCommands(); files: [{ path, open() }]. Resolves when the palette closes. */
export function openPalette({ commands = [], files = [], placeholder = 'Search commands and files…' } = {}) {
  if (current) { current.input.focus(); return current.done; }
  const entries = [
    ...commands.map(c => ({ kind: 'command', text: `${c.group.map(t).join(' ')} ${t(c.label)}`, en: c.path, c })),
    ...files.map(f => ({ kind: 'file', text: f.path, en: f.path, f })),
  ];
  let sel = 0, shown = [];
  const input = h('input', { type: 'text', class: 'pal-input', placeholder, role: 'combobox', 'aria-expanded': 'true',
    'aria-controls': 'pal-list', 'aria-autocomplete': 'list', autocomplete: 'off', spellcheck: 'false' });
  const list = h('div', { class: 'pal-list', id: 'pal-list', role: 'listbox' });
  const empty = h('div', { class: 'pal-empty', hidden: true }, 'No matching commands or files');
  const box = h('div', { class: 'pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' },
    h('div', { class: 'pal-search' }, input), list, empty,
    h('div', { class: 'pal-foot' }, h('span', {}, h('kbd', {}, '↑'), h('kbd', {}, '↓'), ' ', h('span', {}, 'to navigate')),
      h('span', {}, h('kbd', {}, '↵'), ' ', h('span', {}, 'to run')), h('span', {}, h('kbd', {}, 'Esc'), ' ', h('span', {}, 'to close'))));
  const overlay = h('div', { class: 'pal-overlay' }, box);

  let resolve;
  const done = new Promise(r => { resolve = r; });
  const close = (value = null) => {
    overlay.remove(); current = null;
    removeEventListener('keydown', onKey, true);
    resolve(value);
  };
  const run = e => {
    if (!e) return;
    close(e);
    Promise.resolve().then(() => (e.kind === 'command' ? e.c.action() : e.f.open())).catch(err => console.error(err));
  };
  const mark = () => {
    [...list.children].forEach((el, i) => { el.classList.toggle('sel', i === sel); el.setAttribute('aria-selected', String(i === sel)); });
    const el = list.children[sel];
    if (el) { input.setAttribute('aria-activedescendant', el.id); el.scrollIntoView?.({ block: 'nearest' }); }
  };
  const render = () => {
    shown = rankEntries(entries, input.value);
    sel = 0;
    list.innerHTML = '';
    shown.forEach((e, i) => {
      const row = e.kind === 'command'
        ? h('div', { class: 'pal-item', role: 'option', id: `pal-${i}` },
          h('span', { class: 'pal-kind' }, e.c.group.map((g, j) => [j ? ' › ' : '', h('span', {}, g)])),
          h('span', { class: 'pal-label' }, e.c.label),
          e.c.checked ? h('span', { class: 'pal-check', 'aria-hidden': 'true' }, '✓') : null,
          e.c.shortcut ? h('kbd', { class: 'pal-sc' }, e.c.shortcut) : null)
        : h('div', { class: 'pal-item pal-file', role: 'option', id: `pal-${i}` },
          h('span', { class: 'pal-kind' }, 'Open file'),
          h('span', { class: 'pal-label', 'data-no-i18n': '' }, e.f.path));
      row.addEventListener('mousemove', () => { if (sel !== i) { sel = i; mark(); } });
      row.addEventListener('click', () => run(e));
      list.append(row);
    });
    empty.hidden = shown.length > 0;
    mark();
  };
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (shown.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length; mark(); }
    } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); run(shown[sel]); }
  };
  input.addEventListener('input', render);
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
  addEventListener('keydown', onKey, true);
  document.body.append(overlay);
  render();
  input.focus();
  current = { input, done };
  return done;
}
