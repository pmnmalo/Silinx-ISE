// Silinx HLS: #pragma HLS ARRAY_PARTITION block, cyclic and a dimension of an array of more as several memories, each
// with its own port (core/c-partition.js, #1920): the ports, the memories, the warnings, and every design co-simulated
// in VHDL and Verilog against its C (its results checked by its main()).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';

const UNKNOWN = 'warning: the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)';
const AUTO2 = 'warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=2 made (it accesses a memory, an access a state); #pragma HLS PIPELINE off in it turns that off';

/** Co-simulated in both languages, passing; its VHDL's result. */
function both(src, warnings, label) {
  let out;
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 't.c', lang, top: 'f' });
    assert.deepEqual(r.errors, [], `${label} ${lang}`);
    assert.deepEqual([r.ok, r.pass, r.mismatches], [true, true, []], `${label} ${lang}`);
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.severity}: ${d.message}`), warnings, `${label} ${lang}`);
    out ??= r.gen;
  }
  return out;
}
const memPorts = (g) => g.ports.filter((p) => p.role === 'mem').map((p) => p.name);
const SFX = ['address0', 'ce0', 'we0', 'd0', 'q0'];
const names = (d, n) => Array.from({ length: n }, (_, k) => SFX.map((s) => `${d}_${k}_${s}`)).flat();

const ARG = (pragma) => `int f(int d[12], int n) {
${pragma}
  int s = 0;
  for (int i = 0; i < n; i++) { s += d[i]; d[i] = s; }
  return s;
}
int main(void) {
  int a[12], t = 0;
  for (int i = 0; i < 12; i++) a[i] = i * 3 - 5;
  int r = f(a, 12);
  for (int i = 0, u = 0; i < 12; i++) { u += i * 3 - 5; if (a[i] != u) return 1; t = u; }
  return r != t;
}
`;

test('#1920 an argument cyclic or block: its memories\' ports d_0_…, d_1_…, each as deep as it needs, the C\'s results', () => {
  for (const [kind, pragma, N, words, width] of [
    ['cyclic 4', '#pragma HLS ARRAY_PARTITION variable=d type=cyclic factor=4', 4, 3, 2],
    ['cyclic, the older form', '#pragma HLS ARRAY_PARTITION variable=d cyclic factor=3 dim=1', 3, 4, 2],
    ['block 3', '#pragma HLS ARRAY_PARTITION variable=d type=block factor=3', 3, 4, 2],
    ['block 5: 3 words a memory, the last 0', '#pragma HLS ARRAY_PARTITION variable=d block factor=5', 5, 3, 2],
    ['a factor larger than the array', '#pragma HLS ARRAY_PARTITION variable=d type=cyclic factor=40', 12, 1, 1],
  ]) {
    const g = both(ARG(pragma), [UNKNOWN, AUTO2], kind);
    assert.deepEqual(memPorts(g), names('d', N), kind);
    assert.deepEqual(g.report.memories, Array.from({ length: N }, (_, k) => ({ name: `d_${k}`, words, bits: 32, kind: 'ap_memory' })), kind);
    assert.equal(g.ports.find((p) => p.name === 'd_0_address0').w, width, kind);
  }
});

const TWO = (pragma) => `int f(int d[3][4], int n) {
${pragma}
  int s = 0;
  for (int i = 0; i < 3; i++) for (int j = 0; j < n; j++) { s += d[i][j]; d[i][j] = s - i; }
  return s;
}
int main(void) {
  int a[3][4], s = 0;
  for (int i = 0; i < 3; i++) for (int j = 0; j < 4; j++) a[i][j] = i * 10 + j;
  int r = f(a, 4);
  for (int i = 0; i < 3; i++) for (int j = 0; j < 4; j++) { s += i * 10 + j; if (a[i][j] != s - i) return 1; }
  return r != s;
}
`;

test('#1920 a two-dimensional argument: dim=2 complete a memory a column, dim=1 a row, dim=2 cyclic and block', () => {
  for (const [kind, pragma, N, words] of [
    ['dim=2 complete', '#pragma HLS ARRAY_PARTITION variable=d dim=2 complete', 4, 3],
    ['dim=1 complete', '#pragma HLS ARRAY_PARTITION variable=d dim=1 complete', 3, 4],
    ['dim=2 cyclic', '#pragma HLS ARRAY_PARTITION variable=d dim=2 cyclic factor=2', 2, 6],
    ['dim=1 block', '#pragma HLS ARRAY_PARTITION variable=d dim=1 block factor=2', 2, 8],
  ]) {
    const g = both(TWO(pragma), [UNKNOWN, AUTO2], kind);
    assert.deepEqual(memPorts(g), names('d', N), kind);
    assert.deepEqual(g.report.memories.map((m) => m.words), new Array(N).fill(words), kind);
  }
});

const LOCAL = (pragma) => `int f(int n) {
  int A[100];
  int A_0 = 7;   /* (a variable with a memory's name: that memory named otherwise) */
${pragma}
  for (int i = 0; i < 100; i++) A[i] = i * 2;
  A[7] = 1;
  A[8] += 5;
  int s = A[5] + A_0;
  for (int i = 0; i < n; i++) s += A[i];
  return s;
}
int main(void) { return f(10) != (10 + 7 + 1 + 21 + 5 + 90 - 14 - 16) ; }
`;

test('#1920 a local array: inner memories A_0, … (no port), run-time and constant accesses, a read-modify-write, a variable of a memory\'s name; non-power-of-2 factors', () => {
  for (const [kind, pragma, list] of [
    ['cyclic 3', '#pragma HLS ARRAY_PARTITION variable=A type=cyclic factor=3', [['A_0_s', 34], ['A_1', 34], ['A_2', 34]]],
    ['block 3', '#pragma HLS ARRAY_PARTITION variable=A type=block factor=3', [['A_0_s', 34], ['A_1', 34], ['A_2', 34]]],
    ['cyclic 4', '#pragma HLS ARRAY_PARTITION variable=A type=cyclic factor=4', [['A_0_s', 25], ['A_1', 25], ['A_2', 25], ['A_3', 25]]],
  ]) {
    const g = both(LOCAL(pragma), [UNKNOWN], kind);
    assert.deepEqual(memPorts(g), [], kind);
    assert.deepEqual(g.report.memories, list.map(([name, words]) => ({ name, words, bits: 32, kind: 'RAM' })), kind);
  }
});

test('#1920 a table partitioned: each memory a ROM of its elements; a memory\'s index read from a memory', () => {
  const T = Array.from({ length: 70 }, (_, k) => (k * 7 + 3) % 70);
  const src = `const int T[70] = { ${T.join(', ')} };
int f(int n) {
#pragma HLS ARRAY_PARTITION variable=T type=cyclic factor=2
  int s = 0;
  for (int i = 0; i < n; i++) s += T[T[i]];
  return s;
}
int main(void) { return f(5) != ${[0, 1, 2, 3, 4].reduce((a, k) => a + T[T[k]], 0)}; }
`;
  const g = both(src, [UNKNOWN, 'warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=3 made (it accesses a memory, an access a state); #pragma HLS PIPELINE off in it turns that off'], 'rom');
  assert.deepEqual(g.report.memories, [{ name: 'T_0', words: 35, bits: 32, kind: 'ROM' }, { name: 'T_1', words: 35, bits: 32, kind: 'ROM' }]);
});

test('#1920 accesses of memories known at synthesis share a state: i * N + 3 cyclic factor=N, a pipelined loop of II=1 where the whole array would need II=2', () => {
  const src = (pragma) => `int f(int d[64], int n) {
${pragma}
  int s = 0;
  for (int i = 0; i < n; i++) s += d[i * 4 + 1] + d[i * 4 + 2];
  return s;
}
int main(void) { int a[64]; for (int i = 0; i < 64; i++) a[i] = i; return f(a, 16) != ${Array.from({ length: 16 }, (_, i) => 8 * i + 3).reduce((x, y) => x + y)}; }
`;
  for (const lang of ['vhdl', 'verilog']) {
  const parted = cosimulate(src('#pragma HLS ARRAY_PARTITION variable=d type=cyclic factor=4'), { file: 't.c', top: 'f', lang });
  const whole = cosimulate(src(''), { file: 't.c', top: 'f', lang });
  assert.deepEqual([parted.pass, whole.pass], [true, true], lang);
  assert.ok(parted.latency.min < whole.latency.min, `${parted.latency.min} ${whole.latency.min}`);
  assert.deepEqual(whole.gen.diagnostics.map((d) => `${d.severity}: ${d.message}`), [UNKNOWN, AUTO2]);
  assert.deepEqual(parted.gen.diagnostics.map((d) => `${d.severity}: ${d.message}`), [UNKNOWN]);   // (II=1 made: no warning)
  assert.deepEqual([parted.latency.min, whole.latency.min], [19, 35]);
  // (the two memories it reads have ports read, the two others are never accessed)
  assert.ok(parted.gen.ports.some((p) => p.name === 'd_1_q0') && parted.gen.ports.some((p) => p.name === 'd_2_q0'));
  assert.ok(!parted.gen.ports.some((p) => p.name === 'd_0_q0'));
  }
});

test('#1920 a small local array stays registers; what is ignored is said', () => {
  const src = (pragma, arr = 'int A[8]') => `int f(int n) {
  ${arr};
${pragma}
  for (int i = 0; i < n; i++) A[i] = i * n;
  return A[3];
}
int main(void) { return f(4) != 12; }
`;
  const said = (pragma, arr) => {
    const r = cToHdl(src(pragma, arr), { file: 't.c', top: 'f' });
    assert.equal(r.ok, true, pragma);
    return [r.report?.memories ?? [], r.diagnostics.filter((d) => /ARRAY_PARTITION/.test(d.message)).map((d) => `${d.line} ${d.severity}: ${d.message}`)];
  };
  assert.deepEqual(said('#pragma HLS ARRAY_PARTITION variable=A type=cyclic factor=2'), [[], []]);
  assert.deepEqual(said('#pragma HLS ARRAY_PARTITION variable=A type=cyclic')[1], ['3 warning: #pragma HLS ARRAY_PARTITION type=cyclic needs factor=N, a whole number, 1 or more: ignored']);
  assert.deepEqual(said('#pragma HLS ARRAY_PARTITION variable=A type=block factor=0')[1], ['3 warning: #pragma HLS ARRAY_PARTITION type=block needs factor=N, a whole number, 1 or more: ignored']);
  assert.deepEqual(said('#pragma HLS ARRAY_PARTITION variable=A type=block factor=2 dim=0')[1], ['3 warning: #pragma HLS ARRAY_PARTITION type=block dim=0 is not made yet: ignored (name its dimension, dim=1 and up)']);
  assert.deepEqual(said('#pragma HLS ARRAY_PARTITION variable=A type=other')[1], ['3 warning: #pragma HLS ARRAY_PARTITION type=other is not one of complete, block and cyclic: ignored']);
  assert.deepEqual(said('#pragma HLS ARRAY_PARTITION variable=A cyclic factor=2 dim=x')[1], ['3 warning: #pragma HLS ARRAY_PARTITION dim=x: the dimension must be a whole number: ignored']);
  // (on a memory: a dimension it does not have, a second pragma)
  const big = 'int A[80]';
  assert.deepEqual(said('#pragma HLS ARRAY_PARTITION variable=A cyclic factor=2 dim=2', big)[1], ["3 warning: #pragma HLS ARRAY_PARTITION dim=2: 'A' has 1 dimension: ignored"]);
  const twice = said('#pragma HLS ARRAY_PARTITION variable=A cyclic factor=2\n#pragma HLS ARRAY_PARTITION variable=A block factor=4', big);
  assert.deepEqual(twice[1], ["4 warning: #pragma HLS ARRAY_PARTITION of 'A' again: ignored (one partition an array is made)"]);
});
