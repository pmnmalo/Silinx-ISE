// The Gowin's back end (#2303): its constraints (CST), its synthesis's resources, and a design from HDL to its routed design
// through runFlow with YoWASP's nextpnr-himbaechel-gowin and Silinx's gowin_pack (test/gowin-pack.test.js: Apicula's .fs), every port
// on a pin
import test from 'node:test';
import assert from 'node:assert/strict';
import { runFlow, backendOf, familyOfPart, familyName, deviceFamily, constraintsFormatOf, constraintsExtOf, bitstreamExtOf, openOnlyDevice, CST, GOWIN_DEVICES, nextpnrGowinNode, yosysNode } from '../packages/silinx-fpga/src/node.js';
import { readConstraints } from '../packages/silinx-fpga/src/constraints.js';
import { gowinUtilization, gowinDevice } from '../packages/silinx-fpga/src/open-flow-gowin.js';
import { orderSteps } from '../packages/silinx-fpga/src/open-steps.js';
import { gowinFsInfo, checkOpenBitstream, idHex } from '../core/open-bitstream.js';

const BLINKY = 'module blinky(input clk, output reg [1:0] led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23:22]; end\nendmodule\n';
const PINS = '// the Tang Nano 9K\'s clock and two of its LEDs\nIO_LOC "clk" 52;\nIO_PORT "clk" IO_TYPE=LVCMOS33;\nIO_LOC  "led[0]" 10;  // LED1\nIO_LOC "led[1]" 11; IO_PORT "led[1]" IO_TYPE=LVCMOS18 PULL_MODE=NONE DRIVE=8;\n'
  + '// create_clock -name clk -period 37.037 [get_ports {clk}]\n';

test('CST: IO_LOC, IO_PORT (its attributes) and Silinx\'s clock comment read into the constraints\' model, and written back', () => {
  const m = readConstraints(CST, PINS, 'blinky.cst');
  assert.equal(m.format, 'cst');
  assert.deepEqual(m.assignments, { clk: { loc: '52', iostandard: 'LVCMOS33' }, 'led[0]': { loc: '10' }, 'led[1]': { loc: '11', iostandard: 'LVCMOS18', pull: null, drive: '8' } });
  assert.deepEqual(m.netStatements.map(s => s.net), ['clk', 'clk', 'led[0]', 'led[1]', 'led[1]']);
  assert.deepEqual(m.clocks, [{ net: 'clk', period: 37.037 }]);
  assert.deepEqual(m.other, []);
  assert.equal(CST.write(m), 'IO_LOC "clk" 52;\nIO_PORT "clk" IO_TYPE=LVCMOS33;\nIO_LOC "led[0]" 10;\nIO_LOC "led[1]" 11;\nIO_PORT "led[1]" IO_TYPE=LVCMOS18 PULL_MODE=NONE DRIVE=8;\n'
    + '// create_clock -name clk -period 37.037 [get_ports {clk}]\n');
  const again = readConstraints(CST, CST.write(m));
  assert.deepEqual([again.assignments, again.clocks], [m.assignments, m.clocks]);
  // a pull, an attribute of its own kept, IO_LOC's bank-pair suffix; another comment is a comment; nothing to write
  assert.deepEqual(CST.read('IO_PORT "a" PULL_MODE=UP OPEN_DRAIN=ON;\nIO_LOC "a" 3, 4;\n// a note\n').assignments, { a: { pull: 'up', cst: { OPEN_DRAIN: 'ON' }, loc: '3' } });
  assert.equal(CST.write({ assignments: {} }), '');
  assert.equal(CST.comment, '//');
});

test('CST: what nextpnr-himbaechel-gowin would not apply throws, naming its line', () => {
  assert.throws(() => CST.read('IO_LOC "a" 1;\nINS_LOC "x" R1C1;\n'), /^Error: line 2: INS_LOC: not a CST statement nextpnr-himbaechel-gowin applies \(IO_LOC, IO_PORT\)/);
  assert.throws(() => CST.read('IO_LOC a 1;'), /line 1: IO_LOC needs "<port>" and its pin/);
  assert.throws(() => CST.read('IO_PORT "a" PULL_MODE=SIDEWAYS;'), /PULL_MODE=SIDEWAYS: UP, DOWN, NONE or KEEPER/);
  assert.throws(() => CST.read('IO_PORT "a" DRIVE;'), /IO_PORT a: DRIVE is not KEY=VALUE/);
  // a statement with no keyword: its line named, not a TypeError (#3670)
  assert.throws(() => CST.read('IO_LOC "a" 1;\n"a" 1;'), /^Error: line 2: "a": not a CST statement nextpnr-himbaechel-gowin applies/);
});

test('#3663 CST: the same model as before, and in linear time on a long line (CodeQL js/polynomial-redos)', () => {
  // the model of PINS and of the other statements as the readers' regular expressions read it before
  const m = CST.read(PINS);
  assert.deepEqual(m.clocks, [{ net: 'clk', period: 37.037 }]);
  assert.deepEqual(CST.read('//create_clock -period 10 [get_ports clk] ;  \nIO_LOC "a" 3;// x\nIO_PORT "a"   PULL_MODE=UP;').assignments, { a: { loc: '3', pull: 'up' } });
  assert.deepEqual(CST.read('//create_clock -period 10 [get_ports clk];').clocks, [{ net: 'clk', period: 10 }]);
  // (a lone carriage return in a comment: the rest of the line is the comment's)
  assert.deepEqual(CST.read('IO_LOC "a" 1; // x\rIO_LOC "b" 2;').assignments, { a: { loc: '1' } });
  const n = 100000, slow = [];
  for (const [text, expect] of [
    [`//create_clock -period 1 [get_ports a]${' '.repeat(n)}x`, null],
    [`${'//'.repeat(n)} `, null],
    [`IO_LOC${' '.repeat(n)}x y;`, /IO_LOC needs "<port>" and its pin/],
    [`IO_PORT "a"${' '.repeat(n)}x y;`, /IO_PORT a: x is not KEY=VALUE/],
  ]) {
    const t0 = performance.now();
    if (expect) assert.throws(() => CST.read(text), expect); else assert.deepEqual(CST.read(text).assignments, {});
    if (performance.now() - t0 > 500) slow.push(`${JSON.stringify(text.slice(0, 12))}…: ${Math.round(performance.now() - t0)} ms`);
  }
  assert.deepEqual(slow, []);
});

test('the Gowin family: its part, its formats, its back end\'s steps and constraints, its synthesis\'s resources', () => {
  for (const p of ['gw1nr-9c', 'GW1NR-9C', 'gw1n-1']) assert.equal(familyOfPart(p), 'gowin', p);
  const d = { part: 'gw1nr-9c' };
  assert.equal(deviceFamily(d), 'gowin');
  assert.equal(familyName('gowin'), 'Gowin GW1N');
  assert.deepEqual([openOnlyDevice(d), constraintsFormatOf(d), constraintsExtOf(d), bitstreamExtOf(d)], [true, 'cst', '.cst', '.fs']);
  assert.deepEqual(GOWIN_DEVICES, { 'gw1nr-9c/qn88-6': { device: 'GW1NR-LV9QN88PC6/I5', family: 'GW1N-9C' } });
  assert.deepEqual(gowinDevice({ device: 'gw1nr-9c', pkg: 'qn88', speed: '-6' }), GOWIN_DEVICES['gw1nr-9c/qn88-6']);
  assert.equal(gowinDevice({ device: 'gw1nr-9c', pkg: 'qn48', speed: '-6' }), null);
  const b = backendOf('gowin');
  assert.equal(b.id, 'gowin');
  assert.equal(b.constraints, CST);
  assert.deepEqual(b.steps.map(s => [s.id, s.label]), [['synth', 'Synthesize - Yosys'], ['translate', 'Translate'], ['par', 'Place & Route - nextpnr'], ['trce', 'Generate Post-Place & Route Static Timing'], ['bitgen', 'Generate Programming File - gowin_pack']]);
  assert.throws(() => orderSteps(b.steps, ['xpwr']), /no step xpwr/);
  assert.deepEqual(gowinUtilization({ LUT1: 1, LUT2: 2, LUT4: 3, DFF: 4, DFFE: 1, ALU: 9, MUX2_LUT5: 2, RAM16SDP4: 1, SDPB: 1, pROM: 1, MULT18X18: 1, IBUF: 2, OBUF: 3, rPLL: 1, GND: 1, VCC: 1 }),
    { luts: 6, flipFlops: 5, latches: 0, ios: 5, carry: 9, muxes: 2, distributedRam: 1, blockRam: 2, multipliers: 1, clockBuffers: 0, dcms: 1, cells: 34 });
  assert.equal(b.synthName('luts'), 'Number of LUT4s');
});

const gowin = nextpnrGowinNode();
function memoryIo(cst, extra = {}) {
  const log = [], files = {};
  return { log, files, io: { log: l => log.push(l), sources: () => [{ path: 'blinky.v', lang: 'verilog', text: BLINKY }], ucf: cst, ucfName: cst ? 'blinky.cst' : null,
    yosys: yosysNode, nextpnr: { gowin }, write: (n, d) => { files[n] = d; return `build/${n}`; }, read: n => files[n] ?? null, save: () => {}, ...extra } };
}
const SPEC = { top: 'blinky', family: 'gowin', device: 'gw1nr-9c', pkg: 'qn88', speed: '-6', steps: ['synth', 'translate', 'par', 'bitgen'] };
const warnings = log => log.filter(l => /^WARNING/.test(l));

test('a design from HDL to its routed design: synth_gowin, nextpnr-himbaechel-gowin at the CST\'s pins and its clock; gowin_pack\'s .fs', async () => {
  const { log, files, io } = memoryIo(PINS);
  const r = await runFlow(SPEC, io);
  assert.ok(r.ok, r.error);
  assert.deepEqual(warnings(log), []);
  assert.deepEqual(log.filter(l => /^=== SILINX STEP/.test(l)), ['synth', 'translate', 'par', 'bitgen'].map(s => `=== SILINX STEP ${s} ===`));
  assert.ok(log.includes('Netlist of <blinky> read; constraints: blinky.cst, 3 pin location(s), 1 PERIOD constraint(s).'));
  assert.deepEqual(r.report.synthesis.utilization.map(u => u.name), ['Number of LUT4s', 'Number of flip-flops', 'Number of carry cells', 'Number of IOBs']);
  const map = Object.fromEntries(r.report.map.utilization.map(u => [u.name, [u.used, u.total]]));
  assert.deepEqual([map.DFF, map.IOB[0], map.LUT4[1]], [[26, 6480], 3, 8640]);
  // its clock from the CST's comment, by its port's name
  assert.deepEqual(r.report.par.fmax.map(f => [f.clock, f.constraint]), [['clk', 27]]);
  assert.ok(r.report.par.constraintsMet);
  const routed = JSON.parse(files['open/routed.json']);
  assert.ok(Object.values(routed.modules).some(m => Object.keys(m.cells || {}).length > 20), 'nextpnr\'s routed netlist');
  // the .fs: Gowin's text bitstream, the GW1N-9C's size
  const fsText = new TextDecoder().decode(files['blinky.fs']);
  assert.deepEqual([r.report.bit.size, fsText.length], [2069320, 2069320]);
  assert.ok(fsText.split('\n').slice(0, -1).every(l => /^[01]+$/.test(l)));
  // (as the board's programming reads it, #2298: its IDCODE the GW1NR-9C's)
  const fsInfo = gowinFsInfo(fsText);
  assert.deepEqual([idHex(fsInfo.idcode), fsInfo.frames, checkOpenBitstream('gowin', fsInfo, { part: 'gw1nr-9c' })], ['0x1100481b', 728, null]);
  assert.ok(log.some(l => /^Bitstream: build\/blinky\.fs \(2069320 bytes, gowin_pack in [\d.]+ m?s\)$/.test(l)), log.join('\n'));
  // (the next run: the bitstream alone, of the routed design written by this one: the same)
  const next = memoryIo(PINS);
  Object.assign(next.files, { 'open/routed.json': files['open/routed.json'] });
  assert.ok((await runFlow({ ...SPEC, steps: ['bitgen'] }, next.io)).ok);
  assert.deepEqual(next.files['blinky.fs'], files['blinky.fs']);
  const none = memoryIo(PINS);
  assert.match((await runFlow({ ...SPEC, steps: ['bitgen'] }, none.io)).error, /^no routed design: run Place & Route first/);
});

test('the Gowin without pins: refused before nextpnr, the ports named (nextpnr-himbaechel-gowin places none)', async () => {
  for (const cst of [null, 'IO_LOC "clk" 52;\n']) {
    const { io, log } = memoryIo(cst);
    const r = await runFlow(SPEC, io);
    assert.equal(r.ok, false);
    const ports = cst ? 'led[0], led[1]' : 'clk, led[0], led[1]';
    assert.equal(r.error, `${cst ? 2 : 3} port(s) with no pin (IO_LOC in the CST): ${ports}: nextpnr-himbaechel-gowin places no port without one`);
    assert.ok(log.includes('Assign them in I/O Pin Planning.'));
  }
});

test('the Gowin\'s errors: a device nextpnr is not given here, a pin it does not have, no nextpnr, a CST it cannot read', async () => {
  const fail = async (spec, io) => { const r = await runFlow({ ...SPEC, ...spec }, io); assert.equal(r.ok, false); return r.error; };
  assert.match(await fail({ pkg: 'qn48' }, memoryIo(PINS).io), /^gw1nr-9c-qn48-6: not a Gowin device of nextpnr-himbaechel-gowin here \(gw1nr-9c\/qn88-6\)$/);
  const bad = memoryIo('IO_LOC "clk" 999;\nIO_LOC "led[0]" 10;\nIO_LOC "led[1]" 11;\n');
  assert.match(await fail({}, bad.io), /^nextpnr-himbaechel-gowin failed: nextpnr exited with code 1/);
  const none = memoryIo(PINS, { nextpnr: {} });
  assert.match(await fail({}, none.io), /^nextpnr-himbaechel-gowin is not in this installation/);
  assert.ok(none.log.includes('Install it: npm install @yowasp/nextpnr-himbaechel-gowin'));
  assert.match(await fail({}, memoryIo('INS_LOC "x" R1C1;\n').io), /^the constraints cannot be read: line 1: INS_LOC: not a CST statement/);
});
