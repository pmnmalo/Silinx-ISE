// Silinx HLS (#1960): a called function that is not inlined, a sub-module with its own block protocol, shared by its calls
// (core/c-submodule.js): #pragma HLS INLINE, INLINE off and INLINE recursive as Vitis HLS takes them, each design
// co-simulated in VHDL and in Verilog, its warnings asserted, the report's latency and resources per function.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cAsm } from '../core/c-asm.js';
import { cosimulate } from '../core/c-cosim.js';
import { inlineMode, moduleRegistry, hierarchy } from '../core/c-submodule.js';
import { checkC } from '../core/c-check.js';

const warns = (g) => g.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
/** Made and co-simulated in both languages, the same warnings, every call's values as the C's. */
function both(src, warnings = [], file = 'a.cpp') {
  let out = null;
  for (const lang of ['vhdl', 'verilog']) {
    const g = cToHdl(src, { file, lang });
    assert.equal(g.ok, true, JSON.stringify(g.diagnostics));
    assert.deepEqual(warns(g), warnings, lang);
    const c = cosimulate(src, { file, lang });
    assert.equal(c.ok && c.pass, true, `${lang}: ${JSON.stringify({ e: c.errors, m: c.mismatches?.slice(0, 3) })}`);
    if (lang === 'vhdl') out = { g, c };
  }
  return out;
}
const inst = (g, m) => (g.hdl.match(new RegExp(`entity work\\.${m} port map`, 'g')) || []).length;
const ents = (g) => [...g.hdl.matchAll(/^entity (\w+) is/gm)].map((x) => x[1]);

const SUM = `int sum(int n) {
#pragma HLS INLINE off
  static int calls = 0;
  calls = calls + 1;
  int s = 0;
  for (int i = 0; i < 8; i++) {
#pragma HLS PIPELINE off
    s += n + i;
  }
  return s;
}
`;

test('#1960 INLINE off: a module of its own, ap_ctrl_hs, its calls sharing one instance; the report per function, its latency the co-simulation\'s', () => {
  const src = `${SUM}int top(int a, int b) {
  int x = sum(a);
  int y = sum(b + 1);
  return x + y;
}
int main() { return top(1, 2) == (8 + 28) + (24 + 28) ? 0 : 1; }
`;
  const { g, c } = both(src);
  assert.deepEqual(ents(g), ['sum', 'top']);
  assert.equal(inst(g, 'sum'), 1);
  assert.deepEqual(g.ports.map((p) => p.name), ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'a', 'b', 'ap_return']);
  const [f] = g.report.functions;
  assert.deepEqual([f.name, f.instance, f.calls, f.sequential, f.of], ['sum', 'sum_U0', 2, true, null]);
  assert.ok(f.registerBits > 0 && f.states > 0);
  assert.equal(g.report.latency.max, c.latency.max);
  assert.equal(g.report.latency.min, c.latency.min);
});

test('#1960 inlined by default, by INLINE, and a function with no pragma: no module of its own (as before)', () => {
  for (const pragma of ['', '#pragma HLS INLINE\n']) {
    const src = `int sum(int n) {\n${pragma}  int s = 0;\n  for (int i = 0; i < 8; i++) s += n + i;\n  return s;\n}\nint top(int a) { return sum(a) + sum(a + 1); }\nint main() { return top(1) == (8 + 28) + (16 + 28) ? 0 : 1; }\n`;
    const { g } = both(src);
    assert.deepEqual(ents(g), ['top']);
    assert.deepEqual(g.report.functions, []);
  }
});

test('#1960 INLINE recursive: the functions it calls dissolved too, but one with INLINE off, as Vitis HLS\'s', () => {
  const leaf = (name, p = '') => `int ${name}(int n) {\n${p}  int s = 0;\n  for (int i = 0; i < 4; i++) s += n;\n  return s;\n}\n`;
  const src = `${leaf('a')}${leaf('b', '#pragma HLS INLINE off\n')}int mid(int n) {
#pragma HLS INLINE recursive
  return a(n) + b(n);
}
int top(int x) { return mid(x); }
int main() { return top(3) == 24 ? 0 : 1; }
`;
  const { g } = both(src);
  assert.deepEqual(ents(g), ['b', 'top']);
  // (on the top: all but off)
  const src2 = `${leaf('a')}int top(int x) {\n#pragma HLS INLINE recursive\n  return a(x);\n}\nint main() { return top(3) == 12 ? 0 : 1; }\n`;
  assert.deepEqual(ents(both(src2).g), ['top']);
});

test('#1960 a sub-module calling a sub-module: each once, callees first; the report\'s of', () => {
  const src = `${SUM}int twice(int n) {
#pragma HLS INLINE off
  return sum(n) + sum(n + 1);
}
int top(int a) { return twice(a) + sum(a); }
int main() { return top(1) == (36 + 44) + 36 ? 0 : 1; }
`;
  const { g } = both(src);
  assert.deepEqual(ents(g), ['sum', 'twice', 'top']);
  assert.deepEqual(g.report.functions.map((f) => [f.name, f.of]), [['twice', null], ['sum', 'twice'], ['sum', null]]);
});

test('#1960 pointers: an output taken when its _ap_vld comes (one the callee may not write keeps the caller\'s), read and written, passed on from the top', () => {
  const src = `void maybe(int v, int *o) {
#pragma HLS INLINE off
  for (int i = 0; i < 3; i++) { if (v > 0) *o = v + i; }
}
void bump(int *x) {
#pragma HLS INLINE off
  for (int i = 0; i < 2; i++) *x = *x + 1;
}
int top(int a, int *res) {
  int k = 5;
  maybe(a, &k);
  bump(&k);
  maybe(a, res);
  return k;
}
int main() { int o = 9; int e = 0; if (top(1, &o) != 5 || o != 3) e = 1; o = 9; if (top(-1, &o) != 7) e = 2; return e; }
`;
  const { g } = both(src);
  assert.deepEqual(ents(g), ['maybe', 'bump', 'top']);
  assert.equal(inst(g, 'maybe'), 1);
});

test('#1960 arrays: the top\'s ap_memory and a local array (a memory, whatever its size) the callee\'s during the call; streams too', () => {
  const src = `void fill(int a[8], int k) {
#pragma HLS INLINE off
  for (int i = 0; i < 8; i++) a[i] = k + i;
}
int total(int a[8]) {
#pragma HLS INLINE off
  int s = 0;
  for (int i = 0; i < 8; i++) s += a[i];
  return s;
}
int top(int src[8], int dst[8], int k) {
  int buf[8];
  fill(buf, k);
  fill(dst, k + 1);
  return total(buf) + total(src);
}
int main() { int in[8], out[8]; for (int i = 0; i < 8; i++) in[i] = i; int r = top(in, out, 1); return r == 36 + 28 && out[7] == 9 ? 0 : 1; }
`;
  const { g } = both(src);
  assert.deepEqual(ents(g), ['fill', 'total', 'top']);
  for (const n of ['src_address0', 'src_ce0', 'src_q0', 'dst_address0', 'dst_ce0', 'dst_we0', 'dst_d0']) assert.ok(g.ports.some((p) => p.name === n), n);
  const st = `#include "hls_stream.h"
void pass(hls::stream<int> &a, hls::stream<int> &b, int n) {
#pragma HLS INLINE off
  for (int i = 0; i < n; i++) b.write(a.read() + 1);
}
void top(hls::stream<int> &i, hls::stream<int> &o) {
  pass(i, o, 2);
  pass(i, o, 1);
}
int main() { hls::stream<int> a, b; for (int i = 0; i < 3; i++) a.write(i); top(a, b); int s = 0; for (int i = 0; i < 3; i++) s += b.read(); return s == 6 ? 0 : 1; }
`;
  const r = both(st, ['4 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)']);
  assert.equal(r.g.report.functions[0].calls, 2);
  assert.equal(r.g.report.latency.max, null);
});

test('#1960 a static: one, in the sub-module, its calls sharing it; called in a loop and an if, the loop not pipelined (said)', () => {
  const src = `int tally(int d) {
#pragma HLS INLINE off
  static int c = 0;
  c += d;
  return c;
}
int top(int n) {
  int s = 0;
  for (int i = 0; i < 4; i++) {
#pragma HLS PIPELINE II=1
    if (i != n) s += tally(i);
  }
  return s;
}
int main() { int e = 0; if (top(9) != 0 + 1 + 3 + 6) e = 1; if (top(0) != 7 + 9 + 12) e = 2; return e; }
`;
  const { g } = both(src, ['9 warning: #pragma HLS PIPELINE II=1: II=6 made (it calls a sub-module: a call waits for it)']);
  assert.deepEqual(ents(g), ['tally', 'top']);
  assert.equal(g.report.functions[0].sequential, true);
  assert.notEqual(g.report.loops[0].cycles, null);
});

test('#1960 INLINE off of a combinational function: in a sequential caller an instance with no clock; with a combinational top in its logic (said), as Vitis HLS\'s ports', () => {
  const comb = 'int add(int a, int b) {\n#pragma HLS INLINE off\n  return a + b;\n}\n';
  const seq = `${comb}int top(int n) {\n  int s = 0;\n  for (int i = 0; i < n; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=4\n    s = add(s, i);\n  }\n  return s;\n}\nint main() { return top(4) == 6 ? 0 : 1; }\n`;
  const { g } = both(seq);
  assert.deepEqual(ents(g), ['add', 'top']);
  assert.deepEqual([g.report.functions[0].sequential, g.report.functions[0].latency], [false, { min: 0, max: 0 }]);
  const flat = `${comb}int top(int x) { return add(x, 1); }\nint main() { return top(1) == 2 ? 0 : 1; }\n`;
  const r = both(flat, ["2 warning: #pragma HLS INLINE off: 'add' and its caller are combinational (latency 0): its logic is in its caller's, no module of its own"]);
  assert.deepEqual(ents(r.g), ['top']);
});

test('#1960 what cannot be one is said: a global its caller uses too (inlined), a bad option; a call of an array element\'s address refused', () => {
  const src = `int g;
void inc(int d) {
#pragma HLS INLINE off
  for (int i = 0; i < 2; i++) g += d;
}
int top(int d) { inc(d); return g; }
int main() { return top(1) == 2 ? 0 : 1; }
`;
  const r = both(src, ["3 warning: #pragma HLS INLINE off: 'inc' is inlined: the global variable 'g' is used by its caller too"]);
  assert.deepEqual(ents(r.g), ['top']);
  // (a global only it uses: its own)
  const mine = `int g;\nint inc(int d) {\n#pragma HLS INLINE off\n  for (int i = 0; i < 2; i++) g += d;\n  return g;\n}\nint top(int d) { return inc(d); }\nint main() { return top(1) == 2 ? 0 : 1; }\n`;
  assert.deepEqual(ents(both(mine).g), ['inc', 'top']);
  const bad = cToHdl('int f(int a) {\n#pragma HLS INLINE foo\n  return a;\n}\nint top(int x) { return f(x); }\n', { file: 'a.c' });
  assert.deepEqual(warns(bad), ['2 warning: #pragma HLS INLINE foo: not one of off and recursive: ignored']);
});

test('#1960 the machine\'s chart: the call a state that starts it and waits', () => {
  const src = `${SUM}int top(int a) { return sum(a); }\nint main() { return top(1) == 36 ? 0 : 1; }\n`;
  const r = cAsm(src, { file: 'a.c' });
  assert.equal(r.ok, true, JSON.stringify(r.diagnostics));
  const text = JSON.stringify(r.model);
  assert.ok(text.includes('sum: ap_start = 1') && text.includes('sum_ap_done'));
});

test('#1960 the pieces: inlineMode, hierarchy, moduleRegistry', () => {
  const c = checkC('int a(int x) {\n#pragma HLS INLINE off\n  return x;\n}\nint b(int x) {\n#pragma HLS INLINE recursive\n  return x;\n}\nint d(int x) {\n#pragma HLS INLINE\n  return x;\n}\nint e(int x) { return x; }\nint top(int x) { return a(x) + b(x) + d(x) + e(x); }\n', 'a.c', { top: 'top' });
  assert.deepEqual(['a', 'b', 'd', 'e'].map((n) => inlineMode(c.funcs.get(n))), ['off', 'recursive', 'on', null]);
  const h = hierarchy(c.funcs.get('top'), c.funcs, new Map());
  assert.deepEqual(['a', 'b', 'd', 'e', 'top'].map((n) => h.sub(c.funcs.get(n), false)), [true, false, false, false, false]);
  assert.equal(h.sub(c.funcs.get('a'), true), true);
  const made = [];
  const reg = moduleRegistry({ make: (callee, depths, module) => { made.push(module); if (callee === 'f') reg.of('g'); return { ok: true }; } });
  assert.equal(reg.of('f').module, 'f');
  assert.equal(reg.of('f', {}).module, 'f');
  assert.equal(reg.of('f', { a: 4 }).module, 'f_1');
  assert.deepEqual(reg.modules().map((m) => m.module), ['g', 'f', 'f_1']);
  assert.deepEqual(made, ['f', 'g', 'f_1']);
});
