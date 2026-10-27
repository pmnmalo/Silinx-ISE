// Silinx HLS (#1525): a combinational C function as a graph (core/c-graph.js), by running it symbolically: each value
// a node of the graph; the loops (constant bounds) unrolled; an 'if' a multiplexer of what its branches assign; a
// 'return', 'break' or 'continue' a condition under which the statements after it do nothing; the functions called
// inlined. Isomorphic ES module: no DOM and no Node APIs.
//
//   dataflow(checked) -> { graph, ports, returnType, ret, outputs, ctrl, diagnostics }
//     checked: core/c-check.js checkC()'s result, with no error
//     ports:   [{ name, dir: 'in' | 'out', w, s, role: 'arg' | 'arg_vld' | 'return', param? }] in the order of
//              Vitis HLS (the arguments in order, then ap_return); the graph's 'in' nodes name their port
//     outputs: Map port name -> node id (the outputs' values, ap_return and the _ap_vld flags included)
//     ctrl:    'ap_ctrl_hs' | 'ap_ctrl_none' (#pragma HLS INTERFACE … port=return)
// What is not combinational (a loop whose count depends on the inputs, a static or global variable written,
// division by a value other than a constant power of 2) is reported: the sequential modules are #1526's.
import { Graph } from './c-graph.js';
import { BOOL, INT, typeOf, promote, binaryType, compareType, shiftType, unaryType, literalType, wrap } from './c-types.js';
import { constValue } from './c-check.js';

const MAX_UNROLL = 65536;   // iterations unrolled in all, at most
export const NOT_COMB = '(a sequential module: not supported yet, #1526)';

export class Stop extends Error {}

export function dataflow(checked) {
  const f = new Flow(checked);
  const r = f.run();
  if (!f.rerun?.size) return r;
  // (a pointer read after a write under a condition: an input from the start, #1604)
  const again = new Flow(checked);
  again.preRead = f.rerun;
  return again.run();
}

export class Flow {
  constructor(checked) {
    this.c = checked;
    this.g = new Graph();
    this.diags = [];
    this.unrolled = 0;
    this.T = this.g.const(1, BOOL);
    this.F = this.g.const(0, BOOL);
    this.inputs = new Map();   // port key -> { name, t, id }
    this.outs = new Map();     // param name -> { t, val, vld, read }
  }
  file() { return this.c.ast.file; }
  error(loc, message) { this.diags.push({ file: this.file(), line: loc?.line || 1, col: loc?.col || 1, message, severity: 'error' }); throw new Stop(); }
  warn(loc, message) { this.diags.push({ file: this.file(), line: loc?.line || 1, col: loc?.col || 1, message, severity: 'warning' }); }

  // ------------------------------------------------------------------ values: { id, t }
  v(id, t) { return { id, t }; }
  // (to bool: 0 or 1, as C converts: any value other than 0 is 1, #1528)
  conv(x, t) {
    if (t.fx || x.t?.fx || x.fconst !== undefined) return this.fxConv(x, t);   // (ap_fixed, core/c-dataflow-fixed.js)
    return t.bool ? this.v(this.bool(x), t) : this.v(this.g.add('ext', [x.id], t), t);
  }
  bool(x) {
    if (x.t.w === 1 && !x.t.s) return x.id;
    return this.g.add('ne', [x.id, this.g.const(0, x.t)], BOOL);
  }
  and(a, b) { return this.g.add('and', [a, b], BOOL); }
  or(a, b) { return this.g.add('or', [a, b], BOOL); }
  not(a) { return this.g.add('not', [a], BOOL); }
  mux(c, a, b, t) { return this.g.add('mux', [c, a, b], t); }

  // ------------------------------------------------------------------ the top function
  run() {
    const { ast, top, funcs } = this.c;
    const fn = funcs.get(top);
    this.ctrl = 'ap_ctrl_hs';
    this.modes = new Map();
    for (const st of fn.body.items) {
      if (st.kind !== 'pragma' || st.pragma.name !== 'INTERFACE') continue;
      const a = st.pragma.args;
      const mode = String(a.mode || Object.keys(a).find((k) => /^ap_/.test(k)) || '').toLowerCase();
      if (a.port === 'return') { if (mode === 'ap_ctrl_none' || mode === 'ap_ctrl_hs') this.ctrl = mode; else this.warn(st.loc, `#pragma HLS INTERFACE ${mode} port=return is not supported yet: ap_ctrl_hs is made`); }
      else if (a.port) this.modes.set(a.port, mode);
    }
    for (const it of ast.items) {
      if (it.kind === 'var' && !it.const) {
        let used = false;
        const w = (n) => { if (!n || typeof n !== 'object' || used) return; if (Array.isArray(n)) { n.forEach(w); return; } if (n.kind === 'id' && n.name === it.name) used = true; for (const [k, x] of Object.entries(n)) if (k !== 'loc' && k !== 'type') w(x); };
        for (const f of funcs.values()) if (f.name !== 'main') w(f.body);
        if (used) { this.diags.push({ file: this.file(), line: it.loc.line, col: it.loc.col, message: `the global variable '${it.name}' keeps a value between calls ${NOT_COMB}`, severity: 'error' }); }
      }
    }
    this.globals = new Map();
    for (const it of ast.items) if (it.kind === 'var' && it.const) this.globals.set(it.name, it);
    this.retType = fn.ret.kind === 'void' ? null : typeOf(fn.ret);
    if (this.diags.some((d) => d.severity === 'error')) return this.finish(fn);
    try {
      const scope = new Map();
      for (const pa of fn.params) scope.set(pa.name, this.topParam(pa));
      this.scopes = [];
      this.ret = this.inline(fn, scope, this.T);
    } catch (e) { if (!(e instanceof Stop)) throw e; }
    return this.finish(fn);
  }
  topParam(pa) {
    const t = pa.type;
    if (t.kind === 'stream') this.error(pa.loc, `the stream '${pa.name}' is a FIFO outside the module (ap_fifo): its accesses take clock cycles (#1526)`);
    if (t.kind === 'array' || (t.kind === 'ptr' && t.to.kind === 'array')) this.error(pa.loc, `the array argument '${pa.name}' is a memory outside the module (ap_memory): its accesses take clock cycles (#1526)`);
    if (t.kind === 'ptr') {
      const et = typeOf(t.to);
      if (!et) this.error(pa.loc, `the argument '${pa.name}' is not an integer pointer`);
      const out = { name: pa.name, t: et, val: null, vld: this.F, read: false, written: false, loc: pa.loc };
      this.outs.set(pa.name, out);
      if (this.preRead?.has(pa.name)) this.readOut(out);
      return { kind: 'out', out };
    }
    const et = typeOf(t);
    if (!et) this.error(pa.loc, `the argument '${pa.name}' is not an integer`);
    return { kind: 'var', t: et, val: this.input(pa.name, et).id };
  }
  input(name, t) {
    if (!this.inputs.has(name)) this.inputs.set(name, { name, t, port: { key: name, name }, id: null });
    const i = this.inputs.get(name);
    if (i.id === null) i.id = this.g.add('in', [], t, { port: i.port });
    return this.v(i.id, t);
  }

  /** The condition under which a statement reached when `base` holds runs: not after a return, a break or a
   *  continue of its loop. */
  guard(base) {
    let g = this.and(base, this.not(this.frame.returned));
    const l = this.frame.loops.at(-1);
    if (l) g = this.and(g, this.not(this.or(l.brk, l.cont)));
    return g;
  }
  lookup(name, loc) {
    for (let k = this.scopes.length - 1; k >= 0; k--) if (this.scopes[k].has(name)) return this.scopes[k].get(name);
    const gv = this.globals.get(name);
    if (gv) {
      const slot = this.declareGlobal(gv);
      return slot;
    }
    this.error(loc, `'${name}' is not declared`);
  }
  declareGlobal(gv) {
    if (!this.globalSlots) this.globalSlots = new Map();
    if (this.globalSlots.has(gv.name)) return this.globalSlots.get(gv.name);
    const slot = this.newSlot(gv, this.T);
    this.globalSlots.set(gv.name, slot);
    return slot;
  }
  newSlot(v, g) {
    const t = v.type;
    if (t.kind === 'array') {
      const et = typeOf(t.of);
      if (!et) this.error(v.loc, `'${v.name}': only arrays of integers (one dimension) are supported yet`);
      const n = t.length ?? (v.init?.kind === 'init' ? v.init.items.length : null);
      if (!n) this.error(v.loc, `'${v.name}': an array needs its size`);
      const zero = this.g.const(0, et);
      const elems = Array.from({ length: n }, () => zero);
      if (v.init?.kind === 'init') v.init.items.forEach((x, k) => { if (k < n) elems[k] = this.conv(this.expr(x, g), et).id; });
      return { kind: 'array', t: et, elems, name: v.name };
    }
    const et = typeOf(t);
    if (!et) this.error(v.loc, `'${v.name}' is not an integer`);
    const val = v.init ? this.conv(this.expr(v.init, g), et).id : this.g.const(0, et);
    return { kind: 'var', t: et, val, name: v.name };
  }

  // ------------------------------------------------------------------ statements
  /** A declaration run when g holds: a new variable (the sequential modules: an assignment of its register). */
  declare(v, g) {
    if (v.static) this.error(v.loc, `the static variable '${v.name}' keeps a value between calls ${NOT_COMB}`);
    this.scopes.at(-1).set(v.name, this.newSlot(v, g));
  }
  block(items, base) {
    this.scopes.push(new Map());
    try { for (const s of items) this.stmt(s, base); }
    finally { this.scopes.pop(); }
  }
  stmt(s, base) {
    if (!s) return;
    const g = this.guard(base);
    if (this.g.isConst(g) && !this.g.k(g) && s.kind !== 'decl') return;   // (never runs)
    switch (s.kind) {
      case 'block': return this.block(s.items, base);
      case 'decl': for (const v of s.vars) this.declare(v, g); return;
      case 'expr': this.expr(s.e, g); return;
      case 'if': {
        const c = this.bool(this.expr(s.cond, g));
        this.stmt(s.then, this.and(base, c));
        if (s.else) this.stmt(s.else, this.and(base, this.not(c)));
        return;
      }
      case 'return': {
        const f = this.frame;
        if (s.e) {
          const val = this.conv(this.expr(s.e, g), f.rt).id;
          f.ret = f.ret === null ? val : this.mux(g, val, f.ret, f.rt);
        }
        f.returned = this.or(f.returned, g);
        return;
      }
      case 'break': case 'continue': {
        const l = this.frame.loops.at(-1);
        if (!l) this.error(s.loc, `'${s.kind}' outside a loop or a switch`);
        if (s.kind === 'continue' && l.isSwitch) {
          // (a continue in a switch is its loop's)
          const outer = this.frame.loops.at(-2);
          if (!outer) this.error(s.loc, "'continue' outside a loop");
          outer.cont = this.or(outer.cont, g);
          l.brk = this.or(l.brk, g);
          return;
        }
        l[s.kind === 'break' ? 'brk' : 'cont'] = this.or(l[s.kind === 'break' ? 'brk' : 'cont'], g);
        return;
      }
      case 'for': case 'while': case 'do': return this.loop(s, base);
      case 'switch': return this.switchStmt(s, base);
      case 'pragma': case 'empty': return;
      case 'label': return this.stmt(s.stmt, base);   // (#1601)
      default: this.error(s.loc, `'${s.kind}' is not supported here`);
    }
  }
  loop(s, base) {
    this.scopes.push(new Map());
    const l = { brk: this.F, cont: this.F };
    try {
      if (s.kind === 'for' && s.init) this.stmt(s.init, base);
      let first = true;
      for (;;) {
        if (s.kind !== 'do' || !first) {
          const cond = s.kind === 'for' ? s.cond : s.cond;
          if (cond) {
            const c = this.bool(this.expr(cond, this.guard(base)));
            if (!this.g.isConst(c)) this.error(s.loc, `this loop runs a number of times that depends on the inputs ${NOT_COMB}`);
            if (!this.g.k(c)) break;
          }
        }
        first = false;
        if (++this.unrolled > MAX_UNROLL) this.error(s.loc, `more than ${MAX_UNROLL} loop iterations to unroll: too large for a combinational module`);
        this.frame.loops.push(l);
        l.cont = this.F;
        try { this.stmt(s.body, base); }
        finally { this.frame.loops.pop(); }
        const after = this.and(this.guard(base), this.not(l.brk));
        if (this.g.isConst(after) && !this.g.k(after)) break;   // (broken out of, or returned: the rest never runs)
        // (the step of a variable declared in the 'for' runs whatever the break: unseen after the loop, it keeps the
        // count constant, the loop unrolled; a variable declared before keeps its value at the break)
        if (s.kind === 'for' && s.step) this.expr(s.step, s.init?.kind === 'decl' ? this.guard(base) : after);
        if (s.kind === 'do') {
          const c = this.bool(this.expr(s.cond, after));
          if (!this.g.isConst(c)) this.error(s.loc, `this loop runs a number of times that depends on the inputs ${NOT_COMB}`);
          if (!this.g.k(c)) break;
          first = true;   // (the condition just tested)
          continue;
        }
        if (!this.g.isConst(l.brk) && !this.g.isConst(this.frame.returned)) { /* (the bound decides the end) */ }
      }
    } finally { this.scopes.pop(); }
  }
  switchStmt(s, base) {
    const e = this.expr(s.e, this.guard(base));
    const body = s.body.kind === 'block' ? s.body.items : [s.body];
    const values = body.filter((x) => x.kind === 'case').map((x) => constValue(x.value, this.consts()));
    const pt = promote(e.t);
    const ev = this.conv(e, pt);
    const eq = (v) => this.g.add('eq', [ev.id, this.g.const(v, pt)], BOOL);
    const any = values.reduce((acc, v) => this.or(acc, eq(v)), this.F);
    const l = { brk: this.F, cont: this.F, isSwitch: true };
    let entered = this.F;
    this.frame.loops.push(l);
    this.scopes.push(new Map());
    try {
      for (const x of body) {
        if (x.kind === 'case') { entered = this.or(entered, eq(constValue(x.value, this.consts()))); continue; }
        if (x.kind === 'default') { entered = this.or(entered, this.not(any)); continue; }
        this.stmt(x, this.and(base, entered));
      }
    } finally { this.frame.loops.pop(); this.scopes.pop(); }
    // (a continue inside the switch was handed to its loop)
  }
  consts() {
    const m = new Map();
    for (const [k, v] of this.globals) if (v.init && v.init.kind !== 'init') { const c = constValue(v.init, m); if (c !== null) m.set(k, c); }
    return m;
  }

  // ------------------------------------------------------------------ expressions (cf. c-dataflow-expr.js)
}

// the expressions are in a module of their own (core/c-dataflow-expr.js), mixed into Flow
import { exprMethods } from './c-dataflow-expr.js';
import { fixedMethods } from './c-dataflow-fixed.js';
import { divMethods } from './c-dataflow-div.js';
Object.assign(Flow.prototype, exprMethods, fixedMethods, divMethods);

// ---------------------------------------------------------------------- the ports
Flow.prototype.finish = function finish(fn) {
  const ports = [], outputs = new Map();
  const ctrl = this.ctrl;
  for (const pa of fn.params) {
    const o = this.outs.get(pa.name);
    if (!o) {
      const i = this.inputs.get(pa.name);
      if (i) ports.push({ name: pa.name, dir: 'in', w: i.t.w, s: i.t.s, role: 'arg', param: pa.name });
      continue;
    }
    // a pointer: read only (an input), written only (an output and its _ap_vld), both (_i / _o / _o_ap_vld)
    const mode = this.modes.get(pa.name) || '';
    if (o.read && !o.written) { this.inputs.get(`${pa.name}#in`).port.name = pa.name; ports.push({ name: pa.name, dir: 'in', w: o.t.w, s: o.t.s, role: 'arg', param: pa.name }); continue; }
    if (!o.written) continue;
    const base = o.read ? `${pa.name}_o` : pa.name;
    if (o.read) { Object.assign(this.inputs.get(`${pa.name}#in`).port, { name: `${pa.name}_i`, param: pa.name, suffix: '_i' }); ports.push({ name: `${pa.name}_i`, dir: 'in', w: o.t.w, s: o.t.s, role: 'arg', param: pa.name }); }
    const val = o.val ?? this.g.const(0, o.t);
    ports.push({ name: base, dir: 'out', w: o.t.w, s: o.t.s, role: 'arg', param: pa.name });
    outputs.set(base, val);
    if (mode !== 'ap_none') {
      ports.push({ name: `${base}_ap_vld`, dir: 'out', w: 1, s: false, role: 'arg_vld', param: pa.name });
      outputs.set(`${base}_ap_vld`, o.vld);
    }
  }
  if (this.retType && this.ret) {
    ports.push({ name: 'ap_return', dir: 'out', w: this.retType.w, s: this.retType.s, role: 'return' });
    outputs.set('ap_return', this.ret.id);
  }
  return { graph: this.g, ports, outputs, returnType: this.retType, ctrl, diagnostics: this.diags };
};
