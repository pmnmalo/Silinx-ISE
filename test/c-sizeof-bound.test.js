// Silinx HLS (#2643, core/c-sizeof.js, core/c-check.js): a loop bounded by sizeof, i < sizeof a / sizeof a[0], its count
// known as a literal bound's: no warning, and its report (trip count, cycles, latency, states) a literal bound's, in
// VHDL and Verilog (its hardware #2641's: test/c-sizeof.test.js). Of a char array, a row, a macro, a const variable, a global array, <=, !=, counting down,
// stepped by sizeof(int), unrolled, pipelined; an array parameter's (a pointer's 8 bytes) still said unknown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { checkC } from '../core/c-check.js';

const said = (ds) => ds.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const COUNT = 'the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)';

/** A design's messages, its loops' report, its latency and its states. */
function made(src, lang) {
  const g = cToHdl(src, { file: 'top.c', lang });
  if (!g.report) return { said: said(g.diagnostics) };
  return { said: said(g.diagnostics), loops: g.report.loops, latency: g.report.latency, states: g.report.states };
}

// (each: the design with its bound, the bound as sizeof, the same as a literal; b a local copy of x, a memory)
const COPY = 'int top(int x[8]) {\n  int b[8];\n  char c[6];\n  for (int i = 0; i < 8; i++) { b[i] = x[i]; c[i % 6] = x[i]; }\n  int s = 0;\n';
const CASES = {
  'sizeof b / sizeof b[0]': [(n) => `${COPY}  for (int i = 0; i < ${n}; i++) s += b[i];\n  return s;\n}\n`, 'sizeof b / sizeof b[0]', '8'],
  'a cast, (int)(sizeof b / sizeof *b)': [(n) => `${COPY}  for (int i = 0; i < ${n}; i++) s += b[i];\n  return s;\n}\n`, '(int)(sizeof b / sizeof *b)', '8'],
  'a char array, sizeof c': [(n) => `${COPY}  for (int i = 0; i < ${n}; i++) s += c[i];\n  return s;\n}\n`, 'sizeof c', '6'],
  'a row, sizeof m[0] / sizeof m[0][0]': [(n) => `int top(int m[3][4]) {\n  int s = 0;\n  for (int i = 0; i < ${n}; i++) s += m[1][i];\n  return s;\n}\n`, 'sizeof m[0] / sizeof m[0][0]', '4'],
  'the rows of an argument\'s row, sizeof m[0][0] * 4 / sizeof(int)': [(n) => `int top(int m[3][4]) {\n  int s = 0;\n  for (int i = 0; i < ${n}; i++) s += m[2][i];\n  return s;\n}\n`, 'sizeof m[0][0] * 4 / sizeof(int)', '4'],
  'a macro, #define N (sizeof b / sizeof *b)': [(n) => `#define N ${n}\n${COPY}  for (int i = 0; i < N; i++) s += b[i];\n  return s;\n}\n`, '(sizeof b / sizeof *b)', '8'],
  'a const variable, const int n = sizeof b / sizeof b[0]': [(n) => `${COPY}  const int n = ${n};\n  for (int i = 0; i < n; i++) s += b[i];\n  return s;\n}\n`, 'sizeof b / sizeof b[0]', '8'],
  'a global array, sizeof T / sizeof T[0]': [(n) => `static const int T[5] = { 1, 2, 3, 4, 5 };\nint top(int x[8]) {\n  int s = 0;\n  for (int i = 0; i < ${n}; i++) s += T[i] * x[i];\n  return s;\n}\n`, 'sizeof T / sizeof T[0]', '5'],
  'an array its initializer sizes, int w[] = { … }': [(n) => `int top(int x[8]) {\n  int w[] = { 3, 1, 4, 1, 5, 9, 2 };\n  int s = 0;\n  for (int i = 0; i < ${n}; i++) s += w[i] * x[i];\n  return s;\n}\n`, 'sizeof w / sizeof w[0]', '7'],
  '<=': [(n) => `${COPY}  for (int i = 0; i <= ${n}; i++) s += b[i];\n  return s;\n}\n`, 'sizeof b / sizeof b[0] - 1', '7'],
  '!=': [(n) => `${COPY}  for (int i = 0; i != ${n}; i++) s += b[i];\n  return s;\n}\n`, 'sizeof b / sizeof b[0]', '8'],
  'counting down from sizeof': [(n) => `${COPY}  for (int i = ${n}; i >= 0; i--) s += b[i] * i;\n  return s;\n}\n`, 'sizeof b / sizeof b[0] - 1', '7'],
  'stepped by sizeof(int)': [(n) => `${COPY}  for (int i = 0; i < ${n}; i += sizeof(int)) s += b[i / 4];\n  return s;\n}\n`, 'sizeof b', '32'],
  '#pragma HLS UNROLL': [(n) => `${COPY}  for (int i = 0; i < ${n}; i++) {\n#pragma HLS UNROLL\n    s += b[i];\n  }\n  return s;\n}\n`, 'sizeof b / sizeof b[0]', '8'],
  '#pragma HLS UNROLL factor=2': [(n) => `${COPY}  for (int i = 0; i < ${n}; i++) {\n#pragma HLS UNROLL factor=2\n    s += b[i];\n  }\n  return s;\n}\n`, 'sizeof b / sizeof b[0]', '8'],
  '#pragma HLS PIPELINE': [(n) => `${COPY}  for (int i = 0; i < ${n}; i++) {\n#pragma HLS PIPELINE II=1\n    s += b[i] * b[i];\n  }\n  return s;\n}\n`, 'sizeof b / sizeof b[0]', '8'],
};

test('#2643 a loop bounded by sizeof: no warning, its trip count, cycles, latency and states a literal bound\'s, in VHDL and Verilog', () => {
  for (const [name, [src, bound, literal]] of Object.entries(CASES)) {
    for (const lang of ['vhdl', 'verilog']) {
      const a = made(src(bound), lang), b = made(src(literal), lang);
      assert.deepEqual(a.said, [], `${name} ${lang}`);
      assert.deepEqual(b.said, [], `${name} ${lang}: the literal`);
      assert.ok(a.loops.at(-1).trip > 0 && a.latency.max !== null, name);
      assert.deepEqual([a.loops, a.latency, a.states], [b.loops, b.latency, b.states], `${name} ${lang}`);
    }
  }
});

test('#2643 the trip counts: the checker\'s loops, sizeof folded as the literal', () => {
  const trips = (src) => checkC(src, { file: 'top.c' }).loops.map((l) => l.trip);
  assert.deepEqual(trips(CASES['a char array, sizeof c'][0]('sizeof c')), [8, 6]);
  assert.deepEqual(trips(CASES['stepped by sizeof(int)'][0]('sizeof b')), [8, 8]);
  // (a global constant of a global array's: the checker's, synthesis refuses its initializer yet, #2654)
  assert.deepEqual(trips('static const int T[5] = { 1 };\nconst int TN = sizeof T / sizeof T[0];\nint top(int x[8]) {\n  int s = 0;\n  for (int i = 0; i < TN; i++) s += T[i] * x[i];\n  return s;\n}\n'), [5]);
  assert.deepEqual(trips(CASES['counting down from sizeof'][0]('sizeof b / sizeof b[0] - 1')), [8, 8]);
  // (a scalar's, a type's, a long long's, a short's array, an array of pointers', a struct's not known here: unknown)
  assert.deepEqual(trips('int top(int v) { long long q; short h[3][5]; int s = 0;\n'
    + '  for (int i = 0; i < sizeof v + sizeof q + sizeof(char) + sizeof h + sizeof h[2] + sizeof(int *[2]); i++) s += i;\n  return s; }\n'), [4 + 8 + 1 + 30 + 10 + 16]);
});

test('#2643 an array parameter\'s sizeof, a pointer\'s 8 bytes: the loop\'s count still said unknown', () => {
  const src = 'int f(int a[8]) {\n  int s = 0;\n  for (int i = 0; i < sizeof a / sizeof a[0]; i++) s += a[i];\n  return s;\n}\nint top(int x[8]) { return f(x); }\n';
  const p = 'int top(int x[8], int *p) {\n  int s = 0;\n  for (int i = 0; i < sizeof p; i++) s += x[i];\n  return s;\n}\n';
  for (const lang of ['vhdl', 'verilog']) {
    assert.deepEqual(made(src, lang).said, [`3 warning: ${COUNT}`], lang);
    assert.deepEqual(made(p, lang).said, [`3 warning: ${COUNT}`], lang);
  }
  assert.deepEqual(checkC(src, { file: 'top.c' }).loops.map((l) => l.trip), [null]);
  // (its row's a constant all the same: sizeof a[0] of int a[][4], 16 bytes)
  assert.deepEqual(checkC('int top(int a[][4]) {\n  int s = 0;\n  for (int i = 0; i < sizeof a[0] / sizeof(int); i++) s += a[0][i];\n  return s;\n}\n', { file: 'top.c' }).loops.map((l) => l.trip), [4]);
});
