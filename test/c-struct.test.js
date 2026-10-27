// Silinx HLS (#1590): core/c-struct.js. Structs disaggregated (a variable per member, named by the variable and the
// member; an array of structs an array per member; nested structs, member arrays), copied, initialized ({ … } nested or
// not), passed to functions (by value, by reference, by address, arrays of them), returned; enums (enum class too).
// Each program against the host's compiler (C: cc; C++: c++ with AMD's ap_int.h), co-simulated in VHDL and Verilog
// with their warnings; what is not supported said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { lex } from '../core/c-lex.js';
import { noCC, compiledRun } from './c-helpers.js';
import { apIntHeaders, runWithApInt } from './ap-int-ref.js';

const AP = await apIntHeaders();
const toks = (src, file = 'a.c') => lex(src, file).tokens.filter((x) => x.t !== 'eof').map((x) => x.v).join(' ');
const errs = (src, file = 'e.c') => cToHdl(src, { file }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);

const BOXES = `#include <stdio.h>
typedef struct { short x; short y; } pt_t;
struct box { pt_t lo, hi; unsigned char tag[3]; };
enum color { RED, GREEN = 5, BLUE };
static struct box saved = { {1, 2}, {3, 4}, {7, 8, 9} };
int area(struct box b) { return (b.hi.x - b.lo.x) * (b.hi.y - b.lo.y); }
void grow(struct box *b, short d) { b->hi.x += d; b->hi.y += d; b->tag[0]++; }
pt_t mid(struct box b) { pt_t m; m.x = (b.lo.x + b.hi.x) / 2; m.y = (b.lo.y + b.hi.y) / 2; return m; }
int top(short x0, short y0, short x1, short y1, int *a, int *s) {
  struct box b = { {x0, y0}, {x1, y1}, {0} };
  pt_t pts[4] = { {1, 1}, {2, 2} };
  grow(&b, 2);
  *a = area(b);
  pt_t m = mid(b);
  pts[3] = m;
  int sum = 0;
  for (int i = 0; i < 4; i++) sum += pts[i].x * 10 + pts[i].y;
  struct box c;
  c = saved;
  saved = b;
  *s = sum + c.tag[0] + c.tag[2] + BLUE;
  return m.x + m.y + b.tag[0] + GREEN;
}
int main(void) {
  int a, s;
  for (int k = 0; k < 4; k++) {
    int r = top(k, k + 1, 10 + k, 20 - k, &a, &s);
    printf("%d %d %d\\n", r, a, s);
  }
  return 0;
}
`;

const CPP = `#include <iostream>
#include "ap_int.h"
#define N 6
struct A {
  int foo[3];
  ap_int<23> bar;
};
struct Acc { int sum = 0; ap_uint<4> n; };
enum class Mode { ADD, SUB };
void step(Acc &acc, const A &a, Mode m) {
  int v = a.foo[0] + a.foo[1] + a.foo[2] + a.bar;
  acc.sum += m == Mode::ADD ? v : -v;
  acc.n++;
}
int dut(A arr[N], int &cnt) {
  Acc acc;
  acc.n = 0;
  for (unsigned i = 0; i < N; i++) {
    auto tmp = arr[i];
    step(acc, tmp, i % 2 ? Mode::SUB : Mode::ADD);
    arr[i].foo[1] = tmp.bar;
  }
  cnt = acc.n;
  return acc.sum;
}
int main() {
  A arr[N];
  for (unsigned i = 0; i < N; i++) {
    arr[i].foo[0] = i * 4;
    arr[i].foo[1] = i * 4 + 1;
    arr[i].foo[2] = i * 4 + 2;
    arr[i].bar = i * 4 + 3;
  }
  int c;
  auto ret = dut(arr, c);
  std::cout << "ret = " << ret << " " << c << " " << arr[5].foo[1] << std::endl;
  return 0;
}
`;

test("#1590 structs as tokens: a variable per member (nested, member arrays, arrays of structs), the initial values of { … } (nested, elided, the missing zero), members' defaults, enums' constants", () => {
  assert.equal(toks('typedef struct { short x, y; } pt;\nstruct seg { pt a, b; char tag[2]; };\nstruct seg s = { {1, 2}, {3}, {7} };\n'),
    'short s_a_x = 1 ; short s_a_y = 2 ; short s_b_x = 3 ; short s_b_y = 0 ; char s_tag [ ( 2 ) ] = { 7 , 0 } ;');
  assert.equal(toks('struct p { int x; int y; };\nstruct p q[2] = { 1, 2, 3 };\nint f(int i) { return q[i].y; }\n'),
    'int q_x [ ( 2 ) ] = { 1 , 3 } ; int q_y [ ( 2 ) ] = { 2 , 0 } ; int f ( int i ) { return q_y [ ( i ) ] ; }');
  assert.equal(toks('struct r { int v[3]; };\nint f(int i, int j) { struct r a[4]; a[i].v[j] = 1; return a[2].v[1]; }\n'),
    'int f ( int i , int j ) { int a_v [ ( 4 ) * ( 3 ) ] ; a_v [ ( ( i ) ) * ( 3 ) + ( j ) ] = 1 ; return a_v [ ( ( 2 ) ) * ( 3 ) + ( 1 ) ] ; }');
  assert.equal(toks('struct c { int n = 3; };\nint f() { c k; return k.n; }\n', 'a.cpp'), 'int f ( ) { int k_n = 3 ; return k_n ; }');
  assert.equal(toks('enum e { A, B = 5, C };\nenum class m : int { X = C + 1, Y };\nint f(enum e v) { return v == C ? X : Y; }\n', 'a.cpp'),
    'const int A = 0 ; const int B = 5 ; const int C = 6 ; const int X = 7 ; const int Y = 8 ; int f ( int v ) { return v == C ? X : Y ; }');
});

test('#1590 structs in C: copied, passed by value and by address, returned, global and static ones; enums: the C simulation as cc\'s', { skip: noCC }, () => {
  const sim = simulateC(BOXES, { file: 'boxes.c' });
  assert.deepEqual([sim.error, sim.diagnostics], [null, []]);
  const ref = compiledRun(BOXES);
  assert.deepEqual([sim.output, sim.exitCode], [ref.output, ref.exitCode]);
});

test('#1590 structs in C: co-simulated in VHDL and Verilog, no warning', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(BOXES, { file: 'boxes.c', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics, []);
    assert.equal(r.gen.sequential, true);
  }
});

test('#1590 structs in C++: an array of structs with member arrays (an argument), auto, references, const references, enum class, member defaults: the C simulation as the C++ compiler with AMD\'s ap_int.h', { skip: AP.why || false }, () => {
  const sim = simulateC(CPP, { file: 'acc.cpp' });
  assert.deepEqual([sim.error, sim.diagnostics, sim.exitCode], [null, [], 0]);
  assert.equal(sim.output, runWithApInt(CPP, AP.dir));
});

test('#1590 structs in C++: co-simulated in VHDL and Verilog; an array of structs argument an ap_memory per member', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(CPP, { file: 'acc.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics.map((d) => d.message), ["the struct argument 'arr': its members are memories of their own (arr_foo, arr_bar); Vitis HLS makes one memory of them (not yet, #1668)"]);
    assert.deepEqual(r.gen.ports.filter((p) => /^arr_/.test(p.name)).map((p) => p.name), ['arr_foo_address0', 'arr_foo_ce0', 'arr_foo_we0', 'arr_foo_d0', 'arr_foo_q0', 'arr_bar_address0', 'arr_bar_ce0', 'arr_bar_q0']);
  }
});

test('#1590 a struct argument or result of the top function: one port each (#1628, core/c-aggregate.js), no warning', () => {
  const src = 'struct P { short x, y; };\nP add(P a, const P &b) {\n  P r;\n  r.x = a.x + b.x;\n  r.y = a.y + b.y;\n  return r;\n}\nint main() { P a = {1, 2}, b = {3, 4}; P c = add(a, b); return c.x == 4 && c.y == 6 ? 0 : 1; }\n';
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'p.cpp', lang });
    assert.deepEqual([r.errors, r.pass], [[], true]);
    assert.deepEqual(r.gen.ports.map((p) => `${p.name}:${p.w}`), ['ap_start:1', 'ap_done:1', 'ap_idle:1', 'ap_ready:1', 'a:32', 'b:32', 'ap_return:32']);
    assert.deepEqual(r.gen.diagnostics, []);
  }
});

test('#1590 structs: what is not supported said', () => {
  assert.deepEqual(errs('union u { int a; short b; };\nint f(void) { return 0; }\n'), ['1 a union is not possible in Silinx HLS (its members share their bits: write the conversions)']);
  assert.deepEqual(errs('struct s { int *p; int a; };\nint f(void) { struct s v; v.a = 1; return v.a; }\n'), ["1 the member 'p': a pointer in a struct is not possible in Silinx HLS"]);
  assert.deepEqual(errs('struct s { int a : 3; };\nint f(void) { return 0; }\n'), ["1 the member 'a': a bit field is not supported (write ap_uint<W>)"]);
  assert.deepEqual(errs('struct b { int x; };\nstruct s : b { int a; };\nint f() { return 0; }\n', 'e.cpp'), ["2 the struct 's': a base class is not supported yet"]);
  assert.deepEqual(errs('struct s { int a; };\nint f(void) { struct s v, *p; v.a = 1; return v.a; }\n'), ['2 a pointer or a reference to a struct (s) as a variable is not possible in Silinx HLS: use the struct or an index']);
  assert.deepEqual(errs('struct s { int a; };\nint g(int x) { return x; }\nint f(void) { struct s v; v.a = 1; return g(v); }\n'), ["3 the struct 'v' used as a value here: copy it (x = v;), pass it to a function or read its members"]);
  assert.deepEqual(errs('struct s { int a; };\nint f(struct s *p, int i) { return p[i].a; }\n'), []);   // (#1684: an array of structs)
  assert.deepEqual(errs('struct s { int a; };\nint f(struct s v) { return v.b; }\n'), ["2 'b' is not a member of s"]);
  assert.deepEqual(errs('struct s { int a; };\nstruct t { int a; };\nint f(struct s v) { struct t w; w = v; return w.a; }\n'), ['3 a s copied to a t']);
  assert.deepEqual(errs('struct s { int a; };\nstruct s mk(int x) { struct s r; r.a = x; return r; }\nint f(int x) { return mk(x).a; }\n'), ["3 'mk' returns a struct: call it as a statement, x = mk(…); or S x = mk(…);"]);
  assert.deepEqual(errs('struct s { int a; };\nint f(int x) { s v(x); return v.a; }\n', 'e.cpp'), ["2 'v': s has no constructor of 1 argument(s)"]);
});

test('#1703 a struct initialized from another struct\'s members (S v = {w.a, w.b};), an array of structs from them, nested: the C simulation as cc\'s, co-simulated in VHDL and Verilog', { skip: noCC }, () => {
  const src = '#include <stdio.h>\nstruct in { short a; char b; };\nstruct out { int s; struct in c; };\nint f(int x) {\n  struct in w = {x, x + 1};\n  struct out o = {w.a * 3, {w.b, w.a}};\n  struct in t[2] = {{o.c.b, w.b}, {o.s, o.c.a}};\n  return o.s + o.c.a * 10 + t[1].a + t[0].b;\n}\nint main(void) { for (int x = -3; x < 4; x++) printf("%d\\n", f(x * 7)); return 0; }\n';
  const sim = simulateC(src, { file: 'init.c' });
  assert.deepEqual([sim.error, sim.diagnostics], [null, []]);
  assert.equal(sim.output, compiledRun(src).output);
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'init.c', lang });
    assert.deepEqual([r.errors, r.pass, r.gen.diagnostics], [[], true, []], JSON.stringify(r.mismatches, big));
  }
});
