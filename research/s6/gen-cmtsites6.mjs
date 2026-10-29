// Stage S6-E2 (#1951): the clock paths of every CMT site, on designs ISE implements (ise-s6.sh impl): a DCM_SP or
// PLL_BASE at each site, its clock from a clock pad of its half (bank 0 the top's, 2 the bottom's) or of the sides
// (banks 1 and 3), three outputs through BUFGs at BUFGMUXes in turn to flip-flops. Their PIP drop (gen-pipdrop6.mjs)
// takes the paths' PIPs apart (the CMT, REG and IOI tiles' that #727's designs had always together); what is left of
// them is the sites' (BUFIO2, BUFGMUX, the CMT's inputs).
//   node research/s6/gen-cmtsites6.mjs [--outputs | --muxes] <out dir> [part] [per site]   -> <out dir>/<name>/{top.v, top.ucf, top.txt}
// (--outputs: each output alone, per site: the CMT tile's output chains apart; --muxes: each BUFGMUX from each CMT)
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

/** Every output of a CMT kind, one per design (#1951 part 2): the DCM's with CLK0 its feedback, the PLL's. */
export const DCM_ALL = ['CLK90', 'CLK180', 'CLK270', 'CLK2X', 'CLK2X180', 'CLKDV', 'CLKFX', 'CLKFX180'];
export const PLL_ALL = [0, 1, 2, 3, 4, 5].map(k => [`CLKOUT${k}`, 4 << (k % 3)]);

/** The one-output designs: per CMT site, each output alone, from one pad of its half to one BUFGMUX. */
export function cmtOutputDesigns(part) {
  const { device, sites } = s6Device(part), pads = [...sites.pads.values()].filter(p => p.bufg.length);
  const muxes = device.sites().filter(s => s.type === 'BUFGMUX').map(s => s.name).sort();
  const cmts = device.sites().filter(s => /^(DCM|PLL_ADV)$/.test(s.type)).sort((a, b) => (a.name < b.name ? -1 : 1));
  return cmts.flatMap((s, si) => {
    const own = pads.filter(p => p.bank === (/TOP/.test(s.tileName) ? 0 : 2)).map(p => p.name), pad = own[si % own.length], bufg = muxes[(3 * si) % muxes.length];
    const outs = s.type === 'DCM' ? DCM_ALL : PLL_ALL;
    return outs.map(o => ({ name: `${s.name}-${Array.isArray(o) ? o[0] : o}`, kind: s.type === 'DCM' ? 'dcm' : 'pll', site: s.name, pad, bufgs: [bufg], outs: [o] }));
  });
}

/**
 * The BUFGMUX designs (#1951): per CMT site, from the board's clock pad (V10; a top site's from C10) two outputs (the
 * DCM's CLKFX and CLK2X, the PLL's CLKOUT0 and CLKOUT1) on BUFGMUXes k and k + 8, the DCM's feedback at a fixed one:
 * each BUFGMUX's path from each CMT output, one thing changed at a time.
 */
export function cmtMuxDesigns(part) {
  const { device } = s6Device(part), muxes = device.sites().filter(s => s.type === 'BUFGMUX').map(s => s.name).sort();
  const cmts = device.sites().filter(s => /^(DCM|PLL_ADV)$/.test(s.type)).sort((a, b) => (a.name < b.name ? -1 : 1));
  return cmts.flatMap(s => Array.from({ length: 8 }, (_, k) => {
    const bufgs = [muxes[k], muxes[k + 8]], fb = ['BUFGMUX_X2Y3', 'BUFGMUX_X2Y2'].find(m => !bufgs.includes(m)), dcm = s.type === 'DCM';
    return { name: `${s.name}-m${k}`, kind: dcm ? 'dcm' : 'pll', site: s.name, pad: /TOP/.test(s.tileName) ? 'C10' : 'V10', bufgs, fb,
      outs: dcm ? ['CLKFX', 'CLK2X'] : [['CLKOUT0', 4], ['CLKOUT1', 8]] };
  }));
}

/**
 * A design's Verilog and UCF: the CMT at site from pad, its outputs (outs: the DCM's names, the PLL's [name, divider];
 * the three of DCM_OUTS / PLL_OUTS by default) through BUFGs at bufgs to flip-flops.
 */
export function cmtSiteDesign({ kind, site, pad, bufgs, outs = kind === 'dcm' ? DCM_OUTS : PLL_OUTS, fb = null }, { d = 'V3', q = 'U16' } = {}) {
  const n = outs.length, v = ['module top(input clk, input d, output q);', `  wire [${n - 1}:0] o, g;`, `  reg [${n - 1}:0] r = ${n}'b0;`];
  if (kind === 'dcm') {
    const gen = Object.entries(DCM_BASE).map(([k, x]) => `.${k}(${x})`).join(', ');
    v.push('  wire fb0, fb;', '  BUFG bf(.I(fb0), .O(fb));',
      `  DCM_SP #(${gen}) cm(.CLKIN(clk), .CLK0(fb0), .CLKFB(fb), ${outs.map((x, i) => `.${x}(o[${i}])`).join(', ')}, .RST(1'b0), .DSSEN(1'b0), .PSCLK(1'b0), .PSEN(1'b0), .PSINCDEC(1'b0));`);
  } else {
    const gen = Object.entries({ ...PLL_BASE, ...Object.fromEntries(outs.map(([x, k]) => [`${x}_DIVIDE`, k])) }).map(([k, x]) => `.${k}(${x})`).join(', ');
    v.push('  wire fb;', `  PLL_BASE #(${gen}) cm(.CLKIN(clk), .CLKFBIN(fb), .CLKFBOUT(fb), ${outs.map(([x], i) => `.${x}(o[${i}])`).join(', ')}, .RST(1'b0));`);
  }
  for (let i = 0; i < n; i++) v.push(`  BUFG b${i}(.I(o[${i}]), .O(g[${i}]));`, `  always @(posedge g[${i}]) r[${i}] <= d ^ r[${(i + n - 1) % n}];`);
  v.push('  assign q = ^r;', 'endmodule', '');
  const u = [`NET "clk" LOC = "${pad}" ;`, `NET "d" LOC = "${d}" ;`, `NET "q" LOC = "${q}" ;`, `INST "cm" LOC = "${site}" ;`, ...bufgs.map((b, i) => `INST "b${i}" LOC = "${b}" ;`), ...(fb && kind === 'dcm' ? [`INST "bf" LOC = "${fb}" ;`] : [])];
  return { v: v.join('\n'), ucf: `${u.join('\n')}\n` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), mode = /^--(outputs|muxes)$/.test(args[0]) ? args[0] : null, [out, part = 'xc6slx16csg324-3', per = '8'] = mode ? args.slice(1) : args;
  if (!out) { console.error('usage: node research/s6/gen-cmtsites6.mjs [--outputs | --muxes] <out dir> [part] [per site]'); process.exit(1); }
  const ds = mode === '--outputs' ? cmtOutputDesigns(part) : mode === '--muxes' ? cmtMuxDesigns(part) : cmtSiteDesigns(part, +per);
  for (const x of ds) {
    const dir = path.join(out, x.name), { v, ucf } = cmtSiteDesign(x);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'top.v'), v); fs.writeFileSync(path.join(dir, 'top.ucf'), ucf); fs.writeFileSync(path.join(dir, 'top.txt'), 'top\n');
  }
  console.log(`${part}: ${ds.length} designs`);
}
