// packages/silinx-fpga/src/fpga/s6/bitstream.js: Spartan-6 .bit files (#724), without ISE: the writer against what ISE's bitgen
// wrote (research/s6/measured/format.json: the SHA-256 of the empty designs' files, the CRCs of a design with
// a block RAM), the CRC against bitgen's multi-frame writes, the frame layout, the reader on built bitstreams.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { S6_DEVICES, FRAME_WORDS, REG6, bitFormat6, fdriLayout, frameOffset, emptyFdri, crc6Update, cor1Value, writeBit6, readBit6, readHeader6, packetLine6 }
  from '../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { checkBit, recordBit } from '../research/s6/check-writer6.mjs';

const { xc6slx16: LX16, xc6slx45: LX45 } = S6_DEVICES;
const measured = JSON.parse(fs.readFileSync(new URL('../research/s6/measured/format.json', import.meta.url), 'utf8')).bits;
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const reg = name => REG6.indexOf(name);
const hex = x => x.toString(16).padStart(6, '0');

test('the parts: IDCODE, FLR, rows and frames as bitgen writes them; FDRI\'s length', () => {
  assert.equal(LX16.idcode, 0x04002093);
  assert.equal(LX45.idcode, 0x04008093);
  assert.deepEqual([LX16.rowFrames, LX45.rowFrames], [744, 1136]);
  assert.deepEqual([LX16.columns.length, LX45.columns.length], [26, 39]);
  // night 1's empty bitstreams: FDRI of 231 953 and 742 057 words
  assert.deepEqual([LX16.fdriWords, LX45.fdriWords], [231953, 742057]);
  assert.equal(FRAME_WORDS, 65);
  assert.equal(bitFormat6('xc6slx45csg324-3'), LX45);
  assert.equal(bitFormat6('XC6SLX16-CSG324-3'), LX16);
  assert.equal(bitFormat6('6slx16csg324'), LX16);
  assert.equal(bitFormat6('xc6slx9'), null);
  assert.equal(bitFormat6('xc3s250e'), null);
  assert.equal(bitFormat6(null), null);
});

test('frame layout: rows of columns and pad, then the block RAM, the I/O words and one word; a frame\'s offset', () => {
  const l = fdriLayout(LX16);
  assert.deepEqual(l.rows, [0, 48360, 96720, 145080]);
  assert.equal(l.bram, 4 * 744 * 65);
  assert.equal(l.iob, l.bram + 576 * 65);
  assert.equal(l.tail, l.iob + 0x430);
  assert.equal(l.tail + 1, LX16.fdriWords);
  assert.equal(frameOffset(LX16, 0, 0, 0), 0);
  assert.equal(frameOffset(LX16, 0, 1, 0), 4 * 65);
  assert.equal(frameOffset(LX16, 0, 1, 23), 27 * 65);
  assert.equal(frameOffset(LX16, 2, 0, 3), 2 * 744 * 65 + 3 * 65);
  assert.equal(frameOffset(LX45, 7, 38, 29), (7 * 1136 + 1136 - 2 - 1) * 65, 'the last frame of a row before its pad');
  assert.throws(() => frameOffset(LX16, 4, 0, 0), /no frame row 4 column 0 minor 0 in the xc6slx16/);
  assert.throws(() => frameOffset(LX16, 0, 26, 0), /no frame row 0 column 26/);
  assert.throws(() => frameOffset(LX16, 0, 0, 4), /minor 4/);
  assert.throws(() => frameOffset(LX45, 0, 4, 25), /minor 25/);
});

test('the empty design: its frame data, and its .bit byte-identical with bitgen\'s (SHA-256), with the CRC on and off, every StartUpClk', () => {
  const empties = measured.filter(m => m.file.startsWith('empty/'));
  assert.equal(empties.length, 10);
  for (const m of empties) {
    const device = S6_DEVICES[m.device];
    const bytes = writeBit6({ fdri: emptyFdri(device), name: m.header.a, date: m.header.c, time: m.header.d, crc: m.crc, startupClk: m.startupClk, device });
    assert.equal(bytes.length, m.bytes, m.file);
    assert.equal(sha(bytes), m.sha256, m.file);
    const r = readBit6(bytes);
    assert.deepEqual(r.packets.filter(p => p.autoCrc !== undefined).map(p => hex(p.autoCrc)).concat(m.crc ? [hex(r.crcChecks.at(-1).expected)] : []), m.crcs, m.file);
  }
  // the words of the empty design besides the pad frames
  const f = emptyFdri(LX45), set = [];
  for (let i = 0; i < f.length; i++) if (f[i] && f[i] !== 0xffff) set.push([i, f[i]]);
  assert.deepEqual(set, [[199, 0x20], [1819, 0x3100], [147879, 0x20], [295559, 0x20], [443239, 0x20]]);
  assert.equal(f.filter(x => x === 0xffff).length, 8 * 2 * 65);
});

test('the CRC: one step per word, 22 bits; bitgen\'s multi-frame writes (-g Compress) check it after 65 words of FDRI', () => {
  assert.equal(crc6Update(0, 13, 0x430), 0x0d0430, 'the register in bits 21:16, the word in 15:0');
  assert.equal(crc6Update(0x200000, 0, 0), 0x9081, 'bit 21 shifted out feeds 0x9081 back');
  assert.equal(crc6Update(0x3fffff, 0, 0), (0x3ffffe ^ 0x9081) >>> 0);
  // the writer's packets up to WCFG, then 65 words of 0 written to FDRI: the auto CRC bitgen -g Compress wrote
  for (const [device, want] of [[LX16, 0x28ee80], [LX45, 0x1ff233]]) {
    const r = readBit6(writeBit6({ fdri: new Uint16Array(device.fdriWords), startupClk: 'JtagClk', device }));
    let c = 0;
    for (const p of r.packets) {
      if (p.noop || p.autoCrc !== undefined || p.reg === 'FDRI') continue;
      for (const d of p.data) c = p.reg === 'CMD' && d === 7 ? 0 : crc6Update(c, reg(p.reg), d);
      if (p.reg === 'CMD' && p.data[0] === 1) break;
    }
    for (let i = 0; i < 65; i++) c = crc6Update(c, reg('FDRI'), 0);
    assert.equal(c, want, device.device);
  }
});

test('COR1: StartUpClk in bits 1:0, the CRC off in bit 4', () => {
  assert.equal(cor1Value({}), 0x3d00);
  assert.equal(cor1Value({ startupClk: 'JtagClk' }), 0x3d02);
  assert.equal(cor1Value({ startupClk: 'userclk' }), 0x3d01);
  assert.equal(cor1Value({ crc: false }), 0x3d10);
  assert.equal(cor1Value({ crc: false, startupClk: 'JtagClk' }), 0x3d12);
});

test('writeBit6: the packet sequence bitgen writes', () => {
  const r = readBit6(writeBit6({ fdri: emptyFdri(LX16), name: 'top.ncd;UserID=0xFFFFFFFF', date: '2026/10/27', time: '12:00:00', startupClk: 'JtagClk' }));
  assert.deepEqual(r.header, { a: 'top.ncd;UserID=0xFFFFFFFF', b: '6slx16csg324', c: '2026/10/27', d: '12:00:00' });
  assert.deepEqual(r.packets.map(packetLine6), ['W CMD 1: 0007', 'NOOP x1', 'W FLR 1: 0430', 'W COR1 1: 3d02', 'W COR2 1: 09ee', 'W IDCODE 2: 0400 2093',
    'W MASK 1: 00cf', 'W CTL 1: 0081', 'NOOP x17', 'W CCLK_FREQ 1: 3cc8', 'W PWRDN_REG 1: 0881', 'W EYE_MASK 1: 0000', 'W HC_OPT_REG 1: 001f',
    'W CWDT 1: ffff', 'W PU_GWE 1: 0005', 'W PU_GTS 1: 0004', 'W MODE_REG 1: 0100', 'W GENERAL1 1: 0000', 'W GENERAL2 1: 0000',
    'W GENERAL3 1: 0000', 'W GENERAL4 1: 0000', 'W GENERAL5 1: 0000', 'W SEU_OPT 1: 1be2', 'W EXP_SIGN 2: 0000 0000', 'NOOP x2',
    'W FAR_MAJ 2: 0000 0000', 'W CMD 1: 0001', 'W FDRI 231953 words', 'auto CRC 0006c74d', 'NOOP x24', 'W CMD 1: 000a', 'W CMD 1: 0003',
    'NOOP x4', 'W CMD 1: 000a', 'W CMD 1: 0005', 'W MASK 1: 00ff', 'W CTL 1: 0081', 'W CRC 2: 0037 018e', 'W CMD 1: 000d', 'NOOP x14']);
  assert.equal(r.startupClk, 'JtagClk');
  assert.equal(r.crc, true);
  assert.equal(r.device, LX16);
  assert.deepEqual(r.crcChecks, [{ expected: 0x06c74d, computed: 0x06c74d, auto: true }, { expected: 0x37018e, computed: 0x37018e, auto: false }]);
  // the CRC off: the fixed words 9876 DEFC in both places
  const off = readBit6(writeBit6({ fdri: emptyFdri(LX16), crc: false }));
  assert.equal(off.crc, false);
  assert.deepEqual(off.crcChecks, []);
  assert.equal(off.cor1, 0x3d10);
  assert.deepEqual(off.packets.filter(p => p.reg === 'CRC').map(packetLine6), ['W CRC 2: 9876 defc']);
  assert.deepEqual(off.packets.filter(p => p.autoCrc !== undefined).map(packetLine6), ['auto CRC 9876defc']);
});

test('writeBit6: a frame written again (a design with a block RAM), as bitgen writes it; the CRCs measured', () => {
  const sw = measured.find(m => m.file === 'stopwatch/top.crc.bit' && m.device === 'xc6slx45');
  assert.deepEqual(sw.rewrites, [[0x021a, 0x17]]);
  const words = new Uint16Array(130).fill(0xffff, 65);
  words[0] = 0x7579;
  const fdri = emptyFdri(LX45);
  const bytes = writeBit6({ fdri, rewrites: [{ far: [0x021a, 0x17], words }], device: LX45 });
  const r = readBit6(bytes);
  assert.deepEqual(r.packets.slice(28, 35).map(packetLine6), ['auto CRC 00190b77', 'NOOP x24', 'W FAR_MAJ 2: 021a 0017', 'W CMD 1: 0001', 'W FDRI 130 words',
    `auto CRC ${r.packets[33].computed.toString(16).padStart(8, '0')}`, 'W CMD 1: 000a']);
  assert.equal(r.fdri.length, LX45.fdriWords, 'fdri: the first write only');
  assert.deepEqual(r.rewrites.map(x => [x.far, [...x.words]]), [[[0x021a, 0x17], [...words]]]);
  assert.ok(r.crcChecks.every(x => x.expected === x.computed) && r.crcChecks.length === 3);
  assert.equal(bytes.length - writeBit6({ fdri, device: LX45 }).length, (3 + 2 + 3 + 130 + 2) * 2, 'FAR, WCFG, FDRI, its count, the frames, the auto CRC');
  assert.throws(() => writeBit6({ fdri, rewrites: [{ far: [0, 0], words: new Uint16Array(65) }], device: LX45 }), /a frame written again: 65 words, expected 130/);
});

test('writeBit6: the frame data must have the device\'s length', () => {
  assert.throws(() => writeBit6({ fdri: new Uint16Array(10) }), /frame data: 10 words, expected 231953/);
  assert.throws(() => writeBit6({ fdri: emptyFdri(LX16), device: LX45 }), /expected 742057/);
});

test('readBit6: a word changed breaks its CRC; the configuration data alone; errors', () => {
  const bytes = writeBit6({ fdri: emptyFdri(LX16), name: 'x.ncd', date: '2026/10/27', time: '00:00:00' });
  const start = readHeader6(bytes).start;
  assert.equal(start, 13 + (3 + 6) + (3 + 13) + (3 + 11) + (3 + 9) + 5);
  const bad = bytes.slice();
  bad[start + 16 + 2 + 1000 * 2] ^= 1;   // a word of FDRI
  const r = readBit6(bad);
  assert.equal(r.crcChecks.length, 2);
  assert.ok(r.crcChecks.every(x => x.expected !== x.computed));
  const alone = readBit6(bytes.subarray(start));
  assert.equal(alone.header, null);
  assert.equal(alone.fdri.length, LX16.fdriWords);
  assert.throws(() => readBit6(Uint8Array.from([0xff, 0xff, 0x12, 0x34])), /no sync word AA995566/);
  assert.throws(() => readHeader6(Uint8Array.from([0, 9, ...new Array(11).fill(0), 0x7a, 0, 1, 0])), /not a \.bit header \(field 'z' at byte 13\)/);
  assert.throws(() => readHeader6(Uint8Array.from([0, 9, ...new Array(11).fill(0)])), /no field e/);
  // an unknown header word is kept, and a part with an unknown IDCODE has no device
  const u = readBit6(Uint8Array.from([0xaa, 0x99, 0x55, 0x66, 0x80, 0x01, 0x31, 0xc2, 0x04, 0x00, 0x10, 0x93]));
  assert.deepEqual(u.packets.map(packetLine6), ['? 8001', 'W IDCODE 2: 0400 1093']);
  assert.equal(u.device, null);
  assert.equal(u.startupClk, null);
});

test('check-writer6: a bitstream written here passes; one with a word bitgen would not write fails at that byte', () => {
  const bytes = writeBit6({ fdri: emptyFdri(LX45), name: 'a.ncd', device: LX45, startupClk: 'JtagClk', crc: false });
  assert.deepEqual(checkBit(bytes), { same: true, bytes: bytes.length, crc: false, startupClk: 'JtagClk', device: 'xc6slx45', crcOk: true, rewrites: 0, firstDiff: -1 });
  const odd = bytes.slice();
  const i = odd.length - 2;   // the last NOOP made a NOOP of another kind: the reader keeps it, the writer does not
  odd[i] = 0x20; odd[i + 1] = 0x01;
  assert.equal(checkBit(odd).firstDiff, i + 1);
  const rec = recordBit('x/a.bit', bytes);
  assert.deepEqual({ ...rec, sha256: rec.sha256.length }, { file: 'x/a.bit', device: 'xc6slx45', header: { a: 'a.ncd', b: '6slx45csg324', c: '2026/01/01', d: '00:00:00' },
    crc: false, startupClk: 'JtagClk', bytes: bytes.length, sha256: 64, crcs: ['9876defc'], rewrites: [] });
  assert.throws(() => checkBit(Uint8Array.from([0xaa, 0x99, 0x55, 0x66])), /not an XC6SLX16 \/ XC6SLX45 bitstream/);
});
