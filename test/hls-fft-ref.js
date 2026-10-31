// The reference of the hls::fft tests (#1943): the DFT computed directly, from its definition, in double (unscaled), and
// a design of the corpus's form written from a transform's parameters. Independent of core/hls-fft.js's transform and
// of the HDL: a scaled fixed-point transform's result is the DFT divided by its schedule's factor, within its truncation.

/** The DFT of x ([re, im] pairs) by its definition; forward e^(-2 pi i n k / N). */
export function dft(x, fwd = true) {
  const N = x.length, sg = fwd ? -1 : 1;
  return x.map((_, k) => {
    let re = 0, im = 0;
    x.forEach(([a, b], n) => {
      const t = (sg * 2 * Math.PI * ((n * k) % N)) / N, c = Math.cos(t), s = Math.sin(t);
      re += a * c - b * s;
      im += a * s + b * c;
    });
    return [re, im];
  });
}

/** Test values, of w bits: a repeatable sequence (c: which). */
export function samples(N, c, w = 16) {
  const half = 2 ** (w - 1);
  let a = 12345 + c * 6789;
  const next = () => { a = (a * 1103515245 + 12345) % 2147483648; return Math.floor((a / 2147483648) * 2 * half) - half; };
  return Array.from({ length: N }, () => [next(), next()]);
}

/** A design of the corpus's form: top(dir, sch, xn, xk, status), its test bench calling it on `frames` ({ fwd, sch, x }),
 *  printing every output's raw value. stream: hls::streams, else arrays. */
export function fftSource({ nfft = 4, w = 16, stream = false, natural = true, extra = '', frames }) {
  const N = 2 ** nfft, S = 3 * Math.floor(nfft / 2);   // (scale_sch: as the corpus's, 3 bits a stage)
  const ty = `ap_fixed<${w}, 1>`, xn = stream ? 'hls::stream<cx> &xn' : `cx xn[${N}]`, xk = stream ? 'hls::stream<cx> &xk' : `cx xk[${N}]`;
  const data = frames.flatMap((f) => f.x.flat());
  return `#include "ap_fixed.h"
#include "hls_fft.h"
#include <stdio.h>
#include <complex>
typedef std::complex<${ty} > cx;
struct config1 : hls::ip_fft::params_t {
  static const unsigned max_nfft = ${nfft};
  static const unsigned input_width = ${w};
  static const unsigned output_width = ${w};
  static const unsigned output_ordering = ${natural ? 'hls::ip_fft::natural_order' : 'hls::ip_fft::bit_reversed_order'};
${extra}};
void top(ap_uint<1> dir, ap_uint<${S}> sch, ${xn}, ${xk}, bool *status) {
#pragma HLS interface ap_fifo depth=1 port=status
#pragma HLS interface ap_fifo depth=${N} port=xn,xk
#pragma HLS stream variable=xn
#pragma HLS stream variable=xk
#pragma HLS dataflow
  hls::fft<config1>(xn, xk, dir, sch, -1, status);
}
int main() {
  static const int data[${data.length}] = {${data.join(', ')}};
  static const int dirs[${frames.length}] = {${frames.map((f) => (f.fwd ? 1 : 0)).join(', ')}};
  static const int schs[${frames.length}] = {${frames.map((f) => f.sch).join(', ')}};
  ${stream ? 'hls::stream<cx> a, b;' : `static cx a[${N}], b[${N}];`}
  for (int f = 0; f < ${frames.length}; f++) {
    for (int i = 0; i < ${N}; i++) {
      cx v = cx(data[2 * (f * ${N} + i)] / ${2 ** (w - 1)}.0, data[2 * (f * ${N} + i) + 1] / ${2 ** (w - 1)}.0);
      ${stream ? 'a.write(v);' : 'a[i] = v;'}
    }
    bool st;
    top(dirs[f], schs[f], a, b, &st);
    printf("status %d\\n", st ? 1 : 0);
    for (int i = 0; i < ${N}; i++) {
      cx v${stream ? ' = b.read()' : ' = b[i]'};
      printf("%d %d\\n", (int)(v.real() * ${2 ** (w - 1)}), (int)(v.imag() * ${2 ** (w - 1)}));
    }
  }
  return 0;
}
`;
}
