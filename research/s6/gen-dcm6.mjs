// Stage S6-E (#727): the DCM_SP's and PLL_BASE's settings, on designs ISE implements (ise-s6.sh impl): a clock from the
// board's clock pad into a DCM (or a PLL) at a fixed site, its output through a BUFG to a flip-flop, one setting changed
// per design from the base's. residual6.mjs and the designs' differences give each setting's bits in the CMT tile.
// --fields: the values that set each bit of the counters (CLKFX_MULTIPLY / DIVIDE - 1, the PLL's multiplier, divider and
// output divider, CLKDV), the PLL's VCO kept between 400 and 1080 MHz (a 100 MHz input).
//   node research/s6/gen-dcm6.mjs [--fields] <out dir> [part]   -> <out dir>/<name>/{top.v, top.ucf, top.txt}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DCM_BASE = { CLKFX_MULTIPLY: 2, CLKFX_DIVIDE: 1, CLKDV_DIVIDE: '2.0', CLKIN_PERIOD: '10.0', CLK_FEEDBACK: '"1X"', CLKOUT_PHASE_SHIFT: '"NONE"', PHASE_SHIFT: 0 };
export const PLL_BASE = { CLKFBOUT_MULT: 4, DIVCLK_DIVIDE: 1, CLKOUT0_DIVIDE: 4, CLKOUT0_PHASE: '0.0', CLKIN_PERIOD: '10.0' };

/** The designs: { name: { kind: 'dcm' | 'pll', params, out (the output used) } }. */
export function dcmVariants() {
  const v = { dcm: { kind: 'dcm', params: {}, out: 'CLKFX' }, pll: { kind: 'pll', params: {}, out: 'CLKOUT0' } };
  for (const m of [3, 4, 5, 8]) v[`dcmM${m}`] = { kind: 'dcm', params: { CLKFX_MULTIPLY: m }, out: 'CLKFX' };
  for (const d of [2, 3]) v[`dcmD${d}`] = { kind: 'dcm', params: { CLKFX_DIVIDE: d }, out: 'CLKFX' };
  v.dcmDV = { kind: 'dcm', params: { CLKDV_DIVIDE: '4.0' }, out: 'CLKDV' };
  v.dcm0 = { kind: 'dcm', params: {}, out: 'CLK0' };
  v.dcmPS = { kind: 'dcm', params: { CLKOUT_PHASE_SHIFT: '"FIXED"', PHASE_SHIFT: 32 }, out: 'CLK0' };
  for (const m of [8, 2]) v[`pllM${m}`] = { kind: 'pll', params: { CLKFBOUT_MULT: m }, out: 'CLKOUT0' };
  for (const d of [8, 2]) v[`pllO${d}`] = { kind: 'pll', params: { CLKOUT0_DIVIDE: d }, out: 'CLKOUT0' };
  v.pllDIV2 = { kind: 'pll', params: { DIVCLK_DIVIDE: 2, CLKFBOUT_MULT: 8 }, out: 'CLKOUT0' };
  v.pllP90 = { kind: 'pll', params: { CLKOUT0_PHASE: '90.0' }, out: 'CLKOUT0' };
  return v;
}

/** The counters' other bits: each value one more power of two (the base's value is 2 or 4). */
export function fieldVariants() {
  const v = {};
  for (const m of [9, 17, 32]) v[`dcmM${m}`] = { kind: 'dcm', params: { CLKFX_MULTIPLY: m, CLKFX_DIVIDE: m > 16 ? 8 : 2 }, out: 'CLKFX' };
  for (const d of [5, 9, 17, 32]) v[`dcmD${d}`] = { kind: 'dcm', params: { CLKFX_DIVIDE: d }, out: 'CLKFX' };
  for (const dv of ['1.5', '2.5', '3.0', '5.0', '8.0', '16.0']) v[`dcmDV${dv.replace('.', '_')}`] = { kind: 'dcm', params: { CLKDV_DIVIDE: dv }, out: 'CLKDV' };
  // the PLL's VCO: 100 MHz x mult / divclk in 400 … 1080
  for (const [m, d] of [[5, 1], [9, 1], [17, 2], [33, 4], [64, 8]]) v[`pllM${m}D${d}`] = { kind: 'pll', params: { CLKFBOUT_MULT: m, DIVCLK_DIVIDE: d }, out: 'CLKOUT0' };
  for (const d of [3, 5, 9, 17, 33, 65, 128]) v[`pllO${d}`] = { kind: 'pll', params: { CLKOUT0_DIVIDE: d }, out: 'CLKOUT0' };
  for (const p of ['45.0', '180.0', '270.0']) v[`pllP${p.replace('.0', '')}`] = { kind: 'pll', params: { CLKOUT0_PHASE: p }, out: 'CLKOUT0' };
  return v;
}

/** A design's Verilog and UCF: the DCM or PLL at site, its output out through a BUFG to a flip-flop. */
export function dcmDesign({ kind, params, out }, { clk = 'V10', d = 'T10', q = 'U16', site }) {
  const p = { ...(kind === 'dcm' ? DCM_BASE : PLL_BASE), ...params }, gen = Object.entries(p).map(([k, v]) => `.${k}(${v})`).join(', ');
  const v = ['module top(input clk, input d, output reg q = 1\'b0);', '  wire fb, o, g;'];
  if (kind === 'dcm') {
    const fb = p.CLK_FEEDBACK === '"NONE"' ? '' : '.CLK0(fb0), .CLKFB(fb), ';
    v.push('  wire fb0;', p.CLK_FEEDBACK === '"NONE"' ? '' : '  BUFG bf(.I(fb0), .O(fb));',
      `  DCM_SP #(${gen}) cm(.CLKIN(clk), ${fb}${out === 'CLK0' ? '' : `.${out}(o), `}.RST(1'b0), .DSSEN(1'b0), .PSCLK(1'b0), .PSEN(1'b0), .PSINCDEC(1'b0));`);
    if (out === 'CLK0') v.push('  assign o = fb0;');
  } else {
    v.push(`  PLL_BASE #(${gen}) cm(.CLKIN(clk), .CLKFBIN(fb), .CLKFBOUT(fb), .${out}(o), .RST(1'b0));`);
  }
  v.push('  BUFG bo(.I(o), .O(g));', '  always @(posedge g) q <= d;', 'endmodule', '');
  const u = [`NET "clk" LOC = "${clk}" ;`, `NET "d" LOC = "${d}" ;`, `NET "q" LOC = "${q}" ;`, `INST "cm" LOC = "${site}" ;`];
  return { v: v.filter(Boolean).join('\n'), ucf: `${u.join('\n')}\n` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), fields = args[0] === '--fields', [out, part = 'xc6slx16csg324-3'] = fields ? args.slice(1) : args;
  if (!out) { console.error('usage: node research/s6/gen-dcm6.mjs [--fields] <out dir> [part]'); process.exit(1); }
  const vs = fields ? fieldVariants() : dcmVariants();
  for (const [name, x] of Object.entries(vs)) {
    const dir = path.join(out, name), site = x.kind === 'dcm' ? 'DCM_X0Y1' : 'PLL_ADV_X0Y0';
    fs.mkdirSync(dir, { recursive: true });
    const { v, ucf } = dcmDesign(x, { site });
    fs.writeFileSync(path.join(dir, 'top.v'), v);
    fs.writeFileSync(path.join(dir, 'top.ucf'), ucf);
    fs.writeFileSync(path.join(dir, 'top.txt'), 'top\n');
  }
  console.log(`${part}: ${Object.keys(vs).length} designs`);
}
