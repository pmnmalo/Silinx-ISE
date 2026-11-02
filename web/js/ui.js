// Generic UI widgets: dialogs, menus, context menus, splitters; the element builder h and esc of dom.js re-exported.
import { icons } from './icons.js';
import { h, esc } from './dom.js';
import { prefKey } from './prefs.js';

export { h, esc };

// A drawing editor's model with its HDL file linked (generatedFile; none: unlinked), in place: the
// link alone changes (#245), the editor's history, selection and view are kept
export function linkModel(m, file) {
  if (file) m.generatedFile = String(file); else delete m.generatedFile;
  return m;
}
// the same for a snapshot of the editor's history (its JSON): an Undo / Redo keeps the link (#245);
// `norm`: the editor's normalization, when its history holds normalized models
export const linkSnapshot = (s, file, norm = m => m) => JSON.stringify(norm(linkModel(JSON.parse(s), file)));

// ------------------------------------------------------------------ dialogs
let dialogZ = 1000;
const dialogStack = [];   // open dialogs, innermost last: only it reacts to Enter / Escape
export function dialog({ title, body, buttons = [{ label: 'OK', value: true, primary: true }, { label: 'Cancel', value: null }], width = 460, onOpen, className = '' }) {
  return new Promise(resolve => {
    const overlay = h('div', { class: 'dlg-overlay', style: { zIndex: ++dialogZ } });
    const content = typeof body === 'function' ? body() : body;
    // once only: a second click or key (a button pressed twice) must not close another dialog (#490)
    let closed = false;
    const close = v => { if (closed) return; closed = true; overlay.remove(); document.removeEventListener('keydown', onKey, true); dialogStack.splice(dialogStack.indexOf(overlay), 1); resolve(v); };
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
    // drag by title: pointer events, so a finger drags it too (#264)
    const t = dlg.querySelector('.dlg-title');
    t.addEventListener('pointerdown', e => {
      if (e.target.closest('button') || !e.isPrimary) return;
      const r = dlg.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      dlg.style.position = 'fixed';
      try { t.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
      const mv = ev => { if (ev.pointerId !== e.pointerId) return; dlg.style.left = `${ev.clientX - ox}px`; dlg.style.top = `${ev.clientY - oy}px`; dlg.style.margin = '0'; };
      const up = ev => { if (ev.pointerId !== e.pointerId) return; removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
      addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
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

// the answers' labels: Yes / No, or others (`{ yes: 'Replace', no: 'Cancel' }`, #1467)
export const confirmDlg = (title, message, { yes = 'Yes', no = 'No' } = {}) => dialog({
  title, width: 420,
  body: h('div', { class: 'msg msg-question' }, h('div', { class: 'msg-icon' }, '?'), h('div', { class: 'msg-text' }, message)),
  buttons: [{ label: yes, value: true, primary: true }, { label: no, value: false }],
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
// how a menu command runs (the app records the ones that change the project: Undo / Redo)
let actionRunner = (label, fn) => fn();
export function setActionRunner(f) { actionRunner = f; }
export const runAction = (label, fn) => actionRunner(label, fn);

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
  // a menu pressed leaves the focus where it is, as the menu bar does (Edit ▸ Copy takes the selection of the
  // text field in focus, #677)
  m.addEventListener('mousedown', e => e.preventDefault());
  for (const it of items) {
    if (it === '-') { m.append(h('div', { class: 'sep' })); continue; }
    if (!it) continue;
    const disabled = typeof it.disabled === 'function' ? it.disabled() : it.disabled;
    const row = h('div', { class: `mi${disabled ? ' disabled' : ''}` },
      h('span', { class: 'chk' }, it.checked ? '✓' : (it.icon || '')),
      h('span', { class: 'lbl', ...(it.raw && { 'data-no-i18n': '' }) }, it.label),   // raw: a name or a title, not translated
      h('span', { class: 'sc' }, it.submenu ? '▸' : (it.shortcut || '')),
    );
    if (typeof it.icon === 'object' && it.icon instanceof Node) { row.firstChild.textContent = ''; row.firstChild.append(it.icon); }
    if (it.title) row.title = it.title;   // e.g. why the item is disabled
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
        // kept inside the window (#767): on the menu's left when there is no room on its right (the last menu of the
        // bar, long labels: the Development menu's changes), else against the window's edge; moved up when it runs
        // past the bottom
        const W = window.innerWidth, H = window.innerHeight, b = sub.getBoundingClientRect();
        if (b.right > W) {
          sub.style.maxWidth = `${W - 8}px`;
          const w = sub.getBoundingClientRect().width;
          sub.style.left = `${r.left - w + 2 >= 4 ? r.left - w + 2 : Math.max(4, W - w - 4)}px`;
        }
        if (b.bottom > H) sub.style.top = `${Math.max(4, H - b.height - 4)}px`;
      });
    } else {
      row.addEventListener('mouseenter', () => m.querySelectorAll(':scope > .menu-popup').forEach(s => s.remove()));
    }
    if (!disabled && it.action) row.addEventListener('click', e => {
      e.stopPropagation(); closeMenus();
      Promise.resolve().then(() => runAction(it.label, it.action)).catch(err => { console.error(err); toast(`${it.label}: ${err.message || err}`, 'error'); });
    });
    m.append(row);
  }
  return m;
}

// ------------------------------------------------------------------ long press: the right-click menus on touch (#263)
// iPadOS Safari fires no 'contextmenu' on a long press (only with a mouse or trackpad), so a press
// of a finger or a pen held still for LP_DELAY ms over an element wired here dispatches the same
// 'contextmenu' event at the press's point, on the element pressed (its listener, or an outer one,
// shows the menu as a right-click does). A press that moves more than LP_SLOP px (a drag, a scroll)
// or ends sooner (a tap) is left alone; the click (and the mouse events) of the release are
// swallowed; a browser that fires its own 'contextmenu' (Android) shows one menu, not two. The mouse
// is not concerned: the desktop's right-click stays as it is.
//   longPressMenu(el)                       el, its own callout and text selection off
//   longPressMenu(el, { select: true })     text kept selectable (a text editor)
const LP_DELAY = 500, LP_SLOP = 8;
let lpPress = null;      // the press being timed: { ev, id, x, y, timer, fired }
let lpSwallow = 0;       // until when (ms) the release's click / mouse events are swallowed
export function longPressMenu(el, { select = false } = {}) {
  if (!el || el.longPressMenu) return el;
  el.longPressMenu = true;
  if (!select) { el.style.webkitTouchCallout = 'none'; el.style.webkitUserSelect = 'none'; el.style.userSelect = 'none'; }
  el.addEventListener('pointerdown', lpDown);
  return el;
}
function lpDown(e) {
  if ((e.pointerType !== 'touch' && e.pointerType !== 'pen') || !e.isPrimary) return;
  if (lpPress?.ev === e) return;          // timed already by an element inside this one
  lpCancel();
  const target = e.target, x = e.clientX, y = e.clientY;
  const p = lpPress = { ev: e, id: e.pointerId, x, y, fired: false };
  p.timer = setTimeout(() => {
    if (lpPress !== p) return;
    p.fired = true;
    target.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, composed: true, view: window, button: 2, clientX: x, clientY: y, screenX: e.screenX, screenY: e.screenY }));
  }, LP_DELAY);
}
function lpCancel() { if (lpPress) clearTimeout(lpPress.timer); lpPress = null; }
function lpEnd(e) {
  if (lpPress?.id !== e.pointerId) return;
  if (lpPress.fired && e.type === 'pointerup') lpSwallow = Date.now() + 700;
  lpCancel();
}
addEventListener('pointerdown', () => { lpSwallow = 0; }, true);
addEventListener('pointermove', e => {
  if (lpPress?.id === e.pointerId && !lpPress.fired && Math.hypot(e.clientX - lpPress.x, e.clientY - lpPress.y) > LP_SLOP) lpCancel();
}, true);
addEventListener('pointerup', lpEnd, true);
addEventListener('pointercancel', lpEnd, true);
for (const type of ['mousedown', 'mouseup', 'click']) {
  addEventListener(type, e => {
    if (Date.now() >= lpSwallow) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (type === 'click') lpSwallow = 0;
  }, true);
}
// the browser's own 'contextmenu' of a long press: before ours, ours is not needed; after, it is one too many
addEventListener('contextmenu', e => {
  if (!e.isTrusted || !lpPress) return;
  if (lpPress.fired) { e.preventDefault(); e.stopImmediatePropagation(); } else lpCancel();
}, true);

// ------------------------------------------------------------------ two fingers on a drawing: pan and pinch (#674)
// On a touch screen a second finger on `el` (a drawing's canvas) takes the gesture from the editor:
// cancel() undoes what the first finger started (a selection band, a move), then the fingers' centre
// moving pans the view, pan(dx, dy), and their spread changing zooms it about that centre, zoom(f, cx,
// cy) (client px). The fingers' events are the gesture's until the last one is lifted (the editor sees
// none of them, a finger left alone pans); one finger, the mouse and the pen stay the editor's own.
// Wired before the editor's own 'pointerdown' listener on `el` (a capture one: it comes first).
export function twoFingerView(el, { cancel, pan, zoom }) {
  const pts = new Map();     // the fingers down on el: pointerId → { x, y }
  let g = null;              // the gesture: its centre and spread as last applied
  let raf = 0;
  const measure = () => {
    const p = [...pts.values()], n = p.length;
    const x = p.reduce((s, q) => s + q.x, 0) / n, y = p.reduce((s, q) => s + q.y, 0) / n;
    return { x, y, d: n > 1 ? Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y) : 0 };
  };
  // applied once a frame, from every finger's last point: each finger's move comes as an event of its own,
  // and a spread measured between them (one finger moved, not yet the other) would zoom in and out
  const apply = () => {
    cancelAnimationFrame(raf); raf = 0;
    if (!g || !pts.size) return;
    const m = measure();
    if (m.x !== g.x || m.y !== g.y) pan(m.x - g.x, m.y - g.y);
    if (m.d > 10 && g.d > 10 && m.d !== g.d) zoom(m.d / g.d, m.x, m.y);
    g = m;
  };
  const own = e => { e.stopImmediatePropagation(); if (e.cancelable) e.preventDefault(); };
  const onMove = e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    own(e);
    raf ||= requestAnimationFrame(apply);
  };
  const onUp = e => {
    if (!pts.has(e.pointerId)) return;
    if (g) { own(e); apply(); }
    pts.delete(e.pointerId);
    if (g) g = pts.size ? measure() : null;
    if (!pts.size) unlisten();
  };
  const listen = () => { addEventListener('pointermove', onMove, true); addEventListener('pointerup', onUp, true); addEventListener('pointercancel', onUp, true); };
  const unlisten = () => { removeEventListener('pointermove', onMove, true); removeEventListener('pointerup', onUp, true); removeEventListener('pointercancel', onUp, true); };
  el.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch') return;
    if (e.isPrimary) { pts.clear(); g = null; }      // the first finger: none is down (one lifted unseen is forgotten)
    if (!pts.size) listen();
    if (g) apply();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size < 2) return;
    if (!g) { lpCancel(); cancel?.(); }
    g = measure();
    own(e);
  }, true);
  // Safari's own pinch (the page zoomed): touch-action: none says it already, its gesture events too
  el.addEventListener('gesturestart', e => e.preventDefault());
  return el;
}

export function menuBar(el, menus) {
  el.classList.add('menubar');
  el.innerHTML = '';
  for (const menu of menus) {
    const item = h('div', { class: 'item', 'data-menu': menu.label }, menu.label);   // (its name, whatever the language: #1217)
    const open = () => {
      closeMenus();
      item.classList.add('open');
      const r = item.getBoundingClientRect();
      openMenu = buildMenu(typeof menu.items === 'function' ? menu.items() : menu.items);
      openMenu.style.left = `${r.left}px`; openMenu.style.top = `${r.bottom}px`;
      document.body.append(openMenu);
      // (kept inside the window too, #767: the last menus of the bar on a narrow window)
      const b = openMenu.getBoundingClientRect();
      if (b.right > window.innerWidth) openMenu.style.left = `${Math.max(4, window.innerWidth - b.width - 4)}px`;
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
    try { const v = localStorage.getItem(prefKey(storageKey)); if (v) target.style[dir === 'h' ? 'width' : 'height'] = v; } catch { /* storage unavailable */ }
  }
  // pointer events, so a finger drags it too (#264); the mouse's own default (a text selection, the
  // focus leaving the editor) stays prevented
  handle.addEventListener('mousedown', e => e.preventDefault());
  handle.addEventListener('pointerdown', e => {
    if (!e.isPrimary) return;
    try { handle.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
    const start = dir === 'h' ? e.clientX : e.clientY;
    const size0 = dir === 'h' ? target.offsetWidth : target.offsetHeight;
    document.body.classList.add(dir === 'h' ? 'resizing-h' : 'resizing-v');
    const mv = ev => {
      if (ev.pointerId !== e.pointerId) return;
      const d = (dir === 'h' ? ev.clientX : ev.clientY) - start;
      const sz = Math.max(min, Math.min(max, size0 + (invert ? -d : d)));
      target.style[dir === 'h' ? 'width' : 'height'] = `${sz}px`;
      dispatchEvent(new Event('resize'));
    };
    const up = ev => {
      if (ev.pointerId !== e.pointerId) return;
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
      document.body.classList.remove('resizing-h', 'resizing-v');
      if (storageKey) { try { localStorage.setItem(prefKey(storageKey), target.style[dir === 'h' ? 'width' : 'height']); } catch { /* ignore */ } }
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
}

// action (optional): { label, run } — a button in the toast (e.g. Undo)
export function toast(msg, kind = 'info', ms = 3000, action = null) {
  let host = document.querySelector('.toasts');
  if (!host) { host = h('div', { class: 'toasts' }); document.body.append(host); }
  const t = h('div', { class: `toast toast-${kind}` }, msg);
  if (action) t.append(' ', h('button', { class: 'btn toast-action', onclick: () => { t.remove(); action.run(); } }, action.label));
  host.append(t);
  setTimeout(() => t.remove(), ms);
}

export function downloadText(filename, text, type = 'text/plain') {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
