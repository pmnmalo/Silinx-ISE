// Silinx HLS (#1599, core/c-pointer.js): pointer arithmetic as Vitis HLS takes it. *(p + e) is p[e]; a pointer argument
// indexed a memory (ap_memory, its depth the INTERFACE pragma's or 1024, said); a local pointer its target (one of
// several: a multiplexer of their elements) and an offset (&a[k], p += n, p++). The C simulation as cc's, the
// co-simulation in VHDL and Verilog with their exact warnings; what is not supported, said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { hdlName } from '../core/c-graph.js';
import { noCC, compiledRun } from './c-helpers.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const SRC = `#include <stdio.h>
static int ta[8] = {1, 2, 3, 4, 5, 6, 7, 8};
static int tb[8] = {80, 70, 60, 50, 40, 30, 20, 10};

int ptrs(int *d, int *s, int sel, int k) {
#pragma HLS INTERFACE ap_memory port=d depth=6
  static int acc = 0;
  for (int i = 0; i < 4; i++) {
    acc += *(d + i + 1);
    *(d + i) = acc - *s;
  }
  int *t;
  if (sel) t = ta; else t = tb;
  int r = t[k & 7] + *(t + 1);
  int buf[6] = {0, 0, 0, 0, 0, 0};
  int *w = &buf[1];
  for (int i = 0; i < 4; i++) { *w = i * k; w += 1; }
  w = buf;
  w++;
  int _tot = 0;
  int *pt = &_tot;
  for (int i = 0; i < 6; i++) *pt += buf[i];
  return r + *w + *(w + 2) + _tot + *(s + 1);
}

int main(void) {
  int d[6] = {5, -3, 9, 2, 7, 1}, s[2] = {4, 6};
  int sum = 0;
  for (int c = 0; c < 3; c++) {
    sum += ptrs(d, s, c & 1, c * 3 + 1);
    for (int i = 0; i < 6; i++) printf("%d ", d[i]);
    printf("| %d\\n", sum);
  }
  return 0;
}
`;

test('#1599 pointer arithmetic and pointer variables in the C simulation: as cc\'s', { skip: noCC }, () => {
  const sim = simulateC(SRC, { file: 'ptrs.c' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  const ref = compiledRun(SRC);
  assert.equal(sim.output, ref.output);
});

test('#1599 co-simulated in VHDL and Verilog: the indexed pointer arguments memories (d of the pragma\'s depth, s of 1024, said); the local pointers registers', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC, { file: 'ptrs.c', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), [
      "5 warning: the pointer argument 's' is indexed: a memory (ap_memory) of 1024 elements, its depth not given (#pragma HLS INTERFACE port=s depth=N)",
      '8 warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=2 made (the memory \'d\' has one port, accessed 2 times an iteration); #pragma HLS PIPELINE off in it turns that off']);
    assert.deepEqual(r.gen.ports.filter((p) => /^[ds]_/.test(p.name)).map((p) => `${p.name}:${p.w}`), [
      'd_address0:3', 'd_ce0:1', 'd_we0:1', 'd_d0:32', 'd_q0:32', 's_address0:10', 's_ce0:1', 's_q0:32']);
  }
});

test('#1599 a C name as part of an HDL name: no \'__\', no \'_\' at its ends', () => {
  assert.deepEqual(['x', '_tot', 'a__b', 'end_', 'a___b'].map(hdlName), ['x', 'u0_tot', 'a_u0_b', 'end_u0', 'a_u0_u0_b']);
});

test('#1599 what is not supported, said once', () => {
  const errs = (src) => cToHdl(src, { file: 'e.c' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(errs('int a[4], b[4];\nint f(int s, int v) {\n  int *p;\n  if (s) p = a; else p = b;\n  p[1] = v;\n  return p[0];\n}\n'), ["5 the pointer 'p' (to one of a, b): written through it: not supported yet (only read)"]);
  assert.deepEqual(errs('int g(int *q) { return *q; }\nint f(int a[4], int b[4], int s) {\n  int *p = a;\n  if (s) p = b;\n  return g(p);\n}\n'), ["5 the pointer 'p': passed on to a function with several targets: not supported yet"]);   // (one target, moved: &a[p_off], #2751)
  assert.deepEqual(errs('int f(int a[4], int b[4], int s) {\n  int *p = a;\n  if (s) p = b;\n  return p == a;\n}\n'), ["4 the pointer 'p': in a difference or a comparison with several targets: not supported yet"]);
  assert.deepEqual(errs('int f(int a[4], int b[4]) {\n  int *p = a;\n  return (p == b) + (p != 0);\n}\n'), ["3 the pointer 'p': subtracted or compared other than with a place in 'a' (a, a + i, &a[i], a pointer into it): not supported yet", "3 the pointer 'p': subtracted or compared other than with a place in 'a' (a, a + i, &a[i], a pointer into it): not supported yet"]);
  assert.deepEqual(errs('int f(int a[4]) {\n  int *p = a;\n  return p * 2;\n}\n'), ["3 the pointer 'p': used other than *p, p[i], p = …, p += …, p++, p - q, p < q, passed on: not supported yet"]);
  assert.deepEqual(errs('int f(short a[4]) {\n  int *p = (int *)a;\n  return *p;\n}\n'), ["2 the pointer 'p': set to 'a', of another type (a cast of a pointer): not supported (Vitis HLS: a cast of a pointer between native integer types, to a narrower one)"]);
  assert.deepEqual(errs('int f(int v) {\n  int x = v;\n  int *p = &x;\n  return p[1];\n}\n'), ["4 the pointer 'p' to a variable: only *p (p[0])"]);
  assert.deepEqual(errs('int f(int v) {\n  int *p;\n  return v;\n}\n'), ["2 the pointer 'p' is never set"]);
});

// #2655: the test bench's pointers into arrays, as cc's: a + k, k + a, &a[k] (one past the end too), p++, p += n, p - q,
// comparisons, passed to functions and to strlen, strcat, memcpy, %s; into a row (m[1] + 2), into an array of strings.
const OFFSETS = `#include <stdio.h>
#include <string.h>
static int sum(const int *p, int n) { int s = 0; for (int i = 0; i < n; i++) s += p[i]; return s; }
static void fill(int *p, int n, int v) { while (n--) *p++ = v; }
int top(int x) { return x + 1; }
static int len(const char *s) { const char *t = s; while (*t) t++; return t - s; }
int main(void) {
  int a[6] = { 1, 2, 3, 4, 5, 6 };
  int *p = a + 1, *q = 2 + a, *e = &a[6];
  printf("%d %d %d %d\\n", *p, *q, p[2], *(e - 1));
  p++; p += 2; p -= 1; --p; ++p;
  printf("%d %ld %ld %d\\n", *p, (long)(p - a), (long)(e - p), (int)(q - p));
  printf("%d %d %d %d %d\\n", p < e, p > q, p == a + 3, p != q, p >= a);
  *p = 40; p[1] = 50; *(p - 1) = 30;
  printf("%d %d\\n", sum(a + 2, 3), sum(&a[1], 5));
  fill(a + 4, 2, 9);
  for (int *r = a; r < a + 6; r++) printf("%d ", *r);
  printf("\\n");
  int m[2][3] = { { 1, 2, 3 }, { 4, 5, 6 } };
  int *w = m[1] + 2;
  printf("%d %d %d\\n", *w, w[-1], sum(m[0] + 1, 4));
  char b[] = "hello";
  printf("%d %d %s %d\\n", (int)strlen(b + 1), len(b + 2), b + 3, (int)strlen(&"world"[1]));
  char c[12] = "ab";
  strcat(c + 1, "xy");
  printf("%s\\n", c);
  const char *names[] = { "zero", "one", "two" };
  const char **n = names + 1;
  printf("%s %s\\n", *n, n[1]);
  int x = 3, *px = &x;
  printf("%d %d\\n", px == &x, px != NULL);
  int v = 0;
  memcpy(&v, a + 3, sizeof v);
  printf("%d\\n", v);
  return top(0) + *(a + 5) + (int)(e - a);
}
`;

test('#2655 an array plus an offset as a pointer in the C simulation: as cc\'s, no warnings', { skip: noCC }, () => {
  const sim = simulateC(OFFSETS, { file: 'off.c', top: 'top' });
  assert.deepEqual([sim.error, sim.diagnostics], [null, []]);
  const ref = compiledRun(OFFSETS);
  assert.equal(sim.output, ref.output);
  assert.equal(sim.exitCode, ref.exitCode);
  assert.equal(sim.output.split('\n')[0], '2 3 4 6');
  assert.equal(sim.exitCode, 16);
});

test('#2655 a pointer outside its array, or one of pointers into different arrays: the C simulation stops there', () => {
  const run = (body) => {
    const src = `int top(int x) { return x; }\nint main(void) {\n  int a[4] = { 1, 2, 3, 4 }, b[2] = { 5, 6 };\n  int m[2][2] = { { 1, 2 }, { 3, 4 } };\n${body}\n}\n`;
    const r = simulateC(src, { file: 'e.c', top: 'top' });
    assert.deepEqual(r.diagnostics, []);
    return r.error && `${r.error.line}:${r.error.col} ${r.error.message}`;
  };
  assert.equal(run('  int *p = a + 5;\n  return *p;'), '5:14 the pointer moves outside its array (to the element 5 of 0 to 3)');
  assert.equal(run('  int *p = a + 4;\n  return *p;'), '6:10 the pointer points outside its array (to the element 4 of 0 to 3)');
  assert.equal(run('  int *p = &a[4];\n  *p = 1;\n  return 0;'), '6:3 the pointer points outside its array (to the element 4 of 0 to 3)');
  assert.equal(run('  int *p = &a[5];\n  return 0;'), '5:12 the pointer moves outside its array (to the element 5 of 0 to 3)');
  assert.equal(run('  int *p = a + 3;\n  return p[1];'), '6:11 the index 1 is outside the array the pointer points into');
  assert.equal(run('  int *p = a;\n  p--;\n  return 0;'), '6:4 the pointer moves outside its array (to the element -1 of 0 to 3)');
  assert.equal(run('  int *p = a;\n  for (int i = 0; i < 6; i++) p++;\n  return 0;'), '6:32 the pointer moves outside its array (to the element 5 of 0 to 3)');
  assert.equal(run('  return (int)(a - b);'), '5:18 the difference of pointers into different arrays is undefined in C');
  assert.equal(run('  return a < b;'), "5:12 pointers into different arrays compared ('<' is undefined in C)");
  assert.equal(run('  int *p = a;\n  return p * 2;'), "6:12 the operator '*' of a pointer");
  assert.equal(run('  return *(m + 1)[0];'), '5:14 a pointer to a row of an array of arrays (m + i) cannot be simulated: give the row, m[i] + j');
  assert.equal(run('  int x = 1, *p = &x;\n  return *(p + 1);'), '6:10 a pointer to one value: only [0]');
  assert.equal(run('  int *p = a + 4, *q = &a[4];\n  return (p == q) + (p == a) * 2 + (p != 0) * 4 - 5;'), null);
});

// #2751: in synthesis, pointers into arrays as the C simulation takes them (#2655): p - a, p < q, p == e of pointers
// into one array (their offsets), g(a + k) and a moved pointer passed on (&a[p_off]: the callee's indexes from k, in
// a combinational module a multiplexer of the elements when k is not a constant), into a row (m[1] + 2: m[k / C][k % C]).
const SYNTHESIZED = {
  // (combinational: its loops unrolled, the offsets of p and q not constants)
  unrolled: [`#include <stdio.h>
static int pair(const int *q) { return q[0] + q[1] * 10; }
static void put(int *q, int v) { q[0] = v; q[1] = v + 1; }
int places(int k) {
  int a[6] = { 1, 2, 3, 4, 5, 6 };
  int m[2][3] = { { 1, 2, 3 }, { 4, 5, 6 } };
  int *p = a + 1, *e = &a[6], *w = m[1] + 2, *q = &m[0][1];
  p += k & 3;
  q += k & 1;
  int s = (int)(p - a) * 1000 + (int)(e - p) * 100 + (p < e) * 10 + (p == a + 2);
  s += *w * 7 + q[1] * 3 + (int)(w - q);
  s += pair(a + 2) + pair(2 + a) * 2 + pair(&a[3]) * 3 + pair(p) * 5;
  put(a + 4, k);
  s += a[4] + a[5];
  int t = 0;
  for (int *r = a; r < a + 6; r++) t += *r;
  return s + t;
}

int main(void) {
  int s = 0;
  for (int k = 0; k < 5; k++) { int r = places(k); printf("%d\\n", r); s += r; }
  return s & 0x7f;
}
`, []],
  // (combinational, constant offsets: *q of a + 3, written through q)
  combinational: [`#include <stdio.h>
static int first(const int *q) { return *q; }
static int pair(const int *q) { return q[0] + q[1] * 10; }
static void put(int *q, int v) { *q = v; q[1] = v + 1; }
int comb(int k) {
  int a[4] = { 1, 2, 3, 4 };
  put(a + 1, k);
  return first(a + 3) + pair(2 + a) * 2 + first(&a[1]) * 100 + a[0] * 1000;
}

int main(void) {
  int s = 0;
  for (int k = -2; k < 3; k++) { int r = comb(k); printf("%d\\n", r); s += r; }
  return s & 0x7f;
}
`, []],
  // (sequential: a loop of n iterations; the calls inlined, their indexes from the offset)
  sequential: [`#include <stdio.h>
static int pair(const int *q) { return q[0] + q[1] * 10; }
static void put(int *q, int v) { *q = v; q[1] = v + 1; }
int walk(int n, int k) {
  int a[8] = { 1, 2, 3, 4, 5, 6, 7, 8 };
  int m[2][4] = { { 1, 2, 3, 4 }, { 5, 6, 7, 8 } };
  int *p = a, *e = a + 8, *w = m[1] + 1;
  int s = 0;
  for (int i = 0; i < n; i++) {
    s += *p + (int)(p - a) * 100;
    p++;
    if (p == e) p = a;
  }
  put(a + (k & 3), n);
  w += k & 1;
  s += pair(p) + pair(a + 2) * 3 + *w * 7 + (int)(w - m[0]) * 1000 + (p < a + 4) * 10000;
  return s;
}

int main(void) {
  int s = 0;
  for (int n = 0; n < 11; n += 3) for (int k = 0; k < 4; k++) { int r = walk(n, k); printf("%d ", r); s += r; }
  printf("\\n");
  return s & 0x7f;
}
`, ['9 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)']],
  // (#2655's: a + 1, 2 + a, &a[3] moved; a memory argument)
  offsets: [`#include <stdio.h>
int offsets(int a[6], int k) {
  int *p = a + 1, *q = 2 + a, *r = &a[3];
  r++;
  r += 1;
  return *p + q[k & 1] * 10 + *r * 100;
}

int main(void) {
  int a[6] = { 1, 2, 3, 4, 5, 6 }, s = 0;
  for (int k = 0; k < 2; k++) s += offsets(a + 0, k);
  int *w = a + 2;
  *w = 7;
  s += offsets(a, 1);
  printf("%d\\n", s);
  return s != 1916;
}
`, []],
  // (a memory argument: a moved pointer passed on, compared; g(a + i) in a loop)
  memory: [`#include <stdio.h>
static int g(int *q) { return *q; }
static int h(int *q) { return q[0] - q[1]; }
int mem(int a[4], int k) {
  int *p = a;
  p++;
  p += k;
  int s = 0;
  for (int i = 0; i < k; i++) s += h(a + i);
  return g(p) + (int)(p - a) * 10 + (p == a + 2) * 100 + s * 1000;
}

int main(void) {
  int a[4] = { 3, 5, 7, 9 }, s = 0;
  for (int k = 0; k < 3; k++) { int r = mem(a, k); printf("%d\\n", r); s += r; }
  return s & 0x7f;
}
`, ['9 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)'], ['9 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)', "9 warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=2 made (the memory 'a' has one port, accessed 2 times an iteration); #pragma HLS PIPELINE off in it turns that off"]],
};

for (const [name, [src, warnings, synthesis = warnings]] of Object.entries(SYNTHESIZED)) {
  test(`#2751 pointers into arrays synthesized (${name}): the C simulation as cc's, co-simulated in VHDL and Verilog, its warnings`, () => {
    const sim = simulateC(src, { file: 'p.c' });
    assert.equal(sim.error, null);
    assert.deepEqual(sim.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), warnings);
    if (!noCC) {
      const ref = compiledRun(src);
      assert.deepEqual([sim.output, sim.exitCode], [ref.output, ref.exitCode]);
    }
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(src, { file: 'p.c', lang });
      assert.deepEqual(r.errors, []);
      assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
      assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), synthesis);
    }
  });
}

test('#2751 what is still refused, said: a pointer with several targets subtracted or compared, a place in an array given to a sub-module', () => {
  const said = (src) => cToHdl(src, { file: 'e.c' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(said('int f(int a[4], int b[4], int s) {\n  int *p = a;\n  if (s) p = b;\n  return (int)(p - a);\n}\n'), ["4 the pointer 'p': in a difference or a comparison with several targets: not supported yet"]);
  const SUB = 'int g(int q[4]) {\n#pragma HLS INLINE off\n  int s = 0;\n  for (int i = 0; i < 4; i++) s += q[i];\n  return s;\n}\nint f(int a[8], int n) {\n  int s = 0;\n  for (int i = 0; i < n; i++) s += g(A);\n  return s;\n}\n';
  assert.deepEqual(said(SUB.replace('A', 'a + 2')), ["9 the argument of 'q' in the call of the sub-module 'g': an array (its name), not a place in one: not supported yet"]);
  assert.deepEqual(said(SUB.replace('A', 'a')), []);
});
