// Silinx HLS (#1525): the expressions of core/c-dataflow.js's symbolic run (its methods, mixed into its Flow): each
// C expression a value { id, t } of the graph, with C's and ap_int's arithmetic (core/c-types.js); the assignments
// guarded by the condition under which they run. Isomorphic ES module: no DOM and no Node APIs.
import { BOOL, INT, typeOf, promote, binaryType, compareType, shiftType, unaryType, literalType } from './c-types.js';
import { constValue } from './c-check.js';

const NOT_COMB = '(a sequential module: not supported yet, #1526)';
const OPS = { '+': 'add', '-': 'sub', '*': 'mul', '&': 'and', '|': 'or', '^': 'xor' };
const CMP = { '==': 'eq', '!=': 'ne', '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge' };

export const exprMethods = {
  /** The value of an expression run when g holds (its assignments guarded by g). */
  expr(e, g) {
    switch (e.kind) {
      case 'num': {
        const t = literalType(e.value, { unsigned: e.unsigned, long: e.long, decimal: !/^0/.test(e.text) || e.text === '0' });
        return this.v(this.g.const(e.value, t), t);
      }
      case 'chr': return this.v(this.g.const(e.value, INT), INT);
      case 'float': return this.floatConst(e);   // (an ap_fixed's value only, core/c-dataflow-fixed.js)
      case 'id': return this.read(this.lookup(e.name, e.loc), e);
      case 'unary': return this.unary(e, g);
      case 'postfix': {
        const old = this.expr(e.e, g);
        this.store(e.e, this.arith(e.op === '++' ? '+' : '-', old, this.v(this.g.const(1, INT), INT), e), g);
        return old;
      }
      case 'binary': return this.binary(e, g);
      case 'assign': {
        const val = e.op === '=' ? this.expr(e.r, g) : this.arith(e.op.slice(0, -1), this.expr(e.l, g), this.expr(e.r, g), e);
        return this.store(e.l, val, g);
      }
      case 'cond': {
        const c = this.bool(this.expr(e.c, g));
        const a = this.expr(e.a, this.and(g, c)), b = this.expr(e.b, this.and(g, this.not(c)));
        const t = a.t.fx ? a.t : b.t.fx ? b.t : compareType(a.t, b.t);
        return this.v(this.mux(c, this.conv(a, t).id, this.conv(b, t).id, t), t);
      }
      case 'comma': this.expr(e.l, g); return this.expr(e.r, g);
      case 'cast': {
        const t = typeOf(e.type);
        if (!t) this.error(e.loc, 'a cast to a type that is not an integer');
        return this.conv(this.expr(e.e, g), t);
      }
      case 'call': return this.callExpr(e, g);
      case 'index': return this.index(e, g);
      case 'sizeof': {
        const t = e.type ? typeOf(e.type) : this.expr(e.e, g).t;
        return this.v(this.g.const(Math.ceil((t?.w || 32) / 8), INT), INT);
      }
      case 'member': this.error(e.loc, `'.${e.name}' is a member function: call it`); break;
      default: this.error(e.loc, `this expression is not supported in a combinational module yet`);
    }
    return null;
  },
  /** The type of an lvalue (a variable, *pointer, an array's element) without reading it. */
  typeOfLvalue(l) {
    if (l.kind === 'id') { const s = this.lookup(l.name, l.loc); return s.t ?? s.out?.t ?? s.slot?.t; }
    if (l.kind === 'unary' && l.op === '*' && l.e.kind === 'id') { const s = this.lookup(l.e.name, l.loc); return s.out?.t ?? s.slot?.t ?? s.t; }
    if (l.kind === 'index' && l.e.kind === 'id') return this.lookup(l.e.name, l.loc).t;
    this.error(l.loc, 'this cannot be assigned (a variable, an array element or *pointer)');
    return null;
  },
  read(slot, e) {
    if (slot.kind === 'var') return this.v(slot.val, slot.t);
    if (slot.kind === 'out') return this.readOut(slot.out);
    this.error(e.loc, `'${e.name}' is an array: give an index`);
    return null;
  },
  readOut(o) {
    // (after a write, its value: not an input, #1603; after a write under a condition, the caller's value where it
    // does not hold: the input, the flow run again with the pointer read from its start, #1604)
    if (o.val !== null) {
      if (!o.whole && !o.read) (this.rerun ||= new Set()).add(o.name);
      return this.v(o.val, o.t);
    }
    o.read = true;
    const key = `${o.name}#in`;
    if (!this.inputs.has(key)) this.inputs.set(key, { name: key, t: o.t, port: { key, name: o.name }, id: null });
    const i = this.inputs.get(key);
    if (i.id === null) i.id = this.g.add('in', [], o.t, { port: i.port });
    return this.v(i.id, o.t);
  },
  unary(e, g) {
    switch (e.op) {
      case '!': return this.v(this.not(this.bool(this.expr(e.e, g))), BOOL);
      case '-': case '+': case '~': {
        if (e.op === '-' && e.e.kind === 'float') return this.floatConst(e.e, true);
        const x = this.expr(e.e, g);
        if (x.t.fx) return this.fxUnary(e.op, x);
        const t = unaryType(e.op, x.t);
        const c = this.conv(x, t);
        if (e.op === '+') return c;
        return this.v(this.g.add(e.op === '-' ? 'neg' : 'not', [c.id], t), t);
      }
      case '*': {
        const slot = this.lookup(e.e.kind === 'id' ? e.e.name : '', e.loc);
        if (slot.kind === 'out') return this.readOut(slot.out);
        if (slot.kind === 'alias') return this.read(slot.slot, e.e);
        this.error(e.loc, "'*' of something that is not a pointer argument");
        break;
      }
      case '++': case '--': {
        const val = this.arith(e.op === '++' ? '+' : '-', this.expr(e.e, g), this.v(this.g.const(1, INT), INT), e);
        return this.store(e.e, val, g);
      }
      case '&': this.error(e.loc, "'&' only to pass a variable to a function's pointer parameter"); break;
      default: this.error(e.loc, `the operator '${e.op}' is not supported`);
    }
    return null;
  },
  binary(e, g) {
    if (e.op === '&&' || e.op === '||') {
      const l = this.bool(this.expr(e.l, g));
      const r = this.bool(this.expr(e.r, this.and(g, e.op === '&&' ? l : this.not(l))));
      return this.v(e.op === '&&' ? this.and(l, r) : this.or(l, r), BOOL);
    }
    const l = this.expr(e.l, g), r = this.expr(e.r, g);
    if (CMP[e.op] && (l.t.fx || r.t.fx)) return this.fxCompare(e.op, l, r);
    if (CMP[e.op]) {
      const t = compareType(l.t, r.t);
      return this.v(this.g.add(CMP[e.op], [this.conv(l, t).id, this.conv(r, t).id], BOOL), BOOL);
    }
    return this.arith(e.op, l, r, e);
  },
  /** l op r with C's / ap_int's arithmetic: + - * / % & | ^ << >> */
  arith(op, l, r, e) {
    if (l.t.fx || r.t.fx || l.fconst !== undefined || r.fconst !== undefined) return this.fxArith(op, l, r, e);
    if (op === '<<' || op === '>>') {
      const t = shiftType(l.t);
      const x = this.conv(l, t);
      const n = this.g.isConst(r.id) ? this.g.k(r.id) : null;
      if (n !== null && (n < 0n || (!t.ap && n >= BigInt(t.w)))) this.error(e.loc, `a shift by ${n} of a ${t.w}-bit value is undefined in C`);
      return this.v(this.g.add(op === '<<' ? 'shl' : 'shr', [x.id, r.id], t), t);
    }
    const { res, opnd } = binaryType(op, l.t, r.t);
    const a = this.conv(l, opnd), b = this.conv(r, opnd);
    if (op === '/' || op === '%') return this.divide(op, a, b, res, e);
    if (op === '*') {
      const full = this.g.add('mul', [a.id, b.id], { w: opnd.w * 2, s: opnd.s });
      return this.conv(this.v(full, { w: opnd.w * 2, s: opnd.s }), res);
    }
    if (!OPS[op]) this.error(e.loc, `the operator '${op}' is not supported`);
    return this.conv(this.v(this.g.add(OPS[op], [a.id, b.id], opnd), opnd), res);
  },
  /** a / b and a % b (C: truncated toward zero): by constants folded; by a constant power of 2 with shifts; by
   *  another constant or a variable, core/c-dataflow-div.js. */
  divide(op, a, b, res, e) {
    if (!this.g.isConst(b.id)) return this.divVar(op, a, b, res);
    const d = this.g.k(b.id);
    if (d === 0n) this.error(e.loc, 'division by zero');
    if (this.g.isConst(a.id)) {
      const x = this.g.k(a.id);
      const q = x / d;   // (BigInt division truncates toward zero, as C)
      return this.conv(this.v(this.g.const(op === '/' ? q : x - q * d, a.t), a.t), res);
    }
    const ad = d < 0n ? -d : d;
    const k = ad.toString(2).length - 1;
    if (ad !== 1n << BigInt(k)) return this.divConst(op, a, d, res);
    const t = a.t, K = this.g.const(k, INT);
    let q;
    if (!t.s) q = this.g.add('shr', [a.id, K], t);
    else {
      // signed: round toward zero (add 2^k - 1 to a negative value before the shift)
      const neg = this.g.add('lt', [a.id, this.g.const(0, t)], BOOL);
      const bias = this.mux(neg, this.g.const((1n << BigInt(k)) - 1n, t), this.g.const(0, t), t);
      q = this.g.add('shr', [this.g.add('add', [a.id, bias], t), K], t);
    }
    if (d < 0n) q = this.g.add('neg', [q], t);
    if (op === '/') return this.conv(this.v(q, t), res);
    const back = this.g.add('shl', [d < 0n ? this.g.add('neg', [q], t) : q, K], t);
    return this.conv(this.v(this.g.add('sub', [a.id, back], t), t), res);
  },
  /** Assigns val to the lvalue l when g holds; returns the value stored. */
  store(l, val, g) {
    if (l.kind === 'id') {
      const slot = this.lookup(l.name, l.loc);
      if (slot.kind === 'var') {
        if (this.globals.has(l.name) && !this.scopes.some((s) => s.has(l.name))) this.error(l.loc, `'${l.name}' is a constant`);
        const nv = this.conv(val, slot.t);
        slot.val = this.mux(g, nv.id, slot.val, slot.t);
        return nv;
      }
      this.error(l.loc, `'${l.name}' cannot be assigned${slot.kind === 'alias' || slot.kind === 'out' ? ` (a pointer: assign *${l.name})` : ''}`);
    }
    if (l.kind === 'unary' && l.op === '*' && l.e.kind === 'id') return this.storeDeref(this.lookup(l.e.name, l.loc), val, g, l);
    if (l.kind === 'index') {
      const base = l.e.kind === 'id' ? this.lookup(l.e.name, l.loc) : null;
      if (base?.kind === 'out' || base?.kind === 'alias') {
        const i = this.expr(l.i, g);
        if (!this.g.isConst(i.id) || this.g.k(i.id) !== 0n) this.error(l.loc, `'${l.e.name}' is a pointer to one value: only ${l.e.name}[0]`);
        return this.storeDeref(base, val, g, l);
      }
      if (base?.kind === 'array') {
        const i = this.expr(l.i, g);
        const nv = this.conv(val, base.t);
        this.arrayWrite(base, i, nv, g, l);
        return nv;
      }
    }
    // x.range(hi, lo) = v: those bits of x (its whole width: v's bits, x not read)
    if (l.kind === 'call' && l.callee.kind === 'member' && l.callee.name === 'range' && l.args.length === 2) {
      const [hi, lo] = l.args.map((a) => constValue(a, this.consts()));
      if (hi === null || lo === null) this.error(l.loc, '.range(hi, lo) takes two constants');
      const H = Number(hi), Lo = Number(lo);
      const bt = this.typeOfLvalue(l.callee.e);
      if (Lo < 0 || H >= bt.w || H < Lo) this.error(l.loc, `.range(${H}, ${Lo}) is outside the ${bt.w} bits of this value`);
      const raw = { w: bt.w, s: false };
      const part = this.g.add('shl', [this.g.add('ext', [this.conv(val, { w: H - Lo + 1, s: false, ap: true }).id], raw), this.g.const(Lo, { w: 32, s: false })], raw);
      let bits = part;
      if (H - Lo + 1 < bt.w) {
        const old = this.g.add('ext', [this.expr(l.callee.e, g).id], raw);
        const keep = ((1n << BigInt(bt.w)) - 1n) ^ (((1n << BigInt(H - Lo + 1)) - 1n) << BigInt(Lo));
        bits = this.g.add('or', [this.g.add('and', [old, this.g.const(keep, raw)], raw), part], raw);
      }
      // (its bits as a value of its own type: stored as they are)
      this.store(l.callee.e, this.v(this.g.add('ext', [bits], { w: bt.w, s: bt.s }), bt), g);
      return val;
    }
    this.error(l.loc, 'this cannot be assigned (a variable, an array element or *pointer)');
    return null;
  },
  storeSlot(slot, val, g) {
    const nv = this.conv(val, slot.t);
    slot.val = this.mux(g, nv.id, slot.val, slot.t);
    return nv;
  },
  storeDeref(slot, val, g, l) {
    if (slot.kind === 'alias') return this.storeSlot(slot.slot, val, g);
    if (slot.kind !== 'out') this.error(l.loc, "'*' of something that is not a pointer argument");
    const o = slot.out;
    const nv = this.conv(val, o.t);
    const old = o.val ?? (o.read ? this.readOut(o).id : this.g.const(0, o.t));
    o.val = this.mux(g, nv.id, old, o.t);
    if (this.g.isConst(g) && this.g.k(g)) o.whole = true;   // (written whatever the inputs)
    o.vld = this.or(o.vld, g);
    o.written = true;
    return nv;
  },
  arrayWrite(arr, i, nv, g, l) {
    const n = arr.elems.length;
    if (this.g.isConst(i.id)) {
      const k = Number(this.g.k(i.id));
      if (k < 0 || k >= n) this.error(l.loc, `the index ${k} is outside '${arr.name}' (0 to ${n - 1})`);
      arr.elems[k] = this.mux(g, nv.id, arr.elems[k], arr.t);
      return;
    }
    const it = promote(i.t);
    const iv = this.conv(i, it);
    for (let k = 0; k < n; k++) {
      const hit = this.and(g, this.g.add('eq', [iv.id, this.g.const(k, it)], BOOL));
      arr.elems[k] = this.mux(hit, nv.id, arr.elems[k], arr.t);
    }
  },
  index(e, g) {
    const base = e.e.kind === 'id' ? this.lookup(e.e.name, e.loc) : null;
    const i = this.expr(e.i, g);
    if (base?.kind === 'array') {
      const n = base.elems.length;
      if (this.g.isConst(i.id)) {
        const k = Number(this.g.k(i.id));
        if (k < 0 || k >= n) this.error(e.loc, `the index ${k} is outside '${e.e.name}' (0 to ${n - 1})`);
        return this.v(base.elems[k], base.t);
      }
      const it = promote(i.t), iv = this.conv(i, it);
      let r = base.elems[n - 1];
      for (let k = n - 2; k >= 0; k--) r = this.mux(this.g.add('eq', [iv.id, this.g.const(k, it)], BOOL), base.elems[k], r, base.t);
      return this.v(r, base.t);
    }
    if (base?.kind === 'out' || base?.kind === 'alias') {
      if (!this.g.isConst(i.id) || this.g.k(i.id) !== 0n) this.error(e.loc, `'${e.e.name}' is a pointer to one value: only ${e.e.name}[0]`);
      return base.kind === 'out' ? this.readOut(base.out) : this.read(base.slot, e.e);
    }
    // a bit of an ap_int / ap_uint value
    const x = this.expr(e.e, g);
    if (!x.t.ap) this.error(e.loc, 'an index of a value that is not an array (a bit: ap_int / ap_uint only)');
    if (this.g.isConst(i.id)) {
      const k = Number(this.g.k(i.id));
      if (k < 0 || k >= x.t.w) this.error(e.loc, `the bit ${k} is outside the ${x.t.w} bits of this value`);
      return this.v(this.g.add('slice', [x.id], BOOL, { hi: k, lo: k }), BOOL);
    }
    const sh = this.g.add('shr', [this.conv(x, { ...x.t, s: false }).id, i.id], { ...x.t, s: false });
    return this.v(this.g.add('slice', [sh], BOOL, { hi: 0, lo: 0 }), BOOL);
  },
  callExpr(e, g) {
    if (e.callee.kind === 'member') return this.member(e, g);
    const name = e.callee.name;
    const fn = this.c.funcs.get(name);
    if (!fn) { if (['printf', 'fprintf', 'puts', 'putchar', 'assert'].includes(name)) return this.v(this.g.const(0, INT), INT); this.error(e.loc, `the function '${name}' cannot be called here`); }
    if (!fn.body) this.error(e.loc, `'${name}' is declared but not defined`);   // (#1605)
    const scope = new Map();
    fn.params.forEach((pa, k) => {
      const a = e.args[k];
      if (pa.type.kind === 'ptr' || pa.type.kind === 'array') {
        const target = a.kind === 'unary' && a.op === '&' && a.e.kind === 'id' ? this.lookup(a.e.name, a.loc) : a.kind === 'id' ? this.lookup(a.name, a.loc) : null;
        if (!target) this.error(a.loc, `the argument of '${pa.name}': a variable (&x), an array or a pointer argument`);
        scope.set(pa.name, target.kind === 'var' ? { kind: 'alias', slot: target } : target);
        return;
      }
      const t = typeOf(pa.type);
      scope.set(pa.name, { kind: 'var', t, val: this.conv(this.expr(a, g), t).id, name: pa.name });
    });
    // (the callee runs where the call is: under g)
    const saved = { scopes: this.scopes };
    const r = this.inline(fn, scope, g);
    this.scopes = saved.scopes;
    return r ?? this.v(this.g.const(0, INT), INT);
  },
  inline(fn, scope, g) {
    const frame = { fn, returned: this.not(g), ret: null, rt: fn.ret.kind === 'void' ? null : typeOf(fn.ret), loops: [] };
    const savedFrame = this.frame, savedScopes = this.scopes;
    this.frame = frame;
    this.scopes = [scope];
    try { this.block(fn.body.items, this.T); }
    finally { this.frame = savedFrame; this.scopes = savedScopes; }
    if (!frame.rt) return null;
    return this.v(frame.ret === null ? this.g.const(0, frame.rt) : frame.ret, frame.rt);
  },
  member(e, g) {
    const m = e.callee;
    const x = this.expr(m.e, g);
    const args = e.args.map((a) => constValue(a, this.consts()));
    switch (m.name) {
      case 'range': {
        if (args.length !== 2 || args.some((a) => a === null)) this.error(e.loc, '.range(hi, lo) takes two constants');
        const [hi, lo] = args.map(Number);
        if (lo < 0 || hi >= x.t.w || hi < lo) this.error(e.loc, `.range(${hi}, ${lo}) is outside the ${x.t.w} bits of this value`);
        const t = { w: hi - lo + 1, s: false, ap: true };
        const r = this.v(this.g.add('slice', [x.id], t, { hi, lo }), t);
        // (an ap_fixed's range: in an expression an unsigned long long, AMD's af_range_ref's conversion)
        return x.t.fx ? this.conv(r, { w: 64, s: false, ap: false }) : r;
      }
      case 'to_double': case 'to_float': this.error(e.loc, `'.${m.name}()' is floating point: not in hardware (the test bench only)`); break;
      case 'to_int': return this.conv(x, INT);
      case 'to_uint': return this.conv(x, { w: 32, s: false, ap: false });
      case 'to_long': case 'to_int64': return this.conv(x, { w: 64, s: true, ap: false });
      case 'to_ulong': case 'to_uint64': return this.conv(x, { w: 64, s: false, ap: false });
      case 'length': return this.v(this.g.const(x.t.w, INT), INT);
      case 'or_reduce': return this.v(this.bool(x), BOOL);
      case 'and_reduce': { const u = this.conv(x, { ...x.t, s: false }); return this.v(this.g.add('eq', [u.id, this.g.const(-1n, u.t)], BOOL), BOOL); }
      case 'xor_reduce': {
        let r = this.g.const(0, BOOL);
        for (let k = 0; k < x.t.w; k++) r = this.g.add('xor', [r, this.g.add('slice', [x.id], BOOL, { hi: k, lo: k })], BOOL);
        return this.v(r, BOOL);
      }
      default: this.error(e.loc, `'.${m.name}()' is not supported`);
    }
    return null;
  },
};
