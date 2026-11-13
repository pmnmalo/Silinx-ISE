// Silinx - FSM state diagram editor (bubble diagrams, documents <name>.fsm.json; SVG, no framework).
//
//   import { mountFsmEditor } from './fsm-editor.js';
//   const ed = mountFsmEditor(container, { model, onChange(model), linkInfo() -> { file, why } | null,
//                                          onOpenFile(path), onTruthTables(), onToAsm(), onVerify(model), onMessage(text), onProblems(diags), onCheck(diags),
//                                          readOnly, banner });
//   ed.getModel(); ed.setModel(m); ed.setLink(file); ed.refreshLink(); ed.focus(d); ed.fit(); ed.fitted(); ed.print(); ed.destroy();
//   ed.setShared({ push(model, key), undo(), redo(), canUndo(), canRedo() } | null); ed.applyModel(m, { renamed, mine }); ed.busy();
//
// States are circles (the initial state has a double circle and an entry arrow); transitions are
// curved arrows labelled "condition / outputs" (Mealy outputs) — Moore outputs are written inside
// the circles; the reset's name on the arrow into the initial state. Double-click the background to add a state,
// drag from the rim of a state to another state (or to itself) to add a transition, double-click a state or a label to
// edit it in place (a text not valid: onMessage), drag a label to bend its arrow. Its problems are not shown in it:
// onProblems(diags) after every validation (drawings.js: the console's Errors and Warnings, editor-problems.js, #2737). The bottom panel shows the tables
// (transition table, state table, encoded table for the binary / gray encodings) and a step-by-step simulation of the
// diagram (current state highlighted, inputs set by hand, clock steps).
// readOnly: a diagram to read (a Petri net's state machine, #2696): moved about, zoomed, its states and transitions
// selected and shown, its tables and its simulation; nothing edited, not validated.
// Model, validation, tables and HDL: core/fsm.js. Styles: asm-editor.css (shared look) + fsm-editor.css.

import { h, linkModel, linkSnapshot } from './ui.js';
import { menuChoice, setChoice, toolbarMenu } from './toolbar-menu.js';
import { mountSideFold } from './side-fold.js';
import { toolIcon, toolWide, zoomTools } from './editor-icons.js';
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
import { statusLine } from './status-line.js';
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

// (read-only, #2696: the tools that change the diagram, Check, the ⋮ menu (Layout and conversion, the HDL's settings)
// hidden, with their separators; its notice, `banner`, at the right end of the toolbar, #2710)
function readOnlyChrome({ root, toolbar, banner }) {
  root.classList.add('asm-readonly');
  const groups = [...toolbar.children].filter((g) => g.querySelector('.fsm-ico-state, .asm-danger, .fsm-check'));
  for (const g of [...groups, ...groups.map((g) => g.nextElementSibling), toolbar.querySelector('.fsm-link').previousElementSibling]) g.hidden = true;
  if (banner) toolbar.querySelector('.fsm-link').after(banner);
}

/** The encodings' names, in the toolbar's select and the status line (#2763). */
export const FSM_ENCODING_NAMES = { binary: 'Binary', gray: 'Gray', onehot: 'One-hot', enum: 'Enumerated' };

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
  let panel = null;                    // 'tables' | 'sim' | null
  let shared = null;                   // the shared history of a diagram edited live (#3183, collab-drawing.js)
  let sim = null;                      // { state, inputs: {}, trace: [], timer }
  const timers = {};

  container.innerHTML = '';
  const root = h('div', { class: 'asm-editor fsm-editor', tabindex: '0' });
  container.append(root);
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label);
  const sep = () => h('span', { class: 'asm-sep' });

  // ---------------------------------------------------------------------------- toolbar
  // (the state encoding and the generated HDL's style, rarely changed: choices of the ⋮ menu, #3289; encSel.value = …
  // and styleSel.value = … move their ✓; the encoding stays in the status line, #2763)
  const encItems = menuChoice('Encoding', FSM_ENCODINGS.map((e) => ({ value: e, label: FSM_ENCODING_NAMES[e] })),
    { value: M.encoding, title: 'State encoding', onChange: (v) => { M.encoding = v; commit('enc'); } });
  const encSel = { set value(v) { setChoice(encItems, v); } };
  const styleItems = menuChoice('Coding Style', [{ value: '3process', label: '3 processes' }, { value: '2process', label: '2 processes' }],
    { value: M.style, title: 'Style of the generated HDL', onChange: (v) => { M.style = v; commit('style'); } });
  const styleSel = { set value(v) { setChoice(styleItems, v); } };
  const zoomLbl = h('span', { class: 'asm-zoom', title: 'Zoom level' }, '100%');
  // (what the diagram is, its states and transitions, Moore or Mealy, its encoding: in its status line, #2763)
  const status = statusLine();
  const delBtn = toolIcon('delete', 'del', 'Delete the selected state or transition (Del)', () => deleteSelection(), 'asm-danger');
  // (Check, #2803: its problems in the console, as the ASM chart's Validate)
  const checkBtn = toolWide('check', 'Check', 'Check the diagram for errors and warnings', () => { runValidate(); opts.onCheck?.(diags.slice()); }, 'fsm-check');
  const tabBtns = {
    tables: btn('Tables', 'State table, transition table and encoded transition table', () => togglePanel('tables'), 'fsm-tab-btn'),
    sim: toolWide('sim', 'Try it', 'Step through the diagram: set the inputs, apply clock edges, see the state and the outputs', () => togglePanel('sim'), 'fsm-tab-btn'),
  };
  const linkHost = h('span', { class: 'fsm-link' });
  const toolbar = h('div', { class: 'asm-toolbar fsm-toolbar' },
    h('div', { class: 'asm-group' },
      btn([h('span', { class: 'fsm-ico-state' }), 'State'], 'Add a state (or double-click the drawing)', () => addState(), 'asm-wide')),
    sep(),
    h('div', { class: 'asm-group' }, delBtn),
    sep(),
    h('div', { class: 'asm-group' }, ...zoomTools((f) => zoomBy(f), () => fit()), zoomLbl),
    sep(),
    h('div', { class: 'asm-group' }, checkBtn),
    sep(),
    h('div', { class: 'asm-group' }, tabBtns.tables, tabBtns.sim),
    h('div', { class: 'asm-spacer' }),
    h('div', { class: 'asm-group' }, panelToggle(root, btn('☰ Properties', 'Show / hide the properties panel'), { key: PROPS_KEY })),
    toolbarMenu([
      btn('Arrange', 'Automatic layout of the states', () => arrange()),
      btn('Convert to ASM chart', 'Make an ASM chart (.asm.json) of this state machine', () => opts.onToAsm?.()),
      // (Verify Property, #3177: web/js/verify-props.js)
      ...(opts.onVerify ? [btn('Verify Property…', 'Prove a property of the state machine: a state never reached, a state reached, outputs never 1 together', () => opts.onVerify(clone(M)))] : []),
      ...encItems, ...styleItems,
    ], { title: 'Layout and conversion', btnClass: 'asm-btn' }).el,
    linkHost);
  const readOnly = !!opts.readOnly;

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
  const canvasWrap = h('div', { class: 'asm-canvas-wrap' }, svg);

  // bottom panel (tables / simulation)
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
  // (the machine's section always open, as the selection's: a title, not a fold, #2729)
  const machineSection = h('section', { class: 'asm-section fsm-machine' }, h('h3', {}, 'Machine'), machineBody);
  const side = h('aside', { class: 'asm-side' }, h('div', { class: 'asm-cap' }, 'Properties'), selSection, machineSection);
  mountSideFold({ root, side, key: 'silinx.fsm.props.folded' });
  if (readOnly) readOnlyChrome({ root, toolbar, banner: opts.banner });
  root.append(toolbar, h('div', { class: 'asm-body' }, mainCol, side), status.el);

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
    return s;
  }
  function addTransition(from, to, shape = {}) {
    const t = { id: newId('t'), from, to, cond: '', outputs: {}, ...shape };
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
  const { applyModel, commit, redo, setShared, undo, updateToolbar } = mountFsmHistory({
    opts, M: () => M, delBtn, destroyed: () => destroyed, encSel, hi: () => hi, hist: () => hist,
    lastKey: () => lastKey, lastT: () => lastT, panel: () => panel, render: (...a) => render(...a),
    renderPanel: (...a) => renderPanel(...a), renderSide: (...a) => renderSide(...a), sel: () => sel, stateById,
    status, styleSel, tabBtns, timers, transById, validateSoon: (...a) => validateSoon(...a),
    setM: (v) => { M = v; }, setHist: (v) => { hist = v; }, setHi: (v) => { hi = v; },
    setLastKey: (v) => { lastKey = v; }, setLastT: (v) => { lastT = v; }, setSel: (v) => { sel = v; },
    shared: () => shared, setSharedRef: (v) => { shared = v; }, simGone: () => { if (sim && !stateById(sim.state)) resetSim(); }
  });

  // (a text typed in place that is not valid: to the console, by the document, #2729, as every message, #2718)
  const flash = (msg) => opts.onMessage?.(msg);

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
    editLabel, editState, fit, fitted: () => fitted, gOverlay, gStates, geom, paste, print, readOnly, redo, render,
    renderSide: (...a) => renderSide(...a), root, sel: () => sel, snapV, stateById, svg, toWorld, transById, uid, undo,
    view: () => view, zoomAt, zoomBy, setFitted: (v) => { fitted = v; }, setSel: (v) => { sel = v; },
    setDrag: (v) => { drag = v; }
  });

  // ---------------------------------------------------------------------------- side panel (fsm-side.js)
  const { renderSide } = mountSide({ M: () => M, sel: () => sel, setSel: (s) => { sel = s; }, selSection, machineBody, machineSection, btn, stateById, transById,
    encOf, commit, deleteSelection, readOnly, render, updateToolbar });

  // ---------------------------------------------------------------------------- problems (to onProblems: the console, #2737)
  function validateSoon() { clearTimeout(timers.val); timers.val = setTimeout(runValidate, 120); }
  function runValidate() {
    if (destroyed || readOnly) return;
    diags = validateFsm(M);
    opts.onProblems?.(diags.slice());
    render();
  }
  // the state or the transition a problem is about selected (a click on its row in the console)
  function focus(d) {
    const s = d.transition ? { type: 'trans', id: d.transition } : d.state ? { type: 'state', id: d.state } : null;
    if (!s || !(s.type === 'state' ? stateById(s.id) : transById(s.id))) return;
    sel = s; render(); renderSide(); root.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------------------- bottom panel (fsm-bottom.js)
  const { renderPanel, resetSim, stopRun, togglePanel } = mountFsmBottom({
    opts, M: () => M, bottom, btn, destroyed: () => destroyed, diags: () => diags, fit, flash, panel: () => panel,
    panelBody, panelTitle, panelTools, render, sim: () => sim, stateById, updateToolbar,
    setPanel: (v) => { panel = v; }, setSim: (v) => { sim = v; }
  });

  // ---------------------------------------------------------------------------- link
  function refreshLink() {
    linkHost.textContent = '';
    const L = opts.linkInfo?.();
    // (only when its HDL is not in sync, as the Boolean algebra's: the file in sync unsaid, its name in data-hdl, #2505)
    linkHost.dataset.hdl = L?.file && !L.why ? L.file.split('/').pop() : '';
    if (!L?.why) return;
    const a = h('a', { onclick: () => opts.onOpenFile?.(L.file) }, L.file.split('/').pop());
    linkHost.append(h('span', { class: 'gen-banner out-of-sync', title: L.why }, 'Not in sync with ', a, ` — ${L.why}`));
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
    canUndo: () => (shared ? shared.canUndo() : hi > 0), canRedo: () => (shared ? shared.canRedo() : hi < hist.length - 1),
    // Edit ▸ Cut / Copy / Paste / Delete (#677): a state (a transition: Delete only)
    copy: () => copySel(), cut: () => copySel(true), paste: () => paste(), deleteSelection: () => deleteSelection(),
    canCopy: () => sel?.type === 'state', canDelete: () => !readOnly && !!sel, canPaste: () => !readOnly && hasClip('fsm'),
    setModel(m) {
      closeInline(false);
      M = normalizeFsm(m);
      hist = [JSON.stringify(M)]; hi = 0; lastKey = null;
      if (sel && !(sel.type === 'state' ? stateById(sel.id) : transById(sel.id))) sel = null;
      if (sim && !stateById(sim.state)) resetSim();
      render(); renderSide(); runValidate(); refreshLink(); if (panel) renderPanel();
    },
    setShared, applyModel,   // (edited live, #3183: fsm-history.js)
    // (a change under way the merge must wait for: a state or an arrow dragged, a field of the side panel being typed)
    busy: () => (!!drag && drag.kind !== 'pan') || side.contains(document.activeElement),
    // its HDL file linked (generatedFile, #245): nothing else changes, Undo / Redo keep the link
    setLink(file) { linkModel(M, file); hist = hist.map((s) => linkSnapshot(s, file, normalizeFsm)); refreshLink(); },
    refreshLink,
    validate: () => { runValidate(); return diags.slice(); },
    focus,
    showPanel: (p) => { if (panel !== p) togglePanel(p); },
    get panel() { return panel; },   // (the panel shown: a link's view=try opens 'sim', #2869)
    fit,
    // (the view fitted when the canvas first had a size, or the user's own: the drawing stays where it is, #2397)
    fitted: () => fitted,
    print,
    destroy() {
      destroyed = true;
      stopRun();
      Object.values(timers).forEach(clearTimeout);
      ro?.disconnect();
      root.remove();
    },
  };
}

export default mountFsmEditor;
