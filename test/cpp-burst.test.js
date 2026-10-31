// Silinx HLS: hls_burst_maxi.h and memcpy (#1893, core/cpp-burst.js). A burst_maxi's requests queued and taken in turn,
// against the C model of each (a reference computed here); memcpy of an m_axi argument and a local array, in C and C++;
// each co-simulated through the bus's model in VHDL and in Verilog, its warnings asserted; the errors said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';

const LANGS = ['vhdl', 'verilog'];
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const msgs = (gen) => gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const AUTO = (line, ii) => `${line} warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=${ii} made (it accesses a memory, an access a state); #pragma HLS PIPELINE off in it turns that off`;

function cosim(src, file, warnings, top) {
  for (const lang of LANGS) {
    const r = cosimulate(src, { file, lang, top });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.sim.exitCode, 0, lang);
    assert.equal(r.pass, true, `${lang} ${JSON.stringify(r.mismatches, big)}`);
    assert.deepEqual(msgs(r.gen), warnings, lang);
  }
}

// two read requests and two write requests queued, read and written in turn; the reference: the same in plain C here
const BURST = `#include "hls_burst_maxi.h"
void f(hls::burst_maxi<int> src, hls::burst_maxi<int> dst, int k) {
#pragma HLS INTERFACE m_axi port=src depth=16 bundle=b1
#pragma HLS INTERFACE m_axi port=dst depth=16 bundle=b2
  src.read_request(0, 3);
  src.read_request(12, 2);
  dst.write_request(8, 2);
  dst.write_request(1, 3);
  for (int i = 0; i < 5; i++) {
    int v = src.read();
    if (i < k)
      dst.write(v * 2);
    else
      dst.write(v + 100);
  }
  dst.write_response();
  dst.write_response();
}
int main() {
  int a[16], b[16];
  for (int i = 0; i < 16; i++) { a[i] = i * i; b[i] = -1; }
  f(a, b, 3);
  int want[16];
  for (int i = 0; i < 16; i++) want[i] = -1;
  int src[5] = { 0, 1, 4, 144, 169 }, dst[5] = { 8, 9, 1, 2, 3 };
  for (int i = 0; i < 5; i++) want[dst[i]] = i < 3 ? src[i] * 2 : src[i] + 100;
  for (int i = 0; i < 16; i++) if (b[i] != want[i]) return 1;
  f(a, b, 0);
  return b[8] == 100 && b[3] == 269 ? 0 : 2;
}
`;

test('#1893 hls::burst_maxi: requests queued, each read or write at its cursor, the next request once one is done; co-simulated', () => {
  const sim = simulateC(BURST, { file: 'a.cpp', top: 'f' });
  assert.deepEqual([sim.ok, sim.exitCode], [true, 0]);
  cosim(BURST, 'a.cpp', ['9 warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=6 made (it accesses a memory in a branch, an access a state); #pragma HLS PIPELINE off in it turns that off'], 'f');
  const g = cToHdl(BURST, { file: 'a.cpp', top: 'f' });
  assert.deepEqual(g.axi.buses.map((b) => b.bundle), ['b1', 'b2']);
});

const MEMCPY = (cast) => `#include <string.h>
void f(volatile int *a) {
#pragma HLS INTERFACE m_axi port=a depth=6
  int buf[6];
  memcpy(buf, ${cast ? '(const int *)' : ''}a, 6 * sizeof(int));
  for (int i = 0; i < 6; i++) buf[i] = buf[i] + 100;
  memcpy(${cast ? '(int *)' : ''}a, buf, 6 * sizeof(int));
}
int main() {
  int a[6] = { 1, 2, 3, 4, 5, 6 };
  f(a);
  f(a);
  return a[5] == 206 ? 0 : 1;
}
`;

test('#1893 memcpy of an m_axi argument and a local array, its pointer casts dropped: a loop of the elements, in C and in C++', () => {
  cosim(MEMCPY(true), 'a.cpp', [], 'f');
  cosim(MEMCPY(false), 'a.c', [], 'f');
});

test('#1893 a burst_maxi not as an argument, a function it has not, an access in a condition or two in a statement: said', () => {
  const err = (body) => simulateC(`#include "hls_burst_maxi.h"\nvoid f(hls::burst_maxi<int> p) {\n${body}\n}\nint main() { int a[4] = { 0 }; f(a); return 0; }`, { file: 'a.cpp', top: 'f' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line}: ${d.message}`);
  assert.ok(err('  p.read_request(0, 1);\n  p.flush();').includes('4: hls::burst_maxi: flush() is not one of its functions (read_request(offset, n), read(), write_request(offset, n), write(v), write_response())'));
  assert.deepEqual(err('  p.read_request(0, 1);\n  if (p.read() > 0) p[0] = 1;'), ['4: hls::burst_maxi: a read() or write() only in a statement (not in a condition)']);
  assert.deepEqual(err('  p.read_request(0, 2);\n  int x = p.read() + p.read();\n  p[0] = x;'), ['4: hls::burst_maxi: one read() or write() a statement']);
  const local = simulateC(`#include "hls_burst_maxi.h"\nvoid g(int *a) { a[0] = 1; }\nint main() { hls::burst_maxi<int> q; int a[1]; g(a); return 0; }`, { file: 'a.cpp', top: 'g' });
  assert.ok(local.diagnostics.some((d) => d.severity === 'error' && d.message === 'hls::burst_maxi<T>: only as an argument of a function (hls::burst_maxi<T> name)'), JSON.stringify(local.diagnostics));
});
