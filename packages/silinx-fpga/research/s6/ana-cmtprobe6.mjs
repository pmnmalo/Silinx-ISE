// Stage S6-E2 (#1951): the probed PIPs' bits (gen-cmtprobe6.mjs's designs ISE turned into bitstreams): each design's
// bits, by the region of the probed tiles (bitsByTile: the tile whose column and band hold a bit, else the nearest),
// as offsets from the tile's region: its PIP's. A PIP probed in tiles of other parts too: the same bits (checked).
//   node research/s6/ana-cmtprobe6.mjs <dir>[=part] …   -> packages/silinx-fpga/bitdb/s6/s6-pips-probe.json ({ pips: { 'TYPE from dir to':
//     ['minor,bit'] } }, read by residual6.mjs with the PIP drop's)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBit6, emptyFdri, bitFormat6 } from '../../src/fpga/s6/bitstream.js';
import { gridRegion, diffBits, bitsByTile } from './ana-pipdrop6.mjs';
import { s6Device } from '../../../../test/s6-lib.mjs';

/**
 * The tile types whose probed bits are not their bits in a design: REG_V_HCLK's BUFH route-throughs (the BUFH's) and
 * its spine muxes (an encoding the other selections share); they stay the PIP drop's.
 */
export const CONTEXT = /^REG_V_HCLK /;

/** A probe design's PIPs' bits: { 'TYPE pip': ['minor,bit'] }, and the bits near no probed tile. */
export function probeBits(device, dev, fdri, probes) {
  const regions = Object.fromEntries(Object.keys(probes).map(t => [t, gridRegion(device, dev, t)]));
  const { out, unplaced } = bitsByTile(diffBits(fdri, emptyFdri(dev)), regions);
  return { pips: Object.fromEntries(Object.entries(probes).map(([t, p]) => [`${t.replace(/_X\d+Y\d+$/, '')} ${p}`, [...(out[t] ?? [])].sort()])), unplaced };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node research/s6/ana-cmtprobe6.mjs <dir>[=part] …'); process.exit(1); }
  const pips = {}, problems = [];
  let unplaced = 0;
  for (const d of dirs) {
    const [dir, part = 'xc6slx16csg324-3'] = d.split('='), { device } = s6Device(part), dev = bitFormat6(part.replace(/^xc/, '').replace(/-\d$/, ''));
    for (const n of fs.readdirSync(dir).filter(f => /\.cp\d+\.bit$/.test(f))) {
      const probes = JSON.parse(fs.readFileSync(path.join(dir, n.replace(/\.bit$/, '.json')), 'utf8'));
      const r = probeBits(device, dev, readBit6(fs.readFileSync(path.join(dir, n))).fdri, probes);
      unplaced += r.unplaced.length;
      for (const [k, b] of Object.entries(r.pips)) {
        if (CONTEXT.test(k)) continue;
        if (k in pips && pips[k].join(' ') !== b.join(' ')) problems.push(`${k}: ${pips[k].join(' ')} and ${b.join(' ')}`);
        pips[k] = b;
      }
    }
  }
  console.log(`${Object.keys(pips).length} PIPs probed, ${Object.values(pips).filter(b => b.length).length} with bits; ${unplaced} bits near no probed tile; ${problems.length} problems${problems.length ? `: ${problems.slice(0, 4).join('; ')}` : ''}`);
  fs.writeFileSync(new URL('../../bitdb/s6/s6-pips-probe.json', import.meta.url), `${JSON.stringify({ note: 'The PIPs the PIP drop could not take apart, probed one by one on TIEOFF nets (#1951); offsets from gridRegion.', pips })}\n`);
}
