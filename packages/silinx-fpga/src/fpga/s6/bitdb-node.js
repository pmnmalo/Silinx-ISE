// Silinx toolchain - the Spartan-6's bit databases for Node (#732): reads bitdb/s6/*.json, measured in research/s6
// against ISE's bitgen (#724 … #1951), into the object fpga/s6/bitgen.js predictDesign reads. The files, per device
// (xc6slx16, xc6slx45) or shared (s6-*):
//   <device>-lut.json                where every slice's LUTs are
//   xc6slx16-slice[-nets|-full][-clexl13|-clexm].json   a slice's settings (offsets from its base; both parts')
//   xc6slx16-int[-cover|-own].json   the switch boxes' PIPs (both parts')
//   s6-pips-{other,io,clock,probe,flow}.json   the other tiles' PIPs
//   <device>-pips-cmt.json           the CMT paths' PIPs (per device: some of their bits are far from their tile, in the
//                                    CMT's column or the I/O words, #2025)
//   <device>-iob.json, s6-clocks.json         the pads' settings, a clock pad's selection
//   <device>-hard.json, s6-hard-base.json     the block RAMs' and DSP48A1s' settings and contents
//   <device>-cmt-{settings,input}.json   the DCMs' and PLLs'
//   s6-ologic.json                   an OLOGIC2's output flip-flop (#2025)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bitDbS6 } from './bitdb.js';

/** The folder of the Spartan-6's bit databases: packages/silinx-fpga/bitdb/s6. */
export const S6_DB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'bitdb', 's6');

/**
 * A part's databases ('xc6slx16csg324-3'): { part, slices: { lut, rounds, sliceX }, int, other: { pips }, iob,
 * clocks, hard, hardBase, cmtSettings, cmtInput, ologic } (null for a file the part has not); cmtInput: false leaves the
 * CMTs' input bits out (research/s6/ana-cmtinput6.mjs measures them). The browser's: bitdb.js fetchBitDbS6.
 */
export function loadBitDbS6(part, { dir = S6_DB_DIR, cmtInput = true } = {}) {
  const read = n => { const f = path.join(dir, `${n}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
  return bitDbS6(read, part, { cmtInput });
}
