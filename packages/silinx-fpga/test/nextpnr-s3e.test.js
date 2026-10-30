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
import { SPEED_4 } from '../src/fpga/timing.js';
import { readYosysJson } from '../src/fpga/netlist.js';
import { pack } from '../src/fpga/pack.js';
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
  // (#2193: a block RAM's and a multiplier's delays, trce's: the same numbers as the model's)
  assert.deepEqual([timing.bram, timing.mult], [SPEED_4.bram, SPEED_4.mult]);
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

test('the scripts the README and the usage lines name exist, from the repository\'s root (#2120)', () => {
  const dir = new URL('../research/nextpnr-s3e/', import.meta.url), root = new URL('../../../', import.meta.url);
  const texts = fs.readdirSync(dir).filter(f => /\.(md|mjs)$/.test(f)).map(f => [f, fs.readFileSync(new URL(f, dir), 'utf8')]);
  const named = [];
  for (const [f, text] of texts) for (const m of text.matchAll(/^(?:\/\/\s+)?node (\S+\.mjs)\b/gm)) named.push([f, m[1]]);
  assert.ok(named.length >= 13);
  for (const [f, script] of named) assert.ok(fs.existsSync(new URL(script, root)), `${f} names ${script}, which does not exist`);
});

// nextpnr's routed design of the counter as Silinx's synthesis maps it: a carry chain of 24 stages (23 MUXCY, 24
// XORCY), constants (its carry in, the MUXCYs' DI), the micro-architecture's carry chains and constants (#2135)
const carryRouted = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/nextpnr-s3e/carry-routed.json.gz', import.meta.url))));
const carry = nextpnrToXdl(carryRouted(), device, PART);
const count = (design, re) => design.insts.reduce((n, i) => n + i.cfg.filter(c => re.test(`${c.attr}::${c.value}`)).length, 0);

test('#2135 nextpnrToXdl: a carry chain, slice by slice up its column, as Silinx\'s packer writes it', () => {
  assert.deepEqual(xdlSize(carry), { slices: 13, luts: 25, ffs: 24 });
  // its first slice takes the carry in through BX, the others through CIN; COUT goes on up but from the last
  assert.equal(count(carry, /^CYINIT::BX$/), 1);
  assert.equal(count(carry, /^CYINIT::CIN$/), 11);
  assert.equal(count(carry, /^COUTUSED::0$/), 11);
  // DI: constants (the chain's first 1, the others 0), with their GND / VCC cells
  assert.equal(count(carry, /^CY0F::1$/), 1);
  assert.equal(count(carry, /^CY0[FG]::0$/), 22);
  assert.equal(count(carry, /^C1VDD::$/), 1);
  assert.equal(count(carry, /^GND[FG]::$/), 22);
  assert.equal(count(carry, /^CYSEL[FG]::[FG]$/), 23);
  // the sums out through FXOR / GXOR, to the flip-flops
  assert.equal(count(carry, /^FXMUX::FXOR$/) + count(carry, /^GYMUX::GXOR$/), 24);
  // the slices of the chain stacked: each continuing slice right above the one before (COUT -> CIN in the graph)
  const r = checkRouting(carry, device);
  assert.deepEqual(r.problems, []);
  const { unknown } = bitgen(carry, loadDb(PART), { name: 'top.ncd', crc: true, startupClk: 'JtagClk', part: '3s250ecp132' });
  assert.deepEqual(unknown, []);
});

test('#2135 the carry chain\'s XDL implements its netlist; a wrong DI constant or carry in is caught', () => {
  const json = carryRouted();
  const r = simCheck(json, carry, { cycles: 2000, starts: 300 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.flipFlops, 24);
  // (nextpnr writes a string parameter with a trailing space, '0 ': the converter and the simulation read it trimmed)
  const cy0 = Object.values(Object.values(json.modules)[0].cells).filter(c => c.type === 'MUXCY').map(c => c.parameters.CY0);
  assert.ok(cy0.includes('0 ') && cy0.includes('1 '), cy0.join());
  // a constant DI turned over, a carry in taken from BX instead of CIN: the flip-flops' values differ
  const text = writeXdl(carry);
  for (const [from, to] of [['CY0F::1', 'CY0F::0'], ['CYINIT::CIN', 'CYINIT::BX']]) {
    const wrong = parseXdl(text.replace(from, to));
    assert.equal(simCheck(json, wrong, { cycles: 0, starts: 300 }).ok, false, `${from} -> ${to}`);
  }
});

// nextpnr's routed traffic example (Silinx's synthesis, seed 1): eight MUXF5s alone, two MUXF6s on two F5s each (#2135)
const trafficRouted = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/nextpnr-s3e/traffic-routed.json.gz', import.meta.url))));
const traffic = nextpnrToXdl(trafficRouted(), device, PART);

test('#2135 nextpnrToXdl: the F5 and F6 multiplexers, as Silinx\'s packer writes them', () => {
  assert.deepEqual(xdlSize(traffic), { slices: 70, luts: 138, ffs: 58 });
  assert.equal(count(traffic, /^F5MUX::$/), 12);
  assert.equal(count(traffic, /^F6MUX::$/), 2);
  // the F5s out to the F6s through the F5 pin (F5USED), the others' and the F6s' to X / Y and the flip-flops
  assert.equal(count(traffic, /^F5USED::0$/), 4);
  assert.equal(count(traffic, /^FXUSED::0$/), 0);
  assert.equal(count(traffic, /^FXMUX::F5$/), 8);
  assert.equal(count(traffic, /^GYMUX::FX$/), 2);
  // an F6's slice: its own F5 on FXINA, the F5 of the slice above on FXINB (the CLB's dedicated wires)
  for (const i of traffic.insts.filter(x => cfg(x, 'F6MUX'))) {
    const [, x, y] = /^SLICE_X(\d+)Y(\d+)$/.exec(i.site).map(Number);
    assert.equal(y % 2, 0, i.site);
    const into = pin => traffic.nets.find(n => n.inpins.some(p => p.inst === i.name && p.pin === pin));
    const from = pin => traffic.insts.find(k => k.name === into(pin).outpins[0].inst).site;
    assert.equal(from('FXINA'), i.site);
    assert.equal(from('FXINB'), `SLICE_X${x}Y${y + 1}`);
    assert.deepEqual(into('FXINA').outpins.map(p => p.pin), ['F5']);
    assert.ok(cfg(i, 'BYINV'));
  }
  const r = checkRouting(traffic, device);
  assert.deepEqual(r.problems, []);
  const { unknown } = bitgen(traffic, loadDb(PART), { name: 'top.ncd', crc: true, startupClk: 'JtagClk', part: '3s250ecp132' });
  assert.deepEqual(unknown, []);
});

test('#2135 the wide multiplexers\' XDL implements its netlist; an F5 or F6 output taken from its LUT instead is caught', () => {
  const json = trafficRouted();
  const r = simCheck(json, traffic, { cycles: 2000, starts: 300 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.flipFlops, 58);
  const text = writeXdl(traffic);
  for (const [from, to] of [['GYMUX::FX', 'GYMUX::G'], ['FXMUX::F5', 'FXMUX::F']]) {
    const wrong = parseXdl(text.replaceAll(from, to));   // (in every slice)
    assert.equal(simCheck(json, wrong, { cycles: 2000, starts: 300 }).ok, false, `${from} -> ${to}`);
  }
});

// nextpnr's routed design of research/nextpnr-s3e/iob_regs.v as Silinx's synthesis maps it, its constraints
// test/fixtures/nextpnr-engine/iob_regs.ucf: registers in the IOBs (input, output, output-enable: the UCF's IOB = TRUE), an
// IDDR2 and an ODDR2 on the clock and its inverse, the clock on a GCLK pin (#2135). ISE's DRC passed it (0 errors, 0
// warnings), its bitgen's .bit byte-identical to Silinx's.
const iobRouted = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/nextpnr-s3e/iob-routed.json.gz', import.meta.url))));
const iobs = nextpnrToXdl(iobRouted(), device, PART);
const cfgText = i => i.cfg.map(c => `${c.attr}:${c.name}:${c.value}`).join(' ');

test('#2192 nextpnrToXdl: the IOBs\' registers and DDR registers, each setting as Silinx\'s packer writes it, in its order', () => {
  // the reference: Silinx's own packer on the same netlist and constraints
  const engine = new URL('./fixtures/nextpnr-engine/', import.meta.url);
  const nl = readYosysJson(JSON.parse(fs.readFileSync(new URL('iob_regs.json', engine), 'utf8')));
  const p = pack(nl, { ucf: fs.readFileSync(new URL('iob_regs.ucf', engine), 'utf8'), part: PART });
  const ours = iobs.insts.filter(i => /^(IOB|IBUF)$/.test(i.type));
  assert.equal(ours.length, 11);
  for (const i of ours) {
    const s = p.insts.find(x => x.kind === 'iob' && x.name === i.name);
    assert.equal(i.type, s.type, i.name);
    assert.equal(cfgText(i), cfgText(s), i.name);
  }
  // each kind there: the input register alone (no IMUX), the output and output-enable registers sharing OTCLK1, the DDRs
  const at = name => cfgText(ours.find(i => i.name === name));
  assert.match(at('sw<0>'), /^IOATTRBOX::LVCMOS25 IFF1:\S+:#FF IFF1_INIT_ATTR::INIT0 IFF1_SR_ATTR::SRLOW IFFATTRBOX::SYNC .* IFD_DELAY_VALUE::DLY3 /);
  assert.match(at('led<1>'), /TMUX::TFF1 OFF1:\S+:#FF .* TFF1_SR_ATTR::SRHIGH TFFATTRBOX::SYNC TSR_USED::0 TCEINV::TCE OUTBUF/);
  assert.match(at('sw<1>'), /IFF1:u_i\/FF0:#FF .* IFF2:u_i\/FF1:#FF IFF2_INIT_ATTR::INIT1 .* ICLK1INV::ICLK1 ICLK2INV::ICLK2_B /);
  assert.match(at('led<2>'), /OMUX::OFFDDR .* OTCLK1INV::OTCLK1 OTCLK2INV::OTCLK2_B OFFDDRBLACKBOX:u_o: /);
  // the registers' pins: the clock on ICLK1 / ICLK2 / OTCLK1 / OTCLK2, the DDR's unconnected S tied to 0 on REV
  const ck = iobs.nets.find(n => n.outpins.some(p => p.inst === 'u_b' && p.pin === 'O'));
  assert.deepEqual(ck.inpins.map(p => `${p.inst} ${p.pin}`).sort(),
    ['led<0> OTCLK1', 'led<1> OTCLK1', 'led<2> OTCLK1', 'led<2> OTCLK2', 'sw<0> ICLK1', 'sw<1> ICLK1', 'sw<1> ICLK2']);
  assert.ok(iobs.nets.some(n => n.inpins.some(p => p.inst === 'sw<1>' && p.pin === 'REV')));
  assert.deepEqual(xdlSize(iobs), { slices: 2, luts: 4, ffs: 0 });
});

test('#2192 nextpnrToXdl: the clock pad to its global buffer by the dedicated path, as Silinx routes it', () => {
  const bufg = iobs.insts.find(i => i.type === 'BUFGMUX');
  assert.equal(bufg.site, 'BUFGMUX_X2Y11');
  const pad = iobs.nets.find(n => n.outpins.some(p => p.inst === 'clk' && p.pin === 'I'));
  assert.deepEqual(pad.inpins, [{ inst: 'u_b', pin: 'I0' }]);
  assert.deepEqual(pad.pips.map(p => `${p.tile} ${p.from} -> ${p.to}`),
    ['TIBUFS_X13Y35 I0_PINWIRE -> IOIS_IBUF0', 'CLKT_X13Y35 CLKT_CKI4 -> CLKT_GCLK0', 'CLKT_X13Y35 CLKT_GCLK0 -> CLKT_GCLKIN00']);
  const r = checkRouting(iobs, device);
  assert.deepEqual(r.problems, []);
  const { bytes, unknown } = bitgen(parseXdl(writeXdl(iobs)), loadDb(PART), { name: 'top.ncd', crc: true, startupClk: 'JtagClk', part: '3s250ecp132' });
  assert.deepEqual(unknown, []);
  assert.equal(bytes.length, 169286);
});

test('#2192 simCheck: the IOBs\' registers follow the netlist on both edges; a wrong setting is caught', () => {
  const json = iobRouted();
  const r = simCheck(json, iobs, { cycles: 1000, starts: 300 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.flipFlops, 8);
  // with the inputs held (the reset btn<0> high, sw<1> high), and with new random inputs before each edge: still equal
  assert.equal(simCheck(json, iobs, { cycles: 50, inputs: { 'btn[0]': 1, 'sw[1]': 1 } }).ok, true);
  assert.equal(simCheck(json, iobs, { cycles: 2000, randomInputs: true }).ok, true);
  // a clock edge, an initial value, a set / reset kind, an enable turned over: the flip-flops' values differ (an input
  // register's edge and a reset only with the inputs changing)
  const text = writeXdl(iobs);
  for (const [from, to] of [['ICLK2INV::ICLK2_B', 'ICLK2INV::ICLK2'], ['IFF2_INIT_ATTR::INIT1', 'IFF2_INIT_ATTR::INIT0'],
    ['TFF1_SR_ATTR::SRHIGH', 'TFF1_SR_ATTR::SRLOW'], ['OTCLK2INV::OTCLK2_B', 'OTCLK2INV::OTCLK2'], ['TFFATTRBOX::SYNC', 'TFFATTRBOX::ASYNC'],
    ['OFF1_SR_ATTR::SRLOW', 'OFF1_SR_ATTR::SRHIGH'], ['TCEINV::TCE ', '']]) {
    assert.ok(text.includes(from), from);
    const w = simCheck(json, parseXdl(text.replace(from, to)), { cycles: 200, randomInputs: true });
    assert.equal(w.ok, false, `${from} -> ${to}`);
    assert.match(w.message, /^(start \d+, )?cycle \d+: \S+ is [01] in the netlist, [01] in the XDL$/);
  }
});

test('#2192 timingExport: the IOB registers\' delays (SPEED_4.pad)', () => {
  assert.deepEqual(timingExport(device).timing.pad, { Tiopi: 1.253, Tioop: 3.257, Tiockiq: 0.6, Tioock: 0.5, Tiotck: 0.5 });
});

// nextpnr's routed design of research/nextpnr-s3e/widemux.v (#2190): a 16:1 tree with its MUXF8, an 8:1 with a MUXF7 on top, a
// MUXF7 that became a LUT. ISE's DRC passed it (0 errors, 0 warnings), its bitgen's .bit byte-identical to Silinx's.
const wideRouted = () => JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/nextpnr-s3e/widemux-routed.json.gz', import.meta.url))));
const wide = nextpnrToXdl(wideRouted(), device, PART);

test('#2190 nextpnrToXdl: the MUXF7 and MUXF8 on their slices, on the CLB\'s dedicated wires, as WIDE_MUX places them', () => {
  const cells = Object.values(Object.values(wideRouted().modules)[0].cells);
  const count = t => cells.filter(c => c.type === t).length;
  assert.deepEqual([count('MUXF5'), count('MUXF6'), count('MUXF7'), count('MUXF8')], [12, 6, 3, 1]);   // (the fourth MUXF7: a LUT)
  const nameOf = c => c.replace(/:/g, '_');
  const at = name => wide.insts.find(i => i.cfg.some(c => c.attr === 'F6MUX' && c.name === nameOf(name)));
  const xy = i => /^SLICE_X(\d+)Y(\d+)$/.exec(i.site).slice(1).map(Number);
  // the F8 at (1, 1) of its CLB; its F7s at (0, 1) of the CLB and of the one above
  const [x8, y8] = xy(at('u_f8'));
  assert.deepEqual([x8 % 2, y8 % 2], [1, 1]);
  const f7s = ['m7[0]_u', 'm7[1]_u'].map(n => xy(at(n)));
  assert.deepEqual(f7s.map(p => p.join()).sort(), [[x8 - 1, y8], [x8 - 1, y8 + 2]].map(p => p.join()).sort());
  // the F7 feeding the F8's FXINA is the one of its own CLB, by the net on the pins
  const fxina = wide.nets.find(n => n.inpins.some(p => p.inst === at('u_f8').name && p.pin === 'FXINA'));
  assert.equal(fxina.outpins[0].pin, 'FX');
  const s = wide.insts.find(i => i.name === fxina.outpins[0].inst);
  assert.deepEqual(xy(s), [x8 - 1, y8]);
  // from the CLB above: its FX -> FX_S2 PIP, the node into this tile
  const fxinb = wide.nets.find(n => n.inpins.some(p => p.inst === at('u_f8').name && p.pin === 'FXINB'));
  assert.ok(fxinb.pips.some(p => p.from === 'FX2' && p.to === 'FX_S2'), JSON.stringify(fxinb.pips));
  assert.deepEqual(checkRouting(wide, device).problems, []);
  assert.deepEqual(bitgen(parseXdl(writeXdl(wide)), loadDb(PART), { name: 'top.ncd', crc: true, startupClk: 'JtagClk', part: '3s250ecp132' }).unknown, []);
  // as many of each setting as Silinx's packer writes for the same netlist
  const p = pack(readYosysJson(JSON.parse(fs.readFileSync(new URL('./fixtures/nextpnr-engine/widemux.json', import.meta.url), 'utf8'))), { ucf: fs.readFileSync(new URL('./fixtures/nextpnr-engine/widemux.ucf', import.meta.url), 'utf8'), part: PART });
  const settings = insts => ['F5MUX', 'F6MUX', 'F5USED', 'FXUSED'].map(a => insts.reduce((n, i) => n + (i.cfg || []).filter(c => c.attr === a).length, 0));
  assert.deepEqual(settings(wide.insts), settings(p.insts));
});

test('#2190 simCheck: the XDL implements the wide multiplexers; a select or an input swapped is caught', () => {
  const json = wideRouted();
  const r = simCheck(json, wide, { cycles: 1000, starts: 100 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.flipFlops, 32);
  assert.equal(simCheck(json, wide, { cycles: 2000, randomInputs: true }).ok, true);
  // the F8's two inputs swapped on its pins: another multiplexer
  const swapped = parseXdl(writeXdl(wide));
  const f8 = swapped.insts.find(i => i.cfg.some(c => c.attr === 'F6MUX' && c.name === 'u_f8'));
  for (const n of swapped.nets) for (const p of n.inpins) if (p.inst === f8.name && /^FXIN[AB]$/.test(p.pin)) p.pin = p.pin === 'FXINA' ? 'FXINB' : 'FXINA';
  const w = simCheck(json, swapped, { cycles: 200, randomInputs: true });
  assert.equal(w.ok, false);
  assert.match(w.message, /^cycle \d+: \S+ is [01] in the netlist, [01] in the XDL$/);
});
