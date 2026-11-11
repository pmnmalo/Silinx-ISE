// Silinx HLS, a pipelined loop's iteration in stages against the clock (#2182, core/c-pipe-sched.js): a loop that does
// not fit the clock an iteration over several cycles at its II, the pipeline's registers between them; a recurrence
// longer than the clock the II raised, and said; a sum's variable added last; a stream read and written in its stage
// when the loop does not fit the clock, every stage held while a FIFO is empty or full (the co-simulation's FIFOs are empty and full now and then). Each case
// co-simulated in VHDL and Verilog against the C, its report (II, depth, cycles) and its exact warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
/** The source co-simulated in VHDL and Verilog: the same latency in both; its loops, latency and messages. */
function run(src, opts = {}) {
  const out = ['vhdl', 'verilog'].map((lang) => {
    const r = cosimulate(src, { lang, ...opts });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang}: ${JSON.stringify(r.mismatches, big)}`);
    return r;
  });
  assert.deepEqual(out[0].latency, out[1].latency);
  const r = out[0];
  return {
    cycles: r.latency.max,
    loops: r.gen.report.loops.filter((l) => l.pipeline).map(({ line, ii, depth, cycles }) => ({ line, ii, ...(depth ? { depth } : {}), cycles })),
    slow: r.gen.report.slowLoops,
    messages: r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`),
  };
}

const FLOAT = `float f(float a[100]) {
  float s = 0;
  for (int i = 0; i < 100; i++) {
#pragma HLS PIPELINE II=1
    s += a[i];
  }
  return s;
}
int main() {
  float a[100];
  for (int k = 0; k < 100; k++) a[k] = k * 0.5f - 7;
  return f(a) == f(a) ? 0 : 1;
}
`;

test('#2182 a float sum: the recurrence through the addition longer than the clock, the II raised until its stages fit, and said', () => {
  const II = (n) => `3 warning: #pragma HLS PIPELINE II=1: II=${n} made (a dependence at this clock: the next iteration reads 's' before this one has written it)`;
  // (was II=1 with a path of over 100 ns in one cycle, said only in View C Synthesis Report)
  const fast = run(FLOAT, { file: 't.c', top: 'f', clock: 10 });
  assert.deepEqual([fast.loops, fast.slow, fast.messages, fast.cycles], [[{ line: 3, ii: 16, depth: 17, cycles: 1601 }], [], [II(16)], 1603]);
  const slow = run(FLOAT, { file: 't.c', top: 'f', clock: 40 });
  assert.deepEqual([slow.loops, slow.slow, slow.messages, slow.cycles], [[{ line: 3, ii: 4, depth: 5, cycles: 401 }], [], [II(4)], 403]);
});

const SUM = (body) => `int f(int x, int y) {
  int s = 0;
  for (int i = 0; i < 64; i++) {
#pragma HLS PIPELINE II=1
${body}
  }
  return s;
}
int main() {
  int r = 0;
  for (int k = -3; k < 4; k++) r += f(k * 1000, 77 - k) & 1;
  return r == r ? 0 : 1;
}
`;

test('#2182 a sum\'s variable added last: its recurrence one addition, II=1 at 7 ns; the terms over the stages before it', () => {
  // (balanced with s among the terms, two additions or more in its recurrence: II=2)
  const r = run(SUM('    s += x + y + (i ^ x) + (y >> 3);'), { file: 't.c', top: 'f', clock: 7 });
  assert.deepEqual([r.loops, r.slow, r.messages, r.cycles], [[{ line: 3, ii: 1, depth: 2, cycles: 65 }], [], [], 67]);
});

test('#2182 a loop with no memory one state an iteration when it fits the clock; when it does not, its iteration in stages, its II kept', () => {
  const body = '    s += x * i + y * i + (x ^ i);';
  const calm = run(SUM(body), { file: 't.c', top: 'f', clock: 40 });
  assert.deepEqual([calm.loops, calm.messages, calm.cycles], [[{ line: 3, ii: 1, cycles: 65 }], [], 67]);
  const fast = run(SUM(body), { file: 't.c', top: 'f', clock: 10 });
  assert.deepEqual([fast.loops, fast.slow, fast.messages, fast.cycles], [[{ line: 3, ii: 1, depth: 2, cycles: 65 }], [], [], 67]);
  // (the generated HDL's pipeline registers: the stages' values, a valid bit for each)
  const hdl = cToHdl(SUM(body), { file: 't.c', top: 'f', clock: 10 }).hdl;
  assert.match(hdl, /ap_pipe\d+_v1\b/);
  assert.match(hdl, /ap_pipe\d+_\d+_s1\b/);
});

const STREAMS = `#include "hls_stream.h"
void f(hls::stream<int> &xs, hls::stream<int> &ys, int k, int c[100]) {
  int s = 0;
  for (int i = 0; i < 100; i++) {
#pragma HLS PIPELINE II=1
    int v = xs.read();
    s += v * k + v + i + c[i];
    ys.write(s * 3 + v * k + 7);
  }
}
int main() {
  hls::stream<int> xs, ys;
  int c[100];
  for (int i = 0; i < 100; i++) { xs.write(i * 37 - 900); c[i] = i * i - 5; }
  f(xs, ys, 13, c);
  int s = 0, r = 0;
  for (int i = 0; i < 100; i++) { int v = i * 37 - 900; s += v * 13 + v + i + i * i - 5; if (ys.read() != s * 3 + v * 13 + 7) r = 1; }
  return r;
}
`;

test('#2182 a stream read and written in a pipelined loop too slow for the clock: each access in its stage, the value read carried on, every stage held while a FIFO is empty or full', () => {
  // (at 40 ns, one state an iteration as before (#1919); at 10 ns, was that state with a path over the clock; the bench's
  // FIFO empty one cycle in 3, full one in 4)
  for (const [clock, loop, cycles] of [[10, { line: 4, ii: 1, depth: 4, cycles: 103 }, 204], [40, { line: 4, ii: 1, cycles: 101 }, 203]]) {
    const r = run(STREAMS, { file: 't.cpp', top: 'f', clock });
    assert.deepEqual([r.loops, r.slow, r.messages, r.cycles], [[loop], [], [], cycles], `${clock} ns`);
  }
  // (the stall: the read's and the write's handshakes, and the stages' registers held by it)
  const hdl = cToHdl(STREAMS, { file: 't.cpp', top: 'f', clock: 10, lang: 'verilog' }).hdl;
  assert.match(hdl, /xs_read/);
  assert.match(hdl, /ys_write/);
});

test('#2182 a stream accessed twice an iteration, or polled: a state an access, as before (#1919), its path said if over the clock', () => {
  const twice = `#include "hls_stream.h"
void f(hls::stream<int> &xs, hls::stream<int> &ys) {
  for (int i = 0; i < 8; i++) {
#pragma HLS PIPELINE II=1
    int a = xs.read();
    int b = xs.read();
    ys.write(a - b);
  }
}
int main() {
  hls::stream<int> xs, ys;
  for (int i = 0; i < 16; i++) xs.write(i * i);
  f(xs, ys);
  int r = 0;
  for (int i = 0; i < 8; i++) if (ys.read() != (2 * i) * (2 * i) - (2 * i + 1) * (2 * i + 1)) r = 1;
  return r;
}
`;
  const r = run(twice, { file: 't.cpp', top: 'f', clock: 10 });
  assert.deepEqual([r.loops, r.slow, r.messages], [[{ line: 3, ii: 2, cycles: 17 }], [], ['3 warning: #pragma HLS PIPELINE II=1: II=2 made (it reads or writes a stream, an access a state)']]);
});

const REGS = (body) => `int f(int x, int y) {
  int b[40];
  for (int i = 0; i < 40; i++) b[i] = i * 3 - 7;
  for (int i = 0; i < 40; i++) {
#pragma HLS PIPELINE II=1
${body}
  }
  int s = 0;
  for (int i = 0; i < 40; i++) s ^= b[i] + i;
  return s;
}
int main() {
  int r = 0;
  for (int k = -2; k < 3; k++) r += f(k * 1000 + 1, 77 - k) & 1;
  return r == r ? 0 : 1;
}
`;

test('#2182 an array of registers read and written at the loop\'s counter (b[i]): no iteration reads another\'s element, its II kept in stages; at another index, the dependence kept', () => {
  // (a local array of 64 elements or fewer is registers; b[i] read and written: each iteration its own element, as
  // Vitis HLS's dependence analysis finds; the corpus's interface-memory-using-axi-master, buff[i] = buff[i] + 100)
  const own = run(REGS('    b[i] = b[i] * x + y + i;'), { file: 't.c', top: 'f', clock: 10 });
  assert.deepEqual([own.loops[1], own.slow, own.messages], [{ line: 4, ii: 1, depth: 5, cycles: 44 }, [], []]);
  // (b[i - 1]: the element the iteration before wrote, read by this one: the II raised for it)
  const prev = run(REGS('    if (i > 0) b[i] = b[i - 1] * x + y + i;'), { file: 't.c', top: 'f', clock: 10 });
  assert.deepEqual([prev.loops[1], prev.messages], [{ line: 4, ii: 5, depth: 6, cycles: 201 },
    ["4 warning: #pragma HLS PIPELINE II=1: II=5 made (a dependence at this clock: the next iteration reads 'b_0' before this one has written it)"]]);
  assert.deepEqual(prev.slow, []);
});

test('#2182 a pipelined loop with a stream and a continue: made as before, an access a state (not a pipeline of stages it cannot be)', () => {
  // (the corpus's task-level-parallelism-control-driven-channels-using-stream-of-blocks: an exception while this was made)
  const src = `#include "hls_stream.h"
void f(hls::stream<int> &xs, hls::stream<int> &ys) {
  for (int i = 0; i < 8; i++) {
#pragma HLS PIPELINE II=1
    int v = xs.read();
    if (v < 0) continue;
    ys.write(v * 3);
  }
}
int main() {
  hls::stream<int> xs, ys;
  for (int i = 0; i < 8; i++) xs.write(i % 3 == 1 ? -i : i);
  f(xs, ys);
  int r = 0;
  for (int i = 0; i < 8; i++) if (i % 3 != 1 && ys.read() != i * 3) r = 1;
  return r;
}
`;
  const r = run(src, { file: 't.cpp', top: 'f', clock: 10 });
  assert.deepEqual([r.slow, r.messages], [[], ["3 warning: #pragma HLS PIPELINE II=1: II=4 made (a 'continue' or a 'goto' is in it)"]]);
});
