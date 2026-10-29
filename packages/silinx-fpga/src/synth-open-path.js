// The critical path of a mapped netlist (#405: out of core/synth-open.js): the estimated critical path of a
// 4-input-LUT family's netlist and its ends, its logic levels, and the rule that tells a design limited by its depth.
import {
  DEPTH_RULE, cellCounts, utilization
} from './synth-open.js';
import { LEVEL_CELL, COMB_CELL } from './lut-resynth.js';   // (the cells that add a logic level, and the combinational ones)

// ------------------------------------------------------------- the critical path of a netlist
// An estimate of the critical path (ns) of a mapped netlist of a 4-input-LUT family, from its cells
// only (before packing, placement and routing): the Spartan-3E -4's logic delays (of
// core/fpga/timing.js) and a fixed delay per connection between slices, none inside a slice (a LUT
// into its MUXF5, carry or flip-flop; the carry chain; MUXF5 into MUXF6…). Paths from flip-flop to
// flip-flop (block RAMs, multipliers, shift registers and distributed RAMs as their sources and
// ends too); a design without them: from its inputs to its outputs. It chooses between two
// mappings of the same design, so relative, not exact.
const NET = 0.45;
const isFF = t => /^(FD|LD)/.test(t);
const isLutCell = t => /^(LUT[1-6]|INV|BUF)$/.test(t);
/** The estimated critical path (ns) of a Yosys JSON netlist (its top module). */
export const criticalDelay = (json, top) => pathEnds(json, top).worst;
/** The estimate of criticalDelay with its ends: worst (ns), and each end { cell (its name), type, port, ns } (the
 *  setup included) of the paths between sequential cells (or, a design without them, from inputs to outputs); and
 *  arrival(bit), the estimated arrival at a signal (ns, -Infinity when no path reaches it; #1360). */
export function pathEnds(json, top) {
  const nl = typeof json === 'string' ? JSON.parse(json) : json;
  const mod = nl.modules[top] || Object.values(nl.modules).find(m => m.attributes?.top) || Object.values(nl.modules)[0];
  const cells = Object.values(mod?.cells || {});
  const driver = new Map();   // bit -> [cell, port]
  for (const c of cells) for (const [p, bits] of Object.entries(c.connections || {})) if (c.port_directions?.[p] === 'output') for (const b of bits) if (typeof b === 'number') driver.set(b, c);
  const registered = c => c.type === 'MULT18X18SIO' && /1$/.test(String(c.parameters?.PREG ?? ''));
  const ins = c => Object.entries(c.connections || {}).filter(([p]) => c.port_directions?.[p] === 'input');
  let withIO = false;
  const memo = new Map(), busy = new Set();
  // the arrival at a cell's input pin: its driver's output and the connection (none inside a slice)
  const arrIn = (c, p, bit) => {
    const d = typeof bit === 'number' ? driver.get(bit) : null;
    if (!d) return -Infinity;
    const inside = (c.type === 'MUXF5' && /^I[01]$/.test(p) && isLutCell(d.type)) || (/^MUXF[678]$/.test(c.type) && /^I[01]$/.test(p) && /^MUXF/.test(d.type))
      || (/^(MUXCY|XORCY)$/.test(c.type) && p === 'CI' && d.type === 'MUXCY') || (c.type === 'MUXCY' && p === 'S' && isLutCell(d.type))
      || (c.type === 'XORCY' && p === 'LI' && isLutCell(d.type)) || (isFF(c.type) && p === 'D' && (isLutCell(d.type) || /^(MUXF5|MUXF6|XORCY)$/.test(d.type)));
    return arrOut(d, bit) + (inside ? 0 : NET);
  };
  const through = (c, delayOf) => {
    let t = -Infinity;
    for (const [p, bits] of ins(c)) { const d = delayOf(p); if (d !== null) for (const b of bits) t = Math.max(t, arrIn(c, p, b) + d); }
    return t;
  };
  function arrOut(c, bit) {
    if (memo.has(bit)) return memo.get(bit);
    const t = c.type;
    let v;
    if (isFF(t)) v = 0.59;
    else if (/^SRL16/.test(t)) v = 2.0;
    else if (/^RAMB16/.test(t)) v = 2.39;
    else if (/^IBUF/.test(t)) v = withIO ? 0 : -Infinity;
    else if (/^BUFG/.test(t)) v = -Infinity;
    else {
      if (busy.has(bit)) return -Infinity;   // a combinational loop: no path
      busy.add(bit);
      if (isLutCell(t)) v = through(c, () => 0.70);
      else if (t === 'MUXF5') v = through(c, p => (p === 'S' ? 0.74 : 0.32));
      else if (/^MUXF[678]$/.test(t)) v = through(c, p => (p === 'S' ? 0.85 : 0.45));
      else if (t === 'MUXCY') v = through(c, p => (p === 'CI' ? 0.12 : p === 'S' ? 0.25 : 0.95));
      else if (t === 'XORCY') v = through(c, p => (p === 'CI' ? 0.46 : 0.15));
      else if (/^MULT18X18/.test(t)) v = registered(c) ? 1.0 : through(c, p => (/^[AB]$/.test(p) ? 4.9 : null));
      else if (/^RAM\d+X/.test(t)) v = through(c, p => (/^(A\d*|DPRA\d*)$/.test(p) ? 0.75 : null));
      else v = through(c, () => 0.7);
      busy.delete(bit);
    }
    memo.set(bit, v);
    return v;
  }
  // the ends: the setup of flip-flops, shift registers, RAMs and registered multipliers (the outputs withIO)
  const setup = (c, p) => {
    const t = c.type;
    if (isFF(t)) return p === 'D' ? 0.13 : p === 'CE' ? 0.55 : /^(R|S|CLR|PRE|G|GE)$/.test(p) ? 0.91 : null;
    if (/^SRL16/.test(t)) return /^(D|CE)$/.test(p) ? 0.46 : null;
    if (/^RAMB16/.test(t)) return /^(CLK|SSR)/.test(p) ? null : 0.4;
    if (registered(c)) return /^[AB]$/.test(p) ? 5.2 : null;
    if (/^RAM\d+X/.test(t)) return /^(D|WE|A\d*)$/.test(p) ? 0.46 : null;
    if (/^OBUF/.test(t)) return withIO ? 0 : null;
    return null;
  };
  const names = new Map(Object.entries(mod?.cells || {}).map(([n, c]) => [c, n]));
  const worst = () => {
    let w = 0;
    const ends = [];
    for (const c of cells) {
      for (const [p, bits] of ins(c)) {
        const s = setup(c, p);
        if (s === null) continue;
        let t = -Infinity;
        for (const b of bits) t = Math.max(t, arrIn(c, p, b) + s);
        if (t > 0) { w = Math.max(w, t); ends.push({ cell: names.get(c), type: c.type, port: p, ns: t }); }
      }
    }
    const arrival = bit => { const d = typeof bit === 'number' ? driver.get(bit) : null; return d ? arrOut(d, bit) : -Infinity; };
    return { worst: w, ends, arrival };
  };
  const ff = worst();
  if (ff.worst > 0) return ff;
  withIO = true;
  memo.clear();
  return worst();
}

// The logic levels of a mapped netlist: the LUTs (and MUXF5s, a LUT of 5 inputs) on its deepest path
// between sequential cells, inputs and outputs (a carry chain's MUXCY / XORCY count none: its LUTs do)
/** The logic levels of the deepest path of a Yosys JSON netlist (its top module). */
export function logicLevels(json, top) {
  const nl = typeof json === 'string' ? JSON.parse(json) : json;
  const mod = nl.modules[top] || Object.values(nl.modules).find(m => m.attributes?.top) || Object.values(nl.modules)[0];
  const cells = Object.values(mod?.cells || {});
  const driver = new Map();
  for (const c of cells) for (const [p, bits] of Object.entries(c.connections || {})) if (c.port_directions?.[p] === 'output') for (const b of bits) if (typeof b === 'number') driver.set(b, c);
  const memo = new Map(), busy = new Set();
  const level = (c) => {
    if (!COMB_CELL(c.type)) return 0;
    if (memo.has(c)) return memo.get(c);
    if (busy.has(c)) return 0;   // (a combinational loop)
    busy.add(c);
    let m = 0;
    for (const [p, bits] of Object.entries(c.connections || {})) if (c.port_directions?.[p] === 'input') for (const b of bits) { const d = typeof b === 'number' ? driver.get(b) : null; if (d) m = Math.max(m, level(d)); }
    busy.delete(c);
    const v = m + (LEVEL_CELL(c.type) ? 1 : 0);
    memo.set(c, v);
    return v;
  };
  return cells.reduce((w, c) => Math.max(w, level(c)), 0);
}
// Optimization Effort Normal (#468): a design limited by its logic depth, its usual mapping more than
// `levels` levels of logic deep and of DEPTH_RULE.maxLuts LUTs at most, gets High's mappings too (the
// depth-oriented ones, the carry chains), each kept by DEPTH_RULE as at High; the others keep the one fast
// run. On the design corpus (research/synth-quality/README.md, "Effort Normal"): the EPFL adder (85 levels)
// 98 ns estimated -> 17, max (57) 66 -> 23, priority (44) 51 -> 17, for 6 to 19 s more; the designs of more
// than 16 levels that High does not make faster (sin, voter, ITC'99 b20-b22) cost 7 to 56 s more; the
// larger ones (log2, multiplier: 10 000 and 7 500 LUTs, 100 and 87 levels), as fast at High (no depth
// mapping above maxLuts), would cost 75 to 86 s more and are left out; the shallower ones gain up to 1.5
// times at High (EPFL router) but are not limited by their depth. Since #611, of `maxLuts` (1500) LUTs at most and
// kept at Normal only when `gain` (25 %) faster than Normal's own netlist (synthesized too): the deep designs of 2000
// to 3300 LUTs (EPFL sin and voter, ITC'99 b20 to b22) gained 0 to 9 % of the estimate for up to 12 % more slices and
// 2 to 5 times the synthesis's time (voter 22 s -> 68), ITC'99 b14 and b05 (1005 and 293 LUTs) 15 and 9 % for 9 and 5 %
// more slices: High's trade, not Normal's; the EPFL adder, max and priority (339, 1046 and 171 LUTs) and a priority
// encoder of 128 bits (20 levels) gain 2.7 to 6 times. Since #652 (2026-10-26) kept when `gain` (10 %) faster: ITC'99 b05 and b14
// now gain 23 and 13 % by the estimate with fewer LUTs (282 against 295, 987 against 1059), and by ISE's trce at Normal 12.9
// and 4.9 % (b05 1.21 -> 1.05 times ISE's critical path), for 255 against 246 and 657 against 663 slices
export const DEEP_RULE = { levels: 16, maxLuts: 1500, gain: 0.1 };
/** Is a netlist of the usual mapping limited by its depth (DEEP_RULE)? */
export const deepDesign = (json, top, rule = DEEP_RULE) => logicLevels(json, top) > rule.levels && utilization(cellCounts(json, top)).luts <= Math.min(rule.maxLuts ?? Infinity, DEPTH_RULE.maxLuts);
