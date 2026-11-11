// The local server runs the 7-series' back end (#3146): its status (the Basys 3's xc7a35t has Project X-Ray's bit
// database, the Nexys A7's xc7a100t not yet), its steps, and every example (gates … micro80) on the Basys 3 from HDL to
// its .bit (server/open-flow.js, its own process server/open-flow-run.js: Yosys's synth_xilinx, nextpnr-himbaechel-xc7,
// the bitstream from nextpnr's FASM) with the XDC the board's pin assignment writes: no warning, every clock at the
// board's 100 MHz by nextpnr's estimate, the .bit read back as the xc7a35t's; the build folder has no ISE file. A pin the
// package does not have: Place & Route's failure, no bitstream.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStatus, openSteps, runOpenImplementation } from '../server/open-flow.js';
import { parseBitHeader } from '../server/programmer.js';
import { loadBitDbXc7 } from '../packages/silinx-fpga/src/node.js';
import { readBitXc7 } from '../packages/silinx-fpga/src/fpga/xc7/bitstream.js';
import { EXAMPLES, exampleProject } from './examples-lib.mjs';

const BASYS3 = { family: 'artix7', part: 'xc7a35t', package: 'cpg236', speed: '-1' };

test('openStatus: the xc7a35t (Basys 3) is available with its steps; the xc7a100t (Nexys A7) has no bit database yet', () => {
  const st = openStatus(BASYS3);
  assert.deepEqual([st.available, st.part, st.device, st.graph, st.bitDb], [true, 'xc7a35tcpg236-1', 'xc7a35t', null, true]);
  assert.deepEqual(st.steps, ['synth', 'translate', 'par', 'trce', 'bitgen']);
  assert.match(st.reason, /^xc7a35tcpg236-1: nextpnr-himbaechel \(xilinx\) and Project X-Ray's bit database \(experimental/);
  const a7 = openStatus({ family: 'artix7', part: 'xc7a100t', package: 'csg324', speed: '-1' });
  assert.equal(a7.available, false);
  assert.equal(a7.reason, 'no 7-series bit database for the xc7a100tcsg324-1 yet (only xc7a35tcpg236-1): use AMD Vivado for this device');
});

test('openSteps: the 7-series\' list (nextpnr maps in its Place & Route); the Spartan-3E\'s chain as it was', () => {
  const family = 'artix7';
  assert.deepEqual(openSteps(undefined, { family }), ['synth', 'translate', 'par', 'trce', 'bitgen']);
  assert.deepEqual(openSteps(['synth', 'translate', 'map', 'par'], { family }), ['synth', 'translate', 'par']);   // (Implement Design's chain)
  assert.deepEqual(openSteps(['trce'], { family }), ['synth', 'translate', 'par', 'trce']);
  assert.deepEqual(openSteps(['bitgen'], { family, synthUpToDate: true }), ['translate', 'par', 'bitgen']);
  assert.throws(() => openSteps(['postpar'], { family }), /no step postpar/);
  assert.throws(() => openSteps(['prombit'], { family }), /no step prombit/);
  assert.ok(openSteps(['par'], { family: 'spartan3e' }).includes('map'));
});

async function run(dir, project, steps = ['synth', 'translate', 'par', 'trce', 'bitgen']) {
  const lines = [];
  const job = { log: l => lines.push(l), result: null, cancelled: false, procs: new Set() };
  try {
    return { lines, result: await runOpenImplementation(job, { project, projectDir: dir, steps }) };
  } catch (e) { return { lines, error: e }; }
}
const warnings = lines => lines.join('\n').split('\n').filter(l => /WARNING|ERROR/.test(l));

test('every example on the Basys 3 through the 7-series\' back end: no warning, its .bit, 100 MHz met by nextpnr\'s estimate', async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc7-'));
  const db = loadBitDbXc7('xc7a35tcpg236-1');
  try {
    for (const name of EXAMPLES) {
      await t.test(name, async () => {
        const { dir, project } = exampleProject(name, { board: 'basys3' }, tmp);
        const { lines, result, error } = await run(dir, project);
        assert.equal(error, undefined, error?.message);
        assert.deepEqual(warnings(lines), [], name);
        assert.deepEqual(result.completedSteps, ['synth', 'translate', 'par', 'trce', 'bitgen']);
        const r = result.reports;
        assert.equal(r.source, 'open');
        assert.equal(r.par.engine, 'nextpnr');
        assert.equal(r.par.router, 'router2');
        // the resources: the synthesis's, then nextpnr's held to the xc7a35t's (its slices' 41,600 registers, its 106 pins)
        assert.ok(r.synthesis.utilization.find(u => u.name === 'Number of Slice LUTs').used > 0, name);
        const regs = r.map.utilization.find(u => u.name === 'Slice Registers'), iob = r.map.utilization.find(u => u.name === 'Bonded IOB');
        assert.equal(iob.total, 106);
        if (name !== 'gates') assert.equal(regs.total, 41600);
        // the timing: nextpnr's estimate; gates has no clock
        assert.match(r.timing.model, /^nextpnr's estimate/);
        if (name === 'gates') assert.deepEqual([r.timing.met, r.timing.constraints], [null, []]);
        else {
          assert.equal(r.timing.met, true, name);
          assert.deepEqual(r.timing.constraints.map(c => c.name), ['clk']);
          assert.ok(r.timing.maxFreqMHz >= 100, `${name}: ${r.timing.maxFreqMHz} MHz`);
        }
        assert.match(fs.readFileSync(path.join(dir, 'build/open/timing.txt'), 'utf8'), /^Timing of xc7a35tcpg236-1 after Place & Route: nextpnr's estimate/);
        // the .bit: the xc7a35t's, its frames read back
        const bit = fs.readFileSync(path.join(dir, `build/${project.top}.bit`));
        assert.equal(r.bit.size, bit.length);
        const h = parseBitHeader(bit);
        assert.deepEqual([h.designName, h.rawDesign, h.part], [project.top, `${project.top};Generator=silinx-fpga`, '7a35tcpg236']);
        assert.ok([...readBitXc7(new Uint8Array(bit), db).values()].filter(w => w.some(Boolean)).length > 0, name);
        // (no ISE file in the build folder, the XDC's name kept)
        const build = fs.readdirSync(path.join(dir, 'build'));
        assert.ok(build.includes(path.basename(project.constraints)), build.join(' '));
        assert.deepEqual(build.filter(f => /\.(xst|prj|ut|ucf|sh)$/.test(f)), []);
      });
    }
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test('the 7-series\' failure in the server: a pin the package does not have, Place & Route\'s error, no bitstream', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc7-'));
  try {
    const { dir, project } = exampleProject('gates', { board: 'basys3' }, tmp);
    const xdc = path.join(dir, project.constraints);
    fs.writeFileSync(xdc, fs.readFileSync(xdc, 'utf8').replace(/PACKAGE_PIN \w+/, 'PACKAGE_PIN ZZ99'));
    const { lines, result, error } = await run(dir, project);
    assert.equal(result, undefined);
    assert.match(error.message, /Silinx toolchain failed in step 'par'/);
    assert.ok(lines.some(l => /^ERROR:Silinx - nextpnr failed/.test(l)), lines.join('\n'));
    assert.equal(fs.existsSync(path.join(dir, `build/${project.top}.bit`)), false);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
