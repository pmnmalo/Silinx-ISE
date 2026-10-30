// nextpnr-himbaechel's routed design (spartan3e micro-architecture, #1954) to XDL, so that Silinx's bitgen writes
// its .bit and ISE checks it (xdl -xdl2ncd, drc): lib.mjs nextpnrToXdl.
//   node research/nextpnr-s3e/nextpnr-to-xdl.mjs routed.json out.xdl [part]
// routed.json: nextpnr's --write. The spike's cells only: LUT4, FF, IOB, BUFGMUX.
import fs from 'node:fs';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import { nextpnrToXdl } from './lib.mjs';
import { writeXdl } from '../../packages/silinx-fpga/src/xdl.js';

const [routedFile, outFile, part = 'xc3s250ecp132-4'] = process.argv.slice(2);
if (!outFile) { console.error('usage: nextpnr-to-xdl.mjs routed.json out.xdl [part]'); process.exit(2); }
const design = nextpnrToXdl(JSON.parse(fs.readFileSync(routedFile, 'utf8')), loadDeviceCache(part), part);
fs.writeFileSync(outFile, writeXdl(design));
console.log(`${outFile}: ${design.insts.length} instances, ${design.nets.length} nets, ${design.nets.reduce((s, x) => s + x.pips.length, 0)} PIPs`);
