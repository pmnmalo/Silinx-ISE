// Silinx HLS: a wide multiplication as 18 x 18 ones and their sum (#2080, core/c-mul-split.js): the graph's value against
// BigInt's product, signed and unsigned, of operands of every width, extended and constant; each block 18 x 18.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Graph } from '../core/c-graph.js';
import { wrap } from '../core/c-types.js';
import { splitMul, mulWidth, operandOf } from '../core/c-mul-split.js';

/** A node's value (BigInt) from the inputs' values, by the graph's operations' meaning. */
function evaluate(g, id, inputs) {
  const memo = new Map();
  const v = (k) => {
    if (memo.has(k)) return memo.get(k);
    const n = g.get(k), t = { w: n.w, s: n.s }, a = n.args.map(v);
    const arg = (i) => g.get(n.args[i]);
    let r;
    switch (n.op) {
      case 'in': r = wrap(inputs[n.port.key], t); break;
      case 'const': r = n.k; break;
      case 'ext': r = wrap(a[0], t); break;
      case 'slice': r = (wrap(a[0], { w: arg(0).w, s: false }) >> BigInt(n.lo)) & ((1n << BigInt(n.hi - n.lo + 1)) - 1n); break;
      case 'shr': r = wrap(a[0] >> a[1], t); break;
      case 'shl': r = wrap(a[0] << a[1], t); break;
      case 'mul': r = wrap(a[0] * a[1], t); break;
      case 'add': r = wrap(a[0] + a[1], t); break;
      default: throw new Error(`no ${n.op}`);
    }
    memo.set(k, r);
    return r;
  };
  return v(id);
}

let seed = 2080;
const rnd = (bits) => { let x = 0n; for (let k = 0; k < bits; k += 16) { seed = (seed * 1103515245 + 12345) & 0x7fffffff; x = (x << 16n) | BigInt(seed & 0xffff); } return x & ((1n << BigInt(bits)) - 1n); };

/** a (wa bits, signed sa) times b (wb, sb), each extended to the product's width k, as C's arithmetic makes it. */
function product(wa, sa, wb, sb, k, s) {
  const g = new Graph();
  const t = { w: k, s }, a = g.add('in', [], { w: wa, s: sa }, { port: { key: 'a' } }), b = g.add('in', [], { w: wb, s: sb }, { port: { key: 'b' } });
  const m = g.add('mul', [g.add('ext', [a], t), g.add('ext', [b], t)], { w: 2 * k, s });
  return { g, m, out: splitMul(g, g.get(m)) };
}

test('#2080 splitMul: the product of 18 x 18 blocks equals BigInt\'s, signed and unsigned, for operands of 8 to 64 bits', () => {
  for (const [wa, sa, wb, sb, k, s] of [[64, true, 64, true, 64, true], [64, false, 64, false, 64, false], [32, true, 32, true, 32, true], [40, true, 24, false, 64, true],
    [48, false, 48, false, 64, false], [64, true, 8, true, 64, true], [33, false, 35, false, 36, false], [20, true, 20, true, 32, true]]) {
    const { g, m, out } = product(wa, sa, wb, sb, k, s);
    assert.notEqual(out, m, `${wa} x ${wb}: split`);
    const edges = [0n, 1n, -1n, (1n << BigInt(wa - 1)) - 1n, -(1n << BigInt(wa - 1)), (1n << BigInt(wa)) - 1n];
    for (let r = 0; r < 60; r++) {
      const inputs = r < edges.length ** 2 ? { a: edges[r % edges.length], b: edges[Math.floor(r / edges.length)] } : { a: rnd(wa), b: rnd(wb) };
      const want = evaluate(g, m, inputs), got = evaluate(g, out, inputs);
      assert.equal(got, want, `${wa}${sa ? 's' : 'u'} x ${wb}${sb ? 's' : 'u'}: ${inputs.a} * ${inputs.b}`);
    }
    // (every block 18 x 18, signed: a MULT18X18)
    assert.ok(g.needed([out]).filter((n) => n.op === 'mul').every((n) => n.w === 36 && g.get(n.args[0]).w === 18 && n.s));
  }
});

test('#2080 splitMul: a product that one block makes is left as it is; an extended operand is the value it extends', () => {
  const { g, m, out } = product(16, true, 16, true, 64, true);
  assert.equal(out, m);
  assert.equal(mulWidth(g, g.get(m)), 32);
  // (an unsigned 17-bit value: 18 bits signed; a signed one extended to an unsigned type: its pattern, the type's width)
  const h = new Graph();
  const u = h.add('in', [], { w: 17, s: false }, { port: { key: 'u' } }), sv = h.add('in', [], { w: 8, s: true }, { port: { key: 's' } });
  assert.deepEqual(operandOf(h, h.add('ext', [u], { w: 64, s: true })), [u, 18]);
  const pattern = h.add('ext', [sv], { w: 64, s: false });
  assert.deepEqual(operandOf(h, pattern), [pattern, 65]);
});

test('#2080 splitMul: a constant operand by its own width (its blocks folded); the blocks by the operands\' limbs of 17 bits', () => {
  const g = new Graph(), t = { w: 64, s: true };
  const a = g.add('in', [], t, { port: { key: 'a' } });
  const m = g.add('mul', [a, g.const(1234567890123n, t)], { w: 128, s: true });
  assert.equal(mulWidth(g, g.get(m)), 64 + 42);
  const out = splitMul(g, g.get(m));
  for (const x of [3n, -987654321n, (1n << 63n) - 1n, -(1n << 63n)]) assert.equal(evaluate(g, out, { a: x }), evaluate(g, m, { a: x }));
  // 64 x 64 bits: 4 limbs each, 16 blocks; 64-bit values truncated to 32 bits first (C's int): 2 limbs each, 4 blocks
  const blocks = (p) => p.g.needed([p.out]).filter((n) => n.op === 'mul').length;
  assert.equal(blocks(product(64, true, 64, true, 64, true)), 16);
  assert.equal(blocks(product(64, true, 64, true, 32, true)), 4);
});
