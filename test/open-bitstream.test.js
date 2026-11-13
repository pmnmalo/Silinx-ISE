// The open families' bitstreams read before programming (#2298, core/open-bitstream.js): the ECP5's .bit (its part and
// IDCODE), the Gowin's .fs (its bytes and IDCODE), checked against the project's device; the files that are not one refused.
// The flows' real files: test/ecp5.test.js, test/gowin.test.js.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ecp5BitInfo, gowinFsInfo, checkOpenBitstream, idHex, ECP5_IDCODES, GOWIN_IDCODES } from '../core/open-bitstream.js';
import { ECP5_PARTS, GOWIN_PARTS } from '../packages/silinx-fpga/src/index.js';
import { ecp5Bit, gowinFs } from './fixtures/open-bitstreams.js';

test('an ECP5 .bit: its part from the comment, its IDCODE from VERIFY_ID, its size', () => {
  const r = ecp5BitInfo(ecp5Bit());
  assert.deepEqual([r.part, idHex(r.idcode), r.size], ['LFE5U-85F-6CABGA381', '0x41113043', 4096]);
  // (a Uint8Array as an ArrayBuffer; no comment: no part, the IDCODE still read)
  assert.equal(ecp5BitInfo(new Uint8Array(ecp5Bit()).buffer).part, 'LFE5U-85F-6CABGA381');
  const bare = ecp5Bit().subarray(ecp5Bit().indexOf(0xbd) - 2);
  assert.deepEqual([ecp5BitInfo(bare).part, idHex(ecp5BitInfo(bare).idcode)], [null, '0x41113043']);
});

test('not an ECP5 .bit: a Xilinx .bit, an empty file, zeros', () => {
  const xilinx = Buffer.from([0x00, 0x09, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0x0f, 0xf0, 0x00, 0x00, 0x01, 0x61]);
  for (const b of [xilinx, Buffer.alloc(0), Buffer.alloc(100)]) assert.throws(() => ecp5BitInfo(b), /^Error: not an ECP5 bitstream \(no Lattice preamble FF FF BD B3\)$/);
});

test('a Gowin .fs: its bytes, its IDCODE, its frames; comments and blank lines skipped', () => {
  const r = gowinFsInfo(gowinFs());
  assert.equal(idHex(r.idcode), '0x1100481b');
  assert.equal(r.frames, 11);
  assert.deepEqual([...r.bytes.subarray(20, 30)], [0xa5, 0xc3, 0x06, 0, 0, 0, 0x11, 0x00, 0x48, 0x1b]);
  assert.equal(r.bytes.length, 20 + 2 + 8 + 8 * 12);
  assert.deepEqual(gowinFsInfo(Buffer.from(`\n${gowinFs({ comment: false })}\n\n`)).bytes, r.bytes);
});

test('not a Gowin .fs: another character, a line not of bytes, no frame', () => {
  assert.throws(() => gowinFsInfo('0101010x\n'), /^Error: not a Gowin \.fs \(line 1: not 8-bit groups of 0s and 1s\)$/);
  assert.throws(() => gowinFsInfo('//c\n010\n'), /^Error: not a Gowin \.fs \(line 2: not 8-bit groups of 0s and 1s\)$/);
  assert.throws(() => gowinFsInfo('// only a comment\n'), /^Error: not a Gowin \.fs \(no frame\)$/);
});

test('checked against the project\'s device: the same part none; another part, another IDCODE: the warning; an unknown part not checked', () => {
  const e = ecp5BitInfo(ecp5Bit()), g = gowinFsInfo(gowinFs());
  assert.equal(checkOpenBitstream('ecp5', e, { part: 'lfe5u-85f' }), null);
  assert.equal(checkOpenBitstream('ecp5', e, { part: 'lfe5u-25f' }), "bitstream was built for 'LFE5U-85F-6CABGA381' but the target device is 'LFE5U-25F'");
  // (a comment that names the part, an IDCODE of another: the IDCODE's warning)
  assert.equal(checkOpenBitstream('ecp5', ecp5BitInfo(ecp5Bit({ idcode: 0x41111043 })), { part: 'lfe5u-85f' }), "bitstream is for the IDCODE 0x41111043 but the target device 'LFE5U-85F' is 0x41113043");
  assert.equal(checkOpenBitstream('gowin', g, { part: 'gw1nr-9c' }), null);
  assert.equal(checkOpenBitstream('gowin', gowinFsInfo(gowinFs({ idcode: 0x0900281b })), { part: 'gw1nr-9c' }), "bitstream is for the IDCODE 0x0900281b but the target device 'GW1NR-9C' is 0x1100481b");
  assert.equal(checkOpenBitstream('gowin', g, { part: 'gw2a-18' }), null);
  assert.equal(checkOpenBitstream('ice40', {}, { part: 'ice40up5k' }), null);
});

test('every ECP5 part and the Gowin\'s parts Silinx has an IDCODE, each a Lattice / Gowin JEDEC one', () => {
  assert.deepEqual(Object.keys(ECP5_IDCODES).sort(), Object.keys(ECP5_PARTS).sort());
  for (const [p, id] of Object.entries(ECP5_IDCODES)) assert.equal(id & 0xfff, 0x043, p);   // (Lattice's manufacturer code, 0x021)
  for (const p of GOWIN_PARTS) if (!GOWIN_IDCODES[p]) assert.fail(`${p}: no IDCODE`);
  for (const [p, id] of Object.entries(GOWIN_IDCODES)) assert.equal(id & 0xfff, 0x81b, p);   // (Gowin's, 0x40d)
});
