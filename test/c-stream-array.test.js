// Silinx HLS C++ (#1739, core/c-stream-array.js): arrays of hls::stream as Vitis HLS makes them, each element a stream of
// its own (its own ap_fifo port, a FIFO in a DATAFLOW region): s[k] that stream; s[e] by a variable index the statement
// for each element; an array passed whole its elements; its pragmas one per element, said once; a stream's name
// dropped. The C simulation as the C++ compiler's (a queue as hls_stream.h); the co-simulation in VHDL and Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { CXX } from './ap-int-ref.js';
import { lf } from './c-helpers.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
// (a stream for the reference: a queue, with its name and its depth, as hls_stream.h)
const STREAM_H = `#include <queue>
namespace hls {
template <typename T, int D = 0> class stream;
template <typename T> class stream<T, 0> {
  std::queue<T> q;
 public:
  stream() {}
  stream(const char *) {}
  T read() { T v = q.front(); q.pop(); return v; }
  void read(T &v) { v = read(); }
  void write(const T &v) { q.push(v); }
  bool empty() { return q.empty(); }
};
template <typename T, int D> class stream : public stream<T, 0> {};
}
`;
const SRC = `#include "hls_stream.h"
#include <iostream>
#define M 3
int dut(hls::stream<int> s_in[M], hls::stream<int> s_out[M]) {
#pragma HLS INTERFACE axis port = s_in
  int sum = 0;
  for (unsigned j = 0; j < M; j++) {
    for (unsigned i = 0; i < 4; i++) {
      int val = s_in[j].read();
      if (j == 2) s_out[j].write(val + 2 * j); else s_out[j].write(val - j);
      sum += val;
    }
  }
  s_out[0].write(sum);
  return sum;
}
int main() {
  hls::stream<int> s_in[M], s_out[M];
  hls::stream<int> named("x");
  for (unsigned j = 0; j < M; j++) for (unsigned i = 0; i < 4; i++) s_in[j].write(i * 10 + j);
  auto ret = dut(s_in, s_out);
  std::cout << "ret = " << ret << std::endl;
  for (unsigned j = 0; j < M; j++) {
    for (unsigned i = 0; i < 4; i++) if (s_out[j].read() != (j == 2 ? i * 10 + 3 * j : i * 10)) return 1;
  }
  std::cout << s_out[0].read() << std::endl;
  return 0;
}
`;

test('#1739 arrays of streams in the C simulation (variable and constant indices, passed whole, a stream\'s name): as the C++ compiler', { skip: CXX ? false : 'no C++ compiler' }, () => {
  const sim = simulateC(SRC, { file: 'dut.cpp' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-sarr-'));
  try {
    fs.writeFileSync(path.join(dir, 't.cpp'), SRC.replace('#include "hls_stream.h"', STREAM_H).replace(/^#pragma.*$/gm, ''));
    execFileSync(CXX, ['-std=c++11', '-w', '-o', path.join(dir, 't'), path.join(dir, 't.cpp')]);
    assert.equal(sim.output, lf(execFileSync(path.join(dir, 't'), { encoding: 'utf8' })));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('#1739 arrays of streams co-simulated in VHDL and Verilog: an ap_fifo per element; the array\'s pragma said once', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC, { file: 'dut.cpp', lang });
    assert.deepEqual([r.errors, r.pass], [[], true], JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.message}`), ['5 #pragma HLS INTERFACE axis port=s_in is not made yet: ignored (its default interface made)']);
    assert.deepEqual(r.gen.ports.filter((p) => /_dout$|_din$/.test(p.name)).map((p) => p.name), ['s_in_0_dout', 's_in_1_dout', 's_in_2_dout', 's_out_0_din', 's_out_1_din', 's_out_2_din']);
  }
});

test('#1739 an array of streams in a DATAFLOW region (AMD\'s free_running_kernel_remerge): a FIFO each element, (&s)[N] parameters, an element chosen by a variable', () => {
  const src = `#include "hls_stream.h"
using namespace hls;
template <int ID> void proc(stream<int, 4>& in, stream<int, 4>& out) {
  for (int i = 0; i < 6; i++) { int v; in.read(v); out.write(v * 2 + ID); }
}
void demux(stream<int>& in, stream<int, 4> (&inter)[2]) {
  int sel = 0;
  for (int i = 0; i < 12; i++) { int v; in.read(v); inter[sel].write(v); sel = sel ? 0 : 1; }
}
void mux(stream<int, 4> (&inter)[2], stream<int>& out) {
  int sel = 0;
  for (int i = 0; i < 12; i++) { int v; inter[sel].read(v); out.write(v); sel = sel ? 0 : 1; }
}
void example(stream<int>& in, stream<int>& out) {
#pragma HLS DATAFLOW
  stream<int, 4> inter[2];
  stream<int, 4> mux_in[2];
  demux(in, inter);
  proc<0>(inter[0], mux_in[0]);
  proc<1>(inter[1], mux_in[1]);
  mux(mux_in, out);
}
int main() {
  stream<int> in("in"), out("out");
  for (int i = 0; i < 12; i++) in << i;
  example(in, out);
  for (int i = 0; i < 12; i++) { int v; out.read(v); if (v != i * 2 + (i & 1)) return 1; }
  return 0;
}
`;
  assert.equal(simulateC(src, { file: 'ex.cpp' }).exitCode, 0);
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'ex.cpp', lang });
    assert.deepEqual([r.errors, r.pass, r.gen.diagnostics], [[], true, []], JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.report.fifos, [{ name: 'inter_0', depth: 4 }, { name: 'inter_1', depth: 4 }, { name: 'mux_in_0', depth: 4 }, { name: 'mux_in_1', depth: 4 }]);
  }
});

test('#1739 arrays of streams: what is not supported, said', () => {
  const errs = (src) => cToHdl(src, { file: 'e.cpp' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  const H = '#include "hls_stream.h"\n';
  assert.deepEqual(errs(`${H}int f(hls::stream<int> s[2]) { return s[2].read(); }\n`), ["2 's[2]': outside the array of 2 streams"]);
  assert.deepEqual(errs(`${H}int f(hls::stream<int> s[2], int i) { return s[i++].read(); }\n`), ["2 's[…]': an index with a side effect (write it apart)"]);
  const arr = (src) => errs(src).filter((m) => /array of streams/.test(m));
  assert.deepEqual(arr(`${H}int f(hls::stream<int> s[2], int n) { hls::stream<int> t[n]; return 0; }\n`), ["2 the array of streams 't': its size must be a constant"]);
  assert.deepEqual(arr(`${H}int g(int x) { return x; }\nint f(hls::stream<int> s[2]) { return g(s == 0); }\n`), ["3 the array of streams 's': index it (s[i]) or pass it whole to a function"]);
});
