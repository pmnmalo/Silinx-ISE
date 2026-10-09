--------------------------------------------------------------------------------
-- Copyright (c) 1995-2013 Xilinx, Inc.  All rights reserved.
--------------------------------------------------------------------------------
--   ____  ____
--  /   /\/   /
-- /___/  \  /    Vendor: Xilinx
-- \   \   \/     Version: P.20131013
--  \   \         Application: netgen
--  /   /         Filename: top_map.vhd
-- /___/   /\     Timestamp: (removed)
-- \   \  /  \
--  \___\/\___\
--
-- Command	: -intstyle xflow -sim -ofmt vhdl -w -pcf top.pcf top_map.ncd netgen/map/top_map.vhd
-- Device	: 3s250ecp132-4 (PRODUCTION 1.27 2013-10-13)
-- Input file	: top_map.ncd
-- Output file	: netgen/map/top_map.vhd
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
    clka : in STD_LOGIC := 'X';
    clkb : in STD_LOGIC := 'X';
    sel : in STD_LOGIC := 'X';
    ca : out STD_LOGIC_VECTOR ( 7 downto 0 );
    cm : out STD_LOGIC_VECTOR ( 7 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal clkm : STD_LOGIC;
  signal Mcount_nm_cy_1_Q : STD_LOGIC;
  signal Mcount_nm_cy_3_Q : STD_LOGIC;
  signal clka_IBUFG_182 : STD_LOGIC;
  signal sel_IBUF_192 : STD_LOGIC;
  signal Maccum_na_cy_5_11_SW0_O : STD_LOGIC;
  signal nm_0_DXMUX_238 : STD_LOGIC;
  signal nm_0_XORF_236 : STD_LOGIC;
  signal nm_0_LOGIC_ONE_235 : STD_LOGIC;
  signal nm_0_CYINIT_234 : STD_LOGIC;
  signal nm_0_CYSELF_225 : STD_LOGIC;
  signal nm_0_BXINV_223 : STD_LOGIC;
  signal nm_0_DYMUX_219 : STD_LOGIC;
  signal nm_0_XORG_217 : STD_LOGIC;
  signal nm_0_CYMUXG_216 : STD_LOGIC;
  signal Mcount_nm_cy_0_Q : STD_LOGIC;
  signal nm_0_LOGIC_ZERO_214 : STD_LOGIC;
  signal nm_0_CYSELG_205 : STD_LOGIC;
  signal nm_0_G : STD_LOGIC;
  signal nm_0_CLKINV_203 : STD_LOGIC;
  signal nm_2_DXMUX_286 : STD_LOGIC;
  signal nm_2_XORF_284 : STD_LOGIC;
  signal nm_2_CYINIT_283 : STD_LOGIC;
  signal nm_2_F : STD_LOGIC;
  signal nm_2_DYMUX_270 : STD_LOGIC;
  signal nm_2_XORG_268 : STD_LOGIC;
  signal Mcount_nm_cy_2_Q : STD_LOGIC;
  signal nm_2_CYSELF_266 : STD_LOGIC;
  signal nm_2_CYMUXFAST_265 : STD_LOGIC;
  signal nm_2_CYAND_264 : STD_LOGIC;
  signal nm_2_FASTCARRY_263 : STD_LOGIC;
  signal nm_2_CYMUXG2_262 : STD_LOGIC;
  signal nm_2_CYMUXF2_261 : STD_LOGIC;
  signal nm_2_LOGIC_ZERO_260 : STD_LOGIC;
  signal nm_2_CYSELG_251 : STD_LOGIC;
  signal nm_2_G : STD_LOGIC;
  signal nm_2_CLKINV_249 : STD_LOGIC;
  signal nm_4_DXMUX_334 : STD_LOGIC;
  signal nm_4_XORF_332 : STD_LOGIC;
  signal nm_4_CYINIT_331 : STD_LOGIC;
  signal nm_4_F : STD_LOGIC;
  signal nm_4_DYMUX_318 : STD_LOGIC;
  signal nm_4_XORG_316 : STD_LOGIC;
  signal Mcount_nm_cy_4_Q : STD_LOGIC;
  signal nm_4_CYSELF_314 : STD_LOGIC;
  signal nm_4_CYMUXFAST_313 : STD_LOGIC;
  signal nm_4_CYAND_312 : STD_LOGIC;
  signal nm_4_FASTCARRY_311 : STD_LOGIC;
  signal nm_4_CYMUXG2_310 : STD_LOGIC;
  signal nm_4_CYMUXF2_309 : STD_LOGIC;
  signal nm_4_LOGIC_ZERO_308 : STD_LOGIC;
  signal nm_4_CYSELG_299 : STD_LOGIC;
  signal nm_4_G : STD_LOGIC;
  signal nm_4_CLKINV_297 : STD_LOGIC;
  signal nm_6_DXMUX_375 : STD_LOGIC;
  signal nm_6_XORF_373 : STD_LOGIC;
  signal nm_6_LOGIC_ZERO_372 : STD_LOGIC;
  signal nm_6_CYINIT_371 : STD_LOGIC;
  signal nm_6_CYSELF_362 : STD_LOGIC;
  signal nm_6_F : STD_LOGIC;
  signal nm_6_DYMUX_357 : STD_LOGIC;
  signal nm_6_XORG_355 : STD_LOGIC;
  signal Mcount_nm_cy_6_Q : STD_LOGIC;
  signal nm_7_rt_352 : STD_LOGIC;
  signal nm_6_CLKINV_344 : STD_LOGIC;
  signal clka_INBUF : STD_LOGIC;
  signal clkb_INBUF : STD_LOGIC;
  signal cm_0_O : STD_LOGIC;
  signal cm_1_O : STD_LOGIC;
  signal cm_2_O : STD_LOGIC;
  signal ca_0_O : STD_LOGIC;
  signal cm_3_O : STD_LOGIC;
  signal ca_1_O : STD_LOGIC;
  signal cm_4_O : STD_LOGIC;
  signal ca_2_O : STD_LOGIC;
  signal cm_5_O : STD_LOGIC;
  signal ca_3_O : STD_LOGIC;
  signal cm_6_O : STD_LOGIC;
  signal ca_4_O : STD_LOGIC;
  signal cm_7_O : STD_LOGIC;
  signal ca_5_O : STD_LOGIC;
  signal ca_6_O : STD_LOGIC;
  signal ca_7_O : STD_LOGIC;
  signal sel_INBUF : STD_LOGIC;
  signal u_mux_I1_INV : STD_LOGIC;
  signal na_4_DXMUX_557 : STD_LOGIC;
  signal Maccum_na_cy_3_pack_2 : STD_LOGIC;
  signal na_4_CLKINV_540 : STD_LOGIC;
  signal na_7_DXMUX_587 : STD_LOGIC;
  signal Maccum_na_cy_5_11_SW0_O_pack_2 : STD_LOGIC;
  signal na_7_CLKINV_570 : STD_LOGIC;
  signal na_1_DYMUX_605 : STD_LOGIC;
  signal na_1_CLKINV_595 : STD_LOGIC;
  signal na_3_DXMUX_639 : STD_LOGIC;
  signal na_3_DYMUX_628 : STD_LOGIC;
  signal na_3_CLKINV_619 : STD_LOGIC;
  signal na_6_DXMUX_673 : STD_LOGIC;
  signal na_6_DYMUX_662 : STD_LOGIC;
  signal na_6_CLKINV_653 : STD_LOGIC;
  signal na_0_DYMUX_684 : STD_LOGIC;
  signal na_0_BYINV_683 : STD_LOGIC;
  signal na_0_SRINV_682 : STD_LOGIC;
  signal na_0_CLKINV_681 : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal nm : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal na : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal Maccum_na_cy : STD_LOGIC_VECTOR ( 3 downto 3 );
  signal Mcount_nm_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal Result : STD_LOGIC_VECTOR ( 7 downto 1 );
begin
  nm_0_LOGIC_ZERO : X_ZERO
    port map (
      O => nm_0_LOGIC_ZERO_214
    );
  nm_0_LOGIC_ONE : X_ONE
    port map (
      O => nm_0_LOGIC_ONE_235
    );
  nm_0_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_0_XORF_236,
      O => nm_0_DXMUX_238
    );
  nm_0_XORF : X_XOR2
    port map (
      I0 => nm_0_CYINIT_234,
      I1 => Mcount_nm_lut(0),
      O => nm_0_XORF_236
    );
  nm_0_CYMUXF : X_MUX2
    port map (
      IA => nm_0_LOGIC_ONE_235,
      IB => nm_0_CYINIT_234,
      SEL => nm_0_CYSELF_225,
      O => Mcount_nm_cy_0_Q
    );
  nm_0_CYINIT : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_0_BXINV_223,
      O => nm_0_CYINIT_234
    );
  nm_0_CYSELF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_nm_lut(0),
      O => nm_0_CYSELF_225
    );
  nm_0_BXINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => '0',
      O => nm_0_BXINV_223
    );
  nm_0_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_0_XORG_217,
      O => nm_0_DYMUX_219
    );
  nm_0_XORG : X_XOR2
    port map (
      I0 => Mcount_nm_cy_0_Q,
      I1 => nm_0_G,
      O => nm_0_XORG_217
    );
  nm_0_COUTUSED : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_0_CYMUXG_216,
      O => Mcount_nm_cy_1_Q
    );
  nm_0_CYMUXG : X_MUX2
    port map (
      IA => nm_0_LOGIC_ZERO_214,
      IB => Mcount_nm_cy_0_Q,
      SEL => nm_0_CYSELG_205,
      O => nm_0_CYMUXG_216
    );
  nm_0_CYSELG : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_0_G,
      O => nm_0_CYSELG_205
    );
  nm_0_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clkm,
      O => nm_0_CLKINV_203
    );
  nm_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => nm_0_DYMUX_219,
      CE => VCC,
      CLK => nm_0_CLKINV_203,
      SET => GND,
      RST => GND,
      O => nm(1)
    );
  nm_2_LOGIC_ZERO : X_ZERO
    port map (
      O => nm_2_LOGIC_ZERO_260
    );
  nm_2_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_2_XORF_284,
      O => nm_2_DXMUX_286
    );
  nm_2_XORF : X_XOR2
    port map (
      I0 => nm_2_CYINIT_283,
      I1 => nm_2_F,
      O => nm_2_XORF_284
    );
  nm_2_CYMUXF : X_MUX2
    port map (
      IA => nm_2_LOGIC_ZERO_260,
      IB => nm_2_CYINIT_283,
      SEL => nm_2_CYSELF_266,
      O => Mcount_nm_cy_2_Q
    );
  nm_2_CYMUXF2 : X_MUX2
    port map (
      IA => nm_2_LOGIC_ZERO_260,
      IB => nm_2_LOGIC_ZERO_260,
      SEL => nm_2_CYSELF_266,
      O => nm_2_CYMUXF2_261
    );
  nm_2_CYINIT : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_nm_cy_1_Q,
      O => nm_2_CYINIT_283
    );
  nm_2_CYSELF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_2_F,
      O => nm_2_CYSELF_266
    );
  nm_2_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_2_XORG_268,
      O => nm_2_DYMUX_270
    );
  nm_2_XORG : X_XOR2
    port map (
      I0 => Mcount_nm_cy_2_Q,
      I1 => nm_2_G,
      O => nm_2_XORG_268
    );
  nm_2_COUTUSED : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_2_CYMUXFAST_265,
      O => Mcount_nm_cy_3_Q
    );
  nm_2_FASTCARRY : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_nm_cy_1_Q,
      O => nm_2_FASTCARRY_263
    );
  nm_2_CYAND : X_AND2
    port map (
      I0 => nm_2_CYSELG_251,
      I1 => nm_2_CYSELF_266,
      O => nm_2_CYAND_264
    );
  nm_2_CYMUXFAST : X_MUX2
    port map (
      IA => nm_2_CYMUXG2_262,
      IB => nm_2_FASTCARRY_263,
      SEL => nm_2_CYAND_264,
      O => nm_2_CYMUXFAST_265
    );
  nm_2_CYMUXG2 : X_MUX2
    port map (
      IA => nm_2_LOGIC_ZERO_260,
      IB => nm_2_CYMUXF2_261,
      SEL => nm_2_CYSELG_251,
      O => nm_2_CYMUXG2_262
    );
  nm_2_CYSELG : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_2_G,
      O => nm_2_CYSELG_251
    );
  nm_2_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clkm,
      O => nm_2_CLKINV_249
    );
  nm_4_LOGIC_ZERO : X_ZERO
    port map (
      O => nm_4_LOGIC_ZERO_308
    );
  nm_4_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_4_XORF_332,
      O => nm_4_DXMUX_334
    );
  nm_4_XORF : X_XOR2
    port map (
      I0 => nm_4_CYINIT_331,
      I1 => nm_4_F,
      O => nm_4_XORF_332
    );
  nm_4_CYMUXF : X_MUX2
    port map (
      IA => nm_4_LOGIC_ZERO_308,
      IB => nm_4_CYINIT_331,
      SEL => nm_4_CYSELF_314,
      O => Mcount_nm_cy_4_Q
    );
  nm_4_CYMUXF2 : X_MUX2
    port map (
      IA => nm_4_LOGIC_ZERO_308,
      IB => nm_4_LOGIC_ZERO_308,
      SEL => nm_4_CYSELF_314,
      O => nm_4_CYMUXF2_309
    );
  nm_4_CYINIT : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_nm_cy_3_Q,
      O => nm_4_CYINIT_331
    );
  nm_4_CYSELF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_4_F,
      O => nm_4_CYSELF_314
    );
  nm_4_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_4_XORG_316,
      O => nm_4_DYMUX_318
    );
  nm_4_XORG : X_XOR2
    port map (
      I0 => Mcount_nm_cy_4_Q,
      I1 => nm_4_G,
      O => nm_4_XORG_316
    );
  nm_4_FASTCARRY : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_nm_cy_3_Q,
      O => nm_4_FASTCARRY_311
    );
  nm_4_CYAND : X_AND2
    port map (
      I0 => nm_4_CYSELG_299,
      I1 => nm_4_CYSELF_314,
      O => nm_4_CYAND_312
    );
  nm_4_CYMUXFAST : X_MUX2
    port map (
      IA => nm_4_CYMUXG2_310,
      IB => nm_4_FASTCARRY_311,
      SEL => nm_4_CYAND_312,
      O => nm_4_CYMUXFAST_313
    );
  nm_4_CYMUXG2 : X_MUX2
    port map (
      IA => nm_4_LOGIC_ZERO_308,
      IB => nm_4_CYMUXF2_309,
      SEL => nm_4_CYSELG_299,
      O => nm_4_CYMUXG2_310
    );
  nm_4_CYSELG : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_4_G,
      O => nm_4_CYSELG_299
    );
  nm_4_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clkm,
      O => nm_4_CLKINV_297
    );
  nm_6_LOGIC_ZERO : X_ZERO
    port map (
      O => nm_6_LOGIC_ZERO_372
    );
  nm_6_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_6_XORF_373,
      O => nm_6_DXMUX_375
    );
  nm_6_XORF : X_XOR2
    port map (
      I0 => nm_6_CYINIT_371,
      I1 => nm_6_F,
      O => nm_6_XORF_373
    );
  nm_6_CYMUXF : X_MUX2
    port map (
      IA => nm_6_LOGIC_ZERO_372,
      IB => nm_6_CYINIT_371,
      SEL => nm_6_CYSELF_362,
      O => Mcount_nm_cy_6_Q
    );
  nm_6_CYINIT : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_4_CYMUXFAST_313,
      O => nm_6_CYINIT_371
    );
  nm_6_CYSELF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_6_F,
      O => nm_6_CYSELF_362
    );
  nm_6_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm_6_XORG_355,
      O => nm_6_DYMUX_357
    );
  nm_6_XORG : X_XOR2
    port map (
      I0 => Mcount_nm_cy_6_Q,
      I1 => nm_7_rt_352,
      O => nm_6_XORG_355
    );
  nm_6_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clkm,
      O => nm_6_CLKINV_344
    );
  nm_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => nm_6_DYMUX_357,
      CE => VCC,
      CLK => nm_6_CLKINV_344,
      SET => GND,
      RST => GND,
      O => nm(7)
    );
  nm_7_rt : X_LUT4
    generic map(
      INIT => X"AAAA"
    )
    port map (
      ADR0 => nm(7),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => nm_7_rt_352
    );
  clka_IBUFG : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clka,
      O => clka_INBUF
    );
  clka_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clka_INBUF,
      O => clka_IBUFG_182
    );
  clkb_IBUFG : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clkb,
      O => clkb_INBUF
    );
  cm_0_OBUF : X_OBUF
    port map (
      I => cm_0_O,
      O => cm(0)
    );
  cm_1_OBUF : X_OBUF
    port map (
      I => cm_1_O,
      O => cm(1)
    );
  cm_2_OBUF : X_OBUF
    port map (
      I => cm_2_O,
      O => cm(2)
    );
  ca_0_OBUF : X_OBUF
    port map (
      I => ca_0_O,
      O => ca(0)
    );
  cm_3_OBUF : X_OBUF
    port map (
      I => cm_3_O,
      O => cm(3)
    );
  ca_1_OBUF : X_OBUF
    port map (
      I => ca_1_O,
      O => ca(1)
    );
  cm_4_OBUF : X_OBUF
    port map (
      I => cm_4_O,
      O => cm(4)
    );
  ca_2_OBUF : X_OBUF
    port map (
      I => ca_2_O,
      O => ca(2)
    );
  cm_5_OBUF : X_OBUF
    port map (
      I => cm_5_O,
      O => cm(5)
    );
  ca_3_OBUF : X_OBUF
    port map (
      I => ca_3_O,
      O => ca(3)
    );
  cm_6_OBUF : X_OBUF
    port map (
      I => cm_6_O,
      O => cm(6)
    );
  ca_4_OBUF : X_OBUF
    port map (
      I => ca_4_O,
      O => ca(4)
    );
  cm_7_OBUF : X_OBUF
    port map (
      I => cm_7_O,
      O => cm(7)
    );
  ca_5_OBUF : X_OBUF
    port map (
      I => ca_5_O,
      O => ca(5)
    );
  ca_6_OBUF : X_OBUF
    port map (
      I => ca_6_O,
      O => ca(6)
    );
  ca_7_OBUF : X_OBUF
    port map (
      I => ca_7_O,
      O => ca(7)
    );
  sel_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => sel,
      O => sel_INBUF
    );
  sel_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => sel_INBUF,
      O => sel_IBUF_192
    );
  u_mux : X_BUFGMUX
    port map (
      I0 => clka_IBUFG_182,
      I1 => u_mux_I1_INV,
      S => sel_IBUF_192,
      O => clkm
    );
  u_mux_I1_USED : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clkb_INBUF,
      O => u_mux_I1_INV
    );
  na_4_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Result(4),
      O => na_4_DXMUX_557
    );
  na_4_YUSED : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_na_cy_3_pack_2,
      O => Maccum_na_cy(3)
    );
  na_4_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clka_IBUFG_182,
      O => na_4_CLKINV_540
    );
  Maccum_na_cy_3_11 : X_LUT4
    generic map(
      INIT => X"A888"
    )
    port map (
      ADR0 => na(3),
      ADR1 => na(2),
      ADR2 => na(1),
      ADR3 => na(0),
      O => Maccum_na_cy_3_pack_2
    );
  na_7_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Result(7),
      O => na_7_DXMUX_587
    );
  na_7_YUSED : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_na_cy_5_11_SW0_O_pack_2,
      O => Maccum_na_cy_5_11_SW0_O
    );
  na_7_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clka_IBUFG_182,
      O => na_7_CLKINV_570
    );
  Maccum_na_cy_5_11_SW0 : X_LUT4
    generic map(
      INIT => X"7777"
    )
    port map (
      ADR0 => na(6),
      ADR1 => na(4),
      ADR2 => VCC,
      ADR3 => VCC,
      O => Maccum_na_cy_5_11_SW0_O_pack_2
    );
  na_1_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Result(1),
      O => na_1_DYMUX_605
    );
  na_1_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clka_IBUFG_182,
      O => na_1_CLKINV_595
    );
  Maccum_na_xor_1_11 : X_LUT4
    generic map(
      INIT => X"6666"
    )
    port map (
      ADR0 => na(1),
      ADR1 => na(0),
      ADR2 => VCC,
      ADR3 => VCC,
      O => Result(1)
    );
  na_3_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Result(3),
      O => na_3_DXMUX_639
    );
  na_3_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Result(2),
      O => na_3_DYMUX_628
    );
  na_3_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clka_IBUFG_182,
      O => na_3_CLKINV_619
    );
  Maccum_na_xor_2_11 : X_LUT4
    generic map(
      INIT => X"9393"
    )
    port map (
      ADR0 => na(0),
      ADR1 => na(2),
      ADR2 => na(1),
      ADR3 => VCC,
      O => Result(2)
    );
  na_6_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Result(6),
      O => na_6_DXMUX_673
    );
  na_6_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Result(5),
      O => na_6_DYMUX_662
    );
  na_6_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clka_IBUFG_182,
      O => na_6_CLKINV_653
    );
  Maccum_na_xor_5_11 : X_LUT4
    generic map(
      INIT => X"6A6A"
    )
    port map (
      ADR0 => na(5),
      ADR1 => na(4),
      ADR2 => Maccum_na_cy(3),
      ADR3 => VCC,
      O => Result(5)
    );
  na_0_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => na_0_BYINV_683,
      O => na_0_DYMUX_684
    );
  na_0_BYINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => na_0_BYINV_683
    );
  na_0_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => na(0),
      O => na_0_SRINV_682
    );
  na_0_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clka_IBUFG_182,
      O => na_0_CLKINV_681
    );
  Mcount_nm_lut_0_INV_0 : X_LUT4
    generic map(
      INIT => X"5555"
    )
    port map (
      ADR0 => nm(0),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcount_nm_lut(0)
    );
  nm_0 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => nm_0_DXMUX_238,
      CE => VCC,
      CLK => nm_0_CLKINV_203,
      SET => GND,
      RST => GND,
      O => nm(0)
    );
  nm_3 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => nm_2_DYMUX_270,
      CE => VCC,
      CLK => nm_2_CLKINV_249,
      SET => GND,
      RST => GND,
      O => nm(3)
    );
  nm_2 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => nm_2_DXMUX_286,
      CE => VCC,
      CLK => nm_2_CLKINV_249,
      SET => GND,
      RST => GND,
      O => nm(2)
    );
  Maccum_na_xor_4_11 : X_LUT4
    generic map(
      INIT => X"6666"
    )
    port map (
      ADR0 => na(4),
      ADR1 => Maccum_na_cy(3),
      ADR2 => VCC,
      ADR3 => VCC,
      O => Result(4)
    );
  na_4 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => na_4_DXMUX_557,
      CE => VCC,
      CLK => na_4_CLKINV_540,
      SET => GND,
      RST => GND,
      O => na(4)
    );
  Maccum_na_xor_7_11 : X_LUT4
    generic map(
      INIT => X"A6AA"
    )
    port map (
      ADR0 => na(7),
      ADR1 => na(5),
      ADR2 => Maccum_na_cy_5_11_SW0_O,
      ADR3 => Maccum_na_cy(3),
      O => Result(7)
    );
  na_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => na_7_DXMUX_587,
      CE => VCC,
      CLK => na_7_CLKINV_570,
      SET => GND,
      RST => GND,
      O => na(7)
    );
  na_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => na_1_DYMUX_605,
      CE => VCC,
      CLK => na_1_CLKINV_595,
      SET => GND,
      RST => GND,
      O => na(1)
    );
  nm_5 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => nm_4_DYMUX_318,
      CE => VCC,
      CLK => nm_4_CLKINV_297,
      SET => GND,
      RST => GND,
      O => nm(5)
    );
  nm_4 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => nm_4_DXMUX_334,
      CE => VCC,
      CLK => nm_4_CLKINV_297,
      SET => GND,
      RST => GND,
      O => nm(4)
    );
  nm_6 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => nm_6_DXMUX_375,
      CE => VCC,
      CLK => nm_6_CLKINV_344,
      SET => GND,
      RST => GND,
      O => nm(6)
    );
  na_2 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => na_3_DYMUX_628,
      CE => VCC,
      CLK => na_3_CLKINV_619,
      SET => GND,
      RST => GND,
      O => na(2)
    );
  Maccum_na_xor_3_11 : X_LUT4
    generic map(
      INIT => X"363C"
    )
    port map (
      ADR0 => na(0),
      ADR1 => na(3),
      ADR2 => na(2),
      ADR3 => na(1),
      O => Result(3)
    );
  na_3 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => na_3_DXMUX_639,
      CE => VCC,
      CLK => na_3_CLKINV_619,
      SET => GND,
      RST => GND,
      O => na(3)
    );
  na_5 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => na_6_DYMUX_662,
      CE => VCC,
      CLK => na_6_CLKINV_653,
      SET => GND,
      RST => GND,
      O => na(5)
    );
  Maccum_na_xor_6_11 : X_LUT4
    generic map(
      INIT => X"6AAA"
    )
    port map (
      ADR0 => na(6),
      ADR1 => na(5),
      ADR2 => na(4),
      ADR3 => Maccum_na_cy(3),
      O => Result(6)
    );
  na_6 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => na_6_DXMUX_673,
      CE => VCC,
      CLK => na_6_CLKINV_653,
      SET => GND,
      RST => GND,
      O => na(6)
    );
  na_0 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      I => na_0_DYMUX_684,
      CE => VCC,
      CLK => na_0_CLKINV_681,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => na_0_SRINV_682,
      O => na(0)
    );
  nm_0_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA"
    )
    port map (
      ADR0 => nm(1),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => nm_0_G
    );
  nm_2_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA"
    )
    port map (
      ADR0 => nm(2),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => nm_2_F
    );
  nm_2_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA"
    )
    port map (
      ADR0 => nm(3),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => nm_2_G
    );
  nm_4_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA"
    )
    port map (
      ADR0 => nm(4),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => nm_4_F
    );
  nm_4_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA"
    )
    port map (
      ADR0 => nm(5),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => nm_4_G
    );
  nm_6_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA"
    )
    port map (
      ADR0 => nm(6),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => nm_6_F
    );
  cm_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm(0),
      O => cm_0_O
    );
  cm_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm(1),
      O => cm_1_O
    );
  cm_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm(2),
      O => cm_2_O
    );
  ca_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => na(0),
      O => ca_0_O
    );
  cm_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm(3),
      O => cm_3_O
    );
  ca_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => na(1),
      O => ca_1_O
    );
  cm_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm(4),
      O => cm_4_O
    );
  ca_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => na(2),
      O => ca_2_O
    );
  cm_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm(5),
      O => cm_5_O
    );
  ca_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => na(3),
      O => ca_3_O
    );
  cm_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm(6),
      O => cm_6_O
    );
  ca_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => na(4),
      O => ca_4_O
    );
  cm_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => nm(7),
      O => cm_7_O
    );
  ca_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => na(5),
      O => ca_5_O
    );
  ca_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => na(6),
      O => ca_6_O
    );
  ca_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => na(7),
      O => ca_7_O
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

