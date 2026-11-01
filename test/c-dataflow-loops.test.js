// Silinx HLS (#1706, core/c-dataflow-loops.js): a loop among the calls of a DATAFLOW region of streams, a process of its
// own; a process's pointer output the top's port and ap_vld. Co-simulated in VHDL and Verilog, warnings asserted, ports
// as Vitis HLS 2025.2's on the corpus's form.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { comparePorts } from '../scripts/hls-vitis.mjs';

const VITIS = JSON.parse(fs.readFileSync(new URL('./hls-corpus/vitis.json', import.meta.url), 'utf8')).designs;
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const msgs = (g) => g.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);

const SRC = `#include "hls_stream.h"
#define N 4
static void pass(hls::stream<int> &i, hls::stream<int> &o) { for (int k = 0; k < N; k++) o.write(i.read()); }
static void sum(int b[N], hls::stream<int> &i, int *r) {
#pragma HLS PIPELINE
  int s = 0;
  for (int k = 0; k < N; k++) s += b[k] * i.read();
  *r = s;
}
void top(int a[N], hls::stream<int> &in, int k, int &out) {
#pragma HLS DATAFLOW
  int b[N];
  for (int j = 0; j < N; j++) b[j] = a[j] + k;
  hls::stream<int> c;
  pass(in, c);
  sum(b, c, &out);
}
int main() {
  int a[N] = {1, 2, 3, 4}, r = 0;
  hls::stream<int> in;
  for (int j = 0; j < N; j++) in.write(j + 1);
  top(a, in, 2, r);
  return r != 3 + 8 + 15 + 24;
}
`;

test('#1706 a loop among a region\'s calls a process, a pointer output the top\'s port with its ap_vld; co-simulated in VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC, { file: 'top.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.ok(!msgs(r.gen).some((m) => /inlined in the top/.test(m)), String(msgs(r.gen)));
    assert.deepEqual(r.gen.report.processes.map((p) => `${p.name} after ${p.after.join(',')}`), ['Loop_0_proc after ', 'pass after ', 'sum after Loop_0_proc']);
    const ns = r.gen.ports.map((p) => `${p.name}:${p.dir}:${p.w}`);
    for (const x of ['out_r:out:32', 'out_r_ap_vld:out:1', 'k:in:32', 'in_r_dout:in:32', 'a_q0:in:32', 'a_d1:out:32']) assert.ok(ns.includes(x), `${x} in ${ns}`);
  }
});

test('#1706 a region of no streams stays sequential, said; a scalar of the region a loop writes stays refused', () => {
  const none = 'void t(int a[2], int k) {\n  int b[2];\n#pragma HLS DATAFLOW\n  for (int i = 0; i < 2; i++) b[i] = k;\n  a[0] = b[1];\n}\n';
  assert.deepEqual(msgs(cToHdl(none, { file: 'e.cpp' })), ['3 warning: #pragma HLS DATAFLOW: the region has its statements other than calls of functions and declarations of streams and arrays: made sequential (not as processes)']);
  const scalar = '#include "hls_stream.h"\nstatic void p(hls::stream<int> &o, int v) { o.write(v); }\nstatic void q(hls::stream<int> &i, hls::stream<int> &o) { o.write(i.read()); }\nvoid t(hls::stream<int> &o) {\n#pragma HLS DATAFLOW\n  hls::stream<int> c;\n  int s = 0;\n  for (int i = 0; i < 2; i++) s += i;\n  p(c, s);\n  q(c, o);\n}\n';
  const g = cToHdl(scalar, { file: 'e.cpp' });
  assert.equal(g.ok, false);
  assert.ok(msgs(g).some((m) => /error: #pragma HLS DATAFLOW: the region has 's': only streams and arrays/.test(m)), String(msgs(g)));
});

test('#1706 A[] with INLINE off: inlined, said; the corpus\'s free-running form as Vitis HLS\'s ports', () => {
  const src = `#include "hls_stream.h"
typedef double data_t;
#define SZ 8
int accumulate(data_t A[]) {
#pragma HLS inline off
  data_t acc = 0.0;
  for (int i = 0; i < SZ; i++) acc += A[i];
  return acc;
}
void process(hls::stream<data_t> &s, hls::stream<data_t> &o) {
#pragma HLS inline off
  for (int i = 0; i < SZ; i++) o.write(s.read());
}
void inner(data_t A[SZ], hls::stream<data_t> &s, data_t *out) {
  data_t r[SZ];
  for (int i = 0; i < SZ; i++) r[i] = A[i] + s.read();
  *out = accumulate(r);
}
void free_pipe_mult(data_t A[SZ], hls::stream<data_t> &strm, data_t &out) {
#pragma HLS DATAFLOW
#pragma HLS INTERFACE ap_fifo port = strm
  data_t B[SZ];
  for (int i = 0; i < SZ; i++) B[i] = A[i] + i;
  hls::stream<data_t> o;
  process(strm, o);
  inner(B, o, &out);
}
int main() {
  data_t a[SZ], r = 0;
  hls::stream<data_t> s;
  for (int i = 0; i < SZ; i++) { a[i] = i; s.write(1.0); }
  free_pipe_mult(a, s, r);
  return r != 64.0;
}
`;
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'f.cpp', top: 'free_pipe_mult', lang, maxCycles: 100000 });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(msgs(r.gen), ["5 warning: #pragma HLS INLINE off: 'accumulate' is inlined: its array argument 'A' has no size (A[N])"]);
    assert.deepEqual(comparePorts(r.gen.ports, VITIS['pipelining-loops-using-free-running-pipeline'].vitis.ports), { same: true, missing: [], extra: [], differ: [] }, lang);
  }
});
