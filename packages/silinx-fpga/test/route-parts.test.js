// The parts of the router (#405: out of routeDesign in packages/silinx-fpga/src/fpga/route.js): the power nets (route-power.js) mounted
// alone on the router's small device (test/fixtures/fpga/route-device.xdlrc): an ordinary net kept, a VCC net with no
// source tied to one made-up source per sink tile, a net of no kind with no source said; and through routeDesign with
// timing on (the connections' delays, route-delays.js; the polish, route-polish.js; the routed design written,
// route-output.js): one tree of PIPs, a period, the check passed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packDevice, loadDevice } from '../src/fpga/device.js';
import { routeDesign, checkRouting, netEndpoints } from '../src/fpga/route.js';
import { mountPowerNets } from '../src/fpga/route-power.js';
import { mountConnDelays } from '../src/fpga/route-delays.js';
import { mountPolish } from '../src/fpga/route-polish.js';
import { mountRoutedDesign } from '../src/fpga/route-output.js';
import { parseXdl } from '../src/xdl.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fpga');
const device = loadDevice(packDevice(fs.readFileSync(path.join(FIX, 'route-device.xdlrc'), 'utf8')));
const inst = (name, type, tile, site) => `inst "${name}" "${type}",placed ${tile} ${site}  ,\n  cfg " A::B "\n  ;\n`;
const net = (name, type, outpins, inpins) => `net "${name}" ${type || ''}, \n${outpins.map(([i, p]) => `  outpin "${i}" ${p} ,\n`).join('')}${inpins.map(([i, p]) => `  inpin "${i}" ${p} ,\n`).join('')}  ;\n`;
const INSTS = inst('a0', 'SLICEL', 'CLB_X1Y0', 'SLICE_X0Y0') + inst('b0', 'SLICEL', 'CLB_X2Y0', 'SLICE_X1Y0') + inst('b1', 'SLICEL', 'CLB_X2Y0', 'SLICE_X1Y1');
const design = nets => parseXdl(`design "t" xc3s50etq144-4 v3.2 ,\n  cfg "";\n${INSTS}${nets}`);

test('#405 router parts: the mounts are the modules\'', () => {
  for (const f of [mountPowerNets, mountConnDelays, mountPolish, mountRoutedDesign]) assert.equal(typeof f, 'function');
});

test('#405 router parts, the power nets: an ordinary net kept, a VCC with no source tied per sink tile, a net with no source said', () => {
  const d = design(net('n', '', [['a0', 'X']], [['b0', 'F1']]) + net('pwr', 'vcc', [], [['a0', 'F2'], ['b1', 'F2']]) + net('w', '', [], [['b1', 'F1']]));
  const { nets: all, errors } = netEndpoints(d, device);
  const p = mountPowerNets({ design: d, device, opts: {}, all, allowPip: null, errors });
  assert.deepEqual(p.work.map(w => `${w.name}${w.synthetic ? ' (made-up source)' : ''}`), ['n', 'pwr_0 (made-up source)', 'pwr_1 (made-up source)']);
  assert.deepEqual([...p.tied].map(n => n.name), ['pwr']);
  assert.deepEqual(errors, ['net w: no source']);
});

test('#405 router parts, timing on: delays, polish, the routed design: one tree, a period, the check passed', () => {
  const r = routeDesign(design(net('n', '', [['a0', 'X']], [['b0', 'F1'], ['b1', 'F1']])), device, { timing: true });
  assert.deepEqual([r.routed, r.failed, r.overused, r.pips], [1, [], 0, 4]);
  assert.equal(typeof r.period, 'number');
  assert.ok(checkRouting(r.design, device).ok);
});
