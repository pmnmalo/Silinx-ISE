// The tiles around the CLBs (I/O, corners, block-RAM interconnect, DCM) have the CLB's switch box:
// every PIP measured in both has the same bits at a fixed offset (the left I/O column 2 frames later,
// the top I/O row 16 bits further). Those tile types share the CLB's features (sameAs + shift, see
// makeDb in packages/silinx-fpga/src/fpga/bitgen.js); their own measurements that the CLB's give are dropped, and so are
// own measurements without bits where the CLB's have bits (bits given to a neighbouring tile by
// ana-pipdrop.mjs). A measurement that contradicts the CLB's is reported and kept. The I/O tiles'
// own pin wires are renamed to the CLB's (RENAME).
//   node share-sb.mjs [--check]      (rewrites packages/silinx-fpga/bitdb/s3e-tiles.json; --check: only the report)
import fs from 'node:fs';
import { shiftBit } from '../../packages/silinx-fpga/src/fpga/bitgen.js';

export const SHIFTS = {
  '0,0': ['BIOIS', 'BIBUFS', 'RIOIS', 'RIOIS_PCI', 'RIOIS_CLK_PCI', 'RIBUFS', 'RIBUFS_PCI', 'RIBUFS_CLK_PCI', 'RIBUFS_BRK', 'LR',
    'BRAM0_SMALL', 'BRAM1_SMALL', 'BRAM2_SMALL', 'BRAM3_SMALL', 'BRAM3_SMALL_BRK', 'DCM_BL_CENTER', 'DCM_BR_CENTER', 'DCM_TL_CENTER', 'DCM_TR_CENTER'],
  '2,0': ['LIOIS', 'LIOIS_PCI', 'LIOIS_CLK_PCI', 'LIOIS_BRK', 'LIBUFS', 'LIBUFS_PCI', 'LIBUFS_CLK_PCI', 'LL'],
  '0,16': ['TIOIS', 'TIBUFS', 'UR'],
  '2,16': ['UL'],
};
// the XC3S100E's tiles at the places of the missing DCMs and the XC3S1200E's DCMs on the left and right
// sides (stage F: their PIPs measured in the reference designs have the CLB's bits)
SHIFTS['0,0'].push('DCMAUX_BL_CENTER', 'DCMAUX_TL_CENTER', 'DCM_H_BL_CENTER', 'DCM_H_BR_CENTER', 'DCM_H_TL_CENTER', 'DCM_H_TR_CENTER');
// the tiles of the horizontal clock rows in the I/O and block-RAM columns are GCLKH tiles with other
// names (GCLKH_PCI_CE_N / _S, the block RAM's …UP_GCLKH… / …DN_GCLKH…): the same switches, one bit in
// the I/O rows at the top or bottom of the frame like GCLKH (the layout's typeRows, by the row);
// measured on the XC3S250E as offsets from their own row, which hold for one row only (stage F)
export const GCLKH_TYPES = ['GCLKH_PCI_CE_N', 'GCLKH_PCI_CE_S', 'BRAMSITE2_UP_GCLKH', 'BRAM2_UP_GCLKH_FEEDTHRU', 'BRAM2_UP_GCLKH_FEEDTHRUA',
  'BRAMSITE2_DN_GCLKH', 'BRAM2_DN_GCLKH_FEEDTHRU', 'BRAM2_DN_GCLKH_FEEDTHRUA'];
export const GCLKH_RENAME = [['BRAMSITE2_GCLKH_', 'GCLKH_']];
// the XC3S1200E's clock tiles (…_LL) are the others' with another name: the same wires and bits
// (CLKT_LL's switches and buffer settings measured in its reference designs have CLKT's bits)
export const ALIASES = { CLKT_LL: 'CLKT', CLKB_LL: 'CLKB', CLKC_LL: 'CLKC', CLKV_LL: 'CLKV' };
// the I/O tiles' own pin wires are the CLB's with another name (IOIS_X0 = X0, IOIS_F1_B0 = F1_B0,
// IOIS_VCC_WIRE = VCC_PINWIRE): every one measured in both has the same bits; not the clock pins
// (IOIS_CLK0-7: other bits than the CLB's CLK0-3)
export const RENAME = [['IOIS_VCC_WIRE', 'VCC_PINWIRE'], ['IOIS_(?!CLK)', '']];
export const IO_EMPTY = '^IOB\\d:(USED|PAD:|INBUF:|OUTBUF:|IMUX:|IDELMUX:|O1INV:|OMUX:|IOATTRBOX:|DRIVEATTRBOX:|SLEW:|PULL:)|->IOIS_STUB_';
// the terminal tiles (…TERM…) and block-RAM sites' tiles whose PIPs set no bits (pipsWithoutBits): the
// XC3S250E's, also those of which a rebuild (build-db.sh, #48) measured no PIP, and the other devices'
// (stage F): the same kind of tile
export const TERMINAL_TYPES = ['BTERM', 'BTERM2', 'BTERM3', 'BTERM4', 'BTERM4CLK', 'BTERMCLK', 'BTERMCLKA', 'BTERMCLKB',
  'TTERM', 'TTERM2', 'TTERM3', 'TTERM4', 'TTERM4CLK', 'TTERMCLK', 'TTERMCLKA',
  'LTERM', 'LTERM1', 'LTERM4', 'LTERM4B', 'LTERM4CLK', 'LTERMCLK', 'LTERMCLKA',
  'RTERM', 'RTERM1', 'RTERM4', 'RTERM4CLK', 'RTERM4CLKB', 'RTERMCLKA',
  'CNR_BTERM', 'CNR_TTERM', 'CNR_LBTERM', 'CNR_LTTERM', 'CNR_RBTERM', 'CNR_RTTERM', 'COB_TERM_B', 'COB_TERM_T', 'BRAMSITE2', 'BRAMSITE2_BRK',
  'TTERM1', 'TTERM4_BRAM2', 'BTERM1', 'BTERM4_BRAM2', 'LTERM2', 'LTERM3', 'RTERM2', 'RTERM3', 'DCM_H_TR_TERM', 'DCM_H_BR_TERM'];
const renamed = f => RENAME.reduce((x, [a, b]) => x.replace(new RegExp(a, 'g'), b), f);

if (process.argv[1] && process.argv[1].endsWith('share-sb.mjs')) {
  const check = process.argv.includes('--check');
  const file = new URL('../../packages/silinx-fpga/bitdb/s3e-tiles.json', import.meta.url);
  const db = JSON.parse(fs.readFileSync(file, 'utf8'));
  const clb = db.types.CENTER_SMALL.features;
  let same = 0, empty = 0, conflict = 0;
  for (const [sh, types] of Object.entries(SHIFTS)) {
    const [sf, sb] = sh.split(',').map(Number);
    for (const type of types) {
      const t = (db.types[type] ||= { features: {} });
      t.sameAs = 'CENTER_SMALL';
      if (sf || sb) t.shift = [sf, sb]; else delete t.shift;
      const io = /IOIS|IBUFS/.test(type);
      if (io) t.rename = RENAME; else delete t.rename;
      // the I/O sites' settings of an input or output with a standard, drive, slew and pull: their
      // bits are the pad's own features (184 measured, none with bits of the tile); the PIPs into
      // the stub wires of the input-only tiles (IOIS_STUB_…: 1260 measured, none with bits)
      if (io) t.emptyFeatures = IO_EMPTY; else delete t.emptyFeatures;
      // a side clock pad's own IOIS_Yk -> IOIS_Fk_B3 into its clock tile (the CLK_PCI tiles): the CLB table's bits, none
      // in ISE, which takes the dedicated path through the pad's IBUF instead (#641)
      if (/_CLK_PCI$/.test(type)) t.noRoutePips = '^IOIS_Y\\d->IOIS_F\\d_B3$'; else delete t.noRoutePips;
      for (const [f, bits] of Object.entries(t.features)) {
        const c = clb[io ? renamed(f) : f];
        if (!c || !/->|=-/.test(f)) continue;
        const want = c.map(s => shiftBit(s, sf, sb)).sort().join(' ');
        if (bits.slice().sort().join(' ') === want) { delete t.features[f]; same++; }
        else if (!bits.length && c.length) { delete t.features[f]; empty++; }
        else { conflict++; console.error(`${type} ${f}: [${bits.join(' ')}], the CLB's shifted [${want}]`); }
      }
    }
  }
  // the terminal tiles (…TERM…): their PIPs join the wires at the edges of the chip and set no bits;
  // the block-RAM sites' tiles (BRAMSITE2…): their PIPs only join the RAM's and multiplier's pins to
  // the interconnect (none of 500 measured has bits)
  // (thousands of measurements without bits; the few with bits were bits of the I/O tile measured
  // in the same frames)
  let term = 0;
  for (const type of TERMINAL_TYPES) db.types[type] ||= { features: {} };
  for (const [type, t] of Object.entries(db.types)) {
    if (!/TERM|^BRAMSITE2(_BRK)?$/.test(type)) continue;
    t.pipsWithoutBits = true;
    for (const f of Object.keys(t.features)) if (/->|=-/.test(f)) { if (t.features[f].length) term++; delete t.features[f]; }
  }
  // the horizontal clock rows' tiles in the I/O and block-RAM columns: GCLKH's switches
  let gsame = 0, gconf = 0;
  const gclkh = db.types.GCLKH.features;
  for (const type of GCLKH_TYPES) {
    const t = (db.types[type] ||= { features: {} });
    t.sameAs = 'GCLKH'; t.rename = GCLKH_RENAME;
    for (const [f, bits] of Object.entries(t.features)) {
      const g = gclkh[GCLKH_RENAME.reduce((x, [a, b]) => x.replace(new RegExp(a, 'g'), b), f)];
      if (!g) continue;
      const own = bits.map(b => b.replace(/,-?\d+$/, ',0')).sort().join(' ');
      if (own === g.slice().sort().join(' ') || !bits.length) { delete t.features[f]; gsame++; } else { gconf++; console.error(`${type} ${f}: [${bits.join(' ')}], GCLKH's [${g.join(' ')}]`); }
    }
  }
  console.log(`horizontal clock rows: ${gsame} own features as GCLKH's, ${gconf} different (kept)`);
  for (const [type, of] of Object.entries(ALIASES)) {
    const t = (db.types[type] ||= { features: {} });
    t.sameAs = of;
    // (set below for CLKT / CLKB)
    if (/^CLK[TB]_LL$/.test(type)) t.emptyFeatures = null;
  }
  // the global clock buffers' settings of a buffer driven from I0 set no bits (measured for 2 of the 8
  // buffers, BUFGMUX_X2Y1 and X2Y11, in gen-clock.mjs's design; the same settings for the others)
  for (const type of ['CLKT', 'CLKB', 'CLKT_LL', 'CLKB_LL']) if (db.types[type]) db.types[type].emptyFeatures = '^BUFGMUX_X\\d+Y\\d+:(USED|DISABLE_ATTR:LOW|GCLK_BUFFER:|GCLKMUX:|I0_USED:0|SINV:S_B)$';
  console.log(`terminal tiles: PIPs without bits (${term} measurements with bits dropped)`);
  console.log(`switch boxes shared: ${same} own features as the CLB's, ${empty} without bits dropped, ${conflict} different (kept)`);
  if (!check) fs.writeFileSync(file, JSON.stringify(db, null, 0).replace(/("[^"]+":\[[^\]]*\]),/g, '$1,\n'));
}
