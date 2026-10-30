// Full project, stage A: decode the whole-chip map designs (gen-map.mjs: MAP0.bit, MAP1.bit, …, 4000
// slices each). Every LUT F holds (inverted, address order) the number of its own slice (marker
// 0101); find each number in the frames and derive the frame of each slice column and the bit offset
// of each slice row. Also the bitstream format of the empty design (EMPTY.bit: IDCODE, frame length,
// frames).
//   PART=xc3s250ecp132-4 node decode-map.mjs dir      (writes dir/map.json, and dir/lut.json: packages/silinx-fpga/bitdb/<device>-lut.json)
import fs from 'node:fs';
import { readBit } from './bits.mjs';
import { readBit as readBitFile } from '../../src/fpga/bitstream.js';

const dir = process.argv[2];
const slices = JSON.parse(fs.readFileSync(`${dir}/slices.json`, 'utf8'));
const found = new Map();   // site -> [{ frame, bit }]
let FW = 0, frames = 0;
for (let k = 0; fs.existsSync(`${dir}/MAP${k}.bit`); k++) {
  const B = readBit(`${dir}/MAP${k}.bit`);
  FW = B.flr + 1;
  const FB = FW * 32;
  const part = slices.slice(k * 4000, (k + 1) * 4000);
  const want = new Map(part.map((s, i) => [(0b0101 << 12) | (i + 1), s]));
  const bitAt = p => (B.fdri[p >> 5] >>> (31 - (p & 31))) & 1;
  frames = B.fdri.length / FW;
  for (let f = 0; f < frames; f++) {
    for (let o = 0; o + 16 <= FB; o += 16) {   // the LUTs sit at multiples of 16 bits
      let v = 0;
      for (let a = 0; a < 16; a++) v |= (1 - bitAt(f * FB + o + a)) << a;   // inverted, address order
      const s = want.get(v);
      if (s) (found.get(s.site) || found.set(s.site, []).get(s.site)).push({ frame: f, bit: o });
    }
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
const out = { frameWords: FW, frames, lutF: { colFrame: Object.fromEntries(colFrame), rowBit: Object.fromEntries(rowBit) }, lutGOffset: -16 };
if (fs.existsSync(`${dir}/EMPTY.bit`)) {
  const e = readBitFile(fs.readFileSync(`${dir}/EMPTY.bit`));
  const idcode = e.packets.find(p => p.reg === 'IDCODE')?.words[0];
  out.empty = { idcode: `0x${(idcode >>> 0).toString(16).padStart(8, '0')}`, part: e.header.b, frameWords: FW, frames: e.frames.length / FW };
  console.log('empty design:', JSON.stringify(out.empty), 'packets', e.packets.map(p => p.reg).join(' '));
}
fs.writeFileSync(`${dir}/map.json`, JSON.stringify(out, null, 1));
// the database file of the LUTs (packages/silinx-fpga/bitdb/<device>-lut.json)
const part = process.env.PART || 'xc3s250ecp132-4';
fs.writeFileSync(`${dir}/lut.json`, JSON.stringify({
  device: part.replace(/^(xc3s\d+e)([a-z]+\d+)-(\d+)$/, '$1-$3-$2'),
  source: `research/s3e-bitstream: gen-map.mjs + decode-map.mjs (one design per 4000 slices, all ${slices.length} slices), ISE 14.7 xdl P.20131013 + bitgen, measured 2026-10-10 (XC3S250E), 2026-10-11 (XC3S100E, XC3S500E, XC3S1200E)`,
  frameWords: FW, frames,
  note: 'LUT F of slice X Y: 16 consecutive bits starting at bit rowBit[Y] of frame colFrame[X], address order (A4A3A2A1), stored inverted. LUT G: the 16 bits before. Bit = word*32 + (31 - bit in word), frame data as written to FDRI.',
  lutF: out.lutF,
}, null, 1));
