// Feasibility test, step 2b: for each slice k, the bitstream position of its LUT F bits (s{k}O / s{k}B0..3 vs Z).
import fs from 'node:fs';
import { readBit } from './bits.mjs';
const dir = process.argv[2], names = JSON.parse(process.argv[3]);
const Z = readBit(`${dir}/Z.bit`), FW = Z.flr + 1;
const bitAt = (f, p) => (f[p >> 5] >>> (31 - (p & 31))) & 1;
names.forEach((name, k) => {
  const O = readBit(`${dir}/s${k}O.bit`).fdri, B = [0, 1, 2, 3].map(j => readBit(`${dir}/s${k}B${j}.bit`).fdri);
  const changed = new Set();
  for (const s of [O, ...B]) for (let w = 0; w < Z.fdri.length; w++) { const x = s[w] ^ Z.fdri[w]; if (x) for (let b = 0; b < 32; b++) if ((x >>> (31 - b)) & 1) changed.add(w * 32 + b); }
  const bits = [...changed].sort((a, b) => a - b).map(p => {
    const inv = bitAt(Z.fdri, p);
    return { a: B.reduce((acc, s, j) => acc | ((bitAt(s, p) ^ inv) << j), 0), frame: Math.floor((p >> 5) / FW), bit: ((p >> 5) % FW) * 32 + (p & 31), inv, okO: (bitAt(O, p) ^ inv) === 1 };
  });
  const frames = [...new Set(bits.map(b => b.frame))];
  const inOrder = bits.every((b, i) => b.a === i);
  console.log(`${name}: ${bits.length} bits, frames ${frames.join(',')}, bits ${bits[0]?.bit}..${bits.at(-1)?.bit}, address order ${inOrder ? 'linear' : JSON.stringify(bits.map(b => b.a))}, inverted ${bits.every(b => b.inv)}, consistent ${bits.every(b => b.okO)}`);
});
