// The flow's nextpnr engine (#2136, src/open-flow-nextpnr.js): the netlist made ready for nextpnr (the pads on its I/O
// buffers, the cells and constants the spartan3e micro-architecture has), and the gates example (Silinx's synthesis's
// netlist, test/fixtures/nextpnr-engine) built from the command line with --engine nextpnr: nextpnr's WebAssembly
// package places and routes it, its result goes to XDL, the routing check and the bitstream.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
  // a cell it does not have, a LUT input tied to a constant
  const json = JSON.parse(gates());
  const cells = cellsOf(json);
  cells.carry = { type: 'MUXCY', connections: { S: [12], DI: [8], CI: [9], O: [13] }, port_directions: { S: 'input', DI: 'input', CI: 'input', O: 'output' } };
  cells['$abc$20424$lut$aiger$o0'].connections.I3 = ['1'];
  assert.deepEqual(nextpnrNetlist(JSON.stringify(json), 'gates', ucf()).problems,
    ['1 cell(s) MUXCY: not in the spartan3e micro-architecture yet', 'LUT4 $abc$20424$lut$aiger$o0: I3 tied to 1 (constants: #2135)']);
  // a flip-flop's enable at 1 and its reset at 0: the micro-architecture drops them
  cells.q = { type: 'FDRE', connections: { C: [8], CE: ['1'], R: ['0'], D: [9], Q: [14] }, port_directions: { C: 'input', CE: 'input', R: 'input', D: 'input', Q: 'output' } };
  assert.deepEqual(nextpnrNetlist(JSON.stringify(json), 'gates', ucf()).problems.filter(p => /FDRE/.test(p)), []);
});

test('NEXTPNR_CELL: the rising-edge flip-flops and the buffers, not a falling edge nor a latch', () => {
  for (const t of ['LUT1', 'LUT4', 'INV', 'FD', 'FDE', 'FDRE', 'FDSE', 'FDCE', 'FDPE', 'IBUF', 'OBUF', 'BUFG']) assert.ok(NEXTPNR_CELL.test(t), t);
  for (const t of ['LUT5', 'FDRE_1', 'LDCE', 'MUXCY', 'XORCY', 'MUXF5', 'SRL16E', 'RAMB16_S9', 'IOBUF', 'OBUFT']) assert.ok(!NEXTPNR_CELL.test(t), t);
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

test('#2136 --engine nextpnr on a netlist with cells it does not have yet: Map fails, naming them (exit 1)', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const json = JSON.parse(gates());
  cellsOf(json).carry = { type: 'MUXCY', connections: { S: [12], DI: [8], CI: [9], O: [13] }, port_directions: { S: 'input', DI: 'input', CI: 'input', O: 'output' } };
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
  const at = out.indexOf('  1 cell(s) MUXCY: not in the spartan3e micro-architecture yet');
  assert.ok(at > 0, out.join('\n'));
  assert.equal(out[at + 1], 'Choose the Silinx engine (Toolchain Settings): nextpnr\'s Spartan-3E is growing (#2135).');
  assert.ok(!fs.existsSync(path.join(dir, 'gates.bit')));
});
