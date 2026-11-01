// The state diagram editor's pointer and keys (#405: out of mountFsmEditor in fsm-editor.js): a press on a state
// (select, move, or connect from it with Shift or the transition tool), on a transition (select, bend), on the
// background (pan, or a new state with its tool), the second finger's zoom (#674), the wheel, the double clicks that
// edit a name or a condition, and the editor's keys.
import { pasteFromKey } from './clipboard.js';
import { twoFingerView } from './ui.js';
import { radiusOf, sv } from './fsm-editor.js';

/** The pointer's and the keys' handlers of mountFsmEditor, attached to its drawing (M(), drag(), fitted(), sel(), view(): its current values). */
export function mountFsmPointer(ctx) {
  const {
    M, addState, addTransition, applyView, closeInline, commit, copySel, deleteSelection, drag, editLabel, editState,
    fit, fitted, gOverlay, gStates, geom, paste, print, redo, render, renderSide, root, sel, snapV, stateById, svg,
    toWorld, transById, uid, undo, view, zoomAt, zoomBy, setFitted, setSel, setDrag
  } = ctx;

  // ---------------------------------------------------------------------------- pointer
  const hitState = (w, rim = 0) => {
    for (let i = M().states.length - 1; i >= 0; i--) {
      const s = M().states[i];
      if (Math.hypot(w.x - s.x, w.y - s.y) <= radiusOf(s) + rim) return s;
    }
    return null;
  };
  const capture = (ev) => { try { svg.setPointerCapture(ev.pointerId); } catch { /* not an active pointer */ } };
  function onPointerDown(ev) {
    setFitted(true);
    const sel0 = sel();
    const onItem = ev.target.closest('[data-state],[data-trans]');
    if (ev.button === 1 || (ev.button === 0 && !onItem)) {
      closeInline(true);
      if (sel()) { setSel(null); render(); renderSide(); }
      setDrag({ kind: 'pan', sel0, x: ev.clientX, y: ev.clientY, tx: view().tx, ty: view().ty });
      capture(ev);
      svg.classList.add('panning');
      return;
    }
    if (ev.button !== 0) return;
    root.focus({ preventScroll: true });
    // the state or transition is drawn again below (render): without this, Safari (WebKit) sends
    // the mousedown to the removed element and moves the keyboard focus to the page (Delete did nothing)
    ev.preventDefault();
    const w = toWorld(ev.clientX, ev.clientY);
    const tEl = ev.target.closest('[data-trans]');
    if (tEl) {
      const t = transById(tEl.dataset.trans);
      setSel({ type: 'trans', id: t.id }); render(); renderSide();
      setDrag({ kind: 'bend', sel0, t, start: w, moved: false, bend: t.bend, angle: t.angle });
      capture(ev);
      return;
    }
    const sEl = ev.target.closest('[data-state]');
    if (sEl) {
      const s = stateById(sEl.dataset.state);
      const d = Math.hypot(w.x - s.x, w.y - s.y);
      const r = radiusOf(s);
      setSel({ type: 'state', id: s.id }); render(); renderSide();
      if (d > r - 7) {
        setDrag({ kind: 'connect', sel0, from: s, start: w });
        svg.classList.add('connecting');
      } else setDrag({ kind: 'move', sel0, s, x: s.x, y: s.y, dx: w.x - s.x, dy: w.y - s.y, moved: false });
      capture(ev);
    }
  }
  function onPointerMove(ev) {
    if (!drag()) {
      // the rim of a state shows where a transition can be drawn from
      const w = toWorld(ev.clientX, ev.clientY);
      const s = hitState(w, 6);
      const onRim = s && Math.hypot(w.x - s.x, w.y - s.y) > radiusOf(s) - 7;
      svg.classList.toggle('rim', !!onRim);
      return;
    }
    const w = toWorld(ev.clientX, ev.clientY);
    if (drag().kind === 'pan') {
      view().tx = drag().tx + ev.clientX - drag().x; view().ty = drag().ty + ev.clientY - drag().y; applyView();
    } else if (drag().kind === 'move') {
      drag().s.x = snapV(w.x - drag().dx); drag().s.y = snapV(w.y - drag().dy); drag().moved = true; render();
    } else if (drag().kind === 'bend') {
      const t = drag().t, g = geom(t);
      if (!g) return;
      if (!drag().moved && Math.hypot(w.x - drag().start.x, w.y - drag().start.y) < 4) return;
      drag().moved = true;
      const a = stateById(t.from);
      if (g.self) t.angle = Math.round(Math.atan2(w.y - a.y, w.x - a.x) * 180 / Math.PI / 5) * 5;
      else {
        const b = (w.x - g.mid.x) * g.n.x + (w.y - g.mid.y) * g.n.y;
        t.bend = Math.abs(b) < 8 ? 0 : Math.round(b);
      }
      render();
    } else if (drag().kind === 'connect') {
      gOverlay.textContent = '';
      const target = hitState(w, 8);
      const a = drag().from;
      for (const el of gStates.querySelectorAll('.fsm-state.drop')) el.classList.remove('drop');
      if (target) gStates.querySelector(`[data-state="${CSS.escape(target.id)}"]`)?.classList.add('drop');
      const u = Math.hypot(w.x - a.x, w.y - a.y) || 1;
      const p0 = { x: a.x + (w.x - a.x) / u * radiusOf(a), y: a.y + (w.y - a.y) / u * radiusOf(a) };
      gOverlay.append(sv('path', { class: 'asm-edge-temp', d: `M${p0.x},${p0.y} L${w.x},${w.y}`, 'marker-end': `url(#${uid}-arr-sel)` }));
      drag().target = target;
      drag().end = w;
    }
  }
  function onPointerUp(ev) {
    const d = drag();
    setDrag(null);
    svg.classList.remove('panning', 'connecting');
    gOverlay.textContent = '';
    try { svg.releasePointerCapture(ev.pointerId); } catch { /* not captured */ }
    if (!d) return;
    if (d.kind === 'move' && d.moved) commit('move');
    else if (d.kind === 'bend' && d.moved) commit('bend');
    else if (d.kind === 'connect') {
      for (const el of gStates.querySelectorAll('.fsm-state.drop')) el.classList.remove('drop');
      const moved = d.end && Math.hypot(d.end.x - d.start.x, d.end.y - d.start.y) > 6;
      if (d.target && moved) addTransition(d.from.id, d.target.id);
    }
  }
  // a second finger (#674): what the first one started undone, the selection as it was
  function cancelDrag() {
    const d = drag();
    setDrag(null);
    svg.classList.remove('panning', 'connecting');
    gOverlay.textContent = '';
    if (!d) return;
    for (const el of gStates.querySelectorAll('.fsm-state.drop')) el.classList.remove('drop');
    if (d.kind === 'move') Object.assign(d.s, { x: d.x, y: d.y });
    else if (d.kind === 'bend') Object.assign(d.t, { bend: d.bend, angle: d.angle });
    setSel(d.sel0);
    render(); renderSide();
  }
  function onDblClick(ev) {
    const tEl = ev.target.closest('[data-trans]');
    if (tEl) { editLabel(transById(tEl.dataset.trans)); return; }
    const sEl = ev.target.closest('[data-state]');
    if (sEl) { editState(stateById(sEl.dataset.state)); return; }
    const s = addState(toWorld(ev.clientX, ev.clientY));
    setTimeout(() => editState(s), 0);
  }
  function onWheel(ev) { ev.preventDefault(); zoomAt(ev.deltaY < 0 ? 1.1 : 1 / 1.1, ev.clientX, ev.clientY); }
  function onKeyDown(ev) {
    if (ev.target.closest('input, textarea, select')) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key;
    if (mod && (k === 'z' || k === 'Z')) { if (ev.shiftKey) redo(); else undo(); ev.preventDefault(); return; }
    if (mod && (k === 'y' || k === 'Y')) { redo(); ev.preventDefault(); return; }
    if (mod && (k === 'p' || k === 'P')) { print(); ev.preventDefault(); ev.stopPropagation(); return; }
    if (mod && (k === 'c' || k === 'C')) { copySel(); ev.preventDefault(); return; }
    if (mod && (k === 'x' || k === 'X')) { copySel(true); ev.preventDefault(); return; }
    if (mod && (k === 'v' || k === 'V')) { pasteFromKey('fsm', paste); return; }
    if (mod) return;
    if (k === 'Delete' || k === 'Backspace') { deleteSelection(); ev.preventDefault(); return; }
    if (k === 'F2' && sel()) { if (sel().type === 'state') editState(stateById(sel().id)); else editLabel(transById(sel().id)); ev.preventDefault(); return; }
    if (k === '+' || k === '=') zoomBy(1.2);
    else if (k === '-') zoomBy(1 / 1.2);
    else if (k === '0' || k === 'f') fit();
    else if (k === 'Escape' && sel()) { setSel(null); render(); renderSide(); }
  }
  twoFingerView(svg, { cancel: cancelDrag, pan: (dx, dy) => { view().tx += dx; view().ty += dy; applyView(); }, zoom: zoomAt });
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
  svg.addEventListener('dblclick', onDblClick);
  svg.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('keydown', onKeyDown);
}
