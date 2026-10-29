// Silinx HLS: float and double in the C simulation's test bench (not in hardware: core/c-check.js refuses them in a
// synthesized function). Their types, printf's %f %e %g (and C++'s cout of a double, %g with 6 digits) printed exactly
// as C's library prints them (the double's exact value, rounded half to even), math.h's functions. Isomorphic ES module.
//
//   F64, F32                          the types (t.fl: their bits)
//   fmtFloat(conv, x, prec, flags)    printf's conversion (f F e E g G) of the number x, without its width
//   MATH                              name -> { n: its arguments, f: (...numbers) -> number, int: an integer result }
//   BITCASTS                          a union's float and double members (core/c-union.js, #1896): name -> { fl: the
//                                     float's bits, bits: true for float -> bits, else bits -> float }

import { JS_MATH } from './c-mathlib.js';

export const F64 = { fl: 64, w: 64, s: true };
export const F32 = { fl: 32, w: 32, s: true };
export const floatType = (t) => (t.name === 'float' ? F32 : F64);
export const BITCASTS = { ap_float_bits: { fl: 32, bits: true }, ap_double_bits: { fl: 64, bits: true }, ap_bits_float: { fl: 32 }, ap_bits_double: { fl: 64 } };

/** x = m * 2^e exactly (m a BigInt, x finite and positive). */
function parts(x) {
  const dv = new DataView(new ArrayBuffer(8));
  dv.setFloat64(0, x);
  const hi = dv.getUint32(0), lo = dv.getUint32(4);
  const exp = (hi >>> 20) & 0x7ff;
  let m = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo);
  if (exp) m |= 1n << 52n;
  return { m, e: (exp || 1) - 1075 };
}
/** round(x * 10^k) half to even, x = m * 2^e. */
function scaled(m, e, k) {
  let num = m, den = 1n;
  if (e >= 0) num <<= BigInt(e); else den <<= BigInt(-e);
  if (k >= 0) num *= 10n ** BigInt(k); else den *= 10n ** BigInt(-k);
  const q = num / den, r = num % den;
  return 2n * r > den || (2n * r === den && q % 2n === 1n) ? q + 1n : q;
}
/** |x| with p decimals (%f). */
function fixed(x, p) {
  if (x === 0) return p ? `0.${'0'.repeat(p)}` : '0';
  const { m, e } = parts(x);
  const d = scaled(m, e, p).toString().padStart(p + 1, '0');
  return p ? `${d.slice(0, -p)}.${d.slice(-p)}` : d;
}
/** |x| as d.ddd and its exponent, p decimals (%e). */
function sci(x, p) {
  if (x === 0) return { digits: '0'.repeat(p + 1), exp: 0 };
  const { m, e } = parts(x);
  let X = Math.floor(Math.log10(x));
  for (let n = 0; n < 3; n++) {
    const d = scaled(m, e, p - X).toString();
    if (d.length > p + 1) { X++; continue; }
    if (d.length < p + 1) { X--; continue; }
    return { digits: d, exp: X };
  }
  return { digits: scaled(m, e, p - X).toString().slice(0, p + 1), exp: X };
}
const expText = (X, upper) => `${upper ? 'E' : 'e'}${X < 0 ? '-' : '+'}${String(Math.abs(X)).padStart(2, '0')}`;

export function fmtFloat(conv, x, prec, flags = '') {
  const upper = conv === conv.toUpperCase();
  const sign = x < 0 || Object.is(x, -0) ? '-' : flags.includes('+') ? '+' : flags.includes(' ') ? ' ' : '';
  if (Number.isNaN(x)) return `${flags.includes('+') ? '+' : ''}${upper ? 'NAN' : 'nan'}`;
  if (!Number.isFinite(x)) return `${sign}${upper ? 'INF' : 'inf'}`;
  const a = Math.abs(x);
  const c = conv.toLowerCase();
  if (c === 'f') return sign + fixed(a, prec ?? 6) + (prec === 0 && flags.includes('#') ? '.' : '');
  if (c === 'e') {
    const p = prec ?? 6;
    const { digits, exp } = sci(a, p);
    return `${sign}${digits[0]}${p || flags.includes('#') ? '.' : ''}${digits.slice(1)}${expText(exp, upper)}`;
  }
  // %g: %e or %f by the exponent, P significant digits, the trailing zeros dropped (not with #)
  const P = prec === undefined ? 6 : prec === 0 ? 1 : prec;
  const { exp } = sci(a, P - 1);
  let s;
  if (P > exp && exp >= -4) s = fixed(a, P - 1 - exp);
  else { const { digits } = sci(a, P - 1); s = `${digits[0]}.${digits.slice(1)}${expText(exp, upper)}`; }
  if (!flags.includes('#')) {
    const [mant, ex = ''] = s.split(/(?=[eE])/);
    s = (mant.includes('.') ? mant.replace(/0+$/, '').replace(/\.$/, '') : mant) + ex;
  }
  return sign + s;
}

const R = (f) => ({ n: 1, f });
const CMIN = (a, b) => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.min(a, b));
const CMAX = (a, b) => (Number.isNaN(a) ? b : Number.isNaN(b) ? a : Math.max(a, b));
const CSIGN = (a, b) => (b < 0 || Object.is(b, -0) ? -Math.abs(a) : Math.abs(a));
// (exp, log, sin, cos, pow and their float ones: Silinx's own (core/c-mathlib.js), the hardware's algorithm, #1761)
export const MATH = {
  sqrt: R(Math.sqrt), sqrtf: R(Math.sqrt), fabs: R(Math.abs), fabsf: R(Math.abs), exp: R(JS_MATH.exp), log: R(JS_MATH.log), log2: R(Math.log2),
  log10: R(Math.log10), sin: R(JS_MATH.sin), cos: R(JS_MATH.cos), tan: R(Math.tan), asin: R(Math.asin), acos: R(Math.acos),
  atan: R(Math.atan), sinh: R(Math.sinh), cosh: R(Math.cosh), tanh: R(Math.tanh), floor: R(Math.floor), ceil: R(Math.ceil),
  trunc: R(Math.trunc), cbrt: R(Math.cbrt), expf: R(JS_MATH.expf), logf: R(JS_MATH.logf), sinf: R(JS_MATH.sinf), cosf: R(JS_MATH.cosf),
  // (round: half away from zero, as C's)
  round: R((x) => Math.sign(x) * Math.round(Math.abs(x))), roundf: R((x) => Math.sign(x) * Math.round(Math.abs(x))),
  pow: { n: 2, f: JS_MATH.pow }, powf: { n: 2, f: JS_MATH.powf }, atan2: { n: 2, f: Math.atan2 }, hypot: { n: 2, f: Math.hypot },
  fmod: { n: 2, f: (a, b) => a % b },
  // (fmin, fmax: a NaN and a number the number, as C's; copysign: a NaN's sign not known, +, #1843)
  fmin: { n: 2, f: CMIN }, fmax: { n: 2, f: CMAX }, fminf: { n: 2, f: CMIN }, fmaxf: { n: 2, f: CMAX },
  floorf: R(Math.floor), ceilf: R(Math.ceil), truncf: R(Math.trunc),
  copysign: { n: 2, f: CSIGN }, copysignf: { n: 2, f: CSIGN },
  lround: { n: 1, f: (x) => Math.sign(x) * Math.round(Math.abs(x)), int: true },
};
