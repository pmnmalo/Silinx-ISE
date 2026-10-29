// #751: held-out designs for the pads' input delays with only some pads used. #44 / #97 measured them in designs where
// every pad had an input; here each design gives every bonded pad of the device (but the designs' clock and output pads)
// a kind at random (n unused, r input register, i direct input, o output; an input-only pad no output) and an input
// delay at random (IFD_DELAY_VALUE 0-6, IBUF_DELAY_VALUE 0-12; the global clock pins only the delay ISE's map chooses,
// the others are refused, #97; no register on a pad whose input register was never measured), one open flow per design
// (gen-pairdly.mjs project). ISE's xdl -xdl2ncd + bitgen on each (fuzz-remote.sh), then ana-pairdly.mjs: every one
// byte-identical to ISE's bitgen.
//   PART=xc3s250ecp132-4 node gen-padrand.mjs outdir [N=6] [seed=1]
import fs from 'node:fs';
import path from 'node:path';
import { project, openFlow, withDelays } from './gen-pairdly.mjs';
import { loadDeviceCache } from '../../packages/silinx-fpga/src/fpga/device-node.js';
import { deviceSites } from '../../packages/silinx-fpga/src/fpga/place.js';
import { bufgReach } from '../../packages/silinx-fpga/src/fpga/route.js';
import { loadDb } from '../../packages/silinx-fpga/src/fpga/bitdb-node.js';

const PART = process.env.PART || 'xc3s250ecp132-4';
const [out, Ns = '6', seeds = '1'] = process.argv.slice(2);
let seed = +seeds;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
const pick = a => a[Math.floor(rnd() * a.length)];
const dev = loadDeviceCache(PART);
const { pads } = deviceSites(dev);
const auto = /^xc3s100e/.test(PART) ? 2 : 3;
// the designs' own pads (gen-pairdly.mjs CLK, Q)
const own = new Set(/cp132/.test(PART) ? ['B8', 'M5'] : ['C9', 'J14']);
const list = [...pads.values()].filter(p => !own.has(p.name)).sort((a, b) => a.name.localeCompare(b.name));
// the pads whose input register was never measured (the measurements' control inputs: N3, M6… on the XC3S250E) no register
const padFeats = loadDb(PART).padFeats;
const noReg = p => !padFeats[p.name]?.[`IFD:DLY${auto}`];
const gclk = new Set(list.filter(p => bufgReach(dev, p.name, 'I').length).map(p => p.name));
const key = { part: PART, groups: [], designs: {} };
for (let d = 0; d < +Ns; d++) {
  const name = `R${String(d).padStart(2, '0')}`;
  const kinds = list.map(p => [p.name, pick([...(p.inputOnly ? 'nri' : 'nrio')].filter(k => !(k === 'r' && noReg(p))))]);
  const vals = Object.fromEntries(kinds.filter(([, k]) => k === 'r' || k === 'i').map(([p, k]) => [p, gclk.has(p) ? (k === 'r' ? auto : 0) : Math.floor(rnd() * (k === 'r' ? 7 : 13))]));
  const proj = path.join(out, 'proj', name);
  if (!fs.existsSync(path.join(proj, 'flow', 'routed.xdl'))) project(proj, kinds, PART);
  fs.mkdirSync(path.join(out, name), { recursive: true });
  fs.writeFileSync(path.join(out, name, 'V000.xdl'), withDelays(openFlow(proj), vals));
  key.designs[name] = { kinds: Object.fromEntries(kinds), variants: { V000: vals } };
}
fs.writeFileSync(path.join(out, 'key.json'), JSON.stringify(key, null, 1));
console.log(`${PART}: ${Ns} designs, ${list.length} pads each (${gclk.size} global clock pins), in ${out}`);
