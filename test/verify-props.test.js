// Verify Property (#3177, core/verify-props.js): a state diagram's or an ASM chart's property proved by Yosys's SAT
// solver: never (a state never reached), reach (a state reached: the way there), exclusive (1-bit outputs never 1
// together); proved by induction, bounded, or the counterexample, in a drawing of each language; its test bench (the
// drawing's HDL with the property's assertion, then the bench) simulated: the property's message at the clock cycle the
// proof gives; the examples' drawings (traffic's state diagram, blinky's ASM chart); the refusals; the copy's HDL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';
import { verifyProperty, propertyMessages, propertyBench, propertyCopy, propertyError } from '../core/verify-props.js';
import { generateFsm } from '../core/fsm-hdl.js';
import { simulate } from '../core/compile.js';

// A -go-> B -go-> C -> A; x in A and C, y in B and C; D never entered
const FSM = lang => ({
  version: 1, kind: 'fsm', name: 'xy', lang, clock: 'clk', reset: { name: 'rst', active: 'high', sync: true }, encoding: 'binary', style: '3process',
  inputs: [{ name: 'go', width: 1 }], outputs: [{ name: 'x', width: 1, default: '0' }, { name: 'y', width: 1, default: '0' }],
  states: [{ id: 's1', name: 'A', x: 0, y: 0, outputs: { x: '1' } }, { id: 's2', name: 'B', x: 200, y: 0, outputs: { y: '1' } },
    { id: 's3', name: 'C', x: 400, y: 0, outputs: { x: '1', y: '1' } }, { id: 's4', name: 'D', x: 200, y: 200, outputs: {} }],
  transitions: [{ id: 't1', from: 's1', to: 's2', cond: 'go' }, { id: 't2', from: 's2', to: 's3', cond: 'go' }, { id: 't3', from: 's3', to: 's1', cond: '' },
    { id: 't4', from: 's4', to: 's1', cond: '' }],
  initial: 's1',
});
const hdlOf = m => { const g = generateFsm(m, m.lang); return { path: `src/${g.filename}`, lang: g.lang, text: g.code }; };
const check = (m, property, depth) => verifyProperty([hdlOf(m)], { drawing: m, property, depth, run: yosysNode });
const msgs = (r, o) => propertyMessages(r, o).map(x => [x.kind, x.text.trim()]).filter(([, t]) => t);
// the property's test bench simulated: the messages of the drawing's copy (its property's), their times
function replay(r, srcs) {
  const b = propertyBench(r);
  const s = simulate([...srcs, { path: b.path, lang: r.copy.lang, text: b.text, role: 'simulation' }], b.name, { until: 1e15 });
  assert.deepEqual(s.errors, []);
  return s.sim.log.filter(l => l.kind === 'error').map(l => [l.time / 1000, l.text]);
}

test('exclusive: x and y both 1 in state C, at clock cycle 3, replayed (a VHDL drawing and a Verilog one)', async () => {
  for (const lang of ['vhdl', 'verilog']) {
    const m = FSM(lang);
    const r = await check(m, { kind: 'exclusive', outputs: ['x', 'y'] });
    assert.deepEqual([r.status, r.holds, r.cycle, r.warnings, r.cycles.slice(0, 2).map(c => c.in.go)], ['failed', false, 3, [], ['1', '1']], lang);
    assert.deepEqual(msgs(r, { bench: 'sim/verify_xy.vhd' }).slice(1), [
      ['info', 'Proving that \'xy\' never has x and y both 1: Yosys\'s SAT solver, at most 20 clock cycle(s), then a proof by induction.'],
      ['err', 'ERROR:Verify - \'xy\' has x and y both 1 at clock cycle 3.'],
      ['info', 'The counterexample\'s test bench: sim/verify_xy.vhd (it replays the 3 clock cycle(s) in the simulator).'],
      ['err', 'Process "Verify Property" failed'],
    ], lang);
    // (C entered at the rising edge of cycle 2, 30 ns)
    assert.deepEqual(replay(r, [hdlOf(m)]), [[30, 'xy has two of x, y 1 together']], lang);
    const b = propertyBench(r);
    assert.equal(b.path, `sim/verify_xy.${lang === 'vhdl' ? 'vhd' : 'v'}`);
    assert.match(b.text, /^(--|\/\/) Counterexample of Verify \(Silinx\): 'xy' has x and y both 1 at clock cycle 3\.\n/);
  }
});

test('never: an unreachable state proved by induction; a reached one, its counterexample', async () => {
  const m = FSM('vhdl');
  const r = await check(m, { kind: 'never', state: 'D' });
  assert.deepEqual([r.status, r.holds, r.induction, r.warnings], ['proved', true, 1, []]);
  assert.deepEqual(msgs(r).slice(2), [['ok', 'Proved: \'xy\' never reaches state D, for every input sequence (by induction over 1 clock cycle(s)).'], ['ok', 'Process "Verify Property" completed successfully']]);
  const c = await check(m, { kind: 'never', state: 'C' });
  assert.deepEqual([c.status, c.holds, c.cycle], ['failed', false, 3]);
  assert.equal(msgs(c)[2][1], 'ERROR:Verify - \'xy\' reaches state C at clock cycle 3.');
  assert.deepEqual(replay(c, [hdlOf(m)]), [[30, 'xy reaches state C']]);
});

test('reach: the way to a state (it holds), a state never reached (an error), too deep for the depth (a warning)', async () => {
  const m = FSM('verilog');
  const r = await check(m, { kind: 'reach', state: 'C' });
  assert.deepEqual([r.status, r.holds, r.cycle], ['failed', true, 3]);
  assert.deepEqual(msgs(r, { bench: 'sim/verify_xy.v' }).slice(2), [
    ['ok', '\'xy\' reaches state C at clock cycle 3.'],
    ['info', 'The way there as a test bench: sim/verify_xy.v (it replays the 3 clock cycle(s) in the simulator).'],
    ['ok', 'Process "Verify Property" completed successfully'],
  ]);
  const d = await check(m, { kind: 'reach', state: 'D' });
  assert.deepEqual([d.status, d.holds], ['proved', false]);
  assert.deepEqual(msgs(d).slice(2), [['err', 'ERROR:Verify - \'xy\' never reaches state D, for any input sequence (proved by induction over 1 clock cycle(s)).'], ['err', 'Process "Verify Property" failed']]);
  const b = await check(m, { kind: 'reach', state: 'C' }, 2);
  assert.deepEqual([b.status, b.holds, msgs(b).slice(2)], ['bounded', false, [['warn', 'WARNING:Verify - \'xy\' does not reach state C in the first 2 clock cycle(s): a larger depth checks more cycles.'], ['ok', 'Process "Verify Property" completed successfully with 1 warning(s)']]]);
});

test('the examples\' drawings: traffic\'s state diagram reaches WALK at cycle 4; blinky\'s ASM chart leaves IDLE only after its debouncing', async () => {
  const read = (ex, f) => fs.readFileSync(new URL(`../examples/${ex}/src/${f}`, import.meta.url), 'utf8');
  const traffic = JSON.parse(read('traffic', 'traffic.fsm.json'));
  const srcT = [{ path: 'src/traffic.vhd', lang: 'vhdl', text: read('traffic', 'traffic.vhd') }];
  const w = await verifyProperty(srcT, { drawing: traffic, property: { kind: 'reach', state: 'WALK' }, run: yosysNode });
  assert.deepEqual([w.status, w.holds, w.cycle, w.warnings], ['failed', true, 4, []]);
  assert.deepEqual(replay(w, srcT), [[50, 'traffic reaches state WALK']]);   // (the edge of cycle 3)
  const asm = JSON.parse(read('blinky', 'speed_ctrl.asm.json'));
  const srcB = [{ path: 'src/speed_ctrl.vhd', lang: 'vhdl', text: read('blinky', 'speed_ctrl.vhd') }];
  const i = await verifyProperty(srcB, { drawing: asm, property: { kind: 'never', state: 'IDLE' }, run: yosysNode });
  assert.deepEqual([i.status, i.cycle], ['failed', 1]);
  const r = await verifyProperty(srcB, { drawing: asm, property: { kind: 'reach', state: 'WAIT_RELEASE' }, depth: 5, run: yosysNode });
  assert.deepEqual([r.status, r.holds], ['bounded', false]);
});

test('the refusals; the copy: the module renamed, the assertion before its end, the project\'s HDL unchanged', async () => {
  const m = FSM('vhdl');
  assert.equal(propertyError(m, { kind: 'never', state: 'Z' }), '\'Z\' is not a state of \'xy\' (its states: A, B, C, D)');
  assert.equal(propertyError(m, { kind: 'reach' }), 'the property \'reach\' needs a state');
  assert.equal(propertyError(m, { kind: 'exclusive', outputs: ['x'] }), 'the property \'exclusive\' needs two 1-bit outputs or more');
  assert.equal(propertyError(m, { kind: 'exclusive', outputs: ['x', 'go'] }), '\'go\' is not a 1-bit output of \'xy\' (its 1-bit outputs: x, y)');
  assert.equal(propertyError(m, { kind: 'exclusive', outputs: ['x', 'x'] }), 'the property \'exclusive\' names an output twice');
  assert.equal(propertyError(m, { kind: 'sometimes' }), 'a property is one of never, reach, exclusive');
  const e = await check(m, { kind: 'never', state: 'Z' });
  assert.deepEqual(msgs(e), [['hdr', 'Started : "Verify Property".'], ['err', 'ERROR:Verify - \'Z\' is not a state of \'xy\' (its states: A, B, C, D)'], ['err', 'Process "Verify Property" failed']]);
  const v = propertyCopy(m, { kind: 'never', state: 'D' });
  assert.deepEqual([v.name, v.path, v.lang], ['xy_props', 'sim/xy_props.vhd', 'vhdl']);
  assert.match(v.text, /\nentity xy_props is\n/);
  assert.match(v.text, /    verify_property : assert state_reg \/= S_D report "xy reaches state D" severity error;\n\nend architecture rtl;/);
  const g = propertyCopy(FSM('verilog'), { kind: 'exclusive', outputs: ['x', 'y'] });
  assert.match(g.text, /\nmodule xy_props/);
  assert.match(g.text, /    always @\* verify_property: assert \(!\(\(x && y\)\)\) else \$error\("xy has two of x, y 1 together"\);\n\nendmodule\n$/);
  assert.doesNotMatch(hdlOf(m).text, /verify_property|xy_props/);
});
