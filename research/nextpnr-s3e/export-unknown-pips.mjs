// The PIPs nextpnr must not use (#1954): those whose bits Silinx's bit database does not know, as Silinx's
// own router is kept off them (fpga/bitgen.js knownRouting, allowPip). Per tile: the indices of its
// template's PIPs (the device graph's order, which the chip database generator s3e_gen.py reads).
//   node research/nextpnr-s3e/export-unknown-pips.mjs <part> out.json
import fs from 'node:fs';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import { knownRouting } from '../../packages/silinx-fpga/src/fpga/bitgen.js';
import { loadDb } from '../../packages/silinx-fpga/src/fpga/bitdb-node.js';

const [part, outFile] = process.argv.slice(2);
const device = loadDeviceCache(part);
const { allowPip } = knownRouting(loadDb(part));
const out = {};
let total = 0, unknown = 0;
for (let k = 0; k < device.tileCount; k++) {
  const tp = device.templates[device.tileTemplate[k]], bad = [];
  for (let i = 0; i < tp.from.length; i++) {
    const p = device.pip(k, i);
    if (p.routethru) continue;
    total++;
    if (!allowPip(p.tile, p.from, p.to)) bad.push(i);
  }
  if (bad.length) out[device.tileName(k)] = bad;
  unknown += bad.length;
}
fs.writeFileSync(outFile, JSON.stringify(out));
console.log(`${outFile}: ${unknown} of ${total} PIPs not allowed, in ${Object.keys(out).length} tiles`);
