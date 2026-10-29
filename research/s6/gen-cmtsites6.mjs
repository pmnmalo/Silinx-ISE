// Stage S6-E2 (#1951): the clock paths of every CMT site, on designs ISE implements (ise-s6.sh impl): a DCM_SP or
// PLL_BASE at each site, its clock from a clock pad of its half (bank 0 the top's, 2 the bottom's) or of the sides
// (banks 1 and 3), three outputs through BUFGs at BUFGMUXes in turn to flip-flops. Their PIP drop (gen-pipdrop6.mjs)
// takes the paths' PIPs apart (the CMT, REG and IOI tiles' that #727's designs had always together); what is left of
// them is the sites' (BUFIO2, BUFGMUX, the CMT's inputs).
//   node research/s6/gen-cmtsites6.mjs <out dir> [part] [per site]   -> <out dir>/<site>-<pad>/{top.v, top.ucf, top.txt}
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DCM_BASE, PLL_BASE } from './gen-dcm6.mjs';
import { s6Device } from '../../test/s6-lib.mjs';

/** The DCM's outputs used (CLK0 its feedback) and the PLL's, each with its divider. */
export const DCM_OUTS = ['CLKFX', 'CLK2X', 'CLKDV'];
export const PLL_OUTS = [['CLKOUT0', 4], ['CLKOUT1', 8], ['CLKOUT2', 16]];

/**
 * The designs of a part: [{ name, kind, site, pad, bufgs }], per CMT site `per` of them, its half's pads and the sides'
 * in turn, the BUFGMUXes three at a time in turn (shifted by site, so each meets others).
 */
export function cmtSiteDesigns(part, per = 8) {
  const { device, sites } = s6Device(part), pads = [...sites.pads.values()].filter(p => p.bufg.length);
  const bank = b => pads.filter(p => p.bank === b).map(p => p.name), sides = [...bank(1), ...bank(3)];
  const muxes = device.sites().filter(s => s.type === 'BUFGMUX').map(s => s.name).sort();
  const cmts = device.sites().filter(s => /^(DCM|PLL_ADV)$/.test(s.type)).sort((a, b) => (a.name < b.name ? -1 : 1)), out = [];
  cmts.forEach((s, si) => {
    const own = bank(/TOP/.test(s.tileName) ? 0 : 2);
    for (let k = 0; k < per; k++) {
      const pad = k % 2 === 0 ? own[(k / 2 + si) % own.length] : sides[((k - 1) / 2 * 4 + si) % sides.length];
      const bufgs = [0, 1, 2].map(i => muxes[(3 * k + 5 * si + i) % muxes.length]);
      out.push({ name: `${s.name}-${pad}`, kind: s.type === 'DCM' ? 'dcm' : 'pll', site: s.name, pad, bufgs });
    }
  });
  return out;
}

/** A design's Verilog and UCF: the CMT at site from pad, its three outputs through BUFGs at bufgs to flip-flops. */
export function cmtSiteDesign({ kind, site, pad, bufgs }, { d = 'V3', q = 'U16' } = {}) {
  const v = ['module top(input clk, input d, output q);', '  wire [2:0] o, g;', '  reg [2:0] r = 3\'b0;'];
  if (kind === 'dcm') {
    const gen = Object.entries(DCM_BASE).map(([k, x]) => `.${k}(${x})`).join(', ');
    v.push('  wire fb0, fb;', '  BUFG bf(.I(fb0), .O(fb));',
      `  DCM_SP #(${gen}) cm(.CLKIN(clk), .CLK0(fb0), .CLKFB(fb), ${DCM_OUTS.map((x, i) => `.${x}(o[${i}])`).join(', ')}, .RST(1'b0), .DSSEN(1'b0), .PSCLK(1'b0), .PSEN(1'b0), .PSINCDEC(1'b0));`);
  } else {
    const gen = Object.entries({ ...PLL_BASE, ...Object.fromEntries(PLL_OUTS.map(([x, n]) => [`${x}_DIVIDE`, n])) }).map(([k, x]) => `.${k}(${x})`).join(', ');
    v.push('  wire fb;', `  PLL_BASE #(${gen}) cm(.CLKIN(clk), .CLKFBIN(fb), .CLKFBOUT(fb), ${PLL_OUTS.map(([x], i) => `.${x}(o[${i}])`).join(', ')}, .RST(1'b0));`);
  }
  for (let i = 0; i < 3; i++) v.push(`  BUFG b${i}(.I(o[${i}]), .O(g[${i}]));`, `  always @(posedge g[${i}]) r[${i}] <= d ^ r[${(i + 2) % 3}];`);
  v.push('  assign q = ^r;', 'endmodule', '');
  const u = [`NET "clk" LOC = "${pad}" ;`, `NET "d" LOC = "${d}" ;`, `NET "q" LOC = "${q}" ;`, `INST "cm" LOC = "${site}" ;`, ...bufgs.map((b, i) => `INST "b${i}" LOC = "${b}" ;`)];
  return { v: v.join('\n'), ucf: `${u.join('\n')}\n` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [out, part = 'xc6slx16csg324-3', per = '8'] = process.argv.slice(2);
  if (!out) { console.error('usage: node research/s6/gen-cmtsites6.mjs <out dir> [part] [per site]'); process.exit(1); }
  const ds = cmtSiteDesigns(part, +per);
  for (const x of ds) {
    const dir = path.join(out, x.name), { v, ucf } = cmtSiteDesign(x);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'top.v'), v); fs.writeFileSync(path.join(dir, 'top.ucf'), ucf); fs.writeFileSync(path.join(dir, 'top.txt'), 'top\n');
  }
  console.log(`${part}: ${ds.length} designs`);
}
