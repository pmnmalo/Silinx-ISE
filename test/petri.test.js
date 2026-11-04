// Petri nets (core/petri.js): the model, its validation, the token game and the clock step, the HDL
// generated (VHDL and Verilog, simulated against the reference model with random inputs), PNML.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  newPetri, normalizePetri, validatePetri, initialMarking, enabledTransitions, isEnabled, fire, clockStep, isDeadlock,
  outputsOf, generatePetri, toPnml, fromPnml,
} from '../core/petri.js';
import { simulate } from '../core/compile.js';
import { checkPetri } from '../core/petri-analysis.js';

// a producer / consumer over a buffer of 3, pulses when one is put, the buffer's state as outputs
const prodCons = () => normalizePetri({
  name: 'prodcons', inputs: [{ name: 'p', width: 1 }, { name: 'c', width: 1 }], outputs: [{ name: 'some', width: 1 }, { name: 'room', width: 1 }, { name: 'put', width: 1 }],
  places: [{ id: 'f', name: 'free', tokens: 3, capacity: 3, outputs: { room: '1' } }, { id: 'b', name: 'buf', capacity: 3, outputs: { some: '1' } }],
  transitions: [{ id: 'tp', name: 'produce', guard: 'p', outputs: { put: '1' } }, { id: 'tc', name: 'consume', guard: 'c' }],
  arcs: [{ id: 'a1', from: 'f', to: 'tp' }, { id: 'a2', from: 'tp', to: 'b' }, { id: 'a3', from: 'b', to: 'tc' }, { id: 'a4', from: 'tc', to: 'f' }],
});
// a conflict decided by priority, a weight of 2, an inhibitor arc, a 2-bit output
const conflict = () => normalizePetri({
  name: 'conflict', inputs: [{ name: 'x', width: 1 }, { name: 'y', width: 1 }], outputs: [{ name: 'st', width: 2 }],
  places: [{ id: 'a', name: 'a', tokens: 2, capacity: 2, outputs: { st: '1' } }, { id: 'b', name: 'b', outputs: { st: '2' } }, { id: 'c', name: 'c', capacity: 2 }],
  transitions: [{ id: 't1', name: 'both', guard: 'x' }, { id: 't2', name: 'one', guard: 'y' }, { id: 't3', name: 'back', guard: '' }, { id: 't4', name: 'home', guard: '!x & !y' }],
  arcs: [{ id: 'a1', from: 'a', to: 't1', weight: 2 }, { id: 'a2', from: 't1', to: 'b' }, { id: 'a3', from: 'a', to: 't2' }, { id: 'a4', from: 't2', to: 'c' },
    { id: 'a5', from: 'c', to: 't3' }, { id: 'a6', from: 'b', to: 't3', inhibitor: true }, { id: 'a7', from: 't3', to: 'a' }, { id: 'a8', from: 'b', to: 't4' }, { id: 'a9', from: 't4', to: 'a', weight: 2 }],
});

test('the model: a new net is valid; errors and warnings', () => {
  assert.deepEqual(validatePetri(newPetri('ctl')), []);
  const bad = normalizePetri({ name: 'bad', inputs: [{ name: 'x' }], outputs: [], places: [{ id: 'p', name: 'p', tokens: 3, capacity: 2, outputs: { z: '1' } }, { id: 'q', name: 'q' }],
    transitions: [{ id: 't', name: 't', guard: 'x &' }], arcs: [{ id: 'a', from: 'p', to: 'q' }, { id: 'b', from: 't', to: 'p', inhibitor: true }] });
  assert.deepEqual(validatePetri(bad).map(d => `${d.severity}: ${d.message}`), [
    'error: place p: 3 initial tokens, more than its capacity 2',
    "error: transition t: guard 'x &': unexpected end of expression",
    'warning: transition t takes no token: it fires on every clock edge while its guard is true',
    "error: p: 'z' is not an output of the net",
    'error: an arc joins a place to a transition or a transition to a place',
    'error: an inhibitor arc goes from a place to a transition',
  ]);
  // names: the module, ports, twice the same (VHDL: whatever the case), a reserved word as a port; an output not a constant; a place not connected
  const names = normalizePetri({ name: 'entity', inputs: [{ name: 'Go' }, { name: 'go' }, { name: 'signal' }], outputs: [{ name: 'y' }],
    places: [{ id: 'p', name: 'p', outputs: { y: 'go' } }, { id: 'q', name: 'lonely' }, { id: 'r', name: 'begin' }],
    transitions: [{ id: 't', name: 'process' }], arcs: [{ id: 'a', from: 'p', to: 't' }, { id: 'b', from: 't', to: 'r' }] });
  assert.deepEqual(validatePetri(names).map(d => `${d.severity}: ${d.message}`), [
    "error: 'entity' is not a valid module name",
    "error: 'go' is used twice (input and input)",
    "error: input 'signal' is not a valid VHDL name",
    'error: p: y = go is not a constant',
    'warning: place lonely is not connected',
  ], 'places and transitions may be reserved words (begin, process): prefixed in the HDL');
});

test('the token game: enabled transitions (tokens, weights, inhibitors, capacities, guards), fire, deadlock', () => {
  const m = conflict();
  let k = initialMarking(m);
  assert.deepEqual(k, { a: 2, b: 0, c: 0 });
  assert.deepEqual(enabledTransitions(m, k), ['t1', 't2'], 'whatever the inputs');
  assert.deepEqual(enabledTransitions(m, k, { x: 0n, y: 1n }), ['t2']);
  k = fire(m, k, 't2'); k = fire(m, k, 't2');
  assert.deepEqual(k, { a: 0, b: 0, c: 2 });
  assert.equal(isEnabled(m, k, 't2'), false, 'no token left');
  assert.equal(isEnabled(m, k, 't3'), true, 'b empty: not inhibited');
  k = fire(m, { a: 0, b: 1, c: 1 }, 't4');
  assert.deepEqual(k, { a: 2, b: 0, c: 1 }, 'a weight of 2 put');
  assert.equal(isEnabled(m, k, 't3'), false, 'a is full: t3 would put a third token');
  assert.equal(isEnabled(m, { a: 0, b: 1, c: 1 }, 't3'), false, 'inhibited while b holds a token');
  assert.equal(isEnabled(m, { a: 2, b: 0, c: 2 }, 't2'), false, 'c is full (capacity 2)');
  assert.ok(isDeadlock(normalizePetri({ name: 'd', places: [{ id: 'p', name: 'p' }], transitions: [{ id: 't', name: 't' }], arcs: [{ id: 'a', from: 'p', to: 't' }] }), { p: 0 }));
  assert.deepEqual(outputsOf(m, { a: 1, b: 1, c: 0 }), { st: 3n }, 'the values of the marked places ORed');
});

test('the clock step: in priority order, tokens taken only if still there, tokens put at the end', () => {
  const m = conflict();
  // x and y: t1 (higher priority) takes both tokens of a, t2 finds none
  assert.deepEqual(clockStep(m, { a: 2, b: 0, c: 0 }, { x: 1n, y: 1n }), { marking: { a: 0, b: 1, c: 0 }, fired: ['t1'] });
  // y only: t2 takes one token (one firing a step)
  assert.deepEqual(clockStep(m, { a: 2, b: 0, c: 0 }, { x: 0n, y: 1n }), { marking: { a: 1, b: 0, c: 1 }, fired: ['t2'] });
  // a token put this step is not taken in the same step (t3 puts into a, t2 does not see it)
  assert.deepEqual(clockStep(m, { a: 0, b: 0, c: 1 }, { x: 0n, y: 1n }), { marking: { a: 1, b: 0, c: 0 }, fired: ['t3'] });
});

function testbench(m, vectors, lower) {
  const nm = s => (lower ? s.toLowerCase() : s);
  const vec = w => (w > 1 ? `[${w - 1}:0] ` : '');
  const L = ['module tb;', '  reg clk = 0; reg rst = 1;'];
  for (const i of m.inputs) L.push(`  reg ${vec(i.width)}i_${i.name} = 0;`);
  for (const o of m.outputs) L.push(`  wire ${vec(o.width)}o_${o.name};`);
  const conns = [`.${nm(m.clock)}(clk)`, `.${nm(m.reset.name)}(rst)`, ...m.inputs.map(i => `.${nm(i.name)}(i_${i.name})`), ...m.outputs.map(o => `.${nm(o.name)}(o_${o.name})`)];
  L.push(`  ${nm(m.name)} dut(${conns.join(', ')});`, '  always #5 clk = ~clk;', '  initial begin', '    #12 rst = 0;');
  for (const v of vectors) L.push(`    ${m.inputs.map(i => `i_${i.name} = ${i.width}'d${v[i.name]};`).join(' ')} #2 $display("${m.outputs.map(() => '%b').join('_')}", ${m.outputs.map(o => `o_${o.name}`).join(', ')}); @(posedge clk); #1;`);
  L.push('    $finish;', '  end', 'endmodule');
  return L.join('\n');
}
const fmt = (m, o) => m.outputs.map(x => o[x.name].toString(2).padStart(x.width, '0')).join('_');
function model(m, vectors) {
  let k = initialMarking(m), fired = [];
  const out = [];
  for (const v of vectors) {
    out.push(fmt(m, outputsOf(m, k, fired)));
    const env = Object.fromEntries(Object.entries(v).map(([n, x]) => [n, BigInt(x)]));
    ({ marking: k, fired } = clockStep(m, k, env));
  }
  return out;
}
let seed = 7;
const rnd = () => { seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff; return seed >> 16; };

test('the HDL simulates like the net: VHDL and Verilog, random inputs (counters, pulses, priorities, inhibitors)', () => {
  for (const m of [normalizePetri(newPetri('ctl')), prodCons(), conflict()]) {
    const vectors = Array.from({ length: 60 }, () => Object.fromEntries(m.inputs.map(i => [i.name, rnd() % (1 << i.width)])));
    const want = model(m, vectors);
    for (const lang of ['vhdl', 'verilog']) {
      const g = generatePetri(m, lang);
      const r = simulate([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', text: g.code }, { path: 'tb.v', text: testbench(m, vectors, lang === 'vhdl') }], 'tb', { until: 1e8 });
      assert.deepEqual(r.errors, [], `${m.name} ${lang}: ${r.errors.join('; ')}`);
      const got = r.sim.log.map(e => String(e.text).trim()).filter(s => /^[01xz_]+$/.test(s));
      assert.deepEqual(got, want, `${m.name} ${lang}`);
    }
  }
});

test('PNML: exported and read back the same; a net from another tool (no Silinx parts) read as a P/T net', () => {
  for (const m of [prodCons(), conflict()]) assert.deepEqual(fromPnml(toPnml(m)), m);
  const pipe = `<?xml version="1.0"?><pnml><net id="Net-One" type="P/T net">
    <place id="P0"><graphics><position x="90" y="60"/></graphics><name><value>P0</value></name><initialMarking><value>Default,2</value><text>2</text></initialMarking></place>
    <place id="P1"><name><text>P1</text></name></place>
    <transition id="T0"><name><text>T0</text></name><graphics><position x="210" y="60"/></graphics></transition>
    <arc id="P0 to T0" source="P0" target="T0"><inscription><text>2</text></inscription></arc>
    <arc id="T0 to P1" source="T0" target="P1"/></net></pnml>`;
  const n = fromPnml(pipe);
  assert.equal(n.name, 'Net_One');
  assert.deepEqual(n.places.map(p => [p.id, p.name, p.tokens, p.capacity, p.x, p.y]), [['P0', 'P0', 2, 2, 90, 60], ['P1', 'P1', 0, 1, n.places[1].x, n.places[1].y]]);
  assert.deepEqual(n.arcs.map(a => [a.from, a.to, a.weight]), [['P0', 'T0', 2], ['T0', 'P1', 1]]);
  assert.deepEqual(clockStep(n, initialMarking(n), {}).marking, { P0: 0, P1: 1 });
});

test('the HDL: reserved words as names of places and transitions, multi-bit pulse outputs (VHDL and Verilog)', () => {
  const m = normalizePetri({ name: 'rw', inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'code', width: 3 }, { name: 'act', width: 1 }],
    places: [{ id: 'a', name: 'begin', tokens: 1, outputs: { act: '1' } }, { id: 'b', name: 'always' }],
    transitions: [{ id: 't1', name: 'process', guard: 'go', outputs: { code: '5' } }, { id: 't2', name: 'module', outputs: { code: '2' } }],
    arcs: [{ id: 'a1', from: 'a', to: 't1' }, { id: 'a2', from: 't1', to: 'b' }, { id: 'a3', from: 'b', to: 't2' }, { id: 'a4', from: 't2', to: 'a' }] });
  assert.deepEqual(validatePetri(m), []);
  const vectors = Array.from({ length: 40 }, () => ({ go: rnd() % 2 }));
  const want = model(m, vectors);
  assert.ok(want.includes('101_0') && want.includes('010_1'), 'both pulses seen: ' + want.join(' '));
  for (const lang of ['vhdl', 'verilog']) {
    const g = generatePetri({ ...m, lang }, lang);
    assert.match(g.code, /pl_begin/);
    assert.match(g.code, /fired_process/);
    const r = simulate([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', text: g.code }, { path: 'tb.v', text: testbench(m, vectors, lang === 'vhdl') }], 'tb', { until: 1e8 });
    assert.deepEqual(r.errors, [], `${lang}: ${r.errors.join('; ')}`);
    assert.deepEqual(r.sim.log.map(e => String(e.text).trim()).filter(s => /^[01xz_]+$/.test(s)), want, lang);
  }
});

test('a net with ports and nothing else (the Petri Net Wizard, #208): valid, its VHDL and Verilog compile', () => {
  const m = normalizePetri({ name: 'ctl', inputs: [{ name: 'go', width: 1 }, { name: 'sel', width: 3 }], outputs: [{ name: 'busy', width: 1 }, { name: 'st', width: 2 }], places: [], transitions: [], arcs: [] });
  assert.deepEqual(validatePetri(m), []);
  for (const lang of ['vhdl', 'verilog']) {
    const g = generatePetri(m, lang);
    const tb = 'module tb; reg clk = 0, rst = 1, go = 0; reg [2:0] sel = 0; wire busy; wire [1:0] st;\n' +
      `  ctl dut(.clk(clk), .rst(rst), .go(go), .sel(sel), .busy(busy), .st(st));\n  always #5 clk = ~clk;\n  initial begin #12 rst = 0; #20 $display("%b_%b", busy, st); $finish; end\nendmodule`;
    const r = simulate([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', text: g.code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors, [], `${lang}: ${r.errors.join('; ')}`);
    assert.deepEqual(r.sim.log.map(e => String(e.text).trim()).filter(s => /^[01xz_]+$/.test(s)), ['0_00'], lang);
  }
});

// a sequence that ends: idle → start → work → stop → over, no way back
const ending = () => normalizePetri({
  name: 'ending', inputs: [{ name: 'go', width: 1 }], outputs: [],
  places: [{ id: 'p1', name: 'idle', tokens: 1 }, { id: 'p2', name: 'work' }, { id: 'p3', name: 'over' }],
  transitions: [{ id: 't1', name: 'start', guard: 'go' }, { id: 't2', name: 'stop' }],
  arcs: [{ id: 'a1', from: 'p1', to: 't1' }, { id: 'a2', from: 't1', to: 'p2' }, { id: 'a3', from: 'p2', to: 't2' }, { id: 'a4', from: 't2', to: 'p3' }],
});
const said = diags => diags.map(d => `${d.severity}: ${d.message}${d.ref ? ` [${d.ref.id}]` : ''}`);

test('#2803 the validation: a transition not connected; an arc that takes or puts more tokens than its place holds', () => {
  const m = ending();
  m.transitions.push({ ...m.transitions[1], id: 't3', name: 'alone' });
  m.arcs.push({ id: 'a5', from: 'p3', to: 't2', weight: 2 }, { id: 'a6', from: 't1', to: 'p3', weight: 3 });
  assert.deepEqual(said(validatePetri(normalizePetri(m))), [
    'warning: transition start never fires: it puts 3 tokens into place over, whose capacity is 1 [t1]',
    'warning: transition stop never fires: it takes 2 tokens from place over, whose capacity is 1 [t2]',
    'warning: transition alone is not connected [t3]',
  ]);
});

test('#2803 the Check: the validation, then the token game\'s transitions that never fire and its first deadlock', () => {
  assert.deepEqual(checkPetri(newPetri('ctl')), [], 'a new net: none');
  assert.deepEqual(checkPetri(prodCons()), []);
  assert.deepEqual(checkPetri(conflict()), []);
  assert.deepEqual(said(checkPetri(ending())), ['warning: the net can reach a deadlock, no transition able to fire: after start, stop']);
  // no token at all: every transition dead, a deadlock at once
  const none = ending(); none.places[0].tokens = 0;
  assert.deepEqual(said(checkPetri(none)), [
    'warning: transition start never fires: no reachable marking enables it [t1]',
    'warning: transition stop never fires: no reachable marking enables it [t2]',
    'warning: the net can reach a deadlock, no transition able to fire: at once',
  ]);
  // a transition the validation says never fires: not twice
  const heavy = ending(); heavy.arcs[2].weight = 2;
  assert.deepEqual(said(checkPetri(normalizePetri(heavy))), [
    'warning: transition stop never fires: it takes 2 tokens from place work, whose capacity is 1 [t2]',
    'warning: the net can reach a deadlock, no transition able to fire: after start',
  ]);
  // an error: the validation's only; a graph explored in part: nothing of the token game
  const bad = ending(); bad.transitions[0].guard = 'go &';
  assert.deepEqual(said(checkPetri(bad)), ["error: transition start: guard 'go &': unexpected end of expression [t1]"]);
  assert.deepEqual(checkPetri(ending(), { maxStates: 2 }), []);
  assert.deepEqual(checkPetri(normalizePetri({ name: 'empty', places: [], transitions: [], arcs: [] })), []);
});
