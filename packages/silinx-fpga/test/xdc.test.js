// The 7-series' constraints, XDC (#3142, src/xdc.js): read as Vivado reads Digilent's master XDCs, written for Vivado
// with the ports the design keeps only (the spike's [Common 17-55] warnings, #2305), and the device's format of
// constraints (src/family.js constraintsFormatOf).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { XDC, readXdc, writeXdc } from '../src/xdc.js';
import { boardConstraintsText, constraintsExtOf, constraintsFormatOf, experimentalDevice, noFlowMessage, parseUcf, generateUcf } from '../src/parts.js';

// lines of Digilent's Basys-3-Master.xdc (github.com/Digilent/digilent-xdc, MIT), uncommented as a user does: the
// reference the reader is checked against
const DIGILENT = `## Clock signal
set_property -dict { PACKAGE_PIN W5   IOSTANDARD LVCMOS33 } [get_ports clk]
create_clock -add -name sys_clk_pin -period 10.00 -waveform {0 5} [get_ports clk]

## Switches
set_property -dict { PACKAGE_PIN V17   IOSTANDARD LVCMOS33 } [get_ports {sw[0]}]
set_property -dict { PACKAGE_PIN J1   IOSTANDARD LVCMOS33 } [get_ports {JA[0]}];#Sch name = JA1
set_property -dict { PACKAGE_PIN C17   IOSTANDARD LVCMOS33   PULLUP true } [get_ports PS2Clk]
set_property -dict { PACKAGE_PIN E3    IOSTANDARD LVCMOS33 } [get_ports { CLK100MHZ }]; #IO_L12P_T1_MRCC_35 Sch=clk100mhz
set_property CONFIG_VOLTAGE 3.3 [current_design]
set_property CFGBVS VCCO [current_design]
`;

test('XDC.read: Digilent\'s master XDC lines, their pins, standards, pull-up, clock and configuration', () => {
  const m = readXdc(DIGILENT);
  assert.deepEqual(m.assignments, {
    clk: { loc: 'W5', iostandard: 'LVCMOS33' }, 'sw<0>': { loc: 'V17', iostandard: 'LVCMOS33' }, 'JA<0>': { loc: 'J1', iostandard: 'LVCMOS33' },
    PS2Clk: { loc: 'C17', iostandard: 'LVCMOS33', pull: 'up' }, CLK100MHZ: { loc: 'E3', iostandard: 'LVCMOS33' },
  });
  assert.deepEqual(m.clocks, [{ net: 'clk', period: 10, duty: 50, name: 'sys_clk_pin' }]);
  assert.deepEqual(m.config, { CONFIG_VOLTAGE: '3.3', CFGBVS: 'VCCO' });
  assert.deepEqual(m.other, []);
  assert.deepEqual(m.netStatements.map(s => s.net), ['clk', 'sw<0>', 'JA<0>', 'PS2Clk', 'CLK100MHZ']);
  assert.equal(XDC.id, 'xdc');
});

test('XDC.read: one property a line, LOC as PACKAGE_PIN, PULLTYPE, DRIVE, SLEW, several ports, a duty cycle', () => {
  const m = readXdc([
    'set_property LOC u16 [get_ports {led[0]}]',
    'set_property IOSTANDARD lvcmos33 [get_ports {led[0]}]',
    'set_property PULLTYPE PULLDOWN [get_ports {a b}]',
    'set_property -dict { DRIVE 8 SLEW FAST } [get_ports {led[0]}]',
    'create_clock -period 20.000 -waveform {0.000 5.000} [get_ports {clk}]',
  ].join('\n'));
  assert.deepEqual(m.assignments, { 'led<0>': { loc: 'U16', iostandard: 'LVCMOS33', drive: 8, slew: 'fast' }, a: { pull: 'down' }, b: { pull: 'down' } });
  assert.deepEqual(m.clocks, [{ net: 'clk', period: 20, duty: 25 }]);
});

test('XDC.read: other commands kept for Vivado; errors where Vivado stops, with their line', () => {
  const m = readXdc('set_false_path -from [get_ports rst]\nset_property MARK_DEBUG true [get_nets n]\ncreate_clock -period 5 [get_pins u/O]\n');
  assert.deepEqual(m.other, ['set_false_path -from [get_ports rst]', 'set_property MARK_DEBUG true [get_nets n]', 'create_clock -period 5 [get_pins u/O]']);
  assert.deepEqual(m.assignments, {});
  const fails = (text, message) => assert.throws(() => readXdc(text), { message });
  fails('\nset_property -dict { PACKAGE_PIN } [get_ports a]', 'line 2: set_property -dict: a property without its value');
  fails('set_property PACKAGE_PIN W5', 'line 1: set_property needs a property, its value and its objects');
  fails('set_property DRIVE big [get_ports a]', 'line 1: DRIVE big: a number of mA');
  fails('set_property SLEW quick [get_ports a]', 'line 1: SLEW quick: SLOW or FAST');
  fails('set_property PULLTYPE UP [get_ports a]', 'line 1: PULLTYPE UP: PULLUP, PULLDOWN or KEEPER');
  fails('create_clock -name c [get_ports clk]', 'line 1: create_clock needs -period, in ns');
  fails('set_property LOC W5 [get_ports {a]', 'line 1: no closing }');
  fails('set_property LOC W5 [get_ports a', 'line 1: no closing ]');
});

test('writeXdc: every pin with its standard, the bits braced, the clock, the board\'s configuration; read back the same', () => {
  const board = {
    xdc: { config: { CONFIG_VOLTAGE: '3.3', CFGBVS: 'VCCO' } },
    resources: [{ name: 'sw', pins: ['V17', 'T8'], iostandard: 'LVCMOS33', pinIostandards: { T8: 'LVCMOS18' } }, { name: 'clk', pins: ['W5'], iostandard: 'LVCMOS33' }],
  };
  const model = { assignments: { clk: { loc: 'W5' }, 'sw<0>': { loc: 'V17' }, 'sw<1>': { loc: 'T8' }, 'led<0>': { loc: 'U16', iostandard: 'LVCMOS33', drive: 12, slew: 'slow', pull: 'keeper' } },
    clocks: [{ net: 'clk', period: '10 ns', duty: 50 }] };
  const { text, skipped } = writeXdc(model, { board, header: 'XDC for top \'t\'\non the board' });
  assert.equal(text, [
    '# XDC for top \'t\'', '# on the board', '',
    'set_property -dict { PACKAGE_PIN W5 IOSTANDARD LVCMOS33 } [get_ports {clk}]',
    'set_property -dict { PACKAGE_PIN V17 IOSTANDARD LVCMOS33 } [get_ports {sw[0]}]',
    'set_property -dict { PACKAGE_PIN T8 IOSTANDARD LVCMOS18 } [get_ports {sw[1]}]',
    'set_property -dict { PACKAGE_PIN U16 IOSTANDARD LVCMOS33 PULLTYPE KEEPER DRIVE 12 SLEW SLOW } [get_ports {led[0]}]',
    '', '# Timing constraints',
    'create_clock -add -name clk -period 10.000 -waveform {0.000 5.000} [get_ports {clk}]',
    '', '# Configuration', 'set_property CONFIG_VOLTAGE 3.3 [current_design]', 'set_property CFGBVS VCCO [current_design]', ''].join('\n'));
  assert.deepEqual(skipped, []);
  const back = readXdc(text);
  assert.deepEqual(back.assignments, { clk: { loc: 'W5', iostandard: 'LVCMOS33' }, 'sw<0>': { loc: 'V17', iostandard: 'LVCMOS33' }, 'sw<1>': { loc: 'T8', iostandard: 'LVCMOS18' },
    'led<0>': { loc: 'U16', iostandard: 'LVCMOS33', pull: 'keeper', drive: 12, slew: 'slow' } });
  assert.deepEqual(back.clocks, [{ net: 'clk', period: 10, duty: 50, name: 'clk' }]);
  assert.equal(XDC.write(back), writeXdc(back).text);
  assert.equal(writeXdc({}).text, '', 'nothing: no text');
});

test('writeXdc: the ports synthesis removed left out (the spike\'s [Common 17-55]), their nets the skipped ones', () => {
  // the board's switches and buttons for a design that keeps sw[0], led and clk only: an unused button and switches
  const model = readXdc(['set_property -dict { PACKAGE_PIN W5 IOSTANDARD LVCMOS33 } [get_ports {clk}]',
    ...['V17', 'V16', 'W16'].map((p, i) => `set_property -dict { PACKAGE_PIN ${p} IOSTANDARD LVCMOS33 } [get_ports {sw[${i}]}]`),
    'set_property -dict { PACKAGE_PIN U18 IOSTANDARD LVCMOS33 } [get_ports {btnC}]',
    'set_property -dict { PACKAGE_PIN U16 IOSTANDARD LVCMOS33 } [get_ports {led}]',
    'create_clock -add -name sys_clk_pin -period 10.00 -waveform {0 5} [get_ports clk]',
    'create_clock -add -name aux -period 20.00 [get_ports btnC]'].join('\n'));
  const kept = [{ name: 'clk', width: 1, msb: null, lsb: null }, { name: 'sw', width: 1, msb: 0, lsb: 0 }, { name: 'led', width: 1 }];
  const { text, skipped } = writeXdc(model, { ports: kept });
  assert.deepEqual(skipped, ['sw<1>', 'sw<2>', 'btnC']);
  assert.equal(text, ['set_property -dict { PACKAGE_PIN W5 IOSTANDARD LVCMOS33 } [get_ports {clk}]',
    'set_property -dict { PACKAGE_PIN V17 IOSTANDARD LVCMOS33 } [get_ports {sw[0]}]',
    'set_property -dict { PACKAGE_PIN U16 IOSTANDARD LVCMOS33 } [get_ports {led}]',
    '', '# Timing constraints', 'create_clock -add -name sys_clk_pin -period 10.000 -waveform {0.000 5.000} [get_ports {clk}]', ''].join('\n'));
  assert.ok(!/btnC|sw\[1\]|sw\[2\]/.test(text));
  // a bus of the design kept whole (msb > lsb, or lsb > msb)
  assert.deepEqual(writeXdc(model, { ports: [{ name: 'sw', width: 3, msb: 2, lsb: 0 }] }).skipped, ['clk', 'btnC', 'led']);
  assert.deepEqual(writeXdc(model, { ports: [{ name: 'sw', width: 3, msb: 0, lsb: 2 }] }).skipped, ['clk', 'btnC', 'led']);
});

test('constraintsFormatOf: UCF, the iCE40\'s PCF, the 7-series\' XDC; the experimental family and its message', () => {
  const cases = [['xc3s250e', 'ucf'], ['xc6slx16', 'ucf'], ['ice40up5k', 'pcf'], ['xc7a35t', 'xdc'], ['xc7a100t', 'xdc'], ['xc7k70t', 'ucf'], ['nonsense', 'ucf']];
  for (const [part, f] of cases) {
    assert.equal(constraintsFormatOf({ part }), f, part);
    assert.equal(constraintsExtOf({ part }), `.${f}`, part);
  }
  assert.equal(constraintsFormatOf(undefined), 'ucf');
  assert.deepEqual(['xc3s250e', 'ice40up5k', 'xc7a35t', 'xc7a100t', 'xc7k70t'].map(part => experimentalDevice({ part })), [false, false, true, true, false]);
  assert.equal(noFlowMessage({ part: 'xc7a35t' }), 'the XC7A35T (Artix-7, an experimental family) has no implementation flow yet: its boards and its XDC constraints only');
});

test('boardConstraintsText: an XDC on the 7-series (the header\'s format, the board\'s standards); UCF and PCF as before', () => {
  const ports = [{ name: 'clk', dir: 'in', width: 1, msb: null, lsb: null }, { name: 'led', dir: 'out', width: 2, msb: 1, lsb: 0 }];
  const assignments = { clk: { loc: 'W5' }, 'led<0>': { loc: 'U16' }, 'led<1>': { loc: 'E19' } };
  const clocks = [{ net: 'clk', period: 10, duty: 50 }];
  const board = { resources: [{ pins: ['W5', 'U16', 'E19'], iostandard: 'LVCMOS33' }], xdc: { config: { CFGBVS: 'VCCO' } } };
  const xdc = boardConstraintsText({ device: { part: 'xc7a35t' }, board, ports, assignments, clocks, header: 'UCF for top \'top\' on the Basys 3' });
  assert.equal(xdc, ['# XDC for top \'top\' on the Basys 3', '',
    'set_property -dict { PACKAGE_PIN W5 IOSTANDARD LVCMOS33 } [get_ports {clk}]',
    'set_property -dict { PACKAGE_PIN U16 IOSTANDARD LVCMOS33 } [get_ports {led[0]}]',
    'set_property -dict { PACKAGE_PIN E19 IOSTANDARD LVCMOS33 } [get_ports {led[1]}]',
    '', '# Timing constraints', 'create_clock -add -name clk -period 10.000 -waveform {0.000 5.000} [get_ports {clk}]',
    '', '# Configuration', 'set_property CFGBVS VCCO [current_design]', ''].join('\n'));
  // (the other formats unchanged: a UCF's text the same as generateUcf's, a PCF's header said PCF)
  const ucf = boardConstraintsText({ device: { part: 'xc3s250e' }, ports, assignments, clocks, header: 'UCF for top' });
  assert.equal(ucf, generateUcf({ ports, assignments, clocks, header: 'UCF for top' }));
  assert.equal(parseUcf(ucf).assignments['led<1>'].loc, 'E19');
  assert.match(boardConstraintsText({ device: { part: 'ice40up5k' }, ports, assignments: {}, clocks: [], header: 'UCF for top' }), /^# PCF for top\n\n$/);
});
