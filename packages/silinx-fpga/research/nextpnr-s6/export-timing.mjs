// The Spartan-6's delay model for nextpnr's chip database (#2138; the fork's s6_gen.py --timing).
//   node packages/silinx-fpga/research/nextpnr-s6/export-timing.mjs <part> out.json
import fs from 'node:fs';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { timingExportS6 } from '../../src/fpga/s6/nextpnr-export.js';

const [part, outFile] = process.argv.slice(2);
const timing = timingExportS6(loadDeviceCache(part));
fs.writeFileSync(outFile, JSON.stringify(timing));
console.log(`${outFile}: ${timing.wire.length} wire classes`);
