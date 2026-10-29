// The Board Emulator on the compiled cycle simulator (core/emulate-compiled.js, #418): what the board shows
// (LED brightness, 7-segment digits with their persistence, the character LCD) computed from the counts of
// the compiled code against what the emulator computes from the event-driven simulator's waveforms
// (core/emulate.js boardOutputs, lcdFeed), window by window, on the same inputs: the examples on the Basys2
// and an LCD design on the Spartan-3E Starter Kit; the board's time (Step, Power cycle), the rotary knob's
// scheduled inputs, the manual clock (#347), the Watch box's values.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAMPLES, example, exampleUcf } from './examples-lib.mjs';
import { designOf, rng } from './compiled-diff.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { parseUcf } from '../packages/silinx-fpga/src/ucf.js';
import { resolveBoard } from '../server/devices.js';
import { boardWiring, boardOutputs, emulatorClocks, lcdState, lcdFeed, lcdText, timingGenerics, autoTimeScale, scaledGenerics } from '../core/emulate.js';
import { netlistOf } from '../core/compiled-sim.js';
import { CompiledBoard } from '../core/emulate-compiled.js';
import { yosysNode } from '../packages/silinx-fpga/src/synth-open-node.js';

const boardOf = (id) => { const r = resolveBoard(id); return { name: r.board.name, device: r.device, resources: r.resources }; };
const ucfPort = (p) => { const t = p.sig.t, bus = t.w > 1 || (t.kind === 'logic' && !t.scalar); return { name: p.name, dir: p.dir, width: t.w, msb: bus ? t.left : null, lsb: bus ? t.right : null }; };
const allX = (v) => v && !Array.isArray(v) && v.w > 0 && v.x === (1n << BigInt(v.w)) - 1n;
function powerUpZero(design) {
  for (const s of design.signals) {
    if (Array.isArray(s.val)) { if (s.val.some(allX)) s.val = s.val.map((e) => (allX(e) ? V.fromInt(0, e.w, false) : e)); } else if (allX(s.val)) s.val = V.fromInt(0, s.val.w, false);
  }
}

// the two engines side by side, driven as web/js/emulator.js drives its engine
async function boards({ sources, top, generics, ucf, board }) {
  const design = designOf(sources, top, { generics });
  const assignments = parseUcf(ucf, { ports: design.top.ports.map(ucfPort) }).assignments;
  const wiring = boardWiring({ ports: design.top.ports, assignments, board });
  wiring.clocks = emulatorClocks(wiring, design.top.ports);
  const period = wiring.clocks[0]?.period || 20000;
  // the event-driven simulator, as the emulator runs it
  const ev = new Simulator(design, { maxWaveEvents: 1e9 });
  powerUpZero(design);
  for (const s of design.signals) s.wave = null;
  for (const c of wiring.clocks) ev.addClock(c.sig, { period: c.period });
  ev.run(0);
  // the compiled one
  const cdesign = designOf(sources, top, { generics });
  const { json, top: ntop } = await netlistOf(cdesign, { run: yosysNode });
  const cw = boardWiring({ ports: cdesign.top.ports, assignments, board });
  cw.clocks = emulatorClocks(cw, cdesign.top.ports);
  const cb = new CompiledBoard({ json, top: ntop, design: cdesign, wiring: cw, clock: cw.clocks[0]?.port || null, period });
  const outs = new Set(wiring.bits.filter((b) => b.dir !== 'in').map((b) => b.sig));
  const state = { ev: { prev: null, lcd: lcdState() }, cb: { prev: null, lcd: lcdState() } };
  return {
    design, cdesign, wiring, cw, period, ev, cb,
    force(name, value) {
      const p = design.top.ports.find((x) => x.name === name), q = cdesign.top.ports.find((x) => x.name === name);
      ev.force(p.sig, V.fromInt(value, p.sig.t.w, false));
      cb.force(q.sig, V.fromInt(value, q.sig.t.w, false));
    },
    window(n) {
      const t0 = ev.now;
      for (const s of outs) s.wave = { t: [ev.now], v: [s.val] };
      ev.run(ev.now + n * period);
      state.ev.prev = boardOutputs(wiring, t0, Math.max(ev.now, t0 + 1), state.ev.prev);
      lcdFeed(state.ev.lcd, wiring, t0, ev.now);
      const c0 = cb.now;
      cb.run(cb.now + n * period);
      state.cb.prev = cb.outputs(c0, Math.max(cb.now, c0 + 1), state.cb.prev);
      cb.lcd(state.cb.lcd);
      return state;
    },
  };
}
// the LCD's two lines (lcdText gives their character codes)
const lcdLines = (st) => (lcdText(st) || []).map((row) => String.fromCharCode(...row).trimEnd());
const round = (o) => JSON.parse(JSON.stringify(o, (k, v) => (typeof v === 'number' ? Math.round(v * 1e9) / 1e9 : v)));
const shown = (st) => round({ leds: st.prev.leds, digits: st.prev.digits, lcd: lcdLines(st.lcd) });

for (const name of EXAMPLES) {
  test(`example ${name} on the Basys2: the compiled engine shows what the event-driven one shows, window by window`, async () => {
    const ex = example(name);
    const gens = timingGenerics(designOf(ex.design, ex.project.top).top.params);
    const generics = gens.length ? scaledGenerics(gens, autoTimeScale(gens) * 50) : undefined;
    const { text } = exampleUcf(name, { board: 'basys2', variant: '250' });
    const b = await boards({ sources: ex.design, top: ex.project.top, generics, ucf: text, board: boardOf('basys2') });
    assert.equal(b.cb.clock, name === 'gates' ? null : 'clk');
    const ins = b.design.top.ports.filter((p) => p.dir === 'in' && p.name !== 'clk');
    const r = rng(5);
    // (vga lights no LED: its VGA pins' values compared at the end of each window, its picture in test/vga-example.test.js)
    const vgaPorts = name === 'vga' ? b.design.top.ports.filter((p) => p.name.startsWith('vga_')) : [];
    const pins = (get) => vgaPorts.map((p) => { const v = get(p); return `${p.name}=${v.v}/${v.x}`; });
    let lit = 0, changes = 0, last = null;
    for (let k = 0; k < 120; k++) {
      if (k % 7 === 0) for (const p of ins) b.force(p.name, BigInt(Math.floor(r() * 2 ** p.sig.t.w)));
      const st = b.window(1 + Math.floor(r() * 400));
      assert.deepEqual(shown(st.cb), shown(st.ev), `window ${k}`);
      assert.equal(b.cb.now, b.ev.now);
      lit += st.ev.prev.leds.filter((x) => x > 0).length + st.ev.prev.digits.filter(Boolean).length;
      const ev = pins((p) => p.sig.val), cb = pins((p) => b.cb.value(b.cdesign.top.ports.find((q) => q.name === p.name).sig));
      assert.deepEqual(cb, ev, `window ${k}: the VGA pins`);
      if (last && ev.join() !== last) changes++;
      last = ev.join();
    }
    if (name === 'vga') assert.ok(changes > 50, `the VGA pins changed after ${changes} windows`);
    else assert.ok(lit > 50, `${lit} LEDs / digits lit`);
    assert.deepEqual(b.cb.log, []);
  });
}

// (as test/ui/sim-emu.test.js's EMU_S3E: the knob counts on the LEDs, the LCD shows HI once SW0 is on)
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

test('the Starter Kit: the LCD\'s text, the rotary knob\'s scheduled steps, Power cycle', async () => {
  const b = await boards({ sources: [{ path: 's3e.vhd', lang: 'vhdl', role: 'design', text: S3E }], top: 's3e', ucf: S3E_UCF, board: boardOf('s3e-starter') });
  assert.equal(b.wiring.bits.length, 24, 'every port bit on the board');
  b.force('rot_a', 1n);
  b.force('rot_b', 1n);
  let st = b.window(50);
  assert.deepEqual(lcdLines(st.cb.lcd), lcdLines(st.ev.lcd));
  b.force('sw', 1n);
  st = b.window(100);
  assert.deepEqual(lcdLines(st.ev.lcd), ['HI', '']);
  assert.deepEqual(shown(st.cb), shown(st.ev));
  // a knob step: ROT_A then ROT_B low, then both high, two cycles apart (as the emulator schedules them)
  for (const sim of [b.ev, b.cb]) {
    const p = (n) => (sim === b.ev ? b.design : b.cdesign).top.ports.find((x) => x.name === n).sig;
    const t0 = sim.now;
    [[0, 1], [0, 0], [1, 0], [1, 1]].forEach(([va, vb], k) => sim.at(t0 + (k + 1) * 2 * b.period, () => { sim.force(p('rot_a'), V.fromInt(va, 1)); sim.force(p('rot_b'), V.fromInt(vb, 1)); }));
  }
  st = b.window(20);
  assert.deepEqual(shown(st.cb), shown(st.ev));
  // (ROT_A rises while ROT_B is low: one step up, the count 1 from the third step on)
  assert.ok(st.cb.prev.leds[0] > 0.5 && st.cb.prev.leds.slice(1, 6).every((x) => x === 0), 'one step clockwise: the count is 1');
  // the board's time, Power cycle (the inputs kept)
  assert.equal(b.cb.now, b.ev.now);
  b.cb.run(b.cb.now + b.period);
  assert.equal(b.cb.now, b.ev.now + b.period, 'Step: one cycle');
  b.cb.reset();
  assert.equal(b.cb.now, 0);
  b.cb.run(100 * b.period);
  const st2 = { prev: b.cb.outputs(0, b.cb.now, null), lcd: lcdState() };
  b.cb.lcd(st2.lcd);
  assert.deepEqual(lcdLines(st2.lcd), ['HI', ''], 'SW0 still on after the power cycle: HI again');
});

test('a manual clock (a clk port on a button, #347): no main clock, the flip-flop changes at a press', async () => {
  const text = `library ieee; use ieee.std_logic_1164.all;
entity top is port (clk, d : in std_logic; q : out std_logic); end top;
architecture r of top is begin process (clk) begin if rising_edge(clk) then q <= d; end if; end process; end r;`;
  const ucf = 'NET "clk" LOC = "G12"; NET "clk" CLOCK_DEDICATED_ROUTE = FALSE; NET "d" LOC = "P11"; NET "q" LOC = "M5";';
  const b = await boards({ sources: [{ path: 'top.vhd', lang: 'vhdl', role: 'design', text }], top: 'top', ucf, board: boardOf('basys2') });
  assert.deepEqual(b.wiring.clocks, []);
  assert.equal(b.cb.clock, null);
  b.force('d', 1n);
  let st = b.window(100);
  assert.deepEqual([st.ev.prev.leds[0], st.cb.prev.leds[0]], [0, 0], 'no edge: LD0 off');
  b.force('clk', 1n);
  st = b.window(100);
  assert.deepEqual([st.ev.prev.leds[0], st.cb.prev.leds[0]], [1, 1], 'a press: LD0 on');
  b.force('clk', 0n);
  b.force('d', 0n);
  st = b.window(100);
  assert.deepEqual([st.ev.prev.leds[0], st.cb.prev.leds[0]], [1, 1], 'released: LD0 stays on');
});

test('the Watch box: a signal\'s value by its name in the netlist; one the netlist does not have: null', async () => {
  const ex = example('blinky');
  const { text } = exampleUcf('blinky', { board: 'basys2', variant: '250' });
  const b = await boards({ sources: ex.design, top: ex.project.top, generics: { DIV: 4, DEBOUNCE: 4 }, ucf: text, board: boardOf('basys2') });
  b.force('sw', 2n);   // binary counter mode
  b.window(500);
  const sig = (d, path) => d.signals.find((s) => s.path === path);
  for (const path of ['top.led', 'top.u_knight.count', 'top.tick']) {
    const e = sig(b.design, path).val, c = b.cb.value(sig(b.cdesign, path));
    assert.equal(V.toBin(c), V.toBin(e), path);
  }
  assert.equal(b.cb.value({ path: 'top.nope', t: { w: 1 } }), null);
});
