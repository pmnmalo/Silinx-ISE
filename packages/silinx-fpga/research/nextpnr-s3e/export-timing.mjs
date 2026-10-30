// Silinx's delay model (fpga/timing.js SPEED_4, fitted to ISE's trce) for nextpnr's chip database (#1954, lib.mjs
// timingExport): the class of the node each PIP drives, per template of the device graph, and the model's delays,
// for the generator (s3e_gen.py --timing).
//   node packages/silinx-fpga/research/nextpnr-s3e/export-timing.mjs <part> out.json
import fs from 'node:fs';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { timingExport } from './lib.mjs';

const [part, outFile] = process.argv.slice(2);
const { timing, disagree } = timingExport(loadDeviceCache(part));
fs.writeFileSync(outFile, JSON.stringify(timing));
console.log(`${outFile}: ${Object.keys(timing.pipClass).length} templates, ${disagree} template PIPs whose tiles disagree on the class`);
