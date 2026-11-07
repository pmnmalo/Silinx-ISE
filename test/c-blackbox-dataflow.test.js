// Silinx HLS (#2340): an RTL blackbox (syn.blackbox, #1903) called in a DATAFLOW region, a process of its own: a module made
// for it (core/c-blackbox-process.js), its ports a process's, the RTL module inside it, started once a call by the
// region's handshake; its channels the region's streams and buffers, the top's streams and arrays, an input of the top's.
// The C model the C simulation's, the module the co-simulation's, in VHDL and in Verilog, against a Verilog and a VHDL
// module; the HDL as Check Syntax reads it; the warnings exact.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { compile, elaborate } from '../core/compile.js';
import { designChecks } from '../core/lint.js';
import { H, CHAIN, IDESC, MDESC, MOUT_DESC, ADDK_DESC, FILES, INC_V, MOUT_V, MOUT_C, ADDK_V, ADDK_C } from './hls-blackbox-ports-lib.mjs';

const ALL = { ...FILES, 'mout.v': MOUT_V, 'mout.cpp': MOUT_C, 'addk.v': ADDK_V, 'addk.cpp': ADDK_C };
const OPTS = (descs, files = ALL) => ({ file: 'u.cpp', top: 'top', headers: files, blackboxes: descs.map((d, k) => ({ file: `bb${k}.json`, text: JSON.stringify(d) })) });
const DF = '#pragma HLS DATAFLOW is accepted and ignored: Silinx does not make it';
const warns = (r) => r.diagnostics.filter((d) => d.severity === 'warning').map((d) => d.message);
const errs = (r) => r.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message);

// a process of C and a blackbox's, the blackbox's input the top's
const MIXED = `${H}void addk(hls::stream<data_t> &i, hls::stream<data_t> &o, data_t k);
static void twice(hls::stream<data_t> &i, hls::stream<data_t> &o) { o.write(i.read() * 2); }
void top(hls::stream<data_t> &a, hls::stream<data_t> &b, data_t k) {
#pragma HLS DATAFLOW
  hls::stream<data_t> t;
  twice(a, t);
  addk(t, b, k);
}
int main() {
  hls::stream<data_t> a, b;
  for (int k = 0; k < 4; k++) { a.write(k + 3); top(a, b, 10 * k - 7); if (b.read() != 2 * (k + 3) + 10 * k - 7) return 1; }
  return 0;
}
`;
// a buffer of the region a C process writes and the blackbox reads (its memory port); the top's array read by it
const BUFFER = `${H}void mout(data_t m[8], hls::stream<data_t> &o);
static void fill(data_t base, data_t m[8]) { for (int i = 0; i < 8; i++) m[i] = base + i; }
void top(data_t base, hls::stream<data_t> &o) {
#pragma HLS DATAFLOW
  data_t buf[8];
  fill(base, buf);
  mout(buf, o);
}
int main() {
  hls::stream<data_t> o;
  for (int b = -2; b < 2; b++) { top(b * 5, o); for (int i = 0; i < 8; i++) if (o.read() != b * 5 + i + 1) return 1; }
  return 0;
}
`;
const ARRAY = `${H}void mout(data_t m[8], hls::stream<data_t> &o);
void inc(hls::stream<data_t> &i, hls::stream<data_t> &o);
void top(data_t a[8], hls::stream<data_t> &o) {
#pragma HLS DATAFLOW
  hls::stream<data_t, 8> t;
  mout(a, t);
  for (int i = 0; i < 8; i++) inc(t, o);
}
int main() {
  data_t a[8];
  hls::stream<data_t> o;
  for (int i = 0; i < 8; i++) a[i] = 3 * i - 11;
  top(a, o);
  for (int i = 0; i < 8; i++) if (o.read() != 3 * i - 9) return 1;
  return 0;
}
`;

// (each process's ap_ready left open, #2992: no message of it; the top's array's second port's _q1, made as Vitis HLS
// makes it (#1901), its input never read)
function checked(g, lang, extra = []) {
  const lib = compile([{ path: `top.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: g.hdl }, ...g.blackboxes.flatMap((d) => d.rtl)]);
  const design = elaborate(lib, 'top');
  assert.deepEqual([...lib.errors, ...design.diags].map((d) => `${d.severity}: ${d.message}`), []);
  assert.deepEqual(designChecks(lib, design).map((d) => d.message), extra);
}

// (the loop of inc's calls, a process of its own, Loop_0_proc: pipelined automatically, a state that waits for the module)
const LOOP = 'this loop is pipelined automatically, as Vitis HLS does (II=1): II=4 made (it calls an RTL blackbox, a state that waits for the module); #pragma HLS PIPELINE off in it turns that off';
const CASES = [
  ['two blackbox processes, a stream between them', CHAIN, () => [IDESC()], 5, ['inc_bb_U0', 'inc_bb_U1'], []],
  ['two blackbox processes of a VHDL module', CHAIN, () => [IDESC({ rtl_files: ['inc.vhd'] })], 5, ['inc_bb_U0', 'inc_bb_U1'], []],
  ['a C process and a blackbox\'s, its input the top\'s', MIXED, () => [ADDK_DESC()], 4, ['twice_U0', 'addk_bb_U1'], []],
  ['a buffer a C process writes, the blackbox\'s memory port', BUFFER, () => [MOUT_DESC()], 4, ['fill_U0', 'mout_bb_U1'], []],
  ['the top\'s array the blackbox\'s memory port; a process of C that calls a blackbox', ARRAY, () => [MOUT_DESC(), IDESC()], 1, ['mout_bb_U0', 'Loop_0_proc_U1'], [LOOP], ['Input <a_q1> is never used.']],
];
for (const [what, unit, descs, calls, insts, w, extra] of CASES) {
  for (const lang of ['vhdl', 'verilog']) {
    test(`#2340 ${what}: a ${lang} region, the C models in the C simulation, the modules in the co-simulation; the warnings exact`, () => {
      const sim = simulateC(unit, OPTS(descs()));
      // (the C simulation's checker says the pragma, as of any region: the synthesis makes it)
      assert.equal(sim.ok, true); assert.equal(sim.exitCode, 0); assert.deepEqual(warns(sim), [DF]);
      const g = cToHdl(unit, { ...OPTS(descs()), lang });
      assert.deepEqual(errs(g), []); assert.deepEqual(warns(g), w);
      assert.equal(g.report.dataflow, true);
      assert.deepEqual(g.report.processes.map((p) => p.instance), insts);
      checked(g, lang, extra);
      const c = cosimulate(unit, { ...OPTS(descs()), lang });
      assert.deepEqual(c.errors, []);
      assert.deepEqual(c.mismatches, []);
      assert.equal(c.pass, true);
      assert.equal(c.calls, calls);
    });
  }
}

test('#2340 the co-simulation sees the module in its process: a module that differs mismatches', () => {
  for (const [unit, descs, files] of [[CHAIN, [IDESC()], { ...ALL, 'inc.v': INC_V.replace('o_din = v + 1', 'o_din = v + 2') }],
    [BUFFER, [MOUT_DESC()], { ...ALL, 'mout.v': MOUT_V.replace('o_din = v + 1', 'o_din = v - 1') }]]) {
    for (const lang of ['vhdl', 'verilog']) {
      const c = cosimulate(unit, { ...OPTS(descs, files), lang });
      assert.equal(c.pass, false, lang);
      assert.ok(c.mismatches.length > 0, lang);
    }
  }
});

test('#2340 the process\'s module: its ports a process\'s, the RTL module inside it; the region\'s report names it', () => {
  const g = cToHdl(CHAIN, { ...OPTS([IDESC()]), lang: 'verilog' });
  assert.match(g.hdl, /module inc_bb \(\n  input ap_clk,\n  input ap_rst,\n  input ap_start,\n  output ap_done,\n  output ap_idle,\n  output ap_ready,\n  input \[9:0\] i_dout,\n  input i_empty_n,\n  output i_read,\n  output \[9:0\] o_din,\n  input o_full_n,\n  output o_write\n\);/);
  assert.match(g.hdl, /inc ap_bb0 \(\.ap_clk\(ap_clk\), \.ap_rst\(ap_rst\), \.ap_start\(ap_bb0_start\), \.ap_done\(ap_bb0_done\), \.i_empty_n\(ap_bb0_i_empty_n\), \.i_read\(ap_bb0_i_read\), \.i_dout\(ap_bb0_i_dout\), \.o_full_n\(ap_bb0_o_full_n\), \.o_write\(ap_bb0_o_write\), \.o_din\(ap_bb0_o_din\)\);/);
  assert.deepEqual(g.blackboxes.map((d) => d.module), ['inc']);
  assert.deepEqual(g.report.processes.map((p) => [p.name, p.module, p.blackbox, p.latency]), [['inc', 'inc_bb', 'inc', { min: 0, max: null }], ['inc', 'inc_bb', 'inc', { min: 0, max: null }]]);
  // (a module of a known latency, no ap_done: the description's)
  const d = IDESC({ rtl_performance: { latency: '3' } });
  assert.deepEqual(cToHdl(CHAIN, { ...OPTS([d]), lang: 'vhdl' }).report.processes.map((p) => p.latency), [{ min: 3, max: 3 }, { min: 3, max: 3 }]);
});

// a blackbox's output or result in a DATAFLOW region: refused, as Vitis HLS refuses an output pointer there
test('#2340 refused in a DATAFLOW region: an output of the blackbox, its result', () => {
  const out = `${H}void msum(data_t m[8], data_t &z);
void top(data_t a[8], data_t &s) {
#pragma HLS DATAFLOW
  msum(a, s);
}
`;
  assert.deepEqual(errs(cToHdl(out, { ...OPTS([MDESC()]), lang: 'vhdl' })), ["syn.blackbox: bb0.json: 'msum' is called in a DATAFLOW region: its argument 'z' is an output, not supported there (a stream or an array)"]);
  const ret = `${H}data_t inc1(data_t a);
void top(data_t a) {
#pragma HLS DATAFLOW
  inc1(a);
}
`;
  const d = { c_function_name: 'inc1', rtl_top_module_name: 'inc1', c_files: [], rtl_files: ['inc1.v'], c_parameters: [{ c_name: 'a', c_port_direction: 'in', rtl_ports: { data_read_in: 'a' } }], c_return: { c_port_direction: 'out', rtl_ports: { data_write_out: 'z' } }, rtl_performance: { latency: '0' } };
  const g = cToHdl(ret, { ...OPTS([d], { 'inc1.v': 'module inc1(input [9:0] a, output [9:0] z); assign z = a + 1; endmodule\n' }), lang: 'vhdl' });
  assert.deepEqual(errs(g), ["syn.blackbox: bb0.json: 'inc1' is called in a DATAFLOW region: its result is not supported there (a stream or an array)"]);
});
