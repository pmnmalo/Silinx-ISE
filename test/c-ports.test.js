// Silinx HLS: the top's block-level ports and port names as Vitis HLS's (#1900, #1902; test/hls-corpus/vitis.json, Vitis
// HLS 2025.2, the reference): a combinational module with no clock nor reset (its test bench none either); ap_ctrl_none, and a data-driven
// top (every process an hls::task), with no ap_start / ap_done / ap_idle / ap_ready, running by itself; a C name Vitis
// HLS reserves renamed <name>_r (pos -> pos_r); arrays of nested structs one memory of their words each (#1668: a_q0 of
// compact=byte, b_q0 of compact=bit, c a BRAM), a struct with a stream in it disaggregated. Each co-simulated in VHDL
// and in Verilog (Silinx's simulator: compiled, elaborated, simulated), its warnings asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate, cosimBench } from '../core/c-cosim.js';
import { simulateC } from '../core/c-interp.js';
import { renamed, portOf, renamedWhy, ctrlNone } from '../core/c-names.js';
import { checkC } from '../core/c-check.js';
import fs from 'node:fs';
import path from 'node:path';
import { comparePorts } from '../scripts/hls-vitis.mjs';
import { sourceDir } from '../scripts/fetch-design-corpus.mjs';
import { unitOf } from './hls-corpus/lib.mjs';

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
    assert.deepEqual([r.sim.exitCode, r.calls > 1], [0, true], lang);
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

const POS_WARNINGS = [
  "1 warning: 'pos' is a name Vitis HLS reserves: it is named pos_r in the module",
  "1 warning: 'neg' is a name Vitis HLS reserves: it is named neg_r in the module",
  "1 warning: 'out' is a reserved word of VHDL or Verilog: it is named out_r in the module"];
const FREE_WARNINGS = ["2 warning: 'in' is a reserved word of VHDL or Verilog: it is named in_r in the module", "2 warning: 'out' is a reserved word of VHDL or Verilog: it is named out_r in the module"];

test('#1902 an argument named pos: its port pos_r (neg neg_r), a warning each, as Vitis HLS; #1900 a combinational top: no ap_clk, its ap_rst unused (#1924), its test bench holding it low; co-simulated in VHDL and Verilog', () => {
  assert.equal(cToHdl(POS, { file: 'pick.c' }).ok, true);
  cosim(POS, 'pick.c', ['ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'sel', 'pos_r', 'neg_r', 'out_r', 'out_r_ap_vld', 'ap_return'], POS_WARNINGS);
  // #1900 combinational: no clock, in the HDL and in the co-simulation's test bench; ap_ctrl_hs: its reset (unused, as
  // Vitis HLS's of latency 0, #1924, held low by the test bench), ap_start / ap_done / ap_idle / ap_ready; ap_ctrl_none,
  // only the data ports
  for (const lang of LANGS) {
    const g = cToHdl(POS, { file: 'pick.c', lang });
    assert.doesNotMatch(g.hdl, /ap_clk/, lang);
    assert.match(g.hdl, /ap_rst/, lang);
    const tb = cosimBench(g, simulateC(POS, { file: 'pick.c' }).calls).text;
    assert.deepEqual([tb.includes('ap_clk'), /^ {2}reg ap_rst = 0;$/m.test(tb), tb.includes('.ap_rst(ap_rst)'), /^ {4}ap_start = 1;$/m.test(tb), tb.includes('.pos_r(pos_r)')], [false, true, true, true, true], lang);
  }
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
  const hdl = cosim(src, 'example.cpp', ['ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'inval1', 'inval2', 'inval3', 'outval1', 'outval1_ap_vld', 'outval2', 'outval2_ap_vld', 'outval3', 'outval3_ap_vld'],
    ['2 warning: #pragma HLS INLINE off is ignored: Silinx inlines every function']);
  // (latency 0: ap_rst, no ap_clk, as Vitis HLS 2025.2 makes function-instantiate, #1924)
  for (const lang of LANGS) assert.doesNotMatch(hdl[lang].hdl, /ap_clk/, lang);
  assert.equal(hdl.vhdl.latency, null);
  const gi = cToHdl(src, { file: 'example.cpp', lang: 'verilog' });
  const tbi = cosimBench(gi, simulateC(src, { file: 'example.cpp' }).calls).text;
  assert.deepEqual([tbi.includes('ap_clk'), tbi.includes('ap_rst'), /^ {4}ap_start = 1;$/m.test(tbi)], [false, true, true]);
  const none = cToHdl('int g(int a) {\n#pragma HLS INTERFACE ap_ctrl_none port=return\n  return a + 1;\n}');
  assert.deepEqual([none.ports.map((p) => p.name), none.diagnostics], [['a', 'ap_return'], []]);
  // sequential (a loop of a count given): the same names
  const seq = POS.replace('  return pos * 2;', '  int s = 0;\n  for (int i = 0; i < sel + 3; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=4\n    s += pos;\n  }\n  return s;');
  const g = cToHdl(seq, { file: 'pick.c' });
  assert.deepEqual(msgs(g), POS_WARNINGS);
  assert.deepEqual([g.sequential, g.ports.map((p) => p.name)], [true, ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'sel', 'pos_r', 'neg_r', 'out_r', 'out_r_ap_vld', 'ap_return']]);
  for (const lang of LANGS) {
    const r = cosimulate(seq, { file: 'pick.c', lang });
    assert.deepEqual([r.errors, r.pass, msgs(r.gen)], [[], true, POS_WARNINGS], lang);
  }
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
  const hdl = cosim(FREE, 'sums.cpp', ['ap_clk', 'ap_rst', 'in_r_dout', 'in_r_empty_n', 'in_r_read', 'out_r_din', 'out_r_full_n', 'out_r_write'], FREE_WARNINGS);
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

test('#1900 a combinational module and the modules with ap_ctrl_none through the open synthesis (Yosys, Spartan-3E), from the VHDL and from the Verilog: no warning of Yosys; the C synthesis\'s own warnings', async () => {
  const { compile, elaborate } = await import('../core/compile.js');
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  const ctrl = { 'pick.c': ['ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready'], 'sums.cpp': ['ap_clk', 'ap_rst'], 'example.cpp': ['ap_clk', 'ap_rst'] };
  const warnings = { 'pick.c': POS_WARNINGS, 'sums.cpp': FREE_WARNINGS, 'example.cpp': [] };
  for (const [src, file] of [[POS, 'pick.c'], [FREE, 'sums.cpp'], [DF, 'example.cpp']]) {
    for (const lang of LANGS) {
      const g = cToHdl(src, { file, lang });
      assert.deepEqual(g.ports.filter((p) => /^ap_(clk|rst|start|done|idle|ready)$/.test(p.name)).map((p) => p.name), ctrl[file], `${file} ${lang}`);
      assert.ok(file !== 'pick.c' || g.ports.some((p) => p.name === 'pos_r'), lang);
      assert.deepEqual(msgs(g), warnings[file], `${file} ${lang}`);
      const design = elaborate(compile([{ path: `${g.top}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: g.hdl }]), g.top);
      const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
      assert.deepEqual(r.warnings, [], `${file} ${lang}`);
      assert.ok(Object.keys(r.cells).length > 0, `${file} ${lang}`);
    }
  }
});

// ------------------------------------------------------------------ against Vitis HLS's ports (test/hls-corpus/vitis.json)
const VITIS = JSON.parse(fs.readFileSync(new URL('./hls-corpus/vitis.json', import.meta.url), 'utf8')).designs;
const vitisPorts = (name) => VITIS[name].vitis.ports;
const ours = (g) => g.ports.map(({ name, dir, w }) => ({ name, dir, w }));

// the corpus designs' forms (their tops' signatures and types, AMD's examples, Apache-2.0), of our own bodies
const FORMS = {
  'modeling-pointers-multiple-pointers': { file: 'pointer_multi.c', warnings: ["5 warning: 'pos' is a name Vitis HLS reserves: it is named pos_r in the module"], src: `#include <stdbool.h>
typedef bool sel_t;
typedef unsigned char din_t;
typedef int dout_t;
dout_t pointer_multi(sel_t sel, din_t pos) {
  static const dout_t a[8] = {1, 2, 3, 4, 5, 6, 7, 8};
  static const dout_t b[8] = {8, 7, 6, 5, 4, 3, 2, 1};
  return sel ? a[pos & 7] : b[pos & 7];
}
int main(void) { int s = 0; for (int i = 0; i < 16; i++) s += pointer_multi(i & 1, i); return s == 80 ? 0 : 1; }
` },
  'modeling-free-running-kernel-remerge-ii4to1': { file: 'example.cpp', warnings: [], src: DF },
  // (its loop pipelined automatically, #1919: a, b and c one port each)
  'interface-aggregation-disaggregation-aggregation-of-nested-structs': { file: 'example.cpp', warnings: ['9 warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=2 made (it accesses a memory, an access a state); #pragma HLS PIPELINE off in it turns that off'], src: `#define N 8
struct T { int m; int n; bool o; };
struct S { int p; T q; };
void top(S a[N], S b[N], S c[N]) {
#pragma HLS interface bram port = c
#pragma HLS interface ap_memory port = a
#pragma HLS aggregate variable = a compact = byte
#pragma HLS aggregate variable = c compact = byte
  for (int i = 0; i < N; i++) {
    c[i].p = a[i].p - b[i].q.n;
    c[i].q.m = a[i].q.m * 2 + b[i].p;
    c[i].q.n = b[i].q.m;
    c[i].q.o = a[i].q.o != b[i].q.o;
  }
}
int main() {
  S a[N], b[N], c[N];
  int t = 0;
  for (int r = 0; r < 2; r++) {
    for (int i = 0; i < N; i++) { a[i].p = i + r; a[i].q.m = -3 * i; a[i].q.n = 0; a[i].q.o = i & 1; b[i].p = 5 - i; b[i].q.m = i * i; b[i].q.n = r - i; b[i].q.o = i > 3; }
    top(a, b, c);
    for (int i = 0; i < N; i++) t += c[i].p + c[i].q.m + c[i].q.n + c[i].q.o;
  }
  return t == 0;
}
` },
  // (its loop until the stream is empty pipelined automatically, #1919: its condition a state of its own)
  'interface-aggregation-disaggregation-auto-disaggregation-of-struct': { file: 'example.cpp', warnings: ['6 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)', '6 warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=2 made (it reads or writes a stream, an access a state); #pragma HLS PIPELINE off in it turns that off'], src: `#include "hls_stream.h"
#define N 10
struct A { hls::stream<int> s_in; long arr[N]; };
long dut(struct A &d) {
  long t = 0;
  while (!d.s_in.empty()) t = t * 3 + d.s_in.read();
  for (unsigned i = 0; i < N; i++) t -= d.arr[i] * i;
  return t;
}
int main() {
  A d;
  long t = 0;
  for (int r = 0; r < 2; r++) {
    for (int i = 0; i < 4 + r; i++) d.s_in.write(i * 7 - r);
    for (int i = 0; i < N; i++) d.arr[i] = 100 - i * r;
    t += dut(d);
  }
  return t == 0;
}
` },
  'task-level-parallelism-data-driven-simple-data-driven': { file: 'test.cpp', warnings: [], src: `#include "hls_task.h"
void splitter(hls::stream<int> &in, hls::stream<int> &odds_buf, hls::stream<int> &evens_buf) {
  int data = in.read();
  if (data % 2 == 0) evens_buf.write(data); else odds_buf.write(data);
}
void odds(hls::stream<int> &in, hls::stream<int> &out) { out.write(in.read() + 1); }
void evens(hls::stream<int> &in, hls::stream<int> &out) { out.write(in.read() + 2); }
void odds_and_evens(hls::stream<int> &in, hls::stream<int> &out1, hls::stream<int> &out2) {
  hls_thread_local hls::stream<int, 5> s1;
  hls_thread_local hls::stream<int, 5> s2;
  hls_thread_local hls::task t1(splitter, in, s1, s2);
  hls_thread_local hls::task t2(odds, s1, out1);
  hls_thread_local hls::task t3(evens, s2, out2);
}
int main() {
  hls::stream<int, 10> in;
  hls::stream<int, 5> out1, out2;
  for (int i = 0; i < 10; i++) in.write(i);
  odds_and_evens(in, out1, out2);
  int s1 = 0, s2 = 0;
  for (int i = 0; i < 5; i++) s1 += out1.read();
  for (int i = 0; i < 5; i++) s2 += out2.read();
  return s1 == 30 && s2 == 30 ? 0 : 1;
}
` },
};

test('#1900 #1902 #1668 the corpus designs Vitis HLS 2025.2 made (vitis.json): ap_ctrl_none, a data-driven top, an argument pos, arrays of nested structs and a struct with a stream, in their forms, the same ports as Vitis HLS\'s (names, directions, widths); co-simulated in VHDL and Verilog', () => {
  for (const [name, { file, src, warnings }] of Object.entries(FORMS)) {
    for (const lang of LANGS) {
      const r = cosimulate(src, { file, lang });
      assert.deepEqual([r.errors, r.sim.exitCode, r.pass], [[], 0, true], `${name} ${lang} ${JSON.stringify(r.mismatches, big)}`);
      assert.deepEqual(comparePorts(ours(r.gen), vitisPorts(name)), { same: true, missing: [], extra: [], differ: [] }, `${name} ${lang}`);
      assert.deepEqual(msgs(r.gen), warnings, `${name} ${lang}`);
    }
  }
});

// (the corpus itself, when fetched: npm run test:hls fetches it into .cache/, never committed)
const manifest = JSON.parse(fs.readFileSync(new URL('./hls-corpus/manifest.json', import.meta.url), 'utf8'));
const corpusDir = sourceDir(manifest.sources['vitis-hls-examples']);
const fetched = fs.existsSync(corpusDir) ? false : 'the HLS corpus is not fetched (npm run test:hls fetches it)';
const corpusGen = (name) => {
  const d = manifest.designs.find((x) => x.name === name);
  const texts = Object.fromEntries([...d.files, ...d.tb, ...d.headers].map((f) => [f, fs.readFileSync(path.join(corpusDir, f), 'utf8')]));
  const { unit, headers } = unitOf(d, texts);
  return cToHdl(unit, { file: d.language === 'c' ? 'unit.c' : 'unit.cpp', headers, top: d.top, lang: 'vhdl' });
};

// (each corpus design's warnings: those of its pragmas Silinx does not make as Vitis HLS, its pos renamed)
const CORPUS_WARNINGS = {
  'modeling-pointers-multiple-pointers': ["19 warning: 'pos' is a name Vitis HLS reserves: it is named pos_r in the module"],
  // (each loop's reads and writes in one state, #1919: the II asked met; mux's and demux's streams chosen by an index,
  // each access made only on its branch)
  'modeling-free-running-kernel-remerge-ii4to1': ['30 warning: #pragma HLS LATENCY is accepted and ignored: Silinx does not make it'],
  'task-level-parallelism-data-driven-simple-data-driven': [],
  // (its loop's II=3 met, #1919: an iteration two states)
  'interface-aggregation-disaggregation-aggregation-of-nested-structs': [],
  'interface-aggregation-disaggregation-auto-disaggregation-of-struct': ['22 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)', '22 warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=2 made (it reads or writes a stream, an access a state); #pragma HLS PIPELINE off in it turns that off'],
  'interface-memory-rom-lookup-table-math': [],
  'modeling-fixed-point-sqrt': ['77 warning: assert is ignored by synthesis (the C simulation checks it)'],
  'modeling-using-arbitrary-precision-casting': [],
  'modeling-using-cpp-templates': [],
  'pipelining-functions-function-instantiate': ['19 warning: #pragma HLS INLINE off is ignored: Silinx inlines every function',
    '20 warning: #pragma HLS FUNCTION_INSTANTIATE is accepted and ignored: Silinx does not make it'],
};

test('#1900 #1902 #1668 the corpus designs themselves (AMD\'s sources, when fetched): the five with Vitis HLS\'s ports; the combinational ones with no clock, their reset unused (#1924); each one\'s warnings', { skip: fetched }, () => {
  for (const name of Object.keys(FORMS)) {
    const g = corpusGen(name);
    assert.deepEqual(comparePorts(ours(g), vitisPorts(name)), { same: true, missing: [], extra: [], differ: [] }, name);
    assert.deepEqual(msgs(g), CORPUS_WARNINGS[name], name);
  }
  for (const name of ['interface-memory-rom-lookup-table-math', 'modeling-fixed-point-sqrt', 'modeling-using-arbitrary-precision-casting', 'modeling-using-cpp-templates', 'pipelining-functions-function-instantiate']) {
    const g = corpusGen(name);
    assert.deepEqual(msgs(g), CORPUS_WARNINGS[name], name);
    // (a combinational top: ap_rst, no ap_clk, as Vitis HLS's of latency 0, #1924; scheduled over cycles as Vitis HLS's: not yet)
    assert.deepEqual([g.sequential, g.ports.filter((p) => /^ap_(clk|rst)$/.test(p.name)).map((p) => p.name)], [false, ['ap_rst']], name);
    assert.deepEqual(g.ports.slice(0, 5).map((p) => p.name), ['ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready'], name);
  }
});
