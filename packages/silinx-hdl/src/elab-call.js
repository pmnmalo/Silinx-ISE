// Silinx elaboration - calls (#405: out of core/elab-expr.js): the built-in VHDL subprograms, std.textio's
// procedures, Verilog's system functions and calls, a subprogram's overload chosen, and a call bound to the
// subprogram it calls (constant ones evaluated).
import {
  BIT, BOOL, ElabError, FrameBuilder, INT, REAL, STR, Scope, TIME, bindBlock, bindDecl, bindLvalue, cI, collectRW, constOf,
  containsKind, ctxSize, defaultValue, diag, dimsOf, elabType, fitVal, fold, isConstNode, isLvalueExpr, stdTypeName, strVec,
  vecT, walk,
} from './elaborate.js';
import { SimError } from './interp.js';
import * as V from './values.js';
import { bindExpr, edgeOperand, hierResolve, slvNum, strAsLogic } from './elab-expr.js';

export function positional(args) { return args.map(a => (a && a.named !== undefined ? a.value : a)); }

// names of the built-in VHDL subprograms (bindBuiltin; finish / stop: std.env procedures)
export const BUILTIN_SUBPROGRAMS = new Set(`rising_edge falling_edge to_unsigned conv_unsigned to_signed conv_signed conv_std_logic_vector
to_integer conv_integer resize ext sxt to_stdlogicvector to_bitvector to_stdulogicvector to_01 to_x01 to_stdulogic to_bit
shift_left shift_right rotate_left rotate_right and_reduce or_reduce xor_reduce nand_reduce nor_reduce xnor_reduce
to_string to_bstring to_hstring minimum maximum now std_match finish stop`.split(/\s+/));

// std.textio (and std_logic_textio / VHDL-2008's hwrite, owrite, bwrite, hread…): writing lines to
// the simulator's console (OUTPUT, and files: their lines are shown with the file's name) and
// reading lines of the project's data files
export const TEXTIO_PROCS = new Set(['write', 'writeline', 'read', 'readline', 'deallocate', 'flush', 'hwrite', 'owrite', 'bwrite', 'hread', 'oread', 'bread']);
const TIME_UNITS = { fs: 0.001, ps: 1, ns: 1e3, us: 1e6, ms: 1e9, sec: 1e12, min: 6e13, hr: 3.6e15 };
function textioFile(E, a, loc) {
  if (a && a.op === 'ref' && /^(output|input)$/i.test(a.name) && !E.sc.lookup(a.name)) return { k: 'c', val: { str: a.name.toLowerCase(), std: true }, t: STR };
  return bindExpr(E, a, null, loc);
}
export function bindTextio(E, name, rawArgs, loc) {
  const pos = [], named = {};
  for (const a of rawArgs) { if (a && a.named !== undefined) named[String(a.named).toLowerCase()] = a.value; else pos.push(a); }
  const need = (a, what) => { if (!a) throw new ElabError(`${name}: missing ${what}`, loc); return a; };
  switch (name) {
    case 'flush': return { k: 'null', loc };
    case 'deallocate': return { k: 'textio', op: name, line: bindLvalue(E, need(pos[0], 'the line'), loc), loc };
    case 'writeline': case 'readline':
      return { k: 'textio', op: name, file: textioFile(E, need(named.f ?? named.file ?? pos[0], 'the file'), loc), line: bindLvalue(E, need(named.l ?? pos[1], 'the line'), loc), loc };
    case 'write': case 'hwrite': case 'owrite': case 'bwrite': {
      const line = bindLvalue(E, need(named.l ?? pos[0], 'the line'), loc);
      const value = bindExpr(E, need(named.value ?? pos[1], 'the value'), null, loc);
      const jArg = named.justified ?? pos[2], fArg = named.field ?? pos[3], xArg = named.unit ?? named.digits ?? pos[4];
      let justified = 'right';
      if (jArg) {
        if (jArg.op !== 'ref' || !/^(left|right)$/i.test(jArg.name)) throw new ElabError(`${name}: justified is right or left`, loc);
        justified = jArg.name.toLowerCase();
      }
      const field = fArg ? bindExpr(E, fArg, INT, loc) : null;
      // (unit => ns: a time unit's name; digits => n)
      const extra = !xArg ? null : xArg.op === 'ref' && TIME_UNITS[xArg.name.toLowerCase()] !== undefined && !E.sc.lookup(xArg.name)
        ? { k: 'c', val: V.fromInt(TIME_UNITS[xArg.name.toLowerCase()] >= 1 ? TIME_UNITS[xArg.name.toLowerCase()] : 0, 64, true), t: TIME }
        : bindExpr(E, xArg, null, loc);
      return { k: 'textio', op: name, line, value, justified, field, extra, loc };
    }
    case 'read': case 'hread': case 'oread': case 'bread': {
      const g = named.good ?? pos[2];
      return { k: 'textio', op: name, line: bindLvalue(E, need(named.l ?? pos[0], 'the line'), loc), target: bindLvalue(E, need(named.value ?? pos[1], 'the variable'), loc), good: g ? bindLvalue(E, g, loc) : null, loc };
    }
  }
  throw new ElabError(`textio procedure '${name}' is not supported`, loc);
}

export function bindBuiltin(E, name, rawArgs, expect, loc) {
  const args = positional(rawArgs);
  const A = i => bindExpr(E, args[i], null, loc);
  const C = i => V.toNum(constOf(E, A(i), loc));
  const conv = (a, w, s, ext = a.t.s, kind) => fold({ k: 'conv', a, ext, t: kind === 'int' ? INT : vecT(w, s) });
  switch (name) {
    case 'rising_edge': case 'falling_edge': {
      const a = A(0);
      if (!edgeOperand(a)) throw new ElabError(`${name} requires a signal`, loc);
      return { k: 'edge', ...edgeOperand(a), pos: name === 'rising_edge', t: BOOL };
    }
    case 'to_unsigned': case 'conv_unsigned': return conv(A(0), C(1), false, true);
    case 'to_signed': case 'conv_signed': return conv(A(0), C(1), true, true);
    case 'conv_std_logic_vector': return conv(A(0), C(1), false);
    case 'to_integer': case 'conv_integer': case 'integer': case 'natural': case 'positive': { const a = slvNum(E, A(0)); return conv(a, 32, true, a.t.s, 'int'); }
    case 'real': { const a = A(0); return fold({ k: 'conv', a, ext: a.t.s, t: REAL }); }
    // boolean(c): a conversion to the type it already has (NEORV32: boolean(BOOT_MODE_SELECT = 0))
    case 'boolean': { const a = A(0); if (a.t.kind !== 'bool') throw new ElabError(`cannot convert to boolean`, loc); return a; }
    case 'resize': {
      const a = A(0), w = C(1);
      if (a.t.s && a.t.kind === 'logic' && w < a.t.w) return fold({ k: 'conv', a, ext: true, sres: true, t: vecT(w, true) });
      return conv(a, w, a.t.s);
    }
    case 'ext': return conv(A(0), C(1), false, false);
    case 'sxt': return conv(A(0), C(1), true, true);
    case 'unsigned': case 'std_logic_vector': case 'std_ulogic_vector': case 'to_stdlogicvector': case 'to_bitvector': case 'to_stdulogicvector': case 'bit_vector': {
      const a = A(0);
      if (a.t.kind === 'int') throw new ElabError(`cannot convert an integer with ${name}(); use to_unsigned(x, n)`, loc);
      const n = conv(a, a.t.w, false);
      // (std_logic_vector(u) / bit_vector(…) keep their type mark: overloads on the type, #72)
      const mark = name === 'unsigned' ? null : /bit/.test(name) ? 'bit_vector' : 'std_logic_vector';
      return mark ? { ...n, t: { ...n.t, mark } } : n;
    }
    case 'signed': { const a = A(0); return conv(a, a.t.w, true); }
    case 'to_01': case 'to_x01': case 'std_logic': case 'to_stdulogic': case 'to_bit': return A(0);
    case 'shift_left': case 'shift_right': case 'rotate_left': case 'rotate_right': {
      const a = A(0), b = A(1);
      const o = name === 'shift_left' ? '<<' : name === 'shift_right' ? (a.t.s ? '>>>' : '>>') : name === 'rotate_left' ? 'rol' : 'ror';
      return fold({ k: 'bin', o, a, b, t: a.t });
    }
    case 'and_reduce': case 'or_reduce': case 'xor_reduce': case 'nand_reduce': case 'nor_reduce': case 'xnor_reduce': {
      const o = { and_reduce: '&', or_reduce: '|', xor_reduce: '^', nand_reduce: '~&', nor_reduce: '~|', xnor_reduce: '~^' }[name];
      return fold({ k: 'un', o, a: A(0), t: BIT });
    }
    case 'to_string': case 'to_bstring': return { k: 'image', a: A(0), t: STR, ts: true };
    case 'endfile': return { k: 'textio_eof', file: textioFile(E, args[0], loc), t: BOOL };
    case 'to_hstring': return { k: 'image', a: A(0), t: STR, hex: true };
    // ieee.math_real: ceil, floor, round, trunc, sqrt, log2, log10, log (natural, or to a base), exp, sign,
    // realmax, realmin (on reals; folded when constant, as in `constant W : natural := integer(ceil(log2(real(N))));`)
    case 'ceil': case 'floor': case 'round': case 'trunc': case 'sqrt': case 'log2': case 'log10': case 'log': case 'exp': case 'sign': case 'realmax': case 'realmin': {
      const ra = args.map((_, i) => { const a = A(i); return a.t.kind === 'real' ? a : fold({ k: 'conv', a, ext: !!a.t.s, t: REAL }); });
      if (!ra.length || ra.length > 2) throw new ElabError(`'${name}' takes one or two real arguments`, loc);
      return fold({ k: 'rfn', f: name, a: ra[0], b: ra[1], t: REAL });
    }
    case 'minimum': case 'maximum': {
      const a = A(0), b = A(1);
      const c = { k: 'bin', o: name === 'minimum' ? '<' : '>', a, b, t: BOOL };
      return fold({ k: 'cond', c, a, b, t: a.t });
    }
    case 'now': return { k: 'now', t: TIME, unit: 1 };
    // '-' in a constant operand is a don't care ('-' and 'X' share one encoding)
    case 'std_match': { const a = A(0), b = A(1); return fold({ k: 'bin', o: '==', a: strAsLogic(a, b), b: strAsLogic(b, a), t: BOOL, vh: true, match: true }); }
  }
  throw new ElabError(`'${name}' is not declared`, loc);
}

export function bindVlogCall(E, e, expect, loc) {
  const name = e.name;
  if (name[0] === '$') {
    const A = i => bindExpr(E, e.args[i], null, loc);
    // the type of an argument that may be a type's name ($bits(my_t))
    const T = i => { const a = e.args[i]; const te = a?.op === 'ref' ? E.sc.lookup(a.name) : null; return te?.kind === 'type' ? te.t : A(i).t; };
    switch (name) {
      case '$signed': { const a = A(0); return fold({ k: 'conv', a, ext: a.t.s, t: vecT(a.t.w, true) }); }
      case '$unsigned': { const a = A(0); return fold({ k: 'conv', a, ext: a.t.s, t: vecT(a.t.w, false) }); }
      // SystemVerilog size cast W'(expr): the value at W bits, extended by its own sign, signedness kept
      case '$__size_cast': { const w = Number(e.args[0].value), a = A(1); return fold({ k: 'conv', a, ext: a.t.s, t: vecT(w, a.t.s) }); }
      // a cast to a type T'(expr): signed'(x), unsigned'(x), int'(x), my_t'(x) (IEEE 1800-2017 6.24.1)
      case '$__type_cast': {
        const tn = e.args[0].name, a = strVec(E, A(1));
        if (tn === 'signed' || tn === 'unsigned') return fold({ k: 'conv', a, ext: a.t.s, t: vecT(a.t.w, tn === 'signed') });
        const te = E.sc.lookup(tn);
        const t = te?.kind === 'type' ? te.t : tn === 'int' || tn === 'integer' ? INT : { byte: vecT(8, true), shortint: vecT(16, true), longint: vecT(64, true), bit: BIT }[tn];
        if (!t || t.kind === 'array' || t.kind === 'real' || t.kind === 'str') throw new ElabError(`cast to '${tn}' is not supported`, loc);
        ctxSize(a, Math.max(a.t.w, t.w));
        return fold({ k: 'conv', a, ext: a.t.s, t });
      }
      case '$clog2': {
        diag(E, '$clog2 is not supported by XST (ISE 14.7); use a constant function instead', loc, 'warning', 'Silinx');   // (Silinx's own message)
        const a = A(0);
        if (isConstNode(a)) {
          const v = V.toBig(constOf(E, a, loc));
          let r = 0; while ((1n << BigInt(r)) < v) r++;
          return { k: 'c', val: V.fromInt(r), t: INT };
        }
        // a non-constant argument (a constant function's own argument, #59): the number of powers of
        // two below the value, sum of (a > 2**i) for i < its width; folds when the call is evaluated
        const w = Math.max(1, a.t.w), ut = vecT(w, false);
        const ua = { k: 'conv', a, ext: !!a.t.s, t: ut };
        let sum = cI(0);
        for (let i = 0; i < w; i++) {
          const p2 = { k: 'c', val: V.fromInt(1n << BigInt(i), w, false), t: ut };
          const gt = { k: 'bin', o: '>', a: ua, b: p2, t: BIT };
          sum = { k: 'bin', o: '+', a: sum, b: { k: 'conv', a: gt, ext: false, t: INT }, t: INT };
        }
        return fold(sum);
      }
      case '$bits': { const t = T(0); return cI(t.kind === 'array' && !t.fields ? t.len * t.elem.w : t.w); }
      // array queries (IEEE 1800-2017 20.7) of dimension d (1: the first unpacked one, or the
      // first packed one of a vector)
      case '$left': case '$right': case '$low': case '$high': case '$size': case '$increment': {
        const dims = dimsOf(T(0));
        const d = e.args[1] ? V.toNum(constOf(E, A(1), loc)) : 1;
        if (d < 1 || d > dims.length) throw new ElabError(`${name}: no dimension ${d}`, loc);
        const { left, right } = dims[d - 1];
        const v = { $left: left, $right: right, $low: Math.min(left, right), $high: Math.max(left, right), $size: Math.abs(left - right) + 1, $increment: left >= right ? 1 : -1 }[name];
        return cI(v);
      }
      case '$dimensions': return cI(dimsOf(T(0)).length);
      // $countbits(e, c…): the number of bits of e equal (===) to one of the control bits (20.9)
      case '$countbits': case '$countones': case '$onehot': case '$onehot0': {
        const a = A(0);
        const ctl = name === '$countbits'
          ? [...new Set(e.args.slice(1).map((_, k) => { const v = constOf(E, A(k + 1), loc); return V.toBin(V.resize(v, Math.max(1, v.w))).slice(-1); }))]
          : ['1'];
        const bitLit = b => ({ k: 'c', val: V.fromBits(b), t: BIT });
        let sum = cI(0);
        for (let i = 0; i < a.t.w; i++) {
          const bit = { k: 'slice', base: a, lo: i, t: BIT };
          const hit = ctl.map(c => ({ k: 'bin', o: '===', a: bit, b: bitLit(c), t: BIT })).reduce((x, y) => ({ k: 'bin', o: '|', a: x, b: y, t: BIT }));
          sum = { k: 'bin', o: '+', a: sum, b: { k: 'conv', a: hit, ext: false, t: INT }, t: INT };
        }
        if (name === '$onehot') return fold({ k: 'bin', o: '==', a: sum, b: cI(1), t: BIT });
        if (name === '$onehot0') return fold({ k: 'bin', o: '<=', a: sum, b: cI(1), t: BIT });
        return fold(sum);
      }
      // $isunknown(e): a bit of e is x or z (the reduction xor of e is x)
      case '$isunknown': { const a = A(0); return fold({ k: 'bin', o: '===', a: { k: 'un', o: '^', a, t: BIT }, b: { k: 'c', val: V.X1, t: BIT }, t: BIT }); }
      // real math functions of constant arguments (20.8)
      case '$floor': case '$ceil': case '$sqrt': case '$ln': case '$log10': case '$exp': case '$pow': case '$sin': case '$cos': case '$tan': case '$asin': case '$acos': case '$atan': case '$atan2': case '$hypot': case '$sinh': case '$cosh': case '$tanh': {
        // (an argument known at run time only: evaluated by the simulator)
        const ns = e.args.map((_, k) => A(k));
        if (!ns.every(isConstNode)) {
          const ra = ns.map(a => (a.t.kind === 'real' ? a : fold({ k: 'conv', a, ext: !!a.t.s, t: REAL })));
          return fold({ k: 'rfn', f: name, a: ra[0], b: ra[1], t: REAL });
        }
        const r = ns.map(n => { const v = constOf(E, n, loc); return n.t.kind === 'real' ? V.toReal(v) : Number(V.toDec(v, !!n.t.s)); });
        const f = { $floor: Math.floor, $ceil: Math.ceil, $sqrt: Math.sqrt, $ln: Math.log, $log10: Math.log10, $exp: Math.exp, $pow: Math.pow, $sin: Math.sin, $cos: Math.cos, $tan: Math.tan, $asin: Math.asin, $acos: Math.acos, $atan: Math.atan, $atan2: Math.atan2, $hypot: Math.hypot, $sinh: Math.sinh, $cosh: Math.cosh, $tanh: Math.tanh }[name];
        return { k: 'c', val: V.real(f(...r)), t: REAL };
      }
      case '$time': case '$stime': return { k: 'sys', name, args: [], t: vecT(64) };
      case '$realtime': return { k: 'sys', name, args: [], t: REAL };
      case '$fopen': return { k: 'sys', name, args: [], t: vecT(32) };   // (file output goes to the log)
      case '$sformatf': return { k: 'sys', name, args: e.args.map((_, i) => { const a = A(i); ctxSize(a, a.t.w); return a; }), t: STR };
      case '$random': return { k: 'sys', name, args: e.args.length ? [bindLvalue(E, e.args[0], loc)] : [], t: INT };
      case '$urandom': return { k: 'sys', name, args: [], t: vecT(32) };
      case '$urandom_range': return { k: 'sys', name, args: e.args.map((_, i) => A(i)), t: vecT(32) };
      case '$rtoi': { const a = A(0); return fold({ k: 'conv', a, ext: true, rtoi: true, t: INT }); }   // truncates
      case '$itor': { const a = A(0); return fold({ k: 'conv', a, ext: a.t.s, t: REAL }); }
      case '$realtobits': case '$bitstoreal': return A(0);
    }
    throw new ElabError(`system function ${name} is not supported`, loc);
  }
  let entry = E.sc.lookup(name);
  // a recursive call: inside the function its name is the return variable; find the function
  for (let sc = E.sc; entry && entry.kind !== 'func' && sc; sc = sc.parent) { const x = sc.local(name); if (x && x.kind === 'func') entry = x; }
  if (!entry && (e.path || name.includes('.'))) entry = hierResolve(E, name, e.path, loc)?.entry || null;   // top.f(x), blk.f(x)
  if (!entry || entry.kind !== 'func') throw new ElabError(`function '${name}' is not declared`, loc);
  return bindCall(E, entry, e.args, name, loc);
}

// VHDL overloaded subprogram: the alternative whose parameter types fit the actuals (first
// exactly - signedness, type marks -, then by kind of type); the last declared one otherwise.
export function pickOverload(E, entry, rawArgs, loc) {
  if (!entry.alts) return entry;
  let acts;
  try {
    acts = rawArgs.map(a => (a == null ? null : { named: a.named, n: bindExpr(E, a.named !== undefined ? a.value : a, null, loc) }));
  } catch (e) {
    if (e instanceof ElabError || e instanceof SimError) return entry;
    throw e;
  }
  const fitsType = (n, pt, strict) => {
    const at = n.t;
    if (n.k === 'str' && pt.kind === 'logic') return !pt.scalar && /^[01uxzwlh-]+$/i.test(n.value);
    if (pt.kind !== at.kind) return false;
    switch (pt.kind) {
      case 'logic':
        if (pt.scalar ? !(at.w === 1 && at.scalar) : at.scalar) return false;
        return !strict || pt.scalar || (!!at.s === !!pt.s && (at.mark || '') === (pt.mark || ''));
      case 'enum': return at.name === pt.name;
      case 'array': return !strict || !pt.name || at.name === pt.name;
      default: return true;
    }
  };
  // a character literal ('q') is a character, not a one-character string (it binds as either)
  const charLit = k => { const r = rawArgs[k]; const x = r && r.named !== undefined ? r.value : r; return !!(x && ((x.op === 'str' && x.char) || (x.op === 'lit' && x.scalar && x.ch))); };
  const fits = (alt, strict) => {
    const ps = alt.decl.params, used = new Set();
    if (acts.length > ps.length) return false;
    for (let k = 0; k < acts.length; k++) {
      const a = acts[k];
      if (!a) continue;
      const i = a.named !== undefined ? ps.findIndex(p => p.name === a.named) : k;
      if (i < 0) return false;
      used.add(i);
      let pt;
      try { pt = elabType(alt.E, ps[i].type, true); } catch { return false; }
      if (charLit(k)) { if (pt.char) continue; if (pt.kind === 'str' && strict) return false; }
      if (!fitsType(a.n, pt, strict)) return false;
    }
    return ps.every((p, i) => used.has(i) || p.default);
  };
  return entry.alts.find(a => fits(a, true)) || entry.alts.find(a => fits(a, false)) || entry;
}

export function bindCall(E, entry, rawArgs, name, loc) {
  entry = pickOverload(E, entry, rawArgs, loc);
  const decl = entry.decl;
  if (decl.kind === 'task') throw new ElabError(`'${name}' is a procedure/task, not a function`, loc);
  if (rawArgs.filter(a => !(a && a.named !== undefined)).length > decl.params.length) throw new ElabError(`too many arguments in call to '${name}'`, loc);
  // named association
  let argExprs = new Array(decl.params.length).fill(null);
  rawArgs.forEach((a, k) => {
    if (a && a.named !== undefined) {
      const idx = decl.params.findIndex(p => p.name === a.named);
      if (idx < 0) throw new ElabError(`'${name}' has no parameter '${a.named}'`, loc);
      argExprs[idx] = a.value;
    } else argExprs[k] = a;
  });
  argExprs = argExprs.map((a, k) => a || decl.params[k].default || null);   // VHDL default parameter values
  const args = argExprs.map((a, k) => {
    if (!a) throw new ElabError(`missing argument '${decl.params[k].name}' in call to '${name}'`, loc);
    let at = null;   // an aggregate actual takes the type of its parameter
    if (a.op === 'aggregate') { try { at = elabType(entry.E, decl.params[k].type, true); } catch { at = null; } }
    const n = strVec(E, bindExpr(E, a, at && !at.unconstrained ? at : null, loc));
    // a std_logic string literal (kept as a string in report messages) for a vector parameter
    const pt = decl.params[k].type;
    if (E.lang === 'vhdl' && n.k === 'str' && pt && (pt.kind === 'logic' || (pt.kind === 'named' && stdTypeName(pt.name)?.kind === 'logic'))) return strAsLogic(n, { t: { kind: 'logic' } });
    return n;
  });
  const fn = boundFunction(entry, args, loc);
  if (decl.kind === 'task' || !fn.retT) throw new ElabError(`'${name}' is a procedure/task, not a function`, loc);
  args.forEach((a, k) => { if (E.lang === 'verilog') ctxSize(a, fn.params[k].t.w); });
  // a function's output / inout arguments (SystemVerilog f(k, o) in an expression): the actuals
  // are assigned when it returns
  const outs = decl.params.map((p, k) => (p.dir === 'out' || p.dir === 'inout') && argExprs[k] && isLvalueExpr(argExprs[k]) ? bindLvalue(E, argExprs[k], loc) : null);
  if (outs.some(Boolean)) return { k: 'call', fn, args, t: fn.retT, outTargets: outs, loc };
  return fold({ k: 'call', fn, args, t: fn.retT });
}

// Bound function / procedure for these argument types (cached per argument types).
// VHDL: when the generic binding fails (e.g. a width depends on an integer parameter:
// `variable r : std_logic_vector(n-1 downto 0)`, `to_unsigned(i, w)`), the subprogram is bound
// again with its constant integer arguments known as constants (cached per argument value).
// The cache key of an argument's type: its kind, width and sign, and for a vector or an array its
// index range and direction (an unconstrained parameter takes them: 'range, 'left, indexing)
const argTypeKey = t => `${t.kind}${t.w}${t.s ? 's' : ''}`
  + (t.kind === 'array' ? `[${t.left}:${t.right}${t.desc ? 'd' : ''}x${t.len}]{${t.elem ? argTypeKey(t.elem) : ''}}`
    : t.kind === 'logic' && t.left !== undefined ? `[${t.left}:${t.right}${t.desc ? 'd' : ''}]` : '');

export function boundFunction(entry, args, loc, sigActuals = null) {
  const decl = entry.decl;
  const key = args.map(a => argTypeKey(a.t)).join(',');
  const consts = new Map();
  if (entry.E.lang === 'vhdl') {
    decl.params.forEach((p, k) => {
      const a = args[k];
      if (!sigActuals?.[k] && a && a.k === 'c' && a.t.kind === 'int' && p.dir !== 'out' && p.dir !== 'inout' && String(p.class || '').toLowerCase() !== 'variable') consts.set(k, a.val);
    });
  }
  if (!sigActuals && entry.cache.has(key)) {
    const fn = entry.cache.get(key);
    if (!fn.needsConsts) return fn;
  } else if (consts.size) {
    // try the generic binding; on errors, fall back to the per-constant one
    const diags = entry.E.ctx.design.diags, n0 = diags.length;
    let fn = null;
    try { fn = bindSubprogram(entry, args, key, sigActuals, null); } catch (e) { if (!(e instanceof ElabError) && !(e instanceof SimError)) throw e; }
    if (fn && !diags.slice(n0).some(d => d.severity === 'error')) return fn;
    diags.length = n0;
    if (!sigActuals) entry.cache.set(key, { needsConsts: true });
  } else {
    return bindSubprogram(entry, args, key, sigActuals, null);
  }
  if (!consts.size) return entry.cache.get(key);
  const ckey = key + '|' + [...consts].map(([k, v]) => `${k}=${V.toDec(v, true)}`).join(',');
  if (!sigActuals && entry.cache.has(ckey)) return entry.cache.get(ckey);
  return bindSubprogram(entry, args, ckey, sigActuals, consts);
}

function bindSubprogram(entry, args, key, sigActuals, consts) {
  const decl = entry.decl;
  const DE = entry.E;
  const fb = new FrameBuilder(DE.outerFb);
  const sc = new Scope(DE.sc);
  // inTask: a Verilog task or a VHDL procedure, which may assign the signals it sees (a function should not)
  const FE = { ...DE, sc, fb, inProcess: true, inFunction: true, inTask: decl.kind === 'task' || !decl.returnType };
  const fn = { name: decl.name, params: [], body: null, retSlot: null, retT: null, impure: false, level: fb.level, loc: decl.loc };
  // a Verilog task or function that is not automatic: its variables are static (the simulator keeps
  // them from one call to the next; one set per declaration, so per instance of its module)
  if (DE.lang === 'verilog' && !decl.automatic) fn.static = entry.static ??= Symbol(decl.name);
  if (!sigActuals) entry.cache.set(key, fn);
  try {
    decl.params.forEach((p, k) => {
      if (sigActuals?.[k]) {
        const a = sigActuals[k];
        sc.def(p.name, { kind: 'alias', rv: a.rv, lv: a.lv, t: a.rv.t });
        fn.params.push({ alias: true, dir: p.dir, name: p.name });
        return;
      }
      let t = elabType(FE, p.type, true);
      if ((t.unconstrained || (t.kind === 'logic' && t.w === 1 && p.type.kind === 'logic' && !p.type.range && args[k] && args[k].t.w > 1 && DE.lang === 'vhdl')) && args[k]) {
        t = { ...args[k].t };
        delete t.unconstrained;
      }
      const i = fb.alloc(t, defaultValue(t, DE.lang));
      if (consts?.has(k)) sc.def(p.name, { kind: 'const', val: fitVal(consts.get(k), t), t });
      else sc.def(p.name, { kind: 'loc', i, t, lvl: fb.level });
      fn.params.push({ i, t, dir: p.dir, name: p.name });
    });
    let retOpen = false;
    if (decl.returnType) {
      let rt = elabType(FE, decl.returnType, true);
      if (rt.unconstrained) {
        // provisional (recursive calls): refined from the return statements below
        retOpen = rt.kind === 'logic';
        rt = args[0] ? { ...args[0].t } : vecT(1);
        delete rt.unconstrained;
        if (decl.returnType.signed !== undefined && rt.kind === 'logic') rt.s = !!decl.returnType.signed;
      }
      fn.retT = rt;
      if (!retOpen) FE.retT = rt;   // (aggregates in return statements)
      if (decl.retVar) {
        fn.retSlot = fb.alloc(rt, defaultValue(rt, DE.lang));
        sc.def(decl.retVar, { kind: 'loc', i: fn.retSlot, t: rt, lvl: fb.level });
      }
    }
    for (const d of decl.decls) bindDecl(FE, d);
    fn.body = bindBlock(FE, decl.body, decl.loc);
    if (retOpen) {
      // unconstrained return type (VHDL): the width of the returned values, when they agree
      const ws = new Set();
      walk(fn.body, x => { if (x.k === 'ret' && x.value && x.value.t) ws.add(x.value.t.kind === 'logic' ? x.value.t.w : -1); });
      if (ws.size === 1 && !ws.has(-1)) fn.retT = vecT([...ws][0], !!fn.retT.s);
    }
  } catch (e) {
    if (!sigActuals && entry.cache.get(key) === fn) entry.cache.delete(key);
    throw e;
  }
  fn.frameInit = fb.makeInit();
  const rw = collectRW(fn.body);
  // outer: the lowest level of an enclosing frame whose variables it (or a subprogram it calls) uses
  walk(fn.body, x => {
    const up = x.k === 'loc' ? x.up : (x.k === 'call' || x.k === 'task') && x.fn?.outer < fn.level ? x.fn.outer : null;
    if (up != null && !(fn.outer <= up)) fn.outer = up;
  });
  fn.impure = rw.reads.size > 0 || rw.writes.size > 0 || fn.outer != null || containsKind(fn.body, ['delay', 'event', 'wait', 'sys', 'fork', 'waitfork']);
  return fn;
}
