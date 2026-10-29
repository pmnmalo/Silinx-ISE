// Silinx HLS C++ (#1734, core/cpp-stl.js): what AMD's test benches use of the C++ library, in the C simulation:
// std::vector<T> v(n) / v(n, x) (v[i], v.data() to the top, v.size(), vector<T> & parameters), std::generate and
// std::fill over a vector, arrays of a size known when they run; <random>'s default_random_engine and
// uniform_int_distribution as libstdc++ makes them (Vitis HLS's Linux C simulation). The output as the C++ compiler's
// (a generator of its own); the engine's values the C++ standard's; the synthesized code still of fixed sizes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { CXX } from './ap-int-ref.js';
import { lf } from './c-helpers.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const VADD = `#include <vector>
#include <algorithm>
#include <iostream>
using std::vector;
void vadd(int *a, int n, int inc) {
#pragma HLS TOP name=vadd
#pragma HLS INTERFACE ap_memory port=a depth=16
  for (int i = 0; i < n; i++) {
#pragma HLS LOOP_TRIPCOUNT max=16
    a[i] += inc;
  }
}
int counter() { static int c = 0; c = (c * 7 + 3) % 23; return c; }
int check(vector<int> &x, const vector<int> &y) { for (int i = 0; i < (int)x.size(); i++) if (x[i] != y[i]) return 1; return 0; }
int main() {
  int size = 12;
  std::vector<int> v(size), w(size);
  std::vector<int> z(size, 7);
  std::generate(begin(v), end(v), counter);
  for (int i = 0; i < size; i++) w[i] = v[i] + 3;
  vadd(v.data(), size, 3);
  int sq[size * 2];
  for (int i = 0; i < size * 2; i++) sq[i] = i * i;
  std::fill(z.begin(), z.end() , 5);
  for (int i = 0; i < size; i++) std::cout << v[i] << " ";
  std::cout << z[3] << " " << z[11] << " " << v.size() << " " << sq[23] << std::endl;
  return check(v, w) ? EXIT_FAILURE : EXIT_SUCCESS;
}
`;

test('#1734 std::vector, generate, fill, an array of a size known when it runs: the C simulation as the C++ compiler', { skip: CXX ? false : 'no C++ compiler' }, () => {
  const sim = simulateC(VADD, { file: 'vadd.cpp' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-stl-'));
  try {
    fs.writeFileSync(path.join(dir, 't.cpp'), VADD.replace(/^#pragma.*$/gm, ''));
    execFileSync(CXX, ['-std=c++11', '-w', '-o', path.join(dir, 't'), path.join(dir, 't.cpp')]);
    assert.equal(sim.output, lf(execFileSync(path.join(dir, 't'), { encoding: 'utf8' })));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('#1734 a vector\'s data passed to the top: co-simulated in VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(VADD, { file: 'vadd.cpp', lang });
    assert.deepEqual([r.errors, r.pass, r.calls], [[], true, 1], JSON.stringify(r.mismatches, big));
    // (the loop pipelined automatically, #1919: a and b read one after the other)
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), [
      '8 warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=2 made (it accesses a memory, an access a state); #pragma HLS PIPELINE off in it turns that off']);
  }
});

test('#1734 <random> as libstdc++: default_random_engine is minstd_rand0 (its 10000th value 1043618065, as the C++ standard requires), uniform_int_distribution its scaled draws', () => {
  const src = (lo, hi, n) => `#include <random>\n#include <stdio.h>\nint f(int x) { return x; }\nint main() {\n  std::default_random_engine e;\n  std::uniform_int_distribution<int> d(${lo}, ${hi});\n  int v = 0;\n  for (int i = 0; i < ${n}; i++) { v = d(e); if (${n} < 20) printf("%d ", v); }\n  printf("%d\\n", f(v));\n  return 0;\n}\n`;
  // (a range of the engine's whole: its values less 1)
  assert.equal(simulateC(src(0, 2147483645, 10000), { file: 'r.cpp' }).output, '1043618064\n');
  // (0..10: 16807, 282475249, 1622650073, … less 1, divided by (2^31 - 3) / 11)
  assert.equal(simulateC(src(0, 10, 8), { file: 'r.cpp' }).output, '0 1 8 5 5 2 0 7 7\n');
});

test('#1734 the synthesized code: an array still of a fixed size; a vector with no size, said', () => {
  const errs = (src) => cToHdl(src, { file: 'e.cpp' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(errs('int f(int n) {\n  int a[n];\n  a[0] = n;\n  return a[0];\n}\n'), ['2 the size of an array must be a constant (Silinx HLS: fixed sizes)']);
  assert.deepEqual(simulateC('#include <vector>\nint f(int x) { return x; }\nint main() {\n  std::vector<int> v;\n  return f(0);\n}\n', { file: 'e.cpp' }).diagnostics.map((d) => `${d.line} ${d.message}`),
    ["4 std::vector 'v' with no size: not supported (declare it with its size, std::vector<T> v(n);)"]);
});
