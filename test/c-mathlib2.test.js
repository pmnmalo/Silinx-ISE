// Silinx HLS's math.h, the others (#2119): tan, log2, log10, exp2, hypot, fmod, atan, asin, acos, atan2, sinh, cosh, tanh,
// cbrt and their float ones (core/c-mathlib.js). As test/c-mathlib.test.js: the C simulation's functions (JS_MATH) against
// JavaScript's Math (their accuracy) and C99's special cases; the library's C (MATHLIB), run by Silinx's C interpreter,
// giving JS_MATH's bits; in hardware: no warning, and co-simulated in VHDL and Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JS_MATH as J, MATHLIB } from '../core/c-mathlib.js';
import { MATH } from '../core/c-float.js';
import { SOFTFLOAT32, SOFTFLOAT64 } from '../core/c-softfloat.js';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';

let seed = 2119;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const dv = new DataView(new ArrayBuffer(8));
const bits32 = (x) => { dv.setFloat32(0, x); return dv.getUint32(0); };
const bits64 = (x) => { dv.setFloat64(0, x); return dv.getBigUint64(0); };
const ulp = (x, f32) => { const e = Math.floor(Math.log2(Math.abs(x))); return 2 ** Math.max(e - (f32 ? 23 : 52), f32 ? -149 : -1074); };
const range = (a, b) => () => a + (b - a) * rnd();
const log = (a, b) => () => Math.exp(a + (b - a) * rnd());
const signed = (g) => () => (rnd() < 0.5 ? -g() : g());
// each function: its reference, its arguments, the most ulps it may be from the reference
const ONE = {
  tan: [Math.tan, range(-1000, 1000), 3], log2: [Math.log2, log(-80, 80), 2], log10: [Math.log10, log(-80, 80), 2], exp2: [(x) => 2 ** x, range(-140, 125), 2],
  atan: [Math.atan, signed(log(-30, 30)), 2], asin: [Math.asin, range(-1, 1), 2], acos: [Math.acos, range(-1, 1), 2],
  sinh: [Math.sinh, range(-85, 85), 3], cosh: [Math.cosh, range(-85, 85), 3], tanh: [Math.tanh, range(-14, 14), 3], cbrt: [Math.cbrt, signed(log(-80, 80)), 2],
};
const TWO = {
  hypot: [Math.hypot, signed(log(-40, 40)), 2], atan2: [Math.atan2, signed(log(-30, 30)), 2],
};

test('#2119 the C simulation\'s functions of one argument: within their ulps of Math\'s, float and double', () => {
  for (const [n, [ref, arg, most]] of Object.entries(ONE)) {
    for (const f32 of [true, false]) {
      let worst = 0;
      for (let i = 0; i < 4000; i++) {
        const x = f32 ? Math.fround(arg()) : arg();
        const r = f32 ? Math.fround(ref(x)) : ref(x), got = J[f32 ? `${n}f` : n](x);
        worst = Math.max(worst, Math.abs(got - r) / ulp(r, f32));
      }
      assert.ok(worst <= most, `${n}${f32 ? 'f' : ''}: ${worst} ulps`);
    }
  }
});

test('#2119 hypot and atan2: within their ulps of Math\'s', () => {
  for (const [n, [ref, arg, most]] of Object.entries(TWO)) {
    for (const f32 of [true, false]) {
      let worst = 0;
      for (let i = 0; i < 4000; i++) {
        const x = f32 ? Math.fround(arg()) : arg(), y = f32 ? Math.fround(arg()) : arg();
        const r = f32 ? Math.fround(ref(x, y)) : ref(x, y);
        worst = Math.max(worst, Math.abs(J[f32 ? `${n}f` : n](x, y) - r) / ulp(r, f32));
      }
      assert.ok(worst <= most, `${n}${f32 ? 'f' : ''}: ${worst} ulps`);
    }
  }
});

test('#2119 sin, cos and tan in double near a zero: the reduction\'s second part no longer counts its third twice', () => {
  // (n pi/2 for a large n, its nearest double: an argument that used to be off by n 2e-21)
  for (const x of [Math.PI * 100, Math.PI * 1000, Math.PI / 2 * 300001]) {
    const r = Math.sin(x);
    assert.ok(Math.abs(J.sin(x) - r) / ulp(r) <= 2, `sin(${x}): ${J.sin(x)} ${r}`);
    assert.ok(Math.abs(J.tan(x) - Math.tan(x)) / Math.abs(Math.tan(x)) < 1e-15, `tan(${x}): ${J.tan(x)} ${Math.tan(x)}`);
  }
});

test('#2119 exact where it can be: log2 of a power of two, exp2 of an integer, log10 of a power of ten, cbrt of a cube, hypot of a triple', () => {
  assert.deepEqual([1, 8, 1024, 0.5, 2 ** -1074].map(J.log2), [0, 3, 10, -1, -1074]);
  assert.deepEqual([1, 8, 1024, 0.5].map(J.log2f), [0, 3, 10, -1]);
  assert.deepEqual([3, -3, 0, 10, -1074, 1023].map(J.exp2), [8, 0.125, 1, 1024, 2 ** -1074, 2 ** 1023]);
  assert.deepEqual([3, -149, 127].map(J.exp2f), [8, 2 ** -149, 2 ** 127]);
  assert.deepEqual([1, 10, 100, 1000, 1e6, 1e9, 1e15].map(J.log10), [0, 1, 2, 3, 6, 9, 15]);
  assert.deepEqual([10, 100, 1000, 1e4].map(J.log10f), [1, 2, 3, 4]);
  assert.deepEqual([8, 27, 64, 125, 1000, 1e6, -8].map(J.cbrt), [2, 3, 4, 5, 10, 100, -2]);
  assert.deepEqual([8, 27, 64, 125, 1000, -27].map(J.cbrtf), [2, 3, 4, 5, 10, -3]);
  assert.deepEqual([J.hypot(3, 4), J.hypotf(3, 4), J.hypot(-5, 12), J.hypot(7.5, 0)], [5, 5, 13, 7.5]);
  assert.deepEqual([J.atan2(0, -1), J.acos(-1), J.asin(1), J.atan(Infinity)], [Math.PI, Math.PI, Math.PI / 2, Math.PI / 2]);
});

test('#2119 hypot neither overflows nor underflows where the result does not', () => {
  assert.equal(J.hypot(1e308, 1e308), Math.SQRT2 * 1e308);
  assert.equal(J.hypot(3e-320, 4e-320), 5e-320);
  assert.equal(J.hypot(5e-324, 0), 5e-324);
  assert.equal(J.hypotf(3e38, 2e38), Math.fround(Math.hypot(Math.fround(3e38), Math.fround(2e38))));
  assert.equal(J.hypotf(3e-44, 4e-44), Math.fround(5e-44));
  assert.equal(J.hypot(1.7e308, 1.7e308), Infinity);
});

test('#2119 fmod is exact: JavaScript\'s % on random arguments, subnormals too', () => {
  const arg = signed(log(-18, 18));
  for (let i = 0; i < 4000; i++) {
    const x = arg(), y = arg();
    assert.ok(Object.is(J.fmod(x, y), x % y), `fmod(${x}, ${y})`);
    const xf = Math.fround(x), yf = Math.fround(y);
    assert.ok(Object.is(J.fmodf(xf, yf), xf % yf), `fmodf(${xf}, ${yf})`);
  }
  // the exact ones of a teacher's example, a tiny y, a subnormal x, a result that is subnormal
  for (const [x, y] of [[5.5, 2], [-7, 3], [7, -3], [1, 0.1], [6, 3], [-6, 3], [5e-324, 1], [2.2250738585072014e-308, 5e-324], [1e-310, 3e-320], [3e-320, 1e-320], [2 ** 60, 3]]) {
    assert.ok(Object.is(J.fmod(x, y), x % y), `fmod(${x}, ${y}): ${J.fmod(x, y)}`);
  }
  for (const [x, y] of [[1e-40, 3e-44], [1e-38, 1e-45], [1e10, 3]]) {
    const xf = Math.fround(x), yf = Math.fround(y);
    assert.ok(Object.is(J.fmodf(xf, yf), xf % yf), `fmodf(${xf}, ${yf}): ${J.fmodf(xf, yf)}`);
  }
});

// quotients just below and above 2^64, the largest and smallest exponents, subnormals (an x / y of every size, #2144)
const FMOD_DOUBLE = [[2 ** 64, 3], [2 ** 64 - 2048, 3], [2 ** 65, 3], [2 ** 65 + 8192, 7], [1e300, 3], [Number.MAX_VALUE, 5e-324], [Number.MAX_VALUE, 3e-320], [Number.MAX_VALUE, 3], [-Number.MAX_VALUE, 1e-310],
  [2.2250738585072014e-308, 5e-324], [1e-310, 3e-320], [5e-324, 5e-324], [1e-320, 5e-324], [1e308, 1e-308], [-1e300, -7]];
const FMOD_FLOAT = [[2 ** 64, 3], [2 ** 64 - 2 ** 40, 3], [2 ** 65, 3], [2 ** 65 + 2 ** 42, 7], [1e30, 1e-10], [3.4028234663852886e38, 1e-45], [3.4028234663852886e38, 3], [-3.4028234663852886e38, 1e-40],
  [1.1754943508222875e-38, 1e-45], [1e-40, 3e-44], [1e-45, 1e-45], [1e-44, 1e-45], [1e38, 1e-38], [-1e30, -7]].map(([x, y]) => [Math.fround(x), Math.fround(y)]);

test('#2144 fmod is exact for every quotient: JavaScript\'s %, just below and above 2^64, the largest and smallest exponents, subnormals', () => {
  for (const [x, y] of FMOD_DOUBLE) assert.ok(Object.is(J.fmod(x, y), x % y), `fmod(${x}, ${y}): ${J.fmod(x, y)}`);
  for (const [x, y] of FMOD_FLOAT) assert.ok(Object.is(J.fmodf(x, y), x % y), `fmodf(${x}, ${y}): ${J.fmodf(x, y)}`);
  // (the exponents over their whole range, each exact in the format, so % needs no rounding in a float's)
  const arg = signed(log(-740, 709)), argf = signed(log(-103, 88));
  for (let i = 0; i < 400; i++) {
    const x = arg(), y = arg();
    assert.ok(Object.is(J.fmod(x, y), x % y), `fmod(${x}, ${y})`);
    const xf = Math.fround(argf()), yf = Math.fround(argf());
    assert.ok(Object.is(J.fmodf(xf, yf), xf % yf), `fmodf(${xf}, ${yf})`);
  }
});

const FMOD_C = (ty, fn, v) => `#include <math.h>\n${ty} f(${ty} x, ${ty} y) { return ${fn}(x, y); }\nint main() {\n  ${ty} a[${v.length}] = {${v.map(([x]) => lit(x, ty)).join(', ')}};\n  ${ty} b[${v.length}] = {${v.map(([, y]) => lit(y, ty)).join(', ')}};\n  ${ty} s = 0;\n  for (int i = 0; i < ${v.length}; i++) s += f(a[i], b[i]);\n  return s == 12345 ? 1 : 0;\n}\n`;
const lit = (x, ty) => { const t = x.toExponential(17); return ty === 'float' ? `${t}f` : t; };

test('#2144 fmod and fmodf co-simulated in VHDL and Verilog on those quotients, the C simulation\'s bits, no warning, a step a cycle', () => {
  for (const [ty, fn, v, most] of [['float', 'fmodf', FMOD_FLOAT, 276], ['double', 'fmod', FMOD_DOUBLE, 2097]]) {
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(FMOD_C(ty, fn, v), { file: 'f.c', top: 'f', lang });
      assert.deepEqual([r.errors, r.pass, r.calls, r.gen.diagnostics, r.gen.sequential], [[], true, v.length, [], true], `${fn} ${lang}`);
      // (the largest quotient: its steps, and the machine's states around them)
      assert.ok(r.latency.max >= most && r.latency.max < most + r.gen.states, `${fn} ${lang}: ${r.latency.max} cycles`);
    }
  }
});

test('#2144 fmod\'s size is one step\'s: a loop of one state, its bound in the report, not a state per exponent', () => {
  const g = cToHdl('#include <math.h>\nfloat f(float x, float y) { return fmodf(x, y); }\n', { file: 'f.c' });
  assert.deepEqual([g.ok, g.diagnostics, g.sequential], [true, [], true]);
  assert.deepEqual(g.report.loops.map((l) => [l.line, l.trip, l.max, l.ii]), [[2, null, 276, 1]]);
  assert.ok(g.states < 277, `${g.states} states`);
});

test('#2144 fmod in a program: of constants folded, a function of the program named so its own, inside a function, in a loop, in an expression', () => {
  const syn = (src) => cToHdl(`#include <math.h>\n${src}`, { file: 'f.c' });
  // (constants: at synthesis, combinational)
  let g = syn('float f(float x) { return x + fmodf(7.5f, 2.0f); }\n');
  assert.deepEqual([g.ok, g.diagnostics, g.hdl.includes('ap_f32_fmod')], [true, [], false]);
  // (the program's own: its own function, no library's loop)
  g = cToHdl('int fmodf(int a, int b) { return a - b; }\nint f(int x) { return fmodf(x, 2); }\n', { file: 'f.c' });
  assert.deepEqual([g.ok, g.diagnostics, g.sequential], [true, [], false]);
  // (the call inside a function with none of its own loops, in an expression, in a loop)
  for (const src of ['float g(float x) { return fmodf(x, 3.0f); }\nfloat f(float x) { return g(x) + 1.0f; }\nint main() { float s = f(1e30f); return s == 1 ? 1 : 0; }\n',
    'float f(float x, float y) { float s = 0; for (int i = 0; i < 3; i++) { s = s + fmodf(x, y); x = x * 2.0f; } return s; }\nint main() { float s = f(1e30f, 3.0f); return s == 1 ? 1 : 0; }\n']) {
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(`#include <math.h>\n${src}`, { file: 'f.c', top: 'f', lang });
      assert.deepEqual([r.errors, r.pass, r.calls, r.gen.diagnostics], [[], true, 1, []], lang);
    }
  }
});

test('#2144 fmod where it may not run, or in a loop\'s condition: said, a statement of its own; a pipelined loop around it said not to be', () => {
  const msgs = (src) => cToHdl(`#include <math.h>\n${src}`, { file: 'f.c' }).diagnostics.map((d) => `${d.severity}: ${d.message}`);
  assert.deepEqual(msgs('float f(float x, float y, int c) { return c ? fmodf(x, y) : x; }\n'), ["error: 'fmodf' is called where it may not run (after && / || / ?:): call it as a statement of its own"]);
  assert.deepEqual(msgs('float f(float x, float y) { while (fmodf(x, y) > 1.0f) x = x / 2.0f; return x; }\n').filter((m) => m.startsWith('error')), ["error: 'fmodf' is called in a loop's condition: call it in the loop's body"]);
  const w = msgs('float f(float x, float y) { float s = 0; for (int i = 0; i < 4; i++) {\n#pragma HLS PIPELINE\n s = s + fmodf(x, y); } return s; }\n');
  assert.equal(w.length, 1, w.join('\n'));
  assert.match(w[0], /^warning: .*PIPELINE.*count is not a constant/);
});

// [function, arguments, result]
const SPECIAL = [
  ['tan', [0], 0], ['tan', [-0], -0], ['tan', [Infinity], NaN], ['tan', [NaN], NaN],
  ['log2', [0], -Infinity], ['log2', [-0], -Infinity], ['log2', [-1], NaN], ['log2', [Infinity], Infinity], ['log2', [NaN], NaN],
  ['log10', [0], -Infinity], ['log10', [-1], NaN], ['log10', [Infinity], Infinity], ['log10', [1], 0],
  ['exp2', [Infinity], Infinity], ['exp2', [-Infinity], 0], ['exp2', [NaN], NaN], ['exp2', [2000], Infinity], ['exp2', [-2000], 0], ['exp2', [0], 1], ['exp2', [-0], 1],
  ['hypot', [Infinity, NaN], Infinity], ['hypot', [NaN, -Infinity], Infinity], ['hypot', [NaN, 1], NaN], ['hypot', [0, -0], 0], ['hypot', [-3, 0], 3],
  ['fmod', [0, 2], 0], ['fmod', [-0, 2], -0], ['fmod', [5, 0], NaN], ['fmod', [Infinity, 2], NaN], ['fmod', [5, Infinity], 5], ['fmod', [-5, -Infinity], -5], ['fmod', [NaN, 2], NaN], ['fmod', [2, NaN], NaN], ['fmod', [-6, 3], -0], ['fmod', [6, -3], 0],
  ['atan', [0], 0], ['atan', [-0], -0], ['atan', [NaN], NaN],
  ['asin', [0], 0], ['asin', [-0], -0], ['asin', [1.5], NaN], ['asin', [-1.5], NaN], ['asin', [NaN], NaN],
  ['acos', [1], 0], ['acos', [1.5], NaN], ['acos', [NaN], NaN],
  ['atan2', [0, 1], 0], ['atan2', [-0, 1], -0], ['atan2', [0, 0], 0], ['atan2', [-0, 0], -0], ['atan2', [NaN, 1], NaN], ['atan2', [1, NaN], NaN],
  ['sinh', [0], 0], ['sinh', [-0], -0], ['sinh', [Infinity], Infinity], ['sinh', [-Infinity], -Infinity], ['sinh', [NaN], NaN], ['sinh', [2000], Infinity],
  ['cosh', [0], 1], ['cosh', [-0], 1], ['cosh', [-Infinity], Infinity], ['cosh', [NaN], NaN], ['cosh', [2000], Infinity],
  ['tanh', [0], 0], ['tanh', [-0], -0], ['tanh', [Infinity], 1], ['tanh', [-Infinity], -1], ['tanh', [2000], 1], ['tanh', [NaN], NaN],
  ['cbrt', [0], 0], ['cbrt', [-0], -0], ['cbrt', [Infinity], Infinity], ['cbrt', [-Infinity], -Infinity], ['cbrt', [NaN], NaN],
];

test('#2119 C99\'s special cases, float and double', () => {
  for (const [n, args, want] of SPECIAL) {
    assert.ok(Object.is(J[n](...args), want), `${n}(${args.join(', ')}) = ${J[n](...args)}`);
    assert.ok(Object.is(J[`${n}f`](...args), want), `${n}f(${args.join(', ')}) = ${J[`${n}f`](...args)}`);
  }
  // atan2's quadrants at the zeros and the infinities: Math.atan2's, rounded to the format
  const edges = [0, -0, 1, -1, Infinity, -Infinity];
  for (const y of edges) {
    for (const x of edges) {
      assert.ok(Object.is(J.atan2(y, x), Math.atan2(y, x)), `atan2(${y}, ${x}) = ${J.atan2(y, x)}`);
      assert.ok(Object.is(J.atan2f(y, x), Math.fround(Math.atan2(y, x))), `atan2f(${y}, ${x}) = ${J.atan2f(y, x)}`);
    }
  }
  // near the overflow, where e^|x| overflows and sinh and cosh do not; a subnormal keeps its value
  assert.ok(Number.isFinite(J.sinh(710)) && Number.isFinite(J.cosh(-710)) && Number.isFinite(J.sinhf(89)) && Number.isFinite(J.coshf(89)));
  for (const n of ['atan', 'asin', 'sinh', 'tanh']) assert.equal(J[n](5e-324), 5e-324, n);
  assert.equal(J.cbrt(2 ** -1074), Math.cbrt(2 ** -1074));
  assert.equal(J.cbrtf(2 ** -149), Math.fround(Math.cbrt(2 ** -149)));
});

test('#2119 the C simulation and the constants folded at synthesis run the library (a float\'s name too), not Math', () => {
  for (const n of [...Object.keys(ONE), ...Object.keys(TWO), 'fmod']) {
    const args = MATH[n].n === 2 ? [0.7, 0.3] : [0.7];
    assert.ok(Object.is(MATH[n].f(...args), J[n](...args)), n);
    assert.ok(Object.is(MATH[`${n}f`].f(...args), J[`${n}f`](...args)), `${n}f`);
  }
  const r = simulateC('#include <stdio.h>\n#include <math.h>\nint main() {\n  printf("%g %g %g %g\\n", tan(0.0), log2(8.0), fmodf(7.5f, 2.0f), hypotf(3.0f, 4.0f));\n  return 0;\n}\n', { file: 't.c' });
  assert.deepEqual([r.ok, r.error?.message, r.output.trim()], [true, undefined, '0 3 1.5 5']);
});

test('#2119 the library\'s C, run by Silinx\'s C interpreter, gives the C simulation\'s bits: every function, float and double', () => {
  const N = 24;
  let lines = [], want = [];
  // (one run per function: the interpreter's steps are limited)
  const check = () => {
    const r = simulateC(`#include <stdio.h>\n${SOFTFLOAT32}\n${SOFTFLOAT64}\n${MATHLIB}\nint main() {\n${lines.join('\n')}\n  return 0;\n}\n`, { file: 'mathlib.c' });
    assert.deepEqual([r.ok, r.error?.message], [true, undefined]);
    assert.deepEqual(r.output.trim().split('\n').map(quiet), want.map(quiet));
    lines = []; want = [];
  };
  const quiet = (s) => (s.length === 8 ? ((parseInt(s, 16) & 0x7fffffff) > 0x7f800000 ? '7fc00000' : s)
    : (BigInt(`0x${s}`) & 0x7fffffffffffffffn) > 0x7ff0000000000000n ? '7ff8000000000000' : s);
  const lit32 = (x) => `0x${bits32(Math.fround(x)).toString(16)}u`, lit64 = (x) => `0x${bits64(x).toString(16)}ull`;
  const hex32 = (x) => bits32(x).toString(16).padStart(8, '0'), hex64 = (x) => bits64(x).toString(16).padStart(16, '0');
  const fn2 = { hypot: signed(log(-40, 40)), atan2: signed(log(-30, 30)), fmod: signed(log(-18, 18)) };
  for (const [n, [, arg]] of Object.entries(ONE)) {
    const v = Array.from({ length: N }, arg);
    v.push(0, -0, Infinity, NaN, 1, -1, 0.5);
    lines.push(`  { unsigned v[${v.length}] = {${v.map(lit32).join(', ')}}; for (int i = 0; i < ${v.length}; i++) printf("%08x\\n", ap_f32_${n}(v[i])); }`);
    want.push(...v.map((x) => hex32(J[`${n}f`](Math.fround(x)))));
    lines.push(`  { unsigned long long v[${v.length}] = {${v.map(lit64).join(', ')}}; for (int i = 0; i < ${v.length}; i++) printf("%016llx\\n", ap_f64_${n}(v[i])); }`);
    want.push(...v.map((x) => hex64(J[n](x))));
    check();
  }
  for (const [n, arg] of Object.entries(fn2)) {
    const v = Array.from({ length: N }, () => [arg(), arg()]);
    v.push([0, 1], [-0, -1], [Infinity, 1], [1, Infinity], [NaN, 1], [Infinity, -Infinity], [0, 0], [1e-320, 3e-321], [1e-44, 3e-45], [1e300, 3], [1e30, 1e-10], [2 ** 65, 3]);
    const L = v.length;
    lines.push(`  { unsigned a[${L}] = {${v.map(([x]) => lit32(x)).join(', ')}}, b[${L}] = {${v.map(([, y]) => lit32(y)).join(', ')}}; for (int i = 0; i < ${L}; i++) printf("%08x\\n", ap_f32_${n}(a[i], b[i])); }`);
    want.push(...v.map(([x, y]) => hex32(J[`${n}f`](Math.fround(x), Math.fround(y)))));
    lines.push(`  { unsigned long long a[${L}] = {${v.map(([x]) => lit64(x)).join(', ')}}, b[${L}] = {${v.map(([, y]) => lit64(y)).join(', ')}}; for (int i = 0; i < ${L}; i++) printf("%016llx\\n", ap_f64_${n}(a[i], b[i])); }`);
    want.push(...v.map(([x, y]) => hex64(J[n](x, y))));
    check();
  }
});

test('#2119 every function synthesized, float and double, no warning', () => {
  for (const n of Object.keys(ONE)) {
    for (const [fn, ty] of [[`${n}f`, 'float'], [n, 'double']]) {
      const g = cToHdl(`#include <math.h>\n${ty} f(${ty} x) { return ${fn}(x); }\n`, { file: 'f.c' });
      assert.deepEqual([g.ok, g.diagnostics], [true, []], fn);
    }
  }
  for (const n of ['hypot', 'fmod', 'atan2']) {
    for (const [fn, ty] of [[`${n}f`, 'float'], [n, 'double']]) {
      const g = cToHdl(`#include <math.h>\n${ty} f(${ty} x, ${ty} y) { return ${fn}(x, y); }\n`, { file: 'f.c' });
      assert.deepEqual([g.ok, g.diagnostics], [true, []], fn);
    }
  }
});

const cosim1 = (fn) => `#include <math.h>\nfloat f(float x) { return ${fn}(x); }\nint main() {\n  float v[6] = {0.5f, -0.25f, 0.75f, 0.0f, 1.0f, -1.0f};\n  float s = 0;\n  for (int i = 0; i < 6; i++) s += f(v[i]);\n  return s == 12345 ? 1 : 0;\n}\n`;
const cosim2 = (fn) => `#include <math.h>\nfloat f(float x, float y) { return ${fn}(x, y); }\nint main() {\n  float v[5] = {7.5f, -3.25f, 100.0f, 0.0f, 1e-3f};\n  float s = 0;\n  for (int i = 0; i < 5; i++) s += f(v[i], 2.5f);\n  return s == 12345 ? 1 : 0;\n}\n`;

test('#2119 co-simulated in VHDL and Verilog, the C simulation\'s bits, no warning: tanf, log2f, atanf, coshf, cbrtf, and hypotf, fmodf, atan2f', () => {
  const run = (src, calls, fn) => {
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(src, { file: 'f.c', top: 'f', lang });
      assert.deepEqual([r.errors, r.pass, r.calls, r.gen.diagnostics], [[], true, calls, []], `${fn} ${lang}`);
    }
  };
  for (const fn of ['tanf', 'log2f', 'atanf', 'coshf', 'cbrtf']) run(cosim1(fn), 6, fn);
  for (const fn of ['hypotf', 'fmodf', 'atan2f']) run(cosim2(fn), 5, fn);
});
