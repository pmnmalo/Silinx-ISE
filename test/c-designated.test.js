// Silinx HLS (#1963, core/c-designated.js, core/c-union.js): a union over 64 bits a word of its size, a union in a struct
// (named, anonymous, of a type's name, in an array of structs, by a pointer, copied and returned), ++ and -- on a member
// (bit-fields wrapping, the value of x++ and ++x), designated initializers (of structs, arrays and unions; nested,
// out of order, overridden, static). The C simulation as the host's cc and c++, the co-simulation in VHDL and Verilog
// with their warnings; what is not supported, said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { lf, noCC, compiledRun } from './c-helpers.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);

const BIG = `#include <stdio.h>
#include <stdint.h>
union big { uint32_t w[4]; uint64_t d[2]; uint8_t b[16]; struct { uint16_t lo; uint16_t hi; } h; };
union three { uint32_t w[3]; uint8_t b[12]; };
static union big table = { .d = { 0x1122334455667788ULL, 0x99AABBCCDDEEFF00ULL } };
uint32_t bigu(uint32_t v, int k) {
  union big u = { { 1, 2, 3, v } };
  u.b[k & 15] = 0xA5;
  u.d[1] ^= ((uint64_t)v << 32) | v;
  u.h.hi += 3;
  union three t;
  t.w[0] = v; t.w[1] = ~v; t.w[2] = v * 3;
  t.b[k & 11] += 1;
  union big c = u;
  c.w[k & 3]++;
  return u.w[0] ^ u.w[1] ^ u.w[2] ^ u.w[3] ^ t.w[0] ^ t.w[1] ^ t.w[2] ^ c.w[k & 3] ^ table.w[k & 3] ^ (uint32_t)sizeof(union big) ^ (uint32_t)sizeof(union three);
}
int main(void) {
  for (int i = 0; i < 6; i++) printf("%08x\\n", (unsigned)bigu(0x9E3779B9u * (i + 1), i * 5));
  return 0;
}
`;

const IN_STRUCT = `#include <stdio.h>
#include <stdint.h>
union num { float f; uint32_t u; };
typedef union { uint16_t w; uint8_t b[2]; } half_t;
struct rec { int tag; union num n; union { uint8_t c[4]; uint32_t all; } v; int after; };
typedef struct { uint8_t kind; union { uint16_t a; struct { uint8_t l, h; }; }; half_t hs[2]; } anon_t;
struct outer { struct rec r; int z; };
static uint32_t peek(const struct rec *p) { return p->n.u ^ p->v.all; }
static uint32_t val(struct rec p) { return p.n.u ^ p.v.all; }
static void poke(struct rec *p, uint32_t x) { p->n.u = x; p->v.c[1] = (uint8_t)x; p->after++; }
static struct rec make(int t) { struct rec r = { t, { 1.0f }, { { 1, 2, 3, 4 } }, 9 }; return r; }
uint32_t instruct(uint32_t x, int k) {
  struct rec r = { .tag = 1, .n = { .u = x }, .v.all = 7, .after = 2 };
  struct rec a[2] = { { 1, { 2.5f }, { { 9 } }, 3 }, [1] = { .n.f = -1.0f, .after = 4 } };
  struct outer o = { .r = { .tag = 5 }, .z = 6 };
  anon_t an = { 1, { 0x1234 }, { { 0x0102 }, { .b = { 3, 4 } } } };
  anon_t an2 = { .h = 0x7F, .l = 0x10, .hs[1].w = 0x5555 };
  r.v.c[k & 3] = 0x55;
  poke(&r, x ^ 3);
  a[k & 1].v.c[2] = 8;
  a[k & 1].n.u += 1;
  o.r.v.all = x;
  o.r.n.f = 2.0f;
  an.a ^= (uint16_t)x;
  an.h += 1;
  an2.hs[k & 1].b[1] = (uint8_t)x;
  struct rec cp = r;
  cp.n.u ^= 1;
  struct rec m = make(k);
  return peek(&r) ^ val(a[0]) ^ val(a[1]) ^ o.r.v.c[1] ^ o.r.n.u ^ an.a ^ an.kind ^ an.hs[0].w ^ an.hs[1].w ^ an2.a ^ an2.hs[0].w ^ an2.hs[1].w ^ cp.n.u ^ m.n.u ^ m.v.all ^ (uint32_t)a[1].after ^ (uint32_t)r.tag ^ (uint32_t)o.z;
}
int main(void) {
  for (int i = 0; i < 6; i++) printf("%08x\\n", (unsigned)instruct(0x9E3779B9u * (i + 1), i));
  return 0;
}
`;

const INC = `#include <stdio.h>
#include <stdint.h>
union u { int8_t c; uint16_t h; uint32_t w; uint8_t b[4]; struct { unsigned a : 3; int s : 3; unsigned rest : 26; }; float f; };
struct st { int count; unsigned nib : 4; union u in; };
static void down(struct st *p) { p->count--; p->in.h--; --p->in.a; }
uint32_t incs(uint32_t x, int k) {
  union u v; v.w = x;
  v.c++; ++v.h; v.a++; v.s--; v.b[k & 3]--;
  int r0 = v.a++;
  int r1 = ++v.a;
  int r2 = v.s--;
  int r3 = --v.s;
  int r4 = v.c--;
  union u *p = &v;
  p->h++;
  int r5 = p->b[1]++;
  union u fv; fv.f = 1.5f; fv.f++; float g = fv.f--;
  union u arr[2]; arr[0].w = x; arr[1].w = ~x;
  arr[k & 1].b[0]++;
  struct st s = { 1, 15, { .w = x } };
  s.count++; s.nib++; s.in.c++; s.in.a--;
  int r6 = s.count--; int r7 = s.nib--;
  down(&s);
  for (v.b[3] = 0; v.b[3] < 3; v.b[3]++) r0 += v.b[3];
  return v.w ^ (uint32_t)r0 ^ ((uint32_t)r1 << 3) ^ ((uint32_t)r2 << 6) ^ ((uint32_t)r3 << 9) ^ ((uint32_t)r4 << 12) ^ ((uint32_t)r5 << 15) ^ fv.w ^ (uint32_t)g ^ arr[0].w ^ arr[1].w ^ (uint32_t)s.count ^ s.nib ^ s.in.w ^ ((uint32_t)r6 << 2) ^ ((uint32_t)r7 << 4);
}
int main(void) {
  for (int i = 0; i < 6; i++) printf("%08x\\n", (unsigned)incs(0x9E3779B9u * (i + 1), i));
  return 0;
}
`;

const DESIGNATED = `#include <stdio.h>
#include <stdint.h>
enum { RED, GREEN, BLUE, N };
const int SZ = 5;
struct pt { int x, y; };
struct line { struct pt a, b; int w[3]; };
typedef struct { uint8_t r, g, b; } rgb_t;
union fw { float f; uint32_t w; struct { uint16_t lo, hi; } s; uint8_t b[4]; };
static const int rom[8] = { [1] = 10, 20, [6] = 60 };
static const rgb_t pal[N] = { [GREEN] = { .g = 255 }, [BLUE].b = 200, [RED] = { 7, 8 } };
int des(int v, int k) {
  struct pt p = { .y = v, .x = 2 };
  struct pt q = { .x = 1, 9 };
  struct pt z = { .y = 1, .x = 2, .y = 3 };
  int a[4] = { [2] = 5 };
  int b[] = { [3] = v, 1, [1] = 2 };
  int m[2][3] = { [1][2] = 7, [0] = { 1, 2 }, [1][0] = v };
  int c[SZ] = { [SZ - 1] = 4 };
  struct line l = { .b.y = v, .a = { .y = 3 }, .w[1] = 6, 8 };
  struct line l2 = { .a.x = 1, 2, .b = { 3 }, .w = { [2] = 4 } };
  struct pt ps[3] = { [2] = { .y = 1 }, [0].x = 2 };
  union fw u1 = { .w = (uint32_t)v };
  union fw u2 = { .s = { .hi = 3, .lo = 4 } };
  union fw u3 = { .s.hi = 5 };
  union fw u4 = { .b = { [1] = 7 } };
  union fw u5 = { .b[2] = 9, .b[0] = 1 };
  union fw u6 = { .f = 1.5f };
  union fw ua[2] = { [1] = { .s.lo = 2 } };
  static const union fw sf = { .w = 0x11223344u };
  return p.x + p.y * 3 + q.x + q.y * 5 + z.x + z.y * 7 + a[k & 3] + b[k & 3] + b[4] + m[k & 1][(k >> 1) % 3] + c[4] + l.a.y + l.b.y + l.w[1] + l.w[2] + l2.a.x + l2.a.y + l2.b.x + l2.w[2]
    + ps[0].x + ps[2].y + rom[k & 7] + pal[k % 3].r + pal[k % 3].g + pal[k % 3].b + (int)(u1.w ^ u2.w ^ u3.w ^ u4.w ^ u5.w ^ u6.w ^ ua[1].w ^ ua[0].w ^ sf.w);
}
int main(void) {
  for (int i = 0; i < 8; i++) printf("%d\\n", des(1000 * i - 3, i));
  return 0;
}
`;

const CPP = `#include <cstdio>
#include <cstdint>
union U { float f; uint32_t u; };
struct S { int a = 3; int b; U w; union { uint16_t x; uint8_t y[2]; };
  uint32_t get() const { return w.u ^ x; }
  void bump() { w.u++; x--; y[0]++; }
};
struct D { int p = 5; int q = 6; int r; };
void byref(S &s) { s.w.u += 2; s.x++; }
uint32_t cppt(uint32_t v) {
  S s; s.a = 1; s.b = 2; s.w.f = 1.0f; s.x = (uint16_t)v;
  s.bump(); byref(s);
  D d = { .q = (int)v };
  D e { .r = 2 };
  U t { .u = v };
  t.u++;
  return s.get() ^ (uint32_t)(d.p + d.q + d.r + e.p + e.q + e.r) ^ t.u;
}
int main() {
  for (int i = 0; i < 4; i++) printf("%08x\\n", (unsigned)cppt(0x9E3779B9u * (i + 1)));
  return 0;
}
`;
const LOOP = "the number of iterations of this loop is not known: its latency is unknown (#pragma HLS LOOP_TRIPCOUNT max=N in it gives the report a bound)";
const CASES = [['big', BIG, [], ['v:32', 'k:32', 'ap_return:32']], ['in_struct', IN_STRUCT, [], ['x:32', 'k:32', 'ap_return:32']],
  ['inc', INC, [`24 warning: ${LOOP}`], ['x:32', 'k:32', 'ap_return:32']], ['designated', DESIGNATED, [], ['v:32', 'k:32', 'ap_return:32']]];
const said = (ds) => ds.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const ports = (g) => g.ports.filter((p) => !/^ap_(start|done|idle|ready|clk|rst)$/.test(p.name)).map((p) => `${p.name}:${p.w}`);

test('#1963 the C simulation as cc\'s: a union over 64 bits, in a struct, ++ and --, designated initializers', { skip: noCC }, () => {
  for (const [name, src, warnings] of CASES) {
    const sim = simulateC(src, { file: `${name}.c` });
    assert.deepEqual([sim.error, sim.exitCode, said(sim.diagnostics)], [null, 0, warnings], name);
    assert.equal(sim.output, compiledRun(src).output, name);
  }
});

test('#1963 co-simulated in VHDL and Verilog: their warnings, their ports', () => {
  for (const lang of ['vhdl', 'verilog']) {
    for (const [name, src, warnings, ps] of CASES) {
      const r = cosimulate(src, { file: `${name}.c`, lang });
      assert.deepEqual(r.errors, [], `${name} ${lang}`);
      assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
      assert.deepEqual(said(r.gen.diagnostics), warnings, `${name} ${lang}`);
      assert.deepEqual(ports(r.gen), ps, `${name} ${lang}`);
    }
  }
});

test('#1963 C++: a union in a class, its methods, a reference; designated initializers with default values; as c++\'s', () => {
  const sim = simulateC(CPP, { file: 'cpp.cpp' });
  assert.deepEqual([sim.error, sim.exitCode, said(sim.diagnostics)], [null, 0, []]);
  assert.equal(sim.output, '3f8079c8\n3f80f387\n3f806d3e\n3f80e6f5\n');
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(CPP, { file: 'cpp.cpp', lang });
    assert.deepEqual([r.errors, r.pass, said(r.gen.diagnostics)], [[], true, []], lang);
  }
});

test('#1963 the C++ program\'s expected output is the host\'s c++', { skip: noCC }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-cpp-'));
  try {
    fs.writeFileSync(path.join(dir, 't.cpp'), CPP);
    const exe = path.join(dir, process.platform === 'win32' ? 't.exe' : 't');
    try { execFileSync('c++', ['-std=c++20', '-w', '-o', exe, path.join(dir, 't.cpp')], { stdio: 'ignore' }); } catch { return; }   // (no c++ with C++20's designators here)
    assert.equal(lf(execFileSync(exe, { encoding: 'utf8' })), '3f8079c8\n3f80f387\n3f806d3e\n3f80e6f5\n');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('#1963 a union over 64 bits is a port of its size, a struct\'s union part of its port', () => {
  const lang = 'verilog';
  const a = cToHdl('union w { uint32_t v[3]; uint8_t b[12]; };\nunsigned top(union w u, int k) { return u.v[k & 1]; }\n', { file: 'a.c', lang });
  assert.deepEqual([said(a.diagnostics), ports(a)], [[], ['u:96', 'k:32', 'ap_return:32']]);
  const b = cToHdl('struct s { int t; union { short h; char c[2]; } u; };\nint top(struct s x) { return x.t + x.u.c[1]; }\n', { file: 'b.c', lang });
  assert.deepEqual([said(b.diagnostics), ports(b)], [[], ['x:48', 'ap_return:32']]);
});

test('#1963 what is not supported or not right, said', () => {
  const errs = (src) => cToHdl(src, { file: 'e.c' }).diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
  const S = 'struct s { int x, y; };\n';
  assert.deepEqual(errs(`${S}int f(int v) { struct s a = { .z = v }; return a.x; }\n`), ["2 error: 'z' is not a member of 'a'"]);
  assert.deepEqual(errs('int f(int v) { int a[2] = { [2] = v }; return a[0]; }\n'), ["1 error: 'a': the index 2 is outside its array of 2"]);
  assert.deepEqual(errs('int f(int v) { int a[2] = { [1] = v, 3 }; return a[0]; }\n'), ["1 error: 'a': more initial values than it holds"]);
  assert.deepEqual(errs('int f(int v, int k) { int a[2] = { [k] = v }; return a[0]; }\n'), ["1 error: a designator's index must be a constant"]);
  assert.deepEqual(errs(`${S}int f(int v) { struct s a[2] = { .x = v }; return a[0].x; }\n`), ["2 error: 'a': '.x' designates a member of what is not a struct or a union"]);
  assert.deepEqual(errs(`${S}int f(int v) { struct s a = { [0] = v }; return a.x; }\n`), ["2 error: 'a': [0] designates an element of what is not an array"]);
  assert.deepEqual(errs('union u { int a; _Bool b; };\nint f(int x) { union u v; v.a = x; int r = v.b++; return r; }\n'), ["2 error: 'b' of a union: ++ and -- on a bool are supported as a statement only"]);
  assert.deepEqual(errs('union u { int a; short b; };\nint f(int x) { union u v = { .c = x }; return v.a; }\n'), ["2 error: 'c' is not a member of 'v'"]);
  assert.deepEqual(errs('struct s { union { int a; short b; } u; };\nint f(int x) { struct s v; v.u.c = x; return v.u.a; }\n'), ["2 error: 'c' is not a member of s's union"]);
  assert.ok(errs(`${S}int g(struct s a);\nint f(int v) { return g((struct s){ .x = v }); }\n`).includes('3 error: a designated initializer is supported in a declaration of a struct, a union or an array, not here'));
});

test('#1963 an initializer with no designator and no union is left as it is', () => {
  for (const src of ['int a[3] = { 1, 2 };\nint top(int k) { return a[k & 1]; }\n', 'struct s { int x; int y[2]; };\nint top(int k) { struct s v = { 1, { 2, k } }; return v.y[1]; }\n']) {
    const r = cToHdl(src, { file: 'n.c', lang: 'verilog' });
    assert.deepEqual(said(r.diagnostics), []);
  }
});
