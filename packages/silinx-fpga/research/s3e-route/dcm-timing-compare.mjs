// The Silinx toolchain's static timing against trce's on the same routing (#601): dcm-timing.mjs's out folder, each
// design's routed.xdl (Silinx's) and ise/silinx.twr (trce -v on it, with silinxPcf's constraints).
//   node research/s3e-route/dcm-timing-compare.mjs <out folder> [design…]   (--json: the rows as JSON)
// Prints, per design: the paths between two clocks (trce's worst setup path of each pair of clocks and edges: its
// requirement, data path, slack; Silinx's checkCross), the pads' setup / hold (trce's data sheet, "Setup/Hold to clock")
// and clock to pad ("Clock … to Pad"), and the differences' mean and rms.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../src/xdl.js';
import { parseUcf } from '../../src/ucf.js';
import { analyzeTiming, checkCross } from '../../src/fpga/timing.js';
import { loadDeviceCache } from '../../src/fpga/device-node.js';

/** trce's verbose report: { cross: [{ from, launch, to, capture, required, delay, slack }] (the worst setup path of each
 *  pair of different clocks and edges), setup: [{ pad, clock, setup, hold }], toPad: [{ pad, clock, edge, delay }] }. */
export function parseTwrClocks(text) {
  const lines = text.split('\n');
  const cross = new Map(), setup = [], toPad = [];
  let cur = null;
  const done = () => {
    if (!cur || cur.hold || !cur.from || !cur.to || cur.from === cur.to || cur.required === undefined) return;
    const k = `${cur.from}/${cur.launch}/${cur.to}/${cur.capture}`;
    if (!cross.has(k) || cur.slack < cross.get(k).slack) cross.set(k, cur);
  };
  let table = null, last = null;
  for (const l of lines) {
    let m;
    if ((m = /^Slack( \((setup|hold) path\))?:\s+(-?[\d.]+)ns/.exec(l))) { done(); cur = { slack: +m[3], hold: m[2] === 'hold' }; continue; }
    if (cur) {
      if ((m = /^\s+Source Clock:\s+(\S+) (rising|falling) at/.exec(l))) { cur.from = m[1]; cur.launch = m[2] === 'falling' ? 1 : 0; }
      else if ((m = /^\s+Destination Clock:\s+(\S+) (rising|falling) at/.exec(l))) { cur.to = m[1]; cur.capture = m[2] === 'falling' ? 1 : 0; }
      else if ((m = /^\s+Requirement:\s+(-?[\d.]+)ns/.exec(l))) cur.required = +m[1];
      else if ((m = /^\s+Data Path Delay:\s+(-?[\d.]+)ns/.exec(l))) cur.delay = +m[1];
      else if (/^(Timing constraint|Data Sheet report)/.test(l)) { done(); cur = null; }
    }
    if (/^Setup\/Hold to clock/.test(l)) { table = 'setup'; continue; }
    if (/^Clock \S+ to Pad/.test(l)) { table = 'toPad'; continue; }
    if (table && /^\s*$/.test(l)) { table = null; continue; }
    if (table === 'setup' && (m = /^(\S*)\s*\|\s*(-?[\d.]+)\([RF]\)\|\s*(-?[\d.]+)\([RF]\)\|(\S+)\s*\|/.exec(l))) {
      const pad = m[1] || last;
      last = pad;
      setup.push({ pad, clock: m[4], setup: +m[2], hold: +m[3] });
    } else if (table === 'toPad' && (m = /^(\S*)\s*\|\s*(-?[\d.]+)\(([RF])\)\|(\S+)\s*\|/.exec(l))) {
      const pad = m[1] || last;
      last = pad;
      toPad.push({ pad, clock: m[4], edge: m[3] === 'F' ? 1 : 0, delay: +m[2] });
    }
  }
  done();
  return { cross: [...cross.values()], setup, toPad };
}

/** One design: Silinx's analysis of routed.xdl against trce's report. */
export function compareDesign(dir) {
  const xdl = fs.readFileSync(path.join(dir, 'routed.xdl'), 'utf8');
  const design = parseXdl(xdl);
  const part = /^design "[^"]*" ([\w-]+)/m.exec(xdl)[1];
  const ucfFile = fs.readdirSync(path.join(dir, '..', 'proj', path.basename(dir))).find(f => f.endsWith('.ucf'));
  const pu = parseUcf(fs.readFileSync(path.join(dir, '..', 'proj', path.basename(dir), ucfFile), 'utf8'));
  const sta = analyzeTiming(design, loadDeviceCache(part), { clocks: pu.clocks });
  const t = parseTwrClocks(fs.readFileSync(path.join(dir, 'ise', 'silinx.twr'), 'utf8'));
  const cc = checkCross(sta, design, pu.clocks);
  const rows = [];
  for (const x of t.cross) {
    const s = cc.find(c => c.from === x.from && c.to === x.to && c.launch === x.launch && c.capture === x.capture);
    rows.push({ kind: 'cross', what: `${x.from}${x.launch ? '(F)' : ''} -> ${x.to}${x.capture ? '(F)' : ''}`, trce: x.delay, silinx: s?.delay ?? null, trceReq: x.required, silinxReq: s?.required ?? null, trceSlack: x.slack, silinxSlack: s?.slack ?? null });
  }
  for (const x of t.setup) {
    const s = sta.pads.inputs.find(i => i.pad === x.pad && i.clock === x.clock);
    rows.push({ kind: 'setup', what: `${x.pad} ${x.clock}`, trce: x.setup, silinx: s?.setup ?? null });
    rows.push({ kind: 'hold', what: `${x.pad} ${x.clock}`, trce: x.hold, silinx: s?.hold ?? null });
  }
  for (const x of t.toPad) {
    const s = sta.pads.outputs.find(o => o.pad === x.pad && o.clock === x.clock);
    rows.push({ kind: 'clock to pad', what: `${x.pad} ${x.clock}${x.edge ? ' (F)' : ''}`, trce: x.delay, silinx: s?.delay ?? null });
  }
  return rows;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const args = process.argv.slice(2), json = args.includes('--json');
  const [out, ...only] = args.filter(a => a !== '--json');
  const names = only.length ? only : fs.readdirSync(out).filter(d => fs.existsSync(path.join(out, d, 'ise', 'silinx.twr')));
  const all = {};
  for (const n of names) all[n] = compareDesign(path.join(out, n));
  if (json) { console.log(JSON.stringify(all, null, 1)); process.exit(0); }
  const stats = {};
  for (const [n, rows] of Object.entries(all)) {
    console.log(`== ${n}`);
    for (const r of rows) {
      const d = r.silinx === null ? null : r.silinx - r.trce;
      if (d !== null) (stats[r.kind] ||= []).push(d);
      console.log(`  ${r.kind.padEnd(12)} ${r.what.padEnd(28)} trce ${r.trce.toFixed(3).padStart(7)}  silinx ${r.silinx === null ? '    -  ' : r.silinx.toFixed(3).padStart(7)}${d === null ? '' : `  ${d >= 0 ? '+' : ''}${d.toFixed(3)}`}${r.kind === 'cross' ? `  req ${r.trceReq} / ${r.silinxReq}` : ''}`);
    }
  }
  for (const [k, ds] of Object.entries(stats)) {
    const mean = ds.reduce((a, b) => a + b, 0) / ds.length, rms = Math.sqrt(ds.reduce((a, b) => a + b * b, 0) / ds.length);
    console.log(`${k}: ${ds.length} values, mean ${mean.toFixed(3)}, rms ${rms.toFixed(3)}, max |${Math.max(...ds.map(Math.abs)).toFixed(3)}|`);
  }
}
