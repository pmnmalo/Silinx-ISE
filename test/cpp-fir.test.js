// Silinx HLS C++ (#1942, core/cpp-fir.js): hls_fir.h's hls::FIR in a source: the config struct derived from
// hls::ip_fir::params_t in its forms (coeff_vec in it or defined after it, config::num_coeffs used, hls::ip_fir's
// constants), the filter static or global, its run() a call of its C model and, in synthesis, a process of the filter's
// own hardware; what is not possible said where it is. The corpus's dsp-fir-decimator in its form, then itself (when
// fetched): Vitis HLS 2025.2's ports (test/hls-corpus/vitis.json), its C simulation passing its test bench, co-simulated
// in VHDL and Verilog, its warnings asserted.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { simulateC } from '../core/c-interp.js';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { checkC } from '../core/c-check.js';
import { comparePorts } from '../scripts/hls-vitis.mjs';
import { sourceDir } from '../scripts/fetch-design-corpus.mjs';
import { unitOf, runDesign } from './hls-corpus/lib.mjs';

const big = (k, v) => (typeof v === 'bigint' ? `${v}` : v);
const msgs = (diags) => diags.map((d) => `${d.line} ${d.severity}: ${d.message}`);
const LANGS = ['vhdl', 'verilog'];

// (the corpus's dsp-fir-decimator in its form: its top's signature and types, its config's fields, our own coefficients
// and test bench, the outputs checked against values computed by hand)
const FORM = `#include "ap_fixed.h"
#include "hls_fir.h"
#include <iostream>
const unsigned FIR_LENGTH = 20;
const unsigned COEFF_NUM = 7;
const unsigned COEFF_SETS = 3;
const unsigned INPUT_LENGTH = FIR_LENGTH;
const unsigned OUTPUT_LENGTH = FIR_LENGTH / 2;
const unsigned total_num_coeff = COEFF_NUM * COEFF_SETS;
typedef ap_fixed<16, 16> s_data_t;
typedef ap_fixed<24, 24> m_data_t;
typedef ap_uint<8> config_t;
struct config1 : hls::ip_fir::params_t {
  static const unsigned input_length = INPUT_LENGTH;
  static const unsigned output_length = OUTPUT_LENGTH;
  static const unsigned num_coeffs = COEFF_NUM;
  static const unsigned coeff_sets = COEFF_SETS;
  static constexpr double sample_period = 0.5;
  static const unsigned filter_type = hls::ip_fir::decimation;
  static const unsigned rate_change = hls::ip_fir::integer;
  static const unsigned decim_rate = 2;
  static constexpr double coeff_vec[total_num_coeff] = {1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1};
};
void fir_top(s_data_t in[INPUT_LENGTH], m_data_t out[OUTPUT_LENGTH], config_t* config) {
#pragma HLS dataflow
  static hls::FIR<config1> fir1;
  fir1.run(in, out, config);
}
int main() {
  s_data_t in[INPUT_LENGTH];
  m_data_t out[OUTPUT_LENGTH];
  int err = 0;
  for (int i = 0; i < INPUT_LENGTH; i++) in[i] = i;
  for (int j = 0; j < 3; j++) {
    config_t config = j;
    fir_top(in, out, &config);
    // (set 0: y[n] = x[n]; set 1: x[n - 1]; set 2: the sum of the last 7, the previous call's inputs too)
    for (unsigned i = 0; i < OUTPUT_LENGTH; i++) {
      int n = 2 * i + 1, want = j == 0 ? n : j == 1 ? n - 1 : 0;
      if (j == 2) for (int k = 0; k < 7; k++) want += n - k >= 0 ? n - k : n - k + 20;
      if (out[i] != want) err++;
    }
  }
  std::cout << (err ? "FAIL" : "PASS") << std::endl;
  return err;
}
`;
const VITIS = JSON.parse(fs.readFileSync(new URL('./hls-corpus/vitis.json', import.meta.url), 'utf8')).designs['dsp-fir-decimator'].vitis;
const ours = (g) => g.ports.map(({ name, dir, w }) => ({ name, dir, w }));

test('#1942 the corpus\'s dsp-fir-decimator in its form: its C simulation passes its test bench; Vitis HLS\'s ports; co-simulated in VHDL and Verilog, no warning', () => {
  const sim = simulateC(FORM, { file: 'fir_top.cpp' });
  assert.deepEqual([sim.ok, sim.error, sim.exitCode, sim.output, sim.calls.length], [true, null, 0, 'PASS\n', 3]);
  for (const lang of LANGS) {
    const r = cosimulate(FORM, { file: 'fir_top.cpp', lang });
    assert.deepEqual([r.errors, r.pass], [[], true], `${lang} ${JSON.stringify(r.mismatches, big)}`);
    assert.deepEqual(comparePorts(ours(r.gen), VITIS.ports), { same: true, missing: [], extra: [], differ: [] }, lang);
    assert.deepEqual(msgs(r.gen.diagnostics), [], lang);
    // (Vitis HLS's 32 cycles; Silinx's 4 MACs, an input a clock, and the region's start and end, #1947)
    assert.deepEqual(r.latency, { min: 31, max: 31, avg: 31 }, lang);
    assert.deepEqual(r.gen.report.processes.map((p) => `${p.instance} ${p.states}`), ['ap_fir_fir1_U0 3'], lang);
  }
});

test('#1942 the config in its other forms: coeff_vec defined after the struct, config::num_coeffs and hls::ip_fir\'s constants in the code, a filter at file scope', () => {
  const src = `#include "hls_fir.h"
#include <stdio.h>
struct lp : public hls::ip_fir::params_t {
  static const unsigned num_coeffs = 4;
  static const unsigned input_length = 6;
  static const unsigned output_length = 6;
  static const unsigned input_width = 8;
  static const unsigned total_num_coeff = num_coeffs * coeff_sets;
  static const double coeff_vec[total_num_coeff];
};
const double lp::coeff_vec[lp::total_num_coeff] = {1, 2, 2, 1};
hls::FIR<lp> filt;
void top(int in[lp::input_length], int out[lp::output_length]) { filt.run(in, out); }
int main() {
  int a[6], b[6], s = 0;
  for (int i = 0; i < 6; i++) a[i] = i == 0;
  top(a, b);
  for (int i = 0; i < lp::output_length; i++) s = s * 10 + b[i];
  printf("%d %d %d\\n", s, lp::num_coeffs, hls::ip_fir::interpolation);
  return 0;
}
`;
  assert.equal(simulateC(src, { file: 'lp.cpp' }).output, '122100 4 1\n');
  for (const lang of LANGS) {
    const r = cosimulate(src, { file: 'lp.cpp', lang });
    assert.deepEqual([r.errors, r.pass, msgs(r.gen.diagnostics)], [[], true, []], `${lang} ${JSON.stringify(r.mismatches, big)}`);
    // (int arrays: 32-bit ports; the input in the parameters' 8 bits)
    assert.deepEqual(r.gen.ports.filter((p) => /_(q0|d0)$/.test(p.name)).map((p) => `${p.name} ${p.w}`), ['in_d0 32', 'in_q0 32', 'out_d0 32', 'out_q0 32'].map((x) => x.replace(/^(in|out)_/, '$1_r_')), lang);
  }
});

test('#1942 a filter between other processes of a DATAFLOW region: local arrays its buffers (the ports it never uses, Vitis HLS\'s, left out of them); co-simulated in VHDL and Verilog, no warning', () => {
  const src = `#include "hls_fir.h"
#include <stdio.h>
struct c : hls::ip_fir::params_t {
  static const unsigned num_coeffs = 3;
  static const unsigned input_length = 8;
  static const unsigned output_length = 8;
  static constexpr double coeff_vec[3] = {1, 2, 1};
};
void pre(int a[8], int b[8]) { for (int i = 0; i < 8; i++) b[i] = a[i] * 3; }
void post(int a[8], int b[8]) { for (int i = 0; i < 8; i++) b[i] = a[i] + 1; }
void top(int in[8], int out[8]) {
#pragma HLS DATAFLOW
  static hls::FIR<c> f;
  int t1[8], t2[8];
  pre(in, t1);
  f.run(t1, t2);
  post(t2, out);
}
int main() { int a[8], b[8]; for (int c = 0; c < 3; c++) { for (int i = 0; i < 8; i++) a[i] = i + c; top(a, b); for (int i = 0; i < 8; i++) printf("%d ", b[i]); } printf("\\n"); return 0; }
`;
  for (const lang of LANGS) {
    const r = cosimulate(src, { file: 'd.cpp', lang });
    assert.deepEqual([r.errors, r.pass, msgs(r.gen.diagnostics)], [[], true, []], `${lang} ${JSON.stringify(r.mismatches, big)}`);
    // (3x, filtered by 1 2 1, the delay line across calls, +1)
    assert.equal(r.output, '1 4 13 25 37 49 61 73 64 34 25 37 49 61 73 85 76 46 37 49 61 73 85 97 \n');
    assert.deepEqual(r.gen.report.processes.map((p) => `${p.instance} after ${p.after.join(', ') || '-'}`), ['pre_U0 after -', 'ap_fir_f_U1 after pre', 'post_U2 after ap_fir_f'], lang);
  }
});

test('#1942 what cannot be: said where it is (the filter not static, a config not of params_t, a second run(), an argument not an array, an unknown constant, a parameter refused, hls_fir.h in C)', () => {
  const errs = (body, extra = '', file = 'f.cpp') => msgs(checkC(`#include "hls_fir.h"
struct c : hls::ip_fir::params_t {
  static const unsigned num_coeffs = 2;
  static const unsigned input_length = 4;
  static const unsigned output_length = 4;
  static constexpr double coeff_vec[2] = {1, -1};${extra}
};
struct d { static const unsigned num_coeffs = 2; };
void top(int in[4], int out[4]) {
${body}
}
`, file).diagnostics.filter((x) => x.severity === 'error'));
  assert.deepEqual(errs('  hls::FIR<c> f;\n  f.run(in, out);'), ["10 error: hls::FIR 'f': declare it static (static hls::FIR<c> f;): its delay line lives across calls, as the filter's"]);
  assert.deepEqual(errs('  static hls::FIR<d> f;'), ["10 error: hls::FIR<d>: 'd' is not a struct derived from hls::ip_fir::params_t"]);
  assert.deepEqual(errs('  static hls::FIR<c> f;\n  f.run(in, out);\n  f.run(in, out);'), ["12 error: hls::FIR 'f': its run() is called once (one filter, its hardware a process of its own)"]);
  assert.deepEqual(errs('  static hls::FIR<c> f;\n  f.run(in + 1, out);'), ["11 error: hls::FIR 'f': run()'s input is an array, a stream declared in the function (its name)"]);
  assert.deepEqual(errs('  static hls::FIR<c> f;\n  f.run(in);'), ["11 error: hls::FIR 'f': run(in, out) or run(in, out, config)"]);
  assert.deepEqual(errs('  static hls::FIR<c> f;\n  f.run(in, out);', '\n  static const unsigned filter_type = hls::ip_fir::sideways;'), ["7 error: hls::ip_fir::sideways is not one of hls_fir.h's constants"]);
  assert.deepEqual(errs('  static hls::FIR<c> f;\n  f.run(in, out);', '\n  static const unsigned num_channels = 2;\n  static const bool reloadable = true;'),
    ['12 error: hls::FIR<c>: reloadable = 1: coefficients reloaded at run time are not made by Silinx HLS yet', '12 error: hls::FIR<c>: num_channels = 2: Silinx HLS makes one channel (num_channels = 1)']);
  assert.deepEqual(errs('  int k = 0;', '\n  static const unsigned input_width = k;'), ["7 error: hls::FIR's c::input_width: its value is not a constant"]);
  assert.deepEqual(msgs(checkC('#include "hls_fir.h"\nint main(void) { return 0; }\n', 'f.c').diagnostics), ['1 error: hls_fir.h: hls::FIR is C++: write the source as a .cpp file']);
});

// (the corpus itself, when fetched: npm run test:hls fetches it into .cache/, never committed)
const manifest = JSON.parse(fs.readFileSync(new URL('./hls-corpus/manifest.json', import.meta.url), 'utf8'));
const corpusDir = sourceDir(manifest.sources['vitis-hls-examples']);
const design = manifest.designs.find((x) => x.name === 'dsp-fir-decimator');
const fetched = fs.existsSync(path.join(corpusDir, design.files[0])) ? false : 'the HLS corpus is not fetched (npm run test:hls fetches it)';

test('#1942 the corpus\'s dsp-fir-decimator itself (AMD\'s sources, when fetched): its C simulation, synthesis and co-simulation pass; Vitis HLS\'s ports; its warnings', { skip: fetched }, () => {
  const texts = Object.fromEntries([...design.files, ...design.tb, ...design.headers].map((f) => [f, fs.readFileSync(path.join(corpusDir, f), 'utf8')]));
  const r = runDesign(design, texts);
  assert.deepEqual(r, { csim: 'pass', synth: 'pass', cosim: 'pass', latency: { min: 31, max: 31, avg: 31 }, reason: null });
  const { unit, headers } = unitOf(design, texts);
  for (const lang of LANGS) {
    const g = cToHdl(unit, { file: 'unit.cpp', headers, top: design.top, lang });
    assert.deepEqual(comparePorts(ours(g), VITIS.ports), { same: true, missing: [], extra: [], differ: [] }, lang);
    assert.deepEqual(msgs(g.diagnostics), [], lang);
  }
});
