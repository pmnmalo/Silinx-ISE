// The state diagram editor's pointer and keys (#405: out of mountFsmEditor in fsm-editor.js): a press on a state
// (select, move, or connect from it with Shift or the transition tool), on a transition (select, bend), on the
// background (pan, or a new state with its tool), the second finger's zoom (#674), the wheel, the double clicks that
// edit a name or a condition, and the editor's keys. A transition is drawn as a stroke (#3286): its preview is the
// path drawn, and the arc takes its shape (core/fsm-stroke.js: a bend, a self-loop's angle).
import { pasteFromKey } from './clipboard.js';
import { twoFingerView } from './ui.js';
import { radiusOf, sv } from './fsm-editor.js';
import { fitStroke, snapAngle, snapBend } from '/core/fsm-stroke.js';

/** The pointer's and the keys' handlers of mountFsmEditor, attached to its drawing (M(), drag(), fitted(), sel(), view(): its current values). */
export function mountFsmPointer(ctx) {
  const {
    M, addState, addTransition, applyView, closeInline, commit, copySel, deleteSelection, drag, editLabel, editState,
    fit, fitted, gOverlay, gStates, geom, paste, print, redo, render, renderSide, root, sel, snapV, stateById, svg,
    toWorld, transById, uid, undo, view, zoomAt, zoomBy, setFitted, setSel, setDrag, readOnly = false,
    locked = () => readOnly
  } = ctx;
  // (locked: read-only, or while Try it is open, #3793: selected, panned, zoomed; nothing changed)

  // ---------------------------------------------------------------------------- pointer
  const hitState = (w, rim = 0) => {
    for (let i = M().states.length - 1; i >= 0; i--) {
      const s = M().states[i];
      if (Math.hypot(w.x - s.x, w.y - s.y) <= radiusOf(s) + rim) return s;
    }
    return null;
  };
  const capture = (ev) => { try { svg.setPointerCapture(ev.pointerId); } catch { /* not an active pointer */ } };
  // a double click on a state or a transition, seen at its second press and opened when it is released unmoved (#3459):
  // the first press draws the item again (render) and captures the pointer, so the browser's dblclick never reaches it
  let press = null, editedAt = -Infinity;
  const secondPress = (key, ev) => {
    const p = press;
    press = { key, t: ev.timeStamp, x: ev.clientX, y: ev.clientY };
    if (!p || p.key !== key || ev.timeStamp - p.t > 500 || Math.hypot(ev.clientX - p.x, ev.clientY - p.y) > 6) return false;
    press = null;
    return true;
  };
  const editAt = (ev, edit) => { editedAt = ev.timeStamp; edit(); };
  // the transition pressed: a label under the pointer wins over the arcs drawn after it (#3487: a later arc's wide hit
  // stroke crossing an earlier transition's label took the press, and its condition opened)
  const transAt = (ev) => {
    const tEl = ev.target.closest('[data-trans]');
    if (!tEl) return null;
    const lab = svg.ownerDocument.elementsFromPoint(ev.clientX, ev.clientY).find((e) => e.matches('.fsm-label-bg, .fsm-label') && svg.contains(e));
    return lab ? lab.closest('[data-trans]') : tEl;
  };
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
    const tEl = transAt(ev);
    if (tEl) {
      const t = transById(tEl.dataset.trans);
      setSel({ type: 'trans', id: t.id }); render(); renderSide();
      if (locked()) return;   // (read-only, #2696, or in Try it, #3793: selected, not bent)
      setDrag({ kind: 'bend', sel0, t, start: w, moved: false, bend: t.bend, angle: t.angle, dbl: secondPress(`t:${t.id}`, ev) });
      capture(ev);
      return;
    }
    const sEl = ev.target.closest('[data-state]');
    if (sEl) {
      const s = stateById(sEl.dataset.state);
      const d = Math.hypot(w.x - s.x, w.y - s.y);
      const r = radiusOf(s);
      setSel({ type: 'state', id: s.id }); render(); renderSide();
      if (locked()) return;
      // (a pen's or a finger's rim is wider: a stroke started on its edge, #3286)
      const dbl = secondPress(`s:${s.id}`, ev);
      if (d > r - (ev.pointerType === 'mouse' ? 7 : 12)) {
        setDrag({ kind: 'connect', sel0, from: s, start: w, pts: [w], dbl, x: ev.clientX, y: ev.clientY });
        svg.classList.add('connecting');
      } else setDrag({ kind: 'move', sel0, s, x: s.x, y: s.y, dx: w.x - s.x, dy: w.y - s.y, moved: false, dbl });
      capture(ev);
    }
  }
  function onPointerMove(ev) {
    if (!drag()) {
      if (locked()) return;
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
      if (g.self) t.angle = snapAngle(Math.atan2(w.y - a.y, w.x - a.x) * 180 / Math.PI);
      else t.bend = snapBend((w.x - g.mid.x) * g.n.x + (w.y - g.mid.y) * g.n.y);
      render();
    } else if (drag().kind === 'connect') {
      gOverlay.textContent = '';
      const target = hitState(w, 8);
      const a = drag().from;
      for (const el of gStates.querySelectorAll('.fsm-state.drop')) el.classList.remove('drop');
      if (target) gStates.querySelector(`[data-state="${CSS.escape(target.id)}"]`)?.classList.add('drop');
      // the stroke as drawn (a point every 2 px), from where it left the state's circle
      const pts = drag().pts, last = pts[pts.length - 1];
      if (Math.hypot(w.x - last.x, w.y - last.y) >= 2) pts.push(w);
      const out = pts.filter((p) => Math.hypot(p.x - a.x, p.y - a.y) > radiusOf(a));
      if (out.length) {
        const p = out[0], u = Math.hypot(p.x - a.x, p.y - a.y);
        const p0 = { x: a.x + (p.x - a.x) / u * radiusOf(a), y: a.y + (p.y - a.y) / u * radiusOf(a) };
        const d = [p0, ...pts.slice(pts.indexOf(p)), w].map((q, i) => `${i ? 'L' : 'M'}${q.x},${q.y}`).join(' ');
        gOverlay.append(sv('path', { class: 'asm-edge-temp', d, 'marker-end': `url(#${uid}-arr-sel)` }));
      }
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
    else if (d.dbl && d.kind === 'move') editAt(ev, () => editState(d.s));
    else if (d.dbl && d.kind === 'bend') editAt(ev, () => editLabel(d.t));
    else if (d.dbl && d.kind === 'connect' && Math.hypot(ev.clientX - d.x, ev.clientY - d.y) < 4) {
      for (const el of gStates.querySelectorAll('.fsm-state.drop')) el.classList.remove('drop');
      editAt(ev, () => editState(d.from));
    } else if (d.kind === 'connect') {
      for (const el of gStates.querySelectorAll('.fsm-state.drop')) el.classList.remove('drop');
      // the arc in the stroke's shape; a self-loop once the stroke left the state, whatever its size (#3286)
      if (d.target && d.end) {
        const at = (s) => ({ x: s.x, y: s.y, r: radiusOf(s) }), from = at(d.from);
        const shape = fitStroke([...d.pts, d.end], from, d.target.id === d.from.id ? from : at(d.target));
        if (shape) addTransition(d.from.id, d.target.id, shape);
      }
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
    if (locked() || ev.timeStamp - editedAt < 1000) return;   // (opened by the second press, #3459)
    const tEl = transAt(ev);
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
    if (locked() && (mod ? /^[zyxv]$/i.test(k) : /^(Delete|Backspace|F2)$/.test(k))) return;
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
