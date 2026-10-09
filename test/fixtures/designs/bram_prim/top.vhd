-- Block RAM primitives instantiated directly (UNISIM):
--   u_asym : RAMB16_S9_S36, 2048 x 9 on port A (WRITE_FIRST), 512 x 36 on port B (READ_FIRST),
--            INIT_00 / INITP_00 contents, INIT and SRVAL on both ports
--   u_s18  : RAMB16_S18, 1024 x 18, NO_CHANGE, SRVAL
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity top is
  port (clk    : in  std_logic;
        en_a   : in  std_logic;
        we_a   : in  std_logic;
        ssr_a  : in  std_logic;
        addr_a : in  std_logic_vector(10 downto 0);
        di_a   : in  std_logic_vector(7 downto 0);
        dip_a  : in  std_logic;
        en_b   : in  std_logic;
        we_b   : in  std_logic;
        ssr_b  : in  std_logic;
        addr_b : in  std_logic_vector(8 downto 0);
        do_a   : out std_logic_vector(7 downto 0);
        dop_a  : out std_logic;
        do_b   : out std_logic_vector(31 downto 0);
        dop_b  : out std_logic_vector(3 downto 0);
        do_c   : out std_logic_vector(15 downto 0);
        dop_c  : out std_logic_vector(1 downto 0));
end top;

architecture rtl of top is
  signal di_b  : std_logic_vector(31 downto 0);
  signal dip_b : std_logic_vector(3 downto 0);
  signal di_c  : std_logic_vector(15 downto 0);
begin
  di_b  <= di_a & not di_a & di_a(3 downto 0) & di_a(7 downto 4) & (di_a xor X"5A");
  dip_b <= dip_a & not dip_a & dip_a & dip_a;
  di_c  <= di_a & not di_a;

  u_asym : RAMB16_S9_S36
    generic map (
      INIT_A => "1" & X"A5", SRVAL_A => "0" & X"3C",
      INIT_B => X"F" & X"01234567", SRVAL_B => X"9" & X"89ABCDEF",
      WRITE_MODE_A => "WRITE_FIRST", WRITE_MODE_B => "READ_FIRST",
      INIT_00 => X"00112233445566778899AABBCCDDEEFF0F1E2D3C4B5A69788796A5B4C3D2E1F0",
      INIT_01 => X"DEADBEEFCAFEBABE0123456789ABCDEFFEDCBA9876543210A5A5A5A55A5A5A5A",
      INITP_00 => X"000000000000000000000000000000000000000000000000F0F0F0F0A5A5C3C3")
    port map (
      DOA => do_a, DOPA(0) => dop_a, ADDRA => addr_a, CLKA => clk, DIA => di_a, DIPA(0) => dip_a,
      ENA => en_a, SSRA => ssr_a, WEA => we_a,
      DOB => do_b, DOPB => dop_b, ADDRB => addr_b, CLKB => clk, DIB => di_b, DIPB => dip_b,
      ENB => en_b, SSRB => ssr_b, WEB => we_b);

  u_s18 : RAMB16_S18
    generic map (
      INIT => "00" & X"0F0F", SRVAL => "11" & X"8001", WRITE_MODE => "NO_CHANGE",
      INIT_00 => X"FFFFEEEEDDDDCCCCBBBBAAAA9999888877776666555544443333222211110000",
      INITP_00 => X"000000000000000000000000000000000000000000000000000000001B1B1B1B")
    port map (
      DO => do_c, DOP => dop_c, ADDR => addr_a(9 downto 0), CLK => clk, DI => di_c, DIP => "10",
      EN => en_b, SSR => ssr_a, WE => we_a);
end rtl;
