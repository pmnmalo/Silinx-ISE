// Silinx - the HDL front end's part of the open synthesis (#1674, the toolchain's separation, #1651): an elaborated
// design (core/elaborate.js) as the toolchain's synthesis input, one flat SystemVerilog module (core/synth-verilog.js)
// with its hints, which packages/silinx-fpga/src/synth-open.js synthesizeVerilog synthesizes with Yosys; and the open flow's front end
// (flowFrontEnd, its io.frontEnd, #1675).
//
//   synthesisInput(design) = { text, top, warnings, shiftArrays, gates }
//   const r = await synthesizeOpen(design, { family: 'spartan3e', run, onLine })   (r: synthesizeVerilog's)
import { compile, elaborate } from './compile.js';
import { primitiveSources } from './unisim.js';
import { toVerilog } from './synth-verilog.js';
import { gateAssignments, synthesizeVerilog } from '../packages/silinx-fpga/src/index.js';

// the flat Verilog (text, its top module), the front end's warnings, the arrays of registers written as shift
// registers (Yosys's warning on them expected), and the gates of the design's single-bit assignments (a design written
// as gates gets its carry chains recovered, packages/silinx-fpga/src/carry-chain.js, #77)
export function synthesisInput(design) {
  const { text, top, warnings, shiftArrays = [] } = toVerilog(design);
  return { text, top, warnings, shiftArrays, gates: gateAssignments(design) };
}

// Synthesize an elaborated design: its synthesis input, synthesized by synthesizeVerilog (its options and its result)
export async function synthesizeOpen(design, options = {}) {
  return synthesizeVerilog(synthesisInput(design), options);
}

// The open flow's front end (packages/silinx-fpga/src/open-flow-core.js io.frontEnd, #1675): the sources ([{ path, lang, text }]) compiled with
// the UNISIM primitives they use and `top` elaborated (with these generics); { errors: ['file:line message'] of the
// sources and the elaboration, input(): the design's synthesis input (synthesisInput) }
export function flowFrontEnd(srcs, top, { generics } = {}) {
  const lib = compile([...primitiveSources(srcs), ...srcs]);
  const design = generics ? elaborate(lib, top, { generics }) : elaborate(lib, top);
  const errors = [...lib.errors, ...design.diags].filter(d => d.severity === 'error').map(e => `${e.file}:${e.line} ${e.message}`);
  return { errors, input: () => synthesisInput(design) };
}
