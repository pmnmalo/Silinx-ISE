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
import { engineOf, nextpnrNetlist, nextpnrTries, NEXTPNR_CELL, NEXTPNR_TRIES } from '../src/open-flow-nextpnr.js';
import { parseXdl } from '../src/xdl.js';
import { loadDeviceCache } from '../src/fpga/device-node.js';

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

// #2232: a one-bit bus port (b : std_logic_vector(0 downto 0), Yosys's single_bit_vector) takes the LOC written b<0>, as
// XST names it (#2199); a scalar's a<0> is not its name (ngdbuild does not find it, #84, #2229): no pad
test('nextpnrNetlist: a one-bit bus port\'s pad written x<0>, not a scalar port\'s (#2232)', () => {
  const io = (type, I, O) => ({ type, port_directions: { I: 'input', O: 'output' }, connections: { I: [I], O: [O] } });
  const one = { single_bit_vector: '00000000000000000000000000000001' };
  const json = JSON.stringify({ modules: { t: { attributes: { top: '1' },
    ports: { a: { direction: 'input', bits: [2] }, b: { direction: 'input', bits: [3] }, y: { direction: 'output', bits: [4] } },
    cells: { ia: io('IBUF', 2, 5), ib: io('IBUF', 3, 6), oy: io('OBUF', 7, 4),
      l: { type: 'LUT2', parameters: { INIT: '0110' }, port_directions: { I0: 'input', I1: 'input', O: 'output' }, connections: { I0: [5], I1: [6], O: [7] } } },
    netnames: { a: { bits: [2], attributes: {} }, b: { bits: [3], attributes: one }, y: { bits: [4], attributes: {} } } } } });
  const { json: out, problems } = nextpnrNetlist(json, 't', 'NET "a<0>" LOC = "G12";\nNET "B<0>" LOC = "P11" | IOSTANDARD = LVCMOS33;\nNET "y" LOC = "M5";');
  assert.deepEqual(problems, ['port a: no LOC in the constraints (the nextpnr engine places only the ports given a pad)']);
  const c = cellsOf(out);
  assert.deepEqual([c.ia.attributes?.LOC, c.ib.attributes.LOC, c.ib.attributes.IOSTANDARD, c.oy.attributes.LOC], [undefined, 'P11', 'LVCMOS33', 'M5']);
});

test('nextpnrNetlist: what the micro-architecture cannot implement yet is named', () => {
  const ucfNoLed1 = ucf().split('\n').filter(l => !/led<1>/.test(l)).join('\n');
  assert.deepEqual(nextpnrNetlist(gates(), 'gates', ucfNoLed1).problems,
    ['port led<1>: no LOC in the constraints (the nextpnr engine places only the ports given a pad)']);
  // a cell it does not have; constants, carry chains and wide multiplexers are the micro-architecture's own (#2135)
  const json = JSON.parse(gates());
  const cells = cellsOf(json);
  cells.ram = { type: 'RAM64X1S', connections: { A0: [12], A1: [8], A2: [9], A3: [9], D: [8], WE: [9], WCLK: [9], O: [13] }, port_directions: { A0: 'input', A1: 'input', A2: 'input', A3: 'input', D: 'input', WE: 'input', WCLK: 'input', O: 'output' } };
  cells.carry = { type: 'MUXCY', connections: { S: [12], DI: ['0'], CI: ['1'], O: [14] }, port_directions: { S: 'input', DI: 'input', CI: 'input', O: 'output' } };
  cells['$abc$20424$lut$aiger$o0'].connections.I3 = ['1'];
  assert.deepEqual(nextpnrNetlist(JSON.stringify(json), 'gates', ucf()).problems, ['1 cell(s) RAM64X1S: not in the spartan3e micro-architecture yet']);
});

test('NEXTPNR_CELL: the rising-edge flip-flops, the carry chains, the wide multiplexers, the constants, the buffers, the IOBs\' DDR registers, the block RAMs and multipliers; not a falling edge, a latch, a distributed RAM', () => {
  for (const t of ['LUT1', 'LUT4', 'INV', 'FD', 'FDE', 'FDRE', 'FDSE', 'FDCE', 'FDPE', 'MUXCY', 'XORCY', 'MUXF5', 'MUXF6', 'MUXF7', 'MUXF8', 'GND', 'VCC', 'IBUF', 'IBUFG', 'OBUF', 'OBUFT', 'IOBUF', 'IDDR2', 'ODDR2', 'BUFG', 'DCM', 'DCM_SP', 'RAM16X1S', 'RAM16X1D', 'RAM32X1S', 'SRL16', 'SRL16E', 'SRLC16E', 'SRL16E_1', 'RAMB16_S1', 'RAMB16_S9', 'RAMB16_S18_S18', 'RAMB16_S36_S9', 'MULT18X18', 'MULT18X18S', 'MULT18X18SIO']) assert.ok(NEXTPNR_CELL.test(t), t);
  for (const t of ['LUT5', 'FDRE_1', 'LDCE', 'MUXF9', 'RAMB16_S3', 'MULT18X18SX', 'OBUFDS', 'BUFGMUX']) assert.ok(!NEXTPNR_CELL.test(t), t);
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

test('#2136 --engine nextpnr on a netlist with cells it does not have yet (a RAM64X1S): Map fails, naming them (exit 1)', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const json = JSON.parse(gates());
  cellsOf(json).ram = { type: 'RAM64X1S', connections: { A0: [12], A1: [8], A2: [9], A3: [9], D: [8], WE: [9], WCLK: [9], O: [13] }, port_directions: { A0: 'input', A1: 'input', A2: 'input', A3: 'input', D: 'input', WE: 'input', WCLK: 'input', O: 'output' } };
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
  const at = out.indexOf('  1 cell(s) RAM64X1S: not in the spartan3e micro-architecture yet');
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

test('#2196 nextpnrTries: four placements at Normal up to 500 slices, one above; eight at High', () => {
  assert.deepEqual(NEXTPNR_TRIES, { normal: 4, high: 8, maxSlices: 500 });
  for (const [effort, slices, n] of [['normal', 1, 4], ['normal', 500, 4], ['normal', 501, 1], ['high', 1, 8], ['high', 4000, 8], [undefined, 100, 4]]) assert.equal(nextpnrTries(effort, slices), n);
});

test('#2196 --seed 5: placements from that seed on, each reported, the fastest kept; the design with no clock takes one', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const out = [], err = [];
  const code = await main(['build', fixture('counter.json').pathname, '--part', 'xc3s250e-cp132-4', '--ucf', fixture('counter.ucf').pathname, '--out-dir', dir, '--engine', 'nextpnr', '--seed', '5'],
    { out: l => out.push(l), err: l => err.push(l) });
  assert.equal(code, 0, err.join('\n'));
  assert.deepEqual(err, []);   // no warnings
  const tries = out.map(l => /^Placement (\d) of 4 \(seed (\d)\): ([0-9.]+) ns, 13 slices, in [0-9.]+ s\.$/.exec(l)).filter(Boolean);
  assert.deepEqual(tries.map(m => [+m[1], +m[2]]), [[1, 5], [2, 6], [3, 7], [4, 8]]);
  const fastest = Math.min(...tries.map(m => +m[3]));
  const kept = out.map(l => /^Kept the fastest of 4 placements: seed (\d), ([0-9.]+) ns\.$/.exec(l)).find(Boolean);
  assert.equal(+kept[2], fastest);
  assert.equal(tries.find(m => +m[3] === fastest)[2], kept[1]);
  // and the gates example, combinational: one placement, nothing to compare
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  fs.writeFileSync(path.join(dir2, 'gates.ucf'), ucf());
  const out2 = [];
  assert.equal(await main(['build', fixture('gates.json').pathname, '--part', 'xc3s250e-cp132-4', '--ucf', path.join(dir2, 'gates.ucf'), '--out-dir', dir2, '--engine', 'nextpnr'], { out: l => out2.push(l), err: () => {} }), 0);
  assert.deepEqual(out2.filter(l => /^(Placement|Kept)/.test(l)), []);
});

test('#2196 the VGA example built with --engine nextpnr: at most 148 slices as the packing fills them (#2223), no warnings, its PERIOD met, its clock on the global lines', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const netlist = path.join(dir, 'top.json');
  fs.writeFileSync(netlist, zlib.gunzipSync(fs.readFileSync(fixture('vga.json.gz'))));
  const out = [], err = [];
  const code = await main(['build', netlist, '--part', 'xc3s250e-cp132-4', '--ucf', fixture('vga.ucf').pathname, '--out-dir', dir, '--engine', 'nextpnr'],
    { out: l => out.push(l), err: l => err.push(l) });
  assert.equal(code, 0, err.join('\n'));
  assert.deepEqual(err, []);   // no warnings
  assert.ok(out.includes('  Number of occupied Slices: 148 out of 2448 6%'), out.join('\n'));
  assert.ok(out.includes('  Number of 4 input LUTs: 278 out of 4896 6%'), out.join('\n'));
  assert.ok(out.includes('  Number of Slice Flip Flops: 56 out of 4896 1%'), out.join('\n'));
  assert.ok(out.includes('All constraints were met.'), out.join('\n'));
  const design = parseXdl(fs.readFileSync(path.join(dir, 'routed.xdl'), 'utf8'));
  const clock = design.nets.find(n => n.inpins.some(p => p.pin === 'CLK'));
  assert.deepEqual(clock.pips.filter(p => /^CLK\d$/.test(p.to) && !/^GCLK/.test(p.from)), []);
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
  assert.ok(out.includes('  Number of occupied Slices: 69 out of 2448 3%'), out.join('\n'));
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

test('#2195 nextpnrNetlist: a pad\'s constraints on its buffer, a NET name with wildcards on each bit, a one-bit bus\'s name<0>; a PERIOD per clock after its global buffer; an input nothing reads left out', () => {
  const ucf = fs.readFileSync(fixture('ucf_all.ucf'), 'utf8');
  const { json, problems, sdc } = nextpnrNetlist(fs.readFileSync(fixture('ucf_all.json'), 'utf8'), 'ucf_all', ucf);
  assert.deepEqual(problems, []);
  assert.equal(sdc, 'create_clock -period 10 [get_nets {ck2}]\ncreate_clock -period 20 [get_nets {ck}]\n');
  const cells = Object.values(cellsOf(json));
  const by = pad => cells.find(c => c.attributes?.LOC === pad).attributes;
  assert.deepEqual([by('M5').IOSTANDARD, by('M5').DRIVE, by('M5').SLEW, by('M5').PULL], ['LVCMOS33', '8', 'fast', undefined]);
  assert.equal(by('P11').PULL, 'up');
  assert.equal(by('K3').PULL, 'keeper');
  assert.equal(by('G1').PULL, 'down');
  // the unused input: no buffer, no pad, no LOC asked of it
  assert.ok(!cells.some(c => c.attributes?.LOC === 'A7'));
  assert.deepEqual(Object.values(json.modules)[0].ports.unused.bits, ['x']);
  const noLoc = ucf.split('\n').filter(l => !/"unused"/.test(l)).join('\n');
  assert.deepEqual(nextpnrNetlist(fs.readFileSync(fixture('ucf_all.json'), 'utf8'), 'ucf_all', noLoc).problems, []);
  // wildcards
  const wild = `${ucf}\nNET "led<*>" SLEW = FAST ;\nNET "sw<*>" IOSTANDARD = LVTTL ;\n`;
  const w = Object.values(cellsOf(nextpnrNetlist(fs.readFileSync(fixture('ucf_all.json'), 'utf8'), 'ucf_all', wild).json));
  assert.equal(w.find(c => c.attributes?.LOC === 'P7').attributes.SLEW, 'fast');
  assert.equal(w.find(c => c.attributes?.LOC === 'P11').attributes.IOSTANDARD, 'LVTTL');
  // a one-bit bus port written name<0> (#2199: Silinx's packer dropped it); Yosys marks a [0:0] port single_bit_vector
  // (a scalar's name<0> is not its name: #2232)
  const one = JSON.parse(gates());
  const m = Object.values(one.modules)[0], [p] = Object.entries(m.ports).find(([, d]) => d.direction === 'input');
  m.ports[p].bits = [m.ports[p].bits[0]];
  m.netnames[p] = { ...m.netnames[p], bits: m.ports[p].bits, attributes: { ...m.netnames[p]?.attributes, single_bit_vector: '00000000000000000000000000000001' } };
  const r = nextpnrNetlist(JSON.stringify(one), 'gates', `NET "${p}<0>" LOC = "G12" | IOSTANDARD = LVTTL ;\n`);
  assert.equal(Object.values(cellsOf(r.json)).find(c => c.attributes?.LOC === 'G12')?.attributes.IOSTANDARD, 'LVTTL');
  // a PERIOD on no port of the design: no target (the timing step says it is missing)
  assert.equal(nextpnrNetlist(gates(), 'gates', 'NET "nothing" PERIOD = 5 ns ;\n').sdc, '');
});

test('#2195 --engine nextpnr with the whole UCF: no warnings (TIG and CLOCK_DEDICATED_ROUTE change nothing, as in Silinx\'s flow); each PERIOD and OFFSET checked by the timing step, as with Silinx\'s engine', { timeout: 300000 }, async () => {
  const build = async engine => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
    const out = [], err = [];
    const code = await main(['build', fixture('ucf_all.json').pathname, '--part', 'xc3s250e-cp132-4', '--ucf', fixture('ucf_all.ucf').pathname, '--out-dir', dir, '--engine', engine],
      { out: l => out.push(l), err: l => err.push(l) });
    assert.equal(code, 0, err.join('\n'));
    assert.deepEqual(err, []);   // no warnings
    const checks = out.filter(l => /^constraint /.test(l)).map(l => l.replace(/ \(.*$/, '')).sort();
    return { checks, out };
  };
  const n = await build('nextpnr'), s = await build('silinx');
  assert.deepEqual(n.checks, s.checks);
  assert.ok(n.checks.includes('constraint PERIOD 10 ns on clk2: met'), n.checks.join('\n'));
  assert.ok(n.checks.includes('constraint PERIOD 20 ns on clk: met'));
  assert.ok(n.checks.includes('constraint OFFSET = IN 15 ns BEFORE "clk": met on sw<0>'));
  assert.ok(n.checks.includes('constraint OFFSET = OUT 15 ns AFTER "clk": met on led<0>'));
  assert.ok(n.out.includes('All constraints were met.'));
  assert.ok(n.out.some(l => /^Bitstream: .*every feature in the bit database\)$/.test(l)), n.out.join('\n'));
});

test('#2190 MUXF7 and MUXF8 built with --engine nextpnr: no warnings, its PERIOD met, the multiplexers on the dedicated wires, a complete bitstream', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const out = [], err = [];
  const code = await main(['build', fixture('widemux.json').pathname, '--part', 'xc3s250e-cp132-4', '--ucf', fixture('widemux.ucf').pathname, '--out-dir', dir, '--engine', 'nextpnr'],
    { out: l => out.push(l), err: l => err.push(l) });
  assert.equal(code, 0, err.join('\n'));
  assert.deepEqual(err, []);   // no warnings
  assert.ok(out.includes('  Number of Slice Flip Flops: 32 out of 4896 1%'), out.join('\n'));
  assert.ok(out.includes('All constraints were met.'), out.join('\n'));
  assert.ok(out.some(l => /^Bitstream: .*every feature in the bit database\)$/.test(l)), out.join('\n'));
  // one F6MUX per MUXF6, MUXF7 and MUXF8 of the trees; the fourth MUXF7 a LUT
  const design = parseXdl(fs.readFileSync(path.join(dir, 'routed.xdl'), 'utf8'));
  assert.equal(design.insts.reduce((n, i) => n + i.cfg.filter(c => c.attr === 'F6MUX').length, 0), 10);
});

test('#2191 the SLICEM\'s memories built with --engine nextpnr: no warnings, its PERIOD met, a complete bitstream', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const out = [], err = [];
  const code = await main(['build', fixture('slicemem.json').pathname, '--part', 'xc3s250e-cp132-4', '--ucf', fixture('slicemem.ucf').pathname, '--out-dir', dir, '--engine', 'nextpnr'],
    { out: l => out.push(l), err: l => err.push(l) });
  assert.equal(code, 0, err.join('\n'));
  assert.deepEqual(err, []);   // no warnings
  assert.ok(out.includes('All constraints were met.'), out.join('\n'));
  assert.ok(out.some(l => /^Bitstream: .*every feature in the bit database\)$/.test(l)), out.join('\n'));
  const design = parseXdl(fs.readFileSync(path.join(dir, 'routed.xdl'), 'utf8'));
  assert.equal(design.insts.filter(i => i.type === 'SLICEM').length, 9);
});

test('#2191 a shift register read at its last stage into several others (only one is its cascade) built with --engine nextpnr: no warnings, a complete bitstream', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const out = [], err = [];
  const code = await main(['build', fixture('srl_fanout.json').pathname, '--part', 'xc3s250e-cp132-4', '--ucf', fixture('srl_fanout.ucf').pathname, '--out-dir', dir, '--engine', 'nextpnr'],
    { out: l => out.push(l), err: l => err.push(l) });
  assert.equal(code, 0, err.join('\n'));
  assert.deepEqual(err, []);   // no warnings
  assert.ok(out.some(l => /^Bitstream: .*every feature in the bit database\)$/.test(l)), out.join('\n'));
  const design = parseXdl(fs.readFileSync(path.join(dir, 'routed.xdl'), 'utf8'));
  assert.equal(design.insts.reduce((n, i) => n + i.cfg.filter(c => /^#RAM/.test(c.value)).length, 0), 9);
});

test('#2194 nextpnrNetlist: each clock of a DCM with its derived period, on its global buffer; an INST LOC as the DCM\'s BEL, a wrong site refused', () => {
  const json = () => fs.readFileSync(fixture('feat_dcm.json'), 'utf8'), ucf = fs.readFileSync(fixture('feat_dcm.ucf'), 'utf8');
  const { problems, sdc } = nextpnrNetlist(json(), 'top', ucf);
  assert.deepEqual(problems, []);
  // the 20 ns input: CLK0 20, CLKDV / 4 = 80, CLKFX x 3 / 2 = 13.333333, CLK2X 10; its input buffer's net as well
  assert.deepEqual(sdc.trim().split('\n').map(l => +/-period (\S+)/.exec(l)[1]).sort((a, b) => a - b), [10, 13.333333, 20, 20, 80]);
  const device = loadDeviceCache('xc3s250ecp132-4');
  const at = nextpnrNetlist(json(), 'top', `${ucf}\nINST "u_dcm" LOC = "DCM_X1Y0" ;\n`, device);
  assert.deepEqual(at.problems, []);
  const s = device.site('DCM_X1Y0');
  assert.equal(cellsOf(at.json).u_dcm.attributes.BEL, `X${device.tileCol[s.tile]}Y${device.tileRow[s.tile]}/S${s.index}_DCM`);
  assert.deepEqual(nextpnrNetlist(json(), 'top', `${ucf}\nINST "u_dcm" LOC = "SLICE_X0Y0" ;\n`, device).problems, ['INST u_dcm: LOC SLICE_X0Y0 is not a DCM site of this device']);
});

test('#2194 a DCM_SP (Silinx\'s synthesis) built with --engine nextpnr: no warnings, each clock\'s PERIOD derived and met, on its buffers, a complete bitstream', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const out = [], err = [];
  const code = await main(['build', fixture('feat_dcm.json').pathname, '--part', 'xc3s250e-cp132-4', '--ucf', fixture('feat_dcm.ucf').pathname, '--out-dir', dir, '--engine', 'nextpnr'],
    { out: l => out.push(l), err: l => err.push(l) });
  assert.equal(code, 0, err.join('\n'));
  assert.deepEqual(err, []);   // no warnings
  // (the UCF's 20 ns on clk, each clock's derived by the timing step)
  const checks = out.filter(l => /^constraint PERIOD/.test(l)).map(l => l.replace(/ \(period .*$/, '')).sort();
  assert.deepEqual(checks, ['constraint PERIOD 20 ns on clk, CLK0 of u_dcm: 20 ns, met', 'constraint PERIOD 20 ns on clk, CLK2X of u_dcm: 10 ns, met',
    'constraint PERIOD 20 ns on clk, CLKDV of u_dcm: 80 ns, met', 'constraint PERIOD 20 ns on clk, CLKFX of u_dcm: 13.333 ns, met']);
  assert.ok(out.includes('All constraints were met.'), out.join('\n'));
  assert.ok(out.some(l => /^Bitstream: .*every feature in the bit database\)$/.test(l)), out.join('\n'));
  const design = parseXdl(fs.readFileSync(path.join(dir, 'routed.xdl'), 'utf8'));
  assert.equal(design.insts.find(i => i.type === 'DCM').site, 'DCM_X0Y1');
  assert.deepEqual(design.insts.filter(i => i.type === 'BUFGMUX').map(i => i.site).sort(), ['BUFGMUX_X1Y10', 'BUFGMUX_X1Y11', 'BUFGMUX_X2Y10', 'BUFGMUX_X2Y11']);
});

test('#2136 --engine auto: nextpnr when it can implement the design; else the Silinx engine, which Map says (no warning)', { timeout: 300000 }, async () => {
  const build = async ucfText => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
    fs.writeFileSync(path.join(dir, 'gates.ucf'), ucfText);
    const out = [], err = [];
    const code = await main(['build', fixture('gates.json').pathname, '--part', 'xc3s250e-cp132-4', '--ucf', path.join(dir, 'gates.ucf'), '--out-dir', dir, '--engine', 'auto'],
      { out: l => out.push(l), err: l => err.push(l) });
    assert.equal(code, 0, err.join('\n'));
    assert.deepEqual(err, []);   // no warnings
    assert.ok(out.some(l => /^Bitstream: .*every feature in the bit database\)$/.test(l)), out.join('\n'));
    return out;
  };
  // the gates example with its pads: nextpnr
  const n = await build(ucf());
  assert.ok(n.includes('Map: nextpnr packs the design itself, at Place & Route (the nextpnr engine).'), n.join('\n'));
  // a port without a pad: the Silinx engine, said once, its placer choosing the pin
  const s = await build(ucf().split('\n').filter(l => !/led<1>/.test(l)).join('\n'));
  assert.deepEqual(s.filter(l => /^Map: /.test(l)), ['Map: the nextpnr engine cannot implement this design yet (port led<1>: no LOC in the constraints (the nextpnr engine places only the ports given a pad)): the Silinx engine places and routes it.']);
  assert.ok(!s.some(l => /nextpnr packs|Placed and routed by nextpnr/.test(l)), s.join('\n'));
});

test('#2136 engineOf: a project\'s engine, Silinx\'s when not set or not known', () => {
  assert.equal(engineOf(undefined), 'silinx');
  assert.equal(engineOf({}), 'silinx');
  assert.equal(engineOf({ engine: 'auto' }), 'auto');
  assert.equal(engineOf({ engine: 'nextpnr' }), 'nextpnr');
  assert.equal(engineOf({ engine: 'vpr' }), 'silinx');
});

test('#2223 flip-flops alone in the slices of carry chains built with --engine nextpnr: no warnings, its PERIOD met, a complete bitstream', { timeout: 300000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-nextpnr-'));
  const out = [], err = [];
  const code = await main(['build', fixture('ffcarry.json').pathname, '--part', 'xc3s250e-cp132-4', '--ucf', fixture('ffcarry.ucf').pathname, '--out-dir', dir, '--engine', 'nextpnr'],
    { out: l => out.push(l), err: l => err.push(l) });
  assert.equal(code, 0, err.join('\n'));
  assert.deepEqual(err, []);   // no warnings
  assert.ok(out.includes('  Number of occupied Slices: 22 out of 2448 1%'), out.join('\n'));
  assert.ok(out.includes('  Number of Slice Flip Flops: 35 out of 4896 1%'), out.join('\n'));
  assert.ok(out.includes('All constraints were met.'), out.join('\n'));
  assert.ok(out.some(l => /^Bitstream: .*every feature in the bit database\)$/.test(l)), out.join('\n'));
  const design = parseXdl(fs.readFileSync(path.join(dir, 'routed.xdl'), 'utf8'));
  const value = (i, attr) => i.cfg.find(c => c.attr === attr)?.value;
  // flip-flops from BX / BY (DXMUX / DYMUX 0) in the slices of the chains, beside their stages
  const chain = design.insts.filter(i => i.cfg.some(c => /^CYMUX[FG]$/.test(c.attr)));
  const alone = chain.flatMap(i => ['X', 'Y'].filter(X => value(i, `FF${X}`) === '#FF' && value(i, `D${X}MUX`) === '0'));
  assert.ok(alone.length >= 6, `${alone.length} flip-flop(s) alone in the chains' slices`);
  // the difference's carry in, a 1: from the CLB's VCC site to BX, CYINIT = BX
  const vcc = design.nets.filter(n => n.type === 'vcc' && n.inpins.some(p => p.pin === 'BX'));
  assert.equal(vcc.length, 1);
  assert.match(vcc[0].outpins[0].inst, /^XDL_DUMMY_CLB_X\d+Y\d+_VCC_X\d+Y\d+$/);
  assert.equal(value(design.insts.find(i => i.name === vcc[0].inpins[0].inst), 'CYINIT'), 'BX');
});
