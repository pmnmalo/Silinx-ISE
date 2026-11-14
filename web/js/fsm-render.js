// The FSM editor's drawing of its diagram (#405: out of mountFsmEditor): a transition's geometry (its arc, a
// self-loop's direction away from the other arrows, its label's place), the states with their codes and the initial
// one, the transitions with their labels, the selection, the problems and, while simulating, the current state and
// transition. mountRender(ctx) is called by mountFsmEditor where this code was. A state's or a transition's outputs: one
// per line (#3882), a transition's under its condition, the block growing away from its arrow.
import { fsmEncoding, outputLines, stepFsm } from '/core/fsm.js';
import { sv, radiusOf, stateTexts, textW } from './fsm-editor.js';

/** { encOf, geom, render } of an FSM editor (state(): its current model, selection, problems, simulation). */
export function mountRender(ctx) {
  const { state, uid, gEdges, gStates, stateById, updateToolbar } = ctx;

  const encOf = () => { const { M } = state(); try { return new Map(fsmEncoding(M).map((e) => [e.id, e])); } catch { return new Map(); } };
  function defaultBend(t) {
    const { M } = state();
    const pair = M.transitions.filter((x) => x.from !== x.to && ((x.from === t.from && x.to === t.to) || (x.from === t.to && x.to === t.from)));
    const rev = pair.some((x) => x.from === t.to);
    const same = pair.filter((x) => x.from === t.from);
    const k = same.indexOf(t);
    return (rev ? 30 : 0) + 45 * k;
  }
  /** Default direction of a self-loop: up, down, right or left, whichever is farthest from the other arrows. */
  function defaultAngle(t) {
    const { M } = state();
    const s = stateById(t.from);
    const loops = M.transitions.filter((x) => x.from === t.from && x.to === t.from);
    const used = loops.slice(0, loops.indexOf(t)).map((x) => x.angle ?? null).filter((x) => x != null);
    const dirs = M.transitions.filter((x) => x.from !== x.to && (x.from === s.id || x.to === s.id)).map((x) => stateById(x.from === s.id ? x.to : x.from)).filter(Boolean)
      .map((n) => Math.atan2(n.y - s.y, n.x - s.x) * 180 / Math.PI);
    if (s.id === M.initial) dirs.push(180);           // the entry arrow
    const diff = (a, b) => { const d = Math.abs(((a - b) % 360 + 540) % 360 - 180); return d; };
    let best = -90, score = -1;
    const k = loops.indexOf(t);
    for (const c of [-90, 90, 0, 180, -45, -135, 45, 135]) {
      const all = [...dirs, ...used, ...loops.slice(0, k).map((x) => (x.angle == null ? null : x.angle)).filter((x) => x != null)];
      const sc = all.length ? Math.min(...all.map((d) => diff(c, d))) : 180;
      if (sc > score + 1e-9) { score = sc; best = c; }
    }
    // several self-loops without a direction of their own: spread them
    return best + 70 * loops.slice(0, k).filter((x) => x.angle == null).length;
  }
  /** Path, label position and the normal of a transition. */
  function geom(t) {
    const a = stateById(t.from), b = stateById(t.to);
    if (!a || !b) return null;
    const ra = radiusOf(a), rb = radiusOf(b);
    if (a === b) {
      const ang = (t.angle ?? defaultAngle(t)) * Math.PI / 180;
      const p = (d, r) => ({ x: a.x + r * Math.cos(ang + d), y: a.y + r * Math.sin(ang + d) });
      const p1 = p(-0.42, ra), p2 = p(0.42, ra), c1 = p(-0.62, ra * 2.7), c2 = p(0.62, ra * 2.7);
      const apex = p(0, ra * 2.35);
      const lab = p(0, ra * 2.35 + 14);
      return { d: `M${p1.x},${p1.y} C${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y}`, apex, lab, anchor: Math.cos(ang) > 0.35 ? 'start' : Math.cos(ang) < -0.35 ? 'end' : 'middle', self: true, out: { x: Math.cos(ang), y: Math.sin(ang) } };
    }
    const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
    const n = { x: -dy / L, y: dx / L };
    const bend = t.bend ?? defaultBend(t);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const C = { x: mid.x + n.x * bend * 2, y: mid.y + n.y * bend * 2 };
    const unit = (p, q) => { const l = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: (q.x - p.x) / l, y: (q.y - p.y) / l }; };
    const u0 = unit(a, C), u2 = unit(b, C);
    const P0 = { x: a.x + u0.x * ra, y: a.y + u0.y * ra }, P2 = { x: b.x + u2.x * (rb + 1), y: b.y + u2.y * (rb + 1) };
    const apex = { x: 0.25 * P0.x + 0.5 * C.x + 0.25 * P2.x, y: 0.25 * P0.y + 0.5 * C.y + 0.25 * P2.y };
    let side = Math.sign(bend);
    if (!side) side = n.y <= 0 ? 1 : -1;
    const lab = { x: apex.x + n.x * side * 13, y: apex.y + n.y * side * 13 };
    const anchor = Math.abs(n.x * side) > 0.5 ? (n.x * side > 0 ? 'start' : 'end') : 'middle';
    return { d: `M${P0.x},${P0.y} Q${C.x},${C.y} ${P2.x},${P2.y}`, apex, lab, anchor, n, mid, out: { x: n.x * side, y: n.y * side } };
  }
  // (a transition's label: its condition, then " /" and its outputs one per line; none: the condition alone)
  const labelLines = (t) => {
    const c = t.cond || '', o = outputLines(t.outputs);
    return o.length ? [`${c || '1'} /`, ...o] : c ? [c] : [];
  };

  // ---------------------------------------------------------------------------- rendering
  function render() {
    const { M, sel, diags, sim, destroyed } = state();
    if (destroyed) return;
    const bad = new Map();
    for (const d of diags) for (const id of [d.state, d.transition].filter(Boolean)) if (d.severity !== 'info' && bad.get(id) !== 'error') bad.set(id, d.severity);
    const enc = M.encoding === 'enum' ? new Map() : encOf();
    gEdges.textContent = ''; gStates.textContent = '';
    const hot = sim ? stepFsm(M, sim.state, sim.inputs).transition : null;
    for (const t of M.transitions) {
      const g = geom(t);
      if (!g) continue;
      const isSel = sel?.type === 'trans' && sel.id === t.id;
      const cls = ['fsm-edge', isSel ? 'sel' : '', bad.get(t.id) ? (bad.get(t.id) === 'error' ? 'err' : 'warn') : '', hot === t.id ? 'hot' : ''].filter(Boolean).join(' ');
      const marker = isSel ? `${uid}-arr-sel` : hot === t.id ? `${uid}-arr-hot` : `${uid}-arr`;
      const grp = sv('g', { class: cls, 'data-trans': t.id });
      grp.append(sv('path', { class: 'fsm-hit', d: g.d }), sv('path', { class: 'fsm-edge-line', d: g.d, 'marker-end': `url(#${marker})` }));
      const lines = labelLines(t);
      if (lines.length || isSel) {
        const shown = lines.length ? lines : ['…'];
        const w = Math.max(14, ...shown.map(textW)) + 8, hgt = 14 * shown.length + 4;
        const x0 = g.anchor === 'start' ? g.lab.x - 4 : g.anchor === 'end' ? g.lab.x - w + 4 : g.lab.x - w / 2;
        // (several lines: beside the arrow, centred on its place; above or below it, growing away from it)
        const y0 = shown.length === 1 || g.anchor !== 'middle' ? g.lab.y - hgt / 2 : g.out.y < 0 ? g.lab.y + 9 - hgt : g.lab.y - 9;
        const text = sv('text', { class: `fsm-label${lines.length ? '' : ' empty'}`, x: g.lab.x, y: y0 + 13, 'text-anchor': g.anchor });
        shown.forEach((l, i) => text.append(sv('tspan', { x: g.lab.x, dy: i ? 14 : 0 }, l)));
        grp.append(sv('rect', { class: 'fsm-label-bg', x: x0, y: y0, width: w, height: hgt, rx: 4 }), text);
      }
      gEdges.append(grp);
    }
    for (const s of M.states) {
      const r = radiusOf(s);
      const isSel = sel?.type === 'state' && sel.id === s.id;
      const cls = ['fsm-state', isSel ? 'sel' : '', s.id === M.initial ? 'initial' : '', bad.get(s.id) ? (bad.get(s.id) === 'error' ? 'err' : 'warn') : '', sim?.state === s.id ? 'current' : ''].filter(Boolean).join(' ');
      const grp = sv('g', { class: cls, 'data-state': s.id, transform: `translate(${s.x},${s.y})` });
      if (s.id === M.initial) {
        grp.append(sv('path', { class: 'fsm-entry', d: `M${-r - 38},0 L${-r - 6},0`, 'marker-end': `url(#${uid}-arr)` }));
      }
      grp.append(sv('circle', { class: 'fsm-rim', r: r + 6 }), sv('circle', { class: 'fsm-circle', r }));
      if (s.id === M.initial) grp.append(sv('circle', { class: 'fsm-circle-in', r: r - 5 }));
      const tx = stateTexts(s);
      grp.append(sv('text', { class: 'fsm-name', x: 0, y: tx.name, 'text-anchor': 'middle' }, s.name || '?'));
      if (tx.outs.length) {
        const half = Math.sqrt(Math.max(0, r * r - tx.divider * tx.divider)) * 0.72;
        grp.append(sv('line', { class: 'fsm-divider', x1: -half, y1: tx.divider, x2: half, y2: tx.divider }));
        for (const o of tx.outs) grp.append(sv('text', { class: 'fsm-outs', x: 0, y: o.y, 'text-anchor': 'middle' }, o.text));
      }
      const e = enc.get(s.id);
      if (e) grp.append(sv('text', { class: 'fsm-code', x: r * 0.72 + 4, y: -r * 0.72 - 2 }, e.bits));
      // (the reset's name on the start-up arrow, #2729)
      if (s.id === M.initial) grp.append(sv('text', { class: 'fsm-reset', x: -r - 22, y: -5, 'text-anchor': 'middle' }, M.reset.name));
      gStates.append(grp);
    }
    updateToolbar();
  }

  return { encOf, geom, render };
}
