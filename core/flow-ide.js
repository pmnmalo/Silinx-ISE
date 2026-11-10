// Silinx - the open flow as the IDE runs it (#1675, the toolchain's separation, #1651): the toolchain's flow
// (packages/silinx-fpga/src/open-flow-core.js runFlow) with the IDE's HDL front end (core/synth-front.js flowFrontEnd) and simulation
// models (core/flow-models.js mountSimModels) as its io's hooks; an io's own hooks win.
// spec.capture (the project's logic analyzer, silinx.json capture, #3176): the front end with the capture core and its
// wrapper inserted (core/ila-insert.js captureFrontEnd), on the Spartan-3E (the families whose open flow places a BSCAN);
// the report's `capture` (captureReport), what the Design Summary shows. The simulation models stay the design's own
// (flow-models.js synthesizes the design again, without the capture).
import { runFlow } from '../packages/silinx-fpga/src/index.js';
import { flowFrontEnd } from './synth-front.js';
import { mountSimModels } from './flow-models.js';
import { captureFrontEnd } from './ila-insert.js';
import { triggerText } from './ila.js';

// the families whose open flow places and routes the BSCAN (nextpnr 1.5.0's Spartan-3E)
export const CAPTURE_OPEN_FAMILIES = ['spartan3e'];

/** A capture inserted (captureSources's result) as the report has it: the probes, the shape, the trigger, the blocks. */
export function captureReport(c) {
  const path = n => c.probes.find(p => p.name === n)?.path ?? n;
  return {
    probes: c.probes.map(({ path: p, width }) => ({ path: p, width })), clock: c.clock, width: c.plan.width, depth: +c.spec.depth, pre: +c.spec.pre,
    trigger: triggerText(c.spec).replace(/\b(\w+)( rises| falls| changes| = | != )/g, (m, n, rest) => `${path(n)}${rest}`),
    combine: c.spec.trigger.combine, conditions: c.spec.trigger.conditions.map(({ probe, op, value }) => ({ path: path(probe), op, ...(value !== undefined && { value: String(value) }) })),
    blocks: c.plan.memory?.blocks ?? 0, link: c.link,
  };
}

export async function runOpenFlow(spec, io) {
  if (!spec.capture) return runFlow(spec, { frontEnd: flowFrontEnd, simModels: mountSimModels, ...io });
  const family = spec.family || 'spartan3e';
  let capture = null;
  const inserted = captureFrontEnd(flowFrontEnd, spec.capture, { family });
  const frontEnd = (srcs, top, opts) => {
    if (!CAPTURE_OPEN_FAMILIES.includes(family)) {
      return { errors: [`capture: the Silinx toolchain inserts the logic analyzer on the Spartan-3E only (not yet the ${family}); clear the capture (capture_settings) to implement the design`], input: () => null };
    }
    const r = inserted(srcs, top, opts);
    if (r.capture && !r.errors.length) {
      capture = { ...captureReport(r.capture), link: 'JTAG USER1 (BSCAN_SPARTAN3)' };
      io.log(`Logic analyzer: ${capture.probes.map(p => `${p.path}${p.width > 1 ? `[${p.width}]` : ''}`).join(', ')}; ${capture.width} bits x ${capture.depth} samples on ${capture.clock}, ${capture.pre} before the trigger (${capture.trigger}); ${capture.blocks} block RAM(s), read over ${capture.link}.`);
    }
    return r;
  };
  const save = io.save && (report => io.save(capture ? { ...report, capture } : report));
  const r = await runFlow(spec, { frontEnd, simModels: mountSimModels, ...io, ...(save && { save }) });
  return capture ? { ...r, report: { ...r.report, capture } } : r;
}
