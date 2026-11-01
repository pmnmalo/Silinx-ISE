// Silinx HLS (#1707, core/c-processes.js): #pragma HLS DATAFLOW, the top function's calls processes running at once,
// each its own module (a callee called twice, two instances of it); a local stream a FIFO (its depth hls::stream<T, D>'s
// or the STREAM pragma's, else 2), a local array a buffer its readers start once its writer is done; the top's arguments
// passed on; ap_ctrl_hs over them all. The C simulation as the C++ compiler's; the co-simulation in VHDL and Verilog,
// its ports, warnings and report; a stream that cannot hold what a call writes, said; what is not supported, said; a
// region of other statements, made sequential (said). hls::task (#1719): a process running by itself (its ap_start 1),
// the top not waiting for it; the co-simulation waits for the values its call reads and writes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { apIntHeaders, runWithApInt } from './ap-int-ref.js';

const AP = await apIntHeaders();
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
// (a stream for the reference: a queue; hls::stream<T, D> one too, as hls_stream.h)
const STREAM_H = `#include <queue>
namespace hls {
template <typename T, int D = 0> class stream;
template <typename T> class stream<T, 0> {
  std::queue<T> q;
 public:
  T read() { T v = q.front(); q.pop(); return v; }
  void write(const T &v) { q.push(v); }
  bool empty() { return q.empty(); }
};
template <typename T, int D> class stream : public stream<T, 0> {};
}
`;
const SRC = `#include <iostream>
#include "hls_stream.h"
#define N 8
typedef unsigned char data_t;
struct pair { short a; bool last; };
static void load(data_t *in, hls::stream<int> &out, int k) {
#pragma HLS INLINE off
  for (int i = 0; i < N; i++) out.write(in[i] * k);
}
static void twice(hls::stream<int> &in, hls::stream<pair> &a, data_t b[N]) {
  for (int i = 0; i < N; i++) { int v = in.read(); pair p = {(short)(v + 1), i == N - 1}; a.write(p); b[i] = v; }
}
static void add(data_t x[N], data_t y[N], int d) {
  for (int i = 0; i < N; i++) y[i] = x[N - 1 - i] + d;
}
static void join(hls::stream<pair> &a, data_t b[N], data_t *out) {
  for (int i = 0; i < N; i++) { pair p = a.read(); out[i] = p.a + b[i] + p.last; }
}
void top(data_t vecIn[N], data_t vecOut[N], int k) {
  hls::stream<int> s1;
  hls::stream<pair, 8> s2;
  data_t buf[N], b2[N], b3[N];
#pragma HLS dataflow
  load(vecIn, s1, k);
  twice(s1, s2, buf);
  add(buf, b2, 3);
  add(b2, b3, -1);
  join(s2, b3, vecOut);
}
int main() {
  data_t a[N], b[N];
  int s = 0;
  for (int c = 0; c < 3; c++) {
    for (int i = 0; i < N; i++) a[i] = i * 5 + c;
    top(a, b, c + 2);
    for (int i = 0; i < N; i++) { std::cout << (int)b[i] << " "; s += b[i]; }
    std::cout << std::endl;
  }
  return s == 0;
}
`;

test('#1707 DATAFLOW in the C simulation: the calls in order, as the C++ compiler', { skip: AP.why || false }, () => {
  const sim = simulateC(SRC, { file: 'top.cpp' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  assert.equal(sim.output, runWithApInt(SRC.replace('#include "hls_stream.h"', STREAM_H), AP.dir));
});

test('#1707 DATAFLOW co-simulated in VHDL and Verilog: a module per callee (add twice, two instances), FIFOs and buffers between them; its ports the top\'s arguments\'; no warning; the report', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC, { file: 'top.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics, []);
    assert.deepEqual(r.gen.ports.map((p) => `${p.name}:${p.w}`), ['ap_clk:1', 'ap_rst:1', 'ap_start:1', 'ap_done:1', 'ap_idle:1', 'ap_ready:1',
      'vecIn_address0:3', 'vecIn_ce0:1', 'vecIn_q0:8', 'vecIn_d0:8', 'vecIn_we0:1', 'vecIn_address1:3', 'vecIn_ce1:1', 'vecIn_d1:8', 'vecIn_q1:8', 'vecIn_we1:1',
      'vecOut_address0:3', 'vecOut_ce0:1', 'vecOut_we0:1', 'vecOut_d0:8', 'vecOut_q0:8', 'vecOut_address1:3', 'vecOut_ce1:1', 'vecOut_d1:8', 'vecOut_q1:8', 'vecOut_we1:1', 'k:32']);
    const rep = r.gen.report;
    assert.deepEqual(rep.processes.map((p) => `${p.instance} ${p.name} after ${p.after.join(',')}`), ['load_U0 load after ', 'twice_U1 twice after ', 'add_U2 add after twice', 'add_U3 add after add', 'join_r_U4 join after add']);
    assert.deepEqual(rep.fifos, [{ name: 's1', depth: 2 }, { name: 's2_a', depth: 8 }, { name: 's2_last', depth: 8 }]);
    const mods = [...r.gen.hdl.matchAll(lang === 'vhdl' ? /^entity (\w+) is/gm : /^module (\w+)/gm)].map((m) => m[1]);
    assert.deepEqual(mods, ['load', 'twice', 'add', 'join_r', 'top_ap_fifo0', 'top_ap_fifo1', 'top_ap_fifo2', 'top']);
    assert.ok(r.latency.max < 300, JSON.stringify(r.latency));   // (the processes at once: each about 40 cycles a call)
  }
});

test('#1707 a stream to a process that starts once its writer is done (through a buffer), too shallow to hold a call\'s: the co-simulation says the processes wait for each other', () => {
  const src = SRC.replace('hls::stream<pair, 8> s2;', 'hls::stream<pair, 4> s2;');
  assert.deepEqual(cToHdl(src, { file: 'top.cpp' }).report.waits, [{ stream: 's2_a', from: 'twice', to: 'join', depth: 4 }, { stream: 's2_last', from: 'twice', to: 'join', depth: 4 }]);
  const r = cosimulate(src, { file: 'top.cpp', lang: 'verilog', maxCycles: 2000 });
  assert.deepEqual(r.errors, ["a call did not end in 2000 cycles: DATAFLOW's processes may wait for each other: 'join' starts once 'twice' is done, and the stream 's2_a' from 'twice' to it holds 4 values; the stream 's2_last' from 'twice' to it holds 4 values (a call may write more)"]);
});

test('#1895 a stream\'s depth a named constant (hls::stream<T, DEPTH>, static constexpr int DEPTH): its value, not the default 2', () => {
  const src = SRC.replace('hls::stream<pair, 8> s2;', 'hls::stream<pair, S2_DEPTH> s2;').replace('#define N 8', '#define N 8\nstatic constexpr int S2_DEPTH = 2 * 4;');
  const r = cToHdl(src, { file: 'top.cpp' });
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(r.report.fifos, [{ name: 's1', depth: 2 }, { name: 's2_a', depth: 8 }, { name: 's2_last', depth: 8 }]);
});

test('#1707 DATAFLOW: what is not supported, said; a region of other statements made sequential (said); a local stream outside DATAFLOW refused', () => {
  const H = '#include "hls_stream.h"\nstatic void p(hls::stream<int> &o, int k) { o.write(k); }\nstatic void q(hls::stream<int> &i, int *r) { *r = i.read(); }\nstatic void c(hls::stream<int> &i, int a[2]) { a[0] = i.read(); }\n';
  const msgs = (src) => cToHdl(src, { file: 'e.cpp' }).diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
  assert.deepEqual(msgs(`${H}void t(int a[2], int b[2], int k) {\n  hls::stream<int> s;\n#pragma HLS DATAFLOW\n  p(s, k);\n  c(s, a);\n  c(s, b);\n}\n`),
    ["6 error: DATAFLOW: the stream 's': one process writes it and one reads it (1 write, 2 read)"]);
  assert.deepEqual(msgs(`${H}void t(int a[2], int k) {\n  hls::stream<int> s, u;\n#pragma HLS DATAFLOW\n  p(s, k);\n  p(u, k + 1);\n  c(s, a);\n  c(u, a);\n}\n`).filter((m) => / error: /.test(m)),
    ["5 error: DATAFLOW: the argument 'a' is used by 2 processes: one process each (not yet shared)", "9 error: DATAFLOW: the argument of 'k' of 'p': an argument of 't' or a constant (not an expression, yet)"]);
  assert.deepEqual(msgs(`${H}void t(int *r, int k) {\n  hls::stream<int> s;\n#pragma HLS DATAFLOW\n  p(s, k);\n  q(s, r);\n}\n`),
    []);   // (a pointer output of the top given back by its process, #1706, test/c-dataflow-loops.test.js)
  assert.deepEqual(msgs(`${H}void t(int a[2], int k) {\n  int b[2];\n#pragma HLS DATAFLOW\n  for (int i = 0; i < 2; i++) b[i] = k;\n  a[0] = b[1];\n}\n`),
    ['7 warning: #pragma HLS DATAFLOW: the region has its statements other than calls of functions and declarations of streams and arrays: made sequential (not as processes)']);
  assert.deepEqual(msgs(`${H}void t(int a[2], int k) {\n  hls::stream<int> s;\n  p(s, k);\n  c(s, a);\n}\n`),
    ["6 error: 's': a stream inside the module (a FIFO between its parts, DATAFLOW) is not supported yet: a stream is an argument (ap_fifo)"]);
});

test('#1707 DATAFLOW\'s module through the open synthesis (Yosys, Spartan-3E), from the VHDL and from the Verilog: no warning', async () => {
  const { compile, elaborate } = await import('../core/compile.js');
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  for (const lang of ['vhdl', 'verilog']) {
    const g = cToHdl(SRC, { file: 'top.cpp', lang });
    const design = elaborate(compile([{ path: `top.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: g.hdl }]), 'top');
    const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
    assert.deepEqual(r.warnings, [], lang);
    assert.ok(Object.keys(r.cells).length > 0, lang);
  }
});

const TASKS = `#include "hls_task.h"
#include <stdio.h>
void count(hls::stream<int>& in, hls::stream<int>& out) {
  int cnt = 100;
  while (1) {
    int t = in.read();
    int v = t + cnt;
    cnt++;
    out.write(v);
  }
}
void pairs(hls::stream<int>& in, hls::stream<int>& out) {
  int a = in.read();
  int b = in.read();
  out.write(a * 10 + b);
}
void top(hls::stream<int>& in, hls::stream<int>& out);
void top(hls::stream<int>& in, hls::stream<int>& out) {
  hls_thread_local hls::stream<int, 4> mid;
  hls_thread_local hls::task t1(pairs, in, mid);
  hls_thread_local hls::task t2(count, mid, out);
}
int main() {
  hls::stream<int> in, out;
  in.write(1); in.write(2); in.write(3);
  top(in, out);
  printf("%d |", out.read());
  in.write(4); in.write(5); in.write(6);
  top(in, out);
  while (!out.empty()) printf(" %d", out.read());
  printf("\\n");
  return 0;
}
`;

test('#1719 hls::task in hardware: each task a process running by itself (its ap_start 1, its state kept across calls), its streams FIFOs; the top data-driven, ap_clk and ap_rst only (#1900); co-simulated in VHDL and Verilog', () => {
  assert.equal(simulateC(TASKS, { file: 'tasks.cpp' }).output, '112 | 135 158\n');
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(TASKS, { file: 'tasks.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.message}`), ['5 the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)']);
    assert.deepEqual(r.gen.ports.map((p) => p.name), ['ap_clk', 'ap_rst', 'in_r_dout', 'in_r_empty_n', 'in_r_read', 'out_r_din', 'out_r_full_n', 'out_r_write']);
    assert.deepEqual([r.gen.report.tasks, r.gen.report.processes.map((p) => `${p.instance} ${p.task}`), r.gen.report.fifos], [true, ['pairs_U0 t1', 'count_U1 t2'], [{ name: 'mid', depth: 4 }]]);
    assert.match(r.gen.hdl, lang === 'vhdl' ? /pairs_U0_ap_start <= '1';/ : /assign pairs_U0_ap_start = 1'b1;/);
  }
});

test('#1898 DATAFLOW: a const integer of the region (its value where it is used, a call\'s argument), as Vitis HLS folds it; co-simulated in VHDL and Verilog, no warning', () => {
  const src = (decl) => `#include "hls_stream.h"
#include <stdio.h>
void sc(hls::stream<int>& a, hls::stream<int>& b, int k) { for (int i = 0; i < 4; i++) b.write(a.read() * k); }
void dut(hls::stream<int>& in, hls::stream<int>& r) {
${decl}
#pragma HLS dataflow
  hls::stream<int> t;
  sc(in, t, K);
  sc(t, r, K + 1);
}
int main() { hls::stream<int> a, r; for (int i = 0; i < 4; i++) a.write(i); dut(a, r); for (int i = 0; i < 4; i++) printf("%d ", r.read()); return 0; }
`;
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src('  const int K = 3;'), { file: 'd.cpp', lang });
    assert.deepEqual([r.errors, r.pass, r.output, r.gen.diagnostics], [[], true, '0 12 24 36 ', []], JSON.stringify(r.mismatches));
    assert.deepEqual(r.gen.report.processes.map((p) => p.instance), ['sc_U0', 'sc_U1']);
  }
  // (a variable never changed: the same, #1931; changed: not a constant, the region of streams said)
  const v = cosimulate(src('  int K = 3;'), { file: 'd.cpp', lang: 'verilog' });
  assert.deepEqual([v.errors, v.pass, v.output, v.gen.diagnostics], [[], true, '0 12 24 36 ', []]);
  assert.deepEqual(cToHdl(src('  int K = 3;\n  K++;'), { file: 'd.cpp' }).diagnostics.map((d) => `${d.severity}: ${d.message}`),
    ["error: #pragma HLS DATAFLOW: the region has 'K': only streams and arrays are declared in a DATAFLOW region: its streams are FIFOs between processes, so it cannot be made sequential"]);
});

test('#1942 DATAFLOW: a pointer argument of the top a process only reads (an ap_none input, as Vitis HLS makes it), its value the call\'s; co-simulated in VHDL and Verilog, no warning', () => {
  const src = `#include "hls_stream.h"
#include <stdio.h>
void scale(hls::stream<int>& a, hls::stream<int>& b, int *k) { for (int i = 0; i < 4; i++) b.write(a.read() * *k); }
void dut(hls::stream<int>& in, hls::stream<int>& r, int *k) {
#pragma HLS dataflow
  scale(in, r, k);
}
int main() { hls::stream<int> a, r; for (int c = 1; c <= 3; c++) { for (int i = 0; i < 4; i++) a.write(i); dut(a, r, &c); for (int i = 0; i < 4; i++) printf("%d ", r.read()); } return 0; }
`;
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'd.cpp', lang });
    assert.deepEqual([r.errors, r.pass, r.output, r.gen.diagnostics], [[], true, '0 1 2 3 0 2 4 6 0 3 6 9 ', []], JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.ports.filter((p) => p.name === 'k').map((p) => `${p.dir} ${p.w}`), ['in 32']);
  }
});
