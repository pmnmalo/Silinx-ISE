// Stage F: the XC3S1200E's long-line splitters (CLKH_LL tiles, the row of the centre): each of the 24
// vertical long lines can be joined across the centre in either direction, one bit each, in the I/O
// row at the top or at the bottom of the frame (measured with gen-pipcover.mjs --types CLKH_LL --long
// 1, ana-pipdrop.mjs). The features: frame offset from the tile's column, the bit of the frame (layout
// typeRows CLKH_LL: bit 0), for packages/silinx-fpga/bitdb/xc3s1200e-tiles.json (the bottom bits are the device's own).
//   PART=xc3s1200efg320-4 node clkh-ll.mjs dir/pips.json > clkh-ll.json
import fs from 'node:fs';
import { loadDb } from './db.mjs';

const db = loadDb();
const seen = new Map();
for (const p of JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).pips) {
  const m = /^CLKH_LL_X(\d+)Y\d+$/.exec(p.tile);
  if (!m) continue;
  const pat = p.bits.map(([f, b, v]) => `${v ? '' : '!'}${f - db.layout.cols[m[1]]},${b}`).sort().join(' ');
  const f = p.feature || `${p.from}->${p.to}`;
  const s = seen.get(f) || seen.set(f, new Map()).get(f);
  s.set(pat, (s.get(pat) || 0) + 1);
}
const feats = {};
let bad = 0;
for (const [f, s] of [...seen].sort()) {
  if (s.size !== 1) { bad++; console.error(`different in different tiles: ${f}: ${[...s].map(([p, n]) => `[${p}]x${n}`).join(' | ')}`); continue; }
  feats[f] = [...s.keys()][0].split(' ');
}
console.error(`${Object.keys(feats).length} PIPs of CLKH_LL, ${bad} different in different tiles`);
console.log(JSON.stringify({ source: 'research/s3e-bitstream stage F: gen-pipcover.mjs --types CLKH_LL --long 1 on the XC3S1200E (298 PIPs in 38 tiles), ana-pipdrop.mjs, clkh-ll.mjs; ISE 14.7 xdl P.20131013 + bitgen; 2026-10-11', types: { CLKH_LL: { features: feats } } }));
