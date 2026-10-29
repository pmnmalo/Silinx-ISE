// #751: the pads' input delays measured with each pad used on its own. #44 / #97 solved them from designs where every pad
// had an input (all registered, or all direct), so a bit of one pad's delay could go to its neighbour's (the two always
// used together): with only some pads used, ISE's bitstream differed from Silinx's. Here every bonded pad of the device
// (but the designs' clock and output pads) takes, in each base design, a kind (n unused, r input register, i direct
// input, o output; an input-only pad no output), balanced over the bases (each pad r and i in 3 of 8, in its own order),
// one open flow per base (gen-pairdly.mjs project); then each base's variants give every r / i pad an input delay
// (IFD_DELAY_VALUE 0-6, IBUF_DELAY_VALUE 0-12, every value about as often on every pad, each pad in its own order),
// written as ISE's map writes them (gen-iobrand.mjs setDelay). The global clock pins keep the delay ISE's map chooses
// (their other delays are refused, #97); a pad whose input register was never measured (the measurements' control
// inputs: N3, M6… on the XC3S250E) is never registered. ISE's xdl -xdl2ncd + bitgen on each (fuzz-remote.sh), then
// ana-paddly.mjs gives each delay bit to the one pad whose kind and delay it follows.
//   PART=xc3s250ecp132-4 node gen-paddly.mjs outdir [bases=8] [variants=11] [seed=1] [--q pad]
// (--q: the designs' output on another pad than gen-pairdly.mjs's Q, so that Q's own delays are measured too)
import fs from 'node:fs';
import path from 'node:path';
import { project, openFlow, withDelays, CLK, Q } from './gen-pairdly.mjs';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import { deviceSites } from '../../packages/silinx-fpga/src/fpga/place.js';
import { bufgReach } from '../../packages/silinx-fpga/src/fpga/route.js';
import { loadDb } from '../../packages/silinx-fpga/src/fpga/bitdb-node.js';

const PART = process.env.PART || 'xc3s250ecp132-4';
const argv = process.argv.slice(2), qi = argv.indexOf('--q'), qPad = qi >= 0 ? argv.splice(qi, 2)[1] : null;
const [out, Bs = '8', Vs = '11', seeds = '1'] = argv;
const B = +Bs, V = +Vs;
let seed = +seeds;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// n values spread over len slots, each about as often, in a random order
const spread = (n, len) => shuffle(Array.from({ length: len }, (_, i) => i % n));
const dev = loadDeviceCache(PART);
const { pads } = deviceSites(dev);
const auto = /^xc3s100e/.test(PART) ? 2 : 3;
// the designs' own pads (gen-pairdly.mjs CLK, Q, or --q)
const pkg = /cp132/.test(PART) ? 'cp132' : 'fg320';
const own = new Set([CLK[pkg], qPad || Q[pkg]]);
const list = [...pads.values()].filter(p => !own.has(p.name)).sort((a, b) => a.name.localeCompare(b.name));
const padFeats = loadDb(PART).padFeats;
const noReg = p => !padFeats[p.name]?.[`IFD:DLY${auto}`];
const gclk = new Set(list.filter(p => bufgReach(dev, p.name, 'I').length).map(p => p.name));
// each pad's kind in each base: r and i in 3 of 8 each, n and o in one (an input-only pad: n in two; no register: n
// instead of r); more bases repeat the pattern
const kindsOf = new Map(list.map(p => {
  const pat = [...(p.inputOnly ? 'nnrrriii' : 'norrriii')].map(k => (k === 'r' && noReg(p) ? 'n' : k));
  return [p.name, shuffle(Array.from({ length: B }, (_, b) => pat[b % pat.length]))];
}));
// each pad's delays: over its r (or i) bases' variants, every value about as often
const delaysOf = new Map(list.map(p => {
  const ks = kindsOf.get(p.name), nr = ks.filter(k => k === 'r').length * V, ni = ks.filter(k => k === 'i').length * V;
  return [p.name, { r: gclk.has(p.name) ? Array(nr).fill(auto) : spread(7, nr), i: gclk.has(p.name) ? Array(ni).fill(0) : spread(13, ni) }];
}));
const key = { part: PART, groups: [], designs: {} };
const used = new Map(list.map(p => [p.name, { r: 0, i: 0 }]));
for (let b = 0; b < B; b++) {
  const name = `B${String(b).padStart(2, '0')}`;
  const kinds = list.map(p => [p.name, kindsOf.get(p.name)[b]]);
  const proj = path.join(out, 'proj', name);
  if (!fs.existsSync(path.join(proj, 'flow', 'routed.xdl'))) project(proj, kinds, PART, { q: qPad });
  const text = openFlow(proj);
  fs.mkdirSync(path.join(out, name), { recursive: true });
  key.designs[name] = { kinds: Object.fromEntries(kinds), variants: {} };
  for (let v = 0; v < V; v++) {
    const vals = {};
    for (const [p, k] of kinds) if (k === 'r' || k === 'i') { const u = used.get(p); vals[p] = delaysOf.get(p)[k][u[k]++]; }
    const vn = `V${String(v).padStart(3, '0')}`;
    fs.writeFileSync(path.join(out, name, `${vn}.xdl`), withDelays(text, vals));
    key.designs[name].variants[vn] = vals;
  }
}
fs.writeFileSync(path.join(out, 'key.json'), JSON.stringify(key, null, 1));
console.log(`${PART}: ${B} bases x ${V} variants, ${list.length} pads (${gclk.size} global clock pins), in ${out}`);
