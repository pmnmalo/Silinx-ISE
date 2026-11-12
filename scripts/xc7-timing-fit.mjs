#!/usr/bin/env node
// The 7-series' delays fitted to Vivado's (#3516, step 2): from what scripts/xc7-timing-vivado.mjs measured (the numbers
// of packages/silinx-fpga/research/xc7/vivado-timing.json), the cells' and the wire classes' delays nextpnr's chip database
// is built with, and how far nextpnr's estimate is from Vivado's.
//
// Where nextpnr's 7-series timing comes from (pmnmalo/nextpnr-spartan, branch silinx, himbaechel/uarch/xilinx/gen/
// xilinx_gen.py, the chip database's generator, from Project X-Ray's database):
//   - the slice's LUTs and flip-flops: fixed stubs (SLICE_LUTX: A1-A6 -> O6 100/125 ps, -> O5 120/150 ps; SLICE_FFX: CK ->
//     Q 300/350 ps, setup 100 ps): what this fit replaces first (chipdb.SLICE_LUTX, chipdb.SLICE_FFX);
//   - CARRY4 and the F7/F8 multiplexers (SELMUX2_1): Project X-Ray's timings/slicem.sdf; the block RAMs: BRAM_L.sdf;
//   - the routing: each PIP's class (buf|sw_d<delay>_r<res>_c<cap>, from the tile types' JSON: its delay, input
//     capacitance, output resistance) and each node's (node_c<cap>_c<res>, its wires' summed, an intrinsic delay of 0),
//     which himbaechel/arch.h getPipDelay turns into a delay (an RC estimate). The wire classes fitted here (an intrinsic
//     delay per class: single, double, hex, long, imux…) would go into the nodes' timing classes by wire type, or scale
//     the PIP classes' (routeScale): a change of the fork, reviewed on its "nextpnr update" comparison.
//
//   node scripts/xc7-timing-fit.mjs [measured.json] [out.json]
//     (defaults: packages/silinx-fpga/research/xc7/vivado-timing.json, …/xc7/timing-fit.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { wireClass, lutBelPin } from './xc7-timing-parse.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const MEASURED = path.join(ROOT, 'packages', 'silinx-fpga', 'research', 'xc7', 'vivado-timing.json');
export const FITTED = path.join(ROOT, 'packages', 'silinx-fpga', 'research', 'xc7', 'timing-fit.json');
/** The wire classes a connection's delay is fitted on (wireClass's), and its constant part (the site pins'). */
export const CLASSES = ['single', 'double', 'quad', 'hex', 'long', 'output', 'imux', 'bypass', 'fan', 'ctrl', 'bounce', 'clock', 'const', 'site', 'other'];

// ---- the samples: a design's SDF and routes as numbers ----

// a pin's name as an SDF writes it and Vivado's Tcl gives it: <cell>/<pin>
const splitPin = (p) => { const i = String(p).lastIndexOf('/'); return i < 0 ? [String(p), ''] : [p.slice(0, i), p.slice(i + 1)]; };
// a bus pin's bit as nextpnr names it: CO[3] -> CO3
const bit = (p) => String(p).replace(/\[(\d+)\]$/, '$1');
// a flip-flop's synchronous / asynchronous set or reset: nextpnr's SR
const FF = /^FD[RSCP]E(_1)?$/, SR = /^(R|S|CLR|PRE)$/;

/** A statistic of numbers: { n, min, mean, max } (ps, three decimals). */
function stat(xs) {
  if (!xs.length) return null;
  const r = (x) => +x.toFixed(3);
  return { n: xs.length, min: r(Math.min(...xs)), mean: r(xs.reduce((a, b) => a + b, 0) / xs.length), max: r(Math.max(...xs)) };
}

/**
 * The cells' delays of a design (its parsed SDF; lutPins: the LUT inputs' bel pins, parseRoutes'): { [key]: [ps…] },
 * keys as nextpnr's cells name their arcs: LUT.A3.O6 (a LUT's physical input, its output by its bel), FF.C.Q,
 * FF.setup.D / CE / SR, CARRY4.S0.CO3, MUXF7.S.O; another cell's TYPE.from.to.
 */
export function cellSamples(sdf, lutPins = new Map()) {
  const out = {};
  const add = (k, v) => { if (v !== null && v !== undefined) (out[k] ||= []).push(v); };
  for (const c of sdf.cells) {
    if (/^LUT[1-6]$/.test(c.type)) {
      for (const a of c.iopaths) {
        const bp = lutBelPin(lutPins.get(`${c.instance}/${a.from}`));
        add(bp ? `LUT.${bp.pin}.${bp.out}` : `${c.type}.${a.from}.${a.to}`, a.ps);
      }
    } else if (FF.test(c.type)) {
      for (const a of c.iopaths) add(`FF.${a.from}.${a.to}`, a.ps);
      // (each edge's setup: the worst of them)
      const setups = {};
      for (const k of c.checks.filter((x) => x.kind === 'setup' && x.ps !== null)) {
        const pin = SR.test(k.pin) ? 'SR' : k.pin;
        setups[pin] = Math.max(setups[pin] ?? -Infinity, k.ps);
      }
      for (const [pin, v] of Object.entries(setups)) add(`FF.setup.${pin}`, v);
    } else if (c.iopaths.length) {
      for (const a of c.iopaths) add(`${c.type}.${bit(a.from)}.${bit(a.to)}`, a.ps);
    }
  }
  return out;
}

/** The routed connections of a design as [{ counts: { class: n }, ps }]: each sink's interconnect delay (the SDF's)
 *  with its route's nodes counted by wire class (routes: parseRoutes', with connections()). A sink with no route
 *  through the fabric (inside its site) left out. */
export function wireSamples(sdf, conns) {
  const delay = new Map();
  for (const c of sdf.cells) for (const i of c.interconnects) delay.set(`${i.from}\t${i.to}`, i.ps);
  const out = [];
  for (const c of conns) {
    if (!c.nodes.length || !c.from) continue;
    const ps = delay.get(`${c.from}\t${c.to}`);
    if (ps === undefined || ps === null) continue;
    const counts = {};
    for (const n of c.nodes) { const k = wireClass(n); counts[k] = (counts[k] || 0) + 1; }
    out.push({ counts, ps });
  }
  return out;
}

/** Samples of the same route shape grouped (only numbers, a few hundred groups for all the examples): [{ counts,
 *  n, mean, min, max }], sorted by their counts. */
export function groupWires(samples) {
  const g = new Map();
  for (const s of samples) {
    const k = JSON.stringify(Object.fromEntries(Object.entries(s.counts).sort()));
    (g.get(k) || g.set(k, []).get(k)).push(s.ps);
  }
  return [...g].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, xs]) => ({ counts: JSON.parse(k), ...stat(xs) }));
}

/** A design's cell samples (cellSamples') as statistics: { [key]: { n, min, mean, max } }, sorted by key. */
export function cellStats(samples) {
  return Object.fromEntries(Object.keys(samples).sort().map((k) => [k, stat(samples[k])]));
}

// two statistics of the same quantity as one (n weighted)
const mergeStat = (y, x) => (!y ? { ...x } : { n: y.n + x.n, mean: +((y.mean * y.n + x.mean * x.n) / (y.n + x.n)).toFixed(3), min: Math.min(y.min, x.min), max: Math.max(y.max, x.max) });

/** Several designs' cell statistics ({ [key]: { n, min, mean, max } }) as one, sorted by key. */
export function mergeCellStats(...lists) {
  const all = {};
  for (const list of lists) for (const [k, x] of Object.entries(list || {})) all[k] = mergeStat(all[k], x);
  return Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]]));
}

/** Several designs' groups as one (the same route shape's n, mean, min, max combined), sorted by their counts. */
export function mergeGroups(...lists) {
  const g = new Map();
  for (const list of lists) for (const x of list || []) {
    const k = JSON.stringify(Object.fromEntries(Object.entries(x.counts).sort()));
    const { counts, ...s } = x;
    g.set(k, mergeStat(g.get(k), s));
  }
  return [...g].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([k, v]) => ({ counts: JSON.parse(k), ...v }));
}

// ---- the fit ----

// the solution of a small symmetric system (Gaussian elimination, partial pivoting); null when singular
function solve(M, v) {
  const n = v.length, A = M.map((r, i) => [...r, v[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-12) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c] / A[c][c]; for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; }
  }
  return A.map((r, i) => r[n] / r[i]);
}

/**
 * Non-negative weighted least squares: x >= 0 minimizing sum w_i (row_i . x - b_i)^2 (an active set: the most negative
 * coefficient fixed at 0 and the rest solved again, until none is). rows: [[…]], b: […], w: […]. -> x ([] entries a column
 * no row uses: 0).
 */
export function nnls(rows, b, w = rows.map(() => 1)) {
  const m = rows[0]?.length || 0;
  const free = new Set([...Array(m).keys()].filter((j) => rows.some((r) => r[j])));
  let x = Array(m).fill(0);
  for (;;) {
    const idx = [...free];
    if (!idx.length) return x;
    const M = idx.map((a) => idx.map((c) => rows.reduce((s, r, i) => s + w[i] * r[a] * r[c], 0)));
    const v = idx.map((a) => rows.reduce((s, r, i) => s + w[i] * r[a] * b[i], 0));
    // (a small ridge for columns that move together: they share the delay rather than the system failing)
    const y = solve(M, v) || solve(M.map((r, i) => r.map((e, j) => e + (i === j ? 1e-6 * (M[i][i] || 1) : 0))), v);
    if (!y) return x;
    const neg = idx.map((j, k) => [j, y[k]]).filter(([, val]) => val < 0).sort((p, q) => p[1] - q[1]);
    if (!neg.length) { x = Array(m).fill(0); idx.forEach((j, k) => { x[j] = y[k]; }); return x; }
    free.delete(neg[0][0]);
  }
}

/**
 * The wire classes' delays fitted to the groups: a connection's delay = base + sum count(class) * delay(class), each
 * delay >= 0, each group weighted by its samples. -> { base, classes: { class: ps } (a class no route used: null),
 * rmsPs, maxErrPs, samples }.
 */
export function fitWires(groups, classes = CLASSES) {
  const rows = groups.map((g) => [1, ...classes.map((c) => g.counts[c] || 0)]);
  const x = nnls(rows, groups.map((g) => g.mean), groups.map((g) => g.n));
  const used = classes.map((c) => groups.some((g) => g.counts[c]));
  let se = 0, n = 0, maxErr = 0;
  groups.forEach((g, i) => {
    const e = rows[i].reduce((s, a, j) => s + a * x[j], 0) - g.mean;
    se += g.n * e * e; n += g.n; maxErr = Math.max(maxErr, Math.abs(e));
  });
  const r = (v) => Math.round(v * 10) / 10;
  return { base: r(x[0]), classes: Object.fromEntries(classes.map((c, j) => [c, used[j] ? r(x[j + 1]) : null])), rmsPs: n ? r(Math.sqrt(se / n)) : null, maxErrPs: r(maxErr), samples: n };
}

/**
 * The fitted table for the fork's chip database (xilinx_gen.py's names, ps as integers: TimingValue(min, max)): the
 * slice's LUT (each A1-A6 to O6, A1-A5 to O5) and flip-flop (CK -> Q, the setups of D, CE, SR), from the cells'
 * statistics (the worst, slow corner, as nextpnr's slow_max); CARRY4's and the F7 multiplexer's (SELMUX2_1) arcs; the wire
 * classes. A value Vivado did not give: null (the stub kept).
 */
export function chipdbTable(cells, wires) {
  const v = (k) => (cells[k] ? { min: Math.round(cells[k].min), max: Math.round(cells[k].max) } : null);
  const lut = {};
  for (let i = 1; i <= 6; i++) lut[`A${i}`] = { O6: v(`LUT.A${i}.O6`), ...(i <= 5 && { O5: v(`LUT.A${i}.O5`) }) };
  const setup = (p) => v(`FF.setup.${p}`);
  const arcs = (prefix) => Object.fromEntries(Object.keys(cells).filter((k) => k.startsWith(`${prefix}.`)).map((k) => [k.slice(prefix.length + 1).replace('.', '->'), v(k)]));
  return {
    SLICE_LUTX: lut,
    SLICE_FFX: { clkToQ: v('FF.C.Q'), setup: { D: setup('D'), CE: setup('CE'), SR: setup('SR') } },
    CARRY4: arcs('CARRY4'), SELMUX2_1: arcs('MUXF7'), MUXF8: arcs('MUXF8'),
    wires: wires ? { base: wires.base, ...wires.classes } : null,
  };
}

/**
 * Vivado's Fmax against nextpnr's on the same netlists ({ board: { example: { vivado: { fmaxMHz, logicNs, routeNs },
 * nextpnr: { fmaxMHz, logicNs, routeNs } } } }): each ratio (nextpnr / Vivado) and the ratios of their critical paths'
 * logic and routing summed (routeScale, logicScale: what nextpnr's routing and cells would be scaled by to be Vivado's).
 */
export function compareFmax(examples) {
  const rows = [];
  let vl = 0, vr = 0, nl = 0, nr = 0;
  for (const [board, list] of Object.entries(examples || {})) {
    for (const [name, e] of Object.entries(list)) {
      const ratio = e.vivado?.fmaxMHz && e.nextpnr?.fmaxMHz ? +(e.nextpnr.fmaxMHz / e.vivado.fmaxMHz).toFixed(3) : null;
      rows.push({ board, name, vivado: e.vivado?.fmaxMHz ?? null, nextpnr: e.nextpnr?.fmaxMHz ?? null, ratio });
      if (ratio !== null && e.vivado.logicNs != null && e.nextpnr.logicNs != null) { vl += e.vivado.logicNs; vr += e.vivado.routeNs; nl += e.nextpnr.logicNs; nr += e.nextpnr.routeNs; }
    }
  }
  const r = (a, b) => (b > 0 ? +(a / b).toFixed(3) : null);
  return { rows, logicScale: r(vl, nl), routeScale: r(vr, nr) };
}

/** The whole fit of a measurement (vivado-timing.json: per board and example, Vivado's and nextpnr's Fmax, the cells'
 *  statistics and the routes' groups): { cells, wires, chipdb, fmax }, the designs' numbers merged. */
export function fitMeasurement(m) {
  const designs = Object.values(m.examples || {}).flatMap((b) => Object.values(b));
  const cells = mergeCellStats(...designs.map((d) => d.cells));
  const groups = mergeGroups(...designs.map((d) => d.wires));
  const wires = groups.length ? fitWires(groups) : null;
  return { source: path.basename(MEASURED), image: m.image ?? null, cells, wires, chipdb: chipdbTable(cells, wires), fmax: compareFmax(m.examples) };
}

function main() {
  const [inFile = MEASURED, outFile = FITTED] = process.argv.slice(2);
  if (!fs.existsSync(inFile)) { console.error(`${path.relative(ROOT, inFile)}: no measurement yet (node scripts/xc7-timing-vivado.mjs … --collect <run> --update)`); process.exit(2); }
  const fit = fitMeasurement(JSON.parse(fs.readFileSync(inFile, 'utf8')));
  fs.writeFileSync(outFile, `${JSON.stringify(fit, null, 2)}\n`);
  for (const r of fit.fmax.rows) console.log(`${`${r.board} ${r.name}`.padEnd(24)} Vivado ${r.vivado ?? '-'} MHz, nextpnr ${r.nextpnr ?? '-'} MHz${r.ratio ? ` (${r.ratio}x)` : ''}`);
  if (fit.wires) console.log(`wires: base ${fit.wires.base} ps, ${Object.entries(fit.wires.classes).filter(([, x]) => x !== null).map(([c, x]) => `${c} ${x}`).join(', ')} ps; rms ${fit.wires.rmsPs} ps over ${fit.wires.samples} connections`);
  console.log(`logic x${fit.fmax.logicScale ?? '-'}, routing x${fit.fmax.routeScale ?? '-'} (Vivado / nextpnr, critical paths); written ${path.relative(ROOT, outFile)}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
