// Full project, stage A: decode the whole-chip map design. Every LUT F holds (inverted, address
// order) the number of its own slice (marker 0101); find each number in the frames and derive
// the frame of each slice column and the bit offset of each slice row.
import fs from 'node:fs';
import { readBit } from './bits.mjs';

const dir = process.argv[2];
const B = readBit(`${dir}/MAP.bit`), FW = B.flr + 1, FB = FW * 32;
const slices = JSON.parse(fs.readFileSync(`${dir}/slices.json`, 'utf8'));
const want = new Map(slices.map((s, i) => [(0b0101 << 12) | (i + 1), s]));
const bitAt = p => (B.fdri[p >> 5] >>> (31 - (p & 31))) & 1;
const found = new Map();   // site -> [{ frame, bit }]
const frames = B.fdri.length / FW;
for (let f = 0; f < frames; f++) {
  for (let o = 0; o + 16 <= FB; o += 16) {   // the LUTs sit at multiples of 16 bits
    let v = 0;
    for (let a = 0; a < 16; a++) v |= (1 - bitAt(f * FB + o + a)) << a;   // inverted, address order
    const s = want.get(v);
    if (s) (found.get(s.site) || found.set(s.site, []).get(s.site)).push({ frame: f, bit: o });
  }
}
const missing = slices.filter(s => !found.has(s.site));
const multi = slices.filter(s => (found.get(s.site) || []).length > 1);
console.log(`${slices.length} slices: ${found.size} found, ${missing.length} missing, ${multi.length} found more than once`);
// frame of each slice column (X), bit of each slice row (Y)
const colFrame = new Map(), rowBit = new Map(), bad = [];
for (const s of slices) {
  const hit = found.get(s.site)?.[0];
  if (!hit) continue;
  if (colFrame.has(s.x) && colFrame.get(s.x) !== hit.frame) bad.push(`column X${s.x}: frames ${colFrame.get(s.x)} and ${hit.frame}`);
  if (rowBit.has(s.y) && rowBit.get(s.y) !== hit.bit) bad.push(`row Y${s.y}: bits ${rowBit.get(s.y)} and ${hit.bit}`);
  colFrame.set(s.x, hit.frame); rowBit.set(s.y, hit.bit);
}
console.log(`consistent (one frame per slice column, one bit per slice row): ${bad.length ? bad.slice(0, 5).join('; ') : 'yes'}`);
console.log('slice column X -> frame of LUT F:', JSON.stringify(Object.fromEntries([...colFrame].sort((a, b) => a[0] - b[0]))));
console.log('slice row Y -> first bit of LUT F:', JSON.stringify(Object.fromEntries([...rowBit].sort((a, b) => a[0] - b[0]))));
fs.writeFileSync(`${dir}/map.json`, JSON.stringify({ frameWords: FW, frames, lutF: { colFrame: Object.fromEntries(colFrame), rowBit: Object.fromEntries(rowBit) }, lutGOffset: -16 }, null, 1));
