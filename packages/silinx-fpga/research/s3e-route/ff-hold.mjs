// The hold check of two flip-flops (#2226) against trce's hold paths: the numbers of model.clock.minLogic / minNet and
// the slices' Tckdx, Tckdi, Tckdy, Tckce, Tcksr (packages/silinx-fpga/src/fpga/timing.js).
//   node research/s3e-route/ff-hold.mjs <folder>...
// each with silinx.xdl (a routed design) and silinx.twr (trce -v 2000 -fastpaths of ISE on it, after xdl -xdl2ncd: its
// hold paths, research/s3e-route/clock-detour.mjs has the routings of #2224 and #2226). Prints trce's logic delays of
// the hold paths by kind and slice (SLICEL / SLICEM: the hold times, (-Th), and the earliest clock-to-out, LUT, carry)
// and the least-squares scale of trce's earliest wire delays against the model's (analyzeTiming's conns).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../src/xdl.js';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { analyzeTiming } from '../../src/fpga/timing.js';

/** trce's hold paths: [{ src, dst, slack, skew, steps: [{ loc: 'SITE.PIN', type, d }] }] (a step's delay to its pin). */
export function holdPaths(text) {
  const out = [];
  for (const b of text.split(/Slack \(hold path\):/).slice(1)) {
    const field = k => (new RegExp(`${k}:\\s+(\\S+)`).exec(b) || [])[1];
    const steps = [];
    for (const l of (b.split('Minimum Data Path:')[1]?.split('Total')[0] || '').split('\n')) {
      const x = /^\s{4}(\S+)\s+(\S+)(?:\s+\((?:-Th|fanout=\d+)\))?\s+(-?[\d.]+)\s/.exec(l);
      if (x && x[1] !== 'Location') steps.push({ loc: x[1], type: x[2], d: +x[3] });
    }
    out.push({ src: field('Source'), dst: field('Destination'), slack: parseFloat(b), skew: parseFloat(/Clock Path Skew:\s+(-?[\d.]+)/.exec(b)?.[1]), steps });
  }
  return out;
}

const sliceKind = site => (+(/^SLICE_X(\d+)Y/.exec(site)?.[1] ?? 1) % 2 === 0 ? 'SLICEM' : 'SLICEL');

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const kinds = new Map(), xy = [];
  for (const dir of process.argv.slice(2)) {
    const design = parseXdl(fs.readFileSync(path.join(dir, 'silinx.xdl'), 'utf8'));
    const site = new Map(design.insts.map(i => [i.name, i.site]));
    const model = new Map();
    for (const c of analyzeTiming(design, loadDeviceCache(design.part)).conns) {
      const at = s => { const k = s.lastIndexOf('.'); return `${site.get(s.slice(0, k))}.${s.slice(k + 1)}`; };
      model.set(`${at(c.from)}>${at(c.to)}`, c.delay);
    }
    const seen = new Set();
    for (const p of holdPaths(fs.readFileSync(path.join(dir, 'silinx.twr'), 'utf8'))) {
      p.steps.forEach((s, j) => {
        const [st, pin] = s.loc.split('.');
        if (s.type !== 'net') {
          // a hold time is the last step's, at the pin of the step before it
          const at = j === p.steps.length - 1 && j > 0 ? p.steps[j - 1].loc.split('.')[1].replace(/\d$/, '') : pin;
          const k = `${s.type} ${at} ${sliceKind(st)}`;
          if (!kinds.has(k)) kinds.set(k, new Set());
          kinds.get(k).add(s.d);
          return;
        }
        const key = `${p.steps[j - 1].loc}>${s.loc}`;
        if (seen.has(dir + key) || !(model.get(key) > 0)) return;
        seen.add(dir + key);
        xy.push([model.get(key), s.d]);
      });
    }
  }
  for (const [k, v] of [...kinds].sort()) console.log(`${k.padEnd(22)} ${[...v].sort((a, b) => a - b).join(' ')}`);
  const b = xy.reduce((s, [x, y]) => s + x * y, 0) / xy.reduce((s, [x]) => s + x * x, 0);
  const rms = Math.sqrt(xy.reduce((s, [x, y]) => s + (b * x - y) ** 2, 0) / xy.length);
  console.log(`wires: trce's earliest = ${b.toFixed(3)} x the model's, ${xy.length} connections, rms error ${rms.toFixed(3)} ns`);
}
