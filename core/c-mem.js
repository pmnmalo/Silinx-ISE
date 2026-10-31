// Silinx HLS (#1527): the memories of a sequential module (core/c-fsmd.js). An array argument is a memory outside the
// module, Vitis HLS's ap_memory interface (<arg>_address0, _ce0, _we0, _d0, _q0: one port, a read's value on _q0 the
// cycle after its address); a local, static or constant array of more than MEM_MIN elements is a memory inside the
// module with the same port, a block RAM's (its contents its initial values: a ROM when it is never written).
// Each access takes a state of its own: a statement reading a memory is cut into a state per read (its address
// driven) and the statement's own state (the values read, kept in registers ap_r_ap_mem_<n>); a write is a
// statement of its own (a[i] = v; a[i] += v; a[i]++). An array argument with #pragma HLS INTERFACE bram has Vitis HLS's
// BRAM port instead (#1668): <arg>_Addr_A (an address in bytes, 32 bits), _EN_A, _WEN_A (a write enable a byte), _Din_A,
// _Dout_A (its words whole bytes, a power of 2 of them), _Clk_A and _Rst_A (the module's).
// Isomorphic ES module: no DOM and no Node APIs.
import { BOOL, INT, typeOf } from './c-types.js';

export const MEM_MIN = 64;   // a local array of more elements than this is a memory (fewer: registers)

const clog2 = (n) => Math.max(1, (n - 1).toString(2).length);
const U = (w) => ({ w, s: false });
const SIDE = new Set(['assign', 'postfix', 'call']);

export const memMethods = {
  /** A memory: { kind: 'mem', name, t, n, aw, ext, init: [BigInt] | null, rom, static, read, written, acc }. */
  memSlot(v, { ext = false } = {}) {
    const t = v.type;
    if (t.of.kind === 'array') this.error(v.loc, `'${v.name}': an array of arrays as a memory is not supported yet: one dimension`);
    const et = typeOf(t.of);
    if (!et) this.error(v.loc, `'${v.name}': only arrays of integers are supported`);
    const n = t.length ?? (v.init?.kind === 'init' ? v.init.items.length : null);
    if (!n) this.error(v.loc, ext ? `the array argument '${v.name}' needs its size (the memory's depth): ${v.name}[N]` : `'${v.name}': an array needs its size`);
    let init = null;
    if (v.init) {
      if (v.init.kind !== 'init') this.error(v.loc, `'${v.name}': an array is initialized with { … }`);
      init = v.init.items.map((x) => { const c = this.constOf(x, et); if (c === null) this.error(x.loc || v.loc, `'${v.name}': a memory's initial values must be constants`); return c; });
    }
    // (a static or a global with no initial values: zeros, as C)
    if (!init && !ext && v.static) init = [];
    return { kind: 'mem', name: v.name, t: et, n: Number(n), aw: clog2(Number(n)), ext, init, rom: !!v.const, static: !!v.static, read: false, written: false, loc: v.loc, reads: 0 };
  },
  isMem(e) { return e?.kind === 'index' && e.e.kind === 'id' && this.slots.get(e.e.name)?.kind === 'mem'; },
  hasMem(x) {
    let hit = false;
    const w = (n) => {
      if (!n || typeof n !== 'object' || hit) return;
      if (Array.isArray(n)) { n.forEach(w); return; }
      if (this.isMem(n) || (n.kind === 'id' && this.slots.get(n.name)?.kind === 'mem') || this.fifoOp?.(n) != null) { hit = true; return; }
      for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type') w(v);
    };
    w(x);
    return hit;
  },
  hasSide(x) {
    let hit = false;
    const w = (n) => {
      if (!n || typeof n !== 'object' || hit) return;
      if (Array.isArray(n)) { n.forEach(w); return; }
      // (a stream's access is the access itself, not a side effect beside it)
      if ((SIDE.has(n.kind) && this.fifoOp?.(n) == null) || (n.kind === 'unary' && (n.op === '++' || n.op === '--'))) { hit = true; return; }
      for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type') w(v);
    };
    w(x);
    return hit;
  },

  /** The reads of memories in e moved before it: each a state driving its address, its value then in a register;
   *  e with each read a variable. `at` is the block (the cursor, its successors made by mk). */
  hoist(e, at) {
    if (!e || typeof e !== 'object') return e;
    if (Array.isArray(e)) return e.map((x) => this.hoist(x, at));
    // (a stream's read: a state of its own, core/c-fifo.js; its empty() / full(): as they are)
    const fop = this.fifoOp?.(e);
    if (fop === 'read') return this.hoistFifoRead(e, at);
    if (fop === 'empty' || fop === 'full') return e;
    if (this.isMem(e)) {
      const mem = this.slots.get(e.e.name);
      if (mem.banks) { const one = this.bankPlain(e, mem); return one ? this.hoist(one, at) : this.hoistBanks(e, mem, at); }   // (partitioned, #1920)
      if (mem.group) return this.hoistField(e, mem, at);   // (a member of an array of structs: its word's field, #1668)
      const i = this.hoist(e.i, at);
      if (this.hasSide(i)) this.error(e.loc, `the index of the memory '${mem.name}' must have no side effect (no ++, --, assignment or call)`);
      const tmp = `ap_mem_${mem.name}_${mem.reads++}`;
      this.slots.set(tmp, { kind: 'var', t: mem.t, reg: this.reg(tmp, mem.t), name: tmp });
      mem.read = true;
      if (at.cur.acc?.has(mem.name)) at.next();
      at.cur.stmts.push({ kind: 'memread', mem: mem.name, i, loc: e.loc });
      (at.cur.acc ||= new Set()).add(mem.name);
      at.next();
      at.cur.stmts.push({ kind: 'memlatch', mem: mem.name, tmp, loc: e.loc });
      return { kind: 'id', name: tmp, loc: e.loc };
    }
    if (e.kind === 'id' && this.slots.get(e.name)?.kind === 'mem') this.error(e.loc, `the memory '${e.name}' can only be indexed here (${e.name}[i]): it cannot be passed to a function`);
    const out = {};
    for (const [k, v] of Object.entries(e)) out[k] = k === 'loc' || k === 'type' ? v : this.hoist(v, at);
    return out;
  },
  /** A memory named but not indexed (passed to a function): an error. */
  bareMem(x) {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) { x.forEach((y) => this.bareMem(y)); return; }
    if (this.isMem(x)) { this.bareMem(x.i); return; }
    if (x.kind === 'id' && this.slots.get(x.name)?.kind === 'mem') this.error(x.loc, `the memory '${x.name}' can only be indexed here (${x.name}[i]): it cannot be passed to a function`);
    for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') this.bareMem(v);
  },
  /** A statement with no loop that accesses a memory, into the blocks after `cur`; returns the last block. */
  lowerMem(s, cur, mk, lp) {
    this.bareMem(s);
    const at = { cur, next: () => { const nb = mk(lp); at.cur.term = { goto: nb }; at.cur = nb; } };
    if (s.kind === 'expr') {
      let e = s.e;
      // (a stream: s.write(v); s.read(x); is x = s.read();)
      if (this.fifoOp?.(e) === 'write') return this.lowerFifoWrite(e, at);
      if (this.fifoOp?.(e) === 'read' && e.args.length === 1) e = { kind: 'assign', op: '=', l: e.args[0], r: { ...e, args: [] }, loc: e.loc };
      const target = e.kind === 'assign' ? e.l : (e.kind === 'postfix' || (e.kind === 'unary' && (e.op === '++' || e.op === '--'))) ? e.e : null;
      if (target && this.isMem(target)) {
        const whole = target;
        const parted = this.slots.get(target.e.name);
        // (partitioned, #1920: the memory it is in, if known)
        const plain = parted.banks ? this.bankPlain(target, parted) : null;
        const mem = plain ? this.slots.get(plain.e.name) : parted;
        if (mem.rom) this.error(target.loc, `'${mem.name}' is constant: it cannot be written`);
        const one = { kind: 'num', value: 1n, text: '1', loc: e.loc };
        const rhs = e.kind === 'assign' ? (e.op === '=' ? e.r : { kind: 'binary', op: e.op.slice(0, -1), l: whole, r: e.r, loc: e.loc }) : { kind: 'binary', op: e.op === '++' ? '+' : '-', l: whole, r: one, loc: e.loc };
        if (mem.banks) { if (this.hasSide(rhs)) this.error(e.loc, `a write of the memory '${mem.name}' with another side effect in it (++, --, an assignment, a call): write them as statements of their own`); return this.lowerBankWrite(whole, mem, rhs, e, at); }
        const tgt = plain ?? whole;
        if (this.hasSide(tgt.i) || this.hasSide(rhs)) this.error(e.loc, `a write of the memory '${mem.name}' with another side effect in it (++, --, an assignment, a call): write them as statements of their own`);
        if (mem.group) return this.lowerFieldWrite(target, rhs, e, at);
        const i = this.hoist(tgt.i, at), v = this.hoist(rhs, at);
        if (at.cur.acc?.has(mem.name)) at.next();
        at.cur.stmts.push({ kind: 'memwrite', mem: mem.name, i, v, loc: e.loc });
        (at.cur.acc ||= new Set()).add(mem.name);
        mem.written = true;
        return at.cur;
      }
      const inner = target ? (e.kind === 'assign' ? e.r : null) : e;
      if (inner && this.hasSide(inner) && this.hasMem(inner)) this.error(e.loc, 'a statement reading a memory with another side effect in it (++, --, an assignment, a call): write them as statements of their own');
      const he = this.hoist(e, at);   // (first: it moves at.cur)
      at.cur.stmts.push({ ...s, e: he });
      return at.cur;
    }
    if (s.kind === 'decl') {
      for (const v of s.vars) if (v.init && this.hasSide(v.init) && this.hasMem(v.init)) this.error(v.loc, 'a declaration reading a memory with another side effect in it (++, --, an assignment, a call): write them as statements of their own');
      const vars = s.vars.map((v) => ({ ...v, init: v.init ? this.hoist(v.init, at) : v.init }));
      at.cur.stmts.push({ ...s, vars });
      return at.cur;
    }
    if (s.kind === 'return') {
      if (s.e && this.hasSide(s.e)) this.error(s.loc, 'a return reading a memory with another side effect in it (++, --, an assignment, a call): write them as statements of their own');
      const he = s.e ? this.hoist(s.e, at) : s.e;
      at.cur.stmts.push({ ...s, e: he });
      return at.cur;
    }
    this.error(s.loc, `a '${s.kind}' that accesses a memory is not supported yet in a sequential module (write the access as a statement of its own before it)`);
    return cur;
  },
  /** A condition (an if's, a loop's) reading a memory: its reads in the blocks after at.cur. */
  hoistCond(e, cur, mk, lp) {
    if (!this.hasMem(e)) return { e, cur };
    this.bareMem(e);
    if (this.hasSide(e)) this.error(e.loc, 'a condition reading a memory with a side effect in it (++, --, an assignment, a call): write them as statements of their own');
    const at = { cur, next: () => { const nb = mk(lp); at.cur.term = { goto: nb }; at.cur = nb; } };
    const r = this.hoist(e, at);
    return { e: r, cur: at.cur };
  },

  // ------------------------------------------------------------------ run in a state
  memStmt(s, base) {
    const mem = this.slots.get(s.mem);
    if (mem.banks) { this.bankStmt(s, mem, base); return; }
    const g = this.guard(base);
    const at = { w: mem.aw, s: false };
    if (s.kind === 'memlatch') { this.slots.get(s.tmp).val = this.memQ(mem); return; }
    const addr = this.conv(this.expr(s.i, g), at).id;
    const acc = { addr, ce: g, we: this.F, d: null };
    if (s.kind === 'memwrite') { acc.we = g; acc.d = this.conv(this.expr(s.v, g), mem.t).id; }
    this.access.set(mem.name, acc);
  },
  memQ(mem) {
    const P = mem.port ?? mem.name;   // (a memory of structs': the struct's name, #1668)
    if (mem.bram) {
      const q = this.g.add('in', [], U(mem.bram.w), { port: { key: `${P}_Dout_A`, name: `${P}_Dout_A`, param: P, suffix: '_Dout_A' } });
      return this.g.add('ext', [this.g.add('slice', [q], U(mem.t.w), { hi: mem.t.w - 1, lo: 0 })], mem.t);
    }
    const port = mem.ext ? { key: `${P}_q0`, name: `${P}_q0`, param: P, suffix: '_q0' } : { key: `mem:${mem.name}`, name: `ap_m_${mem.name}_q0` };
    return this.g.add(mem.ext ? 'in' : 'reg', [], mem.t, { port });
  },
  /** An array argument with #pragma HLS INTERFACE bram (its parameter's, or its struct's first member's): its BRAM's
   *  words, whole bytes, a power of 2 of them. */
  bramOf(mem, param) {
    if (this.modes?.get(param) !== 'bram') return mem;
    let bytes = 1;
    while (bytes * 8 < mem.t.w) bytes *= 2;
    return Object.assign(mem, { bram: { bytes, w: bytes * 8, shift: Math.log2(bytes) } });
  },
  /** A memory argument's ports, named by P: ap_memory's (the address and its enable, the write's enable and data, the
   *  value read) or a BRAM's (bramOf). */
  memIface(P, mem, ports, outputs) {
    const p = (sfx, dir, w, out) => { ports.push({ name: `${P}${sfx}`, dir, w, s: false, role: 'mem', param: P }); if (out) outputs.set(`${P}${sfx}`, out); };
    if (!mem.bram) {
      p('_address0', 'out', mem.aw, { node: mem.addr });
      p('_ce0', 'out', 1, { node: mem.ce });
      if (mem.written) { p('_we0', 'out', 1, { node: mem.we }); p('_d0', 'out', mem.t.w, { node: mem.d }); }
      if (mem.read) p('_q0', 'in', mem.t.w, null);
      return;
    }
    const { bytes, w, shift } = mem.bram, A = U(32), WE = U(bytes), D = U(w);
    const addr = this.g.add('ext', [mem.addr], A);
    p('_Addr_A', 'out', 32, { node: shift ? this.g.add('shl', [addr, this.g.const(shift, INT)], A) : addr });
    p('_EN_A', 'out', 1, { node: mem.ce });
    // (a word written whole: every byte's enable)
    p('_WEN_A', 'out', bytes, { node: mem.written ? this.mux(mem.we, this.g.const((1n << BigInt(bytes)) - 1n, WE), this.g.const(0, WE), WE) : this.g.const(0, WE) });
    p('_Din_A', 'out', w, { node: mem.written ? this.g.add('ext', [this.g.add('slice', [mem.d], U(mem.t.w), { hi: mem.t.w - 1, lo: 0 })], D) : this.g.const(0, D) });
    p('_Dout_A', 'in', w, null);
    p('_Clk_A', 'out', 1, { wire: 'ap_clk' });
    p('_Rst_A', 'out', 1, { wire: 'ap_rst' });
  },
  /** The memories' ports and signals, driven by the states that access them: { ext: [port], mems: [internal] }. */
  memPorts(states) {
    const cs = this.g.add('reg', [], this.stateT, { port: { key: 'reg:ap_CS_fsm', name: 'ap_CS_fsm' } });
    const mems = [];
    for (const mem of this.slots.values()) {
      if (mem.kind !== 'mem' || mem.group || mem.banks) continue;   // (a member of a memory of structs: its group's, #1668)
      if (!mem.ext && !mem.static && !mem.rom && mem.init && mem.written) this.error(mem.loc, `'${mem.name}': a memory initialized with { … } and written: make it static (its values kept between calls) or const, or initialize it with a loop`);
      const at = { w: mem.aw, s: false };
      let addr = this.g.const(0, at), ce = this.F, we = this.F, d = this.g.const(0, mem.t);
      for (const st of states) {
        const a = st.access.get(mem.name);
        if (!a) continue;
        const here = this.g.add('eq', [cs, this.g.const(st.id, this.stateT)], BOOL);
        addr = this.mux(here, a.addr, addr, at);
        // (a state that waits for a stream: no access while it waits, the value read before it kept on q0, #1919)
        const go = st.stall !== this.F ? this.and(here, this.not(st.stall)) : here;
        ce = this.or(ce, this.and(go, a.ce));
        if (a.d !== null) { we = this.or(we, this.and(go, a.we)); d = this.mux(here, a.d, d, mem.t); }
      }
      mems.push({ ...mem, addr, ce, we: mem.written ? we : null, d: mem.written ? d : null });
    }
    return mems;
  },
};
