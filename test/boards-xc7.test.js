// The 7-series' boards (#3142, server/boards.js): the Digilent Basys 3 (xc7a35tcpg236-1) and Nexys A7 (xc7a100tcsg324-1),
// their pins from Digilent's master XDCs, an experimental family's (#1648); an example's project on them, its
// constraints an XDC of its top's ports.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';
import * as dev from '../server/devices.js';
import { BOARDS } from '../server/boards.js';
import { exampleProject, XC7_TARGETS } from './examples-lib.mjs';
import { XDC, boardAutoAssign, boardConstraintsText, experimentalDevice } from '../packages/silinx-fpga/src/parts.js';

let tmp;
before(async () => { tmp = await scratchEnv('silinx-boards-xc7-'); });
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

const board = id => BOARDS.find(b => b.id === id);
const pins = (b, name) => b.resources.find(r => r.name === name).pins;

test('the Basys 3 and the Nexys A7: their devices in the database, an experimental family, Digilent\'s XDCs their source', () => {
  for (const [id, device] of [['basys3', { family: 'artix7', part: 'xc7a35t', package: 'cpg236', speed: '-1' }], ['nexys-a7', { family: 'artix7', part: 'xc7a100t', package: 'csg324', speed: '-1' }]]) {
    const b = board(id);
    assert.deepEqual(b.device, device, id);
    assert.deepEqual(dev.validateDevice(b.device), [], id);
    assert.equal(experimentalDevice(b.device), true, id);
    assert.match(b.sourceUrl, /^https:\/\/github\.com\/Digilent\/digilent-xdc\/blob\/c8644a9fe31cc803789643124545d56b3bef4600\/(Basys-3|Nexys-A7-100T)-Master\.xdc$/);
    assert.deepEqual(b.xdc.config, { CONFIG_VOLTAGE: '3.3', CFGBVS: 'VCCO', 'BITSTREAM.GENERAL.COMPRESS': 'TRUE', 'BITSTREAM.CONFIG.CONFIGRATE': '33', CONFIG_MODE: 'SPIx4' });
    assert.equal(b.programmer.preferred, 'openFPGALoader');
    // every pin once, every resource transcribed (verified) and of the 3.3 V banks but the Nexys A7's SW8, SW9
    const all = b.resources.flatMap(r => r.pins);
    assert.equal(new Set(all).size, all.length, `${id}: a pin twice`);
    for (const r of b.resources) {
      assert.equal(r.verified, true, `${id} ${r.name}`);
      assert.equal(r.iostandard, 'LVCMOS33', `${id} ${r.name}`);
      assert.ok(r.pins.every(p => /^[A-Y]\d{1,2}$/.test(p)), `${id} ${r.name}`);
    }
  }
  assert.deepEqual(board('nexys-a7').resources.find(r => r.name === 'sw').pinIostandards, { T8: 'LVCMOS18', U8: 'LVCMOS18' });
  const p = dev.findPart('xc7a35t');
  assert.deepEqual([p.slices, p.luts, p.ffs, p.brams, p.dsp, p.packages.cpg236.userIo, p.webpack], [5200, 20800, 41600, 50, 90, 106, false]);
  assert.equal(dev.findFamily('artix7').experimental, true);
  assert.deepEqual(dev.resolveBoard('basys3').device, board('basys3').device);
});

test('the boards\' resources: the clock, 16 LEDs and switches, 5 buttons, the seven-segment display, the VGA, the UART', () => {
  const b3 = board('basys3'), a7 = board('nexys-a7');
  // (spot checks against the master XDCs: their first and last pins)
  assert.deepEqual([pins(b3, 'clk'), pins(a7, 'clk')], [['W5'], ['E3']]);
  assert.deepEqual([b3, a7].map(b => b.resources.find(r => r.name === 'clk').extra.period), ['10 ns', '10 ns']);
  assert.deepEqual([pins(b3, 'led').length, pins(b3, 'sw').length, pins(a7, 'led').length, pins(a7, 'sw').length], [16, 16, 16, 16]);
  assert.deepEqual([pins(b3, 'led')[0], pins(b3, 'led')[15], pins(b3, 'sw')[0], pins(b3, 'sw')[15]], ['U16', 'L1', 'V17', 'R2']);
  assert.deepEqual([pins(a7, 'led')[0], pins(a7, 'led')[15], pins(a7, 'sw')[0], pins(a7, 'sw')[15]], ['H17', 'V11', 'J15', 'V10']);
  assert.deepEqual(pins(b3, 'btn'), ['U18', 'T18', 'W19', 'U17', 'T17']);   // BTNC, BTNU, BTNL, BTND, BTNR
  assert.deepEqual(pins(a7, 'btn'), ['N17', 'M18', 'P17', 'P18', 'M17']);
  assert.deepEqual([pins(b3, 'seg'), pins(b3, 'dp'), pins(b3, 'an')], [['W7', 'W6', 'U8', 'V8', 'U5', 'V5', 'U7'], ['V7'], ['U2', 'U4', 'V4', 'W4']]);
  assert.deepEqual([pins(a7, 'seg'), pins(a7, 'dp'), pins(a7, 'an').length], [['T10', 'R10', 'K16', 'K13', 'P15', 'T11', 'L18'], ['H15'], 8]);
  // the VGA's 3/3/2 bits of the examples on the 4 bits' most significant ones
  for (const b of [b3, a7]) assert.deepEqual(['vga_red', 'vga_green', 'vga_blue', 'vga_hsync', 'vga_vsync'].map(n => pins(b, n).length), [3, 3, 2, 1, 1], b.id);
  assert.deepEqual([pins(b3, 'vga_red'), pins(b3, 'vga_blue'), pins(b3, 'vga_hsync')], [['H19', 'J19', 'N19'], ['K18', 'J18'], ['P19']]);
  assert.deepEqual([pins(a7, 'vga_red'), pins(a7, 'vga_blue'), pins(a7, 'vga_vsync')], [['B4', 'C5', 'A4'], ['D7', 'D8'], ['B12']]);
  assert.deepEqual([pins(b3, 'uart_rx'), pins(b3, 'uart_tx'), pins(a7, 'uart_rx'), pins(a7, 'uart_tx')], [['B18'], ['A18'], ['C4'], ['D4']]);
});

test('the examples\' ports on the boards: every one of them a pin, the XDC Vivado reads back, no port left out', () => {
  // (the ports of the examples' tops: gates, blinky, stopwatch, vga, uart)
  const bit = (name, width) => ({ name, dir: /^(led|seg|dp|an|vga_|tx)/.test(name) ? 'out' : 'in', width, msb: width > 1 ? width - 1 : null, lsb: width > 1 ? 0 : null });
  const ports = [bit('clk', 1), bit('sw', 8), bit('btn', 4), bit('led', 8), bit('seg', 7), bit('dp', 1), bit('an', 4),
    bit('vga_red', 3), bit('vga_green', 3), bit('vga_blue', 2), bit('vga_hsync', 1), bit('vga_vsync', 1), bit('rx', 1), bit('tx', 1)];
  for (const id of ['basys3', 'nexys-a7']) {
    const r = dev.resolveBoard(id);
    const b = { ...r.board, resources: r.resources };
    const { assignments, clocks, unmatched } = boardAutoAssign(ports, { ...b, device: r.device }, { byDirection: true });
    assert.deepEqual(unmatched, [], id);
    const text = boardConstraintsText({ device: r.device, board: b, ports, assignments, clocks, header: `UCF for top 'top' on ${b.name}` });
    const m = XDC.read(text);
    assert.equal(Object.keys(m.assignments).length, 45, id);
    assert.ok(Object.values(m.assignments).every(a => a.loc && a.iostandard === 'LVCMOS33'), id);
    assert.deepEqual(m.clocks, [{ net: 'clk', period: 10, duty: 50, name: 'clk' }], id);
    assert.deepEqual(m.config, b.xdc.config, id);
    assert.equal(text.split('\n')[0], `# XDC for top 'top' on ${b.name}`);
  }
});

test('an example\'s project on the Basys 3: its constraints the board\'s XDC, the example\'s UCF not kept', async () => {
  const P = await import('../server/projects.js');
  const r = dev.resolveBoard('basys3');
  await P.createProject({ name: 'blinky3', template: 'blinky', device: r.device, board: 'basys3' });
  const pj = await P.readProject('blinky3');
  assert.equal(pj.constraints, 'constraints/top.xdc');
  const dir = P.projectDir('blinky3');
  assert.equal(fs.existsSync(path.join(dir, 'constraints/top.ucf')), false);
  const text = fs.readFileSync(path.join(dir, 'constraints/top.xdc'), 'utf8');
  assert.equal(text.split('\n')[0], '# XDC for top \'top\' on Digilent Basys 3 (xc7a35t-1-cpg236), generated by Silinx');
  const m = XDC.read(text);
  assert.deepEqual([m.assignments.clk, m.assignments['led<0>'], m.assignments['btn<0>']], [{ loc: 'W5', iostandard: 'LVCMOS33' }, { loc: 'U16', iostandard: 'LVCMOS33' }, { loc: 'U18', iostandard: 'LVCMOS33' }]);
  // an empty project of the Nexys A7: its constraints file an XDC
  await P.createProject({ name: 'empty7', device: dev.resolveBoard('nexys-a7').device, board: 'nexys-a7' });
  assert.equal((await P.readProject('empty7')).constraints, 'constraints/top.xdc');
});

test('the examples\' test projects on the 7-series (test/examples-lib.mjs, Vivado\'s, #1649): an XDC with every pin\'s standard and the clock', () => {
  assert.deepEqual(XC7_TARGETS, [{ board: 'basys3' }, { board: 'nexys-a7' }]);
  for (const t of XC7_TARGETS) for (const name of ['blinky', 'vga']) {
    const { dir, project } = exampleProject(name, t, tmp);
    assert.equal(project.constraints, 'constraints/top.xdc', `${name} ${t.board}`);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'constraints')), ['top.xdc'], `${name} ${t.board}`);
    const m = XDC.read(fs.readFileSync(path.join(dir, project.constraints), 'utf8'));
    assert.ok(Object.values(m.assignments).every(a => a.loc && a.iostandard === 'LVCMOS33'), `${name} ${t.board}`);
    assert.deepEqual(m.clocks.map(c => [c.net, c.period]), [['clk', 10]], `${name} ${t.board}`);
    assert.equal(m.config.CFGBVS, 'VCCO');
  }
});
