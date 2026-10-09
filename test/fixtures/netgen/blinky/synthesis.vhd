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
    led : out STD_LOGIC_VECTOR ( 7 downto 0 );
    btn : in STD_LOGIC_VECTOR ( 1 downto 0 );
    sw : in STD_LOGIC_VECTOR ( 3 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal N0 : STD_LOGIC;
  signal N01 : STD_LOGIC;
  signal N1 : STD_LOGIC;
  signal N2 : STD_LOGIC;
  signal N4 : STD_LOGIC;
  signal btn_0_IBUF_7 : STD_LOGIC;
  signal btn_1_IBUF_8 : STD_LOGIC;
  signal clk_BUFGP_10 : STD_LOGIC;
  signal led_0_OBUF_19 : STD_LOGIC;
  signal led_1_OBUF_20 : STD_LOGIC;
  signal led_2_OBUF_21 : STD_LOGIC;
  signal led_3_OBUF_22 : STD_LOGIC;
  signal led_4_OBUF_23 : STD_LOGIC;
  signal led_5_OBUF_24 : STD_LOGIC;
  signal led_6_OBUF_25 : STD_LOGIC;
  signal led_7_OBUF_26 : STD_LOGIC;
  signal step : STD_LOGIC;
  signal sw_0_IBUF_32 : STD_LOGIC;
  signal sw_1_IBUF_33 : STD_LOGIC;
  signal sw_2_IBUF_34 : STD_LOGIC;
  signal sw_3_IBUF_35 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_1_rt_38 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_2_rt_40 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_3_rt_42 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_4_rt_44 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_5_rt_46 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_6_rt_48 : STD_LOGIC;
  signal u_knight_Mcount_count_xor_7_rt_50 : STD_LOGIC;
  signal u_knight_dir_0_mux0000 : STD_LOGIC;
  signal u_knight_dir_0_not0001 : STD_LOGIC;
  signal u_pre_cnt_0_or0000 : STD_LOGIC;
  signal u_pre_tick_88 : STD_LOGIC;
  signal u_pre_tick_or0000 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_10_rt_92 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_11_rt_94 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_12_rt_96 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_13_rt_98 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_14_rt_100 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_15_rt_102 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_16_rt_104 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_17_rt_106 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_18_rt_108 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_1_rt_110 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_2_rt_112 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_3_rt_114 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_4_rt_116 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_5_rt_118 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_6_rt_120 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_7_rt_122 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_8_rt_124 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_9_rt_126 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_xor_19_rt_128 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_10_rt_131 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_11_rt_133 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_12_rt_135 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_13_rt_137 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_14_rt_139 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_15_rt_141 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_16_rt_143 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_17_rt_145 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_18_rt_147 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_1_rt_149 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_2_rt_151 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_3_rt_153 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_4_rt_155 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_5_rt_157 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_6_rt_159 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_7_rt_161 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_8_rt_163 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_9_rt_165 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_xor_19_rt_167 : STD_LOGIC;
  signal u_speed_Mcount_level_val : STD_LOGIC;
  signal u_speed_Mcount_level_val1_185 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_1_rt_188 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_2_rt_190 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_3_rt_192 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_4_rt_194 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_5_rt_196 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_6_rt_198 : STD_LOGIC;
  signal u_speed_Mcount_ticks_xor_7_rt_200 : STD_LOGIC;
  signal u_speed_N7 : STD_LOGIC;
  signal u_speed_N9 : STD_LOGIC;
  signal u_speed_Result_0_1 : STD_LOGIC;
  signal u_speed_Result_1_1_206 : STD_LOGIC;
  signal u_speed_Result_2_1_208 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000 : STD_LOGIC;
  signal u_speed_deb_f_354 : STD_LOGIC;
  signal u_speed_deb_f_not0001 : STD_LOGIC;
  signal u_speed_deb_s_356 : STD_LOGIC;
  signal u_speed_deb_s_not0001 : STD_LOGIC;
  signal u_speed_faster_meta_358 : STD_LOGIC;
  signal u_speed_faster_sync_359 : STD_LOGIC;
  signal u_speed_level_and0000_363 : STD_LOGIC;
  signal u_speed_level_and0001 : STD_LOGIC;
  signal u_speed_level_or0000 : STD_LOGIC;
  signal u_speed_slower_meta_366 : STD_LOGIC;
  signal u_speed_slower_sync_367 : STD_LOGIC;
  signal u_speed_state_next : STD_LOGIC;
  signal u_speed_step_next : STD_LOGIC;
  signal u_speed_step_reg_371 : STD_LOGIC;
  signal u_speed_ticks_or0000 : STD_LOGIC;
  signal u_knight_Mcount_count_cy : STD_LOGIC_VECTOR ( 6 downto 0 );
  signal u_knight_Mcount_count_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_knight_Result : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal u_knight_count : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal u_knight_dir : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_knight_pattern : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal u_knight_pattern_mux0001 : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal u_pre_cnt : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_speed_Madd_cnt_f_next_addsub0000_cy : STD_LOGIC_VECTOR ( 18 downto 0 );
  signal u_speed_Madd_cnt_f_next_addsub0000_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_speed_Madd_cnt_s_next_addsub0000_cy : STD_LOGIC_VECTOR ( 18 downto 0 );
  signal u_speed_Madd_cnt_s_next_addsub0000_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal u_speed_Mcompar_step_next_cmp_ge0000_lut : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal u_speed_Mcount_ticks_cy : STD_LOGIC_VECTOR ( 6 downto 0 );
  signal u_speed_Mcount_ticks_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_speed_Result : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal u_speed_cnt_f : STD_LOGIC_VECTOR ( 19 downto 0 );
  signal u_speed_cnt_f_next : STD_LOGIC_VECTOR ( 19 downto 0 );
  signal u_speed_cnt_f_next_addsub0000 : STD_LOGIC_VECTOR ( 19 downto 0 );
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy : STD_LOGIC_VECTOR ( 3 downto 0 );
  signal u_speed_cnt_f_next_cmp_eq0000_wg_lut : STD_LOGIC_VECTOR ( 4 downto 0 );
  signal u_speed_cnt_s : STD_LOGIC_VECTOR ( 19 downto 0 );
  signal u_speed_cnt_s_next : STD_LOGIC_VECTOR ( 19 downto 0 );
  signal u_speed_cnt_s_next_addsub0000 : STD_LOGIC_VECTOR ( 19 downto 0 );
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy : STD_LOGIC_VECTOR ( 3 downto 0 );
  signal u_speed_cnt_s_next_cmp_eq0000_wg_lut : STD_LOGIC_VECTOR ( 4 downto 0 );
  signal u_speed_level : STD_LOGIC_VECTOR ( 2 downto 0 );
  signal u_speed_state_reg : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_speed_ticks : STD_LOGIC_VECTOR ( 7 downto 0 );
begin
  XST_GND : GND
    port map (
      G => N0
    );
  XST_VCC : VCC
    port map (
      P => N1
    );
  u_pre_tick : FDR
    port map (
      C => clk_BUFGP_10,
      D => N1,
      R => u_pre_tick_or0000,
      Q => u_pre_tick_88
    );
  u_pre_cnt_0 : FDR
    port map (
      C => clk_BUFGP_10,
      D => N1,
      R => u_pre_cnt_0_or0000,
      Q => u_pre_cnt(0)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_7_Q : MUXCY
    port map (
      CI => u_speed_Mcompar_step_next_cmp_ge0000_cy(6),
      DI => u_speed_ticks(7),
      S => u_speed_Mcompar_step_next_cmp_ge0000_lut(7),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(7)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_6_Q : MUXCY
    port map (
      CI => u_speed_Mcompar_step_next_cmp_ge0000_cy(5),
      DI => u_speed_ticks(6),
      S => u_speed_Mcompar_step_next_cmp_ge0000_lut(6),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(6)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_5_Q : MUXCY
    port map (
      CI => u_speed_Mcompar_step_next_cmp_ge0000_cy(4),
      DI => u_speed_ticks(5),
      S => u_speed_Mcompar_step_next_cmp_ge0000_lut(5),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(5)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_4_Q : MUXCY
    port map (
      CI => u_speed_Mcompar_step_next_cmp_ge0000_cy(3),
      DI => u_speed_ticks(4),
      S => u_speed_Mcompar_step_next_cmp_ge0000_lut(4),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(4)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_3_Q : MUXCY
    port map (
      CI => u_speed_Mcompar_step_next_cmp_ge0000_cy(2),
      DI => u_speed_ticks(3),
      S => u_speed_Mcompar_step_next_cmp_ge0000_lut(3),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(3)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_3_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => u_speed_ticks(3),
      I1 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(3)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_2_Q : MUXCY
    port map (
      CI => u_speed_Mcompar_step_next_cmp_ge0000_cy(1),
      DI => u_speed_ticks(2),
      S => u_speed_Mcompar_step_next_cmp_ge0000_lut(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(2)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_1_Q : MUXCY
    port map (
      CI => u_speed_Mcompar_step_next_cmp_ge0000_cy(0),
      DI => u_speed_ticks(1),
      S => u_speed_Mcompar_step_next_cmp_ge0000_lut(1),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(1)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_0_Q : MUXCY
    port map (
      CI => N1,
      DI => u_speed_ticks(0),
      S => u_speed_Mcompar_step_next_cmp_ge0000_lut(0),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(0)
    );
  u_speed_Mcount_ticks_xor_7_Q : XORCY
    port map (
      CI => u_speed_Mcount_ticks_cy(6),
      LI => u_speed_Mcount_ticks_xor_7_rt_200,
      O => u_speed_Result(7)
    );
  u_speed_Mcount_ticks_xor_6_Q : XORCY
    port map (
      CI => u_speed_Mcount_ticks_cy(5),
      LI => u_speed_Mcount_ticks_cy_6_rt_198,
      O => u_speed_Result(6)
    );
  u_speed_Mcount_ticks_cy_6_Q : MUXCY
    port map (
      CI => u_speed_Mcount_ticks_cy(5),
      DI => N0,
      S => u_speed_Mcount_ticks_cy_6_rt_198,
      O => u_speed_Mcount_ticks_cy(6)
    );
  u_speed_Mcount_ticks_xor_5_Q : XORCY
    port map (
      CI => u_speed_Mcount_ticks_cy(4),
      LI => u_speed_Mcount_ticks_cy_5_rt_196,
      O => u_speed_Result(5)
    );
  u_speed_Mcount_ticks_cy_5_Q : MUXCY
    port map (
      CI => u_speed_Mcount_ticks_cy(4),
      DI => N0,
      S => u_speed_Mcount_ticks_cy_5_rt_196,
      O => u_speed_Mcount_ticks_cy(5)
    );
  u_speed_Mcount_ticks_xor_4_Q : XORCY
    port map (
      CI => u_speed_Mcount_ticks_cy(3),
      LI => u_speed_Mcount_ticks_cy_4_rt_194,
      O => u_speed_Result(4)
    );
  u_speed_Mcount_ticks_cy_4_Q : MUXCY
    port map (
      CI => u_speed_Mcount_ticks_cy(3),
      DI => N0,
      S => u_speed_Mcount_ticks_cy_4_rt_194,
      O => u_speed_Mcount_ticks_cy(4)
    );
  u_speed_Mcount_ticks_xor_3_Q : XORCY
    port map (
      CI => u_speed_Mcount_ticks_cy(2),
      LI => u_speed_Mcount_ticks_cy_3_rt_192,
      O => u_speed_Result(3)
    );
  u_speed_Mcount_ticks_cy_3_Q : MUXCY
    port map (
      CI => u_speed_Mcount_ticks_cy(2),
      DI => N0,
      S => u_speed_Mcount_ticks_cy_3_rt_192,
      O => u_speed_Mcount_ticks_cy(3)
    );
  u_speed_Mcount_ticks_xor_2_Q : XORCY
    port map (
      CI => u_speed_Mcount_ticks_cy(1),
      LI => u_speed_Mcount_ticks_cy_2_rt_190,
      O => u_speed_Result_2_1_208
    );
  u_speed_Mcount_ticks_cy_2_Q : MUXCY
    port map (
      CI => u_speed_Mcount_ticks_cy(1),
      DI => N0,
      S => u_speed_Mcount_ticks_cy_2_rt_190,
      O => u_speed_Mcount_ticks_cy(2)
    );
  u_speed_Mcount_ticks_xor_1_Q : XORCY
    port map (
      CI => u_speed_Mcount_ticks_cy(0),
      LI => u_speed_Mcount_ticks_cy_1_rt_188,
      O => u_speed_Result_1_1_206
    );
  u_speed_Mcount_ticks_cy_1_Q : MUXCY
    port map (
      CI => u_speed_Mcount_ticks_cy(0),
      DI => N0,
      S => u_speed_Mcount_ticks_cy_1_rt_188,
      O => u_speed_Mcount_ticks_cy(1)
    );
  u_speed_Mcount_ticks_xor_0_Q : XORCY
    port map (
      CI => N0,
      LI => u_speed_Mcount_ticks_lut(0),
      O => u_speed_Result_0_1
    );
  u_speed_Mcount_ticks_cy_0_Q : MUXCY
    port map (
      CI => N0,
      DI => N1,
      S => u_speed_Mcount_ticks_lut(0),
      O => u_speed_Mcount_ticks_cy(0)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_19_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(18),
      LI => u_speed_Madd_cnt_f_next_addsub0000_xor_19_rt_128,
      O => u_speed_cnt_f_next_addsub0000(19)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_18_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(17),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_18_rt_108,
      O => u_speed_cnt_f_next_addsub0000(18)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_18_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(17),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_18_rt_108,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(18)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_17_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(16),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_17_rt_106,
      O => u_speed_cnt_f_next_addsub0000(17)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_17_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(16),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_17_rt_106,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(17)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_16_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(15),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_16_rt_104,
      O => u_speed_cnt_f_next_addsub0000(16)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_16_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(15),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_16_rt_104,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(16)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_15_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(14),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_15_rt_102,
      O => u_speed_cnt_f_next_addsub0000(15)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_15_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(14),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_15_rt_102,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(15)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_14_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(13),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_14_rt_100,
      O => u_speed_cnt_f_next_addsub0000(14)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_14_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(13),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_14_rt_100,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(14)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_13_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(12),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_13_rt_98,
      O => u_speed_cnt_f_next_addsub0000(13)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_13_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(12),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_13_rt_98,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(13)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_12_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(11),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_12_rt_96,
      O => u_speed_cnt_f_next_addsub0000(12)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_12_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(11),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_12_rt_96,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(12)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_11_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(10),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_11_rt_94,
      O => u_speed_cnt_f_next_addsub0000(11)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_11_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(10),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_11_rt_94,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(11)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_10_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(9),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_10_rt_92,
      O => u_speed_cnt_f_next_addsub0000(10)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_10_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(9),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_10_rt_92,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(10)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_9_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(8),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_9_rt_126,
      O => u_speed_cnt_f_next_addsub0000(9)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_9_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(8),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_9_rt_126,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(9)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_8_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(7),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_8_rt_124,
      O => u_speed_cnt_f_next_addsub0000(8)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_8_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(7),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_8_rt_124,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(8)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_7_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(6),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_7_rt_122,
      O => u_speed_cnt_f_next_addsub0000(7)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_7_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(6),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_7_rt_122,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(7)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_6_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(5),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_6_rt_120,
      O => u_speed_cnt_f_next_addsub0000(6)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_6_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(5),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_6_rt_120,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(6)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_5_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(4),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_5_rt_118,
      O => u_speed_cnt_f_next_addsub0000(5)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_5_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(4),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_5_rt_118,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(5)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_4_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(3),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_4_rt_116,
      O => u_speed_cnt_f_next_addsub0000(4)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_4_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(3),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_4_rt_116,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(4)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_3_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(2),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_3_rt_114,
      O => u_speed_cnt_f_next_addsub0000(3)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_3_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(2),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_3_rt_114,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(3)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_2_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(1),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_2_rt_112,
      O => u_speed_cnt_f_next_addsub0000(2)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_2_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(1),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_2_rt_112,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(2)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_1_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(0),
      LI => u_speed_Madd_cnt_f_next_addsub0000_cy_1_rt_110,
      O => u_speed_cnt_f_next_addsub0000(1)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_1_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_f_next_addsub0000_cy(0),
      DI => N0,
      S => u_speed_Madd_cnt_f_next_addsub0000_cy_1_rt_110,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(1)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_0_Q : XORCY
    port map (
      CI => N0,
      LI => u_speed_Madd_cnt_f_next_addsub0000_lut(0),
      O => u_speed_cnt_f_next_addsub0000(0)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_0_Q : MUXCY
    port map (
      CI => N0,
      DI => N1,
      S => u_speed_Madd_cnt_f_next_addsub0000_lut(0),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(0)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_19_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(18),
      LI => u_speed_Madd_cnt_s_next_addsub0000_xor_19_rt_167,
      O => u_speed_cnt_s_next_addsub0000(19)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_18_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(17),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_18_rt_147,
      O => u_speed_cnt_s_next_addsub0000(18)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_18_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(17),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_18_rt_147,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(18)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_17_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(16),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_17_rt_145,
      O => u_speed_cnt_s_next_addsub0000(17)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_17_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(16),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_17_rt_145,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(17)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_16_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(15),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_16_rt_143,
      O => u_speed_cnt_s_next_addsub0000(16)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_16_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(15),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_16_rt_143,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(16)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_15_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(14),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_15_rt_141,
      O => u_speed_cnt_s_next_addsub0000(15)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_15_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(14),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_15_rt_141,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(15)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_14_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(13),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_14_rt_139,
      O => u_speed_cnt_s_next_addsub0000(14)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_14_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(13),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_14_rt_139,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(14)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_13_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(12),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_13_rt_137,
      O => u_speed_cnt_s_next_addsub0000(13)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_13_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(12),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_13_rt_137,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(13)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_12_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(11),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_12_rt_135,
      O => u_speed_cnt_s_next_addsub0000(12)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_12_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(11),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_12_rt_135,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(12)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_11_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(10),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_11_rt_133,
      O => u_speed_cnt_s_next_addsub0000(11)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_11_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(10),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_11_rt_133,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(11)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_10_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(9),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_10_rt_131,
      O => u_speed_cnt_s_next_addsub0000(10)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_10_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(9),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_10_rt_131,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(10)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_9_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(8),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_9_rt_165,
      O => u_speed_cnt_s_next_addsub0000(9)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_9_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(8),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_9_rt_165,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(9)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_8_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(7),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_8_rt_163,
      O => u_speed_cnt_s_next_addsub0000(8)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_8_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(7),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_8_rt_163,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(8)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_7_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(6),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_7_rt_161,
      O => u_speed_cnt_s_next_addsub0000(7)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_7_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(6),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_7_rt_161,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(7)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_6_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(5),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_6_rt_159,
      O => u_speed_cnt_s_next_addsub0000(6)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_6_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(5),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_6_rt_159,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(6)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_5_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(4),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_5_rt_157,
      O => u_speed_cnt_s_next_addsub0000(5)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_5_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(4),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_5_rt_157,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(5)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_4_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(3),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_4_rt_155,
      O => u_speed_cnt_s_next_addsub0000(4)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_4_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(3),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_4_rt_155,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(4)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_3_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(2),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_3_rt_153,
      O => u_speed_cnt_s_next_addsub0000(3)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_3_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(2),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_3_rt_153,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(3)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_2_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(1),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_2_rt_151,
      O => u_speed_cnt_s_next_addsub0000(2)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_2_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(1),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_2_rt_151,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(2)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_1_Q : XORCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(0),
      LI => u_speed_Madd_cnt_s_next_addsub0000_cy_1_rt_149,
      O => u_speed_cnt_s_next_addsub0000(1)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_1_Q : MUXCY
    port map (
      CI => u_speed_Madd_cnt_s_next_addsub0000_cy(0),
      DI => N0,
      S => u_speed_Madd_cnt_s_next_addsub0000_cy_1_rt_149,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(1)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_0_Q : XORCY
    port map (
      CI => N0,
      LI => u_speed_Madd_cnt_s_next_addsub0000_lut(0),
      O => u_speed_cnt_s_next_addsub0000(0)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_0_Q : MUXCY
    port map (
      CI => N0,
      DI => N1,
      S => u_speed_Madd_cnt_s_next_addsub0000_lut(0),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(0)
    );
  u_speed_ticks_7 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_pre_tick_88,
      D => u_speed_Result(7),
      R => u_speed_ticks_or0000,
      Q => u_speed_ticks(7)
    );
  u_speed_ticks_6 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_pre_tick_88,
      D => u_speed_Result(6),
      R => u_speed_ticks_or0000,
      Q => u_speed_ticks(6)
    );
  u_speed_ticks_5 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_pre_tick_88,
      D => u_speed_Result(5),
      R => u_speed_ticks_or0000,
      Q => u_speed_ticks(5)
    );
  u_speed_ticks_4 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_pre_tick_88,
      D => u_speed_Result(4),
      R => u_speed_ticks_or0000,
      Q => u_speed_ticks(4)
    );
  u_speed_ticks_3 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_pre_tick_88,
      D => u_speed_Result(3),
      R => u_speed_ticks_or0000,
      Q => u_speed_ticks(3)
    );
  u_speed_ticks_2 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_pre_tick_88,
      D => u_speed_Result_2_1_208,
      R => u_speed_ticks_or0000,
      Q => u_speed_ticks(2)
    );
  u_speed_ticks_1 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_pre_tick_88,
      D => u_speed_Result_1_1_206,
      R => u_speed_ticks_or0000,
      Q => u_speed_ticks(1)
    );
  u_speed_ticks_0 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_pre_tick_88,
      D => u_speed_Result_0_1,
      R => u_speed_ticks_or0000,
      Q => u_speed_ticks(0)
    );
  u_speed_level_1 : FDRSE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_speed_level_or0000,
      D => u_speed_Result(1),
      R => u_speed_Mcount_level_val1_185,
      S => u_speed_level_and0001,
      Q => u_speed_level(1)
    );
  u_speed_level_0 : FDRSE
    generic map(
      INIT => '1'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_speed_level_or0000,
      D => u_speed_Result(0),
      R => u_speed_level_and0000_363,
      S => u_speed_Mcount_level_val,
      Q => u_speed_level(0)
    );
  u_speed_level_2 : FDRSE
    generic map(
      INIT => '1'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_speed_level_or0000,
      D => u_speed_Result(2),
      R => u_speed_level_and0000_363,
      S => u_speed_Mcount_level_val,
      Q => u_speed_level(2)
    );
  u_speed_deb_f : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_speed_deb_f_not0001,
      D => u_speed_faster_sync_359,
      R => sw_0_IBUF_32,
      Q => u_speed_deb_f_354
    );
  u_speed_deb_s : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_speed_deb_s_not0001,
      D => u_speed_slower_sync_367,
      R => sw_0_IBUF_32,
      Q => u_speed_deb_s_356
    );
  u_speed_faster_sync : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_faster_meta_358,
      R => sw_0_IBUF_32,
      Q => u_speed_faster_sync_359
    );
  u_speed_slower_sync : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_slower_meta_366,
      R => sw_0_IBUF_32,
      Q => u_speed_slower_sync_367
    );
  u_speed_slower_meta : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => btn_0_IBUF_7,
      R => sw_0_IBUF_32,
      Q => u_speed_slower_meta_366
    );
  u_speed_cnt_s_19 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(19),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(19)
    );
  u_speed_cnt_s_18 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(18),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(18)
    );
  u_speed_cnt_s_17 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(17),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(17)
    );
  u_speed_cnt_s_16 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(16),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(16)
    );
  u_speed_cnt_s_15 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(15),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(15)
    );
  u_speed_cnt_s_14 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(14),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(14)
    );
  u_speed_cnt_s_13 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(13),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(13)
    );
  u_speed_cnt_s_12 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(12),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(12)
    );
  u_speed_cnt_s_11 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(11),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(11)
    );
  u_speed_cnt_s_10 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(10),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(10)
    );
  u_speed_cnt_s_9 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(9),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(9)
    );
  u_speed_cnt_s_8 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(8),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(8)
    );
  u_speed_cnt_s_7 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(7),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(7)
    );
  u_speed_cnt_s_6 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(6),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(6)
    );
  u_speed_cnt_s_5 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(5),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(5)
    );
  u_speed_cnt_s_4 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(4),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(4)
    );
  u_speed_cnt_s_3 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(3),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(3)
    );
  u_speed_cnt_s_2 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(2),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(2)
    );
  u_speed_cnt_s_1 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(1),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(1)
    );
  u_speed_cnt_s_0 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_s_next(0),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_s(0)
    );
  u_speed_step_reg : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_step_next,
      R => sw_0_IBUF_32,
      Q => u_speed_step_reg_371
    );
  u_speed_cnt_f_19 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(19),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(19)
    );
  u_speed_cnt_f_18 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(18),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(18)
    );
  u_speed_cnt_f_17 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(17),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(17)
    );
  u_speed_cnt_f_16 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(16),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(16)
    );
  u_speed_cnt_f_15 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(15),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(15)
    );
  u_speed_cnt_f_14 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(14),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(14)
    );
  u_speed_cnt_f_13 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(13),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(13)
    );
  u_speed_cnt_f_12 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(12),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(12)
    );
  u_speed_cnt_f_11 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(11),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(11)
    );
  u_speed_cnt_f_10 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(10),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(10)
    );
  u_speed_cnt_f_9 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(9),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(9)
    );
  u_speed_cnt_f_8 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(8),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(8)
    );
  u_speed_cnt_f_7 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(7),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(7)
    );
  u_speed_cnt_f_6 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(6),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(6)
    );
  u_speed_cnt_f_5 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(5),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(5)
    );
  u_speed_cnt_f_4 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(4),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(4)
    );
  u_speed_cnt_f_3 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(3),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(3)
    );
  u_speed_cnt_f_2 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(2),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(2)
    );
  u_speed_cnt_f_1 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(1),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(1)
    );
  u_speed_cnt_f_0 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_cnt_f_next(0),
      R => sw_0_IBUF_32,
      Q => u_speed_cnt_f(0)
    );
  u_speed_state_reg_0 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => u_speed_state_next,
      R => sw_0_IBUF_32,
      Q => u_speed_state_reg(0)
    );
  u_speed_faster_meta : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      D => btn_1_IBUF_8,
      R => sw_0_IBUF_32,
      Q => u_speed_faster_meta_358
    );
  u_knight_Mcount_count_xor_7_Q : XORCY
    port map (
      CI => u_knight_Mcount_count_cy(6),
      LI => u_knight_Mcount_count_xor_7_rt_50,
      O => u_knight_Result(7)
    );
  u_knight_Mcount_count_xor_6_Q : XORCY
    port map (
      CI => u_knight_Mcount_count_cy(5),
      LI => u_knight_Mcount_count_cy_6_rt_48,
      O => u_knight_Result(6)
    );
  u_knight_Mcount_count_cy_6_Q : MUXCY
    port map (
      CI => u_knight_Mcount_count_cy(5),
      DI => N0,
      S => u_knight_Mcount_count_cy_6_rt_48,
      O => u_knight_Mcount_count_cy(6)
    );
  u_knight_Mcount_count_xor_5_Q : XORCY
    port map (
      CI => u_knight_Mcount_count_cy(4),
      LI => u_knight_Mcount_count_cy_5_rt_46,
      O => u_knight_Result(5)
    );
  u_knight_Mcount_count_cy_5_Q : MUXCY
    port map (
      CI => u_knight_Mcount_count_cy(4),
      DI => N0,
      S => u_knight_Mcount_count_cy_5_rt_46,
      O => u_knight_Mcount_count_cy(5)
    );
  u_knight_Mcount_count_xor_4_Q : XORCY
    port map (
      CI => u_knight_Mcount_count_cy(3),
      LI => u_knight_Mcount_count_cy_4_rt_44,
      O => u_knight_Result(4)
    );
  u_knight_Mcount_count_cy_4_Q : MUXCY
    port map (
      CI => u_knight_Mcount_count_cy(3),
      DI => N0,
      S => u_knight_Mcount_count_cy_4_rt_44,
      O => u_knight_Mcount_count_cy(4)
    );
  u_knight_Mcount_count_xor_3_Q : XORCY
    port map (
      CI => u_knight_Mcount_count_cy(2),
      LI => u_knight_Mcount_count_cy_3_rt_42,
      O => u_knight_Result(3)
    );
  u_knight_Mcount_count_cy_3_Q : MUXCY
    port map (
      CI => u_knight_Mcount_count_cy(2),
      DI => N0,
      S => u_knight_Mcount_count_cy_3_rt_42,
      O => u_knight_Mcount_count_cy(3)
    );
  u_knight_Mcount_count_xor_2_Q : XORCY
    port map (
      CI => u_knight_Mcount_count_cy(1),
      LI => u_knight_Mcount_count_cy_2_rt_40,
      O => u_knight_Result(2)
    );
  u_knight_Mcount_count_cy_2_Q : MUXCY
    port map (
      CI => u_knight_Mcount_count_cy(1),
      DI => N0,
      S => u_knight_Mcount_count_cy_2_rt_40,
      O => u_knight_Mcount_count_cy(2)
    );
  u_knight_Mcount_count_xor_1_Q : XORCY
    port map (
      CI => u_knight_Mcount_count_cy(0),
      LI => u_knight_Mcount_count_cy_1_rt_38,
      O => u_knight_Result(1)
    );
  u_knight_Mcount_count_cy_1_Q : MUXCY
    port map (
      CI => u_knight_Mcount_count_cy(0),
      DI => N0,
      S => u_knight_Mcount_count_cy_1_rt_38,
      O => u_knight_Mcount_count_cy(1)
    );
  u_knight_Mcount_count_xor_0_Q : XORCY
    port map (
      CI => N0,
      LI => u_knight_Mcount_count_lut(0),
      O => u_knight_Result(0)
    );
  u_knight_Mcount_count_cy_0_Q : MUXCY
    port map (
      CI => N0,
      DI => N1,
      S => u_knight_Mcount_count_lut(0),
      O => u_knight_Mcount_count_cy(0)
    );
  u_knight_count_7 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_Result(7),
      R => sw_0_IBUF_32,
      Q => u_knight_count(7)
    );
  u_knight_count_6 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_Result(6),
      R => sw_0_IBUF_32,
      Q => u_knight_count(6)
    );
  u_knight_count_5 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_Result(5),
      R => sw_0_IBUF_32,
      Q => u_knight_count(5)
    );
  u_knight_count_4 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_Result(4),
      R => sw_0_IBUF_32,
      Q => u_knight_count(4)
    );
  u_knight_count_3 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_Result(3),
      R => sw_0_IBUF_32,
      Q => u_knight_count(3)
    );
  u_knight_count_2 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_Result(2),
      R => sw_0_IBUF_32,
      Q => u_knight_count(2)
    );
  u_knight_count_1 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_Result(1),
      R => sw_0_IBUF_32,
      Q => u_knight_count(1)
    );
  u_knight_count_0 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_Result(0),
      R => sw_0_IBUF_32,
      Q => u_knight_count(0)
    );
  u_knight_dir_0 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => u_knight_dir_0_not0001,
      D => u_knight_dir_0_mux0000,
      R => sw_0_IBUF_32,
      Q => u_knight_dir(0)
    );
  u_knight_pattern_7 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_pattern_mux0001(7),
      R => sw_0_IBUF_32,
      Q => u_knight_pattern(7)
    );
  u_knight_pattern_6 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_pattern_mux0001(6),
      R => sw_0_IBUF_32,
      Q => u_knight_pattern(6)
    );
  u_knight_pattern_5 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_pattern_mux0001(5),
      R => sw_0_IBUF_32,
      Q => u_knight_pattern(5)
    );
  u_knight_pattern_4 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_pattern_mux0001(4),
      R => sw_0_IBUF_32,
      Q => u_knight_pattern(4)
    );
  u_knight_pattern_3 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_pattern_mux0001(3),
      R => sw_0_IBUF_32,
      Q => u_knight_pattern(3)
    );
  u_knight_pattern_2 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_pattern_mux0001(2),
      R => sw_0_IBUF_32,
      Q => u_knight_pattern(2)
    );
  u_knight_pattern_1 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_pattern_mux0001(1),
      R => sw_0_IBUF_32,
      Q => u_knight_pattern(1)
    );
  u_knight_pattern_0 : FDSE
    generic map(
      INIT => '1'
    )
    port map (
      C => clk_BUFGP_10,
      CE => step,
      D => u_knight_pattern_mux0001(0),
      S => sw_0_IBUF_32,
      Q => u_knight_pattern(0)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_0_Q : LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      I0 => u_speed_cnt_s(7),
      I1 => u_speed_cnt_s(5),
      I2 => u_speed_cnt_s(4),
      I3 => u_speed_cnt_s(6),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(0)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_0_Q : MUXCY
    port map (
      CI => N1,
      DI => N0,
      S => u_speed_cnt_s_next_cmp_eq0000_wg_lut(0),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy(0)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_1_Q : LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      I0 => u_speed_cnt_s(8),
      I1 => u_speed_cnt_s(9),
      I2 => u_speed_cnt_s(3),
      I3 => u_speed_cnt_s(12),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(1)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_Q : MUXCY
    port map (
      CI => u_speed_cnt_s_next_cmp_eq0000_wg_cy(0),
      DI => N0,
      S => u_speed_cnt_s_next_cmp_eq0000_wg_lut(1),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy(1)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_2_Q : LUT4
    generic map(
      INIT => X"0010"
    )
    port map (
      I0 => u_speed_cnt_s(10),
      I1 => u_speed_cnt_s(11),
      I2 => u_speed_cnt_s(1),
      I3 => u_speed_cnt_s(13),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(2)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_2_Q : MUXCY
    port map (
      CI => u_speed_cnt_s_next_cmp_eq0000_wg_cy(1),
      DI => N0,
      S => u_speed_cnt_s_next_cmp_eq0000_wg_lut(2),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy(2)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_3_Q : LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      I0 => u_speed_cnt_s(14),
      I1 => u_speed_cnt_s(17),
      I2 => u_speed_cnt_s(0),
      I3 => u_speed_cnt_s(15),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(3)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_Q : MUXCY
    port map (
      CI => u_speed_cnt_s_next_cmp_eq0000_wg_cy(2),
      DI => N0,
      S => u_speed_cnt_s_next_cmp_eq0000_wg_lut(3),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy(3)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_4_Q : LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      I0 => u_speed_cnt_s(16),
      I1 => u_speed_cnt_s(18),
      I2 => u_speed_cnt_s(2),
      I3 => u_speed_cnt_s(19),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(4)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_4_Q : MUXCY
    port map (
      CI => u_speed_cnt_s_next_cmp_eq0000_wg_cy(3),
      DI => N0,
      S => u_speed_cnt_s_next_cmp_eq0000_wg_lut(4),
      O => u_speed_cnt_s_next_cmp_eq0000
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_0_Q : LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      I0 => u_speed_cnt_f(7),
      I1 => u_speed_cnt_f(5),
      I2 => u_speed_cnt_f(4),
      I3 => u_speed_cnt_f(6),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(0)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_0_Q : MUXCY
    port map (
      CI => N1,
      DI => N0,
      S => u_speed_cnt_f_next_cmp_eq0000_wg_lut(0),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy(0)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_1_Q : LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      I0 => u_speed_cnt_f(8),
      I1 => u_speed_cnt_f(9),
      I2 => u_speed_cnt_f(3),
      I3 => u_speed_cnt_f(12),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(1)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_Q : MUXCY
    port map (
      CI => u_speed_cnt_f_next_cmp_eq0000_wg_cy(0),
      DI => N0,
      S => u_speed_cnt_f_next_cmp_eq0000_wg_lut(1),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy(1)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_2_Q : LUT4
    generic map(
      INIT => X"0010"
    )
    port map (
      I0 => u_speed_cnt_f(10),
      I1 => u_speed_cnt_f(11),
      I2 => u_speed_cnt_f(1),
      I3 => u_speed_cnt_f(13),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(2)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_2_Q : MUXCY
    port map (
      CI => u_speed_cnt_f_next_cmp_eq0000_wg_cy(1),
      DI => N0,
      S => u_speed_cnt_f_next_cmp_eq0000_wg_lut(2),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy(2)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_3_Q : LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      I0 => u_speed_cnt_f(14),
      I1 => u_speed_cnt_f(17),
      I2 => u_speed_cnt_f(0),
      I3 => u_speed_cnt_f(15),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(3)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_Q : MUXCY
    port map (
      CI => u_speed_cnt_f_next_cmp_eq0000_wg_cy(2),
      DI => N0,
      S => u_speed_cnt_f_next_cmp_eq0000_wg_lut(3),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy(3)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_4_Q : LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      I0 => u_speed_cnt_f(16),
      I1 => u_speed_cnt_f(18),
      I2 => u_speed_cnt_f(2),
      I3 => u_speed_cnt_f(19),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(4)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_4_Q : MUXCY
    port map (
      CI => u_speed_cnt_f_next_cmp_eq0000_wg_cy(3),
      DI => N0,
      S => u_speed_cnt_f_next_cmp_eq0000_wg_lut(4),
      O => u_speed_cnt_f_next_cmp_eq0000
    );
  u_knight_pattern_mux0001_7_1 : LUT2
    generic map(
      INIT => X"4"
    )
    port map (
      I0 => u_knight_dir(0),
      I1 => u_knight_pattern(6),
      O => u_knight_pattern_mux0001(7)
    );
  u_knight_pattern_mux0001_0_1 : LUT2
    generic map(
      INIT => X"8"
    )
    port map (
      I0 => u_knight_dir(0),
      I1 => u_knight_pattern(1),
      O => u_knight_pattern_mux0001(0)
    );
  u_speed_Result_1_1 : LUT3
    generic map(
      INIT => X"96"
    )
    port map (
      I0 => u_speed_level(1),
      I1 => u_speed_level(0),
      I2 => u_speed_deb_f_354,
      O => u_speed_Result(1)
    );
  u_knight_pattern_mux0001_6_1 : LUT3
    generic map(
      INIT => X"E2"
    )
    port map (
      I0 => u_knight_pattern(5),
      I1 => u_knight_dir(0),
      I2 => u_knight_pattern(7),
      O => u_knight_pattern_mux0001(6)
    );
  u_knight_pattern_mux0001_5_1 : LUT3
    generic map(
      INIT => X"E2"
    )
    port map (
      I0 => u_knight_pattern(4),
      I1 => u_knight_dir(0),
      I2 => u_knight_pattern(6),
      O => u_knight_pattern_mux0001(5)
    );
  u_knight_pattern_mux0001_4_1 : LUT3
    generic map(
      INIT => X"E2"
    )
    port map (
      I0 => u_knight_pattern(3),
      I1 => u_knight_dir(0),
      I2 => u_knight_pattern(5),
      O => u_knight_pattern_mux0001(4)
    );
  u_knight_pattern_mux0001_3_1 : LUT3
    generic map(
      INIT => X"E2"
    )
    port map (
      I0 => u_knight_pattern(2),
      I1 => u_knight_dir(0),
      I2 => u_knight_pattern(4),
      O => u_knight_pattern_mux0001(3)
    );
  u_knight_pattern_mux0001_2_1 : LUT3
    generic map(
      INIT => X"E2"
    )
    port map (
      I0 => u_knight_pattern(1),
      I1 => u_knight_dir(0),
      I2 => u_knight_pattern(3),
      O => u_knight_pattern_mux0001(2)
    );
  u_knight_pattern_mux0001_1_1 : LUT3
    generic map(
      INIT => X"E2"
    )
    port map (
      I0 => u_knight_pattern(0),
      I1 => u_knight_dir(0),
      I2 => u_knight_pattern(2),
      O => u_knight_pattern_mux0001(1)
    );
  u_speed_Result_2_1 : LUT4
    generic map(
      INIT => X"B4D2"
    )
    port map (
      I0 => u_speed_deb_f_354,
      I1 => u_speed_level(0),
      I2 => u_speed_level(2),
      I3 => u_speed_level(1),
      O => u_speed_Result(2)
    );
  u_pre_tick_or00001 : LUT2
    generic map(
      INIT => X"D"
    )
    port map (
      I0 => u_pre_cnt(0),
      I1 => sw_0_IBUF_32,
      O => u_pre_tick_or0000
    );
  u_pre_cnt_0_or00001 : LUT2
    generic map(
      INIT => X"E"
    )
    port map (
      I0 => sw_0_IBUF_32,
      I1 => u_pre_cnt(0),
      O => u_pre_cnt_0_or0000
    );
  u_speed_level_and0000 : LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      I0 => u_speed_level(2),
      I1 => u_speed_level(1),
      I2 => u_speed_level(0),
      I3 => N01,
      O => u_speed_level_and0000_363
    );
  u_speed_state_next_0_mux00001 : LUT2
    generic map(
      INIT => X"E"
    )
    port map (
      I0 => u_speed_deb_f_354,
      I1 => u_speed_deb_s_356,
      O => u_speed_state_next
    );
  step1 : LUT2
    generic map(
      INIT => X"4"
    )
    port map (
      I0 => sw_2_IBUF_34,
      I1 => u_speed_step_reg_371,
      O => step
    );
  u_knight_dir_0_not00011 : LUT4
    generic map(
      INIT => X"A820"
    )
    port map (
      I0 => step,
      I1 => u_knight_dir(0),
      I2 => u_knight_pattern(6),
      I3 => u_knight_pattern(1),
      O => u_knight_dir_0_not0001
    );
  u_speed_Mcount_level_val1 : LUT4
    generic map(
      INIT => X"ABAA"
    )
    port map (
      I0 => sw_0_IBUF_32,
      I1 => u_speed_level(1),
      I2 => u_speed_level(2),
      I3 => N2,
      O => u_speed_Mcount_level_val1_185
    );
  u_speed_level_and00011 : LUT2
    generic map(
      INIT => X"4"
    )
    port map (
      I0 => sw_0_IBUF_32,
      I1 => u_speed_N7,
      O => u_speed_level_and0001
    );
  u_speed_Mcount_level_val3 : LUT2
    generic map(
      INIT => X"E"
    )
    port map (
      I0 => sw_0_IBUF_32,
      I1 => N4,
      O => u_speed_Mcount_level_val
    );
  u_speed_step_next1 : LUT2
    generic map(
      INIT => X"8"
    )
    port map (
      I0 => u_pre_tick_88,
      I1 => u_speed_Mcompar_step_next_cmp_ge0000_cy(7),
      O => u_speed_step_next
    );
  u_speed_deb_s_not00011 : LUT3
    generic map(
      INIT => X"60"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      O => u_speed_deb_s_not0001
    );
  u_speed_deb_f_not00011 : LUT3
    generic map(
      INIT => X"60"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      O => u_speed_deb_f_not0001
    );
  u_speed_Mcount_level_val211 : LUT3
    generic map(
      INIT => X"80"
    )
    port map (
      I0 => u_speed_level(0),
      I1 => u_speed_level(1),
      I2 => u_speed_level(2),
      O => u_speed_N9
    );
  u_speed_ticks_or00001 : LUT3
    generic map(
      INIT => X"EA"
    )
    port map (
      I0 => sw_0_IBUF_32,
      I1 => u_pre_tick_88,
      I2 => u_speed_Mcompar_step_next_cmp_ge0000_cy(7),
      O => u_speed_ticks_or0000
    );
  btn_1_IBUF : IBUF
    port map (
      I => btn(1),
      O => btn_1_IBUF_8
    );
  btn_0_IBUF : IBUF
    port map (
      I => btn(0),
      O => btn_0_IBUF_7
    );
  sw_3_IBUF : IBUF
    port map (
      I => sw(3),
      O => sw_3_IBUF_35
    );
  sw_2_IBUF : IBUF
    port map (
      I => sw(2),
      O => sw_2_IBUF_34
    );
  sw_1_IBUF : IBUF
    port map (
      I => sw(1),
      O => sw_1_IBUF_33
    );
  sw_0_IBUF : IBUF
    port map (
      I => sw(0),
      O => sw_0_IBUF_32
    );
  led_7_OBUF : OBUF
    port map (
      I => led_7_OBUF_26,
      O => led(7)
    );
  led_6_OBUF : OBUF
    port map (
      I => led_6_OBUF_25,
      O => led(6)
    );
  led_5_OBUF : OBUF
    port map (
      I => led_5_OBUF_24,
      O => led(5)
    );
  led_4_OBUF : OBUF
    port map (
      I => led_4_OBUF_23,
      O => led(4)
    );
  led_3_OBUF : OBUF
    port map (
      I => led_3_OBUF_22,
      O => led(3)
    );
  led_2_OBUF : OBUF
    port map (
      I => led_2_OBUF_21,
      O => led(2)
    );
  led_1_OBUF : OBUF
    port map (
      I => led_1_OBUF_20,
      O => led(1)
    );
  led_0_OBUF : OBUF
    port map (
      I => led_0_OBUF_19,
      O => led(0)
    );
  u_speed_Mcount_ticks_cy_6_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_ticks(6),
      O => u_speed_Mcount_ticks_cy_6_rt_198
    );
  u_speed_Mcount_ticks_cy_5_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_ticks(5),
      O => u_speed_Mcount_ticks_cy_5_rt_196
    );
  u_speed_Mcount_ticks_cy_4_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_ticks(4),
      O => u_speed_Mcount_ticks_cy_4_rt_194
    );
  u_speed_Mcount_ticks_cy_3_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_ticks(3),
      O => u_speed_Mcount_ticks_cy_3_rt_192
    );
  u_speed_Mcount_ticks_cy_2_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_ticks(2),
      O => u_speed_Mcount_ticks_cy_2_rt_190
    );
  u_speed_Mcount_ticks_cy_1_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_ticks(1),
      O => u_speed_Mcount_ticks_cy_1_rt_188
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_18_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(18),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_18_rt_108
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_17_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(17),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_17_rt_106
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_16_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(16),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_16_rt_104
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_15_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(15),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_15_rt_102
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_14_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(14),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_14_rt_100
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_13_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(13),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_13_rt_98
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_12_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(12),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_12_rt_96
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_11_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(11),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_11_rt_94
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_10_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(10),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_10_rt_92
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_9_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(9),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_9_rt_126
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_8_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(8),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_8_rt_124
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_7_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(7),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_7_rt_122
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_6_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(6),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_6_rt_120
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_5_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(5),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_5_rt_118
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_4_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(4),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_4_rt_116
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_3_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(3),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_3_rt_114
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_2_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(2),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_2_rt_112
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_1_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(1),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_1_rt_110
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_18_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(18),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_18_rt_147
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_17_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(17),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_17_rt_145
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_16_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(16),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_16_rt_143
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_15_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(15),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_15_rt_141
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_14_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(14),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_14_rt_139
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_13_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(13),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_13_rt_137
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_12_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(12),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_12_rt_135
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_11_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(11),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_11_rt_133
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_10_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(10),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_10_rt_131
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_9_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(9),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_9_rt_165
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_8_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(8),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_8_rt_163
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_7_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(7),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_7_rt_161
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_6_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(6),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_6_rt_159
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_5_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(5),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_5_rt_157
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_4_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(4),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_4_rt_155
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_3_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(3),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_3_rt_153
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_2_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(2),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_2_rt_151
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_1_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(1),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_1_rt_149
    );
  u_knight_Mcount_count_cy_6_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_knight_count(6),
      O => u_knight_Mcount_count_cy_6_rt_48
    );
  u_knight_Mcount_count_cy_5_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_knight_count(5),
      O => u_knight_Mcount_count_cy_5_rt_46
    );
  u_knight_Mcount_count_cy_4_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_knight_count(4),
      O => u_knight_Mcount_count_cy_4_rt_44
    );
  u_knight_Mcount_count_cy_3_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_knight_count(3),
      O => u_knight_Mcount_count_cy_3_rt_42
    );
  u_knight_Mcount_count_cy_2_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_knight_count(2),
      O => u_knight_Mcount_count_cy_2_rt_40
    );
  u_knight_Mcount_count_cy_1_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_knight_count(1),
      O => u_knight_Mcount_count_cy_1_rt_38
    );
  u_speed_Mcount_ticks_xor_7_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_ticks(7),
      O => u_speed_Mcount_ticks_xor_7_rt_200
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_19_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_f(19),
      O => u_speed_Madd_cnt_f_next_addsub0000_xor_19_rt_128
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_19_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_speed_cnt_s(19),
      O => u_speed_Madd_cnt_s_next_addsub0000_xor_19_rt_167
    );
  u_knight_Mcount_count_xor_7_rt : LUT1
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => u_knight_count(7),
      O => u_knight_Mcount_count_xor_7_rt_50
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_0_Q : LUT4
    generic map(
      INIT => X"AAA9"
    )
    port map (
      I0 => u_speed_ticks(0),
      I1 => u_speed_level(0),
      I2 => u_speed_level(1),
      I3 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(0)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_2_Q : LUT4
    generic map(
      INIT => X"A9A5"
    )
    port map (
      I0 => u_speed_ticks(2),
      I1 => u_speed_level(0),
      I2 => u_speed_level(2),
      I3 => u_speed_level(1),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(2)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_4_Q : LUT4
    generic map(
      INIT => X"A955"
    )
    port map (
      I0 => u_speed_ticks(4),
      I1 => u_speed_level(0),
      I2 => u_speed_level(1),
      I3 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(4)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_1_Q : LUT3
    generic map(
      INIT => X"A9"
    )
    port map (
      I0 => u_speed_ticks(1),
      I1 => u_speed_level(1),
      I2 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(1)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_5_Q : LUT3
    generic map(
      INIT => X"95"
    )
    port map (
      I0 => u_speed_ticks(5),
      I1 => u_speed_level(2),
      I2 => u_speed_level(1),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(5)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_6_Q : LUT4
    generic map(
      INIT => X"9555"
    )
    port map (
      I0 => u_speed_ticks(6),
      I1 => u_speed_level(0),
      I2 => u_speed_level(1),
      I3 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(6)
    );
  u_speed_cnt_s_next_0_1 : LUT4
    generic map(
      INIT => X"0220"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000(0),
      I1 => u_speed_cnt_s_next_cmp_eq0000,
      I2 => u_speed_deb_s_356,
      I3 => u_speed_slower_sync_367,
      O => u_speed_cnt_s_next(0)
    );
  u_speed_cnt_f_next_0_1 : LUT4
    generic map(
      INIT => X"0220"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000(0),
      I1 => u_speed_cnt_f_next_cmp_eq0000,
      I2 => u_speed_deb_f_354,
      I3 => u_speed_faster_sync_359,
      O => u_speed_cnt_f_next(0)
    );
  u_speed_cnt_s_next_1_1 : LUT4
    generic map(
      INIT => X"0220"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000(1),
      I1 => u_speed_cnt_s_next_cmp_eq0000,
      I2 => u_speed_deb_s_356,
      I3 => u_speed_slower_sync_367,
      O => u_speed_cnt_s_next(1)
    );
  u_speed_cnt_f_next_1_1 : LUT4
    generic map(
      INIT => X"0220"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000(1),
      I1 => u_speed_cnt_f_next_cmp_eq0000,
      I2 => u_speed_deb_f_354,
      I3 => u_speed_faster_sync_359,
      O => u_speed_cnt_f_next(1)
    );
  u_speed_cnt_s_next_2_1 : LUT4
    generic map(
      INIT => X"0220"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000(2),
      I1 => u_speed_cnt_s_next_cmp_eq0000,
      I2 => u_speed_deb_s_356,
      I3 => u_speed_slower_sync_367,
      O => u_speed_cnt_s_next(2)
    );
  u_speed_cnt_f_next_2_1 : LUT4
    generic map(
      INIT => X"0220"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000(2),
      I1 => u_speed_cnt_f_next_cmp_eq0000,
      I2 => u_speed_deb_f_354,
      I3 => u_speed_faster_sync_359,
      O => u_speed_cnt_f_next(2)
    );
  u_speed_cnt_s_next_3_1 : LUT4
    generic map(
      INIT => X"0060"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_addsub0000(3),
      I3 => u_speed_cnt_s_next_cmp_eq0000,
      O => u_speed_cnt_s_next(3)
    );
  u_speed_cnt_f_next_3_1 : LUT4
    generic map(
      INIT => X"0060"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_addsub0000(3),
      I3 => u_speed_cnt_f_next_cmp_eq0000,
      O => u_speed_cnt_f_next(3)
    );
  u_speed_cnt_s_next_4_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(4),
      O => u_speed_cnt_s_next(4)
    );
  u_speed_cnt_f_next_4_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(4),
      O => u_speed_cnt_f_next(4)
    );
  u_speed_cnt_s_next_5_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(5),
      O => u_speed_cnt_s_next(5)
    );
  u_speed_cnt_f_next_5_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(5),
      O => u_speed_cnt_f_next(5)
    );
  u_speed_cnt_s_next_6_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(6),
      O => u_speed_cnt_s_next(6)
    );
  u_speed_cnt_f_next_6_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(6),
      O => u_speed_cnt_f_next(6)
    );
  u_speed_cnt_s_next_7_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(7),
      O => u_speed_cnt_s_next(7)
    );
  u_speed_cnt_f_next_7_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(7),
      O => u_speed_cnt_f_next(7)
    );
  u_speed_cnt_s_next_8_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(8),
      O => u_speed_cnt_s_next(8)
    );
  u_speed_cnt_f_next_8_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(8),
      O => u_speed_cnt_f_next(8)
    );
  u_speed_cnt_s_next_9_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(9),
      O => u_speed_cnt_s_next(9)
    );
  u_speed_cnt_f_next_9_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(9),
      O => u_speed_cnt_f_next(9)
    );
  u_speed_cnt_s_next_10_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(10),
      O => u_speed_cnt_s_next(10)
    );
  u_speed_cnt_f_next_10_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(10),
      O => u_speed_cnt_f_next(10)
    );
  u_speed_cnt_s_next_11_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(11),
      O => u_speed_cnt_s_next(11)
    );
  u_speed_cnt_f_next_11_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(11),
      O => u_speed_cnt_f_next(11)
    );
  u_speed_cnt_s_next_12_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(12),
      O => u_speed_cnt_s_next(12)
    );
  u_speed_cnt_f_next_12_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(12),
      O => u_speed_cnt_f_next(12)
    );
  u_speed_cnt_s_next_13_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(13),
      O => u_speed_cnt_s_next(13)
    );
  u_speed_cnt_f_next_13_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(13),
      O => u_speed_cnt_f_next(13)
    );
  u_speed_cnt_s_next_14_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(14),
      O => u_speed_cnt_s_next(14)
    );
  u_speed_cnt_f_next_14_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(14),
      O => u_speed_cnt_f_next(14)
    );
  u_speed_cnt_s_next_15_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(15),
      O => u_speed_cnt_s_next(15)
    );
  u_speed_cnt_f_next_15_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(15),
      O => u_speed_cnt_f_next(15)
    );
  u_speed_cnt_s_next_16_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(16),
      O => u_speed_cnt_s_next(16)
    );
  u_speed_cnt_f_next_16_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(16),
      O => u_speed_cnt_f_next(16)
    );
  Mxor_led_Result_7_1 : LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      I0 => sw_3_IBUF_35,
      I1 => sw_1_IBUF_33,
      I2 => u_knight_pattern(7),
      I3 => u_knight_count(7),
      O => led_7_OBUF_26
    );
  Mxor_led_Result_6_1 : LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      I0 => sw_3_IBUF_35,
      I1 => sw_1_IBUF_33,
      I2 => u_knight_pattern(6),
      I3 => u_knight_count(6),
      O => led_6_OBUF_25
    );
  Mxor_led_Result_5_1 : LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      I0 => sw_3_IBUF_35,
      I1 => sw_1_IBUF_33,
      I2 => u_knight_pattern(5),
      I3 => u_knight_count(5),
      O => led_5_OBUF_24
    );
  Mxor_led_Result_4_1 : LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      I0 => sw_3_IBUF_35,
      I1 => sw_1_IBUF_33,
      I2 => u_knight_pattern(4),
      I3 => u_knight_count(4),
      O => led_4_OBUF_23
    );
  Mxor_led_Result_3_1 : LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      I0 => sw_3_IBUF_35,
      I1 => sw_1_IBUF_33,
      I2 => u_knight_pattern(3),
      I3 => u_knight_count(3),
      O => led_3_OBUF_22
    );
  Mxor_led_Result_2_1 : LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      I0 => sw_3_IBUF_35,
      I1 => sw_1_IBUF_33,
      I2 => u_knight_pattern(2),
      I3 => u_knight_count(2),
      O => led_2_OBUF_21
    );
  Mxor_led_Result_1_1 : LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      I0 => sw_3_IBUF_35,
      I1 => sw_1_IBUF_33,
      I2 => u_knight_pattern(1),
      I3 => u_knight_count(1),
      O => led_1_OBUF_20
    );
  Mxor_led_Result_0_1 : LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      I0 => sw_3_IBUF_35,
      I1 => sw_1_IBUF_33,
      I2 => u_knight_pattern(0),
      I3 => u_knight_count(0),
      O => led_0_OBUF_19
    );
  u_speed_level_or00001 : LUT4
    generic map(
      INIT => X"F5F4"
    )
    port map (
      I0 => u_speed_state_reg(0),
      I1 => u_speed_deb_f_354,
      I2 => sw_0_IBUF_32,
      I3 => u_speed_deb_s_356,
      O => u_speed_level_or0000
    );
  u_speed_cnt_s_next_17_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(17),
      O => u_speed_cnt_s_next(17)
    );
  u_speed_cnt_f_next_17_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(17),
      O => u_speed_cnt_f_next(17)
    );
  u_speed_cnt_s_next_18_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(18),
      O => u_speed_cnt_s_next(18)
    );
  u_speed_cnt_f_next_18_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(18),
      O => u_speed_cnt_f_next(18)
    );
  u_speed_cnt_s_next_19_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_slower_sync_367,
      I1 => u_speed_deb_s_356,
      I2 => u_speed_cnt_s_next_cmp_eq0000,
      I3 => u_speed_cnt_s_next_addsub0000(19),
      O => u_speed_cnt_s_next(19)
    );
  u_speed_cnt_f_next_19_1 : LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      I0 => u_speed_faster_sync_359,
      I1 => u_speed_deb_f_354,
      I2 => u_speed_cnt_f_next_cmp_eq0000,
      I3 => u_speed_cnt_f_next_addsub0000(19),
      O => u_speed_cnt_f_next(19)
    );
  clk_BUFGP : BUFGP
    port map (
      I => clk,
      O => clk_BUFGP_10
    );
  u_speed_Mcount_ticks_lut_0_INV_0 : INV
    port map (
      I => u_speed_ticks(0),
      O => u_speed_Mcount_ticks_lut(0)
    );
  u_speed_Madd_cnt_f_next_addsub0000_lut_0_INV_0 : INV
    port map (
      I => u_speed_cnt_f(0),
      O => u_speed_Madd_cnt_f_next_addsub0000_lut(0)
    );
  u_speed_Madd_cnt_s_next_addsub0000_lut_0_INV_0 : INV
    port map (
      I => u_speed_cnt_s(0),
      O => u_speed_Madd_cnt_s_next_addsub0000_lut(0)
    );
  u_knight_Mcount_count_lut_0_INV_0 : INV
    port map (
      I => u_knight_count(0),
      O => u_knight_Mcount_count_lut(0)
    );
  u_speed_Result_0_1_INV_0 : INV
    port map (
      I => u_speed_level(0),
      O => u_speed_Result(0)
    );
  u_knight_dir_0_mux00001_INV_0 : INV
    port map (
      I => u_knight_dir(0),
      O => u_knight_dir_0_mux0000
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_7_1_INV_0 : INV
    port map (
      I => u_speed_ticks(7),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(7)
    );
  u_speed_level_and0000_SW0 : LUT3_L
    generic map(
      INIT => X"EF"
    )
    port map (
      I0 => sw_0_IBUF_32,
      I1 => u_speed_state_reg(0),
      I2 => u_speed_deb_f_354,
      LO => N01
    );
  u_speed_Mcount_level_val1_SW0 : LUT3_L
    generic map(
      INIT => X"10"
    )
    port map (
      I0 => u_speed_state_reg(0),
      I1 => u_speed_level(0),
      I2 => u_speed_deb_f_354,
      LO => N2
    );
  u_speed_Mcount_level_val22 : LUT4_D
    generic map(
      INIT => X"0400"
    )
    port map (
      I0 => u_speed_state_reg(0),
      I1 => u_speed_deb_s_356,
      I2 => u_speed_deb_f_354,
      I3 => u_speed_N9,
      LO => N4,
      O => u_speed_N7
    );

end STRUCTURE;

