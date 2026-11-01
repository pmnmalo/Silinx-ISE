// Silinx HLS (#1706, core/c-processes-word.js): a stream of structs of a DATAFLOW top is one word as Vitis HLS makes it,
// its processes' members' FIFOs behind an adapter; an axis stream of a DATAFLOW top AXI4-Stream ports, inside an AXI
// interface's module too; a top's memory both ports inside them. Co-simulated in VHDL and Verilog, warnings asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { wordPorts } from '../core/c-processes-word.js';
import { comparePorts } from '../scripts/hls-vitis.mjs';
import fs from 'node:fs';

const VITIS = JSON.parse(fs.readFileSync(new URL('./hls-corpus/vitis.json', import.meta.url), 'utf8')).designs;

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const names = (g) => g.ports.map((p) => `${p.name}:${p.w}`);
const msgs = (g) => g.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);

const AXIS = `#include "ap_axi_sdata.h"
#include "hls_stream.h"
typedef ap_axiu<32, 0, 0, 0> pkt;
struct item { int v; ap_uint<1> last; };
static void get(hls::stream<pkt> &a, hls::stream<item> &o) {
#pragma HLS PIPELINE off
  for (int i = 0; i < 5; i++) { pkt p = a.read(); item x = {(int)p.data + 1, p.last}; o.write(x); }
}
static void put(hls::stream<item> &c, hls::stream<pkt> &b) {
#pragma HLS PIPELINE off
  for (int i = 0; i < 5; i++) { item x = c.read(); pkt p; p.data = x.v * 2; p.keep = 15; p.strb = 5; p.last = x.last; b.write(p); }
}
void top(hls::stream<pkt> &a, hls::stream<pkt> &b) {
#pragma HLS INTERFACE axis port=a
#pragma HLS INTERFACE axis port=b
#pragma HLS DATAFLOW
  hls::stream<item, 4> c;
  get(a, c);
  put(c, b);
}
int main() {
  hls::stream<pkt> a, b;
  int s = 0;
  for (int c = 0; c < 2; c++) {
    for (int i = 0; i < 5; i++) { pkt p; p.data = i * 7 + c; p.keep = 15; p.strb = 15; p.last = i == 4; a.write(p); }
    top(a, b);
    for (int i = 0; i < 5; i++) { pkt p = b.read(); s += p.data + p.last + p.strb; }
  }
  return s != 362;
}
`;
const AXIS_PORTS = ['ap_clk:1', 'ap_rst_n:1', 'ap_start:1', 'ap_done:1', 'ap_idle:1', 'ap_ready:1',
  'a_TDATA:32', 'a_TKEEP:4', 'a_TSTRB:4', 'a_TLAST:1', 'a_TVALID:1', 'a_TREADY:1', 'b_TDATA:32', 'b_TKEEP:4', 'b_TSTRB:4', 'b_TLAST:1', 'b_TREADY:1', 'b_TVALID:1'];

test('#1706 an axis stream of a DATAFLOW top: AXI4-Stream ports, each member of its struct read once a word; co-simulated in VHDL and Verilog, no warning', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(AXIS, { file: 'top.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(msgs(r.gen), []);
    assert.deepEqual(names(r.gen), AXIS_PORTS);
    const mods = [...r.gen.hdl.matchAll(lang === 'vhdl' ? /^entity (\w+) is/gm : /^module (\w+)/gm)].map((m) => m[1]);
    assert.deepEqual(mods, ['get', 'put', 'top_core_ap_fifo0', 'top_core_ap_fifo1', 'top_core_ap_word0', 'top_core_ap_word1', 'top_core', 'top']);
  }
});

test('#1706 a stream of structs of a DATAFLOW top with no pragma: one word on its ap_fifo ports, as a sequential top\'s (#1668)', () => {
  const src = AXIS.replace('typedef ap_axiu<32, 0, 0, 0> pkt;', 'struct pkt { int data; ap_uint<4> keep; ap_uint<4> strb; ap_uint<1> last; };').replace(/#pragma HLS INTERFACE axis port=\w\n/g, '');
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'top.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(msgs(r.gen), []);
    assert.deepEqual(names(r.gen), ['ap_clk:1', 'ap_rst:1', 'ap_start:1', 'ap_done:1', 'ap_idle:1', 'ap_ready:1', 'a_dout:41', 'a_empty_n:1', 'a_read:1', 'b_din:41', 'b_full_n:1', 'b_write:1']);
  }
});

test('#1706 a member no process uses: its bits 0 in an output word, no wait for it', () => {
  const src = AXIS.replace(' p.keep = 15; p.strb = 5;', '').replace('s += p.data + p.last + p.strb;', 's += p.data + p.last;').replace('s != 362', 's != 312');
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'top.cpp', lang, maxCycles: 5000 });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
  }
});

test('#1706 the adapter\'s ports: a clock, a word and each member, the stall\'s ap_ce when there is one', () => {
  assert.deepEqual(wordPorts({ dir: 'in', w: 5, members: [{ off: 0, w: 4 }, { off: 4, w: 1 }] }).map((p) => p[0]), ['ap_clk', 'ap_rst', 'w_dout', 'w_empty_n', 'w_read', 'm0_dout', 'm0_empty_n', 'm0_read', 'm1_dout', 'm1_empty_n', 'm1_read']);
  assert.deepEqual(wordPorts({ dir: 'out', w: 1, members: [{ off: 0, w: 1 }] }, true).map((p) => p[0]), ['ap_clk', 'ap_rst', 'ap_ce', 'w_din', 'w_full_n', 'w_write', 'm0_din', 'm0_full_n', 'm0_write']);
});

test('#1706 an array with axis in a DATAFLOW top stays a memory, said; a stream with it AXI4-Stream', () => {
  const src = `#include "hls_stream.h"
static void p(int x[2], hls::stream<int> &o) { for (int i = 0; i < 2; i++) o.write(x[i]); }
static void q(hls::stream<int> &i, hls::stream<int> &o) { for (int k = 0; k < 2; k++) o.write(i.read()); }
void t(int x[2], hls::stream<int> &o) {
#pragma HLS INTERFACE axis port=x
#pragma HLS INTERFACE axis port=o
#pragma HLS DATAFLOW
  hls::stream<int> c;
  p(x, c);
  q(c, o);
}
`;
  const g = cToHdl(src, { file: 'u.cpp', top: 't' });
  assert.equal(g.ok, true);
  assert.deepEqual(msgs(g), ['5 warning: #pragma HLS INTERFACE axis port=x is not made yet: ignored (its default interface made)']);
  assert.ok(names(g).includes('o_TDATA:32') && names(g).includes('x_q0:32') && names(g).includes('ap_rst_n:1'), String(names(g)));
});

test('#1706 axis and s_axilite together: the stream AXI4-Stream ports around the AXI interfaces\' module, a DATAFLOW top\'s memory both ports; co-simulated', () => {
  const src = `#include "ap_axi_sdata.h"
#include "hls_stream.h"
typedef ap_axiu<32, 0, 0, 0> pkt;
static void p(hls::stream<pkt> &a, hls::stream<int> &o) { for (int i = 0; i < 3; i++) { pkt v = a.read(); o.write(v.data); } }
static void q(hls::stream<int> &i, int m[3]) { for (int k = 0; k < 3; k++) m[k] = i.read() + 1; }
void top(hls::stream<pkt> &a, int m[3]) {
#pragma HLS INTERFACE axis port=a
#pragma HLS INTERFACE s_axilite port=return
#pragma HLS DATAFLOW
  hls::stream<int> c;
  p(a, c);
  q(c, m);
}
int main() {
  hls::stream<pkt> a;
  int m[3];
  for (int i = 0; i < 3; i++) { pkt v; v.data = i + 5; v.keep = 15; v.strb = 15; v.last = i == 2; a.write(v); }
  top(a, m);
  return m[2] != 8;
}
`;
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'top.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    const ns = names(r.gen);
    for (const n of ['a_TDATA:32', 'a_TVALID:1', 'a_TREADY:1', 'ap_rst_n:1', 'interrupt:1', 'm_d0:32', 'm_we0:1', 'm_q0:32', 'm_q1:32', 'm_d1:32']) assert.ok(ns.includes(n), `${n} in ${ns}`);
    assert.ok(!ns.includes('ap_start:1') && !ns.some((x) => /_dout|ap_rst:/.test(x)), String(ns));
  }
});

test('#1706 the corpus\'s forms, as Vitis HLS 2025.2\'s ports: an axis stream, an m_axi memory and s_axilite in a DATAFLOW top; autorestart\'s top, a memory both its ports', () => {
  const master = `#include "ap_axi_sdata.h"
#include "ap_int.h"
#include "hls_stream.h"
typedef ap_axiu<64, 0, 0, 0> trans_pkt;
struct data { ap_int<64> word; ap_int<1> last; };
static void take(hls::stream<trans_pkt> &in, hls::stream<data> &o, hls::stream<int> &n) {
  trans_pkt v;
  int k = 0;
  do { v = in.read(); data d = {v.data, v.last}; o.write(d); k++; } while (!v.last);
  n.write(k);
}
static void store(hls::stream<data> &i, hls::stream<int> &n, ap_uint<64> *m) {
  int k = n.read();
  for (int j = 0; j < k; j++) { data d = i.read(); m[j] = d.word; }
}
void example(hls::stream<trans_pkt> &inStreamTop, ap_uint<64> outTop[1024]) {
#pragma HLS INTERFACE axis register_mode = both register port = inStreamTop
#pragma HLS INTERFACE m_axi max_write_burst_length = 256 latency = 10 depth = 1024 bundle = gmem0 port = outTop
#pragma HLS INTERFACE s_axilite port = outTop bundle = control
#pragma HLS INTERFACE s_axilite port = return bundle = control
#pragma HLS DATAFLOW
  hls::stream<data, 8> buf;
  hls::stream<int, 2> count;
  take(inStreamTop, buf, count);
  store(buf, count, outTop);
}
int main() {
  hls::stream<trans_pkt> s;
  static ap_uint<64> m[1024];
  for (int i = 0; i < 4; i++) { trans_pkt p; p.data = i + 3; p.keep = -1; p.strb = -1; p.last = i == 3; s.write(p); }
  example(s, m);
  return m[3] != 6;
}
`;
  const restart = `#define N 8
typedef unsigned char data_t;
static void a(data_t *in, data_t *out) { for (int i = 0; i < N; i++) out[i] = in[i] * 3; }
static void b(data_t *in, data_t *out) { for (int i = 0; i < N; i++) out[i] = in[i] + 25; }
void diamond(data_t vecIn[100], data_t vecOut[100]) {
  data_t c[100];
#pragma HLS dataflow
#pragma HLS INTERFACE s_axilite port=return autorestart
  a(vecIn, c);
  b(c, vecOut);
}
int main() {
  data_t x[100], y[100];
  for (int i = 0; i < 100; i++) x[i] = i;
  diamond(x, y);
  return y[2] != 31;
}
`;
  const nonBus = (ps) => ps.filter((p) => !/^(m|s)_axi_/.test(p.name));
  for (const lang of ['vhdl', 'verilog']) {
    const m = cosimulate(master, { file: 'example.cpp', top: 'example', lang, maxCycles: 20000 });
    assert.deepEqual(m.errors, []);
    assert.equal(m.pass, true, JSON.stringify(m.mismatches, big));
    assert.deepEqual(comparePorts(m.gen.ports, VITIS['interface-streaming-axi-stream-to-master'].vitis.ports), { same: true, missing: [], extra: [], differ: [] }, lang);
    const r = cosimulate(restart, { file: 'diamond.cpp', top: 'diamond', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(msgs(r.gen), []);
    const want = nonBus(VITIS['task-level-parallelism-control-driven-channels-autorestart'].vitis.ports);
    assert.deepEqual(comparePorts(nonBus(r.gen.ports), want), { same: true, missing: [], extra: [], differ: [] }, lang);
  }
});
