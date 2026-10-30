// The flow's nextpnr engine (#2136, src/open-flow-nextpnr.js): the netlist made ready for nextpnr (the pads on its I/O
// buffers, the cells and constants the spartan3e micro-architecture has), and the gates example (Silinx's synthesis's
// netlist, test/fixtures/nextpnr-engine) built from the command line with --engine nextpnr: nextpnr's WebAssembly
// package places and routes it, its result goes to XDL, the routing check and the bitstream.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { main } from '../src/cli.js';
import { nextpnrNetlist, NEXTPNR_CELL } from '../src/open-flow-nextpnr.js';
import { parseXdl } from '../src/xdl.js';

const fixture = name => new URL(`./fixtures/nextpnr-engine/${name}`, import.meta.url);
const gates = () => fs.readFileSync(fixture('gates.json'), 'utf8');
const ucf = () => fs.readFileSync(fixture('gates.ucf'), 'utf8');
const cellsOf = json => Object.values(json.modules)[0].cells;

test('nextpnrNetlist: each port bit\'s pad (UCF) on its I/O buffer; no problem for the gates example', () => {
  const { json, problems } = nextpnrNetlist(gates(), 'gates', ucf());
  assert.deepEqual(problems, []);
  const locs = Object.values(cellsOf(json)).filter(c => /^[IO]BUF$/.test(c.type)).map(c => `${c.type} ${c.attributes.LOC}`).sort();
  assert.deepEqual(locs, ['IBUF B4', 'IBUF K3', 'IBUF L3', 'IBUF P11', 'OBUF M11', 'OBUF M5']);
  // the ports are kept as they are (nextpnr names its I/O buffers after them)
  assert.deepEqual(Object.keys(Object.values(json.modules)[0].ports), ['sw', 'led']);
});

test('nextpnrNetlist: what the micro-architecture cannot implement yet is named', () => {
  const ucfNoLed1 = ucf().split('\n').filter(l => !/led<1>/.test(l)).join('\n');
  assert.deepEqual(nextpnrNetlist(gates(), 'gates', ucfNoLed1).problems,
    ['port led<1>: no LOC in the constraints (the nextpnr engine places only the ports given a pad)']);
  // a cell it does not have; constants, carry chains and wide multiplexers are the micro-architecture's own (#2135)
  const json = JSON.parse(gates());
  const cells = cellsOf(json);
  cells.ram = { type: 'RAM16X1S', connections: { A0: [12], A1: [8], A2: [9], A3: [9], D: [8], WE: [9], WCLK: [9], O: [13] }, port_directions: { A0: 'input', A1: 'input', A2: 'input', A3: 'input', D: 'input', WE: 'input', WCLK: 'input', O: 'output' } };
  cells.carry = { type: 'MUXCY', connections: { S: [12], DI: ['0'], CI: ['1'], O: [14] }, port_directions: { S: 'input', DI: 'input', CI: 'input', O: 'output' } };
  cells['$abc$20424$lut$aiger$o0'].connections.I3 = ['1'];
  assert.deepEqual(nextpnrNetlist(JSON.stringify(json), 'gates', ucf()).problems, ['1 cell(s) RAM16X1S: not in the spartan3e micro-architecture yet']);
});

test('NEXTPNR_CELL: the rising-edge flip-flops, the carry chains, the wide multiplexers, the constants, the buffers and the IOBs\' DDR registers; not a falling edge, a latch, a RAM', () => {
  for (const t of ['LUT1', 'LUT4', 'INV', 'FD', 'FDE', 'FDRE', 'FDSE', 'FDCE', 'FDPE', 'MUXCY', 'XORCY', 'MUXF5', 'MUXF6', 'MUXF7', 'MUXF8', 'GND', 'VCC',
    'IBUF', 'IBUFG', 'OBUF', 'OBUFT', 'IOBUF', 'IDDR2', 'ODDR2', 'BUFG']) assert.ok(NEXTPNR_CELL.test(t), t);
  for (const t of ['LUT5', 'FDRE_1', 'LDCE', 'MUXF9', 'SRL16E', 'RAM16X1S', 'RAMB16_S9', 'MULT18X18SIO', 'DCM_SP', 'OBUFDS', 'BUFGMUX']) assert.ok(!NEXTPNR_CELL.test(t), t);
});

test('#2136 the gates example built with --engine nextpnr: no warnings, its pads, the routing checked, a complete bitstream', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const ucfFile = path.join(dir, 'gates.ucf');
  fs.writeFileSync(ucfFile, ucf());
  const out = [], err = [];
  const code = await main(['build', fixture('gates.json').pathname, '--part', 'xc3s250e-cp132-4', '--ucf', ucfFile, '--out-dir', dir, '--engine', 'nextpnr'],
    { out: l => out.push(l), err: l => err.push(l) });
  assert.equal(code, 0, err.join('\n'));
  assert.deepEqual(err, []);   // no warnings
  assert.ok(out.includes('Map: nextpnr packs the design itself, at Place & Route (the nextpnr engine).'));
  assert.ok(out.some(l => /^Placed and routed by nextpnr in [0-9.]+ s\.$/.test(l)), out.join('\n'));
  assert.ok(out.includes('  Number of 4 input LUTs: 1 out of 4896 0%'));
  assert.ok(out.includes('  Number of bonded IOBs: 6 out of 92 7%'));
  assert.ok(out.includes('All signals are completely routed.'));
  assert.ok(out.includes('Bitstream: build/gates.bit (169288 bytes, every feature in the bit database)'));
  // each IOB named after its port bit (the UCF's), at its pad
  const design = parseXdl(fs.readFileSync(path.join(dir, 'routed.xdl'), 'utf8'));
  const pads = design.insts.filter(i => /^(IOB|IBUF)$/.test(i.type)).map(i => `${i.name} ${i.site}`).sort();
  assert.deepEqual(pads, ['led<0> M5', 'led<1> M11', 'sw<0> P11', 'sw<1> L3', 'sw<2> K3', 'sw<3> B4']);
  assert.equal(fs.statSync(path.join(dir, 'gates.bit')).size, 169288);
});

test('#2136 --engine nextpnr on a netlist with cells it does not have yet (a RAM16X1S): Map fails, naming them (exit 1)', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const json = JSON.parse(gates());
  cellsOf(json).ram = { type: 'RAM16X1S', connections: { A0: [12], A1: [8], A2: [9], A3: [9], D: [8], WE: [9], WCLK: [9], O: [13] }, port_directions: { A0: 'input', A1: 'input', A2: 'input', A3: 'input', D: 'input', WE: 'input', WCLK: 'input', O: 'output' } };
  fs.writeFileSync(path.join(dir, 'gates.json'), JSON.stringify(json));
  fs.writeFileSync(path.join(dir, 'gates.ucf'), ucf());
  const out = [], err = [];
  const code = await main(['build', path.join(dir, 'gates.json'), '--part', 'xc3s250e-cp132-4', '--ucf', path.join(dir, 'gates.ucf'), '--out-dir', dir, '--engine', 'nextpnr'],
    { out: l => out.push(l), err: l => err.push(l) });
  assert.equal(code, 1);
  assert.deepEqual(err, [
    'ERROR:Silinx - the nextpnr engine cannot implement this design yet: 1 problem(s)',
    'silinx-fpga: the nextpnr engine cannot implement this design yet: 1 problem(s)',
  ]);
  // (the problems and the hint: the log's, after the error)
  const at = out.indexOf('  1 cell(s) RAM16X1S: not in the spartan3e micro-architecture yet');
  assert.ok(at > 0, out.join('\n'));
  assert.equal(out[at + 1], 'Choose the Silinx engine (Toolchain Settings): nextpnr\'s Spartan-3E is growing (#2135).');
  assert.ok(!fs.existsSync(path.join(dir, 'gates.bit')));
});

test('#2135 a counter with a carry chain and constants (Silinx\'s synthesis) built with --engine nextpnr: no warnings, its PERIOD met, a complete bitstream', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const out = [], err = [];
  const code = await main(['build', fixture('counter.json').pathname, '--part', 'xc3s250e-cp132-4', '--ucf', fixture('counter.ucf').pathname, '--out-dir', dir, '--engine', 'nextpnr'],
    { out: l => out.push(l), err: l => err.push(l) });
  assert.equal(code, 0, err.join('\n'));
  assert.deepEqual(err, []);   // no warnings
  assert.ok(out.includes('  Number of Slice Flip Flops: 24 out of 4896 0%'), out.join('\n'));
  assert.ok(out.includes('  Number of occupied Slices: 13 out of 2448 1%'), out.join('\n'));
  assert.ok(out.some(l => /^constraint PERIOD 20 ns on clk: met \(period [0-9.]+ ns, slack [0-9.]+ ns\)$/.test(l)), out.join('\n'));
  assert.ok(out.includes('All constraints were met.'));
  assert.ok(out.includes('Bitstream: build/blink.bit (169288 bytes, every feature in the bit database)'));
  // the chain up its column: one slice taking the carry in through BX, eleven through CIN
  const design = parseXdl(fs.readFileSync(path.join(dir, 'routed.xdl'), 'utf8'));
  const cfg = (attr, value) => design.insts.filter(i => i.cfg.some(c => c.attr === attr && c.value === value)).length;
  assert.equal(cfg('CYINIT', 'BX'), 1);
  assert.equal(cfg('CYINIT', 'CIN'), 11);
});

test('#2135 the traffic example (Silinx\'s synthesis: MUXF5s, two MUXF6s, carry chains) built with --engine nextpnr: no warnings, its PERIOD met, a complete bitstream', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const netlist = path.join(dir, 'top.json');
  fs.writeFileSync(netlist, zlib.gunzipSync(fs.readFileSync(fixture('traffic.json.gz'))));
  const out = [], err = [];
  const code = await main(['build', netlist, '--part', 'xc3s250e-cp132-4', '--ucf', fixture('traffic.ucf').pathname, '--out-dir', dir, '--engine', 'nextpnr'],
    { out: l => out.push(l), err: l => err.push(l) });
  assert.equal(code, 0, err.join('\n'));
  assert.deepEqual(err, []);   // no warnings
  assert.ok(out.includes('  Number of Slice Flip Flops: 58 out of 4896 1%'), out.join('\n'));
  assert.ok(out.includes('  Number of occupied Slices: 71 out of 2448 3%'), out.join('\n'));
  assert.ok(out.includes('All constraints were met.'), out.join('\n'));
  assert.ok(out.includes('Bitstream: build/top.bit (169286 bytes, every feature in the bit database)'), out.join('\n'));
  // the wide multiplexers on the slices' own: twelve F5s, two F6s each reading two of them
  const design = parseXdl(fs.readFileSync(path.join(dir, 'routed.xdl'), 'utf8'));
  const has = attr => design.insts.filter(i => i.cfg.some(c => c.attr === attr)).length;
  assert.equal(has('F5MUX'), 12);
  assert.equal(has('F6MUX'), 2);
  assert.equal(has('F5USED'), 4);
});

test('#2192 the IOB registers\' design (Silinx\'s synthesis) built with --engine nextpnr: no warnings, its PERIOD met, the registers in their IOBs, a complete bitstream', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const out = [], err = [];
  const code = await main(['build', fixture('iob_regs.json').pathname, '--part', 'xc3s250e-cp132-4', '--ucf', fixture('iob_regs.ucf').pathname, '--out-dir', dir, '--engine', 'nextpnr'],
    { out: l => out.push(l), err: l => err.push(l) });
  assert.equal(code, 0, err.join('\n'));
  assert.deepEqual(err, []);   // no warnings
  assert.ok(out.includes('  Number of bonded IOBs: 11 out of 92 12%'), out.join('\n'));
  assert.ok(out.includes('  Number of Slice Flip Flops: 0 out of 4896 0%'), out.join('\n'));
  assert.ok(out.some(l => /^constraint PERIOD 20 ns on clk: met \(period [0-9.]+ ns, slack [0-9.]+ ns\)$/.test(l)), out.join('\n'));
  assert.ok(out.includes('All constraints were met.'));
  assert.ok(out.includes('Bitstream: build/iob_regs.bit (169291 bytes, every feature in the bit database)'), out.join('\n'));
  // the eight flip-flops in their IOBs, the clock pad's buffer on its dedicated path
  const design = parseXdl(fs.readFileSync(path.join(dir, 'routed.xdl'), 'utf8'));
  const ffs = design.insts.flatMap(i => i.cfg.filter(c => c.value === '#FF').map(c => `${i.name} ${c.attr}`)).sort();
  assert.deepEqual(ffs, ['led<0> OFF1', 'led<1> OFF1', 'led<1> TFF1', 'led<2> OFF1', 'led<2> OFF2', 'sw<0> IFF1', 'sw<1> IFF1', 'sw<1> IFF2']);
  assert.equal(design.insts.find(i => i.type === 'BUFGMUX').site, 'BUFGMUX_X2Y11');
});
