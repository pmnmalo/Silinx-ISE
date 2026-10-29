// The DCM tiles' switches from their VCC site (#190): DCM_VCC_WIRE -> DCM_G1_B1 / B2 / B3, DCM_PSCLK,
// DCM_CLKFB and on to the DCM's pins (PSEN, PSINCDEC, RST, PSCLK, CLKFB), the way ISE ties a DCM pin
// to 1. One design: in every DCM tile of the part, a net of the constant 1 from the tile's VCC site
// through all of them (bitgen programs every PIP of a net with pins: its sink, a slice input, is left
// unrouted); gen-pipdrop.mjs then removes them by codewords and ana-pipdrop.mjs gives their bits.
//   PART=xc3s250ecp132-4 node gen-dcmvcc.mjs out.xdl
import fs from 'node:fs';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import { PART } from './db.mjs';

const dev = loadDeviceCache(PART);
const insts = [], nets = [];
// a free slice for each net's (unrouted) sink: the first SLICEL sites of the chip
const sinks = dev.sites('SLICEL').map(s => s.name).sort();
for (let k = 0; k < dev.tileCount; k++) {
  const tp = dev.templates[dev.tileTemplate[k]];
  const w = tp.local.get('DCM_VCC_WIRE');
  if (w === undefined) continue;
  const tile = dev.tileNames[k];
  const vcc = tp.sites.findIndex(s => s.type === 'VCC');
  const site = dev.tileSites[k][vcc][0];
  const pips = [];
  for (let i = 0; i < tp.from.length; i++) {
    if (tp.from[i] !== w) continue;
    const [, to] = dev.pipWires(k, i);
    pips.push(`  pip ${tile} DCM_VCC_WIRE -> ${to} ,`);
    // and on to the DCM's pin
    for (let j = 0; j < tp.from.length; j++) if (tp.from[j] === tp.to[i]) { const [a, b] = dev.pipWires(k, j); if (/_PINWIRE$/.test(b)) pips.push(`  pip ${tile} ${a} -> ${b} ,`); }
  }
  const sink = sinks[nets.length];
  insts.push(`inst "v${nets.length}" "VCC",placed ${tile} ${site} ,\n  cfg " _NO_USER_LOGIC:: _VCC_SOURCE::VCCOUT "\n  ;`);
  insts.push(`inst "s${nets.length}" "SLICEL",placed ${dev.tileNames[dev.siteIndex.get(sink)[0]]} ${sink} ,\n  cfg " F:s${nets.length}_f:#LUT:D=A1 FXMUX::F XUSED::0 "\n  ;`);
  nets.push(`net "vcc${nets.length}" vcc ,\n  outpin "v${nets.length}" VCCOUT ,\n  inpin "s${nets.length}" F1 ,\n${pips.join('\n')}\n  ;`);
}
fs.writeFileSync(process.argv[2], `design "dcmvcc" ${PART} v3.2 ,\n  cfg "";\n${insts.join('\n')}\n${nets.join('\n')}\n`);
console.log(`${nets.length} DCM tiles`);
