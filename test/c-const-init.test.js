// Silinx HLS (#1779, core/c-const-init.js): a table computed at synthesis, as Vitis HLS computes one into a ROM: a call
// of a function that only writes its arrays from constants (math.h's sin, cos, round; float and double arithmetic) run
// by the C simulation at synthesis, its values the array's (a ROM), exactly the C simulation's; math.h and a division
// of constants folded; of values that are not constants, said. The C simulation as cc's; co-simulated in VHDL and Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { noCC, compiledRun } from './c-helpers.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const SRC = `#include <math.h>
#include <stdio.h>
#define N 128   /* (more than 64: a memory, a ROM) */
#define M_PI 3.14159265358979323846
static void hamming(short w[N]) {
  for (int i = 0; i < N; i++) w[i] = (short)round(16384.0f * (0.54f - 0.46f * cos(2.0f * M_PI * i / (float)(N - 1))));
}
static void sines(short s[N], double d[8]) {
  for (int i = 0; i < N; i++) s[i] = (short)(32767.0 * sin(M_PI * (i - N / 2) / N));
  for (int i = 0; i < 8; i++) d[i] = sqrt(i + 0.5) / 3.0;
}
int window(short x, unsigned char k, double *r) {
  static short w[N];
  short s[N];
  double d[8];
  hamming(w);
  sines(s, d);
  *r = d[k & 7] * x;
  return w[k & (N - 1)] * x + s[(k + 7) & (N - 1)] + (int)(1.0 / 3.0 * 3000.0);
}
int main(void) {
  double r;
  for (int k = 0; k < 6; k++) { int v = window(k * 100 - 250, k * 11, &r); printf("%d %.17g\\n", v, r); }
  return 0;
}
`;

test('#1779 tables filled from sin, cos, round, sqrt and float / double arithmetic: the C simulation as cc\'s', { skip: noCC }, () => {
  const sim = simulateC(SRC, { file: 'win.c' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  assert.equal(sim.output, compiledRun(SRC).output);
});

test('#1779 the tables computed at synthesis (ROMs of the C simulation\'s values), co-simulated in VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC, { file: 'win.c', lang });
    assert.deepEqual([r.errors, r.pass, r.calls, r.gen.diagnostics], [[], true, 6, []], JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.report.memories.map((m) => `${m.name} ${m.words}x${m.bits} ${m.kind}`), ['w 128x16 ROM', 's 128x16 ROM']);
  }
});

test('#1779 not a table (an argument read, an array written elsewhere): not folded; math.h of a value that is not a constant, said', () => {
  const errs = (src) => cToHdl(src, { file: 'e.c' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(errs('#include <math.h>\ndouble f(double x) { return lround(x); }\n'),
    ['2 lround: floating point is not supported in Silinx HLS yet (math.h in hardware: sqrt, fabs, floor, ceil, trunc, round, fmin, fmax, copysign, exp, log, sin, cos, pow, tan, log2, log10, exp2, hypot, fmod, atan, asin, acos, atan2, sinh, cosh, tanh and cbrt, the others only of constants, a table computed at synthesis, #1761)']);
  assert.deepEqual(errs('#include <math.h>\nstatic void fill(int t[4], int k) { for (int i = 0; i < 4; i++) t[i] = (int)lround(i * k); }\nint f(int k) {\n  int t[4];\n  fill(t, k);\n  return t[k & 3];\n}\n'),
    ['2 lround: floating point is not supported in Silinx HLS yet (math.h in hardware: sqrt, fabs, floor, ceil, trunc, round, fmin, fmax, copysign, exp, log, sin, cos, pow, tan, log2, log10, exp2, hypot, fmod, atan, asin, acos, atan2, sinh, cosh, tanh and cbrt, the others only of constants, a table computed at synthesis, #1761)']);
  // (a division of constants: folded)
  assert.deepEqual(errs('double f(double x) { return x * (1.0 / 3.0); }\n'), []);
});
