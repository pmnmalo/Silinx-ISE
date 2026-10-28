// Silinx HLS (#1668): a stream of structs and an array of structs of the top function as Vitis HLS makes them, one
// ap_fifo / one ap_memory of words (core/c-aggregate.js's wordGroups: the members packed, the first at the LSB), in a
// sequential module (core/c-fsmd.js). Its members stay streams and memories in the C (core/c-struct.js's); each access
// of one is a field of a word:
//   a stream: a struct read is one word read (its first member's read takes the word, the others' its fields); a struct
//   written, one word written (its members' writes its fields, its last member's the word);
//   a memory: an element's word read once (a register holds it, its members' reads its fields) while its index and the
//   memory do not change; its members written into that register, the word written whole once the statements writing
//   it end (before a statement that changes its index, reads another element of the memory, calls, branches or loops),
//   read first when some of its fields were not written (read-modify-write).
// Isomorphic ES module: no DOM and no Node APIs.
import { BOOL, INT, typeOf } from './c-types.js';

const clog2 = (n) => Math.max(1, (n - 1).toString(2).length);
const U = (w) => ({ w, s: false });
const keyOf = (e) => JSON.stringify(e, (k, v) => (k === 'loc' || k === 'type' ? undefined : typeof v === 'bigint' ? `${v}n` : v));
const ones = (w) => (1n << BigInt(w)) - 1n;
/** A field's bits in the word, its element `j` (a member array's). */
const fieldMask = (f, j) => ones(f.w) << BigInt(f.off + j * f.size);

/** The names of the variables an expression reads. */
function idsOf(e, out = new Set()) {
  if (!e || typeof e !== 'object') return out;
  if (Array.isArray(e)) { e.forEach((x) => idsOf(x, out)); return out; }
  if (e.kind === 'id') out.add(e.name);
  for (const [k, v] of Object.entries(e)) if (k !== 'loc' && k !== 'type') idsOf(v, out);
  return out;
}
/** The variable an assignment's target changes (a[i], p->m, *p: a, p). */
const base = (e) => (!e ? null : e.kind === 'id' ? e.name : base(e.e ?? e.l ?? null));

export const wordMethods = {
  /** The groups' slots: a stream's or a memory's of words, `ap_w_<struct>`, and each member's (wordOf). */
  wordSlots(groups) {
    this.wordOf = new Map();
    this.words = new Map();       // memory -> { key, i, vars, reg, valid, mask, dirty }: the word of an element held
    this.fifoWords = new Map();   // stream (#r, #w) -> { reg, taken }: the word a struct read or written is in
    for (const gr of groups) {
      const name = `ap_w_${gr.name}`, t = U(gr.w);
      const full = gr.fields.reduce((m, f) => { for (let j = 0; j < f.k; j++) m |= fieldMask(f, j); return m; }, 0n);
      const G = gr.kind === 'fifo'
        ? { kind: 'fifo', name, port: gr.name, t, read: false, written: false, reads: 0, fields: gr.fields }
        : { kind: 'mem', name, port: gr.name, t, n: gr.n, aw: clog2(gr.n), ext: true, init: null, rom: false, static: false, read: false, written: false, reads: 0, fields: gr.fields, full };
      if (G.kind === 'mem') this.bramOf(G, gr.fields[0].param);
      this.slots.set(name, G);
      gr.fields.forEach((field, index) => this.wordOf.set(field.param, { G: name, field, index, last: index === gr.fields.length - 1 }));
    }
  },
  /** A member's slot: a stream or a memory of its own in the C, its accesses its group's. */
  fieldSlot(pa) {
    const { G, field, index, last } = this.wordOf.get(pa.name);
    const G0 = this.slots.get(G);
    G0.loc ||= pa.loc;
    const et = pa.type.of ?? pa.type.to;   // (a pointer to structs': a member never used, a pointer)
    return { kind: G0.kind, name: pa.name, group: G, field, index, last, t: typeOf(et), n: Number(pa.type.length ?? 0), ext: true, rom: !!et?.const, read: false, written: false, reads: 0, loc: pa.loc };
  },
  wordReg(G) {
    const name = `ap_w_${G.port}_${G.reads++}`;
    this.slots.set(name, { kind: 'var', t: G.t, reg: this.reg(name, G.t), name });
    return name;
  },
  memberTmp(f) {
    const name = `ap_mem_${f.name}_${f.reads++}`;
    this.slots.set(name, { kind: 'var', t: f.t, reg: this.reg(name, f.t), name });
    return name;
  },
  /** A member's index: its word's and its element in the word (a member array's: the index c-struct.js makes,
   *  (i) * (k) + (j), or i / k and i % k). */
  wordIndex(i, k) {
    if (k === 1) return { word: i, sub: null, at: 0 };
    const num = (v) => ({ kind: 'num', value: BigInt(v), text: String(v), loc: i.loc });
    let word, sub;
    if (i.kind === 'binary' && i.op === '+' && i.l.kind === 'binary' && i.l.op === '*' && this.constOf(i.l.r, INT) === BigInt(k)) { word = i.l.l; sub = i.r; }
    else { word = { kind: 'binary', op: '/', l: i, r: num(k), loc: i.loc }; sub = { kind: 'binary', op: '%', l: i, r: num(k), loc: i.loc }; }
    const c = this.constOf(sub, INT);
    return { word, sub, at: c === null ? null : Number(c) };
  },

  // ------------------------------------------------------------------ a memory's words
  /** The held word of the element `word` of G (another element's written and forgotten first); `need`: the bits it
   *  must hold (null: all of them; undefined: none, a write's). */
  wordAt(G, word, at, need) {
    const key = keyOf(word);
    let ent = this.words.get(G.name);
    if (ent && ent.key !== key) { this.flushWord(G, ent, at); this.words.delete(G.name); ent = null; }
    if (!ent) { ent = { key, i: word, vars: idsOf(word), reg: this.wordReg(G), valid: false, mask: 0n, dirty: false, loc: word.loc }; this.words.set(G.name, ent); }
    if (need !== undefined && !ent.valid && (need === null || (need & ~ent.mask) !== 0n)) this.loadWord(G, ent, at);
    return ent;
  },
  /** The word read (a state driving its address, the next one taking it), the fields written so far kept. */
  loadWord(G, ent, at) {
    if (at.cur.acc?.has(G.name)) at.next();
    at.cur.stmts.push({ kind: 'memread', mem: G.name, i: ent.i, loc: ent.loc });
    (at.cur.acc ||= new Set()).add(G.name);
    G.read = true;
    at.next();
    at.cur.stmts.push({ kind: 'wordload', mem: G.name, reg: ent.reg, mask: ent.mask, loc: ent.loc });
    ent.valid = true;
  },
  /** A held word written, if it was (whole: read first when some of its fields were not written). */
  flushWord(G, ent, at) {
    if (!ent.dirty) return;
    if (!ent.valid && ent.mask !== G.full) this.loadWord(G, ent, at);
    if (at.cur.acc?.has(G.name)) at.next();
    at.cur.stmts.push({ kind: 'wordwrite', mem: G.name, i: ent.i, reg: ent.reg, loc: ent.loc });
    (at.cur.acc ||= new Set()).add(G.name);
    G.written = true;
    ent.dirty = false;
    ent.valid = true;
  },
  /** A member of a memory read: its field of the element's word. */
  hoistField(e, mem, at) {
    const G = this.slots.get(mem.group);
    const i = this.hoist(e.i, at);
    if (this.hasSide(i)) this.error(e.loc, `the index of the memory '${G.port}' must have no side effect (no ++, --, assignment or call)`);
    const w = this.wordIndex(i, mem.field.k);
    const ent = this.wordAt(G, w.word, at, w.at === null ? null : fieldMask(mem.field, w.at));
    const tmp = this.memberTmp(mem);
    at.cur.stmts.push({ kind: 'wordget', reg: ent.reg, tmp, field: mem.field, sub: w.sub, at: w.at, loc: e.loc });
    return { kind: 'id', name: tmp, loc: e.loc };
  },
  /** A member of a memory written (target = rhs;): its field of the element's word. */
  lowerFieldWrite(target, rhs, e, at) {
    const mem = this.slots.get(target.e.name), G = this.slots.get(mem.group);
    const i = this.hoist(target.i, at), v = this.hoist(rhs, at);
    const w = this.wordIndex(i, mem.field.k);
    const ent = this.wordAt(G, w.word, at, w.at === null ? null : undefined);
    at.cur.stmts.push({ kind: 'wordset', reg: ent.reg, field: mem.field, sub: w.sub, at: w.at, v, t: mem.t, loc: e.loc });
    ent.dirty = true;
    if (w.at !== null) ent.mask |= fieldMask(mem.field, w.at);
    return at.cur;
  },
  /** Before the statement s (null: any, a branch's, a loop's, a list's end): the held words it may change written and
   *  forgotten. Returns the block after them. */
  wordsBefore(s, cur, mk, lp) {
    if (!this.words?.size) return cur;
    const at = { cur, next: () => { const nb = mk(lp); at.cur.term = { goto: nb }; at.cur = nb; } };
    const ch = this.wordChanges(s);
    for (const [g, ent] of [...this.words]) {
      if (ch && ![...ent.vars].some((v) => ch.has(v))) continue;
      this.flushWord(this.slots.get(g), ent, at);
      this.words.delete(g);
    }
    return at.cur;
  },
  /** After the statement s (null: a branch, a loop): the words held at an index it changed forgotten. */
  wordsAfter(s) {
    if (!this.words?.size) return;
    const ch = this.wordChanges(s);
    for (const [g, ent] of [...this.words]) {
      if (ch && ![...ent.vars].some((v) => ch.has(v))) continue;
      if (ent.dirty) this.error(ent.loc, 'internal: a word of a memory of structs written and not stored');
      this.words.delete(g);
    }
  },
  /** The variables a statement (an expression's, a declaration's) changes; null: it may change any (a call, a jump). */
  wordChanges(s) {
    if (!s || (s.kind !== 'expr' && s.kind !== 'decl')) return null;
    const out = new Set();
    let any = false;
    const w = (x) => {
      if (!x || typeof x !== 'object' || any) return;
      if (Array.isArray(x)) { x.forEach(w); return; }
      if (x.kind === 'assign') out.add(base(x.l));
      if (x.kind === 'postfix' || (x.kind === 'unary' && (x.op === '++' || x.op === '--'))) out.add(base(x.e));
      if (x.kind === 'call') {
        if (this.fifoOp?.(x) == null) { any = true; return; }
        if (x.args[0]) out.add(base(x.args[0]));   // (s.read(v))
      }
      for (const [k, v] of Object.entries(x)) if (k !== 'loc' && k !== 'type') w(v);
    };
    if (s.kind === 'decl') for (const v of s.vars) { out.add(v.name); w(v.init); }
    else w(s.e);
    return any ? null : out;
  },

  // ------------------------------------------------------------------ a stream's words
  /** A member of a stream read: a struct's first member reads the word, its others take their fields of it. */
  hoistFifoField(e, f, at) {
    const G = this.slots.get(f.group);
    if (e.args.length) this.error(e.loc, `'${G.port}.read(x)' inside an expression: write x = ${G.port}.read(); or ${G.port}.read(x); as a statement`);
    let r = this.fifoWords.get(`${G.name}#r`);
    if (f.index === 0 || !r || r.taken.has(f.index)) {
      r = { reg: this.wordReg(G), taken: new Set() };
      this.fifoWords.set(`${G.name}#r`, r);
      if (at.cur.stmts.length) at.next();
      at.cur.stmts.push({ kind: 'fiforead', fifo: G.name, tmp: r.reg, loc: e.loc });
      at.next();
      G.read = true;
    }
    r.taken.add(f.index);
    const tmp = this.memberTmp(f);
    at.cur.stmts.push({ kind: 'wordget', reg: r.reg, tmp, field: f.field, sub: null, at: 0, loc: e.loc });
    return { kind: 'id', name: tmp, loc: e.loc };
  },
  /** A member of a stream written: its field of the word; the struct's last member's write writes the word. */
  lowerFifoField(e, f, at) {
    const G = this.slots.get(f.group);
    if (e.args.length !== 1) this.error(e.loc, `'${G.port}.write' takes one value`);
    if (this.hasSide(e.args[0])) this.error(e.loc, `a write of the stream '${G.port}' with another side effect in it: write them as statements of their own`);
    const v = this.hoist(e.args[0], at);
    let r = this.fifoWords.get(`${G.name}#w`);
    if (f.index === 0 || !r) { r = { reg: this.wordReg(G) }; this.fifoWords.set(`${G.name}#w`, r); }
    at.cur.stmts.push({ kind: 'wordset', reg: r.reg, field: f.field, sub: null, at: 0, v, t: f.t, loc: e.loc });
    G.written = true;
    if (!f.last) return at.cur;
    at.next();
    at.cur.stmts.push({ kind: 'fifowrite', fifo: G.name, v: { kind: 'id', name: r.reg, loc: e.loc }, loc: e.loc });
    at.next();
    return at.cur;
  },

  /** A group's ports, at its first member's place, named by the struct: ap_fifo's or ap_memory's, of its words. */
  wordPorts(param, ports, outputs) {
    const { G, index } = this.wordOf.get(param);
    if (index !== 0) return;
    const S = this.slots.get(G).port;
    const role = this.slots.get(G).kind;
    const p = (sfx, dir, w, node) => { ports.push({ name: `${S}${sfx}`, dir, w, s: false, role, param: S }); if (node != null) outputs.set(`${S}${sfx}`, { node }); };
    const fifo = this.fifos?.find((x) => x.name === G);
    if (fifo) {
      if (!fifo.used) return;
      if (fifo.dir === 'in') { p('_dout', 'in', fifo.t.w, null); p('_empty_n', 'in', 1, null); p('_read', 'out', 1, fifo.go); }
      else { p('_din', 'out', fifo.t.w, fifo.d); p('_full_n', 'in', 1, null); p('_write', 'out', 1, fifo.go); }
      return;
    }
    const mem = this.mems?.find((x) => x.name === G);
    if (mem) this.memIface(S, mem, ports, outputs);
  },

  // ------------------------------------------------------------------ run in a state
  /** The value of element j (a node: j's value, or a number) of a field of the word w, as the member's type t. */
  fieldGet(w, f, j, t) {
    const lo = f.off + j * f.size;
    return this.g.add('ext', [this.g.add('slice', [w], U(f.w), { hi: lo + f.w - 1, lo })], t);
  },
  /** The word w with element j of a field the value v (a node of the member's type). */
  fieldSet(w, f, j, v, W) {
    const lo = f.off + j * f.size;
    const bits = this.g.add('ext', [this.g.add('slice', [v], U(f.w), { hi: f.w - 1, lo: 0 })], U(W));
    const at = lo ? this.g.add('shl', [bits, this.g.const(lo, INT)], U(W)) : bits;
    const kept = this.g.add('and', [w, this.g.const(ones(W) & ~fieldMask(f, j), U(W))], U(W));
    return this.g.add('or', [kept, at], U(W));
  },
  wordStmt(s, base) {
    const g = this.guard(base);
    if (s.kind === 'wordget') {
      const w = this.slots.get(s.reg), t = this.slots.get(s.tmp).t;
      let v = this.fieldGet(w.val, s.field, s.at ?? 0, t);
      if (s.at === null) {
        const j = this.expr(s.sub, g);
        for (let k = 1; k < s.field.k; k++) v = this.mux(this.g.add('eq', [j.id, this.g.const(k, j.t)], BOOL), this.fieldGet(w.val, s.field, k, t), v, t);
      }
      this.slots.get(s.tmp).val = v;
      return;
    }
    if (s.kind === 'wordset') {
      const w = this.slots.get(s.reg), W = w.t.w;
      const v = this.conv(this.expr(s.v, g), s.t).id;
      let nw;
      if (s.at !== null) nw = this.fieldSet(w.val, s.field, s.at, v, W);
      else {
        const j = this.expr(s.sub, g);
        nw = w.val;
        for (let k = 0; k < s.field.k; k++) nw = this.mux(this.g.add('eq', [j.id, this.g.const(k, j.t)], BOOL), this.fieldSet(w.val, s.field, k, v, W), nw, w.t);
      }
      w.val = this.mux(g, nw, w.val, w.t);
      return;
    }
    const G = this.slots.get(s.mem), w = this.slots.get(s.reg), T = U(G.t.w);
    if (s.kind === 'wordload') {
      // (the fields written before it kept: a read-modify-write's)
      const q = this.memQ(G);
      w.val = !s.mask ? q : this.g.add('or', [this.g.add('and', [q, this.g.const(ones(G.t.w) & ~s.mask, T)], T), this.g.add('and', [w.val, this.g.const(s.mask, T)], T)], T);
      return;
    }
    // wordwrite: the word whole, its padding 0
    const addr = this.conv(this.expr(s.i, g), U(G.aw)).id;
    this.access.set(G.name, { addr, ce: g, we: g, d: this.g.add('and', [w.val, this.g.const(G.full, T)], T) });
  },
};
