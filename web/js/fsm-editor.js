// Silinx - FSM state diagram editor (bubble diagrams, documents <name>.fsm.json; SVG, no framework).
//
//   import { mountFsmEditor } from './fsm-editor.js';
//   const ed = mountFsmEditor(container, { model, onChange(model), linkInfo() -> { file, why } | null,
//                                          onOpenFile(path), onTruthTables(), onToAsm() });
//   ed.getModel(); ed.setModel(m); ed.setLink(file); ed.refreshLink(); ed.fit(); ed.print(); ed.destroy();
//
// States are circles (the initial state has a double circle and an entry arrow); transitions are
// curved arrows labelled "condition / outputs" (Mealy outputs) — Moore outputs are written inside
// the circles. Double-click the background to add a state, drag from the rim of a state to another
// state (or to itself) to add a transition, double-click a state or a label to edit it in place,
// drag a label to bend its arrow. The bottom panel shows the tables (transition table, state
// table, encoded table for the binary / gray encodings), the generated HDL and a step-by-step
// simulation of the diagram (current state highlighted, inputs set by hand, clock steps).
// Model, validation, tables and HDL: core/fsm.js. Styles: asm-editor.css (shared look) + fsm-editor.css.

import { h, undoButton, linkModel, linkSnapshot } from './ui.js';
import { toolbarMenu } from './toolbar-menu.js';
import { sv } from './dom.js';
import { panelToggle, PROPS_KEY } from './narrow.js';
import {
  normalizeFsm, newFsm, validateFsm, formatOutputs, FSM_ENCODINGS, STATE_R,
} from '/core/fsm.js';
import { mountSide } from './fsm-side.js';
import { mountRender } from './fsm-render.js';
import { copyDrawing, pasteDrawing, drawingClipEmpty } from '/core/drawclip.js';
import { writeClip, readClip, hasClip } from './clipboard.js';
import { mountFsmBottom } from './fsm-bottom.js';
import { mountFsmPointer } from './fsm-pointer.js';
import { mountFsmInline } from './fsm-inline.js';
import { mountFsmView } from './fsm-view.js';
import { mountFsmHistory } from './fsm-history.js';
import { clone } from '/core/util.js';
export { clone };   // (core/util.js's)

const SVGNS = 'http://www.w3.org/2000/svg';
const GRID = 20;
let instances = 0;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export { sv };   // (web/js/dom.js's)
const CHW = 7.3;                       // width of a 12px monospace character
export const textW = (s) => String(s).length * CHW;

/** Radius of a state circle (grows with its texts). */
export function radiusOf(s) {
  const outs = formatOutputs(s.outputs);
  return Math.max(STATE_R, Math.ceil(textW(s.name) * 1.1 / 2) + 12, Math.ceil(textW(outs) / 2) + 10);
}

export function mountFsmEditor(container, opts = {}) {
  const uid = `fsm${++instances}`;
  let M = normalizeFsm(opts.model || newFsm('fsm'));
  let sel = null;                      // { type: 'state' | 'trans', id }
  let view = { tx: 40, ty: 40, k: 1 };
  // the view fitted once, when the canvas first has a size, or the user's from the first press or zoom: a first
  // fit coming late (the canvas sized on a slow machine) moved the drawing under the pointer while it dragged (#339)
  let fitted = false;
  let hist = [JSON.stringify(M)], hi = 0, lastKey = null, lastT = 0;
  let diags = [];
  let drag = null;
  let destroyed = false;
  let panel = null;                    // 'tables' | 'code' | 'sim' | null
  let sim = null;                      // { state, inputs: {}, trace: [], timer }
  const timers = {};

  container.innerHTML = '';
  const root = h('div', { class: 'asm-editor fsm-editor', tabindex: '0' });
  container.append(root);
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label);
  const sep = () => h('span', { class: 'asm-sep' });
  const select = (cls, title, items, onchange) => {
    const s = h('select', { class: `asm-select ${cls}`, title, onchange: () => onchange(s.value) }, ...items.map(([v, l]) => h('option', { value: v }, l)));
    return s;
  };

  // ---------------------------------------------------------------------------- toolbar
  const typeSel = select('fsm-type', 'Moore machine: outputs depend on the state only (written in the circles). Mealy machine: outputs also on the transitions (condition / outputs).',
    [['moore', 'Moore'], ['mealy', 'Mealy']], (v) => { M.type = v; commit('type'); renderSide(); });
  const encSel = select('fsm-enc', 'State encoding', FSM_ENCODINGS.map((e) => [e, { binary: 'Binary', gray: 'Gray', onehot: 'One-hot', enum: 'Enumerated' }[e]]),
    (v) => { M.encoding = v; commit('enc'); });
  const styleSel = select('fsm-style', 'Style of the generated HDL', [['3process', '3 processes'], ['2process', '2 processes']], (v) => { M.style = v; commit('style'); });
  const undoBtn = undoButton('undo', () => undo());
  const redoBtn = undoButton('redo', () => redo());
  const zoomLbl = h('span', { class: 'asm-zoom', title: 'Zoom level' }, '100%');
  const delBtn = btn('✕', 'Delete the selected state or transition (Del)', () => deleteSelection(), 'asm-danger');
  const tabBtns = {
    tables: btn('Tables', 'State table, transition table and encoded transition table', () => togglePanel('tables'), 'fsm-tab-btn'),
    code: btn('</> HDL', 'Show / hide the generated HDL', () => togglePanel('code'), 'fsm-tab-btn'),
    sim: btn('▶ Simulate', 'Step through the diagram: set the inputs, apply clock edges, see the state and the outputs', () => togglePanel('sim'), 'fsm-tab-btn'),
  };
  const linkHost = h('span', { class: 'fsm-link' });
  const toolbar = h('div', { class: 'asm-toolbar fsm-toolbar' },
    h('div', { class: 'asm-group' },
      btn([h('span', { class: 'fsm-ico-state' }), 'State'], 'Add a state (or double-click the drawing)', () => addState()),
      delBtn),
    sep(),
    h('div', { class: 'asm-group' }, undoBtn, redoBtn),
    sep(),
    h('div', { class: 'asm-group' },
      btn('Arrange', 'Automatic layout of the states', () => arrange()),
      btn('−', 'Zoom out', () => zoomBy(1 / 1.2)), zoomLbl, btn('+', 'Zoom in', () => zoomBy(1.2)),
      btn('Fit', 'Fit the diagram in the window', () => fit()),
      btn('🖨', 'Print the diagram / save it as PDF or SVG (Ctrl+P)', () => print())),
    sep(),
    h('div', { class: 'asm-group' }, typeSel, encSel, styleSel),
    h('div', { class: 'asm-spacer' }),
    h('div', { class: 'asm-group' }, panelToggle(root, btn('☰ Properties', 'Show / hide the properties panel'), { key: PROPS_KEY }), tabBtns.tables, tabBtns.code, tabBtns.sim),
    toolbarMenu([btn('Convert to ASM chart', 'Make an ASM chart (.asm.json) of this state machine', () => opts.onToAsm?.())], { title: 'Convert the diagram', btnClass: 'asm-btn' }).el,
    linkHost);

  // ---------------------------------------------------------------------------- canvas
  const svg = sv('svg', { class: 'asm-canvas fsm-canvas' });
  svg.innerHTML = `
    <defs>
      <pattern id="${uid}-grid" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse"><circle cx="0.5" cy="0.5" r="0.9" class="asm-griddot"/></pattern>
      <marker id="${uid}-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,1 L10,5 L0,9 z" class="fsm-arrowhead"/></marker>
      <marker id="${uid}-arr-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,1 L10,5 L0,9 z" class="fsm-arrowhead sel"/></marker>
      <marker id="${uid}-arr-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,1 L10,5 L0,9 z" class="fsm-arrowhead hot"/></marker>
    </defs>
    <rect class="asm-bg fsm-bg" x="0" y="0" width="100%" height="100%" fill="url(#${uid}-grid)"/>
    <g class="fsm-vp"><g class="fsm-edges"></g><g class="fsm-states"></g><g class="fsm-overlay"></g></g>`;
  const vp = svg.querySelector('.fsm-vp');
  const gEdges = svg.querySelector('.fsm-edges'), gStates = svg.querySelector('.fsm-states'), gOverlay = svg.querySelector('.fsm-overlay');
  const pattern = svg.querySelector('pattern');
  const hint = h('div', { class: 'asm-hint' }, 'Double-click to add a state · drag from the rim of a state to another state to add a transition · double-click to edit · drag a label to bend its arrow · wheel to zoom');
  const canvasWrap = h('div', { class: 'asm-canvas-wrap' }, svg, hint);

  // bottom panel (tables / HDL / simulation)
  const panelTitle = h('span', { class: 'asm-code-title' });
  const panelTools = h('span', { class: 'fsm-panel-tools' });
  const panelBody = h('div', { class: 'fsm-panel-body' });
  const bottom = h('div', { class: 'asm-codepanel fsm-panel', hidden: true },
    h('div', { class: 'asm-codebar' }, panelTitle, panelTools, h('div', { class: 'asm-spacer' }), btn('✕', 'Close the panel', () => togglePanel(null))),
    panelBody);
  const mainCol = h('div', { class: 'asm-main' }, canvasWrap, bottom);

  // side panel
  const selSection = h('section', { class: 'asm-section fsm-selection' });
  const machineBody = h('div', { class: 'asm-section-body' });
  const machineSection = h('details', { class: 'asm-section', open: true }, h('summary', {}, 'Machine'), machineBody);
  const probList = h('ul', { class: 'asm-problems' });
  const probCount = h('span', { class: 'asm-prob-count' });
  const probSection = h('details', { class: 'asm-section fsm-problems', open: true }, h('summary', {}, 'Problems ', probCount), probList);
  const side = h('aside', { class: 'asm-side' }, selSection, machineSection, probSection);
  const statusMsg = h('span', { class: 'asm-status-msg' });
  const statusInfo = h('span', { class: 'asm-status-info' });
  root.append(toolbar, h('div', { class: 'asm-body' }, mainCol, side), h('div', { class: 'asm-status' }, statusInfo, statusMsg));

  // ---------------------------------------------------------------------------- model helpers
  const stateById = (id) => M.states.find((s) => s.id === id);
  const transById = (id) => M.transitions.find((t) => t.id === id);
  const newId = (p) => { const used = new Set([...M.states.map((s) => s.id), ...M.transitions.map((t) => t.id)]); let i = 1; while (used.has(`${p}${i}`)) i++; return `${p}${i}`; };
  const uniqueName = () => { const used = new Set(M.states.map((s) => s.name.toLowerCase())); let i = 0; while (used.has(`s${i}`)) i++; return `S${i}`; };
  const snapV = (v) => Math.round(v / (GRID / 2)) * (GRID / 2);

  function addState(at) {
    let p = at;
    if (!p) {
      const r = svg.getBoundingClientRect();
      p = toWorld(r.left + r.width / 2, r.top + r.height / 2);
      for (let k = 0; k < 40 && M.states.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 2 * STATE_R + 20); k++) p = { x: p.x + 60, y: p.y + (k % 2 ? 50 : 0) };
    }
    const s = { id: newId('s'), name: uniqueName(), x: snapV(p.x), y: snapV(p.y), outputs: {} };
    M.states.push(s);
    if (!M.initial) M.initial = s.id;
    sel = { type: 'state', id: s.id };
    commit();
    renderSide();
    flash(`State ${s.name} added`);
    return s;
  }
  function addTransition(from, to) {
    const t = { id: newId('t'), from, to, cond: '', outputs: {} };
    M.transitions.push(t);
    sel = { type: 'trans', id: t.id };
    commit();
    renderSide();
    setTimeout(() => editLabel(t), 0);
  }
  function deleteSelection() {
    if (!sel) return;
    if (sel.type === 'state') {
      M.states = M.states.filter((s) => s.id !== sel.id);
      M.transitions = M.transitions.filter((t) => t.from !== sel.id && t.to !== sel.id);
      if (M.initial === sel.id) M.initial = M.states[0]?.id ?? '';
    } else M.transitions = M.transitions.filter((t) => t.id !== sel.id);
    sel = null;
    commit();
    renderSide();
  }

  // Cut / Copy / Paste (#677, core/drawclip.js): the state selected with its self-loops, pasted offset and
  // selected, its name made new when it is used
  let pasteN = 0, pasteText = null;
  function copySel(cut = false) {
    if (sel?.type !== 'state') return;
    const clip = copyDrawing('fsm', M, [sel.id]);
    writeClip('fsm', clip);
    pasteText = JSON.stringify(clip); pasteN = 0;   // (pasted here: next to the original)
    if (cut) deleteSelection();
  }
  async function paste(clip) {
    clip ??= await readClip('fsm');
    if (drawingClipEmpty('fsm', clip) || destroyed) return;
    const t = JSON.stringify(clip);
    if (t !== pasteText) { pasteText = t; pasteN = clip.from === M.name ? 0 : -1; }
    const d = 2 * GRID * ++pasteN;
    const { ids } = pasteDrawing('fsm', M, clip, { dx: d, dy: d });
    if (ids.length) sel = { type: 'state', id: ids[0] };
    commit('paste');
    renderSide();
    root.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------- history (fsm-history.js)
  const { commit, redo, undo, updateToolbar } = mountFsmHistory({
    opts, M: () => M, delBtn, destroyed: () => destroyed, encSel, hi: () => hi, hist: () => hist,
    lastKey: () => lastKey, lastT: () => lastT, panel: () => panel, redoBtn, render: (...a) => render(...a),
    renderPanel: (...a) => renderPanel(...a), renderSide: (...a) => renderSide(...a), sel: () => sel, stateById,
    statusInfo, styleSel, tabBtns, timers, transById, typeSel, undoBtn, validateSoon: (...a) => validateSoon(...a),
    setM: (v) => { M = v; }, setHist: (v) => { hist = v; }, setHi: (v) => { hi = v; },
    setLastKey: (v) => { lastKey = v; }, setLastT: (v) => { lastT = v; }, setSel: (v) => { sel = v; }
  });

  let flashTimer = null;
  function flash(msg, kind = '') {
    statusMsg.textContent = msg; statusMsg.className = `asm-status-msg ${kind}`;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { statusMsg.textContent = ''; }, 4000);
  }

  // ---------------------------------------------------------------------------- view (fsm-view.js)
  const { applyView, arrange, fit, print, toScreen, toWorld, zoomAt, zoomBy } = mountFsmView({
    M: () => M, commit, fitted: () => fitted, gEdges, pattern, render: (...a) => render(...a), sel: () => sel, svg,
    view: () => view, vp, zoomLbl, setFitted: (v) => { fitted = v; }, setView: (v) => { view = v; },
    setSel: (v) => { sel = v; }
  });

  // ---------------------------------------------------------------------------- geometry, rendering (fsm-render.js)
  const { encOf, geom, render } = mountRender({ state: () => ({ M, sel, diags, sim, destroyed }), uid, gEdges, gStates, stateById, updateToolbar });

  // ---------------------------------------------------------------------------- inline editing (fsm-inline.js)
  const { closeInline, editLabel, editState } = mountFsmInline({
    M: () => M, canvasWrap, commit, flash, geom, renderSide: (...a) => renderSide(...a), root, stateById, toScreen,
    transById
  });

  // ---------------------------------------------------------------------------- pointer (fsm-pointer.js)
  mountFsmPointer({
    M: () => M, addState, addTransition, applyView, closeInline, commit, copySel, deleteSelection, drag: () => drag,
    editLabel, editState, fit, fitted: () => fitted, gOverlay, gStates, geom, paste, print, redo, render,
    renderSide: (...a) => renderSide(...a), root, sel: () => sel, snapV, stateById, svg, toWorld, transById, uid, undo,
    view: () => view, zoomAt, zoomBy, setFitted: (v) => { fitted = v; }, setSel: (v) => { sel = v; },
    setDrag: (v) => { drag = v; }
  });

  // ---------------------------------------------------------------------------- side panel (fsm-side.js)
  const { renderSide } = mountSide({ M: () => M, sel: () => sel, setSel: (s) => { sel = s; }, selSection, machineBody, btn, stateById, transById,
    encOf, commit, deleteSelection, render, updateToolbar });

  // ---------------------------------------------------------------------------- problems
  function validateSoon() { clearTimeout(timers.val); timers.val = setTimeout(runValidate, 120); }
  function runValidate() {
    if (destroyed) return;
    diags = validateFsm(M);
    probList.textContent = '';
    const n = (s) => diags.filter((d) => d.severity === s).length;
    probCount.textContent = diags.length ? `(${n('error')} error(s), ${n('warning')} warning(s))` : '';
    probCount.className = `asm-prob-count ${n('error') ? 'c-err' : n('warning') ? 'c-warn' : 'c-ok'}`;
    if (!diags.length) probList.append(h('li', { class: 'asm-prob ok' }, h('span', { class: 'asm-sev' }, '✓'), h('span', {}, 'No problems: the diagram is complete.')));
    for (const d of diags) {
      const li = h('li', { class: `asm-prob ${d.severity}${d.state || d.transition ? ' link' : ''}` },
        h('span', { class: 'asm-sev' }, d.severity === 'error' ? '✖' : d.severity === 'warning' ? '▲' : 'i'), h('span', { class: 'fsm-msg' }, d.message));
      if (d.transition || d.state) li.addEventListener('click', () => { sel = d.transition ? { type: 'trans', id: d.transition } : { type: 'state', id: d.state }; render(); renderSide(); });
      probList.append(li);
    }
    render();
    if (panel === 'code') renderPanel();
  }

  // ---------------------------------------------------------------------------- bottom panel (fsm-bottom.js)
  const { renderPanel, resetSim, stopRun, togglePanel } = mountFsmBottom({
    opts, M: () => M, bottom, btn, destroyed: () => destroyed, diags: () => diags, fit, flash, hint, panel: () => panel,
    panelBody, panelTitle, panelTools, render, sim: () => sim, stateById, updateToolbar,
    setPanel: (v) => { panel = v; }, setSim: (v) => { sim = v; }
  });

  // ---------------------------------------------------------------------------- link
  function refreshLink() {
    linkHost.textContent = '';
    const L = opts.linkInfo?.();
    if (!L) return;
    const a = h('a', { onclick: () => opts.onOpenFile?.(L.file) }, L.file.split('/').pop());
    linkHost.append(h('span', { class: `gen-banner${L.why ? ' out-of-sync' : ''}`, title: L.why || `HDL: ${L.file.split('/').pop()} — generated from the diagram` },
      L.why ? 'Not in sync with ' : 'HDL: ', a, L.why ? ` — ${L.why}` : ' — generated from the diagram'));
  }

  // ---------------------------------------------------------------------------- init
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (!fitted) fitted = tryFit(); }) : null;
  const tryFit = () => { const r = svg.getBoundingClientRect(); if (r.width < 10 || r.height < 10) return false; fit(); return true; };
  ro?.observe(svg);
  applyView();
  render();
  renderSide();
  runValidate();
  refreshLink();
  requestAnimationFrame(() => { if (!fitted) fitted = tryFit(); });

  return {
    getModel: () => clone(M),
    undo: () => undo(), redo: () => redo(),
    canUndo: () => hi > 0, canRedo: () => hi < hist.length - 1,
    // Edit ▸ Cut / Copy / Paste / Delete (#677): a state (a transition: Delete only)
    copy: () => copySel(), cut: () => copySel(true), paste: () => paste(), deleteSelection: () => deleteSelection(),
    canCopy: () => sel?.type === 'state', canDelete: () => !!sel, canPaste: () => hasClip('fsm'),
    setModel(m) {
      closeInline(false);
      M = normalizeFsm(m);
      hist = [JSON.stringify(M)]; hi = 0; lastKey = null;
      if (sel && !(sel.type === 'state' ? stateById(sel.id) : transById(sel.id))) sel = null;
      if (sim && !stateById(sim.state)) resetSim();
      render(); renderSide(); runValidate(); refreshLink(); if (panel) renderPanel();
    },
    // its HDL file linked (generatedFile, #245): nothing else changes, Undo / Redo keep the link
    setLink(file) { linkModel(M, file); hist = hist.map((s) => linkSnapshot(s, file, normalizeFsm)); refreshLink(); },
    refreshLink,
    validate: () => { runValidate(); return diags.slice(); },
    showPanel: (p) => { if (panel !== p) togglePanel(p); },
    fit,
    print,
    destroy() {
      destroyed = true;
      stopRun();
      Object.values(timers).forEach(clearTimeout);
      clearTimeout(flashTimer);
      ro?.disconnect();
      root.remove();
    },
  };
}

export default mountFsmEditor;
