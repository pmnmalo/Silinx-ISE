// Silinx HLS (#1920): #pragma HLS ARRAY_PARTITION as several memories, as Vitis HLS makes them (UG1399): type=cyclic
// factor=N puts element k of the dimension in memory k % N, type=block factor=N its consecutive blocks of ceil(L / N) in
// a memory each, and type=complete of a dimension of an array of more (dim=2 of a[R][C]) one memory per value of that
// index. Each memory has its own port: an argument's are named d_0_address0, d_1_address0, …, and an inner one A_0, A_1, ….
// The array's slot says which memories it is ({ kind: 'mem', banks: [names] }, no memory itself). An access whose memory
// is known at synthesis (a constant index, or i * N + 3 cyclic factor=N) is an access of that memory, so that two of
// different memories can share a state; another drives the address of every memory and the enable of the one it selects
// by its index, the memory selected kept in a register for the value read the next cycle. A local array of MEM_MIN
// elements or fewer stays registers, as an array of that size always is. Isomorphic ES module: no DOM and no Node APIs.
import { BOOL, INT } from './c-types.js';
import { MEM_MIN } from './c-mem.js';

const clog2 = (n) => Math.max(1, (n - 1).toString(2).length);
const pow2 = (n) => (n & (n - 1)) === 0;
const num = (v, loc) => ({ kind: 'num', value: BigInt(v), text: String(v), loc });
const bin = (op, l, r, loc) => ({ kind: 'binary', op, l, r: num(r, loc), loc });
/** The residue modulo N of the index e, when it is one whatever its variables (i * N + 3), else null. */
function residue(e, N) {
  if (e.kind === 'paren') return residue(e.e, N);
  if (e.kind === 'num') return Number(e.value % BigInt(N));
  if (e.kind !== 'binary') return null;
  if (e.op === '+') { const a = residue(e.l, N), b = residue(e.r, N); return a === null || b === null ? null : (a + b) % N; }
  if (e.op === '*') {
    const a = residue(e.l, N), b = residue(e.r, N);
    return a === 0 || b === 0 ? 0 : a === null || b === null ? null : (a * b) % N;
  }
  return null;
}

export const partitionMethods = {
  /** The array's dimensions: an array of more, as core/c-flatten.js made it one. */
  partDims(v) { return v.type.flat ?? [this.arrayLength(v)]; },
  /** The ARRAY_PARTITION pragmas of the top, by array: only the first of an array is made. */
  partPragmas(body) {
    this.partPragma = new Map();
    const walk = (x) => {
      if (!x || typeof x !== 'object') return;
      if (Array.isArray(x)) { x.forEach(walk); return; }
      if (x.kind === 'pragma' && x.pragma.name === 'ARRAY_PARTITION' && x.pragma.args.variable) {
        const a = x.pragma.args;
        if (this.partPragma.has(a.variable)) this.warn(x.loc, `#pragma HLS ARRAY_PARTITION of '${a.variable}' again: ignored (one partition an array is made)`);
        else this.partPragma.set(a.variable, { ...a, loc: x.loc });
      }
      for (const [k, y] of Object.entries(x)) if (k !== 'loc' && k !== 'type' && k !== 'pragma') walk(y);
    };
    walk(body);
  },
  /** The pragma's type: complete if it names none. */
  partType(a) { return String(a.type || (a.block ? 'block' : a.cyclic ? 'cyclic' : 'complete')).toLowerCase(); },
  /** type=complete of every element (dim=0, or the dimension of an array of one): the elements registers. */
  partWhole(v) {
    const a = this.partPragma?.get(v.orig ?? v.name);
    if (!a || this.partType(a) !== 'complete') return false;
    return String(a.dim ?? 1) === '0' || this.partDims(v).length === 1;
  },
  /** How the array is partitioned as memories: { type, d (its dimension, from 0), N, size (a memory's elements of that
   *  dimension), ds }, else null (no pragma, or one ignored: said here or by core/c-pragma.js). */
  partOf(v, ext = false) {
    const a = this.partPragma?.get(v.orig ?? v.name);
    if (!a || this.partWhole(v) || v.type.kind !== 'array') return null;
    const type = this.partType(a), ds = this.partDims(v), dim = Number(a.dim ?? 1), factor = Number(a.factor);
    if (!Number.isInteger(dim) || dim < 1) return null;   // (dim=0 of block or cyclic: said by core/c-pragma.js)
    if (dim > ds.length) { this.warn(a.loc, `#pragma HLS ARRAY_PARTITION dim=${a.dim}: '${v.name}' has ${ds.length} dimension${ds.length > 1 ? 's' : ''}: ignored`); return null; }
    if (!ext && ds.reduce((x, y) => x * y, 1) <= MEM_MIN) return null;
    const L = ds[dim - 1];
    if (type !== 'complete' && !(Number.isInteger(factor) && factor >= 1)) return null;   // (said by core/c-pragma.js)
    const N = type === 'complete' ? L : Math.min(factor, L);
    return N > 1 ? { type, d: dim - 1, N, size: type === 'complete' ? 1 : Math.ceil(L / N), ds } : null;
  },
  /** The array's memories, a slot each, and the slot naming them; each memory's words: the array's element (flat) at
   *  each of its addresses, null where it has none (a memory as deep as the largest). */
  bankSlot(v, plan, { ext = false, used = () => false } = {}) {
    const { d, N, size, ds, type } = plan;
    const inner = ds.map((x, k) => (k === d ? size : x));
    const n = inner.reduce((a, b) => a * b, 1);
    const words = Array.from({ length: N }, () => new Array(n).fill(null));
    const total = ds.reduce((a, b) => a * b, 1);
    for (let f = 0; f < total; f++) {
      const idx = [];
      for (let k = ds.length - 1, r = f; k >= 0; k--) { idx[k] = r % ds[k]; r = Math.floor(r / ds[k]); }
      const x = idx[d];
      const [bank, at] = type === 'cyclic' ? [x % N, Math.floor(x / N)] : type === 'block' ? [Math.floor(x / size), x % size] : [x, 0];
      words[bank][idx.reduce((acc, y, k) => acc * inner[k] + (k === d ? at : y), 0)] = f;
    }
    const banks = [];
    for (let k = 0; k < N; k++) {
      // (a name taken: d_01, d_02, …, as Vitis HLS 2025.2 names it, #2348)
      let name = `${v.name}_${k}`;
      for (let c = 1; used(name); c++) name = `${v.name}_${k}${c}`;
      const init = v.init?.kind === 'init' ? { ...v.init, items: words[k].map((f) => (f !== null && v.init.items[f]) || num(0, v.loc)) } : v.init;
      const mem = this.memSlot({ ...v, name, type: { kind: 'array', of: v.type.of, length: n }, init }, { ext });
      mem.part = { of: v.name, words: words[k] };
      this.slots.set(name, ext ? this.bramOf(mem, v.name) : mem);
      banks.push(name);
    }
    return { kind: 'mem', name: v.name, banks, plan, t: this.slots.get(banks[0]).t, rom: !!v.const, reads: 0, loc: v.loc };
  },
  /** An access of the array: { bank (its memory, known at synthesis) or sel (the index selecting it), addr }. */
  bankAt(e, mem) {
    const { type, d, N, size, ds } = mem.plan;
    const idx = e.idx ?? [e.i];
    if (idx.some((x) => this.hasSide(x))) this.error(e.loc, `the index of the memory '${mem.name}' must have no side effect (no ++, --, assignment or call)`);
    const x = idx[d], loc = e.loc, by = type === 'cyclic' ? N : size;
    const sel = type === 'complete' ? x : type === 'cyclic'
      ? (pow2(N) ? bin('&', x, N - 1, loc) : bin('%', x, N, loc))
      : (pow2(size) ? bin('>>', x, Math.log2(size), loc) : bin('/', x, size, loc));
    const rest = type === 'complete' ? null : type === 'cyclic'
      ? (pow2(by) ? bin('>>', x, Math.log2(by), loc) : bin('/', x, by, loc))
      : (pow2(by) ? bin('&', x, by - 1, loc) : bin('%', x, by, loc));
    let addr = null;
    ds.forEach((len, k) => {
      const it = k === d ? rest : idx[k];
      const dimLen = k === d ? size : len;
      if (addr === null) addr = it ?? num(0, loc);
      else addr = { kind: 'binary', op: '+', l: bin('*', addr, dimLen, loc), r: it ?? num(0, loc), loc };
    });
    let bank = type === 'cyclic' ? residue(x, N) : null;
    if (bank === null) { const c = this.constOf(sel, INT); if (c !== null && c !== undefined) bank = Number(c); }
    return { bank, sel, addr };
  },
  /** The access e of the memory it is known to be in, else null. */
  bankPlain(e, mem) {
    const { bank, addr } = this.bankAt(e, mem);
    if (bank === null) return null;
    if (bank >= mem.banks.length || bank < 0) this.error(e.loc, `the index of '${mem.name}' is outside it`);
    return { kind: 'index', e: { kind: 'id', name: mem.banks[bank], loc: e.loc }, i: addr, loc: e.loc };
  },
  /** A read of the memory its index selects: its state, then the state with the value read. */
  hoistBanks(e, mem, at) {
    const { sel, addr } = this.bankAt(e, mem);
    const i = this.hoist(addr, at), s = this.hoist(sel, at);
    const tmp = `ap_mem_${mem.name}_${mem.reads}`, selTmp = `ap_sel_${mem.name}_${mem.reads++}`;
    const T = { w: clog2(mem.banks.length), s: false };
    this.slots.set(tmp, { kind: 'var', t: mem.t, reg: this.reg(tmp, mem.t), name: tmp });
    this.slots.set(selTmp, { kind: 'var', t: T, reg: this.reg(selTmp, T), name: selTmp });
    for (const b of mem.banks) this.slots.get(b).read = true;
    if (mem.banks.some((b) => at.cur.acc?.has(b))) at.next();
    at.cur.stmts.push({ kind: 'memread', mem: mem.name, i, sel: s, selTmp, loc: e.loc });
    at.cur.acc = new Set([...(at.cur.acc || []), ...mem.banks]);
    at.next();
    at.cur.stmts.push({ kind: 'memlatch', mem: mem.name, tmp, selTmp, loc: e.loc });
    return { kind: 'id', name: tmp, loc: e.loc };
  },
  /** A write of the memory its index selects: a state. */
  lowerBankWrite(target, mem, rhs, e, at) {
    const { sel, addr } = this.bankAt(target, mem);
    const i = this.hoist(addr, at), s = this.hoist(sel, at), v = this.hoist(rhs, at);
    if (mem.banks.some((b) => at.cur.acc?.has(b))) at.next();
    at.cur.stmts.push({ kind: 'memwrite', mem: mem.name, i, sel: s, v, loc: e.loc });
    at.cur.acc = new Set([...(at.cur.acc || []), ...mem.banks]);
    for (const b of mem.banks) this.slots.get(b).written = true;
    return at.cur;
  },
  /** In a state: every memory's address, the enable of the one selected; the value read, from the one selected. */
  bankStmt(s, mem, base) {
    const g = this.guard(base);
    const T = { w: clog2(mem.banks.length), s: false };
    const is = (v, k) => this.g.add('eq', [v, this.g.const(k, T)], BOOL);
    if (s.kind === 'memlatch') {
      const v = this.conv(this.expr({ kind: 'id', name: s.selTmp, loc: s.loc }, g), T).id;
      let q = this.memQ(this.slots.get(mem.banks[0]));
      mem.banks.forEach((b, k) => { if (k) q = this.mux(is(v, k), this.memQ(this.slots.get(b)), q, mem.t); });
      this.slots.get(s.tmp).val = q;
      return;
    }
    const sel = this.conv(this.expr(s.sel, g), T).id;
    if (s.selTmp) { const st = this.slots.get(s.selTmp); st.val = this.mux(g, sel, st.val, T); }
    const d = s.kind === 'memwrite' ? this.conv(this.expr(s.v, g), mem.t).id : null;
    mem.banks.forEach((b, k) => {
      const m = this.slots.get(b);
      const here = this.and(g, is(sel, k));
      this.access.set(b, { addr: this.conv(this.expr(s.i, g), { w: m.aw, s: false }).id, ce: here, we: d === null ? this.F : here, d });
    });
  },
};
