// Silinx - the sites of a Spartan-6 device for the placer (#729), from its description (packages/silinx-fpga/devices/
// xc6slx*.json.gz, fpga/device.js Device; browser + Node).
//
//   s6Sites(device) -> {
//     part, rows, cols,
//     slices: Map name -> { name, kind: 'X' | 'L' | 'M', x, y, tile, px, py, above (the slice whose CIN its COUT
//             drives: the carry chain's next stage, from the routing graph) },
//     pads:   Map pin -> { name, tile, px, py, bank, bufg: [BUFGMUX sites its dedicated clock path reaches] },
//     bufgs:  [{ name, tile, px, py }]   the 16 BUFGMUX
//     brams:  [{ tile, px, py, r16: site, r8: [two sites] }]   a block RAM tile: one RAMB16BWER or two RAMB8BWER
//     dsps:   [{ name, tile, px, py, above (the DSP48A1 its PCOUT / BCOUT cascade into) }] }
// Positions px, py: the tile's column and row counted from the bottom (y grows upward, as the sites' Y);
// the two slices of a CLB a quarter tile apart.
import { PIP_ROUTETHRU } from '../device.js';

// the I/O banks of the Spartan-6 CSG324 parts: one per side (UG381: bank 0 top, 1 right, 2 bottom, 3 left)
const BANK_OF_SIDE = { T: 0, R: 1, B: 2, L: 3 };
// tiles of the general interconnect and of the logic: a dedicated clock path from a pad runs through none
const GENERAL_TILE = /^(INT|IOI_INT|INT_BRAM|INT_TERM|CLEX|IOI$|LIOI|RIOI|TIOI|BIOI)/;

/** The global buffers a pad's input reaches by the dedicated clock paths (a GCLK pin): BUFGMUX sites, nearest first. */
function padBufgs(dev, padName, bufIn) {
  const start = dev.sitePinNode(padName, 'I');
  if (start < 0) return [];
  const seen = new Set([start]), hits = [];
  let q = [start];
  for (let depth = 0; depth < 14 && q.length; depth++) {
    const next = [];
    for (const n of q) {
      dev.forEachPip(n, (to, k, i, f) => {
        if (f & PIP_ROUTETHRU || seen.has(to) || GENERAL_TILE.test(dev.tileType(k))) return;
        seen.add(to);
        const b = bufIn.get(to);
        if (b && !hits.includes(b)) hits.push(b);
        next.push(to);
      });
    }
    q = next;
  }
  return hits;
}

/** The sites of a Spartan-6 device (a Device of fpga/device.js), see above. */
export function s6Sites(dev) {
  if (dev.family !== 'spartan6') throw new Error(`s6Sites: ${dev.part} is not a Spartan-6`);
  const rows = dev.rows;
  const at = k => ({ tile: dev.tileNames[k], px: dev.tileCol[k], py: rows - 1 - dev.tileRow[k] });
  const slices = new Map(), pads = new Map(), bufgs = [], dsps = [];
  const bramTiles = new Map();
  for (const s of dev.sites()) {
    let m;
    if ((m = /^SLICE_X(\d+)Y(\d+)$/.exec(s.name))) {
      const x = +m[1], y = +m[2];
      const kind = s.type === 'SLICEX' ? 'X' : s.type === 'SLICEL' ? 'L' : 'M';
      slices.set(s.name, { name: s.name, kind, x, y, ...at(s.tile), px: dev.tileCol[s.tile] + (x % 2) * 0.25, above: null });
    } else if (/^IOB[MS]$/.test(s.type) && s.bonded === 1) {
      pads.set(s.name, { name: s.name, ...at(s.tile), bank: BANK_OF_SIDE[s.tileName[0]] ?? -1, bufg: [] });
    } else if (s.type === 'BUFGMUX') bufgs.push({ name: s.name, ...at(s.tile) });
    else if (s.type === 'RAMB16BWER' || s.type === 'RAMB8BWER') {
      const t = bramTiles.get(s.tile) || bramTiles.set(s.tile, { ...at(s.tile), r16: null, r8: [] }).get(s.tile);
      if (s.type === 'RAMB16BWER') t.r16 = s.name; else t.r8.push(s.name);
    } else if (s.type === 'DSP48A1') dsps.push({ name: s.name, ...at(s.tile), above: null });
  }
  // the carry chain: the slice whose CIN the COUT drives (by a PIP, or the same node)
  const cin = new Map();
  for (const s of slices.values()) { const n = dev.sitePinNode(s.name, 'CIN'); if (n >= 0) cin.set(n, s.name); }
  for (const s of slices.values()) {
    const n = dev.sitePinNode(s.name, 'COUT');
    if (n < 0) continue;
    let up = cin.get(n) ?? null;
    if (!up) dev.forEachPip(n, to => { if (cin.has(to)) up = cin.get(to); });
    s.above = up;
  }
  // the DSP cascade (PCOUT -> PCIN): the DSP48A1 above in the column
  const pcin = new Map();
  for (const d of dsps) { const n = dev.sitePinNode(d.name, 'PCIN0'); if (n >= 0) pcin.set(n, d.name); }
  for (const d of dsps) {
    const n = dev.sitePinNode(d.name, 'PCOUT0');
    if (n < 0) continue;
    let up = pcin.get(n) ?? null;
    if (!up) dev.forEachPip(n, to => { if (pcin.has(to)) up = pcin.get(to); });
    d.above = up;
  }
  const bufIn = new Map();
  for (const b of bufgs) bufIn.set(dev.sitePinNode(b.name, 'I0'), b.name);
  for (const p of pads.values()) p.bufg = padBufgs(dev, p.name, bufIn);
  const brams = [...bramTiles.values()].sort((a, b) => a.px - b.px || a.py - b.py);
  return { part: dev.part, rows, cols: dev.cols, slices, pads, bufgs, brams, dsps };
}
