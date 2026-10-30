// Silinx HLS, the loops pipelined automatically (#1919): core/c-pipeline.js with core/c-fsmd.js. Vitis HLS's default
// (UG1399): an innermost loop pipelined (II=1), or its parent with it unrolled when its count is the threshold
// (syn.compile.pipeline_loops, 64) or less; #pragma HLS PIPELINE off and the threshold 0 turn it off. A pipelined loop
// that accesses a memory: its head and step in its body's states, its first state's accesses in its last for the next
// iteration. Each case co-simulated in VHDL and Verilog (a pass: the C's results), its cycles a call, its report and
// its exact warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
/** Co-simulated in both languages: a pass; its cycles a call (max), its loops' report, its messages. */
function run(src, opts = {}) {
  const out = [];
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 't.c', lang, ...opts });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang}: ${JSON.stringify(r.mismatches, big)}`);
    out.push(r);
  }
  assert.deepEqual(out[0].latency, out[1].latency);
  const r = out[0];
  return {
    cycles: r.latency.max,
    loops: r.gen.report.loops.map(({ line, unroll, pipeline, auto, ii, cycles }) => ({ line, unroll, pipeline, ...(auto ? { auto } : {}), ii, cycles })),
    messages: r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`),
  };
}

const ACC = (prag) => `#include <stdio.h>
int acc(int x) {
  int s = 0;
  for (int i = 0; i < 16; i++) {
${prag}
    s += x * i;
  }
  static int calls = 0;
  calls++;
  return s + calls;
}
int main(void) { for (int k = -3; k < 4; k += 2) printf("%d ", acc(k)); return 0; }
`;

test('#1919 a loop with no pragma pipelined automatically (II=1, no warning); PIPELINE off and the threshold 0 leave it as it was', () => {
  const auto = run(ACC(''));
  assert.equal(auto.cycles, 19);
  assert.deepEqual(auto.loops, [{ line: 4, unroll: null, pipeline: 1, auto: true, ii: 1, cycles: 17 }]);
  assert.deepEqual(auto.messages, []);
  // (not pipelined: x * i and the sum do not fit 10 ns together, the body two states, #2080)
  const off = run(ACC('#pragma HLS PIPELINE off'));
  assert.equal(off.cycles, 67);
  assert.deepEqual(off.loops, [{ line: 4, unroll: null, pipeline: null, ii: 4, cycles: 65 }]);
  assert.deepEqual(off.messages, []);
  const none = run(ACC(''), { pipelineLoops: 0 });
  assert.equal(none.cycles, 67);
  assert.deepEqual(none.loops, off.loops);
  assert.deepEqual(none.messages, []);
});

const NEST = (prag = '') => `#include <stdio.h>
int dot(int x) {
  static int k = 0;
  int s = 0;
  for (int i = 0; i < 6; i++) {
${prag}
    for (int j = 0; j < 4; j++) s += (x + i) * j ^ k;
  }
  k++;
  return s;
}
int main(void) { for (int x = -2; x < 3; x++) printf("%d ", dot(x)); return 0; }
`;

test('#1919 the parent of an innermost loop of the threshold\'s count or fewer pipelined, the inner loop unrolled in its state; above it, the inner loop pipelined', () => {
  const parent = run(NEST());
  assert.equal(parent.cycles, 9);
  assert.deepEqual(parent.loops, [{ line: 5, unroll: null, pipeline: 1, auto: true, ii: 1, cycles: 7 }, { line: 7, unroll: 'whole', pipeline: null, ii: 0, cycles: 0 }]);
  assert.deepEqual(parent.messages, []);
  // (the threshold 3: the inner loop's 4 iterations more, the inner loop pipelined; the outer as it was)
  const inner = run(NEST(), { pipelineLoops: 3 });
  assert.deepEqual(inner.loops, [{ line: 5, unroll: null, pipeline: null, ii: 4, cycles: 25 }, { line: 7, unroll: null, pipeline: 1, auto: true, ii: 1, cycles: 5 }]);
  assert.equal(inner.cycles, 51);
  assert.deepEqual(inner.messages, []);
  // a loop's own PIPELINE unrolls its inner loops too (#1919: before, "a loop is in it")
  const pragma = run(NEST('#pragma HLS PIPELINE II=1'));
  assert.equal(pragma.cycles, 9);
  assert.deepEqual(pragma.loops, [{ line: 5, unroll: null, pipeline: 1, ii: 1, cycles: 7 }, { line: 7, unroll: 'whole', pipeline: null, ii: 0, cycles: 0 }]);
  assert.deepEqual(pragma.messages, []);
});

const MEM = (body, args = 'int a[8], int n', calls = 'f(t, 0); f(t, 3); f(t, 8);') => `#include <stdio.h>
int f(${args}) {
  int s = 0;
${body}
  return s;
}
int main(void) {
  int t[8] = {3, -1, 4, 1, -5, 9, 2, 6}, u[8] = {7, 0, -2, 5, 1, 1, -8, 4};
  ${calls}
  for (int k = 0; k < 8; k++) printf("%d ", t[k]);
  return 0;
}
`;
const AUTO = 'this loop is pipelined automatically, as Vitis HLS does (II=1)';
const OFF = '#pragma HLS PIPELINE off in it turns that off';

// (a loop of n iterations: its bound for the report)
const LOOP = (head, ...body) => `  ${head} {\n#pragma HLS LOOP_TRIPCOUNT max=8\n${body.map((x) => `    ${x}\n`).join('')}  }`;

test('#1919 a pipelined loop that reads a memory: its head and step in its states, its next read in its last state (II=1); n = 0 too', () => {
  const src = (prag) => MEM(LOOP('for (int i = 0; i < n; i++)', prag, 's += a[i];'), 'int a[8], int n', 'printf("%d %d %d\\n", f(t, 0), f(t, 3), f(t, 8));');
  const auto = run(src(''));
  assert.deepEqual(auto.loops, [{ line: 4, unroll: null, pipeline: 1, auto: true, ii: 1, cycles: 9 }]);
  assert.deepEqual(auto.messages, []);
  assert.equal(auto.cycles, 11);
  const off = run(src('#pragma HLS PIPELINE off'));
  assert.deepEqual(off.loops, [{ line: 4, unroll: null, pipeline: null, ii: 4, cycles: 33 }]);
  assert.equal(off.cycles, 35);
  assert.deepEqual(off.messages, []);
  const pragma = run(src('#pragma HLS PIPELINE II=1'));
  assert.deepEqual(pragma.loops, [{ line: 4, unroll: null, pipeline: 1, ii: 1, cycles: 9 }]);
  assert.equal(pragma.cycles, 11);
  assert.deepEqual(pragma.messages, []);
});

test('#1919 the II of 1 not met (a memory\'s one port, what the condition reads, two memories read): the II made, said with why; a break and a return in the loop', () => {
  // (a[i] read and written: its one port, so the next read waits for the write)
  const port = run(MEM(LOOP('for (int i = 0; i < n; i++)', 'a[i] = a[i] + i;'), 'int a[8], int n', 'f(t, 0); f(t, 8); f(t, 5);'));
  assert.deepEqual(port.loops, [{ line: 4, unroll: null, pipeline: 1, auto: true, ii: 2, cycles: 17 }]);
  assert.deepEqual(port.messages, [`4 warning: ${AUTO}: II=2 made (it accesses a memory, an access a state); ${OFF}`]);
  // (the first state writes what the condition reads: the condition tested after it, the next read not moved)
  const cond = run(MEM(`  int i = 0;\n${LOOP('while (i < n)', 'i += 2;', 's += a[i - 2];')}`, 'int a[8], int n', 'printf("%d %d %d\\n", f(t, 0), f(t, 3), f(t, 8));'));
  assert.deepEqual(cond.loops, [{ line: 5, unroll: null, pipeline: 1, auto: true, ii: 2, cycles: 17 }]);
  assert.deepEqual(cond.messages, [`5 warning: ${AUTO}: II=2 made (it accesses a memory, an access a state); ${OFF}`]);
  // (two memories read: a state each, the first's read in the last state)
  const two = run(MEM('  for (int i = 0; i < 8; i++) s += a[i] * b[i];', 'int a[8], int b[8]', 'printf("%d %d\\n", f(t, u), f(u, u));'));
  assert.deepEqual(two.loops, [{ line: 4, unroll: null, pipeline: 1, auto: true, ii: 2, cycles: 17 }]);
  assert.deepEqual(two.messages, [`4 warning: ${AUTO}: II=2 made (it accesses a memory, an access a state); ${OFF}`]);
  assert.equal(two.cycles, 19);
  // (a break, a return: out of the loop, the next iteration's read not done; an if reading a memory in its state)
  const brk = run(MEM(LOOP('for (int i = 0; i < n; i++)', 'if (a[i] < 0) break;', 's += a[i];'), 'int a[8], int n', 'printf("%d %d %d\\n", f(t, 0), f(t, 1), f(t, 8));'));
  assert.deepEqual(brk.loops, [{ line: 4, unroll: null, pipeline: 1, auto: true, ii: 2, cycles: 17 }]);
  assert.deepEqual(brk.messages, [`4 warning: ${AUTO}: II=2 made (it accesses a memory, an access a state); ${OFF}`]);
  // (an if: its reads before it, whatever its condition; its write made only if it runs it)
  const branch = run(MEM(LOOP('for (int i = 0; i < n; i++)', 'if (a[i] > 0) a[i] = s; else if (i & 1) s -= i;'), 'int a[8], int n', 'f(t, 0); f(t, 8); f(t, 5);'));
  assert.deepEqual(branch.loops, [{ line: 4, unroll: null, pipeline: 1, auto: true, ii: 2, cycles: 17 }]);
  assert.deepEqual(branch.messages, [`4 warning: ${AUTO}: II=2 made (it accesses a memory, an access a state); ${OFF}`]);
  const ret = run(MEM(LOOP('for (int i = 0; i < n; i++)', 'if (a[i] == 9) return i;'), 'int a[8], int n', 'printf("%d %d %d\\n", f(t, 0), f(t, 5), f(t, 8));'));
  assert.deepEqual(ret.loops, [{ line: 4, unroll: null, pipeline: 1, auto: true, ii: 1, cycles: 9 }]);
  assert.deepEqual(ret.messages, []);
});

test('#1919 what a pipelined loop cannot be made as yet: said, the loop made as before', () => {
  // (an if that reads in a branch what it assigns: its read cannot be made before it)
  const branch = run(MEM(LOOP('for (int i = 0; i < n; i++)', 'int k = i;', 'if (i & 1) { k = 7 - i; s += a[k]; }'), 'int a[8], int n', 'printf("%d %d\\n", f(t, 0), f(t, 8));'));
  assert.deepEqual(branch.messages, [`4 warning: ${AUTO}: II=5 made (it accesses a memory in a branch, an access a state); ${OFF}`]);
  const cont = run(MEM(LOOP('for (int i = 0; i < n; i++)', 'if (i == 2) continue;', 's += a[i];'), 'int a[8], int n', 'printf("%d %d\\n", f(t, 0), f(t, 8));'));
  assert.deepEqual(cont.messages, [`4 warning: ${AUTO}: II=4 made (a 'continue' or a 'goto' is in it); ${OFF}`]);
  const pragma = run(MEM(`  int i = 0;\n${LOOP('do', '#pragma HLS PIPELINE II=1', 's += a[i];', 'i++;')} while (i < n);`, 'int a[8], int n', 'printf("%d %d\\n", f(t, 1), f(t, 8));'));
  assert.deepEqual(pragma.messages, ['5 warning: #pragma HLS PIPELINE II=1: II=3 made (a do-while)']);
  // (an inner loop whose count is not a constant: the outer loop not pipelined, the inner one pipelined)
  const inner = run(MEM(`  for (int i = 0; i < 4; i++) {\n#pragma HLS PIPELINE\n${LOOP('for (int j = 0; j < n; j++)', 's += i ^ j;')}\n  }`, 'int n', 'printf("%d %d\\n", f(0), f(5));'));
  assert.deepEqual(inner.messages, ['4 warning: #pragma HLS PIPELINE II=1: II=4 made (a loop is in it whose count is not a constant: it cannot be unrolled)']);
  assert.deepEqual(inner.loops.map((l) => [l.line, l.pipeline, l.auto ?? false]), [[4, 1, false], [6, 1, true]]);
});

test('#1919 an inner loop unrolled in its pipelined parent\'s state: what it writes (registers, an array\'s, a pointer output) kept only when the iteration runs', () => {
  const r = run(`#include <stdio.h>
int f(int x, int *p) {
  int d[4] = {1, 2, 3, 4};
  for (int i = 0; i < x; i++) {
#pragma HLS LOOP_TRIPCOUNT max=8
    for (int j = 0; j < 4; j++) {
      d[j] += i * j;
      if (j == 2) *p = d[j] - i;
    }
  }
  return d[0] + d[1] + d[2] + d[3];
}
int main(void) { int v = 7; for (int x = 0; x < 6; x += 2) { int r = f(x, &v); printf("%d %d\\n", r, v); } return 0; }
`);
  assert.deepEqual(r.loops, [{ line: 4, unroll: null, pipeline: 1, auto: true, ii: 1, cycles: 9 }, { line: 6, unroll: 'whole', pipeline: null, ii: 0, cycles: 0 }]);
  assert.deepEqual(r.messages, []);
  assert.equal(r.cycles, 7);
});

test('#1919 which loop is pipelined: an inner loop\'s PIPELINE off keeps its parent as it is; an UNROLL with no factor is unrolled in its parent; an inner loop that accesses a memory is pipelined itself', () => {
  const loops = (body) => {
    const g = cToHdl(`int f(int a[8], int n) {\n  int s = 0;\n${body}\n  return s;\n}\n`);
    assert.deepEqual(g.diagnostics, []);   // (no warnings: every loop made at II=1, or not pipelined)
    return g.report.loops.map((l) => [l.line, l.unroll, l.pipeline, l.auto ?? false, l.ii]);
  };
  const nest = (inner, outer = '') => `  for (int i = 0; i < n; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=8\n${outer}    for (int j = 0; j < 4; j++) {\n${inner}      s += i ^ j;\n    }\n  }`;
  assert.deepEqual(loops(nest('#pragma HLS PIPELINE off\n')), [[3, null, null, false, 6], [5, null, null, false, 3]]);
  assert.deepEqual(loops(nest('#pragma HLS UNROLL\n')), [[3, null, 1, true, 1], [5, 'whole', null, false, 0]]);
  assert.deepEqual(loops(nest('      s += a[j];\n')), [[3, null, null, false, 5], [5, null, 1, true, 1]]);
});

test('#1919 a pipelined loop that accesses a memory with an inner loop (no access in it): the inner loop unrolled in its states', () => {
  const r = run(MEM(LOOP('for (int i = 0; i < n; i++)', 'int q = a[i];', 'for (int k = 0; k < 4; k++) q += (q >> k) ^ i;', 'a[i] = q;'), 'int a[8], int n', 'f(t, 0); f(t, 8); f(t, 3);'));
  assert.deepEqual(r.loops, [{ line: 4, unroll: null, pipeline: 1, auto: true, ii: 2, cycles: 17 }, { line: 7, unroll: 'whole', pipeline: null, ii: 0, cycles: 0 }]);
  assert.deepEqual(r.messages, [`4 warning: ${AUTO}: II=2 made (it accesses a memory, an access a state); ${OFF}`]);
});

const STREAM = (body, args = '') => `#include <stdio.h>
#include "hls_stream.h"
void f(hls::stream<int> &src, hls::stream<int> &dst, int n${args}) {
${body}
}
int main() {
  hls::stream<int> a, b;
  int t[8] = {3, -1, 4, 1, -5, 9, 2, 6};
  for (int k = 0; k < 20; k++) a.write(k * 7 - 20);
  f(a, b, 0${args ? ', t' : ''}); f(a, b, 5${args ? ', t' : ''}); f(a, b, 8${args ? ', t' : ''});
  while (!b.empty()) printf("%d ", b.read());
  return 0;
}
`;

test('#1919 a pipelined loop that reads and writes streams: its accesses in one state, which waits while a FIFO is empty or full and then writes nothing (the co-simulation\'s FIFOs empty and full now and then)', () => {
  const r = run(STREAM(LOOP('for (int i = 0; i < n; i++)', 'int v = src.read();', 'dst.write(v * 3 + i);')), { file: 't.cpp' });
  assert.deepEqual(r.loops, [{ line: 4, unroll: null, pipeline: 1, auto: true, ii: 1, cycles: 9 }]);
  assert.deepEqual(r.messages, []);
  // (a memory read with them: the next iteration's read in the state of this one's accesses)
  const m = run(STREAM(LOOP('for (int i = 0; i < n; i++)', 'int v = src.read() - a[i];', 'dst.write(v);', 'a[i] = v;'), ', int a[8]'), { file: 't.cpp' });
  assert.deepEqual(m.loops, [{ line: 4, unroll: null, pipeline: 1, auto: true, ii: 2, cycles: 17 }]);
  assert.deepEqual(m.messages, [`4 warning: ${AUTO}: II=2 made (it accesses a memory, an access a state); ${OFF}`]);
  // (a memory read to a stream written while the FIFO is full: the next read not made while it waits, the value read
  // kept; and a stream read to a memory)
  const out = run(STREAM(LOOP('for (int i = 0; i < n; i++)', 'int v = src.read();', 'dst.write(a[i] * 2 + v);'), ', int a[8]'), { file: 't.cpp' });
  assert.deepEqual(out.loops, [{ line: 4, unroll: null, pipeline: 1, auto: true, ii: 1, cycles: 9 }]);
  assert.deepEqual(out.messages, []);
  const into = run(STREAM(LOOP('for (int i = 0; i < n; i++)', 'a[i] = src.read() - i;', 'dst.write(i);'), ', int a[8]'), { file: 't.cpp' });
  assert.deepEqual(into.loops, [{ line: 4, unroll: null, pipeline: 1, auto: true, ii: 1, cycles: 9 }]);
  assert.deepEqual(into.messages, []);
  // (a loop until a stream is empty: its condition a state of its own, after the read)
  const poll = run(STREAM('  int k = 0;\n  while (!src.empty()) {\n    int v = src.read();\n    dst.write(v + k);\n    k++;\n  }'), { file: 't.cpp' });
  assert.deepEqual(poll.loops, [{ line: 5, unroll: null, pipeline: 1, auto: true, ii: 2, cycles: null }]);
  assert.deepEqual(poll.messages, [
    '5 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)',
    `5 warning: ${AUTO}: II=2 made (it reads or writes a stream, an access a state); ${OFF}`,
  ]);
});
