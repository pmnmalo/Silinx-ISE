// Silinx HLS (#1761): math.h's exp, log, sin, cos and pow (and expf, logf, sinf, cosf, powf) of Silinx's own, as Vitis
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
//     (powf: on its arguments as doubles, rounded to a float); its sign negative for x < 0 and y an odd integer.
//
//   MATHLIB: the C source (after SOFTFLOAT32 and SOFTFLOAT64): ap_f32_exp … ap_f32_pow, ap_f64_exp … ap_f64_pow
//   JS_MATH: { exp, expf, log, logf, sin, sinf, cos, cosf, pow, powf } the C simulation's functions of numbers

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
  },
  f64: {
    expLo: -746, expHi: 746, ln2Hi: 6.93147180369123816490e-01, ln2Lo: 1.90821492927058770002e-10, expTerms: 13,
    logTerms: 10, sub: 54, minNormal: 2 ** -1022,
    trigMax: 2 ** 20, pio2: [1.57079632673412561417e+00, 6.07710050650619224932e-11, 2.02226624879595063154e-21], sinTerms: 8, cosTerms: 9,
  },
};

// ---- the algorithms, on ops: f(x) a value of the format, b a boolean, i an int
function exp(o, x) {
  const k = K[o.p];
  const xc = o.sel(o.lt(x, o.c(k.expLo)), o.c(k.expLo), o.sel(o.lt(o.c(k.expHi), x), o.c(k.expHi), x));
  const n = o.roundi(o.mul(xc, o.c(1 / Math.LN2)));
  const fn = o.itof(n);
  const r = o.sub(o.sub(xc, o.mul(fn, o.c(k.ln2Hi))), o.mul(fn, o.c(k.ln2Lo)));
  // 1 + r (1 + r (1/2 + r (1/6 + …)))
  let p = o.c(1 / fact(k.expTerms));
  for (let i = k.expTerms - 1; i >= 0; i--) p = o.add(o.c(1 / fact(i)), o.mul(r, p));
  const a = o.ishr1(n);
  const y = o.mul(o.mul(p, o.pow2(a)), o.pow2(o.isub(n, a)));
  return o.sel(o.isnan(x), o.nan(), y);
}

function log(o, x) {
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
  const lm = o.add(o.mul(o.c(2), s), o.mul(o.mul(s, z), q));
  const fe = o.itof(e);
  const y = o.add(o.mul(fe, o.c(k.ln2Hi)), o.add(lm, o.mul(fe, o.c(k.ln2Lo))));
  // log 0 = -inf, log of a negative or a NaN NaN, log inf = inf
  const zero = o.eq(x, o.c(0));
  return o.sel(o.or(o.isnan(x), o.lt(x, o.c(0))), o.nan(), o.sel(zero, o.c(-Infinity), o.sel(o.isinf(x), x, y)));
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

const ALGOS = { exp, log, sin, cos };

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
    isneg: (a) => a < 0 || Object.is(a, -0),
    and: (a, b) => a && b, or: (a, b) => a || b, not: (a) => !a,
    sel: (c, a, b) => (c ? a : b), seli: (c, a, b) => (c ? a : b),
    roundi: (a) => (Math.sign(a) * Math.round(Math.abs(a))) | 0, itof: (i) => r(i), trunc: (a) => Math.trunc(a),
    iabs: (a) => Math.abs(a) | 0, ibit: (a, j) => ((a >> j) & 1) === 1, ineg: (a) => a < 0,
    ic: (n) => n, iadd: (a, b) => (a + b) | 0, isub: (a, b) => (a - b) | 0, ishr1: (a) => a >> 1, iand3: (a) => a & 3, ieq: (a, n) => a === n,
    pow2: (i) => 2 ** i, expo, mant: (v) => (v === 0 || !Number.isFinite(v) ? v : v / 2 ** expo(v)),
    call: (name, ...a) => JS_MATH[name](...a),
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
    and: (x, y) => b(`${x} && ${y}`), or: (x, y) => b(`${x} || ${y}`), not: (x) => b(`!${x}`),
    sel: (cnd, x, y) => t(T, `${cnd} ? ${x} : ${y}`), seli: (cnd, x, y) => b(`${cnd} ? ${x} : ${y}`),
    roundi: (x) => b(`ap_${p}_to_i32(ap_${p}_round(${x}))`), itof: (i) => f('from_i32', i), trunc: (x) => f('trunc', x),
    iabs: (x) => b(`${x} < 0 ? -${x} : ${x}`), ibit: (x, j) => b(`(${x} >> ${j}) & 1`), ineg: (x) => b(`${x} < 0`),
    ic: (n) => String(n), iadd: (x, y) => b(`${x} + ${y}`), isub: (x, y) => b(`${x} - ${y}`), ishr1: (x) => b(`${x} >> 1`),
    iand3: (x) => b(`${x} & 3`), ieq: (x, n) => b(`${x} == ${n}`),
    pow2: (i) => t(T, `((${T})(${i} + ${bias})) << ${M}`),
    expo: (x) => b(`(int)((${x} >> ${M}) & ${emax}${u}) - ${bias}`),
    mant: (x) => t(T, `(${x} & ${MMASK}) | ((${T})${bias} << ${M})`),
    call: (name, ...a) => f(name, ...a),
  };
}

function cFunction(p, name, args) {
  const { T } = FMT[p];
  const lines = [];
  const o = cOps(p, lines);
  const r = name === 'pow' ? pow(o, ...args) : ALGOS[name](o, ...args);
  return `static ${T} ap_${p}_${name}(${args.map((a) => `${T} ${a}`).join(', ')}) {\n${lines.join('\n')}\n  return ${r};\n}\n`;
}

/** The C of the math functions (after the soft-float library's SOFTFLOAT32 and SOFTFLOAT64). */
export const MATHLIB = [
  ...['exp', 'log', 'sin', 'cos'].flatMap((n) => [cFunction('f32', n, ['a']), cFunction('f64', n, ['a'])]),
  cFunction('f64', 'pow', ['a', 'b']),
  '/* powf: pow on its arguments as doubles, rounded to a float */\nstatic unsigned ap_f32_pow(unsigned a, unsigned b) { return ap_f32_from_f64(ap_f64_pow(ap_f64_from_f32(a), ap_f64_from_f32(b))); }\n',
].join('\n');

const J32 = jsOps('f32'), J64 = jsOps('f64');
/** The C simulation's functions: the algorithms on numbers, a float's rounded at each step. */
export const JS_MATH = {
  exp: (x) => exp(J64, x), expf: (x) => exp(J32, Math.fround(x)),
  log: (x) => log(J64, x), logf: (x) => log(J32, Math.fround(x)),
  sin: (x) => sin(J64, x), sinf: (x) => sin(J32, Math.fround(x)),
  cos: (x) => cos(J64, x), cosf: (x) => cos(J32, Math.fround(x)),
  pow: (x, y) => pow(J64, x, y), powf: (x, y) => Math.fround(pow(J64, Math.fround(x), Math.fround(y))),
};
