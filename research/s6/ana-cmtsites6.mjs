// Stage S6-E2 (#1951): a DCM's or PLL's settings at every CMT site, from designs ISE implemented (gen-dcm6.mjs's at
// DCM_X0Y1, DCM_X0Y0 and PLL_ADV_X0Y0, gen-cmtsites6.mjs's at every site). A CMT's settings are bits of the 31-frame
// column its tile is in (the XC6SLX16's frames 327 to 357 of each row), in its tile's row: the same at every site of
// a kind (a DCM's by its Y's parity: the two DCMs of a CMT tile have different bits) and setting. What residual6.mjs
// leaves there (without the CMT databases) in every design of a kind and setting (cmtCfg) is its pattern.
//   node research/s6/ana-cmtsites6.mjs <part> <dir> …   (each <dir>/<design>/{top.xdl, top.bit})
//     -> research/s6/db/<device>-cmt-settings.json: { column: first frame, patterns: { 'kind cfg': { sites, bits: ['frame in
//        row,bit'] } } }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../core/xdl.js';
import { readBit6, emptyFdri, bitFormat6 } from '../../core/fpga/s6/bitstream.js';
import { bitsOf } from './ana-iob6.mjs';
import { predictDesign } from './residual6.mjs';
import { loadDb } from './check-slice6.mjs';
import { columnOf } from './ana-slice6.mjs';
import { cmtKind, CMT_FRAME } from './cmt6.mjs';
import { gridRegion } from './ana-pipdrop6.mjs';
import { s6Device } from '../../test/s6-lib.mjs';

/** A CMT's settings window: [first frame, frames] of its column in its tile's row. */
export function cmtWindow(device, dev, inst, column) {
  const [f0] = gridRegion(device, dev, inst.tile), row = Math.floor(f0 / dev.rowFrames);
  return [row * dev.rowFrames + column[0], column[1]];
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [part, ...dirs] = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node research/s6/ana-cmtsites6.mjs <part> <dir> …'); process.exit(1); }
  const read = n => JSON.parse(fs.readFileSync(new URL(`./db/${n}.json`, import.meta.url), 'utf8')), dv = part.replace(/csg.*/, ''), { device } = s6Device(part);
  const db = { part, slices: loadDb(dv), int: { pips: read('xc6slx16-int').pips, cover: read('xc6slx16-int-cover').pips, own: read('xc6slx16-int-own').pips },
    other: { pips: { ...read('s6-pips-other').pips, ...read('s6-pips-io').pips, ...read('s6-pips-clock').pips, ...(fs.existsSync(new URL('./db/s6-pips-probe.json', import.meta.url)) ? read('s6-pips-probe').pips : {}) } }, iob: read(`${dv}-iob`), clocks: read('s6-clocks') };
  const seen = new Map();
  let dev = null, column = null;
  for (const dir of dirs) for (const n of fs.readdirSync(dir)) {
    const d = path.join(dir, n);
    if (!fs.existsSync(path.join(d, 'top.bit'))) continue;
    const r = readBit6(fs.readFileSync(path.join(d, 'top.bit')));
    if (r.device.device !== dv) continue;
    const x = parseXdl(fs.readFileSync(path.join(d, 'top.xdl'), 'utf8'));
    dev = bitFormat6(r.device.part); column ??= columnOf(dev, CMT_FRAME[dv]);
    const { bits } = predictDesign(x, device, dev, db), left = [...bitsOf(r.fdri, emptyFdri(dev))].filter(q => !bits.has(q));
    for (const inst of x.insts.filter(i => /^(DCM|PLL_ADV)$/.test(i.type))) {
      const [w0, wn] = cmtWindow(device, dev, inst, column), row0 = w0 - column[0];
      const mine = left.map(q => q.split(',').map(Number)).filter(([f]) => f >= w0 && f < w0 + wn).map(([f, b]) => `${f - row0},${b}`);
      const key = cmtKind(inst);
      (seen.get(key) ?? seen.set(key, []).get(key)).push({ name: `${path.basename(dir)}/${n}`, site: inst.site, mine: new Set(mine) });
    }
  }
  // a pattern: the bits every design of the kind and setting has (the others there its path's: printed)
  const patterns = {};
  for (const [key, l] of seen) {
    const core = [...l[0].mine].filter(q => l.every(s => s.mine.has(q))).sort();
    patterns[key] = { sites: [...new Set(l.map(q => q.site))].sort(), bits: core };
    const extra = l.map(s => s.mine.size - core.length);
    console.log(`${key.slice(0, 60)}…: ${l.length} designs (${[...new Set(l.map(s => s.site))].join(' ')}), ${core.length} bits${extra.some(Boolean) ? `; beyond them ${extra.join(' ')}` : ''}`);
  }
  fs.writeFileSync(new URL(`./db/${dv}-cmt-settings.json`, import.meta.url), `${JSON.stringify({ column: column[0], patterns })}\n`);
}
