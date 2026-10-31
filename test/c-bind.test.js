// Silinx HLS: the multiplications of different states bound to one unit (#2125): one multiplier in the HDL, its operands
// multiplexed by the state; a limit of blocks per cycle (the device's) kept by waiting for a later cycle; the results stay
// the C's (co-simulated in VHDL and in Verilog), no warnings.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkC } from '../core/c-check.js';
import { scheduled } from '../core/c-schedule.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';

const LANGS = ['vhdl', 'verilog'];
// (three multiplications, in states a loop keeps apart)
const TWO = `int f(short a, short b, short c, int n) {
  int x = a * b;
  for (int i = 0; i < n; i++) {
#pragma HLS LOOP_TRIPCOUNT max=8
    x = x + 1;
  }
  int y = c * b;
  for (int i = 0; i < n; i++) {
#pragma HLS LOOP_TRIPCOUNT max=8
    y = y + 2;
  }
  return x + y + a * c;
}
`;
const TWO_TB = `${TWO}int main() {
  int e = 0;
  for (int i = -3; i < 4; i++) if (f(i * 1000, 7 - i, i - 20000, 3) != (i * 1000) * (7 - i) + 3 + (i - 20000) * (7 - i) + 6 + (i * 1000) * (i - 20000)) e++;
  return e;
}
`;
const LATENCY = 11;
const stars = (hdl) => (hdl.match(/ \* /g) || []).length;

test('#2125 multiplications of different states: one unit, its operands multiplexed, the C\'s results, no warnings', () => {
  for (const lang of LANGS) {
    const g = cToHdl(TWO, { file: 't.c', lang, top: 'f', clock: 15 });
    assert.deepEqual(g.diagnostics, []);
    assert.deepEqual(g.report.units, [{ a: 16, b: 16, w: 32, blocks: 1, uses: 3, inputs: 3 }]);
    assert.equal(g.report.blocks, 1);
    assert.equal(stars(g.hdl), 1, lang);
    const c = cosimulate(TWO_TB, { file: 't.c', lang, top: 'f', clock: 15 });
    assert.deepEqual([c.pass, c.gen.diagnostics], [true, []], lang);
  }
});

test('#2125 the binding keeps the latency: the same states with no limit, the same cycles', () => {
  const m = scheduled(checkC(TWO, 't.c', { top: 'f', synthesis: true }), {}, { clock: 15 });
  assert.equal(m.units.length, 1);
  assert.equal(cToHdl(TWO, { file: 't.c', top: 'f', clock: 15 }).states, m.states.length + 2);
  // (2 cycles a call and 2 an iteration of each loop, 3 iterations: the binding adds none)
  const c = cosimulate(TWO_TB, { file: 't.c', top: 'f', clock: 15 });
  assert.deepEqual([c.pass, c.latency.min, c.latency.max], [true, LATENCY, LATENCY]);
});

test('#2125 no room in the period for the multiplexers: a unit each, the path within the budget', () => {
  // (at 10 ns each state's multiplication and its additions take 6.8 ns of 7.3: a multiplexer and its select do not fit)
  const g = cToHdl(TWO, { file: 't.c', top: 'f', clock: 10 });
  assert.deepEqual([g.diagnostics, g.report.units.map((u) => [u.uses, u.inputs]), g.report.unitsNs], [[], [[1, 1], [1, 1], [1, 1]], 0]);
  assert.equal(stars(g.hdl), 3);
});

test('#2125 the same multiplication in several states: one input, the multiplication as it was', () => {
  const src = 'int f(short a, short b, int n) {\n  int x = a * b;\n  for (int i = 0; i < n; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=8\n  x = x + a * b;\n  }\n  return x;\n}\n';
  const g = cToHdl(src, { file: 't.c', top: 'f' });
  assert.deepEqual([g.diagnostics, g.report.units.map((u) => [u.uses, u.inputs])], [[], [[2, 1]]]);
  assert.equal(stars(g.hdl), 1);
});

test('#2125 not bound: a multiplication by a power of 2, one with an operand under 6 bits', () => {
  const src = '#include <ap_int.h>\nint f(ap_uint<4> a, ap_uint<4> b, short c, int n) {\n  int x = c * 8;\n  for (int i = 0; i < n; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=8\n  x = x + 1;\n  }\n  ap_uint<8> p = a * b;\n  x = x + p;\n  for (int i = 0; i < n; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=8\n  x = x + 2;\n  }\n  ap_uint<8> q = b * b;\n  return x + q;\n}\n';
  const g = cToHdl(src, { file: 't.cpp', top: 'f' });
  assert.deepEqual([g.diagnostics, g.report.units], [[], []]);
});

// (with room: the first multiplication of a state shared, one after another its own, so no path runs from a unit into
// another through the states; with a limit, a chained one a unit after those it reads: no unit reads itself, in any state)
test('#2125 multiplications chained in a state: with room, the first shared, the others their own; with a limit, units in order; the hardware has no loop', () => {
  const src = 'int f(short a, short b, short c, int n) {\n  int x = (a * b >> 8) * c;\n  for (int i = 0; i < n; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=8\n  x = x + 1;\n  }\n  int y = (c * a >> 8) * b;\n  for (int i = 0; i < n; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=8\n  y = y + 1;\n  }\n  return x + y;\n}\n';
  const tb = `${src}int main() {\n  int e = 0;\n  for (int i = -3; i < 4; i++) {\n    short a = i * 300, b = 200 - i, c = i - 90;\n    if (f(a, b, c, 2) != (int)((a * b >> 8) * c) + 2 + (int)((c * a >> 8) * b) + 2) e++;\n  }\n  return e;\n}\n`;
  const units = (mults) => scheduled(checkC(src, 't.c', { top: 'f', synthesis: true }), {}, { clock: 30, mults }).units.map((u) => [u.a, u.b, u.uses, u.inputs]);
  // (a * b or c * a one block; the wider one, 32 x 16 bits, two)
  assert.deepEqual(units(null), [[16, 16, 2, 2], [18, 16, 1, 1], [18, 16, 1, 1], [18, 16, 1, 1], [18, 16, 1, 1]]);
  assert.deepEqual(units(8), [[16, 16, 2, 2], [18, 16, 2, 2], [18, 16, 2, 2]]);
  const m = scheduled(checkC(src, 't.c', { top: 'f', synthesis: true }), {}, { clock: 30, mults: 8 });
  for (const n of m.graph.nodes) assert.ok(n.args.every((a) => a < n.id));
  for (const lang of LANGS) for (const mults of [null, 8]) {
    const c = cosimulate(tb, { file: 't.c', lang, top: 'f', clock: 30, mults });
    assert.deepEqual([c.pass, c.gen.diagnostics], [true, []], `${lang}, ${mults}`);
  }
});

test('#2125 a limit of blocks per cycle: the others wait, the C\'s results', () => {
  const src = 'double f(double a, double b) {\n  return a * b;\n}\n';
  const tb = `${src}int main() {\n  return f(1.5, -2.25) == -3.375 && f(1e10, 3e-5) == 1e10 * 3e-5 ? 0 : 1;\n}\n`;
  const cycles = [];
  for (const mults of [null, 16, 4, 1]) {
    const g = cToHdl(src, { file: 't.c', top: 'f', family: 'spartan3e', mults });
    assert.deepEqual(g.diagnostics, []);
    if (mults) assert.equal(g.report.blocks, mults);
    cycles.push(g.states);
  }
  assert.ok(cycles[0] < cycles[2] && cycles[2] < cycles[3], cycles.join());
  for (const lang of LANGS) {
    const c = cosimulate(tb, { file: 't.c', lang, top: 'f', family: 'spartan3e', mults: 4 });
    assert.deepEqual([c.pass, c.gen.diagnostics], [true, []], lang);
  }
});

// The issue's test: the XC3S100E of the Basys2-100 has 4 MULT18X18
for (const [name, call, args, t] of [['sinf', 'sinf(a)', 'float a', 'float'], ['sin', 'sin(a)', 'double a', 'double'], ['pow', 'pow(a, b)', 'double a, double b', 'double']]) {
  test(`#2125 ${name} within the 4 multipliers of the Basys2-100, co-simulated, no warnings`, () => {
    const src = `#include <math.h>\n${t} f(${args}) {\n  return ${call};\n}\n`;
    const vals = name === 'pow' ? '2.0, 10.0' : '0.5';
    const tb = `${src}int main() {\n  ${t} a = ${name === 'pow' ? '2.0' : '0.5'};${name === 'pow' ? '\n  double b = 10.0;' : ''}\n  return f(${vals}) == ${call} ? 0 : 1;\n}\n`;
    const g = cToHdl(src, { file: 't.c', top: 'f', family: 'spartan3e', mults: 4 });
    assert.deepEqual(g.diagnostics, []);
    assert.equal(g.report.blocks, 4);
    // (sin's and pow's VHDL, 2000 and 5000 states in one if … elsif, overflow the elaborator's stack: #2272; sin's
    // passes alone, not under the test runner's frames)
    for (const lang of name === 'sinf' ? LANGS : ['verilog']) {
      const c = cosimulate(tb, { file: 't.c', lang, top: 'f', family: 'spartan3e', mults: 4 });
      assert.deepEqual([c.pass, c.gen.diagnostics], [true, []], lang);
    }
  });
}

test('#2125 a multiplication in a sub-module\'s argument: on the unit, the limit per module', () => {
  const src = `int f(int x) {\n#pragma HLS INLINE off\n  int s = 0;\n  for (int i = 0; i < 4; i++) {\n#pragma HLS LOOP_TRIPCOUNT max=4\n    s += x;\n  }\n  return s;\n}\nint top(ap_int<16> a, ap_int<16> b, ap_int<16> c) {\n  int r = f(a * b);\n  r += f(a * c);\n  return r * c;\n}\nint main() {\n  return top(3, 4, 5) == 2240 ? 0 : 1;\n}\n`;
  const opts = { file: 't.cpp', top: 'top', clock: 20, family: 'spartan3e', mults: 1 };
  const r = cToHdl(src, { ...opts, lang: 'verilog' });
  assert.ok(r.ok, JSON.stringify(r.diagnostics));
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.report.functions.length, 1);
  assert.equal(r.report.blocks, 1);
  const top = r.hdl.slice(r.hdl.lastIndexOf('module top'));
  assert.equal((top.match(/ \* /g) || []).length, 1);
  for (const lang of ['vhdl', 'verilog']) {
    const c = cosimulate(src, { ...opts, lang });
    assert.ok(c.ok && c.pass, `${lang}: ${c.errors[0] || ''}`);
    assert.deepEqual(c.gen.diagnostics, []);
  }
});
