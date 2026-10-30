// Silinx HLS: float and double in the C simulation's test bench (core/c-float.js): printf's %f %e %g printed as C's
// library prints them (against cc on edge values: ties, exponents, the # and + flags), arithmetic and conversions,
// math.h, C++'s cout of doubles with <iomanip>'s state kept from one statement to the next. Refused in hardware.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { fmtFloat } from '../core/c-float.js';
import { noCC, compiledRun } from './c-helpers.js';
import { apIntHeaders, runWithApInt } from './ap-int-ref.js';

const AP = await apIntHeaders();
const errs = (src, file = 'e.c') => cToHdl(src, { file }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);

const VALUES = [0, 1, -1, 0.1, 0.125, 0.375, 2.5, 1e-5, 123456789, 1 / 3, -2 / 3, 1e21, 9.9999995, 0.00012345, 1e100, 5e-324, 123.456e-10, 99999.95, 0.5, 1.5, -0, 1e-300];
const FORMATS = ['%f', '%.2f', '%.0f', '%e', '%.3e', '%g', '%.3g', '%.10g', '%#g', '%G', '%E', '%.0e', '%+f', '% g', '%.0g', '%#.0f'];

const TB = `#include <stdio.h>
#include <math.h>
int scale(int x) { return x * 3 + 1; }
int main(void) {
  double acc = 0.0, w[5] = {0.5, 0.25, 0.125, 1e-3, -2.5};
  float f = 1.0f / 3;
  int errors = 0;
  for (int i = 0; i < 5; i++) {
    double y = scale(i) * w[i];
    acc += y;
    printf("%d %f %.3e %g %10.4f|%-8.2g|%+.1f\\n", i, y, y, acc, sqrt(fabs(acc)), y / 7, -y);
    if (fabs(y - (double)scale(i) * w[i]) > 1e-9) errors++;
  }
  int t = (int)(acc * 100);
  unsigned char c = (unsigned char)2.9;
  printf("%d %d %g %f %d %g %g\\n", t, c, f, (double)f, (int)-3.7, pow(2, 0.5), floor(-2.5) + ceil(2.1) + round(2.5) + round(-2.5));
  printf("%s\\n", acc > 3 ? "big" : "small");
  return errors;
}
`;

const COUT = `#include <iostream>
#include <iomanip>
#include <cmath>
#include "ap_int.h"
using namespace std;
int twice(int x) { return 2 * x; }
int main() {
  cout << twice(21) << endl;
  double v[] = {0.1, 2.0 / 3, 1234567.891, -0.000123456, 1e-10, 100.0};
  for (int i = 0; i < 6; i++) cout << v[i] << " ";
  cout << endl;
  cout << fixed << setprecision(3);
  for (int i = 0; i < 6; i++) cout << setw(12) << v[i];
  cout << endl;
  cout << 2.5 << " " << 7 << endl;
  cout << scientific << v[2] << " " << setprecision(1) << v[3] << endl;
  cout << defaultfloat << setprecision(10) << v[1] << " " << hex << 255 << " " << dec << 255 << endl;
  ap_int<12> a = -100;
  ap_uint<70> big = 1;
  big = big << 69;
  char c = 'Z';
  unsigned char u = 65;
  bool b = true;
  cout << a << " " << big << " " << c << u << " " << b << " " << a.to_double() / 8 << " " << sqrt(2.0) << endl;
  cout << setfill('0') << setw(6) << -42 << setfill(' ') << "|" << left << setw(5) << 3 << "|" << endl;
  return 0;
}
`;

test('printf\'s %f %e %g of a double: as cc\'s library prints them (the exact value rounded half to even, two-digit exponents, the flags)', { skip: noCC }, () => {
  const lit = (x) => (Object.is(x, -0) ? '-0.0' : x.toExponential(17));
  const src = `#include <stdio.h>\nint main(void) {\n  double v[] = {${VALUES.map(lit).join(', ')}};\n  for (int i = 0; i < ${VALUES.length}; i++) {\n${FORMATS.map((f) => `    printf("${f}|", v[i]);`).join('\n')}\n    printf("\\n");\n  }\n  return 0;\n}\n`;
  const ref = compiledRun(src).output.split('\n');
  VALUES.forEach((x, i) => {
    const mine = FORMATS.map((f) => { const m = /%([-+ 0#]*)(?:\.(\d+))?([a-zA-Z])/.exec(f); return `${fmtFloat(m[3], x, m[2] === undefined ? undefined : Number(m[2]), m[1])}|`; }).join('');
    assert.equal(mine, ref[i], `${x}`);
  });
  // (and through the C simulation)
  assert.equal(simulateC(src, { file: 'f.c' }).output, ref.join('\n'));
});

test('a test bench with doubles and floats: arithmetic, conversions (to int toward zero, to unsigned char, float rounding), math.h, printf\'s widths: the C simulation as cc\'s', { skip: noCC }, () => {
  const sim = simulateC(TB, { file: 'tb.c' });
  assert.deepEqual([sim.error, sim.diagnostics], [null, []]);
  const ref = compiledRun(TB);
  assert.deepEqual([sim.output, sim.exitCode], [ref.output, ref.exitCode]);
});

test('C++\'s cout of doubles (6 significant digits), fixed / scientific / defaultfloat and setprecision kept from one statement to the next, hex / dec, setfill and setw, chars, bools, ap_int\'s to_double, wide ap_uint: as the C++ compiler with AMD\'s ap_int.h', { skip: AP.why || false }, () => {
  const sim = simulateC(COUT, { file: 'cout.cpp' });
  assert.deepEqual([sim.error, sim.diagnostics, sim.exitCode], [null, [], 0]);
  assert.equal(sim.output, runWithApInt(COUT, AP.dir));
});

test('floating point in hardware: math.h of values but sqrt and fabs refused (float and double made: test/c-float-hw.test.js, #1768, #1773, #1783)', () => {
  // (sqrt made, #1783; exp of a value not yet)
  assert.deepEqual(errs('#include <math.h>\nint f(int x) {\n  return (int)sqrt(x) + (int)lround(x);\n}\n'), ['3 lround: floating point is not supported in Silinx HLS yet (math.h in hardware: sqrt, fabs, floor, ceil, trunc, round, fmin, fmax, copysign, exp, log, sin, cos, pow, tan, log2, log10, exp2, hypot, fmod, atan, asin, acos, atan2, sinh, cosh, tanh and cbrt, the others only of constants, a table computed at synthesis, #1761)']);
  // (a double and a double constant: made, #1773)
  assert.deepEqual(errs('int f(int x) {\n  double d = x * 0.5;\n  return d;\n}\n'), []);
  assert.deepEqual(errs('int f(int x) {\n  return x * 0.5;\n}\n'), []);
  const run = (src) => simulateC(src, { file: 't.c' }).error?.message;
  assert.equal(run('int f(int x) { return x; }\nint main(void) { double d = 2.5; int k = (int)(d % 2); return k; }\n'), "the operator '%' of a floating-point value");
});
