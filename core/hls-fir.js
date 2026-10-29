// Silinx HLS (#1942): hls_fir.h's hls::FIR<config>, the FIR filter of Vitis HLS's DSP library (AMD's FIR Compiler,
// PG149): its static parameters, read from the config struct (derived from hls::ip_fir::params_t, the fields and
// defaults as UG1399 and PG149 describe them), checked; the filter's numbers (its phases, its full-precision width);
// its C model, the C++ function the C simulation runs for its run() (core/cpp-fir.js puts it in the source).
// Single rate, decimation and interpolation by an integer rate; one channel; coefficient sets chosen by the config
// argument. The filter, as the FIR Compiler computes it:
//   single rate     y[n] = sum_k h[k] x[n - k]
//   decimation D    the single rate's y at n = mD + D - 1 (an output once each D inputs are in)
//   interpolation L y[nL + p] = sum_k h[p + kL] x[n - k] (the inputs with L - 1 zeros between them, filtered)
// each input taken in the parameters' format (ap_fixed<input_width, input_width - input_fractional_bits>), the sums
// in full precision (the fewest bits holding every sum of the inputs' range times the coefficients, its fractional
// bits the input's and the coefficients'), truncate_lsbs dropping the LSBs beyond output_width; then the output's
// type takes the value (an ap_fixed conversion). Isomorphic ES module.
//
//   firParams(name, fields) -> { p, errors: [message] }   fields: Map name -> number (an integer field a BigInt, a
//     double a number; coeff_vec an array of numbers)
//   firPhases(p) -> [BigInt]: the coefficients by set, phase and tap ((set * L + phase) * nt + tap, nt the taps of a
//     phase), 0 past the end
//   firCModel(fn, p, args) -> the C++ text of the function fn(in, out[, config])

// hls::ip_fir's constants (the options of PG149's parameters, in their order)
export const FIR_CONSTANTS = {
  single_rate: 0, interpolation: 1, decimation: 2, hilbert_filter: 3, interpolated: 4,
  integer: 0, fixed_fractional: 1,
  frequency: 0, period: 1, input_period: 2, output_period: 3,
  integer_coefficients: 0, quantize_only: 1, maximize_dynamic_range: 2,
  inferred: 0, non_symmetric: 1, symmetric: 2, negative_symmetric: 3, half_band: 4, hilbert: 5,
  full_precision: 0, truncate_lsbs: 1, non_symmetric_rounding_to_zero: 2, non_symmetric_rounding_to_infinity: 3,
  symmetric_rounding_to_zero: 4, symmetric_rounding_to_infinity: 5, convergent_rounding_to_even: 6, convergent_rounding_to_odd: 7,
  systolic_multiply_accumulate: 0, transpose_multiply_accumulate: 1,
  area: 0, speed: 1,
  on_vector: 0, on_packet: 1,
  single: 0, by_channel: 1,
  value_signed: 0, value_unsigned: 1,
};
const C = FIR_CONSTANTS;
const nameOf = (field, v) => {
  const groups = { filter_type: ['single_rate', 'interpolation', 'decimation', 'hilbert_filter', 'interpolated'], rate_change: ['integer', 'fixed_fractional'],
    quantization: ['integer_coefficients', 'quantize_only', 'maximize_dynamic_range'], coeff_structure: ['inferred', 'non_symmetric', 'symmetric', 'negative_symmetric', 'half_band', 'hilbert'],
    output_rounding_mode: Object.keys(C).slice(Object.keys(C).indexOf('full_precision'), Object.keys(C).indexOf('convergent_rounding_to_odd') + 1),
    data_sign: ['value_signed', 'value_unsigned'], coeff_sign: ['value_signed', 'value_unsigned'] };
  return groups[field]?.[Number(v)] ?? String(v);
};

// hls::ip_fir::params_t's fields and their defaults (UG1399's FIR static parameters); coeff_vec has none
export const FIR_DEFAULTS = {
  input_width: 16n, input_fractional_bits: 0n, output_width: 24n, output_fractional_bits: 0n, coeff_width: 16n, coeff_fractional_bits: 0n,
  num_coeffs: 21n, coeff_sets: 1n, input_length: 21n, output_length: 21n, num_channels: 1n, reloadable: 0n,
  filter_type: 0n, rate_change: 0n, interp_rate: 1n, decim_rate: 1n, zero_pack_factor: 1n, rate_specification: 1n,
  hardware_oversampling_rate: 1, sample_period: 1, sample_frequency: 0.001,
  quantization: 0n, best_precision: 0n, coeff_structure: 1n, output_rounding_mode: 0n, filter_arch: 0n, optimization_goal: 0n,
  inter_column_pipe_length: 4n, column_config: 1n, config_sync_mode: 0n, config_method: 0n, coeff_padding: 0n, num_paths: 1n,
  data_sign: 0n, coeff_sign: 0n,
};
const MAX_TAPS = 1024;

/** The parameters of the config struct `name` from its fields (the defaults for those it does not set): { p, errors }. */
export function firParams(name, fields) {
  const errors = [];
  const f = (k) => (fields.has(k) ? fields.get(k) : FIR_DEFAULTS[k]);
  const n = (k) => Number(f(k));
  const refuse = (k, why) => errors.push(`hls::FIR<${name}>: ${k} = ${nameOf(k, f(k))}: ${why}`);
  // what Silinx does not make, each named (the fields that set the hardware's speed and structure only, not what it
  // computes, taken: filter_arch, optimization_goal, sample_period…; Silinx's MAC its own)
  if (n('reloadable')) refuse('reloadable', 'coefficients reloaded at run time are not made by Silinx HLS yet');
  if (![C.single_rate, C.interpolation, C.decimation].includes(n('filter_type'))) refuse('filter_type', 'Silinx HLS makes single_rate, decimation and interpolation filters');
  if (n('rate_change') !== C.integer) refuse('rate_change', 'Silinx HLS makes integer rates only (rate_change = integer)');
  if (n('zero_pack_factor') !== 1) refuse('zero_pack_factor', 'Silinx HLS makes zero_pack_factor = 1 only');
  if (![C.integer_coefficients, C.quantize_only].includes(n('quantization'))) refuse('quantization', 'Silinx HLS makes integer_coefficients and quantize_only');
  if (n('best_precision')) refuse('best_precision', 'not made by Silinx HLS yet');
  if ([C.half_band, C.hilbert].includes(n('coeff_structure'))) refuse('coeff_structure', 'half_band and hilbert filters are not made by Silinx HLS yet');
  if (![C.full_precision, C.truncate_lsbs].includes(n('output_rounding_mode'))) refuse('output_rounding_mode', 'Silinx HLS makes full_precision and truncate_lsbs (the rounding modes not yet)');
  if (n('num_channels') !== 1) refuse('num_channels', 'Silinx HLS makes one channel (num_channels = 1)');
  if (n('num_paths') !== 1) refuse('num_paths', 'Silinx HLS makes one path (num_paths = 1)');
  if (n('data_sign') !== C.value_signed) refuse('data_sign', 'Silinx HLS makes signed data only (value_signed)');
  if (n('coeff_sign') !== C.value_signed) refuse('coeff_sign', 'Silinx HLS makes signed coefficients only (value_signed)');
  const inW = n('input_width'), inF = n('input_fractional_bits'), cW = n('coeff_width'), cF = n('coeff_fractional_bits');
  for (const k of ['input_width', 'coeff_width']) if (n(k) < 1 || n(k) > 64) refuse(k, 'from 1 to 64 bits');
  if (inF < 0 || inF > inW) refuse('input_fractional_bits', `from 0 to input_width (${inW})`);
  if (cF < 0 || cF > cW) refuse('coeff_fractional_bits', `from 0 to coeff_width (${cW})`);
  if (n('quantization') === C.integer_coefficients && cF !== 0) refuse('coeff_fractional_bits', 'integer_coefficients have no fractional bits (quantize_only quantizes them)');
  const taps = n('num_coeffs'), sets = n('coeff_sets');
  if (taps < 1 || taps > MAX_TAPS) refuse('num_coeffs', `from 1 to ${MAX_TAPS}`);
  if (sets < 1 || sets > 256) refuse('coeff_sets', 'from 1 to 256');
  const type = n('filter_type');
  const L = type === C.interpolation ? n('interp_rate') : 1, D = type === C.decimation ? n('decim_rate') : 1;
  if (L < 1 || L > 64) refuse('interp_rate', 'from 1 to 64');
  if (D < 1 || D > 64) refuse('decim_rate', 'from 1 to 64');
  const inLen = n('input_length'), outLen = n('output_length');
  // (the rates' lengths, once the filter is one Silinx makes)
  if (errors.length) return { p: null, errors };
  if (inLen < 1) refuse('input_length', 'at least 1');
  else if (inLen % D) refuse('input_length', `a multiple of decim_rate (${D}): each call gives whole outputs`);
  else if (outLen !== (inLen * L) / D) refuse('output_length', `input_length${L > 1 ? ` * interp_rate` : ''}${D > 1 ? ' / decim_rate' : ''} (${(inLen * L) / D}): the outputs of a call's inputs`);
  // the coefficients, quantized as the FIR Compiler takes them
  const vec = fields.get('coeff_vec');
  const raw = [];
  if (!Array.isArray(vec)) errors.push(`hls::FIR<${name}>: coeff_vec is not given (static constexpr double coeff_vec[total_num_coeff] = { … };)`);
  else if (!errors.length) {
    const lim = 2 ** (cW - 1);
    for (let k = 0; k < taps * sets; k++) {
      const c = vec[k] ?? 0;
      const q = n('quantization') === C.integer_coefficients ? c : Math.round(c * 2 ** cF);
      if (!Number.isInteger(q)) { errors.push(`hls::FIR<${name}>: coeff_vec[${k}] = ${c} is not an integer: integer_coefficients are integers (quantize_only quantizes them)`); break; }
      if (q < -lim || q >= lim) { errors.push(`hls::FIR<${name}>: coeff_vec[${k}] = ${c} does not fit in coeff_width (${cW}) bits${cF ? ` with ${cF} fractional` : ''}`); break; }
      raw.push(BigInt(q));
    }
  }
  if (errors.length) return { p: null, errors };
  const p = { name, inW, inF, cW, cF, taps, sets, L, D, inLen, outLen, coeffs: raw, nt: Math.ceil(taps / L),
    type: type === C.interpolation ? 'interpolation' : type === C.decimation ? 'decimation' : 'single_rate' };
  p.accW = fullPrecision(p);
  p.accF = inF + cF;
  // (truncate_lsbs: the LSBs past output_width dropped, the MSB the full precision's)
  const outW = n('output_width');
  p.outW = n('output_rounding_mode') === C.truncate_lsbs && outW < p.accW ? Math.max(outW, 1) : p.accW;
  p.outF = p.accF - (p.accW - p.outW);
  return { p, errors: [] };
}

/** The coefficients by set, phase and tap ((set * L + phase) * nt + tap): h[p + kL] of the set, 0 past its end. */
export function firPhases(p) {
  const out = [];
  for (let s = 0; s < p.sets; s++) for (let ph = 0; ph < p.L; ph++) for (let k = 0; k < p.nt; k++) {
    const j = ph + k * p.L;
    out.push(j < p.taps ? p.coeffs[s * p.taps + j] : 0n);
  }
  return out;
}

/** The full precision's width: the fewest bits (signed) holding every sum of a phase's taps times inputs of the input's
 *  range. */
function fullPrecision(p) {
  const ph = firPhases(p);
  const top = 1n << BigInt(p.inW - 1);
  let hi = 0n, lo = 0n;
  for (let s = 0; s < ph.length; s += p.nt) {
    let mx = 0n, mn = 0n;
    for (const a of ph.slice(s, s + p.nt)) {
      if (a > 0n) { mx += a * (top - 1n); mn -= a * top; } else { mx += -a * top; mn -= -a * (top - 1n); }
    }
    if (mx > hi) hi = mx;
    if (mn < lo) lo = mn;
  }
  let w = 1;
  while (hi > (1n << BigInt(w - 1)) - 1n || lo < -(1n << BigInt(w - 1))) w++;
  return w;
}

const fixed = (w, f) => `ap_fixed<${w}, ${w - f}>`;
/** A coefficient's value (raw / 2^f), exact (a double holds it). */
const value = (raw, f) => String(Number(raw) / 2 ** f);

/** The C model: the C++ function fn(in, out[, config]) the C simulation runs for a run(); args: { in, out, config }
 *  each { type (its element's type, C++ text), stream } (config null when not given, its type a pointer's or a value's
 *  { type, ptr }). The delay line and the coefficients its statics; a call reads input_length inputs and writes
 *  output_length outputs. */
export function firCModel(fn, p, args) {
  const { nt, L, D } = p;
  const ph = firPhases(p);
  const par = (x, n, len) => (x.stream ? `hls::stream<${x.type}> &${n}` : `${x.type} ${n}[${len}]`);
  const cfg = args.config ? (args.config.stream ? `, hls::stream<${args.config.type}> &config` : `, ${args.config.type} ${args.config.ptr ? '*' : ''}config`) : '';
  const set = !args.config || p.sets === 1 ? '0' : args.config.stream ? 'config.read()' : args.config.ptr ? '*config' : 'config';
  const L0 = [`static void ${fn}(${par(args.in, 'in', p.inLen)}, ${par(args.out, 'out', p.outLen)}${cfg}) {`,
    `  static ${fixed(p.inW, p.inF)} ap_x[${nt}];`,
    `  static const ${fixed(p.cW, p.cF)} ap_h[${ph.length}] = {${ph.map((c) => value(c, p.cF)).join(', ')}};`,
    `  int ap_s = ${set};`,
    // (a config stream read in every call, its value used when the filter has sets)
    ...(args.config?.stream && p.sets === 1 ? ['  config.read();'] : []),
    '  int ap_o = 0;',
    `  for (int ap_i = 0; ap_i < ${p.inLen}; ap_i++) {`,
    ...(nt > 1 ? [`    for (int ap_k = ${nt - 1}; ap_k > 0; ap_k--) ap_x[ap_k] = ap_x[ap_k - 1];`] : []),
    `    ap_x[0] = ${args.in.stream ? 'in.read()' : 'in[ap_i]'};`];
  const body = [`${fixed(p.accW, p.accF)} ap_acc = 0;`,
    `for (int ap_k = 0; ap_k < ${nt}; ap_k++) ap_acc += ap_h[(ap_s * ${L} + ap_p) * ${nt} + ap_k] * ap_x[ap_k];`];
  const y = p.outW < p.accW ? 'ap_y' : 'ap_acc';
  if (p.outW < p.accW) body.push(`${fixed(p.outW, p.outF)} ap_y = ap_acc;`);
  body.push(args.out.stream ? `${args.out.type} ap_v = ${y};` : `out[ap_o] = ${y};`, ...(args.out.stream ? ['out.write(ap_v);'] : []), 'ap_o++;');
  const ind = D > 1 ? '        ' : '      ';
  const loop = [`for (int ap_p = 0; ap_p < ${L}; ap_p++) {`, ...body.map((s) => `  ${s}`), '}'];
  if (D > 1) L0.push(`    if (ap_i % ${D} == ${D - 1}) {`, ...loop.map((s) => `${ind.slice(2)}${s}`), '    }');
  else L0.push(...loop.map((s) => `    ${s}`));
  L0.push('  }', '}');
  return L0.join('\n');
}
