// Spartan-6 .bit parsing for the measurements (#724): the header (as the Spartan-3E's: design, part,
// date, time) and the configuration packets of UG380, whose words are 16 bits (the Spartan-3E's 32):
//   Type 1: [15:13] = 001, [12:11] opcode (0 NOOP, 1 read, 2 write), [10:5] register, [4:0] word count
//   Type 2: [15:13] = 010, [12:11] opcode, [10:5] register, then the word count in 32 bits (two words)
// after the sync word AA99 5566. The register names are UG380's table; night 1 checks them on bitgen.
//
//   node research/s6/bits6.mjs <file.bit>     prints the header and the packets
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

/** The configuration registers of the Spartan-6 by address (UG380). */
export const REG6 = ['CRC', 'FAR_MAJ', 'FAR_MIN', 'FDRI', 'FDRO', 'CMD', 'CTL', 'MASK', 'STAT', 'LOUT', 'COR1', 'COR2', 'PWRDN_REG', 'FLR',
  'IDCODE', 'CWDT', 'HC_OPT_REG', null, 'CSBO', 'GENERAL1', 'GENERAL2', 'GENERAL3', 'GENERAL4', 'GENERAL5', 'MODE_REG', 'PU_GWE', 'PU_GTS',
  'MFWR', 'CCLK_FREQ', 'SEU_OPT', 'EXP_SIGN', 'RDBK_SIGN', 'BOOTSTS', 'EYE_MASK', 'CBC_REG'];
const regName = r => REG6[r] || `R${r}`;

/** The header fields of a .bit (a design, b part, c date, d time) and where the configuration data starts. */
export function readHeader(b) {
  const header = {};
  let p = 13;   // the preamble: 00 09, 9 bytes, 00 01
  while (p < b.length) {
    const key = String.fromCharCode(b[p]);
    if (key === 'e') return { header, start: p + 5, length: ((b[p + 1] << 24) | (b[p + 2] << 16) | (b[p + 3] << 8) | b[p + 4]) >>> 0 };
    if (!'abcd'.includes(key)) throw new Error(`not a .bit header (field '${key}' at byte ${p})`);
    const n = (b[p + 1] << 8) | b[p + 2];
    header[key] = String.fromCharCode(...b.subarray(p + 3, p + 3 + n - 1));
    p += 3 + n;
  }
  throw new Error('not a .bit header (no field e)');
}

/**
 * The packets of a Spartan-6 bitstream (bytes: the .bit file, or the configuration data alone from its
 * dummy words): { header, packets: [{ type, op, reg, n, data }] (data: the words, Uint16Array; a NOOP run
 * counted as one packet { noop: k }), fdri (the words written to FDRI, Uint16Array), registers: { name:
 * the last words written } }.
 */
export function readBit6(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let header = null, start = 0;
  if (b[0] === 0x00 && b[1] === 0x09) ({ header, start } = readHeader(b));
  let i = start;
  for (; i + 4 <= b.length; i += 2) if (b[i] === 0xaa && b[i + 1] === 0x99 && b[i + 2] === 0x55 && b[i + 3] === 0x66) break;
  if (i + 4 > b.length) throw new Error('no sync word AA995566');
  const w = [];
  for (let k = i + 4; k + 2 <= b.length; k += 2) w.push((b[k] << 8) | b[k + 1]);
  const packets = [], fdri = [], registers = {};
  for (let k = 0; k < w.length;) {
    const h = w[k++], type = h >>> 13, op = (h >>> 11) & 3, reg = (h >>> 5) & 0x3f;
    if (type === 1 && op === 0) {   // NOOP (0x2000)
      const last = packets[packets.length - 1];
      if (last?.noop) last.noop++; else packets.push({ noop: 1 });
      continue;
    }
    let n;
    if (type === 1) n = h & 0x1f;
    else if (type === 2) { n = ((w[k] << 16) | w[k + 1]) >>> 0; k += 2; }
    else { packets.push({ unknown: h, at: k - 1 }); continue; }
    const data = Uint16Array.from(w.slice(k, k + n));
    k += n;
    const name = regName(reg);
    packets.push({ type, op, reg: name, n, data });
    if (op === 2) {
      if (name === 'FDRI') for (const x of data) fdri.push(x);
      else registers[name] = [...data];
    }
  }
  return { header, packets, fdri: Uint16Array.from(fdri), registers };
}

/** A packet as one line: "W COR1 1: 3d00", "W FDRI 242450 words", "NOOP x8". */
export const packetLine = p => (p.noop ? `NOOP x${p.noop}` : p.unknown !== undefined ? `? ${p.unknown.toString(16).padStart(4, '0')}`
  : `${['NOOP', 'R', 'W', '?'][p.op]} ${p.reg} ${p.n}${p.n > 8 ? ' words' : `: ${[...p.data].map(x => x.toString(16).padStart(4, '0')).join(' ')}`}`);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const r = readBit6(fs.readFileSync(process.argv[2]));
  console.log(JSON.stringify(r.header));
  for (const p of r.packets) console.log(packetLine(p));
  console.log(`FDRI: ${r.fdri.length} words (${r.fdri.length * 16} bits)`);
}
