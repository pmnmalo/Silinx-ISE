// The schematic editor's view (#405: out of mountSchEditor in sch-editor.js): the drawing's transform and the grid,
// screen to sheet, the zoom about a point, the fit to the drawing, a point centred, and the print.
import { h } from './dom.js';
import { portBox, symbolBox } from '/core/schdoc.js';
import { isCurved, sampleCurve } from '/core/schcurve.js';
import { graphicBox } from '/core/schgraphics.js';
import { printDiagram, svgSnapshot } from './print.js';
import { r1 } from './sch-svg.js';
import { snap } from './sch-editor.js';

/** { applyView, centerOn, fit, print, toSheet, zoomAt } of mountSchEditor (doc(), modules(), sel(), view(): its current values). */
export function mountSchView(ctx) {
  const {
    canvas, doc, modules, render, sel, snapshot, svg, updateStatus, view, vp, setSel
  } = ctx;

  // ---------------- view transform
  function applyView() {
    vp.setAttribute('transform', `translate(${r1(view().tx)},${r1(view().ty)}) scale(${view().s})`);
    canvas.classList.toggle('se-lod', view().s < 0.45);
    updateStatus();
  }
  const toSheet = (cx, cy) => { const r = svg.getBoundingClientRect(); return { x: (cx - r.left - view().tx) / view().s, y: (cy - r.top - view().ty) / view().s }; };
  function zoomAt(f, cx, cy) {
    const r = svg.getBoundingClientRect();
    if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const ns = Math.max(0.08, Math.min(6, view().s * f));
    const k = ns / view().s;
    const px = cx - r.left, py = cy - r.top;
    view().tx = px - (px - view().tx) * k; view().ty = py - (py - view().ty) * k; view().s = ns;
    applyView();
  }
  function contentBounds() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const add = b => { x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + (b.w || 0)); y1 = Math.max(y1, b.y + (b.h || 0)); };
    for (const s of doc().symbols) { const b = symbolBox(s, modules()); add({ ...b, y: b.y - 14, h: b.h + 14 }); }
    for (const p of doc().ports) add(portBox(p));
    // (curved, #1144: all of each curve)
    for (const w of doc().wires) for (const p of isCurved(doc()) ? sampleCurve(w, 8) : w.points) add(p);
    for (const l of doc().labels) add({ x: l.x, y: l.y - 12, w: 8 * l.net.length, h: 12 });
    for (const g of doc().graphics || []) add(graphicBox(g));
    if (!Number.isFinite(x0)) return null;
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  /** Print dialog for the whole schematic (selection and editing overlays left out). */
  function print(title = 'Schematic') {
    const b = contentBounds();
    if (!b) return;
    const saved = sel();
    setSel(new Set());
    render();
    let snap;
    try { snap = svgSnapshot(svg, vp, { l: b.x - 30, t: b.y - 30, r: b.x + b.w + 30, b: b.y + b.h + 30 }, ['.se-sheet', '.se-overlay > *', 'defs pattern']); } finally { setSel(saved); render(); }
    printDiagram({ title, snapshot: snap, filename: title.replace(/[^\w.-]+/g, '_') });
  }
  function fit() {
    const r = svg.getBoundingClientRect();
    if (r.width < 20 || r.height < 20) return;
    const b = contentBounds() || { x: 0, y: 0, w: doc().sheet.w, h: doc().sheet.h };
    const pad = 40;
    const s = Math.max(0.08, Math.min(2, (r.width - 2 * pad) / Math.max(1, b.w), (r.height - 2 * pad) / Math.max(1, b.h)));
    view().s = s;
    view().tx = (r.width - b.w * s) / 2 - b.x * s;
    view().ty = (r.height - b.h * s) / 2 - b.y * s;
    applyView();
  }
  function centerOn(x, y) {
    const r = svg.getBoundingClientRect();
    if (view().s < 0.8) view().s = 1;
    view().tx = r.width / 2 - x * view().s; view().ty = r.height / 2 - y * view().s;
    applyView();
  }

  return { applyView, centerOn, fit, print, toSheet, zoomAt };
}
