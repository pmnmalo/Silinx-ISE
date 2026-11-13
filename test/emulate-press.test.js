// A push button of the Board Emulator held down as long as a real press (#3109, core/emulate-press.js): pressEnd's
// board time at every speed, pressHolds' releases held back, let go and flushed; and the clock example on the
// compiled engine, run as the emulator runs it slower than real time: a short click is taken by its 20 ms debouncer
// once held, missed when let go at once (the old emulator).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PRESS_MS, pressEnd, pressHolds } from '../core/emulate-press.js';
import { example, exampleUcf } from './examples-lib.mjs';
import { designOf } from './compiled-diff.js';
import { parseUcf } from '../packages/silinx-fpga/src/ucf.js';
import { resolveBoard } from '../server/devices.js';
import { boardWiring, emulatorClocks } from '../core/emulate.js';
import { netlistOf } from '../core/compiled-sim.js';
import { CompiledBoard } from '../core/emulate-compiled.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const P = 20000;   // 50 MHz (ps)

test('pressEnd: 100 ms of the board\'s time at real speed and Max speed, of the user\'s at a set speed, at least one cycle', () => {
  assert.equal(PRESS_MS, 100);
  assert.equal(pressEnd({ from: 0, speed: 'real', period: P }), 100e9);          // 5,000,000 cycles at 50 MHz
  assert.equal(pressEnd({ from: 7e9, speed: 'max', period: P }), 107e9);
  assert.equal(pressEnd({ from: 0, speed: 1000, period: P }), 100 * P);          // 1 kHz: 100 cycles
  assert.equal(pressEnd({ from: 0, speed: 1e5, period: P }), 10000 * P);
  assert.equal(pressEnd({ from: 3 * P, speed: 10, period: P }), 4 * P);          // 10 Hz: one cycle
  assert.equal(pressEnd({ from: 0, speed: 1, period: P }), P);                   // 1 Hz: one cycle, not a tenth
  assert.equal(pressEnd({ from: 0, speed: 'real', period: 83333 }), 1200005 * 83333);   // 12 MHz (iCEBreaker): 1,200,005 cycles
});

test('pressHolds: a release held back until the board\'s time is at it, at once when it is, or goes back (a power cycle); a new press drops it; flush lets all go', () => {
  const holds = pressHolds(), gone = [];
  const go = (k) => () => gone.push(k);
  // already long enough: at once
  holds.release('a', { until: 100, now: 100, go: go('a') });
  assert.deepEqual([gone, holds.size], [['a'], 0]);
  // held back, then let go by the tick that reaches it (not before)
  holds.release('b', { until: 500, now: 120, go: go('b') });
  holds.release('c', { until: 300, now: 120, go: go('c') });
  holds.tick(299);
  assert.deepEqual([gone, holds.size], [['a'], 2]);
  holds.tick(300);
  assert.deepEqual([gone, holds.size], [['a', 'c'], 1]);
  // pressed again before: the release held back dropped (the button stays pressed)
  holds.press('b');
  holds.tick(1000);
  assert.deepEqual([gone, holds.size], [['a', 'c'], 0]);
  // a second release of the same button replaces the first
  holds.release('d', { until: 400, now: 0, go: go('d1') });
  holds.release('d', { until: 900, now: 0, go: go('d2') });
  holds.tick(500);
  assert.deepEqual(gone, ['a', 'c']);
  // paused, reset, powered off: every one let go, once
  holds.release('e', { until: 1e9, now: 0, go: go('e') });
  holds.flush();
  holds.flush();
  holds.tick(2e9);
  assert.deepEqual([gone, holds.size], [['a', 'c', 'd2', 'e'], 0]);
  // a power cycle: the board's time from 0 again, the release let go
  holds.release('h', { until: 5000, now: 3000, go: go('h') });
  holds.tick(3000);
  assert.equal(holds.size, 1);
  holds.tick(0);
  assert.deepEqual([gone.at(-1), holds.size], ['h', 0]);
  // a release that presses again (a go that calls back in) does not upset the tick
  holds.release('f', { until: 10, now: 0, go: () => { gone.push('f'); holds.release('g', { until: 20, now: 10, go: go('g') }); } });
  holds.tick(10);
  holds.tick(20);
  assert.deepEqual(gone.slice(-2), ['f', 'g']);
});

test('#3727 pressHolds: a press made while the worker\'s run is in flight counted from that run\'s end, not from the page\'s older time', () => {
  const holds = pressHolds(), gone = [];
  const end = (from) => from + 100 * P;   // 1 kHz: 100 cycles
  // the page at 1000 cycles, a run of 250 in flight (a slow page): the click reaches the design at 1250 cycles; the
  // old count (from 1000) let it go as the run came back, at 1250: a press of no cycle for the design
  holds.press('btn', { now: 1000 * P, busy: true });
  holds.release('btn', { until: end, now: 1000 * P, go: () => gone.push('btn') });
  holds.tick(1000 * P, { settled: false });   // (a refresh while the run is in flight: nothing known yet)
  assert.deepEqual([gone, holds.size], [[], 1]);
  holds.tick(1250 * P);                       // the run is over: the press starts here
  assert.deepEqual([gone, holds.size], [[], 1]);
  holds.tick(1349 * P);
  assert.deepEqual(gone, []);
  holds.tick(1350 * P);                       // 100 cycles of the design's time
  assert.deepEqual([gone, holds.size], [['btn'], 0]);
  // let go after the run came back: counted from its end all the same
  holds.press('b2', { now: 2000 * P, busy: true });
  holds.tick(2250 * P);
  holds.release('b2', { until: end, now: 2300 * P, go: () => gone.push('b2') });
  holds.tick(2349 * P);
  assert.equal(holds.size, 1);
  holds.tick(2350 * P);
  assert.deepEqual(gone, ['btn', 'b2']);
  // no run in flight: from the page's time, as before; long enough already: at once
  holds.press('b3', { now: 3000 * P });
  holds.release('b3', { until: end, now: 3100 * P, go: () => gone.push('b3') });
  assert.deepEqual([gone.at(-1), holds.size], ['b3', 0]);
  // paused while one waits for its run: flush lets it go
  holds.press('b4', { now: 4000 * P, busy: true });
  holds.release('b4', { until: end, now: 4000 * P, go: () => gone.push('b4') });
  holds.flush();
  assert.deepEqual([gone.at(-1), holds.size], ['b4', 0]);
});

const ucfPort = (p) => { const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar); return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null }; };

test('the clock example on the compiled engine at half of real time: a 32 ms click of BTN2 / BTN3 sets the minutes / hours once held, missed when let go at once', { timeout: 300000 }, async () => {
  const ex = example('clock');
  const r = resolveBoard('basys2', { variant: '250' }), board = { id: 'basys2', name: r.board.name, device: r.device, resources: r.resources };
  const design = designOf(ex.design, ex.project.top);   // its own generics: a 20 ms debouncer (STABLE = 1,000,000)
  const { json, top } = await netlistOf(design, { run: yosysNode });
  const ucf = exampleUcf('clock', { board: 'basys2', variant: '250' }).text;
  const wiring = boardWiring({ ports: design.top.ports, assignments: parseUcf(ucf, { ports: design.top.ports.map(ucfPort) }).assignments, board });
  wiring.clocks = emulatorClocks(wiring, design.top.ports);
  const period = wiring.clocks[0].period;
  assert.equal(period, P);
  const cb = new CompiledBoard({ json, top, design, wiring, clock: 'clk', period, board });
  const btn = design.top.ports.find((p) => p.name === 'btn').sig;
  // the emulator's frames: 16 ms of the user's time, 8 ms of the board's (400,000 cycles: the engine at 25 MHz)
  const FRAME = 400000, holds = pressHolds();
  const frame = () => { cb.run(cb.now + FRAME * period); holds.tick(cb.now); };
  let pressed = 0n;
  const set = (bit, on) => { pressed = on ? pressed | (1n << BigInt(bit)) : pressed & ~(1n << BigInt(bit)); cb.force(btn, { v: pressed, x: 0n }); };
  // a click of 2 frames (32 ms of the user's time, 800,000 cycles: less than the debouncer's million)
  const click = (bit, { held }) => {
    const from = cb.now;
    set(bit, true);
    frame(); frame();
    if (held) holds.release(bit, { until: pressEnd({ from, speed: 'real', period }), now: cb.now, go: () => set(bit, false) });
    else set(bit, false);
    for (let k = 0; k < 20; k++) frame();   // 160 ms of the board's time on
  };
  const time = () => [cb.cs.get('hour'), cb.cs.get('min')];
  assert.deepEqual(time(), [0n, 0n]);
  // the old emulator: let go at once, the press not taken
  click(2, { held: false });
  click(3, { held: false });
  assert.deepEqual(time(), [0n, 0n]);
  // held as a real press: taken once each
  click(2, { held: true });
  assert.deepEqual([time(), pressed, holds.size], [[0n, 1n], 0n, 0]);
  click(3, { held: true });
  click(2, { held: true });
  assert.deepEqual([time(), pressed, holds.size], [[1n, 2n], 0n, 0]);
});
