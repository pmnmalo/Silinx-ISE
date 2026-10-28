// Silinx HLS C++ (#1898, core/cpp-task-array.js): an array of hls::task's, each element started as t[k](f, a…); or in
// an unrolled loop of constant bounds, and hls::split / hls::merge of N a named constant (core/cpp-np-channel.js), as
// Vitis HLS's mixed control and data driven example declares them. The C simulation; the co-simulation in VHDL and
// Verilog; what is not supported said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const say = (ds) => ds.map((d) => `${d.line} ${d.severity}: ${d.message}`);

// (the example's shape: a split of NP outputs, NP tasks of one worker, a merge of NP inputs, its N and NP constants)
const SRC = (start) => `#include "hls_np_channel.h"
#include "hls_task.h"
#include <stdio.h>
const int N = 12;
const int NP = 3;
void worker(hls::stream<int>& in, hls::stream<int>& out) { int v = in.read(); out.write(v * 5 - 2); }
void read_in(int *in, int n, hls::stream<int>& out) { for (int i = 0; i < n; i++) out.write(in[i]); }
void write_out(hls::stream<int>& in, int *out, int n) { for (int i = 0; i < n; i++) out[i] = in.read(); }
void dut(int in[N], int out[N], int n) {
  hls_thread_local hls::split::round_robin<int, NP> sp;
  hls_thread_local hls::merge::round_robin<int, NP> mg;
#pragma HLS dataflow
  read_in(in, n, sp.in);
  hls_thread_local hls::task t[NP];
${start}
  write_out(mg.out, out, n);
}
int main() {
  int a[N], b[N];
  for (int i = 0; i < N; i++) a[i] = i * i - 7;
  dut(a, b, N);
  for (int i = 0; i < N; i++) printf("%d ", b[i]);
  printf("\\n");
  return 0;
}
`;
const LOOP = `  for (int i = 0; i < NP; i++) {
#pragma HLS unroll
    t[i](worker, sp.out[i], mg.in[i]);
  }`;
// (a[i] = i * i - 7, each * 5 - 2: the values back in their order, through the tasks in turn)
const OUT = '-37 -32 -17 8 43 88 143 208 283 368 463 568 \n';
// (read_in's and write_out's loops of n: no bound, said)
const TRIP = (line) => `${line} warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)`;
// (the C simulation's: those, and its DATAFLOW a sequence of calls)
const DF = (line) => `${line} warning: #pragma HLS DATAFLOW is accepted and ignored: Silinx does not make it`;
const CSIM = [TRIP(7), TRIP(8), DF(12)];

test('#1898 Vitis HLS\'s mixed control and data driven example: hls::split / hls::merge round_robin of NP a named constant, an array of NP tasks started in an unrolled loop; co-simulated in VHDL and Verilog', () => {
  const c = simulateC(SRC(LOOP), { file: 'd.cpp' });
  assert.deepEqual([c.error, c.output, say(c.diagnostics)], [null, OUT, CSIM]);
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC(LOOP), { file: 'd.cpp', lang });
    assert.deepEqual([r.errors, r.pass, r.output], [[], true, OUT], JSON.stringify(r.mismatches, big));
    assert.deepEqual(say(r.gen.diagnostics), [TRIP(7), TRIP(8)]);
    assert.deepEqual(r.gen.report.processes.map((p) => `${p.instance}${p.task ? ` (task ${p.task})` : ''}`),
      ['ap_split_sp_U0 (task sp)', 'ap_merge_mg_U1 (task mg)', 'read_in_U2', 'worker_U3 (task t_0)', 'worker_U4 (task t_1)', 'worker_U5 (task t_2)', 'write_out_U6']);
    assert.deepEqual(r.gen.report.fifos.map((f) => `${f.name}:${f.depth}`), ['sp_in:2', 'sp_out_0:2', 'sp_out_1:2', 'sp_out_2:2', 'mg_in_0:2', 'mg_in_1:2', 'mg_in_2:2', 'mg_out:2']);
  }
});

test('#1898 an array of tasks: started one by one, in a loop of i <= b, ++i, no braces; the same output', () => {
  for (const start of [
    '  t[0](worker, sp.out[0], mg.in[0]);\n  t[1](worker, sp.out[1], mg.in[1]);\n  t[NP - 1](worker, sp.out[2], mg.in[2]);',
    '  for (int i = 0; i <= NP - 1; ++i) t[i](worker, sp.out[i], mg.in[i]);',
    '  for (int i = 1; i < NP; i++) t[i](worker, sp.out[i], mg.in[i]);\n  t[0](worker, sp.out[0], mg.in[0]);',
  ]) {
    const c = simulateC(SRC(start), { file: 'd.cpp' });
    assert.deepEqual([c.error, c.output, say(c.diagnostics)], [null, OUT, CSIM], start);
  }
  const r = cosimulate(SRC('  for (int i = 0; i <= NP - 1; ++i) t[i](worker, sp.out[i], mg.in[i]);'), { file: 'd.cpp', lang: 'verilog' });
  assert.deepEqual([r.errors, r.pass, r.output], [[], true, OUT], JSON.stringify(r.mismatches, big));
});

test('#1898 an array of tasks: what is not supported said, once', () => {
  const errors = (src) => say(simulateC(src, { file: 'd.cpp' }).diagnostics.filter((d) => d.severity === 'error'));
  const FORM = "15 error: the array of tasks 't': each started as t[k](f, a…); or in a loop for (int i = 0; i < N; i++) t[i](f, a…);";
  assert.deepEqual(errors(SRC('').replace('hls::task t[NP];', 'hls::task t[n];')), ["14 error: the array of tasks 't': hls::task t[N]; (N a constant)"]);
  assert.deepEqual(errors(SRC('  t[3](worker, sp.out[0], mg.in[0]);')), ["15 error: 't[3]': outside the array of 3 tasks"]);
  assert.deepEqual(errors(SRC('  t[0](worker, sp.out[0], mg.in[0]);\n  t[0](worker, sp.out[1], mg.in[1]);')), ["16 error: 't[0]': started twice"]);
  // (a bound not a constant, a statement other than a start in its loop, a use other than a start)
  assert.deepEqual(errors(SRC('  for (int i = 0; i < n; i++) t[i](worker, sp.out[i], mg.in[i]);')), [FORM]);
  assert.deepEqual(errors(SRC('  for (int i = 0; i < NP; i++) { t[i](worker, sp.out[i], mg.in[i]); n++; }')), [FORM]);
  assert.deepEqual(errors(SRC('  t[0].stop();')), [FORM]);
});

test('#1898 hls::split and hls::merge: N a named constant, its expression; a variable said', () => {
  const src = (decl, n) => `#include "hls_np_channel.h"
#include <stdio.h>
${decl}
void pr(hls::stream<int>& o) { for (int i = 0; i < 4; i++) o.write(i); }
void id(hls::stream<int>& a, hls::stream<int>& b) { for (int i = 0; i < 2; i++) b.write(a.read() * 10); }
void ga(hls::stream<int>& a, hls::stream<int>& o) { for (int i = 0; i < 4; i++) o.write(a.read() + 1); }
void dut(hls::stream<int>& r) {
#pragma HLS dataflow
  hls::split::round_robin<int, ${n}> s;
  hls::merge::round_robin<int, ${n}> m;
  pr(s.in);
  id(s.out[0], m.in[0]);
  id(s.out[1], m.in[1]);
  ga(m.out, r);
}
int main() { hls::stream<int> r; dut(r); for (int i = 0; i < 4; i++) printf("%d ", r.read()); return 0; }
`;
  const ok = src('constexpr int K = 4;\nconst int NP = K / 2;', 'NP * 2 - K / 2');
  const c = simulateC(ok, { file: 'd.cpp' });
  assert.deepEqual([c.error, c.output, say(c.diagnostics)], [null, '1 11 21 31 ', [DF(9)]]);
  const r = cosimulate(ok, { file: 'd.cpp', lang: 'vhdl' });
  assert.deepEqual([r.errors, r.pass, say(r.gen.diagnostics)], [[], true, []], JSON.stringify(r.mismatches, big));
  assert.deepEqual(say(simulateC(src('int NP = 2;', 'NP'), { file: 'd.cpp' }).diagnostics).filter((d) => d.includes('round_robin')),
    ['9 error: hls::split::round_robin: hls::split::round_robin<T, N> name; (N a constant)', '10 error: hls::merge::round_robin: hls::merge::round_robin<T, N> name; (N a constant)']);
});
