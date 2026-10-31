// Stage S6-E7 (#2025): an OLOGIC2's output flip-flop's bits, from gen-ologic6.mjs's designs ISE implemented (their clock
// paths' PIPs measured first: gen-flowdrop6.mjs, into db/s6-pips-flow.json). What residual6.mjs leaves over in a design
// is placed by the OLOGIC2s with OMUX::OUTFF: a bit in one's tile region is its site's, as an offset from that region
// (gridRegion), by tile type and the site's Y parity (the IOI tile's two OLOGIC2s); a bit in the region of the HCLK tile
// its clock passes in its column and clock region (bitgen-ologic.js olHclk) is that HCLK tile's, by its type. Each
// must be the same in every design that has it.
//   node research/s6/ana-ologic6.mjs <dir> …   (each <dir>/<design>/{top.xdl, top.bit})   -> packages/silinx-fpga/bitdb/s6/s6-ologic.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../src/xdl.js';
import { readBit6, bitFormat6 } from '../../src/fpga/s6/bitstream.js';
import { isOutFF, ologicKey, olHclk } from '../../src/fpga/s6/bitgen-ologic.js';
import { gridRegion } from './ana-pipdrop6.mjs';
import { residualDb, setBits, predictDesign } from './residual6.mjs';
import { s6Device } from '../../../../test/s6-lib.mjs';

export { isOutFF, ologicKey };

/** A design's bits left over (ISE's not predicted), by OLOGIC2 site and HCLK tile: { sites: { key: [[site, offsets]] }, hclk: { type: [[tile, offsets]] }, rest }. */
export function ologicLeft(dir, { ologic = false } = {}) {
  const r6 = readBit6(fs.readFileSync(path.join(dir, 'top.bit'))), dev = bitFormat6(r6.device.part), db = residualDb(r6, { cmtPaths: false });
  if (!ologic) db.ologic = null;
  const { device } = s6Device(db.part), design = parseXdl(fs.readFileSync(path.join(dir, 'top.xdl'), 'utf8'));
  const { bits } = predictDesign(design, device, dev, db), left = [...setBits(r6, dev, !!db.hard)].filter(x => !bits.has(x)).map(x => x.split(',').map(Number));
  const sites = {}, hclk = {}, used = new Set(), hclks = new Set();
  const own = tile => { const [c0, b0, n, nb] = gridRegion(device, dev, tile), o = left.filter(([f, b]) => f >= c0 && f < c0 + n && b >= b0 && b < b0 + nb); o.forEach(x => used.add(x)); return o.map(([f, b]) => `${f - c0},${b - b0}`).sort(); };
  const ols = design.insts.filter(i => isOutFF(i) && i.placed);
  for (const inst of ols) (sites[ologicKey(inst)] ??= []).push([inst.site, own(inst.tile)]);
  for (const inst of ols) for (const t of olHclk(design, inst)) hclks.add(t);
  for (const t of hclks) (hclk[t.replace(/_X\d+Y\d+$/, '')] ??= []).push([t, own(t)]);
  return { sites, hclk, rest: left.filter(x => !used.has(x)).map(x => x.join(',')) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node research/s6/ana-ologic6.mjs <dir> …'); process.exit(1); }
  const keys = { sites: {}, hclk: {} };
  for (const dir of dirs) {
    const l = ologicLeft(dir);
    for (const g of ['sites', 'hclk']) for (const [k, v] of Object.entries(l[g])) for (const [s, o] of v) ((keys[g][k] ??= {})[o.join(' ')] ??= []).push(`${path.basename(dir)}:${s}`);
    console.log(`${dir}: ${Object.values(l.sites).flat().length} OLOGIC2s, ${Object.values(l.hclk).flat().length} HCLK tiles, ${l.rest.length} bits elsewhere${l.rest.length ? `: ${l.rest.slice(0, 10).join(' ')}` : ''}`);
  }
  const out = { note: 'An OLOGIC2\'s output flip-flop (OMUX::OUTFF, OUTFFTYPE::FF, SRINIT_OQ::0, CLK0INV::CLK0), measured at every site of the XC6SLX16 and the XC6SLX45 (#2025): sites, its tile\'s bits by tile type and Y parity; hclk, the bit of the HCLK tile its clock passes in its column and clock region, by type; offsets from gridRegion.', sites: {}, hclk: {} };
  for (const g of ['sites', 'hclk']) for (const [k, by] of Object.entries(keys[g]).sort()) {
    const all = Object.entries(by);
    console.log(`${k}: ${all.map(([o, s]) => `[${o}] ×${s.length}${all.length > 1 ? ` (${s.slice(0, 2).join(' ')})` : ''}`).join('; ')}`);
    if (all.length === 1) out[g][k] = all[0][0] ? all[0][0].split(' ') : [];
  }
  fs.writeFileSync(new URL('../../bitdb/s6/s6-ologic.json', import.meta.url), `${JSON.stringify(out)}\n`);
}
