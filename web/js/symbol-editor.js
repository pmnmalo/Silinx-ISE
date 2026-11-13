// The Symbol Editor (#3755): a module's symbol of its own (<module>.sym.json, core/symbol-layout.js), as ISE's
// Symbol Editor edits a .sym: its pins' order and side (left, right, top, bottom: a pin dragged to its new place, or
// its Side and Position in the Properties), the spacing between the pins, the body's width and height, where the
// module's name is drawn. The symbol drawn as the schematic draws it (sch-svg.js). Its toolbar (the pin earlier /
// later, Reset to Default, the zoom, ☰ Properties), its foldable Properties panel and its status line
// (the pins, the body's size) are the other editors' (docs/UI-GUIDELINES.md); its messages go to the console
// (onMessage). Standalone: no app state.
//
//   const ed = mountSymbolEditor(container, { symbol, module, readOnly, banner, onChange(symbol), onMessage(text, warn) });
//   ed.getSymbol(); ed.setModule(module); ed.select(pinName); ed.undo(); ed.redo(); ed.destroy();
import { h } from './dom.js';
import { toolIcon, zoomTools } from './editor-icons.js';
import { panelToggle, PROPS_KEY } from './narrow.js';
import { statusLine } from './status-line.js';
import { mountSideFold } from './side-fold.js';
import { symbolSvg, SVGNS } from './sch-svg.js';
import { instanceParams, newSymbol, normalizeSymbol, reconcile, symbolDef, symbolPins } from '/core/schdoc.js';
import { mountSymbolSide } from './symbol-side.js';

const clone = o => JSON.parse(JSON.stringify(o));
const M = 40;   // (the margin around the symbol: its pins' names)

export function mountSymbolEditor(container, opts = {}) {
  const readOnly = !!opts.readOnly;
  let module = opts.module || null;
  let S = normalizeSymbol(opts.symbol || newSymbol(module || { name: '?' })).symbol;
  let sel = null, zoom = 2, dragging = null, destroyed = false;
  const hist = [];
  let hi = -1;

  container.innerHTML = '';
  const root = h('div', { class: 'asm-editor sym-editor', tabindex: '0' });
  container.append(root);
  const btn = (label, title, onclick, cls = '') => h('button', { type: 'button', class: `asm-btn ${cls}`, title, onclick }, label);
  const sep = () => h('span', { class: 'asm-sep' });
  const say = (text, warn = false) => opts.onMessage?.(text, warn);

  // ---------------------------------------------------------------- toolbar
  const earlier = btn('◀ Earlier', 'Move the selected pin one place earlier on its side (up, or left)', () => shift(-1), 'sy-earlier');
  const later = btn('Later ▶', 'Move the selected pin one place later on its side (down, or right)', () => shift(1), 'sy-later');
  const zoomLbl = h('span', { class: 'asm-zoom', title: 'Zoom level' }, '200%');
  // (Reset to Default in the toolbar, with the tools that change the symbol, #3789)
  const resetBtn = btn('Reset to Default', 'The symbol as Silinx draws it by default: the inputs on the left, the outputs on the right, in the module\'s order', () => reset(), 'sy-reset');
  const editing = h('div', { class: 'asm-group' }, earlier, later, resetBtn);
  const toolbar = h('div', { class: 'asm-toolbar sy-toolbar' },
    readOnly ? null : editing, readOnly ? null : sep(),
    h('div', { class: 'asm-group' }, ...zoomTools(f => setZoom(zoom * f), () => fit()), zoomLbl),
    h('div', { class: 'asm-spacer' }),
    h('div', { class: 'asm-group' }, panelToggle(root, btn('☰ Properties', 'Show / hide the properties panel'), { key: PROPS_KEY })),
    opts.banner || null);

  // ---------------------------------------------------------------- canvas, side panel, status line
  const svg = document.createElementNS(SVGNS, 'svg');
  svg.setAttribute('class', 'se-svg sy-svg');
  const canvasWrap = h('div', { class: 'asm-canvas-wrap sch-editor sy-canvas' }, svg);
  const side = h('aside', { class: 'asm-side' }, h('div', { class: 'asm-cap' }, 'Properties'));
  mountSideFold({ root, side, key: 'silinx.symbol.props.folded' });
  const info = statusLine();
  root.append(toolbar, h('div', { class: 'asm-body' }, h('div', { class: 'asm-main' }, canvasWrap), side), info.el);
  const { renderSide } = mountSymbolSide({ side, readOnly, S: () => S, sel: () => sel, module: () => module, sideOf, movePin, commit });

  // ---------------------------------------------------------------- the symbol: its ports, its drawing
  const ports = () => (module?.ports?.length ? module.ports : S.pins.map(q => ({ name: q.name, dir: q.side === 'E' ? 'out' : 'in', width: 1 })));
  function instance() {
    const m = { name: S.module, ports: ports(), symbol: S };
    return { id: 'SYM', type: 'module', name: '', x: 0, y: 0, rot: 0, mirror: false, params: { module: S.module, generics: {}, ...instanceParams(m) }, modules: { [S.module]: m } };
  }
  function sideOf(name) { return S.pins.find(q => q.name === name)?.side; }

  // the module's ports and the symbol's pins in step: the new ports added, the ones gone dropped (in the console)
  function inStep(say_ = true) {
    if (!module) return false;
    const r = reconcile(S, module.ports);
    if (!r.added.length && !r.removed.length) return false;
    S.pins = r.pins;
    if (say_ && r.added.length) say(`${S.module}: pins added for the module's new ports: ${r.added.join(', ')}`, true);
    if (say_ && r.removed.length) say(`${S.module}: pins removed, the module has no such ports any more: ${r.removed.join(', ')}`, true);
    return true;
  }

  function render() {
    if (destroyed) return;
    const s = instance(), def = symbolDef(s, s.modules);
    const vw = def.w + 2 * M, vh = def.h + 2 * M;
    svg.setAttribute('viewBox', `${-M} ${-M} ${vw} ${vh}`);
    svg.setAttribute('width', String(Math.round(vw * zoom)));
    svg.setAttribute('height', String(Math.round(vh * zoom)));
    // (the symbol as the schematic draws it, its names through sch-svg.js's esc; the pins' handles, DOM nodes)
    svg.innerHTML = symbolSvg(s, def);
    for (const p of symbolPins(s, s.modules, def)) {
      const c = document.createElementNS(SVGNS, 'circle'), t = document.createElementNS(SVGNS, 'title');
      for (const [k, v] of Object.entries({ class: `sy-pin${p.name === sel ? ' sel' : ''}`, 'data-pin': p.name, cx: p.x, cy: p.y, r: 5 })) c.setAttribute(k, String(v));
      t.textContent = p.name;
      c.append(t);
      svg.append(c);
    }
    zoomLbl.textContent = `${Math.round(zoom * 100)}%`;
    const has = !!sel && !readOnly;
    earlier.disabled = !has; later.disabled = !has;
    info.set([`${S.pins.length} pin(s)`, `${def.body.w} × ${def.body.h}`]);
    renderSide();
    return def;
  }
  const setZoom = z => { zoom = Math.max(0.5, Math.min(8, z)); render(); };
  function fit() {
    const s = instance(), def = symbolDef(s, s.modules);
    const r = canvasWrap.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) zoom = Math.max(0.5, Math.min(4, Math.min((r.width - 20) / (def.w + 2 * M), (r.height - 20) / (def.h + 2 * M))));
    render();
  }

  // ---------------------------------------------------------------- edits
  function commit() {
    if (readOnly) return;
    const t = JSON.stringify(S);
    if (t !== hist[hi]) { hist.length = hi + 1; hist.push(t); if (hist.length > 200) hist.shift(); hi = hist.length - 1; opts.onChange?.(clone(S)); }
    render();
  }
  const restore = i => { hi = i; S = JSON.parse(hist[hi]); if (sel && !sideOf(sel)) sel = null; opts.onChange?.(clone(S)); render(); };
  const undo = () => { if (hi > 0) restore(hi - 1); };
  const redo = () => { if (hi < hist.length - 1) restore(hi + 1); };

  /** The pin `name` to `side`, at `index` among that side's other pins (0: the first, top or left). */
  function movePin(name, side, index) {
    const at = S.pins.findIndex(q => q.name === name);
    if (at < 0) return;
    const [pin] = S.pins.splice(at, 1);
    pin.side = side;
    const same = S.pins.map((q, i) => [q, i]).filter(([q]) => q.side === side);
    const k = Math.max(0, Math.min(index, same.length));
    const pos = k < same.length ? same[k][1] : same.length ? same[same.length - 1][1] + 1 : S.pins.length;
    S.pins.splice(pos, 0, pin);
    commit();
  }
  function shift(by) {
    if (!sel) return;
    const sd = sideOf(sel), same = S.pins.filter(q => q.side === sd).map(q => q.name);
    const i = same.indexOf(sel);
    if (i + by < 0 || i + by >= same.length) return;
    movePin(sel, sd, i + by);
  }
  function reset() {
    S = { ...newSymbol({ name: S.module, ports: ports() }) };
    commit();
    say(`${S.module}: the symbol reset to the default one`);
  }

  // ---------------------------------------------------------------- the mouse: select a pin, drag it to its new place
  const toLocal = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const m = svg.getScreenCTM(); return m ? p.matrixTransform(m.inverse()) : { x: 0, y: 0 }; };
  // (no text of the drawing selected by a drag, #3789: the pins' names are drawn, not text to select)
  svg.addEventListener('mousedown', e => e.preventDefault());
  svg.addEventListener('pointerdown', e => {
    e.preventDefault();
    const c = e.target.closest?.('.sy-pin');
    sel = c ? c.dataset.pin : null;
    if (c && !readOnly) { dragging = { name: sel, id: e.pointerId }; svg.setPointerCapture?.(e.pointerId); }
    render();
  });
  // while a pin is dragged: its handle under the pointer, and a mark where it will go on its side (#3789)
  svg.addEventListener('pointermove', e => {
    if (!dragging) return;
    const pt = toLocal(e), s = instance(), def = symbolDef(s, s.modules), t = target(dragging.name, pt, def, def.body);
    svg.querySelectorAll('.sy-ghost, .sy-mark').forEach(x => x.remove());
    const node = (tag, attrs) => { const n = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v)); svg.append(n); };
    node('line', { class: 'sy-mark', ...t.mark });
    node('circle', { class: 'sy-ghost', cx: pt.x, cy: pt.y, r: 5 });
  });
  svg.addEventListener('pointerup', e => {
    if (!dragging) return;
    const d = dragging; dragging = null;
    const pt = toLocal(e), s = instance(), def = symbolDef(s, s.modules);
    const pin = def.pins.find(q => q.name === d.name);
    if (pin && Math.hypot(pt.x - pin.x, pt.y - pin.y) < 8) { render(); return; }   // (a click: only selected)
    const t = target(d.name, pt, def, def.body);
    movePin(d.name, t.side, t.index);
  });
  /** Where the pin `name` dropped at `pt` goes: { side, index, mark } (mark: a bar across that side's leads there). */
  function target(name, pt, def, b) {
    // (the side the point is beyond, the further one at a corner; inside the body, its nearest edge)
    const dx = pt.x < b.x ? b.x - pt.x : pt.x > b.x + b.w ? pt.x - b.x - b.w : 0, dy = pt.y < b.y ? b.y - pt.y : pt.y > b.y + b.h ? pt.y - b.y - b.h : 0;
    const dist = { W: Math.abs(pt.x - b.x), E: Math.abs(pt.x - (b.x + b.w)), N: Math.abs(pt.y - b.y), S: Math.abs(pt.y - (b.y + b.h)) };
    const sd = dx || dy ? (dx >= dy ? (pt.x < b.x ? 'W' : 'E') : (pt.y < b.y ? 'N' : 'S')) : Object.keys(dist).reduce((a, k) => (dist[k] < dist[a] ? k : a), 'W');
    const across = sd === 'W' || sd === 'E', along = q => (across ? q.y : q.x), at = across ? pt.y : pt.x;
    const index = def.pins.filter(q => q.side === sd && q.name !== name && along(q) < at).length;
    const c = across ? Math.min(b.y + b.h, Math.max(b.y, pt.y)) : Math.min(b.x + b.w, Math.max(b.x, pt.x));
    const [e0, e1] = { W: [b.x - 20, b.x], E: [b.x + b.w, b.x + b.w + 20], N: [b.y - 20, b.y], S: [b.y + b.h, b.y + b.h + 20] }[sd];   // (a lead's length)
    const mark = across ? { x1: e0, y1: c, x2: e1, y2: c } : { x1: c, y1: e0, x2: c, y2: e1 };
    return { side: sd, index, mark };
  }
  root.addEventListener('keydown', e => {
    if (readOnly || !sel || e.target.closest('input, select, textarea')) return;
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { shift(-1); e.preventDefault(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { shift(1); e.preventDefault(); }
  });

  if (inStep()) { hist.push(JSON.stringify(normalizeSymbol(opts.symbol || newSymbol(module)).symbol)); hi = 0; commit(); }
  else { hist.push(JSON.stringify(S)); hi = 0; render(); }
  requestAnimationFrame(() => { if (!destroyed && canvasWrap.isConnected) fit(); });

  return {
    root,
    getSymbol: () => clone(S),
    setModule(m) { module = m; if (inStep()) commit(); else render(); },
    select(name) { sel = sideOf(name) ? name : null; render(); },
    undo, redo, fit,
    destroy() { destroyed = true; container.innerHTML = ''; },
  };
}
