// Stages S6-B … S6-D (#725, #726), the residual: every bit of a design ISE implemented, predicted from the databases
// (the slices: check-slice6.mjs; the INT-like tiles' PIPs: check-pips6.mjs; the other tiles' PIPs: db/s6-pips-other.json
// placed by gridRegion; the pads: db/<device>-iob.json, from each IOB's settings; a clock pad's selection and input
// bits: db/s6-clocks.json) and compared with ISE's bitstream,
// over the rows' frames and the I/O words, and the block RAM's frames with db/<device>-hard.json (#728: the block RAMs'
// and DSP48A1s' settings and contents, hard6.mjs). A bit left over goes to the tiles whose
// region holds it, by type (the I/O words: 'IOB words').
//   node research/s6/residual6.mjs <dir> …   (each with top.xdl and top.bit, e.g. night 1's impl-nexys3/*)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../src/xdl.js';
import { readBit6, bitFormat6, emptyFdri, FRAME_WORDS } from '../../src/fpga/s6/bitstream.js';
import { s6Device } from '../../../../test/s6-lib.mjs';
import { gridRegion } from './ana-pipdrop6.mjs';
export { padBit, predictIob, predictDesign } from '../../src/fpga/s6/bitgen.js';
import { loadBitDbS6 } from '../../src/fpga/s6/bitdb-node.js';
import { predictDesign } from '../../src/fpga/s6/bitgen.js';





/** The tile types whose regions hold a bit (gridRegion of every tile, indexed once per device). */
export function typesAt(device, dev, cache = typesAt.cache ??= new WeakMap()) {
  let index = cache.get(device);
  if (!index) {
    index = [];
    for (let k = 0; k < device.tileNames.length; k++) {
      const t = device.tileNames[k];
      if (/^NULL/.test(t)) continue;
      const [c0, b0, n, nb] = gridRegion(device, dev, t);
      index.push([c0, b0, n, nb, device.tileType(k)]);
    }
    cache.set(device, index);
  }
  return (f, b) => [...new Set(index.filter(([c0, b0, n, nb]) => f >= c0 && f < c0 + n && b >= b0 && b < b0 + nb).map(x => x[4]))].sort().join('+') || '?';
}


/** The databases predictDesign reads, for a bitstream's device (readBit6's); cmtInput: false leaves the CMTs' input bits out. */
export function residualDb(r6, { cmtInput = true } = {}) {
  const d = r6.device.device;
  return loadBitDbS6(`${d}${r6.device.part.slice(d.length - 2)}-3`, { cmtInput });
}

/** A bitstream's bits set (against the empty one): 'frame,bit' (the block RAM's frames only with withBram). */
export function setBits(r6, dev, withBram) {
  const empty = emptyFdri(dev), rows = dev.rows * dev.rowFrames * FRAME_WORDS, iobStart = (dev.rows * dev.rowFrames + dev.bramFrames) * FRAME_WORDS, have = new Set();
  for (let w = 0; w < r6.fdri.length; w++) {
    if (!withBram && w >= rows && w < iobStart) continue;
    const x = r6.fdri[w] ^ empty[w];
    if (x) for (let i = 0; i < 16; i++) if ((x >> (15 - i)) & 1) have.add(`${Math.floor(w / FRAME_WORDS)},${(w % FRAME_WORDS) * 16 + i}`);
  }
  return have;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), dirs = args.filter(a => !a.startsWith('--'));
  if (!dirs.length) { console.error('usage: node research/s6/residual6.mjs <dir> …'); process.exit(1); }
  const left = new Map(), extra = new Map(), unknown = new Map();
  for (const dir of dirs) {
    const bit = fs.readFileSync(path.join(dir, 'top.bit')), r6 = readBit6(bit), dev = bitFormat6(r6.device.part), db = residualDb(r6);
    const { device } = s6Device(db.part), design = parseXdl(fs.readFileSync(path.join(dir, 'top.xdl'), 'utf8'));
    const { bits, unknown: u } = predictDesign(design, device, dev, db);
    for (const [w, n] of u) unknown.set(w, (unknown.get(w) || 0) + n);
    const have = setBits(r6, dev, !!db.hard), w0 = typesAt(device, dev);
    const where = (f, b) => (f >= dev.rows * dev.rowFrames + dev.bramFrames ? 'IOB words' : f >= dev.rows * dev.rowFrames ? 'BRAM frames' : w0(f, b));
    let nl = 0, ne = 0;
    for (const x of have) if (!bits.has(x)) { const [f, b] = x.split(',').map(Number), t = where(f, b); left.set(t, [...(left.get(t) || []), `${path.basename(dir)} ${x}`]); nl++; }
    for (const x of bits) if (!have.has(x)) { const [f, b] = x.split(',').map(Number), t = where(f, b); extra.set(t, [...(extra.get(t) || []), `${path.basename(dir)} ${x}`]); ne++; }
    console.log(`${dir}: ${have.size} bits set, ${bits.size} predicted; ${nl} left over, ${ne} predicted and not set`);
  }
  const show = m => [...m].sort((a, b) => b[1].length - a[1].length).map(([t, l]) => `${t} ×${l.length} (${l.slice(0, 2).join('; ')})`).join('\n  ');
  console.log(`left over, by the tiles there:\n  ${show(left) || 'none'}`);
  console.log(`predicted and not set:\n  ${show(extra) || 'none'}`);
  if (unknown.size) console.log(`not in the databases: ${[...unknown].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([w, n]) => `${w} ×${n}`).join(', ')}`);
}
