-- Distributed (LUT) RAMs inferred by XST:
--   r16 : 16 x 8 single port, asynchronous read            (RAM16X1S)
--   r32 : 32 x 4 dual port, asynchronous reads             (RAM16X1D + muxes)
--   r64 : 64 x 2 single port, registered read, initialised (RAM64X1S)
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;

entity top is
  port (clk  : in  std_logic;
        we   : in  std_logic_vector(2 downto 0);
        a    : in  std_logic_vector(5 downto 0);
        dpra : in  std_logic_vector(4 downto 0);
        di   : in  std_logic_vector(7 downto 0);
        o16  : out std_logic_vector(7 downto 0);
        spo  : out std_logic_vector(3 downto 0);
        dpo  : out std_logic_vector(3 downto 0);
        o64  : out std_logic_vector(1 downto 0));
end top;

architecture rtl of top is
  type r16_t is array (0 to 15) of std_logic_vector(7 downto 0);
  type r32_t is array (0 to 31) of std_logic_vector(3 downto 0);
  type r64_t is array (0 to 63) of std_logic_vector(1 downto 0);

  function init64 return r64_t is
    variable r : r64_t;
  begin
    for i in 0 to 63 loop r(i) := std_logic_vector(to_unsigned(i mod 3, 2)); end loop;
    return r;
  end function;

  signal r16 : r16_t := (others => X"00");
  signal r32 : r32_t := (others => X"0");
  signal r64 : r64_t := init64;
  attribute ram_style : string;
  attribute ram_style of r16 : signal is "distributed";
  attribute ram_style of r32 : signal is "distributed";
  attribute ram_style of r64 : signal is "distributed";
  signal q64 : std_logic_vector(1 downto 0) := "00";
begin
  process (clk)
  begin
    if rising_edge(clk) then
      if we(0) = '1' then r16(to_integer(unsigned(a(3 downto 0)))) <= di; end if;
      if we(1) = '1' then r32(to_integer(unsigned(a(4 downto 0)))) <= di(7 downto 4); end if;
      if we(2) = '1' then r64(to_integer(unsigned(a))) <= di(1 downto 0); end if;
      q64 <= r64(to_integer(unsigned(a)));
    end if;
  end process;
  o16 <= r16(to_integer(unsigned(a(3 downto 0))));
  spo <= r32(to_integer(unsigned(a(4 downto 0))));
  dpo <= r32(to_integer(unsigned(dpra)));
  o64 <= q64;
end rtl;
