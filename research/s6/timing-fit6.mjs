// Stage S6-G (#731): the Spartan-6's wire delays fitted to ISE's trce. Each net of a report's paths (twr6.mjs: its
// driver the element before it, its load its site.pin, its delay) is found in the design's routed XDL (the routing
// tree of the net from the driver's pin, timing.js netTree / treePath) and its nodes counted by class (wireClass6:
// the singles, doubles, quads, the logic inputs and outputs, …), its load pin by kind (pinKind: a LUT's A1 to A6 are
// not alike). A non-negative least-squares fit of delay = base + Σ count × class delay + fanout × per-load delay +
// the pin kind's delay gives the model; printed with its error.
//   node research/s6/timing-fit6.mjs <dir> …   (each with top.xdl and top.twr, ISE's routing: night 1's impl-* and edif-*;
//   with top.dly, reportgen -delay's report, every connection instead)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { netTree, treePath } from '../../packages/silinx-fpga/src/fpga/timing.js';
import { nnls, parseDly } from '../s3e-route/timing-fit.mjs';
import { netEndpointsS6 } from '../../packages/silinx-fpga/src/fpga/s6/route-nets.js';
import { parseTwr } from './twr6.mjs';
import { s6Device } from '../../test/s6-lib.mjs';

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

/** A path's nodes (the driver's first) counted by class, and its load pin's kind: { counts, pin }. */
function pathCounts(device, nodes) {
  const counts = new Array(CLASSES6.length).fill(0);
  for (const n of nodes.slice(1)) counts[wireClass6(nodeWire(device, n)[1])]++;
  return { counts, pin: pinKind(nodeWire(device, nodes.at(-1))[1]) };
}

/** One net of a path in the routed XDL: { net, delay, fanout, counts: [per class], pin, nodes } or null (not found). */
export function connection(nets, device, from, e) {
  const [ds, dp] = from.split('.'), [ls, lp] = e.loc.split('.'), net = nets.get(e.name);
  if (!net) return null;
  const a = device.sitePinNode(ds, dp), b = device.sitePinNode(ls, lp), tree = net && a >= 0 ? netTree(net.pips || [], [a], device) : null, nodes = tree && b >= 0 ? treePath(tree, b) : null;
  if (!nodes) return null;
  return { net: e.name, delay: e.delay, fanout: e.fanout, ...pathCounts(device, nodes), nodes };
}

/** The connections of a design's report (each once): [{ net, delay, fanout, counts, nodes }], and those not found. */
export function connections(xdl, twr, device, paths = parseTwr(twr)) {
  const nets = new Map(xdl.nets.map(n => [n.name, n])), out = [], missed = [], seen = new Set();
  for (const p of paths) p.elements.forEach((e, i) => {
    if (e.type !== 'net' || i === 0) return;
    const key = `${p.elements[i - 1].loc} ${e.loc}`;
    if (seen.has(key)) return;
    seen.add(key);
    const c = connection(nets, device, p.elements[i - 1].loc, e);
    if (c) out.push(c); else missed.push(`${e.name} ${key}`);
  });
  return { conns: out, missed };
}

/**
 * Every connection of a design from reportgen -delay's report (#731: every net's delay to each load, not only trce's
 * worst paths): [{ net, delay, fanout, counts, nodes }]; the global clocks' nets left out.
 */
export function dlySamples(xdl, dlyText, device) {
  const dly = parseDly(dlyText), out = [];
  for (const n of netEndpointsS6(xdl, device).nets) {
    const d = dly.get(n.name);
    if (!d || n.clock || n.power || !n.sources.length) continue;
    const tree = netTree(n.net.pips || [], n.sources, device);
    if (!tree) continue;
    for (const s of n.sinks) {
      const delay = d.loads.get(`${s.pin.inst}.${s.pin.pin}`), nodes = delay === undefined ? null : treePath(tree, s.node);
      if (!nodes || nodes.length < 2) continue;
      out.push({ net: n.name, delay, fanout: n.sinks.length, ...pathCounts(device, nodes), nodes });
    }
  }
  return out;
}

/** A connection's features: base, each class's count, the fanout beyond one, its load pin's kind (one of PIN_KINDS). */
export const features = c => [1, ...c.counts, Math.max(0, c.fanout - 1), ...PIN_KINDS.map((_, k) => +(c.pin === k))];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node research/s6/timing-fit6.mjs <dir> …'); process.exit(1); }
  const all = [], devices = {};
  let missed = 0;
  for (const d of dirs) {
    const xt = fs.readFileSync(path.join(d, 'top.xdl'), 'utf8'), part = xt.match(/^design "[^"]*" (\S+)/m)[1];
    const device = (devices[part] ??= s6Device(part.replace(/^(xc6slx\d+)-?(csg\d+)(-\d)?$/, '$1$2-3')).device);
    // every connection when reportgen's report is there, else trce's paths'
    if (fs.existsSync(path.join(d, 'top.dly'))) { all.push(...dlySamples(parseXdl(xt), fs.readFileSync(path.join(d, 'top.dly'), 'utf8'), device)); continue; }
    const r = connections(parseXdl(xt), fs.readFileSync(path.join(d, 'top.twr'), 'utf8'), device);
    all.push(...r.conns); missed += r.missed.length;
  }
  const X = all.map(features), y = all.map(c => c.delay), w = nnls(X, y), pred = X.map(r => r.reduce((a, v, j) => a + v * w[j], 0));
  const err = pred.map((p, i) => p - y[i]), abs = err.map(Math.abs).sort((a, b) => a - b), rms = Math.sqrt(err.reduce((a, e) => a + e * e, 0) / err.length);
  console.log(`${all.length} connections (${missed} not found); rms ${rms.toFixed(3)} ns, 95% within ${abs[Math.floor(abs.length * 0.95)].toFixed(3)} ns, max ${abs.at(-1).toFixed(3)} ns`);
  console.log(['base', ...CLASSES6, 'fanout', ...PIN_KINDS.map(k => `pin ${k}`)].map((n, j) => `${n} ${w[j].toFixed(3)}`).join(', '));
}
