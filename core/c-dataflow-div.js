// Silinx HLS (#1656): the division and remainder of core/c-dataflow.js's symbolic run (its methods, mixed into its
// Flow) by a constant that is not a power of 2 (a multiplication by its reciprocal) and by a variable (a restoring
// divider): nodes of the graph that both emitters write with + - * and comparisons only, as XST takes them.
// Isomorphic ES module: no DOM and no Node APIs.
//
// C truncates toward zero: a signed quotient is its operands' magnitudes divided, negated when their signs differ;
// the remainder takes the dividend's sign. A division by zero (undefined in C, stopped by the C simulation) gives in
// the hardware what the divider gives: every quotient bit 1, the remainder the dividend.
import { BOOL, INT } from './c-types.js';

/** The ceiling of log2(d), d > 0 (a BigInt). */
const log2up = (d) => (d - 1n).toString(2).length - (d === 1n ? 1 : 0);

export const divMethods = {
  /** a / b or a % b, a and b of the same type t, b a constant not a power of 2. */
  divConst(op, a, d, res) {
    return this.signedDiv(op, a, d < 0n, res, (x, w) => this.udivConst(x, w, d < 0n ? -d : d));
  },
  /** a / b or a % b, a and b of the same type t, b a variable. */
  divVar(op, a, b, res) {
    const t = a.t;
    const yneg = t.s ? this.g.add('lt', [b.id, this.g.const(0, t)], BOOL) : null;
    return this.signedDiv(op, a, yneg, res, (x, w) => this.udivVar(x, this.magnitude(b.id, yneg, t), w));
  },
  /** C's signed division from an unsigned one, udiv(x, w) → { q, r } of the magnitude x (unsigned, w bits); yneg the
   *  divisor's sign (a node, a boolean for a constant, null when unsigned). */
  signedDiv(op, a, yneg, res, udiv) {
    const t = a.t, w = t.w;
    if (!t.s) {
      const { q, r } = udiv(a.id, w);
      return this.conv(this.v(op === '/' ? q : r, t), res);
    }
    const xneg = this.g.add('lt', [a.id, this.g.const(0, t)], BOOL);
    const { q, r } = udiv(this.magnitude(a.id, xneg, t), w);
    const signed = (u, neg) => {
      const s = this.g.add('ext', [u], t);
      return neg === false ? s : neg === true ? this.g.add('neg', [s], t) : this.mux(neg, this.g.add('neg', [s], t), s, t);
    };
    if (op === '%') return this.conv(this.v(signed(r, xneg), t), res);
    const qneg = yneg === true ? this.g.add('not', [xneg], BOOL) : yneg === false ? xneg : this.g.add('xor', [xneg, yneg], BOOL);
    return this.conv(this.v(signed(q, qneg), t), res);
  },
  /** |x| as an unsigned value of t's width (the most negative value's magnitude fits), neg x's sign (null: x is
   *  unsigned). */
  magnitude(x, neg, t) {
    const u = { w: t.w, s: false };
    if (!neg) return this.g.add('ext', [x], u);
    return this.g.add('ext', [this.mux(neg, this.g.add('neg', [x], t), x, t)], u);
  },
  /** x / d and x % d, x unsigned of w bits, d > 0 a constant: q = x · ⌈2^N / d⌉ >> N with N = w + ⌈log2 d⌉, exact
   *  for every x below 2^w (the error x·e / (d·2^N) stays under 1/d). */
  udivConst(x, w, d) {
    const u = { w, s: false };
    if (d >= 1n << BigInt(w)) return { q: this.g.const(0, u), r: x };
    const N = w + log2up(d), m = ((1n << BigInt(N)) + d - 1n) / d;
    const W = { w: w + 1, s: false }, P = { w: 2 * (w + 1), s: false };
    const p = this.g.add('mul', [this.g.add('ext', [x], W), this.g.const(m, W)], P);
    const q = this.g.add('ext', [this.g.add('shr', [p, this.g.const(N, INT)], P)], u);
    const qd = this.g.add('ext', [this.g.add('mul', [q, this.g.const(d, u)], { w: 2 * w, s: false })], u);
    return { q, r: this.g.add('sub', [x, qd], u) };
  },
  /** x / y and x % y, both unsigned of w bits: a restoring divider, one compare-and-subtract per bit of x from its
   *  most significant one. */
  udivVar(x, y, w) {
    const u = { w, s: false }, U = { w: w + 1, s: false };
    const ye = this.g.add('ext', [y], U), one = this.g.const(1, INT);
    let r = this.g.const(0, U), q = this.g.const(0, u);
    for (let i = w - 1; i >= 0; i--) {
      const bit = this.g.add('ext', [this.g.add('slice', [x], BOOL, { hi: i, lo: i })], U);
      r = this.g.add('or', [this.g.add('shl', [r, one], U), bit], U);
      const ge = this.g.add('ge', [r, ye], BOOL);
      r = this.mux(ge, this.g.add('sub', [r, ye], U), r, U);
      q = this.g.add('or', [this.g.add('shl', [q, one], u), this.g.add('ext', [ge], u)], u);
    }
    return { q, r: this.g.add('ext', [r], u) };
  },
};
