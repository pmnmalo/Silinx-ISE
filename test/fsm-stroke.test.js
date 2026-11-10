// Tests for core/fsm-stroke.js (#3286): a transition drawn as a stroke fitted to the editor's arc. The reference: the
// curves the editor draws (web/js/fsm-render.js geom, written out here: a transition's quadratic Bézier, a self-loop's
// cubic) sampled as strokes, their bend and angle found again; straight, wavy and noisy strokes; the edge cases.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitStroke, strokeBend, strokeAngle, leftState, snapBend, snapAngle, BEND_SNAP, LEAVE_MARGIN } from '../core/fsm-stroke.js';

const R = 30;
// the editor's arc from a to b with this bend (geom), sampled at n + 1 points, from the press on a's rim to b's
function arc(a, b, bend, n = 24) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy);
  const nn = { x: -dy / L, y: dx / L };
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const C = { x: mid.x + nn.x * bend * 2, y: mid.y + nn.y * bend * 2 };
  const unit = (p, q) => { const l = Math.hypot(q.x - p.x, q.y - p.y); return { x: (q.x - p.x) / l, y: (q.y - p.y) / l }; };
  const u0 = unit(a, C), u2 = unit(b, C);
  const P0 = { x: a.x + u0.x * R, y: a.y + u0.y * R }, P2 = { x: b.x + u2.x * R, y: b.y + u2.y * R };
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, s = 1 - t;
    return { x: s * s * P0.x + 2 * s * t * C.x + t * t * P2.x, y: s * s * P0.y + 2 * s * t * C.y + t * t * P2.y };
  });
}
// the editor's self-loop on a at this angle (geom), sampled
function loop(a, deg, n = 24) {
  const ang = deg * Math.PI / 180;
  const p = (d, r) => ({ x: a.x + r * Math.cos(ang + d), y: a.y + r * Math.sin(ang + d) });
  const [P0, C1, C2, P3] = [p(-0.42, R), p(-0.62, R * 2.7), p(0.62, R * 2.7), p(0.42, R)];
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, s = 1 - t;
    const k = [s * s * s, 3 * s * s * t, 3 * s * t * t, t * t * t];
    return { x: k[0] * P0.x + k[1] * C1.x + k[2] * C2.x + k[3] * P3.x, y: k[0] * P0.y + k[1] * C1.y + k[2] * C2.y + k[3] * P3.y };
  });
}
const A = { x: 100, y: 100, r: R }, B = { x: 340, y: 160, r: R };

test('a stroke along the editor\'s arc gives its bend back, either side, either way, at any slope', () => {
  for (const [a, b] of [[A, B], [B, A], [A, { x: 100, y: 400, r: R }], [{ x: 0, y: 0, r: R }, { x: -200, y: -50, r: R }]]) {
    for (const bend of [-120, -60, -25, 20, 45, 90, 150]) {
      const got = strokeBend(arc(a, b, bend), a, b, { ra: R, rb: R });
      assert.ok(Math.abs(got - bend) <= 1, `bend ${bend}: ${got}`);
      assert.equal(Math.sign(fitStroke(arc(a, b, bend), a, b).bend), Math.sign(bend));
    }
  }
  // the same stroke drawn backwards: the same bend (its sign is the chord's, not the stroke's direction)
  assert.equal(fitStroke(arc(A, B, 50).reverse(), A, B).bend, fitStroke(arc(A, B, 50), A, B).bend);
  // the sign: the normal (−dy, dx) / L, as geom's: from (0,0) to (100,0), a stroke below (y > 0) is a positive bend
  assert.ok(strokeBend([{ x: 50, y: 40 }], { x: 0, y: 0 }, { x: 100, y: 0 }) > 0);
});

test('a straight stroke is a straight arc: {} (the editor\'s default bend kept), under the drag\'s threshold', () => {
  const line = Array.from({ length: 21 }, (_, i) => ({ x: A.x + (B.x - A.x) * i / 20, y: A.y + (B.y - A.y) * i / 20 }));
  assert.deepEqual(fitStroke(line, A, B), {});
  // a hand's wobble, a wave across the line (its two halves cancel), a small bow: still straight
  const L = Math.hypot(B.x - A.x, B.y - A.y), n = { x: -(B.y - A.y) / L, y: (B.x - A.x) / L };
  const off = (f) => line.map((p, i) => ({ x: p.x + n.x * f(i / 20), y: p.y + n.y * f(i / 20) }));
  assert.deepEqual(fitStroke(off((t) => 3 * Math.sin(t * 37)), A, B), {});
  assert.deepEqual(fitStroke(off((t) => 30 * Math.sin(t * Math.PI * 2)), A, B), {});
  // the editor's arc just under the threshold, and just over it
  assert.deepEqual(fitStroke(arc(A, B, BEND_SNAP - 2), A, B), {});
  assert.deepEqual(fitStroke(arc(A, B, BEND_SNAP + 2), A, B), { bend: BEND_SNAP + 2 });
  assert.deepEqual(fitStroke(arc(A, B, -BEND_SNAP - 2), A, B), { bend: -BEND_SNAP - 2 });
  // a noisy curve still fits its bend
  const noisy = arc(A, B, 70, 60).map((p, i) => ({ x: p.x + 2 * Math.sin(i * 1.7), y: p.y + 2 * Math.cos(i * 2.3) }));
  assert.ok(Math.abs(fitStroke(noisy, A, B).bend - 70) <= 5);
});

test('the points inside the states and beyond the chord\'s ends are left out', () => {
  // a scribble inside A and inside B, then a bow between them
  const scribble = (s) => [{ x: s.x + 10, y: s.y - 20 }, { x: s.x - 15, y: s.y + 25 }];
  const pts = [...scribble(A), ...arc(A, B, 40), ...scribble(B)];
  assert.equal(fitStroke(pts, A, B).bend, 40);
  // a stroke with no point between the states: straight
  assert.equal(strokeBend(scribble(A), A, B, { ra: R, rb: R }), 0);
  assert.equal(strokeBend([], A, B), 0);
  // two states at the same place: 0, not NaN
  assert.equal(strokeBend([{ x: 5, y: 5 }], { x: 0, y: 0 }, { x: 0, y: 0 }), 0);
});

test('a self-loop\'s stroke gives the editor\'s angle of its apex back, to 5 degrees', () => {
  for (const deg of [-90, 90, 0, 180, -45, -135, 45, 135, 20, -160]) {
    assert.deepEqual(fitStroke(loop(A, deg), A, A), { angle: deg === 180 ? 180 : deg }, `angle ${deg}`);
  }
  // a small, lopsided loop drawn by a pen: up and a little to the right
  const small = [{ x: 110, y: 72 }, { x: 118, y: 58 }, { x: 128, y: 52 }, { x: 132, y: 60 }, { x: 125, y: 75 }];
  assert.equal(fitStroke(small, A, A).angle, snapAngle(strokeAngle(small, A)));
  assert.equal(fitStroke(small, A, A).angle, snapAngle(Math.atan2(52 - 100, 128 - 100) * 180 / Math.PI));
  // two states at the same place are no self-loop: a straight arc
  assert.deepEqual(fitStroke(loop(A, 45), A, { ...A }), {});
});

test('a stroke that never left the state is no self-loop (null)', () => {
  const inside = [{ x: 125, y: 100 }, { x: 100 + R + LEAVE_MARGIN - 1, y: 100 }, { x: 100, y: 130 }];
  assert.equal(leftState(inside, A, R), false);
  assert.equal(fitStroke(inside, A, A), null);
  assert.equal(fitStroke([], A, A), null);
  const out = [...inside, { x: 100, y: 100 - R - LEAVE_MARGIN - 1 }];
  assert.equal(leftState(out, A, R), true);
  assert.deepEqual(fitStroke(out, A, A), { angle: -90 });
  assert.equal(strokeAngle([], A), null);
  assert.equal(strokeAngle([{ x: 100, y: 100 }], A), null);
});

test('snapBend and snapAngle: the editor\'s rounding', () => {
  assert.deepEqual([snapBend(7.9), snapBend(-7.9), snapBend(8), snapBend(-8.4), snapBend(33.5), snapBend(-33.5)], [0, 0, 8, -8, 34, -33]);
  assert.deepEqual([snapAngle(-179), snapAngle(-182), snapAngle(178), snapAngle(181), snapAngle(-92), snapAngle(3), snapAngle(-2)], [180, 180, 180, 180, -90, 5, 0]);
});
