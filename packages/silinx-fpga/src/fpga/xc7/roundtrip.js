// Silinx toolchain - the 7-series' bitstream checked against nextpnr's FASM with no Vivado and no board (#3145), on
// readback.js's index of the bit database (apart from the generator's lookups):
// - referenceFrames: the frames Project X-Ray's fasm2frames makes of a FASM (utils/fasm2frames.py, fasm_assembler.py):
//   every frame of the tiles zeros, each feature's bits set, and what fasm2frames adds: the part's required features,
//   PUDC_B's pull-up when asked and unused, a bank's STEPDOWN on its unused IOB33s and its HCLK_IOI3;
// - roundTrip: a .bit's frames read back into features (bit2fasm) and compared with the FASM by bits, not by names (the
//   spike of #2305): every bit a FASM feature sets is set and every bit it clears is clear (none lost), and every bit set
//   is one a FASM feature or an added one sets (none stray, none of no feature). The names that differ are counted:
//   the FASM's pseudo-PIPs (no bits), the features read back that the FASM does not name: zero encodings (no bit set),
//   aliases (their bits set all a FASM feature's), the added ones.
import { parseFasm } from './fasm.js';
import { FRAME_WORDS, bitKey, keyFrame, keyBit, setBits, tileFeatureBits, framesToFeatures } from './readback.js';

// PUDC_B's input with its pull-up, the lines fasm2frames adds (with prjxray-db's IN_ONLY name, as the database has it)
const PUDC_B = ['LVCMOS12_LVCMOS15_LVCMOS18_LVCMOS25_LVCMOS33_LVDS_25_LVTTL_SSTL135_SSTL15_TMDS_33.IN_ONLY', 'LVCMOS25_LVCMOS33_LVTTL.IN', 'PULLTYPE.PULLUP'];

/**
 * A FASM text's features, one per bit it sets, named as the database names them: [{ tile, key, line }] ('SLICEL_X0.ALUT.INIT[5]';
 * the bit at address 0 named without its address when the database has it so). A value of 0 sets none.
 */
export function fasmKeys(index, text) {
  const out = [];
  for (const f of parseFasm(text)) {
    const dot = f.feature.indexOf('.');
    const tile = dot < 0 ? f.feature : f.feature.slice(0, dot), name = dot < 0 ? '' : f.feature.slice(dot + 1);
    const width = f.start === null ? 1 : (f.end ?? f.start) - f.start + 1;
    for (let i = 0; i < width; i++) {
      if (!((f.value >> BigInt(i)) & 1n)) continue;
      const a = (f.start ?? 0) + i;
      const plain = a === 0 && (tileFeatureBits(index, tile, name) !== null || tileFeatureBits(index, tile, `${name}[0]`) === null);
      out.push({ tile, key: plain ? name : `${name}[${a}]`, line: f.line });
    }
  }
  return out;
}

/** The features fasm2frames adds to a FASM's (given as fasmKeys'): [{ tile, key, why }] (why: required, pudc, stepdown). */
export function addedFeatures(index, keys, { pudcPullup = false } = {}) {
  const raw = index.raw, out = [];
  const add = (feature, why) => { const d = feature.indexOf('.'); out.push({ tile: feature.slice(0, d), key: feature.slice(d + 1), why }); };
  for (const f of raw.requiredFeatures) add(f, 'required');
  const all = [...keys, ...out];
  if (pudcPullup && raw.pudcB) {
    const [tile, site] = raw.pudcB;
    if (!all.some(k => k.tile === tile && k.key.split('.')[0] === site)) for (const t of PUDC_B) add(`${tile}.${site}.${t}`, 'pudc');
  }
  // a bank's STEPDOWN: the tags with STEPDOWN in their name an IOB33 of the bank sets, on its IOB33 sites no feature names
  const bankOf = new Map(Object.entries(raw.banks).flatMap(([b, ts]) => ts.map(t => [t, b])));
  const tags = new Map(), used = new Set();
  for (const k of [...keys, ...out]) {
    const p = k.key.split('.');
    if (p.length < 2) continue;
    if (k.tile.includes('IOB33')) used.add(`${k.tile}.${p[0]}`);
    const tag = p.slice(1).join('.');
    if (!tag.includes('STEPDOWN')) continue;
    const bank = bankOf.get(k.tile);
    if (bank === undefined) throw new Error(`${k.tile}.${k.key}: the tile ${k.tile} is in no bank of ${raw.part}`);
    if (!tags.has(bank)) tags.set(bank, new Set());
    tags.get(bank).add(tag);
  }
  for (const [bank, bankTags] of tags) {
    for (const tile of raw.banks[bank]) {
      if (tile.includes('IOB33')) for (const site of raw.iobSites[tile] || []) if (!used.has(`${tile}.${site}`)) for (const tag of bankTags) add(`${tile}.${site}.${tag}`, 'stepdown');
      if (tile.includes('HCLK_IOI3')) add(`${tile}.STEPDOWN`, 'stepdown');
    }
  }
  return out;
}

// the bits of features (fasmKeys' or addedFeatures'): { set: Map(bitKey → feature), clear: Map, pseudo: [...], missing: [...] }
function bitsOf(index, list) {
  const set = new Map(), clear = new Map(), pseudo = [], missing = [];
  for (const k of list) {
    const bits = tileFeatureBits(index, k.tile, k.key);
    if (bits === null) { missing.push(k); continue; }
    if (!bits.length) { pseudo.push(k); continue; }
    for (const [f, b, s] of bits) (s ? set : clear).set(bitKey(f, b), `${k.tile}.${k.key}`);
  }
  return { set, clear, pseudo, missing };
}

/**
 * The frames fasm2frames makes of a FASM: Map(frame address → Uint32Array(101)), every frame of the tiles, in address
 * order. Throws for a feature the database does not have, or a bit set by one feature and cleared by another.
 */
export function referenceFrames(index, text, options = {}) {
  const keys = fasmKeys(index, text);
  const { set, clear, missing } = bitsOf(index, [...keys, ...addedFeatures(index, keys, options)]);
  if (missing.length) throw new Error(`features the database does not have: ${missing.map(k => `${k.tile}.${k.key}`).join(', ')}`);
  for (const [k, by] of set) if (clear.has(k)) throw new Error(`bit ${keyBit(k)} of frame 0x${keyFrame(k).toString(16)} set by ${by} and cleared by ${clear.get(k)}`);
  const frames = new Map(index.frames.map(a => [a, new Uint32Array(FRAME_WORDS)]));
  for (const k of set.keys()) {
    const w = frames.get(keyFrame(k)), b = keyBit(k);
    w[b >> 5] = (w[b >> 5] | (1 << (b & 31))) >>> 0;
  }
  return frames;
}

/**
 * A .bit's frames (readBitFramesXc7's) against the FASM it was made of, by bits: { lost: [bit and feature], stray: [bitKey],
 * unknown: [bitKey], missing: [FASM features the database does not have], counts: { features (the FASM's, one per bit),
 * pseudoPips, read (the features read back), zeroEncodings, aliases, added: { required, pudc, stepdown }, extra }, extra:
 * [features read back, of a bit set, the FASM does not name, no alias and not added] }. The bitstream is the FASM's when
 * lost, stray, unknown, missing and extra are empty.
 */
export function roundTrip(index, text, frames, options = {}) {
  const keys = fasmKeys(index, text), added = addedFeatures(index, keys, options);
  const fasm = bitsOf(index, keys), add = bitsOf(index, added);
  const present = setBits(frames);
  const lost = [];
  for (const [k, by] of fasm.set) if (!present.has(k)) lost.push(`bit ${keyBit(k)} of frame 0x${keyFrame(k).toString(16)} clear, set by ${by}`);
  for (const [k, by] of fasm.clear) if (present.has(k)) lost.push(`bit ${keyBit(k)} of frame 0x${keyFrame(k).toString(16)} set, cleared by ${by}`);
  const stray = [...present].filter(k => !fasm.set.has(k) && !add.set.has(k));

  const { features, unknown } = framesToFeatures(frames, index);
  const named = new Set(keys.map(k => `${k.tile}.${k.key}`));
  const addedNames = new Map(added.map(k => [`${k.tile}.${k.key}`, k.why]));
  const counts = { features: keys.length, pseudoPips: fasm.pseudo.length, read: features.length, zeroEncodings: 0, aliases: 0,
    added: { required: 0, pudc: 0, stepdown: 0 }, extra: 0 };
  const extra = [];
  for (const f of features) {
    const name = `${f.tile}.${f.key}`;
    if (named.has(name)) continue;
    if (f.zero) counts.zeroEncodings++;
    else if (addedNames.has(name)) counts.added[addedNames.get(name)]++;
    else if (f.bits.every(([fr, b, s]) => !s || fasm.set.has(bitKey(fr, b)))) counts.aliases++;
    else { counts.extra++; extra.push(name); }
  }
  return { lost, stray, unknown, missing: fasm.missing.map(k => `${k.tile}.${k.key}`), extra, counts };
}
