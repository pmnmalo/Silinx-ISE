// packages/silinx-fpga/src/fpga/s6/bitgen*.js and bitdb-node.js (#732): the Spartan-6's configuration bits of a design
// from the bit databases measured in research/s6 (bitdb/s6), moved into the toolchain as they were. The databases
// read for both parts, the regions of the frame data, a slice's and a pad's bits as their databases give them, a
// design's bits the union of its instances' and its PIPs', and what the databases do not know named.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadBitDbS6 } from '../src/fpga/s6/bitdb-node.js';
import { predictDesign, predictIob, padBit } from '../src/fpga/s6/bitgen.js';
import { kindModel, predictSlice, lutEntries, baseSettings } from '../src/fpga/s6/bitgen-slice.js';
import { tileRegion, gridRegion, columnOf } from '../src/fpga/s6/bitgen-regions.js';
import { pipLookup } from '../src/fpga/s6/bitgen-pips.js';
import { bitFormat6 } from '../src/fpga/s6/bitstream.js';
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
