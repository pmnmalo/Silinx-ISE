// Silinx HLS (#2244): a global variable a sub-module (INLINE off) shares with its caller, a port of the sub-module as Vitis
// HLS makes it (core/c-submodule.js, sharedGlobals): an integer one a pointer's ports (g_i, g_o, g_o_ap_vld; g alone when
// it only reads it), an array a memory's, the caller's variable passed at each call; each design co-simulated in VHDL and
// in Verilog against the C, its warnings asserted. One a function it calls uses too: inlined, said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { simulateC } from '../core/c-interp.js';
import { hierarchy, sharedGlobals } from '../core/c-submodule.js';
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
const ents = (g) => [...g.hdl.matchAll(/^entity (\w+) is/gm)].map((x) => x[1]);
/** A module's ports in the VHDL: [name, dir]. */
const portsOf = (g, m) => {
  const body = new RegExp(`entity ${m} is\\n  port \\(\\n([\\s\\S]*?)\\n  \\);`).exec(g.hdl)[1];
  return body.split('\n').map((l) => /^\s*(\w+) : (in|out)/.exec(l)).map((x) => `${x[1]} ${x[2]}`);
};
const CTRL = ['ap_rst in', 'ap_start in', 'ap_done out', 'ap_idle out', 'ap_ready out'];
const SEQ = ['ap_clk in', ...CTRL];

test('#2244 a global integer its caller uses too: a port of the sub-module, g_i, g_o and g_o_ap_vld, as Vitis HLS makes it', () => {
  const src = `int g;
void inc(int d) {
#pragma HLS INLINE off
  for (int i = 0; i < 2; i++) g += d;
}
int top(int d) { inc(d); return g; }
int main() { int a = top(1); int b = top(2); return a == 2 && b == 6 ? 0 : 1; }
`;
  assert.equal(simulateC(src, { file: 'a.c' }).exitCode, 0);
  const { g, c } = both(src, [], 'a.c');
  assert.deepEqual(ents(g), ['inc', 'top']);
  assert.deepEqual(portsOf(g, 'inc'), [...CTRL, 'd in', 'g_i in', 'g_o out', 'g_o_ap_vld out']);
  // (the variable the top's: its ports none of the top's)
  assert.deepEqual(g.ports.map((p) => p.name), ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'd', 'ap_return']);
  assert.deepEqual(g.report.functions.map((f) => [f.name, f.instance, f.calls]), [['inc', 'inc_U0', 1]]);
  assert.deepEqual([g.report.latency, c.latency.min, c.latency.max], [{ min: 2, max: 2 }, 2, 2]);
});

test('#2244 globals shared by several sub-modules: arrays memories, one read only a port in, one written its _ap_vld, an instance a call', () => {
  const src = `int acc;
int hist[8];
int limit = 5;
void add(int x, int n) {
#pragma HLS INLINE off
  for (int i = 0; i < n; i++) {
#pragma HLS PIPELINE off
    hist[(x + i) & 7] += 1;
    acc += x;
  }
}
int peek(int k) {
#pragma HLS INLINE off
  int s = 0;
  for (int i = 0; i < 4; i++) {
#pragma HLS PIPELINE off
    s += hist[(k + i) & 7] * limit;
  }
  return s;
}
void put(int v) {
#pragma HLS INLINE off
  for (int i = 0; i < 2; i++) limit = v + i;
}
int top(int a, int b, int n) {
  add(a, n);
  add(b, n);
  put(a);
  hist[0] = hist[0] + acc;
  return peek(a) + peek(b) + acc + limit;
}
int main() {
  int r1 = top(1, 2, 3);
  int r2 = top(3, 0, 2);
  int r3 = top(5, 4, 4);
  return r1 == 33 && r2 == 167 && r3 == 609 ? 0 : 1;
}
`;
  assert.equal(simulateC(src, { file: 'a.cpp' }).exitCode, 0);
  const { g } = both(src, ['6 warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)']);
  assert.deepEqual(ents(g), ['add', 'put', 'peek', 'top']);
  const mem = (n, w) => [`${n}_address0 out`, `${n}_ce0 out`, ...(w ? [`${n}_we0 out`, `${n}_d0 out`] : []), `${n}_q0 in`];
  assert.deepEqual(portsOf(g, 'add'), [...SEQ, 'x in', 'n in', ...mem('hist', true), 'acc_i in', 'acc_o out', 'acc_o_ap_vld out']);
  assert.deepEqual(portsOf(g, 'peek'), [...SEQ, 'k in', ...mem('hist', false), 'limit in', 'ap_return out']);
  assert.deepEqual(portsOf(g, 'put'), [...SEQ, 'v in', 'limit out', 'limit_ap_vld out']);
  assert.deepEqual(g.report.functions.map((f) => [f.name, f.instance, f.calls]),
    [['add', 'add_U0', 1], ['add', 'add_U1', 1], ['put', 'put_U0', 1], ['peek', 'peek_U0', 1], ['peek', 'peek_U1', 1]]);
});

test('#2244 a global a function it calls uses too: inlined, said; a struct\'s member a port of its own; a global only it uses its own (no port)', () => {
  const nested = `int g;
int plus(int d) { return g + d; }
void inc(int d) {
#pragma HLS INLINE off
  for (int i = 0; i < 2; i++) g = plus(d);
}
int top(int d) { inc(d); return g; }
int main() { return top(1) == 2 ? 0 : 1; }
`;
  // (made only: an inlined function's read of a global is not yet the variable's, #3511)
  for (const lang of ['vhdl', 'verilog']) {
    const r = cToHdl(nested, { file: 'a.c', lang });
    assert.deepEqual(warns(r), ["4 warning: #pragma HLS INLINE off: 'inc' is inlined: the global variable 'g' is used by its caller too and by a function it calls"]);
    assert.deepEqual(r.ok && ents(r), lang === 'vhdl' ? ['top'] : []);
  }
  const struct = `struct P { int a; int b; };
P p;
void inc(int d) {
#pragma HLS INLINE off
  for (int i = 0; i < 2; i++) p.a += d;
}
int top(int d) { inc(d); return p.a + p.b; }
int main() { return top(1) == 2 ? 0 : 1; }
`;
  // (a struct's members variables of their own, #1590: each its own ports)
  const s = both(struct);
  assert.deepEqual(portsOf(s.g, 'inc'), [...SEQ, 'd in', 'p_a_i in', 'p_a_o out', 'p_a_o_ap_vld out']);
  const mine = `int g;\nint inc(int d) {\n#pragma HLS INLINE off\n  for (int i = 0; i < 2; i++) g += d;\n  return g;\n}\nint top(int d) { return inc(d); }\nint main() { return top(1) == 2 ? 0 : 1; }\n`;
  const m = both(mine, [], 'a.c');
  assert.deepEqual(ents(m.g), ['inc', 'top']);
  assert.deepEqual(portsOf(m.g, 'inc'), [...SEQ, 'd in', 'ap_return out']);
});

test('#2244 the pieces: hierarchy\'s shared globals, sharedGlobals the arguments and the calls', () => {
  const src = 'int g;\nint t[4];\nint s;\nvoid f(int d) {\n#pragma HLS INLINE off\n  g += d; t[d] = g;\n}\nvoid h(int d) {\n#pragma HLS INLINE off\n  s = d;\n}\nint top(int d) { f(d); h(d); return g + t[0]; }\n';
  const c = checkC(src, 'a.c', { top: 'top' });
  const globals = new Map(c.ast.items.filter((it) => it.kind === 'var').map((it) => [it.name, it]));
  const h = hierarchy(c.funcs.get('top'), c.funcs, globals);
  assert.deepEqual([...h.shared], [['f', ['g', 't']]]);
  assert.deepEqual([h.sub(c.funcs.get('f')), h.sub(c.funcs.get('h')), h.kept], [true, true, []]);
  sharedGlobals(c.funcs.get('f'), ['g', 't'], globals, c.funcs);
  const f = c.funcs.get('f');
  assert.deepEqual(f.params.map((p) => [p.name, p.type.kind]), [['d', 'int'], ['g', 'ptr'], ['t', 'array']]);
  // (g its uses *g; the call passes &g and t)
  assert.equal(f.body.items[1].e.l.kind, 'unary');
  const call = c.funcs.get('top').body.items[0].e;
  assert.deepEqual(call.args.map((a) => (a.kind === 'unary' ? `${a.op}${a.e.name}` : a.name)), ['d', '&g', 't']);
});
