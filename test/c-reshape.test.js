// Silinx HLS: #pragma HLS ARRAY_RESHAPE as Vitis HLS makes it (#2424, core/c-reshape.js): one memory of wide words,
// type=cyclic (element k in word k / N, slice k % N) and type=block (word k % S, slice k / S); an argument's ap_memory
// port of the words, a local's memory inside the module, its initial values packed; the report's memory of the words;
// co-simulated in VHDL and Verilog against the C (the words packed as the C's elements), a wrong slice found; what is
// not made, said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';

const LANGS = ['vhdl', 'verilog'];
const messages = (g) => g.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
/** Both languages: co-simulated against the C, its warnings; the VHDL's latency and the generated module. */
function both(src, warnings = []) {
  let r;
  for (const lang of LANGS) {
    const c = cosimulate(src, { file: 'f.c', lang });
    assert.deepEqual(c.errors, [], lang);
    assert.deepEqual(messages(c.gen), warnings, lang);
    assert.ok(c.pass, `${lang}: ${JSON.stringify(c.mismatches, (k, v) => (typeof v === 'bigint' ? String(v) : v))}`);
    r ||= c;
  }
  return r;
}

const ARGS = (type, L) => `void f(int a[${L}], short b[${L}]) {
#pragma HLS ARRAY_RESHAPE variable=a type=${type} factor=2
#pragma HLS ARRAY_RESHAPE variable=b type=${type} factor=4
  for (int i = 0; i < ${L}; i++) {
#pragma HLS PIPELINE off
    a[i] = a[i] * 3 + b[i];
    b[i] = (short)(b[i] + i);
  }
}
int main() {
  int a[${L}]; short b[${L}];
  for (int i = 0; i < ${L}; i++) { a[i] = i * 7 - 20; b[i] = (short)(100 - i * 3); }
  f(a, b);
  for (int i = 0; i < ${L}; i++) if (a[i] != (i * 7 - 20) * 3 + 100 - i * 3 || b[i] != (short)(100 - i * 3 + i)) return 1;
  return 0;
}
`;

test('#2424 an argument reshaped, cyclic and block: its ap_memory port of the words (N elements wide, its address of the words), the report\'s memory; co-simulated, no warning', () => {
  for (const type of ['cyclic', 'block']) {
    for (const [L, wa, wb] of [[16, 8, 4], [10, 5, 3]]) {
      const c = both(ARGS(type, L));
      const ports = c.gen.ports.filter((p) => /^[ab]_/.test(p.name)).map((p) => `${p.name}:${p.dir}:${p.w}`);
      assert.deepEqual(ports, [`a_address0:out:${Math.ceil(Math.log2(wa))}`, 'a_ce0:out:1', 'a_we0:out:1', 'a_d0:out:64', 'a_q0:in:64',
        `b_address0:out:${Math.ceil(Math.log2(wb))}`, 'b_ce0:out:1', 'b_we0:out:1', 'b_d0:out:64', 'b_q0:in:64'], `${type} ${L}`);
      assert.deepEqual(c.gen.report.memories, [{ name: 'a', words: wa, bits: 64, kind: 'ap_memory' }, { name: 'b', words: wb, bits: 64, kind: 'ap_memory' }], `${type} ${L}`);
    }
  }
});

test('#2424 the co-simulation\'s words are the C\'s elements packed: an HDL writing a slice wrong, found', () => {
  // (a's word written with its two slices exchanged: a[2k] and a[2k + 1] differ)
  const c = cosimulate(ARGS('cyclic', 16), { file: 'f.c', lang: 'verilog', alter: (h) => h.replace(/assign a_d0 = (\w+);/, 'assign a_d0 = {$1[31:0], $1[63:32]};') });
  assert.deepEqual(c.errors, []);
  assert.equal(c.pass, false);
  assert.deepEqual([...new Set(c.mismatches.map((m) => m.port.replace(/\[\d+\]$/, '')))], ['a']);
});

const rom = (n, f) => `{ ${Array.from({ length: n }, (_, k) => f(k)).join(', ')} }`;
const LOCAL = (type, N) => `int f(int i, int v) {
  static short t[100] = ${rom(100, (k) => (k * 37) % 200 - 100)};
#pragma HLS ARRAY_RESHAPE variable=t type=${type} factor=${N}
  int r = t[i] + t[(i + 1) % 100];
  t[i] = (short)(t[i] + v);
  return r;
}
int main() {
  static short m[100];
  for (int k = 0; k < 100; k++) m[k] = (short)((k * 37) % 200 - 100);
  for (int c = 0; c < 30; c++) {
    int i = (c * 13) % 100, v = c * 5 - 40;
    int want = m[i] + m[(i + 1) % 100];
    m[i] = (short)(m[i] + v);
    if (f(i, v) != want) return 1;
  }
  return 0;
}
`;

test('#2424 a local memory reshaped: one memory of the words inside the module, its initial values packed, read and written; the report\'s; co-simulated, no warning', () => {
  for (const [type, N, words, bits] of [['cyclic', 4, 25, 64], ['block', 2, 50, 32], ['cyclic', 3, 34, 48]]) {
    const c = both(LOCAL(type, N));
    assert.deepEqual(c.gen.report.memories, [{ name: 't', words, bits, kind: 'RAM' }], `${type} ${N}`);
    // (its HDL array of words that wide, as deep as a power of 2)
    assert.ok(new RegExp(`ap_m_ap_w_t_t is array \\(0 to ${2 ** Math.ceil(Math.log2(words)) - 1}\\) of std_logic_vector\\(${bits - 1} downto 0\\)`).test(c.gen.hdl), `${type} ${N}`);
  }
});

test('#2424 the elements of one word in one access: a[2i] and a[2i + 1] of cyclic factor=2, one read (were two)', () => {
  const src = (prag) => `int f(int a[64], int i) {\n${prag}  return a[2 * i] + a[2 * i + 1];\n}\nint main() {\n  int a[64];\n  for (int k = 0; k < 64; k++) a[k] = k * k - 9;\n  for (int i = 0; i < 32; i++) if (f(a, i) != 4 * i * i - 9 + (2 * i + 1) * (2 * i + 1) - 9) return 1;\n  return 0;\n}\n`;
  const one = both(src('#pragma HLS ARRAY_RESHAPE variable=a type=cyclic factor=2\n'));
  const two = both(src(''));
  assert.deepEqual([one.latency.max, two.latency.max], [2, 3]);
  assert.equal((one.gen.hdl.match(/a_ce0 <=/g) || []).length, 1);
});

test('#2424 what is not made, said: type=complete, dim=2 or factor=1 of an argument, a small local (registers, as a partition); block and cyclic written either way, made', () => {
  const warn = (pragma, decl = 'int a[16]') => messages(cToHdl(`void f(${decl}) {\n${pragma}\n  for (int i = 0; i < 16; i++) {\n#pragma HLS PIPELINE off\n    a[i] += 1;\n  }\n}\n`, { file: 'f.c' }));
  const not = "2 warning: #pragma HLS ARRAY_RESHAPE of the argument 'a': not made (only block or cyclic, factor 2 or more, of an array of integers of one dimension of the top function): its port's words kept, one element each";
  assert.deepEqual(warn('#pragma HLS ARRAY_RESHAPE variable=a type=complete'), [not]);
  assert.deepEqual(warn('#pragma HLS ARRAY_RESHAPE variable=a type=cyclic factor=2 dim=2'), [not]);
  assert.deepEqual(warn('#pragma HLS ARRAY_RESHAPE variable=a type=cyclic factor=1'), [not]);
  assert.deepEqual(warn('#pragma HLS ARRAY_RESHAPE variable=a cyclic factor=2'), []);
  assert.deepEqual(warn('#pragma HLS ARRAY_RESHAPE variable=a block factor=4'), []);
  const small = messages(cToHdl('int f(int i) {\n  int t[8];\n#pragma HLS ARRAY_RESHAPE variable=t type=cyclic factor=2\n  for (int k = 0; k < 8; k++) t[k] = k * i;\n  return t[i & 7];\n}\n', { file: 'f.c' }));
  assert.deepEqual(small, ["3 warning: #pragma HLS ARRAY_RESHAPE of 't': made as ARRAY_PARTITION, its elements at once as in one wide word, in memories side by side"]);
});

test('#2424 a local reshaped through the open synthesis (Yosys, Spartan-3E): its words a block RAM, from the VHDL and from the Verilog, with no warning', async () => {
  const { compile, elaborate } = await import('../core/compile.js');
  const { synthesizeOpen } = await import('../core/synth-front.js');
  const { yosysNode } = await import('../packages/silinx-fpga/src/synth-open-node.js');
  const src = 'int f(int i, int v) {\n  static short t[256];\n#pragma HLS ARRAY_RESHAPE variable=t type=cyclic factor=2\n  t[i & 255] = (short)(t[i & 255] + v);\n  return t[(2 * i) & 255] + t[(2 * i + 1) & 255];\n}\n';
  for (const lang of LANGS) {
    const g = cToHdl(src, { file: 'f.c', lang });
    assert.deepEqual(g.report.memories, [{ name: 't', words: 128, bits: 32, kind: 'RAM' }], lang);
    const design = elaborate(compile([{ path: `f.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: g.hdl }]), 'f');
    const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
    assert.ok(Object.keys(r.cells).some((c) => /^RAMB16/.test(c)), `${lang}: ${JSON.stringify(r.cells)}`);
    assert.deepEqual(r.warnings, [], lang);
  }
});
