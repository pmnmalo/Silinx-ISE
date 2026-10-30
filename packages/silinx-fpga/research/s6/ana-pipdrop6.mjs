// Stage S6-D (#726): the bits of the PIPs gen-pipdrop6.mjs drops, from each design's <name>.base.bit and
// <name>.drop.bit. A bit the drop changes goes to the dropped PIPs' tile whose region holds it (gridRegion: the column
// of the nearest INT-like tile to its left in the device's grid, the band of the INT-like tiles of its grid row, a
// clock row's the 16 bits between the halves), else to the nearest one; a tile's bits, as offsets from its region
// ([minor, bit]), are its dropped PIPs' together. They are taken apart: a tile with no bits gives its PIPs none; a
// tile with one PIP not known yet gives that PIP's bits (its others' taken away); then a PIP's bits are those every
// tile it is in has (the intersection), less the known PIPs'; each the same in every tile of the type (checked).
//   node research/s6/ana-pipdrop6.mjs <dir>[=part] …   -> packages/silinx-fpga/bitdb/s6/s6-pips-other.json (the parts' tile types
//     the same: both boards' designs taken apart together; part default the XC6SLX16)
// { pips: { 'TYPE from dir to': [[minor, bit]] }, unresolved: ['TYPE from dir to'] }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBit6, bitFormat6, FRAME_WORDS } from '../../src/fpga/s6/bitstream.js';
import { s6Device } from '../../../../test/s6-lib.mjs';
export { gridRegion } from '../../src/fpga/s6/bitgen-regions.js';
import { gridRegion } from '../../src/fpga/s6/bitgen-regions.js';

const INT_LIKE = /^(INT|INT_BRK|INT_BRAM|INT_BRAM_BRK|IOI_INT|LIOI_INT|INT_GCLK)$/;


/** The bits two designs' frame data differ in: [[frame, bit]]. */
export function diffBits(a, b) {
  const out = [];
  for (let w = 0; w < a.length; w++) {
    const x = a[w] ^ b[w];
    if (x) for (let i = 0; i < 16; i++) if ((x >> (15 - i)) & 1) out.push([Math.floor(w / FRAME_WORDS), (w % FRAME_WORDS) * 16 + i]);
  }
  return out;
}

/**
 * The changed bits by tile: { tile: Set 'minor,bit' } from the bits ([[frame, bit]]) and the tiles ({ tile: [c0, b0,
 * frames] }): the tile whose column and band hold the bit, else the nearest (column, then band); unplaced: bits no
 * tile is near (more than a column and a band away).
 */
export function bitsByTile(bits, regions) {
  const out = {}, unplaced = [];
  for (const [f, b] of bits) {
    let best = null, score = Infinity;
    for (const [t, [c0, b0, n, nb = 64]] of Object.entries(regions)) {
      const df = f < c0 ? c0 - f : f >= c0 + n ? f - (c0 + n - 1) : 0, db = b < b0 ? b0 - b : b >= b0 + nb ? b - (b0 + nb - 1) : 0;
      const s = df * 1000 + db;
      if (s < score) { score = s; best = t; }
    }
    if (!best || score > 1000 + 64) { unplaced.push([f, b]); continue; }
    const [c0, b0] = regions[best];
    (out[best] ??= new Set()).add(`${f - c0},${b - b0}`);
  }
  return { out, unplaced };
}

/**
 * The PIPs' bits by peeling: units [{ tile, keys: ['TYPE from dir to'], bits: Set 'minor,bit' }] (a unit: the tiles of
 * one region) -> { pips: { 'TYPE pip': ['minor,bit'] }, problems, unresolved }.
 */
export function peel(tiles) {
  const pips = {}, problems = [];
  for (const t of tiles) if (!t.bits.size) for (const k of t.keys) pips[k] = [];
  let moved = true;
  const step = () => {
    // the intersection of the tiles a PIP is in, less the known PIPs' bits there; taken when it leaves one PIP
    const occ = {};
    for (const t of tiles) for (const k of new Set(t.keys)) if (!(k in pips)) (occ[k] ??= []).push(t);
    let any = false;
    for (const [k, ts] of Object.entries(occ)) {
      const sets = ts.map(t => { const known = new Set([...new Set(t.keys)].filter(x => x in pips).flatMap(x => pips[x])); return new Set([...t.bits].filter(x => !known.has(x))); });
      let inter = sets[0];
      for (const s2 of sets.slice(1)) inter = new Set([...inter].filter(x => s2.has(x)));
      // only when every tile's other open PIPs could not hold these bits: each tile holds k and nothing open but k
      if (ts.every(t => [...new Set(t.keys)].filter(x => !(x in pips)).length === 1)) continue;
      if (ts.length >= 2 && inter.size === 0) { pips[k] = []; any = true; }
    }
    return any;
  };
  while (moved) {
    moved = false;
    for (const t of tiles) {
      const keys = [...new Set(t.keys)], open = keys.filter(k => !(k in pips));
      if (open.length !== 1) continue;
      const known = new Set(keys.filter(k => k in pips).flatMap(k => pips[k]));
      pips[open[0]] = [...t.bits].filter(x => !known.has(x)).sort();
      moved = true;
    }
    if (!moved) moved = step();
  }
  // every tile: its PIPs' bits are its bits
  for (const t of tiles) {
    const keys = [...new Set(t.keys)];
    if (keys.some(k => !(k in pips))) continue;
    const want = new Set(keys.flatMap(k => pips[k]));
    if (want.size !== t.bits.size || [...t.bits].some(x => !want.has(x))) problems.push(`${t.tile}: ${[...t.bits].sort().join(' ')} vs its PIPs' ${[...want].sort().join(' ')}`);
  }
  const unresolved = [...new Set(tiles.flatMap(t => t.keys))].filter(k => !(k in pips));
  return { pips, problems, unresolved };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node research/s6/ana-pipdrop6.mjs <dir>[=part] …'); process.exit(1); }
  const tiles = [], unplaced = [];
  for (const d of dirs) {
    const [dir, part = 'xc6slx16csg324-3'] = d.split('='), dev = bitFormat6(part), { device } = s6Device(part);
    const names = fs.readdirSync(dir).filter(f => /\.drop\.bit$/.test(f)).map(f => f.replace(/\.drop\.bit$/, ''));
    for (const name of names) {
      const base = readBit6(fs.readFileSync(path.join(dir, `${name}.base.bit`))).fdri, drop = readBit6(fs.readFileSync(path.join(dir, `${name}.drop.bit`))).fdri;
      const dropped = JSON.parse(fs.readFileSync(path.join(dir, `${name}.drop.json`), 'utf8')), byTile = {}, regions = {};
      for (const { tile, pip } of dropped) (byTile[tile] ??= []).push(pip);
      // the tiles of one region (an I/O tile and its pad's, …) are one unit
      const units = {};
      for (const t of Object.keys(byTile)) { const r = gridRegion(device, dev, t), u = r.join(','); (units[u] ??= { region: r, tiles: [] }).tiles.push(t); }
      for (const [u, x] of Object.entries(units)) regions[u] = x.region;
      const changed = diffBits(base, drop), { out, unplaced: u } = bitsByTile(changed, regions);
      unplaced.push(...u.map(b => `${name} ${b}`));
      for (const [key, x] of Object.entries(units)) tiles.push({ tile: `${name}:${x.tiles.join('+')}`, keys: x.tiles.flatMap(t => byTile[t].map(p => `${t.replace(/_X\d+Y\d+$/, '')} ${p}`)), bits: out[key] ?? new Set() });
      console.log(`${name}: ${dropped.length} PIPs in ${Object.keys(byTile).length} tiles, ${changed.length} bits changed`);
    }
  }
  const { pips, problems, unresolved } = peel(tiles), none = Object.values(pips).filter(b => !b.length).length;
  console.log(`${Object.keys(pips).length} PIPs resolved (${none} with no bits), ${unresolved.length} not; ${problems.length} tiles inconsistent${problems.length ? `: ${problems.slice(0, 4).join('; ')}` : ''}; ${unplaced.length} bits near no tile${unplaced.length ? `: ${unplaced.slice(0, 6).join('; ')}` : ''}`);
  fs.writeFileSync(new URL('../../bitdb/s6/s6-pips-other.json', import.meta.url), `${JSON.stringify({ pips, unresolved })}\n`);
}
