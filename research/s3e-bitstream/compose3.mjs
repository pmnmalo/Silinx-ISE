// Feasibility test, step 4 (third try): empty + pads + the net's pin connections (no routing) +
// each routing switch in context -> compare with ISE's bitstream; write the .bit if equal.
import fs from 'node:fs';
import { readBit, diffBits } from './bits.mjs';
const E = readBit('e4/E.bit'), FULL = readBit('e4/FULL.bit'), PADS = readBit('e5/PADS.bit'), NOPIP = readBit('e6/NOPIP.bit');
const out = Uint32Array.from(E.fdri);
const pop = x => { let n = 0; while (x) { n += x & 1; x >>>= 1; } return n; };
const add = (a, b, label) => { let n = 0; for (let w = 0; w < out.length; w++) { const d = a[w] ^ b[w]; if (d) { out[w] ^= d; n += pop(d); } } console.log(`${label}: ${n} bit(s)`); };
add(PADS.fdri, E.fdri, 'pads (sw input, led output)');
add(NOPIP.fdri, PADS.fdri, 'the net\'s connections to the pads (no routing)');
const pips = fs.readFileSync(process.env.REF_XDL || 'ref/top.xdl', 'utf8').split('\n').filter(l => /^\s*pip /.test(l)).map(l => l.trim().replace(/ ,$/, ''));
pips.forEach((p, k) => add(FULL.fdri, readBit(`e5/M${k}.bit`).fdri, p));
const diff = diffBits(FULL.fdri, out, E.flr + 1);
console.log(`differences with ISE's bitstream: ${diff.length}`);
for (const d of diff) console.log(JSON.stringify(d));
if (!diff.length) {
  const bit = fs.readFileSync(process.env.REF_BIT || 'ref/top.bit');
  let i = bit.indexOf(Buffer.from([0xaa, 0x99, 0x55, 0x66])) + 4;
  for (; i < bit.length; i += 4) if ((bit.readUInt32BE(i) >>> 29) === 2) break;
  const built = Buffer.from(bit);
  for (let w = 0; w < out.length; w++) built.writeUInt32BE(out[w], i + 4 + w * 4);
  fs.writeFileSync('silinx-sw-led.bit', built);
  console.log(`silinx-sw-led.bit ${Buffer.compare(built, bit) === 0 ? 'is identical to ISE\'s top.bit, byte for byte' : 'differs from ISE\'s top.bit'}`);
}
