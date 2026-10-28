// Silinx HLS C++ (#1590): core/cpp-template.js and core/cpp-sugar.js. Function and class templates (integer and type
// parameters, their defaults, explicit specializations, a type deduced from the call), classes of static members,
// pragmas of a template's parameters (#pragma HLS if), macros in pragmas, auto, the range for, <iomanip>'s
// manipulators. Each program against the host's C++ compiler with AMD's ap_int.h (the same output), co-simulated in
// VHDL and Verilog; what is not supported said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { lex } from '../core/c-lex.js';
import { constTokens } from '../core/cpp-template.js';
import { apIntHeaders, runWithApInt } from './ap-int-ref.js';

const AP = await apIntHeaders();
const toks = (src) => lex(src, 'a.cpp').tokens.filter((x) => x.t !== 'eof').map((x) => (x.t === 'pragma' ? `#pragma ${x.v.text}` : x.v)).join(' ');
const errs = (src) => cToHdl(src, { file: 'e.cpp' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);

const TEMPLATES = `#include <iostream>
#include "ap_int.h"
using namespace std;
typedef int data_t;
template <data_t N> struct fibon_s {
  template <typename T> static T fibon_f(T a, T b) { return fibon_s<N - 1>::fibon_f(b, (a + b)); }
};
template <> struct fibon_s<1> {
  template <typename T> static T fibon_f(T a, T b) { return b; }
};
template <typename T, int SHIFT = 1> T mx(T a, T b) { return (a > b ? a : b) << SHIFT; }
template <int W> ap_uint<W> sat(ap_uint<W + 1> v) { return v > ((1 << W) - 1) ? ap_uint<W>((1 << W) - 1) : ap_uint<W>(v); }
struct Gain { static const int K = 3; static int apply(int x) { return x * K + Gain::K; } };
void top(data_t a, data_t b, ap_uint<4> c, data_t &f, data_t &m, ap_uint<3> &s) {
  f = fibon_s<5>::fibon_f(a, b) + Gain::apply(a);
  m = mx(a, b) + mx<data_t, 2>(b, 1);
  s = sat<3>(c);
}
int main() {
  for (int a = -3; a < 4; a++) for (int b = 0; b < 3; b++) {
    data_t f, m; ap_uint<3> s;
    top(a, b, a + 8, f, m, s);
    cout << a << " " << b << " " << f << " " << m << " " << s << endl;
  }
  return 0;
}
`;

const SUGAR = `#include <iostream>
#include <iomanip>
#include "ap_int.h"
using namespace std;
ap_uint<6> twice(ap_uint<5> v) { return v * 2; }
void top(ap_uint<5> in[8], int &sum, ap_uint<6> &last) {
  ap_uint<5> buf[8];
  for (int i = 0; i < 8; i++) buf[i] = in[i];
  int acc = 0;
  for (auto x : buf) acc += x;
  for (auto &x : buf) x = x + 1;
  for (const auto &x : buf) { acc += x; }
  auto t = twice(buf[7]);
  auto k = 3;
  sum = acc * k;
  last = t;
}
int main() {
  ap_uint<5> d[8];
  for (int i = 0; i < 8; i++) d[i] = i * 3 + 1;
  int s; ap_uint<6> l;
  top(d, s, l);
  int b[4] = {1, 2, 3, 4};
  for (int &v : b) v = v * 2;
  for (const int &v : b) cout << setw(4) << v << left << setw(3) << v << right;
  bool pass = s == 576;
  cout << endl << hex << s << dec << " " << setfill('0') << setw(5) << l << " " << (pass ? "PASS" : "FAIL") << endl;
  return pass ? 0 : 1;
}
`;

test('#1590 C++ templates as tokens: an instance per list of arguments (its name theirs), defaults, an explicit specialization, a type deduced from the call, a class of static members; the instances where the template is defined', () => {
  assert.equal(toks('template <typename T, int N = 2> T sh(T a) { return a << N; }\nint f(short x) { return sh(x) + sh<int, 3>(1) + sh<int, 1 + 2>(2); }\n'),
    'short sh_short_2 ( short a ) { return a << 2 ; } int sh_int_3 ( int a ) { return a << 3 ; } int f ( short x ) { return sh_short_2 ( x ) + sh_int_3 ( 1 ) + sh_int_3 ( 2 ) ; }');
  assert.equal(toks('template <int N> struct P { static int v() { return N * P<N - 1>::v(); } };\ntemplate <> struct P<0> { static int v() { return 1; } };\nint f() { return P<2>::v(); }\n'),
    'int P_0_v ( ) { return 1 ; } int P_1_v ( ) { return 1 * P_0_v ( ) ; } int P_2_v ( ) { return 2 * P_1_v ( ) ; } int f ( ) { return P_2_v ( ) ; }');
  assert.equal(toks('struct S { static const int K = 3; typedef short word; static int f(int x) { return x * K; } };\nint g(int y) { return S::f(y) + S::K; }\n'),
    'const int S_K = 3 ; typedef short S_word ; int S_f ( int x ) { return x * S_K ; } int g ( int y ) { return S_f ( y ) + S_K ; }');
  // (a name made is none of the source's)
  assert.equal(toks('int sh_1;\ntemplate <int N> int sh() { return N; }\nint f() { return sh<1>() + sh_1; }\n'), 'int sh_1 ; int sh_1_t ( ) { return 1 ; } int f ( ) { return sh_1_t ( ) + sh_1 ; }');
  assert.equal(constTokens(lex('(3 + 4) * 2 == 14 ? 1 << 4 : -1', 'a.cpp').tokens.slice(0, -1)), 16n);
  assert.equal(constTokens(lex('N + 1', 'a.cpp').tokens.slice(0, -1)), null);
});

test('#1590 C++ templates: a pragma\'s value a template\'s parameter, #pragma HLS if (cond) kept when cond holds; a macro in a pragma expanded (C too)', () => {
  const src = `template <int PIPE, int F>
void add(int a[10], int z[10]) {
  for (int i = 0; i < 10; i++) {
#pragma HLS UNROLL factor=F
#pragma HLS if (PIPE == 0) PIPELINE off
#pragma HLS if (PIPE != 0) PIPELINE II=PIPE
    z[i] = a[i] + 1;
  }
}
void top(int a[10], int z[10]) { add<2, 4>(a, z); }
`;
  assert.match(toks(src), /void add_2_4 \( .* #pragma HLS UNROLL factor=4 #pragma HLS PIPELINE II=2 z/);
  assert.doesNotMatch(toks(src), /PIPELINE off/);
  // (C: the macro expanded; C++: the condition decided)
  assert.deepEqual(lex('#define F 4\nvoid f(int a[8]) {\n  for (int i = 0; i < 8; i++) {\n#pragma HLS UNROLL factor=F\n    a[i] = 0;\n  }\n}\n', 'm.c').tokens.filter((x) => x.t === 'pragma').map((x) => x.v.args), [{ factor: '4' }]);
  assert.deepEqual(lex('#define OPT 3\nvoid f(int a[8]) {\n  for (int i = 0; i < 8; i++) {\n#pragma HLS if (OPT == 3) UNROLL factor=2\n#pragma HLS if (OPT == 1) PIPELINE\n    a[i] = 0;\n  }\n}\n', 'm.cpp').tokens.filter((x) => x.t === 'pragma').map((x) => [x.v.name, x.v.args]), [['UNROLL', { factor: '2' }]]);
});

test('#1590 C++ templates and classes of static members: the C simulation as the C++ compiler with AMD\'s ap_int.h', { skip: AP.why || false }, () => {
  const sim = simulateC(TEMPLATES, { file: 'tpl.cpp' });
  assert.equal(sim.error, null);
  assert.deepEqual(sim.diagnostics, []);
  assert.equal(sim.exitCode, 0);
  assert.equal(sim.output, runWithApInt(TEMPLATES, AP.dir));
});

test('#1590 C++ templates: co-simulated in VHDL and Verilog, no warning', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(TEMPLATES, { file: 'tpl.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics, []);
    assert.deepEqual(r.gen.ports.map((p) => p.name), ['ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'a', 'b', 'c', 'f', 'f_ap_vld', 'm', 'm_ap_vld', 's', 's_ap_vld']);
  }
});

test('#1590 C++ auto, the range for (by value, by reference, const), <iomanip>\'s setw, left / right, setfill, hex / dec, a string chosen by ?: in cout: the C simulation as the C++ compiler with AMD\'s ap_int.h', { skip: AP.why || false }, () => {
  const sim = simulateC(SUGAR, { file: 'sugar.cpp' });
  assert.equal(sim.error, null);
  assert.deepEqual(sim.diagnostics, []);
  assert.equal(sim.exitCode, 0);
  assert.equal(sim.output, runWithApInt(SUGAR, AP.dir));
});

test('#1590 C++ auto and the range for: co-simulated in VHDL and Verilog (the warning of the argument named in, no other)', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SUGAR, { file: 'sugar.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), ["6 warning: 'in' is a reserved word of VHDL or Verilog: it is named in_r in the module"]);
  }
});

test('#1590 C++ templates, auto and the range for: what is not supported said', () => {
  assert.deepEqual(errs('template <int N> int f() { return N; }\nint g() { return f(); }\n'), ["2 the template 'f': its parameter 'N' is not given (write f<…>)"]);
  assert.deepEqual(errs('template <int N> int f() { return N; }\nint g(int x) { return f<x>(); }\n'), ["2 the template 'f': its parameter 'N' is not a constant (x)"]);
  assert.deepEqual(errs('template <int N> int f();\nint g() { return f<2>(); }\n'), ["2 'f_2' is declared but not defined"]);
  assert.deepEqual(errs('template <int N> struct R { static int v() { return R<N + 1>::v(); } };\nint g() { return R<0>::v(); }\n').slice(0, 1), ['1 templates instantiated too deep (a template using itself with no end?)']);
  assert.deepEqual(errs('template <> struct Q<1> { static int v() { return 1; } };\nint g() { return 0; }\n'), ["1 a specialization of 'Q', which is not a template"]);
  assert.deepEqual(errs('template <int N> struct C { int x; static int v() { return N; } };\nint g() { return C<1>::v(); }\n').slice(0, 1), ["1 the struct 'C_1': a static member function is supported in a class of static members only"]);
  assert.deepEqual(errs('int g(int a[4]) {\n  int s = 0;\n  for (int x : a) s += x;\n  return s;\n}\n'), ["3 the range for: 'a' is a parameter, a pointer in C++ (index it: for (int i = 0; i < N; i++))"]);
  assert.deepEqual(errs('int g() {\n  int b[4] = {0};\n  for (int x : b) if (x) return x;\n  return 0;\n}\n'), ["3 the range for's body: write it in braces { … }"]);
  assert.deepEqual(errs('int g() {\n  auto y = q;\n  return 0;\n}\n').slice(0, 1), ["2 'auto y': its type is not known from its value (write the type)"]);
  assert.deepEqual(errs('auto g() {\n  return 0;\n}\n').slice(0, 1), ["1 'auto' only for a variable given a value (auto x = e;) or in a range for"]);
  assert.deepEqual(errs('#include <iostream>\nint g(int n) {\n  std::cout << std::setw(n) << n;\n  return n;\n}\n').slice(0, 1), ['3 setw takes a constant']);
  assert.deepEqual(errs('template <int P> void f(int a[4]) {\n  for (int i = 0; i < 4; i++) {\n#pragma HLS if (P == Q) PIPELINE\n    a[i] = 0;\n  }\n}\nvoid g(int a[4]) { f<1>(a); }\n').slice(0, 1), ['3 #pragma HLS if (1 == Q): its condition is not a constant']);
});

test('#1590 New Source ▸ C++ Function (HLS): its template simulated (its test bench\'s output) and co-simulated in VHDL and Verilog, no warning', async () => {
  const { cppTemplate } = await import('../web/js/c-templates.js');
  const src = cppTemplate('adder4');
  const sim = simulateC(src, { file: 'adder4.cpp' });
  assert.deepEqual([sim.error, sim.diagnostics, sim.output, sim.exitCode], [null, [], '9 + 8 = 17 (carry 1)\n', 0]);
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(src, { file: 'adder4.cpp', lang });
    assert.deepEqual([r.errors, r.pass, r.gen.diagnostics], [[], true, []]);
  }
});

test('#1805 the address of a reference parameter (&r: the pointer it is), passed on to a pointer parameter: the C simulation (C++ gives 17); synthesized', () => {
  const src = '#include <stdio.h>\nstatic void put(int *p, int v) { *p = v * 3; }\nvoid top(int a, int &out) {\n  put(&out, a + 1);\n  out = out + 2;\n}\nint main() { int r = 0; top(4, r); printf("%d\\n", r); return 0; }\n';
  const sim = simulateC(src, { file: 'r.cpp' });
  assert.deepEqual([sim.error, sim.exitCode, sim.output], [null, 0, '17\n']);
  const r = cosimulate(src, { file: 'r.cpp', lang: 'verilog' });
  assert.deepEqual([r.errors, r.pass], [[], true]);
});
