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
  signal a_0_IBUF_199 : STD_LOGIC;
  signal a_10_IBUF_200 : STD_LOGIC;
  signal a_11_IBUF_201 : STD_LOGIC;
  signal a_12_IBUF_202 : STD_LOGIC;
  signal a_13_IBUF_203 : STD_LOGIC;
  signal a_14_IBUF_204 : STD_LOGIC;
  signal a_15_IBUF_205 : STD_LOGIC;
  signal a_1_IBUF_206 : STD_LOGIC;
  signal a_2_IBUF_207 : STD_LOGIC;
  signal a_3_IBUF_208 : STD_LOGIC;
  signal a_4_IBUF_209 : STD_LOGIC;
  signal a_5_IBUF_210 : STD_LOGIC;
  signal a_6_IBUF_211 : STD_LOGIC;
  signal a_7_IBUF_212 : STD_LOGIC;
  signal a_8_IBUF_213 : STD_LOGIC;
  signal a_9_IBUF_214 : STD_LOGIC;
  signal acc_0_227 : STD_LOGIC;
  signal acc_1_228 : STD_LOGIC;
  signal acc_10_229 : STD_LOGIC;
  signal acc_11_230 : STD_LOGIC;
  signal acc_2_231 : STD_LOGIC;
  signal acc_3_232 : STD_LOGIC;
  signal acc_4_233 : STD_LOGIC;
  signal acc_5_234 : STD_LOGIC;
  signal acc_6_235 : STD_LOGIC;
  signal acc_7_236 : STD_LOGIC;
  signal acc_8_237 : STD_LOGIC;
  signal acc_9_238 : STD_LOGIC;
  signal acc_en_IBUF_240 : STD_LOGIC;
  signal b_0_IBUF_257 : STD_LOGIC;
  signal b_10_IBUF_258 : STD_LOGIC;
  signal b_11_IBUF_259 : STD_LOGIC;
  signal b_12_IBUF_260 : STD_LOGIC;
  signal b_13_IBUF_261 : STD_LOGIC;
  signal b_14_IBUF_262 : STD_LOGIC;
  signal b_15_IBUF_263 : STD_LOGIC;
  signal b_1_IBUF_264 : STD_LOGIC;
  signal b_2_IBUF_265 : STD_LOGIC;
  signal b_3_IBUF_266 : STD_LOGIC;
  signal b_4_IBUF_267 : STD_LOGIC;
  signal b_5_IBUF_268 : STD_LOGIC;
  signal b_6_IBUF_269 : STD_LOGIC;
  signal b_7_IBUF_270 : STD_LOGIC;
  signal b_8_IBUF_271 : STD_LOGIC;
  signal b_9_IBUF_272 : STD_LOGIC;
  signal cin_IBUF_274 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal eq_OBUF_278 : STD_LOGIC;
  signal lts_OBUF_280 : STD_LOGIC;
  signal ltu_OBUF_282 : STD_LOGIC;
  signal s_0_300 : STD_LOGIC;
  signal s_1_301 : STD_LOGIC;
  signal s_10_302 : STD_LOGIC;
  signal s_11_303 : STD_LOGIC;
  signal s_12_304 : STD_LOGIC;
  signal s_13_305 : STD_LOGIC;
  signal s_14_306 : STD_LOGIC;
  signal s_15_307 : STD_LOGIC;
  signal s_16_308 : STD_LOGIC;
  signal s_2_309 : STD_LOGIC;
  signal s_3_310 : STD_LOGIC;
  signal s_4_311 : STD_LOGIC;
  signal s_5_312 : STD_LOGIC;
  signal s_6_313 : STD_LOGIC;
  signal s_7_314 : STD_LOGIC;
  signal s_8_315 : STD_LOGIC;
  signal s_9_316 : STD_LOGIC;
  signal sub_IBUF_368 : STD_LOGIC;
  signal clk_BUFGP_IBUFG_2 : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
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
  XST_GND : X_ZERO
    port map (
      O => N0
    );
  XST_VCC : X_ONE
    port map (
      O => N1
    );
  s_0 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(0),
      O => s_0_300,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(1),
      O => s_1_301,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_2 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(2),
      O => s_2_309,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_3 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(3),
      O => s_3_310,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_4 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(4),
      O => s_4_311,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_5 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(5),
      O => s_5_312,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_6 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(6),
      O => s_6_313,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(7),
      O => s_7_314,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_8 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(8),
      O => s_8_315,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_9 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(9),
      O => s_9_316,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_10 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(10),
      O => s_10_302,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_11 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(11),
      O => s_11_303,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_12 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(12),
      O => s_12_304,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_13 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(13),
      O => s_13_305,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_14 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(14),
      O => s_14_306,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_15 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(15),
      O => s_15_307,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  s_16 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => s_mux0000(16),
      O => s_16_308,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  acc_0 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => acc_en_IBUF_240,
      I => Result(0),
      O => acc_0_227,
      SET => GND,
      RST => GND
    );
  acc_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => acc_en_IBUF_240,
      I => Result(1),
      O => acc_1_228,
      SET => GND,
      RST => GND
    );
  acc_2 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => acc_en_IBUF_240,
      I => Result(2),
      O => acc_2_231,
      SET => GND,
      RST => GND
    );
  acc_3 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => acc_en_IBUF_240,
      I => Result(3),
      O => acc_3_232,
      SET => GND,
      RST => GND
    );
  acc_4 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => acc_en_IBUF_240,
      I => Result(4),
      O => acc_4_233,
      SET => GND,
      RST => GND
    );
  acc_5 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => acc_en_IBUF_240,
      I => Result(5),
      O => acc_5_234,
      SET => GND,
      RST => GND
    );
  acc_6 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => acc_en_IBUF_240,
      I => Result(6),
      O => acc_6_235,
      SET => GND,
      RST => GND
    );
  acc_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => acc_en_IBUF_240,
      I => Result(7),
      O => acc_7_236,
      SET => GND,
      RST => GND
    );
  acc_8 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => acc_en_IBUF_240,
      I => Result(8),
      O => acc_8_237,
      SET => GND,
      RST => GND
    );
  acc_9 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => acc_en_IBUF_240,
      I => Result(9),
      O => acc_9_238,
      SET => GND,
      RST => GND
    );
  acc_10 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => acc_en_IBUF_240,
      I => Result(10),
      O => acc_10_229,
      SET => GND,
      RST => GND
    );
  acc_11 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => acc_en_IBUF_240,
      I => Result(11),
      O => acc_11_230,
      SET => GND,
      RST => GND
    );
  Mcompar_ltu_lut_0_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_0_IBUF_199,
      ADR1 => b_0_IBUF_257,
      O => Mcompar_ltu_lut(0)
    );
  Mcompar_ltu_cy_0_Q : X_MUX2
    port map (
      IB => N1,
      IA => a_0_IBUF_199,
      SEL => Mcompar_ltu_lut(0),
      O => Mcompar_ltu_cy(0)
    );
  Mcompar_ltu_lut_1_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_1_IBUF_206,
      ADR1 => b_1_IBUF_264,
      O => Mcompar_ltu_lut(1)
    );
  Mcompar_ltu_cy_1_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(0),
      IA => a_1_IBUF_206,
      SEL => Mcompar_ltu_lut(1),
      O => Mcompar_ltu_cy(1)
    );
  Mcompar_ltu_lut_2_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_2_IBUF_207,
      ADR1 => b_2_IBUF_265,
      O => Mcompar_ltu_lut(2)
    );
  Mcompar_ltu_cy_2_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(1),
      IA => a_2_IBUF_207,
      SEL => Mcompar_ltu_lut(2),
      O => Mcompar_ltu_cy(2)
    );
  Mcompar_ltu_lut_3_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_3_IBUF_208,
      ADR1 => b_3_IBUF_266,
      O => Mcompar_ltu_lut(3)
    );
  Mcompar_ltu_cy_3_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(2),
      IA => a_3_IBUF_208,
      SEL => Mcompar_ltu_lut(3),
      O => Mcompar_ltu_cy(3)
    );
  Mcompar_ltu_lut_4_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_4_IBUF_209,
      ADR1 => b_4_IBUF_267,
      O => Mcompar_ltu_lut(4)
    );
  Mcompar_ltu_cy_4_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(3),
      IA => a_4_IBUF_209,
      SEL => Mcompar_ltu_lut(4),
      O => Mcompar_ltu_cy(4)
    );
  Mcompar_ltu_lut_5_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_5_IBUF_210,
      ADR1 => b_5_IBUF_268,
      O => Mcompar_ltu_lut(5)
    );
  Mcompar_ltu_cy_5_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(4),
      IA => a_5_IBUF_210,
      SEL => Mcompar_ltu_lut(5),
      O => Mcompar_ltu_cy(5)
    );
  Mcompar_ltu_lut_6_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_6_IBUF_211,
      ADR1 => b_6_IBUF_269,
      O => Mcompar_ltu_lut(6)
    );
  Mcompar_ltu_cy_6_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(5),
      IA => a_6_IBUF_211,
      SEL => Mcompar_ltu_lut(6),
      O => Mcompar_ltu_cy(6)
    );
  Mcompar_ltu_lut_7_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_7_IBUF_212,
      ADR1 => b_7_IBUF_270,
      O => Mcompar_ltu_lut(7)
    );
  Mcompar_ltu_cy_7_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(6),
      IA => a_7_IBUF_212,
      SEL => Mcompar_ltu_lut(7),
      O => Mcompar_ltu_cy(7)
    );
  Mcompar_ltu_lut_8_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_8_IBUF_213,
      ADR1 => b_8_IBUF_271,
      O => Mcompar_ltu_lut(8)
    );
  Mcompar_ltu_cy_8_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(7),
      IA => a_8_IBUF_213,
      SEL => Mcompar_ltu_lut(8),
      O => Mcompar_ltu_cy(8)
    );
  Mcompar_ltu_lut_9_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_9_IBUF_214,
      ADR1 => b_9_IBUF_272,
      O => Mcompar_ltu_lut(9)
    );
  Mcompar_ltu_cy_9_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(8),
      IA => a_9_IBUF_214,
      SEL => Mcompar_ltu_lut(9),
      O => Mcompar_ltu_cy(9)
    );
  Mcompar_ltu_lut_10_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_10_IBUF_200,
      ADR1 => b_10_IBUF_258,
      O => Mcompar_ltu_lut(10)
    );
  Mcompar_ltu_cy_10_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(9),
      IA => a_10_IBUF_200,
      SEL => Mcompar_ltu_lut(10),
      O => Mcompar_ltu_cy(10)
    );
  Mcompar_ltu_lut_11_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_11_IBUF_201,
      ADR1 => b_11_IBUF_259,
      O => Mcompar_ltu_lut(11)
    );
  Mcompar_ltu_cy_11_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(10),
      IA => a_11_IBUF_201,
      SEL => Mcompar_ltu_lut(11),
      O => Mcompar_ltu_cy(11)
    );
  Mcompar_ltu_lut_12_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_12_IBUF_202,
      ADR1 => b_12_IBUF_260,
      O => Mcompar_ltu_lut(12)
    );
  Mcompar_ltu_cy_12_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(11),
      IA => a_12_IBUF_202,
      SEL => Mcompar_ltu_lut(12),
      O => Mcompar_ltu_cy(12)
    );
  Mcompar_ltu_lut_13_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_13_IBUF_203,
      ADR1 => b_13_IBUF_261,
      O => Mcompar_ltu_lut(13)
    );
  Mcompar_ltu_cy_13_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(12),
      IA => a_13_IBUF_203,
      SEL => Mcompar_ltu_lut(13),
      O => Mcompar_ltu_cy(13)
    );
  Mcompar_ltu_lut_14_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_14_IBUF_204,
      ADR1 => b_14_IBUF_262,
      O => Mcompar_ltu_lut(14)
    );
  Mcompar_ltu_cy_14_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(13),
      IA => a_14_IBUF_204,
      SEL => Mcompar_ltu_lut(14),
      O => Mcompar_ltu_cy(14)
    );
  Mcompar_ltu_lut_15_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_15_IBUF_205,
      ADR1 => b_15_IBUF_263,
      O => Mcompar_ltu_lut(15)
    );
  Mcompar_ltu_cy_15_Q : X_MUX2
    port map (
      IB => Mcompar_ltu_cy(14),
      IA => a_15_IBUF_205,
      SEL => Mcompar_ltu_lut(15),
      O => Mcompar_ltu_cy(15)
    );
  Msub_s_addsub0000_lut_0_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_0_IBUF_199,
      ADR1 => b_0_IBUF_257,
      O => Msub_s_addsub0000_lut(0)
    );
  Msub_s_addsub0000_cy_0_Q : X_MUX2
    port map (
      IB => N1,
      IA => a_0_IBUF_199,
      SEL => Msub_s_addsub0000_lut(0),
      O => Msub_s_addsub0000_cy(0)
    );
  Msub_s_addsub0000_xor_0_Q : X_XOR2
    port map (
      I0 => N1,
      I1 => Msub_s_addsub0000_lut(0),
      O => s_addsub0000(0)
    );
  Msub_s_addsub0000_lut_1_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_1_IBUF_206,
      ADR1 => b_1_IBUF_264,
      O => Msub_s_addsub0000_lut(1)
    );
  Msub_s_addsub0000_cy_1_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(0),
      IA => a_1_IBUF_206,
      SEL => Msub_s_addsub0000_lut(1),
      O => Msub_s_addsub0000_cy(1)
    );
  Msub_s_addsub0000_xor_1_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(0),
      I1 => Msub_s_addsub0000_lut(1),
      O => s_addsub0000(1)
    );
  Msub_s_addsub0000_lut_2_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_2_IBUF_207,
      ADR1 => b_2_IBUF_265,
      O => Msub_s_addsub0000_lut(2)
    );
  Msub_s_addsub0000_cy_2_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(1),
      IA => a_2_IBUF_207,
      SEL => Msub_s_addsub0000_lut(2),
      O => Msub_s_addsub0000_cy(2)
    );
  Msub_s_addsub0000_xor_2_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(1),
      I1 => Msub_s_addsub0000_lut(2),
      O => s_addsub0000(2)
    );
  Msub_s_addsub0000_lut_3_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_3_IBUF_208,
      ADR1 => b_3_IBUF_266,
      O => Msub_s_addsub0000_lut(3)
    );
  Msub_s_addsub0000_cy_3_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(2),
      IA => a_3_IBUF_208,
      SEL => Msub_s_addsub0000_lut(3),
      O => Msub_s_addsub0000_cy(3)
    );
  Msub_s_addsub0000_xor_3_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(2),
      I1 => Msub_s_addsub0000_lut(3),
      O => s_addsub0000(3)
    );
  Msub_s_addsub0000_lut_4_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_4_IBUF_209,
      ADR1 => b_4_IBUF_267,
      O => Msub_s_addsub0000_lut(4)
    );
  Msub_s_addsub0000_cy_4_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(3),
      IA => a_4_IBUF_209,
      SEL => Msub_s_addsub0000_lut(4),
      O => Msub_s_addsub0000_cy(4)
    );
  Msub_s_addsub0000_xor_4_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(3),
      I1 => Msub_s_addsub0000_lut(4),
      O => s_addsub0000(4)
    );
  Msub_s_addsub0000_lut_5_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_5_IBUF_210,
      ADR1 => b_5_IBUF_268,
      O => Msub_s_addsub0000_lut(5)
    );
  Msub_s_addsub0000_cy_5_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(4),
      IA => a_5_IBUF_210,
      SEL => Msub_s_addsub0000_lut(5),
      O => Msub_s_addsub0000_cy(5)
    );
  Msub_s_addsub0000_xor_5_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(4),
      I1 => Msub_s_addsub0000_lut(5),
      O => s_addsub0000(5)
    );
  Msub_s_addsub0000_lut_6_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_6_IBUF_211,
      ADR1 => b_6_IBUF_269,
      O => Msub_s_addsub0000_lut(6)
    );
  Msub_s_addsub0000_cy_6_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(5),
      IA => a_6_IBUF_211,
      SEL => Msub_s_addsub0000_lut(6),
      O => Msub_s_addsub0000_cy(6)
    );
  Msub_s_addsub0000_xor_6_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(5),
      I1 => Msub_s_addsub0000_lut(6),
      O => s_addsub0000(6)
    );
  Msub_s_addsub0000_lut_7_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_7_IBUF_212,
      ADR1 => b_7_IBUF_270,
      O => Msub_s_addsub0000_lut(7)
    );
  Msub_s_addsub0000_cy_7_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(6),
      IA => a_7_IBUF_212,
      SEL => Msub_s_addsub0000_lut(7),
      O => Msub_s_addsub0000_cy(7)
    );
  Msub_s_addsub0000_xor_7_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(6),
      I1 => Msub_s_addsub0000_lut(7),
      O => s_addsub0000(7)
    );
  Msub_s_addsub0000_lut_8_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_8_IBUF_213,
      ADR1 => b_8_IBUF_271,
      O => Msub_s_addsub0000_lut(8)
    );
  Msub_s_addsub0000_cy_8_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(7),
      IA => a_8_IBUF_213,
      SEL => Msub_s_addsub0000_lut(8),
      O => Msub_s_addsub0000_cy(8)
    );
  Msub_s_addsub0000_xor_8_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(7),
      I1 => Msub_s_addsub0000_lut(8),
      O => s_addsub0000(8)
    );
  Msub_s_addsub0000_lut_9_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_9_IBUF_214,
      ADR1 => b_9_IBUF_272,
      O => Msub_s_addsub0000_lut(9)
    );
  Msub_s_addsub0000_cy_9_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(8),
      IA => a_9_IBUF_214,
      SEL => Msub_s_addsub0000_lut(9),
      O => Msub_s_addsub0000_cy(9)
    );
  Msub_s_addsub0000_xor_9_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(8),
      I1 => Msub_s_addsub0000_lut(9),
      O => s_addsub0000(9)
    );
  Msub_s_addsub0000_lut_10_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_10_IBUF_200,
      ADR1 => b_10_IBUF_258,
      O => Msub_s_addsub0000_lut(10)
    );
  Msub_s_addsub0000_cy_10_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(9),
      IA => a_10_IBUF_200,
      SEL => Msub_s_addsub0000_lut(10),
      O => Msub_s_addsub0000_cy(10)
    );
  Msub_s_addsub0000_xor_10_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(9),
      I1 => Msub_s_addsub0000_lut(10),
      O => s_addsub0000(10)
    );
  Msub_s_addsub0000_lut_11_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_11_IBUF_201,
      ADR1 => b_11_IBUF_259,
      O => Msub_s_addsub0000_lut(11)
    );
  Msub_s_addsub0000_cy_11_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(10),
      IA => a_11_IBUF_201,
      SEL => Msub_s_addsub0000_lut(11),
      O => Msub_s_addsub0000_cy(11)
    );
  Msub_s_addsub0000_xor_11_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(10),
      I1 => Msub_s_addsub0000_lut(11),
      O => s_addsub0000(11)
    );
  Msub_s_addsub0000_lut_12_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_12_IBUF_202,
      ADR1 => b_12_IBUF_260,
      O => Msub_s_addsub0000_lut(12)
    );
  Msub_s_addsub0000_cy_12_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(11),
      IA => a_12_IBUF_202,
      SEL => Msub_s_addsub0000_lut(12),
      O => Msub_s_addsub0000_cy(12)
    );
  Msub_s_addsub0000_xor_12_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(11),
      I1 => Msub_s_addsub0000_lut(12),
      O => s_addsub0000(12)
    );
  Msub_s_addsub0000_lut_13_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_13_IBUF_203,
      ADR1 => b_13_IBUF_261,
      O => Msub_s_addsub0000_lut(13)
    );
  Msub_s_addsub0000_cy_13_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(12),
      IA => a_13_IBUF_203,
      SEL => Msub_s_addsub0000_lut(13),
      O => Msub_s_addsub0000_cy(13)
    );
  Msub_s_addsub0000_xor_13_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(12),
      I1 => Msub_s_addsub0000_lut(13),
      O => s_addsub0000(13)
    );
  Msub_s_addsub0000_lut_14_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_14_IBUF_204,
      ADR1 => b_14_IBUF_262,
      O => Msub_s_addsub0000_lut(14)
    );
  Msub_s_addsub0000_cy_14_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(13),
      IA => a_14_IBUF_204,
      SEL => Msub_s_addsub0000_lut(14),
      O => Msub_s_addsub0000_cy(14)
    );
  Msub_s_addsub0000_xor_14_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(13),
      I1 => Msub_s_addsub0000_lut(14),
      O => s_addsub0000(14)
    );
  Msub_s_addsub0000_lut_15_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_15_IBUF_205,
      ADR1 => b_15_IBUF_263,
      O => Msub_s_addsub0000_lut(15)
    );
  Msub_s_addsub0000_cy_15_Q : X_MUX2
    port map (
      IB => Msub_s_addsub0000_cy(14),
      IA => a_15_IBUF_205,
      SEL => Msub_s_addsub0000_lut(15),
      O => Msub_s_addsub0000_cy(15)
    );
  Msub_s_addsub0000_xor_15_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(14),
      I1 => Msub_s_addsub0000_lut(15),
      O => s_addsub0000(15)
    );
  Msub_s_addsub0000_xor_16_Q : X_XOR2
    port map (
      I0 => Msub_s_addsub0000_cy(15),
      I1 => N1,
      O => s_addsub0000(16)
    );
  Madd_s_addsub0001_lut_0_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_0_IBUF_199,
      ADR1 => b_0_IBUF_257,
      O => Madd_s_addsub0001_lut(0)
    );
  Madd_s_addsub0001_cy_0_Q : X_MUX2
    port map (
      IB => cin_IBUF_274,
      IA => a_0_IBUF_199,
      SEL => Madd_s_addsub0001_lut(0),
      O => Madd_s_addsub0001_cy(0)
    );
  Madd_s_addsub0001_xor_0_Q : X_XOR2
    port map (
      I0 => cin_IBUF_274,
      I1 => Madd_s_addsub0001_lut(0),
      O => s_addsub0001(0)
    );
  Madd_s_addsub0001_lut_1_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_1_IBUF_206,
      ADR1 => b_1_IBUF_264,
      O => Madd_s_addsub0001_lut(1)
    );
  Madd_s_addsub0001_cy_1_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(0),
      IA => a_1_IBUF_206,
      SEL => Madd_s_addsub0001_lut(1),
      O => Madd_s_addsub0001_cy(1)
    );
  Madd_s_addsub0001_xor_1_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(0),
      I1 => Madd_s_addsub0001_lut(1),
      O => s_addsub0001(1)
    );
  Madd_s_addsub0001_lut_2_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_2_IBUF_207,
      ADR1 => b_2_IBUF_265,
      O => Madd_s_addsub0001_lut(2)
    );
  Madd_s_addsub0001_cy_2_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(1),
      IA => a_2_IBUF_207,
      SEL => Madd_s_addsub0001_lut(2),
      O => Madd_s_addsub0001_cy(2)
    );
  Madd_s_addsub0001_xor_2_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(1),
      I1 => Madd_s_addsub0001_lut(2),
      O => s_addsub0001(2)
    );
  Madd_s_addsub0001_lut_3_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_3_IBUF_208,
      ADR1 => b_3_IBUF_266,
      O => Madd_s_addsub0001_lut(3)
    );
  Madd_s_addsub0001_cy_3_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(2),
      IA => a_3_IBUF_208,
      SEL => Madd_s_addsub0001_lut(3),
      O => Madd_s_addsub0001_cy(3)
    );
  Madd_s_addsub0001_xor_3_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(2),
      I1 => Madd_s_addsub0001_lut(3),
      O => s_addsub0001(3)
    );
  Madd_s_addsub0001_lut_4_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_4_IBUF_209,
      ADR1 => b_4_IBUF_267,
      O => Madd_s_addsub0001_lut(4)
    );
  Madd_s_addsub0001_cy_4_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(3),
      IA => a_4_IBUF_209,
      SEL => Madd_s_addsub0001_lut(4),
      O => Madd_s_addsub0001_cy(4)
    );
  Madd_s_addsub0001_xor_4_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(3),
      I1 => Madd_s_addsub0001_lut(4),
      O => s_addsub0001(4)
    );
  Madd_s_addsub0001_lut_5_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_5_IBUF_210,
      ADR1 => b_5_IBUF_268,
      O => Madd_s_addsub0001_lut(5)
    );
  Madd_s_addsub0001_cy_5_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(4),
      IA => a_5_IBUF_210,
      SEL => Madd_s_addsub0001_lut(5),
      O => Madd_s_addsub0001_cy(5)
    );
  Madd_s_addsub0001_xor_5_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(4),
      I1 => Madd_s_addsub0001_lut(5),
      O => s_addsub0001(5)
    );
  Madd_s_addsub0001_lut_6_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_6_IBUF_211,
      ADR1 => b_6_IBUF_269,
      O => Madd_s_addsub0001_lut(6)
    );
  Madd_s_addsub0001_cy_6_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(5),
      IA => a_6_IBUF_211,
      SEL => Madd_s_addsub0001_lut(6),
      O => Madd_s_addsub0001_cy(6)
    );
  Madd_s_addsub0001_xor_6_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(5),
      I1 => Madd_s_addsub0001_lut(6),
      O => s_addsub0001(6)
    );
  Madd_s_addsub0001_lut_7_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_7_IBUF_212,
      ADR1 => b_7_IBUF_270,
      O => Madd_s_addsub0001_lut(7)
    );
  Madd_s_addsub0001_cy_7_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(6),
      IA => a_7_IBUF_212,
      SEL => Madd_s_addsub0001_lut(7),
      O => Madd_s_addsub0001_cy(7)
    );
  Madd_s_addsub0001_xor_7_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(6),
      I1 => Madd_s_addsub0001_lut(7),
      O => s_addsub0001(7)
    );
  Madd_s_addsub0001_lut_8_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_8_IBUF_213,
      ADR1 => b_8_IBUF_271,
      O => Madd_s_addsub0001_lut(8)
    );
  Madd_s_addsub0001_cy_8_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(7),
      IA => a_8_IBUF_213,
      SEL => Madd_s_addsub0001_lut(8),
      O => Madd_s_addsub0001_cy(8)
    );
  Madd_s_addsub0001_xor_8_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(7),
      I1 => Madd_s_addsub0001_lut(8),
      O => s_addsub0001(8)
    );
  Madd_s_addsub0001_lut_9_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_9_IBUF_214,
      ADR1 => b_9_IBUF_272,
      O => Madd_s_addsub0001_lut(9)
    );
  Madd_s_addsub0001_cy_9_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(8),
      IA => a_9_IBUF_214,
      SEL => Madd_s_addsub0001_lut(9),
      O => Madd_s_addsub0001_cy(9)
    );
  Madd_s_addsub0001_xor_9_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(8),
      I1 => Madd_s_addsub0001_lut(9),
      O => s_addsub0001(9)
    );
  Madd_s_addsub0001_lut_10_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_10_IBUF_200,
      ADR1 => b_10_IBUF_258,
      O => Madd_s_addsub0001_lut(10)
    );
  Madd_s_addsub0001_cy_10_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(9),
      IA => a_10_IBUF_200,
      SEL => Madd_s_addsub0001_lut(10),
      O => Madd_s_addsub0001_cy(10)
    );
  Madd_s_addsub0001_xor_10_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(9),
      I1 => Madd_s_addsub0001_lut(10),
      O => s_addsub0001(10)
    );
  Madd_s_addsub0001_lut_11_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_11_IBUF_201,
      ADR1 => b_11_IBUF_259,
      O => Madd_s_addsub0001_lut(11)
    );
  Madd_s_addsub0001_cy_11_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(10),
      IA => a_11_IBUF_201,
      SEL => Madd_s_addsub0001_lut(11),
      O => Madd_s_addsub0001_cy(11)
    );
  Madd_s_addsub0001_xor_11_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(10),
      I1 => Madd_s_addsub0001_lut(11),
      O => s_addsub0001(11)
    );
  Madd_s_addsub0001_lut_12_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_12_IBUF_202,
      ADR1 => b_12_IBUF_260,
      O => Madd_s_addsub0001_lut(12)
    );
  Madd_s_addsub0001_cy_12_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(11),
      IA => a_12_IBUF_202,
      SEL => Madd_s_addsub0001_lut(12),
      O => Madd_s_addsub0001_cy(12)
    );
  Madd_s_addsub0001_xor_12_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(11),
      I1 => Madd_s_addsub0001_lut(12),
      O => s_addsub0001(12)
    );
  Madd_s_addsub0001_lut_13_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_13_IBUF_203,
      ADR1 => b_13_IBUF_261,
      O => Madd_s_addsub0001_lut(13)
    );
  Madd_s_addsub0001_cy_13_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(12),
      IA => a_13_IBUF_203,
      SEL => Madd_s_addsub0001_lut(13),
      O => Madd_s_addsub0001_cy(13)
    );
  Madd_s_addsub0001_xor_13_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(12),
      I1 => Madd_s_addsub0001_lut(13),
      O => s_addsub0001(13)
    );
  Madd_s_addsub0001_lut_14_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_14_IBUF_204,
      ADR1 => b_14_IBUF_262,
      O => Madd_s_addsub0001_lut(14)
    );
  Madd_s_addsub0001_cy_14_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(13),
      IA => a_14_IBUF_204,
      SEL => Madd_s_addsub0001_lut(14),
      O => Madd_s_addsub0001_cy(14)
    );
  Madd_s_addsub0001_xor_14_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(13),
      I1 => Madd_s_addsub0001_lut(14),
      O => s_addsub0001(14)
    );
  Madd_s_addsub0001_lut_15_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_15_IBUF_205,
      ADR1 => b_15_IBUF_263,
      O => Madd_s_addsub0001_lut(15)
    );
  Madd_s_addsub0001_cy_15_Q : X_MUX2
    port map (
      IB => Madd_s_addsub0001_cy(14),
      IA => a_15_IBUF_205,
      SEL => Madd_s_addsub0001_lut(15),
      O => Madd_s_addsub0001_cy(15)
    );
  Madd_s_addsub0001_xor_15_Q : X_XOR2
    port map (
      I0 => Madd_s_addsub0001_cy(14),
      I1 => Madd_s_addsub0001_lut(15),
      O => s_addsub0001(15)
    );
  Maccum_acc_lut_0_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_0_IBUF_199,
      ADR1 => acc_0_227,
      O => Maccum_acc_lut(0)
    );
  Maccum_acc_cy_0_Q : X_MUX2
    port map (
      IB => N0,
      IA => acc_0_227,
      SEL => Maccum_acc_lut(0),
      O => Maccum_acc_cy(0)
    );
  Maccum_acc_xor_0_Q : X_XOR2
    port map (
      I0 => N0,
      I1 => Maccum_acc_lut(0),
      O => Result(0)
    );
  Maccum_acc_lut_1_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_1_IBUF_206,
      ADR1 => acc_1_228,
      O => Maccum_acc_lut(1)
    );
  Maccum_acc_cy_1_Q : X_MUX2
    port map (
      IB => Maccum_acc_cy(0),
      IA => acc_1_228,
      SEL => Maccum_acc_lut(1),
      O => Maccum_acc_cy(1)
    );
  Maccum_acc_xor_1_Q : X_XOR2
    port map (
      I0 => Maccum_acc_cy(0),
      I1 => Maccum_acc_lut(1),
      O => Result(1)
    );
  Maccum_acc_lut_2_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_2_IBUF_207,
      ADR1 => acc_2_231,
      O => Maccum_acc_lut(2)
    );
  Maccum_acc_cy_2_Q : X_MUX2
    port map (
      IB => Maccum_acc_cy(1),
      IA => acc_2_231,
      SEL => Maccum_acc_lut(2),
      O => Maccum_acc_cy(2)
    );
  Maccum_acc_xor_2_Q : X_XOR2
    port map (
      I0 => Maccum_acc_cy(1),
      I1 => Maccum_acc_lut(2),
      O => Result(2)
    );
  Maccum_acc_lut_3_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_3_IBUF_208,
      ADR1 => acc_3_232,
      O => Maccum_acc_lut(3)
    );
  Maccum_acc_cy_3_Q : X_MUX2
    port map (
      IB => Maccum_acc_cy(2),
      IA => acc_3_232,
      SEL => Maccum_acc_lut(3),
      O => Maccum_acc_cy(3)
    );
  Maccum_acc_xor_3_Q : X_XOR2
    port map (
      I0 => Maccum_acc_cy(2),
      I1 => Maccum_acc_lut(3),
      O => Result(3)
    );
  Maccum_acc_lut_4_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_4_IBUF_209,
      ADR1 => acc_4_233,
      O => Maccum_acc_lut(4)
    );
  Maccum_acc_cy_4_Q : X_MUX2
    port map (
      IB => Maccum_acc_cy(3),
      IA => acc_4_233,
      SEL => Maccum_acc_lut(4),
      O => Maccum_acc_cy(4)
    );
  Maccum_acc_xor_4_Q : X_XOR2
    port map (
      I0 => Maccum_acc_cy(3),
      I1 => Maccum_acc_lut(4),
      O => Result(4)
    );
  Maccum_acc_lut_5_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_5_IBUF_210,
      ADR1 => acc_5_234,
      O => Maccum_acc_lut(5)
    );
  Maccum_acc_cy_5_Q : X_MUX2
    port map (
      IB => Maccum_acc_cy(4),
      IA => acc_5_234,
      SEL => Maccum_acc_lut(5),
      O => Maccum_acc_cy(5)
    );
  Maccum_acc_xor_5_Q : X_XOR2
    port map (
      I0 => Maccum_acc_cy(4),
      I1 => Maccum_acc_lut(5),
      O => Result(5)
    );
  Maccum_acc_lut_6_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_6_IBUF_211,
      ADR1 => acc_6_235,
      O => Maccum_acc_lut(6)
    );
  Maccum_acc_cy_6_Q : X_MUX2
    port map (
      IB => Maccum_acc_cy(5),
      IA => acc_6_235,
      SEL => Maccum_acc_lut(6),
      O => Maccum_acc_cy(6)
    );
  Maccum_acc_xor_6_Q : X_XOR2
    port map (
      I0 => Maccum_acc_cy(5),
      I1 => Maccum_acc_lut(6),
      O => Result(6)
    );
  Maccum_acc_lut_7_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_7_IBUF_212,
      ADR1 => acc_7_236,
      O => Maccum_acc_lut(7)
    );
  Maccum_acc_cy_7_Q : X_MUX2
    port map (
      IB => Maccum_acc_cy(6),
      IA => acc_7_236,
      SEL => Maccum_acc_lut(7),
      O => Maccum_acc_cy(7)
    );
  Maccum_acc_xor_7_Q : X_XOR2
    port map (
      I0 => Maccum_acc_cy(6),
      I1 => Maccum_acc_lut(7),
      O => Result(7)
    );
  Maccum_acc_lut_8_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_8_IBUF_213,
      ADR1 => acc_8_237,
      O => Maccum_acc_lut(8)
    );
  Maccum_acc_cy_8_Q : X_MUX2
    port map (
      IB => Maccum_acc_cy(7),
      IA => acc_8_237,
      SEL => Maccum_acc_lut(8),
      O => Maccum_acc_cy(8)
    );
  Maccum_acc_xor_8_Q : X_XOR2
    port map (
      I0 => Maccum_acc_cy(7),
      I1 => Maccum_acc_lut(8),
      O => Result(8)
    );
  Maccum_acc_lut_9_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_9_IBUF_214,
      ADR1 => acc_9_238,
      O => Maccum_acc_lut(9)
    );
  Maccum_acc_cy_9_Q : X_MUX2
    port map (
      IB => Maccum_acc_cy(8),
      IA => acc_9_238,
      SEL => Maccum_acc_lut(9),
      O => Maccum_acc_cy(9)
    );
  Maccum_acc_xor_9_Q : X_XOR2
    port map (
      I0 => Maccum_acc_cy(8),
      I1 => Maccum_acc_lut(9),
      O => Result(9)
    );
  Maccum_acc_lut_10_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => a_10_IBUF_200,
      ADR1 => acc_10_229,
      O => Maccum_acc_lut(10)
    );
  Maccum_acc_cy_10_Q : X_MUX2
    port map (
      IB => Maccum_acc_cy(9),
      IA => acc_10_229,
      SEL => Maccum_acc_lut(10),
      O => Maccum_acc_cy(10)
    );
  Maccum_acc_xor_10_Q : X_XOR2
    port map (
      I0 => Maccum_acc_cy(9),
      I1 => Maccum_acc_lut(10),
      O => Result(10)
    );
  Maccum_acc_lut_11_Q : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => acc_11_230,
      ADR1 => a_11_IBUF_201,
      O => Maccum_acc_lut(11)
    );
  Maccum_acc_xor_11_Q : X_XOR2
    port map (
      I0 => Maccum_acc_cy(10),
      I1 => Maccum_acc_lut(11),
      O => Result(11)
    );
  Mcompar_lts_lut_0_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_0_IBUF_199,
      ADR1 => b_0_IBUF_257,
      O => Mcompar_lts_lut(0)
    );
  Mcompar_lts_cy_0_Q : X_MUX2
    port map (
      IB => N1,
      IA => a_0_IBUF_199,
      SEL => Mcompar_lts_lut(0),
      O => Mcompar_lts_cy(0)
    );
  Mcompar_lts_lut_1_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_1_IBUF_206,
      ADR1 => b_1_IBUF_264,
      O => Mcompar_lts_lut(1)
    );
  Mcompar_lts_cy_1_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(0),
      IA => a_1_IBUF_206,
      SEL => Mcompar_lts_lut(1),
      O => Mcompar_lts_cy(1)
    );
  Mcompar_lts_lut_2_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_2_IBUF_207,
      ADR1 => b_2_IBUF_265,
      O => Mcompar_lts_lut(2)
    );
  Mcompar_lts_cy_2_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(1),
      IA => a_2_IBUF_207,
      SEL => Mcompar_lts_lut(2),
      O => Mcompar_lts_cy(2)
    );
  Mcompar_lts_lut_3_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_3_IBUF_208,
      ADR1 => b_3_IBUF_266,
      O => Mcompar_lts_lut(3)
    );
  Mcompar_lts_cy_3_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(2),
      IA => a_3_IBUF_208,
      SEL => Mcompar_lts_lut(3),
      O => Mcompar_lts_cy(3)
    );
  Mcompar_lts_lut_4_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_4_IBUF_209,
      ADR1 => b_4_IBUF_267,
      O => Mcompar_lts_lut(4)
    );
  Mcompar_lts_cy_4_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(3),
      IA => a_4_IBUF_209,
      SEL => Mcompar_lts_lut(4),
      O => Mcompar_lts_cy(4)
    );
  Mcompar_lts_lut_5_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_5_IBUF_210,
      ADR1 => b_5_IBUF_268,
      O => Mcompar_lts_lut(5)
    );
  Mcompar_lts_cy_5_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(4),
      IA => a_5_IBUF_210,
      SEL => Mcompar_lts_lut(5),
      O => Mcompar_lts_cy(5)
    );
  Mcompar_lts_lut_6_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_6_IBUF_211,
      ADR1 => b_6_IBUF_269,
      O => Mcompar_lts_lut(6)
    );
  Mcompar_lts_cy_6_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(5),
      IA => a_6_IBUF_211,
      SEL => Mcompar_lts_lut(6),
      O => Mcompar_lts_cy(6)
    );
  Mcompar_lts_lut_7_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_7_IBUF_212,
      ADR1 => b_7_IBUF_270,
      O => Mcompar_lts_lut(7)
    );
  Mcompar_lts_cy_7_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(6),
      IA => a_7_IBUF_212,
      SEL => Mcompar_lts_lut(7),
      O => Mcompar_lts_cy(7)
    );
  Mcompar_lts_lut_8_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_8_IBUF_213,
      ADR1 => b_8_IBUF_271,
      O => Mcompar_lts_lut(8)
    );
  Mcompar_lts_cy_8_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(7),
      IA => a_8_IBUF_213,
      SEL => Mcompar_lts_lut(8),
      O => Mcompar_lts_cy(8)
    );
  Mcompar_lts_lut_9_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_9_IBUF_214,
      ADR1 => b_9_IBUF_272,
      O => Mcompar_lts_lut(9)
    );
  Mcompar_lts_cy_9_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(8),
      IA => a_9_IBUF_214,
      SEL => Mcompar_lts_lut(9),
      O => Mcompar_lts_cy(9)
    );
  Mcompar_lts_lut_10_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_10_IBUF_200,
      ADR1 => b_10_IBUF_258,
      O => Mcompar_lts_lut(10)
    );
  Mcompar_lts_cy_10_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(9),
      IA => a_10_IBUF_200,
      SEL => Mcompar_lts_lut(10),
      O => Mcompar_lts_cy(10)
    );
  Mcompar_lts_lut_11_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_11_IBUF_201,
      ADR1 => b_11_IBUF_259,
      O => Mcompar_lts_lut(11)
    );
  Mcompar_lts_cy_11_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(10),
      IA => a_11_IBUF_201,
      SEL => Mcompar_lts_lut(11),
      O => Mcompar_lts_cy(11)
    );
  Mcompar_lts_lut_12_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_12_IBUF_202,
      ADR1 => b_12_IBUF_260,
      O => Mcompar_lts_lut(12)
    );
  Mcompar_lts_cy_12_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(11),
      IA => a_12_IBUF_202,
      SEL => Mcompar_lts_lut(12),
      O => Mcompar_lts_cy(12)
    );
  Mcompar_lts_lut_13_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_13_IBUF_203,
      ADR1 => b_13_IBUF_261,
      O => Mcompar_lts_lut(13)
    );
  Mcompar_lts_cy_13_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(12),
      IA => a_13_IBUF_203,
      SEL => Mcompar_lts_lut(13),
      O => Mcompar_lts_cy(13)
    );
  Mcompar_lts_lut_14_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_14_IBUF_204,
      ADR1 => b_14_IBUF_262,
      O => Mcompar_lts_lut(14)
    );
  Mcompar_lts_cy_14_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(13),
      IA => a_14_IBUF_204,
      SEL => Mcompar_lts_lut(14),
      O => Mcompar_lts_cy(14)
    );
  Mcompar_lts_lut_15_Q : X_LUT2
    generic map(
      INIT => X"9"
    )
    port map (
      ADR0 => a_15_IBUF_205,
      ADR1 => b_15_IBUF_263,
      O => Mcompar_lts_lut(15)
    );
  Mcompar_lts_cy_15_Q : X_MUX2
    port map (
      IB => Mcompar_lts_cy(14),
      IA => b_15_IBUF_263,
      SEL => Mcompar_lts_lut(15),
      O => Mcompar_lts_cy(15)
    );
  Mcompar_eq_lut_0_Q : X_LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      ADR0 => a_0_IBUF_199,
      ADR1 => b_0_IBUF_257,
      ADR2 => a_1_IBUF_206,
      ADR3 => b_1_IBUF_264,
      O => Mcompar_eq_lut(0)
    );
  Mcompar_eq_cy_0_Q : X_MUX2
    port map (
      IB => N1,
      IA => N0,
      SEL => Mcompar_eq_lut(0),
      O => Mcompar_eq_cy(0)
    );
  Mcompar_eq_lut_1_Q : X_LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      ADR0 => a_2_IBUF_207,
      ADR1 => b_2_IBUF_265,
      ADR2 => a_3_IBUF_208,
      ADR3 => b_3_IBUF_266,
      O => Mcompar_eq_lut(1)
    );
  Mcompar_eq_cy_1_Q : X_MUX2
    port map (
      IB => Mcompar_eq_cy(0),
      IA => N0,
      SEL => Mcompar_eq_lut(1),
      O => Mcompar_eq_cy(1)
    );
  Mcompar_eq_lut_2_Q : X_LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      ADR0 => a_4_IBUF_209,
      ADR1 => b_4_IBUF_267,
      ADR2 => a_5_IBUF_210,
      ADR3 => b_5_IBUF_268,
      O => Mcompar_eq_lut(2)
    );
  Mcompar_eq_cy_2_Q : X_MUX2
    port map (
      IB => Mcompar_eq_cy(1),
      IA => N0,
      SEL => Mcompar_eq_lut(2),
      O => Mcompar_eq_cy(2)
    );
  Mcompar_eq_lut_3_Q : X_LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      ADR0 => a_6_IBUF_211,
      ADR1 => b_6_IBUF_269,
      ADR2 => a_7_IBUF_212,
      ADR3 => b_7_IBUF_270,
      O => Mcompar_eq_lut(3)
    );
  Mcompar_eq_cy_3_Q : X_MUX2
    port map (
      IB => Mcompar_eq_cy(2),
      IA => N0,
      SEL => Mcompar_eq_lut(3),
      O => Mcompar_eq_cy(3)
    );
  Mcompar_eq_lut_4_Q : X_LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      ADR0 => a_8_IBUF_213,
      ADR1 => b_8_IBUF_271,
      ADR2 => a_9_IBUF_214,
      ADR3 => b_9_IBUF_272,
      O => Mcompar_eq_lut(4)
    );
  Mcompar_eq_cy_4_Q : X_MUX2
    port map (
      IB => Mcompar_eq_cy(3),
      IA => N0,
      SEL => Mcompar_eq_lut(4),
      O => Mcompar_eq_cy(4)
    );
  Mcompar_eq_lut_5_Q : X_LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      ADR0 => a_10_IBUF_200,
      ADR1 => b_10_IBUF_258,
      ADR2 => a_11_IBUF_201,
      ADR3 => b_11_IBUF_259,
      O => Mcompar_eq_lut(5)
    );
  Mcompar_eq_cy_5_Q : X_MUX2
    port map (
      IB => Mcompar_eq_cy(4),
      IA => N0,
      SEL => Mcompar_eq_lut(5),
      O => Mcompar_eq_cy(5)
    );
  Mcompar_eq_lut_6_Q : X_LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      ADR0 => a_12_IBUF_202,
      ADR1 => b_12_IBUF_260,
      ADR2 => a_13_IBUF_203,
      ADR3 => b_13_IBUF_261,
      O => Mcompar_eq_lut(6)
    );
  Mcompar_eq_cy_6_Q : X_MUX2
    port map (
      IB => Mcompar_eq_cy(5),
      IA => N0,
      SEL => Mcompar_eq_lut(6),
      O => Mcompar_eq_cy(6)
    );
  Mcompar_eq_lut_7_Q : X_LUT4
    generic map(
      INIT => X"9009"
    )
    port map (
      ADR0 => a_14_IBUF_204,
      ADR1 => b_14_IBUF_262,
      ADR2 => a_15_IBUF_205,
      ADR3 => b_15_IBUF_263,
      O => Mcompar_eq_lut(7)
    );
  Mcompar_eq_cy_7_Q : X_MUX2
    port map (
      IB => Mcompar_eq_cy(6),
      IA => N0,
      SEL => Mcompar_eq_lut(7),
      O => eq_OBUF_278
    );
  s_mux0000_0_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(0),
      ADR2 => s_addsub0000(0),
      O => s_mux0000(0)
    );
  s_mux0000_1_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(1),
      ADR2 => s_addsub0000(1),
      O => s_mux0000(1)
    );
  s_mux0000_2_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(2),
      ADR2 => s_addsub0000(2),
      O => s_mux0000(2)
    );
  s_mux0000_3_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(3),
      ADR2 => s_addsub0000(3),
      O => s_mux0000(3)
    );
  s_mux0000_4_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(4),
      ADR2 => s_addsub0000(4),
      O => s_mux0000(4)
    );
  s_mux0000_5_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(5),
      ADR2 => s_addsub0000(5),
      O => s_mux0000(5)
    );
  s_mux0000_6_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(6),
      ADR2 => s_addsub0000(6),
      O => s_mux0000(6)
    );
  s_mux0000_7_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(7),
      ADR2 => s_addsub0000(7),
      O => s_mux0000(7)
    );
  s_mux0000_8_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(8),
      ADR2 => s_addsub0000(8),
      O => s_mux0000(8)
    );
  s_mux0000_9_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(9),
      ADR2 => s_addsub0000(9),
      O => s_mux0000(9)
    );
  s_mux0000_10_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(10),
      ADR2 => s_addsub0000(10),
      O => s_mux0000(10)
    );
  s_mux0000_11_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(11),
      ADR2 => s_addsub0000(11),
      O => s_mux0000(11)
    );
  s_mux0000_12_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(12),
      ADR2 => s_addsub0000(12),
      O => s_mux0000(12)
    );
  s_mux0000_13_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(13),
      ADR2 => s_addsub0000(13),
      O => s_mux0000(13)
    );
  s_mux0000_14_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(14),
      ADR2 => s_addsub0000(14),
      O => s_mux0000(14)
    );
  s_mux0000_15_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => s_addsub0001(15),
      ADR2 => s_addsub0000(15),
      O => s_mux0000(15)
    );
  s_mux0000_16_1 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => sub_IBUF_368,
      ADR1 => Madd_s_addsub0001_cy(15),
      ADR2 => s_addsub0000(16),
      O => s_mux0000(16)
    );
  sub_IBUF : X_BUF
    port map (
      I => sub,
      O => sub_IBUF_368
    );
  acc_en_IBUF : X_BUF
    port map (
      I => acc_en,
      O => acc_en_IBUF_240
    );
  cin_IBUF : X_BUF
    port map (
      I => cin,
      O => cin_IBUF_274
    );
  a_15_IBUF : X_BUF
    port map (
      I => a(15),
      O => a_15_IBUF_205
    );
  a_14_IBUF : X_BUF
    port map (
      I => a(14),
      O => a_14_IBUF_204
    );
  a_13_IBUF : X_BUF
    port map (
      I => a(13),
      O => a_13_IBUF_203
    );
  a_12_IBUF : X_BUF
    port map (
      I => a(12),
      O => a_12_IBUF_202
    );
  a_11_IBUF : X_BUF
    port map (
      I => a(11),
      O => a_11_IBUF_201
    );
  a_10_IBUF : X_BUF
    port map (
      I => a(10),
      O => a_10_IBUF_200
    );
  a_9_IBUF : X_BUF
    port map (
      I => a(9),
      O => a_9_IBUF_214
    );
  a_8_IBUF : X_BUF
    port map (
      I => a(8),
      O => a_8_IBUF_213
    );
  a_7_IBUF : X_BUF
    port map (
      I => a(7),
      O => a_7_IBUF_212
    );
  a_6_IBUF : X_BUF
    port map (
      I => a(6),
      O => a_6_IBUF_211
    );
  a_5_IBUF : X_BUF
    port map (
      I => a(5),
      O => a_5_IBUF_210
    );
  a_4_IBUF : X_BUF
    port map (
      I => a(4),
      O => a_4_IBUF_209
    );
  a_3_IBUF : X_BUF
    port map (
      I => a(3),
      O => a_3_IBUF_208
    );
  a_2_IBUF : X_BUF
    port map (
      I => a(2),
      O => a_2_IBUF_207
    );
  a_1_IBUF : X_BUF
    port map (
      I => a(1),
      O => a_1_IBUF_206
    );
  a_0_IBUF : X_BUF
    port map (
      I => a(0),
      O => a_0_IBUF_199
    );
  b_15_IBUF : X_BUF
    port map (
      I => b(15),
      O => b_15_IBUF_263
    );
  b_14_IBUF : X_BUF
    port map (
      I => b(14),
      O => b_14_IBUF_262
    );
  b_13_IBUF : X_BUF
    port map (
      I => b(13),
      O => b_13_IBUF_261
    );
  b_12_IBUF : X_BUF
    port map (
      I => b(12),
      O => b_12_IBUF_260
    );
  b_11_IBUF : X_BUF
    port map (
      I => b(11),
      O => b_11_IBUF_259
    );
  b_10_IBUF : X_BUF
    port map (
      I => b(10),
      O => b_10_IBUF_258
    );
  b_9_IBUF : X_BUF
    port map (
      I => b(9),
      O => b_9_IBUF_272
    );
  b_8_IBUF : X_BUF
    port map (
      I => b(8),
      O => b_8_IBUF_271
    );
  b_7_IBUF : X_BUF
    port map (
      I => b(7),
      O => b_7_IBUF_270
    );
  b_6_IBUF : X_BUF
    port map (
      I => b(6),
      O => b_6_IBUF_269
    );
  b_5_IBUF : X_BUF
    port map (
      I => b(5),
      O => b_5_IBUF_268
    );
  b_4_IBUF : X_BUF
    port map (
      I => b(4),
      O => b_4_IBUF_267
    );
  b_3_IBUF : X_BUF
    port map (
      I => b(3),
      O => b_3_IBUF_266
    );
  b_2_IBUF : X_BUF
    port map (
      I => b(2),
      O => b_2_IBUF_265
    );
  b_1_IBUF : X_BUF
    port map (
      I => b(1),
      O => b_1_IBUF_264
    );
  b_0_IBUF : X_BUF
    port map (
      I => b(0),
      O => b_0_IBUF_257
    );
  Mcompar_ltu_cy_15_inv_INV_0 : X_INV
    port map (
      I => Mcompar_ltu_cy(15),
      O => ltu_OBUF_282
    );
  Mcompar_lts_cy_15_inv_INV_0 : X_INV
    port map (
      I => Mcompar_lts_cy(15),
      O => lts_OBUF_280
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
  acc_0_OBUF : X_OBUF
    port map (
      I => acc_0_227,
      O => acc(0)
    );
  acc_10_OBUF : X_OBUF
    port map (
      I => acc_10_229,
      O => acc(10)
    );
  acc_11_OBUF : X_OBUF
    port map (
      I => acc_11_230,
      O => acc(11)
    );
  acc_1_OBUF : X_OBUF
    port map (
      I => acc_1_228,
      O => acc(1)
    );
  acc_2_OBUF : X_OBUF
    port map (
      I => acc_2_231,
      O => acc(2)
    );
  acc_3_OBUF : X_OBUF
    port map (
      I => acc_3_232,
      O => acc(3)
    );
  acc_4_OBUF : X_OBUF
    port map (
      I => acc_4_233,
      O => acc(4)
    );
  acc_5_OBUF : X_OBUF
    port map (
      I => acc_5_234,
      O => acc(5)
    );
  acc_6_OBUF : X_OBUF
    port map (
      I => acc_6_235,
      O => acc(6)
    );
  acc_7_OBUF : X_OBUF
    port map (
      I => acc_7_236,
      O => acc(7)
    );
  acc_8_OBUF : X_OBUF
    port map (
      I => acc_8_237,
      O => acc(8)
    );
  acc_9_OBUF : X_OBUF
    port map (
      I => acc_9_238,
      O => acc(9)
    );
  eq_OBUF : X_OBUF
    port map (
      I => eq_OBUF_278,
      O => eq
    );
  lts_OBUF : X_OBUF
    port map (
      I => lts_OBUF_280,
      O => lts
    );
  ltu_OBUF : X_OBUF
    port map (
      I => ltu_OBUF_282,
      O => ltu
    );
  s_0_OBUF : X_OBUF
    port map (
      I => s_0_300,
      O => s(0)
    );
  s_10_OBUF : X_OBUF
    port map (
      I => s_10_302,
      O => s(10)
    );
  s_11_OBUF : X_OBUF
    port map (
      I => s_11_303,
      O => s(11)
    );
  s_12_OBUF : X_OBUF
    port map (
      I => s_12_304,
      O => s(12)
    );
  s_13_OBUF : X_OBUF
    port map (
      I => s_13_305,
      O => s(13)
    );
  s_14_OBUF : X_OBUF
    port map (
      I => s_14_306,
      O => s(14)
    );
  s_15_OBUF : X_OBUF
    port map (
      I => s_15_307,
      O => s(15)
    );
  s_16_OBUF : X_OBUF
    port map (
      I => s_16_308,
      O => s(16)
    );
  s_1_OBUF : X_OBUF
    port map (
      I => s_1_301,
      O => s(1)
    );
  s_2_OBUF : X_OBUF
    port map (
      I => s_2_309,
      O => s(2)
    );
  s_3_OBUF : X_OBUF
    port map (
      I => s_3_310,
      O => s(3)
    );
  s_4_OBUF : X_OBUF
    port map (
      I => s_4_311,
      O => s(4)
    );
  s_5_OBUF : X_OBUF
    port map (
      I => s_5_312,
      O => s(5)
    );
  s_6_OBUF : X_OBUF
    port map (
      I => s_6_313,
      O => s(6)
    );
  s_7_OBUF : X_OBUF
    port map (
      I => s_7_314,
      O => s(7)
    );
  s_8_OBUF : X_OBUF
    port map (
      I => s_8_315,
      O => s(8)
    );
  s_9_OBUF : X_OBUF
    port map (
      I => s_9_316,
      O => s(9)
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

