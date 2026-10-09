--------------------------------------------------------------------------------
-- Copyright (c) 1995-2013 Xilinx, Inc.  All rights reserved.
--------------------------------------------------------------------------------
--   ____  ____
--  /   /\/   /
-- /___/  \  /    Vendor: Xilinx
-- \   \   \/     Version: P.20131013
--  \   \         Application: netgen
--  /   /         Filename: top_synthesis.vhd
-- /___/   /\     Timestamp: (removed)
-- \   \  /  \
--  \___\/\___\
--
-- Command	: -intstyle xflow -sim -ofmt vhdl -w top.ngc netgen/synthesis/top_synthesis.vhd
-- Device	: xc3s250e-4-cp132
-- Input file	: top.ngc
-- Output file	: netgen/synthesis/top_synthesis.vhd
-- # of Entities	: 1
-- Design Name	: top
-- Xilinx	: /opt/Xilinx/14.7/ISE_DS/ISE/
--
-- Purpose:
--     This VHDL netlist is a verification model and uses simulation
--     primitives which may not represent the true implementation of the
--     device, however the netlist is functionally correct and should not
--     be modified. This file cannot be synthesized and should only be used
--     with supported simulation tools.
--
-- Reference:
--     Command Line Tools User Guide, Chapter 23
--     Synthesis and Simulation Design Guide, Chapter 6
--
--------------------------------------------------------------------------------

library IEEE;
use IEEE.STD_LOGIC_1164.ALL;
library UNISIM;
use UNISIM.VCOMPONENTS.ALL;
use UNISIM.VPKG.ALL;

entity top is
  port (
    clka : in STD_LOGIC := 'X';
    clkb : in STD_LOGIC := 'X';
    sel : in STD_LOGIC := 'X';
    ca : out STD_LOGIC_VECTOR ( 7 downto 0 );
    cm : out STD_LOGIC_VECTOR ( 7 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal Mcount_nm_cy_1_rt_3 : STD_LOGIC;
  signal Mcount_nm_cy_2_rt_5 : STD_LOGIC;
  signal Mcount_nm_cy_3_rt_7 : STD_LOGIC;
  signal Mcount_nm_cy_4_rt_9 : STD_LOGIC;
  signal Mcount_nm_cy_5_rt_11 : STD_LOGIC;
  signal Mcount_nm_cy_6_rt_13 : STD_LOGIC;
  signal Mcount_nm_xor_7_rt_15 : STD_LOGIC;
  signal N0 : STD_LOGIC;
  signal N01 : STD_LOGIC;
  signal N1 : STD_LOGIC;
  signal N2 : STD_LOGIC;
  signal Result_0_1 : STD_LOGIC;
  signal Result_1_1 : STD_LOGIC;
  signal Result_2_1 : STD_LOGIC;
  signal Result_3_1 : STD_LOGIC;
  signal Result_4_1 : STD_LOGIC;
  signal Result_5_1 : STD_LOGIC;
  signal Result_6_1 : STD_LOGIC;
  signal Result_7_1 : STD_LOGIC;
  signal clka_IBUFG_44 : STD_LOGIC;
  signal clkb_IBUFG_46 : STD_LOGIC;
  signal clkm : STD_LOGIC;
  signal sel_IBUF_73 : STD_LOGIC;
  signal Maccum_na_cy : STD_LOGIC_VECTOR ( 3 downto 3 );
  signal Mcount_nm_cy : STD_LOGIC_VECTOR ( 6 downto 0 );
  signal Mcount_nm_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal Result : STD_LOGIC_VECTOR ( 7 downto 1 );
  signal na : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal nm : STD_LOGIC_VECTOR ( 7 downto 0 );
begin
  XST_GND : GND
    port map (
      G => N0
    );
  XST_VCC : VCC
    port map (
      P => N1
    );
  na_1 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clka_IBUFG_44,
      D => Result(1),
      Q => na(1)
    );
  na_2 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clka_IBUFG_44,
      D => Result(2),
      Q => na(2)
    );
  na_3 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clka_IBUFG_44,
      D => Result(3),
      Q => na(3)
    );
  na_4 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clka_IBUFG_44,
      D => Result(4),
      Q => na(4)
    );
  na_5 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clka_IBUFG_44,
      D => Result(5),
      Q => na(5)
    );
  na_6 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clka_IBUFG_44,
      D => Result(6),
      Q => na(6)
    );
  na_7 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clka_IBUFG_44,
      D => Result(7),
      Q => na(7)
    );
  nm_0 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkm,
      D => Result_0_1,
      Q => nm(0)
    );
  nm_1 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkm,
      D => Result_1_1,
      Q => nm(1)
    );
  nm_2 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkm,
      D => Result_2_1,
      Q => nm(2)
    );
  nm_3 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkm,
      D => Result_3_1,
      Q => nm(3)
    );
  nm_4 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkm,
      D => Result_4_1,
      Q => nm(4)
    );
  nm_5 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkm,
      D => Result_5_1,
      Q => nm(5)
    );
  nm_6 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkm,
      D => Result_6_1,
      Q => nm(6)
    );
  nm_7 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkm,
      D => Result_7_1,
      Q => nm(7)
    );
  Mcount_nm_cy_0_Q : MUXCY
    port map (
      CI => N0,
      DI => N1,
      S => Mcount_nm_lut(0),
      O => Mcount_nm_cy(0)
    );
  Mcount_nm_xor_0_Q : XORCY
    port map (
      CI => N0,
      LI => Mcount_nm_lut(0),
      O => Result_0_1
    );
  Mcount_nm_cy_1_Q : MUXCY
    port map (
      CI => Mcount_nm_cy(0),
      DI => N0,
      S => Mcount_nm_cy_1_rt_3,
      O => Mcount_nm_cy(1)
    );
  Mcount_nm_xor_1_Q : XORCY
    port map (
      CI => Mcount_nm_cy(0),
      LI => Mcount_nm_cy_1_rt_3,
      O => Result_1_1
    );
  Mcount_nm_cy_2_Q : MUXCY
    port map (
      CI => Mcount_nm_cy(1),
      DI => N0,
      S => Mcount_nm_cy_2_rt_5,
      O => Mcount_nm_cy(2)
    );
  Mcount_nm_xor_2_Q : XORCY
    port map (
      CI => Mcount_nm_cy(1),
      LI => Mcount_nm_cy_2_rt_5,
      O => Result_2_1
    );
  Mcount_nm_cy_3_Q : MUXCY
    port map (
      CI => Mcount_nm_cy(2),
      DI => N0,
      S => Mcount_nm_cy_3_rt_7,
      O => Mcount_nm_cy(3)
    );
  Mcount_nm_xor_3_Q : XORCY
    port map (
      CI => Mcount_nm_cy(2),
      LI => Mcount_nm_cy_3_rt_7,
      O => Result_3_1
    );
  Mcount_nm_cy_4_Q : MUXCY
    port map (
      CI => Mcount_nm_cy(3),
      DI => N0,
      S => Mcount_nm_cy_4_rt_9,
      O => Mcount_nm_cy(4)
    );
  Mcount_nm_xor_4_Q : XORCY
    port map (
      CI => Mcount_nm_cy(3),
      LI => Mcount_nm_cy_4_rt_9,
      O => Result_4_1
    );
  Mcount_nm_cy_5_Q : MUXCY
    port map (
      CI => Mcount_nm_cy(4),
      DI => N0,
      S => Mcount_nm_cy_5_rt_11,
      O => Mcount_nm_cy(5)
    );
  Mcount_nm_xor_5_Q : XORCY
    port map (
      CI => Mcount_nm_cy(4),
      LI => Mcount_nm_cy_5_rt_11,
      O => Result_5_1
    );
  Mcount_nm_cy_6_Q : MUXCY
    port map (
      CI => Mcount_nm_cy(5),
      DI => N0,
      S => Mcount_nm_cy_6_rt_13,
      O => Mcount_nm_cy(6)
    );
  Mcount_nm_xor_6_Q : XORCY
    port map (
      CI => Mcount_nm_cy(5),
      LI => Mcount_nm_cy_6_rt_13,
      O => Result_6_1
    );
  Mcount_nm_xor_7_Q : XORCY
    port map (
      CI => Mcount_nm_cy(6),
      LI => Mcount_nm_xor_7_rt_15,
      O => Result_7_1
    );
  u_mux : BUFGMUX
    generic map(
      CLK_SEL_TYPE => "SYNC"
    )
    port map (
      I0 => clka_IBUFG_44,
      I1 => clkb_IBUFG_46,
      S => sel_IBUF_73,
      O => clkm
    );
  Maccum_na_xor_1_11 : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => na(1),
      I1 => na(0),
      O => Result(1)
    );
  Maccum_na_xor_2_11 : LUT3
    generic map(
      INIT => X"93"
    )
    port map (
      I0 => na(0),
      I1 => na(2),
      I2 => na(1),
      O => Result(2)
    );
  Maccum_na_xor_3_11 : LUT4
    generic map(
      INIT => X"363C"
    )
    port map (
      I0 => na(0),
      I1 => na(3),
      I2 => na(2),
      I3 => na(1),
      O => Result(3)
    );
  Maccum_na_xor_4_11 : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => na(4),
      I1 => N2,
      O => Result(4)
    );
  Maccum_na_xor_5_11 : LUT3
    generic map(
      INIT => X"6A"
    )
    port map (
      I0 => na(5),
      I1 => na(4),
      I2 => Maccum_na_cy(3),
      O => Result(5)
    );
  clka_IBUFG : IBUFG
    port map (
      I => clka,
      O => clka_IBUFG_44
    );
  clkb_IBUFG : IBUFG
    port map (
      I => clkb,
      O => clkb_IBUFG_46
    );
  sel_IBUF : IBUF
    port map (
      I => sel,
      O => sel_IBUF_73
    );
  ca_7_OBUF : OBUF
    port map (
      I => na(7),
      O => ca(7)
    );
  ca_6_OBUF : OBUF
    port map (
      I => na(6),
      O => ca(6)
    );
  ca_5_OBUF : OBUF
    port map (
      I => na(5),
      O => ca(5)
    );
  ca_4_OBUF : OBUF
    port map (
      I => na(4),
      O => ca(4)
    );
  ca_3_OBUF : OBUF
    port map (
      I => na(3),
      O => ca(3)
    );
  ca_2_OBUF : OBUF
    port map (
      I => na(2),
      O => ca(2)
    );
  ca_1_OBUF : OBUF
    port map (
      I => na(1),
      O => ca(1)
    );
  ca_0_OBUF : OBUF
    port map (
      I => na(0),
      O => ca(0)
    );
  cm_7_OBUF : OBUF
    port map (
      I => nm(7),
      O => cm(7)
    );
  cm_6_OBUF : OBUF
    port map (
      I => nm(6),
      O => cm(6)
    );
  cm_5_OBUF : OBUF
    port map (
      I => nm(5),
      O => cm(5)
    );
  cm_4_OBUF : OBUF
    port map (
      I => nm(4),
      O => cm(4)
    );
  cm_3_OBUF : OBUF
    port map (
      I => nm(3),
      O => cm(3)
    );
  cm_2_OBUF : OBUF
    port map (
      I => nm(2),
      O => cm(2)
    );
  cm_1_OBUF : OBUF
    port map (
      I => nm(1),
      O => cm(1)
    );
  cm_0_OBUF : OBUF
    port map (
      I => nm(0),
      O => cm(0)
    );
  na_0 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clka_IBUFG_44,
      D => N1,
      R => na(0),
      Q => na(0)
    );
  Mcount_nm_cy_1_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nm(1),
      O => Mcount_nm_cy_1_rt_3
    );
  Mcount_nm_cy_2_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nm(2),
      O => Mcount_nm_cy_2_rt_5
    );
  Mcount_nm_cy_3_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nm(3),
      O => Mcount_nm_cy_3_rt_7
    );
  Mcount_nm_cy_4_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nm(4),
      O => Mcount_nm_cy_4_rt_9
    );
  Mcount_nm_cy_5_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nm(5),
      O => Mcount_nm_cy_5_rt_11
    );
  Mcount_nm_cy_6_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nm(6),
      O => Mcount_nm_cy_6_rt_13
    );
  Mcount_nm_xor_7_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nm(7),
      O => Mcount_nm_xor_7_rt_15
    );
  Maccum_na_xor_6_11 : LUT4
    generic map(
      INIT => X"6AAA"
    )
    port map (
      I0 => na(6),
      I1 => na(5),
      I2 => na(4),
      I3 => Maccum_na_cy(3),
      O => Result(6)
    );
  Maccum_na_xor_7_11 : LUT4
    generic map(
      INIT => X"A6AA"
    )
    port map (
      I0 => na(7),
      I1 => na(5),
      I2 => N01,
      I3 => Maccum_na_cy(3),
      O => Result(7)
    );
  Mcount_nm_lut_0_INV_0 : INV
    port map (
      I => nm(0),
      O => Mcount_nm_lut(0)
    );
  Maccum_na_cy_3_11 : LUT4_D
    generic map(
      INIT => X"A888"
    )
    port map (
      I0 => na(3),
      I1 => na(2),
      I2 => na(1),
      I3 => na(0),
      LO => N2,
      O => Maccum_na_cy(3)
    );
  Maccum_na_cy_5_11_SW0 : LUT2_L
    generic map(
      INIT => X"7"
    )
    port map (
      I0 => na(6),
      I1 => na(4),
      LO => N01
    );

end STRUCTURE;

