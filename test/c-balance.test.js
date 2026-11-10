// Silinx HLS: a sum of many terms balanced into a tree (#2613, core/c-balance.js): the graph's value against BigInt's
// sum, wrapped to its width, for terms of every kind (extended, products, constants, overflowing); its depth the
// logarithm of its terms; an addition read elsewhere a term, its value kept; then designs co-simulated in VHDL and
// Verilog, a function's state and a pipelined loop, fewer cycles and stages than the chain's, no warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Graph } from '../core/c-graph.js';
import { wrap } from '../core/c-types.js';
import { balanceSums } from '../core/c-balance.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';

/** A node's value (BigInt) from the inputs' values, by the graph's operations' meaning. */
function evaluate(g, id, inputs) {
  const memo = new Map();
  const v = (k) => {
    if (memo.has(k)) return memo.get(k);
    const n = g.get(k), t = { w: n.w, s: n.s }, a = n.args.map(v);
    const r = n.op === 'in' ? wrap(inputs[n.port.key], t) : n.op === 'const' ? n.k : n.op === 'ext' ? wrap(a[0], t)
      : n.op === 'mul' ? wrap(a[0] * a[1], t) : n.op === 'add' ? wrap(a[0] + a[1], t) : null;
    if (r === null) throw new Error(`no ${n.op}`);
    memo.set(k, r);
    return r;
  };
  return v(id);
}
/** The most additions on a path from the node down. */
const depth = (g, id) => { const n = g.get(id); return n.op === 'add' ? 1 + Math.max(...n.args.map((a) => depth(g, a))) : 0; };

let seed = 2613;
const rnd = (bits) => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return BigInt(seed) & ((1n << BigInt(bits)) - 1n); };
const I32 = { w: 32, s: true };

/** sum += term(k), n times, from 0: the chain C's unrolled loop makes. */
function chain(n, term, t = I32) {
  const g = new Graph();
  let s = g.const(0, t);
  const parts = [];
  for (let k = 0; k < n; k++) { s = g.add('add', [s, term(g, k)], t); parts.push(s); }
  return { g, s, parts };
}

test('#2613 a sum of 225 products a tree: its value BigInt\'s, wrapped to 32 bits; 8 additions deep, not 225; the sum\'s node the same', () => {
  const U8 = { w: 8, s: false }, S8 = { w: 8, s: true };
  const { g, s } = chain(225, (g, k) => g.add('mul', [g.add('ext', [g.add('in', [], U8, { port: { key: `p${k}` } })], I32), g.add('ext', [g.add('in', [], S8, { port: { key: `c${k}` } })], I32)], I32));
  assert.equal(depth(g, s), 225);
  balanceSums(g, [s]);
  assert.equal(depth(g, s), 8);
  for (let round = 0; round < 20; round++) {
    const inputs = {};
    let want = 0n;
    for (let k = 0; k < 225; k++) {
      inputs[`p${k}`] = rnd(8); inputs[`c${k}`] = rnd(8);
      want += wrap(inputs[`p${k}`], U8) * wrap(inputs[`c${k}`], S8);
    }
    assert.equal(evaluate(g, s, inputs), wrap(want, I32));
  }
});

test('#2613 an overflowing sum the same, wrapped; terms of other widths, constants; unsigned too', () => {
  for (const t of [I32, { w: 16, s: false }, { w: 12, s: true }]) {
    const W = { w: 40, s: true };
    const { g, s } = chain(37, (g, k) => (k % 5 === 0 ? g.const(BigInt(k * 977 - 3000), t) : g.add('ext', [g.add('in', [], W, { port: { key: `x${k}` } })], t)), t);
    const ref = (inputs) => { let v = 0n; for (let k = 0; k < 37; k++) v += k % 5 === 0 ? wrap(BigInt(k * 977 - 3000), t) : wrap(inputs[`x${k}`], t); return wrap(v, t); };
    const inputs = Object.fromEntries(Array.from({ length: 37 }, (_, k) => [`x${k}`, (rnd(31) << 9n) | rnd(9)]));
    const before = evaluate(g, s, inputs);
    balanceSums(g, [s]);
    assert.equal(depth(g, s), 6, `${t.w}`);
    assert.deepEqual([evaluate(g, s, inputs), before], [ref(inputs), ref(inputs)], `${t.w}`);
  }
});

test('#2613 an addition read elsewhere: a term of the tree, its value kept; a short or balanced sum, another width: as it was', () => {
  const X = (g, k) => g.add('in', [], I32, { port: { key: `x${k}` } });
  const inputs = Object.fromEntries(Array.from({ length: 40 }, (_, k) => [`x${k}`, rnd(31)]));
  // (the sum after 20 terms, a root of its own: kept, and the last 20 a tree beside it)
  const { g, s, parts } = chain(40, X);
  const mid = parts[19], v = evaluate(g, mid, inputs), all = evaluate(g, s, inputs);
  balanceSums(g, [s, mid]);
  assert.deepEqual([evaluate(g, mid, inputs), evaluate(g, s, inputs)], [v, all]);
  assert.equal(depth(g, mid), 5);   // (its own 20 terms, balanced as a chain of its own)
  // (its 20 terms after it two by two, the sum of the first 20 added last)
  assert.equal(depth(g, s), 6);
  // (3 terms, 0 and two; 4 already two by two; a 16-bit addition in a 32-bit chain: left as they are, a term)
  const small = chain(2, X);
  const args = small.g.get(small.s).args.slice();
  balanceSums(small.g, [small.s]);
  assert.deepEqual(small.g.get(small.s).args, args);
  const h = new Graph(), a = [0, 1, 2, 3].map((k) => X(h, k));
  const top = h.add('add', [h.add('add', [a[0], a[1]], I32), h.add('add', [a[2], a[3]], I32)], I32);
  const was = h.get(top).args.slice();
  balanceSums(h, [top]);
  assert.deepEqual(h.get(top).args, was);
  const m = new Graph(), b = [0, 1, 2].map((k) => X(m, k)), S16 = { w: 16, s: true };
  const narrow = m.add('add', [m.add('add', [b[0], b[1]], S16), b[2]], S16);
  let wide = m.add('ext', [narrow], I32);
  for (let k = 3; k < 9; k++) wide = m.add('add', [wide, X(m, k)], I32);
  const kept = m.get(narrow).args.slice(), seven = Object.fromEntries(Array.from({ length: 9 }, (_, k) => [`x${k}`, rnd(31)]));
  const value = evaluate(m, wide, seven);
  balanceSums(m, [wide]);
  assert.deepEqual([depth(m, wide), m.get(narrow).args, evaluate(m, wide, seven)], [3, kept, value]);
});

// (a function's state: the sum unrolled; a pipelined loop's: the same sum an iteration)
const STATE = `int f(int x, int y) {
  int s = 0;
  for (int k = 0; k < 32; k++) {
#pragma HLS UNROLL
    s += (x + k) * (y - k);
  }
  return s;
}
int main() {
  for (int x = -2; x < 3; x++) { int t = 0; for (int k = 0; k < 32; k++) t += (x + k) * (7 - k); if (f(x, 7) != t) return 1; }
  return 0;
}
`;
const PIPE = `void f(int x[100], int y[100], int o[100]) {
  for (int i = 0; i < 100; i++) {
#pragma HLS PIPELINE II=1
    int s = 0, a = x[i], b = y[i];
    for (int k = 0; k < 48; k++) s += (a + k) & b;
    o[i] = s;
  }
}
int main() {
  int x[100], y[100], o[100];
  for (int i = 0; i < 100; i++) { x[i] = i * 3 - 120; y[i] = 50 - i; }
  f(x, y, o);
  for (int i = 0; i < 100; i++) { int t = 0; for (int k = 0; k < 48; k++) t += (x[i] + k) & y[i]; if (o[i] != t) return 1; }
  return 0;
}
`;

test('#2613 co-simulated in VHDL and Verilog: a function\'s sum of 32 products in 4 cycles (13 a chain), a pipelined loop\'s of 48 terms in 4 stages (18); no warning', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const c = cosimulate(STATE, { file: 'f.c', lang });
    assert.deepEqual([c.errors, c.pass, c.gen.diagnostics, c.latency.max], [[], true, [], 4], lang);
    const p = cosimulate(PIPE, { file: 'f.c', lang });
    assert.deepEqual([p.errors, p.pass, p.gen.diagnostics], [[], true, []], lang);
    // (were 18 stages and 12908 bits of registers; 732 with the body's own variables' registers, never written, #2990)
    assert.deepEqual([p.gen.report.loops.map((l) => [l.ii, l.depth ?? null]), p.gen.report.registerBits], [[[1, 4], [0, null]], 540], lang);
  }
});

test('#2613 #pragma HLS EXPRESSION_BALANCE off: the sums as the C writes them; in a loop, in another function, or not off: a warning, its sums balanced', () => {
  const sum = (prag) => `int f(int a, int b) {\n${prag}  int s = a;\n${'  s = s + b;\n'.repeat(12)}  return s;\n}\nint main() { return f(1, 2) == 25 ? 0 : 1; }\n`;
  const states = (src) => { const g = cToHdl(src, { file: 'f.c', top: 'f', clock: 5 }); return [g.states, g.diagnostics.map((d) => `${d.line} ${d.message}`)]; };
  // (12 additions of 2.08 ns at 5 ns: one a cycle as they are; 4 levels of the tree, one a cycle)
  assert.deepEqual(states(sum('')), [6, []]);
  assert.deepEqual(states(sum('#pragma HLS EXPRESSION_BALANCE\n')), [6, []]);
  assert.deepEqual(states(sum('#pragma HLS EXPRESSION_BALANCE off\n')), [14, []]);
  assert.deepEqual(states(sum('#pragma HLS EXPRESSION_BALANCE on\n')), [6, ['2 #pragma HLS EXPRESSION_BALANCE on: not off: ignored (its sums balanced)']]);
  const where = '2 #pragma HLS EXPRESSION_BALANCE applies to the top function (in its body, not in a loop or a block): ignored here';
  // (the loop's two states besides)
  assert.deepEqual(states(sum('  for (int i = 0; i < 2; i++) {\n#pragma HLS EXPRESSION_BALANCE off\n  }\n')), [8, [where.replace(/^2/, '3')]]);
  const other = `int g(int x) {\n#pragma HLS EXPRESSION_BALANCE off\n  return x + 1;\n}\n${sum('').replace('return s;', 'return g(s);')}`;
  assert.deepEqual(states(other)[1], [where]);
  for (const lang of ['vhdl', 'verilog']) {
    const c = cosimulate(sum('#pragma HLS EXPRESSION_BALANCE off\n'), { file: 'f.c', lang, clock: 5 });
    assert.deepEqual([c.errors, c.pass, c.gen.diagnostics, c.latency.max], [[], true, [], 12], lang);
  }
});

test('#3028 a top kept combinational on its balanced path, as it is made: sum4 at 20 ns on the Spartan-3E; sequential under EXPRESSION_BALANCE off; its HDL the tree; co-simulated in VHDL and Verilog', () => {
  const sum4 = (prag) => `int sum4(int a, int b, int c, int d, int e) {\n${prag}  return a + b + c + d + e;\n}\nint main() { return sum4(1, 2, 3, 4, 5) == 15 ? 0 : 1; }\n`;
  const opts = { file: 'f.c', top: 'sum4', clock: 20, family: 'spartan3e' };
  // (an addition 4.06 ns, the clock less its uncertainty 14.6 ns: four in a row do not fit, the tree's three do)
  const on = cToHdl(sum4(''), opts), off = cToHdl(sum4('#pragma HLS EXPRESSION_BALANCE off\n'), opts);
  assert.deepEqual([on.ok, on.states, on.diagnostics], [true, 0, []]);
  assert.deepEqual([off.ok, off.states, off.diagnostics], [true, 4, []]);
  // (the combinational module's four additions the tree's: two of them read two others)
  const adds = on.hdl.match(/^ {2}ap_t\d+ <= ap_t\d+ \+ ap_t\d+;$/gm);
  const made = new Set(adds.map((l) => l.match(/ap_t\d+/)[0]));
  assert.deepEqual([adds.length, adds.filter((l) => l.match(/ap_t\d+/g).slice(1).every((t) => made.has(t))).length], [4, 1]);
  for (const lang of ['vhdl', 'verilog']) {
    for (const prag of ['', '#pragma HLS EXPRESSION_BALANCE off\n']) {
      const c = cosimulate(sum4(prag), { ...opts, lang });
      assert.deepEqual([c.errors, c.pass, c.gen.diagnostics, c.latency?.max ?? null], [[], true, [], prag ? 2 : null], `${lang} ${prag}`);
    }
  }
});
