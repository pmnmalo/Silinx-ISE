-- Single-port block RAMs inferred by XST: three write modes and three widths.
--   ram_wf : 1024 x 8,  WRITE_FIRST (the written word appears on the output)
--   ram_rf :  512 x 16, READ_FIRST  (the old word appears on the output), initial contents
--   ram_nc : 4096 x 4,  NO_CHANGE   (the output holds while writing)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity top is
  port (clk   : in  std_logic;
        en    : in  std_logic;
        we    : in  std_logic_vector(2 downto 0);
        addr  : in  std_logic_vector(11 downto 0);
        di    : in  std_logic_vector(15 downto 0);
        do_wf : out std_logic_vector(7 downto 0);
        do_rf : out std_logic_vector(15 downto 0);
        do_nc : out std_logic_vector(3 downto 0));
end top;

architecture rtl of top is
  type ram8_t  is array (0 to 1023) of std_logic_vector(7 downto 0);
  type ram16_t is array (0 to 511) of std_logic_vector(15 downto 0);
  type ram4_t  is array (0 to 4095) of std_logic_vector(3 downto 0);

  function init16 return ram16_t is
    variable r : ram16_t;
  begin
    for i in 0 to 511 loop
      r(i) := std_logic_vector(to_unsigned((i * 37 + 5) mod 65536, 16));
    end loop;
    return r;
  end function;

  signal ram_wf : ram8_t := (others => (others => '0'));
  signal ram_rf : ram16_t := init16;
  signal ram_nc : ram4_t := (others => (others => '0'));
  attribute ram_style : string;
  attribute ram_style of ram_wf : signal is "block";
  attribute ram_style of ram_rf : signal is "block";
  attribute ram_style of ram_nc : signal is "block";

  signal q_wf : std_logic_vector(7 downto 0) := (others => '0');
  signal q_rf : std_logic_vector(15 downto 0) := X"1234";
  signal q_nc : std_logic_vector(3 downto 0) := (others => '0');
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if en = '1' then
        if we(0) = '1' then
          ram_wf(to_integer(unsigned(addr(9 downto 0)))) <= di(7 downto 0);
          q_wf <= di(7 downto 0);
        else
          q_wf <= ram_wf(to_integer(unsigned(addr(9 downto 0))));
        end if;
      end if;
    end if;
  end process;

  process (clk)
  begin
    if rising_edge(clk) then
      if en = '1' then
        if we(1) = '1' then
          ram_rf(to_integer(unsigned(addr(8 downto 0)))) <= di;
        end if;
        q_rf <= ram_rf(to_integer(unsigned(addr(8 downto 0))));
      end if;
    end if;
  end process;

  process (clk)
  begin
    if rising_edge(clk) then
      if en = '1' then
        if we(2) = '1' then
          ram_nc(to_integer(unsigned(addr))) <= di(3 downto 0);
        else
          q_nc <= ram_nc(to_integer(unsigned(addr)));
        end if;
      end if;
    end if;
  end process;

  do_wf <= q_wf;
  do_rf <= q_rf;
  do_nc <= q_nc;
end rtl;
