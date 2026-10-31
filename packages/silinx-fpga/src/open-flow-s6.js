// Silinx toolchain - the open flow's Map and Place & Route for the Spartan-6 (#732; the plan: research/s6/README.md,
// #1), for the parts of fpga/s6/devices.js: the netlist packed (fpga/s6/pack.js) and turned into its
// physical design with the constraints (phys.js), placed (place.js), written as XDL (xdl.js), routed on the device's
// routing graph (route.js) and checked (route-check.js); the Spartan-3E's steps in open-flow-core.js otherwise.
// The timing (open-flow-reports.js) and the bitstream are their own steps.
import { packS6 } from './fpga/s6/pack.js';
import { physS6 } from './fpga/s6/phys.js';
import { s6Sites } from './fpga/s6/sites.js';
import { placeS6 } from './fpga/s6/place.js';
import { placedXdlS6 } from './fpga/s6/xdl.js';
import { routeS6, routedXdlS6 } from './fpga/s6/route.js';
import { checkRoutingS6 } from './fpga/s6/route-check.js';
import { knownPipS6 } from './fpga/s6/bitgen.js';
import { parseXdl, writeXdl } from './xdl.js';

/**
 * { runMap, runPar } of runOpenFlow for the Spartan-6. ctx: { io, spec, log, report, util, now, ms, netlist (a
 * getter), constraints, StepError, setRouted (the routed design's text, for the reports and the bitstream) }.
 */
export function mountS6Steps(ctx) {
  const { io, spec, log, report, util, now, ms, netlist, constraints, StepError, setRouted } = ctx;
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

  function runPar() {
    if (!phys) runMap();
    const device = io.device(), t = now();
    let placement;
    try {
      placement = placeS6(phys, sites || (sites = s6Sites(device)), { seed: spec.seed || 1, nl: netlist() });
    } catch (e) { throw new StepError(`placement failed: ${e.message}`, [], e.hint); }
    for (const w of placement.warnings || []) log(`WARNING:Place - ${w}`);
    const placed = placedXdlS6(netlist(), packed, phys, placement, { part: spec.part, name: spec.top, device });
    report.files.placed = io.write('open/placed.xdl', writeXdl(placed));
    log(`Placed ${placement.site.length} sites in ${ms(t)} (estimated critical path ${placement.delay.toFixed(1)} ns): ${report.files.placed}`);
    const t2 = now();
    let r;
    // on the switches whose bits the bit databases have (#732); a net that needs others (a pad whose I/O path is not
    // measured yet) routed on every switch, and bitgen names what its bitstream lacks
    const allowPip = io.bitDb ? knownPipS6(device, io.bitDb()) : null, opts = { maxPasses: spec.routeIterations || 50 };
    try {
      r = routeS6(placed, device, { ...opts, allowPip });
      if (allowPip && r.failed.length) {
        log(`${r.failed.length} net(s) need routing switches the bit database does not have yet: routed on every switch (the bitstream step names them).`);
        r = routeS6(placed, device, opts);
      }
    } catch (e) { throw new StepError(`routing failed: ${e.message}`); }
    for (const w of r.warnings || []) log(`WARNING:Route - ${w}`);
    report.par = { routed: false, unroutedSignals: r.failed.length, nets: r.trees.filter(Boolean).length, pips: r.stats.pips, iterations: r.stats.passes };
    if (r.failed.length) throw new StepError(`${r.failed.length} net(s) cannot be routed`, r.failed.slice(0, 50));
    if (r.stats.overused) {
      throw new StepError(`the routing did not converge: ${r.stats.overused} routing node(s) still used by more than one net after ${r.stats.passes} passes`,
        [], 'The design is too dense for the router on this device: a larger device, or an ISE mode (Toolchain Settings), may implement it.');
    }
    const text = writeXdl(routedXdlS6(placed, device, r));
    report.files.routed = io.write('open/routed.xdl', text);
    const check = checkRoutingS6(parseXdl(text), device);
    if (!check.ok) throw new StepError('the routing check failed', check.problems.slice(0, 50));
    setRouted(text);
    report.par = { ...report.par, routed: true, unroutedSignals: 0, done: true };
    log(`Routed ${report.par.nets} nets (${r.stats.pips} PIPs, ${r.stats.passes} passes) in ${ms(t2)}: ${report.files.routed}`);
    log('All signals are completely routed.');
  }

  return { runMap, runPar, state: () => ({ packed, phys, sites }) };
}
