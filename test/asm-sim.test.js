// Tests of an ASM chart's simulation (core/asm-sim.js, #2880): the Simulate panel's and the MCP's semantics, compared
// cycle by cycle with the chart's generated HDL simulated in VHDL and in Verilog (random inputs, the outputs sampled
// before each clock edge), on the examples' charts and on edge cases; the path taken; the charts that cannot be
// simulated.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, validate } from '../core/asm.js';
import { fsmToAsm } from '../core/fsm-asm.js';
import { simulateFsm } from '../core/fsm.js';
import { simulate } from '../core/compile.js';
import { asmResetActive, asmSimEval, asmSimReset, asmSimStep, asmSimText, asmSimValue, prepareAsmSim, simulateAsm } from '../core/asm-sim.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

// ---------------------------------------------------------------------------------------------------- the charts
/** The blinky example's chart (synchronisers, debouncers, a generic, registers, every-cycle blocks), DEBOUNCE 2. */
function speedCtrl() {
  const m = readJson('examples/blinky/src/speed_ctrl.asm.json');
  m.generics[0].default = 2;
  return m;
}
/** The traffic example's state diagram as an ASM chart (Convert to ASM chart). */
const traffic = () => fsmToAsm(readJson('examples/traffic/src/traffic.fsm.json'));

/** Nested decisions, a conditional output on every path, a self-loop, a case box, a register, an asynchronous active-low reset. */
function nested() {
  return {
    version: 1, name: 'nested', lang: 'vhdl', clock: 'clk', reset: { name: 'rst_n', active: 'low', sync: false }, encoding: 'gray',
    inputs: [{ name: 'a', width: 1 }, { name: 'b', width: 1 }, { name: 'op', width: 2 }, { name: 'd', width: 4 }],
    outputs: [
      { name: 'st', width: 2, default: '0' }, { name: 'y', width: 3, default: '0' }, { name: 'z', width: 1, default: '0' },
      { name: 'acc', width: 4, default: '0', registered: true },
    ],
    registers: [{ name: 'cnt', width: 3, init: "3'b101" }],
    nodes: [
      { id: 's1', type: 'state', name: 'IDLE', actions: ['st = 0'] },
      { id: 'd1', type: 'decision', cond: 'a' },
      { id: 'd2', type: 'decision', cond: 'b && cnt != 0' },
      { id: 'o1', type: 'output', actions: ['y = 1', 'cnt = cnt - 1'] },
      { id: 'o2', type: 'output', actions: ['y = 2', 'z'] },
      { id: 'o3', type: 'output', actions: ['y = 3'] },
      { id: 's2', type: 'state', name: 'WORK', actions: ['st = 1', 'acc = acc + d'] },
      { id: 'c1', type: 'case', expr: 'op' },
      { id: 'o4', type: 'output', actions: ['y = 4'] },
      { id: 'o5', type: 'output', actions: ['y = cnt + 1', 'z = acc > 4\'d7'] },
      { id: 's3', type: 'state', name: 'DONE', actions: ['st = 2', 'acc = 0'] },
      { id: 'd3', type: 'decision', cond: 'b' },
    ],
    edges: [
      { from: 's1', to: 'd1' },
      { from: 'd1', to: 'd2', port: 'true' }, { from: 'd1', to: 'o3', port: 'false' },
      { from: 'd2', to: 'o1', port: 'true' }, { from: 'd2', to: 'o2', port: 'false' },
      { from: 'o1', to: 's2' }, { from: 'o2', to: 's1' }, { from: 'o3', to: 's1' },
      { from: 's2', to: 'c1' },
      { from: 'c1', to: 'o4', port: '00' }, { from: 'c1', to: 'o5', port: '01|10' }, { from: 'c1', to: 's3', port: 'others' },
      { from: 'o4', to: 's2' }, { from: 'o5', to: 's1' },
      { from: 's3', to: 'd3' }, { from: 'd3', to: 's3', port: 'true' }, { from: 'd3', to: 's1', port: 'false' },
    ],
    initial: 's1',
  };
}

/** Every-cycle blocks (the state's assignments win), shifts and Verilog sizing, a generic, a synchronised input. */
function datapath() {
  return {
    version: 1, name: 'dpath', lang: 'verilog', clock: 'clk', reset: { name: 'rst', active: 'high', sync: true }, encoding: 'onehot',
    generics: [{ name: 'K', default: 3 }, { name: 'LIM', default: 200 }],
    inputs: [{ name: 'a', width: 8 }, { name: 'n', width: 3 }, { name: 'b', width: 4 }, { name: 'go', width: 1, sync: true }],
    outputs: [
      { name: 'y', width: 8, default: '0' }, { name: 'z', width: 4, default: '0' }, { name: 'f', width: 1, default: '0' },
      { name: 'hi', width: 8, default: '0', registered: true }, { name: 'run', width: 1, default: '0' },
    ],
    registers: [{ name: 'acc', width: 8, init: '0' }, { name: 'sh', width: 3, init: '1' }],
    nodes: [
      { id: 's1', type: 'state', name: 'IDLE', actions: [] },
      { id: 'd1', type: 'decision', cond: 'go' },
      { id: 's2', type: 'state', name: 'RUN', actions: ['run', 'y = a << sh', 'hi = (acc + 1) >> 1'] },
      { id: 'd2', type: 'decision', cond: '(a << n) > 8\'d200 || acc >= LIM' },
      { id: 'o1', type: 'output', actions: ['z = b >> 1', 'acc = acc + K'] },
      { id: 'a1', type: 'always', name: 'calc', actions: ['y = (a + 1) >> 1'] },
      { id: 'd3', type: 'decision', cond: 'a >> n == 0' },
      { id: 'o2', type: 'output', actions: ['f = 1', 'sh = sh + 1'] },
      { id: 'o3', type: 'output', actions: ['z = (1 << n) - 1'] },
      { id: 'd4', type: 'decision', cond: "(b - 1) >> 1 == 4'd7" },
      { id: 'o6', type: 'output', actions: ['acc = (acc << 1) | 1'] },
    ],
    edges: [
      { from: 's1', to: 'd1' }, { from: 'd1', to: 's2', port: 'true' }, { from: 'd1', to: 's1', port: 'false' },
      { from: 's2', to: 'd2' }, { from: 'd2', to: 'o1', port: 'true' }, { from: 'd2', to: 's2', port: 'false' }, { from: 'o1', to: 's1' },
      { from: 'a1', to: 'd3' }, { from: 'd3', to: 'o2', port: 'true' }, { from: 'd3', to: 'o3', port: 'false' },
      { from: 'o2', to: 'o3' }, { from: 'o3', to: 'd4' }, { from: 'd4', to: 'o6', port: 'true' },
    ],
    initial: 's1',
  };
}

const CHARTS = { speedCtrl, traffic, nested, datapath };

// ---------------------------------------------------------------------------------------------------- the HDL's run
function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s; }; }
/** Random inputs (each kept a few cycles), the reset pulsed now and then when `pulses`. */
function vectorsFor(m, n, seed, pulses = false) {
  const r = rng(seed), cur = {}, out = [];
  const off = m.reset.active === 'high' ? 0 : 1;
  for (let c = 0; c < n; c++) {
    for (const i of m.inputs) if (cur[i.name] == null || r() % 3 === 0) cur[i.name] = r() % (2 ** i.width);
    out.push({ ...cur, [m.reset.name]: pulses && r() % 23 === 0 ? 1 - off : off });
  }
  return out;
}
/** The outputs before each clock edge of the generated HDL (the reset driven from the vectors), as '01_1010…'. */
function runHdl(m, lang, vectors) {
  const nm = (s) => (lang === 'vhdl' ? s.toLowerCase() : s);
  const vec = (w) => (w > 1 ? `[${w - 1}:0] ` : '');
  const on = m.reset.active === 'high' ? 1 : 0;
  const L = ['module tb;', `  reg clk = 0; reg rst = ${on};`];
  for (const i of m.inputs) L.push(`  reg ${vec(i.width)}i_${i.name} = 0;`);
  for (const o of m.outputs) L.push(`  wire ${vec(o.width)}o_${o.name};`);
  const conns = [`.${nm(m.clock)}(clk)`, `.${nm(m.reset.name)}(rst)`, ...m.inputs.map((i) => `.${nm(i.name)}(i_${i.name})`), ...m.outputs.map((o) => `.${nm(o.name)}(o_${o.name})`)];
  L.push(`  ${nm(m.name)} dut(${conns.join(', ')});`, '  always #5 clk = ~clk;', '  initial begin', `    #12 rst = ${1 - on};`);
  for (const v of vectors) {
    const asg = [...m.inputs.map((i) => `i_${i.name} = ${i.width}'d${v[i.name]};`), `rst = ${v[m.reset.name]};`].join(' ');
    L.push(`    ${asg} #2 $display("${m.outputs.map(() => '%b').join('_')}", ${m.outputs.map((o) => `o_${o.name}`).join(', ')}); @(posedge clk); #1;`);
  }
  L.push('    $finish;', '  end', 'endmodule');
  const { code } = generate(m, lang);
  const r = simulate([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', text: code }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e8 });
  assert.deepEqual(r.errors, [], `${m.name} ${lang}: simulation errors`);
  return r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01xz_]+$/.test(s));
}
const rowText = (m, row) => m.outputs.map((o) => row.outputs[o.name].toString(2).padStart(o.width, '0')).join('_');

// ---------------------------------------------------------------------------------------------------- tests
test('the charts are valid, with no warnings', () => {
  for (const [k, f] of Object.entries(CHARTS)) assert.deepEqual(validate(f()).map((d) => d.message), [], k);
});

for (const [k, f] of Object.entries(CHARTS)) {
  test(`${k}: the simulation equals the generated VHDL and Verilog, cycle by cycle`, () => {
    const m = f();
    const vectors = vectorsFor(m, 250, 11, k === 'nested' || k === 'datapath');
    const mine = simulateAsm(m, vectors).map((row) => rowText(m, row));
    for (const lang of ['vhdl', 'verilog']) {
      const hdl = runHdl(m, lang, vectors);
      assert.equal(hdl.length, vectors.length);
      const i = hdl.findIndex((x, c) => x !== mine[c]);
      assert.equal(i, -1, `${k} ${lang}: cycle ${i}: the HDL gives ${hdl[i]}, the simulation ${mine[i]}`);
    }
  });
}

test('traffic: the ASM chart simulates as its state diagram', () => {
  const f = readJson('examples/traffic/src/traffic.fsm.json');
  const m = fsmToAsm(f);
  const vectors = vectorsFor(m, 200, 5);
  const a = simulateAsm(m, vectors), b = simulateFsm(f, vectors);
  const name = (id) => f.states.find((s) => s.id === id).name;
  assert.deepEqual(a.map((r) => [r.state, r.next, Number(r.outputs.phase)]), b.map((r) => [name(r.state), name(r.next), Number(r.outputs.phase)]));
});

test('the path taken: the decisions tested, the exits followed, the conditional outputs lit, the next state', () => {
  const { sim } = prepareAsmSim(nested());
  const st = asmSimReset(sim);
  assert.deepEqual(st, { state: 's1', regs: { acc: 0n, cnt: 5n }, meta: {}, sync: {} });
  const id = (from, port = 'next') => nested().edges.findIndex((e) => e.from === from && (e.port ?? 'next') === port);
  const edgeId = (from, port) => `e${id(from, port) + 1}`;
  let r = asmSimEval(sim, st, { a: 1, b: 1, op: 0, d: 0, rst_n: 1 });
  assert.deepEqual(r.path, { nodes: ['d1', 'd2', 'o1'], edges: [edgeId('s1'), edgeId('d1', 'true'), edgeId('d2', 'true'), edgeId('o1')], outputs: ['o1'] });
  assert.equal(r.next, 's2');
  assert.deepEqual(r.outputs, { st: 0n, y: 1n, z: 0n, acc: 0n });
  assert.deepEqual(r.assigned, { acc: 0n, cnt: 4n });
  // a = 0: the other branch, its own conditional output; the state stays (a self-loop through o3)
  r = asmSimEval(sim, st, { a: 0, b: 1, op: 0, d: 0, rst_n: 1 });
  assert.deepEqual(r.path.nodes, ['d1', 'o3']);
  assert.equal(r.next, 's1');
  assert.deepEqual(r.outputs, { st: 0n, y: 3n, z: 0n, acc: 0n });
  // a case box: 01|10 takes o5, others DONE; Moore outputs and the register's next value
  let s2 = asmSimStep(sim, st, { a: 1, b: 1, op: 0, d: 0, rst_n: 1 }).st;
  assert.deepEqual(s2, { state: 's2', regs: { acc: 0n, cnt: 4n }, meta: {}, sync: {} });
  r = asmSimEval(sim, s2, { a: 0, b: 0, op: 2, d: 9, rst_n: 1 });
  assert.deepEqual(r.path.nodes, ['c1', 'o5']);
  assert.deepEqual(r.outputs, { st: 1n, y: 5n, z: 0n, acc: 0n });
  assert.equal(r.assigned.acc, 9n);
  r = asmSimEval(sim, s2, { a: 0, b: 0, op: 3, d: 9, rst_n: 1 });
  assert.deepEqual(r.path, { nodes: ['c1'], edges: [edgeId('s2'), edgeId('c1', 'others')], outputs: [] });
  assert.equal(r.next, 's3');
  // a self-loop: DONE stays while b
  s2 = asmSimStep(sim, s2, { a: 0, b: 0, op: 3, d: 9, rst_n: 1 }).st;
  assert.equal(asmSimEval(sim, s2, { a: 0, b: 1, op: 0, d: 0, rst_n: 1 }).next, 's3');
  // the asynchronous reset: at once, without a clock edge
  r = asmSimEval(sim, s2, { a: 0, b: 1, op: 0, d: 0, rst_n: 0 });
  assert.equal(r.reset, true);
  assert.equal(r.state, 's1');
  assert.deepEqual(asmSimStep(sim, s2, { rst_n: 0 }).st, asmSimReset(sim));
  assert.equal(asmResetActive(sim, { rst_n: 0 }), true);
  assert.equal(asmResetActive(sim, {}), false);
});

test('every-cycle blocks: their paths, the state\'s assignments winning, a synchronised input two cycles late', () => {
  const { sim } = prepareAsmSim(datapath());
  let st = asmSimReset(sim);
  const ins = { a: 3, n: 1, b: 15, go: 1, rst: 0 };   // ((b - 1) >> 1 at 32 bits, the literal's: 7 for b = 15, not for b = 0)
  let r = asmSimEval(sim, st, ins);
  assert.deepEqual(r.blocks.map((b) => [b.id, b.nodes, b.outputs]), [['a1', ['d3', 'o3', 'd4', 'o6'], ['o3', 'o6']]]);
  assert.equal(r.outputs.y, 2n);   // (a + 1) >> 1 of the block
  assert.equal(r.next, 's1');      // go not through the synchroniser yet
  st = asmSimStep(sim, st, ins).st;
  assert.equal(asmSimEval(sim, st, ins).next, 's1');
  st = asmSimStep(sim, st, ins).st;
  r = asmSimEval(sim, st, ins);
  assert.equal(r.next, 's2');
  st = asmSimStep(sim, st, ins).st;
  r = asmSimEval(sim, st, ins);
  assert.equal(r.state, 's2');
  assert.equal(r.outputs.run, 1n);
  assert.equal(r.outputs.y, 3n << BigInt(Number(st.regs.sh)) & 255n);   // the state's y = a << sh wins over the block's
});

test('a chart that cannot be simulated: its errors', () => {
  const m = nested();
  m.edges = m.edges.filter((e) => !(e.from === 'd2' && e.port === 'false'));
  assert.deepEqual(prepareAsmSim(m).errors.map((d) => [d.severity, d.message, d.nodeId]), [['error', "Decision 'b && cnt != 0' has no 0 (false) branch", 'd2']]);
  const u = nested();
  u.nodes.find((n) => n.id === 'd1').cond = 'q';
  assert.deepEqual(prepareAsmSim(u).errors.map((d) => d.message), ["Decision 'q': 'q' is not a declared input, register or generic"]);
  assert.throws(() => simulateAsm(u, [{}]), /'q' is not a declared input/);
  assert.ok(prepareAsmSim(nested()).sim);
});

test('the values shown and given in JSON', () => {
  assert.equal(asmSimText(1n, 1), '1');
  assert.equal(asmSimText(5n, 4), '0101 (5)');
  assert.equal(asmSimValue(5n), 5);
  assert.equal(asmSimValue(2n ** 60n), `1${'0'.repeat(60)}`);
  // inputs given as numbers, BigInts or binary digits; out of range: masked
  const { sim } = prepareAsmSim(nested());
  const st = { state: 's2', regs: { acc: 0n, cnt: 0n }, meta: {}, sync: {} };
  for (const d of [9, 9n, '1001', 25]) assert.equal(asmSimEval(sim, st, { op: 0, d }).assigned.acc, 9n);
});
