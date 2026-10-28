// Silinx HLS, #pragma HLS LOOP_TRIPCOUNT (#1921): min= / max= / avg= constant expressions of the constants known
// (`max=c_dim*c_dim` with `const unsigned int c_dim = 4;`, as Vitis HLS's array-partition examples write it, spaces
// included), read by core/c-pragma.js's tripcountArgs and core/c-parse.js's parseExpression, evaluated by
// core/c-check.js's constValue; a name that is not a constant said. The loop's bound in the report, the design
// co-simulated in VHDL and Verilog.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkC, constValue } from '../core/c-check.js';
import { parseExpression } from '../core/c-parse.js';
import { tripcountArgs } from '../core/c-pragma.js';
import { cosimulate } from '../core/c-cosim.js';

const LOOP = '5:3 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)';
const SRC = (prag, head = 'const unsigned int c_dim = 4;\n') => `#include <stdio.h>
${head}int sum(int a[16], int n) {
  int s = 0;
  for (int i = 0; i < n; i++) {
#pragma HLS LOOP_TRIPCOUNT ${prag}
    s += a[i];
  }
  return s;
}
int main(void) { int a[16]; for (int k = 0; k < 16; k++) a[k] = k * 3 - 7; printf("%d %d %d\\n", sum(a, 0), sum(a, 5), sum(a, 16)); return 0; }
`;
/** The loop's bound and the messages of checkC. */
function check(src, file = 'sum.c') {
  const r = checkC(src, file);
  return { max: r.loops.find((l) => l.fn === 'sum').max, messages: r.diagnostics.map((d) => `${d.line}:${d.col} ${d.severity}: ${d.message}`) };
}

test('#1921 tripcountArgs: each value the text up to the next key, spaces included; parseExpression: one expression or null', () => {
  assert.deepEqual(tripcountArgs('HLS LOOP_TRIPCOUNT min = c_dim* c_dim max = c_dim * c_dim'), { min: 'c_dim* c_dim', max: 'c_dim * c_dim' });
  assert.deepEqual(tripcountArgs('HLS loop_tripcount max=16 avg=(N + 1) / 2'), { max: '16', avg: '(N + 1) / 2' });
  assert.deepEqual(tripcountArgs('HLS LOOP_TRIPCOUNT max=c_max == 1 ? 4 : 8'), { max: 'c_max == 1 ? 4 : 8' });
  assert.deepEqual(tripcountArgs('HLS LOOP_TRIPCOUNT'), {});
  const consts = new Map([['c_dim', 4n]]);
  assert.equal(constValue(parseExpression('c_dim* c_dim'), consts), 16n);
  assert.equal(constValue(parseExpression('(c_dim + 1) << 2'), consts), 20n);
  assert.equal(constValue(parseExpression('n * 2'), consts), null);
  for (const t of ['', 'c_dim c_dim', '4 +', 'a = 3; b']) assert.equal(parseExpression(t), null, t);
});

test('#1921 max= / min= / avg= of const globals: the loop\'s bound, no warning (as max=16); a macro and a local const too', () => {
  assert.deepEqual(check(SRC('max=16')), { max: 16, messages: [] });
  assert.deepEqual(check(SRC('max=c_dim*c_dim')), { max: 16, messages: [] });
  // (Vitis HLS's examples: spaces around = and in the expression, min= first)
  assert.deepEqual(check(SRC('min = c_dim* c_dim max = c_dim * c_dim avg = c_dim * 2')), { max: 16, messages: [] });
  assert.deepEqual(check(SRC('max=c_dim*c_dim', 'const unsigned int c_dim = 4;\n'), 'sum.cpp'), { max: 16, messages: [] });
  assert.deepEqual(check(SRC('max=MAX_SIZE * K', '#define MAX_SIZE 8\nconst int K = MAX_SIZE / 4;\n')), { max: 16, messages: [] });
  assert.deepEqual(check(SRC('max=c_dim * c_dim').replace('  int s = 0;\n', '  const int c_dim = 3;\n  int s = 0;\n')).max, 9);
});

test('#1921 a name that is not a constant (a variable, an unknown name), a negative or wrong value: said, naming it; the bound unknown as before', () => {
  const said = (v, why) => `6:1 warning: #pragma HLS LOOP_TRIPCOUNT ${v}: ${why}: ignored (a number, or an expression of const integers)`;
  assert.deepEqual(check(SRC('max=n*c_dim')), { max: null, messages: [LOOP, said('max=n*c_dim', "'n' is not a constant")] });
  assert.deepEqual(check(SRC('max=c_size')), { max: null, messages: [LOOP, said('max=c_size', "'c_size' is not a constant")] });
  assert.deepEqual(check(SRC('max=-1')), { max: null, messages: [LOOP, said('max=-1', 'not a constant whole number')] });
  assert.deepEqual(check(SRC('max=c_dim/0')), { max: null, messages: [LOOP, said('max=c_dim/0', 'not a constant whole number')] });
  // (min= and avg= the same: said, max= still the bound)
  assert.deepEqual(check(SRC('min=s max=c_dim avg=x + n')), { max: 4, messages: [said('min=s', "'s' is not a constant"), said('avg=x + n', "'x', 'n' are not constants")] });
  // (a non-const global is not a constant)
  assert.deepEqual(check(SRC('max=c_dim', 'unsigned int c_dim = 4;\n')), { max: null, messages: [LOOP, said('max=c_dim', "'c_dim' is not a constant")] });
});

test('#1921 the bound in the report, the design co-simulated in VHDL and Verilog (a pass, the same cycles as max=16)', () => {
  const run = (prag) => ['vhdl', 'verilog'].map((lang) => {
    const r = cosimulate(SRC(prag), { file: 'sum.c', lang });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, lang);
    return { latency: r.latency, loops: r.gen.report.loops.map(({ line, trip, max, ii, cycles }) => ({ line, trip, max, ii, cycles })), messages: r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`) };
  });
  const ref = run('max=16');
  const got = run('min = c_dim max = c_dim * c_dim');
  assert.deepEqual(got, ref);
  for (const g of got) assert.deepEqual(g, { latency: { min: 3, max: 67, avg: 31 }, loops: [{ line: 5, trip: null, max: 16, ii: 4, cycles: 65 }], messages: [] });
  // (a variable: the loop made as before, its cycles unknown, both warnings)
  for (const g of run('max=n')) {
    assert.deepEqual(g.loops, [{ line: 5, trip: null, max: null, ii: 4, cycles: null }]);
    assert.deepEqual(g.messages, [LOOP.replace(/^5:3/, '5'), "6 warning: #pragma HLS LOOP_TRIPCOUNT max=n: 'n' is not a constant: ignored (a number, or an expression of const integers)"]);
  }
});
