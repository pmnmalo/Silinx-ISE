// Silinx HLS C++ (#1891): the subset of Vitis HLS's library headers AMD's examples use (core/cpp-hls-lib.js,
// core/cpp-vector.js): hls_vector.h, hls_streamofblocks.h, <complex> with hls::axis, ap_float.h and hls::autorestart in a
// test bench, malloc.h; extern "C", a typedef of a stream, a reference to an array. The C simulation (the values its own
// test bench and this file compute), the co-simulation in VHDL and Verilog, the warnings of each flow, what is refused.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';

const opts = (top) => ({ file: 'unit.cpp', headers: {}, top });
const notes = (ds, sev = 'warning') => ds.filter((d) => d.severity === sev).map((d) => `${d.line} ${d.message}`);
/** The C simulation's output (it passes), then the VHDL and the Verilog generated and co-simulated. */
function flows(src, top, warnings) {
  const s = simulateC(src, opts(top));
  assert.equal(s.error ?? null, null, s.error?.message);
  assert.deepEqual(notes(s.diagnostics, 'error'), []);
  assert.equal(s.exitCode, 0, s.output);
  for (const lang of ['vhdl', 'verilog']) {
    const g = cToHdl(src, { ...opts(top), lang });
    assert.deepEqual(notes(g.diagnostics, 'error'), []);
    assert.deepEqual(notes(g.diagnostics), warnings);
    const c = cosimulate(src, { ...opts(top), lang, maxCycles: 100000 });
    assert.ok(c.ok && c.pass, `${lang}: ${c.errors?.[0] || JSON.stringify(c.mismatches?.slice(0, 2))}`);
  }
  return s.output;
}
const errors = (src, top = 'f') => notes(cToHdl(src, { ...opts(top), lang: 'vhdl' }).diagnostics, 'error');

const VEC = `#include "hls_stream.h"
#include "hls_vector.h"
typedef hls::vector<uint32_t, 4> V;
`;

test('#1891 hls::vector through streams: t * 3, a + 25, a + b element by element, in the order C++ reads them', () => {
  const src = `${VEC}void f(hls::stream<V> &i, hls::stream<V> &o) {
  V t = i.read();
  o.write(t * 3);
  o.write(i.read() + 25);
  o.write(i.read() + i.read());
  o.write((t - 1) * 2 + t);
  V r = 2 * t;
  r += t;
  o.write(r);
}
int main() {
  hls::stream<V> a, b;
  V x = {1, 2, 3, 4}, y = {10, 20, 30, 40}, z = {100, 200, 300, 400};
  a.write(x); a.write(y); a.write(y); a.write(z);
  f(a, b);
  const unsigned want[5][4] = {{3, 6, 9, 12}, {35, 45, 55, 65}, {110, 220, 330, 440}, {1, 4, 7, 10}, {3, 6, 9, 12}};
  for (int i = 0; i < 5; i++) { V r = b.read(); for (int j = 0; j < 4; j++) if (r[j] != want[i][j]) return 1; }
  return 0;
}
`;
  flows(src, 'f', []);
});

test('#1891 hls::vector in memory: a pointer, an array, v[i][j], ?:, std::vector of vectors, float elements, T (&a)[N] deduced', () => {
  const src = `#include "hls_vector.h"
#include <vector>
#include <iostream>
typedef hls::vector<float, 2> F;
template <int N, typename T> void copy(T (&out)[N], const T *in) { for (int i = 0; i < N; i++) out[i] = in[i]; }
template <int N, typename T, typename S> void add(T (&res)[N], const S (&a)[N], const S (&b)[N]) { for (int i = 0; i < N; i++) res[i] = a[i] + b[i]; }
extern "C" void f(F *res, const F *a) {
  F x[3], y[3];
  copy(x, a);
  add(y, x, x);
  for (int i = 0; i < 3; i++) res[i] = y[i];
}
int main() {
  std::vector<F> a(3), r(3);
  F u = {1.5, 2.5}, v = {3.5, 4.5};
  for (int i = 0; i < 3; i++) a[i] = i % 2 ? u : v;
  a[2][1] = 0.5;
  f(r.data(), a.data());
  std::cout << r.size() << " " << r[0][0] << " " << r[1][1] << " " << r[2][1] << std::endl;
  return 0;
}
`;
  const s = simulateC(src, opts('f'));
  assert.equal(s.exitCode, 0, s.error?.message);
  assert.equal(s.output, '3 7 5 1\n');
  const g = cToHdl(src, { ...opts('f'), lang: 'vhdl' });
  assert.deepEqual(notes(g.diagnostics, 'error'), []);
  assert.deepEqual([...new Set(notes(g.diagnostics).map((m) => m.replace(/^\d+ /, '')))].filter((m) => /struct argument/.test(m)).sort(), [
    "the struct argument 'a': its members are memories of their own (a_ap_d); Vitis HLS makes one memory of them (not yet: a member not an integer)",
    "the struct argument 'res': its members are memories of their own (res_ap_d); Vitis HLS makes one memory of them (not yet: a member not an integer)"]);
});

const SOB = `#include "hls_stream.h"
#include "hls_streamofblocks.h"
#define B 4
typedef unsigned char data_t;
typedef data_t block_t[B];
`;

test('#1891 hls::stream_of_blocks in a DATAFLOW: write_lock written at the end of its scope, read_lock read at its start', () => {
  const src = `${SOB}void a(hls::stream<data_t> &in, hls::stream_of_blocks<block_t> &o) {
  for (int i = 0; i < 2; i++) {
    hls::write_lock<block_t> l(o);
    for (int j = 0; j < B; j++) l[j] = in.read();
  }
}
void b(hls::stream_of_blocks<block_t> &s, hls::stream<data_t> &out) {
  for (int i = 0; i < 2; i++) {
    hls::read_lock<block_t> l(s);
    for (int j = B - 1; j >= 0; j--) out.write(l[j] + 1);
  }
}
void f(hls::stream<data_t> &in, hls::stream<data_t> &out) {
  hls::stream_of_blocks<block_t> c;
#pragma HLS DATAFLOW
  a(in, c);
  b(c, out);
}
int main() {
  hls::stream<data_t> i, o;
  for (int k = 0; k < 8; k++) i.write(k);
  f(i, o);
  const int want[8] = {4, 3, 2, 1, 8, 7, 6, 5};
  for (int k = 0; k < 8; k++) if (o.read() != want[k]) return 1;
  return 0;
}
`;
  flows(src, 'f', []);
});

test('#1891 hls::stream_of_blocks: what is not made, said', () => {
  assert.deepEqual(errors(`${SOB}void f(hls::stream_of_blocks<block_t> &s) { hls::write_lock<block_t> l(s); l[0] = 1; return; }\n`),
    ['6 hls::write_lock: a return within its scope is not supported (the block is written at the end of the scope)']);
  assert.deepEqual(errors(`${SOB}void f(hls::stream_of_blocks<data_t> &s) { }\n`), ["6 hls::stream_of_blocks: its block 'data_t' a typedef of an array of one dimension (typedef T B[N];)"]);
  assert.deepEqual(errors(`${SOB}typedef int m_t[2][2];\nvoid f(hls::stream_of_blocks<m_t> &s) { }\n`), ["7 hls::stream_of_blocks: its block 'm_t' a typedef of an array of one dimension (typedef T B[N];)"]);
});

test('#1891 std::complex in hls::axis: real and imag read and set, a list assigned, != and ==, a typedef of the stream, TDATA of both', () => {
  const src = `#include "ap_axi_sdata.h"
#include "hls_stream.h"
#include <complex>
typedef hls::axis<std::complex<short int>, 0, 0, 0> data_t;
typedef hls::stream<data_t> S;
void f(S &a, S &b) {
#pragma HLS INTERFACE axis port = a
#pragma HLS INTERFACE axis port = b
  data_t x;
  do {
    x = a.read();
    data_t y;
    y.data.real(x.data.real() + 5);
    y.data.imag(x.data.imag() - 1);
    y.last = x.last;
    b.write(y);
  } while (!x.last);
}
int main() {
  S a, b;
  for (short i = 0; i < 3; i++) { data_t t; t.data = {i, i}; t.last = i == 2; a.write(t); }
  f(a, b);
  for (short i = 0; i < 3; i++) {
    data_t r = b.read();
    data_t w;
    w.data.real(i + 5);
    w.data.imag(i - 1);
    if (r.data != w.data) return 1;
    if (!(r.data == w.data)) return 2;
  }
  return 0;
}
`;
  flows(src, 'f', ['10 the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)',
    '10 this loop is pipelined automatically, as Vitis HLS does (II=1): II=6 made (a do-while); #pragma HLS PIPELINE off in it turns that off']);
  const g = cToHdl(src, { ...opts('f'), lang: 'vhdl' });
  assert.ok(g.ok);
  // (the AXI4-Stream ports, #1894: TDATA both halves, the real part low)
  assert.deepEqual(g.ports.filter((p) => /^[ab]_T/.test(p.name)).map((p) => p.name).sort(), ['a_TDATA', 'a_TKEEP', 'a_TLAST', 'a_TREADY', 'a_TSTRB', 'a_TVALID', 'b_TDATA', 'b_TKEEP', 'b_TLAST', 'b_TREADY', 'b_TSTRB', 'b_TVALID']);
  assert.match(g.hdl, /a_TDATA : in std_logic_vector\(31 downto 0\)/);
  assert.match(g.hdl, /a_TKEEP : in std_logic_vector\(3 downto 0\)/);
  assert.deepEqual(errors(`#include "ap_axi_sdata.h"\ntypedef hls::axis<bad_t, 0, 0, 0> d;\nvoid f(int a) { }\n`).slice(0, 1), ["2 hls::axis: its data type 'bad_t' (a builtin type, ap_int, ap_uint or std::complex of one here)"]);
});

test('#1891 ap_float and hls::autorestart in a test bench: a double and n calls, said; in the synthesized code refused', () => {
  const src = `#include "hls_task.h"
#include <ap_float.h>
using real_t = ap_float<16, 5>;
int total = 0;
void f(int a[2]) { total += a[0] + a[1]; }
int main() {
  int d[2] = {1, 2};
  real_t h = real_t(3.5f), k = 2;
  hls::autorestart r(3, f, d);
  return total == 9 && h + k == 5.5 ? 0 : 1;
}
`;
  const s = simulateC(src, opts('f'));
  assert.equal(s.exitCode, 0, s.error?.message);
  assert.deepEqual(notes(s.diagnostics), ['3 ap_float<16,5> is simulated as a double (its rounding not modelled)']);
  assert.deepEqual(errors(`#include <ap_float.h>\nap_float<16, 5> f(ap_float<16, 5> a) { ap_float<16, 5> b = a; return b; }\n`).slice(0, 1), ['2 ap_float<16,5>: only in a test bench in Silinx HLS (the C simulation), not in the synthesized code']);
  assert.deepEqual(errors(`#include "hls_task.h"\nvoid g(int a) { }\nvoid f(int a) { hls::autorestart r(2, g, a); }\n`), ['3 hls::autorestart: only in a test bench in Silinx HLS (the C simulation), not in the synthesized code']);
  assert.deepEqual(errors(`#include "hls_task.h"\nvoid g(int a) { }\nint main() { hls::autorestart r(2); return 0; }\nvoid f(int a) { }\n`), ['3 hls::autorestart: hls::autorestart r(n, f, arguments…);']);
});

test('#1891 malloc.h: malloc and free in a test bench, C and C++, with and without a cast; in the synthesized code refused', () => {
  for (const [file, cast] of [['unit.cpp', '(int *)'], ['unit.c', ''], ['unit.c', '(int *)']]) {
    const src = `#include <malloc.h>
int f(int *p) { return p[0] + p[3]; }
int main() {
  int *p = ${cast}malloc(4 * sizeof(int));
  p[0] = 5; p[3] = 7;
  int r = f(p);
  free(p);
  return r == 12 && 0 == 0 ? 0 : 1;
}
`;
    const s = simulateC(src, { file, headers: {}, top: 'f' });
    assert.equal(s.exitCode, 0, `${file} ${cast}: ${s.error?.message}`);
    assert.deepEqual(notes(s.diagnostics), ["2 the pointer argument 'p' is indexed: a memory (ap_memory) of 1024 elements, its depth not given (#pragma HLS INTERFACE port=p depth=N)"]);
    assert.ok(cToHdl(src, { file, headers: {}, top: 'f', lang: 'vhdl' }).ok);
  }
  // (each element's bytes, its first's zero, past its end said)
  const bytes = simulateC(`#include <malloc.h>\nvoid f(int a) { }\nint main() { char *c = (char *)malloc(3); short *s = (short *)malloc(5); s[1] = 9; return c[2] + s[0] + s[1] == 9 ? 0 : 1; }\n`, opts('f'));
  assert.equal(bytes.exitCode, 0, bytes.error?.message);
  const past = simulateC(`#include <malloc.h>\nvoid f(int a) { }\nint main() { short *s = (short *)malloc(5); s[2] = 9; return 0; }\n`, opts('f'));
  assert.match(past.error?.message, /outside the array/);
  assert.deepEqual(errors(`#include <malloc.h>\nvoid f(int a) { int *p = (int *)malloc(4); free(p); }\n`), ["2 the pointer 'p': set to something other than an array, &x, &a[i] or a + i: not supported yet", '2 malloc: dynamic memory is not possible in hardware (Silinx HLS, as Vitis HLS: fixed sizes; use an array)', '2 free: dynamic memory is not possible in hardware (Silinx HLS, as Vitis HLS: fixed sizes; use an array)']);
});

test('#1891 a stream of a struct with an array member: a stream per element, each read and written; extern "C" blocks', () => {
  const src = `#include "hls_stream.h"
struct R { int a; int c[2]; };
extern "C" {
void f(hls::stream<R> &i, hls::stream<R> &o) { R r = i.read(); r.c[1] += r.a; o.write(r); }
}
int main() {
  hls::stream<R> i, o;
  R x = {1, {2, 3}};
  i.write(x);
  f(i, o);
  R y = o.read();
  return y.a == 1 && y.c[0] == 2 && y.c[1] == 4 ? 0 : 1;
}
`;
  flows(src, 'f', []);
  assert.deepEqual(errors(`#include "hls_stream.h"\nstruct R { int c[2][2]; };\nvoid f(hls::stream<R> &s) { }\n`), ["3 the stream of 'R': its member 'c' is an array of more than one dimension, of structs or of a size not constant (not possible in a stream yet)"]);
});
