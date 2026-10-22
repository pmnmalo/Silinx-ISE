// The schematic editor's mouse (#405: out of mountSchEditor in sch-editor.js): a press by the tool in use (select,
// move with rubber-banding wires, drag a wire's segment, draw a wire, place a symbol or a marker, pan), the pointer's
// moves (the hover, the drop target), the release (a move checked for clashes, rerouted, untangled), the wheel, the
// double click, the context menu.
import { GRID, defaultParams, normalizeDoc, splitWiresAt, symbolPins } from '/core/schdoc.js';
import { connectionsKept, connectivity, placementClashes, rerouteAfterMove } from '/core/schroute.js';
import { twoFingerView } from './ui.js';
import { untangleNew } from '/core/schpath.js';
import { clone, snap } from './sch-editor.js';
import { mountStroke } from './sch-stroke.js';

/** { finishMove, onMove, onUp } of mountSchEditor (cursor(), destroyed(), doc(), drag(), hoverPin(), keepConn(), live(), modules(), sel(), spaceDown(), tool(), view(), wireDraw(): its current values). */
export function mountSchMouse(ctx) {
  const {
    container, opts, applyMove, applySegMove, applyView, bandRect, bandSelect, beginMove, beginSegMove, canvas, changed,
    cursor, destroyed, doc, drag, finishSegMove, finishWire, flash, hoverPin, ioClick, itemAt, keepConn, live, modules,
    netClick, pinNear, placeAt, propBody, pushUndo, readOnly, refusedShort, render, renderOverlay, renderProps, sel,
    setTool, spaceDown, svg, toSheet, tool, updateStatus, view, wireClick, wireDraw, zoomAt, setCursor, setDoc, setDrag,
    setHoverPin, setSel, setWireDraw
  } = ctx;
  // a wire drawn as a freehand stroke (#1052)
  const { strokeStart, strokeMove, strokeEnd, strokeCancel } = mountStroke({ doc, modules, view, pinNear, finishWire, renderOverlay, setWireDraw });

  function onDown(e) {
    if (e.button === 2) { e.preventDefault(); if (wireDraw()) finishWire(); else if (tool() !== 'select') setTool('select'); return; }
    container.focus({ preventScroll: true });
    const pt = toSheet(e.clientX, e.clientY);
    setCursor(pt);
    if (e.button === 1 || spaceDown()) { e.preventDefault(); setDrag({ kind: 'pan', cx: e.clientX, cy: e.clientY, tx: view().tx, ty: view().ty }); canvas.classList.add('panning'); return; }
    if (e.button !== 0) return;
    // live simulation: the inputs are controls, the rest of the sheet pans
    if (live()) { if (!live().pointerDown(e, itemAt(e.target))) setDrag({ kind: 'pan', cx: e.clientX, cy: e.clientY, tx: view().tx, ty: view().ty }); return; }
    if (tool() === 'place') { placeAt(pt); return; }
    if (tool() === 'wire') {
      // (a press on a pin, a marker or a wire, no wire being drawn: a click, or the start of a stroke, #1052)
      const st = !readOnly && !wireDraw() && e.detail < 2 ? strokeStart(pt, e) : null;
      wireClick(pt, e.detail >= 2);
      if (st) setDrag(st);
      return;
    }
    if (tool() === 'net') { netClick(pt); return; }
    if (tool() === 'io') { ioClick(pt); return; }
    const it = itemAt(e.target);
    if (it) {
      // the item is drawn again below (render): without this, Safari (WebKit) sends the mousedown to
      // the removed element and moves the keyboard focus to the page, so F1, Delete, Ctrl+C… did
      // nothing after a click on a symbol (the focus stays on the editor, given above)
      e.preventDefault();
      const k = `${it.kind}:${it.id}`;
      if (e.shiftKey || e.ctrlKey || e.metaKey) { if (sel().has(k)) sel().delete(k); else sel().add(k); render(); renderProps(); return; }
      const sel0 = sel();
      if (!sel().has(k)) { setSel(new Set([k])); render(); renderProps(); }
      if (e.detail >= 2) return;            // handled by the dblclick listener
      // one wire, Keep connections: the segment under the pointer is dragged, the rest stays (#688)
      if (!readOnly && it.kind === 'wire' && keepConn() && sel().size === 1) { const sd = beginSegMove(it.id, pt); if (sd) { setDrag({ ...sd, sel0 }); return; } }
      if (!readOnly) setDrag({ ...beginMove({ x: snap(pt.x), y: snap(pt.y) }), sel0 });
      return;
    }
    setDrag({ kind: 'band', start: pt, cur: pt, add: e.shiftKey || e.ctrlKey || e.metaKey });
  }
  function onMove(e) {
    if (destroyed()) return;
    const pt = toSheet(e.clientX, e.clientY);
    setCursor(pt);
    if (drag()?.kind === 'pan') { view().tx = drag().tx + e.clientX - drag().cx; view().ty = drag().ty + e.clientY - drag().cy; applyView(); return; }
    if (drag()?.kind === 'move') { applyMove(drag(), snap(pt.x) - drag().start.x, snap(pt.y) - drag().start.y); return; }
    if (drag()?.kind === 'seg') { applySegMove(drag(), drag().hz ? snap(pt.y) - drag().start.y : snap(pt.x) - drag().start.x); return; }
    if (drag()?.kind === 'band') { drag().cur = pt; renderOverlay(); return; }
    if (drag()?.kind === 'stroke') { setHoverPin(pinNear(pt)); strokeMove(drag(), pt, e); return; }
    if (!svg.contains(e.target) && e.target !== svg) { live()?.hideTip(); return; }
    if (live()) { live().hover(e, pt, view().s); updateStatus(); return; }
    if (tool() === 'wire' || tool() === 'io' || tool() === 'net') setHoverPin(pinNear(pt)); else setHoverPin(null);
    if (tool() !== 'select') renderOverlay();
    updateStatus();
  }
  // after a move: re-route the stretched wires so every connection is kept and none is added
  function finishMove(m) {
    // dropped with a pin on another net: nudge to the nearest clear position (up to 5 grid steps)
    if (keepConn() && (m.symIds.size || m.portIds.size)) {
      const attachedIds = new Set(m.attach.map(a => a.id));
      const clash = () => placementClashes(doc(), { moved: { symIds: m.symIds, portIds: m.portIds }, attachedIds, modules: modules(), guard: m.guard });
      if (clash()) {
        const bx = m.dx, by = m.dy;
        let found = false;
        for (let r = 1; r <= 5 && !found; r++) {
          for (let i = -r; i <= r && !found; i++) for (const [ox, oy] of [[i, -r], [i, r], [-r, i], [r, i]]) {
            applyMove(m, bx + ox * GRID, by + oy * GRID);
            if (!clash()) { found = true; break; }
          }
        }
        if (!found) applyMove(m, bx, by);
      }
    }
    if (keepConn() && m.attach.length) {
      try { rerouteAfterMove(doc(), { orig: m.orig, attached: m.attach, dx: m.dx, dy: m.dy, modules: modules() }); } catch (e) { console.error(e); }
    }
    // a free pin or marker dropped onto a wire connects there (#170): the wire split at it (#678)
    const free = [];
    for (const s of doc().symbols) if (m.symIds.has(s.id)) for (const p of symbolPins(s, modules())) if (!m.guard?.has(`${s.id}/${p.name}`)) free.push(p);
    for (const p of doc().ports) if (m.portIds.has(p.id) && !m.guard?.has(`port:${p.id}`)) free.push(p);
    const stretched = new Set([...m.wireIds, ...m.attach.map(a => a.id)]);
    splitWiresAt(doc(), free, new Set(doc().wires.map(w => w.id).filter(id => !stretched.has(id))));
    // a wire the move left on another wire, over a pin or through a body routed around them (#948)
    try { untangleNew(JSON.parse(m.before), doc(), { modules: modules(), prefer: [...stretched] }); } catch (e) { console.error(e); }
    setDoc(normalizeDoc(doc()));
    if (refusedShort(m.before, 'The move')) return;
    if (keepConn() && m.conn0) {
      let now = null;
      try { now = connectivity(doc(), modules()); } catch { /* ignore */ }
      if (now && !connectionsKept(m.conn0, now)) flash('Connections changed by this move (a pin now touches another net, or a wire could not be routed). Undo with Ctrl+Z if not intended.');
    }
    pushUndo(m.before); changed(); render(); renderProps();
  }
  function onUp(e) {
    if (!drag()) return;
    const d = drag(); setDrag(null);
    if (d.kind === 'pan') { canvas.classList.remove('panning'); return; }
    if (d.kind === 'seg') { if (d.d) finishSegMove(d); return; }
    if (d.kind === 'stroke') { strokeEnd(d, toSheet(e.clientX, e.clientY)); return; }
    if (d.kind === 'move') {
      if (d.dx || d.dy) finishMove(d);
      else if (d.synth?.length) { doc().wires = doc().wires.filter(w => !d.synth.includes(w.id)); render(); }   // just a click
      return;
    }
    if (d.kind === 'band') {
      const r = bandRect(d);
      if (r.w < 3 && r.h < 3) { if (!d.add) sel().clear(); }
      else bandSelect(d.add, d);
      render(); renderProps();
    }
  }
  // a second finger (#674): what the first one started undone, the selection as it was
  function cancelDrag() {
    const d = drag(); setDrag(null);
    if (d?.kind === 'pan') canvas.classList.remove('panning');
    else if (d?.kind === 'move') {
      Object.assign(doc(), d.orig, { wires: d.orig.wires.filter(w => !d.synth?.includes(w.id)) });
      if (d.sel0) setSel(d.sel0);
      render(); renderProps();
    } else if (d?.kind === 'seg') {
      const w = doc().wires.find(x => x.id === d.id);
      if (w) w.points = clone(d.pts0);
      doc().labels = clone(d.labels0);
      if (d.sel0) setSel(d.sel0);
      render(); renderProps();
    } else if (d?.kind === 'band') renderOverlay();
    else if (d?.kind === 'stroke') strokeCancel();
  }
  function onDouble(it) {
    if (it.kind === 'sym') {
      const s = doc().symbols.find(x => x.id === it.id);
      if (s?.type === 'module' && opts.onOpenModule) opts.onOpenModule(s.params.module, { instance: s.name, symbol: clone(s) });
      else if (s?.type === 'hdlblock') setTimeout(() => propBody.querySelector('textarea.code')?.focus(), 0);
      else setTimeout(() => propBody.querySelector('input')?.focus(), 0);
    } else setTimeout(() => propBody.querySelector('input')?.focus(), 0);
  }
  function onWheel(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || (!e.shiftKey && Math.abs(e.deltaX) < 1 && Math.abs(e.deltaY) >= 1 && e.deltaMode !== 0) || (!e.shiftKey && Math.abs(e.deltaX) < 1 && Number.isInteger(e.deltaY) && Math.abs(e.deltaY) >= 50)) {
      zoomAt(Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), e.clientX, e.clientY);
    } else {
      view().tx -= e.shiftKey ? e.deltaY : e.deltaX; view().ty -= e.shiftKey ? 0 : e.deltaY; applyView();
    }
  }
  twoFingerView(svg, { cancel: cancelDrag, pan: (dx, dy) => { view().tx += dx; view().ty += dy; applyView(); }, zoom: zoomAt });
  svg.addEventListener('pointerdown', onDown);
  svg.addEventListener('contextmenu', e => e.preventDefault());
  svg.addEventListener('dblclick', e => {
    if (live()) { e.preventDefault(); return; }
    if (tool() === 'wire') { e.preventDefault(); finishWire(); return; }
    if (tool() === 'select') { const it = itemAt(e.target); if (it) { e.preventDefault(); onDouble(it); } }
  });
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  svg.addEventListener('wheel', onWheel, { passive: false });
  svg.addEventListener('pointerleave', () => { live()?.hideTip(); setHoverPin(null); if (tool() !== 'select') renderOverlay(); });
  // drag & drop from the palette
  canvas.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('text/x-silinx-symbol')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } });
  canvas.addEventListener('drop', e => {
    const raw = e.dataTransfer.getData('text/x-silinx-symbol');
    if (!raw || readOnly || live()) return;
    e.preventDefault();
    const it = JSON.parse(raw);
    const src = { type: it.type, params: { ...defaultParams(it.type), ...(it.params || {}) }, rot: 0, mirror: false };
    if (it.type === 'module' && modules()[it.params.module]) src.params.ports = modules()[it.params.module].ports.map(p => ({ name: p.name, dir: p.dir, width: p.width }));
    const prevTool = tool();
    if (tool() === 'place') setTool('select');
    placeAt(toSheet(e.clientX, e.clientY), src);
    if (prevTool !== 'place') renderProps();
  });

  return { finishMove, onMove, onUp };
}
