-- Open-flow board test (Basys2-250, #671): registers in the IOBs of the left and right pads clocked from each of the
-- eight global lines. The 50 MHz clock (B8) on a global buffer clocks a 27-bit counter; its bits 20 to 26 are seven
-- more clocks, each on a global buffer: with B8's, the eight top and bottom buffers, one line each. Clocks 0-5 take in
-- sw(1), sw(2), sw(4)-sw(6), btn(0) through IOB registers (LD0-LD5 show them); clocks 7, 3, 5, 6, 5 drive LD7 and the
-- displays' anodes AN0-AN3 through IOB registers (the anodes light the digits by the counter's bits). AN1 and AN3 (J12,
-- K14) share an I/O tile, whose two IOBs share each clock wire (IOIS_CLK1 -> OTCLK10 / OTCLK11): one clock for both.
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk : in  std_logic;
        sw  : in  std_logic_vector(7 downto 0);
        btn : in  std_logic_vector(3 downto 0);
        led : out std_logic_vector(7 downto 0);
        an  : out std_logic_vector(3 downto 0));
end top;

architecture rtl of top is
  signal ck, ck_b : std_logic_vector(7 downto 0);
  signal base : unsigned(26 downto 0) := (others => '0');
  -- the pads' input registers and output registers
  signal d, r : std_logic_vector(5 downto 0) := (others => '0');
  signal q : std_logic_vector(4 downto 0) := (others => '0');
  type clocks is array (0 to 4) of natural;
  constant OUT_CLK : clocks := (7, 3, 5, 6, 5);
begin
  u_bin : BUFG port map (I => clk, O => ck_b(0));
  process (ck_b(0)) begin if rising_edge(ck_b(0)) then base <= base + 1; end if; end process;
  gen_ck : for k in 1 to 7 generate
    ck(k) <= base(19 + k);
    u_b : BUFG port map (I => ck(k), O => ck_b(k));
  end generate;
  d <= btn(0) & sw(6 downto 4) & sw(2 downto 1);
  gen_in : for k in 0 to 5 generate
    process (ck_b(k)) begin if rising_edge(ck_b(k)) then r(k) <= d(k); end if; end process;
  end generate;
  gen_out : for k in 0 to 4 generate
    process (ck_b(OUT_CLK(k))) begin if rising_edge(ck_b(OUT_CLK(k))) then q(k) <= base(k + 21) xor r(k); end if; end process;
  end generate;
  led(5 downto 0) <= r;
  led(6) <= base(26);
  led(7) <= q(0);
  an <= q(4 downto 1);
end rtl;
