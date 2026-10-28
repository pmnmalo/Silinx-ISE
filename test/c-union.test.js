// Silinx HLS (#1896, core/c-union.js): unions and bit-fields. A union one word of its size, its members views of the
// word's bits as GCC on x86 lays them out (an anonymous struct's bit-fields the union's members: float_num_t's mant,
// bexp, sign; a named struct member, an array member, a signed bit-field, a bit-field straddling its unit moved to the
// next); a union by a pointer (p->m), an array of unions, { e } its first member's value; a struct's bit-fields members
// of their widths, wrapped as C wraps them. The C simulation as cc's, the co-simulation in VHDL and Verilog with no
// warning; what is not supported, said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { noCC, compiledRun } from './c-helpers.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);

const UNIONS = `#include <stdio.h>
#include <stdint.h>
typedef union {
  float f;
  uint32_t u;
  struct { uint32_t mant : 23; uint32_t bexp : 8; uint32_t sign : 1; };
} fnum_t;
struct pair { uint16_t lo; uint16_t hi; };
union word {
  uint32_t w;
  uint8_t b[4];
  struct pair p;
  struct { int s : 5; unsigned a : 5; unsigned c : 30; } bits;
};
struct flags { unsigned on : 1, : 2; int level : 4; unsigned code : 11, more, : 0; };

static void bump(union word *x, int k) { x->b[k & 3] += 1; x->p.hi ^= 0x00F0; }

uint32_t unions(float x, int8_t n, uint32_t v, int k) {
  fnum_t a, b;
  a.f = x;
  b.sign = a.sign;
  b.bexp = a.bexp + n;
  b.mant = a.mant;
  union word w = { 0x11223344 };
  w.b[k & 3] = 0xA5;
  bump(&w, k + 1);
  w.bits.s = v;
  w.bits.c += v;
  struct flags fl;
  fl.on = v;
  fl.level = v >> 1;
  fl.code = v * 3;
  union word arr[2] = { { 7 }, { 9 } };
  arr[k & 1].p.lo = (uint16_t)v;
  return b.u ^ w.w ^ (uint32_t)(w.bits.s * 7) ^ ((uint32_t)fl.level << 3) ^ fl.code ^ fl.on ^ arr[0].w ^ arr[1].w ^ (uint32_t)w.bits.c ^ w.bits.a;
}

int main(void) {
  float xs[5] = { 1.5f, -3.25f, 1e-3f, 6.0e7f, -0.0f };
  for (int i = 0; i < 5; i++) {
    uint32_t r = unions(xs[i], (int8_t)(i * 3 - 4), 0x9E3779B9u * (i + 1), i);
    fnum_t q; q.u = r;
    printf("%08x %u %u %u %g\\n", (unsigned)r, (unsigned)q.sign, (unsigned)q.bexp, (unsigned)q.mant, q.f);
  }
  printf("%d %d\\n", (int)sizeof(fnum_t), (int)sizeof(union word));
  return 0;
}
`;

// (the corpus's form: a double's exponent moved by n through its bit-fields, #1896)
const POW2 = `#include <stdio.h>
#include <stdint.h>
typedef union {
  double fp_num;
  uint64_t raw_bits;
  struct { uint64_t mant : 52; uint64_t bexp : 11; uint64_t sign : 1; };
} double_num_t;
double double_mul_pow2(double x, int16_t n) {
  double_num_t x_num, prod;
  x_num.fp_num = x;
  if (x_num.bexp == 0x7FF || x_num.bexp == 0) prod.fp_num = x_num.fp_num;
  else if (n >= 0 && x_num.bexp >= 2047 - n) { prod.sign = x_num.sign; prod.bexp = 0x7FF; prod.mant = 0; }
  else if (n < 0 && x_num.bexp <= -n) { prod.sign = x_num.sign; prod.bexp = 0; prod.mant = 0; }
  else { prod.sign = x_num.sign; prod.bexp = x_num.bexp + n; prod.mant = x_num.mant; }
  return prod.fp_num;
}
int main(void) {
  double xs[6] = { 1.5, -2.75, 1e300, 3e-300, 0.0, -1e-310 };
  int16_t ns[6] = { -15, 7, 100, -100, 3, 4 };
  for (int i = 0; i < 6; i++) {
    double_num_t r;
    r.fp_num = double_mul_pow2(xs[i], ns[i]);
    printf("%g %016llx %c %d %llx\\n", r.fp_num, (unsigned long long)r.raw_bits, r.sign ? '-' : '+', (int)r.bexp - 1023, (unsigned long long)r.mant);
  }
  return 0;
}
`;

test('#1896 unions and bit-fields in the C simulation: as cc\'s (their layout, their wrapping, the floats\' bits)', { skip: noCC }, () => {
  for (const [name, src] of [['unions', UNIONS], ['pow2', POW2]]) {
    const sim = simulateC(src, { file: `${name}.c` });
    assert.deepEqual([sim.error, sim.exitCode, sim.diagnostics], [null, 0, []], name);
    assert.equal(sim.output, compiledRun(src).output, name);
  }
});

test('#1896 unions and bit-fields in C++ too: a class\'s bit-fields (public:, T a : 3, b : 5;), its methods reading them', () => {
  const src = '#include "ap_int.h"\nstruct S {\npublic:\n  unsigned a : 3, b : 5;\n  int x = 1 ? 2 : 3;\n  int get() const { return a ? b : x; }\n};\nunion U { float f; unsigned u; };\n'
    + 'int top(int v) { S s; s.a = v; s.b = v >> 3; U w; w.f = 2.0f; return s.get() + s.a + (int)(w.u >> 23); }\nint main() { return top(13) == 6 + 128 ? 0 : 1; }\n';
  const sim = simulateC(src, { file: 'u.cpp' });
  assert.deepEqual([sim.error, sim.exitCode, sim.diagnostics], [null, 0, []]);
});

test('#1896 unions and bit-fields co-simulated in VHDL and Verilog: no warning; the float and the double arguments their ports', () => {
  for (const lang of ['vhdl', 'verilog']) {
    for (const [name, src, ports] of [['unions', UNIONS, ['x:32', 'n:8', 'v:32', 'k:32', 'ap_return:32']], ['pow2', POW2, ['x:64', 'n:16', 'ap_return:64']]]) {
      const r = cosimulate(src, { file: `${name}.c`, lang });
      assert.deepEqual(r.errors, [], `${name} ${lang}`);
      assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
      assert.deepEqual(r.gen.diagnostics, [], `${name} ${lang}`);
      assert.deepEqual(r.gen.ports.filter((p) => !/^ap_(start|done|idle|ready|clk|rst)$/.test(p.name)).map((p) => `${p.name}:${p.w}`), ports);
    }
  }
});

test('#1896 unions and bit-fields: what is not supported, said', () => {
  const errs = (src) => cToHdl(src, { file: 'e.c' }).diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
  assert.deepEqual(errs('union big { uint64_t a; uint32_t b[3]; };\nint f(int x) { union big u; u.a = x; return u.b[1]; }\n'), ["1 error: the union 'big': 128 bits: a union of up to 64 bits is supported"]);
  assert.deepEqual(errs('union p { int *q; int a; };\nint f(int x) { return x; }\n'), ["1 error: the union 'p': a pointer in it is not possible in Silinx HLS"]);
  assert.deepEqual(errs('union u { int a; float b; };\nint f(int x) { union u v; v.a = x; v.a++; return v.a; }\n'), ["2 error: 'a' of a union: ++ and -- on it are not supported yet (write v.a += 1)"]);
  assert.deepEqual(errs('union u { int a; float b; };\nint f(int x) { union u v = { .b = 1.0f }; return v.a + x; }\n'), ["2 error: 'v': a designated initializer of a union is not supported yet (its first member's value: { v })"]);
  assert.deepEqual(errs('struct s { union { int a; float b; } u; int c; };\nint f(int x) { struct s v; v.c = x; return v.c; }\n'), ['1 error: a union inside a struct is not supported yet (a union of its own, a member of the struct)']);
  assert.deepEqual(errs('union u { int a; struct { int x : 40; }; };\nint f(int x) { union u v; v.a = x; return v.a; }\n'), ["1 error: the union 'u': the bit-field 'x' must be a constant width from 0 to 32, of an integer type"]);
  assert.deepEqual(errs('union u { int a; short b; };\nint f(int x) { union u v; v.a = x; return v.c; }\n'), ["2 error: 'c' is not a member of u"]);
  assert.deepEqual(errs('union u { int a; struct { short lo, hi; } h; };\nint f(int x) { union u v; v.a = x; return v.h; }\n'), ["2 error: 'h': a struct of the union 'u': give its member (v.h.m)"]);
  assert.deepEqual(errs('struct t { unsigned a : 3; int b : 40; };\nint f(int x) { struct t v; v.a = x; return v.a; }\n'), ["1 error: the bit-field 'b': a constant width from 1 to its type's bits, of a C integer type"]);
});
