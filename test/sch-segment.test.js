// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
//
// #688: one segment of a schematic wire dragged (moveSegment, core/schroute.js): a horizontal one up or
// down, a vertical one left or right; its two neighbours stretch or shrink to stay attached, every other
// segment stays; a connected end stays where it is, joined by a short segment; the nets and the
// generated HDL do not change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moveSegment } from '../core/schroute.js';
import { newDoc, netlist, generateHdl } from '../core/schdoc.js';

const P = (x, y) => ({ x, y });
const str = pts => pts.map(p => `${p.x},${p.y}`).join(' ');
// a Z-shaped wire: horizontal, vertical, horizontal, vertical, horizontal
const Z = [P(0, 0), P(100, 0), P(100, 100), P(200, 100), P(200, 200), P(300, 200)];

test('#688 a middle segment: only it moves, its two neighbours stretch or shrink, the others stay', () => {
  // the horizontal (100,100)-(200,100) down 30: the verticals before and after stretch / shrink
  assert.equal(str(moveSegment(Z, 2, 30)), '0,0 100,0 100,130 200,130 200,200 300,200');
  assert.equal(str(moveSegment(Z, 2, -60)), '0,0 100,0 100,40 200,40 200,200 300,200');
  // the vertical (100,0)-(100,100) right 40: the horizontals around it change length
  assert.equal(str(moveSegment(Z, 1, 40)), '0,0 140,0 140,100 200,100 200,200 300,200');
  // the input is not changed
  assert.equal(str(Z), '0,0 100,0 100,100 200,100 200,200 300,200');
  // a neighbour shrunk to nothing: the wire made simpler (no zero-length segment, no point in a straight run)
  assert.equal(str(moveSegment(Z, 2, -100)), '0,0 200,0 200,200 300,200');
  assert.equal(str(moveSegment(Z, 1, 100)), '0,0 200,0 200,200 300,200');
});

test('#688 an end segment: a connected end stays (a short segment added), a free end moves with it', () => {
  // the first segment down 20, its start held: a new short vertical joins it
  assert.equal(str(moveSegment(Z, 0, 20)), '0,0 0,20 100,20 100,100 200,100 200,200 300,200');
  // free: the end moves
  assert.equal(str(moveSegment(Z, 0, 20, { keepA: false })), '0,20 100,20 100,100 200,100 200,200 300,200');
  // the last segment up 50, its end held
  assert.equal(str(moveSegment(Z, 4, -50)), '0,0 100,0 100,100 200,100 200,150 300,150 300,200');
  assert.equal(str(moveSegment(Z, 4, -50, { keepB: false })), '0,0 100,0 100,100 200,100 200,150 300,150');
  // a one-segment wire held at both ends: a U; free at both: moved whole
  assert.equal(str(moveSegment([P(0, 0), P(100, 0)], 0, 30)), '0,0 0,30 100,30 100,0');
  assert.equal(str(moveSegment([P(0, 0), P(100, 0)], 0, 30, { keepA: false, keepB: false })), '0,30 100,30');
  assert.equal(str(moveSegment([P(50, 0), P(50, 100)], 0, -20, { keepB: false })), '50,0 30,0 30,100');
});

test('#688 nothing to move: no offset, a diagonal segment, a segment index out of range', () => {
  assert.equal(str(moveSegment(Z, 2, 0)), str(Z));
  assert.equal(str(moveSegment([P(0, 0), P(100, 100)], 0, 20)), '0,0 100,100');
  assert.equal(str(moveSegment(Z, 7, 20)), str(Z));
  // a neighbour in line (not across): kept, a short segment joins it
  assert.equal(str(moveSegment([P(0, 0), P(50, 0), P(100, 0), P(100, 50)], 1, 20)), '0,0 50,0 50,20 100,20 100,50');
});

test('#688 the nets and the HDL do not change: a segment dragged between a gate and a marker', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = newDoc('seg', lang);
    doc.symbols.push({ id: 'S1', type: 'inv', x: 80, y: 90, rot: 0, mirror: false, name: 'U1', params: { width: 1 } });
    doc.ports.push({ id: 'P1', name: 'a', dir: 'in', width: 1, x: 60, y: 100 }, { id: 'P2', name: 'y', dir: 'out', width: 1, x: 400, y: 300 });
    doc.wires.push({ id: 'W1', points: [P(60, 100), P(80, 100)] }, { id: 'W2', points: [P(160, 100), P(250, 100), P(250, 300), P(400, 300)] });
    const before = generateHdl(doc, { lang });
    assert.deepEqual(before.diagnostics, []);
    for (const [i, d] of [[1, 40], [1, -60], [0, 30], [2, -50]]) {
      const w = doc.wires[1];
      const moved = { ...doc, wires: [doc.wires[0], { ...w, points: moveSegment(w.points, i, d) }] };
      const P2 = moved.wires[1].points;
      assert.deepEqual([P2[0], P2.at(-1)], [P(160, 100), P(400, 300)], `segment ${i} by ${d}: the ends stay`);
      assert.deepEqual(netlist(moved).nets.map(n => n.endpoints.length), netlist(doc).nets.map(n => n.endpoints.length));
      const g = generateHdl(moved, { lang });
      assert.deepEqual(g.diagnostics, [], 'no warnings');
      assert.equal(g.code, before.code, `${lang}: the same HDL`);
    }
  }
});
