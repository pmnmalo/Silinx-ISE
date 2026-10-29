// Silinx toolchain - the packer's LUTs and flip-flops (#405: out of packWith in core/fpga/pack.js): the LUTs and
// flip-flops left, in units packed into slices by their affinity, the critical ones first (the timing-driven packing).
import { CRIT_BONUS, CRIT_PAIR, connectionCriticality } from './pack.js';

/** packWith's LUTs and flip-flops left packed into slices (nothing returned). */
export function mountLuts(ctx) {
  const {
    timing, cells, ci, ctrlOk, ffs, ffsOn, insts, isLut, loadsOf, lutOf, nets, newSlice, otherLoads, placeFf, placeLut,
    where
  } = ctx;

  // ---------------------------------------------------------------- the rest: LUTs and flip-flops
  // Units: a LUT with the flip-flop it feeds (the flip-flop's D from the LUT inside the slice), a LUT
  // alone, a flip-flop alone (D through BX / BY). Slices are filled greedily: a seed unit, then
  // the compatible units that share the most nets with what is already in the slice.
  const units = [];
  const unitOf = new Map();
  for (const c of cells) {
    if (!isLut(c) || where.has(ci(c))) continue;
    const f = ffsOn(c.pins.O)[0];
    const u = { lut: ci(c), ff: f ? f.cell : -1 };
    if (f) unitOf.set(f.cell, u);
    unitOf.set(ci(c), u);
    units.push(u);
  }
  for (const [c] of ffs) if (!where.has(c) && !unitOf.has(c)) { const u = { lut: -1, ff: c }; unitOf.set(c, u); units.push(u); }
  // nets of a unit (for the affinity): inputs and outputs, without clocks and constants
  const unitNets = u => {
    const ns = new Set();
    for (const k of [u.lut, u.ff]) if (k >= 0) for (const [p, n] of Object.entries(cells[k].pins)) if (n > 1 && !/^(C|G)$/.test(p) && loadsOf(n).length < 64) ns.add(n);
    return ns;
  };
  const netUnits = new Map();
  units.forEach((u, k) => { u.k = k; u.nets = unitNets(u); for (const n of u.nets) { if (!netUnits.has(n)) netUnits.set(n, []); netUnits.get(n).push(k); } });
  // Timing (#528): the critical connections between units (criticality >= CRIT_PAIR, by
  // connectionCriticality) put the two units in one slice, as ISE's map puts consecutive LUTs of a
  // critical path (and a LUT with the flip-flop it feeds) together: u.links = [[unit index, crit]],
  // u.crit = the unit's most critical connection (to any cell)
  const { crit } = timing ? connectionCriticality(cells, nets) : { crit: new Map() };
  for (const u of units) { u.links = []; u.crit = 0; }
  for (const [key, c] of crit) {
    if (c < CRIT_PAIR) continue;
    const [cell, pin] = key.split(':'), load = unitOf.get(+cell), dr = nets[cells[+cell].pins[pin]].driver, src = dr && unitOf.get(dr.cell);
    if (load) load.crit = Math.max(load.crit, c);
    if (src) src.crit = Math.max(src.crit, c);
    if (load && src && load !== src) { load.links.push([src.k, c]); src.links.push([load.k, c]); }
  }
  const done = new Set();
  // can unit u go into slice s? returns the side(s) it would take, or null
  const fits = (s, u) => {
    // (a SLICEM with RAMs or shift registers: SR is their enable; nothing else goes in)
    if (s.mctrl) return null;
    const f = u.ff >= 0 ? ffs.get(u.ff) : null;
    if (f && !ctrlOk(s, f)) return null;
    if (u.lut >= 0 && f) { for (const side of ['F', 'G']) { const X = side === 'F' ? 'X' : 'Y'; if (!s.lut[side] && !s.ff[X]) return { lutSide: side, ffSide: X }; } return null; }
    if (u.lut >= 0) { for (const side of ['F', 'G']) if (!s.lut[side]) return { lutSide: side }; return null; }
    for (const X of ['X', 'Y']) if (!s.ff[X] && (s.b[X] === null || s.b[X] === f.d)) return { ffSide: X };
    return null;
  };
  const putUnit = (s, u, how) => {
    done.add(u.k);
    if (u.lut >= 0) {
      const lut = lutOf(cells[u.lut]);
      placeLut(s, how.lutSide, lut, u.lut);
      const X = how.lutSide === 'F' ? 'X' : 'Y';
      const fCell = u.ff >= 0 && how.ffSide ? u.ff : -1;
      if (otherLoads(lut.out, fCell >= 0 ? [[fCell, 'D']] : []).length) s.out[X] = how.lutSide;
      if (fCell >= 0) { s.out[X] = how.lutSide; placeFf(s, how.ffSide, ffs.get(fCell), 'mux'); }
    } else placeFf(s, how.ffSide, ffs.get(u.ff), 'bypass');
  };
  // A flip-flop alone (D through BX / BY) first tries the free flip-flop slots of the slices of the
  // carry chains and wide multiplexers (their BX / BY often free): one that holds logic of its nets,
  // else any. (Yosys's netlists have many: shift registers, registers loaded from other registers.)
  const macroSlices = insts.filter(s => s.kind === 'slice');
  const sliceOfNets = u => {
    const score = new Map();
    for (const n of u.nets) for (const c of [nets[n].driver?.cell, ...loadsOf(n).map(l => l.cell)]) {
      const w = c !== undefined && where.get(c);
      if (w && insts[w.inst].kind === 'slice') score.set(w.inst, (score.get(w.inst) || 0) + 1);
    }
    return [...score].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([k]) => insts[k]);
  };
  for (const u of units) {
    if (u.lut >= 0 || done.has(u.k)) continue;
    const s = sliceOfNets(u).find(x => fits(x, u)) || macroSlices.find(x => fits(x, u));
    if (s) putUnit(s, u, fits(s, u));
  }
  // seeds: the units on critical paths first (most critical first), then the others in netlist order
  // (keeps related logic together, deterministic); units with a flip-flop first
  const order = [...units].sort((a, b) => (b.crit >= CRIT_PAIR) - (a.crit >= CRIT_PAIR) || (a.crit >= CRIT_PAIR ? b.crit - a.crit : 0) || (b.ff >= 0) - (a.ff >= 0) || a.k - b.k);
  for (const seed of order) {
    if (done.has(seed.k)) continue;
    const s = newSlice();
    putUnit(s, seed, fits(s, seed));
    const inSlice = [seed];
    for (;;) {
      // candidates: units sharing a net with the slice, and (first) the units of a critical
      // connection with it. A LUT on a critical path goes only with one of its critical connections:
      // with unrelated logic, placement would pull it away from its path (a flip-flop alone, whose D
      // comes through BX / BY, may: flip-flop-bound designs would need more slices).
      const score = new Map(), link = new Map();
      const sliceNets = new Set();
      for (const u of inSlice) for (const n of u.nets) sliceNets.add(n);
      for (const n of sliceNets) for (const k of netUnits.get(n) || []) if (!done.has(k)) score.set(k, (score.get(k) || 0) + 1);
      for (const u of inSlice) for (const [k, c] of u.links) if (!done.has(k)) link.set(k, Math.max(link.get(k) || 0, c));
      for (const [k, c] of link) score.set(k, (score.get(k) || 0) + CRIT_BONUS * c);
      let best = null, bestScore = 0;
      for (const [k, sc] of score) {
        if (!(sc > bestScore || (sc === bestScore && best !== null && k < best.k))) continue;
        const u = units[k];
        if (u.lut >= 0 && u.crit >= CRIT_PAIR && !link.has(k)) continue;
        if (fits(s, u)) { best = u; bestScore = sc; }
      }
      if (!best) {
        // nothing related: fill with the next unit in order that fits (not one on a critical path)
        best = order.find(u => !done.has(u.k) && (u.lut < 0 || u.crit < CRIT_PAIR) && fits(s, u)) || null;
        if (!best || (s.lut.F && s.lut.G && s.ff.X && s.ff.Y)) break;
      }
      putUnit(s, best, fits(s, best));
      inSlice.push(best);
      if (s.lut.F && s.lut.G && s.ff.X && s.ff.Y) break;
    }
  }
}
