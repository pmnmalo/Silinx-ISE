-- multipliers with input registers and no output register: AREG and BREG (u0), BREG only (u1); every
-- product bit into a flip-flop
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;
entity top is
  port (clk : in std_logic; sw : in std_logic_vector(7 downto 0); btn : in std_logic_vector(3 downto 0);
        led : out std_logic_vector(7 downto 0));
end top;
architecture rtl of top is
  signal cv : unsigned(17 downto 0) := (others => '0');
  signal a, b : std_logic_vector(17 downto 0);
  signal p0, p1, q0, q1 : std_logic_vector(35 downto 0);
  signal zero18 : std_logic_vector(17 downto 0) := (others => '0');
  function xr (v : std_logic_vector) return std_logic is
    variable r : std_logic := '0';
  begin
    for i in v'range loop r := r xor v(i); end loop;
    return r;
  end function;
begin
  process (clk) begin
    if rising_edge(clk) then
      cv <= cv + unsigned(sw);
      q0 <= p0; q1 <= p1;
    end if;
  end process;
  a <= std_logic_vector(cv);
  b <= std_logic_vector(cv(8 downto 0) & cv(17 downto 9));
  u0 : MULT18X18SIO
    generic map (AREG => 1, BREG => 1, PREG => 0, B_INPUT => "DIRECT")
    port map (P => p0, A => a, B => b, BCIN => zero18, CEA => btn(0), CEB => btn(1), CEP => '0', CLK => clk,
              RSTA => btn(2), RSTB => btn(3), RSTP => '0', BCOUT => open);
  u1 : MULT18X18SIO
    generic map (AREG => 0, BREG => 1, PREG => 0, B_INPUT => "DIRECT")
    port map (P => p1, A => b, B => a, BCIN => zero18, CEA => '0', CEB => btn(1), CEP => '0', CLK => clk,
              RSTA => '0', RSTB => btn(3), RSTP => '0', BCOUT => open);
  led <= xr(q0(35 downto 30)) & xr(q0(29 downto 20)) & xr(q0(19 downto 10)) & xr(q0(9 downto 0))
       & xr(q1(35 downto 30)) & xr(q1(29 downto 20)) & xr(q1(19 downto 10)) & xr(q1(9 downto 0));
end rtl;
