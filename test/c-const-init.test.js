// Silinx HLS (#1779, core/c-const-init.js): a table computed at synthesis, as Vitis HLS computes one into a ROM: a call
// of a function that only writes its arrays from constants (math.h's sin, cos, round; float and double arithmetic) run
// by the C simulation at synthesis, its values the array's (a ROM), exactly the C simulation's; math.h and a division
// of constants folded; of values that are not constants, said. The C simulation as cc's; co-simulated in VHDL and Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { readFileSync } from 'node:fs';
import { checkC } from '../core/c-check.js';
import { foldTables } from '../core/c-const-init.js';
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

// #2151: a loop in the function's own body, run at synthesis as #1779's call of a function
const folded = (src) => foldTables(checkC(src, 't.c', { synthesis: true }));
const TABLE = (decl, loop, after = 'return x * t[k];') => `#include <math.h>\nint f(short x, unsigned char k) {\n  ${decl}\n  ${loop}\n  ${after}\n}\nint main(void) {\n  int s = 0;\n  for (int k = 0; k < 7; k++) s += f(k * 7 - 3, k * 40);\n  return s == 123456789;\n}\n`;
const SINE = '(short)(32768.0 * sin(3.14159265358979323846 * (i - 128) / 256.0))';
const LOOPS = {
  'a for, its index its own': TABLE('short t[256];', `for (int i = 0; i < 256; i++) t[i] = ${SINE};`),
  'an index declared before it': TABLE('short t[256];\n  int i;', `for (i = 0; i < 256; i++) { double v = sin(3.14159265358979323846 * (double)(i - 128) / 256.0); t[i] = (short)(32768.0 * v); }`),
  'labelled, its pragma with it': TABLE('short t[256];', `fill: for (int i = 0; i < 256; i++) {\n#pragma HLS PIPELINE II=1\n    t[i] = ${SINE};\n  }`),
  'a while': TABLE('short t[256];\n  int i = 0;', `while (i < 256) { t[i] = ${SINE}; i++; }`),
  'a do': TABLE('short t[256];\n  int i = 0;', `do { t[i] = ${SINE}; i++; } while (i < 256);`),
  'a local constant in it': TABLE('const int n = 256;\n  short t[n];', `for (int i = 0; i < n; i++) t[i] = ${SINE};`),
  'static': TABLE('static short t[256];', `for (int i = 0; i < 256; i++) t[i] = ${SINE};`),
};

test('#2151 a loop filling an array from constants and its index: a ROM of the C simulation\'s values, the loop not made, co-simulated in VHDL and Verilog, no warnings', () => {
  const bits = cToHdl(LOOPS['a for, its index its own'], { file: 't.c', lang: 'verilog' }).report.registerBits;
  for (const [name, src] of Object.entries(LOOPS)) {
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(src, { file: 't.c', lang });
      assert.deepEqual([r.errors, r.pass, r.calls, r.gen.diagnostics], [[], true, 7, []], `${name} ${lang} ${JSON.stringify(r.mismatches, big)}`);
      assert.deepEqual(r.gen.report.memories.map((m) => `${m.name} ${m.words}x${m.bits} ${m.kind}`), ['t 256x16 ROM'], name);
      assert.deepEqual([r.gen.report.loops, r.gen.report.states, r.gen.report.registerBits], [[], 4, bits + (name === 'a local constant in it' ? 32 : 0)], name);   // (a local constant keeps its register)
      assert.equal(r.latency.max, 2, name);
    }
  }
});

test('#2151 tables of more kinds: two in a loop, nested loops, one from another, floats, negative values; as the C simulation', () => {
  const src = `#include <math.h>
double f(unsigned char k, unsigned char j) {
  short a[100];
  int b[100];
  signed char m[8][16];
  float d[70];
  short e[100];
  for (int i = 0; i < 100; i++) { a[i] = i * i - 5000; b[i] = -i * 70000; }
  for (int r = 0; r < 8; r++) for (int c = 0; c < 16; c++) m[r][c] = r * c - 60;
  for (int i = 0; i < 70; i++) d[i] = sqrt(i + 0.5);
  for (int i = 0; i < 100; i++) e[i] = a[99 - i] + 1;
  return a[k % 100] + b[j % 100] + m[k & 7][j & 15] + e[j % 100] + d[k % 70];
}
int main(void) { double s = 0; for (int k = 0; k < 9; k++) s += f(k * 29, k * 13); return s == 0.25; }
`;
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 't.c', lang });
    assert.deepEqual([r.errors, r.pass, r.calls, r.gen.diagnostics], [[], true, 9, []], JSON.stringify(r.mismatches, big));
    assert.deepEqual(folded(src), ['f:a', 'f:b', 'f:m', 'f:d', 'f:e']);
  }
});

test('#2151 a table of ap_fixed, ap_int, bool, float, by a loop and by a function: its values the C simulation\'s; wider than a double\'s bits, not folded', () => {
  const src = (ty, fill) => `#include <ap_fixed.h>\n#include <ap_int.h>\n${fill ? `static void fill(${ty} t[100]) { for (int i = 0; i < 100; i++) t[i] = i * 0.37 - 3; }\n` : ''}int f(unsigned char k) {\n  ${ty} t[100];\n  ${fill ? 'fill(t);' : 'for (int i = 0; i < 100; i++) t[i] = i * 0.37 - 3;'}\n  return (int)(t[k % 100] * 8);\n}\nint main() { int s = 0; for (int k = 0; k < 9; k++) s += f(k * 7); return s == 77; }\n`;
  for (const ty of ['ap_fixed<16,4>', 'ap_ufixed<12,8>', 'ap_int<12>', 'bool', 'float']) {
    for (const fill of [false, true]) {
      for (const lang of ['vhdl', 'verilog']) {
        const r = cosimulate(src(ty, fill), { file: 't.cpp', lang });
        assert.deepEqual([r.errors, r.pass, r.gen.diagnostics], [[], true, []], `${ty} ${fill} ${lang} ${JSON.stringify(r.mismatches, big)}`);
      }
      assert.deepEqual(foldTables(checkC(src(ty, fill), 't.cpp', { synthesis: true })), ['f:t'], ty);
    }
  }
  assert.deepEqual(foldTables(checkC(src('ap_fixed<60,10>', false), 't.cpp', { synthesis: true })), []);
  assert.deepEqual(foldTables(checkC(src('ap_fixed<60,10>', true), 't.cpp', { synthesis: true })), []);
});

test('#2151 read through a pointer (the checker resolves it to the array): still a table', () => {
  assert.deepEqual(folded(TABLE('short t[100];', 'for (int i = 0; i < 100; i++) t[i] = i;', 'short *p = t;\n  return x * p[k % 100];')), ['f:t']);
});

const COUNT = 'the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)';
const PIPED = 'this loop is pipelined automatically, as Vitis HLS does (II=1): II=2 made (it accesses a memory, an access a state); #pragma HLS PIPELINE off in it turns that off';
const WARN = { 'its count from an input': [COUNT], 'the array read by it': [PIPED], 'an element added to': [PIPED] };
test('#2151 a loop that depends on anything else is not folded: it stays hardware, as the C says, co-simulated', () => {
  const NOT = {
    'its value from an input': TABLE('short t[100];', 'for (int i = 0; i < 100; i++) t[i] = i + x;', 'return t[k % 100];'),
    'its count from an input': TABLE('short t[100];', 'for (int i = 0; i < 100; i++) t[i] = 0;\n  for (int i = 0; i < k % 100; i++) t[i] = i + 1;', 'return x + t[k % 100];'),
    'its index read after it': TABLE('short t[100];\n  int i;', 'for (i = 0; i < 100; i++) t[i] = i;', 'return x * t[k % 100] + i;'),
    'the array written after it': TABLE('short t[100];', 'for (int i = 0; i < 100; i++) t[i] = i;', 't[3] = x;\n  return t[k % 100];'),
    'the array written before it': TABLE('short t[100];', 't[0] = x;\n  for (int i = 1; i < 100; i++) t[i] = i;', 'return t[k % 100];'),
    'the array read by it': TABLE('short t[100];', 't[0] = 1;\n  for (int i = 1; i < 100; i++) t[i] = t[i - 1] + 2;', 'return x * t[k % 100];'),
    'an element added to': TABLE('static short t[100];', 'for (int i = 0; i < 100; i++) t[i] += i;', 'return x * t[k % 100];'),
    'a variable changing across calls': `static int n = 1;\n${TABLE('short t[100];', 'for (int i = 0; i < 100; i++) t[i] = i * n;', 'n++;\n  return x * t[k % 100];')}`,
    'a static counter of its own': TABLE('short t[100];\n  static int c;', 'for (int i = 0; i < 100; i++) { t[i] = c; c++; }', 'return x * t[k % 100];'),
    'the array written through a pointer': TABLE('short t[100];', 'for (int i = 0; i < 100; i++) t[i] = i;', 'short *p = t;\n  p[1] = x;\n  return p[k % 100];'),
    'the array passed to a function': `static void set(short *p, short v) { p[1] = v; }\n${TABLE('short t[100];', 'for (int i = 0; i < 100; i++) t[i] = i;', 'set(t, x);\n  return t[k % 100];')}`,
  };
  for (const [name, src] of Object.entries(NOT)) {
    const r = cosimulate(src, { file: 't.c', lang: 'vhdl' });
    assert.deepEqual([r.errors, r.pass, r.gen.diagnostics.filter((d) => d.severity === 'error')], [[], true, []], `${name} ${JSON.stringify(r.mismatches, big)}`);
    assert.deepEqual(r.gen.diagnostics.map((d) => d.message), WARN[name] || [], name);
    assert.deepEqual(folded(src), [], name);
  }
});

test('#2151 the corpus\'s table against Vitis HLS\'s report (vitis.json: latency 6, no loop): a ROM, one multiplication, no sooner than its reads', () => {
  const { vitis } = JSON.parse(readFileSync(new URL('./hls-corpus/vitis.json', import.meta.url))).designs['interface-memory-rom-lookup-table-math'];
  const r = cosimulate(LOOPS['an index declared before it'], { file: 't.c', lang: 'verilog' });
  assert.deepEqual(vitis.loops, r.gen.report.loops);
  assert.ok(r.latency.max <= vitis.latency.max);
  assert.equal((r.gen.hdl.match(/ \* /g) || []).length, 1);
});
