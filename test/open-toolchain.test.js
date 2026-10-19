// The toolchain mode 'silinx' (server/open-flow.js): Implement Design and Generate Programming File
// without Xilinx ISE through the REST API, for real on examples/blinky (the device description of the
// XC3S250E-CP132 and its bit database ship with Silinx), the clear failures (a device without a bit
// database or a description, a design with errors, the ISE-only steps), Stop, the FPGA view of the
// routed design, and the job that builds a device description from the user's ISE (fake xdl / docker /
// ssh of test/server-helpers.js, the small report test/fixtures/fpga/route-device.xdlrc).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import fss from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { scratchEnv, makeFakes, isolatedPath, startApp, waitJob, waitLine, writeConfig, HERE, POSIX_ONLY } from './server-helpers.js';

let tmp, fakes, app, jobs, P, oldPath, OF, tc;
const XDLRC = path.join(HERE, 'fixtures', 'fpga', 'route-device.xdlrc');   // xc3s50etq144-4
// fake xdl: "xdl -report -pips -all_conns <part> <out>" copies $FAKE_XDLRC (FAKE_XDL_FAIL: fails)
const FAKE_XDL = `#!/bin/sh
for a in "$@"; do last="$a"; done
[ -n "$FAKE_XDL_LOG" ] && echo "xdl $*" >> "$FAKE_XDL_LOG"
[ -n "$FAKE_XDL_FAIL" ] && { echo "ERROR:xdl - fake failure" >&2; exit 2; }
echo "Release 14.7 - xdl P.20131013 (fake)"
cp "$FAKE_XDLRC" "$last"
`;

before(async () => {
  tmp = await scratchEnv('silinx-open-test-');
  fakes = await makeFakes(tmp);
  await fs.writeFile(path.join(fakes.ise, 'xdl'), FAKE_XDL, { mode: 0o755 });
  oldPath = process.env.PATH;
  process.env.PATH = isolatedPath(fakes.ise, fakes.docker, fakes.ssh);
  process.env.FAKE_XDLRC = XDLRC;
  process.env.FAKE_SSH_HOME = path.join(tmp, 'remote-home');
  jobs = await import('../server/jobs.js');
  P = await import('../server/projects.js');
  OF = await import('../server/open-flow.js');
  tc = await import('../server/toolchain.js');
  app = await startApp();
});
after(async () => {
  for (const j of jobs.listJobs()) if (j.status === 'running') jobs.cancelJob(j.id);
  for (let i = 0; i < 300 && jobs.listJobs().some(j => j.status === 'running'); i++) await new Promise(r => setTimeout(r, 10));
  await app.close();
  process.env.PATH = oldPath;
  await fs.rm(tmp, { recursive: true, force: true });
});

const DEV = (part, pkg, family = 'spartan3e') => ({ family, part, package: pkg, speed: '-4' });

async function implement(name, body = {}) {
  const r = await app.call('POST', `/projects/${name}/implement`, body);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body.job;
}

test('openStatus: available for the Basys2 and Nexys2 parts; why not for the other devices', () => {
  const ok = OF.openStatus(DEV('xc3s250e', 'cp132'));
  assert.equal(ok.available, true, ok.reason);
  assert.equal(ok.part, 'xc3s250ecp132-4');
  assert.equal(ok.shipped, true);
  assert.match(ok.reason, /xc3s250ecp132-4: device description \(shipped with Silinx\) and bit database/);
  // the other boards' parts (stage E): Basys2-100, Nexys2-500, Nexys2-1200
  for (const [part, pkg] of [['xc3s100e', 'cp132'], ['xc3s500e', 'fg320'], ['xc3s1200e', 'fg320']]) {
    const s = OF.openStatus(DEV(part, pkg));
    assert.equal(s.available, true, `${part}: ${s.reason}`);
    assert.equal(s.shipped, true);
    assert.equal(OF.hasBitDatabase(part, pkg), true, part);
  }
  // a Spartan-3E without a bit database
  const s1600 = OF.openStatus(DEV('xc3s1600e', 'fg320'));
  assert.equal(s1600.available, false);
  assert.equal(s1600.canBuild, false);
  assert.equal(s1600.reason, 'no bit database for xc3s1600e yet (only the XC3S100E (CP132), XC3S250E (CP132), XC3S500E (FG320), XC3S1200E (FG320)): use an ISE mode for this device');
  // same chip, another package: the pads of that package are not measured
  const tq = OF.openStatus(DEV('xc3s250e', 'tq144'));
  assert.equal(tq.available, false);
  assert.equal(tq.canBuild, false);
  assert.equal(tq.reason, 'no bit database for the pads of the xc3s250e in the tq144 package yet (only cp132): use an ISE mode for this device');
  // a package with its pads in the database but no device description: not supported (developers can build it from ISE)
  const dbDir = path.join(tmp, 'bitdb');
  fss.mkdirSync(dbDir, { recursive: true });
  for (const f of ['s3e-tiles.json', 'xc3s250e-layout.json', 'xc3s250e-lut.json']) fss.copyFileSync(path.join(OF.BIT_DB_DIR, f), path.join(dbDir, f));
  fss.writeFileSync(path.join(dbDir, 'xc3s250e-tq144-pads.json'), '{"padFeatures":{}}');
  const tq2 = OF.openStatus(DEV('xc3s250e', 'tq144'), { dbDir });
  assert.equal(tq2.available, false);
  assert.equal(tq2.canBuild, true);
  assert.equal(tq2.reason, 'no device description of xc3s250etq144-4 ships with Silinx (the Silinx toolchain supports the XC3S250E (TQ144)): use an ISE mode for this device');
  const s6 = OF.openStatus(DEV('xc6slx16', 'csg324', 'spartan6'));
  assert.equal(s6.available, false);
  assert.match(s6.reason, /does not support the spartan6 family yet \(only the Spartan-3E XC3S100E \(CP132\), XC3S250E/);
  assert.equal(OF.hasBitDatabase('xc3s250e'), true);
  assert.equal(OF.hasBitDatabase('xc3s250e', 'tq144'), false);
  assert.equal(OF.hasBitDatabase('xc3s1600e'), false);
});

test('openSteps: the chain up to the last step; the ISE-only steps are refused', () => {
  assert.deepEqual(OF.openSteps(['synth']), ['synth']);
  assert.deepEqual(OF.openSteps(['synth', 'translate', 'map']), ['synth', 'translate', 'map']);
  assert.deepEqual(OF.openSteps(['map']), ['synth', 'translate', 'map']);
  assert.deepEqual(OF.openSteps(['synth', 'translate', 'map', 'par']), ['synth', 'translate', 'map', 'par', 'trce']);
  assert.deepEqual(OF.openSteps(['bitgen']), ['synth', 'translate', 'map', 'par', 'trce', 'bitgen', 'prombit']);
  assert.deepEqual(OF.openSteps([]), ['synth', 'translate', 'map', 'par', 'trce', 'bitgen', 'prombit']);
  assert.deepEqual(OF.openSteps(['fpgaview']), ['synth', 'translate', 'map', 'par', 'trce', 'fpgaview']);
  // Back-annotate Pin Locations: the pins of the placement, after Place & Route, before the bitstream (#118)
  assert.deepEqual(OF.openSteps(['synth', 'translate', 'map', 'par', 'pin2ucf']), ['synth', 'translate', 'map', 'par', 'trce', 'pin2ucf']);
  assert.deepEqual(OF.openSteps(['pin2ucf']), ['synth', 'translate', 'map', 'par', 'trce', 'pin2ucf']);
  assert.deepEqual(OF.openSteps(['bitgen', 'pin2ucf']), ['synth', 'translate', 'map', 'par', 'trce', 'pin2ucf', 'bitgen', 'prombit']);
  // the Post-Synthesis Simulation Model: the Silinx toolchain's own since #120, after the synthesis
  assert.deepEqual(OF.openSteps(['synth', 'postsynth']), ['synth', 'postsynth']);
  assert.deepEqual(OF.openSteps(['postsynth', 'bitgen']), ['synth', 'postsynth', 'translate', 'map', 'par', 'trce', 'bitgen', 'prombit']);
  // Generate Text Power Report: the Silinx toolchain's estimate since #123, after Place & Route and its
  // timing (and the pins), before the bitstream
  assert.deepEqual(OF.openSteps(['xpwr']), ['synth', 'translate', 'map', 'par', 'trce', 'xpwr']);
  assert.deepEqual(OF.openSteps(['bitgen', 'pin2ucf', 'xpwr']), ['synth', 'translate', 'map', 'par', 'trce', 'pin2ucf', 'xpwr', 'bitgen', 'prombit']);
  // (as the application asks for it: the steps up to Place & Route, then xpwr)
  assert.deepEqual(OF.openSteps(['translate', 'map', 'par', 'xpwr'], { synthUpToDate: true }), ['translate', 'map', 'par', 'trce', 'xpwr']);
  // the Post-Translate and Post-Map Simulation Models: the Silinx toolchain's own since #121; Post-Place & Route needs ISE
  assert.deepEqual(OF.openSteps(['synth', 'translate', 'map', 'postmap', 'posttrans']), ['synth', 'translate', 'posttrans', 'map', 'postmap']);
  assert.throws(() => OF.openSteps(['synth', 'postmap', 'postpar']), /not available in the Silinx toolchain \(they need Xilinx ISE\): postpar/);
  // the synthesis up to date (#280): from Translate on when it is not asked for; asked for, it runs
  const up = { synthUpToDate: true };
  assert.deepEqual(OF.openSteps(['translate', 'map', 'par', 'bitgen'], up), ['translate', 'map', 'par', 'trce', 'bitgen', 'prombit']);
  assert.deepEqual(OF.openSteps(['bitgen'], up), ['translate', 'map', 'par', 'trce', 'bitgen', 'prombit']);
  assert.deepEqual(OF.openSteps(['map'], up), ['translate', 'map']);
  assert.deepEqual(OF.openSteps(['synth', 'translate'], up), ['synth', 'translate']);
  assert.deepEqual(OF.openSteps(['synth'], up), ['synth']);
});

test('toolchain configuration: the Silinx toolchain mode, its ISE for device descriptions, the status', async () => {
  // a configuration saved before the rename (#28) says 'open': read and saved as 'silinx'
  await fs.mkdir(tc.configDir(), { recursive: true });
  await fs.writeFile(tc.configPath(), JSON.stringify({ mode: 'open' }));
  assert.equal((await tc.loadConfig()).mode, 'silinx');
  assert.equal((await tc.saveConfig({ mode: 'open' })).mode, 'silinx');
  const cfg = await tc.saveConfig({ mode: 'silinx', open: { iseMode: 'ssh' } });
  assert.equal(cfg.mode, 'silinx');
  assert.equal(tc.iseModeOf(cfg), 'ssh');
  assert.equal(tc.iseModeOf({ mode: 'docker', open: { iseMode: 'ssh' } }), 'docker');
  await assert.rejects(tc.saveConfig({ open: { iseMode: 'cloud' } }), /invalid open.iseMode 'cloud' \(local\|docker\|ssh\)/);
  const st = tc.iseStatus(cfg, { ise: {}, helpers: {} });
  assert.equal(st.available, true);
  assert.match(st.reason, /^Silinx toolchain \(experimental, no ISE\)/);
  assert.match(st.help, /needs no Xilinx tool/);
  await app.call('POST', '/projects', { name: 'Stat', device: DEV('xc3s1600e', 'fg320') });
  const r = await app.call('GET', '/toolchain?project=Stat');
  assert.equal(r.body.ise.mode, 'silinx');
  assert.equal(r.body.deviceBuilder.mode, 'ssh');
  assert.equal(r.body.deviceBuilder.available, false);
  // (the tools are checked first: a Windows runner may have no tar on the test's PATH)
  assert.match(r.body.deviceBuilder.reason, process.platform === 'win32' ? /no ssh host configured|tar not found/ : /no ssh host configured/);
  assert.equal(r.body.open.available, false);
  assert.match(r.body.open.reason, /no bit database for xc3s1600e yet/);
  assert.equal((await app.call('GET', '/toolchain')).body.open, undefined);
  assert.equal((await app.call('GET', '/projects/Stat/open-status')).body.part, 'xc3s1600efg320-4');
});

test('open mode: Implement + Generate Programming File of blinky, for real: steps, reports, bitstream, FPGA view', { timeout: 420000 }, async () => {
  await writeConfig({ mode: 'silinx' });
  const c = await app.call('POST', '/projects', { name: 'Blinky', template: 'blinky' });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  const id = await implement('Blinky', { steps: ['synth', 'translate', 'map', 'par', 'bitgen'] });
  const j = await waitJob(jobs, id, { timeoutMs: 400000 });
  const log = j.lines.join('\n');
  assert.equal(j.status, 'ok', log);
  assert.equal(j.meta.toolchain, 'silinx');
  assert.deepEqual(j.result.completedSteps, ['synth', 'translate', 'map', 'par', 'trce', 'bitgen', 'prombit']);
  assert.equal(j.result.mode, 'silinx');
  // the same step markers as ISE's run.sh, in order
  assert.deepEqual(j.lines.filter(l => /^=== SILINX/.test(l)), ['synth', 'translate', 'map', 'par', 'trce', 'bitgen', 'prombit'].map(s => `=== SILINX STEP ${s} ===`).concat('=== SILINX DONE ==='));
  assert.match(log, /Device: xc3s250ecp132-4: device description \(shipped with Silinx\) and bit database\./);
  assert.match(log, /Number of occupied Slices: \d+ out of 2448 \d+%/);
  assert.match(log, /All signals are completely routed\./);
  assert.match(log, /constraint PERIOD 20 ns on clk: met/);
  assert.match(log, /Bitstream: build\/top\.bit \(\d+ bytes, every feature in the bit database\)/);
  // the warnings, exactly: none for blinky (Yosys's "Shift register inference not yet supported
  // for family xc3se", printed on every run, is not one: core/synth-open.js QUIET)
  assert.deepEqual(j.lines.filter(l => /warning/i.test(l)), []);
  assert.deepEqual(j.result.warnings, []);
  const dir = P.projectDir('Blinky');
  for (const f of ['open/top.json', 'open/placed.xdl', 'open/routed.xdl', 'open/timing.txt', 'top.bit', 'top_prom.bit', 'reports.json']) assert.ok(fss.existsSync(path.join(dir, 'build', f)), f);
  // the Design Summary's reports
  const rep = (await app.call('GET', '/projects/Blinky/reports')).body;
  assert.equal(rep.source, 'open');
  assert.equal(rep.summary.synthesized, true);
  assert.equal(rep.summary.routed, true);
  assert.equal(rep.summary.timingMet, true);
  assert.equal(rep.summary.bitstream, true);
  assert.ok(rep.summary.maxFreqMHz > 50);
  assert.deepEqual(rep.map.utilization.map(u => u.name), ['Number of Slice Flip Flops', 'Number of 4 input LUTs', 'Number of occupied Slices', 'Number of bonded IOBs', 'Number of BUFGMUXs']);
  assert.equal(rep.map.summary.iobs.total, 92);
  assert.equal(rep.map.summary.bufg.used, 1);
  assert.equal(rep.timing.constraints[0].constraint, 'PERIOD 20 ns on clk');
  assert.equal(rep.timing.clocks[0].port, 'clk');
  assert.equal(rep.files.routed, 'build/open/routed.xdl');
  assert.equal(rep.bit.header.part, '3s250ecp132');
  // what Program uses: build/top.bit, for the project's device
  const bi = (await app.call('GET', '/projects/Blinky/bitinfo')).body;
  assert.equal(bi.available, true);
  assert.equal(bi.warning ?? null, null);
  // View Implemented Design (FPGA): the routed design on the device description
  const fv = (await app.call('GET', '/projects/Blinky/fpga-view')).body;
  assert.equal(fv.available, true, JSON.stringify(fv).slice(0, 300));
  assert.equal(fv.source, 'open');
  assert.equal(fv.util.IOBs.used, 15);
  assert.ok(fv.util.Slices.used > 50);
  assert.ok(fv.nets.some(n => n.kind === 'clock'));
  assert.ok(fv.insts.some(i => i.cells.some(c => c.kind === 'lut' && c.text)));
  assert.ok(fss.existsSync(path.join(dir, 'build', 'open', 'fpga-view.json')), 'cached');
  assert.deepEqual((await app.call('GET', '/projects/Blinky/fpga-view')).body.util, fv.util);
  // Synthesize alone: only the synthesis; the previous products are gone (they no longer match)
  const j2 = await waitJob(jobs, await implement('Blinky', { steps: ['synth'] }), { timeoutMs: 60000 });
  assert.equal(j2.status, 'ok', j2.lines.join('\n'));
  assert.deepEqual(j2.result.completedSteps, ['synth']);
  const rep2 = (await app.call('GET', '/projects/Blinky/reports')).body;
  assert.equal(rep2.summary.synthesized, true);
  assert.equal(rep2.summary.mapped, false);
  assert.equal(rep2.summary.bitstream, false);
  assert.ok(!fss.existsSync(path.join(dir, 'build', 'top.bit')));
  assert.equal((await app.call('GET', '/projects/Blinky/fpga-view')).body.available, false);
});

// the other boards (research/s3e-bitstream, stage F): blinky for the Nexys2-1200 (its LEDs LD4-LD7)
// and the Basys2-100, Implement + Generate Programming File through the API, no warning
const NEXYS2_UCF = [['clk', 'B8'], ['sw<0>', 'G18'], ['sw<1>', 'H18'], ['sw<2>', 'K18'], ['sw<3>', 'K17'], ['btn<0>', 'B18'], ['btn<1>', 'D18'],
  ...['J14', 'J15', 'K15', 'K14', 'E16', 'P16', 'E4', 'P4'].map((p, i) => [`led<${i}>`, p])].map(([n, p]) => `NET "${n}" LOC = "${p}" | IOSTANDARD = LVCMOS33 ;`).join('\n')
  + '\nNET "clk" TNM_NET = "clk" ;\nTIMESPEC "TS_clk" = PERIOD "clk" 20 ns HIGH 50% ;\n';
for (const [name, part, pkg, ucf, slices, iobs, bytes] of [['N2', 'xc3s1200e', 'fg320', NEXYS2_UCF, 8672, 250, 480219], ['B100', 'xc3s100e', 'cp132', null, 960, 83, 72738]]) {
  test(`open mode: Implement + Generate Programming File of blinky for ${part}-${pkg}, no warning`, { timeout: 420000 }, async () => {
    await writeConfig({ mode: 'silinx' });
    assert.equal((await app.call('POST', '/projects', { name, template: 'blinky' })).status, 200);
    await P.updateProject(name, pj => { pj.board = null; pj.device = DEV(part, pkg); });
    if (ucf) await fs.writeFile(path.join(P.projectDir(name), 'constraints', 'top.ucf'), ucf);
    const j = await waitJob(jobs, await implement(name, { steps: ['synth', 'translate', 'map', 'par', 'bitgen'] }), { timeoutMs: 400000 });
    const log = j.lines.join('\n');
    assert.equal(j.status, 'ok', log);
    assert.match(log, new RegExp(`Device: ${part}${pkg}-4: device description \\(shipped with Silinx\\) and bit database\\.`));
    assert.match(log, new RegExp(`Number of occupied Slices: \\d+ out of ${slices} \\d+%`));
    assert.match(log, /Bitstream: build\/top\.bit \(\d+ bytes, every feature in the bit database\)/);
    assert.deepEqual(j.lines.filter(l => /warning/i.test(l)), []);
    assert.deepEqual(j.result.warnings, []);
    const rep = (await app.call('GET', '/projects/' + name + '/reports')).body;
    assert.equal(rep.map.summary.iobs.total, iobs);
    assert.equal(rep.bit.header.part, `${part.slice(2)}${pkg}`);
    assert.equal(fss.statSync(path.join(P.projectDir(name), 'build', 'top.bit')).size, bytes);
  });
}

test('open mode: a device without a bit database fails with the reason; the ISE-only steps are refused', async () => {
  await writeConfig({ mode: 'silinx' });
  await app.call('POST', '/projects', { name: 'Big', template: 'blinky', device: DEV('xc3s1600e', 'fg320') });
  await P.updateProject('Big', pj => { pj.board = null; pj.device = DEV('xc3s1600e', 'fg320'); });
  const j = await waitJob(jobs, await implement('Big', { steps: ['synth'] }));
  assert.equal(j.status, 'error');
  assert.match(j.error, /^Silinx toolchain not available for xc3s1600efg320-4: no bit database for xc3s1600e yet \(only the XC3S100E \(CP132\)/);
  assert.ok(j.lines.some(l => /^ERROR: the Silinx toolchain cannot implement this design: no bit database for xc3s1600e yet/.test(l)));
  const r = await app.call('POST', '/projects/Big/implement', { steps: ['synth', 'postpar'] });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /not available in the Silinx toolchain \(they need Xilinx ISE\): postpar/);
});

test('open mode: a VHDL top with capital letters (its netlist is named in lower case) goes through Translate and Map (#31)', { timeout: 300000 }, async () => {
  await writeConfig({ mode: 'silinx' });
  await app.call('POST', '/projects', { name: 'VhdlCaps', device: DEV('xc3s250e', 'cp132') });
  await app.call('PUT', '/projects/VhdlCaps/file?path=src/Blink_Top.vhd', [
    'library ieee;', 'use ieee.std_logic_1164.all;', 'entity Blink_Top is', '  port (CLK : in std_logic; D : in std_logic; Q : out std_logic);', 'end Blink_Top;',
    'architecture rtl of Blink_Top is', 'begin', '  process (CLK) begin if rising_edge(CLK) then Q <= not D; end if; end process;', 'end rtl;', ''].join('\n'));
  await P.updateProject('VhdlCaps', pj => { pj.top = 'Blink_Top'; });
  const j = await waitJob(jobs, await implement('VhdlCaps', { steps: ['synth', 'translate', 'map'] }), { timeoutMs: 280000 });
  assert.equal(j.status, 'ok', j.lines.join('\n'));
  assert.ok(j.lines.some(l => /^Netlist: build\/open\/blink_top\.json/.test(l)), j.lines.join('\n'));
  assert.ok(j.lines.some(l => /Number of occupied Slices: 1 out of 2448/.test(l)), j.lines.join('\n'));
});

test('open mode: Place & Route replicates a flip-flop of many loads on the critical path, the faster routing kept, the Design Summary of the design kept (#4)', { timeout: 240000 }, async () => {
  await writeConfig({ mode: 'silinx' });
  await app.call('POST', '/projects', { name: 'Fan64', device: DEV('xc3s250e', 'cp132') });
  // s selects 64 registers spread over the chip: its net is the slowest of the critical path
  await app.call('PUT', '/projects/Fan64/file?path=src/fan.v', ['module fan(input clk, input sel, input din, output reg y);', '  reg s;', '  reg [63:0] a, q;', '  reg [15:0] r1;', '  reg [3:0] r2;', '  integer i;',
    '  always @(posedge clk) begin', '    s <= sel;', '    a <= {a[62:0], din};', '    for (i = 0; i < 64; i = i + 1) q[i] <= s ? a[i] : a[63 - i];', '    for (i = 0; i < 16; i = i + 1) r1[i] <= ^q[4*i +: 4];',
    '    for (i = 0; i < 4; i = i + 1) r2[i] <= ^r1[4*i +: 4];', '    y <= ^r2;', '  end', 'endmodule', ''].join('\n'));
  await P.updateProject('Fan64', pj => { pj.top = 'fan'; });
  const j = await waitJob(jobs, await implement('Fan64', { steps: ['synth', 'translate', 'map', 'par', 'trce'] }), { timeoutMs: 230000 });
  const log = j.lines.join('\n');
  assert.equal(j.status, 'ok', log);
  const m = /^Register replication: 1 flip-flop\(s\) on the critical path copied \((\d+) copies\): (kept, ([\d.]+) ns instead of ([\d.]+) ns|not kept, no faster)\.$/m.exec(log);
  assert.ok(m, log);
  const kept = m[2].startsWith('kept');
  const ffs = [...log.matchAll(/Number of Slice Flip Flops: (\d+) out of/g)].map(x => +x[1]);
  const rep = (await app.call('GET', '/projects/Fan64/reports')).body;
  const period = +/clock \S+: minimum period ([\d.]+) ns/.exec(log)[1];
  if (kept) {
    // the Design Summary has the flip-flops of the replicated design; the timing is the faster's
    assert.match(log, new RegExp(`Design summary \\(pack, after the replication\\): Number of Slice Flip Flops ${ffs[0] + +m[1]}, Number of occupied Slices \\d+\\.`));
    assert.equal(period, +m[3]);
    assert.ok(+m[3] < +m[4]);
    assert.equal(JSON.stringify(rep).includes(`"used":${ffs[0] + +m[1]}`), true);
  } else assert.doesNotMatch(log, /after the replication/);
  assert.match(log, /All signals are completely routed\./);
  // the warnings, exactly: the pins (no UCF), nothing about the replication
  assert.deepEqual(j.lines.filter(l => /warning/i.test(l)), ['WARNING: 4 port bit(s) have no LOC constraint (clk, sel, din, y): Silinx assigns free I/O pins automatically - do NOT program real hardware with this bitstream']);
});

test('open mode: a design with errors fails in Synthesize with the messages; Stop cancels a run', { timeout: 60000 }, async () => {
  await writeConfig({ mode: 'silinx' });
  await app.call('POST', '/projects', { name: 'Bad', device: DEV('xc3s250e', 'cp132') });
  await app.call('PUT', '/projects/Bad/file?path=src/top.v', 'module top(input a, output y);\n  assign y = a & nope;\nendmodule\n');
  await P.updateProject('Bad', pj => { pj.top = 'top'; });
  const j = await waitJob(jobs, await implement('Bad', { steps: ['synth', 'translate', 'map', 'par', 'bitgen'] }), { timeoutMs: 50000 });
  assert.equal(j.status, 'error');
  assert.equal(j.result.failedStep, 'synth');
  assert.match(j.error, /Silinx toolchain failed in step 'synth'/);
  assert.ok(j.lines.includes('ERROR:Silinx - the design has errors'), j.lines.join('\n'));
  assert.ok(j.lines.some(l => /^ {2}src\/top\.v:2 .*nope/.test(l)), j.lines.join('\n'));
  assert.ok(j.lines.includes('=== SILINX FAILED synth (exit 1) ==='));
  const rep = (await app.call('GET', '/projects/Bad/reports')).body;
  assert.equal(rep.source, 'open');
  assert.equal(rep.summary.synthesized, false);
  // Stop: the flow's process is killed
  await app.call('POST', '/projects', { name: 'Stop1', template: 'blinky' });
  const id = await implement('Stop1');
  await waitLine(jobs, id, /^=== SILINX STEP synth ===/, { timeoutMs: 20000 });
  jobs.cancelJob(id);
  const k = await waitJob(jobs, id, { timeoutMs: 20000 });
  assert.equal(k.status, 'error');
  assert.equal(k.cancelled, true);
});

test('Build Device Description: xdl -report through docker, gzipped there, packed into ~/.silinx/devices', { skip: POSIX_ONLY, timeout: 60000 }, async () => {
  const { devicesDir, findDeviceGraph, loadDeviceCache } = await import('../core/fpga/device-node.js');
  await writeConfig({ mode: 'silinx', open: { iseMode: 'docker' }, docker: { image: 'silinx/ise:14.7' } });
  const tcr = (await app.call('GET', '/toolchain')).body;
  assert.equal(tcr.deviceBuilder.mode, 'docker');
  assert.equal(tcr.deviceBuilder.available, true, tcr.deviceBuilder.reason);
  process.env.FAKE_DOCKER_LOG = path.join(tmp, 'docker.log');
  process.env.FAKE_XDL_LOG = path.join(tmp, 'xdl.log');
  const r = await app.call('POST', '/toolchain/build-device', { part: 'xc3s50etq144-4' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const j = await waitJob(jobs, r.body.job, { timeoutMs: 50000 });
  const log = j.lines.join('\n');
  assert.equal(j.status, 'ok', log);
  assert.match(log, /Building the device description of xc3s50etq144-4 from Xilinx ISE \(docker mode\)/);
  assert.match(log, /=== SILINX STEP xdlreport ===[\s\S]*=== SILINX STEP gzip ===[\s\S]*=== SILINX STEP pack ===/);
  assert.equal((await fs.readFile(process.env.FAKE_XDL_LOG, 'utf8')).trim(), 'xdl -report -pips -all_conns xc3s50etq144-4 device.xdlrc');
  assert.match(await fs.readFile(process.env.FAKE_DOCKER_LOG, 'utf8'), /run --rm --platform linux\/amd64 -v .*:\/work -w \/work .*silinx\/ise:14\.7 bash run\.sh xc3s50etq144-4/);
  const out = path.join(devicesDir(), 'xc3s50etq144-4.json.gz');
  assert.equal(j.result.path, out);
  assert.equal(findDeviceGraph('xc3s50etq144-4'), out);
  assert.equal(JSON.parse(zlib.gunzipSync(await fs.readFile(out))).part, 'xc3s50etq144-4');
  assert.ok(loadDeviceCache(out).nodeCount > 0);
  assert.deepEqual((await fs.readdir(devicesDir())).filter(f => f.startsWith('.build')), [], 'the work folder (and the report) are removed');
  // the part is checked against the report; xdl failing; a bad part
  const j2 = await waitJob(jobs, (await app.call('POST', '/toolchain/build-device', { part: 'xc3s1600efg320-4' })).body.job, { timeoutMs: 50000 });
  assert.equal(j2.status, 'error');
  assert.match(j2.error, /the report is of xc3s50etq144-4, not of xc3s1600efg320-4/);
  assert.equal(findDeviceGraph('xc3s1600efg320-4'), null);
  process.env.FAKE_XDL_FAIL = '1';
  const j3 = await waitJob(jobs, (await app.call('POST', '/toolchain/build-device', { part: 'xc3s1600efg320-4' })).body.job, { timeoutMs: 50000 });
  delete process.env.FAKE_XDL_FAIL;
  assert.equal(j3.status, 'error');
  assert.ok(j3.lines.includes('=== SILINX FAILED xdlreport (exit 1) ==='), j3.lines.join('\n'));
  assert.match(j3.error, /the device report of xc3s1600efg320-4 could not be made/);
  assert.equal((await app.call('POST', '/toolchain/build-device', { part: 'nope; rm -rf /' })).status, 400);
  // a project's device
  await app.call('POST', '/projects', { name: 'Tq', device: DEV('xc3s250e', 'tq144') });
  const rp = await app.call('POST', '/toolchain/build-device', { project: 'Tq' });
  assert.equal(rp.body.part, 'xc3s250etq144-4');
  await waitJob(jobs, rp.body.job, { timeoutMs: 50000 });
  delete process.env.FAKE_DOCKER_LOG; delete process.env.FAKE_XDL_LOG;
});

test('Build Device Description: over ssh (ISE on the host, then a docker image there); ISE not configured', { skip: POSIX_ONLY, timeout: 60000 }, async () => {
  const { devicesDir } = await import('../core/fpga/device-node.js');
  await fs.rm(path.join(devicesDir(), 'xc3s50etq144-4.json.gz'), { force: true });
  await writeConfig({ mode: 'silinx', open: { iseMode: 'ssh' }, ssh: { host: 'build-box', user: 'me', remoteDir: 'sx' } });
  process.env.FAKE_SSH_LOG = path.join(tmp, 'ssh.log');
  const j = await waitJob(jobs, (await app.call('POST', '/toolchain/build-device', { part: 'xc3s50etq144-4' })).body.job, { timeoutMs: 50000 });
  assert.equal(j.status, 'ok', j.lines.join('\n'));
  assert.ok(fss.existsSync(path.join(devicesDir(), 'xc3s50etq144-4.json.gz')));
  const ssh = await fs.readFile(process.env.FAKE_SSH_LOG, 'utf8');
  assert.match(ssh, /me@build-box cd sx\/device-xc3s50etq144-4 && ISE_SETTINGS=\S+ bash run\.sh xc3s50etq144-4/);
  assert.match(ssh, /me@build-box rm -rf sx\/device-xc3s50etq144-4/);
  assert.ok(!fss.existsSync(path.join(process.env.FAKE_SSH_HOME, 'sx', 'device-xc3s50etq144-4')), 'the remote folder is removed');
  // with a docker image on the host
  await writeConfig({ mode: 'silinx', open: { iseMode: 'ssh' }, ssh: { host: 'mini', user: 'dev', image: 'xilinx/ise:14.7' } });
  const j2 = await waitJob(jobs, (await app.call('POST', '/toolchain/build-device', { part: 'xc3s50etq144-4' })).body.job, { timeoutMs: 50000 });
  assert.equal(j2.status, 'ok', j2.lines.join('\n'));
  assert.match(await fs.readFile(process.env.FAKE_SSH_LOG, 'utf8'), /dev@mini .*docker run --rm -v "\$PWD":\/work -w \/work .*xilinx\/ise:14\.7 bash run\.sh xc3s50etq144-4/);
  delete process.env.FAKE_SSH_LOG;
  // ISE not configured: the job says why
  await writeConfig({ mode: 'silinx', open: { iseMode: 'docker' }, docker: { image: '' } });
  const j3 = await waitJob(jobs, (await app.call('POST', '/toolchain/build-device', { part: 'xc3s50etq144-4' })).body.job);
  assert.equal(j3.status, 'error');
  assert.match(j3.error, /Xilinx ISE not available \(docker mode\): no docker image configured/);
});

test('deviceGrid: the FPGA view\'s grid from a device description equals the one from the device report', async () => {
  const { deviceGrid, parseXdlrc } = await import('../core/xdl.js');
  const { packDeviceFile } = await import('../core/fpga/device-node.js');
  const { loadDevice } = await import('../core/fpga/device.js');
  const g = deviceGrid(loadDevice(await packDeviceFile(XDLRC)));
  const x = parseXdlrc(await fs.readFile(XDLRC, 'utf8'));
  assert.equal(g.part, x.part);
  assert.equal(g.rows, x.rows);
  assert.equal(g.cols, x.cols);
  const key = t => `${t.r},${t.c},${t.name},${t.type}:${t.sites.map(s => `${s.name}/${s.type}/${s.bonded}`).join(' ')}`;
  assert.deepEqual(g.tiles.map(key).sort(), x.tiles.map(key).sort());
});

test('the project\'s synthesis tool chooses the flow, whatever the mode of Toolchain Settings (Silinx or XST)', { timeout: 300000 }, async () => {
  // Toolchain Settings in an ISE mode, the project's synthesis tool Silinx: the Silinx toolchain
  await writeConfig({ mode: 'local' });
  await app.call('POST', '/projects', { name: 'ToolSilinx', template: 'blinky' });
  await P.updateProject('ToolSilinx', pj => { pj.synthTool = 'silinx'; });
  let j = await waitJob(jobs, await implement('ToolSilinx', { steps: ['synth'] }), { timeoutMs: 280000 });
  assert.equal(j.meta.toolchain, 'silinx');
  assert.equal(j.status, 'ok', j.lines.join('\n'));
  // Toolchain Settings in the Silinx mode, the project's synthesis tool XST: the ISE flow, through the
  // ISE mode kept for it (open.iseMode: docker, no image here: not available, said so)
  await writeConfig({ mode: 'silinx', open: { iseMode: 'docker' }, docker: { image: '' } });
  await app.call('POST', '/projects', { name: 'ToolXst', template: 'blinky' });
  await P.updateProject('ToolXst', pj => { pj.synthTool = 'xst'; });
  j = await waitJob(jobs, await implement('ToolXst', { steps: ['synth'] }));
  assert.equal(j.meta.toolchain, undefined);
  assert.equal(j.status, 'error');
  assert.match(j.error, /^Xilinx ISE not available \(docker mode\)/);
  // a project without the setting follows Toolchain Settings (here: the Silinx toolchain)
  await app.call('POST', '/projects', { name: 'ToolNone', template: 'blinky' });
  // (which flow is chosen is known when the job starts: no need to wait for the synthesis)
  const id = await implement('ToolNone', { steps: ['synth'] });
  assert.equal(jobs.getJob(id).meta.toolchain, 'silinx');
  jobs.cancelJob(id);
  await waitJob(jobs, id);
});

test('open mode: Generate Post-Synthesis Simulation Model writes the model with the test bench\'s generics, in the reports; a later Implement keeps it there (#120)', { timeout: 300000 }, async () => {
  await writeConfig({ mode: 'silinx' });
  await app.call('POST', '/projects', { name: 'PostSyn', template: 'blinky', device: DEV('xc3s250e', 'cp132') });
  const j = await waitJob(jobs, await implement('PostSyn', { steps: ['synth', 'postsynth'] }), { timeoutMs: 280000 });
  const log = j.lines.join('\n');
  assert.equal(j.status, 'ok', log);
  const pj = (await app.call('GET', '/projects/PostSyn')).body;
  const top = pj.top;
  assert.deepEqual(j.result.completedSteps, ['synth', 'postsynth']);
  assert.match(log, new RegExp(`^Post-Synthesis Simulation Model: build/netgen/synthesis/${top}_synthesis\\.vhd \\(VHDL, UNISIM primitives\\) and build/netgen/synthesis/${top}_synthesis\\.v \\(Verilog\\), \\d+ cells$`, 'm'));
  const rep = (await app.call('GET', '/projects/PostSyn/reports')).body;
  assert.equal(rep.simModels.postsynth.path, `build/netgen/synthesis/${top}_synthesis.vhd`);
  const vhd = (await app.call('GET', `/projects/PostSyn/file?path=build/netgen/synthesis/${top}_synthesis.vhd`)).body;
  assert.match(String(vhd.text ?? vhd), /^-- Post-Synthesis Simulation Model of /);
  // a later run without the step: the model, still in build/, still in the reports
  const j2 = await waitJob(jobs, await implement('PostSyn', { steps: ['synth'] }), { timeoutMs: 280000 });
  assert.equal(j2.status, 'ok');
  assert.equal((await app.call('GET', '/projects/PostSyn/reports')).body.simModels.postsynth.path, `build/netgen/synthesis/${top}_synthesis.vhd`);
});

test('open mode: Generate Post-Translate and Post-Map Simulation Models write the models, in the reports; a later run keeps them there (#121)', { timeout: 300000 }, async () => {
  await writeConfig({ mode: 'silinx' });
  await app.call('POST', '/projects', { name: 'PostMap', template: 'blinky', device: DEV('xc3s250e', 'cp132') });
  const j = await waitJob(jobs, await implement('PostMap', { steps: ['synth', 'translate', 'posttrans', 'map', 'postmap'] }), { timeoutMs: 280000 });
  const log = j.lines.join('\n');
  assert.equal(j.status, 'ok', log);
  const top = (await app.call('GET', '/projects/PostMap')).body.top;
  assert.deepEqual(j.result.completedSteps, ['synth', 'translate', 'posttrans', 'map', 'postmap']);
  assert.deepEqual(j.lines.filter(l => /^(WARNING|ERROR|INFO)/.test(l)), []);
  assert.match(log, new RegExp(`^Post-Translate Simulation Model: build/netgen/translate/${top}_translate\\.vhd \\(VHDL, SIMPRIM primitives\\) and build/netgen/translate/${top}_translate\\.v \\(Verilog\\), \\d+ primitives$`, 'm'));
  assert.match(log, new RegExp(`^Post-Map Simulation Model: build/netgen/map/${top}_map\\.vhd \\(VHDL, SIMPRIM primitives\\) and build/netgen/map/${top}_map\\.v \\(Verilog\\), \\d+ primitives$`, 'm'));
  const paths = async () => Object.fromEntries(Object.entries((await app.call('GET', '/projects/PostMap/reports')).body.simModels).map(([k, v]) => [k, v.path]));
  assert.deepEqual(await paths(), { posttrans: `build/netgen/translate/${top}_translate.vhd`, postmap: `build/netgen/map/${top}_map.vhd` });
  const vhd = (await app.call('GET', `/projects/PostMap/file?path=build/netgen/map/${top}_map.vhd`)).body;
  assert.match(String(vhd.text ?? vhd), /^-- Post-Map Simulation Model of /);
  // a later run without the steps: the models, still in build/, still in the reports
  const j2 = await waitJob(jobs, await implement('PostMap', { steps: ['synth'] }), { timeoutMs: 280000 });
  assert.equal(j2.status, 'ok');
  assert.deepEqual(await paths(), { posttrans: `build/netgen/translate/${top}_translate.vhd`, postmap: `build/netgen/map/${top}_map.vhd` });
});
