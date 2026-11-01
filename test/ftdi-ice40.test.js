// An iCE40 board's FT2232H over WebUSB (#2298, core/ftdi-ice40.js): the .bin into its SPI flash, read back, the FPGA
// released to load it; against a simulated board (test/fixtures/ftdi-sim.js: the MPSSE's commands, a W25Q flash, CRESET_B
// and CDONE), its flash compared with the .bin byte for byte
import test from 'node:test';
import assert from 'node:assert/strict';
import { programIce40Flash, FTDI_FILTERS } from '../core/ftdi-ice40.js';
import { ftdiBoard, ice40Image } from './fixtures/ftdi-sim.js';

const fast = { sleep: async () => {}, now: () => 0 };

test('the iCEBreaker\'s flash: the .bin written, read back, the FPGA loads it (CDONE); the blocks it needs erased only', async () => {
  assert.deepEqual(FTDI_FILTERS, [{ vendorId: 0x0403, productId: 0x6010 }]);
  const { usb, st } = ftdiBoard();
  st.flash.fill(0x5a, 0x30000, 0x30010);   // (what the flash holds after the .bin's blocks: kept)
  const bin = ice40Image(104090), log = [];
  const r = await programIce40Flash(usb, bin, { ...fast, log: l => log.push(l) });
  assert.deepEqual(r, { size: 104090, flashId: 'ef 40 18', cdone: true });
  assert.deepEqual(st.flash.subarray(0, bin.length), bin);
  assert.ok(st.flash.subarray(bin.length, 0x20000).every(b => b === 0xff));
  assert.ok(st.flash.subarray(0x30000, 0x30010).every(b => b === 0x5a));
  assert.deepEqual(st.erased, [0, 0x10000]);
  assert.deepEqual(log, ['Configuration file: 104090 bytes (an iCE40\'s .bin)', 'Programming (SPI flash, non-volatile) through the board\'s FT2232H (WebUSB)',
    'Flash JEDEC id: ef 40 18', 'Erasing 2 block(s) of 64 KB...', 'Writing 104090 bytes...', 'Verifying...', 'STATUS: CDONE high: the FPGA loaded the design (0.0 s)',
    'Programming finished.']);
  // the FPGA held in reset while the flash was written (never both on the SPI pins), the flash put to sleep, the FT2232H let go
  assert.equal(st.contention, false);
  assert.equal(st.poweredDown, true);
  assert.deepEqual([st.creset, st.cs, st.claimed, st.opened], [true, true, false, false]);
  assert.deepEqual(st.controls.at(-1), [0x0b, 0x00ff]);   // (out of MPSSE mode)
  assert.deepEqual(st.controls.slice(0, 6), [[0, 0], [0, 1], [0, 2], [0x09, 1], [0x0b, 0x00ff], [0x0b, 0x02ff]]);
  // a page at a time, each after a write enable; every command's code as the flash's data sheet gives it
  assert.equal(st.commands.filter(c => c === 0x02).length, Math.ceil(104090 / 256));
  assert.equal(st.commands[0], 0xab);
  assert.equal(st.commands[1], 0x9f);
  assert.equal(st.commands.at(-1), 0xb9);
});

test('the FT2232H at full speed: 64-byte packets, each with its 2 status bytes', async () => {
  const { usb, st } = ftdiBoard({ packet: 64 });
  const bin = ice40Image(5000);
  assert.equal((await programIce40Flash(usb, bin, fast)).cdone, true);
  assert.deepEqual(st.flash.subarray(0, bin.length), bin);
});

test('the errors: no flash, a byte that does not take, no CDONE, no MPSSE, the board in use, nothing to write', async () => {
  const run = (opts, bin = ice40Image(3000)) => programIce40Flash(ftdiBoard(opts).usb, bin, fast);
  await assert.rejects(run({ jedec: [0xff, 0xff, 0xff] }), /^Error: FTDI USB: no SPI flash answers \(JEDEC id ff ff ff\)/);
  await assert.rejects(run({ stuck: 0x123 }), /^Error: FTDI USB: verification failed at 0x000123: 0x[0-9a-f]{2} read, 0x[0-9a-f]{2} written$/);
  // (an image with no sync word: the FPGA does not configure)
  await assert.rejects(run({}, new Uint8Array(3000).fill(0x11)), /the FPGA did not raise CDONE after loading the flash/);
  await assert.rejects(run({ mpsse: false }), /no answer from the FT2232H/);
  await assert.rejects(run({ claimError: 'Unable to claim interface.' }), /the board is in use \(another program, or the operating system's FTDI driver: Unable to claim interface\.\)/);
  await assert.rejects(run({}, new Uint8Array(0)), /no \.bin to write/);
});
