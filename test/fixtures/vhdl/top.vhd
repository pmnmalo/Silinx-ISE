-- Top level: a counter feeding a bank of registers built with for-generate
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
use work.util_pkg.all;

entity top is
  port (
    clk    : in  std_logic;
    btn    : in  std_logic_vector(3 downto 0);
    sw     : in  std_logic_vector(3 downto 0);
    led    : out std_logic_vector(7 downto 0)
  );
end top;

architecture structural of top is
  component counter is
    generic (WIDTH : integer := 8);
    port (
      clk, rst, en : in  std_logic;
      q            : out std_logic_vector(WIDTH-1 downto 0)
    );
  end component;

  signal count : std_logic_vector(7 downto 0);
  type bank_t is array (0 to 3) of std_logic_vector(7 downto 0);
  signal bank  : bank_t;
  signal rst   : std_logic;
begin
  rst <= btn(0);

  u_cnt : counter
    generic map (WIDTH => 8)
    port map (
      clk => clk,
      rst => rst,
      en  => '1',
      q   => count
    );

  gen_regs : for i in 0 to 3 generate
    u_reg : entity work.reg_n(rtl)
      generic map (N => 8)
      port map (clk, rst, sw(i), count, bank(i));
  end generate gen_regs;

  led <= bank(to_integer(unsigned(btn(3 downto 2)))) when btn(1) = '0'
         else count;
end structural;
