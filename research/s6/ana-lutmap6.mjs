// Stage S6-B (#725): the LUT map from the bitstreams of gen-lutmap6.mjs's designs. Every bit the "one" design
// sets (against the empty design's frame data) and the "zero" design does not is a LUT bit (the zero design's
// are the bits of a used LUT or slice, reported apart); the id designs say whose (the LUT's number, bit j
// of it in design id<j>), the a<k> designs which entry (bit k - 1 of the entry's index in design a<k>: O6 = A<k>
// is 1 at the entries whose index has that bit).
//   node research/s6/ana-lutmap6.mjs <dir> [part …]   -> research/s6/db/<part>-lut.json
// The designs may hold a sample of the slices (gen-lutmap6.mjs --sample): the other slices' bases follow from it.
// The map is kept per slice kind and LUT as (frame, bit) offsets from the slice's base (its first frame and
// lowest bit), the same for every slice of the kind (checked), and per slice its base.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBit6, emptyFdri, bitFormat6, FRAME_WORDS } from '../../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { LUTS, idBits, lutSlices } from './gen-lutmap6.mjs';
import { s6Device } from '../../test/s6-lib.mjs';

/** The bits of FDRI's frames (block type 0) set in fdri and not in base: [frame index, bit in the frame]. */
export function setBits(fdri, base, dev) {
  const out = [], end = dev.rows * dev.rowFrames * FRAME_WORDS;
  for (let w = 0; w < end; w++) {
    const x = fdri[w] & ~base[w];
    if (!x) continue;
    for (let i = 0; i < 16; i++) if ((x >> (15 - i)) & 1) out.push([Math.floor(w / FRAME_WORDS), (w % FRAME_WORDS) * 16 + i]);
  }
  return out;
}

/**
 * The LUT map from the designs' frame data ({ one, zero, a: [a1 … a6], id: [id0 …] }: Uint16Arrays) and the
 * empty design's (base): { luts: Map n -> [64 positions, by entry] (a position: frame * 1040 + bit), used: [the
 * positions the zero design sets], problems: [] }.
 */
export function lutBits({ one, zero, a, id }, base, dev) {
  const has = arr => { const s = new Set(); for (const [f, b] of setBits(arr, base, dev)) s.add(f * 1040 + b); return s; };
  const A = a.map(has), I = id.map(has), Z = has(zero), luts = new Map(), problems = [];
  for (const [f, b] of setBits(one, base, dev)) {
    const p = f * 1040 + b;
    if (Z.has(p)) continue;
    let n = 0, e = 0;
    I.forEach((s, j) => { if (s.has(p)) n |= 1 << j; });
    A.forEach((s, k) => { if (s.has(p)) e |= 1 << k; });
    if (!luts.has(n)) luts.set(n, new Array(64).fill(null));
    const l = luts.get(n);
    if (l[e] !== null) problems.push(`LUT ${n} entry ${e} at two places (${l[e]}, ${p})`);
    else l[e] = p;
  }
  for (const [n, l] of luts) if (l.includes(null)) problems.push(`LUT ${n}: ${l.filter(x => x === null).length} entries not found`);
  return { luts, used: [...Z].sort((x, y) => x - y), problems };
}

/**
 * The map per slice kind: { kinds: { X|L|M: { A … D: [[frame, bit] offsets by entry] } }, slices: { name: [frame,
 * bit] base }, problems } from lutBits's LUTs and the slices (gen-lutmap6.mjs's order, 4 LUTs each).
 */
export function lutMap(luts, slices) {
  const kinds = {}, bases = {}, problems = [];
  slices.forEach((s, i) => {
    const ls = LUTS.map((_, k) => luts.get(i * 4 + k));
    if (ls.some(l => !l)) { problems.push(`${s.name}: ${ls.filter(l => !l).length} LUTs not found`); return; }
    const all = ls.flat(), f0 = Math.min(...all.map(p => Math.floor(p / 1040))), b0 = Math.min(...all.map(p => p % 1040));
    bases[s.name] = [f0, b0];
    const rel = Object.fromEntries(LUTS.map((l, k) => [l, ls[k].map(p => [Math.floor(p / 1040) - f0, (p % 1040) - b0])]));
    if (!kinds[s.kind]) kinds[s.kind] = rel;
    else if (JSON.stringify(kinds[s.kind]) !== JSON.stringify(rel)) problems.push(`${s.name}: its LUTs are not laid out as the other SLICE${s.kind}s'`);
  });
  return { kinds, slices: bases, problems };
}

/**
 * Every slice's base from a sample's (sampleSlices's: the first row of CLBs and the top slice of each other
 * row): a slice's frame is its column's first frame (by X) plus its row's (rowFrames each, Y div 16), its bit a
 * function of Y mod 16, both checked on the sample: { slices: { name: [frame, bit] } for all, problems }.
 */
export function extendBases(bases, all, dev) {
  const xy = n => n.match(/X(\d+)Y(\d+)$/).slice(1).map(Number), col = {}, bit = {}, problems = [];
  const check = (m, k, v, what) => { if (m[k] === undefined) m[k] = v; else if (m[k] !== v) problems.push(`${what}: ${m[k]} and ${v}`); };
  for (const [n, [f, b]] of Object.entries(bases)) {
    const [x, y] = xy(n);
    check(col, x, f - dev.rowFrames * Math.floor(y / 16), `X${x}'s first frame`);
    check(bit, y % 16, b, `the bit of Y mod 16 = ${y % 16}`);
  }
  const slices = {};
  for (const { name } of all) {
    const [x, y] = xy(name);
    if (col[x] === undefined || bit[y % 16] === undefined) problems.push(`${name}: no base (its column or Y mod 16 not in the sample)`);
    else slices[name] = [col[x] + dev.rowFrames * Math.floor(y / 16), bit[y % 16]];
  }
  return { slices, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [dir, ...parts] = process.argv.slice(2);
  if (!dir) { console.error('usage: node research/s6/ana-lutmap6.mjs <dir> [part …]'); process.exit(1); }
  for (const part of parts.length ? parts : ['xc6slx16csg324-3', 'xc6slx45csg324-3']) {
    const dev = bitFormat6(part), p = part.replace(/^(xc6slx\d+)(csg\d+)/, '$1-$2');
    const slices = JSON.parse(fs.readFileSync(path.join(dir, `${part}.slices.json`), 'utf8'));
    const fd = name => readBit6(fs.readFileSync(path.join(dir, `${p}.${name}.bit`))).fdri;
    const designs = { one: fd('one'), zero: fd('zero'), a: [1, 2, 3, 4, 5, 6].map(k => fd(`a${k}`)), id: Array.from({ length: idBits(slices) }, (_, j) => fd(`id${j}`)) };
    const { luts, used, problems } = lutBits(designs, emptyFdri(dev), dev);
    const map = lutMap(luts, slices), ext = extendBases(map.slices, lutSlices(s6Device(part).sites), dev);
    const all = [...problems, ...map.problems, ...ext.problems];
    console.log(`${part}: ${luts.size} LUTs found of ${slices.length * 4}, ${used.length} bits of used LUTs or slices; ${all.length} problems${all.length ? `: ${all.slice(0, 10).join('; ')}` : ''}`);
    fs.mkdirSync(new URL('./db/', import.meta.url), { recursive: true });
    fs.writeFileSync(new URL(`./db/${dev.device}-lut.json`, import.meta.url), `${JSON.stringify({ part, kinds: map.kinds, slices: ext.slices })}\n`);
  }
}
