// Silinx HLS (#2640, core/c-parse.js, core/c-check.js): an array of chars initialised from a string, char b[] = "abc":
// its size the string's length and its '\0', a size given zero-filled after the string, one just the string's length
// without its '\0', a string longer than its array an error; { "abc" }, unsigned char, signed char, const, at file
// scope and static, arrays of arrays of strings, sizeof and strlen. The C simulation as the host's cc (its output
// written here, for a machine with none), synthesis co-simulated in VHDL and Verilog against cc, its warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { noCC, compiledRun, against, COMB } from './c-helpers.js';

const said = (ds) => ds.map((d) => `${d.line} ${d.severity}: ${d.message}`);

const SIM = `#include <stdio.h>
#include <string.h>
#define N 6
char g[] = "file";
const unsigned char u[N] = "\\xff\\x80z";
int f(void) { static char s[] = "st"; s[0]++; return s[0] * 100 + (int)sizeof s; }
int main(void) {
  char a[] = "abc";
  char b[8] = "abc";
  char c[3] = "abc";
  char d[] = { "brace" };
  signed char e[] = "\\xff";
  const char h[] = "hi" "!";
  char m[][4] = { "ab", "cde" };
  char t[2][3] = { "xyz", "w" };
  char z[] = "";
  int s = 0;
  for (int i = 0; i < 8; i++) s = s * 3 + b[i];
  printf("%d %d %d %d %d %d\\n", a[0], a[1], a[2], a[3], (int)sizeof a, (int)strlen(a));
  printf("%d %d %d %d\\n", s, b[3], b[7], (int)sizeof b);
  printf("%d %d %d %d\\n", c[0], c[2], (int)sizeof c, d[4] + d[5] * 1000 + (int)sizeof d * 10000);
  printf("%d %d %d %s %d\\n", e[0], e[1], (int)sizeof e, h, (int)sizeof h);
  printf("%d %d %d %d %d %d\\n", m[0][1], m[0][2], m[1][2], m[1][3], (int)sizeof m, (int)sizeof m[1]);
  printf("%d %d %d %d %d\\n", t[0][2], t[1][0], t[1][1], t[1][2], (int)sizeof t);
  printf("%d %d %d %d\\n", (int)sizeof z, z[0], (int)strlen(g), (int)sizeof g);
  printf("%d %d %d %d %d\\n", u[0], u[1], u[2], u[5], (int)sizeof u);
  int x = f();
  printf("%d %d %s %d\\n", x, f(), g, (int)strlen("abcd"));
  return 0;
}
`;
const SIM_OUT = '97 98 99 0 4 3\n307638 0 0 8\n97 99 3 60101\n-1 0 2 hi! 4\n98 0 101 0 8 4\n122 119 0 0 6\n1 0 4 5\n255 128 122 0 6\n11603 11703 file 4\n';

test('#2640 the C simulation: arrays of chars from strings, their sizes, their \'\\0\'s, as cc\'s', () => {
  const sim = simulateC(SIM, { file: 'str.c' });
  assert.deepEqual([sim.error, sim.exitCode, said(sim.diagnostics)], [null, 0, []]);
  assert.equal(sim.output, SIM_OUT);
});

test('#2640 the expected output is the host\'s cc', { skip: noCC }, () => {
  assert.equal(compiledRun(SIM).output, SIM_OUT);
});

test('#2640 the issue\'s char b[] = "abc": b[1] and sizeof b (they failed, 0)', () => {
  const sim = simulateC('int top(int v) { return v; }\nint main(void) { char b[] = "abc"; return b[1] + (int)sizeof b; }\n', { file: 'b.c' });
  assert.deepEqual([sim.error, sim.exitCode, said(sim.diagnostics)], [null, 102, []]);
});

const LOCAL = `int top(int v, int k) {
  char a[] = "abc";
  char b[8] = "hi";
  char c[3] = { "xyz" };
  const signed char e[] = "\\x80";
  char m[][4] = { "ab", "cde" };
  a[v & 3] += v;
  return a[k & 3] + b[k & 7] * 3 + c[(k >> 3) & 1] * 5 + e[k & 1] * 13 + m[k & 1][(k >> 1) & 3] * 17
    + (int)(sizeof a + sizeof b * 10 + sizeof c * 100 + sizeof m * 1000);
}
`;

test('#2640 synthesis: local arrays of chars from strings (sized, of arrays, const, signed): co-simulated in VHDL and Verilog against cc', { skip: noCC }, () => {
  against(LOCAL, 'top', { ins: [{ name: 'v', w: 32, s: true }, { name: 'k', w: 32, s: true }], ret: { w: 32, s: true }, n: 24 });
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(said(cToHdl(LOCAL, { file: 'top.c', lang, clock: COMB }).diagnostics), [], lang);
});

// (a ROM and a memory that keeps its values between calls: clocked, the test bench's calls co-simulated)
const MEM = `#include <stdio.h>
static const char G[] = "Silinx";
char W[8] = "wx";
int top(int v, int k) {
  static const unsigned char u[] = "\\xff\\x01";
  W[k & 7] ^= v;
  return G[k % 7] * 7 + u[(k >> 3) % 3] * 11 + W[(k >> 4) & 7] * 19 + (int)(sizeof G * 100 + sizeof u * 10000);
}
int main(void) {
  for (int k = 0; k < 40; k++) printf("%d\\n", top(k * 5 + 1, k * 7));
  return 0;
}
`;

test('#2640 synthesis: a ROM and a memory of chars from strings (at file scope, static const): co-simulated in VHDL and Verilog, the C simulation as cc', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(MEM, { file: 'top.c', lang });
    assert.deepEqual([r.errors, r.pass, r.calls, r.sim.exitCode], [[], true, 40, 0], lang);
    assert.deepEqual(said(r.gen.diagnostics), [], lang);
  }
  if (!noCC) assert.equal(simulateC(MEM, { file: 'top.c' }).output, compiledRun(MEM).output);
});

test('#2640 synthesis: a string\'s array no longer refused (a string only in printf), its size the string\'s', () => {
  const g = cToHdl('int top(int v) { char b[] = "abc"; return b[v & 3] + sizeof b * 1000; }\n', { file: 'top.c', lang: 'verilog' });
  assert.deepEqual(said(g.diagnostics), []);
  assert.ok(g.hdl);
  const r = cToHdl('static const char G[] = "abc";\nint top(int v) { return G[v & 3]; }\n', { file: 'top.c', lang: 'verilog' });
  assert.deepEqual(said(r.diagnostics), []);
});

test('#2640 errors: a string longer than its array, in the C simulation and synthesis; a pointer\'s string, a string elsewhere, as they were', () => {
  const sim = simulateC('int top(int v) { return v; }\nint main(void) { char b[2] = "abc"; return b[0]; }\n', { file: 'l.c' });
  assert.deepEqual(said(sim.diagnostics), ['2 error: \'b\': the string "abc" is longer than its 2 characters']);
  assert.deepEqual(said(cToHdl('char G[1] = "ab";\nint top(int v) { return G[0] + v; }\n', { file: 'top.c', lang: 'verilog' }).diagnostics),
    ['1 error: \'G\': the string "ab" is longer than its 1 characters']);
  assert.deepEqual(said(cToHdl('int top(int v) { char m[][2] = { "abc" }; return m[0][v & 1]; }\n', { file: 'top.c', lang: 'verilog' }).diagnostics),
    ['1 error: \'m\': the string "abc" is longer than its 2 characters']);
  // (an array of ints, a string: not C's; a string elsewhere in hardware: only in printf)
  assert.deepEqual(said(cToHdl('int top(int v) { int b[4] = "abc"; return b[v & 3]; }\n', { file: 'top.c', lang: 'verilog' }).diagnostics),
    ['1 error: a string is only possible in printf (ignored by synthesis)']);
  const p = simulateC('#include <string.h>\nint top(int v) { return v; }\nint main(void) { const char *s = "hello"; char b[] = "hey"; return (int)strlen(s) * 10 + (int)strlen(b); }\n', { file: 'p.c' });
  assert.deepEqual([p.error, p.exitCode, said(p.diagnostics)], [null, 53, []]);
});
