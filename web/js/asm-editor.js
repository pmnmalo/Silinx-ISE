// Silinx - graphical ASM chart editor (SVG, no framework).
//
//   import { mountAsmEditor } from './asm-editor.js';
//   const ed = mountAsmEditor(container, { model, onChange(model) {} });
//   ed.getModel(); ed.setModel(m); ed.setLink(file); ed.destroy();
//   edited live (#3183, web/js/collab-drawing.js): ed.setShared({ push(model, key), undo(), redo(), canUndo(), canRedo() } | null)
//   (each change pushed, Undo / Redo the shared history's), ed.applyModel(m, { renamed, mine }) (in place), ed.busy()
//
// Styles: web/css/asm-editor.css (scoped under .asm-editor, themed by --bg/--panel/--fg/...).
//
// Besides states, decisions and conditional outputs the chart may hold "every cycle" blocks
// (type 'always': a header box whose tree of decisions/outputs runs on every clock cycle, in
// parallel with the states; unconnected exits end the block), and the machine panel edits the
// data path: generics, internal registers and the 2-flip-flop synchroniser of each input.
//
// The chart's problems and notes are not shown in the editor (docs/UI-GUIDELINES.md "Messages"): `onProblems(diags)` after every
// validation, `onValidate(diags)` on Validate, `onMessage(text)` for a note (drawings.js: the console, editor-problems.js).
// Its Try it panel (asm-sim.js, #2880; named Try it, #3295) steps through the chart; a chart with errors is not simulated (its errors go
// to onValidate, as Validate's).

import { linkModel, linkSnapshot } from './ui.js';
import { toolbarMenu } from './toolbar-menu.js';
import { mountSideFold } from './side-fold.js';
import { toolIcon, toolWide, zoomTools } from './editor-icons.js';
import { panelToggle, PROPS_KEY } from './narrow.js';
import {
  normalizeModel, newModel, validate, generate, ENCODINGS,
} from '/core/asm.js';
import { h } from './dom.js';
import { highlightHdl } from './highlight.js';
import { mountInspector } from './asm-inspector.js';
import { mountRender } from './asm-render.js';
import { hasClip } from './clipboard.js';
import { mountAsmPointer } from './asm-pointer.js';
import { mountAsmLayout } from './asm-layout.js';
import { mountAsmView } from './asm-view.js';
import { mountAsmOps } from './asm-ops.js';
import { clone } from '/core/util.js';
import { statusLine } from './status-line.js';
import { mountAsmSim } from './asm-sim.js';
import { mountDockPanel } from './dock-panel.js';

export const GRID = 20;
const CHW = 7.25;          // approx. width of a 12px monospace character
const SVGNS = 'http://www.w3.org/2000/svg';
let instanceCounter = 0;

// ------------------------------------------------------------------------------- helpers

const ceilTo = (v, g) => Math.ceil(v / g) * g;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));


/** Size of a node box in chart units. */
export function nodeSize(n) {
  if (n.type === 'state' || n.type === 'always') {
    const lines = n.actions.length ? n.actions : [''];
    const tw = Math.max(...lines.map((l) => l.length)) * CHW;
    return { w: Math.max(140, ceilTo(tw + 32, 2 * GRID)), h: Math.max(60, ceilTo(lines.length * 17 + 26, GRID)) };
  }
  if (n.type === 'decision') {
    const tw = Math.max(3, (n.cond || '').length) * CHW;
    const w = Math.max(140, ceilTo(tw * 1.25 + 56, 2 * GRID));
    return { w, h: w > 260 ? 100 : 80 };
  }
  if (n.type === 'case') {
    const tw = Math.max(3, (n.expr || '').length) * CHW;
    return { w: Math.max(160, ceilTo(tw + 80, 2 * GRID)), h: 60 };
  }
  const lines = n.actions.length ? n.actions : [''];
  const tw = Math.max(...lines.map((l) => l.length)) * CHW;
  return { w: Math.max(120, ceilTo(tw + 44, 2 * GRID)), h: Math.max(40, ceilTo(lines.length * 17 + 16, GRID)) };
}

export function box(n) {
  const { w, h } = nodeSize(n);
  return { x: n.x, y: n.y, w, h, l: n.x - w / 2, r: n.x + w / 2, t: n.y - h / 2, b: n.y + h / 2 };
}

// exits of a case box leave from a horizontal bar CASE_BAR below the box, above each target
export const CASE_BAR = 26;

/** Exit point and direction of a port (`dst`: the target, which places the exits of a case box). */
export function portGeom(n, port, dst) {
  const b = box(n);
  if (n.type === 'case') {
    if (port === '+') return { x: b.r, y: n.y, dx: 1, dy: 0 };
    return { x: dst ? dst.x : n.x, y: b.b + CASE_BAR, dx: 0, dy: 1 };
  }
  if (n.type === 'decision' && port === 'false') {
    const s = n.flip ? -1 : 1;
    return { x: n.x + s * b.w / 2, y: n.y, dx: s, dy: 0 };
  }
  return { x: n.x, y: b.b, dx: 0, dy: 1 };
}
export const portsOf = (n) => (n.type === 'decision' ? ['true', 'false'] : ['next']);

/** Orthogonal route from a port to the top of the target box. */
export function routeEdge(src, port, dst, lane) {
  const p = portGeom(src, port, dst);
  const sb = box(src), db = box(dst);
  const t = { x: dst.x, y: db.t };
  const S = 20;
  const below = t.y >= p.y + 20;
  const t0y = clamp(t.y - (dst.type === 'state' ? 34 : S), p.y + 10, t.y - 10);
  const off = lane * 12;
  if (p.dy === 1) {
    if (below) {
      if (Math.abs(p.x - t.x) < 0.5) return [p, t];
      return [p, { x: p.x, y: t0y }, { x: t.x, y: t0y }, t];
    }
    const p1y = p.y + S;
    const ty = t.y - (dst.type === 'state' ? 34 : S);
    const right = dst.x >= src.x - 1;
    const xs = right ? Math.max(sb.r, db.r) + 30 + off : Math.min(sb.l, db.l) - 30 - off;
    return [p, { x: p.x, y: p1y }, { x: xs, y: p1y }, { x: xs, y: ty }, { x: t.x, y: ty }, t];
  }
  // side exit
  const p1x = p.x + p.dx * S;
  if (below && (t.x - p1x) * p.dx >= 0) return [p, { x: t.x, y: p.y }, t];
  if (below) return [p, { x: p1x, y: p.y }, { x: p1x, y: t0y }, { x: t.x, y: t0y }, t];
  const ty = t.y - (dst.type === 'state' ? 34 : S);
  const xs = p.dx > 0 ? Math.max(sb.r, db.r) + 30 + off : Math.min(sb.l, db.l) - 30 - off;
  return [p, { x: xs, y: p.y }, { x: xs, y: ty }, { x: t.x, y: ty }, t];
}

export function pathD(pts, r = 7) {
  if (pts.length < 2) return '';
  let d = `M${pts[0].x},${pts[0].y}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    const l1 = Math.hypot(b.x - a.x, b.y - a.y), l2 = Math.hypot(c.x - b.x, c.y - b.y);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    if (rr < 0.5) { d += ` L${b.x},${b.y}`; continue; }
    const p1 = { x: b.x - ((b.x - a.x) / l1) * rr, y: b.y - ((b.y - a.y) / l1) * rr };
    const p2 = { x: b.x + ((c.x - b.x) / l2) * rr, y: b.y + ((c.y - b.y) / l2) * rr };
    d += ` L${p1.x},${p1.y} Q${b.x},${b.y} ${p2.x},${p2.y}`;
  }
  const z = pts[pts.length - 1];
  return d + ` L${z.x},${z.y}`;
}

// ================================================================================ editor

// (readOnly: a chart to read, a C function's machine, #1575: moved about, zoomed, its boxes selected and their
// properties shown; nothing edited, not validated, no code of its own; its notice, `banner`, at the right end of the
// toolbar, #2710)
function readOnlyChrome({ root, toolbar, hide, banner }) {
  root.classList.add('asm-readonly');
  // (the tools that change the chart, the language and encoding, Validate and Code: hidden)
  for (const g of [...toolbar.querySelectorAll('.asm-add, .asm-danger'), ...hide,
    ...[...toolbar.querySelectorAll('.asm-btn')].filter((b) => /^(Arrange|Validate)$/.test(b.textContent.trim()))]) g.hidden = true;
  // (at the toolbar's right end, before its ⋮ menu)
  if (banner) toolbar.querySelector(':scope > .tb-more').before(banner);
}
const lockSide = (readOnly, side) => { if (readOnly) for (const x of side.querySelectorAll('input, textarea, select, button:not(.asm-fold)')) x.disabled = true; };
/** The encodings' names, in the toolbar's select and the status line (#2763). */
export const ENCODING_NAMES = { binary: 'Binary', gray: 'Gray', onehot: 'One-hot', enum: 'Enum / auto' };
export function mountAsmEditor(container, { model, onChange, onProblems, onValidate, onMessage, onVerify, readOnly = false, banner } = {}) {
  const uid = `asm${++instanceCounter}`;
  let M = normalizeModel(model || newModel('fsm', 'vhdl'));
  let sel = { nodes: new Set(), edge: null };
  let view = { tx: 40, ty: 40, k: 1 };
  // the view fitted once, when the canvas first has a size, or the user's from the first press or zoom: a first
  // fit coming late (the canvas sized on a slow machine) moved the drawing under the pointer while it dragged (#339)
  let fitted = false;
  let snap = true;
  let diags = [];
  let hist = [JSON.stringify(M)], hi = 0, lastKey = null, lastT = 0, shared = null;
  let spaceDown = false;
  let drag = null;
  let destroyed = false;
  const timers = {};

  // ---------------------------------------------------------------------------- DOM
  container.innerHTML = '';
  const root = h('div', { class: 'asm-editor', tabindex: '0' });
  container.append(root);

  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label);
  const sep = () => h('span', { class: 'asm-sep' });

  const encSel = h('select', { class: 'asm-select', title: 'State encoding', onchange: () => { M.encoding = encSel.value; commit('enc'); } },
    ...ENCODINGS.map((e) => h('option', { value: e }, ENCODING_NAMES[e])));
  const snapBtn = btn('# Snap', 'Toggle snapping to the grid', () => { snap = !snap; snapBtn.classList.toggle('on', snap); });
  snapBtn.classList.add('on');
  const zoomLbl = h('span', { class: 'asm-zoom', title: 'Zoom level' }, '100%');
  // (what the chart is, its states and its encoding: in its status line, #2763)
  const status = statusLine();
  const delBtn = toolIcon('delete', 'del', 'Delete selection (Del)', () => deleteSelection(), 'asm-danger');

  // (Simulate, #2880: its panel below the canvas, as the state diagram's)
  const simBtn = toolWide('sim', 'Try it', 'Step through the chart: set the inputs, apply clock edges, see the state, the path taken and the outputs', () => simApi.toggle(), 'asm-sim-btn');
  const simApi = mountAsmSim({
    M: () => M, btn, render: () => render(), layout: () => applyView(), destroyed: () => destroyed, simBtn,
    onErrors: (diags) => { onMessage?.('The chart cannot be simulated: correct its errors first'); onValidate?.(diags); },
  });

  const more = toolbarMenu([
    btn('Arrange', 'Automatic layout (states top-down, every-cycle blocks on the right)', () => autoArrange()),
    snapBtn,
    // (Verify Property, #3177: web/js/verify-props.js)
    ...(onVerify ? [btn('Verify Property…', 'Prove a property of the chart\'s state machine: a state never reached, a state reached, outputs never 1 together', () => onVerify(normalizeModel(M)))] : []),
  ], { title: 'Layout', btnClass: 'asm-btn' });
  const toolbar = h('div', { class: 'asm-toolbar asm-chart-toolbar' },
    h('div', { class: 'asm-group' },
      btn([h('span', { class: 'asm-ico ico-state' }), 'State'], 'Add state box (rectangle)', () => addNode('state'), 'asm-add'),
      btn([h('span', { class: 'asm-ico ico-decision' }), 'Decision'], 'Add decision box (diamond)', () => addNode('decision'), 'asm-add'),
      btn([h('span', { class: 'asm-ico ico-case' }), 'Case'], 'Add case box (multi-way decision on the value of a signal, e.g. opcode)', () => addNode('case'), 'asm-add'),
      btn([h('span', { class: 'asm-ico ico-output' }), 'Cond. output'], 'Add conditional output box (oval)', () => addNode('output'), 'asm-add'),
      btn([h('span', { class: 'asm-ico ico-always' }), 'Every cycle'], 'Add an every-cycle block (logic evaluated on every clock cycle, in parallel with the states)', () => addNode('always'), 'asm-add')),
    sep(),
    h('div', { class: 'asm-group' }, delBtn),
    sep(),
    h('div', { class: 'asm-group' }, ...zoomTools((f) => zoomBy(f), () => fit()), zoomLbl),
    sep(),
    h('div', { class: 'asm-group asm-encoding' }, h('span', { class: 'asm-tb-label' }, 'Encoding:'), encSel),
    sep(),
    h('div', { class: 'asm-group' }, toolWide('check', 'Validate', 'Check the chart for errors', () => { runValidate(); onValidate?.(diags.slice()); }), simBtn),
    h('div', { class: 'asm-spacer' }),
    h('div', { class: 'asm-group' }, panelToggle(root, btn('☰ Properties', 'Show / hide the properties panel'), { key: PROPS_KEY })),
    more.el);

  // canvas
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'asm-canvas');
  svg.innerHTML = `
    <defs>
      <pattern id="${uid}-grid" width="${GRID}" height="${GRID}" patternUnits="userSpaceOnUse">
        <circle cx="0.5" cy="0.5" r="0.9" class="asm-griddot"/>
      </pattern>
      <marker id="${uid}-arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M0,1 L10,5 L0,9 z" class="asm-arrowhead"/>
      </marker>
      <marker id="${uid}-arr-sel" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M0,1 L10,5 L0,9 z" class="asm-arrowhead sel"/>
      </marker>
      <marker id="${uid}-arr-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
        <path d="M0,1 L10,5 L0,9 z" class="asm-arrowhead hot"/>
      </marker>
    </defs>
    <rect class="asm-bg" x="0" y="0" width="100%" height="100%" fill="url(#${uid}-grid)"/>
    <g class="asm-vp">
      <g class="asm-blocks"></g><g class="asm-edges"></g><g class="asm-nodes"></g><g class="asm-overlay"></g>
    </g>
    <rect class="asm-rubber" visibility="hidden"/>`;
  const vp = svg.querySelector('.asm-vp');
  const gBlocks = svg.querySelector('.asm-blocks');
  const gEdges = svg.querySelector('.asm-edges');
  const gNodes = svg.querySelector('.asm-nodes');
  const gOverlay = svg.querySelector('.asm-overlay');
  const rubber = svg.querySelector('.asm-rubber');
  const pattern = svg.querySelector('pattern');

  const canvasWrap = h('div', { class: 'asm-canvas-wrap' }, svg);

  const mainCol = h('div', { class: 'asm-main' }, canvasWrap, simApi.panel);
  // (resized and moved, below or on the right: dock-panel.js, #3797)
  const dock = mountDockPanel({ main: mainCol, panel: simApi.panel, bar: simApi.panel.querySelector('.asm-codebar'), btn, kind: 'asm', changed: () => { if (!destroyed) applyView(); } });

  // side panel
  const selSection = h('section', { class: 'asm-section asm-selection' });
  const machineBody = h('div', { class: 'asm-section-body' });
  // (the machine's settings always shown: a section of its own, not folded, #2739)
  const machineSection = h('section', { class: 'asm-section asm-machine' }, h('h3', {}, 'Machine'), machineBody);
  const side = h('aside', { class: 'asm-side' }, h('div', { class: 'asm-cap' }, 'Properties'), selSection, machineSection);

  mountSideFold({ root, side, key: 'silinx.asm.props.folded' });

  root.append(toolbar, h('div', { class: 'asm-body' }, mainCol, side), status.el);
  if (readOnly) readOnlyChrome({ root, toolbar, hide: [more.el, toolbar.querySelector('.asm-encoding')], banner });

  // ---------------------------------------------------------------------------- model ops (asm-ops.js)
  const {
    addNode, caseExits, caseWidth, connect, copySel, deleteSelection, drawTarget, exitsOf, nextCaseLabel, nodeById, paste, snapV,
  } = mountAsmOps({
    M: () => M, chartBounds: (...a) => chartBounds(...a), commit: (...a) => commit(...a), destroyed: () => destroyed,
    renderInspector: (...a) => renderInspector(...a), root, sel: () => sel, snap: () => snap, svg,
    toWorld: (...a) => toWorld(...a), setSel: (v) => { sel = v; }, setM: (v) => { M = v; }
  });

  // ---------------------------------------------------------------------------- history
  function commit(key) {
    if (readOnly) { M = JSON.parse(hist[0]); render(); renderInspector(); return; }   // (nothing changes)
    const snapStr = JSON.stringify(M);
    if (snapStr !== hist[hi]) {
      const now = Date.now();
      if (shared) { hist = [snapStr]; hi = 0; shared.push(clone(M), key); }   // (its merge may change M)
      else if (key && key === lastKey && now - lastT < 1500 && hi > 0) hist[hi] = snapStr;
      else {
        hist = hist.slice(0, hi + 1);
        hist.push(snapStr);
        hi++;
        if (hist.length > 300) { hist.shift(); hi--; }
      }
      lastKey = key; lastT = now;
      scheduleChange();
    }
    render();
    scheduleValidate();
    updateToolbar();
    simApi.refresh();
  }
  function restore(i) {
    hi = i;
    M = JSON.parse(hist[hi]);
    lastKey = null;
    sel.nodes = new Set([...sel.nodes].filter((id) => nodeById(id)));
    if (sel.edge && !M.edges.some((e) => e.id === sel.edge)) sel.edge = null;
    render(); renderInspector(); renderMachine(); scheduleValidate(); updateToolbar(); scheduleChange(); simApi.refresh();
  }
  const undo = () => { if (shared) shared.undo(); else if (hi > 0) restore(hi - 1); };
  const redo = () => { if (shared) shared.redo(); else if (hi < hist.length - 1) restore(hi + 1); };

  function scheduleChange() {
    clearTimeout(timers.change);
    timers.change = setTimeout(() => { if (!destroyed) onChange?.(clone(M)); }, 300);
  }
  function scheduleValidate() {
    clearTimeout(timers.val);
    timers.val = setTimeout(runValidate, 150);
  }

  // ---------------------------------------------------------------------------- view (asm-view.js)
  const { applyView, centerOn, chartBounds, fit, print, toWorld, zoomAt, zoomBy } = mountAsmView({
    M: () => M, fitted: () => fitted, pattern, render: (...a) => render(...a), sel: () => sel, svg, view: () => view,
    vp, zoomLbl, setView: (v) => { view = v; }, setFitted: (v) => { fitted = v; }, setSel: (v) => { sel = v; }
  });

  // ---------------------------------------------------------------------------- rendering (asm-render.js)
  const { render, updateToolbar } = mountRender({ state: () => ({ M, sel, diags, hist, hi, sim: simApi.view() }), uid, gBlocks, gEdges, gNodes, status,
    delBtn, encSel, nodeById, caseExits, exitsOf, drawTarget });

  const flash = (msg) => onMessage?.(msg);

  // ---------------------------------------------------------------------------- validation & code
  function runValidate() {
    if (destroyed || readOnly) return;
    try { diags = validate(M); } catch (e) { diags = [{ severity: 'error', message: `Internal error: ${e.message}` }]; }
    onProblems?.(diags.slice());
    render();
  }
  function focusNode(id) {
    const n = nodeById(id);
    if (!n) return;
    sel = { nodes: new Set([id]), edge: null };
    centerOn(n);
    render(); renderInspector(); updateToolbar();
  }
  // ---------------------------------------------------------------------------- inspector (asm-inspector.js)
  const insp = mountInspector({ M: () => M, sel: () => sel, selSection, machineBody, btn, nodeById, caseExits,
    caseWidth, commit, deleteSelection });
  const renderInspector = (...a) => { insp.renderInspector(...a); lockSide(readOnly, side); };
  const renderMachine = (...a) => { insp.renderMachine(...a); lockSide(readOnly, side); };

  // ---------------------------------------------------------------------------- layout (asm-layout.js)
  const { autoArrange } = mountAsmLayout({
    M: () => M, caseExits, commit, destroyed: () => destroyed, exitsOf, fit, nodeById
  });

  // ---------------------------------------------------------------------------- pointer interaction (asm-pointer.js)
  const { ro, tryInitialFit } = mountAsmPointer({
    M: () => M, addNode, applyView, commit, connect, copySel, deleteSelection, drag: () => drag, drawTarget, fit,
    fitted: () => fitted, flash, gOverlay, nextCaseLabel, nodeById, paste, print, redo, render, renderInspector, root,
    rubber, sel: () => sel, selSection, snapV, spaceDown: () => spaceDown, svg, toWorld, uid, undo, updateToolbar,
    view: () => view, zoomAt, zoomBy, readOnly, setDrag: (v) => { drag = v; }, setSel: (v) => { sel = v; },
    setFitted: (v) => { fitted = v; }, setSpaceDown: (v) => { spaceDown = v; }
  });

  // ---------------------------------------------------------------------------- init
  applyView();
  render();
  renderInspector();
  renderMachine();
  updateToolbar();
  runValidate();
  requestAnimationFrame(() => { if (!fitted) fitted = tryInitialFit(); });

  return {
    getModel: () => clone(M),
    undo: () => undo(), redo: () => redo(),
    canUndo: () => (shared ? shared.canUndo() : hi > 0), canRedo: () => (shared ? shared.canRedo() : hi < hist.length - 1),
    setShared(s) { shared = s; hist = [JSON.stringify(M)]; hi = 0; lastKey = null; updateToolbar(); },
    // the merged chart in place: the view and the selection kept (its boxes' ids renamed by the merge, `renamed`)
    applyModel(m, { renamed = null, mine = false } = {}) {
      M = normalizeModel(m); hist = [JSON.stringify(M)]; hi = 0;
      sel.nodes = new Set([...sel.nodes].map((id) => renamed?.get(id) ?? id).filter((id) => nodeById(id)));
      if (sel.edge && !M.edges.some((e) => e.id === (renamed?.get(sel.edge) ?? sel.edge))) sel.edge = null; else if (sel.edge) sel.edge = renamed?.get(sel.edge) ?? sel.edge;
      render(); renderInspector(); renderMachine(); scheduleValidate(); updateToolbar(); simApi.refresh();
      if (mine) scheduleChange();
    },
    // (a change under way the merge must wait for: boxes moved or a link drawn, a field of the side panel being typed)
    busy: () => ['move', 'connect'].includes(drag?.mode) || side.contains(document.activeElement),
    // Edit ▸ Cut / Copy / Paste / Delete (#677)
    copy: () => copySel(), cut: () => copySel(true), paste: () => paste(), deleteSelection: () => deleteSelection(),
    canCopy: () => sel.nodes.size > 0, canDelete: () => sel.nodes.size > 0 || !!sel.edge, canPaste: () => hasClip('asm'),
    setModel(m) {
      M = normalizeModel(m || newModel('fsm', 'vhdl'));
      hist = [JSON.stringify(M)]; hi = 0; lastKey = null;
      sel = { nodes: new Set(), edge: null };
      render(); renderInspector(); renderMachine(); updateToolbar(); runValidate(); simApi.refresh();
      fitted = tryInitialFit();
    },
    // its HDL file linked (generatedFile, #245): nothing else changes, Undo / Redo keep the link
    setLink(file) { linkModel(M, file); hist = hist.map((s) => linkSnapshot(s, file)); },
    validate: () => { runValidate(); return diags.slice(); },
    // the box a problem is about selected and shown (a click on its line in the console)
    focusNode: (id) => focusNode(id),
    // the Try it panel ('sim', a design link's view=try opens it, #2881) or none (null)
    showPanel: (p) => simApi.show(p === 'sim'),
    get panel() { return simApi.isOpen() ? 'sim' : null; },
    fit,
    print,
    destroy() {
      destroyed = true;
      simApi.stop();
      dock.destroy();
      Object.values(timers).forEach(clearTimeout);
      ro?.disconnect();
      root.remove();
    },
  };
}

export default mountAsmEditor;
