// #2970: the net names of a schematic made from HDL (core/schdoc-place.js, netLabels) placed on one wire grid, a net's
// own wires taken out while its name is placed, no longer on a grid built anew for each name: the same places as the
// grid built for each name (the reference below, the code before #2970) on every example's drawings (its top level and
// its instances, as View RTL Schematic draws them, and the top level converted to a schematic), and in a fraction of
// its time.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { primitiveSources } from '../core/unisim.js';
import { key, netlist, schematicFromHdl, modulesFromLibrary } from '../core/schdoc.js';
import { netLabels } from '../core/schdoc-place.js';
import { segPoints, wireGrid } from '../core/schpath.js';
import { convertModuleToSchematic } from '../core/hdl-to-sch.js';
import { example, EXAMPLES } from './examples-lib.mjs';

const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
const layout = g => elk.layout(g);

// the reference: a grid of every symbol, marker, name placed so far and wire but the net's own, built for each name
function reference(doc, wires, labelAt, modules) {
  const labels = [];
  for (const { L, ids, net } of labelAt) {
    const g = wireGrid({ symbols: doc.symbols, ports: doc.ports, labels, wires: wires.filter(w => !ids.has(w.id)) }, { modules });
    const pts = [];
    for (let i = 0; i + 1 < L.length; i++) for (const q of segPoints(L[i], L[i + 1])) if (!pts.some(p => p.x === q.x && p.y === q.y)) pts.push(q);
    const free = pts.slice(1).filter(q => { const k = key(q.x, q.y); return !g.h.has(k) && !g.v.has(k) && !g.vtx.has(k) && !g.labels.has(k) && !g.fixed.has(k); });
    const q = free.find(p => Math.abs(p.x - L[0].x) + Math.abs(p.y - L[0].y) >= 20) || free[0] || pts[Math.min(2, pts.length - 1)];
    labels.push({ id: `L${labels.length + 1}`, x: q.x, y: q.y, net });
  }
  return labels;
}

// a drawing's nets as netLabels takes them: each named net's wires, the name on its first wire from either end
function labelInput(doc, modules) {
  const nl = netlist(doc, { modules });
  const byNet = new Map();
  for (const w of doc.wires) {
    const n = nl.wireNet.get(w.id);
    if (!n) continue;
    let l = byNet.get(n); if (!l) byNet.set(n, l = []); l.push(w);
  }
  const at = [];
  let k = 0;
  for (const [n, ws] of byNet) {
    const ids = new Set(ws.map(w => w.id));
    at.push({ L: k++ % 2 ? ws[0].points.slice().reverse() : ws[0].points, ids, net: n.name || `n${k}` });
  }
  return { doc: { symbols: doc.symbols, ports: doc.ports }, wires: doc.wires, at };
}

// every example's drawings: its top level and its instances, as View RTL Schematic draws them, and its top converted
async function drawings(name) {
  const ex = example(name);
  const srcs = [...primitiveSources(ex.design), ...ex.design];
  const lib = compile(srcs);
  const d = elaborate(lib, ex.project.top);
  const sources = Object.fromEntries(srcs.map(x => [x.path, x.text]));
  const modules = modulesFromLibrary(lib, { sources, asWritten: true });
  const lang = d.top.mod?.lang || 'vhdl';
  const out = [{ what: `${name}: top`, doc: await schematicFromHdl(d.top, { sources, modules, layout, lang }), modules }];
  for (const c of d.top.children.filter(c => c.mod)) out.push({ what: `${name}: ${c.name}`, doc: await schematicFromHdl(c, { sources, modules, layout, lang: c.mod.lang || lang }), modules });
  const conv = await convertModuleToSchematic({ sources: ex.design, module: ex.project.top, layout });
  out.push({ what: `${name}: converted`, doc: conv.doc, modules: {} });
  return out;
}

const timeOf = f => { const t0 = performance.now(); const r = f(); return [r, performance.now() - t0]; };

for (const name of EXAMPLES) {
  test(`netLabels: the names of ${name}'s drawings where the grid built for each name puts them`, { timeout: 120000 }, async () => {
    let names = 0;
    for (const { what, doc, modules } of await drawings(name)) {
      const { doc: d, wires, at } = labelInput(doc, modules);
      const got = netLabels(d, wires, at, modules);
      assert.deepEqual(got, reference(d, wires, at, modules), what);
      assert.equal(got.length, at.length, what);
      names += got.length;
      // the wires as they were (netLabels takes a net's out and puts them back, never changes them)
      assert.deepEqual(wires, doc.wires, what);
    }
    assert.ok(names > 0, `${name}: no names placed`);
  });
}

test('netLabels: names on the same points, on a pin, on another net\'s wire: the grid sees the names placed before', () => {
  // three nets along y = 100 from x = 0 to 200, net b's wire over a's, a pin of no symbol: two markers at the ends
  const doc = { symbols: [], ports: [{ id: 'P1', name: 'i', dir: 'in', width: 1, x: 0, y: 100 }, { id: 'P2', name: 'o', dir: 'out', width: 1, x: 200, y: 100 }] };
  const wires = [
    { id: 'W1', points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] },
    { id: 'W2', points: [{ x: 0, y: 100 }, { x: 200, y: 100 }] },
    { id: 'W3', points: [{ x: 0, y: 100 }, { x: 0, y: 200 }, { x: 200, y: 200 }] },
    { id: 'W4', points: [{ x: 200, y: 200 }, { x: 0, y: 200 }] },
  ];
  const at = [
    { L: wires[0].points, ids: new Set(['W1']), net: 'a' },
    { L: wires[1].points, ids: new Set(['W2']), net: 'b' },
    { L: wires[0].points, ids: new Set(['W1']), net: 'a2' },
    { L: wires[2].points, ids: new Set(['W3']), net: 'c' },
    { L: wires[3].points, ids: new Set(['W4', 'W9']), net: 'd' },   // (an id of no wire: none taken out for it)
  ];
  const got = netLabels(doc, wires, at, {});
  assert.deepEqual(got, reference(doc, wires, at, {}));
  assert.deepEqual(got.map(l => [l.id, l.net]), [['L1', 'a'], ['L2', 'b'], ['L3', 'a2'], ['L4', 'c'], ['L5', 'd']]);
  // (a and b on each other's wire: no free point, the third one; a2 the same; c on its own wire, past the first 20)
  assert.deepEqual(got.map(l => [l.x, l.y]), [[20, 100], [20, 100], [20, 100], [0, 120], [180, 200]]);
});

test('netLabels: the names of the largest example drawing placed in a fraction of the grid-per-name time', { timeout: 120000 }, async () => {
  // (micro80's: a ratio measured in the same process, netLabels' best of three runs against one of the reference: robust
  // to a loaded machine)
  const big = (await drawings('micro80')).map(x => ({ ...x, ...labelInput(x.doc, x.modules) }))
    .sort((a, b) => b.at.length * b.wires.length - a.at.length * a.wires.length)[0];
  const tNew = Math.min(...[0, 1, 2].map(() => timeOf(() => netLabels(big.doc, big.wires, big.at, big.modules))[1]));
  const tRef = timeOf(() => reference(big.doc, big.wires, big.at, big.modules))[1];
  assert.ok(big.at.length >= 30, `${big.what}: ${big.at.length} names`);
  assert.ok(tNew * 5 < tRef, `${big.what} (${big.at.length} names, ${big.wires.length} wires): ${tNew.toFixed(1)} ms against ${tRef.toFixed(1)} ms`);
});
