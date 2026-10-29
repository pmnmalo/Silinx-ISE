// Silinx - register replication (browser + Node): a flip-flop that drives many loads on a critical
// path is copied, each copy driving the loads of one region of the chip, as XST and ISE's map do
// (#4). Every copy has the flip-flop's D, clock, enable, set / reset and initial value, so the
// circuit computes exactly what it did; its loads are nearer and each net lighter (the routing
// delay of a net grows with its spread and its branches: core/fpga/timing.js). A LUT too (#522): a
// reset or clock enable computed by logic that drives the SR / CE pins of many flip-flops, copied
// with its inputs (its loads in its own slice stay on it).
//
// The open flow places and routes the design, then (replicationPlan) takes the flip-flops and LUTs
// whose output net has at least `minFanout` loads and a connection on or near the critical path
// (criticality >= minCrit by the routed timing analysis), splits each one's loads into groups by
// where the placement put them (k-means on the tiles), and (replicateCells) writes a netlist
// with a copy of the cell per group but the one nearest the cell. The flow packs, places
// and routes that netlist too, from the first placement (warmStart, #87), and keeps whichever is faster.
//
//   const plan = replicationPlan(nl, packed, placement, sta)       // [] when nothing to do
//   const nl2 = replicateCells(nl, plan)                             // a new netlist (nl unchanged)

/** Defaults: loads of a flip-flop or LUT for it to be copied, criticality of its connections, loads
 *  per copy, copies at most, cells at most, whether LUTs too (#522). */
export const REPLICATION = { minFanout: 8, minCrit: 0.98, minDelay: 1.0, perCopy: 16, maxCopies: 8, maxCells: 8, luts: true };
/** The flows try it on designs of up to this many slices (it places and routes the design twice;
 *  the largest take minutes to place and route, #55). */
export const REPLICATE_MAX_SLICES = 3000;

/** The warm start of the replicated placement (#87): the move window and the temperature factor the
 *  annealing starts from (place.js start). */
export const WARM = { on: true, rlim: 3, t: 0 };

const isFF = t => /^FD/.test(t);
const isLUT = t => /^LUT[1-4]$/.test(t);
// the output of a cell that may be copied: its pin, and the slice pin it leaves by (by its bel)
const OUT = { FFX: 'XQ', FFY: 'YQ', F: 'X', G: 'Y' };
const outPin = c => (isFF(c.type) ? 'Q' : isLUT(c.type) ? 'O' : null);
const tileXY = name => { const m = /X(\d+)Y(\d+)$/.exec(name || ''); return m ? [+m[1], +m[2]] : null; };

/**
 * The flip-flops to copy and the groups of their loads. nl: readYosysJson's netlist; packed:
 * pack(nl) (its cellSites); placement: place()'s result (sites[inst] = { tile, site }); sta: the
 * timing analysis of the routed design (core/fpga/timing.js analyzeTiming: conns { from: 'inst.pin',
 * crit }). Returns [{ cell, groups: [[{ cell, pin }]] }] (groups[0] stays on the flip-flop).
 */
export function replicationPlan(nl, packed, placement, sta, opts = {}) {
  const o = { ...REPLICATION, ...opts };
  // the criticality of each flip-flop or LUT output (instance.XQ / YQ / X / Y): its most critical
  // connection, and the longest delay of its connections that critical
  const crit = new Map(), slow = new Map();
  for (const c of sta.conns) if (/\.[XY]Q?$/.test(c.from)) crit.set(c.from, Math.max(crit.get(c.from) ?? 0, c.crit));
  for (const c of sta.conns) if (/\.[XY]Q?$/.test(c.from) && c.crit >= o.minCrit) slow.set(c.from, Math.max(slow.get(c.from) ?? 0, c.delay));
  const pos = packed.insts.map((_, k) => tileXY(placement.sites[k]?.tile));
  const cands = [];
  nl.cells.forEach((c, i) => {
    const pin = outPin(c);
    if (!pin || (!o.luts && !isFF(c.type))) return;
    const at = packed.cellSites?.[i];
    if (!at || at.inst < 0 || !OUT[at.bel] || isFF(c.type) !== /^FF/.test(at.bel) || packed.insts[at.inst].kind !== 'slice') return;
    const q = c.pins[pin];
    const loads = nl.nets[q]?.loads || [];
    if (loads.length < o.minFanout || nl.nets[q].const !== undefined) return;
    const out = `${packed.insts[at.inst].name}.${OUT[at.bel]}`;
    const k = crit.get(out) ?? 0;
    if (k < o.minCrit || (slow.get(out) ?? 0) < o.minDelay) return;
    // the loads with a place (the ones the packer left out have none); a LUT's loads in its own
    // slice (its flip-flop, the F5 multiplexer) stay on it
    const own = l => !isFF(c.type) && packed.cellSites[l.cell]?.inst === at.inst;
    const placed = loads.filter(l => !own(l)).map(l => ({ ...l, p: pos[packed.cellSites[l.cell]?.inst] })).filter(l => l.p);
    if (placed.length < o.minFanout) return;
    cands.push({ cell: i, crit: k, loads: placed, home: pos[at.inst], own: loads.filter(own) });
  });
  cands.sort((a, b) => b.crit - a.crit || b.loads.length - a.loads.length || a.cell - b.cell);
  const plan = [];
  for (const c of cands.slice(0, o.maxCells)) {
    const k = Math.min(o.maxCopies + 1, Math.max(2, Math.ceil(c.loads.length / o.perCopy)));
    const groups = kmeans(c.loads, k);
    if (groups.length < 2) continue;
    // the group nearest the flip-flop keeps it
    const d = g => Math.min(...g.map(l => Math.abs(l.p[0] - c.home[0]) + Math.abs(l.p[1] - c.home[1])));
    groups.sort((a, b) => d(a) - d(b));
    groups[0] = [...c.own.map(l => ({ ...l, p: c.home })), ...groups[0]];
    plan.push({ cell: c.cell, groups: groups.map(g => g.map(({ cell, pin }) => ({ cell, pin }))) });
  }
  return plan;
}

// k groups of points (loads with p = [x, y]): k-means from k spread seeds (the farthest-first
// traversal from the first load), a few rounds; empty groups dropped. Deterministic.
function kmeans(items, k) {
  const dist = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  const centres = [items[0].p.slice()];
  while (centres.length < k) {
    let best = null, bd = -1;
    for (const it of items) { const dd = Math.min(...centres.map(c => dist(c, it.p))); if (dd > bd) { bd = dd; best = it; } }
    if (bd <= 0) break;
    centres.push(best.p.slice());
  }
  let assign = [];
  for (let round = 0; round < 8; round++) {
    assign = items.map(it => { let j = 0; for (let c = 1; c < centres.length; c++) if (dist(centres[c], it.p) < dist(centres[j], it.p)) j = c; return j; });
    for (let c = 0; c < centres.length; c++) {
      const mine = items.filter((_, i) => assign[i] === c);
      if (mine.length) centres[c] = [mine.reduce((s, it) => s + it.p[0], 0) / mine.length, mine.reduce((s, it) => s + it.p[1], 0) / mine.length];
    }
  }
  return centres.map((_, c) => items.filter((_, i) => assign[i] === c)).filter(g => g.length);
}

const sliceXY = name => { const m = /^SLICE_X(\d+)Y(\d+)$/.exec(name || ''); return m ? [+m[1], +m[2]] : null; };

/**
 * The warm start of the replicated netlist's placement (#87, place.js start.at): nl2 (replicated from
 * nl, its cells after nl's the copies) packed as packed2, from the placement of nl (packed). A slice
 * of packed2 starts on the slice that held most of its cells (exact when it held them all); a slice
 * of copies only, at the centre of its copies' loads; a pad, block RAM or multiplier on its site.
 */
export function warmStart(nl, packed, placement, nl2, packed2) {
  const at = packed2.insts.map(() => null);
  const from = packed2.insts.map(() => new Map());   // inst of packed2 -> old inst -> cells
  const loadsAt = packed2.insts.map(() => []);       // inst of packed2 -> the old slices of its copies' loads
  nl2.cells.forEach((c, i) => {
    const to = packed2.cellSites?.[i];
    if (!to || to.inst < 0) return;
    if (i < nl.cells.length) {
      const old = packed.cellSites?.[i];
      if (old && old.inst >= 0) from[to.inst].set(old.inst, (from[to.inst].get(old.inst) || 0) + 1);
      return;
    }
    for (const n of Object.values(c.pins)) if (nl2.nets[n]?.driver?.cell === i) for (const l of nl2.nets[n].loads) {
      const old = l.cell < nl.cells.length ? packed.cellSites?.[l.cell] : null;
      const p = old && old.inst >= 0 && sliceXY(placement.sites[old.inst]?.site);
      if (p) loadsAt[to.inst].push(p);
    }
  });
  packed2.insts.forEach((inst, j) => {
    const olds = [...from[j]].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
    if (inst.kind !== 'slice') {
      if (olds.length && placement.sites[olds[0][0]]) at[j] = { site: placement.sites[olds[0][0]].site };
      return;
    }
    const p = olds.length && sliceXY(placement.sites[olds[0][0]]?.site);
    if (p) at[j] = { x: p[0], y: p[1], exact: olds.length === 1 && !loadsAt[j].length };
    else if (loadsAt[j].length) at[j] = { x: loadsAt[j].reduce((a, q) => a + q[0], 0) / loadsAt[j].length, y: loadsAt[j].reduce((a, q) => a + q[1], 0) / loadsAt[j].length, exact: false };
  });
  return at;
}

/**
 * A copy of the netlist with the flip-flops and LUTs of the plan replicated: for each group after the
 * first, a new cell `<name>_rep<k>` with the same type, parameters and inputs, driving a new net
 * `<Q / O net>_rep<k>` that the group's loads now read.
 */
export function replicateCells(nl, plan) {
  const cells = nl.cells.map(c => ({ ...c, pins: { ...c.pins } }));
  const nets = nl.nets.map(n => ({ ...n, loads: n.loads.map(l => ({ ...l })) }));
  const names = new Set(nets.map(n => n.name)), cellNames = new Set(cells.map(c => c.name));
  const unique = (set, base) => { let n = base, j = 1; while (set.has(n)) n = `${base}_${j++}`; set.add(n); return n; };
  for (const { cell, groups } of plan) {
    const ff = cells[cell], out = outPin(ff), q = ff.pins[out];
    groups.slice(1).forEach((group, g) => {
      const idx = cells.length, net = nets.length;
      const copy = { ...ff, name: unique(cellNames, `${ff.name}_rep${g + 1}`), pins: { ...ff.pins, [out]: net }, attrs: { ...ff.attrs } };
      cells.push(copy);
      nets.push({ id: net, name: unique(names, `${nets[q].name}_rep${g + 1}`), driver: { cell: idx, pin: out }, port: null, loads: [] });
      // the copy reads what the cell reads
      for (const [p, n] of Object.entries(ff.pins)) if (p !== out && ff.dirs?.[p] !== 'output') nets[n].loads.push({ cell: idx, pin: p });
      // the group's loads move to the copy's net
      const moving = new Set(group.map(l => `${l.cell}:${l.pin}`));
      nets[q].loads = nets[q].loads.filter(l => !moving.has(`${l.cell}:${l.pin}`));
      for (const l of group) { cells[l.cell].pins[l.pin] = net; nets[net].loads.push({ cell: l.cell, pin: l.pin }); }
    });
  }
  return { ...nl, cells, nets };
}
