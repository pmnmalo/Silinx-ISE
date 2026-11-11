// Silinx toolchain - the 7-series' configuration frames of a design's FASM (#3144), as Project X-Ray's fasm2frames
// makes them (utils/fasm2frames.py, prjxray/fasm_assembler.py), so that the same FASM gives the same frames.
//
// Every frame of the fabric's tiles, 101 words of zeros, then each feature's bits set (or cleared: "!"); a bit set by
// one line and cleared by another is an error, and so is a feature the database does not have (all of them named
// together, after the whole text). What fasm2frames adds to the FASM:
// - the part's required features (<part>/required_features.fasm in prjxray-db; none for the xc7a35t);
// - PUDC_B's pull-up when the design does not use that pin (only when asked, as fasm2frames' --emit_pudc_b_pullup);
// - a bank's STEPDOWN: when one IOB33 of a bank sets a feature with STEPDOWN in its name, every unused IOB33 of the
//   bank sets it too, and the bank's HCLK_IOI3 sets its STEPDOWN.
import { parseFasm, canonicalFeatures } from './fasm.js';
import { FeatureLookupError } from './bitdb.js';

export const FRAME_WORDS = 101;

/** A bit set by one FASM line and cleared by another (Project X-Ray's FasmInconsistentBits). */
export class InconsistentBitsError extends Error {
  constructor(message) { super(message); this.name = 'InconsistentBitsError'; }
}

// PUDC_B's input with a pull-up: fasm2frames' lines, IN_ONLY named as prjxray-db names it now (fasm2frames' own name, without
// LVDS_25 and TMDS_33, is an older database's and is not found in this one)
const PUDC_B = ['LVCMOS12_LVCMOS15_LVCMOS18_LVCMOS25_LVCMOS33_LVDS_25_LVTTL_SSTL135_SSTL15_TMDS_33.IN_ONLY', 'LVCMOS25_LVCMOS33_LVTTL.IN', 'PULLTYPE.PULLUP'];
const hex8 = n => n.toString(16).toUpperCase().padStart(8, '0');

/**
 * The frames of a FASM text: { frames: Map(frame address → Uint32Array(101)), features } (features: the ones set, the
 * added ones too). pudcPullup: PUDC_B's pull-up when unused (fasm2frames --emit_pudc_b_pullup). Throws FasmError (a line
 * that is not FASM), FeatureLookupError (the features the database does not have, one a line), InconsistentBitsError.
 */
export function fasmToFrames(db, text, { pudcPullup = false } = {}) {
  const bits = new Map();   // frame * 4096 + bit of the frame → [set, line]
  const features = [];
  const setBit = (frame, bit, set, line) => {
    if (bit >= FRAME_WORDS * 32) return;   // (fasm2frames warns and leaves it)
    const k = frame * 4096 + bit, had = bits.get(k);
    if (had) {
      if (had[0] !== set) throw new InconsistentBitsError(`FASM line "${line}" wanted to ${set ? 'set' : 'clear'} bit ${bit} of frame 0x${hex8(frame)} but was ${set ? 'cleared' : 'set'} by FASM line "${had[1]}"`);
      return;
    }
    bits.set(k, [set, line]);
  };
  // add_fasm_line: a feature's single bits, a missing one noted
  const add = (f, missing) => {
    features.push(f);
    const dot = f.feature.indexOf('.');
    const tile = dot < 0 ? f.feature : f.feature.slice(0, dot), feature = dot < 0 ? '' : f.feature.slice(dot + 1);
    for (const c of canonicalFeatures(f)) {
      try {
        for (const [frame, bit, set] of db.featureBits(tile, feature, c.address, f.text)) setBit(frame, bit, set, f.text);
      } catch (e) {
        if (!(e instanceof FeatureLookupError)) throw e;
        missing.push(e.message);
      }
    }
  };
  const addAll = (list, missing = []) => {
    for (const f of list) add(f, missing);
    if (missing.length) throw new FeatureLookupError(missing.join('\n'));
  };
  addAll([...parseFasm(text), ...(db.requiredFeatures.length ? parseFasm(db.requiredFeatures.join('\n')) : [])]);

  if (pudcPullup && db.pudcB) {
    const [tile, site] = db.pudcB;
    const used = features.some(f => { const p = f.feature.split('.'); return p[0] === tile && p[1] === site; });
    if (!used) addAll(parseFasm(PUDC_B.map(t => `${tile}.${site}.${t}`).join('\n')));
  }
  addAll(stepdown(db, features));
  return { frames: framesOf(db, bits), features };
}

/** The features a bank's STEPDOWN adds to the given ones (fasm2frames run(): stepdown_tags, used_iob_sites). */
export function stepdown(db, features) {
  const tags = new Map(), used = new Set();
  for (const f of features) {
    if (f.value === 0n) continue;
    const p = f.feature.split('.');
    if (p.length < 3) continue;
    const [tile, site] = p, tag = p.slice(2).join('.');
    if (tile.includes('IOB33')) used.add(`${tile}.${site}`);
    if (!tag.includes('STEPDOWN')) continue;
    const bank = db.tileBank.get(tile);
    if (bank === undefined) throw new FeatureLookupError(`${f.feature}: the tile ${tile} is in no bank of ${db.part}`);
    if (!tags.has(bank)) tags.set(bank, new Set());
    tags.get(bank).add(tag);
  }
  const out = [];
  for (const [bank, bankTags] of tags) {
    for (const tile of db.banks[bank]) {
      if (tile.includes('IOB33')) {
        for (const site of db.iobSites[tile] || []) {
          if (!used.has(`${tile}.${site}`)) for (const tag of bankTags) out.push(`${tile}.${site}.${tag}`);
        }
      }
      if (tile.includes('HCLK_IOI3')) out.push(`${tile}.STEPDOWN`);
    }
  }
  return out.length ? parseFasm(out.join('\n')) : [];
}

// every frame of the fabric's tiles, zeros, with the bits set (FasmAssembler.get_frames, not sparse)
function framesOf(db, bits) {
  const frames = new Map();
  const frame = a => { let f = frames.get(a); if (!f) frames.set(a, f = new Uint32Array(FRAME_WORDS)); return f; };
  for (const name of db.tiles()) for (const b of db.tile(name).blocks.values()) for (let i = 0; i < b.frames; i++) frame(b.base + i);
  for (const [k, [set]] of bits) {
    const f = frame(Math.floor(k / 4096)), bit = k % 4096;
    if (set) f[bit >> 5] = (f[bit >> 5] | (1 << (bit & 31))) >>> 0;
  }
  return new Map([...frames].sort((a, b) => a[0] - b[0]));
}

/** The frames as fasm2frames writes its .frm: a line per frame, "0x<address> 0x<word>,…", in address order. */
export function framesText(frames) {
  return [...frames].sort((a, b) => a[0] - b[0]).map(([a, w]) => `0x${hex8(a)} ${Array.from(w, x => `0x${hex8(x)}`).join(',')}\n`).join('');
}

/** A .frm text read back: Map(frame address → Uint32Array(101)); a frame of another length is an error. */
export function readFramesText(text) {
  const frames = new Map();
  for (const [i, line] of String(text).split(/\r?\n/).entries()) {
    if (!line || line[0] === '#') continue;
    const [addr, data = ''] = line.split(' ');
    const words = data.split(',');
    if (words.length !== FRAME_WORDS) throw new Error(`frames line ${i + 1}: ${words.length} words, not ${FRAME_WORDS}`);
    frames.set(parseInt(addr, 16), Uint32Array.from(words, w => parseInt(w, 16)));
  }
  return frames;
}
