// Silinx HLS (#1528): the C simulation: a C source's main() (its test bench) run by an interpreter of Silinx HLS, as Vitis
// HLS's "C simulation" runs it compiled: printf's output, main()'s return value, and each call of the top function
// with its arguments and results (what C/RTL co-simulation replays on the generated HDL, core/c-cosim.js).
// Isomorphic ES module: no DOM and no Node APIs.
//
//   simulateC(source, { file, maxSteps, entry = 'main' }) ->
//     { ok, output, exitCode, calls, error, steps, top, diagnostics }
//     calls: [{ args: { name: BigInt }, ptrIn: { name: BigInt }, ptrOut: { name: BigInt }, memIn: { name: [BigInt] },
//              memOut: { name: [BigInt] }, ret: BigInt | null, steps }]: each call of the top function: the scalar arguments,
//              each pointer's value before (ptrIn) and after (ptrOut), each array's values before and after (#1527), the
//              steps it took (#1899)
//     error: { line, col, message } when the run stopped (a division by zero, an index outside an array, an endless loop)
import { checkC, constValue } from './c-check.js';
import { typeOf } from './c-types.js';
import { exprMethods, convert } from './c-interp-expr.js';
import { libMethods, Exit } from './c-interp-lib.js';
import { taskMethods } from './c-interp-task.js';

export const MAX_STEPS = 20_000_000;

class Halt extends Error { constructor(loc, message) { super(message); this.loc = loc; } }
class Return { constructor(value) { this.value = value; } }
const BREAK = Symbol('break'), CONTINUE = Symbol('continue');

// (files: the test bench's data files, { path: text }, read by fopen; its run's written files in the result's files, #1598)
export function simulateC(source, { file = 'input.c', maxSteps = MAX_STEPS, entry = 'main', headers = null, top = null, files = null } = {}) {
  const checked = checkC(source, file, { headers, top });
  // (a test bench with no function to synthesize still runs)
  const errors = checked.diagnostics.filter((d) => d.severity === 'error' && !/^no function to synthesize/.test(d.message));
  if (errors.length) return { ok: false, output: '', exitCode: null, calls: [], error: null, steps: 0, top: checked.top, diagnostics: checked.diagnostics };
  const m = new Machine(checked, maxSteps);
  m.files = files || headers || {};
  const r = m.run(entry);
  return { ...r, top: checked.top, diagnostics: checked.diagnostics, files: Object.fromEntries(m.fs) };
}

/** An array parameter's dimensions (two or more: int a[3][4], int a[][4]), its first from n, the elements given; else
 *  null (#1786). */
function dimsOf(t, n) {
  const inner = [];
  for (let at = t.kind === 'ptr' || t.kind === 'array' ? (t.kind === 'ptr' ? t.to : t.of) : null; at?.kind === 'array'; at = at.of) inner.push(Number(at.length ?? 0));
  if (!inner.length || inner.some((d) => !d)) return null;
  const stride = inner.reduce((a, b) => a * b, 1);
  return [Math.floor(n / stride), ...inner];
}

/** A function run at synthesis (#1779, core/c-const-init.js): fn called with new arrays of the declarations decls, their
 *  values after it (BigInt, or numbers for floats), or null when it cannot run. */
export function runAtSynthesis(checked, fn, decls, maxSteps = 5_000_000) {
  const m = new Machine(checked, maxSteps);
  m.files = {};
  try {
    for (const it of checked.ast.items) if (it.kind === 'var') m.globals.set(it.name, m.cell(it));
    const args = decls.map((d) => { const c = m.cell({ ...d, init: null, static: false }); return { arr: c.arr, t: c.t }; });
    m.invoke(fn, args);
    return args.map((a) => a.arr.map((c) => c.v));
  } catch (e) {
    if (e instanceof Halt || e instanceof Exit) return null;
    throw e;
  }
}

class Machine {
  constructor(checked, maxSteps) {
    this.c = checked;
    this.maxSteps = maxSteps;
    this.steps = 0;
    this.out = [];
    this.calls = [];
    this.frames = [];
    this.globals = new Map();
    this.fs = new Map();
    // (stdio's streams: stdout and stderr in the output, stdin empty)
    for (const [n, std] of [['stdout', 'out'], ['stderr', 'out'], ['stdin', 'in']]) this.globals.set(n, { isFile: true, fh: std === 'in' ? { name: 'stdin', text: '', pos: 0, w: false } : { std }, t: { w: 32, s: true } });
  }
  tick(n) { if (++this.steps > this.maxSteps) throw new Halt(n?.loc, `the C simulation stopped after ${this.maxSteps.toLocaleString('en')} steps (an endless loop?)`); }
  fail(n, message) { throw new Halt(n?.loc, message); }
  find(name) {
    const f = this.frames.at(-1);
    if (f) for (let k = f.scopes.length - 1; k >= 0; k--) if (f.scopes[k].has(name)) return f.scopes[k].get(name);
    return this.globals.get(name) || null;
  }
  lookup(name, n) {
    const c = this.find(name);
    if (!c) this.fail(n, `'${name}' is not declared`);
    return c;
  }
  /** A new variable (a cell { t, v }, an array { t, arr: [cells] }, a pointer { t, ref }) from its declaration. */
  cell(v, scope) {
    const t = v.type;
    if (t.kind === 'array') {
      // (an array of arrays: its cells in one list, its dimensions kept; a[i] of one is a view of its row)
      const dims = [];
      let at = t;
      // (a size known when it runs: a test bench's, #1734)
      for (; at.kind === 'array'; at = at.of) dims.push(at.length ?? (at.size ? Number(this.intOf(this.eval(at.size), v)) : at === t && v.init?.kind === 'init' ? v.init.items.length : 0));
      const et = typeOf(at);
      if (!et) this.fail(v, `'${v.name}': only arrays of numbers can be simulated`);
      const n = dims.reduce((a, b) => a * b, 1);
      const arr = Array.from({ length: n }, () => ({ v: et.fl ? 0 : 0n }));
      const flat = [];
      const walk = (x) => { if (x?.kind === 'init') x.items.forEach(walk); else flat.push(x); };
      if (v.init?.kind === 'init') walk(v.init);
      flat.forEach((x, k) => { if (k < n && x) arr[k].v = this.as(this.eval(x), et, x); });
      if (v.init?.kind === 'str') [...v.init.value].forEach((ch, k) => { if (k < n) arr[k].v = BigInt(ch.charCodeAt(0)); });
      return { t: et, arr, dims };
    }
    if (t.kind === 'stream') {
      const et = typeOf(t.of);
      if (!et) this.fail(v, `'${v.name}': a stream of integers`);
      const fifo = { q: [], name: v.name, t: et, log: null };
      (this.fifos ||= []).push(fifo);   // (each one: a task's invocation undoes its reads and writes, #1721)
      return { t: et, fifo };
    }
    if (t.kind === 'ptr' && t.to.kind === 'struct' && t.to.name === 'FILE') return { isFile: true, fh: v.init ? this.eval(v.init).fh ?? null : null, t: { w: 32, s: true } };
    if (t.kind === 'ptr') {
      const c = { t: typeOf(t.to), ref: null };
      if (v.init) { const p = this.eval(v.init); c.ref = p.ptr || (p.arr ? this.elemRef(p.arr, 0, p.t) : null); }
      return c;
    }
    const et = typeOf(t);
    if (!et) this.fail(v, `'${v.name}' is not a number: it cannot be simulated`);
    return { t: et, v: v.init ? this.as(this.eval(v.init), et, v.init) : et.fl ? 0 : 0n };
  }
  elemRef(arr, index, t) {
    const cell = arr[index];
    return { get: () => ({ v: cell.v, t }), set: (x) => { cell.v = this.as(x, t); }, t, arr, index };
  }

  run(entry) {
    const { ast, funcs } = this.c;
    try {
      for (const it of ast.items) if (it.kind === 'var') this.globals.set(it.name, this.cell(it));
      const fn = funcs.get(entry);
      if (!fn?.body) return { ok: false, output: '', exitCode: null, calls: [], error: { line: 1, col: 1, message: `no ${entry}() to run: the C simulation runs the test bench, main()` }, steps: 0 };
      const r = this.invoke(fn, []);
      return { ok: true, output: this.out.join(''), exitCode: r ? Number(convert(r.v ?? 0n, { w: 32, s: true })) : 0, calls: this.calls, error: null, steps: this.steps };
    } catch (e) {
      if (e instanceof Exit) return { ok: true, output: this.out.join(''), exitCode: e.code, calls: this.calls, error: null, steps: this.steps };
      if (!(e instanceof Halt)) throw e;
      return { ok: false, output: this.out.join(''), exitCode: null, calls: this.calls, error: { line: e.loc?.line || 1, col: e.loc?.col || 1, message: e.message }, steps: this.steps };
    }
  }
  /** A call: its arguments (values; pointers and arrays by reference), its body run; the top function's recorded. */
  call(e) {
    if (e.callee.kind === 'member') return this.member(e);
    const name = e.callee.name;
    const fn = this.c.funcs.get(name);
    if (!fn) return this.library(name, e);
    if (!fn.body) this.fail(e, `'${name}' is declared but not defined`);
    const args = this.callArgs(fn, e);
    const isTop = name === this.c.top && this.frames.length && this.frames.at(-1).fn.name !== name;
    let rec = null;
    if (isTop) {
      rec = { args: {}, ptrIn: {}, ptrOut: {}, memIn: {}, memOut: {}, streamIn: {}, streamOut: {}, streamRead: {}, ret: null };
      fn.params.forEach((pa, k) => {
        const a = args[k];
        // (a stream: its values before the call, those the call reads and writes, #1590)
        if (a.fifo) { rec.streamIn[pa.name] = a.fifo.q.map((c) => c); a.fifo.log = { reads: 0, writes: [] }; return; }
        if (a.arr) rec.memIn[pa.name] = a.arr.map((c) => c.v);
        if (a.ptr) rec.ptrIn[pa.name] = a.ptr.get().v;
        else if (!a.arr) rec.args[pa.name] = this.as(a, typeOf(pa.type), e);
      });
    }
    const s0 = this.steps;
    const r = this.invoke(fn, args, e);
    // (the top's tasks run with it: what they read and write in its call, #1721)
    if (isTop) this.runTasks();
    if (rec) {
      // (the call's steps: the co-simulation's bound on its cycles, #1899)
      rec.steps = this.steps - s0;
      fn.params.forEach((pa, k) => {
        if (args[k].ptr) rec.ptrOut[pa.name] = args[k].ptr.get().v;
        if (args[k].arr) rec.memOut[pa.name] = args[k].arr.map((c) => c.v);
        if (args[k].fifo) { rec.streamRead[pa.name] = args[k].fifo.log.reads; rec.streamOut[pa.name] = args[k].fifo.log.writes; args[k].fifo.log = null; }
      });
      rec.ret = r?.v ?? null;
      this.calls.push(rec);
    }
    return r ?? { v: 0n, t: { w: 32, s: true } };
  }
  /** A call's arguments: values; pointers, arrays and streams by reference. */
  callArgs(fn, e) {
    return e.args.map((a, k) => {
      const pt = fn.params[k]?.type;
      const x = this.eval(a);
      // (a stream, or a reference to one: a function declared before its definition, #1721)
      if (pt?.kind === 'stream' || (pt?.kind === 'ptr' && pt.to.kind === 'stream')) { if (!x.fifo) this.fail(a, `the argument of '${fn.params[k].name}' must be a stream`); return x; }
      if (pt?.kind === 'ptr' || pt?.kind === 'array') {
        if (x.arr) return { arr: x.arr, t: x.t };
        if (x.ptr) return { ptr: x.ptr, t: x.t };
        this.fail(a, `the argument of '${fn.params[k].name}' must be a pointer or an array`);
      }
      return x;
    });
  }
  invoke(fn, args, at) {
    if (this.frames.length > 200) this.fail(at, 'the calls go too deep (recursion?)');
    const scope = new Map();
    this.bind(scope, fn, args, at);
    this.frames.push({ fn, scopes: [scope] });
    try {
      const r = this.items(fn.body.items);
      if (r instanceof Return) return r.value && fn.ret.kind !== 'void' ? { v: this.as(r.value, typeOf(fn.ret), r.at), t: typeOf(fn.ret) } : null;
      return null;
    } finally { this.frames.pop(); }
  }
  /** A function's parameters in its scope. */
  bind(scope, fn, args, at) {
    fn.params.forEach((pa, k) => {
      const a = args[k];
      if (!a) return;
      if (a.fifo) scope.set(pa.name, { t: a.t, fifo: a.fifo });
      else if (a.arr) scope.set(pa.name, { t: a.t, arr: a.arr, ...(dimsOf(pa.type, a.arr.length) ? { dims: dimsOf(pa.type, a.arr.length) } : {}) });
      else if (a.ptr) scope.set(pa.name, { t: a.t, ref: a.ptr });
      else { const t = typeOf(pa.type); scope.set(pa.name, { t, v: this.as(a, t, at) }); }
    });
  }
  /** A list of statements run (an hls::task's call started as a task, #1721): undefined, or a Return, BREAK, CONTINUE. */
  items(list) {
    for (let k = 0; k < list.length; k++) {
      const x = list[k];
      if (x.kind === 'pragma' && x.pragma.name === 'TASK' && list[k + 1]?.kind === 'expr') { this.spawn(list[++k]); continue; }
      const r = this.stmt(x);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  // ------------------------------------------------------------------ statements: undefined, a Return, BREAK, CONTINUE
  stmt(s) {
    if (!s) return undefined;
    this.tick(s);
    const f = this.frames.at(-1);
    switch (s.kind) {
      case 'block': {
        f.scopes.push(new Map());
        try { return this.items(s.items); } finally { f.scopes.pop(); }
        return undefined;
      }
      case 'decl':
        for (const v of s.vars) {
          if (v.static) {
            const key = `${f.fn.name}:${v.name}:${v.loc.line}:${v.loc.col}`;
            (this.statics ||= new Map());
            if (!this.statics.has(key)) this.statics.set(key, this.cell(v));
            f.scopes.at(-1).set(v.name, this.statics.get(key));
          } else f.scopes.at(-1).set(v.name, this.cell(v));
        }
        return undefined;
      case 'expr': this.eval(s.e); return undefined;
      case 'if': return this.truth(this.eval(s.cond)) ? this.stmt(s.then) : this.stmt(s.else);
      case 'return': { const r = new Return(s.e ? this.eval(s.e) : null); r.at = s; return r; }
      case 'break': return BREAK;
      case 'continue': return CONTINUE;
      case 'for': case 'while': case 'do': return this.loop(s);
      case 'switch': return this.switchStmt(s);
      case 'pragma': case 'empty': case 'case': case 'default': return undefined;
      case 'label': return this.stmt(s.stmt);   // (#1601)
      default: this.fail(s, `'${s.kind}' cannot be simulated`);
    }
    return undefined;
  }
  loop(s) {
    const f = this.frames.at(-1);
    f.scopes.push(new Map());
    try {
      if (s.kind === 'for' && s.init) this.stmt(s.init);
      for (let first = true; ; first = false) {
        if ((s.kind !== 'do' || !first) && s.cond && !this.truth(this.eval(s.cond))) break;
        const r = this.stmt(s.body);
        if (r === BREAK) break;
        if (r instanceof Return) return r;
        if (s.kind === 'for' && s.step) this.eval(s.step);
        if (s.kind === 'do' && !this.truth(this.eval(s.cond))) break;
        if (s.kind === 'do') first = true;   // (its condition just tested)
      }
    } finally { f.scopes.pop(); }
    return undefined;
  }
  switchStmt(s) {
    const v = this.intOf(this.eval(s.e), s);
    const body = s.body.kind === 'block' ? s.body.items : [s.body];
    const consts = new Map();
    let start = body.findIndex((x) => x.kind === 'case' && constValue(x.value, consts) === v);
    if (start < 0) start = body.findIndex((x) => x.kind === 'default');
    if (start < 0) return undefined;
    const f = this.frames.at(-1);
    f.scopes.push(new Map());
    try {
      for (let k = start; k < body.length; k++) {
        const r = this.stmt(body[k]);
        if (r === BREAK) return undefined;
        if (r !== undefined) return r;
      }
    } finally { f.scopes.pop(); }
    return undefined;
  }
}
Object.assign(Machine.prototype, exprMethods, libMethods, taskMethods);
Machine.prototype.CONTINUE = CONTINUE;   // (a task's loop body continued: an iteration done, core/c-interp-task.js)
