// Silinx HLS (#1895, core/c-pointer-args.js, core/c-pointer.js): the pointer forms Vitis HLS takes beyond indexing. A
// pointer to a pointer of a function the top calls, resolved at compile time (**pp is the pointer it points to's
// target); a local pointer passed on to a function (its target passed); a pointer cast to a narrower native integer type
// (char *p = (char *)&a[i]: the bytes of a's elements, from their least significant, as on x86); a pointer argument
// moved by arithmetic (p += n), then indexed from its new base. The C simulation as cc's, the co-simulation in VHDL and
// Verilog with their exact warnings; what does not resolve so, said with the rule.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { noCC, compiledRun } from './c-helpers.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const LOOP = 'warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)';

const DOUBLE = `#include <stdio.h>
int sub(int ptr[10], int size, int **flagPtr) {
  int x = 0;
  for (int i = 0; i < size; ++i)
    if (**flagPtr & i) x += *(ptr + i);
  return x;
}
int top(int pos, int x, int *flag) {
  int array[10] = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10};
  int *ptrFlag;
  ptrFlag = flag;
  if (pos >= 0 & pos < 10) *(array + pos) = x;
  return sub(array, 10, &ptrFlag);
}
int main(void) {
  for (int i = 0; i < 10; i++) { int flag = i * 5 + 1; printf("%d\\n", top(i, -1 - i, &flag)); }
  return 0;
}
`;

const CAST = `#include <stdio.h>
#include <stdint.h>
int bytes(int index, int A[64]) {
  char *ptr;
  int result = 0;
  ptr = (char *)(&A[index]);
  for (int i = 0; i < 40; ++i) {
    result += *ptr * (i + 1);
    ptr += 1;
  }
  return result;
}
uint32_t halves(int k, uint32_t w[8]) {
  uint16_t *h = (uint16_t *)w;
  return h[k] + ((uint32_t)h[k + 3] << 16) + *(h + 1);
}
int top(int index, int k, int A[64], uint32_t w[8]) {
#pragma HLS INTERFACE ap_memory port=A depth=64
#pragma HLS INTERFACE ap_memory port=w depth=8
  return bytes(index, A) ^ halves(k, w);
}
int main(void) {
  int A[64];
  uint32_t w[8];
  for (int i = 0; i < 64; i++) A[i] = i * 0x01F3A5C7 - 77;
  for (int i = 0; i < 8; i++) w[i] = 0x9E3779B9u * (i + 1);
  for (int c = 0; c < 4; c++) printf("%d\\n", top(c * 13, c, A, w));
  return 0;
}
`;

const MOVED = `#include <stdio.h>
void copy(const int *src, int *dst, int n) {
#pragma HLS INTERFACE ap_memory port=src depth=32
#pragma HLS INTERFACE ap_memory port=dst depth=32
  for (int b = 0; b < 4; b++) {
    for (int i = 0; i < n; i++) dst[i] = src[i] * 3 + b;
    *dst += 100;
    dst += n;
    src = src + n;
    dst[0] = *(src - 1);
    dst++;
  }
}
int main(void) {
  int in[32], out[32];
  for (int i = 0; i < 32; i++) { in[i] = i * 7 - 50; out[i] = 0; }
  copy(in, out, 6);
  for (int i = 0; i < 32; i++) printf("%d ", out[i]);
  printf("\\n");
  return 0;
}
`;

test('#1895 a pointer to a pointer, a pointer cast to a narrower type, a pointer argument moved: the C simulation as cc\'s', { skip: noCC }, () => {
  for (const [name, src] of [['double', DOUBLE], ['cast', CAST], ['moved', MOVED]]) {
    const sim = simulateC(src, { file: `${name}.c` });
    assert.deepEqual([sim.error, sim.exitCode], [null, 0], name);
    assert.equal(sim.output, compiledRun(src).output, name);
  }
});

test('#1895 a pointer to a pointer resolved at compile time (sub\'s **flagPtr is top\'s *flag), co-simulated in VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(DOUBLE, { file: 'double.c', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), [`4 ${LOOP}`]);
    assert.deepEqual(r.gen.ports.filter((p) => !/^ap_/.test(p.name)).map((p) => `${p.name}:${p.w}`), ['pos:32', 'x:32', 'flag:32']);
  }
});

test('#1895 a pointer cast to char and to uint16_t (the bytes and halves of the array\'s elements), co-simulated in VHDL and Verilog: no warning', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(CAST, { file: 'cast.c', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics, []);
    assert.deepEqual(r.gen.ports.filter((p) => !/^ap_/.test(p.name)).map((p) => `${p.name}:${p.w}`), ['index:32', 'k:32', 'A_address0:6', 'A_ce0:1', 'A_q0:32', 'w_address0:3', 'w_ce0:1', 'w_q0:32']);
  }
});

test('#1895 a pointer argument moved (dst += n, src = src + n, dst++), indexed from its new base: co-simulated in VHDL and Verilog, the loop\'s warning', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(MOVED, { file: 'moved.c', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), [`6 ${LOOP}`]);
  }
});

test('#1895 what does not resolve at compile time, said with the rule', () => {
  const errs = (src) => cToHdl(src, { file: 'e.c' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  const PP = "a pointer to a pointer resolves at compile time (Vitis HLS): read through it only (**pp, (*pp)[i])";
  assert.deepEqual(errs('int g(int **pp) { *pp = 0; return 1; }\nint f(int *a) {\n  int *q = a;\n  return g(&q);\n}\n'), [`1 the parameter 'pp': *pp changed: not supported (${PP})`]);
  assert.deepEqual(errs('int g(int **pp) { return pp[1][0]; }\nint f(int *a) {\n  int *q = a;\n  return g(&q);\n}\n'), [`1 the parameter 'pp': used other than *pp: not supported (${PP})`]);
  assert.deepEqual(errs('int g(int **pp) { return **pp; }\nint f(int *a, int *b, int k) {\n  int *ps[2] = {a, b};\n  return g(&ps[k]);\n}\n'), [`4 the argument of 'pp': &p of a pointer p (${PP})`]);
  assert.deepEqual(errs('int f(int **pp) { return **pp; }\n'), ["1 the parameter 'pp': a pointer to a pointer is not possible here (Vitis HLS: a pointer to a pointer only resolved at compile time, a parameter of a function the top calls)",
    "1 '*' reads a pointer parameter (Silinx HLS: pointers only as arguments)"]);
  assert.deepEqual(errs('int g(int *q) { return q[1]; }\nint f(int *a, int n) {\n  a += n;\n  return g(a);\n}\n'), ["4 the pointer argument 'a' moves (a += n): passed on: not supported yet (Silinx HLS: a pointer argument moved by arithmetic, then indexed)"]);
  assert.deepEqual(errs('int f(int a[4]) {\n  char *p = (char *)a;\n  p[1] = 0;\n  return a[0];\n}\n'), ["3 the pointer 'p' (cast to a narrower type): written through it: not supported yet (only read)"]);
  assert.deepEqual(errs('int g(short *q) { return *q; }\nint f(int a[4]) {\n  short *p = (short *)a;\n  return g(p);\n}\n'), ["4 the pointer 'p': passed on to a function as another type: not supported yet"]);
  assert.deepEqual(errs('int g(char *q) { return q[1]; }\nint f(int a[4]) {\n  return g((char *)a);\n}\n'), ["3 a cast of a pointer is possible only as a pointer variable's value, to a narrower integer type (Vitis HLS: native types, char *p = (char *)&a[i])"]);
  assert.deepEqual(errs('int f(int a[4]) {\n  float *p = (float *)a;\n  return *p;\n}\n'), [
    "2 the pointer 'p': set to 'a', of another type (a cast of a pointer): not supported (Vitis HLS: a cast of a pointer between native integer types, to a narrower one)"]);
});
