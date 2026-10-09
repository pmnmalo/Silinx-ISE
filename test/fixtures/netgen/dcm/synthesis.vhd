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
    clk : in STD_LOGIC := 'X';
    en : in STD_LOGIC := 'X';
    locked : out STD_LOGIC;
    c2x : out STD_LOGIC_VECTOR ( 7 downto 0 );
    cdv : out STD_LOGIC_VECTOR ( 7 downto 0 );
    cfx : out STD_LOGIC_VECTOR ( 7 downto 0 );
    c0 : out STD_LOGIC_VECTOR ( 7 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal Mcount_n0_cy_1_rt_3 : STD_LOGIC;
  signal Mcount_n0_cy_2_rt_5 : STD_LOGIC;
  signal Mcount_n0_cy_3_rt_7 : STD_LOGIC;
  signal Mcount_n0_cy_4_rt_9 : STD_LOGIC;
  signal Mcount_n0_cy_5_rt_11 : STD_LOGIC;
  signal Mcount_n0_cy_6_rt_13 : STD_LOGIC;
  signal Mcount_n0_xor_7_rt_15 : STD_LOGIC;
  signal Mcount_ndv_cy_1_rt_18 : STD_LOGIC;
  signal Mcount_ndv_cy_2_rt_20 : STD_LOGIC;
  signal Mcount_ndv_cy_3_rt_22 : STD_LOGIC;
  signal Mcount_ndv_cy_4_rt_24 : STD_LOGIC;
  signal Mcount_ndv_cy_5_rt_26 : STD_LOGIC;
  signal Mcount_ndv_cy_6_rt_28 : STD_LOGIC;
  signal Mcount_ndv_xor_7_rt_30 : STD_LOGIC;
  signal Mcount_nfx_cy_1_rt_33 : STD_LOGIC;
  signal Mcount_nfx_cy_2_rt_35 : STD_LOGIC;
  signal Mcount_nfx_cy_3_rt_37 : STD_LOGIC;
  signal Mcount_nfx_cy_4_rt_39 : STD_LOGIC;
  signal Mcount_nfx_cy_5_rt_41 : STD_LOGIC;
  signal Mcount_nfx_cy_6_rt_43 : STD_LOGIC;
  signal Mcount_nfx_xor_7_rt_45 : STD_LOGIC;
  signal N0 : STD_LOGIC;
  signal N01 : STD_LOGIC;
  signal N1 : STD_LOGIC;
  signal N2 : STD_LOGIC;
  signal Result_0_2 : STD_LOGIC;
  signal Result_0_3 : STD_LOGIC;
  signal Result_1_1 : STD_LOGIC;
  signal Result_1_2 : STD_LOGIC;
  signal Result_1_3 : STD_LOGIC;
  signal Result_2_1 : STD_LOGIC;
  signal Result_2_2 : STD_LOGIC;
  signal Result_2_3 : STD_LOGIC;
  signal Result_3_1 : STD_LOGIC;
  signal Result_3_2 : STD_LOGIC;
  signal Result_3_3 : STD_LOGIC;
  signal Result_4_1 : STD_LOGIC;
  signal Result_4_2 : STD_LOGIC;
  signal Result_4_3 : STD_LOGIC;
  signal Result_5_1 : STD_LOGIC;
  signal Result_5_2 : STD_LOGIC;
  signal Result_5_3 : STD_LOGIC;
  signal Result_6_1 : STD_LOGIC;
  signal Result_6_2 : STD_LOGIC;
  signal Result_6_3 : STD_LOGIC;
  signal Result_7_1 : STD_LOGIC;
  signal Result_7_2 : STD_LOGIC;
  signal Result_7_3 : STD_LOGIC;
  signal clk0_b : STD_LOGIC;
  signal clk0_u : STD_LOGIC;
  signal clk2x_b : STD_LOGIC;
  signal clk2x_u : STD_LOGIC;
  signal clkdv_b : STD_LOGIC;
  signal clkdv_u : STD_LOGIC;
  signal clkfx_b : STD_LOGIC;
  signal clkfx_u : STD_LOGIC;
  signal clkin_b : STD_LOGIC;
  signal en_IBUF_124 : STD_LOGIC;
  signal en_r_125 : STD_LOGIC;
  signal locked_OBUF_127 : STD_LOGIC;
  signal NLW_u_dcm_CLK90_UNCONNECTED : STD_LOGIC;
  signal NLW_u_dcm_CLK180_UNCONNECTED : STD_LOGIC;
  signal NLW_u_dcm_CLK270_UNCONNECTED : STD_LOGIC;
  signal NLW_u_dcm_CLK2X180_UNCONNECTED : STD_LOGIC;
  signal NLW_u_dcm_CLKFX180_UNCONNECTED : STD_LOGIC;
  signal NLW_u_dcm_PSDONE_UNCONNECTED : STD_LOGIC;
  signal NLW_u_dcm_STATUS_7_UNCONNECTED : STD_LOGIC;
  signal NLW_u_dcm_STATUS_6_UNCONNECTED : STD_LOGIC;
  signal NLW_u_dcm_STATUS_5_UNCONNECTED : STD_LOGIC;
  signal NLW_u_dcm_STATUS_4_UNCONNECTED : STD_LOGIC;
  signal NLW_u_dcm_STATUS_3_UNCONNECTED : STD_LOGIC;
  signal NLW_u_dcm_STATUS_2_UNCONNECTED : STD_LOGIC;
  signal NLW_u_dcm_STATUS_1_UNCONNECTED : STD_LOGIC;
  signal NLW_u_dcm_STATUS_0_UNCONNECTED : STD_LOGIC;
  signal Maccum_n2x_cy : STD_LOGIC_VECTOR ( 3 downto 3 );
  signal Mcount_n0_cy : STD_LOGIC_VECTOR ( 6 downto 0 );
  signal Mcount_n0_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal Mcount_ndv_cy : STD_LOGIC_VECTOR ( 6 downto 0 );
  signal Mcount_ndv_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal Mcount_nfx_cy : STD_LOGIC_VECTOR ( 6 downto 0 );
  signal Mcount_nfx_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal Result : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal n0_8 : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal n2x : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal ndv : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal nfx : STD_LOGIC_VECTOR ( 7 downto 0 );
begin
  XST_GND : GND
    port map (
      G => N0
    );
  XST_VCC : VCC
    port map (
      P => N1
    );
  en_r : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk0_b,
      D => en_IBUF_124,
      Q => en_r_125
    );
  n0_0 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk0_b,
      CE => en_r_125,
      D => Result(0),
      Q => n0_8(0)
    );
  n0_1 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk0_b,
      CE => en_r_125,
      D => Result(1),
      Q => n0_8(1)
    );
  n0_2 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk0_b,
      CE => en_r_125,
      D => Result(2),
      Q => n0_8(2)
    );
  n0_3 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk0_b,
      CE => en_r_125,
      D => Result(3),
      Q => n0_8(3)
    );
  n0_4 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk0_b,
      CE => en_r_125,
      D => Result(4),
      Q => n0_8(4)
    );
  n0_5 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk0_b,
      CE => en_r_125,
      D => Result(5),
      Q => n0_8(5)
    );
  n0_6 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk0_b,
      CE => en_r_125,
      D => Result(6),
      Q => n0_8(6)
    );
  n0_7 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk0_b,
      CE => en_r_125,
      D => Result(7),
      Q => n0_8(7)
    );
  n2x_1 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk2x_b,
      D => Result_1_1,
      Q => n2x(1)
    );
  n2x_2 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk2x_b,
      D => Result_2_1,
      Q => n2x(2)
    );
  n2x_3 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk2x_b,
      D => Result_3_1,
      Q => n2x(3)
    );
  n2x_4 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk2x_b,
      D => Result_4_1,
      Q => n2x(4)
    );
  n2x_5 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk2x_b,
      D => Result_5_1,
      Q => n2x(5)
    );
  n2x_6 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk2x_b,
      D => Result_6_1,
      Q => n2x(6)
    );
  n2x_7 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk2x_b,
      D => Result_7_1,
      Q => n2x(7)
    );
  nfx_0 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkfx_b,
      D => Result_0_3,
      Q => nfx(0)
    );
  nfx_1 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkfx_b,
      D => Result_1_3,
      Q => nfx(1)
    );
  nfx_2 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkfx_b,
      D => Result_2_3,
      Q => nfx(2)
    );
  nfx_3 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkfx_b,
      D => Result_3_3,
      Q => nfx(3)
    );
  nfx_4 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkfx_b,
      D => Result_4_3,
      Q => nfx(4)
    );
  nfx_5 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkfx_b,
      D => Result_5_3,
      Q => nfx(5)
    );
  nfx_6 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkfx_b,
      D => Result_6_3,
      Q => nfx(6)
    );
  nfx_7 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkfx_b,
      D => Result_7_3,
      Q => nfx(7)
    );
  ndv_0 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkdv_b,
      D => Result_0_2,
      Q => ndv(0)
    );
  ndv_1 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkdv_b,
      D => Result_1_2,
      Q => ndv(1)
    );
  ndv_2 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkdv_b,
      D => Result_2_2,
      Q => ndv(2)
    );
  ndv_3 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkdv_b,
      D => Result_3_2,
      Q => ndv(3)
    );
  ndv_4 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkdv_b,
      D => Result_4_2,
      Q => ndv(4)
    );
  ndv_5 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkdv_b,
      D => Result_5_2,
      Q => ndv(5)
    );
  ndv_6 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkdv_b,
      D => Result_6_2,
      Q => ndv(6)
    );
  ndv_7 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clkdv_b,
      D => Result_7_2,
      Q => ndv(7)
    );
  Mcount_n0_cy_0_Q : MUXCY
    port map (
      CI => N0,
      DI => N1,
      S => Mcount_n0_lut(0),
      O => Mcount_n0_cy(0)
    );
  Mcount_n0_xor_0_Q : XORCY
    port map (
      CI => N0,
      LI => Mcount_n0_lut(0),
      O => Result(0)
    );
  Mcount_n0_cy_1_Q : MUXCY
    port map (
      CI => Mcount_n0_cy(0),
      DI => N0,
      S => Mcount_n0_cy_1_rt_3,
      O => Mcount_n0_cy(1)
    );
  Mcount_n0_xor_1_Q : XORCY
    port map (
      CI => Mcount_n0_cy(0),
      LI => Mcount_n0_cy_1_rt_3,
      O => Result(1)
    );
  Mcount_n0_cy_2_Q : MUXCY
    port map (
      CI => Mcount_n0_cy(1),
      DI => N0,
      S => Mcount_n0_cy_2_rt_5,
      O => Mcount_n0_cy(2)
    );
  Mcount_n0_xor_2_Q : XORCY
    port map (
      CI => Mcount_n0_cy(1),
      LI => Mcount_n0_cy_2_rt_5,
      O => Result(2)
    );
  Mcount_n0_cy_3_Q : MUXCY
    port map (
      CI => Mcount_n0_cy(2),
      DI => N0,
      S => Mcount_n0_cy_3_rt_7,
      O => Mcount_n0_cy(3)
    );
  Mcount_n0_xor_3_Q : XORCY
    port map (
      CI => Mcount_n0_cy(2),
      LI => Mcount_n0_cy_3_rt_7,
      O => Result(3)
    );
  Mcount_n0_cy_4_Q : MUXCY
    port map (
      CI => Mcount_n0_cy(3),
      DI => N0,
      S => Mcount_n0_cy_4_rt_9,
      O => Mcount_n0_cy(4)
    );
  Mcount_n0_xor_4_Q : XORCY
    port map (
      CI => Mcount_n0_cy(3),
      LI => Mcount_n0_cy_4_rt_9,
      O => Result(4)
    );
  Mcount_n0_cy_5_Q : MUXCY
    port map (
      CI => Mcount_n0_cy(4),
      DI => N0,
      S => Mcount_n0_cy_5_rt_11,
      O => Mcount_n0_cy(5)
    );
  Mcount_n0_xor_5_Q : XORCY
    port map (
      CI => Mcount_n0_cy(4),
      LI => Mcount_n0_cy_5_rt_11,
      O => Result(5)
    );
  Mcount_n0_cy_6_Q : MUXCY
    port map (
      CI => Mcount_n0_cy(5),
      DI => N0,
      S => Mcount_n0_cy_6_rt_13,
      O => Mcount_n0_cy(6)
    );
  Mcount_n0_xor_6_Q : XORCY
    port map (
      CI => Mcount_n0_cy(5),
      LI => Mcount_n0_cy_6_rt_13,
      O => Result(6)
    );
  Mcount_n0_xor_7_Q : XORCY
    port map (
      CI => Mcount_n0_cy(6),
      LI => Mcount_n0_xor_7_rt_15,
      O => Result(7)
    );
  Mcount_ndv_cy_0_Q : MUXCY
    port map (
      CI => N0,
      DI => N1,
      S => Mcount_ndv_lut(0),
      O => Mcount_ndv_cy(0)
    );
  Mcount_ndv_xor_0_Q : XORCY
    port map (
      CI => N0,
      LI => Mcount_ndv_lut(0),
      O => Result_0_2
    );
  Mcount_ndv_cy_1_Q : MUXCY
    port map (
      CI => Mcount_ndv_cy(0),
      DI => N0,
      S => Mcount_ndv_cy_1_rt_18,
      O => Mcount_ndv_cy(1)
    );
  Mcount_ndv_xor_1_Q : XORCY
    port map (
      CI => Mcount_ndv_cy(0),
      LI => Mcount_ndv_cy_1_rt_18,
      O => Result_1_2
    );
  Mcount_ndv_cy_2_Q : MUXCY
    port map (
      CI => Mcount_ndv_cy(1),
      DI => N0,
      S => Mcount_ndv_cy_2_rt_20,
      O => Mcount_ndv_cy(2)
    );
  Mcount_ndv_xor_2_Q : XORCY
    port map (
      CI => Mcount_ndv_cy(1),
      LI => Mcount_ndv_cy_2_rt_20,
      O => Result_2_2
    );
  Mcount_ndv_cy_3_Q : MUXCY
    port map (
      CI => Mcount_ndv_cy(2),
      DI => N0,
      S => Mcount_ndv_cy_3_rt_22,
      O => Mcount_ndv_cy(3)
    );
  Mcount_ndv_xor_3_Q : XORCY
    port map (
      CI => Mcount_ndv_cy(2),
      LI => Mcount_ndv_cy_3_rt_22,
      O => Result_3_2
    );
  Mcount_ndv_cy_4_Q : MUXCY
    port map (
      CI => Mcount_ndv_cy(3),
      DI => N0,
      S => Mcount_ndv_cy_4_rt_24,
      O => Mcount_ndv_cy(4)
    );
  Mcount_ndv_xor_4_Q : XORCY
    port map (
      CI => Mcount_ndv_cy(3),
      LI => Mcount_ndv_cy_4_rt_24,
      O => Result_4_2
    );
  Mcount_ndv_cy_5_Q : MUXCY
    port map (
      CI => Mcount_ndv_cy(4),
      DI => N0,
      S => Mcount_ndv_cy_5_rt_26,
      O => Mcount_ndv_cy(5)
    );
  Mcount_ndv_xor_5_Q : XORCY
    port map (
      CI => Mcount_ndv_cy(4),
      LI => Mcount_ndv_cy_5_rt_26,
      O => Result_5_2
    );
  Mcount_ndv_cy_6_Q : MUXCY
    port map (
      CI => Mcount_ndv_cy(5),
      DI => N0,
      S => Mcount_ndv_cy_6_rt_28,
      O => Mcount_ndv_cy(6)
    );
  Mcount_ndv_xor_6_Q : XORCY
    port map (
      CI => Mcount_ndv_cy(5),
      LI => Mcount_ndv_cy_6_rt_28,
      O => Result_6_2
    );
  Mcount_ndv_xor_7_Q : XORCY
    port map (
      CI => Mcount_ndv_cy(6),
      LI => Mcount_ndv_xor_7_rt_30,
      O => Result_7_2
    );
  Mcount_nfx_cy_0_Q : MUXCY
    port map (
      CI => N0,
      DI => N1,
      S => Mcount_nfx_lut(0),
      O => Mcount_nfx_cy(0)
    );
  Mcount_nfx_xor_0_Q : XORCY
    port map (
      CI => N0,
      LI => Mcount_nfx_lut(0),
      O => Result_0_3
    );
  Mcount_nfx_cy_1_Q : MUXCY
    port map (
      CI => Mcount_nfx_cy(0),
      DI => N0,
      S => Mcount_nfx_cy_1_rt_33,
      O => Mcount_nfx_cy(1)
    );
  Mcount_nfx_xor_1_Q : XORCY
    port map (
      CI => Mcount_nfx_cy(0),
      LI => Mcount_nfx_cy_1_rt_33,
      O => Result_1_3
    );
  Mcount_nfx_cy_2_Q : MUXCY
    port map (
      CI => Mcount_nfx_cy(1),
      DI => N0,
      S => Mcount_nfx_cy_2_rt_35,
      O => Mcount_nfx_cy(2)
    );
  Mcount_nfx_xor_2_Q : XORCY
    port map (
      CI => Mcount_nfx_cy(1),
      LI => Mcount_nfx_cy_2_rt_35,
      O => Result_2_3
    );
  Mcount_nfx_cy_3_Q : MUXCY
    port map (
      CI => Mcount_nfx_cy(2),
      DI => N0,
      S => Mcount_nfx_cy_3_rt_37,
      O => Mcount_nfx_cy(3)
    );
  Mcount_nfx_xor_3_Q : XORCY
    port map (
      CI => Mcount_nfx_cy(2),
      LI => Mcount_nfx_cy_3_rt_37,
      O => Result_3_3
    );
  Mcount_nfx_cy_4_Q : MUXCY
    port map (
      CI => Mcount_nfx_cy(3),
      DI => N0,
      S => Mcount_nfx_cy_4_rt_39,
      O => Mcount_nfx_cy(4)
    );
  Mcount_nfx_xor_4_Q : XORCY
    port map (
      CI => Mcount_nfx_cy(3),
      LI => Mcount_nfx_cy_4_rt_39,
      O => Result_4_3
    );
  Mcount_nfx_cy_5_Q : MUXCY
    port map (
      CI => Mcount_nfx_cy(4),
      DI => N0,
      S => Mcount_nfx_cy_5_rt_41,
      O => Mcount_nfx_cy(5)
    );
  Mcount_nfx_xor_5_Q : XORCY
    port map (
      CI => Mcount_nfx_cy(4),
      LI => Mcount_nfx_cy_5_rt_41,
      O => Result_5_3
    );
  Mcount_nfx_cy_6_Q : MUXCY
    port map (
      CI => Mcount_nfx_cy(5),
      DI => N0,
      S => Mcount_nfx_cy_6_rt_43,
      O => Mcount_nfx_cy(6)
    );
  Mcount_nfx_xor_6_Q : XORCY
    port map (
      CI => Mcount_nfx_cy(5),
      LI => Mcount_nfx_cy_6_rt_43,
      O => Result_6_3
    );
  Mcount_nfx_xor_7_Q : XORCY
    port map (
      CI => Mcount_nfx_cy(6),
      LI => Mcount_nfx_xor_7_rt_45,
      O => Result_7_3
    );
  u_ibufg : IBUFG
    generic map(
      CAPACITANCE => "DONT_CARE",
      IBUF_DELAY_VALUE => "0",
      IBUF_LOW_PWR => TRUE,
      IOSTANDARD => "DEFAULT"
    )
    port map (
      I => clk,
      O => clkin_b
    );
  u_dcm : DCM_SP
    generic map(
      CLKDV_DIVIDE => 2.500000,
      CLKFX_DIVIDE => 2,
      CLKFX_MULTIPLY => 3,
      CLKIN_DIVIDE_BY_2 => FALSE,
      CLKIN_PERIOD => 20.000000,
      CLKOUT_PHASE_SHIFT => "NONE",
      CLK_FEEDBACK => "1X",
      DESKEW_ADJUST => "SYSTEM_SYNCHRONOUS",
      DFS_FREQUENCY_MODE => "LOW",
      DLL_FREQUENCY_MODE => "LOW",
      DSS_MODE => "NONE",
      DUTY_CYCLE_CORRECTION => TRUE,
      PHASE_SHIFT => 0,
      STARTUP_WAIT => FALSE,
      FACTORY_JF => X"C080"
    )
    port map (
      CLKIN => clkin_b,
      CLKFB => clk0_b,
      RST => N0,
      DSSEN => N0,
      PSINCDEC => N0,
      PSEN => N0,
      PSCLK => N0,
      CLK0 => clk0_u,
      CLK90 => NLW_u_dcm_CLK90_UNCONNECTED,
      CLK180 => NLW_u_dcm_CLK180_UNCONNECTED,
      CLK270 => NLW_u_dcm_CLK270_UNCONNECTED,
      CLK2X => clk2x_u,
      CLK2X180 => NLW_u_dcm_CLK2X180_UNCONNECTED,
      CLKDV => clkdv_u,
      CLKFX => clkfx_u,
      CLKFX180 => NLW_u_dcm_CLKFX180_UNCONNECTED,
      LOCKED => locked_OBUF_127,
      PSDONE => NLW_u_dcm_PSDONE_UNCONNECTED,
      STATUS(7) => NLW_u_dcm_STATUS_7_UNCONNECTED,
      STATUS(6) => NLW_u_dcm_STATUS_6_UNCONNECTED,
      STATUS(5) => NLW_u_dcm_STATUS_5_UNCONNECTED,
      STATUS(4) => NLW_u_dcm_STATUS_4_UNCONNECTED,
      STATUS(3) => NLW_u_dcm_STATUS_3_UNCONNECTED,
      STATUS(2) => NLW_u_dcm_STATUS_2_UNCONNECTED,
      STATUS(1) => NLW_u_dcm_STATUS_1_UNCONNECTED,
      STATUS(0) => NLW_u_dcm_STATUS_0_UNCONNECTED
    );
  u_b0 : BUFG
    port map (
      I => clk0_u,
      O => clk0_b
    );
  u_bfx : BUFG
    port map (
      I => clkfx_u,
      O => clkfx_b
    );
  u_bdv : BUFG
    port map (
      I => clkdv_u,
      O => clkdv_b
    );
  u_b2x : BUFG
    port map (
      I => clk2x_u,
      O => clk2x_b
    );
  Maccum_n2x_xor_1_11 : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => n2x(1),
      I1 => n2x(0),
      O => Result_1_1
    );
  Maccum_n2x_xor_2_11 : LUT3
    generic map(
      INIT => X"56"
    )
    port map (
      I0 => n2x(2),
      I1 => n2x(0),
      I2 => n2x(1),
      O => Result_2_1
    );
  Maccum_n2x_xor_3_11 : LUT4
    generic map(
      INIT => X"3C6C"
    )
    port map (
      I0 => n2x(0),
      I1 => n2x(3),
      I2 => n2x(2),
      I3 => n2x(1),
      O => Result_3_1
    );
  Maccum_n2x_xor_4_11 : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => n2x(4),
      I1 => N2,
      O => Result_4_1
    );
  Maccum_n2x_xor_5_11 : LUT3
    generic map(
      INIT => X"6A"
    )
    port map (
      I0 => n2x(5),
      I1 => n2x(4),
      I2 => Maccum_n2x_cy(3),
      O => Result_5_1
    );
  en_IBUF : IBUF
    port map (
      I => en,
      O => en_IBUF_124
    );
  locked_OBUF : OBUF
    port map (
      I => locked_OBUF_127,
      O => locked
    );
  c2x_7_OBUF : OBUF
    port map (
      I => n2x(7),
      O => c2x(7)
    );
  c2x_6_OBUF : OBUF
    port map (
      I => n2x(6),
      O => c2x(6)
    );
  c2x_5_OBUF : OBUF
    port map (
      I => n2x(5),
      O => c2x(5)
    );
  c2x_4_OBUF : OBUF
    port map (
      I => n2x(4),
      O => c2x(4)
    );
  c2x_3_OBUF : OBUF
    port map (
      I => n2x(3),
      O => c2x(3)
    );
  c2x_2_OBUF : OBUF
    port map (
      I => n2x(2),
      O => c2x(2)
    );
  c2x_1_OBUF : OBUF
    port map (
      I => n2x(1),
      O => c2x(1)
    );
  c2x_0_OBUF : OBUF
    port map (
      I => n2x(0),
      O => c2x(0)
    );
  cdv_7_OBUF : OBUF
    port map (
      I => ndv(7),
      O => cdv(7)
    );
  cdv_6_OBUF : OBUF
    port map (
      I => ndv(6),
      O => cdv(6)
    );
  cdv_5_OBUF : OBUF
    port map (
      I => ndv(5),
      O => cdv(5)
    );
  cdv_4_OBUF : OBUF
    port map (
      I => ndv(4),
      O => cdv(4)
    );
  cdv_3_OBUF : OBUF
    port map (
      I => ndv(3),
      O => cdv(3)
    );
  cdv_2_OBUF : OBUF
    port map (
      I => ndv(2),
      O => cdv(2)
    );
  cdv_1_OBUF : OBUF
    port map (
      I => ndv(1),
      O => cdv(1)
    );
  cdv_0_OBUF : OBUF
    port map (
      I => ndv(0),
      O => cdv(0)
    );
  cfx_7_OBUF : OBUF
    port map (
      I => nfx(7),
      O => cfx(7)
    );
  cfx_6_OBUF : OBUF
    port map (
      I => nfx(6),
      O => cfx(6)
    );
  cfx_5_OBUF : OBUF
    port map (
      I => nfx(5),
      O => cfx(5)
    );
  cfx_4_OBUF : OBUF
    port map (
      I => nfx(4),
      O => cfx(4)
    );
  cfx_3_OBUF : OBUF
    port map (
      I => nfx(3),
      O => cfx(3)
    );
  cfx_2_OBUF : OBUF
    port map (
      I => nfx(2),
      O => cfx(2)
    );
  cfx_1_OBUF : OBUF
    port map (
      I => nfx(1),
      O => cfx(1)
    );
  cfx_0_OBUF : OBUF
    port map (
      I => nfx(0),
      O => cfx(0)
    );
  c0_7_OBUF : OBUF
    port map (
      I => n0_8(7),
      O => c0(7)
    );
  c0_6_OBUF : OBUF
    port map (
      I => n0_8(6),
      O => c0(6)
    );
  c0_5_OBUF : OBUF
    port map (
      I => n0_8(5),
      O => c0(5)
    );
  c0_4_OBUF : OBUF
    port map (
      I => n0_8(4),
      O => c0(4)
    );
  c0_3_OBUF : OBUF
    port map (
      I => n0_8(3),
      O => c0(3)
    );
  c0_2_OBUF : OBUF
    port map (
      I => n0_8(2),
      O => c0(2)
    );
  c0_1_OBUF : OBUF
    port map (
      I => n0_8(1),
      O => c0(1)
    );
  c0_0_OBUF : OBUF
    port map (
      I => n0_8(0),
      O => c0(0)
    );
  n2x_0 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk2x_b,
      D => N1,
      R => n2x(0),
      Q => n2x(0)
    );
  Mcount_n0_cy_1_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => n0_8(1),
      O => Mcount_n0_cy_1_rt_3
    );
  Mcount_n0_cy_2_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => n0_8(2),
      O => Mcount_n0_cy_2_rt_5
    );
  Mcount_n0_cy_3_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => n0_8(3),
      O => Mcount_n0_cy_3_rt_7
    );
  Mcount_n0_cy_4_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => n0_8(4),
      O => Mcount_n0_cy_4_rt_9
    );
  Mcount_n0_cy_5_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => n0_8(5),
      O => Mcount_n0_cy_5_rt_11
    );
  Mcount_n0_cy_6_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => n0_8(6),
      O => Mcount_n0_cy_6_rt_13
    );
  Mcount_ndv_cy_1_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => ndv(1),
      O => Mcount_ndv_cy_1_rt_18
    );
  Mcount_ndv_cy_2_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => ndv(2),
      O => Mcount_ndv_cy_2_rt_20
    );
  Mcount_ndv_cy_3_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => ndv(3),
      O => Mcount_ndv_cy_3_rt_22
    );
  Mcount_ndv_cy_4_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => ndv(4),
      O => Mcount_ndv_cy_4_rt_24
    );
  Mcount_ndv_cy_5_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => ndv(5),
      O => Mcount_ndv_cy_5_rt_26
    );
  Mcount_ndv_cy_6_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => ndv(6),
      O => Mcount_ndv_cy_6_rt_28
    );
  Mcount_nfx_cy_1_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nfx(1),
      O => Mcount_nfx_cy_1_rt_33
    );
  Mcount_nfx_cy_2_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nfx(2),
      O => Mcount_nfx_cy_2_rt_35
    );
  Mcount_nfx_cy_3_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nfx(3),
      O => Mcount_nfx_cy_3_rt_37
    );
  Mcount_nfx_cy_4_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nfx(4),
      O => Mcount_nfx_cy_4_rt_39
    );
  Mcount_nfx_cy_5_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nfx(5),
      O => Mcount_nfx_cy_5_rt_41
    );
  Mcount_nfx_cy_6_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nfx(6),
      O => Mcount_nfx_cy_6_rt_43
    );
  Mcount_n0_xor_7_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => n0_8(7),
      O => Mcount_n0_xor_7_rt_15
    );
  Mcount_ndv_xor_7_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => ndv(7),
      O => Mcount_ndv_xor_7_rt_30
    );
  Mcount_nfx_xor_7_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => nfx(7),
      O => Mcount_nfx_xor_7_rt_45
    );
  Maccum_n2x_xor_6_11 : LUT4
    generic map(
      INIT => X"6AAA"
    )
    port map (
      I0 => n2x(6),
      I1 => n2x(5),
      I2 => n2x(4),
      I3 => Maccum_n2x_cy(3),
      O => Result_6_1
    );
  Maccum_n2x_xor_7_11 : LUT4
    generic map(
      INIT => X"A6AA"
    )
    port map (
      I0 => n2x(7),
      I1 => n2x(5),
      I2 => N01,
      I3 => Maccum_n2x_cy(3),
      O => Result_7_1
    );
  Mcount_n0_lut_0_INV_0 : INV
    port map (
      I => n0_8(0),
      O => Mcount_n0_lut(0)
    );
  Mcount_ndv_lut_0_INV_0 : INV
    port map (
      I => ndv(0),
      O => Mcount_ndv_lut(0)
    );
  Mcount_nfx_lut_0_INV_0 : INV
    port map (
      I => nfx(0),
      O => Mcount_nfx_lut(0)
    );
  Maccum_n2x_cy_3_11 : LUT4_D
    generic map(
      INIT => X"8880"
    )
    port map (
      I0 => n2x(3),
      I1 => n2x(2),
      I2 => n2x(1),
      I3 => n2x(0),
      LO => N2,
      O => Maccum_n2x_cy(3)
    );
  Maccum_n2x_cy_5_11_SW0 : LUT2_L
    generic map(
      INIT => X"7"
    )
    port map (
      I0 => n2x(6),
      I1 => n2x(4),
      LO => N01
    );

end STRUCTURE;

