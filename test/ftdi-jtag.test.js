// JTAG through an FTDI FT2232H over WebUSB (#2298, core/ftdi-jtag.js), against a simulated board (test/fixtures/ftdi-jtag-sim.js:
// the MPSSE's commands, a TAP, an Artix-7 and a GW1NR-9C): the chain scanned; the Basys 3's and the Nexys A7's Artix-7
// configured with a .bit (the bytes it took the file's from the sync word, DONE); the Tang Nano 9K's GW1NR-9C's SRAM erased and
// loaded with a .fs (its bytes, DONE, the order of the instructions); the cable's pins; the errors (another device, a refused
// bitstream, no MPSSE, the board in use, an SRAM never erased); the log, with no warning.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FtdiJtag, scanFtdi, programFtdiXilinx, programGowinSram, CABLES, GOWIN } from '../core/ftdi-jtag.js';
import { gowinFsInfo } from '../core/open-bitstream.js';
import { ftdiJtagBoard, xc7Bitstream } from './fixtures/ftdi-jtag-sim.js';
import { gowinFs } from './fixtures/open-bitstreams.js';

let t = 0;
const opts = extra => ({ now: () => (t += 1), ...extra });
const logOf = () => { const lines = []; return { lines, log: l => lines.push(l) }; };
const noWarnings = lines => assert.deepEqual(lines.filter(l => /WARNING|ERROR/.test(l)), []);

test('the port: TAP moves, a read of bits, of bytes, clocks: what the TAP saw', async () => {
  const { usb, st } = ftdiJtagBoard({ device: 'xc7a35t' });
  const p = await new FtdiJtag(usb, 'digilent').open();
  await p.enable();
  assert.deepEqual([st.low, st.high], [CABLES.digilent.low, CABLES.digilent.high]);
  // Test-Logic-Reset, Run-Test/Idle, Shift-DR (pairs: TMS 1 1 1 1 1 0 1 0 0), then the IDCODE out (32 bits), as Chain.init
  await p.putTmsTdiBits(false, 9, new Uint8Array([0xaa, 0x22, 0x00]));
  assert.equal(st.state, 'SDR');
  const id = await p.getTdoBits(false, false, 32);
  assert.equal(((id[3] << 24) | (id[2] << 16) | (id[1] << 8) | id[0]) >>> 0, 0x0362d093);
  // a read of 5 bits, then of 13 (a byte and 5 bits): the IDCODE's bits 0..4, 5..17
  await p.putTmsTdiBits(false, 2, new Uint8Array([0x0a]));   // Exit1-DR, Update-DR
  await p.putTmsTdiBits(false, 3, new Uint8Array([0x02]));   // Select-DR, Capture-DR, Shift-DR
  assert.deepEqual([...await p.putTdiBits(true, false, 5, new Uint8Array([0]))], [0x13]);
  assert.deepEqual([...await p.putTdiBits(true, false, 13, new Uint8Array([0, 0]))], [0x84, 0x16]);
  // clocks with no data: 3 bytes' and 5 more
  const before = st.clocks;
  await p.clockTck(false, false, 29);
  assert.equal(st.clocks - before, 29);
  await assert.rejects(p.clockTck(true, false, 1), /^Error: FTDI USB: clocks with TMS high$/);
  assert.deepEqual(st.badCommands, [0xaa]);   // (only open()'s: the MPSSE's answer to a bad command checked)
  await p.close();
});

test('scan: the Basys 3\'s chain, the Tang Nano 9K\'s', async () => {
  const a = logOf();
  assert.deepEqual(await scanFtdi(ftdiJtagBoard({ device: 'xc7a35t' }).usb, { cable: 'digilent', log: a.log }), { devices: [{ name: 'xc7a35t', idcode: 0x0362d093, kind: 'fpga' }] });
  assert.deepEqual(a.lines, ['Programmer: the board\'s Digilent USB-JTAG (FT2232H), from the browser (WebUSB)', 'Position 1: XC7A35T (IDCODE 0x0362d093)']);
  const g = logOf();
  assert.deepEqual((await scanFtdi(ftdiJtagBoard({ device: 'gw1nr-9c' }).usb, { log: g.log })).devices, [{ name: 'gw1nr-9c', idcode: 0x1100481b, kind: 'fpga' }]);
  assert.equal(g.lines[1], 'Position 1: GW1NR-9C (IDCODE 0x1100481b)');
});

test('an Artix-7 configured with a .bit: the bytes from its sync word taken, DONE; the Nexys A7\'s XC7A100T (another version) too', async () => {
  const { usb, st } = ftdiJtagBoard({ device: 'xc7a35t' });
  const bit = xc7Bitstream(), l = logOf();
  assert.deepEqual(await programFtdiXilinx(usb, bit, opts({ log: l.log, part: 'xc7a35t' })), { fpga: 'xc7a35t' });
  assert.equal(st.dev.done, true);
  assert.deepEqual(st.dev.config, bit.subarray(20));   // (from the sync word on)
  noWarnings(l.lines);
  assert.deepEqual(l.lines.slice(0, 5), ['Programmer: the board\'s Digilent USB-JTAG (FT2232H), from the browser (WebUSB)', 'JTAG chain: XC7A35T',
    'JPROGRAM: clearing the configuration', `CFG_IN: ${bit.length} bytes`, 'JSTART']);
  assert.match(l.lines.at(-1), /^DONE: the FPGA is configured in [\d.]+ s$/);
  assert.deepEqual([st.low, st.high], [CABLES.digilent.low, CABLES.digilent.high]);
  assert.equal(st.mode, 0, 'the bit mode reset on close');
  const n = ftdiJtagBoard({ device: 'xc7a100t' });
  await programFtdiXilinx(n.usb, xc7Bitstream(0x13631093), opts({ part: 'xc7a100t' }));
  assert.equal(n.st.dev.done, true);
});

test('an Artix-7\'s errors: a bitstream for another part, one the FPGA refuses, INIT never back, no MPSSE, the board in use', async () => {
  await assert.rejects(programFtdiXilinx(ftdiJtagBoard({ device: 'xc7a35t' }).usb, xc7Bitstream(), opts({ part: 'xc7a100t' })),
    /^Error: FTDI USB: the board's FPGA is a XC7A35T, the bitstream is for a XC7A100T$/);
  const refused = ftdiJtagBoard({ device: 'xc7a35t' });
  await assert.rejects(programFtdiXilinx(refused.usb, xc7Bitstream(0x03631093), opts({ maxPolls: 20 })), /^Error: FTDI USB: DONE did not go high: the bitstream was not accepted \(wrong device or a corrupt file\?\)$/);
  await assert.rejects(programFtdiXilinx(ftdiJtagBoard({ device: 'xc7a35t', deviceOptions: { initDelay: 1e9 } }).usb, xc7Bitstream(), opts({ maxPolls: 5 })),
    /^Error: FTDI USB: the FPGA does not get ready \(INIT_B stays low\)$/);
  await assert.rejects(programFtdiXilinx(ftdiJtagBoard({ mpsse: false }).usb, xc7Bitstream(), opts()), /^Error: FTDI USB: no answer from the FT2232H \(0 of 2 bytes\)$/);
  await assert.rejects(programFtdiXilinx(ftdiJtagBoard({ claimError: 'busy' }).usb, xc7Bitstream(), opts()), /^Error: FTDI USB: the board is in use/);
  // a Gowin on the chain: no Xilinx FPGA's sequence for it
  await assert.rejects(programFtdiXilinx(ftdiJtagBoard({ device: 'gw1nr-9c' }).usb, xc7Bitstream(), opts({ part: 'xc7a35t' })), /^Error: FTDI USB: the board's FPGA is a GW1NR-9C, the bitstream is for a XC7A35T$/);
});

test('a GW1NR-9C\'s SRAM erased, then loaded with a .fs: its bytes, DONE; the instructions in their order', async () => {
  const { usb, st } = ftdiJtagBoard({ device: 'gw1nr-9c' });
  const fs = gowinFsInfo(gowinFs()), l = logOf();
  const r = await programGowinSram(usb, fs.bytes, opts({ idcode: fs.idcode, log: l.log }));
  assert.deepEqual([r.fpga, r.status & 0x2000], ['gw1nr-9c', 0x2000]);
  assert.deepEqual(st.dev.config, fs.bytes);
  assert.deepEqual([st.dev.done, st.dev.errors], [true, []]);
  assert.deepEqual(st.dev.ops, [GOWIN.CONFIG_ENABLE, GOWIN.ERASE_SRAM, GOWIN.XFER_DONE, GOWIN.INIT_ADDR, GOWIN.XFER_WRITE, GOWIN.CONFIG_DISABLE]);
  assert.deepEqual([st.low, st.high], [CABLES.ft2232.low, CABLES.ft2232.high]);
  noWarnings(l.lines);
  assert.deepEqual(l.lines.slice(0, 4), ['Programmer: the board\'s USB-JTAG (an FT2232H, or its BL702), from the browser (WebUSB)', 'JTAG chain: GW1NR-9C', 'Erasing the SRAM', `XFER_WRITE: ${fs.bytes.length} bytes`]);
  assert.match(l.lines.at(-1), /^DONE: the FPGA is configured in [\d.]+ s$/);
});

test('a GW1NR-9C\'s errors: another device\'s .fs (by the file, by the FPGA), an SRAM never erased, an empty file, no Gowin', async () => {
  const other = gowinFsInfo(gowinFs({ idcode: 0x0900281b }));
  await assert.rejects(programGowinSram(ftdiJtagBoard({ device: 'gw1nr-9c' }).usb, other.bytes, opts({ idcode: other.idcode })),
    /^Error: FTDI USB: the board's FPGA has the IDCODE 0x1100481b, the bitstream is for 0x0900281b$/);
  const b = ftdiJtagBoard({ device: 'gw1nr-9c' });
  await assert.rejects(programGowinSram(b.usb, other.bytes, opts()), /^Error: FTDI USB: the FPGA refused the bitstream: its IDCODE is another device's$/);
  assert.equal(b.st.dev.done, false);
  await assert.rejects(programGowinSram(ftdiJtagBoard({ device: 'gw1nr-9c', deviceOptions: { eraseClocks: 1e9 } }).usb, other.bytes, opts({ maxPolls: 3 })),
    /^Error: FTDI USB: the SRAM was not erased \(status 0x00000080\)$/);
  await assert.rejects(programGowinSram(ftdiJtagBoard({ device: 'gw1nr-9c' }).usb, new Uint8Array(0), opts()), /^Error: FTDI USB: no \.fs to load$/);
  await assert.rejects(programGowinSram(ftdiJtagBoard({ device: 'xc7a35t' }).usb, other.bytes, opts()), /^Error: FTDI USB: no Gowin FPGA on the JTAG chain \(found xc7a35t\)$/);
});

test('64-byte packets (a full-speed BL702): the same reads', async () => {
  const { usb, st } = ftdiJtagBoard({ device: 'gw1nr-9c', packet: 64 });
  const fs = gowinFsInfo(gowinFs({ frames: 40 }));
  await programGowinSram(usb, fs.bytes, opts({ idcode: fs.idcode }));
  assert.deepEqual(st.dev.config, fs.bytes);
});
