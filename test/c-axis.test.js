// Silinx HLS: `axis` ports as Vitis HLS makes them (#1894): TVALID, TREADY, TDATA and the side channels, ap_rst_n, on
// the forms of the corpus designs (test/hls-corpus/vitis.json), co-simulated in VHDL and Verilog, warnings asserted;
// what is not made said, its default interface kept.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { cAsm } from '../core/c-asm.js';
import { comparePorts } from '../scripts/hls-vitis.mjs';

const VITIS = JSON.parse(fs.readFileSync(new URL('./hls-corpus/vitis.json', import.meta.url), 'utf8')).designs;
const LANGS = ['vhdl', 'verilog'];
const big = (_, v) => (typeof v === 'bigint' ? String(v) : v);
const msgs = (g) => g.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const names = (g) => g.ports.map((p) => `${p.name}:${p.w}`);
const CTRL = ['ap_clk:1', 'ap_rst_n:1', 'ap_start:1', 'ap_done:1', 'ap_idle:1', 'ap_ready:1'];

const FORMS = {
  'interface-streaming-axis-array-stream-no-side-channel-data': `void example(int A[50], int B[50]) {
#pragma HLS INTERFACE axis port = A
#pragma HLS INTERFACE axis port = B
  int i;
  for (i = 0; i < 50; i++) { B[i] = A[i] + 5; }
}
int main() {
  int a[50], b[50];
  for (int i = 0; i < 50; i++) a[i] = i * 3;
  example(a, b);
  for (int i = 0; i < 50; i++) if (b[i] != i * 3 + 5) return 1;
  return 0;
}
`,
  'interface-aggregation-disaggregation-disaggregation-of-axis-port': `struct A { char c; int i; };
void dut(A in[10], A out[10]) {
#pragma HLS interface axis port = in
#pragma HLS interface axis port = out
#pragma HLS disaggregate variable = in
#pragma HLS disaggregate variable = out
  for (unsigned i = 0; i < 10; i++) {
    out[i].c = in[i].c;
    out[i].i = in[i].i;
  }
}
int main() {
  A a[10], b[10];
  for (int i = 0; i < 10; i++) { a[i].c = i; a[i].i = -1000 * i; }
  dut(a, b);
  for (int i = 0; i < 10; i++) if (b[i].c != i || b[i].i != -1000 * i) return 1;
  return 0;
}
`,
  'interface-streaming-using-array-of-streams': `#include "hls_stream.h"
int dut(hls::stream<int> s_in[3], hls::stream<int> s_out[3]) {
#pragma HLS INTERFACE axis port = s_in
#pragma HLS INTERFACE axis port = s_out
  int sum = 0;
  for (unsigned j = 0; j < 3; j++) {
    for (unsigned i = 0; i < 10; i++) {
      int val = s_in[j].read();
      s_out[j].write(val + 2);
      sum += val;
    }
  }
  return sum;
}
int main() {
  hls::stream<int> a[3], b[3];
  int want = 0;
  for (int j = 0; j < 3; j++) for (int i = 0; i < 10; i++) { a[j].write(i * j); want += i * j; }
  if (dut(a, b) != want) return 1;
  for (int j = 0; j < 3; j++) for (int i = 0; i < 10; i++) if (b[j].read() != i * j + 2) return 1;
  return 0;
}
`,
  'interface-streaming-using-axi-stream-with-side-channel-data': `#include "ap_axi_sdata.h"
#include "hls_stream.h"
typedef ap_axis<32, 2, 5, 6> packet;
void example(hls::stream<packet>& A, hls::stream<packet>& B) {
#pragma HLS INTERFACE axis port = A
#pragma HLS INTERFACE axis port = B
  packet tmp = A.read();
  tmp.data = tmp.data + 5;
  B.write(tmp);
}
int main() {
  hls::stream<packet> a, b;
  for (int i = 0; i < 5; i++) {
    packet p, q;
    p.data = i; p.keep = 15; p.strb = 9; p.user = i & 3; p.last = i == 4; p.id = 21; p.dest = 42;
    a.write(p);
    example(a, b);
    b.read(q);
    if (q.data != i + 5 || q.keep != 15 || q.strb != 9 || q.user != (i & 3) || q.last != (i == 4) || q.id != 21 || q.dest != 42) return 1;
  }
  return 0;
}
`,
  'interface-streaming-axi-stream-custom-side-channel-data-2': `#include "ap_axi_sdata.h"
#include "hls_stream.h"
typedef hls::axis_user<13, (AXIS_ENABLE_USER | AXIS_ENABLE_LAST)> packet;
void example(hls::stream<packet>& A, hls::stream<packet>& B) {
#pragma HLS INTERFACE axis port = A
#pragma HLS INTERFACE axis port = B
  packet tmp = A.read();
  tmp.set_user(tmp.get_user() + 5);
  B.write(tmp);
}
int main() {
  hls::stream<packet> a, b;
  for (int i = 0; i < 5; i++) {
    packet p, q;
    p.user = i * 100; p.last = i == 4;
    a.write(p);
    example(a, b);
    b.read(q);
    if (q.get_user() != i * 100 + 5 || q.last != (i == 4)) return 1;
  }
  return 0;
}
`,
};

test('#1894 the corpus designs, in their forms: the same ports as Vitis HLS\'s (names, directions, widths), co-simulated in VHDL and Verilog, no warnings', () => {
  for (const [name, src] of Object.entries(FORMS)) {
    for (const lang of LANGS) {
      const r = cosimulate(src, { file: 'u.cpp', lang });
      assert.deepEqual([r.errors, r.sim.exitCode, r.pass], [[], 0, true], `${name} ${lang} ${JSON.stringify(r.mismatches, big)}`);
      assert.deepEqual(comparePorts(r.gen.ports, VITIS[name].vitis.ports), { same: true, missing: [], extra: [], differ: [] }, `${name} ${lang}`);
      assert.deepEqual(msgs(r.gen), [], `${name} ${lang}`);
    }
  }
});

test('#1894 the module of the top\'s name has the ports, its state machine under it; the reset inverted, the word split at each channel', () => {
  const src = FORMS['interface-streaming-using-axi-stream-with-side-channel-data'];
  const v = cToHdl(src, { file: 'u.cpp', lang: 'vhdl', top: 'example' });
  assert.equal(v.top, 'example');
  assert.match(v.hdl, /entity example_core is/);
  assert.match(v.hdl, /entity example is[\s\S]*ap_rst_i <= not ap_rst_n;/);
  assert.match(v.hdl, /ap_A_dout <= A_TDEST & A_TID & A_TLAST & A_TUSER & A_TSTRB & A_TKEEP & A_TDATA;/);
  assert.match(v.hdl, /B_TLAST <= ap_B_din\(42\);/);
  assert.match(v.hdl, /B_TDEST <= ap_B_din\(53 downto 48\);/);
  const g = cToHdl(src, { file: 'u.cpp', lang: 'verilog', top: 'example' });
  assert.match(g.hdl, /wire ap_rst_i = ~ap_rst_n;/);
  assert.match(g.hdl, /wire \[53:0\] ap_A_dout = \{A_TDEST, A_TID, A_TLAST, A_TUSER, A_TSTRB, A_TKEEP, A_TDATA\};/);
  assert.match(g.hdl, /assign B_TLAST = ap_B_din\[42\];/);
});

test('#1894 the reset is active low: an HDL that ignores it, or takes it the other way, fails the co-simulation', () => {
  const src = FORMS['interface-streaming-axis-array-stream-no-side-channel-data'];
  const r = cosimulate(src, { file: 'u.cpp', lang: 'verilog', alter: (h) => h.replace('~ap_rst_n', 'ap_rst_n') });
  assert.equal(r.pass, false);
});

test('#1894 a value on the wrong channel is found by the co-simulation', () => {
  const src = FORMS['interface-streaming-using-axi-stream-with-side-channel-data'];
  const r = cosimulate(src, { file: 'u.cpp', lang: 'verilog', alter: (h) => h.replace('assign B_TLAST = ap_B_din[42];', 'assign B_TLAST = ap_B_din[0];') });
  assert.equal(r.pass, false);
  assert.ok(r.mismatches.some((m) => /^B\[/.test(m.port)), JSON.stringify(r.mismatches, big));
});

const BEAT = (decl, pragma = '') => `#include "ap_axi_sdata.h"
#include "hls_stream.h"
${decl}
void f(hls::stream<beat> &a, hls::stream<beat> &b) {
${pragma}  beat t = a.read();
  t.data = t.data + 1;
  b.write(t);
}
int main() {
  hls::stream<beat> x, y;
  beat p, q;
  p.data = 7; p.last = 1;
  x.write(p);
  f(x, y);
  y.read(q);
  return q.data == 8 && q.last == 1 ? 0 : 1;
}
`;

test('#1894 a stream of ap_axiu is axis with no pragma too; a struct of the user\'s with the pragma one TDATA of its word; with none its ap_fifo and ap_rst', () => {
  for (const lang of LANGS) {
    const axiu = cosimulate(BEAT('typedef ap_axiu<8, 0, 0, 0> beat;'), { file: 'u.cpp', lang });
    assert.deepEqual([axiu.errors, axiu.pass], [[], true]);
    assert.deepEqual(names(axiu.gen), [...CTRL, 'a_TDATA:8', 'a_TKEEP:1', 'a_TSTRB:1', 'a_TLAST:1', 'a_TVALID:1', 'a_TREADY:1', 'b_TDATA:8', 'b_TKEEP:1', 'b_TSTRB:1', 'b_TLAST:1', 'b_TREADY:1', 'b_TVALID:1']);
    assert.deepEqual(msgs(axiu.gen), []);
    const own = cosimulate(BEAT('struct beat { ap_uint<8> data; ap_uint<1> last; };', '#pragma HLS INTERFACE axis port=a\n#pragma HLS INTERFACE axis port=b\n'), { file: 'u.cpp', lang });
    assert.deepEqual([own.errors, own.pass], [[], true]);
    assert.deepEqual(names(own.gen), [...CTRL, 'a_TDATA:9', 'a_TVALID:1', 'a_TREADY:1', 'b_TDATA:9', 'b_TREADY:1', 'b_TVALID:1']);
    assert.deepEqual(msgs(own.gen), []);
    const fifo = cosimulate(BEAT('struct beat { ap_uint<8> data; ap_uint<1> last; };'), { file: 'u.cpp', lang });
    assert.deepEqual([fifo.errors, fifo.pass], [[], true]);
    assert.deepEqual(names(fifo.gen), ['ap_clk:1', 'ap_rst:1', 'ap_start:1', 'ap_done:1', 'ap_idle:1', 'ap_ready:1', 'a_dout:9', 'a_empty_n:1', 'a_read:1', 'b_din:9', 'b_full_n:1', 'b_write:1']);
  }
});

test('#1894 an array not accessed in order: its memory kept, said; one array a stream beside it; a reserved name in_r', () => {
  const made = (body) => cToHdl(`void f(int a[4], int b[4]) {\n#pragma HLS INTERFACE axis port=a\n${body}\n}\n`, { file: 'u.cpp' });
  const why = "2 warning: #pragma HLS INTERFACE axis port=a is not made yet: a stream only when read or written once in a loop for (i = 0; i < 4; i++) (its default interface made)";
  for (const body of [
    'for (int i = 3; i >= 0; i--) b[i] = a[i];',      // (backwards)
    'for (int i = 0; i < 3; i++) b[i] = a[i];',       // (not all of it)
    'for (int i = 0; i < 4; i++) b[i] = a[i] + a[i];',   // (twice an element)
    'for (int i = 0; i < 4; i++) if (i) b[i] = a[i];',   // (under a condition)
    'for (int i = 0; i < 4; i++) a[i] += 1;',         // (read and written)
    'b[0] = a[2];',
  ]) {
    const g = made(body);
    assert.equal(g.ok, true, body);
    assert.ok(msgs(g).includes(why), `${body}: ${msgs(g)}`);
    assert.ok(names(g).includes('a_address0:2'), body);
    assert.ok(!names(g).includes('ap_rst_n:1'), body);
  }
  // (b's memory beside a's stream: the reset active low, its memory's ports as they are)
  const r = cosimulate(`void f(int a[4], int b[4]) {
#pragma HLS INTERFACE axis port=a
  for (int i = 0; i < 4; i++) b[3 - i] = a[i];
}
int main() { int x[4] = {1, 2, 3, 4}, y[4]; f(x, y); return y[0] == 4 && y[3] == 1 ? 0 : 1; }
`, { file: 'u.cpp', lang: 'verilog' });
  assert.deepEqual([r.errors, r.pass], [[], true], JSON.stringify(r.mismatches, big));
  assert.ok(names(r.gen).includes('a_TDATA:32') && names(r.gen).includes('b_address0:2') && names(r.gen).includes('ap_rst_n:1'));
  const rn = cToHdl('void f(int in[2], int b[2]) {\n#pragma HLS INTERFACE axis port=in\n  for (int i = 0; i < 2; i++) b[i] = in[i];\n}\n', { file: 'u.cpp' });
  assert.ok(names(rn).includes('in_r_TDATA:32'), String(names(rn)));
  // (a scalar, a pointer: as before)
  assert.deepEqual(msgs(cToHdl('int f(int a) {\n#pragma HLS INTERFACE axis port=a\n  return a + 1;\n}\n', { file: 'u.cpp' })), ['2 warning: #pragma HLS INTERFACE axis port=a is not made yet: ignored (its default interface made)']);
});

test('#1706 a DATAFLOW top\'s axis stream AXI4-Stream ports, its processes\' FIFOs under them (they were kept ap_fifo, #1894), nothing said', () => {
  const src = `#include "hls_stream.h"
void p(hls::stream<int> &a, hls::stream<int> &c) { c.write(a.read() + 1); }
void q(hls::stream<int> &c, hls::stream<int> &b) { b.write(c.read() * 2); }
void f(hls::stream<int> &a, hls::stream<int> &b) {
#pragma HLS INTERFACE axis port=a
#pragma HLS DATAFLOW
  hls::stream<int> c;
  p(a, c);
  q(c, b);
}
`;
  const g = cToHdl(src, { file: 'u.cpp', top: 'f' });
  assert.equal(g.ok, true);
  assert.ok(names(g).includes('a_TDATA:32') && names(g).includes('ap_rst_n:1') && !names(g).includes('a_dout:32'), String(names(g)));
  assert.ok(!msgs(g).some((m) => /INTERFACE axis/.test(m)), String(msgs(g)));
});

test('#1894 the ASM chart of an axis design: the state machine\'s ap_fifo ports, active-high reset', () => {
  const r = cAsm(FORMS['interface-streaming-using-array-of-streams'], { file: 'u.cpp', lang: 'vhdl', top: 'dut' });
  assert.equal(r.ok, true);
  assert.ok(r.model.inputs.some((p) => p.name === 's_in_0_dout'), JSON.stringify(r.model.inputs));
});
