// AMD Vivado's timing paths (#3178, core/vivado-paths.js): report_timing_summary's setup paths (Vivado 2025.2 on four
// examples on the Basys 3: test/fixtures/vivado, the first 3 paths of each clock) read stage by stage, their arrival
// against the report's own column and delay; Vivado's netlist names as signals; each stage back to the example's HDL
// (core/hdl-drivers.js: the modules above an instance, a function's callers); traffic's state machine in its diagram.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseVivadoPaths, vivadoSignal, vivadoTimingPaths } from '../core/vivado-paths.js';
import { signalDrivers, upward } from '../core/hdl-drivers.js';
import { compile } from '../core/compile.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const report = name => fs.readFileSync(path.join(ROOT, `test/fixtures/vivado/${name}-timing.rpt.txt`), 'utf8');
function example(name) {
  const dir = path.join(ROOT, 'examples', name), pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  const sources = pj.files.filter(f => f.role === 'design' && /\.(vhdl?|v)$/.test(f.path))
    .map(f => ({ path: f.path, lang: /\.v$/.test(f.path) ? 'verilog' : 'vhdl', text: fs.readFileSync(path.join(dir, f.path), 'utf8') }));
  return { dir, sources, top: pj.top };
}

test('vivadoSignal: a netlist name as its signal: pin, bits, _reg, _i_2, _n_0, __2, FSM_sequential_, _OBUF, a carry\'s, a distributed RAM\'s', () => {
  assert.equal(vivadoSignal('u_speed/step_reg_reg/Q'), 'u_speed.step_reg');
  assert.equal(vivadoSignal('u_count/tens[3]_i_2/O'), 'u_count.tens');
  assert.equal(vivadoSignal('u_count/hundreds[3]_i_1_n_0'), 'u_count.hundreds');
  assert.equal(vivadoSignal('receiver/count[0]_i_1__2/O'), 'receiver.count');
  assert.equal(vivadoSignal('u_fsm/FSM_sequential_state_reg_reg[1]/Q'), 'u_fsm.state_reg');
  assert.equal(vivadoSignal('u_timer/led_OBUF_inst'), 'u_timer.led');
  assert.equal(vivadoSignal('u_speed/step_next0_carry__0/CO[3]'), 'u_speed.step_next');
  assert.equal(vivadoSignal('cpu/rbank_reg_0_15_0_5_i_29/O'), 'cpu.rbank');
  assert.equal(vivadoSignal('dec/quotient0/A[2]'), 'dec.quotient0');
  assert.equal(vivadoSignal('clk'), 'clk');
});

test('parseVivadoPaths: blinky\'s setup paths, each stage\'s delay and arrival as the report\'s Incr and Path columns', () => {
  const text = report('blinky'), { paths } = parseVivadoPaths(text);
  assert.ok(paths.length >= 3);
  const p = paths[0];
  assert.deepEqual([p.clock, p.required, p.slack, p.half, p.from, p.to, p.end], ['clk', 10, 5.071, false, 'u_speed/step_reg_reg', 'u_count/thousands_reg[0]', 'SLICE_X8Y13.R']);
  assert.deepEqual(p.stages.map(s => `${s.kind} ${s.type} ${s.site}${s.pin ? `.${s.pin}` : ''} ${s.delay}`).slice(0, 4), [
    'clock-to-out Prop_fdre_C_Q SLICE_X3Y17.Q 0.456', 'net net SLICE_X7Y14 1.124', 'logic Prop_lut6_I1_O SLICE_X7Y14.O 0.124', 'net net SLICE_X8Y15 0.555']);
  assert.deepEqual(p.stages.at(-1), { ...p.stages.at(-1), kind: 'setup', delay: 0.524, site: 'SLICE_X8Y13', pin: 'R' });
  for (const q of paths) {
    // (the data path's delay as the report gives it, its setup after it; the slack: the requirement less these, the
    // clock's skew, pessimism and uncertainty)
    const dp = q.stages.slice(0, -1).reduce((a, s) => a + s.delay, 0);
    assert.ok(Math.abs(q.stages.at(-1).arrival - q.delay) < 0.002 && q.delay > dp);
    assert.ok(Math.abs(q.slack - (q.required - q.delay)) < 1.5, `${q.slack} ${q.required} ${q.delay}`);
    assert.deepEqual([q.stages[0].kind, q.stages.at(-1).kind], ['clock-to-out', 'setup']);
  }
  // each path's data path delay, the report's "Data Path Delay", in order
  const reported = [...text.matchAll(/^Slack[\s\S]*?Data Path Delay: +([\d.]+)ns/gm)].map(m => +m[1]);
  // (the increments' sum within 3 ps of it: the report rounds each)
  const sums = paths.map(q => q.stages.slice(0, -1).reduce((a, s) => a + s.delay, 0)).sort(), want = reported.slice(0, paths.length).sort();
  assert.equal(sums.length, want.length);
  sums.forEach((x, k) => assert.ok(Math.abs(x - want[k]) <= 0.003, `${x} ${want[k]}`));
  assert.deepEqual(parseVivadoPaths('').paths, []);
  assert.deepEqual(parseVivadoPaths(null).paths, []);
});

for (const name of ['blinky', 'traffic', 'pong', 'stopwatch']) {
  test(`vivadoTimingPaths on ${name}: every logic stage back to a process, an assignment or a function's caller of the example`, () => {
    const ex = example(name);
    const r = vivadoTimingPaths(report(name), ex.sources, ex.top);
    assert.equal(r.toolchain, 'vivado');
    assert.ok(r.paths.length >= 3);
    for (const p of r.paths) {
      for (const s of p.stages.filter(x => x.kind !== 'net')) assert.ok(s.sources.length, `${name}: ${s.resources.join(' ')} traced back`);
      for (const l of p.lines) assert.match(fs.readFileSync(path.join(ex.dir, l.file), 'utf8').split('\n')[l.line - 1], /process|always|<=|assign|=/, `${l.file}:${l.line}`);
    }
  });
}

test('signalDrivers and upward: a function\'s callers (stopwatch\'s quotient), the name in the modules above an instance', () => {
  const ex = example('stopwatch');
  const where = signalDrivers(compile(ex.sources), ex.top);
  assert.deepEqual(where('dec.quotient').map(x => `${x.file}:${x.line}`), ['src/to_decimal.vhd:37']);
  assert.deepEqual(where('dec.nothing'), []);
  // (vga's instance timing drives the top's sx through its port: the top's sx)
  const vga = example('vga'), w = signalDrivers(compile(vga.sources), vga.top);
  assert.deepEqual(w('timing.sx'), []);
  assert.deepEqual(upward(w)('timing.sx'), w('sx'));
  assert.ok(w('sx').length);
  assert.deepEqual(upward(w)('timing.nothing'), []);
});

test('Vivado\'s paths in the drawings: traffic\'s state machine (FSM_sequential_state_reg) marks the state diagram\'s states', async () => {
  const { pathNames, drawingPath } = await import('../core/path-drawing.js');
  const ex = example('traffic');
  const r = vivadoTimingPaths(report('traffic'), ex.sources, ex.top);
  const fsm = JSON.parse(fs.readFileSync(path.join(ex.dir, 'src/traffic.fsm.json'), 'utf8'));
  const through = r.paths.filter(p => p.stages.some(s => s.signals.includes('u_fsm.state_reg')));
  assert.ok(through.length);
  for (const p of through) assert.deepEqual(drawingPath('fsm', fsm, pathNames(p, 'src/traffic.vhd')).filter(x => x.type === 'state').map(x => x.id), fsm.states.map(s => s.id));
});
