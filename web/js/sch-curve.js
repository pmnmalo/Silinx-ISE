// The schematic editor's curved wires (#1144, core/schcurve.js): with Curved wires ticked (the schematic's wireStyle),
// every wire drawn as a smooth curve between its ends: its own curve when it has one, else one derived from its
// rectilinear path, hopping where they cross (#1163); the net names and bus names on the curves; a wire's curve found
// under the pointer (the point of its rectilinear path answering it: where a wire ends on it, or a name or a marker is
// put, connects); the selected wire's handles (its knots), dragged to reshape it, a press on the curve itself grabbing
// it there, a double click on a handle removing it (redrawn in place while dragged: the element under the finger
// kept, so that its touch sequence ends where it began); a wire drawn by clicks or by a stroke keeping the points it
// was drawn through.
// mountSchCurve(ctx) is called by mountSchEditor.
import {
  isCurved, curveD, curveHopD, curveCrossings, curveKnots, curveNearest, curvePointAt, curveToPath, pathFraction, sampleCurve, setCurve,
} from '/core/schcurve.js';
import { GRID } from '/core/schdoc.js';
import { esc, h } from './dom.js';
import { clone, onSeg } from './sch-editor.js';

/** { box, curved, setCurved, wireD, hops, hopD, previewD, wireAt, labelAt, wireText, handlesSvg, inBand, beginKnot, moveKnot, endKnot,
 *  cancelKnot, removeKnot } of a schematic editor (doc(), sel(), view(): its current ones). */
export function mountSchCurve(ctx) {
  const { doc, sel, oneWire, view, live, readOnly, edit, render, renderProps, snapshot, pushUndo, changed, contentG } = ctx;
  // (a read-only view, #1193: drawn with curves or not by the viewer's choice, the schematic untouched)
  let viewCurved = null;
  const curved = () => (readOnly && viewCurved !== null ? viewCurved : isCurved(doc()));
  // the toolbar's Curved wires (sch-toolbar.js), kept as the schematic is by updateToolbar
  const box = h('input', { type: 'checkbox', checked: curved() });
  box.addEventListener('change', () => { setCurved(box.checked); box.checked = curved(); });
  // Curved wires ticked or not: an edit of the schematic (saved with it, undone by Undo)
  function setCurved(on) {
    if (on === curved()) return;
    if (readOnly) { viewCurved = on; render(); return; }
    const set = () => { if (on) doc().wireStyle = 'curved'; else delete doc().wireStyle; };
    // (in Try it too, where nothing else is edited: how the wires are drawn, not what they connect, #1175)
    if (live?.() && !readOnly) { const before = snapshot(); set(); pushUndo(before); changed(); render(); return; }
    edit(set);
  }
  // a wire's line as an SVG path (curved), or null (the technical drawing: its polyline)
  const wireD = w => (curved() ? curveD(w) : null);
  // hop-overs on the curves (#1163): wire id -> the lengths along its curve where it hops; its path with them
  function hops() {
    const m = new Map();
    for (const c of curveCrossings(doc())) { let l = m.get(c.wire); if (!l) m.set(c.wire, l = []); l.push(c.s); }
    return m;
  }
  const hopD = (w, s) => curveHopD(w, s);
  // the wire being drawn through the points pts (its ends the first and the last)
  function previewD(pts) {
    if (pts.length < 2) return '';
    const w = { points: [pts[0], pts[pts.length - 1]] };
    return curveD(setCurve(w, pts.slice(1, -1)));
  }
  // the wire whose curve is within tol of pt: { w, at (the point of its rectilinear path answering pt), d }, or null
  function wireAt(pt, tol = 5 / Math.max(0.3, view().s)) {
    let best = null;
    for (const w of doc().wires) {
      const n = curveNearest(w, pt);
      if (n.d <= tol && (!best || n.d < best.d)) best = { w, d: n.d, f: n.f };
    }
    return best && { w: best.w, d: best.d, at: curveToPath(best.w, pt, GRID) };
  }
  // where a net name is drawn: on its wire's curve (at the same fraction of its length), or where it is
  function labelAt(l) {
    if (!curved()) return l;
    const w = doc().wires.find(x => x.points.some((q, i) => i + 1 < x.points.length && onSeg(l, q, x.points[i + 1])));
    if (!w) return l;
    const p = curvePointAt(w, pathFraction(w, l));
    return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
  }
  // where a bus's or a net's name is written along a curved wire: near its start, above the curve (or null when short)
  function wireText(w) {
    const S = sampleCurve(w, 8);
    let len = 0;
    for (let i = 1; i < S.length; i++) len += Math.hypot(S[i].x - S[i - 1].x, S[i].y - S[i - 1].y);
    if (len < 30) return null;
    const p = curvePointAt(w, 0.25);
    return { x: Math.round(p.x) + 4, y: Math.round(p.y) - 5 };
  }
  // the selected wire's handles (one wire or its network selected, the wire clicked; editable): a dot on each of its knots between its ends
  function handlesSvg() {
    if (!curved() || readOnly || !oneWire()) return '';
    const k = [...sel()][0];
    if (!k.startsWith('wire:')) return '';
    const w = doc().wires.find(x => x.id === k.slice(5));
    if (!w) return '';
    return curveKnots(w).slice(1, -1).map((p, i) => handleSvg(w, i, p)).join('');
  }
  function handleSvg(w, i, p) {
    const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    return `<g class="chandle" data-wire="${esc(w.id)}" data-knot="${esc(i)}">`
      + `<circle class="chit" cx="${p.x}" cy="${p.y}" r="${touch ? 14 : 7}"/><circle class="cdot" cx="${p.x}" cy="${p.y}" r="3.5"/></g>`;
  }
  // a wire reshaped while dragged: its curve and its handles moved in place (the one under the finger not replaced:
  // a touch whose element is removed ends elsewhere, and a browser may then lose the next tap's click)
  function redraw(w) {
    const root = contentG?.(), d = curveD(w);
    if (!root) { render(); return; }
    const g = [...root.querySelectorAll('g.wire')].find(e => e.dataset.id === w.id);
    for (const e of g ? g.querySelectorAll('.whit, .wline') : []) e.setAttribute('d', d);
    const K = curveKnots(w).slice(1, -1), hs = [...root.querySelectorAll('.chandle')].filter(e => e.dataset.wire === w.id);
    K.forEach((p, i) => {
      if (!hs[i]) { root.insertAdjacentHTML('beforeend', handleSvg(w, i, p)); return; }
      hs[i].dataset.knot = i;
      for (const c of hs[i].querySelectorAll('circle')) { c.setAttribute('cx', p.x); c.setAttribute('cy', p.y); }
    });
    for (const e of hs.slice(K.length)) e.remove();
  }
  // a wire within the selection band r (all of its curve)
  const inBand = (w, r) => sampleCurve(w, 6).every(p => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);

  // ---------------- reshaping: a handle dragged (knot i), or the curve grabbed at pt (a knot added there once it moves)
  function beginKnot(id, i, pt) {
    const w = doc().wires.find(x => x.id === id);
    if (!w || readOnly) return null;
    return { kind: 'knot', id, i, grab: i == null ? { x: pt.x, y: pt.y } : null, start: { x: pt.x, y: pt.y }, before: snapshot(), curve0: clone(w.curve ?? null), moved: false };
  }
  function moveKnot(d, pt) {
    const w = doc().wires.find(x => x.id === d.id);
    if (!w) return;
    if (!d.moved && Math.hypot(pt.x - d.start.x, pt.y - d.start.y) < 2 / Math.max(0.3, view().s)) return;
    const K = curveKnots(w).slice(1, -1);
    if (d.i == null) {
      // (the knot inserted where the curve was grabbed: between the knots before and after it along the curve)
      const S = sampleCurve(w), f = nearestF(S, d.grab), fk = K.map(p => nearestF(S, p));
      d.i = fk.filter(x => x < f).length;
      K.splice(d.i, 0, { ...d.grab });
    }
    d.moved = true;
    K[d.i] = { x: Math.round(pt.x * 2) / 2, y: Math.round(pt.y * 2) / 2 };
    setCurve(w, K);
    redraw(w);
  }
  function endKnot(d) {
    if (!d.moved) return;
    pushUndo(d.before); changed();
    // (drawn anew once the touch has ended: its touchend comes after this pointerup, to the element under the finger)
    setTimeout(() => { render(); renderProps(); }, 0);
  }
  // a second finger (#674): the curve as it was
  function cancelKnot(d) {
    const w = doc().wires.find(x => x.id === d.id);
    if (w) { if (d.curve0) w.curve = clone(d.curve0); else delete w.curve; }
    render();
  }
  function removeKnot(id, i) {
    edit(() => {
      const w = doc().wires.find(x => x.id === id);
      if (!w) return;
      const K = curveKnots(w).slice(1, -1);
      K.splice(i, 1);
      setCurve(w, K);
    }, { keepProps: true });
  }
  const nearestF = (S, p) => { let bi = 0, bd = Infinity; S.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; bi = i; } }); return bi / (S.length - 1); };

  return { box, curved, setCurved, wireD, hops, hopD, previewD, wireAt, labelAt, wireText, handlesSvg, inBand, beginKnot, moveKnot, endKnot, cancelKnot, removeKnot };
}
