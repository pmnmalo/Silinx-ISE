// Stage S6-E2 (#1951): the bits of the PIPs gen-cmtdrop6.mjs dropped one at a time: each drop's bitstream against its
// design's base, all its changed bits that PIP's (one PIP per drop: no region to tell apart), as offsets from its
// tile's region (gridRegion; the CLKC tile's bits are far from it, its region the same in every design). A bit two
// PIPs share by an OR (another of the group still there) does not change: those are cmt6.mjs's rules.
//   node research/s6/ana-cmtdrop6.mjs <dir> [part] [out]   -> packages/silinx-fpga/bitdb/s6/<out: <device>-pips-cmt>.json ({ pips: { 'TYPE from dir to': ['minor,bit'] } })
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBit6, bitFormat6 } from '../../src/fpga/s6/bitstream.js';
import { gridRegion, diffBits } from './ana-pipdrop6.mjs';
import { s6Device } from '../../../../test/s6-lib.mjs';

/** A one-PIP drop's bits: the changed bits as offsets from the PIP's tile region. */
export function dropBits(device, dev, base, drop, tile) {
  const [c0, b0] = gridRegion(device, dev, tile);
  return diffBits(base, drop).map(([f, b]) => `${f - c0},${b - b0}`).sort();
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // (out: the database written, <device>-pips-cmt by default (#2025: per device, some of the bits are far from the tile); s6-pips-flow for gen-flowdrop6.mjs's drops, #732)
  const [dir, part = 'xc6slx16csg324-3', out = `${part.match(/^xc6slx\d+/)[0]}-pips-cmt`] = process.argv.slice(2);
  if (!dir) { console.error('usage: node research/s6/ana-cmtdrop6.mjs <dir> [part]'); process.exit(1); }
  const { device } = s6Device(part), dev = bitFormat6(part.replace(/^xc/, '').replace(/-\d$/, '')), pips = {};
  let missing = 0;
  for (const n of fs.readdirSync(dir).filter(f => /-p\d+\.drop\.json$/.test(f))) {
    const name = n.replace(/\.drop\.json$/, ''), design = name.replace(/-p\d+$/, ''), bit = f => path.join(dir, f);
    if (!fs.existsSync(bit(`${name}.drop.bit`)) || !fs.existsSync(bit(`${design}.base.bit`))) { missing++; continue; }
    const [{ tile, pip }] = JSON.parse(fs.readFileSync(bit(n), 'utf8'));
    pips[`${tile.replace(/_X\d+Y\d+$/, '')} ${pip}`] = dropBits(device, dev, readBit6(fs.readFileSync(bit(`${design}.base.bit`))).fdri, readBit6(fs.readFileSync(bit(`${name}.drop.bit`))).fdri, tile);
  }
  console.log(`${Object.keys(pips).length} PIPs, ${Object.values(pips).filter(b => b.length).length} with bits; ${missing} drops without a bitstream`);
  const note = /-pips-cmt$/.test(out) ? 'The CMT paths\' PIPs dropped one at a time in context (#1951)' : 'The open flow\'s PIPs not measured before, dropped one at a time in context (#732)';
  fs.writeFileSync(new URL(`../../bitdb/s6/${out}.json`, import.meta.url), `${JSON.stringify({ note: `${note}; offsets from gridRegion.`, pips })}\n`);
}
