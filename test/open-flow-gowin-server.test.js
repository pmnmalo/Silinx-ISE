// The local server runs the Gowin's back end (#2303): its status, its steps and a project from HDL to its .fs (server/open-flow.js, its
// own process server/open-flow-run.js; gowin_pack Silinx's port, reading the package's files) with a CST, the reports of the Design
// Summary; YoWASP's package downloaded on first use.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openStatus, openSteps, runOpenImplementation } from '../server/open-flow.js';
import { OWN_TOOLS, ownPackage } from '../server/nextpnr-ice40-fetch.js';

const DEVICE = { family: 'gowin', part: 'gw1nr-9c', package: 'qn88', speed: '-6' };
const BLINKY = 'module blinky(input clk, output reg led);\n  reg [23:0] c = 0;\n  always @(posedge clk) begin c <= c + 1; led <= c[23]; end\nendmodule\n';
const config = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-config-'));
process.env.SILINX_CONFIG_DIR = config;
test.after(() => fs.rmSync(config, { recursive: true, force: true }));

test('openStatus: the GW1NR-9C in its QN88 is available, nextpnr and gowin_pack; another device is not', () => {
  const st = openStatus(DEVICE);
  assert.deepEqual([st.available, st.part, st.graph, st.reason], [true, 'gw1nr-9c-6qn88', null, 'gw1nr-9c-6qn88: nextpnr-himbaechel-gowin and gowin_pack']);
  assert.deepEqual(st.steps, ['synth', 'translate', 'par', 'trce', 'bitgen']);
  const bad = openStatus({ ...DEVICE, package: 'qn48' });
  assert.equal(bad.available, false);
  assert.equal(bad.reason, 'gw1nr-9c-qn48-6: not a Gowin device of nextpnr-himbaechel-gowin here (gw1nr-9c/qn88-6)');
});

test('openSteps: the Gowin\'s list, as the ECP5\'s', () => {
  const family = 'gowin';
  assert.deepEqual(openSteps(undefined, { family }), ['synth', 'translate', 'par', 'trce', 'bitgen']);
  assert.deepEqual(openSteps(['map'], { family }), ['synth', 'translate', 'par']);
  assert.deepEqual(openSteps(['trce'], { family }), ['synth', 'translate', 'par', 'trce']);   // (#2300: nextpnr's timing)
  assert.throws(() => openSteps(['xpwr'], { family }), /no step xpwr/);
});

test('nextpnr-himbaechel-gowin downloaded on first use: at package-lock.json\'s version and SHA-512', () => {
  assert.deepEqual(OWN_TOOLS['@yowasp/nextpnr-himbaechel-gowin'], { tools: 'nextpnr-himbaechel-gowin and gowin_pack', mb: 32, dir: 'nextpnr-himbaechel-gowin' });
  assert.match(ownPackage('@yowasp/nextpnr-himbaechel-gowin').url, /^https:\/\/registry\.npmjs\.org\/@yowasp\/nextpnr-himbaechel-gowin\/-\/nextpnr-himbaechel-gowin-[\d.]+\.tgz$/);
});

async function run(constraints, steps = ['bitgen']) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-gowin-'));
  fs.writeFileSync(path.join(dir, 'blinky.v'), BLINKY);
  if (constraints) fs.writeFileSync(path.join(dir, 'blinky.cst'), constraints);
  const lines = [];
  const job = { log: l => lines.push(l), result: null, cancelled: false, procs: new Set() };
  const project = { name: 'blinky', top: 'blinky', device: DEVICE, files: [{ path: 'blinky.v', lang: 'verilog', role: 'design' }], ...(constraints && { constraints: 'blinky.cst' }) };
  try {
    return { dir, lines, result: await runOpenImplementation(job, { project, projectDir: dir, steps }) };
  } catch (e) { return { dir, lines, error: e }; }
}
const warnings = lines => lines.join('\n').split('\n').filter(l => /WARNING/.test(l));

test('a project of the Gowin to its .fs in the server\'s process, at its CST\'s pins, no warnings; its reports', async () => {
  const { dir, lines, result, error } = await run('IO_LOC "clk" 52;\nIO_LOC "led" 10;\nIO_PORT "led" IO_TYPE=LVCMOS18;\n// create_clock -name clk -period 37.037 [get_ports {clk}]\n');
  try {
    assert.equal(error, undefined, error?.message);
    assert.deepEqual(warnings(lines), []);
    assert.deepEqual(result.completedSteps, ['synth', 'translate', 'par', 'bitgen']);
    const r = result.reports;
    assert.deepEqual([r.bit.size, r.bit.header ?? null, r.summary.bitstream], [2069320, null, true]);
    assert.equal(fs.statSync(path.join(dir, 'build/blinky.fs')).size, 2069320);
    assert.deepEqual(r.par.fmax.map(f => [f.clock, f.constraint]), [['clk', 27]]);
    assert.ok(r.par.constraintsMet);
    assert.ok(r.map.utilization.some(u => u.name === 'LUT4'));
    assert.equal(r.files.routed, 'build/open/routed.json');
    assert.ok(lines.join('\n').includes('constraints: blinky.cst, 2 pin location(s), 1 PERIOD constraint(s).'));
    const build = fs.readdirSync(path.join(dir, 'build'));
    assert.deepEqual(build.filter(f => /\.(bit|bin|xst|prj|ut|ucf|sh)$/.test(f)), []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the Gowin\'s port with no pin in the server: the step named, the ports said', async () => {
  const { dir, result, error, lines } = await run('IO_LOC "clk" 52;\n');
  try {
    assert.equal(result, undefined);
    assert.match(error.message, /Silinx toolchain failed in step 'par'/);
    assert.ok(lines.join('\n').includes('1 port(s) with no pin (IO_LOC in the CST): led: nextpnr-himbaechel-gowin places no port without one'));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
