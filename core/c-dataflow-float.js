// Silinx HLS (#1768, #1773): float and double in synthesis (core/c-dataflow.js's methods, mixed into its Flow). A
// floating-point value is its IEEE-754 bits (a node of 32 or 64 bits, its type t.fl 32 or 64); each operation calls the
// soft-float library (core/c-softfloat.js, its function inlined where the operation is, its loops unrolled), so the
// hardware gives the C simulation's bits: + - *, the comparisons, the conversions to and from the integers and between
// float and double, -x, !x. C's usual conversions: a double operand (a double constant too: 0.5) makes the operation a
// double's, a float with a float or an integer a float's. Isomorphic ES module: no DOM and no Node APIs.
import { BOOL, INT, typeOf } from './c-types.js';
import { F32, F64, MATH } from './c-float.js';
import { parse } from './c-parse.js';
import { SOFTFLOAT32, SOFTFLOAT64 } from './c-softfloat.js';
import { MATHLIB } from './c-mathlib.js';

const U32 = { w: 32, s: false, ap: false };
const SEQ_LIB = new Set(['ap_f32_fmod', 'ap_f64_fmod']);
let LIB = null;
/** The library's functions (parsed once, their loops unrolled). */
function lib() {
  if (LIB) return LIB;
  const ast = parse(`${SOFTFLOAT32}\n${SOFTFLOAT64}\n${MATHLIB}`, 'silinx-softfloat.c');
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.kind === 'func' && SEQ_LIB.has(n.name)) return;   // (its loop the state machine's)
    if (n.kind === 'for' || n.kind === 'while' || n.kind === 'do') n.unroll = true;
    for (const [k, v] of Object.entries(n)) if (k !== 'loc' && k !== 'type') walk(v);
  };
  walk(ast.items);
  LIB = new Map(ast.items.filter((it) => it.kind === 'func' && it.body).map((f) => [f.name, f]));
  return LIB;
}
/** A function of the library (its names ap_f32_…, ap_f64_…), else null. */
export const softfloatFn = (name) => (/^ap_f(32|64)_/.test(name) ? lib().get(name) ?? null : null);
let SEQ_MATH = null;
/** funcs with math.h's functions that are loops in hardware (fmod, fmodf, #2144), to be inlined into a sequential top as a
 *  function of its own with a loop is; a function of the program named so stays. A call of constants is folded (noInline). */
export function withSeqMath(funcs) {
  if (!SEQ_MATH) {
    const ast = parse(`float fmodf(float a, float b) { return ap_bits_float(ap_f32_fmod(ap_float_bits(a), ap_float_bits(b))); }
double fmod(double a, double b) { return ap_bits_double(ap_f64_fmod(ap_double_bits(a), ap_double_bits(b))); }`, 'silinx-softfloat.c');
    SEQ_MATH = [...ast.items.map((f) => [f.name, { ...f, library: true }]), ...[...SEQ_LIB].map((n) => [n, { ...lib().get(n), library: true }])];
  }
  const all = new Map(SEQ_MATH);
  for (const [k, v] of funcs) all.set(k, v);
  return all;
}
const f32 = new Float32Array(1), u32 = new Uint32Array(f32.buffer);
const f64 = new Float64Array(1), u64 = new BigUint64Array(f64.buffer);
/** A number's binary32 bits (a NaN the quiet NaN). */
export function f32Bits(x) { if (Number.isNaN(x)) return 0x7fc00000n; f32[0] = x; return BigInt(u32[0]); }
/** A number's binary64 bits (a NaN the quiet NaN). */
export function f64Bits(x) { if (Number.isNaN(x)) return 0x7ff8000000000000n; f64[0] = x; return u64[0]; }
const TYPE = { 32: F32, 64: F64 };
// (math.h's made in hardware of any value, #1783: its precision and the library's operation)
// (floor, ceil, trunc, round, fmin, fmax, copysign too, #1843)
const HW_MATH = { sqrt: [64, 'sqrt'], sqrtf: [32, 'sqrt'], fabs: [64, 'abs'], fabsf: [32, 'abs'] };
for (const op of ['floor', 'ceil', 'trunc', 'round', 'fmin', 'fmax', 'copysign']) { HW_MATH[op] = [64, op]; HW_MATH[`${op}f`] = [32, op]; }
// (exp, log, sin, cos, pow, tan, …: Silinx's own library, core/c-mathlib.js, #1761, #2119)
for (const op of ['exp', 'log', 'sin', 'cos', 'pow', 'tan', 'log2', 'log10', 'exp2', 'hypot', 'fmod', 'atan', 'asin', 'acos', 'atan2', 'sinh', 'cosh', 'tanh', 'cbrt']) { HW_MATH[op] = [64, op]; HW_MATH[`${op}f`] = [32, op]; }

const SEQ_MATH_NAMES = new Set(['fmod', 'fmodf']);

export const floatMethods = {
  /** The library's function `name` called on the values args, where the operation is: its result of type rt. */
  softfloat(name, args, rt, g, loc) {
    const fn = lib().get(name);
    const scope = new Map();
    fn.params.forEach((pa, k) => { const t = typeOf(pa.type); scope.set(pa.name, { kind: 'var', t, val: this.v(this.g.add('ext', [args[k].id], t), t).id, name: pa.name }); });
    const saved = this.scopes;
    let r;
    // (a function of its arguments only: no guard)
    try { r = this.inline(fn, scope, this.T); } finally { this.scopes = saved; }
    if (!r) this.error(loc, `internal: ${name} gave no value`);
    return this.v(this.g.add('ext', [r.id], rt), rt);
  },
  /** A double constant as a float or a double (a float's: its value rounded once, as the C simulation's). */
  fconstBits(x, fl) { return fl === 32 ? this.v(this.g.const(f32Bits(Math.fround(x.fconst)), F32), F32) : this.v(this.g.const(f64Bits(x.fconst), F64), F64); },
  /** x as a value of the type t, one of them a float or a double. */
  flConv(x, t, g) {
    if (x.fconst !== undefined) {
      if (t.fl) return this.fconstBits(x, t.fl);
      // (to an integer: truncated, its bits as the C simulation's)
      if (t.bool) return this.v(this.g.const(x.fconst ? 1 : 0, BOOL), t);
      return this.v(this.g.const(Number.isFinite(x.fconst) ? BigInt(Math.trunc(x.fconst)) : 0n, t), t);
    }
    if (x.t.fl && t.fl) {
      if (x.t.fl === t.fl) return x;
      return this.softfloat(t.fl === 64 ? 'ap_f64_from_f32' : 'ap_f32_from_f64', [x], TYPE[t.fl], g, x.loc);
    }
    const p = `ap_f${t.fl || x.t.fl}`;
    if (t.fl) {
      if (x.t.fx) this.error(x.loc, `an ap_fixed converted to a ${t.fl === 32 ? 'float' : 'double'}: not made yet`);
      if (x.t.w > 32) this.error(x.loc, `a ${x.t.w}-bit integer converted to a ${t.fl === 32 ? 'float' : 'double'}: not made yet (32 bits at most)`);
      return x.t.s || x.t.w < 32 ? this.softfloat(`${p}_from_i32`, [this.v(this.g.add('ext', [x.id], { w: 32, s: x.t.s }), INT)], TYPE[t.fl], g, x.loc)
        : this.softfloat(`${p}_from_u32`, [x], TYPE[t.fl], g, x.loc);
    }
    if (t.bool) return this.v(this.flBool(x), t);
    if (t.fx) this.error(x.loc, `a ${x.t.fl === 32 ? 'float' : 'double'} converted to an ap_fixed: not made yet`);
    const u = this.softfloat(t.s ? `${p}_to_i32` : `${p}_to_u32`, [x], t.s ? INT : U32, g, x.loc);
    return this.v(this.g.add('ext', [u.id], t), t);
  },
  /** Whether a value is not 0 (+0, -0: false; a NaN: true). */
  flBool(x) {
    if (x.fconst !== undefined) return this.g.const(x.fconst ? 1 : 0, BOOL);
    const t = TYPE[x.t.fl];
    return this.g.add('ne', [this.g.add('and', [x.id, this.g.const((1n << BigInt(t.w - 1)) - 1n, t)], t), this.g.const(0, t)], BOOL);
  },
  /** The precision of an operation of l and r (C's usual conversions): 64 when one is a double (or a double constant). */
  flPrecision(l, r) {
    const p = (x) => (x.fconst !== undefined ? (x.single ? 32 : 64) : x.t.fl || 0);
    return Math.max(p(l), p(r)) === 64 ? 64 : 32;
  },
  /** A constant's number (a floating-point one's value, an integer's), else null. */
  flNumber(x) {
    if (x.fconst !== undefined) return x.fconst;
    const n = this.g.nodes[x.id];
    if (n?.op !== 'const') return null;
    if (!x.t.fl) return Number(n.k);
    const k = BigInt.asUintN(x.t.w, n.k);
    if (x.t.fl === 32) { u32[0] = Number(k); return f32[0]; }
    u64[0] = k;
    return f64[0];
  },
  /** math.h's function of constant arguments: its value, as the C simulation's (#1779); of others, not made yet. */
  flMath(name, e, g) {
    const m = MATH[name];
    const vals = e.args.map((a) => this.expr(a, g));
    const xs = vals.map((x) => this.flNumber(x));
    if (xs.length !== m.n) this.error(e.loc, `${name}() takes ${m.n} argument(s)`);
    // (fmod's reduction: a step a cycle, in a state machine, #2144)
    if (xs.some((x) => x === null) && SEQ_MATH_NAMES.has(name)) this.error(e.loc, `${name}: a step a cycle (a sequential module: not supported yet here, #1526)`);
    // (sqrt, fabs, floor, … of values that are not constants: the library's, #1783, #1843)
    if (xs.some((x) => x === null) && HW_MATH[name]) {
      const [fl, op] = HW_MATH[name];
      const as = vals.map((x) => this.flConv(x, TYPE[fl], g));
      if (op === 'abs') return this.v(this.g.add('and', [as[0].id, this.g.const((1n << BigInt(fl - 1)) - 1n, TYPE[fl])], TYPE[fl]), TYPE[fl]);
      return this.softfloat(`ap_f${fl}_${op}`, as, TYPE[fl], g, e.loc);
    }
    if (xs.some((x) => x === null)) this.error(e.loc, `${name}: floating point is not supported in Silinx HLS yet (math.h in hardware: sqrt, fabs, floor, ceil, trunc, round, fmin, fmax, copysign, exp, log, sin, cos, pow, tan, log2, log10, exp2, hypot, fmod, atan, asin, acos, atan2, sinh, cosh, tanh and cbrt, the others only of constants, a table computed at synthesis, #1761)`);
    const r = m.f(...xs);
    if (m.int) return this.v(this.g.const(BigInt(r), { w: 64, s: true }), { w: 64, s: true });
    return name.endsWith('f') ? this.v(this.g.const(f32Bits(Math.fround(r)), F32), F32) : this.v(this.g.const(f64Bits(r), F64), F64);
  },
  flArith(op, l, r, e, g) {
    const fl = this.flPrecision(l, r);
    const a = this.flConv(l, TYPE[fl], g), b = this.flConv(r, TYPE[fl], g);
    // (a division of constants: folded, as the C simulation computes it, #1779)
    if (op === '/' && this.flNumber(a) !== null && this.flNumber(b) !== null) {
      const q = this.flNumber(a) / this.flNumber(b);
      return fl === 32 ? this.v(this.g.const(f32Bits(Math.fround(q)), F32), F32) : this.v(this.g.const(f64Bits(q), F64), F64);
    }
    const fn = { '+': 'add', '-': 'sub', '*': 'mul', '/': 'div' }[op];
    if (!fn) this.error(e.loc, `'${op}' of a floating-point value is not C`);
    return this.softfloat(`ap_f${fl}_${fn}`, [a, b], TYPE[fl], g, e.loc);
  },
  flCompare(op, l, r, g, loc) {
    const fl = this.flPrecision(l, r);
    const a = this.flConv(l, TYPE[fl], g), b = this.flConv(r, TYPE[fl], g);
    const call = (name, x, y) => this.softfloat(`ap_f${fl}_${name}`, [x, y], BOOL, g, loc);
    switch (op) {
      case '==': return call('eq', a, b);
      case '!=': return this.v(this.not(call('eq', a, b).id), BOOL);
      case '<': return call('lt', a, b);
      case '<=': return call('le', a, b);
      case '>': return call('lt', b, a);
      default: return call('le', b, a);
    }
  },
  /** -x: its sign flipped. */
  flNeg(x) {
    const t = TYPE[x.t.fl];
    return this.v(this.g.add('xor', [x.id, this.g.const(1n << BigInt(t.w - 1), t)], t), t);
  },
  /** The type of a ?: of a and b, one of them floating point: C's usual conversions. */
  flType(a, b) { return TYPE[this.flPrecision(a, b)]; },
};
