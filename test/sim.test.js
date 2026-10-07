import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { simulate } from '../core/compile.js';

function run(files, top, until = 1e9) {
  const srcs = Object.entries(files).map(([path, text]) => ({ path, text }));
  const r = simulate(srcs, top, { until });
  assert.deepEqual(r.errors.map(e => `${e.file}:${e.line} ${e.message}`), []);
  const out = r.sim.log.map(l => (l.kind === 'print' ? l.text : `${l.kind}: ${l.text}`));
  const errs = r.sim.log.filter(l => l.kind === 'error' || l.kind === 'failure');
  assert.deepEqual(errs.map(e => e.text), [], out.join('\n'));
  return { out, r };
}

test('verilog: arithmetic, widths, signed, carry', () => {
  const { out } = run({ 't.v': `
module t;
  reg [7:0] a, b; wire [8:0] s = a + b; reg signed [7:0] sa; reg [3:0] n;
  reg [15:0] p; integer i;
  initial begin
    a = 200; b = 100; #1;
    $display("%0d", s);
    sa = -8'sd5; $display("%0d", sa >>> 1);
    n = 4'b1010; $display("%b %b %b", n << 1, ~n, {n[1:0], n[3:2]});
    p = a * b; $display("%0d", p);
    $display("%0d", (a > b) ? 1 : 0);
    $display("%b", ^n);
    $display("%h", {2{n}});
    i = -7; $display("%0d %0d", i / 2, i % 2);
    $display("%b", 4'b1x01 == 4'b1x01);
    $display("%b", 4'b1x01 === 4'b1x01);
  end
endmodule` }, 't');
  assert.deepEqual(out, ['300', '-3', '0100 0101 1010', '20000', '1', '0', 'aa', '-3 -1', 'x', '1']);
});

test('verilog: fsm, case, functions, memories, generate', () => {
  const { out } = run({ 'd.v': `
module seq(input clk, input rst, input din, output reg hit);
  localparam S0=2'd0, S1=2'd1, S2=2'd2;
  reg [1:0] st, nx;
  always @(posedge clk) if (rst) st <= S0; else st <= nx;
  always @* begin
    nx = st; hit = 0;
    case (st)
      S0: if (din) nx = S1;
      S1: if (!din) nx = S2;
      S2: begin if (din) begin nx = S1; hit = 1; end else nx = S0; end
      default: nx = S0;
    endcase
  end
endmodule
module tb;
  reg clk=0, rst=1, din=0; wire hit; integer hits=0;
  seq u(.clk(clk), .rst(rst), .din(din), .hit(hit));
  always #5 clk = ~clk;
  always @(posedge clk) if (hit) hits = hits + 1;
  function [7:0] rev; input [7:0] x; integer k; begin for (k=0;k<8;k=k+1) rev[k]=x[7-k]; end endfunction
  reg [7:0] mem [0:15];
  wire [3:0] g;
  genvar j;
  generate for (j=0;j<4;j=j+1) begin : gg assign g[j] = (j % 2 == 0); end endgenerate
  task pulse(input b); begin din = b; @(negedge clk); end endtask
  initial begin
    @(negedge clk) rst = 0;
    pulse(1); pulse(0); pulse(1); pulse(0); pulse(1); pulse(1);
    $display("hits=%0d", hits);
    $display("%b", rev(8'b00000011));
    mem[3] = 8'hAB; mem[4] = mem[3] + 1; $display("%h", mem[4]);
    $display("%b", g);
    casez (4'b1011) 4'b1??0: $display("A"); 4'b10?1: $display("B"); default: $display("C"); endcase
    $finish;
  end
endmodule` }, 'tb');
  assert.deepEqual(out.slice(0, 5), ['hits=2', '11000000', 'ac', '0101', 'B']);
});

test('vhdl: fsm with enum, rom, package function, assertions', () => {
  const { out } = run({
    'p.vhd': `
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
package p is
  constant W : natural := 4;
  function parity(v : std_logic_vector) return std_logic;
end package;
package body p is
  function parity(v : std_logic_vector) return std_logic is
    variable r : std_logic := '0';
  begin
    for i in v'range loop r := r xor v(i); end loop;
    return r;
  end function;
end package body;`,
    'd.vhd': `
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
use work.p.all;
entity dut is
  port (clk, rst : in std_logic; go : in std_logic; cnt : out unsigned(W-1 downto 0); seg : out std_logic_vector(6 downto 0); busy : out std_logic);
end entity;
architecture rtl of dut is
  type st_t is (IDLE, RUN, DONE);
  signal st : st_t := IDLE;
  signal c : unsigned(W-1 downto 0) := (others => '0');
  type rom_t is array (0 to 3) of std_logic_vector(6 downto 0);
  constant ROM : rom_t := ("1000000", "1111001", "0100100", "0110000");
begin
  process (clk, rst) begin
    if rst = '1' then st <= IDLE; c <= (others => '0');
    elsif rising_edge(clk) then
      case st is
        when IDLE => if go = '1' then st <= RUN; end if;
        when RUN => c <= c + 1; if c = 5 then st <= DONE; end if;
        when others => null;
      end case;
    end if;
  end process;
  cnt <= c;
  busy <= '1' when st = RUN else '0';
  seg <= ROM(to_integer(c(1 downto 0)));
end architecture;`,
    'tb.vhd': `
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
use work.p.all;
entity tb is end;
architecture sim of tb is
  signal clk : std_logic := '0'; signal rst : std_logic := '1'; signal go : std_logic := '0';
  signal cnt : unsigned(3 downto 0); signal seg : std_logic_vector(6 downto 0); signal busy : std_logic;
  constant T : time := 10 ns;
begin
  clk <= not clk after T/2;
  u : entity work.dut port map (clk => clk, rst => rst, go => go, cnt => cnt, seg => seg, busy => busy);
  process begin
    wait for 12 ns; rst <= '0'; go <= '1';
    wait until rising_edge(clk); go <= '0';
    wait until busy = '0';
    report "cnt=" & integer'image(to_integer(cnt));
    assert seg = "0100100" report "bad seg" severity error;
    assert parity("1011") = '1' report "bad parity" severity error;
    report "done";
    std.env.finish;
  end process;
end architecture;` }, 'tb');
  assert.deepEqual(out.filter(l => l.startsWith('note')).slice(0, 2), ['note: cnt=6', 'note: done']);
});

test('mixed: VHDL top instantiating Verilog and vice versa', () => {
  const { out } = run({
    'add.v': 'module adder #(parameter W=4) (input [W-1:0] a, b, output [W:0] s); assign s = a + b; endmodule',
    'inv.vhd': `library ieee; use ieee.std_logic_1164.all;
entity inv is generic (N : integer := 4); port (x : in std_logic_vector(N-1 downto 0); y : out std_logic_vector(N-1 downto 0)); end;
architecture a of inv is begin y <= not x; end;`,
    'top.vhd': `library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity top is end;
architecture s of top is
  component adder generic (W : integer); port (a, b : in std_logic_vector(W-1 downto 0); s : out std_logic_vector(W downto 0)); end component;
  signal a, b, ia : std_logic_vector(7 downto 0); signal s : std_logic_vector(8 downto 0);
begin
  u1 : adder generic map (W => 8) port map (a => ia, b => b, s => s);
  u2 : entity work.inv generic map (N => 8) port map (x => a, y => ia);
  process begin
    a <= x"0F"; b <= x"F0"; wait for 1 ns;
    report "s=" & integer'image(to_integer(unsigned(s)));
    wait;
  end process;
end;` }, 'top');
  assert.ok(out.includes('note: s=480'), out.join('\n'));
});

test('vhdl fixtures: counter testbench passes', () => {
  const dir = new URL('./fixtures/vhdl/', import.meta.url);
  const files = Object.fromEntries(fs.readdirSync(dir).map(f => [f, fs.readFileSync(new URL(f, dir), 'utf8')]));
  const { out } = run(files, 'tb_counter');
  assert.ok(out.some(l => /finished/.test(l)));
});

test('VHDL procedure with a signal parameter drives the actual across waits', () => {
  run({ 'tb.vhd': `
library ieee; use ieee.std_logic_1164.all;
entity tb is end tb;
architecture a of tb is
  signal b : std_logic_vector(1 downto 0) := "00";
  signal seen : integer := 0;
begin
  process (b) begin
    if rising_edge(b(0)) then seen <= seen + 1; end if;
  end process;
  process
    procedure press(signal x : out std_logic) is
    begin
      x <= '1'; wait for 10 ns;
      x <= '0'; wait for 10 ns;
    end procedure;
  begin
    press(b(0));
    press(b(0));
    wait for 1 ns;
    assert seen = 2 report "pulses seen: " & integer'image(seen) severity error;
    assert b = "00" report "b not released" severity error;
    report "ok";
    wait;
  end process;
end a;` }, 'tb');
});
