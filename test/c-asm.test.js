// Silinx HLS, the state machine as an ASM chart (#1575): core/c-asm.js (and core/c-print.js, the C written back). A
// sequential function's chart: the protocol's IDLE and DONE, a state per block of the C with its statements, its ifs
// decision boxes and the statements under them conditional outputs, a return / break / continue its jump, a memory's
// accesses; a stream's read and write in the C's terms, the wait on the FIFO and its handshake (#1941); each state of
// the machine (core/c-fsmd.js) one state of the chart; laid out (every box placed). A combinational function has none:
// said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cAsm } from '../core/c-asm.js';
import { exprText, stmtText } from '../core/c-print.js';
import { parse } from '../core/c-parse.js';
import { cToHdl } from '../core/c-hdl.js';
import { normalizeModel } from '../core/asm.js';
import { cosimulate } from '../core/c-cosim.js';

/** The chart as lines: a box 'name or condition [actions]', then each connection 'from -port-> to'. */
function lines(model) {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const lbl = (n) => (n.type === 'state' ? n.name : n.type === 'decision' ? `<${n.cond}>` : `(${n.actions.join('; ')})`);
  return model.edges.map((e) => `${lbl(byId.get(e.from))} -${e.port}-> ${lbl(byId.get(e.to))}`);
}

test('#1575 C written back: precedence, unary, casts, calls, indexes, assignments, declarations', () => {
  const e = (src) => exprText(parse(`void f(void) { x = ${src}; }`).items[0].body.items[0].e.r);
  assert.equal(e('a + b * (c - 1)'), 'a + b * (c - 1)');
  assert.equal(e('(a + b) * c'), '(a + b) * c');
  assert.equal(e('a - (b - c)'), 'a - (b - c)');
  assert.equal(e('a - b - c'), 'a - b - c');
  assert.equal(e('-(-a)'), '-(-a)');
  assert.equal(e('!(a && b) || c ? t[i + 1] : (unsigned char)g(a, b)'), '!(a && b) || c ? t[i + 1] : (unsigned char)g(a, b)');
  assert.equal(e('x.range(7, 4)'), 'x.range(7, 4)');
  const s = parse('void f(void) { int k = 3, m; s += a[i]++; return; }').items[0].body.items;
  assert.deepEqual(s.map(stmtText), ['int k = 3; int m', 's += a[i]++', 'return']);
});

const GCD = `unsigned gcd(unsigned a, unsigned b) {
  while (b != 0) {
#pragma HLS LOOP_TRIPCOUNT max=64
#pragma HLS PIPELINE off
    unsigned t = b;
    b = a >= b ? a - b : b - a;
    a = t;
    if (b > a) { t = a; a = b; b = t; }
  }
  return a;
}
`;

test('#1575 the ASM chart of a sequential function: IDLE, the arguments read on ap_start, a state per block with its statements, the loop\'s condition and an if as decisions, DONE; a state per state of the machine', () => {
  const r = cAsm(GCD, { file: 'gcd.c' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.diagnostics, []);
  assert.deepEqual(lines(r.model), [
    'IDLE -next-> <ap_start>', '<ap_start> -true-> (read a, b)', '(read a, b) -next-> S1', '<ap_start> -false-> IDLE', 'DONE -next-> IDLE',
    'S1 -next-> <b != 0>', '<b != 0> -true-> S2', '<b != 0> -false-> S3',
    'S2 -next-> <b > a>', '<b > a> -true-> (t = a; a = b; b = t)', '(t = a; a = b; b = t) -next-> S1', '<b > a> -false-> S1',
    'S3 -next-> DONE',
  ]);
  const st = (n) => r.model.nodes.find((x) => x.name === n);
  assert.deepEqual(st('S2').actions, ['unsigned t = b', 'b = a >= b ? a - b : b - a', 'a = t']);
  assert.deepEqual(st('S3').actions, ['ap_return = a']);
  assert.deepEqual(st('IDLE').actions, ['ap_idle = 1']);
  assert.deepEqual(st('DONE').actions, ['ap_done = 1', 'ap_ready = 1']);
  // as many states as the machine has (IDLE and DONE with them)
  assert.equal(r.model.nodes.filter((n) => n.type === 'state').length, cToHdl(GCD, { file: 'gcd.c' }).states);
  // every box placed, apart; the model as core/asm.js reads it
  const pos = r.model.nodes.map((n) => `${n.x},${n.y}`);
  assert.equal(new Set(pos).size, pos.length);
  assert.ok(r.model.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)));
  assert.equal(normalizeModel(r.model).nodes.length, r.model.nodes.length);
  assert.deepEqual(r.model.registers.map((x) => `${x.name}:${x.width}`), ['a:32', 'b:32', 't:32', 'ap_return:32']);
});

test('#1575 a return, break and continue inside a block\'s ifs: their jumps; a memory\'s accesses; an unrolled loop in its state; a combinational function: no chart', () => {
  const r = cAsm(`int find(int a[8], int x) {
  int k = 0;
  for (int i = 0; i < 8; i++) {
    int v = a[i];
    if (v == x) return i;
    if (v < 0) break;
    if (v == 0) continue;
    k++;
  }
  for (int j = 0; j < 4; j++) {
#pragma HLS UNROLL
    k += j;
  }
  return -k;
}
`, { file: 'find.c' });
  assert.equal(r.ok, true);
  const L = lines(r.model);
  assert.ok(L.includes('(ap_return = i) -next-> DONE'), L.join('\n'));
  const states = r.model.nodes.filter((n) => n.type === 'state');
  const acts = states.flatMap((n) => n.actions);
  assert.ok(acts.includes('a_address0 = i; a_ce0 = 1'), acts.join('\n'));
  assert.ok(acts.includes('ap_mem_a_0 = a_q0'), acts.join('\n'));
  assert.ok(acts.includes('for (…) unrolled: k += j'), acts.join('\n'));
  // break: to the state after the loop; continue: to its step
  const byId = new Map(r.model.nodes.map((n) => [n.id, n]));
  const after = (cond, port) => byId.get(r.model.edges.find((e) => byId.get(e.from).cond === cond && e.port === port).to);
  assert.equal(after('v < 0', 'true').type, 'state');
  assert.equal(after('v == 0', 'true').type, 'state');
  assert.notEqual(after('v < 0', 'true').name, after('v == 0', 'true').name);
  assert.equal(r.model.nodes.filter((n) => n.type === 'state').length, cToHdl(`int find(int a[8], int x) {\n  int k = 0;\n  for (int i = 0; i < 8; i++) {\n    int v = a[i];\n    if (v == x) return i;\n    if (v < 0) break;\n    if (v == 0) continue;\n    k++;\n  }\n  for (int j = 0; j < 4; j++) {\n#pragma HLS UNROLL\n    k += j;\n  }\n  return -k;\n}\n`).states);
  const comb = cAsm('int f(int a) { return a + 1; }');
  assert.equal(comb.ok, false);
  assert.deepEqual(comb.diagnostics.map((d) => d.message), ["'f' is combinational: it has no state machine"]);
});

// (a free-running kernel: ap_ctrl_none and a stream argument, #1900; its arguments renamed in_r and out_r, #1902)
const FREE = `#include "hls_stream.h"
void sums(hls::stream<int> &in, hls::stream<int> &out) {
#pragma HLS INTERFACE ap_ctrl_none port=return
  int s = 0;
  for (int i = 0; i < 3; i++) s += in.read();
  out.write(s);
}
int main() {
  hls::stream<int> in, out;
  int t = 0;
  for (int c = 0; c < 4; c++) {
    for (int i = 0; i < 3; i++) in.write(c * 10 + i);
    sums(in, out);
    t += out.read();
  }
  return t == 192 ? 0 : 1;
}
`;
const io = (model) => [model.inputs.map((p) => `${p.name}:${p.width}`), model.outputs.map((p) => `${p.name}:${p.width}${p.registered ? ' reg' : ''}`)];
const portsOf = (gen) => [gen.ports.filter((p) => p.dir === 'in' && !['ap_clk', 'ap_rst'].includes(p.name)).map((p) => p.name), gen.ports.filter((p) => p.dir === 'out').map((p) => p.name)];

test('#1927 the ASM chart of a free-running function (ap_ctrl_none): IDLE goes on to the first state at once, DONE sets nothing; its inputs and outputs the module\'s ports (no ap_start, ap_done, ap_idle, ap_ready); co-simulated in VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cAsm(FREE, { file: 'sums.cpp', lang });
    assert.equal(r.ok, true, lang);
    assert.deepEqual(r.diagnostics, [], lang);
    // (the loop pipelined automatically, #1919: an iteration a state, S2, its read, then its add, step and condition)
    assert.deepEqual(lines(r.model), [
      'IDLE -next-> S1', 'DONE -next-> IDLE',
      'S1 -next-> <i < 3>', '<i < 3> -true-> S2', '<i < 3> -false-> S3',
      // (each read and write: its wait on the FIFO's flag and its handshake, under the module's ports' names, #1941)
      'S2 -next-> <in_r_empty_n>', '<in_r_empty_n> -false-> S2', '<in_r_empty_n> -true-> (in_r_read = 1; ap_fifo_in_0 = in_r_dout; s += ap_fifo_in_0; i++)',
      '(in_r_read = 1; ap_fifo_in_0 = in_r_dout; s += ap_fifo_in_0; i++) -next-> <i < 3>', '<i < 3> -true-> S2', '<i < 3> -false-> S3',
      'S3 -next-> <out_r_full_n>', '<out_r_full_n> -false-> S3', '<out_r_full_n> -true-> (out_r_din = s; out_r_write = 1)',
      '(out_r_din = s; out_r_write = 1) -next-> S4', 'S4 -next-> DONE',
    ], lang);
    const st = (n) => r.model.nodes.find((x) => x.name === n);
    assert.deepEqual([st('IDLE').actions, st('DONE').actions], [[], []], lang);
    assert.ok(!r.model.nodes.some((n) => n.cond === 'ap_start' || (n.actions || []).some((a) => /\bap_(start|done|idle|ready)\b/.test(a))), lang);
    assert.deepEqual(io(r.model), [['in_r_dout:32', 'in_r_empty_n:1', 'out_r_full_n:1'], ['in_r_read:1 reg', 'out_r_din:32 reg', 'out_r_write:1 reg']], lang);
    // the module's ports, as generated; its states as many
    const gen = cToHdl(FREE, { file: 'sums.cpp', lang });
    assert.deepEqual([r.model.inputs.map((p) => p.name), r.model.outputs.map((p) => p.name)], portsOf(gen), lang);
    assert.equal(r.model.nodes.filter((n) => n.type === 'state').length, gen.states, lang);
    assert.deepEqual([r.model.clock, r.model.reset.name], ['ap_clk', 'ap_rst'], lang);
    assert.equal(normalizeModel(r.model).nodes.length, r.model.nodes.length, lang);
    // the module the chart is of: compiled, elaborated and simulated against the C, its warnings asserted
    const c = cosimulate(FREE, { file: 'sums.cpp', lang });
    assert.deepEqual([c.errors, c.pass, c.sim.exitCode], [[], true, 0], lang);
    assert.deepEqual(c.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), [
      "2 warning: 'in' is a reserved word of VHDL or Verilog: it is named in_r in the module",
      "2 warning: 'out' is a reserved word of VHDL or Verilog: it is named out_r in the module"], lang);
  }
});

test('#1927 the block protocol (ap_ctrl_hs, the default, or written) keeps its chart: IDLE waits for ap_start, DONE sets ap_done and ap_ready; ap_start, ap_done, ap_idle, ap_ready among the ports, as the module\'s; ap_ctrl_none without a stream: the block protocol made, its chart too', () => {
  const hsSrc = GCD.replace('{\n', '{\n#pragma HLS INTERFACE ap_ctrl_hs port=return\n');
  const noneSrc = GCD.replace('{\n', '{\n#pragma HLS INTERFACE ap_ctrl_none port=return\n');
  for (const src of [GCD, hsSrc, noneSrc]) {
    const r = cAsm(src, { file: 'gcd.c' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), src === noneSrc ? ['2 warning: ap_ctrl_none: this function is sequential, it needs its block protocol: ap_ctrl_hs is made'] : []);
    assert.deepEqual(lines(r.model).slice(0, 5), ['IDLE -next-> <ap_start>', '<ap_start> -true-> (read a, b)', '(read a, b) -next-> S1', '<ap_start> -false-> IDLE', 'DONE -next-> IDLE']);
    const st = (n) => r.model.nodes.find((x) => x.name === n);
    assert.deepEqual([st('IDLE').actions, st('DONE').actions], [['ap_idle = 1'], ['ap_done = 1', 'ap_ready = 1']]);
    assert.deepEqual(io(r.model), [['ap_start:1', 'a:32', 'b:32'], ['ap_done:1', 'ap_idle:1', 'ap_ready:1', 'ap_return:32 reg']]);
    assert.deepEqual([r.model.inputs.map((p) => p.name), r.model.outputs.map((p) => p.name)], portsOf(cToHdl(src, { file: 'gcd.c' })));
  }
});

// (a stream read as a statement, into a variable, inside an expression and polled; a stream written, #1941)
const STREAMS = `#include "hls_stream.h"
void sums(hls::stream<int> &xs, hls::stream<int> &ys) {
  int s = 0;
  for (int i = 0; i < 2; i++) s += xs.read();
  int t = xs.read();
  xs.read(t);
  if (!xs.empty()) s += xs.read() * 2;
  ys.write(s + t);
}
int main() {
  hls::stream<int> xs, ys;
  int r = 0;
  for (int c = 0; c < 3; c++) {
    for (int i = 0; i < 5; i++) xs.write(c * 10 + i);
    sums(xs, ys);
    r += ys.read();
  }
  return r == 186 ? 0 : 1;
}
`;

test('#1941 a stream\'s read and write in the ASM chart in the C\'s terms (ap_fifo_xs_0 = xs.read(), ys.write(s + t)), the state waiting while the FIFO is empty (full), its handshake under it; co-simulated in VHDL and Verilog', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cAsm(STREAMS, { file: 'sums.cpp', lang });
    assert.equal(r.ok, true, lang);
    assert.deepEqual(r.diagnostics, [], lang);
    const rd = (k, from, to) => [`${from} -next-> <xs_empty_n>`, `<xs_empty_n> -false-> ${from}`, `<xs_empty_n> -true-> (xs_read = 1; ap_fifo_xs_${k} = xs_dout)`,
      `(xs_read = 1; ap_fifo_xs_${k} = xs_dout) -next-> ${to}`];
    // each read: its state, then the wait (back to the state while xs_empty_n is 0), the value taken under it; the write
    // the same with ys_full_n; the loop pipelined automatically (#1919): its iteration one state, S2, its add and step
    // after the read's handshake
    const loop = '(xs_read = 1; ap_fifo_xs_0 = xs_dout; s += ap_fifo_xs_0; i++)';
    assert.deepEqual(lines(r.model), [
      'IDLE -next-> <ap_start>', '<ap_start> -true-> S1', '<ap_start> -false-> IDLE', 'DONE -next-> IDLE',
      'S1 -next-> <i < 2>', '<i < 2> -true-> S2', '<i < 2> -false-> S3',
      'S2 -next-> <xs_empty_n>', '<xs_empty_n> -false-> S2', `<xs_empty_n> -true-> ${loop}`, `${loop} -next-> <i < 2>`, '<i < 2> -true-> S2', '<i < 2> -false-> S3',
      ...rd(1, 'S3', 'S4'), 'S4 -next-> S5',
      ...rd(2, 'S5', 'S6'), 'S6 -next-> <!xs.empty()>', '<!xs.empty()> -true-> S7', '<!xs.empty()> -false-> S9',
      ...rd(3, 'S7', 'S8'), 'S8 -next-> S9',
      'S9 -next-> <ys_full_n>', '<ys_full_n> -false-> S9', '<ys_full_n> -true-> (ys_din = s + t; ys_write = 1)', '(ys_din = s + t; ys_write = 1) -next-> S10',
      'S10 -next-> DONE',
    ], lang);
    const st = (n) => r.model.nodes.find((x) => x.name === n);
    // the C's statements in their states: the value read in a register, used by the statement after it; read(t) as t = …
    assert.deepEqual(['S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9'].map((n) => st(n).actions), [
      ['ap_fifo_xs_0 = xs.read()'], ['ap_fifo_xs_1 = xs.read()'], ['int t = ap_fifo_xs_1'], ['ap_fifo_xs_2 = xs.read()'],
      ['t = ap_fifo_xs_2'], ['ap_fifo_xs_3 = xs.read()'], ['s += ap_fifo_xs_3 * 2'], ['ys.write(s + t)']], lang);
    assert.deepEqual(st('DONE').actions, ['ap_done = 1', 'ap_ready = 1'], lang);
    // the handshake's ports among the chart's; as many states as the module; every box placed apart
    assert.deepEqual([r.model.inputs.map((p) => p.name), r.model.outputs.map((p) => p.name)], [
      ['ap_start', 'xs_dout', 'xs_empty_n', 'ys_full_n'], ['ap_done', 'ap_idle', 'ap_ready', 'xs_read', 'ys_din', 'ys_write']], lang);
    const gen = cToHdl(STREAMS, { file: 'sums.cpp', lang });
    assert.equal(r.model.nodes.filter((n) => n.type === 'state').length, gen.states, lang);
    const pos = r.model.nodes.map((n) => `${n.x},${n.y}`);
    assert.equal(new Set(pos).size, pos.length, lang);
    assert.equal(normalizeModel(r.model).nodes.length, r.model.nodes.length, lang);
    // the module the chart is of: compiled, elaborated and simulated against the C; no warnings
    const c = cosimulate(STREAMS, { file: 'sums.cpp', lang });
    assert.deepEqual([c.errors, c.pass, c.sim.exitCode], [[], true, 0], lang);
    assert.deepEqual(c.gen.diagnostics, [], lang);
  }
});

// (the issue's own: streams named in and out, reserved words, their ports in_r_… and out_r_…, #1902)
const INOUT = `#include "hls_stream.h"
void pass2(hls::stream<int> &in, hls::stream<int> &out) {
  int t = in.read();
  out.write(t + 1);
}
int main() {
  hls::stream<int> in, out;
  int r = 0;
  for (int c = 0; c < 3; c++) { in.write(c); pass2(in, out); r += out.read(); }
  return r == 6 ? 0 : 1;
}
`;

test('#1941 streams named in and out: t = in.read() and out.write(t + 1) as the C writes them, the handshake by the module\'s ports (in_r_empty_n, out_r_full_n); co-simulated in VHDL and Verilog, the renames\' warnings', () => {
  for (const lang of ['vhdl', 'verilog']) {
    const r = cAsm(INOUT, { file: 'pass2.cpp', lang });
    assert.equal(r.ok, true, lang);
    assert.deepEqual(r.diagnostics, [], lang);
    assert.deepEqual(lines(r.model), [
      'IDLE -next-> <ap_start>', '<ap_start> -true-> S1', '<ap_start> -false-> IDLE', 'DONE -next-> IDLE',
      'S1 -next-> <in_r_empty_n>', '<in_r_empty_n> -false-> S1', '<in_r_empty_n> -true-> (in_r_read = 1; ap_fifo_in_0 = in_r_dout)', '(in_r_read = 1; ap_fifo_in_0 = in_r_dout) -next-> S2',
      'S2 -next-> S3',
      'S3 -next-> <out_r_full_n>', '<out_r_full_n> -false-> S3', '<out_r_full_n> -true-> (out_r_din = t + 1; out_r_write = 1)', '(out_r_din = t + 1; out_r_write = 1) -next-> S4',
      'S4 -next-> DONE',
    ], lang);
    const st = (n) => r.model.nodes.find((x) => x.name === n);
    assert.deepEqual(['S1', 'S2', 'S3', 'S4'].map((n) => st(n).actions), [['ap_fifo_in_0 = in.read()'], ['int t = ap_fifo_in_0'], ['out.write(t + 1)'], []], lang);
    // the handshake's names the module's ports
    const gen = cToHdl(INOUT, { file: 'pass2.cpp', lang });
    const names = new Set(gen.ports.map((p) => p.name));
    for (const n of ['in_r_empty_n', 'in_r_read', 'in_r_dout', 'out_r_full_n', 'out_r_din', 'out_r_write']) assert.ok(names.has(n), `${n}: ${[...names].join(' ')}`);
    assert.equal(r.model.nodes.filter((n) => n.type === 'state').length, gen.states, lang);
    const c = cosimulate(INOUT, { file: 'pass2.cpp', lang });
    assert.deepEqual([c.errors, c.pass, c.sim.exitCode], [[], true, 0], lang);
    assert.deepEqual(c.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), [
      "2 warning: 'in' is a reserved word of VHDL or Verilog: it is named in_r in the module",
      "2 warning: 'out' is a reserved word of VHDL or Verilog: it is named out_r in the module"], lang);
  }
});

test('#1941 every statement the HLS compiler makes and every literal written back: a stream\'s read and write, a floating-point literal (no <kind>)', () => {
  assert.equal(stmtText({ kind: 'fiforead', fifo: 'xs', tmp: 'ap_fifo_xs_0' }), 'ap_fifo_xs_0 = xs.read()');
  assert.equal(stmtText({ kind: 'fifowrite', fifo: 'ys', v: parse('void f(void) { a + 1; }').items[0].body.items[0].e }), 'ys.write(a + 1)');
  const e = (src) => exprText(parse(`void f(void) { x = ${src}; }`).items[0].body.items[0].e.r);
  assert.equal(e('a * 1.5 + 0.5f'), 'a * 1.5 + 0.5f');
  const r = cAsm('float f(float a[4]) { float s = 0.5f; for (int i = 0; i < 4; i++) s += a[i] * 1.5; return s; }', { file: 'f.c' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.diagnostics, []);
  const acts = r.model.nodes.filter((n) => n.type === 'state').flatMap((n) => n.actions);
  assert.ok(acts.includes('float s = 0.5f') && acts.includes('s += ap_mem_a_0 * 1.5'), acts.join(' | '));
  assert.ok(!acts.some((a) => /<[a-z]+>/.test(a)), acts.join(' | '));
});
