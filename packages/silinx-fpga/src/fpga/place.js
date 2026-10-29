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
import { mountPads } from './place-pads.js';
import { mountDcms } from './place-dcms.js';
import { mountIobs } from './place-iobs.js';
import { mountBufgs } from './place-bufgs.js';
import { mountHard } from './place-hard.js';
import { mountSlices } from './place-slices.js';
import { mountMoves } from './place-moves.js';

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
 *  allowBufg(tileName, site): the global buffers the flow can use (bitgen.js knownRouting). */
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
        // (pair: the tile of a differential pair, DIFFM / DIFFS, whose two IOBs share each clock wire, #749)
        pads.set(s.name, { name: s.name, tile: t.name, type: s.type, px: t.c, py: rows - 1 - t.r, inputOnly: /^(IBUF|DIFFMI|DIFFSI)$/.test(s.type),
          pair: /^DIFF[MS]/.test(s.type) ? t.name : null, master: /^DIFFM/.test(s.type) });
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
  // the multiplier a multiplier's BCOUT cascades into (#2): the site above it in its column, MULT18X18_XxY(y + 1)
  const multName = new Set(hard.MULT18X18SIO.map(m => m.name));
  for (const m of hard.MULT18X18SIO) {
    const above = m.name.replace(/Y(\d+)$/, (_, y) => `Y${+y + 1}`);
    m.above = multName.has(above) ? above : null;
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
export const crossing = n => (n < CROSS.length ? CROSS[n] : 2.7933 + 0.02616 * (n - 50));
// nets of at most this many pins: their bounding box scanned at every move (faster than kept up to date)
export const BOX_SCAN = 6;

// Clock buffers next to their pad: a BUFG driven straight from a pad on the top / bottom edge
// takes a global buffer of that edge (as ISE does: B8 -> BUFGMUX_X2Y11); others the first free one.
export const BUFG_ORDER = ['BUFGMUX_X2Y11', 'BUFGMUX_X2Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X1Y10', 'BUFGMUX_X2Y1', 'BUFGMUX_X2Y0', 'BUFGMUX_X1Y1', 'BUFGMUX_X1Y0'];
// The lines of the global clock network (#95): the top / bottom buffer of each line k (the centre
// tiles' GCLKCOREk), and the side buffers BUFGMUX_X0Y(2+k) / X3Y(2+k), line k of the left / right half
// only (GCLKLRk). In each half the centre tile (GCLKVML / GCLKVMR) drives line k of its quadrants from
// the top / bottom buffer k or from the side buffer k, never both.
export const LINE_BUFG = ['BUFGMUX_X2Y1', 'BUFGMUX_X2Y0', 'BUFGMUX_X1Y1', 'BUFGMUX_X1Y0', 'BUFGMUX_X2Y11', 'BUFGMUX_X2Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X1Y10'];
export const sideBufg = name => { const m = /^BUFGMUX_X([03])Y(\d+)$/.exec(name); return m ? { half: m[1] === '0' ? 'L' : 'R', line: +m[2] - 2 } : null; };
// The clock pad ISE's placer gives a DCM's CLKIN when the pad has no LOC (#92: a design of one DCM on
// each site, implemented by ISE): one of the pads whose dedicated path reaches that DCM
export const DCM_PAD = {
  xc3s100e: { DCM_X0Y1: 'A9', DCM_X0Y0: 'M6' },
  xc3s250e: { DCM_X0Y1: 'C8', DCM_X1Y1: 'A9', DCM_X0Y0: 'N5', DCM_X1Y0: 'M6' },
  xc3s500e: { DCM_X0Y1: 'B9', DCM_X1Y1: 'A10', DCM_X0Y0: 'V9', DCM_X1Y0: 'U10' },
  xc3s1200e: { DCM_X1Y3: 'B9', DCM_X2Y3: 'A10', DCM_X1Y0: 'V9', DCM_X2Y0: 'U10', DCM_X0Y1: 'K3', DCM_X0Y2: 'J4', DCM_X3Y1: 'K13', DCM_X3Y2: 'J15' },
};

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

  // ---------------------------------------------------------------- pads and clock buffers (place-pads.js)
  const { bankAdd, bankOk, bankV, bufOwner, bufgOfPad, bufgRank, clashAt, clockReachOf, dcmTried, freePads, lineServes, loads, padReachOf, padUsed, pairPads, regClk, serves, takeBuf, vccoOf } = mountPads({
    bufgSites, clockSites, dev, packed, N, objs, sites
  });

  // DCMs (#47): on DCM sites, their clock outputs matched to global buffers (place-dcms.js)
  const { bufClaimed, clkinPad, dcmObjs, dcmPadsOf, preBuf } = mountDcms({
    bufgSites, dev, packed, bufgRank, dcmTried, freePads, loads, objs, padReachOf, serves, sites, takeBuf, vccoOf
  });

  // the I/O pads: the clock inputs with no LOC on dedicated paths, the others on free pads (place-iobs.js)
  const { dcmClkinWarnings, padFits } = mountIobs({
    bufgSites, dev, packed, padOk, start, bankAdd, bankV, bufClaimed, bufOwner, bufgOfPad, bufgRank, clashAt, clkinPad,
    dcmObjs, dcmPadsOf, freePads, lineServes, objs, padReachOf, padUsed, preBuf, ri, sites, takeBuf, vccoOf
  });

  // clock buffers: by the pad (or DCM) that drives them (place-bufgs.js)
  mountBufgs({
    bufgSites, dev, packed, bufClaimed, bufOwner, lineServes, objs, padReachOf, preBuf, sites, takeBuf, warnings
  });

  // block RAMs and multipliers: on their sites (RAMB16_XxYy, MULT18X18_XxYy) (place-hard.js)
  const { allowedOf, hardOk, hardSites, hardUsed, setHard } = mountHard({
    clockSites, dev, packed, start, N, clockReachOf, loads, objs, ri, sites
  });

  // ---------------------------------------------------------------- slices: legal anchors, occupancy (place-slices.js)
  const { allowedAtG, anchorX, anchorY, fitsAt, gidx, gridSite, maxX, maxY, occ, posPairs, posX, posY, setAt } = mountSlices({
    dev, packed, start, N, allowedOf, objs, random, sites
  });

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
  let rlim = Math.max(maxX, maxY);
  // the moves: one proposed, its change of cost, its commit (place-moves.js)
  const { commit, delta, propose } = mountMoves({
    dev, N, NC, NN, allowedAtG, anchorX, anchorY, bankAdd, bankOk, bb: () => bb, bbNorm: () => bbNorm, box, boxN, cD,
    cW, cdelay, clashAt, connOf, fitsAt, gidx, gridSite, hardOk, hardSites, hardUsed, instConnStart, instNetStart,
    lambda, movable, netCostOf, netOf, netStart, netW, objOf, objs, occ, padFits, padUsed, posX, posY, ri,
    rlim: () => rlim, scanBox, setAt, setHard, sites, tc: () => tc, tcNorm: () => tcNorm, vccoOf,
    setBb: (v) => { bb = v; }, setTc: (v) => { tc = v; }
  });


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
    // the DIFFM of a pair whose two IOBs' registers of one kind have different clocks: that register on its
    // second flip-flop (#749; ISE's map moves the DIFFM's, whichever the ports' order)
    const ff2 = [];
    for (const ps of pairPads.values()) {
      const [m, sl] = [ps.find(p => p.master), ps.find(p => !p.master)].map(p => p && padUsed.get(p.name)?.inst);
      if (m === undefined || sl === undefined || !regClk[m] || !regClk[sl]) continue;
      for (const g of ['I', 'O']) {
        if (regClk[m][g] === undefined || regClk[sl][g] === undefined || regClk[m][g] === regClk[sl][g]) continue;
        // (a DDR register, #96, has both flip-flops of its IOB, on both clock wires: no room for a second clock)
        const ddr = [m, sl].find(i => packed.insts[i].cfg.some(c => c.attr === (g === 'I' ? 'IFF2' : 'OFF2') && c.value === '#FF'));
        if (ddr !== undefined) {
          const [a, b] = [m, sl].map(i => packed.insts[i].name);
          throw new PlaceError(`place: ${a}, ${b}: their ${g === 'I' ? 'input' : 'output'} registers have different clocks (${packed.nets[regClk[m][g]].name}, ${packed.nets[regClk[sl][g]].name}) on pads ${sites[m].name}, ${sites[sl].name}, whose IOBs share the clock wires of the I/O tile ${sites[m].tile}, and ${packed.insts[ddr].name}'s are DDR registers (both flip-flops): put them on pads of different I/O tiles`);
        }
        ff2.push({ inst: m, group: g });
      }
    }
    return {
      sites: sites.map(s => ({ tile: s.tile, site: s.name })), ff2,
      cost: bb, delay: dmax, warnings: [...warnings, ...dcmClkinWarnings()], stats: { initialCost, initialDelay, moves, temps, seconds: (Date.now() - t0) / 1000, objects: objs.length },
    };
  }
}

// An IOB's registers on its second flip-flops (#749), as ISE's map writes them: IFF1 -> IFF2 clocked by ICLK2,
// out on IQ2; OFF1 / TFF1 -> OFF2 / TFF2 clocked by OTCLK2, their data on O2 / T2 (each part only when used)
const FF2_PARTS = {
  I: [{ ff: 'IFF1', attrs: ['IFF1', 'IFF1_INIT_ATTR', 'IFF1_SR_ATTR', 'ICLK1INV'], pins: ['ICLK1', 'IQ1'] }],
  O: [{ ff: 'OFF1', attrs: ['OFF1', 'OFF1_INIT_ATTR', 'OFF1_SR_ATTR', 'O1INV', 'O1_DDRMUX', 'OMUX'], pins: ['O1'] },
    { ff: 'TFF1', attrs: ['TFF1', 'TFF1_INIT_ATTR', 'TFF1_SR_ATTR', 'T1INV', 'TMUX'], pins: ['T1'] },
    { ff: /^[OT]FF1$/, attrs: ['OTCLK1INV'], pins: ['OTCLK1'] }],
};
const second = v => v.replace(/1(?=$|_|INV$)/, '2');
/** The cfg and pin names of an IOB with the registers of groups (['I'] / ['O']) on its second flip-flops:
 *  { cfg, pin: Map first pin -> second }. */
export function secondFlipFlops(cfg, groups) {
  const used = ff => cfg.some(c => (typeof ff === 'string' ? c.attr === ff : ff.test(c.attr)) && c.value === '#FF');
  const attrs = new Set(), pin = new Map();
  for (const g of groups) for (const part of FF2_PARTS[g]) if (used(part.ff)) { part.attrs.forEach(a => attrs.add(a)); part.pins.forEach(p => pin.set(p, second(p))); }
  const out = cfg.map(c => (attrs.has(c.attr) ? { ...c, attr: second(c.attr), value: /^(IFF|OFF|TFF|ICLK|OTCLK|O|T)1(_B)?$/.test(c.value) ? second(c.value) : c.value } : c));
  return { cfg: out, pin };
}

/** The placed design, ready for writeXdl: instances with their sites, nets by instance name; the registers
 *  the placement puts on an IOB's second flip-flops (placement.ff2, #749) there. */
export function placedXdl(packed, placement) {
  const ff2 = new Map();
  for (const { inst, group } of placement.ff2 || []) ff2.set(inst, [...(ff2.get(inst) || []), group]);
  const moved = new Map([...ff2].map(([k, groups]) => [k, secondFlipFlops(packed.insts[k].cfg, groups)]));
  const insts = packed.insts.map((i, k) => ({ name: i.name, type: i.type, placed: true, tile: placement.sites[k].tile, site: placement.sites[k].site, cfg: moved.get(k)?.cfg || i.cfg }));
  const pinOf = p => moved.get(p.inst)?.pin.get(p.pin) || p.pin;
  const nets = packed.nets.map(n => ({
    name: n.name, type: n.type,
    outpins: n.outpins.map(p => ({ inst: insts[p.inst].name, pin: pinOf(p) })),
    inpins: n.inpins.map(p => ({ inst: insts[p.inst].name, pin: pinOf(p) })),
    pips: [],
  }));
  return { name: packed.name, part: packed.part, cfg: packed.cfg || '', insts, nets };
}
