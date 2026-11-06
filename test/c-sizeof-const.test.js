// Silinx HLS (#2654, core/c-flatten.js, core/c-struct.js): a constant initialized by sizeof, const int N = sizeof T /
// sizeof T[0] at file scope, folded as a literal's: a loop's bound (no warning, a literal bound's trip count, cycles,
// latency and states), an array's size, a case's value, in VHDL and Verilog. Of a static const, a const unsigned, a C++
// constexpr, an enum constant, a constant of another, a struct's and a row's sizeof, a local const; co-simulated, and
// the C simulation, against cc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cToHdl } from '../core/c-hdl.js';
import { checkC } from '../core/c-check.js';
import { simulateC } from '../core/c-interp.js';
import { CC, noCC, against } from './c-helpers.js';

const said = (ds) => ds.map((d) => `${d.line} ${d.severity}: ${d.message}`);

/** A design's messages, its loops' report, its latency and its states. */
function made(src, lang, file = 'top.c') {
  const g = cToHdl(src, { file, lang });
  if (!g.report) return { said: said(g.diagnostics) };
  return { said: said(g.diagnostics), loops: g.report.loops, latency: g.report.latency, states: g.report.states };
}

const T = 'static const int T[5] = { 1, 2, 3, 4, 5 };\n';
const LOOP = 'int top(int x[8]) {\n  int s = 0;\n  for (int i = 0; i < N; i++) s += T[i] * x[i];\n  return s;\n}\n';
// (each: its declarations with sizeof, the same with the literal, the file)
const CASES = {
  'const int N = sizeof T / sizeof T[0]': [`${T}const int N = sizeof T / sizeof T[0];\n${LOOP}`, `${T}const int N = 5;\n${LOOP}`],
  'static const': [`${T}static const int N = sizeof T / sizeof T[0];\n${LOOP}`, `${T}static const int N = 5;\n${LOOP}`],
  'const unsigned, sizeof *T': [`${T}const unsigned N = sizeof T / sizeof *T;\n${LOOP}`, `${T}const unsigned N = 5;\n${LOOP}`],
  'C++ constexpr': [`${T}constexpr int N = sizeof T / sizeof T[0];\n${LOOP}`, `${T}constexpr int N = 5;\n${LOOP}`, 'top.cpp'],
  'an enum constant': [`${T}enum { N = sizeof T / sizeof *T };\n${LOOP}`, `${T}enum { N = 5 };\n${LOOP}`],
  'the enum constant after it': [`${T}enum { M = sizeof T / sizeof *T - 1, N };\n${LOOP}`, `${T}enum { M = 4, N };\n${LOOP}`],
  'a constant of another': [`${T}const int B = sizeof T;\nconst int N = B / sizeof(int);\n${LOOP}`, `${T}const int B = 20;\nconst int N = B / 4;\n${LOOP}`],
  'a struct\'s sizeof': [`${T}struct P { int a; short b; short c; int d; };\nconst int N = sizeof(struct P) / 3 + 1;\n${LOOP}`, `${T}struct P { int a; short b; short c; int d; };\nconst int N = 5;\n${LOOP}`],
  'a row\'s sizeof, sizeof M[0] / sizeof M[0][0]': [
    'static const int M[3][5] = { { 1 }, { 2 } };\nconst int N = sizeof M[0] / sizeof M[0][0];\nint top(int x[8]) {\n  int s = 0;\n  for (int i = 0; i < N; i++) s += M[1][i] * x[i];\n  return s;\n}\n',
    'static const int M[3][5] = { { 1 }, { 2 } };\nconst int N = 5;\nint top(int x[8]) {\n  int s = 0;\n  for (int i = 0; i < N; i++) s += M[1][i] * x[i];\n  return s;\n}\n'],
  'a local const': [`${T}int top(int x[8]) {\n  const int n = sizeof T / sizeof T[0];\n  int s = 0;\n  for (int i = 0; i < n; i++) s += T[i] * x[i];\n  return s;\n}\n`,
    `${T}int top(int x[8]) {\n  const int n = 5;\n  int s = 0;\n  for (int i = 0; i < n; i++) s += T[i] * x[i];\n  return s;\n}\n`],
  'an array\'s size, int buf[N]': [
    `${T}const int N = sizeof T / sizeof T[0];\nint top(int x[8]) {\n  int buf[N];\n  for (int i = 0; i < N; i++) buf[i] = x[i];\n  int s = 0;\n  for (int i = 0; i < N; i++) s += buf[i] * T[i];\n  return s;\n}\n`,
    `${T}const int N = 5;\nint top(int x[8]) {\n  int buf[N];\n  for (int i = 0; i < N; i++) buf[i] = x[i];\n  int s = 0;\n  for (int i = 0; i < N; i++) s += buf[i] * T[i];\n  return s;\n}\n`],
};

test('#2654 a constant of sizeof: no message, its loops\' trip counts, cycles, latency and states a literal\'s, in VHDL and Verilog', () => {
  for (const [name, [src, literal, file]] of Object.entries(CASES)) {
    for (const lang of ['vhdl', 'verilog']) {
      const a = made(src, lang, file), b = made(literal, lang, file);
      assert.deepEqual(a.said, [], `${name} ${lang}`);
      assert.deepEqual(b.said, [], `${name} ${lang}: the literal`);
      assert.ok(a.loops.every((l) => l.trip === 5) && a.latency.max !== null, name);
      assert.deepEqual([a.loops, a.latency, a.states], [b.loops, b.latency, b.states], `${name} ${lang}`);
    }
  }
});

test('#2654 the checker\'s trip counts: the constants of sizeof folded', () => {
  for (const [name, [src, , file]] of Object.entries(CASES)) {
    assert.ok(checkC(src, file ?? 'top.c').loops.every((l) => l.trip === 5), name);
  }
});

// (a combinational design: the arrays sizeof'd, not read)
const HW = `static const int T[5] = { 1, 2, 3, 4, 5 };
static const short M[3][7] = { { 1 } };
struct P { int a; short b; char c; };
const int N = sizeof T / sizeof T[0];
static const unsigned R = sizeof M[0] / sizeof M[0][0];
enum { E = sizeof T / sizeof *T + 1, F };
const int G = N * R + E;
const int S = sizeof(struct P);
int top(int v) {
  const int n = sizeof M / sizeof *M;
  int b[N];
  for (int i = 0; i < N; i++) b[i] = v + i;
  int s = 0;
  for (int i = 0; i < R; i++) s += b[i % N];
  switch (v & 15) { case E: s += 1000; break; case F: s += 2000; break; default: break; }
  return s + G * 10000 + S * 100 + n + (int)sizeof b;
}
`;

test('#2654 the constants of sizeof co-simulated in VHDL and Verilog against cc, with no message', { skip: noCC }, () => {
  against(HW, 'top', { ins: [{ name: 'v', w: 32, s: true }], ret: { w: 32, s: true }, n: 20 });
  for (const lang of ['vhdl', 'verilog']) assert.deepEqual(said(cToHdl(HW, { file: 'top.c', lang }).diagnostics), [], lang);
});

test('#2654 the C simulation: the constants of sizeof as cc\'s', () => {
  const src = `#include <stdio.h>\n${HW}int main(void) {\n  printf("%d %d %d %d %d %d\\n", N, (int)R, E, F, G, S);\n  for (int v = 3; v < 8; v++) printf("%d\\n", top(v));\n  return 0;\n}\n`;
  const sim = simulateC(src, { file: 'tb.c' });
  assert.deepEqual([sim.error, sim.exitCode, said(sim.diagnostics)], [null, 0, []]);
  assert.equal(sim.output.split('\n')[0], '5 7 6 7 41 8');
  if (!CC) return;
  const dir = mkdtempSync(join(tmpdir(), 'sizeof-const-'));
  try {
    writeFileSync(join(dir, 'tb.c'), src);
    execFileSync(CC, ['-o', join(dir, 'tb'), join(dir, 'tb.c')]);
    assert.equal(sim.output, execFileSync(join(dir, 'tb')).toString().replace(/\r\n/g, '\n'));   // (Windows' cc writes CRLF)
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('#2654 an enum constant not a constant still said', () => {
  assert.deepEqual(said(checkC('enum { A = q };\nint top(int v) { return v + A; }\n', 'top.c').diagnostics),
    ["1 error: the enum constant 'A': its value must be a constant"]);
});
