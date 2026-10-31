// Silinx HLS (#2290): each operation of the generated HDL only as wide as its users read it, so that no bit is computed
// and never read (XST's Xst:646 on C's int arithmetic truncated): every bit of every signal read, counted here from the
// HDL's text as XST counts it, in VHDL and in Verilog; the results still the C's (co-simulated); the graph's pass alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Graph } from '../core/c-graph.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';

// the bits of each internal signal (ap_t<n>) never read: { name: [bits] }
function unread(hdl, lang) {
  const width = new Map(), read = new Map();
  const decl = lang === 'vhdl' ? /^\s*signal (ap_t\d+) : (?:un)?signed\((\d+) downto 0\);/ : /^\s*wire (?:signed )?\[(\d+):0\] (ap_t\d+);/;
  const body = [];
  for (const l of hdl.split('\n')) {
    const m = decl.exec(l);
    if (m) { const [name, hi] = lang === 'vhdl' ? [m[1], m[2]] : [m[2], m[1]]; width.set(name, +hi + 1); read.set(name, new Set()); } else body.push(l);
  }
  // (an assignment's left side is not a read)
  const rhs = body.map((l) => l.replace(lang === 'vhdl' ? /^\s*ap_t\d+ <=/ : /^\s*assign ap_t\d+ =/, ''));
  const use = lang === 'vhdl' ? /(ap_t\d+)(?:\((\d+)(?: downto (\d+))?\))?/g : /(ap_t\d+)(?:\[(\d+)(?::(\d+))?\])?/g;
  for (const l of rhs) {
    for (const m of l.matchAll(use)) {
      if (!read.has(m[1])) continue;
      const hi = m[2] === undefined ? width.get(m[1]) - 1 : +m[2], lo = m[3] === undefined ? (m[2] === undefined ? 0 : +m[2]) : +m[3];
      for (let b = lo; b <= hi; b++) read.get(m[1]).add(b);
    }
  }
  const out = {};
  for (const [n, w] of width) { const miss = [...Array(w).keys()].filter((b) => !read.get(n).has(b)); if (miss.length) out[n] = miss; }
  return out;
}

const SRC = {
  // an integer square root (the example isqrt's, #1966): ap_uint arithmetic promoted to int and truncated, a sequential
  // module, a pointer output
  isqrt: `#include "ap_int.h"
ap_uint<4> isqrt(ap_uint<8> n, ap_uint<5> *remainder) {
  ap_uint<8> left = n;
  ap_uint<6> odd = 1;
  ap_uint<4> root = 0;
  while (left >= odd) {
#pragma HLS LOOP_TRIPCOUNT max=15
    left = left - odd;
    odd = odd + 2;
    root = root + 1;
  }
  *remainder = left;
  return root;
}
int main(void) {
  int errors = 0;
  for (int n = 0; n < 256; n++) {
    ap_uint<5> r;
    int root = isqrt(n, &r);
    int rem = r;
    if (root * root + rem != n || rem > 2 * root) errors++;
  }
  return errors;
}
`,
  // combinational: unsigned char and short arithmetic in int, its result truncated
  mix: `#include "ap_int.h"
unsigned char f(unsigned char a, unsigned char b, short c) {
  unsigned char s = a + b;
  unsigned char d = (a ^ b) - (c << 2);
  ap_uint<5> e = ~a + (b & 7);
  return (s | d) + e + (c < 0 ? a : b);
}
int main() {
  int e = 0;
  for (int i = 0; i < 40; i++) { unsigned char r = f(i * 7, 200 - i, i * 37 - 500); e += r > 255; }
  return e;
}
`,
};

for (const [name, src] of Object.entries(SRC)) {
  for (const lang of ['vhdl', 'verilog']) {
    test(`#2290 ${name} in ${lang}: every bit of every signal read (no Xst:646), the results the C's, no warnings`, () => {
      const r = cToHdl(src, { file: `${name}.c`, lang });
      assert.deepEqual(r.diagnostics, []);
      assert.deepEqual(unread(r.hdl, lang), {});
      const c = cosimulate(src, { file: `${name}.c`, lang });
      assert.equal(c.ok, true);
      assert.equal(c.pass, true);
      assert.deepEqual(c.mismatches, []);
      assert.deepEqual(c.errors, []);
    });
  }
}

test('#2290 the count of bits read: a signal\'s bits never read found, as XST\'s Xst:646 (the check above can fail)', () => {
  const v = 'architecture a of x is\n  signal ap_t1 : signed(32 downto 0);\n  signal ap_t2 : unsigned(5 downto 0);\nbegin\n  ap_t1 <= ap_t0 + ap_t0;\n  ap_t2 <= unsigned(ap_t1(5 downto 0));\n  y <= std_logic_vector(ap_t2);\nend;';
  assert.deepEqual(unread(v, 'vhdl'), { ap_t1: [...Array(27).keys()].map((b) => b + 6) });
  const w = '  wire signed [32:0] ap_t1;\n  wire [5:0] ap_t2;\n  assign ap_t1 = ap_t0 + ap_t0;\n  assign ap_t2 = ap_t1[5:0];\n  assign y = ap_t2;';
  assert.deepEqual(unread(w, 'verilog'), { ap_t1: [...Array(27).keys()].map((b) => b + 6) });
});

test('#2290 the graph\'s pass: an addition truncated made that wide, its operands\' low bits taken; roots and comparisons kept whole', () => {
  const g = new Graph();
  const a = g.add('in', [], { w: 8, s: false }, { port: { key: 'a', name: 'a' } });
  const b = g.add('in', [], { w: 6, s: false }, { port: { key: 'b', name: 'b' } });
  const a33 = g.add('ext', [a], { w: 33, s: true }), b33 = g.add('ext', [b], { w: 33, s: true });
  const two = g.const(2, { w: 33, s: true });
  const sum = g.add('add', [a33, b33], { w: 33, s: true });
  const plus2 = g.add('add', [b33, two], { w: 33, s: true });
  const lt = g.add('lt', [a33, plus2], { w: 1, s: false });
  const out = g.add('ext', [sum], { w: 6, s: false });
  const keep = g.add('ext', [plus2], { w: 7, s: false });
  g.narrow([out, lt, keep]);
  assert.equal(g.get(sum).w, 6);
  assert.deepEqual(g.get(sum).args.map((id) => [g.get(id).op, g.get(id).w]), [['ext', 6], ['ext', 6]]);
  // (plus2 read whole by the comparison: kept; the constant still 33 bits for it)
  assert.equal(g.get(plus2).w, 33);
  assert.equal(g.get(two).w, 33);
  assert.equal(g.get(lt).w, 1);
  assert.deepEqual([g.get(out).w, g.get(keep).w], [6, 7]);
  // (a constant narrowed for one user only: a new one, the shared one left as it was)
  const g2 = new Graph();
  const x = g2.add('in', [], { w: 33, s: true }, { port: { key: 'x', name: 'x' } });
  const k = g2.const(-3, { w: 33, s: true });
  const s2 = g2.add('add', [x, k], { w: 33, s: true });
  const t = g2.add('ext', [s2], { w: 4, s: false });
  const eq = g2.add('eq', [x, k], { w: 1, s: false });
  g2.narrow([t, eq]);
  const [xa, ka] = g2.get(s2).args.map((id) => g2.get(id));
  assert.deepEqual([g2.get(s2).w, xa.op, xa.w, ka.op, ka.w, ka.k], [4, 'ext', 4, 'const', 4, -3n]);
  assert.equal(g2.get(k).w, 33);
});
