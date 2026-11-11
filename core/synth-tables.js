// The Verilog translator's tables (#405: out of toVerilog in synth-verilog.js): an arithmetic expression that reads few
// input bits written as a table of its values (a function with a case over those bits, computed by the simulator's
// evaluator) when that is smaller than its operators; constant arrays (VHDL ROMs) as a case over the index; user
// functions as automatic SystemVerilog functions, or folded when they can be evaluated here. Isomorphic (no DOM, no
// Node APIs).
import * as V from './values.js';
import { evalE } from './interp.js';
import { TAB_BITS, esc, lit, sgn, signedInt } from './synth-verilog.js';

const summaries = new WeakMap();   // (tabulate's: a context -> its nodes' summaries)
const SWAPPED = ['a', 'b', 'c', 'base', 'index', 'left', 'right', 'start', 'count'];

/** { call, romRef, tabulate } of toVerilog. */
export function mountTables(ctx) {
  const {
    name, tables, e, e0, fail, fit, funcName, funcs, isMem, localName, packVal, sigName, stmt, uniq, wOf
  } = ctx;

  // ---------------- expressions of few input bits, as tables
  // An arithmetic expression (+ - * / shifts, comparisons…) that reads at most TAB_BITS bits of
  // signals and variables is written as a table of its values (a function with a case over those
  // bits), computed by the simulator's own evaluator (interp.js evalE) for every combination: Yosys
  // maps each operator onto a carry chain at the operator's width (VHDL integers: 32 bits), and a
  // table of k <= 6 input bits is at most a few LUTs per result bit. Blinky's
  // `ticks >= shift_left(to_unsigned(1, 32), level) - 1` (level: 3 bits) was a 32-bit subtracter
  // and a comparator in series (16 slices, the critical path), as a table one LUT per bit.
  // Taken only when the table is estimated smaller than the operators (tabCost < opCost).
  // (a node: false, true, or the nodes in it to check in order; its own inputs and cost added to own)
  const node = (m, ctx, own) => {
    if (!m || typeof m !== 'object') return false;
    switch (m.k) {
      case 'c': return !Array.isArray(m.val) && m.val?.w !== undefined && m.val.real === undefined;
      case 'sig': case 'loc': {
        const tt = m.k === 'sig' ? m.sig.t : m.t;
        if (!tt || tt.kind === 'real' || tt.kind === 'array' || tt.kind === 'record' || tt.kind === 'str' || !(tt.w > 0)) return false;
        if (m.k === 'sig' && (Array.isArray(m.sig.val) || m.sig.val?.w !== tt.w || !sigName.has(m.sig))) return false;
        if (m.k === 'loc' && (m.up != null || ctx.subst?.has(m.i))) return false;
        own.leaves.set(m.k === 'sig' ? m.sig : `loc${m.i}`, { node: m, t: tt, w: wOf(tt) });
        return true;
      }
      case 'bit': case 'slice': case 'dslice': case 'pslice':
        return [m.base, ...[m.index, m.left, m.right, m.start].filter(x => x !== undefined)];
      case 'un': {
        if (m.fp) return false;
        if (m.o === '-' || m.o === 'abs') own.ops += m.ew || m.t.w;
        return [m.a];
      }
      case 'bin': {
        if (m.fp || m.match) return false;
        const w = m.ew || m.t.w, ow = Math.max(m.cw || 0, m.a.t?.w || 0, m.b.t?.w || 0);
        if (['+', '-', '<', '<=', '>', '>='].includes(m.o)) own.ops += ['+', '-'].includes(m.o) ? w : ow;
        else if (['*', '/', '%', 'rem', 'mod'].includes(m.o)) own.ops += w * w;
        else if (['<<', '<<<', '>>', '>>>', '**'].includes(m.o) && m.b.k !== 'c') own.ops += 2 * w;
        return [m.a, m.b];
      }
      case 'cond': return [m.c, m.a, m.b];
      case 'cat': return m.parts;
      case 'repl': return m.count.k === 'c' && [m.a];
      case 'conv': return m.t.kind !== 'real' && !m.rtoi && [m.a];
      default: return false;
    }
  };

  // An expression's inputs (in the order a walk meets them first), their bits and the cost of its operators, or null
  // when it cannot be a table: each node's from the nodes in it, with a stack of its own and kept for this context, as
  // a chain of thousands of operators nests as deep and e asks again of each of its operators (#3375)
  const summary = (root, ctx) => {
    const known = summaries.get(ctx) ?? summaries.set(ctx, new WeakMap()).get(ctx);
    const of = m => (m && typeof m === 'object' ? known.get(m) : null);
    const stack = [root];
    while (stack.length) {
      const m = stack[stack.length - 1];
      if (m && typeof m === 'object' && known.has(m)) { stack.pop(); continue; }
      const own = { leaves: new Map(), ops: 0 };
      const r = node(m, ctx, own);
      const parts = r === true || r === false ? [] : r;
      const open = parts.filter(p => p && typeof p === 'object' && !known.has(p));
      if (r !== false && !parts.some(p => (p && typeof p === 'object' && known.has(p) ? !of(p) : !p || typeof p !== 'object'))) {
        if (open.length) { for (let i = open.length - 1; i >= 0; i--) stack.push(open[i]); continue; }
      }
      stack.pop();
      if (!m || typeof m !== 'object') continue;
      let sum = r === false ? null : { leaves: own.leaves, bits: 0, ops: own.ops };
      for (const p of parts) {
        const ps = sum && of(p);
        if (!ps) { sum = null; break; }
        for (const [key, l] of ps.leaves) if (!sum.leaves.has(key)) sum.leaves.set(key, l);
        sum.ops += ps.ops;
      }
      if (sum) sum.bits = [...sum.leaves.values()].reduce((b, l) => b + l.w, 0);
      known.set(m, sum && sum.bits <= TAB_BITS ? sum : null);
    }
    return of(root) ?? null;
  };

  const tabs = new Map();
  let tabOff = 0;
  function tabulate(n, ctx) {
    if (tabOff || !tables) return null;
    // the inputs (whole signals and variables) and the cost of the operators, or null
    const sum = summary(n, ctx);
    if (!sum || !sum.ops) return null;
    const { leaves, bits, ops } = sum;
    // the expression as the translator writes it: its width and sign
    tabOff++;
    let r;
    try { r = e0(n, ctx); } finally { tabOff--; }
    // its value for every combination of the input bits (input j: bits off[j] … of the index)
    const L = [...leaves.values()];
    const vals = [];
    for (let i = 0; i < 1 << bits; i++) {
      const frame = [];
      let off = 0;
      const sub = new Map();
      for (const l of L) {
        let p = BigInt((i >> off) & ((1 << l.w) - 1));
        off += l.w;
        if (l.t.kind === 'int' && signedInt(l.t)) p = BigInt.asIntN(l.w, p);
        const v = l.t.kind === 'int' ? V.fromInt(p, l.t.w, true) : V.mk(l.t.w, BigInt.asUintN(l.t.w, p), 0n, !!l.t.s);
        if (l.node.k === 'loc') frame[l.node.i] = v; else sub.set(l.node.sig, { ...l.node.sig, val: v });
      }
      // (a copy with the inputs' values: with a stack of its own, the copies of the nodes in a node made first, #3375)
      const swap = root => {
        const copy = new Map(), stack = [root];
        const leaf = m => !m || typeof m !== 'object' || Array.isArray(m) || m.k === 'sig' || m.k === 'c' || m.k === 'loc';
        const of = m => (!leaf(m) ? copy.get(m) : m?.k === 'sig' && sub.has(m.sig) ? { ...m, sig: sub.get(m.sig) } : m);
        const inside = m => [...SWAPPED.map(f => m[f]).filter(Boolean), ...(m.parts || [])].filter(x => !leaf(x) && !copy.has(x));
        while (stack.length) {
          const m = stack[stack.length - 1];
          if (leaf(m) || copy.has(m)) { stack.pop(); continue; }
          const open = inside(m);
          if (open.length) { stack.push(...open); continue; }
          const c = { ...m };
          for (const f of SWAPPED) if (m[f]) c[f] = of(m[f]);
          if (m.parts) c.parts = m.parts.map(of);
          copy.set(m, c);
          stack.pop();
        }
        return of(root);
      };
      let v;
      try { v = evalE(swap(n), { frame, probe: true }); } catch { v = V.allX(r.w); }
      if (!v || Array.isArray(v) || v.w !== r.w) return null;
      vals.push(v);
    }
    // cost: the result bits that are not constant, each a LUT of `bits` inputs (4-input LUTs)
    const varying = vals.reduce((m, v) => m | ((v.v ^ vals[0].v) | v.x | vals[0].x), 0n).toString(2).replace(/0/g, '').length;
    if (varying * (bits <= 4 ? 1 : 1 << (bits - 4)) >= ops) return null;
    if (!bits) return { x: lit(vals[0], r.w), w: r.w, s: r.s };
    const key = `${r.w}:${bits}:${vals.map(v => lit(v, r.w)).join(',')}`;
    if (!tabs.has(key)) {
      const fname = esc(uniq(`tab${tabs.size}`));
      funcs.push(`  function automatic [${r.w - 1}:0] ${fname}(input [${bits - 1}:0] i);\n    case (i)\n${vals.map((v, k) => `      ${bits}'d${k}: ${fname} = ${lit(v, r.w)};`).join('\n')}\n    endcase\n  endfunction`);
      tabs.set(key, fname);
    }
    // the index: the inputs' bits, the first input lowest
    const parts = L.map(l => (l.node.k === 'sig' ? sigName.get(l.node.sig) : localName(ctx, l.node.i, l.t))).reverse();
    const x = `${tabs.get(key)}(${parts.length > 1 ? `{${parts.join(', ')}}` : parts[0]})`;
    return { x: r.s ? `$signed(${x})` : x, w: r.w, s: r.s };
  }

  // constant arrays (VHDL ROMs): a function with a case over the index
  const roms = new Map();
  function romRef(n, ctx) {
    const arrNode = n.k === 'elem' ? n.base : n;
    let vals = arrNode.val;
    if (n.k !== 'elem') fail('a constant array used as a whole value', n);
    if (vals.some(v => !Array.isArray(v) && v.v === undefined)) fail('a constant array of strings or reals', n);
    const ew = wOf(n.t);
    // (elements that are records / arrays: packed; a constant index: the element itself)
    if (n.index.k === 'c') {
      const v = vals[V.toNum(n.index.val) - (arrNode.t.lo ?? 0)];
      return { x: lit(v === undefined ? V.allX(ew) : packVal(v, n.t), ew), w: ew, s: !!n.t.s };
    }
    if (vals.some(v => Array.isArray(v))) vals = vals.map(v => packVal(v, n.t));   // (a copy: the design's constant stays)
    const key = `${ew}:${arrNode.t.lo ?? 0}:${vals.map(v => lit(v, ew)).join(',')}`;
    if (!roms.has(key)) {
      const fname = `rom${roms.size}`;
      const lo = arrNode.t.lo ?? 0;
      const iw = 32;
      funcs.push(`  function automatic [${ew - 1}:0] ${fname}(input signed [${iw - 1}:0] i);\n    case (i)\n${vals.map((v, k) => `      ${k + lo}: ${fname} = ${lit(v, ew)};`).join('\n')}\n      default: ${fname} = ${lit(V.allX(ew), ew)};\n    endcase\n  endfunction`);
      roms.set(key, fname);
    }
    const i = e(n.index, ctx);
    return { x: `${roms.get(key)}(${fit(i.x, i.w, i.s, 32)})`, w: ew, s: !!n.t.s };
  }

  // a function that can be evaluated here: it reads and writes no signal and has no timing control
  // or random value (its messages, such as an $error for a bad parameter, do not matter: a function
  // that only has them is "impure" for the simulator)
  const foldMemo = new Map();
  function foldable(f) {
    if (foldMemo.has(f)) return foldMemo.get(f);
    foldMemo.set(f, false);   // (a recursive call: not folded)
    let ok = true;
    const walk = (x, d = 0) => {
      if (!ok || !x || typeof x !== 'object' || d > 400) return;
      if (Array.isArray(x)) { for (const y of x) walk(y, d + 1); return; }
      if (x.k === 'sig' || x.k === 'xloc' || (x.k === 'loc' && x.up != null) || ['delay', 'event', 'wait', 'fork', 'waitfork', 'edge', 'now', 'sigattr'].includes(x.k)) { ok = false; return; }
      if (x.k === 'sys' && /random|time|fopen|fclose|readmem|fgets|fscanf|feof|fread/.test(x.name || '')) { ok = false; return; }
      if ((x.k === 'call' || x.k === 'task') && x.fn && x.fn.body && !foldable(x.fn)) { ok = false; return; }
      for (const k in x) if (k !== 't' && k !== 'fn' && k !== 'loc' && k !== 'val') walk(x[k], d + 1);
    };
    walk(f.body);
    foldMemo.set(f, ok);
    return ok;
  }

  // user functions: automatic SystemVerilog functions with the same body
  function call(n, ctx) {
    const f = n.fn;
    if (n.outTargets) fail(`function ${f?.name || ''}: output arguments of a function called in an expression cannot be synthesized`, n);
    // a pure function called with constant arguments (verilog-lfsr's lfsr_mask(n) in a generate
    // loop): evaluated here, its value a literal; Yosys took ~110 s on such calls, with ~160
    // warnings (#13)
    if (f && f.body && foldable(f) && f.retT && f.retT.kind !== 'array' && n.args.every(a => a.k === 'c' && !Array.isArray(a.val) && a.val.str === undefined && a.val.real === undefined)) {
      let v = null;
      try { v = evalE(n, { frame: [], sim: null, depth: 0 }); } catch { v = null; }
      if (v && !Array.isArray(v) && v.v !== undefined && v.str === undefined && v.real === undefined) {
        const w = f.retT.w || v.w;
        return { x: lit(V.resize(v, w), w), w, s: !!f.retT.s };
      }
    }
    if (!f || !f.body) fail(`function ${n.name || ''} cannot be synthesized (no body)`, n);
    if (!funcName.has(f)) {
      const fname = esc(uniq(`fn_${(f.name || 'f').replace(/[^\w]/g, '_')}`));
      funcName.set(f, fname);
      const fctx = { fn: f, locals: new Map(), base: fname, flags: [], level: f.level };
      const rw = wOf(f.retT);
      const params = f.params.map(p => { fctx.locals.set(p.i, { name: `v${p.i}`, t: p.t, param: true }); return `input ${sgn(p.t) ? 'signed ' : ''}[${wOf(p.t) - 1}:0] v${p.i}`; });
      // Verilog functions return through their own name (a slot of the frame)
      if (f.retSlot != null) fctx.locals.set(f.retSlot, { name: fname, t: f.retT, param: true });
      const body = stmt(f.body, fctx, '    ', 'fn');
      // the variables of the procedures inlined in the function are the function's own too
      for (const l of fctx.extraLocals || []) fctx.locals.set(Symbol('inlined'), l);
      // the local variables start at their declared values on every call
      const init0 = f.frameInit ? f.frameInit() : [];
      const inits = [...fctx.locals.entries()].filter(([i, l]) => !l.param && init0[i] && !Array.isArray(init0[i]) && init0[i].v !== undefined && !init0[i].x)
        .map(([i, l]) => `    ${l.name} = ${lit(V.resize(init0[i], wOf(l.t)), wOf(l.t))};\n`).join('');
      // (a local memory keeps its words: reg [w-1:0] m [0:n-1], as the processes' locals)
      const loc = [...fctx.locals.values()].filter(l => !l.param).map(l => `    reg ${sgn(l.t) ? 'signed ' : ''}${isMem(l.t) ? `[${wOf(l.t.elem) - 1}:0] ${l.name} [0:${l.t.len - 1}]` : `[${wOf(l.t) - 1}:0] ${l.name}`};`);
      funcs.push(`  function automatic ${sgn(f.retT) ? 'signed ' : ''}[${rw - 1}:0] ${fname}(${params.join(', ')});\n${['    reg __ret;', ...loc, ...fctx.flags.map(x => `    reg ${x};`)].join('\n')}\n  begin\n    __ret = 0;\n    ${fname} = 0;\n${inits}${body}  end\n  endfunction`);
    }
    const args = n.args.map((a, k) => { const v = e(a, ctx); const p = f.params[k]; return fit(v.x, v.w, v.s, wOf(p.t)); });
    const rw = wOf(f.retT);
    const x = `${funcName.get(f)}(${args.join(', ')})`;
    if (f.retT?.kind === 'int' && rw !== f.retT.w) return { x: fit(x, rw, signedInt(f.retT), f.retT.w), w: f.retT.w, s: true };
    return { x, w: rw, s: !!f.retT?.s };
  }

  return { call, romRef, tabulate };
}
