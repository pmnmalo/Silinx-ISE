// Silinx toolchain - the routed design (#405: out of routeDesign in core/fpga/route.js): each net's PIPs, the
// LUTs' pins as swapped, ISE's own power nets with their names and the made-up sources declared as instances.
import { applyLutSwaps } from './route.js';

/** { out, pipCount } of routeDesign. */
export function mountRoutedDesign(ctx) {
  const {
    design, device, E, lutGroups, tied, trees, work
  } = ctx;

  // the routed design: each net's PIPs (ISE's own power nets keep their names; made-up ones are added)
  // the made-up sources are declared as instances, as ISE writes them (xdl -xdl2ncd rejects an
  // outpin on an undeclared "XDL_DUMMY_…" instance)
  const dummies = work.filter(w => w.synthetic && !design.insts.some(i => i.name === w.outpins[0].inst)).map(w => w.dummy);
  const { insts: swapped, pinOf } = applyLutSwaps(design.insts, lutGroups);
  const out = { ...design, insts: [...swapped, ...dummies], nets: [] };
  const routedBy = new Map();
  work.forEach((n, i) => routedBy.set(n.net, [...(routedBy.get(n.net) || []), i]));
  let pipCount = 0;
  const pipsOf = i => {
    const pips = [];
    for (const e of trees[i]?.values() || []) {
      if (e < 0) continue;
      const p = device.pip(E.edgeTile[e], E.edgePip[e]);
      pips.push({ tile: p.tile, from: p.from, dir: p.dir, to: p.to });
    }
    pipCount += pips.length;
    return pips;
  };
  for (const net of design.nets) {
    const idx = routedBy.get(net);
    if (!idx) { if (!tied.has(net)) out.nets.push({ ...net, pips: [] }); continue; }
    for (const i of idx) {
      const w = work[i];
      if (w.synthetic) out.nets.push({ ...net, name: w.name, outpins: w.outpins, inpins: w.sinks.map(s => s.pin), pips: pipsOf(i) });
      else out.nets.push({ ...net, inpins: net.inpins.map(p => (pinOf.has(p) ? { ...p, pin: pinOf.get(p) } : p)), pips: pipsOf(i) });
    }
  }

  return { out, pipCount };
}
