// Silinx - the legality of a Spartan-6 placement (#729): every rule the placer (core/fpga/s6/place.js) keeps,
// checked on its result on its own, for the tests and the flow (browser + Node).
//
//   checkPlacementS6(phys, sites, r) -> [errors]   r: placeS6's result (r.site by instance)
import { sliceFits, vccoOfIob } from './place.js';

/** The rules of a placement, see above: [] when it is legal. */
export function checkPlacementS6(phys, sites, r) {
  const err = [], { insts } = phys;
  const pads = sites.pads, slices = sites.slices;
  const dsps = new Map(sites.dsps.map(d => [d.name, d]));
  const bufgs = new Set(sites.bufgs.map(b => b.name));
  const bram = new Map();
  for (const t of sites.brams) { if (t.r16) bram.set(t.r16, { t, type: 'RAMB16BWER' }); for (const s of t.r8) bram.set(s, { t, type: 'RAMB8BWER' }); }
  const by = new Map();
  insts.forEach((inst, i) => {
    const s = r.site[i];
    if (!s) { err.push(`${inst.name}: not placed`); return; }
    if (by.has(s)) err.push(`${inst.name}: on ${s}, which ${insts[by.get(s)].name} takes`);
    by.set(s, i);
    if (inst.kind === 'slice') {
      const x = slices.get(s);
      if (!x) err.push(`${inst.name}: ${s} is not a slice`);
      else if (!sliceFits(inst.type.slice(5), x.kind)) err.push(`${inst.name} (${inst.type}) on ${s}, a SLICE${x.kind}`);
    } else if (inst.kind === 'iob') {
      if (!pads.has(s)) err.push(`${inst.name}: ${s} is not a bonded pad`);
      if (inst.loc && inst.loc !== s) err.push(`${inst.name}: on ${s}, its LOC is ${inst.loc}`);
    } else if (inst.kind === 'bufg') {
      if (!bufgs.has(s)) err.push(`${inst.name}: ${s} is not a BUFGMUX`);
    } else if (inst.kind === 'bram') {
      if (bram.get(s)?.type !== inst.type) err.push(`${inst.name} (${inst.type}) on ${s}`);
    } else if (inst.kind === 'dsp') {
      if (!dsps.has(s)) err.push(`${inst.name}: ${s} is not a DSP48A1`);
    }
  });
  // a block RAM tile: one RAMB16BWER or up to two RAMB8BWER
  for (const t of sites.brams) if (t.r16 && by.has(t.r16) && t.r8.some(s => by.has(s))) err.push(`${t.tile}: a RAMB16BWER and a RAMB8BWER`);
  // the carry chains: each stage on the slice its COUT drives the CIN of
  for (const ch of phys.chains) {
    for (let k = 1; k < ch.length; k++) {
      const below = slices.get(r.site[ch[k - 1]]);
      if (below?.above !== r.site[ch[k]]) err.push(`the carry chain of ${insts[ch[0]].name}: stage ${k} on ${r.site[ch[k]]}, not above ${r.site[ch[k - 1]]} (${below?.above ?? 'the column ends'})`);
    }
  }
  // the DSP48A1 cascades
  for (const net of phys.nets) {
    if (!net.driver || insts[net.driver.inst].kind !== 'dsp' || !/^(PCOUT|BCOUT)/.test(net.driver.pin)) continue;
    for (const l of net.loads) if (/^(PCIN|BCIN)/.test(l.pin) && dsps.get(r.site[net.driver.inst])?.above !== r.site[l.inst]) err.push(`${insts[l.inst].name}: its cascade input from ${insts[net.driver.inst].name}, not the DSP48A1 below it`);
  }
  // the banks' VCCO
  const bankV = new Map();
  insts.forEach((inst, i) => {
    if (inst.kind !== 'iob' || !pads.has(r.site[i])) return;
    const b = pads.get(r.site[i]).bank, v = vccoOfIob(inst);
    if (bankV.has(b) && bankV.get(b).v !== v) err.push(`bank ${b}: ${bankV.get(b).name} needs VCCO ${bankV.get(b).v} V, ${inst.name} ${v} V`);
    else if (!bankV.has(b)) bankV.set(b, { v, name: inst.name });
  });
  // a clock from a pad: on the global buffer its dedicated path reaches, or a warning says why not
  for (const net of phys.nets) {
    if (!net.driver || insts[net.driver.inst].kind !== 'iob') continue;
    for (const l of net.loads) {
      if (insts[l.inst].kind !== 'bufg') continue;
      const pad = pads.get(r.site[net.driver.inst]);
      if (pad && !pad.bufg.includes(r.site[l.inst]) && !(r.warnings || []).some(w => w.startsWith(`${insts[net.driver.inst].name}: the clock enters on pad`))) {
        err.push(`${insts[l.inst].name}: on ${r.site[l.inst]}, which the clock pad ${pad.name}'s dedicated path does not reach (${pad.bufg.join(', ') || 'none'})`);
      }
    }
  }
  return err;
}
