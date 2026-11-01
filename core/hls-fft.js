// Silinx HLS (#1943): hls_fft.h's hls::fft<config>, the FFT of Vitis HLS's DSP library (AMD's FFT LogiCORE, PG109): its
// static parameters, read from the config struct (derived from hls::ip_fft::params_t or ssr_params_t, the fields and
// defaults of Silinx's hls_fft.h, core/cpp-headers.js), checked; the transform itself, bit-exact with Vitis HLS's C
// model on the corpus's stimulus and golden files (the fixed point); its C model, the C++ function the C simulation
// runs for the call (core/cpp-fft.js puts it in the source), the transform an intrinsic of the C simulation.
//
// The fixed-point transform, pipelined_streaming_io, scaled, truncation, as AMD's C model computes it (found against its
// golden files, every value of the corpus's 20 frames): N = 4^S points, S radix-4 stages of decimation in frequency, the
// scaling schedule's 2 bits a stage (the first stage's the LSBs), the output in bit-reversed order (natural_order:
// reordered). A stage's group of four (a, b, c, d) spaced L / 4 apart (L the stage's length, N, N / 4, … 4):
//   the butterfly in full precision: a + c, a - c, b + d, b - d; then y0 = (a + c) + (b + d), y2 = (a + c) - (b + d),
//   y1 = (a - c) - j (b - d), y3 = (a - c) + j (b - d) (forward; inverse +j and -j);
//   y_j's twiddle W^(j k) (k the group's place in its block, W = e^(-2 pi i / L) forward, e^(+2 pi i / L) inverse): its
//   table round(cos * 2^15), round(sin * 2^15), at most 2^15 - 1, of N entries (phase_factor_width 16); the product
//   (x wr - y wi, x wi + y wr) rounded half up at its bit 10 (5 bits more than the 15 of the table) and then truncated
//   by 5 + the stage's scaling (one rounding: (p + 2^9) >> (15 + s)); a quarter turn (j k = L / 4) an exact rotation,
//   no twiddle (as the last stage's), the value truncated by the stage's scaling;
//   each value kept in input_width bits (wrapped), an overflow said by ovflo.
// The floating-point transform (use_native_float), found against AMD's golden files (#2309; its C model is closed): every
// value of the corpus's 1024-point, SSR 2 forward frames. Unscaled, natural order, radix-2 decimation in frequency in
// float, each operation rounded to nearest: a stage's pair a, b gives a + b and (a - b) W^k (W = e^(-2 pi i / L) forward,
// e^(+2 pi i / L) inverse), the product (x wr - y wi, x wi + y wr) of four multiplies, not fused; W's cos and sin those of
// double truncated toward zero to float (not rounded); k = 0 no twiddle, k = L / 4 an exact rotation. Other lengths, other
// super sample rates and the inverse follow the same rules, with no golden file to check them against. Isomorphic ES module.
//
//   fftParams(name, fields, base) -> { p, errors: [message] }   fields: Map name -> BigInt (a bool 0n / 1n); base the
//     struct the config derives from, 'params_t' or 'ssr_params_t'
//   fftFixed(re, im, p, fwd, sch) -> overflow (0 / 1): the transform in place, re and im arrays of N integers
//   fftFloat(re, im, p) -> the transform in place, of doubles held as floats
//   fftTwiddles(p) -> { cos, sin }: the fixed point's tables, N entries
//   fftCModel(fn, p, args) -> the C++ text of the function fn(xn, xk[, dir[, sch[, cp[, ovflo]]]]), its
//     complex values' members ap_re and ap_im (core/cpp-hls-lib.js's); a stream of hls::vector (args.xn.lanes, an SSR
//     design's super_sample_rate values a word, #2309) read and written a word at a time

import { CPP_OWN_HEADERS } from './cpp-headers.js';

// hls::ip_fft's constants and the structs' fields and defaults, read from Silinx's hls_fft.h (core/cpp-headers.js)
const HEADER = CPP_OWN_HEADERS['hls_fft.h'];
export const FFT_CONSTANTS = Object.fromEntries([...HEADER.matchAll(/enum \w+ \{([^}]*)\}/g)].flatMap((m) => [...m[1].matchAll(/(\w+) = (\d+)/g)].map((x) => [x[1], Number(x[2])])));
const fieldsOf = (body) => Object.fromEntries([...body.matchAll(/static const (unsigned|bool) (\w+) = (\w+);/g)]
  .map(([, , name, v]) => [name, v === 'false' ? 0n : v === 'true' ? 1n : /^\d+$/.test(v) ? BigInt(v) : BigInt(FFT_CONSTANTS[v])]));
const structBody = (name) => new RegExp(`struct ${name}[^{]*\\{([^}]*)\\}`).exec(HEADER)[1];
export const FFT_DEFAULTS = fieldsOf(structBody('params_t'));
export const FFT_SSR_DEFAULTS = { ...FFT_DEFAULTS, ...fieldsOf(structBody('ssr_params_t')) };
// UG1399's names of the fields (AMD's examples' header names them as Silinx's does)
export const FFT_ALIASES = { log2_transform_length: 'max_nfft', run_time_configurable_transform_length: 'has_nfft', implementation_options: 'arch_opt',
  scaling_options: 'scaling_opt', rounding_modes: 'rounding_opt', super_sample_rates: 'super_sample_rate', ordering_opt: 'output_ordering' };
const C = FFT_CONSTANTS;
const nameOf = (field, v) => {
  const groups = { arch_opt: ['automatically_select', 'radix_4_burst_io', 'radix_2_burst_io', 'pipelined_streaming_io', 'radix_2_lite_burst_io'],
    scaling_opt: ['scaled', 'unscaled', 'block_floating_point'], rounding_opt: ['truncation', 'convergent_rounding'] };
  return groups[field]?.[Number(v)] ?? String(v);
};

/** The parameters of the config struct `name` from its fields (the base's defaults for those it does not set). */
export function fftParams(name, fields, base = 'params_t') {
  const errors = [];
  const defs = base === 'ssr_params_t' ? FFT_SSR_DEFAULTS : FFT_DEFAULTS;
  const f = (k) => (fields.has(k) ? fields.get(k) : defs[k]);
  const n = (k) => Number(f(k));
  const refuse = (k, why) => errors.push(`hls::fft<${name}>: ${k} = ${nameOf(k, f(k))}: ${why}`);
  const nfft = n('max_nfft'), N = 2 ** nfft, float = !!n('use_native_float'), ssr = n('super_sample_rate');
  if (nfft < 3 || nfft > 16) refuse('max_nfft', 'from 3 to 16 (8 to 65536 points)');
  if (n('has_nfft')) refuse('has_nfft', 'a transform length set at run time is not made by Silinx HLS yet');
  if (n('channels') !== 1) refuse('channels', 'Silinx HLS makes one channel (channels = 1)');
  if (n('cyclic_prefix_insertion')) refuse('cyclic_prefix_insertion', 'not made by Silinx HLS yet');
  if (n('xk_index')) refuse('xk_index', 'not made by Silinx HLS yet');
  if (![1, 2, 4, 8, 16, 32, 64].includes(ssr)) refuse('super_sample_rate', '1, 2, 4, 8, 16, 32 or 64');
  if (!float) {
    // (the fixed point: what Silinx's transform is checked to be AMD's, bit for bit)
    if (ssr !== 1) refuse('super_sample_rate', 'a fixed-point FFT of a super sample rate is not made by Silinx HLS yet');
    if (n('arch_opt') !== C.pipelined_streaming_io) refuse('arch_opt', 'Silinx HLS makes pipelined_streaming_io (the burst architectures\' arithmetic not yet)');
    if (n('scaling_opt') !== C.scaled) refuse('scaling_opt', 'Silinx HLS makes scaled transforms only (unscaled and block_floating_point not yet)');
    if (n('rounding_opt') !== C.truncation) refuse('rounding_opt', 'Silinx HLS makes truncation only (convergent_rounding not yet)');
    if (n('phase_factor_width') !== 16) refuse('phase_factor_width', 'Silinx HLS makes 16-bit phase factors only');
    if (n('input_width') < 8 || n('input_width') > 16) refuse('input_width', 'from 8 to 16 bits');
    if (n('output_width') !== n('input_width')) refuse('output_width', `input_width (${n('input_width')}): a scaled transform's output is as wide as its input`);
    if (nfft % 2 && nfft >= 3 && nfft <= 16) refuse('max_nfft', 'an even max_nfft (radix-4 stages: 16, 64, 256, … points); an odd one\'s radix-2 stage is not made by Silinx HLS yet');
  }
  if (errors.length) return { p: null, errors };
  const p = { name, nfft, N, float, ssr, inW: n('input_width'), outW: n('output_width'), natural: n('output_ordering') === C.natural_order, ovflo: !!n('ovflo'),
    inverse: !!n('systolicfft_inv'), stages: Math.floor(nfft / 2) };
  return { p, errors: [] };
}

/** The bit-reversed index of i, of b bits. */
export const bitrev = (i, b) => { let r = 0; for (let k = 0; k < b; k++) { r = (r << 1) | (i & 1); i >>= 1; } return r; };

/** The fixed point's twiddle tables: round(cos * 2^15) and round(sin * 2^15) of 2 pi e / N, at most 2^15 - 1. */
export function fftTwiddles(p) {
  const cos = [], sin = [];
  for (let e = 0; e < p.N; e++) {
    const a = (2 * Math.PI * e) / p.N;
    cos.push(Math.min(32767, Math.round(Math.cos(a) * 32768)));
    sin.push(Math.min(32767, Math.round(Math.sin(a) * 32768)));
  }
  return { cos, sin };
}

/** The fixed-point transform in place (re, im: N integers of input_width bits); fwd 1 forward, 0 inverse; sch the
 *  scaling schedule. Its overflow: 1 when a value did not fit input_width bits (it wraps). */
export function fftFixed(re, im, p, fwd, sch) {
  const { N } = p, tw = fftTwiddles(p);
  const half = 2 ** (p.inW - 1), full = 2 * half;
  let over = 0;
  const keep = (v) => {
    if (v >= half || v < -half) { over = 1; return ((((v + half) % full) + full) % full) - half; }
    return v;
  };
  const fl = Math.floor;
  for (let L = N, st = 0; L >= 4; L /= 4, st++) {
    const s = Number((BigInt(sch) >> BigInt(2 * st)) & 3n), q = L / 4, P = 2 ** (15 + s), S = 2 ** s;
    for (let b = 0; b < N; b += L) for (let k = 0; k < q; k++) {
      const i = [b + k, b + k + q, b + k + 2 * q, b + k + 3 * q];
      const a0 = re[i[0]] + re[i[2]], a1 = im[i[0]] + im[i[2]], b0 = re[i[1]] + re[i[3]], b1 = im[i[1]] + im[i[3]];
      const c0 = re[i[0]] - re[i[2]], c1 = im[i[0]] - im[i[2]], d0 = re[i[1]] - re[i[3]], d1 = im[i[1]] - im[i[3]];
      const jr = fwd ? d1 : -d1, ji = fwd ? -d0 : d0;
      const ys = [[a0 + b0, a1 + b1], [c0 + jr, c1 + ji], [a0 - b0, a1 - b1], [c0 - jr, c1 - ji]];
      // (y0 to the first quarter, y2 to the second, y1 the third, y3 the fourth: the output bit-reversed)
      const place = [0, 2, 1, 3];
      for (let j = 0; j < 4; j++) {
        let [x, y] = ys[j];
        const e = j * k;
        if (L > 4 && e && (4 * e) % L === 0) [x, y] = fwd ? [fl(y / S), fl(-x / S)] : [fl(-y / S), fl(x / S)];
        else if (L > 4 && e) {
          const t = e * (N / L), wr = tw.cos[t], wi = fwd ? -tw.sin[t] : tw.sin[t];
          [x, y] = [fl((x * wr - y * wi + 512) / P), fl((x * wi + y * wr + 512) / P)];
        } else [x, y] = [fl(x / S), fl(y / S)];
        re[i[place[j]]] = keep(x);
        im[i[place[j]]] = keep(y);
      }
    }
  }
  if (p.natural) reorder(re, im, p.nfft);
  return over;
}

/** The bit-reversed order made natural, in place. */
function reorder(re, im, b) {
  for (let i = 0; i < re.length; i++) {
    const r = bitrev(i, b);
    if (r > i) { [re[i], re[r]] = [re[r], re[i]]; [im[i], im[r]] = [im[r], im[i]]; }
  }
}

// (a float's bits, to step one toward zero)
const F32 = new Float32Array(1), U32 = new Uint32Array(F32.buffer);
/** The double v as a float, truncated toward zero. */
const floatTowardZero = (v) => {
  F32[0] = v;
  if (Math.abs(F32[0]) > Math.abs(v)) U32[0]--;
  return F32[0];
};

/** The floating-point transform in place, natural order, unscaled (forward, or inverse: systolicfft_inv). */
export function fftFloat(re, im, p) {
  const f = Math.fround, { N } = p, sg = p.inverse ? 1 : -1;
  for (let L = N; L >= 2; L /= 2) {
    const h = L / 2;
    for (let b = 0; b < N; b += L) for (let k = 0; k < h; k++) {
      const i = b + k, j = i + h;
      const ar = f(re[i] + re[j]), ai = f(im[i] + im[j]), dr = f(re[i] - re[j]), di = f(im[i] - im[j]);
      re[i] = ar; im[i] = ai;
      if (!k) { re[j] = dr; im[j] = di; continue; }
      if (4 * k === L) { re[j] = -sg * di; im[j] = sg * dr; continue; }
      const a = (sg * 2 * Math.PI * k) / L, wr = floatTowardZero(Math.cos(a)), wi = floatTowardZero(Math.sin(a));
      re[j] = f(f(dr * wr) - f(di * wi));
      im[j] = f(f(dr * wi) + f(di * wr));
    }
  }
  reorder(re, im, p.nfft);
}

/** The C model: the C++ function fn the C simulation runs for the call; args: { xn, xk } each { type (its element's
 *  type, C++ text), stream, lanes (a stream of hls::vector's: its size, else 0) }, given: how many of the call's arguments (fwd_inv, scale_sch, cp_len, ovflo) it has, with
 *  their types (C++ text). The values copied into arrays of integers (input_width bits, as the core takes them: an
 *  ap_fixed<input_width, 1>'s) or of floats, the transform run by the C simulation (ap_fft_core, core/c-interp-lib.js),
 *  the results copied out. */
export function fftCModel(fn, p, args) {
  const { N } = p, sc = 2 ** (p.inW - 1);
  const word = (x) => (x.lanes ? `ap_vector<${x.type}, ${x.lanes}>` : x.type);
  const par = (x, nm) => (x.stream ? `hls::stream<${word(x)} > &${nm}` : `${x.type} ${nm}[${N}]`);
  const more = args.more.map((m, i) => `, ${m} ap_a${i}`).join('');
  const el = p.float ? 'double' : 'long long';
  const into = p.float ? (x) => `(double)(${x})` : (x) => `(long long)floor((double)(${x}) * ${sc}.0)`;
  const back = p.float ? (x) => x : (x) => `${x} / ${sc}.0`;
  // (fwd_inv: the fixed point's direction, 1 forward; scale_sch: the schedule; a float's direction its config's)
  const fwd = p.float ? (p.inverse ? '0' : '1') : args.more.length > 0 ? '(ap_a0 ? 1 : 0)' : '0';
  const sch = !p.float && args.more.length > 1 ? '(long long)ap_a1' : '-1';
  // (a stream of hls::vector, #2309: a word of lanes values, in the order of the samples)
  const load = args.xn.lanes
    ? [`  for (int ap_i = 0; ap_i < ${N}; ap_i += ${args.xn.lanes}) {`, `    ${word(args.xn)} ap_w = xn.read();`,
      `    for (int ap_j = 0; ap_j < ${args.xn.lanes}; ap_j++) {`,
      `      ap_re[ap_i + ap_j] = ${into('ap_w.ap_d[ap_j].ap_re')};`, `      ap_im[ap_i + ap_j] = ${into('ap_w.ap_d[ap_j].ap_im')};`, '    }', '  }']
    : [`  for (int ap_i = 0; ap_i < ${N}; ap_i++) {`,
      `    ${args.xn.type} ap_v = ${args.xn.stream ? 'xn.read()' : 'xn[ap_i]'};`,
      `    ap_re[ap_i] = ${into('ap_v.ap_re')};`, `    ap_im[ap_i] = ${into('ap_v.ap_im')};`, '  }'];
  const store = args.xk.lanes
    ? [`  for (int ap_i = 0; ap_i < ${N}; ap_i += ${args.xk.lanes}) {`, `    ${word(args.xk)} ap_w;`,
      `    for (int ap_j = 0; ap_j < ${args.xk.lanes}; ap_j++) {`,
      `      ap_w.ap_d[ap_j].ap_re = ${back('ap_re[ap_i + ap_j]')};`, `      ap_w.ap_d[ap_j].ap_im = ${back('ap_im[ap_i + ap_j]')};`, '    }', '    xk.write(ap_w);', '  }']
    : [`  for (int ap_i = 0; ap_i < ${N}; ap_i++) {`,
      `    ${args.xk.type} ap_v;`, `    ap_v.ap_re = ${back('ap_re[ap_i]')};`, `    ap_v.ap_im = ${back('ap_im[ap_i]')};`,
      args.xk.stream ? '    xk.write(ap_v);' : '    xk[ap_i] = ap_v;', '  }'];
  const L = [`static void ${fn}(${par(args.xn, 'xn')}, ${par(args.xk, 'xk')}${more}) {`,
    `  static ${el} ap_re[${N}], ap_im[${N}];`, ...load,
    `  int ap_o = ap_fft_core(ap_re, ap_im, ${p.nfft}, ${p.inW}, ${fwd}, ${sch}, ${p.natural ? 1 : 0}, ${p.float ? 1 : 0});`,
    ...store,
    ...(args.more.length > 3 ? [`  *ap_a3 = ${p.ovflo ? 'ap_o' : '0'};`] : []), '}'];
  return L.join('\n');
}
