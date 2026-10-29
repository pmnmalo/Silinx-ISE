// A module's symbol in a schematic (core/schdoc-modsym.js, #1183): an instance keeps the ports it was placed with, so
// a change of its module (a port added, removed, reordered, turned) moves no pin under its wires; it is out of date
// (a warning; an error for a pin connected to a port gone) until Update Symbol, which keeps its connections by pin name.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDoc, netlist, symbolDef, symbolPins, symbolDiff, updatedPorts, updateModuleSymbols, generateHdl } from '../core/schdoc.js';

const P = (name, dir = 'in', width = 1) => ({ name, dir, width });
const mods = (ports) => ({ sub: { name: 'sub', lang: 'vhdl', ports } });
const PLACED = [P('a'), P('b'), P('y', 'out')];
// the sheet: the instance and a wire from each pin outward (40 px) to an I/O marker
const OUT = { W: [-1, 0], E: [1, 0], N: [0, -1], S: [0, 1] };
function sheet(rot = 0, mirror = false, ports = PLACED) {
  const s = { id: 'U', type: 'module', x: 300, y: 200, rot, mirror, name: 'U1', params: { module: 'sub', ports: ports.map((q) => ({ ...q })) } };
  const pins = symbolPins(s, mods(ports));
  const wires = [], markers = [];
  for (const p of pins) {
    const [dx, dy] = OUT[p.side], b = { x: p.x + 40 * dx, y: p.y + 40 * dy };
    wires.push({ id: `w_${p.name}`, points: [{ x: p.x, y: p.y }, b] });
    markers.push({ id: `m_${p.name}`, name: `n_${p.name}`, dir: p.dir === 'out' ? 'out' : 'in', width: 1, x: b.x, y: b.y });
  }
  return normalizeDoc({ version: 4, name: 'top', lang: 'vhdl', symbols: [s], wires, ports: markers, labels: [] });
}
const ORIENTS = [0, 90, 180, 270].flatMap((rot) => [false, true].map((mirror) => [rot, mirror]));
const netOf = (nl, sym, pin) => nl.pinNet.get(`${sym}/${pin}`);

test('#1183 symbolDiff: added, removed, turned; the same ports (names in any case, in any order) up to date', () => {
  const s = { type: 'module', params: { module: 'sub', ports: PLACED } };
  assert.equal(symbolDiff(s, mods(PLACED)), null);
  assert.equal(symbolDiff(s, mods([P('A'), P('B'), P('Y', 'out')])), null, 'names in another case');
  assert.deepEqual(symbolDiff(s, mods([P('a'), P('c'), P('b'), P('y', 'out')])), { added: ['c'], removed: [], turned: [] });
  assert.deepEqual(symbolDiff(s, mods([P('b'), P('y', 'out')])), { added: [], removed: ['a'], turned: [] });
  assert.deepEqual(symbolDiff(s, mods([P('a'), P('b', 'out'), P('y', 'out')])), { added: [], removed: [], turned: ['b'] });
  assert.equal(symbolDiff(s, mods([P('b'), P('a'), P('y', 'out')])), null, 'reordered: its pins keep their order');
  // (an inout is on the inputs' side: not turned)
  assert.equal(symbolDiff({ type: 'module', params: { module: 'sub', ports: [P('d', 'in')] } }, mods([P('d', 'inout')])), null);
  // no snapshot, no module, not a module: nothing to say
  assert.equal(symbolDiff({ type: 'module', params: { module: 'sub' } }, mods(PLACED)), null);
  assert.equal(symbolDiff(s, {}), null);
  assert.equal(symbolDiff({ type: 'and2', params: {} }, mods(PLACED)), null);
});

test('#1183 updatedPorts: the ports kept in their order on each side, the new ones after them, a removed one closed up', () => {
  const names = (ps) => ps.map((q) => `${q.name}:${q.dir}`);
  assert.deepEqual(names(updatedPorts(PLACED, [P('z'), P('b'), P('a'), P('q', 'out'), P('y', 'out')])), ['a:in', 'b:in', 'z:in', 'y:out', 'q:out']);
  assert.deepEqual(names(updatedPorts(PLACED, [P('b'), P('y', 'out')])), ['b:in', 'y:out']);
  assert.deepEqual(names(updatedPorts(PLACED, [P('a'), P('b', 'out'), P('y', 'out')])), ['a:in', 'y:out', 'b:out'], 'turned: the end of its new side');
  // the module's widths and directions taken
  assert.deepEqual(updatedPorts(PLACED, [P('a', 'in', 8), P('b'), P('y', 'out', 8)]).map((q) => q.width), [8, 1, 8]);
});

test('#1183 a module whose ports changed: its instances drawn as placed, their wires on the same pins; out of date said', () => {
  for (const [rot, mirror] of ORIENTS) {
    const what = `rot ${rot}${mirror ? ' mirrored' : ''}`;
    const doc = sheet(rot, mirror);
    const before = symbolPins(doc.symbols[0], mods(PLACED)).map((p) => `${p.name}@${p.x},${p.y}`);
    // the module's ports reordered, one added, the outputs too
    const changed = mods([P('n'), P('b'), P('a'), P('y', 'out'), P('o2', 'out')]);
    assert.deepEqual(symbolPins(doc.symbols[0], changed).map((p) => `${p.name}@${p.x},${p.y}`), before, what);
    const nl = netlist(doc, { modules: changed });
    for (const n of ['a', 'b', 'y']) assert.equal(netOf(nl, 'U', n), nl.portNet.get(`m_${n}`), `${what}: ${n}`);
    assert.deepEqual(nl.diagnostics.filter((d) => d.severity !== 'info').map((d) => `${d.severity}: ${d.message}`),
      ["warning: U1: the symbol of module 'sub' is out of date (its ports: added n, o2): Update Symbol"], what);
  }
  // a pin connected to a port the module no longer has, or has on the other side: an error
  const doc = sheet();
  assert.deepEqual(netlist(doc, { modules: mods([P('b', 'out'), P('y', 'out')]) }).diagnostics.filter((d) => d.severity === 'error').map((d) => d.message), [
    "U1: pin a is connected, but module 'sub' no longer has that port: Update Symbol, then connect it again",
    "U1: pin b is connected, but module 'sub' has that port in the other direction now: Update Symbol, then connect it again"]);
  // its HDL: the ports it was placed with in the port map
  assert.match(generateHdl(doc, { modules: mods([P('n'), P('b'), P('a'), P('y', 'out')]) }).code, /a => n_a,\s*b => n_b,\s*y => n_y/);
});

test('#1183 Update Symbol: the module\'s ports, the wires following their pin by name, in every orientation; a removed pin\'s wire left unconnected', () => {
  for (const [rot, mirror] of ORIENTS) {
    const what = `rot ${rot}${mirror ? ' mirrored' : ''}`;
    // a input removed: b takes its place, its wire follows it; the new input c after b, unconnected; a's wire left,
    // pulled back from b's new place
    const doc = sheet(rot, mirror), changed = mods([P('c'), P('b'), P('y', 'out')]);
    const r = updateModuleSymbols(doc, changed);
    assert.deepEqual(r, { updated: ['U1'], removed: ['U1.a'], turned: [] }, what);
    assert.deepEqual(doc.symbols[0].params.ports.map((q) => q.name), ['b', 'c', 'y'], what);
    assert.equal(symbolDiff(doc.symbols[0], changed), null, `${what}: up to date`);
    const nl = netlist(normalizeDoc(doc), { modules: changed });
    for (const n of ['b', 'y']) assert.equal(netOf(nl, 'U', n), nl.portNet.get(`m_${n}`), `${what}: ${n} still on its marker`);
    assert.notEqual(netOf(nl, 'U', 'b'), nl.portNet.get('m_a'), `${what}: a's wire not on b`);
    assert.equal(netOf(nl, 'U', 'c')?.endpoints.length ?? 1, 1, `${what}: c unconnected`);
    assert.ok(doc.wires.every((w) => w.points.every((q, i) => i === 0 || q.x === w.points[i - 1].x || q.y === w.points[i - 1].y)), `${what}: square wires`);
    assert.deepEqual(nl.diagnostics.filter((d) => d.severity === 'error'), [], what);
  }
  // only the instances asked; already up to date: nothing
  const doc = sheet();
  assert.deepEqual(updateModuleSymbols(doc, mods(PLACED)), { updated: [], removed: [], turned: [] });
  assert.deepEqual(updateModuleSymbols(doc, mods([P('b'), P('a'), P('y', 'out')]), ['nope']), { updated: [], removed: [], turned: [] });
});

test('#1183 an instance saved without its ports: the module\'s taken when the schematic is read with the modules (drawn as before)', () => {
  const s = { id: 'U', type: 'module', x: 0, y: 0, rot: 0, mirror: false, name: 'U1', params: { module: 'sub' } };
  const before = symbolPins(s, mods(PLACED)).map((p) => `${p.name}@${p.x},${p.y}`);
  const doc = normalizeDoc({ version: 4, name: 't', lang: 'vhdl', symbols: [s], wires: [], ports: [], labels: [] }, { modules: mods(PLACED) });
  assert.deepEqual(doc.symbols[0].params.ports, PLACED);
  assert.deepEqual(symbolPins(doc.symbols[0], mods(PLACED)).map((p) => `${p.name}@${p.x},${p.y}`), before);
  // (without the modules: left as it was)
  assert.equal(normalizeDoc({ version: 4, name: 't', lang: 'vhdl', symbols: [s], wires: [], ports: [], labels: [] }).symbols[0].params.ports, undefined);
  // the widths the module's (a generic changed), the pins where they were
  assert.deepEqual(symbolDef(doc.symbols[0], mods([P('a', 'in', 8), P('b'), P('y', 'out', 8)])).pins.map((p) => p.width), [8, 1, 8]);
});

test('#1183 Update Symbol: several pins moving at once each keep their own wire (no wire moved twice); a pin touching another symbol\'s gets a wire', () => {
  const four = [P('a'), P('b'), P('c'), P('d'), P('y', 'out')];
  for (const [rot, mirror] of ORIENTS) {
    const doc = sheet(rot, mirror, four), changed = mods([P('d'), P('c'), P('b'), P('y', 'out')]);   // (a removed: b, c, d move up)
    updateModuleSymbols(doc, changed);
    const nl = netlist(normalizeDoc(doc), { modules: changed });
    for (const n of ['b', 'c', 'd', 'y']) assert.equal(netOf(nl, 'U', n), nl.portNet.get(`m_${n}`), `rot ${rot}${mirror ? ' mirrored' : ''}: ${n}`);
    assert.equal(new Set(['b', 'c', 'd', 'y'].map((n) => netOf(nl, 'U', n).id)).size, 4, 'four nets');
  }
  // an inverter's input right on pin b: after b moved, a wire joins them
  const doc = sheet(0, false, four);
  const b = symbolPins(doc.symbols[0], mods(four)).find((p) => p.name === 'b');
  doc.wires = doc.wires.filter((w) => w.id !== 'w_b'); doc.ports = doc.ports.filter((q) => q.id !== 'm_b');
  doc.symbols.push({ id: 'I', type: 'inv', x: b.x - 80, y: b.y - 10, rot: 0, mirror: false, name: 'U2', params: {} });
  assert.equal(symbolPins(doc.symbols[1], {}).find((p) => p.name === 'O').x, b.x, '(the inverter\'s output on b)');
  const changed = mods([P('b'), P('c'), P('d'), P('y', 'out')]);
  updateModuleSymbols(doc, changed);
  const nl = netlist(normalizeDoc(doc), { modules: changed });
  assert.equal(netOf(nl, 'U', 'b'), netOf(nl, 'I', 'O'));
});
