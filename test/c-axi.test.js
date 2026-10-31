// Silinx HLS: AXI interfaces (#1893). #pragma HLS INTERFACE s_axilite: the ports as Vitis HLS 2025.2's
// (test/hls-corpus/vitis.json), the registers' map, each design co-simulated through a model of the bus in VHDL and in
// Verilog (compiled, elaborated, simulated), its warnings asserted; the control and interrupt registers by a test bench of
// their own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { simulate } from '../core/compile.js';
import { comparePorts } from '../scripts/hls-vitis.mjs';

const LANGS = ['vhdl', 'verilog'];
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const msgs = (gen) => gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const vitis = JSON.parse(fs.readFileSync(new URL('./hls-corpus/vitis.json', import.meta.url), 'utf8'));
const portsOf = (name) => (vitis.designs || vitis)[name].vitis.ports;

function cosim(src, warnings, top) {
  for (const lang of LANGS) {
    const r = cosimulate(src, { file: 'a.cpp', lang, top });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang} ${JSON.stringify(r.mismatches, big)}`);
    assert.deepEqual(msgs(r.gen), warnings, lang);
  }
  return cToHdl(src, { file: 'a.cpp', top });
}

const OFFSETS = `void example(char* a, char* b, char* c) {
#pragma HLS INTERFACE s_axilite port = a bundle = BUS_A offset = 0x20
#pragma HLS INTERFACE s_axilite port = b bundle = BUS_A offset = 0x28
#pragma HLS INTERFACE s_axilite port = c bundle = BUS_A offset = 0x30
#pragma HLS INTERFACE s_axilite port = return bundle = BUS_A
  *c += *a + *b;
}
int main() { char a = 5, b = 10, c = 1; example(&a, &b, &c); a = -3; example(&a, &b, &c); return c == 13 ? 0 : 1; }
`;

test('#1893 s_axilite with offset=: the ports of Vitis HLS (the corpus design), its registers at their offsets; co-simulated', () => {
  const g = cosim(OFFSETS, [], 'example');
  const diff = comparePorts(g.ports, portsOf('interface-register-using-axi-lite-with-user-defined-offset'));
  assert.deepEqual(diff, { same: true, missing: [], extra: [], differ: [] });
  assert.deepEqual(g.axi.lite[0].regs.map((r) => [r.port, r.off]), [['a', 0x20], ['b', 0x28], ['c_i', 0x30], ['c_o', 0x38]]);
});

test('#1893 a sequential function: ap_return and an output register, a value of 64 bits two words, control the default bundle', () => {
  const g = cosim(`long long f(long long x, int n, int *y) {
#pragma HLS INTERFACE s_axilite port=x
#pragma HLS INTERFACE s_axilite port=n
#pragma HLS INTERFACE s_axilite port=y
#pragma HLS INTERFACE s_axilite port=return
  long long s = 0;
  for (int i = 0; i < n; i++) s += x;
  *y = n + 1;
  return s;
}
int main() { int y; if (f(0x100000001LL, 3, &y) != 0x300000003LL || y != 4) return 1; if (f(-1, 2, &y) != -2) return 1; return 0; }
`, ['7 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)'], 'f');
  assert.deepEqual(g.axi.lite[0].regs.map((r) => [r.port, r.off, r.words]), [['ap_return', 0x10, 2], ['x', 0x18, 2], ['n', 0x24, 1], ['y', 0x2c, 1]]);
  assert.equal(g.axi.lite[0].aw, 6);
  assert.ok(!g.ports.some((p) => ['ap_start', 'ap_rst', 'ap_return', 'x', 'y'].includes(p.name)));
  assert.ok(g.ports.some((p) => p.name === 'interrupt'));
});

test('#1893 no port=return: the block protocol stays ports (ap_rst_n, no interrupt), the arguments registers', () => {
  const g = cosim(`int f(int x) {
#pragma HLS INTERFACE s_axilite port=x
  int s = 0;
  for (int i = 0; i < 4; i++) s += x;
  return s;
}
int main() { return f(3) == 12 && f(-1) == -4 ? 0 : 1; }
`, [], 'f');
  assert.deepEqual(g.ports.filter((p) => !p.name.startsWith('s_axi_')).map((p) => p.name), ['ap_clk', 'ap_rst_n', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'ap_return']);
});

test('#1893 an array with s_axilite keeps its memory, said', () => {
  cosim(`void f(int a[4]) {
#pragma HLS INTERFACE s_axilite port=a
#pragma HLS INTERFACE s_axilite port=return
  for (int i = 0; i < 4; i++) a[i] += 1;
}
int main() { int a[4] = { 1, 2, 3, 4 }; f(a); return a[3] == 5 ? 0 : 1; }
`, ['2 warning: #pragma HLS INTERFACE s_axilite port=a: only a scalar or a pointer to one is made a register: its interface kept', '4 warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=2 made (the memory \'a\' has one port, accessed 2 times an iteration); #pragma HLS PIPELINE off in it turns that off'], 'f');
});

test('#1893 a DATAFLOW function: its processes inside the module with the bus', () => {
  const g = cosim(`#include <hls_stream.h>
void twice(hls::stream<int> &in, hls::stream<int> &out) { for (int i = 0; i < 3; i++) out.write(2 * in.read()); }
void plus(hls::stream<int> &in, hls::stream<int> &out, int k) { for (int i = 0; i < 3; i++) out.write(in.read() + k); }
void f(hls::stream<int> &in, hls::stream<int> &out, int k) {
#pragma HLS DATAFLOW
#pragma HLS INTERFACE s_axilite port=k
#pragma HLS INTERFACE s_axilite port=return
  hls::stream<int, 4> c;
  twice(in, c);
  plus(c, out, k);
}
int main() { hls::stream<int> a, b; for (int i = 0; i < 3; i++) a.write(i); f(a, b, 5); int s = 0; for (int i = 0; i < 3; i++) s += b.read(); return s == 21 ? 0 : 1; }
`, [], 'f');
  assert.ok(g.ports.some((p) => p.name === 'interrupt') && g.ports.some((p) => p.name === 's_axi_control_AWADDR'));
});

test('#1893 a difference in the HDL is found through the bus', () => {
  const r = cosimulate(OFFSETS, { file: 'a.cpp', top: 'example', lang: 'verilog', alter: (h) => h.replace(/assign (s_axi_BUS_A_RDATA) = (\w+);/, "assign $1 = $2 ^ 32'd1;") });
  assert.equal(r.pass, false);
});

// the registers themselves, by a hand-written test bench: start, ap_done cleared when read, ap_idle, ap_ready, the interrupts
const BENCH = `module tb;
  reg clk = 0, rstn = 0, awv = 0, wv = 0, arv = 0, rr = 1, br = 1; reg [5:0] awa = 0, ara = 0; reg [31:0] wd = 0; reg [3:0] ws = 4'hf;
  wire awr, wr, arr, rv, bv, irq; wire [31:0] rd; wire [1:0] rresp, bresp;
  reg [31:0] v;
  f dut(.ap_clk(clk), .ap_rst_n(rstn), .interrupt(irq), .s_axi_control_AWVALID(awv), .s_axi_control_AWREADY(awr), .s_axi_control_AWADDR(awa), .s_axi_control_WVALID(wv), .s_axi_control_WREADY(wr), .s_axi_control_WDATA(wd), .s_axi_control_WSTRB(ws),
    .s_axi_control_ARVALID(arv), .s_axi_control_ARREADY(arr), .s_axi_control_ARADDR(ara), .s_axi_control_RVALID(rv), .s_axi_control_RREADY(rr), .s_axi_control_RDATA(rd), .s_axi_control_RRESP(rresp), .s_axi_control_BVALID(bv), .s_axi_control_BREADY(br), .s_axi_control_BRESP(bresp));
  always #5 clk = ~clk;
  task w(input [5:0] a, input [31:0] d); begin awa = a; awv = 1; @(negedge clk); while (!awr) @(negedge clk); @(posedge clk); #1 awv = 0; wd = d; wv = 1; @(negedge clk); while (!wr) @(negedge clk); @(posedge clk); #1 wv = 0; @(negedge clk); while (!bv) @(negedge clk); @(posedge clk); #1; end endtask
  task r(input [5:0] a); begin ara = a; arv = 1; @(negedge clk); while (!arr) @(negedge clk); @(posedge clk); #1 arv = 0; @(negedge clk); while (!rv) @(negedge clk); v = rd; @(posedge clk); #1; end endtask
  initial begin
    #22 rstn = 1; @(posedge clk); #1;
    r(0); $display("idle %h", v);
    w(4, 1); w(8, 3); w(6'h18, 5);
    r(6'h18); $display("x %h", v);
    w(0, 1);
    repeat (40) @(posedge clk); #1;
    $display("irq %b", irq);
    r(12); $display("isr %h", v);
    r(0); $display("done %h", v);
    r(0); $display("cleared %h", v);
    r(6'h10); $display("ret %h", v);
    w(12, 1); $display("irq %b", irq);
    w(12, 2); #1 $display("irq %b", irq);
    w(0, 8'h81);
    repeat (40) @(posedge clk); #1;
    r(0); $display("auto %h", v[7]);
    $finish;
  end
endmodule`;

test('#1893 the control and interrupt registers, as UG1399 says: ap_done cleared when read, the status toggled, auto_restart', () => {
  const src = `int f(int x) {
#pragma HLS INTERFACE s_axilite port=x
#pragma HLS INTERFACE s_axilite port=return
  int s = 0;
  for (int i = 0; i < 4; i++) s += x;
  return s;
}`;
  for (const lang of LANGS) {
    const g = cToHdl(src, { file: 'a.cpp', top: 'f', lang });
    assert.deepEqual(msgs(g), [], lang);
    const r = simulate([{ path: `f.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: g.hdl }, { path: 'tb.v', text: BENCH }], 'tb', { until: 1e7 });
    assert.deepEqual(r.errors, [], lang);
    const log = r.sim.log.map((e) => String(e.text).trim());
    assert.deepEqual(log.filter((l) => /^(idle|x|irq|isr|done|cleared|ret|auto) /.test(l)), ['idle 00000004', 'x 00000005', 'irq 1', 'isr 00000003', 'done 0000000e', 'cleared 00000004', 'ret 00000014', 'irq 1', 'irq 0', 'auto 1'], lang);
  }
});
