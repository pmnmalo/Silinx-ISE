// Silinx HLS, the HLS pragmas (#1529): core/c-pragma.js with core/c-fsmd.js. A loop's PIPELINE (an iteration a state),
// UNROLL (whole: the loop in the state it is in; factor=N: N iterations a state), ARRAY_PARTITION complete (an
// array's elements registers): the cycles each makes, measured by co-simulation in VHDL and Verilog (a pass, the
// C's results) and given by the report; the warnings of what is accepted and ignored, the errors of what is wrong.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { dependenceOf, readPragma } from '../core/c-pragma.js';
import { COMB } from './c-helpers.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const ACC = (prag) => `#include <stdio.h>
int acc(int x) {
  int s = 0;
  for (int i = 0; i < 16; i++) {
${prag}
    s += x * i;
  }
  static int calls = 0;
  calls++;
  return s + calls;
}
int main(void) { for (int k = -3; k < 4; k += 2) printf("%d ", acc(k)); return 0; }
`;
/** Co-simulated in both languages: a pass; its cycles a call, its loop's report, its messages. */
function run(src, file = 'acc.c', opts = {}) {
  const out = [];
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file, lang, ...opts });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang}: ${JSON.stringify(r.mismatches, big)}`);
    out.push(r);
  }
  assert.deepEqual(out[0].latency, out[1].latency);
  const r = out[0];
  return { cycles: r.latency.max, loops: r.gen.report.loops.map(({ line, unroll, pipeline, ii, cycles }) => ({ line, unroll, pipeline, ii, cycles })), messages: r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), r };
}

test('#1529 a loop\'s PIPELINE and UNROLL: the cycles of a call (co-simulated: the same results) and the report\'s II', () => {
  // (each pragma on its own: no loop pipelined automatically, #1919, core/c-pipeline.js's tests)
  const alone = (src) => run(src, 'acc.c', { pipelineLoops: 0 });
  const none = alone(ACC(''));
  // (x * i and the sum do not fit 10 ns together: the body two states, #2080)
  assert.equal(none.cycles, 67);
  assert.deepEqual(none.loops, [{ line: 4, unroll: null, pipeline: null, ii: 4, cycles: 65 }]);
  assert.deepEqual(none.messages, []);
  const pipe = alone(ACC('#pragma HLS PIPELINE II=1'));
  assert.equal(pipe.cycles, 19);
  assert.deepEqual(pipe.loops, [{ line: 4, unroll: null, pipeline: 1, ii: 1, cycles: 17 }]);
  assert.deepEqual(pipe.messages, []);
  const whole = alone(ACC('#pragma HLS UNROLL'));
  assert.equal(whole.cycles, 7);   // (its 16 multiplications' sum: over several cycles, #2080)
  assert.deepEqual(whole.loops, [{ line: 4, unroll: 'whole', pipeline: null, ii: 0, cycles: 0 }]);
  const by4 = alone(ACC('#pragma HLS UNROLL factor=4'));
  assert.equal(by4.cycles, 23);
  assert.deepEqual(by4.loops, [{ line: 4, unroll: 4, pipeline: null, ii: 5, cycles: 21 }]);
  const both = alone(ACC('#pragma HLS UNROLL factor=4\n#pragma HLS PIPELINE'));
  assert.equal(both.cycles, 7);
  assert.deepEqual(both.loops, [{ line: 4, unroll: 4, pipeline: 1, ii: 1, cycles: 5 }]);
  // a factor that does not divide the count: the last iteration's copies skipped
  const by5 = alone(ACC('#pragma HLS UNROLL factor=5'));
  assert.deepEqual(by5.loops, [{ line: 4, unroll: 5, pipeline: null, ii: 5, cycles: 21 }]);
  assert.deepEqual(by5.messages, []);
});

test('#1529 what a pragma cannot make here: said, the loop made as it can (a memory\'s accesses keep a state each)', () => {
  const MEM = (prag) => `#include <stdio.h>
int sum(int a[8]) {
  int s = 0;
  for (int i = 0; i < 8; i++) {
${prag}
    s += a[i];
  }
  return s;
}
int main(void) { int t[8] = {1, 2, 3, 4, 5, 6, 7, 8}; printf("%d\\n", sum(t)); return 0; }
`;
  // (made since #1919: the next iteration's read in the last state of one, core/c-pipeline.js; a read in a branch is
  // not, said there)
  const p = run(MEM('#pragma HLS PIPELINE II=1'), 'sum.c');
  assert.deepEqual(p.messages, []);
  assert.deepEqual(p.loops, [{ line: 4, unroll: null, pipeline: 1, ii: 1, cycles: 9 }]);
  const u = run(MEM('#pragma HLS UNROLL'), 'sum.c');
  assert.deepEqual(u.messages, ['4 warning: #pragma HLS UNROLL: this loop is not unrolled: it accesses a memory: an access a state']);
  const c = run(ACC('#pragma HLS UNROLL factor=2\n    if (i == 3) continue;'));
  assert.deepEqual(c.messages, ["4 warning: #pragma HLS UNROLL factor=2: this loop is not unrolled: a 'continue' is in it"]);
  const v = run(`#include <stdio.h>
int count(unsigned n) {
  int k = 0;
  while (n) {
#pragma HLS LOOP_TRIPCOUNT max=32
#pragma HLS UNROLL
    n >>= 1; k++;
  }
  return k;
}
int main(void) { printf("%d %d\\n", count(0), count(1000)); return 0; }
`, 'count.c');
  assert.deepEqual(v.messages, ["4 warning: #pragma HLS UNROLL: this loop's count is not a constant: it is not unrolled (give a factor=)"]);
});

test('#1529 ARRAY_PARTITION complete: a large array\'s elements registers (no memory), its accesses in one state; block several memories', () => {
  const src = (prag) => `#include <stdio.h>
int shift(int x) {
  static int d[80];
${prag}
  int s = 0;
  for (int i = 79; i > 0; i--) {
#pragma HLS UNROLL
    d[i] = d[i - 1];
  }
  d[0] = x;
  for (int i = 0; i < 80; i += 20) {
#pragma HLS UNROLL
    s += d[i];
  }
  return s;
}
int main(void) { for (int k = 0; k < 90; k += 7) printf("%d ", shift(k)); return 0; }
`;
  const parted = run(src('#pragma HLS ARRAY_PARTITION variable=d type=complete'), 'shift.c');
  assert.deepEqual(parted.messages, []);
  assert.equal(parted.cycles, 2);   // (its four additions do not fit 10 ns, #2080)
  assert.doesNotMatch(parted.r.gen.hdl, /ap_m_d/);
  assert.deepEqual(parted.r.gen.report.memories, []);
  const block = run(src('#pragma HLS ARRAY_PARTITION variable=d type=block factor=4'), 'shift.c');
  // (block: four memories, #1920)
  assert.deepEqual(block.messages, [
    '6 warning: #pragma HLS UNROLL: this loop is not unrolled: it accesses a memory: an access a state',
    '11 warning: #pragma HLS UNROLL: this loop is not unrolled: it accesses a memory: an access a state',
  ]);
  assert.deepEqual(block.r.gen.report.memories, [0, 1, 2, 3].map((k) => ({ name: `d_${k}`, words: 20, bits: 32, kind: 'RAM' })));
});

test('#1529 the pragmas accepted and ignored, unknown, misplaced or wrong: their warnings and errors; a combinational module\'s report', () => {
  const msgs = (src) => cToHdl(src).diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
  assert.deepEqual(msgs('int f(int a) {\n#pragma HLS DATAFLOW\n#pragma HLS RESOURCE variable=a\n#pragma HLS FOO\n  return a;\n}'), [
    '2 warning: #pragma HLS DATAFLOW: the region has its statements other than calls of functions and declarations of streams and arrays: made sequential (not as processes)',
    '3 warning: #pragma HLS RESOURCE is accepted and ignored: Silinx does not make it',
    '4 warning: #pragma HLS FOO is not a pragma Silinx knows: ignored',
  ]);
  assert.deepEqual(msgs('int f(int a) {\n#pragma HLS PIPELINE II=1\n  if (a) {\n#pragma HLS UNROLL\n    a++;\n  }\n  return a;\n}'), [
    '4 warning: #pragma HLS UNROLL applies to the loop it is in (first in its body): ignored here',
  ]);
  // (m_axi made, #1893: no warning of its own; a function off inlined under an AXI master, #1960)
  assert.deepEqual(msgs('int g(int x) {\n#pragma HLS INLINE off\n  return x + 1;\n}\nint f(int a, int *p) {\n#pragma HLS INTERFACE m_axi port=p depth=1\n  int v = *p;\n  return g(a) + v;\n}'), [
    "2 warning: #pragma HLS INLINE off: 'g' is inlined: its caller waits for an AXI master (ap_ce), it would not (not yet)",
  ]);
  assert.deepEqual(msgs('int f(int a) {\n  int s = 0;\n  for (int i = 0; i < 4; i++) {\n#pragma HLS UNROLL factor=0\n#pragma HLS PIPELINE II=x\n    s += a;\n  }\n#pragma HLS ARRAY_PARTITION type=complete\n  return s;\n}'), [
    '4 error: #pragma HLS UNROLL factor=0: the factor must be a whole number, 1 or more',
    '5 error: #pragma HLS PIPELINE II=x: II must be a whole number, 1 or more',
    '8 error: #pragma HLS ARRAY_PARTITION needs variable=<the array>',
  ]);
  // a combinational module: its loops unrolled whatever the pragmas, no message
  const comb = cToHdl('int f(int a) {\n  int s = 0;\n  for (int i = 0; i < 4; i++) {\n#pragma HLS PIPELINE II=1\n    s += a;\n  }\n  return s;\n}', { clock: COMB });
  assert.deepEqual(comb.diagnostics, []);
  assert.deepEqual(comb.report, { sequential: false });
});

test('#1961 dependenceOf: what a DEPENDENCE says false', () => {
  const d = (t) => dependenceOf(readPragma(`HLS DEPENDENCE ${t}`));
  assert.deepEqual(d('variable = buffer inter WAR false'), { variable: 'buffer', inter: true, raw: false, war: true });
  assert.deepEqual(d('variable=a intra RAW dependent=false'), { variable: 'a', inter: false, raw: true, war: false });
  assert.deepEqual(d('class=array false'), { variable: null, inter: true, raw: true, war: true });
  assert.equal(d('variable=a inter true'), null);
  assert.equal(d('variable=a inter'), null);
  assert.equal(dependenceOf(readPragma('HLS PIPELINE false')), null);
});

test('#1961 DEPENDENCE: inter with intra, and another class, warned', () => {
  const msgs = (src) => cToHdl(src).diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
  assert.deepEqual(msgs('int f(int a) {\n#pragma HLS DEPENDENCE inter intra false\n#pragma HLS DEPENDENCE class=pointer false\n  return a;\n}'), [
    '2 warning: #pragma HLS DEPENDENCE: inter or intra, not both: taken as intra',
    "3 warning: #pragma HLS DEPENDENCE class=pointer: a variable's dependence is kept (the next iteration needs its value): ignored",
  ]);
});
