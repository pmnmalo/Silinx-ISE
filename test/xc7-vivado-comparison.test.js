// The 7-series' examples through the Silinx toolchain against AMD Vivado (#3760, scripts/xc7-vivado-compare.mjs):
//   - the script's parts with no Vivado: its Tcl and shell script (run.sh through a stand-in vivado), the numbers it
//     reads of the reports and logs, the results' merge and table;
//   - the recorded results (test/xc7-vivado-comparison.json, the script's --update on the ISE runner's machine with
//     Vivado ML Standard 2025.2), checked: every example on the Basys 3 and the Nexys A7; Vivado's own flow builds each
//     one with the expected warnings, routed, its clock met, DRC clean; Silinx's netlist placed and routed by Vivado
//     passes Vivado's DRC and write_bitstream, its clock met; Silinx's open flow within its bounds of Vivado's LUTs and
//     frequency; the table in docs/TOOLCHAIN.md the results'.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { netTcl, runSh, netlistXdc, parseArgs, logWarnings, buildNumbers, silinxNumbers, mergeResults, comparisonTable, boardSummary, withTable, tableOf, RESULTS, DOC } from '../scripts/xc7-vivado-compare.mjs';
import { EXAMPLES, XC7_TARGETS } from './examples-lib.mjs';
import { VIVADO_WARNINGS, VIVADO_DRC } from './vivado-examples-config.mjs';

test('net.tcl: Silinx\'s netlist linked as it is (no opt_design), placed, routed, its reports under run.tcl\'s names, a bitstream', () => {
  const t = netTcl();
  assert.match(t, /^lassign \$argv dir top part$/m);
  assert.ok(t.indexOf('file copy -force netlist.edf $top.edf') < t.indexOf('read_edif $top.edf'));
  assert.match(t, /link_design -top \$top -part \$part\nsource props\.tcl\nplace_design\nroute_design\n/);
  assert.doesNotMatch(t, /opt_design|synth_design/);
  for (const r of ['report_route_status -file ${top}_route.rpt', 'report_drc -file ${top}_drc.rpt', 'report_utilization -file ${top}_util.rpt',
    'report_timing_summary -max_paths 10 -report_unconstrained -file ${top}_timing.rpt', 'write_bitstream -force ${top}.bit']) assert.ok(t.includes(r), r);
});

test('run.sh: each design\'s HDL then its netlist through Vivado (a stand-in), each exit code, the reports kept, the checkpoints not', () => {
  const W = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-xc7v-test-'));
  try {
    const bin = path.join(W, 'bin');
    fs.mkdirSync(bin);
    // the stand-in: writes a log and its reports where it runs (the net build: -tclargs <folder> <top>), a checkpoint too;
    // it fails on a design named bad
    fs.writeFileSync(path.join(bin, 'vivado'), `#!/bin/bash
top=top; for a in "$@"; do case "$a" in gates|top|bad) top=$a;; esac; done
echo "WARNING: [Synth 8-3917] stand-in" > vivado.log
for f in _util.rpt _drc.rpt _route.rpt _timing.rpt .bit; do echo x > "$top$f"; done
touch post_route.dcp; mkdir -p .Xil
[ "$top" = bad ] && exit 1; exit 0
`, { mode: 0o755 });
    // (macOS has no timeout: a stand-in)
    fs.writeFileSync(path.join(W, 'settings64.sh'), `export PATH="${bin}:$PATH"\ncommand -v timeout >/dev/null || timeout() { shift; "$@"; }\n`);
    fs.writeFileSync(path.join(W, 'designs.txt'), 'basys3-gates gates xc7a35tcpg236-1\nnexys-a7-bad bad xc7a100tcsg324-1\n');
    for (const [id, top] of [['basys3-gates', 'gates'], ['nexys-a7-bad', 'bad']]) {
      for (const k of ['hdl', 'net']) fs.mkdirSync(path.join(W, 'designs', id, k), { recursive: true });
      // (the application's run.sh: vivado on its run.tcl, its top in it)
      fs.writeFileSync(path.join(W, 'designs', id, 'hdl', 'run.sh'), `exec vivado -mode batch -source run.tcl -tclargs ${top}\n`);
    }
    fs.writeFileSync(path.join(W, 'run.sh'), runSh());
    fs.writeFileSync(path.join(W, 'net.tcl'), netTcl());
    const out = execFileSync('bash', [path.join(W, 'run.sh'), W], { encoding: 'utf8', env: { ...process.env, VIVADO_SETTINGS: path.join(W, 'settings64.sh') } });
    assert.deepEqual(out.trim().split('\n'), ['basys3-gates: hdl 0 net 0', 'nexys-a7-bad: hdl 1 net 1']);
    assert.ok(fs.existsSync(path.join(W, 'done')));
    for (const k of ['hdl', 'net']) {
      assert.deepEqual(fs.readdirSync(path.join(W, 'results', 'basys3-gates', k)).sort(), ['gates.bit', 'gates_drc.rpt', 'gates_route.rpt', 'gates_timing.rpt', 'gates_util.rpt', 'vivado.log']);
      assert.deepEqual(fs.readdirSync(path.join(W, 'designs', 'basys3-gates', k)).filter(f => /\.dcp$|^\.Xil$|\.rpt$/.test(f)), []);
    }
  } finally { fs.rmSync(W, { recursive: true, force: true }); }
});

test('logWarnings: Vivado\'s own warnings once each, sorted, the build\'s folder as the application\'s; buildNumbers of the reports', () => {
  const log = ['INFO: [Synth 8-6157] synthesizing module', 'WARNING: [Synth 8-3917] design top has port led[2] driven by constant 0',
    'CRITICAL WARNING: [Vivado 12-1411] x [/w/designs/basys3-pong/hdl/src/src/pong.xdc:3]', 'WARNING: [Synth 8-3917] design top has port led[2]  driven by constant 0',
    'WARNING: not one of Vivado\'s'].join('\n');
  assert.deepEqual(logWarnings(log), ['CRITICAL WARNING: [Vivado 12-1411] x [/work/src/src/pong.xdc:3]', 'WARNING: [Synth 8-3917] design top has port led[2] driven by constant 0']);
  const u = (used) => ({ used, total: 20800, percent: 0 });
  const reports = { par: { routed: true }, map: { summary: { luts: u(94), ffs: u(130), slices: u(40), bram: u(0), dsp: u(0) } }, timing: { met: true, maxFreqMHz: 198.8 },
    drc: { errors: 0, criticalWarnings: 0, rules: [{ rule: 'DPIP-1', severity: 'Warning', description: 'Input pipelining', checks: 3 }] }, bit: { size: 2192111 } };
  assert.deepEqual(buildNumbers('0', reports, log), { ok: true, routed: true, luts: 94, regs: 130, slices: 40, bram: 0, dsp: 0, fmaxMHz: 198.8, met: true,
    drc: [['DPIP-1', 'Warning', 3]], drcErrors: 0, warnings: logWarnings(log), bit: 2192111 });
  // no clock (gates): no frequency, nothing to meet
  assert.deepEqual([buildNumbers('0', { ...reports, timing: { noConstraints: true, met: null } }, '').fmaxMHz, buildNumbers('0', { timing: { noConstraints: true } }, '').met], [null, null]);
  assert.deepEqual(buildNumbers('1', {}, log), { ok: false, error: 'Vivado exited with 1', warnings: logWarnings(log) });
  assert.equal(buildNumbers(undefined, {}, '').error, 'Vivado did not run');
});

test('netlistXdc: a pin of a one-bit port named as the netlist\'s scalar; a bus\'s bits and other lines as they were', () => {
  const xdc = ['set_property -dict { PACKAGE_PIN U18 IOSTANDARD LVCMOS33 } [get_ports {btn[0]}]', 'set_property -dict { PACKAGE_PIN V17 IOSTANDARD LVCMOS33 } [get_ports {sw[0]}]',
    'set_property -dict { PACKAGE_PIN W5 IOSTANDARD LVCMOS33 } [get_ports {clk}]', 'create_clock -period 10.000 -name clk [get_ports {clk}]', 'set_property -dict { PACKAGE_PIN T18 } [get_ports {an[0]}]'].join('\n');
  const ports = { btn: { bits: [2] }, sw: { bits: [3, 4] }, clk: { bits: [5] }, an: { bits: [6, 7, 8, 9] } };
  assert.deepEqual(netlistXdc(xdc, ports).split('\n'), ['set_property -dict { PACKAGE_PIN U18 IOSTANDARD LVCMOS33 } [get_ports {btn}]', ...xdc.split('\n').slice(1)]);
  assert.equal(netlistXdc(xdc, {}), xdc);
});

test('parseArgs: the options checked, an unknown one or a missing value an error (no Vivado run on a mistyped one)', () => {
  assert.deepEqual(parseArgs(['--detach', '--boards', 'basys3', '--filter', '^(blinky)$']), { flags: new Set(['--detach']), values: { '--boards': 'basys3', '--filter': '^(blinky)$' } });
  assert.deepEqual(parseArgs([]), { flags: new Set(), values: {} });
  assert.deepEqual(parseArgs(['--help']), { error: 'unknown option --help' });
  assert.deepEqual(parseArgs(['--boards']), { error: '--boards: a value is missing' });
  assert.deepEqual(parseArgs(['--collect', '--update']), { error: '--collect: a value is missing' });
  assert.deepEqual(parseArgs(['--collect', 'silinx-xc7v-x', '--detach']), { error: '--collect: no --detach nor --dry' });
  assert.deepEqual(parseArgs(['blinky']), { error: 'unknown option blinky' });
});

test('silinxNumbers: the open flow\'s LUTs, its feed-throughs and LUT sites (#3160), registers, slices, frequency, warnings', () => {
  const u = [['Number of Slice LUTs', 106], ['LUTs as feed-throughs (nextpnr)', 94], ['Number of occupied Slices', 78], ['CARRY4', 37], ['Number of Slice Registers', 134], ['RAMB18', 1], ['DSPs', 3]];
  const r = { map: { utilization: u.map(([name, used]) => ({ name, used })) }, timing: { maxFreqMHz: 255.75, met: true }, bit: { size: 2192124 } };
  assert.deepEqual(silinxNumbers(r, ['Synthesis done', 'WARNING: x']), { luts: 106, feedthroughs: 94, lutSites: 200, regs: 134, slices: 78, carry4: 37, bram: 1, dsp: 3, fmaxMHz: 255.75, met: true, warnings: ['WARNING: x'], bit: 2192124 });
  assert.deepEqual(silinxNumbers({ map: { utilization: [] }, timing: {} }, []).luts, 0);
});

const design = (board, name, luts) => ({ board, name, silinx: { luts, feedthroughs: 2, lutSites: luts + 2, regs: 3, slices: 2, fmaxMHz: 200 },
  vivado: { ok: true, luts: 4, regs: 3, slices: 1, fmaxMHz: 250, drc: [], drcErrors: 0 }, netlist: { ok: true, luts: 5, regs: 3, slices: 2, fmaxMHz: 220, drc: [['DPIP-1', 'Warning', 3]], drcErrors: 0 } });

test('mergeResults: a run\'s designs put in by board and in the examples\' order, one measured again replaced; the table and its summary', () => {
  const examples = ['gates', 'blinky', 'pong'];
  const a = mergeResults(null, { x: design('nexys-a7', 'pong', 9), y: design('basys3', 'pong', 8), z: design('basys3', 'gates', 3) }, { image: 'img', examples });
  assert.deepEqual(Object.keys(a.boards), ['basys3', 'nexys-a7']);
  assert.deepEqual(Object.keys(a.boards.basys3), ['gates', 'pong']);
  assert.deepEqual([a.issue, a.vivado, a.image], [3760, '2025.2', 'img']);
  const b = mergeResults(a, { y: design('basys3', 'pong', 7), w: design('basys3', 'blinky', 6) }, { image: 'img', examples });
  assert.deepEqual(Object.keys(b.boards.basys3), ['gates', 'blinky', 'pong']);
  assert.equal(b.boards.basys3.pong.silinx.luts, 7);
  assert.equal(a.boards.basys3.pong.silinx.luts, 8);   // (the old one not changed)
  const t = comparisonTable(b).split('\n');
  assert.equal(t.length, 2 + 4);
  assert.equal(t[3], '| Basys 3 | blinky | 6 (+2) | 5 | 4 | 3 / 3 | 2 / 1 | 200 | 220 | 250 | DPIP-1 |');
  assert.ok(t[5].startsWith('| Nexys A7 | pong | 9 (+2) |'));
  assert.ok(comparisonTable(mergeResults(null, { x: { ...design('basys3', 'gates', 1), netlist: { ok: false } } }, { image: 'i', examples })).endsWith('| failed |'));
  assert.deepEqual(boardSummary(b.boards.basys3), { luts: 16, lutSites: 22, netlistLuts: 15, vivadoLuts: 12, fmaxRatio: 0.8 });
  // the page's table between its markers
  const doc = 'a\n<!-- xc7-vivado-comparison: begin (scripts/xc7-vivado-compare.mjs --update) -->\nold\n<!-- xc7-vivado-comparison: end -->\nb\n';
  const d = withTable(doc, b);
  assert.equal(tableOf(d), comparisonTable(b));
  assert.ok(d.startsWith('a\n') && d.endsWith('end -->\nb\n'));
  assert.equal(withTable(d, b), d);
  assert.throws(() => withTable('no markers', b), /no <!-- xc7-vivado-comparison/);
});

// ---------------------------------------------------------------------------------------------------------------------
// The recorded results
// ---------------------------------------------------------------------------------------------------------------------

const results = JSON.parse(fs.readFileSync(RESULTS, 'utf8'));
// Silinx's netlist in Vivado: Vivado's warnings on it (none, a netlist of Xilinx's own cells, its XDC Silinx's, but gates')
const NETLIST_WARNINGS = Object.fromEntries(XC7_TARGETS.map(({ board }) => [`${board}/gates`,
  // (gates: no clock, nothing to time)
  ['WARNING: [Place 46-29] Timing had been disabled during Placer and, therefore, physical synthesis in Placer will be skipped.']]));
// the bounds the open flow is held to against Vivado (a design over one is a regression of Silinx's synthesis or of
// nextpnr's packing and timing, or a better Vivado): Silinx's LUTs (nextpnr's count, its feed-throughs too) at most
// LUTS times Vivado's own flow's (counted Vivado's way: the LUT sites with logic), its LUT sites with nextpnr's
// feed-throughs (#3160) at most SITES times; Silinx's netlist in Vivado at most NETLIST_LUTS
// times Vivado's own; Silinx's frequency (nextpnr's estimate) at least FMAX times Vivado's own flow's
// (nextpnr's estimate is above Vivado's timing on the same netlist, #3516: at most NEXTPNR_OVER times it; stopwatch's
// DSP48E1s 2.2 times, their arcs nextpnr's stubs, #3875)
const LUTS = 1.6, SITES = 2.8, NETLIST_LUTS = 1.4, FMAX = 0.9, NEXTPNR_OVER = { stopwatch: 2.3 }, OVER = 1.8;
// Vivado's DRC on Silinx's netlist: one net with no routable load (RTSTAT-10, a warning), but on gates; on stopwatch,
// Vivado's advice on its DSP48E1s (not pipelined: their registers unused, as Yosys maps a product), as on its own
// synthesis's
const NETLIST_DRC = (name) => (name === 'gates' ? [] : name === 'stopwatch'
  ? [['DPIP-1', 'Warning', 3], ['DPOP-1', 'Warning', 18], ['DPOP-2', 'Warning', 18], ['RTSTAT-10', 'Warning', 1], ['AVAL-4', 'Advisory', 3]]
  : [['RTSTAT-10', 'Warning', 1]]);

for (const { board } of XC7_TARGETS) test(`the recorded comparison with Vivado on the ${board}: every example, Vivado's builds clean, Silinx's netlist through Vivado's DRC, the open flow within its bounds`, () => {
  const ex = results.boards[board];
  assert.deepEqual(Object.keys(ex), EXAMPLES);
  assert.equal(results.parts[board], { basys3: 'xc7a35tcpg236-1', 'nexys-a7': 'xc7a100tcsg324-1' }[board]);
  for (const [name, { silinx: s, vivado: v, netlist: n }] of Object.entries(ex)) {
    const clocked = name !== 'gates';
    // Silinx's open flow: no warning, its clock met (nextpnr's estimate), a .bit (not compressed: the open flow's bitgen
    // does not compress)
    assert.deepEqual(s.warnings, [], name);
    assert.equal(s.met, clocked ? true : null, name);
    assert.ok(s.bit > 2e6, name);
    // Vivado's own flow on the HDL: its warnings the expected ones, routed, met, DRC clean but its advice, a .bit
    assert.equal(v.ok, true, `${name}: ${v.error}`);
    assert.deepEqual(v.warnings, VIVADO_WARNINGS[board][name], name);
    assert.deepEqual([v.routed, v.met, v.drcErrors], [true, clocked ? true : null, 0], name);
    assert.deepEqual(v.drc.map(([r, sev, c]) => [r, sev, c]), (VIVADO_DRC[name] || []).map(([r, sev, , c]) => [r, sev, c]), name);
    // (compressed: the board's XDC sets BITSTREAM.GENERAL.COMPRESS)
    assert.ok(v.bit > 1e5, name);
    // Silinx's netlist placed and routed by Vivado: no error, routed, met, Vivado's DRC with no error nor critical warning,
    // write_bitstream's own DRC passed (its .bit written)
    assert.equal(n.ok, true, `${name}: ${n.error}`);
    assert.deepEqual(n.warnings, NETLIST_WARNINGS[`${board}/${name}`] || [], name);
    assert.deepEqual([n.routed, n.met, n.drcErrors], [true, clocked ? true : null, 0], name);
    assert.deepEqual(n.drc, NETLIST_DRC(name), name);
    assert.ok(n.bit > 1e5, name);
    // the same registers and DSPs both ways (the netlist's are Silinx's: the same count)
    assert.deepEqual([n.regs, n.dsp], [s.regs, s.dsp], name);
    // the bounds
    assert.ok(s.luts <= Math.max(LUTS * v.luts, 4), `${name}: Silinx ${s.luts} LUTs, Vivado ${v.luts}`);
    assert.ok(s.lutSites <= Math.max(SITES * v.luts, 4), `${name}: Silinx ${s.lutSites} LUT sites, Vivado ${v.luts} LUTs`);
    assert.ok(n.luts <= Math.max(NETLIST_LUTS * v.luts, 4), `${name}: Silinx's netlist ${n.luts} LUTs in Vivado, Vivado ${v.luts}`);
    if (clocked) {
      assert.ok(s.fmaxMHz >= FMAX * v.fmaxMHz, `${name}: Silinx ${s.fmaxMHz} MHz, Vivado ${v.fmaxMHz}`);
      assert.ok(s.fmaxMHz <= (NEXTPNR_OVER[name] || OVER) * n.fmaxMHz, `${name}: nextpnr's estimate ${s.fmaxMHz} MHz, Vivado's on the same netlist ${n.fmaxMHz}`);
    }
    assert.equal(s.fmaxMHz == null, !clocked, name);
  }
});

test('docs/TOOLCHAIN.md shows the recorded comparison\'s table', () => {
  assert.equal(tableOf(fs.readFileSync(DOC, 'utf8')), comparisonTable(results));
});
