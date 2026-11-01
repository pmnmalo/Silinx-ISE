// The ASM chart editor's pointer and keys (#405: out of mountAsmEditor in asm-editor.js): a press on a box (select,
// add to the selection, move the selection, snapped), on a port (an arrow drawn to a box), on an arrow (select, its
// route), on the background (pan with Space or the middle button, a rubber band), the second finger's zoom (#674),
// the wheel, the double clicks, the context menu, and the editor's keys.
import { pasteFromKey } from './clipboard.js';
import { twoFingerView } from './ui.js';
import { GRID, pathD, portGeom, routeEdge } from './asm-editor.js';

/** { ro, tryInitialFit } of mountAsmEditor (M(), drag(), fitted(), sel(), spaceDown(), view(): its current values). */
export function mountAsmPointer(ctx) {
  const {
    M, addNode, applyView, commit, connect, copySel, deleteSelection, drag, drawTarget, fit, fitted, flash, gOverlay,
    nextCaseLabel, nodeById, paste, print, redo, render, renderInspector, root, rubber, sel, selSection, snapV,
    spaceDown, svg, toWorld, uid, undo, updateToolbar, view, zoomAt, zoomBy, readOnly, setDrag, setSel, setFitted, setSpaceDown
  } = ctx;

  // ---------------------------------------------------------------------------- pointer interaction
  function onPointerDown(ev) {
    if (ev.button !== 0 && ev.button !== 1) return;
    setFitted(true);
    root.focus({ preventScroll: true });
    const t = ev.target;
    const nodeEl = t.closest?.('[data-node]');
    const portEl = t.closest?.('[data-port]');
    const edgeEl = t.closest?.('[data-edge]');
    // a block or arrow is drawn again below (render): without this, Safari (WebKit) sends the
    // mousedown to the removed element and moves the keyboard focus to the page (Delete did nothing)
    if (nodeEl || edgeEl) ev.preventDefault();
    const start ={ cx: ev.clientX, cy: ev.clientY, w: toWorld(ev.clientX, ev.clientY) };
    try { svg.setPointerCapture(ev.pointerId); } catch { /* not an active pointer */ }
    const sel0 = sel();
    if (ev.button === 1 || spaceDown()) {
      setDrag({ mode: 'pan', start, tx: view().tx, ty: view().ty });
    } else if (portEl && nodeEl && !readOnly) {
      setDrag({ mode: 'connect', start, from: nodeEl.dataset.node, port: portEl.dataset.port });
      svg.classList.add('connecting');
    } else if (nodeEl) {
      const id = nodeEl.dataset.node;
      if (ev.shiftKey || ev.metaKey || ev.ctrlKey) {
        if (sel().nodes.has(id)) sel().nodes.delete(id); else sel().nodes.add(id);
        sel().edge = null;
        render(); renderInspector(); updateToolbar();
        setDrag(null);
        return;
      }
      if (!sel().nodes.has(id)) { setSel({ nodes: new Set([id]), edge: null }); render(); renderInspector(); updateToolbar(); }
      if (readOnly) { setDrag(null); return; }   // (selected, not moved)
      setDrag({ mode: 'move', start, sel0, orig: new Map([...sel().nodes].map((nid) => { const n = nodeById(nid); return [nid, { x: n.x, y: n.y }]; })), moved: false });
    } else if (edgeEl) {
      setSel({ nodes: new Set(), edge: edgeEl.dataset.edge });
      render(); renderInspector(); updateToolbar();
      setDrag(null);
    } else if (ev.shiftKey) {
      setDrag({ mode: 'rubber', start });
    } else {
      setDrag({ mode: 'pan', start, tx: view().tx, ty: view().ty, click: true });
    }
    if (drag()?.mode === 'pan') svg.classList.add('panning');
  }

  function onPointerMove(ev) {
    if (!drag()) return;
    const dxs = ev.clientX - drag().start.cx, dys = ev.clientY - drag().start.cy;
    const far = Math.hypot(dxs, dys) > 3;
    if (drag().mode === 'pan') {
      view().tx = drag().tx + dxs; view().ty = drag().ty + dys; applyView();
      if (far) drag().click = false;
    } else if (drag().mode === 'move') {
      if (!far && !drag().moved) return;
      drag().moved = true;
      const w = toWorld(ev.clientX, ev.clientY);
      for (const [id, o] of drag().orig) {
        const n = nodeById(id);
        n.x = snapV(o.x + w.x - drag().start.w.x);
        n.y = snapV(o.y + w.y - drag().start.w.y);
      }
      render();
    } else if (drag().mode === 'connect') {
      const a = nodeById(drag().from);
      const cur = a.type === 'case' ? M().edges.find((e) => e.from === a.id && e.port === drag().port) : null;
      const p = portGeom(a, drag().port, cur ? drawTarget(cur) : null);
      const w = toWorld(ev.clientX, ev.clientY);
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-node]');
      svg.querySelectorAll('.drop').forEach((el) => el.classList.remove('drop'));
      let target = null;
      if (over && validTarget(drag().from, over.dataset.node)) { over.classList.add('drop'); target = nodeById(over.dataset.node); }
      const pts = target ? routeEdge(a, drag().port, target, 0) : [p, { x: p.x + p.dx * 12, y: p.y + p.dy * 12 }, w];
      gOverlay.innerHTML = `<path class="asm-edge-temp" d="${pathD(pts)}" marker-end="url(#${uid}-arr-sel)"/>`;
    } else if (drag().mode === 'rubber') {
      const r = svg.getBoundingClientRect();
      const x = Math.min(ev.clientX, drag().start.cx) - r.left, y = Math.min(ev.clientY, drag().start.cy) - r.top;
      rubber.setAttribute('x', x); rubber.setAttribute('y', y);
      rubber.setAttribute('width', Math.abs(dxs)); rubber.setAttribute('height', Math.abs(dys));
      rubber.setAttribute('visibility', 'visible');
    }
  }

  // a second finger (#674): what the first one started undone, the selection as it was
  function cancelDrag() {
    const d = drag();
    setDrag(null);
    svg.classList.remove('panning', 'connecting');
    if (d?.mode === 'move') {
      for (const [id, o] of d.orig) Object.assign(nodeById(id), o);
      setSel(d.sel0);
      render(); renderInspector(); updateToolbar();
    } else if (d?.mode === 'connect') {
      gOverlay.innerHTML = '';
      svg.querySelectorAll('.drop').forEach((el) => el.classList.remove('drop'));
    } else if (d?.mode === 'rubber') rubber.setAttribute('visibility', 'hidden');
  }

  function validTarget(from, to) {
    const a = nodeById(from), b = nodeById(to);
    if (!a || !b) return false;
    if (b.type === 'always') return false; // an every-cycle block has no entry
    if (from === to) return a.type === 'state';
    return true;
  }

  function onPointerUp(ev) {
    if (!drag()) return;
    const d = drag();
    setDrag(null);
    svg.classList.remove('panning', 'connecting');
    try { svg.releasePointerCapture(ev.pointerId); } catch { /* ignore */ }
    if (d.mode === 'move' && d.moved) commit('move');
    else if (d.mode === 'connect') {
      gOverlay.innerHTML = '';
      svg.querySelectorAll('.drop').forEach((el) => el.classList.remove('drop'));
      const over = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('[data-node]');
      if (over && validTarget(d.from, over.dataset.node)) {
        const a = nodeById(d.from);
        const same = a.type === 'case' && d.port === '+' ? M().edges.find((x) => x.from === a.id && x.to === over.dataset.node && x.port !== 'others') : null;
        const label = a.type === 'case' && d.port === '+' ? nextCaseLabel(a) : d.port;
        if (label == null) flash('Every value of the case box already has an exit (edit the labels to change them)');
        else {
          let e;
          if (same && label !== 'others') { same.port = `${same.port}|${label}`; e = same; }   // one more value for the same exit
          else e = connect(d.from, label, over.dataset.node);
          setSel({ nodes: new Set(), edge: e.id });
          commit('connect'); renderInspector();
        }
      } else if (!over && Math.hypot(ev.clientX - d.start.cx, ev.clientY - d.start.cy) > 30) {
        flash('Drop the connection on a box (a state, decision or conditional output)');
      }
    } else if (d.mode === 'rubber') {
      rubber.setAttribute('visibility', 'hidden');
      const a = d.start.w, b = toWorld(ev.clientX, ev.clientY);
      const l = Math.min(a.x, b.x), r = Math.max(a.x, b.x), t = Math.min(a.y, b.y), bt = Math.max(a.y, b.y);
      for (const n of M().nodes) if (n.x >= l && n.x <= r && n.y >= t && n.y <= bt) sel().nodes.add(n.id);
      sel().edge = null;
      render(); renderInspector(); updateToolbar();
    } else if (d.mode === 'pan' && d.click) {
      if (sel().nodes.size || sel().edge) { setSel({ nodes: new Set(), edge: null }); render(); renderInspector(); updateToolbar(); }
    }
  }

  function onDblClick(ev) {
    const nodeEl = ev.target.closest?.('[data-node]');
    if (nodeEl) {
      const f = selSection.querySelector('[data-focus]');
      f?.focus(); f?.select?.();
      return;
    }
    if (ev.target.closest?.('[data-edge]')) return;
    setSel({ nodes: new Set(), edge: null });
    const n = addNode('state', toWorld(ev.clientX, ev.clientY));
    focusInspectorSoon(n);
  }
  function focusInspectorSoon() {
    setTimeout(() => { const f = selSection.querySelector('[data-focus]'); f?.focus(); f?.select?.(); }, 0);
  }

  function onWheel(ev) {
    ev.preventDefault();
    const f = Math.exp(-ev.deltaY * (ev.deltaMode === 1 ? 0.05 : 0.0015));
    zoomAt(f, ev.clientX, ev.clientY);
  }

  const isEditable = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  function onKeyDown(ev) {
    if (isEditable(ev.target)) return;
    const mod = ev.ctrlKey || ev.metaKey;
    const k = ev.key;
    if (k === ' ') { setSpaceDown(true); svg.classList.add('space'); ev.preventDefault(); return; }
    if (k === 'Delete' || k === 'Backspace') { deleteSelection(); ev.preventDefault(); return; }
    if (mod && (k === 'z' || k === 'Z')) { if (ev.shiftKey) redo(); else undo(); ev.preventDefault(); return; }
    if (mod && (k === 'y' || k === 'Y')) { redo(); ev.preventDefault(); return; }
    if (mod && (k === 'p' || k === 'P')) { print(); ev.preventDefault(); return; }
    if (mod && (k === 'c' || k === 'C')) { copySel(); ev.preventDefault(); return; }
    if (mod && (k === 'x' || k === 'X')) { copySel(true); ev.preventDefault(); return; }
    if (mod && (k === 'v' || k === 'V')) { pasteFromKey('asm', paste); return; }
    if (mod && (k === 'a' || k === 'A')) { setSel({ nodes: new Set(M().nodes.map((n) => n.id)), edge: null }); render(); renderInspector(); updateToolbar(); ev.preventDefault(); return; }
    if (k === 'Escape') {
      if (drag()?.mode === 'connect') { setDrag(null); gOverlay.innerHTML = ''; svg.classList.remove('connecting'); }
      setSel({ nodes: new Set(), edge: null }); render(); renderInspector(); updateToolbar(); return;
    }
    if (!mod && (k === '+' || k === '=')) { zoomBy(1.2); return; }
    if (!mod && k === '-') { zoomBy(1 / 1.2); return; }
    if (!mod && (k === '0' || k === 'f')) { fit(); return; }
    const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (arrows[k] && sel().nodes.size) {
      const step = ev.shiftKey ? 1 : GRID;
      for (const id of sel().nodes) { const n = nodeById(id); n.x += arrows[k][0] * step; n.y += arrows[k][1] * step; }
      commit('nudge'); ev.preventDefault();
    }
  }
  function onKeyUp(ev) {
    if (ev.key === ' ') { setSpaceDown(false); svg.classList.remove('space'); }
  }

  twoFingerView(svg, { cancel: cancelDrag, pan: (dx, dy) => { setFitted(true); view().tx += dx; view().ty += dy; applyView(); }, zoom: zoomAt });
  svg.addEventListener('pointerdown', onPointerDown);
  svg.addEventListener('pointermove', onPointerMove);
  svg.addEventListener('pointerup', onPointerUp);
  svg.addEventListener('pointercancel', onPointerUp);
  svg.addEventListener('dblclick', onDblClick);
  svg.addEventListener('wheel', onWheel, { passive: false });
  root.addEventListener('keydown', onKeyDown);
  root.addEventListener('keyup', onKeyUp);
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { if (!fitted()) { setFitted(tryInitialFit()); } }) : null;
  function tryInitialFit() {
    const r = svg.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return false;
    fit();
    return true;
  }
  ro?.observe(svg);

  return { ro, tryInitialFit };
}
