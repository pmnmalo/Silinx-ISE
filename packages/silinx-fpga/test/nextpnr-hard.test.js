// The nextpnr engine's block RAMs and multipliers (#2193): their inputs made ready as Silinx's packer leaves them
// (src/open-flow-nextpnr.js hardInputs), the routed design as XDL (src/fpga/nextpnr-xdl.js) on the stopwatch example
// (Silinx's synthesis, Basys2-250: three MULT18X18s, a RAMB16_S18_S18; its native nextpnr result, which ISE's DRC passed
// with no warnings and whose .bit is byte-identical to ISE's), and the example built with --engine nextpnr.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { main } from '../src/cli.js';
import { hardInputs } from '../src/open-flow-nextpnr.js';
import { parseXdl, writeXdl } from '../src/xdl.js';
import { loadDeviceCache } from '../src/fpga/device-node.js';
import { checkRouting } from '../src/fpga/route.js';
import { bitgen } from '../src/fpga/bitgen.js';
import { loadDb } from '../research/s3e-bitstream/db.mjs';
import { nextpnrToXdl, simCheck, xdlSize } from '../research/nextpnr-s3e/lib.mjs';
import { fileURLToPath } from 'node:url';

const PART = 'xc3s250ecp132-4';
const gz = url => JSON.parse(zlib.gunzipSync(fs.readFileSync(new URL(url, import.meta.url))));
const zeros = n => Array(n).fill('0');
const bus = (first, n) => Array.from({ length: n }, (_, i) => first + i);
const dirs = c => Object.fromEntries(Object.keys(c).map(p => [p, /^(DO|P)/.test(p) ? 'output' : 'input']));
// a module of one cell, its bits from `first` numbered
const module = (type, connections, parameters = {}) => ({ ports: {}, cells: { c: { type, connections, parameters, port_directions: dirs(connections) } } });

test('hardInputs: a RAMB16 parity bit written and not read goes to a free data bit; the others at 0; a port never written has its data free', () => {
  // 1024 x 18, 14 bits on DIA (the top two undriven), one in DIPA0, read on port B: DOB0-13 and DOPB0
  const m = module('RAMB16_S18_S18', {
    ADDRA: bus(100, 10), ADDRB: bus(110, 10), CLKA: [2], CLKB: [2], ENA: ['1'], ENB: ['1'], SSRA: ['0'], SSRB: ['0'], WEA: [3], WEB: ['0'],
    DIA: [...bus(10, 14), 'x', 'x'], DIPA: [24, 'x'], DIB: Array(16).fill('x'), DIPB: ['x', 'x'],
    DOA: bus(30, 16), DOPA: [46, 47], DOB: bus(50, 16), DOPB: [66, 67],
  }, { SRVAL_A: '100000000000000000', INIT_A: '000000000000000000' });
  m.cells.u = { type: 'LUT1', connections: { I0: [...bus(50, 14)].slice(0, 1), O: [90] }, parameters: {}, port_directions: { I0: 'input', O: 'output' } };
  m.cells.v = { type: 'LUT1', connections: { I0: [66], O: [91] }, parameters: {}, port_directions: { I0: 'input', O: 'output' } };
  hardInputs(m);
  const c = m.cells.c;
  assert.equal(c.type, 'RAMB16_S18_S18');
  // the parity bit on the first data bit nobody uses (13 is used: bits 14, 15 free on both ports' sides)
  assert.equal(c.connections.DIA[14], 24);
  assert.deepEqual(c.connections.DIA.slice(0, 14), bus(10, 14));
  assert.equal(c.connections.DIA[15], '0');
  assert.deepEqual(c.connections.DIPA, ['0', '0']);
  // what port B read in DOPB0 is now read in DOB14, the bit that moved
  assert.equal(c.connections.DOB[14], 66);
  assert.equal(c.connections.DOPB[0], 64);
  // port B is never written: its data inputs stay free; its constants stay
  assert.deepEqual(c.connections.DIB, Array(16).fill('x'));
  assert.deepEqual(c.connections.DIPB, ['x', 'x']);
  assert.deepEqual(c.connections.WEB, ['0']);
  assert.deepEqual(c.connections.ENA, ['1']);
  assert.equal(c.port_directions.DIA, 'input');
  assert.equal(c.port_directions.DOB, 'output');
  assert.equal(c.port_directions.DOPB, 'output');
});

test('hardInputs: a port written with only constants is free too; a written port with a signal keeps them', () => {
  const single = module('RAMB16_S9', { ADDR: bus(100, 11), CLK: [2], EN: ['1'], SSR: ['0'], WE: ['0'], DI: zeros(8), DIP: ['0'], DO: bus(30, 8), DOP: [40] });
  hardInputs(single);
  assert.deepEqual(single.cells.c.connections.DI, Array(8).fill('x'));   // (a ROM)
  assert.deepEqual(single.cells.c.connections.DIP, ['x']);
  const written = module('RAMB16_S9', { ADDR: bus(100, 11), CLK: [2], EN: ['1'], SSR: ['0'], WE: [3], DI: zeros(8), DIP: ['0'], DO: bus(30, 8), DOP: [40] });
  hardInputs(written);
  assert.deepEqual(written.cells.c.connections.DI, zeros(8));
  assert.deepEqual(written.cells.c.connections.WE, [3]);
});

test('hardInputs: a multiplier\'s undriven inputs at 0, its constants and nets as they are; other cells untouched', () => {
  const m = module('MULT18X18', { A: [...bus(10, 16), 'x', 'z'], B: [...zeros(17), '1'], P: bus(40, 36) });
  m.cells.l = { type: 'LUT2', connections: { I0: ['x'], I1: [10], O: [90] }, parameters: {}, port_directions: { I0: 'input', I1: 'input', O: 'output' } };
  hardInputs(m);
  const c = m.cells.c.connections;
  assert.deepEqual(c.A, [...bus(10, 16), '0', '0']);
  assert.deepEqual(c.B, [...zeros(17), '1']);
  assert.deepEqual(c.P, bus(40, 36));
  assert.deepEqual(m.cells.l.connections.I0, ['x']);
});

const routed = gz('./fixtures/nextpnr-s3e/stopwatch-routed.json.gz');
const device = loadDeviceCache(PART);
const design = parseXdl(writeXdl(nextpnrToXdl(routed, device, PART)));
const cfgOf = (i, attr) => i.cfg.find(c => c.attr === attr)?.value;

test('nextpnrToXdl: a block RAM and multipliers, as Silinx\'s packer writes them', () => {
  assert.deepEqual(xdlSize(design), { slices: 211, luts: 374, ffs: 200 });
  const ram = design.insts.filter(i => i.type === 'RAMB16'), mult = design.insts.filter(i => i.type === 'MULT18X18SIO');
  assert.equal(ram.length, 1);
  assert.equal(mult.length, 3);
  const r = ram[0];
  assert.deepEqual(['PORTA_ATTR', 'PORTB_ATTR', 'WRITEMODEA', 'WRITEMODEB', 'CLKAINV', 'WEBINV', 'SRVAL_A'].map(a => cfgOf(r, a)), ['1024X18', '1024X18', 'READ_FIRST', 'READ_FIRST', 'CLKA', 'WEB', '00000']);
  assert.equal(r.cfg.filter(c => /^INIT_[0-9a-f]{2}$/.test(c.attr)).length, 64);
  assert.equal(r.cfg.filter(c => /^INITP_0\d$/.test(c.attr)).length, 8);
  assert.ok(r.cfg.every(c => !/^INIT/.test(c.attr) || /^[0-9A-F]+$/.test(c.value)));
  for (const m of mult) {
    assert.deepEqual(['AREG', 'BREG', 'PREG', 'B_INPUT', 'PREG_CLKINVERSION', 'CEAINV', 'CLKINV', 'RSTPINV'].map(a => cfgOf(m, a)), ['0', '0', '0', 'DIRECT', '0', 'CEA', 'CLK', 'RSTP']);
    assert.equal(cfgOf(m, 'MULT18X18SIO'), '');
  }
  // a block's pins are its cell's only: not the other block's that share the pair's nodes, not port B's data
  const pinsOf = i => design.nets.flatMap(n => n.inpins.filter(p => p.inst === i.name).map(p => p.pin));
  assert.ok(!pinsOf(r).some(p => /^DIB|^DIPB/.test(p)), pinsOf(r).join(' '));
  assert.ok(!pinsOf(r).includes('DIPA2'));
  for (const m of mult) assert.ok(pinsOf(m).every(p => /^(A|B)\d+$|^(CE[ABP]|CLK|RST[ABP])$/.test(p)), pinsOf(m).join(' '));
});

test('nextpnrToXdl: the blocks\' constants on XDL\'s gnd and vcc nets: a SLICEL with only _GND_SOURCE, a VCC site beside the pins', () => {
  const insts = new Map(design.insts.map(i => [i.name, i]));
  const gnd = design.nets.filter(n => n.type === 'gnd'), vcc = design.nets.filter(n => n.type === 'vcc');
  assert.equal(gnd.length, 4);   // (one per block)
  for (const n of gnd) {
    assert.equal(n.outpins.length, 1);
    assert.equal(n.outpins[0].pin, 'Y');
    const s = insts.get(n.outpins[0].inst);
    assert.equal(s.type, 'SLICEL');
    assert.equal(device.site(s.site).type, 'SLICEL');   // (on a SLICEM, ISE's bitgen sets its SLICEM bits too)
    assert.deepEqual(s.cfg.map(c => `${c.attr}:${c.value}`), ['_NO_USER_LOGIC:', '_GND_SOURCE:Y']);
  }
  assert.ok(vcc.length >= 4);
  for (const n of vcc) {
    const s = insts.get(n.outpins[0].inst);
    assert.equal(s.type, 'VCC');
    assert.deepEqual(s.cfg.map(c => `${c.attr}:${c.value}`), ['_NO_USER_LOGIC:', '_VCC_SOURCE:VCCOUT']);
  }
});

test('nextpnrToXdl: stopwatch routed on the device graph, every feature in the bit database, the same as its netlist', () => {
  assert.deepEqual(checkRouting(design, device).problems, []);
  const { unknown } = bitgen(design, loadDb(PART), { name: 'top.ncd', crc: true, startupClk: 'JtagClk', part: '3s250ecp132' });
  assert.deepEqual(unknown, []);
  const r = simCheck(routed, design, { cycles: 300, starts: 20 });
  assert.equal(r.ok, true, r.message);
  assert.equal(r.flipFlops, 200);
});

test('#2193 the stopwatch example (Silinx\'s synthesis) built with --engine nextpnr: no warnings, a complete bitstream', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const netlist = path.join(dir, 'stopwatch.json');
  fs.writeFileSync(netlist, zlib.gunzipSync(fs.readFileSync(new URL('./fixtures/nextpnr-engine/stopwatch.json.gz', import.meta.url))));
  const out = [], err = [];
  const code = await main(['build', netlist, '--part', 'xc3s250e-cp132-4', '--ucf', fileURLToPath(new URL('./fixtures/nextpnr-engine/stopwatch.ucf', import.meta.url)), '--out-dir', dir, '--engine', 'nextpnr'],
    { out: l => out.push(l), err: l => err.push(l) });
  assert.equal(code, 0, err.join('\n'));
  assert.deepEqual(err, []);   // no warnings
  assert.ok(out.includes('  Number of Slice Flip Flops: 200 out of 4896 4%'), out.join('\n'));
  assert.ok(out.includes('All signals are completely routed.'), out.join('\n'));
  assert.ok(out.some(l => /^Bitstream: .*stopwatch\.bit \(169\d+ bytes, every feature in the bit database\)$/.test(l)), out.join('\n'));
  const xdl = parseXdl(fs.readFileSync(path.join(dir, 'routed.xdl'), 'utf8'));
  assert.equal(xdl.insts.filter(i => i.type === 'RAMB16').length, 1);
  assert.equal(xdl.insts.filter(i => i.type === 'MULT18X18SIO').length, 3);
});
