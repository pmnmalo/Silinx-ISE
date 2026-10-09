// Simulator API used by the simulation UI (force / release, stimulus and clocks, run limits,
// waveforms and VCD export), exercised on small Verilog and VHDL designs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { Simulator, toVCD } from '../core/simulator.js';
import * as V from '../core/values.js';

function build(text, top = 'tb', path = 't.v') {
  const lib = compile([{ path, text }]);
  const d = elaborate(lib, top);
  assert.deepEqual([...lib.errors, ...d.diags].filter(x => x.severity === 'error').map(x => x.message), []);
  return d;
}
const sigOf = (d, name) => d.signals.find(s => s.name === name);

test('addClock and addStimulus drive top-level inputs; valueAt reads the recorded waveform', () => {
  const d = build('module cnt(input clk, input rst, output reg [3:0] q); always @(posedge clk) if (rst) q <= 0; else q <= q + 1; endmodule', 'cnt');
  const sim = new Simulator(d);
  const clk = sigOf(d, 'clk'), rst = sigOf(d, 'rst'), q = sigOf(d, 'q');
  sim.addClock(clk, { period: 10_000 });                       // rising edges at 5, 15, 25 ... ns
  sim.addStimulus(rst, [{ t: 0, val: V.ONE }, { t: 12_000, val: V.ZERO }]);
  const st = sim.run(100_000);
  assert.equal(st.finished, null);
  assert.equal(st.now, 100_000);
  // reset at 5 ns; counts at 15 .. 95 ns: 9 edges
  assert.equal(V.toNum(q.val), 9);
  assert.equal(V.toNum(sim.valueAt(q, 20_000)), 1);
  assert.equal(V.toNum(sim.valueAt(q, 5_000)), 0);
  assert.equal(V.toBin(sim.valueAt(q, 0)), 'xxxx');
  assert.equal(sim.nextEventTime(), 105_000);
});

test('addClock with a duty cycle, an offset, starting high, and a stop time', () => {
  const d = build('module m(input c); endmodule', 'm');
  const sim = new Simulator(d);
  const c = sigOf(d, 'c');
  sim.addClock(c, { period: 10, duty: 0.3, offset: 2, startHigh: true, until: 30 });
  sim.run(100);
  assert.deepEqual(c.wave.t, [0, 2, 5, 12, 15, 22, 25]);
  // (the unconnected top-level input starts unknown)
  assert.deepEqual(c.wave.v.map(v => V.toBin(v)), ['x', '1', '0', '1', '0', '1', '0']);
});

test('force overrides the drivers until release; release lets them drive again', () => {
  const d = build(`module tb; reg a = 0; wire y; assign y = ~a;
  initial begin #10 a = 1; #10 a = 0; end endmodule`);
  const sim = new Simulator(d);
  const y = sigOf(d, 'y');
  sim.run(5000);
  assert.equal(V.toBin(y.val), '1');
  sim.force(y, V.ONE);
  sim.run(15000);
  assert.equal(V.toBin(y.val), '1', 'forced: a = 1 does not change it');
  sim.release(y);
  sim.run(16000);
  assert.equal(V.toBin(y.val), '0', 'driven again after release');
  sim.run(25000);
  assert.equal(V.toBin(y.val), '1');
});

test('at(t, fn) runs code inside a time step; run stops at $finish; maxSteps limits the number of time steps', () => {
  const d = build(`module tb; reg [7:0] n = 0; always #1 n = n + 1; initial #50 $finish; endmodule`);
  const sim = new Simulator(d, { timeUnit: 1 });
  const seen = [];
  sim.at(10_000, s => seen.push(s.now));
  const st1 = sim.run(Infinity, { maxSteps: 5 });
  assert.ok(st1.now < 10_000 && !st1.finished);
  const st2 = sim.run(Infinity);
  assert.deepEqual(seen, [10_000]);
  assert.equal(st2.finished, 'finish');
  assert.equal(st2.now, 50_000);
  assert.ok(sim.log.some(l => /simulation finished \(\$finish\) at 50 ns/.test(l.text)));
});

test('onLog receives each log entry; long logs keep the newest entries', () => {
  const d = build(`module tb; integer i; initial begin for (i = 0; i < 25000; i = i + 1) $display("%0d", i); end endmodule`);
  const got = [];
  const sim = new Simulator(d, { onLog: e => { if (got.length < 3) got.push(e.text); } });
  sim.run(1);
  assert.deepEqual(got, ['0', '1', '2']);
  assert.ok(sim.log.length <= 20000);
  assert.equal(sim.log[sim.log.length - 1].text, '24999');
});

test('waveform recording limit: further changes are not recorded and a warning is logged', () => {
  const d = build(`module tb; reg c = 0; always #1 c = ~c; endmodule`);
  const sim = new Simulator(d, { maxWaveEvents: 10 });
  sim.run(100_000);
  const c = sigOf(d, 'c');
  assert.ok(c.wave.t.length <= 12);
  assert.ok(sim.log.some(l => /waveform recording limit reached/.test(l.text)));
});

test('a VHDL $stop-like std.env.stop and a Verilog $stop end the run with their reason', () => {
  const d = build('module tb; initial #3 $stop; endmodule');
  const sim = new Simulator(d);
  assert.equal(sim.run(1e9).finished, 'stop');
  assert.ok(sim.log.some(l => /simulation stopped \(\$stop\)/.test(l.text)));
});

test('toVCD writes the hierarchy, the variables and the value changes', () => {
  const d = build(`module sub(input a, output y); assign y = ~a; endmodule
module tb; reg a = 0; reg [3:0] v = 4'h3; integer n = 5; wire y; sub u(.a(a), .y(y));
  initial begin #2 a = 1; v = 4'hA; #2 v = 4'bx01z; end endmodule`);
  const sim = new Simulator(d);
  sim.run(10_000);
  const vcd = toVCD(d, sim, { timescale: '1ps' });
  const lines = vcd.split('\n');
  assert.match(lines[0], /^\$date /);
  assert.ok(lines.includes('$timescale 1ps $end'));
  assert.ok(lines.includes('$scope module tb $end'));
  assert.ok(lines.includes('$scope module u $end'));
  assert.ok(lines.some(l => /^\$var reg 4 \S+ v \$end$/.test(l)));
  assert.ok(lines.some(l => /^\$var integer 32 \S+ n \$end$/.test(l)));
  assert.ok(lines.some(l => /^\$var wire 1 \S+ y \$end$/.test(l)));
  assert.ok(lines.includes('$enddefinitions $end'));
  const id = lines.find(l => / v \$end$/.test(l)).split(' ')[3];
  assert.ok(lines.includes('#2000'));
  assert.ok(lines.includes(`b1010 ${id}`));
  assert.ok(lines.includes(`bx01z ${id}`));
  assert.equal(lines.filter(l => l === '$upscope $end').length, 2);
});

test('VHDL: force / release of a signal driven by a process, and stimulus on an input port', () => {
  const d = build(`library ieee; use ieee.std_logic_1164.all;
entity e is port (a : in std_logic; y : out std_logic); end;
architecture r of e is begin process (a) begin y <= not a; end process; end;`, 'e', 'e.vhd');
  const sim = new Simulator(d);
  const a = sigOf(d, 'a'), y = sigOf(d, 'y');
  sim.addStimulus(a, [{ t: 0, val: V.ZERO }, { t: 10, val: V.ONE }]);
  sim.run(5);
  assert.equal(V.toBin(y.val), '1');
  sim.force(y, V.ZERO);
  sim.run(20);
  assert.equal(V.toBin(y.val), '0');
  sim.release(y);
  sim.run(21);
  assert.equal(V.toBin(y.val), '0');
  sim.reset();
  assert.equal(sim.now, 0);
  assert.equal(sim.log.length, 0);
});
