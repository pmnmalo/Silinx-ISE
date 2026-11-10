// The Optimization in the Silinx toolchain (#2470): Fast, the usual mapping alone; Area, the smaller of its netlist and Speed's;
// both one placement, no register replication; Speed, Effort High as before; the projects made before them Fast, new ones Area
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { synthGoal, synthEffort, GOAL_IMPL, FAST_SYNTH, synthesizeVerilog, synthesizeArea, synthesizeFast } from '../packages/silinx-fpga/src/index.js';
import { DEEP_RULE, logicLevels } from '../packages/silinx-fpga/src/synth-open.js';
import { yosysNode } from '../packages/silinx-fpga/src/node.js';
import { emptyProjectJson } from '../web/js/project-store.js';
import { flowFrontEnd } from '../core/synth-front.js';
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
// stopwatch's comparisons of one signal with several constants as logic, #3097: 226 and 224 before.)
const USUAL_SPEED = { traffic: [110, 106], stopwatch: [225, 222], clock: [199, 208], pong: [261, 261] };
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
