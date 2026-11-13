// open-flow-xc7.js (#3146): the 7-series' back end of the flow. Its parts without nextpnr: the XDC nextpnr reads (the
// ports' pins and standards, the clocks, a one-bit vector's name, the ports with no pin), the resources nextpnr used held to
// the xc7a35t's own (its chip database is the xc7a50t's), nextpnr's timing marked as its estimate (a clock net named as
// synthesis left it: its port's name), synth_xilinx's cells counted, the back end registered for the Artix-7; and its
// Generate Programming File on the reference FASM of the fork's CI (test/fixtures/xc7): the configuration data
// byte-identical to Project X-Ray's fasm2frames and xc7frames2bit, only the header Silinx's own; the JTAG's user access
// (#3767): a BSCANE2 handed to nextpnr as a BSCAN, its chain's feature on the part's CFG_CENTER_MID tile.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { XC7, XC7_STEPS, XC7_TIMING_MODEL, nextpnrXdc, xc7BscanCells, xc7BscanFeatures, xc7FasmUtilization, xc7PlacedUtilization, xc7Timing, xc7TimingText, xc7Utilization } from '../src/open-flow-xc7.js';
import { backendOf } from '../src/open-flow-backends.js';
import { XDC } from '../src/xdc.js';
import { readConstraints } from '../src/constraints.js';
import { loadBitDbXc7 } from '../src/fpga/xc7/bitdb-node.js';
import { readBitXc7 } from '../src/fpga/xc7/bitstream.js';
import { fasmToFrames } from '../src/fpga/xc7/frames.js';
import { StepError } from '../src/open-flow-core.js';

const FIX = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'xc7');
const gz = f => zlib.gunzipSync(fs.readFileSync(path.join(FIX, f)));
const PART = 'xc7a35tcpg236-1';
const util = (name, used, total) => ({ name, used, total, percent: total ? Math.round((100 * used) / total) : 0 });
// the xc7a35t's resources (resources.js resourcesOf of server/devices.js's record, CPG236)
const RESOURCES = [{ id: 'ffs', report: 'Number of Slice Registers', count: 41600 }, { id: 'luts', report: 'Number of Slice LUTs', count: 20800 },
  { id: 'slices', report: 'Number of occupied Slices', count: 5200 }, { id: 'distRam', report: null, count: 409600 }, { id: 'iob', report: 'Number of bonded IOBs', count: 106 }];

const XDC_TEXT = `set_property -dict { PACKAGE_PIN W5 IOSTANDARD LVCMOS33 } [get_ports {clk}]
set_property -dict { PACKAGE_PIN U18 IOSTANDARD LVCMOS33 } [get_ports {btn[0]}]
set_property PACKAGE_PIN U16 [get_ports {led[0]}]
set_property PACKAGE_PIN E19 [get_ports {led[1]}]
set_property IOSTANDARD LVCMOS33 [get_ports {led[1]}]
set_property -dict { PACKAGE_PIN V17 IOSTANDARD LVCMOS33 } [get_ports {sw[0]}]
set_property CFGBVS VCCO [current_design]
create_clock -add -name sys_clk_pin -period 10.000 -waveform {0 5} [get_ports {clk}]
`;
// the netlist's ports as nextpnr names them: clk, btn (a vector of one bit), led[0], led[1], an unconstrained rst
const BITS = [{ name: 'clk', bit: 'clk[0]' }, { name: 'btn', bit: 'btn[0]' }, { name: 'led[0]' }, { name: 'led[1]' }, { name: 'rst', bit: 'rst[0]' }];

test('xc7: the XDC nextpnr reads, the ports\' pins and standards and the clocks, for the netlist\'s ports only', () => {
  const r = nextpnrXdc(readConstraints(XDC, XDC_TEXT, 'top.xdc'), BITS);
  assert.equal(r.text, [
    'set_property -dict {PACKAGE_PIN W5 IOSTANDARD LVCMOS33} [get_ports {clk}]',
    'set_property -dict {PACKAGE_PIN U18 IOSTANDARD LVCMOS33} [get_ports {btn}]',   // (the board's btn[0], nextpnr's btn, #2518)
    'set_property -dict {PACKAGE_PIN U16 IOSTANDARD LVCMOS33} [get_ports {led[0]}]',   // (no standard given: LVCMOS33, the boards' banks)
    'set_property -dict {PACKAGE_PIN E19 IOSTANDARD LVCMOS33} [get_ports {led[1]}]',
    'create_clock -period 10.000 [get_ports {clk}]',   // (no -add, -name, -waveform: nextpnr warns of them)
    '',
  ].join('\n'));
  assert.deepEqual(r.free, ['rst']);
  assert.deepEqual(r.clocks, [{ net: 'clk', mhz: 100 }]);
  // no constraints: every port free, no file
  assert.deepEqual(nextpnrXdc(null, BITS), { text: '', free: ['clk', 'btn', 'led[0]', 'led[1]', 'rst'], clocks: [] });
});

test('xc7: the resources nextpnr used, each total the xc7a35t\'s (its chip database the xc7a50t\'s), the others nextpnr\'s', () => {
  const report = { utilization: {
    BUFGCTRL: { available: 32, used: 1 }, CARRY4: { available: 8150, used: 49 }, DSP48E1_DSP48E1: { available: 120, used: 3 }, IOB33_INBUF_EN: { available: 250, used: 6 },
    IOB33_OUTBUF: { available: 250, used: 20 }, PAD: { available: 512, used: 26 }, PSEUDO_GND: { available: 1, used: 1 }, RAMB18E1_RAMB18E1: { available: 150, used: 1 },
    SLICE_FFX: { available: 65200, used: 201 }, SLICE_LUTX: { available: 65200, used: 336 }, F7MUX: { available: 16300, used: 0 },
  } };
  // (the LUTs and the slices the FASM's: a LUT of logic, a feed-through of input 3, a slice of two LUTs and one of none)
  const fasm = ['CLBLL_L_X2Y37.SLICEL_X0.ALUT.INIT[63:0] = 64\'b0110', `CLBLL_L_X2Y37.SLICEL_X0.BLUT.INIT[63:0] = 64'b${'11110000'.repeat(8)}`,
    'CLBLM_R_X3Y1.SLICEM_X0.CARRY4.ACY0', 'INT_L_X2Y37.LOGIC_OUTS_L4.IMUX_L1', ''].join('\n');
  assert.deepEqual(xc7PlacedUtilization(report, RESOURCES, util, fasm), [
    util('Number of Slice LUTs', 1, 20800), util('LUTs as feed-throughs (nextpnr)', 1, 20800), util('Number of occupied Slices', 2, 5200),
    util('BUFGCTRL', 1, 32), util('CARRY4', 49, 5200), util('DSPs', 3, 120), util('Number of bonded IOBs', 26, 106), util('RAMB18', 1, 150),
    util('Number of Slice Registers', 201, 41600),
  ]);
  // the reference FASM of blinky (the fork's CI): its LUTs of logic near Vivado's 94 on the same netlist, nextpnr's feed-throughs
  // (its 93 slices with a feature, 16 of them empty halves of a tile with NOCLKINV alone, #3683)
  assert.deepEqual(xc7FasmUtilization(gz('blinky.fasm.gz').toString('utf8')), { luts: 104, feedThroughs: 108, slices: 77 });
  // (without the part's resources: nextpnr's counts)
  assert.deepEqual(xc7PlacedUtilization({ utilization: { CARRY4: { available: 8150, used: 2 }, SLICE_FFX: { available: 65200, used: 3 } } }, [], util), [util('CARRY4', 2, 8150), util('Slice Registers', 3, 65200)]);
});

test('xc7: the occupied slices, an empty half of a tile nextpnr wrote (NOCLKINV alone) not counted (#3683)', () => {
  // (as nextpnr's write_logic writes a tile: both halves, the empty one with the FF block's default bit only)
  const tile = ['CLBLL_L_X2Y37.SLICEL_X0.ALUT.INIT[63:0] = 64\'b0110', 'CLBLL_L_X2Y37.SLICEL_X0.AFF.ZINI', 'CLBLL_L_X2Y37.SLICEL_X0.AFF.ZRST',
    'CLBLL_L_X2Y37.SLICEL_X0.FFSYNC', 'CLBLL_L_X2Y37.SLICEL_X0.NOCLKINV', 'CLBLL_L_X2Y37.SLICEL_X1.NOCLKINV', ''];
  // (the regression: two slices were counted, the tile's both halves)
  assert.deepEqual(xc7FasmUtilization(tile.join('\n')), { luts: 1, feedThroughs: 0, slices: 1 });
  // (a FASM with Windows' line ends the same)
  assert.equal(xc7FasmUtilization(tile.join('\r\n')).slices, 1);
  // a half with something but its LUTs: a flip-flop, a carry, an output mux, a feed-through LUT, an inverted clock
  for (const f of ['AFF.ZINI', 'CARRY4.ACY0', 'PRECYINIT.CIN', 'DOUTMUX.O5', 'CLKINV', 'CEUSEDMUX', `BLUT.INIT[63:0] = 64'b${'11110000'.repeat(8)}`]) {
    assert.equal(xc7FasmUtilization(`CLBLM_R_X3Y1.SLICEM_X0.${f}\nCLBLM_R_X3Y1.SLICEM_X0.NOCLKINV\nCLBLM_R_X3Y1.SLICEL_X1.NOCLKINV\n`).slices, 1, f);
  }
  // the clock-inversion bit alone in both halves, or a FASM with no slice: none; a routing pip of the tile's switch box is no slice
  assert.equal(xc7FasmUtilization('CLBLM_R_X3Y1.SLICEM_X0.NOCLKINV\nCLBLM_R_X3Y1.SLICEL_X1.NOCLKINV\nINT_R_X3Y1.LOGIC_OUTS4.IMUX12\n').slices, 0);
  assert.deepEqual(xc7FasmUtilization(''), { luts: 0, feedThroughs: 0, slices: 0 });
});

test('xc7: nextpnr\'s timing, its estimate, a clock net named as synthesis left it given its port\'s name', () => {
  const met = xc7Timing({ fmax: { '$abc$26582$aiger$o292': { achieved: 241.5458984375, constraint: 100 } } }, [{ net: 'clk', mhz: 100 }]);
  assert.deepEqual(met, { met: true, timingErrors: 0, minPeriodNs: 4.14, maxFreqMHz: 241.55, model: XC7_TIMING_MODEL,
    clocks: [{ clock: 'clk', achieved: 241.55, constraint: 100 }],
    constraints: [{ name: 'clk', constraint: 'create_clock clk: 10.000 ns (100 MHz)', timingErrors: 0, minPeriodNs: 4.14, maxFreqMHz: 241.55 }] });
  assert.match(XC7_TIMING_MODEL, /^nextpnr's estimate \(optimistic against Vivado/);
  // two clocks, one not met; a net with a name of its own kept; two ports of the same frequency: the net's own name
  const two = xc7Timing({ fmax: { pix: { achieved: 20, constraint: 25 }, $x: { achieved: 150, constraint: 100 } } }, [{ net: 'a', mhz: 100 }, { net: 'b', mhz: 100 }]);
  assert.deepEqual([two.met, two.timingErrors, two.maxFreqMHz, two.minPeriodNs, two.clocks.map(c => c.clock)], [false, 1, 20, 50, ['pix', '$x']]);
  assert.equal(xc7Timing({ fmax: {} }), null);
  assert.equal(xc7Timing({}), null);
  const text = xc7TimingText(two, PART);
  assert.match(text, /^Timing of xc7a35tcpg236-1 after Place & Route: nextpnr's estimate/);
  assert.match(text, /1\.2-1\.5 times the maximum frequency Vivado gives/);
  assert.match(text, /Clock pix: 20 MHz \(50\.000 ns\), constraint 25 MHz: NOT met\n/);
  assert.match(text, /1 constraint\(s\) not met \(nextpnr's estimate\)\./);
  assert.match(xc7TimingText(null, PART), /No clock constrained or timed/);
});

test('xc7: synth_xilinx\'s cells counted as the Design Summary\'s resources', () => {
  const counts = { LUT1: 2, LUT6: 10, FDRE: 7, FDCE_1: 1, LDCE: 1, CARRY4: 3, MUXF7: 2, MUXF8: 1, SRLC32E: 1, RAM64M: 1, RAMB18E1: 1, RAMB36E1: 2, DSP48E1: 3,
    BUFG: 1, IBUF: 4, OBUF: 5, IOBUF: 1, MMCME2_ADV: 1, VCC: 1 };
  assert.deepEqual(xc7Utilization(counts), { luts: 12, flipFlops: 8, latches: 1, ios: 10, carry: 3, muxes: 3, shiftRegisters: 1, distributedRam: 1,
    blockRam: 3, multipliers: 3, clockBuffers: 1, dcms: 1, cells: 48 });
});

test('xc7: the Artix-7\'s back end, its steps (nextpnr packs at Place & Route), XDC its constraints, synth_xilinx', () => {
  assert.equal(backendOf('artix7'), XC7);
  assert.deepEqual(XC7_STEPS.map(s => s.id), ['synth', 'translate', 'par', 'trce', 'bitgen']);
  assert.equal(XC7.constraints, XDC);
  assert.equal(XC7.synthName('luts', { report: 'Number of Slice LUTs' }), 'Number of Slice LUTs');
  assert.equal(XC7.synthName('ramb16', undefined), 'Block RAM Tiles');
  // (the other 7-series families keep ISE's flow: no back end of their own)
  assert.equal(backendOf('kintex7').id, 'other');
});

// the back end mounted alone: its io a map of files, the routed design an earlier run's
function mounted(files, more = {}) {
  const lines = [], report = { files: {} }, written = {};
  const io = { read: n => files[n] ?? null, write: (n, d) => { written[n] = d; return `build/${n}`; }, bitDb: () => loadBitDbXc7(PART), ...more.io };
  const steps = XC7.mount({ io, spec: { part: PART, device: 'xc7a35t', pkg: 'cpg236', resources: RESOURCES }, log: l => lines.push(l), report, util, top: 'blinky',
    now: () => 0, ms: () => '0.0 s', constraints: () => null, netlistText: () => null, readNetlist: () => {}, StepError, ...more.ctx }).steps;
  return { steps, lines, report, written };
}
// a .bit's header fields (a, b, c, d: key → text) and its configuration data (what follows the field e, its length)
function bitParts(bytes) {
  const header = {};
  let k = 13;
  for (; bytes[k] !== 0x65; k += 3 + ((bytes[k + 1] << 8) | bytes[k + 2])) {
    header[String.fromCharCode(bytes[k])] = new TextDecoder().decode(bytes.subarray(k + 3, k + 2 + ((bytes[k + 1] << 8) | bytes[k + 2])));
  }
  return { header, body: Buffer.from(bytes.subarray(k + 5)) };
}

test('xc7: Generate Programming File of the reference FASM: the configuration data byte-identical to Project X-Ray\'s, a header of Silinx\'s', () => {
  for (const name of ['blinky', 'vga', 'micro80']) {
    const { steps, lines, report, written } = mounted({ 'open/routed.fasm': gz(`${name}.fasm.gz`).toString('utf8') });
    steps.bitgen();
    const bit = bitParts(written['blinky.bit']), ref = bitParts(new Uint8Array(gz(`${name}.bitstream.gz`)));
    assert.ok(bit.body.equals(ref.body), `${name}: the configuration data differs from Project X-Ray's`);
    // (the header: the design and the part as Vivado writes them, the date and time of the run)
    assert.deepEqual([bit.header.a, bit.header.b, ref.header.a, ref.header.b], ['blinky;Generator=silinx-fpga', '7a35tcpg236', `build/${name}.frames;Generator=xc7frames2bit`, PART]);
    assert.match(`${bit.header.c} ${bit.header.d}`, /^\d{4}\/\d\d\/\d\d \d\d:\d\d:\d\d$/);
    assert.deepEqual(report.bit, { path: 'build/blinky.bit', size: written['blinky.bit'].length });
    assert.deepEqual(lines, [`Bitstream: build/blinky.bit (${written['blinky.bit'].length} bytes, from nextpnr's FASM on Project X-Ray's database)`]);
    assert.ok(readBitXc7(written['blinky.bit'], loadBitDbXc7(PART)).size > 0);
  }
});

test('xc7: Generate Programming File with no routed design, or a FASM the database does not have: the step\'s error', () => {
  assert.throws(() => mounted({}).steps.bitgen(), e => e instanceof StepError && e.message === 'no routed design: run Place & Route first');
  assert.throws(() => mounted({ 'open/routed.fasm': 'CLBLL_L_X2Y0.SLICEL_X0.NO_SUCH_FEATURE\n' }).steps.bitgen(),
    e => e instanceof StepError && /^the routed design's FASM cannot be written as a bitstream: /.test(e.message));
  assert.throws(() => mounted({}).steps.trce(), /no routed design: run Place & Route first/);
});

test('xc7: Static Timing of an earlier Place & Route: its report read again, the timing nextpnr\'s estimate', () => {
  const nreport = { fmax: { '$abc$1$o2': { achieved: 90, constraint: 100 } }, clockPorts: [{ net: 'clk', mhz: 100 }] };
  const { steps, lines, report, written } = mounted({ 'open/nextpnr-report.json': JSON.stringify(nreport) });
  steps.trce();
  assert.deepEqual(lines, [
    `Timing (${XC7_TIMING_MODEL}): 1 constraint(s) not met, minimum period 11.111 ns (90 MHz).`,
    'WARNING:Timing - the clock clk reaches 90 MHz, not the 100 MHz of its constraint (nextpnr\'s estimate).',
    'Timing report: build/open/timing.txt',
  ]);
  assert.equal(report.timing.met, false);
  assert.equal(report.timing.model, XC7_TIMING_MODEL);
  assert.match(written['open/timing.txt'], /Clock clk: 90 MHz/);
});

test('xc7: Place & Route without nextpnr in this installation: the step\'s error says how to install it', async () => {
  const netlist = JSON.stringify({ modules: { top: { attributes: { top: 1 }, ports: { clk: { direction: 'input', bits: [2] } }, cells: {}, netnames: {} } } });
  const { steps } = mounted({}, { ctx: { netlistText: () => netlist, top: 'top' } });
  await assert.rejects(steps.par(), e => e instanceof StepError && /nextpnr-himbaechel-xc7 is not in this installation/.test(e.message) && /npm install @silinx\/nextpnr-himbaechel-xc7/.test(e.hint));
});

test('xc7 #3767: a BSCANE2 handed to nextpnr as a BSCAN on its JTAG chain\'s site (Vivado\'s DRC PDRC-2), its JTAG chain (Yosys\'s 32 bits, a number, none: 1); its chain\'s feature on the CFG_CENTER_MID tile', () => {
  const nl = cells => JSON.stringify({ modules: { top: { attributes: { top: '1' }, cells } } });
  const bscan = p => ({ type: 'BSCANE2', parameters: p === undefined ? {} : { JTAG_CHAIN: p }, attributes: {}, connections: {} });
  const plain = nl({ a: { type: 'LUT1', parameters: {}, connections: {} } });
  assert.deepEqual(xc7BscanCells(plain), { text: plain, chains: [] });
  const r = xc7BscanCells(nl({ b: bscan('00000000000000000000000000000011'), c: bscan(1), e: { type: 'LUT1', parameters: {}, connections: {} } }));
  assert.deepEqual(r.chains, [3, 1]);
  assert.deepEqual(Object.values(JSON.parse(r.text).modules.top.cells).map(c => [c.type, c.attributes?.BEL]), [['BSCAN', 'X46Y124/BSCAN_X0Y2.BSCAN'], ['BSCAN', 'X46Y124/BSCAN_X0Y0.BSCAN'], ['LUT1', undefined]]);
  assert.deepEqual(xc7BscanCells(nl({ d: bscan() })).chains, [1]);
  assert.throws(() => xc7BscanCells(nl({ b: bscan(5) })), /a BSCANE2's JTAG_CHAIN is 1 to 4, not 5/);
  assert.throws(() => xc7BscanCells(nl({ b: bscan(2), c: bscan('2') })), /two BSCANE2s on the JTAG chain 2/);
  const db = loadBitDbXc7(PART);
  assert.equal(xc7BscanFeatures(db, []), '');
  assert.equal(xc7BscanFeatures(db, [1, 4]), 'CFG_CENTER_MID_X46Y32.BSCAN.JTAG_CHAIN_1\nCFG_CENTER_MID_X46Y32.BSCAN.JTAG_CHAIN_4\n');
  assert.match(xc7BscanFeatures(loadBitDbXc7('xc7a100tcsg324-1'), [2]), /^CFG_CENTER_MID_X\d+Y\d+\.BSCAN\.JTAG_CHAIN_2\n$/);
  // (the chain's bits: Project X-Ray's, two frames of the tile, bit 2162 of frame 26 for the chain 1)
  assert.deepEqual([...db.featureBits('CFG_CENTER_MID_X46Y32', 'BSCAN.JTAG_CHAIN_1', 0, '')].length, 1);
});

test('xc7 #3767: the BSCAN sites\' 44 PIPs to and from the fabric pseudo-PIPs of the bit database (measured with Vivado: no bit), on both parts', async () => {
  const { MEASURED_PPIPS } = await import('../research/xc7/measured-ppips.mjs');
  const pips = MEASURED_PPIPS.CFG_CENTER_MID;
  assert.equal(new Set(pips).size, 44);
  // (each of the 11 pins of the 4 sites once: TDO from an IMUX wire, the outputs onto a LOGIC_OUTS wire)
  for (const k of [1, 2, 3, 4]) {
    assert.deepEqual(pips.filter(p => p.includes(`BSCAN${k}_`)).map(p => /BSCAN\d_(\w+)/.exec(p)[1]).sort(), ['CAPTURE', 'DRCK', 'RESET', 'RUNTEST', 'SEL', 'SHIFT', 'TCK', 'TDI', 'TDO', 'TMS', 'UPDATE']);
    assert.match(pips.find(p => p.includes(`BSCAN${k}_TDO`)), new RegExp(`^CFG_CENTER_BSCAN${k}_TDO\\.CFG_CENTER_IMUX\\d+_\\d+$`));
  }
  for (const part of [PART, 'xc7a100tcsg324-1']) {
    const db = loadBitDbXc7(part), tile = db.tiles().find(n => db.tile(n).type === 'CFG_CENTER_MID');
    for (const p of pips) assert.deepEqual([...db.featureBits(tile, p, 0, '')], [], `${part} ${p}`);
  }
  // (a routed BSCAN's FASM as nextpnr writes it, the chain's feature added: its only bit the chain's)
  const db = loadBitDbXc7(PART);
  const fasm = ['CFG_CENTER_MID_X46Y32.CFG_CENTER_LOGIC_OUTS_B20_2.CFG_CENTER_BSCAN1_DRCK', 'CFG_CENTER_MID_X46Y32.CFG_CENTER_BSCAN1_TDO.CFG_CENTER_IMUX33_3', 'CFG_CENTER_MID_X46Y32.BSCAN.JTAG_CHAIN_1'].join('\n');
  const { frames } = fasmToFrames(db, fasm), base = fasmToFrames(db, '').frames;
  const set = fr => [...fr].flatMap(([a, w]) => [...w].flatMap((x, i) => Array.from({ length: 32 }, (_, b) => ((x >>> b) & 1 ? `${a}:${i * 32 + b}` : null)))).filter(Boolean);
  const extra = set(frames).filter(k => !set(base).includes(k));
  assert.deepEqual(extra.length, 1);
});
