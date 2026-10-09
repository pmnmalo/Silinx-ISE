// Generic UI widgets: element builder, dialogs, menus, context menus, splitters.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

// ------------------------------------------------------------------ dialogs
let dialogZ = 1000;
const dialogStack = [];   // open dialogs, innermost last: only it reacts to Enter / Escape
export function dialog({ title, body, buttons = [{ label: 'OK', value: true, primary: true }, { label: 'Cancel', value: null }], width = 460, onOpen, className = '' }) {
  return new Promise(resolve => {
    const overlay = h('div', { class: 'dlg-overlay', style: { zIndex: ++dialogZ } });
    const content = typeof body === 'function' ? body() : body;
    const close = v => { overlay.remove(); document.removeEventListener('keydown', onKey, true); dialogStack.splice(dialogStack.indexOf(overlay), 1); resolve(v); };
    const btnRow = h('div', { class: 'dlg-buttons' });
    const dlg = h('div', { class: `dlg ${className}`, style: { width: typeof width === 'number' ? `${width}px` : width } },
      h('div', { class: 'dlg-title' }, h('span', {}, title), h('button', { class: 'dlg-x', onclick: () => close(null), title: 'Close' }, '✕')),
      h('div', { class: 'dlg-body' }, content),
      btnRow,
    );
    for (const b of buttons) {
      const el = h('button', { class: `btn${b.primary ? ' primary' : ''}`, onclick: async () => {
        if (b.validate) { const ok = await b.validate(); if (!ok) return; }
        close(typeof b.value === 'function' ? b.value() : b.value);
      } }, b.label);
      if (b.disabled) el.disabled = true;
      b.el = el;
      btnRow.append(el);
    }
    const onKey = e => {
      if (dialogStack[dialogStack.length - 1] !== overlay) return;
      if (e.key === 'Escape') { e.stopPropagation(); close(null); }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'SELECT') {
        const p = buttons.find(b => b.primary);
        if (p && !p.el.disabled) { e.preventDefault(); p.el.click(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    dialogStack.push(overlay);
    overlay.append(dlg);
    document.body.append(overlay);
    // drag by title
    const t = dlg.querySelector('.dlg-title');
    t.addEventListener('mousedown', e => {
      if (e.target.closest('button')) return;
      const r = dlg.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      dlg.style.position = 'fixed';
      const mv = ev => { dlg.style.left = `${ev.clientX - ox}px`; dlg.style.top = `${ev.clientY - oy}px`; dlg.style.margin = '0'; };
      const up = () => { removeEventListener('mousemove', mv); removeEventListener('mouseup', up); };
      addEventListener('mousemove', mv); addEventListener('mouseup', up);
    });
    onOpen?.({ dlg, close, buttons });
    const first = dlg.querySelector('.dlg-body input, .dlg-body select, .dlg-body textarea');
    (first || btnRow.querySelector('.primary'))?.focus();
  });
}

export const alertDlg = (title, message, kind = 'info') => dialog({
  title, width: 420,
  body: h('div', { class: `msg msg-${kind}` }, h('div', { class: 'msg-icon' }, kind === 'error' ? '✖' : kind === 'warn' ? '!' : 'i'), h('div', { class: 'msg-text' }, message)),
  buttons: [{ label: 'OK', value: true, primary: true }],
});

export const confirmDlg = (title, message) => dialog({
  title, width: 420,
  body: h('div', { class: 'msg msg-question' }, h('div', { class: 'msg-icon' }, '?'), h('div', { class: 'msg-text' }, message)),
  buttons: [{ label: 'Yes', value: true, primary: true }, { label: 'No', value: false }],
});

export async function promptDlg(title, label, value = '') {
  const inp = h('input', { type: 'text', value, style: { width: '100%' } });
  const r = await dialog({ title, body: h('div', {}, h('label', {}, label), inp), buttons: [{ label: 'OK', primary: true, value: () => inp.value }, { label: 'Cancel', value: null }] });
  return r;
}

// ------------------------------------------------------------------ menus
let openMenu = null;
export function closeMenus() { if (openMenu) { openMenu.remove(); openMenu = null; } document.querySelectorAll('.menubar .item.open').forEach(e => e.classList.remove('open')); }
addEventListener('mousedown', e => { if (!e.target.closest('.menu-popup') && !e.target.closest('.menubar')) closeMenus(); });
addEventListener('blur', closeMenus);

// items: [{ label, action, shortcut, disabled, checked, icon }|'-'|{label, submenu:[...]}]
export function popupMenu(items, x, y) {
  closeMenus();
  const m = buildMenu(items);
  document.body.append(m);
  const r = m.getBoundingClientRect();
  m.style.left = `${Math.min(x, innerWidth - r.width - 4)}px`;
  m.style.top = `${Math.min(y, innerHeight - r.height - 4)}px`;
  openMenu = m;
  return m;
}

function buildMenu(items) {
  const m = h('div', { class: 'menu-popup' });
  for (const it of items) {
    if (it === '-') { m.append(h('div', { class: 'sep' })); continue; }
    if (!it) continue;
    const disabled = typeof it.disabled === 'function' ? it.disabled() : it.disabled;
    const row = h('div', { class: `mi${disabled ? ' disabled' : ''}` },
      h('span', { class: 'chk' }, it.checked ? '✓' : (it.icon || '')),
      h('span', { class: 'lbl' }, it.label),
      h('span', { class: 'sc' }, it.submenu ? '▸' : (it.shortcut || '')),
    );
    if (typeof it.icon === 'object' && it.icon instanceof Node) { row.firstChild.textContent = ''; row.firstChild.append(it.icon); }
    if (it.submenu) {
      let sub = null;
      row.addEventListener('mouseenter', () => {
        m.querySelectorAll(':scope > .menu-popup').forEach(s => s.remove());
        sub = buildMenu(it.submenu);
        sub.classList.add('sub');
        m.append(sub);
        const r = row.getBoundingClientRect();
        sub.style.left = `${r.right - 2}px`; sub.style.top = `${r.top - 3}px`;
        sub.style.position = 'fixed';
      });
    } else {
      row.addEventListener('mouseenter', () => m.querySelectorAll(':scope > .menu-popup').forEach(s => s.remove()));
    }
    if (!disabled && it.action) row.addEventListener('click', e => {
      e.stopPropagation(); closeMenus();
      Promise.resolve().then(() => it.action()).catch(err => { console.error(err); toast(`${it.label}: ${err.message || err}`, 'error'); });
    });
    m.append(row);
  }
  return m;
}

export function menuBar(el, menus) {
  el.classList.add('menubar');
  el.innerHTML = '';
  for (const menu of menus) {
    const item = h('div', { class: 'item' }, menu.label);
    const open = () => {
      closeMenus();
      item.classList.add('open');
      const r = item.getBoundingClientRect();
      openMenu = buildMenu(typeof menu.items === 'function' ? menu.items() : menu.items);
      openMenu.style.left = `${r.left}px`; openMenu.style.top = `${r.bottom}px`;
      document.body.append(openMenu);
    };
    item.addEventListener('mousedown', e => { e.preventDefault(); if (item.classList.contains('open')) closeMenus(); else open(); });
    item.addEventListener('mouseenter', () => { if (openMenu && !item.classList.contains('open')) open(); });
    el.append(item);
  }
}

// ------------------------------------------------------------------ splitters
// Drag handle between two flex children; `target` is the element whose size changes.
export function splitter(handle, target, { dir = 'h', min = 80, max = 2000, invert = false, storageKey } = {}) {
  handle.classList.add('splitter', dir === 'h' ? 'split-h' : 'split-v');
  if (storageKey) {
    try { const v = localStorage.getItem(storageKey); if (v) target.style[dir === 'h' ? 'width' : 'height'] = v; } catch { /* storage unavailable */ }
  }
  handle.addEventListener('mousedown', e => {
    e.preventDefault();
    const start = dir === 'h' ? e.clientX : e.clientY;
    const size0 = dir === 'h' ? target.offsetWidth : target.offsetHeight;
    document.body.classList.add(dir === 'h' ? 'resizing-h' : 'resizing-v');
    const mv = ev => {
      const d = (dir === 'h' ? ev.clientX : ev.clientY) - start;
      const sz = Math.max(min, Math.min(max, size0 + (invert ? -d : d)));
      target.style[dir === 'h' ? 'width' : 'height'] = `${sz}px`;
      dispatchEvent(new Event('resize'));
    };
    const up = () => {
      removeEventListener('mousemove', mv); removeEventListener('mouseup', up);
      document.body.classList.remove('resizing-h', 'resizing-v');
      if (storageKey) { try { localStorage.setItem(storageKey, target.style[dir === 'h' ? 'width' : 'height']); } catch { /* ignore */ } }
    };
    addEventListener('mousemove', mv); addEventListener('mouseup', up);
  });
}

export function toast(msg, kind = 'info', ms = 3000) {
  let host = document.querySelector('.toasts');
  if (!host) { host = h('div', { class: 'toasts' }); document.body.append(host); }
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  host.append(t);
  setTimeout(() => t.remove(), ms);
}

export function downloadText(filename, text, type = 'text/plain') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
