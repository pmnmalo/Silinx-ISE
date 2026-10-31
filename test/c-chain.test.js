// Silinx HLS: the block protocol ap_ctrl_chain (#1965), as Vitis HLS 2025.2 makes it: ap_ctrl_hs's ports and ap_continue,
// ap_done (and ap_return) held until ap_continue is 1, no new call meanwhile, ap_ready one cycle a call. Vitis's ports and
// latencies below are those of the same sources through Vitis HLS 2025.2 (csynth.xml and the co-simulation's report).
// Copyright 2026 Pedro Maló
// SPDX-License-Identifier: AGPL-3.0-only
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { cAsm } from '../core/c-asm.js';
import { simulate } from '../core/compile.js';
import { ctrlChain, ctrlNone } from '../core/c-names.js';
import { checkC } from '../core/c-check.js';
import { comparePorts } from '../scripts/hls-vitis.mjs';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const msgs = (gen) => gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const LANGS = ['vhdl', 'verilog'];
const PRAGMA = '#pragma HLS INTERFACE ap_ctrl_chain port=return';
const CHAIN = ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_continue', 'ap_idle', 'ap_ready'];
const UNKNOWN = (line) => `${line} warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)`;

const SEQ = `int top(int n, int *o) {
${PRAGMA}
  int s = 0;
  for (int i = 0; i < n; i++) s += i + 1;
  *o = s * 2;
  return s;
}
int main() {
  int o, bad = 0;
  for (int n = 0; n < 5; n++) { int r = top(n, &o); if (r != n * (n + 1) / 2 || o != 2 * r) bad++; }
  return bad;
}
`;
const COMB = `int top(int a) {
${PRAGMA}
  return a + 1;
}
int main() { return top(1) == 2 && top(41) == 42 ? 0 : 1; }
`;
const STREAM = `#include "hls_stream.h"
void top(hls::stream<int> &in, hls::stream<int> &out, int n) {
${PRAGMA}
  for (int i = 0; i < n; i++) out.write(in.read() + 1);
}
int main() {
  hls::stream<int> a, b;
  for (int i = 0; i < 6; i++) a.write(i);
  top(a, b, 3); top(a, b, 3);
  for (int i = 0; i < 6; i++) if (b.read() != i + 1) return 1;
  return 0;
}
`;
const FLOW = `#include "hls_stream.h"
static void p1(int n, hls::stream<int> &s) { for (int i = 0; i < n; i++) s.write(i + 1); }
static void p2(int n, hls::stream<int> &s, hls::stream<int> &out) { for (int i = 0; i < n; i++) out.write(s.read() * 2); }
void top(int n, hls::stream<int> &out) {
${PRAGMA}
#pragma HLS DATAFLOW
  hls::stream<int> s;
#pragma HLS STREAM variable=s depth=8
  p1(n, s);
  p2(n, s, out);
}
int main() {
  hls::stream<int> o;
  top(4, o); top(2, o);
  int want[] = {2, 4, 6, 8, 2, 4};
  for (int i = 0; i < 6; i++) if (o.read() != want[i]) return 1;
  return 0;
}
`;

const RESERVED = ["2 warning: 'in' is a reserved word of VHDL or Verilog: it is named in_r in the module", "2 warning: 'out' is a reserved word of VHDL or Verilog: it is named out_r in the module"];

test('#1965 the pragma in its forms is ap_ctrl_chain; another mode or port is not', () => {
  const fn = (p) => checkC(`void f(int a) {\n${p}\n}`).funcs.get('f');
  for (const p of [PRAGMA, '#pragma HLS INTERFACE mode=ap_ctrl_chain port=return', '#pragma HLS INTERFACE mode = ap_ctrl_chain port = return']) {
    assert.equal(ctrlChain(fn(p)), true, p);
    assert.equal(ctrlNone(fn(p)), false, p);
  }
  for (const p of ['#pragma HLS INTERFACE ap_ctrl_hs port=return', '#pragma HLS INTERFACE ap_ctrl_none port=return', '#pragma HLS INTERFACE ap_ctrl_chain port=a']) assert.equal(ctrlChain(fn(p)), false, p);
});

test('#1965 a sequential, a combinational and a stream function: the ports in Vitis HLS\'s order; co-simulated in VHDL and Verilog with ap_continue 0 a while after each call; the latency beside Vitis\'s', () => {
  const cases = [
    { name: 'seq', src: SEQ, file: 'seq.cpp', warnings: [UNKNOWN(4)], data: ['n', 'o', 'o_ap_vld', 'ap_return'], vitis: { min: 3, max: 3 }, latency: { min: 3, max: 7, avg: 5 } },
    { name: 'comb', src: COMB, file: 'comb.cpp', warnings: [], data: ['a', 'ap_return'], vitis: { min: 0, max: 0 }, latency: { min: 0, max: 0, avg: 0 } },
    { name: 'stream', src: STREAM, file: 'stream.cpp', warnings: [...RESERVED, UNKNOWN(4)], data: ['in_r_dout', 'in_r_empty_n', 'in_r_read', 'out_r_din', 'out_r_full_n', 'out_r_write', 'n'], vitis: { min: 4, max: 4 }, latency: { min: 8, max: 8, avg: 8 } },
  ];
  for (const c of cases) for (const lang of LANGS) {
    const r = cosimulate(c.src, { file: c.file, lang });
    assert.deepEqual([r.errors, r.pass, r.sim.exitCode], [[], true, 0], `${c.name} ${lang} ${JSON.stringify(r.mismatches, big)}`);
    assert.deepEqual(r.gen.ports.map((p) => p.name), [...CHAIN, ...c.data], `${c.name} ${lang}`);
    assert.deepEqual(msgs(r.gen), c.warnings, `${c.name} ${lang}`);
    assert.deepEqual(r.latency, c.latency, `${c.name} ${lang}`);
    // (the schedule is Silinx's own, never under Vitis's: Vitis makes seq's sum a closed form, stream's loop pipelined)
    assert.ok(r.latency.min >= c.vitis.min, `${c.name} ${lang}`);
  }
  // (a combinational top: the latency exactly Vitis's, 0, ap_done in ap_start's cycle)
  assert.equal(cases[1].latency.max, cases[1].vitis.max);
});

test('#1965 the combinational top has a clock only with ap_ctrl_chain: ap_ctrl_hs and ap_ctrl_none as they were', () => {
  const hs = cToHdl(COMB.replace(PRAGMA, '#pragma HLS INTERFACE ap_ctrl_hs port=return'), { file: 'c.cpp' });
  const none = cToHdl(COMB.replace(PRAGMA, '#pragma HLS INTERFACE ap_ctrl_none port=return'), { file: 'c.cpp' });
  assert.deepEqual(hs.ports.map((p) => p.name), ['ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'a', 'ap_return']);
  assert.deepEqual(none.ports.map((p) => p.name), ['a', 'ap_return']);
  assert.deepEqual([msgs(hs), msgs(none)], [[], []]);
});

test('#1965 a pointer output of a combinational top: its _ap_vld only in the call\'s cycle', () => {
  const src = `void top(int a, int *o) {\n${PRAGMA}\n  *o = a + 1;\n}\nint main() { int o; top(1, &o); top(2, &o); return o == 3 ? 0 : 1; }\n`;
  for (const lang of LANGS) {
    const r = cosimulate(src, { file: 'p.cpp', lang });
    assert.deepEqual([r.errors, r.pass, msgs(r.gen)], [[], true, []], `${lang} ${JSON.stringify(r.mismatches, big)}`);
    assert.deepEqual(r.gen.ports.map((p) => p.name), [...CHAIN, 'a', 'o', 'o_ap_vld'], lang);
  }
});

// (the corpus's using_stream_of_blocks: Vitis HLS's ports of its diamond, vitis.json; its top's form, of our own bodies)
const DIAMOND = `#include "hls_stream.h"
typedef unsigned char data_t;
static void funcA(hls::stream<data_t> &in, hls::stream<data_t> &c1) { for (int i = 0; i < 4; i++) c1.write(in.read() * 3); }
static void funcD(hls::stream<data_t> &c1, hls::stream<data_t> &out) { for (int i = 0; i < 4; i++) out.write(c1.read() + 25); }
void diamond(hls::stream<data_t> &vecIn, hls::stream<data_t> &vecOut) {
#pragma HLS INTERFACE ap_ctrl_chain port = return
  hls::stream<data_t> c1;
#pragma HLS dataflow
  funcA(vecIn, c1);
  funcD(c1, vecOut);
}
int main() {
  hls::stream<data_t> a, b;
  for (int i = 0; i < 8; i++) a.write(i);
  diamond(a, b); diamond(a, b);
  for (int i = 0; i < 8; i++) if (b.read() != (data_t)(i * 3 + 25)) return 1;
  return 0;
}
`;

test('#1965 DATAFLOW with ap_ctrl_chain: the top\'s ap_done held until ap_continue; the corpus\'s diamond with Vitis HLS\'s ports (vitis.json), co-simulated in VHDL and Verilog', () => {
  const vitis = JSON.parse(fs.readFileSync(new URL('./hls-corpus/vitis.json', import.meta.url), 'utf8')).designs['task-level-parallelism-control-driven-channels-using-stream-of-blocks'].vitis.ports;
  for (const lang of LANGS) {
    const d = cosimulate(DIAMOND, { file: 'diamond.cpp', lang });
    assert.deepEqual([d.errors, d.pass, d.sim.exitCode], [[], true, 0], `${lang} ${JSON.stringify(d.mismatches, big)}`);
    assert.deepEqual(comparePorts(d.gen.ports.map(({ name, dir, w }) => ({ name, dir, w })), vitis), { same: true, missing: [], extra: [], differ: [] }, lang);
    assert.deepEqual(msgs(d.gen), [], lang);
    const f = cosimulate(FLOW, { file: 'flow.cpp', lang });
    assert.deepEqual([f.errors, f.pass, f.sim.exitCode], [[], true, 0], `${lang} ${JSON.stringify(f.mismatches, big)}`);
    // (Vitis HLS's ports of this source, its protocol's in another order; its latency 8, processes overlapping)
    assert.deepEqual([...f.gen.ports.map((p) => p.name)].sort(), ['n', 'out_r_din', 'out_r_full_n', 'out_r_write', 'ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_ready', 'ap_idle', 'ap_continue'].sort(), lang);
    assert.ok(f.latency.min >= 8, `${lang} ${JSON.stringify(f.latency)}`);
    assert.deepEqual(msgs(f.gen), [UNKNOWN(2), UNKNOWN(3)], lang);
  }
});

test('#1965 a process with its own ap_ctrl_chain in a region: its ap_continue tied, the top\'s protocol ap_ctrl_hs', () => {
  const src = FLOW.replace(PRAGMA, '').replace('static void p2(int n, hls::stream<int> &s, hls::stream<int> &out) {', `static void p2(int n, hls::stream<int> &s, hls::stream<int> &out) {\n${PRAGMA}\n`);
  for (const lang of LANGS) {
    const r = cosimulate(src, { file: 'flow.cpp', lang });
    assert.deepEqual([r.errors, r.pass], [[], true], `${lang} ${JSON.stringify(r.mismatches, big)}`);
    assert.equal(r.gen.ports.some((p) => p.name === 'ap_continue'), false, lang);
  }
});

// (the co-simulation sees it: an HDL that does not hold ap_done, or starts while it is held, is a mismatch)
test('#1965 the co-simulation fails on an HDL that does not hold ap_done or starts a call while it is held', () => {
  const noHold = { vhdl: (h) => h.replace(" or ap_done_reg = '1' else", ' else'), verilog: (h) => h.replace(' || ap_done_reg;', ';') };
  const noBlock = { vhdl: (h) => h.replace(" and ap_done_reg = '0' then", ' then'), verilog: (h) => h.replace(' && !ap_done_reg) begin', ') begin') };
  for (const lang of LANGS) for (const [why, f] of [['ap_done not held', noHold[lang]], ['a call while held', noBlock[lang]]]) {
    const alter = (h) => { const t = f(h); assert.notEqual(t, h, `${lang} ${why}: the HDL changed`); return t; };
    const r = cosimulate(SEQ, { file: 'seq.cpp', lang, alter });
    assert.equal(r.pass, false, `${lang} ${why}`);
    assert.deepEqual(r.mismatches.at(-1).port, 'ap_ctrl_chain', `${lang} ${why}`);
  }
});

// a bench of its own: the cycles of ap_continue against a reference written from Vitis HLS's RTL
const TIMING = (top, a) => `module tb;
  reg ap_clk = 0, ap_rst = 1, ap_start = 0, ap_continue = 0;
  wire ap_done, ap_idle, ap_ready; ${a.decl}
  ${top} dut(.ap_clk(ap_clk), .ap_rst(ap_rst), .ap_start(ap_start), .ap_done(ap_done), .ap_continue(ap_continue), .ap_idle(ap_idle), .ap_ready(ap_ready)${a.conn});
  always #5 ap_clk = ~ap_clk;
  task show; begin $display("%b %b %b", ap_done, ap_ready, ap_idle); end endtask
  task tick; begin @(posedge ap_clk); #1; show; end endtask
  initial begin
    #12 ap_rst = 0; #4;
    ap_start = 1; #1; show;      // the call's cycle
    tick; ap_start = 0; #1; show; // ap_done held, ap_ready gone
    tick; ap_continue = 1; #1; show; // still held, until the edge
    tick; ap_continue = 1; ap_start = 1; #1; show; // with ap_continue 1: a one-cycle ap_done
    tick; ap_start = 0; ap_continue = 0; #1; show;
    tick; $finish;
  end
endmodule`;

test('#1965 ap_continue\'s timing of a combinational top, cycle by cycle, as Vitis HLS\'s RTL: ap_done in the call\'s cycle and held; with ap_continue 1 one cycle only', () => {
  for (const lang of LANGS) {
    const g = cToHdl(COMB, { file: 'c.cpp', lang });
    const r = simulate([{ path: `top.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: g.hdl }, { path: 'tb.v', text: TIMING('top', { decl: 'reg [31:0] a = 1; wire [31:0] ap_return;', conn: ', .a(a), .ap_return(ap_return)' }) }], 'tb', { until: 1e6 });
    assert.deepEqual(r.errors, [], lang);
    const rows = r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[01x] [01x] [01x]$/.test(s));
    assert.deepEqual(rows, [
      '1 1 0',   // ap_start 1: the call, ap_done and ap_ready at once
      '1 0 0',   // after the edge, ap_continue 0: ap_done held, ap_ready gone, ap_start 1 not a new call, not idle
      '1 0 1',   // ap_start 0: idle, ap_done held
      '1 0 1',
      '1 0 1',   // ap_continue 1: held until the edge
      '0 0 1',   // taken
      '1 1 0',   // ap_continue 1 and ap_start 1: a call
      '1 1 0',   // the next one, a call a cycle
      '0 0 1',   // ap_start 0: nothing held
      '0 0 1',
    ], lang);
  }
});

test('#1965 the ASM chart of a function with ap_ctrl_chain: ap_continue among the inputs, no start while ap_done is held', () => {
  const r = cAsm(SEQ, { file: 'seq.cpp' });
  assert.equal(r.ok, true);
  assert.deepEqual(msgs(r), []);
  assert.ok(r.model.nodes.some((n) => n.type === 'decision' && n.cond === 'ap_start && !ap_done_reg'));
  assert.deepEqual(r.model.nodes.find((n) => n.name === 'DONE').actions, ['ap_done = 1', 'ap_ready = 1', 'ap_done_reg = !ap_continue']);
  assert.ok(r.model.inputs.some((p) => p.name === 'ap_continue'));
});

test('#1965 the modules with ap_ctrl_chain through the open synthesis (Yosys, Spartan-3E), from the VHDL and from the Verilog: no warning of Yosys', async () => {
  const { compile, elaborate } = await import('../core/compile.js');
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  for (const [src, file] of [[SEQ, 'seq.cpp'], [COMB, 'comb.cpp'], [DIAMOND, 'diamond.cpp']]) for (const lang of LANGS) {
    const g = cToHdl(src, { file, lang });
    const design = elaborate(compile([...(g.files || []), { path: `${g.top}.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: g.hdl }]), g.top);
    const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
    assert.deepEqual(r.warnings, [], `${file} ${lang}`);
    assert.ok(Object.keys(r.cells).length > 0, `${file} ${lang}`);
  }
});
