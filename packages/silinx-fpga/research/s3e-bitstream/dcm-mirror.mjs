// The settings of the other three DCMs from the top-left one's (stage D: every value measured on
// DCM_TL_CENTER): the four DCMs are mirror images in the frame data (stage F, measured with
// gen-sitevar.mjs on a design of the four DCMs, a subset of the values changed on two DCMs at a time:
// sv-dcm-a = bottom left + top right, sv-dcm-b = bottom right + top left). Relative to its tile, a bit
// (df, db) of the top-left DCM is (18 - df, db) in the top-right one (the column mirrored: 19 frames),
// (df, 63 - db) in the bottom ones (the row mirrored: 64 bits), both for the bottom right. Not mirrored:
// the pin inverters (PSCLKINV…, in the tile's own switch-box frames: the same bits in all four), and
// the bits in frame 37 of the top-left DCM (the last frame of the right DCM's column): one place per
// pair of DCMs, top and bottom, shared by the two (bits 240 / 242: the CLKFX input frequency range).
// The XC3S1200E's four side DCMs (DCM_H_…, measured the same way: sv-dcmh-a = bottom left + top right,
// every value; sv-dcmh-b = top left + bottom right, a subset) are the same four images.
import fs from 'node:fs';

// (the mirror functions are packages/silinx-fpga/src/fpga/bitdb.js's, shared with the browser)
import { MIRRORS, mirrorFeatures } from '../../src/fpga/bitdb.js';
export { MIRRORS, mirrorFeatures };

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/^.*\//, ''))) {
  const tl = JSON.parse(fs.readFileSync(new URL('../../bitdb/s3e-tiles.json', import.meta.url), 'utf8')).types.DCM_TL_CENTER.features;
  const args = process.argv.slice(2);
  if (args[0] === '--check') {
    let same = 0, diff = 0;
    for (const f of args.slice(1)) {
      for (const [type, t] of Object.entries(JSON.parse(fs.readFileSync(f, 'utf8')).types)) {
        const want = type === 'DCM_TL_CENTER' ? tl : mirrorFeatures(tl, type);
        for (const [k, bits] of Object.entries(t.features)) {
          if (!want[k]) { console.log(`${type} ${k}: not a feature of the top-left DCM`); diff++; continue; }
          const a = [...bits].sort().join(' '), b = [...want[k]].sort().join(' ');
          if (a === b) same++; else { diff++; console.log(`${type} ${k}: measured [${a}], mirror [${b}]`); }
        }
      }
    }
    console.log(`${same} features as the mirror, ${diff} differ`);
    process.exit(diff ? 1 : 0);
  }
  const types = {};
  for (const type of Object.keys(MIRRORS)) types[type] = { features: mirrorFeatures(tl, type) };
  console.log(JSON.stringify({ source: 'research/s3e-bitstream (see README.md, stage F): the top-left DCM\'s settings mirrored (dcm-mirror.mjs), the mirror checked on a subset of the values measured on each DCM (gen-sitevar.mjs, ana-sitevar.mjs, sitevar-features.mjs); ISE 14.7 xdl P.20131013 + bitgen; 2026-10-11', types }));
}
