// #3, the measured description: an observation design for the slices' clock-enable and set / reset pins, implemented by
// ISE from HDL (impl-remote.sh). A sink pin is read when it is its net's one sink in its tile (observe.mjs), and the CE /
// SR nets of ISE's designs mostly reach several slices of a tile: the SLICEM's CE and the break rows' CE / SR were never
// seen. Here every slice (LOC'd) a flip-flop (FDRE, instantiated: no shift register), its CE, R and D on the nets of its
// position in its tile (4 of each: one sink per tile), the flip-flops a chain into the output.
//   node gen-obsslice.mjs outdir      (folder slices: top.v, top.ucf)
import fs from 'node:fs';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PART = process.env.PART || 'xc3s250ecp132-4';

/** Every slice a flip-flop on its position's CE, R and D nets: { v, ucf, slices }. */
export function sliceDesign(dev, part = PART) {
  const slices = [...dev.sites('SLICEL'), ...dev.sites('SLICEM')].map(s => s.name).sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
  const pos = s => { const [x, y] = s.match(/X(\d+)Y(\d+)$/).slice(1).map(Number); return 2 * (x % 2) + (y % 2); };
  const body = slices.map((s, i) => `  FDRE f${i} (.C(clk), .CE(ce[${pos(s)}]), .R(sr[${pos(s)}]), .D(d[${pos(s)}] ^ q[${i ? i - 1 : slices.length - 1}]), .Q(q[${i}]));`).join('\n');
  const v = `// ${part}: every slice a flip-flop, its CE, R and D on its position's nets (#3, the slices' pins: research/s3e-device
// gen-obsslice.mjs)
module top(input clk, input [3:0] ce, input [3:0] sr, input [3:0] d, output o);
  wire [${slices.length - 1}:0] q;
${body}
  assign o = q[${slices.length - 1}];
endmodule
`;
  const ucf = slices.map((s, i) => `INST "f${i}" LOC = "${s}" ;`).join('\n') + '\n';
  return { v, ucf, slices: slices.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [out] = process.argv.slice(2);
  const { v, ucf, slices } = sliceDesign(loadDeviceCache(PART));
  fs.mkdirSync(`${out}/slices`, { recursive: true });
  fs.writeFileSync(`${out}/slices/top.v`, v);
  fs.writeFileSync(`${out}/slices/top.ucf`, ucf);
  console.log(`${PART}: ${slices} slices`);
}
