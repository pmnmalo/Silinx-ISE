// Silinx HLS (#1526): a sequential C function as a finite state machine with a datapath (FSMD). The function's code is
// cut into basic blocks (what runs with no jump: its ifs and switches with no loop in them included), one state of the
// machine each, run in one clock cycle; its loops, the ifs with a loop in them, break, continue and return choose
// the next state. Its variables are registers (a static or a global keeping its value between calls); a block is run
// symbolically (core/c-dataflow.js) on the registers' values, giving their next values and the next state.
// The block protocol is Vitis HLS's ap_ctrl_hs: in the idle state the arguments are read when ap_start is 1; the
// last state of a call has ap_done and ap_ready 1, ap_return valid; a pointer output's _ap_vld is 1 one cycle after
// each write, its value then valid. With ap_ctrl_none (a function with a stream) the machine starts its next call
// when one is done, as if ap_start were 1 (#1900). Isomorphic ES module: no DOM and no Node APIs.
//
//   fsmd(checked) -> { graph, regs, states, entry, idle, done, ports, outputs, diagnostics }
//     regs:    [{ name, w, s, reset: BigInt, latch?: node id (its value read at the start of a call) }]
//     states:  [{ id, name, updates: Map reg -> node, next: node, line? }] (the blocks; idle and done apart)
//     outputs: Map port -> { reg } (a register shown on the port)
import { Flow, Stop } from './c-dataflow.js';
import { hdlName } from './c-graph.js';
import { BOOL, typeOf } from './c-types.js';
import { memMethods, MEM_MIN } from './c-mem.js';
import { fifoMethods } from './c-fifo.js';
import { loopPragma, unrollBy } from './c-pragma.js';
import { inlineCalls } from './c-inline.js';

export function fsmd(checked) {
  return new SeqFlow(checked).runSeq();
}

const hasLoop = (n) => {
  let hit = false;
  const w = (x) => {
    if (!x || typeof x !== 'object' || hit) return;
    if (Array.isArray(x)) { x.forEach(w); return; }
    if (x.kind === 'for' || x.kind === 'while' || x.kind === 'do') { hit = true; return; }
    for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') w(v);
  };
  w(n);
  return hit;
};
/** The line of the first statement of a list (inside its blocks, its pragmas apart), or null. */
const hasContinue = (n) => {
  let hit = false;
  const w = (x) => {
    if (!x || typeof x !== 'object' || hit) return;
    if (Array.isArray(x)) { x.forEach(w); return; }
    if (x.kind === 'continue') { hit = true; return; }
    if (x.kind === 'for' || x.kind === 'while' || x.kind === 'do') return;   // (its own)
    for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') w(v);
  };
  w(n);
  return hit;
};
const firstLine = (stmts) => {
  for (const s of stmts) {
    if (s.kind === 'pragma' || s.kind === 'empty') continue;
    if (s.kind === 'block') { const l = firstLine(s.items); if (l) return l; continue; }
    return s.loc?.line ?? null;
  }
  return null;
};
// (a deep copy keeping BigInt values: not core/util.js's clone, #1580)
const cloneBig = (x) => JSON.parse(JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? { $big: String(v) } : v)), (k, v) => (v && typeof v === 'object' && '$big' in v ? BigInt(v.$big) : v));

class SeqFlow extends Flow {
  // ------------------------------------------------------------------ the registers: every variable a unique name
  /** The top function's body with each local variable renamed to a name of its own (the registers'), and the list of
   *  its declarations. */
  renameLocals(fn) {
    const body = cloneBig(fn.body);
    const used = new Set([...fn.params.map((p) => p.name), ...this.c.funcs.keys(), ...this.globals.keys()]);
    const decls = [];
    const scopes = [new Map()];
    const look = (n) => { for (let k = scopes.length - 1; k >= 0; k--) if (scopes[k].has(n)) return scopes[k].get(n); return null; };
    const fresh = (n) => { let x = n, k = 1; while (used.has(x)) x = `${n}_${++k}`; used.add(x); return x; };
    const walk = (x) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if (x.kind === 'block') { scopes.push(new Map()); x.items.forEach(walk); scopes.pop(); return; }
      if (x.kind === 'for') { scopes.push(new Map()); walk(x.init); walk(x.cond); walk(x.step); walk(x.body); scopes.pop(); return; }
      if (x.kind === 'decl') {
        for (const v of x.vars) { if (v.init) walk(v.init); const u = fresh(v.name); scopes.at(-1).set(v.name, u); v.orig = v.name; v.name = u; decls.push(v); }
        return;
      }
      if (x.kind === 'id') { const u = look(x.name); if (u) x.name = u; return; }
      for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') walk(v);
    };
    walk(body);
    return { body, decls };
  }

  // ------------------------------------------------------------------ the blocks
  /** The control flow graph of a statement list: blocks { id, stmts, term, loop } (term: { goto } | { cond, t, f } |
   *  { done }), from `entry` to `next`. */
  cfg(items, next, loop) {
    const blocks = this.blocks;
    const mk = (lp) => { const b = { id: blocks.length + 1, stmts: [], term: null, loop: lp }; blocks.push(b); return b; };
    const seq = (list, after, lp) => {
      let cur = mk(lp);
      const entry = cur;
      for (let s of list) {
        // (a labelled statement: the statement, its label the loop's name in the report, #1601)
        let label = null;
        while (s?.kind === 'label') { label = s.name; s = s.stmt; }
        if (label && (s.kind === 'for' || s.kind === 'while' || s.kind === 'do')) s = { ...s, label };
        const mem = this.hasMem(s);
        if (!hasLoop(s) && !mem) { cur.stmts.push(s); continue; }
        // (a memory's accesses: their states, #1527)
        if (!hasLoop(s) && ['expr', 'decl', 'return'].includes(s.kind)) { cur = this.lowerMem(s, cur, mk, lp); continue; }
        if (s.kind === 'block') {
          const join = mk(lp);
          const e = seq(s.items, join, lp);
          cur.term = { goto: e };
          cur = join;
          continue;
        }
        if (s.kind === 'if') {
          const c = this.hoistCond(s.cond, cur, mk, lp);
          cur = c.cur;
          const join = mk(lp);
          const t = seq([s.then], join, lp);
          const f = s.else ? seq([s.else], join, lp) : join;
          cur.term = { cond: c.e, t, f };
          cur = join;
          continue;
        }
        if (s.kind === 'for' || s.kind === 'while' || s.kind === 'do') {
          // the loop's pragmas (#1529): UNROLL (whole: its iterations in the state it is in; factor=N: N an
          // iteration), PIPELINE (an iteration a state)
          const info = this.loopInfo(s);
          const un = loopPragma(s, 'UNROLL'), pp = loopPragma(s, 'PIPELINE');
          if (un) {
            const n = un.factor !== undefined ? Number(un.factor) : Infinity;
            const why = this.hasMem(s) ? 'it accesses a memory: an access a state' : hasLoop(s.body) ? 'a loop is in it' : null;
            if (n >= (info.trip ?? Infinity)) {
              if (info.trip === null) this.warn(s.loc, '#pragma HLS UNROLL: this loop\'s count is not a constant: it is not unrolled (give a factor=)');
              else if (why) this.warn(s.loc, `#pragma HLS UNROLL: this loop is not unrolled: ${why}`);
              else { cur.stmts.push({ ...s, unroll: true }); info.unroll = 'whole'; info.states = 0; continue; }
            } else if (n > 1) {
              const bad = s.kind === 'do' ? 'a do-while' : hasContinue(s.body) ? "a 'continue' is in it" : hasLoop(s.body) ? 'a loop is in it' : null;
              if (bad) this.warn(s.loc, `#pragma HLS UNROLL factor=${n}: this loop is not unrolled: ${bad}`);
              else { s = unrollBy(s, n); info.unroll = n; }
            }
          }
          if (pp && !pp.off) {
            info.pipeline = Number(pp.ii ?? 1);
            const bad = this.hasMem(s) ? 'it accesses a memory, an access a state' : hasLoop(s.body) ? 'a loop is in it' : hasContinue(s.body) ? "a 'continue' is in it" : s.kind === 'do' ? 'a do-while' : null;
            if (!bad) {
              // one state an iteration: if its condition holds, the body and the step; else out
              if (s.kind === 'for' && s.init) { if (this.hasMem(s.init)) cur = this.lowerMem(s.init, cur, mk, lp); else cur.stmts.push(s.init); }
              const exit = mk(lp);
              const L = { exit, cont: null };
              const it = mk(L);
              L.cont = it;
              const then = { kind: 'block', items: [s.body, ...(s.kind === 'for' && s.step ? [{ kind: 'expr', e: s.step, loc: s.loc }] : [])], loc: s.loc };
              it.stmts.push(s.cond ? { kind: 'if', cond: s.cond, then, else: { kind: 'break', loc: s.loc }, loc: s.loc } : then);
              it.term = { goto: it };
              cur.term = { goto: it };
              info.blocks = [it];
              cur = exit;
              continue;
            }
            info.notPipelined = bad;
          }
          const before = blocks.length;
          const exit = mk(lp);
          const head = mk(lp);
          const step = s.kind === 'for' && s.step ? mk(lp) : null;
          const contTo = s.kind === 'do' ? head : (step || head);
          const L = { exit, cont: contTo };
          const body = seq([s.body], s.kind === 'do' ? head : (step || head), L);
          if (s.kind === 'for' && s.init) { if (this.hasMem(s.init)) cur = this.lowerMem(s.init, cur, mk, lp); else cur.stmts.push(s.init); }
          cur.term = { goto: s.kind === 'do' ? body : head };
          const hc = s.cond ? this.hoistCond(s.cond, head, mk, lp) : { e: null, cur: head };
          hc.cur.term = hc.e ? { cond: hc.e, t: body, f: exit, loopHead: s } : { goto: body };
          if (s.kind === 'do') head.loopHead = s;
          if (step) {
            const se = { kind: 'expr', e: s.step, loc: s.loc };
            const last = this.hasMem(se) ? this.lowerMem(se, step, mk, lp) : (step.stmts.push(se), step);
            last.term = { goto: head };
          }
          info.blocks = blocks.slice(before + 1);
          cur = exit;
          continue;
        }
        this.error(s.loc, hasLoop(s) ? `a '${s.kind}' with a loop in it is not supported yet in a sequential module` : `a '${s.kind}' that accesses a memory is not supported yet in a sequential module (write the access as a statement of its own before it)`);
      }
      cur.term = after ? { goto: after } : { done: true };
      return entry;
    };
    return seq(items, next, loop);
  }

  // ------------------------------------------------------------------ the module
  runSeq() {
    const { top, funcs, ast } = this.c;
    const fn = funcs.get(top);
    this.fn = fn;
    this.ctrl = 'ap_ctrl_hs';
    this.modes = new Map();
    this.globals = new Map();
    for (const it of ast.items) if (it.kind === 'var') this.globals.set(it.name, it);
    for (const st of fn.body.items) {
      if (st.kind !== 'pragma' || st.pragma.name !== 'INTERFACE') continue;
      const a = st.pragma.args;
      const mode = String(a.mode || Object.keys(a).find((k) => /^ap_/.test(k)) || '').toLowerCase();
      // (ap_ctrl_none: running by itself, its calls one after the other, when it has a stream to be fed through, as
      // Vitis HLS co-simulates it, #1900; else its block protocol is made)
      if (a.port === 'return' && mode === 'ap_ctrl_none') {
        if (fn.params.some((pa) => pa.type.kind === 'stream')) this.ctrl = 'ap_ctrl_none';
        else this.warn(st.loc, 'ap_ctrl_none: this function is sequential, it needs its block protocol: ap_ctrl_hs is made');
      }
      else if (a.port && a.port !== 'return') this.modes.set(a.port, mode);
    }
    this.retType = fn.ret.kind === 'void' ? null : typeOf(fn.ret);
    this.regs = new Map();
    this.blocks = [];
    try {
      // (the calls of a function with a loop, or given an array: inlined, its loops the top's, #1632)
      const inl = { ...fn, body: inlineCalls(fn, funcs, (loc, m) => this.error(loc, m)) };
      this.fn = inl;
      const { body, decls } = this.renameLocals(inl);
      this.makeRegisters(inl, decls);
      this.entry = this.cfg(body.items, null, null);
      this.thread();
      this.runBlocks();
      this.loops = this.loopsDone();
    } catch (e) { if (!(e instanceof Stop)) throw e; }
    return this.result();
  }
  calls(fn, name) {
    let hit = false;
    const w = (x) => { if (!x || typeof x !== 'object' || hit) return; if (Array.isArray(x)) { x.forEach(w); return; } if (x.kind === 'call' && x.callee?.name === name) hit = true; for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') w(v); };
    w(fn.body);
    return hit;
  }
  /** A register of `name` (w bits, s signed; reset its value at the reset; latch the node it takes at a call's
   *  start). */
  reg(name, t, reset = 0n, latch = null) {
    if (!this.regs.has(name)) this.regs.set(name, { name, w: t.w, s: !!t.s, t, reset: BigInt(reset), latch });
    return this.regs.get(name);
  }
  regNode(r) { return this.g.add('reg', [], r.t, { port: { key: `reg:${r.name}`, name: `ap_r_${hdlName(r.name)}` } }); }
  makeRegisters(fn, decls) {
    this.slots = new Map();
    // ARRAY_PARTITION complete (#1529): the array's elements registers, whatever its size
    this.partitioned = new Set();
    const walkP = (x) => { if (!x || typeof x !== 'object') return; if (Array.isArray(x)) { x.forEach(walkP); return; } if (x.kind === 'pragma' && x.pragma.name === 'ARRAY_PARTITION' && x.pragma.args.variable) { const a = x.pragma.args; if (!a.type || String(a.type).toLowerCase() === 'complete' || a.complete) this.partitioned.add(a.variable); } for (const [k, y] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && k !== 'pragma') walkP(y); };
    walkP(fn.body);
    for (const pa of fn.params) if (this.partitioned.has(pa.name)) this.warn(pa.loc, `#pragma HLS ARRAY_PARTITION of the argument '${pa.name}' is not made yet: it is ap_memory`);
    // the arguments: read at the start of a call (latched), a pointer's value its register
    for (const pa of fn.params) {
      const t = pa.type;
      if (t.kind === 'ptr' && t.to.kind === 'array') this.error(pa.loc, `the argument '${pa.name}': a pointer to an array is not supported: write it as an array, ${pa.name}[N]`);
      if (t.kind === 'array') { this.slots.set(pa.name, this.memSlot({ ...pa, const: !!t.of.const }, { ext: true })); continue; }
      if (t.kind === 'stream') { this.slots.set(pa.name, this.fifoSlot(pa)); continue; }   // (ap_fifo, #1590)
      if (t.kind === 'ptr') {
        const et = typeOf(t.to);
        if (!et) this.error(pa.loc, `the argument '${pa.name}' is not an integer pointer`);
        const r = this.reg(`${pa.name}_reg`, et);
        const out = { name: pa.name, t: et, reg: r, val: null, vld: this.F, read: false, written: false, loc: pa.loc };
        this.outs.set(pa.name, out);
        this.slots.set(pa.name, { kind: 'out', out });
        continue;
      }
      const et = typeOf(t);
      if (!et) this.error(pa.loc, `the argument '${pa.name}' is not an integer`);
      const r = this.reg(`${pa.name}_reg`, et, 0n, this.input(pa.name, et).id);
      this.slots.set(pa.name, { kind: 'var', t: et, reg: r, name: pa.name });
    }
    // the locals (statics: their initial value at the reset), the globals written
    for (const v of decls) this.slots.set(v.name, this.regSlot(v));
    for (const [name, gv] of this.globals) {
      if (!gv.const) this.slots.set(name, this.regSlot({ ...gv, static: true }));
      else if (gv.type.kind === 'array' && this.arrayLength(gv) > MEM_MIN && !this.partitioned.has(name)) this.slots.set(name, this.memSlot(gv));   // (a ROM)
    }
    // the statics of the functions the top calls (#1618): a register each, all the calls of a function sharing it
    this.calleeStatics = new Map();
    for (const f of this.called(fn)) {
      const own = new Map();
      const walk = (x) => {
        if (!x || typeof x !== 'object') return;
        if (Array.isArray(x)) { x.forEach(walk); return; }
        if (x.kind === 'decl') for (const v of x.vars) if (v.static) {
          let name = `${f.name}_${v.name}`;
          while (this.regs.has(name) || this.regs.has(`${name}_0`)) name += '_s';
          const slot = this.regSlot({ ...v, name });
          if (slot.kind === 'mem') this.error(v.loc, `the static array '${v.name}' of '${f.name}': a memory in a function the top calls is not supported yet`);
          this.slots.set(`${f.name}::${v.name}`, slot);
          own.set(v.name, slot);
        }
        for (const [k, y] of Object.entries(x)) if (k !== 'loc' && k !== 'type') walk(y);
      };
      walk(f.body);
      if (own.size) this.calleeStatics.set(f.name, own);
    }
    if (this.retType) this.retReg = this.reg('ap_return_reg', this.retType);
  }
  /** The functions fn calls, directly or through others. */
  called(fn) {
    const out = new Set();
    const visit = (f) => { for (const g of this.c.funcs.values()) if (g !== fn && g.body && !out.has(g) && this.calls(f, g.name)) { out.add(g); visit(g); } };
    visit(fn);
    return out;
  }
  inline(fn, scope, g) {
    for (const [n, slot] of this.calleeStatics?.get(fn.name) || []) scope.set(n, slot);
    return super.inline(fn, scope, g);
  }
  regSlot(v) {
    const t = v.type;
    const parted = this.partitioned?.has(v.orig ?? v.name);
    const init = (e, et) => (e ? this.constOf(e, et) : 0n);
    if (t.kind === 'array') {
      if (this.arrayLength(v) > MEM_MIN && !parted) return this.memSlot(v);
      const et = typeOf(t.of);
      if (!et) this.error(v.loc, `'${v.name}': only arrays of integers (one dimension) are supported yet`);
      const n = t.length ?? (v.init?.kind === 'init' ? v.init.items.length : null);
      if (!n) this.error(v.loc, `'${v.name}': an array needs its size`);
      const regs = Array.from({ length: n }, (_, k) => this.reg(`${v.name}_${k}`, et, v.static && v.init?.kind === 'init' ? (init(v.init.items[k], et) ?? 0n) : 0n));
      if (v.static && v.init?.kind === 'init' && v.init.items.some((x) => this.constOf(x, et) === null)) this.error(v.loc, `the static '${v.name}': its initial values must be constants`);
      return { kind: 'array', t: et, regs, elems: null, name: v.name };
    }
    const et = typeOf(t);
    if (!et) this.error(v.loc, `'${v.name}' is not an integer`);
    let reset = 0n;
    if (v.static && v.init) { reset = init(v.init, et); if (reset === null) this.error(v.loc, `the static '${v.name}': its initial value must be a constant`); }
    return { kind: 'var', t: et, reg: this.reg(v.name, et, reset), name: v.name, static: !!v.static };
  }
  arrayLength(v) { return Number(v.type.length ?? (v.init?.kind === 'init' ? v.init.items.length : 0)); }
  /** A goto-only block with no statement is skipped (its predecessors go where it goes). */
  thread() {
    const target = (b) => { const seen = new Set(); while (b && !b.stmts.length && b.term?.goto && !seen.has(b)) { seen.add(b); b = b.term.goto; } return b; };
    for (const b of this.blocks) {
      if (b.term?.goto) b.term.goto = target(b.term.goto);
      if (b.term?.cond) { b.term.t = target(b.term.t); b.term.f = target(b.term.f); }
      if (b.loop) b.loop = { exit: target(b.loop.exit), cont: target(b.loop.cont) };
    }
    this.entry = target(this.entry);
    // the blocks reached, numbered from 1 (0: idle; the last: done)
    const reached = [], seen = new Set();
    const visit = (b) => {
      if (!b || seen.has(b)) return;
      seen.add(b); reached.push(b);
      if (b.term?.goto) visit(b.term.goto);
      if (b.term?.cond) { visit(b.term.t); visit(b.term.f); }
      if (b.loop) { visit(b.loop.exit); visit(b.loop.cont); }
    };
    visit(this.entry);
    reached.forEach((b, k) => { b.num = k + 1; });
    this.reached = reached;
    this.doneNum = reached.length + 1;
    this.stateT = { w: Math.max(1, (this.doneNum).toString(2).length), s: false };
  }
  // ------------------------------------------------------------------ each block, symbolically
  declare(v, g) {
    // (a local of a function the top calls, run inside a state: a value, as a combinational function's; its statics
    // registers, put in its scope by inline, #1618)
    if (this.frame && this.frame.fn !== this.fn) { if (!v.static) this.scopes.at(-1).set(v.name, this.newSlot(v, g)); return; }
    const slot = this.slots.get(v.name);
    if (!v.init || v.static || slot.kind === 'mem') return;   // (a static is initialized once, at the reset; a memory holds its values)
    if (slot.kind === 'array') {
      if (v.init.kind !== 'init') this.error(v.loc, `'${v.name}': an array is initialized with { … }`);
      v.init.items.forEach((x, k) => { if (k < slot.elems.length) slot.elems[k] = this.mux(g, this.conv(this.expr(x, g), slot.t).id, slot.elems[k], slot.t); });
      return;
    }
    slot.val = this.mux(g, this.conv(this.expr(v.init, g), slot.t).id, slot.val, slot.t);
  }
  loop(s, base) { if (s.unroll) return super.loop(s, base); this.error(s.loc, 'internal: a loop inside a block'); return undefined; }
  /** The record of a loop for the report: its line, its count (checkC's), what its pragmas made. */
  loopInfo(s) {
    const c = this.c.loops.find((l) => l.loc.line === s.loc.line && l.loc.col === s.loc.col) || { trip: null, max: null };
    const info = { line: s.loc.line, name: s.label || null, trip: c.trip, max: c.max, unroll: null, pipeline: null, blocks: [], loc: s.loc };
    (this.loopReport ||= []).push(info);
    return info;
  }
  /** The loops' report, once the states are numbered: the states an iteration (II), the cycles of the loop. */
  loopsDone() {
    return (this.loopReport || []).map((l) => {
      const ii = l.unroll === 'whole' ? 0 : l.blocks.filter((b) => b.num).length;
      if (l.pipeline && l.notPipelined) this.warn(l.loc, `#pragma HLS PIPELINE II=${l.pipeline}: II=${ii} made (${l.notPipelined})`);
      else if (l.pipeline && ii > l.pipeline) this.warn(l.loc, `#pragma HLS PIPELINE II=${l.pipeline}: II=${ii} made`);
      const n = l.trip ?? l.max;
      return { line: l.line, ...(l.name ? { name: l.name } : {}), trip: l.trip, max: l.max, unroll: l.unroll, pipeline: l.pipeline, ii, cycles: n === null ? null : l.unroll === 'whole' ? 0 : Math.ceil(n / (typeof l.unroll === 'number' ? l.unroll : 1)) * ii + 1 };
    });
  }
  stmt(s, base) { return s && /^mem(read|write|latch)$/.test(s.kind) ? this.memStmt(s, base) : s && /^fifo(read|write)$/.test(s.kind) ? this.fifoStmt(s, base) : super.stmt(s, base); }
  runBlocks() {
    const st = (n) => this.g.const(n, this.stateT);
    this.states = [];
    for (const b of this.reached) {
      // every register at its current value
      for (const slot of this.slots.values()) {
        if (slot.kind === 'var') slot.val = this.regNode(slot.reg);
        if (slot.kind === 'array') slot.elems = slot.regs.map((r) => this.regNode(r));
        if (slot.kind === 'out') { slot.out.val = this.regNode(slot.out.reg); slot.out.vld = this.F; }
      }
      const loopRec = b.loop ? { brk: this.F, cont: this.F } : null;
      this.frame = { fn: this.fn, returned: this.F, ret: this.retReg ? this.regNode(this.retReg) : null, rt: this.retType, loops: loopRec ? [loopRec] : [] };
      this.scopes = [this.slots];
      this.access = new Map();
      this.fifoAcc = new Map();
      this.stall = this.F;
      for (const s of b.stmts) this.stmt(s, this.T);
      // the next state: after a return, done; a break, its loop's exit; a continue, its loop's next iteration; else
      // the block's own end
      let next;
      if (b.term.done) next = st(this.doneNum);
      else if (b.term.goto) next = st(b.term.goto.num);
      else {
        const c = this.bool(this.expr(b.term.cond, this.guard(this.T)));
        next = this.mux(c, st(b.term.t.num), st(b.term.f.num), this.stateT);
      }
      if (loopRec) {
        next = this.mux(loopRec.cont, st(b.loop.cont.num), next, this.stateT);
        next = this.mux(loopRec.brk, st(b.loop.exit.num), next, this.stateT);
      }
      next = this.mux(this.frame.returned, st(this.doneNum), next, this.stateT);
      // (a stream's access waits: the state again while its FIFO is empty or full)
      if (this.stall !== this.F) next = this.mux(this.stall, st(b.num), next, this.stateT);
      const updates = new Map();
      for (const slot of this.slots.values()) {
        if (slot.kind === 'var' && slot.val !== this.regNode(slot.reg)) updates.set(slot.reg.name, slot.val);
        if (slot.kind === 'array') slot.regs.forEach((r, k) => { if (slot.elems[k] !== this.regNode(r)) updates.set(r.name, slot.elems[k]); });
        if (slot.kind === 'out') {
          const o = slot.out;
          if (o.val !== this.regNode(o.reg)) updates.set(o.reg.name, o.val);
          if (o.vld !== this.F) { updates.set(`${o.name}_vld_reg`, o.vld); this.reg(`${o.name}_vld_reg`, BOOL); }
        }
      }
      if (this.retReg && this.frame.ret !== this.regNode(this.retReg)) updates.set(this.retReg.name, this.frame.ret);
      this.states.push({ id: b.num, updates, next, line: firstLine(b.stmts), access: this.access, fifo: this.fifoAcc });
    }
    this.mems = this.memPorts(this.states);
    this.fifos = this.fifoPorts(this.states);
  }
  // the outputs read before they are written: a pointer read and written takes its input at the start of a call
  readOut(o) {
    o.read = true;
    if (!o.latched) {
      o.latched = true;
      const key = `${o.name}#in`;
      this.inputs.set(key, { name: key, t: o.t, port: { key, name: o.name }, id: null });
      const i = this.inputs.get(key);
      i.id = this.g.add('in', [], o.t, { port: i.port });
      o.reg.latch = i.id;
    }
    return this.v(o.val, o.t);
  }
  storeDeref(slot, val, g, l) {
    const r = super.storeDeref(slot, val, g, l);
    return r;
  }
  result() {
    const ports = [], outputs = new Map();
    // a struct argument written (#1628): one port of its members (core/c-aggregate.js), each read at the start of a
    // call and given back, its value the call's whenever one of them is written
    for (const a of this.c.ast.structArgs?.get(this.fn.name) || []) {
      const os = a.stream || a.name === 'return' ? [] : a.members.map((m) => this.outs.get(m)).filter(Boolean);
      if (os.some((o) => o.written)) for (const o of os) { this.readOut(o); o.written = true; }
    }
    for (const pa of this.fn.params) {
      const o = this.outs.get(pa.name);
      const fifo = this.fifos?.find((x) => x.name === pa.name);
      if (fifo) {
        // ap_fifo: read, _dout _empty_n _read; written, _din _full_n _write
        if (!fifo.used) continue;
        const p = (sfx, dir, w, node) => { ports.push({ name: `${pa.name}${sfx}`, dir, w, s: false, role: 'fifo', param: pa.name }); if (node != null) outputs.set(`${pa.name}${sfx}`, { node }); };
        if (fifo.dir === 'in') { p('_dout', 'in', fifo.t.w, null); p('_empty_n', 'in', 1, null); p('_read', 'out', 1, fifo.go); }
        else { p('_din', 'out', fifo.t.w, fifo.d); p('_full_n', 'in', 1, null); p('_write', 'out', 1, fifo.go); }
        continue;
      }
      const mem = this.mems?.find((x) => x.ext && x.name === pa.name);
      if (mem) {
        // ap_memory: the address and its enable, the write's enable and data, the value read
        const p = (sfx, dir, w, node) => { ports.push({ name: `${pa.name}${sfx}`, dir, w, s: false, role: 'mem', param: pa.name }); if (node != null) outputs.set(`${pa.name}${sfx}`, { node }); };
        p('_address0', 'out', mem.aw, mem.addr);
        p('_ce0', 'out', 1, mem.ce);
        if (mem.written) { p('_we0', 'out', 1, mem.we); p('_d0', 'out', mem.t.w, mem.d); }
        if (mem.read) p('_q0', 'in', mem.t.w, null);
        continue;
      }
      if (!o) {
        const i = this.inputs.get(pa.name);
        if (i) ports.push({ name: pa.name, dir: 'in', w: i.t.w, s: i.t.s, role: 'arg', param: pa.name });
        continue;
      }
      const mode = this.modes.get(pa.name) || '';
      if (o.read && !o.written) { ports.push({ name: pa.name, dir: 'in', w: o.t.w, s: o.t.s, role: 'arg', param: pa.name }); continue; }
      if (!o.written) continue;
      const base = o.read ? `${pa.name}_o` : pa.name;
      if (o.read) { Object.assign(this.inputs.get(`${pa.name}#in`).port, { name: `${pa.name}_i`, param: pa.name, suffix: '_i' }); ports.push({ name: `${pa.name}_i`, dir: 'in', w: o.t.w, s: o.t.s, role: 'arg', param: pa.name }); }
      ports.push({ name: base, dir: 'out', w: o.t.w, s: o.t.s, role: 'arg', param: pa.name });
      outputs.set(base, { reg: o.reg.name });
      if (mode !== 'ap_none') {
        ports.push({ name: `${base}_ap_vld`, dir: 'out', w: 1, s: false, role: 'arg_vld', param: pa.name });
        outputs.set(`${base}_ap_vld`, { reg: `${pa.name}_vld_reg` });
        this.reg(`${pa.name}_vld_reg`, BOOL);
      }
    }
    if (this.retReg) { ports.push({ name: 'ap_return', dir: 'out', w: this.retType.w, s: this.retType.s, role: 'return' }); outputs.set('ap_return', { reg: this.retReg.name }); }
    return {
      graph: this.g, regs: [...(this.regs?.values() || [])], states: this.states || [], entry: this.entry?.num ?? 1, idle: 0, done: this.doneNum ?? 1,
      stateT: this.stateT, ports, outputs, ctrl: this.ctrl ?? 'ap_ctrl_hs', diagnostics: this.diags, mems: (this.mems || []).filter((x) => !x.ext),
      loops: this.loops || [], blocks: this.reached || [], fifos: (this.fifos || []).filter((x) => x.used).map((x) => ({ name: x.name, dir: x.dir, w: x.t.w, s: x.t.s, ...(x.polled ? { polled: true } : {}) })), extMems: (this.mems || []).filter((x) => x.ext).map((x) => ({ name: x.name, n: x.n, w: x.t.w, s: x.t.s, aw: x.aw, read: x.read, written: x.written })),
    };
  }
}
Object.assign(SeqFlow.prototype, memMethods, fifoMethods);
