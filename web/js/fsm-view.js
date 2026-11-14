// The state diagram editor's view (#405: out of mountFsmEditor in fsm-editor.js): the drawing's transform and zoom
// label, screen to drawing and back, the zoom about a point, the diagram's bounds, the fit, the print, and the
// automatic arrangement; the fit again when the documents' room changed (web/js/layout-fit.js, #3804).
import { autoLayout } from '/core/fsm.js';
import { onLayoutToggled } from './layout-fit.js';
import { printDiagram, svgSnapshot } from './print.js';
import { clamp, radiusOf } from './fsm-editor.js';

/** { applyView, arrange, fit, offLayout, print, toScreen, toWorld, zoomAt, zoomBy } of mountFsmEditor (M(), fitted(), sel(), view(): its current values). */
export function mountFsmView(ctx) {
  const {
    M, commit, fitted, gEdges, pattern, render, sel, svg, view, vp, zoomLbl, setFitted, setView, setSel
  } = ctx;

  // ---------------------------------------------------------------------------- view
  function applyView() {
    vp.setAttribute('transform', `translate(${view().tx},${view().ty}) scale(${view().k})`);
    pattern.setAttribute('patternTransform', `translate(${view().tx},${view().ty}) scale(${view().k})`);
    zoomLbl.textContent = `${Math.round(view().k * 100)}%`;
  }
  function toWorld(cx, cy) { const r = svg.getBoundingClientRect(); return { x: (cx - r.left - view().tx) / view().k, y: (cy - r.top - view().ty) / view().k }; }
  function toScreen(x, y) { const r = svg.getBoundingClientRect(); return { x: r.left + view().tx + x * view().k, y: r.top + view().ty + y * view().k }; }
  function zoomAt(f, cx, cy) {
    const r = svg.getBoundingClientRect();
    const px = cx - r.left, py = cy - r.top;
    const k = clamp(view().k * f, 0.2, 4);
    setFitted(true);
    view().tx = px - ((px - view().tx) * k) / view().k; view().ty = py - ((py - view().ty) * k) / view().k; view().k = k;
    applyView();
  }
  function zoomBy(f) { const r = svg.getBoundingClientRect(); zoomAt(f, r.left + r.width / 2, r.top + r.height / 2); }
  function bounds() {
    if (!M().states.length) return null;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const s of M().states) {
      const rr = radiusOf(s) + 26;
      l = Math.min(l, s.x - rr - (s.id === M().initial ? 40 : 0)); r = Math.max(r, s.x + rr); t = Math.min(t, s.y - rr); b = Math.max(b, s.y + rr);
    }
    for (const el of gEdges.querySelectorAll('.fsm-label-bg, .fsm-edge-line')) {
      try { const bb = el.getBBox(); if (bb.width || bb.height) { l = Math.min(l, bb.x - 8); t = Math.min(t, bb.y - 8); r = Math.max(r, bb.x + bb.width + 8); b = Math.max(b, bb.y + bb.height + 8); } } catch { /* not rendered */ }
    }
    return { l, t, r, b };
  }
  function fit() {
    const bb = bounds();
    const r = svg.getBoundingClientRect();
    if (!bb || r.width < 10 || r.height < 10) { setView({ tx: 40, ty: 40, k: 1 }); applyView(); return; }
    const k = clamp(Math.min((r.width - 60) / (bb.r - bb.l), (r.height - 60) / (bb.b - bb.t)), 0.2, 1.5);
    setView({ k, tx: (r.width - (bb.r - bb.l) * k) / 2 - bb.l * k, ty: (r.height - (bb.b - bb.t) * k) / 2 - bb.t * k });
    applyView();
  }
  function print() {
    const bb = bounds();
    if (!bb) return;
    const saved = sel(); setSel(null); render();
    let snap;
    try { snap = svgSnapshot(svg, vp, bb, ['.fsm-bg', '.fsm-overlay > *', 'defs pattern', '.fsm-hit']); } finally { setSel(saved); render(); }
    printDiagram({ title: `State diagram ${M().name}`, snapshot: snap, filename: `${M().name}_fsm` });
  }
  function arrange() {
    const L = autoLayout(M());
    for (const s of M().states) { const p = L.states.find((x) => x.id === s.id); s.x = p.x; s.y = p.y; }
    for (const t of M().transitions) { delete t.bend; delete t.angle; }
    commit();
    requestAnimationFrame(fit);
  }

  // (the documents' room changed: Full View, #3804; offLayout() when the editor is destroyed)
  const offLayout = onLayoutToggled(svg, () => fit());
  return { applyView, arrange, fit, offLayout, print, toScreen, toWorld, zoomAt, zoomBy };
}
