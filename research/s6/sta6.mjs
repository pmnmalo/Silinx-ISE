// Stage S6-G (#731): the static timing of a routed Spartan-6 design (its XDL), as trce's PERIOD analysis: every path
// from a flip-flop's clock to a flip-flop's setup on one clock, through the slices' LUTs, output multiplexers and carry
// chains (sliceArcs6, from each slice's settings; the arcs' delays the table timing6.mjs takes from trce's reports)
// and the nets (the wire model of timing-fit6.mjs on the routed tree, or a delay given per connection). The clock's
// arrival at each flip-flop (its skew) is given per clock pin. Its worst slack per clock is compared with trce's.
//   node research/s6/sta6.mjs [--measured] <dir> …   (each with top.xdl, top.twr and top.dly: night 1's impl-* and
//   edif-*; --measured: the nets' and the clock's delays reportgen's, the STA's own error without the model's;
//   --train=<text>: fitted on the folders with it, checked on the others; --paths: each worst path)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { netTree, treePath } from '../../packages/silinx-fpga/src/fpga/timing.js';
import { nnls, parseDly } from '../s3e-route/timing-fit.mjs';
import { parseTwr, parseOffsets } from './twr6.mjs';
import { arcTable, arcKey } from './timing6.mjs';
import { dlySamples, fitWires, pathCounts, loadDelay } from './timing-fit6.mjs';
import { s6Device } from '../../test/s6-lib.mjs';

const LETTERS = ['A', 'B', 'C', 'D'];

/** The arcs' delays by trce's type (ns), and a setup through the carry's XOR apart from one through the LUT. */
export const ARC_DEFAULTS = { Tilo: 0.235, TiloMux: 0.261, Topab: 0.45, Topcyb: 0.375, Tbyp: 0.08, Tcinb: 0.27, Tas: 0.32, TasXor: 0.27,
  Tdick: 0.11, Tceck: 0.32, Tsrck: 0.43, Tcko: 0.41, Tcinck: 0.3, Tito: 0.75, Tds: 0.04, Tshcko: 1.2, Tiopi: 0.79, Tioop: 2.3 };

/** The median of a family of trce's arc types (names matching re), undefined when none. */
function familyMedian(types = {}, re) {
  const v = Object.entries(types).filter(([k]) => re.test(k)).map(([, x]) => x).sort((a, b) => a - b);
  return v.length ? v[Math.floor(v.length / 2)] : undefined;
}

/** The inputs a LUT's equation reads (its pins A1 … A6 as the slice's L1 … L6), [] for a LUT not used. */
export function lutInputs(eq, L) {
  return eq && /^#LUT:/.test(eq) ? [...new Set(eq.replace(/^#LUT:O[56]=/, '').match(/A[1-6]/g) || [])].sort().map(a => `${L}${a[1]}`) : [];
}

/**
 * The timing arcs of a placed slice from its settings: { comb: [[in pin, out pin, ns]], setup: [[in pin, ns]] (into
 * a flip-flop before the clock), clkToOut: [[out pin, ns]] }. A LUT's inputs (those its equation reads) to its
 * output (O6) and to its output multiplexer (O5 / O6, F7 / F8, the carry's XOR or CY: the chain's inputs at and below
 * it, each stage's select O6 and data O5 or bypass, and CIN); a flip-flop's data by its input multiplexer, its CE and
 * SR (the second flip-flop L5FF's from O5); one set as a gate (#AND2L, #OR2L) passes its data and SR through to its output (Tito); the carry out.
 */
export function sliceArcs6(inst, T = ARC_DEFAULTS) {
  const comb = [], setup = [], clkToOut = [];
  if (!/^SLICE[LMX]$/.test(inst.type)) return { comb, setup, clkToOut };
  const m = new Map(inst.cfg.filter(c => c.value !== '#OFF').map(c => [c.attr, c.value]));
  const o6 = L => lutInputs(m.get(`${L}6LUT`), L), o5 = L => lutInputs(m.get(`${L}5LUT`), L);
  // the carry: stage j's select (its O6) and data (its O5 or bypass, CY0); an XOR at stage k reads the selects at and
  // below k and the data below it, a CY (stage k's carry out) and COUT the data at k too; each from CIN as well
  const di = L => (m.get(`${L}CY0`) === 'O5' ? o5(L).map(p => [p, 'op']) : m.get(`${L}CY0`) === `${L}X` ? [[`${L}X`, 'x']] : []);
  const chainIn = (k, own) => LETTERS.slice(0, k + 1).flatMap((L, j) => [...o6(L).map(p => [p, 'op', j]), ...(j < k || own ? di(L).map(([p, t]) => [p, t, j]) : [])]);
  const ty = (name, family, d) => T.types?.[name] ?? familyMedian(T.types, family) ?? d;
  const l = j => 'abcd'[j];
  // an arc of the chain from an input (kind 'op' a LUT pin, 'x' a bypass) of stage j to the output of stage k (or COUT)
  const chainDelay = (t, j, k) => (k === 'cout' ? (t === 'op' ? ty(`Topcy${l(j)}`, /^Topcy/, T.Topcyb) : ty(`T${l(j)}xcy`, /^T[a-d]xcy$/, T.Tbyp))
    : t === 'op' ? ty(`Top${l(j)}${l(k)}`, /^Top[a-d][a-d]$/, T.Topab) : ty(`T${l(j)}x${l(k)}`, /^T[a-d]x[a-d]$/, T.Tdick));
  const source = (v, L, k) => (v === 'O6' ? o6(L).map(p => [p, T.TiloMux]) : v === 'O5' ? o5(L).map(p => [p, T.TiloMux])
    : v === 'XOR' || v === 'CY' ? [...chainIn(k, v === 'CY').map(([p, t, j]) => [p, chainDelay(t, j, k)]), ['CIN', ty(`Tcin${l(k)}`, /^Tcin[a-d]$/, T.Tcinb)]]
    : /^F[78]$/.test(v ?? '') ? [...LETTERS.flatMap(o6), ...LETTERS.map(x => `${x}X`)].map(p => [p, T.TiloMux + T.Tilo]) : [[`${L}X`, T.Tdick]]);
  let clocked = false;
  LETTERS.forEach((L, k) => {
    for (const p of o6(L)) comb.push([p, L, T.Tilo]);
    const om = m.get(`${L}OUTMUX`);
    if (/5Q$/.test(om ?? '')) { clkToOut.push([`${L}MUX`, T.Tcko]); clocked = true; }
    else if (om) for (const [p, d] of source(om, L, k)) comb.push([p, `${L}MUX`, d]);
    // a shift register (L6RAMMODE SRL16 / SRL32): its data in (LI) before the clock, its output after it
    if (/^SRL/.test(m.get(`${L}6RAMMODE`) ?? '')) { clocked = true; setup.push([`${L}I`, T.Tds]); clkToOut.push([L, T.Tshcko]); if (om === 'O6') clkToOut.push([`${L}MUX`, T.Tshcko]); }
    // the second flip-flop (L5FF, out on LMUX): its data the LUT's O5, else the bypass
    if (m.has(`${L}5FF`)) { clocked = true; for (const p of o5(L).length ? o5(L) : [`${L}X`]) setup.push([p, /X$/.test(p) ? T.Tdick : T.Tas]); }
    const ff = m.get(`${L}FF`);
    if (!ff) return;
    const fm = m.get(`${L}FFMUX`), data = source(fm, L, k);
    if (/^#(AND2L|OR2L)$/.test(ff)) { for (const [p] of [...data, ...(m.has('SRUSED') ? [['SR']] : [])]) comb.push([p, `${L}Q`, T.Tito]); return; }
    clocked = true;
    clkToOut.push([`${L}Q`, T.Tcko]);
    // into the flip-flop: the setup (Tas, Tdick) after the chain's arc to the stage's output, less its output mux
    for (const [p, d] of data) setup.push([p, fm === 'XOR' || fm === 'CY' ? T.TasXor + Math.max(0, d - T.TiloMux) : fm === 'O6' || fm === 'O5' ? T.Tas : T.Tdick]);
  });
  if (m.has('COUTUSED')) { for (const [p, t, j] of chainIn(3, true)) comb.push([p, 'COUT', chainDelay(t, j, 'cout')]); comb.push(['CIN', 'COUT', T.Tbyp]); }
  if (clocked && m.has('CEUSED')) setup.push(['CE', T.Tceck]);
  if (clocked && m.has('SRUSED')) setup.push(['SR', T.Tsrck]);
  return { comb, setup, clkToOut };
}

/**
 * A block RAM's or DSP48A1's arcs on its pins in use (ins, outs: pin names): a block RAM's data out after its clock,
 * its inputs before it; a DSP48A1 with its multiplier register (MREG) its A, B and D inputs before the clock and its P
 * after, without registers its inputs to P through it. Delays from trce's types by prefix (T.types), else T's.
 */
export function hardArcs6(inst, ins, outs, T = ARC_DEFAULTS) {
  const comb = [], setup = [], clkToOut = [], ty = (re, d) => { const v = Object.entries(T.types ?? {}).filter(([k]) => re.test(k)).map(([, x]) => x); return v.length ? Math.max(...v) : d; };
  if (/^RAMB(8|16)BWER$/.test(inst.type)) {
    for (const o of outs) if (/^DO/.test(o)) clkToOut.push([o, ty(/^Trcko_DO/, 1.85)]);
    for (const i of ins) if (/^(ADDR|DI|WE|EN|RST|REGCE)/.test(i)) setup.push([i, ty(/^Trcck|^Trdck/, 0.3)]);
  } else if (inst.type === 'DSP48A1') {
    const reg = a => inst.cfg.some(c => c.attr === a && c.value === '1');
    if (reg('MREG')) { for (const i of ins) if (/^[ABD]\d/.test(i)) setup.push([i, ty(/^Tdspdck_[ABD]_MREG/, 3.1)]); for (const o of outs) if (/^P\d/.test(o)) clkToOut.push([o, ty(/^Tdspcko_P_MREG/, 1.6)]); }
    else if (!reg('PREG')) for (const i of ins) if (/^[ABDC]\d/.test(i)) for (const o of outs) if (/^P\d/.test(o)) comb.push([i, o, ty(/^Tdspdo_[AB]_P/, 4.0)]);
  }
  return { comb, setup, clkToOut };
}

/** A slice site's timing class: its tile's kind and its column's parity (an odd X a SLICEX; an even one a SLICEL or SLICEM by the tile). */
export const siteClass = inst => `${inst.tile.replace(/_X\d+Y\d+$/, '')} ${+(/^SLICE_X(\d+)/.exec(inst.site)?.[1] ?? 0) % 2 ? 'x' : 'lm'}`;

/**
 * The slice arcs' delays per site class (siteClass) from trce's paths: { class: { Tilo, TiloMux, Tcko, Tas, Tceck,
 * Tsrck, Tdick } } (the median of each; a Tilo on a MUX output is TiloMux; a Tas through the carry left out).
 */
export function classArcs(designs) {
  const by = {};
  for (const { xdl, paths } of designs) {
    const inst = new Map(xdl.insts.map(i => [i.site, i]));
    for (const p of paths) p.elements.forEach((e, k) => {
      const [site, pin] = e.loc.split('.'), i = inst.get(site);
      if (!i || !/^SLICE/.test(i.type) || !/^(Tilo|Tcko|Tas|Tceck|Tsrck|Tdick)$/.test(e.type)) return;
      if (e.type === 'Tas' && arcKey(e, i).endsWith('XOR')) return;
      const name = e.type === 'Tilo' && /MUX$/.test(pin) ? 'TiloMux' : e.type;
      ((by[siteClass(i)] ??= {})[name] ??= []).push(e.delay);
    });
  }
  const median = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  return Object.fromEntries(Object.entries(by).map(([c, t]) => [c, Object.fromEntries(Object.entries(t).map(([n, v]) => [n, median(v)]))]));
}

/** The arc delays from the table of trce's reports (timing6.mjs's arcTable): its medians by type, the defaults else. */
export function arcDelays(table) {
  const t = table.types, xor = Object.entries(table.arcs).filter(([k]) => /^Tas .* XOR$/.test(k)).map(([, v]) => v);
  const lut = Object.entries(table.arcs).filter(([k]) => /^Tas .* LUT$/.test(k)).map(([, v]) => v);
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  return { ...ARC_DEFAULTS, types: t, ...Object.fromEntries(Object.keys(ARC_DEFAULTS).filter(k => t[k] !== undefined).map(k => [k, t[k]])),
    ...(t.Tito_logic !== undefined ? { Tito: t.Tito_logic } : {}), ...(lut.length ? { Tas: mean(lut) } : {}), ...(xor.length ? { TasXor: mean(xor) } : {}) };
}

/**
 * The timing graph of a routed design on one clock net: the pins (name: 'inst.pin') and their edges (the slices'
 * and hard blocks' arcs, each net's connections by netDelay(net, driver pin, load pin), null: none), the clocked
 * elements' starts and ends on that clock ([pin, ns, inst]: a clock-to-out, a setup), the input pads' I pins and
 * the output pads' O pins ([pin, inst]).
 */
export function timingGraph6(xdl, clock, { netDelay, T = ARC_DEFAULTS }) {
  const id = new Map(), name = [], eOut = [], eIn = [];
  const pid = (i, p) => { const k = `${i}.${p}`; let v = id.get(k); if (v === undefined) { v = name.length; id.set(k, v); name.push(k); eOut.push([]); eIn.push(0); } return v; };
  const edge = (a, b, d) => { eOut[a].push([b, d]); eIn[b]++; };
  const clockOf = new Map(), ins = new Map(), outs = new Map(), add = (m, i, p) => (m.get(i) ?? m.set(i, []).get(i)).push(p);
  for (const n of xdl.nets) {
    for (const p of n.inpins) { if (/^CLK/.test(p.pin)) clockOf.set(p.inst, n.name); else add(ins, p.inst, p.pin); }
    for (const p of n.outpins) add(outs, p.inst, p.pin);
  }
  const starts = [], ends = [], padIns = [], padOuts = [];
  for (const inst of xdl.insts) {
    if (inst.type === 'IOB') {
      if ((outs.get(inst.name) ?? []).includes('I')) padIns.push([pid(inst.name, 'I'), inst.name]);
      if ((ins.get(inst.name) ?? []).includes('O')) padOuts.push([pid(inst.name, 'O'), inst.name]);
      continue;
    }
    // a slice's arcs by its site's class when the delays have them (T.classes, classArcs)
    const a = /^SLICE/.test(inst.type) ? sliceArcs6(inst, T.classes?.[siteClass(inst)] ? { ...T, ...T.classes[siteClass(inst)] } : T) : hardArcs6(inst, ins.get(inst.name) ?? [], outs.get(inst.name) ?? [], T);
    for (const [i, o, d] of a.comb) edge(pid(inst.name, i), pid(inst.name, o), d);
    if (clockOf.get(inst.name) !== clock) continue;
    for (const [o, d] of a.clkToOut) starts.push([pid(inst.name, o), d, inst.name]);
    for (const [i, d] of a.setup) ends.push([pid(inst.name, i), d, inst.name]);
  }
  for (const n of xdl.nets) {
    const src = n.outpins[0];
    if (!src || n.name === clock) continue;
    for (const p of n.inpins) { const d = netDelay(n, src, p); if (d !== null) edge(pid(src.inst, src.pin), pid(p.inst, p.pin), d); }
  }
  return { name, eOut, eIn, starts, ends, padIns, padOuts };
}

/** The longest arrival at each pin of a graph from its sources ([pin, ns]), in an order of its inputs first (a loop's pins left out): { arr, from }. */
export function longest(g, sources) {
  const N = g.name.length, arr = new Float64Array(N).fill(-Infinity), from = new Int32Array(N).fill(-1), deg = Int32Array.from(g.eIn), q = [];
  for (const [v, t] of sources) if (t > arr[v]) arr[v] = t;
  for (let v = 0; v < N; v++) if (!deg[v]) q.push(v);
  while (q.length) {
    const v = q.pop();
    for (const [w, d] of g.eOut[v]) { if (arr[v] + d > arr[w]) { arr[w] = arr[v] + d; from[w] = v; } if (!--deg[w]) q.push(w); }
  }
  return { arr, from };
}

const pathTo = (g, from, v) => { const p = []; for (; v >= 0; v = from[v]) p.unshift(g.name[v]); return p; };

/**
 * The PERIOD analysis of a routed design on one clock net: { slack, arrival, path: [pin …] } for the worst
 * endpoint (null: none). netDelay(net, driver pin, load pin) gives a connection's delay (null: not on a path);
 * clockAt(inst) the clock's arrival at its clock pin; period and uncertainty trce's.
 */
export function periodSlack(xdl, clock, { period, uncertainty = 0, netDelay, clockAt, T = ARC_DEFAULTS }) {
  const g = timingGraph6(xdl, clock, { netDelay, T }), { arr, from } = longest(g, g.starts.map(([v, d, i]) => [v, (clockAt(i) ?? 0) + d]));
  let worst = null;
  for (const [v, d, i] of g.ends) {
    if (arr[v] === -Infinity) continue;
    const slack = period + (clockAt(i) ?? 0) - (arr[v] + d) - uncertainty;
    if (!worst || slack < worst.slack) worst = { slack, arrival: arr[v] + d, end: v };
  }
  return worst && { slack: worst.slack, arrival: worst.arrival, path: pathTo(g, from, worst.end) };
}

/**
 * trce's OFFSET IN BEFORE on a clock: the largest data path from an input pad (its Tiopi, then the nets and arcs to
 * a flip-flop's setup) less the clock's earliest arrival there (clockMin(inst): from its pad through its BUFG), plus
 * the uncertainty: { offset, path } (null: no such path).
 */
export function offsetIn(xdl, clock, { netDelay, clockMin, tiopi, uncertainty = 0, T = ARC_DEFAULTS }) {
  const g = timingGraph6(xdl, clock, { netDelay, T }), { arr, from } = longest(g, g.padIns.map(([v]) => [v, tiopi]));
  let worst = null;
  for (const [v, d, i] of g.ends) {
    if (arr[v] === -Infinity) continue;
    const offset = arr[v] + d - clockMin(i) + uncertainty;
    if (!worst || offset > worst.offset) worst = { offset, end: v };
  }
  return worst && { offset: worst.offset, path: pathTo(g, from, worst.end) };
}

/**
 * trce's OFFSET OUT AFTER on a clock: the clock's latest arrival at a flip-flop (clockMax(inst)), its clock-to-out,
 * the nets and arcs to an output pad's O pin and its Tioop, plus the uncertainty: { offset, path } (null: none).
 */
export function offsetOut(xdl, clock, { netDelay, clockMax, tioop, uncertainty = 0, T = ARC_DEFAULTS }) {
  const g = timingGraph6(xdl, clock, { netDelay, T }), { arr, from } = longest(g, g.starts.map(([v, d, i]) => [v, clockMax(i) + d]));
  let worst = null;
  for (const [v] of g.padOuts) {
    if (arr[v] === -Infinity) continue;
    const offset = arr[v] + tioop + uncertainty;
    if (!worst || offset > worst.offset) worst = { offset, end: v };
  }
  return worst && { offset: worst.offset, path: pathTo(g, from, worst.end) };
}

/** A clock net's arrival at each load (inst → ns) from the routed tree: base + per node, fitted on a clock's .dly delays. */
export function clockArrivals(xdl, device, clock, weights) {
  const net = xdl.nets.find(n => n.name === clock), out = new Map();
  if (!net) return out;
  const src = net.outpins.map(p => { const i = xdl.insts.find(x => x.name === p.inst); return i ? device.sitePinNode(i.site, p.pin) : -1; }).filter(n => n >= 0);
  const tree = netTree(net.pips || [], src, device);
  for (const p of net.inpins) {
    const i = xdl.insts.find(x => x.name === p.inst), b = i ? device.sitePinNode(i.site, p.pin) : -1, nodes = tree && b >= 0 ? treePath(tree, b) : null;
    if (nodes) out.set(p.inst, weights[0] + weights[1] * (nodes.length - 1));
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), dirs = args.filter(a => !a.startsWith('--')), measured = args.includes('--measured');  // --paths: each worst path's pins
  // --train=<text>: the arcs and wires fitted on the designs whose folder has it only, the others' slacks held out
  const train = args.find(a => a.startsWith('--train='))?.slice(8);
  if (!dirs.length) { console.error('usage: node research/s6/sta6.mjs [--measured] <dir> …'); process.exit(1); }
  const devices = {}, designs = dirs.map(d => {
    const xt = fs.readFileSync(path.join(d, 'top.xdl'), 'utf8'), part = xt.match(/^design "[^"]*" (\S+)/m)[1];
    const device = (devices[part] ??= s6Device(part.replace(/^(xc6slx\d+)-?(csg\d+)(-\d)?$/, '$1$2-3')).device);
    const twr = fs.readFileSync(path.join(d, 'top.twr'), 'utf8');
    return { name: d, xdl: parseXdl(xt), paths: parseTwr(twr), offsets: parseOffsets(twr), device, dly: fs.readFileSync(path.join(d, 'top.dly'), 'utf8') };
  });
  const fitOn = designs.filter(x => !train || x.name.includes(train));
  const T = { ...arcDelays(arcTable(fitOn)), classes: classArcs(fitOn) }, model = fitWires(fitOn.flatMap(x => dlySamples(x.xdl, x.dly, x.device)));
  // the clock nets' delays to their loads: base + per node on the routed tree, fitted on the .dly's
  const clk = [];
  for (const x of fitOn) {
    const clock = x.paths.find(p => /PERIOD/.test(p.constraint))?.destClock, dly = parseDly(x.dly), net = x.xdl.nets.find(n => n.name === clock), d = net && dly.get(net.name);
    if (!d) continue;
    const ones = clockArrivals(x.xdl, x.device, net.name, [0, 1]);
    for (const [inst, n] of ones) for (const [k, v] of d.loads) if (k.startsWith(`${inst}.`)) clk.push([n, v]);
  }
  const cw = nnls(clk.map(([n]) => [1, n]), clk.map(([, v]) => v));
  // the OFFSETs' pads (Tiopi into the data path, Tioop out of it) and the clock from its pad through its BUFG to a
  // flip-flop, earliest (OFFSET IN) and latest (OUT): a + b × the clock net's arrival there, fitted on trce's paths
  const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
  const offPaths = kind => fitOn.flatMap(x => x.offsets.filter(o => o.kind === kind).flatMap(o => o.paths.map(p => ({ x, p }))));
  const tiopi = med(offPaths('in').flatMap(({ p }) => p.data.filter(e => e.type === 'Tiopi').map(e => e.delay))) ?? T.Tiopi;
  const tioop = med(offPaths('out').flatMap(({ p }) => p.data.filter(e => e.type === 'Tioop').map(e => e.delay))) ?? T.Tioop;
  const clockFit = kind => {
    const pts = offPaths(kind).map(({ x, p }) => {
      const site = p.clk.at(-1)?.loc.split('.')[0], i = x.xdl.insts.find(z => z.site === site), c = i && clockArrivals(x.xdl, x.device, x.offsets[0].clock, cw).get(i.name);
      return c === undefined || p.clockPath === undefined ? null : [c, p.clockPath];
    }).filter(Boolean);
    return pts.length ? nnls(pts.map(([c]) => [1, c]), pts.map(([, v]) => v)) : [0, 1];
  };
  const [cin, cout] = [clockFit('in'), clockFit('out')];
  const close = (a, b) => Math.abs(a - b) <= Math.max(0.05 * Math.abs(b), 0.1);
  const rows = [], offRows = [];
  for (const x of designs.filter(d => !train || !fitOn.includes(d))) {
    const pc = x.paths.find(p => /PERIOD/.test(p.constraint) && p.requirement !== undefined);
    if (!pc) continue;
    const nets = new Map(x.xdl.nets.map(n => [n.name, n])), inst = new Map(x.xdl.insts.map(i => [i.name, i])), trees = new Map();
    const netDelay = (n, src, p) => {
      if (!/^(SLICE|RAMB|DSP|IOB)/.test(inst.get(src.inst)?.type ?? '') || !/^(SLICE|RAMB|DSP|IOB)/.test(inst.get(p.inst)?.type ?? '')) return null;
      let t = trees.get(n.name);
      if (t === undefined) { const a = x.device.sitePinNode(inst.get(src.inst).site, src.pin); t = a >= 0 ? netTree(n.pips || [], [a], x.device) : null; trees.set(n.name, t); }
      const b = x.device.sitePinNode(inst.get(p.inst).site, p.pin), nodes = t && b >= 0 ? treePath(t, b) : null;
      return !nodes || nodes.length < 2 ? null : model.predict({ ...pathCounts(x.device, nodes), fanout: n.inpins.length });
    };
    // --measured: each connection's and the clock's delays reportgen's (the STA's own error, without the model's)
    const dly = measured ? parseDly(x.dly) : null, ld = (n, p) => { const e = dly?.get(n.name); return e ? loadDelay(e, p.inst, p.pin, { worst: true }) ?? null : null; };
    const cd = dly && dly.get(pc.destClock), cm = new Map(cd ? [...cd.loads].map(([k, v]) => [k.slice(0, k.lastIndexOf('.')), v]) : []);
    const ca = measured ? cm : clockArrivals(x.xdl, x.device, pc.destClock, cw);
    const r = periodSlack(x.xdl, pc.destClock, { period: pc.requirement, uncertainty: pc.uncertainty ?? 0, netDelay: measured ? (n, src, p) => ld(n, p) : netDelay, clockAt: i => ca.get(i), T });
    if (!r) continue;
    rows.push({ name: `${path.basename(path.dirname(x.name))}/${path.basename(x.name)}`, trce: pc.slack, sta: r.slack, period: pc.requirement });
    if (args.includes('--paths')) console.log(`  ${rows.at(-1).name}: ${r.path.map(p => p.replace(/^.*\//, '')).join(' > ')}`);
    // the OFFSET IN and OUT on the same clock, against trce's minimum / maximum allowable offset
    const nd = measured ? (n, src, p) => ld(n, p) : netDelay;
    for (const o of x.offsets.filter(z => z.clock === pc.destClock && z.offset !== null)) {
      const c = o.kind === 'in' ? cin : cout, at = i => c[0] + c[1] * (ca.get(i) ?? 0), u = o.paths[0]?.uncertainty ?? 0;
      const q = o.kind === 'in' ? offsetIn(x.xdl, pc.destClock, { netDelay: nd, clockMin: at, tiopi, uncertainty: u, T }) : offsetOut(x.xdl, pc.destClock, { netDelay: nd, clockMax: at, tioop, uncertainty: u, T });
      if (q) offRows.push({ name: rows.at(-1).name, kind: o.kind, trce: o.offset, sta: q.offset });
    }
  }
  const within = rows.filter(r => Math.abs(r.sta - r.trce) <= 0.05 * Math.abs(r.trce)).length, within1 = rows.filter(r => close(r.sta, r.trce)).length;
  console.log(`clock: ${cw[0].toFixed(3)} + ${cw[1].toFixed(3)} a node (${clk.length} loads); ${rows.length} PERIOD constraints: worst slack within 5% of trce's in ${within}, the error at most ${(Math.max(...rows.map(r => Math.abs(r.sta - r.trce) / r.period)) * 100).toFixed(1)}% of the period`);
  console.log(`  within 5% or 0.1 ns, whichever is larger: ${within1} of ${rows.length}`);
  for (const r of rows) console.log(`  ${r.name}: trce ${r.trce.toFixed(3)}, sta ${r.sta.toFixed(3)} (${(100 * (r.sta - r.trce) / Math.abs(r.trce)).toFixed(1)}%)`);
  for (const k of ['in', 'out']) {
    const rs = offRows.filter(r => r.kind === k);
    console.log(`OFFSET ${k.toUpperCase()} (Tiopi ${tiopi}, Tioop ${tioop}; clock ${(k === 'in' ? cin : cout).map(v => v.toFixed(3)).join(' + ')} × arrival): ${rs.length} designs, within 5% or 0.1 ns of trce's in ${rs.filter(r => close(r.sta, r.trce)).length}, the error at most ${Math.max(...rs.map(r => Math.abs(r.sta - r.trce))).toFixed(3)} ns`);
    for (const r of rs) console.log(`  ${r.name}: trce ${r.trce.toFixed(3)}, sta ${r.sta.toFixed(3)} (${(r.sta - r.trce).toFixed(3)} ns)`);
  }
}
