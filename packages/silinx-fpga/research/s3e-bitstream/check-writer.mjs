// Acceptance test of the bitstream writer (packages/silinx-fpga/src/fpga/bitgen.js): for designs implemented by ISE,
// the .bit written from ISE's routed XDL is compared byte for byte with the .bit ISE's bitgen wrote
// from the same XDL (same options: -g CRC:Disable, or the default with CRC). The header's name,
// date and time are taken from ISE's file. Differences are listed per bit with their tile.
//   node check-writer.mjs a.xdl a.bit [a.xdl a.crc.bit …]
import fs from 'node:fs';
import { parseXdl } from '../../src/xdl.js';
import { readBit, diffFrames, corValue } from '../../src/fpga/bitstream.js';
import { bitgen, tileOf, tileBase } from '../../src/fpga/bitgen.js';
import { loadDb } from './db.mjs';

// the database of each design's part (from its XDL header), loaded once per part
const dbs = new Map();
const dbOf = part => { if (!dbs.has(part)) dbs.set(part, loadDb(part)); return dbs.get(part); };
const args = process.argv.slice(2);
const verbose = args.includes('-v');
const files = args.filter(a => a !== '-v');
for (let i = 0; i < files.length; i += 2) {
  const design = parseXdl(fs.readFileSync(files[i], 'utf8'));
  const iseBytes = fs.readFileSync(files[i + 1]);
  const ise = readBit(iseBytes);
  const crc = !(ise.cor & 0x20000000);
  const startupClk = (ise.cor & 0x00018000) === 0x00010000 ? 'JtagClk' : (ise.cor & 0x00018000) === 0x00008000 ? 'UserClk' : 'Cclk';
  const db = dbOf(design.part);
  const { bytes, unknown } = bitgen(design, db, { name: ise.header.a, date: ise.header.c, time: ise.header.d, crc, startupClk });
  const same = Buffer.compare(Buffer.from(bytes), iseBytes) === 0;
  const d = diffFrames(readBit(bytes).frames, ise.frames, db.format.frameWords);
  console.log(`${files[i + 1]}: ${same ? 'BYTE-IDENTICAL' : `${d.length} frame bits differ`} (${bytes.length} bytes, CRC ${crc ? 'on' : 'off'}, ${unknown.length} features not in the database)`);
  if (!same && verbose) {
    for (const u of unknown.slice(0, 40)) console.log(`  unknown ${u.tile} ${u.feature}`);
    for (const x of d.slice(0, 60)) console.log(`  frame ${x.frame} bit ${x.bit}: ISE ${x.value}`);
  }
}
