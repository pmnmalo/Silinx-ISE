// Silinx HLS (#2749, core/c-interp.js): the C simulation's switch takes a case whose value is a named constant (a
// global or local const, a static const, an enum constant, a constant of another, a constant expression, a sizeof one),
// as synthesis does; default and fallthrough as before. The C simulation as cc's (enum constants: GCC takes no const
// int as a case label in C), the named constants against the values written out; no diagnostics.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { noCC, compiledRun } from './c-helpers.js';

const SRC = `#include <stdio.h>
const int A = 3;
static const int B = A + 2;
enum colour { RED = 7, GREEN, BLUE = 12 };
static const short T[] = { 1, 2, 3, 4 };
const int N = sizeof T / sizeof T[0];
#define M 20
int pick(int v) {
  const int L = 9;
  int r = 0;
  switch (v) {
    case 1: r = 100; break;
    case A: r = 300; break;
    case B: r = 500; break;
    case N: r = 400; break;
    case RED: r = 700;          /* fallthrough */
    case GREEN: r += 8; break;
    case L: r = 900; break;
    case BLUE * 2 - 1: r = 2300; break;
    case M: r = 2000; break;
    case 'a': r = 97; break;
    default: r = -1;
  }
  return r;
}
int main(void) {
  for (int v = 0; v <= 24; v++) printf("%d %d\\n", v, pick(v));
  printf("%d\\n", pick('a'));
  return 0;
}
`;

// (GCC rejects a case of a const int in C, "case label does not reduce to an integer constant": cc sees only enum
// constants, macros and literals; the named constants are checked against the values written out below)
const ENUM_SRC = `#include <stdio.h>
enum colour { RED = 7, GREEN, BLUE = 12 };
enum { TWICE = BLUE * 2 - 1 };
#define M 20
int pick(int v) {
  int r = 0;
  switch (v) {
    case 1: r = 100; break;
    case RED: r = 700;          /* fallthrough */
    case GREEN: r += 8; break;
    case BLUE: r = 1200; break;
    case TWICE: r = 2300; break;
    case BLUE - RED + M: r = 2500; break;
    case M: r = 2000; break;
    case 'a': r = 97; break;
    default: r = -1;
  }
  return r;
}
int main(void) {
  for (int v = 0; v <= 26; v++) printf("%d %d\\n", v, pick(v));
  printf("%d\\n", pick('a'));
  return 0;
}
`;

test('#2749 a case of an enum constant, a constant expression of them: the C simulation as cc\'s, no diagnostics', { skip: noCC }, () => {
  const sim = simulateC(ENUM_SRC, { file: 'sw.c' });
  assert.deepEqual([sim.error, sim.exitCode, sim.diagnostics], [null, 0, []]);
  assert.equal(sim.output, compiledRun(ENUM_SRC).output);
  assert.match(sim.output, /^7 708\n8 8\n/m);
});

test('#2749 the cases taken (an independent reference: the values written out)', () => {
  const sim = simulateC(SRC, { file: 'sw.c' });
  assert.deepEqual([sim.error, sim.exitCode, sim.diagnostics], [null, 0, []]);
  const got = Object.fromEntries(sim.output.trim().split('\n').slice(0, -1).map((l) => l.split(' ').map(Number)));
  const want = { 1: 100, 3: 300, 4: 400, 5: 500, 7: 708, 8: 8, 9: 900, 20: 2000, 23: 2300 };
  for (let v = 0; v <= 24; v++) assert.equal(got[v], want[v] ?? -1, `pick(${v})`);
  assert.equal(sim.output.trim().split('\n').at(-1), '97');
});

test('#2749 a case of a C++ constexpr', () => {
  const sim = simulateC('#include <stdio.h>\nconstexpr int K = 4;\nint f(int v) { switch (v) { case K: return 1; case K + 1: return 2; default: return 0; } }\n'
    + 'int main() { for (int v = 3; v < 7; v++) printf("%d", f(v)); return 0; }\n', { file: 'k.cpp', top: 'f' });
  assert.deepEqual([sim.error, sim.exitCode, sim.diagnostics], [null, 0, []]);
  assert.equal(sim.output, '0120');
});
