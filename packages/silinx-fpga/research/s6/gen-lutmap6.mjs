// Stage S6-B (#725): where every LUT of a Spartan-6 part is. Designs in XDL with the four LUTs (A6LUT …
// D6LUT) of every slice of the part set, no nets (bitgen writes a LUT's contents without them):
//   <part>.one.xdl        every LUT all ones (O6 = 1): where the 64 bits of all of them are
//   <part>.zero.xdl       every LUT all zeros (O6 = 0): the bits a used LUT or slice sets besides its contents
//   <part>.a<k>.xdl       every LUT O6 = A<k> (k = 1 … 6): which of the 64 entries each bit is
//   <part>.id<j>.xdl      LUT n (the slices in the order of the device's sites, 4 per slice) all ones when bit j
//                         of n is 1, unused otherwise: which LUT each bit belongs to
// ise-xdl-bits.sh turns them into bitstreams (xdl -xdl2ncd -force, bitgen -d -g CRC:Disable); ana-lutmap6.mjs
// reads them.
//   node research/s6/gen-lutmap6.mjs [--sample] <out dir> [part …]      (default both boards' parts)
// --sample keeps sampleSlices's slices only (a slice's base follows from its column and Y: the XC6SLX45's).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { s6Device, S6_BOARDS } from '../../../../test/s6-lib.mjs';

export const LUTS = ['A', 'B', 'C', 'D'];
const TYPE = { X: 'SLICEX', L: 'SLICEL', M: 'SLICEM' };

/** The slices of a part in a fixed order (by X, then Y): [{ name, kind, tile }]. */
export function lutSlices(sites) {
  return [...sites.slices.values()].sort((a, b) => a.x - b.x || a.y - b.y).map(s => ({ name: s.name, kind: s.kind, tile: s.tile }));
}

/**
 * A sample of the slices: every slice of the first row of CLBs (Y 0 … 15) and the top one (Y = 15 mod 16) of
 * each other row: every column's first frame, the rows' frames and the layout per kind, at a sixth of the time.
 */
export const sampleSlices = slices => slices.filter(s => { const y = +s.name.match(/Y(\d+)$/)[1]; return y < 16 || y % 16 === 15; });

/** The number of id designs a part needs (bits of its LUT count). */
export const idBits = slices => Math.ceil(Math.log2(slices.length * 4));

/**
 * A design's XDL: every slice of the list with the LUTs eq(n) gives an equation for (n: the LUT's number,
 * slice index * 4 + position; null: the LUT left unused); a slice with none is left out.
 */
export function lutDesign(part, slices, eq, name = 'lutmap') {
  const out = [`design "${name}" ${part} v3.2 ,\n  cfg "";\n`];
  slices.forEach((s, i) => {
    const cfg = LUTS.map((l, k) => [l, eq(i * 4 + k)]).filter(([, e]) => e !== null).map(([l, e]) => `${l}6LUT:${s.name}.${l}:#LUT:O6=${e}`);
    if (cfg.length) out.push(`inst "${s.name}" "${TYPE[s.kind]}",placed ${s.tile} ${s.name}  ,\n  cfg " ${cfg.join(' ')} " ;\n`);
  });
  return out.join('');
}

/** The designs of a part: { file name: XDL }. */
export function lutMapDesigns(part, slices) {
  const p = part.replace(/-?(csg\d+)-?/, '$1-').replace(/^(xc6slx\d+)(csg)/, '$1-$2');
  const designs = { [`${p}.one.xdl`]: lutDesign(part, slices, () => '1'), [`${p}.zero.xdl`]: lutDesign(part, slices, () => '0') };
  for (let k = 1; k <= 6; k++) designs[`${p}.a${k}.xdl`] = lutDesign(part, slices, () => `A${k}`);
  for (let j = 0; j < idBits(slices); j++) designs[`${p}.id${j}.xdl`] = lutDesign(part, slices, n => ((n >> j) & 1 ? '1' : null));
  return designs;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), sample = args[0] === '--sample';
  const [out, ...parts] = sample ? args.slice(1) : args;
  if (!out) { console.error('usage: node research/s6/gen-lutmap6.mjs [--sample] <out dir> [part …]'); process.exit(1); }
  fs.mkdirSync(out, { recursive: true });
  for (const part of parts.length ? parts : S6_BOARDS.map(b => b.part)) {
    const all = lutSlices(s6Device(part).sites), slices = sample ? sampleSlices(all) : all;
    const designs = lutMapDesigns(part, slices);
    for (const [f, x] of Object.entries(designs)) fs.writeFileSync(path.join(out, f), x);
    fs.writeFileSync(path.join(out, `${part}.slices.json`), JSON.stringify(slices));
    console.log(`${part}: ${slices.length} slices, ${Object.keys(designs).length} designs`);
  }
}
