-- Shift registers mapped to SRL16 LUTs by XST:
--   dyn  : 16 deep x 4 bits, clock enable, dynamic tap (SRL16E, address = tap), initial contents
--   fix  : 20 deep x 1 bit, fixed delay (SRLC16E cascade / SRL16 + flip-flops)
--   fall : 8 deep x 2 bits on the falling clock edge (SRL16_1)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity top is
  port (clk  : in  std_logic;
        ce   : in  std_logic;
        d    : in  std_logic_vector(3 downto 0);
        tap  : in  std_logic_vector(3 downto 0);
        q    : out std_logic_vector(3 downto 0);
        q20  : out std_logic;
        qf   : out std_logic_vector(1 downto 0));
end top;

architecture rtl of top is
  type sr4_t is array (0 to 15) of std_logic_vector(3 downto 0);
  signal dyn  : sr4_t := (0 => X"1", 1 => X"2", 2 => X"4", 3 => X"8", 5 => X"F", 9 => X"A", others => X"0");
  signal fix  : std_logic_vector(19 downto 0) := X"8421F";
  signal f0, f1 : std_logic_vector(7 downto 0) := X"00";
  signal dr   : std_logic_vector(1 downto 0) := "00";
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if ce = '1' then
        for i in 15 downto 1 loop
          dyn(i) <= dyn(i - 1);
        end loop;
        dyn(0) <= d;
      end if;
      fix <= fix(18 downto 0) & d(0);
      dr <= d(3 downto 2);
    end if;
  end process;
  q   <= dyn(to_integer(unsigned(tap)));
  q20 <= fix(19);

  process (clk)
  begin
    if falling_edge(clk) then
      f0 <= f0(6 downto 0) & dr(0);
      f1 <= f1(6 downto 0) & dr(1);
    end if;
  end process;
  qf <= f1(7) & f0(7);
end rtl;
