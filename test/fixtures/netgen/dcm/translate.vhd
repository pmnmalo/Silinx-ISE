--------------------------------------------------------------------------------
-- Copyright (c) 1995-2013 Xilinx, Inc.  All rights reserved.
--------------------------------------------------------------------------------
--   ____  ____
--  /   /\/   /
-- /___/  \  /    Vendor: Xilinx
-- \   \   \/     Version: P.20131013
--  \   \         Application: netgen
--  /   /         Filename: top_translate.vhd
-- /___/   /\     Timestamp: (removed)
-- \   \  /  \
--  \___\/\___\
--
-- Command	: -intstyle xflow -sim -ofmt vhdl -w top.ngd netgen/translate/top_translate.vhd
-- Device	: 3s250ecp132-4
-- Input file	: top.ngd
-- Output file	: netgen/translate/top_translate.vhd
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
library SIMPRIM;
use SIMPRIM.VCOMPONENTS.ALL;
use SIMPRIM.VPACKAGE.ALL;

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
  signal Maccum_n2x_cy_5_11_SW0_O : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
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
  XST_GND : X_ZERO
    port map (
      O => N0
    );
  XST_VCC : X_ONE
    port map (
      O => N1
    );
  en_r : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk0_b,
      I => en_IBUF_124,
      O => en_r_125,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  n0_0 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk0_b,
      CE => en_r_125,
      I => Result(0),
      O => n0_8(0),
      SET => GND,
      RST => GND
    );
  n0_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk0_b,
      CE => en_r_125,
      I => Result(1),
      O => n0_8(1),
      SET => GND,
      RST => GND
    );
  n0_2 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk0_b,
      CE => en_r_125,
      I => Result(2),
      O => n0_8(2),
      SET => GND,
      RST => GND
    );
  n0_3 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk0_b,
      CE => en_r_125,
      I => Result(3),
      O => n0_8(3),
      SET => GND,
      RST => GND
    );
  n0_4 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk0_b,
      CE => en_r_125,
      I => Result(4),
      O => n0_8(4),
      SET => GND,
      RST => GND
    );
  n0_5 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk0_b,
      CE => en_r_125,
      I => Result(5),
      O => n0_8(5),
      SET => GND,
      RST => GND
    );
  n0_6 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk0_b,
      CE => en_r_125,
      I => Result(6),
      O => n0_8(6),
      SET => GND,
      RST => GND
    );
  n0_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk0_b,
      CE => en_r_125,
      I => Result(7),
      O => n0_8(7),
      SET => GND,
      RST => GND
    );
  n2x_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk2x_b,
      I => Result_1_1,
      O => n2x(1),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  n2x_2 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk2x_b,
      I => Result_2_1,
      O => n2x(2),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  n2x_3 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk2x_b,
      I => Result_3_1,
      O => n2x(3),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  n2x_4 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk2x_b,
      I => Result_4_1,
      O => n2x(4),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  n2x_5 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk2x_b,
      I => Result_5_1,
      O => n2x(5),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  n2x_6 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk2x_b,
      I => Result_6_1,
      O => n2x(6),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  n2x_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk2x_b,
      I => Result_7_1,
      O => n2x(7),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nfx_0 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkfx_b,
      I => Result_0_3,
      O => nfx(0),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nfx_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkfx_b,
      I => Result_1_3,
      O => nfx(1),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nfx_2 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkfx_b,
      I => Result_2_3,
      O => nfx(2),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nfx_3 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkfx_b,
      I => Result_3_3,
      O => nfx(3),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nfx_4 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkfx_b,
      I => Result_4_3,
      O => nfx(4),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nfx_5 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkfx_b,
      I => Result_5_3,
      O => nfx(5),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nfx_6 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkfx_b,
      I => Result_6_3,
      O => nfx(6),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nfx_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkfx_b,
      I => Result_7_3,
      O => nfx(7),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  ndv_0 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkdv_b,
      I => Result_0_2,
      O => ndv(0),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  ndv_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkdv_b,
      I => Result_1_2,
      O => ndv(1),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  ndv_2 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkdv_b,
      I => Result_2_2,
      O => ndv(2),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  ndv_3 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkdv_b,
      I => Result_3_2,
      O => ndv(3),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  ndv_4 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkdv_b,
      I => Result_4_2,
      O => ndv(4),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  ndv_5 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkdv_b,
      I => Result_5_2,
      O => ndv(5),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  ndv_6 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkdv_b,
      I => Result_6_2,
      O => ndv(6),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  ndv_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkdv_b,
      I => Result_7_2,
      O => ndv(7),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  Mcount_n0_cy_0_Q : X_MUX2
    port map (
      IB => N0,
      IA => N1,
      SEL => Mcount_n0_lut(0),
      O => Mcount_n0_cy(0)
    );
  Mcount_n0_xor_0_Q : X_XOR2
    port map (
      I0 => N0,
      I1 => Mcount_n0_lut(0),
      O => Result(0)
    );
  Mcount_n0_cy_1_Q : X_MUX2
    port map (
      IB => Mcount_n0_cy(0),
      IA => N0,
      SEL => Mcount_n0_cy_1_rt_3,
      O => Mcount_n0_cy(1)
    );
  Mcount_n0_xor_1_Q : X_XOR2
    port map (
      I0 => Mcount_n0_cy(0),
      I1 => Mcount_n0_cy_1_rt_3,
      O => Result(1)
    );
  Mcount_n0_cy_2_Q : X_MUX2
    port map (
      IB => Mcount_n0_cy(1),
      IA => N0,
      SEL => Mcount_n0_cy_2_rt_5,
      O => Mcount_n0_cy(2)
    );
  Mcount_n0_xor_2_Q : X_XOR2
    port map (
      I0 => Mcount_n0_cy(1),
      I1 => Mcount_n0_cy_2_rt_5,
      O => Result(2)
    );
  Mcount_n0_cy_3_Q : X_MUX2
    port map (
      IB => Mcount_n0_cy(2),
      IA => N0,
      SEL => Mcount_n0_cy_3_rt_7,
      O => Mcount_n0_cy(3)
    );
  Mcount_n0_xor_3_Q : X_XOR2
    port map (
      I0 => Mcount_n0_cy(2),
      I1 => Mcount_n0_cy_3_rt_7,
      O => Result(3)
    );
  Mcount_n0_cy_4_Q : X_MUX2
    port map (
      IB => Mcount_n0_cy(3),
      IA => N0,
      SEL => Mcount_n0_cy_4_rt_9,
      O => Mcount_n0_cy(4)
    );
  Mcount_n0_xor_4_Q : X_XOR2
    port map (
      I0 => Mcount_n0_cy(3),
      I1 => Mcount_n0_cy_4_rt_9,
      O => Result(4)
    );
  Mcount_n0_cy_5_Q : X_MUX2
    port map (
      IB => Mcount_n0_cy(4),
      IA => N0,
      SEL => Mcount_n0_cy_5_rt_11,
      O => Mcount_n0_cy(5)
    );
  Mcount_n0_xor_5_Q : X_XOR2
    port map (
      I0 => Mcount_n0_cy(4),
      I1 => Mcount_n0_cy_5_rt_11,
      O => Result(5)
    );
  Mcount_n0_cy_6_Q : X_MUX2
    port map (
      IB => Mcount_n0_cy(5),
      IA => N0,
      SEL => Mcount_n0_cy_6_rt_13,
      O => Mcount_n0_cy(6)
    );
  Mcount_n0_xor_6_Q : X_XOR2
    port map (
      I0 => Mcount_n0_cy(5),
      I1 => Mcount_n0_cy_6_rt_13,
      O => Result(6)
    );
  Mcount_n0_xor_7_Q : X_XOR2
    port map (
      I0 => Mcount_n0_cy(6),
      I1 => Mcount_n0_xor_7_rt_15,
      O => Result(7)
    );
  Mcount_ndv_cy_0_Q : X_MUX2
    port map (
      IB => N0,
      IA => N1,
      SEL => Mcount_ndv_lut(0),
      O => Mcount_ndv_cy(0)
    );
  Mcount_ndv_xor_0_Q : X_XOR2
    port map (
      I0 => N0,
      I1 => Mcount_ndv_lut(0),
      O => Result_0_2
    );
  Mcount_ndv_cy_1_Q : X_MUX2
    port map (
      IB => Mcount_ndv_cy(0),
      IA => N0,
      SEL => Mcount_ndv_cy_1_rt_18,
      O => Mcount_ndv_cy(1)
    );
  Mcount_ndv_xor_1_Q : X_XOR2
    port map (
      I0 => Mcount_ndv_cy(0),
      I1 => Mcount_ndv_cy_1_rt_18,
      O => Result_1_2
    );
  Mcount_ndv_cy_2_Q : X_MUX2
    port map (
      IB => Mcount_ndv_cy(1),
      IA => N0,
      SEL => Mcount_ndv_cy_2_rt_20,
      O => Mcount_ndv_cy(2)
    );
  Mcount_ndv_xor_2_Q : X_XOR2
    port map (
      I0 => Mcount_ndv_cy(1),
      I1 => Mcount_ndv_cy_2_rt_20,
      O => Result_2_2
    );
  Mcount_ndv_cy_3_Q : X_MUX2
    port map (
      IB => Mcount_ndv_cy(2),
      IA => N0,
      SEL => Mcount_ndv_cy_3_rt_22,
      O => Mcount_ndv_cy(3)
    );
  Mcount_ndv_xor_3_Q : X_XOR2
    port map (
      I0 => Mcount_ndv_cy(2),
      I1 => Mcount_ndv_cy_3_rt_22,
      O => Result_3_2
    );
  Mcount_ndv_cy_4_Q : X_MUX2
    port map (
      IB => Mcount_ndv_cy(3),
      IA => N0,
      SEL => Mcount_ndv_cy_4_rt_24,
      O => Mcount_ndv_cy(4)
    );
  Mcount_ndv_xor_4_Q : X_XOR2
    port map (
      I0 => Mcount_ndv_cy(3),
      I1 => Mcount_ndv_cy_4_rt_24,
      O => Result_4_2
    );
  Mcount_ndv_cy_5_Q : X_MUX2
    port map (
      IB => Mcount_ndv_cy(4),
      IA => N0,
      SEL => Mcount_ndv_cy_5_rt_26,
      O => Mcount_ndv_cy(5)
    );
  Mcount_ndv_xor_5_Q : X_XOR2
    port map (
      I0 => Mcount_ndv_cy(4),
      I1 => Mcount_ndv_cy_5_rt_26,
      O => Result_5_2
    );
  Mcount_ndv_cy_6_Q : X_MUX2
    port map (
      IB => Mcount_ndv_cy(5),
      IA => N0,
      SEL => Mcount_ndv_cy_6_rt_28,
      O => Mcount_ndv_cy(6)
    );
  Mcount_ndv_xor_6_Q : X_XOR2
    port map (
      I0 => Mcount_ndv_cy(5),
      I1 => Mcount_ndv_cy_6_rt_28,
      O => Result_6_2
    );
  Mcount_ndv_xor_7_Q : X_XOR2
    port map (
      I0 => Mcount_ndv_cy(6),
      I1 => Mcount_ndv_xor_7_rt_30,
      O => Result_7_2
    );
  Mcount_nfx_cy_0_Q : X_MUX2
    port map (
      IB => N0,
      IA => N1,
      SEL => Mcount_nfx_lut(0),
      O => Mcount_nfx_cy(0)
    );
  Mcount_nfx_xor_0_Q : X_XOR2
    port map (
      I0 => N0,
      I1 => Mcount_nfx_lut(0),
      O => Result_0_3
    );
  Mcount_nfx_cy_1_Q : X_MUX2
    port map (
      IB => Mcount_nfx_cy(0),
      IA => N0,
      SEL => Mcount_nfx_cy_1_rt_33,
      O => Mcount_nfx_cy(1)
    );
  Mcount_nfx_xor_1_Q : X_XOR2
    port map (
      I0 => Mcount_nfx_cy(0),
      I1 => Mcount_nfx_cy_1_rt_33,
      O => Result_1_3
    );
  Mcount_nfx_cy_2_Q : X_MUX2
    port map (
      IB => Mcount_nfx_cy(1),
      IA => N0,
      SEL => Mcount_nfx_cy_2_rt_35,
      O => Mcount_nfx_cy(2)
    );
  Mcount_nfx_xor_2_Q : X_XOR2
    port map (
      I0 => Mcount_nfx_cy(1),
      I1 => Mcount_nfx_cy_2_rt_35,
      O => Result_2_3
    );
  Mcount_nfx_cy_3_Q : X_MUX2
    port map (
      IB => Mcount_nfx_cy(2),
      IA => N0,
      SEL => Mcount_nfx_cy_3_rt_37,
      O => Mcount_nfx_cy(3)
    );
  Mcount_nfx_xor_3_Q : X_XOR2
    port map (
      I0 => Mcount_nfx_cy(2),
      I1 => Mcount_nfx_cy_3_rt_37,
      O => Result_3_3
    );
  Mcount_nfx_cy_4_Q : X_MUX2
    port map (
      IB => Mcount_nfx_cy(3),
      IA => N0,
      SEL => Mcount_nfx_cy_4_rt_39,
      O => Mcount_nfx_cy(4)
    );
  Mcount_nfx_xor_4_Q : X_XOR2
    port map (
      I0 => Mcount_nfx_cy(3),
      I1 => Mcount_nfx_cy_4_rt_39,
      O => Result_4_3
    );
  Mcount_nfx_cy_5_Q : X_MUX2
    port map (
      IB => Mcount_nfx_cy(4),
      IA => N0,
      SEL => Mcount_nfx_cy_5_rt_41,
      O => Mcount_nfx_cy(5)
    );
  Mcount_nfx_xor_5_Q : X_XOR2
    port map (
      I0 => Mcount_nfx_cy(4),
      I1 => Mcount_nfx_cy_5_rt_41,
      O => Result_5_3
    );
  Mcount_nfx_cy_6_Q : X_MUX2
    port map (
      IB => Mcount_nfx_cy(5),
      IA => N0,
      SEL => Mcount_nfx_cy_6_rt_43,
      O => Mcount_nfx_cy(6)
    );
  Mcount_nfx_xor_6_Q : X_XOR2
    port map (
      I0 => Mcount_nfx_cy(5),
      I1 => Mcount_nfx_cy_6_rt_43,
      O => Result_6_3
    );
  Mcount_nfx_xor_7_Q : X_XOR2
    port map (
      I0 => Mcount_nfx_cy(6),
      I1 => Mcount_nfx_xor_7_rt_45,
      O => Result_7_3
    );
  u_ibufg : X_CKBUF
    port map (
      I => clk,
      O => clkin_b
    );
  u_dcm : X_DCM_SP
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
  u_b0 : X_CKBUF
    port map (
      I => clk0_u,
      O => clk0_b
    );
  u_bfx : X_CKBUF
    port map (
      I => clkfx_u,
      O => clkfx_b
    );
  u_bdv : X_CKBUF
    port map (
      I => clkdv_u,
      O => clkdv_b
    );
  u_b2x : X_CKBUF
    port map (
      I => clk2x_u,
      O => clk2x_b
    );
  Maccum_n2x_xor_1_11 : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => n2x(1),
      ADR1 => n2x(0),
      O => Result_1_1
    );
  Maccum_n2x_xor_2_11 : X_LUT3
    generic map(
      INIT => X"56"
    )
    port map (
      ADR0 => n2x(2),
      ADR1 => n2x(0),
      ADR2 => n2x(1),
      O => Result_2_1
    );
  Maccum_n2x_xor_3_11 : X_LUT4
    generic map(
      INIT => X"3C6C"
    )
    port map (
      ADR0 => n2x(0),
      ADR1 => n2x(3),
      ADR2 => n2x(2),
      ADR3 => n2x(1),
      O => Result_3_1
    );
  Maccum_n2x_xor_4_11 : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => n2x(4),
      ADR1 => N2,
      O => Result_4_1
    );
  Maccum_n2x_xor_5_11 : X_LUT3
    generic map(
      INIT => X"6A"
    )
    port map (
      ADR0 => n2x(5),
      ADR1 => n2x(4),
      ADR2 => Maccum_n2x_cy(3),
      O => Result_5_1
    );
  en_IBUF : X_BUF
    port map (
      I => en,
      O => en_IBUF_124
    );
  n2x_0 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk2x_b,
      I => N1,
      SRST => n2x(0),
      O => n2x(0),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  Mcount_n0_cy_1_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => n0_8(1),
      O => Mcount_n0_cy_1_rt_3,
      ADR1 => GND
    );
  Mcount_n0_cy_2_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => n0_8(2),
      O => Mcount_n0_cy_2_rt_5,
      ADR1 => GND
    );
  Mcount_n0_cy_3_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => n0_8(3),
      O => Mcount_n0_cy_3_rt_7,
      ADR1 => GND
    );
  Mcount_n0_cy_4_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => n0_8(4),
      O => Mcount_n0_cy_4_rt_9,
      ADR1 => GND
    );
  Mcount_n0_cy_5_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => n0_8(5),
      O => Mcount_n0_cy_5_rt_11,
      ADR1 => GND
    );
  Mcount_n0_cy_6_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => n0_8(6),
      O => Mcount_n0_cy_6_rt_13,
      ADR1 => GND
    );
  Mcount_ndv_cy_1_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => ndv(1),
      O => Mcount_ndv_cy_1_rt_18,
      ADR1 => GND
    );
  Mcount_ndv_cy_2_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => ndv(2),
      O => Mcount_ndv_cy_2_rt_20,
      ADR1 => GND
    );
  Mcount_ndv_cy_3_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => ndv(3),
      O => Mcount_ndv_cy_3_rt_22,
      ADR1 => GND
    );
  Mcount_ndv_cy_4_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => ndv(4),
      O => Mcount_ndv_cy_4_rt_24,
      ADR1 => GND
    );
  Mcount_ndv_cy_5_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => ndv(5),
      O => Mcount_ndv_cy_5_rt_26,
      ADR1 => GND
    );
  Mcount_ndv_cy_6_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => ndv(6),
      O => Mcount_ndv_cy_6_rt_28,
      ADR1 => GND
    );
  Mcount_nfx_cy_1_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nfx(1),
      O => Mcount_nfx_cy_1_rt_33,
      ADR1 => GND
    );
  Mcount_nfx_cy_2_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nfx(2),
      O => Mcount_nfx_cy_2_rt_35,
      ADR1 => GND
    );
  Mcount_nfx_cy_3_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nfx(3),
      O => Mcount_nfx_cy_3_rt_37,
      ADR1 => GND
    );
  Mcount_nfx_cy_4_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nfx(4),
      O => Mcount_nfx_cy_4_rt_39,
      ADR1 => GND
    );
  Mcount_nfx_cy_5_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nfx(5),
      O => Mcount_nfx_cy_5_rt_41,
      ADR1 => GND
    );
  Mcount_nfx_cy_6_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nfx(6),
      O => Mcount_nfx_cy_6_rt_43,
      ADR1 => GND
    );
  Mcount_n0_xor_7_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => n0_8(7),
      O => Mcount_n0_xor_7_rt_15,
      ADR1 => GND
    );
  Mcount_ndv_xor_7_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => ndv(7),
      O => Mcount_ndv_xor_7_rt_30,
      ADR1 => GND
    );
  Mcount_nfx_xor_7_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nfx(7),
      O => Mcount_nfx_xor_7_rt_45,
      ADR1 => GND
    );
  Maccum_n2x_xor_6_11 : X_LUT4
    generic map(
      INIT => X"6AAA"
    )
    port map (
      ADR0 => n2x(6),
      ADR1 => n2x(5),
      ADR2 => n2x(4),
      ADR3 => Maccum_n2x_cy(3),
      O => Result_6_1
    );
  Maccum_n2x_xor_7_11 : X_LUT4
    generic map(
      INIT => X"A6AA"
    )
    port map (
      ADR0 => n2x(7),
      ADR1 => n2x(5),
      ADR2 => N01,
      ADR3 => Maccum_n2x_cy(3),
      O => Result_7_1
    );
  Mcount_n0_lut_0_INV_0 : X_INV
    port map (
      I => n0_8(0),
      O => Mcount_n0_lut(0)
    );
  Mcount_ndv_lut_0_INV_0 : X_INV
    port map (
      I => ndv(0),
      O => Mcount_ndv_lut(0)
    );
  Mcount_nfx_lut_0_INV_0 : X_INV
    port map (
      I => nfx(0),
      O => Mcount_nfx_lut(0)
    );
  Maccum_n2x_cy_3_11_LUT4_D_BUF : X_BUF
    port map (
      I => Maccum_n2x_cy(3),
      O => N2
    );
  Maccum_n2x_cy_3_11 : X_LUT4
    generic map(
      INIT => X"8880"
    )
    port map (
      ADR0 => n2x(3),
      ADR1 => n2x(2),
      ADR2 => n2x(1),
      ADR3 => n2x(0),
      O => Maccum_n2x_cy(3)
    );
  Maccum_n2x_cy_5_11_SW0_LUT2_L_BUF : X_BUF
    port map (
      I => Maccum_n2x_cy_5_11_SW0_O,
      O => N01
    );
  Maccum_n2x_cy_5_11_SW0 : X_LUT2
    generic map(
      INIT => X"7"
    )
    port map (
      ADR0 => n2x(6),
      ADR1 => n2x(4),
      O => Maccum_n2x_cy_5_11_SW0_O
    );
  c0_0_OBUF : X_OBUF
    port map (
      I => n0_8(0),
      O => c0(0)
    );
  c0_1_OBUF : X_OBUF
    port map (
      I => n0_8(1),
      O => c0(1)
    );
  c0_2_OBUF : X_OBUF
    port map (
      I => n0_8(2),
      O => c0(2)
    );
  c0_3_OBUF : X_OBUF
    port map (
      I => n0_8(3),
      O => c0(3)
    );
  c0_4_OBUF : X_OBUF
    port map (
      I => n0_8(4),
      O => c0(4)
    );
  c0_5_OBUF : X_OBUF
    port map (
      I => n0_8(5),
      O => c0(5)
    );
  c0_6_OBUF : X_OBUF
    port map (
      I => n0_8(6),
      O => c0(6)
    );
  c0_7_OBUF : X_OBUF
    port map (
      I => n0_8(7),
      O => c0(7)
    );
  c2x_0_OBUF : X_OBUF
    port map (
      I => n2x(0),
      O => c2x(0)
    );
  c2x_1_OBUF : X_OBUF
    port map (
      I => n2x(1),
      O => c2x(1)
    );
  c2x_2_OBUF : X_OBUF
    port map (
      I => n2x(2),
      O => c2x(2)
    );
  c2x_3_OBUF : X_OBUF
    port map (
      I => n2x(3),
      O => c2x(3)
    );
  c2x_4_OBUF : X_OBUF
    port map (
      I => n2x(4),
      O => c2x(4)
    );
  c2x_5_OBUF : X_OBUF
    port map (
      I => n2x(5),
      O => c2x(5)
    );
  c2x_6_OBUF : X_OBUF
    port map (
      I => n2x(6),
      O => c2x(6)
    );
  c2x_7_OBUF : X_OBUF
    port map (
      I => n2x(7),
      O => c2x(7)
    );
  cdv_0_OBUF : X_OBUF
    port map (
      I => ndv(0),
      O => cdv(0)
    );
  cdv_1_OBUF : X_OBUF
    port map (
      I => ndv(1),
      O => cdv(1)
    );
  cdv_2_OBUF : X_OBUF
    port map (
      I => ndv(2),
      O => cdv(2)
    );
  cdv_3_OBUF : X_OBUF
    port map (
      I => ndv(3),
      O => cdv(3)
    );
  cdv_4_OBUF : X_OBUF
    port map (
      I => ndv(4),
      O => cdv(4)
    );
  cdv_5_OBUF : X_OBUF
    port map (
      I => ndv(5),
      O => cdv(5)
    );
  cdv_6_OBUF : X_OBUF
    port map (
      I => ndv(6),
      O => cdv(6)
    );
  cdv_7_OBUF : X_OBUF
    port map (
      I => ndv(7),
      O => cdv(7)
    );
  cfx_0_OBUF : X_OBUF
    port map (
      I => nfx(0),
      O => cfx(0)
    );
  cfx_1_OBUF : X_OBUF
    port map (
      I => nfx(1),
      O => cfx(1)
    );
  cfx_2_OBUF : X_OBUF
    port map (
      I => nfx(2),
      O => cfx(2)
    );
  cfx_3_OBUF : X_OBUF
    port map (
      I => nfx(3),
      O => cfx(3)
    );
  cfx_4_OBUF : X_OBUF
    port map (
      I => nfx(4),
      O => cfx(4)
    );
  cfx_5_OBUF : X_OBUF
    port map (
      I => nfx(5),
      O => cfx(5)
    );
  cfx_6_OBUF : X_OBUF
    port map (
      I => nfx(6),
      O => cfx(6)
    );
  cfx_7_OBUF : X_OBUF
    port map (
      I => nfx(7),
      O => cfx(7)
    );
  locked_OBUF : X_OBUF
    port map (
      I => locked_OBUF_127,
      O => locked
    );
  NlwBlock_top_VCC : X_ONE
    port map (
      O => VCC
    );
  NlwBlock_top_GND : X_ZERO
    port map (
      O => GND
    );
  NlwBlockROC : X_ROC
    port map (O => GSR);
  NlwBlockTOC : X_TOC
    port map (O => GTS);

end STRUCTURE;

