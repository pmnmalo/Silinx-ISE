// JTAG through the ULX3S's FT231X in bit-bang mode over WebUSB (#2298, core/ft231x-jtag.js), against a simulated ULX3S
// (test/fixtures/ft231x-sim.js: the FT231X's bit-bang modes on the board's pins, a TAP and an ECP5): the chain scanned; the
// ECP5's SRAM erased and loaded with a .bit (the bytes it took the file's from its preamble, DONE, the instructions in their
// order, never more than the RX FIFO holds); the reads of TDO; the errors (another device's .bit by the file and by the FPGA,
// not an ECP5 .bit, an SRAM that stays busy, the board in use, no ECP5); the log, with no warning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Ft231xJtag, scanFt231x, programEcp5Sram, ECP5, ECP5_STATUS } from '../core/ft231x-jtag.js';
import { ft231xBoard } from './fixtures/ft231x-sim.js';
import { ecp5Bit } from './fixtures/open-bitstreams.js';

let t = 0;
const opts = extra => ({ now: () => (t += 1), sleep: async () => {}, ...extra });
const logOf = () => { const lines = []; return { lines, log: l => lines.push(l) }; };

test('the port: Test-Logic-Reset to Shift-DR, the IDCODE read (synchronous bit-bang), clocks written (asynchronous)', async () => {
  const { usb, st } = ft231xBoard();
  const p = await new Ft231xJtag(usb).open();
  assert.deepEqual([st.mode, st.mask, st.latency, st.baud], [1, 0xe0, 1, 3]);
  await p.putTmsTdiBits(false, 9, new Uint8Array([0xaa, 0x22, 0x00]));
  assert.equal(st.state, 'SDR');
  const id = await p.getTdoBits(false, false, 32);
  assert.equal(st.mode, 4);
  assert.equal(((id[3] << 24) | (id[2] << 16) | (id[1] << 8) | id[0]) >>> 0, 0x41113043);
  // 300 clocks with no data: written, nothing to read back
  const before = st.clocks;
  await p.clockTck(false, false, 300);
  assert.deepEqual([st.clocks - before, st.mode, st.rx.length], [300, 1, 0]);
  await p.close();
  assert.equal(st.mode, 0, 'the bit mode reset on close');
});

test('scan: the ULX3S\'s ECP5 (LFE5U-85F; the 25F by its own IDCODE)', async () => {
  const l = logOf();
  assert.deepEqual(await scanFt231x(ft231xBoard().usb, { log: l.log }), { devices: [{ name: 'lfe5u-85f', idcode: 0x41113043, kind: 'fpga' }] });
  assert.deepEqual(l.lines, ['Programmer: the board\'s FT231X (JTAG, bit-bang), from the browser (WebUSB)', 'Position 1: LFE5U-85F (IDCODE 0x41113043)']);
  assert.equal((await scanFt231x(ft231xBoard({ device: 'lfe5u-25f', deviceOptions: { idcode: 0x41111043 } }).usb)).devices[0].name, 'lfe5u-25f');
});

test('an ECP5\'s SRAM loaded with a .bit: from its preamble, DONE; the instructions in their order; the RX FIFO never overrun', async () => {
  const { usb, st } = ft231xBoard(), l = logOf(), bit = ecp5Bit({ size: 6000 });
  const r = await programEcp5Sram(usb, bit, opts({ idcode: 0x41113043, log: l.log }));
  assert.deepEqual([r.fpga, r.status & ECP5_STATUS.DONE, r.status & ECP5_STATUS.ISC_EN, r.status & ECP5_STATUS.CHECK_MASK], ['lfe5u-85f', ECP5_STATUS.DONE, 0, 0]);
  const pre = bit.indexOf(Buffer.from([0xff, 0xff, 0xbd, 0xb3]));
  assert.deepEqual(Buffer.from(st.dev.config), bit.subarray(pre));
  assert.deepEqual([st.dev.done, st.dev.errors, st.overflow], [true, [], false]);
  assert.deepEqual(st.dev.ops, [ECP5.ISC_ENABLE, ECP5.ISC_ERASE, ECP5.INIT_ADDRESS, ECP5.BURST, ECP5.ISC_DISABLE]);
  assert.deepEqual(l.lines.filter(x => /WARNING|ERROR/.test(x)), []);
  assert.deepEqual(l.lines.slice(0, 4), ['Programmer: the board\'s FT231X (JTAG, bit-bang), from the browser (WebUSB)', 'JTAG chain: LFE5U-85F', 'Erasing the SRAM', `LSC_BITSTREAM_BURST: ${bit.length - pre} bytes`]);
  assert.match(l.lines.at(-1), /^DONE: the FPGA is configured in [\d.]+ s$/);
  assert.equal(st.mode, 0);
});

test('an ECP5\'s errors: another part\'s .bit (by the file, by the FPGA), not an ECP5 .bit, an SRAM that stays busy, the board in use', async () => {
  const other = ecp5Bit({ part: 'LFE5U-25F-6CABGA381', idcode: 0x41111043 });
  await assert.rejects(programEcp5Sram(ft231xBoard().usb, other, opts({ idcode: 0x41111043 })),
    /^Error: FT231X USB: the board's FPGA is a LFE5U-85F \(IDCODE 0x41113043\), the bitstream is for 0x41111043$/);
  const b = ft231xBoard();
  await assert.rejects(programEcp5Sram(b.usb, other, opts()), /^Error: FT231X USB: the FPGA refused the bitstream: its IDCODE is another device's$/);
  assert.equal(b.st.dev.done, false);
  await assert.rejects(programEcp5Sram(ft231xBoard().usb, Buffer.alloc(100), opts()), /^Error: FT231X USB: not an ECP5 bitstream \(no Lattice preamble FF FF BD B3\)$/);
  await assert.rejects(programEcp5Sram(ft231xBoard({ deviceOptions: { eraseClocks: 1e9 } }).usb, ecp5Bit(), opts({ maxPolls: 3 })), /^Error: FT231X USB: the FPGA stayed busy \(erasing, status 0x00001200\)$/);
  await assert.rejects(programEcp5Sram(ft231xBoard({ claimError: 'busy' }).usb, ecp5Bit(), opts()), /^Error: FT231X USB: the board is in use/);
  await assert.rejects(programEcp5Sram(ft231xBoard({ device: 'gw1nr-9c' }).usb, ecp5Bit(), opts()), /^Error: FT231X USB: no ECP5 FPGA on the JTAG chain \(found gw1nr-9c\)$/);
});
