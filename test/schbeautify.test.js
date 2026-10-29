// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
//
// #1481: Beautify, the schematic's wires drawn again for a clearer drawing. Only the wires' paths change: the symbols,
// the markers, the net names, every wire's ends and T junctions stay, and so do the netlist and the generated HDL
// (VHDL and Verilog). The sheet never gets more bends, crossings or clashes; a wire through a symbol is routed around it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compile, elaborate } from '../core/compile.js';
import * as sd from '../core/schdoc.js';
import { beautifyWires, wireStats } from '../core/schbeautify.js';
import { wireClashes } from '../core/schpath.js';
import { moveSegment, connectivity } from '../core/schroute.js';
import { convertModuleToSchematic } from '../core/hdl-to-sch.js';
import { schematicFromTable } from '../core/logic.js';
import { importIseSch } from '../core/isesch.js';
import { example, EXAMPLES } from './examples-lib.mjs';

const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
const layout = g => elk.layout(g);

const P = (x, y) => ({ x, y });
const port = (id, name, dir, x, y) => ({ id, name, dir, width: 1, x, y });
// the meaning of a schematic: its nets (as their pins and markers), its diagnostics, its HDL in both languages
function meaning(doc, modules = {}) {
  const d = sd.normalizeDoc(structuredClone(doc), { modules });
  const nl = sd.netlist(d, { modules });
  return {
    nets: nl.nets.map(n => `${n.name}: ${n.endpoints.map(e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`)).sort().join(' ')}`).sort(),
    diags: nl.diagnostics.map(x => `${x.severity}: ${x.message}`),
    vhdl: sd.generateHdl(structuredClone(d), { lang: 'vhdl', modules }).code,
    verilog: sd.generateHdl({ ...structuredClone(d), lang: 'verilog' }, { lang: 'verilog', modules }).code,
  };
}
const others = doc => ({ symbols: doc.symbols, ports: doc.ports, labels: doc.labels });
// beautified: the same meaning, the symbols, markers and names where they were, every wire's ends the same, no more
// bends, crossings or clashes of any kind; returns the measures before and after
function check(doc, modules, what) {
  const m0 = meaning(doc, modules), o0 = structuredClone(others(doc)), s0 = wireStats(doc, { modules });
  const ends0 = doc.wires.map(w => [w.id, w.points[0], w.points.at(-1)]);
  const r = beautifyWires(doc, { modules });
  const s1 = wireStats(doc, { modules });
  assert.deepEqual(meaning(doc, modules), m0, `${what}: the netlist and the HDL the same`);
  assert.deepEqual(others(doc), o0, `${what}: the symbols, the markers and the names where they were`);
  assert.deepEqual(doc.wires.map(w => [w.id, w.points[0], w.points.at(-1)]), ends0, `${what}: the wires' ends the same`);
  assert.ok(s1.bends <= s0.bends, `${what}: bends ${s0.bends} -> ${s1.bends}`);
  assert.ok(s1.crossings <= s0.crossings, `${what}: crossings ${s0.crossings} -> ${s1.crossings}`);
  for (const k of new Set([...Object.keys(s0.clashes), ...Object.keys(s1.clashes)])) {
    assert.ok((s1.clashes[k] || 0) <= (s0.clashes[k] || 0), `${what}: ${k} clashes ${s0.clashes[k] || 0} -> ${s1.clashes[k] || 0}`);
  }
  for (const id of r.changed) {
    const pts = doc.wires.find(w => w.id === id).points;
    assert.ok(pts.every((p, i) => !i || p.x === pts[i - 1].x || p.y === pts[i - 1].y), `${what}: ${id} orthogonal`);
  }
  return { s0, s1, r };
}

// ------------------------------------------------------------------ small drawings
// a -> y drawn with a detour, b -> z straight below it
function detour() {
  const doc = sd.newDoc('detour', 'vhdl');
  doc.ports.push(port('P1', 'a', 'in', 100, 100), port('P2', 'y', 'out', 400, 100), port('P3', 'b', 'in', 100, 300), port('P4', 'z', 'out', 400, 300));
  doc.wires.push({ id: 'W1', points: [P(100, 100), P(150, 100), P(150, 200), P(250, 200), P(250, 100), P(400, 100)] });
  doc.wires.push({ id: 'W2', points: [P(100, 300), P(400, 300)] });
  return sd.normalizeDoc(doc);
}

test('#1481 a wire with a detour drawn straight, the other wire as it was', () => {
  const doc = detour();
  const { s0, s1, r } = check(doc, {}, 'detour');
  assert.deepEqual(r.changed, ['W1']);
  assert.deepEqual(doc.wires[0].points, [P(100, 100), P(400, 100)]);
  assert.deepEqual(doc.wires[1].points, [P(100, 300), P(400, 300)]);
  assert.deepEqual([s0.bends, s1.bends], [4, 0]);
  // a second time: nothing to do
  assert.deepEqual(beautifyWires(doc).changed, []);
});

test('#1481 a net name on a wire stays where it is, and the wire still passes through it; a junction (wires\' ends) stays', () => {
  const doc = detour();
  doc.labels.push({ id: 'L1', x: 120, y: 100, net: 'mid' });
  // y's wire in two at a junction (240,100) with a third wire down to b's
  doc.wires[0].points = [P(100, 100), P(150, 100), P(150, 200), P(240, 200), P(240, 100)];
  doc.ports.push(port('P5', 'w', 'out', 400, 220));
  doc.wires.push({ id: 'W3', points: [P(240, 100), P(400, 100)] }, { id: 'W4', points: [P(240, 100), P(240, 160), P(300, 160), P(300, 220), P(400, 220)] });
  const m0 = meaning(doc);
  assert.deepEqual(m0.nets.filter(n => n.includes('P2')), ['a: port:P1 port:P2 port:P5'], 'a, y and w one net');
  const { r } = check(doc, {}, 'junction');
  assert.deepEqual(r.changed.sort(), ['W1', 'W4']);
  assert.deepEqual(doc.labels, [{ id: 'L1', x: 120, y: 100, net: 'mid' }]);
  assert.deepEqual(doc.wires[0].points, [P(100, 100), P(240, 100)], 'through the name, to the junction');
  assert.deepEqual(doc.wires[2].points, [P(240, 100), P(400, 100)]);
  assert.equal(doc.wires[3].points[0].x, 240, 'from the junction');
  assert.ok(doc.wires[3].points.length <= 4, `fewer bends: ${JSON.stringify(doc.wires[3].points)}`);
});

test('#1481 a wire through a symbol routed around it (orthogonal, nothing crossed), the pin it passed over not connected', () => {
  let doc = sd.newDoc('body', 'vhdl');
  doc.ports.push(port('P1', 'a', 'in', 100, 100), port('P2', 'y', 'out', 400, 100));
  doc.symbols.push({ id: 'S1', type: 'and2', x: 220, y: 70, rot: 0, mirror: false, name: 'g1', params: { width: 1 } });
  doc.wires.push({ id: 'W1', points: [P(100, 100), P(400, 100)] });
  doc = sd.normalizeDoc(doc);
  assert.deepEqual(wireStats(doc).clashes, { pin: 1, body: 7 });
  const m0 = meaning(doc);
  assert.deepEqual(beautifyWires(doc).changed, ['W1']);
  assert.deepEqual(wireClashes(doc), []);
  assert.deepEqual(wireStats(doc), { bends: 4, crossings: 0, diagonals: 0, clashes: {} });
  assert.deepEqual(meaning(doc), m0);
});

test('#1481 only the wires asked for (the selection) change; a rerouted wire\'s own curve is dropped, the others\' kept', () => {
  const doc = detour();
  doc.ports.push(port('P5', 'c', 'in', 100, 400), port('P6', 'x', 'out', 400, 400));
  doc.wires.push({ id: 'W3', points: [P(100, 400), P(200, 400), P(200, 450), P(300, 450), P(300, 400), P(400, 400)], curve: [{ u: 0.5, v: 10 }] });
  doc.wires[0].curve = [{ u: 0.5, v: -20 }];
  const w3 = structuredClone(doc.wires[2]);
  assert.deepEqual(beautifyWires(doc, { only: ['W1'] }).changed, ['W1']);
  assert.equal(doc.wires[0].curve, undefined);
  assert.deepEqual(doc.wires[2], w3, 'W3 not asked for: as it was, its curve too');
  assert.deepEqual(beautifyWires(doc, { only: ['W3'] }).changed, ['W3']);
  assert.deepEqual(doc.wires[2].points, [P(100, 400), P(400, 400)]);
  assert.deepEqual(beautifyWires(doc, { only: [] }).changed, [], 'nothing asked for: nothing changes');
});

test('#1481 nothing to draw: an empty sheet, a sheet with no wires', () => {
  const doc = sd.normalizeDoc(sd.newDoc('empty', 'verilog'));
  assert.deepEqual(beautifyWires(doc), { changed: [] });
  assert.deepEqual(wireStats(doc), { bends: 0, crossings: 0, diagonals: 0, clashes: {} });
});

// ------------------------------------------------------------------ the corpus
test('#1481 the gates example\'s schematic, the truth tables\' gate schematics and the ISE schematics: the same meaning, never worse', () => {
  check(sd.normalizeDoc(JSON.parse(fs.readFileSync(new URL('../examples/gates/src/gates.sch.json', import.meta.url), 'utf8'))), {}, 'gates.sch.json');
  const lamps = JSON.parse(fs.readFileSync(new URL('../examples/traffic/src/lamps.bool.json', import.meta.url), 'utf8'));
  for (const form of ['sop', 'pos', 'nand', 'nor', 'xor']) for (const lang of ['vhdl', 'verilog']) {
    check(sd.normalizeDoc(schematicFromTable(lamps, { form, lang })), {}, `lamps ${form} ${lang}`);
  }
  const dir = new URL('./fixtures/ise-sch/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sch'))) {
    const r = importIseSch(fs.readFileSync(new URL(f, dir), 'utf8'), { name: f.replace(/\.sch$/, '') });
    const { s0, s1 } = check(sd.normalizeDoc(r.doc || r), {}, f);
    // (MyAND2b4: its buses run through their slices' bodies, as ISE draws a bus tap: left as they are)
    assert.deepEqual(s1.clashes, s0.clashes, `${f}: the clashes`);
  }
});

for (const name of EXAMPLES) {
  test(`#1481 every module of the example ${name} as a schematic (with ELK's layout and without): the same meaning, never worse`, async () => {
    const ex = example(name);
    const lib = compile(ex.sources);
    const files = new Set(ex.sources.map(s => s.path));
    const texts = Object.fromEntries(ex.sources.map(s => [s.path, s.text]));
    const modules = sd.modulesFromLibrary(lib, { sources: texts });
    for (const m of [...lib.modules.values()].filter(m => files.has(m.archFile || m.file))) {
      const r = await convertModuleToSchematic({ sources: ex.sources, module: m.name, layout });
      const { s1 } = check(sd.normalizeDoc(r.doc), modules, `${name}/${m.name}`);
      assert.deepEqual(s1.clashes, {}, `${name}/${m.name}: no clash`);
      check(sd.normalizeDoc(await sd.schematicFromHdl(elaborate(lib, m.name).top, { sources: texts, modules, lang: m.lang })), modules, `${name}/${m.name} without a layout`);
    }
  });
}

// a drawing made untidy: a middle segment of every wire it can be done to pushed aside (a detour), the connections and
// the clashes the same
function untidy(doc, modules) {
  const c0 = JSON.stringify(connectivity(doc, modules)), k0 = wireClashes(doc, { modules }).length;
  let n = 0;
  for (const w of doc.wires) {
    if (w.points.length < 2) continue;
    for (const d of [40, -40, 70]) {
      const old = w.points;
      w.points = [old[0], ...moveSegment(old, Math.floor((old.length - 1) / 2), d, {}).slice(1)];
      if (wireClashes(doc, { modules }).length === k0 && JSON.stringify(connectivity(doc, modules)) === c0) { n++; break; }
      w.points = old;
    }
  }
  return n;
}

test('#1481 the examples\' top schematics made untidy: Beautify takes many bends and crossings off, the meaning the same', async () => {
  for (const name of ['gates', 'blinky', 'stopwatch', 'pong']) {
    const ex = example(name);
    const lib = compile(ex.sources);
    const modules = sd.modulesFromLibrary(lib, { sources: Object.fromEntries(ex.sources.map(s => [s.path, s.text])) });
    const doc = sd.normalizeDoc((await convertModuleToSchematic({ sources: ex.sources, module: ex.project.top, layout })).doc, { modules });
    const tidy = wireStats(doc, { modules });
    assert.ok(untidy(doc, modules) >= 20, `${name}: made untidy`);
    const { s0, s1, r } = check(doc, modules, `${name} untidy`);
    assert.ok(r.changed.length >= 10, `${name}: ${r.changed.length} wires drawn again`);
    assert.ok(s1.bends < s0.bends && s1.crossings < s0.crossings, `${name}: bends ${s0.bends} -> ${s1.bends}, crossings ${s0.crossings} -> ${s1.crossings}`);
    assert.ok(s1.bends <= tidy.bends * 1.05, `${name}: about as tidy as ELK's drawing (bends ${tidy.bends}, now ${s1.bends})`);
    assert.deepEqual(s1.clashes, {}, `${name}: no clash`);
  }
});
