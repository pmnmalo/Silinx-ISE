// Fits the wire delay model of core/fpga/timing.js to ISE's own delays of designs routed by Silinx.
//   node research/s3e-route/timing-fit.mjs <folder>...   (each with routed.xdl and routed.dly:
//   reportgen -delay of ISE on the same design, as scripts/check-open-flow.mjs keeps them with SILINX_KEEP=1)
//   node research/s3e-route/timing-fit.mjs --arcs <folder>...   (each with routed.xdl and full.twr, a verbose trce
//   report on it, trce -a -v 1000: the logic delays of the SLICEM's shift registers and RAMs, #443, and of the block
//   RAMs and multipliers, #457)
// For every connection (driver pin -> load pin) reportgen gives ISE's delay; Silinx finds the path of
// that connection in the routed XDL (core/fpga/timing.js netTree / treePath) and counts the nodes of
// each class on it and the branches the net takes off them. A least-squares fit (non-negative) of
// delay = base + sum(count x wire delay) + sum(branches x branch delay) gives the model; printed with
// the error of the model over the connections (and, --check, the error of the current SPEED_4).
import fs from 'node:fs';
import path from 'node:path';
import { parseXdl } from '../../core/xdl.js';
import { loadDeviceCache } from '../../core/fpga/device-node.js';
import { netEndpoints } from '../../core/fpga/route.js';
import { WIRE_NAMES, nodeClasses, netTree, treePath, pathDelay, SPEED_4 } from '../../core/fpga/timing.js';
import { fileURLToPath } from 'node:url';

/** reportgen -delay's report: Map net name -> { driver: 'inst.PIN', loads: Map 'inst.PIN' -> ns }. */
export function parseDly(text) {
  const nets = new Map();
  const blocks = text.split('Net Delays').pop().split(/\n\n/);
  for (const b of blocks) {
    // names wrap at 80 columns; a number alone on its line is a delay
    const toks = [];
    let cur = null;
    for (const raw of b.split('\n')) {
      const l = raw.replace(/\s+$/, '');
      if (!l.trim() || /^-+$/.test(l.trim())) { continue; }
      // a delay, with the load's name after it on the same line when it fits
      const m = /^\s+(-?\d+\.\d+)(?:\s+(\S.*))?$/.exec(l);
      if (m) {
        if (cur !== null) toks.push(cur);
        cur = null; toks.push(+m[1]);
        if (!m[2]) continue;
        cur = m[2];
      } else if (cur === null) cur = l.trim(); else cur += l.trim();
      if (raw.length < 80) { toks.push(cur); cur = null; }
    }
    if (cur !== null) toks.push(cur);
    if (toks.length < 2 || typeof toks[0] !== 'string' || typeof toks[1] !== 'string') continue;
    const loads = new Map();
    for (let i = 2; i + 1 < toks.length; i += 2) if (typeof toks[i] === 'number' && typeof toks[i + 1] === 'string') loads.set(toks[i + 1], toks[i]);
    nets.set(toks[0], { driver: toks[1], loads });
  }
  return nets;
}

/** The samples of one routed design: [{ net, load, ise, path, counts, branches }]. */
export function samples(dir, device) {
  const design = parseXdl(fs.readFileSync(path.join(dir, 'routed.xdl'), 'utf8'));
  const dly = parseDly(fs.readFileSync(path.join(dir, 'routed.dly'), 'utf8'));
  const cls = nodeClasses(device);
  const { nets } = netEndpoints(design, device);
  const out = [];
  for (const n of nets) {
    if (n.clock || !n.sources.length || n.net.inpins.some(p => /^BUFG/.test(design.insts.find(i => i.name === p.inst)?.type || ''))) continue;
    const d = dly.get(n.name);
    if (!d) continue;
    const tree = netTree(n.net.pips, n.sources, device);
    if (!tree) continue;
    for (const s of n.sinks) {
      const ise = d.loads.get(`${s.pin.inst}.${s.pin.pin}`);
      if (ise === undefined) continue;
      const p = treePath(tree, s.node);
      if (!p || p.length < 2) continue;
      const counts = new Array(WIRE_NAMES.length).fill(0), branches = new Array(WIRE_NAMES.length).fill(0);
      for (let j = 1; j < p.length; j++) { counts[cls[p[j]]]++; branches[cls[p[j]]] += Math.max(0, (tree.children.get(p[j]) || 0) - 1); }
      out.push({ dir, net: n.name, load: `${s.pin.inst}.${s.pin.pin}`, ise, path: p, tree, counts, branches, fanout: n.sinks.length, src: Math.max(0, (tree.children.get(p[0]) || 0) - 1) });
    }
  }
  return out;
}

/**
 * The logic delays of trce's paths (a verbose report, trce -a -v N): [{ type, site, pin, from, delay }], one per
 * row of a path's table that is not a net: `type` the delay type (Treg, Tds, Tilo…), `site` and `pin` its location
 * (SLICE_X48Y4 and X, or CLK for a setup), `from` the site pin of the net before it on the path (the data pin of a
 * setup: BX, BY, F1…), null at a path's start.
 */
export function twrArcs(text) {
  const out = [];
  for (const block of String(text).split(/Location\s+Delay type\s+Delay\(ns\)/).slice(1)) {
    let from = null;
    for (const line of block.split('\n')) {
      if (/^\s+Total\s/.test(line)) break;
      const m = /^\s+(\S+?)\.(\S+)\s+(net \(fanout=\d+\)|T\w+)\s+(-?\d+\.\d+)/.exec(line);
      if (!m) continue;
      if (m[3].startsWith('net')) { from = m[2]; continue; }
      out.push({ type: m[3], site: m[1], pin: m[2], from, delay: +m[4] });
      from = null;
    }
  }
  return out;
}

/** The SLICEM memory arcs of a routed design and trce's report on it: twrArcs at the slices whose F or G is a
 *  shift register or a RAM, each with `mem` ('srl' or 'ram') and `clkInv` (CLKINV = CLK_B). */
export function memArcs(xdlText, twrText) {
  const bySite = new Map(parseXdl(xdlText).insts.map(i => [i.site, i]));
  const out = [];
  for (const a of twrArcs(twrText)) {
    const inst = bySite.get(a.site);
    if (!inst) continue;
    const cfg = new Map(inst.cfg.map(c => [c.attr, c.value]));
    const modes = ['F', 'G'].filter(l => /^#RAM/.test(cfg.get(l) || '')).map(l => cfg.get(`${l}_ATTR`));
    if (!modes.length) continue;
    out.push({ ...a, mem: modes.includes('SHIFT_REG') ? 'srl' : 'ram', clkInv: cfg.get('CLKINV') === 'CLK_B' });
  }
  return out;
}

/** The block RAMs' and multipliers' arcs of a routed design and trce's report on it (#457): twrArcs at the RAMB16 and
 *  MULT18X18SIO sites, each with `block` ('bram' or 'mult') and, for a multiplier, `regs` (its AREG / BREG / PREG:
 *  'A1B0P1'). */
export function hardArcs(xdlText, twrText) {
  const bySite = new Map(parseXdl(xdlText).insts.map(i => [i.site, i]));
  const out = [];
  for (const a of twrArcs(twrText)) {
    const inst = bySite.get(a.site);
    if (!inst || !/^(RAMB16|MULT18X18SIO)$/.test(inst.type)) continue;
    const cfg = new Map(inst.cfg.map(c => [c.attr, c.value]));
    out.push(inst.type === 'RAMB16' ? { ...a, block: 'bram' } : { ...a, block: 'mult', regs: ['AREG', 'BREG', 'PREG'].map(r => `${r[0]}${cfg.get(r) || '0'}`).join('') });
  }
  return out;
}

// least squares with non-negative coefficients (active-set, small problems)
function nnls(X, y, iters = 200) {
  const m = X[0].length;
  const solve = (cols) => {
    const k = cols.length, A = Array.from({ length: k }, () => new Float64Array(k + 1));
    for (let r = 0; r < X.length; r++) for (let i = 0; i < k; i++) {
      const xi = X[r][cols[i]];
      if (!xi) continue;
      for (let j = 0; j < k; j++) A[i][j] += xi * X[r][cols[j]];
      A[i][k] += xi * y[r];
    }
    for (let i = 0; i < k; i++) A[i][i] += 1e-9;
    for (let i = 0; i < k; i++) {
      let p = i; for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[p][i])) p = r;
      [A[i], A[p]] = [A[p], A[i]];
      for (let r = 0; r < k; r++) if (r !== i) { const f = A[r][i] / A[i][i]; for (let c = i; c <= k; c++) A[r][c] -= f * A[i][c]; }
    }
    return cols.map((_, i) => A[i][k] / A[i][i]);
  };
  let active = [...Array(m).keys()].filter(j => X.some(r => r[j]));
  let w = new Array(m).fill(0);
  for (let it = 0; it < iters; it++) {
    const sol = solve(active);
    const neg = sol.findIndex((v, i) => v < 0 && active[i] !== 0);
    if (neg < 0) { w = new Array(m).fill(0); active.forEach((c, i) => { w[c] = sol[i]; }); break; }
    active = active.filter((_, i) => i !== neg);
  }
  return w;
}

const stats = (errs) => {
  const a = errs.map(Math.abs).sort((p, q) => p - q);
  const rms = Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length);
  return `n=${errs.length} mean ${(errs.reduce((s, e) => s + e, 0) / errs.length).toFixed(3)} rms ${rms.toFixed(3)} median|e| ${a[a.length >> 1].toFixed(3)} p95|e| ${a[Math.floor(a.length * 0.95)].toFixed(3)} max|e| ${a.at(-1).toFixed(3)} ns`;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--arcs')) {
  // the logic delays of the SLICEM memories, block RAMs and multipliers as trce gives them (each folder: routed.xdl
  // and a verbose trce report, full.twr): their values by delay type, memory or block, clock edge and pins (a block's
  // bus pins without their bit: ADDRA, DOB; a multiplier's product bits apart, Tmult and Tmsckp grow with them)
  const groups = new Map();
  const add = (k, v) => { if (!groups.has(k)) groups.set(k, []); groups.get(k).push(v); };
  for (const d of process.argv.slice(2).filter(a => !a.startsWith('--'))) {
    const xdl = fs.readFileSync(path.join(d, 'routed.xdl'), 'utf8'), twr = fs.readFileSync(path.join(d, 'full.twr'), 'utf8');
    for (const a of memArcs(xdl, twr)) add(`${a.type} ${a.mem}${a.clkInv ? ' CLK_B' : ''} ${a.from ? `${a.from} -> ` : ''}${a.pin}`, a.delay);
    for (const a of hardArcs(xdl, twr)) {
      const bus = p => (a.block === 'mult' && /^P\d/.test(p) ? p : p.replace(/\d+$/, ''));
      add(`${a.type} ${a.block}${a.regs ? ` ${a.regs}` : ''} ${a.from ? `${bus(a.from)} -> ` : ''}${bus(a.pin)}`, a.delay);
    }
  }
  for (const [k, v] of [...groups].sort()) {
    const u = [...new Set(v)].sort((p, q) => p - q);
    console.log(`${k.padEnd(34)} n ${String(v.length).padStart(4)}  ${u.length === 1 ? u[0].toFixed(3) : `${u[0].toFixed(3)} .. ${u.at(-1).toFixed(3)} (${u.length} values)`}`);
  }
} else if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const device = loadDeviceCache('xc3s250ecp132-4');
  const all = dirs.flatMap(d => samples(d, device));
  const C = WIRE_NAMES.length;
  // features: 1, counts[c], branches[c]
  const X = all.map(s => [1, ...s.counts, ...s.branches, s.src]), y = all.map(s => s.ise);
  const w = nnls(X, y);
  console.log(`connections: ${all.length} from ${dirs.length} designs`);
  console.log(`base ${w[0].toFixed(3)}`);
  console.log(`source branch ${w[1 + 2 * C].toFixed(4)}`);
  for (let c = 0; c < C; c++) console.log(`${WIRE_NAMES[c].padEnd(7)} wire ${w[1 + c].toFixed(3)} branch ${w[1 + C + c].toFixed(4)}  (on ${all.filter(s => s.counts[c]).length} paths)`);
  const errs = all.map((s, i) => X[i].reduce((a, x, j) => a + x * w[j], 0) - y[i]);
  console.log(`fit: ${stats(errs)}`);
  for (const d of dirs) { const e = errs.filter((_, i) => all[i].dir === d); console.log(`  ${path.basename(d)}: ${stats(e)}`); }
  const cur = all.map(s => pathDelay(s.path, s.tree, device, SPEED_4) - s.ise);
  console.log(`SPEED_4: ${stats(cur)}`);
  console.log(JSON.stringify({ base: +w[0].toFixed(3), source: +w[1 + 2 * C].toFixed(3), wire: w.slice(1, 1 + C).map(v => +v.toFixed(3)), branch: w.slice(1 + C, 1 + 2 * C).map(v => +v.toFixed(3)) }));
  // the estimate of an unrouted connection: ISE's delay against the distance (tiles) from the driver to the load
  const dist = s => Math.abs(device.nodeR0[s.path[0]] - device.nodeR0[s.path.at(-1)]) + Math.abs(device.nodeC0[s.path[0]] - device.nodeC0[s.path.at(-1)]);
  const D = nnls(all.map(s => [1, dist(s)]), y);
  console.log(`distance: ${D[0].toFixed(3)} + ${D[1].toFixed(4)} x tiles: ${stats(all.map((s, i) => D[0] + D[1] * dist(s) - y[i]))}`);
  for (const r of [0, 1, 2, 4, 8, 16, 32]) { const v = all.filter(s => dist(s) >= r && dist(s) < Math.max(r + 1, r * 2)).map(s => s.ise).sort((a, b) => a - b); if (v.length) console.log(`  ${r}..: n ${v.length} min ${v[0]} p10 ${v[Math.floor(v.length / 10)]} median ${v[v.length >> 1]}`); }
  if (process.argv.includes('--worst')) {
    const idx = errs.map((e, i) => [Math.abs(e), i]).sort((a, b) => b[0] - a[0]).slice(0, 15);
    for (const [, i] of idx) { const s = all[i]; console.log(`${errs[i].toFixed(3)} ise ${s.ise} fo ${s.fanout} ${s.path.map(n => WIRE_NAMES[nodeClasses(device)[n]] + (s.tree.children.get(n) > 1 ? `*${s.tree.children.get(n)}` : '')).join(' ')}`); }
  }
}
