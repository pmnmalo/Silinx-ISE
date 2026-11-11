// The Spartan-6's PIPs nextpnr must not use (#2138): those whose bits Silinx's bit database does not know, per tile,
// for the chip database's generator (the fork's s6_gen.py --unknown-pips). The PIPs measured but held out of Silinx's
// flow until the chip database has them (bitdb/s6/s6-pips-held.json, #3349) count as known: the chip database gets them
// first, Silinx's bit database once the fork's release is pinned.
//   node packages/silinx-fpga/research/nextpnr-s6/export-unknown-pips.mjs <part> out.json
import fs from 'node:fs';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { loadBitDbS6 } from '../../src/fpga/s6/bitdb-node.js';
import { unknownPipsS6 } from '../../src/fpga/s6/nextpnr-export.js';

const [part, outFile] = process.argv.slice(2);
const { pips, total, unknown } = unknownPipsS6(loadDeviceCache(part), loadBitDbS6(part, { held: true }));
fs.writeFileSync(outFile, JSON.stringify(pips));
console.log(`${outFile}: ${unknown} of ${total} PIPs not allowed, in ${Object.keys(pips).length} tiles`);
