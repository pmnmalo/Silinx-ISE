-- Test harness for the tri-state design (simulation only, not synthesized): an external device
-- drives the bus with ext_val whenever the design does not drive it (oe = '0');
-- bus_o shows the resolved value of the bus.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity harness is
  port (clk     : in  std_logic;
        oe      : in  std_logic;
        oe2     : in  std_logic;
        dout    : in  std_logic_vector(7 downto 0);
        ext_val : in  std_logic_vector(7 downto 0);
        bus_o   : out std_logic_vector(7 downto 0);
        din_r   : out std_logic_vector(7 downto 0);
        z       : out std_logic_vector(3 downto 0));
end harness;

architecture sim of harness is
  signal bus_s : std_logic_vector(7 downto 0);
begin
  bus_s <= ext_val when oe = '0' else (others => 'Z');
  dut : entity work.top port map (clk => clk, oe => oe, oe2 => oe2, dout => dout, io => bus_s, din_r => din_r, z => z);
  bus_o <= bus_s;
end sim;
