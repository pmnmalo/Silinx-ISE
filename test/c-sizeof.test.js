// Silinx HLS (#2641, core/c-interp-expr.js, core/c-flatten.js, core/c-dataflow-expr.js): sizeof of an array, of a row
// of it (any of its sub-arrays), of an array parameter and of a pointer (a pointer's 8 bytes, int a[][8] one), of an
// array type, through typedefs and struct members; a C++ reference to an array its array's. The C simulation as the
// host's cc (and its output written here, for a machine with none), synthesis co-simulated in VHDL and Verilog against
// cc, its warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { noCC, compiledRun, against, COMB } from './c-helpers.js';

const said = (ds) => ds.map((d) => `${d.line} ${d.severity}: ${d.message}`);

const SIM = `#include <stdio.h>
typedef short row_t[5];
struct S { int m[3][5]; char c[4]; };
int rows(int a[][8]) { return (int)sizeof a * 1000 + (int)sizeof a[0] + (int)sizeof a[1][2] * 100; }
int sized(int a[4][8]) { return (int)sizeof a * 1000 + (int)sizeof *a; }
int one(char a[8]) { return (int)sizeof a * 1000 + (int)sizeof a[0]; }
int ptr(int *p) { return (int)sizeof p * 1000 + (int)sizeof *p + (int)sizeof p[1] * 10; }
int deep(long long d[][3][4]) { return (int)sizeof d * 10000 + (int)sizeof d[0] * 100 + (int)sizeof d[0][1]; }
int main(void) {
  int x[4][8];
  long long d[2][3][4];
  struct S s;
  row_t r[2];
  int w[][4] = { { 1 }, { 2, 3 }, { 4 } };
  char b[8];
  int *p = x[1];
  const char *t = "hello";
  printf("%d %d %d %d %d\\n", rows(x), sized(x), one(b), ptr(x[0]), deep(d));
  printf("%d %d %d %d %d %d\\n", (int)sizeof d, (int)sizeof d[1], (int)sizeof d[1][2], (int)sizeof d[1][2][3], (int)sizeof **d, (int)(sizeof d / sizeof d[0]));
  printf("%d %d %d %d %d %d\\n", (int)sizeof s.m, (int)sizeof s.c, (int)sizeof r, (int)sizeof r[0], (int)sizeof(row_t), (int)sizeof(row_t[3]));
  printf("%d %d %d %d %d %d %d\\n", (int)sizeof w, (int)sizeof w[2], (int)sizeof b, (int)sizeof p, (int)sizeof *p, (int)sizeof t, (int)sizeof(int[2][3]));
  printf("%d %d\\n", (int)sizeof(char *), (int)sizeof(short *[3]));
  return 0;
}
`;
const SIM_OUT = '8432 8032 8001 8044 89632\n192 96 32 8 32 2\n60 4 20 10 10 30\n48 16 8 8 4 8 24\n8 24\n';

test('#2641 the C simulation\'s sizeof of arrays, their rows, array parameters and pointers: cc\'s', () => {
  const sim = simulateC(SIM, { file: 'sz.c' });
  assert.deepEqual([sim.error, sim.exitCode, said(sim.diagnostics)], [null, 0, []]);
  assert.equal(sim.output, SIM_OUT);
});

test('#2641 the expected output is the host\'s cc', { skip: noCC }, () => {
  assert.equal(compiledRun(SIM).output, SIM_OUT);
});

const HW = `typedef short row_t[5];
static const int ROM[6][4] = { { 1 }, { 2, 3 } };
int rows(int a[3][4], int *p) { return a[2][1] + sizeof a * 1000 + sizeof a[1] + sizeof a[1][2] * 100 + sizeof p * 10 + sizeof *p; }
int top(int v, int k) {
  int u[3][4] = { { 1 }, { 2 }, { 3, v } };
  long long d[2][3][4];
  row_t r[2];
  short m[256];
  for (int i = 0; i < 256; i++) m[i] = i + v;
  int s = 0;
  for (int i = 0; i < 3; i++) s += i * (int)sizeof u[i] + u[i][i];
  return s + sizeof u * 3 + (int)(sizeof u / sizeof u[0]) * 23 + sizeof d[1] * 5 + sizeof d[1][2][3] * 7 + sizeof r
    + sizeof r[0] * 11 + sizeof m * 13 + sizeof m[k & 255] + sizeof(int[2][3]) + sizeof(row_t[3]) * 19 + sizeof ROM[1] * 17
    + sizeof(char *) + rows(u, &s) + m[k & 255];
}
`;

test('#2641 synthesis\'s sizeof of arrays, their rows, a memory, array parameters and pointers: co-simulated in VHDL and Verilog against cc', { skip: noCC }, () => {
  against(HW, 'top', { ins: [{ name: 'v', w: 32, s: true }, { name: 'k', w: 32, s: true }], ret: { w: 32, s: true }, n: 12 });
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(said(cToHdl(HW, { file: 'top.c', lang, clock: COMB }).diagnostics), [], lang);
});

/** The constant a combinational top returns (its Verilog), and its messages. */
function returned(src, file = 'top.c') {
  const g = cToHdl(src, { file, lang: 'verilog' });
  const r = g.hdl?.match(/assign ap_return = (\w+);/);
  const k = r && g.hdl.match(new RegExp(`assign ${r[1]} = 32'b([01]+);`));
  return [k ? parseInt(k[1], 2) : null, said(g.diagnostics)];
}

test('#2641 synthesis: an array type\'s sizeof all its elements, a pointer\'s 8 bytes (they were one element\'s, no message)', () => {
  assert.deepEqual(returned('int top(int v) { return sizeof(int[3][4]); }\n'), [48, []]);
  assert.deepEqual(returned('typedef char line_t[6];\nint top(int v) { return sizeof(line_t[2]) * 100 + sizeof(line_t); }\n'), [1206, []]);
  assert.deepEqual(returned('int f(int *p) { return sizeof p * 1000 + sizeof *p; }\nint top(int v) { return f(&v); }\n'), [8004, []]);
  assert.deepEqual(returned('int top(int v) { short a[6]; int w[] = { v, 2, 3 }; return sizeof a * 1000 + sizeof a[0] * 100 + sizeof w; }\n'), [12212, []]);
});

test('#2641 C++: a reference to an array, T (&a)[N], its sizeof the array\'s (g++\'s), a reference\'s its value\'s', () => {
  const src = `#include <cstdio>
int f(int (&a)[8], int &x) { return sizeof a * 100 + sizeof x; }
int top(int v) { int u[8] = { v }; int y = v; return f(u, y); }
int main() { printf("%d\\n", top(1)); return 0; }
`;
  const sim = simulateC(src, { file: 'ref.cpp' });
  assert.deepEqual([sim.error, sim.exitCode, sim.output, said(sim.diagnostics)], [null, 0, '3204\n', []]);
  assert.deepEqual(returned(src.replace(/int main[^\n]*\n/, ''), 'top.cpp'), [3204, []]);
});

test('#2641 errors: sizeof of an array of a size not constant in synthesis, of a name not declared; a row passed alone still said', () => {
  assert.deepEqual(returned('int top(int v) { return sizeof(int[v]); }\n'), [null, ['1 error: sizeof of an array whose size is not a constant']]);
  assert.deepEqual(returned('int top(int v) { return sizeof q; }\n'), [null, ["1 error: 'q' is not declared"]]);
  assert.deepEqual(returned('int f(int a[4]) { return a[0]; }\nint top(int v) { int u[3][4] = { { v } }; return f(u[1]) + sizeof u[1]; }\n'),
    [null, ["2 error: 'u': an array of 2 dimensions indexed by 1 (a row of it alone is not supported yet)"]]);
  // (the C simulation: a test bench's array of a size known when it runs, its sizeof then, as cc's)
  const sim = simulateC('int top(int v) { return v; }\nint main(void) { int n = 3; return sizeof(int[n]) + sizeof(char[n][2]); }\n', { file: 'n.c' });
  assert.deepEqual([sim.error, sim.exitCode, said(sim.diagnostics)], [null, 18, []]);
});
