// Behavioural HDL modules for the conversion of any HDL module to a schematic (#225,
// test/hdl-to-sch.test.js): VHDL and Verilog, processes, always blocks, generics / parameters,
// generates, functions, packages, records, memories, FSMs, tri-states, compiler directives, several
// design units in a file, an entity and its architecture in two files. Each one with a testbench
// (sim/), whose waveforms must be the same with the module made a schematic.
//   { name, module, file (the module's), tb, until, files: { path: text } }
export const CASES = [];
const add = c => CASES.push(c);


// VHDL: package (record, function, constant, array type) in the same file, generics, generate, FSM, memory
add({
  name: 'vhdl-pkg-same-file', module: 'alu_mem', file: 'src/alu.vhd', tb: 'tb_alu', until: 2e6,
  files: {
    'src/alu.vhd': `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

package alu_pkg is
  type op_t is (OP_ADD, OP_SUB, OP_AND, OP_XOR);
  type pair_t is record
    a : unsigned(7 downto 0);
    b : unsigned(7 downto 0);
  end record;
  constant ZERO : unsigned(7 downto 0) := (others => '0');
  function parity(v : std_logic_vector) return std_logic;
end package;

package body alu_pkg is
  function parity(v : std_logic_vector) return std_logic is
    variable p : std_logic := '0';
  begin
    for i in v'range loop p := p xor v(i); end loop;
    return p;
  end function;
end package body;

library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
use work.alu_pkg.all;

-- an ALU with a small memory
entity alu_mem is
  generic (DEPTH : positive := 8; INIT : natural := 3);
  port (
    clk  : in  std_logic;
    rst  : in  std_logic;
    a, b : in  std_logic_vector(7 downto 0);
    sel  : in  std_logic_vector(1 downto 0);
    we   : in  std_logic;
    addr : in  std_logic_vector(2 downto 0);
    y    : out std_logic_vector(7 downto 0);
    par  : out std_logic;
    q    : out std_logic_vector(7 downto 0);
    busy : out std_logic
  );
end entity;

architecture rtl of alu_mem is
  type mem_t is array (0 to DEPTH - 1) of std_logic_vector(7 downto 0);
  signal mem : mem_t := (others => (others => '0'));
  signal op : op_t;
  signal p : pair_t;
  signal r : unsigned(7 downto 0);
  type st_t is (IDLE, RUN, DONE);
  signal st : st_t := IDLE;
  signal cnt : integer range 0 to 7 := INIT;
  signal g : std_logic_vector(3 downto 0);
  alias lo : std_logic_vector(3 downto 0) is a(3 downto 0);
  function inc(x : integer) return integer is begin return x + 1; end function;
begin
  -- operation decode
  with sel select op <= OP_ADD when "00", OP_SUB when "01", OP_AND when "10", OP_XOR when others;
  p <= (a => unsigned(a), b => unsigned(b));
  calc: process (op, p)
  begin
    case op is
      when OP_ADD => r <= p.a + p.b;
      when OP_SUB => r <= p.a - p.b;
      when OP_AND => r <= p.a and p.b;
      when OP_XOR => r <= p.a xor p.b;
    end case;
  end process;
  y <= std_logic_vector(r) when rst = '0' else std_logic_vector(ZERO);
  par <= parity(std_logic_vector(r));
  gen: for i in 0 to 3 generate
    g(i) <= lo(i) xor b(i);
  end generate;
  ram: process (clk)
  begin
    if rising_edge(clk) then
      if we = '1' then mem(to_integer(unsigned(addr))) <= a; end if;
      q <= mem(to_integer(unsigned(addr))) or ("0000" & g);
    end if;
  end process;
  fsm: process (clk, rst)
  begin
    if rst = '1' then st <= IDLE; cnt <= INIT;
    elsif rising_edge(clk) then
      case st is
        when IDLE => if we = '1' then st <= RUN; end if;
        when RUN => if cnt = 7 then st <= DONE; cnt <= 0; else cnt <= inc(cnt); end if;
        when DONE => st <= IDLE;
      end case;
    end if;
  end process;
  busy <= '1' when st = RUN else '0';
  assert DEPTH >= 8 report "DEPTH too small" severity failure;
end architecture;
`,
    'sim/tb_alu.vhd': `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity tb_alu is end;
architecture t of tb_alu is
  signal clk, rst, we, par, busy : std_logic := '0';
  signal a, b, y, q : std_logic_vector(7 downto 0) := (others => '0');
  signal sel : std_logic_vector(1 downto 0) := "00";
  signal addr : std_logic_vector(2 downto 0) := "000";
begin
  clk <= not clk after 5 ns;
  dut: entity work.alu_mem generic map (DEPTH => 8) port map (clk, rst, a, b, sel, we, addr, y, par, q, busy);
  process
    variable k : integer := 1;
  begin
    rst <= '1'; wait for 12 ns; rst <= '0';
    for i in 0 to 60 loop
      k := (k * 37 + 11) mod 256;
      a <= std_logic_vector(to_unsigned(k, 8));
      b <= std_logic_vector(to_unsigned((k * 7) mod 256, 8));
      sel <= std_logic_vector(to_unsigned(k mod 4, 2));
      addr <= std_logic_vector(to_unsigned(k mod 8, 3));
      we <= '1' when k mod 3 = 0 else '0';
      wait for 10 ns;
    end loop;
    wait;
  end process;
end;
`,
  },
});

// VHDL: two entities in one file, component declaration + instantiation, block, generate if, shared constant
add({
  name: 'vhdl-two-entities', module: 'top2', file: 'src/two.vhd', tb: 'tb_two', until: 1e6,
  files: {
    'src/two.vhd': `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity cnt4 is
  generic (W : integer := 4);
  port (clk : in std_logic; en : in std_logic; q : out std_logic_vector(W-1 downto 0));
end cnt4;
architecture a of cnt4 is
  signal c : unsigned(W-1 downto 0) := (others => '0');
begin
  process (clk) begin
    if rising_edge(clk) then if en = '1' then c <= c + 1; end if; end if;
  end process;
  q <= std_logic_vector(c);
end a;

library ieee;
use ieee.std_logic_1164.all;
entity top2 is
  generic (USE_INV : boolean := true);
  port (clk, en : in std_logic; q : out std_logic_vector(3 downto 0); z : out std_logic);
end top2;
architecture s of top2 is
  component cnt4
    generic (W : integer := 4);
    port (clk : in std_logic; en : in std_logic; q : out std_logic_vector(W-1 downto 0));
  end component;
  signal qq : std_logic_vector(3 downto 0);
  constant K : std_logic_vector(3 downto 0) := "1010";
begin
  u0: cnt4 generic map (W => 4) port map (clk => clk, en => en, q => qq);
  g1: if USE_INV generate
    q <= not qq;
  end generate;
  g2: if not USE_INV generate
    q <= qq;
  end generate;
  b1: block
    signal t : std_logic;
  begin
    t <= qq(0) and qq(1);
    z <= t or (qq(2) and K(1));
  end block;
end s;
`,
    'sim/tb_two.vhd': `library ieee;
use ieee.std_logic_1164.all;
entity tb_two is end;
architecture t of tb_two is
  signal clk, en, z : std_logic := '0';
  signal q : std_logic_vector(3 downto 0);
begin
  clk <= not clk after 5 ns;
  en <= '1' after 20 ns, '0' after 200 ns, '1' after 260 ns;
  dut: entity work.top2 port map (clk, en, q, z);
end;
`,
  },
});

// Verilog: two modules in a file, parameters (ANSI and body), localparam FSM, function, task, memory,
// generate for/if with genvar, `define, integer, non-ANSI ports, named block
add({
  name: 'verilog-multi', module: 'proc', file: 'src/proc.v', tb: 'tb_proc', until: 2e6,
  files: {
    'src/proc.v': `\`timescale 1ns / 1ps
\`define WORD 8
module adder #(parameter N = 4) (input [N-1:0] a, b, output [N:0] s);
  assign s = a + b;
endmodule

// the processor
module proc(clk, rst, din, we, addr, dout, state_o, sum, odd);
  parameter DEPTH = 16;
  parameter AW = 4;
  localparam IDLE = 2'd0, LOAD = 2'd1, RUN = 2'd2;
  input clk, rst;
  input [\`WORD-1:0] din;
  input we;
  input [AW-1:0] addr;
  output reg [\`WORD-1:0] dout;
  output [1:0] state_o;
  output [4:0] sum;
  output odd;
  reg [\`WORD-1:0] mem [0:DEPTH-1];
  reg [1:0] state;
  integer i;
  wire [3:0] lo = din[3:0];
  wire [7:0] x;
  function [3:0] rev(input [3:0] v);
    rev = {v[0], v[1], v[2], v[3]};
  endfunction
  task automatic clr; begin dout <= 0; end endtask
  initial begin for (i = 0; i < DEPTH; i = i + 1) mem[i] = i; end
  always @(posedge clk) begin : wr
    if (we) mem[addr] <= din;
    if (rst) clr; else dout <= mem[addr];
  end
  always @(posedge clk or posedge rst)
    if (rst) state <= IDLE;
    else case (state)
      IDLE: if (we) state <= LOAD;
      LOAD: state <= RUN;
      RUN: state <= din[0] ? IDLE : RUN;
      default: state <= IDLE;
    endcase
  assign state_o = state;
  adder #(.N(4)) u_add(.a(lo), .b(rev(din[7:4])), .s(sum));
  genvar k;
  generate
    for (k = 0; k < 8; k = k + 1) begin : g
      assign x[k] = din[k] ^ dout[k];
    end
    if (DEPTH > 8) begin : big
      assign odd = ^x;
    end else begin : small
      assign odd = 1'b0;
    end
  endgenerate
endmodule
`,
    'sim/tb_proc.v': `\`timescale 1ns / 1ps
module tb_proc;
  reg clk = 0, rst = 1, we = 0;
  reg [7:0] din = 0;
  reg [3:0] addr = 0;
  wire [7:0] dout; wire [1:0] st; wire [4:0] sum; wire odd;
  proc dut(clk, rst, din, we, addr, dout, st, sum, odd);
  always #5 clk = ~clk;
  integer j; reg [7:0] k;
  initial begin
    k = 1;
    #12 rst = 0;
    for (j = 0; j < 60; j = j + 1) begin
      k = k * 37 + 11;
      din = k; addr = k[5:2]; we = k[0] & k[1];
      #10;
    end
    $finish;
  end
endmodule
`,
  },
});

// SystemVerilog-ish: always_ff / always_comb, typedef enum, logic
add({
  name: 'sv-enum', module: 'sv_fsm', file: 'src/sv_fsm.sv', tb: 'tb_sv', until: 1e6,
  files: {
    'src/sv_fsm.sv': `module sv_fsm (input logic clk, input logic rst, input logic go, output logic [1:0] st, output logic done);
  typedef enum logic [1:0] {S0, S1, S2} state_t;
  state_t s, n;
  always_ff @(posedge clk) if (rst) s <= S0; else s <= n;
  always_comb begin
    n = s;
    case (s)
      S0: if (go) n = S1;
      S1: n = S2;
      S2: n = S0;
      default: n = S0;
    endcase
  end
  assign st = s;
  assign done = (s == S2);
endmodule
`,
    'sim/tb_sv.v': `\`timescale 1ns/1ps
module tb_sv; reg clk = 0, rst = 1, go = 0; wire [1:0] st; wire done;
  sv_fsm dut(.clk(clk), .rst(rst), .go(go), .st(st), .done(done));
  always #5 clk = ~clk;
  initial begin #12 rst = 0; #10 go = 1; #40 go = 0; #30 go = 1; #100 $finish; end
endmodule
`,
  },
});


// VHDL: entity and architecture in two files; ports of package types (record, enum, integer range,
// unsigned), port defaults, buffer port, generic string/time, attributes, shared variable
add({
  name: 'vhdl-split-files', module: 'acc', file: 'src/acc_arch.vhd', tb: 'tb_acc', until: 1e6,
  files: {
    'src/types.vhd': `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
package types is
  type mode_t is (M_ADD, M_HOLD, M_CLR);
  type cfg_t is record step : unsigned(3 downto 0); wrap : boolean; end record;
  constant DEF_CFG : cfg_t := (step => "0001", wrap => true);
end package;
`,
    'src/acc_ent.vhd': `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
use work.types.all;
entity acc is
  generic (NAME : string := "acc"; T_CO : time := 1 ns; MAXV : integer := 200);
  port (clk : in std_logic;
        mode : in mode_t := M_ADD;
        cfg : in cfg_t := DEF_CFG;
        level : in integer range 0 to 15 := 0;
        sum : buffer unsigned(7 downto 0);
        hit : out boolean);
end entity acc;
`,
    'src/acc_arch.vhd': `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
use work.types.all;
architecture beh of acc is
  attribute keep : string;
  signal nxt : unsigned(7 downto 0);
  attribute keep of nxt : signal is "true";
  shared variable dummy : integer := 0;
begin
  -- next value
  nxt <= sum + cfg.step + to_unsigned(level, 8) when mode = M_ADD else
         (others => '0') when mode = M_CLR else sum;
  process (clk)
  begin
    if rising_edge(clk) then
      if cfg.wrap and nxt > MAXV then sum <= (others => '0') after T_CO;
      else sum <= nxt after T_CO; end if;
    end if;
  end process;
  hit <= sum = MAXV;
end architecture beh;
`,
    'sim/tb_acc.vhd': `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
use work.types.all;
entity tb_acc is end;
architecture t of tb_acc is
  signal clk : std_logic := '0';
  signal mode : mode_t := M_ADD;
  signal cfg : cfg_t := DEF_CFG;
  signal level : integer range 0 to 15 := 3;
  signal sum : unsigned(7 downto 0) := (others => '0');
  signal hit : boolean;
begin
  clk <= not clk after 5 ns;
  dut: entity work.acc port map (clk => clk, mode => mode, cfg => cfg, level => level, sum => sum, hit => hit);
  process begin
    wait for 100 ns; mode <= M_HOLD; wait for 30 ns; mode <= M_CLR; wait for 20 ns; mode <= M_ADD;
    cfg <= (step => "0111", wrap => true); wait for 300 ns; level <= 9; wait;
  end process;
end;
`,
  },
});

// Verilog: non-ANSI ports with separate reg declarations, signed arithmetic, `include, `ifdef inside,
// delays, (* attributes *), tri-state inout, reg init
add({
  name: 'verilog-classic', module: 'dp', file: 'src/dp.v', tb: 'tb_dp', until: 1e6,
  files: {
    'src/defs.vh': '`define INC 3\n',
    'src/dp.v': `\`include "defs.vh"
module dp(clk, a, b, oe, q, prod, bus, cmp);
  input clk;
  input signed [7:0] a, b;
  input oe;
  output [7:0] q;
  output signed [15:0] prod;
  inout [3:0] bus;
  output cmp;
  reg [7:0] q = 8'h05;
  reg signed [15:0] prod;
  (* keep = "true" *) wire [7:0] s;
  wire [3:0] low;
\`ifdef NEVER
  assign q = 0;
\`endif
  assign #1 s = a + \`INC;
  always @(posedge clk) begin
    q <= s;
    prod <= a * b;
  end
  assign bus = oe ? q[3:0] : 4'bz;
  assign low = bus;
  assign cmp = (a < b) & |low;
endmodule
`,
    'sim/tb_dp.v': `\`timescale 1ns/1ps
module tb_dp; reg clk = 0; reg signed [7:0] a = 0, b = 0; reg oe = 0; wire [7:0] q; wire signed [15:0] prod; wire [3:0] bus; wire cmp;
  dp dut(clk, a, b, oe, q, prod, bus, cmp);
  always #5 clk = ~clk;
  integer j;
  initial begin
    for (j = 0; j < 40; j = j + 1) begin a = j * 13 - 100; b = 50 - j * 7; oe = j[1]; #10; end
    $finish;
  end
endmodule
`,
  },
});

// Verilog: registers with an initial value in their declaration (an output port, an internal one,
// an ANSI output reg), integer with init
add({
  name: 'verilog-reg-init', module: 'ri', file: 'src/ri.v', tb: 'tb_ri', until: 1e6,
  files: {
    'src/ri.v': `module ri(input clk, input [3:0] d, output reg [3:0] q = 4'd7, output [3:0] p, output [3:0] o);
  reg [3:0] r = 4'd9, r2 = 4'd1;
  reg [3:0] o;
  integer n = 3;
  initial o = 4'd2;
  always @(posedge clk) begin q <= d; r <= q + n; r2 <= r; o <= r2; end
  assign p = r;
endmodule
`,
    'sim/tb_ri.v': `\`timescale 1ns/1ps
module tb_ri; reg clk = 0; reg [3:0] d = 0; wire [3:0] q, p, o;
  ri dut(clk, d, q, p, o);
  always #5 clk = ~clk;
  integer j;
  initial begin for (j = 0; j < 20; j = j + 1) begin d = j; #10; end $finish; end
endmodule
`,
  },
});

// Verilog: a parameterized module with generate-instantiated submodules and a 2-D wire array,
// function with integer loop, casez decoder, always @* mux
add({
  name: 'verilog-generate-inst', module: 'bank', file: 'src/bank.v', tb: 'tb_bank', until: 1e6,
  files: {
    'src/cell.v': `module cell #(parameter W = 4) (input clk, input en, input [W-1:0] d, output reg [W-1:0] q);
  always @(posedge clk) if (en) q <= d;
endmodule
`,
    'src/bank.v': `module bank #(parameter N = 4, parameter W = 4) (
  input clk,
  input [1:0] sel,
  input [W-1:0] d,
  output reg [W-1:0] y,
  output [2:0] ones
);
  wire [W-1:0] q [0:N-1];
  reg [N-1:0] en;
  function integer popcount(input [W-1:0] v);
    integer i;
    begin popcount = 0; for (i = 0; i < W; i = i + 1) popcount = popcount + v[i]; end
  endfunction
  always @* begin
    casez (sel)
      2'b00: en = 4'b0001;
      2'b01: en = 4'b0010;
      2'b1?: en = sel[0] ? 4'b1000 : 4'b0100;
      default: en = 0;
    endcase
  end
  genvar i;
  generate for (i = 0; i < N; i = i + 1) begin : c
    cell #(.W(W)) u (.clk(clk), .en(en[i]), .d(d), .q(q[i]));
  end endgenerate
  always @* y = q[sel];
  assign ones = popcount(y);
endmodule
`,
    'sim/tb_bank.v': `\`timescale 1ns/1ps
module tb_bank; reg clk = 0; reg [1:0] sel = 0; reg [3:0] d = 0; wire [3:0] y; wire [2:0] ones;
  bank dut(.clk(clk), .sel(sel), .d(d), .y(y), .ones(ones));
  always #5 clk = ~clk;
  integer j;
  initial begin for (j = 0; j < 40; j = j + 1) begin sel = j % 4; d = j * 5; #10; end $finish; end
endmodule
`,
  },
});

// VHDL: gate logic (drawn as gates) with a function in the architecture, a constant array (ROM),
// a process; names in mixed case
add({
  name: 'vhdl-rom-gates', module: 'romdec', file: 'src/romdec.vhd', tb: 'tb_romdec', until: 3e6,
  files: {
    'src/romdec.vhd': `library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity RomDec is
  Generic (N : integer := 4);
  Port ( A, B : in STD_LOGIC_VECTOR (N-1 downto 0);
         C : in STD_LOGIC;
         Y : out STD_LOGIC_VECTOR (N-1 downto 0);
         Z : out STD_LOGIC;
         Seg : out STD_LOGIC_VECTOR (6 downto 0);
         Cnt : out INTEGER range 0 to N);
end RomDec;

architecture Behavioral of RomDec is
  type rom_t is array (0 to 15) of std_logic_vector(6 downto 0);
  constant ROM : rom_t := ("1000000", "1111001", "0100100", "0110000", "0011001", "0010010", "0000010", "1111000",
                           "0000000", "0010000", "0001000", "0000011", "1000110", "0100001", "0000110", "0001110");
  signal T : STD_LOGIC_VECTOR (N-1 downto 0);
  function ones(v : std_logic_vector) return integer is
    variable n : integer := 0;
  begin
    for i in v'range loop if v(i) = '1' then n := n + 1; end if; end loop;
    return n;
  end function;
begin
  T <= (A and B) or (not A and B);  -- gates
  Y <= T xor B;
  Z <= C and A(0) and not B(1);
  Seg <= ROM(to_integer(unsigned(T)));
  count: process (T)
  begin
    Cnt <= ones(T);
  end process;
end Behavioral;
`,
    'sim/tb_romdec.vhd': `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity tb_romdec is end;
architecture t of tb_romdec is
  signal a, b, y : std_logic_vector(3 downto 0) := "0000";
  signal c, z : std_logic := '0';
  signal seg : std_logic_vector(6 downto 0);
  signal cnt : integer range 0 to 4;
begin
  dut: entity work.romdec port map (a, b, c, y, z, seg, cnt);
  process begin
    for i in 0 to 255 loop
      a <= std_logic_vector(to_unsigned(i mod 16, 4)); b <= std_logic_vector(to_unsigned(i / 16, 4));
      if i mod 3 = 0 then c <= '1'; else c <= '0'; end if;
      wait for 10 ns;
    end loop;
    wait;
  end process;
end;
`,
  },
});

// VHDL: instances whose outputs drive bits of vectors (#2901): a ripple-carry adder, the carries a vector not from
// 0 read by the next instance, the sum's bits an output port's
add({
  name: 'vhdl-inst-bits', module: 'add4', file: 'src/add4.vhd', tb: 'tb_add4', until: 3e6,
  files: {
    'src/fa.vhd': `library ieee;
use ieee.std_logic_1164.all;
entity fa is
  port (a, b, ci : in std_logic; s, co : out std_logic);
end fa;
architecture rtl of fa is
begin
  s <= a xor b xor ci;
  co <= (a and b) or (ci and (a xor b));
end rtl;
`,
    'src/add4.vhd': `library ieee;
use ieee.std_logic_1164.all;
entity add4 is
  port (a, b : in std_logic_vector(3 downto 0); ci : in std_logic;
        s : out std_logic_vector(3 downto 0); co : out std_logic);
end add4;
architecture st of add4 is
  component fa port (a, b, ci : in std_logic; s, co : out std_logic); end component;
  signal c : std_logic_vector(3 downto 1);
begin
  U0: fa port map (a => a(0), b => b(0), ci => ci,   s => s(0), co => c(1));
  U1: fa port map (a => a(1), b => b(1), ci => c(1), s => s(1), co => c(2));
  U2: fa port map (a => a(2), b => b(2), ci => c(2), s => s(2), co => c(3));
  U3: fa port map (a => a(3), b => b(3), ci => c(3), s => s(3), co => co);
end st;
`,
    'sim/tb_add4.vhd': `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity tb_add4 is end;
architecture t of tb_add4 is
  signal a, b, s : std_logic_vector(3 downto 0);
  signal ci, co : std_logic;
begin
  dut: entity work.add4 port map (a => a, b => b, ci => ci, s => s, co => co);
  process begin
    for i in 0 to 15 loop for j in 0 to 15 loop for k in 0 to 1 loop
      a <= std_logic_vector(to_unsigned(i, 4)); b <= std_logic_vector(to_unsigned(j, 4));
      ci <= '1' when k = 1 else '0';
      wait for 10 ns;
      assert unsigned(co & s) = to_unsigned(i + j + k, 5) report "sum" severity error;
    end loop; end loop; end loop;
    wait;
  end process;
end;
`,
  },
});

// Verilog: instances driving slices of two bits of an output port, and bits of a wire the next instance reads (#2901)
add({
  name: 'verilog-inst-slices', module: 'add4v', file: 'src/add4v.v', tb: 'tb_add4v', until: 1e6,
  files: {
    'src/add2.v': `module add2(input [1:0] a, input [1:0] b, input ci, output [1:0] s, output co);
  assign {co, s} = a + b + ci;
endmodule
`,
    'src/add4v.v': `module add4v(input [5:0] a, input [5:0] b, output [5:0] s, output co);
  wire [1:0] c;
  add2 lo(.a(a[1:0]), .b(b[1:0]), .ci(1'b0), .s(s[1:0]), .co(c[0]));
  add2 mid(.a(a[3:2]), .b(b[3:2]), .ci(c[0]), .s(s[3:2]), .co(c[1]));
  add2 hi(.a(a[5:4]), .b(b[5:4]), .ci(c[1]), .s(s[5:4]), .co(co));
endmodule
`,
    'sim/tb_add4v.v': `\`timescale 1ns/1ps
module tb_add4v; reg [5:0] a = 0, b = 0; wire [5:0] s; wire co;
  add4v dut(.a(a), .b(b), .s(s), .co(co));
  integer i, j;
  initial begin
    for (i = 0; i < 64; i = i + 7) for (j = 0; j < 64; j = j + 5) begin
      a = i; b = j; #10;
      if ({co, s} !== i + j) $display("sum %0d + %0d = %0d", i, j, {co, s});
    end
    $finish;
  end
endmodule
`,
  },
});

// VHDL: the bits of a port (0 to 3) driven by instances, joined in its order; and a vector driven so that an
// assignment reads: its instances stay one HDL block (#1715, #2901)
add({
  name: 'vhdl-inst-bits-to', module: 'bitsto', file: 'src/bitsto.vhd', tb: 'tb_bitsto', until: 1e6,
  files: {
    'src/inv2.vhd': `library ieee;
use ieee.std_logic_1164.all;
entity inv2 is
  port (a : in std_logic_vector(1 downto 0); y : out std_logic_vector(1 downto 0));
end inv2;
architecture rtl of inv2 is
begin
  y <= not a;
end rtl;
`,
    'src/bitsto.vhd': `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity bitsto is
  port (x : in std_logic_vector(3 downto 0);
        z : out std_logic_vector(0 to 3); w : out std_logic_vector(3 downto 0));
end bitsto;
architecture st of bitsto is
  component inv2 port (a : in std_logic_vector(1 downto 0); y : out std_logic_vector(1 downto 0)); end component;
  signal v : std_logic_vector(3 downto 0);
begin
  Z0: inv2 port map (a => x(3 downto 2), y => z(0 to 1));
  Z1: inv2 port map (a => x(1 downto 0), y => z(2 to 3));
  V0: inv2 port map (a => x(1 downto 0), y => v(1 downto 0));
  V1: inv2 port map (a => x(3 downto 2), y => v(3 downto 2));
  w <= v;
end st;
`,
    'sim/tb_bitsto.vhd': `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
entity tb_bitsto is end;
architecture t of tb_bitsto is
  signal x, w : std_logic_vector(3 downto 0);
  signal z : std_logic_vector(0 to 3);
begin
  dut: entity work.bitsto port map (x => x, z => z, w => w);
  process begin
    for i in 0 to 15 loop
      x <= std_logic_vector(to_unsigned(i, 4));
      wait for 10 ns;
      assert z = not x and w = not x report "z, w" severity error;
    end loop;
    wait;
  end process;
end;
`,
  },
});
