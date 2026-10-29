// Silinx HLS (#1942, core/hls-fir.js): hls_fir.h's hls::FIR, its parameters and its C model. The config struct's
// fields read with UG1399's defaults, checked (each parameter Silinx does not make refused, named); the full-precision
// width as PG149's; the C model run by the C simulation, its outputs those of the FIR computed from its definition
// (test/hls-fir-ref.js): single rate, decimation (coefficient sets chosen by the config), interpolation, quantize_only and
// fractional types, truncate_lsbs, a C integer's output, streams.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firParams, firPhases, firCModel, FIR_DEFAULTS, FIR_CONSTANTS } from '../core/hls-fir.js';
import { simulateC } from '../core/c-interp.js';
import { firReference, firSource } from './hls-fir-ref.js';

const fields = (o) => new Map(Object.entries(o).map(([k, v]) => [k, typeof v === 'number' && !['sample_period', 'sample_frequency', 'hardware_oversampling_rate'].includes(k) ? BigInt(v) : v]));
const C = FIR_CONSTANTS;
// (a decimator of the corpus's form, dsp-fir-decimator's: three sets of 7 coefficients, by 2, of our own values)
const DECIM = { input_length: 20, output_length: 10, num_coeffs: 7, coeff_sets: 3, sample_period: 0.5, filter_type: C.decimation, rate_change: C.integer, decim_rate: 2,
  coeff_vec: [5, -1, -3, 2, 4, 7, -5, -9, 21, 50, 70, 50, 21, -9, -7, 3, 6, -2, -5, 1, 8] };

test('#1942 the parameters: the config\'s fields, UG1399\'s defaults for the others; the phases; the full precision as PG149 computes it', () => {
  const { p, errors } = firParams('config1', fields(DECIM));
  assert.deepEqual(errors, []);
  const { coeffs, ...rest } = p;
  assert.deepEqual(rest, { name: 'config1', inW: 16, inF: 0, cW: 16, cF: 0, taps: 7, sets: 3, L: 1, D: 2, inLen: 20, outLen: 10, nt: 7, type: 'decimation', accW: 24, accF: 0, outW: 24, outF: 0 });
  assert.deepEqual(coeffs.map(Number), DECIM.coeff_vec);
  assert.equal(FIR_DEFAULTS.output_width, 24n);
  assert.equal(FIR_DEFAULTS.num_coeffs, 21n);
  // (interpolation by 3 of 7 taps: 3 taps a phase, h[p + 3k], 0 past the end)
  const i3 = firParams('c', fields({ num_coeffs: 7, input_length: 4, output_length: 12, filter_type: C.interpolation, interp_rate: 3, coeff_vec: [1, 2, 3, 4, 5, 6, 7] })).p;
  assert.deepEqual([i3.nt, i3.type, firPhases(i3).map(Number)], [3, 'interpolation', [1, 4, 7, 2, 5, 0, 3, 6, 0]]);
  // (full precision: input_width + ceil(log2(sum |h|)) of the widest phase, PG149's; 16 + 8 for the decimator's set 1, 230)
  const width = (vec, o = {}) => firParams('c', fields({ num_coeffs: vec.length, input_length: 8, output_length: 8, coeff_vec: vec, ...o })).p.accW;
  for (const [vec, o, w] of [[[1], {}, 16], [[2, 1], {}, 18], [[64, 64], {}, 23], [[-9, 21, 50, 70, 50, 21, -9], {}, 24], [[3, -3, 3], { input_width: 8 }, 12],
    [[1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], { input_width: 10 }, 14], [[100, 1, 100, 1], { filter_type: C.interpolation, interp_rate: 2, output_length: 16 }, 24]]) {
    assert.equal(width(vec, o), w, JSON.stringify(vec));
  }
  // (truncate_lsbs: output_width bits, the MSB the full precision's; full_precision ignores output_width)
  const t = firParams('c', fields({ ...DECIM, output_rounding_mode: C.truncate_lsbs, output_width: 18 })).p;
  assert.deepEqual([t.accW, t.outW, t.outF], [24, 18, -6]);
  assert.equal(firParams('c', fields({ ...DECIM, output_width: 8 })).p.outW, 24);
});

test('#1942 what Silinx does not make: refused, each parameter named with why', () => {
  const why = (o) => firParams('cfg', fields({ ...DECIM, ...o })).errors;
  assert.deepEqual(why({ reloadable: 1 }), ['hls::FIR<cfg>: reloadable = 1: coefficients reloaded at run time are not made by Silinx HLS yet']);
  assert.deepEqual(why({ filter_type: C.hilbert_filter }), ['hls::FIR<cfg>: filter_type = hilbert_filter: Silinx HLS makes single_rate, decimation and interpolation filters']);
  assert.deepEqual(why({ filter_type: C.interpolated }), ['hls::FIR<cfg>: filter_type = interpolated: Silinx HLS makes single_rate, decimation and interpolation filters']);
  assert.deepEqual(why({ rate_change: C.fixed_fractional }), ['hls::FIR<cfg>: rate_change = fixed_fractional: Silinx HLS makes integer rates only (rate_change = integer)']);
  assert.deepEqual(why({ zero_pack_factor: 2 }), ['hls::FIR<cfg>: zero_pack_factor = 2: Silinx HLS makes zero_pack_factor = 1 only']);
  assert.deepEqual(why({ quantization: C.maximize_dynamic_range }), ['hls::FIR<cfg>: quantization = maximize_dynamic_range: Silinx HLS makes integer_coefficients and quantize_only']);
  assert.deepEqual(why({ best_precision: 1 }), ['hls::FIR<cfg>: best_precision = 1: not made by Silinx HLS yet']);
  assert.deepEqual(why({ coeff_structure: C.half_band }), ['hls::FIR<cfg>: coeff_structure = half_band: half_band and hilbert filters are not made by Silinx HLS yet']);
  assert.deepEqual(why({ output_rounding_mode: C.convergent_rounding_to_even }), ['hls::FIR<cfg>: output_rounding_mode = convergent_rounding_to_even: Silinx HLS makes full_precision and truncate_lsbs (the rounding modes not yet)']);
  assert.deepEqual(why({ num_channels: 2 }), ['hls::FIR<cfg>: num_channels = 2: Silinx HLS makes one channel (num_channels = 1)']);
  assert.deepEqual(why({ num_paths: 2 }), ['hls::FIR<cfg>: num_paths = 2: Silinx HLS makes one path (num_paths = 1)']);
  assert.deepEqual(why({ data_sign: C.value_unsigned, coeff_sign: C.value_unsigned }), ['hls::FIR<cfg>: data_sign = value_unsigned: Silinx HLS makes signed data only (value_signed)',
    'hls::FIR<cfg>: coeff_sign = value_unsigned: Silinx HLS makes signed coefficients only (value_signed)']);
  assert.deepEqual(why({ output_length: 20 }), ['hls::FIR<cfg>: output_length = 20: input_length / decim_rate (10): the outputs of a call\'s inputs']);
  assert.deepEqual(why({ input_length: 21 }), ['hls::FIR<cfg>: input_length = 21: a multiple of decim_rate (2): each call gives whole outputs']);
  assert.deepEqual(why({ coeff_fractional_bits: 2 }), ['hls::FIR<cfg>: coeff_fractional_bits = 2: integer_coefficients have no fractional bits (quantize_only quantizes them)']);
  assert.deepEqual(why({ coeff_vec: [6, 0.5] }), ['hls::FIR<cfg>: coeff_vec[1] = 0.5 is not an integer: integer_coefficients are integers (quantize_only quantizes them)']);
  assert.deepEqual(why({ coeff_vec: [6, 40000] }), ['hls::FIR<cfg>: coeff_vec[1] = 40000 does not fit in coeff_width (16) bits']);
  assert.deepEqual(why({ coeff_vec: undefined }), ['hls::FIR<cfg>: coeff_vec is not given (static constexpr double coeff_vec[total_num_coeff] = { … };)']);
  // (the structure and speed of the hardware only: taken, Silinx's MAC its own)
  assert.deepEqual(why({ filter_arch: C.transpose_multiply_accumulate, optimization_goal: C.speed, coeff_structure: C.symmetric, sample_frequency: 100, config_sync_mode: C.on_packet }), []);
});

/** The C simulation of a design running the filter: each call's outputs (raw) and the reference's. */
function run(members, opts, ref, inT, outT) {
  const src = firSource(members, opts);
  const sim = simulateC(src, { file: 'fir.cpp' });
  assert.deepEqual([sim.ok, sim.error, sim.exitCode], [true, null, 0], src);
  assert.equal(sim.calls.length, opts.calls ?? 3);
  const ins = sim.calls.map((c, k) => ({ x: opts.stream ? c.streamIn.in : c.memIn.in, set: opts.sets ? k % opts.sets : 0 }));
  const got = sim.calls.map((c) => (opts.stream ? c.streamOut.out : c.memOut.out));
  assert.deepEqual(got, firReference(ref, ins, inT, outT));
  return { sim, got, ins };
}

const M = (o) => Object.entries(o).map(([k, v]) => (k === 'coeff_vec' ? `static constexpr double coeff_vec[${v.length}] = {${v.join(', ')}};`
  : typeof v === 'string' ? `static const unsigned ${k} = hls::ip_fir::${v};` : `static const unsigned ${k} = ${v};`));

test('#1942 the C model: single rate, its delay line kept across calls; the reference\'s outputs', () => {
  const h = [3, -1, 4, 1, -5, 9, 2, -6];
  const ref = { coeffs: [h], inW: 16, inF: 0, cF: 0 };
  const { got, ins } = run(M({ num_coeffs: 8, input_length: 12, output_length: 12, coeff_vec: h }), { inLen: 12, outLen: 12, calls: 4 }, ref, { w: 16, f: 0 }, { w: 24, f: 0 });
  // (the second call's outputs: its inputs and the first call's last seven, not its inputs alone)
  assert.notDeepEqual(got[1], firReference(ref, [ins[1]], { w: 16, f: 0 }, { w: 24, f: 0 })[0]);
});

test('#1942 the C model: decimation by 2 with three coefficient sets, the set the config\'s (the corpus\'s decimator)', () => {
  const sets = [DECIM.coeff_vec.slice(0, 7), DECIM.coeff_vec.slice(7, 14), DECIM.coeff_vec.slice(14)];
  const members = M({ input_length: 20, output_length: 10, num_coeffs: 7, coeff_sets: 3, filter_type: 'decimation', rate_change: 'integer', decim_rate: 2, coeff_vec: DECIM.coeff_vec });
  run(members, { inLen: 20, outLen: 10, sets: 3, calls: 6 }, { coeffs: sets, inW: 16, inF: 0, cF: 0, D: 2 }, { w: 16, f: 0 }, { w: 24, f: 0 });
  // (decimation by 4, its rate's phase: an output once each 4 inputs, at the fourth)
  const h4 = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  run(M({ input_length: 16, output_length: 4, num_coeffs: 9, filter_type: 'decimation', decim_rate: 4, coeff_vec: h4 }), { inLen: 16, outLen: 4 },
    { coeffs: [h4], inW: 16, inF: 0, cF: 0, D: 4 }, { w: 16, f: 0 }, { w: 24, f: 0 });
});

test('#1942 the C model: interpolation by 3, quantize_only coefficients and fractional types (the inputs in the parameters\' format)', () => {
  const h = [0.25, -0.5, 1.5, 3.2, 1.5, -0.5, 0.25];
  const members = M({ input_width: 12, input_fractional_bits: 8, coeff_width: 10, coeff_fractional_bits: 6, quantization: 'quantize_only', num_coeffs: 7,
    input_length: 8, output_length: 24, filter_type: 'interpolation', interp_rate: 3, coeff_vec: h });
  // (the array's type ap_fixed<14, 5>: 9 fractional bits, one dropped into the parameters' 8, its top bits wrapped into 12)
  run(members, { inT: 'ap_fixed<14, 5>', outT: 'ap_fixed<20, 8>', inLen: 8, outLen: 24, gen: '(i * 37 + c * 11) % 61 - 30', scale: '0.1171875' },
    { coeffs: [h], inW: 12, inF: 8, cF: 6, L: 3 }, { w: 14, f: 9 }, { w: 20, f: 12 });
});

test('#1942 the C model: truncate_lsbs (the LSBs past output_width dropped), a C integer\'s output (toward zero), streams', () => {
  const h = [37, -21, 90, 101, -77, 12];
  const base = { num_coeffs: 6, input_length: 10, output_length: 10, coeff_vec: h };
  const ref = { coeffs: [h], inW: 16, inF: 0, cF: 0 };
  // (full precision 16 + ceil(log2(338)) = 25 bits; 12 kept, 13 dropped)
  run(M({ ...base, output_rounding_mode: 'truncate_lsbs', output_width: 12 }), { inLen: 10, outLen: 10, outT: 'ap_fixed<12, 25>' },
    { ...ref, accW: 25, outW: 12 }, { w: 16, f: 0 }, { w: 12, f: -13 });
  // (an ap_fixed with fractional bits into an int: toward zero)
  run(M({ ...base, input_width: 12, input_fractional_bits: 4 }), { inT: 'ap_fixed<12, 8>', outT: 'int', inLen: 10, outLen: 10, scale: '0.3125' },
    { ...ref, inW: 12, inF: 4 }, { w: 12, f: 4 }, { w: 32, f: 0, int: true });
  run(M(base), { inLen: 10, outLen: 10, stream: true }, ref, { w: 16, f: 0 }, { w: 24, f: 0 });
});

test('#1942 the C model\'s text: its statics (the delay line, the coefficients by set and phase), its loops', () => {
  const { p } = firParams('c', fields({ num_coeffs: 3, input_length: 2, output_length: 4, filter_type: C.interpolation, interp_rate: 2, coeff_vec: [1, 2, 3] }));
  assert.equal(firCModel('ap_fir_f', p, { in: { type: 'in_t', stream: false }, out: { type: 'out_t', stream: false }, config: null }), `static void ap_fir_f(in_t in[2], out_t out[4]) {
  static ap_fixed<16, 16> ap_x[2];
  static const ap_fixed<16, 16> ap_h[4] = {1, 3, 2, 0};
  int ap_s = 0;
  int ap_o = 0;
  for (int ap_i = 0; ap_i < 2; ap_i++) {
    for (int ap_k = 1; ap_k > 0; ap_k--) ap_x[ap_k] = ap_x[ap_k - 1];
    ap_x[0] = in[ap_i];
    for (int ap_p = 0; ap_p < 2; ap_p++) {
      ap_fixed<18, 18> ap_acc = 0;
      for (int ap_k = 0; ap_k < 2; ap_k++) ap_acc += ap_h[(ap_s * 2 + ap_p) * 2 + ap_k] * ap_x[ap_k];
      out[ap_o] = ap_acc;
      ap_o++;
    }
  }
}`);
});
