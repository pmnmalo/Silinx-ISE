// Does the XDL written by nextpnr-to-xdl.mjs implement nextpnr's netlist? (#1954) lib.mjs simCheck: both simulated,
// every flip-flop compared after each clock edge (ISE's DRC cannot tell a wrong LUT equation).
//   node packages/silinx-fpga/research/nextpnr-s3e/xdl-sim-check.mjs routed.json design.xdl [cycles] [input=value ...] [--starts N] [--random-inputs]
// Inputs (top ports, a bus's bits name[i]) are 0 unless given (e.g. rst=1). --starts N: then N runs of 64 cycles from
// random states (a counter's top bits without 2^n cycles). --random-inputs: new random inputs before each edge (an IOB
// register's edge, a reset taken). Exits 1 at the first difference, naming the flip-flop.
import fs from 'node:fs';
import { parseXdl } from '../../src/xdl.js';
import { simCheck } from './lib.mjs';

const argv = process.argv.slice(2);
const si = argv.indexOf('--starts'), starts = si >= 0 ? +argv.splice(si, 2)[1] : 0;
const ri = argv.indexOf('--random-inputs'), randomInputs = ri >= 0 && !!argv.splice(ri, 1);
const [jsonFile, xdlFile, cycles = '100000', ...inputArgs] = argv;
const inputs = Object.fromEntries(inputArgs.map(a => a.split('=')).map(([k, v]) => [k, +v]));
const r = simCheck(JSON.parse(fs.readFileSync(jsonFile, 'utf8')), parseXdl(fs.readFileSync(xdlFile, 'utf8')), { cycles: +cycles, starts, inputs, randomInputs });
if (!r.ok) { console.log(r.message); process.exit(1); }
console.log(`${cycles} cycles${randomInputs ? ' of random inputs' : ''}${starts ? ` and ${starts} random starts` : ''}: the XDL's ${r.flipFlops} flip-flops follow the netlist's`);
