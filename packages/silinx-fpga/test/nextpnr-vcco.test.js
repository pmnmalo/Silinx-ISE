// The nextpnr engine's I/O with no pad of its VCCO (#2816, open-flow-nextpnr.js padVccoError): nextpnr's error (of its
// first such I/O, by its cell's name) said as Silinx's placer said it (#128): every I/O with no LOC of that VCCO by its
// port bit, the banks with free pads (their VCCO and I/Os), the I/O standard to give them; a bank with no LOC'd I/O; the
// lists cut short; nextpnr's other errors left as they are. (blinky on the Basys2, its whole flow: test/open-flow-core.test.js.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { padVccoError, nextpnrNetlist } from '../src/open-flow-nextpnr.js';
import { loadDeviceCache, findDeviceGraph } from '../src/fpga/device-node.js';
import { deviceSites, bankOfPad } from '../src/fpga/device-sites.js';

const device = loadDeviceCache(findDeviceGraph('xc3s250ecp132-4'));
// each bank's pads, by name
const byBank = [0, 1, 2, 3].map(b => [...deviceSites(device).pads.values()].filter(p => bankOfPad(p) === b).map(p => p.name).sort());
const LINE = 'ERROR: IO $iopadmap$top.led_4: no free pad in a bank of VCCO 2.5 V (its I/O standard LVCMOS25): the banks with free pads have I/Os of another VCCO. Give it the I/O standard of a bank in the constraints (UCF), or a LOC.';

test('every bank holding LVCMOS33 I/Os: the LVCMOS25 ones with no LOC by their port bits, each bank\'s VCCO and I/Os, the standard to give them', () => {
  const ios = [
    { name: 'clk', loc: byBank[0][0], iostandard: 'LVCMOS33' }, { name: 'a<0>', loc: byBank[1][0], iostandard: 'LVCMOS33' }, { name: 'a<1>', loc: byBank[1][1], iostandard: 'LVCMOS33' },
    { name: 'a<2>', loc: byBank[1][2], iostandard: 'LVCMOS33' }, { name: 'a<3>', loc: byBank[1][3], iostandard: 'LVCMOS33' }, { name: 'b', loc: byBank[2][0], iostandard: 'LVTTL' },
    { name: 'c', loc: byBank[2][1], iostandard: 'lvcmos33' }, { name: 'd', loc: byBank[3][0], iostandard: 'LVCMOS33' },
  ];
  const free = [...Array(10)].map((_, i) => ({ name: `led<${i}>` })).concat([{ name: 'x', iostandard: 'LVCMOS33' }]);
  const r = padVccoError(['Info: placing', LINE, 'ERROR: Loading design failed.'], ios, free, device);
  assert.deepEqual(r, {
    message: 'placement failed: no pad for 10 I/O(s) of LVCMOS25 (VCCO 2.5 V): led<0>, led<1>, led<2>, led<3>, led<4>, led<5>, led<6>, led<7> and 2 more: the banks with free pads need another VCCO: '
      + 'bank 0 VCCO 3.3 V (LVCMOS33: clk), bank 1 VCCO 3.3 V (LVCMOS33: a<0>, a<1>, a<2> and 1 more), bank 2 VCCO 3.3 V (LVTTL: b; LVCMOS33: c), bank 3 VCCO 3.3 V (LVCMOS33: d)',
    hint: 'Give them the I/O standard of a bank in the constraints (UCF), e.g. NET "led<0>" IOSTANDARD = LVCMOS33; (or LOC them on pads of a bank of their own).',
  });
});

test('a bank with no LOC\'d I/O (nextpnr gave it the VCCO of the I/Os it placed there); a full bank left out; a standard of 1.8 V', () => {
  const ios = byBank[0].map((loc, i) => ({ name: `f<${i}>`, loc, iostandard: 'LVCMOS33' })).concat([{ name: 'g', loc: byBank[1][0], iostandard: 'LVCMOS25' }]);
  const r = padVccoError(['ERROR: IO $iopadmap$top.q: no free pad in a bank of VCCO 1.8 V (its I/O standard LVCMOS18): x'], ios, [{ name: 'q', iostandard: 'LVCMOS18' }, { name: 'p' }], device);
  assert.deepEqual(r, {
    message: 'placement failed: no pad for 1 I/O(s) of LVCMOS18 (VCCO 1.8 V): q: the banks with free pads need another VCCO: bank 1 VCCO 2.5 V (LVCMOS25: g), '
      + 'bank 2 (the VCCO of the I/Os with no LOC nextpnr placed there), bank 3 (the VCCO of the I/Os with no LOC nextpnr placed there)',
    hint: 'Give them the I/O standard of a bank in the constraints (UCF), e.g. NET "q" IOSTANDARD = LVCMOS25; (or LOC them on pads of a bank of their own).',
  });
});

test('nextpnr\'s other errors, or no I/O with no LOC of that VCCO: null (its own message kept)', () => {
  assert.equal(padVccoError(['ERROR: Unable to place cell \'x\''], [], [{ name: 'a' }], device), null);
  assert.equal(padVccoError([LINE], [], [{ name: 'a', iostandard: 'LVCMOS33' }], device), null);
});

test('nextpnrNetlist: the port bits with no LOC (free), each with its I/O standard if any', () => {
  const json = { modules: { top: { attributes: { top: 1 }, ports: { a: { direction: 'input', bits: [2] }, y: { direction: 'output', bits: [3, 4] } },
    cells: { ib: { type: 'IBUF', connections: { I: [2], O: [5] }, port_directions: { I: 'input', O: 'output' } },
      l: { type: 'LUT1', parameters: { INIT: '10' }, connections: { I0: [5], O: [6] }, port_directions: { I0: 'input', O: 'output' } },
      o0: { type: 'OBUF', connections: { I: [6], O: [3] }, port_directions: { I: 'input', O: 'output' } },
      o1: { type: 'OBUF', connections: { I: [6], O: [4] }, port_directions: { I: 'input', O: 'output' } } },
    netnames: { a: { bits: [2] }, y: { bits: [3, 4] } } } } };
  const r = nextpnrNetlist(JSON.stringify(json), 'top', `NET "a" LOC = "${byBank[0][0]}" | IOSTANDARD = LVCMOS33;\nNET "y<1>" IOSTANDARD = LVCMOS18;\n`, device);
  assert.deepEqual([r.ios, r.free], [[{ name: 'a', loc: byBank[0][0], iostandard: 'LVCMOS33' }], [{ name: 'y<0>', iostandard: undefined }, { name: 'y<1>', iostandard: 'LVCMOS18' }]]);
});
