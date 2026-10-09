// Board emulator core: wiring from the UCF and output activity (LEDs, 7-segment persistence).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { parseUcf } from '../core/ucf.js';
import { boardWiring, boardOutputs, portBits } from '../core/emulate.js';

const BOARD = { resources: [
  { name: 'mclk', group: 'Clock', pins: ['B8'], dir: 'in', extra: { period: '20 ns' } },
  { name: 'led', group: 'LEDs', pins: ['M5', 'M11'], dir: 'out', extra: { activeHigh: true } },
  { name: 'sw', group: 'Switches', pins: ['P11', 'L3'], dir: 'in' },
  { name: 'seg', group: '7-segment', pins: ['L14', 'H12', 'N14', 'N11', 'P12', 'L13', 'M12'], dir: 'out', extra: { activeLow: true } },
  { name: 'an', group: '7-segment', pins: ['F12', 'J12'], dir: 'out', extra: { activeLow: true } },
] };

// LED0 = sw0, LED1 = clk/2 (50 % duty); two digits multiplexed every clock: digit 0 shows "1" (b,c), digit 1 shows "-" (g)
const SRC = `library ieee; use ieee.std_logic_1164.all;
entity top is port(clk : in std_logic; sw : in std_logic_vector(1 downto 0); led : out std_logic_vector(1 downto 0);
  seg : out std_logic_vector(6 downto 0); an : out std_logic_vector(1 downto 0)); end top;
architecture rtl of top is
  signal t : std_logic := '0';
begin
  process(clk) begin if rising_edge(clk) then t <= not t; end if; end process;
  led(0) <= sw(0);
  led(1) <= t;
  an  <= "10" when t = '0' else "01";                 -- active low: AN0 when t=0, AN1 when t=1
  seg <= "1111001" when t = '0' else "0111111";      -- seg(6..0) = g f e d c b a, active low
end rtl;`;
const UCF = `NET "clk" LOC = "B8"; NET "sw<0>" LOC = "P11"; NET "sw<1>" LOC = "XX9";
NET "led<0>" LOC = "M5"; NET "led<1>" LOC = "M11";
NET "seg<0>" LOC = "L14"; NET "seg<1>" LOC = "H12"; NET "seg<2>" LOC = "N14"; NET "seg<3>" LOC = "N11";
NET "seg<4>" LOC = "P12"; NET "seg<5>" LOC = "L13"; NET "seg<6>" LOC = "M12"; NET "an<0>" LOC = "F12"; NET "an<1>" LOC = "J12";`;

test('portBits names bus bits like the UCF and finds their position', () => {
  const p = { name: 'opcode', sig: { t: { w: 5, left: 4, right: 0, desc: true } } };
  assert.deepEqual(portBits(p).map((b) => [b.name, b.pos]), [['opcode<4>', 4], ['opcode<3>', 3], ['opcode<2>', 2], ['opcode<1>', 1], ['opcode<0>', 0]]);
  const q = { name: 'x', sig: { t: { w: 3, left: 0, right: 2, desc: false } } };
  assert.deepEqual(portBits(q).map((b) => [b.name, b.pos]), [['x<0>', 2], ['x<1>', 1], ['x<2>', 0]]);
});

test('board emulation: wiring, LED brightness and multiplexed digits', () => {
  const d = elaborate(compile([{ path: 'top.vhd', lang: 'vhdl', text: SRC }]), 'top');
  const w = boardWiring({ ports: d.top.ports, assignments: parseUcf(UCF).assignments, board: BOARD });
  assert.equal(w.clocks.length, 1);
  assert.equal(w.clocks[0].period, 20000);
  assert.deepEqual(w.unmapped.map((u) => u.bit), ['sw<1>']);
  const sim = new Simulator(d);
  const sw = d.top.ports.find((p) => p.name === 'sw').sig;
  sim.force(sw, V.fromInt(1, 2));
  sim.addClock(w.clocks[0].sig, { period: 20000 });
  sim.run(1000 * 20000);
  for (const s of d.signals) s.wave = { t: [sim.now], v: [s.val] };
  const t0 = sim.now;
  sim.run(t0 + 1000 * 20000);
  const out = boardOutputs(w, t0, sim.now);
  assert.equal(out.leds[0], 1);
  assert.ok(Math.abs(out.leds[1] - 0.5) < 0.01, `LED1 ${out.leds[1]}`);
  assert.deepEqual(out.digits[0].seg.map(Math.round), [0, 1, 1, 0, 0, 0, 0]);   // "1"
  assert.deepEqual(out.digits[1].seg.map(Math.round), [0, 0, 0, 0, 0, 0, 1]);   // "-"
});

test('timing scale: large integer generics of the top are divided for the emulator', async () => {
  const { timingGenerics, autoTimeScale, scaledGenerics } = await import('../core/emulate.js');
  const gens = timingGenerics([{ name: 'div', value: { v: 625000n } }, { name: 'debounce', value: { v: 1000000n } }, { name: 'width', value: { v: 8n } }]);
  assert.deepEqual(gens.map((g) => g.name), ['div', 'debounce']);
  assert.equal(autoTimeScale(gens), 1000);
  assert.deepEqual(scaledGenerics(gens, 1000), { div: 625, debounce: 1000 });
  assert.equal(autoTimeScale([{ name: 'n', value: 5000 }]), 1);
  const src = `library ieee; use ieee.std_logic_1164.all;
entity t is generic (N : integer := 500000); port (o : out integer); end t;
architecture a of t is begin o <= N; end a;`;
  const d = elaborate(compile([{ path: 't.vhd', lang: 'vhdl', text: src }]), 't', { generics: { N: 500 } });
  assert.equal(Number(d.top.params[0].value.v), 500);
});
