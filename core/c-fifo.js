// Silinx HLS (#1590): an hls::stream argument of a sequential module (core/c-fsmd.js): Vitis HLS's ap_fifo interface,
// a FIFO outside the module (first-word fall-through): read, <s>_dout, <s>_empty_n, <s>_read (the value taken in the
// cycle _read is 1); written, <s>_din, <s>_full_n, <s>_write. Each access a state of its own that waits while the FIFO
// is empty (a read) or full (a write); the value read kept in a register. s.empty() and s.full() read _empty_n and
// _full_n. A pointer or an array argument with #pragma HLS INTERFACE ap_fifo is one too (#1901): each *p, p[i] a read,
// each *p = v, p[i] = v a write, in the order of the code; with ap_hs, the same handshake named as Vitis HLS names it:
// read, <p>, <p>_ap_vld, <p>_ap_ack; written, <p>, <p>_ap_vld, <p>_ap_ack, its _ap_vld not waiting for its _ap_ack.
// Isomorphic ES module: no DOM and no Node APIs.
import { BOOL, typeOf } from './c-types.js';
import { exprMethods } from './c-dataflow-expr.js';

const HS = { dout: '', empty_n: '_ap_vld', read: '_ap_ack', din: '', full_n: '_ap_ack', write: '_ap_vld' };
/** A port's suffix: ap_fifo's, or ap_hs's. */
export const fifoSuffix = (f, port) => (f.hs ? HS[port] : `_${port}`);
const replace = (n, m) => { for (const k of Object.keys(n)) if (k !== 'loc') delete n[k]; Object.assign(n, m); };

export const fifoMethods = {
  /** Whether the argument is a FIFO by its INTERFACE pragma: its mode, else null. */
  ptrFifoMode(pa) {
    const mode = this.modes?.get(pa.name), t = pa.type;
    if (mode !== 'ap_fifo' && mode !== 'ap_hs') return null;
    const scalar = t.kind === 'ptr' ? typeOf(t.to) : t.kind === 'array' && (mode === 'ap_fifo' || t.fromPtr) ? typeOf(t.of) : null;
    return scalar ? mode : null;
  },
  /** The accesses of the arguments with ap_fifo or ap_hs in fn's body: their reads and writes of a stream (#1901). */
  ptrFifoAccesses(fn) {
    const names = new Set(fn.params.filter((pa) => this.ptrFifoMode(pa)).map((pa) => pa.name));
    if (!names.size) return;
    // (a copy: the module may be made again from the same tree, and said again)
    fn.body = structuredClone(fn.body);
    const target = (x) => (x?.kind === 'unary' && x.op === '*' && x.e.kind === 'id' && names.has(x.e.name) ? x.e : x?.kind === 'index' && x.e.kind === 'id' && names.has(x.e.name) ? x.e : null);
    const last = new Map();
    // (constant positions in order: a FIFO's values come one after the other)
    const order = (x, name) => {
      if (x.kind !== 'index' || x.i.kind !== 'num') return;
      if (x.i.value < (last.get(name) ?? 0n)) this.error(x.loc, `the argument '${name}' (${this.modes.get(name)}): its values are read and written in order, one after the other: ${name}[${x.i.value}] comes after ${name}[${last.get(name)}]`);
      last.set(name, x.i.value);
    };
    const access = (e, op, args, loc) => ({ kind: 'call', callee: { kind: 'member', e: { kind: 'id', name: e.name, loc }, name: op, loc }, args, loc });
    const walk = (n, parent) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n)) { for (const x of n) walk(x, parent); return; }
      if (n.kind === 'assign' && target(n.l)) {
        const p = target(n.l);
        if (n.op !== '=' || parent?.kind !== 'expr') this.error(n.loc, `the argument '${p.name}' (${this.modes.get(p.name)}): a write is a statement of its own, ${p.name}[i] = v: it is read or written, not both`);
        walk(n.r, n);
        order(n.l, p.name);
        replace(n, access(p, 'write', [n.r], n.loc));
        return;
      }
      if (target(n)) {
        const p = target(n);
        if (parent && (parent.kind === 'postfix' || (parent.kind === 'unary' && (parent.op === '++' || parent.op === '--' || parent.op === '&')))) this.error(n.loc, `the argument '${p.name}' (${this.modes.get(p.name)}): read or written, one value at a time: ${parent.op} of it is not supported`);
        if (n.kind === 'index') walk(n.i, n);
        order(n, p.name);
        replace(n, access(p, 'read', [], n.loc));
        return;
      }
      if (n.kind === 'id' && names.has(n.name) && !(parent?.kind === 'member' && parent.e === n)) this.error(n.loc, `the argument '${n.name}' (${this.modes.get(n.name)}): only read through it or written through it (*${n.name}, ${n.name}[i])`);
      for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type' && k !== 'pragma' && v && typeof v === 'object') walk(v, n);
    };
    walk(fn.body, null);
  },
  fifoSlot(pa) {
    const mode = this.ptrFifoMode(pa);
    const t = mode ? typeOf(pa.type.to ?? pa.type.of) : typeOf(pa.type.of);
    if (!t) this.error(pa.loc, `the stream '${pa.name}': a stream of integers`);
    return { kind: 'fifo', name: pa.name, t, read: false, written: false, reads: 0, loc: pa.loc, ...(mode ? { ptr: pa.type.kind === 'ptr' ? 'scalar' : 'array', ...(mode === 'ap_hs' ? { hs: true } : {}) } : {}) };
  },
  /** e is s.<op>(…) of a stream argument: its op, else null. */
  fifoOp(e) {
    if (e?.kind !== 'call' || e.callee.kind !== 'member' || e.callee.e.kind !== 'id') return null;
    return this.slots.get(e.callee.e.name)?.kind === 'fifo' ? e.callee.name : null;
  },
  /** A read of a stream, in e: a state that waits for a value (its _read the cycle it takes it), the value then in a
   *  register (the expression reads it). */
  hoistFifoRead(e, at) {
    const f = this.slots.get(e.callee.e.name);
    if (f.group) return this.hoistFifoField(e, f, at);   // (a member of a stream of structs: its word's field, #1668)
    if (e.args.length) this.error(e.loc, `'${f.name}.read(x)' inside an expression: write x = ${f.name}.read(); or ${f.name}.read(x); as a statement`);
    const tmp = `ap_fifo_${f.name}_${f.reads++}`;
    this.slots.set(tmp, { kind: 'var', t: f.t, reg: this.reg(tmp, f.t), name: tmp });
    f.read = true;
    // (its own state: nothing else waits with it)
    if (at.cur.stmts.length) at.next();
    at.cur.stmts.push({ kind: 'fiforead', fifo: f.name, tmp, loc: e.loc });
    at.next();
    return { kind: 'id', name: tmp, loc: e.loc };
  },
  /** s.write(v); as a statement: v's reads first, then a state that waits while the FIFO is full. */
  lowerFifoWrite(e, at) {
    const f = this.slots.get(e.callee.e.name);
    if (f.group) return this.lowerFifoField(e, f, at);
    if (e.args.length !== 1) this.error(e.loc, `'${f.name}.write' takes one value`);
    if (this.hasSide(e.args[0])) this.error(e.loc, `a write of the stream '${f.name}' with another side effect in it: write them as statements of their own`);
    const v = this.hoist(e.args[0], at);
    if (at.cur.stmts.length) at.next();
    at.cur.stmts.push({ kind: 'fifowrite', fifo: f.name, v, loc: e.loc });
    f.written = true;
    at.next();
    return at.cur;
  },
  // ------------------------------------------------------------------ run in a state
  fifoIn(f, port) { const P = f.port ?? f.name, sfx = fifoSuffix(f, port); return this.g.add('in', [], port === 'dout' ? f.t : BOOL, { port: { key: `${P}${sfx}`, name: `${P}${sfx}`, param: P, suffix: sfx } }); },
  fifoStmt(s, base) {
    const f = this.slots.get(s.fifo);
    const g = this.guard(base);
    if (s.kind === 'fiforead') {
      const ok = this.fifoIn(f, 'empty_n');
      this.slots.get(s.tmp).val = this.fifoIn(f, 'dout');
      this.fifoAcc.set(f.name, { g, ok });
      this.stall = this.or(this.stall, this.and(g, this.not(ok)));
      return;
    }
    const ok = this.fifoIn(f, 'full_n');
    this.fifoAcc.set(f.name, { g, ok, d: this.conv(this.expr(s.v, g), f.t).id });
    this.stall = this.or(this.stall, this.and(g, this.not(ok)));
  },
  /** s.empty(), s.full(): the FIFO's flags; the other member functions of a stream: hoisted before (or said). */
  member(e, g) {
    const op = this.fifoOp(e);
    if (op === null) return exprMethods.member.call(this, e, g);
    const f0 = this.slots.get(e.callee.e.name), f = f0.group ? this.slots.get(f0.group) : f0;
    // (a stream polled: the co-simulation's FIFO never empty nor full but when it is, core/c-cosim.js, #1823)
    if (op === 'empty' || op === 'full') f.polled = true;
    if (op === 'empty') return this.v(this.not(this.fifoIn(f, 'empty_n')), BOOL);
    if (op === 'full') return this.v(this.not(this.fifoIn(f, 'full_n')), BOOL);
    const n = f.port ?? f.name;
    this.error(e.loc, `'${n}.${op}()' is not supported here yet (a stream read or written as a statement of the top function, x = ${n}.read(); ${n}.write(v);)`);
    return null;
  },
  /** The streams' ports, driven by the states that access them: [{ name, dir, t, read, d, write }]. */
  fifoPorts(states) {
    const cs = this.g.add('reg', [], this.stateT, { port: { key: 'reg:ap_CS_fsm', name: 'ap_CS_fsm' } });
    const out = [];
    for (const f of this.slots.values()) {
      if (f.kind !== 'fifo' || f.group) continue;
      if (f.read && f.written) this.error(f.loc, `the stream '${f.port ?? f.name}' is read and written: a stream argument is one or the other (ap_fifo)`);
      let go = this.F, d = this.g.const(0, f.t);
      for (const st of states) {
        const a = st.fifo?.get(f.name);
        if (!a) continue;
        // (a state with another access that waits: none taken while it waits, #1919)
        // (a sub-module's call: its accesses are its own while the state waits for it, #1960)
        const ok = st.stall !== this.F && !a.free ? this.and(a.ok, this.not(st.stall)) : a.ok;
        // (ap_hs: a write's _ap_vld does not wait for its _ap_ack; it may answer it, #1901)
        const here = this.and(this.g.add('eq', [cs, this.g.const(st.id, this.stateT)], BOOL), f.hs && a.d !== undefined && !st.gate ? a.g : this.and(a.g, ok));
        go = this.or(go, here);
        if (a.d !== undefined) d = this.mux(this.g.add('eq', [cs, this.g.const(st.id, this.stateT)], BOOL), a.d, d, f.t);
      }
      out.push({ name: f.name, dir: f.written ? 'out' : 'in', t: f.t, go, d: f.written ? d : null, used: f.read || f.written, polled: !!f.polled, ...(f.ptr ? { ptr: f.ptr } : {}), ...(f.hs ? { hs: true } : {}), ...(f.port ? { port: f.port, fields: f.fields } : {}) });
    }
    return out;
  },
};
