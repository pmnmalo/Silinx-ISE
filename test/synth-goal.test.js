// The Optimization in the Silinx toolchain (#2470): Fast, the usual mapping alone; Area, the smaller of its netlist and Speed's;
// both one placement, no register replication; Speed, Effort High as before; the projects made before them Fast, new ones Area
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { synthGoal, synthEffort, GOAL_IMPL, FAST_SYNTH, synthesizeVerilog, synthesizeArea, synthesizeFast } from '../packages/silinx-fpga/src/index.js';
import { DEEP_RULE, logicLevels, criticalDelay, pathEnds, sliceCount } from '../packages/silinx-fpga/src/synth-open.js';
import { compile, elaborate } from '../core/compile.js';
import { compareNetlist } from './diff-synth.js';
import { yosysNode } from '../packages/silinx-fpga/src/node.js';
import { emptyProjectJson } from '../web/js/project-store.js';
import { flowFrontEnd, synthesisInput } from '../core/synth-front.js';
import { example, exampleProject, silinxFlow } from './examples-lib.mjs';

test('synthGoal: Fast, Area, Speed of the two ISE properties; every project before them Fast; new projects Area', () => {
  assert.equal(synthGoal({ optMode: 'Speed', optLevel: 1 }), 'fast');
  assert.equal(synthGoal({}), 'fast');
  assert.equal(synthGoal(undefined), 'fast');
  assert.equal(synthGoal({ optMode: 'Area', optLevel: 2 }), 'area');
  assert.equal(synthGoal({ optMode: 'area', optLevel: 1 }), 'area', 'Area at Normal (made before them): Area');
  assert.equal(synthGoal({ optMode: 'Speed', optLevel: 2 }), 'speed');
  assert.equal(synthGoal({ optMode: 'Speed', optLevel: '2' }), 'speed');
  for (const g of ['fast', 'area', 'speed']) assert.equal(synthGoal(GOAL_IMPL[g]), g, g);
  assert.deepEqual(GOAL_IMPL, { fast: { optMode: 'Speed', optLevel: 1 }, area: { optMode: 'Area', optLevel: 2 }, speed: { optMode: 'Speed', optLevel: 2 } });
  assert.equal(synthEffort(GOAL_IMPL.area), 'high', 'Area\'s mappings for speed as at High');
  assert.deepEqual(emptyProjectJson('a').impl, { optMode: 'Area', optLevel: 2, startupClk: 'JtagClk' });
});

// the examples' sizes (Spartan-3E, Normal; LUTs): the usual mapping's, Speed's. Neither is always the smaller. (The
// stopwatch's comparisons of one signal with several constants as logic, #3097: 226 and 224 before; the clock's 199 and 208
// before its counters were sized by CLK_HZ and its inputs read through btnOn / swOn, #3710.)
const USUAL_SPEED = { traffic: [110, 106], stopwatch: [225, 222], clock: [203, 212], pong: [261, 261] };
for (const [name, [usualLuts, speedLuts]] of Object.entries(USUAL_SPEED)) {
  test(`Area's synthesis of ${name}: the usual mapping (FAST_SYNTH, one mapping) and Speed's, the smaller kept`, async () => {
    const ex = example(name);
    const fe = flowFrontEnd(ex.sources.filter(s => s.role !== 'sim' && /^(vhdl|verilog)$/.test(s.lang)), ex.project.top);
    assert.deepEqual(fe.errors, []);
    const opts = { family: 'spartan3e', run: yosysNode, effort: 'normal' };
    const [usual, speed, area] = await Promise.all([synthesizeVerilog(fe.input(), { ...opts, ...FAST_SYNTH }), synthesizeVerilog(fe.input(), opts),
      synthesizeArea(fe.input(), opts)]);
    assert.deepEqual([usual.util.luts, speed.util.luts], [usualLuts, speedLuts]);
    assert.ok(!usual.depth?.small && !usual.depth?.speed && !usual.depth?.resynth && !usual.depth?.bdd, JSON.stringify(usual.depth));
    assert.equal(area.area.usual.luts, usualLuts);
    assert.equal(area.area.speed.luts, speedLuts);
    const kept = area.area.kept === 'usual' ? area.area.usual : area.area.speed, other = area.area.kept === 'usual' ? area.area.speed : area.area.usual;
    assert.ok(kept.slices < other.slices || (kept.slices === other.slices && kept.luts <= other.luts), JSON.stringify(area.area));
    assert.equal(area.util.luts, kept.luts);
    assert.ok(area.area.slices === undefined && Number.isFinite(kept.slices));
  });
}

// a priority encoder of 128 requests (#3096): 42 levels of logic in the usual mapping (DEEP_RULE: more than 16), 49.0 ns by the
// estimate; Speed's mappings 7.6 ns, 217 LUTs against 182
const PRIO = `module prio(input clk, input [127:0] req, output reg [6:0] idx, output reg any);
  reg [127:0] r; integer i;
  always @(posedge clk) begin r <= req; any <= |r; idx <= 0; for (i = 0; i < 128; i = i + 1) if (r[i]) idx <= i; end
endmodule`;
const prioInput = () => {
  const fe = flowFrontEnd([{ path: 'prio.v', lang: 'verilog', text: PRIO }], 'prio');
  assert.deepEqual(fe.errors, []);
  return fe.input();
};

test('#3096 Fast\'s synthesis of a deep design: Speed\'s netlist too, kept when DEEP_RULE.gain faster', async () => {
  const opts = { family: 'spartan3e', run: yosysNode, effort: 'normal' };
  const [usual, speed] = await Promise.all([synthesizeVerilog(prioInput(), { ...opts, ...FAST_SYNTH }), synthesizeVerilog(prioInput(), { ...opts, effort: 'high' })]);
  assert.equal(logicLevels(usual.files['prio.json'], 'prio'), 42);
  assert.deepEqual([usual.util.luts, speed.util.luts], [182, 217]);
  const lines = [];
  const fast = await synthesizeFast(prioInput(), { ...opts, onLine: l => lines.push(l) });
  assert.equal(fast.fast.levels, 42);
  assert.equal(fast.fast.kept, 'speed');
  assert.deepEqual([fast.fast.usual.luts, fast.fast.speed.luts], [182, 217]);
  assert.ok(fast.fast.speed.ns <= fast.fast.usual.ns * (1 - DEEP_RULE.gain), JSON.stringify(fast.fast));
  assert.equal(fast.files['prio.json'], speed.files['prio.json']);
  assert.deepEqual(fast.warnings, []);   // no warnings
  // not that much faster: the usual mapping kept, its netlist, Speed's measured
  const slow = await synthesizeFast(prioInput(), { ...opts, deepRule: { ...DEEP_RULE, gain: 0.99 } });
  assert.equal(slow.fast.kept, 'usual');
  assert.equal(slow.files['prio.json'], usual.files['prio.json']);
  assert.deepEqual(slow.warnings, []);
  // not deep by the rule: the usual mapping alone, no r.fast
  const shallow = await synthesizeFast(prioInput(), { ...opts, deepRule: { ...DEEP_RULE, levels: 42 } });
  assert.equal(shallow.fast, undefined);
  assert.equal(shallow.files['prio.json'], usual.files['prio.json']);
});

// #652: spi-fpga-slave's shift register (test/lut-resynth.test.js): its enable `load | shift` 3 LUT levels in the usual mapping, as
// written, where XST has 2; Fast's netlist has its critical LUTs made shallower too (synth-open-resynth.js, no mapping), as Speed's
const SHIFT_VHDL = `library ieee; use ieee.std_logic_1164.all;
entity shift is port (clk, cs, sclk, last, busy, vld, mosi : in std_logic; din : in std_logic_vector(7 downto 0); q : out std_logic_vector(7 downto 0)); end shift;
architecture rtl of shift is
  signal rcs, rsclk, rspi, rlast, rbusy, rvld, rmosi : std_logic := '0';
  signal rdin, sh : std_logic_vector(7 downto 0) := (others => '0');
  signal rx, load, en : std_logic;
begin
  rx <= rsclk and not rspi and rlast;
  load <= rvld and ((rcs and not rbusy) or rx);
  en <= load or (rspi and not rsclk and not rcs);
  process (clk) begin
    if rising_edge(clk) then
      rcs <= cs; rsclk <= sclk; rspi <= rsclk; rlast <= last; rbusy <= busy; rvld <= vld; rmosi <= mosi; rdin <= din;
      if en = '1' then
        if load = '1' then sh <= rdin; else sh <= sh(6 downto 0) & rmosi; end if;
      end if;
    end if;
  end process;
  q <= sh;
end rtl;
`;
const SHIFT_VERILOG = `module shift(input clk, cs, sclk, last, busy, vld, mosi, input [7:0] din, output [7:0] q);
  reg rcs = 0, rsclk = 0, rspi = 0, rlast = 0, rbusy = 0, rvld = 0, rmosi = 0;
  reg [7:0] rdin = 0, sh = 0;
  wire rx = rsclk & ~rspi & rlast;
  wire load = rvld & ((rcs & ~rbusy) | rx);
  wire en = load | (rspi & ~rsclk & ~rcs);
  always @(posedge clk) begin
    rcs <= cs; rsclk <= sclk; rspi <= rsclk; rlast <= last; rbusy <= busy; rvld <= vld; rmosi <= mosi; rdin <= din;
    if (en) sh <= load ? rdin : {sh[6:0], rmosi};
  end
  assign q = sh;
endmodule
`;

test('#652 Fast\'s synthesis of a short control path (spi-fpga-slave\'s enable): its critical LUTs made shallower, 2 levels instead of 3, kept by DEPTH_RULE, in VHDL and in Verilog; the netlist simulates as the design, no warning', async () => {
  const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-9, `${what}: ${a} vs ${b}`);
  const opts = { family: 'spartan3e', run: yosysNode, effort: 'normal' };
  for (const [lang, text] of [['vhdl', SHIFT_VHDL], ['verilog', SHIFT_VERILOG]]) {
    const des = elaborate(compile([{ path: lang === 'vhdl' ? 'd.vhd' : 'd.v', lang, text }]), 'shift');
    const [usual, fast] = await Promise.all([synthesizeVerilog(synthesisInput(des), { ...opts, ...FAST_SYNTH }), synthesizeFast(synthesisInput(des), opts)]);
    // the usual mapping (Area's): 0.59 + 3 LUTs and their connections + the CE's 0.55, 5.04 ns, 11 LUTs
    close(criticalDelay(usual.files['shift.json'], 'shift'), 0.59 + 0.45 + 0.70 + 0.45 + 0.70 + 0.45 + 0.70 + 0.45 + 0.55, `${lang} usual`);
    assert.deepEqual([usual.util.luts, usual.depth.resynth], [11, undefined], lang);
    // Fast: the enable on 2 levels, the D logic's 3 levels into D the critical path, 4.17 ns
    const json = fast.files['shift.json'];
    close(criticalDelay(json, 'shift'), 0.59 + 0.45 + 0.70 + 0.45 + 0.70 + 0.45 + 0.70 + 0.13, `${lang} fast`);
    assert.equal(pathEnds(json, 'shift').ends.filter(e => e.port === 'CE').every(e => e.ns < 4), true, `${lang}: the enable's paths 2 levels`);
    assert.deepEqual({ ...fast.depth.resynth, ns: +fast.depth.resynth.ns.toFixed(2) }, { rounds: 1, changed: 1, ns: 4.17, luts: 12, slices: 12, kept: true }, lang);
    assert.deepEqual([fast.util.luts, fast.util.flipFlops, fast.fast], [12, 23, undefined], lang);
    // the Verilog netlist and the statistics are the new netlist's
    assert.equal(fast.files['shift_yosys.v'].match(/^ {2}LUT[1-4] #/gm).length, 12, lang);
    assert.deepEqual(['LUT2', 'LUT3', 'LUT4'].map(t => +(new RegExp(`(\\d+) +${t}\\b`).exec(fast.files['shift_stat.txt'])?.[1] ?? 0)), [0, 9, 3], lang);
    assert.deepEqual(fast.warnings, [], lang);
    const cmp = compareNetlist(des, fast, { name: `fast-resynth-${lang}`, seed: 'shift', sim: { cycles: 600 } });
    assert.equal(cmp.status, 'pass', cmp.report || cmp.reason);
  }
});

// #370: a deep design too large for DEEP_RULE (the EPFL arbiter: 4033 LUTs, 30 levels, 34.9 ns in the usual mapping) gets the usual
// mapping balanced as sums of products (DEPTH_SOPB), the old Normal's, kept when DEEP_RULE.gain faster. The priority encoder with
// DEEP_RULE.maxLuts below its 182 LUTs stands for it: 42 levels and 49.0 ns before, 6 levels and 7.70 ns so, then 7.62 with
// its critical LUTs made shallower (#652; Speed's: 7.62)
test('#370 Fast\'s synthesis of a deep design too large for DEEP_RULE: the usual mapping balanced as sums of products, kept when DEEP_RULE.gain faster; the netlist simulates as the design', async () => {
  const opts = { family: 'spartan3e', run: yosysNode, effort: 'normal' };
  const large = { ...DEEP_RULE, maxLuts: 100 };
  const lines = [];
  const fast = await synthesizeFast(prioInput(), { ...opts, deepRule: large, onLine: l => lines.push(l) });
  const json = fast.files['prio.json'];
  assert.equal(fast.fast, undefined, 'not deep by the rule: Speed\'s not made');
  assert.deepEqual(fast.depth.sopb, { ns: fast.depth.sopb.ns, luts: 217, slices: 109, kept: true });
  assert.ok(Math.abs(fast.depth.sopb.ns - 7.70) < 1e-9, String(fast.depth.sopb.ns));
  // then the balanced netlist's critical LUTs made shallower (#652): 7.62 ns, Speed's
  assert.deepEqual({ ...fast.depth.resynth, ns: +fast.depth.resynth.ns.toFixed(2) }, { rounds: 2, changed: 2, ns: 7.62, luts: 217, slices: 109, kept: true });
  assert.ok(Math.abs(criticalDelay(json, 'prio') - 7.62) < 1e-9, String(criticalDelay(json, 'prio')));
  assert.deepEqual([fast.util.luts, logicLevels(json, 'prio'), sliceCount(json, 'prio')], [217, 6, 109]);
  assert.deepEqual(fast.warnings, []);   // no warnings
  assert.deepEqual(lines.filter(l => /^Warning/.test(l)), []);
  // the usual mapping alone (FAST_SYNTH: Area's), as Fast was: 42 levels
  const usual = await synthesizeVerilog(prioInput(), { ...opts, ...FAST_SYNTH });
  assert.equal(usual.depth.sopb, undefined);
  assert.deepEqual([usual.util.luts, logicLevels(usual.files['prio.json'], 'prio')], [182, 42]);
  // not that much faster: the usual mapping kept, its netlist (its resynthesis not kept either)
  const slow = await synthesizeFast(prioInput(), { ...opts, deepRule: { ...large, gain: 0.99 } });
  assert.deepEqual([slow.depth.sopb.kept, slow.depth.resynth.kept], [false, false]);
  assert.equal(slow.files['prio.json'], usual.files['prio.json']);
  const des = elaborate(compile([{ path: 'prio.v', lang: 'verilog', text: PRIO }]), 'prio');
  const cmp = compareNetlist(des, fast, { name: 'fast-sopb-prio', seed: 'prio', sim: { cycles: 400 } });
  assert.equal(cmp.status, 'pass', cmp.report || cmp.reason);
});

test('#3096 Fast\'s synthesis of a design not deep (traffic): the usual mapping alone, as FAST_SYNTH', async () => {
  const ex = example('traffic');
  const fe = flowFrontEnd(ex.sources.filter(s => s.role !== 'sim' && /^(vhdl|verilog)$/.test(s.lang)), ex.project.top);
  const opts = { family: 'spartan3e', run: yosysNode, effort: 'normal' };
  const [usual, fast] = await Promise.all([synthesizeVerilog(fe.input(), { ...opts, ...FAST_SYNTH }), synthesizeFast(fe.input(), opts)]);
  assert.equal(fast.fast, undefined);
  assert.equal(fast.util.luts, 110);
  assert.equal(fast.files[`${fast.top}.json`], usual.files[`${usual.top}.json`]);
});

test('Fast, Area and Speed through the whole flow (traffic, Basys2-250): their logs, placements and the same warnings', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-goal-'));
  try {
    const run = async (goal) => {
      const { dir, project } = exampleProject('traffic', { board: 'basys2', variant: '250' }, path.join(tmp, goal));
      const job = await silinxFlow(dir, { ...project, impl: { ...project.impl, ...GOAL_IMPL[goal] } });
      assert.equal(job.status, 'ok', job.lines.slice(-6).join('\n'));
      return job.lines;
    };
    const fast = await run('fast'), area = await run('area'), speed = await run('speed');
    const said = (lines, re) => lines.filter(l => re.test(l));
    assert.deepEqual(said(fast, /^Optimization/), ['Optimization Fast: one mapping, none of the mappings for speed but for a design limited by its logic depth; one placement, no register replication.']);
    assert.deepEqual(said(area, /^Optimization/).slice(0, 1), ['Optimization Area: the usual mapping and the mappings for speed, the smaller netlist kept; one placement, no register replication.']);
    assert.ok(said(area, /^Optimization Area: the usual mapping \d+ slices, 110 LUTs, the mappings for speed \d+ slices, \d+ LUTs: the (usual mapping|mappings for speed') kept\.$/).length === 1, said(area, /Optimization/).join('\n'));
    assert.ok(said(speed, /^Optimization Effort High: the mappings for speed tried too, the fastest kept\.$/).length === 1, said(speed, /Optimization/).join('\n'));
    for (const lines of [fast, area]) assert.deepEqual(said(lines, /placements \(seeds|^Placement \d+ of|^Register replication/), []);
    assert.ok(said(speed, /^Optimization Effort High: \d+ placements|^Placement 1 of [2-9]/).length > 0, said(speed, /lacement/).join('\n'));
    for (const lines of [area, speed]) assert.deepEqual(said(lines, /^WARNING/), said(fast, /^WARNING/), 'the same warnings');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
