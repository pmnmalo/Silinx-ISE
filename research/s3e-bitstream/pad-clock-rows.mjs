// The bits of the I/O columns' horizontal clock rows (GCLKH_PCI_CE_S / _N, the GCLKH rows' bits in the left and right
// I/O columns' frames) removed from the pads' own features (#671). #44 / #96 solved the IOB registers' settings per pad
// from designs whose registers were all clocked from line 4, while the writer had the left column's clock rows 2 frames
// early: the solution gave one pad of each row its own copy of the difference (R:REVINV:…: line 4's bits at the wrong
// frames cleared, at the right ones set), which clears line 5's bits in a design that uses it. With the clock rows at
// their measured frames (the layouts' typeCols, gen-layout.mjs) the routing sets those bits, and no pad feature does.
//   node pad-clock-rows.mjs [--check]      (rewrites db/<device>-<package>-pads.json; --check: only counts them)
import fs from 'node:fs';

const DB = new URL('./db/', import.meta.url);
const check = process.argv.includes('--check');
const ser = o => JSON.stringify(o, null, 0).replace(/("[^"]+":\[[^\]]*\]),/g, '$1,\n');
let total = 0;
for (const f of fs.readdirSync(DB).filter(n => /^xc3s\d+e-[a-z]+\d+-pads\.json$/.test(n)).sort()) {
  const dev = f.split('-')[0];
  const L = JSON.parse(fs.readFileSync(new URL(`${dev}-layout.json`, DB), 'utf8'));
  const right = Math.max(...Object.keys(L.cols).map(Number));
  const rows = new Set(Object.values({ ...L.typeRows.GCLKH_PCI_CE_N, ...L.typeRows.GCLKH_PCI_CE_S }));
  // (the I/O columns: 21 frames each)
  const inColumn = fr => [L.cols[0], L.cols[right]].some(c => fr >= c && fr < c + 21);
  const pads = JSON.parse(fs.readFileSync(new URL(f, DB), 'utf8'));
  let n = 0;
  for (const feats of Object.values(pads.padFeatures)) for (const [k, bits] of Object.entries(feats)) {
    const keep = bits.filter(b => { const [fr, bit] = b.replace('!', '').split(',').map(Number); return !(inColumn(fr) && rows.has(bit)); });
    n += bits.length - keep.length;
    feats[k] = keep;
  }
  total += n;
  console.log(`${f}: ${n} clock-row bits${check ? '' : ' removed'}`);
  if (!check && n) fs.writeFileSync(new URL(f, DB), ser(pads));
}
if (check && total) process.exit(1);
