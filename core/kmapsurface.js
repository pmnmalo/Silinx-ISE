// Silinx logic - the Karnaugh map of 3 or 4 variables on a curved surface (#2925, web/js/tt-kmapsurface.js): the flat
// map rolled so that the cells its edges cut apart meet again. An axis of four codes (two variables, Gray order) wraps:
// its first and last cells are neighbours, so it goes round a circle; an axis of two codes does not need to. 3 variables
// (one axis wraps): a cylinder; 4 variables (both wrap): a torus, the one closed surface on which every Karnaugh
// neighbour is a neighbour on the surface (a sphere cannot join both pairs of edges and keep the cells' neighbours).
// A group is then one continuous patch: its rows and columns are a run of each axis, around the circle where it wraps.
// The seam (where the flat map's last and first cells meet: u = 0, v = 0) is in front, on the outer equator of the torus.
// Which axis is which is the layout's (core/logic.js kmapLayout: rowCodes, colCodes, rowVars, colVars). No DOM: the
// points are in px, x right, y down, z towards the viewer.

const TAU = 2 * Math.PI;

/**
 * The surface of a map of 3 or 4 variables: { kind ('cylinder' | 'torus'), rows, cols, wrapRows, wrapCols, radius (the
 * sphere around it), at(u, v) → { p, n } (the point of column position u and row position v, in cells, and the outward
 * normal), cells: [{ r, c, mt, centre: { p, n }, faces }] }; a face is { pts (4 points), n (its normal), uv (its
 * centre), key (its place on the surface: faceKey) }. `cell`: a cell's side (px); `steps`: the faces of a cell along an
 * axis that wraps. faceKey(u, v): the key of the cell's face at u, v (what a group's face or outline lies on: drawn
 * just after it, #2925).
 */
export function kmapSurface(layout, { cell = 64, steps = 4 } = {}) {
  if (layout.n !== 3 && layout.n !== 4) throw new Error('a Karnaugh map on a surface needs 3 or 4 variables');
  const rows = layout.rowCodes.length, cols = layout.colCodes.length;
  const wrapRows = rows === 4, wrapCols = cols === 4;
  const kind = wrapRows && wrapCols ? 'torus' : 'cylinder';
  let at, radius;
  if (kind === 'torus') {
    // the columns round the vertical axis, the rows round the tube; a fat ring, the hole small
    const r = rows * cell / TAU, R = 1.6 * r;
    at = (u, v) => {
      const t = TAU * u / cols, f = TAU * v / rows, d = R + r * Math.cos(f);
      return { p: [d * Math.sin(t), r * Math.sin(f), d * Math.cos(t)], n: [Math.cos(f) * Math.sin(t), Math.sin(f), Math.cos(f) * Math.cos(t)] };
    };
    radius = R + r;
  } else if (wrapCols) {
    // the columns round a vertical axis, the rows along it
    const r = cols * cell / TAU;
    at = (u, v) => { const t = TAU * u / cols; return { p: [r * Math.sin(t), (v - rows / 2) * cell, r * Math.cos(t)], n: [Math.sin(t), 0, Math.cos(t)] }; };
    radius = Math.hypot(r, rows * cell / 2);
  } else {
    // the rows round a horizontal axis, the columns along it
    const r = rows * cell / TAU;
    at = (u, v) => { const t = TAU * v / rows; return { p: [(u - cols / 2) * cell, r * Math.sin(t), r * Math.cos(t)], n: [0, Math.sin(t), Math.cos(t)] }; };
    radius = Math.hypot(r, cols * cell / 2);
  }
  const su = wrapCols ? steps : 1, svs = wrapRows ? steps : 1;
  const mod = (x, m) => ((x % m) + m) % m;
  const faceKey = (u, v) => `${mod(Math.floor(u * su), cols * su)},${Math.min(rows * svs - 1, mod(Math.floor(v * svs), rows * svs))}`;
  const cells = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const faces = mesh(at, c, c + 1, r, r + 1, su, svs, 0);
    for (const f of faces) f.key = faceKey(...f.uv);
    cells.push({ r, c, mt: layout.minterm(0, r, c), centre: at(c + 0.5, r + 0.5), faces });
  }
  return { kind, rows, cols, wrapRows, wrapCols, radius, at, cells, faceKey };
}

// the faces of the part u0..u1 × v0..v1 of the surface, nu × nv of them, raised by `lift` (px) along the normal
function mesh(at, u0, u1, v0, v1, nu, nv, lift) {
  const pt = (u, v) => { const { p, n } = at(u, v); return [p[0] + lift * n[0], p[1] + lift * n[1], p[2] + lift * n[2]]; };
  const faces = [];
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const ua = u0 + (u1 - u0) * i / nu, ub = u0 + (u1 - u0) * (i + 1) / nu, va = v0 + (v1 - v0) * j / nv, vb = v0 + (v1 - v0) * (j + 1) / nv;
    const uv = [(ua + ub) / 2, (va + vb) / 2];
    faces.push({ pts: [pt(ua, va), pt(ub, va), pt(ub, vb), pt(ua, vb)], n: at(...uv).n, uv });
  }
  return faces;
}

// the run of an axis's codes the cube matches: { start, len } (round the end of an axis that wraps: 3, 0 is start 3,
// len 2)
function axisRun(codes, vars, cube, n) {
  const k = vars.length;
  const ok = codes.map(code => vars.every((v, j) => { const b = 1 << (n - 1 - v); return (cube.mask & b) || (((code >> (k - 1 - j)) & 1) === ((cube.value & b) ? 1 : 0)); }));
  const len = ok.filter(Boolean).length;
  if (!len) return null;
  if (len === codes.length) return { start: 0, len };
  // the first matching index after one that does not match
  const start = ok.findIndex((o, i) => o && !ok[(i + codes.length - 1) % codes.length]);
  return { start, len };
}

/**
 * A group's patch on the surface: { cells (its minterms), faces (as the surface's, raised by `lift` px, each with the
 * key of the cell's face under it), edges (its outline: polylines, { pts, keys (the cell's face under each segment), around (the keys of the faces
 * round each segment) }) }. The patch is its rows × its columns, one piece: round a circle where the group goes
 * round it whole (no outline there), inset by `inset` (px) from its cells' sides elsewhere, as the flat map's groups.
 */
export function kmapPatch(surface, layout, cube, { cell = 64, steps = 4, inset = 4, lift = 1.5 } = {}) {
  const { n } = layout;
  const ru = axisRun(layout.colCodes, layout.colVars, cube, n), rv = axisRun(layout.rowCodes, layout.rowVars, cube, n);
  if (!ru || !rv) return { cells: [], faces: [], edges: [] };
  const ins = inset / cell;
  const span = (run, length, wraps) => (wraps && run.len === length ? { a: 0, b: length, closed: true } : { a: run.start + ins, b: run.start + run.len - ins, closed: false });
  const U = span(ru, surface.cols, surface.wrapCols), V = span(rv, surface.rows, surface.wrapRows);
  // (as the cells' faces: `steps` a cell where the axis wraps, one elsewhere, so that each face lies on one cell's face)
  const nu = Math.max(1, Math.round((U.b - U.a) * (surface.wrapCols ? steps : 1))), nv = Math.max(1, Math.round((V.b - V.a) * (surface.wrapRows ? steps : 1)));
  const faces = mesh(surface.at, U.a, U.b, V.a, V.b, nu, nv, lift);
  for (const f of faces) f.key = surface.faceKey(...f.uv);
  const pt = (u, v) => { const { p, n: nn } = surface.at(u, v); return p.map((x, i) => x + (lift + 0.5) * nn[i]); };
  // a line of k segments from `from` to `to` (uv of each point: f), each segment's key the face under its middle, and
  // the keys of the faces round it (#3120: drawn after them all, not cut into dashes by a neighbour nearer the eye)
  const du = 0.5 / (surface.wrapCols ? steps : 1), dv = 0.5 / (surface.wrapRows ? steps : 1);
  const line = (from, to, k, f) => {
    const t = i => from + (to - from) * i / k, mid = i => f((t(i) + t(i + 1)) / 2);
    const round = ([u, v]) => [...new Set([[u, v], [u - du, v], [u + du, v], [u, v - dv], [u, v + dv]].filter(([x, y]) => (surface.wrapCols || (x >= 0 && x <= surface.cols)) && (surface.wrapRows || (y >= 0 && y <= surface.rows))).map(q => surface.faceKey(...q)))];
    return { pts: Array.from({ length: k + 1 }, (_, i) => pt(...f(t(i)))), keys: Array.from({ length: k }, (_, i) => surface.faceKey(...mid(i))), around: Array.from({ length: k }, (_, i) => round(mid(i))) };
  };
  const edges = [];
  if (!U.closed) for (const u of [U.a, U.b]) edges.push(line(V.a, V.b, nv, v => [u, v]));
  if (!V.closed) for (const v of [V.a, V.b]) edges.push(line(U.a, U.b, nu, u => [u, v]));
  const cells = [];
  for (let i = 0; i < rv.len; i++) for (let j = 0; j < ru.len; j++) cells.push(layout.minterm(0, (rv.start + i) % surface.rows, (ru.start + j) % surface.cols));
  return { cells: cells.sort((a, b) => a - b), faces, edges };
}

/** A point turned by the view ({ rx, ry } degrees: about the vertical axis by ry, then about the horizontal one by rx). */
export function turn([x, y, z], { rx, ry }) {
  const a = ry * Math.PI / 180, b = rx * Math.PI / 180;
  const x1 = x * Math.cos(a) + z * Math.sin(a), z1 = -x * Math.sin(a) + z * Math.cos(a);
  return [x1, y * Math.cos(b) - z1 * Math.sin(b), y * Math.sin(b) + z1 * Math.cos(b)];
}

/** A turned point seen with `perspective` (the eye that far in front of the centre): [x, y] about the centre, and its depth. */
export function project([x, y, z], perspective) {
  const s = perspective / (perspective - z);
  return { x: x * s, y: y * s, z };
}

/** Whether a face (its turned points and normal) is seen from its front, the eye at (0, 0, perspective). */
export function facesViewer(pts, normal, perspective) {
  const c = [0, 1, 2].map(i => pts.reduce((s, p) => s + p[i], 0) / pts.length);
  return normal[0] * -c[0] + normal[1] * -c[1] + normal[2] * (perspective - c[2]) > 0;
}

/** The side of the square scene that holds the surface at any rotation (the projection of the sphere around it). */
export function surfaceSceneSide(radius, perspective) {
  return 2 * Math.ceil(perspective * radius / Math.sqrt(perspective * perspective - radius * radius));
}

/**
 * The surface at u, v with its tangents: { p, n, tu, tv } (tu, tv: unit vectors along the columns and the rows, tu × tv
 * the outward normal), for a cell's text on the surface (#3119).
 */
export function surfaceFrame(surface, u, v) {
  const e = 1e-3, { p, n } = surface.at(u, v);
  const unit = (a, b) => { const d = a.map((x, i) => x - b[i]), l = Math.hypot(...d); return d.map(x => x / l); };
  return { p, n, tu: unit(surface.at(u + e, v).p, surface.at(u - e, v).p), tv: unit(surface.at(u, v + e).p, surface.at(u, v - e).p) };
}

/** How squarely a point (turned) with its normal (turned) faces the eye at (0, 0, perspective): the cosine, > 0 in front. */
export function facing(p, n, perspective) {
  const d = [-p[0], -p[1], perspective - p[2]], l = Math.hypot(...d);
  return (n[0] * d[0] + n[1] * d[1] + n[2] * d[2]) / l;
}

/**
 * Where a cell's text may go in the view (#3119): the spots { u, v } of the cell that face the viewer, the best first
 * (none when no part of it does). Its centre first while that faces the viewer well (at least 60° from edge-on); then the
 * others by how squarely they face it (a cell of a torus or a cylinder bends: its centre may be away while its side is in
 * front). The view takes the first that textFits.
 */
export function labelSpots(surface, cell, view, perspective) {
  const score = (u, v) => { const { p, n } = surface.at(u, v); return facing(turn(p, view), turn(n, view), perspective); };
  const us = surface.wrapCols ? [0.2, 0.5, 0.8] : [0.5], vs = surface.wrapRows ? [0.2, 0.5, 0.8] : [0.5];
  const spots = us.flatMap(a => vs.map(b => ({ u: cell.c + a, v: cell.r + b, s: score(cell.c + a, cell.r + b), centre: a === 0.5 && b === 0.5 })));
  return spots.filter(x => x.s > 0).sort((x, y) => ((y.centre && y.s >= 0.5) - (x.centre && x.s >= 0.5)) || y.s - x.s).map(({ u, v }) => ({ u, v }));
}

/** A spot of the screen inside a polygon ([{ x, y }]): its sides all turn the same way round it. */
export function inPolygon({ x, y }, pr) {
  let s = 0;
  for (let i = 0; i < pr.length; i++) { const a = pr[i], b = pr[(i + 1) % pr.length]; s += Math.sign((b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x)); }
  return Math.abs(s) === pr.length;
}

/**
 * Whether a text fits where it is (#3119): each corner of its box ([{ x, y }], on the screen) on a face seen from the
 * front (`front`: [{ pr (its corners on the screen), z (its depth, larger nearer) }]) and under none more than `margin`
 * nearer than the text (`z`, its depth): on the surface, not beside it, nor hidden behind another part of it (the torus's
 * tube in front of its hole).
 */
export function textFits(corners, z, front, margin) {
  return corners.every(q => {
    let on = false;
    for (const f of front) if (inPolygon(q, f.pr)) { if (f.z > z + margin) return false; on = true; }
    return on;
  });
}

/**
 * The text's place on the screen (#3119): the affine map [a, b, c, d, e, f] (as SVG's matrix(), about the scene's
 * centre) of a text at the frame's point on the surface, seen in perspective: upright, at the point's projection, and
 * shrunk as the surface there is foreshortened (the square root of the projected area of a unit square of the surface,
 * none for a face seen edge-on), so that it stays on its cell however the map is turned.
 */
export function textMatrix(frame, view, perspective) {
  const p = turn(frame.p, view), s = perspective / (perspective - p[2]);
  // the projection's derivative along a turned direction t
  const d = t => [s * t[0] + s * s / perspective * t[2] * p[0], s * t[1] + s * s / perspective * t[2] * p[1]];
  const a = d(turn(frame.tu, view)), b = d(turn(frame.tv, view));
  const k = Math.sqrt(Math.max(0, a[0] * b[1] - a[1] * b[0]));
  return [k, 0, 0, k, p[0] * s, p[1] * s];
}

/**
 * The painter's order of what is drawn (#3120): [{ z (depth, larger nearer), back (on a face seen from behind) }] →
 * sorted, everything on a face seen from behind first, then the rest, each farthest first. On a closed surface (the
 * torus) a face seen from behind is always behind one seen from the front; on the open cylinder it is its inside, seen
 * through the open end or behind its outside: in both drawn under the outside, which a sort by depth alone gets wrong
 * along the silhouette (a group's outline on a hidden cell over the surface in front of it).
 */
export function paintOrder(items) {
  return [...items].sort((x, y) => (x.back === y.back ? x.z - y.z : x.back ? -1 : 1));
}
