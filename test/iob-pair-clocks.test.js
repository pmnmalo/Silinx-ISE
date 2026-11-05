// #749: the two IOBs of a differential pair (DIFFM / DIFFS) share each clock wire of their I/O tile (IOIS_CLK0 ->
// ICLK10 / ICLK11, IOIS_CLK1 -> OTCLK10 / OTCLK11), the tile's third IOB has its own, as the device graphs say. (The
// registers of one kind on different clocks in such a pair, the second flip-flops Silinx's placer used, went with it,
// #2137; nextpnr's: #2766.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceSites } from '../packages/silinx-fpga/src/fpga/device-sites.js';
import { loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';

const PARTS = ['xc3s100ecp132-4', 'xc3s250ecp132-4', 'xc3s500efg320-4', 'xc3s1200efg320-4'];
const devs = new Map();
const dev = part => devs.get(part) || devs.set(part, { graph: loadDeviceCache(part) }).get(part);

test('the pads of a differential pair: DIFFM / DIFFS share their tile\'s clock wires; the tile\'s third IOB has its own (every device)', () => {
  for (const part of PARTS) {
    const g = dev(part).graph, sites = deviceSites(g);
    let pairs = 0;
    for (const p of sites.pads.values()) {
      const w = ['ICLK1', 'ICLK2', 'OTCLK1', 'OTCLK2'].map(pin => g.sitePin(p.name, pin).wire);
      assert.deepEqual(w, ['ICLK1', 'ICLK2', 'OTCLK1', 'OTCLK2'].map(x => `${x}${p.pair ? (p.master ? 0 : 1) : 2}`), `${part} ${p.name}`);
      assert.equal(p.pair, /^DIFF[MS]/.test(p.type) ? p.tile : null);
      if (p.master) pairs++;
    }
    assert.ok(pairs > 30, `${part}: ${pairs}`);
  }
});
