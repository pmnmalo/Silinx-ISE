// ISim's simulation control (web/js/isim-run.js, #405: out of mountISim), on the simulator itself: the queue of
// commands (#215), a run for some time, Run All, Break, Step, a finished simulation, a closed window.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import './ui/core-hooks.js';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';

const { mountRun } = await import('../web/js/isim-run.js');

// tb: a 10 ns clock and a counter, forever; fin: $finish at 50 ns; idle: one event at 7 ns, then nothing
const SRC = `\`timescale 1ns/1ps
module tb; reg clk = 0; reg [7:0] n = 0; always #5 clk = ~clk; always @(posedge clk) n <= n + 1; endmodule
module fin; reg a = 0; initial begin #20 a = 1; #30 $finish; end endmodule
module idle; reg a = 0; initial #7 a = 1; endmodule
`;
const CAP = 1_000_000;   // Run All's limit (ps)
function windowOf(top) {
  const design = elaborate(compile([{ path: 't.v', lang: 'verilog', text: SRC }]), top);
  const sim = new Simulator(design);
  const st = { running: false, breakReq: false, fit: false, t0: 0, scale: 100 };
  const said = [], msgs = [], seen = { invalidate: 0, objects: 0, cursor: null };
  const r = mountRun({ st, sim, runAllCap: CAP, logLine: (t, k) => said.push([t, k ?? '']), setMsg: (m) => msgs.push(m),
    invalidate: () => seen.invalidate++, setCursor: (t) => { seen.cursor = t; }, tOf: (x) => st.t0 + x * st.scale,
    width: () => 800, applyFit: () => {}, objectsChanged: () => seen.objects++ });
  return { design, sim, st, said, msgs, seen, ...r };
}

test('#405 ISim run: a run for a time ends there, says Ready, moves the cursor and marks the objects dirty', async () => {
  const w = windowOf('tb');
  await w.runTo(95_000, 'Run');
  assert.equal(w.sim.now, 95_000);
  assert.equal(w.st.running, false);
  assert.equal(w.msgs[0], 'Run');
  assert.equal(w.msgs.at(-1), 'Ready');
  assert.equal(w.seen.cursor, 95_000);
  assert.equal(w.seen.objects, 1);
  assert.deepEqual(w.said, [], 'no warnings');
  await w.runTo(5_000, 'Run');
  assert.equal(w.sim.now, 100_000, 'the next run starts where the last ended');
});

test('#405 ISim run: the view follows the end of a run beyond the window, not one already scrolled away', async () => {
  const w = windowOf('tb');
  await w.runTo(200_000, 'Run');   // window 800 px x 100 ps = 80 ns: 200 ns is beyond it
  assert.equal(w.st.t0, 200_000 - 80_000 * 0.9);
  const v = windowOf('tb');
  v.st.t0 = 500_000;               // scrolled ahead of the simulation: left where it is
  await v.runTo(200_000, 'Run');
  assert.equal(v.st.t0, 500_000);
});

test('#405 ISim run: commands given during a run wait for it and run in turn (#215)', async () => {
  const w = windowOf('tb');
  const order = [];
  const first = w.enqueue('run 50 ns', async () => { order.push(['a', w.sim.now]); await w.runTo(50_000, 'Run'); });
  const second = w.enqueue('run 20 ns', async () => { order.push(['b', w.sim.now]); await w.runTo(20_000, 'Run'); });
  const third = w.enqueue('step', async () => { order.push(['c', w.sim.now]); });
  await Promise.all([first, second, third]);
  assert.deepEqual(order, [['a', 0], ['b', 50_000], ['c', 70_000]]);
  assert.equal(w.sim.now, 70_000);
  assert.deepEqual(w.said, [], 'no warnings');
});

test('#405 ISim run: Break stops the run going on and cancels the commands waiting, with their warnings', async () => {
  const w = windowOf('tb');
  const long = w.enqueue('run 1 s', () => w.runTo(1e12, 'Run'));
  const waiting = w.enqueue('run 10 ns', () => w.runTo(10_000, 'Run'));
  await new Promise(r => setTimeout(r, 50));
  assert.equal(w.st.running, true);
  w.breakCommands();
  await Promise.all([long, waiting]);
  assert.equal(w.st.running, false);
  assert.ok(w.sim.now > 0 && w.sim.now < 1e12, `stopped part way (${w.sim.now} ps)`);
  assert.equal(w.said.length, 2, JSON.stringify(w.said));
  assert.match(w.said[0][0], /^Simulation interrupted \(Break\) at /);
  assert.equal(w.said[0][1], 'warning');
  assert.deepEqual(w.said[1], ["Command 'run 10 ns' cancelled (Break)", 'warning']);
  // a command given after the Break runs
  await w.enqueue('run 10 ns', () => w.runTo(10_000, 'Run'));
  assert.equal(w.said.length, 2, 'no more warnings');
});

test('#405 ISim run: Run All stops when nothing is scheduled; at its limit on a clock', async () => {
  const w = windowOf('idle');
  await w.runTo(CAP, 'Run All');
  // (at the end of the first chunk of 10 ns, the one where the events ran out)
  assert.deepEqual(w.said, [['Simulation stopped: no more events scheduled (time 10 ns)', 'info']]);
  assert.equal(w.sim.now, 10_000);
  const c = windowOf('tb');
  await c.runTo(CAP, 'Run All');
  assert.equal(c.sim.now, CAP);
  assert.deepEqual(c.said, [['Run All stopped at the 1 us limit (time 1 us)', 'warning']]);
});

test('#405 ISim run: a run that ends at $finish says so; a run after it is refused', async () => {
  const w = windowOf('fin');
  await w.runTo(100_000, 'Run');
  assert.equal(w.sim.finished, 'finish');
  assert.equal(w.sim.now, 50_000);
  assert.equal(w.msgs.at(-1), 'Simulation finished at 50 ns');
  await w.runTo(10_000, 'Run');
  assert.deepEqual(w.said, [['Simulation has already finished (finish); use Restart to run again.', 'warning']]);
  w.step();
  assert.deepEqual(w.said.at(-1), ['Simulation has finished; use Restart.', 'warning']);
});

test('#405 ISim run: Step goes to the next scheduled event, then says when there is none', () => {
  const w = windowOf('idle');
  w.step();
  assert.equal(w.sim.now, 7_000);
  assert.deepEqual(w.said, [['Stepped to 7 ns', 'info']]);
  assert.equal(w.seen.cursor, 7_000);
  w.step();
  assert.deepEqual(w.said.at(-1), ['No more events scheduled', 'info']);
  const t = windowOf('tb');
  t.step(); t.step();
  assert.equal(t.sim.now, 10_000, 'the clock edges at 5 and 10 ns');
});

test('#405 ISim run: a closed window runs nothing more', async () => {
  const w = windowOf('tb');
  assert.equal(w.isDestroyed(), false);
  w.destroy();
  assert.equal(w.isDestroyed(), true);
  let ran = false;
  await w.enqueue('run 10 ns', async () => { ran = true; });
  await w.runTo(10_000, 'Run');
  assert.equal(ran, false);
  assert.equal(w.sim.now, 0);
  assert.deepEqual(w.said, []);
});
