// Curved wires (#1144): a schematic's wires drawn as smooth curves instead of the technical drawing's square corners.
//
// A wire always keeps its rectilinear path (`points`, on the grid): its connections (at its ends, #678), its net, Check
// Schematic, the generated VHDL / Verilog and ISE's .sch are the same whichever way it is drawn. A curve is only a
// drawing of the wire between its two ends:
//   doc.wireStyle: 'curved'          the schematic drawn with curves (absent: the technical drawing, rectilinear)
//   wire.curve: [{ u, v }, ...]      the user's own curve: the points it passes through between the wire's ends, each
//                                    relative to them (u: the fraction along the line from the first end to the last,
//                                    v: the distance, sheet pixels, to the side of it), so that the curve follows its
//                                    ends when a symbol moves, a selection is pasted or a wire is rerouted; [] a
//                                    straight line. Without one, the curve is derived from the rectilinear path (its
//                                    bends rounded, the wire leaving its ends along its first and last segments).
// The curve is a Catmull-Rom spline through its knots (the ends and the points between), drawn as cubic Béziers.
// Plain functions of the document, no editor state (web/js/sch-curve.js draws and edits them).

const r1 = v => Math.round(v * 10) / 10;
const r4 = v => Math.round(v * 10000) / 10000;
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
/** The most knots a wire's own curve keeps. */
export const MAX_KNOTS = 64;

/** Whether the schematic is drawn with curves. */
export const isCurved = doc => doc?.wireStyle === 'curved';

// the frame of a wire's ends: its origin, its axis (to the last end) and its normal (unit, to the axis's left)
function frame(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  return L < 1e-9 ? null : { a, dx, dy, nx: -dy / L, ny: dx / L };
}
/** A point of the sheet relative to the ends a, b ({ u, v }), and back (toAbs). */
export function toRel(p, a, b) {
  const f = frame(a, b);
  if (!f) return { u: r4(p.x - a.x), v: r1(p.y - a.y) };
  const L2 = f.dx * f.dx + f.dy * f.dy, px = p.x - a.x, py = p.y - a.y;
  return { u: r4((px * f.dx + py * f.dy) / L2), v: r1(px * f.nx + py * f.ny) };
}
export function toAbs(q, a, b) {
  const f = frame(a, b);
  if (!f) return { x: a.x + q.u, y: a.y + q.v };
  return { x: r1(a.x + q.u * f.dx + q.v * f.nx), y: r1(a.y + q.u * f.dy + q.v * f.ny) };
}

const ends = w => [w.points[0], w.points[w.points.length - 1]];
/** The wire's own curve as points of the sheet (between its ends), or null when it has none. */
export function curveAbs(w) {
  if (!Array.isArray(w.curve)) return null;
  const [a, b] = ends(w);
  return w.curve.map(q => toAbs(q, a, b));
}
/** Sets the wire's own curve to pass through the sheet points `pts` (between its ends); null drops it. */
export function setCurve(w, pts) {
  if (!pts) { delete w.curve; return w; }
  const [a, b] = ends(w);
  w.curve = pts.slice(0, MAX_KNOTS).map(p => toRel(p, a, b));
  return w;
}
/** A wire's curve as read from a file: its knots kept when they are numbers, else none (null). */
export function normalizeCurve(c) {
  if (!Array.isArray(c)) return null;
  const out = c.filter(q => q && isNum(+q.u) && isNum(+q.v)).slice(0, MAX_KNOTS).map(q => ({ u: r4(+q.u), v: r1(+q.v) }));
  return out.length || !c.length ? out : null;
}

// the knots derived from a rectilinear path: the middle of each bend's rounding (the quadratic Bézier from the
// previous segment's middle, through the bend's corner, to the next one's; the first and last from the ends)
export function derivedKnots(P) {
  const n = P.length, out = [];
  for (let k = 1; k < n - 1; k++) {
    const s = k === 1 ? P[0] : lerp(P[k - 1], P[k], 0.5), e = k === n - 2 ? P[n - 1] : lerp(P[k], P[k + 1], 0.5);
    out.push({ x: r1(0.25 * s.x + 0.5 * P[k].x + 0.25 * e.x), y: r1(0.25 * s.y + 0.5 * P[k].y + 0.25 * e.y) });
  }
  return out;
}
/** The knots the wire's curve passes through: its ends and its own curve's points, or those derived from its path. */
export function curveKnots(w) {
  const [a, b] = ends(w);
  return [a, ...(curveAbs(w) || derivedKnots(w.points)), b];
}
/** The wire's curve as cubic Béziers [[p0, c1, c2, p3], ...]. */
export function curveBeziers(w) {
  const Q = curveKnots(w), m = Q.length - 1, own = Array.isArray(w.curve);
  if (m === 1) return [[Q[0], lerp(Q[0], Q[1], 1 / 3), lerp(Q[0], Q[1], 2 / 3), Q[1]]];
  // the tangents: Catmull-Rom's inside; at the ends towards the next knot, or (a derived curve) along the path's
  // first and last segments, so that the wire leaves a pin straight as in the technical drawing
  const T = Q.map((q, i) => i > 0 && i < m ? { x: (Q[i + 1].x - Q[i - 1].x) / 2, y: (Q[i + 1].y - Q[i - 1].y) / 2 } : null);
  const endT = (q, nb, s0, s1) => {
    const len = Math.hypot(nb.x - q.x, nb.y - q.y);
    if (own) return { x: nb.x - q.x, y: nb.y - q.y };
    const dx = s1.x - s0.x, dy = s1.y - s0.y, L = Math.hypot(dx, dy) || 1;
    return { x: dx / L * len, y: dy / L * len };
  };
  const P = w.points;
  T[0] = endT(Q[0], Q[1], P[0], P[1]);
  const te = endT(Q[m], Q[m - 1], P[P.length - 1], P[P.length - 2]);
  T[m] = { x: -te.x, y: -te.y };
  const out = [];
  for (let i = 0; i < m; i++) {
    out.push([Q[i], { x: Q[i].x + T[i].x / 3, y: Q[i].y + T[i].y / 3 }, { x: Q[i + 1].x - T[i + 1].x / 3, y: Q[i + 1].y - T[i + 1].y / 3 }, Q[i + 1]]);
  }
  return out;
}
/** The wire's curve as an SVG path ('M… C…', or 'M… L…' for a straight one). */
export function curveD(w) {
  const B = curveBeziers(w), p = q => `${r1(q.x)},${r1(q.y)}`;
  if (B.length === 1 && !Array.isArray(w.curve) && w.points.length === 2) return `M${p(B[0][0])} L${p(B[0][3])}`;
  return `M${p(B[0][0])}` + B.map(([, c1, c2, e]) => ` C${p(c1)} ${p(c2)} ${p(e)}`).join('');
}
const bez = ([p0, c1, c2, p3], t) => {
  const s = 1 - t, a = s * s * s, b = 3 * s * s * t, c = 3 * s * t * t, d = t * t * t;
  return { x: a * p0.x + b * c1.x + c * c2.x + d * p3.x, y: a * p0.y + b * c1.y + c * c2.y + d * p3.y };
};
/** The curve as a polyline (`n` steps per Bézier). */
export function sampleCurve(w, n = 16) {
  const out = [];
  for (const B of curveBeziers(w)) for (let i = out.length ? 1 : 0; i <= n; i++) out.push(bez(B, i / n));
  return out;
}

// a polyline's lengths: cumulative, from its first point
function lengths(pts) {
  const L = [0];
  for (let i = 1; i < pts.length; i++) L.push(L[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  return L;
}
// the point of a polyline nearest p: { d, f (its fraction of the length), q }
function nearest(pts, p) {
  const L = lengths(pts), tot = L[L.length - 1] || 1;
  let best = { d: Infinity, f: 0, q: pts[0] };
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], dx = b.x - a.x, dy = b.y - a.y, l2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2));
    const q = { x: a.x + t * dx, y: a.y + t * dy }, d = Math.hypot(p.x - q.x, p.y - q.y);
    if (d < best.d) best = { d, f: (L[i] + t * (L[i + 1] - L[i])) / tot, q };
  }
  return best;
}
// the point at the fraction f of a polyline's length
function pointAt(pts, f) {
  const L = lengths(pts), at = Math.max(0, Math.min(1, f)) * L[L.length - 1];
  for (let i = 0; i + 1 < pts.length; i++) {
    if (at <= L[i + 1] || i + 2 === pts.length) { const s = L[i + 1] - L[i]; return lerp(pts[i], pts[i + 1], s ? (at - L[i]) / s : 0); }
  }
  return { ...pts[0] };
}
/** The point of the wire's curve nearest p: { d (its distance), f (its fraction of the curve's length), q (the point) }. */
export const curveNearest = (w, p) => nearest(sampleCurve(w), p);
/** The point at the fraction f of the curve's length / of the rectilinear path's. */
export const curvePointAt = (w, f) => pointAt(sampleCurve(w), f);
export const pathPointAt = (w, f) => pointAt(w.points, f);
/** The fraction of the rectilinear path's length at its point p (the nearest). */
export const pathFraction = (w, p) => nearest(w.points, p).f;

/** The point of the wire's rectilinear path (on the grid, of `grid` px) answering the point p of its curve: the same
 *  fraction of their lengths. Where a wire ended on a curve, or a net name or a marker put on it, connects (#678). */
export function curveToPath(w, p, grid = 10) {
  const q = pathPointAt(w, curveNearest(w, p).f);
  const P = w.points;
  let best = null, bd = Infinity;
  for (let i = 0; i + 1 < P.length; i++) {
    const a = P[i], b = P[i + 1], clamp = (v, lo, hi) => Math.max(Math.min(lo, hi), Math.min(Math.max(lo, hi), v));
    const s = a.x === b.x ? { x: a.x, y: clamp(Math.round(q.y / grid) * grid, a.y, b.y) } : { x: clamp(Math.round(q.x / grid) * grid, a.x, b.x), y: a.y };
    const d = Math.hypot(s.x - q.x, s.y - q.y);
    if (d < bd) { bd = d; best = s; }
  }
  return best;
}

/** A wire split at p (its rectilinear path's point) into head and tail (their `points` set, #678): its own curve's
 *  knots shared between them at the same fraction of its length, each kept where it was on the sheet. */
export function splitCurve(w, head, tail, p) {
  if (!Array.isArray(w.curve)) return;
  const f = pathFraction(w, p), K = curveAbs(w), S = sampleCurve(w);
  const fk = K.map(k => nearest(S, k).f);
  setCurve(head, K.filter((k, i) => fk[i] < f));
  setCurve(tail, K.filter((k, i) => fk[i] > f));
}

/** The points a polyline (a stroke) is simplified to (Ramer-Douglas-Peucker, `tol` sheet px), its ends kept. */
export function simplify(pts, tol) {
  if (pts.length <= 2) return pts.map(p => ({ x: p.x, y: p.y }));
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [i, j] = st.pop();
    let k = -1, dm = tol;
    for (let m = i + 1; m < j; m++) {
      const a = pts[i], b = pts[j], dx = b.x - a.x, dy = b.y - a.y, l = Math.hypot(dx, dy);
      const d = l ? Math.abs((pts[m].x - a.x) * dy - (pts[m].y - a.y) * dx) / l : Math.hypot(pts[m].x - a.x, pts[m].y - a.y);
      if (d > dm) { dm = d; k = m; }
    }
    if (k >= 0) { keep[k] = true; st.push([i, k], [k, j]); }
  }
  return pts.filter((_, i) => keep[i]).map(p => ({ x: r1(p.x), y: r1(p.y) }));
}

// ------------------------------------------------------------------ hop-overs on curves (#1163)
/** The radius of a hop (sheet px), as the technical drawing's (#692). */
const HOP_R = 5;
// a curve as a polyline and its cumulative lengths, its bounding box
function track(w, n) {
  const S = sampleCurve(w, n), L = lengths(S);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of S) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  return { w, S, L, box: { x0, y0, x1, y1 } };
}
// where segments ab and cd cross (inside both), as their fractions t (of ab) and u (of cd), or null
function cross(a, b, c, d) {
  const rx = b.x - a.x, ry = b.y - a.y, sx = d.x - c.x, sy = d.y - c.y, den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / den, u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / den;
  return t >= 0 && t < 1 && u >= 0 && u < 1 ? { t, u } : null;
}
/** Where two wires' curves cross without connecting (#1163): [{ wire, s, x, y }], the wire that hops (the more
 *  horizontal of the two there, as the horizontal one in the technical drawing, #692) and the length along its
 *  curve. Not within a hop of either wire's end (a pin, a junction, a wire ended on another). A view only. */
export function curveCrossings(doc, n = 12) {
  const T = doc.wires.map(w => track(w, n)), out = [], near = HOP_R + 2;
  const nearEnd = (k, s) => s < near || T[k].L[T[k].L.length - 1] - s < near;
  for (let i = 0; i < T.length; i++) for (let j = i + 1; j < T.length; j++) {
    const A = T[i], B = T[j];
    if (A.box.x1 < B.box.x0 || B.box.x1 < A.box.x0 || A.box.y1 < B.box.y0 || B.box.y1 < A.box.y0) continue;
    for (let p = 0; p + 1 < A.S.length; p++) for (let q = 0; q + 1 < B.S.length; q++) {
      const c = cross(A.S[p], A.S[p + 1], B.S[q], B.S[q + 1]);
      if (!c) continue;
      const sa = A.L[p] + c.t * (A.L[p + 1] - A.L[p]), sb = B.L[q] + c.u * (B.L[q + 1] - B.L[q]);
      if (nearEnd(i, sa) || nearEnd(j, sb)) continue;
      const flat = (P, k) => { const dx = P[k + 1].x - P[k].x, dy = P[k + 1].y - P[k].y; return Math.abs(dx) / (Math.hypot(dx, dy) || 1); };
      const x = A.S[p].x + c.t * (A.S[p + 1].x - A.S[p].x), y = A.S[p].y + c.t * (A.S[p + 1].y - A.S[p].y);
      const aHops = flat(A.S, p) >= flat(B.S, q);
      out.push({ wire: (aHops ? A : B).w.id, s: aHops ? sa : sb, x: r1(x), y: r1(y) });
    }
  }
  return out;
}
/** The wire's curve as an SVG path with a hop (an arc of HOP_R) at each length s along it (curveCrossings's): the
 *  curve as a fine polyline, the arc bulging up (to the left going down). Hops overlapping another or an end left out. */
export function curveHopD(w, hops, n = 16) {
  const S = sampleCurve(w, n), L = lengths(S), tot = L[L.length - 1], p = q => `${r1(q.x)},${r1(q.y)}`;
  const at = s => pointAt(S, s / tot);
  let d = `M${p(S[0])}`, k = 1, last = 0;
  for (const s of [...hops].sort((a, b) => a - b)) {
    if (s - HOP_R < last || s + HOP_R > tot) continue;
    while (k < S.length - 1 && L[k] < s - HOP_R) d += ` L${p(S[k++])}`;
    const a = at(s - HOP_R), b = at(s + HOP_R);
    d += ` L${p(a)} A${HOP_R},${HOP_R} 0 0 ${b.x > a.x || (b.x === a.x && b.y > a.y) ? 1 : 0} ${p(b)}`;
    while (k < S.length - 1 && L[k] <= s + HOP_R) k++;
    last = s + HOP_R;
  }
  for (; k < S.length; k++) d += ` L${p(S[k])}`;
  return d;
}
