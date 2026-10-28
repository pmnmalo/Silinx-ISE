// #3, the measured description: an observation design for the slices' wide-multiplexer and carry-output pins (F5, FX,
// FXINA, FXINB, XB, YB), implemented by ISE from HDL (impl-remote.sh), placed by ISE all over the chip. XST builds a 16:1
// multiplexer from MUXF5 to MUXF8 (one CLB: F5, FX and FXINA / FXINB at every position) and a comparator on the carry
// chain (its result out through XB / YB). Each multiplexer a permutation of its own of the shared data and selects (or
// XST merges them), each comparator a rotation of its own; every result registered, into the output.
//   node gen-obsmux.mjs outdir [muxes] [comparators=60]      (folder muxes: top.v, top.ucf; muxes: muxCount, 300 on the
//                                                             XC3S250E)
import fs from 'node:fs';
import { loadDeviceCache } from '../../core/fpga/device-node.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PART = process.env.PART || 'xc3s250ecp132-4';

/** The part's multiplexers: 300, or a quarter of its SLICEMs where it has fewer (a multiplexer takes two SLICEMs; the
 *  XC3S100E's 480 hold 120). */
export const muxCount = dev => Math.min(300, Math.floor(dev.sites('SLICEM').length / 4));

/** { v, ucf }: n 16:1 multiplexers, c 16-bit comparators. */
export function muxDesign(n = 300, c = 60, part = PART) {
  // (a permutation of 0..15 and of 0..3 for each multiplexer: the data rotated and possibly reversed, the selects permuted)
  const perms4 = [];
  const p4 = (a, l = []) => { if (!a.length) perms4.push(l); a.forEach((x, i) => p4([...a.slice(0, i), ...a.slice(i + 1)], [...l, x])); };
  p4([0, 1, 2, 3]);
  const muxes = Array.from({ length: n }, (_, i) => {
    const rot = i % 16, rev = (i >> 4) % 2, sel = perms4[(i >> 5) % 24];
    const data = Array.from({ length: 16 }, (_, k) => (rev ? 15 - (k + rot) % 16 : (k + rot) % 16));
    return `  wire [15:0] md${i} = {${data.reverse().map(k => `d[${k}]`).join(', ')}};
  wire [3:0] ms${i} = {${[...sel].reverse().map(k => `s[${k}]`).join(', ')}};
  always @(posedge clk) m[${i}] <= md${i}[ms${i}];`;
  });
  // (a 16-bit value rotated left by r)
  const rot = (x, r) => (r % 16 ? `{${x}[${15 - (r % 16)}:0], ${x}[15:${16 - (r % 16)}]}` : x);
  const cmps = Array.from({ length: c }, (_, i) => `  always @(posedge clk) k[${i}] <= ${rot('a', i)} > ${rot('b', 3 * i + 1)};`);
  const v = `// ${part}: ${n} 16:1 multiplexers (MUXF5-MUXF8), ${c} comparators (the carry chain out through XB / YB) (#3, the slices'
// pins: research/s3e-device gen-obsmux.mjs)
module top(input clk, input [15:0] di, input [3:0] si, input [15:0] ai, input [15:0] bi, output o);
  reg [15:0] d, a, b; reg [3:0] s;
  always @(posedge clk) begin d <= di; s <= si; a <= ai; b <= bi; end
  reg [${n - 1}:0] m; reg [${c - 1}:0] k;
${muxes.join('\n')}
${cmps.join('\n')}
  assign o = ^m ^ ^k;
endmodule
`;
  return { v, ucf: '' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [out, n = muxCount(loadDeviceCache(PART)), c = '60'] = process.argv.slice(2);
  const { v, ucf } = muxDesign(+n, +c);
  fs.mkdirSync(`${out}/muxes`, { recursive: true });
  fs.writeFileSync(`${out}/muxes/top.v`, v);
  fs.writeFileSync(`${out}/muxes/top.ucf`, ucf);
  console.log(`${PART}: ${n} multiplexers, ${c} comparators`);
}
