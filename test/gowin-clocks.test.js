// The Gowin's clocks at their own frequencies (#3488, packages/silinx-fpga/src/gowin-clocks.js): each rPLL output's and the
// oscillator's from their parameters (UG286's formulas, computed here by hand), written as the SDC nextpnr-himbaechel-gowin
// checks them against; nextpnr's report read back with each clock's own constraint, or none. Through the flow: a PLL clock
// faster than the design runs fails Place & Route, naming it; a design with no clock in its CST has its clock reported with
// no constraint (not nextpnr's 12 MHz). The PLL designs met, the oscillator's: test/gowin-pll-osc.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pllFrequencies, oscFrequency, gowinClocks } from '../packages/silinx-fpga/src/gowin-clocks.js';
import { gowinFmax } from '../packages/silinx-fpga/src/open-flow-gowin.js';
import { runFlow, nextpnrGowinNode, yosysNode } from '../packages/silinx-fpga/src/node.js';

const b32 = n => n.toString(2).padStart(32, '0');   // (Yosys's integer parameters)

test('an rPLL\'s outputs: CLKOUT = CLKOUTP = FCLKIN*(FBDIV+1)/(IDIV+1), CLKOUTD by SDIV, CLKOUTD3 by 3, from their sources; bypassed: FCLKIN', () => {
  // 27 MHz * 2 = 54 MHz; CLKOUTD by 2 (its default), CLKOUTD3 by 3
  assert.deepEqual(pllFrequencies({ FCLKIN: '27', IDIV_SEL: b32(0), FBDIV_SEL: b32(1), ODIV_SEL: b32(8) }, 'GW1N-9C'), { CLKOUT: 54, CLKOUTP: 54, CLKOUTD: 27, CLKOUTD3: 18 });
  // 27 * 10 / 3 = 90 MHz, CLKOUTD by 6
  assert.deepEqual(pllFrequencies({ FCLKIN: '27', IDIV_SEL: b32(2), FBDIV_SEL: b32(9), DYN_SDIV_SEL: b32(6) }, 'GW1N-9C'), { CLKOUT: 90, CLKOUTP: 90, CLKOUTD: 15, CLKOUTD3: 30 });
  // CLKOUTP bypassed (27 MHz), CLKOUTD and CLKOUTD3 from it
  assert.deepEqual(pllFrequencies({ FCLKIN: '27', FBDIV_SEL: b32(3), CLKOUTP_BYPASS: 'true', CLKOUTD_SRC: 'CLKOUTP', CLKOUTD3_SRC: 'CLKOUTP', DYN_SDIV_SEL: b32(4) }, 'GW1N-9C'),
    { CLKOUT: 108, CLKOUTP: 27, CLKOUTD: 6.75, CLKOUTD3: 9 });
  // CLKOUT and CLKOUTD bypassed; Yosys's string of 0s and 1s with its space ("100 ")
  assert.deepEqual(pllFrequencies({ FCLKIN: '100 ', IDIV_SEL: b32(3), FBDIV_SEL: b32(11), CLKOUT_BYPASS: 'TRUE', CLKOUTD_BYPASS: 'true' }, 'GW1N-9C'), { CLKOUT: 100, CLKOUTP: 300, CLKOUTD: 100, CLKOUTD3: 100 / 3 });
  // the defaults (FCLKIN 100 MHz, the dividers by 1, SDIV 2); an input frequency out of its range taken as 100 MHz, as gowin_pack does
  assert.deepEqual(pllFrequencies({}, 'GW1N-9C'), { CLKOUT: 100, CLKOUTP: 100, CLKOUTD: 50, CLKOUTD3: 100 / 3 });
  assert.equal(pllFrequencies({ FCLKIN: '2', FBDIV_SEL: b32(1) }, 'GW1N-9C').CLKOUT, 200);
  assert.equal(pllFrequencies({ FCLKIN: '450', FBDIV_SEL: b32(1) }, 'GW1N-9C').CLKOUT, 200);
  // dividers dynamic: not known
  for (const k of ['DYN_IDIV_SEL', 'DYN_FBDIV_SEL', 'DYN_ODIV_SEL']) assert.equal(pllFrequencies({ FCLKIN: '27', [k]: 'true' }, 'GW1N-9C'), null);
});

test('the oscillator: 250 MHz / FREQ_DIV (210 MHz on the GW1N-4s), 100 by default; the other oscillators not known', () => {
  assert.equal(oscFrequency('OSC', { FREQ_DIV: b32(10) }, 'GW1N-9C'), 25);
  assert.equal(oscFrequency('OSC', { FREQ_DIV: b32(128) }, 'GW1N-9C'), 1.953125);
  assert.equal(oscFrequency('OSC', {}, 'GW1N-9C'), 2.5);
  assert.equal(oscFrequency('OSC', { FREQ_DIV: b32(10) }, 'GW1N-4'), 21);
  assert.equal(oscFrequency('OSCZ', { FREQ_DIV: b32(10) }, 'GW1NZ-1'), null);
});

test('the SDC: the CST\'s clocks on their ports, then each rPLL\'s and oscillator\'s connected outputs on their pins', () => {
  const netlist = { modules: { top: { cells: {
    u: { type: 'rPLL', parameters: { FCLKIN: '27', FBDIV_SEL: b32(1) }, connections: { CLKIN: [2], CLKOUT: [5], CLKOUTP: [], CLKOUTD: ['x'], LOCK: [7] } },
    'sub.o': { type: 'OSC', parameters: { FREQ_DIV: b32(10) }, connections: { OSCOUT: [9] } },
    d: { type: 'rPLL', parameters: { DYN_IDIV_SEL: 'true' }, connections: { CLKOUT: [11] } },
    w: { type: 'OSCZ', parameters: {}, connections: { OSCOUT: [12] } },
    l: { type: 'LUT4', parameters: {}, connections: { F: [13] } },
  } } } };
  const r = gowinClocks(JSON.stringify(netlist), 'top', 'GW1N-9C', [{ net: 'clk', period: 37.037 }]);
  assert.deepEqual(r.clocks.map(c => [c.name, +c.mhz.toFixed(3)]), [['clk', 27], ['u/CLKOUT', 54], ['sub.o/OSCOUT', 25]]);
  assert.equal(r.sdc, 'create_clock -period 37.037000 [get_ports {clk}]\ncreate_clock -period 18.518519 [get_pins {u/CLKOUT}]\ncreate_clock -period 40.000000 [get_pins {sub.o/OSCOUT}]\n');
  assert.deepEqual(gowinClocks(netlist, 'top', 'GW1N-9C').clocks.length, 2);
  assert.deepEqual(gowinClocks({ modules: { top: { cells: {} } } }, 'top', 'GW1N-9C'), { clocks: [], sdc: '' });
});

test('nextpnr\'s report read back: a clock it constrained, by its net (or its input buffer\'s), at its constraint; another with none', () => {
  const r = { fmax: { clk_IBUF_I_O: { achieved: 250.123, constraint: 27 }, fast: { achieved: 245.5, constraint: 54.0015 }, x: { achieved: 200, constraint: 12 }, y: { achieved: 100, constraint: 30 } } };
  const lines = ['Info: constraining clock net \'clk\' to 27.00 MHz', 'Info: constraining clock net \'fast\' to 54.00 MHz', 'Info: Derived frequency constraint of 30.0 MHz for net y'];
  assert.deepEqual(gowinFmax(r, lines), [{ clock: 'clk', achieved: 250.12, constraint: 27 }, { clock: 'fast', achieved: 245.5, constraint: 54 },
    { clock: 'x', achieved: 200, constraint: null }, { clock: 'y', achieved: 100, constraint: 30 }]);
  assert.deepEqual(gowinFmax({}, []), []);
});

const gowin = nextpnrGowinNode();
async function build(top, text, cst) {
  const log = [], files = {};
  const io = { log: l => log.push(l), sources: () => [{ path: `${top}.v`, lang: 'verilog', text }], ucf: cst, ucfName: `${top}.cst`,
    yosys: yosysNode, nextpnr: { gowin }, write: (n, x) => { files[n] = x; return `build/${n}`; }, read: n => files[n] ?? null, save: () => {} };
  const r = await runFlow({ top, family: 'gowin', device: 'gw1nr-9c', pkg: 'qn88', speed: '-6', steps: ['synth', 'translate', 'par'] }, io);
  return { r, log };
}
const PORTS = '.RESET(1\'b0), .RESET_P(1\'b0), .CLKFB(1\'b0), .FBDSEL(6\'b0), .IDSEL(6\'b0), .ODSEL(6\'b0), .PSDA(4\'b0), .DUTYDA(4\'b0), .FDLY(4\'b0)';
const PINS = 'IO_LOC "clk" 52;\nIO_LOC "led[0]" 10;\nIO_LOC "led[1]" 11;\n';
const warnings = log => log.filter(l => /warning/i.test(l));

test('a PLL clock faster than the design runs: checked at its own frequency (378 MHz), not the input\'s 27 MHz; not met, warned (#2300: no failure)', { timeout: 300000 }, async () => {
  const text = `module fastpll(input clk, output reg [1:0] led);\n  wire fast, lock;\n  rPLL #(.FCLKIN("27"), .IDIV_SEL(0), .FBDIV_SEL(13), .ODIV_SEL(2), .DEVICE("GW1NR-9C")) u (.CLKIN(clk), .CLKOUT(fast), .LOCK(lock), ${PORTS});\n`
    + '  reg [31:0] c = 0;\n  always @(posedge fast) begin c <= c + 1; led <= {lock, c[31]}; end\nendmodule\n';
  const { r, log } = await build('fastpll', text, `${PINS}// create_clock -name clk -period 37.037 [get_ports {clk}]\n`);
  // (placed and routed again, allowed to fail: nextpnr's own warning, its period in picoseconds: 378.07 MHz; the Design Summary's
  // timing not met)
  assert.ok(r.ok, r.error);
  assert.deepEqual(log.filter(l => /ERROR/.test(l)), []);
  assert.deepEqual(warnings(log).map(l => l.replace(/[\d.]+ MHz \(/, 'N MHz (')), ['WARNING:Place - Max frequency for clock \'fast\': N MHz (FAIL at 378.07 MHz)']);
  assert.deepEqual([r.report.timing.met, r.report.timing.constraints.map(c => [c.name, c.timingErrors])], [false, [['clock fast', 1]]]);
});

test('no clock in the CST: the design\'s clock reported with no constraint (not nextpnr\'s 12 MHz); no warnings', { timeout: 300000 }, async () => {
  const text = 'module free(input clk, output reg [1:0] led);\n  reg [24:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[24:23]; end\nendmodule\n';
  const { r, log } = await build('free', text, PINS);
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.report.par.fmax.map(f => [f.clock, f.constraint]), [['clk', null]]);
  assert.equal(r.report.par.constraintsMet, true);
  assert.match(log.find(l => /^Clock /.test(l)), /^Clock clk: [\d.]+ MHz \(no constraint\)$/);
  assert.deepEqual(warnings(log), []);
});
