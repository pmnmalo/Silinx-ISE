// The layout of a Spartan-3E's frame data (db/<device>-layout.json): where every tile starts, and the
// bitstream format (IDCODE, frame length, frames). Tiles are named TYPE_X<x>Y<y>; tiles with the same
// x share a column of frames, tiles with the same y a row of bits (special tile types have their own
// tables in typeCols / typeRows).
//   cols[x]: first frame of column x. Every tile column but the I/O columns has CLB tiles (the
//            block-RAM columns at their top and bottom), so the chip map of stage A (gen-map.mjs,
//            decode-map.mjs: the frame of the LUTs of the column's even slices) gives them all; the
//            left I/O column is the 21 frames before the first CLB column, the right one the 21
//            frames after the last CLB column of the main block (the block-RAM columns follow it)
//   rows[y]: first bit of row y (CLB rows: 64 bits; the I/O rows at the top and bottom: 80 bits)
//   defaults: the bits set in the frame data of an empty design
//   PART=xc3s250ecp132-4 node gen-layout.mjs map.json EMPTY.bit [extra.json] > db/xc3s250e-layout.json
import fs from 'node:fs';
import { readBit, diffFrames } from '../../core/fpga/bitstream.js';
import { loadDeviceCache } from '../../core/fpga/device-node.js';

const [mapFile, emptyBit, extra] = process.argv.slice(2);
const part = process.env.PART || 'xc3s250ecp132-4';
const map = JSON.parse(fs.readFileSync(mapFile, 'utf8'));
const lut = map.lutF;
const dev = loadDeviceCache(part);
// the tiles of the device by type: [x, y]
const tilesOf = {};
let maxX = 0, maxY = 0;
for (const name of dev.tileNames) {
  const m = /^(.*)_X(\d+)Y(\d+)$/.exec(name);
  if (!m) continue;
  (tilesOf[m[1]] ||= []).push([+m[2], +m[3]]);
  if (m[1] === 'CLB') { maxX = Math.max(maxX, +m[2]); maxY = Math.max(maxY, +m[3]); }
}
const cols = {}, rows = {};
for (let x = 1; x <= maxX; x++) cols[x] = lut.colFrame[2 * (x - 1)];
for (let y = 1; y <= maxY; y++) rows[y] = lut.rowBit[2 * (y - 1) + 1] - 16;
rows[0] = lut.rowBit[0] + 16; rows[maxY + 1] = 0;
// the I/O columns: 21 frames each; the frames before the left one hold the global clock columns
cols[0] = cols[1] - 21;
const starts = new Set(Object.values(cols));
let f = cols[1];
while (starts.has(f)) f += 19;
cols[maxX + 1] = f;
// tiles of the global clock network with one instance: their bits are in the frames before the left
// I/O column (the buffers at the bottom and top in the I/O rows; the centre: GCLKVML frame 0, GCLKVMR
// frame 1, CLKC frame 2, in the row above theirs). The XC3S1200E's types have the suffix _LL.
const typeCols = {}, typeRows = {}, typeFrames = {}, typeBits = {};
const one = t => (tilesOf[t] || tilesOf[`${t}_LL`] || [])[0];
const typeName = t => (tilesOf[t] ? t : `${t}_LL`);
for (const [type, frame, frames, bitOf, bits] of [['CLKB', 0, 3, () => rows[0], 80], ['CLKT', 0, 3, () => 0, 80], ['CLKC', 2, 1, y => rows[y + 1], 128],
  ['GCLKVML', 0, 1, y => rows[y + 1], 128], ['GCLKVMR', 1, 1, y => rows[y + 1], 128]]) {
  const xy = one(type);
  if (!xy) continue;
  const tn = typeName(type);
  typeCols[tn] = { [xy[0]]: frame }; typeRows[tn] = { [xy[1]]: bitOf(xy[1]) }; typeFrames[tn] = frames; typeBits[tn] = bits;
}
// the horizontal clock rows (GCLKH): one bit in the I/O rows at the top and bottom of the frame, the
// outermost row first (XC3S250E: Y29 bit 3, Y21 bit 2, Y13 bit FB - 2, Y5 bit FB - 1; XC3S100E: Y15
// bit 3, Y7 bit FB - 1; XC3S500E the same as the XC3S250E). The XC3S1200E's upper rows start one bit
// further (Y54 bit 4, Y38 bit 3; its lower rows as the others'): measured in its reference designs.
const TOP = /^xc3s1200e/.test(part) ? 4 : 3;
const FB = map.frameWords * 32;
const centre = one('CLKC')[1];
const gy = [...new Set((tilesOf.GCLKH || []).map(([, y]) => y))];
typeRows.GCLKH = {};
gy.filter(y => y > centre).sort((a, b) => b - a).forEach((y, i) => { typeRows.GCLKH[y] = TOP - i; });
gy.filter(y => y < centre).sort((a, b) => a - b).forEach((y, i) => { typeRows.GCLKH[y] = FB - 1 - i; });
typeBits.GCLKH = 1;
// the GCLKH tiles of the I/O and block-RAM columns (share-sb.mjs GCLKH_TYPES): the same bits by row
for (const type of Object.keys(tilesOf)) if (/^(GCLKH_PCI_CE_[NS]|BRAM\w*_(UP|DN)_GCLKH\w*)$/.test(type)) {
  typeRows[type] = Object.fromEntries(tilesOf[type].map(([, y]) => [y, typeRows.GCLKH[y]]));
  typeBits[type] = 1;
}
// (in the left I/O column, X0, the clock rows' switches are GCLKH's 2 frames further: the column's two extra
// frames come first; in the right one at GCLKH's frames, #671: every switch of every row measured)
for (const type of ['GCLKH_PCI_CE_N', 'GCLKH_PCI_CE_S']) if (tilesOf[type]) typeCols[type] = Object.fromEntries(tilesOf[type].map(([x]) => [x, cols[x] + (x === 0 ? 2 : 0)]));
// the XC3S1200E's long-line splitters at the centre row (CLKH_LL): one bit each in the I/O rows of the
// frame, stored as bits of the whole frame (row bit 0; clkh-ll.mjs)
if (tilesOf.CLKH_LL) { typeRows.CLKH_LL = Object.fromEntries(tilesOf.CLKH_LL.map(([, y]) => [y, 0])); typeBits.CLKH_LL = FB; }
const empty = readBit(fs.readFileSync(emptyBit));
const defaults = diffFrames(new Uint32Array(empty.frames.length), empty.frames, map.frameWords).map(d => [d.frame, d.bit]);
const idcode = empty.packets.find(p => p.reg === 'IDCODE').words[0];
const brkRows = [...new Set((tilesOf.CLB || []).filter(([x, y]) => dev.tileType(dev.tile(`CLB_X${x}Y${y}`)) === 'CENTER_SMALL_BRK').map(([, y]) => y))].sort((a, b) => a - b);
const more = extra ? JSON.parse(fs.readFileSync(extra, 'utf8')) : {};
const out = {
  device: part.replace(/^(xc3s\d+e)([a-z]+\d+)-(\d+)$/, '$1-$3-$2'),
  source: 'research/s3e-bitstream: gen-layout.mjs from the chip map (gen-map.mjs, decode-map.mjs), the empty design and the device grid; ISE 14.7 xdl P.20131013 + bitgen; measured 2026-10-10 (XC3S250E), 2026-10-11 (XC3S100E, XC3S500E, XC3S1200E)',
  note: 'Tile TYPE_X<x>Y<y> starts at frame cols[x] (typeCols[TYPE][x] for special types) and bit rows[y]. CLB tiles (CLB_X<x>Y<y>) are of type CENTER_SMALL, CENTER_SMALL_BRK in rows brkRows. defaults: [frame, bit] set in the frame data of an empty design. idcode, frameWords, frames: the bitstream format (an empty design written by bitgen).',
  idcode: `0x${(idcode >>> 0).toString(16).padStart(8, '0')}`,
  frameWords: map.frameWords, frames: empty.frames.length / map.frameWords,
  brkRows,
  cols, rows, typeCols, typeRows, typeFrames, typeBits,
  defaults,
  ...more,
};
console.log(JSON.stringify(out, null, 1).replace(/\[\n\s+(-?\d+),\n\s+(-?\d+)\n\s+\]/g, '[$1, $2]'));
