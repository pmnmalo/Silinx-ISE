-- Silinx design corpus: light8080's mcu80 with the 'hello' program of its repository (the program
-- the repository's own testbench runs), as a top level with no generic of an array type.
-- Part of Silinx (AGPL-3.0-only); mcu80 and obj_code_pkg are fetched, never committed.
library ieee;
use ieee.std_logic_1164.all;
use work.obj_code_pkg.all;

entity mcu80_hello is
  port (
    clk      : in  std_logic;
    reset    : in  std_logic;
    p1_i     : in  std_logic_vector(7 downto 0);
    p2_o     : out std_logic_vector(7 downto 0);
    rxd_i    : in  std_logic;
    txd_o    : out std_logic;
    extint_i : in  std_logic_vector(3 downto 0)
  );
end entity;

architecture rtl of mcu80_hello is
begin
  mcu : entity work.mcu80
    generic map (OBJ_CODE => object_code, UART_IRQ_LINE => 3, CLOCK_FREQ => 50000000)
    port map (p1_i => p1_i, p2_o => p2_o, rxd_i => rxd_i, txd_o => txd_o, extint_i => extint_i, clk => clk, reset => reset);
end architecture;
