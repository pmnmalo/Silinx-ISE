// Silinx HLS (#1943, core/hls-fft-hdl.js): the hardware of hls_fft.h's hls::fft, its own HDL. The designs of the corpus's
// form co-simulated against the C simulation in VHDL and in Verilog (arrays and streams, bit-reversed and natural order,
// forward and inverse, an overflow), their ports Vitis HLS's, no warning; a constant direction and schedule; what its
// synthesis refuses (a float's, other statements); the open synthesis (Yosys, Spartan-3E) making it four multipliers and
// block RAMs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cToHdl } from '../core/c-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { fftSource, samples } from './hls-fft-ref.js';

const LANGS = ['vhdl', 'verilog'];
const FRAMES = [{ fwd: 1, sch: 0b1011, x: samples(16, 1) }, { fwd: 0, sch: 0b1010, x: samples(16, 2) }];
const opts = { file: 'f.cpp', top: 'top' };
const PORTS = (W, S) => ['ap_clk in 1', 'ap_rst in 1', 'ap_start in 1', 'ap_done out 1', 'ap_idle out 1', 'ap_ready out 1', 'dir in 1', `sch in ${S}`, `xn_dout in ${W}`, 'xn_empty_n in 1', 'xn_read out 1',
  `xk_din out ${W}`, 'xk_full_n in 1', 'xk_write out 1', 'status_din out 1', 'status_full_n in 1', 'status_write out 1'];

const cosim = (src, lang) => {
  const c = cosimulate(src, { ...opts, lang });
  assert.deepEqual(c.errors, [], lang);
  assert.deepEqual(c.gen.diagnostics, [], lang);
  assert.deepEqual(c.mismatches, [], lang);
  assert.equal(c.pass, true, lang);
  return c;
};

test('#1943 the corpus\'s form: arrays and streams, in VHDL and Verilog, the calls\' outputs the C model\'s, Vitis HLS\'s ports, no warning', () => {
  for (const stream of [false, true]) for (const lang of LANGS) {
    const c = cosim(fftSource({ stream, frames: FRAMES }), lang);
    assert.equal(c.calls, 2);
    assert.deepEqual(c.gen.ports.map((p) => `${p.name} ${p.dir} ${p.w}`), PORTS(32, 6));
    // (the inputs, 2 stages of 4 groups of 18 cycles, the outputs through the test bench's waits)
    assert.ok(c.latency.max < 600, `${c.latency.max}`);
  }
});

test('#1943 bit-reversed order, 64 points, narrower data, in VHDL and Verilog', () => {
  const six = [{ fwd: 1, sch: 0b101011, x: samples(64, 3) }];
  for (const lang of LANGS) {
    cosim(fftSource({ natural: false, frames: FRAMES }), lang);
    assert.deepEqual(cosim(fftSource({ nfft: 6, frames: six }), lang).gen.ports.map((p) => `${p.name} ${p.dir} ${p.w}`), PORTS(32, 9));
    assert.deepEqual(cosim(fftSource({ w: 12, frames: [{ fwd: 1, sch: 0b1011, x: samples(16, 4, 12) }] }), lang).gen.ports.map((p) => `${p.name} ${p.dir} ${p.w}`), PORTS(24, 6));
  }
});

test('#1943 an overflow: the values wrap and the status says so, as the C model; ovflo = false: none said', () => {
  const big = [{ fwd: 1, sch: 0, x: Array(16).fill([32767, 32767]) }, { fwd: 1, sch: 0b1010, x: Array(16).fill([32767, -32768]) }];
  for (const lang of LANGS) {
    const c = cosim(fftSource({ frames: big }), lang);
    assert.match(c.output, /^status 1\n/);
    assert.match(c.output, /\nstatus 0\n/);
    assert.match(cosim(fftSource({ extra: '  static const bool ovflo = false;\n', frames: big }), lang).output, /^status 0\n/);
  }
});

test('#1943 a constant direction and schedule; none given: UG1399\'s (inverse, every stage\'s bits 1); no status', () => {
  const src = (call, sig = '') => `#include "hls_fft.h"
typedef std::complex<ap_fixed<16, 1> > cx;
struct config1 : hls::ip_fft::params_t { static const unsigned max_nfft = 4; static const unsigned output_ordering = hls::ip_fft::natural_order; };
void top(${sig}hls::stream<cx> &xn, hls::stream<cx> &xk) {
  ${call}
}
int main() {
  hls::stream<cx> a, b;
  for (int i = 0; i < 16; i++) a.write(cx((i * 5 % 7) / 8.0, -(i % 3) / 8.0));
  top(${sig ? '1, ' : ''}a, b);
  for (int i = 0; i < 16; i++) { cx v = b.read(); printf("%g %g\\n", v.real().to_double(), v.imag().to_double()); }
  return 0;
}
`.replace('#include "hls_fft.h"', '#include "hls_fft.h"\n#include <stdio.h>');
  const names = ['ap_clk', 'ap_rst', 'ap_start', 'ap_done', 'ap_idle', 'ap_ready', 'xn_dout', 'xn_empty_n', 'xn_read', 'xk_din', 'xk_full_n', 'xk_write'];
  for (const lang of LANGS) {
    for (const call of ['hls::fft<config1>(xn, xk, 1, 10);', 'hls::fft<config1>(xn, xk);']) assert.deepEqual(cosim(src(call), lang).gen.ports.map((p) => p.name), names, call);
    assert.deepEqual(cosim(src('hls::fft<config1>(xn, xk, d, 10);', 'ap_uint<1> d, '), lang).gen.ports.map((p) => p.name).slice(6, 7), ['d']);
  }
});

test('#1943 what its synthesis refuses: a float\'s, other statements in the top, an argument not the top\'s', () => {
  const head = (cfg, ty = 'std::complex<float>') => `#include "hls_fft.h"\ntypedef ${ty} cx;\nstruct config1 : hls::ip_fft::params_t { static const unsigned max_nfft = 4; ${cfg} };\n`;
  const errs = (src) => { const r = cToHdl(src, { ...opts, lang: 'vhdl' }); assert.equal(r.ok, false); return r.diagnostics.filter((d) => d.severity === 'error').map((d) => `${d.line} ${d.message}`); };
  const flt = `${head('static const bool use_native_float = true;')}void top(cx a[16], cx b[16]) { hls::fft<config1>(a, b); }\n`;
  assert.deepEqual(errs(flt), ["4 hls::fft<config1>: use_native_float: a floating-point FFT runs in the C simulation; its hardware is not made by Silinx HLS (#2309; Vitis HLS's synthesis of the corpus's such designs fails too)"]);
  const fx = head('', 'std::complex<ap_fixed<16, 1> >');
  assert.deepEqual(errs(`${fx}void top(cx a[16], cx b[16], int *o) { *o = 1; hls::fft<config1>(a, b, 1, 10); }\n`), ['4 hls::fft<config1>: the top holds the call alone (its hardware is the top\'s): move the other statements to another function']);
  assert.deepEqual(errs(`${fx}void top(cx a[16], cx b[16], int q) { hls::fft<config1>(a, b, q + 1, 10); }\n`), ["4 hls::fft<config1>: its fwd_inv the top's argument or a constant: its hardware is the top's"]);
  assert.deepEqual(errs(`${fx}void top(cx a[16], cx b[16], int q) { hls::fft<config1>(a, b, 1, q + 1); }\n`), ["4 hls::fft<config1>: its scale_sch the top's argument or a constant: its hardware is the top's"]);
  const local = `${fx}static cx b[16];\nvoid top(cx a[16]) { hls::fft<config1>(a, b, 1, 10); }\n`;
  assert.deepEqual(errs(local), ["5 hls::fft<config1>: its xn and xk the top's arguments: its hardware is the top's"]);
  assert.deepEqual(errs(`${fx}static bool s;\nvoid top(cx a[16], cx b[16]) { hls::fft<config1>(a, b, 1, 10, -1, &s); }\n`), ["5 hls::fft<config1>: its ovflo the top's pointer: its hardware is the top's"]);
});

test('#1943 the open synthesis (Yosys, Spartan-3E): four 18x18 multipliers and block RAMs, in VHDL and Verilog, no warning', { timeout: 300000 }, async () => {
  for (const lang of LANGS) {
    const gen = cToHdl(fftSource({ nfft: 10, frames: [{ fwd: 1, sch: 0x2ab, x: Array(1024).fill([0, 0]) }] }), { ...opts, lang });
    assert.deepEqual(gen.diagnostics, [], lang);
    const design = elaborate(compile([{ path: `top.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: gen.hdl }]), 'top');
    const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
    assert.equal(r.cells.MULT18X18, 4, `${lang} ${JSON.stringify(r.cells)}`);
    assert.ok(Object.keys(r.cells).some((c) => /^RAMB16/.test(c)), `${lang} ${JSON.stringify(r.cells)}`);
    assert.deepEqual(r.warnings, [], lang);
  }
});
