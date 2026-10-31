// Silinx toolchain - the open flow's Map and Place & Route for the Spartan-3E (#405's way, out of runFlow, #2360): the
// netlist packed (fpga/pack.js), its design summary, placed, routed and checked (fpga/place-route.js placeRouteBest, or
// io.placeRoute). The timing and the bitstream are their own steps (open-flow-reports.js).
import { writeXdl, parseXdl } from './xdl.js';
import { pack } from './fpga/pack.js';
import { placeRouteBest } from './fpga/place-route.js';
import { deviceSites } from './fpga/place.js';
import { checkRouting } from './fpga/route.js';
import { overResources, overMessage } from './resource-check.js';

/**
 * { runMap, runPar, packed } of runFlow for the Spartan-3E. ctx: { io, spec, log, report, util, now, ms, netlist (a getter),
 * knownPips, parTries, parExtra, constraints, StepError, setRouted (the routed design's text, for the reports and the bitstream) }.
 */
export function mountS3eSteps(ctx) {
  const { io, spec, log, report, util, now, ms, knownPips, parTries, parExtra, constraints, StepError, setRouted } = ctx;
  let packed = null;

  function runMap() {
    const t = now();
    try {
      packed = pack(ctx.netlist(), { ucf: constraints(), part: spec.part });
    } catch (e) { throw new StepError(`packing failed: ${e.message}`); }
    for (const w of packed.warnings || []) log(`WARNING:Pack - ${w}`);
    const items = mapReport();
    log('Design summary (pack):');
    for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
    log(`Packed in ${ms(t)}.`);
  }

  // the Design Summary's map section, from the packed design (again after a register replication): every
  // resource used of the device's sites, in the MAP report's order (resources.js); more than the device
  // has, the step fails with the resources named, the report kept (the summary shows them over 100 %, #795)
  function mapReport() {
    const s = packed.stats;
    const sites = deviceSites(io.device());
    const nSlices = sites.slices.size;
    const rows = [['ffs', 'Number of Slice Flip Flops', s.ffs, 2 * nSlices], ['luts', 'Number of 4 input LUTs', s.luts, 2 * nSlices], ['slices', 'Number of occupied Slices', s.slices, nSlices],
      ['iob', 'Number of bonded IOBs', s.iobs, sites.pads.size], ['ramb16', 'Number of RAMB16s', s.brams || 0, sites.brams.length], ['mult18x18', 'Number of MULT18X18SIOs', s.mults || 0, sites.mults.length],
      ['bufgmux', 'Number of BUFGMUXs', s.bufgs, sites.bufgmux.length], ['dcm', 'Number of DCMs', s.dcms || 0, sites.dcms.length]];
    const items = rows.map(([id, name, used, total]) => ({ id, ...util(name, used, total) }));
    const byId = Object.fromEntries(items.map(i => [i.id, i]));
    report.map = { utilization: items, summary: { slices: byId.slices, ffs: byId.ffs, luts: byId.luts, iobs: byId.iob, bufg: byId.bufgmux }, carry: s.carry, muxes: s.muxes, warnings: (packed.warnings || []).length, errors: 0 };
    const over = overResources(items.map(i => ({ id: i.id, report: i.name, count: i.total })), Object.fromEntries(items.map(i => [i.id, i.used])));
    if (over.length) {
      report.map.errors = over.length;
      log('Design summary (pack):');
      for (const i of items) log(`  ${i.name}: ${i.used} out of ${i.total} ${i.percent}%`);
      throw new StepError(over.map(o => overMessage(o, spec.device)).join('; '), [], 'Choose a larger device (Design Properties).');
    }
    return items;
  }

  function runPar() {
    const d = io.device();
    const k = knownPips();
    // place, route and their timing (fpga/place-route.js, the flows' one place and route): each
    // clock's flip-flops on the slices its global line reaches through switches of known bits; then
    // register replication (#4): the flip-flops and LUTs of many loads on the critical path copied
    // (#522), the design placed again from the first placement (#87) and routed; the faster kept. At Optimization Effort
    // High (and Normal, a small design), two placements first (seeds seed, seed + 1 …), the fastest kept; at High a third,
    // routed only when the placer's estimate is shorter than one of the first two's (#651)
    let pr;
    const tried = [], placeWarned = new Set();
    try {
      pr = (io.placeRoute || placeRouteBest)(ctx.netlist(), packed, d, k, {
        seed: spec.seed || 1, tries: parTries(packed.stats.slices), extra: parExtra(), effort: spec.effort || 1, replicate: spec.replicate !== false, routeIterations: spec.routeIterations || null, pack: { ucf: constraints(), part: spec.part },
        onRouted: (p, info) => {
          if (info.replication) return;
          if (!info.retry) tried.push(p);
          // (each warning once, whichever placements give it)
          for (const w of p.placement.warnings || []) if (!placeWarned.has(w)) { placeWarned.add(w); log(`WARNING:Place - ${w}`); }
        },
        onReplication: x => log(`Register replication: ${x.flipFlops} flip-flop(s)${x.luts ? ` and ${x.luts} LUT(s)` : ''} on the critical path copied (${x.copies} copies): ${x.kept ? `kept, ${x.result.sta.period.toFixed(3)} ns instead of ${x.before.toFixed(3)} ns` : 'not kept, no faster'}.`),
      });
    } catch (e) { throw new StepError(`placement failed: ${e.message}`, [], e.hint); }   // (e.hint: the placer's, #128)
    if (tried.length + pr.unrouted.length > 1) {
      const ns = p => (p.sta ? `${p.period.toFixed(3)} ns` : 'not routed');
      const kept = tried.reduce((a, p) => (p.period < a.period ? p : a));
      // (an extra placement whose estimate was no shorter than the first ones': not routed, #651)
      const all = [...tried.map(p => [p.seed, ns(p)]), ...pr.unrouted.map(s => [s, 'not routed (estimated slower)'])].sort((a, b) => a[0] - b[0]);
      log(`Optimization Effort ${spec.synthEffort === 'high' ? 'High' : 'Normal'}: ${all.length} placements (seeds ${all.map(a => a[0]).join(', ')}): ${all.map(a => a[1]).join(', ')}; seed ${kept.seed} kept.`);
    }
    if (pr.replication?.kept) {
      packed = pr.packed;
      const items = mapReport();
      log(`Design summary (pack, after the replication): ${items[0].name} ${items[0].used}, ${items[2].name} ${items[2].used}.`);
    }
    const { placement: r, placedText, routed } = pr;
    report.files.placed = io.write('open/placed.xdl', placedText);
    log(`Placed ${r.sites.length} sites in ${(pr.placeMs / 1000).toFixed(1)} s (estimated critical path ${r.delay.toFixed(1)} ns): ${report.files.placed}`);
    report.par = { routed: false, unroutedSignals: routed.failed.length, nets: routed.routed, pips: routed.pips, iterations: routed.iterations };
    if (routed.errors.length) throw new StepError('routing errors', routed.errors.slice(0, 50));
    if (routed.failed.length) {
      throw new StepError(`${routed.failed.length} net(s) cannot be routed on the routing switches whose bits are known (the bit database does not know every switch of the device yet)`,
        routed.unreached.slice(0, 50).map(u => `${u.net} -> ${u.inst}.${u.pin}`));
    }
    // (the router stopped with nodes still shared, on every placement tried, #249)
    if (routed.overused) {
      throw new StepError(`the routing did not converge: ${routed.overused} routing node(s) still used by more than one net after ${routed.iterations} passes, on ${1 + pr.retried} placement(s) (seeds ${spec.seed || 1} to ${(spec.seed || 1) + pr.retried})`,
        [], 'The design is too dense for the router on this device: a larger device, or an ISE mode (Toolchain Settings), may implement it.');
    }
    if (pr.retried) log(`Placed and routed again with the seed ${pr.seed}: the routing of ${pr.retried} placement(s) before did not converge.`);
    const routedText = writeXdl(routed.design);
    setRouted(routedText);
    report.files.routed = io.write('open/routed.xdl', routedText);
    const check = checkRouting(parseXdl(routedText), d);
    if (!check.ok) throw new StepError('the routing check failed', check.problems.slice(0, 50));
    report.par = { ...report.par, routed: true, unroutedSignals: 0, done: true };
    log(`Routed ${routed.routed} nets (${routed.pips} PIPs, ${routed.iterations} passes) in ${(pr.routeMs / 1000).toFixed(1)} s: ${report.files.routed}`);
    log('All signals are completely routed.');
  }

  return { runMap, runPar, packed: () => packed };
}
