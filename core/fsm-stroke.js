// A transition of a state diagram drawn as a stroke (#3286): the pen's, the finger's or the mouse's path from a state
// to another fitted to the arc the editor draws (web/js/fsm-render.js geom): between two states, the `bend` of its
// quadratic curve (its control point at bend × 2 from the chord's middle, along the chord's normal: the curve is then
// 4 · bend · t · (1 − t) away from the chord, bend at its middle); a self-loop, the `angle` of its apex (the stroke's
// farthest point from the state's centre).

/** A bend under this (px) is a straight arc: the editor's threshold when an arc is bent by a drag. */
export const BEND_SNAP = 8;
/** How far (px) beyond a state's circle a stroke must go to have left it: the editor's band for the drop target. */
export const LEAVE_MARGIN = 8;

/** A bend as the editor keeps it: rounded, 0 under BEND_SNAP. */
export const snapBend = (b) => (Math.abs(b) < BEND_SNAP ? 0 : Math.round(b));
/** An angle (degrees) as the editor keeps it: to 5°, in (−180, 180]. */
export function snapAngle(deg) {
  const a = Math.round(deg / 5) * 5 + 0;   // (+ 0: never −0)
  return a <= -180 ? a + 360 : a > 180 ? a - 360 : a;
}

/**
 * The editor's arc from a to b with this bend (web/js/fsm-render.js geom): its quadratic Bézier, its control point at
 * bend × 2 from the chord's middle along the normal (−dy, dx) / L, from a's circle (ra) to b's (rb + 1, the arrow's
 * tip), sampled at n + 1 points.
 */
export function arcPoints(a, b, bend, { ra = 0, rb = 0, n = 32 } = {}) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
  const C = { x: (a.x + b.x) / 2 - dy / L * bend * 2, y: (a.y + b.y) / 2 + dx / L * bend * 2 };
  const unit = (p, q) => { const l = Math.hypot(q.x - p.x, q.y - p.y) || 1; return { x: (q.x - p.x) / l, y: (q.y - p.y) / l }; };
  const u0 = unit(a, C), u2 = unit(b, C);
  const P0 = { x: a.x + u0.x * ra, y: a.y + u0.y * ra }, P2 = { x: b.x + u2.x * (rb + 1), y: b.y + u2.y * (rb + 1) };
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, s = 1 - t;
    return { x: s * s * P0.x + 2 * s * t * C.x + t * t * P2.x, y: s * s * P0.y + 2 * s * t * C.y + t * t * P2.y };
  });
}

// the squared distance of p to the polyline q
function dist2(p, q) {
  let best = Infinity;
  for (let i = 1; i < q.length; i++) {
    const a = q[i - 1], vx = q[i].x - a.x, vy = q[i].y - a.y, l2 = vx * vx + vy * vy;
    const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2)) : 0;
    const ex = p.x - a.x - vx * t, ey = p.y - a.y - vy * t;
    best = Math.min(best, ex * ex + ey * ey);
  }
  return best;
}

/**
 * The bend of a stroke from state a to state b (centres { x, y }; ra, rb their radii), unrounded: the points outside
 * both circles and between the chord's ends fitted first to the curve 4 · bend · t · (1 − t) away from the chord (least
 * squares, t their place along it), then the editor's arc (arcPoints) nearest to them found around that bend, to 1 px.
 * Signed as the editor's normal; 0 for a stroke with no point between the states.
 */
export function strokeBend(points, a, b, { ra = 0, rb = 0 } = {}) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  if (!L) return 0;
  const n = { x: -dy / L, y: dx / L };
  const pts = [];
  let num = 0, den = 0;
  for (const p of points) {
    if (Math.hypot(p.x - a.x, p.y - a.y) <= ra || Math.hypot(p.x - b.x, p.y - b.y) <= rb) continue;
    const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (L * L);
    if (t <= 0 || t >= 1) continue;
    const f = 4 * t * (1 - t);
    num += ((p.x - a.x) * n.x + (p.y - a.y) * n.y) * f;
    den += f * f;
    pts.push(p);
  }
  if (!den) return 0;
  const guess = num / den;
  const cost = (bend) => { const q = arcPoints(a, b, bend, { ra, rb }); return pts.reduce((s, p) => s + dist2(p, q), 0); };
  const span = Math.max(30, Math.abs(guess) * 0.6);
  let best = guess, bc = cost(guess);
  for (let step = span / 8; step >= 0.5; step /= 4) {
    const c0 = best;
    for (let k = -8; k <= 8; k++) {
      const v = c0 + k * step, c = cost(v);
      if (c < bc) { bc = c; best = v; }
    }
  }
  return best;
}

/** The farthest point of a stroke from a state's centre s, and its distance. */
function farthest(points, s) {
  let best = null, d = -1;
  for (const p of points) {
    const q = Math.hypot(p.x - s.x, p.y - s.y);
    if (q > d) { d = q; best = p; }
  }
  return { p: best, d };
}

/** Whether a stroke left the state at s (radius r): one of its points beyond the circle and its LEAVE_MARGIN. */
export const leftState = (points, s, r) => farthest(points, s).d > r + LEAVE_MARGIN;

/** The angle (degrees, unrounded) of a self-loop's stroke on the state at s: the direction of its farthest point; null with no points. */
export function strokeAngle(points, s) {
  const { p, d } = farthest(points, s);
  return p && d > 0 ? Math.atan2(p.y - s.y, p.x - s.x) * 180 / Math.PI : null;
}

/**
 * The shape of a transition drawn as a stroke from state `from` to state `to` ({ x, y, r }; the same object: a self-loop): a self-loop's
 * { angle } (null when the stroke never left the state: no transition), another's { bend } ({} when straight: the
 * editor's default bend kept, beside a transition the other way).
 */
export function fitStroke(points, from, to) {
  if (from === to) {
    if (!leftState(points, from, from.r ?? 0)) return null;
    return { angle: snapAngle(strokeAngle(points, from)) };
  }
  const bend = snapBend(strokeBend(points, from, to, { ra: from.r ?? 0, rb: to.r ?? 0 }));
  return bend ? { bend } : {};
}
