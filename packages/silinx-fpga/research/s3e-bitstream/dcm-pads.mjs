// #92: the dedicated paths from the pads to the DCMs' CLKIN (no general routing, no route-throughs)
// on a part, and the switches on them the bit database does not have.
//   PART=xc3s500efg320-4 node dcm-pads.mjs [--all]
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { knownRouting } from '../../src/fpga/bitgen.js';
import { PIP_ROUTETHRU } from '../../src/fpga/device.js';
import { PART, loadDb } from './db.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dev = loadDeviceCache(PART);
const known = knownRouting(loadDb(PART)).allowPip;
const E = dev.routingEdges();
const GENERAL = /^([NSEW](2|6)(BEG|MID|END|[A-D])\d|L[HV]\d)/;
const dcms = new Map(dev.sites('DCM').map(s => [dev.sitePinNode(s.name, 'CLKIN'), s.name]));

/** Every pad's dedicated paths to a DCM's CLKIN: [{ pad, dcm, pips: [{ tile, from, to, known }] }]. */
export function dcmPadPaths() {
  const out = [];
  for (const s of ['IOB', 'IBUF', 'DIFFM', 'DIFFS', 'DIFFMI', 'DIFFSI'].flatMap(t => dev.sites(t))) {
    const start = dev.sitePinNode(s.name, 'I');
    if (start < 0) continue;
    const prev = new Map([[start, null]]), q = [start];   // node -> [node before, edge]
    for (let steps = 0; q.length && steps < 20000; steps++) {
      const n = q.shift();
      if (dcms.has(n)) continue;
      for (let e = E.edgeStart[n]; e < E.edgeStart[n + 1]; e++) {
        const m = E.edgeTo[e];
        if (prev.has(m) || E.edgeFlags[e] & PIP_ROUTETHRU) continue;
        if (GENERAL.test(dev.pipWires(E.edgeTile[e], E.edgePip[e])[1])) continue;
        prev.set(m, [n, e]); q.push(m);
      }
    }
    for (const [n, dcm] of dcms) {
      if (!prev.has(n)) continue;
      const pips = [];
      for (let m = n; prev.get(m); m = prev.get(m)[0]) {
        const e = prev.get(m)[1], tile = dev.tileNames[E.edgeTile[e]], [from, to] = dev.pipWires(E.edgeTile[e], E.edgePip[e]);
        pips.unshift({ tile, from, to, known: known(tile, from, to) });
      }
      out.push({ pad: s.name, dcm, pips });
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const paths = dcmPadPaths();
  const unknown = new Map();
  for (const p of paths) {
    const k = p.pips.every(x => x.known);
    if (process.argv.includes('--all') || !k) console.log(`${p.pad} -> ${p.dcm} ${k ? 'known' : 'UNKNOWN'}: ${p.pips.map(x => `${x.tile} ${x.from}->${x.to}${x.known ? '' : '?'}`).join(' | ')}`);
    for (const x of p.pips) if (!x.known) unknown.set(`${x.tile} ${x.from}->${x.to}`, 1);
  }
  console.log(`${PART}: ${paths.length} pad->DCM paths, ${paths.filter(p => p.pips.every(x => x.known)).length} known; ${unknown.size} unknown PIPs`);
}
