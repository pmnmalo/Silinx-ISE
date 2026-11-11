// packages/silinx-fpga/src/fpga/xc7/*.js (#3144): the 7-series' bitstream from nextpnr's FASM, as Project X-Ray's
// fasm2frames and xc7frames2bit make it. The references (test/fixtures/xc7): the FASM nextpnr-himbaechel's xilinx
// micro-architecture wrote for three of the examples on the xc7a35t (the fork's CI, pmnmalo/nextpnr-spartan, branch
// silinx, its workflow xilinx at prjxray c9f02d85 and prjxray-db 0a0added) and the .bit Project X-Ray's tools made of
// it there: Silinx's frames and .bit byte-identical. The FASM's syntax, the bit database's lookups (an alias, a
// pseudo-PIP, a block RAM's run of addresses) and the errors (a feature the database does not have, a bit set and
// cleared, a line that is not FASM), a bank's STEPDOWN, PUDC_B's pull-up, the frames' ECC and the part's frame order.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseFasm, canonicalFeatures, FasmError } from '../src/fpga/xc7/fasm.js';
import { bitDbXc7, FeatureLookupError } from '../src/fpga/xc7/bitdb.js';
import { loadBitDbXc7, xc7Parts, XC7_DB_DIR } from '../src/fpga/xc7/bitdb-node.js';
import { fasmToFrames, framesText, readFramesText, stepdown, InconsistentBitsError, FRAME_WORDS } from '../src/fpga/xc7/frames.js';
import { bitstreamXc7, readBitXc7, updateEcc, partFrames, farFields, farOf, fdriData } from '../src/fpga/xc7/bitstream.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'xc7');
const gz = f => zlib.gunzipSync(fs.readFileSync(path.join(FIX, f)));
const PART = 'xc7a35tcpg236-1', db = loadBitDbXc7(PART);
const DESIGNS = ['blinky', 'vga', 'micro80'];
const rawDb = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(XC7_DB_DIR, `${PART}.json.gz`))).toString('utf8'));

// a .bit's header fields (key → text)
function bitHeader(bytes) {
  const out = {};
  for (let k = 13; bytes[k] !== 0x65;) {
    const key = String.fromCharCode(bytes[k]), n = (bytes[k + 1] << 8) | bytes[k + 2];
    out[key] = new TextDecoder().decode(bytes.subarray(k + 3, k + 2 + n));
    k += 3 + n;
  }
  return out;
}

test('xc7 bitstream: the examples\' .bit byte-identical to Project X-Ray\'s (fasm2frames, xc7frames2bit), their frames too', () => {
  for (const name of DESIGNS) {
    const ref = new Uint8Array(gz(`${name}.bitstream.gz`)), h = bitHeader(ref);
    const { frames } = fasmToFrames(db, gz(`${name}.fasm.gz`).toString('utf8'));
    const [source, generator] = h.a.split(';Generator=');
    assert.deepEqual([source, generator, h.b], [`build/${name}.frames`, 'xc7frames2bit', PART], name);
    const bit = bitstreamXc7(frames, db, { source, generator, date: h.c, time: h.d });
    assert.equal(bit.length, ref.length, name);
    assert.ok(Buffer.from(bit).equals(Buffer.from(ref)), `${name}: the .bit differs`);
    // the frames: the reference's read back are Silinx's with their ECC, the part's others zeros
    const back = readBitXc7(ref, db);
    for (const [a, w] of back) assert.deepEqual(w, frames.has(a) ? updateEcc(Uint32Array.from(frames.get(a))) : new Uint32Array(FRAME_WORDS), `${name} 0x${a.toString(16)}`);
    assert.ok([...frames.values()].filter(w => w.some(Boolean)).length > 200, name);
  }
});

test('xc7 bitstream: the header\'s defaults (silinx-fpga, the date and time in UTC), the part\'s ID code and frames', () => {
  const { frames } = fasmToFrames(db, '');
  const bit = bitstreamXc7(frames, db, { now: new Date(Date.UTC(2026, 0, 2, 3, 4, 5)) });
  assert.deepEqual(bitHeader(bit), { a: 'design.frames;Generator=silinx-fpga', b: PART, c: '2026/01/02', d: '03:04:05' });
  assert.equal(db.idcode, 0x362d093);
  // an empty design: every frame zeros, its ECC zero, the frame data the part's frames and two frames after each row
  const part = partFrames(db.regions);
  let n = 0, rows = 0;
  for (let a = 0; a !== null; a = part.next(a)) {
    n++;
    const nx = part.next(a);
    if (nx === null || ['block', 'bottom', 'row'].some(k => farFields(nx)[k] !== farFields(a)[k])) rows++;
  }
  // the xc7a35t: rows 0 and 1 at the top, 0 at the bottom; CLB_IO_CLK and BLOCK_RAM in each; 5408 frames, 4974 of them
  // its tiles' (fasm2frames writes these, xc7frames2bit adds the others)
  assert.equal(rows, 6);
  assert.deepEqual([n, frames.size], [5408, 4974]);
  assert.ok([...frames.keys()].every(a => part.valid(a)));
  const data = fdriData(frames, part);
  assert.equal(data.length, (n + 2 * rows) * FRAME_WORDS);
  assert.ok(data.every(w => w === 0));
  // the .bit's size: blinky's reference less the difference of the header's names
  assert.equal(bit.length, 2192122 + bitHeader(bit).a.length - 'build/blinky.frames;Generator=xc7frames2bit'.length);
  assert.deepEqual(readBitXc7(bit, db).size, n);
  assert.throws(() => readBitXc7(bit.subarray(0, 200), db), /no frame data|not the/);
  assert.throws(() => readBitXc7(new Uint8Array(8), db), /no sync word/);
});

test('xc7 bitstream: the part\'s frame order (block type, half, row, column, minor) and its ends', () => {
  const part = partFrames(db.regions);
  assert.equal(farOf(1, 1, 3, 5, 7), (1 << 23) | (1 << 22) | (3 << 17) | (5 << 7) | 7);
  assert.deepEqual(farFields(farOf(1, 1, 3, 5, 7)), { block: 1, bottom: 1, row: 3, column: 5, minor: 7 });
  const top0 = db.regions.top[0].CLB_IO_CLK;
  assert.equal(part.next(0), 1);
  assert.equal(part.next(top0[0] - 1), farOf(0, 0, 0, 1, 0));                       // the next column
  assert.equal(part.next(farOf(0, 0, 0, top0.length - 1, top0.at(-1) - 1)), farOf(0, 0, 1, 0, 0));   // the next row
  const top1 = db.regions.top[1].CLB_IO_CLK;
  assert.equal(part.next(farOf(0, 0, 1, top1.length - 1, top1.at(-1) - 1)), farOf(0, 1, 0, 0, 0));   // the bottom half
  const bot0 = db.regions.bottom[0].CLB_IO_CLK;
  assert.equal(part.next(farOf(0, 1, 0, bot0.length - 1, bot0.at(-1) - 1)), farOf(1, 0, 0, 0, 0));   // the block RAM
  const ram = db.regions.bottom[0].BLOCK_RAM;
  assert.equal(part.next(farOf(1, 1, 0, ram.length - 1, ram.at(-1) - 1)), null);    // no CFG_CLB: the end
  assert.equal(part.valid(farOf(0, 0, 0, 0, top0[0])), false);
  assert.equal(part.valid(farOf(0, 0, 2, 0, 0)), false);
  // an address past its column's frames goes on to the next column, one of no row ends the half
  assert.equal(part.next(farOf(0, 0, 0, 0, 0x7f)), farOf(0, 0, 0, 1, 0));
  assert.equal(part.next(farOf(0, 0, 5, 0, 0)), farOf(0, 1, 0, 0, 0));
});

test('xc7 bitstream: a frame\'s ECC (word 50\'s low 13 bits) the reference\'s, linear in the frame\'s bits', () => {
  const zero = updateEcc(new Uint32Array(FRAME_WORDS));
  assert.equal(zero[50], 0);
  const one = (w, b) => { const f = new Uint32Array(FRAME_WORDS); f[w] = (1 << b) >>> 0; return updateEcc(f)[50] & 0x1fff; };
  // a bit's ECC: its position past the ECC's own (word 0 bit 0: 0x1320), bit 12 the parity of bits 0 … 11 (0x320: 1)
  assert.equal(one(0, 0), 0x1320 ^ 0x1000);
  assert.equal(one(7, 0), 7 * 32 + 0x1340);   // 0x1420: parity of 0x420 even
  assert.equal(one(0x26, 1), 0x26 * 32 + 0x1360 + 1 ^ 0x1000);   // 0x1820 + 1: past 0x800, parity of 0x821 odd
  assert.equal(one(1, 0) ^ one(0, 0), updateEcc(Uint32Array.from({ length: FRAME_WORDS }, (_, i) => (i < 2 ? 1 : 0)))[50] & 0x1fff);
  // the ECC bits themselves are left out of it, the rest of word 50 kept
  const f = new Uint32Array(FRAME_WORDS); f[50] = 0xffffffff;
  assert.equal(updateEcc(f)[50] >>> 13, 0xffffffff >>> 13);
  // every frame of the reference's .bit has the ECC Silinx computes
  const back = readBitXc7(new Uint8Array(gz('micro80.bitstream.gz')), db);
  let nonzero = 0;
  for (const w of back.values()) { const e = w[50] & 0x1fff; if (e) nonzero++; assert.equal(updateEcc(Uint32Array.from(w))[50] & 0x1fff, e); }
  assert.ok(nonzero > 100, `${nonzero} frames with an ECC`);
});

test('xc7 fasm: features, addresses, values, annotations and comments as the fasm library reads them', () => {
  const fs_ = parseFasm([
    'CLBLL_L_X2Y37.SLICEL_X0.AFF.ZINI',
    '  # a comment',
    '',
    'CLBLL_L_X2Y37.SLICEL_X0.ALUT.INIT[63:0] = 64\'b1111000011110000111100001111000011110000111100001111000011110000',
    'A.B[3] { name = "x", other = "a \\"q\\"" } # both',
    'A.C[7:4] = 4\'hA',
    'A.D = 1',
    'A.E[15:0] = \'d1_000',
    'A.F[2:0] = 3\'o5',
    'A.G[1:0] = 0',
    '{ only = "annotations" }',
  ].join('\n'));
  assert.deepEqual(fs_.map(f => [f.feature, f.start, f.end, f.value, f.line]), [
    ['CLBLL_L_X2Y37.SLICEL_X0.AFF.ZINI', null, null, 1n, 1],
    ['CLBLL_L_X2Y37.SLICEL_X0.ALUT.INIT', 0, 63, 0xf0f0f0f0f0f0f0f0n, 4],
    ['A.B', 3, null, 1n, 5],
    ['A.C', 4, 7, 10n, 6],
    ['A.D', null, null, 1n, 7],
    ['A.E', 0, 15, 1000n, 8],
    ['A.F', 0, 2, 5n, 9],
    ['A.G', 0, 1, 0n, 10],
  ]);
  // canonical: one feature per bit set, bit 0 without its address; none for 0
  assert.deepEqual(canonicalFeatures(fs_[3]), [{ feature: 'A.C', address: 5 }, { feature: 'A.C', address: 7 }]);
  assert.deepEqual(canonicalFeatures(fs_[2]), [{ feature: 'A.B', address: 3 }]);
  assert.deepEqual(canonicalFeatures(fs_[6]).map(c => c.address), [0, 2]);
  assert.deepEqual(canonicalFeatures(fs_[7]), []);
  assert.deepEqual(canonicalFeatures(parseFasm('A.Z[0]')[0]), [{ feature: 'A.Z', address: 0 }]);
});

test('xc7 fasm: a line that is not FASM, a value too wide, an address backwards: errors at their line', () => {
  const bad = (text, re) => assert.throws(() => parseFasm(text), e => e instanceof FasmError && re.test(e.message), text);
  bad('A.B\n1A.B', /^FASM line 2: not FASM: 1A\.B$/);
  bad('A.B = 2', /line 1: the value 2 does not fit the feature's 1 bit$/);
  bad('A.B[3:0] = 5\'h1', /the value 5'h1 is wider than the feature's 4 bits/);
  bad('A.B[3:0] = 4\'h1F', /the value 4'h1F is wider than 4 bits/);
  bad('A.B[3:0] = 4\'b2', /not a value: 4'b2/);
  bad('A.B[0:3] = 1', /the address \[0:3\] runs backwards/);
  bad('A.B { name = x }', /not an annotation/);
  bad('A..B', /not FASM/);
});

test('xc7 bitdb: a tile\'s feature\'s bits (a LUT, a switch box, a block RAM\'s contents), an alias, a pseudo-PIP', () => {
  assert.deepEqual(xc7Parts(), [PART]);
  assert.deepEqual([db.part, db.device, db.fabric], [PART, 'xc7a35t', 'xc7a50t']);
  const clb = db.tile('CLBLL_L_X2Y37');
  assert.deepEqual([clb.type, clb.blocks.get(0).base, clb.blocks.get(0).offset, clb.blocks.get(0).words], ['CLBLL_L', 0x00400100, 75, 2]);
  // segbits_clbll_l.db: CLBLL_L.SLICEL_X0.A5FF.ZINI 31_06 → frame base + 31, bit 75 * 32 + 6
  assert.deepEqual(db.featureBits('CLBLL_L_X2Y37', 'SLICEL_X0.A5FF.ZINI'), [[0x00400100 + 31, 75 * 32 + 6, true]]);
  // a PIP: some bits cleared
  const pip = db.featureBits('INT_L_X2Y37', 'BYP_ALT0.BYP_BOUNCE_N3_3');
  assert.deepEqual(pip.map(b => b[2]), [true, false, false, true, false]);
  assert.deepEqual(pip[0], [0x00400100 + 21, 75 * 32 + 7, true]);
  // a pseudo-PIP: no bits
  assert.deepEqual(db.featureBits('INT_L_X2Y37', 'BYP_ALT0.VCC_WIRE'), []);
  // a block RAM's INIT: one bit per address, in the BLOCK_RAM block
  const bram = db.tiles().find(t => t.startsWith('BRAM_L_')), b1 = db.tile(bram).blocks.get(1);
  assert.deepEqual(db.featureBits(bram, 'RAMB18_Y0.INIT_00', 1), [[b1.base, b1.offset * 32 + 16, true]]);
  assert.deepEqual(db.featureBits(bram, 'RAMB18_Y0.INIT_01', 0), [[b1.base + 2, b1.offset * 32, true]]);
  // an alias: LIOB33_SING_X0Y0's IOB_Y0 is LIOB33's IOB_Y0, its offset 2 words back
  const sing = db.tile('LIOB33_SING_X0Y0').blocks.get(0), full = db.featureBits('LIOB33_X0Y1', 'IOB_Y0.PULLTYPE.PULLUP');
  const base = db.tile('LIOB33_X0Y1').blocks.get(0);
  assert.deepEqual(db.featureBits('LIOB33_SING_X0Y0', 'IOB_Y0.PULLTYPE.PULLUP'),
    full.map(([f, b, s]) => [f - base.base + sing.base, b - base.offset * 32 + (sing.offset - 2) * 32, s]));
  // a bank's tiles
  assert.equal(db.tileBank.get('HCLK_IOI3_X1Y26'), '14');
  assert.equal(db.tileBank.get('LIOB33_X0Y1'), '14');
  assert.deepEqual(db.pudcB, ['LIOB33_X0Y43', 'IOB_Y0']);
});

test('xc7 bitdb: a feature, an address or a tile the database does not have is an error naming it', () => {
  const miss = (args, re) => assert.throws(() => db.featureBits(...args), e => e instanceof FeatureLookupError && re.test(e.message));
  miss(['CLBLL_L_X2Y37', 'SLICEL_X0.NOSUCH', 0, 'CLBLL_L_X2Y37.SLICEL_X0.NOSUCH'],
    /^Segment DB CLBLL_L, key CLBLL_L\.SLICEL_X0\.NOSUCH not found from line 'CLBLL_L_X2Y37\.SLICEL_X0\.NOSUCH'$/);
  miss(['CLBLL_L_X2Y37', 'SLICEL_X0.ALUT.INIT', 64], /key CLBLL_L\.SLICEL_X0\.ALUT\.INIT\[64\] not found/);
  miss(['NOSUCH_X0Y0', 'A'], /the tile NOSUCH_X0Y0 is not in the xc7a50t/);
  // a tile type with no bits in the database (no tile_type_*.json in prjxray-db): its features unknown
  const raw = rawDb();
  const { CLBLL_L, ...types } = raw.types;
  assert.ok(CLBLL_L);
  assert.throws(() => bitDbXc7({ ...raw, types }).featureBits('CLBLL_L_X2Y37', 'SLICEL_X0.A5FF.ZINI'), /the tile type CLBLL_L has no bits in the database/);
  // a type with a pseudo-PIP and no segment bits: its pseudo-PIP sets nothing, anything else is unknown
  const ppOnly = bitDbXc7({ ...raw, types: { ...raw.types, CLBLL_L: { ppips: 'SLICEL_X0.P' } } });
  assert.deepEqual(ppOnly.featureBits('CLBLL_L_X2Y37', 'SLICEL_X0.P'), []);
  assert.throws(() => ppOnly.featureBits('CLBLL_L_X2Y37', 'SLICEL_X0.A5FF.ZINI'), FeatureLookupError);
  assert.throws(() => bitDbXc7({ format: 2 }), /not a 7-series bit database/);
});

test('xc7 frames: every missing feature named together, a bit set and cleared, fasm2frames\' .frm text', () => {
  assert.throws(() => fasmToFrames(db, 'CLBLL_L_X2Y37.SLICEL_X0.NOSUCH\nCLBLL_L_X2Y37.SLICEL_X0.AFF.ZINI\nINT_L_X2Y37.NOSUCH'),
    e => e instanceof FeatureLookupError && e.message.split('\n').length === 2 && /SLICEL_X0\.NOSUCH/.test(e.message) && /INT_L\.NOSUCH/.test(e.message));
  // two PIPs of one mux: a bit one sets the other clears
  assert.throws(() => fasmToFrames(db, 'INT_L_X2Y37.BYP_ALT0.BYP_BOUNCE_N3_3\nINT_L_X2Y37.BYP_ALT0.BYP_BOUNCE_N3_7'),
    e => e instanceof InconsistentBitsError && /FASM line "INT_L_X2Y37\.BYP_ALT0\.BYP_BOUNCE_N3_7" wanted to clear bit \d+ of frame 0x[0-9A-F]{8} but was set by FASM line "INT_L_X2Y37\.BYP_ALT0\.BYP_BOUNCE_N3_3"/.test(e.message));
  // a feature set twice, or 0: no error
  const { frames } = fasmToFrames(db, 'CLBLL_L_X2Y37.SLICEL_X0.A5FF.ZINI\nCLBLL_L_X2Y37.SLICEL_X0.A5FF.ZINI\nCLBLL_L_X2Y37.SLICEL_X0.NOSUCH[3:0] = 0');
  assert.equal(frames.get(0x00400100 + 31)[75], 1 << 6);
  // the .frm text: a line per frame of 101 words, read back the same
  const text = framesText(frames), lines = text.trimEnd().split('\n');
  assert.equal(lines.length, frames.size);
  assert.match(lines[0], /^0x00000000 0x00000000(,0x00000000){100}$/);
  assert.ok(lines.some(l => l.startsWith(`0x${(0x00400100 + 31).toString(16).toUpperCase().padStart(8, '0')} `) && l.includes(',0x00000040,')));
  assert.deepEqual(readFramesText(text), frames);
  assert.throws(() => readFramesText('0x00000000 0x0,0x1'), /frames line 1: 2 words, not 101/);
});

test('xc7 frames: a bank\'s STEPDOWN set on its unused IOB33s and its HCLK_IOI3; PUDC_B\'s pull-up when asked', () => {
  const tag = 'LVCMOS12_LVCMOS15_LVCMOS18_SSTL135_SSTL15.STEPDOWN';
  const used = 'LIOB33_X0Y1.IOB_Y0';
  const added = stepdown(db, parseFasm(`${used}.${tag}\n${'LIOB33_X0Y1.IOB_Y1'}.PULLTYPE.NONE`)).map(f => f.feature);
  const bank = db.banks[db.tileBank.get('LIOB33_X0Y1')];
  const expected = [];
  for (const t of bank) {
    if (t.includes('IOB33')) for (const s of db.iobSites[t]) if (`${t}.${s}` !== used && `${t}.${s}` !== 'LIOB33_X0Y1.IOB_Y1') expected.push(`${t}.${s}.${tag}`);
    if (t.includes('HCLK_IOI3')) expected.push(`${t}.STEPDOWN`);
  }
  assert.deepEqual(added.sort(), expected.sort());
  assert.ok(added.includes('HCLK_IOI3_X1Y26.STEPDOWN') && !added.includes(`${used}.${tag}`));
  assert.ok(added.length > 20, `${added.length}`);
  // the frames have them: the HCLK_IOI3's STEPDOWN bits set
  const { frames, features } = fasmToFrames(db, `${used}.${tag}`);
  assert.ok(features.some(f => f.feature === 'HCLK_IOI3_X1Y26.STEPDOWN'));
  for (const [f, b] of db.featureBits('HCLK_IOI3_X1Y26', 'STEPDOWN')) assert.ok(frames.get(f)[b >> 5] & (1 << (b & 31)));
  // no STEPDOWN: nothing added; a STEPDOWN of a tile in no bank: an error
  assert.deepEqual(stepdown(db, parseFasm('LIOB33_X0Y1.IOB_Y0.PULLTYPE.NONE')), []);
  assert.throws(() => stepdown(db, parseFasm(`CLBLL_L_X2Y37.X.${tag}`)), /the tile CLBLL_L_X2Y37 is in no bank/);
  // PUDC_B: its pull-up only when asked, and only when the design leaves it unused
  const [pt, ps] = db.pudcB, pull = db.featureBits(pt, `${ps}.PULLTYPE.PULLUP`);
  const isSet = (fr, [f, b]) => !!(fr.get(f)[b >> 5] & (1 << (b & 31)));
  assert.ok(pull.length && !pull.every(x => isSet(fasmToFrames(db, '').frames, x)));
  const withPull = fasmToFrames(db, '', { pudcPullup: true });
  assert.ok(pull.filter(x => x[2]).every(x => isSet(withPull.frames, x)));
  assert.deepEqual(withPull.features.map(f => f.feature).sort(), [`${pt}.${ps}.LVCMOS12_LVCMOS15_LVCMOS18_LVCMOS25_LVCMOS33_LVDS_25_LVTTL_SSTL135_SSTL15_TMDS_33.IN_ONLY`,
    `${pt}.${ps}.LVCMOS25_LVCMOS33_LVTTL.IN`, `${pt}.${ps}.PULLTYPE.PULLUP`].sort());
  assert.equal(fasmToFrames(db, `${pt}.${ps}.PULLTYPE.NONE`, { pudcPullup: true }).features.length, 1);
});

test('xc7 frames: the part\'s required features added (prjxray-db\'s required_features.fasm; none for the xc7a35t)', () => {
  assert.deepEqual(db.requiredFeatures, []);
  const raw = rawDb();
  const withReq = bitDbXc7({ ...raw, requiredFeatures: ['CLBLL_L_X2Y37.SLICEL_X0.A5FF.ZINI'] });
  const { frames, features } = fasmToFrames(withReq, '');
  assert.deepEqual(features.map(f => f.feature), ['CLBLL_L_X2Y37.SLICEL_X0.A5FF.ZINI']);
  assert.equal(frames.get(0x00400100 + 31)[75], 1 << 6);
  assert.throws(() => fasmToFrames(bitDbXc7({ ...raw, requiredFeatures: ['CLBLL_L_X2Y37.NOSUCH'] }), ''), /CLBLL_L\.NOSUCH not found/);
});
