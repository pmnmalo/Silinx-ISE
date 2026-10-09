// VHDL vs Verilog equivalence: the same small designs written in both languages, driven by the
// same stimulus, give the same output streams (and the values a reference model computes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { out } from './lang-util.js';

function rnd(seed) { return () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed >>> 8; }; }
const b8 = x => (x & 255).toString(2).padStart(8, '0');

test('8-bit ALU (add, sub, and, or, xor, shifts, signed compare, signed multiply)', () => {
  const r = rnd(5);
  const vecs = Array.from({ length: 60 }, () => [r() & 7, r() & 255, r() & 255]);
  const vh = out(`library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity alu is port (op : in std_logic_vector(2 downto 0); a, b : in std_logic_vector(7 downto 0); y : out std_logic_vector(7 downto 0); lt : out std_logic); end;
architecture rtl of alu is begin
  process (op, a, b)
    variable p : signed(15 downto 0);
  begin
    p := signed(a) * signed(b);
    case op is
      when "000" => y <= std_logic_vector(unsigned(a) + unsigned(b));
      when "001" => y <= std_logic_vector(unsigned(a) - unsigned(b));
      when "010" => y <= a and b;
      when "011" => y <= a or b;
      when "100" => y <= a xor b;
      when "101" => y <= std_logic_vector(shift_left(unsigned(a), to_integer(unsigned(b(2 downto 0)))));
      when "110" => y <= std_logic_vector(shift_right(signed(a), to_integer(unsigned(b(2 downto 0)))));
      when others => y <= std_logic_vector(p(7 downto 0));
    end case;
    if signed(a) < signed(b) then lt <= '1'; else lt <= '0'; end if;
  end process;
end;
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end;
architecture sim of tb is
  signal op : std_logic_vector(2 downto 0); signal a, b, y : std_logic_vector(7 downto 0); signal lt : std_logic;
begin
  u : entity work.alu port map (op, a, b, y, lt);
  process begin
${vecs.map(([o, x, z]) => `    op <= std_logic_vector(to_unsigned(${o}, 3)); a <= std_logic_vector(to_unsigned(${x}, 8)); b <= std_logic_vector(to_unsigned(${z}, 8)); wait for 1 ns; report to_string(y) & " " & to_string(lt);`).join('\n')}
    wait;
  end process;
end;`);
  const vl = out(`module alu(input [2:0] op, input [7:0] a, b, output reg [7:0] y, output lt);
  wire signed [15:0] p = $signed(a) * $signed(b);
  always @* case (op)
    3'd0: y = a + b; 3'd1: y = a - b; 3'd2: y = a & b; 3'd3: y = a | b; 3'd4: y = a ^ b;
    3'd5: y = a << b[2:0]; 3'd6: y = $signed(a) >>> b[2:0]; default: y = p[7:0];
  endcase
  assign lt = $signed(a) < $signed(b);
endmodule
module tb; reg [2:0] op; reg [7:0] a, b; wire [7:0] y; wire lt;
  alu u(op, a, b, y, lt);
  initial begin
${vecs.map(([o, x, z]) => `    op = ${o}; a = ${x}; b = ${z}; #1 $display("%b %b", y, lt);`).join('\n')}
  end
endmodule`);
  const s8 = x => (x << 24) >> 24;
  const model = vecs.map(([o, x, z]) => {
    const y = [x + z, x - z, x & z, x | z, x ^ z, x << (z & 7), s8(x) >> (z & 7), s8(x) * s8(z)][o];
    return `${b8(y)} ${+(s8(x) < s8(z))}`;
  });
  assert.deepEqual(vl, model);
  assert.deepEqual(vh, model);
});

test('Moore FSM sequence detector (1011, overlapping) with synchronous reset', () => {
  const bits = '0110110111010110111101011'.split('').map(Number);
  const vh = out(`library ieee; use ieee.std_logic_1164.all;
entity det is port (clk, rst, x : in std_logic; z : out std_logic); end;
architecture rtl of det is
  type st_t is (s0, s1, s10, s101, s1011);
  signal st : st_t;
begin
  process (clk) begin
    if rising_edge(clk) then
      if rst = '1' then st <= s0;
      else
        case st is
          when s0 => if x = '1' then st <= s1; end if;
          when s1 => if x = '0' then st <= s10; end if;
          when s10 => if x = '1' then st <= s101; else st <= s0; end if;
          when s101 => if x = '1' then st <= s1011; else st <= s10; end if;
          when s1011 => if x = '1' then st <= s1; else st <= s10; end if;
        end case;
      end if;
    end if;
  end process;
  z <= '1' when st = s1011 else '0';
end;
library ieee; use ieee.std_logic_1164.all;
entity tb is end;
architecture sim of tb is signal clk, rst, x, z : std_logic := '0'; begin
  u : entity work.det port map (clk, rst, x, z);
  process begin
    rst <= '1'; clk <= '1'; wait for 1 ns; clk <= '0'; rst <= '0'; wait for 1 ns;
${bits.map(b => `    x <= '${b}'; wait for 1 ns; clk <= '1'; wait for 1 ns; clk <= '0'; report std_logic'image(z);`).join('\n')}
    wait;
  end process;
end;`);
  const vl = out(`module det(input clk, rst, x, output z);
  localparam S0 = 0, S1 = 1, S10 = 2, S101 = 3, S1011 = 4;
  reg [2:0] st;
  always @(posedge clk)
    if (rst) st <= S0;
    else case (st)
      S0: if (x) st <= S1;
      S1: if (!x) st <= S10;
      S10: st <= x ? S101 : S0;
      S101: st <= x ? S1011 : S10;
      S1011: st <= x ? S1 : S10;
    endcase
  assign z = st == S1011;
endmodule
module tb; reg clk = 0, rst = 0, x = 0; wire z;
  det u(clk, rst, x, z);
  initial begin
    rst = 1; clk = 1; #1 clk = 0; rst = 0; #1;
${bits.map(b => `    x = ${b}; #1 clk = 1; #1 clk = 0; $display("'%b'", z);`).join('\n')}
  end
endmodule`);
  let st = 0;
  const model = bits.map(x => {
    st = [x ? 1 : 0, x ? 1 : 2, x ? 3 : 0, x ? 4 : 2, x ? 1 : 2][st];
    return `'${st === 4 ? 1 : 0}'`;
  });
  assert.deepEqual(vl, model);
  assert.deepEqual(vh, model);
});

test('synchronous RAM (write first) and a priority encoder written with loops', () => {
  const r = rnd(11);
  const ops = Array.from({ length: 40 }, () => [r() & 1, r() & 7, r() & 255]);
  const vh = out(`library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity ram is port (clk, we : in std_logic; addr : in unsigned(2 downto 0); din : in std_logic_vector(7 downto 0); dout : out std_logic_vector(7 downto 0); hi : out integer); end;
architecture rtl of ram is
  type mem_t is array (0 to 7) of std_logic_vector(7 downto 0);
  signal mem : mem_t := (others => (others => '0'));
begin
  process (clk) begin
    if rising_edge(clk) then
      if we = '1' then mem(to_integer(addr)) <= din; dout <= din;
      else dout <= mem(to_integer(addr)); end if;
    end if;
  end process;
  process (din)
    variable h : integer;
  begin
    h := -1;
    for i in din'range loop
      if din(i) = '1' then h := i; exit; end if;
    end loop;
    hi <= h;
  end process;
end;
library ieee; use ieee.std_logic_1164.all; use ieee.numeric_std.all;
entity tb is end;
architecture sim of tb is signal clk, we : std_logic := '0'; signal addr : unsigned(2 downto 0); signal din, dout : std_logic_vector(7 downto 0); signal hi : integer; begin
  u : entity work.ram port map (clk, we, addr, din, dout, hi);
  process begin
${ops.map(([w, a, d]) => `    we <= '${w}'; addr <= to_unsigned(${a}, 3); din <= std_logic_vector(to_unsigned(${d}, 8)); wait for 1 ns; clk <= '1'; wait for 1 ns; clk <= '0'; report to_string(dout) & " " & integer'image(hi);`).join('\n')}
    wait;
  end process;
end;`);
  const vl = out(`module ram(input clk, we, input [2:0] addr, input [7:0] din, output reg [7:0] dout, output reg signed [31:0] hi);
  reg [7:0] mem [0:7];
  integer i;
  initial for (i = 0; i < 8; i = i + 1) mem[i] = 0;
  always @(posedge clk) if (we) begin mem[addr] <= din; dout <= din; end else dout <= mem[addr];
  always @* begin : enc
    hi = -1;
    for (i = 7; i >= 0; i = i - 1) if (din[i] && hi == -1) hi = i;
  end
endmodule
module tb; reg clk = 0, we = 0; reg [2:0] addr; reg [7:0] din; wire [7:0] dout; wire signed [31:0] hi;
  ram u(clk, we, addr, din, dout, hi);
  initial begin
${ops.map(([w, a, d]) => `    we = ${w}; addr = ${a}; din = ${d}; #1 clk = 1; #1 clk = 0; $display("%b %0d", dout, hi);`).join('\n')}
  end
endmodule`);
  const mem = new Array(8).fill(0);
  const model = ops.map(([w, a, d]) => {
    let dout;
    if (w) { mem[a] = d; dout = d; } else dout = mem[a];
    return `${b8(dout)} ${d ? 31 - Math.clz32(d) : -1}`;
  });
  assert.deepEqual(vl, model);
  assert.deepEqual(vh, model);
});
