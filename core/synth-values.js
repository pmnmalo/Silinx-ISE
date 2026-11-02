// The Verilog translator's values (#405: out of toVerilog in synth-verilog.js): every expression as an unsigned,
// exactly-sized Verilog expression (fit, sized; the widths the translator gives integers, records and arrays), the
// names of the variables of processes, procedures and functions, and e / e0, the translation of an expression node:
// signals and constants, selects, conversions, calls, edges. Isomorphic (no DOM, no Node APIs).
import * as V from './values.js';
import { bitpos, psliceLo } from './interp.js';
import { TAB_ROOT, balanced, esc, esign, lit, signedInt, synthWidth } from './synth-verilog.js';

/** { S, e, e0, fieldOff, fit, frameCtx, isMem, isRec, localName, nullVec, packVal, sized, wOf } of toVerilog (shiftMems(): its current values). */
export function mountValues(ctx) {
  const {
    name, asSign, bin, call, constSig, decls, fail, lowBits, narrowIndex, place, placeText, posExpr, romRef, shiftMems,
    sigName, tabulate, tapWires, truth, un, uniq, used, wiredDrv
  } = ctx;

  // ---------------- values: every expression as an unsigned, exactly-sized Verilog expression
  // fit(x, wFrom, sFrom, wTo): the value extended (by sFrom) or truncated to wTo bits. An assigned
  // value is extended by its own sign; the operand of an operator by the sign of the operator's
  // expression (a signed operand in an unsigned expression is zero-extended, IEEE 1364-2005 5.5.4),
  // as the simulator does (interp.js fitOp)
  // (xs: the Verilog text x is itself signed: a size cast keeps the sign of its operand, so zero
  // extension needs $unsigned)
  // sized(x, w): x in a self-determined place (concatenation part, replication, reduction,
  // comparison operand) cast to its width unless it is a name or a literal: Yosys 0.68 sizes an
  // operation on size casts at the width of the casts' operands there ({a[7], (1'(a >> 1) ^ 1'(a))}
  // became 9 bits wide)
  const sized = (x, w) => (/^(\\?[\w$.\[\]]+ ?|\d+'[sbhd]+[0-9a-fxz]+)$/i.test(x) || x.startsWith(`${w}'(`) && balanced(x.slice(String(w).length + 1)) ? x : `${w}'(${x})`);
  const fit = (x, wf, sf, wt, xs = false) => (wf === wt ? x : `${wt}'(${sf ? `$signed(${x})` : xs ? `$unsigned(${x})` : x})`);
  const S = x => `$signed(${x})`;

  // the widths the translator gives a node: integer signals / locals narrower than 32; a record is
  // one packed vector of its fields (#69), an array inside a packed value its elements side by side
  const wOf = t => (!t ? 1 : t.kind === 'array' ? (t.fields ? t.fields.reduce((a, f) => a + wOf(f.t), 0) : (t.len ?? 0) * wOf(t.elem)) : synthWidth(t));
  const isRec = t => t?.kind === 'array' && !!t.fields;
  // an array at the root of a signal / variable: a memory, reg [w-1:0] m [0:n-1] (its elements may
  // be packed records or arrays)
  const isMem = t => t?.kind === 'array' && !t.fields;
  // a record's field k: its bits start above those of the fields after it (field 0 is the most
  // significant); an array's element lo + j starts at bit j * (its width)
  const fieldOff = (t, k) => t.fields.slice(k + 1).reduce((a, f) => a + wOf(f.t), 0);
  // a value (a record / array value: a JS array) packed into one vector of wOf(t) bits
  const packVal = (v, t) => {
    const w = wOf(t);
    if (t?.kind !== 'array') return Array.isArray(v) ? V.allX(w) : V.resize(v, w);
    if (!Array.isArray(v)) return V.allX(w);
    let bv = 0n, bx = 0n, at = 0;
    const put = (x, ft) => { const fw = wOf(ft), pv = packVal(x, ft), m = (1n << BigInt(fw)) - 1n; bv |= (pv.v & m) << BigInt(at); bx |= (pv.x & m) << BigInt(at); at += fw; };
    if (t.fields) for (let k = t.fields.length - 1; k >= 0; k--) put(v[k], t.fields[k].t);
    else for (let k = 0; k < (t.len ?? v.length); k++) put(v[k], t.elem);
    return V.mk(w, bv, bx);
  };
  // a vector of no bit (a VHDL null range): not declared, not assigned
  const nullVec = t => t?.kind === 'logic' && t.w === 0;

  // the variables of a function are its own (v<slot>); those of processes and inlined procedures
  // become module-level registers named after their process. No dot in these names: Yosys takes a
  // name with a dot for a hierarchical reference in places (as a for loop variable it unrolled the
  // loop wrongly: every iteration wrote element 0 of the memory).
  const localName = (ctx, i, t) => {
    if (!ctx.locals.has(i)) ctx.locals.set(i, { name: ctx.fn && !ctx.parent ? `v${i}` : esc(uniq(`${ctx.base}_v${i}`)), t });
    return ctx.locals.get(i).name;
  };
  // the context of a variable's frame: a procedure declared in a process (or in another procedure)
  // uses the variables of the enclosing one (#182), the inlined call it is in (level: the depth of
  // its frame, interp.js); a function is written on its own, so it cannot
  const frameCtx = (ctx, n) => {
    if (n.up == null) return ctx;
    let c = ctx;
    while (c && (c.level ?? 0) !== n.up) c = c.parent;
    if (!c) fail(`function ${ctx.fn?.name || ''}: the variables of the enclosing process ('${n.name}') cannot be used in a function by synthesis`, ctx.fn);
    return c;
  };

  // e(n) -> { x: expression string, w, s } (x is w bits; s = the value's signedness)
  function e(n, ctx) {
    // a VHDL null array (std_logic_vector(-1 downto 0)): no bit; Verilog has no zero-width value, so
    // it is left out of concatenations and assignments (anything else reads it as 0)
    if (nullVec(n.t)) return { x: "1'b0", w: 0, s: !!n.t.s };
    return (TAB_ROOT.has(n.k) && tabulate(n, ctx)) || e0(n, ctx);
  }
  function e0(n, ctx) {
    const t = n.t || {};
    switch (n.k) {
      case 'c': {
        if (Array.isArray(n.val)) return isRec(t) ? { x: lit(packVal(n.val, t), wOf(t)), w: wOf(t), s: false } : romRef(n, ctx);
        if (n.val.str !== undefined) fail('a string value cannot be synthesized', n);
        if (n.val.real !== undefined || t.kind === 'real') fail('a real value cannot be synthesized', n);
        const w = n.val.w || 1;
        return { x: lit(n.val, w), w, s: !!n.val.s };
      }
      case 'sig': {
        const s = n.sig;
        if (isRec(s.t)) return { x: sigName.get(s), w: wOf(s.t), s: false };   // (a record: one vector)
        if (constSig.has(s)) {   // (a constant signal: its value)
          const cw = s.t.kind === 'int' ? s.t.w : wOf(s.t), cs = s.t.kind === 'int' ? true : !!(n.t?.s ?? s.t.s);
          return { x: lit(V.resize(constSig.get(s), cw), cw), w: cw, s: cs };
        }
        if (Array.isArray(s.val) || s.t.kind === 'array') fail(`array ${s.name} used as a whole value`, n);
        const w = wOf(s.t), x = sigName.get(s);
        // integer signals narrower than their 32-bit simulation width: extended back to 32 bits
        if (s.t.kind === 'int' && w !== s.t.w) return { x: fit(x, w, signedInt(s.t), s.t.w), w: s.t.w, s: true };
        // a port connected straight to its actual (one signal) reads with the port's own sign
        const ns = !!(n.t?.s ?? s.t.s);
        if (n.t && n.t !== s.t && n.t.kind !== 'int' && ns !== !!s.t.s) return { x: ns ? `$signed(${x})` : `$unsigned(${x})`, w, s: ns };
        return { x, w, s: !!s.t.s };
      }
      case 'loc': {
        const fc = frameCtx(ctx, n);
        if (fc.subst?.has(n.i)) { const sb = fc.subst.get(n.i); if (sb.rv) return e(sb.rv, sb.ctx); }
        const w = wOf(t), x = localName(fc, n.i, t);
        if (t.kind === 'int' && w !== t.w) return { x: fit(x, w, signedInt(t), t.w), w: t.w, s: true };
        return { x, w, s: !!t.s };
      }
      case 'bit': {
        // (a constant bit of a signal: name[p], which Yosys matches with an edge on that bit, as
        // an asynchronous reset rs[1] of always @(… or posedge rs[1]), #98)
        if (n.index.k === 'c' && n.base.k === 'sig' && !isRec(n.base.sig.t) && !constSig.has(n.base.sig) && n.base.sig.t.w > 1 && !wiredDrv.has(n.base.sig)) {
          const p = bitpos(n.base.t, V.toNum(n.index.val));
          if (p >= 0 && p < wOf(n.base.sig.t) && !(n.base.sig.t.kind === 'int' && wOf(n.base.sig.t) !== n.base.sig.t.w)) return { x: `${sigName.get(n.base.sig)}[${p}]`, w: 1, s: false };
        }
        const b = e(n.base, ctx);
        if (n.index.k === 'c') {
          const p = bitpos(n.base.t, V.toNum(n.index.val));
          return { x: asSign(p === 0 && b.w === 1 ? b.x : `1'(${b.x} >> ${p})`, b.s, false), w: 1, s: false };
        }
        // a variable bit of a shift chain (findShiftMems): name[i], which Yosys reads as a $shiftx, mapped
        // to an SRL16E (xilinx_srl -variable, #5); an index past the end reads x there
        if (n.base.k === 'sig' && shiftMems().vecs?.has(n.base.sig) && !isRec(n.base.sig.t) && !constSig.has(n.base.sig) && n.base.sig.t.w > 1 && !wiredDrv.has(n.base.sig)
          && !(n.base.sig.t.kind === 'int' && wOf(n.base.sig.t) !== n.base.sig.t.w) && b.w === wOf(n.base.sig.t))
          return { x: `${sigName.get(n.base.sig)}[${posExpr(n.base.t, n.index, ctx)}]`, w: 1, s: false };
        return { x: asSign(`1'(${b.x} >> ${posExpr(n.base.t, n.index, ctx)})`, b.s, false), w: 1, s: false };
      }
      case 'slice': {
        const b = e(n.base, ctx);
        return { x: asSign(n.lo === 0 && b.w === t.w ? b.x : `${t.w}'(${b.x} >> ${n.lo})`, b.s, !!t.s), w: t.w, s: !!t.s };
      }
      case 'dslice': {
        const b = e(n.base, ctx);
        if (n.left.k === 'c' && n.right.k === 'c') {
          const p1 = bitpos(n.base.t, V.toNum(n.left.val)), p2 = bitpos(n.base.t, V.toNum(n.right.val));
          return { x: asSign(`${t.w}'(${b.x} >> ${Math.min(p1, p2)})`, b.s, !!t.s), w: t.w, s: !!t.s };
        }
        const lo = n.base.t.desc ? posExpr(n.base.t, n.right, ctx, true) : posExpr(n.base.t, n.left, ctx, true);
        return { x: asSign(lowBits(b.x, lo, t.w), b.s, !!t.s), w: t.w, s: !!t.s };
      }
      case 'pslice': {
        const b = e(n.base, ctx);
        if (n.start.k === 'c') return { x: asSign(`${t.w}'(${b.x} >> ${psliceLo(n.base.t, V.toNum(n.start.val), t.w, n.dir)})`, b.s, !!t.s), w: t.w, s: !!t.s };
        const st = posExpr(n.base.t, n.start, ctx, true);
        const up = (n.dir === '+') === !!n.base.t.desc;   // the start is the low bit
        return { x: asSign(lowBits(b.x, up ? st : `(${st} - ${t.w - 1})`, t.w), b.s, !!t.s), w: t.w, s: !!t.s };
      }
      case 'elem': {
        const base = n.base;
        if (base.k === 'c' && Array.isArray(base.val)) return romRef(n, ctx);
        // a word of a shift chain read at a variable tap: bit by bit, the chain of that bit read at
        // the tap ({m[15][b], …, m[0][b]}[tap]: a 1-bit $shiftx, which Yosys maps to an SRL16E, #5)
        if (base.k === 'sig' && shiftMems().has(base.sig) && n.index.k !== 'c' && !shiftMems().srcs.has(n)) {
          const sg = base.sig, name = sigName.get(sg), len = sg.t.len, ew = wOf(sg.t.elem), lo = sg.t.lo ?? 0;
          if (!tapWires.has(sg)) {
            const k = tapWires.size;
            tapWires.set(sg, Array.from({ length: ew }, (_, b) => `srl_tap${k}_${b}`));   // (a plain name: the array's may be escaped)
            for (let b = 0; b < ew; b++) decls.push(`  wire [${len - 1}:0] srl_tap${k}_${b} = {${Array.from({ length: len }, (_, j) => `${name}[${len - 1 - j}][${b}]`).join(', ')}};`);
          }
          const iv = e(narrowIndex(n.index), ctx), ix = iv.s ? S(iv.x) : iv.x;
          const at = lo ? `${ix} - ${lo}` : ix;
          const bits = tapWires.get(sg).map(tw => `${tw}[${at}]`).reverse();
          return { x: ew === 1 ? bits[0] : `{${bits.join(', ')}}`, w: ew, s: !!n.t.s };
        }
        const P = place(n, ctx, false);
        if (!P) fail('indexing an array expression', n);
        const w = wOf(t), x = placeText(P);
        if (t.kind === 'int' && w !== t.w) return { x: fit(x, w, signedInt(t), t.w), w: t.w, s: true };
        return { x, w, s: !!t.s };
      }
      case 'un': return un(n, ctx);
      case 'bin': return bin(n, ctx);
      case 'cond': {
        // each branch cast to the width, even when it has it already: Yosys can size an operation on
        // a size cast at the width of the cast's operand (4'(d) ^ 4'h3 with an 8-bit d: 8 bits),
        // which made `oe ? (4'(d) ^ …) : 4'bzzzz` an 8-bit multiplexer with 0000zzzz on the other
        // side, no longer a tri-state buffer
        const w = n.ew || t.w, es = esign(n), c = truth(n.c, ctx), a = e(n.a, ctx), b = e(n.b, ctx);
        const br = v => { const x = fit(v.x, v.w, es, w, v.s); return /^\d+'[bh][0-9a-fxz]+$/.test(x) ? x : `${w}'(${x})`; };
        return { x: `(${c} ? ${br(a)} : ${br(b)})`, w, s: es };
      }
      case 'cat': {
        const ps = n.parts.filter(p => !nullVec(p.t));
        const vals = ps.map(p => e(p, ctx));
        const parts = vals.map((v, i) => sized(fit(v.x, v.w, v.s, ps[i].t.w), ps[i].t.w));
        // (a concatenation is unsigned: {s} of a signed s is $unsigned(s))
        const one = parts.length === 1 && vals[0].s && !t.s ? `$unsigned(${parts[0]})` : parts[0];
        return { x: parts.length === 1 ? one : `{${parts.join(', ')}}`, w: t.w, s: !!t.s };
      }
      case 'repl': {
        if (n.count.k !== 'c') fail('a replication count that is not constant', n);
        const a = e(n.a, ctx);
        return { x: `{${V.toNum(n.count.val)}{${sized(fit(a.x, a.w, a.s, n.a.t.w), n.a.t.w)}}}`, w: t.w, s: !!t.s };
      }
      case 'conv': {
        if (t.kind === 'real' || n.rtoi) fail('a conversion to or from REAL cannot be synthesized', n);
        const a = e(n.a, ctx);
        if (n.sres && t.w < a.w) {   // numeric_std resize(signed): sign bit + low bits
          const low = t.w > 1 ? `${t.w - 1}'(${a.x})` : null;
          return { x: low ? `{1'(${a.x} >> ${a.w - 1}), ${low}}` : `1'(${a.x} >> ${a.w - 1})`, w: t.w, s: true };
        }
        const x = fit(a.x, a.w, n.ext ?? a.s, t.w, a.s);
        // the sign of the conversion ($signed / $unsigned), also when the width changes: a size cast keeps
        // its operand's sign (14'($signed(i)) is signed: to_unsigned(8389, 14) was sign-extended in a wider
        // product, the stopwatch's thousands, #229)
        return { x: !!t.s === !!a.s ? x : t.s ? `$signed(${x})` : `$unsigned(${x})`, w: t.w, s: !!t.s };
      }
      case 'call': return call(n, ctx);
      case 'edge': case 'event': fail('a clock edge outside the clock condition of a process', n); break;
      case 'sys': case 'now': case 'str': case 'image': case 'strcat': case 'chr': case 'strlen': case 'sigattr':
        fail(`'${n.name || n.k}' cannot be synthesized`, n); break;
      case 'aslice': case 'daslice': fail('array slices (a part of an array of vectors) are not supported by the open synthesis', n); break;
      case 'xloc': fail(`'${n.name}': a hierarchical reference to a variable of another block cannot be synthesized`, n); break;
      default: fail(`expression '${n.k}' not supported by synthesis`, n);
    }
    return null;
  }

  return { S, e, e0, fieldOff, fit, frameCtx, isMem, isRec, localName, nullVec, packVal, sized, wOf };
}
