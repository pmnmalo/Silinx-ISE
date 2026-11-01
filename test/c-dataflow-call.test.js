// Silinx HLS (#1931, core/c-dataflow-call.js): a DATAFLOW region in a function the top calls, as Vitis HLS makes it:
// the region made as the top's processes (its parameters the top's arguments), through one call or more, a function
// template's instance too; a variable of the region never changed folded as a constant; what is not made said, a
// region of streams no longer made sequential (it cannot be). Co-simulated in VHDL and Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const say = (ds) => ds.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const H = `#include "hls_np_channel.h"
#include "hls_task.h"
#include <stdio.h>
void pr(hls::stream<int>& o, hls::stream<int>& in, int n) { for (int i = 0; i < 4; i++) o.write(in.read() + n); }
void id(hls::stream<int>& a, hls::stream<int>& b) { b.write(a.read() * 10); }
void ga(hls::stream<int>& a, hls::stream<int>& o) { for (int i = 0; i < 4; i++) o.write(a.read() + 1); }
`;
// (a region: a split, two tasks, a merge; n added first)
const REGION = (name, pre = '', n = 'n') => `void ${name}(hls::stream<int>& in, hls::stream<int>& r, int n) {
${pre}  hls_thread_local hls::split::round_robin<int, 2> s;
  hls_thread_local hls::merge::round_robin<int, 2> m;
#pragma HLS dataflow
  pr(s.in, in, ${n});
  hls_thread_local hls::task t0(id, s.out[0], m.in[0]);
  hls_thread_local hls::task t1(id, s.out[1], m.in[1]);
  ga(m.out, r);
}
`;
const MAIN = 'int main() { hls::stream<int> a, r; for (int i = 0; i < 4; i++) a.write(i); dut(a, r, 5); for (int i = 0; i < 4; i++) printf("%d ", r.read()); printf("\\n"); return 0; }\n';
const OUT = '51 61 71 81 \n';
const PROCS = ['ap_split_s_U0 (task s)', 'ap_merge_m_U1 (task m)', 'pr_U2', 'id_U3 (task t0)', 'id_U4 (task t1)', 'ga_U5'];

const PORTS = ['in_r_dout', 'in_r_empty_n', 'in_r_read', 'out_r_din', 'out_r_full_n', 'out_r_write', 'n'];
// (an argument the region does not use keeps its port, as Vitis HLS's, #1940)
const both = (top, what, procs = PROCS, ports = PORTS) => {
  const src = top + MAIN;
  assert.equal(simulateC(src, { file: 'd.cpp' }).output, OUT, what);
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'd.cpp', lang });
    assert.deepEqual([r.errors, r.pass, r.output, say(r.gen.diagnostics)], [[], true, OUT, []], `${what} ${lang} ${JSON.stringify(r.mismatches, big)}`);
    assert.deepEqual(r.gen.report.processes.map((p) => `${p.instance}${p.task ? ` (task ${p.task})` : ''}`), procs, `${what} ${lang}`);
    assert.deepEqual(r.gen.ports.map((p) => p.name).filter((p) => !p.startsWith('ap_')), ports, `${what} ${lang}`);
  }
};
const TOP = (body) => `void dut(hls::stream<int>& in, hls::stream<int>& out, int n) {\n${body}\n}\n`;

test('#1931 a DATAFLOW region in a function the top calls alone: made as the top\'s processes, its ports the top\'s; through two calls; co-simulated in VHDL and Verilog, no warning', () => {
  both(H + REGION('dut').replace('hls::stream<int>& r, int n', 'hls::stream<int>& out, int n').replace('ga(m.out, r)', 'ga(m.out, out)'), 'the top\'s own (as before)');
  both(H + REGION('inner') + TOP('  inner(in, out, n);'), 'one call');
  both(H + REGION('inner') + 'void mid(hls::stream<int>& x, hls::stream<int>& y, int k) { inner(x, y, k); return; }\n' + TOP('  mid(in, out, n);\n  return;'), 'two calls');
  // (its parameter given a constant: the constant, the top's n a port not used)
  both(H + REGION('inner') + TOP('  inner(in, out, 5);'), 'a constant given');
});

test('#1931 a function template\'s instance holding the region (N its parameter, #1898): made as the top\'s processes; co-simulated in VHDL and Verilog', () => {
  const src = `${H}template <int NP> void inner(hls::stream<int>& in, hls::stream<int>& r, int n) {
  hls_thread_local hls::split::round_robin<int, NP> s;
  hls_thread_local hls::merge::round_robin<int, NP> m;
  hls_thread_local hls::task t[NP];
#pragma HLS dataflow
  pr(s.in, in, n);
  for (int i = 0; i < NP; i++) {
#pragma HLS unroll
    t[i](id, s.out[i], m.in[i]);
  }
  ga(m.out, r);
}
${TOP('  inner<2>(in, out, n);')}`;
  both(src, 'a template', ['ap_split_s_U0 (task s)', 'ap_merge_m_U1 (task m)', 'pr_U2', 'id_U3 (task t_0)', 'id_U4 (task t_1)', 'ga_U5']);
});

test('#1931 a variable of the region never changed: its value, as Vitis HLS folds it; changed, or another shape: said, as an error (a region of streams cannot be made sequential)', () => {
  both(H + REGION('inner', '  int K = 5;\n', 'K') + TOP('  inner(in, out, n);'), 'a variable never changed');
  const errors = (src) => say(cToHdl(src, { file: 'd.cpp' }).diagnostics.filter((d) => d.severity === 'error'));
  assert.deepEqual(errors(H + REGION('dut', '  int K = 5;\n  K++;\n', 'K') + MAIN),
    ["10 error: #pragma HLS DATAFLOW: the region has 'K': only streams and arrays are declared in a DATAFLOW region: its streams are FIFOs between processes, so it cannot be made sequential"]);
  // (among other statements: a sub-module, called each time, #1706, test/c-dataflow-nest.test.js)
  assert.deepEqual(errors(H + REGION('inner') + TOP('  inner(in, out, n);\n  inner(in, out, n);') + MAIN), []);
  assert.deepEqual(errors(H + REGION('inner') + TOP('  inner(in, out, n + 1);') + MAIN),
    ["17 error: #pragma HLS DATAFLOW in 'inner': its argument 'n' an argument of 'dut' or a constant (not an expression, yet)"]);
  assert.deepEqual(errors(H + REGION('inner', '  int out = 0;\n') + TOP('  inner(in, out, n);') + MAIN),
    ["8 error: #pragma HLS DATAFLOW in 'inner': its variable 'out' is named as an argument of 'dut' (rename it)"]);
});

test('#1931 a region of no streams of its own in a function the top calls: inlined, sequential, as before', () => {
  const src = `#include <stdio.h>
void sq(int a[4], int b[4]) { for (int i = 0; i < 4; i++) b[i] = a[i] * a[i]; }
void inc(int b[4], int c[4]) { for (int i = 0; i < 4; i++) c[i] = b[i] + 1; }
void inner(int a[4], int c[4]) {
  int b[4];
#pragma HLS dataflow
  sq(a, b);
  inc(b, c);
}
void dut(int a[4], int c[4]) { inner(a, c); }
int main() { int a[4] = {1, 2, 3, 4}, c[4]; dut(a, c); for (int i = 0; i < 4; i++) printf("%d ", c[i]); printf("\\n"); return 0; }
`;
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'd.c', lang });
    assert.deepEqual([r.errors, r.pass, r.output], [[], true, '2 5 10 17 \n'], JSON.stringify(r.mismatches, big));
    assert.equal(r.gen.report.processes, undefined);
  }
});

// #1940: an argument of the top that no process reads keeps its port (a scalar, ap_none), directly or when the top calls the region with a constant
for (const [what, top] of [
  ['the region in the top', `void dut(hls::stream<int>& a, hls::stream<int>& b, int n) {
  hls::stream<int> s;
#pragma HLS dataflow
  ga(a, s);
  ga(s, b);
}
`],
  ['the region called with a constant', `void inner(hls::stream<int>& a, hls::stream<int>& b, int n) {
  hls::stream<int> s;
#pragma HLS dataflow
  ga(a, s);
  ga(s, b);
}
void dut(hls::stream<int>& a, hls::stream<int>& b, int n) { inner(a, b, 3); }
`],
]) {
  const src = `${H}${top}int main() {
  hls::stream<int> a, b;
  for (int i = 0; i < 4; i++) a.write(i);
  dut(a, b, 7);
  for (int i = 0; i < 4; i++) printf("%d\\n", b.read());
  return 0;
}
`;
  for (const lang of ['vhdl', 'verilog']) {
    test(`DATAFLOW, ${what}: a scalar argument no process reads keeps its port (${lang}, #1940)`, () => {
      const g = cToHdl(src, { file: 'd.cpp', lang, top: 'dut' });
      assert.equal(g.ok, true);
      assert.deepEqual(say(g.diagnostics), []);
      const n = g.ports.filter((p) => p.name === 'n');
      assert.deepEqual(n.map((p) => [p.dir, p.w]), [['in', 32]]);
      const r = cosimulate(src, { file: 'd.cpp', lang });
      assert.deepEqual([r.errors, r.pass, r.output, say(r.gen.diagnostics)], [[], true, simulateC(src, { file: 'd.cpp' }).output, []], JSON.stringify(r.mismatches, big));
    });
  }
}

test('DATAFLOW: a pointer no process uses has no port, as a top without DATAFLOW (#1940)', () => {
  const g = cToHdl(`${H}void dut(hls::stream<int>& a, hls::stream<int>& b, int *n) {
  hls::stream<int> s;
#pragma HLS dataflow
  ga(a, s);
  ga(s, b);
}
`, { file: 'd.cpp', top: 'dut' });
  assert.equal(g.ok, true);
  assert.deepEqual(g.ports.filter((p) => p.name === 'n'), []);
});
