// The local server runs the iCE40's back end (#2295): its status, its steps and a project from HDL to its .bin
// (server/open-flow.js, its own process server/open-flow-run.js), with a PCF; the build folder has no ISE file.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStatus, openSteps, runOpenImplementation } from '../server/open-flow.js';

const DEVICE = { family: 'ice40', part: 'ice40up5k', package: 'sg48' };
const BLINKY = 'module blinky(input clk, output reg led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23]; end\nendmodule\n';

test('openStatus: an iCE40 part is available, with its steps; a part nextpnr-ice40 does not have is not', () => {
  const st = openStatus(DEVICE);
  assert.equal(st.available, true);
  assert.equal(st.part, 'ice40up5ksg48');
  assert.equal(st.graph, null);
  assert.deepEqual(st.steps, ['synth', 'translate', 'par', 'bitgen']);
  const bad = openStatus({ ...DEVICE, part: 'ice40xx9k' });
  assert.equal(bad.available, false);
  assert.match(bad.reason, /^ice40xx9k: not an iCE40 part of nextpnr-ice40/);
});

test('openSteps: the iCE40\'s list; a Xilinx family\'s chain as it was', () => {
  const family = 'ice40';
  assert.deepEqual(openSteps(undefined, { family }), ['synth', 'translate', 'par', 'bitgen']);
  assert.deepEqual(openSteps(['par'], { family }), ['synth', 'translate', 'par']);
  assert.deepEqual(openSteps(['bitgen'], { family, synthUpToDate: true }), ['translate', 'par', 'bitgen']);
  assert.deepEqual(openSteps(['map'], { family }), ['synth', 'translate', 'par']);   // (Implement's chain: nextpnr maps in its Place & Route, #2463)
  assert.throws(() => openSteps(['trce'], { family }), /no step trce/);
  assert.deepEqual(openSteps(['par'], { family: 'spartan3e' }), openSteps(['par']));
  assert.ok(openSteps(['par']).includes('map'));
});

async function run(constraints) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ice40-'));
  fs.writeFileSync(path.join(dir, 'blinky.v'), BLINKY);
  if (constraints) fs.writeFileSync(path.join(dir, 'blinky.pcf'), constraints);
  const lines = [];
  const job = { log: l => lines.push(l), result: null, cancelled: false, procs: new Set() };
  const project = { name: 'blinky', top: 'blinky', device: DEVICE, files: [{ path: 'blinky.v', lang: 'verilog', role: 'design' }], ...(constraints && { constraints: 'blinky.pcf' }) };
  try {
    return { dir, lines, result: await runOpenImplementation(job, { project, projectDir: dir, steps: ['bitgen'] }) };
  } catch (e) { return { dir, lines, error: e }; }
}
const warnings = lines => lines.join('\n').split('\n').filter(l => /WARNING/.test(l));

test('a project of the iCE40 from HDL to its .bin in the server\'s process, at its PCF\'s pins, no warnings', async () => {
  const { dir, lines, result, error } = await run('set_io clk 35\nset_io led 11\nset_frequency clk 12\n');
  try {
    assert.equal(error, undefined, error?.message);
    assert.deepEqual(warnings(lines), []);
    assert.deepEqual(result.completedSteps, ['synth', 'translate', 'par', 'bitgen']);
    assert.equal(fs.statSync(path.join(dir, 'build/blinky.bin')).size, 104090);
    assert.equal(result.reports.bit.size, 104090);
    assert.equal(result.reports.summary.bitstream, true);
    assert.equal(result.reports.par.engine, 'nextpnr');
    assert.ok(lines.join('\n').includes('constraints: blinky.pcf, 2 pin location(s), 1 PERIOD constraint(s).'));
    // (no ISE file in the build folder, the PCF's name kept)
    const build = fs.readdirSync(path.join(dir, 'build'));
    assert.ok(build.includes('blinky.pcf'));
    assert.deepEqual(build.filter(f => /\.(xst|prj|ut|ucf|sh)$/.test(f)), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the iCE40\'s failure in the server: the step named, no bitstream', async () => {
  const { dir, result, error, lines } = await run('set_io clk 999\nset_io led 11\n');
  try {
    assert.equal(result, undefined);
    assert.match(error.message, /Silinx toolchain failed in step 'par'/);
    assert.ok(lines.join('\n').includes('nextpnr-ice40 failed'));
    assert.equal(fs.existsSync(path.join(dir, 'build/blinky.bin')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
