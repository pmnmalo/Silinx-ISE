-- The reference of the counter4 exercise (hidden: never given to the students).
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
  signal count : unsigned(3 downto 0) := (others => '0');
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if rst = '1' then
        count <= (others => '0');
      elsif en = '1' then
        count <= count + 1;
      end if;
    end if;
  end process;
  q <= std_logic_vector(count);
end architecture rtl;
