// Stage S6-D (#726), checked: the INT PIP database predicts the routing bits of designs ISE implemented. For every
// INT-like tile a design's nets use (INT, INT_BRK, INT_BRAM, IOI_INT, …: its bits, minors 0 … 20 of its column and its
// band, by tileRegion), the union of its PIPs' (db/<device>-int-cover.json, the PIPs on paths, by the signal's
// direction, else -int.json, else -int-own.json, the other types' own; an I/O tile's INT_IOI_ wires as the INT
// tile's; a bidirectional PIP's direction from its net, walked from its outpins) and of its CLB's slices' settings in
// minor 20 (check-slice6.mjs), compared with ISE's bitstream.
//   node research/s6/check-pips6.mjs <dir> …        (each with top.xdl and top.bit, e.g. night 1's impl-nexys3/*)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl } from '../../packages/silinx-fpga/src/xdl.js';
import { readBit6, bitFormat6, emptyFdri } from '../../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { loadDb } from './check-slice6.mjs';
import { intRegion, regionBits, tileRegion } from './ana-pipprobe6.mjs';
import { s6Device } from '../../test/s6-lib.mjs';
import { kindModel, predictSlice } from './check-slice6.mjs';
export { pipLookup, pipDirections } from '../../packages/silinx-fpga/src/fpga/s6/bitgen-pips.js';
import { pipLookup, pipDirections } from '../../packages/silinx-fpga/src/fpga/s6/bitgen-pips.js';



/**
 * A design's INT tiles checked: { tiles, pips, unknown: Map pip -> count (not in the database), mismatches: [{ tile,
 * pips, missing: ['minor,bit' ISE sets and the PIPs do not], extra }] }.
 */
export function checkPips(xdlText, bitBytes, db, lutBases, slices = null) {
  const design = parseXdl(xdlText), { fdri, device } = readBit6(bitBytes), dev = bitFormat6(device.part);
  const { sites, device: graph } = s6Device(`${device.device}${device.part.slice(device.device.length - 2)}-3`), empty = emptyFdri(dev);
  const byTile = new Map(), out = { tiles: 0, pips: 0, unknown: new Map(), mismatches: [] };
  for (const net of design.nets) {
    const dirs = (net.pips || []).some(p => p.dir === '=-') ? pipDirections(graph, net, design) : null;
    (net.pips || []).forEach((p, i) => {
      if (!/^(INT|INT_BRK|INT_BRAM|INT_BRAM_BRK|IOI_INT|LIOI_INT|INT_GCLK)_X/.test(p.tile)) return;
      const [from, to] = dirs?.[i] ?? [p.from, p.to];
      (byTile.get(p.tile) ?? byTile.set(p.tile, []).get(p.tile)).push({ text: `${p.from} ${p.dir} ${p.to}`, bits: pipLookup(db, from, p.dir, to) });
    });
  }
  // the slices' settings in minor 20 (a SLICEX's SRINIT bits), by tile
  const minor20 = new Map(), kindOf = new Map([...sites.slices.values()].map(s => [s.name, s.kind]));
  if (slices) {
    const models = {};
    for (const inst of design.insts) {
      if (!/^SLICE/.test(inst.type) || !inst.placed) continue;
      const kind = kindOf.get(inst.site), type = inst.tile.replace(/_.*/, ''), [f0, b0] = lutBases[inst.site];
      const m = models[`${kind} ${type}`] ??= kindModel(slices, kind, type), r = intRegion(sites, lutBases, dev, `INT_${inst.tile.replace(/^CLEX[LM]_/, '')}`);
      if (!r) continue;
      for (const x of predictSlice(m, inst.cfg).bits) {
        const [f, b] = x.split(',').map(Number), minor = f0 + f - r[0];
        if (minor <= 20 && minor >= 0) { const t = `INT_${inst.tile.replace(/^CLEX[LM]_/, '')}`; (minor20.get(t) ?? minor20.set(t, new Set()).get(t)).add(`${minor},${b0 + b - r[1]}`); }
      }
    }
  }
  for (const [tile, pips] of byTile) {
    const r = tileRegion(dev, tile);
    out.tiles++;
    const want = new Set(minor20.get(tile) || []);
    let known = true;
    for (const p of pips) {
      out.pips++;
      if (!p.bits) { out.unknown.set(p.text, (out.unknown.get(p.text) || 0) + 1); known = false; continue; }
      for (const [m, x] of p.bits) want.add(`${m},${x}`);
    }
    const have = new Set(regionBits(fdri, empty, r).map(([m, x]) => `${m},${x}`));
    const missing = [...have].filter(x => !want.has(x)), extra = [...want].filter(x => !have.has(x));
    if (missing.length || extra.length) out.mismatches.push({ tile, pips: pips.map(p => p.text), known, missing, extra });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) { console.error('usage: node research/s6/check-pips6.mjs <dir> …'); process.exit(1); }
  const read = n => JSON.parse(fs.readFileSync(new URL(`../../packages/silinx-fpga/bitdb/s6/${n}.json`, import.meta.url), 'utf8'));
  const total = { tiles: 0, pips: 0, bad: 0 }, unknown = new Map();
  for (const dir of dirs) {
    const bit = fs.readFileSync(path.join(dir, 'top.bit')), device = readBit6(bit).device.device;
    // the INT switch box measured on the XC6SLX16 (the XC6SLX45's INT tiles are the same type)
    const db = { pips: read('xc6slx16-int').pips, cover: read('xc6slx16-int-cover').pips, own: read('xc6slx16-int-own').pips };
    const r = checkPips(fs.readFileSync(path.join(dir, 'top.xdl'), 'utf8'), bit, db, read(`${device}-lut`).slices, loadDb(device));
    total.tiles += r.tiles; total.pips += r.pips; total.bad += r.mismatches.length;
    for (const [p, n] of r.unknown) unknown.set(p, (unknown.get(p) || 0) + n);
    console.log(`${dir}: ${r.tiles} INT tiles, ${r.pips} PIPs, ${r.mismatches.length} tiles differ${r.mismatches.length ? `: ${r.mismatches.slice(0, 3).map(m => `${m.tile} +${m.missing.join(' ')} -${m.extra.join(' ')}${m.known ? '' : ' (a PIP not measured)'}`).join('; ')}` : ''}`);
  }
  console.log(`total: ${total.tiles} INT tiles, ${total.pips} PIPs, ${total.bad} differ${unknown.size ? `; not measured: ${[...unknown].slice(0, 10).map(([p, n]) => `${p} ×${n}`).join(', ')}` : ''}`);
}
