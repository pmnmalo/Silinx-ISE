// core/ink/flipflops.js and the schematic reader with flip-flops (#1083). Held-out circuits with flip-flops drawn by
// hand (core/ink/synth-flipflop.js: a toggle from its Q̄, a register with an enable and a clear, a 2-bit counter
// of T flip-flops, a JK) are read into the library's flip-flops, made into a schematic with a clean netlist, and
// their HDL, compiled and clocked (compileDesign), gives every cycle the outputs computed from the drawing's own
// description; the boxes, the labels, the wedge, Q̄; the errors of a flip-flop drawn wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeSchematic } from '../core/ink/synth-schematic.js';
import { readSchematic, circuitErrors, gateName } from '../core/ink/schematic.js';
import { ffSymbol, FF_INPUTS } from '../core/ink/flipflops.js';
import { schematicFromCircuit } from '../core/ink/schematic-doc.js';
import { netlist, generateHdl } from '../core/schdoc.js';
import { wireClashes } from '../core/schpath.js';
import { compileDesign } from '../core/compiled-sim.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { designOf, rng } from './compiled-diff.js';

const CIRCUITS = {
  toggle: { gates: [{ type: 'ff', x: 2.4, y: 0, ins: ['D', 'C'], outs: ['Q', 'QN'], wedge: true }], nets: [
    { name: 'clk', at: [0.6, 0.6], to: [[0, 'C']] }, { from: 0, out: 'Q', name: 'q' }, { from: 0, out: 'QN', to: [[0, 'D']], via: 1.7 }] },
  register: { gates: [{ type: 'ff', x: 2.4, y: 0, ins: ['D', 'CE', 'C', 'CLR'], outs: ['Q'] }], nets: [
    { name: 'd', at: [0.6, 0.0], to: [[0, 'D']] }, { name: 'en', at: [0.6, 0.75], to: [[0, 'CE']] }, { name: 'clk', at: [0.6, 1.5], to: [[0, 'C']] },
    { name: 'rst', at: [0.6, 2.25], to: [[0, 'CLR']] }, { from: 0, out: 'Q', name: 'q' }] },
  counter: { gates: [{ type: 'ff', x: 2.4, y: 0, ins: ['T', 'C'], outs: ['Q'], wedge: true }, { type: 'and', x: 5.2, y: 1.2, n: 2 }, { type: 'ff', x: 7.4, y: 1.6, ins: ['T', 'C'], outs: ['Q'], wedge: true }], nets: [
    { name: 'en', at: [0.6, -0.3], to: [[0, 'T'], [1, 0]], j: 0.3 }, { name: 'clk', at: [0.6, 3.1], to: [[0, 'C'], [2, 'C']], j: 0.25 },
    { from: 0, out: 'Q', name: 'q0', to: [[1, 1]] }, { from: 1, to: [[2, 'T']] }, { from: 2, out: 'Q', name: 'q1' }] },
  jk: { gates: [{ type: 'ff', x: 2.4, y: 0, ins: ['J', 'C', 'K'], outs: ['Q'], wedge: true }], nets: [
    { name: 'j', at: [0.6, -0.2], to: [[0, 'J']] }, { name: 'clk', at: [0.6, 0.67], to: [[0, 'C']] }, { name: 'k', at: [0.6, 1.6], to: [[0, 'K']] }, { from: 0, out: 'Q', name: 'q' }] },
};

const TYPES = { toggle: ['fd'], register: ['fdce'], counter: ['ft', 'and2', 'ft'], jk: ['fjk'] };

// the cycles of a circuit's spec, independently of the reader: its inputs at random, its outputs after each clock edge
function specCycles(spec, n, seed) {
  const rand = rng(seed);
  const ins = spec.nets.filter((x) => x.from == null && x.name !== 'clk').map((x) => x.name), outs = spec.nets.filter((x) => x.from != null && x.name).map((x) => x.name);
  const state = spec.gates.map(() => 0);
  const driverOf = (g, p) => spec.nets.find((x) => (x.to || []).some(([gi, pi]) => gi === g && pi === p));
  const val = (net, env) => {
    if (net.from == null) return env[net.name];
    const G = spec.gates[net.from];
    if (G.type === 'ff') return net.out === 'QN' ? 1 - state[net.from] : state[net.from];
    const a = Array.from({ length: G.n }, (_, p) => val(driverOf(net.from, p), env));
    return { and: a.every(Boolean), or: a.some(Boolean), xor: a.reduce((x, y) => x ^ y, 0) === 1 }[G.type] ? 1 : 0;
  };
  const rows = [];
  for (let c = 0; c < n; c++) {
    const env = Object.fromEntries(ins.map((x) => [x, rand() < 0.5 ? 1 : 0]));
    const next = spec.gates.map((G, g) => {
      if (G.type !== 'ff') return 0;
      const v = (p) => val(driverOf(g, p), env), q = state[g];
      if (G.ins.includes('CLR') && v('CLR')) return 0;
      if (G.ins.includes('CE') && !v('CE')) return q;
      if (G.ins.includes('D')) return v('D');
      if (G.ins.includes('T')) return q ^ v('T');
      return v('J') && v('K') ? 1 - q : v('J') ? 1 : v('K') ? 0 : q;
    });
    next.forEach((x, g) => { state[g] = x; });
    rows.push({ env, out: Object.fromEntries(outs.map((o) => [o, val(spec.nets.find((x) => x.name === o), env)])) });
  }
  return rows;
}

// a circuit read, made into a schematic, compiled, clocked: its outputs each cycle
async function clocked(c, rows) {
  const { doc, warnings } = schematicFromCircuit(c, { name: 'hand', lang: 'verilog' });
  const sim = await compileDesign(designOf([{ path: 'hand.v', lang: 'verilog', role: 'design', text: generateHdl(doc, { lang: 'verilog' }).code }], 'hand'), { run: yosysNode, clock: 'clk' });
  const got = rows.map(({ env }) => {
    for (const [k, v] of Object.entries(env)) sim.set(k, v);
    sim.cycle(1);
    return Object.fromEntries(Object.keys(rows[0].out).map((o) => [o, Number(sim.get(o))]));
  });
  return { doc, warnings, got, diags: netlist(doc).diagnostics.map((d) => d.message), clashes: wireClashes(doc).length, simWarnings: sim.warnings };
}

test('held-out circuits with flip-flops drawn by hand: read (20 of 24 with every name), made, clocked: every cycle\'s outputs', async () => {
  let named = 0, n = 0;
  const wrong = [];
  for (const [name, spec] of Object.entries(CIRCUITS)) {
    for (const [seed, amount] of [[1, 1], [2, 1], [3, 1], [4, 0.7], [5, 0.7], [9, 0.4]]) {
      const c = readSchematic(writeSchematic(spec, { seed, amount, size: 60, x: 30, y: 30 }).strokes);
      assert.deepEqual([circuitErrors(c), c.warnings], [[], []], `${name} ${seed}`);
      assert.deepEqual(c.gates.map((g) => g.type), TYPES[name], `${name} ${seed}`);
      // (the names: a hand's strong enough to misread one now and then, which the dialog lets the user correct)
      n++;
      // (each name with its direction: an output's name on its output's net)
      const names = (list) => list.filter((x) => x.name).map((x) => `${x.name}:${x.dir ?? (x.from == null ? 'in' : 'out')}`).sort().join();
      if (names(c.nets) !== names(spec.nets)) { assert.equal(amount, 1, `${name} ${seed}`); wrong.push(`${name} ${seed}: ${names(c.nets)}`); continue; }
      named++;
      const rows = specCycles(spec, 24, seed);
      const r = await clocked(c, rows);
      assert.deepEqual([r.warnings, r.diags, r.clashes, r.simWarnings], [[], [], 0, []], `${name} ${seed}`);
      assert.deepEqual(r.got, rows.map((x) => x.out), `${name} ${seed}`);
    }
  }
  assert.ok(named >= 20, `${named}/${n}: ${wrong.join('; ')}`);
});

test('the flip-flops read: their symbols, their pins by their labels, Q̄ through an inverter', () => {
  const read = (spec) => readSchematic(writeSchematic(spec, { seed: 9, amount: 0.4, size: 60, x: 30, y: 30 }).strokes);
  const named = (c, id) => c.nets.find((n) => n.id === id)?.name ?? 'n';
  const t = read(CIRCUITS.toggle);
  const [ff] = t.gates;
  assert.deepEqual([ff.id, ff.kind, ff.ffKind, ff.type, gateName(ff)], ['U1', 'ff', 'd', 'fd', 'FD']);
  assert.deepEqual(Object.keys(ff.pins).sort(), ['C', 'D']);
  assert.equal(named(t, ff.pins.C), 'clk');
  assert.equal(ff.pins.D, ff.outputs.QN);   // (its Q̄ back to its D)
  assert.equal(named(t, ff.outputs.Q), 'q');
  assert.deepEqual(t.nets.find((n) => n.id === ff.outputs.QN), { id: ff.outputs.QN, name: null, dir: null, at: null, driver: 'U1', driverPin: 'QN', sinks: [{ gate: 'U1', pin: 'D' }] });
  const { doc } = schematicFromCircuit(t, { name: 'hand' });
  assert.deepEqual(doc.symbols.map((s) => [s.name, s.type]), [['U1', 'fd'], ['U1_QN', 'inv']]);
  // the register: the inputs by their labels, the clear and the enable choosing the symbol
  const r = read(CIRCUITS.register);
  assert.deepEqual(Object.fromEntries(Object.entries(r.gates[0].pins).map(([p, n]) => [p, named(r, n)])), { D: 'd', CE: 'en', C: 'clk', CLR: 'rst' });
  assert.equal(r.gates[0].type, 'fdce');
  // the counter: flip-flops and a gate numbered together, by columns
  assert.deepEqual(read(CIRCUITS.counter).gates.map((g) => [g.id, g.type]), [['U1', 'ft'], ['U2', 'and2'], ['U3', 'ft']]);
  assert.equal(read(CIRCUITS.jk).gates[0].type, 'fjk');
});

test('ffSymbol: the kind by the data inputs, the symbol by the controls; what the library has not', () => {
  assert.deepEqual(ffSymbol(['D', 'C']), { kind: 'd', type: 'fd' });
  assert.deepEqual(ffSymbol(['D', 'CE', 'C', 'CLR']), { kind: 'd', type: 'fdce' });
  assert.deepEqual(ffSymbol(['T', 'C', 'CLR']), { kind: 't', type: 'ftc' });
  assert.deepEqual(ffSymbol(['J', 'K', 'C', 'PRE']), { kind: 'jk', type: 'fjkp' });
  assert.deepEqual(ffSymbol(['C']), { error: 'no data input: write D, T, or J and K' });
  assert.deepEqual(ffSymbol(['J', 'C']), { error: 'no data input: write D, T, or J and K' });
  assert.deepEqual(ffSymbol(['D']), { kind: 'd', error: 'no clock: write C or CLK, or draw a wedge' });
  assert.deepEqual(ffSymbol(['J', 'K', 'C', 'R']), { kind: 'jk', error: 'no flip-flop of the library has the inputs J, K, C, R' });
  assert.deepEqual(Object.entries(FF_INPUTS).filter(([k, v]) => k !== v), [['CLK', 'C'], ['CK', 'C'], ['EN', 'CE']]);
});

test('flip-flops drawn wrong: a label not a pin, no clock, a pin without its wire, two wires to one, an empty box', () => {
  const read = (spec) => { const c = readSchematic(writeSchematic(spec, { seed: 9, amount: 0.4, size: 60, x: 30, y: 30 }).strokes); return [circuitErrors(c), c.warnings]; };
  const ff = (ins, outs = ['Q']) => ({ type: 'ff', x: 2.4, y: 0, ins, outs });
  const out = { from: 0, out: 'Q', name: 'q' };
  // a label that is not a pin (an X); no clock
  assert.deepEqual(read({ gates: [ff(['D', 'X'])], nets: [{ name: 'd', at: [0.6, 0], to: [[0, 'D']] }, { name: 'c', at: [0.6, 1.3], to: [[0, 'X']] }, out] })[0], [
    "U1 (flip-flop): 'X' is not one of its pins (D, T, J, K, C, CE, CLR, PRE, R, S; Q, Q̄).",
    'U1 (flip-flop): no clock: write C or CLK, or draw a wedge.']);
  // a pin without its wire
  assert.deepEqual(read({ gates: [ff(['D', 'C'])], nets: [{ name: 'd', at: [0.6, 0], to: [[0, 'D']] }, out] })[0], ['U1 (flip-flop): no wire to C.']);
  // two wires to one pin
  const two = { gates: [ff(['D', 'C'])], nets: [{ name: 'd', at: [0.6, -0.1], to: [[0, 'D']] }, { name: 'e', at: [0.6, 0.6], to: [[0, 'D']] }, { name: 'clk', at: [0.6, 1.4], to: [[0, 'C']] }, out] };
  assert.deepEqual(read(two)[0], ['U1 (flip-flop): two wires to D.']);
  // no wire from its outputs
  assert.deepEqual(read({ gates: [ff(['D', 'C'])], nets: [{ name: 'd', at: [0.6, 0], to: [[0, 'D']] }, { name: 'clk', at: [0.6, 1.3], to: [[0, 'C']] }] })[0], ['U1 (flip-flop): no wire from its outputs.']);
  // an empty box: not a flip-flop
  const box = [[{ x: 100, y: 100 }, { x: 180, y: 100 }, { x: 180, y: 180 }, { x: 100, y: 180 }, { x: 100, y: 101 }]];
  const c = readSchematic([...writeSchematic({ gates: [{ type: 'and', x: 3, y: 2, n: 2 }], nets: [{ name: 'a', at: [1, 2.2], to: [[0, 0]] }, { name: 'b', at: [1, 2.9], to: [[0, 1]] }, { from: 0, name: 'f' }] }, { seed: 9, amount: 0.4, size: 60, x: 30, y: 30 }).strokes, ...box]);
  assert.ok(c.gates.every((g) => g.kind !== 'ff'), JSON.stringify(c.gates.map((g) => g.type)));
});
