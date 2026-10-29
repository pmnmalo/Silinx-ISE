// Stage S6-C (#725): the slice settings from the bitstreams of gen-slice6.mjs's designs. Each slice's bits are
// those of its column's frames and its 64-bit band (from its base, db/<device>-lut.json), as (frame, bit) offsets
// from its base; a variant's settings are the bits it sets and clears against the base slice's (the two bases
// equal, checked).
//   node research/s6/ana-slice6.mjs [--nets | --full] [--tiles TYPE[:X]] <dir> [part …]
//     -> packages/silinx-fpga/bitdb/s6/<device>-slice[-nets|-full][-<type>[X]].json (with --tiles, the kinds it has designs of)
// { kinds: { X|L|M: { base: [[frame, bit]], variants: { name: { set: [[frame, bit]], clear: [[frame, bit]] } } } } }
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readBit6, bitFormat6, FRAME_WORDS } from '../../packages/silinx-fpga/src/fpga/s6/bitstream.js';
export { columnOf } from '../../packages/silinx-fpga/src/fpga/s6/bitgen-regions.js';
import { columnOf } from '../../packages/silinx-fpga/src/fpga/s6/bitgen-regions.js';


/** A slice's set bits in its column and band: [[frame, bit] offsets from its base], sorted. */
export function sliceBits(fdri, dev, [f0, b0]) {
  const [c0, n] = columnOf(dev, f0), out = [];
  for (let f = c0; f < c0 + n; f++) {
    for (let b = b0; b < b0 + 64; b++) if ((fdri[f * FRAME_WORDS + (b >> 4)] >> (15 - (b & 15))) & 1) out.push([f - f0, b - b0]);
  }
  return out;
}

/**
 * The settings of a kind from a design's frame data, its manifest ({ slice: variant name }, 'BASE' twice) and the
 * slices' bases: { base, variants: { name: { set, clear } }, problems }.
 */
export function sliceSettings(fdri, dev, manifest, bases) {
  const key = ([f, b]) => `${f},${b}`, bitsOf = n => sliceBits(fdri, dev, bases[n]);
  const baseNames = Object.keys(manifest).filter(n => manifest[n] === 'BASE'), problems = [];
  const base = bitsOf(baseNames[0]);
  for (const n of baseNames.slice(1)) if (JSON.stringify(bitsOf(n)) !== JSON.stringify(base)) problems.push(`${n}: the base differs from ${baseNames[0]}'s`);
  const has = new Set(base.map(key)), variants = {};
  for (const [n, v] of Object.entries(manifest)) {
    if (v === 'BASE') continue;
    const bits = bitsOf(n), mine = new Set(bits.map(key));
    variants[v] = { set: bits.filter(p => !has.has(key(p))), clear: base.filter(p => !mine.has(key(p))) };
  }
  return { base, variants, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), mode = { '--nets': 'nets', '--full': 'full' }[args[0]], design = mode || 'slice';
  if (mode) args.shift();
  let tiles = '';
  if (args[0] === '--tiles') { tiles = args[1].replace(':', ''); args.splice(0, 2); }
  const [dir, ...parts] = args, suffix = tiles ? `.${tiles}` : '';
  if (!dir) { console.error('usage: node research/s6/ana-slice6.mjs [--nets | --full] <dir> [part …]'); process.exit(1); }
  for (const part of parts.length ? parts : ['xc6slx16csg324-3']) {
    const dev = bitFormat6(part), p = part.replace(/^(xc6slx\d+)(csg)/, '$1-$2');
    const bases = JSON.parse(fs.readFileSync(new URL(`../../packages/silinx-fpga/bitdb/s6/${dev.device}-lut.json`, import.meta.url), 'utf8')).slices;
    const kinds = {};
    for (const kind of ['X', 'L', 'M']) {
      if (!fs.existsSync(path.join(dir, `${p}.${design}${kind}${suffix}.json`))) continue;
      const manifest = JSON.parse(fs.readFileSync(path.join(dir, `${p}.${design}${kind}${suffix}.json`), 'utf8'));
      const { fdri } = readBit6(fs.readFileSync(path.join(dir, `${p}.${design}${kind}${suffix}.bit`)));
      const { base, variants, problems } = sliceSettings(fdri, dev, manifest, bases);
      const none = Object.entries(variants).filter(([, v]) => !v.set.length && !v.clear.length).map(([n]) => n);
      console.log(`${part} SLICE${kind}: base ${base.length} bits, ${Object.keys(variants).length} variants, ${none.length} with no bits${none.length ? ` (${none.join(' ')})` : ''}; ${problems.length} problems${problems.length ? `: ${problems.join('; ')}` : ''}`);
      kinds[kind] = { base, variants };
    }
    fs.mkdirSync(new URL('../../packages/silinx-fpga/bitdb/s6/', import.meta.url), { recursive: true });
    fs.writeFileSync(new URL(`../../packages/silinx-fpga/bitdb/s6/${dev.device}-slice${mode ? `-${mode}` : ''}${tiles ? `-${tiles.toLowerCase()}` : ''}.json`, import.meta.url), `${JSON.stringify({ part, kinds })}\n`);
  }
}
