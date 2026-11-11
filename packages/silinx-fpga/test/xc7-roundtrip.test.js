// packages/silinx-fpga/src/fpga/xc7/readback.js and roundtrip.js (#3145): the 7-series' bitstream checked with no Vivado
// and no board, apart from the generator (bitdb.js, frames.js, bitstream.js). The references (test/fixtures/xc7): the
// FASM of three examples and the .bit Project X-Ray's fasm2frames and xc7frames2bit made of it (the fork's CI). The
// reference frames (Silinx's fasm2frames on its own index of the database) Project X-Ray's, and the generator's; the
// round trip (bitread, bit2fasm, compared by bits) clean on Project X-Ray's .bit and Silinx's, the names that differ
// counted; a bit lost, a stray bit, a bit of no feature found; what fasm2frames adds (a bank's STEPDOWN, PUDC_B's
// pull-up), an alias of shared bits; a .bit that is not one.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { bitIndexXc7, tileFeatureBits, readBitFramesXc7, framesToFeatures, setBits, bitKey, ECC_WORD, ECC_MASK, FRAME_WORDS } from '../src/fpga/xc7/readback.js';
import { fasmKeys, addedFeatures, referenceFrames, roundTrip } from '../src/fpga/xc7/roundtrip.js';
import { loadBitDbXc7, XC7_DB_DIR } from '../src/fpga/xc7/bitdb-node.js';
import { fasmToFrames } from '../src/fpga/xc7/frames.js';
import { bitstreamXc7 } from '../src/fpga/xc7/bitstream.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'xc7');
const gz = f => zlib.gunzipSync(fs.readFileSync(path.join(FIX, f)));
const PART = 'xc7a35tcpg236-1';
const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(XC7_DB_DIR, `${PART}.json.gz`))).toString('utf8'));
const index = bitIndexXc7(raw), db = loadBitDbXc7(PART);
const DESIGNS = ['blinky', 'vga', 'micro80'];
const fasmOf = name => gz(`${name}.fasm.gz`).toString('utf8');
const xrayBit = name => new Uint8Array(gz(`${name}.bitstream.gz`));
const silinxBit = (text, options) => bitstreamXc7(fasmToFrames(db, text, options).frames, db, { now: new Date(0) });
const clean = r => ({ lost: r.lost, stray: r.stray, unknown: r.unknown, missing: r.missing, extra: r.extra });
const CLEAN = { lost: [], stray: [], unknown: [], missing: [], extra: [] };
const NONE = { required: 0, pudc: 0, stepdown: 0 };

test('xc7 reference frames: Project X-Ray\'s fasm2frames\' (read back from its .bit), and the generator\'s, for the three FASMs', () => {
  for (const name of DESIGNS) {
    const ref = referenceFrames(index, fasmOf(name));
    const back = readBitFramesXc7(xrayBit(name), index);
    assert.deepEqual([back.idcode, back.header.b, back.header.a], [raw.idcode, PART, `build/${name}.frames;Generator=xc7frames2bit`], name);
    // the .bit: the part's 5408 frames, the tiles' 4974 the reference's word for word (the ECC left out), the others zeros
    assert.deepEqual([back.frames.size, ref.size], [5408, 4974], name);
    for (const [a, w] of back.frames) assert.deepEqual(w, ref.get(a) ?? new Uint32Array(FRAME_WORDS), `${name} 0x${a.toString(16)}`);
    // the generator's frames the same
    assert.deepEqual(fasmToFrames(db, fasmOf(name)).frames, ref, name);
  }
  // an empty design: every frame zeros
  assert.ok([...referenceFrames(index, '').values()].every(w => w.every(x => x === 0)));
  assert.throws(() => referenceFrames(index, 'CLBLL_L_X2Y37.SLICEL_X0.NOSUCH'), /^Error: features the database does not have: CLBLL_L_X2Y37\.SLICEL_X0\.NOSUCH$/);
  assert.throws(() => referenceFrames(index, 'INT_L_X2Y37.BYP_ALT0.BYP_BOUNCE_N3_3\nINT_L_X2Y37.BYP_ALT0.BYP_BOUNCE_N3_7'),
    /^Error: bit \d+ of frame 0x[0-9a-f]+ set by INT_L_X2Y37\.BYP_ALT0\.BYP_BOUNCE_N3_(3|7) and cleared by INT_L_X2Y37\.BYP_ALT0\.BYP_BOUNCE_N3_(3|7)$/);
});

test('xc7 round trip: the three FASMs\' .bit (Project X-Ray\'s and Silinx\'s) read back: no bit lost, none stray; the names that differ counted', () => {
  // the FASM's features one per bit; its pseudo-PIPs (no bits); the features read back; the zero encodings among them
  const COUNTS = {
    blinky: { features: 9816, pseudoPips: 1444, read: 9490, zeroEncodings: 1121 },
    vga: { features: 8583, pseudoPips: 1185, read: 8097, zeroEncodings: 701 },
    micro80: { features: 17849, pseudoPips: 2597, read: 16487, zeroEncodings: 1237 },
  };
  for (const name of DESIGNS) {
    const text = fasmOf(name);
    for (const [who, bit] of [['Project X-Ray', xrayBit(name)], ['Silinx', silinxBit(text)]]) {
      const r = roundTrip(index, text, readBitFramesXc7(bit, index).frames);
      assert.deepEqual(clean(r), CLEAN, `${name} (${who})`);
      assert.deepEqual(r.counts, { ...COUNTS[name], aliases: 0, added: NONE, extra: 0 }, `${name} (${who})`);
    }
    // every FASM feature with bits is read back under its own name (a FASM may name one twice)
    const keys = fasmKeys(index, text), read = new Set(framesToFeatures(readBitFramesXc7(xrayBit(name), index).frames, index).features.map(f => `${f.tile}.${f.key}`));
    assert.deepEqual(keys.filter(k => tileFeatureBits(index, k.tile, k.key).length && !read.has(`${k.tile}.${k.key}`)), [], name);
  }
});

test('xc7 round trip: a bit lost, a stray bit (another feature read back), a bit of no feature: each found and named', () => {
  const text = fasmOf('blinky'), { frames } = fasmToFrames(db, text);
  const mutated = edit => {
    const f = new Map([...frames].map(([a, w]) => [a, Uint32Array.from(w)]));
    edit(f);
    return roundTrip(index, text, readBitFramesXc7(bitstreamXc7(f, db), index).frames);
  };
  const flip = (f, frame, bit) => { f.get(frame)[bit >> 5] ^= 1 << (bit & 31); };
  // a LUT's bit cleared: lost, its feature named
  const lut = fasmKeys(index, text).find(k => /\.[A-D]LUT\.INIT\[\d+\]$/.test(k.key));
  const [[lf, lb]] = tileFeatureBits(index, lut.tile, lut.key);
  let r = mutated(f => flip(f, lf, lb));
  assert.deepEqual(r.lost, [`bit ${lb} of frame 0x${lf.toString(16)} clear, set by ${lut.tile}.${lut.key}`]);
  assert.deepEqual([r.stray, r.unknown, r.extra], [[], [], []]);
  // a flip-flop's ZINI set in an empty slice: stray, and read back as a feature the FASM does not name
  const [[zf, zb]] = tileFeatureBits(index, 'CLBLL_L_X2Y0', 'SLICEL_X0.AFF.ZINI');
  r = mutated(f => flip(f, zf, zb));
  assert.deepEqual([r.lost, r.stray, r.unknown, r.extra], [[], [bitKey(zf, zb)], [], ['CLBLL_L_X2Y0.SLICEL_X0.AFF.ZINI']]);
  // a bit of a tile no feature of its type has: stray and unknown
  const known = new Set([...index.type('CLBLL_L').features.get(0).values()].flat().map(([c, b]) => `${c}_${b}`));
  const free = Array.from({ length: 36 * 64 }, (_, i) => [i % 36, Math.floor(i / 36)]).find(([c, b]) => !known.has(`${c}_${b}`));
  assert.ok(free, 'a bit no CLBLL_L feature has');
  const w = index.tiles.get('CLBLL_L_X2Y0').windows[0], uf = w.base + free[0], ub = w.offset * 32 + free[1];
  r = mutated(f => flip(f, uf, ub));
  assert.deepEqual([r.lost, r.stray, r.unknown, r.extra], [[], [bitKey(uf, ub)], [bitKey(uf, ub)], []]);
  // a feature the database does not have: missing
  assert.deepEqual(roundTrip(index, 'CLBLL_L_X2Y0.SLICEL_X0.NOSUCH', readBitFramesXc7(silinxBit(''), index).frames).missing, ['CLBLL_L_X2Y0.SLICEL_X0.NOSUCH']);
});

test('xc7 round trip: what fasm2frames adds (a bank\'s STEPDOWN, PUDC_B\'s pull-up) counted as added, an alias of shared bits as an alias', () => {
  const trip = (text, made = {}, checked = made) => roundTrip(index, text, readBitFramesXc7(silinxBit(text, made), index).frames, checked);
  // STEPDOWN on one IOB33 of bank 14: its other IOB33s' sites and its HCLK_IOI3
  const sd = 'LIOB33_X0Y1.IOB_Y0.LVCMOS12_LVCMOS15_LVCMOS18_SSTL135_SSTL15.STEPDOWN';
  const added = addedFeatures(index, fasmKeys(index, sd));
  assert.ok(added.every(a => a.why === 'stepdown') && added.some(a => a.tile === 'HCLK_IOI3_X1Y26' && a.key === 'STEPDOWN'), JSON.stringify(added.slice(0, 3)));
  let r = trip(sd);
  assert.deepEqual(clean(r), CLEAN);
  assert.deepEqual([r.counts.features, r.counts.added], [1, { ...NONE, stepdown: 50 }]);
  // PUDC_B's pull-up: added when asked; a .bit with it checked against a FASM without it: its bits stray, its features extra
  r = trip('', { pudcPullup: true });
  assert.deepEqual([clean(r), r.counts.added], [CLEAN, { ...NONE, pudc: 3 }]);
  r = trip('', { pudcPullup: true }, {});
  assert.equal(r.stray.length, 9);
  assert.deepEqual(r.extra.sort(), ['LIOB33_X0Y43.IOB_Y0.LVCMOS12_LVCMOS15_LVCMOS18_LVCMOS25_LVCMOS33_LVDS_25_LVTTL_SSTL135_SSTL15_TMDS_33.IN_ONLY',
    'LIOB33_X0Y43.IOB_Y0.LVCMOS25_LVCMOS33_LVTTL.IN', 'LIOB33_X0Y43.IOB_Y0.PULLTYPE.PULLUP']);
  // the pin used by the design: no pull-up added
  assert.deepEqual(addedFeatures(index, fasmKeys(index, 'LIOB33_X0Y43.IOB_Y0.PULLTYPE.NONE'), { pudcPullup: true }), []);
  // LVDS_25.DRIVE.I_FIXED's bits hold LVDS_25.OUT's: read back as an alias
  r = trip('LIOB33_X0Y1.IOB_Y0.LVDS_25.DRIVE.I_FIXED');
  assert.deepEqual([clean(r), r.counts.aliases], [CLEAN, 1]);
  // the part's required features (none for the xc7a35t) added as fasm2frames adds them
  assert.deepEqual(addedFeatures(bitIndexXc7({ ...raw, requiredFeatures: ['CLBLL_L_X2Y0.SLICEL_X0.AFF.ZINI'] }), []), [{ tile: 'CLBLL_L_X2Y0', key: 'SLICEL_X0.AFF.ZINI', why: 'required' }]);
  assert.throws(() => addedFeatures(index, fasmKeys(index, 'CLBLL_L_X2Y0.X.STEPDOWN')), /the tile CLBLL_L_X2Y0 is in no bank/);
});

test('xc7 readback index: a feature\'s bits the generator\'s (a tile of each type, an alias, a block RAM); FASM named as the database names it', () => {
  // every feature of a tile of each type with bits: the same bits as bitdb.js's lookup
  const seen = new Set(), cut = [];
  let n = 0;
  for (const [name, t] of index.tiles) {
    if (seen.has(t.type) || !t.windows.length) continue;
    seen.add(t.type);
    for (const w of t.windows) {
      const ty = index.type(w.type);
      for (const key of ty ? ty.features.get(w.block === 1 ? 1 : 0).keys() : []) {
        const m = /^(.*)\[(\d+)\]$/.exec(key), mine = tileFeatureBits(index, name, key);
        if (!mine) continue;   // (an aliased type's feature named by a site the tile does not have)
        let theirs;
        try { theirs = m ? db.featureBits(name, m[1], Number(m[2])) : db.featureBits(name, key); } catch { continue; }
        // (a bit before the tile's first word, an aliased type's bit of the tile it is not: left out, as the generator's frames leave it)
        const outside = theirs.filter(([, b]) => b < 0 || b >= FRAME_WORDS * 32);
        if (outside.length) cut.push(`${name}.${key}`);
        assert.deepEqual(mine, theirs.filter(x => !outside.includes(x)), `${name} ${key}`);
        n++;
      }
    }
  }
  assert.ok(n > 20000, `${n} features`);
  // those are the single I/O tiles' at the ends of a column (an IOB33 and its IOI3 of one site, their bits from the pair's
  // type's third word): the features of the pair's other site (_Y1, its clocks' PIPs) and of the pair (a differential one)
  const other = /^[^.]+\.([A-Z]+_Y1\.|IOI_(OCLK_1|OCLKM_1|ILOGIC1_CLK|ILOGIC1_CLKB|OLOGIC1_CLKDIV)\.|(DIFF\.ZIBUF_LOW_PWR|OUT_DIFF)$)/;
  assert.ok(cut.length > 100 && cut.every(c => /^[LR]IO(B33|I3)_SING_/.test(c) && other.test(c)), cut.filter(c => !other.test(c)).join(' '));
  assert.deepEqual(tileFeatureBits(index, 'INT_L_X2Y37', 'BYP_ALT0.VCC_WIRE'), []);   // a pseudo-PIP
  assert.equal(tileFeatureBits(index, 'INT_L_X2Y37', 'NOSUCH'), null);
  assert.equal(tileFeatureBits(index, 'NOSUCH_X0Y0', 'A'), null);
  // no feature has a bit in word 50's ECC bits: leaving them out of the frames loses nothing
  for (const [name, t] of index.tiles) for (const w of t.windows) {
    if (w.offset > ECC_WORD || w.offset + w.words <= ECC_WORD) continue;
    for (const key of index.type(w.type)?.features.get(w.block === 1 ? 1 : 0).keys() || []) {
      for (const [, b] of tileFeatureBits(index, name, key) || []) assert.ok(b >> 5 !== ECC_WORD || !((1 << (b & 31)) & ECC_MASK), `${name} ${key}`);
    }
  }
  // FASM: one feature per bit set, address 0 without its address where the database names it so, a value of 0 none
  assert.deepEqual(fasmKeys(index, 'CLBLL_L_X2Y0.SLICEL_X0.ALUT.INIT[3:0] = 4\'b0101\nCLBLL_L_X2Y0.SLICEL_X0.AFF.ZINI\nCLBLL_L_X2Y0.SLICEL_X0.BFF.ZINI = 0'),
    [{ tile: 'CLBLL_L_X2Y0', key: 'SLICEL_X0.ALUT.INIT[0]', line: 1 }, { tile: 'CLBLL_L_X2Y0', key: 'SLICEL_X0.ALUT.INIT[2]', line: 1 },
      { tile: 'CLBLL_L_X2Y0', key: 'SLICEL_X0.AFF.ZINI', line: 2 }]);
  assert.throws(() => bitIndexXc7({ format: 2 }), /not a 7-series bit database/);
});

test('xc7 bitread: a .bit that is not one, its frame data cut, its padding not zeros, its first frame not the part\'s: errors', () => {
  const bit = silinxBit('CLBLL_L_X2Y0.SLICEL_X0.AFF.ZINI');
  const back = readBitFramesXc7(bit, index);
  assert.deepEqual(setBits(back.frames), new Set(tileFeatureBits(index, 'CLBLL_L_X2Y0', 'SLICEL_X0.AFF.ZINI').filter(b => b[2]).map(([f, b]) => bitKey(f, b))));
  assert.deepEqual(back.header, { a: 'design.frames;Generator=silinx-fpga', b: PART, c: '1970/01/01', d: '00:00:00' });
  assert.throws(() => readBitFramesXc7(new Uint8Array(16), index), /no sync word/);
  const view = new DataView(bit.buffer);
  let sync = 0;
  while (view.getUint32(sync) !== 0xaa995566) sync++;
  assert.throws(() => readBitFramesXc7(bit.slice(0, sync + 8), index), /no frame data/);
  // FDRI's Type 2 packet and its data
  let k = sync + 4;
  while (view.getUint32(k) >>> 29 !== 2) k += 4;
  const data = k + 4, n = view.getUint32(k) & 0x7ffffff;
  assert.throws(() => readBitFramesXc7(bit.slice(0, data + 40), index), /a packet past the end of the file/);
  // the first row's padding: after the frames of its last column
  const order = [...back.frames.keys()];
  const end = order.findIndex((a, i) => (a >>> 17) !== (order[i + 1] >>> 17));
  const bad = Uint8Array.from(bit);
  new DataView(bad.buffer).setUint32(data + (end + 1) * FRAME_WORDS * 4 + 8, 1);
  assert.throws(() => readBitFramesXc7(bad, index), new RegExp(`the padding after frame 0x${order[end].toString(16)} is not zeros`));
  // a count short of the last frame: the data ends inside it
  const short = Uint8Array.from(bit);
  new DataView(short.buffer).setUint32(k, ((2 << 29) | (2 << 27) | (n - 2 * FRAME_WORDS - 1)) >>> 0);
  assert.throws(() => readBitFramesXc7(short, index), /the frame data ends inside frame/);
  // FAR before FDRI: not a frame of the part
  const far = Uint8Array.from(bit), fv = new DataView(far.buffer);
  let p = sync + 4;
  while (fv.getUint32(p) !== ((1 << 29) | (2 << 27) | (1 << 13) | 1) >>> 0) p += 4;
  fv.setUint32(p + 4, 0x7f);
  assert.throws(() => readBitFramesXc7(far, index), /FDRI's data starts at 0x7f, not a frame of the part/);
});
