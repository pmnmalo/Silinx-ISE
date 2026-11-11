// Silinx HLS: a sub-module's instances (#2244, core/c-submodule.js), as Vitis HLS makes them: one a call; ALLOCATION
// instances=f limit=N function, N, the calls on them in turn; FUNCTION_INSTANTIATE variable=v, a call's constant v a
// constant of a module of its own (its port gone); a function with no pragma and a loop of its own a sub-module with the
// option large (off by default until Vitis HLS's modules are recorded, scripts/hls-vitis.mjs). Each design co-simulated
// in VHDL and Verilog, its warnings asserted, its modules and instances counted in the HDL and the report.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';

const warns = (g) => g.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
/** Made and co-simulated in both languages, the same warnings, every call's values as the C's. */
function both(src, warnings = [], opts = {}) {
  let out = null;
  for (const lang of ['vhdl', 'verilog']) {
    const g = cToHdl(src, { file: 'a.cpp', lang, ...opts });
    assert.equal(g.ok, true, JSON.stringify(g.diagnostics));
    assert.deepEqual(warns(g), warnings, lang);
    const c = cosimulate(src, { file: 'a.cpp', lang, ...opts });
    assert.equal(c.ok && c.pass, true, `${lang}: ${JSON.stringify({ e: c.errors, m: c.mismatches?.slice(0, 3) })}`);
    if (lang === 'vhdl') out = { g, c };
  }
  return out;
}
const ents = (g) => [...g.hdl.matchAll(/^entity (\w+) is/gm)].map((x) => x[1]);
const insts = (g) => g.report.functions.map((f) => [f.module, f.instance, f.calls]);

const ACC = (pragmas = '') => `int acc(int n, int k) {
#pragma HLS INLINE off
${pragmas}  int s = 0;
  for (int i = 0; i < 4; i++) {
#pragma HLS PIPELINE off
    s += n * k + i;
  }
  return s;
}
`;

test('#2244 a sub-module called three times: three instances of its module, one a call, as Vitis HLS makes them (was one shared)', () => {
  const { g, c } = both(`${ACC()}int top(int a, int b) {\n  return acc(a, 1) + acc(b, 2) + acc(a + b, 3);\n}\nint main() { return top(1, 2) == (4 + 6) + (16 + 6) + (36 + 6) ? 0 : 1; }\n`);
  assert.deepEqual(ents(g), ['acc', 'top']);
  assert.deepEqual(insts(g), [['acc', 'acc_U0', 1], ['acc', 'acc_U1', 1], ['acc', 'acc_U2', 1]]);
  assert.equal(g.report.latency.max, c.latency.max);
});

test('#2244 ALLOCATION instances=acc limit=1 function: one instance, its calls sharing it; limit=2: two, the calls on them in turn', () => {
  const src = (n) => `${ACC()}int top(int a, int b) {\n#pragma HLS ALLOCATION instances=acc limit=${n} function\n  return acc(a, 1) + acc(b, 2) + acc(a + b, 3);\n}\nint main() { return top(1, 2) == (4 + 6) + (16 + 6) + (36 + 6) ? 0 : 1; }\n`;
  assert.deepEqual(insts(both(src(1)).g), [['acc', 'acc_U0', 3]]);
  assert.deepEqual(insts(both(src(2)).g), [['acc', 'acc_U0', 2], ['acc', 'acc_U1', 1]]);
});

test('#2244 FUNCTION_INSTANTIATE variable=k: a module for each constant k, k a constant in it (no port); a call whose k is not a constant the module with the port', () => {
  const src = `${ACC('#pragma HLS FUNCTION_INSTANTIATE variable=k\n')}int top(int a, int b) {\n  return acc(a, 1) + acc(b, 2) + acc(a, b) + acc(b, 1);\n}\nint main() { return top(1, 2) == (4 + 6) + (16 + 6) + (8 + 6) + (8 + 6) ? 0 : 1; }\n`;
  const { g } = both(src);
  assert.deepEqual(ents(g), ['acc', 'acc_1', 'acc_2', 'top']);
  // (acc with k 1, with k 2 and with its port k; the two calls with k 1 two instances of one module)
  assert.deepEqual(insts(g), [['acc', 'acc_U0', 1], ['acc_1', 'acc_1_U0', 1], ['acc_2', 'acc_2_U0', 1], ['acc', 'acc_U1', 1]]);
  const port = (m) => new RegExp(`entity ${m} is[\\s\\S]*?\\n    k : in`).test(g.hdl.split(/^entity /m).find((x) => x.startsWith(`${m} is`)) ? `entity ${g.hdl.split(/^entity /m).find((x) => x.startsWith(`${m} is`))}` : '');
  assert.deepEqual(['acc', 'acc_1', 'acc_2'].map(port), [false, false, true]);
});

test('#2244 FUNCTION_INSTANTIATE misused: no such argument, a pointer; outside a function: warnings, ignored', () => {
  const src = `int f(int n, int *p) {
#pragma HLS INLINE off
#pragma HLS FUNCTION_INSTANTIATE variable=m
#pragma HLS FUNCTION_INSTANTIATE variable=p
  int s = 0;
  for (int i = 0; i < 3; i++) {
#pragma HLS PIPELINE off
    s += n + *p;
  }
  return s;
}
int top(int a) { int q = 2; return f(a, &q); }
int main() { return top(1) == 9 ? 0 : 1; }
`;
  // (f and the top fit the clock with no state: f's logic in the top's, #1960)
  both(src, ["2 warning: #pragma HLS INLINE off: 'f' and its caller are combinational (latency 0): its logic is in its caller's, no module of its own",
    "3 warning: #pragma HLS FUNCTION_INSTANTIATE variable=m: no such argument of 'f': ignored",
    '4 warning: #pragma HLS FUNCTION_INSTANTIATE variable=p: a pointer, an array, a stream or a struct, not a value: ignored']);
});

test('#2244 large: a function with no pragma and a loop of its own a sub-module (a call outside any loop); in a loop, or with UNROLL, inlined; off by default', () => {
  const src = `int sum(int n) {
  int s = 0;
  for (int i = 0; i < 8; i++) s += n + i;
  return s;
}
int sq(int n) {
  int s = 0;
  for (int i = 0; i < 3; i++) {
#pragma HLS UNROLL
    s += n;
  }
  return s;
}
int top(int a) {
  int t = sum(a) + sq(a);
  for (int k = 0; k < 2; k++) t += sum(k);
  return t;
}
int main() { return top(1) == (8 + 28) + 3 + 28 + (8 + 28) ? 0 : 1; }
`;
  assert.deepEqual(ents(both(src).g), ['top']);
  const { g } = both(src, [], { large: true });
  assert.deepEqual(ents(g), ['top']);
  // (sum called in the loop too: inlined everywhere, its loop would wait for it; alone, a module)
  const alone = src.replace('  for (int k = 0; k < 2; k++) t += sum(k);\n', '').replace('(8 + 28) + 3 + 28 + (8 + 28)', '(8 + 28) + 3');
  const a = both(alone, [], { large: true }).g;
  assert.deepEqual(ents(a), ['sum', 'top']);
  assert.deepEqual(insts(a), [['sum', 'sum_U0', 1]]);
});
