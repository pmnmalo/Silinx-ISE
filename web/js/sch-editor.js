// Silinx schematic editor (ISE 14.x "Schematic Editor" look). SVG, no framework.
//
//   import { mountSchEditor } from './sch-editor.js';
//   const ed = mountSchEditor(container, {
//     doc,                       // a .sch.json document (core/schdoc.js format); a new one if omitted
//     modules,                   // { name: { name, ports: [{ name, dir, width, type? }], generics: [{ name, default }] } }
//     onChange(doc) {},          // debounced, after every edit
//     onOpenModule(moduleName) {},
//   });
//   readOnly: true             // view only: pan/zoom/select/inspect, no edits (RTL schematic viewer)
//   simulate: true             // with readOnly: Simulate kept, the drawing not editable (a truth table's schematic, #946;
//                              // the RTL and Technology Schematics, #1064)
//   simGenerics: () => ({ N: 8 })  // Try it: the values of the module's generics (the instance drawn, #1064)
//   device                     // the project's part (a record of S.devices.parts): its family's Device Primitives in the
//                              // palette, their count in Symbol Info (#791); ed.setDevice(part) when it changes
//   ed.getDoc(); ed.setDoc(doc); ed.setLink(file); ed.setModules(modules); ed.fit(); ed.destroy();
//   ed.copy(); ed.cut(); ed.paste(); ed.deleteSelection(); ed.canCopy(); ed.canPaste();   // Edit menu (#677)
//
// Styles: web/css/sch-editor.css (scoped under .sch-editor, themed by the ISE variables of theme.css).

import {
  SYMBOL_CATEGORIES, GRID, defaultParams, normalizeDoc, newDoc, symbolBox, portBox, netlist, netShort,
} from '/core/schdoc.js';
import { symbolSummary } from '/core/symdocs.js';
import { getLanguage, onLanguageChange } from './i18n.js';
import { linkModel, linkSnapshot, dialog } from './ui.js';
import { h } from './dom.js';
import { hasClip } from './clipboard.js';
import { mountProps } from './sch-props.js';
import { mountRender } from './sch-render.js';
import { mountMove } from './sch-move.js';
import { mountTools } from './sch-tools.js';
import { mountSchInfo } from './sch-info.js';
import { mountSchTry } from './sch-try.js';
import { mountSchKeys } from './sch-keys.js';
import { mountSchMouse } from './sch-mouse.js';
import { mountSchPalette } from './sch-palette.js';
import { mountSchSelect } from './sch-select.js';
import { mountSchView } from './sch-view.js';
import { mountSchToolbar } from './sch-toolbar.js';
import { mountSchEdits } from './sch-edits.js';
import { mountSchUi } from './sch-ui.js';
import { mountSchDom } from './sch-dom.js';
import { mountSchCheck } from './sch-check.js';

export const clone = o => JSON.parse(JSON.stringify(o));
export const snap = v => Math.round(v / GRID) * GRID;
export const KEYS = { sym: 'symbols', wire: 'wires', port: 'ports', label: 'labels' };


// ------------------------------------------------------------------ icons (16x16)
const I = (body) => `<svg viewBox="0 0 16 16">${body}</svg>`;
export const ICON = {
  select: I('<path d="M3 1.5v12l3.2-3 2.3 5 1.8-.8-2.3-5H12z" fill="#fff" stroke="#24476f" stroke-width="1.1" stroke-linejoin="round"/>'),
  wire: I('<path d="M1.5 12.5h5v-9h8" fill="none" stroke="#0000a0" stroke-width="1.6"/><circle cx="1.5" cy="12.5" r="1.4" fill="#0000a0"/><circle cx="14.5" cy="3.5" r="1.4" fill="#0000a0"/>'),
  net: I('<path d="M1 12.5h14" stroke="#0000a0" stroke-width="1.4"/><text x="1.5" y="9.5" font-size="8" font-family="Arial" font-weight="bold" fill="#800000">abc</text>'),
  io: I('<path d="M1.5 4.5h8l4 3.5-4 3.5h-8z" fill="#fffff0" stroke="#000080" stroke-width="1.2"/>'),
  rotate: I('<path d="M12.5 8a4.5 4.5 0 1 1-1.3-3.2" fill="none" stroke="#24476f" stroke-width="1.5"/><path d="M13.6 1.8v3.8H9.8z" fill="#24476f"/>'),
  mirror: I('<path d="M8 1v14" stroke="#888" stroke-dasharray="2 1.5"/><path d="M6.5 3.5v9L1.5 12.5z" fill="#9cc3ea" stroke="#24476f"/><path d="M9.5 3.5v9l5 0z" fill="#fff" stroke="#24476f"/>'),
  del: I('<path d="M3.5 3.5l9 9M12.5 3.5l-9 9" stroke="#c00000" stroke-width="2.2" stroke-linecap="round"/>'),
  zin: I('<circle cx="6.5" cy="6.5" r="4.5" fill="#e8f2fc" stroke="#24476f" stroke-width="1.4"/><path d="M10 10l4.5 4.5" stroke="#24476f" stroke-width="2"/><path d="M4 6.5h5M6.5 4v5" stroke="#24476f" stroke-width="1.4"/>'),
  zout: I('<circle cx="6.5" cy="6.5" r="4.5" fill="#e8f2fc" stroke="#24476f" stroke-width="1.4"/><path d="M10 10l4.5 4.5" stroke="#24476f" stroke-width="2"/><path d="M4 6.5h5" stroke="#24476f" stroke-width="1.4"/>'),
  fit: I('<path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="#24476f" stroke-width="1.5"/><rect x="5" y="5" width="6" height="6" fill="#9cc3ea" stroke="#24476f"/>'),
  check: I('<rect x="1.5" y="1.5" width="13" height="13" rx="1" fill="#fff" stroke="#24476f"/><path d="M4 8.2l2.6 2.6L12 5" fill="none" stroke="#008000" stroke-width="2"/>'),
  sim: I('<rect x="1" y="4" width="7" height="8" rx="1.5" fill="#1f6b1f" stroke="#0d3d0d"/><rect x="4.5" y="5.5" width="2.5" height="5" rx=".6" fill="#fff"/><path d="M9 8h2.5" stroke="#00b000" stroke-width="1.6"/><circle cx="13" cy="8" r="2.4" fill="#33e033" stroke="#0d6d0d"/>'),
  info: I('<circle cx="8" cy="8" r="6.5" fill="#e8f2fc" stroke="#24476f" stroke-width="1.2"/><circle cx="8" cy="4.6" r="1.1" fill="#24476f"/><path d="M8 7v5" stroke="#24476f" stroke-width="2"/>'),
  view: I('<path d="M3 1.5h7l3 3v10H3z" fill="#fff" stroke="#24476f"/><path d="M10 1.5v3h3" fill="none" stroke="#24476f"/><text x="4.2" y="12" font-size="6.5" font-family="Consolas,monospace" font-weight="bold" fill="#000080">&lt;/&gt;</text>'),
};

export function onSeg(p, a, b, tol = 0) {
  if (a.x === b.x) return Math.abs(p.x - a.x) <= tol && p.y >= Math.min(a.y, b.y) - tol && p.y <= Math.max(a.y, b.y) + tol;
  if (a.y === b.y) return Math.abs(p.y - a.y) <= tol && p.x >= Math.min(a.x, b.x) - tol && p.x <= Math.max(a.x, b.x) + tol;
  return false;
}
export function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const L = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
export function cleanPts(pts) {
  const out = [];
  for (const p of pts) { const l = out[out.length - 1]; if (!l || l.x !== p.x || l.y !== p.y) out.push({ x: p.x, y: p.y }); }
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true;
    const a = out[i - 1], b = out[i + 1];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}
const rectsTouch = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

let editorCount = 0;

// ================================================================== the editor
// the project's modules by name (#405: out of mountSchEditor, which it needs nothing of)
function normMods(m) {
  const out = {};
  if (!m) return out;
  for (const x of Array.isArray(m) ? m : Object.values(m)) if (x && x.name) out[x.name] = x;
  return out;
}

export function mountSchEditor(container, opts = {}) {
  const uidE = ++editorCount;
  let modules = normMods(opts.modules);
  let device = opts.device || null;     // the project's part (#791)
  let doc = normalizeDoc(opts.doc || newDoc('schematic', 'vhdl'), { modules });
  let nl = null;                      // cached netlist of the current doc
  let view = { s: 1, tx: 40, ty: 40 };
  let tool = 'select';                // select | wire | net | io | place
  let placing = null;                 // { type, params, rot, mirror }
  let sel = new Set();                // 'sym:S1' ...
  let drag = null;                    // current mouse interaction
  let wireDraw = null;                // { pts: [], first: 'h'|'v' }
  let cursor = { x: 0, y: 0 };
  let hoverPin = null;
  const undoStack = [], redoStack = [];
  let changeTimer = null;
  let destroyed = false;
  let lastDiags = null;
  let genLang = doc.lang;
  const readOnly = !!opts.readOnly;
  const canSim = !readOnly || !!opts.simulate;   // read-only blocks editing the drawing, not simulating it (#946)
  let live = null;                    // live simulation controller (web/js/sch-live.js) while simulating
  let liveStarting = false;

  container.classList.add('sch-editor');
  container.classList.toggle('read-only', readOnly);
  container.classList.toggle('ro-sim', readOnly && canSim);
  if (!container.hasAttribute('tabindex')) container.tabIndex = 0;
  container.innerHTML = '';

  // ---------------- DOM skeleton (sch-dom.js)
  const { canvas, contentG, diagPanel, hint, left, overlayG, right, sheetG, simBar, simG, status, svg, tb, vp } =
    mountSchDom({ container, uidE });

  // ---------------- toolbar
  // moving components keeps their wires connected (re-routed), or detaches them
  let keepConn = true;
  try { keepConn = localStorage.getItem('xl.sch.keepConn') !== '0'; } catch { /* default */ }
  const keepBox = h('input', { type: 'checkbox', checked: keepConn });
  keepBox.addEventListener('change', () => { keepConn = keepBox.checked; try { localStorage.setItem('xl.sch.keepConn', keepConn ? '1' : '0'); } catch { /* ignore */ } });
  const btn = (act, icon, title) => h('button', { type: 'button', class: 'se-btn', 'data-act': act, title, html: ICON[icon] });
  const sep = () => h('span', { class: 'se-sep' });
  // Names: the name of every instance and every net drawn, the automatic ones too
  let showNames = false;
  try { showNames = localStorage.getItem('xl.sch.names') === '1'; } catch { /* default */ }
  const namesBox = h('input', { type: 'checkbox', checked: showNames });
  namesBox.addEventListener('change', () => { showNames = namesBox.checked; try { localStorage.setItem('xl.sch.names', showNames ? '1' : '0'); } catch { /* ignore */ } render(); });
  // Hop-overs (#692): a small arc where two wires cross without connecting (a view only: the nets, the HDL
  // the same)
  // hop-overs on by default (#756), off only when the user turned them off (remembered)
  let showHops = true;
  try { showHops = localStorage.getItem('xl.sch.hops') !== '0'; } catch { /* default */ }
  const hopsBox = h('input', { type: 'checkbox', checked: showHops });
  hopsBox.addEventListener('change', () => { showHops = hopsBox.checked; try { localStorage.setItem('xl.sch.hops', showHops ? '1' : '0'); } catch { /* ignore */ } render(); });
  // (the toolbar's buttons and their clicks: sch-toolbar.js)
  const { optBox } = mountSchToolbar({
    container, btn, canSim, deleteSel: (...a) => deleteSel(...a), enterSim: (...a) => enterSim(...a),
    fit: (...a) => fit(...a), hopsBox, infoTarget: (...a) => infoTarget(...a), keepBox,
    leaveSim: (...a) => leaveSim(...a), live: () => live, mirrorSel: (...a) => mirrorSel(...a), namesBox,
    openInfo: (...a) => openInfo(...a), readOnly, redo: (...a) => redo(...a), rotateSel: (...a) => rotateSel(...a),
    runCheck: (...a) => runCheck(...a), sep, setTool: (...a) => setTool(...a), tb, undo: (...a) => undo(...a),
    zoomAt: (...a) => zoomAt(...a)
  });

  // ---------------- left: symbols palette (sch-palette.js)
  const { catSel, renderPalette, search, symInfo } = mountSchPalette({
    device: () => device, doc: () => doc, infoItem: () => infoItem, itemTarget: (...a) => itemTarget(...a), left,
    modules: () => modules, openInfo: (...a) => openInfo(...a), placing: () => placing, readOnly,
    showSymInfo: (...a) => showSymInfo(...a), startPlace: (...a) => startPlace(...a),
    setInfoItem: (v) => { infoItem = v; }
  });

  let infoItem = null;
  function itemTarget(it) { return { type: it.type, params: { ...defaultParams(it.type), ...clone(it.params || {}) }, preset: it.preset || null }; }
  function showSymInfo(it) {
    symInfo.innerHTML = '';
    if (!it) return;
    const lang = getLanguage();
    const sum = it.type === 'module' ? it.desc : symbolSummary(it.type, { ...defaultParams(it.type), ...it.params }, lang, it.preset || undefined);
    const more = h('a', { href: '#', class: 'se-more', text: 'More…', title: 'Datasheet of the symbol: pins, parameters, truth table, equivalent HDL' });
    more.addEventListener('click', e => { e.preventDefault(); openInfo(itemTarget(it)); });
    symInfo.append(h('b', { 'data-no-i18n': '', text: it.title }), ': ', h('span', { class: 'se-sum', 'data-no-i18n': '', text: sum }), ' ', more);
  }
  function renderCats() {
    const cur = catSel.value || '<all>';
    catSel.innerHTML = '';
    catSel.append(h('option', { value: '<all>', text: '<--All Symbols-->' }));
    for (const c of SYMBOL_CATEGORIES) catSel.append(h('option', { value: c, text: c }));
    catSel.value = cur;
  }
  catSel.addEventListener('change', renderPalette);
  search.addEventListener('input', renderPalette);
  renderCats();

  // ---------------- right: properties
  const propBody = h('div', { class: 'se-props' });
  right.append(h('div', { class: 'se-cap', text: 'Properties' }), propBody);

  // ---------------- view transform (sch-view.js)
  const { applyView, centerOn, fit, print, toSheet, zoomAt } = mountSchView({
    canvas, doc: () => doc, modules: () => modules, render: (...a) => render(...a), sel: () => sel,
    snapshot: (...a) => snapshot(...a), svg, updateStatus: (...a) => updateStatus(...a), view: () => view, vp,
    setSel: (v) => { sel = v; }
  });

  // ---------------- rendering (sch-render.js)
  function refreshNetlist() { try { nl = netlist(doc, { modules }); } catch (e) { console.error(e); nl = null; } }
  const { renderSheet, render, renderOverlay, updateToolbar, updateStatus } = mountRender({
    state: () => ({ doc, nl, sel, tool, placing, drag, wireDraw, cursor, hoverPin, lastDiags, live, modules, view, destroyed, showHops, showNames }),
    refreshNetlist, uidE, readOnly, sheetG, contentG, overlayG, tb, status, undoStack, redoStack,
    routeTo: (...a) => routeTo(...a), snapPoint: (...a) => snapPoint(...a), bandRect,
    infoTarget: (...a) => infoTarget(...a) });

  // ---------------- properties panel (sch-props.js)
  const { renderProps, openSelected, renamed, joinByName } = mountProps({ opts, container, propBody, readOnly, doc: () => doc, sel: () => sel, nl: () => nl,
    live: () => live, modules: () => modules, setGenLang: (v) => { genLang = v; }, edit: (...a) => edit(...a),
    flash: (...a) => flash(...a), rotateSel: (...a) => rotateSel(...a), mirrorSel: (...a) => mirrorSel(...a),
    deleteSel: (...a) => deleteSel(...a), nextId: (...a) => nextId(...a), openInfo: (...a) => openInfo(...a),
    infoTarget: (...a) => infoTarget(...a) });

  // ---------------- edits, undo, change notification (sch-edits.js)
  const { changed, edit, nextId, nextInstName, pruneSel, pushUndo, redo, snapshot, undo } = mountSchEdits({
    opts, changeTimer: () => changeTimer, destroyed: () => destroyed, doc: () => doc, lastDiags: () => lastDiags,
    live: () => live, readOnly, redoStack, render, renderProps, sel: () => sel, undoStack, setDoc: (v) => { doc = v; },
    setLastDiags: (v) => { lastDiags = v; }, setChangeTimer: (v) => { changeTimer = v; }
  });

  // ---------------- tools (sch-tools.js)
  const { setTool, renderOpts, startPlace, placeAt, connPoints, pinNear, snapPoint, routeTo, finishWire, wireClick, netClick, ioClick } = mountTools({
    doc: () => doc, nl: () => nl, sel: () => sel, modules: () => modules, view: () => view, hoverPin: () => hoverPin, destroyed: () => destroyed,
    tool: () => tool, placing: () => placing, wireDraw: () => wireDraw,
    set: (o) => { if ('tool' in o) tool = o.tool; if ('placing' in o) placing = o.placing; if ('wireDraw' in o) wireDraw = o.wireDraw; },
    readOnly, canvas, optBox, container, edit, flash: (...a) => flash(...a), shortNote, nextId, nextInstName,
    promptBox: (...a) => promptBox(...a), renderPalette, render, renderOverlay, renderProps,
    updateToolbar, updateStatus, joinByName, renamed });
  // a short of two named nets refused (#754, #806): the status line says why
  function shortNote(what, [a, b]) {
    flash(`${what} would short net '${a}' and net '${b}': two named nets cannot be joined. Rename one of them first (the same name connects them).`, 6000);
  }
  // a move or a paste that shorted two named nets (#806): the document as it was before, nothing to undo
  function refusedShort(before, what) {
    const short = netShort(JSON.parse(before), doc, { modules });
    if (!short) return false;
    doc = normalizeDoc(JSON.parse(before));
    pruneSel(); render(); renderProps();
    shortNote(what, short);
    return true;
  }

  // ---------------- selection operations (sch-select.js)
  const { copySel, deleteSel, mirrorSel, paste, rotateSel, selectAll, selected } = mountSchSelect({
    container, changed, destroyed: () => destroyed, doc: () => doc, edit, live: () => live, modules: () => modules,
    placing: () => placing, readOnly, refusedShort, render, renderOverlay, renderProps, sel: () => sel, setTool,
    snapshot, tool: () => tool, undoStack, setSel: (v) => { sel = v; }
  });

  // ---------------- moving with rubber-banding wires, dragging one segment of a wire (#688): sch-move.js
  const { beginMove, applyMove, beginSegMove, applySegMove, finishSegMove } = mountMove({ doc: () => doc, setDoc: (d) => { doc = d; },
    modules: () => modules, keepConn: () => keepConn, selected, connPoints, snapshot, pushUndo, changed, render,
    renderProps, flash: (...a) => flash(...a), nextId,
    refusedShort });
  // the selection band
  function bandRect(d = drag) { const a = d.start, b = d.cur || a; return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }
  function bandSelect(add, d = drag) {
    const r = bandRect(d);
    if (!add) sel.clear();
    for (const s of doc.symbols) { const b = symbolBox(s, modules); if (b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h) sel.add(`sym:${s.id}`); }
    for (const p of doc.ports) { const b = portBox(p); if (rectsTouch(b, r) && inside(p, r)) sel.add(`port:${p.id}`); }
    for (const w of doc.wires) if (w.points.every(p => inside(p, r))) sel.add(`wire:${w.id}`);
    for (const l of doc.labels) if (inside(l, r)) sel.add(`label:${l.id}`);
  }

  // ---------------- mouse
  const itemAt = target => { const g = target.closest?.('[data-kind]'); return g ? { kind: g.dataset.kind, id: g.dataset.id } : null; };
  let spaceDown = false;
  const { finishMove, onMove, onUp } = mountSchMouse({
    container, opts, applyMove, applySegMove, applyView, bandRect, bandSelect, beginMove, beginSegMove, canvas, changed,
    cursor: () => cursor, destroyed: () => destroyed, doc: () => doc, drag: () => drag, finishSegMove, finishWire,
    flash: (...a) => flash(...a), hoverPin: () => hoverPin, ioClick, itemAt, keepConn: () => keepConn, live: () => live,
    modules: () => modules, netClick, pinNear, placeAt, propBody, pushUndo, readOnly, refusedShort, render,
    renderOverlay, renderProps, sel: () => sel, setTool, spaceDown: () => spaceDown, svg, toSheet, tool: () => tool,
    updateStatus, view: () => view, wireClick, wireDraw: () => wireDraw, zoomAt, setCursor: (v) => { cursor = v; },
    setDoc: (v) => { doc = v; }, setDrag: (v) => { drag = v; }, setHoverPin: (v) => { hoverPin = v; },
    setSel: (v) => { sel = v; }, setWireDraw: (v) => { wireDraw = v; }
  });

  // ---------------- keyboard (sch-keys.js)
  const { onKey, onKeyUp } = mountSchKeys({
    container, opts, applyMove, beginMove, canvas, copySel, deleteSel, destroyed: () => destroyed, finishMove,
    finishWire, fit, infoTarget: (...a) => infoTarget(...a), leaveSim: (...a) => leaveSim(...a), live: () => live,
    mirrorSel, openInfo: (...a) => openInfo(...a), openSelected, paste, readOnly, redo, render, renderOverlay,
    renderProps, rotateSel, sel: () => sel, selectAll, setTool, spaceDown: () => spaceDown, tool: () => tool, undo,
    wireDraw: () => wireDraw, zoomAt, setSpaceDown: (v) => { spaceDown = v; }, setWireDraw: (v) => { wireDraw = v; }
  });

  // ---------------- check / generate / view (sch-check.js)
  const { runCheck } = mountSchCheck({
    doc: () => doc, genLang: () => genLang, lastDiags: () => lastDiags, modules: () => modules, nl: () => nl,
    refreshNetlist, showDiags: (...a) => showDiags(...a), updateStatus, setLastDiags: (v) => { lastDiags = v; }
  });

  // ---------------- live simulation (Logisim style): web/js/sch-live.js on core/schlive.js (sch-try.js)
  const { enterSim, leaveSim, showDiags } = mountSchTry({
    container, opts, canSim, canvas, centerOn, contentG, destroyed: () => destroyed, diagPanel, doc: () => doc,
    finishWire, flash: (...a) => flash(...a), genLang: () => genLang, hint, lastDiags: () => lastDiags,
    live: () => live, liveStarting: () => liveStarting, modules: () => modules, nl: () => nl, render, renderProps,
    sel: () => sel, setTool, simBar, simG, tool: () => tool, updateStatus, view: () => view, wireDraw: () => wireDraw,
    setLive: (v) => { live = v; }, setLiveStarting: (v) => { liveStarting = v; },
    setLastDiags: (v) => { lastDiags = v; }, setSel: (v) => { sel = v; }
  });

  // ---------------- Symbol Info (datasheet of the selected / palette symbol): web/js/symbol-info.js
  let infoDlg = null;
  // (the symbol it is about, its datasheet opened: sch-info.js)
  const { infoTarget, openInfo } = mountSchInfo({
    container, destroyed: () => destroyed, device: () => device, doc: () => doc, genLang: () => genLang,
    infoDlg: () => infoDlg, infoItem: () => infoItem, itemTarget, modules: () => modules, placing: () => placing,
    sel: () => sel, selected, tool: () => tool, setInfoDlg: (v) => { infoDlg = v; }
  });

  const offLang = onLanguageChange(() => { if (infoItem) showSymInfo(infoItem); if (!live) renderProps(); });


  // ---------------- small UI helpers (sch-ui.js)
  const { flash, promptBox } = mountSchUi({
    container, canvas, hint, svg, view: () => view
  });

  // ---------------- resize
  let ro = null;
  let fitted = false;
  if (typeof ResizeObserver !== 'undefined') {
    ro = new ResizeObserver(() => { if (!fitted) { const r = svg.getBoundingClientRect(); if (r.width > 20 && r.height > 20) { fitted = true; fit(); } } });
    ro.observe(canvas);
  }

  // ---------------- init
  renderSheet();
  renderPalette();
  renderOpts();
  render();
  renderProps();
  setTimeout(() => { if (!fitted) { fitted = true; fit(); } }, 0);

  return {
    getDoc: () => clone(normalizeDoc(doc)),
    undo: () => undo(), redo: () => redo(),
    canUndo: () => undoStack.length > 0 && !live, canRedo: () => redoStack.length > 0 && !live,
    // Edit ▸ Cut / Copy / Paste / Delete (#677)
    copy: () => copySel(), cut: () => copySel(true), paste: () => paste(), deleteSelection: () => { if (!live) deleteSel(); },
    canCopy: () => !readOnly && !live && sel.size > 0, canPaste: () => !readOnly && !live && hasClip('schematic'),
    setDoc(d) { leaveSim(); infoDlg?.close(); doc = normalizeDoc(d || newDoc(), { modules }); undoStack.length = 0; redoStack.length = 0; sel.clear(); lastDiags = null; genLang = doc.lang; diagPanel.hidden = true; renderSheet(); renderPalette(); render(); renderProps(); fit(); },
    // its HDL file linked (generatedFile, #245): nothing else changes, Undo / Redo keep the link
    setLink(file) {
      linkModel(doc, file);
      for (const st of [undoStack, redoStack]) st.forEach((s, i) => { st[i] = linkSnapshot(s, file); });
    },
    // (called after every compile of the project: the same modules again change nothing, so that the palette and
    // the properties are not made anew between the press and the release of a click on them, #339)
    /** The project's part changed (Design Properties): the palette's Device Primitives follow its family (#791). */
    setDevice(part) {
      if ((part?.part || null) === (device?.part || null)) return;
      device = part || null;
      renderPalette();
    },
    setModules(m) {
      const next = normMods(m);
      if (!live && JSON.stringify(next) === JSON.stringify(modules)) return;
      leaveSim(); modules = next;
      // (a document of version 2 with module symbols, converted once their pins are known, #678)
      if (+doc.version < 3) doc = normalizeDoc(doc, { modules });
      renderPalette(); render(); renderProps();
    },
    check: () => runCheck(true),
    openSelected,
    fit,
    print,
    simulate: enterSim,
    stopSimulation: leaveSim,
    get simulating() { return !!live; },
    get liveSim() { return live?.live || null; },
    /** Open the Symbol Info datasheet ({ type, params, preset } or the current target); resolves to the dialog. */
    symbolInfo: target => openInfo(target || infoTarget()),
    get symbolInfoDialog() { return infoDlg; },
    destroy() {
      infoDlg?.close(); offLang();
      live?.destroy(); live = null;
      destroyed = true;
      clearTimeout(changeTimer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      ro?.disconnect();
      container.innerHTML = '';
      container.classList.remove('sch-editor');
    },
  };
}
