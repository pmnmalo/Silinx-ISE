// Silinx toolchain - a 7-series .bit read back into its features (#3145), as Project X-Ray's bitread and bit2fasm do
// (tools/bitread.cc, utils/bit2fasm.py, prjxray/fasm_disassembler.py): the check of the bitstream that needs no Vivado.
//
// Written apart from the generator (bitdb.js, frames.js, bitstream.js), so that the check does not share its mistakes:
// it reads the bit database's file itself (research/xc7/build-db.mjs's format: Project X-Ray's tilegrid, segment bits
// and pseudo-PIPs) and the .bit's configuration packets (UG470) itself.
// - bitIndexXc7: the database as an index: each tile's windows (a block's frames and words; an alias to another type's
//   bits, its window moved back by the alias's start) and each type's features with their bits;
// - readBitFramesXc7 (bitread): the frames the .bit writes, from the FAR it writes FDRI's data at, the address going on
//   through the part's frames and the fabric's tiles', two frames of padding after each row; word 50's low 13 bits (the
//   frame's ECC) left out;
// - framesToFeatures (bit2fasm): the features whose bits a tile's frames hold (each bit set set, each bit cleared clear),
//   in the tiles with a bit set; a feature with no bit set (a zero encoding) marked; the bits set no feature explains.

export const FRAME_WORDS = 101;
const BLOCKS = ['CLB_IO_CLK', 'BLOCK_RAM', 'CFG_CLB'];
/** Word 50's bits that are a frame's ECC, not configuration. */
export const ECC_WORD = 50, ECC_MASK = 0x1fff;

/** A configuration bit's key: frame address * 4096 + bit of the frame. */
export const bitKey = (frame, bit) => frame * 4096 + bit;
export const keyFrame = k => Math.floor(k / 4096);
export const keyBit = k => k % 4096;

// a segment bit "!12_23": [frame from the base, bit from the window's first word, set]
function segBit(s) {
  const m = /^(!?)(\d+)_(\d+)$/.exec(s);
  if (!m) throw new Error(`not a segment bit: ${s}`);
  return [Number(m[2]), Number(m[3]), m[1] === ''];
}

// a type's segment text (build-db.mjs: "<feature> <bits>…", a run "<feature>[] <bit of 0> <bit of 1> …") into
// Map(feature → bits)
function segText(text, out = new Map()) {
  for (const line of text ? text.split('\n') : []) {
    const [name, ...bits] = line.split(' ');
    if (name.endsWith('[]')) bits.forEach((b, a) => out.set(`${name.slice(0, -2)}[${a}]`, [segBit(b)]));
    else out.set(name, bits.map(segBit));
  }
  return out;
}

/**
 * The bit database's object (bitdb/xc7/<part>.json.gz, unpacked) as an index: { raw, part, tiles: Map(name → { type,
 * windows: [{ block, base, frames, offset, words, type (the bits' type), shift (words), sites (the tile's site → the
 * bits' type's) }] }), type(name) → { features: Map(block → Map(feature → [[frame, bit, set]])), ppips: Set } | null,
 * frames: [every frame address of the tiles, sorted] }.
 */
export function bitIndexXc7(raw) {
  if (raw?.format !== 1) throw new Error('not a 7-series bit database (format 1)');
  const tiles = new Map(), frameSet = new Set();
  for (const [name, [type, blocks]] of Object.entries(raw.tiles)) {
    const windows = blocks.map(([block, base, frames, offset, words, alias]) => {
      for (let i = 0; i < frames; i++) frameSet.add(base + i);
      return { block, base, frames, offset, words, type: alias ? alias[0] : type, shift: alias ? alias[1] : 0, sites: alias ? alias[2] : {} };
    });
    tiles.set(name, { type, windows });
  }
  const types = new Map();
  const type = name => {
    if (types.has(name)) return types.get(name);
    const e = raw.types[name];
    let t = null;
    if (e) {
      const text = k => (typeof e[k] === 'string' && e[k][0] === '=' ? raw.types[e[k].slice(1)][k] : e[k]);
      t = { features: new Map([[0, segText(text('segbits'))], [1, segText(text('ramSegbits'))]]), ppips: new Set(e.ppips ? e.ppips.split('\n') : []) };
    }
    types.set(name, t);
    return t;
  };
  return { raw, part: raw.part, tiles, type, frames: [...frameSet].sort((a, b) => a - b) };
}

/**
 * A feature's bits in a tile: [[frame address, bit of the frame, set]] for its key in the database ('SLICEL_X0.ALUT.INIT[3]'),
 * [] for a pseudo-PIP, null for a feature the tile does not have. A bit past the frame's words is left out (as
 * fasm2frames leaves it).
 */
export function tileFeatureBits(index, tileName, key) {
  const tile = index.tiles.get(tileName);
  if (!tile) return null;
  if (index.type(tile.type)?.ppips.has(key)) return [];
  for (const w of tile.windows) {
    const t = index.type(w.type);
    if (!t) continue;
    const dot = key.indexOf('.'), site = dot < 0 ? key : key.slice(0, dot);
    const k = Object.hasOwn(w.sites, site) ? w.sites[site] + key.slice(site.length) : key;
    if (w.type !== tile.type && t.ppips.has(k)) return [];
    const bits = t.features.get(w.block === 1 ? 1 : 0)?.get(k);
    if (!bits) continue;
    return bits.map(([c, b, set]) => [w.base + c, (w.offset - w.shift) * 32 + b, set]).filter(([, b]) => b >= 0 && b < FRAME_WORDS * 32);
  }
  return null;
}

/**
 * The frames a .bit writes (bitread): { frames: Map(frame address → Uint32Array(101), word 50's ECC bits cleared),
 * idcode, header: { a, b, c, d } }. Every frame from the FAR written before FDRI's data, the address going on through
 * the part's frames and the tiles' in order, two frames of padding (zeros) after each row of a block type and half
 * and at the end. Throws for a file with no sync word, no frame data, data past the part's frames or padding not zeros.
 */
export function readBitFramesXc7(bytes, index) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const header = {};
  if (bytes[11] === 0 && bytes[12] === 1) {
    for (let k = 13; k + 3 <= bytes.length && bytes[k] >= 0x61 && bytes[k] <= 0x64;) {
      const n = (bytes[k + 1] << 8) | bytes[k + 2];
      header[String.fromCharCode(bytes[k])] = new TextDecoder().decode(bytes.subarray(k + 3, k + 2 + n));
      k += 3 + n;
    }
  }
  let k = 0;
  while (k + 4 <= bytes.length && view.getUint32(k) !== 0xaa995566) k++;
  if (k + 4 > bytes.length) throw new Error('not a 7-series bitstream: no sync word');
  const order = addressOrder(index);
  const frames = new Map();
  let far = 0, reg = 0, idcode = null, data = false;
  for (k += 4; k + 4 <= bytes.length;) {
    const h = view.getUint32(k);
    k += 4;
    const kind = h >>> 29;
    if (kind !== 1 && kind !== 2) continue;
    const op = (h >>> 27) & 3, n = kind === 1 ? h & 0x7ff : h & 0x7ffffff;
    if (kind === 1) reg = (h >>> 13) & 0x3fff;
    if (k + 4 * n > bytes.length) throw new Error('not a 7-series bitstream: a packet past the end of the file');
    if (op === 2 && reg === 0x01 && n) far = view.getUint32(k + 4 * (n - 1));
    if (op === 2 && reg === 0x0c && n) idcode = view.getUint32(k);
    if (op === 2 && reg === 0x02 && n) { writeFrames(view, k, n, far, order, frames); data = true; }
    k += 4 * n;
  }
  if (!data) throw new Error('not a 7-series bitstream: no frame data');
  return { frames, idcode, header };
}

// the frame addresses FDRI's data goes through: the part's (its rows' columns' frames) and the tiles', sorted, and where
// a row ends (the next address of another block type, half or row): Map(address → its next, or null), padded rows
function addressOrder(index) {
  const all = new Set(index.frames);
  for (const [half, rows] of Object.entries(index.raw.regions)) {
    for (const [row, buses] of Object.entries(rows)) {
      for (const [bus, cols] of Object.entries(buses)) {
        cols.forEach((n, col) => { for (let m = 0; m < n; m++) all.add(((BLOCKS.indexOf(bus) << 23) | ((half === 'bottom' ? 1 : 0) << 22) | (Number(row) << 17) | (col << 7) | m) >>> 0); });
      }
    }
  }
  const list = [...all].sort((a, b) => a - b), at = new Map(list.map((a, i) => [a, i]));
  return { list, at, rowEnd: i => i === list.length - 1 || (list[i] >>> 17) !== (list[i + 1] >>> 17) };
}

function writeFrames(view, k, n, far, order, frames) {
  let i = order.at.get(far);
  if (i === undefined) throw new Error(`FDRI's data starts at 0x${far.toString(16)}, not a frame of the part`);
  for (let w = 0; w < n;) {
    if (i >= order.list.length) {
      // the last row's padding: zeros only
      for (; w < n; w++) if (view.getUint32(k + 4 * w)) throw new Error('frame data past the part\'s last frame');
      return;
    }
    if (w + FRAME_WORDS > n) throw new Error(`the frame data ends inside frame 0x${order.list[i].toString(16)}`);
    const f = Uint32Array.from({ length: FRAME_WORDS }, (_, j) => view.getUint32(k + 4 * (w + j)));
    f[ECC_WORD] &= ~ECC_MASK;
    frames.set(order.list[i], f);
    w += FRAME_WORDS;
    if (order.rowEnd(i)) {
      for (let j = 0; j < 2 * FRAME_WORDS && w < n; j++, w++) {
        if (view.getUint32(k + 4 * w)) throw new Error(`the padding after frame 0x${order.list[i].toString(16)} is not zeros`);
      }
    }
    i++;
  }
}

/** The bits set of frames (Map(address → words)), ECC's left out: a Set of bitKey. */
export function setBits(frames) {
  const out = new Set();
  for (const [a, w] of frames) {
    for (let i = 0; i < w.length; i++) {
      let x = i === ECC_WORD ? w[i] & ~ECC_MASK : w[i];
      for (let b = 0; x; b++, x >>>= 1) if (x & 1) out.add(bitKey(a, i * 32 + b));
    }
  }
  return out;
}

/**
 * The features of frames (bit2fasm): { features: [{ tile, key, bits, zero }] (zero: a feature of no bit set, matched by
 * its bits clear), unknown: [bitKey] (bits set in no feature found, or in no tile) }. Only the tiles with a bit set in
 * one of their windows are read.
 */
export function framesToFeatures(frames, index) {
  const set = setBits(frames), explained = new Set(), features = [];
  const owner = new Map();   // frame address → the windows over it
  for (const [name, t] of index.tiles) for (const w of t.windows) for (let i = 0; i < w.frames; i++) {
    if (!owner.has(w.base + i)) owner.set(w.base + i, []);
    owner.get(w.base + i).push([name, w]);
  }
  const busy = new Set();
  for (const k of set) {
    const b = keyBit(k), word = b >> 5;
    for (const [name, w] of owner.get(keyFrame(k)) || []) if (word >= w.offset && word < w.offset + w.words) busy.add(name);
  }
  for (const name of [...busy].sort()) {
    const tile = index.tiles.get(name);
    for (const w of tile.windows) {
      const t = index.type(w.type);
      if (!t) continue;
      const inverse = Object.fromEntries(Object.entries(w.sites).map(([a, b]) => [b, a]));
      for (const [key, rel] of t.features.get(w.block === 1 ? 1 : 0)) {
        const bits = rel.map(([c, b, s]) => [w.base + c, (w.offset - w.shift) * 32 + b, s]);
        // (a feature of the aliased type outside the tile's window is another tile's)
        if (!bits.length || bits.some(([, b]) => b < w.offset * 32 || b >= (w.offset + w.words) * 32)) continue;
        if (!bits.every(([f, b, s]) => set.has(bitKey(f, b)) === s)) continue;
        const dot = key.indexOf('.'), site = dot < 0 ? key : key.slice(0, dot);
        const own = Object.hasOwn(inverse, site) ? inverse[site] + key.slice(site.length) : key;
        features.push({ tile: name, key: own, bits, zero: !bits.some(([, , s]) => s) });
        for (const [f, b, s] of bits) if (s) explained.add(bitKey(f, b));
      }
    }
  }
  return { features, unknown: [...set].filter(k => !explained.has(k)).sort((a, b) => a - b) };
}
