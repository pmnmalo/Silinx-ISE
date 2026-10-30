// Acceptance test of the Spartan-6 bitstream writer (packages/silinx-fpga/src/fpga/s6/bitstream.js, #724): each .bit written by
// ISE's bitgen is read, and written again from its frame data, its header and its options (the CRC on or
// off, StartUpClk); the two files must be byte-identical, and every CRC the reader computes must be the
// one bitgen wrote. The files stay outside the repository (ISE's outputs).
//   node research/s6/check-writer6.mjs [--json out.json] a.bit [b.bit …]    exit status 1 if one differs
// --json records, per file, what Silinx's tests check the writer against without ISE (measured/format.json):
// the header, the options, the size, the SHA-256, the CRCs bitgen wrote and whether a frame is written again.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readBit6, writeBit6 } from '../../src/fpga/s6/bitstream.js';

/** The check of one .bit: { same, bytes, crc, startupClk, device, crcOk, firstDiff } (firstDiff: the first byte that differs). */
export function checkBit(iseBytes) {
  const ise = readBit6(iseBytes);
  if (!ise.device) throw new Error(`not an XC6SLX16 / XC6SLX45 bitstream (IDCODE ${ise.registers.IDCODE})`);
  const bytes = writeBit6({ fdri: ise.fdri, rewrites: ise.rewrites, name: ise.header.a, part: ise.header.b, date: ise.header.c, time: ise.header.d,
    crc: ise.crc, startupClk: ise.startupClk, device: ise.device });
  let firstDiff = -1;
  for (let i = 0; i < Math.max(bytes.length, iseBytes.length); i++) if (bytes[i] !== iseBytes[i]) { firstDiff = i; break; }
  return { same: firstDiff < 0, bytes: bytes.length, crc: ise.crc, startupClk: ise.startupClk, device: ise.device.device,
    crcOk: ise.crcChecks.every(x => x.expected === x.computed), rewrites: ise.rewrites.length, firstDiff };
}

/** The record of one ISE .bit (measured/format.json). */
export function recordBit(file, iseBytes) {
  const ise = readBit6(iseBytes);
  return { file, device: ise.device.device, header: ise.header, crc: ise.crc, startupClk: ise.startupClk, bytes: iseBytes.length,
    sha256: crypto.createHash('sha256').update(iseBytes).digest('hex'), crcs: ise.packets.filter(p => p.autoCrc !== undefined).map(p => p.autoCrc)
      .concat(ise.crc ? [ise.crcChecks.at(-1).expected] : []).map(x => x.toString(16).padStart(6, '0')), rewrites: ise.rewrites.map(r => r.far) };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let bad = 0;
  const args = process.argv.slice(2), j = args.indexOf('--json'), out = j >= 0 ? args.splice(j, 2)[1] : null, records = [];
  for (const f of args) {
    const bytes = new Uint8Array(fs.readFileSync(f));
    const r = checkBit(bytes);
    records.push(recordBit(path.basename(path.dirname(f)) + '/' + path.basename(f), bytes));
    if (!r.same || !r.crcOk) bad++;
    console.log(`${f}: ${r.same ? 'BYTE-IDENTICAL' : `differs from byte ${r.firstDiff}`} (${r.device}, ${r.bytes} bytes, CRC ${r.crc ? 'on' : 'off'}, ${r.startupClk}${r.rewrites ? `, ${r.rewrites} frame(s) written again` : ''}${r.crcOk ? '' : ', a CRC computed wrong'})`);
  }
  if (out) fs.writeFileSync(out, `${JSON.stringify({ note: 'ISE 14.7 bitgen outputs (research/s6/ise-format.sh, ise-s6.sh): size, SHA-256 and CRCs; the files stay outside the repository', bits: records }, null, 1)}\n`);
  process.exit(bad ? 1 : 0);
}
