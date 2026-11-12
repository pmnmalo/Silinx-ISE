// The editors' and viewers' tabs in the order the user gives them (#2887), as in a browser: a tab dragged left or right
// in its row lands where it is dropped, with the split on or off; in a split, in a chosen place of the other side's
// row, or on the other side's pane (its row's end). While it is dragged, a slot of its width marks where it will land
// and the other tabs make room; Escape, or a drop outside the rows and the panes, leaves it where it was. A press that
// moves less than the threshold is a click (it selects the tab, app.js docTab); the close button is never a drag. Pointer
// events: a mouse, a finger or a pen. A focused tab moves one place left or right with Alt+Shift+← / → (or
// Ctrl+Shift+PageUp / PageDown where the browser leaves them to the page). The order is S.docs's: each view's (the Design
// task's, Simulate's) is its documents' in it, and it is kept with the open documents (app.js saveViewState, which keeps
// them in that order, and web/js/split-view.js restoreSplit). View-only: no MCP tool (#2674).
import { S, activateDoc, saveViewState } from './app.js';
import { setSide, splitState, tabParent } from './split-view.js';

const SLOP = 8;   // (px: a press that moves less is a click)
/** A tab's tooltip: its document's, and how to move it. */
const TAB_HINT = 'Drag to move it, or Alt+Shift+← / →';
export const tabTip = doc => `${doc.tooltip || doc.title}\n${TAB_HINT}`;

const shown = d => d.tab.getClientRects().length > 0;
const sideOf = d => (d.side === 'b' ? 'b' : 'a');
const docOf = tab => tab && S.docs.find(d => d.tab === tab);

/** The documents' tabs in S.docs's order, each in its row (`parentOf`: split-view.js tabParent): moved only where they
 *  are out of place (a tab moved loses the focus). */
export function orderTabs(parentOf = tabParent) {
  const rows = new Map();
  for (const d of S.docs) { const p = parentOf(d); if (p) { if (!rows.has(p)) rows.set(p, []); rows.get(p).push(d.tab); } }
  for (const [p, tabs] of rows) {
    tabs.forEach((t, i) => {
      if (i) { if (tabs[i - 1].nextElementSibling !== t) tabs[i - 1].after(t); return; }
      const first = [...p.children].find(c => c.classList.contains('tab'));
      if (first !== t) { if (first) first.before(t); else p.append(t); }
    });
  }
}

/** Moves `doc` before `ref` (a document of the row, or null: after the last one shown) in side `side`'s row (the one row
 *  when not split), and brings it to the front. */
export function moveTab(doc, side, ref = null) {
  const on = splitState().on, s = on ? side : 'a';
  const inRow = d => !on || sideOf(d) === s;
  S.docs.splice(S.docs.indexOf(doc), 1);
  let i = ref && ref !== doc ? S.docs.indexOf(ref) : -1;
  if (i < 0) {
    // (after the row's last tab shown: its other tasks' documents behind it keep their place)
    const last = S.docs.findLastIndex(d => inRow(d) && shown(d));
    i = (last >= 0 ? last : S.docs.findLastIndex(inRow)) + 1 || S.docs.length;
  }
  S.docs.splice(i, 0, doc);
  if (on && sideOf(doc) !== s) return setSide(doc, s);   // (its new side's layout orders the tabs)
  orderTabs();
  if (S.active !== doc) activateDoc(doc); else saveViewState();
}

/** A tab one place left (-1) or right (+1) in its row; false at the row's end. */
function nudgeTab(doc, dir) {
  const on = splitState().on;
  const row = S.docs.filter(d => (d === doc || shown(d)) && (!on || sideOf(d) === sideOf(doc)));
  const j = row.indexOf(doc) + dir;
  if (j < 0 || j >= row.length) return false;
  moveTab(doc, sideOf(doc), dir < 0 ? row[j] : row[j + 1] || null);
  return true;
}

// ---- dragged
const rows = () => [...document.querySelectorAll('#doc-tabs.split > .tab-group'), ...document.querySelectorAll('#doc-tabs:not(.split)')];
const sideOfRow = r => r.dataset.side || 'a';
// the row under a point (a little above or below it too), or the side of the pane under it (its row)
function rowAt(x, y) {
  const r = rows().find(el => { const b = el.getBoundingClientRect(); return b.width && x >= b.left && x <= b.right && y >= b.top - 12 && y <= b.bottom + 12; });
  if (r) return { row: r, pane: false };
  const el = splitState().on && document.elementFromPoint(x, y)?.closest('#split-empty, #workspace > .doc');
  const s = el && (el.dataset.side || (el.classList.contains('pane-b') ? 'b' : el.classList.contains('pane-a') ? 'a' : null));
  const row = s && rows().find(g => g.dataset.side === s);
  return row ? { row, pane: true } : null;
}

// a copy of the tab under the pointer (its looks copied: the tab rules are #doc-tabs's)
function ghostOf(tab) {
  const copy = (from, to) => {
    const cs = getComputedStyle(from);
    for (const p of cs) to.style.setProperty(p, cs.getPropertyValue(p));
    [...from.children].forEach((c, i) => copy(c, to.children[i]));
  };
  const g = tab.cloneNode(true);
  copy(tab, g);
  g.removeAttribute('title');
  g.removeAttribute('tabindex');
  g.className = 'tab-ghost';
  for (const el of g.querySelectorAll('*')) el.style.pointerEvents = 'none';   // (its parts too: what is under it is hit)
  Object.assign(g.style, { position: 'fixed', margin: '0', zIndex: '10000', pointerEvents: 'none', opacity: '0.85', boxShadow: '0 2px 8px rgba(0,0,0,.3)', transform: 'none' });
  document.body.append(g);
  return g;
}

function dragStart(e) {
  if (e.button !== 0 || !e.isPrimary || e.target.closest?.('.tclose')) return;
  const tab = e.target.closest?.('#doc-tabs .tab'), doc = docOf(tab);
  if (!doc) return;
  const x0 = e.clientX, y0 = e.clientY, r0 = tab.getBoundingClientRect(), dx = x0 - r0.left, dy = y0 - r0.top;
  let slot = null, ghost = null, drop = null;
  const mark = row => { for (const g of document.querySelectorAll('#doc-tabs > .tab-group')) g.classList.toggle('drop', g === row); };
  const begin = () => {
    if (document.querySelector('body > .menu-popup')) return false;   // (a long press's menu open: not a drag)
    ghost = ghostOf(tab);
    slot = Object.assign(document.createElement('div'), { className: 'tab tab-slot' });
    slot.style.width = `${r0.width}px`;
    if (tab.dataset.task) slot.dataset.task = tab.dataset.task;   // (shown in its task, as its tab: web/css/tasks.css)
    tab.before(slot);
    tab.classList.add('tab-drag-src');
    document.body.classList.add('dragging-tab');
    addEventListener('keydown', onEscape, true);
    return true;
  };
  // the slot where the tab would land: before or after the tab under the pointer (its half), or at the row's end
  const place = (x, y) => {
    const at = rowAt(x, y);
    drop = at && { side: sideOfRow(at.row), pane: at.pane };
    mark(at?.pane ? at.row : null);
    if (!at) { slot.hidden = true; return; }
    slot.hidden = false;
    const tabs = [...at.row.children].filter(t => t.classList.contains('tab') && t !== tab && t !== slot && t.getClientRects().length);
    const box = t => t.getBoundingClientRect();
    const over = !at.pane && tabs.find(t => x >= box(t).left && x < box(t).right);
    const put = (where, t) => { if (t[where === 'before' ? 'previousElementSibling' : 'nextElementSibling'] !== slot) t[where](slot); };
    if (over) put(x < box(over).left + box(over).width / 2 ? 'before' : 'after', over);
    else if (!tabs.length) { if (slot.parentNode !== at.row) at.row.append(slot); }
    else if (at.pane || x >= box(tabs.at(-1)).right) put('after', tabs.at(-1));
    else if (x < box(tabs[0]).left) put('before', tabs[0]);
    else if (slot.parentNode !== at.row) put('after', tabs.at(-1));
    // (a row wider than its strip: scrolled near its ends)
    const b = at.row.getBoundingClientRect();
    if (!at.pane) at.row.scrollLeft += x < b.left + 24 ? -12 : x > b.right - 24 ? 12 : 0;
  };
  const mv = ev => {
    if (ev.pointerId !== e.pointerId) return;
    if (!slot) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) <= SLOP || !begin()) return; }
    ev.preventDefault();
    ghost.style.left = `${ev.clientX - dx}px`; ghost.style.top = `${ev.clientY - dy}px`;
    place(ev.clientX, ev.clientY);
  };
  const finish = commit => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); removeEventListener('keydown', onEscape, true);
    if (!slot) return;
    // where it lands: the first tab shown after the slot in its row (none: the row's end)
    let ref = slot.nextElementSibling;
    while (ref && !(ref.classList.contains('tab') && ref !== tab && ref.getClientRects().length)) ref = ref.nextElementSibling;
    const to = commit && drop && !slot.hidden && S.docs.includes(doc) ? { side: drop.side, ref: docOf(ref) || null } : null;
    slot.remove(); ghost.remove(); mark(null);
    tab.classList.remove('tab-drag-src');
    document.body.classList.remove('dragging-tab');
    slot = null;
    if (to) moveTab(doc, to.side, to.ref);
  };
  const up = ev => { if (ev.pointerId === e.pointerId) finish(ev.type === 'pointerup'); };
  const onEscape = ev => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); finish(false); } };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

// a focused tab: Alt+Shift+← / → (Ctrl+Shift+PageUp / PageDown) moves it; Enter or Space brings it to the front
function key(e) {
  const tab = e.target.closest?.('#doc-tabs .tab'), doc = docOf(tab);
  if (!doc) return;
  const k = e.key, alt = e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey, ctrl = e.ctrlKey && e.shiftKey && !e.altKey;
  const dir = (alt && k === 'ArrowLeft') || (ctrl && k === 'PageUp') ? -1 : (alt && k === 'ArrowRight') || (ctrl && k === 'PageDown') ? 1 : 0;
  if (dir) { e.preventDefault(); e.stopPropagation(); nudgeTab(doc, dir); doc.tab.focus(); }
  else if ((k === 'Enter' || k === ' ') && !e.altKey && !e.ctrlKey && !e.metaKey) { e.preventDefault(); activateDoc(doc); doc.tab.focus(); }
}

let mounted = false;
/** On the page from the start (split-view.js mountSplit). */
export function mountTabOrder() {
  if (mounted) return;
  mounted = true;
  addEventListener('pointerdown', dragStart);
  addEventListener('keydown', key, true);
}
