// The 3D Karnaugh map of 3 or 4 variables seen (#3119, #3120, core/kmapsurface.js): where a cell's text goes and how
// large (labelSpot, surfaceFrame, textMatrix), the painter's order (paintOrder), the faces round a group's outline
// (kmapPatch's around), and the groups' cells against the flat map's (kmapRects), on the two maps of #3119 / #3120: a
// torus (q2 q1 q0 q, by columns) and a cylinder (a b c, by rows).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kmapLayout, kmapRects } from '../core/logic.js';
import { kmapSurface, kmapPatch, turn, project, facesViewer, facing, surfaceFrame, labelSpots, inPolygon, textFits, textMatrix, paintOrder } from '../core/kmapsurface.js';

const CELL = 80, P = 900, HOME = { rx: -30, ry: 20 };
const VIEWS = [HOME, { rx: -60, ry: -20 }, { rx: 0, ry: 0 }, { rx: 45, ry: 130 }, { rx: -85, ry: 250 }, { rx: -10, ry: -95 }];
const torusL = kmapLayout(4, 'cols'), torus = kmapSurface(torusL, { cell: CELL });
const cylL = kmapLayout(3, 'rows'), cyl = kmapSurface(cylL, { cell: CELL });
const cube = (n, s) => { let mask = 0, value = 0; [...s].forEach((ch, i) => { const b = 1 << (n - 1 - i); if (ch === '-') mask |= b; else if (ch === '1') value |= b; }); return { mask, value }; };
// solution 7 of 13 of #3119's torus, and #3120's cylinder (bits: q2 q1 q0 q; a b c)
const TORUS_GROUPS = { '--11': [3, 7, 11, 15], '-1-1': [5, 7, 13, 15], '-000': [0, 8], '001-': [2, 3], '010-': [4, 5], '111-': [14, 15] };
const CYL_GROUPS = { '00-': [0, 1], '0-0': [0, 2], '1-1': [5, 7] };

// the faces of a surface seen in a view: their projected corners, depth (larger nearer) and side
const seen = (S, view) => S.cells.flatMap(c => c.faces.map(f => {
  const tp = f.pts.map(q => turn(q, view)), pr = tp.map(q => project(q, P));
  return { mt: c.mt, pr, z: pr.reduce((a, q) => a + q.z, 0) / 4, back: !facesViewer(tp, turn(f.n, view), P), c: [pr.reduce((a, q) => a + q.x, 0) / 4, pr.reduce((a, q) => a + q.y, 0) / 4] };
}));
const inside = ([x, y], pr) => inPolygon({ x, y }, pr);
// inside the polygon or within half a pixel of its sides (a centre on the side of two faces in front)
const covered = (q, pr) => inside(q, pr) || pr.some((a, i) => {
  const b = pr[(i + 1) % pr.length], dx = b.x - a.x, dy = b.y - a.y, t = Math.max(0, Math.min(1, ((q[0] - a.x) * dx + (q[1] - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(q[0] - a.x - t * dx, q[1] - a.y - t * dy) < 0.5;
});

test('#3119 the groups of the 3D map cover the cells the flat map\'s rectangles cover, in the order chosen', () => {
  for (const [S, L, groups] of [[torus, torusL, TORUS_GROUPS], [cyl, cylL, CYL_GROUPS]]) {
    // the cells where the flat map has them (its layout), every one once
    assert.deepEqual(S.cells.map(c => c.mt), S.cells.map(c => L.minterm(0, c.r, c.c)));
    assert.equal(new Set(S.cells.map(c => c.mt)).size, 1 << L.n);
    for (const [s, cells] of Object.entries(groups)) {
      // (a group across the flat map's edges is two or four rectangles there)
      const flat = kmapRects(L, cube(L.n, s)).flatMap(r => {
        const out = [];
        for (let i = r.r0; i <= r.r1; i++) for (let j = r.c0; j <= r.c1; j++) out.push(L.minterm(r.map, i, j));
        return out;
      }).sort((a, b) => a - b);
      assert.deepEqual(flat, cells, `${s}: the flat map's`);
      assert.deepEqual(kmapPatch(S, L, cube(L.n, s), { cell: CELL }).cells, cells, `${s}: the surface's`);
    }
  }
  // the cylinder's m(0, 1) (/a./b, by rows: a on the rows, b c round the cylinder): columns 00 and 01, side by side, the
  // first beside the seam in front, the second round the side to the back (its inside seen through the open top)
  const c0 = cyl.cells.find(c => c.mt === 0), c1 = cyl.cells.find(c => c.mt === 1);
  assert.deepEqual([c0.r, c0.c, c1.r, c1.c], [0, 0, 0, 1]);
  assert.ok(turn(c0.centre.p, HOME)[2] > 0 && turn(c1.centre.p, HOME)[2] < 0, 'm0 in front, m1 at the back');
});

test('#3119 labelSpots: the spots of a cell that face the viewer, its centre first while that faces it well, then the best', () => {
  for (const S of [torus, cyl]) for (const view of VIEWS) for (const c of S.cells) {
    const spots = labelSpots(S, c, view, P);
    const score = (u, v) => { const { p, n } = S.at(u, v); return facing(turn(p, view), turn(n, view), P); };
    const us = S.wrapCols ? [0.2, 0.5, 0.8] : [0.5], vs = S.wrapRows ? [0.2, 0.5, 0.8] : [0.5];
    const all = us.flatMap(a => vs.map(b => ({ u: c.c + a, v: c.r + b })));
    // every sample of the cell that faces the viewer, and only those
    assert.deepEqual(spots.map(x => `${x.u},${x.v}`).sort(), all.filter(x => score(x.u, x.v) > 0).map(x => `${x.u},${x.v}`).sort(), `m${c.mt} at ${JSON.stringify(view)}`);
    const scores = spots.map(x => score(x.u, x.v));
    if (score(c.c + 0.5, c.r + 0.5) >= 0.5) {
      assert.deepEqual(spots[0], { u: c.c + 0.5, v: c.r + 0.5 }, 'the centre first');
      scores.shift();
    }
    scores.forEach((x, i) => assert.ok(i === 0 || x <= scores[i - 1], 'the best first'));
  }
  // the torus as first shown: the 1s at 0 and 8 in front, 3 and 11 inside the hole, 14 at the back, and 6 (a 0) face the
  // viewer (before, the centre's normal had to point 0.25 towards the screen: none of them had a text)
  const facingCells = torus.cells.filter(c => labelSpots(torus, c, HOME, P).length).map(c => c.mt).sort((a, b) => a - b);
  assert.deepEqual(facingCells, [0, 2, 3, 5, 6, 7, 8, 10, 11, 13, 14, 15]);
  const old = torus.cells.filter(c => turn(c.centre.n, HOME)[2] > 0.25).map(c => c.mt).sort((a, b) => a - b);
  assert.deepEqual(old, [2, 7, 10, 15]);
});

test('#3119 inPolygon, textFits: a text\'s box on faces seen from the front, under none much nearer', () => {
  const sq = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  assert.ok(inPolygon({ x: 5, y: 5 }, sq(0, 0, 10, 10)) && inPolygon({ x: 5, y: 5 }, [...sq(0, 0, 10, 10)].reverse()), 'either way round');
  assert.ok(!inPolygon({ x: 11, y: 5 }, sq(0, 0, 10, 10)) && !inPolygon({ x: 5, y: -1 }, sq(0, 0, 10, 10)));
  const box = sq(2, 2, 8, 8);
  // on two faces side by side; one corner off them; one corner under a face nearer than the margin allows
  assert.ok(textFits(box, 0, [{ pr: sq(0, 0, 5, 10), z: 0 }, { pr: sq(5, 0, 10, 10), z: 10 }], 20));
  assert.ok(!textFits(sq(2, 2, 12, 8), 0, [{ pr: sq(0, 0, 10, 10), z: 0 }], 20), 'off the surface');
  assert.ok(!textFits(box, 0, [{ pr: sq(0, 0, 10, 10), z: 0 }, { pr: sq(7, 7, 20, 20), z: 30 }], 20), 'behind a part in front');
  assert.ok(textFits(box, 0, [{ pr: sq(0, 0, 10, 10), z: 0 }, { pr: sq(7, 7, 20, 20), z: -30 }], 20), 'a part behind it');
  assert.ok(!textFits(box, 0, [], 20));
  // the torus as first shown: cells 5 and 13 (inside the hole, far side) face the viewer but are behind the tube in front:
  // no spot of theirs fits; 3 and 11, beside them on the hole's near rim, do
  const fs = seen(torus, HOME).filter(f => !f.back).map(f => ({ pr: f.pr, z: f.z }));
  const fits = mt => {
    const c = torus.cells.find(x => x.mt === mt);
    return labelSpots(torus, c, HOME, P).some(at => {
      const m = textMatrix(surfaceFrame(torus, at.u, at.v), HOME, P), z = turn(torus.at(at.u, at.v).p, HOME)[2];
      return textFits([[-2, -2], [2, -2], [2, 2], [-2, 2]].map(([x, y]) => ({ x: m[4] + m[0] * x, y: m[5] + m[0] * y })), z, fs, CELL / 2);
    });
  };
  assert.deepEqual([5, 13, 3, 11, 0, 8].map(fits), [false, false, true, true, true, true]);
});

test('#3119 surfaceFrame, textMatrix: the text upright at its point\'s projection, shrunk as the surface is foreshortened there', () => {
  for (const S of [torus, cyl]) for (const view of VIEWS) for (const c of S.cells) {
    const u = c.c + 0.5, v = c.r + 0.5, f = surfaceFrame(S, u, v);
    // the frame: unit tangents along the columns and the rows, their cross product the outward normal
    const cross = [f.tu[1] * f.tv[2] - f.tu[2] * f.tv[1], f.tu[2] * f.tv[0] - f.tu[0] * f.tv[2], f.tu[0] * f.tv[1] - f.tu[1] * f.tv[0]];
    assert.ok(Math.abs(Math.hypot(...f.tu) - 1) < 1e-9 && Math.abs(Math.hypot(...f.tv) - 1) < 1e-9);
    cross.forEach((x, i) => assert.ok(Math.abs(x - f.n[i]) < 1e-3, `tu × tv = n at m${c.mt}`));
    const m = textMatrix(f, view, P), pr = project(turn(f.p, view), P);
    assert.deepEqual([m[1], m[2]], [0, 0], 'upright');
    assert.ok(Math.abs(m[0] - m[3]) < 1e-12 && m[0] >= 0);
    assert.ok(Math.abs(m[4] - pr.x) < 1e-9 && Math.abs(m[5] - pr.y) < 1e-9, 'at the point');
    // the scale: the square root of the projected area of a small square of the surface there (by its corners)
    const e = 0.01, q = (a, b) => { const g = surfaceFrame(S, u, v), pt = g.p.map((x, i) => x + a * g.tu[i] + b * g.tv[i]); return project(turn(pt, view), P); };
    const o = q(0, 0), a = q(e, 0), b = q(0, e);
    // (signed: a point seen from behind has none, its text not shown)
    const area = ((a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)) / (e * e);
    assert.ok(Math.abs(m[0] - Math.sqrt(Math.max(0, area))) < 1e-3 * Math.max(1, m[0]), `scale at m${c.mt}: ${m[0]} vs ${area}`);
  }
  // facing the eye squarely at the centre of the screen: full size (the perspective's), none edge-on
  const f = { p: [0, 0, 100], n: [0, 0, 1], tu: [1, 0, 0], tv: [0, 1, 0] };
  assert.deepEqual(textMatrix(f, { rx: 0, ry: 0 }, P), [P / (P - 100), 0, 0, P / (P - 100), 0, 0]);
  assert.ok(textMatrix(f, { rx: 0, ry: 90 }, P)[0] < 1e-6, 'edge-on');
});

test('#3120 paintOrder: what is on a face seen from behind first, then the rest, each farthest first', () => {
  const items = [{ id: 'a', z: 5, back: false }, { id: 'b', z: 9, back: true }, { id: 'c', z: -3, back: false }, { id: 'd', z: 1, back: true }, { id: 'e', z: 5, back: false }];
  assert.deepEqual(paintOrder(items).map(x => x.id), ['d', 'b', 'c', 'a', 'e']);
  assert.deepEqual(items.map(x => x.id), ['a', 'b', 'c', 'd', 'e'], 'the list itself left as it was');
  assert.deepEqual(paintOrder([]), []);
  // the torus is closed: a face seen from behind is always behind one seen from the front (each one's centre inside a
  // face in front), so drawing it first is right; a sort by depth alone draws some over the face in front of them,
  // along the silhouette (#3120: the outline of m(4, 5) over the outer rim)
  for (const view of VIEWS) {
    const fs = seen(torus, view), front = fs.filter(f => !f.back);
    for (const b of fs.filter(f => f.back)) assert.ok(front.some(f => covered(b.c, f.pr)), `m${b.mt}'s face behind, covered at ${JSON.stringify(view)}`);
  }
  const fs = seen(torus, HOME), byDepth = [...fs].sort((x, y) => x.z - y.z);
  const wrong = byDepth.filter((b, i) => b.back && byDepth.slice(0, i).some(f => !f.back && inside(b.c, f.pr)));
  assert.ok(wrong.length > 0, 'by depth alone: a face behind drawn over the face in front of it');
  const ordered = paintOrder(fs), firstFront = ordered.findIndex(f => !f.back);
  assert.ok(ordered.slice(firstFront).every(f => !f.back), 'paintOrder: none');
});

test('#3120 kmapPatch: the faces round each segment of a group\'s outline, on the surface, the one under it among them', () => {
  for (const [S, L, groups] of [[torus, torusL, TORUS_GROUPS], [cyl, cylL, CYL_GROUPS]]) {
    const keys = new Set(S.cells.flatMap(c => c.faces.map(f => f.key)));
    for (const s of Object.keys(groups)) {
      const p = kmapPatch(S, L, cube(L.n, s), { cell: CELL });
      assert.ok(p.edges.length > 0, s);
      for (const e of p.edges) {
        assert.equal(e.around.length, e.keys.length);
        e.around.forEach((round, i) => {
          assert.ok(round.includes(e.keys[i]), `${s}: the face under it`);
          assert.ok(round.length >= 2 && round.length <= 5 && round.every(k => keys.has(k)), `${s}: ${round}`);
        });
      }
    }
  }
  // the cylinder's ends (the rows do not wrap there): no face beyond them
  const p = kmapPatch(cyl, cylL, cube(3, '1-1'), { cell: CELL, inset: 0 });
  for (const e of p.edges) for (const round of e.around) for (const k of round) assert.ok(+k.split(',')[1] < cyl.rows, k);
});
