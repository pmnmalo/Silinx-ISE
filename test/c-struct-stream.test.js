// Silinx HLS C++ (#1662): hls::stream of a struct (one stream per member: core/c-struct-stream.js) and ap_axi_sdata.h
// (core/cpp-headers.js). The C simulation against the host's C++ compiler with AMD's ap_int.h, a queue as
// hls_stream.h and the same ap_axis; the co-simulation in VHDL and Verilog, its ports and warnings; a typedef of a
// struct; the ap types' widths written as expressions; a side channel of width 0 left out; what is not supported, said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { CPP_OWN_HEADERS } from '../core/cpp-headers.js';
import { apIntHeaders, runWithApInt } from './ap-int-ref.js';

const AP = await apIntHeaders();
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
// (a stream for the reference: a queue)
const STREAM_H = `#include <queue>
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
/** The program for the host's compiler: the stream and ap_axi_sdata.h in it. */
const reference = (src) => src.replace('#include "hls_stream.h"', STREAM_H).replace('#include "ap_axi_sdata.h"', CPP_OWN_HEADERS['ap_axi_sdata.h'].replace('#pragma once', ''));

const SRC = `#include <iostream>
#include "ap_int.h"
#include "hls_stream.h"
#include "ap_axi_sdata.h"
typedef ap_axis<16, 2, 3, 4> pkt;
struct pos { ap_uint<4> x; ap_int<6> y; };
struct item { pos p; ap_uint<(7 + 1) / 2> tag; };
typedef struct item item_t;

// a beat's data scaled, its side channels kept
void scale(hls::stream<pkt> &in, hls::stream<pkt> &out, int k) {
  for (int i = 0; i < 4; i++) {
    pkt t = in.read();
    t.data = t.data * k;
    if (t.last) t.user = 3;
    out.write(t);
  }
}
static void move(hls::stream<item_t> &a, hls::stream<item_t> &b) {
  item_t v;
  a >> v;
  v.p.x = v.p.x + 1;
  v.p.y = -v.p.y;
  b << v;
}
int count(hls::stream<item_t> &s) { int n = 0; while (!s.empty()) { item w; s.read(w); n += w.tag; } return n; }
item_t first(hls::stream<item_t> &s) { return s.read(); }

int main() {
  hls::stream<pkt> a, b;
  for (int i = 0; i < 4; i++) {
    pkt t;
    t.data = 1000 * i - 1500; t.keep = 3; t.strb = 1; t.user = i; t.last = i == 3; t.id = i + 1; t.dest = 15 - i;
    a.write(t);
  }
  scale(a, b, -3);
  pkt r;
  for (int i = 0; i < 4; i++) {
    if (i < 2) r = b.read(); else b >> r;
    std::cout << r.data << " " << r.keep << " " << r.user << " " << r.last << " " << r.id << " " << r.dest << std::endl;
  }
  hls::stream<item_t> c, d;
  for (int i = 0; i < 3; i++) { item it; it.p.x = i * 5; it.p.y = 7 - 9 * i; it.tag = i + 2; c.write(it); }
  move(c, d);
  move(c, d);
  auto f = first(d);
  std::cout << f.p.x << " " << f.p.y << " " << f.tag << " " << count(c) + count(d) << std::endl;
  return a.empty() && b.empty() ? 0 : 1;
}
`;

test('#1662 a stream of a struct and ap_axis in the C simulation: read (a declaration, an assignment, a return, read(v), >>), write, <<, empty, passed to a function; as the C++ compiler with AMD\'s ap_int.h', { skip: AP.why || false }, () => {
  const sim = simulateC(SRC, { file: 's.cpp' });
  assert.deepEqual([sim.error, sim.diagnostics.filter((d) => d.severity === 'error'), sim.exitCode], [null, [], 0]);
  assert.equal(sim.output, runWithApInt(reference(SRC), AP.dir));
  assert.equal(sim.output, '4500 3 0 0 1 15\n1500 3 1 0 2 14\n-1500 3 2 0 3 13\n-4500 3 3 1 4 12\n1 -7 2 7\n');
});

const TOP = `#include "hls_stream.h"
#include "ap_axi_sdata.h"
typedef ap_axiu<12, 0, 0, 0> beat;
void add(hls::stream<beat> &in, hls::stream<beat> &out, ap_uint<12> k) {
#pragma HLS INTERFACE axis port=in
  for (int i = 0; i < 3; i++) {
    beat t = in.read();
    t.data += k;
    out.write(t);
  }
}
int main() {
  hls::stream<beat> a, b;
  for (int j = 0; j < 2; j++) {
    for (int i = 0; i < 3; i++) { beat t; t.data = 1000 * i + j; t.keep = 3; t.strb = i; t.last = i == 2; a.write(t); }
    add(a, b, 99 * j + 7);
  }
  int s = 0;
  while (!b.empty()) { beat t = b.read(); s += t.data + t.strb + t.last; }
  return s == 6350 ? 0 : 1;
}
`;

test('#1662 a stream of ap_axiu co-simulated in VHDL and Verilog: one ap_fifo of its words (#1668: data, keep, strb, last from the LSB; side channels of width 0 none); its warnings once, by the stream\'s name', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(TOP, { file: 'add.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    // (the stream named in and out: in_r and out_r, as Vitis HLS names them; axis's TDATA, TKEEP… ports are #1894's)
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.message}`), [
      "4 'in' is a reserved word of VHDL or Verilog: it is named in_r in the module",
      "4 'out' is a reserved word of VHDL or Verilog: it is named out_r in the module",
      '5 #pragma HLS INTERFACE axis port=in is not made yet: ignored (its default interface made)']);
    assert.deepEqual(r.gen.ports.filter((p) => /^(in|out)_/.test(p.name)).map((p) => `${p.name}:${p.w}`), [
      'in_r_dout:17', 'in_r_empty_n:1', 'in_r_read:1', 'out_r_din:17', 'out_r_full_n:1', 'out_r_write:1']);
  }
  const sim = simulateC(TOP, { file: 'add.cpp' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
});

test('#1662 typedef of a struct; the ap types\' widths as constant expressions; a side channel of width 0 not a member; what is not supported, said', () => {
  const errs = (src) => cToHdl(src, { file: 'e.cpp' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(errs('struct Q { int a; int b; };\ntypedef Q R;\ntypedef struct Q S;\nint f(int a) { R r; S s; r.a = a; s.b = 2; return r.a + s.b; }\n'), []);
  assert.deepEqual(errs('enum E { A, B };\ntypedef E F;\nint f(int a) { F x = B; return a + x; }\n'), []);
  assert.deepEqual(errs('#include "ap_int.h"\nstruct P { ap_uint<(3 + 5) / 2> k; ap_int<2 * 3> d; };\nint f(int a) { P p; p.k = a; p.d = a; return p.k + p.d; }\n'), []);
  assert.deepEqual(errs('#include "ap_axi_sdata.h"\nint f(int a) { ap_axis<8, 0, 0, 0> p; p.data = a; return p.user; }\n'), ["2 'user' is not a member of ap_axis_8_0_0_0"]);
  const S = '#include "hls_stream.h"\nstruct P { int a; int b; };\n';
  assert.deepEqual(errs(`${S}int f(hls::stream<P> &s) { return s.read().a; }\n`), ["3 's.read()' (a stream of a struct): read it in a declaration (P v = s.read();), an assignment or a return"]);
  assert.deepEqual(errs(`${S}void f(hls::stream<P> &s, int x) { P r; r.a = x; r.b = x; if (x) s.write(r), x++; }\n`), ["3 's' (a stream of a struct): its write a statement of its own (s.write(…);)"]);
  assert.deepEqual(errs(`${S}struct R { int c[2][2]; };\nvoid f(hls::stream<R> &s) { R r; r.c[0][0] = 1; s.write(r); }\n`), ["4 the stream of 'R': its member 'c' is an array of more than one dimension, of structs or of a size not constant (not possible in a stream yet)"]);
});

test('#1819 hls::axis_user (AMD\'s ap_axi_sdata.h: user, last when AXIS_ENABLE_LAST, id, dest; no data): get_user / set_user, a stream of them co-simulated in VHDL and Verilog (one stream of its words, #1668); a signal not enabled not a member', () => {
  const src = `#include "ap_axi_sdata.h"
#include "hls_stream.h"
typedef hls::axis_user<13, (AXIS_ENABLE_USER | AXIS_ENABLE_LAST)> packet;
void bump(hls::stream<packet>& A, hls::stream<packet>& B) {
  packet t = A.read();
  t.set_user(t.get_user() + 5);
  B.write(t);
}
int main() {
  hls::stream<packet> a, b;
  int bad = 0;
  for (int j = 0; j < 4; j++) {
    packet p, q;
    p.user = j * 1000; p.last = j == 3;
    a.write(p);
    bump(a, b);
    b.read(q);
    if (q.get_user() != (j * 1000 + 5) % 8192 || q.last != (j == 3)) bad++;
  }
  return bad;
}
`;
  const sim = simulateC(src, { file: 'u.cpp' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'u.cpp', lang });
    assert.deepEqual([r.errors, r.pass], [[], true], JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.ports.filter((p) => /_(dout|din)$/.test(p.name)).map((p) => `${p.name}:${p.w}`), ['A_dout:14', 'B_din:14']);   // (user, then last: one word, #1668)
  }
  const errs = (s) => cToHdl(s, { file: 'e.cpp' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(errs('#include "ap_axi_sdata.h"\nint f(int x) { hls::axis_user<8> p; p.user = x; return p.last; }\n'), ["2 'last' is not a member of axis_user_8_64_0_0"]);
});
