// Silinx toolchain - the open flow's Map for the Spartan-6 (#732; the plan: research/s6/README.md, #1), for the parts of
// fpga/s6/devices.js: the netlist packed (fpga/s6/pack.js) and turned into its physical design with the constraints
// (phys.js). Place & Route is nextpnr's (open-flow-nextpnr-s6.js; Silinx's own router removed, #2824); the timing
// (open-flow-reports.js) and the bitstream are their own steps.
import { packS6 } from './fpga/s6/pack.js';
import { physS6 } from './fpga/s6/phys.js';
import { s6Sites } from './fpga/s6/sites.js';

/**
 * { runMap, state } of runOpenFlow for the Spartan-6 (state: { packed, phys, sites } after Map, for nextpnr's Place &
 * Route). ctx: { io, spec, log, report, util, now, ms, netlist (a getter), constraints, StepError }.
 */
export function mountS6Steps(ctx) {
  const { io, spec, log, report, util, now, ms, netlist, constraints, StepError } = ctx;
  let packed = null, phys = null, sites = null;
  const siteCounts = () => {
    sites ||= s6Sites(io.device());
    const kinds = { X: 0, L: 0, M: 0 };
    for (const s of sites.slices.values()) kinds[s.kind]++;
    return { slices: sites.slices.size, ...kinds, pads: sites.pads.size, bufgs: sites.bufgs.length, brams: sites.brams.length, dsps: sites.dsps.length };
  };

  // the Design Summary's map section, as the MAP report of ISE for the Spartan-6 names its lines; more than the
  // device has, the step fails with the resources named (the report kept)
  function mapReport() {
    const s = packed.stats, n = siteCounts(), count = t => phys.insts.filter(i => t.test(i.type)).length;
    const rows = [['ffs', 'Number of Slice Registers', s.ffs, 8 * n.slices], ['luts', 'Number of Slice LUTs', s.luts, 4 * n.slices],
      ['slices', 'Number of occupied Slices', s.slices, n.slices], ['slicem', 'Number of SLICEMs', s.M || 0, n.M],
      ['iob', 'Number of bonded IOBs', count(/^IOB$/), n.pads], ['ramb16', 'Number of RAMB16BWERs', count(/^RAMB16/), n.brams],
      ['ramb8', 'Number of RAMB8BWERs', count(/^RAMB8/), 2 * n.brams], ['dsp48a1', 'Number of DSP48A1s', count(/^DSP48A1$/), n.dsps],
      ['bufg', 'Number of BUFG/BUFGMUXs', count(/^BUFG/), n.bufgs]];
    const items = rows.map(([id, name, used, total]) => ({ id, ...util(name, used, total) }));
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    report.map = { utilization: items, summary: { slices: byId.slices, ffs: byId.ffs, luts: byId.luts, iobs: byId.iob, bufg: byId.bufg }, warnings: (packed.warnings || []).length, errors: 0 };
    const over = items.filter(i => i.used > i.total);
    if (over.length) {
      report.map.errors = over.length;
      for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
      throw new StepError(over.map(i => `${i.name}: ${i.used} of the ${spec.device}'s ${i.total}`).join('; '), [], 'Choose a larger device (Design Properties).');
    }
    return items;
  }

  function runMap() {
    const t = now();
    try {
      packed = packS6(netlist());
      phys = physS6(netlist(), packed, { ucf: constraints() });
    } catch (e) { throw new StepError(`packing failed: ${e.message}`); }
    for (const w of [...(packed.warnings || []), ...(phys.warnings || [])]) log(`WARNING:Pack - ${w}`);
    const items = mapReport();
    log('Design summary (pack):');
    for (const i of items) if (i.used || /Slice/.test(i.name)) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
    log(`Packed in ${ms(t)}.`);
  }

  return { runMap, state: () => ({ packed, phys, sites }) };
}
