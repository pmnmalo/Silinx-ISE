// Each bit of the pads' R:ICLK2INV:#OFF given to the pad it belongs to (#671, measured/fix-27iclk2-owners.json): #44 / #96
// solved the IOB registers' settings per pad from designs where both pads of every I/O tile had an input register, so a
// bit could go to the other pad of the tile or to a pad of the next one; ISE sets each only for its owner's register.
// Also (#897, measured/fix-897-owners.json) the bits of A3's register that #96 gave to B3, the two pads registered
// together in every design: a move's feature (feature, default R:ICLK2INV:#OFF) and its owner's (toFeature, default the
// same).
//   node pad-owners.mjs [--check]      (rewrites packages/silinx-fpga/bitdb/<device>-<package>-pads.json; --check: only counts the bits to move)
import fs from 'node:fs';

const DB = new URL('../../bitdb/', import.meta.url);
const check = process.argv.includes('--check');
const FEATURE = 'R:ICLK2INV:#OFF';
const ser = o => JSON.stringify(o, null, 0).replace(/("[^"]+":\[[^\]]*\]),/g, '$1,\n');
const moves = {};
for (const f of ['fix-27iclk2-owners.json', 'fix-897-owners.json']) {
  for (const [dp, list] of Object.entries(JSON.parse(fs.readFileSync(new URL(`./measured/${f}`, import.meta.url), 'utf8')).moves)) (moves[dp] ||= []).push(...list);
}
let total = 0;
for (const [dp, list] of Object.entries(moves)) {
  const file = new URL(`${dp}-pads.json`, DB);
  const pads = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (const { bit, from, to, feature = FEATURE, toFeature = feature } of list) {
    const src = pads.padFeatures[from]?.[feature] || [];
    if ((from === to && feature === toFeature) || !src.includes(bit)) continue;
    pads.padFeatures[from][feature] = src.filter(b => b !== bit);
    const dst = pads.padFeatures[to] ||= {};
    dst[toFeature] = [...new Set([...(dst[toFeature] || []), bit])].sort();
    n++;
  }
  total += n;
  console.log(`${dp}-pads.json: ${n} bits${check ? ' to move' : ' moved'}`);
  if (!check && n) fs.writeFileSync(file, ser(pads));
}
if (check && total) process.exit(1);
