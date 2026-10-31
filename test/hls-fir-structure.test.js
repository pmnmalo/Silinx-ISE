// Silinx HLS (#1947, core/hls-fir.js's firStructure, core/hls-fir-hdl.js): the filter's structure chosen from the rate it
// must sustain, as the FIR Compiler does (PG149): several MACs when one is too slow, a decimator computing only the
// outputs it keeps, a mirrored filter's pre-adder. Every structure's outputs those of the FIR from its definition
// (test/hls-fir-ref.js), in VHDL and Verilog, with the input and the output held back at random; the throughput the
// rate asks for; the warning when a rate asks for more multipliers than a board has; the multipliers in the synthesis.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firParams, firStructure, FIR_CONSTANTS as C, FIR_MAX_MACS } from '../core/hls-fir.js';
import { firHdl } from '../core/hls-fir-hdl.js';
import { cosimulate } from '../core/c-cosim.js';
import { simulate, compile, elaborate } from '../core/compile.js';
import { synthesizeOpen } from '../core/synth-front.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { firReference, firSource } from './hls-fir-ref.js';

const LANGS = ['vhdl', 'verilog'];
const DOUBLES = ['sample_period', 'sample_frequency', 'hardware_oversampling_rate'];
const fields = (o) => new Map(Object.entries(o).map(([k, v]) => [k, Array.isArray(v) || DOUBLES.includes(k) ? v : BigInt(v)]));
const params = (o) => { const { p, errors } = firParams('cfg', fields(o)); assert.deepEqual(errors, []); return p; };
const wrap = (v, w) => BigInt.asIntN(w, v);
const xs = (n, c) => Array.from({ length: n }, (_, i) => wrap(BigInt(((i * 7919 + c * 104729) % 65521) - 32760), 16));
const OUT = { w: 40, s: true, ap: true, fx: true, f: 0, q: 'AP_TRN', o: 'AP_WRAP' };
const shape = (s) => [s.cps, s.half, s.wanted, s.macs, s.groups, s.depth];

test('#1947 the MACs from the rate: an output\'s taps over its clocks, half of a mirrored filter\'s; one read a clock at most', () => {
  const vec = [1, 2, 3, 4, 5, 6, 7];
  const s = (o) => shape(firStructure(params({ num_coeffs: 7, input_length: 12, output_length: 12, coeff_vec: vec, ...o })));
  assert.deepEqual(s({}), [1, 7, 7, 7, 1, 2]);
  assert.deepEqual(s({ sample_period: 2 }), [2, 7, 4, 4, 2, 3]);
  assert.deepEqual(s({ sample_period: 7 }), [7, 7, 1, 1, 7, 8]);
  assert.deepEqual(s({ sample_period: 100 }), [100, 7, 1, 1, 7, 8]);
  // (faster than a read a clock, as the corpus's 0.5: a clock an input; a fraction of a clock not counted)
  assert.deepEqual(s({ sample_period: 0.5 }), [1, 7, 7, 7, 1, 2]);
  assert.deepEqual(s({ sample_period: 2.9 }), [2, 7, 4, 4, 2, 3]);
  // (a decimator: only the outputs it keeps)
  assert.deepEqual(s({ filter_type: C.decimation, decim_rate: 2, output_length: 6 }), [1, 7, 4, 4, 2, 3]);
  assert.deepEqual(s({ filter_type: C.decimation, decim_rate: 3, output_length: 4, sample_period: 3 }), [3, 7, 1, 1, 7, 8]);
  // (an interpolator: its phases each input; no more MACs than a phase's taps, an output a clock)
  assert.deepEqual(s({ filter_type: C.interpolation, interp_rate: 2, output_length: 24 }), [1, 4, 4, 4, 1, 2]);
  assert.deepEqual(s({ filter_type: C.interpolation, interp_rate: 2, output_length: 24, sample_period: 8 }), [8, 4, 1, 1, 4, 5]);
  // (the rate's other specifications)
  assert.deepEqual(s({ rate_specification: C.frequency, hardware_oversampling_rate: 3 }), [3, 7, 3, 3, 3, 4]);
  assert.deepEqual(s({ rate_specification: C.input_period, sample_period: 3 }), [3, 7, 3, 3, 3, 4]);
  assert.deepEqual(s({ filter_type: C.decimation, decim_rate: 2, output_length: 6, rate_specification: C.output_period, sample_period: 4 }), [2, 7, 2, 2, 4, 5]);
  // (a mirrored filter, said or inferred; said not: none; of 18-bit inputs: none, the sum past a multiplier's operand)
  const m = (o) => { const p = params({ num_coeffs: 7, input_length: 12, output_length: 12, coeff_vec: [1, 2, 3, 4, 3, 2, 1], ...o }); return [p.symmetry, ...shape(firStructure(p))]; };
  assert.deepEqual(m({ coeff_structure: C.symmetric, sample_period: 2 }), ['symmetric', 2, 4, 2, 2, 2, 5]);
  assert.deepEqual(m({ coeff_structure: C.inferred }), ['symmetric', 1, 4, 4, 4, 1, 3]);
  assert.deepEqual(m({}), [null, 1, 7, 7, 7, 1, 2]);
  assert.deepEqual(m({ coeff_structure: C.inferred, input_width: 18 }), [null, 1, 7, 7, 7, 1, 2]);
  assert.equal(m({ coeff_structure: C.inferred, coeff_vec: [1, 2, 3, 0, -3, -2, -1] })[0], 'negative');
  // (the ROM: oldest tap first, a group a word, 0 past the end)
  const r = firStructure(params({ num_coeffs: 5, input_length: 4, output_length: 4, sample_period: 3, coeff_vec: [10, 20, 30, 40, 50] }));
  assert.deepEqual([r.macs, r.groups, r.rom.map((w) => w.map(Number))], [2, 3, [[50, 30, 10], [40, 20, 0]]]);
});

test('#1947 a mirror said of coefficients that are not one is refused, each with why', () => {
  const why = (o) => firParams('cfg', fields({ num_coeffs: 3, input_length: 3, output_length: 3, coeff_vec: [1, 2, 3], ...o })).errors;
  assert.deepEqual(why({ coeff_structure: C.symmetric }), ['hls::FIR<cfg>: coeff_structure = symmetric: the coefficients of a set are not mirrored so']);
  assert.deepEqual(why({ coeff_structure: C.negative_symmetric, coeff_vec: [1, 2, 1] }), ['hls::FIR<cfg>: coeff_structure = negative_symmetric: the coefficients of a set are not mirrored so']);
  // (each set's own mirror, the whole of them)
  assert.deepEqual(why({ coeff_structure: C.symmetric, coeff_sets: 2, coeff_vec: [1, 2, 1, 3, 4, 5] }), ['hls::FIR<cfg>: coeff_structure = symmetric: the coefficients of a set are not mirrored so']);
  assert.deepEqual(why({ coeff_structure: C.symmetric, coeff_sets: 2, coeff_vec: [1, 2, 1, 3, 4, 3] }), []);
  assert.deepEqual(why({ coeff_structure: C.inferred }), []);
});

/** A test bench of the module on streams: the inputs offered and the outputs taken each `hold` clocks at most (a pattern
 *  of its own for each), `idle` clocks between the calls. */
function bench(name, p, calls, hold) {
  const inputs = calls.flatMap((c) => c.x);
  const L = [`module tb;`, 'reg clk = 0, rst = 1, start = 0; wire done, idle, ready;', 'reg [15:0] mem [0:' + (inputs.length - 1) + '];', `wire [15:0] din; wire [${OUT.w - 1}:0] dout; wire rd, wr;`,
    'integer ip = 0, t = 0, c = 0; reg [31:0] lf = 32\'hACE1;',
    `wire ok_in = ip < ${inputs.length} && (${hold} == 0 || lf[3:0] > 5); wire ok_out = ${hold} == 0 || lf[7:4] > 5;`, 'assign din = mem[ip];',
    `${name} dut (.ap_clk(clk), .ap_rst(rst), .ap_start(start), .ap_done(done), .ap_idle(idle), .ap_ready(ready), .in_r_dout(din), .in_r_empty_n(ok_in), .in_r_read(rd), .out_r_din(dout), .out_r_full_n(ok_out), .out_r_write(wr));`,
    'always #5 clk = !clk;', 'initial begin'];
  inputs.forEach((v, i) => L.push(`  mem[${i}] = 16'h${BigInt.asUintN(16, v).toString(16)};`));
  L.push(`  #22 rst = 0; start = 1; #4000000 $display("timeout"); $finish;`, 'end',
    'always @(posedge clk) begin', '  lf <= {lf[30:0], lf[31] ^ lf[21] ^ lf[1] ^ lf[0]};', '  if (!rst) t <= t + 1;', '  if (rd && ok_in) ip <= ip + 1;', '  if (wr && ok_out) $display("%h", dout);',
    `  if (done) begin c <= c + 1; if (c == ${calls.length - 1}) begin $display("cycles %0d", t); $finish; end end`, 'end', 'endmodule');
  return L.join('\n');
}

const STREAMS = { in: { type: 'in_t', stream: true }, out: { type: 'out_t', stream: true } };
const TYPES = { in: { w: 16, s: true }, out: OUT };

function streamed(cfg, coeffs, { D = 1, L = 1, lang, hold = 0, calls: nc = 3 }) {
  const p = params(cfg);
  const gen = firHdl({ p, args: STREAMS }, { lang, module: 'fir_s', src: 'fir.cpp', types: TYPES });
  const calls = Array.from({ length: nc }, (_, c) => ({ x: xs(p.inLen, c) }));
  const r = simulate([{ path: `fir_s.${lang === 'vhdl' ? 'vhd' : 'v'}`, text: gen.hdl }, { path: 'tb.v', text: bench('fir_s', p, calls, hold) }], 'tb', { until: 1e15 });
  assert.deepEqual(r.errors, [], lang);
  const rows = r.sim.log.map((e) => String(e.text).trim());
  assert.ok(!rows.includes('timeout'), `${lang} ${JSON.stringify(cfg)}: timeout`);
  const want = firReference({ coeffs, inW: 16, inF: 0, cF: 0, L, D }, calls, { w: 16, f: 0 }, { w: OUT.w, f: 0 }).flat();
  assert.deepEqual(rows.filter((s) => /^[0-9a-f]{10}$/i.test(s)).map((s) => wrap(BigInt(`0x${s}`), OUT.w)), want, `${lang} ${JSON.stringify(cfg)} hold ${hold}`);
  return { gen, cycles: Number(rows.find((x) => x.startsWith('cycles')).split(' ')[1]) };
}

test('#1947 every structure computes the FIR: MACs and their groups, rates, lengths not a multiple of the MACs; decimators and interpolators; the streams held back at random', () => {
  const h = [3, -7, 11, 25, -13, 9, 2, -5, 17, 4, -1];
  for (const taps of [1, 2, 3, 5, 8, 11]) for (const period of [1, 2, 3, 7, 11]) for (const lang of LANGS) {
    const vec = h.slice(0, taps);
    streamed({ num_coeffs: taps, input_length: 16, output_length: 16, sample_period: period, coeff_vec: vec }, [vec], { lang, hold: period === 2 ? 1 : 0 });
    streamed({ num_coeffs: taps, input_length: 16, output_length: 4, filter_type: C.decimation, decim_rate: 4, sample_period: period, coeff_vec: vec }, [vec], { D: 4, lang, hold: period === 3 ? 1 : 0 });
    streamed({ num_coeffs: taps, input_length: 6, output_length: 18, filter_type: C.interpolation, interp_rate: 3, sample_period: period, coeff_vec: vec }, [vec], { L: 3, lang, hold: period === 1 ? 1 : 0 });
  }
});

test('#1947 the pre-adder: mirrored and negatively mirrored filters, of odd and even lengths, the centre tap counted once, computing the same FIR', () => {
  for (const vec of [[9], [4, 4], [1, -2, 1], [1, -2, 3, -2, 1], [5, 1, 1, 5], [3, -7, 11, 25, 11, -7, 3], [2, 7, -4, 1, 1, -4, 7, 2], [6, 0, -4, -3, 5, 6, -6, 6, 5, -3, -4, 0, 6],
    [-3, 3], [1, 0, -1], [5, -2, 7, 0, -7, 2, -5], [4, 1, -6, 6, -1, -4]]) for (const period of [1, 2, 4, vec.length]) for (const lang of LANGS) {
    const taps = vec.length;
    const { gen } = streamed({ num_coeffs: taps, input_length: 16, output_length: 16, sample_period: period, coeff_structure: C.inferred, coeff_vec: vec }, [vec], { lang, hold: period === 2 ? 1 : 0 });
    assert.ok(['symmetric', 'negative'].includes(gen.report.fir.preAdder), JSON.stringify(vec));
    if (taps % 2 === 0 || vec.length > 2) streamed({ num_coeffs: taps, input_length: 12, output_length: 4, filter_type: C.decimation, decim_rate: 3, sample_period: period, coeff_structure: C.inferred, coeff_vec: vec }, [vec], { D: 3, lang });
  }
});

test('#1947 the throughput: at the rate asked for, a clock an input the filter takes a clock an input, whatever its taps; a slower rate fewer multipliers, as fast as it asks', () => {
  const vec = Array.from({ length: 16 }, (_, k) => ((k * 23) % 19) - 9);
  const run = (period) => {
    const { gen, cycles } = streamed({ num_coeffs: 16, input_length: 64, output_length: 64, sample_period: period, coeff_vec: vec }, [vec], { lang: 'verilog', calls: 1 });
    return [gen.report.fir.macs, cycles];
  };
  // (inputs at their period, then the pipeline: 16 MACs 4 levels of adders)
  assert.deepEqual(run(1), [16, 74]);
  assert.deepEqual(run(2), [8, 137]);
  assert.deepEqual(run(4), [4, 264]);
  assert.deepEqual(run(16), [1, 1030]);
});

test('#1947 co-simulated: arrays, the C simulation\'s outputs, at the rate asked for: a mirrored filter half the multipliers, no warning', () => {
  const M = (o) => Object.entries(o).map(([k, v]) => (k === 'coeff_vec' ? `static constexpr double coeff_vec[${v.length}] = {${v.join(', ')}};` : k === 'sample_period' ? `static constexpr double sample_period = ${v};` : typeof v === 'string' ? `static const unsigned ${k} = hls::ip_fir::${v};` : `static const unsigned ${k} = ${v};`));
  const run = (o, len = {}) => {
    const out = {};
    for (const lang of LANGS) {
      const r = cosimulate(firSource(M(o), { inLen: 12, outLen: 12, ...len }), { file: 'fir.cpp', lang });
      assert.deepEqual([r.errors, r.pass], [[], true], `${lang} ${JSON.stringify(r.mismatches?.slice(0, 3), (k, v) => (typeof v === 'bigint' ? `${v}` : v))}`);
      assert.deepEqual(r.gen.diagnostics, [], lang);
      out[lang] = r.latency;
    }
    assert.deepEqual(out.vhdl, out.verilog);
    return out.vhdl.min;
  };
  const vec = [3, -7, 11, 25, 11, -7, 3];
  const full = run({ num_coeffs: 7, input_length: 12, output_length: 12, coeff_vec: vec });
  const pre = run({ num_coeffs: 7, input_length: 12, output_length: 12, coeff_structure: 'inferred', coeff_vec: vec });
  const slow = run({ num_coeffs: 7, input_length: 12, output_length: 12, sample_period: 7, coeff_vec: vec });
  assert.deepEqual([full, pre, slow], [23, 22, 92]);
});

test('#1947 a rate asking for more multipliers than the boards have: the warning says so, the filter still the FIR', () => {
  const vec = Array.from({ length: 40 }, (_, k) => ((k * 31) % 23) - 11);
  const { gen } = streamed({ num_coeffs: 40, input_length: 8, output_length: 8, coeff_vec: vec }, [vec], { lang: 'vhdl', calls: 2 });
  assert.equal(gen.report.fir.macs, FIR_MAX_MACS);
  assert.deepEqual(gen.diagnostics.map((d) => `${d.severity}: ${d.message}`), [`warning: hls::FIR<cfg>: 40 taps at 1 clock an input ask for 40 multipliers: Silinx HLS makes 28, an output taking 2 clocks (a larger sample_period says the rate the filter must sustain)`]);
  assert.deepEqual(firHdl({ p: params({ num_coeffs: 40, input_length: 8, output_length: 8, sample_period: 2, coeff_vec: vec }), args: STREAMS }, { lang: 'vhdl', module: 'f', types: TYPES }).diagnostics, []);
});

test('#1947 the open synthesis (Yosys, Spartan-3E): the multipliers the rate asks for, a mirrored filter half of them, with no warning', async () => {
  const cases = [['vhdl', { sample_period: 2 }, [1, 2, 3, 4, 5, 6, 7, 8], 4], ['verilog', { sample_period: 2, coeff_structure: C.inferred }, [1, 2, 3, 4, 4, 3, 2, 1], 2]];
  for (const [lang, o, vec, mult] of cases) {
    const gen = firHdl({ p: params({ num_coeffs: 8, input_length: 8, output_length: 8, coeff_vec: vec, ...o }), args: { in: { type: 'in_t', stream: false }, out: { type: 'out_t', stream: false } } }, { lang, module: 'fir_m', types: { in: { w: 16, s: true }, out: { w: 24, s: true } } });
    const design = elaborate(compile([{ path: `fir_m.${lang === 'vhdl' ? 'vhd' : 'v'}`, lang, text: gen.hdl }]), 'fir_m');
    const r = await synthesizeOpen(design, { family: 'spartan3e', run: yosysNode });
    assert.equal(r.cells.MULT18X18, mult, `${lang} ${JSON.stringify(r.cells)}`);
    assert.deepEqual(r.warnings, [], lang);
  }
});
