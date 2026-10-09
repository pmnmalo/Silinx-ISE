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
-- Device	: xc3s500e-4-fg320
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
    ce : in STD_LOGIC := 'X';
    rst : in STD_LOGIC := 'X';
    pf : out STD_LOGIC_VECTOR ( 35 downto 0 );
    ps : out STD_LOGIC_VECTOR ( 21 downto 0 );
    pu : out STD_LOGIC_VECTOR ( 15 downto 0 );
    a : in STD_LOGIC_VECTOR ( 17 downto 0 );
    b : in STD_LOGIC_VECTOR ( 17 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal N0 : STD_LOGIC;
  signal N1 : STD_LOGIC;
  signal a_0_IBUF_20 : STD_LOGIC;
  signal a_10_IBUF_21 : STD_LOGIC;
  signal a_11_IBUF_22 : STD_LOGIC;
  signal a_12_IBUF_23 : STD_LOGIC;
  signal a_13_IBUF_24 : STD_LOGIC;
  signal a_14_IBUF_25 : STD_LOGIC;
  signal a_15_IBUF_26 : STD_LOGIC;
  signal a_16_IBUF_27 : STD_LOGIC;
  signal a_17_IBUF_28 : STD_LOGIC;
  signal a_1_IBUF_29 : STD_LOGIC;
  signal a_2_IBUF_30 : STD_LOGIC;
  signal a_3_IBUF_31 : STD_LOGIC;
  signal a_4_IBUF_32 : STD_LOGIC;
  signal a_5_IBUF_33 : STD_LOGIC;
  signal a_6_IBUF_34 : STD_LOGIC;
  signal a_7_IBUF_35 : STD_LOGIC;
  signal a_8_IBUF_36 : STD_LOGIC;
  signal a_9_IBUF_37 : STD_LOGIC;
  signal b_0_IBUF_56 : STD_LOGIC;
  signal b_10_IBUF_57 : STD_LOGIC;
  signal b_11_IBUF_58 : STD_LOGIC;
  signal b_12_IBUF_59 : STD_LOGIC;
  signal b_13_IBUF_60 : STD_LOGIC;
  signal b_14_IBUF_61 : STD_LOGIC;
  signal b_15_IBUF_62 : STD_LOGIC;
  signal b_16_IBUF_63 : STD_LOGIC;
  signal b_17_IBUF_64 : STD_LOGIC;
  signal b_1_IBUF_65 : STD_LOGIC;
  signal b_2_IBUF_66 : STD_LOGIC;
  signal b_3_IBUF_67 : STD_LOGIC;
  signal b_4_IBUF_68 : STD_LOGIC;
  signal b_5_IBUF_69 : STD_LOGIC;
  signal b_6_IBUF_70 : STD_LOGIC;
  signal b_7_IBUF_71 : STD_LOGIC;
  signal b_8_IBUF_72 : STD_LOGIC;
  signal b_9_IBUF_73 : STD_LOGIC;
  signal ce_IBUF_75 : STD_LOGIC;
  signal clk_BUFGP_77 : STD_LOGIC;
  signal pf_0_OBUF_114 : STD_LOGIC;
  signal pf_10_OBUF_115 : STD_LOGIC;
  signal pf_11_OBUF_116 : STD_LOGIC;
  signal pf_12_OBUF_117 : STD_LOGIC;
  signal pf_13_OBUF_118 : STD_LOGIC;
  signal pf_14_OBUF_119 : STD_LOGIC;
  signal pf_15_OBUF_120 : STD_LOGIC;
  signal pf_16_OBUF_121 : STD_LOGIC;
  signal pf_17_OBUF_122 : STD_LOGIC;
  signal pf_18_OBUF_123 : STD_LOGIC;
  signal pf_19_OBUF_124 : STD_LOGIC;
  signal pf_1_OBUF_125 : STD_LOGIC;
  signal pf_20_OBUF_126 : STD_LOGIC;
  signal pf_21_OBUF_127 : STD_LOGIC;
  signal pf_22_OBUF_128 : STD_LOGIC;
  signal pf_23_OBUF_129 : STD_LOGIC;
  signal pf_24_OBUF_130 : STD_LOGIC;
  signal pf_25_OBUF_131 : STD_LOGIC;
  signal pf_26_OBUF_132 : STD_LOGIC;
  signal pf_27_OBUF_133 : STD_LOGIC;
  signal pf_28_OBUF_134 : STD_LOGIC;
  signal pf_29_OBUF_135 : STD_LOGIC;
  signal pf_2_OBUF_136 : STD_LOGIC;
  signal pf_30_OBUF_137 : STD_LOGIC;
  signal pf_31_OBUF_138 : STD_LOGIC;
  signal pf_32_OBUF_139 : STD_LOGIC;
  signal pf_33_OBUF_140 : STD_LOGIC;
  signal pf_34_OBUF_141 : STD_LOGIC;
  signal pf_35_OBUF_142 : STD_LOGIC;
  signal pf_3_OBUF_143 : STD_LOGIC;
  signal pf_4_OBUF_144 : STD_LOGIC;
  signal pf_5_OBUF_145 : STD_LOGIC;
  signal pf_6_OBUF_146 : STD_LOGIC;
  signal pf_7_OBUF_147 : STD_LOGIC;
  signal pf_8_OBUF_148 : STD_LOGIC;
  signal pf_9_OBUF_149 : STD_LOGIC;
  signal ps_0_OBUF_172 : STD_LOGIC;
  signal ps_10_OBUF_173 : STD_LOGIC;
  signal ps_11_OBUF_174 : STD_LOGIC;
  signal ps_12_OBUF_175 : STD_LOGIC;
  signal ps_13_OBUF_176 : STD_LOGIC;
  signal ps_14_OBUF_177 : STD_LOGIC;
  signal ps_15_OBUF_178 : STD_LOGIC;
  signal ps_16_OBUF_179 : STD_LOGIC;
  signal ps_17_OBUF_180 : STD_LOGIC;
  signal ps_18_OBUF_181 : STD_LOGIC;
  signal ps_19_OBUF_182 : STD_LOGIC;
  signal ps_1_OBUF_183 : STD_LOGIC;
  signal ps_20_OBUF_184 : STD_LOGIC;
  signal ps_21_OBUF_185 : STD_LOGIC;
  signal ps_2_OBUF_186 : STD_LOGIC;
  signal ps_3_OBUF_187 : STD_LOGIC;
  signal ps_4_OBUF_188 : STD_LOGIC;
  signal ps_5_OBUF_189 : STD_LOGIC;
  signal ps_6_OBUF_190 : STD_LOGIC;
  signal ps_7_OBUF_191 : STD_LOGIC;
  signal ps_8_OBUF_192 : STD_LOGIC;
  signal ps_9_OBUF_193 : STD_LOGIC;
  signal pu_0_OBUF_210 : STD_LOGIC;
  signal pu_10_OBUF_211 : STD_LOGIC;
  signal pu_11_OBUF_212 : STD_LOGIC;
  signal pu_12_OBUF_213 : STD_LOGIC;
  signal pu_13_OBUF_214 : STD_LOGIC;
  signal pu_14_OBUF_215 : STD_LOGIC;
  signal pu_15_OBUF_216 : STD_LOGIC;
  signal pu_1_OBUF_217 : STD_LOGIC;
  signal pu_2_OBUF_218 : STD_LOGIC;
  signal pu_3_OBUF_219 : STD_LOGIC;
  signal pu_4_OBUF_220 : STD_LOGIC;
  signal pu_5_OBUF_221 : STD_LOGIC;
  signal pu_6_OBUF_222 : STD_LOGIC;
  signal pu_7_OBUF_223 : STD_LOGIC;
  signal pu_8_OBUF_224 : STD_LOGIC;
  signal pu_9_OBUF_225 : STD_LOGIC;
  signal rst_IBUF_227 : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_17_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_16_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_14_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_13_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_12_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_11_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_10_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_9_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_8_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_7_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_6_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_5_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_4_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_3_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_2_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_1_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCIN_0_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_17_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_16_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_14_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_13_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_12_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_11_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_10_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_9_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_8_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_7_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_6_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_5_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_4_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_3_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_2_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_1_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_fr_mult0000_BCOUT_0_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_17_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_16_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_14_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_13_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_12_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_11_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_10_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_9_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_8_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_7_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_6_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_5_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_4_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_3_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_2_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_1_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCIN_0_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_35_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_34_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_33_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_32_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_31_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_30_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_29_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_28_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_27_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_26_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_25_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_24_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_23_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_22_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_21_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_20_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_19_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_18_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_17_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_P_16_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_17_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_16_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_14_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_13_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_12_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_11_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_10_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_9_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_8_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_7_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_6_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_5_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_4_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_3_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_2_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_1_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pu_BCOUT_0_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_17_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_16_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_14_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_13_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_12_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_11_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_10_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_9_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_8_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_7_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_6_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_5_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_4_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_3_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_2_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_1_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCIN_0_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_35_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_34_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_33_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_32_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_31_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_30_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_29_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_28_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_27_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_26_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_25_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_24_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_23_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_P_22_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_17_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_16_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_14_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_13_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_12_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_11_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_10_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_9_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_8_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_7_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_6_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_5_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_4_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_3_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_2_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_1_UNCONNECTED : STD_LOGIC;
  signal NLW_Mmult_pr_mult0000_BCOUT_0_UNCONNECTED : STD_LOGIC;
begin
  XST_GND : GND
    port map (
      G => N0
    );
  XST_VCC : VCC
    port map (
      P => N1
    );
  Mmult_fr_mult0000 : MULT18X18SIO
    generic map(
      B_INPUT => "DIRECT",
      AREG => 0,
      BREG => 0,
      PREG => 1
    )
    port map (
      CEA => N0,
      CEB => N0,
      CEP => N1,
      CLK => clk_BUFGP_77,
      RSTA => N0,
      RSTB => N0,
      RSTP => rst_IBUF_227,
      A(17) => a_17_IBUF_28,
      A(16) => a_16_IBUF_27,
      A(15) => a_15_IBUF_26,
      A(14) => a_14_IBUF_25,
      A(13) => a_13_IBUF_24,
      A(12) => a_12_IBUF_23,
      A(11) => a_11_IBUF_22,
      A(10) => a_10_IBUF_21,
      A(9) => a_9_IBUF_37,
      A(8) => a_8_IBUF_36,
      A(7) => a_7_IBUF_35,
      A(6) => a_6_IBUF_34,
      A(5) => a_5_IBUF_33,
      A(4) => a_4_IBUF_32,
      A(3) => a_3_IBUF_31,
      A(2) => a_2_IBUF_30,
      A(1) => a_1_IBUF_29,
      A(0) => a_0_IBUF_20,
      B(17) => b_17_IBUF_64,
      B(16) => b_16_IBUF_63,
      B(15) => b_15_IBUF_62,
      B(14) => b_14_IBUF_61,
      B(13) => b_13_IBUF_60,
      B(12) => b_12_IBUF_59,
      B(11) => b_11_IBUF_58,
      B(10) => b_10_IBUF_57,
      B(9) => b_9_IBUF_73,
      B(8) => b_8_IBUF_72,
      B(7) => b_7_IBUF_71,
      B(6) => b_6_IBUF_70,
      B(5) => b_5_IBUF_69,
      B(4) => b_4_IBUF_68,
      B(3) => b_3_IBUF_67,
      B(2) => b_2_IBUF_66,
      B(1) => b_1_IBUF_65,
      B(0) => b_0_IBUF_56,
      BCIN(17) => NLW_Mmult_fr_mult0000_BCIN_17_UNCONNECTED,
      BCIN(16) => NLW_Mmult_fr_mult0000_BCIN_16_UNCONNECTED,
      BCIN(15) => NLW_Mmult_fr_mult0000_BCIN_15_UNCONNECTED,
      BCIN(14) => NLW_Mmult_fr_mult0000_BCIN_14_UNCONNECTED,
      BCIN(13) => NLW_Mmult_fr_mult0000_BCIN_13_UNCONNECTED,
      BCIN(12) => NLW_Mmult_fr_mult0000_BCIN_12_UNCONNECTED,
      BCIN(11) => NLW_Mmult_fr_mult0000_BCIN_11_UNCONNECTED,
      BCIN(10) => NLW_Mmult_fr_mult0000_BCIN_10_UNCONNECTED,
      BCIN(9) => NLW_Mmult_fr_mult0000_BCIN_9_UNCONNECTED,
      BCIN(8) => NLW_Mmult_fr_mult0000_BCIN_8_UNCONNECTED,
      BCIN(7) => NLW_Mmult_fr_mult0000_BCIN_7_UNCONNECTED,
      BCIN(6) => NLW_Mmult_fr_mult0000_BCIN_6_UNCONNECTED,
      BCIN(5) => NLW_Mmult_fr_mult0000_BCIN_5_UNCONNECTED,
      BCIN(4) => NLW_Mmult_fr_mult0000_BCIN_4_UNCONNECTED,
      BCIN(3) => NLW_Mmult_fr_mult0000_BCIN_3_UNCONNECTED,
      BCIN(2) => NLW_Mmult_fr_mult0000_BCIN_2_UNCONNECTED,
      BCIN(1) => NLW_Mmult_fr_mult0000_BCIN_1_UNCONNECTED,
      BCIN(0) => NLW_Mmult_fr_mult0000_BCIN_0_UNCONNECTED,
      P(35) => pf_35_OBUF_142,
      P(34) => pf_34_OBUF_141,
      P(33) => pf_33_OBUF_140,
      P(32) => pf_32_OBUF_139,
      P(31) => pf_31_OBUF_138,
      P(30) => pf_30_OBUF_137,
      P(29) => pf_29_OBUF_135,
      P(28) => pf_28_OBUF_134,
      P(27) => pf_27_OBUF_133,
      P(26) => pf_26_OBUF_132,
      P(25) => pf_25_OBUF_131,
      P(24) => pf_24_OBUF_130,
      P(23) => pf_23_OBUF_129,
      P(22) => pf_22_OBUF_128,
      P(21) => pf_21_OBUF_127,
      P(20) => pf_20_OBUF_126,
      P(19) => pf_19_OBUF_124,
      P(18) => pf_18_OBUF_123,
      P(17) => pf_17_OBUF_122,
      P(16) => pf_16_OBUF_121,
      P(15) => pf_15_OBUF_120,
      P(14) => pf_14_OBUF_119,
      P(13) => pf_13_OBUF_118,
      P(12) => pf_12_OBUF_117,
      P(11) => pf_11_OBUF_116,
      P(10) => pf_10_OBUF_115,
      P(9) => pf_9_OBUF_149,
      P(8) => pf_8_OBUF_148,
      P(7) => pf_7_OBUF_147,
      P(6) => pf_6_OBUF_146,
      P(5) => pf_5_OBUF_145,
      P(4) => pf_4_OBUF_144,
      P(3) => pf_3_OBUF_143,
      P(2) => pf_2_OBUF_136,
      P(1) => pf_1_OBUF_125,
      P(0) => pf_0_OBUF_114,
      BCOUT(17) => NLW_Mmult_fr_mult0000_BCOUT_17_UNCONNECTED,
      BCOUT(16) => NLW_Mmult_fr_mult0000_BCOUT_16_UNCONNECTED,
      BCOUT(15) => NLW_Mmult_fr_mult0000_BCOUT_15_UNCONNECTED,
      BCOUT(14) => NLW_Mmult_fr_mult0000_BCOUT_14_UNCONNECTED,
      BCOUT(13) => NLW_Mmult_fr_mult0000_BCOUT_13_UNCONNECTED,
      BCOUT(12) => NLW_Mmult_fr_mult0000_BCOUT_12_UNCONNECTED,
      BCOUT(11) => NLW_Mmult_fr_mult0000_BCOUT_11_UNCONNECTED,
      BCOUT(10) => NLW_Mmult_fr_mult0000_BCOUT_10_UNCONNECTED,
      BCOUT(9) => NLW_Mmult_fr_mult0000_BCOUT_9_UNCONNECTED,
      BCOUT(8) => NLW_Mmult_fr_mult0000_BCOUT_8_UNCONNECTED,
      BCOUT(7) => NLW_Mmult_fr_mult0000_BCOUT_7_UNCONNECTED,
      BCOUT(6) => NLW_Mmult_fr_mult0000_BCOUT_6_UNCONNECTED,
      BCOUT(5) => NLW_Mmult_fr_mult0000_BCOUT_5_UNCONNECTED,
      BCOUT(4) => NLW_Mmult_fr_mult0000_BCOUT_4_UNCONNECTED,
      BCOUT(3) => NLW_Mmult_fr_mult0000_BCOUT_3_UNCONNECTED,
      BCOUT(2) => NLW_Mmult_fr_mult0000_BCOUT_2_UNCONNECTED,
      BCOUT(1) => NLW_Mmult_fr_mult0000_BCOUT_1_UNCONNECTED,
      BCOUT(0) => NLW_Mmult_fr_mult0000_BCOUT_0_UNCONNECTED
    );
  Mmult_pu : MULT18X18SIO
    generic map(
      B_INPUT => "DIRECT",
      AREG => 0,
      BREG => 0,
      PREG => 0
    )
    port map (
      CEA => N0,
      CEB => N0,
      CEP => N0,
      CLK => N0,
      RSTA => N0,
      RSTB => N0,
      RSTP => N0,
      A(17) => N0,
      A(16) => N0,
      A(15) => N0,
      A(14) => N0,
      A(13) => N0,
      A(12) => N0,
      A(11) => N0,
      A(10) => N0,
      A(9) => N0,
      A(8) => N0,
      A(7) => a_7_IBUF_35,
      A(6) => a_6_IBUF_34,
      A(5) => a_5_IBUF_33,
      A(4) => a_4_IBUF_32,
      A(3) => a_3_IBUF_31,
      A(2) => a_2_IBUF_30,
      A(1) => a_1_IBUF_29,
      A(0) => a_0_IBUF_20,
      B(17) => N0,
      B(16) => N0,
      B(15) => N0,
      B(14) => N0,
      B(13) => N0,
      B(12) => N0,
      B(11) => N0,
      B(10) => N0,
      B(9) => N0,
      B(8) => N0,
      B(7) => b_7_IBUF_71,
      B(6) => b_6_IBUF_70,
      B(5) => b_5_IBUF_69,
      B(4) => b_4_IBUF_68,
      B(3) => b_3_IBUF_67,
      B(2) => b_2_IBUF_66,
      B(1) => b_1_IBUF_65,
      B(0) => b_0_IBUF_56,
      BCIN(17) => NLW_Mmult_pu_BCIN_17_UNCONNECTED,
      BCIN(16) => NLW_Mmult_pu_BCIN_16_UNCONNECTED,
      BCIN(15) => NLW_Mmult_pu_BCIN_15_UNCONNECTED,
      BCIN(14) => NLW_Mmult_pu_BCIN_14_UNCONNECTED,
      BCIN(13) => NLW_Mmult_pu_BCIN_13_UNCONNECTED,
      BCIN(12) => NLW_Mmult_pu_BCIN_12_UNCONNECTED,
      BCIN(11) => NLW_Mmult_pu_BCIN_11_UNCONNECTED,
      BCIN(10) => NLW_Mmult_pu_BCIN_10_UNCONNECTED,
      BCIN(9) => NLW_Mmult_pu_BCIN_9_UNCONNECTED,
      BCIN(8) => NLW_Mmult_pu_BCIN_8_UNCONNECTED,
      BCIN(7) => NLW_Mmult_pu_BCIN_7_UNCONNECTED,
      BCIN(6) => NLW_Mmult_pu_BCIN_6_UNCONNECTED,
      BCIN(5) => NLW_Mmult_pu_BCIN_5_UNCONNECTED,
      BCIN(4) => NLW_Mmult_pu_BCIN_4_UNCONNECTED,
      BCIN(3) => NLW_Mmult_pu_BCIN_3_UNCONNECTED,
      BCIN(2) => NLW_Mmult_pu_BCIN_2_UNCONNECTED,
      BCIN(1) => NLW_Mmult_pu_BCIN_1_UNCONNECTED,
      BCIN(0) => NLW_Mmult_pu_BCIN_0_UNCONNECTED,
      P(35) => NLW_Mmult_pu_P_35_UNCONNECTED,
      P(34) => NLW_Mmult_pu_P_34_UNCONNECTED,
      P(33) => NLW_Mmult_pu_P_33_UNCONNECTED,
      P(32) => NLW_Mmult_pu_P_32_UNCONNECTED,
      P(31) => NLW_Mmult_pu_P_31_UNCONNECTED,
      P(30) => NLW_Mmult_pu_P_30_UNCONNECTED,
      P(29) => NLW_Mmult_pu_P_29_UNCONNECTED,
      P(28) => NLW_Mmult_pu_P_28_UNCONNECTED,
      P(27) => NLW_Mmult_pu_P_27_UNCONNECTED,
      P(26) => NLW_Mmult_pu_P_26_UNCONNECTED,
      P(25) => NLW_Mmult_pu_P_25_UNCONNECTED,
      P(24) => NLW_Mmult_pu_P_24_UNCONNECTED,
      P(23) => NLW_Mmult_pu_P_23_UNCONNECTED,
      P(22) => NLW_Mmult_pu_P_22_UNCONNECTED,
      P(21) => NLW_Mmult_pu_P_21_UNCONNECTED,
      P(20) => NLW_Mmult_pu_P_20_UNCONNECTED,
      P(19) => NLW_Mmult_pu_P_19_UNCONNECTED,
      P(18) => NLW_Mmult_pu_P_18_UNCONNECTED,
      P(17) => NLW_Mmult_pu_P_17_UNCONNECTED,
      P(16) => NLW_Mmult_pu_P_16_UNCONNECTED,
      P(15) => pu_15_OBUF_216,
      P(14) => pu_14_OBUF_215,
      P(13) => pu_13_OBUF_214,
      P(12) => pu_12_OBUF_213,
      P(11) => pu_11_OBUF_212,
      P(10) => pu_10_OBUF_211,
      P(9) => pu_9_OBUF_225,
      P(8) => pu_8_OBUF_224,
      P(7) => pu_7_OBUF_223,
      P(6) => pu_6_OBUF_222,
      P(5) => pu_5_OBUF_221,
      P(4) => pu_4_OBUF_220,
      P(3) => pu_3_OBUF_219,
      P(2) => pu_2_OBUF_218,
      P(1) => pu_1_OBUF_217,
      P(0) => pu_0_OBUF_210,
      BCOUT(17) => NLW_Mmult_pu_BCOUT_17_UNCONNECTED,
      BCOUT(16) => NLW_Mmult_pu_BCOUT_16_UNCONNECTED,
      BCOUT(15) => NLW_Mmult_pu_BCOUT_15_UNCONNECTED,
      BCOUT(14) => NLW_Mmult_pu_BCOUT_14_UNCONNECTED,
      BCOUT(13) => NLW_Mmult_pu_BCOUT_13_UNCONNECTED,
      BCOUT(12) => NLW_Mmult_pu_BCOUT_12_UNCONNECTED,
      BCOUT(11) => NLW_Mmult_pu_BCOUT_11_UNCONNECTED,
      BCOUT(10) => NLW_Mmult_pu_BCOUT_10_UNCONNECTED,
      BCOUT(9) => NLW_Mmult_pu_BCOUT_9_UNCONNECTED,
      BCOUT(8) => NLW_Mmult_pu_BCOUT_8_UNCONNECTED,
      BCOUT(7) => NLW_Mmult_pu_BCOUT_7_UNCONNECTED,
      BCOUT(6) => NLW_Mmult_pu_BCOUT_6_UNCONNECTED,
      BCOUT(5) => NLW_Mmult_pu_BCOUT_5_UNCONNECTED,
      BCOUT(4) => NLW_Mmult_pu_BCOUT_4_UNCONNECTED,
      BCOUT(3) => NLW_Mmult_pu_BCOUT_3_UNCONNECTED,
      BCOUT(2) => NLW_Mmult_pu_BCOUT_2_UNCONNECTED,
      BCOUT(1) => NLW_Mmult_pu_BCOUT_1_UNCONNECTED,
      BCOUT(0) => NLW_Mmult_pu_BCOUT_0_UNCONNECTED
    );
  Mmult_pr_mult0000 : MULT18X18SIO
    generic map(
      B_INPUT => "DIRECT",
      AREG => 1,
      BREG => 1,
      PREG => 1
    )
    port map (
      CEA => ce_IBUF_75,
      CEB => ce_IBUF_75,
      CEP => ce_IBUF_75,
      CLK => clk_BUFGP_77,
      RSTA => N0,
      RSTB => N0,
      RSTP => N0,
      A(17) => a_11_IBUF_22,
      A(16) => a_11_IBUF_22,
      A(15) => a_11_IBUF_22,
      A(14) => a_11_IBUF_22,
      A(13) => a_11_IBUF_22,
      A(12) => a_11_IBUF_22,
      A(11) => a_11_IBUF_22,
      A(10) => a_10_IBUF_21,
      A(9) => a_9_IBUF_37,
      A(8) => a_8_IBUF_36,
      A(7) => a_7_IBUF_35,
      A(6) => a_6_IBUF_34,
      A(5) => a_5_IBUF_33,
      A(4) => a_4_IBUF_32,
      A(3) => a_3_IBUF_31,
      A(2) => a_2_IBUF_30,
      A(1) => a_1_IBUF_29,
      A(0) => a_0_IBUF_20,
      B(17) => b_9_IBUF_73,
      B(16) => b_9_IBUF_73,
      B(15) => b_9_IBUF_73,
      B(14) => b_9_IBUF_73,
      B(13) => b_9_IBUF_73,
      B(12) => b_9_IBUF_73,
      B(11) => b_9_IBUF_73,
      B(10) => b_9_IBUF_73,
      B(9) => b_9_IBUF_73,
      B(8) => b_8_IBUF_72,
      B(7) => b_7_IBUF_71,
      B(6) => b_6_IBUF_70,
      B(5) => b_5_IBUF_69,
      B(4) => b_4_IBUF_68,
      B(3) => b_3_IBUF_67,
      B(2) => b_2_IBUF_66,
      B(1) => b_1_IBUF_65,
      B(0) => b_0_IBUF_56,
      BCIN(17) => NLW_Mmult_pr_mult0000_BCIN_17_UNCONNECTED,
      BCIN(16) => NLW_Mmult_pr_mult0000_BCIN_16_UNCONNECTED,
      BCIN(15) => NLW_Mmult_pr_mult0000_BCIN_15_UNCONNECTED,
      BCIN(14) => NLW_Mmult_pr_mult0000_BCIN_14_UNCONNECTED,
      BCIN(13) => NLW_Mmult_pr_mult0000_BCIN_13_UNCONNECTED,
      BCIN(12) => NLW_Mmult_pr_mult0000_BCIN_12_UNCONNECTED,
      BCIN(11) => NLW_Mmult_pr_mult0000_BCIN_11_UNCONNECTED,
      BCIN(10) => NLW_Mmult_pr_mult0000_BCIN_10_UNCONNECTED,
      BCIN(9) => NLW_Mmult_pr_mult0000_BCIN_9_UNCONNECTED,
      BCIN(8) => NLW_Mmult_pr_mult0000_BCIN_8_UNCONNECTED,
      BCIN(7) => NLW_Mmult_pr_mult0000_BCIN_7_UNCONNECTED,
      BCIN(6) => NLW_Mmult_pr_mult0000_BCIN_6_UNCONNECTED,
      BCIN(5) => NLW_Mmult_pr_mult0000_BCIN_5_UNCONNECTED,
      BCIN(4) => NLW_Mmult_pr_mult0000_BCIN_4_UNCONNECTED,
      BCIN(3) => NLW_Mmult_pr_mult0000_BCIN_3_UNCONNECTED,
      BCIN(2) => NLW_Mmult_pr_mult0000_BCIN_2_UNCONNECTED,
      BCIN(1) => NLW_Mmult_pr_mult0000_BCIN_1_UNCONNECTED,
      BCIN(0) => NLW_Mmult_pr_mult0000_BCIN_0_UNCONNECTED,
      P(35) => NLW_Mmult_pr_mult0000_P_35_UNCONNECTED,
      P(34) => NLW_Mmult_pr_mult0000_P_34_UNCONNECTED,
      P(33) => NLW_Mmult_pr_mult0000_P_33_UNCONNECTED,
      P(32) => NLW_Mmult_pr_mult0000_P_32_UNCONNECTED,
      P(31) => NLW_Mmult_pr_mult0000_P_31_UNCONNECTED,
      P(30) => NLW_Mmult_pr_mult0000_P_30_UNCONNECTED,
      P(29) => NLW_Mmult_pr_mult0000_P_29_UNCONNECTED,
      P(28) => NLW_Mmult_pr_mult0000_P_28_UNCONNECTED,
      P(27) => NLW_Mmult_pr_mult0000_P_27_UNCONNECTED,
      P(26) => NLW_Mmult_pr_mult0000_P_26_UNCONNECTED,
      P(25) => NLW_Mmult_pr_mult0000_P_25_UNCONNECTED,
      P(24) => NLW_Mmult_pr_mult0000_P_24_UNCONNECTED,
      P(23) => NLW_Mmult_pr_mult0000_P_23_UNCONNECTED,
      P(22) => NLW_Mmult_pr_mult0000_P_22_UNCONNECTED,
      P(21) => ps_21_OBUF_185,
      P(20) => ps_20_OBUF_184,
      P(19) => ps_19_OBUF_182,
      P(18) => ps_18_OBUF_181,
      P(17) => ps_17_OBUF_180,
      P(16) => ps_16_OBUF_179,
      P(15) => ps_15_OBUF_178,
      P(14) => ps_14_OBUF_177,
      P(13) => ps_13_OBUF_176,
      P(12) => ps_12_OBUF_175,
      P(11) => ps_11_OBUF_174,
      P(10) => ps_10_OBUF_173,
      P(9) => ps_9_OBUF_193,
      P(8) => ps_8_OBUF_192,
      P(7) => ps_7_OBUF_191,
      P(6) => ps_6_OBUF_190,
      P(5) => ps_5_OBUF_189,
      P(4) => ps_4_OBUF_188,
      P(3) => ps_3_OBUF_187,
      P(2) => ps_2_OBUF_186,
      P(1) => ps_1_OBUF_183,
      P(0) => ps_0_OBUF_172,
      BCOUT(17) => NLW_Mmult_pr_mult0000_BCOUT_17_UNCONNECTED,
      BCOUT(16) => NLW_Mmult_pr_mult0000_BCOUT_16_UNCONNECTED,
      BCOUT(15) => NLW_Mmult_pr_mult0000_BCOUT_15_UNCONNECTED,
      BCOUT(14) => NLW_Mmult_pr_mult0000_BCOUT_14_UNCONNECTED,
      BCOUT(13) => NLW_Mmult_pr_mult0000_BCOUT_13_UNCONNECTED,
      BCOUT(12) => NLW_Mmult_pr_mult0000_BCOUT_12_UNCONNECTED,
      BCOUT(11) => NLW_Mmult_pr_mult0000_BCOUT_11_UNCONNECTED,
      BCOUT(10) => NLW_Mmult_pr_mult0000_BCOUT_10_UNCONNECTED,
      BCOUT(9) => NLW_Mmult_pr_mult0000_BCOUT_9_UNCONNECTED,
      BCOUT(8) => NLW_Mmult_pr_mult0000_BCOUT_8_UNCONNECTED,
      BCOUT(7) => NLW_Mmult_pr_mult0000_BCOUT_7_UNCONNECTED,
      BCOUT(6) => NLW_Mmult_pr_mult0000_BCOUT_6_UNCONNECTED,
      BCOUT(5) => NLW_Mmult_pr_mult0000_BCOUT_5_UNCONNECTED,
      BCOUT(4) => NLW_Mmult_pr_mult0000_BCOUT_4_UNCONNECTED,
      BCOUT(3) => NLW_Mmult_pr_mult0000_BCOUT_3_UNCONNECTED,
      BCOUT(2) => NLW_Mmult_pr_mult0000_BCOUT_2_UNCONNECTED,
      BCOUT(1) => NLW_Mmult_pr_mult0000_BCOUT_1_UNCONNECTED,
      BCOUT(0) => NLW_Mmult_pr_mult0000_BCOUT_0_UNCONNECTED
    );
  ce_IBUF : IBUF
    port map (
      I => ce,
      O => ce_IBUF_75
    );
  rst_IBUF : IBUF
    port map (
      I => rst,
      O => rst_IBUF_227
    );
  a_17_IBUF : IBUF
    port map (
      I => a(17),
      O => a_17_IBUF_28
    );
  a_16_IBUF : IBUF
    port map (
      I => a(16),
      O => a_16_IBUF_27
    );
  a_15_IBUF : IBUF
    port map (
      I => a(15),
      O => a_15_IBUF_26
    );
  a_14_IBUF : IBUF
    port map (
      I => a(14),
      O => a_14_IBUF_25
    );
  a_13_IBUF : IBUF
    port map (
      I => a(13),
      O => a_13_IBUF_24
    );
  a_12_IBUF : IBUF
    port map (
      I => a(12),
      O => a_12_IBUF_23
    );
  a_11_IBUF : IBUF
    port map (
      I => a(11),
      O => a_11_IBUF_22
    );
  a_10_IBUF : IBUF
    port map (
      I => a(10),
      O => a_10_IBUF_21
    );
  a_9_IBUF : IBUF
    port map (
      I => a(9),
      O => a_9_IBUF_37
    );
  a_8_IBUF : IBUF
    port map (
      I => a(8),
      O => a_8_IBUF_36
    );
  a_7_IBUF : IBUF
    port map (
      I => a(7),
      O => a_7_IBUF_35
    );
  a_6_IBUF : IBUF
    port map (
      I => a(6),
      O => a_6_IBUF_34
    );
  a_5_IBUF : IBUF
    port map (
      I => a(5),
      O => a_5_IBUF_33
    );
  a_4_IBUF : IBUF
    port map (
      I => a(4),
      O => a_4_IBUF_32
    );
  a_3_IBUF : IBUF
    port map (
      I => a(3),
      O => a_3_IBUF_31
    );
  a_2_IBUF : IBUF
    port map (
      I => a(2),
      O => a_2_IBUF_30
    );
  a_1_IBUF : IBUF
    port map (
      I => a(1),
      O => a_1_IBUF_29
    );
  a_0_IBUF : IBUF
    port map (
      I => a(0),
      O => a_0_IBUF_20
    );
  b_17_IBUF : IBUF
    port map (
      I => b(17),
      O => b_17_IBUF_64
    );
  b_16_IBUF : IBUF
    port map (
      I => b(16),
      O => b_16_IBUF_63
    );
  b_15_IBUF : IBUF
    port map (
      I => b(15),
      O => b_15_IBUF_62
    );
  b_14_IBUF : IBUF
    port map (
      I => b(14),
      O => b_14_IBUF_61
    );
  b_13_IBUF : IBUF
    port map (
      I => b(13),
      O => b_13_IBUF_60
    );
  b_12_IBUF : IBUF
    port map (
      I => b(12),
      O => b_12_IBUF_59
    );
  b_11_IBUF : IBUF
    port map (
      I => b(11),
      O => b_11_IBUF_58
    );
  b_10_IBUF : IBUF
    port map (
      I => b(10),
      O => b_10_IBUF_57
    );
  b_9_IBUF : IBUF
    port map (
      I => b(9),
      O => b_9_IBUF_73
    );
  b_8_IBUF : IBUF
    port map (
      I => b(8),
      O => b_8_IBUF_72
    );
  b_7_IBUF : IBUF
    port map (
      I => b(7),
      O => b_7_IBUF_71
    );
  b_6_IBUF : IBUF
    port map (
      I => b(6),
      O => b_6_IBUF_70
    );
  b_5_IBUF : IBUF
    port map (
      I => b(5),
      O => b_5_IBUF_69
    );
  b_4_IBUF : IBUF
    port map (
      I => b(4),
      O => b_4_IBUF_68
    );
  b_3_IBUF : IBUF
    port map (
      I => b(3),
      O => b_3_IBUF_67
    );
  b_2_IBUF : IBUF
    port map (
      I => b(2),
      O => b_2_IBUF_66
    );
  b_1_IBUF : IBUF
    port map (
      I => b(1),
      O => b_1_IBUF_65
    );
  b_0_IBUF : IBUF
    port map (
      I => b(0),
      O => b_0_IBUF_56
    );
  pf_35_OBUF : OBUF
    port map (
      I => pf_35_OBUF_142,
      O => pf(35)
    );
  pf_34_OBUF : OBUF
    port map (
      I => pf_34_OBUF_141,
      O => pf(34)
    );
  pf_33_OBUF : OBUF
    port map (
      I => pf_33_OBUF_140,
      O => pf(33)
    );
  pf_32_OBUF : OBUF
    port map (
      I => pf_32_OBUF_139,
      O => pf(32)
    );
  pf_31_OBUF : OBUF
    port map (
      I => pf_31_OBUF_138,
      O => pf(31)
    );
  pf_30_OBUF : OBUF
    port map (
      I => pf_30_OBUF_137,
      O => pf(30)
    );
  pf_29_OBUF : OBUF
    port map (
      I => pf_29_OBUF_135,
      O => pf(29)
    );
  pf_28_OBUF : OBUF
    port map (
      I => pf_28_OBUF_134,
      O => pf(28)
    );
  pf_27_OBUF : OBUF
    port map (
      I => pf_27_OBUF_133,
      O => pf(27)
    );
  pf_26_OBUF : OBUF
    port map (
      I => pf_26_OBUF_132,
      O => pf(26)
    );
  pf_25_OBUF : OBUF
    port map (
      I => pf_25_OBUF_131,
      O => pf(25)
    );
  pf_24_OBUF : OBUF
    port map (
      I => pf_24_OBUF_130,
      O => pf(24)
    );
  pf_23_OBUF : OBUF
    port map (
      I => pf_23_OBUF_129,
      O => pf(23)
    );
  pf_22_OBUF : OBUF
    port map (
      I => pf_22_OBUF_128,
      O => pf(22)
    );
  pf_21_OBUF : OBUF
    port map (
      I => pf_21_OBUF_127,
      O => pf(21)
    );
  pf_20_OBUF : OBUF
    port map (
      I => pf_20_OBUF_126,
      O => pf(20)
    );
  pf_19_OBUF : OBUF
    port map (
      I => pf_19_OBUF_124,
      O => pf(19)
    );
  pf_18_OBUF : OBUF
    port map (
      I => pf_18_OBUF_123,
      O => pf(18)
    );
  pf_17_OBUF : OBUF
    port map (
      I => pf_17_OBUF_122,
      O => pf(17)
    );
  pf_16_OBUF : OBUF
    port map (
      I => pf_16_OBUF_121,
      O => pf(16)
    );
  pf_15_OBUF : OBUF
    port map (
      I => pf_15_OBUF_120,
      O => pf(15)
    );
  pf_14_OBUF : OBUF
    port map (
      I => pf_14_OBUF_119,
      O => pf(14)
    );
  pf_13_OBUF : OBUF
    port map (
      I => pf_13_OBUF_118,
      O => pf(13)
    );
  pf_12_OBUF : OBUF
    port map (
      I => pf_12_OBUF_117,
      O => pf(12)
    );
  pf_11_OBUF : OBUF
    port map (
      I => pf_11_OBUF_116,
      O => pf(11)
    );
  pf_10_OBUF : OBUF
    port map (
      I => pf_10_OBUF_115,
      O => pf(10)
    );
  pf_9_OBUF : OBUF
    port map (
      I => pf_9_OBUF_149,
      O => pf(9)
    );
  pf_8_OBUF : OBUF
    port map (
      I => pf_8_OBUF_148,
      O => pf(8)
    );
  pf_7_OBUF : OBUF
    port map (
      I => pf_7_OBUF_147,
      O => pf(7)
    );
  pf_6_OBUF : OBUF
    port map (
      I => pf_6_OBUF_146,
      O => pf(6)
    );
  pf_5_OBUF : OBUF
    port map (
      I => pf_5_OBUF_145,
      O => pf(5)
    );
  pf_4_OBUF : OBUF
    port map (
      I => pf_4_OBUF_144,
      O => pf(4)
    );
  pf_3_OBUF : OBUF
    port map (
      I => pf_3_OBUF_143,
      O => pf(3)
    );
  pf_2_OBUF : OBUF
    port map (
      I => pf_2_OBUF_136,
      O => pf(2)
    );
  pf_1_OBUF : OBUF
    port map (
      I => pf_1_OBUF_125,
      O => pf(1)
    );
  pf_0_OBUF : OBUF
    port map (
      I => pf_0_OBUF_114,
      O => pf(0)
    );
  ps_21_OBUF : OBUF
    port map (
      I => ps_21_OBUF_185,
      O => ps(21)
    );
  ps_20_OBUF : OBUF
    port map (
      I => ps_20_OBUF_184,
      O => ps(20)
    );
  ps_19_OBUF : OBUF
    port map (
      I => ps_19_OBUF_182,
      O => ps(19)
    );
  ps_18_OBUF : OBUF
    port map (
      I => ps_18_OBUF_181,
      O => ps(18)
    );
  ps_17_OBUF : OBUF
    port map (
      I => ps_17_OBUF_180,
      O => ps(17)
    );
  ps_16_OBUF : OBUF
    port map (
      I => ps_16_OBUF_179,
      O => ps(16)
    );
  ps_15_OBUF : OBUF
    port map (
      I => ps_15_OBUF_178,
      O => ps(15)
    );
  ps_14_OBUF : OBUF
    port map (
      I => ps_14_OBUF_177,
      O => ps(14)
    );
  ps_13_OBUF : OBUF
    port map (
      I => ps_13_OBUF_176,
      O => ps(13)
    );
  ps_12_OBUF : OBUF
    port map (
      I => ps_12_OBUF_175,
      O => ps(12)
    );
  ps_11_OBUF : OBUF
    port map (
      I => ps_11_OBUF_174,
      O => ps(11)
    );
  ps_10_OBUF : OBUF
    port map (
      I => ps_10_OBUF_173,
      O => ps(10)
    );
  ps_9_OBUF : OBUF
    port map (
      I => ps_9_OBUF_193,
      O => ps(9)
    );
  ps_8_OBUF : OBUF
    port map (
      I => ps_8_OBUF_192,
      O => ps(8)
    );
  ps_7_OBUF : OBUF
    port map (
      I => ps_7_OBUF_191,
      O => ps(7)
    );
  ps_6_OBUF : OBUF
    port map (
      I => ps_6_OBUF_190,
      O => ps(6)
    );
  ps_5_OBUF : OBUF
    port map (
      I => ps_5_OBUF_189,
      O => ps(5)
    );
  ps_4_OBUF : OBUF
    port map (
      I => ps_4_OBUF_188,
      O => ps(4)
    );
  ps_3_OBUF : OBUF
    port map (
      I => ps_3_OBUF_187,
      O => ps(3)
    );
  ps_2_OBUF : OBUF
    port map (
      I => ps_2_OBUF_186,
      O => ps(2)
    );
  ps_1_OBUF : OBUF
    port map (
      I => ps_1_OBUF_183,
      O => ps(1)
    );
  ps_0_OBUF : OBUF
    port map (
      I => ps_0_OBUF_172,
      O => ps(0)
    );
  pu_15_OBUF : OBUF
    port map (
      I => pu_15_OBUF_216,
      O => pu(15)
    );
  pu_14_OBUF : OBUF
    port map (
      I => pu_14_OBUF_215,
      O => pu(14)
    );
  pu_13_OBUF : OBUF
    port map (
      I => pu_13_OBUF_214,
      O => pu(13)
    );
  pu_12_OBUF : OBUF
    port map (
      I => pu_12_OBUF_213,
      O => pu(12)
    );
  pu_11_OBUF : OBUF
    port map (
      I => pu_11_OBUF_212,
      O => pu(11)
    );
  pu_10_OBUF : OBUF
    port map (
      I => pu_10_OBUF_211,
      O => pu(10)
    );
  pu_9_OBUF : OBUF
    port map (
      I => pu_9_OBUF_225,
      O => pu(9)
    );
  pu_8_OBUF : OBUF
    port map (
      I => pu_8_OBUF_224,
      O => pu(8)
    );
  pu_7_OBUF : OBUF
    port map (
      I => pu_7_OBUF_223,
      O => pu(7)
    );
  pu_6_OBUF : OBUF
    port map (
      I => pu_6_OBUF_222,
      O => pu(6)
    );
  pu_5_OBUF : OBUF
    port map (
      I => pu_5_OBUF_221,
      O => pu(5)
    );
  pu_4_OBUF : OBUF
    port map (
      I => pu_4_OBUF_220,
      O => pu(4)
    );
  pu_3_OBUF : OBUF
    port map (
      I => pu_3_OBUF_219,
      O => pu(3)
    );
  pu_2_OBUF : OBUF
    port map (
      I => pu_2_OBUF_218,
      O => pu(2)
    );
  pu_1_OBUF : OBUF
    port map (
      I => pu_1_OBUF_217,
      O => pu(1)
    );
  pu_0_OBUF : OBUF
    port map (
      I => pu_0_OBUF_210,
      O => pu(0)
    );
  clk_BUFGP : BUFGP
    port map (
      I => clk,
      O => clk_BUFGP_77
    );

end STRUCTURE;

