// Does the XDL written by nextpnr-to-xdl.mjs implement nextpnr's netlist? (#1954) lib.mjs simCheck: both simulated,
// every flip-flop compared after each rising edge (ISE's DRC cannot tell a wrong LUT equation).
//   node research/nextpnr-s3e/xdl-sim-check.mjs routed.json design.xdl [cycles] [input=value ...] [--starts N]
// Inputs (top ports) are 0 unless given (e.g. rst=1). --starts N: then N runs of 64 cycles from random states (a
// counter's top bits without 2^n cycles). Exits 1 at the first difference, naming the flip-flop.
import fs from 'node:fs';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { simCheck } from './lib.mjs';

const argv = process.argv.slice(2);
const si = argv.indexOf('--starts'), starts = si >= 0 ? +argv.splice(si, 2)[1] : 0;
const [jsonFile, xdlFile, cycles = '100000', ...inputArgs] = argv;
const inputs = Object.fromEntries(inputArgs.map(a => a.split('=')).map(([k, v]) => [k, +v]));
const r = simCheck(JSON.parse(fs.readFileSync(jsonFile, 'utf8')), parseXdl(fs.readFileSync(xdlFile, 'utf8')), { cycles: +cycles, starts, inputs });
if (!r.ok) { console.log(r.message); process.exit(1); }
console.log(`${cycles} cycles${starts ? ` and ${starts} random starts` : ''}: the XDL's ${r.flipFlops} flip-flops follow the netlist's`);
