// Stage S6-D (#726), the probe's analysis: the bits of each INT tile's frames (minors 0 … 20 of its CLB column) and
// band (its CLB's 64 bits) that a gen-pipprobe6.mjs design sets, the bits of that tile's PIP.
//   node research/s6/ana-pipprobe6.mjs <dir> [part]   -> per design: how many PIPs set bits, a sample
//   node research/s6/ana-pipprobe6.mjs --int <dir> [part]   -> packages/silinx-fpga/bitdb/s6/<device>-int.json: every INT PIP's bits
//     ({ 'from dir to': [[minor, bit]] }, the same in every tile it was measured in: checked) from the int<offset> designs
//   node research/s6/ana-pipprobe6.mjs --cover <dir> [part]   -> packages/silinx-fpga/bitdb/s6/<device>-int-cover.json: the PIPs on
//     paths (gen-pipcover6.mjs): { 'from -> to' (the signal's direction): bits }, the target tile's bits less those
//     of every path's PIPs in it (paths cross other targets' tiles; from <device>-int.json)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBit6, emptyFdri, bitFormat6, FRAME_WORDS } from '../../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { columnOf } from './ana-slice6.mjs';
import { s6Device } from '../../test/s6-lib.mjs';
export { tileRegion } from '../../packages/silinx-fpga/src/fpga/s6/bitgen-regions.js';
import { tileRegion } from '../../packages/silinx-fpga/src/fpga/s6/bitgen-regions.js';

/** An INT tile's region: [first frame of its column, its band's first bit] from a slice of its CLB (lut db bases). */
export function intRegion(sites, bases, dev, tile) {
  const xy = tile.replace(/^INT_/, '');
  const s = [...sites.slices.values()].find(x => x.tile.replace(/^CLEX[LM]_/, '') === xy && bases[x.name]);
  if (!s) return null;
  const [f0, b0] = bases[s.name];
  return [columnOf(dev, f0)[0], b0];
}


/** The bits a design sets in a region (minors 0 … 20, 64 bits): [[minor, bit]]. */
export function regionBits(fdri, empty, [c0, b0]) {
  const out = [];
  for (let m = 0; m <= 20; m++) {
    for (let b = b0; b < b0 + 64; b++) {
      const w = (c0 + m) * FRAME_WORDS + (b >> 4);
      if (((fdri[w] ^ empty[w]) >> (15 - (b & 15))) & 1) out.push([m, b - b0]);
    }
  }
  return out;
}

/**
 * The PIPs' bits from designs measured in tiles ([{ pips: { tile: pip }, bits: { tile: [[minor, bit]] } }]):
 * { pips: { pip: bits }, tiles: { pip: count }, problems: [a PIP whose bits differ between tiles] }.
 */
export function pipBits(designs) {
  const pips = {}, tiles = {}, problems = [];
  for (const { pips: ps, bits } of designs) {
    for (const [t, pip] of Object.entries(ps)) {
      const b = bits[t];
      if (!b) continue;
      const k = JSON.stringify(b);
      if (!(pip in pips)) { pips[pip] = b; tiles[pip] = 1; } else if (JSON.stringify(pips[pip]) !== k) problems.push(`${pip}: ${JSON.stringify(pips[pip])} and ${k} (${t})`);
      else tiles[pip]++;
    }
  }
  return { pips, tiles, problems };
}

/**
 * A path design's targets' bits: { signal ('from -> to'): { pip, tile, bits, unknown: [path PIPs in the tile with no
 * measured bits] } } from its key (gen-pipcover6.mjs) and each target tile's bits.
 */
export function coverBits(key, tileBits, intDb) {
  const out = {}, all = Object.values(key).flatMap(t => t.path);
  for (const [tile, t] of Object.entries(key)) {
    const known = new Set(), unknown = [];
    for (const p of all.filter(x => x.startsWith(`${tile} `))) {
      const b = intDb[p.slice(tile.length + 1)];
      if (b === undefined) unknown.push(p);
      else for (const [m, x] of b) known.add(`${m},${x}`);
    }
    out[t.signal] = { pip: t.pip, tile, bits: (tileBits[tile] || []).filter(([m, x]) => !known.has(`${m},${x}`)), unknown };
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--others') {
  const [, dir, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
  const dev = bitFormat6(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2'), empty = emptyFdri(dev);
  const intDb = JSON.parse(fs.readFileSync(new URL(`../../packages/silinx-fpga/bitdb/s6/${dev.device}-int.json`, import.meta.url), 'utf8')).pips;
  const read = d => { const ps = JSON.parse(fs.readFileSync(path.join(dir, `${p}.${d}.json`), 'utf8')), { fdri } = readBit6(fs.readFileSync(path.join(dir, `${p}.${d}.bit`))), bits = {}; for (const t of Object.keys(ps)) bits[t] = regionBits(fdri, empty, tileRegion(dev, t)); return { pips: ps, bits }; };
  // oth0: PIPs the INT tiles share, their bits known: the rule and the switch box checked
  const o = read('oth0'), bad = Object.entries(o.pips).filter(([t, x]) => JSON.stringify(o.bits[t]) !== JSON.stringify(intDb[x]));
  const byType = {};
  for (const [t] of bad) { const ty = t.replace(/_X\d+Y\d+$/, ''); byType[ty] = (byType[ty] || 0) + 1; }
  console.log(`oth0: ${Object.keys(o.pips).length - bad.length} of ${Object.keys(o.pips).length} tiles as the INT database${bad.length ? `; differ: ${JSON.stringify(byType)}, e.g. ${bad.slice(0, 4).map(([t, x]) => `${t} ${x}: ${JSON.stringify(o.bits[t])} vs ${JSON.stringify(intDb[x])}`).join('; ')}` : ''}`);
  const { pips, tiles, problems } = pipBits([read('oth1'), read('oth2')]), none = Object.keys(pips).filter(x => !pips[x].length);
  console.log(`own PIPs: ${Object.keys(pips).length} measured (${Object.values(tiles).filter(c => c > 1).length} in two tiles), ${none.length} with no bits; ${problems.length} differ between tiles${problems.length ? `: ${problems.slice(0, 4).join('; ')}` : ''}`);
  fs.writeFileSync(new URL(`../../packages/silinx-fpga/bitdb/s6/${dev.device}-int-own.json`, import.meta.url), `${JSON.stringify({ part, pips })}\n`);
} else if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--cover') {
  const [, dir, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
  const dev = bitFormat6(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2'), { sites } = s6Device(part);
  const bases = JSON.parse(fs.readFileSync(new URL(`../../packages/silinx-fpga/bitdb/s6/${dev.device}-lut.json`, import.meta.url), 'utf8')).slices, empty = emptyFdri(dev);
  const intDb = JSON.parse(fs.readFileSync(new URL(`../../packages/silinx-fpga/bitdb/s6/${dev.device}-int.json`, import.meta.url), 'utf8')).pips;
  const key = JSON.parse(fs.readFileSync(path.join(dir, `${p}.cover.json`), 'utf8')), { fdri } = readBit6(fs.readFileSync(path.join(dir, `${p}.cover.bit`)));
  const tileBits = {};
  for (const t of Object.keys(key)) { const r = intRegion(sites, bases, dev, t); if (r) tileBits[t] = regionBits(fdri, empty, r); }
  const res = coverBits(key, tileBits, intDb), pips = Object.fromEntries(Object.entries(res).map(([s, x]) => [s, x.bits]));
  const none = Object.entries(res).filter(([, x]) => !x.bits.length).map(([s]) => s), unk = Object.entries(res).filter(([, x]) => x.unknown.length);
  console.log(`${part}: ${Object.keys(res).length} PIPs on paths, ${none.length} with no bits${none.length ? ` (${none.slice(0, 12).join('; ')}${none.length > 12 ? ' …' : ''})` : ''}; ${unk.length} with a path PIP not measured in their tile`);
  fs.writeFileSync(new URL(`../../packages/silinx-fpga/bitdb/s6/${dev.device}-int-cover.json`, import.meta.url), `${JSON.stringify({ part, pips })}\n`);
} else if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--int') {
  const [, dir, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
  const dev = bitFormat6(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2'), { sites, device } = s6Device(part);
  const bases = JSON.parse(fs.readFileSync(new URL(`../../packages/silinx-fpga/bitdb/s6/${dev.device}-lut.json`, import.meta.url), 'utf8')).slices, empty = emptyFdri(dev);
  const files = fs.readdirSync(dir).filter(f => new RegExp(`^${p}\\.int\\d+\\.bit$`).test(f)), regions = {}, designs = [];
  for (const f of files) {
    const ps = JSON.parse(fs.readFileSync(path.join(dir, f.replace(/\.bit$/, '.json')), 'utf8')), { fdri } = readBit6(fs.readFileSync(path.join(dir, f))), bits = {};
    for (const t of Object.keys(ps)) { const r = regions[t] ??= intRegion(sites, bases, dev, t); if (r) bits[t] = regionBits(fdri, empty, r); }
    designs.push({ pips: ps, bits });
  }
  const { pips, tiles, problems } = pipBits(designs);
  const k = device.tile('INT_X17Y15'), n = device.templates[device.tileTemplate[k]].from.length, all = [];
  for (let i = 0; i < n; i++) { const x = device.pip(k, i); all.push(`${x.from} ${x.dir} ${x.to}`); }
  const missing = all.filter(x => !(x in pips)), none = Object.keys(pips).filter(x => !pips[x].length), twice = Object.values(tiles).filter(c => c > 1).length;
  console.log(`${part}: ${files.length} designs; ${Object.keys(pips).length} of ${n} INT PIPs measured (${twice} in two tiles or more, ${none.length} with no bits); ${missing.length} not measured; ${problems.length} differ between tiles${problems.length ? `: ${problems.slice(0, 5).join('; ')}` : ''}`);
  fs.writeFileSync(new URL(`../../packages/silinx-fpga/bitdb/s6/${dev.device}-int.json`, import.meta.url), `${JSON.stringify({ part, pips })}\n`);
} else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, part = 'xc6slx16csg324-3'] = process.argv.slice(2);
  if (!dir) { console.error('usage: node research/s6/ana-pipprobe6.mjs <dir> [part]'); process.exit(1); }
  const dev = bitFormat6(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2'), { sites } = s6Device(part);
  const bases = JSON.parse(fs.readFileSync(new URL(`../../packages/silinx-fpga/bitdb/s6/${dev.device}-lut.json`, import.meta.url), 'utf8')).slices;
  const pips = JSON.parse(fs.readFileSync(path.join(dir, `${p}.pips.json`), 'utf8')), empty = emptyFdri(dev);
  // pips3 and pips4 against pips5 (their nets' pins without the PIPs), the others against the empty design
  const read = d => { const f = path.join(dir, `${p}.${d}.bit`); return fs.existsSync(f) ? readBit6(fs.readFileSync(f)).fdri : null; };
  const pins = read('pips5');
  for (const d of ['pips1', 'pips2', 'pips3', 'pips4']) {
    const fdri = read(d), res = {}, base = /pips[34]/.test(d) && pins ? pins : empty;
    if (!fdri) continue;
    let set = 0;
    for (const [tile, pip] of Object.entries(pips)) {
      const r = intRegion(sites, bases, dev, tile);
      const bits = r ? regionBits(fdri, base, r) : null;
      res[tile] = { pip, bits };
      if (bits?.length) set++;
    }
    console.log(`${d}: ${set} of ${Object.keys(pips).length} PIPs set bits; e.g. ${Object.entries(res).slice(0, 4).map(([t, x]) => `${t} ${x.pip}: ${JSON.stringify(x.bits)}`).join('; ')}`);
    fs.writeFileSync(path.join(dir, `${p}.${d}.bits.json`), JSON.stringify(res));
  }
}
