// The Verilog translator's statements (#405: out of toVerilog in synth-verilog.js): assignments to their targets'
// widths (signals, variables, memory words, record fields), if / case / loops with their exits and nexts as flags
// guarding the rest of a block (synthesis needs structured code), procedure calls inlined with their own variables,
// whole-array copies. The values come from toVerilog's translator. Isomorphic (no DOM, no Node APIs).
import * as V from './values.js';
import { bitpos, psliceLo } from './interp.js';
import { lit, sameExpr } from './synth-verilog.js';

/** { stmt } of toVerilog. */
export function mountStatements(ctx) {
  const {
    name, S, e, fail, firstWrites, fit, formal, frameCtx, isMem, localName, nullVec, packVal, place, placeText, posExpr,
    sigName, truth, wOf, wiredDrv
  } = ctx;

  // ---------------- statements
  function lvalue(L, ctx) {
    if (nullVec(L.t)) return { x: null, w: 0 };
    switch (L.k) {
      case 'sig': return { x: wiredDrv.get(L.sig)?.get(ctx.proc) ?? sigName.get(L.sig), w: wOf(L.sig.t) };
      case 'loc': {
        const fc = frameCtx(ctx, L);
        if (fc.subst?.has(L.i)) { const sb = fc.subst.get(L.i); if (sb.lv) return lvalue(sb.lv, sb.ctx); }
        return { x: localName(fc, L.i, L.t), w: wOf(L.t) };
      }
      case 'bit': {
        const b = lvalue(L.base, ctx);
        const p = L.index.k === 'c' ? bitpos(L.base.t, V.toNum(L.index.val)) : posExpr(L.base.t, L.index, ctx);
        return { x: `${b.x}[${p}]`, w: 1 };
      }
      case 'slice': { const b = lvalue(L.base, ctx); return { x: `${b.x}[${L.lo + L.t.w - 1}:${L.lo}]`, w: L.t.w }; }
      case 'dslice': {
        const b = lvalue(L.base, ctx);
        if (L.left.k === 'c' && L.right.k === 'c') {
          const p1 = bitpos(L.base.t, V.toNum(L.left.val)), p2 = bitpos(L.base.t, V.toNum(L.right.val));
          return { x: `${b.x}[${Math.max(p1, p2)}:${Math.min(p1, p2)}]`, w: L.t.w };
        }
        const lo = L.base.t.desc ? posExpr(L.base.t, L.right, ctx) : posExpr(L.base.t, L.left, ctx);
        return { x: `${b.x}[${lo} +: ${L.t.w}]`, w: L.t.w };
      }
      case 'pslice': {
        const b = lvalue(L.base, ctx);
        if (L.start.k === 'c') { const lo = psliceLo(L.base.t, V.toNum(L.start.val), L.t.w, L.dir); return { x: `${b.x}[${lo + L.t.w - 1}:${lo}]`, w: L.t.w }; }
        const st = posExpr(L.base.t, L.start, ctx);
        const up = (L.dir === '+') === !!L.base.t.desc;
        return { x: `${b.x}[${up ? st : `${st} - ${L.t.w - 1}`} +: ${L.t.w}]`, w: L.t.w };
      }
      case 'elem': {
        const P = place(L, ctx, true);
        if (!P) fail('assignment to an element of an array expression', L);
        return { x: placeText(P), w: wOf(L.t) };
      }
      case 'cat': {
        const parts = L.parts.map(p => lvalue(p, ctx)).filter(p => p.w > 0);
        return { x: `{${parts.map(p => p.x).join(', ')}}`, w: parts.reduce((s, p) => s + p.w, 0) };
      }
      case 'aslice': return { x: null, w: L.t.len ? wOf(L.t) : 0, slice: true };   // (assigned word by word: arrayCopy)
      case 'daslice': fail('assignment to an array slice of non-constant bounds is not supported by the open synthesis', L); break;
      default: fail(`assignment target '${L.k}' not supported by synthesis`, L);
    }
    return null;
  }

  let flagN = 0;
  // mode: 'proc' | 'fn'; returns text. Control flow out of the middle of a block (return, exit,
  // next) becomes a flag that guards the rest of the block (synthesis needs structured code).
  function stmt(s, ctx, ind, mode, loop = null) {
    if (!s) return '';
    switch (s.k) {
      case 'blk': {
        let out = '';
        let guard = null;
        for (const x of s.stmts) {
          const t = stmt(x, ctx, guard ? `${ind}  ` : ind, mode, loop);
          if (!t) continue;
          out += guard ? `${ind}if (!(${guard})) begin\n${t}${ind}end\n` : t;
          if (!guard && mayLeave(x)) guard = leaveFlags(ctx, loop);
        }
        return out;
      }
      case 'asg': {
        if (s.intra) fail('an intra-assignment delay cannot be synthesized', s);
        const L = lvalue(s.target, ctx);
        if (L.w === 0) return '';   // (a null array: nothing to assign)
        // a whole memory (array signal / variable) assigned: word by word; a record, or a word of a
        // memory of records / arrays (#10), is one vector
        const tgtT = s.target.t;
        if (isMem(tgtT) && (s.target.k === 'sig' || s.target.k === 'loc' || s.target.k === 'aslice')) return arrayCopy(s, ctx, ind);
        if (isMem(tgtT)) fail('assignment of an array to a part of an array', s);
        // an element written with its own value on one side (x[i] <= c ? v : x[i]): if (c) x[i] <= v, without
        // reading x[i] (a multiplexer of the whole vector: iwls05-spi's critical path); x[i] <= x[i]: nothing
        if (s.target.k !== 'cat' && (!s.nb || mode !== 'proc' || s.first || firstWrites.has(s))) {
          if (sameExpr(s.value, s.target)) return '';
          const keep = s.value.k === 'cond' && (sameExpr(s.value.b, s.target) ? 'b' : sameExpr(s.value.a, s.target) ? 'a' : null);
          if (keep) {
            const c = truth(s.value.c, ctx);
            const then = stmt({ ...s, value: keep === 'b' ? s.value.a : s.value.b, first: true }, ctx, `${ind}  `, mode, loop);
            return `${ind}if (${keep === 'b' ? c : `!(${c})`}) begin\n${then}${ind}end\n`;
          }
        }
        const v = e(s.value, ctx);
        const val = s.target.k === 'cat' ? fit(v.x, v.w, v.s, L.w) : fitTarget(v, s.target, L.w);
        return `${ind}${L.x} ${s.nb && mode === 'proc' ? '<=' : '='} ${val};\n`;
      }
      case 'if': {
        const c = truth(s.c, ctx);
        const th = stmt(s.then, ctx, `${ind}  `, mode, loop);
        const el = s.else ? stmt(s.else, ctx, `${ind}  `, mode, loop) : '';
        return `${ind}if (${c}) begin\n${th}${ind}end${el ? ` else begin\n${el}${ind}end` : ''}\n`;
      }
      case 'case': {
        let sel = e(s.sel, ctx);
        // Verilog: the case expression and the items at the width of the widest, extended as signed
        // only when all are signed (elaborate.js: s.cw, s.ss); VHDL: the choices have the width of
        // the expression
        const vl = s.ss !== undefined;
        if (vl && s.cw > sel.w) sel = { x: fit(sel.x, sel.w, s.ss, s.cw, sel.s), w: s.cw, s: s.ss };
        const choiceVal = v => (vl ? V.resize(V.withSign(v, s.ss), sel.w) : V.resize(v, Math.max(sel.w, v.w)));
        const hasRange = s.items.some(it => it.choices.some(ch => ch.range));
        const constChoices = s.items.every(it => it.choices.every(ch => ch.range || ch.k === 'c'));
        if (!hasRange && constChoices && (s.variant === 'case' || !s.variant)) {
          let out = `${ind}case (${sel.x})\n`;
          for (const it of s.items) {
            const labels = it.choices.map(ch => lit(choiceVal(ch.val), sel.w));
            out += `${ind}  ${labels.join(', ')}: begin\n${stmt(it.body, ctx, `${ind}    `, mode, loop)}${ind}  end\n`;
          }
          out += `${ind}  default: begin\n${s.def ? stmt(s.def, ctx, `${ind}    `, mode, loop) : ''}${ind}  end\n${ind}endcase\n`;
          return out;
        }
        if (s.variant === 'casez' || s.variant === 'casex') {
          let out = `${ind}${s.variant} (${sel.x})\n`;
          for (const it of s.items) out += `${ind}  ${it.choices.map(ch => { const v = e(ch, ctx); return fit(v.x, v.w, vl ? s.ss : v.s, sel.w, v.s); }).join(', ')}: begin\n${stmt(it.body, ctx, `${ind}    `, mode, loop)}${ind}  end\n`;
          out += `${ind}  default: begin\n${s.def ? stmt(s.def, ctx, `${ind}    `, mode, loop) : ''}${ind}  end\n${ind}endcase\n`;
          return out;
        }
        // range choices: an if / else if chain (the first matching choice wins, as in the simulator)
        const sv = s.sel.t.s ? S(sel.x) : sel.x;
        let out = '', first = true;
        for (const it of s.items) {
          const conds = it.choices.map(ch => {
            if (ch.range) {
              const lo = e(ch.range.lo, ctx), hi = e(ch.range.hi, ctx);
              const a = lo.s ? S(lo.x) : lo.x, b = hi.s ? S(hi.x) : hi.x;
              return `((${sv} >= ${a} && ${sv} <= ${b}) || (${sv} >= ${b} && ${sv} <= ${a}))`;
            }
            const v = e(ch, ctx); const w = Math.max(sel.w, v.w);
            return `(${fit(sel.x, sel.w, vl ? s.ss : sel.s, w, sel.s)} == ${fit(v.x, v.w, vl ? s.ss : v.s, w, v.s)})`;
          });
          out += `${ind}${first ? '' : 'else '}if (${conds.join(' || ')}) begin\n${stmt(it.body, ctx, `${ind}  `, mode, loop)}${ind}end\n`;
          first = false;
        }
        if (s.def) out += `${ind}${first ? '' : 'else '}begin\n${stmt(s.def, ctx, `${ind}  `, mode, loop)}${ind}end\n`;
        return out;
      }
      case 'forrange': {
        if (s.from.k !== 'c' || s.to.k !== 'c') fail('a loop whose bounds are not constant', s);
        const a = V.toNum(s.from.val), b = V.toNum(s.to.val);
        const v = localName(ctx, s.var, { kind: 'int', w: 32, s: true });
        const lp = { brk: `__brk${flagN++}`, cont: `__cont${flagN++}` };
        ctx.flags.push(lp.brk, lp.cont);
        const body = stmt(s.body, ctx, `${ind}    `, mode, lp);
        const usesFlags = body.includes(lp.brk) || body.includes(lp.cont);
        return `${ind}${usesFlags ? `${lp.brk} = 0;\n${ind}` : ''}for (${v} = ${a}; ${s.down ? `${v} >= ${b}` : `${v} <= ${b}`}; ${v} = ${v} ${s.down ? '-' : '+'} 1) begin\n${usesFlags ? `${ind}  ${lp.cont} = 0;\n${ind}  if (!${lp.brk}) begin\n${body}${ind}  end\n` : body}${ind}end\n`;
      }
      case 'for': {
        // Verilog for: init / cond / step on a loop variable, unrolled by Yosys
        const init = stmt(s.init, ctx, '', mode).trim().replace(/;$/, '');
        const step = stmt(s.step, ctx, '', mode).trim().replace(/;$/, '');
        return `${ind}for (${init}; ${truth(s.cond, ctx)}; ${step}) begin\n${stmt(s.body, ctx, `${ind}  `, mode, loop)}${ind}end\n`;
      }
      case 'exit': case 'next': {
        if (!loop) fail(`${s.k} outside a loop`, s);
        const flag = s.k === 'exit' ? loop.brk : loop.cont;
        return s.cond ? `${ind}if (${truth(s.cond, ctx)}) ${flag} = 1;\n` : `${ind}${flag} = 1;\n`;
      }
      case 'ret': {
        if (mode !== 'fn') fail('return outside a function', s);
        if (!s.value) return `${ind}__ret = 1;\n`;
        const v = e(s.value, ctx), rw = wOf(ctx.fn.retT);
        return `${ind}${ctx.base} = ${fitTarget(v, { t: ctx.fn.retT }, rw)};\n${ind}__ret = 1;\n`;
      }
      case 'null': case 'report': case 'textio': return '';   // (messages: not synthesized)
      // (an assertion: for the formal verification only, a VHDL note's a message; in a function, not checked)
      case 'assert':
        if (!formal || mode === 'fn' || s.sev === 'note') return '';
        return `${ind}${s.form === 'assume' ? 'assume' : 'assert'} (${truth(s.c, ctx)});\n`;
      case 'task': return inlineTask(s, ctx, ind, mode, loop);
      case 'sys':
        if (/^\$(display|write|strobe|monitor|info|warning|error|fatal|finish|stop)/.test(s.name || '')) return '';
        fail(`'${s.name || s.k}' cannot be synthesized`, s);
        break;
      case 'delay': case 'wait': case 'event': case 'forever': case 'while': case 'repeat': case 'fork':
        fail(`'${s.k}' cannot be synthesized here (only one clock edge or sensitivity list per process)`, s);
        break;
      default: fail(`statement '${s.k}' not supported by synthesis`, s);
    }
    return '';
  }
  // a procedure call, inlined: in its body each parameter stands for the actual (an expression for
  // in parameters, the actual signal / variable for out and inout ones); its own variables get
  // names unique to this call
  let taskN = 0;
  function inlineTask(s, ctx, ind, mode, loop) {
    const f = s.fn;
    if (!f?.body) fail(`procedure ${s.name || ''} cannot be synthesized (no body)`, s);
    if (mayLeave(f.body)) fail(`procedure ${f.name}: return inside a procedure is not supported by synthesis`, s);
    const sub = { proc: ctx.proc, fn: ctx.fn, locals: new Map(), base: `${ctx.base}_${(f.name || 'proc').replace(/[^\w]/g, '_')}${taskN++}`, flags: ctx.flags, subst: new Map(), parent: ctx, level: f.level };
    let pre = '';
    f.params.forEach((p, k) => {
      const a = s.args[k], out = s.outTargets?.[k];
      if (p.dir === 'in' || (!out && a)) {
        // in parameter: a copy (the procedure may assign its own copy)
        const v = e(a, ctx);
        const name = localName(sub, p.i, p.t);
        pre += `${ind}${name} = ${fit(v.x, v.w, v.s, wOf(p.t))};\n`;
      } else if (out) sub.subst.set(p.i, { lv: out, rv: p.dir === 'inout' ? out : null, ctx });
    });
    const body = stmt(f.body, sub, ind, mode, loop);
    // the procedure's own variables start at their declared values on every call
    const init0 = f.frameInit ? f.frameInit() : [], params = new Set(f.params.map(p => p.i));
    for (const [i, l] of sub.locals) {
      const v = typeof i === 'number' && !params.has(i) ? init0[i] : undefined;
      if (!v || Array.isArray(v) || v.str !== undefined || l.t.kind === 'array' || !(v.w > 0) || v.x === (1n << BigInt(v.w)) - 1n) continue;
      pre += `${ind}${l.name} = ${lit(V.resize(v, wOf(l.t)), wOf(l.t))};\n`;
    }
    (ctx.extraLocals ||= []).push(...sub.locals.values(), ...(sub.extraLocals || []));
    return pre + body;
  }

  // the value of an assignment at the width of its target (integers: their range width)
  function fitTarget(v, target, w) {
    return fit(v.x, v.w, v.s, w);
  }
  function mayLeave(s) {
    if (!s) return false;
    switch (s.k) {
      case 'ret': case 'exit': case 'next': return true;
      case 'blk': return s.stmts.some(mayLeave);
      case 'if': return mayLeave(s.then) || mayLeave(s.else);
      case 'case': return s.items.some(it => mayLeave(it.body)) || mayLeave(s.def);
      default: return false;
    }
  }
  const leaveFlags = (ctx, loop) => [ctx.fn ? '__ret' : null, loop?.brk, loop?.cont].filter(Boolean).join(' || ');

  // whole-array assignment (array signal <= constant or another array)
  // a memory (or a slice of one, #11) and its words: { name, off, len } for name[off + k]
  function memWords(n, ctx, lv) {
    if (n.k === 'sig') return { name: lv ? (wiredDrv.get(n.sig)?.get(ctx.proc) ?? sigName.get(n.sig)) : sigName.get(n.sig), off: 0, len: n.sig.t.len ?? (Array.isArray(n.sig.val) ? n.sig.val.length : 0) };
    if (n.k === 'loc') {
      const fc = frameCtx(ctx, n);
      if (fc.subst?.has(n.i)) { const sb = fc.subst.get(n.i); const sub = lv ? sb.lv : sb.rv; return sub ? memWords(sub, sb.ctx, lv) : null; }
      return { name: localName(fc, n.i, n.t), off: 0, len: n.t.len ?? 0 };
    }
    if (n.k === 'aslice') { const b = memWords(n.base, ctx, lv); return b && { name: b.name, off: b.off + n.off, len: n.t.len }; }
    return null;
  }
  function arrayCopy(s, ctx, ind) {
    const T = memWords(s.target, ctx, true);
    if (!T) fail('assignment of an array to a part of an array', s);
    const et = s.target.t.elem || { w: 1 };
    const op = s.nb ? '<=' : '=';
    if (s.value.k === 'c' && Array.isArray(s.value.val)) {
      return s.value.val.slice(0, T.len).map((v, k) => `${ind}${T.name}[${T.off + k}] ${op} ${lit(packVal(v, et), wOf(et))};\n`).join('');
    }
    const S0 = memWords(s.value, ctx, false);
    if (!S0) fail('an array expression assigned to an array (only a constant, another array or a slice of one)', s);
    return Array.from({ length: T.len }, (_, k) => `${ind}${T.name}[${T.off + k}] ${op} ${S0.name}[${S0.off + k}];\n`).join('');
  }

  return { stmt };
}
