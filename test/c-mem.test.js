// Silinx HLS, arrays and memories (#1527): core/c-mem.js with core/c-fsmd.js. An array argument is Vitis HLS's
// ap_memory (its ports, their widths and order); a large local, static or global array a memory inside the module
// (a block RAM's: VHDL's array signal, Verilog's reg array), a constant one a ROM. Each design: its test bench run
// by the C simulation and compiled with cc (the same output), and co-simulated in VHDL and Verilog (the memory
// argument modelled in the test bench, compared after each call): a pass, with no warning. An HDL that writes a
// wrong value: the word that differs reported. What is not supported said where it is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { simulateC } from '../core/c-interp.js';
import { CC, compiledRun } from './c-helpers.js';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
/** The design co-simulated in both languages: a pass, its warnings (none by default); the C simulation's output cc's. */
function passes(src, file, { calls, warnings = [] } = {}) {
  if (CC) assert.equal(simulateC(src, { file }).output, compiledRun(src).output);
  const out = [];
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file, lang });
    assert.deepEqual(r.errors, [], lang);
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), warnings, lang);
    assert.equal(r.pass, true, `${lang}: ${JSON.stringify(r.mismatches, big)}`);
    if (calls !== undefined) assert.equal(r.calls, calls);
    out.push(r);
  }
  return out;
}

const ARGS = `#include <stdio.h>
#pragma HLS TOP name=TOPNAME
int sum(int a[8], int n) {
  int s = 0;
  for (int i = 0; i < 8; i++) if (i < n) s += a[i];
  return s;
}
void scale(short v[6], short k) {
  for (int i = 0; i < 6; i++) v[i] = v[i] * k + v[5 - i];
}
int main(void) {
  int t[8] = {3, -1, 4, 1, -5, 9, 2, 6};
  short u[6] = {1, 2, 3, 4, 5, 6};
  for (int n = 0; n <= 8; n += 3) printf("%d ", sum(t, n));
  scale(u, 3); scale(u, -2);
  for (int i = 0; i < 6; i++) printf("%d ", u[i]);
  printf("\\n");
  return 0;
}
`;

test('#1527 an array argument is ap_memory: address0 (its size\'s bits) and ce0; we0 and d0 when written; q0 when read; in the argument\'s place', () => {
  const ports = (top) => cToHdl(ARGS.replace('TOPNAME', top), { file: `${top}.c` }).ports.map((p) => `${p.name}:${p.dir}${p.w}`).join(' ');
  assert.equal(ports('sum'), 'ap_clk:in1 ap_rst:in1 ap_start:in1 ap_done:out1 ap_idle:out1 ap_ready:out1 a_address0:out3 a_ce0:out1 a_q0:in32 n:in32 ap_return:out32');
  assert.equal(ports('scale'), 'ap_clk:in1 ap_rst:in1 ap_start:in1 ap_done:out1 ap_idle:out1 ap_ready:out1 v_address0:out3 v_ce0:out1 v_we0:out1 v_d0:out16 v_q0:in16 k:in16');
  // a write only: no q0
  assert.equal(cToHdl('void fill(unsigned char m[100], unsigned char x) {\n  for (int i = 0; i < 100; i++) m[i] = x + i;\n}').ports.filter((p) => p.param === 'm').map((p) => `${p.name}:${p.dir}${p.w}`).join(' '), 'm_address0:out7 m_ce0:out1 m_we0:out1 m_d0:out8');
});

test('#1527 co-simulation of array arguments (read; read and written, one access a cycle): a pass in VHDL and Verilog, the memory compared after each call; an HDL writing a wrong value: the word that differs', () => {
  const [sum] = passes(ARGS.replace('TOPNAME', 'sum'), 'sum.c', { calls: 3 });
  // a read a state, its value the next; the loop pipelined automatically (#1919): the next read in the state of an
  // add (made whatever i < n, its value then unused), the loop's head and step in it
  assert.deepEqual(sum.latency, { min: 11, max: 11, avg: 11 });
  // (v[i] and v[5 - i] read, v[i] written: one port, a state each, #1919)
  passes(ARGS.replace('TOPNAME', 'scale'), 'scale.c', { calls: 2, warnings: ['9 warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=3 made (it accesses a memory, an access a state); #pragma HLS PIPELINE off in it turns that off'] });
  const r = cosimulate(ARGS.replace('TOPNAME', 'scale'), { file: 'scale.c', lang: 'verilog', alter: (h) => h.replace(/assign v_d0 = (\w+);/, 'assign v_d0 = $1 ^ 16\'h0100;') });
  assert.equal(r.pass, false);
  const where = r.mismatches.map((m) => `${m.call} ${m.port}`);
  assert.ok(where.includes('1 v[0]') && where.every((x) => /^[12] v\[[0-5]\]$/.test(x)), where.join(', '));
  assert.equal(r.mismatches[0].expected, BigInt.asUintN(16, 3n * 1n + 6n));
});

test('#1527 memories inside the module: a static array (a histogram), a global FIFO, a constant table in a sequential function (a ROM): VHDL\'s array signal and Verilog\'s reg array, a pass', () => {
  const HIST = `#include <stdio.h>
#include <stdbool.h>
int hist(unsigned char x, bool clear) {
  static unsigned short h[256];
  if (clear) { for (int i = 0; i < 256; i++) h[i] = 0; return 0; }
  h[x]++;
  return h[x] + h[(x + 1) & 255];
}
int main(void) { hist(0, 1); for (int k = 0; k < 40; k++) printf("%d ", hist((k * 7) & 15, 0)); printf("\\n"); return 0; }
`;
  const [hv, hl] = passes(HIST, 'hist.c', { calls: 41 });
  assert.match(hv.gen.hdl, /type ap_m_h_t is array \(0 to 255\) of std_logic_vector\(15 downto 0\);/);
  assert.match(hl.gen.hdl, /reg \[15:0\] ap_m_h \[0:255\];/);
  const FIFO = `#include <stdio.h>
#include <stdbool.h>
static int buf[128];
static unsigned char head, tail;
int fifo(int op, int v, bool *ok) {
  if (op == 1) { if ((unsigned char)(tail + 1) % 128 == head) { *ok = 0; return 0; } buf[tail] = v; tail = (tail + 1) % 128; *ok = 1; return 0; }
  if (head == tail) { *ok = 0; return 0; }
  int r = buf[head]; head = (head + 1) % 128; *ok = 1; return r;
}
int main(void) { bool ok; for (int k = 0; k < 10; k++) fifo(1, k * 11 - 20, &ok); for (int k = 0; k < 12; k++) { int r = fifo(0, 0, &ok); printf("%d/%d ", r, ok); } printf("\\n"); return 0; }
`;
  passes(FIFO, 'fifo.c', { calls: 22 });
  const tbl = Array.from({ length: 100 }, (_, k) => (k * k * 7 + 3) % 251).join(', ');
  const ROM = `#include <stdio.h>
const unsigned char SQ[100] = {${tbl}};
unsigned total(unsigned char n) {
  unsigned s = 0;
  for (unsigned char i = 0; i < n; i++) {
#pragma HLS LOOP_TRIPCOUNT max=100
    s += SQ[i];
  }
  return s;
}
int main(void) { for (int n = 0; n <= 100; n += 33) printf("%u ", total(n)); printf("\\n"); return 0; }
`;
  const [rv, rl] = passes(ROM, 'rom.c', { calls: 4 });
  assert.match(rv.gen.hdl, /signal ap_m_SQ : ap_m_SQ_t := \(0 => "00000011", 1 => "00001010", /);
  assert.doesNotMatch(rv.gen.hdl, /ap_m_SQ\(to_integer\([^)]*\)\) <=/);   // (never written: a ROM)
  assert.match(rl.gen.hdl, /ap_m_SQ\[1\] = 8'b00001010;/);
});

test('#1527 what memories do not support yet: said where it is', () => {
  const msgs = (src) => cToHdl(src).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(msgs('void f(int a[8], int x) {\n  for (int i = 0; i < 8; i++) a[i] = x++;\n}'), ["2 a write of the memory 'a' with another side effect in it (++, --, an assignment, a call): write them as statements of their own"]);
  assert.deepEqual(msgs('int f(int a[8], int i) {\n  return a[i++];\n}'), ['2 a return reading a memory with another side effect in it (++, --, an assignment, a call): write them as statements of their own']);
  // (a memory passed to a function: the call inlined, #1632)
  assert.deepEqual(msgs('int g(int b[8]) { return b[0]; }\nint f(int a[8]) {\n  return g(a);\n}'), []);
  assert.deepEqual(msgs('int f(int a[8], int k) {\n  switch (k) { case 0: return a[0]; default: return 0; }\n}'), ["2 a 'switch' that accesses a memory is not supported yet in a sequential module (write the access as a statement of its own before it)"]);
  assert.deepEqual(msgs('int f(int n) {\n  int t[100] = {1, 2, 3};\n  for (int k = 0; k < n; k++) {\n#pragma HLS LOOP_TRIPCOUNT max=4\n    t[k] = 5;\n  }\n  return t[n];\n}'), ["2 't': a memory initialized with { … } and written: make it static (its values kept between calls) or const, or initialize it with a loop"]);
  assert.deepEqual(msgs('const int T[100] = {1};\nint f(int i) {\n  for (int k = 0; k < i; k++) {\n#pragma HLS LOOP_TRIPCOUNT max=4\n    T[k] = 0;\n  }\n  return 0;\n}'), ["5 'T' is constant: it cannot be written"]);
});

test('#1527 a memory inside the module is a block RAM: the open synthesis (Yosys, Spartan-3E) makes it a RAMB16, from the VHDL and from the Verilog, with no warning', async () => {
  const src = 'int hist(unsigned char x, bool clear) {\n  static unsigned short h[256];\n  if (clear) { for (int i = 0; i < 256; i++) h[i] = 0; return 0; }\n  h[x]++;\n  return h[x] + h[(x + 1) & 255];\n}\n';
  for (const lang of ['vhdl', 'verilog']) {
    const g = cToHdl(src, { file: 'hist.c', lang });
    const design = elaborate(compile([{ path: `hist.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: g.hdl }]), 'hist');
    const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
    assert.equal(r.cells.RAMB16_S18, 1, lang);
    assert.deepEqual(r.warnings, [], lang);
  }
});
