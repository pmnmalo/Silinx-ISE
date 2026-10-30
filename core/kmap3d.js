// Silinx logic - the solid of a Karnaugh map group in 3D (#1491, the 3D map of 5 or 6 variables, web/js/tt-kmap3d.js): its exact 2D
// shape on each layer it covers (the pieces of the flat map, wrapping around the edges as there) extruded between the
// neighbouring layers it covers. The first and last of four layers are neighbours too (Gray order), but a group on
// those two only is said by its pieces alone: no solid through the layers between them.

import { kmapRects } from './logic.js';

const SIDES = ['top', 'bottom', 'left', 'right'];

/**
 * A group's solid: { layers: [{ map, pieces }], joins: [{ from, to, pieces }] }; a piece is { r0, r1, c0, c1, open
 * (its sides that continue across the map's edge), walls (its closed sides: the sides of its extrusion), cells (its
 * minterms) }.
 */
export function kmapSolid(layout, cube) {
  const byMap = new Map();
  for (const rc of kmapRects(layout, cube)) {
    const cells = [];
    for (let r = rc.r0; r <= rc.r1; r++) for (let c = rc.c0; c <= rc.c1; c++) cells.push(layout.minterm(rc.map, r, c));
    const piece = { r0: rc.r0, r1: rc.r1, c0: rc.c0, c1: rc.c1, open: rc.open, walls: SIDES.filter(s => !rc.open[s]), cells: cells.sort((a, b) => a - b) };
    if (!byMap.has(rc.map)) byMap.set(rc.map, []);
    byMap.get(rc.map).push(piece);
  }
  const layers = [...byMap].map(([map, pieces]) => ({ map, pieces }));
  // (a group's shape is the same on every layer it covers: its rows and columns do not depend on the map variables)
  const joins = layers.filter(l => byMap.has(l.map + 1)).map(l => ({ from: l.map, to: l.map + 1, pieces: l.pieces }));
  return { layers, joins };
}

/**
 * The side of the square scene that holds a stack of layers (w × h, `depth` from the first to the last, turned about
 * its centre, `depth / 2` behind the screen) at any rotation, seen with `perspective`: the projection of the sphere
 * around the stack, so that turning it never moves what is beside the scene (#2206).
 */
export function kmapSceneSide(w, h, depth, perspective) {
  const r = Math.hypot(w, h, depth) / 2, eye = perspective + depth / 2;
  return 2 * Math.ceil(perspective * r / Math.sqrt(eye * eye - r * r));
}
