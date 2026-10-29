// Stage S6-G (#731): the Spartan-6's delay model checked on trce's own paths. The logic arcs' delays (a table by arc
// type, slice kind and, for a flip-flop's setup through its LUT, its FFMUX: the median of what trce reports) and the
// wires' (timing-fit6.mjs's model on the net's path in the routed XDL) give each path's data path delay; with trce's
// clock skew and uncertainty, its slack: compared with trce's (the issue's measure: within 5 % of the slack).
//   node research/s6/timing6.mjs <dir> …   (each with top.xdl and top.twr, ISE's routing: night 1's impl-* and edif-*)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { nnls } from '../s3e-route/timing-fit.mjs';
import { parseTwr } from './twr6.mjs';
import { connection, connections, features } from './timing-fit6.mjs';
import { s6Device } from '../../test/s6-lib.mjs';

/** An arc's key: its type, the slice kind, and a setup through the LUT its flip-flop's input mux. */
export function arcKey(e, inst) {
  const site = e.loc.split('.')[0], kind = inst ? inst.tile.replace(/_X\d+Y\d+$/, '') : site.replace(/_X\d+Y\d+$/, '');
  if (e.type !== 'Tas' || !inst) return `${e.type} ${kind}`;
  const muxes = inst.cfg.filter(c => /^[A-D]5?FFMUX$/.test(c.attr) && c.value !== '#OFF').map(c => c.value);
  return `${e.type} ${kind} ${muxes.includes('XOR') ? 'XOR' : 'LUT'}`;
}

const median = a => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

/** The arcs' table from reports: { key: median delay }, and { type: median } for a key not seen. */
export function arcTable(designs) {
  const by = {}, byType = {};
  for (const { xdl, paths } of designs) {
    const inst = new Map(xdl.insts.map(i => [i.site, i]));
    for (const p of paths) for (const e of p.elements) if (e.type !== 'net') { (by[arcKey(e, inst.get(e.loc.split('.')[0]))] ??= []).push(e.delay); (byType[e.type] ??= []).push(e.delay); }
  }
  return { arcs: Object.fromEntries(Object.entries(by).map(([k, v]) => [k, median(v)])), types: Object.fromEntries(Object.entries(byType).map(([k, v]) => [k, median(v)])) };
}

/** A path's data path delay by the model: its arcs from the table, its nets from the wire weights (null: a net not found). */
export function modelPath(p, xdl, device, table, weights) {
  const inst = new Map(xdl.insts.map(i => [i.site, i])), nets = new Map(xdl.nets.map(n => [n.name, n]));
  let d = 0;
  for (const [i, e] of p.elements.entries()) {
    if (e.type === 'net') { const c = i > 0 && connection(nets, device, p.elements[i - 1].loc, e); if (!c) return null; d += Math.max(0, features(c).reduce((a, v, j) => a + v * weights[j], 0)); }
    else d += table.arcs[arcKey(e, inst.get(e.loc.split('.')[0]))] ?? table.types[e.type] ?? e.delay;
  }
  return d;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node research/s6/timing6.mjs <dir> …'); process.exit(1); }
  const devices = {}, designs = dirs.map(d => {
    const xt = fs.readFileSync(path.join(d, 'top.xdl'), 'utf8'), part = xt.match(/^design "[^"]*" (\S+)/m)[1];
    const device = (devices[part] ??= s6Device(part.replace(/^(xc6slx\d+)-?(csg\d+)(-\d)?$/, '$1$2-3')).device);
    return { name: d, xdl: parseXdl(xt), paths: parseTwr(fs.readFileSync(path.join(d, 'top.twr'), 'utf8')), device };
  });
  const table = arcTable(designs), conns = designs.flatMap(x => connections(x.xdl, null, x.device, x.paths).conns);
  const weights = nnls(conns.map(features), conns.map(c => c.delay));
  const errs = [], slackErr = [], periodErr = [], worst = [];
  for (const x of designs) {
    const byConstraint = new Map();
    for (const p of x.paths) {
      const d = modelPath(p, x.xdl, x.device, table, weights);
      if (d === null || p.requirement === undefined) continue;
      errs.push(d - p.dataPath);
      const slack = p.requirement - (d - (p.skew ?? 0) + (p.uncertainty ?? 0));
      if (!byConstraint.has(p.constraint)) byConstraint.set(p.constraint, { trce: p.slack, model: slack, req: p.requirement });
    }
    // each constraint's worst path (trce's first): the model's slack against trce's
    for (const [c, s] of byConstraint) { slackErr.push(Math.abs(s.model - s.trce) / Math.abs(s.trce)); periodErr.push(Math.abs(s.model - s.trce) / s.req); worst.push(`${path.basename(path.dirname(x.name))}/${path.basename(x.name)} ${c.slice(0, 40)}: trce ${s.trce.toFixed(3)}, model ${s.model.toFixed(3)}`); }
  }
  const abs = errs.map(Math.abs).sort((a, b) => a - b), rms = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length);
  console.log(`${errs.length} paths: data path rms ${rms.toFixed(3)} ns, 95% within ${abs[Math.floor(abs.length * 0.95)].toFixed(3)}, max ${abs.at(-1).toFixed(3)}`);
  console.log(`${slackErr.length} constraints: slack within 5% of trce's in ${slackErr.filter(e => e <= 0.05).length}, worst ${(Math.max(...slackErr) * 100).toFixed(1)}%; the slack's error at most ${(Math.max(...periodErr) * 100).toFixed(1)}% of the period`);
  for (const w of worst) console.log(`  ${w}`);
}
