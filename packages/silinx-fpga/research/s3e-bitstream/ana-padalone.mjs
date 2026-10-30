// #897: gen-padalone.mjs's designs, as ISE implemented them, against Silinx's writer: the bits that differ in each (ISE's
// routed top.xdl written by bitgen.js, against ISE's top.bit), "f,b" set by ISE only, "!f,b" by the writer only, and
// the pad features of the design that hold each bit somewhere in the database.
//   PART=xc3s500efg320-4 node ana-padalone.mjs dir…      (dir: a design folder with top.xdl, top.bit)
import fs from 'node:fs';
import { parseXdl } from '../../src/xdl.js';
import { frameData } from '../../src/fpga/bitgen.js';
import { readBit, diffFrames } from '../../src/fpga/bitstream.js';
import { loadDb } from '../../src/fpga/bitdb-node.js';
import { loadDeviceCache } from '../../src/fpga/device-node.js';
import { PART } from './db.mjs';

const db = loadDb(PART, { graph: loadDeviceCache(PART) });
// every bit of the pads' features: "f,b" -> [pad feature]
const holders = new Map();
for (const [pad, feats] of Object.entries(db.padFeats || {})) for (const [f, bits] of Object.entries(feats)) {
  for (const b of bits) { const k = b.replace('!', ''); if (!holders.has(k)) holders.set(k, []); holders.get(k).push(`${pad} ${f}`); }
}
for (const dir of process.argv.slice(2)) {
  const d = parseXdl(fs.readFileSync(`${dir}/top.xdl`, 'utf8'));
  const { frames, unknown } = frameData(d, db);
  const df = diffFrames(frames, readBit(fs.readFileSync(`${dir}/top.bit`)).frames, frames.frameWords || db.format.frameWords);
  console.log(`${dir.split('/').slice(-2).join('/')}: ${df.length} bits differ${unknown.length ? `, unknown ${unknown.map(u => `${u.tile} ${u.feature}`).join(', ')}` : ''}`);
  for (const x of df) {
    const k = `${x.frame},${x.bit}`;
    console.log(`  ${x.value ? '' : '!'}${k}  ${(holders.get(k) || []).slice(0, 4).join('; ')}`);
  }
}
