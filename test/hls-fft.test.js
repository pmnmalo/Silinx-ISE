// Silinx HLS (#1943, core/hls-fft.js): hls_fft.h's hls::fft, its parameters and its transform. The config struct's fields
// read with the header's defaults, checked (each parameter Silinx does not make refused, named); the fixed-point
// transform compared with the DFT from its definition (test/hls-fft-ref.js), with hand-computed cases, and, when the
// corpus is at hand (.cache/, npm run test:hls fetches it), with AMD's golden files, every value of its frames.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fftParams, fftFixed, fftFloat, fftTwiddles, bitrev, FFT_DEFAULTS, FFT_SSR_DEFAULTS, FFT_CONSTANTS as C } from '../core/hls-fft.js';
import { sourceDir } from '../scripts/fetch-design-corpus.mjs';
import { dft, samples } from './hls-fft-ref.js';

const fields = (o) => new Map(Object.entries(o).map(([k, v]) => [k, BigInt(v)]));
const params = (o, base) => fftParams('cfg', fields(o), base);
const sch = (st, v) => { let s = 0n; for (let i = 0; i < st; i++) s |= BigInt(v[i] ?? v.at(-1)) << BigInt(2 * i); return s; };

test('#1943 the parameters: the header\'s fields and defaults, an ssr_params_t\'s its own', () => {
  const { p, errors } = params({ output_ordering: C.natural_order });
  assert.deepEqual(errors, []);
  assert.deepEqual(p, { name: 'cfg', nfft: 10, N: 1024, float: false, ssr: 1, inW: 16, outW: 16, natural: true, ovflo: true, inverse: false, stages: 5 });
  assert.deepEqual([FFT_DEFAULTS.max_nfft, FFT_DEFAULTS.arch_opt, FFT_DEFAULTS.output_ordering, FFT_DEFAULTS.ovflo], [10n, BigInt(C.pipelined_streaming_io), BigInt(C.bit_reversed_order), 1n]);
  assert.deepEqual([FFT_SSR_DEFAULTS.super_sample_rate, FFT_SSR_DEFAULTS.output_ordering, FFT_SSR_DEFAULTS.ovflo, FFT_SSR_DEFAULTS.phase_factor_width], [2n, BigInt(C.natural_order), 0n, 32n]);
  const f = params({ use_native_float: 1, max_nfft: 6, systolicfft_inv: 1 }, 'ssr_params_t').p;
  assert.deepEqual([f.float, f.N, f.ssr, f.natural, f.ovflo, f.inverse], [true, 64, 2, true, false, true]);
  // (a float's length may be odd; the fixed point's radix-4 stages an even one's)
  assert.equal(params({ use_native_float: 1, max_nfft: 5 }).errors.length, 0);
});

test('#1943 what Silinx does not make: refused, each parameter named with why', () => {
  const why = (o) => params(o).errors;
  assert.deepEqual(why({ has_nfft: 1 }), ['hls::fft<cfg>: has_nfft = 1: a transform length set at run time is not made by Silinx HLS yet']);
  assert.deepEqual(why({ channels: 2 }), ['hls::fft<cfg>: channels = 2: Silinx HLS makes one channel (channels = 1)']);
  assert.deepEqual(why({ cyclic_prefix_insertion: 1 }), ['hls::fft<cfg>: cyclic_prefix_insertion = 1: not made by Silinx HLS yet']);
  assert.deepEqual(why({ xk_index: 1 }), ['hls::fft<cfg>: xk_index = 1: not made by Silinx HLS yet']);
  assert.deepEqual(why({ super_sample_rate: 3 }), ['hls::fft<cfg>: super_sample_rate = 3: 1, 2, 4, 8, 16, 32 or 64', 'hls::fft<cfg>: super_sample_rate = 3: a fixed-point FFT of a super sample rate is not made by Silinx HLS yet']);
  assert.deepEqual(why({ super_sample_rate: 2 }), ['hls::fft<cfg>: super_sample_rate = 2: a fixed-point FFT of a super sample rate is not made by Silinx HLS yet']);
  assert.deepEqual(why({ arch_opt: C.radix_2_burst_io }), ['hls::fft<cfg>: arch_opt = radix_2_burst_io: Silinx HLS makes pipelined_streaming_io (the burst architectures\' arithmetic not yet)']);
  assert.deepEqual(why({ scaling_opt: C.unscaled }), ['hls::fft<cfg>: scaling_opt = unscaled: Silinx HLS makes scaled transforms only (unscaled and block_floating_point not yet)']);
  assert.deepEqual(why({ rounding_opt: C.convergent_rounding }), ['hls::fft<cfg>: rounding_opt = convergent_rounding: Silinx HLS makes truncation only (convergent_rounding not yet)']);
  assert.deepEqual(why({ phase_factor_width: 18 }), ['hls::fft<cfg>: phase_factor_width = 18: Silinx HLS makes 16-bit phase factors only']);
  assert.deepEqual(why({ input_width: 18, output_width: 18 }), ['hls::fft<cfg>: input_width = 18: from 8 to 16 bits']);
  assert.deepEqual(why({ output_width: 20 }), ['hls::fft<cfg>: output_width = 20: input_width (16): a scaled transform\'s output is as wide as its input']);
  assert.deepEqual(why({ max_nfft: 9 }), ['hls::fft<cfg>: max_nfft = 9: an even max_nfft (radix-4 stages: 16, 64, 256, … points); an odd one\'s radix-2 stage is not made by Silinx HLS yet']);
  assert.deepEqual(why({ max_nfft: 2 }), ['hls::fft<cfg>: max_nfft = 2: from 3 to 16 (8 to 65536 points)']);
});

test('#1943 the twiddles: rounded, 2^15 itself the largest value below it', () => {
  const { cos, sin } = fftTwiddles({ N: 16 });
  assert.deepEqual(cos.slice(0, 5), [32767, 30274, 23170, 12540, 0]);
  assert.deepEqual(sin.slice(0, 5), [0, 12540, 23170, 30274, 32767]);
  assert.deepEqual([cos[8], sin[12]], [-32768, -32768]);
  assert.deepEqual([bitrev(1, 4), bitrev(6, 4), bitrev(15, 4), bitrev(1, 10)], [8, 6, 15, 512]);
});

test('#1943 the transform by hand: an impulse, a constant, the truncation toward minus infinity, bit-reversed or natural order', () => {
  const p = params({ max_nfft: 4, output_ordering: C.natural_order }).p;
  const run = (x, fwd, s, q = p) => { const re = x.map((v) => v[0]), im = x.map((v) => v[1]); const over = fftFixed(re, im, q, fwd, s); return { y: re.map((v, i) => [v, im[i]]), over }; };
  // (an impulse of 16: flat; scaled by 4 twice, 1 in each bin)
  const imp = Array.from({ length: 16 }, (_, i) => (i ? [0, 0] : [16, 0]));
  assert.deepEqual(run(imp, 1, sch(2, [2, 2])), { y: Array(16).fill([1, 0]), over: 0 });
  // (a constant: its sum in bin 0, the others 0)
  const dc = Array(16).fill([100, -50]);
  const { y } = run(dc, 1, sch(2, [2, 2]));
  assert.deepEqual(y[0], [100, -50]);
  assert.ok(y.slice(1).every((v) => v[0] === 0 && v[1] === 0), JSON.stringify(y));
  // (an impulse of -1: floor(-1 / 16), -1, never 0)
  assert.deepEqual(run(Array.from({ length: 16 }, (_, i) => (i ? [0, 0] : [-1, 0])), 1, sch(2, [2, 2])).y[5], [-1, 0]);
  // (the order: bit-reversed, bin k at bitrev(k))
  const q = params({ max_nfft: 4 }).p;
  const x = samples(16, 3).map(([a, b]) => [a >> 2, b >> 2]);
  const nat = run(x, 1, sch(2, [2, 2])).y, rev = run(x, 1, sch(2, [2, 2]), q).y;
  nat.forEach((v, k) => assert.deepEqual(rev[bitrev(k, 4)], v));
});

test('#1943 the overflow: no schedule, a large input wraps and says so; scaled, it does not', () => {
  const p = params({ max_nfft: 4, output_ordering: C.natural_order }).p;
  const x = Array(16).fill(32767);
  const run = (s) => { const re = [...x], im = [...x]; return { over: fftFixed(re, im, p, 1, s), y0: re[0] }; };
  assert.deepEqual(run(sch(2, [0, 0])).over, 1);
  assert.ok(run(sch(2, [0, 0])).y0 >= -32768 && run(sch(2, [0, 0])).y0 <= 32767);
  assert.deepEqual(run(sch(2, [2, 2])), { over: 0, y0: 32767 });
});

test('#1943 the transform against the DFT: 16, 64, 256 points, forward and inverse, each schedule, within its truncation', () => {
  for (const nfft of [4, 6, 8]) {
    const p = params({ max_nfft: nfft, output_ordering: C.natural_order }).p, N = 2 ** nfft;
    for (const [fwd, c] of [[1, 1], [0, 2]]) {
      const v = [3, ...Array(p.stages - 1).fill(2)];   // (AMD's form: 2 bits a stage, the first 3, no overflow)
      const x = samples(N, c), re = x.map((a) => a[0]), im = x.map((a) => a[1]);
      const shift = v.reduce((a, b) => a + b, 0);
      assert.equal(fftFixed(re, im, p, fwd, sch(p.stages, v)), 0);
      const want = dft(x, !!fwd);
      let worst = 0;
      want.forEach(([a, b], k) => { worst = Math.max(worst, Math.abs(a / 2 ** shift - re[k]), Math.abs(b / 2 ** shift - im[k])); });
      assert.ok(worst < 2.5 * p.stages, `N=${N} fwd=${fwd}: ${worst}`);
    }
  }
});

test('#1943 the floating-point transform: the DFT within a float\'s error, natural order; the inverse its conjugate\'s', () => {
  const p = params({ use_native_float: 1, max_nfft: 6 }, 'ssr_params_t').p;
  const x = samples(64, 5).map(([a, b]) => [a / 32768, b / 32768]);
  for (const inverse of [false, true]) {
    const re = x.map((a) => Math.fround(a[0])), im = x.map((a) => Math.fround(a[1]));
    fftFloat(re, im, { ...p, inverse });
    dft(x, !inverse).forEach(([a, b], k) => { assert.ok(Math.abs(a - re[k]) < 1e-4 && Math.abs(b - im[k]) < 1e-4, `${k}`); });
  }
});

// (AMD's golden files, the corpus's: bit-exact, every value)
const manifest = JSON.parse(fs.readFileSync(new URL('./hls-corpus/manifest.json', import.meta.url), 'utf8'));
const dir = path.join(sourceDir(manifest.sources['vitis-hls-examples']), 'DSP/fft/interface_array/data');
test('#1943 bit-exact with Vitis HLS\'s C model: the corpus\'s 20 frames, every value', { skip: !fs.existsSync(dir) && 'the corpus is not fetched (npm run test:hls)' }, () => {
  const sx = (s) => { const v = parseInt(s, 16); return v >= 32768 ? v - 65536 : v; };
  const rows = (lines) => lines.map((l) => l.trim().split(/\s+/).slice(0, 2).map(sx));
  const p = params({ output_ordering: C.natural_order }).p;
  for (let f = 0; f < 20; f++) {
    const n = String(f).padStart(2, '0');
    const dat = fs.readFileSync(path.join(dir, `stimulus_${n}.dat`), 'utf8').trim().split('\n'), res = fs.readFileSync(path.join(dir, `stimulus_${n}.res`), 'utf8').trim().split('\n');
    const x = rows(dat.slice(4, 1028)), want = rows(res.slice(2, 1026));
    const re = x.map((a) => a[0]), im = x.map((a) => a[1]);
    assert.equal(fftFixed(re, im, p, Number(dat[2]), BigInt(`0x${dat[3].trim()}`)), 0, n);
    assert.deepEqual(re.map((v, i) => [v, im[i]]), want, n);
  }
});
