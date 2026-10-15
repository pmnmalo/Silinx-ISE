// Silinx - Petri net editor (documents <name>.pn.json; SVG, no framework).
//
//   import { mountPetriEditor } from './petri-editor.js';
//   const ed = mountPetriEditor(container, { model, onChange(model), linkInfo() -> { file } | null, onOpenFile(path) });
//   ed.getModel(); ed.setModel(m); ed.setLink(file); ed.undo(); ed.redo(); ed.canUndo(); ed.canRedo(); ed.fit(); ed.refreshLink(); ed.destroy();
//
// Places are circles holding their tokens (dots, or a number), transitions bars; an arc goes from a
// place to a transition (it takes tokens: its weight) or from a transition to a place (it puts them);
// an inhibitor arc (a small circle at its head) lets the transition fire only while the place holds
// fewer tokens than its weight. Tools: select / move, place, transition, arc, inhibitor arc. The side
// panel edits the selection and the net (its inputs, outputs, clock, reset); the bottom panel
// simulates it: click an enabled transition to fire it (the token game), or a clock step (every
// enabled transition whose guard is true fires, as the generated hardware does), run, reset; and shows
// the HDL generated from the net. Model, simulation, HDL and PNML: core/petri.js.

import { h, downloadText, undoButton, linkModel, linkSnapshot } from './ui.js';
import {
  normalizePetri, newPetri, validatePetri, generatePetri, initialMarking, enabledTransitions, fire, clockStep, isDeadlock,
  outputsOf, toPnml, fromPnml, PLACE_R, TRANS_W, TRANS_H,
} from '/core/petri.js';
import { parseOutputs, formatOutputs } from '/core/fsm.js';
import { analyzePetri } from '/core/petri-analysis.js';

const SVGNS = 'http://www.w3.org/2000/svg';
const GRID = 20;
let instances = 0;
const clone = o => JSON.parse(JSON.stringify(o));
const snap = v => Math.round(v / (GRID / 2)) * (GRID / 2);
const sv = (tag, attrs = {}, ...kids) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, v);
  for (const c of kids) if (c != null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
};
const ioText = list => list.map(p => (p.width > 1 ? `${p.name}[${p.width}]` : p.name)).join(', ');
const parseIo = text => String(text || '').split(/[,;\s]+/).map(s => s.trim()).filter(Boolean).map(s => {
  const m = /^([A-Za-z][A-Za-z0-9_]*)(?:\[(\d+)\])?$/.exec(s);
  return m ? { name: m[1], width: Math.max(1, Math.min(32, +(m[2] || 1))) } : null;
}).filter(Boolean);

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
  const toolbar = h('div', { class: 'asm-toolbar' },
    h('div', { class: 'asm-group' }, ...Object.values(tools), delBtn), sep(),
    h('div', { class: 'asm-group' }, undoBtn, redoBtn), sep(),
    h('div', { class: 'asm-group' }, btn('Fit', 'Fit the net in the window', () => fit()), langSel),
    h('div', { class: 'asm-spacer' }),
    h('div', { class: 'asm-group' }, tabBtns.sim, tabBtns.code, tabBtns.analysis,
      btn('PNML ⇩', 'Export the net as PNML (for PIPE, WoPeD, TINA…)', () => downloadText(`${M.name}.pnml`, toPnml(M), 'application/xml')),
      btn('PNML ⇧', 'Import a PNML net (replaces this one: Undo brings it back)', () => pnmlIn.click()), pnmlIn, linkHost));

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

  // ---------------------------------------------------------------- drawing
  const toWorld = (cx, cy) => { const r = svg.getBoundingClientRect(); return { x: (cx - r.left - view.tx) / view.k, y: (cy - r.top - view.ty) / view.k }; };
  const applyView = () => world.setAttribute('transform', `translate(${view.tx},${view.ty}) scale(${view.k})`);
  /** Where an arc meets a node: the rim of a place, the edge of a transition's bar. */
  function rim(n, toward) {
    const dx = toward.x - n.x, dy = toward.y - n.y, d = Math.hypot(dx, dy) || 1;
    if (placeOf(n.id)) return { x: n.x + dx / d * PLACE_R, y: n.y + dy / d * PLACE_R };
    const sx = Math.abs(dx) > 1e-6 ? (TRANS_W / 2 + 2) / Math.abs(dx) : Infinity, sy = Math.abs(dy) > 1e-6 ? (TRANS_H / 2 + 2) / Math.abs(dy) : Infinity;
    const s = Math.min(sx, sy);
    return { x: n.x + dx * s, y: n.y + dy * s };
  }
  function tokensSvg(p, k) {
    const g = sv('g', { class: 'pn-tokens' });
    if (k <= 0) return g;
    if (k <= 5) {
      const pos = [[[0, 0]], [[-6, 0], [6, 0]], [[-6, 5], [6, 5], [0, -6]], [[-6, -6], [6, -6], [-6, 6], [6, 6]], [[-8, -7], [8, -7], [0, 0], [-8, 7], [8, 7]]][k - 1];
      for (const [x, y] of pos) g.append(sv('circle', { cx: p.x + x, cy: p.y + y, r: 3.6, class: 'pn-token' }));
    } else g.append(sv('text', { x: p.x, y: p.y + 5, 'text-anchor': 'middle', class: 'pn-count' }, String(k)));
    return g;
  }
  function render() {
    if (destroyed) return;
    applyView();
    world.replaceChildren();
    const marking = sim ? sim.marking : initialMarking(M);
    const enabled = new Set(sim ? enabledTransitions(M, marking, null) : []);
    const ready = new Set(sim ? enabledTransitions(M, marking, envOf()) : []);
    const fired = new Set(sim ? sim.fired : []);
    // arcs (under the nodes)
    for (const a of M.arcs) {
      const A = nodeOf(a.from), B = nodeOf(a.to);
      if (!A || !B) continue;
      const p1 = rim(A, B), p2 = rim(B, A);
      const isSel = sel?.kind === 'arc' && sel.id === a.id;
      const g = sv('g', { class: `pn-arc${isSel ? ' sel' : ''}${a.inhibitor ? ' inhibitor' : ''}`, 'data-kind': 'arc', 'data-id': a.id });
      const end = a.inhibitor ? { x: p2.x - (p2.x - p1.x) / Math.hypot(p2.x - p1.x, p2.y - p1.y) * 5, y: p2.y - (p2.y - p1.y) / Math.hypot(p2.x - p1.x, p2.y - p1.y) * 5 } : p2;
      g.append(sv('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'pn-arc-hit' }), sv('line', { x1: p1.x, y1: p1.y, x2: end.x, y2: end.y, class: 'pn-arc-line', 'marker-end': a.inhibitor ? null : `url(#${uid}-arr)` }));
      if (a.inhibitor) g.append(sv('circle', { cx: end.x, cy: end.y, r: 5, class: 'pn-inhib' }));
      if (a.weight > 1) g.append(sv('text', { x: (p1.x + p2.x) / 2 + 6, y: (p1.y + p2.y) / 2 - 6, class: 'pn-weight' }, String(a.weight)));
      world.append(g);
    }
    if (arcFrom && drag?.kind === 'arcdraw') {
      const A = nodeOf(arcFrom);
      if (A) world.append(sv('line', { x1: A.x, y1: A.y, x2: drag.x, y2: drag.y, class: 'pn-arc-line pn-ghost' }));
    }
    for (const p of M.places) {
      const isSel = sel?.kind === 'place' && sel.id === p.id;
      const g = sv('g', { class: `pn-place${isSel ? ' sel' : ''}${arcFrom === p.id ? ' from' : ''}`, 'data-kind': 'place', 'data-id': p.id });
      g.append(sv('circle', { cx: p.x, cy: p.y, r: PLACE_R, class: 'pn-circle' }), tokensSvg(p, marking[p.id] || 0),
        sv('text', { x: p.x, y: p.y + PLACE_R + 14, 'text-anchor': 'middle', class: 'pn-name' }, p.name));
      if (p.capacity > 1) g.append(sv('text', { x: p.x + PLACE_R - 2, y: p.y - PLACE_R + 2, class: 'pn-cap' }, `k=${p.capacity}`));
      const outs = formatOutputs(p.outputs);
      if (outs) g.append(sv('text', { x: p.x, y: p.y + PLACE_R + 27, 'text-anchor': 'middle', class: 'pn-outs' }, outs));
      world.append(g);
    }
    for (const t of M.transitions) {
      const isSel = sel?.kind === 'transition' && sel.id === t.id;
      const cls = sim ? (ready.has(t.id) ? ' ready' : enabled.has(t.id) ? ' enabled' : '') + (fired.has(t.id) ? ' fired' : '') : '';
      const g = sv('g', { class: `pn-trans${isSel ? ' sel' : ''}${cls}${arcFrom === t.id ? ' from' : ''}`, 'data-kind': 'transition', 'data-id': t.id });
      g.append(sv('rect', { x: t.x - TRANS_W / 2, y: t.y - TRANS_H / 2, width: TRANS_W, height: TRANS_H, class: 'pn-bar' }),
        sv('text', { x: t.x + TRANS_W / 2 + 5, y: t.y - 6, class: 'pn-name' }, t.name));
      const lbl = [t.guard ? `[${t.guard}]` : '', formatOutputs(t.outputs) ? `/ ${formatOutputs(t.outputs)}` : ''].filter(Boolean).join(' ');
      if (lbl) g.append(sv('text', { x: t.x + TRANS_W / 2 + 5, y: t.y + 10, class: 'pn-guard' }, lbl));
      world.append(g);
    }
    renderSide();
    renderPanel();
    undoBtn.disabled = hi <= 0; redoBtn.disabled = hi >= hist.length - 1; delBtn.disabled = !sel;
    langSel.value = M.lang;
    statusInfo.textContent = `${M.places.length} places · ${M.transitions.length} transitions · ${M.arcs.length} arcs`;
    refreshLink();
  }

  // ---------------------------------------------------------------- side panel
  const field = (label, input, hintText) => h('label', { class: 'asm-field' }, h('span', { class: 'asm-label' }, label), input, hintText ? h('span', { class: 'asm-fhint' }, hintText) : null);
  const text = (value, onChange, cls = '') => { const i = h('input', { type: 'text', class: `asm-input ${cls}`, value: value ?? '', spellcheck: 'false' }); i.addEventListener('change', () => onChange(i.value)); return i; };
  const number = (value, min, max, onChange) => { const i = h('input', { type: 'number', class: 'asm-input', value: String(value), min: String(min), max: String(max) }); i.addEventListener('change', () => onChange(Math.max(min, Math.min(max, Math.round(+i.value || min))))); return i; };
  function renderSide() {
    selSection.replaceChildren();
    if (!sel) selSection.append(h('div', { class: 'asm-label' }, 'Nothing selected: click a place, a transition or an arc'));
    else if (sel.kind === 'place') {
      const p = placeOf(sel.id);
      if (p) selSection.append(h('div', { class: 'asm-section-title' }, `Place ${p.name}`),
        field('Name', text(p.name, v => { p.name = v.trim() || p.name; commit(); }, 'mono')),
        field('Initial tokens', number(p.tokens, 0, 255, v => { p.tokens = v; p.capacity = Math.max(p.capacity, v); commit(); })),
        field('Capacity', number(p.capacity, 1, 255, v => { p.capacity = v; p.tokens = Math.min(p.tokens, v); commit(); }), '1: a safe place (one flip-flop); more: a counter'),
        field('Outputs while marked', text(formatOutputs(p.outputs), v => { const o = parseOutputs(v); if (o.error) status(o.error, true); else { p.outputs = o.outputs; commit(); } }, 'mono'), 'e.g. busy=1, st=2'));
    } else if (sel.kind === 'transition') {
      const t = transOf(sel.id);
      const pos = M.transitions.indexOf(t);
      const move = d => { const k = pos + d; if (k < 0 || k >= M.transitions.length) return; M.transitions.splice(pos, 1); M.transitions.splice(k, 0, t); commit(); };
      if (t) selSection.append(h('div', { class: 'asm-section-title' }, `Transition ${t.name}`),
        field('Name', text(t.name, v => { t.name = v.trim() || t.name; commit(); }, 'mono')),
        field('Guard', text(t.guard, v => { t.guard = v.trim(); commit(); }, 'mono'), 'a condition on the inputs, e.g. go & !stop (empty: always)'),
        field('Pulses when it fires', text(formatOutputs(t.outputs), v => { const o = parseOutputs(v); if (o.error) status(o.error, true); else { t.outputs = o.outputs; commit(); } }, 'mono'), '1 during the clock cycle after it fired'),
        h('div', { class: 'asm-label' }, `Priority ${pos + 1} of ${M.transitions.length} (in a conflict, the first takes the tokens)`),
        h('div', { class: 'asm-row' }, btn('▲ Higher', 'Fire before the others', () => move(-1), 'asm-small'), btn('▼ Lower', 'Fire after the others', () => move(1), 'asm-small')));
    } else {
      const a = M.arcs.find(x => x.id === sel.id);
      if (a) selSection.append(h('div', { class: 'asm-section-title' }, `Arc ${nodeOf(a.from)?.name ?? '?'} → ${nodeOf(a.to)?.name ?? '?'}`),
        field('Weight', number(a.weight, 1, 255, v => { a.weight = v; commit(); }), a.inhibitor ? 'the transition fires while the place holds fewer tokens than this' : placeOf(a.from) ? 'the tokens it takes' : 'the tokens it puts'),
        ...(placeOf(a.from) ? [h('label', { class: 'asm-check' }, (() => { const c = h('input', { type: 'checkbox', checked: !!a.inhibitor }); c.addEventListener('change', () => { if (c.checked) a.inhibitor = true; else delete a.inhibitor; commit(); }); return c; })(), ' Inhibitor arc')] : []));
    }
    // the net
    netBody.replaceChildren(
      field('Module name', text(M.name, v => { M.name = v.trim() || M.name; commit(); }, 'mono')),
      field('Inputs', text(ioText(M.inputs), v => { M.inputs = parseIo(v); commit(); }, 'mono'), 'names, a width in brackets: go, sel[2]'),
      field('Outputs', text(ioText(M.outputs), v => { M.outputs = parseIo(v); commit(); }, 'mono'), 'e.g. busy, st[2]'),
      field('Clock', text(M.clock, v => { M.clock = v.trim() || 'clk'; commit(); }, 'mono')),
      field('Reset (synchronous, to the initial marking)', text(M.reset.name, v => { M.reset.name = v.trim() || 'rst'; commit(); }, 'mono')),
      field('Description', (() => { const ta = h('textarea', { class: 'asm-input', rows: 2 }, M.description || ''); ta.addEventListener('change', () => { M.description = ta.value; commit(); }); return ta; })()));
    // the problems
    const diags = validatePetri(M);
    probList.replaceChildren(...diags.map(d => {
      const li = h('li', { class: `asm-prob ${d.severity}` }, d.message);
      if (d.ref?.id) li.addEventListener('click', () => { sel = { kind: d.ref.kind, id: d.ref.id }; render(); });
      return li;
    }));
    probCount.textContent = diags.length ? `(${diags.length})` : '';
  }
  function refreshLink() {
    const li = opts.linkInfo?.();
    linkHost.replaceChildren(...(li?.file ? [h('span', { class: 'gen-banner' }, 'HDL: ', (() => { const a = h('a', {}, li.file.split('/').pop()); a.addEventListener('click', () => opts.onOpenFile?.(li.file)); return a; })(), ' — generated from the net')] : []));
  }

  // ---------------------------------------------------------------- simulation and HDL panel
  const envOf = () => Object.fromEntries(M.inputs.map(i => [i.name, BigInt(sim?.inputs[i.name] ?? 0)]));
  function resetSim(rerender = true) {
    if (sim?.timer) clearInterval(sim.timer);
    sim = { marking: initialMarking(M), fired: [], inputs: sim?.inputs || {}, log: [], timer: null };
    if (rerender) render();
  }
  function togglePanel(which) {
    panel = panel === which ? null : which;
    bottom.hidden = !panel;
    for (const [k, b] of Object.entries(tabBtns)) b.classList.toggle('active', k === panel);
    if (panel === 'sim' && !sim) resetSim(false);
    if (panel !== 'sim' && sim) { if (sim.timer) clearInterval(sim.timer); sim = null; }
    render();
  }
  const say = (msg) => { sim.log.unshift(msg); sim.log.length = Math.min(sim.log.length, 50); };
  function fireOne(tid) {
    const ok = enabledTransitions(M, sim.marking, envOf()).includes(tid);
    if (!ok) { status(`${transOf(tid)?.name}: not enabled${enabledTransitions(M, sim.marking, null).includes(tid) ? ' (its guard is false)' : ''}`, true); return; }
    sim.marking = fire(M, sim.marking, tid); sim.fired = [tid];
    say(`fire ${transOf(tid).name}`);
    status('');
    render();
  }
  function step() {
    const r = clockStep(M, sim.marking, envOf());
    sim.marking = r.marking; sim.fired = r.fired;
    say(r.fired.length ? `clock: ${r.fired.map(id => transOf(id).name).join(', ')}` : 'clock: nothing fires');
    render();
  }
  function randomFire() {
    const en = enabledTransitions(M, sim.marking, envOf());
    if (!en.length) { status(isDeadlock(M, sim.marking) ? 'Deadlock: no transition can fire' : 'No transition is enabled with these inputs', true); return; }
    fireOne(en[Math.floor(Math.random() * en.length)]);
  }
  // the simulation's controls (its buttons, the inputs) are made once and kept: drawn again at every
  // clock step of Run, a click on ■ Stop or on an input whose press and release fell on each side of
  // a step went to an element no longer there, and was lost
  const runBtn = btn('▶▶ Run', 'Clock steps every half second', () => {
    if (sim.timer) { clearInterval(sim.timer); sim.timer = null; } else sim.timer = setInterval(() => { if (!destroyed && sim) step(); }, 500);
    render();
  });
  const simTools = [btn('⏭ Clock step', 'A clock edge: every enabled transition whose guard is true fires (priority order), as the hardware does', () => step()),
    btn('🎲 Random', 'Fire one enabled transition at random (the token game)', () => randomFire()), runBtn,
    btn('⟲ Reset', 'Back to the initial marking', () => { sim.inputs = sim.inputs || {}; resetSim(); })];
  const simLive = h('div', { class: 'pn-sim-live' });
  let simIns = null;   // { key: the inputs (names, widths), row, set(): the controls show sim.inputs }
  function simInputs() {
    const key = JSON.stringify(M.inputs.map(i => [i.name, i.width]));
    if (simIns?.key !== key) {
      const sets = [];
      const ins = h('div', { class: 'pn-sim-ins' }, ...M.inputs.map(i => {
        if (i.width === 1) {
          const c = h('input', { type: 'checkbox' });
          c.addEventListener('change', () => { sim.inputs[i.name] = c.checked ? 1 : 0; render(); });
          sets.push(() => { c.checked = !!sim.inputs[i.name]; });
          return h('label', { class: 'asm-check' }, c, ` ${i.name}`);
        }
        const n = h('input', { type: 'number', class: 'asm-input pn-num', min: '0', max: String((1 << i.width) - 1) });
        n.addEventListener('change', () => { sim.inputs[i.name] = Math.max(0, Math.min((1 << i.width) - 1, +n.value || 0)); render(); });
        sets.push(() => { if (document.activeElement !== n) n.value = String(sim.inputs[i.name] ?? 0); });
        return h('label', { class: 'asm-field pn-inline' }, h('span', { class: 'asm-label' }, i.name), n);
      }));
      simIns = { key, row: h('div', { class: 'pn-sim-row' }, h('b', {}, 'Inputs: '), M.inputs.length ? ins : h('span', {}, 'none')), set: () => sets.forEach(f => f()) };
    }
    simIns.set();
    return simIns.row;
  }
  function renderPanel() {
    if (!panel) return;
    if (panel !== 'sim') { panelTools.replaceChildren(); panelBody.replaceChildren(); }
    if (panel === 'code') {
      panelTitle.textContent = `${M.lang === 'vhdl' ? 'VHDL' : 'Verilog'} generated from the net`;
      let code;
      try { code = generatePetri(M, M.lang, { source: `${M.name}.pn.json` }).code; } catch (e) { code = e.message; }
      panelBody.append(h('pre', { class: 'asm-code pn-code' }, code));
      return;
    }
    if (panel === 'analysis') { renderAnalysis(); return; }
    panelTitle.textContent = 'Simulation';
    const runLabel = sim.timer ? '■ Stop' : '▶▶ Run';
    if (runBtn.dataset.label !== runLabel) { runBtn.dataset.label = runLabel; runBtn.textContent = runLabel; }
    if (panelTools.firstChild !== simTools[0]) panelTools.replaceChildren(...simTools);
    const insRow = simInputs();
    if (panelBody.firstChild !== insRow || panelBody.lastChild !== simLive) panelBody.replaceChildren(insRow, simLive);
    const outs = outputsOf(M, sim.marking, sim.fired);
    const dead = isDeadlock(M, sim.marking);
    simLive.replaceChildren(...[
      h('div', { class: 'pn-sim-row' }, h('b', {}, 'Outputs: '), h('span', { class: 'mono pn-outs-now' }, Object.entries(outs).map(([k, v]) => `${k}=${v.toString(2)}`).join('  ') || 'none')),
      h('div', { class: 'pn-sim-row' }, h('b', {}, 'Marking: '), h('span', { class: 'mono pn-marking' }, M.places.map(p => `${p.name}=${sim.marking[p.id] || 0}`).join('  '))),
      dead ? h('div', { class: 'pn-sim-row pn-dead' }, 'Deadlock: no transition can fire, whatever the inputs') : null,
      h('div', { class: 'asm-label' }, 'Click an enabled transition (green: its guard is true) to fire it.'),
      h('ol', { class: 'pn-log' }, ...sim.log.map(l => h('li', {}, l)))].filter(Boolean));
  }

  // ---------------------------------------------------------------- analysis (#188)
  let anCache = null;
  function analysis() {
    const key = JSON.stringify([M.places, M.transitions, M.arcs]);
    if (anCache?.key !== key) anCache = { key, res: analyzePetri(M) };
    return anCache.res;
  }
  const mark = mk => M.places.map(p => `${p.name}=${mk[p.id] || 0}`).join('  ');
  const sum = (w, list) => Object.entries(w).map(([id, k]) => `${k > 1 ? `${k}·` : ''}${list.find(x => x.id === id)?.name ?? id}`).join(' + ');
  function renderAnalysis() {
    panelTitle.textContent = 'Analysis';
    const a = analysis();
    const yes = (ok, txt) => h('span', { class: ok ? 'pn-ok' : 'pn-bad' }, txt);
    const maxB = Math.max(0, ...Object.values(a.bounds));
    const row = (k, v) => h('tr', {}, h('th', {}, k), h('td', {}, v));
    const showAt = mk => { if (panel !== 'sim') togglePanel('sim'); sim.marking = { ...mk }; sim.fired = []; sim.log = []; say('analysis: a deadlock'); render(); };
    const states = a.states.length;
    panelBody.append(
      h('div', { class: 'asm-label' }, `The token game, whatever the inputs (the guards are not taken into account): ${states}${a.truncated ? '+' : ''} reachable marking${states === 1 ? '' : 's'}${a.truncated ? ` (stopped at ${a.maxStates}: the results are partial)` : ''}.`),
      h('table', { class: 'pn-an-props' },
        row('Bounded', a.safe ? yes(true, 'safe (at most 1 token in each place)') : yes(true, `${maxB}-bounded`)),
        row('Deadlocks', a.deadlockCount ? yes(false, `${a.deadlockCount} reachable marking${a.deadlockCount === 1 ? '' : 's'} where no transition can fire`) : yes(true, 'none')),
        row('Live', a.truncated ? 'unknown (partial graph)' : a.live ? yes(true, 'yes: every transition can always fire again') : yes(false, 'no')),
        row('Reversible', a.reversible == null ? 'unknown (partial graph)' : a.reversible ? yes(true, 'yes: the initial marking can always be reached again') : yes(false, 'no')),
        row('Conservative', a.conservative ? yes(true, 'yes: every place is in a P-invariant') : 'no')),
      h('div', { class: 'pn-an-title' }, 'Places'),
      h('table', { class: 'pn-an-table pn-an-places' }, h('tr', {}, h('th', {}, 'Place'), h('th', {}, 'Most tokens'), h('th', {}, 'Capacity'), h('th', {}, 'Bits needed')),
        ...M.places.map(p => { const b = a.bounds[p.id]; return h('tr', {}, h('td', {}, p.name), h('td', {}, String(b)), h('td', {}, String(p.capacity) + (b >= p.capacity && p.capacity > 0 ? ' (reached)' : '')), h('td', {}, b > 1 ? `${Math.ceil(Math.log2(b + 1))} bits` : '1 flip-flop')); })),
      h('div', { class: 'pn-an-title' }, 'Transitions'),
      h('table', { class: 'pn-an-table pn-an-trans' }, h('tr', {}, h('th', {}, 'Transition'), h('th', {}, '')),
        ...M.transitions.map(t => { const l = a.liveness[t.id]; return h('tr', {}, h('td', {}, t.name), h('td', {}, l === 'dead' ? yes(false, 'never fires') : l === 'live' ? yes(true, 'live') : 'can fire, but not always again')); })),
      ...(a.deadlocks.length ? [h('div', { class: 'pn-an-title' }, 'Deadlocks'),
        h('ul', { class: 'pn-an-dead' }, ...a.deadlocks.map(d => h('li', {}, h('span', { class: 'mono' }, mark(d.marking)), ` after ${d.path.length ? d.path.map(id => transOf(id)?.name).join(', ') : 'nothing (the initial marking)'} `,
          btn('Show', 'Simulate from this marking', () => showAt(d.marking), 'asm-small'))))] : []),
      h('div', { class: 'pn-an-title' }, 'P-invariants (weighted token sums that never change)'),
      h('ul', { class: 'pn-an-pinv mono' }, ...(a.pInvariants == null ? [h('li', {}, 'too many to compute')] : a.pInvariants.length ? a.pInvariants.map(v => h('li', {}, `${sum(v.weights, M.places)} = ${v.tokens}`)) : [h('li', {}, 'none')])),
      h('div', { class: 'pn-an-title' }, 'T-invariants (firing counts that bring a marking back)'),
      h('ul', { class: 'pn-an-tinv mono' }, ...(a.tInvariants == null ? [h('li', {}, 'too many to compute')] : a.tInvariants.length ? a.tInvariants.map(v => h('li', {}, sum(v, M.transitions))) : [h('li', {}, 'none')])),
      h('details', { class: 'pn-an-graph' }, h('summary', {}, `Reachability graph${states > 200 ? ' (the first 200 markings)' : ''}`),
        h('ol', { start: '0', class: 'mono' }, ...a.states.slice(0, 200).map(st => h('li', {}, mark(st.marking), st.succ.length ? `  →  ${st.succ.map(e => `${transOf(e.transition)?.name}: M${e.to}`).join(', ')}` : '  (deadlock)')))));
  }

  // ---------------------------------------------------------------- mouse and keys
  const hit = e => { const g = e.target.closest?.('[data-kind]'); return g ? { kind: g.dataset.kind, id: g.dataset.id } : null; };
  svg.addEventListener('pointerdown', e => {
    root.focus({ preventScroll: true });
    fitted = true;
    const w = toWorld(e.clientX, e.clientY), t = hit(e);
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
      if (n) drag = { kind: 'move', id: n.id, dx: w.x - n.x, dy: w.y - n.y, moved: false };
      render();
    } else {
      sel = null;
      drag = { kind: 'pan', x: e.clientX, y: e.clientY, tx: view.tx, ty: view.ty };
      render();
    }
    svg.setPointerCapture?.(e.pointerId);
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
  svg.addEventListener('wheel', e => {
    e.preventDefault();
    fitted = true;
    const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.max(0.25, Math.min(4, view.k * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
    view.tx = mx - (mx - view.tx) * k / view.k; view.ty = my - (my - view.ty) * k / view.k; view.k = k;
    applyView();
  }, { passive: false });
  root.addEventListener('keydown', e => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
    if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); e.stopPropagation(); undo(); }
    else if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); e.stopPropagation(); redo(); }
    else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelection(); }
    else if (e.key === 'Escape') { setTool('select'); }
  });

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
    // its HDL file linked (generatedFile, #245): nothing else changes, Undo / Redo keep the link
    setLink(file) { linkModel(M, file); hist.forEach((s, i) => { hist[i] = linkSnapshot(s, file, normalizePetri); }); refreshLink(); },
    fit, refreshLink,
    destroy() { destroyed = true; ro?.disconnect(); if (sim?.timer) clearInterval(sim.timer); container.innerHTML = ''; },
  };
}
