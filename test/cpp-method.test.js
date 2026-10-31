// Silinx HLS C++ (#1590): core/cpp-method.js. A struct's (a class's, a class template's) member functions, constructors
// (their initializer lists; a default one of constants its members' initial values), operator(), methods defined
// outside their class, as functions of the struct taking it by reference. Against the host's C++ with AMD's ap_int.h,
// co-simulated in VHDL and Verilog with no warning; what is not supported said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { lex } from '../core/c-lex.js';
import { apIntHeaders, runWithApInt } from './ap-int-ref.js';

const AP = await apIntHeaders();
const toks = (src) => lex(src, 'a.cpp').tokens.filter((x) => x.t !== 'eof').map((x) => x.v).join(' ');
const errs = (src, file = 'e.cpp') => cToHdl(src, { file }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);

const METHODS = `#include <iostream>
#include "ap_int.h"
using namespace std;
template <typename T, int N> class Delay {
  T taps[N];
public:
  Delay() { taps[0] = 0; taps[1] = 0; taps[2] = 0; }
  T operator()(T x) { T o = taps[N - 1]; taps[2] = taps[1]; taps[1] = taps[0]; taps[0] = x; return o; }
  T last() const { return taps[0]; }
};
struct Acc {
  int sum;
  ap_uint<4> n;
  Acc() : sum(0), n(0) {}
  void add(int v) { sum += v; n++; bump(); }
  void bump() { if (n == 15) n = 0; }
  int mean() const;
};
int Acc::mean() const { return n ? sum / 4 : 0; }
int top(ap_int<12> x, int &m) {
  static Acc acc;
  Delay<ap_int<12>, 3> d;
  int y = d(x);
  y += d(x + 1);
  y += d.last();
  acc.add(y);
  m = acc.mean();
  return y;
}
int main() {
  int m;
  for (int i = 0; i < 6; i++) { int y = top(i * 3, m); cout << y << " " << m << endl; }
  return 0;
}
`;

test('#1590 C++ methods as tokens: a function of the struct taking it by reference (its members ap_this\'s, the other methods called with it), a constructor\'s initializer list first, a default constructor of constants the members\' initial values', () => {
  assert.equal(toks('struct C {\n  int n;\n  C() : n(2) {}\n  void inc() { n++; }\n  int twice() const { inc(); return n * 2; }\n};\nint f() { C c; c.inc(); return c.twice(); }\n'),
    'void C_inc ( int & ap_this_n ) { ap_this_n ++ ; } int C_twice ( const int & ap_this_n ) { C_inc ( ap_this_n ) ; return ap_this_n * 2 ; } int f ( ) { int c_n = 2 ; C_inc ( c_n ) ; return C_twice ( c_n ) ; }');
  assert.equal(toks('struct P {\n  int a, b;\n  P(int x, int y);\n};\nP::P(int x, int y) : a(x) { b = y + a; }\nint f(int v) { P p(v, 1); return p.b; }\n'),
    'void P_ctor0 ( int x , int y , int & ap_this_a , int & ap_this_b ) { ap_this_a = ( x ) ; ap_this_b = y + ap_this_a ; } int f ( int v ) { int p_a ; int p_b ; P_ctor0 ( v , 1 , p_a , p_b ) ; return p_b ; }');
});

test('#1590 C++ methods, constructors, operator(), a class template with data members, a static object: the C simulation as the C++ compiler with AMD\'s ap_int.h', { skip: AP.why || false }, () => {
  const sim = simulateC(METHODS, { file: 'm.cpp' });
  assert.deepEqual([sim.error, sim.diagnostics, sim.exitCode], [null, [], 0]);
  assert.equal(sim.output, runWithApInt(METHODS, AP.dir));
});

test('#1590 C++ methods: co-simulated in VHDL and Verilog, no warning (the object a variable per member, the top\'s ports its arguments\')', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(METHODS, { file: 'm.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics, []);
    assert.deepEqual(r.gen.ports.map((p) => p.name), ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'x', 'm', 'm_ap_vld', 'ap_return']);
  }
});

test('#1590 C++ methods: what is not supported said', () => {
  assert.deepEqual(errs('struct S { int a; virtual int f() { return a; } };\nint g() { return 0; }\n'), ["1 the struct 'S': a virtual function is not possible in hardware (Vitis HLS: no virtual functions)"]);
  assert.deepEqual(errs('struct S { int a; S operator+(S o) { return o; } };\nint g() { return 0; }\n'), ["1 the struct 'S': only operator() is supported among its operators"]);
  assert.deepEqual(errs('struct S { int a; static int f() { return 1; } };\nint g() { return 0; }\n'), ["1 the struct 'S': a static member function is supported in a class of static members only"]);
  assert.deepEqual(errs('struct S { int a; int f(); };\nint g() { S s; s.a = 1; return s.f(); }\n'), ["1 'f' of 'S' is declared but not defined"]);
  assert.deepEqual(errs('struct S { int a; S(int v) : a(v) {} };\nint g() { S s(1, 2); return s.a; }\n'), ["2 's': S has no constructor of 2 argument(s)"]);
  assert.deepEqual(errs('struct S { int a; S(int v) : a(v) {} };\nint g(int x) { static S s(x); return s.a; }\n'), ["2 's': a static object's constructor runs at synthesis, its state set at the reset: its argument 'x' must be a constant"]);
  assert.deepEqual(errs('struct S { int a; int f() { return a; } };\nint g(void) { return 0; }\n', 'e.c'), ["1 the struct 'S': a member function is C++ (a .cpp source)"]);
});
