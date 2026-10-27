// Silinx HLS's division and remainder in synthesis (#1656, core/c-dataflow-div.js): by a constant that is not a power
// of 2 (a multiplication by its reciprocal) and by a variable (a restoring divider). The graph's nodes evaluated
// against BigInt's division (C's: truncated toward zero) for every pair of small widths and random ones of 32 and 64
// bits; the generated VHDL and Verilog simulated against the compiled C.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Graph } from '../core/c-graph.js';
import { divMethods } from '../core/c-dataflow-div.js';
import { wrap } from '../core/c-types.js';
import { cToHdl } from '../core/c-hdl.js';
import { noCC, rng, values, against } from './c-helpers.js';

/** A flow of only the division's methods over a graph of its own. */
function flow() {
  const g = new Graph();
  return Object.assign({
    g,
    v: (id, t) => ({ id, t }),
    mux(c, a, b, t) { return g.add('mux', [c, a, b], t); },
    conv(x, t) { return { id: g.add('ext', [x.id], t), t }; },
  }, divMethods);
}

/** A node's value (a BigInt of its width and signedness) for the inputs' values env. */
function evaluate(g, id, env, memo = new Map()) {
  if (memo.has(id)) return memo.get(id);
  const n = g.get(id), t = { w: n.w, s: n.s };
  const [a, b, c] = n.args.map((x) => evaluate(g, x, env, memo));
  const v = {
    const: () => n.k, in: () => env[n.port.key], ext: () => a,
    add: () => a + b, sub: () => a - b, mul: () => a * b, and: () => a & b, or: () => a | b, xor: () => a ^ b,
    not: () => ~a, neg: () => -a, shl: () => (b >= BigInt(n.w) ? 0n : a << b), shr: () => a >> b,
    eq: () => BigInt(a === b), ne: () => BigInt(a !== b), lt: () => BigInt(a < b), le: () => BigInt(a <= b),
    gt: () => BigInt(a > b), ge: () => BigInt(a >= b), mux: () => (a ? b : c),
    slice: () => (wrap(a, { w: g.get(n.args[0]).w, s: false }) >> BigInt(n.lo)) & ((1n << BigInt(n.hi - n.lo + 1)) - 1n),
  }[n.op];
  assert.ok(v, `an operation the evaluator knows: ${n.op}`);
  const r = wrap(v(), t);
  memo.set(id, r);
  return r;
}

const input = (f, name, t) => f.v(f.g.add('in', [], t, { port: { key: name, name } }), t);
/** C's quotient and remainder of a and b in t (truncated toward zero, wrapped to t: -min / -1 is min). */
const cDiv = (a, b, t) => ({ q: wrap(a / b, t), r: wrap(a % b, t) });

test('#1656 a division by a constant that is not a power of 2: every dividend and divisor of 4 to 7 bits, signed and unsigned', () => {
  for (const s of [false, true]) {
    for (let w = 4; w <= 7; w++) {
      const t = { w, s }, lo = s ? -(1n << BigInt(w - 1)) : 0n, hi = s ? (1n << BigInt(w - 1)) - 1n : (1n << BigInt(w)) - 1n;
      for (let d = lo; d <= hi; d++) {
        const ad = d < 0n ? -d : d;
        if (ad === 0n || (ad & (ad - 1n)) === 0n) continue;   // (zero, and the powers of 2: shifts, core/c-dataflow-expr.js)
        const f = flow(), a = input(f, 'a', t);
        const q = f.divConst('/', a, d, t).id, r = f.divConst('%', a, d, t).id;
        for (let x = lo; x <= hi; x++) {
          const exp = cDiv(x, d, t);
          assert.equal(evaluate(f.g, q, { a: x }), exp.q, `${s ? 'signed' : 'unsigned'} ${w} bits: ${x} / ${d}`);
          assert.equal(evaluate(f.g, r, { a: x }), exp.r, `${s ? 'signed' : 'unsigned'} ${w} bits: ${x} % ${d}`);
        }
      }
    }
  }
});

test('#1656 a division by a variable: every pair of 4 to 6 bits, signed and unsigned; by zero, every quotient bit 1 and the dividend left', () => {
  for (const s of [false, true]) {
    for (let w = 4; w <= 6; w++) {
      const t = { w, s }, lo = s ? -(1n << BigInt(w - 1)) : 0n, hi = s ? (1n << BigInt(w - 1)) - 1n : (1n << BigInt(w)) - 1n;
      const f = flow(), a = input(f, 'a', t), b = input(f, 'b', t);
      const q = f.divVar('/', a, b, t).id, r = f.divVar('%', a, b, t).id;
      for (let x = lo; x <= hi; x++) {
        for (let y = lo; y <= hi; y++) {
          const memo = new Map(), at = `${s ? 'signed' : 'unsigned'} ${w} bits: ${x}, ${y}`;
          if (y === 0n) {
            if (!s) assert.deepEqual([evaluate(f.g, q, { a: x, b: y }, memo), evaluate(f.g, r, { a: x, b: y }, memo)], [(1n << BigInt(w)) - 1n, x], at);
            continue;
          }
          const exp = cDiv(x, y, t);
          assert.equal(evaluate(f.g, q, { a: x, b: y }, memo), exp.q, `${at}: /`);
          assert.equal(evaluate(f.g, r, { a: x, b: y }, memo), exp.r, `${at}: %`);
        }
      }
    }
  }
});

test('#1656 32- and 64-bit divisions, signed and unsigned: edge and random values, by constants (3, 7, 10, 1000, -3, the largest) and by variables', () => {
  const rand = rng(1656);
  for (const w of [32, 64]) {
    for (const s of [false, true]) {
      const t = { w, s };
      const xs = values(w, s, 120, rand), ys = values(w, s, 120, rand).filter((y) => y !== 0n);
      const big = s ? (1n << BigInt(w - 1)) - 1n : (1n << BigInt(w)) - 3n;
      for (const d of [3n, 7n, 10n, 1000n, 641n, big, ...(s ? [-3n, -10n, -big] : [])]) {
        const f = flow(), a = input(f, 'a', t);
        const q = f.divConst('/', a, d, t).id, r = f.divConst('%', a, d, t).id;
        for (const x of xs) assert.deepEqual({ q: evaluate(f.g, q, { a: x }), r: evaluate(f.g, r, { a: x }) }, cDiv(x, d, t), `${w} bits ${s}: ${x} / ${d}`);
      }
      const f = flow(), a = input(f, 'a', t), b = input(f, 'b', t);
      const q = f.divVar('/', a, b, t).id, r = f.divVar('%', a, b, t).id;
      xs.forEach((x, k) => {
        const y = ys[k % ys.length], memo = new Map();
        assert.deepEqual({ q: evaluate(f.g, q, { a: x, b: y }, memo), r: evaluate(f.g, r, { a: x, b: y }, memo) }, cDiv(x, y, t), `${w} bits ${s}: ${x} / ${y}`);
      });
    }
  }
});

test('#1656 the generated VHDL and Verilog of divisions by constants and by variables, simulated: the compiled C\'s results; no warnings; no division operator (XST divides by powers of 2 only)', { skip: noCC }, () => {
  const src = `int div(int a, int b, unsigned u, unsigned v, long long x, int *o) {
  int bq = (b == 0 || (a == -2147483647 - 1 && b == -1)) ? 1 : b;
  unsigned vq = v ? v : 1u;
  *o = (int)(x / 1000000007LL) ^ (int)(x % -13LL);
  return a / 20 + a % 7 + (int)(u / 10u) + (int)(u % 1000u) + a / -3 + a / bq + a % bq + (int)(u / vq) + (int)(u % vq);
}`;
  against(src, 'div', { ins: [{ name: 'a', w: 32, s: true }, { name: 'b', w: 32, s: true }, { name: 'u', w: 32, s: false }, { name: 'v', w: 32, s: false }, { name: 'x', w: 64, s: true }],
    outs: [{ name: 'o', w: 32, s: true }], ret: { w: 32, s: true }, n: 40, seed: 1656 });
  for (const lang of ['vhdl', 'verilog']) {
    const gen = cToHdl(src, { file: 'div.c', lang });
    assert.deepEqual(gen.diagnostics, [], `${lang}: no errors and no warnings`);
    assert.equal(gen.sequential, false, `${lang}: combinational`);
    assert.doesNotMatch(gen.hdl, lang === 'vhdl' ? /\s\/\s|\bmod\b|\brem\b/ : /\s[/%]\s/, `${lang}: no division operator`);
  }
});
