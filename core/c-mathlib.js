// Silinx HLS (#1761, #2119): math.h's exp, log, sin, cos, pow and the others (and their float ones) of Silinx's own, as Vitis
// HLS has its hls_math: the same algorithm in the hardware and in the C simulation, so that the co-simulation compares
// equal bits. Each algorithm is written once, against an interface of operations (`ops`): the hardware's is the C the
// soft-float library adds to itself (core/c-softfloat.js's ap_p_* on the values' bits, inlined by the synthesis), the C
// simulation's JavaScript (each operation an IEEE one, rounded to the format: Math.fround for a float). Only the
// operations IEEE rounds exactly (+ - * /, the comparisons, the conversions, a power of two) are used, so both give the
// same bits. Isomorphic ES module.
//
//   exp: Cody-Waite reduction by ln 2, a Taylor polynomial on |r| <= ln 2 / 2, the scaling by 2^n in two steps;
//   log: x = m 2^e, m in [sqrt(2)/2, sqrt(2)), log m = 2 atanh(s), s = (m - 1) / (m + 1), e ln 2 in two parts;
//   sin, cos: n = round(x 2/pi), r = x - n pi/2 in three parts, the quadrant n & 3 choosing sin r or cos r; accurate
//     for |x| up to 32768 (float) or 2^20 (double), where n pi/2's first part stays exact, an argument beyond it taken
//     at that bound's sign (the same bits in both, not the true sine);
//   pow: C99's special cases; an integer y under 2048 in magnitude by squaring (2^3 is 8), else exp(y log |x|), in double
//     (powf: on its arguments as doubles, rounded to a float); its sign negative for x < 0 and y an odd integer;
//   tan: sin r / cos r, or -cos r / sin r, on sin and cos's reduction;
//   log2, log10: log's m and e, e times the constant and log m times its inverse, each constant in two parts (a power of
//     two's log2 exact); exp2: exp's polynomial on (x - n) ln 2, n = round(x), so that an integer's is exact;
//   hypot: scaled by big's power of two in two steps, so that no square overflows or underflows, sqrt, scaled back;
//   fmod: the exact remainder, by long division of the significands, one bit a step, for x / y up to 2^FMOD_STEPS; a
//     quotient beyond it gives NaN (a loop over every exponent would be a circuit of 277 steps in float, 2098 in double);
//   atan: fdlibm's: |x| reduced to under 7/16 by one of four points, a polynomial in x^2, the point's atan in two parts;
//   atan2, asin, acos: from atan: atan(|y / x|) in its quadrant, atan(x / sqrt((1 - x)(1 + x))),
//     2 atan(sqrt((1 - x) / (1 + x)));
//   sinh, cosh, tanh: from exp, E = e^|x|: a Taylor polynomial for sinh and tanh under 1 in magnitude (E - 1/E would
//     cancel); e^|x|/2 from HYP_BIG on, as e^(|x|/2) e^(|x|/2) / 2 so that it overflows only where the result does;
//   cbrt: x = m 2^(3 q + r), a quadratic of m times the cube root of 2^r, Halley's steps and a last Newton's.
//
//   MATHLIB: the C source (after SOFTFLOAT32 and SOFTFLOAT64): ap_f32_<name> and ap_f64_<name> of each function
//   JS_MATH: { exp, expf, log, logf, … } the C simulation's functions of numbers

const FMT = {
  f32: { T: 'unsigned', u: 'u', W: 32, M: 23, bias: 127, emax: 255 },
  f64: { T: 'unsigned long long', u: 'ull', W: 64, M: 52, bias: 1023, emax: 2047 },
};
const fact = (n) => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };

// each format's constants: the ranges and the reductions' parts (fdlibm's for double; for float, a first part with few
// bits so that n times it is exact)
const K = {
  f32: {
    expLo: -104, expHi: 104, ln2Hi: 0.693359375, ln2Lo: -2.12194440e-4, expTerms: 7,
    logTerms: 4, sub: 25, minNormal: 2 ** -126,
    trigMax: 32768, pio2: [1.5703125, 4.83751296997e-4, 7.54978995489e-8], sinTerms: 5, cosTerms: 6,
    exp2Max: 151, ivln2: [1.4428710938, -1.7605285393e-4], ivln10: 4.3429449201e-1, log10of2: [3.0102920532e-1, 7.9034151668e-7],
    atanHi: [4.6364760399e-1, 7.8539812565e-1, 9.8279368877e-1, 1.5707962513], atanLo: [5.0121582440e-9, 3.7748947079e-8, 3.4473217170e-8, 7.5497894159e-8],
    atanT: [3.3333328366e-1, -1.9999158382e-1, 1.4253635705e-1, -1.0648017377e-1, 6.1687607318e-2], piLo: -8.7422776573e-8,
    hypBig: 12, hypTerms: 6, cbrtSub: 27, cbrtHalley: 1,
  },
  f64: {
    expLo: -746, expHi: 746, ln2Hi: 6.93147180369123816490e-01, ln2Lo: 1.90821492927058770002e-10, expTerms: 13,
    logTerms: 10, sub: 54, minNormal: 2 ** -1022,
    trigMax: 2 ** 20, pio2: [1.57079632673412561417e+00, 6.07710050630396597660e-11, 2.02226624879595063154e-21], sinTerms: 8, cosTerms: 9,
    exp2Max: 1076, ivln2: [1.44269504072144627571, 1.67517131648865118103e-10], ivln10: 4.34294481903251816668e-1, log10of2: [3.01029995663611771306e-1, 3.69423907715893078616e-13],
    atanHi: [4.63647609000806093515e-1, 7.85398163397448278999e-1, 9.82793723247329054082e-1, 1.57079632679489655800], atanLo: [2.26987774529616870924e-17, 3.06161699786838301793e-17, 1.39033110312309984516e-17, 6.12323399573676603587e-17],
    atanT: [3.33333333333329318027e-1, -1.99999999998764832476e-1, 1.42857142725034663711e-1, -1.11111104054623557880e-1, 9.09088713343650656196e-2, -7.69187620504482999495e-2, 6.66107313738753120669e-2, -5.83357013379057348645e-2, 4.97687799461593236017e-2, -3.65315727442169155270e-2, 1.62858201153657823623e-2], piLo: 1.2246467991473531772e-16,
    hypBig: 22, hypTerms: 10, cbrtSub: 54, cbrtHalley: 2,
  },
};
const FMOD_STEPS = 64;

// ---- the algorithms, on ops: f(x) a value of the format, b a boolean, i an int
function exp(o, x) {
  const k = K[o.p];
  const xc = o.sel(o.lt(x, o.c(k.expLo)), o.c(k.expLo), o.sel(o.lt(o.c(k.expHi), x), o.c(k.expHi), x));
  const n = o.roundi(o.mul(xc, o.c(1 / Math.LN2)));
  const fn = o.itof(n);
  const r = o.sub(o.sub(xc, o.mul(fn, o.c(k.ln2Hi))), o.mul(fn, o.c(k.ln2Lo)));
  return o.sel(o.isnan(x), o.nan(), expScaled(o, r, n));
}

// e^r 2^n, |r| <= ln 2 / 2
function expScaled(o, r, n) {
  const k = K[o.p];
  // 1 + r (1 + r (1/2 + r (1/6 + …)))
  let p = o.c(1 / fact(k.expTerms));
  for (let i = k.expTerms - 1; i >= 0; i--) p = o.add(o.c(1 / fact(i)), o.mul(r, p));
  const a = o.ishr1(n);
  return o.mul(o.mul(p, o.pow2(a)), o.pow2(o.isub(n, a)));
}

function exp2(o, x) {
  const k = K[o.p];
  const xc = o.sel(o.lt(x, o.c(-k.exp2Max)), o.c(-k.exp2Max), o.sel(o.lt(o.c(k.exp2Max), x), o.c(k.exp2Max), x));
  const n = o.roundi(xc);
  return o.sel(o.isnan(x), o.nan(), expScaled(o, o.mul(o.sub(xc, o.itof(n)), o.c(Math.LN2)), n));
}

// x = m 2^e: [log m, e as a value of the format]
function logParts(o, x) {
  const k = K[o.p];
  const tiny = o.lt(x, o.c(k.minNormal));
  const xs = o.sel(tiny, o.mul(x, o.pow2(o.ic(k.sub))), x);
  const big = o.lt(o.c(Math.SQRT2), o.mant(xs));
  const m = o.sel(big, o.mul(o.mant(xs), o.c(0.5)), o.mant(xs));
  const e = o.isub(o.iadd(o.expo(xs), o.seli(big, o.ic(1), o.ic(0))), o.seli(tiny, o.ic(k.sub), o.ic(0)));
  const f = o.sub(m, o.c(1));
  const s = o.div(f, o.add(o.c(2), f));
  const z = o.mul(s, s);
  // log(1 + f) = 2 s + s z (2/3 + z (2/5 + …))
  let q = o.c(2 / (2 * k.logTerms + 1));
  for (let i = k.logTerms - 1; i >= 1; i--) q = o.add(o.c(2 / (2 * i + 1)), o.mul(z, q));
  return [o.add(o.mul(o.c(2), s), o.mul(o.mul(s, z), q)), o.itof(e)];
}
// log 0 = -inf, log of a negative or a NaN NaN, log inf = inf
function logSpecial(o, x, y) {
  const zero = o.eq(x, o.c(0));
  return o.sel(o.or(o.isnan(x), o.lt(x, o.c(0))), o.nan(), o.sel(zero, o.c(-Infinity), o.sel(o.isinf(x), x, y)));
}
function log(o, x) {
  const k = K[o.p];
  const [lm, fe] = logParts(o, x);
  return logSpecial(o, x, o.add(o.mul(fe, o.c(k.ln2Hi)), o.add(lm, o.mul(fe, o.c(k.ln2Lo)))));
}
function log2(o, x) {
  const k = K[o.p];
  const [lm, fe] = logParts(o, x);
  return logSpecial(o, x, o.add(fe, o.add(o.mul(lm, o.c(k.ivln2[0])), o.mul(lm, o.c(k.ivln2[1])))));
}
function log10(o, x) {
  const k = K[o.p];
  const [lm, fe] = logParts(o, x);
  return logSpecial(o, x, o.add(o.mul(fe, o.c(k.log10of2[0])), o.add(o.mul(lm, o.c(k.ivln10)), o.mul(fe, o.c(k.log10of2[1])))));
}

// the reduction of sin and cos: [r, n & 3]
function trig(o, x) {
  const k = K[o.p];
  const xc = o.sel(o.lt(x, o.c(-k.trigMax)), o.c(-k.trigMax), o.sel(o.lt(o.c(k.trigMax), x), o.c(k.trigMax), x));
  const n = o.roundi(o.mul(xc, o.c(2 / Math.PI)));
  const fn = o.itof(n);
  const r = o.sub(o.sub(o.sub(xc, o.mul(fn, o.c(k.pio2[0]))), o.mul(fn, o.c(k.pio2[1]))), o.mul(fn, o.c(k.pio2[2])));
  const z = o.mul(r, r);
  // sin r = r (1 + z (-1/6 + z (1/120 + …))), cos r = 1 + z (-1/2 + z (1/24 + …))
  let ps = o.c((k.sinTerms % 2 ? -1 : 1) / fact(2 * k.sinTerms + 1));
  for (let i = k.sinTerms - 1; i >= 0; i--) ps = o.add(o.c((i % 2 ? -1 : 1) / fact(2 * i + 1)), o.mul(z, ps));
  let pc = o.c((k.cosTerms % 2 ? -1 : 1) / fact(2 * k.cosTerms));
  for (let i = k.cosTerms - 1; i >= 0; i--) pc = o.add(o.c((i % 2 ? -1 : 1) / fact(2 * i)), o.mul(z, pc));
  return [o.mul(r, ps), pc, o.iand3(n)];
}
function sin(o, x) {
  const [s, c, q] = trig(o, x);
  const neg = (v) => o.mul(v, o.c(-1));
  const y = o.sel(o.ieq(q, 0), s, o.sel(o.ieq(q, 1), c, o.sel(o.ieq(q, 2), neg(s), neg(c))));
  return o.sel(o.or(o.isnan(x), o.isinf(x)), o.nan(), y);
}
function cos(o, x) {
  const [s, c, q] = trig(o, x);
  const neg = (v) => o.mul(v, o.c(-1));
  const y = o.sel(o.ieq(q, 0), c, o.sel(o.ieq(q, 1), neg(s), o.sel(o.ieq(q, 2), neg(c), s)));
  return o.sel(o.or(o.isnan(x), o.isinf(x)), o.nan(), y);
}
function tan(o, x) {
  const [s, c, q] = trig(o, x);
  const even = o.or(o.ieq(q, 0), o.ieq(q, 2));
  const y = o.sel(even, o.div(s, c), o.div(o.mul(c, o.c(-1)), s));
  return o.sel(o.or(o.isnan(x), o.isinf(x)), o.nan(), y);
}

// C99: an infinity gives inf, a NaN too; hypot(x, ±0) = |x|
function hypot(o, x, y) {
  const a = o.abs(x), b = o.abs(y), less = o.lt(a, b);
  const big = o.sel(less, b, a), small = o.sel(less, a, b);
  const e = o.expo(big), h = o.ishr1(e), l = o.isub(e, h);
  const down = (v) => o.mul(o.mul(v, o.pow2(o.isub(o.ic(0), h))), o.pow2(o.isub(o.ic(0), l)));
  const u = down(big), v = down(small);
  const r = o.sqrt(o.add(o.mul(u, u), o.mul(v, v)));
  const res = o.mul(o.mul(r, o.pow2(h)), o.pow2(l));
  return o.sel(o.or(o.isinf(x), o.isinf(y)), o.c(Infinity), o.sel(o.or(o.isnan(x), o.isnan(y)), o.nan(), res));
}

// C99: the sign of x; x infinite or y zero NaN; y infinite x
function fmod(o, x, y) {
  const k = K[o.p], M = FMT[o.p].M;
  const ax = o.abs(x), ay = o.abs(y);
  // (a subnormal y scaled, x with it, so that y's significand has its top bit; an x overflowing is one too far anyway)
  const tiny = o.lt(ay, o.c(k.minNormal)), scale = o.pow2(o.ic(k.sub));
  const sx = o.sel(tiny, o.mul(ax, scale), ax), sy = o.sel(tiny, o.mul(ay, scale), ay);
  const ey = o.expo(sy), d = o.isub(o.expo(sx), ey), m = o.sig(sy);
  let rem = o.sig(sx);
  rem = o.usel(o.uge(rem, m), o.usub(rem, m), rem);
  for (let i = 0; i < FMOD_STEPS; i++) {
    const r2 = o.ushl1(rem);
    rem = o.usel(o.ineg(o.isub(o.ic(i), d)), o.usel(o.uge(r2, m), o.usub(r2, m), r2), rem);
  }
  // (the remainder a multiple of y's last bit: exact, in the format and scaled)
  const e = o.isub(o.isub(ey, o.ic(M)), o.seli(tiny, o.ic(k.sub), o.ic(0))), h = o.ishr1(e);
  const z = o.sign(o.mul(o.mul(o.ufrom(rem), o.pow2(h)), o.pow2(o.isub(e, h))), x);
  const bad = o.or(o.or(o.isnan(x), o.isnan(y)), o.or(o.isinf(x), o.eq(y, o.c(0))));
  return o.sel(bad, o.nan(), o.sel(o.lt(ax, ay), x, o.sel(o.ineg(o.isub(o.ic(FMOD_STEPS), d)), o.nan(), z)));
}

function atan(o, x) {
  const k = K[o.p], ax = o.abs(x), T = k.atanT;
  const i0 = o.lt(ax, o.c(7 / 16)), i1 = o.lt(ax, o.c(11 / 16)), i2 = o.lt(ax, o.c(19 / 16)), i3 = o.lt(ax, o.c(39 / 16));
  const pick = (a, b, c, d, e) => o.sel(i0, a, o.sel(i1, b, o.sel(i2, c, o.sel(i3, d, e))));
  const one = o.c(1), am1 = o.sub(ax, one);
  const t = o.div(pick(ax, o.sub(o.mul(o.c(2), ax), one), am1, o.sub(ax, o.c(1.5)), o.c(-1)),
    pick(one, o.add(o.c(2), ax), o.add(ax, one), o.add(one, o.mul(o.c(1.5), ax)), ax));
  const z = o.mul(t, t), w = o.mul(z, z);
  // z (T0 + w (T2 + …)) + w (T1 + w (T3 + …))
  const horner = (from) => { let i = T.length - 1; if (i % 2 !== from) i--; let p = o.c(T[i]); for (i -= 2; i >= from; i -= 2) p = o.add(o.c(T[i]), o.mul(w, p)); return p; };
  const s = o.add(o.mul(z, horner(0)), o.mul(w, horner(1)));
  const hi = pick(o.c(0), ...k.atanHi.map((v) => o.c(v))), lo = pick(o.c(0), ...k.atanLo.map((v) => o.c(v)));
  const y = o.sub(hi, o.sub(o.sub(o.mul(t, s), lo), t));
  return o.sel(o.isnan(x), o.nan(), o.sign(y, x));
}

// C99: the sign of y; ±0 and ±0, ±inf and ±inf their own; the others come out of |y / x| (±0 or inf)
function atan2(o, y, x) {
  const k = K[o.p], zero = o.c(0);
  const q = o.abs(o.div(y, x)), a = o.call('atan', q);
  // (a quotient overflowing, y infinite too: pi/2 itself, in either quadrant)
  const general = o.sel(o.and(o.lt(x, zero), o.not(o.isinf(q))), o.sub(o.c(Math.PI), o.sub(a, o.c(k.piLo))), a);
  const neg = o.isneg(x);
  const z = o.sel(o.and(o.eq(y, zero), o.eq(x, zero)), o.sel(neg, o.c(Math.PI), zero),
    o.sel(o.and(o.isinf(y), o.isinf(x)), o.sel(neg, o.c(3 * Math.PI / 4), o.c(Math.PI / 4)), general));
  return o.sel(o.or(o.isnan(x), o.isnan(y)), o.nan(), o.sign(z, y));
}
const outOfUnit = (o, x) => o.lt(o.c(1), o.abs(x));
function asin(o, x) {
  const one = o.c(1);
  const y = o.call('atan', o.div(x, o.sqrt(o.mul(o.sub(one, x), o.add(one, x)))));
  return o.sel(o.or(o.isnan(x), outOfUnit(o, x)), o.nan(), y);
}
function acos(o, x) {
  const one = o.c(1);
  const y = o.mul(o.c(2), o.call('atan', o.sqrt(o.div(o.sub(one, x), o.add(one, x)))));
  return o.sel(o.or(o.isnan(x), outOfUnit(o, x)), o.nan(), y);
}

// [the argument's magnitude, E = e^|x| (from HYP_BIG on e^(|x|/2)), |x| from HYP_BIG on, under 1, sinh's polynomial]
function hyp(o, x) {
  const k = K[o.p], ax = o.abs(x), half = o.c(0.5);
  const big = o.lt(o.c(k.hypBig), ax), small = o.lt(ax, o.c(1));
  const E = o.call('exp', o.sel(big, o.mul(ax, half), ax));
  const z = o.mul(ax, ax);
  // x (1 + z (1/6 + z (1/120 + …)))
  let p = o.c(1 / fact(2 * k.hypTerms + 1));
  for (let i = k.hypTerms - 1; i >= 0; i--) p = o.add(o.c(1 / fact(2 * i + 1)), o.mul(z, p));
  return { ax, E, big, small, poly: o.mul(ax, p), half, inv: o.div(o.c(1), E) };
}
function sinh(o, x) {
  const { E, big, small, poly, half, inv } = hyp(o, x);
  const y = o.sel(big, o.mul(o.mul(E, half), E), o.sel(small, poly, o.mul(o.sub(E, inv), half)));
  return o.sel(o.isnan(x), o.nan(), o.sign(y, x));
}
function cosh(o, x) {
  const { E, big, half, inv } = hyp(o, x);
  const y = o.sel(big, o.mul(o.mul(E, half), E), o.mul(o.add(E, inv), half));
  return o.sel(o.isnan(x), o.nan(), y);
}
function tanh(o, x) {
  const { E, big, small, poly, inv } = hyp(o, x);
  const y = o.div(o.sel(small, o.mul(o.c(2), poly), o.sub(E, inv)), o.add(E, inv));
  return o.sel(o.isnan(x), o.nan(), o.sign(o.sel(big, o.c(1), y), x));
}

function cbrt(o, x) {
  const k = K[o.p], ax = o.abs(x);
  const tiny = o.lt(ax, o.c(k.minNormal));
  const xs = o.sel(tiny, o.mul(ax, o.pow2(o.ic(k.cbrtSub))), ax);
  const e = o.expo(xs), m = o.mant(xs);
  const q = o.roundi(o.mul(o.itof(e), o.c(1 / 3))), r = o.isub(e, o.iadd(q, o.iadd(q, q)));
  const v = o.mul(m, o.pow2(r));
  // (m^(1/3) on [1, 2) within 0.1%)
  const m3 = o.add(o.c(0.6257), o.mul(m, o.add(o.c(0.4336), o.mul(m, o.c(-0.0584)))));
  let t = o.mul(m3, o.sel(o.ieq(r, 0), o.c(1), o.sel(o.ieq(r, 1), o.c(Math.cbrt(2)), o.c(Math.cbrt(0.5)))));
  const cube = (a) => o.mul(o.mul(a, a), a);
  for (let i = 0; i < k.cbrtHalley; i++) {
    const t3 = cube(t);
    t = o.mul(t, o.div(o.add(t3, o.mul(o.c(2), v)), o.add(o.mul(o.c(2), t3), v)));
  }
  t = o.sub(t, o.div(o.sub(cube(t), v), o.mul(o.c(3), o.mul(t, t))));
  const y = o.mul(t, o.pow2(o.isub(q, o.seli(tiny, o.ic(k.cbrtSub / 3), o.ic(0)))));
  return o.sel(o.isnan(x), o.nan(), o.sel(o.or(o.eq(x, o.c(0)), o.isinf(x)), x, o.sign(y, x)));
}

// pow in double (powf: its arguments as doubles), C99's special cases
function pow(o, x, y) {
  const one = o.c(1), zero = o.c(0), inf = o.c(Infinity);
  const ax = o.mul(x, o.sel(o.lt(x, zero), o.c(-1), one));
  const yInt = o.eq(o.trunc(y), y);
  const yOdd = o.and(yInt, o.not(o.eq(o.mul(o.trunc(o.mul(y, o.c(0.5))), o.c(2)), y)));
  // (an integer y under 2048 in magnitude: |x| multiplied by itself, by squaring, exact while it can be: 2^3 = 8, 2^-1023;
  // a negative y 1 / |x|^-y, or (|x|^-y overflowing) (1 / |x|)^-y; else exp(y log |x|))
  const small = o.and(yInt, o.lt(o.mul(y, o.sel(o.lt(y, zero), o.c(-1), one)), o.c(2048)));
  const yi = o.roundi(o.sel(small, y, zero)), ya = o.iabs(yi);
  const power = (b) => { let acc = one; for (let j = 0; j < 11; j++) { acc = o.sel(o.ibit(ya, j), o.mul(acc, b), acc); b = o.mul(b, b); } return acc; };
  const up = power(ax);
  const intPow = o.sel(o.ineg(yi), o.sel(o.isinf(up), power(o.div(one, ax)), o.div(one, up)), up);
  const mag = o.sel(small, intPow, o.call('exp', o.mul(y, o.call('log', ax))));
  const neg = o.and(o.lt(x, zero), yOdd);
  const general = o.sel(o.and(o.lt(x, zero), o.not(yInt)), o.nan(), o.sel(neg, o.mul(mag, o.c(-1)), mag));
  // |x| = 1 and y infinite: 1; x = ±0: a sign kept when y is odd
  const zx = o.eq(x, zero);
  const zr = o.sel(o.lt(y, zero), inf, zero);
  const zres = o.sel(yOdd, o.mul(zr, o.sel(o.isneg(x), o.c(-1), one)), zr);
  return o.sel(o.eq(y, zero), one, o.sel(o.eq(x, one), one, o.sel(o.or(o.isnan(x), o.isnan(y)), o.nan(),
    o.sel(o.and(o.eq(ax, one), o.isinf(y)), one, o.sel(zx, zres, general)))));
}

const ALGOS = { exp, log, sin, cos, tan, log2, log10, exp2, atan, asin, acos, sinh, cosh, tanh, cbrt };
const ALGOS2 = { hypot, fmod, atan2 };

// ---- the C simulation's ops: numbers (a float's rounded with Math.fround after each operation)
function jsOps(p) {
  const r = p === 'f32' ? Math.fround : (v) => v;
  const dv = new DataView(new ArrayBuffer(8));
  const expo = p === 'f32'
    ? (v) => { dv.setFloat32(0, v); return ((dv.getUint32(0) >>> 23) & 255) - 127; }
    : (v) => { dv.setFloat64(0, v); return ((dv.getUint32(0) >>> 20) & 2047) - 1023; };
  return {
    p,
    c: (v) => r(v), nan: () => NaN,
    add: (a, b) => r(a + b), sub: (a, b) => r(a - b), mul: (a, b) => r(a * b), div: (a, b) => r(a / b),
    lt: (a, b) => a < b, eq: (a, b) => a === b, isnan: (a) => Number.isNaN(a), isinf: (a) => a === Infinity || a === -Infinity,
    isneg: (a) => a < 0 || Object.is(a, -0), abs: (a) => Math.abs(a), sign: (a, b) => (b < 0 || Object.is(b, -0) ? -Math.abs(a) : Math.abs(a)),
    sqrt: (a) => r(Math.sqrt(a)),
    and: (a, b) => a && b, or: (a, b) => a || b, not: (a) => !a,
    sel: (c, a, b) => (c ? a : b), seli: (c, a, b) => (c ? a : b),
    roundi: (a) => (Math.sign(a) * Math.round(Math.abs(a))) | 0, itof: (i) => r(i), trunc: (a) => Math.trunc(a),
    iabs: (a) => Math.abs(a) | 0, ibit: (a, j) => ((a >> j) & 1) === 1, ineg: (a) => a < 0,
    ic: (n) => n, iadd: (a, b) => (a + b) | 0, isub: (a, b) => (a - b) | 0, ishr1: (a) => a >> 1, iand3: (a) => a & 3, ieq: (a, n) => a === n,
    pow2: (i) => 2 ** i, expo, mant: (v) => (v === 0 || !Number.isFinite(v) ? v : v / 2 ** expo(v)),
    // (a significand, its top bit set, as an integer)
    sig: p === 'f32'
      ? (v) => { dv.setFloat32(0, v); return BigInt((dv.getUint32(0) & 0x7fffff) | 0x800000); }
      : (v) => { dv.setFloat64(0, v); return (dv.getBigUint64(0) & 0xfffffffffffffn) | (1n << 52n); },
    ushl1: (a) => a << 1n, usub: (a, b) => a - b, uge: (a, b) => a >= b, usel: (c, a, b) => (c ? a : b), ufrom: (a) => r(Number(a)),
    call: (name, ...a) => JS_MATH[p === 'f32' ? `${name}f` : name](...a),
  };
}

// ---- the hardware's ops: C statements on the values' bits, each a temporary
function cOps(p, lines) {
  const { T, u, W, M, bias, emax } = FMT[p];
  let k = 0;
  const t = (type, expr) => { const v = `t${k++}`; lines.push(`  ${type} ${v} = ${expr};`); return v; };
  const bits = (v) => {
    const dv = new DataView(new ArrayBuffer(8));
    if (p === 'f32') { dv.setFloat32(0, v); return `0x${dv.getUint32(0).toString(16)}${u}`; }
    dv.setFloat64(0, v); return `0x${dv.getBigUint64(0).toString(16)}${u}`;
  };
  const ABS = `0x${((1n << BigInt(W - 1)) - 1n).toString(16)}${u}`, INF = `0x${(BigInt(emax) << BigInt(M)).toString(16)}${u}`;
  const MMASK = `0x${((1n << BigInt(M)) - 1n).toString(16)}${u}`;
  const f = (name, ...a) => t(T, `ap_${p}_${name}(${a.join(', ')})`);
  const b = (expr) => t('int', expr);
  return {
    p,
    c: (v) => bits(p === 'f32' ? Math.fround(v) : v), nan: () => `0x${(p === 'f32' ? 0x7fc00000n : 0x7ff8000000000000n).toString(16)}${u}`,
    add: (x, y) => f('add', x, y), sub: (x, y) => f('sub', x, y), mul: (x, y) => f('mul', x, y), div: (x, y) => f('div', x, y),
    lt: (x, y) => b(`ap_${p}_lt(${x}, ${y})`), eq: (x, y) => b(`ap_${p}_eq(${x}, ${y})`), isnan: (x) => b(`ap_${p}_unord(${x}, ${x})`),
    isinf: (x) => b(`(${x} & ${ABS}) == ${INF}`), isneg: (x) => b(`(int)(${x} >> ${W - 1})`),
    abs: (x) => t(T, `${x} & ${ABS}`), sign: (x, y) => t(T, `(${x} & ${ABS}) | (${y} & ~${ABS})`), sqrt: (x) => f('sqrt', x),
    and: (x, y) => b(`${x} && ${y}`), or: (x, y) => b(`${x} || ${y}`), not: (x) => b(`!${x}`),
    sel: (cnd, x, y) => t(T, `${cnd} ? ${x} : ${y}`), seli: (cnd, x, y) => b(`${cnd} ? ${x} : ${y}`),
    roundi: (x) => b(`ap_${p}_to_i32(ap_${p}_round(${x}))`), itof: (i) => f('from_i32', i), trunc: (x) => f('trunc', x),
    iabs: (x) => b(`${x} < 0 ? -${x} : ${x}`), ibit: (x, j) => b(`(${x} >> ${j}) & 1`), ineg: (x) => b(`${x} < 0`),
    ic: (n) => String(n), iadd: (x, y) => b(`${x} + ${y}`), isub: (x, y) => b(`${x} - ${y}`), ishr1: (x) => b(`${x} >> 1`),
    iand3: (x) => b(`${x} & 3`), ieq: (x, n) => b(`${x} == ${n}`),
    pow2: (i) => t(T, `((${T})(${i} + ${bias})) << ${M}`),
    expo: (x) => b(`(int)((${x} >> ${M}) & ${emax}${u}) - ${bias}`),
    mant: (x) => t(T, `(${x} & ${MMASK}) | ((${T})${bias} << ${M})`),
    sig: (x) => t(T, `(${x} & ${MMASK}) | ((${T})1 << ${M})`), ushl1: (x) => t(T, `${x} << 1`), usub: (x, y) => t(T, `${x} - ${y}`),
    uge: (x, y) => b(`${x} >= ${y}`), usel: (cnd, x, y) => t(T, `${cnd} ? ${x} : ${y}`),
    ufrom: (x) => (p === 'f32' ? f('from_u32', x)
      : f('add', f('mul', f('from_u32', `(unsigned)(${x} >> 32)`), bits(2 ** 32)), f('from_u32', `(unsigned)${x}`))),
    call: (name, ...a) => f(name, ...a),
  };
}

function cFunction(p, name, args) {
  const { T } = FMT[p];
  const lines = [];
  const o = cOps(p, lines);
  const r = name === 'pow' ? pow(o, ...args) : (ALGOS[name] ?? ALGOS2[name])(o, ...args);
  return `static ${T} ap_${p}_${name}(${args.map((a) => `${T} ${a}`).join(', ')}) {\n${lines.join('\n')}\n  return ${r};\n}\n`;
}

/** The C of the math functions (after the soft-float library's SOFTFLOAT32 and SOFTFLOAT64). */
export const MATHLIB = [
  ...Object.keys(ALGOS).flatMap((n) => [cFunction('f32', n, ['a']), cFunction('f64', n, ['a'])]),
  ...Object.keys(ALGOS2).flatMap((n) => [cFunction('f32', n, ['a', 'b']), cFunction('f64', n, ['a', 'b'])]),
  cFunction('f64', 'pow', ['a', 'b']),
  '/* powf: pow on its arguments as doubles, rounded to a float */\nstatic unsigned ap_f32_pow(unsigned a, unsigned b) { return ap_f32_from_f64(ap_f64_pow(ap_f64_from_f32(a), ap_f64_from_f32(b))); }\n',
].join('\n');

const J32 = jsOps('f32'), J64 = jsOps('f64');
/** The C simulation's functions: the algorithms on numbers, a float's rounded at each step. */
export const JS_MATH = {
  ...Object.fromEntries(Object.entries(ALGOS).flatMap(([n, f]) => [[n, (x) => f(J64, x)], [`${n}f`, (x) => f(J32, Math.fround(x))]])),
  ...Object.fromEntries(Object.entries(ALGOS2).flatMap(([n, f]) => [[n, (x, y) => f(J64, x, y)], [`${n}f`, (x, y) => f(J32, Math.fround(x), Math.fround(y))]])),
  pow: (x, y) => pow(J64, x, y), powf: (x, y) => Math.fround(pow(J64, Math.fround(x), Math.fround(y))),
};
