-- 8-bit up counter with asynchronous reset and clock enable
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity Counter is
  generic (WIDTH : integer := 8);
  port (
    clk, rst : in  std_logic;
    en       : in  std_logic;
    q        : out std_logic_vector(WIDTH-1 downto 0)
  );
end entity Counter;

architecture Behavioral of Counter is
  signal cnt : unsigned(WIDTH-1 downto 0) := (others => '0');
begin
  process (clk, rst)
  begin
    if rst = '1' then
      cnt <= (others => '0');
    elsif rising_edge(clk) then
      if en = '1' then
        cnt <= cnt + 1;
      end if;
    end if;
  end process;

  q <= std_logic_vector(cnt);
end architecture Behavioral;
