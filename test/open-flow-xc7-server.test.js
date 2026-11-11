// The local server runs the 7-series' back end (#3146): its status (the Basys 3's xc7a35t and the Nexys A7's xc7a100t
// have Project X-Ray's bit database, #3145; another part not), its steps, and every example (gates … micro80) on the
// Basys 3 and on the Nexys A7 from HDL to its .bit (server/open-flow.js, its own process server/open-flow-run.js: Yosys's
// synth_xilinx, nextpnr-himbaechel-xc7, the bitstream from nextpnr's FASM) with the XDC the board's pin assignment
// writes: no warning, every clock at the board's 100 MHz by nextpnr's estimate, the .bit read back as its part's; the
// build folder has no ISE file. The .bit
// checked against nextpnr's FASM with no Vivado (#3145, readback.js and roundtrip.js, apart from the generator): its frames
// the ones fasm2frames makes of the FASM, and read back into features no bit lost and none stray. A pin the package does
// not have: Place & Route's failure, no bitstream.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStatus, openSteps, runOpenImplementation } from '../server/open-flow.js';
import { parseBitHeader } from '../server/programmer.js';
import { loadBitDbXc7 } from '../packages/silinx-fpga/src/node.js';
import { readBitXc7 } from '../packages/silinx-fpga/src/fpga/xc7/bitstream.js';
import { bitIndexXc7, readBitFramesXc7 } from '../packages/silinx-fpga/src/fpga/xc7/readback.js';
import { referenceFrames, roundTrip } from '../packages/silinx-fpga/src/fpga/xc7/roundtrip.js';
import { XC7_DB_DIR } from '../packages/silinx-fpga/src/fpga/xc7/bitdb-node.js';
import zlib from 'node:zlib';
import { EXAMPLES, exampleProject, XC7_TARGETS } from './examples-lib.mjs';

const BASYS3 = { family: 'artix7', part: 'xc7a35t', package: 'cpg236', speed: '-1' };
const NEXYSA7 = { family: 'artix7', part: 'xc7a100t', package: 'csg324', speed: '-1' };
// each board's part: its slices and their registers, its pins, its .bit's name and ID code, its frames (the part's, the
// tiles' fasm2frames writes)
const PARTS = {
  basys3: { part: 'xc7a35tcpg236-1', slices: 5200, regs: 41600, iobs: 106, bitPart: '7a35tcpg236', idcode: 0x362d093, frames: [5408, 4974] },
  'nexys-a7': { part: 'xc7a100tcsg324-1', slices: 15850, regs: 126800, iobs: 210, bitPart: '7a100tcsg324', idcode: 0x3631093, frames: [9448, 9012] },
};

test('openStatus: the xc7a35t (Basys 3) and the xc7a100t (Nexys A7) are available with their steps; another part has no bit database', () => {
  for (const [board, part] of [[BASYS3, 'xc7a35tcpg236-1'], [NEXYSA7, 'xc7a100tcsg324-1']]) {
    const st = openStatus(board);
    assert.deepEqual([st.available, st.part, st.device, st.graph, st.bitDb], [true, part, board.part, null, true]);
    assert.deepEqual(st.steps, ['synth', 'translate', 'par', 'trce', 'bitgen']);
    assert.equal(st.reason, `${part}: nextpnr-himbaechel (xilinx) and Project X-Ray's bit database (the 7-series, an experimental family, #3146)`);
  }
  // (another package of the xc7a100t: no bit database)
  const ftg = openStatus({ family: 'artix7', part: 'xc7a100t', package: 'ftg256', speed: '-1' });
  assert.equal(ftg.available, false);
  assert.equal(ftg.reason, 'no 7-series bit database for the xc7a100tftg256-1 yet (only xc7a100tcsg324-1, xc7a35tcpg236-1): use AMD Vivado for this device');
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

for (const { board } of XC7_TARGETS) test(`every example on the ${board} through the 7-series' back end: no warning, its .bit, 100 MHz met by nextpnr's estimate`, async t => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc7-'));
  const P = PARTS[board];
  const db = loadBitDbXc7(P.part);
  const index = bitIndexXc7(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(XC7_DB_DIR, `${P.part}.json.gz`))).toString('utf8')));
  try {
    for (const name of EXAMPLES) {
      await t.test(name, async () => {
        const { dir, project } = exampleProject(name, { board }, tmp);
        const { lines, result, error } = await run(dir, project);
        assert.equal(error, undefined, error?.message);
        assert.deepEqual(warnings(lines), [], name);
        assert.deepEqual(result.completedSteps, ['synth', 'translate', 'par', 'trce', 'bitgen']);
        const r = result.reports;
        assert.equal(r.source, 'open');
        assert.equal(r.par.engine, 'nextpnr');
        assert.equal(r.par.router, 'router2');
        // the resources: the synthesis's, then nextpnr's held to the part's (the xc7a35t's slices' 41,600 registers, its
        // 106 pins; the xc7a100t's 126,800 and 210)
        assert.ok(r.synthesis.utilization.find(u => u.name === 'Number of Slice LUTs').used > 0, name);
        const row = n => r.map.utilization.find(u => u.name === n), regs = row('Number of Slice Registers'), iob = row('Number of bonded IOBs');
        if (name !== 'gates') assert.ok(row('Number of Slice LUTs').used > 0 && row('Number of occupied Slices').total === P.slices, name);
        assert.equal(iob.total, P.iobs);
        if (name !== 'gates') assert.equal(regs.total, P.regs);
        // the timing: nextpnr's estimate; gates has no clock
        assert.match(r.timing.model, /^nextpnr's estimate/);
        if (name === 'gates') assert.deepEqual([r.timing.met, r.timing.constraints], [null, []]);
        else {
          assert.equal(r.timing.met, true, name);
          assert.deepEqual(r.timing.constraints.map(c => c.name), ['clk']);
          assert.ok(r.timing.maxFreqMHz >= 100, `${name}: ${r.timing.maxFreqMHz} MHz`);
        }
        assert.ok(fs.readFileSync(path.join(dir, 'build/open/timing.txt'), 'utf8').startsWith(`Timing of ${P.part} after Place & Route: nextpnr's estimate`));
        // the .bit: the part's, its frames read back
        const bit = fs.readFileSync(path.join(dir, `build/${project.top}.bit`));
        assert.equal(r.bit.size, bit.length);
        const h = parseBitHeader(bit);
        assert.deepEqual([h.designName, h.rawDesign, h.part], [project.top, `${project.top};Generator=silinx-fpga`, P.bitPart]);
        assert.ok([...readBitXc7(new Uint8Array(bit), db).values()].filter(w => w.some(Boolean)).length > 0, name);
        // checked against nextpnr's FASM (#3145): its frames fasm2frames' (the part's others zeros), the round trip by bits
        // clean, nothing added (no STEPDOWN in a bank of LVCMOS33, no required feature, no PUDC_B pull-up asked)
        const fasm = fs.readFileSync(path.join(dir, 'build/open/routed.fasm'), 'utf8');
        const ref = referenceFrames(index, fasm), back = readBitFramesXc7(new Uint8Array(bit), index);
        assert.equal(back.idcode, P.idcode);
        let differ = 0;
        for (const [a, w] of back.frames) if (!(ref.get(a) ?? new Uint32Array(101)).every((x, i) => x === w[i])) differ++;
        assert.deepEqual([differ, back.frames.size, ref.size], [0, ...P.frames], `${name}: frames not fasm2frames'`);
        const rt = roundTrip(index, fasm, back.frames);
        assert.deepEqual([rt.lost, rt.stray, rt.unknown, rt.missing, rt.extra], [[], [], [], [], []], name);
        assert.deepEqual([rt.counts.aliases, rt.counts.added], [0, { required: 0, pudc: 0, stepdown: 0 }], name);
        assert.ok(rt.counts.pseudoPips > 0 && rt.counts.zeroEncodings > 0, `${name}: ${JSON.stringify(rt.counts)}`);
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
