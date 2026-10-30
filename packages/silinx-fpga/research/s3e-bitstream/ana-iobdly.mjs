// #97: the input delays of neighbouring pads in combination (gen-iobdly.mjs variants, xdl + bitgen by ISE). For every
// I/O tile, the bits near its pads that change between the variants (the other settings stay as ISE routed them, so
// a bit that changes is a delay's), each classified by what it follows across the K x K variants: one pad's delay
// alone (a per-pad feature: the database's model), or only the pair of the tile's pads' delays (an interaction).
//   PART=… node ana-iobdly.mjs dir [--json out.json]
// Output: per tile, the bits of each kind; with --json the per-pad features (pad -> 'IFD:DLYv' / 'IBUF:DLYv' ->
// bits) and the pair features (tile -> 'j0=a,j1=b' -> bits) found.
import fs from 'node:fs';
import { readBit, diffFrames } from '../../src/fpga/bitstream.js';
import { parseXdl } from '../../src/xdl.js';
import { frameData, IOB_REG_ATTRS as REG_ATTRS } from '../../src/fpga/bitgen.js';
import { loadDb } from './db.mjs';

const args = process.argv.slice(2);
const jsonOut = args.includes('--json') ? args.splice(args.indexOf('--json'), 2)[1] : null;
const [dir] = args;
const key = JSON.parse(fs.readFileSync(`${dir}/key.json`, 'utf8'));
const db = loadDb();
const prefix = key.ibuf ? 'IBUF' : 'IFD';
// a pad's anchor (its own bits): the nearest pad of a changed bit is the one it belongs to, its tile's
const anchor = new Map();
for (const [pad, f] of Object.entries(db.padFeats)) {
  const pos = Object.entries(f).filter(([k]) => /^[IO]:LVCMOS(33|25)$/.test(k)).flatMap(([, v]) => v).map(s => s.replace('!', '').split(',').map(Number));
  if (pos.length) anchor.set(pad, pos);
}
// the variants: the bits ISE sets, against the writer's frame data with the IOB settings left out
const variants = [];
for (const f of fs.readdirSync(dir).filter(x => /^V\d+\.xdl$/.test(x)).sort()) {
  const n = f.slice(0, -4);
  if (!fs.existsSync(`${dir}/${n}.bit`)) continue;
  const design = parseXdl(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  const sites = new Map();   // tile#j -> pad
  const k = new Map();
  for (const i of design.insts) {
    if (!/^(IOB|IBUF)$/.test(i.type) || !i.placed) continue;
    i.cfg = i.cfg.filter(c => !REG_ATTRS.test(c.attr));
    const id = `${i.tile}#${k.get(i.tile) || 0}`;
    if (key.values[n]?.[id] !== undefined) { sites.set(id, i.site); k.set(i.tile, (k.get(i.tile) || 0) + 1); }
  }
  const { frames } = frameData(design, db);
  const bits = new Set(diffFrames(frames, readBit(fs.readFileSync(`${dir}/${n}.bit`)).frames, db.format.frameWords).map(x => `${x.frame},${x.bit},${x.value}`));
  variants.push({ n, bits, sites, values: key.values[n] });
}
// every bit seen, by the variants it is in
const seen = new Map();
variants.forEach((v, vi) => { for (const b of v.bits) { if (!seen.has(b)) seen.set(b, new Set()); seen.get(b).add(vi); } });
const V = variants.length;
const tiles = new Map();   // tile -> { pads: [pad of j0, j1, …], bits: { per: [], pair: [], all: [] } }
const perPad = {}, pairs = {};
// every pad's id (tile#j) and its value in each variant
const ids = [...variants[0].sites.keys()];
const padOf = id => variants[0].sites.get(id);
const dist = (pad, fr, bit) => Math.min(...(anchor.get(pad) || [[1e9, 1e9]]).map(([f, b]) => Math.abs(f - fr) * 4 + Math.abs(b - bit)));
// the values of pad id for which the bit is set, when it is a function of that pad's value alone (else null)
const funcOf = (id, vs) => {
  const on = new Map();
  for (let vi = 0; vi < V; vi++) { const x = variants[vi].values[id]; const s = vs.has(vi); if (on.has(x) && on.get(x) !== s) return null; on.set(x, s); }
  return [...on].filter(([, s]) => s).map(([x]) => x);
};
for (const [b, vs] of seen) {
  if (vs.size === V) continue;   // in every variant: not a delay's
  const [fr, bit] = b.split(',').map(Number);
  // its pad: the nearest of those whose delay it follows; none: the pair of its nearest pad's tile
  const cands = ids.filter(id => funcOf(id, vs)).sort((a, c) => dist(padOf(a), fr, bit) - dist(padOf(c), fr, bit));
  const near = cands[0] || [...ids].sort((a, c) => dist(padOf(a), fr, bit) - dist(padOf(c), fr, bit))[0];
  const tile = near.split('#')[0];
  const tids = ids.filter(x => x.startsWith(`${tile}#`)).sort();
  const t = tiles.get(tile) || { pads: tids.map(padOf), per: 0, pair: 0 };
  tiles.set(tile, t);
  if (cands.length) {
    t.per++;
    for (const x of funcOf(near, vs)) ((perPad[padOf(near)] ||= {})[`${prefix}:DLY${x}`] ||= []).push(`${b.endsWith(',0') ? '!' : ''}${fr},${bit}`);
  } else {
    t.pair++;
    for (let vi = 0; vi < V; vi++) if (vs.has(vi)) ((pairs[tile] ||= {})[tids.map(x => variants[vi].values[x]).join(',')] ||= new Set()).add(`${fr},${bit}`);
  }
}
let per = 0, pair = 0;
for (const [tile, t] of [...tiles].sort()) { per += t.per; pair += t.pair; if (t.pair) console.log(`${tile} (${t.pads.join(' ')}): ${t.per} bits of one pad's delay, ${t.pair} of the pair's`); }
console.log(`${V} variants, ${tiles.size} tiles: ${per} bits follow one pad's delay, ${pair} only the pair's`);
if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ padFeatures: perPad, pairs: Object.fromEntries(Object.entries(pairs).map(([t, m]) => [t, Object.fromEntries(Object.entries(m).map(([k, s]) => [k, [...s].sort()]))])) }, null, 1));
