// Silinx HLS (#1706, core/c-dataflow-nest.js): a region of a region, its processes the caller's; a region called among
// other statements a sub-module, its tasks' state kept across calls; a stream's write with x++; the report's process
// latency and region interval. Co-simulated in VHDL and Verilog, warnings asserted, ports as Vitis HLS 2025.2's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { comparePorts } from '../scripts/hls-vitis.mjs';

const VITIS = JSON.parse(fs.readFileSync(new URL('./hls-corpus/vitis.json', import.meta.url), 'utf8')).designs;
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const msgs = (g) => g.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);

// (the form of the corpus's unique_task_regions, its own test bench)
const SRC = `#include "hls_task.h"
void copy(hls::stream<int> &in, hls::stream<int> &out) {
  for (int i = 0; i < 8; i++) out.write(in.read());
}
void func(hls::stream<int> &in, hls::stream<int> &out) {
  int cnt = 0;
  while (1) {
#pragma HLS pipeline off
    int t = in.read();
    out.write(t + cnt++);
  }
}
template <typename>
void mid(hls::stream<int> &in1, hls::stream<int> &out1, hls::stream<int> &in2, hls::stream<int> &out2) {
#pragma HLS dataflow
  hls_thread_local hls::stream<int> in1_t, out1_t, in2_t, out2_t;
  hls_thread_local hls::task t1(func, in1_t, out1_t);
  hls_thread_local hls::task t2(func, in2_t, out2_t);
  copy(in1, in1_t);
  copy(in2, in2_t);
  copy(out1_t, out1);
  copy(out2_t, out2);
}
void middle(hls::stream<int> &in1, hls::stream<int> &out1, hls::stream<int> &in2, hls::stream<int> &out2,
            hls::stream<int> &in3, hls::stream<int> &out3, hls::stream<int> &in4, hls::stream<int> &out4) {
#pragma HLS dataflow
  mid<class c1>(in1, out1, in2, out2);
  mid<class c2>(in3, out3, in4, out4);
}
void top(hls::stream<int> &in1, hls::stream<int> &out1, hls::stream<int> &in2, hls::stream<int> &out2,
         hls::stream<int> &in3, hls::stream<int> &out3, hls::stream<int> &in4, hls::stream<int> &out4) {
  middle(in1, out1, in2, out2, in3, out3, in4, out4);
  middle(in1, out1, in2, out2, in3, out3, in4, out4);
}
int main() {
  hls::stream<int> i1, o1, i2, o2, i3, o3, i4, o4;
  for (int k = 0; k < 16; k++) { i1.write(k); i2.write(k + 100); i3.write(k + 200); i4.write(k + 300); }
  top(i1, o1, i2, o2, i3, o3, i4, o4);
  int bad = 0;
  // (each task's count goes on through the second call: a value and its index twice)
  for (int k = 0; k < 16; k++) { if (o1.read() != 2 * k) bad++; if (o2.read() != 2 * k + 100) bad++; if (o3.read() != 2 * k + 200) bad++; if (o4.read() != 2 * k + 300) bad++; }
  return bad;
}
`;

test('#1706 a region of regions called twice: its tasks and FIFOs inside a module of its own, the tasks\' state kept; co-simulated in VHDL and Verilog; Vitis HLS\'s ports', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC, { file: 't.cpp', top: 'top', lang, maxCycles: 100000 });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(msgs(r.gen), ['7 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)']);
    assert.deepEqual(comparePorts(r.gen.ports, VITIS['task-level-parallelism-data-driven-unique-task-regions'].vitis.ports), { same: true, missing: [], extra: [], differ: [] }, lang);
  }
});

test('#1706 the region itself: its processes spliced, named apart; the report\'s process latencies, the region\'s latency and interval', () => {
  const g = cToHdl(SRC, { file: 't.cpp', top: 'middle' });
  assert.equal(g.ok, true);
  assert.deepEqual(msgs(g), ['7 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)']);
  const rep = g.report;
  assert.deepEqual(rep.processes.filter((p) => p.task).map((p) => p.task), ['t1', 't2', 't1', 't2']);
  assert.equal(rep.processes.filter((p) => p.name === 'copy').length, 8);
  assert.deepEqual(rep.fifos.map((f) => f.name).slice(0, 2), ['mid_class_c1_0_in1_t', 'mid_class_c1_0_out1_t']);
  const copy = rep.processes.find((p) => p.name === 'copy').latency;
  assert.ok(copy.max > 0, JSON.stringify(copy));
  assert.deepEqual(rep.interval, { min: copy.min, max: copy.max });
  assert.deepEqual(rep.latency, { min: copy.min, max: copy.max });   // (no buffers: none waits for another)
});

test('#1706 a process after another through a buffer: the region\'s latency their sum, its interval the longest', () => {
  const src = `#define N 4
static void a(int x[N], int y[N]) { for (int i = 0; i < N; i++) y[i] = x[i] + 1; }
static void b(int y[N], int z[N]) { for (int i = 0; i < N; i++) z[i] = y[i] * 2; }
void t(int x[N], int z[N]) {
#pragma HLS DATAFLOW
  int y[N];
  a(x, y);
  b(y, z);
}
`;
  const { report: rep } = cToHdl(src, { file: 't.cpp' });
  const [pa, pb] = rep.processes.map((p) => p.latency);
  assert.equal(rep.latency.max, pa.max + pb.max);
  assert.equal(rep.interval.max, Math.max(pa.max, pb.max));
});

test('#1706 a stream\'s write with x++: the value before the change; in a conditional operand still refused', () => {
  const src = (arg) => `#include "hls_stream.h"
void w(hls::stream<int> &s) {
  int n = 5;
  for (int i = 0; i < 2; i++) s.write(${arg});
}
int main() {
  hls::stream<int> s;
  w(s);
  return s.read() != 15 || s.read() != 16;
}
`;
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src('10 + n++'), { file: 'w.cpp', top: 'w', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
  }
  assert.ok(msgs(cToHdl(src('i ? n++ : 15'), { file: 'w.cpp', top: 'w' })).some((m) => /a write of the stream 's' with another side effect/.test(m)));
});
