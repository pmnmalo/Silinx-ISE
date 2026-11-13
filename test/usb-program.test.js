// The browser edition's board programming (#2298, core/usb-program.js): the driver by the board's webusb and the file, each
// against its simulated board: the Basys 3's and the Nexys A7's Digilent FT2232H (a .bit, JTAG), the Tang Nano 9K's BL702 (a
// .fs, its IDCODE checked, refused or forced and warned), the ULX3S's FT231X (an ECP5 .bit, the same), the iCEBreaker's FT2232H
// (a .bin, its flash), the Basys2's Adept; the WebUSB device asked by its vendor and product; the scans.
import test from 'node:test';
import assert from 'node:assert/strict';
import { programUsb, scanUsb, usbOf } from '../core/usb-program.js';
import { findBoard } from '../core/devices.js';
import { ftdiJtagBoard, xc7Bitstream } from './fixtures/ftdi-jtag-sim.js';
import { ftdiBoard, ice40Image } from './fixtures/ftdi-sim.js';
import { SimAdeptBoard } from './fixtures/adept-sim.js';
import { ft231xBoard } from './fixtures/ft231x-sim.js';
import { gowinFs, ecp5Bit } from './fixtures/open-bitstreams.js';

const enc = s => new TextEncoder().encode(s);
// the browser's chooser: the board's device, the filters it was asked with kept
const chooser = usb => { const asked = []; return { asked, getUsb: async (vendor, filters) => { asked.push([vendor, filters]); return usb; } }; };
const logOf = () => { const lines = []; return { lines, log: l => lines.push(l) }; };
const B = id => findBoard(id);

test('the boards\' USB as the browser drives it', () => {
  assert.deepEqual(['basys3', 'nexys-a7', 'tangnano9k', 'icebreaker', 'icebreaker-vga', 'ulx3s', 'basys2', 'nexys2'].map(b => usbOf(B(b))),
    ['digilent', 'digilent', 'ft2232', 'spi', 'spi', 'ft231x', null, null]);
  assert.equal(usbOf(null), null);
});

test('the Basys 3: a .bit through its Digilent FT2232H (JTAG), the FPGA configured; the FTDI device asked for', async () => {
  const { usb, st } = ftdiJtagBoard({ device: 'xc7a35t' }), c = chooser(usb), l = logOf();
  const r = await programUsb({ board: B('basys3'), device: B('basys3').device, file: 'build/top.bit', data: xc7Bitstream(), getUsb: c.getUsb, log: l.log });
  assert.deepEqual(r, { fpga: 'xc7a35t' });
  assert.equal(st.dev.done, true);
  assert.deepEqual(c.asked, [[0x0403, [{ vendorId: 0x0403, productId: 0x6010 }]]]);
  assert.deepEqual(l.lines.filter(x => /WARNING|ERROR/.test(x)), []);
  // the Nexys A7's XC7A100T; a .bit for the Basys 3 on it: refused by the chain's FPGA
  const n = ftdiJtagBoard({ device: 'xc7a100t' });
  await assert.rejects(programUsb({ board: B('nexys-a7'), device: { part: 'xc7a35t' }, file: 'build/top.bit', data: xc7Bitstream(), getUsb: chooser(n.usb).getUsb }),
    /^Error: FTDI USB: the board's FPGA is a XC7A100T, the bitstream is for a XC7A35T$/);
});

test('the Tang Nano 9K: a .fs into its SRAM through the BL702; another device\'s refused, forced: the FPGA refuses it', async () => {
  const { usb, st } = ftdiJtagBoard({ device: 'gw1nr-9c' }), l = logOf(), text = gowinFs();
  const dev = B('tangnano9k').device;
  await programUsb({ board: B('tangnano9k'), device: dev, file: 'build/top.fs', data: enc(text), getUsb: chooser(usb).getUsb, log: l.log });
  assert.equal(st.dev.done, true);
  assert.deepEqual(l.lines.slice(0, 2), [`Bitstream build/top.fs (${text.length} bytes, a Gowin's .fs, IDCODE 0x1100481b)`, 'Programming (SRAM, volatile)']);
  assert.deepEqual(l.lines.filter(x => /WARNING|ERROR/.test(x)), []);
  const other = enc(gowinFs({ idcode: 0x0900281b }));
  await assert.rejects(programUsb({ board: B('tangnano9k'), device: dev, file: 'build/top.fs', data: other, getUsb: chooser(ftdiJtagBoard({ device: 'gw1nr-9c' }).usb).getUsb }),
    /^Error: bitstream is for the IDCODE 0x0900281b but the target device 'GW1NR-9C' is 0x1100481b: not programmed$/);
  const f = logOf();
  await assert.rejects(programUsb({ board: B('tangnano9k'), device: dev, file: 'build/top.fs', data: other, force: true, getUsb: chooser(ftdiJtagBoard({ device: 'gw1nr-9c' }).usb).getUsb, log: f.log }),
    /^Error: FTDI USB: the FPGA refused the bitstream: its IDCODE is another device's$/);
  assert.deepEqual(f.lines.filter(x => /WARNING/.test(x)), ["WARNING: bitstream is for the IDCODE 0x0900281b but the target device 'GW1NR-9C' is 0x1100481b"]);
  await assert.rejects(programUsb({ board: B('tangnano9k'), device: dev, file: 'build/top.fs', data: enc('nope\n'), getUsb: chooser(usb).getUsb }),
    /^Error: build\/top\.fs: not a Gowin \.fs \(line 1: not 8-bit groups of 0s and 1s\)$/);
  await assert.rejects(programUsb({ board: B('basys2'), device: dev, file: 'build/top.fs', data: enc(text), getUsb: chooser(usb).getUsb }), /^Error: Digilent Basys2 is not programmed from the browser with a \.fs$/);
});

test('the iCEBreaker: a .bin into its flash; the Basys2: a .bit through its Adept; the ULX3S: not from the browser yet', async () => {
  const ice = ftdiBoard(), c = chooser(ice.usb), bin = ice40Image(3000);
  await programUsb({ board: B('icebreaker'), device: B('icebreaker').device, file: 'build/top.bin', data: bin, getUsb: c.getUsb });
  assert.deepEqual(ice.st.flash.subarray(0, bin.length), bin);
  assert.deepEqual(c.asked, [[0x0403, [{ vendorId: 0x0403, productId: 0x6010 }]]]);
  const adept = new SimAdeptBoard(), a = chooser(adept);
  const bit = new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xaa, 0x99, 0x55, 0x66, 1, 2, 3, 4]);
  await programUsb({ board: B('basys2'), device: B('basys2').device, file: 'build/top.bit', data: bit, getUsb: a.getUsb });
  assert.equal(adept.done, true);
  assert.deepEqual(a.asked, [[0x1443, [{ vendorId: 0x1443 }]]]);
  // (an ECP5 project on a board whose USB the browser does not drive)
  await assert.rejects(programUsb({ board: B('basys2'), device: B('ulx3s').device, file: 'build/top.bit', data: bit, getUsb: a.getUsb }),
    /^Error: the ECP5's boards are not programmed from the browser yet: the local server programs them \(silinx serve\), with openFPGALoader$/);
});

test('the ULX3S: an ECP5 .bit into its SRAM through its FT231X (bit-bang JTAG); another part\'s refused, forced: the FPGA refuses it', async () => {
  const { usb, st } = ft231xBoard(), c = chooser(usb), l = logOf(), bit = ecp5Bit({ size: 3000 });
  const dev = B('ulx3s').device;
  await programUsb({ board: B('ulx3s'), device: dev, file: 'build/top.bit', data: bit, getUsb: c.getUsb, log: l.log });
  assert.equal(st.dev.done, true);
  assert.deepEqual(c.asked, [[0x0403, [{ vendorId: 0x0403, productId: 0x6015 }]]]);
  assert.deepEqual(l.lines.slice(0, 2), ['Bitstream build/top.bit (3000 bytes, an ECP5\'s .bit: part LFE5U-85F-6CABGA381, IDCODE 0x41113043)', 'Programming (SRAM, volatile)']);
  assert.deepEqual(l.lines.filter(x => /WARNING|ERROR/.test(x)), []);
  const other = ecp5Bit({ part: 'LFE5U-25F-6CABGA381', idcode: 0x41111043 });
  await assert.rejects(programUsb({ board: B('ulx3s'), device: dev, file: 'build/top.bit', data: other, getUsb: chooser(ft231xBoard().usb).getUsb }),
    /^Error: bitstream was built for 'LFE5U-25F-6CABGA381' but the target device is 'LFE5U-85F': not programmed$/);
  const f = logOf();
  await assert.rejects(programUsb({ board: B('ulx3s'), device: dev, file: 'build/top.bit', data: other, force: true, getUsb: chooser(ft231xBoard().usb).getUsb, log: f.log }),
    /^Error: FT231X USB: the FPGA refused the bitstream: its IDCODE is another device's$/);
  assert.deepEqual(f.lines.filter(x => /WARNING/.test(x)), ["WARNING: bitstream was built for 'LFE5U-25F-6CABGA381' but the target device is 'LFE5U-85F'"]);
  await assert.rejects(programUsb({ board: B('ulx3s'), device: dev, file: 'build/top.bit', data: new Uint8Array(64), getUsb: c.getUsb }),
    /^Error: build\/top\.bit: not an ECP5 bitstream \(no Lattice preamble FF FF BD B3\)$/);
  assert.deepEqual((await scanUsb({ board: B('ulx3s'), getUsb: chooser(ft231xBoard().usb).getUsb })).devices.map(d => d.name), ['lfe5u-85f']);
});

test('scan: the Basys 3\'s chain, the Tang Nano 9K\'s, the Basys2\'s; the iCEBreaker has none', async () => {
  assert.deepEqual((await scanUsb({ board: B('basys3'), getUsb: chooser(ftdiJtagBoard({ device: 'xc7a35t' }).usb).getUsb })).devices.map(d => d.name), ['xc7a35t']);
  assert.deepEqual((await scanUsb({ board: B('tangnano9k'), getUsb: chooser(ftdiJtagBoard({ device: 'gw1nr-9c' }).usb).getUsb })).devices.map(d => d.name), ['gw1nr-9c']);
  assert.deepEqual((await scanUsb({ board: B('basys2'), getUsb: chooser(new SimAdeptBoard()).getUsb })).devices.map(d => d.name), ['xc3s250e', 'xcf02s']);
  await assert.rejects(scanUsb({ board: B('icebreaker'), getUsb: async () => null }), /^Error: 1BitSquared iCEBreaker has no JTAG chain to scan: its FPGA loads its SPI flash$/);
});
