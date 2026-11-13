// The ECP5's back end (#2302): its constraints (LPF), its synthesis's resources, and a design from HDL to its bitstream
// through runFlow with YoWASP's nextpnr-ecp5 and ecppack; the bitstream read back by ecpunpack and packed again, the same
import test from 'node:test';
import assert from 'node:assert/strict';
import { runFlow, backendOf, familyOfPart, familyName, deviceFamily, constraintsFormatOf, constraintsExtOf, bitstreamExtOf, openOnlyDevice, LPF, ECP5_PARTS, nextpnrEcp5Node, yosysNode } from '../packages/silinx-fpga/src/node.js';
import { readConstraints } from '../packages/silinx-fpga/src/constraints.js';
import { ecp5Utilization } from '../packages/silinx-fpga/src/open-flow-ecp5.js';
import { orderSteps } from '../packages/silinx-fpga/src/open-steps.js';
import { ecp5BitInfo, checkOpenBitstream, idHex } from '../core/open-bitstream.js';

const BLINKY = 'module blinky(input clk, output reg [1:0] led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23:22]; end\nendmodule\n';
const PINS = '# the ULX3S\'s clock and two of its LEDs\nBLOCK RESETPATHS;\nLOCATE COMP "clk" SITE "G2";\nIOBUF PORT "clk" IO_TYPE=LVCMOS33;\nFREQUENCY PORT "clk" 25 MHZ;\n'
  + 'LOCATE COMP "led[0]" SITE "B2";   // D0\nLOCATE COMP "led[1]"\n  SITE "C2";\nIOBUF PORT "led[1]" PULLMODE=NONE DRIVE=4 SLEWRATE=SLOW;\n';

test('LPF: LOCATE, IOBUF (its attributes) and FREQUENCY read into the constraints\' model, the board\'s statements kept; written back', () => {
  const m = readConstraints(LPF, PINS, 'blinky.lpf');
  assert.equal(m.format, 'lpf');
  assert.equal(m.name, 'blinky.lpf');
  assert.deepEqual(m.assignments, { clk: { loc: 'G2', iostandard: 'LVCMOS33' }, 'led[0]': { loc: 'B2' }, 'led[1]': { loc: 'C2', pull: null, drive: '4', slew: 'SLOW' } });
  assert.deepEqual(m.netStatements.map(s => s.net), ['clk', 'clk', 'led[0]', 'led[1]', 'led[1]']);
  assert.deepEqual(m.clocks, [{ net: 'clk', period: 40 }]);
  assert.deepEqual(m.other, ['BLOCK RESETPATHS;']);
  assert.deepEqual(m.forPorts(['clk']).assignments.clk, { loc: 'G2', iostandard: 'LVCMOS33' });
  assert.equal(LPF.write(m), 'BLOCK RESETPATHS;\nLOCATE COMP "clk" SITE "G2";\nIOBUF PORT "clk" IO_TYPE=LVCMOS33;\nLOCATE COMP "led[0]" SITE "B2";\n'
    + 'LOCATE COMP "led[1]" SITE "C2";\nIOBUF PORT "led[1]" PULLMODE=NONE DRIVE=4 SLEWRATE=SLOW;\nFREQUENCY PORT "clk" 25 MHZ;\n');
  // (written, read again: the same model)
  const again = readConstraints(LPF, LPF.write(m));
  assert.deepEqual([again.assignments, again.clocks, again.other], [m.assignments, m.clocks, m.other]);
  // the pulls, an attribute of nextpnr's own kept, FREQUENCY NET and in kHz; the last LOCATE of a port wins; nothing to write
  assert.deepEqual(LPF.read('IOBUF PORT "a" PULLMODE=UP OPENDRAIN=ON;\nIOBUF PORT "b" PULLMODE=down;\nLOCATE COMP "a" SITE "A1";\nLOCATE COMP "a" SITE "A2";\n').assignments,
    { a: { pull: 'up', lpf: { OPENDRAIN: 'ON' }, loc: 'A2' }, b: { pull: 'down' } });
  assert.equal(LPF.write({ assignments: { a: { pull: 'up', lpf: { OPENDRAIN: 'ON' } } } }), 'IOBUF PORT "a" PULLMODE=UP OPENDRAIN=ON;\n');
  assert.deepEqual(LPF.read('FREQUENCY NET "c" 12000 KHZ;').clocks, [{ net: 'c', period: 83.333333 }]);
  assert.equal(LPF.write({ assignments: {} }), '');
  assert.equal(readConstraints(LPF, ''), null);
});

test('LPF: what nextpnr-ecp5 would not apply throws, naming its line', () => {
  assert.throws(() => LPF.read('LOCATE COMP "a" SITE "A1";\nUGROUP "g" BLKNAME x;\n'), /^Error: line 2: UGROUP: not an LPF statement nextpnr-ecp5 applies \(LOCATE, IOBUF, FREQUENCY, BLOCK, SYSCONFIG\)/);
  assert.throws(() => LPF.read('LOCATE COMP "a" SITE "A1"'), /line 1: LOCATE: no ';' at its end/);
  assert.throws(() => LPF.read('\nLOCATE COMP a SITE "A1";'), /line 2: LOCATE needs COMP "<port>" SITE "<pin>"/);
  assert.throws(() => LPF.read('IOBUF PORT "a" PULLMODE=SIDEWAYS;'), /line 1: PULLMODE=SIDEWAYS: UP, DOWN, NONE or KEEPER/);
  assert.throws(() => LPF.read('IOBUF PORT "a" DRIVE;'), /line 1: IOBUF a: DRIVE is not KEY=VALUE/);
  assert.throws(() => LPF.read('IOBUF "a" DRIVE=4;'), /IOBUF needs PORT "<port>" and its attributes/);
  assert.throws(() => LPF.read('FREQUENCY PORT "clk" fast;'), /line 1: FREQUENCY needs PORT "<port>" \(or NET\) and its frequency: 25 MHZ/);
  // a statement with no keyword: its line named, not a TypeError (#3670)
  assert.throws(() => LPF.read('BLOCK RESETPATHS;\n"a";'), /^Error: line 2: "a": not an LPF statement nextpnr-ecp5 applies/);
});

test('#3663 LPF: the same model as before, and in linear time on a long line (CodeQL js/polynomial-redos)', () => {
  assert.deepEqual(LPF.read('LOCATE COMP "a" SITE "A1"; # x ; y\nIOBUF PORT "a" PULLMODE=UP; // z;').assignments, { a: { loc: 'A1', pull: 'up' } });
  const n = 100000;
  for (const text of [`${'#'.repeat(n)} `, `${'//'.repeat(n)}\r`]) {
    const t0 = performance.now();
    assert.deepEqual(LPF.read(text).assignments, {});
    assert.ok(performance.now() - t0 < 500, `${JSON.stringify(text.slice(0, 4))}…: ${Math.round(performance.now() - t0)} ms`);
  }
});

test('the ECP5 family: its parts, its formats, its back end\'s steps and constraints, its synthesis\'s resources', () => {
  for (const p of ['lfe5u-85f', 'LFE5U-25F', 'lfe5um-45f', 'lfe5um5g-85f']) assert.equal(familyOfPart(p), 'ecp5', p);
  assert.equal(familyOfPart('lfe3-35ea'), null);
  const d = { part: 'lfe5u-85f' };
  assert.equal(deviceFamily(d), 'ecp5');
  assert.equal(familyName('ecp5'), 'ECP5');
  assert.deepEqual([openOnlyDevice(d), constraintsFormatOf(d), constraintsExtOf(d), bitstreamExtOf(d)], [true, 'lpf', '.lpf', '.bit']);
  // the others' as before (#2295, #3142)
  assert.deepEqual([constraintsExtOf({ part: 'ice40up5k' }), bitstreamExtOf({ part: 'ice40up5k' }), constraintsExtOf({ part: 'xc3s250e' }), bitstreamExtOf({ part: 'xc3s250e' }), constraintsExtOf({ part: 'xc7a35t' })],
    ['.pcf', '.bin', '.ucf', '.bit', '.xdc']);
  assert.deepEqual(Object.values(ECP5_PARTS), ['12k', '25k', '45k', '85k', 'um-25k', 'um-45k', 'um-85k', 'um5g-25k', 'um5g-45k', 'um5g-85k']);
  const b = backendOf('ecp5');
  assert.equal(b.id, 'ecp5');
  assert.equal(b.constraints, LPF);
  assert.deepEqual(b.steps.map(s => [s.id, s.label]), [['synth', 'Synthesize - Yosys'], ['translate', 'Translate'], ['par', 'Place & Route - nextpnr'], ['trce', 'Generate Post-Place & Route Static Timing'], ['bitgen', 'Generate Programming File - ecppack']]);
  assert.deepEqual(orderSteps(b.steps, ['bitgen']), ['synth', 'translate', 'par', 'bitgen']);
  assert.throws(() => orderSteps(b.steps, ['xpwr']), /no step xpwr/);
  assert.deepEqual(ecp5Utilization({ LUT4: 24, TRELLIS_FF: 26, CCU2C: 12, PFUMX: 2, L6MUX21: 1, TRELLIS_DPR16X4: 3, DP16KD: 1, PDPW16KD: 1, MULT18X18D: 2, DCCA: 1, EHXPLLL: 1, TRELLIS_IO: 4 }),
    { luts: 24, flipFlops: 26, latches: 0, ios: 4, carry: 12, muxes: 3, distributedRam: 3, blockRam: 2, multipliers: 2, clockBuffers: 1, dcms: 1, cells: 78 });
  assert.equal(b.synthName('luts'), 'Number of LUT4s');
  assert.equal(b.synthName('ebr', { report: 'Number of DP16KDs' }), 'Number of DP16KDs');
});

const ecp5 = nextpnrEcp5Node();
function memoryIo(lpf, extra = {}) {
  const log = [], files = {};
  return { log, files, io: { log: l => log.push(l), sources: () => [{ path: 'blinky.v', lang: 'verilog', text: BLINKY }], ucf: lpf, ucfName: lpf ? 'blinky.lpf' : null,
    yosys: yosysNode, nextpnr: { ecp5 }, write: (n, d) => { files[n] = d; return `build/${n}`; }, read: n => files[n] ?? null, save: () => {}, ...extra } };
}
const SPEC = { top: 'blinky', family: 'ecp5', device: 'lfe5u-85f', pkg: 'cabga381', speed: '-6', steps: ['synth', 'translate', 'par', 'bitgen'] };
const warnings = log => log.filter(l => /^WARNING/.test(l));
const SIZE_85F = 1927725;

test('a design from HDL to its bitstream: synth_ecp5, nextpnr-ecp5 at the LPF\'s pins, ecppack; read back by ecpunpack', async () => {
  const { log, files, io } = memoryIo(PINS);
  const r = await runFlow(SPEC, io);
  assert.ok(r.ok, r.error);
  assert.deepEqual(warnings(log), []);
  assert.deepEqual(log.filter(l => /^=== SILINX STEP/.test(l)), ['synth', 'translate', 'par', 'bitgen'].map(s => `=== SILINX STEP ${s} ===`));
  assert.ok(log.includes('Netlist of <blinky> read; constraints: blinky.lpf, 3 pin location(s), 1 PERIOD constraint(s).'));
  assert.deepEqual(r.report.synthesis.utilization.map(u => [u.name, u.used]), [['Number of LUT4s', 1], ['Number of flip-flops', 26], ['Number of carry cells', 12]]);
  assert.deepEqual(r.report.map.utilization.map(u => [u.name, u.used, u.total]), [['DCCA', 1, 56], ['TRELLIS_COMB', 31, 83640], ['TRELLIS_FF', 26, 83640], ['TRELLIS_IO', 3, 365]]);
  // (the clock by its port's name, not nextpnr's global net's)
  assert.deepEqual(r.report.par.fmax.map(f => [f.clock, f.constraint]), [['clk', 25]]);
  assert.ok(r.report.par.fmax[0].achieved > 25 && r.report.par.constraintsMet);
  assert.ok(log.some(l => /^Clock clk: [\d.]+ MHz \(met, 25 MHz asked\)$/.test(l)));
  // the 85F's bitstream: its size, its preamble (Lattice's: no Xilinx header)
  const bit = files['blinky.bit'];
  assert.equal(r.report.bit.size, SIZE_85F);
  assert.equal(bit.length, SIZE_85F);
  assert.ok(Buffer.from(bit).includes(Buffer.from([0xff, 0xff, 0xbd, 0xb3])), 'the preamble');
  // (as the board's programming reads it, #2298: its part and IDCODE the 85F's)
  const bitInfo = ecp5BitInfo(bit);
  assert.deepEqual([bitInfo.part, idHex(bitInfo.idcode), checkOpenBitstream('ecp5', bitInfo, { part: 'lfe5u-85f' })], ['LFE5U-85F-6CABGA381', '0x41113043', null]);
  assert.equal(log.at(-2), `Bitstream: build/blinky.bit (${SIZE_85F} bytes, ecppack)`);
  // ecpunpack, then ecppack again: the same bytes (the bitstream is one Project Trellis reads back as a configuration)
  const { runEcpunpack, runEcppack } = await import('@yowasp/nextpnr-ecp5');
  const quiet = { stdout: () => {}, stderr: () => {}, fetchProgress: () => {}, decodeASCII: false };
  const unpacked = (await runEcpunpack(['design.bit', 'design.config'], { 'design.bit': bit }, quiet))['design.config'];
  assert.match(new TextDecoder().decode(unpacked), /^\.device LFE5U-85F\n/);
  const again = (await runEcppack(['design.config', 'again.bit'], { 'design.config': unpacked }, quiet))['again.bit'];
  assert.ok(Buffer.from(again).equals(Buffer.from(bit)), 'ecppack of ecpunpack: the same bitstream');
  assert.match(files['open/routed.config'], /^\.device LFE5U-85F\n/);
});

test('the ECP5 without pins: each port warned, nextpnr places it; a bitstream from an earlier run\'s routed design', async () => {
  const { log, files, io } = memoryIo(null);
  const r = await runFlow({ ...SPEC, steps: ['synth', 'translate', 'par'] }, io);
  assert.ok(r.ok, r.error);
  // (no LPF at all: nextpnr-ecp5 says nothing of them, Silinx does)
  assert.deepEqual(warnings(log), [
    'WARNING:Place - the port clk has no pin (LOCATE in the LPF): nextpnr places it anywhere.',
    'WARNING:Place - the port led[0] has no pin (LOCATE in the LPF): nextpnr places it anywhere.',
    'WARNING:Place - the port led[1] has no pin (LOCATE in the LPF): nextpnr places it anywhere.',
  ]);
  assert.ok(log.includes('Netlist of <blinky> read; constraints: none.'));
  assert.equal(files['blinky.bit'], undefined);
  // (no FREQUENCY: nextpnr's default, 12 MHz, asked)
  assert.deepEqual(r.report.par.fmax.map(f => [f.clock, f.constraint]), [['clk', 12]]);
  // (the next run: the bitstream alone, of the routed design written by this one)
  const next = memoryIo(null);
  Object.assign(next.files, files);
  const r2 = await runFlow({ ...SPEC, steps: ['bitgen'] }, next.io);
  assert.ok(r2.ok, r2.error);
  assert.equal(next.files['blinky.bit'].length, SIZE_85F);
});

test('the other sizes: the 25F\'s bitstream, its speed grade 8', async () => {
  const { log, files, io } = memoryIo(PINS);
  const r = await runFlow({ ...SPEC, device: 'lfe5u-25f', speed: '-8' }, io);
  assert.ok(r.ok, r.error);
  assert.deepEqual(warnings(log), []);
  assert.deepEqual(r.report.map.utilization.find(u => u.name === 'TRELLIS_COMB').total, 24288);
  assert.ok(files['blinky.bit'].length > 500000 && files['blinky.bit'].length < SIZE_85F, String(files['blinky.bit'].length));
});

test('the ECP5\'s errors: a part nextpnr-ecp5 does not have, a pin it does not have, no nextpnr, no routed design, an LPF it cannot read', async () => {
  const fail = async (spec, io) => { const r = await runFlow({ ...SPEC, ...spec }, io); assert.equal(r.ok, false); return r.error; };
  assert.match(await fail({ device: 'lfe5u-99f' }, memoryIo(PINS).io), /^lfe5u-99f: not an ECP5 part of nextpnr-ecp5 \(lfe5u-12f, lfe5u-25f, .*lfe5um5g-85f\)/);
  const bad = memoryIo('LOCATE COMP "clk" SITE "ZZ99";\n');
  assert.match(await fail({}, bad.io), /^nextpnr-ecp5 failed: nextpnr exited with code 1/);
  assert.ok(bad.log.some(l => /^ {2}ERROR: .*ZZ99/.test(l)), 'nextpnr\'s error in the log');
  const none = memoryIo(PINS, { nextpnr: {} });
  assert.match(await fail({}, none.io), /^nextpnr-ecp5 is not in this installation/);
  assert.ok(none.log.includes('Install it: npm install @yowasp/nextpnr-ecp5'));
  assert.match(await fail({ steps: ['bitgen'] }, memoryIo(PINS).io), /^no routed design: run Place & Route first/);
  assert.match(await fail({}, memoryIo('UGROUP "g" BLKNAME x;\n').io), /^the constraints cannot be read: line 1: UGROUP: not an LPF statement/);
});
