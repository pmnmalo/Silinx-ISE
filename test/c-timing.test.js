// Silinx HLS: the estimated delay of a combinational function's longest path, and the clock it must fit (#1924): a
// function too slow for the clock (the project's, syn.clock, else Vitis HLS's 10 ns) is a sequential module with
// ap_clk and ap_rst; one that fits, combinational (ap_rst, no ap_clk); a slower clock keeps it combinational.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Graph } from '../core/c-graph.js';
import { pathDelay, fitsClock, DEFAULT_CLOCK, UNCERTAINTY, FAMILIES } from '../core/c-timing.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';

const I32 = { w: 32, s: true };

test('#1924 pathDelay: the longest chain of operations, each by its kind and width; constants, wiring and constant shifts free', () => {
  const g = new Graph();
  const a = g.add('in', [], I32, { port: { key: 'a' } }), b = g.add('in', [], I32, { port: { key: 'b' } });
  assert.equal(pathDelay(g), 0, 'the inputs alone');
  const s1 = g.add('add', [a, b], I32);
  const add32 = 0.8 + 0.04 * 32;
  assert.ok(Math.abs(pathDelay(g) - add32) < 1e-9);
  // a chain of four additions: four times one; beside it a shorter one does not count
  let x = s1;
  for (let k = 0; k < 3; k++) x = g.add('add', [x, b], I32);
  g.add('xor', [a, b], I32);
  assert.ok(Math.abs(pathDelay(g) - 4 * add32) < 1e-9);
  // a shift by a constant is wiring; by a variable, a barrel shifter
  const h = new Graph();
  const p = h.add('in', [], I32, { port: { key: 'p' } }), q = h.add('in', [], I32, { port: { key: 'q' } });
  h.add('shl', [p, h.const(3, I32)], I32);
  assert.equal(pathDelay(h), 0);
  h.add('shl', [p, q], I32);
  assert.equal(pathDelay(h), 0.5 * 6);
  // a multiplication: a DSP slice up to 36 bits of result, a cascade beyond
  const m = new Graph();
  const u = m.add('in', [], I32, { port: { key: 'u' } });
  m.add('mul', [u, u], { w: 64, s: true });
  assert.equal(pathDelay(m), 3.4 * 2);
});

test('#1924 fitsClock: within the period less Vitis HLS\'s 27 % uncertainty; 10 ns by default', () => {
  assert.equal(DEFAULT_CLOCK, 10);
  assert.equal(UNCERTAINTY, 0.27);
  const chain = (n) => { const g = new Graph(); const a = g.add('in', [], I32, { port: { key: 'a' } }); let x = a; for (let k = 0; k < n; k++) x = g.add('add', [x, a], I32); return g; };
  // add32 is 2.08 ns: three fit 7.3 ns, four do not; at 20 ns (14.6), seven do
  assert.deepEqual([1, 3, 4].map((n) => fitsClock(chain(n))), [true, true, false]);
  assert.deepEqual([7, 8].map((n) => fitsClock(chain(n), 20)), [true, false]);
});

// four additions in a row: 8.3 ns, more than 10 ns allows; at 20 ns they fit
const SUM4 = 'int sum4(int a, int b, int c, int d, int e) {\n  return a + b + c + d + e;\n}\n';
const TB = `${SUM4}int main() {\n  int s = 0;\n  for (int i = 0; i < 8; i++) s += sum4(i, 2 * i, -i, 7, i * i);\n  return s == 0 ? 1 : 0;\n}\n`;

test('#1924 a function too slow for the clock: a sequential module (ap_clk, ap_rst), co-simulated; at a slower clock combinational', () => {
  const ports = (r) => r.ports.slice(0, 2).map((p) => p.name);
  for (const lang of ['vhdl', 'verilog']) {
    const fast = cToHdl(SUM4, { file: 'sum4.c', lang });
    assert.deepEqual([fast.ok, fast.sequential, ports(fast), fast.diagnostics], [true, true, ['ap_clk', 'ap_rst'], []], `${lang} at 10 ns`);
    const slow = cToHdl(SUM4, { file: 'sum4.c', lang, clock: 20 });
    assert.deepEqual([slow.ok, slow.sequential, ports(slow), slow.diagnostics], [true, false, ['ap_rst', 'ap_start'], []], `${lang} at 20 ns`);
    // co-simulated both ways: the C's results, no warnings
    for (const clock of [10, 20]) {
      const r = cosimulate(TB, { file: 'sum4.c', lang, top: 'sum4', clock });
      assert.deepEqual([r.errors, r.pass, r.calls, r.gen.sequential, r.gen.diagnostics], [[], true, 8, clock === 10, []], `${lang} ${clock} ns`);
    }
  }
  // a single addition fits 10 ns: combinational, as Vitis HLS makes it (latency 0)
  const one = cToHdl('int add(int a, int b) { return a + b; }', { file: 'add.c' });
  assert.deepEqual([one.sequential, one.ports.slice(0, 2).map((p) => p.name)], [false, ['ap_rst', 'ap_start']]);
});

// (#2080) one operation or a chain between two registers: its period, in ns, through the open flow (XC3S250E -4), its
// inputs shifted in serially so that no pad is on the path
const MEASURED = [
  ['add8', 3.97, 'add', 8], ['add16', 4.89, 'add', 16], ['add32', 5.42, 'add', 32], ['xor32', 2.67, 'xor', 32], ['mux32', 2.59, 'mux', 32],
  ['mul16', 8.20, 'mul', 32], ['mul32', 16.76, 'mul', 64],
];
const REGISTERS = 1.2;
const chainOf = (op, w, n) => {
  const t = { w, s: false }, g = new Graph();
  const a = g.add('in', [], t, { port: { key: 'a' } }), b = g.add('in', [], t, { port: { key: 'b' } }), c = g.add('in', [], { w: 1, s: false }, { port: { key: 'c' } });
  let x = a;
  for (let k = 0; k < n; k++) x = g.add(op, op === 'mux' ? [c, x, b] : [x, b], t);
  return g;
};

test('#2080 the Spartan-3E\'s delays: an operation within 15 % of its measured period', () => {
  for (const [name, period, op, w] of MEASURED) {
    const est = pathDelay(chainOf(op, w, 1), 'spartan3e') + REGISTERS;
    assert.ok(Math.abs(est - period) / period < 0.15, `${name}: ${est} against ${period}`);
  }
});

test('#2080 the Spartan-3E\'s delays: a chain of additions high, never low (its carries overlap); under twice the measured period', () => {
  for (const [n, period] of [[2, 7.13], [4, 9.08]]) {
    const est = pathDelay(chainOf('add', 32, n), 'spartan3e') + REGISTERS;
    assert.ok(est >= period && est < 2 * period, `${n} additions: ${est} against ${period}`);
  }
});

test('#2080 a family\'s clock: the same graph fits the Artix-7 and not the Spartan-3E; Artix-7 is the default, as before', () => {
  const g = chainOf('add', 32, 3);
  assert.equal(pathDelay(g), pathDelay(g, 'artix7'));
  assert.deepEqual([fitsClock(g), fitsClock(g, 10, 'artix7'), fitsClock(g, 10, 'spartan3e'), fitsClock(g, 20, 'spartan3e')], [true, true, false, true]);
});

test('#2080 every operation of the graph has a delay in each family: <= counts as a carry chain, as < does', () => {
  for (const f of Object.keys(FAMILIES)) {
    const lt = pathDelay(chainOf('lt', 32, 1), f), le = pathDelay(chainOf('le', 32, 1), f);
    assert.ok(lt > 0);
    assert.equal(le, lt, f);
    for (const op of ['add', 'sub', 'neg', 'lt', 'le', 'gt', 'ge', 'eq', 'ne', 'mul', 'mux', 'and', 'or', 'xor', 'not', 'shl', 'shr']) assert.equal(typeof FAMILIES[f][op], 'function', `${f} ${op}`);
  }
});
