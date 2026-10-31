// Silinx HLS, #pragma HLS PIPELINE as Vitis HLS makes it (#1962): core/c-pipe-sched.js. A loop that accesses a memory,
// holds a loop or a continue, and a function: their iterations overlapping, a new one every II cycles, each memory's
// port used once a cycle, a warning only when the II asked cannot be met. Each case co-simulated in VHDL and Verilog (a
// pass: the C's results), its report and its exact warnings; a function's overlapping calls in a bench of their own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { simulate } from '../core/compile.js';
import { moduloSchedule } from '../core/c-pipe-sched.js';
import { Graph } from '../core/c-graph.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
function run(src, opts = {}) {
  const out = ['vhdl', 'verilog'].map((lang) => {
    const r = cosimulate(src, { file: 't.c', lang, ...opts });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang}: ${JSON.stringify(r.mismatches, big)}`);
    return r;
  });
  assert.deepEqual(out[0].latency, out[1].latency);
  const r = out[0];
  return {
    cycles: r.latency.max,
    loops: r.gen.report.loops.map(({ line, unroll, ii, depth, cycles }) => ({ line, unroll, ii, ...(depth ? { depth } : {}), cycles })),
    pipeline: r.gen.report.pipeline,
    messages: r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`),
  };
}
const M = (args, body, calls) => `#include <stdio.h>
int f(${args}) {
  int s = 0;
${body}
  return s;
}
int main(void) {
  int t[8] = {3, -1, 4, 1, -5, 9, 2, 6}, w[8] = {0};
  ${calls}
  for (int k = 0; k < 8; k++) printf("%d %d ", t[k], w[k]);
  return 0;
}
`;
const P = '#pragma HLS PIPELINE';
const II = "#pragma HLS PIPELINE II=1: II=2 made (the memory 'a' has one port, accessed 2 times an iteration)";

test('#1962 a loop reading one memory and writing another: II=1, its iterations overlapping, no warning', () => {
  const r = run(M('int a[8], int b[8]', `  for (int i = 0; i < 8; i++) {\n${P}\n    b[i] = a[i] * 3 + 1;\n  }`, 'f(t, w);'));
  // (Vitis HLS's count: (8 - 1) x II + the iteration's stages)
  assert.deepEqual(r.loops, [{ line: 4, unroll: null, ii: 1, depth: 3, cycles: 10 }]);
  assert.deepEqual(r.messages, []);
});

test('#1962 a single-port memory accessed twice an iteration: II=2, said with why', () => {
  const rd = run(M('int a[8]', `  for (int i = 0; i < 7; i++) {\n${P}\n    s += a[i] + a[i + 1];\n  }`, 'printf("%d", f(t));'));
  assert.deepEqual(rd.loops, [{ line: 4, unroll: null, ii: 2, depth: 3, cycles: 15 }]);
  assert.deepEqual(rd.messages, [`4 warning: ${II}`]);
  // (each value its read's: a difference tells them apart)
  const diff = run(M('int a[8]', `  for (int i = 0; i < 7; i++) {\n${P}\n    s += a[i] - 2 * a[i + 1];\n  }`, 'printf("%d", f(t));'));
  assert.equal(diff.loops[0].ii, 2);
  // (the element read twice: one read, as Vitis HLS makes it)
  const once = run(M('int a[8]', `  for (int i = 0; i < 8; i++) {\n${P}\n    if (a[i] < 0) break;\n    s += a[i];\n  }`, 'printf("%d", f(t));'));
  // (and the break known a stage late: the iteration started after it squashed, as Vitis HLS speculates)
  assert.deepEqual(once.loops, [{ line: 4, unroll: null, ii: 1, depth: 2, cycles: 9 }]);
  assert.deepEqual(once.messages, []);
  // (asked for: the II asked, no warning)
  const asked = run(M('int a[8]', `  for (int i = 0; i < 7; i++) {\n${P} II=2\n    s += a[i] + a[i + 1];\n  }`, 'printf("%d", f(t));'));
  assert.equal(asked.loops[0].ii, 2);
  assert.deepEqual(asked.messages, []);
  // (a read then a write of the element: the same)
  const inc = run(M('int a[8]', `  for (int i = 0; i < 8; i++) {\n${P}\n    a[i] = a[i] + 1;\n  }`, 'f(t); f(t);'));
  assert.deepEqual(inc.loops, [{ line: 4, unroll: null, ii: 2, depth: 2, cycles: 16 }]);
  assert.deepEqual(inc.messages, [`4 warning: ${II}`]);
});

test('#1962 an II larger than asked for a dependence: another iteration reading what this one writes', () => {
  // (the next index from the value read: known a cycle after the read)
  const r = run(M('int a[8]', `  s = 1;\n  for (int i = 1; i < 8; i++) {\n${P}\n    s = a[s & 7] + i;\n  }`, 'printf("%d", f(t));'));
  assert.deepEqual(r.loops, [{ line: 5, unroll: null, ii: 2, depth: 2, cycles: 14 }]);
  assert.deepEqual(r.messages, ["5 warning: #pragma HLS PIPELINE II=1: II=2 made (a dependence: the next iteration reads 's' before this one has written it)"]);
  // (each element from the one before: the read after the write, the multiplications in the read's stage, no clock
  // asked; the one port the bound)
  const prev = run(M('int a[8]', `  for (int i = 1; i < 8; i++) {\n${P}\n    a[i] = a[i - 1] * a[i - 1] * a[i - 1] + 1;\n  }`, 'f(t);'));
  assert.deepEqual(prev.loops, [{ line: 4, unroll: null, ii: 2, depth: 2, cycles: 14 }]);
  assert.deepEqual(prev.messages, [`4 warning: #pragma HLS PIPELINE II=1: II=2 made (the memory 'a' has one port, accessed 2 times an iteration)`]);
});

test('#1962 a loop with a loop accessing a memory in it: the inner loop unrolled, its accesses over the port', () => {
  const r = run(M('int a[8]', `  for (int i = 0; i < 4; i++) {\n${P}\n    for (int j = 0; j < 2; j++) s += a[2 * i + j];\n  }`, 'printf("%d", f(t));'));
  assert.deepEqual(r.loops, [{ line: 4, unroll: null, ii: 2, depth: 3, cycles: 9 }, { line: 6, unroll: 'whole', ii: 0, cycles: 0 }]);
  assert.deepEqual(r.messages, [`4 warning: ${II}`]);
});

test('#1962 a loop with a continue: pipelined, the skipped iterations writing nothing', () => {
  const mem = run(M('int a[8]', `  for (int i = 0; i < 8; i++) {\n${P}\n    if (i == 3) continue;\n    s += a[i];\n  }`, 'printf("%d", f(t));'));
  assert.deepEqual(mem.loops, [{ line: 4, unroll: null, ii: 1, depth: 2, cycles: 9 }]);
  assert.deepEqual(mem.messages, []);
  const scalar = run(M('int k', `  for (int i = 0; i < 8; i++) {\n${P}\n    if (i == k) continue;\n    s += i;\n  }`, 'printf("%d %d", f(3), f(-1));'));
  assert.equal(scalar.loops[0].ii, 1);
  assert.deepEqual(scalar.messages, []);
});

test('#1962 a small array written and read back at the same index: the value written, II=1', () => {
  const r = run(M('int a[8], int b[8]', `  int buf[8];\n  for (int i = 0; i < 8; i++) {\n${P}\n    buf[i] = a[i];\n    buf[i] = buf[i] + 100;\n    b[i] = buf[i];\n  }`, 'f(t, w);'));
  assert.equal(r.loops[0].ii, 1);
  assert.deepEqual(r.messages, []);
});

test('#1962 what cannot be made so: said, as before (an inner loop of unknown count)', () => {
  const r = run(M('int a[8], int n', `  for (int i = 0; i < 3; i++) {\n${P}\n    for (int j = 0; j < n; j++) s += a[j];\n  }`, 'printf("%d", f(t, 2));'));
  assert.deepEqual(r.messages.filter((m) => /PIPELINE/.test(m)), [`4 warning: #pragma HLS PIPELINE II=1: II=${r.loops[0].ii} made (a loop is in it whose count is not a constant: it cannot be unrolled)`]);
});

const FN = `  ${P}\n  s = a[k & 7] * k + 1;`;
test('#1962 a function\'s PIPELINE: made, no warning; one that cannot meet its II says why; a function the top calls says it is inlined', () => {
  const r = run(M('int a[8], int k', FN, 'printf("%d %d", f(t, 3), f(t, -2));'));
  assert.deepEqual(r.pipeline, { ii: 1, depth: 3 });
  assert.deepEqual(r.messages, []);
  const two = run(M('int a[8], int k', `  ${P} II=2\n  for (int i = 0; i < 4; i++) s += a[i] + k;`, 'printf("%d %d", f(t, 3), f(t, -2));'));
  assert.equal(two.pipeline.ii, 4);
  assert.deepEqual(two.messages, ["2 warning: #pragma HLS PIPELINE II=2: II=4 made (the memory 'a' has one port, accessed 4 times an iteration)"]);
  const off = run(M('int a[8], int k', `  ${P} off\n  s = a[k & 7] * k + 1;`, 'printf("%d", f(t, 3));'));
  assert.equal(off.pipeline, undefined);
  assert.deepEqual(off.messages, []);
  const callee = cToHdl(`int g(int x) {\n${P}\n  return x + 1;\n}\nint top(int x) { return g(x) * 2; }\n`, { file: 't.c', top: 'top' });
  assert.deepEqual(callee.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), ["2 warning: #pragma HLS PIPELINE of 'g', a function the top calls: inlined in the top, its pragma has no effect"]);
});

test('#1962 a function pipelined with a pointer output: its _ap_vld with its value, a call reading what the one before wrote', () => {
  // (as AMD's ram_uram example: the output written a stage after its valid bit was known)
  const src = `#include <stdio.h>
void f(int wren, int rden, int aw, int din, int ar, int *dataout) {
${P} II=1
  static int buffer[16];
  if (rden) *dataout = buffer[ar];
  if (wren) buffer[aw] = din;
}
int main(void) {
  int d = 0;
  for (int i = 0; i < 4; i++) f(1, 0, i, i * i + 1, 0, &d);
  for (int j = 0; j < 4; j++) { f(0, 1, 0, 0, j, &d); printf("%d ", d); }
  return 0;
}
`;
  const r = run(src);
  assert.deepEqual(r.pipeline, { ii: 1, depth: 2 });
  assert.deepEqual(r.messages, []);
});

// a new call every cycle, the memory outside: each call's result, and all of them in depth + calls cycles
const BENCH = `module tb;
  reg ap_clk = 0, ap_rst = 1, ap_start = 0;
  reg [31:0] k = 0;
  wire ap_done, ap_idle, ap_ready, a_ce0;
  wire [2:0] a_address0;
  reg [31:0] mem [0:7], q = 0;
  wire [31:0] ap_return;
  integer c, seen = 0, first = -1, last = -1, bad = 0, cyc = 0;
  f u (.ap_clk(ap_clk), .ap_rst(ap_rst), .ap_start(ap_start), .ap_done(ap_done), .ap_idle(ap_idle), .ap_ready(ap_ready), .a_address0(a_address0), .a_ce0(a_ce0), .a_q0(q), .k(k), .ap_return(ap_return));
  always #5 ap_clk = !ap_clk;
  always @(posedge ap_clk) begin
    if (a_ce0) q <= mem[a_address0];
    cyc <= cyc + 1;
    if (ap_done) begin
      if (first < 0) first = cyc;
      last = cyc;
      if (ap_return !== mem[seen & 7] * seen + 1) bad = bad + 1;
      seen = seen + 1;
    end
    if (ap_start && ap_ready) begin k <= k + 1; if (k == 7) ap_start <= 0; end
  end
  initial begin
    for (c = 0; c < 8; c = c + 1) mem[c] = c * 5 + 2;
    #22 ap_rst = 0; @(negedge ap_clk); ap_start = 1;
    repeat (40) @(posedge ap_clk);
    $display("seen %0d span %0d bad %0d idle %0d", seen, last - first, bad, ap_idle);
    $finish;
  end
endmodule
`;
for (const lang of ['vhdl', 'verilog']) {
  test(`#1962 a function pipelined at II=1 takes a new call every cycle, overlapping (${lang})`, () => {
    const gen = cToHdl(`int f(int a[8], int k) {\n${P}\n  return a[k & 7] * k + 1;\n}\n`, { file: 't.c', lang, top: 'f' });
    assert.equal(gen.ok, true);
    const r = simulate([{ path: `f.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: gen.hdl }, { path: 'tb.v', text: BENCH }], 'tb');
    assert.deepEqual(r.errors, []);
    const line = r.sim.log.map((e) => String(e.text)).find((s) => s.startsWith('seen'));
    assert.equal(line.trim(), 'seen 8 span 7 bad 0 idle 1');
  });
}

test('#1962 moduloSchedule: a port used once modulo the II; a dependence refused until the II allows it; a late exit speculated', () => {
  const g = new Graph(), T = { w: 8, s: false };
  const addr = g.add('reg', [], T, { port: { key: 'reg:i', name: 'i' } }), ce = g.const(1, { w: 1, s: false });
  const q0 = g.add('reg', [], T, { port: { key: 'q0', name: 'q0' } }), q1 = g.add('reg', [], T, { port: { key: 'q1', name: 'q1' } });
  const ops = [{ mem: 'a', roots: [addr, ce], write: false, q: q0 }, { mem: 'a', roots: [addr, ce], write: false, q: q1 }];
  const sum = g.add('add', [q0, q1], T);
  const x = g.add('reg', [], T, { port: { key: 'reg:x', name: 'x' } });
  const r = moduloSchedule({ g, ops, updates: [[x, sum]], exit: null }, 2);
  assert.deepEqual(r.opStage, [0, 1]);
  assert.equal(r.stage.get(sum), 2);
  assert.equal(r.depth, 3);
  // (a variable read at stage 0 by the clock's chaining, its next value from the second read, at stage 2: II=3 at
  // least; with no clock, its operation as late as its user: read at stage 2)
  const s = g.add('reg', [], T, { port: { key: 'reg:s', name: 's' } });
  const twice = g.add('add', [s, s], T), next = g.add('add', [q1, twice], T);
  const dep = { g, ops, updates: [[s, next]], exit: null, budget: 1e9 };
  assert.deepEqual(moduloSchedule(dep, 2).fail, { kind: 'var', reg: s });
  assert.equal(moduloSchedule(dep, 3).fail, undefined);
  const late = moduloSchedule({ ...dep, budget: Infinity }, 2);
  assert.deepEqual([late.fail, late.stage.get(twice), late.read.get(s)], [undefined, 2, 2]);
  // (the exit known only from the second read, after the next iteration has started: that one squashed, when nothing
  // was written before; a variable written from the first read: the II waits for the exit)
  const spec = moduloSchedule({ g, ops, updates: [], exit: q1 }, 2);
  assert.equal(spec.squash, true);
  assert.equal(spec.exitStage, 2);
  assert.deepEqual(moduloSchedule({ g, ops, updates: [[x, q0]], exit: q1 }, 2).fail, { kind: 'exit' });
  assert.equal(moduloSchedule({ g, ops, updates: [[x, q0]], exit: q1 }, 3).squash, false);
});
