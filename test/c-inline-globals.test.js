// Silinx HLS: a global of a sequential module read or written in a function inlined into it (#3511): the top's register,
// its current value, not the value at the reset (a read) nor "'g' is a constant" (a write in a fully unrolled loop): in
// a plain call, a loop, a pipelined loop, a fully unrolled one, a function with INLINE off kept inlined (a function it calls reads the global too), a global array
// (registers and a memory), a callee calling another; each co-simulated against the C model in VHDL and in Verilog,
// with its exact warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';

const LANGS = ['vhdl', 'verilog'];
const UNKNOWN = (line) => ({ file: 't.c', line, col: 3, message: 'the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)', severity: 'warning' });
const msgs = (ds) => ds.map((d) => `${d.line}: ${d.severity}: ${d.message}`);

/** The design's C simulation passes (main returns 0), its HDL is a sequential module with these warnings, and its
 *  co-simulation passes in both languages, the HDL's warnings the same. */
function same(src, warnings = [], top = 'top') {
  const sim = simulateC(src, { file: 't.c' });
  assert.deepEqual([sim.ok, sim.exitCode], [true, 0], 'the C model');
  for (const lang of LANGS) {
    const g = cToHdl(src, { file: 't.c', lang, top });
    assert.deepEqual(msgs(g.diagnostics), warnings, lang);
    assert.equal(g.ok && g.sequential, true, lang);
    const c = cosimulate(src, { file: 't.c', lang, top });
    assert.deepEqual([c.ok, c.pass, c.mismatches, c.errors], [true, true, [], []], lang);
    assert.ok(c.calls >= 2, lang);
  }
}

test('#3511 a global read in a function inlined: its value now, not the reset\'s (the second call 3, not 2)', () => {
  same(`int g;
int plus(int d) { return g + d; }
int top(int d) { g = plus(d); return g; }
int main() { return top(1) == 1 && top(2) == 3 ? 0 : 1; }
`);
});

test('#3511 in a loop: each iteration reads the last one\'s value (2 then 8, not 1 then 2)', () => {
  const src = `int g;
int plus(int d) { return g + d; }
int top(int d, int n) {
  for (int i = 0; i < n; i++) g = plus(d);
  return g;
}
int main() { return top(1, 2) == 2 && top(2, 3) == 8 ? 0 : 1; }
`;
  const w = UNKNOWN(4);
  same(src, [`${w.line}: ${w.severity}: ${w.message}`]);
});

test('#3511 in a pipelined loop: the same values, no warnings', () => {
  same(`int g;
int plus(int d) { return g + d; }
int top(int d) {
  for (int i = 0; i < 4; i++) {
#pragma HLS PIPELINE II=1
    g = plus(d);
  }
  return g;
}
int main() { return top(1) == 4 && top(2) == 12 ? 0 : 1; }
`);
});

test('#3511 a global written by a function a fully unrolled loop calls: a sequential module, not "\'g\' is a constant"', () => {
  same(`int g;
void bump(int d) { g += d; }
int top(int d) { for (int i = 0; i < 2; i++) bump(d); return g; }
int main() { return top(1) == 2 && top(2) == 6 ? 0 : 1; }
`);
});

test('#3511 INLINE off kept inlined because of the global (a function it calls reads it too, #2244): the register\'s reads, its one warning', () => {
  same(`int g;
int get() { return g; }
int plus(int d) {
#pragma HLS INLINE off
  return get() + d;
}
int top(int d) { g = plus(d); return g; }
int main() { return top(1) == 1 && top(2) == 3 ? 0 : 1; }
`, ["4: warning: #pragma HLS INLINE off: 'plus' is inlined: the global variable 'g' is used by its caller too and by a function it calls"]);
});

test('#3511 a global array written and read by functions inlined: its registers (4 elements) and its memory (64)', () => {
  same(`int h[4];
void put(int k, int v) { h[k] += v; }
int get(int k) { return h[k]; }
int top(int k, int v) { for (int i = 0; i < 2; i++) put(k, v); return get(k) + get(0); }
int main() { return top(1, 1) == 2 && top(1, 2) == 6 && top(0, 1) == 4 ? 0 : 1; }
`);
  same(`int h[64];
void put(int k, int v) { h[k] += v; }
int get(int k) { return h[k]; }
int top(int k, int v) { put(k, v); put(k, v); return get(k); }
int main() { return top(1, 1) == 2 && top(1, 2) == 6 && top(5, 1) == 2 ? 0 : 1; }
`);
});

test('#3511 a function inlined writing the global, another it calls reading it, in an unrolled loop; a local of the same name its own', () => {
  same(`int g;
int two() { return g * 2; }
int plus(int d) { g = g + 1; return two() + d; }
int top(int d) { int r = 0; for (int i = 0; i < 3; i++) r += plus(d); return r + g; }
int main() { return top(1) == 18 && top(0) == 36 ? 0 : 1; }
`);
  same(`int g;
int plus(int d) { int g = d * 2; return g; }
int top(int d) { g += plus(d); return g; }
int main() { return top(1) == 2 && top(2) == 6 ? 0 : 1; }
`);
});
