// Silinx HLS (#1599, core/c-pointer.js): pointer arithmetic as Vitis HLS takes it. *(p + e) is p[e]; a pointer argument
// indexed a memory (ap_memory, its depth the INTERFACE pragma's or 1024, said); a local pointer its target (one of
// several: a multiplexer of their elements) and an offset (&a[k], p += n, p++). The C simulation as cc's, the
// co-simulation in VHDL and Verilog with their exact warnings; what is not supported, said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cosimulate } from '../core/c-cosim.js';
import { cToHdl } from '../core/c-hdl.js';
import { hdlName } from '../core/c-graph.js';
import { noCC, compiledRun } from './c-helpers.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const SRC = `#include <stdio.h>
static int ta[8] = {1, 2, 3, 4, 5, 6, 7, 8};
static int tb[8] = {80, 70, 60, 50, 40, 30, 20, 10};

int ptrs(int *d, int *s, int sel, int k) {
#pragma HLS INTERFACE ap_memory port=d depth=6
  static int acc = 0;
  for (int i = 0; i < 4; i++) {
    acc += *(d + i + 1);
    *(d + i) = acc - *s;
  }
  int *t;
  if (sel) t = ta; else t = tb;
  int r = t[k & 7] + *(t + 1);
  int buf[6] = {0, 0, 0, 0, 0, 0};
  int *w = &buf[1];
  for (int i = 0; i < 4; i++) { *w = i * k; w += 1; }
  w = buf;
  w++;
  int _tot = 0;
  int *pt = &_tot;
  for (int i = 0; i < 6; i++) *pt += buf[i];
  return r + *w + *(w + 2) + _tot + *(s + 1);
}

int main(void) {
  int d[6] = {5, -3, 9, 2, 7, 1}, s[2] = {4, 6};
  int sum = 0;
  for (int c = 0; c < 3; c++) {
    sum += ptrs(d, s, c & 1, c * 3 + 1);
    for (int i = 0; i < 6; i++) printf("%d ", d[i]);
    printf("| %d\\n", sum);
  }
  return 0;
}
`;

test('#1599 pointer arithmetic and pointer variables in the C simulation: as cc\'s', { skip: noCC }, () => {
  const sim = simulateC(SRC, { file: 'ptrs.c' });
  assert.deepEqual([sim.error, sim.exitCode], [null, 0]);
  const ref = compiledRun(SRC);
  assert.equal(sim.output, ref.output);
});

test('#1599 co-simulated in VHDL and Verilog: the indexed pointer arguments memories (d of the pragma\'s depth, s of 1024, said); the local pointers registers', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cosimulate(SRC, { file: 'ptrs.c', lang });
    assert.deepEqual(r.errors, []);
    assert.equal(r.pass, true, JSON.stringify(r.mismatches, big));
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), [
      "5 warning: the pointer argument 's' is indexed: a memory (ap_memory) of 1024 elements, its depth not given (#pragma HLS INTERFACE port=s depth=N)",
      '8 warning: this loop is pipelined automatically, as Vitis HLS does (II=1): II=2 made (the memory \'d\' has one port, accessed 2 times an iteration); #pragma HLS PIPELINE off in it turns that off']);
    assert.deepEqual(r.gen.ports.filter((p) => /^[ds]_/.test(p.name)).map((p) => `${p.name}:${p.w}`), [
      'd_address0:3', 'd_ce0:1', 'd_we0:1', 'd_d0:32', 'd_q0:32', 's_address0:10', 's_ce0:1', 's_q0:32']);
  }
});

test('#1599 a C name as part of an HDL name: no \'__\', no \'_\' at its ends', () => {
  assert.deepEqual(['x', '_tot', 'a__b', 'end_', 'a___b'].map(hdlName), ['x', 'u0_tot', 'a_u0_b', 'end_u0', 'a_u0_u0_b']);
});

test('#1599 what is not supported, said once', () => {
  const errs = (src) => cToHdl(src, { file: 'e.c' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
  assert.deepEqual(errs('int a[4], b[4];\nint f(int s, int v) {\n  int *p;\n  if (s) p = a; else p = b;\n  p[1] = v;\n  return p[0];\n}\n'), ["5 the pointer 'p' (to one of a, b): written through it: not supported yet (only read)"]);
  assert.deepEqual(errs('int g(int *q) { return *q; }\nint f(int a[4]) {\n  int *p = a;\n  p++;\n  return g(p);\n}\n'), ["5 the pointer 'p': passed on to a function after it moves: not supported yet"]);   // (not moved: its target passed, #1895)
  assert.deepEqual(errs('int f(int a[4]) {\n  int *p = a;\n  return p == a;\n}\n'), ["3 the pointer 'p': used other than *p, p[i], p = …, p += …, p++ (passed on, compared): not supported yet"]);
  assert.deepEqual(errs('int f(short a[4]) {\n  int *p = (int *)a;\n  return *p;\n}\n'), ["2 the pointer 'p': set to 'a', of another type (a cast of a pointer): not supported (Vitis HLS: a cast of a pointer between native integer types, to a narrower one)"]);
  assert.deepEqual(errs('int f(int v) {\n  int x = v;\n  int *p = &x;\n  return p[1];\n}\n'), ["4 the pointer 'p' to a variable: only *p (p[0])"]);
  assert.deepEqual(errs('int f(int v) {\n  int *p;\n  return v;\n}\n'), ["2 the pointer 'p' is never set"]);
});
