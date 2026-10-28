// Silinx HLS (#1590): an hls::stream argument of a sequential module (core/c-fsmd.js): Vitis HLS's ap_fifo interface,
// a FIFO outside the module (first-word fall-through): read, <s>_dout, <s>_empty_n, <s>_read (the value taken in the
// cycle _read is 1); written, <s>_din, <s>_full_n, <s>_write. Each access a state of its own that waits while the FIFO
// is empty (a read) or full (a write); the value read kept in a register. s.empty() and s.full() read _empty_n and
// _full_n. Isomorphic ES module: no DOM and no Node APIs.
import { BOOL, typeOf } from './c-types.js';
import { exprMethods } from './c-dataflow-expr.js';

export const fifoMethods = {
  fifoSlot(pa) {
    const t = typeOf(pa.type.of);
    if (!t) this.error(pa.loc, `the stream '${pa.name}': a stream of integers`);
    return { kind: 'fifo', name: pa.name, t, read: false, written: false, reads: 0, loc: pa.loc };
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
  fifoIn(f, port) { const P = f.port ?? f.name; return this.g.add('in', [], port === 'dout' ? f.t : BOOL, { port: { key: `${P}_${port}`, name: `${P}_${port}`, param: P, suffix: `_${port}` } }); },
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
        const here = this.and(this.g.add('eq', [cs, this.g.const(st.id, this.stateT)], BOOL), this.and(a.g, a.ok));
        go = this.or(go, here);
        if (a.d !== undefined) d = this.mux(this.g.add('eq', [cs, this.g.const(st.id, this.stateT)], BOOL), a.d, d, f.t);
      }
      out.push({ name: f.name, dir: f.written ? 'out' : 'in', t: f.t, go, d: f.written ? d : null, used: f.read || f.written, polled: !!f.polled, ...(f.port ? { port: f.port, fields: f.fields } : {}) });
    }
    return out;
  },
};
