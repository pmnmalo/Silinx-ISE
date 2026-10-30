// packages/silinx-fpga/research/nextpnr-s3e (#1954): the Spartan-3E through nextpnr-himbaechel. nextpnr's routed design of a 24-bit counter
// (packages/silinx-fpga/research/nextpnr-s3e/blink.v, seed 3: the result ISE's DRC passed, its .bit byte-identical to ISE's and run on a
// Basys2) converted to XDL and checked against the device graph, the bit database and the netlist; the PIPs and the
// delays the chip database takes from Silinx.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import zlib from 'node:zlib';
import { parseXdl, writeXdl } from '../src/xdl.js';
import { loadDeviceCache } from '../src/fpga/device-node.js';
import { loadDb } from '../src/fpga/bitdb-node.js';
import { bitgen } from '../src/fpga/bitgen.js';
import { checkRouting } from '../src/fpga/route.js';
import { WIRE } from '../src/fpga/timing.js';
import { lutPins, nextpnrToXdl, simCheck, timingExport, unknownPips, xdlSize } from '../research/nextpnr-s3e/lib.mjs';

const PART = 'xc3s250ecp132-4';
const routed = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/nextpnr-s3e/blink-routed.json.gz', import.meta.url))));
const device = loadDeviceCache(PART);
const design = nextpnrToXdl(routed(), device, PART);
const inst = name => design.insts.find(i => i.name === name);
const cfg = (i, attr) => i.cfg.find(c => c.attr === attr);

test('nextpnrToXdl: one instance per used site, as ISE\'s map writes them', () => {
  assert.deepEqual(xdlSize(design), { slices: 19, luts: 37, ffs: 24 });
  // logic on a SLICEM site is a SLICEL instance (as a SLICEM, ISE's DRC finds its SR pin "partially connected")
  const slices = design.insts.filter(i => /^SLICE/.test(i.type));
  assert.ok(slices.some(i => device.site(i.site).type === 'SLICEM'));
  assert.ok(slices.every(i => i.type === 'SLICEL'));
  // an input alone is an IBUF instance, on an IOB site too (as an IOB its output drives nothing)
  assert.equal(inst('rst').type, 'IBUF');
  assert.equal(device.site(inst('rst').site).type, 'IOB');
  assert.equal(inst('clk').type, 'IBUF');
  assert.equal(inst('led7').type, 'IOB');
  assert.equal(inst('led7').site, 'G1');
  assert.equal(cfg(inst('led7'), 'OUTBUF').name, 'led7_OBUF');
  // the flip-flops: reset synchronous and low (FDRE), from their LUTs
  const s = slices.find(i => cfg(i, 'FFX') && cfg(i, 'SRINV'));
  assert.equal(cfg(s, 'FFX_SR_ATTR').value, 'SRLOW');
  assert.equal(cfg(s, 'SYNC_ATTR').value, 'SYNC');
  assert.equal(cfg(s, 'DXMUX').value, '1');
  assert.equal(cfg(s, 'FXMUX').value, 'F');
});

test('nextpnrToXdl: the BUFGMUX\'s select tied to VCC through its tile\'s VCC site', () => {
  const bufg = design.insts.find(i => i.type === 'BUFGMUX');
  const vcc = design.nets.find(n => n.type === 'vcc');
  assert.deepEqual(vcc.inpins, [{ inst: bufg.name, pin: 'S' }]);
  const dummy = inst(vcc.outpins[0].inst);
  assert.equal(dummy.type, 'VCC');
  assert.equal(dummy.tile, bufg.tile);
  assert.equal(vcc.pips.length, 1);
});

test('nextpnrToXdl: routed on the device graph, every feature in the bit database', () => {
  const r = checkRouting(design, device);
  assert.deepEqual(r.problems, []);
  assert.ok(r.ok);
  // written and read back unchanged
  const back = parseXdl(writeXdl(design));
  assert.equal(back.insts.length, design.insts.length);
  assert.equal(back.nets.reduce((n, x) => n + x.pips.length, 0), design.nets.reduce((n, x) => n + x.pips.length, 0));
  const { bytes, unknown } = bitgen(back, loadDb(PART), { name: 'top.ncd', crc: true, startupClk: 'JtagClk', part: '3s250ecp132' });
  assert.deepEqual(unknown, []);
  assert.equal(bytes.length, 169286);
});

test('nextpnrToXdl: the LUT equations on the pins the router chose (permuted inputs)', () => {
  // at least one LUT's inputs are not on F1..F4 / G1..G4 in order: its equation names the pins chosen
  const json = routed();
  const mod = Object.values(json.modules)[0];
  const permuted = Object.values(mod.netnames).some(n => /S\d+_[FG]I0\/[FG][234]_/.test(n.attributes?.ROUTING || ''));
  assert.ok(permuted);
  // a LUT input moved to another net: its pin no longer carries it, and the converter says so
  const lut = Object.values(mod.cells).find(c => c.type === 'LUT4' && c.connections.I0 && c.connections.I1 && c.connections.I0[0] !== c.connections.I1[0]);
  lut.connections.I0 = lut.connections.I1;
  assert.throws(() => nextpnrToXdl(json, device, PART), /carries another net/);
});

test('lutPins: the inputs on their chosen pins, the unconnected ones on the pins left', () => {
  assert.deepEqual(lutPins([3, 1]), [3, 1, 2, 4]);
  assert.deepEqual(lutPins(undefined), [1, 2, 3, 4]);
  assert.deepEqual(lutPins([, , 4]), [1, 2, 4, 3]);
});

test('simCheck: the XDL implements the netlist, a wrong LUT equation is caught', () => {
  const json = routed();
  const r = simCheck(json, design, { cycles: 2000, starts: 300 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.flipFlops, 24);
  // under reset (rst = 1) the counter stays at 0 in both
  assert.equal(simCheck(json, design, { cycles: 100, inputs: { rst: 1 } }).ok, true);
  // one LUT input changed: the bit it feeds goes wrong when the low 16 bits first wrap (from the initial state at
  // cycle 65536; from random states at once)
  const text = writeXdl(design);
  const m = /D=\(A3\*\(A2\*A1\)\)/.exec(text);
  assert.ok(m);
  const wrong = parseXdl(text.slice(0, m.index) + 'D=(A3*(A2*A4))' + text.slice(m.index + m[0].length));
  const w = simCheck(json, wrong, { cycles: 0, starts: 300 });
  assert.equal(w.ok, false);
  assert.match(w.message, /^start \d+, cycle \d+: \S+ is [01] in the netlist, [01] in the XDL$/);
});

test('unknownPips: the PIPs Silinx\'s router is kept off, by tile', () => {
  const { pips, total, unknown } = unknownPips(device, loadDb(PART));
  assert.equal(total, 2108744);
  assert.equal(unknown, 28030);
  assert.equal(Object.keys(pips).length, 800);
  // the clock buffer's input nextpnr took before they were left out: its bits are not known
  const k = device.tile('CLKT_X13Y35');
  const i = device.findPip(k, 'CLKV_E2BEG4', 'CLKT_CLKDUB2');
  assert.ok(i >= 0);
  assert.ok(pips.CLKT_X13Y35.includes(i));
});

test('timingExport: each PIP the class of the node it drives, Silinx\'s delays', () => {
  const { timing, disagree } = timingExport(device);
  assert.equal(disagree, 407);
  for (const [t, cls] of Object.entries(timing.pipClass)) assert.equal(cls.length, device.templates[t].from.length);
  const k = device.tile('CLB_X11Y6'), t = device.tileTemplate[k];
  const cls = (from, to) => timing.pipClass[t][device.findPip(k, from, to)];
  assert.equal(Math.floor(cls('N2MID0', 'E2BEG0') / 5), WIRE.DOUBLE);
  assert.equal(Math.floor(cls('W2MID0', 'SR0') / 5), WIRE.PIN);
  // a LUT input pin: class and input (F3)
  assert.equal(cls('F3_B3', 'F3_B_PINWIRE3') % 5, 3);
  assert.equal(timing.slice.Tilo, 0.704);
  assert.deepEqual(timing.lutPin, [0.06, 0, -0.06, -0.05]);
});
