// Silinx HLS, #pragma HLS BIND_OP, ALLOCATION and LATENCY (#1961): core/c-op-pragmas.js. Each case co-simulated in VHDL
// and Verilog (a pass: the C's results), its multipliers, its cycles and its exact warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
function run(body, sig = 'short a, short b, short c') {
  const src = `#include <stdio.h>
int f(${sig}) {
${body}
}
int main(void) {
  for (int i = -40; i < 40; i += 7) printf("%d ", f(i * 111, 7 - i, i - 2000));
  return 0;
}
`;
  const out = ['vhdl', 'verilog'].map((lang) => {
    const r = cosimulate(src, { file: 't.c', lang, top: 'f' });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang}: ${JSON.stringify(r.mismatches, big)}`);
    return r;
  });
  assert.deepEqual(out[0].latency, out[1].latency);
  const r = out[0];
  return { cycles: r.latency?.max ?? 0, stars: (r.gen.hdl.match(/ \* /g) || []).length, units: r.gen.report.units?.length ?? null, messages: r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`) };
}
const msgs = (src) => cToHdl(src, { file: 't.c', top: 'f' }).diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);

test('#1961 BIND_OP op=mul impl=fabric: no multiplier, the C\'s results', () => {
  // (the regression: a multiplier with no pragma, and with impl=dsp)
  assert.deepEqual(run('  int x = a * b;\n  return x + 1;'), { cycles: 2, stars: 1, units: 1, messages: [] });
  assert.equal(run('#pragma HLS BIND_OP variable=x op=mul impl=dsp\n  int x = a * b;\n  return x + 1;').stars, 1);
  assert.deepEqual(run('#pragma HLS BIND_OP variable=x op=mul impl=fabric\n  int x = a * b;\n  return x + 1;'), { cycles: 7, stars: 0, units: 0, messages: [] });
  assert.equal(run('#pragma HLS BIND_OP variable=x op=mul impl=fabric\n  int x = c;\n  x *= b;\n  return x + 1;').stars, 0);
});

test('#1961 BIND_OP of another variable leaves a multiplication alone', () => {
  const r = run('#pragma HLS BIND_OP variable=x op=mul impl=fabric\n  int x = a * b;\n  int y = c * b;\n  return x + y;');
  assert.deepEqual([r.stars, r.messages], [1, []]);
});

test('#1961 BIND_OP: what is not made, its warning', () => {
  const m = (p, body = 'return a * 3;') => msgs(`int f(int a) {\n  int x = a;\n#pragma HLS BIND_OP ${p}\n  ${body}\n}`);
  assert.deepEqual(m('variable=x op=mul impl=fabric'), ['3 warning: #pragma HLS BIND_OP variable=x op=mul: no multiplication is assigned to it: ignored']);
  assert.deepEqual(m('op=mul impl=fabric'), ['3 warning: #pragma HLS BIND_OP needs variable=<the variable its result is assigned to>: ignored']);
  assert.deepEqual(m('variable=x op=fadd impl=fulldsp'), ['3 warning: #pragma HLS BIND_OP op=fadd: not an integer operation Silinx makes: ignored']);
  assert.deepEqual(m('variable=x op=mul impl=meddsp'), ['3 warning: #pragma HLS BIND_OP impl=meddsp: not one of dsp, fabric and auto: ignored']);
  assert.deepEqual(m('variable=x op=add impl=dsp'), ['3 warning: #pragma HLS BIND_OP op=add impl=dsp: the Spartan-3E has no such block, only its multipliers: made of LUTs']);
  assert.deepEqual(m('variable=x op=add impl=fabric'), []);
  assert.deepEqual(m('variable=x op=mul impl=dsp latency=2'), ['3 warning: #pragma HLS BIND_OP latency=2: not made: the clock schedules the operation, its stages not chosen: ignored']);
});

test('#1961 ALLOCATION of mul limit=1: one multiplier, in more cycles, the C\'s results', () => {
  const two = '  int x = a * b;\n  int y = c * b;\n  return x + y;';
  // (the regression: two multipliers)
  assert.deepEqual(run(two), { cycles: 2, stars: 2, units: 2, messages: [] });
  assert.deepEqual(run(`#pragma HLS ALLOCATION instances=mul limit=1 operation\n${two}`), { cycles: 3, stars: 1, units: 1, messages: [] });
  assert.deepEqual(run(`#pragma HLS ALLOCATION instances=mul limit=2 operation\n${two}`), { cycles: 2, stars: 2, units: 2, messages: [] });
});

test('#1961 ALLOCATION: what is not made, its warning', () => {
  const m = (p) => msgs(`int f(int a) {\n#pragma HLS ALLOCATION ${p}\n  return g(a) + h(a);\n}`.replace(/^/, 'int g(int v) {\n#pragma HLS INLINE\n  return v + 1;\n}\nint h(int v) {\n#pragma HLS INLINE off\n  return v + 2;\n}\n')).filter((x) => /ALLOCATION/.test(x));   // (h's own: combinational, its logic in its caller's)
  assert.deepEqual(m('instances=add limit=1 operation'), ['10 warning: #pragma HLS ALLOCATION of add: only multiplications are shared: ignored']);
  assert.deepEqual(m('instances=mul'), ['10 warning: #pragma HLS ALLOCATION needs instances=<what> limit=N, a whole number, 1 or more: ignored']);
  assert.deepEqual(m('instances=g limit=1 function'), ["10 warning: #pragma HLS ALLOCATION of the function 'g': it is inlined, no instance to limit (INLINE off makes it a sub-module, one instance): ignored"]);
  assert.deepEqual(m('instances=q limit=1 function'), ["10 warning: #pragma HLS ALLOCATION of the function 'q': no such function: ignored"]);
  assert.deepEqual(m('instances=h limit=1 function'), []);
  assert.deepEqual(m('instances=h limit=2 function'), ["10 warning: #pragma HLS ALLOCATION limit=2 of 'h': one instance made, its calls sharing it"]);
});

test('#1961 LATENCY min=: a combinational top sequential, its wait states; max=: said when a path takes more', () => {
  // (the regression: latency 0)
  assert.deepEqual(run('  return a + b;'), { cycles: 0, stars: 0, units: null, messages: [] });
  assert.deepEqual(run('#pragma HLS LATENCY min=3\n  return a + b;'), { cycles: 3, stars: 0, units: 0, messages: [] });
  assert.deepEqual(run('#pragma HLS LATENCY min=3 max=3\n  return a + b;').messages, []);
  assert.deepEqual(run('#pragma HLS LATENCY max=2\n  return a + b;').messages, []);
  const long = run('#pragma HLS LATENCY max=1\n  int s = a;\n  for (int i = 0; i < 9; i++) { s += b ^ i; }\n  return s;');
  assert.deepEqual(long.messages, ['3 warning: #pragma HLS LATENCY max=1: 12 cycles made at this clock']);
  // (a path's early return passes the wait states too)
  const early = run('#pragma HLS LATENCY min=20\n  int s = a;\n  if (a > 0) return s;\n  for (int i = 0; i < 9; i++) { s += b ^ i; }\n  return s;');
  assert.deepEqual(early.messages, []);
  assert.ok(early.cycles >= 20);
});

test('#1961 LATENCY: what is not made, its warning', () => {
  assert.deepEqual(msgs('int f(int a) {\n  int s = 0;\n  for (int i = 0; i < a; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=4\n#pragma HLS LATENCY min=2\n    s += i;\n  }\n  return s;\n}'),
    ['5 warning: #pragma HLS LATENCY of a loop: not made: the clock schedules its operations; only a top function\'s is']);
  assert.deepEqual(msgs('int f(int a) {\n#pragma HLS LATENCY min=x\n  return a;\n}'), ['2 warning: #pragma HLS LATENCY min=x: a whole number: ignored']);
  assert.deepEqual(msgs('int f(int a) {\n#pragma HLS LATENCY min=3 max=2\n  return a;\n}'), ['2 warning: #pragma HLS LATENCY min=3 max=2: min above max: max taken as min']);
  assert.deepEqual(msgs('int g(int v) {\n#pragma HLS LATENCY min=2\n  return v;\n}\nint f(int a) {\n  return g(a);\n}'),
    ["2 warning: #pragma HLS LATENCY of 'g', a function the top calls: inlined in the top, its pragma has no effect"]);
  assert.deepEqual(msgs('int f(int a) {\n#pragma HLS PIPELINE\n#pragma HLS LATENCY min=9\n  static int s;\n  s += a;\n  return s;\n}'),
    ['3 warning: #pragma HLS LATENCY of a pipelined function: not made: its stages are its pipeline\'s']);
});
