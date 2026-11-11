// #3169 / #3350: Silinx's Spartan-6 writer on the designs ISE implemented for run-3169-s6.mjs (<W>/w16/impl/*,
// <W>/w45/impl/*: top.xdl, top.bit), against ISE's bitgen, with the databases the flow reads and with the PIPs held out
// of them (bitdb/s6/s6-pips-held.json, #3349): with them, each design byte-identical but for the features the databases
// do not have, named; and the held PIPs a measurement's ana-pipdrop6.mjs resolved (<W>/w*/*-pips.json) against the
// held file's bits.
//   node research/s6/check-held6.mjs <W>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareBit } from './check-bitgen6.mjs';
import { loadBitDbS6 } from '../../src/fpga/s6/bitdb-node.js';
import { loadDeviceCache } from '../../src/fpga/device-node.js';

/** One design's comparison, as a line: 'byte-identical' or the bytes that differ and the features not known. */
export const verdict = c => (c.same ? 'byte-identical' : `${c.diff} bytes differ${c.unknown.size ? `; not in the databases: ${[...c.unknown.keys()].slice(0, 3).join(', ')}` : ''}`);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const W = process.argv[2];
  if (!W) { console.error('usage: node research/s6/check-held6.mjs <W>'); process.exit(1); }
  for (const [sub, part] of [['w16', 'xc6slx16csg324-3'], ['w45', 'xc6slx45csg324-3']]) {
    const dir = path.join(W, sub);
    if (!fs.existsSync(dir)) continue;
    const device = loadDeviceCache(part), flow = loadBitDbS6(part), held = loadBitDbS6(part, { held: true });
    const heldOnly = Object.keys(held.other.pips).filter(k => !(k in flow.other.pips));
    // the measurement's resolved PIPs among the held ones: the same bits
    for (const f of fs.readdirSync(dir).filter(x => x.endsWith('-pips.json'))) {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const k of heldOnly) {
        if (!(k in r.pips)) continue;
        const b = r.pips[k].map(x => (Array.isArray(x) ? x.join(',') : x));
        console.log(`${sub} ${f}: ${k} [${b.join(' ')}]${b.join() === held.other.pips[k].join() ? '' : ` (held: [${held.other.pips[k].join(' ')}])`}`);
      }
    }
    const impl = path.join(dir, 'impl');
    for (const d of fs.existsSync(impl) ? fs.readdirSync(impl) : []) {
      const x = path.join(impl, d, 'top.xdl'), b = path.join(impl, d, 'top.bit');
      if (!fs.existsSync(x) || !fs.existsSync(b)) continue;
      const text = fs.readFileSync(x, 'utf8'), bit = fs.readFileSync(b);
      console.log(`${sub} ${d}: ${verdict(compareBit(text, bit, device, flow))}; with the held PIPs: ${verdict(compareBit(text, bit, device, held))}`);
    }
  }
}
