// #3350 (#3169): designs of the Spartan-6 top bank's slave pads of the TIOI_OUTER tiles (the XC6SLX16's C4, C6, A4,
// E6, E8, C8, F8, C9, C11, F9, A11, A12, C12, E12, E13, C14; the XC6SLX45's C4, C6, A4, A7, C8, C9, C11, F9, A11,
// A13, E13, C14), to be implemented by ISE from HDL (ise-s6.sh impl): the slave OLOGIC2's route-through
// D1_OLOGIC_SITE_S -> OQ_OLOGIC_SITE_S, which the databases have not (the master's 26,32 27,29 28,49; TIOI_INNER's and BIOI_*'s slave
// 26,35 27,48 28,14), then measured by PIP drop (gen-pipdrop6.mjs, ise-xdl-bits.sh, ana-pipdrop6.mjs;
// GEN=gen-padout6.mjs measure-3169-s6.sh). Two designs a part, each with its output on one such pad, from a LUT (so that
// it takes D1 -> OQ, no flip-flop in the OLOGIC2); the input on the board's first switch.
//   node research/s6/gen-padout6.mjs <out dir> [part]     (part: xc6slx16-csg324-3 (default) or xc6slx45-csg324-3)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The TIOI_OUTER slave pads each part's designs take (a pad at each end of the bank). */
export const OUTER_SLAVE_PADS = { xc6slx16: ['C4', 'E13'], xc6slx45: ['C4', 'A13'] };

const v = pad => `// #3350 (gen-padout6.mjs): the output on ${pad}, from a LUT
module top (input clk, input d, output q);
  reg r = 0;
  always @(posedge clk) r <= ~r;
  assign q = r ^ d;
endmodule
`;

/** The designs of a part: { name: { v, ucf } }. */
export function padOutDesigns(part) {
  const lx45 = /lx45/.test(part);
  // the clock pin: the 100 MHz oscillator (V10 on the XC6SLX16 CSG324, L15 on the XC6SLX45's); the input a switch
  const [clk, sw] = lx45 ? ['L15', 'A10'] : ['V10', 'T10'];
  const out = {};
  for (const pad of OUTER_SLAVE_PADS[lx45 ? 'xc6slx45' : 'xc6slx16'])
    out[`o${pad.toLowerCase()}`] = { v: v(pad), ucf: `NET "clk" LOC = "${clk}" ;\nNET "d" LOC = "${sw}" ;\nNET "q" LOC = "${pad}" ;\n` };
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, part = 'xc6slx16-csg324-3'] = process.argv.slice(2);
  const designs = padOutDesigns(part);
  for (const [name, d] of Object.entries(designs)) {
    fs.mkdirSync(`${dir}/${name}`, { recursive: true });
    fs.writeFileSync(`${dir}/${name}/top.v`, d.v);
    fs.writeFileSync(`${dir}/${name}/top.ucf`, d.ucf);
    fs.writeFileSync(`${dir}/${name}/top.txt`, 'top\n');
  }
  console.log(Object.keys(designs).join(' '));
}
