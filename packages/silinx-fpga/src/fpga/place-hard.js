// Silinx toolchain - the placer's block RAMs and multipliers (#405: out of place in core/fpga/place.js): on their
// sites, a block RAM and the multiplier of one tile together only with ports of 18 bits at most, where their clocks'
// lines reach; a multiplier cascade on consecutive sites of a column; the slices each clock may reach.
import { PlaceError } from './place.js';

/** { allowedOf, hardOk, hardSites, hardUsed, setHard } of place. */
export function mountHard(ctx) {
  const {
    clockSites, dev, packed, start, N, clockReachOf, loads, objs, ri, sites
  } = ctx;

  // block RAMs and multipliers: on their sites (RAMB16_XxYy, MULT18X18_XxYy); a block RAM and the
  // multiplier of the same tile share the tile's routing: both only when the block RAM's ports are
  // at most 18 bits wide (Spartan-3E: the multiplier's inputs take the upper data bits)
  const hardSites = { bram: dev.brams || [], mult: dev.mults || [] };
  const hardUsed = { bram: new Map(), mult: new Map() };   // site name -> obj
  const tileUse = new Map();                                // tile -> { bram: obj, mult: obj }
  const wideBram = o => !!packed.insts[o.inst].wide;
  // (and only where the lines of its clocks' global buffers reach its clock pins, clockSites: #56)
  const clockPins = new Map();   // inst -> [[bufg inst, pin]]
  for (const [bi, L] of loads) for (const n of packed.nets) if (n.outpins[0]?.inst === bi) for (const p of n.inpins) if (L.bram.insts.has(p.inst) || L.mult.insts.has(p.inst)) {
    if (!clockPins.has(p.inst)) clockPins.set(p.inst, []);
    clockPins.get(p.inst).push([bi, p.pin]);
  }
  const clockOk = (o, site) => (clockPins.get(o.inst) || []).every(([bi, pin]) => { const cs = clockReachOf(sites[bi].name); return !cs || cs.has(`${site.name}.${pin}`); });
  const hardOk = (o, site, other = null) => {
    if (!clockOk(o, site)) return false;
    const t = tileUse.get(site.tile) || {};
    const k = o.kind === 'bram' ? 'mult' : 'bram';
    const nb = t[k] && t[k] !== other ? t[k] : null;   // the neighbour in that tile (unless it moves away)
    return !nb || !(o.kind === 'bram' ? wideBram(o) : wideBram(nb));
  };
  const setHard = (o, site) => {
    const old = sites[o.inst];
    if (old && hardUsed[o.kind].get(old.name) === o) { hardUsed[o.kind].delete(old.name); delete (tileUse.get(old.tile) || {})[o.kind]; }
    hardUsed[o.kind].set(site.name, o);
    if (!tileUse.has(site.tile)) tileUse.set(site.tile, {});
    tileUse.get(site.tile)[o.kind] = o;
    sites[o.inst] = site;
  };
  // more than the device has: say so plainly, before trying them one by one (#19)
  for (const kind of ['bram', 'mult']) {
    const n = objs.filter(o => o.kind === kind).length, have = hardSites[kind].length;
    if (n > have) throw new PlaceError(`place: ${n} ${kind === 'bram' ? 'block RAMs' : 'multipliers'} needed, the device has ${have}`);
  }
  // a multiplier chain (#2, packed.multChains: BCOUT -> BCIN, from the lowest one up) on consecutive sites of a
  // column, placed first and not moved by the annealing
  const objOfInst = new Map(objs.filter(o => o.kind === 'mult').map(o => [o.inst, o]));
  const multByName = new Map(hardSites.mult.map(s => [s.name, s]));
  const inChain = new Set();
  for (const chain of [...(packed.multChains || [])].sort((a, b) => b.length - a.length)) {
    const name = packed.insts[chain[0]].name;
    if (chain.some(i => packed.insts[i].loc)) throw new PlaceError(`place: ${name}: a LOC on a multiplier of a cascade (BCIN) is not supported yet`);
    const runFrom = s => {
      const run = [];
      for (let x = s; x && run.length < chain.length; x = x.above && multByName.get(x.above)) run.push(x);
      return run.length === chain.length && run.every((x, k) => !hardUsed.mult.has(x.name) && hardOk(objOfInst.get(chain[k]), x)) ? run : null;
    };
    const starts = hardSites.mult.map(runFrom).filter(Boolean);
    if (!starts.length) throw new PlaceError(`place: ${name}: no ${chain.length} free multiplier sites one above the other for its cascade (BCIN)`);
    const want = start?.at[chain[0]]?.site;
    const run = (want && starts.find(r => r[0].name === want)) || starts[ri(starts.length)];
    chain.forEach((i, k) => { const o = objOfInst.get(i); o.fixed = true; inChain.add(o); setHard(o, run[k]); });
  }
  for (const o of objs) if ((o.kind === 'bram' || o.kind === 'mult') && !inChain.has(o)) {
    const inst = packed.insts[o.inst];
    const free = hardSites[o.kind].filter(s => !hardUsed[o.kind].has(s.name) && hardOk(o, s) && (!inst.loc || s.name === inst.loc));
    if (!free.length && clockPins.has(o.inst) && hardSites[o.kind].every(s => !clockOk(o, s) || s.name !== (inst.loc || s.name))) {
      throw new PlaceError(`place: ${inst.name}: no ${o.kind === 'bram' ? 'block RAM' : 'multiplier'} site${inst.loc ? ` ${inst.loc}` : ''} whose clock pins the lines of ${[...new Set(clockPins.get(o.inst).map(([bi]) => sites[bi].name))].join(', ')} reach through switches of known bits`);
    }
    if (!free.length) throw new PlaceError(`place: ${inst.name}: no free ${o.kind === 'bram' ? 'block RAM' : 'multiplier'} site${inst.loc ? ` ${inst.loc}` : ''} (the device has ${hardSites[o.kind].length}${o.kind === 'bram' ? '' : '; a multiplier cannot share its tile with a block RAM of 36-bit ports'})`);
    o.fixed = !!inst.loc;
    const want = start?.at[o.inst]?.site;
    setHard(o, (want && free.find(s => s.name === want)) || free[ri(free.length)]);
  }
  // the slices a clock may reach (clockSites): the flip-flops of each clock stay on them
  const allowedOf = new Array(N).fill(null);
  if (clockSites) for (const n of packed.nets) {
    const d = n.outpins[0] && packed.insts[n.outpins[0].inst];
    if (!d || d.kind !== 'bufg') continue;
    const reach = clockReachOf(sites[n.outpins[0].inst].name);
    if (reach) for (const p of n.inpins) if (p.pin === 'CLK' && packed.insts[p.inst].kind === 'slice') allowedOf[p.inst] = reach;
  }
  // RAMs and shift registers (instances of type SLICEM) only on SLICEM sites (the left column of a CLB)
  const allowedAt = (i, k) => (!allowedOf[i] || allowedOf[i].has(dev.slices.get(k).name)) && (packed.insts[i].type !== 'SLICEM' || dev.slices.get(k).type === 'SLICEM');

  return { allowedOf, hardOk, hardSites, hardUsed, setHard };
}
