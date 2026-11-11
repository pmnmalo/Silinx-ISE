// The Verilog translator's operators (#405: out of toVerilog in synth-verilog.js): indices as bit positions (narrow
// integers and vectors widened to integers kept at their own width), selects that start below bit 0, conditions, and
// the unary and binary operators of Verilog and VHDL at their exact widths and signedness, as the simulator computes
// them. Isomorphic (no DOM, no Node APIs).
import * as V from './values.js';
import { esign, lit, signedInt } from './synth-verilog.js';

/** { asSign, bin, lowBits, narrowIndex, posExpr, truth, un } of toVerilog. */
export function mountOperators(ctx) {
  const {
    S, constSig, e, fail, fit, frameCtx, localName, sigName, sized, wOf
  } = ctx;

  // a VHDL / Verilog index as a bit position (the simulator's bitpos)
  // the w bits of x from bit position lo (a signed expression) up: a select that starts below bit 0
  // (x[n +: 2] with n = -1) keeps its bits that are in the range (Verilog shifts by an unsigned amount)
  // x (a Verilog text signed when xs) with the sign s (a select of a signed vector is unsigned)
  const asSign = (x, xs, s) => (!!xs === !!s ? x : s ? `$signed(${x})` : `$unsigned(${x})`);
  const lowBits = (x, lo, w) => `${w}'((${lo}) < 0 ? ${x} << -(${lo}) : ${x} >> (${lo}))`;
  // an index that is an unsigned vector widened to an integer (VHDL to_integer(u)): the vector
  // itself (a 3-bit index, not a 32-bit signed one: Yosys built 32-bit index logic for it, #14)
  const narrowIndex = idx => {
    let n = idx;
    while (n.k === 'conv' && !n.ext && n.a.t.kind === 'logic' && !n.a.t.s && n.a.t.w > 0 && n.a.t.w < (n.t.w || 32)) n = n.a;
    return n;
  };
  // an integer signal / variable of a range narrower than 32 bits (VHDL's natural range 3 downto 0): its own
  // bits (signed when its range goes below 0), its range (as 32 signed bits, a write's index made Yosys build a
  // 32-bit carry chain for its range check: itc99-b12's critical path, #514)
  const narrowInt = (n, ctx) => {
    const t = n.k === 'sig' ? n.sig.t : n.k === 'loc' ? n.t : null;
    if (t?.kind !== 'int' || t.rlo === undefined || t.rhi === undefined || wOf(t) >= t.w) return null;
    const r = { w: wOf(t), s: signedInt(t), lo: Number(t.rlo), hi: Number(t.rhi) };
    if (n.k === 'sig') return constSig.has(n.sig) ? null : { x: sigName.get(n.sig), ...r };
    const fc = frameCtx(ctx, n);
    if (fc.subst?.get(n.i)?.rv) return null;
    return { x: localName(fc, n.i, t), ...r };
  };
  function posExpr(t, idx, ctx, signedPos = false) {
    idx = narrowIndex(idx);
    // a narrow integer (#514): every value of its range an index of the vector, the position computed in its bits
    // and the vector's, unsigned (sized literals: a size cast there, Yosys negates at 33 bits; exact modulo 2^pw,
    // the position being in 0 … w-1); else, from 0 up and by the low index 0, the integer itself (a value above the
    // vector: a write does nothing, a read is X, as a signed index's); otherwise as any index
    const n = narrowInt(idx, ctx);
    if (n) {
      const [lo, hi] = t.desc ? [t.right, t.right + t.w - 1] : [t.right - t.w + 1, t.right];
      const pw = Math.max(n.w, (t.w - 1).toString(2).length);
      if (n.lo >= lo && n.hi <= hi) {
        if (!t.desc) return `(${pw}'d${t.right} - ${n.x})`;
        return t.right > 0 ? `(${n.x} - ${pw}'d${t.right})` : t.right < 0 ? `(${n.x} + ${pw}'d${-t.right})` : n.x;
      }
      if (!n.s && t.desc && !t.right) return signedPos ? `$signed({1'b0, ${n.x}})` : n.x;
    }
    const i = e(idx, ctx);
    // (signedPos: the position as a signed number, it can be below 0; read selects only: Yosys 0.68
    // fails on a signed index in a memory word's part-select write)
    const v = i.s ? S(i.x) : signedPos ? `$signed({1'b0, ${i.x}})` : i.x;
    return t.desc ? (t.right ? `(${v} - ${t.right})` : v) : `(${t.right} - ${v})`;
  }

  const truthOf = v => (v.w === 1 ? v.x : `(${v.x} != 0)`);
  const truth = (n, ctx) => truthOf(e(n, ctx));

  function un(n, ctx) {
    const t = n.t, w = n.ew || t.w, es = esign(n), a = e(n.a, ctx);
    if (n.fp) fail('real arithmetic cannot be synthesized', n);
    switch (n.o) {
      // (the operand of a unary operator is parenthesized: Yosys reads ~8'(x) as (~8)'(x))
      case '~': return { x: `${w}'(~(${fit(a.x, a.w, es, w, a.s)}))`, w, s: es };
      // (-x as 0 - x, a subtraction: Yosys 0.70's alumacc, after wreduce, merges a $neg narrower than the
      // sum that reads it into that sum at its full width, so a negation that wraps, -(-16) at 5 bits, comes out
      // unwrapped: VlogHammer wideexpr_24040, #743. A sum keeps its width there)
      case '-': return { x: `${w}'(${w}'${es ? 's' : ''}d0 - (${fit(a.x, a.w, es, w, a.s)}))`, w, s: es };
      case '!': return { x: `!(${a.w === 1 ? a.x : `${a.x} != 0`})`, w: 1, s: false };
      case 'abs': { const v = fit(a.x, a.w, !!t.s, w); return { x: `${w}'(${S(v)} < 0 ? -(${S(v)}) : ${S(v)})`, w, s: !!t.s }; }
      case '&': case '|': case '^': case '~&': case '~|': case '~^': case '^~': return { x: `(${n.o}(${sized(a.x, a.w)}))`, w: 1, s: false };
      default: fail(`operator ${n.o} not supported by synthesis`, n);
    }
    return null;
  }

  // (a: its left operand written, if it is already: e writes a chain of operators in a loop, #3375)
  function bin(n, ctx, a = null) {
    const o = n.o, t = n.t;
    if (n.fp) fail('real arithmetic cannot be synthesized', n);
    if (o === '&&' || o === '||') return { x: `(${a ? truthOf(a) : truth(n.a, ctx)} ${o} ${truth(n.b, ctx)})`, w: 1, s: false };
    a ??= e(n.a, ctx);
    const b = e(n.b, ctx);
    const w = n.ew || t.w, s = esign(n);
    if (['==', '!=', '===', '!==', '<', '<=', '>', '>='].includes(o)) {
      const os = !!(n.a.t?.s && n.b.t?.s);
      const cw = Math.max(n.cw || 0, a.w, b.w);
      const A = sized(fit(a.x, a.w, os, cw, a.s), cw), B = sized(fit(b.x, b.w, os, cw, b.s), cw);
      const op = o === '===' ? '==' : o === '!==' ? '!=' : o;
      if (n.match) fail('std_match / matching comparison not supported by synthesis', n);
      return { x: os ? `(${S(A)} ${op} ${S(B)})` : `(${A} ${op} ${B})`, w: 1, s: false };
    }
    const A = fit(a.x, a.w, s, w, a.s);
    if (['<<', '<<<', '>>', '>>>', 'rol', 'ror'].includes(o)) {
      const cnt = b.s ? S(b.x) : b.x;
      if (n.vs && n.fill) fail('sla / sra on bit_vector not supported by synthesis', n);
      const constCnt = n.b.k === 'c' ? V.toNum(n.b.val) : null;
      if (n.vs && constCnt !== null && constCnt < 0) fail('a negative shift count', n);
      switch (o) {
        case '<<': case '<<<': return { x: `${w}'(${A} << ${cnt})`, w, s };
        case '>>': return { x: `${w}'(${A} >> ${cnt})`, w, s };
        // (an arithmetic shift only of a signed expression: >>> of an unsigned one is >>)
        case '>>>': return { x: s ? `${w}'(${S(A)} >>> ${cnt})` : `${w}'(${A} >> ${cnt})`, w, s };
        case 'rol': case 'ror': {
          if (constCnt === null) fail('a rotation by a non-constant amount', n);
          const k = ((constCnt % w) + w) % w;
          if (!k) return { x: A, w, s };
          const l = o === 'rol' ? k : w - k;
          return { x: `${w}'((${A} << ${l}) | (${A} >> ${w - l}))`, w, s };
        }
      }
    }
    const B = fit(b.x, b.w, s, w, b.s);
    const SA = s ? S(A) : A, SB = s ? S(B) : B;
    switch (o) {
      case '+': case '-': case '*': return { x: `${w}'(${SA} ${o} ${SB})`, w, s };
      case '/': return { x: `${w}'(${SA} / ${SB})`, w, s };
      case '%': case 'rem': return { x: `${w}'(${SA} % ${SB})`, w, s };
      case 'mod': {
        if (!s) return { x: `${w}'(${A} % ${B})`, w, s };
        return { x: `${w}'((${SA} % ${SB} != 0 && ((${SA} % ${SB} < 0) != (${SB} < 0))) ? ${SA} % ${SB} + ${SB} : ${SA} % ${SB})`, w, s };
      }
      case '**': {
        if (n.a.k === 'c' && n.b.k === 'c') return { x: lit(V.pow(V.withSign(n.a.val, s), V.withSign(n.b.val, n.b.t.s), w, s), w), w, s };
        if (n.a.k === 'c' && V.toNum(n.a.val) === 2) return { x: `${w}'(${w}'d1 << ${b.x})`, w, s };
        fail('** with a non-constant base other than 2', n);
        break;
      }
      case '&': return { x: `(${A} & ${B})`, w, s };
      case '|': return { x: `(${A} | ${B})`, w, s };
      case '^': return { x: `(${A} ^ ${B})`, w, s };
      case '~^': return { x: `${w}'(~((${A} ^ ${B})))`, w, s };
      case 'nand': return { x: `${w}'(~(${A} & ${B}))`, w, s };
      case 'nor': return { x: `${w}'(~(${A} | ${B}))`, w, s };
    }
    fail(`operator ${o} not supported by synthesis`, n);
    return null;
  }

  return { asSign, bin, lowBits, narrowIndex, posExpr, truth, un };
}
