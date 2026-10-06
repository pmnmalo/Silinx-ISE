-- Utility package: constants, a subtype and functions
library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;

package util_pkg is
  constant DATA_WIDTH : natural := 8;
  constant CLK_FREQ   : integer := 50_000_000;
  constant ALL_ONES   : std_logic_vector(DATA_WIDTH-1 downto 0) := (others => '1');
  subtype byte_t is std_logic_vector(7 downto 0);
  function parity(v : std_logic_vector) return std_logic;
  function max(a, b : integer) return integer;
end package util_pkg;

package body util_pkg is
  function parity(v : std_logic_vector) return std_logic is
    variable p : std_logic := '0';
  begin
    for i in v'range loop
      p := p xor v(i);
    end loop;
    return p;
  end function parity;

  function max(a, b : integer) return integer is
  begin
    if a > b then
      return a;
    else
      return b;
    end if;
  end function;
end package body util_pkg;
