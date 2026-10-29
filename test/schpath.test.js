// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
//
// #948: schematic wires avoid overlapping. A path never runs along another wire, never passes over a pin, an I/O
// marker, a net name or another wire's end or bend, never enters a body; it may cross a wire at a right angle. A wire
// drawn by hand is nudged onto a clear path, the wires a move or a paste left overlapping are routed again, and the
// schematics made from HDL or from a truth table come out clear. Only the drawn paths change: the netlist and the
// generated HDL (VHDL and Verilog) are the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compile, elaborate } from '../core/compile.js';
import * as sd from '../core/schdoc.js';
import { wireGrid, routePath, pathViolations, wireClashes, nudgeWire, untangleWires, untangleNew } from '../core/schpath.js';
import { rerouteAfterMove, placementClashes, connectivity } from '../core/schroute.js';
import { convertModuleToSchematic } from '../core/hdl-to-sch.js';
import { schematicFromTable } from '../core/logic.js';
import { example, EXAMPLES } from './examples-lib.mjs';

const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
const layout = g => elk.layout(g);

const P = (x, y) => ({ x, y });
const inv = (id, name, x, y) => ({ id, type: 'inv', x, y, rot: 0, mirror: false, name, params: { width: 1 } });
const port = (id, name, dir, x, y) => ({ id, name, dir, width: 1, x, y });
const kinds = c => [...new Set(c.map(x => x.kind))].sort();
// the steps of a path, for "no shared segment"
const steps = pts => {
  const out = new Set();
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i], b = pts[i + 1], dx = Math.sign(b.x - a.x) * 10, dy = Math.sign(b.y - a.y) * 10;
    for (let x = a.x, y = a.y; x !== b.x || y !== b.y; x += dx, y += dy) out.add([`${x},${y}`, `${x + dx},${y + dy}`].sort().join('|'));
  }
  return out;
};
const shared = (p, q) => [...steps(p)].filter(s => steps(q).has(s));
const onPath = (pts, p) => pts.some((a, i) => i + 1 < pts.length && sd.onSeg(p, a, pts[i + 1]));
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
// the document with one more wire drawn (pts as given, or nudged)
const withWire = (doc, id, pts) => { const d = structuredClone(doc); d.wires.push({ id, points: pts }); return d; };

// a -> y along y = 100; the wire from b to z drawn with a leg on it
function twoWires() {
  const doc = sd.newDoc('two', 'vhdl');
  doc.ports.push(port('P1', 'a', 'in', 100, 100), port('P2', 'y', 'out', 400, 100), port('P3', 'b', 'in', 100, 200), port('P4', 'z', 'out', 400, 40));
  doc.wires.push({ id: 'W1', points: [P(100, 100), P(400, 100)] });
  return doc;
}

test('#948 two wires that overlapped: the wire drawn along another is nudged off it, its ends and the nets the same', () => {
  const doc = twoWires();
  const drawn = [P(100, 200), P(200, 200), P(200, 100), P(300, 100), P(300, 40), P(400, 40)];
  const before = withWire(doc, 'W2', drawn);
  assert.deepEqual(kinds(wireClashes(before)), ['overlap', 'touch'], 'drawn as it was: along W1, its bends on it');
  assert.ok(shared(drawn, doc.wires[0].points).length > 0);
  const pts = nudgeWire(doc, drawn);
  assert.deepEqual([pts[0], pts.at(-1)], [P(100, 200), P(400, 40)], 'the ends stay');
  const after = withWire(doc, 'W2', pts);
  assert.deepEqual(wireClashes(after), [], 'no clash');
  assert.deepEqual(shared(pts, doc.wires[0].points), [], 'no shared segment');
  assert.ok(pts.every((p, i) => i === 0 || p.x === pts[i - 1].x || p.y === pts[i - 1].y), 'square');
  // a right-angle crossing of W1 is allowed: the nudged path crosses it once, it does not run along it
  const m0 = meaning(before), m1 = meaning(after);
  assert.deepEqual(m1, m0, 'the same nets, warnings and HDL');
  assert.deepEqual(m1.nets, ['a: port:P1 port:P2', 'b: port:P3 port:P4']);
  assert.deepEqual(m1.diags, [], 'no warnings');
});

test('#948 a wire drawn across a symbol, over its pins: nudged around the symbol, no pin crossed, the same netlist', () => {
  const doc = sd.newDoc('pins', 'verilog');
  doc.symbols.push(inv('S1', 'U1', 200, 290));
  const [I, O] = ['I', 'O'].map(n => sd.symbolPins(doc.symbols[0], {}).find(p => p.name === n));
  assert.deepEqual([I, O].map(p => [p.x, p.y]), [[200, 300], [280, 300]]);
  doc.ports.push(port('P1', 'd', 'in', 100, 300), port('P2', 'e', 'out', 400, 300));
  const drawn = [P(100, 300), P(400, 300)];
  const before = withWire(doc, 'W1', drawn);
  assert.deepEqual(kinds(wireClashes(before)), ['body', 'pin']);
  const pts = nudgeWire(doc, drawn);
  const after = withWire(doc, 'W1', pts);
  assert.deepEqual(wireClashes(after), []);
  assert.ok(!onPath(pts.slice(1, -1).length ? pts : [], I) && !onPath(pts, O), 'over neither pin');
  const box = sd.symbolBox(doc.symbols[0], {});
  assert.ok(pts.every((p, i) => i === 0 || !pts[i - 1] || ![...steps([pts[i - 1], p])].some(s => s.split('|').some(k => {
    const [x, y] = k.split(',').map(Number); return x > box.x && x < box.x + box.w && y > box.y && y < box.y + box.h;
  }))), 'never inside the body');
  // (in both: U1 left unconnected, the wire d -> e; Verilog's warnings the same)
  const m0 = meaning(before), m1 = meaning(after);
  assert.deepEqual(m1, m0);
  assert.deepEqual(m1.nets, ['d: port:P1 port:P2', 'net_1: S1.I', 'net_2: S1.O']);
});

test('#948 a wire through a body, on no pin: routed around the symbol; a clear wire is left as drawn', () => {
  const doc = sd.newDoc('around', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 200, 290));
  doc.ports.push({ ...port('P1', 'f', 'in', 230, 200), side: 'N' }, { ...port('P2', 'g', 'out', 230, 400), side: 'S' });
  const drawn = [P(230, 200), P(230, 400)];
  assert.deepEqual(kinds(wireClashes(withWire(doc, 'W1', drawn))), ['body']);
  const pts = nudgeWire(doc, drawn);
  assert.notDeepEqual(pts, drawn);
  assert.deepEqual(wireClashes(withWire(doc, 'W1', pts)), []);
  assert.deepEqual(meaning(withWire(doc, 'W1', pts)), meaning(withWire(doc, 'W1', drawn)));
  // drawn beside the symbol: kept as it is
  const clear = [P(230, 200), P(230, 250), P(300, 250), P(300, 350), P(230, 350), P(230, 400)];
  assert.deepEqual(nudgeWire(doc, clear), clear);
});

test('#948 the router: out of a pin and into one by their sides, around bodies, never along a wire nor bending on one', () => {
  const doc = sd.newDoc('r', 'vhdl');
  doc.symbols.push(inv('S1', 'U1', 200, 290), inv('S2', 'U2', 100, 290));
  doc.wires.push({ id: 'W1', points: [P(300, 200), P(300, 400)] });   // a wire to cross
  const g = wireGrid(doc);
  // U1.O (280, 300) back to U2.I (100, 300): leaves east, arrives from the west, around both bodies
  const pts = routePath(g, P(280, 300), P(100, 300));
  assert.ok(pts, 'a path');
  assert.equal(pts[1].x > 280 && pts[1].y === 300, true, `leaves U1.O eastwards: ${JSON.stringify(pts)}`);
  assert.equal(pts.at(-2).x < 100 && pts.at(-2).y === 300, true, 'enters U2.I from the west');
  assert.deepEqual(pathViolations(g, pts), []);
  // a path that would only run along the wire: none found inside it, around it instead
  const along = routePath(g, P(300, 200), P(300, 400));
  assert.ok(along && shared(along, doc.wires[0].points).length === 0);
  // the rules, one by one
  assert.deepEqual(kinds(pathViolations(g, [P(280, 250), P(320, 250)])), [], 'a right-angle crossing');
  assert.deepEqual(kinds(pathViolations(g, [P(250, 250), P(300, 250), P(300, 280)])), ['overlap', 'touch'], 'a bend on the wire, along it');
  assert.deepEqual(kinds(pathViolations(g, [P(150, 280), P(150, 320)])), ['body']);
  assert.deepEqual(kinds(pathViolations(g, [P(180, 300), P(200, 300), P(200, 330)])), ['pin']);
  assert.deepEqual(kinds(pathViolations(g, [P(300, 180), P(300, 200), P(320, 200)])), ['touch'], 'over the wire\'s end');
  assert.deepEqual(kinds(pathViolations(g, [P(400, 100), P(500, 100), P(500, 150), P(450, 150), P(450, 100), P(460, 100)])), ['self']);
});

test('#948 untangleWires: an overlapping wire routed again, its id, ends and net name kept, the meaning the same', () => {
  const doc = twoWires();
  doc.wires.push({ id: 'W2', points: [P(100, 200), P(200, 200), P(200, 100), P(300, 100), P(300, 40), P(400, 40)] });
  // a second net name on W2, on its part off W1 (W2's net named n)
  doc.ports[1].name = 'y'; doc.ports[3].name = 'z';
  doc.labels.push({ id: 'L1', x: 150, y: 200, net: 'b' });
  const m0 = meaning(doc);
  const r = untangleWires(doc);
  assert.deepEqual(r, { rerouted: ['W1', 'W2'].filter(id => r.rerouted.includes(id)), left: [] });
  assert.equal(r.rerouted.length, 1);
  assert.deepEqual(wireClashes(doc), []);
  assert.deepEqual(doc.wires.map(w => [w.id, w.points[0], w.points.at(-1)]), [['W1', P(100, 100), P(400, 100)], ['W2', P(100, 200), P(400, 40)]]);
  assert.ok(onPath(doc.wires[1].points, doc.labels[0]), 'the net name on its wire');
  assert.deepEqual(meaning(doc), m0);
});

test('#948 untangleNew: only the clashes an edit made are routed away, the drawing\'s old ones left as they were', () => {
  const before = twoWires();
  before.ports.push(port('P5', 'c', 'in', 100, 300), port('P6', 'w', 'out', 400, 300));
  before.wires.push({ id: 'W2', points: [P(100, 200), P(200, 200), P(200, 100), P(300, 100), P(300, 40), P(400, 40)] });   // old overlap
  const doc = structuredClone(before);
  doc.wires.push({ id: 'W3', points: [P(100, 300), P(100, 200), P(250, 200), P(250, 300), P(400, 300)] });   // new: over b, along W2
  const m0 = meaning(doc);
  const r = untangleNew(before, doc, { prefer: ['W3'] });
  assert.deepEqual(r, { rerouted: ['W3'], left: [] });
  assert.deepEqual(doc.wires[1], before.wires[1], 'W2 as it was');
  assert.deepEqual([...new Set(wireClashes(doc).map(c => c.wire))].sort(), ['W1', 'W2'], 'the old clash only');
  assert.deepEqual(meaning(doc), m0);
});

// ------------------------------------------------------------------ moves
const BX = new URL('../examples/blinky/', import.meta.url);
const bfiles = ['src/top.vhd', 'src/knight.vhd', 'src/counter.v', 'src/speed_ctrl.vhd'];
const bsources = Object.fromEntries(bfiles.map(f => [f, fs.readFileSync(new URL(f, BX), 'utf8')]));
const blib = compile(Object.entries(bsources).map(([path, text]) => ({ path, text })));
const bmodules = sd.modulesFromLibrary(blib, { sources: bsources });

test('#948 moving each symbol of the blinky top schematic: no wire left along another, over a pin or through a body', async () => {
  const orig = sd.normalizeDoc(await sd.schematicFromHdl(elaborate(blib, 'top').top, { sources: bsources, modules: bmodules, layout, lang: 'vhdl' }));
  assert.deepEqual(wireClashes(orig, { modules: bmodules }), []);
  let tried = 0, untangled = 0;
  for (const s of orig.symbols) for (const [dx, dy] of [[70, 50], [-60, 30], [40, -80], [0, 40]]) {
    const doc = structuredClone(orig);
    const sym = doc.symbols.find(x => x.id === s.id);
    const moved = new Set(sd.symbolPins(sym, bmodules).map(p => `${p.x},${p.y}`));
    const attach = [];
    for (const w of doc.wires) {
      const a = moved.has(`${w.points[0].x},${w.points[0].y}`), b = moved.has(`${w.points.at(-1).x},${w.points.at(-1).y}`);
      if (a || b) attach.push({ id: w.id, a, b });
    }
    sym.x += dx; sym.y += dy;
    if (placementClashes(doc, { moved: { symIds: new Set([s.id]), portIds: new Set() }, attachedIds: new Set(attach.map(a => a.id)), modules: bmodules })) continue;
    tried++;
    rerouteAfterMove(doc, { orig: structuredClone(orig), attached: attach, dx, dy, modules: bmodules });
    const conn = connectivity(sd.normalizeDoc(structuredClone(doc)), bmodules);
    if (untangleNew(orig, doc, { modules: bmodules, prefer: attach.map(a => a.id) }).rerouted.length) untangled++;
    assert.deepEqual(wireClashes(doc, { modules: bmodules }), [], `${s.name} moved by ${dx}, ${dy}`);
    assert.deepEqual(connectivity(sd.normalizeDoc(structuredClone(doc)), bmodules), conn, 'the same connections');
  }
  assert.ok(tried > 20, `tried ${tried}`);
  assert.ok(untangled >= 1, 'some move dropped a symbol on a wire that is not its own (routed around it)');
});

// ------------------------------------------------------------------ the examples and the generated schematics
// a stub: a wire with a net name at an end that touches nothing (a net the generator could not draw)
function stubs(doc, modules) {
  const at = new Map();
  const add = (p, w) => { const k = `${p.x},${p.y}`; at.set(k, (at.get(k) || 0) + 1); };
  for (const s of doc.symbols) for (const p of sd.symbolPins(s, modules)) add(p);
  for (const p of doc.ports) add(p);
  for (const w of doc.wires) { add(w.points[0]); add(w.points.at(-1)); }
  return doc.wires.filter(w => [w.points[0], w.points.at(-1)].some(p => at.get(`${p.x},${p.y}`) === 1 && doc.labels.some(l => l.x === p.x && l.y === p.y)));
}

test('#948 the examples\' schematics and truth tables\' gate schematics have no wire clash', () => {
  const gates = sd.normalizeDoc(JSON.parse(fs.readFileSync(new URL('../examples/gates/src/gates.sch.json', import.meta.url), 'utf8')));
  assert.deepEqual(wireClashes(gates), []);
  const lamps = JSON.parse(fs.readFileSync(new URL('../examples/traffic/src/lamps.bool.json', import.meta.url), 'utf8'));
  for (const form of ['sop', 'pos', 'nand', 'nor', 'xor']) for (const lang of ['vhdl', 'verilog']) {
    assert.deepEqual(wireClashes(schematicFromTable(lamps, { form, lang })), [], `lamps ${form} ${lang}`);
  }
});

for (const name of EXAMPLES) {
  test(`#948 every module of the example ${name} converts to a schematic with no wire clash (with ELK's layout and without)`, async () => {
    const ex = example(name);
    const lib = compile(ex.sources);
    const files = new Set(ex.sources.map(s => s.path));
    const texts = Object.fromEntries(ex.sources.map(s => [s.path, s.text]));
    const modules = sd.modulesFromLibrary(lib, { sources: texts });
    for (const m of [...lib.modules.values()].filter(m => files.has(m.archFile || m.file))) {
      const r = await convertModuleToSchematic({ sources: ex.sources, module: m.name, layout });
      const doc = sd.normalizeDoc(r.doc);
      assert.deepEqual(wireClashes(doc, { modules }), [], `${name}/${m.name}`);
      // a design's nets all drawn (a net name at a crossing joined two nets: the generator fell back to stubs);
      // a testbench's signals read by nothing have their stubs (#225)
      if (!/^tb_/.test(m.name)) assert.deepEqual(stubs(doc, modules).map(w => w.id), [], `${name}/${m.name}: no stub`);
      const plain = sd.normalizeDoc(await sd.schematicFromHdl(elaborate(lib, m.name).top, { sources: texts, modules, lang: m.lang }));
      assert.deepEqual(wireClashes(plain, { modules }), [], `${name}/${m.name} without a layout`);
    }
  });
}
