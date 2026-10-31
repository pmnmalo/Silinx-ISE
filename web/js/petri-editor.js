// Silinx - Petri net editor (documents <name>.pn.json; SVG, no framework).
//
//   import { mountPetriEditor } from './petri-editor.js';
//   const ed = mountPetriEditor(container, { model, onChange(model), linkInfo() -> { file } | null, onOpenFile(path) });
//   ed.getModel(); ed.setModel(m); ed.setLink(file); ed.undo(); ed.redo(); ed.canUndo(); ed.canRedo(); ed.fit(); ed.refreshLink(); ed.print(); ed.destroy();
//
// Places are circles holding their tokens (dots, or a number), transitions bars; an arc goes from a
// place to a transition (it takes tokens: its weight) or from a transition to a place (it puts them);
// an inhibitor arc (a small circle at its head) lets the transition fire only while the place holds
// fewer tokens than its weight. Tools: select / move, place, transition, arc, inhibitor arc. The side
// panel edits the selection and the net (its inputs, outputs, clock, reset); the bottom panel
// simulates it: click an enabled transition to fire it (the token game), or a clock step (every
// enabled transition whose guard is true fires, as the generated hardware does), run, reset; and shows
// the HDL generated from the net. Model, simulation, HDL and PNML: core/petri.js.

import { h, downloadText, undoButton, linkModel, linkSnapshot, twoFingerView } from './ui.js';
import { toolbarMenu } from './toolbar-menu.js';
import { sv } from './dom.js';
import { panelToggle, PROPS_KEY } from './narrow.js';
import { normalizePetri, newPetri, fire, toPnml, fromPnml } from '/core/petri.js';
import { copyDrawing, pasteDrawing, drawingClipEmpty } from '/core/drawclip.js';
import { writeClip, readClip, pasteFromKey, hasClip } from './clipboard.js';
import { mountPetriSim } from './petri-sim.js';
import { mountPetriSide } from './petri-side.js';
import { mountPetriDraw } from './petri-draw.js';
import { clone } from '/core/util.js';
import { printDiagram, svgSnapshot } from './print.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const GRID = 20;
let instances = 0;
const snap = v => Math.round(v / (GRID / 2)) * (GRID / 2);
export { sv };   // (web/js/dom.js's)

export function mountPetriEditor(container, opts = {}) {
  const uid = `pn${++instances}`;
  let M = normalizePetri(opts.model || newPetri('petri_net'));
  let sel = null;                       // { kind: 'place' | 'transition' | 'arc', id }
  let tool = 'select';                  // select | place | transition | arc | inhibitor
  let arcFrom = null;                   // the first end of an arc being drawn
  let view = { tx: 40, ty: 40, k: 1 };
  let drag = null;
  let fitted = false;                   // the view fitted once, or set by the user
  let destroyed = false;
  let panel = null;                     // 'sim' | 'code' | null
  let sim = null;                       // { marking, fired: [], inputs: {}, log: [], timer }
  const hist = [JSON.stringify(M)];
  let hi = 0;

  container.innerHTML = '';
  const root = h('div', { class: 'asm-editor petri-editor', tabindex: '0' });
  container.append(root);
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label);
  const sep = () => h('span', { class: 'asm-sep' });

  // ---------------------------------------------------------------- toolbar
  const tools = {
    select: btn('➚ Select', 'Select and move (drag the background to pan, wheel to zoom)', () => setTool('select'), 'pn-tool'),
    place: btn([h('span', { class: 'pn-ico-place' }), 'Place'], 'Click the drawing to add a place', () => setTool('place'), 'pn-tool'),
    transition: btn([h('span', { class: 'pn-ico-trans' }), 'Transition'], 'Click the drawing to add a transition', () => setTool('transition'), 'pn-tool'),
    arc: btn('→ Arc', 'Click a place then a transition (or a transition then a place)', () => setTool('arc'), 'pn-tool'),
    inhibitor: btn('⊸ Inhibitor', 'Click a place then a transition: the transition fires only while the place holds fewer tokens than the weight', () => setTool('inhibitor'), 'pn-tool'),
  };
  const delBtn = btn('✕', 'Delete the selection (Del)', () => deleteSelection(), 'asm-danger');
  const undoBtn = undoButton('undo', () => undo());
  const redoBtn = undoButton('redo', () => redo());
  const langSel = h('select', { class: 'asm-select', title: 'HDL language', onchange: () => { M.lang = langSel.value; commit(); } },
    h('option', { value: 'vhdl' }, 'VHDL'), h('option', { value: 'verilog' }, 'Verilog'));
  const tabBtns = {
    sim: btn('▶ Simulate', 'Play the net: fire transitions, clock steps, run', () => togglePanel('sim'), 'pn-tab-btn'),
    code: btn('</> HDL', 'The hardware generated from the net', () => togglePanel('code'), 'pn-tab-btn'),
    analysis: btn('∑ Analysis', 'Reachable markings, bounds, deadlocks, liveness, invariants', () => togglePanel('analysis'), 'pn-tab-btn'),
  };
  const pnmlIn = h('input', { type: 'file', accept: '.pnml,.xml', hidden: true });
  pnmlIn.addEventListener('change', async () => {
    const f = pnmlIn.files[0]; pnmlIn.value = '';
    if (!f) return;
    try { const n = fromPnml(await f.text(), { name: M.name }); M = normalizePetri({ ...n, lang: M.lang, generatedFile: M.generatedFile }); sel = null; commit(); fit(); }
    catch (e) { status(`PNML: ${e.message}`, true); }
  });
  const linkHost = h('span', { class: 'pn-link' });
  const more = toolbarMenu([tabBtns.analysis,
    btn('PNML ⇩', 'Export the net as PNML (for PIPE, WoPeD, TINA…)', () => downloadText(`${M.name}.pnml`, toPnml(M), 'application/xml')),
    btn('PNML ⇧', 'Import a PNML net (replaces this one: Undo brings it back)', () => pnmlIn.click()),
  ], { title: 'Analysis and PNML', btnClass: 'asm-btn' });
  const toolbar = h('div', { class: 'asm-toolbar pn-toolbar' },
    h('div', { class: 'asm-group' }, ...Object.values(tools), delBtn), sep(),
    h('div', { class: 'asm-group' }, undoBtn, redoBtn), sep(),
    h('div', { class: 'asm-group' }, btn('Fit', 'Fit the net in the window', () => fit()), langSel),
    h('div', { class: 'asm-spacer' }),
    h('div', { class: 'asm-group' }, panelToggle(root, btn('☰ Properties', 'Show / hide the properties panel'), { key: PROPS_KEY }), tabBtns.sim, tabBtns.code, pnmlIn),
    more.el, linkHost);

  // ---------------------------------------------------------------- canvas, panels
  const defs = sv('defs', {},
    sv('marker', { id: `${uid}-arr`, viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '8', markerHeight: '8', orient: 'auto-start-reverse' }, sv('path', { d: 'M0,0 L10,5 L0,10 z', class: 'pn-arrowhead' })));
  const world = sv('g', { class: 'pn-world' });
  const svg = sv('svg', { class: 'asm-canvas pn-canvas' }, defs, world);
  const hint = h('div', { class: 'asm-hint' }, 'Place / Transition: click to add · Arc: click its two ends · drag to move · Del to delete · wheel to zoom');
  const canvasWrap = h('div', { class: 'asm-canvas-wrap' }, svg, hint);
  const panelTitle = h('span', { class: 'asm-code-title' });
  const panelTools = h('span', { class: 'pn-panel-tools' });
  const panelBody = h('div', { class: 'pn-panel-body' });
  const bottom = h('div', { class: 'asm-codepanel pn-panel', hidden: true },
    h('div', { class: 'asm-codebar' }, panelTitle, panelTools, h('div', { class: 'asm-spacer' }), btn('✕', 'Close the panel', () => togglePanel(null))), panelBody);
  const mainCol = h('div', { class: 'asm-main' }, canvasWrap, bottom);
  const selSection = h('section', { class: 'asm-section pn-selection' });
  const netBody = h('div', { class: 'asm-section-body' });
  const netSection = h('details', { class: 'asm-section', open: true }, h('summary', {}, 'Net'), netBody);
  const probList = h('ul', { class: 'asm-problems' });
  const probCount = h('span', { class: 'asm-prob-count' });
  const probSection = h('details', { class: 'asm-section', open: true }, h('summary', {}, 'Problems ', probCount), probList);
  const side = h('aside', { class: 'asm-side' }, selSection, netSection, probSection);
  const statusInfo = h('span', {}), statusMsg = h('span', { class: 'asm-status-msg' });
  root.append(toolbar, h('div', { class: 'asm-body' }, mainCol, side), h('div', { class: 'asm-status' }, statusInfo, statusMsg));
  const status = (msg, err = false) => { statusMsg.textContent = msg || ''; statusMsg.classList.toggle('err', !!err); };

  // ---------------------------------------------------------------- model edits, history
  const placeOf = id => M.places.find(p => p.id === id);
  const transOf = id => M.transitions.find(t => t.id === id);
  const nodeOf = id => placeOf(id) || transOf(id);
  const newId = pfx => { const used = new Set([...M.places, ...M.transitions, ...M.arcs].map(x => x.id)); let i = 1; while (used.has(`${pfx}${i}`)) i++; return `${pfx}${i}`; };
  const newName = (pfx, list) => { const used = new Set(list.map(x => x.name.toLowerCase())); let i = 1; while (used.has(`${pfx}${i}`)) i++; return `${pfx}${i}`; };
  function commit() {
    M = normalizePetri(M);
    const s = JSON.stringify(M);
    if (s !== hist[hi]) { hist.length = hi + 1; hist.push(s); if (hist.length > 200) hist.shift(); hi = hist.length - 1; opts.onChange?.(clone(M)); }
    if (sim) resetSim(false);
    render();
  }
  const restore = i => { hi = i; M = normalizePetri(JSON.parse(hist[hi])); if (sel && !nodeOf(sel.id) && !M.arcs.some(a => a.id === sel.id)) sel = null; opts.onChange?.(clone(M)); if (sim) resetSim(false); render(); };
  const undo = () => { if (hi > 0) restore(hi - 1); };
  const redo = () => { if (hi < hist.length - 1) restore(hi + 1); };

  function setTool(t) { tool = t; arcFrom = null; for (const [k, b] of Object.entries(tools)) b.classList.toggle('active', k === t); svg.classList.toggle('pn-adding', t !== 'select'); render(); }
  function addNode(kind, at) {
    const p = { x: snap(at.x), y: snap(at.y) };
    if (kind === 'place') { const id = newId('p'); M.places.push({ id, name: newName('p', M.places), ...p, tokens: 0, capacity: 1, outputs: {} }); sel = { kind, id }; }
    else { const id = newId('t'); M.transitions.push({ id, name: newName('t', M.transitions), ...p, guard: '', outputs: {} }); sel = { kind, id }; }
    commit();
  }
  function addArc(from, to, inhibitor) {
    const fp = placeOf(from), tt = transOf(to), ft = transOf(from), tp = placeOf(to);
    if (!((fp && tt) || (ft && tp && !inhibitor))) { status(inhibitor ? 'An inhibitor arc goes from a place to a transition' : 'An arc joins a place and a transition', true); return; }
    if (M.arcs.some(a => a.from === from && a.to === to)) { status('These two are joined already: change the weight of that arc', true); return; }
    const id = newId('a');
    M.arcs.push({ id, from, to, weight: 1, ...(inhibitor ? { inhibitor: true } : {}) });
    sel = { kind: 'arc', id };
    status('');
    commit();
  }
  function deleteSelection() {
    if (!sel) return;
    if (sel.kind === 'arc') M.arcs = M.arcs.filter(a => a.id !== sel.id);
    else {
      M.places = M.places.filter(p => p.id !== sel.id);
      M.transitions = M.transitions.filter(t => t.id !== sel.id);
      M.arcs = M.arcs.filter(a => a.from !== sel.id && a.to !== sel.id);
    }
    sel = null;
    commit();
  }

  // Cut / Copy / Paste (#677, core/drawclip.js): the place or transition selected, pasted offset and selected,
  // its name made new when it is used
  let pasteN = 0, pasteText = null;
  function copySel(cut = false) {
    if (!sel || sel.kind === 'arc') return;
    const clip = copyDrawing('petri', M, [sel.id]);
    writeClip('petri', clip);
    pasteText = JSON.stringify(clip); pasteN = 0;   // (pasted here: next to the original)
    if (cut) deleteSelection();
  }
  async function paste(clip) {
    clip ??= await readClip('petri');
    if (drawingClipEmpty('petri', clip) || destroyed) return;
    const t = JSON.stringify(clip);
    if (t !== pasteText) { pasteText = t; pasteN = clip.from === M.name ? 0 : -1; }
    const d = 2 * GRID * ++pasteN;
    const { ids } = pasteDrawing('petri', M, clip, { dx: d, dy: d });
    M = normalizePetri(M);
    if (ids.length) sel = { kind: M.places.some(p => p.id === ids[0]) ? 'place' : 'transition', id: ids[0] };
    commit();
    root.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- drawing (petri-draw.js)
  const { applyView, render, toWorld } = mountPetriDraw({
    M: () => M, arcFrom: () => arcFrom, delBtn, destroyed: () => destroyed, drag: () => drag,
    envOf: (...a) => envOf(...a), hi: () => hi, hist, langSel, nodeOf, placeOf, redoBtn,
    refreshLink: (...a) => refreshLink(...a), renderPanel: (...a) => renderPanel(...a),
    renderSide: (...a) => renderSide(...a), sel: () => sel, sim: () => sim, statusInfo, svg, uid, undoBtn,
    view: () => view, world
  });

  // ---------------------------------------------------------------- side panel (petri-side.js)
  const { refreshLink, renderSide } = mountPetriSide({
    opts, M: () => M, btn, commit, linkHost, netBody, nodeOf, placeOf, probCount, probList, render, sel: () => sel,
    selSection, status, transOf, setSel: (v) => { sel = v; }
  });

  // ---------------------------------------------------------------- simulation and HDL panel (petri-sim.js)
  const { analysis, envOf, fireOne, renderPanel, resetSim, togglePanel } = mountPetriSim({
    M: () => M, bottom, btn, destroyed: () => destroyed, panel: () => panel, panelBody, panelTitle, panelTools, render,
    sim: () => sim, status, tabBtns, transOf, setSim: (v) => { sim = v; }, setPanel: (v) => { panel = v; }
  });

  // ---------------------------------------------------------------- mouse and keys
  const hit = e => { const g = e.target.closest?.('[data-kind]'); return g ? { kind: g.dataset.kind, id: g.dataset.id } : null; };
  // a second finger (#674): what the first one started undone, the selection as it was
  twoFingerView(svg, {
    cancel: () => {
      const d = drag;
      drag = null;
      if (!d) return;
      const n = d.kind === 'move' && nodeOf(d.id);
      if (n) Object.assign(n, { x: d.x, y: d.y });
      if ('sel0' in d) sel = d.sel0;
      render();
    },
    pan: (dx, dy) => { view.tx += dx; view.ty += dy; applyView(); },
    zoom: zoomAt,
  });
  svg.addEventListener('pointerdown', e => {
    root.focus({ preventScroll: true });
    fitted = true;
    const w = toWorld(e.clientX, e.clientY), t = hit(e), sel0 = sel;
    if (sim && t?.kind === 'transition' && tool === 'select') { fireOne(t.id); return; }
    if (tool === 'place' || tool === 'transition') { if (!t) addNode(tool, w); return; }
    if (tool === 'arc' || tool === 'inhibitor') {
      if (t && t.kind !== 'arc') {
        if (!arcFrom) { arcFrom = t.id; drag = { kind: 'arcdraw', ...w }; render(); }
        else { const f = arcFrom; arcFrom = null; drag = null; if (f !== t.id) addArc(f, t.id, tool === 'inhibitor'); else render(); }
      } else { arcFrom = null; drag = null; render(); }
      return;
    }
    if (t) {
      sel = { kind: t.kind, id: t.id };
      const n = nodeOf(t.id);
      if (n) drag = { kind: 'move', sel0, id: n.id, x: n.x, y: n.y, dx: w.x - n.x, dy: w.y - n.y, moved: false };
      render();
    } else {
      sel = null;
      drag = { kind: 'pan', sel0, x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
      render();
    }
    try { svg.setPointerCapture(e.pointerId); } catch { /* not an active pointer */ }
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    const w = toWorld(e.clientX, e.clientY);
    if (drag.kind === 'pan') { view.tx = drag.tx + e.clientX - drag.x; view.ty = drag.ty + e.clientY - drag.y; applyView(); }
    else if (drag.kind === 'move') { const n = nodeOf(drag.id); if (n) { n.x = snap(w.x - drag.dx); n.y = snap(w.y - drag.dy); drag.moved = true; render(); } }
    else if (drag.kind === 'arcdraw') { drag.x = w.x; drag.y = w.y; render(); }
  });
  svg.addEventListener('pointerup', () => {
    if (drag?.kind === 'move' && drag.moved) { drag = null; commit(); return; }
    if (drag?.kind !== 'arcdraw') drag = null;
  });
  function zoomAt(f, cx, cy) {
    fitted = true;
    const r = svg.getBoundingClientRect(), mx = cx - r.left, my = cy - r.top;
    const k = Math.max(0.25, Math.min(4, view.k * f));
    view.tx = mx - (mx - view.tx) * k / view.k; view.ty = my - (my - view.ty) * k / view.k; view.k = k;
    applyView();
  }
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.deltaY < 0 ? 1.1 : 1 / 1.1, e.clientX, e.clientY); }, { passive: false });
  root.addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); e.stopPropagation(); redo(); }
    else if (mod && k === 'c') { e.preventDefault(); copySel(); }
    else if (mod && k === 'x') { e.preventDefault(); copySel(true); }
    else if (mod && k === 'v') pasteFromKey('petri', paste);
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    else if (e.key === 'Escape') { setTool('select'); }
  });

  // the whole net, its selection left out (#1509)
  function print() {
    const saved = sel;
    sel = null; render();
    let snap;
    try {
      const b = world.getBBox();
      snap = svgSnapshot(svg, world, { l: b.x - 20, t: b.y - 20, r: b.x + b.width + 20, b: b.y + b.height + 20 }, ['defs pattern', '.pn-arc-hit']);
    } finally { sel = saved; render(); }
    printDiagram({ title: `Petri net ${M.name}`, snapshot: snap, filename: `${M.name}_petri` });
  }
  function fit() {
    const r = svg.getBoundingClientRect();
    const nodes = [...M.places, ...M.transitions];
    if (r.width >= 10 && r.height >= 10) fitted = true;
    if (!nodes.length || !r.width) { view = { tx: 40, ty: 40, k: 1 }; applyView(); return; }
    const xs = nodes.map(n => n.x), ys = nodes.map(n => n.y);
    const x0 = Math.min(...xs) - 60, x1 = Math.max(...xs) + 100, y0 = Math.min(...ys) - 50, y1 = Math.max(...ys) + 60;
    const k = Math.max(0.3, Math.min(1.6, Math.min(r.width / (x1 - x0), r.height / (y1 - y0))));
    view = { k, tx: (r.width - (x1 - x0) * k) / 2 - x0 * k, ty: (r.height - (y1 - y0) * k) / 2 - y0 * k };
    applyView();
  }

  // the view fitted to the net once, when the canvas first has a size (it may open hidden, behind
  // another document), never again by itself: from then on (or from the user's first press or zoom)
  // the view is the user's; a fit coming late, after a panel had changed the canvas, moved the drawing
  // under the pointer between the aim and the click (#233)
  const initialFit = () => { if (!fitted && !destroyed) fit(); };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(initialFit) : null;
  ro?.observe(svg);
  setTool('select');
  render();
  requestAnimationFrame(initialFit);
  return {
    getModel: () => clone(M),
    setModel(m) { M = normalizePetri(m); hist.length = 0; hist.push(JSON.stringify(M)); hi = 0; sel = null; if (sim) resetSim(false); render(); },
    undo, redo, canUndo: () => hi > 0, canRedo: () => hi < hist.length - 1,
    // Edit ▸ Cut / Copy / Paste / Delete (#677): a place or a transition (an arc: Delete only)
    copy: () => copySel(), cut: () => copySel(true), paste: () => paste(), deleteSelection: () => deleteSelection(),
    canCopy: () => !!sel && sel.kind !== 'arc', canDelete: () => !!sel, canPaste: () => hasClip('petri'),
    // its HDL file linked (generatedFile, #245): nothing else changes, Undo / Redo keep the link
    setLink(file) { linkModel(M, file); hist.forEach((s, i) => { hist[i] = linkSnapshot(s, file, normalizePetri); }); refreshLink(); },
    fit, refreshLink, print,
    destroy() { destroyed = true; ro?.disconnect(); if (sim?.timer) clearInterval(sim.timer); container.innerHTML = ''; },
  };
}
