// Feasibility test, step 2: from the Z / O / B0..B3 bitstreams, the bitstream position of each LUT
// memory bit: { lut, address, frame, bitInFrame, inverted }.
import { readBit } from './bits.mjs';

const dir = process.argv[2];
const Z = readBit(`${dir}/Z.bit`);
const FW = Z.flr + 1;   // words per frame
const bitAt = (fdri, pos) => (fdri[pos >> 5] >>> (31 - (pos & 31))) & 1;
const result = [];
for (const lut of ['f', 'g']) {
  const O = readBit(`${dir}/${lut}O.bit`).fdri;
  const B = [0, 1, 2, 3].map(j => readBit(`${dir}/${lut}B${j}.bit`).fdri);
  const all = [O, ...B];
  // every bit that differs from Z in any of the designs
  const changed = new Set();
  for (const s of all) for (let w = 0; w < Z.fdri.length; w++) { const x = s[w] ^ Z.fdri[w]; if (x) for (let b = 0; b < 32; b++) if ((x >>> (31 - b)) & 1) changed.add(w * 32 + b); }
  for (const pos of [...changed].sort((a, b) => a - b)) {
    const inv = bitAt(Z.fdri, pos);
    const okO = (bitAt(O, pos) ^ inv) === 1;
    const address = B.reduce((a, s, j) => a | ((bitAt(s, pos) ^ inv) << j), 0);
    const word = pos >> 5;
    result.push({ lut, address, frame: Math.floor(word / FW), bitInFrame: (word % FW) * 32 + (pos & 31), inverted: !!inv, consistent: okO });
  }
}
console.log(`frame length ${FW} words; ${result.length} bits`);
for (const r of result) console.log(JSON.stringify(r));
