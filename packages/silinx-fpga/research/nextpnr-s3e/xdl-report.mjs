// The size and speed of a routed XDL design, as the Silinx toolchain reports its own (#1954: nextpnr's result and
// Silinx's measured the same way): the slices, LUTs and flip-flops used (lib.mjs xdlSize), and each clock's minimum
// period by Silinx's static timing analysis (fpga/timing.js, fitted to ISE's trce).
//   node research/nextpnr-s3e/xdl-report.mjs routed.xdl [part]
import fs from 'node:fs';
import { parseXdl } from '../../src/xdl.js';
import { analyzeTiming, timingReport } from '../../src/fpga/timing.js';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { xdlSize } from './lib.mjs';

const [file, part] = process.argv.slice(2);
const design = parseXdl(fs.readFileSync(file, 'utf8'));
const { slices, luts, ffs } = xdlSize(design);
console.log(`${file}: ${slices} slices, ${luts} LUTs, ${ffs} flip-flops`);
const sta = analyzeTiming(design, loadDeviceCache(part || design.part), { clocks: [] });
for (const l of timingReport(sta, [])) if (/^clock/.test(l)) console.log(l);
