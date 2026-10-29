// silinx-fpga's public API (#1678, step 7 of the toolchain's separation, #1651): what the package gives, the same
// in Node and in the browser (nothing here imports node:; ./node.js adds the loaders from the disk and Yosys in
// Node's workers). A name not exported here is the package's own and may change in any version.
//
// The flow: runFlow(spec, io) runs the steps (OPEN_STEPS) on a design, everything outside it through `io`
// (open-flow-core.js says what each hook is): the sources (flat Verilog; VHDL through io.frontEnd), the UCF, the
// device and its bit database, Yosys, the place and route (io.placeRoute, Silinx's own by default), the files it
// writes (the netlist, the placed and routed XDL, the .bit) and the report (utilisation, timing, power).

// the flow and its steps
export { runFlow, StepError, ISE_HINT } from './open-flow-core.js';
export { OPEN_STEPS, OPEN_CHAIN, orderOpenSteps } from './open-steps.js';

// synthesis: Verilog in (synthesisInput's { text, top }), a Yosys JSON netlist out
export { synthesizeVerilog, synthEffort, cellCounts } from './synth-open.js';
export { runYosysOnce, yosysWorkerSource, readableBlobs, asText } from './synth-open-yosys.js';
export { gateAssignments, rewriteCarryChains } from './carry-chain.js';

// the netlist and the constraints in
export { readYosysJson, paramBits, paramInt } from './fpga/netlist.js';
export { parseUcf, generateUcf, checkUcf, bitName, boardAutoAssign, periodNs, ucfPlacesPins, backAnnotateUcf } from './ucf.js';

// the implementation's steps, for a flow of one's own
export { pack, PackError } from './fpga/pack.js';
export { placeRouteBest } from './fpga/place-route.js';
export { checkRouting } from './fpga/route.js';
export { bitgen, knownRouting } from './fpga/bitgen.js';

// the placed and routed design (XDL) and the bitstream out
export { parseXdl, writeXdl, lutTable, fpgaModel, deviceGrid, MODEL_VERSION } from './xdl.js';
export { readBit, writeBit, S3E_DEVICES } from './fpga/bitstream.js';

// the reports: timing and power
export { analyzeTiming, SPEED_4 } from './fpga/timing.js';
export { instArcs } from './fpga/timing-arcs.js';
export { timingReport } from './fpga/timing-checks.js';
export { estimatePower, powerReport } from './power.js';

// the devices and their bit databases, from their files' contents (./node.js reads them from the disk)
export { loadDevice } from './fpga/device.js';
export { makeBitDb, dbFileNames, dbFilesFrom, splitPart } from './fpga/bitdb.js';

// the parts: their families and resources
export { FAMILY_INFO, familyOfPart, deviceFamily, familyName, familyFromXise, splitBitPart } from './family.js';
export { resourcesOf, resourceCount, resourceOfPrimitive } from './resources.js';
export { usedOfReport, primitiveInstances, deviceChangeIssues } from './resource-check.js';

// the Spartan-6: how far its open flow goes
export { spartan6Open, s6OpenStatus } from './fpga/s6/devices.js';
