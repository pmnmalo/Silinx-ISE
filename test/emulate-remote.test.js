// The Board Emulator's compiled engine at the other end of a message port (core/emulate-remote.js, #427: in
// the page, a Web Worker): hostBoard and RemoteBoard on the two ports of a MessageChannel (the messages
// structured-cloned, asynchronous, as a worker's) against a CompiledBoard driven directly, as the emulator
// drove it before (core/emulate-compiled.js), window by window on the same inputs: what the board shows,
// the board's time, the Watch box's values, the LCD, the rotary knob's scheduled inputs (as data, from the
// board's time: the page's may be a run behind), Power
// cycle (the runs in flight forgotten), the VGA monitor's picture (a copy, transferred); the time budget
// of a run; an engine that fails; the host ended with the board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EXAMPLES, example, exampleUcf, ROOT } from './examples-lib.mjs';
import { designOf, rng } from './compiled-diff.js';
import * as V from '../core/values.js';
import { parseUcf } from '../packages/silinx-fpga/src/ucf.js';
import { resolveBoard } from '../server/devices.js';
import { boardWiring, emulatorClocks, lcdState, lcdText, timingGenerics, autoTimeScale, scaledGenerics } from '../core/emulate.js';
import { netlistOf } from '../core/compiled-sim.js';
import { CompiledBoard } from '../core/emulate-compiled.js';
import { hostBoard, RemoteBoard, boardInit } from '../core/emulate-remote.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const boardOf = (id) => { const r = resolveBoard(id); return { id, name: r.board.name, device: r.device, resources: r.resources }; };
const ucfPort = (p) => { const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar); return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null }; };
const lcdLines = (st) => (lcdText(st) || []).map((row) => String.fromCharCode(...row).trimEnd());

// a CompiledBoard driven directly (ref) and one behind a MessageChannel (remote), on the same netlist
async function pair(t, { sources, top, generics, ucf, board }) {
  const design = designOf(sources, top, { generics });
  const { json, top: ntop } = await netlistOf(design, { run: yosysNode });
  const wiring = boardWiring({ ports: design.top.ports, assignments: parseUcf(ucf, { ports: design.top.ports.map(ucfPort) }).assignments, board });
  wiring.clocks = emulatorClocks(wiring, design.top.ports);
  const period = wiring.clocks[0]?.period || 20000;
  const hasLcd = wiring.bits.some((b) => b.res.name === 'lcd_e');
  const ref = new CompiledBoard({ json, top: ntop, design, wiring, clock: wiring.clocks[0]?.port || null, period, board });
  const { port1, port2 } = new MessageChannel();
  hostBoard(port2);
  const closed = { n: 0 };
  const remote = new RemoteBoard(port1, ref, { design, wiring, board, hasLcd, close: () => { closed.n++; port1.close(); port2.close(); } });
  t.after(() => remote.destroy());
  const state = { prev: null, lcd: lcdState() };
  const sig = (name) => design.top.ports.find((p) => p.name === name).sig;
  return {
    design, wiring, period, ref, remote, state, closed, sig,
    force(name, value, mask = -1n) {
      const s = sig(name);
      const cur = state.inputs?.get(name) ?? 0n, m = BigInt.asUintN(s.t.w, mask);
      (state.inputs ??= new Map()).set(name, (cur & ~m) | (value & m));
      ref.force(s, V.fromInt(state.inputs.get(name), s.t.w, false));
      remote.force(s, V.fromInt(value, s.t.w, false), mask);
    },
    // n cycles on both; the remote's state
    async window(n) {
      const t0 = ref.now;
      ref.run(ref.now + n * period);
      state.prev = ref.outputs(t0, Math.max(ref.now, t0 + 1), state.prev);
      if (hasLcd) ref.lcd(state.lcd);
      return remote.advance(n, { budget: Infinity });
    },
  };
}
const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v)));

for (const name of EXAMPLES) {
  test(`example ${name} on the Basys2: behind the port, what the board shows, its time and the watched values are the CompiledBoard's`, async (t) => {
    const ex = example(name);
    const gens = timingGenerics(designOf(ex.design, ex.project.top).top.params);
    const generics = gens.length ? scaledGenerics(gens, autoTimeScale(gens) * 50) : undefined;
    const { text } = exampleUcf(name, { board: 'basys2', variant: '250' });
    const b = await pair(t, { sources: ex.design, top: ex.project.top, generics, ucf: text, board: boardOf('basys2') });
    const ins = b.design.top.ports.filter((p) => p.dir === 'in' && p.name !== 'clk');
    const watched = b.design.signals.filter((s) => !Array.isArray(s.init) && s.t?.kind !== 'str' && s.t?.w > 0).slice(0, 12);
    b.remote.watch(watched);
    const r = rng(7);
    let lit = 0, changes = 0, last = null;
    for (let k = 0; k < 80; k++) {
      // (the whole port, or one bit of it: the switches)
      if (k % 7 === 0) for (const p of ins) b.force(p.name, BigInt(Math.floor(r() * 2 ** p.sig.t.w)), k % 14 ? 1n << BigInt(Math.floor(r() * p.sig.t.w)) : -1n);
      const n = 1 + Math.floor(r() * 400);
      const st = await b.window(n);
      assert.equal(st.cycles, n, `window ${k}: every cycle run`);
      assert.deepEqual(round(b.remote.outputs), round(b.state.prev), `window ${k}`);
      assert.equal(b.remote.now, b.ref.now);
      for (const s of watched) assert.deepEqual(b.remote.value(s), b.ref.value(s), `window ${k}: ${s.path}`);
      lit += b.state.prev.leds.filter((x) => x > 0).length + b.state.prev.digits.filter(Boolean).length;
      const now = JSON.stringify(watched.map((s) => b.remote.value(s)), (k, v) => (typeof v === 'bigint' ? String(v) : v));
      if (last !== null && now !== last) changes++;
      last = now;
    }
    // (vga lights no LED: its watched values, its VGA pins among them, change; its picture: the test below and test/vga-example.test.js)
    if (name === 'vga') assert.ok(changes > 30, `the watched values changed after ${changes} windows`);
    else assert.ok(lit > 30, `${lit} LEDs / digits lit`);
    assert.deepEqual([b.remote.log, b.remote.finished, b.remote.warnings], [[], false, b.ref.warnings]);
    assert.equal(b.remote.busy, false);
  });
}

// (as test/compiled-emulate.test.js's: the knob counts on the LEDs, the LCD shows HI once SW0 is on)
const S3E = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity s3e is
  port (clk : in std_logic;
        sw : in std_logic_vector(3 downto 0);
        rot_a, rot_b, rot_center, btn_north : in std_logic;
        led : out std_logic_vector(7 downto 0);
        lcd_e, lcd_rs, lcd_rw : out std_logic;
        lcd_d : out std_logic_vector(3 downto 0));
end s3e;
architecture rtl of s3e is
  signal cnt : unsigned(5 downto 0) := (others => '0');
  signal a_prev : std_logic := '1';
  type rom_t is array (0 to 6) of std_logic_vector(4 downto 0);
  constant ROM : rom_t := ("00010", "00000", "01100", "10100", "11000", "10100", "11001");
  signal step : integer range 0 to 7 := 0;
  signal ph : integer range 0 to 2 := 0;
begin
  process (clk) begin
    if rising_edge(clk) then
      a_prev <= rot_a;
      if rot_a = '1' and a_prev = '0' then
        if rot_b = '0' then cnt <= cnt + 1; else cnt <= cnt - 1; end if;
      end if;
      if sw(0) = '1' and step < 7 then
        if ph = 2 then ph <= 0; step <= step + 1; else ph <= ph + 1; end if;
      end if;
    end if;
  end process;
  led <= rot_center & btn_north & std_logic_vector(cnt);
  lcd_rw <= '0';
  lcd_e  <= '1' when ph = 1 and step < 7 else '0';
  lcd_rs <= ROM(step)(4) when step < 7 else '0';
  lcd_d  <= ROM(step)(3 downto 0) when step < 7 else "0000";
end rtl;
`;
const S3E_UCF = `NET "clk" LOC = "C9"; NET "sw<0>" LOC = "L13"; NET "sw<1>" LOC = "L14"; NET "sw<2>" LOC = "H18"; NET "sw<3>" LOC = "N17";
NET "rot_a" LOC = "K18"; NET "rot_b" LOC = "G18"; NET "rot_center" LOC = "V16"; NET "btn_north" LOC = "V4";
NET "led<0>" LOC = "F12"; NET "led<1>" LOC = "E12"; NET "led<2>" LOC = "E11"; NET "led<3>" LOC = "F11";
NET "led<4>" LOC = "C11"; NET "led<5>" LOC = "D11"; NET "led<6>" LOC = "E9"; NET "led<7>" LOC = "F9";
NET "lcd_e" LOC = "M18"; NET "lcd_rs" LOC = "L18"; NET "lcd_rw" LOC = "L17";
NET "lcd_d<0>" LOC = "R15"; NET "lcd_d<1>" LOC = "R16"; NET "lcd_d<2>" LOC = "P17"; NET "lcd_d<3>" LOC = "M15";`;

test('the Starter Kit: the LCD, the rotary knob\'s steps scheduled as data, Step, Power cycle forgetting the run in flight', async (t) => {
  const b = await pair(t, { sources: [{ path: 's3e.vhd', lang: 'vhdl', role: 'design', text: S3E }], top: 's3e', ucf: S3E_UCF, board: boardOf('s3e-starter') });
  b.force('rot_a', 1n);
  b.force('rot_b', 1n);
  let st = await b.window(50);
  assert.equal(st.lcd, null, 'no transfer yet: no LCD state sent');
  b.force('sw', 1n, 1n);
  st = await b.window(100);
  assert.deepEqual([lcdLines(b.remote.lcdState), lcdLines(b.state.lcd)], [['HI', ''], ['HI', '']]);
  // a knob step: the emulator's data (the bit, its value) on the remote, functions on the CompiledBoard
  const t0 = b.ref.now;
  [[0, 1], [0, 0], [1, 0], [1, 1]].forEach(([va, vb], k) => {
    const at = t0 + (k + 1) * 2 * b.period;
    b.ref.at(at, () => { b.ref.force(b.sig('rot_a'), V.fromInt(va, 1)); b.ref.force(b.sig('rot_b'), V.fromInt(vb, 1)); });
    b.remote.at(at, [{ sig: b.sig('rot_a'), value: BigInt(va), mask: 1n }, { sig: b.sig('rot_b'), value: BigInt(vb), mask: 1n }]);
  });
  st = await b.window(20);
  assert.deepEqual(round(b.remote.outputs), round(b.state.prev));
  assert.ok(b.remote.outputs.leds[0] > 0.5 && b.remote.outputs.leds.slice(1, 6).every((x) => x === 0), 'one step clockwise: the count is 1');
  // a detent sent while a run is in flight (the page's time a run behind): from the board's time, two detents
  // one after the other, each counted (at the page's times, every step would be in the past, all at once)
  const steps = (va, vb) => [{ sig: b.sig('rot_a'), value: BigInt(va), mask: 1n }, { sig: b.sig('rot_b'), value: BigInt(vb), mask: 1n }];
  const detent = [[0, 1], [0, 0], [1, 0], [1, 1]].map(([va, vb], k) => ({ dt: (k + 1) * 2 * b.period, sets: steps(va, vb) }));
  const flight = b.remote.advance(5000, { budget: Infinity });
  b.remote.sequence(detent);
  b.remote.sequence(detent);
  await flight;
  await b.remote.advance(20);
  await b.remote.advance(10);
  assert.deepEqual(b.remote.outputs.leds.slice(0, 6), [1, 1, 0, 0, 0, 0], 'two steps clockwise: the count is 3');
  // Step: one cycle
  const now = b.remote.now;
  await b.remote.advance(1);
  assert.equal(b.remote.now - now, b.period);
  // Power cycle while a run is in flight: its state is forgotten, the time back to 0, the inputs kept
  const inFlight = b.remote.advance(1000, { budget: Infinity });
  b.remote.reset();
  assert.deepEqual([b.remote.now, b.remote.outputs, b.remote.lcdState, b.remote.busy], [0, null, null, true]);
  assert.equal(await inFlight, null);
  assert.equal(b.remote.now, 0);
  st = await b.remote.advance(100);
  assert.deepEqual([st.cycles, b.remote.now], [100, 100 * b.period]);
  assert.deepEqual(lcdLines(b.remote.lcdState), ['HI', ''], 'SW0 still on after the power cycle: HI again');
  // the board switched off: the run in flight is not shown
  const off = b.remote.advance(10);
  b.remote.invalidate();
  assert.equal(await off, null);
  assert.equal(b.remote.now, 100 * b.period);
});

test('the VGA monitor: the picture copied to the page (transferred) with its status, when asked for', async (t) => {
  const BARS = fs.readFileSync(path.join(ROOT, 'test/fixtures/compiled-sim/vga_bars.vhd'), 'utf8');
  const ucf = `NET "clk" LOC = "B8"; NET "hsync" LOC = "J14"; NET "vsync" LOC = "K13";
NET "red<0>" LOC = "C14"; NET "red<1>" LOC = "D13"; NET "red<2>" LOC = "F13";
NET "green<0>" LOC = "F14"; NET "green<1>" LOC = "G13"; NET "green<2>" LOC = "G14";
NET "blue<0>" LOC = "H13"; NET "blue<1>" LOC = "J13";
NET "sw<0>" LOC = "P11"; NET "sw<1>" LOC = "L3"; NET "sw<2>" LOC = "K3"; NET "sw<3>" LOC = "B4";
NET "sw<4>" LOC = "G3"; NET "sw<5>" LOC = "F3"; NET "sw<6>" LOC = "E2"; NET "sw<7>" LOC = "N3";`;
  const b = await pair(t, { sources: [{ path: 'vga_bars.vhd', lang: 'vhdl', role: 'design', text: BARS }], top: 'vga_bars', ucf, board: boardOf('basys2') });
  const FRAME = 525 * 800 * 2;
  assert.equal(b.remote.vga(), null, 'no run yet');
  let st = await b.window(3 * FRAME);
  assert.equal(st.vga.fb, null, 'not asked for: the status only');
  assert.deepEqual(b.remote.vga().status, b.ref.vga().status);
  b.force('sw', 10n);
  b.ref.run(b.ref.now + 2 * FRAME * b.period);
  st = await b.remote.advance(2 * FRAME, { budget: Infinity, vga: true });
  const v = b.remote.vga(), r = b.ref.vga();
  assert.ok(v.fb instanceof Uint16Array && v.fb.length === 640 * 480 && v.fb !== r.fb);
  assert.deepEqual([v.fb, v.status, v.palette], [r.fb, r.status, r.palette]);
  assert.equal(v.status.frames, 4);
  // the next state without the picture: the last one kept
  await b.remote.advance(1);
  assert.equal(b.remote.vga().fb, v.fb);
});

test('a run\'s time budget: Max speed (Infinity cycles) stops at the budget, the cycles it ran counted', async (t) => {
  const ex = example('blinky');
  const { text } = exampleUcf('blinky', { board: 'basys2', variant: '250' });
  const b = await pair(t, { sources: ex.design, top: ex.project.top, ucf: text, board: boardOf('basys2') });
  const st = await b.remote.advance(Infinity, { budget: 30 });
  assert.ok(st.cycles > 1000 && Number.isFinite(st.cycles), `${st.cycles} cycles`);
  assert.equal(b.remote.now, st.cycles * b.period);
  assert.equal(b.remote.busy, false);
  // (no cycle: the values only, what the board shows kept)
  const shown = b.remote.outputs;
  assert.equal((await b.remote.advance(0)).cycles, 0);
  assert.deepEqual(b.remote.outputs, shown);
});

test('an engine that fails: the error in the log, the board stopped; destroy() ends the host once, the runs in flight null', async (t) => {
  const ex = example('gates');
  const { text } = exampleUcf('gates', { board: 'basys2', variant: '250' });
  const b = await pair(t, { sources: ex.design, top: ex.project.top, ucf: text, board: boardOf('basys2') });
  await b.remote.advance(10);
  // a second RemoteBoard whose model's code throws when it starts
  const { port1, port2 } = new MessageChannel();
  hostBoard(port2);
  let closed = 0;
  const broken = { ...b.ref, model: { ...b.ref.model, code: 'throw new Error("the compiled code failed")' } };
  assert.equal(boardInit(broken, { design: b.design, wiring: b.wiring, board: null }).model.code, 'throw new Error("the compiled code failed")');
  const rb = new RemoteBoard(port1, broken, { design: b.design, wiring: b.wiring, board: null, close: () => { closed++; port1.close(); port2.close(); } });
  assert.equal(await rb.advance(10), null);
  assert.deepEqual([rb.finished, rb.log], ['error', [{ kind: 'error', time: 0, text: 'the compiled code failed' }]]);
  rb.destroy();
  assert.equal(closed, 1);
  // destroy() with a run in flight
  const p = b.remote.advance(1e6, { budget: Infinity });
  b.remote.destroy();
  assert.equal(await p, null);
  assert.equal(b.closed.n, 1);
});
