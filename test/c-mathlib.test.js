// Silinx HLS's math.h (#1761): exp, log, sin, cos, pow and their float ones, of Silinx's own (core/c-mathlib.js). The
// C simulation's functions (JS_MATH) against JavaScript's Math (their accuracy) and C99's special cases; the library's
// C (MATHLIB), run by Silinx's C interpreter, giving JS_MATH's bits on random arguments, for every function; in
// hardware: expf and logf co-simulated in VHDL and Verilog (their bits the C simulation's), sinf and powf synthesized.
// #2119's others: the same, in test/c-mathlib2.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JS_MATH, MATHLIB } from '../core/c-mathlib.js';
import { SOFTFLOAT32, SOFTFLOAT64 } from '../core/c-softfloat.js';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';

let seed = 1761;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const dv = new DataView(new ArrayBuffer(8));
const bits32 = (x) => { dv.setFloat32(0, x); return dv.getUint32(0); };
const bits64 = (x) => { dv.setFloat64(0, x); return dv.getBigUint64(0); };
const ulp = (x, f32) => { const a = Math.abs(x); const e = Math.floor(Math.log2(a)); return 2 ** Math.max(e - (f32 ? 23 : 52), f32 ? -149 : -1074); };
// the arguments of each function: random ones in its range, and the edges
const ARGS = {
  exp: () => -120 + 240 * rnd(), log: () => Math.exp(-80 + 160 * rnd()), sin: () => -2000 + 4000 * rnd(), cos: () => -2000 + 4000 * rnd(),
};

test('#1761 the C simulation\'s exp, log, sin, cos: within 2 ulps of Math\'s (sin and cos: an absolute error under 1e-15 near their zeros)', () => {
  for (const [n, arg] of Object.entries(ARGS)) {
    for (const f32 of [true, false]) {
      let worst = 0;
      for (let i = 0; i < 4000; i++) {
        const x = f32 ? Math.fround(arg()) : arg();
        const ref = f32 ? Math.fround(Math[n](x)) : Math[n](x), got = JS_MATH[f32 ? `${n}f` : n](x);
        if (!Number.isFinite(ref) || ref === 0) { assert.equal(got, ref, `${n} ${x}`); continue; }
        // (near a zero of sin or cos: the absolute error)
        const err = Math.abs(got - ref) / ulp(ref, f32);
        if (Math.abs(ref) < 1e-2 && (n === 'sin' || n === 'cos')) assert.ok(Math.abs(got - ref) < (f32 ? 1e-7 : 1e-15), `${n}(${x}): ${got} ${ref}`);
        else worst = Math.max(worst, err);
      }
      assert.ok(worst <= 2, `${n}${f32 ? 'f' : ''}: ${worst} ulps`);
    }
  }
});

test('#1761 pow: an integer exponent up to 64 exact (2^3 = 8, 10^-2 = 0.01), others close to Math.pow; C99\'s special cases', () => {
  assert.deepEqual([[2, 3], [-2, 3], [10, -2], [3, 20], [1.5, -7], [-0.5, 5]].map(([x, y]) => JS_MATH.pow(x, y)), [8, -8, 0.01, 3486784401, 1.5 ** -7, -0.03125]);
  assert.equal(JS_MATH.powf(2, 10), 1024);
  for (let i = 0; i < 3000; i++) {
    const x = 10 * rnd(), y = 40 * (rnd() - 0.5), ref = Math.pow(x, y);
    if (Number.isFinite(ref) && ref !== 0) assert.ok(Math.abs(JS_MATH.pow(x, y) - ref) / ulp(ref) <= 128, `${x}^${y}`);
    const xf = Math.fround(x), yf = Math.fround(y), rf = Math.fround(Math.pow(xf, yf));
    if (Number.isFinite(rf) && rf !== 0) assert.ok(Math.abs(JS_MATH.powf(xf, yf) - rf) / ulp(rf, true) <= 1, `${xf}^${yf}f`);
  }
  // C99: pow(x, ±0) = 1, pow(1, y) = 1 (a NaN too), pow(-1, ±inf) = 1, a NaN otherwise NaN; ±0 to an odd negative power ±inf
  const sp = [[NaN, 0, 1], [1, NaN, 1], [-1, Infinity, 1], [NaN, 2, NaN], [-2, 0.5, NaN], [0, -1, Infinity], [-0, -1, -Infinity], [-0, 3, -0],
    [0.5, Infinity, 0], [2, -Infinity, 0], [Infinity, -2, 0], [-Infinity, 3, -Infinity]];
  for (const [x, y, want] of sp) assert.ok(Object.is(JS_MATH.pow(x, y), want), `pow(${x}, ${y}) = ${JS_MATH.pow(x, y)}`);
  // log, exp, sin, cos: theirs
  assert.deepEqual([JS_MATH.log(0), JS_MATH.log(-1), JS_MATH.log(Infinity), JS_MATH.exp(-Infinity), JS_MATH.exp(1000), JS_MATH.sin(Infinity), JS_MATH.cosf(NaN)], [-Infinity, NaN, Infinity, 0, Infinity, NaN, NaN]);
});

test('#1761 the library\'s C, run by Silinx\'s C interpreter, gives the C simulation\'s bits: every function, float and double, random arguments', () => {
  const N = 40;
  const vals = { exp: [], log: [], sin: [], cos: [] };
  for (const n of Object.keys(vals)) for (let i = 0; i < N; i++) vals[n].push(ARGS[n]());
  const pw = Array.from({ length: N }, () => [10 * (rnd() - 0.2), Math.round(40 * (rnd() - 0.5)) + (rnd() < 0.5 ? 0.25 : 0)]);
  const lines = [];
  const want = [];
  for (const n of Object.keys(vals)) {
    lines.push(`  { unsigned v[${N}] = {${vals[n].map((x) => `0x${bits32(Math.fround(x)).toString(16)}u`).join(', ')}}; for (int i = 0; i < ${N}; i++) printf("%08x\\n", ap_f32_${n}(v[i])); }`);
    want.push(...vals[n].map((x) => bits32(JS_MATH[`${n}f`](Math.fround(x))).toString(16).padStart(8, '0')));
    lines.push(`  { unsigned long long v[${N}] = {${vals[n].map((x) => `0x${bits64(x).toString(16)}ull`).join(', ')}}; for (int i = 0; i < ${N}; i++) printf("%016llx\\n", ap_f64_${n}(v[i])); }`);
    want.push(...vals[n].map((x) => bits64(JS_MATH[n](x)).toString(16).padStart(16, '0')));
  }
  lines.push(`  { unsigned long long a[${N}] = {${pw.map(([x]) => `0x${bits64(x).toString(16)}ull`).join(', ')}}, b[${N}] = {${pw.map(([, y]) => `0x${bits64(y).toString(16)}ull`).join(', ')}}; for (int i = 0; i < ${N}; i++) printf("%016llx\\n", ap_f64_pow(a[i], b[i])); }`);
  want.push(...pw.map(([x, y]) => bits64(JS_MATH.pow(x, y)).toString(16).padStart(16, '0')));
  lines.push(`  { unsigned a[${N}] = {${pw.map(([x]) => `0x${bits32(Math.fround(x)).toString(16)}u`).join(', ')}}, b[${N}] = {${pw.map(([, y]) => `0x${bits32(Math.fround(y)).toString(16)}u`).join(', ')}}; for (int i = 0; i < ${N}; i++) printf("%08x\\n", ap_f32_pow(a[i], b[i])); }`);
  want.push(...pw.map(([x, y]) => bits32(JS_MATH.powf(Math.fround(x), Math.fround(y))).toString(16).padStart(8, '0')));
  const r = simulateC(`#include <stdio.h>\n${SOFTFLOAT32}\n${SOFTFLOAT64}\n${MATHLIB}\nint main() {\n${lines.join('\n')}\n  return 0;\n}\n`, { file: 'mathlib.c' });
  assert.deepEqual([r.ok, r.error?.message], [true, undefined]);
  // (a NaN: the quiet NaN, whatever JavaScript's bits)
  const quiet = (s) => (s.length === 8 ? ((parseInt(s, 16) & 0x7fffffff) > 0x7f800000 ? '7fc00000' : s)
    : (BigInt(`0x${s}`) & 0x7fffffffffffffffn) > 0x7ff0000000000000n ? '7ff8000000000000' : s);
  assert.deepEqual(r.output.trim().split('\n').map(quiet), want.map(quiet));
});

// a function of one float argument, called on values of every kind
const call = (fn) => `#include <math.h>\nfloat f(float x) { return ${fn}(x); }\nint main() {\n  float v[8] = {0.5f, -1.25f, 3.0f, 0.0f, 10.5f, -7.75f, 1e-3f, 88.0f};\n  float s = 0;\n  for (int i = 0; i < 8; i++) s += f(v[i]);\n  return s == 12345 ? 1 : 0;\n}\n`;

test('#1761 expf and logf in hardware: co-simulated in VHDL and Verilog, the C simulation\'s bits, no warning', () => {
  for (const fn of ['expf', 'logf']) {
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(call(fn), { file: 'f.c', top: 'f', lang });
      assert.deepEqual([r.errors, r.pass, r.calls, r.gen.diagnostics], [[], true, 8, []], `${fn} ${lang}`);
    }
  }
});

test('#1761 sin, cos, pow (float and double) synthesized, no longer refused; another math.h function in hardware still is, said so', () => {
  for (const fn of ['sinf', 'cosf', 'sin', 'exp', 'log', 'cos']) {
    const ty = fn.endsWith('f') ? 'float' : 'double';
    const g = cToHdl(`#include <math.h>\n${ty} f(${ty} x) { return ${fn}(x); }\n`, { file: 'f.c' });
    assert.deepEqual([g.ok, g.diagnostics], [true, []], fn);
  }
  const p = cToHdl('#include <math.h>\nfloat f(float x, float y) { return powf(x, y); }\n', { file: 'f.c' });
  assert.deepEqual([p.ok, p.diagnostics], [true, []]);
  const t = cToHdl('#include <math.h>\ndouble f(double x) { return lround(x); }\n', { file: 'f.c' });
  assert.equal(t.ok, false);
  assert.match(t.diagnostics.map((d) => d.message).join('\n'), /math\.h in hardware: sqrt, fabs, floor, ceil, trunc, round, fmin, fmax, copysign, exp, log, sin, cos, pow, tan, log2, log10, exp2, hypot, fmod, atan, asin, acos, atan2, sinh, cosh, tanh and cbrt/);
});
