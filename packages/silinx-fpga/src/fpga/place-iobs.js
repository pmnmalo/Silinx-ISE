// Silinx toolchain - the placer's I/O pads (#405: out of place in core/fpga/place.js): a clock input with no LOC on
// a pad whose dedicated path reaches its DCM's CLKIN or a global buffer, the other I/Os on free pads of a bank of
// their VCCO (with their registers' pads, #96; apart from a pair's clash, #749); no pad: why, and what to do.
import { DCM_PAD, PlaceError, bankOfPad } from './place.js';

/** { dcmClkinWarnings, padFits } of place. */
export function mountIobs(ctx) {
  const {
    bufgSites, dev, packed, padOk, start, bankAdd, bankV, bufClaimed, bufOwner, bufgOfPad, bufgRank, clashAt, clkinPad,
    dcmObjs, dcmPadsOf, freePads, lineServes, objs, padReachOf, padUsed, preBuf, ri, sites, takeBuf, vccoOf
  } = ctx;

  // a clock input with no LOC that drives a DCM's CLKIN: on a free pad whose dedicated path of
  // known bits reaches that DCM's CLKIN, ISE's choice first (DCM_PAD, #92), kept there (#57); before the
  // clock inputs of global buffers, which have more GCLK pins to choose from
  const dcmOfPad = o => packed.nets.find(n => n.outpins[0]?.inst === o.inst)?.inpins.find(p => p.pin === 'CLKIN' && packed.insts[p.inst].kind === 'dcm')?.inst;
  if (bufgSites) for (const o of objs) if (o.kind === 'iob' && !o.fixed && o.dir === 'in' && dcmOfPad(o) !== undefined) {
    const loc = sites[dcmOfPad(o)].name;
    const ise = DCM_PAD[/^xc3s\d+e/i.exec(dev.part || '')?.[0].toLowerCase()]?.[loc];
    const reach = freePads('in', vccoOf(o.inst)).filter(p => dcmPadsOf(p.name).includes(loc));
    const p = reach.find(p => p.name === ise) || reach[0];
    if (!p) continue;   // none: a pad like any other (general routing to the DCM)
    bankAdd(p, vccoOf(o.inst), 1);
    padUsed.set(p.name, o);
    sites[o.inst] = p;
    o.fixed = true;
  }
  if (bufgSites) for (const o of objs) if (o.kind === 'iob' && !o.fixed && o.dir === 'in' && bufgOfPad(o) !== undefined) {
    let best = null;
    for (const p of freePads('in', vccoOf(o.inst))) {
      for (const b of padReachOf(p.name)) {
        if (!dev.bufgmux.some(x => x.name === b)) continue;   // (not a buffer the flow can use: #45)
        // (the buffer matched above with the DCMs, #94: only it)
        if (preBuf.has(bufgOfPad(o))) { if (b === preBuf.get(bufgOfPad(o)) && !best) best = { p, b, k: 0 }; continue; }
        // (a buffer whose lines do not reach the clock's loads after the others, #56)
        const k = (bufgRank.get(b) ?? Infinity) + (lineServes(bufgOfPad(o), b) ? 0 : 1000);
        if (!bufClaimed.has(b) && (!best || k < best.k)) best = { p, b, k };
      }
    }
    if (!best && preBuf.has(bufgOfPad(o))) { bufClaimed.delete(preBuf.get(bufgOfPad(o))); bufOwner.delete(preBuf.get(bufgOfPad(o))); preBuf.delete(bufgOfPad(o)); }
    if (!best) continue;   // no GCLK pin free: a pad like any other (general routing to the buffer)
    bufClaimed.add(best.b);
    // (a buffer that serves the clock's loads: kept for it, #95: a side GCLK pin reaches several)
    if (best.k < 1000) { preBuf.set(bufgOfPad(o), best.b); takeBuf(bufgOfPad(o), best.b); }
    bankAdd(best.p, vccoOf(o.inst), 1);
    padUsed.set(best.p.name, o);
    sites[o.inst] = best.p;
    o.fixed = o.gclk = true;
  }
  // an I/O with registers (#96): only the pads its registers' settings are measured on, if any is free
  const padFits = (i, p) => !padOk || !packed.insts[i].regs?.length || padOk(p.name, packed.insts[i].cfg);
  for (const o of objs) if (o.kind === 'iob' && !o.fixed) {
    const all = freePads(o.dir, vccoOf(o.inst)), fits = all.filter(p => padFits(o.inst, p)), apart = fits.filter(p => !clashAt(o.inst, p));
    const fp = apart.length ? apart : fits.length ? fits : all;
    if (!fp.length) throw padsError(o);
    const want = start?.at[o.inst]?.site;
    const p = (want && fp.find(q => q.name === want)) || fp[ri(fp.length)];
    bankAdd(p, vccoOf(o.inst), 1);
    padUsed.set(p.name, o);
    sites[o.inst] = p;
  }
  // no free pad for an I/O: too few pads, or (#128) free pads only in banks whose VCCO the I/O
  // standards already placed there set to another voltage (LVCMOS25, the default, where every bank
  // holds LVCMOS33 pins): said, with the ports, the banks and the standard to give them
  function padsError(o) {
    if (!freePads(o.dir, null).length) return new PlaceError('place: not enough pads');
    const v = vccoOf(o.inst), stdOf = i => (packed.insts[i].cfg || []).find(c => c.attr === 'IOATTRBOX')?.value;
    const ports = objs.filter(x => x.kind === 'iob' && !sites[x.inst] && vccoOf(x.inst) === v && !freePads(x.dir, v).length).map(x => packed.insts[x.inst].name);
    const shown = ports.length > 8 ? `${ports.slice(0, 8).join(', ')} and ${ports.length - 8} more` : ports.join(', ');
    // the banks with pads free for it: their VCCO, and the standards of the I/Os placed there
    const banks = [...new Set(freePads(o.dir, null).map(bankOfPad))].sort((a, b) => a - b);
    const stds = new Map();   // bank -> standard -> port names
    for (const x of objs) if (x.kind === 'iob' && sites[x.inst] && banks.includes(bankOfPad(sites[x.inst]))) {
      const m = stds.get(bankOfPad(sites[x.inst])) || stds.set(bankOfPad(sites[x.inst]), new Map()).get(bankOfPad(sites[x.inst]));
      const std = stdOf(x.inst);
      (m.get(std) || m.set(std, []).get(std)).push(packed.insts[x.inst].name);
    }
    const said = banks.map(b => `bank ${b} VCCO ${bankV.get(b).v} V (${[...stds.get(b)].map(([std, n]) => `${std}: ${n.length > 3 ? `${n.slice(0, 3).join(', ')} and ${n.length - 3} more` : n.join(', ')}`).join('; ')})`);
    // the standard of the most I/Os of those banks
    const count = new Map();
    for (const m of stds.values()) for (const [std, n] of m) count.set(std, (count.get(std) || 0) + n.length);
    const best = [...count].sort((a, b) => b[1] - a[1])[0][0];
    return new PlaceError(`place: no pad for ${ports.length} I/O(s) of ${stdOf(o.inst)} (VCCO ${v} V): ${shown}: the banks with free pads need another VCCO: ${said.join(', ')}`,
      `Give them the I/O standard of a bank in the constraints (UCF), e.g. NET "${packed.insts[o.inst].name}" IOSTANDARD = ${best}; (or LOC them on pads of a bank of their own).`);
  }
  // a DCM's CLKIN from a pad that reaches it only through general routing: said (#47; once the pads
  // have their final sites)
  const dcmClkinWarnings = () => (bufgSites ? dcmObjs : []).flatMap(o => {
    const pi = clkinPad(o), site = sites[o.inst].name;
    if (pi === undefined || dcmPadsOf(sites[pi].name).includes(site)) return [];
    const from = [...dev.pads.keys()].filter(n => dcmPadsOf(n).includes(site));
    return [`${packed.insts[o.inst].name}: its CLKIN comes from the pad ${sites[pi].name} through general routing: ${from.length ? `only ${from.join(', ')} ${from.length > 1 ? 'reach' : 'reaches'}` : 'no pad reaches'} the CLKIN of ${site} on a dedicated path of known bits`];
  });

  return { dcmClkinWarnings, padFits };
}
