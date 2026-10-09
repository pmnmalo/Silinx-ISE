-- Tri-state I/O: an 8-bit bidirectional bus (IOBUF) driven when oe = '1' and captured into a register
-- on every clock, and a 4-bit tri-state output (OBUFT) enabled by a registered enable.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;

entity top is
  port (clk   : in    std_logic;
        oe    : in    std_logic;
        oe2   : in    std_logic;
        dout  : in    std_logic_vector(7 downto 0);
        io    : inout std_logic_vector(7 downto 0);
        din_r : out   std_logic_vector(7 downto 0);
        z     : out   std_logic_vector(3 downto 0));
end top;

architecture rtl of top is
  signal cap  : std_logic_vector(7 downto 0) := X"00";
  signal oe_r : std_logic := '0';
begin
  io <= dout when oe = '1' else (others => 'Z');
  process (clk)
  begin
    if rising_edge(clk) then
      cap  <= io;
      oe_r <= oe2;
    end if;
  end process;
  din_r <= cap;
  z <= (dout(3 downto 0) xor dout(7 downto 4)) when oe_r = '1' else "ZZZZ";
end rtl;
