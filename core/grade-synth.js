// Silinx - automatic grading (#3192): a synthesis test's run of the open synthesis (packages/silinx-fpga's flow, its
// synthGoal 'fast'; Map and Place & Route, nextpnr's, for the slices) as the server's grading process makes it
// (server/grade-synth.js, in Node) and the page (web/js/grade-synth-browser.js, the flow's worker, #3216): the same
// spec, the same numbers.
//
//   synthesisSpec(top, test, device, status, resources)  -> the flow's spec
//   synthesisNumbers(r, lines, test, status)              -> { errors, warnings, latches, luts, ffs, slices, notes }
//
// status: the device's, { part, device, graph, slicesReason } (the slices not checked, and why: #3215).

/** The device of an exercise's synthesis tests: its own, else the Basys2's XC3S250E. */
export const GRADE_DEVICE = Object.freeze({ family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' });

/** The flow's spec of a synthesis test: the synthesis, and Place & Route when it limits the slices (and can). */
export function synthesisSpec(top, test, device, status, resources = null) {
  const steps = test.slices !== undefined && status.graph && !status.slicesReason ? ['synth', 'translate', 'map', 'par'] : ['synth'];
  return { top, part: status.part, device: status.device, pkg: String(device.package).toLowerCase(), family: device.family || 'spartan3e',
    steps, synthEffort: 'normal', synthGoal: 'fast', graph: status.graph, ...(resources && { resources }) };
}

const used = (items, re) => items?.find(i => re.test(i.name))?.used ?? 0;

/** A synthesis test's numbers from the flow's result ({ ok, error, report }) and its lines. */
export function synthesisNumbers(r, lines, test, status) {
  const errors = lines.filter(l => /^\s*ERROR|^  \S.*:\d+ /.test(l));
  if (!r.ok) return { errors: errors.length ? errors : [r.error || 'the synthesis failed'] };
  const syn = r.report.synthesis?.utilization;
  return {
    errors: [], warnings: lines.filter(l => /^WARNING/.test(l)),
    latches: used(syn, /latches/i), luts: r.report.synthesis?.summary?.luts?.used ?? 0, ffs: r.report.synthesis?.summary?.ffs?.used ?? 0,
    slices: r.report.map?.summary?.slices?.used ?? r.report.map?.summary?.slices ?? null,
    ...(test.slices !== undefined && status.slicesReason && { notes: [status.slicesReason] }),
  };
}
