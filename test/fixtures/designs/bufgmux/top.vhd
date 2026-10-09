-- Clock switching with a BUFGMUX: sel chooses clka (sel = '0') or clkb (sel = '1') for a counter;
-- a second counter runs on clka through a plain BUFG.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clka : in  std_logic;
        clkb : in  std_logic;
        sel  : in  std_logic;
        cm   : out std_logic_vector(7 downto 0);
        ca   : out std_logic_vector(7 downto 0));
end top;

architecture rtl of top is
  signal clkm : std_logic;
  signal nm, na : unsigned(7 downto 0) := (others => '0');
begin
  u_mux : BUFGMUX port map (I0 => clka, I1 => clkb, S => sel, O => clkm);

  process (clkm)
  begin
    if rising_edge(clkm) then
      nm <= nm + 1;
    end if;
  end process;

  process (clka)
  begin
    if rising_edge(clka) then
      na <= na + 5;
    end if;
  end process;

  cm <= std_logic_vector(nm);
  ca <= std_logic_vector(na);
end rtl;
