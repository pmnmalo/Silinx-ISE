// The Karnaugh map of 3 or 4 variables on a curved surface (#2925, core/kmapsurface.js): a cylinder for 3 variables, a
// torus for 4. Checked from the points alone, against independent references: two cells share an edge on the surface
// exactly when their minterms differ in one variable (the Karnaugh neighbours), and every group's patch covers exactly
// its cube's minterms, lies on them, and is one connected piece (its faces joined by shared edges), on every cube.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kmapLayout, cubeMinterms } from '../core/logic.js';
import { kmapSurface, kmapPatch, turn, project, facesViewer, surfaceSceneSide } from '../core/kmapsurface.js';

// the variables' orders of the map (#2924: kmapLayout(n, order); one order before it, the argument ignored)
const ORDERS = ['rows', 'cols'];
// and the map turned a quarter (its rows the columns: 4 × 2 for 3 variables, the rows round the cylinder)
const transposed = L => ({ ...L, rowVars: L.colVars, colVars: L.rowVars, rowCodes: L.colCodes, colCodes: L.rowCodes, minterm: (m, r, c) => L.minterm(m, c, r) });
const layouts = n => [...ORDERS.map(o => kmapLayout(n, o)), transposed(kmapLayout(n))];
const key = p => p.map(x => Math.round(x * 1000) / 1000 + 0).join(',');
const edgesOf = pts => pts.map((p, i) => [key(p), key(pts[(i + 1) % pts.length])].sort().join('|'));
const ones = x => { let k = 0; for (; x; x &= x - 1) k++; return k; };
const allCubes = n => {
  const out = [];
  for (let k = 0; k < 3 ** n; k++) {
    let mask = 0, value = 0, x = k;
    for (let j = 0; j < n; j++, x = Math.floor(x / 3)) { const b = 1 << j; if (x % 3 === 2) mask |= b; else if (x % 3 === 1) value |= b; }
    out.push({ mask, value });
  }
  return out;
};
// the faces' adjacency (a shared edge) and the parts it makes
function parts(faces) {
  const byEdge = new Map();
  faces.forEach((f, i) => { for (const e of edgesOf(f.pts)) { if (!byEdge.has(e)) byEdge.set(e, []); byEdge.get(e).push(i); } });
  const seen = new Set(), out = [];
  for (let s = 0; s < faces.length; s++) {
    if (seen.has(s)) continue;
    const part = [], todo = [s];
    seen.add(s);
    while (todo.length) {
      const i = todo.pop();
      part.push(i);
      for (const e of edgesOf(faces[i].pts)) for (const j of byEdge.get(e)) if (!seen.has(j)) { seen.add(j); todo.push(j); }
    }
    out.push(part);
  }
  return out;
}

test('#2925 kmapSurface: a cylinder for 3 variables, a torus for 4; none for 1, 2, 5 or 6', () => {
  const dims = s => [Math.min(s.rows, s.cols), Math.max(s.rows, s.cols)];
  for (const L of layouts(3)) { const s = kmapSurface(L); assert.deepEqual([s.kind, dims(s), s.wrapRows + s.wrapCols, s.cells.length], ['cylinder', [2, 4], 1, 8]); }
  for (const L of layouts(4)) { const s = kmapSurface(L); assert.deepEqual([s.kind, dims(s), s.wrapRows && s.wrapCols, s.cells.length], ['torus', [4, 4], true, 16]); }
  for (const n of [1, 2, 5, 6]) assert.throws(() => kmapSurface(kmapLayout(n)), /3 or 4 variables/);
  // every cell once, its minterm the flat map's
  for (const L of [...layouts(3), ...layouts(4)]) {
    const n = L.n, s = kmapSurface(L);
    assert.deepEqual(s.cells.map(c => c.mt).sort((a, b) => a - b), Array.from({ length: 2 ** n }, (_, i) => i));
    for (const c of s.cells) assert.equal(c.mt, L.minterm(0, c.r, c.c));
  }
});

test('#2925 kmapSurface: two cells share an edge on the surface exactly when they are Karnaugh neighbours (one variable apart)', () => {
  for (const L of [...layouts(3), ...layouts(4)]) {
    const n = L.n, s = kmapSurface(L);
    const edgeCells = new Map();
    for (const c of s.cells) for (const f of c.faces) for (const e of edgesOf(f.pts)) {
      if (!edgeCells.has(e)) edgeCells.set(e, new Set());
      edgeCells.get(e).add(c.mt);
    }
    for (const c of s.cells) {
      const onSurface = new Set();
      for (const cells of edgeCells.values()) if (cells.has(c.mt)) for (const m of cells) if (m !== c.mt) onSurface.add(m);
      const karnaugh = Array.from({ length: 2 ** n }, (_, m) => m).filter(m => ones(m ^ c.mt) === 1);
      assert.deepEqual([...onSurface].sort((a, b) => a - b), karnaugh, `n = ${n}, m${c.mt}`);
    }
    // the torus is closed: every edge between two faces; the cylinder's ends are its only free edges
    const free = [...edgeCells.keys()].filter(e => s.cells.flatMap(c => c.faces).filter(f => edgesOf(f.pts).includes(e)).length === 1);
    assert.equal(free.length, n === 4 ? 0 : 2 * 4 * 4, `free edges, n = ${n}`);
  }
});

test('#2925 kmapSurface: the normals point out, the seam in front, the cells of the same size as the flat map\'s along the circles', () => {
  for (const L of [...layouts(3), ...layouts(4)]) {
    const s = kmapSurface(L, { cell: 64 });
    for (const c of s.cells) for (const f of c.faces) {
      const len = Math.hypot(...f.n);
      assert.ok(Math.abs(len - 1) < 1e-9);
      // out of the axis: away from the cylinder's axis (vertical, or horizontal when the rows go round) or the tube's
      // centre circle (torus)
      const p = f.pts[0];
      const centre = s.kind === 'torus' ? (() => { const d = Math.hypot(p[0], p[2]), R = 1.6 * 4 * 64 / (2 * Math.PI); return [p[0] * R / d, 0, p[2] * R / d]; })() : s.wrapCols ? [0, p[1], 0] : [p[0], 0, 0];
      const mid = [0, 1, 2].map(i => f.pts.reduce((a, q) => a + q[i], 0) / 4 - centre[i]);
      assert.ok(mid[0] * f.n[0] + mid[1] * f.n[1] + mid[2] * f.n[2] > 0, `outward, n = ${L.n}`);
    }
  }
  // the seam (the flat map's last and first cells meeting) in front
  for (const L of [...layouts(3), ...layouts(4)]) assert.deepEqual(kmapSurface(L).at(0, 0).n.map(x => Math.round(x * 1e9) / 1e9 + 0), [0, 0, 1]);
  // the cylinder's circumference: 4 cells
  for (const L of layouts(3)) {
    const s3 = kmapSurface(L, { cell: 64, steps: 64 }), j = s3.wrapCols ? 1 : 3;   // (the face's side along the circle)
    const ring = s3.cells.filter(c => (s3.wrapCols ? c.r : c.c) === 0).flatMap(c => c.faces).reduce((a, f) => a + Math.hypot(...f.pts[j].map((x, i) => x - f.pts[0][i])), 0);
    assert.ok(Math.abs(ring - 4 * 64) < 1, `${ring}`);
  }
});

test('#2925 kmapPatch: on every cube of 3 and 4 variables, one connected patch over exactly the cube\'s cells, drawn after them', () => {
  for (const L of [...layouts(3), ...layouts(4)]) {
    const n = L.n, s = kmapSurface(L);
    const at = new Map(s.cells.map(c => [`${c.r},${c.c}`, c.mt]));
    const keyCell = new Map(s.cells.flatMap(c => c.faces.map(f => [f.key, c.mt])));
    assert.equal(keyCell.size, s.cells.length * s.cells[0].faces.length, 'one key per face');
    for (const c of allCubes(n)) {
      const p = kmapPatch(s, L, c), want = cubeMinterms(c, n).sort((a, b) => a - b);
      assert.deepEqual(p.cells, want, `cells, ${JSON.stringify(c)}`);
      assert.ok(p.faces.length > 0);
      assert.equal(parts(p.faces).length, 1, `one piece, ${JSON.stringify(c)}`);
      // each face and each outline's segment drawn after a face of one of the cube's cells (its key)
      for (const k of [...p.faces.map(f => f.key), ...p.edges.flatMap(e => e.keys)]) assert.ok(want.includes(keyCell.get(k)), `key ${k}, ${JSON.stringify(c)}`);
      assert.ok(p.edges.every(e => e.keys.length === e.pts.length - 1));
      // and every cell of the cube under some of the patch's faces (one face over two rows is drawn after one of them only)
      assert.deepEqual([...new Set(p.faces.map(f => keyCell.get(f.key)))].sort((x, y) => x - y), want, `faces over every cell, ${JSON.stringify(c)}`);
      // each face over one of the cube's cells
      for (const f of p.faces) {
        const cell = at.get(`${((Math.floor(f.uv[1]) % s.rows) + s.rows) % s.rows},${((Math.floor(f.uv[0]) % s.cols) + s.cols) % s.cols}`);
        assert.ok(want.includes(cell), `face over m${cell}, ${JSON.stringify(c)}`);
      }
    }
  }
});

test('#2925 kmapPatch: the outline is open round a circle the group covers whole, four sides elsewhere', () => {
  for (const L4 of layouts(4)) {
  const s4 = kmapSurface(L4);
  // the cube's mask and value over a b c d (a the MSB)
  const cube = lits => Object.entries(lits).reduce((c, [v, b]) => { const bit = 1 << (3 - 'abcd'.indexOf(v)); return { mask: c.mask & ~bit, value: c.value | (b ? bit : 0) }; }, { mask: 15, value: 0 });
  // the four corners (b = 0, d = 0): one patch, a closed outline of four sides
  const corners = kmapPatch(s4, L4, cube({ b: 0, d: 0 }));
  assert.deepEqual(corners.cells, [0, 2, 8, 10]);
  assert.equal(corners.edges.length, 4);
  // two variables of one axis: round the torus, its two sides along it
  const row = kmapPatch(s4, L4, cube({ a: 0, b: 0 }));
  assert.equal(row.cells.length, 4);
  assert.equal(row.edges.length, 2);
  // everything: the whole torus, no outline
  assert.equal(kmapPatch(s4, L4, { mask: 15, value: 0 }).edges.length, 0);
  }
  // 3 variables, c = 0: one band on the cylinder (across the flat map's edges, or round it)
  for (const L3 of layouts(3)) {
    const s3 = kmapSurface(L3), band = kmapPatch(s3, L3, { mask: 0b110, value: 0 });
    assert.deepEqual(band.cells, [0, 2, 4, 6]);
    assert.ok([2, 4].includes(band.edges.length));
    assert.equal(parts(band.faces).length, 1);
  }
});

test('#2925 turn, project, facesViewer, surfaceSceneSide: the view of the surface', () => {
  const near = (a, b) => a.every((x, i) => Math.abs(x - b[i]) < 1e-9);
  assert.ok(near(turn([1, 2, 3], { rx: 0, ry: 0 }), [1, 2, 3]));
  // turned right: the front comes to the right; up: the front goes up
  assert.ok(near(turn([0, 0, 1], { rx: 0, ry: 90 }), [1, 0, 0]));
  assert.ok(near(turn([0, 0, 1], { rx: 90, ry: 0 }), [0, -1, 0]));
  // nearer is bigger
  assert.ok(project([10, 0, 100], 1000).x > project([10, 0, -100], 1000).x);
  // a face in front, towards the eye; its back away
  const pts = [[-1, -1, 50], [1, -1, 50], [1, 1, 50], [-1, 1, 50]];
  assert.equal(facesViewer(pts, [0, 0, 1], 1000), true);
  assert.equal(facesViewer(pts, [0, 0, -1], 1000), false);
  // the scene holds the sphere around the surface at every rotation
  for (const n of [3, 4]) {
    const s = kmapSurface(kmapLayout(n)), side = surfaceSceneSide(s.radius, 900);
    for (let rx = -90; rx <= 90; rx += 15) for (let ry = 0; ry < 360; ry += 15) {
      for (const c of s.cells) for (const f of c.faces) for (const p of f.pts) {
        const q = project(turn(p, { rx, ry }), 900);
        assert.ok(Math.abs(q.x) <= side / 2 && Math.abs(q.y) <= side / 2, `n = ${n}, ${rx}/${ry}`);
      }
    }
  }
});
