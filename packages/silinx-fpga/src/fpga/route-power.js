// Silinx toolchain - the router's power nets (#405: out of routeDesign in core/fpga/route.js): the nets the router
// works on, the power nets with no source (as a placer writes them) tied to made-up sources, as ISE does.
import { tieConstants } from './route.js';

/** { tied, work } of routeDesign. */
export function mountPowerNets(ctx) {
  const {
    design, device, opts, all, allowPip, errors
  } = ctx;

  // power nets without a source (as a placer writes them): tied to made-up sources, as ISE does
  const work = [];
  const sourceless = { vcc: [], gnd: [] };
  const tied = new Set();     // the sourceless nets replaced by one net per made-up source
  for (const n of all) {
    if (!n.sinks.length) continue;
    if (!n.sources.length) {
      const kind = /^(vcc|power|vdd)$/i.test(n.type) ? 'vcc' : /^(gnd|ground)$/i.test(n.type) ? 'gnd' : null;
      if (kind) sourceless[kind].push(n); else errors.push(`net ${n.name}: no source`);
      continue;
    }
    work.push(n);
  }
  if (sourceless.vcc.length || sourceless.gnd.length) {
    const usedSites = new Set(design.insts.filter(i => i.placed).map(i => i.site));
    for (const n of all) for (const site of n.sourceSites) usedSites.add(site);   // ISE's made-up sources too
    for (const n of [...sourceless.vcc, ...sourceless.gnd]) tied.add(n.net);
    const tie = { device, usedSites, errors, allowPip, allowSource: opts.allowConstSource || null };
    work.push(...tieConstants(sourceless.vcc, 'vcc', tie), ...tieConstants(sourceless.gnd, 'gnd', tie));
  }

  return { tied, work };
}
