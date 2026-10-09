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
  signal Maccum_na_cy_5_11_SW0_O : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal Maccum_na_cy : STD_LOGIC_VECTOR ( 3 downto 3 );
  signal Mcount_nm_cy : STD_LOGIC_VECTOR ( 6 downto 0 );
  signal Mcount_nm_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal Result : STD_LOGIC_VECTOR ( 7 downto 1 );
  signal na : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal nm : STD_LOGIC_VECTOR ( 7 downto 0 );
begin
  XST_GND : X_ZERO
    port map (
      O => N0
    );
  XST_VCC : X_ONE
    port map (
      O => N1
    );
  na_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clka_IBUFG_44,
      I => Result(1),
      O => na(1),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  na_2 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clka_IBUFG_44,
      I => Result(2),
      O => na(2),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  na_3 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clka_IBUFG_44,
      I => Result(3),
      O => na(3),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  na_4 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clka_IBUFG_44,
      I => Result(4),
      O => na(4),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  na_5 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clka_IBUFG_44,
      I => Result(5),
      O => na(5),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  na_6 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clka_IBUFG_44,
      I => Result(6),
      O => na(6),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  na_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clka_IBUFG_44,
      I => Result(7),
      O => na(7),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nm_0 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkm,
      I => Result_0_1,
      O => nm(0),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nm_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkm,
      I => Result_1_1,
      O => nm(1),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nm_2 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkm,
      I => Result_2_1,
      O => nm(2),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nm_3 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkm,
      I => Result_3_1,
      O => nm(3),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nm_4 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkm,
      I => Result_4_1,
      O => nm(4),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nm_5 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkm,
      I => Result_5_1,
      O => nm(5),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nm_6 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkm,
      I => Result_6_1,
      O => nm(6),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  nm_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clkm,
      I => Result_7_1,
      O => nm(7),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  Mcount_nm_cy_0_Q : X_MUX2
    port map (
      IB => N0,
      IA => N1,
      SEL => Mcount_nm_lut(0),
      O => Mcount_nm_cy(0)
    );
  Mcount_nm_xor_0_Q : X_XOR2
    port map (
      I0 => N0,
      I1 => Mcount_nm_lut(0),
      O => Result_0_1
    );
  Mcount_nm_cy_1_Q : X_MUX2
    port map (
      IB => Mcount_nm_cy(0),
      IA => N0,
      SEL => Mcount_nm_cy_1_rt_3,
      O => Mcount_nm_cy(1)
    );
  Mcount_nm_xor_1_Q : X_XOR2
    port map (
      I0 => Mcount_nm_cy(0),
      I1 => Mcount_nm_cy_1_rt_3,
      O => Result_1_1
    );
  Mcount_nm_cy_2_Q : X_MUX2
    port map (
      IB => Mcount_nm_cy(1),
      IA => N0,
      SEL => Mcount_nm_cy_2_rt_5,
      O => Mcount_nm_cy(2)
    );
  Mcount_nm_xor_2_Q : X_XOR2
    port map (
      I0 => Mcount_nm_cy(1),
      I1 => Mcount_nm_cy_2_rt_5,
      O => Result_2_1
    );
  Mcount_nm_cy_3_Q : X_MUX2
    port map (
      IB => Mcount_nm_cy(2),
      IA => N0,
      SEL => Mcount_nm_cy_3_rt_7,
      O => Mcount_nm_cy(3)
    );
  Mcount_nm_xor_3_Q : X_XOR2
    port map (
      I0 => Mcount_nm_cy(2),
      I1 => Mcount_nm_cy_3_rt_7,
      O => Result_3_1
    );
  Mcount_nm_cy_4_Q : X_MUX2
    port map (
      IB => Mcount_nm_cy(3),
      IA => N0,
      SEL => Mcount_nm_cy_4_rt_9,
      O => Mcount_nm_cy(4)
    );
  Mcount_nm_xor_4_Q : X_XOR2
    port map (
      I0 => Mcount_nm_cy(3),
      I1 => Mcount_nm_cy_4_rt_9,
      O => Result_4_1
    );
  Mcount_nm_cy_5_Q : X_MUX2
    port map (
      IB => Mcount_nm_cy(4),
      IA => N0,
      SEL => Mcount_nm_cy_5_rt_11,
      O => Mcount_nm_cy(5)
    );
  Mcount_nm_xor_5_Q : X_XOR2
    port map (
      I0 => Mcount_nm_cy(4),
      I1 => Mcount_nm_cy_5_rt_11,
      O => Result_5_1
    );
  Mcount_nm_cy_6_Q : X_MUX2
    port map (
      IB => Mcount_nm_cy(5),
      IA => N0,
      SEL => Mcount_nm_cy_6_rt_13,
      O => Mcount_nm_cy(6)
    );
  Mcount_nm_xor_6_Q : X_XOR2
    port map (
      I0 => Mcount_nm_cy(5),
      I1 => Mcount_nm_cy_6_rt_13,
      O => Result_6_1
    );
  Mcount_nm_xor_7_Q : X_XOR2
    port map (
      I0 => Mcount_nm_cy(6),
      I1 => Mcount_nm_xor_7_rt_15,
      O => Result_7_1
    );
  u_mux : X_BUFGMUX
    generic map(
      CLK_SEL_TYPE => "SYNC"
    )
    port map (
      I0 => clka_IBUFG_44,
      I1 => clkb_IBUFG_46,
      S => sel_IBUF_73,
      O => clkm
    );
  Maccum_na_xor_1_11 : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => na(1),
      ADR1 => na(0),
      O => Result(1)
    );
  Maccum_na_xor_2_11 : X_LUT3
    generic map(
      INIT => X"93"
    )
    port map (
      ADR0 => na(0),
      ADR1 => na(2),
      ADR2 => na(1),
      O => Result(2)
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
  Maccum_na_xor_4_11 : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => na(4),
      ADR1 => N2,
      O => Result(4)
    );
  Maccum_na_xor_5_11 : X_LUT3
    generic map(
      INIT => X"6A"
    )
    port map (
      ADR0 => na(5),
      ADR1 => na(4),
      ADR2 => Maccum_na_cy(3),
      O => Result(5)
    );
  clka_IBUFG : X_CKBUF
    port map (
      I => clka,
      O => clka_IBUFG_44
    );
  clkb_IBUFG : X_CKBUF
    port map (
      I => clkb,
      O => clkb_IBUFG_46
    );
  sel_IBUF : X_BUF
    port map (
      I => sel,
      O => sel_IBUF_73
    );
  na_0 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clka_IBUFG_44,
      I => N1,
      SRST => na(0),
      O => na(0),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  Mcount_nm_cy_1_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nm(1),
      O => Mcount_nm_cy_1_rt_3,
      ADR1 => GND
    );
  Mcount_nm_cy_2_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nm(2),
      O => Mcount_nm_cy_2_rt_5,
      ADR1 => GND
    );
  Mcount_nm_cy_3_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nm(3),
      O => Mcount_nm_cy_3_rt_7,
      ADR1 => GND
    );
  Mcount_nm_cy_4_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nm(4),
      O => Mcount_nm_cy_4_rt_9,
      ADR1 => GND
    );
  Mcount_nm_cy_5_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nm(5),
      O => Mcount_nm_cy_5_rt_11,
      ADR1 => GND
    );
  Mcount_nm_cy_6_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nm(6),
      O => Mcount_nm_cy_6_rt_13,
      ADR1 => GND
    );
  Mcount_nm_xor_7_rt : X_LUT2
    generic map(
      INIT => X"A"
    )
    port map (
      ADR0 => nm(7),
      O => Mcount_nm_xor_7_rt_15,
      ADR1 => GND
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
  Maccum_na_xor_7_11 : X_LUT4
    generic map(
      INIT => X"A6AA"
    )
    port map (
      ADR0 => na(7),
      ADR1 => na(5),
      ADR2 => N01,
      ADR3 => Maccum_na_cy(3),
      O => Result(7)
    );
  Mcount_nm_lut_0_INV_0 : X_INV
    port map (
      I => nm(0),
      O => Mcount_nm_lut(0)
    );
  Maccum_na_cy_3_11_LUT4_D_BUF : X_BUF
    port map (
      I => Maccum_na_cy(3),
      O => N2
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
      O => Maccum_na_cy(3)
    );
  Maccum_na_cy_5_11_SW0_LUT2_L_BUF : X_BUF
    port map (
      I => Maccum_na_cy_5_11_SW0_O,
      O => N01
    );
  Maccum_na_cy_5_11_SW0 : X_LUT2
    generic map(
      INIT => X"7"
    )
    port map (
      ADR0 => na(6),
      ADR1 => na(4),
      O => Maccum_na_cy_5_11_SW0_O
    );
  ca_0_OBUF : X_OBUF
    port map (
      I => na(0),
      O => ca(0)
    );
  ca_1_OBUF : X_OBUF
    port map (
      I => na(1),
      O => ca(1)
    );
  ca_2_OBUF : X_OBUF
    port map (
      I => na(2),
      O => ca(2)
    );
  ca_3_OBUF : X_OBUF
    port map (
      I => na(3),
      O => ca(3)
    );
  ca_4_OBUF : X_OBUF
    port map (
      I => na(4),
      O => ca(4)
    );
  ca_5_OBUF : X_OBUF
    port map (
      I => na(5),
      O => ca(5)
    );
  ca_6_OBUF : X_OBUF
    port map (
      I => na(6),
      O => ca(6)
    );
  ca_7_OBUF : X_OBUF
    port map (
      I => na(7),
      O => ca(7)
    );
  cm_0_OBUF : X_OBUF
    port map (
      I => nm(0),
      O => cm(0)
    );
  cm_1_OBUF : X_OBUF
    port map (
      I => nm(1),
      O => cm(1)
    );
  cm_2_OBUF : X_OBUF
    port map (
      I => nm(2),
      O => cm(2)
    );
  cm_3_OBUF : X_OBUF
    port map (
      I => nm(3),
      O => cm(3)
    );
  cm_4_OBUF : X_OBUF
    port map (
      I => nm(4),
      O => cm(4)
    );
  cm_5_OBUF : X_OBUF
    port map (
      I => nm(5),
      O => cm(5)
    );
  cm_6_OBUF : X_OBUF
    port map (
      I => nm(6),
      O => cm(6)
    );
  cm_7_OBUF : X_OBUF
    port map (
      I => nm(7),
      O => cm(7)
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

