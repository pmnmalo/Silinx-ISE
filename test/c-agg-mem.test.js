// Silinx HLS (#1668, core/c-agg-mem.js, core/c-aggregate.js's wordGroups): a stream of structs and an array of structs
// of the top function one ap_fifo / one ap_memory of words, as Vitis HLS aggregates them (UG1399, Structs in the
// Interface): the members packed from the LSB, compact=bit by default (a bool 1 bit), byte, none; a member array's
// elements one after the other; #pragma HLS DISAGGREGATE a stream or a memory per member, with no warning; the BRAM
// interface (#pragma HLS INTERFACE bram). Each design co-simulated in VHDL and in Verilog (its words packed by the test
// bench from the C's members), its ports and warnings asserted; an HDL whose fields differ found.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosimulate, packWord } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { memberBits, wordGroups } from '../core/c-aggregate.js';
import { checkC } from '../core/c-check.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const LANGS = ['vhdl', 'verilog'];
const msgs = (gen) => gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const data = (gen) => gen.ports.filter((p) => !/^ap_(clk|rst|start|done|idle|ready)$/.test(p.name)).map((p) => `${p.name}:${p.w}`);

/** Co-simulated in both languages: passes, more than one call, these ports and warnings. */
function cosim(src, file, ports, warnings) {
  for (const lang of LANGS) {
    const r = cosimulate(src, { file, lang });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang} ${JSON.stringify(r.mismatches, big)}`);
    assert.deepEqual([r.sim.exitCode, r.calls > 1], [0, true], lang);
    assert.deepEqual(data(r.gen), ports, lang);
    assert.deepEqual(msgs(r.gen), warnings, lang);
  }
}
/** The co-simulation of an HDL altered (a field's bits read from others'): it fails in both languages. */
function caught(src, file, verilog, vhdl, port) {
  for (const lang of LANGS) {
    const [from, to] = lang === 'vhdl' ? vhdl : verilog;
    const r = cosimulate(src, { file, lang, alter: (h) => { assert.ok(h.includes(from), `${lang}: ${from}`); return h.split(from).join(to); } });
    assert.deepEqual([r.errors, r.pass], [[], false], lang);
    assert.ok(r.mismatches.some((m) => m.port.startsWith(port)), `${lang} ${JSON.stringify(r.mismatches, big)}`);
  }
}

test('#1668 a member\'s bits in a word (bit, byte, none) and the words of a struct\'s arguments: the first member at the LSB, a member array\'s elements in order; a word packed', () => {
  assert.deepEqual([1, 5, 23, 32].map((b) => memberBits(b, 'bit')), [1, 5, 23, 32]);
  assert.deepEqual([1, 5, 23, 32].map((b) => memberBits(b, 'byte')), [8, 8, 24, 32]);
  assert.deepEqual([1, 5, 23, 32].map((b) => memberBits(b, 'none')), [8, 8, 32, 32]);
  const src = '#include "ap_int.h"\nstruct A { int foo[3]; ap_int<23> bar; bool f; };\nint f(A a[4], int k) {\n  return a[1].foo[2] + a[3].bar + k;\n}\n';
  const c = checkC(src, 'f.cpp', { synthesis: true });
  const fn = c.funcs.get(c.top);
  const g = wordGroups(c.ast.structArgs.get(c.top), fn);
  assert.deepEqual(g.map(({ name, kind, w, n }) => ({ name, kind, w, n })), [{ name: 'a', kind: 'mem', w: 120, n: 4 }]);
  assert.deepEqual(g[0].fields, [{ param: 'a_foo', off: 0, w: 32, size: 32, k: 3 }, { param: 'a_bar', off: 96, w: 23, size: 23, k: 1 }, { param: 'a_f', off: 119, w: 1, size: 1, k: 1 }]);
  const byte = wordGroups(c.ast.structArgs.get(c.top), fn, new Map([['a', { compact: 'byte' }]]));
  assert.deepEqual([byte[0].w, byte[0].fields.map((x) => x.off)], [128, [0, 96, 120]]);
  // (foo = {1, -1, 2}, bar = -2, f = 1: by hand)
  const vals = { a_foo: [1n, -1n, 2n], a_bar: [-2n], a_f: [1n] };
  assert.equal(packWord(g[0].fields, (m, j) => vals[m][j]), (1n << 119n) | (((1n << 23n) - 2n) << 96n) | (2n << 64n) | (0xffffffffn << 32n) | 1n);
  assert.equal(packWord(byte[0].fields, (m, j) => vals[m][j]), (1n << 120n) | (((1n << 23n) - 2n) << 96n) | (2n << 64n) | (0xffffffffn << 32n) | 1n);
});

// an array of structs read and written in part (read-modify-write), a member array indexed by a constant and by a
// variable, a struct copied, an index changed between writes, the same element by two indices, a loop's condition
const RMW = `#include "ap_int.h"
struct E { short v; bool f; ap_int<5> k; int t[3]; };
void upd(E a[6], E b[6], int n, int j) {
  for (int i = 0; i < n; i++) {
    a[i].v = a[i].v + b[i].k;
    if (a[i].f) a[i].t[1] = -a[i].t[2];
    a[i].t[j] += b[i].t[(i + j) % 3];
    b[i] = a[5 - i];
    b[i].f = !b[i].f;
    int x = i;
    a[x].k = 3; x = 5 - x; a[x].k = a[x].k + 1;
  }
  a[n - 2].f = !a[j].f;
  a[j].v = a[n - 2].v + 1;
  int k = 0;
  while (a[k].v != 0 && k < 5) k++;
  a[k].t[0] = k;
  b[j].t[j] = b[j].t[(j + 1) % 3] + a[j].t[j];
}
int main() {
  E a[6], b[6];
  for (int i = 0; i < 6; i++) {
    a[i].v = 10 * i - 20; a[i].f = i & 1; a[i].k = i - 3; b[i].v = i; b[i].f = i == 2; b[i].k = -i;
    for (int m = 0; m < 3; m++) { a[i].t[m] = i * 7 - m; b[i].t[m] = m - i; }
  }
  int s = 0;
  for (int c = 0; c < 3; c++) {
    upd(a, b, 2 + c, c);
    for (int i = 0; i < 6; i++) s += a[i].v + a[i].f * 3 + a[i].k + b[i].v * 5 + b[i].k + a[i].t[0] + a[i].t[1] * 2 + b[i].t[2];
  }
  return s == 12345 ? 1 : 0;
}
`;
// (the loops pipelined automatically, #1919: the copy of t's 3 elements in b[i] = a[5 - i] (the loop's inner one) a,
// b one port each; the while's condition reads a)
const AUTO = (line, ii, why) => `${line} warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=${ii} made (${why}); #pragma HLS PIPELINE off in it turns that off`;
const LOOPS = ['4 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)',
  // (the outer loop pipelined: the struct's copy statements, no inner loop, #2126)
  AUTO(4, 18, 'it accesses a memory in a branch, an access a state'),
  '16 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)',
  AUTO(16, 3, 'its condition or step accesses a memory')];

test('#1668 an array of structs one ap_memory of 118-bit words (v 0-15, f 16, k 17-21, t 22-117): read, written in part, copied; co-simulated in VHDL and Verilog; a field read from other bits found', () => {
  cosim(RMW, 'upd.cpp', ['a_address0:3', 'a_ce0:1', 'a_we0:1', 'a_d0:118', 'a_q0:118', 'b_address0:3', 'b_ce0:1', 'b_we0:1', 'b_d0:118', 'b_q0:118', 'n:32', 'j:32'], LOOPS);
  caught(RMW, 'upd.cpp', ['[21:17]', '[20:16]'], ['(21 downto 17)', '(20 downto 16)'], 'a[');
});

test('#1668 a struct written whole needs no read: a memory of structs only written has no _q0', () => {
  const src = 'struct P { char x; short y; };\nvoid fill(P o[4], int k) {\n  for (int i = 0; i < 4; i++) { o[i].y = k * i; o[i].x = k - i; }\n}\nint main() { P o[4]; int s = 0; for (int c = 1; c < 3; c++) { fill(o, c); for (int i = 0; i < 4; i++) s += o[i].x + o[i].y; } return s == 18 ? 0 : 1; }\n';
  cosim(src, 'fill.cpp', ['o_address0:2', 'o_ce0:1', 'o_we0:1', 'o_d0:24', 'k:32'], []);
});

// a stream of nested structs: read (>>, read() in a declaration, read(v)), written (<<, write), polled (empty)
const STREAM = `#include "ap_int.h"
#include "hls_stream.h"
struct pos { ap_uint<4> x; ap_int<6> y; };
struct item { pos p; ap_uint<3> tag; bool ok; };
void move(hls::stream<item> &a, hls::stream<item> &b, int n) {
  item v;
  for (int i = 0; i < n; i++) {
    a >> v;
    v.p.x = v.p.x + 1;
    v.p.y = -v.p.y;
    if (v.ok) b << v;
    item w = a.read();
    w.tag = w.tag ^ 5;
    b.write(w);
  }
  while (!a.empty()) { item z; a.read(z); z.ok = !z.ok; b.write(z); }
}
int main() {
  hls::stream<item> c, d;
  int s = 0;
  for (int r = 0; r < 3; r++) {
    for (int i = 0; i < 7; i++) { item it; it.p.x = i * 5 + r; it.p.y = 7 - 9 * i; it.tag = i + 2; it.ok = (i + r) & 1; c.write(it); }
    move(c, d, 2 + r % 2);
    while (!d.empty()) { item t = d.read(); s += t.p.x + t.p.y * 3 + t.tag * 7 + t.ok; }
  }
  return s == 0;
}
`;

// (the loops pipelined automatically, #1919: a struct's stream written in a branch, its word's; the while's condition
// polls a)
const STREAM_LOOPS = ['7 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)',
  AUTO(7, 12, 'it accesses a stream in a branch, an access a state'),
  '16 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)',
  AUTO(16, 2, 'it reads or writes a stream, an access a state')];

test('#1668 a stream of nested structs one ap_fifo of 14-bit words (x 0-3, y 4-9, tag 10-12, ok 13), a word a struct read or written; co-simulated in VHDL and Verilog; a field read from other bits found', () => {
  cosim(STREAM, 'move.cpp', ['a_dout:14', 'a_empty_n:1', 'a_read:1', 'b_din:14', 'b_full_n:1', 'b_write:1', 'n:32'], STREAM_LOOPS);
  caught(STREAM, 'move.cpp', ['[9:4]', '[10:5]'], ['(9 downto 4)', '(10 downto 5)'], 'b[');
});

// the pragmas: DISAGGREGATE (a memory per member, no warning), AGGREGATE compact=none / byte / bit (of an array, a
// stream, a scalar struct), a compact not known and a variable not a struct said
const PRAGMAS = `#include "ap_int.h"
#include "hls_stream.h"
struct P { ap_uint<5> a; bool b; short c; };
int f(P x[4], P y[4], hls::stream<P> &s, P &q, P r, int z) {
#pragma HLS DISAGGREGATE variable=y
#pragma HLS AGGREGATE variable=x compact=none
#pragma HLS AGGREGATE variable=s compact=byte
#pragma HLS AGGREGATE variable=r compact=bit
#pragma HLS AGGREGATE variable=q compact=wide
#pragma HLS AGGREGATE variable=z
  int t = 0;
  for (int i = 0; i < 4; i++) { P v = s.read(); x[i].a = v.a + y[i].c; t += x[i].b + y[i].a + v.c; }
  q.c = r.a + r.c + q.c;
  return t + z;
}
int main() {
  P x[4], y[4], q = {1, 0, 2}, r = {3, 1, -4};
  hls::stream<P> s;
  int t = 0;
  for (int c = 0; c < 2; c++) {
    for (int i = 0; i < 4; i++) { x[i].a = i; x[i].b = i & 1; x[i].c = 9 * i; y[i].a = 2 * i; y[i].b = 1; y[i].c = -i; P v = {(unsigned)(i + c), c == 1, (short)(i * 100)}; s.write(v); }
    t += f(x, y, s, q, r, c);
  }
  return t == 0;
}
`;

test('#1668 #pragma HLS AGGREGATE compact=none, byte, bit (an array, a stream, a scalar struct) and DISAGGREGATE (a memory per member, no warning); a compact not known and a variable not a struct said; co-simulated in VHDL and Verilog', () => {
  cosim(PRAGMAS, 'f.cpp', ['x_address0:2', 'x_ce0:1', 'x_we0:1', 'x_d0:32', 'x_q0:32', 'y_a_address0:2', 'y_a_ce0:1', 'y_a_q0:5', 'y_b_address0:2', 'y_b_ce0:1', 'y_c_address0:2', 'y_c_ce0:1', 'y_c_q0:16',
    's_dout:32', 's_empty_n:1', 's_read:1', 'q_i:32', 'q_o:32', 'q_o_ap_vld:1', 'r:22', 'z:32', 'ap_return:32'], [
    '9 warning: #pragma HLS AGGREGATE compact=wide is not one of bit, byte, none and auto: ignored (its default made)',
    '10 warning: #pragma HLS AGGREGATE variable=z: not a struct argument of the top function: ignored',
    AUTO(12, 3, 'it accesses a memory, an access a state')]);
  // (in a function the top calls: accepted and ignored, as before)
  const g = cToHdl('struct P { int a; };\nstatic int g(P p) {\n#pragma HLS AGGREGATE variable=p\n  return p.a;\n}\nint f(P p) { return g(p) + 1; }\n', { file: 'g.cpp' });
  assert.deepEqual(msgs(g), ['3 warning: #pragma HLS AGGREGATE is accepted and ignored: Silinx does not make it']);
});

// (its loops pipelined automatically, #1919: d read and written, one port; q's elements read and one written)
const BRAM_LOOPS = [AUTO(6, 2, "the memory 'd' has one port, accessed 2 times an iteration"), AUTO(7, 3, 'it accesses a memory, an access a state')];
const BRAM = `struct Q { short a; char b; };
int acc(int d[5], Q q[3]) {
#pragma HLS INTERFACE bram port=d
#pragma HLS INTERFACE bram port=q
  int s = 0;
  for (int i = 0; i < 5; i++) { s += d[i]; d[i] = s; }
  for (int i = 0; i < 3; i++) { q[i].b = q[i].a + s; s -= q[2 - i].b; }
  return s;
}
int main() {
  int d[5] = {1, -2, 30, 4, 5};
  Q q[3] = {{100, 1}, {-200, 2}, {300, 3}};
  int s = 0;
  for (int c = 0; c < 2; c++) s += acc(d, q);
  return s == 0;
}
`;

test('#1668 #pragma HLS INTERFACE bram: Vitis HLS\'s BRAM port (an address in bytes, a write enable a byte, words of a power of 2 of bytes, its clock and reset), of an int array and of an array of structs; co-simulated in VHDL and Verilog', () => {
  cosim(BRAM, 'acc.cpp', ['d_Addr_A:32', 'd_EN_A:1', 'd_WEN_A:4', 'd_Din_A:32', 'd_Dout_A:32', 'd_Clk_A:1', 'd_Rst_A:1',
    'q_Addr_A:32', 'q_EN_A:1', 'q_WEN_A:4', 'q_Din_A:32', 'q_Dout_A:32', 'q_Clk_A:1', 'q_Rst_A:1', 'ap_return:32'], BRAM_LOOPS);
});

test('#1668 a BRAM of structs and a stream of structs through the open synthesis (Yosys, Spartan-3E), from the VHDL and from the Verilog: no warning of Yosys', async () => {
  const { compile, elaborate } = await import('../core/compile.js');
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  for (const [src, file, warnings] of [[BRAM, 'acc.cpp', BRAM_LOOPS], [STREAM, 'move.cpp', STREAM_LOOPS]]) {
    for (const lang of LANGS) {
      const g = cToHdl(src, { file, lang });
      assert.deepEqual(msgs(g), warnings, `${file} ${lang}`);
      const design = elaborate(compile([{ path: `${g.top}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: g.hdl }]), g.top);
      const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
      assert.deepEqual(r.warnings, [], `${file} ${lang}`);
      assert.ok(Object.keys(r.cells).length > 0, `${file} ${lang}`);
    }
  }
});
