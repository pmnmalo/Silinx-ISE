// Silinx HLS: the top's block-level ports and port names as Vitis HLS's (#1900, #1902; test/hls-corpus/vitis.json, Vitis
// HLS 2025.2, the reference): a combinational ap_ctrl_hs module's ap_rst (no ap_clk); ap_ctrl_none, and a data-driven
// top (every process an hls::task), with no ap_start / ap_done / ap_idle / ap_ready, running by itself; a C name Vitis
// HLS reserves renamed <name>_r (pos -> pos_r). Each co-simulated in VHDL and in Verilog (Silinx's simulator: compiled,
// elaborated, simulated), its warnings asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { renamed, portOf, renamedWhy, ctrlNone } from '../core/c-names.js';
import { checkC } from '../core/c-check.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const msgs = (gen) => gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const LANGS = ['vhdl', 'verilog'];

/** Co-simulated in both languages: passes, with these ports and warnings; the generated HDL of each. */
function cosim(src, file, ports, warnings) {
  const hdl = {};
  for (const lang of LANGS) {
    const r = cosimulate(src, { file, lang });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang} ${JSON.stringify(r.mismatches, big)}`);
    assert.ok(r.calls > 1, lang);
    assert.deepEqual(r.gen.ports.map((p) => p.name), ports, lang);
    assert.deepEqual(msgs(r.gen), warnings, lang);
    hdl[lang] = { hdl: r.gen.hdl, latency: r.latency };
  }
  return hdl;
}

test('#1902 the names Vitis HLS reserves: a reserved word of VHDL or Verilog, pos and neg (any case); the others kept', () => {
  assert.deepEqual(['pos', 'neg', 'POS', 'in', 'out', 'signal', 'config', 'size', 'index', 'position', 'p'].map(renamed), [true, true, true, true, true, true, true, false, false, false, false]);
  assert.deepEqual(['pos', 'in', 'size'].map(portOf), ['pos_r', 'in_r', 'size']);
  assert.equal(renamedWhy('pos'), "'pos' is a name Vitis HLS reserves: it is named pos_r in the module");
  assert.equal(renamedWhy('out'), "'out' is a reserved word of VHDL or Verilog: it is named out_r in the module");
  assert.equal(renamedWhy('x'), null);
});

test('#1900 ap_ctrl_none on the top: the pragma in its forms (ap_ctrl_none, mode=ap_ctrl_none, spaced); another mode or port is not', () => {
  const top = (pragma) => checkC(`void f(int a, int *y) {\n${pragma}\n  *y = a;\n}`, 'f.c').funcs.get('f');
  assert.equal(ctrlNone(top('#pragma HLS INTERFACE ap_ctrl_none port=return')), true);
  assert.equal(ctrlNone(top('#pragma HLS INTERFACE mode=ap_ctrl_none port=return')), true);
  assert.equal(ctrlNone(top('#pragma HLS INTERFACE mode = ap_ctrl_none port = return')), true);
  assert.equal(ctrlNone(top('#pragma HLS INTERFACE ap_ctrl_hs port=return')), false);
  assert.equal(ctrlNone(top('#pragma HLS INTERFACE ap_none port=y')), false);
  assert.equal(ctrlNone(top('')), false);
});

// (modeling-pointers-multiple-pointers's: an argument pos, Vitis HLS's port pos_r)
const POS = `int pick(int sel, unsigned char pos, int neg, int *out) {
  *out = sel ? pos + neg : pos - neg;
  return pos * 2;
}
int main() {
  int o, s = 0;
  for (int i = 0; i < 4; i++) s += pick(i & 1, 10 * i, i - 2, &o) + o;
  return s == 182 ? 0 : 1;
}
`;

test('#1902 an argument named pos: its port pos_r (neg neg_r), a warning each, as Vitis HLS; co-simulated in VHDL and Verilog', () => {
  assert.equal(cToHdl(POS, { file: 'pick.c' }).ok, true);
  cosim(POS, 'pick.c', ['ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'ap_rst', 'sel', 'pos_r', 'neg_r', 'out_r', 'out_r_ap_vld', 'ap_return'], [
    "1 warning: 'pos' is a name Vitis HLS reserves: it is named pos_r in the module",
    "1 warning: 'neg' is a name Vitis HLS reserves: it is named neg_r in the module",
    "1 warning: 'out' is a reserved word of VHDL or Verilog: it is named out_r in the module"]);
  // sequential (a loop of a count given): the same names
  const seq = POS.replace('  return pos * 2;', '  int s = 0;\n  for (int i = 0; i < sel + 3; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=4\n    s += pos;\n  }\n  return s;');
  const g = cToHdl(seq, { file: 'pick.c' });
  assert.deepEqual([g.sequential, g.ports.map((p) => p.name)], [true, ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'sel', 'pos_r', 'neg_r', 'out_r', 'out_r_ap_vld', 'ap_return']]);
  for (const lang of LANGS) {
    const r = cosimulate(seq, { file: 'pick.c', lang });
    assert.deepEqual([r.errors, r.pass], [[], true], lang);
  }
});

test('#1900 a combinational top (ap_ctrl_hs): ap_rst after the protocol\'s, no ap_clk (Vitis HLS\'s latency 0: pipelining-functions-function-instantiate); ap_ctrl_none: none of them', () => {
  // (function-instantiate's)
  const src = `char foo(char inval, char incr) {
#pragma HLS INLINE OFF
  return inval + incr;
}
void top(char inval1, char inval2, char inval3, char *outval1, char *outval2, char *outval3) {
  *outval1 = foo(inval1, 0);
  *outval2 = foo(inval2, 1);
  *outval3 = foo(inval3, 100);
}
int main() {
  char a, b, c;
  for (int i = 0; i < 5; i++) top(i, 2 * i, -i, &a, &b, &c);
  return a == 4 && b == 9 && c == 96 ? 0 : 1;
}
`;
  const hdl = cosim(src, 'example.cpp', ['ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'ap_rst', 'inval1', 'inval2', 'inval3', 'outval1', 'outval1_ap_vld', 'outval2', 'outval2_ap_vld', 'outval3', 'outval3_ap_vld'],
    ['2 warning: #pragma HLS INLINE off is ignored: Silinx inlines every function']);
  assert.match(hdl.vhdl.hdl, /    ap_ready : out std_logic;\n    ap_rst : in std_logic;\n/);
  assert.match(hdl.verilog.hdl, /  output wire ap_ready,\n  input  wire ap_rst,\n/);
  assert.equal(hdl.vhdl.latency, null);
  const none = cToHdl('int g(int a) {\n#pragma HLS INTERFACE ap_ctrl_none port=return\n  return a + 1;\n}');
  assert.deepEqual([none.ports.map((p) => p.name), none.diagnostics], [['a', 'ap_return'], []]);
});

// a sequential function with ap_ctrl_none: running by itself, a call after the other (Vitis HLS's free-running kernel)
const FREE = `#include "hls_stream.h"
void sums(hls::stream<int> &in, hls::stream<int> &out) {
#pragma HLS INTERFACE ap_ctrl_none port=return
  int s = 0;
  for (int i = 0; i < 3; i++) s += in.read();
  out.write(s);
}
int main() {
  hls::stream<int> in, out;
  int t = 0;
  for (int c = 0; c < 4; c++) {
    for (int i = 0; i < 3; i++) in.write(c * 10 + i);
    sums(in, out);
    t += out.read();
  }
  return t == 192 ? 0 : 1;
}
`;

test('#1900 ap_ctrl_none on a sequential top with a stream: no ap_start / ap_done / ap_idle / ap_ready (no warning of it), its machine starting its next call by itself; co-simulated in VHDL and Verilog', () => {
  const hdl = cosim(FREE, 'sums.cpp', ['ap_clk', 'ap_rst', 'in_r_dout', 'in_r_empty_n', 'in_r_read', 'out_r_din', 'out_r_full_n', 'out_r_write'], [
    "2 warning: 'in' is a reserved word of VHDL or Verilog: it is named in_r in the module", "2 warning: 'out' is a reserved word of VHDL or Verilog: it is named out_r in the module"]);
  assert.match(hdl.vhdl.hdl, /  signal ap_start : std_logic := '1';\n  signal ap_done, ap_idle, ap_ready : std_logic;\n/);
  assert.match(hdl.verilog.hdl, /  wire ap_start = 1'b1;\n  wire ap_done, ap_idle, ap_ready;\n/);
  assert.ok(hdl.verilog.latency.max > 0 && hdl.verilog.latency.max < 100, JSON.stringify(hdl.verilog.latency));
  // (with no stream the calls cannot be told apart, as Vitis HLS's co-simulation: its block protocol made, said)
  const g = cToHdl('int f(int n) {\n#pragma HLS INTERFACE ap_ctrl_none port=return\n  static int k = 0;\n  k += n;\n  return k;\n}');
  assert.deepEqual([g.ports.map((p) => p.name), msgs(g)], [['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'n', 'ap_return'], ['2 warning: ap_ctrl_none: this function is sequential, it needs its block protocol: ap_ctrl_hs is made']]);
});

// (modeling-free-running-kernel-remerge-ii4to1's form: DATAFLOW with ap_ctrl_none, the pragma spaced)
const DF = `#include "hls_stream.h"
void inc(hls::stream<int> &a, hls::stream<int> &b) { for (int i = 0; i < 2; i++) b.write(a.read() + 1); }
void dbl(hls::stream<int> &a, hls::stream<int> &b) { for (int i = 0; i < 2; i++) b.write(a.read() * 2); }
void example(hls::stream<int> &in, hls::stream<int> &out) {
#pragma HLS INTERFACE mode = ap_ctrl_none port = return
#pragma HLS DATAFLOW
  hls::stream<int, 4> mid;
  inc(in, mid);
  dbl(mid, out);
}
int main() {
  hls::stream<int> in, out;
  int t = 0;
  for (int c = 0; c < 3; c++) {
    in.write(c); in.write(c + 5);
    example(in, out);
    int hi = out.read();
    t += hi * 100 + out.read();
  }
  return t == 1242 ? 0 : 1;
}
`;

test('#1900 a DATAFLOW top with ap_ctrl_none: its clock and reset only, its processes started again once all are done; co-simulated in VHDL and Verilog; without a stream argument its block protocol made, said', () => {
  const hdl = cosim(DF, 'example.cpp', ['ap_clk', 'ap_rst', 'in_r_dout', 'in_r_empty_n', 'in_r_read', 'out_r_din', 'out_r_full_n', 'out_r_write'], []);
  assert.match(hdl.vhdl.hdl, /  signal ap_start : std_logic := '1';\n  signal ap_done, ap_idle, ap_ready : std_logic;\n/);
  assert.match(hdl.verilog.hdl, /  wire ap_start = 1'b1;\n  wire ap_done, ap_idle, ap_ready;\n/);
  const arr = `void fill(int a[4], int k) { for (int i = 0; i < 4; i++) a[i] = k + i; }
void copy(int a[4], int b[4]) { for (int i = 0; i < 4; i++) b[i] = a[i]; }
void t(int k, int b[4]) {
#pragma HLS INTERFACE ap_ctrl_none port=return
#pragma HLS DATAFLOW
  int a[4];
  fill(a, k);
  copy(a, b);
}
`;
  const g = cToHdl(arr, { file: 't.c' });
  assert.deepEqual([g.ok, g.ports.slice(0, 6).map((p) => p.name), msgs(g)], [true, ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready'], ['4 warning: ap_ctrl_none: this function is sequential, it needs its block protocol: ap_ctrl_hs is made']]);
});

test('#1900 the modules with ap_rst not read and with ap_ctrl_none through the open synthesis (Yosys, Spartan-3E), from the VHDL and from the Verilog: no warning', async () => {
  const { compile, elaborate } = await import('../core/compile.js');
  const { synthesizeOpen } = await import('../core/synth-open.js');
  const { yosysNode } = await import('../core/synth-open-node.js');
  for (const [src, file] of [[POS, 'pick.c'], [FREE, 'sums.cpp'], [DF, 'example.cpp']]) {
    for (const lang of LANGS) {
      const g = cToHdl(src, { file, lang });
      const design = elaborate(compile([{ path: `${g.top}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: g.hdl }]), g.top);
      const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
      assert.deepEqual(r.warnings, [], `${file} ${lang}`);
      assert.ok(Object.keys(r.cells).length > 0, `${file} ${lang}`);
    }
  }
});
