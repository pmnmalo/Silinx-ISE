// Silinx HLS (#2241): a pointer or reference argument of a sequential module written before it is read, on every path,
// is an output only, as in a combinational module and in Vitis HLS (its ports checked against Vitis HLS 2025.2 on
// these designs); a read that a path reaches with no write keeps the input <p>_i. Each design co-simulated in VHDL and
// Verilog, with no warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';

// (a loop whose count is an argument: the function sequential at any clock; its bound for the report)
const LOOP = 'for (int i = 0; i < n; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=4\n';
const bench = (sig, call) => `int main() {\n  int s = 7, y = 0, t = 0;\n  for (int a = -2; a <= 2; a++) for (int n = 0; n < 3; n++) { ${call}; t += s + y; }\n  return t == 12345 ? 1 : 0;\n}\n`;
const ref = (body) => `void f(int a, int n, int &s, int &y) {\n${body}\n}\n${bench('ref', 'f(a, n, s, y)')}`;
const ptr = (body) => `void f(int a, int n, int *s, int *y) {\n${body}\n}\n${bench('ptr', 'f(a, n, &s, &y)')}`;
const OUT = ['s', 's_ap_vld', 'y', 'y_ap_vld'];
const IO = ['s_i', 's_o', 's_o_ap_vld', 'y', 'y_ap_vld'];
const CASES = [
  // written, then read in the states of a loop
  ['after', ref(`  s = a + 1;\n  int t = 0;\n  ${LOOP}    t += s;\n  }\n  y = t;`), OUT],
  ['a pointer written, then read', ptr(`  *s = a + 1;\n  int t = 0;\n  ${LOOP}    t += *s;\n  }\n  *y = t;`), OUT],
  // written in both branches of an if: on every path
  ['both branches', ref(`  if (a > 0) s = 1; else s = 2;\n  int t = 0;\n  ${LOOP}    t += s;\n  }\n  y = t;`), OUT],
  // written and read in a loop's iteration
  ['in the loop', ref(`  int t = 0;\n  ${LOOP}    s = a + i;\n    t += s;\n  }\n  y = t;`), OUT],
  // under a condition: where it does not hold, the caller's value
  ['under a condition', ref(`  if (a > 0) s = 1;\n  int t = 0;\n  ${LOOP}    t += s;\n  }\n  y = t;`), IO],
  // read before it is written
  ['read first', ref(`  int t = 0;\n  ${LOOP}    t += s;\n  }\n  s = a;\n  y = t;`), IO],
  // written in a loop that may not run (n = 0), read after it
  ['after a loop that may not run', ref(`  ${LOOP}    s = a + i;\n  }\n  y = s;`), IO],
];

for (const [name, src, ports] of CASES) {
  test(`#2241 a reference argument ${name}: ${ports.includes('s_i') ? 's_i, s_o' : 's alone'}, as Vitis HLS; co-simulated in VHDL and Verilog, no warnings`, () => {
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(src, { file: 'd.cpp', lang, top: 'f' });
      assert.deepEqual(r.errors, []);
      assert.equal(r.pass, true, JSON.stringify(r.mismatches, (k, v) => (typeof v === 'bigint' ? `${v}` : v)));
      assert.equal(r.calls, 15);
      assert.deepEqual(r.gen.diagnostics, []);
      assert.deepEqual(r.gen.ports.map((p) => p.name), ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'a', 'n', ...ports]);
    }
  });
}

test('#2241 written then read in one state: the same ports sequential as combinational (s alone)', () => {
  const src = 'void f(int a, bool &s, int &y) {\n  s = a > 1000;\n  y = s ? 1 : 2;\n}\n';
  const tail = (r) => r.ports.map((p) => p.name).filter((n) => !/^ap_/.test(n));
  const comb = cToHdl(src, { file: 'd.cpp', clock: 1000 });
  // (a clock too short for the comparison and the selection: the function sequential)
  const seq = cToHdl(src, { file: 'd.cpp', clock: 1 });
  assert.equal(comb.ports.some((p) => p.name === 'ap_clk'), false);
  assert.equal(seq.ports.some((p) => p.name === 'ap_clk'), true);
  assert.deepEqual(tail(comb), ['a', 's', 's_ap_vld', 'y', 'y_ap_vld']);
  assert.deepEqual(tail(seq), tail(comb));
  assert.deepEqual(comb.diagnostics, []);
  assert.deepEqual(seq.diagnostics, []);
});

test('#2241 a read under the condition of the write, or in a branch of it: the write\'s; a read outside it: the caller\'s', () => {
  const ports = (body) => cToHdl(`void f(int a, int n, int &s, int &y) {\n${body}\n}\n`, { file: 'd.cpp' }).ports.map((p) => p.name).filter((x) => /^s/.test(x));
  const loop = `  int t = 0;\n  ${LOOP}    t += i;\n  }\n`;
  assert.deepEqual(ports(`${loop}  if (a > 0) { s = 1; y = s + t; }`), ['s', 's_ap_vld']);
  assert.deepEqual(ports(`${loop}  if (a > 0) { s = 1; if (n > 2) y = s + t; }`), ['s', 's_ap_vld']);
  assert.deepEqual(ports(`${loop}  if (a > 0) s = 1;\n  if (n > 2) y = s + t;`), ['s_i', 's_o', 's_o_ap_vld']);
  // (each branch of a nested if writes it: written whatever the inputs)
  assert.deepEqual(ports(`${loop}  if (a > 0) { if (n > 1) s = 1; else s = 2; } else s = 3;\n  y = s + t;`), ['s', 's_ap_vld']);
});
