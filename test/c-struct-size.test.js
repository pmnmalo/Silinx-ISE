// Silinx HLS C++ (#2309, core/c-struct-size.js): sizeof of a struct and of an array of structs, g++'s (the sizes below
// printed by g++ 15 on x86-64 for the same structs); S a[] = { … } of the list's size; a struct of const char * members,
// a test bench's texts (printf's %s, cout, a function's const char * parameter, fopen); a test bench's f >> x of a float.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { structBytes } from '../core/c-struct-size.js';

const TOP = 'int top(int a) { return a + 1; }\n';
const said = (r) => r.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const run = (src, files) => simulateC(`${TOP}${src}`, { file: 't.cpp', top: 'top', files });

test('#2309 sizeof of structs and of an array of structs: g++\'s', () => {
  const r = run(`#include <stdio.h>
#include <stdint.h>
struct A { int a; char b; };
struct B { char a; double b; char c; };
struct T { const char *name; const char *in; const char *out; };
struct C { char a[3]; short b; };
struct D { A s; char c; };
struct E { uint8_t a; int64_t b[2]; float c; };
A as[] = { {1, 2}, {3, 4}, {5, 6} };
int main() { printf("%d %d %d %d %d %d %d\\n", (int)sizeof(A), (int)sizeof(B), (int)sizeof(T), (int)sizeof(C), (int)sizeof(D), (int)sizeof(E), (int)(sizeof(as) / sizeof(A))); return 0; }
`);
  assert.deepEqual([said(r), r.exitCode, r.output], [[], 0, '8 24 24 6 12 32 3\n']);
  // (a member of a type whose size is not known here: null, sizeof left as it was)
  assert.equal(structBytes({ members: [{ name: 'x', type: [{ t: 'id', v: 'ap_fixed' }], dims: [] }] }), null);
});

test('#2309 an array of structs of the list\'s size, its elements braced or not', () => {
  const r = run(`#include <stdio.h>
struct S { int a; int b; };
S v[] = { {1, 2}, {3, 4} };
S w[] = { 5, 6, 7, 8, 9 };
int main() { printf("%d %d %d %d\\n", v[1].b, (int)(sizeof(v) / sizeof(S)), w[2].a, (int)(sizeof(w) / sizeof(S))); return 0; }
`);
  assert.deepEqual([said(r), r.output], [[], '4 2 9 3\n']);
});

test('#2309 a struct of const char * members: its texts printed, passed, opened; a const char * variable; f >> x of floats; no warning', () => {
  const r = run(`#include <iostream>
#include <fstream>
#include <stdio.h>
using namespace std;
struct TestCase { const char *name; const char *file; int n; };
TestCase cases[] = { {"Ramp", "data/a.dat", 2}, {"Sine", "data/b.dat", 1} };
const char *names[2] = { "x", "yz" };
float sum(const char *file, int n) {
  ifstream f(file);
  if (!f.is_open()) { cerr << "cannot open " << file << endl; return -1; }
  float s = 0, a, b;
  for (int i = 0; i < n; i++) { if (!(f >> a >> b)) return -2; s += a * b; }
  f >> a;
  f.close();
  return s + a;
}
int main() {
  for (int t = 0; t < 2; t++) {
    const char *p = cases[t].name;
    printf("%s %s ", p, names[t]);
    cout << cases[t].file << " " << sum(cases[t].file, cases[t].n) << endl;
  }
  return 0;
}
`, { 'data/a.dat': '1.5 2\n0.25 4\n3.5\n', 'data/b.dat': '-1e1 0.5\n2\n' });
  assert.deepEqual([said(r), r.error, r.output], [[], null, 'Ramp x data/a.dat 7.5\nSine yz data/b.dat -3\n']);
});

test('#2309 the hardware: a test bench\'s struct of const char * is no port; such a member in the top refused, VHDL and Verilog', () => {
  const tb = 'struct T { const char *name; int k; };\nT cases[] = { {"a", 1} };\nint top(int a) { return a + 1; }\nint main() { return cases[0].k - 1; }\n';
  for (const lang of ['vhdl', 'verilog']) {
    const g = cToHdl(tb, { file: 't.cpp', top: 'top', lang });
    assert.deepEqual([g.ok, said(g)], [true, []], lang);
    const hw = cToHdl('struct T { const char *name; int k; };\nint top(T t) { return t.k; }\n', { file: 't.cpp', top: 'top', lang });
    assert.deepEqual([hw.ok, said(hw)], [false, ["2 error: the parameter 't': its struct's member 'name' is a const char * (a test bench's variable of the struct only, not a parameter)"]], lang);
  }
});
