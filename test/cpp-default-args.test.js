// Silinx HLS C++ (#2309, core/cpp-default-args.js): a function's default arguments: the calls that leave them out given
// them (in a prototype or the definition, an expression, a call in an argument), the others kept; the function's
// hardware as with the arguments written, VHDL and Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cppDefaultArgs } from '../core/cpp-default-args.js';
import { scan } from '../core/c-lex.js';

const said = (r) => r.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const text = (src) => cppDefaultArgs(scan(src, 1, [])).map((t) => t.v).join(' ');

test('#2309 default arguments: given to the calls that leave them out', () => {
  const r = simulateC(`#include <stdio.h>
int scale(int x, int k = 2, int b = 1 + 2);
int scale(int x, int k, int b) { return x * k + b; }
float tol(float t = 1e-1) { return t; }
int top(int a) { return scale(a) + scale(a, 3) + scale(a, 1, 0); }
int main() { printf("%d %d %g %g\\n", top(5), scale(scale(1), 10), tol(), tol(2.5f)); return 0; }
`, { file: 't.cpp', top: 'top' });
  assert.deepEqual([said(r), r.exitCode, r.output], [[], 0, '36 53 0.1 2.5\n']);
});

test('#2309 the tokens: the declaration\'s = value taken out, a call\'s missing ones appended; a source with none unchanged', () => {
  assert.equal(text('int f(int a, int b = 4) { return a + b; } int g(void) { return f(f(1), 2) + f(3); }'),
    'int f ( int a , int b ) { return a + b ; } int g ( void ) { return f ( f ( 1 , 4 ) , 2 ) + f ( 3 , 4 ) ; }');
  const toks = scan('int f(int a) { int b = 2; return a = b; }', 1, []);
  assert.equal(cppDefaultArgs(toks), toks);
});

test('#2309 the hardware of a call with a default argument: as written in full, VHDL and Verilog, no warning', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const a = cToHdl('int add(int x, int k = 3) { return x + k; }\nint top(int a) { return add(a); }\n', { file: 't.cpp', top: 'top', lang });
    const b = cToHdl('int add(int x, int k) { return x + k; }\nint top(int a) { return add(a, 3); }\n', { file: 't.cpp', top: 'top', lang });
    assert.deepEqual([a.ok, said(a)], [true, []], lang);
    assert.equal(a.hdl, b.hdl, lang);
  }
});
