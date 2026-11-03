// The MCP server's Test Bench Wizard and UCF Wizard (#2674, server/mcp-test-bench.js, server/mcp-wizards.js): self-checking
// test benches of the examples' modules (combinational, sequential with its clock and reset), in VHDL and in Verilog,
// their vectors generated or given, their expected outputs from the design, simulated: TEST PASSED, or the mismatch
// and TEST FAILED; a skeleton; a constraints file on the board's pins, or on pins given; the wizards' refusals.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { scratchEnv } from './server-helpers.js';

let tmp;
const { handle } = await import('../server/mcp.js');
const P = await import('../server/projects.js');
let id = 0;
async function call(name, args = {}) {
  const r = (await handle({ jsonrpc: '2.0', id: ++id, method: 'tools/call', params: { name, arguments: args } })).result;
  return { text: r.content[0].text, data: r.structuredContent, isError: r.isError };
}
const ok = async (name, args) => { const r = await call(name, args); assert.equal(r.isError, false, r.text); return r; };
const fails = async (name, args, message) => { const r = await call(name, args); assert.equal(r.isError, true, r.text); assert.equal(r.text, `${name}: ${message}`); };
// the test bench run: its messages, and whether it failed
const run = async (project, top) => { const s = await ok('simulate', { project, top, time_ns: 100000, signals: [] }); assert.deepEqual(s.data.warnings, []); return { log: s.data.log.map(l => l.text), failed: s.data.failed }; };
const RUN = 'Run it with simulate (top: the test bench): the log shows each mismatch and TEST PASSED / TEST FAILED.';

before(async () => {
  tmp = await scratchEnv('silinx-mcp-test-bench-');
  for (const ex of ['gates', 'blinky', 'traffic']) await ok('new_project_from_example', { name: ex, example: ex });
});
after(() => fs.rmSync(tmp, { recursive: true, force: true }));

test('test_bench_wizard: gates, every combination, the expected outputs from the design; TEST PASSED in VHDL and in Verilog', async () => {
  for (const [lang, ext, L, log] of [['vhdl', 'vhd', 'VHDL', ['TEST PASSED: 16 vector(s)']], ['verilog', 'v', 'Verilog', ['TEST PASSED: 16 vector(s)', 'simulation finished ($finish) at 160 ns']]]) {
    const r = await ok('test_bench_wizard', { project: 'gates', name: `tb_auto_${ext}`, language: lang, expected: 'design' });
    assert.equal(r.text, [`Test Bench Wizard: created sim/tb_auto_${ext}.${ext} (${L}), the test bench tb_auto_${ext} of gates.`, 'Combinational test, settling time 10 ns', 'Reset: none',
      'Vectors: 16 (exhaustive); expected values: 16 vector(s) checked.', RUN].join('\n'));
    assert.equal((await P.readProject('gates')).files.find(f => f.path === `sim/tb_auto_${ext}.${ext}`)?.role, 'sim');
    assert.deepEqual(await run('gates', `tb_auto_${ext}`), { log, failed: false });
  }
});

test('test_bench_wizard: blinky\'s prescaler, sequential (its clock and reset guessed), counting vectors, in VHDL and in Verilog', async () => {
  for (const [lang, log] of [['vhdl', ['TEST PASSED: 6 vector(s)']], ['verilog', ['TEST PASSED: 6 vector(s)', 'simulation finished ($finish) at 160 ns']]]) {
    const r = await ok('test_bench_wizard', { project: 'blinky', module: 'prescaler', name: `tb_pre_${lang}`, language: lang, stimulus: 'count', count: 6, expected: 'design' });
    assert.equal(r.text.split('\n').slice(1, 4).join('\n'), 'Clock: clk, 20 ns (sequential test, one vector per clock cycle)\nReset: rst, active \'1\' for 2 clock cycle(s)\nVectors: 6 (count); expected values: 6 vector(s) checked.');
    assert.deepEqual([r.data.clock, r.data.reset], ['clk', 'rst']);
    assert.deepEqual(await run('blinky', `tb_pre_${lang}`), { log, failed: false });
  }
});

test('test_bench_wizard: given vectors, one expected value wrong: the mismatch and TEST FAILED; walking vectors; a skeleton', async () => {
  const zero = { phase2: '0', phase1: '0', phase0: '0', blink: '0' };
  await ok('test_bench_wizard', { project: 'traffic', module: 'lamps', name: 'tb_given', stimulus: 'vectors', vectors: [{ inputs: zero, expected: { car_g: '1', car_r: '0' } }, { inputs: { ...zero, phase0: '1' }, expected: { car_g: '1' } }] });
  assert.deepEqual(await run('traffic', 'tb_given'), { log: ['vector 1: phase2=0 phase1=0 phase0=1 blink=0 -> expected --1--, got 01010', 'TEST FAILED: 1 of 2 vector(s) wrong'], failed: true });
  const w = await ok('test_bench_wizard', { project: 'traffic', module: 'lamps', name: 'tb_walk', stimulus: 'walking', expected: 'design', language: 'verilog' });
  assert.equal(w.data.vectors, 10);
  assert.deepEqual(await run('traffic', 'tb_walk'), { log: ['TEST PASSED: 10 vector(s)', 'simulation finished ($finish) at 100 ns'], failed: false });
  // random vectors, their outputs only reported
  const n = await ok('test_bench_wizard', { project: 'traffic', module: 'lamps', name: 'tb_rnd', stimulus: 'random', count: 5, seed: 7 });
  assert.match(n.text, /\nVectors: 5 \(random\); expected values: none \(the outputs are only reported\)\.\n/);
  const sk = await ok('test_bench_wizard', { project: 'traffic', module: 'top', name: 'tb_sk', stimulus: 'none' });
  assert.equal(sk.text, ['Test Bench Wizard: created sim/tb_sk.vhd (VHDL), the test bench tb_sk of top.', 'Clock: clk, 20 ns', 'Reset: none',
    'Vectors: none — a skeleton: write the stimulus (set the inputs, wait, check the outputs) where the comments show.', RUN].join('\n'));
  assert.match((await ok('check_syntax', { project: 'traffic', top: 'tb_sk', simulation: true })).text, /^Process "Check Syntax" of <tb_sk> completed successfully \(\d+ signals, \d+ processes\)\.$/);
});

test('test_bench_wizard: traffic\'s timer, its port named done (#2740): the bench\'s own is tb_done, TEST PASSED in VHDL and in Verilog', async () => {
  for (const [lang, log] of [['vhdl', ['TEST PASSED: 8 vector(s)']], ['verilog', ['TEST PASSED: 8 vector(s)', 'simulation finished ($finish) at 200 ns']]]) {
    await ok('test_bench_wizard', { project: 'traffic', module: 'timer', name: `tb_timer_${lang}`, language: lang, stimulus: 'random', count: 8, expected: 'design' });
    assert.deepEqual(await run('traffic', `tb_timer_${lang}`), { log, failed: false });
  }
});

test('test_bench_wizard: the wizard\'s refusals', async () => {
  await fails('test_bench_wizard', { project: 'gates', module: 'nosuch' }, 'no design module \'nosuch\' in the project');
  await fails('test_bench_wizard', { project: 'gates', name: '1tb' }, 'Enter a valid test bench name (a letter, then letters, digits and _).');
  await fails('test_bench_wizard', { project: 'gates', name: 'process' }, '\'process\' is a reserved word of VHDL: choose another name.');
  await fails('test_bench_wizard', { project: 'gates', name: 'tb_gates', language: 'verilog' }, 'A module named \'tb_gates\' already exists.');
  await fails('test_bench_wizard', { project: 'gates', name: 'tb_gates' }, 'sim/tb_gates.vhd already exists: choose another name.');
  await fails('test_bench_wizard', { project: 'gates', name: 'tb_auto_vhd' }, 'sim/tb_auto_vhd.vhd already exists: choose another name.');
  await fails('test_bench_wizard', { project: 'blinky', module: 'prescaler', name: 'tb_x', clock: 'rst', reset: 'rst' }, 'The clock and the reset must be different ports.');
  await fails('test_bench_wizard', { project: 'blinky', module: 'prescaler', name: 'tb_x', clock: 'tick' }, 'clock: \'tick\' is not a one-bit input of prescaler (clk, rst)');
  await fails('test_bench_wizard', { project: 'blinky', module: 'prescaler', name: 'tb_x', period_ns: 1 }, 'The clock period must be at least 2 ns.');
  await fails('test_bench_wizard', { project: 'gates', name: 'tb_x', stimulus: 'vectors' }, 'stimulus vectors: give the vectors');
  await fails('test_bench_wizard', { project: 'gates', name: 'tb_x', vectors: [] }, 'vectors: with stimulus vectors');
  await fails('test_bench_wizard', { project: 'gates', name: 'tb_x', stimulus: 'vectors', vectors: [{ inputs: { nosuch: '1' } }] }, 'vector 0: no port \'nosuch\' to set or check');
  await fails('test_bench_wizard', { project: 'gates', name: 'tb_x', stimulus: 'vectors', vectors: [{ inputs: { sw: '1-01' } }] }, 'vector 0, input sw: an input cannot be \'-\'');
  await fails('test_bench_wizard', { project: 'gates', name: 'tb_x', stimulus: 'none', expected: 'design' }, 'expected design: a skeleton has no vectors');
  assert.ok(!fs.existsSync(path.join(P.projectDir('gates'), 'sim/tb_x.vhd')));
});

test('constraints_wizard: a module\'s ports on the board\'s pins; with no board, the pins given; the refusals', async () => {
  const r = await ok('constraints_wizard', { project: 'traffic', module: 'top', name: 'mine' });
  assert.equal(r.text, 'UCF Wizard: created constraints/mine.ucf for top: 24 of 24 net(s) on a pin of the Digilent Basys2, the period of clk.');
  const ucf = fs.readFileSync(path.join(P.projectDir('traffic'), 'constraints/mine.ucf'), 'utf8');
  assert.match(ucf, /^# UCF generated by the Silinx UCF Wizard for 'top' \(xc3s250e-4-cp132, Digilent Basys2\)/);
  assert.match(ucf, /NET "clk" +LOC = "B8"/);
  // the project keeps its own constraints file
  assert.equal((await P.readProject('traffic')).constraints, 'constraints/traffic.ucf');
  await ok('new_project', { name: 'n' });
  await ok('write_file', { project: 'n', path: 'src/a.v', text: 'module a(input clk, input [1:0] sw, output [1:0] led);\n  assign led = sw;\nendmodule\n' });
  const n = await ok('constraints_wizard', { project: 'n', module: 'a', pins: { clk: 'p1', 'sw<0>': 'P2' } });
  assert.equal(n.text, 'UCF Wizard: created constraints/a.ucf for a: 2 of 5 net(s) on a pin.\nWARNING: no pin for sw<1>, led<1>, led<0>.\nconstraints/a.ucf is the project\'s constraints file.');
  assert.equal(fs.readFileSync(path.join(P.projectDir('n'), 'constraints/a.ucf'), 'utf8'), '# UCF generated by the Silinx UCF Wizard for \'a\' (xc3s250e-4-cp132)\n\nNET "clk"    LOC = "P1" ;\nNET "sw<0>"  LOC = "P2" ;\n# NET "sw<1>"  LOC = "" ;  # unassigned\n# NET "led<0>" LOC = "" ;  # unassigned\n# NET "led<1>" LOC = "" ;  # unassigned\n');
  assert.equal((await P.readProject('n')).constraints, 'constraints/a.ucf');
  await fails('constraints_wizard', { project: 'n', module: 'a' }, 'constraints/a.ucf already exists: choose another name.');
  await fails('constraints_wizard', { project: 'n', module: 'a', name: 'b', pins: { clk: 'P1', 'sw<0>': 'p1' } }, 'The pin P1 is given to clk and sw<0>.');
  await fails('constraints_wizard', { project: 'n', module: 'a', name: 'b', pins: { 'sw<2>': 'P3' } }, 'pins: \'sw<2>\' is not a net of a (clk, sw<1>, sw<0>, led<1>, led<0>)');
  await fails('constraints_wizard', { project: 'n', module: 'nosuch' }, 'no design module \'nosuch\' in the project');
  await ok('set_design_properties', { project: 'n', board: 'none', part: 'ice40hx1k', package: 'vq100' });
  await fails('constraints_wizard', { project: 'n', module: 'a', name: 'c' }, 'the ICE40HX1K\'s constraints are a PCF: new_source constraints writes one');
});
