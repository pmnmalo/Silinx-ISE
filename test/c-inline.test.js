// Silinx HLS (#1632): core/c-inline.js. A sequential top function's calls of functions with loops, or given an array (a
// memory too), inlined into its body: a chain of them, early returns (inside nested loops too), a static shared by
// every call, calls inside expressions, a C++ operator() with a loop. Against the host's compiler (cc; c++ with AMD's
// ap_int.h), co-simulated in VHDL and Verilog with no warning; what is not supported said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { noCC, compiledRun } from './c-helpers.js';
import { apIntHeaders, runWithApInt } from './ap-int-ref.js';

const AP = await apIntHeaders();
const errs = (src, file = 'e.c') => cToHdl(src, { file }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);

const SEARCH = `#include <stdio.h>
int sum(int a[100], int n) {
  int s = 0;
  for (int i = 0; i < 100; i++) { if (i >= n) break; s += a[i]; }
  return s;
}
int find(int a[100], int v) {
  for (int i = 0; i < 100; i++) if (a[i] == v) return i;
  return -1;
}
int first_above(int a[100], int t) {
  for (int r = 0; r < 10; r++)
    for (int c = 0; c < 10; c++)
      if (a[r * 10 + c] > t) return r * 10 + c;
  return -1;
}
void fill(int a[100], int k, int *last) {
  static int calls;
  calls++;
  for (int i = 0; i < 100; i++) a[i] = i * k + calls;
  *last = a[99];
}
void refill(int a[100], int k, int *last) {
  fill(a, k, last);
  if (k > 2) return;
  fill(a, k + 1, last);
}
int top(int k, int n, int *pos, int *last) {
  static int buf[100];
  refill(buf, k, last);
  *pos = find(buf, 3 * k + 1) + 1000 * (sum(buf, n) > 50);
  int r = sum(buf, n) + find(buf, 2 * k + 1);
  return r + 10000 * first_above(buf, 40 * k);
}
int main(void) {
  int p, l;
  for (int k = 1; k < 5; k++) { int r = top(k, k * 5, &p, &l); printf("%d %d %d\\n", r, p, l); }
  return 0;
}
`;

const SHIFT = `#include <iostream>
#include "ap_int.h"
using namespace std;
struct Acc {
  int sum;
  ap_uint<4> n;
  Acc() : sum(0), n(0) {}
  void add(int v) { sum += v; n++; bump(); }
  void bump() { if (n == 15) n = 0; }
  int mean() const;
};
int Acc::mean() const { return n ? sum / 4 : 0; }
class Shift {
  int taps[4];
public:
  Shift(int init) { for (int i = 0; i < 4; i++) taps[i] = init; }
  int operator()(int x) {
    int s = 0;
    for (int i = 3; i > 0; i--) { taps[i] = taps[i - 1]; s += taps[i]; }
    taps[0] = x;
    return s + x;
  }
};
int top(int x, int &m) {
  static Acc acc;
  Shift sh(1);
  int y = sh(x);
  y += sh(x + 1);
  acc.add(y);
  m = acc.mean();
  return y;
}
int main() {
  int m;
  for (int i = 0; i < 6; i++) { int y = top(i * 3, m); cout << y << " " << m << endl; }
  return 0;
}
`;

test('#1632 functions with loops given a memory, called by the top (a chain of them, early returns in nested loops, a shared static, calls in expressions): the C simulation as cc\'s', { skip: noCC }, () => {
  const sim = simulateC(SEARCH, { file: 'search.c' });
  assert.deepEqual([sim.error, sim.diagnostics], [null, []]);
  const ref = compiledRun(SEARCH);
  assert.deepEqual([sim.output, sim.exitCode], [ref.output, ref.exitCode]);
});

test('#1632 functions with loops called by the top: inlined, co-simulated in VHDL and Verilog, one warning (pos named pos_r, #1902); the memory one, its loops the top\'s', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SEARCH, { file: 'search.c', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), ["28 warning: 'pos' is a name Vitis HLS reserves: it is named pos_r in the module"]);
    assert.deepEqual(r.gen.ports.filter((p) => p.param === 'pos').map((p) => p.name), ['pos_r', 'pos_r_ap_vld']);
    assert.deepEqual(r.gen.report.memories, [{ name: 'buf', words: 100, bits: 32, kind: 'RAM' }]);
    // (each call's loops its own: refill's two fills, find twice, sum twice, first_above's two)
    assert.equal(r.gen.report.loops.length, 8);
  }
});

test('#1632 C++: an operator() with a loop, called by the top: the C simulation as the C++ compiler with AMD\'s ap_int.h, co-simulated', { skip: AP.why || false }, () => {
  const sim = simulateC(SHIFT, { file: 'shift.cpp' });
  assert.deepEqual([sim.error, sim.diagnostics, sim.exitCode], [null, [], 0]);
  assert.equal(sim.output, runWithApInt(SHIFT, AP.dir));
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SHIFT, { file: 'shift.cpp', lang });
    assert.deepEqual([r.errors, r.pass, r.gen.diagnostics], [[], true, []]);
  }
});

test('#1632 calls inlined: what is not supported said', () => {
  const g = 'int g(int a[8]) {\n  int s = 0;\n  for (int i = 0; i < 8; i++) s += a[i];\n  return s;\n}\n';
  assert.deepEqual(errs(`${g}int f(int a[8], int n) {\n  int k = 0;\n  while (g(a) > k) {\n#pragma HLS LOOP_TRIPCOUNT max=4\n    k++;\n  }\n  return k;\n}\n`), ["8 'g' is called in a loop's condition: call it in the loop's body"]);
  assert.deepEqual(errs(`${g}int f(int a[8], int n) {\n  return n > 2 && g(a) > 3;\n}\n`), ["7 'g' is called where it may not run (after && / || / ?:): call it as a statement of its own"]);
  assert.deepEqual(errs('int h(int a[8], int x) {\n  switch (x) { case 1: return a[0]; default: break; }\n  for (int i = 0; i < 8; i++) x += a[i];\n  return x;\n}\nint f(int a[8], int n) {\n  return h(a, n);\n}\n'), ["2 a return inside a 'switch' of 'h', which is inlined: not supported yet"]);
});

test('#1637 a call inlined: the callee\'s locals have names of their own (one named as the variable the caller passes does not hide it)', () => {
  const src = '#include <stdio.h>\nvoid twice(int a[4], int *m) {\n  int m2 = 0;\n  for (int i = 0; i < 4; i++) m2 += a[i];\n  *m = 2 * m2;\n}\nint top(int a[4]) {\n  int m2;\n  twice(a, &m2);\n  return m2 + 1;\n}\nint main(void) { int a[4] = {1, 2, 3, 4}; printf("%d\\n", top(a)); return 0; }\n';
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'm.c', lang });
    assert.deepEqual([r.errors, r.output, r.pass, r.gen.diagnostics], [[], '21\n', true, []]);
  }
});
