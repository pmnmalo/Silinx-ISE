// Silinx HLS C++ (#1964): base classes (core/cpp-method.js, a member of their own, its members and methods found through
// it, a constructor calling the base's) and static objects or arrays of objects whose constructor is not of constants
// (core/c-const-init.js: run at synthesis, the state a register set at the reset). Against the host's C++ with AMD's
// ap_int.h, co-simulated in VHDL and Verilog with no warning; what is not supported said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { lex } from '../core/c-lex.js';
import { apIntHeaders, runWithApInt } from './ap-int-ref.js';

const AP = await apIntHeaders();
const toks = (src) => lex(src, 'a.cpp').tokens.filter((x) => x.t !== 'eof').map((x) => x.v).join(' ');
const errs = (src, file = 'e.cpp') => cToHdl(src, { file }).diagnostics.map((d) => `${d.line} ${d.severity} ${d.message}`);
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const RESET = "a static object's constructor runs at synthesis, its state set at the reset";

const OBJECTS = String.raw`#include <iostream>
#include "ap_int.h"
using namespace std;
struct Base {
  int a;
  ap_uint<6> t[3];
  Base(int v) : a(v) { for (int i = 0; i < 3; i++) t[i] = v + i; }
  int get() const { return a; }
  int twice() const { return get() * 2; }
  void inc() { a++; }
};
struct Mid : public Base {
  int b;
  Mid(int v, int w) : Base(v + 1), b(w) { b += a; }
  int get() const { return Base::get() + b; }
  int sum() { inc(); return get() + t[1]; }
};
struct Other { int o; Other() { o = 5; } int oget() const { return o; } };
struct Both : Mid, private Other {
  int c = 7;
  Both() : Mid(1, 2), c(8) { c += this->a + o; }
  int all() { return sum() + oget() + Mid::b + c + Base::a; }
};
template <typename T> struct TB { T x; TB(T v) : x(v) {} T getx() const { return x; } };
template <typename T, int K> struct TD : TB<T> { T y; TD() : TB<T>(K), y(K * 2) {} T both() { return this->x + y + this->getx(); } };
struct Pt { int p; ap_int<7> q; Pt(int v) : p(v), q(v - 1) { q = q * 2; } Pt() { p = 9; q = -3; } int m(int d) { p += d; q--; return p + q; } };
struct Pd : Pt { int z; Pd(int v) : Pt(v), z(v) {} int mm() { return m(1) + z++; } };
struct Cnt { int n; int s[4]; Cnt(int k) { n = k * 3; for (int i = 0; i < 4; i++) s[i] = k + i * i; } int step(int d) { s[n & 3] += d; n++; return n + s[(n - 1) & 3]; } };
static const int START = 4;
int base_of(const Base &b) { return b.a + 1; }
Cnt gcnt(START + 1);
int top(int x) {
  static Both st;
  static Cnt c(START);
  static Cnt arr[2] = {Cnt(1), 2};
  static Pt pts[3] = {Pt(1), 2};
  static Pd pd = Pd(4);
  static TD<ap_int<10>, 3> td;
  Pt la[2] = {Pt(x), Pt(x + 1)};
  Pt lb[2];
  Mid m(x, 1);
  Base b = m;
  int r = st.all() + c.step(x) + arr[x & 1].s[x & 3]++ + pts[x & 1].m(x) + pd.mm() + lb[1].m(x) + pts[2].p + gcnt.step(2);
  r += td.both() + la[1].m(2) + m.sum() + b.twice() + base_of(m) + m.twice();
  td.y += 1;
  return r;
}
int main() {
  for (int i = 0; i < 6; i++) cout << top(i) << endl;
  return 0;
}
`;
const FIXED = String.raw`#include <iostream>
#include "ap_int.h"
using namespace std;
struct F { ap_fixed<10,4> v; ap_uint<9> u; bool on; F() { v = -1.5; u = 300; on = true; v += (ap_fixed<10,4>)0.25; } };
struct G { int g; G(int k) { g = k * 4; } int get() { g *= 2; return g; } };
struct Mem { F f; int k; Mem() : k(3) {} };
static const F cf;
int top(int x) {
  static F f;
  static G q(3);
  static Mem mem;
  static const int L = 7;
  const int N = 6;
  static G q2(N + L);
  f.v += 1; f.u += x; mem.k += x; mem.f.u++;
  return f.u + f.v.to_int() + q.get() + q2.get() + mem.k + mem.f.u + (f.on ? 1 : 0) + cf.u;
}
int main() { for (int i = 0; i < 4; i++) cout << top(i) << endl; return 0; }
`;

test('#1964 a base class as tokens: a member of its own, first, named by the class; its method called on it; a constructor calling the base\'s', () => {
  assert.equal(toks('struct A {\n  int a;\n  A(int v) : a(v) {}\n  int f() { return a; }\n};\nstruct D : public A {\n  int b;\n  D() : A(2), b(3) {}\n};\nint g() { D d; return d.f() + d.a + d.b; }\n'),
    'int A_f ( int & ap_this_a ) { return ap_this_a ; } void A_ctor0 ( int v , int & ap_this_a ) { ap_this_a = ( v ) ; } void D_ctor0 ( int & ap_this_A_a , int & ap_this_b ) { A_ctor0 ( 2 , ap_this_A_a ) ; ap_this_b = ( 3 ) ; } int g ( ) { int d_A_a ; int d_b ; D_ctor0 ( d_A_a , d_b ) ; return A_f ( d_A_a ) + d_A_a + d_b ; }');
});

for (const [name, src] of [['bases (several, a chain, a template\'s, hidden names, B::f, upcasts, slicing), static objects and arrays, a global', OBJECTS], ['ap_fixed, bool, a member with a constructor, constants as arguments', FIXED]]) {
  test(`#1964 ${name}: the C simulation as the C++ compiler with AMD's ap_int.h`, { skip: AP.why || false }, () => {
    const sim = simulateC(src, { file: 'm.cpp' });
    assert.deepEqual([sim.error, sim.diagnostics, sim.exitCode], [null, [], 0]);
    assert.equal(sim.output, runWithApInt(src, AP.dir));
  });
  test(`#1964 ${name}: co-simulated in VHDL and Verilog, no warning`, () => {
    for (const lang of ['vhdl', 'verilog']) {
      const r = cosimulate(src, { file: 'm.cpp', lang });
      assert.deepEqual(r.errors, []);
      assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
      assert.deepEqual(r.gen.diagnostics, []);
    }
  });
}

test('#1964 a static object\'s state: a register set at the reset to what its constructor computes, no state of its own for the construction', () => {
  const src = 'struct S {\n  int a;\n  S(int v) { a = 0; for (int i = 0; i < v; i++) a += i * 7; }\n  int next() { return ++a; }\n};\nint top() {\n  static S s(5);\n  return s.next();\n}\n';
  assert.equal(toks(src).includes('static int s_a ; S_ctor0 ( 5 , s_a ) ;'), true);
  const sim = simulateC(`${src}#include <stdio.h>\nint main() { printf("%d %d\\n", top(), top()); return 0; }\n`, { file: 'm.cpp' });
  assert.deepEqual([sim.error, sim.diagnostics], [null, []]);
  assert.equal(sim.output.trim().split(' ').map(Number).sort((a, b) => a - b).join(), '71,72');
  const v = cToHdl(src, { file: 'm.cpp', lang: 'verilog' });
  assert.deepEqual(v.diagnostics, []);
  assert.match(v.hdl, /if \(ap_rst\) begin[\s\S]*?ap_r_s_a <= 32'b0+1000110;/);
  const h = cToHdl(src, { file: 'm.cpp', lang: 'vhdl' });
  assert.deepEqual(h.diagnostics, []);
  assert.match(h.hdl, /if ap_rst = '1' then[\s\S]*?ap_r_s_a <= "0+1000110";/);
});

test('#1964 a method of an array of objects: the element by reference, its index computed once when the call is made', () => {
  const src = `#include <stdio.h>
struct P { int p; P(int v) : p(v) {} void bump(int &i) { i++; p += i; } };
int top(int x) {
  static P a[3] = {P(1), P(10), 100};
  int i = x;
  a[i].bump(i);
  return a[0].p + a[1].p * 2 + a[2].p * 3 + i;
}
int main() { for (int k = 0; k < 3; k++) printf("%d\\n", top(k)); return 0; }
`;
  const sim = simulateC(src, { file: 'm.cpp' });
  assert.deepEqual([sim.error, sim.diagnostics], [null, []]);
  assert.equal(sim.output, '323\n328\n338\n');
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'm.cpp', lang });
    assert.deepEqual([r.errors, r.pass, r.gen.diagnostics], [[], true, []]);
  }
});

test('#1964 what is not possible or not supported said', () => {
  assert.deepEqual(errs('struct A { int a; virtual int f() { return a; } };\nstruct B : A { int f() override { return 1; } };\nint g() { B b; return b.f(); }\n'), ["1 error the struct 'A': a virtual function is not possible in hardware (Vitis HLS: no virtual functions)"]);
  assert.equal(errs('struct A { int a; };\nstruct B : virtual public A { int b; };\nint g() { B b; b.b = 1; return b.b; }\n')[0], "2 error the struct 'B': a virtual base class is not possible in hardware (Vitis HLS: no virtual functions)");
  assert.deepEqual(errs('struct B : Nope { int b; };\nint g() { B b; b.b = 1; return b.b; }\n'), ["1 error the struct 'B': its base 'Nope' is not a struct defined before it with data members or methods"]);
  assert.deepEqual(errs('struct P { static int f() { return 1; } };\nstruct B : P { int b; };\nint g() { B b; b.b = 1; return b.b; }\n'), ["2 error the struct 'B': its base 'P' is not a struct defined before it with data members or methods"]);
  assert.deepEqual(errs('struct A { int a; };\nstruct B : A { int b; };\nint g() { return 0; }\n', 'e.c'), ["2 error the struct 'B': a base class is C++ (a .cpp source)"]);
  assert.equal(errs('struct A { int x; };\nstruct C { int x; };\nstruct D : A, C { int y; };\nint g() { D d; d.x = 1; return d.y; }\n')[0], "4 error 'x' is ambiguous: a member of two bases of D");
  assert.deepEqual(errs('struct A { int x; A(int v) : x(v) {} };\nstruct D : A { int y; D() { y = 1; } };\nint g() { D d; return d.y; }\n'), ["2 error 'A': A has no constructor of 0 argument(s)"]);
  assert.deepEqual(errs('struct A { int x; A(int v) : x(v) {} };\nstruct D : A { int y; D() : A(1, 2) { y = 1; } };\nint g() { D d; return d.y; }\n'), ["2 error 'A': A has no constructor of 2 argument(s)"]);
  assert.equal(errs('struct A { int x; };\nstruct D : A { int A; };\nint g() { D d; return 0; }\n')[0], "2 error the member 'A' of 'D': the name of its base class");
  assert.equal(errs('struct A { int x; A(int v) : x(v) {} };\nstruct D : A { using A::A; };\nint g() { D d(1); return d.x; }\n')[0], "2 error the struct 'D': inheriting the constructors (using A::A;) is not supported yet");
  // a static object's constructor: constants only
  assert.deepEqual(errs('struct S { int a; S(int v) : a(v) {} };\nint g(int x) { static S s(x); s.a++; return s.a; }\n'), [`2 error 's': ${RESET}: its argument 'x' must be a constant`]);
  assert.deepEqual(errs('int m = 3;\nstruct S { int a; S() { a = m; } };\nint g() { static S s; s.a++; return s.a; }\n'), [`3 error 's': ${RESET}: it cannot read the variable 'm'`]);
  assert.deepEqual(errs('#include <stdio.h>\nstruct S { int a; S() { a = 1; printf("x"); } };\nint g() { static S s; s.a++; return s.a; }\n'), [`3 error 's': ${RESET}: it cannot call 'printf'`]);
  assert.deepEqual(errs('struct S { int a; S() { a = 0; while (a >= 0) a = 1; } };\nint g() { static S s; s.a++; return s.a; }\n'), [`2 error 's': ${RESET}: the C simulation stopped after 5,000,000 steps (an endless loop?)`]);
  assert.deepEqual(errs('struct S { int a; S(int v) : a(v) {} };\nint g() { static S s; return s.a; }\n'), ["2 error 's': S has no constructor of 0 argument(s)"]);
  assert.deepEqual(errs('struct S { int a; S(int v) : a(v) {} };\nint g() { S s[2]; return s[0].a; }\n'), ["2 error 's': S has no constructor of 0 argument(s)"]);
  assert.deepEqual(errs('struct S { int a; S() { a = 2; } };\nstruct T { S t[2]; T() {} };\nint g() { T x; return x.t[0].a; }\n'), ["2 error the member array 't' of objects whose constructor is not of constants: not supported yet"]);
  assert.equal(errs('struct S { int a; S(int k) { a = k; } };\nint g() { static S s[2][2] = {S(1)}; return s[0][0].a; }\n')[0], "2 error 's': an array of more dimensions of objects initialized with { … } is not supported yet");
  assert.equal(errs('struct S { int a; int v[2]; S(int k) { a = k; v[0] = k; } int f() { return v[0]; } };\nint g(int x) { S s[2] = {S(1), S(2)}; return s[x].f(); }\n')[0], '2 error a member array of an element of an array of structs passed to a function: not supported yet');
});
