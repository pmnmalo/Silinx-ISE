// Silinx HLS (#1590): hls::stream. Its C simulation (a queue: read, write, empty, the operators >> and <<, by
// reference) against the host's C++ compiler with a stream of its own (std::queue) as hls_stream.h; its synthesis as
// Vitis HLS's ap_fifo (the ports, their order); its co-simulation in VHDL and Verilog with FIFOs in the test bench that
// are empty and full now and then (the module's waits); a wrong value written reported; what is not supported said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { CXX } from './ap-int-ref.js';
import { lf } from './c-helpers.js';

// (a stream for the reference: a queue)
const STREAM_H = `#pragma once
#include <queue>
namespace hls {
template <typename T> class stream {
  std::queue<T> q;
 public:
  T read() { T v = q.front(); q.pop(); return v; }
  void read(T &v) { v = read(); }
  void write(const T &v) { q.push(v); }
  bool empty() { return q.empty(); }
  bool full() { return false; }
  stream &operator>>(T &v) { v = read(); return *this; }
  stream &operator<<(const T &v) { write(v); return *this; }
};
}
`;
const SRC = `#include <iostream>
#include <cstdint>
#include "hls_stream.h"
void accumulate(hls::stream<uint8_t> &src, hls::stream<int> &dst, int n) {
  int sum = 0;
  for (int i = 0; i < n; i++) {
#pragma HLS LOOP_TRIPCOUNT max=16
    uint8_t v = src.read();
    sum += v;
    if ((i & 1) == 1) dst.write(sum);
  }
  dst << -sum;
}
int main() {
  hls::stream<uint8_t> a;
  hls::stream<int> b;
  for (int k = 0; k < 8; k++) a.write(k * 37);
  accumulate(a, b, 5);
  accumulate(a, b, 3);
  int x;
  while (!b.empty()) { b >> x; std::cout << x << " "; }
  std::cout << std::endl;
  return a.empty() ? 0 : 1;
}
`;
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);

test('#1590 hls::stream in the C simulation: a queue (read, write, empty, >> and <<, by reference), the calls\' values in and out; as the C++ compiler\'s', { skip: CXX ? false : 'no C++ compiler' }, () => {
  const sim = simulateC(SRC, { file: 'acc.cpp' });
  assert.equal(sim.error, null);
  assert.deepEqual(sim.diagnostics, []);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-st-'));
  try {
    fs.writeFileSync(path.join(dir, 'hls_stream.h'), STREAM_H);
    fs.writeFileSync(path.join(dir, 't.cpp'), SRC);
    execFileSync(CXX, ['-std=c++14', '-w', '-I', dir, '-o', path.join(dir, 't'), path.join(dir, 't.cpp')]);
    let ref;
    try { ref = { output: lf(execFileSync(path.join(dir, 't'), { encoding: 'utf8' })), exitCode: 0 }; } catch (e) { ref = { output: lf(e.stdout), exitCode: e.status }; }
    assert.equal(sim.output, ref.output);
    assert.equal(sim.exitCode, ref.exitCode);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  assert.equal(sim.output, '37 222 -370 407 -410 \n');
  assert.deepEqual(sim.calls.map((c) => [c.streamIn.src.length, c.streamRead.src, c.streamOut.dst.map(Number)]), [[8, 5, [37, 222, -370]], [3, 3, [407, -410]]]);
  // a read of an empty stream: the run stops there (in hardware it would wait for ever)
  const e = simulateC('#include "hls_stream.h"\nint f(hls::stream<int> &s) { return s.read(); }\nint main() { hls::stream<int> s; return f(s); }\n', { file: 'e.cpp' });
  assert.deepEqual(e.error && [e.error.line, e.error.message], [2, "the stream 's' is read while empty"]);
});

test('#1590 hls::stream synthesized as ap_fifo (read: _dout _empty_n _read; written: _din _full_n _write); co-simulated with FIFOs empty and full now and then: a pass in VHDL and Verilog, no warning; a wrong value written reported', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC, { file: 'acc.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.gen.diagnostics, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.ports.map((p) => `${p.name}:${p.dir}${p.w}`), ['ap_clk:in1', 'ap_rst:in1', 'ap_start:in1', 'ap_done:out1', 'ap_idle:out1', 'ap_ready:out1',
      'src_dout:in8', 'src_empty_n:in1', 'src_read:out1', 'dst_din:out32', 'dst_full_n:in1', 'dst_write:out1', 'n:in32']);
    assert.ok(r.latency.max > r.latency.min);   // (the waits of the FIFOs)
  }
  const bad = cosimulate(SRC, { file: 'acc.cpp', lang: 'verilog', alter: (h) => h.replace(/assign dst_din = (\w+);/, 'assign dst_din = $1 + 1;') });
  assert.equal(bad.pass, false);
  assert.deepEqual(bad.mismatches.map((m) => `${m.call} ${m.port}`), ['1 dst[0]', '1 dst[1]', '1 dst[2]', '2 dst[0]', '2 dst[1]']);
});

test('#1590 hls::stream: what is not supported, said; in a .c file, a C++ type', () => {
  const errs = (src, file = 'e.cpp') => cToHdl(src, { file }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(errs('#include "hls_stream.h"\nvoid f(hls::stream<int> &s) {\n  int v = s.read();\n  s.write(v + 1);\n}\n'), ["1 the stream 's' is read and written: a stream argument is one or the other (ap_fifo)"].map((x) => x.replace(/^1/, '2')));
  assert.deepEqual(errs('#include "hls_stream.h"\nint f(int a) {\n  hls::stream<int> s;\n  return a;\n}\n'), ["3 's': a stream inside the module (a FIFO between its parts, DATAFLOW) is not supported yet: a stream is an argument (ap_fifo)"]);
  assert.deepEqual(errs('#include "hls_stream.h"\nint f(hls::stream<int> &s) {\n  return s.size();\n}\n'), ["3 's.size()' is not supported here yet (a stream read or written as a statement of the top function, x = s.read(); s.write(v);)"]);
  assert.deepEqual(errs('#include "hls_stream.h"\nint f(int a) { return a; }\n', 'e.c'), ['1 hls_stream.h: hls::stream is C++: write the source as a .cpp file']);
});

test('#1823 a header of a struct with a stream, two sources including it, the function declared again after its definition: its reference parameters as the definition\'s; a stream read until empty() co-simulated (the test bench\'s FIFO empty only when it is)', () => {
  const headers = {
    'ex.h': '#include "hls_stream.h"\n#include <iostream>\n#define N 10\nstruct A {\n  hls::stream<int> s_in;\n  long arr[N];\n};\nlong dut(struct A& d);\n',
    'ex.cpp': '#include "ex.h"\nlong dut(struct A& d) {\n  long sum = 0;\n  while (!d.s_in.empty())\n    sum += d.s_in.read();\n  for (unsigned i = 0; i < N; i++)\n    sum += d.arr[i];\n  return sum;\n}\n',
    'tb.cpp': '#include "ex.h"\nint main() {\n  A a;\n  for (unsigned i = 0; i < N; i++)\n    a.s_in.write(i);\n  for (unsigned i = 0; i < N; i++)\n    a.arr[i] = i;\n  auto ret = dut(a);\n  std::cout << "ret = " << ret << std::endl;\n  return 0;\n}\n',
  };
  const unit = '#include "ex.cpp"\n#include "tb.cpp"\n';
  const sim = simulateC(unit, { file: 'unit.cpp', headers, top: 'dut' });
  assert.deepEqual([sim.error, sim.exitCode, sim.output], [null, 0, 'ret = 90\n']);
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(unit, { file: 'unit.cpp', headers, top: 'dut', lang });
    assert.deepEqual([r.errors, r.pass], [[], true], JSON.stringify(r.mismatches, (k, v) => (typeof v === 'bigint' ? `${v}` : v)));
    assert.deepEqual(r.gen.fifos.map((f) => `${f.name} ${f.dir} ${f.polled}`), ['d_s_in in true']);
  }
});
