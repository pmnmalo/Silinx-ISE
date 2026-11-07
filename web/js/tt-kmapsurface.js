// The Karnaugh map of 3 or 4 variables in 3D (#2925): the map on a cylinder (3 variables: the axis of four codes round
// it) or a torus (4: both axes round), so that a group across the flat map's edges is one continuous patch. Drawn in an
// SVG from the surface's faces (core/kmapsurface.js), turned and seen in perspective, farthest first; the faces seen
// from behind dimmed. Turned by dragging (or the arrow keys); Reset view; a cell clicked as in the flat map, its title
// its minterm. The truth table editor (web/js/truthtable.js) shows it for 3 or 4 inputs when its 3D box is ticked, as
// the 3D map of 5 or 6 (web/js/tt-kmap3d.js). Styles: web/css/truthtable.css (.tt-ks).

import { h } from './ui.js';
import { sv } from './dom.js';
import { kmapSurface, kmapPatch, turn, project, facesViewer, surfaceSceneSide } from '/core/kmapsurface.js';

const CELL = 80;           // a cell's side along the surface (px)
const PERSPECTIVE = 900;
const HOME = { rx: -30, ry: 20 };
let view = { ...HOME };    // (kept between redraws, as the viewer left it)

/** The 3D box of a map of 3 or 4 inputs: `d3` the editor's ({ on }, #3074), `changed` the map drawn again. */
export function surfaceBox(n, d3, changed) {
  const c = h('input', { type: 'checkbox', class: 'tt-k3d-on', checked: d3.on, onchange: () => { d3.on = c.checked; changed(); } });
  const tip = { 3: { title: 'The map rolled into a cylinder: the cells across its edges joined' }, 4: { title: 'The map on a torus: both pairs of its edges joined' } }[n];
  return h('label', { class: 'tt-check', ...tip }, c, ' 3D');
}

/**
 * The map on its surface in `host`: { layout, col (the output's column), terms (the groups), groups ('sop' | 'pos'),
 * colors, onCell(mt), cellText(v, groups) }.
 */
export function mountKmapSurface(host, { layout: L, col, terms, groups, colors, onCell, cellText }) {
  const S = kmapSurface(L, { cell: CELL });
  const side = surfaceSceneSide(S.radius + 4, PERSPECTIVE), mid = side / 2;
  const svg = sv('svg', { class: 'tt-ks-svg', width: side, height: side, viewBox: `0 0 ${side} ${side}` });
  // what is drawn: faces (a cell's, a group's), outlines' segments and the cells' texts, each with its 3D points
  const items = [], under = new Map();   // (the cells' faces by their keys)
  for (const c of S.cells) {
    const v = col[c.mt];
    for (const f of c.faces) {
      const el = sv('polygon', { class: `tt-ks-face v${v}`, 'data-row': c.mt }, sv('title', {}, `m${c.mt}`));
      el.addEventListener('click', () => onCell(c.mt));
      const it = { el, pts: f.pts, n: f.n, kind: 'face' };
      under.set(f.key, it);
      items.push(it);
    }
    const t = sv('g', { class: 'tt-ks-text', 'data-row': c.mt },
      sv('text', { class: 'tt-ks-m', 'text-anchor': 'middle', y: -11 }, c.mt), sv('text', { class: `tt-ks-v v${v}`, 'text-anchor': 'middle', y: 6 }, cellText(v, groups)));
    items.push({ el: t, pts: [c.centre.p.map((x, i) => x + 3 * c.centre.n[i])], n: c.centre.n, kind: 'text', on: under.get(S.faceKey(c.c + 0.5, c.r + 0.5)), dz: 1 });
  }
  terms.forEach((term, ti) => {
    const color = colors[ti % colors.length];
    const p = kmapPatch(S, L, term, { cell: CELL, inset: 3 + (ti % 4) * 3, lift: 1.5 + ti * 0.4 });
    // (each drawn right after the cell's face under it: the groups over their cells whatever the faces' sizes)
    for (const f of p.faces) items.push({ el: sv('polygon', { class: 'tt-ks-group', 'data-term': ti, 'data-cells': p.cells.join(','), fill: color }), pts: f.pts, n: f.n, kind: 'face', on: under.get(f.key), dz: 0.1 + ti * 0.01 });
    for (const line of p.edges) for (let i = 0; i + 1 < line.pts.length; i++) {
      items.push({ el: sv('line', { class: 'tt-ks-edge', 'data-term': ti, stroke: color }), pts: [line.pts[i], line.pts[i + 1]], kind: 'edge', on: under.get(line.keys[i]), dz: 0.5 + ti * 0.01 });
    }
  });
  // turned, projected and drawn farthest first (the painter's order: the faces are small)
  const apply = () => {
    for (const it of items) {
      const tp = it.pts.map(q => turn(q, view)), pr = tp.map(q => project(q, PERSPECTIVE));
      it.z = pr.reduce((a, q) => a + q.z, 0) / pr.length + (it.kind === 'face' ? 0 : 0.5);
      if (it.kind === 'face') {
        it.el.setAttribute('points', pr.map(q => `${(mid + q.x).toFixed(1)},${(mid + q.y).toFixed(1)}`).join(' '));
        it.el.classList.toggle('back', !facesViewer(tp, turn(it.n, view), PERSPECTIVE));
      } else if (it.kind === 'edge') {
        it.el.setAttribute('x1', (mid + pr[0].x).toFixed(1)); it.el.setAttribute('y1', (mid + pr[0].y).toFixed(1));
        it.el.setAttribute('x2', (mid + pr[1].x).toFixed(1)); it.el.setAttribute('y2', (mid + pr[1].y).toFixed(1));
      } else {
        // a cell's text: at its centre, shown from the front only
        const n = turn(it.n, view);
        it.el.setAttribute('transform', `translate(${(mid + pr[0].x).toFixed(1)} ${(mid + pr[0].y).toFixed(1)})`);
        it.el.style.display = facesViewer(tp, n, PERSPECTIVE) && n[2] > 0.25 ? '' : 'none';
      }
    }
    for (const it of items) if (it.on) it.z = it.on.z + it.dz;
    for (const it of [...items].sort((a, b) => a.z - b.z)) svg.append(it.el);
  };
  apply();
  const scene = h('div', { class: `tt-k3d tt-ks tt-ks-${S.kind}`, tabindex: '0', title: 'Drag (or the arrow keys) to turn the map', style: { width: `${side}px`, height: `${side}px` } }, svg);
  // turned by dragging, or by the arrow keys (as the 3D map of 5 or 6 inputs)
  let drag = null, dragged = false;
  scene.addEventListener('pointerdown', e => { dragged = false; drag = { x: e.clientX, y: e.clientY, moved: false, ...view }; });
  scene.addEventListener('pointermove', e => {
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 3) return;
    if (!drag.moved) { drag.moved = true; scene.setPointerCapture?.(e.pointerId); }
    view = { ry: drag.ry + (e.clientX - drag.x) / 2, rx: Math.max(-85, Math.min(85, drag.rx - (e.clientY - drag.y) / 2)) };
    apply();
  });
  // (a drag is not a click on the cell it started on)
  scene.addEventListener('pointerup', () => { dragged = !!drag?.moved; drag = null; });
  scene.addEventListener('click', e => { if (dragged) e.stopPropagation(); dragged = false; }, true);
  scene.addEventListener('keydown', e => {
    const d = { ArrowLeft: [0, -10], ArrowRight: [0, 10], ArrowUp: [10, 0], ArrowDown: [-10, 0] }[e.key];
    if (!d) return;
    e.preventDefault();
    view = { rx: Math.max(-85, Math.min(85, view.rx + d[0])), ry: view.ry + d[1] };
    apply();
  });
  // (Reset view: placed by its caller, beside the 3D box, #1567)
  const reset = h('button', { type: 'button', class: 'btn tt-k3d-reset', onclick: () => { view = { ...HOME }; apply(); } }, 'Reset view');
  host.append(scene);
  return { view: () => ({ ...view }), reset };
}
