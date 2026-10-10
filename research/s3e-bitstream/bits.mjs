// Spartan-3E .bit parsing for the feasibility test: header, packets (Type 1 / Type 2), the frame
// data written to FDRI, and bit-level differences between two bitstreams.
import fs from 'node:fs';

const REG = ['CRC', 'FAR', 'FDRI', 'FDRO', 'CMD', 'CTL', 'MASK', 'STAT', 'LOUT', 'COR', 'MFWR', 'FLR', 'KEY', 'CBC', 'IDCODE'];

export function readBit(file) {
  const b = fs.readFileSync(file);
  let i = b.indexOf(Buffer.from([0xaa, 0x99, 0x55, 0x66]));
  if (i < 0) throw new Error('no sync word');
  i += 4;
  const words = [];
  for (; i + 4 <= b.length; i += 4) words.push(b.readUInt32BE(i));
  const packets = [];
  let lastReg = null, fdri = null, flr = null;
  for (let k = 0; k < words.length;) {
    const w = words[k++];
    const type = w >>> 29;
    if (type === 1) {
      const op = (w >>> 27) & 3, reg = (w >>> 13) & 0x3fff, n = w & 0x7ff;
      lastReg = reg;
      const data = words.slice(k, k + n); k += n;
      packets.push({ type, op, reg: REG[reg] || reg, n, data: n <= 4 ? data.map(x => x.toString(16)) : `[${n} words]` });
      if (REG[reg] === 'FLR' && n) flr = data[0];
      if (REG[reg] === 'FDRI' && n) fdri = (fdri || []).concat(data);
    } else if (type === 2) {
      const n = w & 0x7ffffff;
      const data = words.slice(k, k + n); k += n;
      packets.push({ type, reg: REG[lastReg] || lastReg, n: n });
      if (REG[lastReg] === 'FDRI') fdri = (fdri || []).concat(data);
    } else if (w === 0x20000000 || w === 0xffffffff) {
      // NOOP / dummy
    } else packets.push({ unknown: w.toString(16) });
  }
  return { packets, fdri: Uint32Array.from(fdri || []), flr };
}

/** The bits that differ between two FDRI streams: [{ word, bit, frame, wordInFrame, from, to }]. */
export function diffBits(a, b, frameWords) {
  const out = [];
  const n = Math.max(a.length, b.length);
  for (let w = 0; w < n; w++) {
    const x = (a[w] ?? 0) ^ (b[w] ?? 0);
    if (!x) continue;
    for (let bit = 31; bit >= 0; bit--) if ((x >>> bit) & 1) {
      out.push({ word: w, bit, frame: frameWords ? Math.floor(w / frameWords) : null, wordInFrame: frameWords ? w % frameWords : null, to: ((b[w] ?? 0) >>> bit) & 1 });
    }
  }
  return out;
}

if (process.argv[2] === 'info') {
  const r = readBit(process.argv[3]);
  console.log(JSON.stringify(r.packets, null, 0).replace(/\},\{/g, '},\n{'));
  console.log('FDRI words', r.fdri.length, 'FLR', r.flr);
}
if (process.argv[2] === 'diff') {
  const a = readBit(process.argv[3]), b = readBit(process.argv[4]);
  const fw = (a.flr ?? 0) + 1;
  console.log(JSON.stringify(diffBits(a.fdri, b.fdri, fw)));
}
