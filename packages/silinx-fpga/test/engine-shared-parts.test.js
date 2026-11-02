// The parts of Silinx's placer and router that other modules use too (#2137: out of packages/silinx-fpga/src/fpga/place.js and
// route.js, which go with the Spartan-3E's engine): the device's sites and its I/O banks (device-sites.js), the placers'
// error, random numbers and crossing correction (place-common.js, the Spartan-6's placer's too), a routed design's
// check (route-check.js, the nextpnr flow's and the Spartan-6's). Mounted alone on the test devices; place.js and route.js
// still export them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXdl, parseXdlrc } from '../src/xdl.js';
import { packDevice, loadDevice } from '../src/fpga/device.js';
import { deviceSites, bankOfPad, vccoOfStandard } from '../src/fpga/device-sites.js';
import { PlaceError, rng, crossing } from '../src/fpga/place-common.js';
import { checkRouting, netEndpoints } from '../src/fpga/route-check.js';
import * as place from '../src/fpga/place.js';
import * as route from '../src/fpga/route.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fpga');
const xdlrc = fs.readFileSync(path.join(FIX, 'place-device.xdlrc'), 'utf8');

test('#2137 the device\'s sites: its slices, bonded pads and clock buffers, as its report lists them; the I/O banks and their voltages', () => {
  const dev = deviceSites(parseXdlrc(xdlrc));
  // the report's sites: 70 SLICEL and 70 SLICEM, 86 bonded IOBs and 2 bonded IBUFs, 8 BUFGMUXes
  const count = re => (xdlrc.match(re) || []).length;
  assert.equal(dev.slices.size, count(/\(primitive_site SLICE_X\d+Y\d+ SLICE[LM] /g));
  assert.equal(dev.slices.size, 140);
  assert.equal(dev.pads.size, count(/\(primitive_site \S+ (IOB|IBUF) bonded/g));
  assert.equal(dev.bufgmux.length, 8);
  assert.equal(dev.pads.size, 88);
  assert.equal([...dev.pads.values()].filter(p => p.inputOnly).length, 2);
  // a slice's position: its column, half a tile apart in a CLB, as its name says
  const s = dev.slices.get('1,0');
  assert.deepEqual([s.name, s.x, s.y], ['SLICE_X1Y0', 1, 0]);
  assert.equal(s.px - dev.slices.get('0,0').px, 0.5);
  // the buffers a flow can use: allowBufg's
  assert.equal(deviceSites(parseXdlrc(xdlrc), { allowBufg: (tile, site) => site.endsWith('Y0') }).bufgmux.every(b => b.name.endsWith('Y0')), true);
  // the banks, by the I/O tile's side: top 0, right 1, bottom 2, left 3; an unknown tile -1
  assert.deepEqual(['TIOIS', 'RIOIS_PCI', 'BIBUFS', 'LIOIS_CLK_PCI', 'CLB'].map(tile => bankOfPad({ tile })), [0, 1, 2, 3, -1]);
  assert.deepEqual(['LVCMOS33', 'lvcmos25', 'SSTL18_I', 'LVCMOS15', 'LVCMOS12', 'NOPE', undefined].map(vccoOfStandard), [3.3, 2.5, 1.8, 1.5, 1.2, null, null]);
});

test('#2137 the placers\' common parts: the random numbers repeat from a seed, the crossing correction, the error\'s hint', () => {
  const a = rng(7), b = rng(7), c = rng(8);
  const xs = Array.from({ length: 5 }, a);
  assert.deepEqual(Array.from({ length: 5 }, b), xs);
  assert.notDeepEqual(Array.from({ length: 5 }, c), xs);
  assert.ok(xs.every(x => x >= 0 && x < 1));
  assert.deepEqual(Array.from({ length: 2 }, rng(0)), Array.from({ length: 2 }, rng(1)), 'seed 0 is seed 1');
  // VPR's table up to 50 pins, then its straight line
  assert.deepEqual([1, 3, 4, 9, 10, 50].map(crossing), [1, 1, 1.0828, 1.3991, 1.4493, 2.7933]);
  assert.equal(crossing(60), 2.7933 + 0.2616);
  const e = new PlaceError('too many slices', 'a larger device');
  assert.deepEqual([e instanceof Error, e.message, e.hint], [true, 'too many slices', 'a larger device']);
  assert.equal('hint' in new PlaceError('x'), false);
});

const device = loadDevice(packDevice(fs.readFileSync(path.join(FIX, 'route-device.xdlrc'), 'utf8')));
const inst = (name, tile, site) => `inst "${name}" "SLICEL",placed ${tile} ${site}  ,\n  cfg " A::B "\n  ;\n`;
const INSTS = inst('a0', 'CLB_X1Y0', 'SLICE_X0Y0') + inst('b0', 'CLB_X2Y0', 'SLICE_X1Y0') + inst('b1', 'CLB_X2Y0', 'SLICE_X1Y1');
// the router's routing of a0.X to b0.F1 and b1.F1 on the test device
const PIPS = [['CLB_X1Y0', 'X0', 'OMUX0'], ['CLB_X1Y0', 'OMUX0', 'E2BEG0'], ['CLB_X2Y0', 'E2END0', 'F1_B_PINWIRE0'], ['CLB_X2Y0', 'E2END0', 'F1_B_PINWIRE1']];
const routed = (pips, extra = '') => parseXdl(`design "t" xc3s50etq144-4 v3.2 ,\n  cfg "";\n${INSTS}net "n" , \n  outpin "a0" X ,\n  inpin "b0" F1 ,\n  inpin "b1" F1 ,\n${
  pips.map(([t, f, to]) => `  pip ${t} ${f} -> ${to} ,\n`).join('')}  ;\n${extra}`);

test('#2137 a routed design\'s check: a whole tree passes; a missing PIP, a sink not reached, an antenna and a shared node are said', () => {
  assert.deepEqual(checkRouting(routed(PIPS), device), { ok: true, nets: 1, problems: [] });
  let r = checkRouting(routed([...PIPS.slice(0, 3), ['CLB_X2Y0', 'NOWIRE', 'F1_B_PINWIRE1']]), device);
  assert.deepEqual(r.problems, ['net n: no PIP CLB_X2Y0 NOWIRE -> F1_B_PINWIRE1', 'net n: sink b1.F1 not reached']);
  r = checkRouting(routed(PIPS.slice(0, 2)), device);
  assert.equal(r.ok, false);
  assert.ok(r.problems.includes('net n: sink b0.F1 not reached') && r.problems.some(p => /leads nowhere \(antenna\)/.test(p)), r.problems.join('; '));
  // a second net on the first one's wires
  const other = `net "m" , \n  outpin "a0" Y ,\n  inpin "b0" F2 ,\n${PIPS.slice(0, 2).map(([t, f, to]) => `  pip ${t} ${f} -> ${to} ,\n`).join('')}  ;\n`;
  r = checkRouting(routed(PIPS, other), device);
  assert.ok(r.problems.some(p => /^node \S+ used by n and m$/.test(p)), r.problems.join('; '));
  // the nets' endpoints: the source and both sinks, an instance not placed said
  const ends = netEndpoints(routed(PIPS), device);
  assert.deepEqual([ends.nets[0].sources.length, ends.nets[0].sinks.map(s => s.pin.inst), ends.errors], [1, ['b0', 'b1'], []]);
  const unplaced = parseXdl(`design "t" xc3s50etq144-4 v3.2 ,\n  cfg "";\ninst "u" "SLICEL",unplaced ,\n  cfg " A::B "\n  ;\n${INSTS}net "k" , \n  outpin "u" X ,\n  inpin "b0" F1 ,\n  ;\n`);
  assert.deepEqual(netEndpoints(unplaced, device).errors, ['net k: outpin u.X: instance not placed or unknown']);
});

test('#2137 place.js and route.js still export what moved, the same functions', () => {
  assert.deepEqual([place.deviceSites, place.bankOfPad, place.vccoOfStandard], [deviceSites, bankOfPad, vccoOfStandard]);
  assert.deepEqual([place.PlaceError, place.rng, place.crossing], [PlaceError, rng, crossing]);
  assert.deepEqual([route.checkRouting, route.netEndpoints], [checkRouting, netEndpoints]);
});
