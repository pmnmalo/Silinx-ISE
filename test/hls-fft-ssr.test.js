// Silinx HLS (#2309): hls::fft's floating-point SSR designs, as AMD's corpus writes them: hls::stream<hls::vector<
// std::complex<float>, 2>> into and out of the transform, its C model's values fftFloat's (and a double DFT's within a
// float's error), a test bench of const char * members, a default argument, `if (!(f >> a >> b))`, sizeof of a struct
// array; a stream of hls::vector of std::complex through the hardware (VHDL and Verilog, co-simulated); the errors said.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { fftParams, fftFloat } from '../core/hls-fft.js';

const OPTS = { file: 'f.cpp', top: 'fft_top' };
const said = (r) => r.diagnostics.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const N = 16;
const INPUT = Array.from({ length: N }, (_, i) => [Math.fround(Math.sin(i) * 3), Math.fround(i % 5 - 2)]);

// (the corpus's logicore_fft_float_ssr, at 16 points: its test bench's forms)
const SOURCE = (lanes = 2, extra = '') => `#include "hls_fft.h"
#include <iostream>
#include <fstream>
#include <cmath>
using namespace std;
#define FFT_SSR 2
const int FFT_LENGTH = 1 << 4;
struct config1 : hls::ip_fft::ssr_params_t {
  static const unsigned super_sample_rate = FFT_SSR;
  static const bool use_native_float = true;
  static const unsigned max_nfft = 4;
};
typedef float data_t;
typedef std::complex<data_t> cmpx;
void fft_top(bool direction, hls::stream<hls::vector<cmpx, ${lanes}>> &in, hls::stream<hls::vector<cmpx, ${lanes}>> &out, bool *status) {
  hls::fft<config1>(in, out);
}
struct TestCase { const char *name; const char *input_file; };
TestCase test_cases[] = { {"Wave", "data/in.dat"}, {"Same", "data/in.dat"} };
const int NUM_TESTS = sizeof(test_cases) / sizeof(TestCase);
bool read_data(const char *filename, cmpx data[FFT_LENGTH]) {
  ifstream infile(filename);
  if (!infile.is_open()) { cout << "cannot open " << filename << endl; return false; }
  for (int i = 0; i < FFT_LENGTH; i++) {
    float re, im;
    if (!(infile >> re >> im)) { infile.close(); return false; }
    data[i] = cmpx(re, im);
  }
  infile.close();
  return true;
}
int show(const char *name, cmpx out[FFT_LENGTH], int digits = 9) {
  cout << name << " " << FFT_LENGTH << endl;
  for (int i = 0; i < FFT_LENGTH; i++) printf("%.*g %.*g\\n", digits, out[i].real(), digits, out[i].imag());
  return 0;
}
int main() {
  ${extra}
  for (int t = 0; t < NUM_TESTS; t++) {
    cmpx input[FFT_LENGTH], output[FFT_LENGTH];
    hls::stream<hls::vector<cmpx, FFT_SSR>> in_stream, out_stream;
    hls::vector<cmpx, FFT_SSR> in_vec, out_vec;
    bool ovflo;
    if (!read_data(test_cases[t].input_file, input)) return 1;
    for (int i = 0; i < FFT_LENGTH; i += FFT_SSR) {
      for (int j = 0; j < FFT_SSR; j++) in_vec[j] = input[i + j];
      in_stream.write(in_vec);
    }
    fft_top(false, in_stream, out_stream, &ovflo);
    for (int i = 0; i < FFT_LENGTH; i += FFT_SSR) {
      out_vec = out_stream.read();
      for (int j = 0; j < FFT_SSR; j++) output[i + j] = out_vec[j];
    }
    show(test_cases[t].name, output);
  }
  return 0;
}
`;
const FILES = { 'data/in.dat': INPUT.map(([re, im]) => `${re} ${im}`).join('\n') + '\n' };

test('#2309 a stream of hls::vector<std::complex<float>, 2> through hls::fft: its values fftFloat\'s, within a float\'s error of a double DFT; the test bench\'s const char * members, default argument, f >> a >> b, sizeof; no warning', () => {
  const r = simulateC(SOURCE(), { ...OPTS, files: FILES });
  assert.deepEqual(said(r), []);
  assert.equal(r.error, null);
  assert.equal(r.exitCode, 0);
  const p = fftParams('config1', new Map([['super_sample_rate', 2n], ['use_native_float', 1n], ['max_nfft', 4n]]), 'ssr_params_t').p;
  const re = INPUT.map((x) => x[0]), im = INPUT.map((x) => x[1]);
  fftFloat(re, im, p);
  const got = r.output.trim().split('\n');
  assert.equal(got.length, 2 * (N + 1));
  assert.deepEqual([got[0], got[N + 1]], ['Wave 16', 'Same 16']);
  assert.deepEqual(got.slice(N + 2), got.slice(1, N + 1));
  // (the values: fftFloat's to the last bit, a double DFT's within 1e-5)
  const vals = got.slice(1, 1 + N).map((l) => l.split(' ').map(Number));
  vals.forEach(([a, b], k) => {
    assert.equal(Math.fround(a), re[k], `re ${k}`);
    assert.equal(Math.fround(b), im[k], `im ${k}`);
    let dr = 0, di = 0;
    INPUT.forEach(([x, y], n) => { const w = (-2 * Math.PI * k * n) / N; dr += x * Math.cos(w) - y * Math.sin(w); di += x * Math.sin(w) + y * Math.cos(w); });
    assert.ok(Math.abs(a - dr) < 1e-5 && Math.abs(b - di) < 1e-5, `bin ${k}: ${a} ${b} vs ${dr} ${di}`);
  });
});

test('#2309 the errors: a vector of other than super_sample_rate values, a vector array; the float transform\'s synthesis refused', () => {
  const errs = (src) => said(simulateC(src, { ...OPTS, files: FILES })).filter((d) => / error: /.test(d));
  assert.deepEqual(errs(SOURCE(4)).filter((d) => /hls::fft/.test(d)), ['16 error: hls::fft<config1>: a stream of hls::vector of super_sample_rate (2) values']);
  const arr = SOURCE().replace('hls::stream<hls::vector<cmpx, 2>> &in, hls::stream<hls::vector<cmpx, 2>> &out', 'hls::vector<cmpx, 2> in[8], hls::vector<cmpx, 2> out[8]');
  assert.deepEqual(errs(arr).filter((d) => /hls::fft/.test(d)), ['16 error: hls::fft<config1>: hls::vector in a stream only (hls::stream<hls::vector<std::complex<T>, 2>>), or an array of std::complex']);
  const g = cToHdl(SOURCE(), { ...OPTS, lang: 'vhdl' });
  assert.equal(g.ok, false);
  assert.deepEqual(said(g).filter((d) => / error: /.test(d)).map((d) => d.replace(/ \(#2309.*$/, '')), ['16 error: hls::fft<config1>: use_native_float: a floating-point FFT runs in the C simulation; its hardware is not made by Silinx HLS']);
});

const VEC = `#include "hls_vector.h"
#include "hls_stream.h"
#include <stdio.h>
typedef std::complex<int> C;
void top(hls::stream<hls::vector<C, 2>> &in, hls::stream<hls::vector<C, 2>> &out) {
  hls::vector<C, 2> v = in.read();
  hls::vector<C, 2> w;
  w[0] = v[1];
  w[1] = v[0];
  out.write(w);
}
int main() {
  hls::stream<hls::vector<C, 2>> a, b;
  hls::vector<C, 2> x, y;
  for (int t = 0; t < 3; t++) {
    x[0] = C(t, 2 * t); x[1] = C(-t, 7);
    a.write(x);
    top(a, b);
    y = b.read();
    printf("%d %d %d %d\\n", y[0].real(), y[0].imag(), y[1].real(), y[1].imag());
  }
  return 0;
}
`;

test('#2309 a stream of hls::vector of std::complex<int> in the hardware, VHDL and Verilog: compiled, simulated against the C, its warnings asserted', () => {
  const r = simulateC(VEC, { file: 'v.cpp', top: 'top' });
  assert.deepEqual([said(r), r.exitCode, r.output], [[], 0, '0 7 0 0\n-1 7 1 2\n-2 7 2 4\n']);
  for (const lang of ['vhdl', 'verilog']) {
    const c = cosimulate(VEC, { file: 'v.cpp', top: 'top', lang });
    assert.deepEqual([c.errors, c.pass, c.calls, c.sim.exitCode], [[], true, 3, 0], lang);
    assert.deepEqual(said(c.gen), [
      "5 warning: 'in' is a reserved word of VHDL or Verilog: it is named in_r in the module",
      "5 warning: 'out' is a reserved word of VHDL or Verilog: it is named out_r in the module"], lang);
  }
});
