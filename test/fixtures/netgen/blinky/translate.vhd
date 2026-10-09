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
  signal btn_0_IBUF_10 : STD_LOGIC;
  signal btn_1_IBUF_11 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal led_0_OBUF_22 : STD_LOGIC;
  signal led_1_OBUF_23 : STD_LOGIC;
  signal led_2_OBUF_24 : STD_LOGIC;
  signal led_3_OBUF_25 : STD_LOGIC;
  signal led_4_OBUF_26 : STD_LOGIC;
  signal led_5_OBUF_27 : STD_LOGIC;
  signal led_6_OBUF_28 : STD_LOGIC;
  signal led_7_OBUF_29 : STD_LOGIC;
  signal step : STD_LOGIC;
  signal sw_0_IBUF_35 : STD_LOGIC;
  signal sw_1_IBUF_36 : STD_LOGIC;
  signal sw_2_IBUF_37 : STD_LOGIC;
  signal sw_3_IBUF_38 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_1_rt_41 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_2_rt_43 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_3_rt_45 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_4_rt_47 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_5_rt_49 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_6_rt_51 : STD_LOGIC;
  signal u_knight_Mcount_count_xor_7_rt_53 : STD_LOGIC;
  signal u_knight_dir_0_mux0000 : STD_LOGIC;
  signal u_knight_dir_0_not0001 : STD_LOGIC;
  signal u_pre_cnt_0_or0000 : STD_LOGIC;
  signal u_pre_tick_91 : STD_LOGIC;
  signal u_pre_tick_or0000 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_10_rt_95 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_11_rt_97 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_12_rt_99 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_13_rt_101 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_14_rt_103 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_15_rt_105 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_16_rt_107 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_17_rt_109 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_18_rt_111 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_1_rt_113 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_2_rt_115 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_3_rt_117 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_4_rt_119 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_5_rt_121 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_6_rt_123 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_7_rt_125 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_8_rt_127 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_9_rt_129 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_xor_19_rt_131 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_10_rt_134 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_11_rt_136 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_12_rt_138 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_13_rt_140 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_14_rt_142 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_15_rt_144 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_16_rt_146 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_17_rt_148 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_18_rt_150 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_1_rt_152 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_2_rt_154 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_3_rt_156 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_4_rt_158 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_5_rt_160 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_6_rt_162 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_7_rt_164 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_8_rt_166 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_9_rt_168 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_xor_19_rt_170 : STD_LOGIC;
  signal u_speed_Mcount_level_val : STD_LOGIC;
  signal u_speed_Mcount_level_val1_188 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_1_rt_191 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_2_rt_193 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_3_rt_195 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_4_rt_197 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_5_rt_199 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_6_rt_201 : STD_LOGIC;
  signal u_speed_Mcount_ticks_xor_7_rt_203 : STD_LOGIC;
  signal u_speed_N7 : STD_LOGIC;
  signal u_speed_N9 : STD_LOGIC;
  signal u_speed_Result_0_1 : STD_LOGIC;
  signal u_speed_Result_1_1_209 : STD_LOGIC;
  signal u_speed_Result_2_1_211 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000 : STD_LOGIC;
  signal u_speed_deb_f_357 : STD_LOGIC;
  signal u_speed_deb_f_not0001 : STD_LOGIC;
  signal u_speed_deb_s_359 : STD_LOGIC;
  signal u_speed_deb_s_not0001 : STD_LOGIC;
  signal u_speed_faster_meta_361 : STD_LOGIC;
  signal u_speed_faster_sync_362 : STD_LOGIC;
  signal u_speed_level_and0000_366 : STD_LOGIC;
  signal u_speed_level_and0001 : STD_LOGIC;
  signal u_speed_level_or0000 : STD_LOGIC;
  signal u_speed_slower_meta_369 : STD_LOGIC;
  signal u_speed_slower_sync_370 : STD_LOGIC;
  signal u_speed_state_next : STD_LOGIC;
  signal u_speed_step_next : STD_LOGIC;
  signal u_speed_step_reg_374 : STD_LOGIC;
  signal u_speed_ticks_or0000 : STD_LOGIC;
  signal u_speed_level_and0000_SW0_O : STD_LOGIC;
  signal u_speed_Mcount_level_val1_SW0_O : STD_LOGIC;
  signal clk_BUFGP_IBUFG_2 : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
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
  XST_GND : X_ZERO
    port map (
      O => N0
    );
  XST_VCC : X_ONE
    port map (
      O => N1
    );
  u_pre_tick : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => N1,
      SRST => u_pre_tick_or0000,
      O => u_pre_tick_91,
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_pre_cnt_0 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => N1,
      SRST => u_pre_cnt_0_or0000,
      O => u_pre_cnt(0),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_7_Q : X_MUX2
    port map (
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy(6),
      IA => u_speed_ticks(7),
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_lut(7),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(7)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_6_Q : X_MUX2
    port map (
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy(5),
      IA => u_speed_ticks(6),
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_lut(6),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(6)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_5_Q : X_MUX2
    port map (
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy(4),
      IA => u_speed_ticks(5),
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_lut(5),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(5)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_4_Q : X_MUX2
    port map (
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy(3),
      IA => u_speed_ticks(4),
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_lut(4),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(4)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_3_Q : X_MUX2
    port map (
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy(2),
      IA => u_speed_ticks(3),
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_lut(3),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(3)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_3_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => u_speed_ticks(3),
      ADR1 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(3)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_2_Q : X_MUX2
    port map (
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy(1),
      IA => u_speed_ticks(2),
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_lut(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(2)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_1_Q : X_MUX2
    port map (
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy(0),
      IA => u_speed_ticks(1),
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_lut(1),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(1)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_0_Q : X_MUX2
    port map (
      IB => N1,
      IA => u_speed_ticks(0),
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_lut(0),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy(0)
    );
  u_speed_Mcount_ticks_xor_7_Q : X_XOR2
    port map (
      I0 => u_speed_Mcount_ticks_cy(6),
      I1 => u_speed_Mcount_ticks_xor_7_rt_203,
      O => u_speed_Result(7)
    );
  u_speed_Mcount_ticks_xor_6_Q : X_XOR2
    port map (
      I0 => u_speed_Mcount_ticks_cy(5),
      I1 => u_speed_Mcount_ticks_cy_6_rt_201,
      O => u_speed_Result(6)
    );
  u_speed_Mcount_ticks_cy_6_Q : X_MUX2
    port map (
      IB => u_speed_Mcount_ticks_cy(5),
      IA => N0,
      SEL => u_speed_Mcount_ticks_cy_6_rt_201,
      O => u_speed_Mcount_ticks_cy(6)
    );
  u_speed_Mcount_ticks_xor_5_Q : X_XOR2
    port map (
      I0 => u_speed_Mcount_ticks_cy(4),
      I1 => u_speed_Mcount_ticks_cy_5_rt_199,
      O => u_speed_Result(5)
    );
  u_speed_Mcount_ticks_cy_5_Q : X_MUX2
    port map (
      IB => u_speed_Mcount_ticks_cy(4),
      IA => N0,
      SEL => u_speed_Mcount_ticks_cy_5_rt_199,
      O => u_speed_Mcount_ticks_cy(5)
    );
  u_speed_Mcount_ticks_xor_4_Q : X_XOR2
    port map (
      I0 => u_speed_Mcount_ticks_cy(3),
      I1 => u_speed_Mcount_ticks_cy_4_rt_197,
      O => u_speed_Result(4)
    );
  u_speed_Mcount_ticks_cy_4_Q : X_MUX2
    port map (
      IB => u_speed_Mcount_ticks_cy(3),
      IA => N0,
      SEL => u_speed_Mcount_ticks_cy_4_rt_197,
      O => u_speed_Mcount_ticks_cy(4)
    );
  u_speed_Mcount_ticks_xor_3_Q : X_XOR2
    port map (
      I0 => u_speed_Mcount_ticks_cy(2),
      I1 => u_speed_Mcount_ticks_cy_3_rt_195,
      O => u_speed_Result(3)
    );
  u_speed_Mcount_ticks_cy_3_Q : X_MUX2
    port map (
      IB => u_speed_Mcount_ticks_cy(2),
      IA => N0,
      SEL => u_speed_Mcount_ticks_cy_3_rt_195,
      O => u_speed_Mcount_ticks_cy(3)
    );
  u_speed_Mcount_ticks_xor_2_Q : X_XOR2
    port map (
      I0 => u_speed_Mcount_ticks_cy(1),
      I1 => u_speed_Mcount_ticks_cy_2_rt_193,
      O => u_speed_Result_2_1_211
    );
  u_speed_Mcount_ticks_cy_2_Q : X_MUX2
    port map (
      IB => u_speed_Mcount_ticks_cy(1),
      IA => N0,
      SEL => u_speed_Mcount_ticks_cy_2_rt_193,
      O => u_speed_Mcount_ticks_cy(2)
    );
  u_speed_Mcount_ticks_xor_1_Q : X_XOR2
    port map (
      I0 => u_speed_Mcount_ticks_cy(0),
      I1 => u_speed_Mcount_ticks_cy_1_rt_191,
      O => u_speed_Result_1_1_209
    );
  u_speed_Mcount_ticks_cy_1_Q : X_MUX2
    port map (
      IB => u_speed_Mcount_ticks_cy(0),
      IA => N0,
      SEL => u_speed_Mcount_ticks_cy_1_rt_191,
      O => u_speed_Mcount_ticks_cy(1)
    );
  u_speed_Mcount_ticks_xor_0_Q : X_XOR2
    port map (
      I0 => N0,
      I1 => u_speed_Mcount_ticks_lut(0),
      O => u_speed_Result_0_1
    );
  u_speed_Mcount_ticks_cy_0_Q : X_MUX2
    port map (
      IB => N0,
      IA => N1,
      SEL => u_speed_Mcount_ticks_lut(0),
      O => u_speed_Mcount_ticks_cy(0)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_19_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(18),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_xor_19_rt_131,
      O => u_speed_cnt_f_next_addsub0000(19)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_18_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(17),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_18_rt_111,
      O => u_speed_cnt_f_next_addsub0000(18)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_18_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(17),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_18_rt_111,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(18)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_17_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(16),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_17_rt_109,
      O => u_speed_cnt_f_next_addsub0000(17)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_17_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(16),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_17_rt_109,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(17)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_16_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(15),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_16_rt_107,
      O => u_speed_cnt_f_next_addsub0000(16)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_16_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(15),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_16_rt_107,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(16)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_15_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(14),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_15_rt_105,
      O => u_speed_cnt_f_next_addsub0000(15)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_15_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(14),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_15_rt_105,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(15)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_14_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(13),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_14_rt_103,
      O => u_speed_cnt_f_next_addsub0000(14)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_14_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(13),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_14_rt_103,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(14)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_13_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(12),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_13_rt_101,
      O => u_speed_cnt_f_next_addsub0000(13)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_13_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(12),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_13_rt_101,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(13)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_12_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(11),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_12_rt_99,
      O => u_speed_cnt_f_next_addsub0000(12)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_12_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(11),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_12_rt_99,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(12)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_11_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(10),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_11_rt_97,
      O => u_speed_cnt_f_next_addsub0000(11)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_11_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(10),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_11_rt_97,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(11)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_10_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(9),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_10_rt_95,
      O => u_speed_cnt_f_next_addsub0000(10)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_10_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(9),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_10_rt_95,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(10)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_9_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(8),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_9_rt_129,
      O => u_speed_cnt_f_next_addsub0000(9)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_9_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(8),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_9_rt_129,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(9)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_8_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(7),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_8_rt_127,
      O => u_speed_cnt_f_next_addsub0000(8)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_8_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(7),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_8_rt_127,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(8)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_7_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(6),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_7_rt_125,
      O => u_speed_cnt_f_next_addsub0000(7)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_7_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(6),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_7_rt_125,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(7)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_6_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(5),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_6_rt_123,
      O => u_speed_cnt_f_next_addsub0000(6)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_6_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(5),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_6_rt_123,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(6)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_5_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(4),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_5_rt_121,
      O => u_speed_cnt_f_next_addsub0000(5)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_5_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(4),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_5_rt_121,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(5)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_4_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(3),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_4_rt_119,
      O => u_speed_cnt_f_next_addsub0000(4)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_4_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(3),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_4_rt_119,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(4)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_3_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(2),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_3_rt_117,
      O => u_speed_cnt_f_next_addsub0000(3)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_3_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(2),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_3_rt_117,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(3)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_2_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(1),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_2_rt_115,
      O => u_speed_cnt_f_next_addsub0000(2)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_2_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(1),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_2_rt_115,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(2)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_1_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy(0),
      I1 => u_speed_Madd_cnt_f_next_addsub0000_cy_1_rt_113,
      O => u_speed_cnt_f_next_addsub0000(1)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_1_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy(0),
      IA => N0,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_cy_1_rt_113,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(1)
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_0_Q : X_XOR2
    port map (
      I0 => N0,
      I1 => u_speed_Madd_cnt_f_next_addsub0000_lut(0),
      O => u_speed_cnt_f_next_addsub0000(0)
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_0_Q : X_MUX2
    port map (
      IB => N0,
      IA => N1,
      SEL => u_speed_Madd_cnt_f_next_addsub0000_lut(0),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy(0)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_19_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(18),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_xor_19_rt_170,
      O => u_speed_cnt_s_next_addsub0000(19)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_18_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(17),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_18_rt_150,
      O => u_speed_cnt_s_next_addsub0000(18)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_18_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(17),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_18_rt_150,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(18)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_17_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(16),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_17_rt_148,
      O => u_speed_cnt_s_next_addsub0000(17)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_17_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(16),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_17_rt_148,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(17)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_16_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(15),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_16_rt_146,
      O => u_speed_cnt_s_next_addsub0000(16)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_16_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(15),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_16_rt_146,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(16)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_15_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(14),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_15_rt_144,
      O => u_speed_cnt_s_next_addsub0000(15)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_15_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(14),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_15_rt_144,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(15)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_14_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(13),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_14_rt_142,
      O => u_speed_cnt_s_next_addsub0000(14)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_14_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(13),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_14_rt_142,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(14)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_13_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(12),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_13_rt_140,
      O => u_speed_cnt_s_next_addsub0000(13)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_13_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(12),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_13_rt_140,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(13)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_12_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(11),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_12_rt_138,
      O => u_speed_cnt_s_next_addsub0000(12)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_12_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(11),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_12_rt_138,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(12)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_11_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(10),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_11_rt_136,
      O => u_speed_cnt_s_next_addsub0000(11)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_11_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(10),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_11_rt_136,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(11)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_10_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(9),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_10_rt_134,
      O => u_speed_cnt_s_next_addsub0000(10)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_10_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(9),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_10_rt_134,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(10)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_9_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(8),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_9_rt_168,
      O => u_speed_cnt_s_next_addsub0000(9)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_9_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(8),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_9_rt_168,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(9)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_8_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(7),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_8_rt_166,
      O => u_speed_cnt_s_next_addsub0000(8)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_8_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(7),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_8_rt_166,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(8)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_7_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(6),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_7_rt_164,
      O => u_speed_cnt_s_next_addsub0000(7)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_7_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(6),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_7_rt_164,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(7)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_6_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(5),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_6_rt_162,
      O => u_speed_cnt_s_next_addsub0000(6)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_6_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(5),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_6_rt_162,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(6)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_5_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(4),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_5_rt_160,
      O => u_speed_cnt_s_next_addsub0000(5)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_5_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(4),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_5_rt_160,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(5)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_4_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(3),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_4_rt_158,
      O => u_speed_cnt_s_next_addsub0000(4)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_4_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(3),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_4_rt_158,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(4)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_3_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(2),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_3_rt_156,
      O => u_speed_cnt_s_next_addsub0000(3)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_3_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(2),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_3_rt_156,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(3)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_2_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(1),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_2_rt_154,
      O => u_speed_cnt_s_next_addsub0000(2)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_2_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(1),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_2_rt_154,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(2)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_1_Q : X_XOR2
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy(0),
      I1 => u_speed_Madd_cnt_s_next_addsub0000_cy_1_rt_152,
      O => u_speed_cnt_s_next_addsub0000(1)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_1_Q : X_MUX2
    port map (
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy(0),
      IA => N0,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_cy_1_rt_152,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(1)
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_0_Q : X_XOR2
    port map (
      I0 => N0,
      I1 => u_speed_Madd_cnt_s_next_addsub0000_lut(0),
      O => u_speed_cnt_s_next_addsub0000(0)
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_0_Q : X_MUX2
    port map (
      IB => N0,
      IA => N1,
      SEL => u_speed_Madd_cnt_s_next_addsub0000_lut(0),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy(0)
    );
  u_speed_ticks_7 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_pre_tick_91,
      I => u_speed_Result(7),
      SRST => u_speed_ticks_or0000,
      O => u_speed_ticks(7),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_ticks_6 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_pre_tick_91,
      I => u_speed_Result(6),
      SRST => u_speed_ticks_or0000,
      O => u_speed_ticks(6),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_ticks_5 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_pre_tick_91,
      I => u_speed_Result(5),
      SRST => u_speed_ticks_or0000,
      O => u_speed_ticks(5),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_ticks_4 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_pre_tick_91,
      I => u_speed_Result(4),
      SRST => u_speed_ticks_or0000,
      O => u_speed_ticks(4),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_ticks_3 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_pre_tick_91,
      I => u_speed_Result(3),
      SRST => u_speed_ticks_or0000,
      O => u_speed_ticks(3),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_ticks_2 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_pre_tick_91,
      I => u_speed_Result_2_1_211,
      SRST => u_speed_ticks_or0000,
      O => u_speed_ticks(2),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_ticks_1 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_pre_tick_91,
      I => u_speed_Result_1_1_209,
      SRST => u_speed_ticks_or0000,
      O => u_speed_ticks(1),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_ticks_0 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_pre_tick_91,
      I => u_speed_Result_0_1,
      SRST => u_speed_ticks_or0000,
      O => u_speed_ticks(0),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_level_1 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_speed_level_or0000,
      I => u_speed_Result(1),
      SRST => u_speed_Mcount_level_val1_188,
      SSET => u_speed_level_and0001,
      O => u_speed_level(1),
      SET => GND,
      RST => GND
    );
  u_speed_level_0 : X_SFF
    generic map(
      INIT => '1'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_speed_level_or0000,
      I => u_speed_Result(0),
      SRST => u_speed_level_and0000_366,
      SSET => u_speed_Mcount_level_val,
      O => u_speed_level(0),
      SET => GND,
      RST => GND
    );
  u_speed_level_2 : X_SFF
    generic map(
      INIT => '1'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_speed_level_or0000,
      I => u_speed_Result(2),
      SRST => u_speed_level_and0000_366,
      SSET => u_speed_Mcount_level_val,
      O => u_speed_level(2),
      SET => GND,
      RST => GND
    );
  u_speed_deb_f : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_speed_deb_f_not0001,
      I => u_speed_faster_sync_362,
      SRST => sw_0_IBUF_35,
      O => u_speed_deb_f_357,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_deb_s : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_speed_deb_s_not0001,
      I => u_speed_slower_sync_370,
      SRST => sw_0_IBUF_35,
      O => u_speed_deb_s_359,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_faster_sync : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_faster_meta_361,
      SRST => sw_0_IBUF_35,
      O => u_speed_faster_sync_362,
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_slower_sync : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_slower_meta_369,
      SRST => sw_0_IBUF_35,
      O => u_speed_slower_sync_370,
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_slower_meta : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => btn_0_IBUF_10,
      SRST => sw_0_IBUF_35,
      O => u_speed_slower_meta_369,
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_19 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(19),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(19),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_18 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(18),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(18),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_17 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(17),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(17),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_16 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(16),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(16),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_15 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(15),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(15),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_14 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(14),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(14),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_13 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(13),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(13),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_12 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(12),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(12),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_11 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(11),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(11),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_10 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(10),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(10),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_9 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(9),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(9),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_8 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(8),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(8),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_7 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(7),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(7),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_6 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(6),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(6),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_5 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(5),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(5),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_4 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(4),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(4),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_3 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(3),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(3),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_2 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(2),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(2),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_1 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(1),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(1),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_s_0 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_s_next(0),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_s(0),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_step_reg : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_step_next,
      SRST => sw_0_IBUF_35,
      O => u_speed_step_reg_374,
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_19 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(19),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(19),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_18 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(18),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(18),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_17 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(17),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(17),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_16 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(16),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(16),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_15 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(15),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(15),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_14 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(14),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(14),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_13 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(13),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(13),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_12 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(12),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(12),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_11 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(11),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(11),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_10 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(10),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(10),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_9 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(9),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(9),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_8 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(8),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(8),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_7 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(7),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(7),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_6 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(6),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(6),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_5 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(5),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(5),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_4 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(4),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(4),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_3 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(3),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(3),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_2 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(2),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(2),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_1 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(1),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(1),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_cnt_f_0 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_cnt_f_next(0),
      SRST => sw_0_IBUF_35,
      O => u_speed_cnt_f(0),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_state_reg_0 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => u_speed_state_next,
      SRST => sw_0_IBUF_35,
      O => u_speed_state_reg(0),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_speed_faster_meta : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => btn_1_IBUF_11,
      SRST => sw_0_IBUF_35,
      O => u_speed_faster_meta_361,
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_Mcount_count_xor_7_Q : X_XOR2
    port map (
      I0 => u_knight_Mcount_count_cy(6),
      I1 => u_knight_Mcount_count_xor_7_rt_53,
      O => u_knight_Result(7)
    );
  u_knight_Mcount_count_xor_6_Q : X_XOR2
    port map (
      I0 => u_knight_Mcount_count_cy(5),
      I1 => u_knight_Mcount_count_cy_6_rt_51,
      O => u_knight_Result(6)
    );
  u_knight_Mcount_count_cy_6_Q : X_MUX2
    port map (
      IB => u_knight_Mcount_count_cy(5),
      IA => N0,
      SEL => u_knight_Mcount_count_cy_6_rt_51,
      O => u_knight_Mcount_count_cy(6)
    );
  u_knight_Mcount_count_xor_5_Q : X_XOR2
    port map (
      I0 => u_knight_Mcount_count_cy(4),
      I1 => u_knight_Mcount_count_cy_5_rt_49,
      O => u_knight_Result(5)
    );
  u_knight_Mcount_count_cy_5_Q : X_MUX2
    port map (
      IB => u_knight_Mcount_count_cy(4),
      IA => N0,
      SEL => u_knight_Mcount_count_cy_5_rt_49,
      O => u_knight_Mcount_count_cy(5)
    );
  u_knight_Mcount_count_xor_4_Q : X_XOR2
    port map (
      I0 => u_knight_Mcount_count_cy(3),
      I1 => u_knight_Mcount_count_cy_4_rt_47,
      O => u_knight_Result(4)
    );
  u_knight_Mcount_count_cy_4_Q : X_MUX2
    port map (
      IB => u_knight_Mcount_count_cy(3),
      IA => N0,
      SEL => u_knight_Mcount_count_cy_4_rt_47,
      O => u_knight_Mcount_count_cy(4)
    );
  u_knight_Mcount_count_xor_3_Q : X_XOR2
    port map (
      I0 => u_knight_Mcount_count_cy(2),
      I1 => u_knight_Mcount_count_cy_3_rt_45,
      O => u_knight_Result(3)
    );
  u_knight_Mcount_count_cy_3_Q : X_MUX2
    port map (
      IB => u_knight_Mcount_count_cy(2),
      IA => N0,
      SEL => u_knight_Mcount_count_cy_3_rt_45,
      O => u_knight_Mcount_count_cy(3)
    );
  u_knight_Mcount_count_xor_2_Q : X_XOR2
    port map (
      I0 => u_knight_Mcount_count_cy(1),
      I1 => u_knight_Mcount_count_cy_2_rt_43,
      O => u_knight_Result(2)
    );
  u_knight_Mcount_count_cy_2_Q : X_MUX2
    port map (
      IB => u_knight_Mcount_count_cy(1),
      IA => N0,
      SEL => u_knight_Mcount_count_cy_2_rt_43,
      O => u_knight_Mcount_count_cy(2)
    );
  u_knight_Mcount_count_xor_1_Q : X_XOR2
    port map (
      I0 => u_knight_Mcount_count_cy(0),
      I1 => u_knight_Mcount_count_cy_1_rt_41,
      O => u_knight_Result(1)
    );
  u_knight_Mcount_count_cy_1_Q : X_MUX2
    port map (
      IB => u_knight_Mcount_count_cy(0),
      IA => N0,
      SEL => u_knight_Mcount_count_cy_1_rt_41,
      O => u_knight_Mcount_count_cy(1)
    );
  u_knight_Mcount_count_xor_0_Q : X_XOR2
    port map (
      I0 => N0,
      I1 => u_knight_Mcount_count_lut(0),
      O => u_knight_Result(0)
    );
  u_knight_Mcount_count_cy_0_Q : X_MUX2
    port map (
      IB => N0,
      IA => N1,
      SEL => u_knight_Mcount_count_lut(0),
      O => u_knight_Mcount_count_cy(0)
    );
  u_knight_count_7 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_Result(7),
      SRST => sw_0_IBUF_35,
      O => u_knight_count(7),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_count_6 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_Result(6),
      SRST => sw_0_IBUF_35,
      O => u_knight_count(6),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_count_5 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_Result(5),
      SRST => sw_0_IBUF_35,
      O => u_knight_count(5),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_count_4 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_Result(4),
      SRST => sw_0_IBUF_35,
      O => u_knight_count(4),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_count_3 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_Result(3),
      SRST => sw_0_IBUF_35,
      O => u_knight_count(3),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_count_2 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_Result(2),
      SRST => sw_0_IBUF_35,
      O => u_knight_count(2),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_count_1 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_Result(1),
      SRST => sw_0_IBUF_35,
      O => u_knight_count(1),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_count_0 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_Result(0),
      SRST => sw_0_IBUF_35,
      O => u_knight_count(0),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_dir_0 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => u_knight_dir_0_not0001,
      I => u_knight_dir_0_mux0000,
      SRST => sw_0_IBUF_35,
      O => u_knight_dir(0),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_pattern_7 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_pattern_mux0001(7),
      SRST => sw_0_IBUF_35,
      O => u_knight_pattern(7),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_pattern_6 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_pattern_mux0001(6),
      SRST => sw_0_IBUF_35,
      O => u_knight_pattern(6),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_pattern_5 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_pattern_mux0001(5),
      SRST => sw_0_IBUF_35,
      O => u_knight_pattern(5),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_pattern_4 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_pattern_mux0001(4),
      SRST => sw_0_IBUF_35,
      O => u_knight_pattern(4),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_pattern_3 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_pattern_mux0001(3),
      SRST => sw_0_IBUF_35,
      O => u_knight_pattern(3),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_pattern_2 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_pattern_mux0001(2),
      SRST => sw_0_IBUF_35,
      O => u_knight_pattern(2),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_pattern_1 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_pattern_mux0001(1),
      SRST => sw_0_IBUF_35,
      O => u_knight_pattern(1),
      SET => GND,
      RST => GND,
      SSET => GND
    );
  u_knight_pattern_0 : X_SFF
    generic map(
      INIT => '1'
    )
    port map (
      CLK => clk_BUFGP,
      CE => step,
      I => u_knight_pattern_mux0001(0),
      SSET => sw_0_IBUF_35,
      O => u_knight_pattern(0),
      SET => GND,
      RST => GND,
      SRST => GND
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_0_Q : X_LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      ADR0 => u_speed_cnt_s(7),
      ADR1 => u_speed_cnt_s(5),
      ADR2 => u_speed_cnt_s(4),
      ADR3 => u_speed_cnt_s(6),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(0)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_0_Q : X_MUX2
    port map (
      IB => N1,
      IA => N0,
      SEL => u_speed_cnt_s_next_cmp_eq0000_wg_lut(0),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy(0)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_1_Q : X_LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      ADR0 => u_speed_cnt_s(8),
      ADR1 => u_speed_cnt_s(9),
      ADR2 => u_speed_cnt_s(3),
      ADR3 => u_speed_cnt_s(12),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(1)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_Q : X_MUX2
    port map (
      IB => u_speed_cnt_s_next_cmp_eq0000_wg_cy(0),
      IA => N0,
      SEL => u_speed_cnt_s_next_cmp_eq0000_wg_lut(1),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy(1)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_2_Q : X_LUT4
    generic map(
      INIT => X"0010"
    )
    port map (
      ADR0 => u_speed_cnt_s(10),
      ADR1 => u_speed_cnt_s(11),
      ADR2 => u_speed_cnt_s(1),
      ADR3 => u_speed_cnt_s(13),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(2)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_2_Q : X_MUX2
    port map (
      IB => u_speed_cnt_s_next_cmp_eq0000_wg_cy(1),
      IA => N0,
      SEL => u_speed_cnt_s_next_cmp_eq0000_wg_lut(2),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy(2)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_3_Q : X_LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      ADR0 => u_speed_cnt_s(14),
      ADR1 => u_speed_cnt_s(17),
      ADR2 => u_speed_cnt_s(0),
      ADR3 => u_speed_cnt_s(15),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(3)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_Q : X_MUX2
    port map (
      IB => u_speed_cnt_s_next_cmp_eq0000_wg_cy(2),
      IA => N0,
      SEL => u_speed_cnt_s_next_cmp_eq0000_wg_lut(3),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy(3)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_4_Q : X_LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      ADR0 => u_speed_cnt_s(16),
      ADR1 => u_speed_cnt_s(18),
      ADR2 => u_speed_cnt_s(2),
      ADR3 => u_speed_cnt_s(19),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(4)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_4_Q : X_MUX2
    port map (
      IB => u_speed_cnt_s_next_cmp_eq0000_wg_cy(3),
      IA => N0,
      SEL => u_speed_cnt_s_next_cmp_eq0000_wg_lut(4),
      O => u_speed_cnt_s_next_cmp_eq0000
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_0_Q : X_LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      ADR0 => u_speed_cnt_f(7),
      ADR1 => u_speed_cnt_f(5),
      ADR2 => u_speed_cnt_f(4),
      ADR3 => u_speed_cnt_f(6),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(0)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_0_Q : X_MUX2
    port map (
      IB => N1,
      IA => N0,
      SEL => u_speed_cnt_f_next_cmp_eq0000_wg_lut(0),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy(0)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_1_Q : X_LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      ADR0 => u_speed_cnt_f(8),
      ADR1 => u_speed_cnt_f(9),
      ADR2 => u_speed_cnt_f(3),
      ADR3 => u_speed_cnt_f(12),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(1)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_Q : X_MUX2
    port map (
      IB => u_speed_cnt_f_next_cmp_eq0000_wg_cy(0),
      IA => N0,
      SEL => u_speed_cnt_f_next_cmp_eq0000_wg_lut(1),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy(1)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_2_Q : X_LUT4
    generic map(
      INIT => X"0010"
    )
    port map (
      ADR0 => u_speed_cnt_f(10),
      ADR1 => u_speed_cnt_f(11),
      ADR2 => u_speed_cnt_f(1),
      ADR3 => u_speed_cnt_f(13),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(2)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_2_Q : X_MUX2
    port map (
      IB => u_speed_cnt_f_next_cmp_eq0000_wg_cy(1),
      IA => N0,
      SEL => u_speed_cnt_f_next_cmp_eq0000_wg_lut(2),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy(2)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_3_Q : X_LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      ADR0 => u_speed_cnt_f(14),
      ADR1 => u_speed_cnt_f(17),
      ADR2 => u_speed_cnt_f(0),
      ADR3 => u_speed_cnt_f(15),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(3)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_Q : X_MUX2
    port map (
      IB => u_speed_cnt_f_next_cmp_eq0000_wg_cy(2),
      IA => N0,
      SEL => u_speed_cnt_f_next_cmp_eq0000_wg_lut(3),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy(3)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_4_Q : X_LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      ADR0 => u_speed_cnt_f(16),
      ADR1 => u_speed_cnt_f(18),
      ADR2 => u_speed_cnt_f(2),
      ADR3 => u_speed_cnt_f(19),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(4)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_4_Q : X_MUX2
    port map (
      IB => u_speed_cnt_f_next_cmp_eq0000_wg_cy(3),
      IA => N0,
      SEL => u_speed_cnt_f_next_cmp_eq0000_wg_lut(4),
      O => u_speed_cnt_f_next_cmp_eq0000
    );
  u_knight_pattern_mux0001_7_1 : X_LUT2
    generic map(
      INIT => X"4"
    )
    port map (
      ADR0 => u_knight_dir(0),
      ADR1 => u_knight_pattern(6),
      O => u_knight_pattern_mux0001(7)
    );
  u_knight_pattern_mux0001_0_1 : X_LUT2
    generic map(
      INIT => X"8"
    )
    port map (
      ADR0 => u_knight_dir(0),
      ADR1 => u_knight_pattern(1),
      O => u_knight_pattern_mux0001(0)
    );
  u_speed_Result_1_1 : X_LUT3
    generic map(
      INIT => X"96"
    )
    port map (
      ADR0 => u_speed_level(1),
      ADR1 => u_speed_level(0),
      ADR2 => u_speed_deb_f_357,
      O => u_speed_Result(1)
    );
  u_knight_pattern_mux0001_6_1 : X_LUT3
    generic map(
      INIT => X"E2"
    )
    port map (
      ADR0 => u_knight_pattern(5),
      ADR1 => u_knight_dir(0),
      ADR2 => u_knight_pattern(7),
      O => u_knight_pattern_mux0001(6)
    );
  u_knight_pattern_mux0001_5_1 : X_LUT3
    generic map(
      INIT => X"E2"
    )
    port map (
      ADR0 => u_knight_pattern(4),
      ADR1 => u_knight_dir(0),
      ADR2 => u_knight_pattern(6),
      O => u_knight_pattern_mux0001(5)
    );
  u_knight_pattern_mux0001_4_1 : X_LUT3
    generic map(
      INIT => X"E2"
    )
    port map (
      ADR0 => u_knight_pattern(3),
      ADR1 => u_knight_dir(0),
      ADR2 => u_knight_pattern(5),
      O => u_knight_pattern_mux0001(4)
    );
  u_knight_pattern_mux0001_3_1 : X_LUT3
    generic map(
      INIT => X"E2"
    )
    port map (
      ADR0 => u_knight_pattern(2),
      ADR1 => u_knight_dir(0),
      ADR2 => u_knight_pattern(4),
      O => u_knight_pattern_mux0001(3)
    );
  u_knight_pattern_mux0001_2_1 : X_LUT3
    generic map(
      INIT => X"E2"
    )
    port map (
      ADR0 => u_knight_pattern(1),
      ADR1 => u_knight_dir(0),
      ADR2 => u_knight_pattern(3),
      O => u_knight_pattern_mux0001(2)
    );
  u_knight_pattern_mux0001_1_1 : X_LUT3
    generic map(
      INIT => X"E2"
    )
    port map (
      ADR0 => u_knight_pattern(0),
      ADR1 => u_knight_dir(0),
      ADR2 => u_knight_pattern(2),
      O => u_knight_pattern_mux0001(1)
    );
  u_speed_Result_2_1 : X_LUT4
    generic map(
      INIT => X"B4D2"
    )
    port map (
      ADR0 => u_speed_deb_f_357,
      ADR1 => u_speed_level(0),
      ADR2 => u_speed_level(2),
      ADR3 => u_speed_level(1),
      O => u_speed_Result(2)
    );
  u_pre_tick_or00001 : X_LUT2
    generic map(
      INIT => X"D"
    )
    port map (
      ADR0 => u_pre_cnt(0),
      ADR1 => sw_0_IBUF_35,
      O => u_pre_tick_or0000
    );
  u_pre_cnt_0_or00001 : X_LUT2
    generic map(
      INIT => X"E"
    )
    port map (
      ADR0 => sw_0_IBUF_35,
      ADR1 => u_pre_cnt(0),
      O => u_pre_cnt_0_or0000
    );
  u_speed_level_and0000 : X_LUT4
    generic map(
      INIT => X"0001"
    )
    port map (
      ADR0 => u_speed_level(2),
      ADR1 => u_speed_level(1),
      ADR2 => u_speed_level(0),
      ADR3 => N01,
      O => u_speed_level_and0000_366
    );
  u_speed_state_next_0_mux00001 : X_LUT2
    generic map(
      INIT => X"E"
    )
    port map (
      ADR0 => u_speed_deb_f_357,
      ADR1 => u_speed_deb_s_359,
      O => u_speed_state_next
    );
  step1 : X_LUT2
    generic map(
      INIT => X"4"
    )
    port map (
      ADR0 => sw_2_IBUF_37,
      ADR1 => u_speed_step_reg_374,
      O => step
    );
  u_knight_dir_0_not00011 : X_LUT4
    generic map(
      INIT => X"A820"
    )
    port map (
      ADR0 => step,
      ADR1 => u_knight_dir(0),
      ADR2 => u_knight_pattern(6),
      ADR3 => u_knight_pattern(1),
      O => u_knight_dir_0_not0001
    );
  u_speed_Mcount_level_val1 : X_LUT4
    generic map(
      INIT => X"ABAA"
    )
    port map (
      ADR0 => sw_0_IBUF_35,
      ADR1 => u_speed_level(1),
      ADR2 => u_speed_level(2),
      ADR3 => N2,
      O => u_speed_Mcount_level_val1_188
    );
  u_speed_level_and00011 : X_LUT2
    generic map(
      INIT => X"4"
    )
    port map (
      ADR0 => sw_0_IBUF_35,
      ADR1 => u_speed_N7,
      O => u_speed_level_and0001
    );
  u_speed_Mcount_level_val3 : X_LUT2
    generic map(
      INIT => X"E"
    )
    port map (
      ADR0 => sw_0_IBUF_35,
      ADR1 => N4,
      O => u_speed_Mcount_level_val
    );
  u_speed_step_next1 : X_LUT2
    generic map(
      INIT => X"8"
    )
    port map (
      ADR0 => u_pre_tick_91,
      ADR1 => u_speed_Mcompar_step_next_cmp_ge0000_cy(7),
      O => u_speed_step_next
    );
  u_speed_deb_s_not00011 : X_LUT3
    generic map(
      INIT => X"60"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      O => u_speed_deb_s_not0001
    );
  u_speed_deb_f_not00011 : X_LUT3
    generic map(
      INIT => X"60"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      O => u_speed_deb_f_not0001
    );
  u_speed_Mcount_level_val211 : X_LUT3
    generic map(
      INIT => X"80"
    )
    port map (
      ADR0 => u_speed_level(0),
      ADR1 => u_speed_level(1),
      ADR2 => u_speed_level(2),
      O => u_speed_N9
    );
  u_speed_ticks_or00001 : X_LUT3
    generic map(
      INIT => X"EA"
    )
    port map (
      ADR0 => sw_0_IBUF_35,
      ADR1 => u_pre_tick_91,
      ADR2 => u_speed_Mcompar_step_next_cmp_ge0000_cy(7),
      O => u_speed_ticks_or0000
    );
  btn_1_IBUF : X_BUF
    port map (
      I => btn(1),
      O => btn_1_IBUF_11
    );
  btn_0_IBUF : X_BUF
    port map (
      I => btn(0),
      O => btn_0_IBUF_10
    );
  sw_3_IBUF : X_BUF
    port map (
      I => sw(3),
      O => sw_3_IBUF_38
    );
  sw_2_IBUF : X_BUF
    port map (
      I => sw(2),
      O => sw_2_IBUF_37
    );
  sw_1_IBUF : X_BUF
    port map (
      I => sw(1),
      O => sw_1_IBUF_36
    );
  sw_0_IBUF : X_BUF
    port map (
      I => sw(0),
      O => sw_0_IBUF_35
    );
  u_speed_Mcount_ticks_cy_6_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_ticks(6),
      O => u_speed_Mcount_ticks_cy_6_rt_201,
      ADR1 => GND
    );
  u_speed_Mcount_ticks_cy_5_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_ticks(5),
      O => u_speed_Mcount_ticks_cy_5_rt_199,
      ADR1 => GND
    );
  u_speed_Mcount_ticks_cy_4_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_ticks(4),
      O => u_speed_Mcount_ticks_cy_4_rt_197,
      ADR1 => GND
    );
  u_speed_Mcount_ticks_cy_3_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_ticks(3),
      O => u_speed_Mcount_ticks_cy_3_rt_195,
      ADR1 => GND
    );
  u_speed_Mcount_ticks_cy_2_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_ticks(2),
      O => u_speed_Mcount_ticks_cy_2_rt_193,
      ADR1 => GND
    );
  u_speed_Mcount_ticks_cy_1_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_ticks(1),
      O => u_speed_Mcount_ticks_cy_1_rt_191,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_18_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(18),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_18_rt_111,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_17_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(17),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_17_rt_109,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_16_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(16),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_16_rt_107,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_15_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(15),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_15_rt_105,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_14_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(14),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_14_rt_103,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_13_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(13),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_13_rt_101,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_12_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(12),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_12_rt_99,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_11_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(11),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_11_rt_97,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_10_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(10),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_10_rt_95,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_9_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(9),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_9_rt_129,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_8_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(8),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_8_rt_127,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_7_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(7),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_7_rt_125,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_6_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(6),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_6_rt_123,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_5_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(5),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_5_rt_121,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_4_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(4),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_4_rt_119,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_3_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(3),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_3_rt_117,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_2_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(2),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_2_rt_115,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_cy_1_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(1),
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_1_rt_113,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_18_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(18),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_18_rt_150,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_17_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(17),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_17_rt_148,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_16_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(16),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_16_rt_146,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_15_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(15),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_15_rt_144,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_14_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(14),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_14_rt_142,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_13_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(13),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_13_rt_140,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_12_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(12),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_12_rt_138,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_11_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(11),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_11_rt_136,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_10_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(10),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_10_rt_134,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_9_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(9),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_9_rt_168,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_8_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(8),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_8_rt_166,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_7_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(7),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_7_rt_164,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_6_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(6),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_6_rt_162,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_5_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(5),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_5_rt_160,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_4_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(4),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_4_rt_158,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_3_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(3),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_3_rt_156,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_2_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(2),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_2_rt_154,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_cy_1_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(1),
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_1_rt_152,
      ADR1 => GND
    );
  u_knight_Mcount_count_cy_6_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_knight_count(6),
      O => u_knight_Mcount_count_cy_6_rt_51,
      ADR1 => GND
    );
  u_knight_Mcount_count_cy_5_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_knight_count(5),
      O => u_knight_Mcount_count_cy_5_rt_49,
      ADR1 => GND
    );
  u_knight_Mcount_count_cy_4_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_knight_count(4),
      O => u_knight_Mcount_count_cy_4_rt_47,
      ADR1 => GND
    );
  u_knight_Mcount_count_cy_3_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_knight_count(3),
      O => u_knight_Mcount_count_cy_3_rt_45,
      ADR1 => GND
    );
  u_knight_Mcount_count_cy_2_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_knight_count(2),
      O => u_knight_Mcount_count_cy_2_rt_43,
      ADR1 => GND
    );
  u_knight_Mcount_count_cy_1_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_knight_count(1),
      O => u_knight_Mcount_count_cy_1_rt_41,
      ADR1 => GND
    );
  u_speed_Mcount_ticks_xor_7_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_ticks(7),
      O => u_speed_Mcount_ticks_xor_7_rt_203,
      ADR1 => GND
    );
  u_speed_Madd_cnt_f_next_addsub0000_xor_19_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_f(19),
      O => u_speed_Madd_cnt_f_next_addsub0000_xor_19_rt_131,
      ADR1 => GND
    );
  u_speed_Madd_cnt_s_next_addsub0000_xor_19_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_speed_cnt_s(19),
      O => u_speed_Madd_cnt_s_next_addsub0000_xor_19_rt_170,
      ADR1 => GND
    );
  u_knight_Mcount_count_xor_7_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => u_knight_count(7),
      O => u_knight_Mcount_count_xor_7_rt_53,
      ADR1 => GND
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_0_Q : X_LUT4
    generic map(
      INIT => X"AAA9"
    )
    port map (
      ADR0 => u_speed_ticks(0),
      ADR1 => u_speed_level(0),
      ADR2 => u_speed_level(1),
      ADR3 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(0)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_2_Q : X_LUT4
    generic map(
      INIT => X"A9A5"
    )
    port map (
      ADR0 => u_speed_ticks(2),
      ADR1 => u_speed_level(0),
      ADR2 => u_speed_level(2),
      ADR3 => u_speed_level(1),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(2)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_4_Q : X_LUT4
    generic map(
      INIT => X"A955"
    )
    port map (
      ADR0 => u_speed_ticks(4),
      ADR1 => u_speed_level(0),
      ADR2 => u_speed_level(1),
      ADR3 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(4)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_1_Q : X_LUT3
    generic map(
      INIT => X"A9"
    )
    port map (
      ADR0 => u_speed_ticks(1),
      ADR1 => u_speed_level(1),
      ADR2 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(1)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_5_Q : X_LUT3
    generic map(
      INIT => X"95"
    )
    port map (
      ADR0 => u_speed_ticks(5),
      ADR1 => u_speed_level(2),
      ADR2 => u_speed_level(1),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(5)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_6_Q : X_LUT4
    generic map(
      INIT => X"9555"
    )
    port map (
      ADR0 => u_speed_ticks(6),
      ADR1 => u_speed_level(0),
      ADR2 => u_speed_level(1),
      ADR3 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(6)
    );
  u_speed_cnt_s_next_0_1 : X_LUT4
    generic map(
      INIT => X"0220"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_addsub0000(0),
      ADR1 => u_speed_cnt_s_next_cmp_eq0000,
      ADR2 => u_speed_deb_s_359,
      ADR3 => u_speed_slower_sync_370,
      O => u_speed_cnt_s_next(0)
    );
  u_speed_cnt_f_next_0_1 : X_LUT4
    generic map(
      INIT => X"0220"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_addsub0000(0),
      ADR1 => u_speed_cnt_f_next_cmp_eq0000,
      ADR2 => u_speed_deb_f_357,
      ADR3 => u_speed_faster_sync_362,
      O => u_speed_cnt_f_next(0)
    );
  u_speed_cnt_s_next_1_1 : X_LUT4
    generic map(
      INIT => X"0220"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_addsub0000(1),
      ADR1 => u_speed_cnt_s_next_cmp_eq0000,
      ADR2 => u_speed_deb_s_359,
      ADR3 => u_speed_slower_sync_370,
      O => u_speed_cnt_s_next(1)
    );
  u_speed_cnt_f_next_1_1 : X_LUT4
    generic map(
      INIT => X"0220"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_addsub0000(1),
      ADR1 => u_speed_cnt_f_next_cmp_eq0000,
      ADR2 => u_speed_deb_f_357,
      ADR3 => u_speed_faster_sync_362,
      O => u_speed_cnt_f_next(1)
    );
  u_speed_cnt_s_next_2_1 : X_LUT4
    generic map(
      INIT => X"0220"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_addsub0000(2),
      ADR1 => u_speed_cnt_s_next_cmp_eq0000,
      ADR2 => u_speed_deb_s_359,
      ADR3 => u_speed_slower_sync_370,
      O => u_speed_cnt_s_next(2)
    );
  u_speed_cnt_f_next_2_1 : X_LUT4
    generic map(
      INIT => X"0220"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_addsub0000(2),
      ADR1 => u_speed_cnt_f_next_cmp_eq0000,
      ADR2 => u_speed_deb_f_357,
      ADR3 => u_speed_faster_sync_362,
      O => u_speed_cnt_f_next(2)
    );
  u_speed_cnt_s_next_3_1 : X_LUT4
    generic map(
      INIT => X"0060"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_addsub0000(3),
      ADR3 => u_speed_cnt_s_next_cmp_eq0000,
      O => u_speed_cnt_s_next(3)
    );
  u_speed_cnt_f_next_3_1 : X_LUT4
    generic map(
      INIT => X"0060"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_addsub0000(3),
      ADR3 => u_speed_cnt_f_next_cmp_eq0000,
      O => u_speed_cnt_f_next(3)
    );
  u_speed_cnt_s_next_4_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(4),
      O => u_speed_cnt_s_next(4)
    );
  u_speed_cnt_f_next_4_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(4),
      O => u_speed_cnt_f_next(4)
    );
  u_speed_cnt_s_next_5_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(5),
      O => u_speed_cnt_s_next(5)
    );
  u_speed_cnt_f_next_5_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(5),
      O => u_speed_cnt_f_next(5)
    );
  u_speed_cnt_s_next_6_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(6),
      O => u_speed_cnt_s_next(6)
    );
  u_speed_cnt_f_next_6_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(6),
      O => u_speed_cnt_f_next(6)
    );
  u_speed_cnt_s_next_7_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(7),
      O => u_speed_cnt_s_next(7)
    );
  u_speed_cnt_f_next_7_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(7),
      O => u_speed_cnt_f_next(7)
    );
  u_speed_cnt_s_next_8_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(8),
      O => u_speed_cnt_s_next(8)
    );
  u_speed_cnt_f_next_8_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(8),
      O => u_speed_cnt_f_next(8)
    );
  u_speed_cnt_s_next_9_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(9),
      O => u_speed_cnt_s_next(9)
    );
  u_speed_cnt_f_next_9_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(9),
      O => u_speed_cnt_f_next(9)
    );
  u_speed_cnt_s_next_10_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(10),
      O => u_speed_cnt_s_next(10)
    );
  u_speed_cnt_f_next_10_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(10),
      O => u_speed_cnt_f_next(10)
    );
  u_speed_cnt_s_next_11_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(11),
      O => u_speed_cnt_s_next(11)
    );
  u_speed_cnt_f_next_11_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(11),
      O => u_speed_cnt_f_next(11)
    );
  u_speed_cnt_s_next_12_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(12),
      O => u_speed_cnt_s_next(12)
    );
  u_speed_cnt_f_next_12_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(12),
      O => u_speed_cnt_f_next(12)
    );
  u_speed_cnt_s_next_13_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(13),
      O => u_speed_cnt_s_next(13)
    );
  u_speed_cnt_f_next_13_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(13),
      O => u_speed_cnt_f_next(13)
    );
  u_speed_cnt_s_next_14_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(14),
      O => u_speed_cnt_s_next(14)
    );
  u_speed_cnt_f_next_14_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(14),
      O => u_speed_cnt_f_next(14)
    );
  u_speed_cnt_s_next_15_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(15),
      O => u_speed_cnt_s_next(15)
    );
  u_speed_cnt_f_next_15_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(15),
      O => u_speed_cnt_f_next(15)
    );
  u_speed_cnt_s_next_16_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(16),
      O => u_speed_cnt_s_next(16)
    );
  u_speed_cnt_f_next_16_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(16),
      O => u_speed_cnt_f_next(16)
    );
  Mxor_led_Result_7_1 : X_LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      ADR0 => sw_3_IBUF_38,
      ADR1 => sw_1_IBUF_36,
      ADR2 => u_knight_pattern(7),
      ADR3 => u_knight_count(7),
      O => led_7_OBUF_29
    );
  Mxor_led_Result_6_1 : X_LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      ADR0 => sw_3_IBUF_38,
      ADR1 => sw_1_IBUF_36,
      ADR2 => u_knight_pattern(6),
      ADR3 => u_knight_count(6),
      O => led_6_OBUF_28
    );
  Mxor_led_Result_5_1 : X_LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      ADR0 => sw_3_IBUF_38,
      ADR1 => sw_1_IBUF_36,
      ADR2 => u_knight_pattern(5),
      ADR3 => u_knight_count(5),
      O => led_5_OBUF_27
    );
  Mxor_led_Result_4_1 : X_LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      ADR0 => sw_3_IBUF_38,
      ADR1 => sw_1_IBUF_36,
      ADR2 => u_knight_pattern(4),
      ADR3 => u_knight_count(4),
      O => led_4_OBUF_26
    );
  Mxor_led_Result_3_1 : X_LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      ADR0 => sw_3_IBUF_38,
      ADR1 => sw_1_IBUF_36,
      ADR2 => u_knight_pattern(3),
      ADR3 => u_knight_count(3),
      O => led_3_OBUF_25
    );
  Mxor_led_Result_2_1 : X_LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      ADR0 => sw_3_IBUF_38,
      ADR1 => sw_1_IBUF_36,
      ADR2 => u_knight_pattern(2),
      ADR3 => u_knight_count(2),
      O => led_2_OBUF_24
    );
  Mxor_led_Result_1_1 : X_LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      ADR0 => sw_3_IBUF_38,
      ADR1 => sw_1_IBUF_36,
      ADR2 => u_knight_pattern(1),
      ADR3 => u_knight_count(1),
      O => led_1_OBUF_23
    );
  Mxor_led_Result_0_1 : X_LUT4
    generic map(
      INIT => X"569A"
    )
    port map (
      ADR0 => sw_3_IBUF_38,
      ADR1 => sw_1_IBUF_36,
      ADR2 => u_knight_pattern(0),
      ADR3 => u_knight_count(0),
      O => led_0_OBUF_22
    );
  u_speed_level_or00001 : X_LUT4
    generic map(
      INIT => X"F5F4"
    )
    port map (
      ADR0 => u_speed_state_reg(0),
      ADR1 => u_speed_deb_f_357,
      ADR2 => sw_0_IBUF_35,
      ADR3 => u_speed_deb_s_359,
      O => u_speed_level_or0000
    );
  u_speed_cnt_s_next_17_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(17),
      O => u_speed_cnt_s_next(17)
    );
  u_speed_cnt_f_next_17_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(17),
      O => u_speed_cnt_f_next(17)
    );
  u_speed_cnt_s_next_18_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(18),
      O => u_speed_cnt_s_next(18)
    );
  u_speed_cnt_f_next_18_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(18),
      O => u_speed_cnt_f_next(18)
    );
  u_speed_cnt_s_next_19_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_slower_sync_370,
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(19),
      O => u_speed_cnt_s_next(19)
    );
  u_speed_cnt_f_next_19_1 : X_LUT4
    generic map(
      INIT => X"0600"
    )
    port map (
      ADR0 => u_speed_faster_sync_362,
      ADR1 => u_speed_deb_f_357,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(19),
      O => u_speed_cnt_f_next(19)
    );
  u_speed_Mcount_ticks_lut_0_INV_0 : X_INV
    port map (
      I => u_speed_ticks(0),
      O => u_speed_Mcount_ticks_lut(0)
    );
  u_speed_Madd_cnt_f_next_addsub0000_lut_0_INV_0 : X_INV
    port map (
      I => u_speed_cnt_f(0),
      O => u_speed_Madd_cnt_f_next_addsub0000_lut(0)
    );
  u_speed_Madd_cnt_s_next_addsub0000_lut_0_INV_0 : X_INV
    port map (
      I => u_speed_cnt_s(0),
      O => u_speed_Madd_cnt_s_next_addsub0000_lut(0)
    );
  u_knight_Mcount_count_lut_0_INV_0 : X_INV
    port map (
      I => u_knight_count(0),
      O => u_knight_Mcount_count_lut(0)
    );
  u_speed_Result_0_1_INV_0 : X_INV
    port map (
      I => u_speed_level(0),
      O => u_speed_Result(0)
    );
  u_knight_dir_0_mux00001_INV_0 : X_INV
    port map (
      I => u_knight_dir(0),
      O => u_knight_dir_0_mux0000
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_7_1_INV_0 : X_INV
    port map (
      I => u_speed_ticks(7),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(7)
    );
  u_speed_level_and0000_SW0_LUT3_L_BUF : X_BUF
    port map (
      I => u_speed_level_and0000_SW0_O,
      O => N01
    );
  u_speed_level_and0000_SW0 : X_LUT3
    generic map(
      INIT => X"EF"
    )
    port map (
      ADR0 => sw_0_IBUF_35,
      ADR1 => u_speed_state_reg(0),
      ADR2 => u_speed_deb_f_357,
      O => u_speed_level_and0000_SW0_O
    );
  u_speed_Mcount_level_val1_SW0_LUT3_L_BUF : X_BUF
    port map (
      I => u_speed_Mcount_level_val1_SW0_O,
      O => N2
    );
  u_speed_Mcount_level_val1_SW0 : X_LUT3
    generic map(
      INIT => X"10"
    )
    port map (
      ADR0 => u_speed_state_reg(0),
      ADR1 => u_speed_level(0),
      ADR2 => u_speed_deb_f_357,
      O => u_speed_Mcount_level_val1_SW0_O
    );
  u_speed_Mcount_level_val22_LUT4_D_BUF : X_BUF
    port map (
      I => u_speed_N7,
      O => N4
    );
  u_speed_Mcount_level_val22 : X_LUT4
    generic map(
      INIT => X"0400"
    )
    port map (
      ADR0 => u_speed_state_reg(0),
      ADR1 => u_speed_deb_s_359,
      ADR2 => u_speed_deb_f_357,
      ADR3 => u_speed_N9,
      O => u_speed_N7
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
  led_0_OBUF : X_OBUF
    port map (
      I => led_0_OBUF_22,
      O => led(0)
    );
  led_1_OBUF : X_OBUF
    port map (
      I => led_1_OBUF_23,
      O => led(1)
    );
  led_2_OBUF : X_OBUF
    port map (
      I => led_2_OBUF_24,
      O => led(2)
    );
  led_3_OBUF : X_OBUF
    port map (
      I => led_3_OBUF_25,
      O => led(3)
    );
  led_4_OBUF : X_OBUF
    port map (
      I => led_4_OBUF_26,
      O => led(4)
    );
  led_5_OBUF : X_OBUF
    port map (
      I => led_5_OBUF_27,
      O => led(5)
    );
  led_6_OBUF : X_OBUF
    port map (
      I => led_6_OBUF_28,
      O => led(6)
    );
  led_7_OBUF : X_OBUF
    port map (
      I => led_7_OBUF_29,
      O => led(7)
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

