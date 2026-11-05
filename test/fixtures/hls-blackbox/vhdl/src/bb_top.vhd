-- An HLS module with an RTL blackbox on a board (#2341): mac (mac.cpp, its HDL generated in VHDL) calls adder_rtl, a
-- Verilog module; the switches added to the last result (the larger of the sum, modulo 256, and the switches), on the LEDs.
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity bb_top is
  port ( clk : in  std_logic;
         sw  : in  std_logic_vector(7 downto 0);
         led : out std_logic_vector(7 downto 0) );
end bb_top;

architecture rtl of bb_top is
  signal boot   : unsigned(1 downto 0) := "00";
  signal rst    : std_logic;
  signal a      : std_logic_vector(7 downto 0) := (others => '0');
  signal s      : std_logic_vector(7 downto 0);
  signal s_vld  : std_logic;
  signal done, idle, ready : std_logic;
  signal start  : std_logic := '0';
  signal result : std_logic_vector(7 downto 0) := (others => '0');
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if boot /= "11" then boot <= boot + 1; end if;
      a <= sw;
      start <= idle;                      -- a call started each time the module is idle
      if s_vld = '1' and done = '1' and ready = '1' then result <= s; end if;
    end if;
  end process;
  rst <= '1' when boot /= "11" else '0';

  hls: entity work.mac
    port map ( ap_clk => clk, ap_rst => rst, ap_start => start, ap_done => done, ap_idle => idle, ap_ready => ready,
               a => a, b => result, s => s, s_ap_vld => s_vld );

  led <= result;
end rtl;
