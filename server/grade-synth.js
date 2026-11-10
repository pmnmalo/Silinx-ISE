// Automatic grading (#3192): a synthesis test's numbers from the Silinx toolchain, in memory (core/flow-ide.js
// runOpenFlow, Yosys compiled to WebAssembly; Map, nextpnr's, for the slices): { errors, warnings, latches, luts, ffs,
// slices }. It runs in the submission's worker (server/grade-worker.js), within its limits.
import { runOpenFlow } from '../core/flow-ide.js';
import { yosysNode, nextpnrNode, loadDeviceCache } from '../packages/silinx-fpga/src/node.js';
import { resourcesOf } from '../packages/silinx-fpga/src/parts.js';
import { openStatus } from './open-flow.js';
import { findPart } from './devices.js';

/** The device of an exercise's synthesis tests: its own, else the Basys2's XC3S250E. */
export const GRADE_DEVICE = Object.freeze({ family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' });

const used = (items, re) => items?.find(i => re.test(i.name))?.used ?? 0;

export async function synthesize(sources, top, test, { device = GRADE_DEVICE } = {}) {
  const status = openStatus(device);
  if (!status.part) return { errors: [`the Silinx toolchain cannot synthesize for ${device.part}: ${status.reason}`] };
  const lines = [], store = {};
  let dev = null;
  const io = {
    log: l => lines.push(l), sources: () => sources.map(s => ({ path: s.path, lang: s.lang, text: s.text })), ucf: null, yosys: yosysNode,
    nextpnr: { spartan3e: nextpnrNode() }, device: () => (dev ||= loadDeviceCache(status.graph)),
    write: (name, data) => { store[name] = data; return `build/${name}`; }, read: name => (typeof store[name] === 'string' ? store[name] : null), save: () => {},
  };
  const steps = test.slices !== undefined && status.graph ? ['synth', 'translate', 'map', 'par'] : ['synth'];
  const part = findPart(device.part);
  const spec = { top, part: status.part, device: status.device, pkg: String(device.package).toLowerCase(), family: device.family || 'spartan3e',
    steps, synthEffort: 'normal', synthGoal: 'fast', graph: status.graph, ...(part && { resources: resourcesOf(part, device.package) }) };
  const r = await runOpenFlow(spec, io);
  const errors = lines.filter(l => /^\s*ERROR|^  \S.*:\d+ /.test(l));
  if (!r.ok) return { errors: errors.length ? errors : [r.error || 'the synthesis failed'] };
  const syn = r.report.synthesis?.utilization;
  return {
    errors: [], warnings: lines.filter(l => /^WARNING/.test(l)),
    latches: used(syn, /latches/i), luts: r.report.synthesis?.summary?.luts?.used ?? 0, ffs: r.report.synthesis?.summary?.ffs?.used ?? 0,
    slices: r.report.map?.summary?.slices?.used ?? r.report.map?.summary?.slices ?? null,
  };
}
