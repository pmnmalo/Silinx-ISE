// Silinx HLS (#1786, core/c-flatten.js): arrays of two or more dimensions, as Vitis HLS makes them by default: one memory
// of N*M*… words (an argument one ap_memory), a[i][j] at i*M + j, a nested initializer its words in order; in the C
// simulation an argument keeps its dimensions. The C simulation as cc's; the co-simulation in VHDL and Verilog; a row
// alone, said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { noCC, compiledRun } from './c-helpers.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const SRC = `#include <stdio.h>
#define R 3
#define C 5
int stencil(int a[R][C], short b[R][C - 2], int k) {
  static const char w[2][3] = {{1, 2, 1}, {-1, 0, 1}};
  int t[2][2][2] = {{{1, 2}, {3, 4}}, {{5, 6}, {7, 8}}};
  int s = 0;
  for (int i = 0; i < R; i++)
    for (int j = 0; j < C - 2; j++) {
      b[i][j] = a[i][j] * w[k & 1][0] + a[i][j + 1] * w[k & 1][1] + a[i][j + 2] * w[k & 1][2];
      s += b[i][j];
    }
  a[R - 1][C - 1] = s;
  return s + t[k & 1][1][k & 1];
}
int main(void) {
  int a[R][C];
  short b[R][C - 2];
  for (int i = 0; i < R; i++) for (int j = 0; j < C; j++) a[i][j] = i * 10 + j - 7;
  for (int k = 0; k < 3; k++) {
    int r = stencil(a, b, k);
    printf("%d:", r);
    for (int i = 0; i < R; i++) for (int j = 0; j < C - 2; j++) printf(" %d", b[i][j]);
    printf(" | %d\\n", a[R - 1][C - 1]);
  }
  return 0;
}
`;

test('#1786 arrays of two and three dimensions (arguments, a static constant, a local, nested initializers): the C simulation as cc\'s', { skip: noCC }, () => {
  const sim = simulateC(SRC, { file: 'st.c' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  assert.equal(sim.output, compiledRun(SRC).output);
});

test('#1786 arrays of more dimensions co-simulated in VHDL and Verilog: each argument one ap_memory of N*M words (row-major)', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC, { file: 'st.c', lang });
    // (the inner loop pipelined automatically, #1919: a, b one port each)
    assert.deepEqual([r.errors, r.pass, r.calls, r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`)], [[], true, 3,
      ['9 warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=3 made (the memory \'a\' has one port, accessed 3 times an iteration); #pragma HLS PIPELINE off in it turns that off']], JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.memories.map((m) => `${m.name} ${m.n}x${m.w}`), ['a 15x32', 'b 9x16']);
    assert.deepEqual(r.gen.ports.filter((p) => /_address0$/.test(p.name)).map((p) => `${p.name}:${p.w}`), ['a_address0:4', 'b_address0:4']);
  }
});

test('#1786 a row of an array of two dimensions alone: said', () => {
  const errs = (src) => cToHdl(src, { file: 'e.c' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(errs('static int sum(int r[4]) { return r[0] + r[3]; }\nint f(int a[2][4], int i) {\n  return sum(a[i]);\n}\n'),
    ["3 'a': an array of 2 dimensions indexed by 1 (a row of it alone is not supported yet)"]);
});

test('#1820 the test bench\'s main() passing a row of an array of two dimensions to the top: synthesized and co-simulated', () => {
  const src = '#define N 8\nvoid sort(int a[N]) {\n  for (int i = 0; i < N; i++)\n    for (int j = 0; j < N - 1 - i; j++)\n      if (a[j] > a[j + 1]) { int t = a[j]; a[j] = a[j + 1]; a[j + 1] = t; }\n}\n'
    + 'int main(void) {\n  int t[3][N] = {{5, -2, 9, 0, 7, 7, -8, 1}, {8, 7, 6, 5, 4, 3, 2, 1}, {1, 2, 3, 4, 5, 6, 7, 8}};\n  for (int k = 0; k < 3; k++) sort(t[k]);\n  return 0;\n}\n';
  const r = cToHdl(src, { file: 's.c' });
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
  const W = ['4 warning the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)',
    '4 warning this loop is pipelined automatically, as Vitis HLS does (II=1): II=9 made (it accesses a memory in a branch, an access a state); #pragma HLS PIPELINE off in it turns that off'];
  const said = (ds) => ds.map((d) => `${d.line} ${d.severity} ${d.message}`);
  assert.deepEqual(said(r.diagnostics), W);
  for (const lang of ['vhdl', 'verilog']) {
    const c = cosimulate(src, { file: 's.c', lang });
    assert.deepEqual([c.errors, c.pass, c.calls, said(c.gen.diagnostics)], [[], true, 3, W], JSON.stringify(c.mismatches, big));
  }
});
