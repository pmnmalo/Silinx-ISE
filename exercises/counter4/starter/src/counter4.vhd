-- counter4: a 4-bit counter with a synchronous reset and an enable (the exercise's statement says what it does).
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

entity counter4 is
  port (
    clk : in  std_logic;
    rst : in  std_logic;
    en  : in  std_logic;
    q   : out std_logic_vector(3 downto 0)
  );
end entity counter4;

architecture rtl of counter4 is
begin
  q <= (others => '0');   -- your design here
end architecture rtl;
