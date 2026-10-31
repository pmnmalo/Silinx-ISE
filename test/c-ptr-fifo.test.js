// Silinx HLS (#1901): INTERFACE ap_fifo and ap_hs on pointer arguments (core/c-fifo.js), two-port memories (core/c-mem.js,
// BIND_STORAGE, storage_type=, UNROLL, a DATAFLOW top), named as Vitis HLS names them (the ports of test/hls-corpus/vitis.json's
// designs of the same shape); a config's INTERFACE directives. Co-simulated in VHDL and Verilog, the warnings asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { addDirectives } from '../core/c-pragma.js';
import { renamedWhy } from '../core/c-names.js';

const LANGS = ['vhdl', 'verilog'];
const CTRL = ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready'];
const names = (g) => g.ports.map((p) => p.name).filter((n) => !CTRL.includes(n));
const warnings = (g) => g.diagnostics.filter((d) => d.severity === 'warning').map((d) => d.message);
/** Both languages: its ports (the given ones), its warnings, the co-simulation passing; the VHDL's latency. */
function both(src, ports, warns = [], opts = {}) {
  let latency;
  for (const lang of LANGS) {
    const c = cosimulate(src, { lang, ...opts });
    assert.deepEqual(c.errors, [], lang);
    assert.deepEqual(names(c.gen).sort(), [...ports].sort(), lang);
    assert.deepEqual(warnings(c.gen), warns, lang);
    assert.ok(c.pass, `${lang}: ${JSON.stringify(c.mismatches, (k, v) => (typeof v === 'bigint' ? String(v) : v))}`);
    latency = c.latency;
  }
  return latency;
}

const GOOD = (pragmas) => `void f(volatile int *o, volatile int *in) {
${pragmas}
  int acc = 0;
  acc += *in;
  acc += *(in + 1);
  *o = acc;
  acc += *(in + 2);
  acc += *(in + 3);
  *(o + 1) = acc;
}
int main() {
  int in[4] = { 1, 2, 3, 4 }, o[4] = { 0, 0, 0, 0 };
  f(o, in);
  return o[0] == 3 && o[1] == 10 ? 0 : 1;
}
`;
const RENAMED = renamedWhy('in');
const FIFO = ['o_din', 'o_full_n', 'o_write', 'in_r_dout', 'in_r_empty_n', 'in_r_read'];

test('#1901 ap_fifo on a pointer indexed: _din _full_n _write, _dout _empty_n _read, each access in order; no depth to say', () => {
  both(GOOD('#pragma HLS INTERFACE ap_fifo port=o\n#pragma HLS INTERFACE mode=ap_fifo port=in'), FIFO, [RENAMED], { file: 'f.c' });
});

test('#1901 a config\'s directive is the pragma: its port, depth= and mode= in any order', () => {
  const dirs = ['interface f in depth=4 mode=ap_fifo', 'interface f mode=ap_fifo o depth=2', 'pipeline f', 'interface nothing mode=ap_fifo x'];
  const g = cToHdl(GOOD(''), { file: 'f.c', top: 'f', directives: dirs });
  assert.deepEqual(names(g).sort(), [...FIFO].sort());
  assert.deepEqual(warnings(g), [RENAMED]);
  both(GOOD(''), FIFO, [RENAMED], { file: 'f.c', directives: dirs });
  const f = { name: 'f', body: { items: [] }, loc: { line: 1 } };
  addDirectives(f, ['interface f mode=ap_hs p', 'unroll f/L']);
  assert.deepEqual(f.body.items.map((s) => s.pragma.args), [{ mode: 'ap_hs', port: 'p' }]);
  // (none given: its memories, as before)
  assert.ok(names(cToHdl(GOOD(''), { file: 'f.c', top: 'f' })).includes('o_address0'));
});

const HS = `void f(volatile int *o, volatile int *a) {
#pragma HLS INTERFACE ap_hs port=o
#pragma HLS INTERFACE ap_hs port=a
  int acc = 0;
  acc += *a;
  acc += *a;
  *o = acc;
  acc += *a;
  acc += *a;
  *o = acc;
}
int main() {
  int o;
  for (int a = 0; a < 4; a++) { f(&o, &a); if (o != 4 * a) return 1; }
  return 0;
}
`;

test('#1901 ap_hs on scalar pointers: sequential, each access a handshake (_ap_vld, _ap_ack), the last value the C\'s', () => {
  both(HS, ['o', 'o_ap_vld', 'o_ap_ack', 'a', 'a_ap_vld', 'a_ap_ack'], [], { file: 'f.c' });
  const g = cToHdl(HS, { file: 'f.c' });
  const dir = Object.fromEntries(g.ports.map((p) => [p.name, p.dir]));
  assert.deepEqual([dir.o, dir.o_ap_vld, dir.o_ap_ack, dir.a, dir.a_ap_vld, dir.a_ap_ack], ['out', 'out', 'in', 'in', 'in', 'out']);
  assert.equal(g.sequential, true);
});

test('#1901 a co-simulation that differs from the C is found on a handshake', () => {
  const c = cosimulate(HS, { file: 'f.c', lang: 'verilog', alter: (h) => h.replace(/assign o = /, 'assign o = 1 + ') });
  assert.equal(c.errors.length, 0);
  assert.equal(c.pass, false);
  assert.deepEqual([...new Set(c.mismatches.map((m) => m.port))], ['o[0]']);
});

test('#1901 what a FIFO cannot do: said; an interface the argument cannot have: a warning, its default made', () => {
  const err = (body, pragma = '#pragma HLS INTERFACE ap_fifo port=p') => cToHdl(`void f(volatile int *p) {\n${pragma}\n${body}\n}\n`, { file: 'f.c', top: 'f' }).diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
  assert.deepEqual(err('int x = p[2]; x += p[1];'), ["the argument 'p' (ap_fifo): its values are read and written in order, one after the other: p[1] comes after p[2]"]);
  assert.deepEqual(err('*p += 1;'), ["the argument 'p' (ap_fifo): a write is a statement of its own, p[i] = v: it is read or written, not both"]);
  assert.deepEqual(err('int x = *p; *p = x + 1;'), ["the stream 'p' is read and written: a stream argument is one or the other (ap_fifo)"]);
  const scalar = cToHdl('int f(int x) {\n#pragma HLS INTERFACE ap_hs port=x\n  return x + 1;\n}\n', { file: 'f.c', top: 'f' });
  assert.deepEqual(warnings(scalar), ['#pragma HLS INTERFACE ap_hs port=x is not made of this argument (a pointer): ignored (its default interface made)']);
  assert.deepEqual(names(scalar).sort(), ['ap_return', 'x']);
});

const NOPIPE = { file: 'f.c', pipelineLoops: 0 };
const TB = (call, n = 8) => `int main() {
  int a[${n}], b[${n}], s = 0;
  for (int i = 0; i < ${n}; i++) { a[i] = i * i + 1; b[i] = 0; }
  ${call}
  return s;
}
`;
const R2 = `int f(int a[8]) {
#pragma HLS INTERFACE ap_memory port=a storage_type=ram_t2p
  int s = 0;
  for (int i = 0; i < 7; i++) s += a[i] * a[i + 1];
  return s;
}
${TB('int r = f(a); int e = 0; for (int i = 0; i < 7; i++) e += a[i] * a[i + 1]; s = r != e;')}`;

test('#1901 ram_t2p: a statement\'s two reads in one state, port 1 used, fewer cycles than one port; same result', () => {
  const two = both(R2, ['a_address0', 'a_ce0', 'a_q0', 'a_address1', 'a_ce1', 'a_q1', 'ap_return'], [], NOPIPE);
  const one = both(R2.replace(' storage_type=ram_t2p', ''), ['a_address0', 'a_ce0', 'a_q0', 'ap_return'], [], NOPIPE);
  assert.ok(two.max < one.max, `${two.max} < ${one.max}`);
});

const WR = (st) => `void f(int a[8], int b[8]) {
#pragma HLS INTERFACE ap_memory port=b storage_type=${st}
  for (int i = 0; i < 7; i += 2) {
    b[i] = a[i] + 1;
    b[i + 1] = i;
  }
}
${TB('f(a, b); for (int i = 0; i < 7; i += 2) if (b[i] != a[i] + 1 || b[i + 1] != i) s = 1;')}`;

test('#1901 ram_t2p: two writes in one state when their addresses differ; ram_2p: its writes on port 1, as Vitis HLS names them', () => {
  const A = ['a_address0', 'a_ce0', 'a_q0'];
  both(WR('ram_t2p'), [...A, 'b_address0', 'b_ce0', 'b_we0', 'b_d0', 'b_address1', 'b_ce1', 'b_we1', 'b_d1'], [], NOPIPE);
  both(WR('ram_2p'), [...A, 'b_address1', 'b_ce1', 'b_we1', 'b_d1'], [], NOPIPE);
  both(WR('ram_1p'), [...A, 'b_address0', 'b_ce0', 'b_we0', 'b_d0'], [], NOPIPE);
});

test('#1901 two writes that may be one address: kept apart, the C\'s order', () => {
  const src = `void f(int b[8], int i, int j) {
#pragma HLS INTERFACE ap_memory port=b storage_type=ram_t2p
  b[i] = 1;
  b[j] = 2;
}
int main() { int b[8] = { 0 }; f(b, 3, 3); return b[3] != 2; }
`;
  both(src, ['b_address0', 'b_ce0', 'b_we0', 'b_d0', 'b_address1', 'b_ce1', 'b_we1', 'b_d1', 'i', 'j'], [], NOPIPE);
});

const LOCAL = (st) => `int f(int x) {
  int m[16];
#pragma HLS BIND_STORAGE variable=m type=${st}
  for (int i = 0; i < 16; i++) m[i] = x + i;
  int s = 0;
  for (int i = 0; i < 15; i++) s += m[i] * m[i + 1];
  return s;
}
int main() { int e = 0; for (int i = 0; i < 15; i++) e += (5 + i) * (6 + i); return f(5) != e; }
`;

test('#1901 BIND_STORAGE of a local array: a memory of that many ports (a small one too), co-simulated; another type said', () => {
  for (const st of ['ram_1p', 'ram_2p', 'ram_t2p']) {
    both(LOCAL(st), ['x', 'ap_return'], [], NOPIPE);
    for (const lang of LANGS) assert.match(cToHdl(LOCAL(st), { ...NOPIPE, lang }).hdl, /ap_m_m_q0/);
  }
  const two = cToHdl(LOCAL('ram_t2p'), { ...NOPIPE, lang: 'verilog' }).hdl;
  assert.match(two, /ap_m_m_q1/);
  const bad = cToHdl(LOCAL('ram_1wnr'), NOPIPE);
  assert.deepEqual(warnings(bad), ['#pragma HLS BIND_STORAGE type=ram_1wnr is not one Silinx makes (ram_1p, ram_2p, ram_s2p, ram_t2p, rom_1p, rom_2p): ignored']);
  assert.deepEqual(cToHdl('int f(int x) {\n#pragma HLS BIND_STORAGE type=ram_2p\n  return x;\n}\n', { file: 'f.c', top: 'f' }).diagnostics.map((d) => d.message), ['#pragma HLS BIND_STORAGE needs variable=<the array>']);
});

test('#1901 a memory argument of a loop with UNROLL: both ports (as Vitis HLS\'s schedule asks); factor=1, one', () => {
  const src = (factor) => `void f(int a[8], int b[8]) {
  for (int i = 0; i < 8; i++) {
#pragma HLS UNROLL factor=${factor}
    b[i] = a[i] + 1;
  }
}
${TB('f(a, b); for (int i = 0; i < 8; i++) if (b[i] != a[i] + 1) s = 1;')}`;
  both(src(2), ['a_address0', 'a_ce0', 'a_q0', 'a_address1', 'a_ce1', 'a_q1', 'b_address0', 'b_ce0', 'b_we0', 'b_d0', 'b_address1', 'b_ce1', 'b_we1', 'b_d1'], [], NOPIPE);
  both(src(1), ['a_address0', 'a_ce0', 'a_q0', 'b_address0', 'b_ce0', 'b_we0', 'b_d0'], [], NOPIPE);
});

const DF = (pragma = '') => `void load(int *in, int *out) { for (int i = 0; i < 4; i++) out[i] = in[i] + 1; }
void save(int *in, int *out) { for (int i = 0; i < 4; i++) out[i] = in[i] * 2; }
void top(int a[4], int b[4]) {
#pragma HLS DATAFLOW
${pragma}
  int c[4];
  load(a, c);
  save(c, b);
}
int main() { int a[4] = { 1, 2, 3, 4 }, b[4]; top(a, b); for (int i = 0; i < 4; i++) if (b[i] != (a[i] + 1) * 2) return 1; return 0; }
`;

test('#1901 a DATAFLOW top\'s memories: both ports, all their signals, as Vitis HLS makes them; a pragma\'s other interface not', () => {
  const all = (n) => ['address0', 'ce0', 'd0', 'q0', 'we0', 'address1', 'ce1', 'd1', 'q1', 'we1'].map((s) => `${n}_${s}`);
  both(DF(), [...all('a'), ...all('b')], [], { file: 'f.c' });
  const g = cToHdl(DF('#pragma HLS INTERFACE m_axi port=a'), { file: 'f.c' });
  // (m_axi, #1893: its AXI master; the module inside the AXI one has none of the ports added)
  assert.deepEqual(names(g).filter((n) => /^[ab]_/.test(n)).sort(), ['b_address0', 'b_ce0', 'b_d0', 'b_we0']);
});

test('#1901 ram_t2p in a pipelined loop: its two reads in one state, the II asked for made; one port, the II it can', () => {
  const src = R2.replace('for (int i = 0; i < 7; i++) s +=', 'for (int i = 0; i < 7; i++) {\n#pragma HLS PIPELINE II=1\n    s +=').replace('a[i + 1];\n  return s', 'a[i + 1];\n  }\n  return s');
  both(src, ['a_address0', 'a_ce0', 'a_q0', 'a_address1', 'a_ce1', 'a_q1', 'ap_return'], [], { file: 'f.c' });
  // (one port: two states an iteration, said)
  both(src.replace(' storage_type=ram_t2p', ''), ['a_address0', 'a_ce0', 'a_q0', 'ap_return'], ['#pragma HLS PIPELINE II=1: II=2 made (the memory \'a\' has one port, accessed 2 times an iteration)'], { file: 'f.c' });
});

test('#1901 two ports in a pipelined loop: in the C\'s order across its ports, a read seeing the write before it', () => {
  const src = (type) => `int f(int a[8]) {
#pragma HLS INTERFACE ap_memory port=a storage_type=${type}
  int s = 0;
  for (int i = 0; i < 8; i++) {
#pragma HLS PIPELINE II=2
    a[i] = i * 3 + 1;
    s += a[i];
  }
  return s;
}
int main() {
  int a[8] = { 0 };
  int s = f(a);
  return s == 92 && a[7] == 22 ? 0 : 1;
}
`;
  both(src('ram_2p'), ['a_address0', 'a_ce0', 'a_q0', 'a_address1', 'a_ce1', 'a_we1', 'a_d1', 'ap_return'], [], { file: 'f.c' });
  both(src('ram_t2p'), ['a_address0', 'a_ce0', 'a_we0', 'a_d0', 'a_q0', 'a_address1', 'a_ce1', 'a_we1', 'a_d1', 'a_q1', 'ap_return'], [], { file: 'f.c' });
});

test('#1901 ram_2p in a pipelined function: its write on port 1 (it was lost), its read on port 0, II=1', () => {
  const src = `void f(int wr, int rd, int aw, int d, int ar, int *q) {
#pragma HLS PIPELINE II=1
  static int buf[16];
#pragma HLS BIND_STORAGE variable=buf type=ram_2p
  if (rd) *q = buf[ar];
  if (wr) buf[aw] = d;
}
int main() {
  int q = 0, s = 0;
  for (int i = 0; i < 16; i++) f(1, 0, i, i * i, 0, &q);
  for (int i = 0; i < 16; i++) { f(0, 1, 0, 0, i, &q); s += q; }
  return s == 1240 ? 0 : 1;
}
`;
  both(src, ['wr', 'rd', 'aw', 'd', 'ar', 'q', 'q_ap_vld'], [], { file: 'f.c' });
});
