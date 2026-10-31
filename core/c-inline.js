// Silinx HLS (#1632): the calls a sequential top function makes of a function with a loop, or that pass it an array,
// inlined into the top's body before its state machine is made (core/c-fsmd.js), so the callee's loops are the
// top's and its arrays the arguments' (a memory too). Its by-value parameters are local variables given the
// arguments; its pointer, reference and array parameters are the arguments themselves; its returns assign the call's
// value (an early one through a flag: the rest of the body runs while it is not set); its statics one variable per
// function, shared by every call (a register of the top, initialized at the reset). A call inside an expression is
// made before it, its value in a variable. Isomorphic ES module.
//
// A call of a sub-module (#1960, core/c-submodule.js) is not inlined: a statement of its own, 'subcall' (its value in a
// variable, its by-value arguments names or constants).
//
//   inlineCalls(fn, funcs, report, sub) -> fn's body, inlined (sub(f, recursive): whether a call of f is a sub-module's)

import { inlineMode } from './c-submodule.js';

const walk = (x, f) => {
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach((y) => walk(y, f)); return; }
  if (f(x) === false) return;
  for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && v && typeof v === 'object') walk(v, f);
};
const has = (x, p) => { let hit = false; walk(x, (n) => { if (hit) return false; if (p(n)) { hit = true; return false; } return undefined; }); return hit; };
const isLoop = (n) => n.kind === 'for' || n.kind === 'while' || n.kind === 'do';
// (a deep copy keeping BigInt values, as core/c-fsmd.js's)
const cloneBig = (x) => JSON.parse(JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? { $big: String(v) } : v)), (k, v) => (v && typeof v === 'object' && '$big' in v ? BigInt(v.$big) : v));
/** A copy of x with each node f maps replaced (f(n) undefined: n kept, its children mapped). */
const map = (x, f) => {
  if (!x || typeof x !== 'object') return x;
  if (Array.isArray(x)) return x.map((y) => map(y, f));
  const r = f(x);
  if (r !== undefined) return r;
  const out = {};
  for (const [k, v] of Object.entries(x)) out[k] = k === 'loc' || k === 'type' ? v : map(v, f);
  return out;
};

export function inlineCalls(fn, funcs, report, sub = () => false) {
  // (#pragma HLS INLINE recursive of the function being inlined, or the top's: the functions it calls too, #1960)
  let recursive = inlineMode(fn) === 'recursive';
  const isSub = (f) => sub(f, recursive);
  // which functions are inlined: a loop in them (or in one they call), or an array among their parameters, or a sub-module
  // called in them
  const memo = new Map();
  const needs = (f, seen = new Set()) => {
    const key = `${f.name} ${recursive}`;
    if (memo.has(key)) return memo.get(key);
    if (seen.has(f.name)) return false;
    seen.add(f.name);
    const r = !!f.body && (isSub(f) || has(f.body, isLoop) || f.params.some((p) => p.type.kind === 'array')
      || has(f.body, (n) => n.kind === 'call' && n.callee.kind === 'id' && funcs.get(n.callee.name) && (funcs.get(n.callee.name).blackbox || needs(funcs.get(n.callee.name), seen))));
    memo.set(key, r);
    return r;
  };
  // (math.h's fmod of constants: folded, core/c-dataflow-float.js, #2144)
  const folded = (e, f) => f?.library && e.args.every((a) => !has(a, (n) => n.kind === 'id' || n.kind === 'call'));
  const inlined = (e) => e?.kind === 'call' && e.callee.kind === 'id' && funcs.get(e.callee.name)?.body && funcs.get(e.callee.name) !== fn && !folded(e, funcs.get(e.callee.name)) && needs(funcs.get(e.callee.name));
  let fresh = 0;
  const statics = new Map();   // function -> Map(name -> its variable's name)
  const hoisted = [];          // the statics' declarations, first in the top's body
  const L = (loc) => loc || fn.loc;
  const id = (name, loc) => ({ kind: 'id', name, loc: L(loc) });

  /** A statement list with its inlined calls: each statement's calls first. */
  const stmts = (items) => items.flatMap((s) => stmt(s));
  function stmt(s) {
    if (!s || typeof s !== 'object') return [s];
    switch (s.kind) {
      case 'block': return [{ ...s, items: stmts(s.items) }];
      case 'if': {
        const pre = [];
        const cond = calls(s.cond, pre, s);
        return [...pre, { ...s, cond, then: one(s.then), else: s.else ? one(s.else) : s.else }];
      }
      case 'for': case 'while': case 'do':
        for (const part of [s.init, s.cond, s.step]) if (part && has(part, inlined)) report(s.loc, `'${firstCall(part)}' is called in a loop's ${part === s.cond ? 'condition' : 'header'}: call it in the loop's body`);
        return [{ ...s, init: s.init && s.init.kind === 'decl' ? s.init : s.init, body: one(s.body) }];
      case 'switch': return [{ ...s, body: one(s.body) }];
      case 'label': return [{ ...s, stmt: one(s.stmt) }];
      case 'expr': {
        // f(…); with its value unused
        if (inlined(s.e)) return expand(s.e, null, s);
        const pre = [];
        const e = calls(s.e, pre, s);
        return [...pre, { ...s, e }];
      }
      case 'decl': {
        const out = [];
        for (const v of s.vars) {
          if (v.static || !v.init || !has(v.init, inlined)) { out.push({ ...s, vars: [v] }); continue; }
          const init = calls(v.init, out, s);
          out.push({ ...s, vars: [{ ...v, init }] });
        }
        return out;
      }
      case 'return': {
        if (!s.e || !has(s.e, inlined)) return [s];
        const pre = [];
        const e = calls(s.e, pre, s);
        return [...pre, { ...s, e }];
      }
      default: return [s];
    }
  }
  const one = (s) => { const r = stmt(s); return r.length === 1 ? r[0] : { kind: 'block', items: r, loc: s.loc }; };
  const firstCall = (x) => { let n = null; walk(x, (y) => { if (!n && inlined(y)) { n = y.callee.name; return false; } return undefined; }); return n; };

  /** An expression with its inlined calls made before it (into pre), each one's value a variable. */
  function calls(e, pre, s) {
    return map(e, (n) => {
      if ((n.kind === 'binary' && (n.op === '&&' || n.op === '||') && has(n.r, inlined)) || (n.kind === 'cond' && (has(n.a, inlined) || has(n.b, inlined)))) {
        report(n.loc, `'${firstCall(n)}' is called where it may not run (after && / || / ?:): call it as a statement of its own`);
        return n;
      }
      if (!inlined(n)) return undefined;
      const f = funcs.get(n.callee.name);
      if (f.ret.kind === 'void') { report(n.loc, `'${f.name}' returns nothing: its call is a statement`); return n; }
      const tmp = `ap_call_${fresh++}`;
      pre.push({ kind: 'decl', vars: [{ kind: 'var', name: tmp, type: f.ret, init: null, loc: n.loc }], loc: n.loc });
      pre.push(...expand({ ...n, args: n.args.map((a) => calls(a, pre, s)) }, tmp, s));
      return id(tmp, n.loc);
    });
  }

  /** A call made here: its body, its parameters bound, its value into `into` (a variable's name) if it gives one. */
  function expand(call, into, s, depth = 0) {
    const f = funcs.get(call.callee.name);
    if (depth > 32) { report(call.loc, `'${f.name}': calls inlined too deep`); return []; }
    if (call.args.length !== f.params.length) { report(call.loc, `'${f.name}' takes ${f.params.length} argument(s), not ${call.args.length}`); return []; }
    if (isSub(f)) return subCall(call, f, into);
    const k = fresh++;
    const items = [];
    const alias = new Map();   // a parameter -> the expression it stands for (a pointer's: what it points to)
    f.params.forEach((pa, i) => {
      const a = call.args[i];
      const t = pa.type;
      if (t.kind === 'array') {
        if (a.kind !== 'id') report(a.loc, `the argument of '${pa.name}' in the call of '${f.name}': an array (its name)`);
        alias.set(pa.name, { arr: a });
        return;
      }
      if (t.kind === 'ptr' || t.kind === 'stream') {
        // (&x: x; a pointer passed on: what it points to)
        const target = a.kind === 'unary' && a.op === '&' ? a.e : a.kind === 'id' ? { kind: 'unary', op: '*', e: a, loc: a.loc } : null;
        if (!target || t.kind === 'stream') { if (t.kind === 'stream') alias.set(pa.name, { arr: a }); else report(a.loc, `the argument of '${pa.name}' in the call of '${f.name}': a variable's address (&x) or a pointer`); return; }
        alias.set(pa.name, { ptr: target, arg: a });
        return;
      }
      const name = `${pa.name}_i${k}`;
      items.push({ kind: 'decl', vars: [{ kind: 'var', name, type: t, init: a, loc: a.loc }], loc: a.loc });
      alias.set(pa.name, { val: name });
    });
    // its statics: one per function, shared
    if (!statics.has(f.name)) {
      const own = new Map();
      walk(f.body, (n) => {
        if (n.kind !== 'decl') return undefined;
        for (const v of n.vars) if (v.static) {
          const name = `${f.name}_${v.name}`;
          own.set(v.name, name);
          hoisted.push({ kind: 'decl', vars: [{ ...v, name }], loc: n.loc });
        }
        return undefined;
      });
      statics.set(f.name, own);
    }
    const own = statics.get(f.name);
    // the body: its names bound (a local shadowing a parameter: its own), its statics dropped, its returns
    // (its locals: names of their own, so none hides a variable of the caller's an argument names, #1637)
    const locals = new Map();
    walk(f.body, (n) => { if (n.kind === 'decl') for (const v of n.vars) if (!v.static) locals.set(v.name, `${v.name}_l${k}`); return undefined; });
    const body = bind(cloneBig(f.body), alias, own, locals);
    // (the library's: its place the call's, its loop in the report at that line)
    if (f.library) walk(body, (n) => { if (n.loc) n.loc = call.loc; if (isLoop(n)) n.library = true; return undefined; });
    const ret = f.ret.kind === 'void' ? null : into;
    const lowered = returns(body.items, ret, k, f);
    if (lowered.flag) items.push({ kind: 'decl', vars: [{ kind: 'var', name: lowered.flag, type: { kind: 'int', name: 'bool', bits: 1, signed: false }, init: { kind: 'num', value: 0n, text: '0', loc: call.loc }, loc: call.loc }], loc: call.loc });
    const outer = recursive;
    if (inlineMode(f) === 'recursive') recursive = true;
    items.push(...stmts(lowered.items).flatMap((x) => (x.kind === 'expr' && inlined(x.e) ? expand(x.e, null, s, depth + 1) : [x])));
    recursive = outer;
    return [{ kind: 'block', items, loc: call.loc }];
  }

  /** A call of a sub-module: its by-value arguments in variables first (their reads of memories their own states), then
   *  its statement, the state that starts it and waits. */
  function subCall(call, f, into) {
    const items = [];
    const args = call.args.map((a, i) => {
      const t = f.params[i].type;
      if (t.kind === 'array' || t.kind === 'ptr' || t.kind === 'stream' || a.kind === 'id' || a.kind === 'num') return a;
      const name = `ap_arg_${fresh++}`;
      items.push({ kind: 'decl', vars: [{ kind: 'var', name, type: t, init: a, loc: a.loc }], loc: a.loc });
      return id(name, a.loc);
    });
    return [...items, { kind: 'subcall', callee: f.name, args, into: into && f.ret.kind !== 'void' ? id(into, call.loc) : null, loc: call.loc }];
  }

  /** The callee's body with its parameters bound and its statics renamed. */
  function bind(body, alias, own, locals) {
    const mapped = map(body, (n) => {
      if (n.kind === 'decl') {
        const vars = n.vars.filter((v) => !v.static).map((v) => ({ ...v, name: locals.get(v.name) ?? v.name, init: v.init && bind(v.init, alias, own, locals) }));
        return vars.length ? { ...n, vars } : { kind: 'empty', loc: n.loc };
      }
      // (a local named as a parameter hides it)
      const param = (x) => x.kind === 'id' && !locals.has(x.name) && alias.get(x.name);
      if (n.kind === 'unary' && n.op === '*' && param(n.e)?.ptr) return cloneBig(alias.get(n.e.name).ptr);
      if (n.kind === 'index' && param(n.e)?.ptr) return { ...n, e: cloneBig(alias.get(n.e.name).arg), i: bind(n.i, alias, own, locals) };
      if (n.kind !== 'id') return undefined;
      if (locals.has(n.name)) return { ...n, name: locals.get(n.name) };
      if (own.has(n.name)) return { ...n, name: own.get(n.name) };
      const a = alias.get(n.name);
      if (!a) return undefined;
      if (a.val) return { ...n, name: a.val };
      if (a.arr) return cloneBig(a.arr);
      // (a pointer passed on as it is: the argument)
      return cloneBig(a.arg);
    });
    return mapped;
  }

  /** A body's returns: its value assigned; one that is not last through a flag (the rest runs while it is 0). */
  function returns(items, into, k, f) {
    const flag = `ap_ret_${k}`;
    let used = false;
    const set = (e, loc) => [...(into && e ? [{ kind: 'expr', e: { kind: 'assign', op: '=', l: id(into, loc), r: e, loc }, loc }] : [])];
    const lower = (list, inLoop, last) => {
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const s = list[i];
        const tail = last && i === list.length - 1;
        if (!has(s, (n) => n.kind === 'return')) { out.push(s); continue; }
        if (s.kind === 'return') {
          out.push(...set(s.e, s.loc));
          if (!tail || inLoop) { used = true; out.push(...flagSet(s.loc), ...(inLoop ? [{ kind: 'break', loc: s.loc }] : [])); }
          return out;
        }
        out.push(one2(s, inLoop, tail));
        const rest = list.slice(i + 1);
        if (rest.length) {
          used = true;
          out.push({ kind: 'if', cond: { kind: 'unary', op: '!', e: id(flag, s.loc), loc: s.loc }, then: { kind: 'block', items: lower(rest, inLoop, last), loc: s.loc }, else: null, loc: s.loc });
        }
        return out;
      }
      return out;
    };
    const flagSet = (loc) => [{ kind: 'expr', e: { kind: 'assign', op: '=', l: id(flag, loc), r: { kind: 'num', value: 1n, text: '1', loc }, loc }, loc }];
    const one2 = (s, inLoop, tail) => {
      switch (s.kind) {
        case 'block': return { ...s, items: lower(s.items, inLoop, tail) };
        case 'if': return { ...s, then: wrap(lower([s.then], inLoop, tail)), else: s.else ? wrap(lower([s.else], inLoop, tail)) : null };
        case 'label': return { ...s, stmt: wrap(lower([s.stmt], inLoop, tail)) };
        case 'for': case 'while': case 'do': {
          used = true;
          const loop = { ...s, body: wrap(lower([s.body], true, false)) };
          // (a loop inside a loop: the outer one left too)
          return inLoop ? { kind: 'block', items: [loop, { kind: 'if', cond: id(flag, s.loc), then: { kind: 'break', loc: s.loc }, else: null, loc: s.loc }], loc: s.loc } : loop;
        }
        default: report(s.loc, `a return inside a '${s.kind}' of '${f.name}', which is inlined: not supported yet`); return s;
      }
    };
    const wrap = (list) => (list.length === 1 ? list[0] : { kind: 'block', items: list, loc: list[0]?.loc });
    const out = lower(items, false, true);
    return { items: out, flag: used ? flag : null };
  }

  const body = { ...fn.body, items: stmts(fn.body.items) };
  return { ...body, items: [...hoisted, ...body.items] };
}
