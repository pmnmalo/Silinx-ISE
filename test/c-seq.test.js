// Silinx HLS, sequential C to HDL (#1526): core/c-fsmd.js and core/c-hdl-seq.js. The reference is the C compiled with
// the host's cc (test/c-helpers.js), called on edge and random inputs in sequence (its statics kept between calls);
// the generated VHDL and Verilog are driven through Vitis HLS's ap_ctrl_hs protocol (ap_start, then ap_done) by a test
// bench in Silinx's simulator, the same calls in the same order: the same ap_return, the same pointer outputs (taken
// when their _ap_vld is 1), the protocol kept (ap_idle 1 between calls, ap_done one cycle with ap_ready). Skipped
// with no C compiler.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { simulate } from '../core/compile.js';
import { noCC, rng, mask, values, runC } from './c-helpers.js';

const MAX_CYCLES = 5000;

/** The generated HDL's outputs on the vectors, the calls driven through ap_ctrl_hs: per call [ap_return, (value,
 *  written) per output, the read-write pointers' value, the cycles], and the protocol's faults. */
function runSeq(gen, lang, ins, outs, ret, vectors) {
  const port = (n) => gen.ports.find((p) => p.name === n);
  const L = ['module tb;', '  reg ap_clk = 0, ap_rst = 1, ap_start = 0;', '  integer cyc, bad = 0;'];
  for (const p of gen.ports) if (!['ap_clk', 'ap_rst', 'ap_start'].includes(p.name)) L.push(`  ${p.dir === 'in' ? 'reg' : 'wire'} ${p.w > 1 ? `[${p.w - 1}:0] ` : ''}${p.name};`);
  const caps = outs.map((o) => o.name).concat(ins.filter((i) => i.ptrIn).map((i) => `${i.name}_o`));
  for (const c of caps) L.push(`  reg [${(port(c)?.w || 1) - 1}:0] cap_${c}; reg got_${c};`);
  L.push(`  ${gen.top} dut(${gen.ports.map((p) => `.${p.name}(${p.name})`).join(', ')});`, '  always #5 ap_clk = ~ap_clk;');
  // a pointer output taken when its _ap_vld is 1, at each rising edge of the call
  L.push('  always @(posedge ap_clk) begin');
  for (const c of caps) if (port(`${c}_ap_vld`)) L.push(`    if (${c}_ap_vld) begin cap_${c} <= ${c}; got_${c} <= 1; end`);
  L.push('  end');
  L.push('  initial begin', '    #12 ap_rst = 0;');
  const hex = (v, w) => `${w}'h${(BigInt(v) & mask(w)).toString(16)}`;
  for (const v of vectors) {
    const asg = ins.map((i) => `${i.ptrIn ? `${i.name}_i` : i.name} = ${hex(v[i.name], i.w)};`).join(' ');
    L.push(`    if (!ap_idle) bad = bad + 1;`);
    L.push(`    ${asg} ${caps.map((c) => `got_${c} = 0;`).join(' ')} ap_start = 1; cyc = 0;`);
    L.push('    @(posedge ap_clk); #1 ap_start = 0;');
    L.push(`    while (!ap_done && cyc < ${MAX_CYCLES}) begin @(posedge ap_clk); #1 cyc = cyc + 1; end`);
    L.push('    if (!ap_ready) bad = bad + 1;');
    L.push('    @(posedge ap_clk); #1 if (ap_done) bad = bad + 1;');
    const shown = [ret ? 'ap_return' : null, ...outs.flatMap((o) => [`cap_${o.name}`, `got_${o.name}`]), ...ins.filter((i) => i.ptrIn).flatMap((i) => [`cap_${i.name}_o`, `got_${i.name}_o`]), 'cyc'].filter(Boolean);
    L.push(`    $display("${shown.map(() => '%h').join(' ')}", ${shown.join(', ')});`);
  }
  L.push('    $display("bad %0d", bad);', '    $finish;', '  end', 'endmodule');
  const r = simulate([{ path: lang === 'vhdl' ? 'dut.vhd' : 'dut.v', text: gen.hdl }, { path: 'tb.v', text: L.join('\n') }], 'tb', { until: 1e12 });
  const diags = [...r.lib.errors, ...r.design.diags].filter((d) => !/tb\.v/.test(d.file || ''));
  assert.deepEqual(diags.map((d) => `${d.severity}: ${d.message}`), [], `${lang}: the generated HDL compiles and elaborates with no message`);
  const lines = r.sim.log.map((e) => String(e.text).trim()).filter((s) => !/finished/.test(s));
  const bad = Number(lines.pop().split(' ')[1]);
  return { calls: lines.map((s) => s.split(/\s+/).map((x) => BigInt(`0x${x.replace(/[xz]/gi, '0')}`))), bad };
}

/** The sequential HDL of a C program against the C, call by call, in both languages; returns the cycles per call. */
function against(src, top, { ins, outs = [], ret = null, n = 20, seed = 1, fix = null }) {
  const r = rng(seed);
  const cols = ins.map((i) => values(i.w, i.s, n, r));
  const vectors = Array.from({ length: n }, (_, k) => Object.fromEntries(ins.map((i, j) => [i.name, fix?.[i.name] ? fix[i.name](cols[j][k]) : cols[j][k]])));
  const c = runC(src, top, ins, outs, ret, vectors).map((l) => l.split(' ').map((x) => BigInt(`0x${x}`)));
  let cycles = null;
  for (const lang of ['vhdl', 'verilog']) {
    const gen = cToHdl(src, { file: `${top}.c`, lang });
    assert.deepEqual(gen.diagnostics.filter((d) => d.severity === 'error'), [], `${lang}: generated`);
    assert.equal(gen.sequential, true, 'a sequential module');
    const { calls, bad } = runSeq(gen, lang, ins, outs, ret, vectors);
    assert.equal(bad, 0, `${lang}: the protocol kept (ap_idle between calls, ap_done and ap_ready one cycle)`);
    assert.equal(calls.length, n);
    const cyc = [];
    for (let k = 0; k < n; k++) {
      const exp = c[k], got = calls[k];
      const at = `${lang}, call ${k} (${JSON.stringify(vectors[k], (_, x) => (typeof x === 'bigint' ? String(x) : x))})`;
      let p = 0, q = 0;
      if (ret) assert.equal(got[q++], exp[p++], `${at}: ap_return`);
      for (const o of outs) {
        const val = exp[p++], changed = exp[p++], gv = got[q++], vld = got[q++];
        if (changed) assert.equal(vld, 1n, `${at}: ${o.name} written, its _ap_vld`);
        if (vld) assert.equal(gv, val, `${at}: ${o.name}`);
      }
      for (const i of ins.filter((x) => x.ptrIn)) {
        const val = exp[p++], gv = got[q++], vld = got[q++];
        assert.equal(vld ? gv : (BigInt(vectors[k][i.name]) & mask(i.w)), val, `${at}: ${i.name}_o`);
      }
      assert.ok(got[q] < BigInt(MAX_CYCLES), `${at}: done`);
      cyc.push(Number(got[q]));
    }
    if (cycles) assert.deepEqual(cyc, cycles, 'the same cycles in VHDL and Verilog');
    cycles = cyc;
  }
  return cycles;
}

const U32 = { w: 32, s: false }, I32 = { w: 32, s: true };

test('C to HDL, sequential: gcd (a while loop), its latency growing with the steps; integer square root (two loops); the inputs read at ap_start', { skip: noCC }, () => {
  const cyc = against(`unsigned gcd(unsigned a, unsigned b) {
  while (b != 0) {
#pragma HLS LOOP_TRIPCOUNT max=64
    if (a > b) a = a - b; else b = b - a;
    if (a == 0) return b;
  }
  return a;
}`, 'gcd', { ins: [{ name: 'a', ...U32 }, { name: 'b', ...U32 }], ret: U32, n: 16, fix: { a: (x) => x & 0x3ffn, b: (x) => (x & 0x3ffn) } });
  assert.ok(Math.max(...cyc) > Math.min(...cyc), 'the latency depends on the inputs');
  against(`unsigned isqrt(unsigned x) {
  unsigned r = 0, bit = 1u << 30;
  while (bit > x) {
#pragma HLS LOOP_TRIPCOUNT max=16
    bit >>= 2;
  }
  while (bit != 0) {
#pragma HLS LOOP_TRIPCOUNT max=16
    if (x >= r + bit) { x -= r + bit; r = (r >> 1) + bit; } else r >>= 1;
    bit >>= 2;
  }
  return r;
}`, 'isqrt', { ins: [{ name: 'x', ...U32 }], ret: U32, n: 24, seed: 2 });
});

test('C to HDL, sequential: static and global variables keep their values between calls (initialized at the reset); pointer outputs and their _ap_vld', { skip: noCC }, () => {
  against(`int calls;
int acc(int a, int *count, unsigned char *n8) {
  static int sum = 10;
  static unsigned char n = 250;
  n++;
  calls = calls + 1;
  sum += a;
  *count = calls;
  if (a > 0) *n8 = n;
  return sum;
}`, 'acc', { ins: [{ name: 'a', ...I32 }], outs: [{ name: 'count', ...I32 }, { name: 'n8', w: 8, s: false }], ret: I32, n: 20, seed: 3, fix: { a: (x) => x % 1000n } });
});

test('#1618 C to HDL, sequential: the statics of the functions the top calls (one register each, every call of a function sharing it, its initial value at the reset), their other locals; through another function too', { skip: noCC }, () => {
  against(`void acc1(int x, int *o) {
  static int acc = 0;
  acc += x;
  *o = acc;
}
void acc2(int x, int *o) {
  static int acc = 5;
  static unsigned char n;
  n++;
  acc += 2 * x + n;
  *o = acc;
}
void twice(int x, int *o) {
  int t;
  acc1(x, &t);
  int u = t + 1;
  *o = u;
}
int top(int x, int *a, int *b) {
  int c;
  acc1(x, a);
  acc2(x, b);
  twice(x, &c);
  return c;
}`, 'top', { ins: [{ name: 'x', ...I32 }], outs: [{ name: 'a', ...I32 }, { name: 'b', ...I32 }], ret: I32, n: 16, seed: 5, fix: { x: (v) => v % 1000n } });
});

test('C to HDL, sequential: nested loops with break and continue, an early return in a loop, do-while, an if with a loop in it, local arrays, a read-write pointer, an inlined function', { skip: noCC }, () => {
  against(`static int clip(int v) { return v > 1000 ? 1000 : v < -1000 ? -1000 : v; }
int mixed(int x, unsigned char k, int *io) {
  int t[4] = {1, 2, 3, 4};
  int s = 0;
  for (int i = 0; i < (k & 7); i++) {
#pragma HLS LOOP_TRIPCOUNT max=7
    if ((x >> i) & 1) continue;
    for (int j = 0; j < 4; j++) {
      if (j > i) break;
      t[j] += i;
      s += clip(t[j] * x);
    }
    if (s > 5000) return -s;
  }
  int d = 0;
  do {
#pragma HLS LOOP_TRIPCOUNT max=10
    d++; s -= 3;
  } while (s > 100 && d < 10);
  if (k > 128) {
    for (int q = 0; q < 3; q++) *io = *io + q * s;
  } else {
    *io = *io - 1;
  }
  return s + t[0] + t[3] + d;
}`, 'mixed', { ins: [{ name: 'x', ...I32 }, { name: 'k', w: 8, s: false }, { name: 'io', ...I32, ptrIn: true }], ret: I32, n: 30, seed: 4, fix: { x: (v) => v % 300n } });
});

test('C to HDL, sequential: the module made: ap_clk / ap_rst and the block protocol; its states named by their lines; what a sequential module does not support yet is said', () => {
  const v = cToHdl('int f(int n) {\n  int s = 0;\n  while (s < n) {\n#pragma HLS LOOP_TRIPCOUNT max=8\n    s += 2;\n  }\n  return s;\n}', { file: 'f.c', lang: 'vhdl' });
  assert.deepEqual(v.diagnostics, []);
  assert.deepEqual(v.ports.map((p) => p.name), ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'n', 'ap_return']);
  assert.match(v.hdl, /signal ap_CS_fsm : unsigned\(\d+ downto 0\);/);
  assert.match(v.hdl, /process \(ap_clk\)/);
  // (the loop pipelined automatically, #1919: its iteration's state named by the loop's line)
  assert.deepEqual(v.hdl.match(/-- line \d+/g), ['-- line 2', '-- line 3', '-- line 7']);
  const msgs = (src) => cToHdl(src).diagnostics.map((d) => `${d.line}:${d.col} ${d.severity}: ${d.message}`);
  assert.deepEqual(msgs('int g(int n) { int s = 0; while (s < n) {\n#pragma HLS LOOP_TRIPCOUNT max=4\n s++; } return s; }\nint f(int n) {\n#pragma HLS INTERFACE ap_ctrl_none port=return\n  return g(n);\n}'), [
    '5:1 warning: ap_ctrl_none: this function is sequential, it needs its block protocol: ap_ctrl_hs is made',
  ]);
  assert.deepEqual(msgs('int f(int n) {\n#pragma HLS INTERFACE ap_ctrl_none port=return\n  static int k = 0;\n  k += n;\n  return k;\n}'), [
    '2:1 warning: ap_ctrl_none: this function is sequential, it needs its block protocol: ap_ctrl_hs is made',
  ]);
});
