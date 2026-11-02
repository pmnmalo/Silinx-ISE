// Silinx HLS (#2185, core/c-designated.js): an array of arrays' initializer by C's rules, its rows given in part (the
// rest of a row zero, not the next row's values), its inner braces left out or mixed, strings in an array of chars, in a
// struct, an array of structs, a typedef's row, static, const and global. The C simulation as the host's cc (and its
// output written here, for a machine with none), the generated HDL's memories co-simulated in VHDL and Verilog against
// cc, their warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cDesignated } from '../core/c-designated.js';
import { lex } from '../core/c-lex.js';
import { noCC, compiledRun, against, COMB } from './c-helpers.js';

const said = (ds) => ds.map((d) => `${d.line} ${d.severity}: ${d.message}`);

const ROWS = `#include <stdio.h>
struct M { int a[2][3]; int b; };
struct P { int a[3]; int b; };
typedef int row_t[3];
static const int ROM[3][4] = { { 1, 2 }, { 3 }, { 4, 5, 6, 7 } };
int g[2][3] = { { 9 }, 8, 7, 6 };
int f(int v) { int m[2][3] = { { 1, 2 }, { v, 0, 7 } }; return m[1][0]; }
int all(int v) {
  int e[2][3] = { 1, 2, 3, v };
  static int s[3][2] = { { 1 }, { 5 }, { 6, 7 } };
  char c[3][4] = { "ab", { 'x' }, "xyz" };
  unsigned char z[2][5] = { "hi", { "abcd" } };
  int d[2][2][2] = { { { 1 }, { 2, 3 } }, { 4 } };
  int u[][3] = { { v }, 2, 3, 4, { 5 } };
  struct M m = { { { 1 }, { 2, v } }, 9 };
  struct P p[2] = { { { 1 }, 2 }, { { 3, 4 }, 5 } };
  row_t r2[2] = { { v }, { 4, 5 } };
  int r = 0;
  for (int i = 0; i < 2; i++) for (int j = 0; j < 3; j++) r = r * 3 + e[i][j] + g[i][j] * 7 + m.a[i][j] * 5 + r2[i][j] * 11;
  for (int i = 0; i < 3; i++) for (int j = 0; j < 2; j++) r = r * 3 + s[i][j];
  for (int i = 0; i < 3; i++) for (int j = 0; j < 4; j++) r = r * 3 + c[i][j] + ROM[i][j];
  for (int i = 0; i < 2; i++) for (int j = 0; j < 5; j++) r = r * 3 + z[i][j];
  for (int i = 0; i < 8; i++) r = r * 3 + d[i >> 2][(i >> 1) & 1][i & 1];
  for (int i = 0; i < 9; i++) r = r * 3 + u[i / 3][i % 3];
  for (int i = 0; i < 2; i++) { for (int j = 0; j < 3; j++) r = r * 3 + p[i].a[j]; r += p[i].b; }
  int w[][3] = { 1, 2, 3, v };
  return r + m.b + (int)(sizeof u / sizeof(int)) + (int)(sizeof w / sizeof(int)) * 100 + w[1][0] * 1000 + w[1][2];
}
int main(void) {
  for (int v = 0; v < 3; v++) printf("%d %d\\n", f(v + 4), all(v + 4));
  return 0;
}
`;
const ROWS_OUT = '4 -1382209703\n5 471099501\n6 -1970558591\n';

test('#2185 the C simulation of a row given in part: the rest of it zero, as cc\'s', () => {
  const sim = simulateC(ROWS, { file: 'rows.c' });
  assert.deepEqual([sim.error, sim.exitCode, said(sim.diagnostics)], [null, 0, []]);
  assert.equal(sim.output, ROWS_OUT);
});

test('#2185 the expected output is the host\'s cc', { skip: noCC }, () => {
  assert.equal(compiledRun(ROWS).output, ROWS_OUT);
});

const AP = `#include <stdio.h>
#include "ap_int.h"
using byte_t = ap_uint<8>;
typedef ap_int<12> s12;
int top(int v) { s12 t[2][2] = { { (s12)v } }; return t[0][0] + t[0][1] + t[1][0]; }
int main() {
  ap_uint<8> u[2][2] = { { 3, 0 }, { 4, 5 } };
  byte_t b[2][2] = { { 6 }, 7, 8 };
  s12 s[2][3] = { { -5 }, { 6 } };
  for (int i = 0; i < 4; i++) printf("%d %d ", (int)u[i / 2][i % 2], (int)b[i / 2][i % 2]);
  for (int i = 0; i < 6; i++) printf("%d ", (int)s[i / 3][i % 3]);
  printf("%d\\n", top(3));
  return 0;
}
`;

test('#2185 C++: arrays of ap_uint, ap_int, a using\'s and a typedef\'s name, their rows given in part', () => {
  // (g++ with AMD's headers gives the same for the values given; an ap_int left out is not initialized there, zero
  // here as in Vitis HLS)
  const sim = simulateC(AP, { file: 'ap.cpp' });
  assert.deepEqual([sim.error, sim.exitCode, said(sim.diagnostics)], [null, 0, []]);
  assert.equal(sim.output, '3 6 0 0 4 7 5 8 -5 0 0 6 0 0 3\n');
});

const HW = `static const short ROM[4][3] = { { 1, -2 }, { 3 }, { }, { 7, 8, 9 } };
int top(int v, int k) {
  int m[3][4] = { { 1, 2 }, { v, 0, 7 }, 5, 6 };
  m[(k >> 2) & 1][k & 3] += v;
  return m[(k >> 4) & 1][(k >> 2) & 3] * 7 + ROM[k & 3][(k >> 6) & 1] + m[2][1] * 3 + m[1][0];
}
`;

test('#2185 a ROM and a RAM of two dimensions, their rows given in part: co-simulated in VHDL and Verilog against cc', { skip: noCC }, () => {
  against(HW, 'top', { ins: [{ name: 'v', w: 32, s: true }, { name: 'k', w: 32, s: true }], ret: { w: 32, s: true }, n: 40 });
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(said(cToHdl(HW, { file: 'top.c', lang, clock: COMB }).diagnostics), [], lang);
});

test('#2185 the rows written in full, each one\'s missing values zero; a list of values alone left as it is', () => {
  const text = (src) => cDesignated(lex(src).tokens, () => {}).map((t) => (t.t === 'str' ? JSON.stringify(t.v) : t.v)).filter((v) => v !== undefined).join(' ').trim();
  assert.equal(text('int a[2][3] = { { 1 }, { 2, 3 } };'), 'int a [ 2 ] [ 3 ] = { { 1 , 0 , 0 } , { 2 , 3 , 0 } } ;');
  assert.equal(text('char c[2][3] = { "a", { "bc" } };'), 'char c [ 2 ] [ 3 ] = { { 97 , 0 , 0 } , { 98 , 99 , 0 } } ;');
  assert.equal(text('int a[2][3] = { 1, 2, 3, 4 };'), 'int a [ 2 ] [ 3 ] = { 1 , 2 , 3 , 4 } ;');
  // (a type not known here, its value maybe a list of its own: as it is)
  assert.equal(text('std::complex<float> a[2][1] = { { { 1, 2 } }, { { 3 } } };'), 'std :: complex < float > a [ 2 ] [ 1 ] = { { { 1 , 2 } } , { { 3 } } } ;');
});

test('#2185 a string longer than its row, said', () => {
  const sim = simulateC('int main(void) { char c[2][2] = { "abc", "d" }; return c[1][0]; }\n', { file: 'e.c' });
  assert.deepEqual(said(sim.diagnostics), ['1 error: \'c\': the string "abc" is longer than its 2 characters']);
});
