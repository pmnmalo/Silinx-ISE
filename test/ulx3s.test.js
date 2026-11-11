// The ULX3S (#2302): its pins (its LPF, emard/ulx3s ulx3s_v20.lpf) in the board data, its four sizes, a project's
// constraints made from them as an LPF, a design built with them by nextpnr-ecp5 with no warnings; the ECP5's parts in the
// device database (Lattice's data sheet, and nextpnr-ecp5's counts of each part's resources)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FAMILIES, PARTS, findPart, findBoard, resolveBoard, validateDevice, partsOfFamily, getDeviceDb } from '../server/devices.js';
import { boardConstraints } from '../server/projects.js';
import { boardAutoAssign, boardConstraintsText, resourcesOf, ECP5_PARTS, LPF, runFlow, nextpnrEcp5Node, yosysNode } from '../packages/silinx-fpga/src/node.js';

// the board's LPF, as it names them (btn[0] its PWR button, active low)
const LPF_PINS = {
  clk_25mhz: 'G2', ftdi_rxd: 'L4', ftdi_txd: 'M1',
  'led[0]': 'B2', 'led[1]': 'C2', 'led[2]': 'C1', 'led[3]': 'D2', 'led[4]': 'D1', 'led[5]': 'E2', 'led[6]': 'E1', 'led[7]': 'H3',
  'btn[0]': 'D6', 'btn[1]': 'R1', 'btn[2]': 'T1', 'btn[3]': 'R18', 'btn[4]': 'V1', 'btn[5]': 'U1', 'btn[6]': 'H16',
  'sw[0]': 'E8', 'sw[1]': 'D8', 'sw[2]': 'D7', 'sw[3]': 'E7',
  'gp[0]': 'B11', 'gn[0]': 'C11', 'gp[1]': 'A10', 'gn[1]': 'A11', 'gp[2]': 'A9', 'gn[2]': 'B10', 'gp[3]': 'B9', 'gn[3]': 'C10',
  'gp[4]': 'A7', 'gp[5]': 'C8', 'gp[6]': 'C6', 'gp[7]': 'A6',
};
const L = (name, n) => (n === undefined ? LPF_PINS[name] : Array.from({ length: n }, (_, i) => LPF_PINS[`${name}[${i}]`]));

test('the ULX3S in the board data: its LPF\'s pins, its four sizes, the display and the VGA on its header', () => {
  const b = findBoard('ulx3s');
  assert.deepEqual(b.device, { family: 'ecp5', part: 'lfe5u-85f', package: 'cabga381', speed: '-6' });
  assert.deepEqual(b.variants.map(v => [v.id, v.device.part]), [['12f', 'lfe5u-12f'], ['25f', 'lfe5u-25f'], ['45f', 'lfe5u-45f'], ['85f', 'lfe5u-85f']]);
  for (const v of b.variants) assert.deepEqual(validateDevice(v.device), [], v.id);
  assert.equal(resolveBoard('ulx3s', { part: 'lfe5u-25f' }).device.part, 'lfe5u-25f');
  assert.equal(resolveBoard('ulx3s').variant.id, '85f');
  const pins = Object.fromEntries(b.resources.map(r => [r.name, r.pins]));
  const own = { clk: [L('clk_25mhz')], led: L('led', 8), btn: L('btn', 7).slice(1), btn_pwr_n: [L('btn[0]')], sw: L('sw', 4), rx: [L('ftdi_txd')], tx: [L('ftdi_rxd')] };
  const gp = n => L('gp', 8)[n], gn = n => L('gn', 4)[n];
  assert.deepEqual(pins, { ...own, seg: [0, 1, 2, 3, 4, 5, 6].map(gp), dp: [gp(7)], an: [0, 1, 2, 3].map(gn) });
  assert.equal(new Set(Object.values(pins).flat()).size, Object.values(pins).flat().length);
  for (const n of ['seg', 'dp', 'an', 'btn_pwr_n']) assert.equal(b.resources.find(r => r.name === n).extra.activeLow, true, n);
  // (the LPF's pulls: the buttons and switches down, PWR up)
  assert.deepEqual(b.resources.filter(r => r.pull).map(r => [r.name, r.pull]), [['btn', 'down'], ['btn_pwr_n', 'up'], ['sw', 'down']]);
  const v = findBoard('ulx3s-vga');
  assert.deepEqual([v.device, v.variants], [b.device, b.variants]);
  const vpins = Object.fromEntries(v.resources.map(r => [r.name, r.pins]));
  assert.deepEqual(vpins, { ...own, vga_red: [0, 1, 2].map(gp), vga_green: [3, 4, 5].map(gp), vga_blue: [6, 7].map(gp), vga_hsync: [gn(0)], vga_vsync: [gn(1)] });
  for (const r of [...b.resources, ...v.resources]) assert.equal(r.verified, !/^(seg|dp|an|vga_)/.test(r.name), r.name);
  // no programming from Silinx yet (#2298): the board's tool named, by hand
  assert.equal(b.programmer.tools.openFPGALoader.board, 'ulx3s');
});

test('the ECP5 in the device database: after the iCE40, every part of nextpnr-ecp5, the data sheet\'s and nextpnr\'s figures', () => {
  assert.deepEqual(FAMILIES.slice(-3).map(f => f.id), ['ice40', 'ecp5', 'gowin']);
  const ecp5 = partsOfFamily('ecp5');
  assert.deepEqual(ecp5.map(p => p.part).sort(), Object.keys(ECP5_PARTS).sort());
  assert.equal(PARTS.filter(p => p.family === 'ecp5').length, 10);
  assert.ok(getDeviceDb().families.find(f => f.id === 'ecp5').parts.includes('lfe5u-85f'));
  const figures = p => [p.luts, p.ffs, p.brams, p.bramBits, p.multipliers, p.plls, p.distRamBits];
  assert.deepEqual(figures(findPart('lfe5u-85f')), [83640, 83640, 208, 208 * 18 * 1024, 156, 4, 669 * 1024]);
  assert.deepEqual(figures(findPart('lfe5u-25f')), [24288, 24288, 56, 56 * 18 * 1024, 28, 2, 194 * 1024]);
  assert.deepEqual(figures(findPart('lfe5u-45f')).slice(0, 6), [43848, 43848, 108, 108 * 18 * 1024, 72, 4]);
  assert.deepEqual(findPart('lfe5u-12f').brams, 32);
  // the packages: the 85F not in the caBGA256, the 12F and 25F not beyond the caBGA381; the UM5G at speed 8 only
  assert.deepEqual(Object.keys(findPart('lfe5u-85f').packages), ['csfbga285', 'cabga381', 'cabga554', 'cabga756']);
  assert.deepEqual(findPart('lfe5u-85f').packages.cabga381.userIo, 205);
  assert.deepEqual(findPart('lfe5u-25f').speeds, ['-6', '-7', '-8']);
  assert.deepEqual(findPart('lfe5um5g-85f').speeds, ['-8']);
  assert.deepEqual(validateDevice({ part: 'lfe5u-85f', package: 'cabga256', speed: '-6' }), ["lfe5u-85f is not available in package 'cabga256' (valid: csfbga285, cabga381, cabga554, cabga756)"]);
  assert.deepEqual(validateDevice({ part: 'lfe5um5g-45f', package: 'cabga381', speed: '-6' }), ["speed grade '-6' not available for lfe5um5g-45f-cabga381 (valid: -8)"]);
  // the resources model: the family's own, counted on the part
  const res = Object.fromEntries(resourcesOf(findPart('lfe5u-85f'), 'cabga381').map(r => [r.id, r.count]));
  assert.deepEqual([res.luts, res.ffs, res.ebr, res.mult, res.pll, res.iob], [83640, 83640, 208, 156, 4, 205]);
});

const TOP = 'module top(input clk, input [3:0] btn, input [3:0] sw, output [7:0] led);\n  reg [23:0] c = 0;\n  always @(posedge clk) c <= c + 1;\n  assign led = {c[23:20], btn ^ sw};\nendmodule\n';
const PORTS = [{ name: 'clk', dir: 'in', width: 1 }, { name: 'btn', dir: 'in', width: 4, msb: 3, lsb: 0 }, { name: 'sw', dir: 'in', width: 4, msb: 3, lsb: 0 },
  { name: 'led', dir: 'out', width: 8, msb: 7, lsb: 0 }];
const HEADER = "# LPF for top 'top' on Radiona ULX3S 85F (lfe5u-85f-6-cabga381), generated by Silinx\n\n";
const LPF_TEXT = `${HEADER}LOCATE COMP "clk" SITE "G2";\n${['R1', 'T1', 'R18', 'V1'].map((p, i) => `LOCATE COMP "btn[${i}]" SITE "${p}";\nIOBUF PORT "btn[${i}]" PULLMODE=DOWN;\n`).join('')}`
  + `${['E8', 'D8', 'D7', 'E7'].map((p, i) => `LOCATE COMP "sw[${i}]" SITE "${p}";\nIOBUF PORT "sw[${i}]" PULLMODE=DOWN;\n`).join('')}`
  + `${L('led', 8).map((p, i) => `LOCATE COMP "led[${i}]" SITE "${p}";\n`).join('')}FREQUENCY PORT "clk" 25 MHZ;\n`;

test('a board\'s constraints in its family\'s format: an LPF on the ULX3S, its pulls; read back the same', () => {
  const r = resolveBoard('ulx3s');
  const { assignments, clocks, unmatched } = boardAutoAssign(PORTS, { name: r.board.name, device: r.device, resources: r.resources });
  assert.deepEqual(unmatched, []);
  const text = boardConstraintsText({ device: r.device, ports: PORTS, assignments, clocks, header: "UCF for top 'top' on Radiona ULX3S 85F (lfe5u-85f-6-cabga381), generated by Silinx" });
  assert.equal(text, LPF_TEXT);
  const m = LPF.read(text);
  assert.deepEqual(m.clocks, [{ net: 'clk', period: 40 }]);
  assert.deepEqual(m.assignments['btn[0]'], { loc: 'R1', pull: 'down' });
});

test('a project on the ULX3S: its constraints/top.lpf from the board, a bitstream at those pins with no warnings', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'silinx-ulx3s-'));
  try {
    await fs.mkdir(path.join(dir, 'src'));
    await fs.writeFile(path.join(dir, 'src/top.v'), TOP);
    const pj = { name: 'ulx', board: 'ulx3s', device: findBoard('ulx3s').device, top: 'top', files: [{ path: 'src/top.v', lang: 'verilog', role: 'design' }], constraints: 'constraints/top.lpf' };
    await boardConstraints(dir, pj);
    const lpf = await fs.readFile(path.join(dir, 'constraints/top.lpf'), 'utf8');
    assert.equal(lpf, LPF_TEXT.replace(HEADER, "# LPF for top 'top' on Radiona ULX3S (lfe5u-85f-6-cabga381), generated by Silinx\n\n"));
    const log = [], files = {};
    const io = { log: l => log.push(l), sources: () => [{ path: 'top.v', lang: 'verilog', text: TOP }], ucf: lpf, ucfName: 'top.lpf',
      yosys: yosysNode, nextpnr: { ecp5: nextpnrEcp5Node() }, write: (n, d) => { files[n] = d; return `build/${n}`; }, read: n => files[n] ?? null, save: () => {} };
    const r = await runFlow({ top: 'top', family: 'ecp5', device: 'lfe5u-85f', pkg: 'cabga381', speed: '-6', steps: ['synth', 'translate', 'par', 'bitgen'] }, io);
    assert.ok(r.ok, r.error);
    assert.deepEqual(log.filter(l => /^WARNING/.test(l)), []);
    assert.equal(files['top.bit'].length, 1927725);
    assert.ok(r.report.par.constraintsMet);
    assert.ok(log.includes('Netlist of <top> read; constraints: top.lpf, 17 pin location(s), 1 PERIOD constraint(s).'));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
