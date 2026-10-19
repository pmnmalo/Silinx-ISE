// Silinx - placer: the sites of a packed design (core/fpga/pack.js) on a Spartan-3E device
// (browser + Node).
//
// Simulated annealing (in the manner of VPR): every slice, every group of slices that must keep
// its shape (a carry chain up a slice column, the slices of an F6 / F7 / F8 multiplexer), every
// pad without a LOC constraint and every block RAM and multiplier is an object; a move takes one
// object to another position nearby, a block RAM / multiplier to another site of its kind
// (swapping with what is there); the cost is the half-perimeter wirelength of the nets,
// weighted for nets with many pins, in units of a CLB, and (timing-driven, as VPR's placer) the
// estimated delay of every connection weighted by its criticality, the two normalised and mixed.
// Clock nets (from a BUFGMUX) run on the global clock lines and are left out. Moves that make the cost worse are accepted with a probability
// that falls as the temperature falls; the move window shrinks to keep about 44% of the moves
// accepted. Everything follows one seeded random generator: the same seed gives the same placement.
// Instances of type SLICEM (RAMs, shift registers) stay on SLICEM sites; each DCM takes a DCM site
// (its INST LOC, or the one chosen) from which its outputs reach global buffers of their own through
// dedicated paths of known bits (option bufgSites; more than one DCM: the buffers matched to all
// their outputs); a clock input with no LOC takes a free pad whose dedicated path of known bits
// reaches the DCM's CLKIN it drives, or a global buffer (a GCLK pin); a clock pad, with a LOC or not, takes a buffer its dedicated path
// reaches, unless that buffer's lines do not reach the clock's loads (block RAM / multiplier clock
// pins: clockSites) or its settings are not known (the side ones): then one that does, through
// general routing, with a warning (r.warnings). Block RAMs and multipliers stay on the sites whose
// clock pins their clocks' lines reach.
//
//   const dev = deviceSites(parseXdlrc(text))   the sites with their positions
//   const r = place(packed, dev, { seed, effort })
//     r = { sites: [{ tile, site }] by instance, cost, warnings, stats: { moves, temps, seconds, initialCost } }
//   placedXdl(packed, r) -> a design for writeXdl (core/xdl.js)
//   place(packed, dev, { seed, start: { at, rlim, t } })   a warm start (#87): from a placement given

import { instArcs, delayKind, SPEED_4 } from './timing.js';

// (hint: what to change, printed after the error by the flow; core/open-flow-core.js)
export class PlaceError extends Error {
  constructor(message, hint) { super(message); if (hint !== undefined) this.hint = hint; }
}

// I/O banks of the Spartan-3E: one per side (top 0, right 1, bottom 2, left 3), named by the I/O
// tile (TIOIS, RIOIS_PCI, BIBUFS, LIOIS_CLK_PCI…). Every I/O of a bank, input or output, shares the
// bank's output voltage (VCCO), which its I/O standard sets: ISE's DRC refuses a mix
// (PhysDesignRules:755, "IOB comp … is VCCO incompatible for bank …").
const BANK_OF_SIDE = { T: 0, R: 1, B: 2, L: 3 };
export const bankOfPad = p => BANK_OF_SIDE[String(p.tile || '')[0]] ?? -1;
const VCCO = [[/^(LVTTL|LVCMOS33|PCI33_3|PCI66_3)$/, 3.3], [/^(LVCMOS25|LVDS_25|BLVDS_25|LVPECL_25|RSDS_25|MINI_LVDS_25|SSTL2_I|SSTL2_II|DIFF_SSTL2_I|DIFF_SSTL2_II)$/, 2.5],
  [/^(LVCMOS18|SSTL18_I|DIFF_SSTL18_I|HSTL_I_18|HSTL_III_18|DIFF_HSTL_I_18|DIFF_HSTL_III_18)$/, 1.8], [/^(LVCMOS15|HSTL_I|HSTL_III)$/, 1.5], [/^LVCMOS12$/, 1.2]];
/** The VCCO an I/O standard needs (null: unknown, no constraint). */
export const vccoOfStandard = std => VCCO.find(([re]) => re.test(String(std || '').toUpperCase()))?.[1] ?? null;

// ------------------------------------------------------------------ the device
/** Sites of the device by kind, with positions: slices by (x, y), pads by name, clock buffers.
 *  dev: parseXdlrc() of the device report, or the routing graph (core/fpga/device.js Device);
 *  allowBufg(tileName, site): the global buffers the flow can use (bitgen.js knownRouting: not yet
 *  the side ones, #45). */
export function deviceSites(dev, { allowBufg = null } = {}) {
  const rows = dev.rows;
  const slices = new Map(), pads = new Map(), bufgmux = [], hard = { RAMB16: [], MULT18X18SIO: [] }, dcms = [];
  // the Device keeps the sites per tile as [name, bonded (0 internal, 1 bonded, 2 unbonded)]
  const tiles = dev.tiles || Array.from(dev.tileNames, (name, k) => ({
    name, r: dev.tileRow[k], c: dev.tileCol[k],
    sites: dev.tileSites[k].map(([n, b], i) => ({ name: n, type: dev.templates[dev.tileTemplate[k]].sites[i].type, bonded: b === 1 })),
  }));
  for (const t of tiles) {
    for (const s of t.sites) {
      let m;
      // physical position: tile column, tile row counted from the bottom (y grows upward as the
      // slice and CLB numbering does); the two slices of a column of a CLB half a tile apart
      if ((m = /^SLICE_X(\d+)Y(\d+)$/.exec(s.name))) {
        const x = +m[1], y = +m[2];
        slices.set(`${x},${y}`, { name: s.name, tile: t.name, type: s.type, x, y, px: t.c + (x % 2) * 0.5, py: rows - 1 - t.r + (y % 2) * 0.5 });
      } else if (/^(IOB|IBUF|DIFFM|DIFFS|DIFFMI|DIFFSI)$/.test(s.type) && s.bonded) {
        pads.set(s.name, { name: s.name, tile: t.name, type: s.type, px: t.c, py: rows - 1 - t.r, inputOnly: /^(IBUF|DIFFMI|DIFFSI)$/.test(s.type) });
      } else if (s.type === 'BUFGMUX') {
        if (!allowBufg || allowBufg(t.name, s.name)) bufgmux.push({ name: s.name, tile: t.name, px: t.c, py: rows - 1 - t.r });
      } else if (s.type === 'DCM') {
        dcms.push({ name: s.name, tile: t.name, type: s.type, px: t.c, py: rows - 1 - t.r });
      } else if (hard[s.type]) {
        // a block RAM and the multiplier of its tile (they share the tile's routing): four CLB rows
        // high, the site's tile at the top
        hard[s.type].push({ name: s.name, tile: t.name, type: s.type, px: t.c, py: rows - 1 - t.r - 1.5 });
      }
    }
  }
  return { part: dev.part, rows, cols: dev.cols, slices, pads, bufgmux, brams: hard.RAMB16, mults: hard.MULT18X18SIO, dcms };
}

// ------------------------------------------------------------------ random numbers
export function rng(seed) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// the expected wirelength of a net with n pins is more than its bounding box for n > 3 (VPR's
// crossing-count correction)
const CROSS = [1, 1, 1, 1, 1.0828, 1.1536, 1.2206, 1.2823, 1.3385, 1.3991, 1.4493, 1.4974, 1.5455, 1.5937, 1.6418, 1.6899, 1.7304, 1.7709, 1.8114, 1.8519, 1.8924, 1.9288, 1.9652, 2.0015, 2.0379, 2.0743, 2.1061, 2.1379, 2.1698, 2.2016, 2.2334, 2.2646, 2.2958, 2.3271, 2.3583, 2.3895, 2.4187, 2.4479, 2.4772, 2.5064, 2.5356, 2.5610, 2.5864, 2.6117, 2.6371, 2.6625, 2.6887, 2.7148, 2.7410, 2.7671, 2.7933];
const crossing = n => (n < CROSS.length ? CROSS[n] : 2.7933 + 0.02616 * (n - 50));
// nets of at most this many pins: their bounding box scanned at every move (faster than kept up to date)
const BOX_SCAN = 6;

// Clock buffers next to their pad: a BUFG driven straight from a pad on the top / bottom edge
// takes a global buffer of that edge (as ISE does: B8 -> BUFGMUX_X2Y11); others the first free one.
const BUFG_ORDER = ['BUFGMUX_X2Y11', 'BUFGMUX_X2Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X1Y10', 'BUFGMUX_X2Y1', 'BUFGMUX_X2Y0', 'BUFGMUX_X1Y1', 'BUFGMUX_X1Y0'];

// ------------------------------------------------------------------ timing
// The delays of core/fpga/timing.js (fitted to ISE's timing analyzer): the paths through a slice from
// its settings (LUTs, F5 / F6 multiplexers, carry chain), the flip-flops' clock-to-out and setup,
// and a connection's delay from the distance it spans (dedicated ones, carry and multiplexer chains:
// none). The paths analysed are those of trce's clock period: flip-flop to flip-flop.
const DEDICATED_PINS = new Set(['CIN', 'FXINA', 'FXINB']);

/** Connections and their timing: every driver pin -> load pin of the nets (clocks and constants
 *  left out), with the arcs of each instance (timing.js instArcs: comb, setup, clkToOut) on a SLICEL
 *  and on a SLICEM site (arcs[inst] = [SLICEL, SLICEM]: the SLICEM's LUTs and F5 multiplexers are
 *  slower). */
export function timingGraph(packed, model = SPEED_4) {
  const conns = [];
  packed.nets.forEach((n, k) => {
    if (n.type !== 'wire' || !n.outpins.length) return;
    const src = n.outpins[0];
    if (packed.insts[src.inst].kind === 'bufg') return;
    for (const p of n.inpins) if (p.pin !== 'CLK') conns.push({ net: k, src: src.inst, srcPin: src.pin, dst: p.inst, dstPin: p.pin, dedicated: DEDICATED_PINS.has(p.pin), kind: delayKind(src.pin) });
  });
  const none = { deps: {}, start: {}, setup: {} };
  const arcs = packed.insts.map(inst => {
    // block RAMs and multipliers: their own arcs (the same on any site)
    if (inst.kind === 'bram' || inst.kind === 'mult') {
      const a = instArcs({ type: inst.type, site: null, cfg: inst.cfg }, model);
      const deps = {}, start = {}, setup = {};
      for (const [i, o, d] of a.comb) (deps[o] ||= []).push([i, d]);
      for (const [o, d] of a.clkToOut) start[o] = d;
      for (const [i, d] of a.setup) setup[i] = Math.max(setup[i] ?? -Infinity, d);
      const x = { deps, start, setup };
      return [x, x];
    }
    if (inst.kind !== 'slice') return [none, none];
    // the site decides SLICEL / SLICEM (timing.js instArcs): an odd column of slices is a SLICEL
    return ['SLICE_X1Y0', 'SLICE_X0Y0'].map(site => {
      const a = instArcs({ type: 'SLICEL', site, cfg: inst.cfg }, model);
      const deps = {}, start = {}, setup = {};
      for (const [i, o, d] of a.comb) (deps[o] ||= []).push([i, d]);
      for (const [o, d] of a.clkToOut) start[o] = d;
      for (const [i, d] of a.setup) setup[i] = Math.max(setup[i] ?? -Infinity, d);
      return { deps, start, setup };
    });
  });
  return { conns, arcs, model };
}

/** The estimated delay of a connection between two positions ([x, y] in tiles, y upward): from the
 *  device's table of the fastest routes (timing.js delayTable: by tile offset, and by the kind of its
 *  driver, timing.js DELAY_KIND) when given, else from the Manhattan distance (the model's dist). */
export function connDelay(a, b, model = SPEED_4, delays = null, kind = 0) {
  if (delays) return delays.at(Math.floor(b[0]) - Math.floor(a[0]), Math.floor(a[1]) - Math.floor(b[1]), kind);
  const { base, perTile, knee, far } = model.dist;
  const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);
  return base + perTile * Math.min(d, knee) + far * Math.max(0, d - knee);
}

/** The timing graph compiled once for analyzeTiming: pins (instance, pin name) numbered, the
 *  connections into / out of each pin, and each instance's arcs on a SLICEL and a SLICEM site
 *  (v = 0, 1) by pin number. */
function compileTiming(tg) {
  const { conns, arcs } = tg;
  const ids = new Map(), pinInst = [];
  const pid = (i, p) => { const k = `${i}:${p}`; let n = ids.get(k); if (n === undefined) { n = pinInst.length; ids.set(k, n); pinInst.push(i); } return n; };
  const cSrc = new Int32Array(conns.length), cDst = new Int32Array(conns.length);
  conns.forEach((c, j) => { cSrc[j] = pid(c.src, c.srcPin); cDst[j] = pid(c.dst, c.dstPin); });
  arcs.forEach((a, i) => { for (const x of a) { for (const [o, ds] of Object.entries(x.deps)) { pid(i, o); for (const [q] of ds) pid(i, q); } for (const p of Object.keys(x.start)) pid(i, p); for (const p of Object.keys(x.setup)) pid(i, p); } });
  const P = pinInst.length;
  // lists by pin: [start .. start + 1) of a flat array
  const csr = (lists) => {
    const start = new Int32Array(P + 1);
    for (let p = 0; p < P; p++) start[p + 1] = start[p] + (lists[p] ? lists[p].length : 0);
    return { start, lists };
  };
  const into = [], outOf = [];
  for (let j = 0; j < conns.length; j++) { (into[cDst[j]] ||= []).push(j); (outOf[cSrc[j]] ||= []).push(j); }
  const hasOut = new Uint8Array(P);
  for (let p = 0; p < P; p++) if (outOf[p]) hasOut[p] = 1;
  const variant = v => {
    const start = new Float64Array(P).fill(NaN), setup = new Float64Array(P).fill(NaN);
    const deps = [], rev = [];
    arcs.forEach((a, i) => {
      const x = a[v];
      for (const [p, d] of Object.entries(x.start)) start[pid(i, p)] = d;
      for (const [p, d] of Object.entries(x.setup)) setup[pid(i, p)] = d;
      for (const [o, ds] of Object.entries(x.deps)) {
        const op = pid(i, o);
        for (const [q, d] of ds) {
          const qp = pid(i, q);
          (deps[op] ||= []).push(qp, d);
          if (hasOut[op]) (rev[qp] ||= []).push(op, d);
        }
      }
    });
    return { start, setup, deps, rev };
  };
  return { P, pinInst: Int32Array.from(pinInst), cSrc, cDst, into, outOf, V: [variant(0), variant(1)] };
}

/** Static timing on a placement (ns, by the model): the critical path delay (flip-flop to
 *  flip-flop) and the criticality (0..1) of every connection. pos[inst] = [x, y] in tiles; delays:
 *  the device's delay table (connDelay). */
export function analyzeTiming(tg, pos, delays = null) {
  const { conns, model } = tg;
  const C = (tg._compiled ||= compileTiming(tg));
  const { P, pinInst, cSrc, cDst, into, outOf, V } = C;
  // the arcs of each instance on its site: a SLICEM (an even column of slices) at a whole x
  const vOf = i => V[pos[i] && pos[i][0] % 1 === 0 ? 1 : 0];
  const delay = new Float64Array(conns.length);
  conns.forEach((c, j) => { c.delay = delay[j] = c.dedicated ? 0 : connDelay(pos[c.src], pos[c.dst], model, delays, c.kind); });
  // arrival at an input pin / an output pin (memoised depth-first; a loop counts as no path)
  const arr = new Float64Array(P), arrDone = new Uint8Array(P), busy = new Uint8Array(P);
  const arrIn = p => { let t = -Infinity; const l = into[p]; if (l) for (const j of l) t = Math.max(t, arrOut(cSrc[j]) + delay[j]); return t; };
  const arrOut = p => {
    if (arrDone[p]) return arr[p];
    const v = vOf(pinInst[p]);
    const s = v.start[p];
    if (s === s) { arrDone[p] = 1; return (arr[p] = s); }
    if (busy[p]) return -Infinity;
    busy[p] = 1;
    let t = -Infinity;
    const l = v.deps[p];
    if (l) for (let k = 0; k < l.length; k += 2) t = Math.max(t, arrIn(l[k]) + l[k + 1]);
    busy[p] = 0;
    arrDone[p] = 1;
    return (arr[p] = t);
  };
  let dmax = 0;
  const carr = new Float64Array(conns.length);
  conns.forEach((c, j) => {
    c.arr = carr[j] = arrOut(cSrc[j]) + delay[j];
    const s = vOf(c.dst).setup[cDst[j]];
    if (s === s && carr[j] + s > dmax) dmax = carr[j] + s;
  });
  // required times: at a setup pin dmax - setup, earlier when the pin passes on to an output
  const req = new Float64Array(P), reqState = new Uint8Array(P);
  const reqIn = p => {
    const v = vOf(pinInst[p]), s = v.setup[p];
    let r = s === s ? dmax - s : Infinity;
    const l = v.rev[p];
    if (l) for (let k = 0; k < l.length; k += 2) r = Math.min(r, reqOut(l[k]) - l[k + 1]);
    return r;
  };
  const reqOut = p => {
    if (reqState[p]) return req[p];
    reqState[p] = 1; req[p] = Infinity;   // (loops)
    let r = Infinity;
    const l = outOf[p];
    if (l) for (const j of l) r = Math.min(r, reqIn(cDst[j]) - delay[j]);
    return (req[p] = r);
  };
  conns.forEach((c, j) => {
    const slack = reqIn(cDst[j]) - carr[j];
    c.crit = dmax > 0 && Number.isFinite(slack) ? Math.max(0, Math.min(1, 1 - slack / dmax)) : 0;
  });
  return { dmax, conns };
}

/** Place a packed design. Options: seed (1), effort (1: moves per temperature scale with it),
 *  bufgSites(siteName, pin, to) (the global clock buffers a DCM output, or a pad's pin I, reaches: route.js bufgReach;
 *  with to = ['DCM', 'CLKIN'] the DCMs whose CLKIN a pad reaches),
 *  timing (1.5: the weight of the timing cost, lambda = timing / (2 + timing) against 1 - lambda for
 *  the wirelength; 0: wirelength only), delays (timing.js delayTable(device): the delay of a
 *  connection by its offset; default: from the distance, the model's dist), clockSites (bufgmux site name -> Set of the slice sites its clock reaches and
 *  of the block RAM / multiplier clock pins as `site.pin`, or null for all: the flip-flops, block RAMs and
 *  multipliers of a clock are kept on them; route.js clockReach), log (function for progress lines),
 *  start (a warm start, #87: at[inst] = { x, y, exact } the slice (x, y) to start a slice instance
 *  nearest to, the exact ones placed first, or { site } the pad / block RAM / multiplier site to start
 *  an instance on when it is free; null: as without a start; then the annealing from rlim (the move
 *  window, in slices) and t x the usual initial temperature). padOk(site, cfg) (bitgen.js knownRouting's
 *  allowPad): whether the registers of an I/O instance (its cfg) are measured on a pad: an I/O with registers
 *  and no LOC is kept on such pads (#96; a LOC'd one is not moved, the bitstream writer then names what it lacks). */
export function place(packed, dev, { seed = 1, effort = 1, timing = 1.5, clockSites = null, bufgSites = null, delays = null, log = null, start = null, padOk = null } = {}) {
  const t0 = Date.now();
  if (!dev.slices) throw new PlaceError('place: pass deviceSites(parseXdlrc(…))');
  const random = rng(seed);
  const ri = n => Math.floor(random() * n);
  const N = packed.insts.length;
  const sites = new Array(N).fill(null);     // inst -> site object
  const pos = new Array(N);                  // inst -> [px, py]
  let moves = 0, temps = 0;
  const warnings = [];

  // ---------------------------------------------------------------- objects
  const objOf = new Array(N).fill(-1);
  const objs = [];
  const addObj = o => { o.id = objs.length; objs.push(o); return o; };
  for (const m of packed.macros) {
    const o = { kind: 'macro', members: m.members.map(x => ({ inst: x.inst, dx: x.dx, dy: x.dy })), align: m.align || [1, 1], macro: m.kind };
    for (const x of o.members) objOf[x.inst] = objs.length;
    addObj(o);
  }
  packed.insts.forEach((inst, i) => {
    if (objOf[i] >= 0) return;
    objOf[i] = objs.length;
    if (inst.kind === 'slice') addObj({ kind: 'macro', members: [{ inst: i, dx: 0, dy: 0 }], align: [1, 1] });
    else if (inst.kind === 'iob') addObj({ kind: 'iob', inst: i, fixed: !!inst.loc, dir: inst.dir });
    else if (inst.kind === 'bufg') addObj({ kind: 'bufg', inst: i });
    else if (inst.kind === 'bram' || inst.kind === 'mult') addObj({ kind: inst.kind, inst: i });
    else if (inst.kind === 'dcm') addObj({ kind: 'dcm', inst: i, fixed: true });
    else throw new PlaceError(`place: unknown instance kind ${inst.kind}`);
  });

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
  const clockReachOf = name => { if (!reachCache.has(name)) reachCache.set(name, clockSites ? clockSites(name) : null); return reachCache.get(name); };
  // (a DCM's CLKIN / CLKFB too, #47: on the DCM's site, or the one tried, dcmTried)
  const dcmTried = new Map();
  const serves = (bi, name) => {
    const cs = clockReachOf(name), L = loads.get(bi);
    if (!cs || !L) return true;
    if (L.dcm.some(p => { const s = dcmTried.get(p.inst) || sites[p.inst]; return s && !cs.has(`${s.name}.${p.pin}`); })) return false;
    if ([...L.slices].length > [...cs].filter(s => !s.includes('.')).length) return false;
    return ['bram', 'mult'].every(k => L[k].insts.size <= ((k === 'bram' ? dev.brams : dev.mults) || []).filter(s => [...L[k].pins].every(p => cs.has(`${s.name}.${p}`))).length);
  };
  const padReach = new Map();   // pad name -> the buffers its dedicated paths of known bits reach
  const padReachOf = name => { if (!padReach.has(name)) padReach.set(name, bufgSites(name, 'I') || []); return padReach.get(name); };
  const bufClaimed = new Set();
  // DCMs (#47): each on a DCM site (its INST LOC, or any) from which every clock output that drives
  // a global buffer reaches a buffer of its own through dedicated paths of known bits (bufgSites),
  // the buffers matched to the outputs. Of the placements, the one with the most outputs on such a
  // buffer, then the most buffers whose lines reach their clock's loads (#56), then the most DCMs
  // whose CLKIN a pad reaches on a dedicated path of known bits (its LOC'd pad, or a free one: #57),
  // then by site (dcmRank: the top-left DCM first, the side ones of the XC3S1200E last).
  const dcmObjs = objs.filter(o => o.kind === 'dcm');
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
    const better = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };
    let best = null, budget = 200000;
    const assign = [];
    const evaluate = () => {
      dcmObjs.forEach((o, k) => dcmTried.set(o.inst, assign[k]));
      // the buffers: the matching of the most outputs, then the most buffers that serve their loads
      const items = dcmObjs.flatMap((o, k) => outs[k].map(x => ({ bi: x.bi, reach: reachB(assign[k].name, x.pin) })));
      let bm = null;
      const taken = new Set(), pick = [];
      const rec = (i, matched, serving) => {
        if (budget-- < 0) return;
        if (bm && (matched + items.length - i < bm.matched || (matched + items.length - i === bm.matched && serving + items.length - i <= bm.serving))) return;
        if (i === items.length) { bm = { matched, serving, pick: [...pick] }; return; }
        for (const b of items[i].reach) if (!taken.has(b)) {
          taken.add(b); pick.push(b);
          rec(i + 1, matched + 1, serving + (serves(items[i].bi, b) ? 1 : 0));
          pick.pop(); taken.delete(b);
        }
        pick.push(null); rec(i + 1, matched, serving); pick.pop();
      };
      rec(0, 0, 0);
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
    best.items.forEach((it, i) => { if (best.pick[i]) { preBuf.set(it.bi, best.pick[i]); bufClaimed.add(best.pick[i]); } });
  }
  // a clock input with no LOC that drives a DCM's CLKIN: on a free pad whose dedicated path of
  // known bits reaches that DCM's CLKIN (B8 -> DCM_X0Y1 on the XC3S250E / 500E), kept there (#57); before the
  // clock inputs of global buffers, which have more GCLK pins to choose from
  const dcmOfPad = o => packed.nets.find(n => n.outpins[0]?.inst === o.inst)?.inpins.find(p => p.pin === 'CLKIN' && packed.insts[p.inst].kind === 'dcm')?.inst;
  if (bufgSites) for (const o of objs) if (o.kind === 'iob' && !o.fixed && o.dir === 'in' && dcmOfPad(o) !== undefined) {
    const loc = sites[dcmOfPad(o)].name;
    const p = freePads('in', vccoOf(o.inst)).find(p => dcmPadsOf(p.name).includes(loc));
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
        // (a buffer whose lines do not reach the clock's loads after the others, #56)
        const k = (bufgRank.get(b) ?? Infinity) + (serves(bufgOfPad(o), b) ? 0 : 1000);
        if (!bufClaimed.has(b) && (!best || k < best.k)) best = { p, b, k };
      }
    }
    if (!best) continue;   // no GCLK pin free: a pad like any other (general routing to the buffer)
    bufClaimed.add(best.b);
    bankAdd(best.p, vccoOf(o.inst), 1);
    padUsed.set(best.p.name, o);
    sites[o.inst] = best.p;
    o.fixed = o.gclk = true;
  }
  // an I/O with registers (#96): only the pads its registers' settings are measured on, if any is free
  const padFits = (i, p) => !padOk || !packed.insts[i].regs?.length || padOk(p.name, packed.insts[i].cfg);
  for (const o of objs) if (o.kind === 'iob' && !o.fixed) {
    const all = freePads(o.dir, vccoOf(o.inst)), fits = all.filter(p => padFits(o.inst, p));
    const fp = fits.length ? fits : all;
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
  // clock buffers: by the pad (or DCM) that drives them
  const bufUsed = new Set();
  const byName = new Map(dev.bufgmux.map(b => [b.name, b]));
  const driverOfPin = new Map();
  for (const n of packed.nets) for (const ip of n.inpins) driverOfPin.set(`${ip.inst}:${ip.pin}`, n.outpins[0]);
  // a buffer driven by a DCM output, or by a clock pad put on a GCLK pin: one of the buffers that
  // output reaches (bufgSites: the dedicated paths of known bits, route.js bufgReach), those first
  const reachOf = o => {
    const d = driverOfPin.get(`${o.inst}:I0`);
    // a clock pad, with or without a LOC: the buffers of its GCLK pin, if it is one (#58)
    if (d && bufgSites && packed.insts[d.inst].kind === 'iob') return new Set(padReachOf(sites[d.inst].name));
    return d && bufgSites && packed.insts[d.inst].kind === 'dcm' ? new Set(bufgSites(sites[d.inst].name, d.pin)) : null;
  };
  // (the most constrained first: a DCM output that reaches fewer buffers chooses before the others)
  const reachSize = o => reachOf(o)?.size || Infinity;
  // (the buffers matched to the DCMs' outputs above first)
  const bufgObjs = objs.filter(o => o.kind === 'bufg').sort((a, b) => (preBuf.has(b.inst) - preBuf.has(a.inst)) || reachSize(a) - reachSize(b));
  for (const o of bufgObjs) {
    if (preBuf.has(o.inst)) { bufUsed.add(preBuf.get(o.inst)); sites[o.inst] = byName.get(preBuf.get(o.inst)); continue; }
    const d = driverOfPin.get(`${o.inst}:I0`);
    const pad = d && sites[d.inst];
    const top = pad && pad.py > dev.rows / 2;
    const reach = reachOf(o);
    const order = [...BUFG_ORDER.slice(top ? 0 : 4, top ? 4 : 8), ...BUFG_ORDER.slice(top ? 4 : 0, top ? 8 : 4), ...dev.bufgmux.map(b => b.name)];
    const free = order.map(n => byName.get(n)).filter((b, k, a) => b && !bufUsed.has(b.name) && a.indexOf(b) === k);
    // a buffer the driver's dedicated path reaches, whose lines reach the clock's loads (#56), else
    // any it reaches; a clock pad that reaches none (not a GCLK pin, or #56): by the pad's edge, from
    // the pad through general routing
    const ded = reach ? free.filter(b => reach.has(b.name)) : [];
    const ok = b => serves(o.inst, b.name);
    let b = ded.find(ok);
    if (reach && packed.insts[d.inst].kind === 'dcm') {
      b ||= ded[0];
      if (!b) throw new PlaceError(`place: ${packed.insts[o.inst].name}: no free global clock buffer reachable from ${packed.insts[d.inst].name}.${d.pin} through switches of known bits${reach.size ? ` (${[...reach].join(', ')})` : ''}`);
    } else if (!b) {
      b = free.find(ok);
      // (a GCLK pin whose buffers the flow cannot use: the side ones, whose settings are not in the
      // bit database yet, #45 and #58)
      if (b && reach?.size && ![...reach].some(n => byName.has(n))) warnings.push(`${packed.insts[d.inst].name}: its pad ${pad.name} reaches on a dedicated path only side global buffers, which the placer does not use yet (#95) (${[...reach].join(', ')}): ${b.name} instead, through general routing`);
      else if (b && ded.length) warnings.push(`${packed.insts[d.inst].name}: the global buffer${ded.length > 1 ? 's' : ''} ${ded.map(b => b.name).join(', ')} that its pad ${pad.name} reaches on a dedicated path ${ded.length > 1 ? 'do' : 'does'} not reach every clock pin of its loads on switches of known bits: ${b.name} instead, through general routing`);
      b ||= ded[0] || free[0];
    }
    if (!b) throw new PlaceError('place: no free global clock buffer');
    bufUsed.add(b.name);
    sites[o.inst] = b;
  }
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
  for (const o of objs) if (o.kind === 'bram' || o.kind === 'mult') {
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
    const reach = clockSites(sites[n.outpins[0].inst].name);
    if (reach) for (const p of n.inpins) if (p.pin === 'CLK' && packed.insts[p.inst].kind === 'slice') allowedOf[p.inst] = reach;
  }
  // RAMs and shift registers (instances of type SLICEM) only on SLICEM sites (the left column of a CLB)
  const allowedAt = (i, k) => (!allowedOf[i] || allowedOf[i].has(dev.slices.get(k).name)) && (packed.insts[i].type !== 'SLICEM' || dev.slices.get(k).type === 'SLICEM');

  // ---------------------------------------------------------------- slices: legal anchors, occupancy
  // the slice grid: index gx * GH + gy of slice (gx, gy); its site (null: no slice there), whether it
  // is a SLICEM, and the occupant (-1: free)
  const sliceList = [...dev.slices.values()];
  const maxX = Math.max(...sliceList.map(s => s.x)), maxY = Math.max(...sliceList.map(s => s.y));
  const GH = maxY + 1, GN = (maxX + 1) * GH;
  const gridSite = new Array(GN).fill(null);
  const gridM = new Uint8Array(GN);
  for (const s of sliceList) { gridSite[s.x * GH + s.y] = s; gridM[s.x * GH + s.y] = s.type === 'SLICEM' ? 1 : 0; }
  const gidx = (x, y) => (x < 0 || y < 0 || x > maxX || y > maxY ? -1 : x * GH + y);
  // allowedAt on the grid: a table of the slices an instance may take (null: any), one per clock
  // reach and SLICEM need (the slices the clock reaches, the SLICEM sites)
  const allowedTables = new Map();
  const allowedG = allowedOf.map((r, i) => {
    const m = packed.insts[i].type === 'SLICEM';
    if (!r && !m) return null;
    if (!allowedTables.has(r)) allowedTables.set(r, [null, null]);
    const t = allowedTables.get(r);
    if (!t[+m]) {
      const a = t[+m] = new Uint8Array(GN);
      for (let g = 0; g < GN; g++) if (gridSite[g] && (!r || r.has(gridSite[g].name)) && (!m || gridM[g] === 1)) a[g] = 1;
    }
    return t[+m];
  });
  const allowedAtG = (i, g) => { const a = allowedG[i]; return a === null || a[g] === 1; };
  const occ = new Int32Array(GN).fill(-1);   // grid index -> inst
  const fitsAt = (o, x, y) => {
    if (x % o.align[0] || y % o.align[1]) return false;
    for (const m of o.members) {
      const g = gidx(x + m.dx, y + m.dy);
      if (g < 0 || !gridSite[g] || !allowedAtG(m.inst, g)) return false;
    }
    return true;
  };
  const freeAt = (o, x, y) => o.members.every(m => occ[gidx(x + m.dx, y + m.dy)] < 0);
  const anchorX = new Int32Array(objs.length), anchorY = new Int32Array(objs.length);   // a group's slice (x, y) by object
  const setAt = (o, x, y) => {
    anchorX[o.id] = x; anchorY[o.id] = y;
    for (const m of o.members) {
      const g = gidx(x + m.dx, y + m.dy);
      occ[g] = m.inst;
      sites[m.inst] = gridSite[g];
    }
  };
  // initial placement: the largest groups first, each at a random free legal position near the
  // middle of the chip (then the annealing spreads and orders them)
  const slicesObjs = objs.filter(o => o.kind === 'macro').sort((a, b) => b.members.length - a.members.length);
  const total = slicesObjs.reduce((a, o) => a + o.members.length, 0);
  if (total > dev.slices.size) throw new PlaceError(`place: ${total} slices needed, the device has ${dev.slices.size}`);
  // a warm start: each group with a slice to start from on the free legal anchor nearest to it (the
  // exact ones first, the largest first), ring by ring around it; the others as without one
  const target = o => { const m = o.members.find(x => start.at[x.inst]?.x !== undefined); return m && { ...start.at[m.inst], x: start.at[m.inst].x - m.dx, y: start.at[m.inst].y - m.dy }; };
  const warm = start ? slicesObjs.filter(target).sort((a, b) => (target(b).exact - target(a).exact) || b.members.length - a.members.length) : [];
  for (const o of warm) {
    const t = target(o), cx = Math.round(t.x), cy = Math.round(t.y);
    let at = null;
    for (let r = 0; r <= maxX + maxY && !at; r++) {
      let bd = Infinity;
      for (let dx = -r; dx <= r; dx++) for (const dy of Math.abs(dx) === r ? [...Array(2 * r + 1).keys()].map(k => k - r) : [-r, r]) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x > maxX || y > maxY || !fitsAt(o, x, y) || !freeAt(o, x, y)) continue;
        const d = (x - t.x) ** 2 + (y - t.y) ** 2;
        if (d < bd) { bd = d; at = [x, y]; }
      }
    }
    if (at) setAt(o, at[0], at[1]);
  }
  const started = new Set(warm.filter(o => sites[o.members[0].inst]));
  for (const o of slicesObjs) {
    if (started.has(o)) continue;
    let done = false;
    for (let tries = 0; tries < 20000 && !done; tries++) {
      // a window around the centre that grows with the attempts
      const r = Math.min(1, 0.25 + tries / 4000);
      const x = Math.floor(maxX / 2 + (random() - 0.5) * (maxX + 1) * r), y = Math.floor(maxY / 2 + (random() - 0.5) * (maxY + 1) * r);
      if (x < 0 || y < 0 || !fitsAt(o, x, y)) continue;
      if (!freeAt(o, x, y)) continue;
      setAt(o, x, y);
      done = true;
    }
    if (!done) {
      // exhaustive search
      outer: for (let x = 0; x <= maxX; x++) for (let y = 0; y <= maxY; y++) {
        if (!fitsAt(o, x, y) || !freeAt(o, x, y)) continue;
        setAt(o, x, y);
        done = true;
        break outer;
      }
    }
    if (!done) throw new PlaceError(`place: no room for a group of ${o.members.length} slices (${o.macro || 'slice'})`);
  }
  // positions (tiles, y upward) of every instance
  const posX = new Float64Array(N), posY = new Float64Array(N);
  for (let i = 0; i < N; i++) { if (!sites[i]) throw new PlaceError(`place: ${packed.insts[i].name} not placed`); posX[i] = sites[i].px; posY[i] = sites[i].py; }
  const posPairs = () => Array.from({ length: N }, (_, i) => [posX[i], posY[i]]);

  // ---------------------------------------------------------------- nets and cost
  // nets for the cost: not the clocks (global lines), not the constants, not the carry links;
  // kept flat (typed arrays): the pins of net k are netPin[netStart[k] .. netStart[k + 1]), the
  // nets of instance i netOf[instNetStart[i] .. instNetStart[i + 1])
  const netPinsList = [];
  for (const n of packed.nets) {
    if (n.type !== 'wire' || !n.outpins.length) continue;
    const d = packed.insts[n.outpins[0].inst];
    if (d.kind === 'bufg') continue;
    const pins = [...new Set([...n.outpins, ...n.inpins].map(p => p.inst))];
    if (pins.length < 2) continue;
    netPinsList.push(pins);
  }
  const NN = netPinsList.length;
  const netStart = new Int32Array(NN + 1);
  netPinsList.forEach((p, k) => { netStart[k + 1] = netStart[k] + p.length; });
  const netPin = new Int32Array(netStart[NN]);
  const netW = new Float64Array(NN), netCostOf = new Float64Array(NN);
  const instNetCount = new Int32Array(N + 1);
  netPinsList.forEach((p, k) => { netPin.set(p, netStart[k]); netW[k] = crossing(p.length); for (const i of p) instNetCount[i + 1]++; });
  const instNetStart = new Int32Array(N + 1);
  for (let i = 0; i < N; i++) instNetStart[i + 1] = instNetStart[i] + instNetCount[i + 1];
  const netOf = new Int32Array(instNetStart[N]);
  { const fill = instNetStart.slice(0, N); netPinsList.forEach((p, k) => { for (const i of p) netOf[fill[i]++] = k; }); }
  // the bounding box of each net (box[4k .. 4k + 3]: x0, x1, y0, y1) and how many of its pins lie on
  // each of the four edges (boxN), kept up to date: a move of one pin of a net updates it in constant
  // time (VPR's incremental bounding boxes), the pins are scanned again only when the one pin on an
  // edge moves inwards
  const box = new Float64Array(4 * NN), boxN = new Int32Array(4 * NN);
  const scanBox = (k, B, BN, o) => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, n0 = 0, n1 = 0, m0 = 0, m1 = 0;
    for (let j = netStart[k], e = netStart[k + 1]; j < e; j++) {
      const i = netPin[j], x = posX[i], y = posY[i];
      if (x < x0) { x0 = x; n0 = 1; } else if (x === x0) n0++;
      if (x > x1) { x1 = x; n1 = 1; } else if (x === x1) n1++;
      if (y < y0) { y0 = y; m0 = 1; } else if (y === y0) m0++;
      if (y > y1) { y1 = y; m1 = 1; } else if (y === y1) m1++;
    }
    B[o] = x0; B[o + 1] = x1; B[o + 2] = y0; B[o + 3] = y1;
    BN[o] = n0; BN[o + 1] = n1; BN[o + 2] = m0; BN[o + 3] = m1;
    return netW[k] * ((x1 - x0) + (y1 - y0));
  };
  const netCost = k => scanBox(k, box, boxN, 4 * k);
  let bb = 0;
  for (let k = 0; k < NN; k++) { netCostOf[k] = netCost(k); bb += netCostOf[k]; }
  const initialCost = bb;
  // timing (VPR's timing-driven placer): a second cost, the sum over the connections of
  // criticality^exp x estimated delay (the device's delay table when given), mixed with the
  // wirelength as lambda x timing / its value + (1 - lambda) x wirelength / its value, both
  // normalised at every temperature; the criticalities follow the placement (recomputed at every
  // temperature) and the exponent grows from 1 to 8 as the move window shrinks
  const tg = timing > 0 ? timingGraph(packed) : null;
  const lambda = tg ? timing / (2 + timing) : 0;
  const tconns = tg ? tg.conns.filter(c => !c.dedicated && c.src !== c.dst) : [];
  const NC = tconns.length;
  const cSrc = Int32Array.from(tconns, c => c.src), cDst = Int32Array.from(tconns, c => c.dst), cKind = Int32Array.from(tconns, c => c.kind);
  const cW = new Float64Array(NC), cD = new Float64Array(NC);
  const instConnCount = new Int32Array(N + 1);
  for (let j = 0; j < NC; j++) { instConnCount[cSrc[j] + 1]++; instConnCount[cDst[j] + 1]++; }
  const instConnStart = new Int32Array(N + 1);
  for (let i = 0; i < N; i++) instConnStart[i + 1] = instConnStart[i] + instConnCount[i + 1];
  const connOf = new Int32Array(instConnStart[N]);
  { const fill = instConnStart.slice(0, N); for (let j = 0; j < NC; j++) { connOf[fill[cSrc[j]]++] = j; connOf[fill[cDst[j]]++] = j; } }
  let tc = 0, bbNorm = 1, tcNorm = 1, dmax = 0, critExp = 1;
  const model = tg ? tg.model : SPEED_4;
  const dist = model.dist;
  // the estimated delay of connection j (connDelay, inlined)
  const DT = delays && delays.d && Number.isInteger(delays.w) && Number.isInteger(delays.dc0) ? delays : null;   // timing.js delayTable's table: read directly
  const dtW = DT ? DT.w : 0, dtH = DT ? DT.h : 0, dtC0 = DT ? DT.dc0 : 0, dtR0 = DT ? DT.dr0 : 0, dtD = DT ? DT.d : null;
  const dtK = DT && DT.d.length >= 2 * dtW * dtH ? dtW * dtH : 0;   // (a table per kind of driver)
  const cdelay = DT
    ? j => {
      // (its at(dc, dr, kind): the offsets of whole tiles, clamped to the table)
      let x = Math.floor(posX[cDst[j]]) - Math.floor(posX[cSrc[j]]) + dtC0, y = Math.floor(posY[cSrc[j]]) - Math.floor(posY[cDst[j]]) + dtR0;
      x = x < 0 ? 0 : x > dtW - 1 ? dtW - 1 : x; y = y < 0 ? 0 : y > dtH - 1 ? dtH - 1 : y;
      return dtD[cKind[j] * dtK + y * dtW + x];
    }
    : delays ? j => delays.at(Math.floor(posX[cDst[j]]) - Math.floor(posX[cSrc[j]]), Math.floor(posY[cSrc[j]]) - Math.floor(posY[cDst[j]]), cKind[j])
    : j => {
      const d = Math.abs(posX[cSrc[j]] - posX[cDst[j]]) + Math.abs(posY[cSrc[j]] - posY[cDst[j]]);
      return dist.base + dist.perTile * Math.min(d, dist.knee) + dist.far * Math.max(0, d - dist.knee);
    };
  const reweight = () => {
    bb = 0;
    for (let k = 0; k < NN; k++) { netCostOf[k] = netCost(k); bb += netCostOf[k]; }
    bbNorm = Math.max(bb, 1e-9);
    if (!tg) return;
    const t = analyzeTiming(tg, posPairs(), delays);
    dmax = t.dmax;
    tc = 0;
    for (let j = 0; j < NC; j++) { cW[j] = tconns[j].crit ** critExp; cD[j] = cdelay(j); tc += cW[j] * cD[j]; }
    tcNorm = Math.max(tc, 1e-9);
  };
  const totalCost = () => (1 - lambda) * bb / bbNorm + lambda * tc / tcNorm;
  reweight();
  const initialDelay = dmax;

  // ---------------------------------------------------------------- moves
  const movable = objs.filter(o => (o.kind === 'macro') || (o.kind === 'iob' && !o.fixed) || ((o.kind === 'bram' || o.kind === 'mult') && !o.fixed && hardSites[o.kind].length > 1));
  if (!movable.length) return finish();
  // a proposed move: the instances that change site (chInst[0 .. chN), to chSite), and what commit
  // needs (mv)
  const maxMembers = Math.max(1, ...objs.map(o => (o.members ? o.members.length : 1)));
  const chInst = new Int32Array(2 * maxMembers + 2);
  const chSite = new Array(2 * maxMembers + 2).fill(null);
  let chN = 0;
  const mv = { kind: '', o: null, other: null, p: null, x: 0, y: 0, nDisp: 0 };
  const newG = new Int32Array(maxMembers), freedG = new Int32Array(maxMembers), dispInst = new Int32Array(maxMembers);
  let rlim = Math.max(maxX, maxY);
  const padsFor = { in: [...dev.pads.values()], out: [...dev.pads.values()].filter(p => !p.inputOnly) };
  // propose a move into chInst / chSite / mv; false: none
  function propose() {
    const o = movable[ri(movable.length)];
    chN = 0;
    if (o.kind === 'bram' || o.kind === 'mult') {
      // another site of its kind (swapping with the instance there)
      const cands = hardSites[o.kind];
      const p = cands[ri(cands.length)];
      const other = hardUsed[o.kind].get(p.name);
      if (other === o || (other && other.fixed)) return false;
      const cur = sites[o.inst];
      if (!hardOk(o, p, other) || (other && !hardOk(other, cur, o))) return false;
      chInst[chN] = o.inst; chSite[chN++] = p;
      if (other) { chInst[chN] = other.inst; chSite[chN++] = cur; }
      mv.kind = 'hard'; mv.o = o; mv.other = other; mv.p = p;
      return true;
    }
    if (o.kind === 'iob') {
      const cands = padsFor[o.dir === 'in' ? 'in' : 'out'];
      const p = cands[ri(cands.length)];
      const other = padUsed.get(p.name);
      if (other === o) return false;
      if (other && (other.fixed || (other.dir !== 'in' && sites[o.inst].inputOnly))) return false;
      if (!padFits(o.inst, p) && padFits(o.inst, sites[o.inst])) return false;
      if (other && !padFits(other.inst, sites[o.inst]) && padFits(other.inst, p)) return false;
      // both I/Os must suit the VCCO of the bank they go to
      const old = sites[o.inst], vo = vccoOf(o.inst), vt = other ? vccoOf(other.inst) : null;
      bankAdd(old, vo, -1); if (other) bankAdd(p, vt, -1);
      const ok = bankOk(p, vo) && (!other || bankOk(old, vt)) && (bankOfPad(p) !== bankOfPad(old) || vo == null || vt == null || vo === vt);
      bankAdd(old, vo, 1); if (other) bankAdd(p, vt, 1);
      if (!ok) return false;
      chInst[chN] = o.inst; chSite[chN++] = p;
      if (other) { chInst[chN] = other.inst; chSite[chN++] = old; }
      mv.kind = 'iob'; mv.o = o; mv.other = other; mv.p = p;
      return true;
    }
    const ax = anchorX[o.id], ay = anchorY[o.id];
    const r = Math.max(1, Math.round(rlim));
    const x = ax + ri(2 * r + 1) - r, y = ay + ri(2 * r + 1) - r;
    if ((x === ax && y === ay) || x < 0 || y < 0 || !fitsAt(o, x, y)) return false;
    const mem = o.members, nm = mem.length;
    for (let j = 0; j < nm; j++) newG[j] = gidx(x + mem[j].dx, y + mem[j].dy);
    // the slices it leaves (its old slices not among the new), in member order, and the single
    // slices on its new slices, which step into them
    let nFreed = 0, nDisp = 0;
    for (let j = 0; j < nm; j++) {
      const g = gidx(ax + mem[j].dx, ay + mem[j].dy);
      let inNew = false;
      for (let q = 0; q < nm; q++) if (newG[q] === g) { inNew = true; break; }
      if (!inNew) freedG[nFreed++] = g;
    }
    for (let j = 0; j < nm; j++) {
      const i = occ[newG[j]];
      if (i < 0 || objOf[i] === o.id) continue;
      if (objs[objOf[i]].members.length > 1) return false;   // only single slices step aside
      dispInst[nDisp++] = i;
    }
    for (let j = 0; j < nDisp; j++) if (!allowedAtG(dispInst[j], freedG[j])) return false;
    for (let j = 0; j < nm; j++) { chInst[chN] = mem[j].inst; chSite[chN++] = gridSite[newG[j]]; }
    for (let j = 0; j < nDisp; j++) { chInst[chN] = dispInst[j]; chSite[chN++] = gridSite[freedG[j]]; }
    mv.kind = 'slice'; mv.o = o; mv.x = x; mv.y = y; mv.nDisp = nDisp;
    return true;
  }
  // the cost change of the proposed move: the nets and connections it touches (each once, in the
  // order met), their new costs and delays kept for commit
  const netMark = new Int32Array(NN), connMark = new Int32Array(NC);
  let mark = 0;
  const tNets = new Int32Array(NN), tNetCost = new Float64Array(NN), netQ = new Int32Array(NN);
  const tBox = new Float64Array(4 * NN), tBoxN = new Int32Array(4 * NN);
  const tConns = new Int32Array(NC), tConnDelay = new Float64Array(NC);
  let nT = 0, nTC = 0, dbbL = 0, dtcL = 0;
  const saveX = new Float64Array(chInst.length), saveY = new Float64Array(chInst.length);
  // the moved pins of each touched net: a list per net (head[q], then next[]) of change indexes
  let maxNets = 1;
  for (let i = 0; i < N; i++) maxNets = Math.max(maxNets, instNetStart[i + 1] - instNetStart[i]);
  const head = new Int32Array(NN), lnkC = new Int32Array(chInst.length * maxNets), lnkNext = new Int32Array(chInst.length * maxNets);
  // one side (x: o = 0, y: o = 2) of the box of touched net q after its moved pins leave their old
  // positions (saved) for their new ones (pos), from its box before (box[b]), into tBox[4q + o]:
  // false when an edge loses all its pins (the pins must be scanned again)
  const moveSide = (q, b, o, P, S) => {
    let lo = box[b + o], hi = box[b + o + 1], nlo = boxN[b + o], nhi = boxN[b + o + 1];
    for (let l = head[q]; l >= 0; l = lnkNext[l]) { const v = S[lnkC[l]]; if (v === lo) nlo--; if (v === hi) nhi--; }
    for (let l = head[q]; l >= 0; l = lnkNext[l]) {
      const v = P[chInst[lnkC[l]]];
      if (v < lo) { lo = v; nlo = 1; } else if (v === lo) nlo++;
      if (v > hi) { hi = v; nhi = 1; } else if (v === hi) nhi++;
    }
    if (nlo <= 0 || nhi <= 0) return false;
    const w = 4 * q + o;
    tBox[w] = lo; tBox[w + 1] = hi; tBoxN[w] = nlo; tBoxN[w + 1] = nhi;
    return true;
  };
  function delta() {
    mark++;
    nT = 0; nTC = 0;
    let nl = 0;
    for (let c = 0; c < chN; c++) {
      const i = chInst[c];
      for (let q = instNetStart[i], e = instNetStart[i + 1]; q < e; q++) {
        const k = netOf[q];
        if (netMark[k] !== mark) { netMark[k] = mark; netQ[k] = nT; head[nT] = -1; tNets[nT++] = k; }
        const qk = netQ[k];
        lnkC[nl] = c; lnkNext[nl] = head[qk]; head[qk] = nl++;
      }
      if (lambda) for (let q = instConnStart[i], e = instConnStart[i + 1]; q < e; q++) { const j = connOf[q]; if (connMark[j] !== mark) { connMark[j] = mark; tConns[nTC++] = j; } }
    }
    for (let c = 0; c < chN; c++) { const i = chInst[c]; saveX[c] = posX[i]; saveY[c] = posY[i]; posX[i] = chSite[c].px; posY[i] = chSite[c].py; }
    let dbb = 0, dtc = 0;
    for (let q = 0; q < nT; q++) {
      const k = tNets[q], o = 4 * q;
      let c;
      // a larger net: its box from the old one and its moved pins, unless an edge loses all its
      // pins (a small net: scanned, as fast)
      if (netStart[k + 1] - netStart[k] > BOX_SCAN && moveSide(q, 4 * k, 0, posX, saveX) && moveSide(q, 4 * k, 2, posY, saveY)) c = netW[k] * ((tBox[o + 1] - tBox[o]) + (tBox[o + 3] - tBox[o + 2]));
      else c = scanBox(k, tBox, tBoxN, o);
      tNetCost[q] = c; dbb += c - netCostOf[k];
    }
    for (let q = 0; q < nTC; q++) { const j = tConns[q], d = cdelay(j); tConnDelay[q] = d; dtc += cW[j] * (d - cD[j]); }
    for (let c = 0; c < chN; c++) { const i = chInst[c]; posX[i] = saveX[c]; posY[i] = saveY[c]; }
    dbbL = dbb; dtcL = dtc;
    return (1 - lambda) * dbb / bbNorm + lambda * dtc / tcNorm;
  }
  function commit() {
    if (mv.kind === 'hard') {
      const { o, other, p } = mv;
      const old = sites[o.inst];
      if (other) { hardUsed[o.kind].delete(p.name); setHard(o, p); setHard(other, old); posX[other.inst] = old.px; posY[other.inst] = old.py; } else setHard(o, p);
      posX[o.inst] = p.px; posY[o.inst] = p.py;
    } else if (mv.kind === 'iob') {
      const { o, other, p } = mv;
      const old = sites[o.inst];
      const vo = vccoOf(o.inst), vt = other ? vccoOf(other.inst) : null;
      bankAdd(old, vo, -1); bankAdd(p, vo, 1);
      if (other) { bankAdd(p, vt, -1); bankAdd(old, vt, 1); }
      padUsed.delete(old.name);
      if (other) { padUsed.set(old.name, other); sites[other.inst] = old; posX[other.inst] = old.px; posY[other.inst] = old.py; }
      padUsed.set(p.name, o); sites[o.inst] = p; posX[o.inst] = p.px; posY[o.inst] = p.py;
    } else {
      const { o, x, y, nDisp } = mv;
      const ax = anchorX[o.id], ay = anchorY[o.id];
      for (const m of o.members) occ[gidx(ax + m.dx, ay + m.dy)] = -1;
      for (let j = 0; j < nDisp; j++) {
        const i = dispInst[j], g = freedG[j], s = gridSite[g];
        occ[g] = i; sites[i] = s; posX[i] = s.px; posY[i] = s.py;
        anchorX[objOf[i]] = s.x; anchorY[objOf[i]] = s.y;
      }
      setAt(o, x, y);
      for (const m of o.members) { posX[m.inst] = sites[m.inst].px; posY[m.inst] = sites[m.inst].py; }
    }
    for (let q = 0; q < nT; q++) {
      const k = tNets[q];
      netCostOf[k] = tNetCost[q];
      for (let e = 0; e < 4; e++) { box[4 * k + e] = tBox[4 * q + e]; boxN[4 * k + e] = tBoxN[4 * q + e]; }
    }
    for (let q = 0; q < nTC; q++) cD[tConns[q]] = tConnDelay[q];
    bb += dbbL; tc += dtcL;
  }

  // ---------------------------------------------------------------- annealing
  // initial temperature: 20 x the standard deviation of the cost changes of random moves
  const sample = [];
  for (let k = 0; k < Math.max(50, movable.length); k++) if (propose()) sample.push(delta());
  const mean = sample.reduce((a, b) => a + b, 0) / Math.max(1, sample.length);
  const sd = Math.sqrt(sample.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, sample.length));
  let T = 20 * sd || 1;
  const rlim0 = rlim;
  // (a warm start: a cool annealing in a small window, the criticalities' exponent as there; t 0: none)
  if (start) {
    T *= start.t ?? 0.05;
    rlim = Math.min(rlim0, start.rlim ?? 3);
    critExp = 1 + 7 * Math.max(0, 1 - (rlim - 1) / Math.max(1, rlim0 - 1));
    reweight();
  }
  const perT = Math.max(100, Math.round(effort * 10 * Math.pow(movable.length, 4 / 3)));
  // (a warm start at t 0: the greedy pass alone, no move of the same cost)
  while (T > 0) {
    let acc = 0, tried = 0;
    for (let k = 0; k < perT; k++) {
      if (!propose()) continue;
      tried++;
      const d = delta();
      if (d <= 0 || random() < Math.exp(-d / T)) { commit(); acc++; }
    }
    moves += perT; temps++;
    critExp = 1 + 7 * Math.max(0, 1 - (rlim - 1) / Math.max(1, rlim0 - 1));
    reweight();
    const a = tried ? acc / tried : 0;
    // VPR's schedule: cool slowly while many moves are accepted
    T *= a > 0.96 ? 0.5 : a > 0.8 ? 0.9 : a > 0.15 ? 0.95 : 0.8;
    rlim = Math.min(Math.max(maxX, maxY), Math.max(1, rlim * (1 - 0.44 + a)));
    if (log && temps % 10 === 0) log(`T=${T.toFixed(4)} wirelength=${bb.toFixed(1)} delay=${dmax.toFixed(2)} accept=${a.toFixed(2)} rlim=${rlim.toFixed(1)}`);
    if (T < 0.005 * totalCost() / Math.max(1, NN) || temps > 400) break;
  }
  // a last greedy pass (temperature 0)
  for (let k = 0; k < perT; k++) { if (!propose()) continue; if (delta() < 0) commit(); }
  // the result: the wirelength (recomputed: no drift), and the estimated critical path
  reweight();
  if (!tg) dmax = analyzeTiming(timingGraph(packed), posPairs(), delays).dmax;
  return finish();

  function finish() {
    return {
      sites: sites.map(s => ({ tile: s.tile, site: s.name })),
      cost: bb, delay: dmax, warnings: [...warnings, ...dcmClkinWarnings()], stats: { initialCost, initialDelay, moves, temps, seconds: (Date.now() - t0) / 1000, objects: objs.length },
    };
  }
}

/** The placed design, ready for writeXdl: instances with their sites, nets by instance name. */
export function placedXdl(packed, placement) {
  const insts = packed.insts.map((i, k) => ({ name: i.name, type: i.type, placed: true, tile: placement.sites[k].tile, site: placement.sites[k].site, cfg: i.cfg }));
  const nets = packed.nets.map(n => ({
    name: n.name, type: n.type,
    outpins: n.outpins.map(p => ({ inst: insts[p.inst].name, pin: p.pin })),
    inpins: n.inpins.map(p => ({ inst: insts[p.inst].name, pin: p.pin })),
    pips: [],
  }));
  return { name: packed.name, part: packed.part, cfg: packed.cfg || '', insts, nets };
}
