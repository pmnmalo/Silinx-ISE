// Silinx - the open flow as the IDE runs it (#1675, the toolchain's separation, #1651): the toolchain's flow
// (packages/silinx-fpga/src/open-flow-core.js runFlow) with the IDE's HDL front end (core/synth-front.js flowFrontEnd) and simulation
// models (core/flow-models.js mountSimModels) as its io's hooks; an io's own hooks win.
import { runFlow } from '../packages/silinx-fpga/src/index.js';
import { flowFrontEnd } from './synth-front.js';
import { mountSimModels } from './flow-models.js';

export async function runOpenFlow(spec, io) {
  return runFlow(spec, { frontEnd: flowFrontEnd, simModels: mountSimModels, ...io });
}
