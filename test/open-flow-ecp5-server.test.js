// The local server runs the ECP5's back end (#2302): its status, its steps and a project from HDL to its .bit (server/open-flow.js,
// its own process server/open-flow-run.js) with an LPF, the reports of the Design Summary and the Processes pane; the build
// folder has no ISE file, the .bit no Xilinx header read; YoWASP's package downloaded on first use as the iCE40's (#2444).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStatus, openSteps, runOpenImplementation } from '../server/open-flow.js';
import { OWN_TOOLS, ownCacheDir, ownPackage, loadOwn } from '../server/nextpnr-ice40-fetch.js';
import { fakeTgz } from './helpers-fake-tgz.mjs';

const DEVICE = { family: 'ecp5', part: 'lfe5u-85f', package: 'cabga381', speed: '-6' };
const BLINKY = 'module blinky(input clk, output reg led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23]; end\nendmodule\n';
const config = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-config-'));
process.env.SILINX_CONFIG_DIR = config;
test.after(() => fs.rmSync(config, { recursive: true, force: true }));

test('openStatus: an ECP5 part is available, its speed in its name, with its steps; a part nextpnr-ecp5 does not have is not', () => {
  const st = openStatus(DEVICE);
  assert.deepEqual([st.available, st.part, st.device, st.graph, st.reason], [true, 'lfe5u-85f-6cabga381', 'lfe5u-85f', null, 'lfe5u-85f-6cabga381: nextpnr-ecp5 and ecppack']);
  assert.deepEqual(st.steps, ['synth', 'translate', 'par', 'bitgen']);
  const bad = openStatus({ ...DEVICE, part: 'lfe5u-99f' });
  assert.equal(bad.available, false);
  assert.match(bad.reason, /^lfe5u-99f: not an ECP5 part of nextpnr-ecp5 \(lfe5u-12f, /);
  // (the iCE40's as before)
  assert.equal(openStatus({ family: 'ice40', part: 'ice40up5k', package: 'sg48', speed: '' }).part, 'ice40up5ksg48');
});

test('openSteps: the ECP5\'s list, as the iCE40\'s', () => {
  const family = 'ecp5';
  assert.deepEqual(openSteps(undefined, { family }), ['synth', 'translate', 'par', 'bitgen']);
  assert.deepEqual(openSteps(['map'], { family }), ['synth', 'translate', 'par']);
  assert.deepEqual(openSteps(['bitgen'], { family, synthUpToDate: true }), ['translate', 'par', 'bitgen']);
  assert.throws(() => openSteps(['trce'], { family }), /no step trce/);
});

test('nextpnr-ecp5 downloaded on first use: its version and SHA-512 of package-lock.json, kept in its own folder', async () => {
  const NAME = '@yowasp/nextpnr-ecp5';
  assert.deepEqual(OWN_TOOLS[NAME], { tools: 'nextpnr-ecp5 and ecppack', mb: 30, dir: 'nextpnr-ecp5' });
  const lock = ownPackage(NAME);
  assert.match(lock.url, /^https:\/\/registry\.npmjs\.org\/@yowasp\/nextpnr-ecp5\/-\/nextpnr-ecp5-[\d.]+\.tgz$/);
  const { bytes, integrity } = fakeTgz({ 'package.json': '{"type":"module"}', 'gen/bundle.js': 'export const runNextpnrEcp5 = "the fake";\n' });
  const pkg = { version: '0.0.1', url: 'https://registry.test/e.tgz', integrity }, log = [];
  const m = await loadOwn(NAME, { pkg, fetchFn: async () => new Response(bytes), installed: async () => { throw Object.assign(new Error('no'), { code: 'ERR_MODULE_NOT_FOUND' }); }, log: l => log.push(l) });
  assert.equal(m.runNextpnrEcp5, 'the fake');
  assert.equal(ownCacheDir(NAME, '0.0.1'), path.join(config, 'nextpnr', 'nextpnr-ecp5-0.0.1'));
  assert.deepEqual(log, [`Place & Route: downloading nextpnr-ecp5 and ecppack (about 30 MB, from registry.test: once, then kept in ${ownCacheDir(NAME, '0.0.1')})…`]);
  await assert.rejects(loadOwn(NAME, { pkg: null, installed: async () => { throw Object.assign(new Error('no'), { code: 'ERR_MODULE_NOT_FOUND' }); } }), /^Error: nextpnr-ecp5 is not installed: npm install @yowasp\/nextpnr-ecp5$/);
});

async function run(constraints) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-ecp5-'));
  fs.writeFileSync(path.join(dir, 'blinky.v'), BLINKY);
  if (constraints) fs.writeFileSync(path.join(dir, 'blinky.lpf'), constraints);
  const lines = [];
  const job = { log: l => lines.push(l), result: null, cancelled: false, procs: new Set() };
  const project = { name: 'blinky', top: 'blinky', device: DEVICE, files: [{ path: 'blinky.v', lang: 'verilog', role: 'design' }], ...(constraints && { constraints: 'blinky.lpf' }) };
  try {
    return { dir, lines, result: await runOpenImplementation(job, { project, projectDir: dir, steps: ['bitgen'] }) };
  } catch (e) { return { dir, lines, error: e }; }
}
const warnings = lines => lines.join('\n').split('\n').filter(l => /WARNING/.test(l));

test('a project of the ECP5 from HDL to its .bit in the server\'s process, at its LPF\'s pins, no warnings; its reports', async () => {
  const { dir, lines, result, error } = await run('LOCATE COMP "clk" SITE "G2";\nLOCATE COMP "led" SITE "B2";\nFREQUENCY PORT "clk" 25 MHZ;\n');
  try {
    assert.equal(error, undefined, error?.message);
    assert.deepEqual(warnings(lines), []);
    assert.deepEqual(result.completedSteps, ['synth', 'translate', 'par', 'bitgen']);
    assert.equal(fs.statSync(path.join(dir, 'build/blinky.bit')).size, 1927725);
    // the Design Summary's: the bitstream (its size, no header read), the utilization, the clock
    const r = result.reports;
    assert.deepEqual([r.bit.size, r.bit.header ?? null, r.summary.bitstream], [1927725, null, true]);
    assert.equal(r.par.engine, 'nextpnr');
    assert.deepEqual(r.par.fmax.map(f => [f.clock, f.constraint]), [['clk', 25]]);
    assert.ok(r.par.constraintsMet);
    assert.deepEqual(r.map.utilization.map(u => u.name), ['DCCA', 'TRELLIS_COMB', 'TRELLIS_FF', 'TRELLIS_IO']);
    // (the synthesis's lines by the part's resources: the LUTs and flip-flops of its total)
    assert.deepEqual(r.synthesis.utilization.map(u => [u.name, u.total]), [['Number of 4 input LUTs', 83640], ['Number of Slice Flip Flops', 83640], ['Number of carry cells', null]]);
    assert.equal(r.files.routed, 'build/open/routed.config');
    assert.ok(lines.join('\n').includes('constraints: blinky.lpf, 2 pin location(s), 1 PERIOD constraint(s).'));
    // (no ISE file in the build folder, the LPF's name kept)
    const build = fs.readdirSync(path.join(dir, 'build'));
    assert.ok(build.includes('blinky.lpf'));
    assert.deepEqual(build.filter(f => /\.(xst|prj|ut|ucf|sh)$/.test(f)), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the ECP5\'s failure in the server: the step named, no bitstream', async () => {
  const { dir, result, error, lines } = await run('LOCATE COMP "clk" SITE "ZZ99";\n');
  try {
    assert.equal(result, undefined);
    assert.match(error.message, /Silinx toolchain failed in step 'par'/);
    assert.ok(lines.join('\n').includes('nextpnr-ecp5 failed'));
    assert.equal(fs.existsSync(path.join(dir, 'build/blinky.bit')), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
