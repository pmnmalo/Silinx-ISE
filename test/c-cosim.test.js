// Silinx HLS, C/RTL co-simulation (#1528): core/c-cosim.js. The test bench's calls of the top function replayed on the
// generated VHDL and Verilog (a combinational module, a sequential one through ap_ctrl_hs) and compared with the C's
// results: a pass with its latency; an HDL that differs reported call by call and port by port; a test bench that does
// not call the top, or a C simulation that fails, said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosimulate } from '../core/c-cosim.js';
import { simulateC } from '../core/c-interp.js';

const ADDER = `#include "ap_int.h"
#include <stdio.h>
void adder4(ap_uint<4> a, ap_uint<4> b, ap_uint<5> *sum, bool *carry) {
  ap_uint<5> s = a + b;
  *sum = s;
  *carry = s[4];
}
int main(void) {
  ap_uint<5> sum; bool carry;
  for (int a = 0; a < 16; a += 3) for (int b = 0; b < 16; b += 5) { adder4(a, b, &sum, &carry); printf("%d+%d=%d\\n", a, b, (int)sum); }
  return 0;
}
`;
const GCD = `#include <stdio.h>
unsigned gcd(unsigned a, unsigned b, unsigned *steps) {
  unsigned n = 0;
  while (b != 0) {
#pragma HLS LOOP_TRIPCOUNT max=64
    unsigned t = b;
    if (a >= b) { a = a - b; } else { b = a; a = t; }
    if (a < b) { t = a; a = b; b = t; }
    n++;
  }
  *steps = n;
  return a;
}
int main(void) {
  unsigned st;
  unsigned t[5][2] = {{48, 18}, {17, 5}, {100, 75}, {7, 0}, {1000, 3}};
  for (int k = 0; k < 5; k++) printf("gcd %u\\n", gcd(t[k][0], t[k][1], &st));
  return 0;
}
`;

test('#1528 co-simulation: a combinational module (ap_ctrl_hs), its calls replayed in VHDL and Verilog: a pass', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(ADDER, { file: 'adder4.c', lang });
    assert.deepEqual(r.errors, [], lang);
    assert.deepEqual([r.ok, r.pass, r.calls, r.mismatches, r.latency], [true, true, 24, [], null], lang);
    assert.match(r.output, /^0\+0=0\n0\+5=5\n/);
  }
});

test('#1528 co-simulation: a sequential module through ap_ctrl_hs: a pass, its latency (cycles per call)', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(GCD, { file: 'gcd.c', lang });
    assert.deepEqual(r.errors, [], lang);
    assert.deepEqual([r.ok, r.pass, r.calls, r.mismatches], [true, true, 5, []], lang);
    assert.ok(r.latency.min > 0 && r.latency.max > r.latency.min, JSON.stringify(r.latency));
  }
});

test('#1528 co-simulation: an HDL that differs from the C: each mismatch with its call and port; no call of the top, a C simulation that fails: said', () => {
  const r = cosimulate(ADDER, { file: 'adder4.c', lang: 'verilog', alter: (h) => h.replace(/assign (ap_t\d+) = (ap_t\d+) \+ (ap_t\d+);/, 'assign $1 = $2 - $3;') });
  assert.equal(r.pass, false);
  assert.ok(r.mismatches.length > 0);
  assert.deepEqual(Object.keys(r.mismatches[0]), ['call', 'port', 'expected', 'got']);
  assert.ok(r.mismatches.every((m) => ['sum', 'carry'].includes(m.port)), JSON.stringify(r.mismatches.slice(0, 3), (_, x) => (typeof x === 'bigint' ? String(x) : x)));
  const none = cosimulate('int f(int a) { return a; }\nint main(void) { return 0; }');
  assert.deepEqual([none.ok, none.pass, none.errors], [true, false, ["the test bench (main) does not call the top function 'f': nothing to compare"]]);
  const fails = cosimulate('int f(int a) { return a; }\nint main(void) { int z = 0; return f(1) / z; }');
  assert.deepEqual([fails.ok, fails.errors], [false, ['the C simulation failed: line 2: division by zero']]);
});

test('#1588 co-simulation: an ap_int division by a wider divisor: its operands divided as they are, the quotient wrapped (the divisor kept its value), in the C simulation and the HDL', () => {
  const src = `#include "ap_int.h"
#include <stdio.h>
ap_int<4> div8(ap_int<4> x) {
  ap_uint<4> d = 8;
  return x / d;
}
int main(void) {
  for (int x = -8; x < 8; x += 3) printf("%d ", (int)div8(x));
  return 0;
}
`;
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'div8.c', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.output, '-1 0 0 0 0 0 ');
    assert.deepEqual(r.gen.diagnostics.filter((d) => d.severity !== 'info'), []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, (k, v) => (typeof v === 'bigint' ? `${v}` : v)));
    assert.equal(r.calls, 6);
  }
});

test('#1597 a source of several files: the top function in its own file with its header, the test bench in another (a unit including both), the top named: the C simulation and the co-simulation as of one file', () => {
  const headers = {
    'mac.h': '#ifndef MAC_H\n#define MAC_H\n#include "ap_int.h"\n#define TAPS 4\ntypedef ap_int<12> sample_t;\nint mac(sample_t x, int k);\n#endif\n',
    'mac.c': '#include "mac.h"\nint mac(sample_t x, int k) {\n  static int acc = 0;\n  acc += x * (k % TAPS);\n  return acc;\n}\n',
    'mac_test.c': '#include <stdio.h>\n#include "mac.h"\nstatic int scale(int v) { return v * 2; }\nint main(void) {\n  int r = 0;\n  for (int k = 0; k < 6; k++) r = mac(scale(k) - 5, k);\n  printf("%d\\n", r);\n  return r == 3 ? 0 : 1;\n}\n',
  };
  const unit = '#include "mac.c"\n#include "mac_test.c"\n';
  // (without the top named, the test bench's last function is taken)
  assert.equal(simulateC(unit, { file: 'unit.c', headers }).top, 'scale');
  const sim = simulateC(unit, { file: 'unit.c', headers, top: 'mac' });
  assert.deepEqual([sim.error, sim.top, sim.output, sim.exitCode, sim.calls.length], [null, 'mac', '3\n', 0, 6]);
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(unit, { file: 'unit.c', lang, headers, top: 'mac' });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true);
    assert.equal(r.gen.top, 'mac');
    assert.deepEqual(r.gen.diagnostics, []);
  }
});

test('#1604 a pointer written under a condition, then read: where the condition does not hold, the caller\'s value (an input, ap_ovld), combinational and sequential', () => {
  const comb = '#include <stdio.h>\nvoid f(int c, int *y) {\n  if (c) *y = 5;\n  *y = *y + 1;\n}\nint main(void) { int y = 10; f(0, &y); printf("%d\\n", y); y = 10; f(1, &y); printf("%d\\n", y); return 0; }\n';
  const seq = '#include <stdio.h>\nvoid f(int c, int n, int *y) {\n  if (c) *y = 5;\n  for (int k = 0; k < n; k++) {\n#pragma HLS LOOP_TRIPCOUNT max=4\n    *y = *y + 1;\n  }\n}\nint main(void) { int y = 10; f(0, 2, &y); printf("%d\\n", y); y = 10; f(1, 3, &y); printf("%d\\n", y); return 0; }\n';
  for (const [src, out] of [[comb, '11\n6\n'], [seq, '12\n8\n']]) {
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(src, { file: 'p.c', lang });
      assert.equal(r.output, out);
      assert.deepEqual(r.errors, []);
      assert.equal(r.pass, true, lang);
      assert.deepEqual(r.gen.ports.filter((p) => p.param === 'y').map((p) => p.name), ['y_i', 'y_o', 'y_o_ap_vld']);
    }
  }
});

test('#1622 a pointer read and written named as a reserved word (out): its ports out_r_i, out_r_o, out_r_o_ap_vld, the module reading out_r_i, combinational and sequential', () => {
  const comb = '#include <stdio.h>\nvoid f(int x, int *out) {\n  *out += x;\n}\nint main(void) { int o = 1; f(2, &o); f(5, &o); printf("%d\\n", o); return 0; }\n';
  const seq = '#include <stdio.h>\nvoid f(int x, int *out) {\n  static int a;\n  a += x;\n  *out += a;\n}\nint main(void) { int o = 1; f(2, &o); f(5, &o); printf("%d\\n", o); return 0; }\n';
  for (const [src, out] of [[comb, '8\n'], [seq, '10\n']]) {
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(src, { file: 'p.c', lang });
      assert.equal(r.output, out);
      assert.deepEqual(r.errors, []);
      assert.equal(r.pass, true, lang);
      assert.deepEqual(r.gen.ports.filter((p) => p.param === 'out').map((p) => p.name), ['out_r_i', 'out_r_o', 'out_r_o_ap_vld']);
      assert.deepEqual(r.gen.diagnostics.map((d) => d.message), ["'out' is a reserved word of VHDL or Verilog: it is named out_r in the module"]);
      assert.match(r.gen.hdl, /out_r_i/);
      assert.doesNotMatch(r.gen.hdl, /\bout_i\b/);
    }
  }
});

// (#1899: the corpus's partitioned matrix products, small: their arrays partitioned block, cyclic or complete, the
// product made rep times, as the corpus's 16 times; the arrays copied in and out as the corpus's)
const MATMUL = (pragma) => `#include <stdio.h>
#define N 4
void matmul(int in1[N * N], int in2[N * N], int res[N * N], int rep) {
  int A[N * N], B[N * N], C[N * N];
${pragma}
  for (int k = 0; k < N * N; k++) { A[k] = in1[k]; B[k] = in2[k]; }
  for (int x = 0; x < rep; x++) {
#pragma HLS LOOP_TRIPCOUNT max=16
    for (int i = 0; i < N; i++) {
      for (int j = 0; j < N; j++) {
        int result = 0;
        for (int k = 0; k < N; k++) result += A[i * N + k] * B[k * N + j];
        C[i * N + j] = result;
      }
    }
  }
  for (int k = 0; k < N * N; k++) res[k] = C[k];
}
int main(void) {
  int a[N * N], b[N * N], c[N * N];
  for (int k = 0; k < N * N; k++) { a[k] = k % 7 - 3; b[k] = (k * 5) % 11; }
  matmul(a, b, c, 16);
  for (int i = 0; i < N; i++) for (int j = 0; j < N; j++) {
    int g = 0;
    for (int k = 0; k < N; k++) g += a[i * N + k] * b[k * N + j];
    if (c[i * N + j] != g) { printf("mismatch %d %d\\n", i, j); return 1; }
  }
  printf("%d %d\\n", c[0], c[N * N - 1]);
  return 0;
}
`;
// (the copy loop pipelined automatically, #1919: in1 and in2 read one after the other)
const PARTITIONS = [
  ['block', '#pragma HLS ARRAY_PARTITION variable=B dim=1 block factor=4', []],
  ['cyclic', '#pragma HLS ARRAY_PARTITION variable=A dim=1 cyclic factor=4', []],
  ['complete', '#pragma HLS ARRAY_PARTITION variable=B dim=1 complete', []],
];

test('#1899 co-simulation: a call that does more cycles than maxCycles, as many as its C steps at most, ends: partitioned matrix products (block, cyclic, complete) in VHDL and Verilog, their results the C\'s', () => {
  for (const [kind, pragma, warnings] of PARTITIONS) {
    const src = MATMUL(pragma);
    const sim = simulateC(src, { file: 'matmul.c' });
    assert.deepEqual([sim.error, sim.exitCode, sim.calls.length], [null, 0, 1], kind);
    assert.equal(sim.output, '-25 -4\n', kind);   // (by hand: 0 - 18 - 7 + 0, 8 + 6 + 0 - 18)
    for (const lang of ['vhdl', 'verilog']) {
      // (300 cycles: fewer than the call's, as the corpus's 100000 were fewer than its 221257)
      const r = cosimulate(src, { file: 'matmul.c', lang, maxCycles: 300 });
      assert.deepEqual(r.errors, [], `${kind} ${lang}`);
      assert.deepEqual([r.ok, r.pass, r.calls, r.mismatches], [true, true, 1, []], `${kind} ${lang}`);
      // (the call's steps, its bound: more than the cycles it takes)
      assert.ok(r.latency.min > 300 && r.latency.min < sim.calls[0].steps, `${kind} ${lang}: ${JSON.stringify(r.latency)}, ${sim.calls[0].steps} steps`);
      assert.deepEqual(r.gen.diagnostics.map((d) => `${d.severity}: ${d.message}`), warnings, `${kind} ${lang}`);
    }
  }
});

test('#1899 co-simulation: a call that never ends (ap_done never 1) stops at its bound, maxCycles or its C steps, and says it', () => {
  const src = MATMUL(PARTITIONS[2][1]);
  const steps = simulateC(src, { file: 'matmul.c' }).calls[0].steps;
  const never = { vhdl: (h) => h.replace(/ap_done <= '1' when [^;]*;/, "ap_done <= '0';"), verilog: (h) => h.replace(/assign ap_done = [^;]*;/, "assign ap_done = 1'b0;") };
  for (const lang of ['vhdl', 'verilog']) {
    for (const [maxCycles, bound] of [[300, steps], [steps + 50, steps + 50]]) {
      const r = cosimulate(src, { file: 'matmul.c', lang, maxCycles, alter: never[lang] });
      assert.deepEqual([r.ok, r.pass, r.errors], [true, false, [`a call did not end in ${bound} cycles`]], `${lang} ${maxCycles}`);
    }
  }
});
