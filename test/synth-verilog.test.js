// core/synth-verilog.js: the synthesis front end (elaborated design -> one flat SystemVerilog
// module for Yosys). Every design is checked the same way: the generated Verilog is compiled and
// simulated by Silinx against the original, with random stimulus, and the outputs must be equal
// at every clock cycle (registers start at 0, as on the FPGA).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, elaborate } from '../core/compile.js';
import { Simulator } from '../core/simulator.js';
import * as V from '../core/values.js';
import { toVerilog, synthWidth, lit, SynthError } from '../core/synth-verilog.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vhd = (text, p = 'd.vhd') => ({ path: p, lang: 'vhdl', text });
const vlog = (text, p = 'd.v') => ({ path: p, lang: 'verilog', text });

function build(sources, top) {
  const d = elaborate(compile(sources), top);
  const bad = [...d.lib.errors, ...d.diags].filter(x => x.severity !== 'warning');
  assert.deepEqual(bad.map(x => `${x.file}:${x.line} ${x.message}`), []);
  return d;
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function powerUp(d) {
  const allX = v => v && !Array.isArray(v) && v.w > 0 && v.x === (1n << BigInt(v.w)) - 1n;
  for (const s of d.signals) {
    if (Array.isArray(s.val)) s.val = s.val.map(e => (allX(e) ? V.withSign(V.fromInt(0, e.w, false), e.s) : e));
    else if (allX(s.val)) s.val = V.withSign(V.fromInt(0, s.val.w, false), s.val.s);
  }
}
/** Outputs of `d` every cycle under seeded random inputs (`clock` driven, the reset `rst` high the first 2 cycles). */
function runRandom(d, { clock = 'clk', cycles = 400, seed = 7, reset = 'rst', ints = new Set() } = {}) {
  const s = new Simulator(d, { maxWaveEvents: 0 });
  powerUp(d);
  const ports = new Map(d.top.ports.map(p => [p.name.toLowerCase(), p]));
  const P = 20000;
  if (ports.has(clock)) s.addClock(ports.get(clock).sig, { period: P });
  const ins = d.top.ports.filter(p => p.dir === 'in' && p.name.toLowerCase() !== clock);
  const outs = d.top.ports.filter(p => p.dir !== 'in').sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
  const r = rng(seed);
  const res = [];
  for (let k = 0; k < cycles; k++) {
    const R = P / 2 + k * P;
    s.run(R + P / 4);
    for (const p of ins) {
      const w = p.sig.t.w;
      let v = 0n;
      for (let i = 0; i < w; i += 16) v |= BigInt(Math.floor(r() * 65536)) << BigInt(i);
      v &= (1n << BigInt(w)) - 1n;
      if (p.name.toLowerCase() === reset) v = k < 2 || r() < 0.02 ? 1n : 0n;
      s.force(p.sig, V.mk(w, v));
    }
    s.run(R + P - 1000);
    // integers as numbers (synthesis gives an integer port the width of its range)
    res.push(outs.map(p => `${p.name}=${ints.has(p.name.toLowerCase()) ? (p.sig.val.x ? 'X' : V.toDec(p.sig.val, !!p.sig.val.s)) : V.toBin(p.sig.val)}`).join(' '));
  }
  return res;
}
/** The generated Verilog behaves as the original: same outputs every cycle. Returns the Verilog. */
function equivalent(sources, top, opts = {}) {
  const d = build(sources, top);
  const { text, top: vtop, warnings } = toVerilog(d);
  const g = build([vlog(text, 'gen.v')], vtop);
  // integer ports (32 bits in simulation, the width of their range after synthesis): compared as numbers
  const ints = new Set(d.top.ports.filter(p => p.sig.t.kind === 'int').map(p => p.name.toLowerCase()));
  const a = runRandom(build(sources, top), { ...opts, ints }), b = runRandom(g, { ...opts, ints });
  const k = a.findIndex((x, i) => x !== b[i]);
  assert.equal(k, -1, k < 0 ? '' : `cycle ${k}:\n  original  ${a[k]}\n  generated ${b[k]}\n${text}`);
  assert.ok(new Set(a).size > (opts.minStates ?? 3), `the outputs change during the test (${new Set(a).size} states)`);
  return { text, warnings };
}

const PRE = 'library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;\n';

test('widths: integer signals get the width of their range; literals keep x and z bits', () => {
  assert.equal(synthWidth({ kind: 'int', w: 32, rlo: 0, rhi: 9 }), 4);
  assert.equal(synthWidth({ kind: 'int', w: 32, rlo: 0, rhi: 0 }), 1);
  assert.equal(synthWidth({ kind: 'int', w: 32, rlo: -4, rhi: 3 }), 3);
  assert.equal(synthWidth({ kind: 'int', w: 32, rlo: -1, rhi: 255 }), 9);
  assert.equal(synthWidth({ kind: 'int', w: 32 }), 32);
  assert.equal(synthWidth({ kind: 'logic', w: 8 }), 8);
  assert.equal(lit(V.fromInt(5, 4, false)), "4'h5");
  assert.equal(lit(V.fromBits('1x0z')), "4'b1x0z");
});

test('registers: asynchronous reset, clock enable, synchronous reset, falling edge, edge-conditional assignments', () => {
  equivalent([vhd(`${PRE}entity r is port (clk, rst, en, d : in std_logic; q1, q2, q3, q4, q5 : out std_logic); end r;
architecture a of r is signal s1, s2, s3, s4, s5 : std_logic; begin
  process (clk, rst) begin if rst = '1' then s1 <= '0'; elsif rising_edge(clk) then if en = '1' then s1 <= d; end if; end if; end process;
  process (clk) begin if rising_edge(clk) then if rst = '1' then s2 <= '1'; else s2 <= d xor s2; end if; end if; end process;
  process (clk) begin if falling_edge(clk) then s3 <= d; end if; end process;
  s4 <= d when rising_edge(clk);
  s5 <= '0' when rst = '1' else not s5 when clk'event and clk = '1';
  q1 <= s1; q2 <= s2; q3 <= s3; q4 <= s4; q5 <= s5;
end a;`)], 'r');
});

test('integers with ranges, enumerated state machine with case, outputs decoded from the state', () => {
  const { text } = equivalent([vhd(`${PRE}entity f is port (clk, rst, go, stop : in std_logic; busy : out std_logic; n : out integer range 0 to 9; st : out std_logic_vector(1 downto 0)); end f;
architecture a of f is
  type state_t is (idle, run, hold, done);
  signal s : state_t; signal c : integer range 0 to 9;
begin
  process (clk, rst) begin
    if rst = '1' then s <= idle; c <= 0;
    elsif rising_edge(clk) then
      case s is
        when idle => if go = '1' then s <= run; c <= 0; end if;
        when run => if stop = '1' then s <= hold; elsif c = 9 then s <= done; else c <= c + 1; end if;
        when hold => if go = '1' then s <= run; end if;
        when done => s <= idle;
      end case;
    end if;
  end process;
  busy <= '1' when s = run or s = hold else '0';
  n <= c;
  st <= std_logic_vector(to_unsigned(state_t'pos(s), 2));
end a;`)], 'f');
  assert.match(text, /logic \[3:0\] c;/, 'integer range 0 to 9 -> 4 bits');
});

test('arithmetic: unsigned / signed numeric_std, resize, comparisons, shifts, rotations, multiplication', () => {
  equivalent([vhd(`${PRE}entity m is port (a, b : in std_logic_vector(7 downto 0); s : in std_logic_vector(2 downto 0);
  sum : out std_logic_vector(8 downto 0); dif : out signed(8 downto 0); prod : out unsigned(15 downto 0); lt, slt : out std_logic;
  sh_l, sh_r, rot : out std_logic_vector(7 downto 0); neg : out signed(7 downto 0)); end m;
architecture x of m is begin
  sum <= std_logic_vector(resize(unsigned(a), 9) + unsigned(b));
  dif <= resize(signed(a), 9) - resize(signed(b), 9);
  prod <= unsigned(a) * unsigned(b);
  lt <= '1' when unsigned(a) < unsigned(b) else '0';
  slt <= '1' when signed(a) < signed(b) else '0';
  sh_l <= std_logic_vector(shift_left(unsigned(a), to_integer(unsigned(s))));
  sh_r <= std_logic_vector(shift_right(signed(a), to_integer(unsigned(s))));
  rot <= std_logic_vector(rotate_left(unsigned(a), 3));
  neg <= -signed(a);
end x;`)], 'm', { clock: 'none' });
});

test('functions, procedures with signal outputs, loops with exit, case with ranges, process variables', () => {
  equivalent([vhd(`${PRE}entity p is port (clk : in std_logic; x : in std_logic_vector(7 downto 0); ones, lead : out integer range 0 to 8;
  par, big : out std_logic; seg : out std_logic_vector(6 downto 0); acc : out unsigned(7 downto 0)); end p;
architecture a of p is
  function count_ones(v : std_logic_vector) return integer is variable n : integer := 0;
  begin for i in v'range loop if v(i) = '1' then n := n + 1; end if; end loop; return n; end function;
  procedure seg7(d : in std_logic_vector(3 downto 0); signal o : out std_logic_vector(6 downto 0)) is begin
    case d is when x"0" => o <= "1000000"; when x"1" => o <= "1111001"; when x"2" => o <= "0100100"; when others => o <= "0111111"; end case;
  end procedure;
  signal r : unsigned(7 downto 0) := (others => '0');
begin
  ones <= count_ones(x);
  process (x) variable k : integer range 0 to 8; begin
    k := 8;
    for i in 7 downto 0 loop if x(i) = '1' then k := 7 - i; exit; end if; end loop;
    lead <= k;
  end process;
  par <= x(0) xor x(1) xor x(2) xor x(3) xor x(4) xor x(5) xor x(6) xor x(7);
  process (x) begin
    case to_integer(unsigned(x)) is when 0 to 99 => big <= '0'; when 100 to 255 => big <= '1'; when others => big <= '0'; end case;
  end process;
  seg7(x(3 downto 0), seg);
  process (clk) variable t : unsigned(7 downto 0); begin
    if rising_edge(clk) then t := r + unsigned(x); r <= t xor (t srl 1); end if;
  end process;
  acc <= r;
end a;`)], 'p');
});

test('memories: a constant ROM and a RAM written on the clock', () => {
  equivalent([vhd(`${PRE}entity mem is port (clk, we : in std_logic; addr : in std_logic_vector(3 downto 0); din : in std_logic_vector(7 downto 0);
  rom_q, ram_q : out std_logic_vector(7 downto 0)); end mem;
architecture a of mem is
  type rom_t is array (0 to 15) of std_logic_vector(7 downto 0);
  constant ROM : rom_t := (x"00", x"11", x"22", x"33", x"44", x"55", x"66", x"77", x"88", x"99", x"AA", x"BB", x"CC", x"DD", x"EE", x"FF");
  type ram_t is array (0 to 15) of std_logic_vector(7 downto 0);
  signal ram : ram_t := (others => (others => '0'));
begin
  rom_q <= ROM(to_integer(unsigned(addr)));
  process (clk) begin if rising_edge(clk) then
    if we = '1' then ram(to_integer(unsigned(addr))) <= din; end if;
    ram_q <= ram(to_integer(unsigned(addr)));
  end if; end process;
end a;`)], 'mem');
});

test('Verilog: always @(posedge clk or negedge rstn), case, ternary, concatenation, a function', () => {
  equivalent([vlog(`module v(input clk, input rstn, input [3:0] a, input [1:0] op, output reg [7:0] q, output [4:0] s);
  function [4:0] add5(input [3:0] x, input [3:0] y); add5 = x + y; endfunction
  assign s = op[0] ? add5(a, q[3:0]) : {1'b0, a};
  always @(posedge clk or negedge rstn)
    if (!rstn) q <= 8'h01;
    else case (op)
      2'd0: q <= {q[6:0], q[7]};
      2'd1: q <= q + a;
      2'd2: q <= q ^ {a, a};
      default: q <= ~q;
    endcase
endmodule`)], 'v', { reset: 'none' });
});

test('the blinky example (mixed VHDL and Verilog) behaves the same after translation', () => {
  const dir = path.join(ROOT, 'examples', 'blinky');
  const pj = JSON.parse(fs.readFileSync(path.join(dir, 'silinx.json'), 'utf8'));
  const srcs = pj.files.filter(f => f.role !== 'sim').map(f => ({ path: f.path, lang: /\.vhdl?$/i.test(f.path) ? 'vhdl' : 'verilog', text: fs.readFileSync(path.join(dir, f.path), 'utf8') }));
  equivalent(srcs, pj.top, { cycles: 600, minStates: 1 });
});

test('what cannot be synthesized is reported with its line, not guessed', () => {
  const err = (src, top) => { try { toVerilog(build([vhd(src)], top)); return null; } catch (e) { assert.ok(e instanceof SynthError, e.stack); return e.message; } };
  assert.match(err(`${PRE}entity w is port (o : out std_logic); end w; architecture a of w is begin
  process begin o <= '0'; wait for 10 ns; o <= '1'; wait for 10 ns; end process; end a;`, 'w'), /waits cannot be synthesized|cannot be synthesized here/);
  assert.match(err(`${PRE}entity w is port (clk, d : in std_logic; o : out std_logic); end w; architecture a of w is begin
  process (clk) begin if rising_edge(clk) then o <= d; else o <= not d; end if; end process; end a;`, 'w'), /after the clock edge/);
});

test('Verilog front end: SystemVerilog size casts W\'(expr) truncate, extend by the sign and keep the signedness', () => {
  const d = build([vlog(`module c; wire [7:0] a = 8'hF5; wire signed [3:0] b = 4'sb1010; wire [3:0] x = 4'(a >> 4); wire [7:0] y = 8'(b);
  wire [7:0] z = 8'(4'(a)); endmodule`)], 'c');
  new Simulator(d).run(10);
  const val = n => V.toBin(d.top.signals.find(s => s.name === n).val);
  assert.equal(val('x'), '1111');
  assert.equal(val('y'), '11111010', 'sign extension of a signed value');
  assert.equal(val('z'), '00000101');
});
