// Silinx toolchain - the Spartan-6's I/O logic's settings for bitgen.js (#2025): an OLOGIC2's output flip-flop, as ISE
// packs an output register in its pad (db/s6-ologic.json, research/s6/ana-ologic6.mjs).
import { gridRegion } from './bitgen-regions.js';

/** An OLOGIC2 with its output flip-flop (OMUX::OUTFF). */
export const isOutFF = inst => inst.type === 'OLOGIC2' && inst.cfg.some(c => c.attr === 'OMUX' && c.value === 'OUTFF');

/** An OLOGIC2's key in db/s6-ologic.json's sites: its tile's type and its Y's parity (the IOI tile's two sites). */
export const ologicKey = inst => `${inst.tile.replace(/_X\d+Y\d+$/, '')} ${+inst.site.match(/Y(\d+)$/)[1] % 2}`;

/** The HCLK tiles an OLOGIC2's clock (CLK0's net) passes in its column (the same X) and clock region (16 rows). */
export function olHclk(design, inst) {
  const net = design.nets.find(n => n.inpins.some(p => p.inst === inst.name && p.pin === 'CLK0'));
  const [x, y] = inst.tile.match(/X(\d+)Y(\d+)$/).slice(1).map(Number);
  return [...new Set((net?.pips || []).map(p => p.tile).filter(t => {
    const m = /^HCLK.*_X(\d+)Y(\d+)$/.exec(t);
    return m && +m[1] === x && Math.floor(+m[2] / 16) === Math.floor(y / 16);
  }))];
}

/**
 * The bits of a design's OLOGIC2s with their output flip-flop (db/s6-ologic.json): their tiles' and their clock's HCLK
 * tiles'. { bits: Set 'frame,bit', unknown: [what was not measured] }; a setting other than the one measured is unknown.
 */
export function predictOlogic(design, device, dev, db) {
  const bits = new Set(), unknown = [];
  const add = (tile, rel) => { const [c0, b0] = gridRegion(device, dev, tile); for (const x of rel) { const [m, b] = x.split(',').map(Number); bits.add(`${c0 + m},${b0 + b}`); } };
  for (const inst of design.insts) {
    if (!isOutFF(inst) || !inst.placed) continue;
    const cfg = new Map(inst.cfg.map(c => [c.attr, c.value]));
    if (cfg.get('OUTFFTYPE') !== 'FF' || cfg.get('SRINIT_OQ') !== '0' || cfg.get('CLK0INV') !== 'CLK0' || ['OCEUSED', 'OSRUSED', 'OREVUSED'].some(a => (cfg.get(a) ?? '#OFF') !== '#OFF')) unknown.push(`OLOGIC2 ${inst.site} (an output flip-flop's settings not measured)`);
    const rel = db.sites[ologicKey(inst)];
    if (!rel) { unknown.push(`OLOGIC2 ${inst.site} (its tile type not measured)`); continue; }
    add(inst.tile, rel);
    for (const t of olHclk(design, inst)) {
      const h = db.hclk[t.replace(/_X\d+Y\d+$/, '')];
      if (h) add(t, h); else unknown.push(`${t.replace(/_X\d+Y\d+$/, '')} (an I/O clock's bit not measured)`);
    }
  }
  return { bits, unknown };
}
