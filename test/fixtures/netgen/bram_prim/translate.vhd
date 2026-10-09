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
-- Device	: 3s500efg320-4
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
    we_a : in STD_LOGIC := 'X';
    we_b : in STD_LOGIC := 'X';
    dop_a : out STD_LOGIC;
    en_a : in STD_LOGIC := 'X';
    en_b : in STD_LOGIC := 'X';
    dip_a : in STD_LOGIC := 'X';
    ssr_a : in STD_LOGIC := 'X';
    ssr_b : in STD_LOGIC := 'X';
    do_a : out STD_LOGIC_VECTOR ( 7 downto 0 );
    do_b : out STD_LOGIC_VECTOR ( 31 downto 0 );
    do_c : out STD_LOGIC_VECTOR ( 15 downto 0 );
    dop_b : out STD_LOGIC_VECTOR ( 3 downto 0 );
    dop_c : out STD_LOGIC_VECTOR ( 1 downto 0 );
    addr_a : in STD_LOGIC_VECTOR ( 10 downto 0 );
    addr_b : in STD_LOGIC_VECTOR ( 8 downto 0 );
    di_a : in STD_LOGIC_VECTOR ( 7 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal N0 : STD_LOGIC;
  signal N1 : STD_LOGIC;
  signal addr_a_0_IBUF_16 : STD_LOGIC;
  signal addr_a_10_IBUF_17 : STD_LOGIC;
  signal addr_a_1_IBUF_18 : STD_LOGIC;
  signal addr_a_2_IBUF_19 : STD_LOGIC;
  signal addr_a_3_IBUF_20 : STD_LOGIC;
  signal addr_a_4_IBUF_21 : STD_LOGIC;
  signal addr_a_5_IBUF_22 : STD_LOGIC;
  signal addr_a_6_IBUF_23 : STD_LOGIC;
  signal addr_a_7_IBUF_24 : STD_LOGIC;
  signal addr_a_8_IBUF_25 : STD_LOGIC;
  signal addr_a_9_IBUF_26 : STD_LOGIC;
  signal addr_b_0_IBUF_36 : STD_LOGIC;
  signal addr_b_1_IBUF_37 : STD_LOGIC;
  signal addr_b_2_IBUF_38 : STD_LOGIC;
  signal addr_b_3_IBUF_39 : STD_LOGIC;
  signal addr_b_4_IBUF_40 : STD_LOGIC;
  signal addr_b_5_IBUF_41 : STD_LOGIC;
  signal addr_b_6_IBUF_42 : STD_LOGIC;
  signal addr_b_7_IBUF_43 : STD_LOGIC;
  signal addr_b_8_IBUF_44 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal di_a_0_IBUF_55 : STD_LOGIC;
  signal di_a_1_IBUF_56 : STD_LOGIC;
  signal di_a_2_IBUF_57 : STD_LOGIC;
  signal di_a_3_IBUF_58 : STD_LOGIC;
  signal di_a_4_IBUF_59 : STD_LOGIC;
  signal di_a_5_IBUF_60 : STD_LOGIC;
  signal di_a_6_IBUF_61 : STD_LOGIC;
  signal di_a_7_IBUF_62 : STD_LOGIC;
  signal dip_a_IBUF_72 : STD_LOGIC;
  signal do_a_0_OBUF_82 : STD_LOGIC;
  signal do_a_1_OBUF_83 : STD_LOGIC;
  signal do_a_2_OBUF_84 : STD_LOGIC;
  signal do_a_3_OBUF_85 : STD_LOGIC;
  signal do_a_4_OBUF_86 : STD_LOGIC;
  signal do_a_5_OBUF_87 : STD_LOGIC;
  signal do_a_6_OBUF_88 : STD_LOGIC;
  signal do_a_7_OBUF_89 : STD_LOGIC;
  signal do_b_0_OBUF_122 : STD_LOGIC;
  signal do_b_10_OBUF_123 : STD_LOGIC;
  signal do_b_11_OBUF_124 : STD_LOGIC;
  signal do_b_12_OBUF_125 : STD_LOGIC;
  signal do_b_13_OBUF_126 : STD_LOGIC;
  signal do_b_14_OBUF_127 : STD_LOGIC;
  signal do_b_15_OBUF_128 : STD_LOGIC;
  signal do_b_16_OBUF_129 : STD_LOGIC;
  signal do_b_17_OBUF_130 : STD_LOGIC;
  signal do_b_18_OBUF_131 : STD_LOGIC;
  signal do_b_19_OBUF_132 : STD_LOGIC;
  signal do_b_1_OBUF_133 : STD_LOGIC;
  signal do_b_20_OBUF_134 : STD_LOGIC;
  signal do_b_21_OBUF_135 : STD_LOGIC;
  signal do_b_22_OBUF_136 : STD_LOGIC;
  signal do_b_23_OBUF_137 : STD_LOGIC;
  signal do_b_24_OBUF_138 : STD_LOGIC;
  signal do_b_25_OBUF_139 : STD_LOGIC;
  signal do_b_26_OBUF_140 : STD_LOGIC;
  signal do_b_27_OBUF_141 : STD_LOGIC;
  signal do_b_28_OBUF_142 : STD_LOGIC;
  signal do_b_29_OBUF_143 : STD_LOGIC;
  signal do_b_2_OBUF_144 : STD_LOGIC;
  signal do_b_30_OBUF_145 : STD_LOGIC;
  signal do_b_31_OBUF_146 : STD_LOGIC;
  signal do_b_3_OBUF_147 : STD_LOGIC;
  signal do_b_4_OBUF_148 : STD_LOGIC;
  signal do_b_5_OBUF_149 : STD_LOGIC;
  signal do_b_6_OBUF_150 : STD_LOGIC;
  signal do_b_7_OBUF_151 : STD_LOGIC;
  signal do_b_8_OBUF_152 : STD_LOGIC;
  signal do_b_9_OBUF_153 : STD_LOGIC;
  signal do_c_0_OBUF_170 : STD_LOGIC;
  signal do_c_10_OBUF_171 : STD_LOGIC;
  signal do_c_11_OBUF_172 : STD_LOGIC;
  signal do_c_12_OBUF_173 : STD_LOGIC;
  signal do_c_13_OBUF_174 : STD_LOGIC;
  signal do_c_14_OBUF_175 : STD_LOGIC;
  signal do_c_15_OBUF_176 : STD_LOGIC;
  signal do_c_1_OBUF_177 : STD_LOGIC;
  signal do_c_2_OBUF_178 : STD_LOGIC;
  signal do_c_3_OBUF_179 : STD_LOGIC;
  signal do_c_4_OBUF_180 : STD_LOGIC;
  signal do_c_5_OBUF_181 : STD_LOGIC;
  signal do_c_6_OBUF_182 : STD_LOGIC;
  signal do_c_7_OBUF_183 : STD_LOGIC;
  signal do_c_8_OBUF_184 : STD_LOGIC;
  signal do_c_9_OBUF_185 : STD_LOGIC;
  signal dop_a_OBUF_187 : STD_LOGIC;
  signal dop_b_0_OBUF_192 : STD_LOGIC;
  signal dop_b_1_OBUF_193 : STD_LOGIC;
  signal dop_b_2_OBUF_194 : STD_LOGIC;
  signal dop_b_3_OBUF_195 : STD_LOGIC;
  signal dop_c_0_OBUF_198 : STD_LOGIC;
  signal dop_c_1_OBUF_199 : STD_LOGIC;
  signal en_a_IBUF_201 : STD_LOGIC;
  signal en_b_IBUF_203 : STD_LOGIC;
  signal ssr_a_IBUF_205 : STD_LOGIC;
  signal ssr_b_IBUF_207 : STD_LOGIC;
  signal we_a_IBUF_209 : STD_LOGIC;
  signal we_b_IBUF_211 : STD_LOGIC;
  signal clk_BUFGP_IBUFG_2 : STD_LOGIC;
  signal di_b : STD_LOGIC_VECTOR ( 23 downto 16 );
  signal dip_b : STD_LOGIC_VECTOR ( 2 downto 2 );
begin
  XST_GND : X_ZERO
    port map (
      O => N0
    );
  XST_VCC : X_ONE
    port map (
      O => N1
    );
  we_a_IBUF : X_BUF
    port map (
      I => we_a,
      O => we_a_IBUF_209
    );
  we_b_IBUF : X_BUF
    port map (
      I => we_b,
      O => we_b_IBUF_211
    );
  en_a_IBUF : X_BUF
    port map (
      I => en_a,
      O => en_a_IBUF_201
    );
  en_b_IBUF : X_BUF
    port map (
      I => en_b,
      O => en_b_IBUF_203
    );
  dip_a_IBUF : X_BUF
    port map (
      I => dip_a,
      O => dip_a_IBUF_72
    );
  ssr_a_IBUF : X_BUF
    port map (
      I => ssr_a,
      O => ssr_a_IBUF_205
    );
  ssr_b_IBUF : X_BUF
    port map (
      I => ssr_b,
      O => ssr_b_IBUF_207
    );
  addr_a_10_IBUF : X_BUF
    port map (
      I => addr_a(10),
      O => addr_a_10_IBUF_17
    );
  addr_a_9_IBUF : X_BUF
    port map (
      I => addr_a(9),
      O => addr_a_9_IBUF_26
    );
  addr_a_8_IBUF : X_BUF
    port map (
      I => addr_a(8),
      O => addr_a_8_IBUF_25
    );
  addr_a_7_IBUF : X_BUF
    port map (
      I => addr_a(7),
      O => addr_a_7_IBUF_24
    );
  addr_a_6_IBUF : X_BUF
    port map (
      I => addr_a(6),
      O => addr_a_6_IBUF_23
    );
  addr_a_5_IBUF : X_BUF
    port map (
      I => addr_a(5),
      O => addr_a_5_IBUF_22
    );
  addr_a_4_IBUF : X_BUF
    port map (
      I => addr_a(4),
      O => addr_a_4_IBUF_21
    );
  addr_a_3_IBUF : X_BUF
    port map (
      I => addr_a(3),
      O => addr_a_3_IBUF_20
    );
  addr_a_2_IBUF : X_BUF
    port map (
      I => addr_a(2),
      O => addr_a_2_IBUF_19
    );
  addr_a_1_IBUF : X_BUF
    port map (
      I => addr_a(1),
      O => addr_a_1_IBUF_18
    );
  addr_a_0_IBUF : X_BUF
    port map (
      I => addr_a(0),
      O => addr_a_0_IBUF_16
    );
  addr_b_8_IBUF : X_BUF
    port map (
      I => addr_b(8),
      O => addr_b_8_IBUF_44
    );
  addr_b_7_IBUF : X_BUF
    port map (
      I => addr_b(7),
      O => addr_b_7_IBUF_43
    );
  addr_b_6_IBUF : X_BUF
    port map (
      I => addr_b(6),
      O => addr_b_6_IBUF_42
    );
  addr_b_5_IBUF : X_BUF
    port map (
      I => addr_b(5),
      O => addr_b_5_IBUF_41
    );
  addr_b_4_IBUF : X_BUF
    port map (
      I => addr_b(4),
      O => addr_b_4_IBUF_40
    );
  addr_b_3_IBUF : X_BUF
    port map (
      I => addr_b(3),
      O => addr_b_3_IBUF_39
    );
  addr_b_2_IBUF : X_BUF
    port map (
      I => addr_b(2),
      O => addr_b_2_IBUF_38
    );
  addr_b_1_IBUF : X_BUF
    port map (
      I => addr_b(1),
      O => addr_b_1_IBUF_37
    );
  addr_b_0_IBUF : X_BUF
    port map (
      I => addr_b(0),
      O => addr_b_0_IBUF_36
    );
  di_a_7_IBUF : X_BUF
    port map (
      I => di_a(7),
      O => di_a_7_IBUF_62
    );
  di_a_6_IBUF : X_BUF
    port map (
      I => di_a(6),
      O => di_a_6_IBUF_61
    );
  di_a_5_IBUF : X_BUF
    port map (
      I => di_a(5),
      O => di_a_5_IBUF_60
    );
  di_a_4_IBUF : X_BUF
    port map (
      I => di_a(4),
      O => di_a_4_IBUF_59
    );
  di_a_3_IBUF : X_BUF
    port map (
      I => di_a(3),
      O => di_a_3_IBUF_58
    );
  di_a_2_IBUF : X_BUF
    port map (
      I => di_a(2),
      O => di_a_2_IBUF_57
    );
  di_a_1_IBUF : X_BUF
    port map (
      I => di_a(1),
      O => di_a_1_IBUF_56
    );
  di_a_0_IBUF : X_BUF
    port map (
      I => di_a(0),
      O => di_a_0_IBUF_55
    );
  u_s18 : X_RAMB16_S18
    generic map(
      INIT_3F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT => X"00F0F",
      INITP_00 => X"000000000000000000000000000000000000000000000000000000001B1B1B1B",
      INITP_01 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_02 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_03 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_04 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_05 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_06 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_07 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_00 => X"FFFFEEEEDDDDCCCCBBBBAAAA9999888877776666555544443333222211110000",
      INIT_01 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_02 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_03 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_04 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_05 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_06 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_07 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_08 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_09 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_10 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_11 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_12 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_13 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_14 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_15 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_16 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_17 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_18 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_19 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_20 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_21 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_22 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_23 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_24 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_25 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_26 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_27 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_28 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_29 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_30 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_31 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_32 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_33 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_34 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_35 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_36 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_37 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_38 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_39 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3E => X"0000000000000000000000000000000000000000000000000000000000000000",
      WRITE_MODE => "NO_CHANGE",
      SRVAL => X"38001"
    )
    port map (
      CLK => clk_BUFGP,
      EN => en_b_IBUF_203,
      SSR => ssr_a_IBUF_205,
      WE => we_a_IBUF_209,
      ADDR(9) => addr_a_9_IBUF_26,
      ADDR(8) => addr_a_8_IBUF_25,
      ADDR(7) => addr_a_7_IBUF_24,
      ADDR(6) => addr_a_6_IBUF_23,
      ADDR(5) => addr_a_5_IBUF_22,
      ADDR(4) => addr_a_4_IBUF_21,
      ADDR(3) => addr_a_3_IBUF_20,
      ADDR(2) => addr_a_2_IBUF_19,
      ADDR(1) => addr_a_1_IBUF_18,
      ADDR(0) => addr_a_0_IBUF_16,
      DI(15) => di_a_7_IBUF_62,
      DI(14) => di_a_6_IBUF_61,
      DI(13) => di_a_5_IBUF_60,
      DI(12) => di_a_4_IBUF_59,
      DI(11) => di_a_3_IBUF_58,
      DI(10) => di_a_2_IBUF_57,
      DI(9) => di_a_1_IBUF_56,
      DI(8) => di_a_0_IBUF_55,
      DI(7) => di_b(23),
      DI(6) => di_b(22),
      DI(5) => di_b(21),
      DI(4) => di_b(20),
      DI(3) => di_b(19),
      DI(2) => di_b(18),
      DI(1) => di_b(17),
      DI(0) => di_b(16),
      DIP(1) => N1,
      DIP(0) => N0,
      DO(15) => do_c_15_OBUF_176,
      DO(14) => do_c_14_OBUF_175,
      DO(13) => do_c_13_OBUF_174,
      DO(12) => do_c_12_OBUF_173,
      DO(11) => do_c_11_OBUF_172,
      DO(10) => do_c_10_OBUF_171,
      DO(9) => do_c_9_OBUF_185,
      DO(8) => do_c_8_OBUF_184,
      DO(7) => do_c_7_OBUF_183,
      DO(6) => do_c_6_OBUF_182,
      DO(5) => do_c_5_OBUF_181,
      DO(4) => do_c_4_OBUF_180,
      DO(3) => do_c_3_OBUF_179,
      DO(2) => do_c_2_OBUF_178,
      DO(1) => do_c_1_OBUF_177,
      DO(0) => do_c_0_OBUF_170,
      DOP(1) => dop_c_1_OBUF_199,
      DOP(0) => dop_c_0_OBUF_198
    );
  u_asym : X_RAMB16_S9_S36
    generic map(
      SRVAL_A => X"03C",
      INITP_00 => X"000000000000000000000000000000000000000000000000F0F0F0F0A5A5C3C3",
      INITP_01 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_02 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_03 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_04 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_05 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_06 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_07 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_00 => X"00112233445566778899AABBCCDDEEFF0F1E2D3C4B5A69788796A5B4C3D2E1F0",
      INIT_01 => X"DEADBEEFCAFEBABE0123456789ABCDEFFEDCBA9876543210A5A5A5A55A5A5A5A",
      INIT_02 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_03 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_04 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_05 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_06 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_07 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_08 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_09 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_10 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_11 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_12 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_13 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_14 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_15 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_16 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_17 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_18 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_19 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_20 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_21 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_22 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_23 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_24 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_25 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_26 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_27 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_28 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_29 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_30 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_31 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_32 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_33 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_34 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_35 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_36 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_37 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_38 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_39 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_A => X"1A5",
      INIT_B => X"F01234567",
      WRITE_MODE_A => "WRITE_FIRST",
      WRITE_MODE_B => "READ_FIRST",
      SRVAL_B => X"989ABCDEF",
      SIM_COLLISION_CHECK => "ALL"
    )
    port map (
      CLKA => clk_BUFGP,
      CLKB => clk_BUFGP,
      ENA => en_a_IBUF_201,
      ENB => en_b_IBUF_203,
      SSRA => ssr_a_IBUF_205,
      SSRB => ssr_b_IBUF_207,
      WEA => we_a_IBUF_209,
      WEB => we_b_IBUF_211,
      ADDRA(10) => addr_a_10_IBUF_17,
      ADDRA(9) => addr_a_9_IBUF_26,
      ADDRA(8) => addr_a_8_IBUF_25,
      ADDRA(7) => addr_a_7_IBUF_24,
      ADDRA(6) => addr_a_6_IBUF_23,
      ADDRA(5) => addr_a_5_IBUF_22,
      ADDRA(4) => addr_a_4_IBUF_21,
      ADDRA(3) => addr_a_3_IBUF_20,
      ADDRA(2) => addr_a_2_IBUF_19,
      ADDRA(1) => addr_a_1_IBUF_18,
      ADDRA(0) => addr_a_0_IBUF_16,
      ADDRB(8) => addr_b_8_IBUF_44,
      ADDRB(7) => addr_b_7_IBUF_43,
      ADDRB(6) => addr_b_6_IBUF_42,
      ADDRB(5) => addr_b_5_IBUF_41,
      ADDRB(4) => addr_b_4_IBUF_40,
      ADDRB(3) => addr_b_3_IBUF_39,
      ADDRB(2) => addr_b_2_IBUF_38,
      ADDRB(1) => addr_b_1_IBUF_37,
      ADDRB(0) => addr_b_0_IBUF_36,
      DIA(7) => di_a_7_IBUF_62,
      DIA(6) => di_a_6_IBUF_61,
      DIA(5) => di_a_5_IBUF_60,
      DIA(4) => di_a_4_IBUF_59,
      DIA(3) => di_a_3_IBUF_58,
      DIA(2) => di_a_2_IBUF_57,
      DIA(1) => di_a_1_IBUF_56,
      DIA(0) => di_a_0_IBUF_55,
      DIB(31) => di_a_7_IBUF_62,
      DIB(30) => di_a_6_IBUF_61,
      DIB(29) => di_a_5_IBUF_60,
      DIB(28) => di_a_4_IBUF_59,
      DIB(27) => di_a_3_IBUF_58,
      DIB(26) => di_a_2_IBUF_57,
      DIB(25) => di_a_1_IBUF_56,
      DIB(24) => di_a_0_IBUF_55,
      DIB(23) => di_b(23),
      DIB(22) => di_b(22),
      DIB(21) => di_b(21),
      DIB(20) => di_b(20),
      DIB(19) => di_b(19),
      DIB(18) => di_b(18),
      DIB(17) => di_b(17),
      DIB(16) => di_b(16),
      DIB(15) => di_a_3_IBUF_58,
      DIB(14) => di_a_2_IBUF_57,
      DIB(13) => di_a_1_IBUF_56,
      DIB(12) => di_a_0_IBUF_55,
      DIB(11) => di_a_7_IBUF_62,
      DIB(10) => di_a_6_IBUF_61,
      DIB(9) => di_a_5_IBUF_60,
      DIB(8) => di_a_4_IBUF_59,
      DIB(7) => di_a_7_IBUF_62,
      DIB(6) => di_b(22),
      DIB(5) => di_a_5_IBUF_60,
      DIB(4) => di_b(20),
      DIB(3) => di_b(19),
      DIB(2) => di_a_2_IBUF_57,
      DIB(1) => di_b(17),
      DIB(0) => di_a_0_IBUF_55,
      DIPA(0) => dip_a_IBUF_72,
      DIPB(3) => dip_a_IBUF_72,
      DIPB(2) => dip_b(2),
      DIPB(1) => dip_a_IBUF_72,
      DIPB(0) => dip_a_IBUF_72,
      DOA(7) => do_a_7_OBUF_89,
      DOA(6) => do_a_6_OBUF_88,
      DOA(5) => do_a_5_OBUF_87,
      DOA(4) => do_a_4_OBUF_86,
      DOA(3) => do_a_3_OBUF_85,
      DOA(2) => do_a_2_OBUF_84,
      DOA(1) => do_a_1_OBUF_83,
      DOA(0) => do_a_0_OBUF_82,
      DOPA(0) => dop_a_OBUF_187,
      DOB(31) => do_b_31_OBUF_146,
      DOB(30) => do_b_30_OBUF_145,
      DOB(29) => do_b_29_OBUF_143,
      DOB(28) => do_b_28_OBUF_142,
      DOB(27) => do_b_27_OBUF_141,
      DOB(26) => do_b_26_OBUF_140,
      DOB(25) => do_b_25_OBUF_139,
      DOB(24) => do_b_24_OBUF_138,
      DOB(23) => do_b_23_OBUF_137,
      DOB(22) => do_b_22_OBUF_136,
      DOB(21) => do_b_21_OBUF_135,
      DOB(20) => do_b_20_OBUF_134,
      DOB(19) => do_b_19_OBUF_132,
      DOB(18) => do_b_18_OBUF_131,
      DOB(17) => do_b_17_OBUF_130,
      DOB(16) => do_b_16_OBUF_129,
      DOB(15) => do_b_15_OBUF_128,
      DOB(14) => do_b_14_OBUF_127,
      DOB(13) => do_b_13_OBUF_126,
      DOB(12) => do_b_12_OBUF_125,
      DOB(11) => do_b_11_OBUF_124,
      DOB(10) => do_b_10_OBUF_123,
      DOB(9) => do_b_9_OBUF_153,
      DOB(8) => do_b_8_OBUF_152,
      DOB(7) => do_b_7_OBUF_151,
      DOB(6) => do_b_6_OBUF_150,
      DOB(5) => do_b_5_OBUF_149,
      DOB(4) => do_b_4_OBUF_148,
      DOB(3) => do_b_3_OBUF_147,
      DOB(2) => do_b_2_OBUF_144,
      DOB(1) => do_b_1_OBUF_133,
      DOB(0) => do_b_0_OBUF_122,
      DOPB(3) => dop_b_3_OBUF_195,
      DOPB(2) => dop_b_2_OBUF_194,
      DOPB(1) => dop_b_1_OBUF_193,
      DOPB(0) => dop_b_0_OBUF_192
    );
  dip_b_not00011_INV_0 : X_INV
    port map (
      I => dip_a_IBUF_72,
      O => dip_b(2)
    );
  di_b_not0001_7_1_INV_0 : X_INV
    port map (
      I => di_a_7_IBUF_62,
      O => di_b(23)
    );
  di_b_not0001_5_1_INV_0 : X_INV
    port map (
      I => di_a_5_IBUF_60,
      O => di_b(21)
    );
  di_b_not0001_2_1_INV_0 : X_INV
    port map (
      I => di_a_2_IBUF_57,
      O => di_b(18)
    );
  di_b_not0001_0_1_INV_0 : X_INV
    port map (
      I => di_a_0_IBUF_55,
      O => di_b(16)
    );
  di_b_22_1_INV_0 : X_INV
    port map (
      I => di_a_6_IBUF_61,
      O => di_b(22)
    );
  di_b_20_1_INV_0 : X_INV
    port map (
      I => di_a_4_IBUF_59,
      O => di_b(20)
    );
  di_b_19_1_INV_0 : X_INV
    port map (
      I => di_a_3_IBUF_58,
      O => di_b(19)
    );
  di_b_17_1_INV_0 : X_INV
    port map (
      I => di_a_1_IBUF_56,
      O => di_b(17)
    );
  clk_BUFGP_BUFG : X_CKBUF
    port map (
      I => clk_BUFGP_IBUFG_2,
      O => clk_BUFGP
    );
  clk_BUFGP_IBUFG : X_CKBUF
    port map (
      I => clk,
      O => clk_BUFGP_IBUFG_2
    );
  do_a_0_OBUF : X_OBUF
    port map (
      I => do_a_0_OBUF_82,
      O => do_a(0)
    );
  do_a_1_OBUF : X_OBUF
    port map (
      I => do_a_1_OBUF_83,
      O => do_a(1)
    );
  do_a_2_OBUF : X_OBUF
    port map (
      I => do_a_2_OBUF_84,
      O => do_a(2)
    );
  do_a_3_OBUF : X_OBUF
    port map (
      I => do_a_3_OBUF_85,
      O => do_a(3)
    );
  do_a_4_OBUF : X_OBUF
    port map (
      I => do_a_4_OBUF_86,
      O => do_a(4)
    );
  do_a_5_OBUF : X_OBUF
    port map (
      I => do_a_5_OBUF_87,
      O => do_a(5)
    );
  do_a_6_OBUF : X_OBUF
    port map (
      I => do_a_6_OBUF_88,
      O => do_a(6)
    );
  do_a_7_OBUF : X_OBUF
    port map (
      I => do_a_7_OBUF_89,
      O => do_a(7)
    );
  do_b_0_OBUF : X_OBUF
    port map (
      I => do_b_0_OBUF_122,
      O => do_b(0)
    );
  do_b_10_OBUF : X_OBUF
    port map (
      I => do_b_10_OBUF_123,
      O => do_b(10)
    );
  do_b_11_OBUF : X_OBUF
    port map (
      I => do_b_11_OBUF_124,
      O => do_b(11)
    );
  do_b_12_OBUF : X_OBUF
    port map (
      I => do_b_12_OBUF_125,
      O => do_b(12)
    );
  do_b_13_OBUF : X_OBUF
    port map (
      I => do_b_13_OBUF_126,
      O => do_b(13)
    );
  do_b_14_OBUF : X_OBUF
    port map (
      I => do_b_14_OBUF_127,
      O => do_b(14)
    );
  do_b_15_OBUF : X_OBUF
    port map (
      I => do_b_15_OBUF_128,
      O => do_b(15)
    );
  do_b_16_OBUF : X_OBUF
    port map (
      I => do_b_16_OBUF_129,
      O => do_b(16)
    );
  do_b_17_OBUF : X_OBUF
    port map (
      I => do_b_17_OBUF_130,
      O => do_b(17)
    );
  do_b_18_OBUF : X_OBUF
    port map (
      I => do_b_18_OBUF_131,
      O => do_b(18)
    );
  do_b_19_OBUF : X_OBUF
    port map (
      I => do_b_19_OBUF_132,
      O => do_b(19)
    );
  do_b_1_OBUF : X_OBUF
    port map (
      I => do_b_1_OBUF_133,
      O => do_b(1)
    );
  do_b_20_OBUF : X_OBUF
    port map (
      I => do_b_20_OBUF_134,
      O => do_b(20)
    );
  do_b_21_OBUF : X_OBUF
    port map (
      I => do_b_21_OBUF_135,
      O => do_b(21)
    );
  do_b_22_OBUF : X_OBUF
    port map (
      I => do_b_22_OBUF_136,
      O => do_b(22)
    );
  do_b_23_OBUF : X_OBUF
    port map (
      I => do_b_23_OBUF_137,
      O => do_b(23)
    );
  do_b_24_OBUF : X_OBUF
    port map (
      I => do_b_24_OBUF_138,
      O => do_b(24)
    );
  do_b_25_OBUF : X_OBUF
    port map (
      I => do_b_25_OBUF_139,
      O => do_b(25)
    );
  do_b_26_OBUF : X_OBUF
    port map (
      I => do_b_26_OBUF_140,
      O => do_b(26)
    );
  do_b_27_OBUF : X_OBUF
    port map (
      I => do_b_27_OBUF_141,
      O => do_b(27)
    );
  do_b_28_OBUF : X_OBUF
    port map (
      I => do_b_28_OBUF_142,
      O => do_b(28)
    );
  do_b_29_OBUF : X_OBUF
    port map (
      I => do_b_29_OBUF_143,
      O => do_b(29)
    );
  do_b_2_OBUF : X_OBUF
    port map (
      I => do_b_2_OBUF_144,
      O => do_b(2)
    );
  do_b_30_OBUF : X_OBUF
    port map (
      I => do_b_30_OBUF_145,
      O => do_b(30)
    );
  do_b_31_OBUF : X_OBUF
    port map (
      I => do_b_31_OBUF_146,
      O => do_b(31)
    );
  do_b_3_OBUF : X_OBUF
    port map (
      I => do_b_3_OBUF_147,
      O => do_b(3)
    );
  do_b_4_OBUF : X_OBUF
    port map (
      I => do_b_4_OBUF_148,
      O => do_b(4)
    );
  do_b_5_OBUF : X_OBUF
    port map (
      I => do_b_5_OBUF_149,
      O => do_b(5)
    );
  do_b_6_OBUF : X_OBUF
    port map (
      I => do_b_6_OBUF_150,
      O => do_b(6)
    );
  do_b_7_OBUF : X_OBUF
    port map (
      I => do_b_7_OBUF_151,
      O => do_b(7)
    );
  do_b_8_OBUF : X_OBUF
    port map (
      I => do_b_8_OBUF_152,
      O => do_b(8)
    );
  do_b_9_OBUF : X_OBUF
    port map (
      I => do_b_9_OBUF_153,
      O => do_b(9)
    );
  do_c_0_OBUF : X_OBUF
    port map (
      I => do_c_0_OBUF_170,
      O => do_c(0)
    );
  do_c_10_OBUF : X_OBUF
    port map (
      I => do_c_10_OBUF_171,
      O => do_c(10)
    );
  do_c_11_OBUF : X_OBUF
    port map (
      I => do_c_11_OBUF_172,
      O => do_c(11)
    );
  do_c_12_OBUF : X_OBUF
    port map (
      I => do_c_12_OBUF_173,
      O => do_c(12)
    );
  do_c_13_OBUF : X_OBUF
    port map (
      I => do_c_13_OBUF_174,
      O => do_c(13)
    );
  do_c_14_OBUF : X_OBUF
    port map (
      I => do_c_14_OBUF_175,
      O => do_c(14)
    );
  do_c_15_OBUF : X_OBUF
    port map (
      I => do_c_15_OBUF_176,
      O => do_c(15)
    );
  do_c_1_OBUF : X_OBUF
    port map (
      I => do_c_1_OBUF_177,
      O => do_c(1)
    );
  do_c_2_OBUF : X_OBUF
    port map (
      I => do_c_2_OBUF_178,
      O => do_c(2)
    );
  do_c_3_OBUF : X_OBUF
    port map (
      I => do_c_3_OBUF_179,
      O => do_c(3)
    );
  do_c_4_OBUF : X_OBUF
    port map (
      I => do_c_4_OBUF_180,
      O => do_c(4)
    );
  do_c_5_OBUF : X_OBUF
    port map (
      I => do_c_5_OBUF_181,
      O => do_c(5)
    );
  do_c_6_OBUF : X_OBUF
    port map (
      I => do_c_6_OBUF_182,
      O => do_c(6)
    );
  do_c_7_OBUF : X_OBUF
    port map (
      I => do_c_7_OBUF_183,
      O => do_c(7)
    );
  do_c_8_OBUF : X_OBUF
    port map (
      I => do_c_8_OBUF_184,
      O => do_c(8)
    );
  do_c_9_OBUF : X_OBUF
    port map (
      I => do_c_9_OBUF_185,
      O => do_c(9)
    );
  dop_a_OBUF : X_OBUF
    port map (
      I => dop_a_OBUF_187,
      O => dop_a
    );
  dop_b_0_OBUF : X_OBUF
    port map (
      I => dop_b_0_OBUF_192,
      O => dop_b(0)
    );
  dop_b_1_OBUF : X_OBUF
    port map (
      I => dop_b_1_OBUF_193,
      O => dop_b(1)
    );
  dop_b_2_OBUF : X_OBUF
    port map (
      I => dop_b_2_OBUF_194,
      O => dop_b(2)
    );
  dop_b_3_OBUF : X_OBUF
    port map (
      I => dop_b_3_OBUF_195,
      O => dop_b(3)
    );
  dop_c_0_OBUF : X_OBUF
    port map (
      I => dop_c_0_OBUF_198,
      O => dop_c(0)
    );
  dop_c_1_OBUF : X_OBUF
    port map (
      I => dop_c_1_OBUF_199,
      O => dop_c(1)
    );
  NlwBlockROC : X_ROC
    port map (O => GSR);
  NlwBlockTOC : X_TOC
    port map (O => GTS);

end STRUCTURE;

