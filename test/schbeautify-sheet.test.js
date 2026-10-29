// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
//
// #1506: Beautify lays out the whole sheet, as Convert to Schematic does (core/schdoc-place.js, ELK's layout or its
// columns): the input markers on the left, the output markers on the right, the symbols by the flow of the signals with
// no two overlapping, the wires routed again. The connections are identical: the same nets (names, pins, markers), the
// same diagnostics, the same VHDL and Verilog; a layout that would change them is not taken (the wires only are drawn
// again then).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { compile, elaborate } from '../core/compile.js';
import * as sd from '../core/schdoc.js';
import { beautifySheet, sheetMeaning, overlaps } from '../core/schbeautify-sheet.js';
import { wireStats } from '../core/schbeautify.js';
import { routePath, wireGrid } from '../core/schpath.js';
import { convertModuleToSchematic } from '../core/hdl-to-sch.js';
import { schematicFromTable } from '../core/logic.js';
import { importIseSch } from '../core/isesch.js';
import { example, EXAMPLES } from './examples-lib.mjs';

const ELK = (await import('elkjs/lib/elk.bundled.js')).default;
const elk = new ELK();
const layout = g => elk.layout(g);

const P = (x, y) => ({ x, y });
const port = (id, name, dir, x, y) => ({ id, name, dir, width: 1, x, y });
// the meaning compared independently of the module: nets, diagnostics, HDL in both languages
function meaning(doc, modules = {}) {
  const d = sd.normalizeDoc(structuredClone(doc), { modules });
  const nl = sd.netlist(d, { modules });
  return {
    nets: nl.nets.map(n => `${n.name}: ${n.endpoints.map(e => (e.kind === 'pin' ? `${e.sym}.${e.pin}` : `port:${e.port}`)).sort().join(' ')}`).sort(),
    diags: nl.diagnostics.map(x => `${x.severity}: ${x.message}`).sort(),
    vhdl: sd.generateHdl(structuredClone(d), { lang: 'vhdl', modules }).code,
    verilog: sd.generateHdl({ ...structuredClone(d), lang: 'verilog' }, { lang: 'verilog', modules }).code,
  };
}
// the right edge of the input markers is left of the left edge of the output markers
function inputsLeft(doc) {
  const ins = doc.ports.filter(p => p.dir === 'in').map(p => sd.portBox(p)), outs = doc.ports.filter(p => p.dir === 'out').map(p => sd.portBox(p));
  if (!ins.length || !outs.length) return true;
  return Math.max(...ins.map(b => b.x + b.w)) < Math.min(...outs.map(b => b.x));
}
// laid out: the same meaning, no overlap, the inputs left of the outputs, every symbol upright, no clash of the wires;
// returns beautifySheet's answer and the document laid out
async function check(doc, modules, what, opts = { layout }) {
  doc = sd.normalizeDoc(doc, { modules });
  const m0 = meaning(doc, modules), ids0 = [doc.symbols.map(s => s.id), doc.ports.map(p => p.id)];
  const r = await beautifySheet(doc, { modules, ...opts });
  assert.deepEqual(meaning(doc, modules), m0, `${what}: the netlist and the HDL the same`);
  assert.deepEqual([doc.symbols.map(s => s.id), doc.ports.map(p => p.id)], ids0, `${what}: the same symbols and markers`);
  if (r.sheet) {
    assert.deepEqual(overlaps(doc, modules), [], `${what}: no overlap`);
    assert.ok(inputsLeft(doc), `${what}: the inputs left of the outputs`);
    assert.ok(doc.symbols.every(s => s.rot === 0 && !s.mirror), `${what}: upright`);
    assert.deepEqual(wireStats(doc, { modules }).clashes, {}, `${what}: no clash`);
  }
  return { ...r, doc };
}

// ------------------------------------------------------------------ a drawing made untidy
// y = not a (its net named ny), z = a and b: the gates turned round, the output markers on the left and the inputs on
// the right; its wires drawn by the editor's router
function untidy() {
  const doc = sd.newDoc('untidy', 'vhdl');
  doc.ports.push(port('P1', 'a', 'in', 600, 300), port('P2', 'b', 'in', 600, 420), port('P3', 'y', 'out', 80, 100), port('P4', 'z', 'out', 80, 240));
  doc.symbols.push({ id: 'S1', type: 'inv', x: 300, y: 280, rot: 90, mirror: false, name: 'g1', params: { width: 1 } },
    { id: 'S2', type: 'and2', x: 300, y: 400, rot: 180, mirror: false, name: 'g2', params: { width: 1 } });
  const pin = (s, n) => sd.symbolPins(doc.symbols.find(x => x.id === s), {}).find(p => p.name === n);
  const at = id => doc.ports.find(p => p.id === id);
  [[at('P1'), pin('S1', 'I')], [at('P1'), pin('S2', 'I0')], [at('P2'), pin('S2', 'I1')], [pin('S1', 'O'), at('P3')], [pin('S2', 'O'), at('P4')]].forEach(([a, b], i) => {
    const pts = routePath(wireGrid(doc), P(a.x, a.y), P(b.x, b.y));
    doc.wires.push({ id: `W${i + 1}`, points: pts });
  });
  const w4 = doc.wires[3].points;
  doc.labels.push({ id: 'L1', x: w4[1].x, y: w4[1].y, net: 'ny' });
  return sd.normalizeDoc(doc);
}

test('#1506 an untidy sheet laid out: inputs on the left, outputs on the right, the gates between them, no overlap; the meaning the same', async () => {
  const doc = untidy();
  assert.deepEqual(meaning(doc).nets, ['a: S1.I S2.I0 port:P1', 'b: S2.I1 port:P2', 'y: S1.O port:P3', 'z: S2.O port:P4']);
  assert.ok(meaning(doc).diags.includes("warning: net of I/O marker 'y' also named 'ny' (marker name used)"));
  assert.equal(inputsLeft(doc), false);
  const r = await check(doc, {}, 'untidy');
  assert.equal(r.sheet, true);
  const d = r.doc, x = id => d.symbols.find(s => s.id === id)?.x ?? d.ports.find(p => p.id === id).x;
  assert.ok(x('P1') < x('S1') && x('S1') < x('P3') && x('P2') < x('S2') && x('S2') < x('P4'), 'from the inputs to the outputs');
  assert.deepEqual(d.labels.map(l => l.net), ['ny'], 'the net name kept');
});

test('#1506 one Beautify after another: the second leaves the sheet as it is', async () => {
  const doc = untidy();
  await beautifySheet(doc, { layout });
  const once = JSON.stringify(doc);
  const r = await beautifySheet(doc, { layout });
  assert.equal(r.sheet, true);
  assert.equal(JSON.stringify(doc), once);
});

test('#1506 a layout that would change the nets is not taken: a net name on a wire attached to nothing stays, the wires only drawn again', async () => {
  const doc = untidy();
  doc.wires.push({ id: 'W9', points: [P(700, 600), P(800, 600)] });
  doc.labels.push({ id: 'L2', x: 750, y: 600, net: 'spare' });
  const d = sd.normalizeDoc(doc);
  const m0 = sheetMeaning(d);
  const r = await beautifySheet(d, { layout });
  assert.equal(r.sheet, false);
  assert.ok(r.changed.length > 0, 'its wires drawn again');
  assert.equal(sheetMeaning(d), m0);
  assert.deepEqual(d.labels.find(l => l.id === 'L2'), { id: 'L2', x: 750, y: 600, net: 'spare' });
});

test('#1506 an empty sheet: nothing to lay out', async () => {
  const doc = sd.normalizeDoc(sd.newDoc('empty', 'verilog'));
  assert.deepEqual(await beautifySheet(doc, { layout }), { sheet: false, changed: [] });
});

// ------------------------------------------------------------------ the corpus
test('#1506 the gates example\'s schematic, the truth tables\' gate schematics and ISE\'s schematics laid out: the same meaning', async () => {
  assert.equal((await check(JSON.parse(fs.readFileSync(new URL('../examples/gates/src/gates.sch.json', import.meta.url), 'utf8')), {}, 'gates.sch.json')).sheet, true);
  const lamps = JSON.parse(fs.readFileSync(new URL('../examples/traffic/src/lamps.bool.json', import.meta.url), 'utf8'));
  for (const form of ['sop', 'pos', 'nand', 'nor', 'xor']) for (const lang of ['vhdl', 'verilog']) {
    assert.equal((await check(schematicFromTable(lamps, { form, lang }), {}, `lamps ${form} ${lang}`)).sheet, true, `lamps ${form} ${lang}`);
  }
  const dir = new URL('./fixtures/ise-sch/', import.meta.url);
  for (const f of fs.readdirSync(dir).filter(x => x.endsWith('.sch'))) {
    const r = importIseSch(fs.readFileSync(new URL(f, dir), 'utf8'), { name: f.replace(/\.sch$/, '') });
    assert.equal((await check(r.doc || r, {}, f)).sheet, true, f);
  }
});

for (const name of EXAMPLES) {
  test(`#1506 every module of the example ${name} as a schematic laid out again (with ELK and with the columns): the same meaning`, async () => {
    const ex = example(name);
    const lib = compile(ex.sources);
    const files = new Set(ex.sources.map(s => s.path));
    const texts = Object.fromEntries(ex.sources.map(s => [s.path, s.text]));
    const modules = sd.modulesFromLibrary(lib, { sources: texts });
    for (const m of [...lib.modules.values()].filter(m => files.has(m.archFile || m.file))) {
      const conv = (await convertModuleToSchematic({ sources: ex.sources, module: m.name, layout })).doc;
      assert.equal((await check(structuredClone(conv), modules, `${name}/${m.name}`)).sheet, true, `${name}/${m.name}`);
      // without ELK: the columns, or the wires only when the columns would change a name; never a different meaning
      await check(structuredClone(conv), modules, `${name}/${m.name} in columns`, {});
      const plain = await sd.schematicFromHdl(elaborate(lib, m.name).top, { sources: texts, modules, lang: m.lang });
      assert.equal((await check(plain, modules, `${name}/${m.name} without a layout`)).sheet, true);
    }
  });
}
