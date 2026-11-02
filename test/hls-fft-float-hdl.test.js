// Silinx HLS (#2309, core/hls-fft-float-hdl.js): the hardware of a floating-point hls::fft (use_native_float), its own
// HDL around Silinx's soft-float adder and multiplier. Co-simulated against the C simulation (its model, fftFloat, bit-exact
// with AMD's golden files) in VHDL and in Verilog, every output's bits compared: arrays and streams of hls::vector,
// forward and inverse, 8 to 64 points, the edge values (zeros of both signs, subnormals, infinities, NaN); its ports
// Vitis HLS's, no warning; its twiddles truncated toward zero (checked against the exact angle); the open synthesis
// (Yosys, Spartan-3E): one multiplier, block RAMs, no warning.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { fftFloatTwiddles } from '../core/hls-fft.js';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const LANGS = ['vhdl', 'verilog'];
const OPTS = { file: 'f.cpp', top: 'fft_top' };
const CTRL = ['ap_clk in 1', 'ap_rst in 1', 'ap_start in 1', 'ap_done out 1', 'ap_idle out 1', 'ap_ready out 1'];
const PORTS = (W) => [...CTRL, `in_dout in ${W}`, 'in_empty_n in 1', 'in_read out 1', `out_din out ${W}`, 'out_full_n in 1', 'out_write out 1'];

/** A design of the corpus's form (AMD's *_float_ssr2): fft_top(direction, in, out, status), the call hls::fft<config1>(in,
 *  out); its test bench runs `frames` (C expressions of i, the sample, and t, the frame: [re, im]) and prints each output. */
const source = ({ nfft = 4, stream = false, inverse = false, frames = 2, value = ['sinf(i * 0.7f + t) * 3.0f', '(i % 5) - 2.25f + t'], pre = '' }) => {
  const N = 2 ** nfft, io = stream ? 'hls::stream<hls::vector<cmpx, 2>> &in, hls::stream<hls::vector<cmpx, 2>> &out' : `cmpx in[${N}], cmpx out[${N}]`;
  return `#include "hls_fft.h"
#include <stdio.h>
#include <math.h>
struct config1 : hls::ip_fft::ssr_params_t {
  static const unsigned super_sample_rate = 2;
  static const bool use_native_float = true;
  static const bool systolicfft_inv = ${inverse};
  static const unsigned max_nfft = ${nfft};
};
typedef std::complex<float> cmpx;
void fft_top(bool direction, ${io}, bool *status) {
#pragma HLS interface ap_fifo depth = 1 port = status
#pragma HLS dataflow
  hls::fft<config1>(in, out);
}
int main() {
  ${pre}
  for (int t = 0; t < ${frames}; t++) {
    ${stream ? 'hls::stream<hls::vector<cmpx, 2>> a, b;\n    hls::vector<cmpx, 2> v;' : `static cmpx a[${N}], b[${N}];`}
    bool o;
    for (int i = 0; i < ${N}; i++) {
      cmpx x = cmpx(${value[0]}, ${value[1]});
      ${stream ? 'v[i % 2] = x;\n      if (i % 2) a.write(v);' : 'a[i] = x;'}
    }
    fft_top(false, a, b, &o);
    for (int i = 0; i < ${N}; i++) {
      cmpx y;
      ${stream ? 'if (i % 2 == 0) v = b.read();\n      y = v[i % 2];' : 'y = b[i];'}
      printf("%.9g %.9g\\n", y.real(), y.imag());
    }
  }
  return 0;
}
`;
};

const said = (r) => r.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const cosim = (src, lang) => {
  const c = cosimulate(src, { ...OPTS, lang });
  assert.deepEqual(c.errors, [], lang);
  assert.deepEqual(said(c.gen), [], lang);
  assert.deepEqual(c.mismatches, [], lang);
  assert.equal(c.pass, true, lang);
  return c;
};
const ports = (g) => g.ports.map((p) => `${p.name} ${p.dir} ${p.w}`);
// (a call's cycles: the inputs (a word read, each value written), the butterflies (12 cycles with a twiddle, 9 without:
// N / 2 a stage, those of k = 0 and of a quarter turn untwiddled), the outputs (3 cycles a word, 2 more a lane))
const cycles = (nfft, lanes) => {
  const N = 2 ** nfft;
  let bf = 0;
  for (let s = 0; s < nfft; s++) for (let b = 0; b < N / 2; b++) { const t = (b % (N >> (s + 1))) << s; bf += t === 0 || t === N / 4 ? 9 : 12; }
  return (N + N / lanes) + bf + (2 * N + N / lanes);
};

test('#2309 a float hls::fft\'s hardware, arrays and streams of hls::vector, VHDL and Verilog: co-simulated bit for bit against the C model, Vitis HLS\'s ports, no warning', () => {
  for (const lang of LANGS) {
    const a = cosim(source({}), lang);
    assert.equal(a.calls, 2);
    assert.deepEqual(ports(a.gen), PORTS(64));
    const s = cosim(source({ stream: true }), lang);
    assert.deepEqual(ports(s.gen), PORTS(128));
    // (the latency: the machine's cycles, and the test bench's FIFOs' waits)
    for (const [c, lanes] of [[a, 1], [s, 2]]) assert.ok(c.latency.min >= cycles(4, lanes) && c.latency.max <= cycles(4, lanes) + 40, `${lang} ${lanes} ${JSON.stringify(c.latency)}`);
  }
});

test('#2309 the inverse (systolicfft_inv), 8 and 32 points, in VHDL and Verilog', () => {
  for (const lang of LANGS) {
    cosim(source({ nfft: 3, inverse: true }), lang);
    cosim(source({ nfft: 5, stream: true, inverse: true, frames: 1 }), lang);
  }
});

test('#2309 the edge values, bit for bit: zeros of both signs, subnormals, a sum overflowing to infinity, infinities and NaN (the quiet NaN, a quarter turn\'s too)', () => {
  // (frame 0: -0, subnormals and values near the largest float, a sum of them infinite; frame 1: an infinity and a NaN)
  const pre = 'float big = 3.0e38f, tiny = 1.0e-40f, inf = big * 10.0f, nan = inf - inf;';
  const value = ['t == 0 ? (i % 4 == 0 ? -0.0f : i % 4 == 1 ? tiny * (i - 6) : i % 4 == 2 ? big : -big * 0.5f) : (i == 3 ? inf : i == 9 ? nan : i * 0.5f)',
    't == 0 ? (i % 3 == 0 ? 0.0f : i % 3 == 1 ? -tiny : big) : (i == 5 ? -inf : -0.0f)'];
  for (const lang of LANGS) cosim(source({ value, pre }), lang);
});

test('#2309 the twiddles: cos and sin of double truncated toward zero to float, of N / 2 angles', () => {
  const N = 1024, f32 = new Float32Array(1);
  for (const inverse of [false, true]) {
    const tw = fftFloatTwiddles({ N, inverse });
    assert.equal(tw.cos.length, N / 2);
    for (let t = 0; t < N / 2; t++) for (const [w, x] of [[tw.cos[t], Math.cos(((inverse ? 2 : -2) * Math.PI * t) / N)], [tw.sin[t], Math.sin(((inverse ? 2 : -2) * Math.PI * t) / N)]]) {
      f32[0] = w;
      assert.equal(f32[0], w, `${t}: a float`);
      // (no farther from 0 than the double, and the next float away from 0 farther)
      assert.ok(Math.abs(w) <= Math.abs(x), `${t}`);
      if (x !== w) {
        const u = new Uint32Array(f32.buffer);
        u[0]++;
        assert.ok(Math.abs(f32[0]) > Math.abs(x), `${t}: the float toward zero`);
      }
    }
  }
});

// (Verilog only, 64 points: the float units' synthesis takes two minutes whatever N; 1024 points take 6 block RAMs, 4
// MULT18X18 and about 6,200 LUTs, docs/c-to-hdl.md)
test('#2309 the open synthesis (Yosys, Spartan-3E): the values a block RAM, one multiplier\'s MULT18X18s, no warning', { timeout: 600000 }, async () => {
  for (const lang of ['verilog']) {
    const gen = cToHdl(source({ nfft: 6, stream: true, frames: 1 }), { ...OPTS, lang });
    assert.deepEqual(said(gen), [], lang);
    const design = elaborate(compile([{ path: `fft_top.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: gen.hdl }]), 'fft_top');
    const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
    assert.deepEqual(r.warnings, [], lang);
    const ram = Object.entries(r.cells).filter(([c]) => /^RAMB16/.test(c)).reduce((a, [, n]) => a + n, 0);
    // (the values 64 x 64 bits: two 36-bit wide block RAMs; the multiplier's 24 x 24 bits four 18 x 18)
    assert.equal(ram, 2, `${lang} ${JSON.stringify(r.cells)}`);
    assert.equal(r.cells.MULT18X18, 4, `${lang} ${JSON.stringify(r.cells)}`);
  }
});
