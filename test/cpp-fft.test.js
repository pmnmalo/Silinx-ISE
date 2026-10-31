// Silinx HLS C++ (#1943, core/cpp-fft.js): hls_fft.h's call in the source: the config struct read, hls::ip_fft's names
// numbers, the C model run by the C simulation, its outputs core/hls-fft.js's, arrays and streams; each error said. The
// C library and std::complex its test benches need (core/c-interp-lib.js, core/cpp-hls-lib.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simulateC } from '../core/c-interp.js';
import { fftParams, fftFixed, FFT_CONSTANTS as C } from '../core/hls-fft.js';
import { CPP_OWN_HEADERS } from '../core/cpp-headers.js';
import { fftSource, samples } from './hls-fft-ref.js';

const errors = (src) => simulateC(src, { file: 'f.cpp', top: 'top' }).diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`);
const run = (src, opts = {}) => {
  const r = simulateC(src, { file: 'f.cpp', top: 'top', ...opts });
  assert.deepEqual(r.diagnostics, []);
  assert.equal(r.error, null);
  assert.equal(r.exitCode, 0);
  return r;
};
const FRAMES = [{ fwd: 1, sch: 0b1011, x: samples(16, 1) }, { fwd: 0, sch: 0b1010, x: samples(16, 2) }];
const want = (frames, natural = true) => frames.flatMap((f) => {
  const p = fftParams('c', new Map([['max_nfft', 4n], ['output_ordering', BigInt(natural ? C.natural_order : C.bit_reversed_order)]])).p;
  const re = f.x.map((v) => v[0]), im = f.x.map((v) => v[1]);
  const over = fftFixed(re, im, p, f.fwd, BigInt(f.sch));
  return [`status ${over}`, ...re.map((v, i) => `${v} ${im[i]}`)];
}).join('\n');

test('#1943 the C model of the corpus\'s form: arrays and streams, bit-reversed and natural order, its outputs the transform\'s, no warning', () => {
  for (const stream of [false, true]) for (const natural of [true, false]) {
    const r = run(fftSource({ stream, natural, frames: FRAMES }));
    assert.equal(r.output.trim(), want(FRAMES, natural), `stream ${stream} natural ${natural}`);
    assert.equal(r.calls.length, 2);
  }
});

test('#1943 the header\'s names: hls::ip_fft\'s constants and enum types, config_t, status_t, config1\'s fields, a source\'s own names its own', () => {
  const h = CPP_OWN_HEADERS['hls_fft.h'];
  for (const s of ['namespace ip_fft', 'struct params_t {', 'struct ssr_params_t : params_t {', 'static const unsigned max_nfft = 10;', 'template <typename CONFIG_T> struct config_t', 'void fft(IN_T *xn']) assert.ok(h.includes(s), s);
  const r = run(`#include "hls_fft.h"
#include <stdio.h>
const hls::ip_fft::arch A = hls::ip_fft::pipelined_streaming_io;
const hls::ip_fft::ordering O = hls::ip_fft::natural_order;
int scaled = 7, mem = 2;
struct config1 : hls::ip_fft::params_t { static const unsigned max_nfft = 6; static const bool ovflo = false; };
typedef hls::ip_fft::config_t<config1> config_t;
typedef hls::ip_fft::status_t<config1> status_t;
int top(int a) { return a + scaled * mem; }
int main() { config_t c = 1; status_t s = 2; printf("%d %d %d %d %d %d %d\\n", (int)A, (int)O, config1::max_nfft, config1::input_width, (int)config1::ovflo, c + s, top(1)); return 0; }
`);
  assert.equal(r.output, `${C.pipelined_streaming_io} ${C.natural_order} 6 16 0 3 15\n`);
});

test('#1943 UG1399\'s names of the fields, the same fields', () => {
  const r = run(`#include "hls_fft.h"
#include <stdio.h>
struct config1 : hls::ip_fft::params_t { static const unsigned log2_transform_length = 6; static const unsigned implementation_options = hls::ip_fft::pipelined_streaming_io; };
void top(int *o) { *o = config1::max_nfft; }
int main() { int o; top(&o); printf("%d\\n", o); return 0; }
`);
  assert.equal(r.output, '6\n');
  assert.deepEqual(errors(`#include "hls_fft.h"
struct config1 : hls::ip_fft::params_t { static const unsigned implementation_options = hls::ip_fft::radix_4_burst_io; };
typedef std::complex<ap_fixed<16, 1> > cx;
void top(cx a[1024], cx b[1024]) { hls::fft<config1>(a, b); }
int main() { return 0; }
`), ["4 hls::fft<config1>: arch_opt = radix_4_burst_io: Silinx HLS makes pipelined_streaming_io (the burst architectures' arithmetic not yet)"]);
});

test('#1943 what cannot be: each said, at its place', () => {
  const src = (cfg, call = 'hls::fft<config1>(a, b, 1, 10, -1, &st);', base = 'params_t') => `#include "hls_fft.h"
typedef std::complex<ap_fixed<16, 1> > cx;
struct config1 : hls::ip_fft::${base} { ${cfg} };
void top(cx a[16], cx b[16]) {
  bool st;
  ${call}
}
int main() { return 0; }
`;
  const ok = 'static const unsigned max_nfft = 4;';
  assert.deepEqual(errors(src('static const unsigned channels = 2;' + ok)), ['6 hls::fft<config1>: channels = 2: Silinx HLS makes one channel (channels = 1)']);
  assert.deepEqual(errors(src(ok, 'hls::fft<nope>(a, b);')), ["6 hls::fft<nope>: 'nope' is not a struct derived from hls::ip_fft::params_t or ssr_params_t"]);
  assert.deepEqual(errors(src(ok, 'hls::fft<config1>(a);')), ['6 hls::fft<config1>: (xn, xk[, fwd_inv[, scale_sch[, cp_len[, ovflo]]]])']);
  assert.deepEqual(errors(src(ok, 'hls::fft<config1>(a + 1, b);')), ['6 hls::fft<config1>: its input is an array or a stream declared in the function (its name)']);
  assert.deepEqual(errors(src(`${ok} static const unsigned channels = ap;`)).slice(0, 1), ["3 hls::fft's config1::channels: its value is not a constant"]);
  assert.deepEqual(errors(src(ok, 'unsigned x = hls::ip_fft::nothing;')), ["6 hls::ip_fft::nothing is not one of hls_fft.h's constants"]);
  const c = simulateC('#include "hls_fft.h"\nint main() { return 0; }\n', { file: 'f.c' });
  assert.deepEqual(c.diagnostics.map((d) => d.message), ['hls_fft.h: hls::fft is C++: write the source as a .cpp file']);
});

test('#1943 std::complex: std:: and a typedef\'s, complex<T>(re, im) of its parts converted to T, none given 0, a typedef of a float the same type', () => {
  const r = run(`#include <complex>
#include "ap_fixed.h"
#include <stdio.h>
typedef ap_fixed<16, 1> d_t;
typedef float f1_t;
typedef float f2_t;
typedef std::complex<d_t> cx;
void top(int *o) { *o = 1; }
int main() {
  cx a[2]; double r = 0.5; a[1] = cx(r, -0.25); a[0] = cx();
  std::complex<float> f = std::complex<float>(1.5, 2);
  std::complex<f1_t> g = std::complex<f1_t>(0.5, f.imag());
  std::complex<f2_t> h = g;
  int o; top(&o);
  printf("%g %g %g %g %g %g %g\\n", a[1].real().to_float(), a[1].imag().to_float(), f.real(), f.imag(), a[0].real().to_float(), h.real(), h.imag());
  return 0;
}
`);
  assert.equal(r.output, '0.5 -0.25 1.5 2 0 0.5 2\n');
});

test('#1943 the test benches\' C library: fgetc, strcat, fscanf %X %f %lf, memcpy of a float\'s bits, ldexp; in the synthesized code refused', () => {
  const files = { 'd.dat': '0A\n2AB ff 1.5 -2.25e1 0.1\n' };
  const r = run(`#include <stdio.h>
#include <string.h>
#include <math.h>
void top(int *o) { *o = 1; }
int main() {
  char name[16] = {0}; int a, b, c, bits = 0x3fc00000, o; float f, g, m = 0; double d;
  sprintf(name, "d"); strcat(name, ".dat");
  FILE *h = fopen(name, "r");
  int ch = fgetc(h);
  fscanf(h, "%X", &a); fscanf(h, "%X %x %f %f %lf", &b, &c, &f, &g, &d);
  while (fgetc(h) != EOF) { }
  fclose(h);
  memcpy(&m, &bits, sizeof(m));
  int back = 0; memcpy(&back, &m, sizeof(back));
  top(&o);
  printf("%c %d %d %d %g %g %g %s %g %x %g\\n", ch, a, b, c, f, g, d, name, m, back, ldexp(1.0, 15));
  return 0;
}
`, { files });
  assert.equal(r.output, '0 10 683 255 1.5 -22.5 0.1 d.dat 1.5 3fc00000 32768\n');
  for (const [call, name] of [['strcat(s, s)', 'strcat'], ['fgetc(0)', 'fgetc']]) {
    assert.deepEqual(errors(`#include <stdio.h>\n#include <string.h>\nint top(int a) { char s[4]; ${call}; return a; }\nint main() { return 0; }\n`), [`3 ${name} is a system call: not possible in the synthesized code (Silinx HLS, as Vitis HLS)`]);
  }
});

test('#1943 memcpy and strcat, their errors', () => {
  const fail = (body) => simulateC(`#include <stdio.h>\n#include <string.h>\nvoid top(int *o) { *o = 1; }\nint main() { ${body} return 0; }\n`, { file: 'f.cpp', top: 'top', files: {} }).error?.message;
  assert.equal(fail('double d = 0; int i = 1; memcpy(&d, &i, sizeof(i));'), 'memcpy: 4 bytes between values of 32 and 64 bits');
  assert.equal(fail('char s[3] = {0}; strcat(s, "abc");'), 'strcat: 4 chars in an array of 3 (outside the array)');
  assert.equal(fail('fgetc(0);'), 'fgetc: its file is not open (NULL)');
});
