// The device description shipped with Silinx (packages/silinx-fpga/devices/) and the whole open flow on it:
// blinky (examples/blinky, Basys2-250) synthesized, placed and routed by nextpnr (#2756) and written as a .bit
// with no Xilinx tool (packages/silinx-fpga/research/s3e-route/open-flow.mjs). That the .bit equals ISE's needs ISE:
// npm run check:open-flow (see README, For developers).
// The rest of the open flow on the Spartan-3E, in files of their own run beside this one (#3124):
// test/open-flow-features.test.js, open-flow-io.test.js, open-flow-clocks.test.js; their helpers in open-flow-lib.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { ROOT, tmp, openFlow, BLINKY_WARNINGS } from './open-flow-lib.mjs';

const { findDeviceGraph, shippedDevicePath, deviceCachePath, loadDeviceCache } = await import('../packages/silinx-fpga/src/fpga/device-node.js');

test('the routing graph of the XC3S250E-CP132 ships with Silinx; the user\'s own one comes first; any speed grade', () => {
  const shipped = shippedDevicePath('xc3s250ecp132-4');
  assert.ok(fs.existsSync(shipped));
  assert.equal(findDeviceGraph('xc3s250ecp132-4'), shipped);
  assert.equal(findDeviceGraph('xc3s250ecp132-5'), shipped);
  assert.equal(findDeviceGraph('xc3s1600efg320-4'), null);
  assert.throws(() => loadDeviceCache('xc3s1600efg320-4'), /no routing graph of xc3s1600efg320-4: build it from your ISE's device report/);
  const dev = loadDeviceCache('xc3s250ecp132-4');
  assert.equal(dev.part.replace(/-\d+$/, ''), 'xc3s250ecp132');
  assert.ok(dev.nodeCount > 100000);
  // a graph the user built (from their own ISE) takes precedence
  fs.mkdirSync(path.dirname(deviceCachePath('xc3s250ecp132-4')), { recursive: true });
  fs.writeFileSync(deviceCachePath('xc3s250ecp132-4'), zlib.gzipSync('{}'));
  assert.equal(findDeviceGraph('xc3s250ecp132-4'), deviceCachePath('xc3s250ecp132-4'));
  fs.rmSync(deviceCachePath('xc3s250ecp132-4'));
});

test('every shipped device description loads and has the datasheet\'s slices and user I/O pins', async () => {
  const { deviceSites } = await import('../packages/silinx-fpga/src/fpga/device-sites.js');
  // DS312 (Spartan-3E family data sheet): CLB slices; user I/O of the package
  const want = { 'xc3s100ecp132-4': [960, 83], 'xc3s250ecp132-4': [2448, 92], 'xc3s500efg320-4': [4656, 232], 'xc3s1200efg320-4': [8672, 250] };
  for (const [part, [slices, pads]] of Object.entries(want)) {
    assert.equal(findDeviceGraph(part), shippedDevicePath(part), part);
    const s = deviceSites(loadDeviceCache(part));
    assert.deepEqual([s.slices.size, s.pads.size], [slices, pads], part);
  }
});

test('the open flow on the shipped graph: blinky from VHDL to a complete bitstream, no Xilinx tool', { timeout: 300000 }, async () => {
  const out = path.join(tmp, 'blinky');
  const r = openFlow(path.join(ROOT, 'examples/blinky'), out, ['--quality', path.join(out, 'quality.json')]);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  // --quality (#352): the circuit's size and speed as the design corpus records them, nextpnr's design summary's and the STA's
  const q = JSON.parse(fs.readFileSync(path.join(out, 'quality.json'), 'utf8'));
  assert.deepEqual(Object.keys(q), ['part', 'slices', 'luts', 'ffs', 'period']);
  assert.equal(q.part, 'xc3s250ecp132-4');
  assert.equal(q.slices, +/^place and route \(nextpnr: (\d+) slices, \d+ PIPs\)/m.exec(r.stdout)[1]);
  assert.ok(q.luts > 0 && q.ffs > 0 && q.luts <= 2 * q.slices && q.ffs <= 2 * q.slices, JSON.stringify(q));
  assert.equal(q.period.toFixed(3), /timing: clock \S+: minimum period ([\d.]+) ns/.exec(r.stdout)[1]);
  // no warnings (front end, synthesis, nextpnr: each printed as "  Warning: …" / "  WARNING: …")
  assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, /warning/i);
  assert.match(r.stdout, /timing: constraint PERIOD 20 ns on clk: met/);
  assert.deepEqual(r.warnings, BLINKY_WARNINGS);
  const bit = fs.readFileSync(path.join(out, 'top.bit'));
  assert.ok(bit.length > 160000);
  assert.ok(bit.includes(Buffer.from([0xaa, 0x99, 0x55, 0x66])), 'the sync word');
  for (const f of ['top.json', 'routed.xdl', 'timing.txt']) assert.ok(fs.existsSync(path.join(out, f)), f);
  assert.ok(!fs.existsSync(path.join(out, 'placed.xdl')), 'nextpnr places and routes in one step: no placed design (#2756)');
});

// #2756: the options of Silinx's own placer and router went with it, nextpnr placing and routing: refused, by name
test('the open flow refuses the options of Silinx\'s own placer and router (#2756)', () => {
  const r = openFlow(path.join(ROOT, 'examples/blinky'), path.join(tmp, 'gone'), ['--tries', '2', '--no-replicate']);
  assert.equal(r.status, 2);
  assert.equal(r.stderr.trim(), 'open-flow.mjs: --tries, --no-replicate: an option of Silinx\'s own placer and router, which nextpnr replaced (#2137)');
  assert.ok(!fs.existsSync(path.join(tmp, 'gone')));
});

// #2502: --chipdb dir, nextpnr's chip database from dir (one built from other device descriptions, the measured ones): the
// package's own database given so routes blinky as the package's does; a folder without the die's database refused, named
test('the open flow with --chipdb: the given chip database, the same route as the package\'s; a missing one said (#2502)', { timeout: 300000 }, () => {
  const dir = path.join(tmp, 'chipdb');
  fs.mkdirSync(dir, { recursive: true });
  const pkg = path.join(ROOT, 'node_modules/@silinx/nextpnr-himbaechel-spartan3e/chipdb/chipdb-xc3s250e.bin.gz');
  fs.writeFileSync(path.join(dir, 'chipdb-xc3s250e.bin'), zlib.gunzipSync(fs.readFileSync(pkg)));
  const out = path.join(tmp, 'blinky-chipdb');
  const r = openFlow(path.join(ROOT, 'examples/blinky'), out, ['--chipdb', dir]);
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /top\.bit: complete \(every feature in the bit database\)/);
  assert.deepEqual(r.warnings, BLINKY_WARNINGS);
  assert.equal(fs.readFileSync(path.join(out, 'routed.xdl'), 'utf8'), fs.readFileSync(path.join(tmp, 'blinky', 'routed.xdl'), 'utf8'));
  const none = path.join(tmp, 'no-chipdb');
  fs.mkdirSync(none, { recursive: true });
  const m = openFlow(path.join(ROOT, 'examples/blinky'), path.join(tmp, 'blinky-none'), ['--chipdb', none]);
  assert.equal(m.status, 1);
  assert.match(`${m.stdout}\n${m.stderr}`, new RegExp(`--chipdb: no ${path.join(none, 'chipdb-xc3s250e.bin').replace(/[.\\/]/g, '\\$&')}`));
});
