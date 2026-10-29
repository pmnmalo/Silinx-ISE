// Stage S6-G (#731): the Spartan-6's wire delays fitted to ISE's trce. Each net of a report's paths (twr6.mjs: its
// driver the element before it, its load its site.pin, its delay) is found in the design's routed XDL (the routing
// tree of the net from the driver's pin, timing.js netTree / treePath) and its nodes counted by class (wireClass6:
// the singles, doubles, quads, the logic inputs and outputs, …), its load pin by kind (pinKind: a LUT's A1 to A6 are
// not alike) and by wire type (wireType: EE4B#, LOGICIN_B# …, fitWires). A non-negative least-squares fit of
// delay = base + Σ count × class delay + fanout × per-load delay + the pin kind's + Σ count × wire type's delay gives
// the model; printed with its error.
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

export { CLASSES6, wireClass6, PIN_KINDS, pinKind, nodeWire, wireType, pathCounts, features } from '../../packages/silinx-fpga/src/fpga/s6/timing.js';
import { CLASSES6, PIN_KINDS, pathCounts, features } from '../../packages/silinx-fpga/src/fpga/s6/timing.js';

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
 * A load's delay in reportgen's report of its net (parseDly's { loads }): by inst.pin, else by the instance and the
 * pin's letter, else by the instance, when one load of the net there matches (reportgen names a LUT input by its
 * logical pin, before ISE swapped the LUT's pins: the XDL's and trce's D6 can be its D5, the letter the same);
 * undefined when none or several do (with worst, the largest of several).
 */
export function loadDelay(entry, inst, pin, { worst = false } = {}) {
  const v = entry.loads.get(`${inst}.${pin}`);
  if (v !== undefined) return v;
  const on = [...entry.loads].filter(([k]) => k.slice(0, k.lastIndexOf('.')) === inst), letter = on.filter(([k]) => k[k.lastIndexOf('.') + 1] === pin[0]);
  if (letter.length === 1) return letter[0][1];
  if (on.length === 1) return on[0][1];
  // several (a net on two inputs of one LUT): with worst, the largest of the letter's (an STA's safe side)
  return worst && letter.length ? Math.max(...letter.map(([, x]) => x)) : undefined;
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
      const delay = loadDelay(d, s.pin.inst, s.pin.pin), nodes = delay === undefined ? null : treePath(tree, s.node);
      if (!nodes || nodes.length < 2) continue;
      out.push({ net: n.name, delay, fanout: n.sinks.length, ...pathCounts(device, nodes), nodes });
    }
  }
  return out;
}


/**
 * The wire model fitted on connections: features (the classes, fanout and pin kind) and a count per wire type seen
 * at least min times (the rest one count), non-negative least squares. { vocab, weights, predict(c) } (c: pathCounts's
 * and its fanout); predict is never below 0.
 */
export function fitWires(conns, { min = 20 } = {}) {
  const seen = {};
  for (const c of conns) for (const w of c.wires) seen[w] = (seen[w] || 0) + 1;
  const vocab = Object.keys(seen).filter(w => seen[w] >= min).sort(), at = new Map(vocab.map((w, i) => [w, i]));
  const f = c => { const v = new Array(vocab.length + 1).fill(0); for (const w of c.wires) v[at.get(w) ?? vocab.length]++; return [...features(c), ...v]; };
  const weights = nnls(conns.map(f), conns.map(c => c.delay));
  return { vocab, weights, predict: c => Math.max(0, f(c).reduce((a, v, j) => a + v * weights[j], 0)) };
}

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
  const m = fitWires(all), err = all.map(c => m.predict(c) - c.delay), abs = err.map(Math.abs).sort((a, b) => a - b), rms = Math.sqrt(err.reduce((a, e) => a + e * e, 0) / err.length);
  console.log(`${all.length} connections (${missed} not found), ${m.vocab.length} wire types; rms ${rms.toFixed(3)} ns, 95% within ${abs[Math.floor(abs.length * 0.95)].toFixed(3)} ns, max ${abs.at(-1).toFixed(3)} ns`);
  const n = ['base', ...CLASSES6, 'fanout', ...PIN_KINDS.map(k => `pin ${k}`)].length;
  console.log(['base', ...CLASSES6, 'fanout', ...PIN_KINDS.map(k => `pin ${k}`)].map((x, j) => `${x} ${m.weights[j].toFixed(3)}`).join(', '));
  console.log(`the largest wire types: ${m.vocab.map((w, j) => [w, m.weights[n + j]]).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([w, v]) => `${w} ${v.toFixed(3)}`).join(', ')}`);
}
