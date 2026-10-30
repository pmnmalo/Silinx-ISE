// The PIPs nextpnr must not use (#1954): those whose bits Silinx's bit database does not know (lib.mjs
// unknownPips), per tile, for the chip database's generator (s3e_gen.py --unknown-pips).
//   node research/nextpnr-s3e/export-unknown-pips.mjs <part> out.json
import fs from 'node:fs';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import { loadDb } from '../../packages/silinx-fpga/src/fpga/bitdb-node.js';
import { unknownPips } from './lib.mjs';

const [part, outFile] = process.argv.slice(2);
const { pips, total, unknown } = unknownPips(loadDeviceCache(part), loadDb(part));
fs.writeFileSync(outFile, JSON.stringify(pips));
console.log(`${outFile}: ${unknown} of ${total} PIPs not allowed, in ${Object.keys(pips).length} tiles`);
