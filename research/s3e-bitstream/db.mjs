// The bit database of a Spartan-3E device (db/*.json) for the experiments that build it: the loader is
// core/fpga/bitdb-node.js (the open flow's, #407), here with the experiments' default part (PART) and
// their helpers (edges, windowKeyOf). The files are described there.
import { splitPart, mergeTiles, withDcmClkinGclk, DCM_ROUTED } from '../../core/fpga/bitdb.js';
import { DB_DIR, dbPackages, hasBitDb, readDbFiles, loadDb as loadPartDb } from '../../core/fpga/bitdb-node.js';
import { tileOf, tileBase } from '../../core/fpga/bitgen.js';

// (the database's logic is core/fpga/bitdb.js, shared with the browser; its loader core/fpga/bitdb-node.js,
// the open flow's, #407: this module gives the experiments both, with their default part)
export { splitPart, mergeTiles, withDcmClkinGclk, DCM_ROUTED, DB_DIR, dbPackages, hasBitDb, readDbFiles };

/** The part of the experiments (environment PART, default the Basys2-250's XC3S250E-CP132). */
export const PART = process.env.PART || 'xc3s250ecp132-4';

/** The I/O column on the right and the I/O row at the top of a layout: { maxX, maxY }. */
export function edges(layout) {
  return { maxX: Math.max(...Object.keys(layout.cols).map(Number)), maxY: Math.max(...Object.keys(layout.rows).map(Number)) };
}

/** The bit database of a part (default PART), ready for bitgen() (core/fpga/bitdb-node.js loadDb). */
export const loadDb = (part = PART, opts = {}) => loadPartDb(part, opts);

/** The window of a tile in the frame data by tile name ("frame:bit" where it starts, from the layout;
 *  null when the layout does not place it, or for a device without a database yet): tiles with the same
 *  window (CLKL_X0Y17 and LIOIS_CLK_PCI_X0Y17) need different codewords in a PIP batch
 *  (separateWindows in lib.mjs, #48). */
export function windowKeyOf(part = PART) {
  if (!hasBitDb(splitPart(part).device)) return () => null;
  const db = loadDb(part);
  return t => { const tt = tileOf(t, db), b = tt && tileBase(tt, db); return b ? `${b.frame}:${b.bit}` : null; };
}
