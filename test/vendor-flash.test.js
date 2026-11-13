// A board whose maker's tool writes its SPI flash over its USB (#3711): core/vendor-flash.js names the tool, the file
// (build/<top>_prom.bin) and its command (the Mimas V2's MimasV2Config; the Elbert V2's tool has none, a program with a
// window); the other boards (JTAG on their USB: the Basys2's Adept; the Cmod S6's, whose flash is not written that way)
// have none. ISE's option file of the PROM bitstream asks for the binary on such a board only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { vendorFlash, vendorFlashText } from '../core/vendor-flash.js';
import { findBoard } from '../server/devices.js';
import { BOARDS } from '../server/boards.js';
import { generateUt } from '../server/ise.js';

test('#3711 the Mimas V2\'s and the Elbert V2\'s flash tools, their .bin and command; no other board has one', () => {
  assert.deepEqual(vendorFlash(findBoard('mimas-v2'), 'digital_clock'), {
    tool: 'MimasV2Config (Numato)', file: 'build/digital_clock_prom.bin',
    command: 'python -m MimasV2.Config <SERIAL_PORT> build/digital_clock_prom.bin',
    url: 'https://github.com/numato/samplecode/tree/master/FPGA/MimasV2/tools/configuration/python' });
  assert.equal(vendorFlashText(findBoard('elbert-v2'), 'top'),
    'Numato Elbert V2: program its flash over its USB with Elbert V2 Configuration Tool (Numato) and build/top_prom.bin (StartUpClk Cclk, the flash\'s bitstream) (https://github.com/numato/samplecode/tree/master/FPGA/ElbertV2/tools).');
  assert.deepEqual(BOARDS.filter(b => vendorFlash(b, 'top')).map(b => b.id), ['mimas-v2', 'elbert-v2']);
  assert.equal(vendorFlash(null, 'top'), null);
  assert.equal(vendorFlashText(findBoard('basys2'), 'top'), null);
  // (a tool that is not on the board's USB, or a flash that is not SPI: none)
  assert.equal(vendorFlash({ programmer: { vendorTool: { name: 'X', onboard: false } }, flash: { type: 'spi' } }, 'top'), null);
  assert.equal(vendorFlash({ programmer: { vendorTool: { name: 'X', onboard: true } }, flash: { type: 'xcf' } }, 'top'), null);
  assert.equal(vendorFlash(findBoard('mimas-v2'), '').file, 'build/<top>_prom.bin');
});

test('#3711 bitgen\'s option file: a binary when asked, on the Spartan-3 families and the others', () => {
  for (const family of ['spartan3e', 'spartan3a', 'spartan6']) {
    assert.match(generateUt({ family, binary: true }), /^-g Binary:yes$/m, family);
    assert.match(generateUt({ family }), /^-g Binary:no$/m, family);
    assert.doesNotMatch(generateUt({ family, binary: true }), /Binary:no/, family);
  }
});
