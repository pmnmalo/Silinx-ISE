// Silinx HLS, #pragma HLS ARRAY_STENCIL (#2503): core/c-stencil.js, and the pipeline's registers written in a later stage
// than they are read (core/c-pipe-sched.js). Each case co-simulated in VHDL and Verilog (a pass: the C's results), its
// loops in the report (line, count, II), its memories, its exact warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { simulateC } from '../core/c-interp.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
function run(src) {
  const out = ['vhdl', 'verilog'].map((lang) => {
    const r = cosimulate(src, { file: 't.c', lang, top: 'f' });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang}: ${JSON.stringify(r.mismatches.slice(0, 3), big)}`);
    return r;
  });
  assert.deepEqual(out[0].latency, out[1].latency);
  const r = out[0];
  return { cycles: r.latency.max, loops: r.gen.report.loops.filter((l) => !l.unroll).map((l) => [l.line, l.trip, l.ii]), mems: r.gen.report.memories.filter((m) => m.kind === 'RAM').map((m) => `${m.name} ${m.words}x${m.bits}`), messages: r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`) };
}
const ST = '#pragma HLS PIPELINE II=1\n#pragma HLS ARRAY_STENCIL variable=a';

// a row's three taps (stencil_1d's), the outputs fewer than a row
const row = (body = '      b[i][j] = a[i][j] + a[i][j + 1] * 2 + a[i][j + 2] * 3;', prag = ST, lo = '0') => `int f(int a[4][8], int b[4][6]) {
  for (int i = ${lo}; i < 4; i++) {
    for (int j = 0; j < 6; j++) {
${prag}
${body}
    }
  }
  return 0;
}
int main(void) {
  int a[4][8], b[4][6];
  for (int i = 0; i < 4; i++) for (int j = 0; j < 8; j++) a[i][j] = i * 10 - j * 3;
  f(a, b);
  for (int i = 0; i < 4; i++) for (int j = 0; j < 6; j++) printf("%d ", b[i][j]);
  return 0;
}
`;

// a 3x3 filter over an image of 5 rows of 80 (filter2d's): its taps out of the image 0, its coefficients a local array
const filter = (W = 80) => `#include <stdio.h>
void f(const unsigned char c[9], const unsigned char a[5][${W}], unsigned char b[5][${W}]) {
  char k[3][3];
  for (int i = 0; i < 3; i++)
    for (int j = 0; j < 3; j++)
      k[i][j] = c[i * 3 + j] - 4;
  for (int y = 0; y < 5; y++) {
    for (int x = 0; x < ${W}; x++) {
${ST}
      int sum = 0;
      for (int r = 0; r < 3; r++) {
        for (int q = 0; q < 3; q++) {
          unsigned char p;
          int xo = x + q - 1;
          int yo = y + r - 1;
          if (xo < 0 || xo >= ${W} || yo < 0 || yo >= 5) p = 0;
          else p = a[yo][xo];
          sum += p * k[r][q];
        }
      }
      b[y][x] = sum < 0 ? 0 : sum > 255 ? 255 : sum;
    }
  }
}
int main(void) {
  unsigned char c[9] = {1, 4, 2, 7, 9, 3, 5, 0, 6}, a[5][${W}], b[5][${W}];
  for (int y = 0; y < 5; y++) for (int x = 0; x < ${W}; x++) a[y][x] = (y * 37 + x * 11) % 251;
  f(c, a, b);
  for (int y = 0; y < 5; y++) for (int x = 0; x < ${W}; x++) printf("%d ", b[y][x]);
  return 0;
}
`;

test('#2503 ARRAY_STENCIL of a row\'s taps: one loop over the array\'s elements, II=1, the outputs the C\'s', () => {
  // (the regression: without it, II=3, its memory read 3 times an iteration)
  assert.deepEqual(run(row(undefined, '#pragma HLS PIPELINE II=1')), { cycles: 95, loops: [[2, 4, 4], [3, 6, 3]], mems: [], messages: ['3 warning: #pragma HLS PIPELINE II=1: II=3 made (the memory \'a\' has one port, accessed 3 times an iteration)'] });
  assert.deepEqual(run(row()), { cycles: 36, loops: [[3, 32, 1]], mems: [], messages: [] });
});

test('#2503 ARRAY_STENCIL of a 3x3 window with its edges: line buffers (a memory each), the coefficients registers', () => {
  const r = run(filter());
  assert.deepEqual(r, { cycles: 514, loops: [[4, 3, 4], [5, 3, 1], [8, 481, 1]], mems: ['ap_st_a_lb0 80x8', 'ap_st_a_lb1 80x8'], messages: [] });
  // (a row of 64 or fewer: its line buffers registers)
  assert.deepEqual(run(filter(16)).mems, []);
});

test('#2503 ARRAY_STENCIL taps above and to the left only, and through variables', () => {
  const back = row(`      int u = i - 1, v = j + 2;
      b[i][j] = a[u][j] - a[i][v] + a[u][v];`, ST, '1');
  const r = run(back);
  assert.deepEqual([r.loops, r.messages], [[[3, 32, 1]], []]);
});

test('#2503 ARRAY_STENCIL not made: why said, its reads one at a time', () => {
  const why = (src) => cToHdl(src, { file: 't.c', top: 'f' }).diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`).filter((m) => /STENCIL/.test(m));
  const not = (line, w) => [`${line} warning: #pragma HLS ARRAY_STENCIL variable=a: not made (${w}): its reads one at a time`];
  assert.deepEqual(why(row('      b[i][j] = a[j][i] + a[i][j + 1];')), not(5, "a read of 'a' is not at [i + i][j + j], i and j constants or its inner loops' counters"));
  assert.deepEqual(why(row('      b[i][j] = a[i][j]; a[i][j] = 0;')), not(5, "its body writes 'a'"));
  assert.deepEqual(why(row(undefined, ST, '4')), not(5, 'its loops do not count up by one between constants'));
  assert.deepEqual(why(row(undefined, '#pragma HLS ARRAY_STENCIL variable=a')), not(4, 'its loop is not pipelined'));
  assert.deepEqual(why(row('      if (j > 2) break;\n      b[i][j] = a[i][j];')), not(5, "a 'break' is in its body"));
  assert.deepEqual(why(row('      b[i][j] = a[i][j] + b[i][0];')), not(5, "its body reads the argument 'b'"));
  assert.deepEqual(why(row('      b[i][j] = a[i][j];\n      for (int r = 0; r < 2; r++) b[i][r] = 0;')), not(5, 'its body writes a memory or a variable not its own inside a statement of more'));
  // (not in a loop over the rows)
  assert.deepEqual(why(`int f(int a[4][8], int b[8]) {
  for (int j = 0; j < 8; j++) {
${ST}
    b[j] = a[0][j];
  }
  return 0;
}`), ['4 warning: #pragma HLS ARRAY_STENCIL variable=a: not made (it applies to a pipelined loop in a loop over the array\'s rows, alone in it): its reads one at a time']);
});

test('#2503 ARRAY_STENCIL in the C simulation: no warning, the C as written', () => {
  const r = simulateC(row(), { file: 't.c' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.diagnostics.filter((d) => d.severity !== 'info'), []);
});

test('#2503 a pipeline\'s shift register from a memory: each register read where the one before writes it, II=1', () => {
  // (the regression: before, the copy read its source in the first stage, written in the second: II=2, 34 cycles,
  // "#pragma HLS PIPELINE II=1: II=2 made (a dependence: the next iteration reads 's1' before this one has written it)")
  const src = `int f(int a[16], int b[16]) {
  int s0 = 0, s1 = 0;
  for (int i = 0; i < 16; i++) {
#pragma HLS PIPELINE II=1
    s0 = s1;
    s1 = a[i];
    b[i] = s0 * 3 + s1;
  }
  return s0;
}
int main(void) {
  int a[16], b[16];
  for (int i = 0; i < 16; i++) a[i] = i * i - 7;
  printf("%d ", f(a, b));
  for (int i = 0; i < 16; i++) printf("%d ", b[i]);
  return 0;
}
`;
  assert.deepEqual(run(src), { cycles: 20, loops: [[3, 16, 1]], mems: [], messages: [] });
});
