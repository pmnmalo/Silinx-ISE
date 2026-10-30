// The device descriptions of the Spartan-6 boards' parts (#723: packages/silinx-fpga/devices/xc6slx16csg324-3.json.gz,
// xc6slx45csg324-3.json.gz, Silinx's packed graphs computed from ISE's device reports on night 1): they load, their
// tiles and PIPs are the reports' (packages/silinx-fpga/research/s6/measured/night1.json), their sites by type the reports' and DS160's,
// every pin of the Nexys3 and the Atlys a bonded pad, a switch from a slice's COUT to the CIN of the slice above.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findDeviceGraph, shippedDevicePath, loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';
import { resolveBoard } from '../server/devices.js';

const night1 = JSON.parse(fs.readFileSync(new URL('../packages/silinx-fpga/research/s6/measured/night1.json', import.meta.url), 'utf8'));
const PARTS = [
  // part, board, DS160's slices and the package's user I/O
  { part: 'xc6slx16csg324-3', board: 'nexys3', slices: 2278, io: 232 },
  { part: 'xc6slx45csg324-3', board: 'atlys', slices: 6822, io: 218 },
];

for (const { part, board, slices, io } of PARTS) {
  test(`${part} (${board}): shipped, its tiles, PIPs and sites the device report's, DS160's slices and user I/O`, () => {
    assert.equal(findDeviceGraph(part), shippedDevicePath(part));
    const d = loadDeviceCache(part);
    const report = night1.parts[part.replace(/(\d)(csg)/, '$1-$2')].report;
    assert.equal(d.tileCount, report.summary.tiles);
    assert.equal(d.sites().length, report.summary.sites);
    // (every site type's count as the report has it)
    const byType = {};
    for (const s of d.sites()) byType[s.type] = (byType[s.type] || 0) + 1;
    assert.deepEqual(byType, report.sites);
    assert.equal(byType.SLICEX + byType.SLICEL + byType.SLICEM, slices);
    assert.equal(byType.SLICEX, byType.SLICEL + byType.SLICEM, 'half the slices are SLICEX');
    assert.equal(d.sites().filter(s => /^IOB/.test(s.type) && s.bonded === 1).length, io);
    let pips = 0;
    for (let k = 0; k < d.tileCount; k++) pips += d.templates[d.tileTemplate[k]].flags.length;
    assert.equal(pips, report.summary.numpips);
  });

  test(`${part}: every pin of the ${board} a bonded pad; a switch from a SLICEL's COUT to the CIN of the slice above`, () => {
    const d = loadDeviceCache(part);
    const pins = resolveBoard(board).resources.flatMap(r => r.pins);
    assert.ok(pins.length > 50);
    assert.deepEqual(pins.filter(n => { const s = d.site(n); return !s || !/^IOB/.test(s.type) || s.bonded !== 1; }), []);
    let chains = 0;
    for (const s of d.sites('SLICEL')) {
      const [, x, y] = /^SLICE_X(\d+)Y(\d+)$/.exec(s.name);
      const up = d.site(`SLICE_X${x}Y${+y + 1}`);
      if (!up || !/^SLICE[LM]$/.test(up.type)) continue;
      // (the carry goes up by a switch of the slice's own tile: XL_COUT -> XL_COUT_N, the CIN of the slice above)
      const cin = d.sitePinNode(up.name, 'CIN');
      let found = false;
      d.forEachPip(d.sitePinNode(s.name, 'COUT'), to => { if (to === cin) found = true; });
      assert.ok(found, s.name);
      chains++;
    }
    assert.ok(chains > 500, `${chains}`);
  });
}
