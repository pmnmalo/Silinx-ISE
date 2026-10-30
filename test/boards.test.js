// The boards (#405: server/boards.js out of server/devices.js, the family they share in server/family.js):
// devices.js still exports BOARDS and FAMILY; every board is found by its id, its FPGA (and each variant's) is a
// known part of its family, its resources' names are unique, their pins are not shared, and each is marked as
// transcribed from the board's UCF.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as devices from '../server/devices.js';
import { BOARDS } from '../server/boards.js';
import { FAMILY } from '../server/family.js';

test('#405 boards: devices.js exports the modules\' BOARDS and FAMILY', () => {
  assert.equal(devices.BOARDS, BOARDS);
  assert.equal(devices.FAMILY, FAMILY);
  assert.equal(FAMILY, 'spartan3e');
});

test('#405 boards: each found by its id, its FPGA a known part, its resources\' names and pins unique, verified', () => {
  assert.equal(new Set(BOARDS.map(b => b.id)).size, BOARDS.length);
  for (const b of BOARDS) {
    assert.equal(devices.findBoard(b.id), b);
    for (const d of [b.device, ...(b.variants || []).map(v => v.device)]) {
      assert.ok(devices.findPart(d.part), `${b.id}: ${d.part}`);
      assert.equal(devices.familyOf(d.part), d.family, `${b.id}: ${d.part}`);
    }
    assert.equal(new Set(b.resources.map(r => r.name)).size, b.resources.length, `${b.id}: resource names`);
    const pins = b.resources.flatMap(r => r.pins || []);
    assert.equal(new Set(pins).size, pins.length, `${b.id}: a pin on two resources`);
    assert.ok(b.resources.every(r => r.verified === true || r.verified === false), b.id);
  }
});

// (#732) the Atlys has no seven-segment display and no VGA port: the examples' are on its VHDCI connector (channel 1's
// EXP-IO1..12_P, channel 2's EXP-IO1..10_N), the rest of the connector its two VHDCI resources; every example's ports
// then on the Atlys's pins
test('#732 the Atlys: the seven-segment display and VGA on its VHDCI connector, every example\'s ports on its pins', async () => {
  const atlys = BOARDS.find(b => b.id === 'atlys'), r = Object.fromEntries(atlys.resources.map(x => [x.name, x]));
  const ch1 = ['U16', 'U15', 'U13', 'M11', 'R11', 'T12', 'N10', 'M10', 'U11', 'R10', 'U10', 'R8', 'M8', 'U8', 'U7', 'N7', 'T6', 'R7', 'N6', 'U5'];
  const ch2 = ['V16', 'V15', 'V13', 'N11', 'T11', 'V12', 'P11', 'N9', 'V11', 'T10', 'V10', 'T8', 'N8', 'V8', 'V7', 'P8', 'V6', 'T7', 'P7', 'V5'];
  assert.deepEqual([...r.seg.pins, ...r.dp.pins, ...r.an.pins, ...r.vhdci_io1.pins], ch1);
  assert.deepEqual([...r.vga_red.pins, ...r.vga_green.pins, ...r.vga_blue.pins, ...r.vga_hsync.pins, ...r.vga_vsync.pins, ...r.vhdci_io2.pins], ch2);
  for (const n of ['seg', 'dp', 'an']) assert.equal(r[n].extra?.activeLow, true, n);
  for (const n of ['seg', 'dp', 'an', 'vga_red', 'vga_green', 'vga_blue', 'vga_hsync', 'vga_vsync']) assert.match(r[n].label, /on the VHDCI connector/, n);
  const { EXAMPLES, exampleUcf } = await import('./examples-lib.mjs');
  for (const name of EXAMPLES) assert.deepEqual(exampleUcf(name, { board: 'atlys' }).unmatched, [], name);
});
