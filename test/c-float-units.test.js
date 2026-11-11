// Silinx HLS: the floating-point operations shared as units when #pragma HLS ALLOCATION asks it (#2273,
// core/c-float-units.js): each operation of that kind in the pragma's scope a call of one sub-module, the soft-float's
// operation scheduled over the clock; without the pragma, each inlined where it is (as before). Each case co-simulated in
// VHDL and Verilog against the C, its units and their calls, its latency, its exact warnings; the open synthesis's area.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const messages = (g) => g.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
/** Both languages co-simulated against the C: the units (name, calls), the latency, the top's multiplier blocks, the
 *  warnings. */
function run(src, top) {
  const out = ['vhdl', 'verilog'].map((lang) => {
    const r = cosimulate(src, { file: 'f.c', lang, top });
    assert.deepEqual(r.errors, [], lang);
    assert.equal(r.pass, true, `${lang}: ${JSON.stringify(r.mismatches, big)}`);
    return r;
  });
  assert.deepEqual(out[0].latency, out[1].latency);
  const r = out[0];
  return { units: (r.gen.report.functions || []).map((f) => [f.name, f.calls]), cycles: r.latency.max, blocks: r.gen.report.blocks ?? 0, messages: messages(r.gen) };
}

const THREE = (pr) => `double f(double x, double y, double z) {
${pr}
  double p = x * y;
  double q = p * z;
  return q * x + 1.0;
}
int main() { double r = 0; for (int i = 0; i < 4; i++) r += f(i * 0.5 + 1, 2.25 - i, 3.5); return r > 0 ? 0 : 1; }
`;

test('#2273 ALLOCATION of dmul limit=1: the three multiplications one unit, called three times, no multiplier of the top\'s own; without it, each inlined (as before)', () => {
  assert.deepEqual(run(THREE('#pragma HLS ALLOCATION operation instances=dmul limit=1'), 'f'), { units: [['ap_unit_dmul', 3]], cycles: 140, blocks: 0, messages: [] });
  assert.deepEqual(run(THREE(''), 'f'), { units: [], cycles: 131, blocks: 192, messages: [] });
});

const DOT = (pr) => `#include <math.h>
double dot(double a[8], double b[8], float w) {
${pr}
  double s = 0;
  for (int i = 0; i < 8; i++) s += a[i] * b[i];
  float r = sqrtf(w) / 3.0f - w;
  if (s > 1.0 && s * 2.0 < 100.0) s = s - 1.0;
  return s + r;
}
int main() {
  double a[8], b[8];
  for (int i = 0; i < 8; i++) { a[i] = i * 0.25 - 1; b[i] = 3.5 - i; }
  double t = 0;
  for (int k = 0; k < 3; k++) t += dot(a, b, k * 1.5f + 0.5f);
  return t > -1000 ? 0 : 1;
}
`;

test('#2273 every operation of each precision a unit: +=, a float\'s sqrtf, /, -, a double and a float added; after && inlined; a loop calling a unit not pipelined', () => {
  const all = ['dmul', 'dadd', 'fsqrt', 'fdiv', 'fsub', 'dsub'].map((op) => `#pragma HLS ALLOCATION operation instances=${op} limit=1`).join('\n');
  // (s * 2.0 after &&: may not run, inlined; s += a[i] * b[i] and s + r: dadd's two calls)
  assert.deepEqual(run(DOT(all), 'dot'), { units: [['ap_unit_dmul', 1], ['ap_unit_dadd', 2], ['ap_unit_fsqrt', 1], ['ap_unit_fdiv', 1], ['ap_unit_fsub', 1], ['ap_unit_dsub', 1]], cycles: 774, blocks: 0, messages: [] });
  assert.deepEqual(run(DOT(''), 'dot'), { units: [], cycles: 132, blocks: 64, messages: [] });
});

test('#2273 the pragma\'s scope: in a loop\'s body, that body\'s operations; x *= y written x = unit(x, y)', () => {
  const src = `double f(double a[4], double x) {
  double s = x * x;
  for (int i = 0; i < 4; i++) {
#pragma HLS ALLOCATION operation instances=dmul limit=1
    s = s + a[i] * x;
    s *= 0.5;
  }
  return s;
}
int main() { double a[4] = { 1.5, -2.0, 0.25, 8.0 }; double t = 0; for (int k = 0; k < 3; k++) t += f(a, k - 0.75); return t != 0 ? 0 : 1; }
`;
  // (x * x before the loop: inlined, its multiplier blocks the top's)
  assert.deepEqual(run(src, 'f'), { units: [['ap_unit_dmul', 2]], cycles: 466, blocks: 64, messages: [] });
});

test('#2273 a sub-module given a double and a float (INLINE off): its arguments their bits (were converted to integers)', () => {
  const src = `static double g(double a, float b) {
#pragma HLS INLINE off
  return a * b;
}
double f(double x, float y) { double p = g(x, y); return p + g(p, y); }
int main() { double r = 0; for (int i = 0; i < 4; i++) r += f(i * 0.5 + 1, 2.25f - i); return r != 0 ? 0 : 1; }
`;
  // (an instance a call, #2244: was one with two calls)
  assert.deepEqual(run(src, 'f'), { units: [['g', 1], ['g', 1]], cycles: 39, blocks: 0, messages: [] });
});

test('#2273 ALLOCATION of a floating-point operation: what is not made, its warning', () => {
  const m = (p, body = 'return x * y;') => messages(cToHdl(`double f(double x, double y, float u) {\n#pragma HLS ALLOCATION ${p}\n  ${body}\n}\n`, { file: 'f.c', top: 'f' }));
  assert.deepEqual(m('instances=dmul limit=2 operation'), ['2 warning: #pragma HLS ALLOCATION limit=2 of dmul: one unit made, its operations sharing it']);
  assert.deepEqual(m('instances=hmul limit=1 operation'), ['2 warning: #pragma HLS ALLOCATION of hmul: only multiplications and the floating-point operations (fadd, fsub, fmul, fdiv, fsqrt, dadd, dsub, dmul, ddiv, dsqrt) are shared: ignored']);
  assert.deepEqual(m('instances=dmul limit=1 operation', 'return u * u;'), ['2 warning: #pragma HLS ALLOCATION of dmul: no double operation of it here that a unit can make: ignored']);
  assert.deepEqual(m('instances=fmul limit=1 operation', 'return u * u + x;'), []);
  assert.deepEqual(m('instances=dmul limit=0 operation'), ['2 warning: #pragma HLS ALLOCATION needs instances=<what> limit=N, a whole number, 1 or more: ignored']);
});

test('#2273 the units through the open synthesis (Yosys, Spartan-3E): three float multiplications, one unit\'s multiplier blocks, from the Verilog, with no warning', async () => {
  const { compile, elaborate } = await import('../core/compile.js');
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  const src = 'float f(float x, float y, float z) {\n#pragma HLS ALLOCATION operation instances=fmul limit=1\n  float p = x * y;\n  float q = p * z;\n  return q * x;\n}\n';
  const g = cToHdl(src, { file: 'f.c', lang: 'verilog', family: 'spartan3e', clock: 20 });
  assert.deepEqual([messages(g), g.report.blocks, g.report.functions.map((f) => [f.name, f.calls])], [[], 0, [['ap_unit_fmul', 3]]]);
  const r = await synthesizeOpen(elaborate(compile([{ path: 'f.v', lang: 'verilog', text: g.hdl }]), 'f'), { family: 'spartan3e', run: yosysNode });
  const sum = (re) => Object.entries(r.cells).filter(([k]) => re.test(k)).reduce((a, [, v]) => a + v, 0);
  // (inlined: 12 MULT18X18SIOs, 9204 LUTs)
  assert.equal(sum(/^MULT18X18/), 4);
  assert.ok(sum(/^LUT/) < 4500, `${sum(/^LUT/)} LUTs`);
  assert.deepEqual(r.warnings, []);
});
