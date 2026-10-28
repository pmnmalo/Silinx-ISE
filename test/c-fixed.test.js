// Silinx HLS (#1643): ap_fixed<W, I, Q, O> / ap_ufixed in the C simulation (core/c-fixed.js), against AMD's
// ap_fixed.h (test/ap-int-ref.js): the types of the results, the seven quantization and four overflow modes,
// conversions from doubles and to integers (toward zero), comparisons as AMD's ap_private compares mixed signs,
// shifts, to_double / to_int, C++'s cout of a fixed value (its precision); a program, then random ones (types, modes,
// operators). In synthesis (core/c-dataflow-fixed.js): programs and random functions co-simulated in VHDL and Verilog,
// their C simulation AMD's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { apIntHeaders, runWithApInt } from './ap-int-ref.js';

const AP = await apIntHeaders();
const errs = (src) => cToHdl(src, { file: 'e.cpp' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);

const FIR = `#include <iostream>
#include "ap_fixed.h"
using namespace std;
typedef ap_fixed<12, 4> din_t;
typedef ap_fixed<18, 6, AP_RND, AP_SAT> acc_t;
typedef ap_ufixed<8, 2, AP_RND_CONV, AP_SAT_SYM> g_t;
acc_t fir(din_t x, g_t gain, ap_int<6> k, bool &big, int &whole) {
  const din_t c0 = 0.25, c1 = -0.375, c2 = 1.125;
  static din_t d1 = 0, d2 = 0;
  acc_t acc = x * c0 + d1 * c1 + d2 * c2;
  d2 = d1; d1 = x;
  acc = acc * gain + k;
  ap_fixed<10, 3, AP_TRN_ZERO, AP_SAT_ZERO> small = acc;
  ap_fixed<10, 5, AP_RND_INF> r = acc - small;
  big = acc > 3 || r <= -1.5;
  whole = acc.to_int() + (int)r + (-x).to_int() + (x >> 1).to_int();
  return acc / 4 + (acc & x);
}
int main() {
  for (int i = 0; i < 24; i++) {
    bool b; int w;
    din_t x = (i * 0.731) - 7;
    acc_t y = fir(x, g_t(i * 0.13), i - 12, b, w);
    cout << x << " " << y << " " << b << " " << w << endl;
  }
  return 0;
}
`;

const TABLES = `#include <iostream>
#include "ap_fixed.h"
using namespace std;
typedef ap_fixed<16, 2> coef_t;
typedef ap_fixed<16, 8> data_t;
typedef ap_fixed<24, 10> acc_t;
#define N 8
data_t fir(data_t x) {
  static data_t shift[N];
  const coef_t c[N] = {0.0625, -0.125, 0.25, 0.5, 0.5, 0.25, -0.125, 0.0625};
  static const coef_t win[100] = {0.1, 0.2, 0.3, -0.4, 0.5, 0.25, 0.125};
  static ap_uint<7> n = 0;
  acc_t acc = 0;
  for (int i = N - 1; i > 0; i--) { shift[i] = shift[i - 1]; acc += shift[i] * c[i]; }
  shift[0] = x;
  acc += x * c[0];
  acc += x * win[n];
  if (n == 99) n = 0; else n++;
  return acc;
}
int main() {
  for (int i = 0; i < 20; i++) cout << fir(data_t(i * 1.5 - 9)) << endl;
  return 0;
}
`;

/** A random fixed-point function (seeded): two arguments, results in other types (+ - * & | ^, a comparison,
 *  to_int, -), its test bench of 40 calls. */
function genHw(seed) {
  let s = seed >>> 0 || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const pick = (a) => a[Math.floor(r() * a.length)];
  const Q = ['AP_RND', 'AP_RND_ZERO', 'AP_RND_MIN_INF', 'AP_RND_INF', 'AP_RND_CONV', 'AP_TRN', 'AP_TRN_ZERO'];
  const O = ['AP_SAT', 'AP_SAT_ZERO', 'AP_SAT_SYM', 'AP_WRAP'];
  const ty = () => { const w = 3 + Math.floor(r() * 20); const i = 1 + Math.floor(r() * w); return `ap_${r() < 0.7 ? '' : 'u'}fixed<${w}, ${i}, ${pick(Q)}, ${pick(O)}>`; };
  const A = ty(), B = ty(), C = ty(), D = ty();
  const op1 = pick(['+', '-', '*', '&', '|', '^']), op2 = pick(['+', '-', '*']), cmp = pick(['<', '>', '<=', '>=', '==', '!=']);
  return `#include <cstdio>
#include "ap_fixed.h"
typedef ${A} a_t;
typedef ${B} b_t;
typedef ${C} c_t;
typedef ${D} d_t;
void top(a_t a, b_t b, c_t &c, d_t &d, bool &k, int &n) {
  c = a ${op1} b;
  d = c ${op2} a;
  k = a ${cmp} b;
  n = d.to_int() + (-b).to_int();
}
int main() {
  unsigned x = ${Math.floor(r() * 1e9)};
  for (int i = 0; i < 40; i++) {
    x = x * 1103515245u + 12345u;
    a_t a = ((int)(x >> 8) % 4000) / 97.0;
    x = x * 1103515245u + 12345u;
    b_t b = ((int)(x >> 8) % 4000) / 61.0;
    c_t c; d_t d; bool k; int n;
    top(a, b, c, d, k, n);
    printf("%.10g %.10g %.10g %.10g %d %d\\n", a.to_double(), b.to_double(), c.to_double(), d.to_double(), (int)k, n);
  }
  return 0;
}
`;
}

const SQRT = `#include <cassert>
#include <cmath>
#include <iostream>
#include "ap_fixed.h"
using namespace std;
typedef ap_ufixed<24, 8> in_t;
typedef ap_ufixed<20, 6> out_t;
// a square root by the non-restoring method, its widths its arguments' types'
template <int W2, int I2, int W1, int I1> void root(ap_ufixed<W2, I2> &r, ap_ufixed<W1, I1> &x) {
  enum { QW = (I1 + 1) / 2 + (W2 - I2) + 1, SCALE = (W2 - W1) - (I2 - (I1 + 1) / 2), PREC = QW - (I1 % 2) };
  assert((I1 + 1) / 2 <= I2);
  ap_uint<QW> q = 0, qs = 0;
  ap_int<QW + 2> s;
  if (SCALE >= 0) s = x.range(W1 - 1, 0) << (SCALE);
  else s = ((x.range(W1 - 1, 0) >> (0 - (SCALE + 1))) + 1) >> 1;
  for (int i = 0; i <= PREC; i++) {
    if (s >= 0) { s = 2 * s - (((ap_int<QW + 2>(q) << 2) | 1) << (PREC - i)); qs = q << 1; q = (q << 1) | 1; }
    else { s = 2 * s + (((ap_int<QW + 2>(qs) << 2) | 3) << (PREC - i)); q = (qs << 1) | 1; qs <<= 1; }
  }
  if (s > 0) q = q + 1;
  r.range(W2 - 1, 0) = ap_uint<W2>(q >> 1);
}
out_t sqrt_top(in_t &x) {
  out_t r;
  root(r, x);
  return r;
}
int main() {
  int bad = 0;
  for (int i = 0; i < 24; i++) {
    in_t x = double(i * i) * 0.437 + i * 3.1;
    out_t r = sqrt_top(x);
    ap_ufixed<20, 6, AP_RND> ref = sqrt(x.to_double());
    if (fabs(r.to_double() - ref.to_double()) > 1.0 / (1 << 13)) bad++;
    cout << x << " " << r << " " << float(r) << endl;
  }
  return bad;
}
`;

const FIXED = `#include <iostream>
#include <iomanip>
#include "ap_fixed.h"
using namespace std;
typedef ap_fixed<16, 6> a_t;
typedef ap_ufixed<10, 3, AP_RND, AP_SAT> u_t;
int scale(int x) { return x * 2; }
int main() {
  a_t a = 3.141592653589793, b = -2.718281828;
  u_t u = 6.99999;
  ap_fixed<8, 4, AP_RND_CONV, AP_SAT_SYM> c = -9.5;
  cout << a << " " << b << " " << u << " " << c << endl;
  cout << a + b << " " << a - b << " " << a * b << " " << a / b << " " << (a & b) << endl;
  a_t d = a * b;
  cout << d << " " << d.to_double() << " " << d.to_int() << " " << (int)b << " " << -a << endl;
  for (int i = 0; i < 6; i++) {
    a_t x = i * 0.37 - 1;
    ap_fixed<6, 3, AP_RND> r1 = x; ap_fixed<6, 3, AP_TRN_ZERO> r2 = x; ap_fixed<6, 3, AP_RND_ZERO> r3 = x;
    ap_fixed<6, 3, AP_RND_MIN_INF> r4 = x; ap_fixed<6, 3, AP_RND_INF> r5 = x; ap_fixed<6, 3> r6 = x;
    cout << x << " " << r1 << " " << r2 << " " << r3 << " " << r4 << " " << r5 << " " << r6 << endl;
  }
  ap_fixed<4, 2, AP_TRN, AP_SAT_ZERO> z = 5; ap_ufixed<4, 2, AP_TRN, AP_SAT> s = -1;
  cout << z << " " << s << " " << (a > b) << " " << (a == 3) << " " << (a << 2) << " " << (b >> 1) << endl;
  a_t acc = 0;
  for (int i = 0; i < 10; i++) acc += a_t(0.1) * i;
  cout << setprecision(10) << acc << " " << setprecision(3) << acc << " " << acc * 1000000 << " " << a_t(0.0001) << endl;
  printf("%.6f %d\\n", acc.to_double(), scale(acc.to_int()));
  return 0;
}
`;

/** A program of n random cases (seeded): two ap_fixed / ap_ufixed of random widths, integer bits and modes, an
 *  operator, the result in a third type; printed by cout (30 digits) and printf of to_double. */
function genFixed(seed, n) {
  let s = seed >>> 0 || 1;
  const r = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  const pick = (a) => a[Math.floor(r() * a.length)];
  const Q = ['AP_RND', 'AP_RND_ZERO', 'AP_RND_MIN_INF', 'AP_RND_INF', 'AP_RND_CONV', 'AP_TRN', 'AP_TRN_ZERO'];
  const O = ['AP_SAT', 'AP_SAT_ZERO', 'AP_SAT_SYM', 'AP_WRAP'];
  const ty = () => { const w = 2 + Math.floor(r() * 30); const i = 1 + Math.floor(r() * w); return `ap_${r() < 0.7 ? '' : 'u'}fixed<${w}, ${i}, ${pick(Q)}, ${pick(O)}>`; };
  const val = () => ((r() - 0.5) * 2 ** Math.floor(r() * 12 - 4)).toPrecision(8);
  const L = ['#include <iostream>', '#include <iomanip>', '#include <cstdio>', '#include "ap_fixed.h"', 'using namespace std;', 'int id(int x) { return x; }', 'int main() {', '  cout << setprecision(30);'];
  for (let k = 0; k < n; k++) {
    const op = pick(['+', '-', '*', '/', '&', '|', '^']);
    L.push(`  { ${ty()} a = ${val()}; ${ty()} b = ${val()}; ${ty()} c = 0;`);
    L.push(`    ${op === '/' ? 'if (b != 0) ' : ''}c = a ${op} b;`);
    L.push(`    cout << a << " " << b << " " << c << " " << (a < b) << (a > b) << (a <= b) << (a >= b) << " " << (a == b) << (a != b) << " " << -a << " " << a.to_int() << " " << (a ${op === '/' ? '+' : op} b) << endl;`);
    L.push(`    printf("%.17g %.17g\\n", c.to_double(), (double)(b * a)); }`);
  }
  L.push('  return id(0);', '}');
  return L.join('\n');
}

test('#1643 ap_fixed: the types of the results, every quantization mode, saturation, conversions, comparisons, shifts, cout with its precision: as AMD\'s ap_fixed.h', { skip: AP.why || false }, () => {
  const sim = simulateC(FIXED, { file: 'fixed.cpp' });
  assert.deepEqual([sim.error, sim.diagnostics, sim.exitCode], [null, [], 0]);
  assert.equal(sim.output, runWithApInt(FIXED, AP.dir));
});

test('#1643 ap_fixed: random types, modes and operators (+ - * / & | ^, the six comparisons, -, to_int, to_double), as AMD\'s ap_fixed.h', { skip: AP.why || false }, () => {
  for (const seed of [11, 12, 13]) {
    const src = genFixed(seed, 50);
    const sim = simulateC(src, { file: 'r.cpp' });
    assert.deepEqual([sim.error, sim.diagnostics], [null, []], `seed ${seed}`);
    const ref = runWithApInt(src, AP.dir).split('\n'), got = sim.output.split('\n');
    ref.forEach((line, i) => assert.equal(got[i], line, `seed ${seed}, line ${i + 1}`));
  }
});

test('#1643 ap_fixed: what is not supported said', () => {
  const tb = (decl) => cToHdl(`#include "ap_fixed.h"\nint f(int x) { return x; }\nint main() {\n  ${decl}\n  return 0;\n}\n`, { file: 'e.cpp' }).diagnostics.map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(tb('ap_fixed<8, 4, AP_ROUND> a = 1;'), ["4 ap_fixed: 'AP_ROUND' is not a quantization mode (AP_RND, AP_RND_ZERO, AP_RND_MIN_INF, AP_RND_INF, AP_RND_CONV, AP_TRN, AP_TRN_ZERO)"]);
  assert.deepEqual(tb('ap_fixed<8, 4, AP_TRN, AP_WRAP, 2> a = 1;'), ['4 ap_fixed: saturation bits (N) are not supported yet']);
  assert.deepEqual(tb('ap_fixed<8, 4, AP_TRN, AP_WRAP_SM> a = 1;'), ['4 ap_fixed: AP_WRAP_SM are not supported yet']);
  assert.equal(simulateC('#include "ap_fixed.h"\nint f(int x) { return x; }\nint main() { ap_fixed<8, 4> a = 1.5; int k = a % 2; return k; }\n', { file: 't.cpp' }).error?.message, "'%' of an ap_fixed");
});

test('#1643 ap_fixed in hardware: a filter (constants of doubles, every quantization and overflow mode, products, a division by 4, bitwise, comparisons with a double, to_int, shifts) and tables of coefficients (registers, a ROM): AMD\'s C simulation, co-simulated in VHDL and Verilog, no warning', { skip: AP.why || false }, () => {
  for (const [src, file] of [[FIR, 'fir.cpp'], [TABLES, 'tables.cpp']]) {
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(src, { file, lang });
      assert.deepEqual(r.errors, [], file);
      assert.equal(r.pass, true, `${file} ${lang}: ${JSON.stringify(r.mismatches, big)}`);
      assert.deepEqual(r.gen.diagnostics, []);
      assert.equal(r.output, runWithApInt(src, AP.dir));
    }
  }
  assert.deepEqual(cToHdl(TABLES, { file: 'tables.cpp' }).report.memories, [{ name: 'win', words: 100, bits: 16, kind: 'ROM' }]);
});

test('#1643 ap_fixed in hardware: random types, modes and operators, co-simulated in VHDL and Verilog, their C simulation AMD\'s', { skip: AP.why || false }, () => {
  for (let seed = 1; seed <= 6; seed++) {
    const src = genHw(seed);
    const ref = runWithApInt(src, AP.dir);
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(src, { file: 'h.cpp', lang });
      assert.deepEqual([r.errors, r.output], [[], ref], `seed ${seed}`);
      assert.equal(r.pass, true, `seed ${seed} ${lang}: ${JSON.stringify(r.mismatches, big)}`);
    }
  }
});

test('#1643 a template square root on ap_ufixed (combinational: its loop unrolled; its widths deduced from its arguments\' types, enums of them, a constant branch shifting by a negative amount never run, assert, range() read and assigned, C++\'s ap_int<W>(x) and float(x) casts): AMD\'s C simulation, co-simulated in VHDL and Verilog, assert ignored by synthesis', { skip: AP.why || false }, () => {
  const sim = simulateC(SQRT, { file: 'sqrt.cpp' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  assert.equal(sim.output, runWithApInt(SQRT, AP.dir));
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SQRT, { file: 'sqrt.cpp', lang });
    assert.deepEqual([r.errors, r.pass], [[], true], lang);
    assert.deepEqual(r.gen.diagnostics.map((x) => `${x.line} ${x.message}`), ['11 assert is ignored by synthesis (the C simulation checks it)']);
    assert.deepEqual(r.gen.ports.map((x) => x.name), ['ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'x', 'ap_return']);
  }
});

test('#1643 the test bench\'s rand (31 bits, srand\'s seed) and assert (a failed one stops the C simulation)', () => {
  const r = simulateC('#include <stdlib.h>\n#include <stdio.h>\n#include <assert.h>\nint f(int x) { return x; }\nint main(void) {\n  srand(3);\n  int a = rand(), b = rand();\n  srand(3);\n  printf("%d %d\\n", a == rand() && b == rand(), a >= 0 && a <= RAND_MAX && a != b);\n  assert(f(2) == 3);\n  return 0;\n}\n', { file: 't.c' });
  assert.equal(r.output, '1 1\n');
  assert.equal(r.error?.message, 'assertion failed');
});
