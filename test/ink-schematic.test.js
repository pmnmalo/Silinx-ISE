// core/ink/schematic.js, schematic-doc.js: a combinational circuit drawn by hand (#1067). Held-out circuits (other
// hands than the gates' templates, core/ink/synth-schematic.js) are read into their gates and nets, made into a
// schematic whose netlist is clean and whose wires do not clash, and whose generated HDL simulates to the circuit's
// truth table; the gates' outlines; the names corrected; the errors and warnings of a drawing that is not a circuit.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeSchematic, gatePins } from '../core/ink/synth-schematic.js';
import { GATES, gateTemplates } from '../core/ink/gates.js';
import { handDraw, handGlyph, rng, writeText } from '../core/ink/synth.js';
import { classify } from '../core/ink/pdollar.js';
import { readSchematic, circuitErrors, gateName, GATE_DISTANCE } from '../core/ink/schematic.js';
import { schematicFromCircuit } from '../core/ink/schematic-doc.js';
import { InkError } from '../core/ink/segment.js';
import { netlist, generateHdl, symbolPins, symbolDef } from '../core/schdoc.js';
import { wireClashes } from '../core/schpath.js';
import { truthTableFromModule } from '../core/logic.js';

const CIRCUITS = {
  norAndNot: { gates: [{ type: 'and', x: 2, y: 0, n: 2 }, { type: 'nor', x: 4.4, y: 0.8, n: 2 }, { type: 'not', x: 2, y: 2.0 }], nets: [
    { name: 'A', at: [0.5, -0.1], to: [[0, 0]] }, { name: 'B', at: [0.5, 1.2], to: [[0, 1], [2, 0]] }, { from: 0, to: [[1, 0]] }, { from: 2, to: [[1, 1]] }, { from: 1, name: 'F' }] },
  or3: { gates: [{ type: 'nand', x: 2.4, y: 2.0, n: 2 }, { type: 'or', x: 5, y: 0.2, n: 3 }, { type: 'xnor', x: 5, y: 3.0, n: 2 }], nets: [
    { name: 'A', at: [0.5, -0.4], to: [[1, 0]] }, { name: 'B', at: [0.5, 0.7], to: [[1, 1]] },
    { name: 'C', at: [0.5, 2.0], to: [[0, 0], [2, 0]], j: 0.4 }, { name: 'D', at: [0.5, 3.0], to: [[0, 1], [2, 1]], j: 0.7 },
    { from: 0, to: [[1, 2]] }, { from: 1, name: 'G' }, { from: 2, name: 'H' }] },
  halfAdder: { gates: [{ type: 'xor', x: 2.6, y: 0, n: 2 }, { type: 'and', x: 2.6, y: 2.0, n: 2 }], nets: [
    { name: 'A', at: [0.5, -0.2], to: [[0, 0], [1, 0]], j: 0.4 }, { name: 'B', at: [0.5, 1.0], to: [[0, 1], [1, 1]], j: 0.7 },
    { from: 0, name: 'S' }, { from: 1, name: 'C' }] },
  bufXor: { gates: [{ type: 'buf', x: 2.6, y: -0.2 }, { type: 'xor', x: 2.6, y: 1.4, n: 2 }], nets: [
    { name: 'A', at: [0.5, 0.3], to: [[0, 0], [1, 0]], j: 0.5 }, { name: 'B', at: [0.5, 2.6], to: [[1, 1]] },
    { from: 0, name: 'Y' }, { from: 1, name: 'Z' }] },
};
const BASE = { and: 'and', nand: 'and', or: 'or', nor: 'or', xor: 'xor', xnor: 'xor', buf: 'buf', not: 'buf' };
const OPS = { and: (v) => v.every(Boolean), or: (v) => v.some(Boolean), xor: (v) => v.filter(Boolean).length % 2 === 1, buf: (v) => v[0] };
// the truth table of a circuit's spec (the inputs in the order of their nets), independently of the recognizer
function specTable(spec) {
  const ins = spec.nets.filter((n) => n.from == null).map((n) => n.name), outs = spec.nets.filter((n) => n.from != null && n.name).map((n) => n.name);
  const table = Object.fromEntries(outs.map((o) => [o, '']));
  for (let k = 0; k < 1 << ins.length; k++) {
    const env = Object.fromEntries(ins.map((n, i) => [n, ((k >> (ins.length - 1 - i)) & 1) === 1]));
    const inputOf = (g, p) => { const n = spec.nets.find((x) => (x.to || []).some(([gi, pi]) => gi === g && pi === p)); return n.from != null ? val(n.from) : env[n.name]; };
    const val = (g) => { const G = spec.gates[g]; const v = OPS[BASE[G.type]](Array.from({ length: G.n ?? 1 }, (_, p) => inputOf(g, p))); return ['nand', 'nor', 'xnor', 'not'].includes(G.type) ? !v : v; };
    for (const o of outs) table[o] += val(spec.nets.find((n) => n.name === o).from) ? '1' : '0';
  }
  return { inputs: ins, outputs: outs, table };
}
// a circuit read, made into a schematic: its netlist, its clashes, the truth table its HDL simulates to
function built(c) {
  const { doc, warnings } = schematicFromCircuit(c, { name: 'hand', lang: 'vhdl' });
  const tt = truthTableFromModule([{ path: 'hand.vhd', text: generateHdl(doc, { lang: 'vhdl' }).code }], 'hand');
  return { doc, warnings, diags: netlist(doc).diagnostics.map((d) => d.message), clashes: wireClashes(doc).length, tt };
}
const lc = (a) => a.map((x) => x.toLowerCase());

test('held-out circuits drawn by hand: every circuit\'s logic, 22 of 24 with every name too; a careful hand\'s all', () => {
  let logic = 0, perfect = 0, n = 0;
  const wrong = [];
  for (const [name, spec] of Object.entries(CIRCUITS)) {
    const want = specTable(spec);
    for (let seed = 1; seed <= 6; seed++) {
      const c = readSchematic(writeSchematic(spec, { seed }).strokes);
      n++;
      assert.deepEqual(circuitErrors(c), [], `${name} ${seed}`);
      const b = built(c);
      assert.deepEqual([b.warnings, b.diags, b.clashes], [[], [], 0], `${name} ${seed}`);
      // (the inputs in their order, the outputs' columns in theirs)
      const cols = Object.values(b.tt.table);
      if (b.tt.inputs.length === want.inputs.length && cols.join() === want.outputs.map((o) => want.table[o]).join()) logic++;
      if (JSON.stringify(lc(b.tt.inputs)) === JSON.stringify(lc(want.inputs)) && want.outputs.every((o) => b.tt.table[o.toLowerCase()] === want.table[o])) perfect++;
      else wrong.push(`${name} ${seed}: ${b.tt.inputs} ${Object.keys(b.tt.table)}`);
    }
  }
  assert.equal(logic, n);
  assert.ok(perfect >= 22, `${perfect}/${n}: ${wrong.join('; ')}`);
  for (const [name, spec] of Object.entries(CIRCUITS)) {
    const c = readSchematic(writeSchematic(spec, { seed: 9, amount: 0.4 }).strokes);
    assert.deepEqual([circuitErrors(c), c.warnings], [[], []], name);
    const b = built(c), want = specTable(spec);
    assert.deepEqual([b.warnings, b.diags, b.clashes], [[], [], 0], name);
    assert.deepEqual(lc(b.tt.inputs), lc(want.inputs), name);
    assert.deepEqual(b.tt.table, Object.fromEntries(want.outputs.map((o) => [o.toLowerCase(), want.table[o]])), name);
  }
});

test('a NOR of an AND and a NOT: its gates, its nets, its schematic\'s symbols and markers', () => {
  const c = readSchematic(writeSchematic(CIRCUITS.norAndNot, { seed: 9, amount: 0.4 }).strokes);
  const net = (id) => c.nets.find((x) => x.id === id);
  assert.deepEqual(c.gates.map((g) => [g.id, g.type, gateName(g), g.inputs.map((i) => net(i).name ?? 'n'), net(g.output).name ?? 'n']), [
    ['U1', 'and2', 'AND', ['A', 'B'], 'n'], ['U2', 'inv', 'NOT', ['B'], 'n'], ['U3', 'nor2', 'NOR', ['n', 'n'], 'F']]);
  assert.deepEqual(c.nets.filter((x) => x.name).map((x) => [x.name, x.dir]).sort(), [['A', 'in'], ['B', 'in'], ['F', 'out']]);
  const { doc } = schematicFromCircuit(c, { name: 'hand' });
  assert.deepEqual(doc.symbols.map((s) => [s.name, s.type]), [['U1', 'and2'], ['U2', 'inv'], ['U3', 'nor2']]);
  assert.deepEqual(doc.ports.map((p) => [p.name, p.dir]).sort(), [['A', 'in'], ['B', 'in'], ['F', 'out']]);
  // where they were drawn: the AND above the NOT, left of the NOR; the inputs' markers left of every pin, the output's right
  const [and, inv, nor] = doc.symbols;
  assert.ok(and.y < inv.y && and.x < nor.x && inv.x < nor.x);
  const pinX = doc.symbols.flatMap((s) => symbolPins(s, {}, symbolDef(s))).map((p) => p.x);
  for (const p of doc.ports) assert.ok(p.dir === 'in' ? p.x < Math.min(...pinX) : p.x > Math.max(...pinX), p.name);
  assert.ok(doc.symbols.every((s) => s.x % 10 === 0 && s.y % 10 === 0));
  // a type chosen in the list: an OR instead of the AND
  c.gates[0].type = 'or2';
  assert.equal(built(c).tt.table.f, '0000');
  c.gates[0].type = 'and2';
  assert.equal(built(c).tt.table.f, '0100');
});

test('the gates\' outlines: held-out ones recognized (30 of 32, a strong hand), whatever their strokes; letters are not gates', () => {
  const rand = rng(2024);
  let ok = 0;
  for (const [kind, vs] of Object.entries(GATES)) {
    vs.forEach((v) => { for (let k = 0; k < 4; k++) { const best = classify(handDraw(v, { rand, amount: 1 }), gateTemplates())[0]; if (best.ch === kind) ok++; assert.ok(best.d <= GATE_DISTANCE); } });
  }
  assert.equal(ok, 30);
  for (const ch of 'ABCDEFHKMNORSUXYZ0123456789+') assert.ok(classify(handGlyph(ch, { rand, amount: 0.5 }), gateTemplates())[0].d > GATE_DISTANCE, ch);
  assert.equal(gateTemplates().length, 3 * Object.values(GATES).flat().length);
});

test('the names corrected: a name that is not one, a name twice', () => {
  const c = readSchematic(writeSchematic(CIRCUITS.halfAdder, { seed: 9, amount: 0.4 }).strokes);
  assert.deepEqual(circuitErrors(c), []);
  c.nets.find((n) => n.name === 'C').name = '2C';
  assert.deepEqual(circuitErrors(c), ["'2C' is not a name: correct it."]);
  c.nets.find((n) => n.name === '2C').name = 's';
  assert.deepEqual(circuitErrors(c), ['The name s is on two nets.']);
  c.nets.find((n) => n.name === 's' && n.dir === 'out' && n.driver === 'U2').name = 'Carry';
  assert.deepEqual(circuitErrors(c), []);
  assert.deepEqual(built(c).tt.outputs.sort(), ['carry', 's']);
});

test('an AND2 drawn as on a tablet (#1750): A and B at its pins, a third of a gate apart, its leads half a gate long or more', () => {
  const names = [];
  for (const lead of [0.5, 0.6, 1.2]) {
    for (let seed = 1; seed <= 6; seed++) {
      const spec = { gates: [{ type: 'and', x: 1.2, y: 0, n: 2 }], nets: [{ name: 'A', at: [1.2 - lead, 1 / 3], to: [[0, 0]] }, { name: 'B', at: [1.2 - lead, 2 / 3], to: [[0, 1]] }, { from: 0, name: 'Z' }] };
      const c = readSchematic(writeSchematic(spec, { seed }).strokes), at = `lead ${lead}, seed ${seed}`;
      assert.deepEqual([circuitErrors(c), c.warnings], [[], []], at);
      assert.deepEqual(c.gates.map((g) => [g.type, g.inputs.map((n) => c.nets.find((x) => x.id === n).name)]), [['and2', ['A', 'B']]], at);
      names.push(c.nets.find((n) => n.id === c.gates[0].output).name);
    }
  }
  // (seed 2's Z is read as an I, the letters' recognizer, not the circuit's)
  assert.deepEqual(names, ['Z', 'I', 'Z', 'Z', 'Z', 'Z', 'Z', 'I', 'Z', 'Z', 'Z', 'Z', 'Z', 'I', 'Z', 'Z', 'Z', 'Z']);
  const c = readSchematic(writeSchematic({ gates: [{ type: 'and', x: 1.2, y: 0, n: 2 }], nets: [{ name: 'A', at: [0.7, 1 / 3], to: [[0, 0]] }, { name: 'B', at: [0.7, 2 / 3], to: [[0, 1]] }, { from: 0, name: 'Z' }] }, { seed: 3 }).strokes);
  const b = built(c);
  assert.deepEqual([b.warnings, b.diags, b.clashes, b.tt.inputs, b.tt.table], [[], [], 0, ['a', 'b'], { z: '0001' }]);
});

test('drawings that are not a circuit: no ink, no gate, a gate without its wires, outputs joined, names and wire ends astray', () => {
  const inkError = (msg) => (e) => e instanceof InkError && e.message === msg;
  for (const ink of [[], [[]], null]) assert.throws(() => readSchematic(ink), inkError('Nothing drawn: draw the circuit on the pad.'));
  assert.throws(() => readSchematic(writeText('A+B', { seed: 1, amount: 0.3 }).strokes), inkError('No gate found: draw the gates larger than the names, their inputs on the left.'));
  const read = (spec, extra = []) => { const c = readSchematic([...writeSchematic(spec, { seed: 9, amount: 0.4 }).strokes, ...extra]); return [circuitErrors(c), c.warnings]; };
  const and = { type: 'and', x: 2, y: 0, n: 2 };
  // no wire from the output
  assert.deepEqual(read({ gates: [and], nets: [{ name: 'A', at: [0.5, 0.2], to: [[0, 0]] }, { name: 'B', at: [0.5, 0.9], to: [[0, 1]] }] }), [['U1 (AND): no wire from its output.'], []]);
  // an input with no name; an output with none
  assert.deepEqual(read({ gates: [and], nets: [{ at: [0.5, -0.6], to: [[0, 0]] }, { name: 'B', at: [0.5, 0.9], to: [[0, 1]] }, { from: 0 }] }),
    [["A wire to U1 starts at no output and no name: write the input's name at its end."], ['The output of U1 has no name: out1.', '2 wire ends touch nothing.']]);
  // the inputs a gate has: a NOT with two, an AND with one
  assert.deepEqual(read({ gates: [{ type: 'not', x: 2, y: 0, n: 2 }], nets: [{ name: 'A', at: [0.5, 0.2], to: [[0, 0]] }, { name: 'B', at: [0.5, 0.9], to: [[0, 1]] }, { from: 0, name: 'F' }] })[0], ['U1 (NOT): 2 inputs, 1 expected.']);
  assert.deepEqual(read({ gates: [{ type: 'and', x: 2, y: 0, n: 1 }], nets: [{ name: 'A', at: [0.5, 0.2], to: [[0, 0]] }, { from: 0, name: 'F' }] })[0], ['U1 (AND): 1 input, 2 to 5 expected.']);
  // two outputs on one wire
  const two = { gates: [and, { type: 'or', x: 2, y: 2, n: 2 }], nets: [{ name: 'A', at: [0.5, 0.2], to: [[0, 0], [1, 0]], j: 0.5 }, { name: 'B', at: [0.5, 2.9], to: [[0, 1], [1, 1]], j: 0.6 }, { from: 0, name: 'F' }] };
  const size = 70, px = ([u, v]) => ({ x: 40 + u * size, y: 30 + v * size });
  const [t0, t1] = [gatePins(two.gates[0]).out, gatePins(two.gates[1]).out].map(px);
  const join = [t1, { x: t1.x + 0.6 * size, y: t1.y }, { x: t1.x + 0.6 * size, y: t0.y }];
  assert.deepEqual(read(two, [join])[0], ['Two gate outputs are joined (U1, U2).']);
  // a name at no wire's end, a wire end touching nothing
  const ok = { gates: [and], nets: [{ name: 'A', at: [0.5, 0.2], to: [[0, 0]] }, { name: 'B', at: [0.5, 0.9], to: [[0, 1]] }, { from: 0, name: 'F' }] };
  assert.deepEqual(read(ok), [[], []]);
  const stray = writeText('Q', { seed: 3, amount: 0.3, size: 31, x: 200, y: 260 }).strokes;
  const dangling = [[{ x: 500, y: 300 }, { x: 600, y: 300 }, { x: 600, y: 360 }]];
  assert.deepEqual(read(ok, [...stray, ...dangling])[1], ["The name Q is at no wire's end.", '2 wire ends touch nothing.']);
});
