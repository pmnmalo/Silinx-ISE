// Silinx HLS (#1684): a pointer to structs indexed (A *p; p[i].x, p[i] copied, auto x = p[i]) an array of structs, its
// members' pointers indexed (core/c-pointer.js's memories, #1599); a pointer argument passed to a function that indexes
// it a memory too; a pragma naming a struct one per member, said once; a struct copied as the statement of an if, a
// for, a while, an else, a do. The C simulation as cc's; the co-simulation in VHDL and Verilog, its ports and warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { noCC, compiledRun } from './c-helpers.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const SRC = `#include <stdio.h>
struct px { short v; unsigned char k; };
static void load(struct px *src, struct px dst[6]) {
  for (int i = 0; i < 6; i++) dst[i] = src[i];
}
static void store(struct px src[6], struct px *dst) {
  for (int i = 0; i < 6; i++) { dst[i].v = src[i].v * 3; dst[i].k = src[i].k + i; }
}
int blend(struct px *in, struct px *out, struct px *w, int g) {
#pragma HLS INTERFACE ap_memory port=in depth=6
#pragma HLS INTERFACE ap_memory port=out depth=6
  struct px buf[6];
  load(in, buf);
  int s = 0;
  for (int i = 0; i < 6; i++) { buf[i].v += g; s += buf[i].k + w[i & 1].v; }
  store(buf, out);
  return s;
}
int main(void) {
  struct px a[6], b[6], w[2] = {{7, 1}, {-9, 2}};
  for (int i = 0; i < 6; i++) { a[i].v = 100 * i - 250; a[i].k = 40 * i; }
  int t = 0;
  for (int c = 0; c < 3; c++) {
    t += blend(a, b, w, c - 1);
    for (int i = 0; i < 6; i++) { printf("%d/%d ", b[i].v, b[i].k); a[i] = b[i]; }
    printf("| %d\\n", t);
  }
  return 0;
}
`;

test('#1684 pointers to structs indexed, passed on and copied: the C simulation as cc\'s', { skip: noCC }, () => {
  const sim = simulateC(SRC, { file: 'blend.c' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  assert.equal(sim.output, compiledRun(SRC).output);
});

test('#1684 co-simulated in VHDL and Verilog: one memory of the struct\'s words (#1668), its depth the pragma\'s (port= the struct\'s name) or 1024 (said once, of the top function only)', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC, { file: 'blend.c', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    // (in and out reserved words: in_r and out_r, the struct's port's name; a word: v at bits 0-15, k 16-23)
    assert.deepEqual(r.gen.ports.filter((p) => /^(in|out|w)_/.test(p.name)).map((p) => `${p.name}:${p.w}`), [
      'in_r_address0:3', 'in_r_ce0:1', 'in_r_q0:24',
      'out_r_address0:3', 'out_r_ce0:1', 'out_r_we0:1', 'out_r_d0:24',
      'w_address0:10', 'w_ce0:1', 'w_q0:24']);
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), [
      "9 warning: 'in' is a reserved word of VHDL or Verilog: it is named in_r in the module",
      "9 warning: 'out' is a reserved word of VHDL or Verilog: it is named out_r in the module",
      "9 warning: the pointer to structs 'w' is indexed: a memory (ap_memory) of 1024 structs, its depth not given (#pragma HLS INTERFACE port=w depth=N)"]);
  }
});

test('#1684 an integer pointer argument passed to a function that indexes it: a memory (as #1599\'s indexed in the top function)', () => {
  const src = 'static int sum4(int *p) {\n  int s = 0;\n  for (int i = 0; i < 4; i++) s += p[i];\n  return s;\n}\nint top(int *d, int k) {\n#pragma HLS INTERFACE ap_memory port=d depth=4\n  return sum4(d) * k;\n}\nint main(void) { int d[4] = {3, -1, 7, 2}; return top(d, 3) == 33 ? 0 : 1; }\n';
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'top.c', lang });
    assert.deepEqual([r.errors, r.pass], [[], true], JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.ports.filter((p) => /^d_/.test(p.name)).map((p) => `${p.name}:${p.w}`), ['d_address0:2', 'd_ce0:1', 'd_q0:32']);
    assert.deepEqual(r.gen.diagnostics, []);
  }
});

test('#1684 C++: auto x = p[i] of a pointer to structs (AMD\'s aggregation_of_m_axi_ports), its pragmas once by the struct\'s name; one memory of its words (#1668)', () => {
  const src = 'struct A { char foo; short bar; };\nint dut(A *arr) {\n#pragma HLS interface m_axi port = arr depth = 10\n#pragma HLS interface ap_memory port = arr depth = 10\n  int sum = 0;\n  for (unsigned i = 0; i < 10; i++) {\n    auto tmp = arr[i];\n    sum += tmp.foo + tmp.bar;\n  }\n  return sum;\n}\nint main() { A arr[10]; for (int i = 0; i < 10; i++) { arr[i].foo = i; arr[i].bar = -3 * i; } return dut(arr) == -90 ? 0 : 1; }\n';
  const sim = simulateC(src, { file: 'm.cpp' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'm.cpp', lang });
    assert.deepEqual([r.errors, r.pass], [[], true], JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.message}`), []);
    // (its memory of 24-bit words an AXI4 master's, #1893: a word of 4 bytes on a bus of 32 bits)
    assert.deepEqual(r.gen.ports.filter((p) => /^arr_|^m_axi_gmem_RDATA$/.test(p.name)).map((p) => `${p.name}:${p.w}`), ['m_axi_gmem_RDATA:32']);
    assert.deepEqual(r.gen.axi.buses[0].clients.map((c) => `${c.name} ${c.bytes}`), ['arr 4']);
  }
});

test('#1685 a struct copied as the statement of an if, a for, a while, an else, a do, an index with a side effect computed once: the C simulation as cc\'s', { skip: noCC }, () => {
  const src = '#include <stdio.h>\nstruct p { short v; char k; };\nint id(int x) { return x; }\nint main(void) {\n  struct p a[4] = {{1, 2}, {3, 4}, {5, 6}, {7, 8}}, b[4] = {{0, 0}};\n  for (int i = 0; i < 4; i++) b[i] = a[3 - i];\n  if (id(0)) b[0] = a[1]; else b[1] = a[0];\n  int i = 0;\n  while (i < 2) b[i++] = a[3];\n  do b[3] = a[2]; while (0);\n  for (i = 0; i < 4; i++) printf("%d %d\\n", b[i].v, b[i].k);\n  return 0;\n}\n';
  const sim = simulateC(src, { file: 'copy.c' });
  assert.deepEqual([sim.error, sim.diagnostics.filter((d) => d.severity === 'error')], [null, []]);
  assert.equal(sim.output, compiledRun(src).output);
});
