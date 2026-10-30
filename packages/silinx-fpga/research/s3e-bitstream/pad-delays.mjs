// The pads' input delay features (IFD:DLYn, IBUF:DLYn) as measured with each pad used on its own (#751,
// measured/fix-28-pad-delays.json, ana-paddly.mjs): #44 / #97 solved them from designs where every pad had an input, so
// a bit of one pad's delay could go to its neighbour's (the XC3S500E's 538,356 was D18's, given to E17 too; 46,31 was
// A3's register, given to B3's), and a design with only some pads used differed from ISE's bitstream. Each feature the
// measurement has replaces the database's; the others (the delays the database refuses on the global clock pins, #97;
// the registers never measured) stay as they are.
//   node pad-delays.mjs [--check]      (rewrites packages/silinx-fpga/bitdb/<device>-<package>-pads.json; --check: only counts the features to change)
import fs from 'node:fs';

const DB = new URL('../../bitdb/', import.meta.url);
const check = process.argv.includes('--check');
const ser = o => JSON.stringify(o, null, 0).replace(/("[^"]+":\[[^\]]*\]),/g, '$1,\n');
const { devices } = JSON.parse(fs.readFileSync(new URL('./measured/fix-28-pad-delays.json', import.meta.url), 'utf8'));
let total = 0;
for (const [dp, { pads }] of Object.entries(devices)) {
  const file = new URL(`${dp}-pads.json`, DB);
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  let n = 0;
  for (const [pad, feats] of Object.entries(pads)) {
    const have = db.padFeatures[pad] ||= {};
    for (const [f, bits] of Object.entries(feats)) {
      if (JSON.stringify(have[f]) === JSON.stringify(bits)) continue;
      have[f] = bits;
      n++;
    }
  }
  total += n;
  console.log(`${dp}-pads.json: ${n} features${check ? ' to change' : ' changed'}`);
  if (!check && n) fs.writeFileSync(file, ser(db));
}
if (check && total) process.exit(1);
