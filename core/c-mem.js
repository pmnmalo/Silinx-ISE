// Silinx HLS (#1527): the memories of a sequential module (core/c-fsmd.js). An array argument is a memory outside the
// module, Vitis HLS's ap_memory interface (<arg>_address0, _ce0, _we0, _d0, _q0: one port, a read's value on _q0 the
// cycle after its address); a local, static or constant array of more than MEM_MIN elements is a memory inside the
// module with the same port, a block RAM's (its contents its initial values: a ROM when it is never written).
// Each access takes a state of its own: a statement reading a memory is cut into a state per read (its address
// driven) and the statement's own state (the values read, kept in registers ap_r_ap_mem_<n>); a write is a
// statement of its own (a[i] = v; a[i] += v; a[i]++). An array argument with #pragma HLS INTERFACE bram has Vitis HLS's
// BRAM port instead (#1668): <arg>_Addr_A (an address in bytes, 32 bits), _EN_A, _WEN_A (a write enable a byte), _Din_A,
// _Dout_A (its words whole bytes, a power of 2 of them), _Clk_A and _Rst_A (the module's).
// Two ports (#1901): BIND_STORAGE or an INTERFACE's storage_type= (ram_2p: _address0, _ce0, _q0 to read, _address1, _ce1,
// _we1, _d1 to write; ram_t2p: both ports both, as far as it is read and written), and a memory argument of a loop with
// UNROLL, as Vitis HLS's schedule asks for them. Two reads of a statement then share a state; two writes too when their
// addresses cannot be the same (a[i], a[i + 1]). What the states do not share leaves port 1 idle.
// Isomorphic ES module: no DOM and no Node APIs.
import { BOOL, INT, typeOf } from './c-types.js';
import { storageOf } from './c-pragma.js';

export const MEM_MIN = 64;   // a local array of more elements than this is a memory (fewer: registers)

const clog2 = (n) => Math.max(1, (n - 1).toString(2).length);
const U = (w) => ({ w, s: false });
const SIDE = new Set(['assign', 'postfix', 'call']);

/** An index as a variable and a constant: { base, k } (base null: a constant), or null. */
const offsetOf = (e) => {
  if (e.kind === 'num') return { base: null, k: e.value };
  if (e.kind === 'id') return { base: e.name, k: 0n };
  if (e.kind === 'binary' && (e.op === '+' || e.op === '-') && e.l.kind === 'id' && e.r.kind === 'num') return { base: e.l.name, k: e.op === '+' ? e.r.value : -e.r.value };
  return null;
};
const differ = (a, b) => { const x = offsetOf(a), y = offsetOf(b); return !!x && !!y && x.base === y.base && x.k !== y.k; };
const namesIn = (x, out = new Set()) => {
  if (!x || typeof x !== 'object') return out;
  if (Array.isArray(x)) { x.forEach((y) => namesIn(y, out)); return out; }
  if (x.kind === 'id') out.add(x.name);
  for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') namesIn(v, out);
  return out;
};

export const memMethods = {
  /** The memories asked for by name (#1901): Map name -> '1p' | '2p' | 't2p'; a memory argument of a loop with UNROLL
   *  (not factor=1) 't2p', when no pragma says. */
  memStorage(fn) {
    const out = new Map(), args = new Set(fn.params.filter((pa) => pa.type.kind === 'array').map((pa) => pa.name));
    const scan = (x, unrolled) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { for (const y of x) scan(y, unrolled); return; }
      if (x.kind === 'pragma') {
        const { name, args: a } = x.pragma, v = name === 'BIND_STORAGE' ? a.variable : name === 'INTERFACE' ? a.port : null;
        if (v && storageOf(x.pragma)) out.set(String(v), storageOf(x.pragma));
        return;
      }
      if (unrolled && x.kind === 'index' && x.e.kind === 'id' && args.has(x.e.name) && !out.has(x.e.name)) inferred.add(x.e.name);
      const items = x.body?.kind === 'block' ? x.body.items : null;
      const u = items?.find((s) => s?.kind === 'pragma' && s.pragma.name === 'UNROLL')?.pragma.args;
      for (const [k, y] of Object.entries(x)) if (k !== 'loc' && k !== 'type') scan(y, unrolled || (!!u && String(u.factor) !== '1'));
    };
    const inferred = new Set();
    scan(fn.body, false);
    for (const n of inferred) if (!out.has(n)) out.set(n, 't2p');
    return out;
  },
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
    const st = this.storage?.get(v.orig ?? v.name);
    return { kind: 'mem', name: v.name, t: et, n: Number(n), aw: clog2(Number(n)), ext, init, rom: !!v.const, static: !!v.static, read: false, written: false, loc: v.loc, reads: 0, ...(st === '2p' || st === 't2p' ? { storage: st } : {}) };
  },
  isMem(e) { return e?.kind === 'index' && e.e.kind === 'id' && this.slots.get(e.e.name)?.kind === 'mem'; },
  hasMem(x) {
    let hit = false;
    const w = (n) => {
      if (!n || typeof n !== 'object' || hit) return;
      if (Array.isArray(n)) { n.forEach(w); return; }
      if (this.isMem(n) || (n.kind === 'id' && this.slots.get(n.name)?.kind === 'mem') || this.fifoOp?.(n) != null || this.isBlackbox?.(n)) { hit = true; return; }
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
      if ((SIDE.has(n.kind) && this.fifoOp?.(n) == null && !this.isBlackbox?.(n)) || (n.kind === 'unary' && (n.op === '++' || n.op === '--'))) { hit = true; return; }
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
    if (this.isBlackbox?.(e)) return this.hoistBlackbox(e, at);   // (its registers and its state, #1903)
    if (this.isMem(e)) {
      const mem = this.slots.get(e.e.name);
      if (mem.banks) { const one = this.bankPlain(e, mem); return one ? this.hoist(one, at) : this.hoistBanks(e, mem, at); }   // (partitioned, #1920)
      if (mem.group) return this.hoistField(e, mem, at);   // (a member of an array of structs: its word's field, #1668)
      const i = this.hoist(e.i, at);
      if (this.hasSide(i)) this.error(e.loc, `the index of the memory '${mem.name}' must have no side effect (no ++, --, assignment or call)`);
      const tmp = `ap_mem_${mem.name}_${mem.reads++}`;
      this.slots.set(tmp, { kind: 'var', t: mem.t, reg: this.reg(tmp, mem.t), name: tmp });
      mem.read = true;
      // (ram_t2p: the state of the read just before, on port 1, if this address is known there, #1901)
      const from = this.secondRead(mem, i, at.cur);
      if (from) {
        from.stmts.push({ kind: 'memread', mem: mem.name, i, port: 1, loc: e.loc });
        at.cur.stmts.push({ kind: 'memlatch', mem: mem.name, tmp, port: 1, loc: e.loc });
        return { kind: 'id', name: tmp, loc: e.loc };
      }
      if (at.cur.acc?.has(mem.name)) at.next();
      const read = at.cur;
      at.cur.stmts.push({ kind: 'memread', mem: mem.name, i, loc: e.loc });
      (at.cur.acc ||= new Set()).add(mem.name);
      at.next();
      at.cur.stmts.push({ kind: 'memlatch', mem: mem.name, tmp, loc: e.loc });
      if (mem.storage === 't2p') (at.cur.readOf ||= new Map()).set(mem.name, read);
      return { kind: 'id', name: tmp, loc: e.loc };
    }
    if (e.kind === 'id' && this.slots.get(e.name)?.kind === 'mem') this.error(e.loc, `the memory '${e.name}' can only be indexed here (${e.name}[i]): it cannot be passed to a function`);
    const out = {};
    for (const [k, v] of Object.entries(e)) out[k] = k === 'loc' || k === 'type' ? v : this.hoist(v, at);
    return out;
  },
  /** The state of mem's read just before cur, where a second read of address i can go: cur only takes the values read
   *  so far (nothing it holds is known before it), that state has one access of mem. */
  secondRead(mem, i, cur) {
    const b = cur.readOf?.get(mem.name);
    if (!b || !cur.stmts.every((x) => x.kind === 'memlatch')) return null;
    if (b.stmts.filter((x) => x.mem === mem.name && (x.kind === 'memread' || x.kind === 'memwrite')).length !== 1) return null;
    const names = namesIn(i);
    return cur.stmts.some((x) => names.has(x.tmp)) ? null : b;
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
        // (ram_t2p: a second write in the state of the one just before, their addresses never the same, #1901)
        const prev = at.cur.stmts.at(-1);
        const second = mem.storage === 't2p' && prev?.kind === 'memwrite' && prev.mem === mem.name && !prev.port && differ(prev.i, i);
        if (at.cur.acc?.has(mem.name) && !second) at.next();
        at.cur.stmts.push({ kind: 'memwrite', mem: mem.name, i, v, loc: e.loc, ...(second || mem.storage === '2p' ? { port: 1 } : {}) });
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
    // (in a pipeline: the value of this read, found in its stage, core/c-pipe-sched.js)
    if (s.kind === 'memlatch' && this.piping) {
      const q = this.g.add('reg', [], mem.t, { port: { key: `pipeq:${s.tmp}`, name: `ap_q_${s.tmp}` } });
      this.piping.qs.set(s.port ? `${mem.name}#1` : mem.name, q);
      this.slots.get(s.tmp).val = q;
      return;
    }
    if (s.kind === 'memlatch') { this.slots.get(s.tmp).val = this.memQ(mem, s.port); return; }
    const addr = this.conv(this.expr(s.i, g), at).id;
    const acc = { addr, ce: g, we: this.F, d: null };
    if (s.kind === 'memwrite') { acc.we = g; acc.d = this.conv(this.expr(s.v, g), mem.t).id; }
    // (ram_2p: its writes on port 1, whatever made them, a pipeline's too, #1901)
    this.access.set(s.port || (s.kind === 'memwrite' && mem.storage === '2p') ? `${mem.name}#1` : mem.name, acc);
  },
  memQ(mem, k = 0) {
    const P = mem.port ?? mem.name;   // (a memory of structs': the struct's name, #1668)
    if (mem.bram) {
      const q = this.g.add('in', [], U(mem.bram.w), { port: { key: `${P}_Dout_A`, name: `${P}_Dout_A`, param: P, suffix: '_Dout_A' } });
      return this.g.add('ext', [this.g.add('slice', [q], U(mem.t.w), { hi: mem.t.w - 1, lo: 0 })], mem.t);
    }
    const port = mem.ext ? { key: `${P}_q${k}`, name: `${P}_q${k}`, param: P, suffix: `_q${k}` } : { key: k ? `mem:${mem.name}#1` : `mem:${mem.name}`, name: `ap_m_${mem.name}_q${k}` };
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
    if (mem.storage) {
      // (ram_2p: port 0 reads, port 1 writes; ram_t2p: both, as far as it is read and written)
      if (mem.read || mem.storage === 't2p') {
        p('_address0', 'out', mem.aw, { node: mem.addr });
        p('_ce0', 'out', 1, { node: mem.ce });
        if (mem.storage === 't2p' && mem.written) { p('_we0', 'out', 1, { node: mem.we }); p('_d0', 'out', mem.t.w, { node: mem.d }); }
        if (mem.read) p('_q0', 'in', mem.t.w, null);
      }
      if (mem.written || mem.storage === 't2p') {
        p('_address1', 'out', mem.aw, { node: mem.addr1 });
        p('_ce1', 'out', 1, { node: mem.ce1 });
        if (mem.written) { p('_we1', 'out', 1, { node: mem.we1 }); p('_d1', 'out', mem.t.w, { node: mem.d1 }); }
        if (mem.storage === 't2p' && mem.read) p('_q1', 'in', mem.t.w, null);
      }
      return;
    }
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
      const drive = (key) => {
        let addr = this.g.const(0, at), ce = this.F, we = this.F, d = this.g.const(0, mem.t);
        for (const st of states) {
          const a = st.access.get(key);
          if (!a) continue;
          const here = this.g.add('eq', [cs, this.g.const(st.id, this.stateT)], BOOL);
          addr = this.mux(here, a.addr, addr, at);
          // (a state that waits for a stream: no access while it waits, the value read before it kept on q0, #1919)
          // (a sub-module's call: its accesses are its own while the state waits for it, core/c-submodule.js, #1960)
          const go = st.stall !== this.F && !a.free ? this.and(here, this.not(st.stall)) : here;
          ce = this.or(ce, this.and(go, a.ce));
          if (a.d !== null) { we = this.or(we, this.and(go, a.we)); d = this.mux(here, a.d, d, mem.t); }
        }
        return { addr, ce, we: mem.written ? we : null, d: mem.written ? d : null };
      };
      const p0 = drive(mem.name);
      if (!mem.storage) { mems.push({ ...mem, ...p0 }); continue; }
      const p1 = drive(`${mem.name}#1`);
      mems.push({ ...mem, ...p0, ...(mem.storage === '2p' ? { we: null, d: null } : {}), addr1: p1.addr, ce1: p1.ce, we1: p1.we, d1: p1.d });
    }
    return mems;
  },
};
