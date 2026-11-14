// silinx-fpga's public API (#1678, step 7 of the toolchain's separation, #1651): what the package gives, the same
// in Node and in the browser (nothing here imports node:; ./node.js adds the loaders from the disk and Yosys in
// Node's workers). A name not exported here is the package's own and may change in any version.
//
// The flow: runFlow(spec, io) runs the steps (OPEN_STEPS) on a design, everything outside it through `io`
// (open-flow-core.js says what each hook is): the sources (flat Verilog; VHDL through io.frontEnd), the UCF, the
// device and its bit database, Yosys, nextpnr (io.nextpnr, the place and route engine, #2137), the files it
// writes (the netlist, the placed and routed XDL, the .bit) and the report (utilisation, timing, power).

// the parts, the constraints, the steps' names, the XDL (the light entry, silinx-fpga/parts)
export * from './parts.js';

// the flow
export { runFlow, StepError, ISE_HINT } from './open-flow-core.js';
// a family's back end (open-flow-backends.js says what it is, #2360)
export { backendOf, registerBackend } from './open-flow-backends.js';

// synthesis: Verilog in (synthesisInput's { text, top }), a Yosys JSON netlist out
export { synthesizeVerilog, synthEffort, synthGoal, GOAL_IMPL, FAST_SYNTH, cellCounts } from './synth-open.js';
export { scriptTopError } from './top-name.js';
export { synthesizeArea } from './synth-area.js';
export { synthesizeFast } from './synth-fast.js';
export { runYosysOnce, yosysWorkerSource, readableBlobs, asText } from './synth-open-yosys.js';
// nextpnr's WebAssembly package as the flow's io.nextpnr (the nextpnr engine, #2136; in Node: node.js nextpnrNode)
export { nextpnrIo } from './nextpnr-io.js';
// the iCE40's nextpnr and icepack, YoWASP's package as io.nextpnr.ice40 (#2295; in Node: node.js nextpnrIce40Node)
export { ice40Io } from './nextpnr-ice40-io.js';
export { ICE40_PARTS, ICE40_STEPS } from './open-flow-ice40.js';
// the 7-series' back end (#3146): its steps and its timing's model (nextpnr's estimate); in Node: node.js nextpnrXc7Node, loadBitDbXc7
export { XC7_STEPS, XC7_TIMING_MODEL } from './open-flow-xc7.js';
// the ECP5's nextpnr and ecppack, YoWASP's package as io.nextpnr.ecp5 (#2302; in Node: node.js nextpnrEcp5Node)
export { ecp5Io } from './nextpnr-ecp5-io.js';
export { ECP5_PARTS, ECP5_STEPS } from './open-flow-ecp5.js';
// the Gowin's nextpnr, YoWASP's package as io.nextpnr.gowin, and gowin_pack, Silinx's port of Apicula's (#2303; in Node: node.js
// nextpnrGowinNode)
export { gowinIo } from './nextpnr-gowin-io.js';
export { GOWIN_PARTS, GOWIN_DEVICES, GOWIN_STEPS } from './open-flow-gowin.js';
export { gowinPack } from './fpga/gowin/pack.js';
export { loadChipdb as loadGowinChipdb } from './fpga/gowin/chipdb.js';
export { PCF } from './pcf.js';
export { LPF } from './lpf.js';
export { CST } from './cst.js';
export { XDC, readXdc, writeXdc } from './xdc.js';
export { gateAssignments, rewriteCarryChains } from './carry-chain.js';

// the netlist in (the constraints: ./parts.js)
export { readYosysJson, paramBits, paramInt } from './fpga/netlist.js';

// the implementation's steps, for a flow of one's own
export { pack, PackError } from './fpga/pack.js';
export { checkRouting } from './fpga/route-check.js';
export { bitgen, knownRouting } from './fpga/bitgen.js';

// the bitstream out (the placed and routed design, XDL: ./parts.js)
export { readBit, writeBit, S3E_DEVICES } from './fpga/bitstream.js';

// the reports: timing and power
export { analyzeTiming, SPEED_4 } from './fpga/timing.js';
export { instArcs } from './fpga/timing-arcs.js';
export { timingReport } from './fpga/timing-checks.js';
// the slowest paths, stage by stage, back to their source lines (#3178)
export { betweenPaths, pathHighlight, pathsText, timingPaths } from './fpga/timing-paths.js';
export { estimatePower, powerReport } from './power.js';

// the devices and their bit databases, from their files' contents (./node.js reads them from the disk)
export { loadDevice } from './fpga/device.js';
export { makeBitDb, dbFileNames, dbFilesFrom, splitPart } from './fpga/bitdb.js';

// the Spartan-6: how far its open flow goes
export { s6OpenStatus } from './fpga/s6/devices.js';
export { bitDbS6, fetchBitDbS6, s6DbNames } from './fpga/s6/bitdb.js';
// the 7-series' bit database from its JSON (bitdb/xc7/<part>.json.gz, gunzipped and parsed): the browser's worker's (#3143)
export { bitDbXc7 } from './fpga/xc7/bitdb.js';
// a 7-series .bit read back into its frames and features (bitread, bit2fasm): the BSCAN's measurement against Vivado's
// bitstreams (scripts/xc7-bscan-vivado.mjs, #3767)
export { bitIndexXc7, readBitFramesXc7, framesToFeatures } from './fpga/xc7/readback.js';
