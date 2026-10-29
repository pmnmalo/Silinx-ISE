// Silinx toolchain - the placer's pads and clock reach (#405: out of place in core/fpga/place.js): the I/Os with a
// LOC on their pads, the banks' VCCO, the clocks of the IOBs' registers and a pair's clash (#749), the global
// buffers' loads, the reach of their lines (#56, #95), the buffers taken, and the buffers a pad reaches.
import { BUFG_ORDER, LINE_BUFG, PlaceError, bankOfPad, sideBufg, vccoOfStandard } from './place.js';

/** { bankAdd, bankOk, bankV, bufOwner, bufgOfPad, bufgRank, clashAt, clockReachOf, dcmTried, freePads, lineServes, loads, padReachOf, padUsed, pairPads, regClk, serves, takeBuf, vccoOf } of place. */
export function mountPads(ctx) {
  const {
    bufgSites, clockSites, dev, packed, N, objs, sites
  } = ctx;

  // ---------------------------------------------------------------- pads and clock buffers
  const padUsed = new Map();   // pad name -> obj
  // the VCCO of each bank, from the I/O standards of the IOBs placed in it (bankOfPad, vccoOfStandard)
  const vccoMemo = new Map();
  const vccoOf = i => { if (!vccoMemo.has(i)) vccoMemo.set(i, vccoOfStandard((packed.insts[i].cfg || []).find(c => c.attr === 'IOATTRBOX')?.value)); return vccoMemo.get(i); };
  const bankV = new Map();     // bank -> { v, n }
  const bankAdd = (p, v, k) => {
    if (v == null) return;
    const b = bankOfPad(p), e = bankV.get(b) || { v, n: 0 };
    e.n += k;
    if (e.n <= 0) bankV.delete(b); else bankV.set(b, e);
  };
  const bankOk = (p, v) => v == null || !bankV.has(bankOfPad(p)) || bankV.get(bankOfPad(p)).v === v;
  for (const o of objs) if (o.kind === 'iob' && o.fixed) {
    const inst = packed.insts[o.inst];
    const p = dev.pads.get(inst.loc);
    if (!p) throw new PlaceError(`place: ${inst.name}: LOC ${inst.loc} is not a bonded pad of ${dev.part}`);
    if (p.inputOnly && o.dir !== 'in') throw new PlaceError(`place: ${inst.name}: pad ${inst.loc} is input-only`);
    if (padUsed.has(p.name)) throw new PlaceError(`place: two ports on pad ${p.name}`);
    if (!bankOk(p, vccoOf(o.inst))) throw new PlaceError(`place: ${inst.name}: pad ${p.name} is in bank ${bankOfPad(p)}, whose other I/Os need VCCO ${bankV.get(bankOfPad(p)).v} V, not ${vccoOf(o.inst)} V (I/O standards)`);
    bankAdd(p, vccoOf(o.inst), 1);
    padUsed.set(p.name, o);
    sites[o.inst] = p;
  }
  const freePads = (dir, v) => [...dev.pads.values()].filter(p => !padUsed.has(p.name) && (dir === 'in' || !p.inputOnly) && bankOk(p, v));
  // the clocks of the IOBs' registers (#749): the input register's (ICLK1) and the output and output-enable
  // registers' (OTCLK1) nets. The two IOBs of a differential pair (DIFFM / DIFFS) share each clock wire of
  // their tile (IOIS_CLK0 -> ICLK10 / ICLK11, IOIS_CLK1 -> OTCLK10 / OTCLK11; the tile's third IOB has its
  // own): two registers of one kind there on different clocks need the DIFFM's second flip-flop (IFF2 / OFF2
  // on the tile's second clock wire, as ISE's map does: secondFlipFlops; their bits on every pad since #759): an I/O
  // with no LOC is kept out of such a pair (clashAt: one clock wire of each kind per tile), LOC'd ones take it.
  const regClk = new Array(N).fill(null);
  packed.nets.forEach((n, k) => { for (const p of n.inpins) if (p.pin === 'ICLK1' || p.pin === 'OTCLK1') (regClk[p.inst] ||= {})[p.pin[0]] = k; });
  const clash = (i, j) => !!regClk[i] && !!regClk[j] && ['I', 'O'].some(g => regClk[i][g] !== undefined && regClk[j][g] !== undefined && regClk[i][g] !== regClk[j][g]);
  const pairPads = new Map();   // tile -> its pair's bonded pads
  for (const p of dev.pads.values()) if (p.pair) (pairPads.get(p.pair) || pairPads.set(p.pair, []).get(p.pair)).push(p);
  const partnerOf = p => (p.pair ? pairPads.get(p.pair).find(q => q !== p) : undefined);
  // instance i on pad p clashes with the I/O on its partner pad (at: the object on a pad, padUsed's by default)
  const clashAt = (i, p, at = q => padUsed.get(q.name)) => { const q = partnerOf(p), j = q && at(q); return !!j && j.inst !== i && clash(i, j.inst); };
  // a clock input with no LOC (its pad drives a global buffer straight): on a pad from which a
  // global buffer is reached through the dedicated clock paths of known bits (a GCLK pin, as ISE
  // places it: B8 -> BUFGMUX_X2Y11), the buffers in BUFG_ORDER's order, and kept there (#49)
  const bufgRank = new Map();
  [...BUFG_ORDER, ...dev.bufgmux.map(b => b.name)].forEach((n, k) => { if (!bufgRank.has(n)) bufgRank.set(n, k); });
  const bufgOfPad = o => packed.nets.find(n => n.outpins[0]?.inst === o.inst)?.inpins.find(p => p.pin === 'I0' && packed.insts[p.inst].kind === 'bufg')?.inst;
  // the clock loads of each global buffer (#56): its slices, the clock pins of its block RAMs and
  // multipliers; a buffer serves them when its lines reach (clockSites) enough slices and enough
  // block RAM / multiplier sites on those pins
  const loads = new Map();   // bufg inst -> { slices: Set, bram: { insts: Set, pins: Set }, mult: … }
  for (const n of packed.nets) {
    const d = n.outpins[0];
    if (!d || packed.insts[d.inst].kind !== 'bufg') continue;
    const L = loads.get(d.inst) || { slices: new Set(), bram: { insts: new Set(), pins: new Set() }, mult: { insts: new Set(), pins: new Set() }, dcm: [] };
    for (const p of n.inpins) {
      const k = packed.insts[p.inst].kind;
      if (k === 'slice' && p.pin === 'CLK') L.slices.add(p.inst);
      else if (k === 'dcm' && /^CLK(IN|FB)$/.test(p.pin)) L.dcm.push(p);
      else if ((k === 'bram' && /^CLK[AB]$/.test(p.pin)) || (k === 'mult' && p.pin === 'CLK')) { L[k].insts.add(p.inst); L[k].pins.add(p.pin); }
    }
    loads.set(d.inst, L);
  }
  const reachCache = new Map();
  // the side buffers (#95): a side buffer's lines reach only its half of the chip; a top / bottom
  // buffer is kept out of the half whose side buffer of its line is used (excluded), its loads (slices,
  // block RAMs, multipliers) in the other half. The halves: either side of the clock tiles' column.
  const centre = dev.bufgmux.find(b => /^CLK[TB]/.test(b.tile))?.px ?? dev.cols / 2;
  const sitePx = new Map([...dev.slices.values(), ...(dev.brams || []), ...(dev.mults || [])].map(x => [x.name, x.px]));
  const excluded = new Map();   // top / bottom buffer -> the halves ('L', 'R') it is kept out of
  const clockReachOf = name => {
    if (!reachCache.has(name)) reachCache.set(name, clockSites ? clockSites(name) : null);
    const base = reachCache.get(name), side = sideBufg(name), ex = excluded.get(name);
    if (!base || (!side && !ex?.size)) return base;
    const key = `${name}|${side ? side.half : [...ex].sort().join('')}`;
    if (!reachCache.has(key)) {
      const keep = e => { const px = sitePx.get(e.split('.')[0]); if (px === undefined) return true; const h = px < centre ? 'L' : 'R'; return side ? h === side.half : !ex.has(h); };
      reachCache.set(key, new Set([...base].filter(keep)));
    }
    return reachCache.get(key);
  };
  // (a DCM's CLKIN / CLKFB too, #47: on the DCM's site, or the one tried, dcmTried)
  const dcmTried = new Map();
  const serves = (bi, name) => {
    const cs = clockReachOf(name), L = loads.get(bi);
    if (!cs || !L) return true;
    if (L.dcm.some(p => { const s = dcmTried.get(p.inst) || sites[p.inst]; return s && !cs.has(`${s.name}.${p.pin}`); })) return false;
    if ([...L.slices].length > [...cs].filter(s => !s.includes('.')).length) return false;
    return ['bram', 'mult'].every(k => L[k].insts.size <= ((k === 'bram' ? dev.brams : dev.mults) || []).filter(s => [...L[k].pins].every(p => cs.has(`${s.name}.${p}`))).length);
  };
  // the buffers taken (by the DCMs' outputs, the clock pads, the buffers' placement): a side buffer
  // keeps the top / bottom buffer of its line out of its half; lineServes: the buffer serves its loads,
  // and a side buffer leaves the top / bottom buffer of its line (if taken) serving its own
  const bufOwner = new Map();   // buffer name -> bufg inst
  const takeBuf = (bi, b) => {
    bufOwner.set(b, bi);
    const s = sideBufg(b);
    if (s) excluded.set(LINE_BUFG[s.line], new Set([...(excluded.get(LINE_BUFG[s.line]) || []), s.half]));
  };
  const lineServes = (bi, b) => {
    if (!serves(bi, b)) return false;
    const s = sideBufg(b), t = s ? LINE_BUFG[s.line] : null, u = t ? bufOwner.get(t) : undefined;
    if (u === undefined || u === bi) return true;
    const ex = excluded.get(t) || new Set();
    if (ex.has(s.half)) return true;
    excluded.set(t, new Set([...ex, s.half]));
    const ok = serves(u, t);
    excluded.set(t, ex);
    return ok;
  };
  const padReach = new Map();   // pad name -> the buffers its dedicated paths of known bits reach
  // (of the side buffers only the first, the nearest: a side GCLK pin's own one, through its I/O tile's IBUF and its
  // clock tile's CKIk, as ISE pairs them; the others through its OMUX into another pad's IOIS_Fk_B3, #641)
  const padReachOf = name => {
    if (!padReach.has(name)) { const r = bufgSites(name, 'I') || [], side = r.find(b => sideBufg(b)); padReach.set(name, r.filter(b => !sideBufg(b) || b === side)); }
    return padReach.get(name);
  };

  return { bankAdd, bankOk, bankV, bufOwner, bufgOfPad, bufgRank, clashAt, clockReachOf, dcmTried, freePads, lineServes, loads, padReachOf, padUsed, pairPads, regClk, serves, takeBuf, vccoOf };
}
