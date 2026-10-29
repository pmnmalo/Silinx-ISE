// Silinx toolchain - the placer's DCMs (#405: out of place in core/fpga/place.js, #47): each on a DCM site from
// which its clock outputs reach global buffers of their own through dedicated paths of known bits; of the
// placements, the most outputs matched, then the most buffers serving their loads, then CLKIN on a dedicated path.
import { LINE_BUFG, PlaceError, sideBufg } from './place.js';

/** { bufClaimed, clkinPad, dcmObjs, dcmPadsOf, preBuf } of place. */
export function mountDcms(ctx) {
  const {
    bufgSites, dev, packed, bufgRank, dcmTried, freePads, loads, objs, padReachOf, serves, sites, takeBuf, vccoOf
  } = ctx;

  const bufClaimed = new Set();
  // DCMs (#47): each on a DCM site (its INST LOC, or any) from which every clock output that drives
  // a global buffer reaches a buffer of its own through dedicated paths of known bits (bufgSites),
  // the buffers matched to the outputs. Of the placements, the one with the most outputs on such a
  // buffer, then the most buffers whose lines reach their clock's loads (#56), then the most DCMs
  // whose CLKIN a pad reaches on a dedicated path of known bits (its LOC'd pad, or a free one: #57),
  // then by site (dcmRank: the top-left DCM first, the side ones of the XC3S1200E last).
  const dcmObjs = objs.filter(o => o.kind === 'dcm');
  const driverOf = bi => packed.nets.find(n => n.inpins.some(p => p.inst === bi && p.pin === 'I0'))?.outpins[0];
  const preBuf = new Map();   // bufg inst -> the buffer matched to its DCM output
  const dcmPads = new Map();   // pad name -> the DCM sites whose CLKIN its dedicated paths reach
  const dcmPadsOf = name => { if (!dcmPads.has(name)) dcmPads.set(name, bufgSites ? bufgSites(name, 'I', ['DCM', 'CLKIN']) || [] : []); return dcmPads.get(name); };
  const clkinPad = o => { const n = packed.nets.find(n => n.inpins.some(p => p.inst === o.inst && p.pin === 'CLKIN')); const d = n?.outpins[0]; return d && packed.insts[d.inst].kind === 'iob' ? d.inst : undefined; };
  if (dcmObjs.length) {
    const dcmSites = dev.dcms || [];
    if (dcmObjs.length > dcmSites.length) throw new PlaceError(`place: ${dcmObjs.length} DCMs needed, the device has ${dcmSites.length}`);
    for (const o of dcmObjs) {
      const inst = packed.insts[o.inst];
      if (inst.loc && !dcmSites.some(d => d.name === inst.loc)) throw new PlaceError(`place: ${inst.name}: no DCM site ${inst.loc} on ${dev.part}`);
      if (inst.loc && dcmObjs.some(x => x !== o && packed.insts[x.inst].loc === inst.loc)) throw new PlaceError(`place: ${inst.name}: DCM site ${inst.loc} used twice`);
    }
    const dcmRank = d => (/^DCM_H_/.test(d.tile) ? 2000 : 0) + (d.py > dev.rows / 2 ? 0 : 1000) + d.px;
    const order = [...dcmSites].sort((a, b) => dcmRank(a) - dcmRank(b));
    // the global buffers each DCM's outputs drive
    const outs = dcmObjs.map(o => packed.nets.flatMap(n => (n.outpins[0]?.inst === o.inst ? n.inpins.filter(p => p.pin === 'I0' && packed.insts[p.inst].kind === 'bufg').map(p => ({ bi: p.inst, pin: n.outpins[0].pin })) : [])));
    const canUse = new Set(dev.bufgmux.map(b => b.name));
    const reachMemo = new Map();
    const reachB = (site, pin) => { const k = `${site}:${pin}`; if (!reachMemo.has(k)) reachMemo.set(k, bufgSites ? (bufgSites(site, pin) || []).filter(b => canUse.has(b)) : []); return reachMemo.get(k); };
    const pads = dcmObjs.map(clkinPad);
    // the global buffers a clock pad drives whose net reaches a DCM's CLKIN / CLKFB (#94): matched
    // with the DCMs' outputs, to a buffer that a GCLK pin (its LOC'd pad, or a free one) reaches on a
    // dedicated path, the buffer then serving the DCM's pin on the site tried
    const padBufs = [...loads].filter(([bi, L]) => L.dcm.length && packed.insts[driverOf(bi)?.inst]?.kind === 'iob').map(([bi]) => {
      const pi = driverOf(bi).inst;
      const from = sites[pi] ? [sites[pi]] : freePads('in', vccoOf(pi));
      return { bi, reach: [...new Set(from.flatMap(p => padReachOf(p.name)))].filter(b => canUse.has(b)).sort((a, b) => bufgRank.get(a) - bufgRank.get(b)) };
    });
    const better = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
    let best = null, budget = 200000;
    const assign = [];
    const evaluate = () => {
      dcmObjs.forEach((o, k) => dcmTried.set(o.inst, assign[k]));
      // the buffers: the matching of the most outputs, then the most buffers that serve their loads
      const items = [...dcmObjs.flatMap((o, k) => outs[k].map(x => ({ bi: x.bi, reach: reachB(assign[k].name, x.pin) }))), ...padBufs];
      let bm = null;
      const taken = new Set(), pick = [];
      // (then the most top / bottom buffers, whose lines reach the whole chip, #95)
      const W = items.length + 1, value = (m, sv, tb) => (m * W + sv) * W + tb;
      const rec = (i, matched, serving, tb) => {
        if (budget-- < 0) return;
        const rest = items.length - i;
        if (bm && value(matched + rest, serving + rest, tb + rest) <= bm.value) return;
        if (i === items.length) { bm = { matched, serving, value: value(matched, serving, tb), pick: [...pick] }; return; }
        for (const b of items[i].reach) if (!taken.has(b)) {
          // (a side buffer and the top / bottom buffer of its line: not both, #95)
          const sl = sideBufg(b)?.line ?? LINE_BUFG.indexOf(b);
          if (sl >= 0 && [...taken].some(x => (sideBufg(x)?.line ?? LINE_BUFG.indexOf(x)) === sl && !!sideBufg(x) !== !!sideBufg(b))) continue;
          taken.add(b); pick.push(b);
          rec(i + 1, matched + 1, serving + (serves(items[i].bi, b) ? 1 : 0), tb + (sideBufg(b) ? 0 : 1));
          pick.pop(); taken.delete(b);
        }
        pick.push(null); rec(i + 1, matched, serving, tb); pick.pop();
      };
      rec(0, 0, 0, 0);
      bm ||= { matched: 0, serving: 0, pick: items.map(() => null) };
      // CLKIN on a dedicated path: from its LOC'd pad, or from a free pad (one per DCM)
      let ded = 0;
      const padTaken = new Set();
      pads.forEach((pi, k) => {
        if (pi === undefined) return;
        if (sites[pi]) { if (dcmPadsOf(sites[pi].name).includes(assign[k].name)) ded++; return; }
        const p = freePads('in', vccoOf(pi)).find(p => !padTaken.has(p.name) && dcmPadsOf(p.name).includes(assign[k].name));
        if (p) { padTaken.add(p.name); ded++; }
      });
      const score = [bm.matched, bm.serving, ded, -assign.reduce((a, d) => a + dcmRank(d), 0)];
      if (!best || better(score, best.score)) best = { score, sites: [...assign], items, pick: bm.pick };
    };
    const used = new Set();
    const search = k => {
      if (budget < 0 && best) return;
      if (k === dcmObjs.length) { evaluate(); return; }
      const loc = packed.insts[dcmObjs[k].inst].loc;
      for (const d of order) {
        if (used.has(d.name) || (loc && d.name !== loc) || (!loc && dcmObjs.some(x => packed.insts[x.inst].loc === d.name))) continue;
        used.add(d.name); assign.push(d);
        search(k + 1);
        assign.pop(); used.delete(d.name);
      }
    };
    search(0);
    dcmTried.clear();
    dcmObjs.forEach((o, k) => { sites[o.inst] = best.sites[k]; });
    best.items.forEach((it, i) => { if (best.pick[i]) { preBuf.set(it.bi, best.pick[i]); bufClaimed.add(best.pick[i]); takeBuf(it.bi, best.pick[i]); } });
  }

  return { bufClaimed, clkinPad, dcmObjs, dcmPadsOf, preBuf };
}
