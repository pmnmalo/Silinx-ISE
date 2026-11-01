// Silinx HLS (#1528): the expressions of the C simulation (core/c-interp.js's methods, mixed into its Machine): C's and
// ap_int's arithmetic on BigInt values (core/c-types.js), pointers to variables and array elements, printf.
// Isomorphic ES module: no DOM and no Node APIs.
import { Block } from './c-interp-task.js';
import { INT, BOOL, typeOf, promote, binaryType, compareType, shiftType, unaryType, literalType, wrap } from './c-types.js';
import { F64, F32, fmtFloat } from './c-float.js';
import { fixedType, toFixed, fixedOp, fixedCompare, fixedToInt, fixedToDouble, fixedText } from './c-fixed.js';

const CMP = { '==': (a, b) => a === b, '!=': (a, b) => a !== b, '<': (a, b) => a < b, '<=': (a, b) => a <= b, '>': (a, b) => a > b, '>=': (a, b) => a >= b };

/** v (a BigInt, or a number: a float's) as a value of type t: C's conversion (to bool: 0 or 1; to an integer: the
 *  bits of the width, read signed or not, a float's value truncated toward zero; to a float: the nearest). */
export function convert(v, t) {
  if (t.fl) { const x = typeof v === 'number' ? v : Number(v); return t.fl === 32 ? Math.fround(x) : x; }
  if (t.bool) return v ? 1n : 0n;
  if (typeof v === 'number') v = Number.isFinite(v) ? BigInt(Math.trunc(v)) : 0n;
  return wrap(v, t);
}
/** The common type of a float and another operand (C: double over float over the integers). */
const floatOf = (a, b) => (a.fl === 64 || b.fl === 64 ? F64 : F32);
const num = (v, t) => ({ v: convert(v, t), t });

export const exprMethods = {
  /** The value of an expression: { v, t } (an integer), { ptr, t } (a pointer: get / set), { arr, t } (an array). */
  eval(e) {
    this.tick(e);
    switch (e.kind) {
      case 'num': return num(e.value, literalType(e.value, { unsigned: e.unsigned, long: e.long, decimal: !/^0/.test(e.text) || e.text === '0' }));
      case 'chr': return num(e.value, INT);
      case 'float': return num(Number(e.text.replace(/[fFlL]$/, '')), /[fF]$/.test(e.text) ? F32 : F64);
      case 'str': return { str: e.value };
      case 'id': {
        const c = this.lookup(e.name, e);
        if (c.isFile) return { fh: c.fh, v: c.fh ? 1n : 0n, t: c.t };   // (a FILE *: 0 when NULL, #1598)
        if (c.argv) return { argv: c.argv, t: c.t };   // (main's argv: for a test bench's class, #2234)
        if (c.fifo) return { fifo: c.fifo, t: c.t };   // (an hls::stream, #1590)
        if (c.arr) return { arr: c.arr, t: c.t, dims: c.dims };
        if (c.ref) return { ptr: c.ref, t: c.t };
        return { v: c.v, t: c.t };
      }
      case 'unary': return this.unary(e);
      case 'postfix': {
        const ref = this.lvalue(e.e);
        const old = ref.get();
        ref.set(this.arith(e.op === '++' ? '+' : '-', old, num(1n, INT), e));
        return old;
      }
      case 'binary': return this.binary(e);
      case 'assign': {
        const ref = this.lvalue(e.l);
        const val = e.op === '=' ? this.eval(e.r) : this.arith(e.op.slice(0, -1), ref.get(), this.eval(e.r), e);
        ref.set(val);
        return ref.get();
      }
      case 'cond': {
        const c = this.truth(this.eval(e.c));
        // (the result in the common type of both branches, as C converts them)
        const a = c ? this.eval(e.a) : null, b = c ? null : this.eval(e.b);
        const other = this.typeOfExpr(c ? e.b : e.a);
        const x = a || b;
        if (x.ptr || x.arr || !other) return x;
        const t = x.t.fl || other.fl ? floatOf(x.t, other) : compareType(x.t, other);
        return num(x.v, t);
      }
      case 'comma': this.eval(e.l); return this.eval(e.r);
      case 'cast': {
        const t = typeOf(e.type);
        const x = this.eval(e.e);
        if (x.heap !== undefined && e.type.kind === 'ptr') return this.heapPtr(x, e.type.to, e);
        if (!t) return x;
        return { v: this.as(x, t, e), t };
      }
      case 'call': return this.call(e);
      case 'index': {
        // (a row of an array of arrays: a view of its cells)
        const r = this.indexRef(e);
        return r.row || r.get();
      }
      case 'sizeof': {
        // (an array variable's: all its elements, snprintf(buf, sizeof buf, …), #1897)
        const c = !e.type && e.e?.kind === 'id' ? this.find(e.e.name) : null;
        if (c?.arr) return num(BigInt(Math.ceil((c.t?.w || 32) / 8) * c.arr.length), { w: 64, s: false, ap: false });
        const t = e.type ? typeOf(e.type) : this.typeOfExpr(e.e);
        const n = e.type?.kind === 'array' ? (e.type.length || 1) : 1;
        return num(BigInt(Math.ceil((t?.w || 32) / 8) * n), { w: 64, s: false, ap: false });
      }
      default: this.fail(e, `this expression cannot be simulated`);
    }
    return null;
  },
  /** malloc's bytes as an array of to's, a pointer to its first (#1891). */
  heapPtr(x, to, e) {
    const t = typeOf(to);
    if (!t) this.fail(e, 'malloc: its memory is given to a pointer to numbers');
    const arr = Array.from({ length: Math.floor(x.heap / Math.ceil((t.w || 32) / 8)) }, () => ({ v: t.fl ? 0 : 0n }));
    if (!arr.length) this.fail(e, `malloc: ${x.heap} bytes hold no element`);
    return { ptr: this.elemRef(arr, 0, t), t };
  },
  /** The type of an expression without running it (for ?:'s common type), or null. */
  typeOfExpr(e) {
    if (e.kind === 'num') return literalType(e.value, { unsigned: e.unsigned, long: e.long });
    if (e.kind === 'float') return /[fF]$/.test(e.text) ? F32 : F64;
    if (e.kind === 'id') { const c = this.find(e.name); return c && !c.arr && !c.ref ? c.t : null; }
    if (e.kind === 'cast') return typeOf(e.type);
    return null;
  },
  intOf(x, e) {
    if (typeof x.v === 'number') return Number.isFinite(x.v) ? BigInt(Math.trunc(x.v)) : 0n;
    if (x.t?.fx) return fixedToInt(x);   // (toward zero, as C++ converts it)
    if (x.v !== undefined) return x.v;
    this.fail(e, 'an integer expected here (not a pointer or an array)');
    return 0n;
  },
  truth(x) { return x.ptr ? true : typeof x.v === 'number' ? x.v !== 0 : this.intOf(x) !== 0n; },
  /** x as a value of type t (C's conversion; a float's kept as a number; an ap_fixed's quantized and its overflow
   *  handled, core/c-fixed.js). */
  as(x, t, e) {
    if (t.fx) { if (x.v === undefined) this.intOf(x, e); return toFixed(x, t).v; }
    if (x.t?.fx) return t.fl ? convert(fixedToDouble(x), t) : convert(fixedToInt(x), t);
    return convert(x.v ?? this.intOf(x, e), t);
  },
  /** x's value as a number (a double's, a fixed's, an integer's). */
  numOf(x, e) { return typeof x.v === 'number' ? x.v : x.t?.fx ? fixedToDouble(x) : Number(this.intOf(x, e)); },
  unary(e) {
    switch (e.op) {
      case '!': return num(this.truth(this.eval(e.e)) ? 0n : 1n, INT);
      case '-': case '+': case '~': {
        const x = this.eval(e.e);
        if (x.t?.fl) { if (e.op === '~') this.fail(e, "'~' of a floating-point value"); return num(e.op === '-' ? -x.v : x.v, x.t); }
        // (ap_fixed: -x one bit wider, ~x its own type)
        if (x.t?.fx) return e.op === '-' ? num(-x.v, fixedType(x.t.w + 1, x.t.w - x.t.f + 1, true)) : num(e.op === '~' ? ~x.v : x.v, x.t);
        const t = unaryType(e.op, x.t);
        const v = this.as(x, t, e);
        return num(e.op === '-' ? -v : e.op === '~' ? ~v : v, t);
      }
      // (*s of a reference to a stream: the stream, #1721)
      case '*': { const p = this.eval(e.e); if (p.fifo) return p; if (!p.ptr) this.fail(e, "'*' of something that is not a pointer"); return p.ptr.get(); }
      case '&': return { ptr: this.lvalue(e.e), t: this.lvalue(e.e).t };
      case '++': case '--': {
        const ref = this.lvalue(e.e);
        ref.set(this.arith(e.op === '++' ? '+' : '-', ref.get(), num(1n, INT), e));
        return ref.get();
      }
      default: this.fail(e, `the operator '${e.op}' cannot be simulated`);
    }
    return null;
  },
  binary(e) {
    if (e.op === '&&') return num(this.truth(this.eval(e.l)) && this.truth(this.eval(e.r)) ? 1n : 0n, INT);
    if (e.op === '||') return num(this.truth(this.eval(e.l)) || this.truth(this.eval(e.r)) ? 1n : 0n, INT);
    const l = this.eval(e.l), r = this.eval(e.r);
    if (CMP[e.op] && (l.t?.fl || r.t?.fl)) return num(CMP[e.op](this.numOf(l, e), this.numOf(r, e)) ? 1n : 0n, INT);
    if (CMP[e.op] && (l.t?.fx || r.t?.fx)) return num(fixedCompare(e.op, l, r) ? 1n : 0n, INT);
    if (CMP[e.op]) {
      const t = compareType(l.t, r.t);
      return num(CMP[e.op](this.as(l, t, e), this.as(r, t, e)) ? 1n : 0n, INT);
    }
    return this.arith(e.op, l, r, e);
  },
  /** l op r with C's / ap_int's arithmetic: + - * / % & | ^ << >> */
  arith(op, l, r, e) {
    if (l.t?.fl || r.t?.fl) {
      // (floating point: in double, or float when neither is a double)
      const t = floatOf(l.t.fl ? l.t : {}, r.t.fl ? r.t : {});
      const a = this.numOf(l, e), b = this.numOf(r, e);
      const F = { '+': a + b, '-': a - b, '*': a * b, '/': a / b };
      if (!(op in F)) this.fail(e, `the operator '${op}' of a floating-point value`);
      return num(F[op], t);
    }
    if (l.t?.fx || r.t?.fx) {
      // (ap_fixed: full precision, core/c-fixed.js; a shift keeps its type)
      if (op === '<<' || op === '>>') {
        if (!l.t.fx) this.fail(e, 'a shift by an ap_fixed');
        const n = this.intOf(r, e);
        return num(op === '<<' ? l.v << n : l.v >> n, l.t);
      }
      if (op === '%') this.fail(e, "'%' of an ap_fixed");
      const x = fixedOp(op, l, r);
      if (!x) this.fail(e, 'division by zero');
      return x;
    }
    const a0 = this.intOf(l, e), b0 = this.intOf(r, e);
    if (op === '<<' || op === '>>') {
      const t = shiftType(l.t);
      const a = convert(a0, t);
      // (a constant count past the width: the value g++ folds it to, said; #2309)
      if (b0 >= 0n && !t.ap && b0 >= BigInt(t.w) && (e.constCount || e.r.kind === 'num')) {
        const v = op === '>>' && a < 0n ? -1n : 0n;
        this.warnOnce(e, `a shift by ${b0} of a ${t.w}-bit value is undefined in C: the C simulation takes g++'s value, ${v} (synthesis refuses it)`);
        return num(v, t);
      }
      if (b0 < 0n || (!t.ap && b0 >= BigInt(t.w))) this.fail(e, `a shift by ${b0} of a ${t.w}-bit value is undefined in C`);
      return num(op === '<<' ? a << b0 : a >> b0, t);
    }
    const { res, opnd } = binaryType(op, l.t, r.t);
    const a = convert(a0, opnd), b = convert(b0, opnd);
    let v;
    switch (op) {
      case '+': v = a + b; break;
      case '-': v = a - b; break;
      case '*': v = a * b; break;
      case '/': if (!b) this.fail(e, 'division by zero'); v = a / b; break;
      case '%': if (!b) this.fail(e, 'division by zero'); v = a % b; break;
      case '&': v = a & b; break;
      case '|': v = a | b; break;
      case '^': v = a ^ b; break;
      default: this.fail(e, `the operator '${op}' cannot be simulated`);
    }
    return num(convert(v, opnd), res);
  },
  /** An hls::stream's member function (#1590): read() / read(x), write(v), empty(), full(), size(), read_nb(x),
   *  write_nb(v); a read of an empty stream stops the run (it would wait for ever in hardware). */
  streamOp(f, name, e) {
    const B = (b) => num(b ? 1n : 0n, INT);
    // (this.io: the streams' reads and writes, a task's invocation that did some, core/c-interp-task.js, #1721)
    const take = () => { const v = f.q.shift(); if (f.log) f.log.reads++; this.io = (this.io || 0) + 1; return num(v, f.t); };
    const put = (x) => { const v = this.as(x, f.t, e); f.q.push(v); f.log?.writes.push(v); this.io = (this.io || 0) + 1; };
    switch (name) {
      case 'read': {
        // (empty: a task's invocation waits, undone; the test bench's or the top's, the tasks run first)
        if (!f.q.length && this.inTasks) throw new Block();
        if (!f.q.length) this.runTasks();
        if (!f.q.length) this.fail(e, `the stream '${f.name}' is read while empty`);
        const v = take();
        if (e.args[0]) this.lvalue(e.args[0]).set(v);
        return v;
      }
      case 'read_nb': {
        if (!f.q.length) return B(false);
        this.lvalue(e.args[0]).set(take());
        return B(true);
      }
      case 'write': case 'write_nb': put(this.eval(e.args[0])); return name === 'write' ? num(0n, INT) : B(true);
      case 'empty': return B(!f.q.length);
      case 'full': return B(false);
      case 'size': return num(BigInt(f.q.length), INT);
      default: this.fail(e, `'.${name}' of a stream cannot be simulated`);
    }
    return null;
  },
  /** The place an lvalue names: { get(), set(value), t }. */
  lvalue(e) {
    if (e.kind === 'id') {
      const c = this.lookup(e.name, e);
      if (c.arr) this.fail(e, `'${e.name}' is an array: give an index`);
      if (c.isFile) return { get: () => ({ fh: c.fh, v: c.fh ? 1n : 0n, t: c.t }), set: (x) => { c.fh = x.fh ?? null; }, t: c.t };
      if (c.ref) return { get: () => ({ ptr: c.ref, t: c.t }), set: (x) => { if (!x.ptr) this.fail(e, `'${e.name}' is a pointer`); c.ref = x.ptr; }, t: c.t };
      return { get: () => ({ v: c.v, t: c.t }), set: (x) => { c.v = this.as(x, c.t, e); }, t: c.t };
    }
    if (e.kind === 'unary' && e.op === '*') { const p = this.eval(e.e); if (!p.ptr) this.fail(e, "'*' of something that is not a pointer"); return p.ptr; }
    if (e.kind === 'index') return this.indexRef(e);
    // x.range(hi, lo) = v: those bits of x
    if (e.kind === 'call' && e.callee.kind === 'member' && e.callee.name === 'range' && e.args.length === 2) {
      const base = this.lvalue(e.callee.e);
      const [hi, lo] = e.args.map((a) => Number(this.intOf(this.eval(a), a)));
      if (lo < 0 || hi < lo || hi >= base.t.w) this.fail(e, `.range(${hi}, ${lo}) is outside the ${base.t.w} bits of this value`);
      const m = ((1n << BigInt(hi - lo + 1)) - 1n) << BigInt(lo);
      const t = { w: hi - lo + 1, s: false, ap: true };
      const raw = () => base.get().v & ((1n << BigInt(base.t.w)) - 1n);
      return { get: () => ({ v: (raw() & m) >> BigInt(lo), t }), set: (x) => { const v = (raw() & ~m) | ((this.as(x, t, e) << BigInt(lo)) & m); base.set({ v: convert(v, { w: base.t.w, s: base.t.s }), t: base.t }); }, t };   // (its bits, in its own type)
    }
    this.fail(e, 'this cannot be assigned');
    return null;
  },
  /** a[i]: an array's element, a pointer's (p[0], or an element of the array it points into), an ap_int's bit. */
  indexRef(e) {
    // (a[i][j] of a two-dimensional array: its cell with no row made, a test bench's hot path, #2234)
    if (e.e.kind === 'index' && e.e.e.kind === 'id') {
      const outer = this.eval(e.e.e);
      if (outer.arr && outer.dims?.length === 2) {
        const [rows, cols] = outer.dims;
        const i = Number(this.intOf(this.eval(e.e.i), e.e)), j = Number(this.intOf(this.eval(e.i), e));
        if (i < 0 || i >= rows) this.fail(e.e, `the index ${i} is outside the array (0 to ${rows - 1})`);
        if (j < 0 || j >= cols) this.fail(e, `the index ${j} is outside the array (0 to ${cols - 1})`);
        const at = i * cols + j, cell = outer.arr[at], t = outer.t;
        return { get: () => ({ v: cell.v, t }), set: (x) => { cell.v = this.as(x, t, e); }, t, cell, arr: outer.flat ?? outer.arr, index: (outer.off ?? 0) + at };
      }
    }
    const base = this.eval(e.e);
    const i = Number(this.intOf(this.eval(e.i), e));
    if (base.arr && base.dims?.length > 1) {
      const stride = base.dims.slice(1).reduce((a, b) => a * b, 1);
      if (i < 0 || i >= base.dims[0]) this.fail(e, `the index ${i} is outside the array (0 to ${base.dims[0] - 1})`);
      // (flat, off: the whole array and where the row starts: &a[0][0] points into all of it, #2234)
      const row = { arr: base.arr.slice(i * stride, (i + 1) * stride), t: base.t, dims: base.dims.slice(1), flat: base.flat ?? base.arr, off: (base.off ?? 0) + i * stride };
      return { row, get: () => row, set: () => this.fail(e, 'a row of an array cannot be assigned'), t: base.t };
    }
    if (base.arr) {
      if (i < 0 || i >= base.arr.length) this.fail(e, `the index ${i} is outside the array (0 to ${base.arr.length - 1})`);
      const cell = base.arr[i];
      if (base.t.text) return { get: () => cell.v, set: (x) => { cell.v = x.str !== undefined ? this.strPtr(x.str) : x; }, t: base.t, cell, arr: base.flat ?? base.arr, index: (base.off ?? 0) + i };
      return { get: () => ({ v: cell.v, t: base.t }), set: (x) => { cell.v = this.as(x, base.t, e); }, t: base.t, cell, arr: base.flat ?? base.arr, index: (base.off ?? 0) + i };
    }
    if (base.ptr) {
      if (base.ptr.arr) {
        const k = base.ptr.index + i;
        if (k < 0 || k >= base.ptr.arr.length) this.fail(e, `the index ${i} is outside the array the pointer points into`);
        const cell = base.ptr.arr[k];
        return { get: () => ({ v: cell.v, t: base.t }), set: (x) => { cell.v = this.as(x, base.t, e); }, t: base.t, cell, arr: base.ptr.arr, index: k };
      }
      if (i !== 0) this.fail(e, `a pointer to one value: only [0]`);
      return base.ptr;
    }
    // a bit of an ap_int / ap_uint
    if (!base.t?.ap) this.fail(e, 'an index of a value that is not an array');
    if (i < 0 || i >= base.t.w) this.fail(e, `the bit ${i} is outside the ${base.t.w} bits of this value`);
    const target = e.e.kind === 'id' ? this.lvalue(e.e) : null;
    return {
      get: () => num((convert(base.v, { ...base.t, s: false }) >> BigInt(i)) & 1n, BOOL),
      set: (x) => {
        if (!target) this.fail(e, 'this bit cannot be assigned');
        const cur = convert(target.get().v, { ...base.t, s: false });
        const bit = this.truth(x) ? 1n : 0n;
        target.set(num((cur & ~(1n << BigInt(i))) | (bit << BigInt(i)), base.t));
      },
      t: BOOL,
    };
  },
  /** printf's formatting: %[flags][width][.precision][length]conversion (d i u x X o c s p %). */
  format(fmt, args, e, fh = null) {
    let k = 0, out = '';
    // (a C++ stream's state, its manipulators', core/cpp-tree.js: %{…})
    const key = fh?.std ?? fh?.name ?? 'out';
    const st = (this.streamState ||= new Map()).get(key) || { float: 'g', prec: undefined, base: 'd', left: false, zero: false };
    this.streamState.set(key, st);
    const next = () => { if (k >= args.length) this.fail(e, 'printf: fewer arguments than its format asks for'); return args[k++]; };
    // (and C++'s cout of a value, %…v with its stream's format: core/cpp-tree.js)
    const re = /%\{(\w+)\}|%([-+ 0#]*)(\*|\d+)?(?:\.(\*|\d+))?(hh|h|ll|l|z|j|L)?([diuxXocspfFeEgG%v])/g;
    let last = 0, m;
    while ((m = re.exec(fmt))) {
      out += fmt.slice(last, m.index);
      last = re.lastIndex;
      if (m[1]) {
        const d = m[1];
        if (d === 'prec') st.prec = Number(this.intOf(next(), e));
        else if (d === 'fixed' || d === 'scientific' || d === 'defaultfloat') st.float = { fixed: 'f', scientific: 'e', defaultfloat: 'g' }[d];
        else if (d === 'hex' || d === 'oct' || d === 'dec') st.base = d[0] === 'h' ? 'x' : d[0] === 'o' ? 'o' : 'd';
        else if (d === 'left' || d === 'right') st.left = d === 'left';
        else if (d === 'fill0' || d === 'fill') st.zero = d === 'fill0';
        continue;
      }
      let [, , flags, width, prec, len, conv] = m;
      if (conv === '%') { out += '%'; continue; }
      if (conv === 'v') {
        // (padded with the stream's fill, before the sign too: C++'s right, its default)
        const s = this.streamText(next(), st, e), fill = st.zero ? '0' : ' ';
        out += width ? (st.left ? s.padEnd(Number(width), fill) : s.padStart(Number(width), fill)) : s;
        continue;
      }
      if (width === '*') width = String(this.intOf(next(), e));
      if (prec === '*') prec = String(this.intOf(next(), e));
      const a = next();
      let s;
      if (conv === 's') { s = this.cString(a) ?? ''; if (prec !== undefined) s = s.slice(0, Number(prec)); }
      else if ('fFeEgG'.includes(conv)) {
        s = fmtFloat(conv, Number(a.v ?? this.intOf(a, e)), prec === undefined ? undefined : Number(prec), flags);
        if (flags.includes('0') && !flags.includes('-') && width && /^[-+ ]?\d/.test(s)) { const sg = /^[-+ ]/.test(s) ? s[0] : ''; s = sg + s.slice(sg.length).padStart(Number(width) - sg.length, '0'); }
      }
      else if (conv === 'c') s = String.fromCharCode(Number(this.as(a, { w: 8, s: false }, e)));
      else if (conv === 'p') s = '0x1';
      else {
        const w = len === 'hh' ? 8 : len === 'h' ? 16 : len === 'l' || len === 'll' || len === 'z' || len === 'j' ? 64 : 32;
        const signed = conv === 'd' || conv === 'i';
        let v = this.as(a, { w, s: signed }, e);
        const neg = v < 0n;
        if (neg) v = -v;
        s = v.toString(conv === 'o' ? 8 : conv === 'x' || conv === 'X' ? 16 : 10);
        if (conv === 'X') s = s.toUpperCase();
        if (prec !== undefined) s = s.padStart(Number(prec), '0');
        if (flags.includes('#') && v && (conv === 'x' || conv === 'X')) s = `0${conv}${s}`;
        if (flags.includes('#') && conv === 'o' && s[0] !== '0') s = `0${s}`;
        const sign = neg ? '-' : signed && flags.includes('+') ? '+' : signed && flags.includes(' ') ? ' ' : '';
        if (flags.includes('0') && !flags.includes('-') && prec === undefined && width) s = s.padStart(Number(width) - sign.length, '0');
        s = sign + s;
      }
      if (width) s = flags.includes('-') ? s.padEnd(Number(width)) : s.padStart(Number(width));
      out += s;
    }
    return out + fmt.slice(last);
  },
  /** C++'s `stream << value` (core/cpp-tree.js's %v), as its stream's state st says: a string; a char (an 8-bit C
   *  integer) its character; an integer in its base; a float as its float field (g: precision significant digits, 6
   *  by default; f: fixed; e: scientific). */
  streamText(a, st, e) {
    if (a.str !== undefined) return a.str;
    // (a const char *'s text, #2309)
    if (a.ptr && a.t?.w === 8) return this.cString(a);
    if (a.t?.fl) return fmtFloat(st.float, a.v, st.prec, '');
    if (a.t?.fx) return fixedText(a, st.prec ?? 6);   // (AMD's: its precision only)
    const v = this.intOf(a, e);
    if (a.t && a.t.w === 8 && !a.t.ap && !a.t.bool) return String.fromCharCode(Number(v & 255n));
    const base = st.base === 'x' ? 16 : st.base === 'o' ? 8 : 10;
    // (hex and octal of a negative C integer: its bits, as C++ prints them)
    const u = base !== 10 && v < 0n ? v & ((1n << BigInt(a.t?.w || 64)) - 1n) : v;
    return u < 0n ? `-${(-u).toString(base)}` : u.toString(base);
  },
  member(e) {
    const m = e.callee;
    const x = this.eval(m.e);
    if (x.fifo) return this.streamOp(x.fifo, m.name, e);
    // (a test bench's std::vector, an array: its size, its data, #1734)
    if (x.arr && m.name === 'size') return num(BigInt(x.arr.length), { w: 64, s: false, ap: false });
    if (x.arr && m.name === 'data') return x;
    const args = e.args.map((a) => Number(this.intOf(this.eval(a), a)));
    const u = () => convert(x.v, { ...x.t, s: false });
    switch (m.name) {
      case 'range': {
        const [hi, lo] = args;
        if (lo < 0 || hi >= x.t.w || hi < lo) this.fail(e, `.range(${hi}, ${lo}) is outside the ${x.t.w} bits of this value`);
        // (an ap_fixed's range: in an expression an unsigned long long, AMD's af_range_ref's conversion)
        return num((u() >> BigInt(lo)) & ((1n << BigInt(hi - lo + 1)) - 1n), x.t.fx ? { w: 64, s: false, ap: false } : { w: hi - lo + 1, s: false, ap: true });
      }
      case 'to_double': return num(x.t.fx ? fixedToDouble(x) : x.v, F64);
      case 'to_float': return num(x.t.fx ? fixedToDouble(x) : x.v, F32);
      case 'to_int': return num(this.intOf(x, e), INT);
      case 'to_uint': return num(this.intOf(x, e), { w: 32, s: false, ap: false });
      case 'to_long': case 'to_int64': return num(this.intOf(x, e), { w: 64, s: true, ap: false });
      case 'to_ulong': case 'to_uint64': return num(this.intOf(x, e), { w: 64, s: false, ap: false });
      case 'length': return num(BigInt(x.t.w), INT);
      case 'or_reduce': return num(u() ? 1n : 0n, BOOL);
      case 'and_reduce': return num(u() === (1n << BigInt(x.t.w)) - 1n ? 1n : 0n, BOOL);
      case 'xor_reduce': return num(BigInt([...u().toString(2)].filter((d) => d === '1').length % 2), BOOL);
      default: this.fail(e, `'.${m.name}()' cannot be simulated`);
    }
    return null;
  },
};

export { promote };
