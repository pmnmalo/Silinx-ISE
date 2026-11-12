// The checks of a PCF, an LPF and a CST (#2296, core/constraints-check.js), Check Constraints' in the interface and the MCP
// server's, and the Constraints Wizard's file (core/constraints-wizard.js): on the boards of each family (the iCEBreaker,
// the ULX3S, the Tang Nano 9K), the pins of the package, given twice, on no resource of the board, at another voltage than
// their bank's; the attributes each format writes; an edited file read back.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PIN_ATTRS, constraintsDiagnostics, packagePinError, standardVolts, pinAttrsOf } from '../core/constraints-check.js';
import { wizardTitle, wizardText, wizardError, applyAttributes } from '../core/constraints-wizard.js';
import { boardAutoAssign } from '../packages/silinx-fpga/src/parts.js';
import { PCF } from '../packages/silinx-fpga/src/pcf.js';
import { LPF } from '../packages/silinx-fpga/src/lpf.js';
import { CST } from '../packages/silinx-fpga/src/cst.js';
import { resolveBoard } from '../server/devices.js';

const boardOf = id => { const r = resolveBoard(id); return { ...r.board, resources: r.resources, device: r.device }; };
const ICEBREAKER = boardOf('icebreaker'), ULX3S = boardOf('ulx3s'), TANGNANO = boardOf('tangnano9k');
const PORTS = [{ name: 'clk', dir: 'in', width: 1, msb: null, lsb: null }, { name: 'led', dir: 'out', width: 2, msb: 1, lsb: 0 }];
const check = (id, text, board, more = {}) => constraintsDiagnostics(id, text, { ports: PORTS, top: 'blinky', device: board.device, board, ...more });

test('a package\'s pins: a QFN\'s numbered, a BGA\'s balls; another form not checked', () => {
  assert.equal(packagePinError('48', 'sg48'), null);
  assert.equal(packagePinError('49', 'sg48'), '49 is not a pin of the sg48 package (1…48)');
  assert.equal(packagePinError('0', 'qn88'), '0 is not a pin of the qn88 package (1…88)');
  assert.equal(packagePinError('A3', 'qn88'), 'A3 is not a pin of the qn88 package (1…88)');
  assert.equal(packagePinError('G2', 'cabga381'), null);
  assert.equal(packagePinError('AA3', 'cabga381'), null);
  assert.equal(packagePinError('12', 'cabga381'), '12 is not a pin of the cabga381 package (its balls look like A1, B12, AA3)');
  assert.equal(packagePinError('A1', 'qn84'), null);   // (the iCE40's QN84: two rows, A and B)
  assert.equal(packagePinError('whatever', 'xyz'), null);
});

test('the voltages of the I/O standards', () => {
  assert.deepEqual(['LVCMOS33', 'LVCMOS18', 'lvcmos25', 'LVTTL33', 'LVTTL', 'SSTL135_I', 'SSTL18_II', 'HSUL12', 'LVCMOS33D'].map(standardVolts), [3.3, 1.8, 2.5, 3.3, 3.3, 1.35, 1.8, 1.2, 3.3]);
  assert.deepEqual(['LVDS', 'SB_LVCMOS', '', undefined].map(standardVolts), [null, null, null, null]);
});

test('what each format writes of a pin', () => {
  assert.deepEqual(Object.keys(PIN_ATTRS), ['ucf', 'xdc', 'pcf', 'lpf', 'cst']);
  assert.deepEqual(pinAttrsOf({ part: 'ice40up5k' }), { iostandard: null, drive: null, slew: null, pull: ['up'], clock: true });
  assert.deepEqual(pinAttrsOf({ part: 'lfe5u-85f' }).drive, ['4', '8', '12', '16']);
  assert.deepEqual(pinAttrsOf({ part: 'gw1nr-9c' }).slew, null);
  assert.equal(pinAttrsOf({ part: 'xc3s250e' }), PIN_ATTRS.ucf);
});

test('iCE40 (PCF) on the iCEBreaker: a good file, then a pin of no package, given twice, on no resource; a port with no pin', () => {
  assert.deepEqual(check('pcf', 'set_io clk 35\nset_io led[0] 27\nset_io led[1] 25\nset_frequency clk 12\n', ICEBREAKER), []);
  assert.deepEqual(check('pcf', 'set_io clk 35\nset_io led[0] 49\nset_io led[1] 35\nset_io -pullup yes x 1\n', ICEBREAKER), [
    { severity: 'error', line: 2, message: 'set_io led[0]: 49 is not a pin of the sg48 package (1…48)' },
    { severity: 'error', line: 3, message: 'set_io led[1]: the pin 35 is given to clk too (line 1)' },
    { severity: 'warning', line: 4, message: 'set_io x: the pin 1 is on no resource of the 1BitSquared iCEBreaker' },
    { severity: 'warning', line: 4, message: 'set_io x: the top has no such port' },
  ]);
  assert.deepEqual(check('pcf', 'set_io clk 35\n', ICEBREAKER), [{ severity: 'warning', line: 1, message: "2 port bit(s) of 'blinky' have no pin (set_io): led[0], led[1]" }]);
  // (no top given, as the editor's check of a file of another module: no such warning; no device nor board: the names only)
  assert.deepEqual(check('pcf', 'set_io clk 35\n', ICEBREAKER, { top: null }), []);
  assert.deepEqual(constraintsDiagnostics('pcf', 'set_io clk 99\nset_io led[0] 99\n'), [{ severity: 'error', line: 2, message: 'set_io led[0]: the pin 99 is given to clk too (line 1)' }]);
  assert.deepEqual(check('pcf', 'set_io clk 35\nset_bogus a\n', ICEBREAKER), [{ severity: 'error', line: 2, message: 'set_bogus: not a PCF command (set_io, set_frequency)' }]);
});

test('ECP5 (LPF) on the ULX3S: a ball of no BGA, an I/O standard of another bank\'s voltage, a drive and a slew the ECP5 has not', () => {
  assert.deepEqual(check('lpf', 'LOCATE COMP "clk" SITE "G2";\nIOBUF PORT "clk" IO_TYPE=LVCMOS33;\nLOCATE COMP "led[0]" SITE "B2";\nLOCATE COMP "led[1]" SITE "C2";\nIOBUF PORT "led[1]" IO_TYPE=LVCMOS33 DRIVE=8 SLEWRATE=FAST;\nFREQUENCY PORT "clk" 25 MHZ;\n', ULX3S), []);
  assert.deepEqual(check('lpf', 'LOCATE COMP "clk" SITE "G2";\nLOCATE COMP "led[0]" SITE "B2";\nIOBUF PORT "led[0]" IO_TYPE=LVCMOS18 DRIVE=6 SLEWRATE=MED;\nLOCATE COMP "led[1]" SITE "99";\nIOBUF PORT "led[1]" IO_TYPE=FOO33;\n', ULX3S), [
    { severity: 'error', line: 3, message: 'DRIVE=6 of led[0]: 4, 8, 12 or 16 mA' },
    { severity: 'error', line: 3, message: 'SLEWRATE=MED of led[0]: SLOW or FAST' },
    { severity: 'error', line: 3, message: 'IO_TYPE=LVCMOS18 of led[0]: the pin B2 (led<0>) is in a bank at 3.3 V on the Radiona ULX3S (LVCMOS33), not 1.8 V' },
    { severity: 'error', line: 4, message: 'LOCATE COMP led[1]: 99 is not a pin of the cabga381 package (its balls look like A1, B12, AA3)' },
    { severity: 'warning', line: 5, message: 'IO_TYPE=FOO33 of led[1]: not an I/O standard Silinx knows of the ECP5 (LVCMOS33, LVCMOS25, LVCMOS18, LVCMOS15, LVCMOS12, LVCMOS10…)' },
  ]);
});

test('Gowin (CST) on the Tang Nano 9K: its banks at 1.8 V and 3.3 V; a drive the Gowin has not; a pin on no resource', () => {
  // (the LEDs' bank 3 at 1.8 V, the clock's at 3.3 V: as Update Constraints writes them)
  const good = 'IO_LOC "clk" 52;\nIO_PORT "clk" IO_TYPE=LVCMOS33;\nIO_LOC "led[0]" 10;\nIO_PORT "led[0]" IO_TYPE=LVCMOS18 DRIVE=8;\nIO_LOC "led[1]" 11;\n// create_clock -name clk -period 37.037 [get_ports {clk}]\n';
  assert.deepEqual(check('cst', good, TANGNANO), []);
  assert.deepEqual(check('cst', 'IO_LOC "clk" 52;\nIO_PORT "clk" IO_TYPE=LVCMOS18;\nIO_LOC "led[0]" 10;\nIO_PORT "led[0]" IO_TYPE=LVCMOS33 DRIVE=7 PULL_MODE=UP;\nIO_LOC "led[1]" 2;\n', TANGNANO), [
    { severity: 'error', line: 2, message: 'IO_TYPE=LVCMOS18 of clk: the pin 52 (clk) is in a bank at 3.3 V on the Sipeed Tang Nano 9K (LVCMOS33), not 1.8 V' },
    { severity: 'error', line: 4, message: 'DRIVE=7 of led[0]: 4, 8, 12, 16 or 24 mA' },
    { severity: 'error', line: 4, message: 'IO_TYPE=LVCMOS33 of led[0]: the pin 10 (led_n<0>) is in a bank at 1.8 V on the Sipeed Tang Nano 9K (LVCMOS18), not 3.3 V' },
    { severity: 'warning', line: 5, message: 'IO_LOC led[1]: the pin 2 is on no resource of the Sipeed Tang Nano 9K' },
  ]);
  assert.deepEqual(check('cst', 'IO_LOC "clk" 89;\n', TANGNANO, { top: null }), [{ severity: 'error', line: 1, message: 'IO_LOC clk: 89 is not a pin of the qn88 package (1…88)' }]);
});

test('an edited file read back: the attributes changed by hand, its model', () => {
  const pcf = PCF.read('# by hand\nset_io -pullup yes clk 35\nset_io led[0] 27   # LED1\nset_frequency clk 25\n');
  assert.deepEqual(pcf.assignments, { clk: { pull: 'up', loc: '35' }, 'led[0]': { loc: '27' } });
  assert.deepEqual(pcf.netStatements.map(s => s.line), [2, 3]);
  assert.equal(pcf.clocks[0].period, 40);
  const lpf = LPF.read('LOCATE COMP "led[0]"\n  SITE "B2";\nIOBUF PORT "led[0]" IO_TYPE=LVCMOS33 PULLMODE=NONE DRIVE=16 SLEWRATE=slow;\n');
  assert.deepEqual(lpf.assignments['led[0]'], { loc: 'B2', iostandard: 'LVCMOS33', pull: null, drive: '16', slew: 'SLOW' });
  assert.deepEqual(lpf.netStatements.map(s => s.line), [1, 3]);
  assert.equal(LPF.write({ assignments: { x: { loc: 'B2', slew: 'fast' } } }), 'LOCATE COMP "x" SITE "B2";\nIOBUF PORT "x" SLEWRATE=FAST;\n');
  const cst = CST.read('IO_LOC "led[0]" 10;\n\nIO_PORT "led[0]" IO_TYPE=LVCMOS18 PULL_MODE=KEEPER DRIVE=4;\n');
  assert.deepEqual(cst.assignments['led[0]'], { loc: '10', iostandard: 'LVCMOS18', pull: 'keeper', drive: '4' });
  assert.deepEqual(cst.netStatements.map(s => s.line), [1, 3]);
});

// the wizard's file for blinky's ports on each board (the MCP's and the interface's: test/mcp-constraints.test.js, ui/constraints-wizard.test.js)
function wizardOf(board, attributes) {
  const r = boardAutoAssign(PORTS, board, { byDirection: true });
  if (attributes) applyAttributes(board.device, r.assignments, attributes);
  return { asg: r.assignments, text: wizardText({ device: board.device, board, ports: PORTS, assignments: r.assignments, clocks: r.clocks, top: 'blinky' }) };
}

test('the wizard\'s file on each family\'s board, its title, its attributes, its errors', () => {
  assert.deepEqual([ICEBREAKER, ULX3S, TANGNANO, { device: { part: 'xc3s250e' } }, { device: { part: 'xc7a35t' } }].map(b => wizardTitle(b.device)), ['PCF Wizard', 'LPF Wizard', 'CST Wizard', 'UCF Wizard', 'XDC Wizard']);
  assert.equal(wizardOf(ICEBREAKER, { clk: { pull: 'up' } }).text,
    "# PCF generated by the Silinx PCF Wizard for 'blinky' (ice40up5k-sg48, 1BitSquared iCEBreaker)\n\nset_io -pullup yes clk 35\nset_io led[0] 27\nset_io led[1] 25\nset_frequency clk 12.000048\n");
  assert.equal(wizardOf(ULX3S, { 'led<0>': { iostandard: 'lvcmos33', drive: '8', slew: 'slow' } }).text,
    "# LPF generated by the Silinx LPF Wizard for 'blinky' (lfe5u-85f-6-cabga381, Radiona ULX3S)\n\nLOCATE COMP \"clk\" SITE \"G2\";\nLOCATE COMP \"led[0]\" SITE \"B2\";\n"
    + 'IOBUF PORT "led[0]" IO_TYPE=LVCMOS33 DRIVE=8 SLEWRATE=SLOW;\nLOCATE COMP "led[1]" SITE "C2";\nFREQUENCY PORT "clk" 25 MHZ;\n');
  const tn = wizardOf(TANGNANO, { 'led<1>': { pull: 'up' } });
  assert.equal(tn.text, "// CST generated by the Silinx CST Wizard for 'blinky' (gw1nr-9c-6-qn88, Sipeed Tang Nano 9K)\n\nIO_LOC \"clk\" 52;\nIO_PORT \"clk\" IO_TYPE=LVCMOS33;\n"
    + 'IO_LOC "led[0]" 25;\nIO_PORT "led[0]" IO_TYPE=LVCMOS33;\nIO_LOC "led[1]" 26;\nIO_PORT "led[1]" IO_TYPE=LVCMOS33 PULL_MODE=UP;\n// create_clock -name clk -period 37.037 [get_ports {clk}]\n');
  assert.equal(wizardError({ device: TANGNANO.device, board: TANGNANO, assignments: tn.asg, text: tn.text }), null);
  // the refusals: a pin twice, a pin of no package, a bank's voltage
  assert.equal(wizardError({ device: TANGNANO.device, board: TANGNANO, assignments: { a: { loc: '10' }, b: { loc: '10' } }, text: '' }), 'The pin 10 is given to a and b.');
  const off = { clk: { loc: '99' } };
  assert.equal(wizardError({ device: ICEBREAKER.device, board: ICEBREAKER, assignments: off, text: wizardText({ device: ICEBREAKER.device, board: ICEBREAKER, ports: PORTS.slice(0, 1), assignments: off, top: 'blinky' }) }),
    'set_io clk: 99 is not a pin of the sg48 package (1…48).');
  const low = { clk: { loc: '10', iostandard: 'LVCMOS33' } };
  assert.equal(wizardError({ device: TANGNANO.device, board: TANGNANO, assignments: low, text: wizardText({ device: TANGNANO.device, board: TANGNANO, ports: PORTS.slice(0, 1), assignments: low, top: 'blinky' }) }),
    'IO_TYPE=LVCMOS33 of clk: the pin 10 (led_n<0>) is in a bank at 1.8 V on the Sipeed Tang Nano 9K (LVCMOS18), not 3.3 V.');
  assert.throws(() => applyAttributes(ICEBREAKER.device, { clk: { loc: '35' } }, { clk: { iostandard: 'LVCMOS33' } }), /^Error: attributes: a PCF has no I\/O standard$/);
  assert.throws(() => applyAttributes(ICEBREAKER.device, { clk: { loc: '35' } }, { clk: { pull: 'down' } }), /^Error: attributes: pull down of clk: up or none$/);
  assert.throws(() => applyAttributes(ULX3S.device, {}, { clk: { drive: '8' } }), /^Error: attributes: clk has no pin$/);
  assert.throws(() => applyAttributes(ULX3S.device, { clk: { loc: 'G2' } }, { clk: { speed: '8' } }), /^Error: attributes: speed is not an attribute \(iostandard, pull, drive, slew\)$/);
  assert.deepEqual(applyAttributes(ULX3S.device, { clk: { loc: 'G2', pull: 'down', drive: '8' } }, { clk: { pull: 'none', drive: '' } }), { clk: { loc: 'G2', pull: null } });
});
