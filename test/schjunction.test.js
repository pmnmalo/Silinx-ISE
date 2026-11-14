// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
//
// #3806: a schematic's junction dots (core/schjunction.js): the dots on some wires (drawn highlighted with them), what
// meets at a dot, a dot moved: the wires ending on it follow, square and on the grid (a T, a four-way dot, a dot on a
// pin, a bus's dot, a net name on an end segment); the connections and the generated HDL (VHDL and Verilog, no
// warnings) the same; a move that would short two named nets refused, one that joins an unnamed net said; no dot
// there, off the grid.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newDoc, netlist, generateHdl, normalizeDoc } from '../core/schdoc.js';
import { connectivity } from '../core/schroute.js';
import { junctionAt, junctionWires, junctionsOnWires, moveJunction, shortText, CONNECTIONS_CHANGED } from '../core/schjunction.js';

const P = (x, y) => ({ x, y });
const str = pts => pts.map(p => `${p.x},${p.y}`).join(' ');
const wires = doc => Object.fromEntries(doc.wires.map(w => [w.id, str(w.points)]));
const port = (id, name, dir, x, y, width = 1) => ({ id, name, dir, width, x, y });
// the input a to the outputs y and z, a T at (200, 200); width: the bus's
function tee(lang = 'vhdl', width = 1) {
  const doc = newDoc('tee', lang);
  doc.ports.push(port('P1', 'a', 'in', 100, 200, width), port('P2', 'y', 'out', 400, 100, width), port('P3', 'z', 'out', 400, 300, width));
  doc.wires.push({ id: 'W1', points: [P(100, 200), P(200, 200)] }, { id: 'W2', points: [P(200, 200), P(200, 100), P(400, 100)] },
    { id: 'W3', points: [P(200, 200), P(200, 300), P(400, 300)] });
  return normalizeDoc(doc);
}
// every segment square, every point on the grid (an independent check of the geometry)
function square(doc) {
  for (const w of doc.wires) {
    for (const p of w.points) assert.ok(p.x % 10 === 0 && p.y % 10 === 0, `${w.id}: ${str(w.points)} on the grid`);
    for (let i = 0; i + 1 < w.points.length; i++) { const a = w.points[i], b = w.points[i + 1]; assert.ok(a.x === b.x || a.y === b.y, `${w.id}: ${str(w.points)} square`); }
  }
}
// the dot moved: the same connections and HDL (no warnings), square, the dot where it went
function same(doc, at, to, lang) {
  const r = moveJunction(doc, at, to);
  assert.deepEqual([r.short, r.kept], [null, true]);
  square(r.doc);
  assert.deepEqual(connectivity(r.doc), connectivity(doc));
  assert.ok(netlist(r.doc).junctions.some(j => j.x === to.x && j.y === to.y), 'the dot moved');
  const g0 = generateHdl(doc, { lang }), g = generateHdl(r.doc, { lang });
  assert.deepEqual([g0.diagnostics, g.diagnostics], [[], []], 'no warnings');
  assert.equal(g.code, g0.code, `${lang}: the same HDL`);
  return r.doc;
}

test('#3806 the dots on some wires; what meets at a dot; no dot at a bend or an end', () => {
  const doc = tee(), nl = netlist(doc);
  assert.deepEqual(nl.junctions, [P(200, 200)]);
  for (const id of ['W1', 'W2', 'W3']) assert.deepEqual(junctionsOnWires(doc, nl.junctions, new Set([id])), [P(200, 200)]);
  assert.deepEqual(junctionsOnWires(doc, nl.junctions, new Set()), []);
  assert.deepEqual(junctionsOnWires(doc, nl.junctions, new Set(['W9'])), []);
  // a wire through the dot (not split there) has it on it too
  const through = { ...doc, wires: [{ id: 'W9', points: [P(150, 100), P(150, 300)] }] };
  assert.deepEqual(junctionsOnWires(through, [P(150, 200)], new Set(['W9'])), [P(150, 200)]);
  assert.deepEqual(junctionAt(doc, P(200, 200)), { wires: [{ id: 'W1', a: false, b: true }, { id: 'W2', a: true, b: false }, { id: 'W3', a: true, b: false }], pins: [] });
  for (const at of [P(200, 100), P(100, 200), P(300, 300), P(200, 210)]) assert.equal(junctionAt(doc, at), null, str([at]));
});

test('#3806 a T moved across and along its wires: they follow, square; the same connections and HDL', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const doc = tee(lang);
    assert.deepEqual(wires(same(doc, P(200, 200), P(250, 220), lang)), { W1: '100,200 100,220 250,220', W2: '250,220 250,100 400,100', W3: '250,220 250,300 400,300' });
    assert.deepEqual(wires(same(doc, P(200, 200), P(150, 200), lang)), { W1: '100,200 150,200', W2: '150,200 150,100 400,100', W3: '150,200 150,300 400,300' });
    assert.deepEqual(wires(same(doc, P(200, 200), P(200, 250), lang)), { W1: '100,200 100,250 200,250', W2: '200,250 200,100 400,100', W3: '200,250 200,300 400,300' });
    // the document given is not changed
    assert.deepEqual(wires(doc), { W1: '100,200 200,200', W2: '200,200 200,100 400,100', W3: '200,200 200,300 400,300' });
  }
});

test('#3806 a four-way dot; a dot on a pin (the pin joined to it by a wire); a bus\'s dot', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const four = tee(lang);
    four.ports.push(port('P4', 'w', 'out', 400, 200));
    four.wires.push({ id: 'W4', points: [P(200, 200), P(400, 200)] });
    assert.deepEqual(wires(same(four, P(200, 200), P(220, 180), lang)),
      { W1: '100,200 100,180 220,180', W2: '220,180 220,100 400,100', W3: '220,180 220,300 400,300', W4: '220,180 400,180 400,200' });
    // an inverter's output pin (160, 100) with two wires on it
    const inv = newDoc('inv', lang);
    inv.symbols.push({ id: 'S1', type: 'inv', x: 80, y: 90, rot: 0, mirror: false, name: 'U1', params: { width: 1 } });
    inv.ports.push(port('P1', 'a', 'in', 60, 100), port('P2', 'y', 'out', 400, 300), port('P3', 'z', 'out', 400, 200));
    inv.wires.push({ id: 'W1', points: [P(60, 100), P(80, 100)] }, { id: 'W2', points: [P(160, 100), P(250, 100), P(250, 300), P(400, 300)] },
      { id: 'W3', points: [P(160, 100), P(160, 200), P(400, 200)] });
    const doc = normalizeDoc(inv);
    assert.deepEqual(junctionAt(doc, P(160, 100)).pins, [P(160, 100)]);
    const pinned = same(doc, P(160, 100), P(200, 140), lang);
    assert.deepEqual(wires(pinned), { W1: '60,100 80,100', W2: '200,140 250,140 250,300 400,300', W3: '200,140 200,200 400,200', W4: '160,100 200,100 200,140' });
    // a bus of 8 bits: its width the same
    const bus = tee(lang, 8);
    const moved = same(bus, P(200, 200), P(240, 200), lang);
    assert.deepEqual(netlist(moved).nets.map(n => n.width), [8]);
  }
});

test('#3806 a net name on an end segment stays on it: a jog from the dot instead', () => {
  const doc = tee();
  doc.labels.push({ id: 'L1', net: 'mid', x: 150, y: 200 });
  const r = moveJunction(normalizeDoc(doc), P(200, 200), P(200, 230));
  assert.deepEqual([r.short, r.kept], [null, true]);
  assert.equal(wires(r.doc).W1, '100,200 200,200 200,230');
  square(r.doc);
  const nl = netlist(r.doc);
  assert.equal(nl.labelNet.get('L1'), nl.portNet.get('P1'), 'the name on a\'s net');
  // the wires with no move (junctionWires): as they were, nothing added
  const j = junctionAt(doc, P(200, 200));
  assert.deepEqual(junctionWires(doc, P(200, 200), j, 0, 0), { wires: doc.wires, added: null });
});

test('#3806 refused or said: a short of two named nets, an unnamed net joined, no dot there, off the grid', () => {
  // a wire from b ending free at (300, 200): the dot moved onto it would join a and b
  const doc = tee();
  doc.ports.push(port('P4', 'b', 'in', 300, 400));
  doc.wires.push({ id: 'W4', points: [P(300, 400), P(300, 200)] });
  const d = normalizeDoc(doc), before = JSON.stringify(d);
  const r = moveJunction(d, P(200, 200), P(300, 200));
  assert.deepEqual(r.short, ['a', 'b']);
  assert.equal(JSON.stringify(r.doc), before, 'the document as it was');
  assert.equal(JSON.stringify(d), before, 'not changed');
  assert.equal(shortText('The move', r.short), "The move would short net 'a' and net 'b': two named nets cannot be joined. Rename one of them first (the same name connects them).");
  // the unnamed net between two inverters: joined to a's, said
  const u = tee();
  u.symbols.push({ id: 'S1', type: 'inv', x: 300, y: 390, rot: 0, mirror: false, name: 'U1', params: { width: 1 } },
    { id: 'S2', type: 'inv', x: 500, y: 390, rot: 0, mirror: false, name: 'U2', params: { width: 1 } });
  u.wires.push({ id: 'W4', points: [P(380, 400), P(440, 400)] }, { id: 'W5', points: [P(440, 400), P(500, 400)] });
  const k = moveJunction(normalizeDoc(u), P(200, 200), P(440, 400));
  assert.deepEqual([k.short, k.kept], [null, false]);
  assert.match(CONNECTIONS_CHANGED, /^Connections changed by this move/);
  assert.throws(() => moveJunction(tee(), P(200, 100), P(200, 150)), { message: 'no junction dot at (200, 100)' });
  assert.throws(() => moveJunction(tee(), P(200, 200), P(205, 150)), { message: '(205, 150) is not on the grid (every 10)' });
  assert.throws(() => moveJunction(tee(), P(200, 200), P(NaN, 150)), { message: '(NaN, 150) is not on the grid (every 10)' });
  // no move: the same document
  const z = moveJunction(tee(), P(200, 200), P(200, 200));
  assert.deepEqual([wires(z.doc), z.kept], [wires(tee()), true]);
});
