// Tests for core/fsm.js: FSM bubble diagrams (model, validation, condition analysis, tables, HDL
// generation simulated against the reference model, HDL -> diagram read-back, ASM conversion).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newFsm, normalizeFsm, validateFsm, analyzeFsm, fsmErrors, parseLabel, parseOutputs, formatOutputs, stepFsm, simulateFsm,
  generateFsm, fsmFromHdl, sameFsm, fsmEncoding, transitionTable, stateTable, encodedTable, truthTablesOf, toCsv,
  fsmToAsm, asmToFsm, autoLayout, evalCond, parseCond, FSM_ENCODINGS, STATE_R,
} from '../core/fsm.js';
import { validate as validateAsm, generate as generateAsm } from '../core/asm.js';
import { simulate } from '../core/compile.js';

// ---------------------------------------------------------------------------------------
// Machines
// ---------------------------------------------------------------------------------------

/** "101" detector (overlapping), Mealy output z, plus a 2-bit counter-like output on a bus input. */
function mealy101() {
  return normalizeFsm({
    name: 'det101', type: 'mealy', lang: 'vhdl',
    inputs: [{ name: 'x', width: 1 }],
    outputs: [{ name: 'z', width: 1, default: '0' }],
    states: [{ id: 'a', name: 'S0', x: 100, y: 100 }, { id: 'b', name: 'S1', x: 300, y: 100 }, { id: 'c', name: 'S10', x: 500, y: 100 }],
    transitions: [
      { id: 't1', from: 'a', to: 'b', cond: 'x' },
      { id: 't2', from: 'b', to: 'c', cond: '!x' },
      { id: 't3', from: 'c', to: 'b', cond: 'x', outputs: { z: '1' } },
      { id: 't4', from: 'c', to: 'a', cond: 'not x' },
    ],
    initial: 'a',
  });
}

/** Moore machine with a bus input and a bus output, overlapping conditions (priority) and a reset to a non-first state. */
function mooreBus() {
  return normalizeFsm({
    name: 'ctl', type: 'moore', lang: 'verilog', reset: { name: 'rst_n', active: 'low', sync: true },
    inputs: [{ name: 'go', width: 1 }, { name: 'op', width: 2 }],
    outputs: [{ name: 'busy', width: 1, default: '0' }, { name: 'sel', width: 2, default: "2'b00" }],
    states: [
      { id: 'w', name: 'WAIT', x: 0, y: 0, outputs: { sel: "2'b11" } },
      { id: 'i', name: 'IDLE', x: 0, y: 0 },
      { id: 'r', name: 'RUN', x: 0, y: 0, outputs: { busy: '1', sel: '1' } },
      { id: 'd', name: 'DONE', x: 0, y: 0, outputs: { sel: '2' } },
    ],
    transitions: [
      { id: 't1', from: 'i', to: 'r', cond: 'go && op != 0' },
      { id: 't2', from: 'i', to: 'w', cond: 'go' },                 // overlaps t1: t1 has priority
      { id: 't3', from: 'w', to: 'i', cond: '!go' },
      { id: 't4', from: 'r', to: 'd', cond: 'op[1] == 1 || op == "01"' },
      { id: 't5', from: 'r', to: 'r', cond: 'op == 0' },
      { id: 't6', from: 'd', to: 'i', cond: '' },
    ],
    initial: 'i',
  });
}

/** Mealy machine with Moore outputs too, a bus output and unconditional transitions. */
function mixed() {
  return normalizeFsm({
    name: 'mix', type: 'mealy',
    inputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }, { name: 'n', width: 3 }],
    outputs: [{ name: 'y', width: 1, default: '0' }, { name: 'q', width: 3, default: '5' }],
    states: [
      { id: 's0', name: 'A', outputs: { q: '0' } }, { id: 's1', name: 'B' }, { id: 's2', name: 'C', outputs: { y: '1' } },
    ],
    transitions: [
      { id: 't1', from: 's0', to: 's1', cond: 'a & b', outputs: { y: '1', q: '7' } },
      { id: 't2', from: 's0', to: 's2', cond: 'n > 4', outputs: { q: "3'b010" } },
      { id: 't3', from: 's1', to: 's2', cond: 'n + 1 == 0', outputs: {} },
      { id: 't4', from: 's1', to: 's0', cond: 'a ^ b' },
      { id: 't5', from: 's2', to: 's0', cond: '', outputs: { q: '1' } },
    ],
    initial: 's0',
  });
}

const errorsOf = (m) => fsmErrors(m).map((d) => d.message);
const messages = (m, sev) => validateFsm(m).filter((d) => !sev || d.severity === sev).map((d) => d.message);

// ---------------------------------------------------------------------------------------
// Simulation helpers: random inputs through a Verilog testbench, outputs sampled each cycle
// ---------------------------------------------------------------------------------------

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }

function randomVectors(m, n, seed) {
  const r = rng(seed);
  const cur = {};
  const out = [];
  for (let c = 0; c < n; c++) {
    for (const i of m.inputs) if (cur[i.name] == null || r() % 3 === 0) cur[i.name] = r() % (1 << i.width);
    out.push({ ...cur });
  }
  return out;
}

function testbench(m, vectors, lower) {
  const nm = (s) => (lower ? s.toLowerCase() : s);
  const vec = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const on = m.reset.active === 'high' ? 1 : 0;
  const L = ['module tb;', `  reg clk = 0; reg rst = ${on};`];
  for (const i of m.inputs) L.push(`  reg ${vec(i.width)}i_${i.name} = 0;`);
  for (const o of m.outputs) L.push(`  wire ${vec(o.width)}o_${o.name};`);
  const conns = [`.${nm(m.clock)}(clk)`, `.${nm(m.reset.name)}(rst)`, ...m.inputs.map((i) => `.${nm(i.name)}(i_${i.name})`), ...m.outputs.map((o) => `.${nm(o.name)}(o_${o.name})`)];
  L.push(`  ${nm(m.name)} dut(${conns.join(', ')});`, '  always #5 clk = ~clk;', '  initial begin', `    #12 rst = ${1 - on};`);
  const fmt = m.outputs.map(() => '%b').join('_');
  for (const v of vectors) {
    const asg = m.inputs.map((i) => `i_${i.name} = ${i.width}'d${v[i.name]};`).join(' ');
    L.push(`    ${asg} #2 $display("${fmt}", ${m.outputs.map((o) => `o_${o.name}`).join(', ')}); @(posedge clk); #1;`);
  }
  L.push('    $finish;', '  end', 'endmodule');
  return L.join('\n');
}

/** Outputs per cycle of the generated HDL (strings like '1_01'). */
function runHdl(code, lang, m, vectors) {
  const tb = testbench(m, vectors, lang === 'vhdl');
  const r = simulate([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', text: code }, { path: 'tb.v', text: tb }], 'tb', { until: 1e8 });
  assert.deepEqual(r.errors, [], `${lang} simulation errors`);
  return r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz_]+$/.test(s));
}
/** The same from the reference model. */
function runModel(m, vectors) {
  return simulateFsm(m, vectors).map((row) => m.outputs.map((o) => row.outputs[o.name].toString(2).padStart(o.width, '0')).join('_'));
}

// ---------------------------------------------------------------------------------------
// Model and helpers
// ---------------------------------------------------------------------------------------

test('newFsm: a valid Moore machine; normalizeFsm fills every field', () => {
  const m = newFsm('det11', 'verilog');
  assert.equal(m.kind, 'fsm');
  assert.equal(m.type, 'moore');
  assert.equal(m.lang, 'verilog');
  assert.equal(m.states.length, 3);
  assert.deepEqual(errorsOf(m), []);
  assert.deepEqual(messages(m), []);
  const n = normalizeFsm({ states: [{ id: 'q', name: 'Q', outputs: ['z = 1', 'w'] }], transitions: [{ from: 'q', to: 'q', cond: 'true' }] });
  assert.equal(n.initial, 'q');
  assert.deepEqual(n.states[0].outputs, { z: '1', w: '1' });
  assert.equal(n.transitions[0].cond, '');
  assert.equal(n.encoding, 'binary');
  assert.equal(n.style, '3process');
  assert.deepEqual(n.reset, { name: 'rst', active: 'high', sync: false });
});

test('labels: "condition / outputs", output lists', () => {
  assert.deepEqual(parseLabel('x && !y / z=1, w = 2\'b10'), { cond: 'x && !y', outputs: { z: '1', w: "2'b10" }, error: undefined });
  assert.deepEqual(parseLabel('a /= b').cond, 'a /= b');          // VHDL "not equal" is not the separator
  assert.deepEqual(parseLabel('a /= b / z').outputs, { z: '1' });
  assert.equal(parseLabel('1 / z=1').cond, '');
  assert.deepEqual(parseLabel('/ z').outputs, { z: '1' });
  assert.deepEqual(parseOutputs('z; y=0\nw := 3').outputs, { z: '1', y: '0', w: '3' });
  assert.ok(parseOutputs('3 = z').error);
  assert.equal(formatOutputs({ z: '1', w: "2'b10" }), "z=1, w=2'b10");
});

test('conditions: Verilog width rules, bit selections, words and VHDL operators', () => {
  const W = (n) => ({ x: 1, y: 2, n: 3 }[n] ?? 1);
  const ev = (t, env) => evalCond(parseCond(t).ast, Object.fromEntries(Object.entries(env).map(([k, v]) => [k, BigInt(v)])), W);
  assert.equal(ev('', {}), true);
  assert.equal(ev('x and not y[1]', { x: 1, y: 1 }), true);
  assert.equal(ev('y = "10"', { y: 2 }), true);
  assert.equal(ev('y /= 2', { y: 2 }), false);
  assert.equal(ev('y', { y: 0 }), false);
  assert.equal(ev('y', { y: 2 }), true);
  assert.equal(ev("n + 3'd1 == 3'd0", { n: 7 }), true);       // 3-bit context: wraps
  assert.equal(ev('n + 1 == 8', { n: 7 }), true);             // an unsized literal is 32 bits wide: no wrap
  assert.equal(ev('n + 1 == 0', { n: 7 }), false);
  assert.equal(ev('~x', { x: 1 }), false);
  assert.equal(ev('y[1:0] > 1', { y: 3 }), true);
});

// ---------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------

test('validation: names, widths, initial state, expressions and output values (errors)', () => {
  const bad = normalizeFsm({
    name: 'my fsm', inputs: [{ name: 'x', width: 1 }, { name: 'X', width: 1 }, { name: 'begin', width: 1 }, { name: 'd', width: 40 }],
    outputs: [{ name: 'z', width: 1, default: 'x' }, { name: 'state_reg', width: 1 }],
    states: [{ id: 'a', name: 'A' }, { id: 'b', name: 'a' }, { id: 'c', name: '2nd' }],
    transitions: [
      { id: 't1', from: 'a', to: 'b', cond: 'x &&' },
      { id: 't2', from: 'a', to: 'c', cond: 'foo' },
      { id: 't3', from: 'b', to: 'a', cond: 'z', outputs: { z: '1' } },
      { id: 't4', from: 'b', to: 'zz' },
      { id: 't5', from: 'c', to: 'a', cond: 'x[3]' },
    ],
    initial: 'a',
  });
  const e = errorsOf(bad);
  const has = (re) => assert.ok(e.some((x) => re.test(x)), `${re} in\n${e.join('\n')}`);
  has(/^The module name 'my fsm' is not a valid name/);
  has(/^The name 'X' is used twice/);
  has(/^Input 'begin' is a reserved word in Verilog and VHDL$/);
  has(/^Input 'd': the width must be a whole number from 1 to 32$/);
  has(/^Output 'z': the default value 'x' must be a constant/);
  has(/^The name 'state_reg' is used twice/);
  has(/^Two states are named 'a'/);
  has(/^State '2nd' is not a valid name/);
  has(/^Transition A → a: the condition 'x &&' is not valid \(unexpected end of expression\)$/);
  has(/^Transition A → 2nd: 'foo' in the condition 'foo' is not an input$/);
  has(/^Transition a → A: 'z' is an output; conditions can only test inputs$/);
  has(/^Transition a → A has outputs \(z=1\), but this is a Moore machine/);
  has(/^A transition starts or ends at a state that does not exist$/);
  has(/^Transition 2nd → A: 'x' has 1 bit/);
  assert.match(errorsOf({ states: [] }).join('\n'), /The diagram has no states/);
  const m = mealy101();
  m.states[0].outputs = { q: '1' };
  m.transitions[2].outputs = { z: 'x' };
  assert.deepEqual(errorsOf(m), ["State S0: 'q' is not an output", "Transition S10 → S1: the value 'x' of z must be a constant (e.g. 0, 1, 4'b1010, 5)"]);
  assert.throws(() => generateFsm(m, 'vhdl'), /has 2 error\(s\)/);
});

test('validation: unreachable states, states without exit, outputs never set (warnings)', () => {
  const m = newFsm('d');
  m.states.push({ id: 'x1', name: 'LOST', x: 0, y: 0, outputs: {} });
  m.transitions.push({ id: 'tx', from: 'x1', to: 's1', cond: '' });
  m.states[2].outputs = {};
  m.transitions = m.transitions.filter((t) => t.from !== 's3');
  const w = messages(m, 'warning');
  assert.deepEqual(w.sort(), [
    "Output 'z' is never set: it always keeps its default value 0",
    'State LOST cannot be reached from the initial state S0',
    'State S2 has no exit: once there, the machine stays in it until a reset',
  ]);
  // a state reached only through a condition that is never true is unreachable too
  const n = newFsm('d');
  n.transitions.find((t) => t.id === 't3').cond = 'x && !x';
  const w2 = messages(n, 'warning');
  assert.ok(w2.includes("Transition S1 → S2 is never taken: its condition 'x && !x' is never true"), w2.join('\n'));
  assert.ok(w2.includes('State S2 cannot be reached from the initial state S0'), w2.join('\n'));
});

test('condition analysis: overlapping and incomplete conditions, transitions never taken', () => {
  const m = mooreBus();
  const w = messages(m, 'warning');
  assert.deepEqual(w, ["State IDLE: the transitions to RUN ('go && op != 0') and to WAIT ('go') are both true when go=1, op=01; the one listed first (to RUN) is taken"]);
  const i = messages(m, 'info');
  assert.deepEqual(i, [
    'State WAIT: no transition is true when go=1; the machine stays in WAIT',
    'State IDLE: no transition is true when go=0, op=00 (and 3 other combination(s)); the machine stays in IDLE',
  ]);
  // RUN: op[1] || op == 1 covers 1, 2, 3; op == 0 the rest: complete, no info
  const an = analyzeFsm(m);
  const run = an.states.find((s) => s.id === 'r');
  assert.equal(run.stay.count, 0);
  assert.deepEqual(run.overlaps, []);
  // a transition after an unconditional one is never taken
  const n = mooreBus();
  n.transitions.push({ id: 't7', from: 'd', to: 'w', cond: 'go' });
  assert.ok(messages(n, 'warning').includes('Transition DONE → WAIT is never taken: the transitions listed before it are always taken first'));
  // wide inputs: checked on random combinations (info)
  const big = normalizeFsm({ inputs: [{ name: 'a', width: 12 }, { name: 'b', width: 12 }], outputs: [{ name: 'z', width: 1 }],
    states: [{ id: 's', name: 'S', outputs: { z: '1' } }, { id: 't', name: 'T' }],
    transitions: [{ from: 's', to: 't', cond: 'a == b' }, { from: 't', to: 's', cond: 'a != b' }], initial: 's' });
  assert.ok(messages(big, 'info').some((x) => /State S: the conditions use 24 input bits; they were checked on \d+ random combinations, not on all of them/.test(x)));
});

// ---------------------------------------------------------------------------------------
// Reference model
// ---------------------------------------------------------------------------------------

test('stepFsm / simulateFsm: priority, staying, Moore and Mealy outputs (Mealy overrides Moore)', () => {
  const m = mixed();
  let r = stepFsm(m, 's0', { a: 1, b: 1, n: 7 });
  assert.equal(r.next, 's1');                      // first true condition
  assert.deepEqual(r.outputs, { y: 1n, q: 7n });
  r = stepFsm(m, 's0', { a: 0, b: 1, n: 1 });
  assert.equal(r.next, 's0');                      // nothing true: stays, Moore output only
  assert.equal(r.transition, null);
  assert.deepEqual(r.outputs, { y: 0n, q: 0n });
  r = stepFsm(m, 's2', {});
  assert.deepEqual(r.outputs, { y: 1n, q: 1n });
  const seq = simulateFsm(mealy101(), [1, 0, 1, 0, 1, 1].map((x) => ({ x })));
  assert.deepEqual(seq.map((s) => [s.state, Number(s.outputs.z)]), [['a', 0], ['b', 0], ['c', 1], ['b', 0], ['c', 1], ['b', 0]]);
});

// ---------------------------------------------------------------------------------------
// HDL generation, simulated
// ---------------------------------------------------------------------------------------

test('generated HDL: readable header, style, encoding constants', () => {
  const m = mealy101();
  const g = generateFsm(m, 'vhdl', { source: 'det101.fsm.json' });
  assert.equal(g.filename, 'det101.vhd');
  assert.match(g.code, /-- Description : Mealy finite state machine generated from the state diagram det101\.fsm\.json/);
  assert.match(g.code, /-- Style {7}: 3 processes: state register, next-state logic, output logic/);
  assert.match(g.code, /-- {3}S10 {2}: x -> S1 \/ z = 1/);
  assert.match(g.code, /-- {3}S0 {3}: otherwise -> S0 \(stays\)/);
  assert.match(g.code, /constant S_S10 : state_t := "10";/);
  assert.match(g.code, /next_state_logic : process \(state_reg, x\)/);
  assert.match(g.code, /output_logic : process \(state_reg, x\)/);
  assert.match(g.code, /elsif x = '0' then/);
  const g2 = generateFsm({ ...m, style: '2process', encoding: 'onehot' }, 'verilog');
  assert.equal(g2.filename, 'det101.v');
  assert.match(g2.code, /\/\/ Style {7}: 2 processes: state register \+ next-state and output logic/);
  assert.match(g2.code, /localparam \[2:0\] S_S10 = 3'b100;/);
  assert.doesNotMatch(g2.code, /- output logic\n/);
  const e = generateFsm({ ...m, encoding: 'enum' }, 'vhdl');
  assert.match(e.code, /type state_t is \(S_S0, S_S1, S_S10\);/);
  assert.doesNotMatch(e.code, /fsm_encoding/);
  const gray = fsmEncoding({ ...mooreBus(), encoding: 'gray' });
  assert.deepEqual(gray.map((s) => [s.name, s.bits]), [['IDLE', '00'], ['WAIT', '01'], ['RUN', '11'], ['DONE', '10']]);
});

test('generated HDL simulates like the diagram: Moore and Mealy, VHDL and Verilog, every encoding, both styles (random inputs)', () => {
  let n = 0;
  for (const [mk, seed] of [[mealy101, 3], [mooreBus, 5], [mixed, 11]]) {
    for (const encoding of FSM_ENCODINGS) {
      for (const style of ['3process', '2process']) {
        for (const lang of ['vhdl', 'verilog']) {
          const m = { ...mk(), encoding, style };
          const vectors = randomVectors(m, 120, seed + n);
          const want = runModel(m, vectors);
          const got = runHdl(generateFsm(m, lang).code, lang, m, vectors);
          assert.deepEqual(got, want, `${m.name} ${encoding} ${style} ${lang}`);
          n++;
        }
      }
    }
  }
  assert.equal(n, 48);
});

// ---------------------------------------------------------------------------------------
// HDL -> diagram
// ---------------------------------------------------------------------------------------

test('round trip: the generated HDL reads back to the same diagram (every encoding, style and language)', () => {
  for (const mk of [mealy101, mooreBus, mixed, () => newFsm('det11')]) {
    for (const encoding of FSM_ENCODINGS) {
      for (const style of ['3process', '2process']) {
        for (const lang of ['vhdl', 'verilog']) {
          const m = { ...mk(), encoding, style, lang };
          const g = generateFsm(m, lang);
          const r = fsmFromHdl(g.code, { lang, previous: m });
          assert.ok(sameFsm(r.model, m), `${m.name} ${encoding} ${style} ${lang}\n${JSON.stringify(r.model.transitions)}`);
          assert.deepEqual(r.warnings, []);
          // regenerating gives the same file
          assert.equal(generateFsm(r.model, lang).code, g.code);
        }
      }
    }
  }
});

test('read-back without the previous diagram: same behaviour, laid out, implicit stays', () => {
  for (const mk of [mealy101, mooreBus, mixed]) {
    for (const lang of ['vhdl', 'verilog']) {
      const m = { ...mk(), lang };
      const r = fsmFromHdl(generateFsm(m, lang).code, { lang });
      assert.deepEqual(errorsOf(r.model), []);
      assert.equal(r.model.type, m.type === 'mealy' || m.transitions.some((t) => Object.keys(t.outputs).length) ? 'mealy' : 'moore');
      const vectors = randomVectors(m, 200, 99);
      assert.deepEqual(runModel(r.model, vectors), runModel(m, vectors), `${m.name} ${lang}`);
      const xs = r.model.states.map((s) => `${s.x},${s.y}`);
      assert.equal(new Set(xs).size, xs.length, 'states at distinct positions');
    }
  }
  // explicit self-loops without outputs ("!x" back to S0) are implicit in the read-back diagram
  const r = fsmFromHdl(generateFsm(newFsm('det11'), 'vhdl').code, { lang: 'vhdl' });
  assert.deepEqual(r.model.transitions.map((t) => `${t.from}>${t.to}:${t.cond}`), ['s1>s2:x', 's2>s3:x', 's2>s1:!x', 's3>s1:!x']);
});

test('HDL edits read back: changed condition, new state, Mealy output added; non-FSM modules refused with the reason', () => {
  const m = { ...newFsm('det11'), lang: 'vhdl' };
  let code = generateFsm(m, 'vhdl').code;
  // a condition changed by hand: x = '1' -> x = '0' in S1
  code = code.replace(/(when S_S1 =>\n\s+if )x = '1'( then)/, "$1x = '0' and x = '0'$2");
  let r = fsmFromHdl(code, { lang: 'vhdl', previous: m });
  const t3 = r.model.transitions.find((t) => t.from === 's2' && t.to === 's3');
  assert.equal(t3.id, 't3');                      // ids and positions kept
  assert.ok(/x/.test(t3.cond) && evalCond(parseCond(t3.cond).ast, { x: 0n }, () => 1) && !evalCond(parseCond(t3.cond).ast, { x: 1n }, () => 1), t3.cond);
  assert.deepEqual(r.model.states.map((s) => [s.id, s.x, s.y]), m.states.map((s) => [s.id, s.x, s.y]));
  // unchanged states keep their transitions exactly (explicit self-loops included)
  assert.deepEqual(r.model.transitions.filter((t) => t.from === 's1'), m.transitions.filter((t) => t.from === 's1'));
  // a new state written in the HDL
  const v = generateFsm({ ...newFsm('det11'), lang: 'verilog' }, 'verilog').code
    .replace("localparam [1:0] S_S2 = 2'b10;", "localparam [1:0] S_S2 = 2'b10;\n    localparam [1:0] S_S3 = 2'b11;")
    .replace('S_S2: begin\n                if (x) begin\n                    state_next = S_S2;', 'S_S2: begin\n                if (x) begin\n                    state_next = S_S3;')
    .replace('            default: state_next = S_S0;', '            S_S3: state_next = S_S0;\n            default: state_next = S_S0;');
  r = fsmFromHdl(v, { lang: 'verilog', previous: { ...newFsm('det11'), lang: 'verilog' } });
  assert.deepEqual(r.model.states.map((s) => s.name), ['S0', 'S1', 'S2', 'S3']);
  assert.ok(r.model.transitions.some((t) => t.to === r.model.states[3].id && t.cond === 'x'));
  assert.ok(r.model.transitions.some((t) => t.from === r.model.states[3].id && t.to === 's1' && t.cond === ''));
  const s3 = r.model.states[3];
  assert.ok(s3.x > 0 && !r.model.states.slice(0, 3).some((s) => s.x === s3.x && s.y === s3.y));
  // a Mealy output added in the HDL makes it a Mealy machine
  const mm = mealy101();
  const c2 = generateFsm(mm, 'vhdl').code.replace(/(output_logic[\s\S]*?)( {12}when others =>)/, "$1            when S_S0 =>\n                if x = '1' then\n                    z <= '1';\n                end if;\n$2");
  assert.notEqual(c2, generateFsm(mm, 'vhdl').code);
  r = fsmFromHdl(c2, { lang: 'vhdl', previous: mm });
  assert.deepEqual(r.model.transitions.find((t) => t.id === 't1').outputs, { z: '1' });
  // not a state machine diagram: a register, an output computed from an input
  const reg = generateFsm(mm, 'verilog').code.replace('reg [1:0] state_next;', 'reg [1:0] state_next;\n    reg [3:0] cnt = 0;\n    always @(posedge clk) cnt <= cnt + 1;');
  assert.throws(() => fsmFromHdl(reg, { lang: 'verilog', previous: mm }), /process at line \d+ is not part of the state machine \(it drives 'cnt'\)/);
  const expr = generateFsm(mm, 'vhdl').code.replace("                    z <= '1';", '                    z <= x;');
  assert.throws(() => fsmFromHdl(expr, { lang: 'vhdl', previous: mm }), /the output z gets the value x; a state diagram only gives outputs constant values/);
});

// ---------------------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------------------

test('transition table and state table', () => {
  const m = mixed();
  const t = transitionTable(m);
  assert.deepEqual(t.columns, ['Present state', 'Code', 'Input condition', 'Next state', 'Next code', 'Outputs']);
  assert.deepEqual(t.rows.map((r) => [r.state, r.code, r.cond, r.next, r.nextCode, r.outputs]), [
    ['A', '00', 'a & b', 'B', '01', 'y=1, q=7'],
    ['A', '00', 'n > 4', 'C', '10', "q=3'b010"],
    ['A', '00', 'otherwise', 'A', '00', 'q=0'],
    ['B', '01', 'n + 1 == 0', 'C', '10', ''],
    ['B', '01', 'a ^ b', 'A', '00', ''],
    ['B', '01', 'otherwise', 'B', '01', ''],
    ['C', '10', '1', 'A', '00', 'y=1, q=1'],
  ]);
  const st = stateTable(mealy101());
  assert.equal(st.inputs, 'x');
  assert.deepEqual(st.combos, ['0', '1']);
  assert.deepEqual(st.rows.map((r) => [r.state, r.code, ...r.next, ...r.outputs]), [
    ['S0', '00', 'S0', 'S1', '0', '0'], ['S1', '01', 'S10', 'S1', '0', '0'], ['S10', '10', 'S0', 'S1', '0', '1']]);
  assert.equal(stateTable(normalizeFsm({ inputs: [{ name: 'a', width: 7 }], states: [{ id: 's', name: 'S' }] })), null);
  assert.equal(toCsv([['a', 'b,c'], ['"q"', 1]]), 'a,"b,c"\n"""q""",1\n');
});

test('encoded transition table (binary and gray) and the truth tables of the next-state bits and outputs', () => {
  const m = mooreBus();
  const bin = encodedTable(m);
  assert.deepEqual([bin.stateBits, bin.nextBits, bin.inputBits, bin.outputBits], [['q1', 'q0'], ['d1', 'd0'], ['go', 'op_1', 'op_0'], ['busy', 'sel_1', 'sel_0']]);
  assert.equal(bin.rows.length, 4 * 8);
  const enc = fsmEncoding(m);
  for (const r of bin.rows) {
    const s = enc.find((e) => e.bits === r.q);
    const env = { go: +r.in[0], op: parseInt(r.in.slice(1), 2) };
    const step = stepFsm(m, s.id, env);
    assert.equal(r.d, enc.find((e) => e.id === step.next).bits);
    assert.equal(r.out, `${step.outputs.busy}${step.outputs.sel.toString(2).padStart(2, '0')}`);
  }
  // gray: RUN is 11
  const gray = encodedTable({ ...m, encoding: 'gray' });
  assert.equal(gray.rows.find((r) => r.state === 'RUN').q, '11');
  // unused codes: don't cares
  const d3 = encodedTable(mealy101());
  assert.deepEqual(d3.rows.filter((r) => r.unused).map((r) => [r.q, r.d, r.out]), [['11', 'XX', 'X'], ['11', 'XX', 'X']]);
  assert.match(encodedTable({ ...m, encoding: 'onehot' }).error, /binary and gray/);
  // truth tables: inputs = state bits + input bits
  const tt = truthTablesOf(mealy101());
  assert.deepEqual(tt.tables.map((x) => [x.doc.name, x.doc.inputs, x.doc.outputs]), [['det101_next', ['q1', 'q0', 'x'], ['d1', 'd0']], ['det101_out', ['q1', 'q0', 'x'], ['z']]]);
  assert.equal(tt.tables[0].doc.table.d1, '001000XX');   // only S1 with x = 0 goes to S10
  assert.equal(tt.tables[0].doc.table.d0, '010101XX');
  assert.equal(tt.tables[1].doc.table.z, '000001XX');     // S10 with x = 1
  assert.deepEqual(truthTablesOf(m).tables.map((x) => x.doc.outputs), [['d1', 'd0'], ['busy', 'sel_1', 'sel_0']]);
  const wide = { ...m, inputs: [...m.inputs, { name: 'k', width: 2 }] };
  assert.equal(truthTablesOf(wide).error, 'A truth table has at most 6 inputs; this machine needs 7 (2 state bit(s) + 5 input bit(s))');
  // names of state bits avoid the input names
  const q = normalizeFsm({ inputs: [{ name: 'q0', width: 1 }], outputs: [{ name: 'z', width: 1 }], states: [{ id: 'a', name: 'A', outputs: { z: '1' } }, { id: 'b', name: 'B' }], transitions: [{ from: 'a', to: 'b', cond: 'q0' }, { from: 'b', to: 'a', cond: '!q0' }], initial: 'a' });
  assert.deepEqual(encodedTable(q).stateBits, ['qq0']);
});

// ---------------------------------------------------------------------------------------
// ASM chart conversion, layout
// ---------------------------------------------------------------------------------------

test('FSM -> ASM chart: valid chart that simulates the same; ASM chart -> FSM gives the same machine', () => {
  for (const mk of [mealy101, mooreBus, mixed]) {
    const m = mk();
    const asm = fsmToAsm(m);
    assert.deepEqual(validateAsm(asm).filter((d) => d.severity === 'error'), []);
    const vectors = randomVectors(m, 150, 21);
    assert.deepEqual(runHdl(generateAsm(asm, 'verilog').code, 'verilog', m, vectors), runModel(m, vectors), m.name);
    const back = asmToFsm(asm);
    assert.deepEqual(runModel(back, vectors), runModel(m, vectors), `${m.name} back`);
    assert.ok(sameFsm(asmToFsm(asm, { previous: m }), m), m.name);
  }
});

test('autoLayout: every state placed, no two circles overlap', () => {
  for (let n = 1; n <= 14; n += 3) {
    const states = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `S${i}` }));
    const transitions = states.map((s, i) => ({ from: s.id, to: `s${(i + 1) % n}`, cond: '' }));
    const m = autoLayout({ states, transitions, initial: 's0' });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = m.states[i], b = m.states[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 2 * STATE_R + 20, `n=${n}: ${a.name} / ${b.name}`);
    }
  }
});
