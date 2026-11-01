// Silinx HLS, #pragma HLS LOOP_FLATTEN and LOOP_MERGE (#1961): core/c-loop-merge.js. Each case co-simulated in VHDL and
// Verilog (a pass: the C's results, the variables as the C leaves them), its loops in the report, its exact warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosimulate } from '../core/c-cosim.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
function run(src) {
  const out = ['vhdl', 'verilog'].map((lang) => {
    const r = cosimulate(src, { file: 't.c', lang, top: 'f' });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang}: ${JSON.stringify(r.mismatches, big)}`);
    return r;
  });
  assert.deepEqual(out[0].latency, out[1].latency);
  const r = out[0];
  return { cycles: r.latency.max, loops: r.gen.report.loops.map((l) => [l.line, l.trip, l.ii]), messages: r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`) };
}
const tb = (sig, body, call) => `#include <stdio.h>
int f(${sig}) {
  int s = 0;
${body}
  return s;
}
int main(void) {
  int t[12] = {3, -1, 4, 1, -5, 9, 2, 6, 5, 3, 5, 8}, w[12] = {0};
  printf("%d ", ${call});
  for (int k = 0; k < 12; k++) printf("%d %d ", t[k], w[k]);
  return 0;
}
`;
const F = '#pragma HLS LOOP_FLATTEN', MG = '#pragma HLS LOOP_MERGE';
const AUTO = (line) => `${line} warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=2 made (the memory 'a' has one port, accessed 2 times an iteration); #pragma HLS PIPELINE off in it turns that off`;
const nest = (prag) => tb('int a[12]', `  for (int i = 0; i < 3; i++) {
    for (int j = 0; j < 4; j++) {
${prag}
      s += a[i * 4 + j] * j;
    }
  }`, 'f(t)');

test('#1961 LOOP_FLATTEN: two loops one, of the product of their counts, fewer cycles', () => {
  // (the regression: with no pragma, or off, two loops of the report)
  assert.deepEqual(run(nest('')), { cycles: 30, loops: [[4, 3, 4], [5, 4, 1]], messages: [] });
  assert.deepEqual(run(nest(`${F} off`)).loops, [[4, 3, 4], [5, 4, 1]]);
  assert.deepEqual(run(nest(F)), { cycles: 17, loops: [[4, 12, 1]], messages: [] });
});

test('#1961 LOOP_FLATTEN in three loops: one loop, the variables ending as in the C', () => {
  const r = run(tb('int a[12]', `  int i, j, k;
  for (i = 0; i < 2; i++) {
    for (j = 0; j < 2; j++) {
${F}
      for (k = 0; k < 3; k++) {
${F}
        s += a[i * 6 + j * 3 + k];
      }
    }
  }
  s += i * 100 + j * 10 + k;`, 'f(t)'));
  assert.deepEqual([r.loops, r.messages], [[[5, 12, 1]], []]);
});

test('#1961 LOOP_FLATTEN that cannot be made: its warning, its loops kept', () => {
  const body = (outer, inner) => tb('int a[12], int n', `  for (int i = 0; i < ${outer}; i++) {
#pragma HLS LOOP_TRIPCOUNT max=3
    s += 1;
    for (int j = 0; j < ${inner}; j++) {
${F}
#pragma HLS LOOP_TRIPCOUNT max=4
      s += a[i * 4 + j];
    }
  }`, 'f(t, 3)');
  assert.deepEqual(run(body(3, 4)).messages, ['7 warning: #pragma HLS LOOP_FLATTEN: this loop is not flattened: the loop around it holds other statements']);
  const perfect = tb('int a[12], int n', `  for (int i = 0; i < n; i++) {
#pragma HLS LOOP_TRIPCOUNT max=3
    for (int j = 0; j < 4; j++) {
${F}
      s += a[i * 4 + j];
    }
  }`, 'f(t, 3)');
  assert.deepEqual(run(perfect).messages, ['6 warning: #pragma HLS LOOP_FLATTEN: this loop is not flattened: the counts of both loops must be constants']);
  const jump = tb('int a[12]', `  for (int i = 0; i < 3; i++) {
    for (int j = 0; j < 4; j++) {
${F}
      if (a[j] == 9) break;
      s += a[i * 4 + j];
    }
  }`, 'f(t)');
  assert.deepEqual(run(jump).messages, ["5 warning: #pragma HLS LOOP_FLATTEN: this loop is not flattened: a 'break' is in it", AUTO(5)]);
  const alone = tb('int a[12]', `  for (int i = 0; i < 3; i++) {
${F}
    s += a[i];
  }`, 'f(t)');
  assert.deepEqual(run(alone).messages, ['4 warning: #pragma HLS LOOP_FLATTEN: no loop around this one: ignored']);
});

test('#1961 LOOP_MERGE: consecutive loops one, of the largest count, each body while its own lasts', () => {
  const two = (prag) => tb('int a[12], int b[12]', `${prag}
  for (int i = 0; i < 12; i++) { a[i] = a[i] + 1; }
  for (int i = 0; i < 8; i++) { b[i] = i; }`, 'f(t, w)');
  // (the regression: two loops)
  assert.deepEqual(run(two('')), { cycles: 35, loops: [[5, 12, 2], [6, 8, 1]], messages: [AUTO(5)] });
  assert.deepEqual(run(two(MG)), { cycles: 27, loops: [[5, 12, 2]], messages: [AUTO(5)] });
});

test('#1961 LOOP_MERGE of one bound that is no constant: one loop', () => {
  const r = run(tb('int a[12], int b[12], int n', `${MG}
  for (int i = 0; i < n; i++) {
#pragma HLS LOOP_TRIPCOUNT max=12
    a[i] = i;
  }
  for (int j = 0; j < n; j++) {
#pragma HLS LOOP_TRIPCOUNT max=12
    b[j] = j * 2;
  }`, 'f(t, w, 9)'));
  assert.deepEqual([r.loops, r.messages], [[[5, null, 1]], []]);
});

test('#1961 LOOP_MERGE: an array at each one\'s own variable merged; a value that crosses them not, unless force', () => {
  const same = (prag) => tb('int a[12], int b[12]', `${prag}
  for (int i = 0; i < 12; i++) { a[i] = i; }
  for (int i = 0; i < 12; i++) { b[i] = a[i]; }`, 'f(t, w)');
  assert.deepEqual(run(same(MG)).loops, [[5, 12, 2]]);
  const crossing = (prag) => tb('int a[12], int b[12]', `${prag}
  for (int i = 0; i < 12; i++) { s += a[i]; }
  for (int i = 0; i < 12; i++) { b[i] = s; }`, 'f(t, w)');
  const r = run(crossing(MG));
  assert.deepEqual(r.loops, [[5, 12, 1], [6, 12, 1]]);
  assert.deepEqual(r.messages, ["4 warning: #pragma HLS LOOP_MERGE: the loops at lines 5, 6 are not merged: 's' is used by more than one of them (force merges them all the same)"]);
  const reversed = (prag) => tb('int a[12], int b[12]', `${prag}
  for (int i = 0; i < 12; i++) { a[i] = i; }
  for (int i = 0; i < 12; i++) { b[i] = a[11 - i]; }`, 'f(t, w)');
  assert.match(run(reversed(MG)).messages[0], /^4 warning: #pragma HLS LOOP_MERGE: the loops at lines 5, 6 are not merged: 'a' is used/);
});

test('#1961 LOOP_MERGE with nothing to merge: its warning', () => {
  const one = tb('int a[12]', `${MG}
  for (int i = 0; i < 12; i++) { a[i] = i; }`, 'f(t)');
  assert.deepEqual(run(one).messages, ['4 warning: #pragma HLS LOOP_MERGE: only one loop in this body: ignored']);
  assert.deepEqual(run(tb('int a[12]', `${MG}\n  s = a[0];`, 'f(t)')).messages, ['4 warning: #pragma HLS LOOP_MERGE: no loops in this body: ignored']);
});
