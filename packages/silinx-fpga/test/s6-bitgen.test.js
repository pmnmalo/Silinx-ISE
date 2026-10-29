// packages/silinx-fpga/src/fpga/s6/bitgen*.js and bitdb-node.js (#732): the Spartan-6's configuration bits of a design
// from the bit databases measured in research/s6 (bitdb/s6), moved into the toolchain as they were. The databases
// read for both parts, the regions of the frame data, a slice's and a pad's bits as their databases give them, a
// design's bits the union of its instances' and its PIPs', and what the databases do not know named; its .bit
// (bitstreamS6) with them and the block RAM's frame bitgen writes again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBitDbS6 } from '../src/fpga/s6/bitdb-node.js';
import { predictDesign, predictIob, padBit, bramRewrites, bitstreamS6, NO_BITS, knownPipS6 } from '../src/fpga/s6/bitgen.js';
import { kindModel, predictSlice, lutEntries, baseSettings } from '../src/fpga/s6/bitgen-slice.js';
import { tileRegion, gridRegion, columnOf } from '../src/fpga/s6/bitgen-regions.js';
import { pipLookup } from '../src/fpga/s6/bitgen-pips.js';
import { bitFormat6, emptyFdri, readBit6, FRAME_WORDS } from '../src/fpga/s6/bitstream.js';
import { s6Sites } from '../src/fpga/s6/sites.js';
import { loadDeviceCache } from '../src/fpga/device-node.js';

const PART = 'xc6slx16csg324-3', device = loadDeviceCache(PART), dev = bitFormat6('6slx16csg324');
const db = loadBitDbS6(PART);
const cfg = o => Object.entries(o).map(([attr, value]) => ({ attr, name: '', value }));

test('bitdb-node: both parts\' databases read, the XC6SLX16\'s DCM paths only (the XC6SLX45\'s CMTs not measured yet)', () => {
  for (const part of [PART, 'xc6slx45csg324-3']) {
    const d = loadBitDbS6(part);
    assert.deepEqual(Object.keys(d.slices.lut.kinds).sort(), ['L', 'M', 'X'], part);
    assert.ok(Object.keys(d.int.pips).length > 1000 && Object.keys(d.other.pips).length > 1000, part);
    assert.ok(Object.keys(d.iob.pads).length > 200, part);
    assert.deepEqual(Object.keys(d.hardBase.bases), ['RAMB16BWER', 'RAMB8BWER', 'DSP48A1'], part);
    assert.ok(d.hard.RAMB8BWER && d.clocks.regcFrame, part);
  }
  assert.ok(db.cmt && db.cmtSettings && db.cmtInput);
  assert.equal(loadBitDbS6('xc6slx45csg324-3').cmt, null);
  assert.equal(loadBitDbS6(PART, { cmtPaths: false, cmtInput: false }).cmt, null);
});

test('bitgen-regions: a switch box\'s region by its name, any tile\'s by the grid (the same for a switch box), a frame\'s column', () => {
  const [c0, b0] = tileRegion(dev, 'INT_X4Y5');
  // the band of row 5 (rows 0 … 7 from 16 bits up the frame), its FAR column the fifth (an INT tile X is column X + 1)
  assert.equal(b0, (15 - 5) * 64 + 16);
  assert.equal(c0, dev.columns.slice(0, 5).reduce((a, n) => a + n, 0));
  assert.deepEqual(gridRegion(device, dev, 'INT_X4Y5').slice(0, 2), [c0, b0]);
  const [f, n] = columnOf(dev, c0 + 2);
  assert.deepEqual([f, n], [c0, dev.columns[5]]);
  // a row's last frames, past its columns (744 frames, 742 in columns on the XC6SLX16): in none
  assert.throws(() => columnOf(dev, dev.rowFrames - 1), /in no column/);
});

test('bitgen-slice: a slice\'s LUT entries from its equations, its bits as the base\'s with its LUT\'s; a setting not measured named', () => {
  // A6LUT = A1: entries with A1 set
  assert.deepEqual(lutEntries('A1', null).map((x, e) => x && e).filter(Boolean).slice(0, 3), [1, 3, 5]);
  // O5 = A2 below A6, O6 above
  const e = lutEntries('A1', 'A2');
  assert.deepEqual([e[2], e[1], e[33]], [1, 0, 1]);
  assert.ok(baseSettings({ full: true, kind: 'L' }).some(([el]) => el === 'CARRY4'));
  const m = kindModel(db.slices, 'L', 'CLEXL'), p = predictSlice(m, cfg({ A6LUT: '#LUT:O6=A1' }));
  assert.equal(p.ram, false);
  for (const x of m.lut.A.filter((_, k) => k & 1).map(([f, b]) => `${f},${b}`)) assert.ok(p.bits.has(x));
  assert.deepEqual(predictSlice(m, cfg({ AFFMUX: 'NOSUCH' })).unknown, ['AFFMUX=NOSUCH']);
});

test('bitgen: a pad\'s bits by its settings, a design\'s the union of its instances\' and PIPs\', the unknown named', () => {
  const site = Object.keys(db.iob.pads).sort()[0], pad = db.iob.pads[site];
  const out = predictIob(pad, cfg({ OUSED: '0', DRIVEATTRBOX: '12', SLEW: 'SLOW', OSTANDARD: 'LVCMOS25' }));
  assert.deepEqual(out.unknown, []);
  for (const x of pad.base) assert.ok(out.bits.has(x));
  assert.ok(out.bits.has(padBit(pad, -15)));
  assert.deepEqual(predictIob(pad, cfg({ OUSED: '0', OSTANDARD: 'NOSUCH' })).unknown, ['outNOSUCH']);
  // a slice and the pad, and a PIP of a switch box: the design's bits are the three's, with the I/O's globals
  const slice = [...s6Sites(device).slices.values()].find(s => s.kind === 'L');
  const pip = { tile: 'INT_X4Y5', from: 'LOGICOUT0', dir: '->', to: 'EE2B0' };
  const design = {
    insts: [{ name: 'p', type: 'IOB', site, placed: true, cfg: cfg({ OUSED: '0', DRIVEATTRBOX: '12', SLEW: 'SLOW', OSTANDARD: 'LVCMOS25' }) },
      { name: 's', type: 'SLICEL', site: slice.name, tile: slice.tile, placed: true, cfg: cfg({ A6LUT: '#LUT:O6=A1' }) }],
    nets: [{ name: 'n', outpins: [], inpins: [], pips: [pip] }],
  };
  const r = predictDesign(design, device, dev, db);
  for (const x of out.bits) assert.ok(r.bits.has(x));
  for (const x of db.iob.globals) assert.ok(r.bits.has(x));
  const [c0, b0] = tileRegion(dev, 'INT_X4Y5');
  for (const [m, b] of pipLookup(db.int, 'LOGICOUT0', '->', 'EE2B0')) assert.ok(r.bits.has(`${c0 + m},${b0 + b}`));
  assert.deepEqual([...r.unknown], []);
  // a PIP the databases do not have: named, no bits
  const u = predictDesign({ insts: [], nets: [{ name: 'n', outpins: [], inpins: [], pips: [{ tile: 'NOSUCH_X1Y1', from: 'A', dir: '->', to: 'B' }] }] }, device, dev, db);
  assert.deepEqual([u.bits.size, [...u.unknown]], [0, [['NOSUCH A -> B', 1]]]);
});

test('bitgen: the block RAM\'s frame written again (minor 23 of its column, two bits cleared, a pad frame), the unmeasured named', () => {
  const site = s6Sites(device).brams[0], ramb8 = { name: 'r', type: 'RAMB8BWER', site: site.r8[0], tile: site.tile, placed: true, cfg: [] };
  const fdri = emptyFdri(dev).slice().fill(0xffff), [f0, b0] = gridRegion(device, dev, site.tile), w = (b0 >> 4) - 12;
  const r = bramRewrites({ insts: [ramb8], nets: [] }, device, dev, fdri);
  assert.deepEqual(r.unknown, []);
  assert.equal(r.rewrites.length, 1);
  const x = r.rewrites[0], row = Math.floor(f0 / dev.rowFrames);
  assert.equal(x.far[1], 23);
  assert.equal(x.far[0] >> 8, row);
  assert.equal(x.words.length, 2 * FRAME_WORDS);
  assert.deepEqual([x.words[w], x.words[w + 15]], [0xfffd, 0xbfff]);
  assert.equal(x.words.filter(v => v === 0xffff).length, 2 * FRAME_WORDS - 2);
  // two block RAMs, or a RAMB16BWER: not measured
  assert.match(bramRewrites({ insts: [ramb8, { ...ramb8, name: 's', site: site.r8[1] }], nets: [] }, device, dev, fdri).unknown[0], /^2 block RAMs/);
  assert.match(bramRewrites({ insts: [{ ...ramb8, type: 'RAMB16BWER', site: site.r16 }], nets: [] }, device, dev, fdri).unknown[0], /^a RAMB16BWER/);
  assert.deepEqual(bramRewrites({ insts: [], nets: [] }, device, dev, fdri), { rewrites: [], unknown: [] });
});

test('bitgen: a design\'s .bit, its frame data the empty device\'s with the design\'s bits; a DCM named as not measured', () => {
  const slice = [...s6Sites(device).slices.values()].find(s => s.kind === 'L');
  const design = { insts: [{ name: 's', type: 'SLICEL', site: slice.name, tile: slice.tile, placed: true, cfg: cfg({ A6LUT: '#LUT:O6=A1' }) }], nets: [] };
  const { bytes, unknown } = bitstreamS6(design, device, db, { name: 'm.ncd;UserID=0xFFFFFFFF', date: '2026/10/29', time: '12:00:00', crc: true, startupClk: 'JtagClk' });
  assert.deepEqual([...unknown], []);
  const r = readBit6(bytes), empty = emptyFdri(dev), set = [];
  assert.deepEqual([r.header.a, r.header.b, r.header.c, r.crc, r.startupClk], ['m.ncd;UserID=0xFFFFFFFF', '6slx16csg324', '2026/10/29', true, 'JtagClk']);
  for (let w = 0; w < r.fdri.length; w++) { const x = r.fdri[w] ^ empty[w]; for (let i = 0; i < 16; i++) if ((x >> (15 - i)) & 1) set.push(`${Math.floor(w / FRAME_WORDS)},${(w % FRAME_WORDS) * 16 + i}`); }
  assert.deepEqual(set.sort(), [...predictDesign(design, device, dev, db).bits].sort());
  const dcm = bitstreamS6({ insts: [{ name: 'd', type: 'DCM', site: 'DCM_X0Y0', tile: 'CMT_DCM_BOT_X11Y8', placed: true, cfg: [] }], nets: [] }, device, db);
  assert.ok([...dcm.unknown.keys()].some(k => /^DCM DCM_X0Y0: a clock manager's bits not measured/.test(k)));
});

test('bitgen: the PIP families with no bits (a hard block\'s pins, an interface tile\'s LOGICOUT), the switches the router may take', () => {
  for (const k of ['MACCSITE2 P15_DSP48A1_SITE -> MACC_LOGICOUT10_INT1', 'MACCSITE2 MACC_LOGICINB14_INT0 -> C11_DSP48A1_SITE', 'BRAMSITE2 RAMB8BWER_1_DOPB0 -> BRAM_LOGICOUT3_INT2',
    'BRAMSITE2 BRAM_LOGICINB31_INT0 -> RAMB8BWER_1_ADDRA0', 'INT_INTERFACE INT_INTERFACE_LOGICOUT_8 -> INT_INTERFACE_LOGICOUT8']) assert.ok(NO_BITS.test(k), k);
  for (const k of ['INT_INTERFACE INT_INTERFACE_LOGICOUT_8 -> INT_INTERFACE_LOGICOUT9', 'INT EE2B0 -> NN2B1', 'CLKC CLKC_PLL_L0 -> CLKC_GCLK0']) assert.ok(!NO_BITS.test(k), k);
  // every measured one of those families has no bits indeed
  for (const [k, b] of Object.entries(db.other.pips)) if (NO_BITS.test(k)) assert.deepEqual(b, [], k);
  // a PIP of such a family the databases do not have: no bits, not unknown
  const r = predictDesign({ insts: [], nets: [{ name: 'n', outpins: [], inpins: [], pips: [{ tile: 'MACCSITE2_X18Y28', from: 'P47_DSP48A1_SITE', dir: '->', to: 'MACC_LOGICOUT99_INT1' }] }] }, device, dev, db);
  assert.deepEqual([r.bits.size, r.unknown.size], [0, 0]);
  // the router's switches: the measured ones and those families; not an unmeasured one of another tile
  const allow = knownPipS6(device, db), find = (tile, test) => { const k = device.tile(tile), tp = device.templates[device.tileTemplate[k]]; for (let i = 0; i < tp.from.length; i++) if (test(device.pip(k, i))) return [k, i]; return null; };
  const clexl = device.tileNames.find(n => /^CLEXL_/.test(n));
  assert.equal(allow(...find(clexl, () => true)), true);
  const intTile = device.tileNames.find(n => /^INT_X\d+Y\d+$/.test(n)), known = find(intTile, p => !!pipLookup(db.int, p.from, p.dir, p.to));
  assert.equal(allow(...known), true);
  const maccTile = device.tileNames.find(n => /^MACCSITE2_/.test(n)), out = find(maccTile, p => /_DSP48A1_SITE$/.test(p.from) && /^MACC_LOGICOUT/.test(p.to));
  assert.equal(allow(...out), true);
});
