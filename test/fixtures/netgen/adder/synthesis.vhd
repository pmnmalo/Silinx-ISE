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
    eq : out STD_LOGIC;
    sub : in STD_LOGIC := 'X';
    acc_en : in STD_LOGIC := 'X';
    lts : out STD_LOGIC;
    ltu : out STD_LOGIC;
    cin : in STD_LOGIC := 'X';
    s : out STD_LOGIC_VECTOR ( 16 downto 0 );
    acc : out STD_LOGIC_VECTOR ( 11 downto 0 );
    a : in STD_LOGIC_VECTOR ( 15 downto 0 );
    b : in STD_LOGIC_VECTOR ( 15 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal N0 : STD_LOGIC;
  signal N1 : STD_LOGIC;
  signal a_0_IBUF_196 : STD_LOGIC;
  signal a_10_IBUF_197 : STD_LOGIC;
  signal a_11_IBUF_198 : STD_LOGIC;
  signal a_12_IBUF_199 : STD_LOGIC;
  signal a_13_IBUF_200 : STD_LOGIC;
  signal a_14_IBUF_201 : STD_LOGIC;
  signal a_15_IBUF_202 : STD_LOGIC;
  signal a_1_IBUF_203 : STD_LOGIC;
  signal a_2_IBUF_204 : STD_LOGIC;
  signal a_3_IBUF_205 : STD_LOGIC;
  signal a_4_IBUF_206 : STD_LOGIC;
  signal a_5_IBUF_207 : STD_LOGIC;
  signal a_6_IBUF_208 : STD_LOGIC;
  signal a_7_IBUF_209 : STD_LOGIC;
  signal a_8_IBUF_210 : STD_LOGIC;
  signal a_9_IBUF_211 : STD_LOGIC;
  signal acc_0_224 : STD_LOGIC;
  signal acc_1_225 : STD_LOGIC;
  signal acc_10_226 : STD_LOGIC;
  signal acc_11_227 : STD_LOGIC;
  signal acc_2_228 : STD_LOGIC;
  signal acc_3_229 : STD_LOGIC;
  signal acc_4_230 : STD_LOGIC;
  signal acc_5_231 : STD_LOGIC;
  signal acc_6_232 : STD_LOGIC;
  signal acc_7_233 : STD_LOGIC;
  signal acc_8_234 : STD_LOGIC;
  signal acc_9_235 : STD_LOGIC;
  signal acc_en_IBUF_237 : STD_LOGIC;
  signal b_0_IBUF_254 : STD_LOGIC;
  signal b_10_IBUF_255 : STD_LOGIC;
  signal b_11_IBUF_256 : STD_LOGIC;
  signal b_12_IBUF_257 : STD_LOGIC;
  signal b_13_IBUF_258 : STD_LOGIC;
  signal b_14_IBUF_259 : STD_LOGIC;
  signal b_15_IBUF_260 : STD_LOGIC;
  signal b_1_IBUF_261 : STD_LOGIC;
  signal b_2_IBUF_262 : STD_LOGIC;
  signal b_3_IBUF_263 : STD_LOGIC;
  signal b_4_IBUF_264 : STD_LOGIC;
  signal b_5_IBUF_265 : STD_LOGIC;
  signal b_6_IBUF_266 : STD_LOGIC;
  signal b_7_IBUF_267 : STD_LOGIC;
  signal b_8_IBUF_268 : STD_LOGIC;
  signal b_9_IBUF_269 : STD_LOGIC;
  signal cin_IBUF_271 : STD_LOGIC;
  signal clk_BUFGP_273 : STD_LOGIC;
  signal eq_OBUF_275 : STD_LOGIC;
  signal lts_OBUF_277 : STD_LOGIC;
  signal ltu_OBUF_279 : STD_LOGIC;
  signal s_0_297 : STD_LOGIC;
  signal s_1_298 : STD_LOGIC;
  signal s_10_299 : STD_LOGIC;
  signal s_11_300 : STD_LOGIC;
  signal s_12_301 : STD_LOGIC;
  signal s_13_302 : STD_LOGIC;
  signal s_14_303 : STD_LOGIC;
  signal s_15_304 : STD_LOGIC;
  signal s_16_305 : STD_LOGIC;
  signal s_2_306 : STD_LOGIC;
  signal s_3_307 : STD_LOGIC;
  signal s_4_308 : STD_LOGIC;
  signal s_5_309 : STD_LOGIC;
  signal s_6_310 : STD_LOGIC;
  signal s_7_311 : STD_LOGIC;
  signal s_8_312 : STD_LOGIC;
  signal s_9_313 : STD_LOGIC;
  signal sub_IBUF_365 : STD_LOGIC;
  signal Maccum_acc_cy : STD_LOGIC_VECTOR ( 10 downto 0 );
  signal Maccum_acc_lut : STD_LOGIC_VECTOR ( 11 downto 0 );
  signal Madd_s_addsub0001_cy : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal Madd_s_addsub0001_lut : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal Mcompar_eq_cy : STD_LOGIC_VECTOR ( 6 downto 0 );
  signal Mcompar_eq_lut : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal Mcompar_lts_cy : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal Mcompar_lts_lut : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal Mcompar_ltu_cy : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal Mcompar_ltu_lut : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal Msub_s_addsub0000_cy : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal Msub_s_addsub0000_lut : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal Result : STD_LOGIC_VECTOR ( 11 downto 0 );
  signal s_addsub0000 : STD_LOGIC_VECTOR ( 16 downto 0 );
  signal s_addsub0001 : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal s_mux0000 : STD_LOGIC_VECTOR ( 16 downto 0 );
begin
  XST_GND : GND
    port map (
      G => N0
    );
  XST_VCC : VCC
    port map (
      P => N1
    );
  s_0 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(0),
      Q => s_0_297
    );
  s_1 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(1),
      Q => s_1_298
    );
  s_2 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(2),
      Q => s_2_306
    );
  s_3 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(3),
      Q => s_3_307
    );
  s_4 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(4),
      Q => s_4_308
    );
  s_5 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(5),
      Q => s_5_309
    );
  s_6 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(6),
      Q => s_6_310
    );
  s_7 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(7),
      Q => s_7_311
    );
  s_8 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(8),
      Q => s_8_312
    );
  s_9 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(9),
      Q => s_9_313
    );
  s_10 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(10),
      Q => s_10_299
    );
  s_11 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(11),
      Q => s_11_300
    );
  s_12 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(12),
      Q => s_12_301
    );
  s_13 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(13),
      Q => s_13_302
    );
  s_14 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(14),
      Q => s_14_303
    );
  s_15 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(15),
      Q => s_15_304
    );
  s_16 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      D => s_mux0000(16),
      Q => s_16_305
    );
  acc_0 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      CE => acc_en_IBUF_237,
      D => Result(0),
      Q => acc_0_224
    );
  acc_1 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      CE => acc_en_IBUF_237,
      D => Result(1),
      Q => acc_1_225
    );
  acc_2 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      CE => acc_en_IBUF_237,
      D => Result(2),
      Q => acc_2_228
    );
  acc_3 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      CE => acc_en_IBUF_237,
      D => Result(3),
      Q => acc_3_229
    );
  acc_4 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      CE => acc_en_IBUF_237,
      D => Result(4),
      Q => acc_4_230
    );
  acc_5 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      CE => acc_en_IBUF_237,
      D => Result(5),
      Q => acc_5_231
    );
  acc_6 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      CE => acc_en_IBUF_237,
      D => Result(6),
      Q => acc_6_232
    );
  acc_7 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      CE => acc_en_IBUF_237,
      D => Result(7),
      Q => acc_7_233
    );
  acc_8 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      CE => acc_en_IBUF_237,
      D => Result(8),
      Q => acc_8_234
    );
  acc_9 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      CE => acc_en_IBUF_237,
      D => Result(9),
      Q => acc_9_235
    );
  acc_10 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      CE => acc_en_IBUF_237,
      D => Result(10),
      Q => acc_10_226
    );
  acc_11 : FDE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_273,
      CE => acc_en_IBUF_237,
      D => Result(11),
      Q => acc_11_227
    );
  Mcompar_ltu_lut_0_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_0_IBUF_196,
      I1 => b_0_IBUF_254,
      O => Mcompar_ltu_lut(0)
    );
  Mcompar_ltu_cy_0_Q : MUXCY
    port map (
      CI => N1,
      DI => a_0_IBUF_196,
      S => Mcompar_ltu_lut(0),
      O => Mcompar_ltu_cy(0)
    );
  Mcompar_ltu_lut_1_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_1_IBUF_203,
      I1 => b_1_IBUF_261,
      O => Mcompar_ltu_lut(1)
    );
  Mcompar_ltu_cy_1_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(0),
      DI => a_1_IBUF_203,
      S => Mcompar_ltu_lut(1),
      O => Mcompar_ltu_cy(1)
    );
  Mcompar_ltu_lut_2_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_2_IBUF_204,
      I1 => b_2_IBUF_262,
      O => Mcompar_ltu_lut(2)
    );
  Mcompar_ltu_cy_2_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(1),
      DI => a_2_IBUF_204,
      S => Mcompar_ltu_lut(2),
      O => Mcompar_ltu_cy(2)
    );
  Mcompar_ltu_lut_3_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_3_IBUF_205,
      I1 => b_3_IBUF_263,
      O => Mcompar_ltu_lut(3)
    );
  Mcompar_ltu_cy_3_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(2),
      DI => a_3_IBUF_205,
      S => Mcompar_ltu_lut(3),
      O => Mcompar_ltu_cy(3)
    );
  Mcompar_ltu_lut_4_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_4_IBUF_206,
      I1 => b_4_IBUF_264,
      O => Mcompar_ltu_lut(4)
    );
  Mcompar_ltu_cy_4_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(3),
      DI => a_4_IBUF_206,
      S => Mcompar_ltu_lut(4),
      O => Mcompar_ltu_cy(4)
    );
  Mcompar_ltu_lut_5_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_5_IBUF_207,
      I1 => b_5_IBUF_265,
      O => Mcompar_ltu_lut(5)
    );
  Mcompar_ltu_cy_5_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(4),
      DI => a_5_IBUF_207,
      S => Mcompar_ltu_lut(5),
      O => Mcompar_ltu_cy(5)
    );
  Mcompar_ltu_lut_6_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_6_IBUF_208,
      I1 => b_6_IBUF_266,
      O => Mcompar_ltu_lut(6)
    );
  Mcompar_ltu_cy_6_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(5),
      DI => a_6_IBUF_208,
      S => Mcompar_ltu_lut(6),
      O => Mcompar_ltu_cy(6)
    );
  Mcompar_ltu_lut_7_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_7_IBUF_209,
      I1 => b_7_IBUF_267,
      O => Mcompar_ltu_lut(7)
    );
  Mcompar_ltu_cy_7_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(6),
      DI => a_7_IBUF_209,
      S => Mcompar_ltu_lut(7),
      O => Mcompar_ltu_cy(7)
    );
  Mcompar_ltu_lut_8_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_8_IBUF_210,
      I1 => b_8_IBUF_268,
      O => Mcompar_ltu_lut(8)
    );
  Mcompar_ltu_cy_8_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(7),
      DI => a_8_IBUF_210,
      S => Mcompar_ltu_lut(8),
      O => Mcompar_ltu_cy(8)
    );
  Mcompar_ltu_lut_9_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_9_IBUF_211,
      I1 => b_9_IBUF_269,
      O => Mcompar_ltu_lut(9)
    );
  Mcompar_ltu_cy_9_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(8),
      DI => a_9_IBUF_211,
      S => Mcompar_ltu_lut(9),
      O => Mcompar_ltu_cy(9)
    );
  Mcompar_ltu_lut_10_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_10_IBUF_197,
      I1 => b_10_IBUF_255,
      O => Mcompar_ltu_lut(10)
    );
  Mcompar_ltu_cy_10_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(9),
      DI => a_10_IBUF_197,
      S => Mcompar_ltu_lut(10),
      O => Mcompar_ltu_cy(10)
    );
  Mcompar_ltu_lut_11_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_11_IBUF_198,
      I1 => b_11_IBUF_256,
      O => Mcompar_ltu_lut(11)
    );
  Mcompar_ltu_cy_11_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(10),
      DI => a_11_IBUF_198,
      S => Mcompar_ltu_lut(11),
      O => Mcompar_ltu_cy(11)
    );
  Mcompar_ltu_lut_12_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_12_IBUF_199,
      I1 => b_12_IBUF_257,
      O => Mcompar_ltu_lut(12)
    );
  Mcompar_ltu_cy_12_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(11),
      DI => a_12_IBUF_199,
      S => Mcompar_ltu_lut(12),
      O => Mcompar_ltu_cy(12)
    );
  Mcompar_ltu_lut_13_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_13_IBUF_200,
      I1 => b_13_IBUF_258,
      O => Mcompar_ltu_lut(13)
    );
  Mcompar_ltu_cy_13_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(12),
      DI => a_13_IBUF_200,
      S => Mcompar_ltu_lut(13),
      O => Mcompar_ltu_cy(13)
    );
  Mcompar_ltu_lut_14_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_14_IBUF_201,
      I1 => b_14_IBUF_259,
      O => Mcompar_ltu_lut(14)
    );
  Mcompar_ltu_cy_14_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(13),
      DI => a_14_IBUF_201,
      S => Mcompar_ltu_lut(14),
      O => Mcompar_ltu_cy(14)
    );
  Mcompar_ltu_lut_15_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_15_IBUF_202,
      I1 => b_15_IBUF_260,
      O => Mcompar_ltu_lut(15)
    );
  Mcompar_ltu_cy_15_Q : MUXCY
    port map (
      CI => Mcompar_ltu_cy(14),
      DI => a_15_IBUF_202,
      S => Mcompar_ltu_lut(15),
      O => Mcompar_ltu_cy(15)
    );
  Msub_s_addsub0000_lut_0_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_0_IBUF_196,
      I1 => b_0_IBUF_254,
      O => Msub_s_addsub0000_lut(0)
    );
  Msub_s_addsub0000_cy_0_Q : MUXCY
    port map (
      CI => N1,
      DI => a_0_IBUF_196,
      S => Msub_s_addsub0000_lut(0),
      O => Msub_s_addsub0000_cy(0)
    );
  Msub_s_addsub0000_xor_0_Q : XORCY
    port map (
      CI => N1,
      LI => Msub_s_addsub0000_lut(0),
      O => s_addsub0000(0)
    );
  Msub_s_addsub0000_lut_1_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_1_IBUF_203,
      I1 => b_1_IBUF_261,
      O => Msub_s_addsub0000_lut(1)
    );
  Msub_s_addsub0000_cy_1_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(0),
      DI => a_1_IBUF_203,
      S => Msub_s_addsub0000_lut(1),
      O => Msub_s_addsub0000_cy(1)
    );
  Msub_s_addsub0000_xor_1_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(0),
      LI => Msub_s_addsub0000_lut(1),
      O => s_addsub0000(1)
    );
  Msub_s_addsub0000_lut_2_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_2_IBUF_204,
      I1 => b_2_IBUF_262,
      O => Msub_s_addsub0000_lut(2)
    );
  Msub_s_addsub0000_cy_2_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(1),
      DI => a_2_IBUF_204,
      S => Msub_s_addsub0000_lut(2),
      O => Msub_s_addsub0000_cy(2)
    );
  Msub_s_addsub0000_xor_2_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(1),
      LI => Msub_s_addsub0000_lut(2),
      O => s_addsub0000(2)
    );
  Msub_s_addsub0000_lut_3_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_3_IBUF_205,
      I1 => b_3_IBUF_263,
      O => Msub_s_addsub0000_lut(3)
    );
  Msub_s_addsub0000_cy_3_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(2),
      DI => a_3_IBUF_205,
      S => Msub_s_addsub0000_lut(3),
      O => Msub_s_addsub0000_cy(3)
    );
  Msub_s_addsub0000_xor_3_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(2),
      LI => Msub_s_addsub0000_lut(3),
      O => s_addsub0000(3)
    );
  Msub_s_addsub0000_lut_4_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_4_IBUF_206,
      I1 => b_4_IBUF_264,
      O => Msub_s_addsub0000_lut(4)
    );
  Msub_s_addsub0000_cy_4_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(3),
      DI => a_4_IBUF_206,
      S => Msub_s_addsub0000_lut(4),
      O => Msub_s_addsub0000_cy(4)
    );
  Msub_s_addsub0000_xor_4_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(3),
      LI => Msub_s_addsub0000_lut(4),
      O => s_addsub0000(4)
    );
  Msub_s_addsub0000_lut_5_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_5_IBUF_207,
      I1 => b_5_IBUF_265,
      O => Msub_s_addsub0000_lut(5)
    );
  Msub_s_addsub0000_cy_5_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(4),
      DI => a_5_IBUF_207,
      S => Msub_s_addsub0000_lut(5),
      O => Msub_s_addsub0000_cy(5)
    );
  Msub_s_addsub0000_xor_5_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(4),
      LI => Msub_s_addsub0000_lut(5),
      O => s_addsub0000(5)
    );
  Msub_s_addsub0000_lut_6_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_6_IBUF_208,
      I1 => b_6_IBUF_266,
      O => Msub_s_addsub0000_lut(6)
    );
  Msub_s_addsub0000_cy_6_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(5),
      DI => a_6_IBUF_208,
      S => Msub_s_addsub0000_lut(6),
      O => Msub_s_addsub0000_cy(6)
    );
  Msub_s_addsub0000_xor_6_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(5),
      LI => Msub_s_addsub0000_lut(6),
      O => s_addsub0000(6)
    );
  Msub_s_addsub0000_lut_7_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_7_IBUF_209,
      I1 => b_7_IBUF_267,
      O => Msub_s_addsub0000_lut(7)
    );
  Msub_s_addsub0000_cy_7_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(6),
      DI => a_7_IBUF_209,
      S => Msub_s_addsub0000_lut(7),
      O => Msub_s_addsub0000_cy(7)
    );
  Msub_s_addsub0000_xor_7_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(6),
      LI => Msub_s_addsub0000_lut(7),
      O => s_addsub0000(7)
    );
  Msub_s_addsub0000_lut_8_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_8_IBUF_210,
      I1 => b_8_IBUF_268,
      O => Msub_s_addsub0000_lut(8)
    );
  Msub_s_addsub0000_cy_8_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(7),
      DI => a_8_IBUF_210,
      S => Msub_s_addsub0000_lut(8),
      O => Msub_s_addsub0000_cy(8)
    );
  Msub_s_addsub0000_xor_8_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(7),
      LI => Msub_s_addsub0000_lut(8),
      O => s_addsub0000(8)
    );
  Msub_s_addsub0000_lut_9_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_9_IBUF_211,
      I1 => b_9_IBUF_269,
      O => Msub_s_addsub0000_lut(9)
    );
  Msub_s_addsub0000_cy_9_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(8),
      DI => a_9_IBUF_211,
      S => Msub_s_addsub0000_lut(9),
      O => Msub_s_addsub0000_cy(9)
    );
  Msub_s_addsub0000_xor_9_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(8),
      LI => Msub_s_addsub0000_lut(9),
      O => s_addsub0000(9)
    );
  Msub_s_addsub0000_lut_10_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_10_IBUF_197,
      I1 => b_10_IBUF_255,
      O => Msub_s_addsub0000_lut(10)
    );
  Msub_s_addsub0000_cy_10_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(9),
      DI => a_10_IBUF_197,
      S => Msub_s_addsub0000_lut(10),
      O => Msub_s_addsub0000_cy(10)
    );
  Msub_s_addsub0000_xor_10_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(9),
      LI => Msub_s_addsub0000_lut(10),
      O => s_addsub0000(10)
    );
  Msub_s_addsub0000_lut_11_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_11_IBUF_198,
      I1 => b_11_IBUF_256,
      O => Msub_s_addsub0000_lut(11)
    );
  Msub_s_addsub0000_cy_11_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(10),
      DI => a_11_IBUF_198,
      S => Msub_s_addsub0000_lut(11),
      O => Msub_s_addsub0000_cy(11)
    );
  Msub_s_addsub0000_xor_11_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(10),
      LI => Msub_s_addsub0000_lut(11),
      O => s_addsub0000(11)
    );
  Msub_s_addsub0000_lut_12_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_12_IBUF_199,
      I1 => b_12_IBUF_257,
      O => Msub_s_addsub0000_lut(12)
    );
  Msub_s_addsub0000_cy_12_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(11),
      DI => a_12_IBUF_199,
      S => Msub_s_addsub0000_lut(12),
      O => Msub_s_addsub0000_cy(12)
    );
  Msub_s_addsub0000_xor_12_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(11),
      LI => Msub_s_addsub0000_lut(12),
      O => s_addsub0000(12)
    );
  Msub_s_addsub0000_lut_13_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_13_IBUF_200,
      I1 => b_13_IBUF_258,
      O => Msub_s_addsub0000_lut(13)
    );
  Msub_s_addsub0000_cy_13_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(12),
      DI => a_13_IBUF_200,
      S => Msub_s_addsub0000_lut(13),
      O => Msub_s_addsub0000_cy(13)
    );
  Msub_s_addsub0000_xor_13_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(12),
      LI => Msub_s_addsub0000_lut(13),
      O => s_addsub0000(13)
    );
  Msub_s_addsub0000_lut_14_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_14_IBUF_201,
      I1 => b_14_IBUF_259,
      O => Msub_s_addsub0000_lut(14)
    );
  Msub_s_addsub0000_cy_14_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(13),
      DI => a_14_IBUF_201,
      S => Msub_s_addsub0000_lut(14),
      O => Msub_s_addsub0000_cy(14)
    );
  Msub_s_addsub0000_xor_14_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(13),
      LI => Msub_s_addsub0000_lut(14),
      O => s_addsub0000(14)
    );
  Msub_s_addsub0000_lut_15_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_15_IBUF_202,
      I1 => b_15_IBUF_260,
      O => Msub_s_addsub0000_lut(15)
    );
  Msub_s_addsub0000_cy_15_Q : MUXCY
    port map (
      CI => Msub_s_addsub0000_cy(14),
      DI => a_15_IBUF_202,
      S => Msub_s_addsub0000_lut(15),
      O => Msub_s_addsub0000_cy(15)
    );
  Msub_s_addsub0000_xor_15_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(14),
      LI => Msub_s_addsub0000_lut(15),
      O => s_addsub0000(15)
    );
  Msub_s_addsub0000_xor_16_Q : XORCY
    port map (
      CI => Msub_s_addsub0000_cy(15),
      LI => N1,
      O => s_addsub0000(16)
    );
  Madd_s_addsub0001_lut_0_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_0_IBUF_196,
      I1 => b_0_IBUF_254,
      O => Madd_s_addsub0001_lut(0)
    );
  Madd_s_addsub0001_cy_0_Q : MUXCY
    port map (
      CI => cin_IBUF_271,
      DI => a_0_IBUF_196,
      S => Madd_s_addsub0001_lut(0),
      O => Madd_s_addsub0001_cy(0)
    );
  Madd_s_addsub0001_xor_0_Q : XORCY
    port map (
      CI => cin_IBUF_271,
      LI => Madd_s_addsub0001_lut(0),
      O => s_addsub0001(0)
    );
  Madd_s_addsub0001_lut_1_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_1_IBUF_203,
      I1 => b_1_IBUF_261,
      O => Madd_s_addsub0001_lut(1)
    );
  Madd_s_addsub0001_cy_1_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(0),
      DI => a_1_IBUF_203,
      S => Madd_s_addsub0001_lut(1),
      O => Madd_s_addsub0001_cy(1)
    );
  Madd_s_addsub0001_xor_1_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(0),
      LI => Madd_s_addsub0001_lut(1),
      O => s_addsub0001(1)
    );
  Madd_s_addsub0001_lut_2_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_2_IBUF_204,
      I1 => b_2_IBUF_262,
      O => Madd_s_addsub0001_lut(2)
    );
  Madd_s_addsub0001_cy_2_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(1),
      DI => a_2_IBUF_204,
      S => Madd_s_addsub0001_lut(2),
      O => Madd_s_addsub0001_cy(2)
    );
  Madd_s_addsub0001_xor_2_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(1),
      LI => Madd_s_addsub0001_lut(2),
      O => s_addsub0001(2)
    );
  Madd_s_addsub0001_lut_3_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_3_IBUF_205,
      I1 => b_3_IBUF_263,
      O => Madd_s_addsub0001_lut(3)
    );
  Madd_s_addsub0001_cy_3_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(2),
      DI => a_3_IBUF_205,
      S => Madd_s_addsub0001_lut(3),
      O => Madd_s_addsub0001_cy(3)
    );
  Madd_s_addsub0001_xor_3_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(2),
      LI => Madd_s_addsub0001_lut(3),
      O => s_addsub0001(3)
    );
  Madd_s_addsub0001_lut_4_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_4_IBUF_206,
      I1 => b_4_IBUF_264,
      O => Madd_s_addsub0001_lut(4)
    );
  Madd_s_addsub0001_cy_4_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(3),
      DI => a_4_IBUF_206,
      S => Madd_s_addsub0001_lut(4),
      O => Madd_s_addsub0001_cy(4)
    );
  Madd_s_addsub0001_xor_4_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(3),
      LI => Madd_s_addsub0001_lut(4),
      O => s_addsub0001(4)
    );
  Madd_s_addsub0001_lut_5_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_5_IBUF_207,
      I1 => b_5_IBUF_265,
      O => Madd_s_addsub0001_lut(5)
    );
  Madd_s_addsub0001_cy_5_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(4),
      DI => a_5_IBUF_207,
      S => Madd_s_addsub0001_lut(5),
      O => Madd_s_addsub0001_cy(5)
    );
  Madd_s_addsub0001_xor_5_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(4),
      LI => Madd_s_addsub0001_lut(5),
      O => s_addsub0001(5)
    );
  Madd_s_addsub0001_lut_6_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_6_IBUF_208,
      I1 => b_6_IBUF_266,
      O => Madd_s_addsub0001_lut(6)
    );
  Madd_s_addsub0001_cy_6_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(5),
      DI => a_6_IBUF_208,
      S => Madd_s_addsub0001_lut(6),
      O => Madd_s_addsub0001_cy(6)
    );
  Madd_s_addsub0001_xor_6_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(5),
      LI => Madd_s_addsub0001_lut(6),
      O => s_addsub0001(6)
    );
  Madd_s_addsub0001_lut_7_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_7_IBUF_209,
      I1 => b_7_IBUF_267,
      O => Madd_s_addsub0001_lut(7)
    );
  Madd_s_addsub0001_cy_7_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(6),
      DI => a_7_IBUF_209,
      S => Madd_s_addsub0001_lut(7),
      O => Madd_s_addsub0001_cy(7)
    );
  Madd_s_addsub0001_xor_7_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(6),
      LI => Madd_s_addsub0001_lut(7),
      O => s_addsub0001(7)
    );
  Madd_s_addsub0001_lut_8_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_8_IBUF_210,
      I1 => b_8_IBUF_268,
      O => Madd_s_addsub0001_lut(8)
    );
  Madd_s_addsub0001_cy_8_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(7),
      DI => a_8_IBUF_210,
      S => Madd_s_addsub0001_lut(8),
      O => Madd_s_addsub0001_cy(8)
    );
  Madd_s_addsub0001_xor_8_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(7),
      LI => Madd_s_addsub0001_lut(8),
      O => s_addsub0001(8)
    );
  Madd_s_addsub0001_lut_9_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_9_IBUF_211,
      I1 => b_9_IBUF_269,
      O => Madd_s_addsub0001_lut(9)
    );
  Madd_s_addsub0001_cy_9_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(8),
      DI => a_9_IBUF_211,
      S => Madd_s_addsub0001_lut(9),
      O => Madd_s_addsub0001_cy(9)
    );
  Madd_s_addsub0001_xor_9_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(8),
      LI => Madd_s_addsub0001_lut(9),
      O => s_addsub0001(9)
    );
  Madd_s_addsub0001_lut_10_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_10_IBUF_197,
      I1 => b_10_IBUF_255,
      O => Madd_s_addsub0001_lut(10)
    );
  Madd_s_addsub0001_cy_10_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(9),
      DI => a_10_IBUF_197,
      S => Madd_s_addsub0001_lut(10),
      O => Madd_s_addsub0001_cy(10)
    );
  Madd_s_addsub0001_xor_10_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(9),
      LI => Madd_s_addsub0001_lut(10),
      O => s_addsub0001(10)
    );
  Madd_s_addsub0001_lut_11_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_11_IBUF_198,
      I1 => b_11_IBUF_256,
      O => Madd_s_addsub0001_lut(11)
    );
  Madd_s_addsub0001_cy_11_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(10),
      DI => a_11_IBUF_198,
      S => Madd_s_addsub0001_lut(11),
      O => Madd_s_addsub0001_cy(11)
    );
  Madd_s_addsub0001_xor_11_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(10),
      LI => Madd_s_addsub0001_lut(11),
      O => s_addsub0001(11)
    );
  Madd_s_addsub0001_lut_12_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_12_IBUF_199,
      I1 => b_12_IBUF_257,
      O => Madd_s_addsub0001_lut(12)
    );
  Madd_s_addsub0001_cy_12_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(11),
      DI => a_12_IBUF_199,
      S => Madd_s_addsub0001_lut(12),
      O => Madd_s_addsub0001_cy(12)
    );
  Madd_s_addsub0001_xor_12_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(11),
      LI => Madd_s_addsub0001_lut(12),
      O => s_addsub0001(12)
    );
  Madd_s_addsub0001_lut_13_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_13_IBUF_200,
      I1 => b_13_IBUF_258,
      O => Madd_s_addsub0001_lut(13)
    );
  Madd_s_addsub0001_cy_13_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(12),
      DI => a_13_IBUF_200,
      S => Madd_s_addsub0001_lut(13),
      O => Madd_s_addsub0001_cy(13)
    );
  Madd_s_addsub0001_xor_13_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(12),
      LI => Madd_s_addsub0001_lut(13),
      O => s_addsub0001(13)
    );
  Madd_s_addsub0001_lut_14_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_14_IBUF_201,
      I1 => b_14_IBUF_259,
      O => Madd_s_addsub0001_lut(14)
    );
  Madd_s_addsub0001_cy_14_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(13),
      DI => a_14_IBUF_201,
      S => Madd_s_addsub0001_lut(14),
      O => Madd_s_addsub0001_cy(14)
    );
  Madd_s_addsub0001_xor_14_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(13),
      LI => Madd_s_addsub0001_lut(14),
      O => s_addsub0001(14)
    );
  Madd_s_addsub0001_lut_15_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_15_IBUF_202,
      I1 => b_15_IBUF_260,
      O => Madd_s_addsub0001_lut(15)
    );
  Madd_s_addsub0001_cy_15_Q : MUXCY
    port map (
      CI => Madd_s_addsub0001_cy(14),
      DI => a_15_IBUF_202,
      S => Madd_s_addsub0001_lut(15),
      O => Madd_s_addsub0001_cy(15)
    );
  Madd_s_addsub0001_xor_15_Q : XORCY
    port map (
      CI => Madd_s_addsub0001_cy(14),
      LI => Madd_s_addsub0001_lut(15),
      O => s_addsub0001(15)
    );
  Maccum_acc_lut_0_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_0_IBUF_196,
      I1 => acc_0_224,
      O => Maccum_acc_lut(0)
    );
  Maccum_acc_cy_0_Q : MUXCY
    port map (
      CI => N0,
      DI => acc_0_224,
      S => Maccum_acc_lut(0),
      O => Maccum_acc_cy(0)
    );
  Maccum_acc_xor_0_Q : XORCY
    port map (
      CI => N0,
      LI => Maccum_acc_lut(0),
      O => Result(0)
    );
  Maccum_acc_lut_1_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_1_IBUF_203,
      I1 => acc_1_225,
      O => Maccum_acc_lut(1)
    );
  Maccum_acc_cy_1_Q : MUXCY
    port map (
      CI => Maccum_acc_cy(0),
      DI => acc_1_225,
      S => Maccum_acc_lut(1),
      O => Maccum_acc_cy(1)
    );
  Maccum_acc_xor_1_Q : XORCY
    port map (
      CI => Maccum_acc_cy(0),
      LI => Maccum_acc_lut(1),
      O => Result(1)
    );
  Maccum_acc_lut_2_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_2_IBUF_204,
      I1 => acc_2_228,
      O => Maccum_acc_lut(2)
    );
  Maccum_acc_cy_2_Q : MUXCY
    port map (
      CI => Maccum_acc_cy(1),
      DI => acc_2_228,
      S => Maccum_acc_lut(2),
      O => Maccum_acc_cy(2)
    );
  Maccum_acc_xor_2_Q : XORCY
    port map (
      CI => Maccum_acc_cy(1),
      LI => Maccum_acc_lut(2),
      O => Result(2)
    );
  Maccum_acc_lut_3_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_3_IBUF_205,
      I1 => acc_3_229,
      O => Maccum_acc_lut(3)
    );
  Maccum_acc_cy_3_Q : MUXCY
    port map (
      CI => Maccum_acc_cy(2),
      DI => acc_3_229,
      S => Maccum_acc_lut(3),
      O => Maccum_acc_cy(3)
    );
  Maccum_acc_xor_3_Q : XORCY
    port map (
      CI => Maccum_acc_cy(2),
      LI => Maccum_acc_lut(3),
      O => Result(3)
    );
  Maccum_acc_lut_4_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_4_IBUF_206,
      I1 => acc_4_230,
      O => Maccum_acc_lut(4)
    );
  Maccum_acc_cy_4_Q : MUXCY
    port map (
      CI => Maccum_acc_cy(3),
      DI => acc_4_230,
      S => Maccum_acc_lut(4),
      O => Maccum_acc_cy(4)
    );
  Maccum_acc_xor_4_Q : XORCY
    port map (
      CI => Maccum_acc_cy(3),
      LI => Maccum_acc_lut(4),
      O => Result(4)
    );
  Maccum_acc_lut_5_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_5_IBUF_207,
      I1 => acc_5_231,
      O => Maccum_acc_lut(5)
    );
  Maccum_acc_cy_5_Q : MUXCY
    port map (
      CI => Maccum_acc_cy(4),
      DI => acc_5_231,
      S => Maccum_acc_lut(5),
      O => Maccum_acc_cy(5)
    );
  Maccum_acc_xor_5_Q : XORCY
    port map (
      CI => Maccum_acc_cy(4),
      LI => Maccum_acc_lut(5),
      O => Result(5)
    );
  Maccum_acc_lut_6_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_6_IBUF_208,
      I1 => acc_6_232,
      O => Maccum_acc_lut(6)
    );
  Maccum_acc_cy_6_Q : MUXCY
    port map (
      CI => Maccum_acc_cy(5),
      DI => acc_6_232,
      S => Maccum_acc_lut(6),
      O => Maccum_acc_cy(6)
    );
  Maccum_acc_xor_6_Q : XORCY
    port map (
      CI => Maccum_acc_cy(5),
      LI => Maccum_acc_lut(6),
      O => Result(6)
    );
  Maccum_acc_lut_7_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_7_IBUF_209,
      I1 => acc_7_233,
      O => Maccum_acc_lut(7)
    );
  Maccum_acc_cy_7_Q : MUXCY
    port map (
      CI => Maccum_acc_cy(6),
      DI => acc_7_233,
      S => Maccum_acc_lut(7),
      O => Maccum_acc_cy(7)
    );
  Maccum_acc_xor_7_Q : XORCY
    port map (
      CI => Maccum_acc_cy(6),
      LI => Maccum_acc_lut(7),
      O => Result(7)
    );
  Maccum_acc_lut_8_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_8_IBUF_210,
      I1 => acc_8_234,
      O => Maccum_acc_lut(8)
    );
  Maccum_acc_cy_8_Q : MUXCY
    port map (
      CI => Maccum_acc_cy(7),
      DI => acc_8_234,
      S => Maccum_acc_lut(8),
      O => Maccum_acc_cy(8)
    );
  Maccum_acc_xor_8_Q : XORCY
    port map (
      CI => Maccum_acc_cy(7),
      LI => Maccum_acc_lut(8),
      O => Result(8)
    );
  Maccum_acc_lut_9_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_9_IBUF_211,
      I1 => acc_9_235,
      O => Maccum_acc_lut(9)
    );
  Maccum_acc_cy_9_Q : MUXCY
    port map (
      CI => Maccum_acc_cy(8),
      DI => acc_9_235,
      S => Maccum_acc_lut(9),
      O => Maccum_acc_cy(9)
    );
  Maccum_acc_xor_9_Q : XORCY
    port map (
      CI => Maccum_acc_cy(8),
      LI => Maccum_acc_lut(9),
      O => Result(9)
    );
  Maccum_acc_lut_10_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => a_10_IBUF_197,
      I1 => acc_10_226,
      O => Maccum_acc_lut(10)
    );
  Maccum_acc_cy_10_Q : MUXCY
    port map (
      CI => Maccum_acc_cy(9),
      DI => acc_10_226,
      S => Maccum_acc_lut(10),
      O => Maccum_acc_cy(10)
    );
  Maccum_acc_xor_10_Q : XORCY
    port map (
      CI => Maccum_acc_cy(9),
      LI => Maccum_acc_lut(10),
      O => Result(10)
    );
  Maccum_acc_lut_11_Q : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => acc_11_227,
      I1 => a_11_IBUF_198,
      O => Maccum_acc_lut(11)
    );
  Maccum_acc_xor_11_Q : XORCY
    port map (
      CI => Maccum_acc_cy(10),
      LI => Maccum_acc_lut(11),
      O => Result(11)
    );
  Mcompar_lts_lut_0_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_0_IBUF_196,
      I1 => b_0_IBUF_254,
      O => Mcompar_lts_lut(0)
    );
  Mcompar_lts_cy_0_Q : MUXCY
    port map (
      CI => N1,
      DI => a_0_IBUF_196,
      S => Mcompar_lts_lut(0),
      O => Mcompar_lts_cy(0)
    );
  Mcompar_lts_lut_1_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_1_IBUF_203,
      I1 => b_1_IBUF_261,
      O => Mcompar_lts_lut(1)
    );
  Mcompar_lts_cy_1_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(0),
      DI => a_1_IBUF_203,
      S => Mcompar_lts_lut(1),
      O => Mcompar_lts_cy(1)
    );
  Mcompar_lts_lut_2_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_2_IBUF_204,
      I1 => b_2_IBUF_262,
      O => Mcompar_lts_lut(2)
    );
  Mcompar_lts_cy_2_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(1),
      DI => a_2_IBUF_204,
      S => Mcompar_lts_lut(2),
      O => Mcompar_lts_cy(2)
    );
  Mcompar_lts_lut_3_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_3_IBUF_205,
      I1 => b_3_IBUF_263,
      O => Mcompar_lts_lut(3)
    );
  Mcompar_lts_cy_3_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(2),
      DI => a_3_IBUF_205,
      S => Mcompar_lts_lut(3),
      O => Mcompar_lts_cy(3)
    );
  Mcompar_lts_lut_4_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_4_IBUF_206,
      I1 => b_4_IBUF_264,
      O => Mcompar_lts_lut(4)
    );
  Mcompar_lts_cy_4_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(3),
      DI => a_4_IBUF_206,
      S => Mcompar_lts_lut(4),
      O => Mcompar_lts_cy(4)
    );
  Mcompar_lts_lut_5_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_5_IBUF_207,
      I1 => b_5_IBUF_265,
      O => Mcompar_lts_lut(5)
    );
  Mcompar_lts_cy_5_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(4),
      DI => a_5_IBUF_207,
      S => Mcompar_lts_lut(5),
      O => Mcompar_lts_cy(5)
    );
  Mcompar_lts_lut_6_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_6_IBUF_208,
      I1 => b_6_IBUF_266,
      O => Mcompar_lts_lut(6)
    );
  Mcompar_lts_cy_6_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(5),
      DI => a_6_IBUF_208,
      S => Mcompar_lts_lut(6),
      O => Mcompar_lts_cy(6)
    );
  Mcompar_lts_lut_7_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_7_IBUF_209,
      I1 => b_7_IBUF_267,
      O => Mcompar_lts_lut(7)
    );
  Mcompar_lts_cy_7_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(6),
      DI => a_7_IBUF_209,
      S => Mcompar_lts_lut(7),
      O => Mcompar_lts_cy(7)
    );
  Mcompar_lts_lut_8_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_8_IBUF_210,
      I1 => b_8_IBUF_268,
      O => Mcompar_lts_lut(8)
    );
  Mcompar_lts_cy_8_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(7),
      DI => a_8_IBUF_210,
      S => Mcompar_lts_lut(8),
      O => Mcompar_lts_cy(8)
    );
  Mcompar_lts_lut_9_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_9_IBUF_211,
      I1 => b_9_IBUF_269,
      O => Mcompar_lts_lut(9)
    );
  Mcompar_lts_cy_9_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(8),
      DI => a_9_IBUF_211,
      S => Mcompar_lts_lut(9),
      O => Mcompar_lts_cy(9)
    );
  Mcompar_lts_lut_10_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_10_IBUF_197,
      I1 => b_10_IBUF_255,
      O => Mcompar_lts_lut(10)
    );
  Mcompar_lts_cy_10_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(9),
      DI => a_10_IBUF_197,
      S => Mcompar_lts_lut(10),
      O => Mcompar_lts_cy(10)
    );
  Mcompar_lts_lut_11_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_11_IBUF_198,
      I1 => b_11_IBUF_256,
      O => Mcompar_lts_lut(11)
    );
  Mcompar_lts_cy_11_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(10),
      DI => a_11_IBUF_198,
      S => Mcompar_lts_lut(11),
      O => Mcompar_lts_cy(11)
    );
  Mcompar_lts_lut_12_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_12_IBUF_199,
      I1 => b_12_IBUF_257,
      O => Mcompar_lts_lut(12)
    );
  Mcompar_lts_cy_12_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(11),
      DI => a_12_IBUF_199,
      S => Mcompar_lts_lut(12),
      O => Mcompar_lts_cy(12)
    );
  Mcompar_lts_lut_13_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_13_IBUF_200,
      I1 => b_13_IBUF_258,
      O => Mcompar_lts_lut(13)
    );
  Mcompar_lts_cy_13_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(12),
      DI => a_13_IBUF_200,
      S => Mcompar_lts_lut(13),
      O => Mcompar_lts_cy(13)
    );
  Mcompar_lts_lut_14_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_14_IBUF_201,
      I1 => b_14_IBUF_259,
      O => Mcompar_lts_lut(14)
    );
  Mcompar_lts_cy_14_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(13),
      DI => a_14_IBUF_201,
      S => Mcompar_lts_lut(14),
      O => Mcompar_lts_cy(14)
    );
  Mcompar_lts_lut_15_Q : LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      I0 => a_15_IBUF_202,
      I1 => b_15_IBUF_260,
      O => Mcompar_lts_lut(15)
    );
  Mcompar_lts_cy_15_Q : MUXCY
    port map (
      CI => Mcompar_lts_cy(14),
      DI => b_15_IBUF_260,
      S => Mcompar_lts_lut(15),
      O => Mcompar_lts_cy(15)
    );
  Mcompar_eq_lut_0_Q : LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      I0 => a_0_IBUF_196,
      I1 => b_0_IBUF_254,
      I2 => a_1_IBUF_203,
      I3 => b_1_IBUF_261,
      O => Mcompar_eq_lut(0)
    );
  Mcompar_eq_cy_0_Q : MUXCY
    port map (
      CI => N1,
      DI => N0,
      S => Mcompar_eq_lut(0),
      O => Mcompar_eq_cy(0)
    );
  Mcompar_eq_lut_1_Q : LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      I0 => a_2_IBUF_204,
      I1 => b_2_IBUF_262,
      I2 => a_3_IBUF_205,
      I3 => b_3_IBUF_263,
      O => Mcompar_eq_lut(1)
    );
  Mcompar_eq_cy_1_Q : MUXCY
    port map (
      CI => Mcompar_eq_cy(0),
      DI => N0,
      S => Mcompar_eq_lut(1),
      O => Mcompar_eq_cy(1)
    );
  Mcompar_eq_lut_2_Q : LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      I0 => a_4_IBUF_206,
      I1 => b_4_IBUF_264,
      I2 => a_5_IBUF_207,
      I3 => b_5_IBUF_265,
      O => Mcompar_eq_lut(2)
    );
  Mcompar_eq_cy_2_Q : MUXCY
    port map (
      CI => Mcompar_eq_cy(1),
      DI => N0,
      S => Mcompar_eq_lut(2),
      O => Mcompar_eq_cy(2)
    );
  Mcompar_eq_lut_3_Q : LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      I0 => a_6_IBUF_208,
      I1 => b_6_IBUF_266,
      I2 => a_7_IBUF_209,
      I3 => b_7_IBUF_267,
      O => Mcompar_eq_lut(3)
    );
  Mcompar_eq_cy_3_Q : MUXCY
    port map (
      CI => Mcompar_eq_cy(2),
      DI => N0,
      S => Mcompar_eq_lut(3),
      O => Mcompar_eq_cy(3)
    );
  Mcompar_eq_lut_4_Q : LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      I0 => a_8_IBUF_210,
      I1 => b_8_IBUF_268,
      I2 => a_9_IBUF_211,
      I3 => b_9_IBUF_269,
      O => Mcompar_eq_lut(4)
    );
  Mcompar_eq_cy_4_Q : MUXCY
    port map (
      CI => Mcompar_eq_cy(3),
      DI => N0,
      S => Mcompar_eq_lut(4),
      O => Mcompar_eq_cy(4)
    );
  Mcompar_eq_lut_5_Q : LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      I0 => a_10_IBUF_197,
      I1 => b_10_IBUF_255,
      I2 => a_11_IBUF_198,
      I3 => b_11_IBUF_256,
      O => Mcompar_eq_lut(5)
    );
  Mcompar_eq_cy_5_Q : MUXCY
    port map (
      CI => Mcompar_eq_cy(4),
      DI => N0,
      S => Mcompar_eq_lut(5),
      O => Mcompar_eq_cy(5)
    );
  Mcompar_eq_lut_6_Q : LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      I0 => a_12_IBUF_199,
      I1 => b_12_IBUF_257,
      I2 => a_13_IBUF_200,
      I3 => b_13_IBUF_258,
      O => Mcompar_eq_lut(6)
    );
  Mcompar_eq_cy_6_Q : MUXCY
    port map (
      CI => Mcompar_eq_cy(5),
      DI => N0,
      S => Mcompar_eq_lut(6),
      O => Mcompar_eq_cy(6)
    );
  Mcompar_eq_lut_7_Q : LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      I0 => a_14_IBUF_201,
      I1 => b_14_IBUF_259,
      I2 => a_15_IBUF_202,
      I3 => b_15_IBUF_260,
      O => Mcompar_eq_lut(7)
    );
  Mcompar_eq_cy_7_Q : MUXCY
    port map (
      CI => Mcompar_eq_cy(6),
      DI => N0,
      S => Mcompar_eq_lut(7),
      O => eq_OBUF_275
    );
  s_mux0000_0_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(0),
      I2 => s_addsub0000(0),
      O => s_mux0000(0)
    );
  s_mux0000_1_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(1),
      I2 => s_addsub0000(1),
      O => s_mux0000(1)
    );
  s_mux0000_2_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(2),
      I2 => s_addsub0000(2),
      O => s_mux0000(2)
    );
  s_mux0000_3_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(3),
      I2 => s_addsub0000(3),
      O => s_mux0000(3)
    );
  s_mux0000_4_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(4),
      I2 => s_addsub0000(4),
      O => s_mux0000(4)
    );
  s_mux0000_5_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(5),
      I2 => s_addsub0000(5),
      O => s_mux0000(5)
    );
  s_mux0000_6_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(6),
      I2 => s_addsub0000(6),
      O => s_mux0000(6)
    );
  s_mux0000_7_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(7),
      I2 => s_addsub0000(7),
      O => s_mux0000(7)
    );
  s_mux0000_8_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(8),
      I2 => s_addsub0000(8),
      O => s_mux0000(8)
    );
  s_mux0000_9_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(9),
      I2 => s_addsub0000(9),
      O => s_mux0000(9)
    );
  s_mux0000_10_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(10),
      I2 => s_addsub0000(10),
      O => s_mux0000(10)
    );
  s_mux0000_11_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(11),
      I2 => s_addsub0000(11),
      O => s_mux0000(11)
    );
  s_mux0000_12_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(12),
      I2 => s_addsub0000(12),
      O => s_mux0000(12)
    );
  s_mux0000_13_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(13),
      I2 => s_addsub0000(13),
      O => s_mux0000(13)
    );
  s_mux0000_14_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(14),
      I2 => s_addsub0000(14),
      O => s_mux0000(14)
    );
  s_mux0000_15_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => s_addsub0001(15),
      I2 => s_addsub0000(15),
      O => s_mux0000(15)
    );
  s_mux0000_16_1 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => sub_IBUF_365,
      I1 => Madd_s_addsub0001_cy(15),
      I2 => s_addsub0000(16),
      O => s_mux0000(16)
    );
  sub_IBUF : IBUF
    port map (
      I => sub,
      O => sub_IBUF_365
    );
  acc_en_IBUF : IBUF
    port map (
      I => acc_en,
      O => acc_en_IBUF_237
    );
  cin_IBUF : IBUF
    port map (
      I => cin,
      O => cin_IBUF_271
    );
  a_15_IBUF : IBUF
    port map (
      I => a(15),
      O => a_15_IBUF_202
    );
  a_14_IBUF : IBUF
    port map (
      I => a(14),
      O => a_14_IBUF_201
    );
  a_13_IBUF : IBUF
    port map (
      I => a(13),
      O => a_13_IBUF_200
    );
  a_12_IBUF : IBUF
    port map (
      I => a(12),
      O => a_12_IBUF_199
    );
  a_11_IBUF : IBUF
    port map (
      I => a(11),
      O => a_11_IBUF_198
    );
  a_10_IBUF : IBUF
    port map (
      I => a(10),
      O => a_10_IBUF_197
    );
  a_9_IBUF : IBUF
    port map (
      I => a(9),
      O => a_9_IBUF_211
    );
  a_8_IBUF : IBUF
    port map (
      I => a(8),
      O => a_8_IBUF_210
    );
  a_7_IBUF : IBUF
    port map (
      I => a(7),
      O => a_7_IBUF_209
    );
  a_6_IBUF : IBUF
    port map (
      I => a(6),
      O => a_6_IBUF_208
    );
  a_5_IBUF : IBUF
    port map (
      I => a(5),
      O => a_5_IBUF_207
    );
  a_4_IBUF : IBUF
    port map (
      I => a(4),
      O => a_4_IBUF_206
    );
  a_3_IBUF : IBUF
    port map (
      I => a(3),
      O => a_3_IBUF_205
    );
  a_2_IBUF : IBUF
    port map (
      I => a(2),
      O => a_2_IBUF_204
    );
  a_1_IBUF : IBUF
    port map (
      I => a(1),
      O => a_1_IBUF_203
    );
  a_0_IBUF : IBUF
    port map (
      I => a(0),
      O => a_0_IBUF_196
    );
  b_15_IBUF : IBUF
    port map (
      I => b(15),
      O => b_15_IBUF_260
    );
  b_14_IBUF : IBUF
    port map (
      I => b(14),
      O => b_14_IBUF_259
    );
  b_13_IBUF : IBUF
    port map (
      I => b(13),
      O => b_13_IBUF_258
    );
  b_12_IBUF : IBUF
    port map (
      I => b(12),
      O => b_12_IBUF_257
    );
  b_11_IBUF : IBUF
    port map (
      I => b(11),
      O => b_11_IBUF_256
    );
  b_10_IBUF : IBUF
    port map (
      I => b(10),
      O => b_10_IBUF_255
    );
  b_9_IBUF : IBUF
    port map (
      I => b(9),
      O => b_9_IBUF_269
    );
  b_8_IBUF : IBUF
    port map (
      I => b(8),
      O => b_8_IBUF_268
    );
  b_7_IBUF : IBUF
    port map (
      I => b(7),
      O => b_7_IBUF_267
    );
  b_6_IBUF : IBUF
    port map (
      I => b(6),
      O => b_6_IBUF_266
    );
  b_5_IBUF : IBUF
    port map (
      I => b(5),
      O => b_5_IBUF_265
    );
  b_4_IBUF : IBUF
    port map (
      I => b(4),
      O => b_4_IBUF_264
    );
  b_3_IBUF : IBUF
    port map (
      I => b(3),
      O => b_3_IBUF_263
    );
  b_2_IBUF : IBUF
    port map (
      I => b(2),
      O => b_2_IBUF_262
    );
  b_1_IBUF : IBUF
    port map (
      I => b(1),
      O => b_1_IBUF_261
    );
  b_0_IBUF : IBUF
    port map (
      I => b(0),
      O => b_0_IBUF_254
    );
  eq_OBUF : OBUF
    port map (
      I => eq_OBUF_275,
      O => eq
    );
  lts_OBUF : OBUF
    port map (
      I => lts_OBUF_277,
      O => lts
    );
  ltu_OBUF : OBUF
    port map (
      I => ltu_OBUF_279,
      O => ltu
    );
  s_16_OBUF : OBUF
    port map (
      I => s_16_305,
      O => s(16)
    );
  s_15_OBUF : OBUF
    port map (
      I => s_15_304,
      O => s(15)
    );
  s_14_OBUF : OBUF
    port map (
      I => s_14_303,
      O => s(14)
    );
  s_13_OBUF : OBUF
    port map (
      I => s_13_302,
      O => s(13)
    );
  s_12_OBUF : OBUF
    port map (
      I => s_12_301,
      O => s(12)
    );
  s_11_OBUF : OBUF
    port map (
      I => s_11_300,
      O => s(11)
    );
  s_10_OBUF : OBUF
    port map (
      I => s_10_299,
      O => s(10)
    );
  s_9_OBUF : OBUF
    port map (
      I => s_9_313,
      O => s(9)
    );
  s_8_OBUF : OBUF
    port map (
      I => s_8_312,
      O => s(8)
    );
  s_7_OBUF : OBUF
    port map (
      I => s_7_311,
      O => s(7)
    );
  s_6_OBUF : OBUF
    port map (
      I => s_6_310,
      O => s(6)
    );
  s_5_OBUF : OBUF
    port map (
      I => s_5_309,
      O => s(5)
    );
  s_4_OBUF : OBUF
    port map (
      I => s_4_308,
      O => s(4)
    );
  s_3_OBUF : OBUF
    port map (
      I => s_3_307,
      O => s(3)
    );
  s_2_OBUF : OBUF
    port map (
      I => s_2_306,
      O => s(2)
    );
  s_1_OBUF : OBUF
    port map (
      I => s_1_298,
      O => s(1)
    );
  s_0_OBUF : OBUF
    port map (
      I => s_0_297,
      O => s(0)
    );
  acc_11_OBUF : OBUF
    port map (
      I => acc_11_227,
      O => acc(11)
    );
  acc_10_OBUF : OBUF
    port map (
      I => acc_10_226,
      O => acc(10)
    );
  acc_9_OBUF : OBUF
    port map (
      I => acc_9_235,
      O => acc(9)
    );
  acc_8_OBUF : OBUF
    port map (
      I => acc_8_234,
      O => acc(8)
    );
  acc_7_OBUF : OBUF
    port map (
      I => acc_7_233,
      O => acc(7)
    );
  acc_6_OBUF : OBUF
    port map (
      I => acc_6_232,
      O => acc(6)
    );
  acc_5_OBUF : OBUF
    port map (
      I => acc_5_231,
      O => acc(5)
    );
  acc_4_OBUF : OBUF
    port map (
      I => acc_4_230,
      O => acc(4)
    );
  acc_3_OBUF : OBUF
    port map (
      I => acc_3_229,
      O => acc(3)
    );
  acc_2_OBUF : OBUF
    port map (
      I => acc_2_228,
      O => acc(2)
    );
  acc_1_OBUF : OBUF
    port map (
      I => acc_1_225,
      O => acc(1)
    );
  acc_0_OBUF : OBUF
    port map (
      I => acc_0_224,
      O => acc(0)
    );
  clk_BUFGP : BUFGP
    port map (
      I => clk,
      O => clk_BUFGP_273
    );
  Mcompar_ltu_cy_15_inv_INV_0 : INV
    port map (
      I => Mcompar_ltu_cy(15),
      O => ltu_OBUF_279
    );
  Mcompar_lts_cy_15_inv_INV_0 : INV
    port map (
      I => Mcompar_lts_cy(15),
      O => lts_OBUF_277
    );

end STRUCTURE;

