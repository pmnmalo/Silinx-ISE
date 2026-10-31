// Silinx HLS (#1919): the loops pipelined automatically, as Vitis HLS's default does (UG1399, its setting
// syn.compile.pipeline_loops, 64 by default): an innermost loop of more iterations than the threshold is pipelined; one
// of the threshold or fewer has its parent pipelined instead (its inner loops then unrolled whole), and an innermost
// loop with no parent is pipelined whatever its count. A loop with its own #pragma HLS PIPELINE is the pragma's (off:
// not pipelined); the threshold 0 pipelines none. The parent is taken only if Silinx can make it an iteration a state
// (core/c-fsmd.js), else its inner loops are taken as innermost ones. A pipelined loop that accesses a stream (its
// accesses a state each) is made as pipelineMethods.pipeMem makes it; one that accesses a memory, core/c-pipe-sched.js. Isomorphic ES module: no DOM and no Node APIs.
//
//   markAutoPipeline(items, { threshold, trip, why })   sets autoPipe on the loops pipelined automatically
//     trip(loop) -> its count (a constant) or null; why(loop) -> why it cannot be pipelined, or null; never(loop): not tried
//   pipelineMethods: SeqFlow's (core/c-fsmd.js) pipeMemWhy(loop), pipeMem(loop, cur, mk, lp, info)
import { loopPragma } from './c-pragma.js';

export const PIPELINE_LOOPS = 64;

const isLoop = (s) => s && (s.kind === 'for' || s.kind === 'while' || s.kind === 'do');

/** The loops directly in a statement (not those inside them). */
export function innerLoops(x) {
  const out = [];
  const w = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(w); return; }
    if (isLoop(n)) { out.push(n); return; }
    for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type') w(v);
  };
  w(x);
  return out;
}

// (autoWhy: why a parent is not pipelined automatically, beyond why; a pragma's loop is why's alone)
export function markAutoPipeline(items, { threshold = PIPELINE_LOOPS, trip, why, autoWhy = why, never = () => false }) {
  if (!threshold) return;
  const visit = (s) => {
    const pp = loopPragma(s, 'PIPELINE');
    const inner = innerLoops(s.body);
    // (a call of a sub-module in it: it waits for it, its loop not one to pipeline, #1960)
    if (!pp && never(s)) { inner.forEach(visit); return; }
    // (the pragma's: its inner loops unrolled; if it cannot be made, they are loops of their own)
    if (pp && !pp.off) { if (why(s)) inner.forEach(visit); return; }
    // (an UNROLL with no factor: its iterations in the state it is in, not a loop to pipeline)
    const whole = (l) => { const u = loopPragma(l, 'UNROLL'); return !!u && u.factor === undefined; };
    if (!inner.length) { if (!pp && !whole(s)) s.autoPipe = true; return; }
    const small = (l) => !innerLoops(l.body).length && !loopPragma(l, 'PIPELINE') && (whole(l) || (trip(l) !== null && trip(l) <= threshold));
    if (!pp && !whole(s) && inner.every(small) && !autoWhy(s)) { s.autoPipe = true; return; }
    inner.forEach(visit);
  };
  innerLoops(items).forEach(visit);
}

// (what an expression or statement names, and the variables it writes)
const walk = (x, f) => {
  if (!x || typeof x !== 'object') return;
  if (Array.isArray(x)) { x.forEach((y) => walk(y, f)); return; }
  if (f(x) === false) return;
  for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') walk(v, f);
};
const named = (x) => { const out = new Set(); walk(x, (n) => { if (n.kind === 'id') out.add(n.name); }); return out; };
const base = (e) => { while (e && (e.kind === 'index' || e.kind === 'member' || e.kind === 'paren' || (e.kind === 'unary' && e.op === '*'))) e = e.e; return e?.kind === 'id' ? e.name : null; };
const written = (x, fifoOp) => {
  const out = new Set();
  walk(x, (n) => {
    if (n.kind === 'assign') out.add(base(n.l));
    if (n.kind === 'postfix' || (n.kind === 'unary' && (n.op === '++' || n.op === '--'))) out.add(base(n.e));
    if (n.kind === 'decl') for (const v of n.vars) out.add(v.name);
    if (n.kind === 'memlatch' || n.kind === 'fiforead' || n.kind === 'wordget') out.add(n.tmp);
    if (n.kind === 'memread' && n.selTmp) out.add(n.selTmp);   // (the memory selected, core/c-partition.js)
    if (n.kind === 'wordload' || n.kind === 'wordset') out.add(n.reg);   // (a struct's word, #1668)
    // (a call may write what it reaches; a stream's read(x), x)
    const op = n.kind === 'call' ? fifoOp(n) : undefined;
    if (op === 'read' && n.args.length) out.add(base(n.args[0]));
    else if (n.kind === 'call' && op == null) out.add(null);
  });
  return out;
};
/** A continue or a goto in the statement. */
const jumps = (x) => {
  let hit = false;
  walk(x, (n) => { if (n.kind === 'goto' || n.kind === 'continue') hit = true; return !hit; });
  return hit;
};

export const pipelineMethods = {
  /** Why a pipelined loop that accesses a memory or a stream cannot be made as pipeMem makes it, or null. */
  pipeMemWhy(s) {
    const chain = (x) => !this.hasMem(x) || ['expr', 'decl', 'return'].includes(x.kind) || (x.kind === 'block' && x.items.every(chain))
      || (x.kind === 'if' && this.flatOk(x));
    const what = this.hasFifo(s) ? 'a stream' : 'a memory';
    return s.kind === 'do' ? 'a do-while' : innerLoops(s.body).some((l) => this.hasMem(l)) ? `a loop that accesses ${what} is in it`
      : jumps(s.body) ? "a 'continue' or a 'goto' is in it" : !chain(s.body) ? `it accesses ${what} in a branch, an access a state`
        : this.accesses(s.cond) || this.accesses(s.step) ? `its condition or step accesses ${what}` : null;
  },
  /** A memory's access in x. */
  accessesMem(x) { let hit = false; walk(x, (n) => { if (this.isMem(n)) hit = true; return !hit; }); return hit; },
  /** An if a pipelined loop makes in one state (flatIf): its memories' reads made before it whatever its condition (a
   *  read has no effect), so none in its branches may read what it writes first (a variable it assigns in an index,
   *  a memory it writes); a memory written once in it; a stream read or written once in it, as a statement of its
   *  own (made only if it runs it); no loop, no other call. */
  flatOk(s) {
    let ok = true;
    const w = written(s, (n) => this.fifoOp(n)), wrote = new Set(), targets = new Set(), streams = new Set();
    const target = (n) => (n.kind === 'assign' ? n.l : n.kind === 'postfix' || (n.kind === 'unary' && (n.op === '++' || n.op === '--')) ? n.e : null);
    let ops = 0, stmts = 0;
    walk([s.then, s.else], (n) => {
      if (this.fifoStmt1(n)) stmts++;
      const op = this.fifoOp(n);
      if (isLoop(n) || (n.kind === 'call' && op == null)) ok = false;
      // (a member of a stream or a memory of structs: its word's, core/c-agg-mem.js, not made here)
      if ((this.isMem(n) && (this.slots.get(n.e.name).group || this.slots.get(n.e.name).banks)) || (op != null && this.slots.get(n.callee.e.name).group)) ok = false;
      if (op === 'read' || op === 'write') { ops++; if (streams.has(n.callee.e.name)) ok = false; streams.add(n.callee.e.name); }
      const t = target(n);
      if (t && this.isMem(t)) { if (wrote.has(t.e.name)) ok = false; wrote.add(t.e.name); targets.add(t); }
      return ok;
    });
    if (!ok || ops !== stmts || [...w].some((v) => v === null)) return false;
    walk([s.then, s.else], (n) => {
      if (this.isMem(n) && !targets.has(n) && (wrote.has(n.e.name) || [...named(n.i)].some((v) => w.has(v)))) ok = false;
      return ok;
    });
    return ok;
  },
  /** A statement that is a stream's read or write alone (x = s.read(); s.read(x); s.write(v); T x = s.read();): the
   *  stream's call, else null. */
  fifoStmt1(x) {
    const e = x.kind === 'expr' ? (x.e.kind === 'assign' && x.e.op === '=' ? x.e.r : x.e) : x.kind === 'decl' && x.vars.length === 1 ? x.vars[0].init : null;
    const op = this.fifoOp(e);
    return op === 'write' || (op === 'read' && (x.kind === 'decl' || x.e.kind === 'assign' ? !e.args.length : e.args.length === 1)) ? e : null;
  },
  /** An if of a pipelined loop (flatOk), in the blocks after cur: its reads' states, then a state with it, each
   *  write of a memory and each access of a stream in it made only if it runs it. Returns the last block. */
  flatIf(s, cur, mk, lp) {
    const at = { cur, next: () => { const nb = mk(lp); at.cur.term = { goto: nb }; at.cur = nb; } };
    const writes = [];
    const low = (x) => {
      if (!x || !this.hasMem(x)) return x;
      if (x.kind === 'block') return { ...x, items: x.items.map(low) };
      const f = this.fifoStmt1(x);
      if (f) {
        const fifo = this.slots.get(f.callee.e.name);
        if (this.fifoOp(f) === 'write') { fifo.written = true; return { kind: 'fifowrite', fifo: fifo.name, v: this.hoist(f.args[0], at), loc: x.loc }; }
        const tmp = `ap_fifo_${fifo.name}_${fifo.reads++}`;
        this.slots.set(tmp, { kind: 'var', t: fifo.t, reg: this.reg(tmp, fifo.t), name: tmp });
        fifo.read = true;
        const v = { kind: 'id', name: tmp, loc: x.loc };
        const then = x.kind === 'decl' ? { ...x, vars: [{ ...x.vars[0], init: v }] }
          : { kind: 'expr', e: { kind: 'assign', op: '=', l: x.e.kind === 'assign' ? x.e.l : f.args[0], r: v, loc: x.loc }, loc: x.loc };
        return { kind: 'block', items: [{ kind: 'fiforead', fifo: fifo.name, tmp, loc: x.loc }, then], loc: x.loc };
      }
      if (x.kind === 'if') return { ...x, cond: this.hoist(x.cond, at), then: low(x.then), else: low(x.else) };
      const e = x.kind === 'expr' ? x.e : null;
      const t = e && (e.kind === 'assign' ? e.l : e.kind === 'postfix' || (e.kind === 'unary' && (e.op === '++' || e.op === '--')) ? e.e : null);
      if (t && this.isMem(t)) {
        const one = { kind: 'num', value: 1n, text: '1', loc: e.loc };
        const rhs = e.kind === 'assign' ? (e.op === '=' ? e.r : { kind: 'binary', op: e.op.slice(0, -1), l: t, r: e.r, loc: e.loc }) : { kind: 'binary', op: e.op === '++' ? '+' : '-', l: t, r: one, loc: e.loc };
        const w = { kind: 'memwrite', mem: t.e.name, i: this.hoist(t.i, at), v: this.hoist(rhs, at), loc: e.loc };
        writes.push(w);
        this.slots.get(t.e.name).written = true;
        return w;
      }
      if (x.kind === 'decl') return { ...x, vars: x.vars.map((v) => ({ ...v, init: v.init ? this.hoist(v.init, at) : v.init })) };
      return { ...x, e: this.hoist(x.e, at) };
    };
    const cond = this.hoist(s.cond, at);
    const made = { ...s, cond, then: low(s.then), else: low(s.else) };
    // (a write's port: a state after the last read of its memory)
    if (writes.some((w) => at.cur.acc?.has(w.mem))) at.next();
    for (const w of writes) (at.cur.acc ||= new Set()).add(w.mem);
    at.cur.stmts.push(made);
    return at.cur;
  },
  /** A memory's or a stream's access in x (a stream's empty() and full() are not). */
  accesses(x) {
    let hit = false;
    walk(x, (n) => { const op = this.fifoOp(n); if (this.isMem(n) || (op != null && op !== 'empty' && op !== 'full')) hit = true; return !hit; });
    return hit;
  },
  /** A stream's member function called in x. */
  hasFifo(x) { let hit = false; walk(x, (n) => { if (this.fifoOp(n) != null) hit = true; return !hit; }); return hit; },
  /** A pipelined loop that accesses a memory or a stream (#1919): its body's states one after the other, each merged
   *  with the next when they use no port of the same memory or stream and the next reads no value the other's read
   *  gives (a memory's comes a cycle later; a stream's is there at once); its step and its condition in its last
   *  state (no state of their own), and its first state's work there too, for the next iteration, when they use no
   *  port of the same memory or stream: an iteration then takes the body's states but one. A state that waits for a
   *  stream writes nothing while it waits. The loop's blocks after `cur`, its exit returned (pipeMemWhy(s) null: it can
   *  be made so). */
  pipeMem(s, cur, mk, lp, info) {
    if (s.kind === 'for' && s.init) { if (this.hasMem(s.init)) cur = this.wordsBefore(null, this.lowerMem(s.init, cur, mk, lp), mk, lp); else cur.stmts.push(s.init); }
    const exit = mk(lp);
    const L = { exit, cont: exit };   // (a break: out; no continue)
    const tail = mk(L);
    this.inPipe = true;
    const entry = this.cfg([this.unrollInner(s.body)], tail, L);
    this.inPipe = false;
    const sts = [];
    for (let b = entry; b !== tail; b = b.term.goto) if (b.stmts.length) sts.push(b);
    // (a memory's port, a stream's: accessed, or its empty() / full() read, which must see the accesses before it)
    const ports = (b) => {
      const p = new Set(b.acc);
      walk(b.stmts, (x) => { if (x.kind === 'fiforead' || x.kind === 'fifowrite') p.add(`fifo:${x.fifo}`); else if (this.fifoOp(x) != null) p.add(`fifo:${x.callee.e.name}`); });
      return p;
    };
    const apart = (a, b) => { const p = ports(a); return ![...ports(b)].some((x) => p.has(x)); };
    // (reads of different memories of a partitioned array, in the state of the first: their values a state later, #1920)
    for (let k = 0; k + 2 < sts.length;) {
      const [x, y, z] = [sts[k], sts[k + 1], sts[k + 2]];
      const r = y.stmts.at(-1), l = z.stmts[0];
      const made = new Set(y.stmts.flatMap((n) => [...written(n, (c) => this.fifoOp(c))]));
      if (!(r?.kind === 'memread' && !r.sel && this.slots.get(r.mem).part && l?.kind === 'memlatch' && l.mem === r.mem && !x.acc?.has(r.mem) && ![...named(r.i)].some((v) => made.has(v)))) { k++; continue; }
      x.stmts.push(y.stmts.pop());
      (x.acc ||= new Set()).add(r.mem);
      y.acc?.delete(r.mem);
      y.stmts.push(z.stmts.shift());
      if (!z.stmts.length) { z.acc = null; sts.splice(k + 2, 1); continue; }
      if (!z.stmts.some((n) => n.kind === 'memlatch') && apart(y, z)) { y.stmts.push(...z.stmts); y.acc = new Set([...(y.acc || []), ...(z.acc || [])]); sts.splice(k + 2, 1); continue; }
      k++;
    }
    for (let k = 0; k + 1 < sts.length;) {
      const [a, b] = [sts[k], sts[k + 1]];
      if (b.stmts.some((x) => x.kind === 'memlatch' || x.kind === 'wordload') || !apart(a, b)) { k++; continue; }
      a.stmts.push(...b.stmts);
      a.acc = new Set([...(a.acc || []), ...(b.acc || [])]);
      sts.splice(k + 1, 1);
    }
    sts.forEach((b, k) => { b.gate = true; if (k + 1 < sts.length) b.term = { goto: sts[k + 1] }; });
    const last = sts.at(-1), first = sts[0];
    if (s.kind === 'for' && s.step) last.stmts.push({ kind: 'expr', e: s.step, loc: s.loc });
    const cond = s.cond || { kind: 'num', value: 1n, text: '1', loc: s.loc };
    // (the first state's work in the last, for the next iteration if there is one: not when it writes what the
    // condition reads, nor when both use a port of the same memory or stream)
    const w = written(first.stmts, (n) => this.fifoOp(n)), c = named(cond);
    // (a condition reading a stream's empty() / full(): a state of its own, after the accesses)
    const polls = this.hasFifo(cond);
    const overlap = !polls && sts.length > 1 && apart(first, last) && !w.has(null) && ![...w].some((v) => c.has(v));
    if (polls) {
      const head = mk(L);
      head.term = { cond, t: first, f: exit };
      last.term = { goto: head };
      cur.term = { goto: head };
      info.blocks = [...sts, head];
    } else if (overlap) {
      const ahead = () => ({ kind: 'if', cond, then: { kind: 'block', items: [...first.stmts], loc: s.loc }, else: null, loc: s.loc });
      const pro = mk(L);
      pro.gate = true;
      pro.stmts.push(ahead());
      pro.term = { cond, t: sts[1], f: exit };
      last.stmts.push(ahead());
      last.term = { cond, t: sts[1], f: exit };
      cur.term = { goto: pro };
      info.blocks = sts.slice(1);
    } else {
      last.term = { cond, t: first, f: exit };
      cur.term = { cond, t: first, f: exit };
      info.blocks = sts;
    }
    info.memII = this.accessesMem(s) ? 'it accesses a memory, an access a state' : 'it reads or writes a stream, an access a state';
    return exit;
  },
};
