-- Board test (#96, #671): plain registers in the IOBs (no clock enable, no set / reset: the kind the open synthesis
-- writes most, measured on every pad since #96's second round) and tristate outputs, on pads of the four sides (their
-- clocks from the global lines through the I/O columns' clock rows, #671). sw(6:0) and btn(3:0) through input
-- registers (sw(7)'s in a slice: N3's is not measured); led(3:0), led(7:6) and an(3:0) from output registers (each a
-- register XOR a counter bit: the LEDs blink at 0.7, 1.3, 2.7, 5.4 s; the displays' digits light by the buttons);
-- led(4) a tristate output whose enable comes from the fabric (sw(0) = 1 releases the pad, the LED off), led(5) one
-- whose value and enable come from registers in the IOB (sw(1) = 1 releases it).
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity top is
  port (clk : in std_logic;
        sw  : in std_logic_vector(7 downto 0);
        btn : in std_logic_vector(3 downto 0);
        led : out std_logic_vector(7 downto 0);
        an  : out std_logic_vector(3 downto 0));
end top;

architecture rtl of top is
  signal r : std_logic_vector(7 downto 0) := (others => '0');
  signal b, o, a : std_logic_vector(3 downto 0) := (others => '0');
  signal o2 : std_logic_vector(1 downto 0) := (others => '0');
  signal cnt : unsigned(27 downto 0) := (others => '0');
  signal d5, oe5 : std_logic := '0';
begin
  process (clk) begin
    if rising_edge(clk) then
      r <= sw;
      b <= btn;
      cnt <= cnt + 1;
      o <= r(3 downto 0) xor std_logic_vector(cnt(27 downto 24));
      o2 <= r(7 downto 6) xor r(5 downto 4);
      a <= not b;
      d5 <= cnt(25);
      oe5 <= r(1);
    end if;
  end process;
  led(3 downto 0) <= o;
  led(7 downto 6) <= o2;
  an <= a;
  led(4) <= std_logic(cnt(24)) when r(0) = '0' else 'Z';
  led(5) <= d5 when oe5 = '0' else 'Z';
end rtl;
