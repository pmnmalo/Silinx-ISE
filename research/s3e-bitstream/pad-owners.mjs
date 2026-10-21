// Each bit of the pads' R:ICLK2INV:#OFF given to the pad it belongs to (#671, measured/fix-27iclk2-owners.json): #44 / #96
// solved the IOB registers' settings per pad from designs where both pads of every I/O tile had an input register, so a
// bit could go to the other pad of the tile or to a pad of the next one; ISE sets each only for its owner's register.
//   node pad-owners.mjs [--check]      (rewrites db/<device>-<package>-pads.json; --check: only counts the bits to move)
import fs from 'node:fs';

const DB = new URL('./db/', import.meta.url);
const check = process.argv.includes('--check');
const FEATURE = 'R:ICLK2INV:#OFF';
const ser = o => JSON.stringify(o, null, 0).replace(/("[^"]+":\[[^\]]*\]),/g, '$1,\n');
const { moves } = JSON.parse(fs.readFileSync(new URL('./measured/fix-27iclk2-owners.json', import.meta.url), 'utf8'));
let total = 0;
for (const [dp, list] of Object.entries(moves)) {
  const file = new URL(`${dp}-pads.json`, DB);
  const pads = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (const { bit, from, to } of list) {
    const src = pads.padFeatures[from]?.[FEATURE] || [];
    if (from === to || !src.includes(bit)) continue;
    pads.padFeatures[from][FEATURE] = src.filter(b => b !== bit);
    const dst = pads.padFeatures[to] ||= {};
    dst[FEATURE] = [...new Set([...(dst[FEATURE] || []), bit])].sort();
    n++;
  }
  total += n;
  console.log(`${dp}-pads.json: ${n} bits${check ? ' to move' : ' moved'}`);
  if (!check && n) fs.writeFileSync(file, ser(pads));
}
if (check && total) process.exit(1);
