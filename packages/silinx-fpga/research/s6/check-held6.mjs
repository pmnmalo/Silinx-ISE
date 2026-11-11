// #3169 / #3350: Silinx's Spartan-6 writer on the designs ISE implemented for run-3169-s6.mjs (<W>/w16/impl/*,
// <W>/w45/impl/*: top.xdl, top.bit), against ISE's bitgen, with the databases the flow reads (the PIPs these
// measurements found, held out of them until nextpnr's chip database had them, in them since #3349): each design
// byte-identical but for the features the databases do not have, named; and the PIPs a measurement's ana-pipdrop6.mjs
// resolved (<W>/w*/*-pips.json) that the databases have not, or with other bits.
//   node research/s6/check-held6.mjs <W>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareBit } from './check-bitgen6.mjs';
import { loadBitDbS6 } from '../../src/fpga/s6/bitdb-node.js';
import { loadDeviceCache } from '../../src/fpga/device-node.js';

/** One design's comparison, as a line: 'byte-identical' or the bytes that differ and the features not known. */
export const verdict = c => (c.same ? 'byte-identical' : `${c.diff} bytes differ${c.unknown.size ? `; not in the databases: ${[...c.unknown.keys()].slice(0, 3).join(', ')}` : ''}`);

/** A resolved PIP against the databases' bits (pips: theirs): null when the same, else a line. */
export function pipCheck(k, bits, pips) {
  const b = bits.map(x => (Array.isArray(x) ? x.join(',') : x)), have = pips[k];
  if (have && b.join() === have.join()) return null;
  return `${k} [${b.join(' ')}]${have ? ` (the databases: [${have.join(' ')}])` : ' (not in the databases)'}`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const W = process.argv[2];
  if (!W) { console.error('usage: node research/s6/check-held6.mjs <W>'); process.exit(1); }
  for (const [sub, part] of [['w16', 'xc6slx16csg324-3'], ['w45', 'xc6slx45csg324-3']]) {
    const dir = path.join(W, sub);
    if (!fs.existsSync(dir)) continue;
    const device = loadDeviceCache(part), db = loadBitDbS6(part);
    // the measurement's resolved PIPs the databases have not, or with other bits
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('-pips.json'))) {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const [k, bits] of Object.entries(r.pips)) {
        const line = pipCheck(k, bits, db.other.pips);
        if (line) console.log(`${sub} ${f}: ${line}`);
      }
    }
    const impl = path.join(dir, 'impl');
    for (const d of fs.existsSync(impl) ? fs.readdirSync(impl) : []) {
      const x = path.join(impl, d, 'top.xdl'), b = path.join(impl, d, 'top.bit');
      if (!fs.existsSync(x) || !fs.existsSync(b)) continue;
      console.log(`${sub} ${d}: ${verdict(compareBit(fs.readFileSync(x, 'utf8'), fs.readFileSync(b), device, db))}`);
    }
  }
}
