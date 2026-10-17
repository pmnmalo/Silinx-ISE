// ABC9 on the Spartan-3E (#369, research/synth-quality/abc9.mjs): the measurement's Yosys scripts (the open
// synthesis's steps up to the LUT mapping, then synth_xilinx's own map_luts with -abc9), its mappings checked with
// Yosys on circuits whose mapping is known by hand and against the RTL (test/diff-synth.js), with their exact
// warnings, and its table.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { toVerilog } from '../core/synth-verilog.js';
import { synthCommands, yosysFiles, cellCounts, utilization } from '../core/synth-open.js';
import { abc9Commands, wayScript, table, WAYS } from '../research/synth-quality/abc9.mjs';
import { compareNetlist } from './diff-synth.js';

const SYNTH = 'synth_xilinx -family xc3se -ise -flatten -top top';

test('ABC9 measurement: the open synthesis up to its LUT mapping, then synth_xilinx\'s map_luts with -abc9', () => {
  const own = synthCommands('top', 'spartan3e');
  const a = abc9Commands('top'), n = abc9Commands('top', { wide: false });
  const head = own.slice(0, own.indexOf('; opt_expr -mux_undef -noclkinv;'));
  assert.equal(a, `${head}; ${SYNTH} -abc9 -run map_luts:`);
  assert.equal(n, `${head}; ${SYNTH} -abc9 -nowidelut -run map_luts:`);
  // the shift registers in SRL16E as the open synthesis makes them, ABC (not ABC9) nowhere
  assert.match(a, /xilinx_srl -variable -minlen 3; techmap -map silinx_srl_map\.v;/);
  assert.match(a, /xilinx_srl -fixed -minlen 3; techmap -map silinx_srl_map\.v; synth_xilinx .* -run map_ffs:map_luts; synth_xilinx/);
  assert.doesNotMatch(a, /(^|; )abc /);
  assert.deepEqual(WAYS, ['now', 'lut4', 'abc9', 'abc9-4']);
  assert.equal(wayScript('lut4', 'top'), `read_verilog -lib silinx_srl_cells.v; read_verilog -sv top_syn.v; ${own}; delete t:$scopeinfo; write_json top.json; write_verilog -noattr top_yosys.v`);
  assert.ok(wayScript('abc9-4', 'top').includes(n));
  assert.throws(() => wayScript('now', 'top'), /no such way: now/);
});

test('ABC9 with Yosys: an AND of 12 is 4 LUT4s, a 5-stage shift register one SRL16E, each mapping equal to the RTL', { timeout: 300000 }, async () => {
  const { yosysNode } = await import('../core/synth-open-node.js');
  const src = 'module top(input clk, input [11:0] a, input d, output y, output q); reg [4:0] r = 0;\n'
    + '  always @(posedge clk) r <= {r[3:0], d};\n  assign y = &a; assign q = r[4];\nendmodule\n';
  const design = elaborate(compile([{ path: 'top.v', lang: 'verilog', text: src }]), 'top');
  const { text, top } = toVerilog(design);
  for (const way of ['lut4', 'abc9', 'abc9-4']) {
    const lines = [];
    const out = await yosysNode(['-q', '-p', wayScript(way, top)], yosysFiles(top, text), l => lines.push(l));
    const cells = cellCounts(out['top.json'], top);
    const u = utilization(cells);
    assert.equal(u.luts, 4, `${way}: 3 LUT4s of 4 inputs and one of 3`);
    assert.equal(u.muxes, 0, way);
    assert.equal(u.shiftRegisters, 1, `${way}: the chain in one SRL16E`);
    assert.equal(u.flipFlops, 0, way);
    // the only warning: Yosys's own shift-register inference, which the open synthesis replaces
    assert.deepEqual(lines.filter(l => /^Warning:/.test(l)), ['Warning: Shift register inference not yet supported for family xc3se.'], way);
    const syn = { top, files: { 'top.json': out['top.json'], 'top_yosys.v': out['top_yosys.v'] }, cells };
    const r = compareNetlist(design, syn, { name: way, seed: way, sim: { cycles: 200, clock: 'clk' } });
    assert.equal(r.status, 'pass', r.report || r.reason);
  }
});

test('ABC9 measurement: its table and the geometric means against the open synthesis', () => {
  const results = {
    a: { now: { luts: 100, muxf: 4, ffs: 10, slices: 60, period: 10, seconds: 4, diff: 'pass' }, abc9: { luts: 121, muxf: 9, ffs: 10, slices: 75, period: 8, seconds: 1, diff: 'pass' } },
    b: { now: { luts: 400, slices: 240, period: 20, seconds: 9, diff: 'pass' }, abc9: { luts: 324, slices: 240, period: 20, seconds: 9, diff: 'pass' } },
    c: { now: { error: 'too large for the devices of the flow' }, abc9: { error: 'too large for the devices of the flow' } },
  };
  const t = table(results, ['now', 'abc9']);
  assert.match(t, /^\| a \| abc9 \| 121 \| 9 \| 10 \| 75 \| 8\.00 \| 1\.0 \| pass \|$/m);
  assert.match(t, /^\| b \| now \| 400 \| – \| – \| 240 \| 20\.00 \| 9\.0 \| pass \|$/m);
  assert.match(t, /^\| c \| now \| \(too large for the devices of the flow\) \|/m);
  // a and b: LUTs sqrt(1.21 * 0.81) = 0.99, slices sqrt(1.25 * 1) = 1.118, period sqrt(0.8 * 1) = 0.894, time sqrt(0.25 * 1) = 0.5
  assert.match(t, /\(2 designs routed every way\)/);
  assert.match(t, /^- abc9: 0\.990 \/ 1\.118 \/ 0\.894 \/ 0\.500$/m);
});
