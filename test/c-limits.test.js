// Silinx HLS: the limits of a C source (#3558, core/c-limits.js), each one error of the file where it is passed, not a
// RangeError, an out-of-memory or minutes: an array's elements, a memory's bits in the hardware, the parser's nesting
// (parentheses, statements), an expression's depth (a chain of operators), a macro's expansion and its nesting, and what
// no limit catches (the stack's overflow itself). At each limit the source is accepted (co-simulated in VHDL and in
// Verilog where it makes hardware), one past it refused with its exact error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkC } from '../core/c-check.js';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { MAX_ARRAY_ELEMENTS, MAX_MEMORY_BITS, MAX_NESTING, MAX_EXPR_DEPTH, MAX_MACRO_TOKENS, DEEP_MESSAGE, NESTING_MESSAGE, STMT_NESTING_MESSAGE, EXPR_DEPTH_MESSAGE, arrayMessage, memoryMessage, macroMessage, macroNestingMessage } from '../core/c-limits.js';

const LANGS = ['vhdl', 'verilog'];
const rep = (k, s) => Array.from({ length: k }, () => s);
const msgs = (ds) => ds.map((d) => `${d.line}:${d.col}: ${d.severity}: ${d.message}`);
const error = (line, col, message) => `${line}:${col}: error: ${message}`;
const TOP = 'int top(int i) { return a[1][i]; }\nint main() { return 0; }\n';

/** The same errors from the check, the C simulation and the synthesis (both languages), none of them throwing. */
function refused(src, errors) {
  assert.deepEqual(msgs(checkC(src, 't.c', { top: 'top', synthesis: true }).diagnostics), errors, 'checkC');
  const s = simulateC(src, { file: 't.c' });
  assert.deepEqual([s.ok, msgs(s.diagnostics)], [false, errors], 'simulateC');
  for (const lang of LANGS) {
    const g = cToHdl(src, { file: 't.c', top: 'top', lang });
    assert.deepEqual([g.ok, msgs(g.diagnostics)], [false, errors], lang);
  }
}
/** The source checked with no diagnostics, its test bench passing, co-simulated in both languages with no warnings. */
function accepted(src) {
  assert.deepEqual(msgs(checkC(src, 't.c', { top: 'top', synthesis: true }).diagnostics), [], 'checkC');
  const s = simulateC(src, { file: 't.c' });
  assert.deepEqual([s.ok, s.exitCode, s.diagnostics], [true, 0, []], 'simulateC');
  for (const lang of LANGS) {
    const c = cosimulate(src, { file: 't.c', top: 'top', lang });
    assert.deepEqual([c.ok, c.pass, c.mismatches, c.errors, c.gen.diagnostics], [true, true, [], [], []], lang);
  }
}

test('#3558 the limits: their values and messages', () => {
  assert.deepEqual([MAX_ARRAY_ELEMENTS, MAX_MEMORY_BITS, MAX_NESTING, MAX_EXPR_DEPTH, MAX_MACRO_TOKENS], [4194304, 8388608, 256, 1024, 65536]);
  assert.equal(arrayMessage('g', 5), "'g': an array of 5 elements: at most 4194304 (Silinx HLS)");
  assert.equal(memoryMessage('g', 5, 8), "'g': 5 elements of 8 bits in the hardware: at most 8388608 bits (four times the largest device's block RAMs)");
  assert.equal(NESTING_MESSAGE, 'expression nested more than 256 levels deep (parentheses, calls, indexes, ?:, assignments)');
  assert.equal(STMT_NESTING_MESSAGE, 'statement nested more than 256 levels deep (blocks, if and else if, loops, switch)');
  assert.equal(EXPR_DEPTH_MESSAGE, 'expression more than 1024 operators deep (a chain of 1024 operators, x + x + …, is that deep): split it into several statements');
  assert.equal(macroMessage('M'), "the expansion of the macro 'M' is longer than 65536 tokens");
  assert.equal(macroNestingMessage('M'), "the macro 'M': macros nested more than 256 levels deep");
});

test('#3558 an array of 100 million elements: refused before it is made (one error), 2^22 accepted by the check', () => {
  const src = (n) => `int g[${n}];\nint top(int i) { g[i] = i; return g[i]; }\nint main() { return top(3) == 3 ? 0 : 1; }\n`;
  refused(src(100000000), [error(1, 5, arrayMessage(null, 100000000))]);
  refused(src(MAX_ARRAY_ELEMENTS + 1), [error(1, 5, arrayMessage(null, MAX_ARRAY_ELEMENTS + 1))]);
  assert.deepEqual(checkC(src(MAX_ARRAY_ELEMENTS), 't.c', { top: 'top' }).diagnostics, []);
  // (all its dimensions: 4096 x 1025 refused once, an inner dimension too large refused once, not again outside)
  assert.deepEqual(msgs(checkC(`int a[4096][1025];\n${TOP}`, 't.c', { top: 'top' }).diagnostics), [error(1, 5, arrayMessage(null, 4096 * 1025))]);
  assert.deepEqual(msgs(checkC(`int a[2][5000000];\n${TOP}`, 't.c', { top: 'top' }).diagnostics), [error(1, 5, arrayMessage(null, 5000000))]);
  assert.deepEqual(checkC(`int a[4096][1024];\n${TOP}`, 't.c', { top: 'top' }).diagnostics, []);
});

test('#3558 a test bench\'s array of a size known when it runs, and malloc: refused by the C simulation, at the declaration', () => {
  const vla = simulateC('int top(int x) { return x; }\nint main() {\n  int n = 5000000;\n  int a[n];\n  a[0] = 1;\n  return top(a[0]) - 1;\n}\n', { file: 't.c' });
  assert.deepEqual([vla.ok, vla.error, vla.diagnostics], [false, { line: 4, col: 7, message: arrayMessage('a', 5000000) }, []]);
  const heap = simulateC('#include <stdlib.h>\nint top(int x) { return x; }\nint main() {\n  int *p = (int *) malloc(40000000);\n  p[0] = 1;\n  return top(p[0]) - 1;\n}\n', { file: 't.c' });
  assert.deepEqual([heap.ok, heap.error.line, heap.error.message], [false, 4, `malloc: ${arrayMessage(null, 10000000)}`]);
  const small = simulateC('#include <stdlib.h>\nint top(int x) { return x; }\nint main() {\n  int *p = (int *) malloc(400);\n  int n = 9;\n  int a[n];\n  a[8] = 1;\n  p[99] = 1;\n  return top(p[99] + a[8]) - 2;\n}\n', { file: 't.c' });
  assert.deepEqual([small.ok, small.exitCode, small.diagnostics], [true, 0, []]);
});

test('#3558 an array in the hardware: at most 2^23 bits (a memory, or values of a combinational module)', () => {
  // (a global written: a sequential module's memory; 64-bit words, 2^17 of them at the limit)
  const mem = (n) => `long long g[${n}];\nint top(int i) { g[i] = i; return (int) g[i]; }\nint main() { return top(3) == 3 ? 0 : 1; }\n`;
  const at = cToHdl(mem(MAX_MEMORY_BITS / 64), { file: 't.c', top: 'top' });
  assert.deepEqual([at.ok, at.diagnostics, at.report.memories], [true, [], [{ name: 'g', words: 131072, bits: 64, kind: 'RAM' }]]);
  for (const lang of LANGS) {
    const g = cToHdl(mem(MAX_MEMORY_BITS / 64 + 1), { file: 't.c', top: 'top', lang });
    assert.deepEqual([g.ok, msgs(g.diagnostics)], [false, [error(1, 11, memoryMessage('g', 131073, 64))]], lang);
  }
  assert.deepEqual(simulateC(mem(MAX_MEMORY_BITS / 64 + 1), { file: 't.c' }).exitCode, 0);   // (the C simulation: not hardware)
  // (a local array of a combinational top: its elements values of the logic)
  const local = (n) => `int top(int i) { long long g[${n}]; g[i] = i; return (int) g[i]; }\nint main() { return top(3) == 3 ? 0 : 1; }\n`;
  const g = cToHdl(local(MAX_MEMORY_BITS / 64 + 1), { file: 't.c', top: 'top' });
  assert.deepEqual([g.ok, msgs(g.diagnostics)], [false, [error(1, 28, memoryMessage('g', 131073, 64))]]);
});

test('#3558 a chain of 1024 operators: made and co-simulated; 1025 and 10 000: one error at the operator past the limit', () => {
  const src = (n) => `int top(int x) { return ${rep(n, 'x').join(' + ')}; }\nint main() { return top(1) == ${n} && top(3) == ${3 * n} ? 0 : 1; }\n`;
  accepted(src(MAX_EXPR_DEPTH + 1));
  refused(src(MAX_EXPR_DEPTH + 2), [error(1, 27, EXPR_DEPTH_MESSAGE)]);
  // (#3558's case: 10 000 terms, the operator 1025 from the last)
  refused(src(10000), [error(1, 27 + 4 * (10000 - 1026), EXPR_DEPTH_MESSAGE)]);
  // (unary operators and ?: chains count as operators)
  refused(`int top(int x) { return ${rep(MAX_EXPR_DEPTH + 1, '-').join(' ')}x; }\nint main() { return 0; }\n`, [error(1, 25 + 2 * MAX_EXPR_DEPTH, EXPR_DEPTH_MESSAGE)]);
  refused(`int top(int x) { return ${rep(3000, 'x == 1 ? 1 : ').join('')}0; }\nint main() { return 0; }\n`, [error(1, 25 + 13 * (MAX_EXPR_DEPTH - 1) + 2, EXPR_DEPTH_MESSAGE)]);
});

test('#3558 parentheses nested 255 deep: made; 256 and 3000: one error (the parser\'s nesting)', () => {
  const src = (n) => `int top(int x) { return ${'('.repeat(n)}x + 1${')'.repeat(n)}; }\nint main() { return top(1) == 2 ? 0 : 1; }\n`;
  accepted(src(MAX_NESTING - 1));
  refused(src(MAX_NESTING), [error(1, 25 + MAX_NESTING, NESTING_MESSAGE)]);
  refused(src(3000), [error(1, 25 + MAX_NESTING, NESTING_MESSAGE)]);
  // (a call's arguments, an index, an assignment's right side: levels too)
  refused(`int f(int x) { return x; }\nint top(int x) { return ${rep(300, 'f(').join('')}x${')'.repeat(300)}; }\nint main() { return 0; }\n`, [error(2, 25 + 2 * MAX_NESTING, NESTING_MESSAGE)]);
});

test('#3558 statements nested 255 deep (blocks, else if): made; 256 and 3000: one error', () => {
  const blocks = (n) => `int top(int x) { ${'{ '.repeat(n)}x++;${' }'.repeat(n)} return x; }\nint main() { return top(1) == 2 ? 0 : 1; }\n`;
  accepted(blocks(MAX_NESTING - 1));
  refused(blocks(MAX_NESTING), [error(1, 18 + 2 * MAX_NESTING, STMT_NESTING_MESSAGE)]);
  refused(blocks(3000), [error(1, 18 + 2 * MAX_NESTING, STMT_NESTING_MESSAGE)]);
  const elseIf = (n) => `int top(int x) {\n  int r = 0;\n${rep(n, 0).map((_, k) => `  if (x == ${k}) r = ${k + 1}; else\n`).join('')}  r = -1;\n  return r;\n}\nint main() { return top(1) == 2 && top(${n}) == -1 ? 0 : 1; }\n`;
  accepted(elseIf(MAX_NESTING - 1));
  // (the if past the limit's statement: the chain's rest skipped with it, no other error)
  refused(elseIf(MAX_NESTING), [error(2 + MAX_NESTING, 17, STMT_NESTING_MESSAGE)]);
  refused(elseIf(3000), [error(2 + MAX_NESTING, 17, STMT_NESTING_MESSAGE)]);
});

test('#3558 statements nested 24 deep: made in linear time (the float units\' scan was 2^depth: 15 s)', () => {
  const t0 = Date.now();
  const g = cToHdl(`int top(int x) { ${'{ '.repeat(24)}x++;${' }'.repeat(24)} return x; }\n`, { file: 't.c', top: 'top' });
  assert.deepEqual([g.ok, g.diagnostics], [true, []]);
  assert.ok(Date.now() - t0 < 5000, `${Date.now() - t0} ms`);
});

test('#3558 calls inside long expressions: each limit kept, the stack ran out: one error, not a RangeError', () => {
  const chain = (n) => rep(n, 'x').join(' + ');
  const deep = (e) => `${'{ '.repeat(20)}return ${e};${' }'.repeat(20)}`;
  // (16 functions, each calling the one before at the far end of a chain of 1023 operators, 20 blocks deep)
  const fs = rep(16, 0).map((_, k) => `int f${k}(int x) { ${deep(`${k ? `f${k - 1}(x)` : 'x'} + ${chain(MAX_EXPR_DEPTH - 1)}`)} }\n`).join('');
  const src = `${fs}int top(int x) { return f15(x) & 255; }\nint main() { top(1); return 0; }\n`;
  assert.deepEqual(checkC(src, 't.c', { top: 'top', synthesis: true }).diagnostics, []);
  const s = simulateC(src, { file: 't.c' });
  assert.deepEqual([s.ok, s.error?.message, s.diagnostics], [false, DEEP_MESSAGE, []]);
  for (const lang of LANGS) {
    const g = cToHdl(src, { file: 't.c', top: 'top', lang });
    assert.deepEqual([g.ok, msgs(g.diagnostics)], [false, [error(1, 1, DEEP_MESSAGE)]], lang);
  }
});

test('#3558 a macro that doubles 16 times: one error, no RangeError; 15 times (65 535 tokens) expanded', () => {
  const defs = (n, v) => { let s = `#define M0 ${v}\n`; for (let k = 1; k <= n; k++) s += `#define M${k} M${k - 1}${v === 'x' ? ' +' : ','} M${k - 1}\n`; return s; };
  refused(`${defs(16, 'x')}int top(int x) { return M16; }\nint main() { return 0; }\n`, [error(18, 1, macroMessage('M16'))]);
  refused(`${defs(40, 'x')}int top(int x) { return M40; }\nint main() { return 0; }\n`, [error(42, 1, macroMessage('M40'))]);
  // (32 768 ones and their commas: 65 535 tokens, an array's initial values)
  const ok = `${defs(15, '1')}const int g[32768] = { M15 };\nint top(int i) { return g[i]; }\nint main() { return top(0) + top(32767) == 2 ? 0 : 1; }\n`;
  assert.deepEqual(checkC(ok, 't.c', { top: 'top' }).diagnostics, []);
  const s = simulateC(ok, { file: 't.c' });
  assert.deepEqual([s.ok, s.exitCode, s.diagnostics], [true, 0, []]);
});

test('#3558 macros nested 256 deep: expanded; 300: one error at the macro past the limit', () => {
  const defs = (n) => { let s = '#define M0 x\n'; for (let k = 1; k <= n; k++) s += `#define M${k} M${k - 1}\n`; return s; };
  accepted(`${defs(MAX_NESTING - 1)}int top(int x) { return M${MAX_NESTING - 1} + 1; }\nint main() { return top(1) == 2 ? 0 : 1; }\n`);
  refused(`${defs(300)}int top(int x) { return M300 + 1; }\nint main() { return 0; }\n`, [error(302, 1, macroNestingMessage(`M${300 - MAX_NESTING}`))]);
});

test('#3558 a type nested 20 000 deep (a pointer\'s stars, an array\'s dimensions): the same one error, out of checkC too', () => {
  for (const decl of [`int ${'*'.repeat(20000)}p;`, `int a${'[2]'.repeat(5000)};`]) refused(`${decl}\nint top(int x) { return x; }\nint main() { return 0; }\n`, [error(1, 1, DEEP_MESSAGE)]);
});
