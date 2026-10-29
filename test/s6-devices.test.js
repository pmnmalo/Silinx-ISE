// The Spartan-6 devices of the Silinx toolchain (#722, packages/silinx-fpga/src/fpga/s6/devices.js): the parts of the Nexys3 and the
// Atlys with UG380's configuration facts, and the developer flag SILINX_SPARTAN6_OPEN under which the open flow
// takes them with the steps it has for them (the synthesis and its simulation model); without the flag the
// Spartan-6 is refused as before. The flagged flow end to end: the gates example on the Nexys3.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S6_DEVICES, S6_OPEN_STEPS, spartan6Open, s6OpenStatus } from '../packages/silinx-fpga/src/fpga/s6/devices.js';
import { resolveBoard } from '../server/devices.js';
import * as OF from '../server/open-flow.js';

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

test('openStatus: a Spartan-6 refused without the flag; with it the boards\' parts available for the synthesis and its model, the others refused', () => {
  const off = OF.openStatus(DEV('xc6slx16'), { env: {} });
  assert.equal(off.available, false);
  assert.match(off.reason, /^the Silinx toolchain does not support the spartan6 family yet \(only the Spartan-3E /);
  assert.equal(off.steps, undefined);
  const on = OF.openStatus(DEV('xc6slx16'), { env: FLAG });
  assert.deepEqual([on.available, on.part, on.device, on.steps], [true, 'xc6slx16csg324-3', 'xc6slx16', S6_OPEN_STEPS]);
  assert.equal(on.reason, 'xc6slx16csg324-3: the Spartan-6 under development (SILINX_SPARTAN6_OPEN): synthesis and the post-synthesis simulation model only, no implementation yet (#1)');
  assert.equal(OF.openStatus(DEV('xc6slx45'), { env: FLAG }).available, true);
  const lx9 = OF.openStatus(DEV('xc6slx9'), { env: FLAG });
  assert.equal(lx9.available, false);
  assert.equal(lx9.reason, 'the Silinx toolchain for the Spartan-6 is for the XC6SLX16 (CSG324, Nexys3), XC6SLX45 (CSG324, Atlys) only (SILINX_SPARTAN6_OPEN): use an ISE mode for the xc6slx9');
  const ftg = OF.openStatus(DEV('xc6slx16', 'ftg256'), { env: FLAG });
  assert.equal(ftg.available, false);
  assert.equal(ftg.reason, 'the Silinx toolchain for the Spartan-6 has the xc6slx16 in the csg324 package only (SILINX_SPARTAN6_OPEN): use an ISE mode for the ftg256');
  // the Spartan-3E as before, with or without the flag
  for (const env of [{}, FLAG]) assert.equal(OF.openStatus({ family: 'spartan3e', part: 'xc3s250e', package: 'cp132', speed: '-4' }, { env }).available, true);
  assert.deepEqual(s6OpenStatus('xc6slx16', 'csg324', 'p').steps, ['synth', 'postsynth']);
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

test('runOpenImplementation under the flag: the gates example on the Nexys3, synthesized for the XC6SLX16 with its post-synthesis model; Map refused', { timeout: 300000 }, async () => {
  const before = process.env.SILINX_SPARTAN6_OPEN;
  process.env.SILINX_SPARTAN6_OPEN = '1';
  const { dir, project } = nexys3Gates();
  try {
    const j = job();
    const r = await OF.runOpenImplementation(j, { project, projectDir: dir, steps: ['synth', 'postsynth'] });
    assert.deepEqual(r.completedSteps, ['synth', 'postsynth'], j.lines.join('\n'));
    // (the one warning: the design has no pins, as any design without a UCF)
    assert.deepEqual(j.lines.filter(l => /^(WARNING|ERROR)/.test(l)), ['WARNING: 6 port bit(s) have no LOC constraint (sw<0>, sw<1>, sw<2>, sw<3>, led<0>, led<1>): Silinx assigns free I/O pins automatically - do NOT program real hardware with this bitstream']);
    assert.ok(j.lines.includes('Device: xc6slx16csg324-3: the Spartan-6 under development (SILINX_SPARTAN6_OPEN): synthesis and the post-synthesis simulation model only, no implementation yet (#1).'), j.lines.join('\n'));
    const model = fs.readFileSync(path.join(dir, 'build/netgen/synthesis/gates_synthesis.vhd'), 'utf8');
    assert.match(model, /^-- Post-Synthesis Simulation Model of 'gates' \(xc6slx16csg324-3\)/);
    assert.match(model, /: LUT\d\n/);
    // the steps it does not have: refused before anything runs
    const j2 = job();
    await assert.rejects(OF.runOpenImplementation(j2, { project, projectDir: dir, steps: ['map'] }), /^Error: Silinx toolchain: no translate, map for xc6slx16csg324-3 yet \(only synth, postsynth\)$/);
    assert.equal(j2.lines.at(-1), 'ERROR: the Silinx toolchain has no translate, map for this device yet: xc6slx16csg324-3: the Spartan-6 under development (SILINX_SPARTAN6_OPEN): synthesis and the post-synthesis simulation model only, no implementation yet (#1).');
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
