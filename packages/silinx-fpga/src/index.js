// silinx-fpga's public API (#1678, step 7 of the toolchain's separation, #1651): what the package gives, the same
// in Node and in the browser (nothing here imports node:; ./node.js adds the loaders from the disk and Yosys in
// Node's workers). A name not exported here is the package's own and may change in any version.
//
// The flow: runFlow(spec, io) runs the steps (OPEN_STEPS) on a design, everything outside it through `io`
// (open-flow-core.js says what each hook is): the sources (flat Verilog; VHDL through io.frontEnd), the UCF, the
// device and its bit database, Yosys, the place and route (io.placeRoute, Silinx's own by default), the files it
// writes (the netlist, the placed and routed XDL, the .bit) and the report (utilisation, timing, power).

// the parts, the constraints, the steps' names, the XDL (the light entry, silinx-fpga/parts)
export * from './parts.js';

// the flow
export { runFlow, StepError, ISE_HINT } from './open-flow-core.js';
// a family's back end (open-flow-backends.js says what it is, #2360)
export { backendOf, registerBackend } from './open-flow-backends.js';

// synthesis: Verilog in (synthesisInput's { text, top }), a Yosys JSON netlist out
export { synthesizeVerilog, synthEffort, cellCounts } from './synth-open.js';
export { runYosysOnce, yosysWorkerSource, readableBlobs, asText } from './synth-open-yosys.js';
// nextpnr's WebAssembly package as the flow's io.nextpnr (the nextpnr engine, #2136; in Node: node.js nextpnrNode)
export { nextpnrIo } from './nextpnr-io.js';
export { gateAssignments, rewriteCarryChains } from './carry-chain.js';

// the netlist in (the constraints: ./parts.js)
export { readYosysJson, paramBits, paramInt } from './fpga/netlist.js';

// the implementation's steps, for a flow of one's own
export { pack, PackError } from './fpga/pack.js';
export { placeRouteBest } from './fpga/place-route.js';
export { checkRouting } from './fpga/route.js';
export { bitgen, knownRouting } from './fpga/bitgen.js';

// the bitstream out (the placed and routed design, XDL: ./parts.js)
export { readBit, writeBit, S3E_DEVICES } from './fpga/bitstream.js';

// the reports: timing and power
export { analyzeTiming, SPEED_4 } from './fpga/timing.js';
export { instArcs } from './fpga/timing-arcs.js';
export { timingReport } from './fpga/timing-checks.js';
export { estimatePower, powerReport } from './power.js';

// the devices and their bit databases, from their files' contents (./node.js reads them from the disk)
export { loadDevice } from './fpga/device.js';
export { makeBitDb, dbFileNames, dbFilesFrom, splitPart } from './fpga/bitdb.js';

// the Spartan-6: how far its open flow goes
export { s6OpenStatus } from './fpga/s6/devices.js';
