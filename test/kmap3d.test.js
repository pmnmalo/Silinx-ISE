// The solid of a Karnaugh map group in 3D (#1491, core/kmap3d.js): on each layer the group covers, its pieces are the
// flat map's cells of that group (wrapping around the edges as there, split into the same pieces), and its joins link
// exactly the neighbouring layers it covers (not the first and last of four). Checked on every cube of 5 and 6
// variables against an independent reference (the cells from the minterms, the pieces as the connected parts of the
// grid without wrapping) and on the shapes named one by one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kmapLayout, kmapRects, cubeMinterms } from '../core/logic.js';
import { kmapSolid, kmapSceneSide } from '../core/kmap3d.js';

// a cube from its literals: { a: 0, c: 1 } over the inputs `names`
const cube = (names, lits) => names.reduce((c, v, j) => {
  const b = 1 << (names.length - 1 - j);
  return v in lits ? { mask: c.mask, value: c.value | (lits[v] ? b : 0) } : { mask: c.mask | b, value: c.value };
}, { mask: 0, value: 0 });
const N5 = ['a', 'b', 'c', 'd', 'e'], N6 = ['a', 'b', 'c', 'd', 'e', 'g'];
const allCubes = n => {
  const out = [];
  for (let k = 0; k < 3 ** n; k++) {
    let mask = 0, value = 0, x = k;
    for (let j = 0; j < n; j++, x = Math.floor(x / 3)) { const b = 1 << j; if (x % 3 === 2) mask |= b; else if (x % 3 === 1) value |= b; }
    out.push({ mask, value });
  }
  return out;
};
// the reference: each layer's cells of the cube as grid positions, and their connected parts (no wrapping)
function reference(L, c) {
  const on = new Set(cubeMinterms(c, L.n));
  const layers = [];
  L.maps.forEach((m, mi) => {
    const cells = [];
    L.rowCodes.forEach((_, r) => L.colCodes.forEach((_, k) => { if (on.has(L.minterm(mi, r, k))) cells.push([r, k]); }));
    if (!cells.length) return;
    const left = new Set(cells.map(([r, k]) => `${r},${k}`)), parts = [];
    for (const [r, k] of cells) {
      if (!left.has(`${r},${k}`)) continue;
      const part = [], todo = [[r, k]];
      left.delete(`${r},${k}`);
      while (todo.length) {
        const [y, x] = todo.pop();
        part.push(L.minterm(mi, y, x));
        for (const [dy, dx] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (left.delete(`${y + dy},${x + dx}`)) todo.push([y + dy, x + dx]);
      }
      parts.push(part.sort((a, b) => a - b).join(','));
    }
    layers.push({ map: mi, parts: parts.sort() });
  });
  return layers;
}
const shape = s => s.layers.map(l => ({ map: l.map, parts: l.pieces.map(p => p.cells.join(',')).sort() }));
const joins = s => s.joins.map(j => `${j.from}-${j.to}`);

test('#1491 kmapSolid: on every cube of 5 and 6 variables, the pieces are the flat map\'s cells, the joins the neighbouring layers covered', () => {
  for (const n of [5, 6]) {
    const L = kmapLayout(n);
    for (const c of allCubes(n)) {
      const s = kmapSolid(L, c), ref = reference(L, c);
      assert.deepEqual(shape(s), ref, `pieces, cube ${JSON.stringify(c)}`);
      // the same pieces as the flat map draws (kmapRects), layer by layer
      assert.deepEqual(s.layers.flatMap(l => l.pieces.map(p => ({ map: l.map, r0: p.r0, r1: p.r1, c0: p.c0, c1: p.c1, open: p.open }))), kmapRects(L, c));
      // a piece's walls: its sides not open; an open side at the map's edge, its other part at the other edge
      for (const l of s.layers) for (const p of l.pieces) {
        assert.deepEqual(p.walls, ['top', 'bottom', 'left', 'right'].filter(k => !p.open[k]));
        if (p.open.left) assert.ok(p.c0 === 0 && l.pieces.some(q => q.open.right && q.c1 === L.colCodes.length - 1 && q.r0 === p.r0 && q.r1 === p.r1));
        if (p.open.top) assert.ok(p.r0 === 0 && l.pieces.some(q => q.open.bottom && q.r1 === L.rowCodes.length - 1 && q.c0 === p.c0 && q.c1 === p.c1));
      }
      // the joins: every pair of consecutive layers both covered, with the pieces of those layers (the same on both)
      const covered = ref.map(l => l.map);
      assert.deepEqual(joins(s), covered.filter(m => covered.includes(m + 1)).map(m => `${m}-${m + 1}`));
      for (const j of s.joins) {
        const at = m => s.layers.find(l => l.map === m).pieces.map(p => [p.r0, p.r1, p.c0, p.c1].join());
        assert.deepEqual(j.pieces.map(p => [p.r0, p.r1, p.c0, p.c1].join()), at(j.from));
        assert.deepEqual(at(j.to), at(j.from));
      }
    }
  }
});

test('#1491 kmapSolid: the shapes one by one, in 5 and 6 variables', () => {
  const L5 = kmapLayout(5), L6 = kmapLayout(6);
  const pieces = (L, names, lits) => kmapSolid(L, cube(names, lits)).layers.map(l => [l.map, l.pieces.map(p => `${p.r0}${p.r1}${p.c0}${p.c1}:${p.walls.join('')}`)]);
  // a single cell: one piece on one layer, closed, no join
  assert.deepEqual(pieces(L5, N5, { a: 1, b: 0, c: 1, d: 1, e: 0 }), [[1, ['1133:topbottomleftright']]]);
  assert.deepEqual(kmapSolid(L5, cube(N5, { a: 1, b: 0, c: 1, d: 1, e: 0 })).joins, []);
  // a pair across the left and right edges (e = 0, the first and last columns): two pieces, each open on its edge
  assert.deepEqual(pieces(L5, N5, { a: 0, b: 0, c: 0, e: 0 }), [[0, ['0000:topbottomright', '0033:topbottomleft']]]);
  // a pair across the top and bottom edges (c = 0, the first and last rows)
  assert.deepEqual(pieces(L5, N5, { a: 1, c: 0, d: 0, e: 0 }), [[1, ['0000:bottomleftright', '3300:topleftright']]]);
  // a quad across an edge (c = 0, d = 1: rows 0 and 3, columns 2 and 3), on both layers, joined
  assert.deepEqual(pieces(L5, N5, { c: 0, d: 1 }), [[0, ['0023:bottomleftright', '3323:topleftright']], [1, ['0023:bottomleftright', '3323:topleftright']]]);
  // the four corners (c = 0, e = 0) on both layers: four pieces of a cell, each open on its two edges, joined
  const corners = kmapSolid(L5, cube(N5, { c: 0, e: 0 }));
  assert.deepEqual(corners.layers.map(l => l.pieces.map(p => `${p.r0}${p.c0}:${p.walls.join('')}`)), [['00:bottomright', '03:bottomleft', '30:topright', '33:topleft'], ['00:bottomright', '03:bottomleft', '30:topright', '33:topleft']]);
  assert.deepEqual(corners.layers[0].pieces.map(p => p.cells), [[0], [2], [8], [10]]);
  assert.deepEqual(joins(corners), ['0-1']);
  // a whole layer (a = 1): one closed piece of 16 cells, no join
  const whole = kmapSolid(L5, cube(N5, { a: 1 }));
  assert.deepEqual([pieces(L5, N5, { a: 1 }), whole.layers[0].pieces[0].cells.length, whole.joins], [[[1, ['0303:topbottomleftright']]], 16, []]);
  // 6 variables: layers ab = 00, 01, 11, 10
  // a = 0: layers 0 and 1, joined; b = 1: layers 1 and 2, joined
  assert.deepEqual(joins(kmapSolid(L6, cube(N6, { a: 0, d: 1, g: 1 }))), ['0-1']);
  assert.deepEqual(joins(kmapSolid(L6, cube(N6, { b: 1, d: 1, g: 1 }))), ['1-2']);
  // b = 0: the first and last layers (neighbours in Gray order), no solid through the layers between them
  const ends = kmapSolid(L6, cube(N6, { b: 0, d: 1 }));
  assert.deepEqual([ends.layers.map(l => l.map), ends.joins], [[0, 3], []]);
  // all four layers (d = 1, g = 1): three joins, one closed piece of four cells on each layer
  const all4 = kmapSolid(L6, cube(N6, { d: 1, g: 1 }));
  assert.deepEqual([joins(all4), all4.layers.map(l => l.pieces.map(p => p.cells.length))], [['0-1', '1-2', '2-3'], [[4], [4], [4], [4]]]);
  // the corners through all four layers (d = 0: rows 0 and 3; g = 0: columns 0 and 3): four pieces on each layer, their 8 walls in each join
  const c4 = kmapSolid(L6, cube(N6, { d: 0, g: 0 }));
  assert.deepEqual([joins(c4), c4.layers.map(l => l.pieces.length), c4.joins[0].pieces.flatMap(p => p.walls).length], [['0-1', '1-2', '2-3'], [4, 4, 4, 4], 8]);
  // overlapping groups: each its own solid, a cell they share in the pieces of both
  const g1 = kmapSolid(L5, cube(N5, { c: 1, e: 1 })), g2 = kmapSolid(L5, cube(N5, { a: 0, c: 1 }));
  const cells = s => s.layers.flatMap(l => l.pieces.flatMap(p => p.cells));
  assert.ok(cells(g1).includes(5) && cells(g2).includes(5));
  assert.deepEqual([joins(g1), joins(g2)], [['0-1'], []]);
});

// #2206: the scene holds the stack at any rotation: every corner of the stack, turned and projected as the browser does
// (the reference, by the matrices), stays inside the side; and the side is not much more than the stack needs.
test('kmapSceneSide: the stack fits at every rotation, without much to spare', () => {
  const P = 1100;
  for (const [w, h, depth] of [[160, 204, 90], [160, 204, 270], [1, 1, 0], [400, 100, 900]]) {
    const side = kmapSceneSide(w, h, depth, P);
    let most = 0;
    for (let rx = -180; rx <= 180; rx += 5) for (let ry = -180; ry <= 180; ry += 5) {
      const [a, b] = [rx * Math.PI / 180, ry * Math.PI / 180];
      for (const x of [-w / 2, w / 2]) for (const y of [-h / 2, h / 2]) for (const z of [-depth / 2, depth / 2]) {
        // rotateX(a) rotateY(b), then depth / 2 behind the screen
        const x1 = x * Math.cos(b) + z * Math.sin(b), z1 = -x * Math.sin(b) + z * Math.cos(b);
        const y2 = y * Math.cos(a) - z1 * Math.sin(a), z2 = y * Math.sin(a) + z1 * Math.cos(a) - depth / 2;
        const s = P / (P - z2);
        most = Math.max(most, Math.abs(x1 * s), Math.abs(y2 * s));
      }
    }
    assert.ok(most <= side / 2, `${w}×${h}×${depth}: ${most} over ${side / 2}`);
    assert.ok(side / 2 <= most * 1.2 + 1, `${w}×${h}×${depth}: ${side / 2} is too much for ${most}`);
  }
});
