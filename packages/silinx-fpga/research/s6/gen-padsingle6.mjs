// #3169: designs of the Spartan-6 pads in the TIOB_SINGLE and BIOB_SINGLE tiles (the I/O tiles of one pad pair beside
// a clock column: the XC6SLX16's G9, F9, U11, V11, the XC6SLX45's G9, F9, R7, T7), to be implemented by ISE from HDL
// (ise-s6.sh impl): the PIPs of those tiles that take a pad's input to its IBUF wire (TIOB_IBUF0_PINW -> TIOB_IBUF0 …),
// then measured by PIP drop (gen-pipdrop6.mjs, ise-xdl-bits.sh, ana-pipdrop6.mjs; measure-3169-s6.sh). One design per
// pad: its input sampled by a flip-flop of the design's clock, the output on a pad of the board whose path is known
// (an LED: the Nexys3's U16, the Atlys's U18).
//   node research/s6/gen-padsingle6.mjs <out dir> [part]     (part: xc6slx16-csg324-3 (default) or xc6slx45-csg324-3)
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The pads of the *IOB_SINGLE tiles by part, as the device's sites give them (fpga/s6/pad-paths.js's inputs, #3169). */
export const SINGLE_PADS = { xc6slx16: ['G9', 'F9', 'U11', 'V11'], xc6slx45: ['G9', 'F9', 'R7', 'T7'] };

const v = pad => `// #3169 (gen-padsingle6.mjs): the input on ${pad}, sampled on clk
module top (input clk, input d, output reg q = 0);
  always @(posedge clk) q <= ~d;
endmodule
`;

/** The designs of a part: { name: { v, ucf } }. */
export function padSingleDesigns(part) {
  const lx45 = /lx45/.test(part);
  // the clock pin: the 100 MHz oscillator (V10 on the XC6SLX16 CSG324, L15 on the XC6SLX45's); the output an LED
  const [clk, led] = lx45 ? ['L15', 'U18'] : ['V10', 'U16'];
  const out = {};
  for (const pad of SINGLE_PADS[lx45 ? 'xc6slx45' : 'xc6slx16'])
    out[`i${pad.toLowerCase()}`] = { v: v(pad), ucf: `NET "clk" LOC = "${clk}" ;\nNET "d" LOC = "${pad}" ;\nNET "q" LOC = "${led}" ;\n` };
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, part = 'xc6slx16-csg324-3'] = process.argv.slice(2);
  const designs = padSingleDesigns(part);
  for (const [name, d] of Object.entries(designs)) {
    fs.mkdirSync(`${dir}/${name}`, { recursive: true });
    fs.writeFileSync(`${dir}/${name}/top.v`, d.v);
    fs.writeFileSync(`${dir}/${name}/top.ucf`, d.ucf);
    fs.writeFileSync(`${dir}/${name}/top.txt`, 'top\n');
  }
  console.log(Object.keys(designs).join(' '));
}
