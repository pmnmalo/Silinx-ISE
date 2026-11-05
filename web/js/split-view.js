// Two documents side by side (#1619, #1652): the editor split in two sides, each with its own tabs and its own document
// in front, a divider between them. The Split button (the header's right end, before Maximize; View ▸ Split
// Editor) splits it: the right side empty, where the next document opened goes. A document opened goes to the side
// worked in (the one of the document in front, or the empty side clicked); a tab dragged to the other side's tabs or
// pane, or its menu's Move to the Other Side, moves it there. Its menu's Show … Beside (#2834) opens a related view on
// the other side (web/js/related-views.js: what the document generates, what it comes from or shows), or brings it to
// the front there: a drawing's HDL file, read-only as always, follows the drawing as it is saved (refreshOpenEditor,
// web/js/drawings.js; a C's HDL, web/js/c-source.js openCHdl); an HDL source's translation (#2711). A side whose last
// document closes, or Close Split, leaves one. The sides are kept with the open documents (app.js saveViewState). A narrow workspace stacks them.
import { h } from './ui.js';
import { S, activateDoc, saveViewState } from './app.js';
import { relatedViews } from './related-views.js';
import { DESIGN_ICON, taskOfDoc } from './tasks.js';
import { prefKey } from './prefs.js';

const RATIO_KEY = 'silinx.split.ratio';
const NARROW = 720;   // (a workspace narrower than this: the sides one above the other)
const $ = id => document.getElementById(id);
const ICON = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/></svg>';

let on = false;       // split
let target = 'a';     // the side worked in: where a document opened goes
let seen = [];        // the documents brought to the front, the last one last
let groups = null, divider = null, empty = null, button = null, watched = false;
let ratio = (() => { try { const r = parseFloat(localStorage.getItem(prefKey(RATIO_KEY))); return r > 0.1 && r < 0.9 ? r : 0.5; } catch { return 0.5; } })();

const tasks = () => document.documentElement.dataset.layout === 'tasks';
const taskOf = d => d.task || taskOfDoc(d.id);
const ofTask = d => !tasks() || taskOf(d) === document.documentElement.dataset.task;
const sideOf = d => (d.side === 'b' ? 'b' : 'a');
const other = s => (s === 'a' ? 'b' : 'a');
// a side's document in front: the last one brought to the front (in the Tasks interface, of the current task)
const frontOf = s => [...seen].reverse().find(d => S.docs.includes(d) && sideOf(d) === s && ofTask(d)) || S.docs.filter(d => sideOf(d) === s && ofTask(d)).at(-1) || null;
/** The documents in front of the two sides ({ a, b }, null for an empty side), or null when not split. In the Tasks
 *  interface a side whose documents are all of other tasks gives way to the other. */
function sides() {
  if (!on) return null;
  const p = { a: frontOf('a'), b: frontOf('b') };
  if (!p.a && !p.b) return null;
  for (const s of ['a', 'b']) if (!p[s] && S.docs.some(d => sideOf(d) === s)) return null;
  return p;
}
/** Split, and the documents shown side by side ({ a, b }) when it shows. */
export const splitState = () => ({ on, target, sides: sides() });

/** activateDoc's placement (app.js): `doc` brought to the front, on its side (a document opened: the side worked in). */
export function placeSplit(doc) {
  if (!doc.side) doc.side = on ? target : 'a';
  seen = [...seen.filter(d => d !== doc && S.docs.includes(d)), doc];
  target = sideOf(doc);
  layout();
}

/** A document closed (app.js closeDoc): the document to bring to the front in its place (its side's next one), or null.
 *  The side's last document closed: the split ends. */
export function splitClosed(doc) {
  seen = seen.filter(d => d !== doc);
  if (!on) return null;
  const s = sideOf(doc);
  if (!S.docs.some(d => sideOf(d) === s)) { end(); return frontOf('a'); }
  layout();
  return frontOf(s);
}

/** Split Editor (the button, View ▸ Split Editor): split, the right side empty and worked in; split already, Close Split. */
export function toggleSplit() {
  if (on) return closeSplit();
  on = true;
  target = 'b';
  layout();
  saveViewState();
}

/** Close Split: every document on one side again, the one in front kept. */
export function closeSplit() {
  if (!on) return;
  end();
  saveViewState();
}
function end() {
  on = false;
  target = 'a';
  for (const d of S.docs) d.side = 'a';
  layout();
}

/** Moves a document to side `s` (splitting), and brings it to the front there. */
export function moveToSide(doc, s) {
  on = true;
  doc.side = s;
  target = s;
  activateDoc(doc);
}

/** Show … Beside (#2834): a view related to `doc` (web/js/related-views.js: { find, open }) on the other side (split),
 *  `doc` kept in front: made or opened there; open already, brought to the front there (made again where it is, a view
 *  that can be, as a translation). Not made (its errors in the console): as it was. */
export async function showBeside(doc, view) {
  const s = other(sideOf(doc)), was = on;
  let g = view.find();
  on = true;
  // (in the Tasks interface, of the document's task: a waveform's HDL beside it in Simulate)
  const place = () => { if (g !== doc) { g.side = s; g.task = taskOf(doc); } };
  if (g) { place(); await g.refresh?.(); activateDoc(g); }
  else {
    target = s;
    try { await view.open(); } finally { g = view.find(); if (!g) { on = was; target = sideOf(doc); layout(); } }
    if (g) place();   // (open already, on the same side: moved)
  }
  if (S.docs.includes(doc)) activateDoc(doc);
  return g || null;
}

/** The Show … Beside commands of a document (its tab's menu, View). */
export const besideItems = (doc = S.active) => relatedViews(doc).map(v => ({ label: v.label, action: () => showBeside(doc, v) }));

/** The commands of a document's tab. */
export function splitItems(doc = S.active) {
  return [
    '-',
    on ? { label: 'Move to the Other Side', action: () => moveToSide(doc, other(sideOf(doc))) } : null,
    ...besideItems(doc),
    on ? { label: 'Close Split', action: () => closeSplit() } : null,
  ].filter(Boolean);
}

// ---- kept with the open documents (app.js saveViewState, restoreViewState)
/** The split as kept: the right side's documents' keys (`key`: a document's reopen key; `open`: the ones kept), or null. */
export function splitKeys(key, open) {
  return on ? { b: S.docs.filter(d => sideOf(d) === 'b').map(key).filter(k => open.includes(k)) } : null;
}
/** The kept split back (`find`: a document by its key), before the one in front is brought there. (#1619 kept the two
 *  documents shown, [a, b]: b on the right side.) */
export function restoreSplit(kept, find) {
  const right = Array.isArray(kept) ? kept.slice(1) : Array.isArray(kept?.b) ? kept.b : null;
  on = !!right;
  for (const d of S.docs) d.side = 'a';
  for (const k of right || []) { const d = find(k); if (d) d.side = 'b'; }
  target = 'a';
  seen = [];
}

// ---- on the page
/** The Split button: in the Tasks interface's header between the messages' button and Maximize (#1657), in the Silinx one's at its right
 *  end, in the ISE style one's toolbar at its right end. */
function placeButton() {
  if (!button) {
    button = h('button', { id: 'split-btn', type: 'button', 'data-cmd': 'split', title: 'Split the editor: two documents side by side, each side with its tabs', html: ICON, onclick: () => toggleSplit() });
    button.setAttribute('aria-label', button.title);
  }
  const view = $('task-view'), silinx = document.documentElement.dataset.ui === 'silinx';
  const where = view || (silinx ? $('top-actions') : $('toolbar'));
  if (!where) return;
  button.className = view || !silinx ? 'tb-btn' : 'm-icon-btn';
  const max = view?.querySelector('[data-act=max]');
  if (button.parentNode !== where || (max && button.nextElementSibling !== max)) { if (max) max.before(button); else where.append(button); }
  button.setAttribute('aria-pressed', String(on));
}

function layout() {
  const ws = $('workspace'), bar = $('doc-tabs'), center = $('center');
  if (!ws || !bar) return;
  watch(ws);
  placeButton();
  const p = sides(), vertical = !!p && ws.clientWidth < NARROW;
  ws.classList.toggle('split', !!p);
  ws.classList.toggle('split-v', vertical);
  bar.classList.toggle('split', !!p);
  bar.classList.toggle('split-v', vertical);
  center.style.setProperty('--split', `${(ratio * 100).toFixed(2)}%`);
  // each side's tabs (not split: one row, as they were opened)
  if (on && !groups) groups = { a: h('div', { class: 'tab-group', 'data-side': 'a' }), b: h('div', { class: 'tab-group', 'data-side': 'b' }) };
  if (on) {
    for (const s of ['a', 'b']) if (groups[s].parentNode !== bar) bar.append(groups[s]);
    for (const d of S.docs) if (d.tab.parentNode !== groups[sideOf(d)]) groups[sideOf(d)].append(d.tab);
  } else if (groups) {
    for (const d of S.docs) if (d.tab.parentNode !== bar) bar.append(d.tab);
    groups.a.remove(); groups.b.remove();
    groups = null;
  }
  if (vertical) placeStacked(ws, bar);
  if (p && !divider) {
    divider = h('div', { id: 'split-divider', role: 'separator', title: 'Drag to resize the sides (double-click: halves)' });
    divider.addEventListener('pointerdown', drag);
    divider.addEventListener('dblclick', () => setRatio(0.5));
  }
  if (divider) { if (p) ws.append(divider); divider.hidden = !p; }
  // an empty side: what to open there
  const vacant = p && (!p.a ? 'a' : !p.b ? 'b' : null);
  if (vacant) showEmpty(ws, vacant, p[other(vacant)]);
  else if (empty) empty.hidden = true;
  const front = p && target;
  for (const d of S.docs) {
    const side = p && p[sideOf(d)] === d ? sideOf(d) : null;
    const appears = !!side && d !== S.active && d.el.hidden;
    d.el.classList.toggle('pane-a', side === 'a');
    d.el.classList.toggle('pane-b', side === 'b');
    d.el.classList.toggle('pane-front', !!side && side === front);
    d.el.hidden = d !== S.active && !side;
    d.tab.classList.toggle('beside', !!side && d !== S.active);
    if (appears) d.onActivate?.();   // (a text editor laid out again once shown)
  }
  if (empty) empty.classList.toggle('pane-front', !!vacant && vacant === front);
  dispatchEvent(new Event('resize'));
}

// stacked: the lower side's tabs over its pane (from the workspace's top, in the centre's frame)
function placeStacked(ws, bar) {
  const c = $('center');
  c.style.setProperty('--split-tabs-h', `${bar.offsetHeight || 24}px`);
  c.style.setProperty('--split-b-top', `${Math.round(ws.offsetTop + ws.clientHeight * ratio + 3)}px`);
}

function showEmpty(ws, side, beside) {
  if (!empty) {
    empty = h('div', { id: 'split-empty' });
    empty.addEventListener('pointerdown', () => { if (target !== empty.dataset.side) { target = empty.dataset.side; layout(); } });
  }
  // (the other side's documents, one click to bring here)
  const docs = S.docs.filter(d => d !== beside && ofTask(d)).slice(-6);
  empty.replaceChildren(
    // (how to bring a document here, under a large pen as the Design task's page, #1720)
    h('span', { class: 'split-ico', html: DESIGN_ICON }),
    h('p', {}, 'Drag a tab here, or right-click an open tab and choose Move to the Other Side'),
    docs.length ? h('div', { class: 'split-picks' }, ...docs.map(d => h('button', { class: 'btn', type: 'button', title: d.tooltip || d.title, 'data-no-i18n': true, onclick: () => moveToSide(d, side) }, d.title))) : '');
  empty.dataset.side = side;
  empty.className = `pane-${side}`;
  empty.hidden = false;
  if (empty.parentNode !== ws) ws.append(empty);
}

// a click in the other side's pane brings its document to the front; a tab dragged to the other side moves there; the
// workspace's width decides the stacking
function watch(ws) {
  if (watched) return;
  watched = true;
  ws.addEventListener('pointerdown', e => {
    const p = sides();
    const d = p && [p.a, p.b].find(x => x?.el.contains(e.target));
    if (d && d !== S.active) activateDoc(d);
  }, true);
  addEventListener('pointerdown', dragTab);
  let wasV = null;
  new ResizeObserver(() => { const v = ws.clientWidth < NARROW; if (sides() && (v !== wasV || v)) { wasV = v; layout(); } }).observe(ws);
  // (the header rebuilt: the Tasks interface on or off, View ▸ Interface)
  const replace = () => { if (button?.parentNode !== ($('task-view') || (document.documentElement.dataset.ui === 'silinx' ? $('top-actions') : $('toolbar')))) placeButton(); };
  new MutationObserver(replace).observe(document.documentElement, { attributes: true, attributeFilter: ['data-ui', 'data-layout'] });
  new MutationObserver(replace).observe($('topbar'), { childList: true, subtree: true });
  // (the Tasks interface's task changed: its documents on each side)
  new MutationObserver(() => { if (on) layout(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-task'] });
}

// the side under a point: its tabs, its pane or its empty page
function sideAt(x, y) {
  const el = document.elementFromPoint(x, y)?.closest('.tab-group, #split-empty, #workspace > .doc');
  if (!el) return null;
  if (el.dataset.side) return el.dataset.side;
  return el.classList.contains('pane-b') ? 'b' : el.classList.contains('pane-a') ? 'a' : null;
}
function dragTab(e) {
  const tab = on && e.button === 0 && e.isPrimary && !e.target.closest('.tclose') && e.target.closest('.tab-group > .tab');
  const doc = tab && S.docs.find(d => d.tab === tab);
  if (!doc) return;
  const x0 = e.clientX, y0 = e.clientY;
  let moving = false;
  const mark = s => { for (const g of Object.values(groups || {})) g.classList.toggle('drop', g.dataset.side === s && s !== sideOf(doc)); };
  const mv = ev => {
    if (ev.pointerId !== e.pointerId) return;
    if (!moving && Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) { moving = true; document.body.classList.add('dragging-tab'); }
    if (moving) mark(sideAt(ev.clientX, ev.clientY));
  };
  const up = ev => {
    if (ev.pointerId !== e.pointerId) return;
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    document.body.classList.remove('dragging-tab');
    mark(null);
    const s = moving && ev.type === 'pointerup' && sideAt(ev.clientX, ev.clientY);
    if (s && s !== sideOf(doc) && S.docs.includes(doc)) moveToSide(doc, s);
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

function setRatio(r) {
  ratio = Math.max(0.15, Math.min(0.85, r));
  $('center').style.setProperty('--split', `${(ratio * 100).toFixed(2)}%`);
  if ($('workspace').classList.contains('split-v')) placeStacked($('workspace'), $('doc-tabs'));
  dispatchEvent(new Event('resize'));
}
function drag(e) {
  if (!e.isPrimary) return;
  e.preventDefault();
  const ws = $('workspace'), vertical = ws.classList.contains('split-v');
  try { divider.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
  document.body.classList.add(vertical ? 'resizing-v' : 'resizing-h');
  const mv = ev => {
    if (ev.pointerId !== e.pointerId) return;
    const r = ws.getBoundingClientRect();
    setRatio(vertical ? (ev.clientY - r.top) / r.height : (ev.clientX - r.left) / r.width);
  };
  const up = ev => {
    if (ev.pointerId !== e.pointerId) return;
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    document.body.classList.remove('resizing-h', 'resizing-v');
    try { localStorage.setItem(prefKey(RATIO_KEY), String(ratio)); } catch { /* storage unavailable */ }
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

/** On the page from the start: the Split button. */
export function mountSplit() { placeButton(); const ws = $('workspace'); if (ws) watch(ws); }
