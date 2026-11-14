// Silinx HLS (#1962): a loop or a function pipelined as Vitis HLS pipelines it: its iterations overlap, a new one every II
// cycles. Its body is run symbolically once (core/c-fsmd.js's blocks, their values chained), its operations then
// scheduled in stages, modulo the II: a memory's access in a stage where its port is free (one a cycle), the operations
// chained while they fit the clock, the values a later stage reads in pipeline registers, a stage's work enabled by its
// valid bit. The II is the one asked or the lowest that works: the ports, a variable's next value read by the next iteration
// (a dependence), a memory read after a write of another iteration, the exit known before the next iteration starts.
// A variable read before the previous iteration has written it is tried again written where its next value is made, its
// readers no earlier (a shift register's, from a memory, #2503).
// The whole is one state of the machine: it holds while the pipeline runs and leaves when it has drained; a function's is
// the machine's only state, a call starting whenever ap_start finds the first stage free (ap_ready), ap_done a call's end.
// Inner loops of constant count are unrolled in it, those with a memory's access as statements. An exit known late
// squashes the iterations started after it. The stages are cut by the clock, the II raised when a recurrence does not fit
// it (#2182). A loop's stream read or written once an iteration has its access in its stage, every stage held while it
// waits (#2182); another stream's access is not made here (core/c-pipeline.js's pipeMem). Isomorphic ES module: no DOM and no Node APIs.
//
//   pipelineSchedMethods: SeqFlow's (core/c-fsmd.js)
//     pipeFullWhy(s)                     why this loop or function body cannot be made so, or null
//     pipeFull(s, cur, mk, lp, info)     the loop's state after `cur`, its exit returned
//     pipeFunction(body, ii, loc)        the function's state; pipeState(b): a pipeline's state, run
//     markDependences(body)              DEPENDENCE's (#1961) on the loops they are in, and on those in those
//   moduloSchedule(body, ii)             the stages
import { balanceSums } from './c-balance.js';
import { bottomUp } from './c-graph.js';
import { BOOL } from './c-types.js';
import { nodeDelay } from './c-timing.js';
import { dependenceOf } from './c-pragma.js';

const walk = (x, f) => {
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach((y) => walk(y, f)); return; }
  if (f(x) === false) return;
  for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') walk(v, f);
};
const isLoop = (s) => s && (s.kind === 'for' || s.kind === 'while' || s.kind === 'do');
const extraOf = ({ id, op, args, w, s, ...extra }) => extra;
// (an access's memory, from its key: `a`, or `a#1` on its second port, each port an access a cycle of its own, #1901)
const memOf = (key) => key.replace(/#1$/, '');
// (the most the clock raises an II by, past which the iteration's path stays one long path, said in the report)
const MAX_RAISE = 64;

/**
 * The stages of a body, modulo ii; { fail: why } when the ii does not work.
 *   g: the graph; ops: its memories' accesses in the C's order, { mem, roots: [node], write, q: the node of its value };
 *   updates: [[register's node, value]] (a variable's next value); exit: the node saying the loop ends, or null;
 *   sameIndex(r, w): a read and a write that cannot meet across iterations; together: [[register's node, register's node]]
 *   written in one stage (a pointer output and its _ap_vld); budget, family: the clock's; dep(mem, 'inter' | 'intra', 'raw' | 'war'):
 *   whether a #pragma HLS DEPENDENCE says that dependence of the memory false (#1961); free: registers whose next value
 *   no other iteration reads (an array's at the loop's counter, #2182).
 * -> { stage: Map node -> stage, opStage: [stage], read: Map register's node -> its stage, written: Map -> its stage, depth }
 */
export function moduloSchedule({ g, ops, updates, exit, pinned = [], own = new Set(), free = new Set(), sameIndex = () => false, together = [], budget = Infinity, family = 'artix7', dep = () => false, floor = null }, ii) {
  const stage = new Map(), at = new Map();
  const ensure = (roots) => {
    for (const n of g.needed(roots)) {
      if (stage.has(n.id)) continue;
      if (!n.args.length) { stage.set(n.id, floor?.get(n.id) ?? -1); at.set(n.id, 0); continue; }   // (a constant, a register: where it is read; floor: not before)
      let s = -1, t = 0;
      for (const a of n.args) {
        const sa = stage.get(a), ta = at.get(a);
        if (sa > s || (sa === s && ta > t)) { s = sa; t = ta; }
      }
      if (s < 0) { s = 0; t = 0; }
      const d = nodeDelay(g, n, family);
      if (d > 0 && t > 0 && t + d > budget) { s++; t = 0; }
      stage.set(n.id, s);
      at.set(n.id, t + d);
    }
  };
  const ports = new Map(), last = new Map(), lastRead = new Map(), lastWrite = new Map(), opStage = [];
  for (const op of ops) {
    ensure(op.roots);
    let s = op.roots.reduce((m, r) => Math.max(m, stage.get(r)), 0);
    if (last.has(op.mem)) s = Math.max(s, last.get(op.mem) + 1);
    // (the other port's, in the C's order: a read after a write sees it, a write is not before a read, #1901)
    const m = memOf(op.mem);
    if (op.write && lastRead.has(m) && !dep(m, 'intra', 'war')) s = Math.max(s, lastRead.get(m));
    if (!op.write && lastWrite.has(m) && !dep(m, 'intra', 'raw')) s = Math.max(s, lastWrite.get(m) + 1);
    const used = ports.get(op.mem) || new Set();
    while (used.has(s % ii)) s++;
    used.add(s % ii);
    ports.set(op.mem, used);
    last.set(op.mem, s);
    (op.write ? lastWrite : lastRead).set(m, s);
    opStage.push(s);
    // (a memory's value the cycle after its read; a stream's, its dout, in the read's own stage)
    for (const q of [op.q, ...(op.alias || [])]) if (q != null) { stage.set(q, op.stream ? s : s + 1); at.set(q, 0); }
  }
  ensure([...updates.map((u) => u[1]), ...(exit != null ? [exit] : [])]);
  // (no clock: an operation as late as what uses it, a variable read where its new value is near: s = s * x + a[i])
  if (budget === Infinity) {
    const users = new Map(), cap = new Map();
    const all = g.needed([...ops.flatMap((op) => op.roots), ...updates.map((u) => u[1]), ...(exit != null ? [exit] : [])]);
    for (const n of all) for (const a of n.args) users.set(a, [...(users.get(a) || []), n.id]);
    ops.forEach((op, k) => { for (const r of op.roots) cap.set(r, Math.min(cap.get(r) ?? Infinity, opStage[k])); });
    for (const v of [...updates.map((u) => u[1]), ...(exit != null ? [exit] : [])]) cap.set(v, stage.get(v));
    for (const n of [...all].reverse()) {
      if (!n.args.length) continue;
      const late = (users.get(n.id) || []).reduce((m, u) => Math.min(m, stage.get(u)), cap.get(n.id) ?? Infinity);
      if (late !== Infinity && late > stage.get(n.id)) stage.set(n.id, late);
    }
  }
  // (a register is read where its first reader is, the value then handed on: a variable the next iteration reads by then)
  const read = new Map();
  const reader = (r, s) => { if (g.get(r).op === 'reg' && (!read.has(r) || read.get(r) > s)) read.set(r, s); };
  const roots = [...ops.flatMap((op) => op.roots), ...updates.map((u) => u[1]), ...(exit != null ? [exit] : [])];
  for (const n of g.needed(roots)) if (n.args.length) for (const a of n.args) reader(a, stage.get(n.id));
  ops.forEach((op, k) => { for (const r of op.roots) reader(r, opStage[k]); });
  if (!floor) for (const [, v] of updates) reader(v, 0);
  if (exit != null) reader(exit, 0);
  for (const r of pinned) read.set(r, 0);
  const written = new Map();
  if (!floor) for (const [r, v] of updates) written.set(r, Math.max(stage.get(v), read.get(r) ?? 0, 0));
  else {
    // (floor, a retry: a variable written where its next value is made and read there, its readers no earlier than the
    // floor says; a next value another variable's, a shift register's, where that one is written: its sources first; one
    // of a cycle of them, a swap, read first, #2503)
    const qs = new Set(ops.flatMap((op) => [op.q, ...(op.alias || [])]));   // (a read's value: a register's node too)
    const isCopy = ([, v]) => g.get(v).op === 'reg' && !qs.has(v);
    for (const [r, v] of updates) if (!isCopy([r, v])) { const w = Math.max(stage.get(v), 0); written.set(r, w); reader(r, w); }
    const copies = updates.filter(isCopy), targets = new Set(copies.map(([r]) => r));
    for (let left = copies; left.length;) {
      const ready = left.filter(([, v]) => !targets.has(v) || written.has(v));
      for (const [r, v] of ready.length ? ready : left) {
        const w = ready.length ? (written.get(v) ?? 0) : 0;
        reader(v, w);
        written.set(r, w);
        reader(r, w);
      }
      left = left.filter((u) => !(ready.length ? ready : left).includes(u));
    }
  }
  for (const [a, b] of together) if (written.has(a) && written.has(b)) { const w = Math.max(written.get(a), written.get(b)); written.set(a, w); written.set(b, w); }
  // (free: an array's registers each iteration reads and writes at its own element, a[i], #2182: no other iteration's)
  const late = [...written].filter(([r, w]) => read.has(r) && w - read.get(r) >= ii && !free.has(r));
  if (late.length) return { fail: { kind: 'var', reg: late[0][0], late } };
  // (the exit known after the next iteration has started: those started then squashed, when none has written anything
  // by then but the loop's own variables, as Vitis HLS speculates)
  const e = exit != null ? Math.max(stage.get(exit), 0) : 0;
  if (e >= ii) {
    // (a stream's read takes its element: as a write, never speculative)
    const commits = [...[...written].filter(([r]) => !own.has(r)).map(([, w]) => w), ...opStage.filter((_, k) => ops[k].write || ops[k].stream)];
    if (commits.some((w) => w < e)) return { fail: { kind: 'exit' } };
  }
  // (a memory's write, then another iteration's read of it: the read after it; with the same index in both, the
  // iterations do not meet)
  for (let w = 0; w < ops.length; w++) {
    if (!ops[w].write) continue;
    for (let r = 0; r < ops.length; r++) {
      if (ops[r].write || memOf(ops[r].mem) !== memOf(ops[w].mem) || sameIndex(ops[r], ops[w]) || dep(memOf(ops[w].mem), 'inter', 'raw')) continue;
      if (opStage[w] >= opStage[r] + ii) return { fail: { kind: 'mem', mem: memOf(ops[w].mem) } };
    }
  }
  let depth = 1;
  for (const s of [...opStage, ...written.values()]) depth = Math.max(depth, s + 1);
  for (const n of g.needed(roots)) depth = Math.max(depth, stage.get(n.id) + 1);
  return { stage, opStage, read, written, depth, exitStage: e, squash: e >= ii };
}

// (the variable a for loop's step adds a constant other than 0 to: i++, --i, i += 2)
const counterOf = (st) => {
  if (!st) return null;
  if ((st.kind === 'postfix' || (st.kind === 'unary' && (st.op === '++' || st.op === '--'))) && st.e.kind === 'id') return st.e.name;
  if (st.kind === 'assign' && (st.op === '+=' || st.op === '-=') && st.l.kind === 'id' && st.r.kind === 'num' && BigInt(st.r.value) !== 0n) return st.l.name;
  return null;
};
/** The arrays a for loop's body reads and writes only at its counter (a[i]), the counter stepped by a constant and written
 *  nowhere else in it: an element no two iterations in flight share (#2182). */
export function counterIndexed(s) {
  const v = s.kind === 'for' ? counterOf(s.step) : null;
  if (!v) return [];
  const ok = new Map();
  let bad = false;
  walk(s.body, (n) => {
    const t = n.kind === 'assign' ? n.l : n.kind === 'postfix' || (n.kind === 'unary' && (n.op === '++' || n.op === '--' || n.op === '&')) ? n.e : null;
    if (t?.kind === 'id' && t.name === v) bad = true;
    if (n.kind === 'decl' && n.vars.some((x) => x.name === v)) bad = true;
    if (n.kind !== 'index') return true;
    if (n.e.kind === 'id') ok.set(n.e.name, (ok.get(n.e.name) ?? true) && n.i.kind === 'id' && n.i.name === v);
    else { let e = n.e; while (e.kind === 'index') e = e.e; if (e.kind === 'id') ok.set(e.name, false); }
    return true;
  });
  return bad ? [] : [...ok].filter(([, y]) => y).map(([x]) => x);
}

export const pipelineSchedMethods = {
  /** Each DEPENDENCE of a body said (on what is no memory, a warning: nothing to free) and set on the loops it is in and on
   *  those in them, `deps`; the function's own returned. */
  markDependences(body) {
    const own = (items) => (items || []).filter((x) => x?.kind === 'pragma' && x.pragma.name === 'DEPENDENCE').flatMap((x) => {
      const d = dependenceOf(x.pragma), v = d?.variable, slot = v == null ? null : this.slots.get(v);
      if (v != null && slot?.kind !== 'mem') this.warn(x.loc, `#pragma HLS DEPENDENCE variable=${v}: ${slot ? 'not a memory: its dependence is kept (the next iteration needs its value)' : 'no such array here'}: ignored`);
      return d && (v == null || slot?.kind === 'mem') ? [d] : [];
    });
    const fnDeps = own(body.items);
    const go = (x, deps) => walk(x, (n) => {
      if (n.kind === 'block' && n !== x) { go(n, [...deps, ...own(n.items)]); return false; }
      if (!isLoop(n)) return true;
      n.deps = [...deps, ...own(n.body?.kind === 'block' ? n.body.items : [])];
      go(n.body, n.deps);
      go([n.init, n.cond, n.step], deps);
      return false;
    });
    go(body, fnDeps);
    return fnDeps;
  },
  /** Why a loop's or a function's body cannot be made as a pipeline here, or null. */
  pipeFullWhy(x) {
    let why = null;
    const streams = new Set();
    walk(x, (n) => {
      if (why) return false;
      const op = this.fifoOp(n), f = op != null ? this.slots.get(n.callee.e.name) : null;
      if (n.kind === 'goto') why = "a 'goto' is in it";
      else if (n.kind === 'return' && !this.fnPiping) why = "a 'return' is in it";
      // (a loop's stream read or written once an iteration: an access in its stage, the stages held while it waits, #2182)
      else if (op != null && (this.fnPiping || (op !== 'read' && op !== 'write') || f?.group || f?.ptr || f?.hs || streams.has(f))) why = 'it reads or writes a stream';
      else if (op != null) streams.add(f);
      else if (n.kind === 'id' && this.slots.get(n.name)?.group) why = 'it accesses a memory of structs';
      else if (n.kind === 'id' && this.slots.get(n.name)?.banks) why = 'it accesses a partitioned array';
      return !why;
    });
    return why;
  },
  /** A body with its inner loops of constant count that access a memory as statements (each a loop of the report),
   *  and those that do not unrolled (core/c-fsmd.js's unrollInner); null when one cannot be. */
  flatBody(x) {
    if (!x || typeof x !== 'object') return x;
    if (Array.isArray(x)) return x.map((y) => this.flatBody(y));
    if (isLoop(x) && this.hasMem(x)) {
      const n = this.tripOf(x);
      if (x.kind !== 'for') this.error(x.loc, 'internal: a loop that cannot be unrolled in a pipeline');
      this.loopInfo(x).unroll = 'whole';
      const items = (x.init ? [x.init] : []);
      for (let k = 0; k < n; k++) items.push(this.flatBody(x.body), ...(x.step ? [{ kind: 'expr', e: x.step, loc: x.loc }] : []));
      return { kind: 'block', items, loc: x.loc };
    }
    if (isLoop(x)) return this.unrollInner(x);
    const y = { ...x };
    for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') y[k] = this.flatBody(v);
    return y;
  },
  /** The stages' statements of a body, in the C's order, from the blocks core/c-fsmd.js makes of it. */
  pipeBlocks(body, L, mk) {
    const tail = mk(L);
    this.inPipe = true;
    const entry = this.cfg([body], tail, L);
    this.inPipe = false;
    const sts = [];
    for (let b = entry; b !== tail; b = b.term.goto) if (b.stmts.length) sts.push(b);
    return sts;
  },
  /** A loop as a pipeline: one state after `cur`, its exit returned. */
  pipeFull(s, cur, mk, lp, info) {
    if (s.kind === 'for' && s.init) { if (this.hasMem(s.init)) cur = this.wordsBefore(null, this.lowerMem(s.init, cur, mk, lp), mk, lp); else cur.stmts.push(s.init); }
    const exit = mk(lp);
    const L = { exit, cont: exit };
    const P = mk(L);
    const locals = new Set();
    walk(s.body, (n) => { if (n.kind === 'decl') for (const v of n.vars) if (!v.static) locals.add(v.name); });
    const body = this.flatBody(s.body);
    // (a step writing only the loop's own variables, of its init: made whatever a break, nothing after the loop reading them)
    const own = new Set(s.kind === 'for' && s.init?.kind === 'decl' ? s.init.vars.map((v) => v.name) : []);
    let free = s.kind === 'for' && !!s.step;
    walk(s.kind === 'for' ? s.step : null, (n) => { const t = n.kind === 'assign' ? n.l : n.kind === 'postfix' || n.kind === 'unary' ? n.e : null; if (t && !(t.kind === 'id' && own.has(t.name))) free = false; if (n.kind === 'call') free = false; });
    P.pipe = { src: s, sts: this.pipeBlocks(body, L, mk), step: s.kind === 'for' ? s.step : null, stepFree: free, own: free ? own : null, cond: s.cond, loc: s.loc, ii: info.pipeline, info, locals, deps: s.deps };
    P.stmts.push({ kind: 'empty', loc: s.loc });
    P.term = { goto: exit };
    cur.term = s.kind === 'do' || !s.cond ? { goto: P } : { cond: s.cond, t: P, f: exit };
    info.blocks = [P];
    return exit;
  },
  /** A function as a pipeline: its machine's one state. */
  pipeFunction(body, ii, loc) {
    const mk = (lp) => { const b = { id: this.blocks.length + 1, stmts: [], term: null, loop: lp }; this.blocks.push(b); return b; };
    const P = mk(null);
    const locals = new Set();
    walk(body, (n) => { if (n.kind === 'decl') for (const v of n.vars) if (!v.static) locals.add(v.name); });
    const info = { line: loc.line, pipeline: ii };
    P.pipe = { src: { kind: 'function', body }, sts: this.pipeBlocks(this.flatBody(body), null, mk), step: null, cond: null, loc, ii, info, locals, fn: true, deps: this.fnDeps };
    P.stmts.push({ kind: 'empty', loc });
    P.term = { done: true };
    this.fnPipe = info;
    return P;
  },
  /** A pipeline's body run symbolically, then scheduled at the lowest II that works from the one asked: its state. */
  pipeState(b) {
    const p = b.pipe, g = this.g;
    const lr = p.fn ? null : { brk: this.F, cont: this.F };
    this.frame = { fn: this.fn, returned: this.F, ret: this.retReg ? this.regNode(this.retReg) : null, rt: this.retType, loops: lr ? [lr] : [] };
    this.scopes = [this.slots];
    this.piping = { qs: new Map() };
    this.stall = this.F;
    const ops = [];
    for (const blk of p.sts) {
      this.access = new Map();
      this.fifoAcc = new Map();
      for (const s of blk.stmts) this.stmt(s, this.T);
      // (the value of a read: of the read before this block's, whose latch this block holds)
      for (const [mem, q] of this.piping.qs) {
        const op = [...ops].reverse().find((o) => o.mem === mem && !o.write && (o.q === null || o.more?.length));
        if (!op) continue;
        if (op.q === null) op.q = q; else { (op.alias ||= []).push(q); op.more.pop(); }
      }
      this.piping.qs = new Map();
      // (a stream's access: its value there in its stage, #2182)
      for (const [name, a] of this.fifoAcc) {
        const f = this.slots.get(name), read = a.d === undefined;
        ops.push({ mem: `fifo:${name}`, fifo: name, a, write: !read, roots: read ? [a.g] : [a.g, a.d], q: read ? this.fifoIn(f, 'dout') : null, stream: true });
      }
      for (const [mem, a] of this.access) {
        // (a read of the element read before, no write of the memory between: that read, its value the same)
        const same = a.d === null && [...ops].reverse().find((o) => (o.write && memOf(o.mem) === memOf(mem)) || (o.mem === mem && o.a.addr === a.addr));
        if (same && !same.write) { same.a = { ...same.a, ce: this.or(same.a.ce, a.ce) }; same.roots = [same.a.addr, same.a.ce]; same.more = [...(same.more || []), true]; continue; }
        ops.push({ mem, a, write: a.d !== null, roots: [a.addr, a.ce, ...(a.d !== null ? [a.we, a.d] : [])], q: null });
      }
    }
    this.piping = null;
    let exitNode = null;
    if (!p.fn) {
      lr.cont = this.F;   // (a continue ends the body, not the step)
      const brk = lr.brk;
      if (p.stepFree) lr.brk = this.F;
      if (p.step) this.stmt({ kind: 'expr', e: p.step, loc: p.loc }, this.T);
      lr.brk = brk;
      exitNode = lr.brk;
      if (p.cond) exitNode = this.or(exitNode, this.not(this.bool(this.expr(p.cond, this.T))));
    }
    // the next values: of the variables, but those of the body's own and of the memories' reads, gone with their iteration
    const updates = [], vals = new Map(), together = [];
    const next = (r, v) => { if (v !== this.regNode(r)) { updates.push([this.regNode(r), v]); vals.set(this.regNode(r), r); } };
    for (const [name, slot] of this.slots) {
      if (slot.kind === 'var') { if (p.locals.has(name)) continue; if (/^ap_mem_/.test(name)) continue; next(slot.reg, slot.val); }
      if (slot.kind === 'array') slot.regs.forEach((r, k) => next(r, slot.elems[k]));
      if (slot.kind === 'out') {
        const o = slot.out;
        next(o.reg, o.val);
        if (o.vld !== this.F) { const r = this.reg(`${o.name}_vld_reg`, BOOL); next(r, o.vld); together.push([this.regNode(r), this.regNode(o.reg)]); }
      }
    }
    if (this.retReg) next(this.retReg, this.frame.ret);
    // (a function's arguments: read as it starts)
    const latched = p.fn ? [...this.regs.values()].filter((r) => r.latch != null) : [];
    const sameIndex = (r, w) => r.a.addr === w.a.addr && !g.isConst(r.a.addr);
    const own = new Set([...vals].filter(([, r]) => p.own?.has(r.name)).map(([n]) => n));
    const asked = Math.max(1, Number(p.ii) || 1);
    // (a memory's port: an access a cycle, so at least its accesses an iteration)
    const perMem = new Map();
    for (const op of ops) perMem.set(op.mem, (perMem.get(op.mem) || 0) + 1);
    const dep = (mem, way, dir) => (p.deps || []).some((d) => (d.variable == null || d.variable === mem) && d.inter === (way === 'inter') && d[dir]);
    // (a sum of many terms a tree, as Vitis HLS's EXPRESSION_BALANCE, #2613)
    if (this.balance !== false) balanceSums(g, [...ops.flatMap((op) => op.roots), ...updates.map((u) => u[1]), ...(exitNode != null ? [exitNode] : [])], 4, new Map(updates.map(([r, v]) => [v, r])));
    // (an array of registers the body reads and writes only at the loop's counter, each element's next value a choice of
    // the element written or itself: no iteration reads another's, each writes its element alone, #2182)
    const free = new Set();
    for (const name of p.src ? counterIndexed(p.src) : []) {
      const slot = this.slots.get(name);
      if (slot?.kind !== 'array') continue;
      const regs = slot.regs.map((r) => this.regNode(r));
      const ups = updates.filter(([r]) => regs.includes(r));
      if (ups.every(([r, v]) => g.get(v).op === 'mux' && g.get(v).args[2] === r)) regs.forEach((r) => free.add(r));
    }
    const once = (n, budget, floor) => moduloSchedule({ g, ops, updates, exit: exitNode, pinned: latched.map((r) => this.regNode(r)), own, free, sameIndex, together, budget, family: this.pipeTiming?.family, dep, floor }, n);
    // (a variable read before the previous iteration has written it: again, each written where its next value is made,
    // its readers no earlier, until none is, #2503; by the clock only when the II needed it)
    const sched = (n, budget, retry = true) => {
      const first = once(n, budget);
      if (first.fail?.kind !== 'var' || !retry) return first;
      const floor = new Map();
      for (let k = 0, plan = first; k < 64 && plan.fail?.kind === 'var'; k++) {
        for (const [r, w] of plan.fail.late) floor.set(r, Math.max(floor.get(r) ?? 0, w - n + 1));
        plan = once(n, budget, floor);
        if (!plan.fail) return { ...plan, retried: true };
      }
      return first;
    };
    let ii = Math.max(asked, ...perMem.values()), plan = null, why = null;
    for (; ; ii++) {
      plan = sched(ii, Infinity);
      if (!plan.fail) break;
      why ||= plan.fail;
    }
    // (the stages by the clock; when they do not keep that II, a recurrence longer than the clock (s += x through a float
    // addition), the II raised until they do, as Vitis HLS raises it, #2182)
    let timed = this.pipeTiming ? sched(ii, this.pipeTiming.budget, !!plan.retried) : plan, slowWhy = null;
    for (let k = ii; timed.fail && k <= ii + MAX_RAISE; k++) {
      const t = sched(k, this.pipeTiming.budget, true);
      if (!t.fail) { if (k > ii) slowWhy = timed.fail; ii = k; timed = t; }
    }
    if (!timed.fail) plan = timed;
    const crowded = [...perMem].filter(([, n]) => n > asked).sort((x, y) => y[1] - x[1])[0];
    if (slowWhy) why = slowWhy;
    if (ii > asked) {
      const clockSaid = slowWhy ? ' at this clock' : '';
      p.info.memII = crowded && crowded[1] >= ii ? `the memory '${memOf(crowded[0])}' has one port, accessed ${crowded[1]} times an iteration`
        : why?.kind === 'var' ? `a dependence${clockSaid}: the next iteration reads '${vals.get(why.reg).name}' before this one has written it`
          : why?.kind === 'mem' ? `a dependence${clockSaid}: another iteration's read of the memory '${why.mem}' must come after this one's write`
            : why?.kind === 'exit' ? `a dependence${clockSaid}: the next iteration must wait for this one to say the loop goes on` : null;
    }
    p.info.pipeII = ii;
    p.info.depth = plan.depth;
    return this.pipeMachine(b, { ops, updates, exitNode, plan, ii, latched, vals, free });
  },
  /** The state of a pipeline scheduled: its valid bits, its pipeline registers, its accesses and next values. */
  pipeMachine(b, { ops, updates, exitNode, plan, ii, latched, vals, free = new Set() }) {
    const g = this.g, p = b.pipe, D = plan.depth, pre = `ap_pipe${b.num}`;
    const st = (n) => g.const(n, this.stateT);
    const memo = new Map(), upd = new Map();
    const inOf = new Map(latched.map((r) => { const id = r.latch; r.latch = null; return [this.regNode(r), id]; }));
    const qMem = new Map(ops.filter((o) => !o.stream).flatMap((o) => [o.q, ...(o.alias || [])].filter((q) => q != null).map((q) => [q, o.mem])));
    const qFifo = new Set(ops.filter((o) => o.stream && o.q != null).map((o) => o.q));
    const stageOf = (v) => {
      if (qMem.has(v) || qFifo.has(v)) return plan.stage.get(v);
      if (!g.get(v).args.length) return vals.has(v) || inOf.has(v) ? (plan.read.get(v) ?? 0) : -1;
      return plan.stage.get(v);
    };
    const cut = (v, c) => {
      const node = g.get(v), name = `${pre}_${v}_s${c}`, t = { w: node.w, s: node.s };
      const r = this.reg(name, t);
      if (!upd.has(name)) { upd.set(name, null); upd.set(name, at(c - 1, v)); }
      return this.regNode(r);
    };
    // (whether at(c, v) is v's operands as stage c computes them: a chain of them followed by a stack of its own, #3595)
    const deeper = (c, v) => !(stageOf(v) < c) && !qFifo.has(v) && !qMem.has(v) && !inOf.has(v) && g.get(v).args.length > 0;
    /** The node v as stage c computes it: what an earlier stage gave from its registers. */
    const at = (c, v) => bottomUp([v], (x) => deeper(c, x) ? g.get(x).args : [], (x) => atOne(c, x), (x) => memo.has(`${c}:${x}`))[0];
    const atOne = (c, v) => {
      const key = `${c}:${v}`;
      if (memo.has(key)) return memo.get(key);
      const node = g.get(v), s = stageOf(v);
      let out = v;
      if (s < 0) out = v;
      else if (s < c) out = cut(v, c);
      else if (qFifo.has(v)) out = v;
      else if (qMem.has(v)) out = this.memQ(this.slots.get(memOf(qMem.get(v))), qMem.get(v) === memOf(qMem.get(v)) ? 0 : 1);
      else if (inOf.has(v)) out = inOf.get(v);
      else if (node.args.length) {
        const args = node.args.map((a) => atOne(c, a));
        out = args.every((a, k) => a === node.args[k]) ? v : g.add(node.op, args, { w: node.w, s: node.s }, extraOf(node));
      }
      memo.set(key, out);
      return out;
    };
    // the valid bits; a function's first stage when ap_start, a loop's until it stopped
    const start = p.fn ? g.add('in', [], BOOL, { port: { key: 'ap_start', name: 'ap_start', protocol: true } }) : null;
    const reg1 = (name) => this.regNode(this.reg(name, BOOL));
    const phT = { w: Math.max(1, (ii - 1).toString(2).length), s: false };
    const ph = ii > 1 ? this.regNode(this.reg(`${pre}_ph`, phT)) : null;
    const ph0 = ii > 1 ? g.add('eq', [ph, g.const(0, phT)], BOOL) : this.T;
    const stop = p.fn ? null : reg1(`${pre}_stop`);
    const v0 = p.fn ? this.and(start, ph0) : this.and(this.not(stop), ph0);
    const last = p.fn ? D : D - 1;   // (a function: a call done when its last stage's values are in their registers)
    const valid = [v0];
    for (let k = 1; k <= last; k++) valid.push(reg1(`${pre}_v${k}`));
    const updatesOut = new Map();
    // (the iterations started after one that ends, the exit known late: squashed)
    const endNow = p.fn ? this.F : this.and(valid[plan.exitStage], at(plan.exitStage, exitNode));
    for (let k = 1; k <= last; k++) updatesOut.set(`${pre}_v${k}`, plan.squash && k <= plan.exitStage ? this.and(valid[k - 1], this.not(endNow)) : valid[k - 1]);
    // the streams' accesses, each in its stage; while one waits (its FIFO empty or full), every stage held (#2182)
    const fifo = new Map();
    let stall = this.F;
    ops.forEach((op, k) => {
      if (!op.stream) return;
      const c = plan.opStage[k], g0 = this.and(valid[c], at(c, op.a.g));
      fifo.set(op.fifo, { g: g0, ok: op.a.ok, ...(op.write ? { d: at(c, op.a.d) } : {}) });
      stall = this.or(stall, this.and(g0, this.not(op.a.ok)));
    });
    const go = this.not(stall);
    // the memories' accesses, each in its stage (its other stages never in the same cycle: modulo the II)
    const access = new Map();
    ops.forEach((op, k) => {
      if (op.stream) return;
      const c = plan.opStage[k], v = stall === this.F ? valid[c] : this.and(valid[c], go);
      const addr = at(c, op.a.addr), ce = this.and(v, at(c, op.a.ce));
      const prev = access.get(op.mem);
      const w = op.write ? this.and(v, at(c, op.a.we)) : null, d = op.write ? at(c, op.a.d) : null;
      const slot = this.slots.get(memOf(op.mem)), memT = slot.t, aT = { w: slot.aw, s: false };
      if (!prev) access.set(op.mem, { addr, ce, we: w ?? this.F, d });
      else access.set(op.mem, { addr: this.mux(v, addr, prev.addr, aT), ce: this.or(prev.ce, ce), we: w ? this.or(prev.we, w) : prev.we, d: d === null ? prev.d : prev.d === null ? d : this.mux(v, d, prev.d, memT) });
    });
    // the variables' next values, each in its stage
    for (const [r, val] of updates) {
      const reg = vals.get(r), c = plan.written.get(r), v = valid[c];
      // (an element at the counter: written alone, the others as they are now, not as its stage read them)
      if (free.has(r)) { const [sel, x] = g.get(val).args; updatesOut.set(reg.name, this.mux(this.and(v, at(c, sel)), at(c, x), r, reg.t)); continue; }
      const x = at(c, val);
      updatesOut.set(reg.name, reg.t === BOOL && /_vld_reg$/.test(reg.name) ? this.and(v, x) : this.mux(v, x, r, reg.t));
    }
    // the loop's end
    let next = st(b.num), busy = this.F;
    for (let k = 0; k < last; k++) busy = this.or(busy, valid[k]);
    if (!p.fn) {
      const ending = this.or(stop, endNow);
      const leave = this.and(ending, this.not(busy));
      next = this.mux(leave, st(b.term.goto.num), st(b.num), this.stateT);
      updatesOut.set(`${pre}_stop`, this.and(ending, this.not(leave)));
      if (ii > 1) {
        const wrap = g.add('eq', [ph, g.const(ii - 1, phT)], BOOL);
        updatesOut.set(`${pre}_ph`, this.mux(this.or(wrap, leave), g.const(0, phT), g.add('add', [ph, g.const(1, phT)], phT), phT));
      }
    } else if (ii > 1) {
      const wrap = g.add('eq', [ph, g.const(ii - 1, phT)], BOOL);
      const hold = this.and(ph0, this.not(start));
      updatesOut.set(`${pre}_ph`, this.mux(this.or(wrap, hold), g.const(0, phT), g.add('add', [ph, g.const(1, phT)], phT), phT));
    }
    for (const [name, v] of upd) updatesOut.set(name, v);
    // (a stream that waits: every register as it is, the state again)
    if (stall !== this.F) {
      for (const [name, v] of updatesOut) { const r = this.regs.get(name); updatesOut.set(name, r.t === BOOL && /_vld_reg$/.test(name) ? this.and(go, v) : this.mux(stall, this.regNode(r), v, r.t)); }
      next = this.mux(stall, st(b.num), next, this.stateT);
    }
    if (p.fn) {
      let any = start;
      for (let k = 1; k <= last; k++) any = this.or(any, valid[k]);
      this.freeRun = { ready: v0, done: valid[last], idle: this.not(any), state: b.num };
    }
    return { id: b.num, updates: updatesOut, next, line: p.loc.line, access, fifo, stall };
  },
};
