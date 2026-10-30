// The Spartan-6 devices of the Silinx toolchain (#722, packages/silinx-fpga/src/fpga/s6/devices.js): the parts of the Nexys3 and the
// Atlys with UG380's configuration facts, and the developer flag SILINX_SPARTAN6_OPEN under which the open flow
// takes them with the steps it has for them (the synthesis and its simulation model, Map, Place & Route and the
// static timing, #732); without the flag the Spartan-6 is refused as before. The flagged flow end to end: the gates
// example on the Nexys3, and the blinky example with the Nexys3's pins and clock, timed.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S6_DEVICES, S6_OPEN_STEPS, spartan6Open, s6OpenStatus } from '../packages/silinx-fpga/src/fpga/s6/devices.js';
import { resolveBoard } from '../server/devices.js';
import * as OF from '../server/open-flow.js';
import { parseXdl } from '../packages/silinx-fpga/src/xdl.js';
import { readBit6, bitFormat6, emptyFdri, FRAME_WORDS } from '../packages/silinx-fpga/src/fpga/s6/bitstream.js';
import { predictDesign } from '../packages/silinx-fpga/src/fpga/s6/bitgen.js';
import { loadBitDbS6 } from '../packages/silinx-fpga/src/fpga/s6/bitdb-node.js';
import { loadDeviceCache } from '../packages/silinx-fpga/src/fpga/device-node.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FLAG = { SILINX_SPARTAN6_OPEN: '1' };
const DEV = (part, pkg = 'csg324') => ({ family: 'spartan6', part, package: pkg, speed: '-3' });

test('S6_DEVICES: the parts of the Nexys3 and the Atlys (their boards\' devices), UG380\'s IDCODE, frame length and configuration size', () => {
  assert.deepEqual(Object.keys(S6_DEVICES), ['xc6slx16', 'xc6slx45']);
  for (const [board, dev] of [['nexys3', 'xc6slx16'], ['atlys', 'xc6slx45']]) {
    const d = resolveBoard(board).device;
    assert.deepEqual([d.family, d.part, d.package], ['spartan6', dev, S6_DEVICES[dev].pkg], board);
  }
  assert.deepEqual(Object.values(S6_DEVICES).map(d => [d.part, d.idcode.toString(16).padStart(8, '0'), d.frameWords, d.configBits, d.measured]),
    [['6slx16csg324', '04002093', 65, 3731264, false], ['6slx45csg324', '04008093', 65, 11939296, false]]);
});

test('spartan6Open: the flag SILINX_SPARTAN6_OPEN=1 only', () => {
  assert.equal(spartan6Open(FLAG), true);
  for (const env of [{}, { SILINX_SPARTAN6_OPEN: '0' }, { SILINX_SPARTAN6_OPEN: 'yes' }, null]) assert.equal(spartan6Open(env), false, JSON.stringify(env));
  assert.equal(spartan6Open({ ...process.env, SILINX_SPARTAN6_OPEN: undefined }), false);
});

test('openStatus: a Spartan-6 refused without the flag; with it the boards\' parts available for the steps the toolchain has, the others refused', () => {
  const off = OF.openStatus(DEV('xc6slx16'), { env: {} });
  assert.equal(off.available, false);
  assert.match(off.reason, /^the Silinx toolchain does not support the spartan6 family yet \(only the Spartan-3E /);
  assert.equal(off.steps, undefined);
  const on = OF.openStatus(DEV('xc6slx16'), { env: FLAG });
  assert.deepEqual([on.available, on.part, on.device, on.steps], [true, 'xc6slx16csg324-3', 'xc6slx16', S6_OPEN_STEPS]);
  assert.equal(on.reason, 'xc6slx16csg324-3: the Spartan-6 under development (SILINX_SPARTAN6_OPEN): synthesis, its post-synthesis simulation model, Map, Place & Route, the static timing, the bitstream only (#732)');
  assert.equal(OF.openStatus(DEV('xc6slx45'), { env: FLAG }).available, true);
  const lx9 = OF.openStatus(DEV('xc6slx9'), { env: FLAG });
  assert.equal(lx9.available, false);
  assert.equal(lx9.reason, 'the Silinx toolchain for the Spartan-6 is for the XC6SLX16 (CSG324, Nexys3), XC6SLX45 (CSG324, Atlys) only (SILINX_SPARTAN6_OPEN): use an ISE mode for the xc6slx9');
  const ftg = OF.openStatus(DEV('xc6slx16', 'ftg256'), { env: FLAG });
  assert.equal(ftg.available, false);
  assert.equal(ftg.reason, 'the Silinx toolchain for the Spartan-6 has the xc6slx16 in the csg324 package only (SILINX_SPARTAN6_OPEN): use an ISE mode for the ftg256');
  // the Spartan-3E as before, with or without the flag
  for (const env of [{}, FLAG]) assert.equal(OF.openStatus({ family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, { env }).available, true);
  assert.deepEqual(s6OpenStatus('xc6slx16', 'csg324', 'p').steps, ['synth', 'postsynth', 'translate', 'map', 'par', 'trce', 'bitgen', 'prombit']);
  // the shipped device description for Map and Place & Route
  assert.match(on.graph, /xc6slx16csg324-3\.json\.gz$/);
  assert.equal(on.shipped, true);
});

// the gates example as a project for the Nexys3's part (its HDL and test bench; no board and no UCF: no pins are needed
// before Map)
function nexys3Gates() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-s6-'));
  const project = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/gates/silinx.json'), 'utf8'));
  for (const f of project.files) { fs.mkdirSync(path.join(dir, path.dirname(f.path)), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'examples/gates', f.path), path.join(dir, f.path)); }
  const { board, constraints, ...rest } = project;
  return { dir, project: { ...rest, name: 'gates', device: resolveBoard('nexys3').device } };
}
const job = () => { const lines = []; return { lines, log: l => lines.push(l), procs: new Set(), cancelled: false }; };

test('runOpenImplementation under the flag: the gates example on the Nexys3, synthesized for the XC6SLX16 with its post-synthesis model, mapped, placed, routed and timed; the power estimate refused', { timeout: 300000 }, async () => {
  const before = process.env.SILINX_SPARTAN6_OPEN;
  process.env.SILINX_SPARTAN6_OPEN = '1';
  const { dir, project } = nexys3Gates();
  try {
    const j = job();
    const r = await OF.runOpenImplementation(j, { project, projectDir: dir, steps: ['synth', 'postsynth'] });
    assert.deepEqual(r.completedSteps, ['synth', 'postsynth'], j.lines.join('\n'));
    // (the one warning: the design has no pins, as any design without a UCF)
    assert.deepEqual(j.lines.filter(l => /^(WARNING|ERROR)/.test(l)), ['WARNING: 6 port bit(s) have no LOC constraint (sw<0>, sw<1>, sw<2>, sw<3>, led<0>, led<1>): Silinx assigns free I/O pins automatically - do NOT program real hardware with this bitstream']);
    assert.ok(j.lines.includes('Device: xc6slx16csg324-3: the Spartan-6 under development (SILINX_SPARTAN6_OPEN): synthesis, its post-synthesis simulation model, Map, Place & Route, the static timing, the bitstream only (#732).'), j.lines.join('\n'));
    const model = fs.readFileSync(path.join(dir, 'build/netgen/synthesis/gates_synthesis.vhd'), 'utf8');
    assert.match(model, /^-- Post-Synthesis Simulation Model of 'gates' \(xc6slx16csg324-3\)/);
    assert.match(model, /: LUT\d\n/);
    // Map, Place & Route and the timing: the design placed, routed, checked and timed (no clock: its pads' paths)
    const j3 = job();
    const r3 = await OF.runOpenImplementation(j3, { project, projectDir: dir, steps: ['translate', 'map', 'par', 'trce'] });
    assert.deepEqual(r3.completedSteps, ['synth', 'translate', 'map', 'par', 'trce'], j3.lines.join('\n'));
    // (the same one warning: no pins without a UCF)
    assert.deepEqual(j3.lines.filter(l => /^(WARNING|ERROR)/.test(l)), ['WARNING: 6 port bit(s) have no LOC constraint (sw<0>, sw<1>, sw<2>, sw<3>, led<0>, led<1>): Silinx assigns free I/O pins automatically - do NOT program real hardware with this bitstream'], j3.lines.join('\n'));
    assert.ok(j3.lines.some(l => /^Routed \d+ nets \(\d+ PIPs, \d+ passes\)/.test(l)) && j3.lines.includes('All signals are completely routed.'), j3.lines.join('\n'));
    const timing = fs.readFileSync(path.join(dir, 'build/open/timing.txt'), 'utf8');
    assert.match(timing, /^Static timing analysis of gates \(Silinx toolchain, delay model of fpga\/s6\/timing\.js, fitted to ISE's trce\)/);
    assert.match(timing, /pad to pad:\n {2}sw<0> +-> led<0> +\d+\.\d{3} ns/);
    // the steps it does not have: refused before anything runs
    const j2 = job();
    await assert.rejects(OF.runOpenImplementation(j2, { project, projectDir: dir, steps: ['xpwr'] }), /^Error: Silinx toolchain: no xpwr for xc6slx16csg324-3 yet \(only synth, postsynth, translate, map, par, trce, bitgen, prombit\)$/);
  } finally {
    if (before === undefined) delete process.env.SILINX_SPARTAN6_OPEN; else process.env.SILINX_SPARTAN6_OPEN = before;
    fs.rmSync(dir, { recursive: true, force: true });
  }
  // without the flag: refused as before
  const { dir: d2, project: p2 } = nexys3Gates();
  try {
    const j = job();
    await assert.rejects(OF.runOpenImplementation(j, { project: p2, projectDir: d2, steps: ['synth'] }), /Silinx toolchain not available for xc6slx16csg324-3: the Silinx toolchain does not support the spartan6 family yet/);
  } finally { fs.rmSync(d2, { recursive: true, force: true }); }
});

// an example with the board's pins and clock (its UCF for the board, test/examples-lib.mjs): the blinky example on
// the Nexys3 and the Atlys through Map, Place & Route, the timing and the bitstream (its frame data every bit the bit
// databases give the routed design), no warning, its PERIOD constraint met (the Atlys's seven-segment display on its
// VHDCI connector, #732)
test('runOpenImplementation under the flag: the blinky example on the Nexys3 and the Atlys, placed, routed, timed against its PERIOD and written as a bitstream', { timeout: 600000 }, async () => {
  const { exampleUcf } = await import('./examples-lib.mjs');
  const before = process.env.SILINX_SPARTAN6_OPEN;
  process.env.SILINX_SPARTAN6_OPEN = '1';
  try {
    for (const [board, part] of [['nexys3', 'xc6slx16csg324-3'], ['atlys', 'xc6slx45csg324-3']]) {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-s6-'));
      try {
        const project = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/blinky/silinx.json'), 'utf8'));
        for (const f of project.files) { fs.mkdirSync(path.join(dir, path.dirname(f.path)), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'examples/blinky', f.path), path.join(dir, f.path)); }
        fs.mkdirSync(path.join(dir, path.dirname(project.constraints)), { recursive: true });
        fs.writeFileSync(path.join(dir, project.constraints), exampleUcf('blinky', { board }).text);
        const j = job();
        const r = await OF.runOpenImplementation(j, { project: { ...project, name: 'blinky', board, device: resolveBoard(board).device }, projectDir: dir, steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'] });
        // (bitgen with its PROM file, the start-up clock Cclk)
        assert.deepEqual(r.completedSteps, ['synth', 'translate', 'map', 'par', 'trce', 'bitgen', 'prombit'], `${board}\n${j.lines.join('\n')}`);
        assert.deepEqual(j.lines.filter(l => /^(WARNING|ERROR)/.test(l)), [], `${board}\n${j.lines.join('\n')}`);
        assert.ok(j.lines.some(l => /^constraint PERIOD 10 ns on clk: met \(period \d+\.\d{3} ns, slack \d+\.\d{3} ns\)$/.test(l)), `${board}\n${j.lines.join('\n')}`);
        assert.ok(j.lines.includes('All constraints were met.'), board);
        // the report: one clock under its 10 ns, the routed design and its timing written
        assert.equal(r.reports.timing?.met, true, board);
        assert.ok(r.reports.timing.minPeriodNs > 2 && r.reports.timing.minPeriodNs < 10, `${board} ${r.reports.timing.minPeriodNs}`);
        for (const f of ['placed.xdl', 'routed.xdl', 'timing.txt']) assert.ok(fs.existsSync(path.join(dir, 'build/open', f)), `${board} ${f}`);
        // the bitstream: the part's, CRC on, JTAG start-up (the project's), its frame data every bit the routed design has
        const bit = readBit6(fs.readFileSync(path.join(dir, 'build/top.bit')));
        assert.deepEqual([bit.header.a, bit.header.b, bit.crc, bit.startupClk, bit.rewrites.length], ['top.ncd;UserID=0xFFFFFFFF', part.replace(/^xc/, '').replace(/-\d$/, ''), true, 'JtagClk', 0], board);
        assert.ok(bit.crcChecks.length && bit.crcChecks.every(c => c.expected === c.computed), board);
        assert.equal(readBit6(fs.readFileSync(path.join(dir, 'build/top_prom.bit'))).startupClk, 'Cclk', board);
        const routed = parseXdl(fs.readFileSync(path.join(dir, 'build/open/routed.xdl'), 'utf8')), dev = bitFormat6(part.replace(/^xc/, '').replace(/-\d$/, ''));
        const { bits, unknown } = predictDesign(routed, loadDeviceCache(part), dev, loadBitDbS6(part));
        assert.deepEqual([...unknown], [], board);
        const empty = emptyFdri(dev), set = [];
        for (let w = 0; w < bit.fdri.length; w++) { const x = bit.fdri[w] ^ empty[w]; for (let i = 0; i < 16; i++) if ((x >> (15 - i)) & 1) set.push(`${Math.floor(w / FRAME_WORDS)},${(w % FRAME_WORDS) * 16 + i}`); }
        assert.deepEqual(set.sort(), [...bits].sort(), board);
        assert.ok(j.lines.some(l => /^Bitstream: build\/top\.bit \(\d+ bytes/.test(l)), board);
      } finally { fs.rmSync(dir, { recursive: true, force: true }); }
    }
  } finally { if (before === undefined) delete process.env.SILINX_SPARTAN6_OPEN; else process.env.SILINX_SPARTAN6_OPEN = before; }
});

// stopwatch on the Nexys3 (a block RAM, three DSP48A1s): routed on the switches whose bits the databases have, through
// the bitstream, with no warning (#2045)
test('runOpenImplementation under the flag: the stopwatch example on the Nexys3 through the bitstream, its block RAM\'s frame written again', { timeout: 600000 }, async () => {
  const { exampleUcf } = await import('./examples-lib.mjs');
  const before = process.env.SILINX_SPARTAN6_OPEN;
  process.env.SILINX_SPARTAN6_OPEN = '1';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-s6-'));
  try {
    const project = JSON.parse(fs.readFileSync(path.join(ROOT, 'examples/stopwatch/silinx.json'), 'utf8'));
    for (const f of project.files) { fs.mkdirSync(path.join(dir, path.dirname(f.path)), { recursive: true }); fs.copyFileSync(path.join(ROOT, 'examples/stopwatch', f.path), path.join(dir, f.path)); }
    fs.mkdirSync(path.join(dir, path.dirname(project.constraints)), { recursive: true });
    fs.writeFileSync(path.join(dir, project.constraints), exampleUcf('stopwatch', { board: 'nexys3' }).text);
    const j = job();
    const r = await OF.runOpenImplementation(j, { project: { ...project, name: 'stopwatch', board: 'nexys3', device: resolveBoard('nexys3').device }, projectDir: dir, steps: ['synth', 'translate', 'map', 'par', 'trce', 'bitgen'] });
    assert.deepEqual(r.completedSteps, ['synth', 'translate', 'map', 'par', 'trce', 'bitgen', 'prombit'], j.lines.join('\n'));
    // no warning (the synthesis's block-RAM port resizing is Yosys's mapping, not the design's: QUIET, #2045)
    assert.deepEqual(j.lines.filter(l => /^(WARNING|ERROR)/.test(l)), [], j.lines.join('\n'));
    assert.ok(j.lines.includes('All constraints were met.'));
    const bit = readBit6(fs.readFileSync(path.join(dir, `build/${project.top}.bit`)));
    assert.equal(bit.rewrites.length, 1);
    assert.equal(bit.rewrites[0].far[1], 23);
  } finally {
    if (before === undefined) delete process.env.SILINX_SPARTAN6_OPEN; else process.env.SILINX_SPARTAN6_OPEN = before;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
