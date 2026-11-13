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

// (#3709) the Mimas V2's display as the other boards': Numato's SevenSegment[7..1] are a..g and [0] the decimal point
// (its demo's "abcdefgh"), its 3 digit enables an, all active low, as its buttons and DIP switches (pull-ups); the
// examples' seg, dp and an then on its pins, an<3> on a header pin (3 digits), and the clock's UCF on them
test('#3709 the Mimas V2: seg a..g, dp and an (3 digits) on Numato\'s pins, active low, the examples\' display on them', async () => {
  const mimas = BOARDS.find(b => b.id === 'mimas-v2'), r = Object.fromEntries(mimas.resources.map(x => [x.name, x]));
  assert.deepEqual(r.seg.pins, ['A3', 'B4', 'A4', 'C4', 'C5', 'D6', 'C6']);
  assert.deepEqual(r.dp.pins, ['A5']);
  assert.deepEqual(r.an.pins, ['B2', 'A2', 'B3']);
  assert.deepEqual(r.sw.pins, ['C17', 'C18', 'D17', 'D18', 'E18', 'E16', 'F18', 'F17']);
  for (const n of ['seg', 'dp', 'an', 'sw', 'btn']) assert.equal(r[n].extra?.activeLow, true, n);
  for (const n of ['sw', 'btn']) assert.equal(r[n].pull, 'up', n);
  assert.equal(r.led.extra?.activeHigh, true);
  const { EXAMPLES, exampleUcf } = await import('./examples-lib.mjs');
  // (what the board has no pin for, an<3> and uart's rx: on its headers' free pins, board-headers.test.js)
  for (const name of EXAMPLES) assert.deepEqual(exampleUcf(name, { board: 'mimas-v2' }).unmatched, [], name);
  const { text } = exampleUcf('clock', { board: 'mimas-v2' });
  const locs = Object.fromEntries([...text.matchAll(/^NET "([^"]+)"\s+LOC = "([^"]+)"/gm)].map(m => [m[1], m[2]]));
  assert.deepEqual(['seg<0>', 'seg<1>', 'seg<2>', 'seg<3>', 'seg<4>', 'seg<5>', 'seg<6>', 'dp', 'an<0>', 'an<1>', 'an<2>'].map(n => locs[n]),
    ['A3', 'B4', 'A4', 'C4', 'C5', 'D6', 'C6', 'A5', 'B2', 'A2', 'B3']);
  assert.match(text, /^NET "an<3>"\s+LOC = "U7" ;  # no pin on the board: on the header pin io_p6<0>$/m);
  assert.deepEqual(['clk', 'sw<0>', 'sw<1>', 'btn<0>', 'btn<3>'].map(n => locs[n]), ['V10', 'C17', 'C18', 'M18', 'L17']);
  assert.match(text, /TIMESPEC "TS_clk" = PERIOD "clk" 10 ns HIGH 50% ;/);
});

// (#3741) the Elbert V2's display as the Mimas V2's (#3709): Numato's SevenSegment[7..1] are a..g and [0] the decimal
// point (its demo's "abcdefgh", 0 = "00000010"), its 3 digit enables Enable[0..2] an, all active low (common anode,
// the demo's active-low enables); the examples' seg, dp and an then on its pins (an<3> on a header pin, 3 digits)
test('#3741 the Elbert V2: seg a..g, dp and an (3 digits) on Numato\'s pins, active low, the examples\' display on them', async () => {
  const elbert = BOARDS.find(b => b.id === 'elbert-v2'), r = Object.fromEntries(elbert.resources.map(x => [x.name, x]));
  assert.deepEqual(r.seg.pins, ['P117', 'P116', 'P115', 'P113', 'P112', 'P111', 'P110']);
  assert.deepEqual(r.dp.pins, ['P114']);
  assert.deepEqual(r.an.pins, ['P120', 'P121', 'P124']);
  assert.equal(r.seg_en, undefined);
  for (const n of ['seg', 'dp', 'an', 'dip', 'btn']) assert.equal(r[n].extra?.activeLow, true, n);
  const { EXAMPLES, exampleUcf } = await import('./examples-lib.mjs');
  for (const name of EXAMPLES) {
    const { text, unmatched } = exampleUcf(name, { board: 'elbert-v2' });
    assert.deepEqual(unmatched, [], name);
    // (on its headers only what the board has no pin for: an<3>, and uart's rx and tx, the board has no serial port)
    const onHeaders = [...text.matchAll(/^NET "([^"]+)".*# no pin on the board/gm)].map(m => m[1]);
    assert.deepEqual(onHeaders, { gates: [], vga: [], uart: ['rx', 'tx', 'an<3>'] }[name] || ['an<3>'], name);
  }
  const { text } = exampleUcf('clock', { board: 'elbert-v2' });
  const locs = Object.fromEntries([...text.matchAll(/^NET "([^"]+)"\s+LOC = "([^"]+)"/gm)].map(m => [m[1], m[2]]));
  assert.deepEqual(['seg<0>', 'seg<1>', 'seg<2>', 'seg<3>', 'seg<4>', 'seg<5>', 'seg<6>', 'dp', 'an<0>', 'an<1>', 'an<2>'].map(n => locs[n]),
    ['P117', 'P116', 'P115', 'P113', 'P112', 'P111', 'P110', 'P114', 'P120', 'P121', 'P124']);
  assert.match(text, /^NET "an<3>"\s+LOC = "P31" ;  # no pin on the board: on the header pin io_p1<0>$/m);
  assert.deepEqual(['clk', 'sw<0>', 'sw<1>', 'btn<0>', 'btn<3>'].map(n => locs[n]), ['P129', 'P70', 'P69', 'P80', 'P77']);
  assert.match(text, /TIMESPEC "TS_clk" = PERIOD "clk" 83\.333 ns HIGH 50% ;/);
});
