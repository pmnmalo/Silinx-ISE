// Silinx toolchain - the Spartan-6's static timing (#731, #732): fpga/timing.js's timing graph and analysis (the
// clocks' periods, the pads' paths, the paths between clocks) on the Spartan-6's arcs (fpga/s6/timing-arcs.js) and
// delays, the model fitted to ISE's trce and reportgen on routed designs (fpga/s6/timing-model.js, research/s6):
// a connection's delay by its routed path's nodes (their classes and wire types, its load pin's kind, its fanout),
// the clock's arrival at each flip-flop from its global buffer's routed tree, the pads' Tiopi and Tioop.
//
//   analyzeTimingS6(design, device, opts) -> analyzeTiming's result (fpga/timing.js): { period, clocks, cross, crit,
//     slack, conns, pads }
import { netTree, treePath, timingGraph } from '../timing.js';
import { sliceArcs6, hardArcs6, siteClass } from './timing-arcs.js';
import { S6_ESTIMATE } from './place-timing.js';
import { S6_SPEED_3 } from './timing-model.js';

/** The classes of a Spartan-6 node, by the name of its first wire. */
export const CLASSES6 = ['site', 'logicout', 'single', 'double', 'quad', 'logicin', 'fan', 'clock', 'other'];

/** A wire name's class (an index of CLASSES6). */
export function wireClass6(name) {
  if (/LOGICOUT/.test(name)) return 1;
  if (/^[NSEW][NSEWLR]1[BEM]\d/.test(name)) return 2;
  if (/^[NSEW][NSEWLR]2[BEM]\d/.test(name)) return 3;
  if (/^[NSEW][NSEWLR]4[BEM]\d/.test(name)) return 4;
  if (/LOGICIN/.test(name)) return 5;
  if (/GFAN|FAN_B/.test(name)) return 6;
  if (/GCLK|CLK\d|HCLK/.test(name)) return 7;
  return /^(M|L|X)_|_SITE$|^[A-D]MUX$|BYP|DSP48|RAMB/.test(name) ? 0 : 8;
}

/** The kinds of a connection's load pin: a LUT input by its index (A1 the slowest), a bypass, CE, SR, the carry, an I/O's, another. */
export const PIN_KINDS = ['1', '2', '3', '4', '5', '6', 'X', 'CE', 'SR', 'CIN', 'IO', 'other'];

/** A load pin's kind (an index of PIN_KINDS), by its wire's name. */
export function pinKind(name) {
  const m = name.match(/^(?:[LMX]|XX)_[A-D]([1-6])$/);
  if (m) return +m[1] - 1;
  if (/^(?:[LMX]|XX)_[A-D]X$/.test(name)) return 6;
  if (/CE$/.test(name)) return 7;
  if (/SR$/.test(name)) return 8;
  if (/_CIN$/.test(name)) return 9;
  return /IOB_|OLOGIC|ILOGIC/.test(name) ? 10 : 11;
}

/** A node's first wire: [tile name, wire name]. */
export function nodeWire(device, n) {
  const w = device.nodeWires[device.nodeStart[n]], k = device.wireTile[w];
  return [device.tileNames[k], device.names[device.templates[device.tileTemplate[k]].wires[w - device.tileWireBase[k]]]];
}

/** A wire's type: its name without its index (EE4B#, LOGICIN_B#, …) and its tile kind's prefix. */
export const wireType = name => name.replace(/\d+/g, '#').replace(/^(CLEX[LM]|INT_INTERFACE|IOI)_/, '');

/** A path's nodes (the driver's first) counted by class, their wires' types and its load pin's kind: { counts, wires, pin }. */
export function pathCounts(device, nodes) {
  const counts = new Array(CLASSES6.length).fill(0), wires = [];
  for (const n of nodes.slice(1)) { const w = nodeWire(device, n)[1]; counts[wireClass6(w)]++; wires.push(wireType(w)); }
  return { counts, wires, pin: pinKind(nodeWire(device, nodes.at(-1))[1]) };
}

/** A connection's features: base, each class's count, the fanout beyond one, its load pin's kind (one of PIN_KINDS). */
export const features = c => [1, ...c.counts, Math.max(0, c.fanout - 1), ...PIN_KINDS.map((_, k) => +(c.pin === k))];

/** The clock pins of the Spartan-6's sites: a slice's CLK, a block RAM's CLKAWRCLK / CLKBRDCLK (RAMB8) or CLKA / CLKB. */
export const S6_CLOCK_PIN = /^(CLK|CLKAWRCLK|CLKBRDCLK|CLKA|CLKB)$/;

/** A connection's delay by the wire model (model.wires): its base, classes, fanout, load pin's kind and wire types (ns, not below 0). */
export function wireDelay(w, c) {
  let d = w.base + w.fanout * Math.max(0, c.fanout - 1) + (w.pins[PIN_KINDS[c.pin]] ?? 0);
  c.counts.forEach((n, j) => { d += n * (w.classes[CLASSES6[j]] ?? 0); });
  for (const t of c.wires) d += w.types[t] ?? w.other;
  return Math.max(0, d);
}

/**
 * The arcs function of a design for timingGraph (instArcs's shape: { comb, setup, clkToOut, input, output, clock }):
 * a slice's by its settings and site class, a block RAM's and a DSP48A1's on their pins in use, an IOB's input (I,
 * Tiopi) and output (O, Tioop).
 */
export function arcsS6(design, model = S6_SPEED_3) {
  const ins = new Map(), outs = new Map(), add = (m, i, p) => (m.get(i) ?? m.set(i, []).get(i)).push(p);
  for (const n of design.nets) { for (const p of n.inpins) add(ins, p.inst, p.pin); for (const p of n.outpins) add(outs, p.inst, p.pin); }
  return inst => {
    const out = { comb: [], setup: [], clkToOut: [], input: [], output: [], clock: false };
    if (inst.type === 'IOB') {
      if ((outs.get(inst.name) ?? []).includes('I')) out.input.push(['I', model.pad.Tiopi]);
      if ((ins.get(inst.name) ?? []).includes('O')) out.output.push(['O', model.pad.Tioop]);
      return out;
    }
    const a = /^SLICE/.test(inst.type) ? sliceArcs6(inst, { ...model.arcs, ...(model.arcs.classes?.[siteClass(inst)] ?? {}) })
      : hardArcs6(inst, ins.get(inst.name) ?? [], outs.get(inst.name) ?? [], model.arcs);
    return { ...out, ...a, clock: a.setup.length + a.clkToOut.length > 0 };
  };
}

const placedPin = (device, inst, pin) => (inst?.placed !== false && inst?.site ? device.sitePinNode(inst.site, pin) : -1);

/**
 * Each connection's delay (timingGraph's conns, ns): the wire model on its routed path; a connection not routed (or
 * not found) by the placer's estimate (fpga/s6/place-timing.js: base + per tile of Manhattan distance).
 */
export function connDelaysS6(design, device, tg, model = S6_SPEED_3) {
  const inst = new Map(design.insts.map(i => [i.name, i])), nets = new Map(design.nets.map(n => [n.name, n])), trees = new Map();
  let siteTile = null;
  const tileXY = s => { siteTile ??= new Map(device.sites().map(x => [x.name, device.tile(x.tileName)])); const k = siteTile.get(s); return k === undefined ? null : [device.tileCol[k], device.tileRow[k]]; };
  return Float64Array.from(tg.conns, c => {
    const n = nets.get(c.net), a = inst.get(c.fromPin.inst), b = inst.get(c.toPin.inst);
    let t = trees.get(c.net);
    if (t === undefined) { const s = placedPin(device, a, c.fromPin.pin); t = s >= 0 && n.pips?.length ? netTree(n.pips, [s], device) : null; trees.set(c.net, t); }
    const sink = placedPin(device, b, c.toPin.pin), nodes = t && sink >= 0 ? treePath(t, sink) : null;
    if (nodes && nodes.length >= 2) return wireDelay(model.wires, { ...pathCounts(device, nodes), fanout: n.inpins.length });
    const p = a?.site && tileXY(a.site), q = b?.site && tileXY(b.site);
    return S6_ESTIMATE.base + (p && q ? S6_ESTIMATE.perTile * (Math.abs(p[0] - q[0]) + Math.abs(p[1] - q[1])) : 0);
  });
}

/**
 * The global clocks' arrivals (a net driven by a BUFG, or a BUFH's region of it): { net: Map inst -> ns from its global buffer (the
 * skew of the period's paths), late: Map inst -> ns from the clock's pad (OFFSET OUT), with late.early (OFFSET IN) }.
 * The net's: model.clock.net (a + b × the nodes of its routed path); from the pad: model.clock.late / early
 * (a + b × the net's), fitted on trce's OFFSET paths.
 */
export function clockArrivalsS6(design, device, model = S6_SPEED_3) {
  const inst = new Map(design.insts.map(i => [i.name, i])), net = new Map(), late = new Map(), early = new Map();
  const [na, nb] = model.clock.net, [la, lb] = model.clock.late, [ea, eb] = model.clock.early;
  for (const n of design.nets) {
    const src = n.outpins[0], d = src && inst.get(src.inst);
    if (!d || !/^BUF[GH]$/.test(d.type)) continue;
    const s = placedPin(device, d, src.pin), tree = s >= 0 && n.pips?.length ? netTree(n.pips, [s], device) : null;
    for (const p of n.inpins) {
      if (!S6_CLOCK_PIN.test(p.pin)) continue;
      const k = placedPin(device, inst.get(p.inst), p.pin), nodes = tree && k >= 0 ? treePath(tree, k) : null, v = na + nb * (nodes ? nodes.length - 1 : 0);
      net.set(p.inst, v); late.set(p.inst, la + lb * v); early.set(p.inst, ea + eb * v);
    }
  }
  late.early = early;
  return { net, late };
}

/**
 * The static timing of a placed and routed Spartan-6 design (parseXdl's): fpga/timing.js's analysis on the
 * Spartan-6's arcs and delays, with the clocks' skew in the periods and their arrivals from the pads in the pads'
 * paths. Its result is analyzeTiming's (the open flow's reports read it as they read the Spartan-3E's).
 */
export function analyzeTimingS6(design, device, opts = {}) {
  const model = opts.model || S6_SPEED_3;
  const tg = timingGraph(design, model, { arcs: arcsS6(design, model), clockPin: S6_CLOCK_PIN });
  const connDelay = connDelaysS6(design, device, tg, model), clk = clockArrivalsS6(design, device, model);
  const r = tg.analyze(connDelay, clk.net);
  r.conns = tg.conns.map((c, i) => ({ net: c.net, from: `${c.fromPin.inst}.${c.fromPin.pin}`, to: `${c.toPin.inst}.${c.toPin.pin}`, delay: connDelay[i], slack: r.slack[i], crit: r.crit[i] }));
  r.pads = tg.pads(connDelay, clk.late);
  return r;
}
