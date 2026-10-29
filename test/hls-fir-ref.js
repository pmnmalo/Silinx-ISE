// The reference of the hls::FIR tests (#1942): the FIR filter computed directly, from its definition (PG149's single
// rate, decimation and interpolation), with BigInt: each input in the parameters' format, the sums exact, truncate_lsbs's
// LSBs dropped, the output's type taking the value (AP_TRN, AP_WRAP). Independent of core/hls-fir.js's C model and of
// the HDL: the tests compare both with it.

const wrap = (v, w) => { const m = 1n << BigInt(w); const x = ((v % m) + m) % m; return x >= m / 2n ? x - m : x; };
/** raw (fractional bits from) at fractional bits to, truncated (floor; toward zero, a C integer's conversion), wrapped to
 *  w signed bits. */
export const retype = (raw, from, w, to, zero = false) => wrap(to >= from ? raw << BigInt(to - from) : zero ? raw / (1n << BigInt(from - to)) : raw >> BigInt(from - to), w);

/** The outputs (raw, in the output's type) of the calls [{ x: [raw inputs in the input's type], set }]: one list a
 *  call. cfg: { coeffs: [[numbers] a set], inW, inF, cF, L = 1, D = 1, outW (the core's, truncate_lsbs) = accW, accW };
 *  inT, outT: { w, f, int } of the arrays' types (int: a C integer's, the conversion toward zero). */
export function firReference(cfg, calls, inT, outT) {
  const { inW, inF, cF, L = 1, D = 1 } = cfg;
  const h = cfg.coeffs.map((set) => set.map((c) => BigInt(Math.round(c * 2 ** cF))));
  const hist = [];
  return calls.map(({ x, set = 0 }) => {
    const out = [];
    x.forEach((v, i) => {
      hist.push(retype(v, inT.f, inW, inF));
      if (i % D !== D - 1) return;
      const n = hist.length - 1;
      for (let ph = 0; ph < L; ph++) {
        let acc = 0n;
        for (let k = 0; ph + k * L < h[set].length; k++) if (n - k >= 0) acc += h[set][ph + k * L] * hist[n - k];
        let f = inF + cF;
        if (cfg.outW !== undefined && cfg.outW < cfg.accW) { acc >>= BigInt(cfg.accW - cfg.outW); f -= cfg.accW - cfg.outW; }
        out.push(retype(acc, f, outT.w, outT.f, !!outT.int));
      }
    });
    return out;
  });
}

/** A design running an hls::FIR: its config struct's members (C++ lines), its top dut(in, out[, config]) (arrays, or
 *  streams), the test bench's calls (inputs in[i] = gen(i, c) * scale, the set c % sets). */
export function firSource(members, { inT = 'ap_fixed<16, 16>', outT = 'ap_fixed<24, 24>', inLen, outLen, sets = 0, stream = false, dataflow = true,
  calls = 3, gen = '(i * 37 + c * 11) % 61 - 30', scale = '1', extra = '' }) {
  const arg = (t, n, len) => (stream ? `hls::stream<${t}> &${n}` : `${t} ${n}[${len}]`);
  return `#include "ap_fixed.h"
#include "hls_fir.h"
#include "hls_stream.h"
#include <stdio.h>
typedef ${inT} in_t;
typedef ${outT} out_t;
struct cfg : hls::ip_fir::params_t {
${members.map((m) => `  ${m}`).join('\n')}
};
${extra}
void dut(${arg('in_t', 'in', inLen)}, ${arg('out_t', 'out', outLen)}${sets ? ', ap_uint<8> *config' : ''}) {
${dataflow ? '#pragma HLS DATAFLOW\n' : ''}  static hls::FIR<cfg> f;
  f.run(in, out${sets ? ', config' : ''});
}
int main() {
  ${stream ? 'hls::stream<in_t> a; hls::stream<out_t> b;' : `in_t a[${inLen}]; out_t b[${outLen}];`}
  for (int c = 0; c < ${calls}; c++) {
    for (int i = 0; i < ${inLen}; i++) ${stream ? `a.write((in_t)((${gen}) * ${scale}))` : `a[i] = (${gen}) * ${scale}`};
    ${sets ? `ap_uint<8> s = c % ${sets};\n    dut(a, b, &s);` : 'dut(a, b);'}
    ${stream ? `for (int i = 0; i < ${outLen}; i++) b.read();` : ''}
  }
  return 0;
}
`;
}
