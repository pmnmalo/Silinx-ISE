// Silinx HLS, the C simulation (#1528): core/c-interp.js and core/c-interp-expr.js. Each program's main() is run by the
// interpreter and compiled with the host's cc (-fsigned-char -fwrapv): the same output, character by character, and
// the same exit code. Also: the calls of the top function recorded (what co-simulation replays), and the run
// stopped with its place on a division by zero, an index outside an array, an endless loop. ap_int / ap_uint: values
// worked out by hand from Vitis HLS's rules, and every operator against AMD's ap_int.h compiled as C++ (#1588).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { CC, noCC, values, rng, lf } from './c-helpers.js';
import { apIntHeaders, runWithApInt } from './ap-int-ref.js';

const AP = await apIntHeaders();

/** The program's output and exit code, compiled with cc. */
function compiled(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ci-'));
  try {
    fs.writeFileSync(path.join(dir, 't.c'), src);
    execFileSync(CC, ['-std=c99', '-w', '-fsigned-char', '-fwrapv', '-O0', '-o', path.join(dir, 't'), path.join(dir, 't.c')]);
    try { return { output: lf(execFileSync(path.join(dir, 't'), { encoding: 'utf8' })), exitCode: 0 }; }
    catch (e) { return { output: e.stdout, exitCode: e.status }; }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
function same(src, { exit = null } = {}) {
  const sim = simulateC(src, { file: 't.c' });
  assert.equal(sim.error, null, JSON.stringify(sim.error));
  const ref = compiled(src);
  assert.equal(sim.output, ref.output);
  assert.equal(sim.exitCode, ref.exitCode);
  if (exit !== null) assert.equal(sim.exitCode, exit);
  return sim;
}

// #1860: on Windows the compiled program writes CRLF (the C runtime's text mode), the simulator LF; the reference's
// output is compared with its line ends made LF, its other characters (a lone \r, a printf("\r")) kept
test('a compiled program\'s output with LF line ends (#1860)', () => {
  assert.equal(lf('3\r\n-1 1e+10\r\n'), '3\n-1 1e+10\n');
  assert.equal(lf('a\rb\n'), 'a\rb\n');
  assert.equal(lf(''), '');
  assert.equal(lf(undefined), undefined);
});

test('C simulation against cc: printf\'s conversions, flags, widths and lengths; integer arithmetic, promotions and conversions', { skip: noCC }, () => {
  same(`#include <stdio.h>
#include <stdint.h>
int main(void) {
  int a = -1234; unsigned u = 4000000000u; char c = 'A'; short s = -7; long long ll = -9000000000LL;
  printf("%d|%5d|%-5d|%05d|%+d|% d|%i\\n", a, 42, 42, 42, 42, 42, a);
  printf("%u|%x|%X|%#x|%o|%#o|%08x\\n", u, u, 255, 255, 8, 8, 48879);
  printf("%c|%s|%.2s|%5s|%-5s|%%\\n", c, "text", "text", "ab", "ab");
  printf("%hd|%hhd|%hu|%hhu|%ld|%lld|%llu|%lx\\n", 70000, 300, 70000, 300, ll, ll, (unsigned long long)ll, 4096L);
  printf("%.5d|%8.3d|%-8.3d|\\n", 42, 42, -42);
  uint8_t b = 250; b += 10; int8_t sb = 127; sb++;
  printf("%d %d %d %d\\n", b, sb, (unsigned char)-1 > 0, -1 < 1u);
  printf("%d %d %d %d %d\\n", -7 / 2, -7 % 2, 7 / -2, 7 % -2, (-8) >> 1);
  printf("%u %d %d\\n", u + a, s * s, (int)(char)200);
  int x = 5; x <<= 3; x |= 1; x ^= 0xF0; x %= 77;
  printf("%d ", x); x++; printf("%d ", x); printf("%d\\n", ++x);
  return 3;
}
`, { exit: 3 });
});

test('C simulation against cc: control flow (if, switch with fall-through, loops with break / continue, do-while, ?:, && || skipping their right side), functions, pointers, arrays, statics and globals', { skip: noCC }, () => {
  same(`#include <stdio.h>
int count;
static int square(int v) { return v * v; }
static void bump(int *p, int by) { *p += by; count++; }
int sum(int a[], int n) { int s = 0; for (int i = 0; i < n; i++) s += a[i]; return s; }
int next_id(void) { static int id = 100; return id++; }
int main(void) {
  int t[6] = {5, -3, 8, 0, 2, 9};
  int k = 0;
  for (int i = 0; i < 6; i++) { if (t[i] == 0) continue; if (t[i] > 8) break; k += square(t[i]); }
  printf("k=%d sum=%d\\n", k, sum(t, 6));
  int v = 3;
  switch (v) { case 1: printf("one\\n"); case 3: printf("three\\n"); case 4: printf("four\\n"); break; default: printf("other\\n"); }
  int n = 0; do { n += 2; } while (n < 7);
  int z = 0;
  if (n > 100 && (z = 1)) printf("no\\n");
  if (n > 1 || (z = 2)) printf("yes z=%d\\n", z);
  bump(&n, 5); bump(&t[2], -8);
  int *p = &t[1]; p[1] = 77;
  int id1 = next_id(), id2 = next_id();   // (the order of a call's arguments is not C's: not in one printf)
  printf("n=%d t2=%d count=%d %d %d %d\\n", n, t[2], count, id1, id2, n > 10 ? n : -n);
  int m[2][3] = {{1, 2, 3}, {4, 5, 6}};
  m[1][0] += m[0][2] * 10;
  for (int r = 0; r < 2; r++) for (int q = 0; q < 3; q++) printf("%d ", m[r][q]);
  for (int i = 0, j = 10; i < j; i += 3, j--) printf("%d,%d ", i, j);
  printf("\\n");
  return 0;
}
`);
});

test('C simulation: the calls of the top function recorded (arguments, pointers before and after, the returned value); ap_int / ap_uint as Vitis HLS computes them; a bool takes 0 or 1', () => {
  const r = simulateC(`#include "ap_int.h"
#include <stdio.h>
int mac(ap_int<8> a, ap_int<8> b, int *acc, bool *big) {
  int p = a * b;
  *acc = *acc + p;
  *big = p;
  return p;
}
int main(void) {
  int acc = 10; bool big = 0;
  for (int i = 0; i < 3; i++) printf("%d ", mac(i * 50, -3, &acc, &big));
  ap_uint<8> x = 200, y = 100; ap_int<4> c = -3;
  printf("| %d %d %d %d %d %d %d\\n", (int)(x + y), (x - y).to_int(), (y - x).to_int(), (x * c).to_int(), (int)x.range(7, 4), (int)x[7], acc);
  return 0;
}`, { file: 'mac.c' });
  assert.equal(r.error, null);
  assert.equal(r.top, 'mac');
  // i * 50 as ap_int<8>: 0, 50, 100
  assert.equal(r.output, '0 -150 -300 | 300 100 -100 -600 12 1 -440\n');
  assert.deepEqual(r.calls.map((c) => [c.args.a, c.args.b, c.ptrIn.acc, c.ptrOut.acc, c.ptrOut.big, c.ret]),
    [[0n, -3n, 10n, 10n, 0n, 0n], [50n, -3n, 10n, -140n, 1n, -150n], [100n, -3n, -140n, -440n, 1n, -300n]]);
});

test('C simulation: the run stopped where it fails (division by zero, an index outside an array, an endless loop), the output up to there kept; a source with errors not run', () => {
  const err = (src, opts) => { const r = simulateC(src, { file: 't.c', ...opts }); return [r.ok, r.output, r.error && `${r.error.line}:${r.error.message}`]; };
  assert.deepEqual(err('#include <stdio.h>\nint f(int a) { return a; }\nint main(void) {\n  int z = 0;\n  printf("a");\n  return 1 / z;\n}'), [false, 'a', '6:division by zero']);
  assert.deepEqual(err('int f(int a) { return a; }\nint main(void) {\n  int t[3] = {0};\n  int i = 3;\n  return t[i];\n}'), [false, '', '5:the index 3 is outside the array (0 to 2)']);
  assert.deepEqual(err('int f(int a) { return a; }\nint main(void) {\n  int k = 0;\n  while (1) k++;\n  return k;\n}', { maxSteps: 1000 }), [false, '', '4:the C simulation stopped after 1,000 steps (an endless loop?)']);
  const bad = simulateC('int f(int n) { return n ? f(n - 1) : 0; }\nint main(void) { return f(3); }');
  assert.equal(bad.ok, false);
  assert.ok(bad.diagnostics.some((d) => /recursion/.test(d.message)));
  assert.deepEqual(err('int f(int a) { return a; }'), [false, '', '1:no main() to run: the C simulation runs the test bench, main()']);
});

test('#1588 C simulation against AMD\'s ap_int.h: every operator (arithmetic, bitwise, comparisons, unary, shifts, compound assignments) on ap_int / ap_uint of many widths and signs, their edge values', { skip: AP.why || false }, () => {
  const r = rng(7);
  const types = [[1, false], [3, true], [4, false], [8, true], [8, false], [13, true], [16, false], [31, true], [32, false]];
  const ty = ([w, s]) => `ap_${s ? '' : 'u'}int<${w}>`;
  const ops = ['+', '-', '*', '&', '|', '^', '<', '>', '==', '!=', '<=', '>='];
  const lines = [];
  let k = 0;
  for (const a of types) for (const b of types) {
    const va = values(a[0], a[1], 3, r), vb = values(b[0], b[1], 3, r);
    for (let i = 0; i < 3; i++, k++) {
      const x = `x${k}`, y = `y${k}`, yv = vb[(i + 1) % 3];
      lines.push(`  { ${ty(a)} ${x} = ${va[i]}LL; ${ty(b)} ${y} = ${yv}LL;`,
        `    printf("${k}:${ops.map(() => ' %lld').join('')}\\n", ${ops.map((o) => `(long long)(${x} ${o} ${y})`).join(', ')});`,
        ...(yv ? [`    printf("${k}/: %lld %lld\\n", (long long)(${x} / ${y}), (long long)(${x} % ${y}));`] : []),
        `    printf("${k}u: %lld %lld %lld %lld\\n", (long long)(-${x}), (long long)(~${x}), (long long)(${x} >> 2), (long long)(${x} << 3));`,
        `    ${x} += ${y}; printf("${k}=: %lld ", (long long)${x}); ${x} *= ${y}; printf("%lld ", (long long)${x}); ${x}++; printf("%lld\\n", (long long)${x}); }`);
    }
  }
  const src = `#include "ap_int.h"\n#include <stdio.h>\nint main(void) {\n${lines.join('\n')}\n  return 0;\n}\n`;
  const sim = simulateC(src, { file: 't.c' });
  assert.equal(sim.error, null, JSON.stringify(sim.error));
  assert.deepEqual(sim.output.split('\n'), runWithApInt(src, AP.dir).split('\n'));
});

test('#1598 the test bench\'s C library against cc: files written, read back (fscanf, fgets, feof), a golden file compared with system("diff …"), stderr, exit, abs, the headers\' macros', { skip: noCC }, () => {
  const src = `#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>
int f(int a) { return a * 3 - 7; }
int main() {
  FILE *fp = fopen("result.dat", "w");
  if (fp == NULL) return 9;
  for (int i = 0; i < 6; i++) fprintf(fp, "%d %x\\n", f(i), i * 17);
  fclose(fp);
  fp = fopen("result.dat", "r");
  int a, b, s = 0, n = 0;
  while (fscanf(fp, "%d %x", &a, &b) == 2) { s += a + b; n++; }
  fclose(fp);
  printf("n=%d s=%d abs=%d max=%d\\n", n, s, abs(-41), INT_MAX);
  char line[32];
  fp = fopen("golden.dat", "r");
  int lines = 0;
  while (fgets(line, 32, fp) != NULL) { lines++; printf("[%c]", line[0]); }
  printf(" %d %d\\n", lines, feof(fp) != 0);
  fclose(fp);
  fprintf(stderr, "");
  int same = system("diff --brief -w result.dat golden.dat");
  printf("same=%d none=%d\\n", same == 0, fopen("nope.dat", "r") == NULL);
  if (same != 0) exit(3);
  return EXIT_SUCCESS;
}
`;
  const golden = '-7  0\n-4 11\n-1 22\n2 33\n 5 44\n8 55\n';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-tb-'));
  try {
    fs.writeFileSync(path.join(dir, 't.c'), src);
    fs.writeFileSync(path.join(dir, 'golden.dat'), golden);
    execFileSync(CC, ['-std=c99', '-w', '-o', path.join(dir, 't'), path.join(dir, 't.c')]);
    let ref;
    try { ref = { output: lf(execFileSync(path.join(dir, 't'), { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })), exitCode: 0 }; } catch (e) { ref = { output: lf(e.stdout), exitCode: e.status }; }
    const sim = simulateC(src, { file: 't.c', files: { 'data/golden.dat': golden } });
    assert.equal(sim.error, null);
    assert.equal(sim.output, ref.output);
    assert.equal(sim.exitCode, ref.exitCode);
    assert.equal(sim.exitCode, 0);
    assert.equal(sim.files['result.dat'], fs.readFileSync(path.join(dir, 'result.dat'), 'utf8'));
    // a golden file that differs: diff says so, exit(3)
    const bad = simulateC(src, { file: 't.c', files: { 'golden.dat': golden.replace('55', '56') } });
    assert.deepEqual([bad.exitCode, /Files result\.dat and golden\.dat differ\nsame=0 none=1\n$/.test(bad.output)], [3, true]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  // what the test bench's library does not run: said
  const err = (s) => simulateC(s, { file: 't.c' }).error?.message;
  assert.equal(err('#include <stdlib.h>\nint main() { return system("ls"); }'), 'system("ls") cannot be run in Silinx\'s C simulation (only diff)');
  assert.equal(err('#include <stdio.h>\nint main() { FILE *f = fopen("x", "r"); fprintf(f, "a"); return 0; }'), 'fprintf: its file is not open (NULL)');
});

test('#1601 a labelled loop: synthesized and simulated as without its label, named in the report', () => {
  const src = 'int f(int n) {\n  int s = 0;\n  sum_loop: for (int i = 0; i < n; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=8\n    s += i;\n  }\n  return s;\n}\nint main() { return f(5) == 10 ? 0 : 1; }\n';
  const sim = simulateC(src, { file: 'l.c' });
  assert.deepEqual([sim.error, sim.exitCode, sim.diagnostics], [null, 0, []]);
  const g = cToHdl(src, { file: 'l.c' });
  assert.deepEqual(g.diagnostics, []);
  assert.deepEqual(g.report.loops.map((l) => [l.name, l.line]), [['sum_loop', 3]]);
  // a combinational function's labelled loop: unrolled as any other
  assert.deepEqual(cToHdl('int g(int a) {\n  int s = 0;\n  acc: for (int i = 0; i < 4; i++) s += a;\n  return s;\n}\n').diagnostics, []);
});

test('#1714 an ofstream closed in a loop (AMD\'s simple_fifos test bench): its writes after close() dropped, as C++ runs it; a file opened again written', () => {
  const cpp = '#include <iostream>\n#include <fstream>\n#include <stdlib.h>\nusing namespace std;\nint twice(int x) { return 2 * x; }\nint main() {\n  ofstream F;\n  F.open("r.dat");\n  for (int i = 0; i < 3; i++) { F << twice(i + 1) << endl; F.close(); }\n  F.open("g.dat");\n  F << 2 << endl;\n  F.close();\n  int r = system("diff --brief -w r.dat g.dat");\n  cout << r << endl;\n  return r;\n}\n';
  const sim = simulateC(cpp, { file: 'f.cpp' });
  assert.deepEqual([sim.error, sim.diagnostics, sim.exitCode, sim.output], [null, [], 0, '0\n']);
});

// #1757: a hexadecimal constant ending in F (or with an E) is an integer, its F / E hexadecimal digits: 0xFFFF is 65535
// (it was read as a float with the f suffix, 4095), 0x1F 31, 0xE 14; a decimal one with a fraction, an exponent or an f
// suffix is still a float
test('#1757 C simulation: a hexadecimal constant ending in F is an integer (0xFFFF 65535, 0x1F 31); 1.5f a float', () => {
  const src = '#include <stdio.h>\nint main(void) {\n  float f = 1.5f; double e = 2e1;\n  printf("%u %u %d %u %d %d\\n", 0xFFFF, 0x1F, 0xE, 0xAbCdEf, (int)(f * 2), (int)e);\n  return 0;\n}\n';
  const r = simulateC(src, { file: 't.c' });
  assert.deepEqual([r.ok, r.diagnostics.map((d) => d.message), r.output, r.exitCode], [true, ['no function to synthesize: Silinx HLS makes the top function into a module (main() is the test bench)'], '65535 31 14 11259375 3 20\n', 0]);
});
