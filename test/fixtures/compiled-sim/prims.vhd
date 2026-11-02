-- Silinx test design (compiled simulator, #429): Xilinx primitives instantiated in VHDL: block RAMs of
-- mixed port widths and every WRITE_MODE (INIT_xx, INITP_xx, INIT, SRVAL), on a few words so that the
-- ports meet; the multipliers (MULT18X18, MULT18X18S, MULT18X18SIO with and without registers, a cascade),
-- shift registers (SRL16, SRL16E, SRLC16, SRLC16E_1), distributed RAMs (RAM16X1S, RAM32X1S_1, RAM16X1D, RAM64X1D);
-- a counter on a BUFGCE_1 and one on a BUFGMUX_1 between the clock and an input (on their falling edges: a
-- clock high at the start rises at time 0 in the event-driven simulator, not on the FPGA).
library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
use IEEE.NUMERIC_STD.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;

entity prims_vhd is
  port (clk, en, we, ssr, en2, we2, ssr2, ce : in std_logic;
        a     : in  std_logic_vector(5 downto 0);
        b     : in  std_logic_vector(5 downto 0);
        di    : in  std_logic_vector(35 downto 0);
        m     : in  std_logic_vector(17 downto 0);
        q1a   : out std_logic_vector(0 downto 0);
        q1b   : out std_logic_vector(3 downto 0);
        q2a   : out std_logic_vector(1 downto 0);
        q2b   : out std_logic_vector(17 downto 0);
        q3    : out std_logic_vector(35 downto 0);
        q4    : out std_logic_vector(3 downto 0);
        q5    : out std_logic_vector(8 downto 0);
        q6a   : out std_logic_vector(17 downto 0);
        q6b   : out std_logic_vector(35 downto 0);
        p0, p1, p2, p3, p4 : out std_logic_vector(35 downto 0);
        bc    : out std_logic_vector(17 downto 0);
        s     : out std_logic_vector(4 downto 0);
        r     : out std_logic_vector(5 downto 0);
        nce, nmux : out unsigned(3 downto 0));
end prims_vhd;

architecture rtl of prims_vhd is
  signal sq15, gclk, mclk : std_logic;
  signal cg, cm : unsigned(3 downto 0) := (others => '0');
  signal bcout : std_logic_vector(17 downto 0);
  -- the block RAMs' addresses (VHDL-93: a port's actual is a signal, not a concatenation, #2565)
  signal r1_addra : std_logic_vector(13 downto 0);
  signal r1_addrb : std_logic_vector(11 downto 0);
  signal r2_addra : std_logic_vector(12 downto 0);
  signal r2_addrb : std_logic_vector(9 downto 0);
  signal r3_addr : std_logic_vector(8 downto 0);
  signal r4_addr : std_logic_vector(11 downto 0);
  signal r5_addr : std_logic_vector(10 downto 0);
  signal r6_addra : std_logic_vector(9 downto 0);
  signal r6_addrb : std_logic_vector(8 downto 0);
begin
  r1_addra <= "00000000" & a;
  r1_addrb <= "000000000" & b(2 downto 0);
  r2_addra <= "0000000" & a;
  r2_addrb <= "0000000" & b(2 downto 0);
  r3_addr <= "000000" & a(2 downto 0);
  r4_addr <= "000000" & a;
  r5_addr <= "00000" & a;
  r6_addra <= "0000" & a;
  r6_addrb <= "000" & b;
  -- 1 bit / 4 bits: READ_FIRST / WRITE_FIRST
  r1 : RAMB16_S1_S4
    generic map (WRITE_MODE_A => "READ_FIRST", WRITE_MODE_B => "WRITE_FIRST", INIT_A => "1", SRVAL_A => "0", INIT_B => X"A", SRVAL_B => X"5",
                 INIT_00 => X"0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF")
    port map (DOA => q1a, ADDRA => r1_addra, CLKA => clk, DIA => di(0 downto 0), ENA => en, SSRA => ssr, WEA => we,
              DOB => q1b, ADDRB => r1_addrb, CLKB => clk, DIB => di(7 downto 4), ENB => en2, SSRB => ssr2, WEB => we2);
  -- 2 bits / 18 bits: NO_CHANGE / READ_FIRST, parity on B only
  r2 : RAMB16_S2_S18
    generic map (WRITE_MODE_A => "NO_CHANGE", WRITE_MODE_B => "READ_FIRST", INIT_B => "10" & X"1234", SRVAL_B => "01" & X"FEDC",
                 INIT_00 => X"FFEEDDCCBBAA99887766554433221100FFEEDDCCBBAA99887766554433221100",
                 INITP_00 => X"00000000000000000000000000000000000000000000000000000000C3C3A5A5")
    port map (DOA => q2a, ADDRA => r2_addra, CLKA => clk, DIA => di(1 downto 0), ENA => en, SSRA => ssr, WEA => we,
              DOB => q2b(15 downto 0), DOPB => q2b(17 downto 16), ADDRB => r2_addrb, CLKB => clk, DIB => di(15 downto 0), DIPB => di(17 downto 16),
              ENB => en2, SSRB => ssr2, WEB => we2);
  -- 36 bits, single port, READ_FIRST
  r3 : RAMB16_S36
    generic map (WRITE_MODE => "READ_FIRST", INIT => X"F" & X"0000FFFF", SRVAL => X"6" & X"12345678",
                 INIT_00 => X"89ABCDEF0123456789ABCDEF0123456789ABCDEF0123456789ABCDEF01234567",
                 INITP_00 => X"000000000000000000000000000000000000000000000000000000000000ABCD")
    port map (DO => q3(31 downto 0), DOP => q3(35 downto 32), ADDR => r3_addr, CLK => clk, DI => di(31 downto 0), DIP => di(35 downto 32),
              EN => en, SSR => ssr, WE => we);
  -- 4 bits, single port, NO_CHANGE
  r4 : RAMB16_S4
    generic map (WRITE_MODE => "NO_CHANGE", INIT => X"7", SRVAL => X"C")
    port map (DO => q4, ADDR => r4_addr, CLK => clk, DI => di(3 downto 0), EN => en2, SSR => ssr, WE => we);
  -- 9 bits, single port, WRITE_FIRST (the default)
  r5 : RAMB16_S9
    generic map (INITP_00 => X"00000000000000000000000000000000000000000000000000000000000000F0",
                 INIT_00 => X"FFEEDDCCBBAA99887766554433221100FFEEDDCCBBAA99887766554433221100")
    port map (DO => q5(7 downto 0), DOP => q5(8 downto 8), ADDR => r5_addr, CLK => clk, DI => di(7 downto 0), DIP => di(8 downto 8),
              EN => en, SSR => ssr2, WE => we);
  -- 18 / 36 bits, dual port, both WRITE_FIRST
  r6 : RAMB16_S18_S36
    generic map (SRVAL_A => "11" & X"0F0F", INIT_B => X"5" & X"55555555")
    port map (DOA => q6a(15 downto 0), DOPA => q6a(17 downto 16), ADDRA => r6_addra, CLKA => clk, DIA => di(15 downto 0), DIPA => di(17 downto 16),
              ENA => en, SSRA => ssr, WEA => we,
              DOB => q6b(31 downto 0), DOPB => q6b(35 downto 32), ADDRB => r6_addrb, CLKB => clk, DIB => di(35 downto 4), DIPB => di(3 downto 0),
              ENB => en2, SSRB => ssr2, WEB => we2);

  u0 : MULT18X18 port map (A => m, B => di(17 downto 0), P => p0);
  u1 : MULT18X18S port map (A => m, B => di(35 downto 18), C => clk, CE => ce, R => ssr, P => p1);
  u2 : MULT18X18SIO generic map (AREG => 0, BREG => 1, PREG => 1)
    port map (A => m, B => di(17 downto 0), BCIN => (others => '0'), CEA => ce, CEB => en, CEP => en2, CLK => clk,
              RSTA => ssr, RSTB => ssr2, RSTP => ssr, BCOUT => bcout, P => p2);
  u3 : MULT18X18SIO generic map (AREG => 1, BREG => 0, PREG => 0, B_INPUT => "CASCADE")
    port map (A => di(35 downto 18), B => (others => '0'), BCIN => bcout, CEA => ce, CEB => '1', CEP => '1', CLK => clk,
              RSTA => ssr2, RSTB => '0', RSTP => '0', BCOUT => bc, P => p3);
  u4 : MULT18X18SIO
    port map (A => m, B => di(35 downto 18), BCIN => (others => '0'), CEA => en, CEB => en2, CEP => ce, CLK => clk,
              RSTA => '0', RSTB => '0', RSTP => ssr2, BCOUT => open, P => p4);

  s0 : SRL16 generic map (INIT => X"A5A5") port map (A0 => a(0), A1 => a(1), A2 => a(2), A3 => a(3), CLK => clk, D => di(0), Q => s(0));
  s1 : SRL16E generic map (INIT => X"00FF") port map (A0 => b(0), A1 => b(1), A2 => b(2), A3 => b(3), CE => ce, CLK => clk, D => di(1), Q => s(1));
  s2 : SRLC16E_1 port map (A0 => a(2), A1 => a(3), A2 => a(4), A3 => a(5), CE => en, CLK => clk, D => di(2), Q => s(2), Q15 => sq15);
  s(3) <= sq15;
  s3 : SRLC16 port map (A0 => b(2), A1 => b(3), A2 => b(4), A3 => b(5), CLK => clk, D => di(8), Q => s(4), Q15 => open);

  d0 : RAM16X1S generic map (INIT => X"F00F") port map (A0 => a(0), A1 => a(1), A2 => a(2), A3 => a(3), D => di(3), WCLK => clk, WE => we, O => r(0));
  d1 : RAM32X1S_1 generic map (INIT => X"12345678") port map (A0 => b(0), A1 => b(1), A2 => b(2), A3 => b(3), A4 => b(4), D => di(4), WCLK => clk, WE => we2, O => r(1));
  d2 : RAM16X1D generic map (INIT => X"8421")
    port map (A0 => a(0), A1 => a(1), A2 => a(2), A3 => a(3), DPRA0 => b(0), DPRA1 => b(1), DPRA2 => b(2), DPRA3 => b(3), D => di(5), WCLK => clk, WE => we, SPO => r(2), DPO => r(3));
  d3 : RAM64X1D generic map (INIT => X"0123456789ABCDEF")
    port map (A0 => a(0), A1 => a(1), A2 => a(2), A3 => a(3), A4 => a(4), A5 => a(5), DPRA0 => b(0), DPRA1 => b(1), DPRA2 => b(2), DPRA3 => b(3), DPRA4 => b(4), DPRA5 => b(5),
              D => di(6), WCLK => clk, WE => we2, SPO => r(4), DPO => r(5));

  g : BUFGCE_1 port map (I => clk, CE => ce, O => gclk);
  x : BUFGMUX_1 port map (I0 => clk, I1 => we2, S => en, O => mclk);
  process (gclk) begin if falling_edge(gclk) then cg <= cg + 1; end if; end process;
  process (mclk) begin if falling_edge(mclk) then cm <= cm + 3; end if; end process;
  nce <= cg; nmux <= cm;
end rtl;
