// The Petri net editor's drawing (#405: out of mountPetriEditor in petri-editor.js): the net drawn on its SVG (the arcs
// with their weights and inhibitor heads, the places with their tokens, capacities and outputs, the transitions with
// their guards and pulses, the arc being drawn, the simulation's enabled and fired transitions), the view's transform
// and the panels and toolbar it refreshes.
import { PLACE_R, TRANS_H, TRANS_W, enabledTransitions, initialMarking } from '/core/petri.js';
import { formatOutputs } from '/core/fsm.js';
import { sv } from './petri-editor.js';

/** { applyView, render, toWorld } of mountPetriEditor (M(), arcFrom(), destroyed(), drag(), hi(), sel(), sim(), view(): its current values). */
export function mountPetriDraw(ctx) {
  const {
    M, arcFrom, delBtn, destroyed, drag, envOf, hi, hist, nodeOf, placeOf, redoBtn, refreshLink, renderPanel,
    renderSide, sel, sim, statusInfo, svg, uid, undoBtn, view, world
  } = ctx;

  // ---------------------------------------------------------------- drawing
  const toWorld = (cx, cy) => { const r = svg.getBoundingClientRect(); return { x: (cx - r.left - view().tx) / view().k, y: (cy - r.top - view().ty) / view().k }; };
  const applyView = () => world.setAttribute('transform', `translate(${view().tx},${view().ty}) scale(${view().k})`);
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
    if (destroyed()) return;
    applyView();
    world.replaceChildren();
    const marking = sim() ? sim().marking : initialMarking(M());
    const enabled = new Set(sim() ? enabledTransitions(M(), marking, null) : []);
    const ready = new Set(sim() ? enabledTransitions(M(), marking, envOf()) : []);
    const fired = new Set(sim() ? sim().fired : []);
    // arcs (under the nodes)
    for (const a of M().arcs) {
      const A = nodeOf(a.from), B = nodeOf(a.to);
      if (!A || !B) continue;
      const p1 = rim(A, B), p2 = rim(B, A);
      const isSel = sel()?.kind === 'arc' && sel().id === a.id;
      const g = sv('g', { class: `pn-arc${isSel ? ' sel' : ''}${a.inhibitor ? ' inhibitor' : ''}`, 'data-kind': 'arc', 'data-id': a.id });
      const end = a.inhibitor ? { x: p2.x - (p2.x - p1.x) / Math.hypot(p2.x - p1.x, p2.y - p1.y) * 5, y: p2.y - (p2.y - p1.y) / Math.hypot(p2.x - p1.x, p2.y - p1.y) * 5 } : p2;
      g.append(sv('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, class: 'pn-arc-hit' }), sv('line', { x1: p1.x, y1: p1.y, x2: end.x, y2: end.y, class: 'pn-arc-line', 'marker-end': a.inhibitor ? null : `url(#${uid}-arr)` }));
      if (a.inhibitor) g.append(sv('circle', { cx: end.x, cy: end.y, r: 5, class: 'pn-inhib' }));
      if (a.weight > 1) g.append(sv('text', { x: (p1.x + p2.x) / 2 + 6, y: (p1.y + p2.y) / 2 - 6, class: 'pn-weight' }, String(a.weight)));
      world.append(g);
    }
    if (arcFrom() && drag()?.kind === 'arcdraw') {
      const A = nodeOf(arcFrom());
      if (A) world.append(sv('line', { x1: A.x, y1: A.y, x2: drag().x, y2: drag().y, class: 'pn-arc-line pn-ghost' }));
    }
    for (const p of M().places) {
      const isSel = sel()?.kind === 'place' && sel().id === p.id;
      const g = sv('g', { class: `pn-place${isSel ? ' sel' : ''}${arcFrom() === p.id ? ' from' : ''}`, 'data-kind': 'place', 'data-id': p.id });
      g.append(sv('circle', { cx: p.x, cy: p.y, r: PLACE_R, class: 'pn-circle' }), tokensSvg(p, marking[p.id] || 0),
        sv('text', { x: p.x, y: p.y + PLACE_R + 14, 'text-anchor': 'middle', class: 'pn-name' }, p.name));
      if (p.capacity > 1) g.append(sv('text', { x: p.x + PLACE_R - 2, y: p.y - PLACE_R + 2, class: 'pn-cap' }, `k=${p.capacity}`));
      const outs = formatOutputs(p.outputs);
      if (outs) g.append(sv('text', { x: p.x, y: p.y + PLACE_R + 27, 'text-anchor': 'middle', class: 'pn-outs' }, outs));
      world.append(g);
    }
    for (const t of M().transitions) {
      const isSel = sel()?.kind === 'transition' && sel().id === t.id;
      const cls = sim() ? (ready.has(t.id) ? ' ready' : enabled.has(t.id) ? ' enabled' : '') + (fired.has(t.id) ? ' fired' : '') : '';
      const g = sv('g', { class: `pn-trans${isSel ? ' sel' : ''}${cls}${arcFrom() === t.id ? ' from' : ''}`, 'data-kind': 'transition', 'data-id': t.id });
      g.append(sv('rect', { x: t.x - TRANS_W / 2, y: t.y - TRANS_H / 2, width: TRANS_W, height: TRANS_H, class: 'pn-bar' }),
        sv('text', { x: t.x + TRANS_W / 2 + 5, y: t.y - 6, class: 'pn-name' }, t.name));
      const lbl = [t.guard ? `[${t.guard}]` : '', formatOutputs(t.outputs) ? `/ ${formatOutputs(t.outputs)}` : ''].filter(Boolean).join(' ');
      if (lbl) g.append(sv('text', { x: t.x + TRANS_W / 2 + 5, y: t.y + 10, class: 'pn-guard' }, lbl));
      world.append(g);
    }
    renderSide();
    renderPanel();
    undoBtn.disabled = hi() <= 0; redoBtn.disabled = hi() >= hist.length - 1; delBtn.disabled = !sel();
    statusInfo.textContent = `${M().places.length} places · ${M().transitions.length} transitions · ${M().arcs.length} arcs`;
    refreshLink();
  }

  return { applyView, render, toWorld };
}
