// Stage S6-E (#727): a clock pad's bits from gen-clock6.mjs --bufg's designs ISE implemented (one clock from one pad
// through a BUFG at a fixed BUFGMUX). What residual6.mjs leaves of each design: a bit of the REGC tile's frame (bits 976
// … 1007: the pad's, the BUFGMUX's input selection; the same for its two pads' BUFGMUX only in that the bits differ),
// a bit in the pad's I/O words (its clock input, an offset from its first output bit, padBit), and the clock's spine
// bits (the PIP drop's).
//   node research/s6/ana-clock6.mjs <dir> [part]   (<dir>/b-<BUFGMUX>-<pad>/{top.xdl, top.bit})   -> db/s6-clocks.json
// { regcFrame: { device: frame }, pads: { pad: { regc: bit, iob: offset from padBit } } }
// The clock's spine PIPs the PIP drop could not take apart (a BUFG's always together): the bits its designs leave over
// in the centre's clock column (FAR column 0) on the first of them (in the XDL's order), the others none, as the I/O
// path's pairs: db/s6-pips-clock.json ({ pips: { 'TYPE from dir to': ['minor,bit'] } }, offsets from gridRegion).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { readBit6, emptyFdri, bitFormat6 } from '../../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { bitsOf } from './ana-iob6.mjs';
import { predictDesign, padBit } from './residual6.mjs';
import { loadDb } from './check-slice6.mjs';
import { s6Device } from '../../test/s6-lib.mjs';
import { gridRegion } from './ana-pipdrop6.mjs';

/** The REGC frame of a part (a clock's selection bits): the XC6SLX16's 1840 and the XC6SLX45's 5104, measured. */
export const REGC_FRAME = { xc6slx16: 1840, xc6slx45: 5104 };

/** A clock pad's bits from a design's leftover bits: { regc: bit of the REGC frame, iob: offset from padBit(pad, 0) }. */
export function clockPadBits(left, pad, regcFrame, iobStart) {
  const regc = left.filter(x => +x.split(',')[0] === regcFrame).map(x => +x.split(',')[1]);
  const [f0, b0] = padBit(pad, 0).split(',').map(Number);
  const iob = left.filter(x => +x.split(',')[0] >= iobStart).map(x => { const [f, b] = x.split(',').map(Number); return (f - f0) * 1040 + b - b0; });
  return { regc, iob };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
  if (!dir) { console.error('usage: node research/s6/ana-clock6.mjs <dir> [part]'); process.exit(1); }
  const read = n => JSON.parse(fs.readFileSync(new URL(`./db/${n}.json`, import.meta.url), 'utf8')), dv = part.replace(/csg.*/, ''), { device } = s6Device(part);
  const db = { part, slices: loadDb(dv), int: { pips: read('xc6slx16-int').pips, cover: read('xc6slx16-int-cover').pips, own: read('xc6slx16-int-own').pips },
    other: { pips: { ...read('s6-pips-other').pips, ...read('s6-pips-io').pips } }, iob: read(`${dv}-iob`) };
  const pads = {}, problems = [], spine = {};
  for (const n of fs.readdirSync(dir).filter(x => /^b-/.test(x)).sort()) {
    const [, , pad] = n.match(/^b-(\w+)-(\w+)$/), d = path.join(dir, n);
    const x = parseXdl(fs.readFileSync(path.join(d, 'top.xdl'), 'utf8')), r = readBit6(fs.readFileSync(path.join(d, 'top.bit'))), dev = bitFormat6(r.device.part);
    const { bits, unknown } = predictDesign(x, device, dev, db), left = [...bitsOf(r.fdri, emptyFdri(dev))].filter(q => !bits.has(q));
    // the spine's PIPs not known: the leftover bits in the centre's clock column go to the first of them
    const open = x.nets.flatMap(net => net.pips || []).filter(q => unknown.has(`${q.tile.replace(/_X\d+Y\d+$/, '')} ${q.from} ${q.dir} ${q.to}`));
    if (open.length) {
      const first = open[0], key = q => `${q.tile.replace(/_X\d+Y\d+$/, '')} ${q.from} ${q.dir} ${q.to}`, [c0, b0] = gridRegion(device, dev, first.tile);
      const centre = left.map(q => q.split(',').map(Number)).filter(([f]) => f % dev.rowFrames < dev.columns[0]);
      if (!(key(first) in spine)) spine[key(first)] = centre.map(([f, b]) => `${f - c0},${b - b0}`).sort();
      for (const q of open.slice(1)) if (!(key(q) in spine)) spine[key(q)] = [];
    }
    const b = clockPadBits(left, db.iob.pads[pad], REGC_FRAME[dv], dev.rows * dev.rowFrames + dev.bramFrames);
    if (b.regc.length !== 1 || b.iob.length !== 1) problems.push(`${n}: REGC ${b.regc.join(' ')}, I/O ${b.iob.join(' ')}`);
    pads[pad] = { regc: b.regc[0], iob: b.iob[0] };
  }
  const offsets = new Set(Object.values(pads).map(p => p.iob));
  console.log(`${part}: ${Object.keys(pads).length} clock pads; their I/O offsets ${[...offsets].join(' ')}; ${problems.length} problems${problems.length ? `: ${problems.join('; ')}` : ''}`);
  fs.writeFileSync(new URL('./db/s6-clocks.json', import.meta.url), `${JSON.stringify({ regcFrame: REGC_FRAME, pads })}\n`);
  fs.writeFileSync(new URL('./db/s6-pips-clock.json', import.meta.url), `${JSON.stringify({ note: 'A BUFG spine\'s PIPs the PIP drop could not take apart (#727): its leftover bits in the centre\'s clock column on the first, the others none; offsets from gridRegion.', pips: spine })}\n`);
  console.log(`spine PIPs: ${Object.keys(spine).length}, ${Object.values(spine).filter(b => b.length).length} with bits`);
}
