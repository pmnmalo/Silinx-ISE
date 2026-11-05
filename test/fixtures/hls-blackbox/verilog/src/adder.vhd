-- the RTL blackbox of mac.cpp (adder.json): a + b, a clock cycle after ap_start
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity adder_rtl is
  port ( ap_clk, ap_rst, ap_start : in std_logic;
         a, b : in std_logic_vector(7 downto 0);
         ap_done, z_ap_vld : out std_logic;
         z : out std_logic_vector(7 downto 0) );
end adder_rtl;

architecture rtl of adder_rtl is
begin
  process (ap_clk)
  begin
    if rising_edge(ap_clk) then
      if ap_rst = '1' then
        ap_done <= '0'; z_ap_vld <= '0'; z <= (others => '0');
      else
        ap_done <= ap_start; z_ap_vld <= ap_start; z <= std_logic_vector(unsigned(a) + unsigned(b));
      end if;
    end if;
  end process;
end rtl;
