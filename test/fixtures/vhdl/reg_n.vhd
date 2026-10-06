-- Generic N-bit register with synchronous load and asynchronous clear
library ieee;
use ieee.std_logic_1164.all;

entity reg_n is
  generic (
    N     : positive := 8;
    RESET_VALUE : std_logic_vector := x"00"
  );
  port (
    clk  : in  std_logic;
    clr  : in  std_logic;
    load : in  std_logic;
    d    : in  std_logic_vector(N-1 downto 0);
    q    : out std_logic_vector(N-1 downto 0)
  );
end entity reg_n;

architecture rtl of reg_n is
begin
  process (clk, clr)
  begin
    if clr = '1' then
      q <= (others => '0');
    elsif clk'event and clk = '1' then
      if load = '1' then
        q <= d;
      end if;
    end if;
  end process;
end architecture rtl;
