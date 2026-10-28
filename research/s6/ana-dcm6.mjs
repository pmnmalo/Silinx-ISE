// Stage S6-E (#727): the DCM_SP's and PLL_BASE's settings from gen-dcm6.mjs's designs ISE implemented. Each design's
// bits the databases leave over (residual6.mjs's prediction taken away: the slices, the routing, the pads) and, per
// variant, the leftover bits it sets and clears against its base's: the setting's bits at that site.
//   node research/s6/ana-dcm6.mjs <dir> [part]   (<dir>/<design>/top.xdl, top.bit)   -> research/s6/db/<device>-cmt.json
// { part, dcm: { site, base: ['frame,bit' left over], variants: { name: { params, set, clear } } }, pll: { … } }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../core/xdl.js';
import { readBit6, emptyFdri, bitFormat6 } from '../../core/fpga/s6/bitstream.js';
import { bitsOf } from './ana-iob6.mjs';
import { predictDesign } from './residual6.mjs';
import { loadDb } from './check-slice6.mjs';
import { dcmVariants } from './gen-dcm6.mjs';
import { s6Device } from '../../test/s6-lib.mjs';

/** A variant's leftover bits against its base's: { set, clear } (sorted). */
export function variantBits(base, mine) {
  return { set: [...mine].filter(x => !base.has(x)).sort(), clear: [...base].filter(x => !mine.has(x)).sort() };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
  if (!dir) { console.error('usage: node research/s6/ana-dcm6.mjs <dir> [part]'); process.exit(1); }
  const read = n => JSON.parse(fs.readFileSync(new URL(`./db/${n}.json`, import.meta.url), 'utf8')), dv = part.replace(/csg.*/, '');
  const { device } = s6Device(part);
  const db = { part, slices: loadDb(dv), int: { pips: read('xc6slx16-int').pips, cover: read('xc6slx16-int-cover').pips, own: read('xc6slx16-int-own').pips },
    other: { pips: { ...read('s6-pips-other').pips, ...read('s6-pips-io').pips } }, iob: read(`${dv}-iob`) };
  const left = name => {
    const d = path.join(dir, name);
    if (!fs.existsSync(path.join(d, 'top.bit'))) return null;
    const x = parseXdl(fs.readFileSync(path.join(d, 'top.xdl'), 'utf8')), r = readBit6(fs.readFileSync(path.join(d, 'top.bit'))), dev = bitFormat6(r.device.part);
    const { bits } = predictDesign(x, device, dev, db);
    return new Set([...bitsOf(r.fdri, emptyFdri(dev))].filter(q => !bits.has(q)));
  };
  const out = { part, dcm: { site: 'DCM_X0Y1', variants: {} }, pll: { site: 'PLL_ADV_X0Y0', variants: {} } };
  for (const kind of ['dcm', 'pll']) {
    const base = left(kind);
    out[kind].base = [...base].sort();
    for (const [name, v] of Object.entries(dcmVariants())) {
      if (v.kind !== kind || name === kind) continue;
      const mine = left(name);
      if (!mine) { console.log(`${name}: no bitstream (ISE refused it)`); continue; }
      out[kind].variants[name] = { params: v.params, out: v.out, ...variantBits(base, mine) };
      console.log(`${name}: +${out[kind].variants[name].set.length} -${out[kind].variants[name].clear.length}`);
    }
  }
  fs.writeFileSync(new URL(`./db/${dv}-cmt.json`, import.meta.url), `${JSON.stringify(out)}\n`);
}
