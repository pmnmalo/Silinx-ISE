// Silinx HLS (#2750): a pragma's numeric argument given by a constant (`const int N = 4;` … `#pragma HLS UNROLL factor=N`),
// as Vitis HLS takes it (UG1399): a global or local const, a static const, C++'s constexpr, an enum's constant, a constant
// of another, of sizeof. Each the same module as the literal's (its HDL, its report, its ports), co-simulated in VHDL and
// Verilog; a name that is no constant, its error or its warning (core/c-pragma.js's constArgs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { checkC } from '../core/c-check.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const LANGS = ['vhdl', 'verilog'];

/** The design with a constant made as with the literal, in both languages: the same HDL, report, ports, memories and FIFOs,
 *  no message, and co-simulated (a pass); its VHDL's result. */
function same(literal, constant, opts, label) {
  let out;
  for (const lang of LANGS) {
    const [a, b] = [literal, constant].map((src) => cosimulate(src, { lang, ...opts }));
    for (const r of [a, b]) {
      assert.deepEqual(r.errors, [], `${label} ${lang}`);
      assert.equal(r.pass, true, `${label} ${lang}: ${JSON.stringify(r.mismatches, big)}`);
    }
    assert.deepEqual(b.gen.diagnostics, [], `${label} ${lang}`);
    assert.deepEqual(b.gen.diagnostics, a.gen.diagnostics, `${label} ${lang}`);
    assert.equal(b.gen.hdl, a.gen.hdl, `${label} ${lang}: the HDL`);
    for (const k of ['report', 'ports', 'memories', 'fifos', 'states']) assert.deepEqual(JSON.parse(JSON.stringify(b.gen[k], big)), JSON.parse(JSON.stringify(a.gen[k], big)), `${label} ${lang}: ${k}`);
    assert.deepEqual(b.latency, a.latency, `${label} ${lang}: the latency`);
    out ??= b;
  }
  return out;
}
const messages = (src, opts) => cToHdl(src, opts).diagnostics.map((d) => `${d.severity}: ${d.message}`);

// (a loop: UNROLL factor= and PIPELINE II=, the loop's report; pipelineLoops 0: none pipelined automatically)
const ACC = (decl, local, prag) => `${decl}
int acc(int x) {
${local}
  int s = 0;
  for (int i = 0; i < 16; i++) {
${prag}
    s += x * i;
  }
  return s;
}
int main(void) { int t = 0; for (int k = -3; k < 5; k += 2) t += acc(k); return t != 120 * 5; }
`;
// (the ways a constant is declared: [its declaration, global; local; its name], each 4)
const FOURS = [
  ['const int N = 4;', '', 'N'],
  ['', '  const int N = 4;', 'N'],
  ['static const int N = 4;', '', 'N'],
  ['', '  static const int N = 4;', 'N'],
  ['enum { N = 4 };', '', 'N'],
  ['enum sizes { ONE = 1, N = ONE * 4 };', '', 'N'],
  ['const int M = 2;\nconst int N = M + M;', '', 'N'],
  ['const int N = sizeof(int);', '', 'N'],
];

test('#2750 UNROLL factor= of a constant (global, local, static, enum, of another, of sizeof): the module of factor=4', () => {
  const opts = { file: 'acc.c', pipelineLoops: 0 };
  for (const [decl, local, n] of FOURS) {
    const r = same(ACC(decl, local, '#pragma HLS UNROLL factor=4'), ACC(decl, local, `#pragma HLS UNROLL factor=${n}`), opts, `${decl}${local}`);
    assert.deepEqual(r.gen.report.loops.map(({ unroll, ii }) => ({ unroll, ii })), [{ unroll: 4, ii: 5 }]);
  }
  // (C++: constexpr, and a const of a class's static constexpr is not needed: a namespace's constexpr)
  const cpp = { file: 'acc.cpp', pipelineLoops: 0 };
  same(ACC('constexpr int N = 4;', '', '#pragma HLS UNROLL factor=4'), ACC('constexpr int N = 4;', '', '#pragma HLS UNROLL factor=N'), cpp, 'constexpr');
  same(ACC('', '  constexpr int N = 4;', '#pragma HLS UNROLL factor=4'), ACC('', '  constexpr int N = 4;', '#pragma HLS UNROLL factor=N'), cpp, 'local constexpr');
});

test('#2750 PIPELINE II= of a constant: the module of II=2', () => {
  const opts = { file: 'acc.c', pipelineLoops: 0 };
  for (const [decl, local, n] of [['const int II = 2;', '', 'II'], ['', '  const int II = 2;', 'II'], ['enum { II = 2 };', '', 'II']]) {
    const r = same(ACC(decl, local, '#pragma HLS PIPELINE II=2'), ACC(decl, local, `#pragma HLS PIPELINE II=${n}`), opts, `${decl}${local}`);
    assert.deepEqual(r.gen.report.loops.map(({ pipeline }) => pipeline), [2]);
  }
});

test('#2750 LOOP_TRIPCOUNT min= max= avg= of constants: the report of the literals', () => {
  const LOOP = (decl, prag) => `${decl}
int f(int n) {
  int s = 0;
  for (int i = 0; i < n; i++) {
${prag}
    s += i;
  }
  return s;
}
int main(void) { return f(5) == 10 ? 0 : 1; }
`;
  const r = same(LOOP('const int LO = 2, HI = 8;', '#pragma HLS LOOP_TRIPCOUNT min=2 max=8 avg=5'), LOOP('const int LO = 2, HI = 8;', '#pragma HLS LOOP_TRIPCOUNT min=LO max=HI avg=(LO+HI)/2'), { file: 't.c', top: 'f', pipelineLoops: 0 }, 'tripcount');
  assert.deepEqual(r.gen.report.loops.map((l) => l.max), [8]);
});

// (an array partitioned: its memories; cyclic factor=, dim=)
const PART = (decl, prag) => `${decl}
int f(int n) {
  int m[3][8];
${prag}
  for (int r = 0; r < 3; r++) for (int i = 0; i < 8; i++) m[r][i] = r * 8 + i;
  int s = 0;
  for (int i = 0; i < n; i++) s += m[i % 3][i % 8] * (i + 1);
  return s;
}
int main(void) { int t = 0; for (int i = 0; i < 12; i++) t += ((i % 3) * 8 + i % 8) * (i + 1); return f(12) == t ? 0 : 1; }
`;
test('#2750 ARRAY_PARTITION and ARRAY_RESHAPE factor= and dim= of constants: the memories of the literals', () => {
  const opts = { file: 't.c', top: 'f', pipelineLoops: 0 };
  const UNK = 'warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)';
  const lit = PART('const int F = 4, D = 2;', '#pragma HLS ARRAY_PARTITION variable=m cyclic factor=4 dim=2');
  assert.deepEqual(messages(lit, opts), [UNK]);
  for (const [decl, prag] of [
    ['const int F = 4, D = 2;', '#pragma HLS ARRAY_PARTITION variable=m cyclic factor=F dim=D'],
    ['enum { F = 4, D = 2 };', '#pragma HLS ARRAY_PARTITION variable=m type=cyclic factor=F dim=D'],
  ]) {
    const src = PART(decl, prag), lits = PART(decl, '#pragma HLS ARRAY_PARTITION variable=m cyclic factor=4 dim=2');
    assert.deepEqual(messages(src, opts), [UNK], prag);
    for (const lang of LANGS) {
      const [a, b] = [lits, src].map((s) => cosimulate(s, { lang, ...opts }));
      assert.deepEqual([b.errors, b.pass], [[], true], `${prag} ${lang}`);
      assert.equal(b.gen.hdl, a.gen.hdl, `${prag} ${lang}`);
      assert.deepEqual(b.gen.memories, a.gen.memories);
    }
  }
  const memOf = (src) => cToHdl(src, opts).hdl.match(/m_\d+/g)?.length ?? 0;
  assert.ok(memOf(lit) > 0);
  // (ARRAY_RESHAPE: made as ARRAY_PARTITION, its warning)
  const said = "warning: #pragma HLS ARRAY_RESHAPE of 'm': made as ARRAY_PARTITION, its elements at once as in one wide word, in memories side by side";
  const rl = cToHdl(PART('const int F = 4;', '#pragma HLS ARRAY_RESHAPE variable=m cyclic factor=4 dim=2'), opts);
  const rc = cToHdl(PART('const int F = 4;', '#pragma HLS ARRAY_RESHAPE variable=m cyclic factor=F dim=2'), opts);
  assert.deepEqual(rc.diagnostics.map((d) => `${d.severity}: ${d.message}`), [said, UNK]);
  assert.equal(rc.hdl, rl.hdl);
});

// (a DATAFLOW region's stream: its FIFO's depth)
const FLOW = (decl, prag) => `#include "hls_stream.h"
${decl}
static void p1(int n, hls::stream<int> &s) { for (int i = 0; i < n; i++) s.write(i + 1); }
static void p2(int n, hls::stream<int> &s, hls::stream<int> &out) { for (int i = 0; i < n; i++) out.write(s.read() * 2); }
void top(int n, hls::stream<int> &out) {
#pragma HLS DATAFLOW
  hls::stream<int> s;
${prag}
  p1(n, s);
  p2(n, s, out);
}
int main() {
  hls::stream<int> o;
  top(4, o); top(2, o);
  int want[] = {2, 4, 6, 8, 2, 4};
  for (int i = 0; i < 6; i++) if (o.read() != want[i]) return 1;
  return 0;
}
`;
test('#2750 STREAM depth= of a constant: the FIFO of depth=8', () => {
  const opts = { file: 't.cpp', top: 'top' };
  const lit = cToHdl(FLOW('const int DEPTH = 8;', '#pragma HLS STREAM variable=s depth=8'), opts);
  for (const [decl, prag] of [['const int DEPTH = 8;', '#pragma HLS STREAM variable=s depth=DEPTH'], ['constexpr int DEPTH = 8;', '#pragma HLS STREAM variable=s depth=DEPTH'], ['', '  const int DEPTH = 8;\n#pragma HLS STREAM variable=s depth=DEPTH']]) {
    for (const lang of LANGS) {
      const a = cToHdl(FLOW('const int DEPTH = 8;', '#pragma HLS STREAM variable=s depth=8'), { ...opts, lang }), b = cToHdl(FLOW(decl, prag), { ...opts, lang });
      assert.deepEqual(b.diagnostics, a.diagnostics, `${prag} ${lang}`);
      assert.equal(b.hdl, a.hdl, `${prag} ${lang}`);
      const r = cosimulate(FLOW(decl, prag), { ...opts, lang });
      assert.deepEqual([r.errors, r.pass], [[], true], `${prag} ${lang}`);
    }
  }
  // (the depth made: not the default's)
  assert.notEqual(cToHdl(FLOW('', ''), opts).hdl, lit.hdl);
});

test('#2750 INTERFACE m_axi depth= of a constant: the memory of depth=4', () => {
  const AXI = (decl, d) => `${decl}
int f(int *p) {
#pragma HLS INTERFACE m_axi port=p depth=${d} bundle=g0
  int s = 0;
  for (int i = 0; i < 4; i++) s += p[i] * (i + 1);
  return s;
}
int main() { int p[4] = { 1, 2, 3, 4 }; return f(p) == 30 ? 0 : 1; }
`;
  same(AXI('const int D = 4;', '4'), AXI('const int D = 4;', 'D'), { file: 'a.cpp', top: 'f' }, 'm_axi depth');
});

test('#2750 a name that is not a constant: its error or its warning, saying so', () => {
  const opts = { file: 'acc.c', pipelineLoops: 0 };
  assert.deepEqual(messages(ACC('int N = 4;', '', '#pragma HLS UNROLL factor=N'), opts), ["error: #pragma HLS UNROLL factor=N: 'N' is not a constant: the factor must be a whole number, 1 or more"]);
  assert.deepEqual(messages(ACC('', '', '#pragma HLS UNROLL factor=K'), opts), ["error: #pragma HLS UNROLL factor=K: 'K' is not a constant: the factor must be a whole number, 1 or more"]);
  assert.deepEqual(messages(ACC('', '  int n = 2;', '#pragma HLS PIPELINE II=n'), opts), ["error: #pragma HLS PIPELINE II=n: 'n' is not a constant: II must be a whole number, 1 or more"]);
  // (a constant that is no whole number 1 or more: the literal's message, its value)
  assert.deepEqual(messages(ACC('const int Z = 0;', '', '#pragma HLS UNROLL factor=Z'), opts), ['error: #pragma HLS UNROLL factor=0: the factor must be a whole number, 1 or more']);
  const popts = { file: 't.c', top: 'f', pipelineLoops: 0 };
  const UNK = 'warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)';
  assert.deepEqual(messages(PART('int F = 4;', '#pragma HLS ARRAY_PARTITION variable=m cyclic factor=F dim=2'), popts), ["warning: #pragma HLS ARRAY_PARTITION type=cyclic factor=F: 'F' is not a constant: it needs factor=N, a whole number, 1 or more: ignored", UNK]);
  assert.deepEqual(messages(PART('int D = 2;', '#pragma HLS ARRAY_PARTITION variable=m complete dim=D'), popts), ["warning: #pragma HLS ARRAY_PARTITION dim=D: 'D' is not a constant: the dimension must be a whole number: ignored", UNK]);
  assert.deepEqual(messages(FLOW('int DEPTH = 8;', '#pragma HLS STREAM variable=s depth=DEPTH'), { file: 't.cpp', top: 'top' }), [UNK, UNK, "warning: #pragma HLS STREAM depth=DEPTH: 'DEPTH' is not a constant: its default depth made"]);
});

test('#2750 the checker: a constant argument its value, in the pragma the passes read; another argument as written', () => {
  const r = checkC('const int N = 3;\nint f(int a[8]) {\n#pragma HLS ARRAY_PARTITION variable=a cyclic factor=N dim=1\n  return a[0];\n}\n', 't.c');
  const p = r.funcs.get('f').body.items.find((s) => s.kind === 'pragma').pragma;
  assert.deepEqual(p.args, { variable: 'a', cyclic: true, factor: '3', dim: '1' });
  assert.deepEqual(r.diagnostics, []);
});
