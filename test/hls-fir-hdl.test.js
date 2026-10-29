// Silinx HLS (#1942, core/hls-fir-hdl.js): the hardware of hls_fir.h's hls::FIR, its own HDL: the module alone (its
// ports Vitis HLS's, its calls replayed on it in VHDL and in Verilog, its outputs the FIR's from its definition,
// test/hls-fir-ref.js); in a design, co-simulated against the C simulation (single rate, decimation with coefficient sets,
// interpolation; arrays and streams, a config stream), its warnings asserted; the open synthesis (Yosys, Spartan-3E)
// making it an 18x18 multiplier and block RAMs, with no warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firParams, FIR_CONSTANTS as C } from '../core/hls-fir.js';
import { firHdl } from '../core/hls-fir-hdl.js';
import { cosimBench, cosimulate } from '../core/c-cosim.js';
import { simulate, compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-open.js';
import { yosysNode } from '../core/synth-open-node.js';
import { firReference, firSource } from './hls-fir-ref.js';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const LANGS = ['vhdl', 'verilog'];
const fields = (o) => new Map(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) ? v : BigInt(v)]));
const wrap = (v, w) => BigInt.asIntN(w, v);

/** The module of a filter alone, its calls replayed on it (core/c-cosim.js's test bench): each call's outputs (raw). */
function alone(cfg, { lang, types, args, calls }) {
  const { p, errors } = firParams('cfg', fields(cfg));
  assert.deepEqual(errors, []);
  const gen = firHdl({ p, args }, { lang, module: 'fir_alone', src: 'fir.cpp', types });
  gen.memories = gen.memories.map((m) => ({ ...m, port: `${m.name}_r` }));
  const tb = cosimBench(gen, calls.map((c) => ({ args: { config: BigInt(c.set ?? 0) }, ptrIn: {}, memIn: { in: c.x }, streamIn: {}, streamOut: {}, streamRead: {}, steps: 0 })));
  const r = simulate([{ path: `fir_alone.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: gen.hdl }, { path: 'tb.v', text: tb.text }], 'silinx_cosim_tb', { until: 1e15 });
  assert.deepEqual(r.errors, [], lang);
  const rows = r.sim.log.map((e) => String(e.text).trim()).filter((s) => /^[0-9a-f ]+$/i.test(s) && !/^bad /.test(s));
  return { gen, out: rows.map((s) => s.split(' ').slice(0, p.outLen).map((x) => wrap(BigInt(`0x${x}`), types.out.w))), cycles: rows.map((s) => Number(`0x${s.split(' ').at(-1)}`)) };
}

const ARR = { in: { type: 'in_t', stream: false }, out: { type: 'out_t', stream: false } };
const xs = (n, c, w) => Array.from({ length: n }, (_, i) => wrap(BigInt(((i * 7919 + c * 104729) % 65521) - 32760), w));

test('#1942 the module alone: the decimator\'s ports Vitis HLS\'s (two ap_memory ports an array, ap_none the config), its outputs the FIR\'s, in VHDL and Verilog', () => {
  const vec = [5, -1, -3, 2, 4, 7, -5, -9, 21, 50, 70, 50, 21, -9, -7, 3, 6, -2, -5, 1, 8];
  const cfg = { input_length: 20, output_length: 10, num_coeffs: 7, coeff_sets: 3, filter_type: C.decimation, decim_rate: 2, coeff_vec: vec };
  const calls = [0, 1, 2, 1].map((set, c) => ({ x: xs(20, c, 16), set }));
  const types = { in: { w: 16, s: true }, out: { w: 24, s: true, ap: true, fx: true, f: 0, q: 'AP_TRN', o: 'AP_WRAP' }, config: { w: 8, s: false } };
  const want = firReference({ coeffs: [vec.slice(0, 7), vec.slice(7, 14), vec.slice(14)], inW: 16, inF: 0, cF: 0, D: 2 }, calls, { w: 16, f: 0 }, { w: 24, f: 0 });
  for (const lang of LANGS) {
    const { gen, out, cycles } = alone(cfg, { lang, types, args: { ...ARR, config: { type: 'config_t', ptr: true } }, calls });
    assert.deepEqual(out, want, lang);
    // (each output 13 cycles: its two inputs read (3), its 7 taps (7, then 2 through the multiplier), written (1))
    assert.deepEqual(cycles, [130, 130, 130, 130], lang);
    assert.deepEqual(gen.ports.map((x) => `${x.name} ${x.dir} ${x.w}`), ['ap_clk in 1', 'ap_rst in 1', 'ap_start in 1', 'ap_done out 1', 'ap_idle out 1', 'ap_ready out 1',
      'in_r_address0 out 5', 'in_r_ce0 out 1', 'in_r_d0 out 16', 'in_r_q0 in 16', 'in_r_we0 out 1', 'in_r_address1 out 5', 'in_r_ce1 out 1', 'in_r_d1 out 16', 'in_r_q1 in 16', 'in_r_we1 out 1',
      'out_r_address0 out 4', 'out_r_ce0 out 1', 'out_r_d0 out 24', 'out_r_q0 in 24', 'out_r_we0 out 1', 'out_r_address1 out 4', 'out_r_ce1 out 1', 'out_r_d1 out 24', 'out_r_q1 in 24', 'out_r_we1 out 1',
      'config_r in 8'], lang);
    assert.deepEqual([gen.diagnostics, gen.report.memories], [[], [{ name: 'coefficients', words: 21, bits: 16, kind: 'ROM' }, { name: 'delay line', words: 7, bits: 16, kind: 'RAM' }]], lang);
  }
});

test('#1942 the module alone: interpolation by 4 of fractional values into a narrower output (its conversion, AP_TRN and AP_WRAP)', () => {
  const vec = [0.75, -1.25, 2.5, 7.75, 2.5, -1.25, 0.75, 0.5, -0.25];
  const cfg = { input_width: 10, input_fractional_bits: 6, coeff_width: 8, coeff_fractional_bits: 2, quantization: C.quantize_only, num_coeffs: 9, input_length: 6, output_length: 24,
    filter_type: C.interpolation, interp_rate: 4, coeff_vec: vec };
  const calls = [0, 1, 2].map((c) => ({ x: xs(6, c, 12) }));
  // (the arrays' types: ap_fixed<12, 4> in, ap_fixed<10, 6> out)
  const types = { in: { w: 12, s: true, ap: true, fx: true, f: 8, q: 'AP_TRN', o: 'AP_WRAP' }, out: { w: 10, s: true, ap: true, fx: true, f: 4, q: 'AP_TRN', o: 'AP_WRAP' } };
  const want = firReference({ coeffs: [vec], inW: 10, inF: 6, cF: 2, L: 4 }, calls, { w: 12, f: 8 }, { w: 10, f: 4 });
  for (const lang of LANGS) assert.deepEqual(alone(cfg, { lang, types, args: ARR, calls }).out, want, lang);
});

test('#1942 the module alone: ports of one bit (an array of two inputs, of one output; a bool config choosing of two sets)', () => {
  const cfg = { num_coeffs: 3, coeff_sets: 2, input_length: 2, output_length: 1, filter_type: C.decimation, decim_rate: 2, coeff_vec: [1, 2, 3, -3, 5, -7] };
  const calls = [0, 1, 1, 0, 1].map((set, c) => ({ x: xs(2, c, 16), set }));
  const types = { in: { w: 16, s: true }, out: { w: 24, s: true, ap: true, fx: true, f: 0, q: 'AP_TRN', o: 'AP_WRAP' }, config: { w: 1, s: false } };
  const want = firReference({ coeffs: [[1, 2, 3], [-3, 5, -7]], inW: 16, inF: 0, cF: 0, D: 2 }, calls, { w: 16, f: 0 }, { w: 24, f: 0 });
  for (const lang of LANGS) {
    const { gen, out } = alone(cfg, { lang, types, args: { ...ARR, config: { type: 'bool', ptr: false } }, calls });
    assert.deepEqual(out, want, lang);
    assert.deepEqual(gen.ports.filter((x) => /address0|config/.test(x.name)).map((x) => `${x.name} ${x.w}`), ['in_r_address0 1', 'out_r_address0 1', 'config_r 1'], lang);
  }
});

/** A design co-simulated in VHDL and Verilog: it passes, with no warning; its ports and latency. */
function cosim(src) {
  const out = {};
  for (const lang of LANGS) {
    const r = cosimulate(src, { file: 'fir.cpp', lang });
    assert.deepEqual([r.errors, r.sim.exitCode, r.pass], [[], 0, true], `${lang} ${JSON.stringify(r.mismatches.slice(0, 4), big)}`);
    assert.deepEqual(r.gen.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`), [], lang);
    out[lang] = { ports: r.gen.ports.map((x) => x.name), latency: r.latency, report: r.gen.report };
  }
  assert.deepEqual(out.vhdl.latency, out.verilog.latency);
  return out.vhdl;
}
const M = (o) => Object.entries(o).map(([k, v]) => (k === 'coeff_vec' ? `static constexpr double coeff_vec[${v.length}] = {${v.join(', ')}};`
  : typeof v === 'string' ? `static const unsigned ${k} = hls::ip_fir::${v};` : `static const unsigned ${k} = ${v};`));

test('#1942 co-simulated: single rate, decimation with its coefficient sets, interpolation; a top with no DATAFLOW running the filter its process too', () => {
  const single = cosim(firSource(M({ num_coeffs: 5, input_length: 8, output_length: 8, coeff_vec: [1, -2, 3, -2, 1] }), { inLen: 8, outLen: 8 }));
  assert.deepEqual([single.latency, single.report.processes.map((x) => x.instance)], [{ min: 82, max: 82, avg: 82 }, ['ap_fir_f_U0']]);
  const decim = cosim(firSource(M({ num_coeffs: 4, coeff_sets: 2, input_length: 12, output_length: 4, filter_type: 'decimation', decim_rate: 3, coeff_vec: [1, 2, 3, 4, -4, -3, -2, -1] }),
    { inLen: 12, outLen: 4, sets: 2, calls: 4 }));
  assert.deepEqual(decim.ports.slice(-1), ['config_r']);
  const interp = cosim(firSource(M({ num_coeffs: 6, input_length: 5, output_length: 10, filter_type: 'interpolation', interp_rate: 2, coeff_vec: [2, 5, -7, 9, 5, 2] }),
    { inLen: 5, outLen: 10, dataflow: false }));
  assert.equal(interp.ports.length, 26);
});

test('#1942 co-simulated: streams (ap_fifo, waiting while empty or full), a config stream read each call', () => {
  const s = cosim(firSource(M({ num_coeffs: 5, input_length: 8, output_length: 4, filter_type: 'decimation', decim_rate: 2, coeff_vec: [3, 1, 4, 1, 5] }), { inLen: 8, outLen: 4, stream: true, calls: 4 }));
  assert.deepEqual(s.ports.slice(6), ['in_r_dout', 'in_r_empty_n', 'in_r_read', 'out_r_din', 'out_r_full_n', 'out_r_write']);
  const src = firSource(M({ num_coeffs: 3, coeff_sets: 2, input_length: 4, output_length: 4, coeff_vec: [1, 2, 3, -3, -2, -1] }), { inLen: 4, outLen: 4, stream: true, calls: 4 })
    .replace('hls::stream<out_t> &out)', 'hls::stream<out_t> &out, hls::stream<ap_uint<8> > &config)').replace('f.run(in, out)', 'f.run(in, out, config)')
    .replace('hls::stream<out_t> b;', 'hls::stream<out_t> b; hls::stream<ap_uint<8> > k;').replace('dut(a, b);', 'k.write(c % 2); dut(a, b, k);');
  const cs = cosim(src);
  assert.deepEqual(cs.ports.slice(-3), ['config_r_dout', 'config_r_empty_n', 'config_r_read']);
});

test('#1942 the open synthesis (Yosys, Spartan-3E): one 18x18 multiplier, the coefficients and the delay line block RAMs, from the VHDL and from the Verilog, with no warning', async () => {
  // (256 taps of 16 bits: a block RAM each, the coefficients and the delay line)
  const vec = Array.from({ length: 256 }, (_, k) => ((k * 37) % 201) - 100);
  const cfg = { num_coeffs: 256, input_length: 64, output_length: 64, coeff_vec: vec };
  const types = { in: { w: 16, s: true }, out: { w: 24, s: true } };
  for (const lang of LANGS) {
    const { p } = firParams('cfg', fields(cfg));
    const gen = firHdl({ p, args: ARR }, { lang, module: 'fir_big', types });
    const design = elaborate(compile([{ path: `fir_big.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: gen.hdl }]), 'fir_big');
    const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
    assert.deepEqual([r.cells.MULT18X18, r.cells.RAMB16_S18], [1, 2], `${lang} ${JSON.stringify(r.cells)}`);
    assert.deepEqual(r.warnings, [], lang);
  }
});
