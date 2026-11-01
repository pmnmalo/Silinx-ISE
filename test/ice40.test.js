// The iCE40's back end (#2295): its constraints (PCF), its synthesis's resources, and a design from HDL to its bitstream
// through runFlow with YoWASP's nextpnr-ice40 and icepack; the bitstream read back by iceunpack, an independent tool
import test from 'node:test';
import assert from 'node:assert/strict';
import { runFlow, backendOf, familyOfPart, familyName, deviceFamily, PCF, ICE40_PARTS, nextpnrIce40Node, yosysNode } from '../packages/silinx-fpga/src/node.js';
import { readConstraints } from '../packages/silinx-fpga/src/constraints.js';
import { ice40Utilization } from '../packages/silinx-fpga/src/open-flow-ice40.js';
import { orderSteps } from '../packages/silinx-fpga/src/open-steps.js';

const BLINKY = 'module blinky(input clk, output reg [1:0] led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23:22]; end\nendmodule\n';
const PINS = '# the iCEBreaker\'s clock and two of its LEDs\nset_io clk 35\nset_io led[0] 11\nset_io -nowarn led[1] 12   # (the second)\nset_frequency clk 12\n';

test('PCF: set_io (its options) and set_frequency read into the constraints\' model, and written back', () => {
  const m = readConstraints(PCF, `${PINS}set_io -pullup yes -pullup_resistor 10K btn 10\n`, 'blinky.pcf');
  assert.equal(m.format, 'pcf');
  assert.equal(m.name, 'blinky.pcf');
  assert.deepEqual(m.assignments, { clk: { loc: '35' }, 'led[0]': { loc: '11' }, 'led[1]': { nowarn: true, loc: '12' }, btn: { pull: 'up', pullupResistor: '10K', loc: '10' } });
  assert.deepEqual(m.netStatements.map(s => s.net), ['clk', 'led[0]', 'led[1]', 'btn']);
  assert.deepEqual(m.clocks, [{ net: 'clk', period: 83.333333 }]);
  assert.deepEqual(m.other, []);
  assert.deepEqual(m.forPorts(['clk']).assignments.clk, { loc: '35' });
  assert.equal(PCF.write(m), 'set_io clk 35\nset_io led[0] 11\nset_io -nowarn led[1] 12\nset_io -pullup yes -pullup_resistor 10K btn 10\nset_frequency clk 12\n');
  // (written, read again: the same model)
  const again = readConstraints(PCF, PCF.write(m));
  assert.deepEqual([again.assignments, again.clocks], [m.assignments, m.clocks]);
  // -pullup no, the last set_io of a port wins; nothing to write
  assert.deepEqual(PCF.read('set_io -pullup no a 1\nset_io a 2\n').assignments, { a: { pull: null, loc: '2' } });
  assert.equal(PCF.write({ assignments: { a: { iostandard: 'LVCMOS33' } } }), '');
  assert.equal(readConstraints(PCF, ''), null);
});

test('PCF: what nextpnr-ice40 would not read throws, naming its line', () => {
  assert.throws(() => PCF.read('set_io a 1\nset_location x 1 2 3\n'), /^Error: line 2: set_location: not a PCF command/);
  assert.throws(() => PCF.read('set_io a'), /line 1: set_io needs a port and a pin/);
  assert.throws(() => PCF.read('set_io -pullup maybe a 1'), /line 1: -pullup maybe: yes or no/);
  assert.throws(() => PCF.read('set_io -pullup_resistor 1K a 1'), /-pullup_resistor 1K: 3P3K, 6P8K, 10K, 100K/);
  assert.throws(() => PCF.read('set_io -fast a 1'), /set_io: no option -fast/);
  assert.throws(() => PCF.read('set_frequency clk fast'), /line 1: set_frequency needs a net and its frequency in MHz/);
});

test('the iCE40 family: its parts, its back end\'s steps and constraints, its synthesis\'s resources', () => {
  for (const p of ['ice40up5k', 'iCE40HX8K', 'ice40lp1k']) assert.equal(familyOfPart(p), 'ice40');
  assert.equal(deviceFamily({ part: 'ice40up5k' }), 'ice40');
  assert.equal(familyName('ice40'), 'iCE40');
  assert.ok(ICE40_PARTS.includes('up5k') && ICE40_PARTS.includes('hx8k'));
  const b = backendOf('ice40');
  assert.equal(b.id, 'ice40');
  assert.equal(b.constraints, PCF);
  assert.deepEqual(b.steps.map(s => s.id), ['synth', 'translate', 'par', 'bitgen']);
  assert.deepEqual(orderSteps(b.steps, ['bitgen']), ['synth', 'translate', 'par', 'bitgen']);
  assert.throws(() => orderSteps(b.steps, ['map']), /no step map/);
  assert.deepEqual(ice40Utilization({ SB_LUT4: 24, SB_DFF: 2, SB_DFFE: 3, SB_CARRY: 22, SB_RAM40_4K: 1, SB_MAC16: 1, SB_GB: 1, SB_PLL40_CORE: 1, SB_IO: 2 }),
    { luts: 24, flipFlops: 5, latches: 0, ios: 2, carry: 22, blockRam: 1, multipliers: 1, clockBuffers: 1, dcms: 1, cells: 57 });
  assert.equal(b.synthName('ramb16'), 'Number of RAM4Ks');
  assert.equal(b.synthName('luts', { report: 'Logic cells' }), 'Logic cells');
});

const ice40 = nextpnrIce40Node();
function memoryIo(ucf, extra = {}) {
  const log = [], files = {};
  return { log, files, io: { log: l => log.push(l), sources: () => [{ path: 'blinky.v', lang: 'verilog', text: BLINKY }], ucf, ucfName: ucf ? 'blinky.pcf' : null,
    yosys: yosysNode, nextpnr: { ice40 }, write: (n, d) => { files[n] = d; return `build/${n}`; }, read: n => files[n] ?? null, save: () => {}, ...extra } };
}
const SPEC = { top: 'blinky', family: 'ice40', device: 'ice40up5k', pkg: 'sg48', steps: ['synth', 'translate', 'par', 'bitgen'] };
const warnings = log => log.filter(l => /^WARNING/.test(l));

test('a design from HDL to its bitstream: synth_ice40, nextpnr-ice40 at the PCF\'s pins, icepack; read back by iceunpack', async () => {
  const { log, files, io } = memoryIo(PINS);
  const r = await runFlow(SPEC, io);
  assert.ok(r.ok, r.error);
  assert.deepEqual(warnings(log), []);
  assert.deepEqual(log.filter(l => /^=== SILINX STEP/.test(l)), ['synth', 'translate', 'par', 'bitgen'].map(s => `=== SILINX STEP ${s} ===`));
  assert.ok(log.includes('Netlist of <blinky> read; constraints: blinky.pcf, 3 pin location(s), 1 PERIOD constraint(s).'));
  assert.deepEqual(r.report.synthesis.utilization.map(u => [u.name, u.used]), [['Number of LUT4s', 24], ['Number of flip-flops', 26], ['Number of carry cells', 22]]);
  assert.deepEqual(r.report.map.utilization.map(u => [u.name, u.used, u.total]), [['ICESTORM_LC', 29, 5280], ['SB_GB', 1, 8], ['SB_IO', 3, 39]]);
  assert.equal(r.report.par.fmax.length, 1);
  assert.equal(r.report.par.fmax[0].constraint, 12);
  assert.ok(r.report.par.fmax[0].achieved > 12 && r.report.par.constraintsMet);
  // the UP5K's bitstream: its size, its sync word
  const bin = files['blinky.bin'];
  assert.equal(r.report.bit.size, 104090);
  assert.equal(bin.length, 104090);
  assert.ok(Buffer.from(bin).includes(Buffer.from([0x7e, 0xaa, 0x99, 0x7e])));
  assert.equal(log.at(-2), 'Bitstream: build/blinky.bin (104090 bytes, icepack)');
  // iceunpack: the bitstream is the routed design's configuration, tile by tile
  const { runIceunpack } = await import('@yowasp/nextpnr-ice40');
  const out = await runIceunpack(['design.bin', 'design.asc'], { 'design.bin': bin }, { stdout: () => {}, stderr: () => {}, fetchProgress: () => {} });
  const tiles = asc => asc.split(/\n(?=\.)/).filter(s => /^\.(io|logic|ramb|ramt)_tile /.test(s) && /1/.test(s.split('\n').slice(1).join(''))).map(s => s.trim()).sort();
  const routed = tiles(files['open/routed.asc']);
  assert.ok(routed.length > 10);
  assert.deepEqual(tiles(out['design.asc']), routed);
});

test('the iCE40 without pins: each port warned, nextpnr places it; a bitstream from an earlier run\'s routed design', async () => {
  const { log, files, io } = memoryIo(null);
  const r = await runFlow({ ...SPEC, steps: ['synth', 'translate', 'par'] }, io);
  assert.ok(r.ok, r.error);
  assert.deepEqual(warnings(log), [
    'WARNING:Place - the port clk has no pin (set_io in the PCF): nextpnr places it anywhere.',
    'WARNING:Place - the port led[0] has no pin (set_io in the PCF): nextpnr places it anywhere.',
    'WARNING:Place - the port led[1] has no pin (set_io in the PCF): nextpnr places it anywhere.',
    'WARNING:Place - No PCF file specified; IO pins will be placed automatically',
  ]);
  assert.ok(log.includes('Netlist of <blinky> read; constraints: none.'));
  assert.equal(files['blinky.bin'], undefined);
  // (the next run: the bitstream alone, of the routed design written by this one)
  const next = memoryIo(null);
  Object.assign(next.files, files);
  const r2 = await runFlow({ ...SPEC, steps: ['bitgen'] }, next.io);
  assert.ok(r2.ok, r2.error);
  assert.equal(next.files['blinky.bin'].length, 104090);
});

test('the iCE40\'s errors: a part nextpnr-ice40 does not have, a pin it does not have, no nextpnr, no routed design, a PCF it cannot read', async () => {
  const fail = async (spec, io) => { const r = await runFlow({ ...SPEC, ...spec }, io); assert.equal(r.ok, false); return r.error; };
  assert.match(await fail({ device: 'ice40xx9k' }, memoryIo(PINS).io), /^ice40xx9k: not an iCE40 part of nextpnr-ice40 \(ice40lp384, .*ice40up5k/);
  const bad = memoryIo('set_io clk 999\n');
  assert.match(await fail({}, bad.io), /^nextpnr-ice40 failed: nextpnr exited with code 1/);
  assert.ok(bad.log.some(l => /^ {2}ERROR: .*999/.test(l)), 'nextpnr\'s error in the log');
  const none = memoryIo(PINS, { nextpnr: {} });
  assert.match(await fail({}, none.io), /^nextpnr-ice40 is not in this installation/);
  assert.ok(none.log.includes('Install it: npm install @yowasp/nextpnr-ice40'));
  assert.match(await fail({ steps: ['bitgen'] }, memoryIo(PINS).io), /^no routed design: run Place & Route first/);
  assert.match(await fail({}, memoryIo('set_location x 1 2 3\n').io), /^the constraints cannot be read: line 1: set_location: not a PCF command/);
});
