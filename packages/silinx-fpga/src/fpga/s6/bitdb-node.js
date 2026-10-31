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
//   <device>-cmt-{settings,input}.json, xc6slx16-cmt-paths.json  the DCMs' and PLLs'
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** The folder of the Spartan-6's bit databases: packages/silinx-fpga/bitdb/s6. */
export const S6_DB_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'bitdb', 's6');

/**
 * A part's databases ('xc6slx16csg324-3'): { part, slices: { lut, rounds, sliceX }, int, other: { pips }, iob,
 * clocks, cmt, hard, hardBase, cmtSettings, cmtInput } (null for a file the part has not); cmtPaths: false leaves the
 * DCMs' and PLLs' whole measured paths out (research/s6/residual6.mjs --no-cmt-paths).
 */
export function loadBitDbS6(part, { dir = S6_DB_DIR, cmtPaths = true, cmtInput = true } = {}) {
  const read = n => { const f = path.join(dir, `${n}.json`); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
  const device = part.match(/^xc6slx\d+/)[0], dev = n => read(`${device}-${n}`);
  const pips = n => read(n)?.pips ?? {};
  return {
    part,
    slices: {
      lut: dev('lut'), rounds: { full: read('xc6slx16-slice-full'), nets: read('xc6slx16-slice-nets'), slice: read('xc6slx16-slice') },
      // a SLICEX's settings in the frames before its tile's (minor 20 of the column) by its tile's type
      sliceX: { CLEXL: read('xc6slx16-slice-full-clexl13'), CLEXM: read('xc6slx16-slice-full-clexm') },
    },
    int: { pips: read('xc6slx16-int').pips, cover: read('xc6slx16-int-cover').pips, own: read('xc6slx16-int-own').pips },
    // the other tiles' PIPs (the PIP drop), the I/O path's, the clocks', the probed ones, the CMT paths' and the open
    // flow's (#732) one at a time
    other: { pips: { ...pips('s6-pips-other'), ...pips('s6-pips-io'), ...pips('s6-pips-clock'), ...pips('s6-pips-probe'), ...(dev('pips-cmt')?.pips ?? {}), ...pips('s6-pips-flow') } },
    iob: dev('iob'), clocks: read('s6-clocks'), cmt: cmtPaths ? dev('cmt-paths') : null, hard: dev('hard'), hardBase: read('s6-hard-base'),
    cmtSettings: dev('cmt-settings'), cmtInput: cmtInput ? dev('cmt-input') : null,
  };
}
