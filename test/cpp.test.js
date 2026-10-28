// Silinx HLS (#1590, its first part): core/cpp-lex.js and core/cpp-tree.js. A .cpp source's C++ that Silinx reads:
// namespaces and using, qualified names, constexpr, nullptr, static_cast, static_assert, true / false, the C++
// headers of C's, reference parameters (the ports of pointers, as Vitis HLS makes them), std::cout. Each program
// against the host's C++ compiler (the same output and exit code), co-simulated in VHDL and Verilog; what is not
// supported said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { lex } from '../core/c-lex.js';
import { CXX } from './ap-int-ref.js';
import { lf } from './c-helpers.js';

function compiledCpp(src) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-cpp-'));
  try {
    fs.writeFileSync(path.join(dir, 't.cpp'), src);
    const exe = path.join(dir, process.platform === 'win32' ? 't.exe' : 't');
    execFileSync(CXX, ['-std=c++14', '-w', '-o', exe, path.join(dir, 't.cpp')]);
    try { return { output: lf(execFileSync(exe, { encoding: 'utf8' })), exitCode: 0 }; } catch (e) { return { output: lf(e.stdout), exitCode: e.status }; }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}
const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);

const SCALE = `#include <iostream>
#include <cstdint>
using namespace std;
namespace dsp {
  constexpr int GAIN = 3;
  using sample_t = int16_t;
  static_assert(GAIN > 0, "a gain");
  void clip(int v, int &y, bool &sat) {
    sat = v > 1000 || v < -1000;
    y = sat ? (v > 0 ? 1000 : -1000) : v;
  }
  void scale(sample_t x, int &y, bool &sat) {
    int v = static_cast<int>(x) * GAIN;
    clip(v, y, sat);
  }
}
int main() {
  int y = 0; bool s = false;
  int fails = 0;
  for (int k = -600; k <= 600; k += 150) {
    dsp::scale(k, y, s);
    std::cout << "k=" << k << " y=" << y << " sat=" << s << '\\n';
    if (s != (k * 3 > 1000 || k * 3 < -1000)) fails++;
  }
  cout << "fails " << fails << endl;
  return fails == 0 && nullptr == 0 ? 0 : 1;
}
`;

test('#1590 C++: namespaces, using, constexpr, static_cast, static_assert, nullptr, references (passed on to another function), std::cout: the C simulation as the C++ compiler\'s', { skip: CXX ? false : 'no C++ compiler' }, () => {
  const sim = simulateC(SCALE, { file: 'scale.cpp' });
  assert.equal(sim.error, null);
  assert.deepEqual(sim.diagnostics, []);
  const ref = compiledCpp(SCALE);
  assert.equal(sim.output, ref.output);
  assert.equal(sim.exitCode, ref.exitCode);
  assert.equal(sim.exitCode, 0);
});

test('#1590 C++: a reference parameter has a pointer\'s ports (y, y_ap_vld; one read and written y_i, y_o, y_o_ap_vld); co-simulated in VHDL and Verilog, no warning', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SCALE, { file: 'scale.cpp', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.equal(r.gen.top, 'scale');
    assert.deepEqual(r.gen.diagnostics, []);
    assert.deepEqual(r.gen.ports.map((p) => p.name), ['ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'x', 'y', 'y_ap_vld', 'sat', 'sat_ap_vld']);
  }
  const acc = cToHdl('void acc(int x, int &total) {\n  total += x;\n}\n', { file: 'acc.cpp' });
  assert.deepEqual(acc.ports.map((p) => p.name), ['ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'x', 'total_i', 'total_o', 'total_o_ap_vld']);
});

test('#1590 C++ as tokens: a namespace\'s braces and using gone, qualified names their last part, the casts and constants; what is not supported said', () => {
  const t = (src) => lex(src, 'a.cpp').tokens.filter((x) => x.t !== 'eof').map((x) => x.v).join(' ');
  assert.equal(t('namespace a { namespace b { int f(); } }\nusing namespace std;\nusing word = unsigned short;\nint g() { return a::b::f() + ::h() + static_cast<int>(nullptr) + true; }\n'),
    'int f ( ) ; typedef unsigned short word ; int g ( ) { return f ( ) + h ( ) + ( int ) ( 0 ) + 1 ; }');
  assert.equal(t('constexpr int N = 4;\nstatic_assert(N == 4, "four");\n'), 'const int N = 4 ;');
  const errs = (src) => cToHdl(src, { file: 'e.cpp' }).diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);
  assert.deepEqual(errs('int f(int &&x) { return x; }\n'), ['an rvalue reference (&&) is not supported']);
  assert.deepEqual(errs('int f(int x) { return reinterpret_cast<int>(x); }\n').slice(0, 1), ['reinterpret_cast is not possible in hardware (Vitis HLS: no casts between pointer types)']);
  // (a .c file is C: a reference there is not C)
  assert.ok(cToHdl('int f(int &x) { return x; }\n', { file: 'e.c' }).diagnostics.some((d) => d.severity === 'error'));
});

test('#1602 C: stdbool.h\'s true and false', () => {
  const r = simulateC('#include <stdbool.h>\nbool f(int a) { return a > 2 ? true : false; }\nint main(void) { bool b = true; return f(3) && b && !false ? 0 : 1; }\n', { file: 'b.c' });
  assert.deepEqual([r.diagnostics, r.exitCode], [[], 0]);
});

test('#1603 C: a pointer written then read in the same function: its value the one written (no input), synthesized', () => {
  const r = cosimulate('#include <stdio.h>\nvoid f(int x, int *y, int *s) {\n  *s = x > 3;\n  *y = *s ? 1 : 2;\n}\nint main(void) { int y, s; for (int x = 0; x < 6; x++) { f(x, &y, &s); printf("%d %d\\n", y, s); } return 0; }\n', { file: 'p.c' });
  assert.deepEqual(r.errors, []);
  assert.equal(r.pass, true);
  assert.deepEqual(r.gen.ports.map((p) => p.name), ['ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'x', 'y', 'y_ap_vld', 's', 's_ap_vld']);
});

test('#1605 C: a call of a function declared but not defined: said (it crashed the C synthesis)', () => {
  assert.deepEqual(cToHdl('int g(int x);\nint f(int a) {\n  return g(a) + 1;\n}\n', { file: 'p.c' }).diagnostics.map((d) => `${d.line} ${d.message}`), ["3 'g' is declared but not defined"]);
});
