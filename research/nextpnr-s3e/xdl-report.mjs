// The size and speed of a routed XDL design, as the Silinx toolchain reports its own (#1954: nextpnr's
// result and Silinx's measured the same way): the slices, LUTs and flip-flops used, and each clock's
// minimum period by Silinx's static timing analysis (fpga/timing.js, fitted to ISE's trce).
//   node research/nextpnr-s3e/xdl-report.mjs routed.xdl [part]
import fs from 'node:fs';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { analyzeTiming, timingReport } from '../../packages/silinx-fpga/src/fpga/timing.js';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';

const [file, part] = process.argv.slice(2);
const design = parseXdl(fs.readFileSync(file, 'utf8'));
const slices = design.insts.filter(i => /^SLICE[LM]$/.test(i.type));
const has = attr => slices.reduce((n, i) => n + i.cfg.filter(c => c.attr === attr).length, 0);
console.log(`${file}: ${slices.length} slices, ${has('F') + has('G')} LUTs, ${has('FFX') + has('FFY')} flip-flops`);
const sta = analyzeTiming(design, loadDeviceCache(part || design.part), { clocks: [] });
for (const l of timingReport(sta, [])) if (/^clock/.test(l)) console.log(l);
