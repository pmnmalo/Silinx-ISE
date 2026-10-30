// silinx-fpga's light entry (#1678): the parts, their families and resources, the constraints (UCF), the flow's
// steps by name and the placed and routed design's format (XDL), without the toolchain behind them, for an
// interface that shows a design and its board (Silinx ISE's pages) and loads the toolchain only when it runs.
// ./index.js gives all of it too.

// the parts: their families and resources
export { FAMILY_INFO, familyOfPart, deviceFamily, familyName, familyFromXise, splitBitPart } from './family.js';
export { resourcesOf, resourceCount, resourceOfPrimitive } from './resources.js';
export { usedOfReport, primitiveInstances, deviceChangeIssues } from './resource-check.js';

// the constraints
export { parseUcf, generateUcf, checkUcf, bitName, boardAutoAssign, periodNs, ucfPlacesPins, backAnnotateUcf, locsNotOnBoard } from './ucf.js';

// the flow's steps
export { OPEN_STEPS, OPEN_CHAIN, orderOpenSteps, engineOf } from './open-steps.js';

// the placed and routed design (XDL), and a device's report (XDLRC)
export { parseXdl, parseXdlrc, writeXdl, lutTable, fpgaModel, deviceGrid, MODEL_VERSION } from './xdl.js';
