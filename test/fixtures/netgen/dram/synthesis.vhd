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
    spo : out STD_LOGIC_VECTOR ( 3 downto 0 );
    dpo : out STD_LOGIC_VECTOR ( 3 downto 0 );
    o16 : out STD_LOGIC_VECTOR ( 7 downto 0 );
    o64 : out STD_LOGIC_VECTOR ( 1 downto 0 );
    di : in STD_LOGIC_VECTOR ( 7 downto 0 );
    a : in STD_LOGIC_VECTOR ( 5 downto 0 );
    we : in STD_LOGIC_VECTOR ( 2 downto 0 );
    dpra : in STD_LOGIC_VECTOR ( 4 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal N10 : STD_LOGIC;
  signal N11 : STD_LOGIC;
  signal N12 : STD_LOGIC;
  signal N13 : STD_LOGIC;
  signal N14 : STD_LOGIC;
  signal N15 : STD_LOGIC;
  signal N16 : STD_LOGIC;
  signal N17 : STD_LOGIC;
  signal N18 : STD_LOGIC;
  signal N19 : STD_LOGIC;
  signal N22 : STD_LOGIC;
  signal N24 : STD_LOGIC;
  signal N26 : STD_LOGIC;
  signal N28 : STD_LOGIC;
  signal N4 : STD_LOGIC;
  signal N5 : STD_LOGIC;
  signal N6 : STD_LOGIC;
  signal N7 : STD_LOGIC;
  signal N8 : STD_LOGIC;
  signal N9 : STD_LOGIC;
  signal a_0_IBUF_28 : STD_LOGIC;
  signal a_1_IBUF_29 : STD_LOGIC;
  signal a_2_IBUF_30 : STD_LOGIC;
  signal a_3_IBUF_31 : STD_LOGIC;
  signal a_4_IBUF_32 : STD_LOGIC;
  signal a_5_IBUF_33 : STD_LOGIC;
  signal clk_BUFGP_35 : STD_LOGIC;
  signal di_0_IBUF_44 : STD_LOGIC;
  signal di_1_IBUF_45 : STD_LOGIC;
  signal di_2_IBUF_46 : STD_LOGIC;
  signal di_3_IBUF_47 : STD_LOGIC;
  signal di_4_IBUF_48 : STD_LOGIC;
  signal di_5_IBUF_49 : STD_LOGIC;
  signal di_6_IBUF_50 : STD_LOGIC;
  signal di_7_IBUF_51 : STD_LOGIC;
  signal dpo_0_OBUF_56 : STD_LOGIC;
  signal dpo_1_OBUF_57 : STD_LOGIC;
  signal dpo_2_OBUF_58 : STD_LOGIC;
  signal dpo_3_OBUF_59 : STD_LOGIC;
  signal dpra_0_IBUF_65 : STD_LOGIC;
  signal dpra_1_IBUF_66 : STD_LOGIC;
  signal dpra_2_IBUF_67 : STD_LOGIC;
  signal dpra_3_IBUF_68 : STD_LOGIC;
  signal dpra_4_IBUF_69 : STD_LOGIC;
  signal o16_0_OBUF_78 : STD_LOGIC;
  signal o16_1_OBUF_79 : STD_LOGIC;
  signal o16_2_OBUF_80 : STD_LOGIC;
  signal o16_3_OBUF_81 : STD_LOGIC;
  signal o16_4_OBUF_82 : STD_LOGIC;
  signal o16_5_OBUF_83 : STD_LOGIC;
  signal o16_6_OBUF_84 : STD_LOGIC;
  signal o16_7_OBUF_85 : STD_LOGIC;
  signal spo_0_OBUF_94 : STD_LOGIC;
  signal spo_1_OBUF_95 : STD_LOGIC;
  signal spo_2_OBUF_96 : STD_LOGIC;
  signal spo_3_OBUF_97 : STD_LOGIC;
  signal we_0_IBUF_101 : STD_LOGIC;
  signal we_1_IBUF_102 : STD_LOGIC;
  signal we_2_IBUF_103 : STD_LOGIC;
  signal write_ctrl_104 : STD_LOGIC;
  signal write_ctrl1_105 : STD_LOGIC;
  signal write_ctrl2_106 : STD_LOGIC;
  signal write_ctrl3_107 : STD_LOGIC;
  signal Q_varindex0000 : STD_LOGIC_VECTOR ( 1 downto 0 );
  signal q64 : STD_LOGIC_VECTOR ( 1 downto 0 );
begin
  q64_0 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_35,
      D => Q_varindex0000(0),
      Q => q64(0)
    );
  q64_1 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_35,
      D => Q_varindex0000(1),
      Q => q64(1)
    );
  write_ctrl1 : LUT2
    generic map(
      INIT => X"8"
    )
    port map (
      I0 => a_4_IBUF_32,
      I1 => we_1_IBUF_102,
      O => write_ctrl1_105
    );
  write_ctrl3 : LUT2
    generic map(
      INIT => X"8"
    )
    port map (
      I0 => a_5_IBUF_33,
      I1 => we_2_IBUF_103,
      O => write_ctrl3_107
    );
  Mram_r321 : RAM16X1D
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_4_IBUF_48,
      DPRA0 => dpra_0_IBUF_65,
      DPRA1 => dpra_1_IBUF_66,
      DPRA2 => dpra_2_IBUF_67,
      DPRA3 => dpra_3_IBUF_68,
      WCLK => clk_BUFGP_35,
      WE => write_ctrl_104,
      SPO => N4,
      DPO => N5
    );
  Mram_r322 : RAM16X1D
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_4_IBUF_48,
      DPRA0 => dpra_0_IBUF_65,
      DPRA1 => dpra_1_IBUF_66,
      DPRA2 => dpra_2_IBUF_67,
      DPRA3 => dpra_3_IBUF_68,
      WCLK => clk_BUFGP_35,
      WE => write_ctrl1_105,
      SPO => N6,
      DPO => N7
    );
  Mram_r323 : RAM16X1D
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_5_IBUF_49,
      DPRA0 => dpra_0_IBUF_65,
      DPRA1 => dpra_1_IBUF_66,
      DPRA2 => dpra_2_IBUF_67,
      DPRA3 => dpra_3_IBUF_68,
      WCLK => clk_BUFGP_35,
      WE => write_ctrl_104,
      SPO => N8,
      DPO => N9
    );
  Mram_r324 : RAM16X1D
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_5_IBUF_49,
      DPRA0 => dpra_0_IBUF_65,
      DPRA1 => dpra_1_IBUF_66,
      DPRA2 => dpra_2_IBUF_67,
      DPRA3 => dpra_3_IBUF_68,
      WCLK => clk_BUFGP_35,
      WE => write_ctrl1_105,
      SPO => N10,
      DPO => N11
    );
  Mram_r325 : RAM16X1D
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_6_IBUF_50,
      DPRA0 => dpra_0_IBUF_65,
      DPRA1 => dpra_1_IBUF_66,
      DPRA2 => dpra_2_IBUF_67,
      DPRA3 => dpra_3_IBUF_68,
      WCLK => clk_BUFGP_35,
      WE => write_ctrl_104,
      SPO => N12,
      DPO => N13
    );
  Mram_r326 : RAM16X1D
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_6_IBUF_50,
      DPRA0 => dpra_0_IBUF_65,
      DPRA1 => dpra_1_IBUF_66,
      DPRA2 => dpra_2_IBUF_67,
      DPRA3 => dpra_3_IBUF_68,
      WCLK => clk_BUFGP_35,
      WE => write_ctrl1_105,
      SPO => N14,
      DPO => N15
    );
  Mram_r327 : RAM16X1D
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_7_IBUF_51,
      DPRA0 => dpra_0_IBUF_65,
      DPRA1 => dpra_1_IBUF_66,
      DPRA2 => dpra_2_IBUF_67,
      DPRA3 => dpra_3_IBUF_68,
      WCLK => clk_BUFGP_35,
      WE => write_ctrl_104,
      SPO => N16,
      DPO => N17
    );
  Mram_r328 : RAM16X1D
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_7_IBUF_51,
      DPRA0 => dpra_0_IBUF_65,
      DPRA1 => dpra_1_IBUF_66,
      DPRA2 => dpra_2_IBUF_67,
      DPRA3 => dpra_3_IBUF_68,
      WCLK => clk_BUFGP_35,
      WE => write_ctrl1_105,
      SPO => N18,
      DPO => N19
    );
  Mram_r641 : RAM32X1S
    generic map(
      INIT => X"92492492"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      A4 => a_4_IBUF_32,
      D => di_0_IBUF_44,
      WCLK => clk_BUFGP_35,
      WE => write_ctrl2_106,
      O => N22
    );
  Mram_r642 : RAM32X1S
    generic map(
      INIT => X"24924924"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      A4 => a_4_IBUF_32,
      D => di_0_IBUF_44,
      WCLK => clk_BUFGP_35,
      WE => write_ctrl3_107,
      O => N24
    );
  Mram_r643 : RAM32X1S
    generic map(
      INIT => X"24924924"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      A4 => a_4_IBUF_32,
      D => di_1_IBUF_45,
      WCLK => clk_BUFGP_35,
      WE => write_ctrl2_106,
      O => N26
    );
  Mram_r644 : RAM32X1S
    generic map(
      INIT => X"49249249"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      A4 => a_4_IBUF_32,
      D => di_1_IBUF_45,
      WCLK => clk_BUFGP_35,
      WE => write_ctrl3_107,
      O => N28
    );
  Mram_r161 : RAM16X1S
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_0_IBUF_44,
      WCLK => clk_BUFGP_35,
      WE => we_0_IBUF_101,
      O => o16_0_OBUF_78
    );
  Mram_r162 : RAM16X1S
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_1_IBUF_45,
      WCLK => clk_BUFGP_35,
      WE => we_0_IBUF_101,
      O => o16_1_OBUF_79
    );
  Mram_r163 : RAM16X1S
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_2_IBUF_46,
      WCLK => clk_BUFGP_35,
      WE => we_0_IBUF_101,
      O => o16_2_OBUF_80
    );
  Mram_r164 : RAM16X1S
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_3_IBUF_47,
      WCLK => clk_BUFGP_35,
      WE => we_0_IBUF_101,
      O => o16_3_OBUF_81
    );
  Mram_r165 : RAM16X1S
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_4_IBUF_48,
      WCLK => clk_BUFGP_35,
      WE => we_0_IBUF_101,
      O => o16_4_OBUF_82
    );
  Mram_r166 : RAM16X1S
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_5_IBUF_49,
      WCLK => clk_BUFGP_35,
      WE => we_0_IBUF_101,
      O => o16_5_OBUF_83
    );
  Mram_r167 : RAM16X1S
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_6_IBUF_50,
      WCLK => clk_BUFGP_35,
      WE => we_0_IBUF_101,
      O => o16_6_OBUF_84
    );
  Mram_r168 : RAM16X1S
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => a_0_IBUF_28,
      A1 => a_1_IBUF_29,
      A2 => a_2_IBUF_30,
      A3 => a_3_IBUF_31,
      D => di_7_IBUF_51,
      WCLK => clk_BUFGP_35,
      WE => we_0_IBUF_101,
      O => o16_7_OBUF_85
    );
  inst_LPM_MUX711 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => dpra_4_IBUF_69,
      I1 => N17,
      I2 => N19,
      O => dpo_3_OBUF_59
    );
  inst_LPM_MUX611 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => dpra_4_IBUF_69,
      I1 => N13,
      I2 => N15,
      O => dpo_2_OBUF_58
    );
  inst_LPM_MUX511 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => dpra_4_IBUF_69,
      I1 => N9,
      I2 => N11,
      O => dpo_1_OBUF_57
    );
  inst_LPM_MUX411 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => dpra_4_IBUF_69,
      I1 => N5,
      I2 => N7,
      O => dpo_0_OBUF_56
    );
  inst_LPM_MUX311 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => a_4_IBUF_32,
      I1 => N16,
      I2 => N18,
      O => spo_3_OBUF_97
    );
  inst_LPM_MUX211 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => a_4_IBUF_32,
      I1 => N12,
      I2 => N14,
      O => spo_2_OBUF_96
    );
  inst_LPM_MUX111 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => a_4_IBUF_32,
      I1 => N8,
      I2 => N10,
      O => spo_1_OBUF_95
    );
  inst_LPM_MUX11 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => a_4_IBUF_32,
      I1 => N4,
      I2 => N6,
      O => spo_0_OBUF_94
    );
  inst_LPM_MUX911 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => a_5_IBUF_33,
      I1 => N26,
      I2 => N28,
      O => Q_varindex0000(1)
    );
  inst_LPM_MUX811 : LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      I0 => a_5_IBUF_33,
      I1 => N22,
      I2 => N24,
      O => Q_varindex0000(0)
    );
  di_7_IBUF : IBUF
    port map (
      I => di(7),
      O => di_7_IBUF_51
    );
  di_6_IBUF : IBUF
    port map (
      I => di(6),
      O => di_6_IBUF_50
    );
  di_5_IBUF : IBUF
    port map (
      I => di(5),
      O => di_5_IBUF_49
    );
  di_4_IBUF : IBUF
    port map (
      I => di(4),
      O => di_4_IBUF_48
    );
  di_3_IBUF : IBUF
    port map (
      I => di(3),
      O => di_3_IBUF_47
    );
  di_2_IBUF : IBUF
    port map (
      I => di(2),
      O => di_2_IBUF_46
    );
  di_1_IBUF : IBUF
    port map (
      I => di(1),
      O => di_1_IBUF_45
    );
  di_0_IBUF : IBUF
    port map (
      I => di(0),
      O => di_0_IBUF_44
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
      O => a_0_IBUF_28
    );
  we_2_IBUF : IBUF
    port map (
      I => we(2),
      O => we_2_IBUF_103
    );
  we_1_IBUF : IBUF
    port map (
      I => we(1),
      O => we_1_IBUF_102
    );
  we_0_IBUF : IBUF
    port map (
      I => we(0),
      O => we_0_IBUF_101
    );
  dpra_4_IBUF : IBUF
    port map (
      I => dpra(4),
      O => dpra_4_IBUF_69
    );
  dpra_3_IBUF : IBUF
    port map (
      I => dpra(3),
      O => dpra_3_IBUF_68
    );
  dpra_2_IBUF : IBUF
    port map (
      I => dpra(2),
      O => dpra_2_IBUF_67
    );
  dpra_1_IBUF : IBUF
    port map (
      I => dpra(1),
      O => dpra_1_IBUF_66
    );
  dpra_0_IBUF : IBUF
    port map (
      I => dpra(0),
      O => dpra_0_IBUF_65
    );
  spo_3_OBUF : OBUF
    port map (
      I => spo_3_OBUF_97,
      O => spo(3)
    );
  spo_2_OBUF : OBUF
    port map (
      I => spo_2_OBUF_96,
      O => spo(2)
    );
  spo_1_OBUF : OBUF
    port map (
      I => spo_1_OBUF_95,
      O => spo(1)
    );
  spo_0_OBUF : OBUF
    port map (
      I => spo_0_OBUF_94,
      O => spo(0)
    );
  dpo_3_OBUF : OBUF
    port map (
      I => dpo_3_OBUF_59,
      O => dpo(3)
    );
  dpo_2_OBUF : OBUF
    port map (
      I => dpo_2_OBUF_58,
      O => dpo(2)
    );
  dpo_1_OBUF : OBUF
    port map (
      I => dpo_1_OBUF_57,
      O => dpo(1)
    );
  dpo_0_OBUF : OBUF
    port map (
      I => dpo_0_OBUF_56,
      O => dpo(0)
    );
  o16_7_OBUF : OBUF
    port map (
      I => o16_7_OBUF_85,
      O => o16(7)
    );
  o16_6_OBUF : OBUF
    port map (
      I => o16_6_OBUF_84,
      O => o16(6)
    );
  o16_5_OBUF : OBUF
    port map (
      I => o16_5_OBUF_83,
      O => o16(5)
    );
  o16_4_OBUF : OBUF
    port map (
      I => o16_4_OBUF_82,
      O => o16(4)
    );
  o16_3_OBUF : OBUF
    port map (
      I => o16_3_OBUF_81,
      O => o16(3)
    );
  o16_2_OBUF : OBUF
    port map (
      I => o16_2_OBUF_80,
      O => o16(2)
    );
  o16_1_OBUF : OBUF
    port map (
      I => o16_1_OBUF_79,
      O => o16(1)
    );
  o16_0_OBUF : OBUF
    port map (
      I => o16_0_OBUF_78,
      O => o16(0)
    );
  o64_1_OBUF : OBUF
    port map (
      I => q64(1),
      O => o64(1)
    );
  o64_0_OBUF : OBUF
    port map (
      I => q64(0),
      O => o64(0)
    );
  write_ctrl : LUT2
    generic map(
      INIT => X"4"
    )
    port map (
      I0 => a_4_IBUF_32,
      I1 => we_1_IBUF_102,
      O => write_ctrl_104
    );
  write_ctrl2 : LUT2
    generic map(
      INIT => X"4"
    )
    port map (
      I0 => a_5_IBUF_33,
      I1 => we_2_IBUF_103,
      O => write_ctrl2_106
    );
  clk_BUFGP : BUFGP
    port map (
      I => clk,
      O => clk_BUFGP_35
    );

end STRUCTURE;

