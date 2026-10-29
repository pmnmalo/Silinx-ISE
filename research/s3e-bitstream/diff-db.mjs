// Compares two bit databases (folders of packages/silinx-fpga/bitdb/*.json): what a rebuild (build-db.sh) changed against the
// committed database (#48). Per file: identical, or what differs: for the tile types (s3e-tiles.json,
// <device>-tiles.json) the features only in one, those with other bits, and the types' other keys;
// for the pads (<device>-<package>-pads.json) the same per pad; for the others the top-level keys.
//   node diff-db.mjs a-dir b-dir [--files f1,f2] [--list N] [--resolved] [--missing out.json]
// N: examples listed per kind, default 10. --missing: the tile types' features of a-dir's
// s3e-tiles.json that b-dir's has not (not even through the type it shares), as a file for
// merge-db.mjs ({ types: { T: { features } } }: the features a rebuild's experiments do not reach,
// kept as numbers: measured/kept-xc3s250e.json).
import fs from 'node:fs';
import path from 'node:path';
import { makeDb, featureBits } from '../../packages/silinx-fpga/src/fpga/bitgen.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); if (i < 0) return d; const v = args[i + 1]; args.splice(i, 2); return v; };
const only = opt('--files', null), N = +opt('--list', '10'), missingFile = opt('--missing', null);
const resolved = args.includes('--resolved'); if (resolved) args.splice(args.indexOf('--resolved'), 1);
const [A, B] = args;
const read = (d, f) => (fs.existsSync(path.join(d, f)) ? JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')) : undefined);
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const bitsKey = b => [...b].sort().join(' ');
const show = (title, list) => { if (!list.length) return; console.log(`  ${title}: ${list.length}`); for (const x of list.slice(0, N)) console.log(`    ${x}`); if (list.length > N) console.log('    …'); };

/** Features of two tables { name: { feature: bits } }: { onlyA, onlyB, bits } as text lines. */
function diffFeatures(a = {}, b = {}, label = '') {
  const out = { onlyA: [], onlyB: [], bits: [] };
  for (const [k, v] of Object.entries(a)) {
    if (!(k in b)) out.onlyA.push(`${label}${k} [${v.join(' ')}]`);
    else if (bitsKey(v) !== bitsKey(b[k])) out.bits.push(`${label}${k} [${v.join(' ')}] -> [${b[k].join(' ')}]`);
  }
  for (const [k, v] of Object.entries(b)) if (!(k in a)) out.onlyB.push(`${label}${k} [${v.join(' ')}]`);
  return out;
}
const merge = (acc, d) => { for (const k of Object.keys(acc)) acc[k].push(...d[k]); return acc; };

const files = [...new Set([...fs.readdirSync(A), ...fs.readdirSync(B)])].filter(f => f.endsWith('.json') && (!only || only.split(',').includes(f))).sort();
let differ = 0;
for (const f of files) {
  const a = read(A, f), b = read(B, f);
  if (same(a, b)) { console.log(`${f}: identical`); continue; }
  differ++;
  if (a === undefined || b === undefined) { console.log(`${f}: only in ${a === undefined ? B : A}`); continue; }
  console.log(`${f}: differs`);
  const top = [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => !same(a[k], b[k]));
  for (const k of top.filter(k => k !== 'types' && k !== 'padFeatures')) console.log(`  ${k}: ${JSON.stringify(a[k])?.slice(0, 200)} -> ${JSON.stringify(b[k])?.slice(0, 200)}`);
  if (top.includes('types')) {
    const acc = { onlyA: [], onlyB: [], bits: [] }, other = [];
    for (const t of [...new Set([...Object.keys(a.types || {}), ...Object.keys(b.types || {})])].sort()) {
      const x = a.types?.[t] || {}, y = b.types?.[t] || {};
      merge(acc, diffFeatures(x.features, y.features, `${t} `));
      for (const k of [...new Set([...Object.keys(x), ...Object.keys(y)])]) if (k !== 'features' && !same(x[k], y[k])) other.push(`${t} ${k}: ${JSON.stringify(x[k])?.slice(0, 120)} -> ${JSON.stringify(y[k])?.slice(0, 120)}`);
    }
    const pip = s => /^\S+ \S+(->|=-)/.test(s);
    for (const [kind, sel] of [['PIP', pip], ['setting', s => !pip(s)]]) {
      show(`${kind} features only in ${A}`, acc.onlyA.filter(sel));
      show(`${kind} features only in ${B}`, acc.onlyB.filter(sel));
      show(`${kind} features with other bits`, acc.bits.filter(sel));
    }
    show('other keys of the types', other);
  }
  if (top.includes('padFeatures')) {
    const acc = { onlyA: [], onlyB: [], bits: [] };
    for (const p of [...new Set([...Object.keys(a.padFeatures || {}), ...Object.keys(b.padFeatures || {})])].sort()) merge(acc, diffFeatures(a.padFeatures?.[p], b.padFeatures?.[p], `${p} `));
    show(`pad features only in ${A}`, acc.onlyA);
    show(`pad features only in ${B}`, acc.onlyB);
    show('pad features with other bits', acc.bits);
  }
}
console.log(`${files.length} files, ${differ} differ`);
// --resolved: s3e-tiles.json as bitgen reads it (makeDb, featureBits): every type's features with the
// ones it shares (sameAs, shift, rename), so that an own feature equal to the shared one, or a
// feature given to every type of a switch box, compares as what it sets
if (resolved) {
  const a = read(A, 's3e-tiles.json'), b = read(B, 's3e-tiles.json');
  const da = makeDb({ layout: {}, lut: {}, tiles: a }), dbb = makeDb({ layout: {}, lut: {}, tiles: b });
  const acc = { onlyA: [], onlyB: [], bits: [] };
  let same = 0;
  for (const t of [...new Set([...Object.keys(da.types), ...Object.keys(dbb.types)])].sort()) {
    const x = da.types[t], y = dbb.types[t];
    const fs = new Set([...(x?.feats.keys() || []), ...(y?.feats.keys() || [])]);
    for (const f of [...fs].sort()) {
      const p = featureBits(x, f), q = featureBits(y, f);
      if (p === undefined && q === undefined) continue;
      if (q === undefined) acc.onlyA.push(`${t} ${f} [${p.join(' ')}]`);
      else if (p === undefined) acc.onlyB.push(`${t} ${f} [${q.join(' ')}]`);
      else if (bitsKey(p) !== bitsKey(q)) acc.bits.push(`${t} ${f} [${p.join(' ')}] -> [${q.join(' ')}]`);
      else same++;
    }
  }
  console.log(`s3e-tiles.json resolved: ${same} features the same`);
  show(`features only in ${A}`, acc.onlyA);
  show(`features only in ${B}`, acc.onlyB);
  show('features with other bits', acc.bits);
}
if (missingFile) {
  // (a feature b-dir has through the type it shares, sameAs, is not missing)
  const a = read(A, 's3e-tiles.json') || { types: {} }, b = makeDb({ layout: {}, lut: {}, tiles: read(B, 's3e-tiles.json') || { types: {} } });
  const types = {};
  for (const [t, x] of Object.entries(a.types)) for (const [f, bits] of Object.entries(x.features || {})) if (featureBits(b.types[t], f) === undefined) ((types[t] ||= { features: {} }).features[f] = bits);
  fs.writeFileSync(missingFile, JSON.stringify({ types }));
}
