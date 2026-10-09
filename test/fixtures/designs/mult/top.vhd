-- Multipliers mapped to the Spartan-3E MULT18X18SIO blocks:
--   ps : signed 12 x 10, input registers and output register with clock enable (AREG/BREG/PREG)
--   pu : unsigned 8 x 8, combinational
--   pf : signed 18 x 18, output register with synchronous reset
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity top is
  port (clk : in  std_logic;
        ce  : in  std_logic;
        rst : in  std_logic;
        a   : in  std_logic_vector(17 downto 0);
        b   : in  std_logic_vector(17 downto 0);
        ps  : out std_logic_vector(21 downto 0);
        pu  : out std_logic_vector(15 downto 0);
        pf  : out std_logic_vector(35 downto 0));
end top;

architecture rtl of top is
  signal ar : signed(11 downto 0) := (others => '0');
  signal br : signed(9 downto 0) := (others => '0');
  signal pr : signed(21 downto 0) := (others => '0');
  signal fr : signed(35 downto 0) := (others => '0');
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if ce = '1' then
        ar <= signed(a(11 downto 0));
        br <= signed(b(9 downto 0));
        pr <= ar * br;
      end if;
      if rst = '1' then
        fr <= (others => '0');
      else
        fr <= signed(a) * signed(b);
      end if;
    end if;
  end process;
  ps <= std_logic_vector(pr);
  pu <= std_logic_vector(unsigned(a(7 downto 0)) * unsigned(b(7 downto 0)));
  pf <= std_logic_vector(fr);
end rtl;
