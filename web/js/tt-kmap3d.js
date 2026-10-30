// The Karnaugh map of 5 or 6 variables in 3D (#1407): its 4×4 maps stacked in depth, one layer for each value of the
// map variables in Gray order (neighbouring layers differ in one variable), each group drawn on every layer it covers
// and, between neighbouring layers it covers, as the extrusion of its exact shape (#1491): a group across maps seen as
// one solid. Turned by dragging (or the arrow keys); Reset view; a cell clicked as in the flat map. The truth table
// editor (web/js/truthtable.js) shows it for 5 or 6 inputs when its 3D box is ticked. Layout: core/logic.js
// kmapLayout; a group's solid: core/kmap3d.js kmapSolid. Styles: web/css/truthtable.css (.tt-k3d).

import { h } from './ui.js';
import { kmapSolid, kmapSceneSide } from '/core/kmap3d.js';

const C = 40;      // a cell's side (px)
const GAP = 90;    // between layers (px)
const TITLE = 22;  // a layer's title, over it (px)
const PERSPECTIVE = 1100;
let view = { rx: -28, ry: 32 };   // (kept between redraws, as the viewer left it)
let on = false;                   // (the 3D box ticked: every table's map of 5 or 6 inputs in 3D)

/** A cell's value as the map shows it: SOP groups the 1s, its 0s left blank; POS the 0s, its 1s blank (X always, #1494). */
export const cellText = (v, groups) => (v === (groups === 'pos' ? '1' : '0') ? '' : v);
/** Whether the maps are shown in 3D. */
export const k3dOn = () => on;
/** The 3D box of the K-map's options (`changed`: the map drawn again). */
export function k3dBox(changed) {
  const c = h('input', { type: 'checkbox', class: 'tt-k3d-on', checked: on, onchange: () => { on = c.checked; changed(); } });
  return h('label', { class: 'tt-check', title: 'The maps stacked in depth: a group across maps seen as one box' }, c, ' 3D');
}

/**
 * The 3D map in `host`: { layout, col (the output's column), terms (the groups), groups ('sop' | 'pos'), colors, names
 * (the inputs), onCell(mt), title(code) (a layer's label) }.
 */
export function mountKmap3d(host, { layout: L, col, terms, groups, colors, onCell, title }) {
  const rows = L.rowCodes.length, cols = L.colCodes.length, W = cols * C, H = rows * C, depth = (L.maps.length - 1) * GAP;
  const stack = h('div', { class: 'tt-k3d-stack', style: { width: `${W}px`, height: `${H}px` } });
  const apply = () => { stack.style.transform = `translateZ(${-depth / 2}px) rotateX(${view.rx}deg) rotateY(${view.ry}deg) translateZ(${depth / 2}px)`; };
  // the layers: the first in front, each one further back
  L.maps.forEach((m, mi) => {
    const layer = h('div', { class: 'tt-k3d-layer', 'data-map': mi, style: { width: `${W}px`, height: `${H}px`, transform: `translateZ(${-mi * GAP}px)` } },
      h('div', { class: 'tt-k3d-title' }, title(m.code)));
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const mt = L.minterm(mi, i, j), v = col[mt];
      const cell = h('div', { class: `tt-k3d-cell v${v}`, 'data-row': mt, title: `m${mt}`, style: { left: `${j * C}px`, top: `${i * C}px`, width: `${C}px`, height: `${C}px` } },
        h('span', { class: 'tt-k3d-m' }, String(mt)), h('span', { class: 'tt-k3d-v' }, cellText(v, groups)));
      cell.addEventListener('click', () => onCell(mt));
      layer.append(cell);
    }
    stack.append(layer);
  });
  // the groups: the solid of each (core/kmap3d.js): its pieces on every layer it covers, as in the flat map (a piece
  // that wraps around an edge flush with it, open there), and the walls of their closed sides between neighbouring
  // layers it covers (the first and last of four, neighbours too, are said by their pieces alone)
  terms.forEach((t, ti) => {
    const color = colors[ti % colors.length], ins = 3 + (ti % 4) * 3;
    const solid = kmapSolid(L, t);
    // a piece's rectangle on its layer: inset on its closed sides, to the map's edge on its open ones
    const box = p => {
      const x = p.c0 * C + (p.open.left ? 0 : ins), y = p.r0 * C + (p.open.top ? 0 : ins);
      return { x, y, w: (p.c1 + 1) * C - (p.open.right ? 0 : ins) - x, hh: (p.r1 + 1) * C - (p.open.bottom ? 0 : ins) - y };
    };
    const key = p => `${p.r0}-${p.r1},${p.c0}-${p.c1}`;
    for (const { map, pieces } of solid.layers) for (const p of pieces) {
      // (a corner on an open side square: the piece goes on across the edge)
      const { x, y, w, hh } = box(p), o = p.open;
      const radius = [o.top || o.left, o.top || o.right, o.bottom || o.right, o.bottom || o.left].map(sq => (sq ? '0' : '10px')).join(' ');
      stack.append(h('div', { class: 'tt-k3d-group', 'data-term': ti, 'data-map': map, 'data-piece': key(p), 'data-cells': p.cells.join(','),
        style: { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hh}px`, borderColor: color, background: `${color}26`, borderRadius: radius,
          ...Object.fromEntries(Object.keys(p.open).filter(s => p.open[s]).map(s => [`border${s[0].toUpperCase()}${s.slice(1)}Style`, 'none'])),
          transform: `translateZ(${-map * GAP + 1}px)` } }));
    }
    for (const { from, to, pieces } of solid.joins) for (const p of pieces) {
      const { x, y, w, hh } = box(p), z = -from * GAP;
      // the piece's closed sides from this layer to the next one
      const tf = { top: [x, y, w, GAP, 'rotateX(-90deg)'], bottom: [x, y + hh, w, GAP, 'rotateX(-90deg)'], left: [x, y, GAP, hh, 'rotateY(90deg)'], right: [x + w, y, GAP, hh, 'rotateY(90deg)'] };
      for (const s of p.walls) {
        const [left, top, width, height, rot] = tf[s];
        stack.append(h('div', { class: 'tt-k3d-side', 'data-term': ti, 'data-from': from, 'data-to': to, 'data-piece': key(p), 'data-side': s,
          style: { left: `${left}px`, top: `${top}px`, width: `${width}px`, height: `${height}px`, background: `${color}33`, borderColor: color, transform: `translateZ(${z}px) ${rot}` } }));
      }
    }
  });
  apply();
  // (the title counted on both sides of the map: the stack is centred on the map alone)
  const side = kmapSceneSide(W, H + 2 * TITLE, depth, PERSPECTIVE);
  const scene = h('div', { class: 'tt-k3d', tabindex: '0', title: 'Drag (or the arrow keys) to turn the maps', style: { width: `${side}px`, height: `${side}px`, perspective: `${PERSPECTIVE}px` } }, stack);
  // turned by dragging, or by the arrow keys
  let drag = null;
  scene.addEventListener('pointerdown', e => { if (e.target.closest('.tt-k3d-cell')) return; drag = { x: e.clientX, y: e.clientY, ...view }; scene.setPointerCapture?.(e.pointerId); });
  scene.addEventListener('pointermove', e => { if (!drag) return; view = { ry: drag.ry + (e.clientX - drag.x) / 2, rx: Math.max(-85, Math.min(85, drag.rx - (e.clientY - drag.y) / 2)) }; apply(); });
  scene.addEventListener('pointerup', () => { drag = null; });
  scene.addEventListener('keydown', e => {
    const d = { ArrowLeft: [0, -10], ArrowRight: [0, 10], ArrowUp: [10, 0], ArrowDown: [-10, 0] }[e.key];
    if (!d) return;
    e.preventDefault();
    view = { rx: Math.max(-85, Math.min(85, view.rx + d[0])), ry: view.ry + d[1] };
    apply();
  });
  // (Reset view: placed by its caller, beside the 3D box, #1567)
  const reset = h('button', { type: 'button', class: 'btn tt-k3d-reset', onclick: () => { view = { rx: -28, ry: 32 }; apply(); } }, 'Reset view');
  host.append(scene);
  return { view: () => ({ ...view }), reset };
}

/** The K-map in `host`: its flat `svg`, or its maps in 3D (5 or 6 inputs, the 3D box ticked: added to `options`, its
 *  Reset view right after it, #1567). */
export function placeKmap({ host, options, svg, changed, ...map }) {
  if (map.layout.n >= 5) options.append(k3dBox(changed));
  if (map.layout.n >= 5 && on) options.append(mountKmap3d(host, map).reset);
  else host.append(svg);
}
