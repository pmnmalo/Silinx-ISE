// Silinx HLS (#2080): a wide multiplication as 18 x 18 ones, a multiplier block each (a Spartan-3E's MULT18X18, an
// Artix-7's DSP slice), their products summed: operations core/c-schedule.js chains over cycles as it chains any other,
// where the multiplication alone was longer than the period. Each operand is taken at its own width (a value extended to
// the product's is the value it extends), cut in limbs of 17 bits: the lower ones unsigned, the top one signed, each an
// 18-bit signed operand; the partial product of limbs i and j is shifted by 17 (i + j), those beyond the product's width
// left out, and their sum, in the width that holds the product (its operands' widths together), is the product, exact.
// Nodes of the graph both emitters write as they are.
// Isomorphic ES module: no DOM and no Node APIs.

const LIMB = 17;
const S18 = { w: 18, s: true }, S36 = { w: 36, s: true };

/** An operand of a multiplication by the value it holds: [node, signed width that holds it]. */
export function operandOf(g, x, signedMul) {
  let src = g.get(x);
  // (an extension: the value it extends, unless an unsigned product of a signed value's pattern)
  if (src.op === 'ext') {
    const y = g.get(src.args[0]);
    if (y.w < src.w && !(y.s && !src.s)) src = y;
  }
  if (src.op === 'const') {
    const k = src.k;
    let e = 1;
    while (k >= 1n << BigInt(e - 1) || k < -(1n << BigInt(e - 1))) e++;
    return [src.id, e];
  }
  return [src.id, src.s ? src.w : src.w + 1];
}

/** The signed width of the product a multiplication node computes, at its operands' own widths. */
export function mulWidth(g, n) {
  const [, ea] = operandOf(g, n.args[0], n.s), [, eb] = operandOf(g, n.args[1], n.s);
  return Math.min(n.w, ea + eb);
}

/** The multiplication node n as 18 x 18 multiplications and their sum, or n itself when one block makes it (without
 *  `every`, when its product fits 36 bits: one path in the blocks it takes, #2125). */
export function splitMul(g, n, every = false) {
  if (every ? n.args.every((x) => operandOf(g, x, n.s)[1] <= 18) : mulWidth(g, n) <= 36) return n.id;
  // (the sum in the product's own width, which holds it: signed, its operands' widths together; then the node's)
  const t = { w: mulWidth(g, n), s: true };
  const limbs = (x) => {
    const [id, e] = operandOf(g, x, n.s);
    const v = g.add('ext', [id], { w: e, s: true });
    const k = Math.max(1, Math.ceil((e - 1) / LIMB));
    return Array.from({ length: k }, (_, i) => (i < k - 1
      ? g.add('ext', [g.add('slice', [v], { w: LIMB, s: false }, { hi: LIMB * i + LIMB - 1, lo: LIMB * i })], S18)
      : g.add('ext', [g.add('shr', [v, g.const(LIMB * i, { w: e, s: true })], { w: e, s: true })], S18)));
  };
  const a = limbs(n.args[0]), b = limbs(n.args[1]);
  const parts = [];
  a.forEach((x, i) => b.forEach((y, j) => {
    const at = LIMB * (i + j);
    if (at >= t.w) return;
    const p = g.add('ext', [g.add('mul', [x, y], S36)], t);
    parts.push(at ? g.add('shl', [p, g.const(at, t)], t) : p);
  }));
  // (summed as a tree: the shortest chain of additions)
  let level = parts;
  while (level.length > 1) {
    const next = [];
    for (let k = 0; k < level.length; k += 2) next.push(k + 1 < level.length ? g.add('add', [level[k], level[k + 1]], t) : level[k]);
    level = next;
  }
  return g.add('ext', [level[0]], { w: n.w, s: n.s });
}

/** The roots with every wide multiplication of their graph split (the nodes above one made again). */
export function splitMuls(g, roots, every = false) {
  const memo = new Map();
  const f = (id) => {
    if (memo.has(id)) return memo.get(id);
    const n = g.get(id);
    let r = id;
    if (n.args.length) {
      const args = n.args.map(f);
      const changed = args.some((a, k) => a !== n.args[k]);
      const { id: _i, op, args: _a, w, s, ...extra } = n;
      const m = changed ? g.get(g.add(op, args, { w, s }, extra)) : n;
      r = m.op === 'mul' ? splitMul(g, m, every) : m.id;
    }
    memo.set(id, r);
    return r;
  };
  return roots.map(f);
}
