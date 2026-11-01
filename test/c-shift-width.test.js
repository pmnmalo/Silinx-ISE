// Silinx HLS (#2309): a shift by a constant count of the value's width or more, undefined in C: the C simulation takes
// g++'s value (its constant folding: 0, or -1 for a negative value shifted right; checked with g++ 15 at -O0), said with
// a warning once per place; a count known only when it runs, or a negative one, still stops the run; synthesis refuses it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';

const TOP = 'int top(int a) { return a + 1; }\n';
const said = (r) => r.diagnostics.map((d) => `${d.line}:${d.col} ${d.severity}: ${d.message}`);
const W = (line, col, n, w, v) => `${line}:${col} warning: a shift by ${n} of a ${w}-bit value is undefined in C: the C simulation takes g++'s value, ${v} (synthesis refuses it)`;

test('#2309 1 << 32 of a constant count: g++\'s values (0, -1 >> 32 -1, 1LL << 64 0), each place said once', () => {
  const r = simulateC(`${TOP}#include <stdio.h>
const char FFT_INPUT_WIDTH = 32;
int main() {
  const int max = 1 << FFT_INPUT_WIDTH; // might not work for > 32 bits!
  const int half = (max / 2) - 1;
  int b = 1 << 32, c = (-1) >> 32, m = 1 << 40;
  long long l = 1LL << 64;
  for (int i = 0; i < 3; i++) b += 1 << 32;
  printf("%d %d %d %d %d %lld\\n", max, half, b, c, m, l);
  return 0;
}
`, { file: 't.cpp', top: 'top' });
  assert.deepEqual([r.error, r.exitCode, r.output], [null, 0, '0 -1 0 -1 0 0\n']);
  assert.deepEqual(said(r), [W(5, 21, 32, 32, 0), W(7, 13, 32, 32, 0), W(7, 29, 32, 32, -1), W(7, 42, 40, 32, 0), W(8, 21, 64, 64, 0), W(9, 38, 32, 32, 0)]);
});

test('#2309 a count known when it runs, or negative: the run stopped, as before; a shift within the width: no warning', () => {
  const run = (body) => simulateC(`${TOP}int main() { ${body} }\n`, { file: 't.cpp', top: 'top' });
  const r = run('int n = 32; int x = 1 << n; return x;');
  assert.deepEqual([r.ok, r.error?.message, said(r)], [false, 'a shift by 32 of a 32-bit value is undefined in C', []]);
  const neg = run('int x = 1 << -1; return x;');
  assert.deepEqual(said(neg), ['2:24 error: a shift by a negative amount (-1) is undefined in C']);
  const ok = run('return (1 << 31) != 0 ? 0 : 1;');
  assert.deepEqual([ok.exitCode, said(ok)], [0, []]);
});

test('#2309 the hardware: 1 << 32 refused by synthesis, VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const g = cToHdl('int top(int a) { return a + (1 << 32); }\n', { file: 't.c', top: 'top', lang });
    assert.equal(g.ok, false, lang);
    assert.deepEqual(said(g).filter((d) => / error: /.test(d)), ['1:32 error: a shift by 32 of a 32-bit value is undefined in C'], lang);
  }
});
