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
  const INT = { kind: 'int' };
  const gens = timingGenerics([{ name: 'div', t: INT, value: { v: 625000n } }, { name: 'debounce', t: INT, value: { v: 1000000n } }, { name: 'width', t: INT, value: { v: 8n } }]);
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

test('HD44780: 4-bit initialisation (UG230 sequence), text on two lines, clear', async () => {
  const { lcdState, lcdTransfer, lcdText } = await import('../core/emulate.js');
  const st = lcdState();
  for (const n of [0x3, 0x3, 0x3, 0x2]) lcdTransfer(st, 0, 0, n);          // 8-bit mode nibbles, then 4-bit
  const cmd = (b) => { lcdTransfer(st, 0, 0, b >> 4); lcdTransfer(st, 0, 0, b & 15); };
  const dat = (b) => { lcdTransfer(st, 1, 0, b >> 4); lcdTransfer(st, 1, 0, b & 15); };
  cmd(0x28); cmd(0x06); cmd(0x0C); cmd(0x01);
  for (const c of 'Hello') dat(c.charCodeAt(0));
  cmd(0xC0); for (const c of 'FPGA') dat(c.charCodeAt(0));
  const [l1, l2] = lcdText(st).map((l) => String.fromCharCode(...l));
  assert.equal(l1, 'Hello           ');
  assert.equal(l2, 'FPGA            ');
  cmd(0x01);
  assert.equal(String.fromCharCode(...lcdText(st)[0]).trim(), '');
  cmd(0x08);
  assert.equal(lcdText(st), null);
});

test('timing scale: only integer generics that count cycles (not sizes, vectors, times or reals)', async () => {
  const { timingGenerics, autoTimeScale, scaledGenerics } = await import('../core/emulate.js');
  const src = `library ieee; use ieee.std_logic_1164.all;
entity top is generic (PAT : std_logic_vector(15 downto 0) := x"ABCD"; DIV : integer := 50000000; T : time := 10 ms; R : real := 2000.0;
  DEPTH : natural := 1024; DATA_WIDTH : integer := 2048; N_BITS : integer := 4096; BAUD : integer := 9600; N : integer := 2000);
port (clk : in std_logic; led : out std_logic_vector(15 downto 0)); end top;
architecture a of top is begin led <= PAT; end a;`;
  const lib = compile([{ path: 't.vhd', lang: 'vhdl', text: src }]);
  const gens = timingGenerics(elaborate(lib, 'top').top.params);
  assert.deepEqual(gens.map((g) => g.name.toLowerCase()), ['div', 'n']);
  const scale = autoTimeScale(gens);
  assert.equal(scale, 10000);
  const d = elaborate(lib, 'top', { generics: scaledGenerics(gens, scale) });
  assert.deepEqual(d.diags, []);
  const val = (n) => Number(d.top.params.find((p) => p.name === n).value.v);
  assert.equal(val('div'), 5000);
  assert.equal(val('pat'), 0xABCD);     // the design keeps its constants
  assert.equal(val('depth'), 1024);
});

// one digit lit per clock (AN0 / AN1) while `show` = 1; blanked (leading-zero style) when `show` = 0
const BLANK_SRC = `library ieee; use ieee.std_logic_1164.all;
entity top is port(clk, show : in std_logic; seg : out std_logic_vector(6 downto 0); an : out std_logic_vector(1 downto 0)); end top;
architecture rtl of top is
  signal t : std_logic := '0';
begin
  process(clk) begin if rising_edge(clk) then t <= not t; end if; end process;
  an  <= "11" when show = '0' else "10" when t = '0' else "01";
  seg <= "1111001";
end rtl;`;

test('7-segment persistence: a multiplexed digit keeps its pattern, a blanked one goes dark', () => {
  const d = elaborate(compile([{ path: 'top.vhd', lang: 'vhdl', text: BLANK_SRC }]), 'top');
  const w = boardWiring({ ports: d.top.ports, assignments: parseUcf(UCF).assignments, board: BOARD });
  const sim = new Simulator(d);
  const show = d.top.ports.find((p) => p.name === 'show').sig;
  sim.force(show, V.ONE);
  sim.addClock(w.clocks[0].sig, { period: 20000 });
  sim.run(0);
  let prev = null;
  const window = (cycles) => {
    const t0 = sim.now;
    for (const s of d.signals) s.wave = { t: [sim.now], v: [s.val] };
    sim.run(sim.now + cycles * 20000);
    prev = boardOutputs(w, t0, sim.now, prev);
    return prev;
  };
  // one clock per window (the Step button): each digit is lit every other window, both stay on
  for (let k = 0; k < 20; k++) {
    const o = window(1);
    assert.ok(o.digits[0] && o.digits[1], `cycle ${k}: both digits shown`);
  }
  assert.deepEqual(prev.digits[0].seg.map(Math.round), [0, 1, 1, 0, 0, 0, 0]);
  sim.force(show, V.ZERO);
  for (let k = 0; k < 50; k++) window(1);
  assert.equal(prev.digits[0], null);
  assert.equal(prev.digits[1], null);
  // long windows (full speed): kept for two dark windows, then dark
  sim.force(show, V.ONE);
  assert.ok(window(1000).digits[0]);
  sim.force(show, V.ZERO);
  assert.ok(window(1000).digits[0]);
  assert.ok(window(1000).digits[0]);
  assert.equal(window(1000).digits[0], null);
});

test('7-segment persistence: slow multiplexing keeps every digit; a digit the scan skips goes dark', () => {
  // 4 digits, each lit for 8 clocks in turn; digit 2 is skipped while `show` = 0
  const src = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity top is port(clk, show : in std_logic; seg : out std_logic_vector(6 downto 0); an : out std_logic_vector(3 downto 0)); end top;
architecture rtl of top is
  signal c : unsigned(4 downto 0) := (others => '0');
begin
  process(clk) begin if rising_edge(clk) then c <= c + 1; end if; end process;
  an <= "1111" when show = '0' and c(4 downto 3) = "10" else
        "1110" when c(4 downto 3) = "00" else "1101" when c(4 downto 3) = "01" else "1011" when c(4 downto 3) = "10" else "0111";
  seg <= "1111001";
end rtl;`;
  const ucf = ['clk:B8', 'show:P11', 'seg<0>:L14', 'seg<1>:H12', 'seg<2>:N14', 'seg<3>:N11', 'seg<4>:P12', 'seg<5>:L13', 'seg<6>:M12', 'an<0>:F12', 'an<1>:J12', 'an<2>:M13', 'an<3>:K14']
    .map((x) => { const [n, l] = x.split(':'); return `NET "${n}" LOC = "${l}";`; }).join('\n');
  const d = elaborate(compile([{ path: 'top.vhd', lang: 'vhdl', text: src }]), 'top');
  const board4 = { resources: BOARD.resources.map((r) => (r.name === 'an' ? { ...r, pins: ['F12', 'J12', 'M13', 'K14'] } : r)) };
  const w = boardWiring({ ports: d.top.ports, assignments: parseUcf(ucf).assignments, board: board4 });
  const sim = new Simulator(d);
  const show = d.top.ports.find((p) => p.name === 'show').sig;
  sim.force(show, V.ONE);
  sim.addClock(w.clocks[0].sig, { period: 20000 });
  sim.run(0);
  let prev = null;
  const window = (cycles) => {
    const t0 = sim.now;
    for (const s of d.signals) s.wave = { t: [sim.now], v: [s.val] };
    sim.run(sim.now + cycles * 20000);
    prev = boardOutputs(w, t0, sim.now, prev);
    return prev;
  };
  for (let k = 0; k < 40; k++) window(1);   // first scan(s): the display learns
  for (let k = 0; k < 64; k++) { const o = window(1); assert.ok(o.digits.every(Boolean), `cycle ${k}: all 4 digits shown`); }
  sim.force(show, V.ZERO);
  for (let k = 0; k < 80; k++) window(1);
  assert.equal(prev.digits[2], null, 'skipped digit is dark');
  assert.ok(prev.digits[0] && prev.digits[1] && prev.digits[3], 'the others stay on');
});

test('HD44780 bus: E falling edges on window boundaries are not lost', async () => {
  const { lcdState, lcdFeed } = await import('../core/emulate.js');
  // E high for one cycle every 4 cycles, changed on the falling clock edge (= the window boundaries)
  const src = `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity top is port (clk : in std_logic; e, rs, rw : out std_logic; d : out std_logic_vector(3 downto 0)); end top;
architecture a of top is signal c : unsigned(3 downto 0) := (others => '0'); begin
process (clk) begin if falling_edge(clk) then c <= c + 1; end if; end process;
e <= '1' when c(1 downto 0) = "01" else '0';
rs <= '1'; rw <= '0'; d <= "0011";
end a;`;
  const d = elaborate(compile([{ path: 't.vhd', lang: 'vhdl', text: src }]), 'top');
  const board = { resources: [{ name: 'clk', group: 'Clock', pins: ['C1'], extra: { period: '20 ns' } }, { name: 'lcd_e', pins: ['P1'] }, { name: 'lcd_rs', pins: ['P2'] },
    { name: 'lcd_rw', pins: ['P3'] }, { name: 'lcd_d', pins: ['P4', 'P5', 'P6', 'P7'] }] };
  const asg = { clk: { loc: 'C1' }, e: { loc: 'P1' }, rs: { loc: 'P2' }, rw: { loc: 'P3' }, 'd<0>': { loc: 'P4' }, 'd<1>': { loc: 'P5' }, 'd<2>': { loc: 'P6' }, 'd<3>': { loc: 'P7' } };
  const w = boardWiring({ ports: d.top.ports, assignments: asg, board });
  for (const n of [1, 4, 400]) {
    const sim = new Simulator(d);
    sim.addClock(w.clocks[0].sig, { period: 20000 });
    sim.run(0);
    const st = lcdState();
    for (let k = 0; k < 400 / n; k++) {
      const t0 = sim.now;
      for (const s of d.signals) s.wave = { t: [sim.now], v: [s.val] };
      sim.run(sim.now + n * 20000);
      lcdFeed(st, w, t0, sim.now);
    }
    assert.equal(st.writes, 100, `${n} cycle(s) per window`);   // 8-bit mode: one data write per pulse
  }
});

test('HD44780: address counter wraps on cursor moves, in 1-line mode, and advances on data reads', async () => {
  const { lcdState, lcdTransfer, lcdExec } = await import('../core/emulate.js');
  const st = lcdState();
  lcdExec(st, 0x38, 0);                 // 8-bit, 2 lines
  lcdExec(st, 0x80 | 0x27, 0);
  lcdExec(st, 0x14, 0);                 // cursor right: 0x27 -> 0x40
  assert.equal(st.addr, 0x40);
  lcdExec(st, 0x10, 0);                 // cursor left: 0x40 -> 0x27
  assert.equal(st.addr, 0x27);
  lcdExec(st, 0x80, 0); lcdExec(st, 0x10, 0);
  assert.equal(st.addr, 0x67);          // left from 0x00
  lcdExec(st, 0x30, 0);                 // 1 line: DDRAM 0x00..0x4F
  lcdExec(st, 0x80 | 0x4f, 0);
  lcdExec(st, 0x41, 1);
  assert.equal(st.ddram[0x4f], 0x41);
  assert.equal(st.addr, 0x00);
  lcdExec(st, 0x10, 0);
  assert.equal(st.addr, 0x4f);
  lcdExec(st, 0x40 | 0x3f, 0);          // CGRAM address: wraps within 0..63
  lcdExec(st, 0x14, 0);
  assert.equal(st.addr, 0);
  // a data read (RS = 1, R/W = 1) advances the address counter; a busy-flag read does not
  lcdExec(st, 0x38, 0); lcdExec(st, 0x80 | 0x05, 0);
  lcdTransfer(st, 1, 1, 0, 8);
  assert.equal(st.addr, 0x06);
  lcdTransfer(st, 0, 1, 0, 8);
  assert.equal(st.addr, 0x06);
  lcdExec(st, 0x28, 0);                 // 4-bit: two nibbles per read
  lcdTransfer(st, 1, 1, 0); assert.equal(st.addr, 0x06);
  lcdTransfer(st, 1, 1, 0); assert.equal(st.addr, 0x07);
});
