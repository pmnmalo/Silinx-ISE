// Silinx HLS (#1962): a loop or a function pipelined as Vitis HLS pipelines it: its iterations overlap, a new one every II
// cycles. Its body is run symbolically once (core/c-fsmd.js's blocks, their values chained), its operations then
// scheduled in stages, modulo the II: a memory's access in a stage where its port is free (one a cycle), the operations
// chained while they fit the clock, the values a later stage reads in pipeline registers, a stage's work enabled by its
// valid bit. The II is the one asked or the lowest that works: the ports, a variable's next value read by the next iteration
// (a dependence), a memory read after a write of another iteration, the exit known before the next iteration starts.
// The whole is one state of the machine: it holds while the pipeline runs and leaves when it has drained; a function's is
// the machine's only state, a call starting whenever ap_start finds the first stage free (ap_ready), ap_done a call's end.
// Inner loops of constant count are unrolled in it, those with a memory's access as statements. An exit known late
// squashes the iterations started after it. A stream's access is not made here (core/c-pipeline.js's pipeMem). Isomorphic ES module: no DOM and no Node APIs.
//
//   pipelineSchedMethods: SeqFlow's (core/c-fsmd.js)
//     pipeFullWhy(s)                     why this loop or function body cannot be made so, or null
//     pipeFull(s, cur, mk, lp, info)     the loop's state after `cur`, its exit returned
//     pipeFunction(body, ii, loc)        the function's state; pipeState(b): a pipeline's state, run
//   moduloSchedule(body, ii)             the stages
import { BOOL } from './c-types.js';
import { nodeDelay } from './c-timing.js';

const walk = (x, f) => {
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach((y) => walk(y, f)); return; }
  if (f(x) === false) return;
  for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') walk(v, f);
};
const isLoop = (s) => s && (s.kind === 'for' || s.kind === 'while' || s.kind === 'do');
const extraOf = ({ id, op, args, w, s, ...extra }) => extra;

/**
 * The stages of a body, modulo ii; { fail: why } when the ii does not work.
 *   g: the graph; ops: its memories' accesses in the C's order, { mem, roots: [node], write, q: the node of its value };
 *   updates: [[register's node, value]] (a variable's next value); exit: the node saying the loop ends, or null;
 *   sameIndex(r, w): a read and a write that cannot meet across iterations; together: [[register's node, register's node]]
 *   written in one stage (a pointer output and its _ap_vld); budget, family: the clock's.
 * -> { stage: Map node -> stage, opStage: [stage], read: Map register's node -> its stage, written: Map -> its stage, depth }
 */
export function moduloSchedule({ g, ops, updates, exit, pinned = [], own = new Set(), sameIndex = () => false, together = [], budget = Infinity, family = 'artix7' }, ii) {
  const stage = new Map(), at = new Map();
  const ensure = (roots) => {
    for (const n of g.needed(roots)) {
      if (stage.has(n.id)) continue;
      if (!n.args.length) { stage.set(n.id, -1); at.set(n.id, 0); continue; }   // (a constant, a register: where it is read)
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
  const ports = new Map(), last = new Map(), opStage = [];
  for (const op of ops) {
    ensure(op.roots);
    let s = op.roots.reduce((m, r) => Math.max(m, stage.get(r)), 0);
    if (last.has(op.mem)) s = Math.max(s, last.get(op.mem) + 1);
    const used = ports.get(op.mem) || new Set();
    while (used.has(s % ii)) s++;
    used.add(s % ii);
    ports.set(op.mem, used);
    last.set(op.mem, s);
    opStage.push(s);
    for (const q of [op.q, ...(op.alias || [])]) if (q != null) { stage.set(q, s + 1); at.set(q, 0); }
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
  for (const [, v] of updates) reader(v, 0);
  if (exit != null) reader(exit, 0);
  for (const r of pinned) read.set(r, 0);
  const written = new Map();
  for (const [r, v] of updates) written.set(r, Math.max(stage.get(v), read.get(r) ?? 0, 0));
  for (const [a, b] of together) if (written.has(a) && written.has(b)) { const w = Math.max(written.get(a), written.get(b)); written.set(a, w); written.set(b, w); }
  for (const [r, w] of written) if (read.has(r) && w - read.get(r) >= ii) return { fail: { kind: 'var', reg: r } };
  // (the exit known after the next iteration has started: those started then squashed, when none has written anything
  // by then but the loop's own variables, as Vitis HLS speculates)
  const e = exit != null ? Math.max(stage.get(exit), 0) : 0;
  if (e >= ii) {
    const commits = [...[...written].filter(([r]) => !own.has(r)).map(([, w]) => w), ...opStage.filter((_, k) => ops[k].write)];
    if (commits.some((w) => w < e)) return { fail: { kind: 'exit' } };
  }
  // (a memory's write, then another iteration's read of it: the read after it; with the same index in both, the
  // iterations do not meet)
  for (let w = 0; w < ops.length; w++) {
    if (!ops[w].write) continue;
    for (let r = 0; r < ops.length; r++) {
      if (ops[r].write || ops[r].mem !== ops[w].mem || sameIndex(ops[r], ops[w])) continue;
      if (opStage[w] >= opStage[r] + ii) return { fail: { kind: 'mem', mem: ops[w].mem } };
    }
  }
  let depth = 1;
  for (const s of [...opStage, ...written.values()]) depth = Math.max(depth, s + 1);
  for (const n of g.needed(roots)) depth = Math.max(depth, stage.get(n.id) + 1);
  return { stage, opStage, read, written, depth, exitStage: e, squash: e >= ii };
}

export const pipelineSchedMethods = {
  /** Why a loop's or a function's body cannot be made as a pipeline here, or null. */
  pipeFullWhy(x) {
    let why = null;
    walk(x, (n) => {
      if (why) return false;
      if (n.kind === 'goto') why = "a 'goto' is in it";
      else if (n.kind === 'return' && !this.fnPiping) why = "a 'return' is in it";
      else if (this.fifoOp(n) != null) why = 'it reads or writes a stream';
      else if (n.kind === 'id' && this.slots.get(n.name)?.group) why = 'it accesses a memory of structs';
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
    P.pipe = { src: s, sts: this.pipeBlocks(body, L, mk), step: s.kind === 'for' ? s.step : null, stepFree: free, own: free ? own : null, cond: s.cond, loc: s.loc, ii: info.pipeline, info, locals };
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
    P.pipe = { src: { kind: 'function', body }, sts: this.pipeBlocks(this.flatBody(body), null, mk), step: null, cond: null, loc, ii, info, locals, fn: true };
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
      for (const [mem, a] of this.access) {
        // (a read of the element read before, no write of the memory between: that read, its value the same)
        const same = a.d === null && [...ops].reverse().find((o) => o.mem === mem && (o.write || o.a.addr === a.addr));
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
    const sched = (n, budget) => moduloSchedule({ g, ops, updates, exit: exitNode, pinned: latched.map((r) => this.regNode(r)), own, sameIndex, together, budget, family: this.pipeTiming?.family }, n);
    let ii = Math.max(asked, ...perMem.values()), plan = null, why = null;
    for (; ; ii++) {
      plan = sched(ii, Infinity);
      if (!plan.fail) break;
      why ||= plan.fail;
    }
    // (the stages by the clock when they keep that II; else one long path, said as a pipelined state's is, core/c-schedule.js)
    const timed = this.pipeTiming ? sched(ii, this.pipeTiming.budget) : plan;
    if (!timed.fail) plan = timed;
    const crowded = [...perMem].filter(([, n]) => n > asked).sort((x, y) => y[1] - x[1])[0];
    if (ii > asked) {
      p.info.memII = crowded && crowded[1] >= ii ? `the memory '${crowded[0]}' has one port, accessed ${crowded[1]} times an iteration`
        : why?.kind === 'var' ? `a dependence: the next iteration reads '${vals.get(why.reg).name}' before this one has written it`
          : why?.kind === 'mem' ? `a dependence: another iteration's read of the memory '${why.mem}' must come after this one's write`
            : why?.kind === 'exit' ? 'a dependence: the next iteration must wait for this one to say the loop goes on' : null;
    }
    p.info.pipeII = ii;
    p.info.depth = plan.depth;
    return this.pipeMachine(b, { ops, updates, exitNode, plan, ii, latched, vals });
  },
  /** The state of a pipeline scheduled: its valid bits, its pipeline registers, its accesses and next values. */
  pipeMachine(b, { ops, updates, exitNode, plan, ii, latched, vals }) {
    const g = this.g, p = b.pipe, D = plan.depth, pre = `ap_pipe${b.num}`;
    const st = (n) => g.const(n, this.stateT);
    const memo = new Map(), upd = new Map();
    const inOf = new Map(latched.map((r) => { const id = r.latch; r.latch = null; return [this.regNode(r), id]; }));
    const qMem = new Map(ops.flatMap((o) => [o.q, ...(o.alias || [])].filter((q) => q != null).map((q) => [q, o.mem])));
    const stageOf = (v) => {
      if (qMem.has(v)) return plan.stage.get(v);
      if (!g.get(v).args.length) return vals.has(v) || inOf.has(v) ? (plan.read.get(v) ?? 0) : -1;
      return plan.stage.get(v);
    };
    const cut = (v, c) => {
      const node = g.get(v), name = `${pre}_${v}_s${c}`, t = { w: node.w, s: node.s };
      const r = this.reg(name, t);
      if (!upd.has(name)) { upd.set(name, null); upd.set(name, at(c - 1, v)); }
      return this.regNode(r);
    };
    /** The node v as stage c computes it: what an earlier stage gave from its registers. */
    const at = (c, v) => {
      const key = `${c}:${v}`;
      if (memo.has(key)) return memo.get(key);
      const node = g.get(v), s = stageOf(v);
      let out = v;
      if (s < 0) out = v;
      else if (s < c) out = cut(v, c);
      else if (qMem.has(v)) out = this.memQ(this.slots.get(qMem.get(v)));
      else if (inOf.has(v)) out = inOf.get(v);
      else if (node.args.length) {
        const args = node.args.map((a) => at(c, a));
        out = args.every((a, k) => a === node.args[k]) ? v : g.add(node.op, args, { w: node.w, s: node.s }, extraOf(node));
      }
      memo.set(key, out);
      return out;
    };
    // the valid bits; a function's first stage when ap_start, a loop's until it stopped
    const start = p.fn ? g.add('in', [], BOOL, { port: { key: 'ap_start', name: 'ap_start' } }) : null;
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
    // the memories' accesses, each in its stage (its other stages never in the same cycle: modulo the II)
    const access = new Map();
    ops.forEach((op, k) => {
      const c = plan.opStage[k], v = valid[c];
      const addr = at(c, op.a.addr), ce = this.and(v, at(c, op.a.ce));
      const prev = access.get(op.mem);
      const w = op.write ? this.and(v, at(c, op.a.we)) : null, d = op.write ? at(c, op.a.d) : null;
      const memT = this.slots.get(op.mem).t, aT = { w: this.slots.get(op.mem).aw, s: false };
      if (!prev) access.set(op.mem, { addr, ce, we: w ?? this.F, d });
      else access.set(op.mem, { addr: this.mux(v, addr, prev.addr, aT), ce: this.or(prev.ce, ce), we: w ? this.or(prev.we, w) : prev.we, d: d === null ? prev.d : prev.d === null ? d : this.mux(v, d, prev.d, memT) });
    });
    // the variables' next values, each in its stage
    for (const [r, val] of updates) {
      const reg = vals.get(r), c = plan.written.get(r), v = valid[c], x = at(c, val);
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
    if (p.fn) {
      let any = start;
      for (let k = 1; k <= last; k++) any = this.or(any, valid[k]);
      this.freeRun = { ready: v0, done: valid[last], idle: this.not(any), state: b.num };
    }
    return { id: b.num, updates: updatesOut, next, line: p.loc.line, access, fifo: new Map(), stall: this.F };
  },
};
