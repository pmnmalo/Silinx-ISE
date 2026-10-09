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
  signal a_0_IBUF_135 : STD_LOGIC;
  signal a_1_IBUF_136 : STD_LOGIC;
  signal a_2_IBUF_137 : STD_LOGIC;
  signal a_3_IBUF_138 : STD_LOGIC;
  signal a_4_IBUF_139 : STD_LOGIC;
  signal a_5_IBUF_140 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal di_0_IBUF_151 : STD_LOGIC;
  signal di_1_IBUF_152 : STD_LOGIC;
  signal di_2_IBUF_153 : STD_LOGIC;
  signal di_3_IBUF_154 : STD_LOGIC;
  signal di_4_IBUF_155 : STD_LOGIC;
  signal di_5_IBUF_156 : STD_LOGIC;
  signal di_6_IBUF_157 : STD_LOGIC;
  signal di_7_IBUF_158 : STD_LOGIC;
  signal dpo_0_OBUF_163 : STD_LOGIC;
  signal dpo_1_OBUF_164 : STD_LOGIC;
  signal dpo_2_OBUF_165 : STD_LOGIC;
  signal dpo_3_OBUF_166 : STD_LOGIC;
  signal dpra_0_IBUF_172 : STD_LOGIC;
  signal dpra_1_IBUF_173 : STD_LOGIC;
  signal dpra_2_IBUF_174 : STD_LOGIC;
  signal dpra_3_IBUF_175 : STD_LOGIC;
  signal dpra_4_IBUF_176 : STD_LOGIC;
  signal o16_0_OBUF_185 : STD_LOGIC;
  signal o16_1_OBUF_186 : STD_LOGIC;
  signal o16_2_OBUF_187 : STD_LOGIC;
  signal o16_3_OBUF_188 : STD_LOGIC;
  signal o16_4_OBUF_189 : STD_LOGIC;
  signal o16_5_OBUF_190 : STD_LOGIC;
  signal o16_6_OBUF_191 : STD_LOGIC;
  signal o16_7_OBUF_192 : STD_LOGIC;
  signal spo_0_OBUF_201 : STD_LOGIC;
  signal spo_1_OBUF_202 : STD_LOGIC;
  signal spo_2_OBUF_203 : STD_LOGIC;
  signal spo_3_OBUF_204 : STD_LOGIC;
  signal we_0_IBUF_208 : STD_LOGIC;
  signal we_1_IBUF_209 : STD_LOGIC;
  signal we_2_IBUF_210 : STD_LOGIC;
  signal write_ctrl_211 : STD_LOGIC;
  signal write_ctrl1_212 : STD_LOGIC;
  signal write_ctrl2_213 : STD_LOGIC;
  signal write_ctrl3_214 : STD_LOGIC;
  signal clk_BUFGP_IBUFG_106 : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal Q_varindex0000 : STD_LOGIC_VECTOR ( 1 downto 0 );
  signal q64 : STD_LOGIC_VECTOR ( 1 downto 0 );
begin
  q64_0 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => Q_varindex0000(0),
      O => q64(0),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  q64_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => Q_varindex0000(1),
      O => q64(1),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  write_ctrl1 : X_LUT2
    generic map(
      INIT => X"8"
    )
    port map (
      ADR0 => a_4_IBUF_139,
      ADR1 => we_1_IBUF_209,
      O => write_ctrl1_212
    );
  write_ctrl3 : X_LUT2
    generic map(
      INIT => X"8"
    )
    port map (
      ADR0 => a_5_IBUF_140,
      ADR1 => we_2_IBUF_210,
      O => write_ctrl3_214
    );
  Mram_r641 : X_RAMS32
    generic map(
      INIT => X"92492492"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      ADR4 => a_4_IBUF_139,
      I => di_0_IBUF_151,
      CLK => clk_BUFGP,
      WE => write_ctrl2_213,
      O => N22
    );
  Mram_r642 : X_RAMS32
    generic map(
      INIT => X"24924924"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      ADR4 => a_4_IBUF_139,
      I => di_0_IBUF_151,
      CLK => clk_BUFGP,
      WE => write_ctrl3_214,
      O => N24
    );
  Mram_r643 : X_RAMS32
    generic map(
      INIT => X"24924924"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      ADR4 => a_4_IBUF_139,
      I => di_1_IBUF_152,
      CLK => clk_BUFGP,
      WE => write_ctrl2_213,
      O => N26
    );
  Mram_r644 : X_RAMS32
    generic map(
      INIT => X"49249249"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      ADR4 => a_4_IBUF_139,
      I => di_1_IBUF_152,
      CLK => clk_BUFGP,
      WE => write_ctrl3_214,
      O => N28
    );
  Mram_r161 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_0_IBUF_151,
      CLK => clk_BUFGP,
      WE => we_0_IBUF_208,
      O => o16_0_OBUF_185
    );
  Mram_r162 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_1_IBUF_152,
      CLK => clk_BUFGP,
      WE => we_0_IBUF_208,
      O => o16_1_OBUF_186
    );
  Mram_r163 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_2_IBUF_153,
      CLK => clk_BUFGP,
      WE => we_0_IBUF_208,
      O => o16_2_OBUF_187
    );
  Mram_r164 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_3_IBUF_154,
      CLK => clk_BUFGP,
      WE => we_0_IBUF_208,
      O => o16_3_OBUF_188
    );
  Mram_r165 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_4_IBUF_155,
      CLK => clk_BUFGP,
      WE => we_0_IBUF_208,
      O => o16_4_OBUF_189
    );
  Mram_r166 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_5_IBUF_156,
      CLK => clk_BUFGP,
      WE => we_0_IBUF_208,
      O => o16_5_OBUF_190
    );
  Mram_r167 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_6_IBUF_157,
      CLK => clk_BUFGP,
      WE => we_0_IBUF_208,
      O => o16_6_OBUF_191
    );
  Mram_r168 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_7_IBUF_158,
      CLK => clk_BUFGP,
      WE => we_0_IBUF_208,
      O => o16_7_OBUF_192
    );
  inst_LPM_MUX711 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => dpra_4_IBUF_176,
      ADR1 => N17,
      ADR2 => N19,
      O => dpo_3_OBUF_166
    );
  inst_LPM_MUX611 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => dpra_4_IBUF_176,
      ADR1 => N13,
      ADR2 => N15,
      O => dpo_2_OBUF_165
    );
  inst_LPM_MUX511 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => dpra_4_IBUF_176,
      ADR1 => N9,
      ADR2 => N11,
      O => dpo_1_OBUF_164
    );
  inst_LPM_MUX411 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => dpra_4_IBUF_176,
      ADR1 => N5,
      ADR2 => N7,
      O => dpo_0_OBUF_163
    );
  inst_LPM_MUX311 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => a_4_IBUF_139,
      ADR1 => N16,
      ADR2 => N18,
      O => spo_3_OBUF_204
    );
  inst_LPM_MUX211 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => a_4_IBUF_139,
      ADR1 => N12,
      ADR2 => N14,
      O => spo_2_OBUF_203
    );
  inst_LPM_MUX111 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => a_4_IBUF_139,
      ADR1 => N8,
      ADR2 => N10,
      O => spo_1_OBUF_202
    );
  inst_LPM_MUX11 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => a_4_IBUF_139,
      ADR1 => N4,
      ADR2 => N6,
      O => spo_0_OBUF_201
    );
  inst_LPM_MUX911 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => a_5_IBUF_140,
      ADR1 => N26,
      ADR2 => N28,
      O => Q_varindex0000(1)
    );
  inst_LPM_MUX811 : X_LUT3
    generic map(
      INIT => X"E4"
    )
    port map (
      ADR0 => a_5_IBUF_140,
      ADR1 => N22,
      ADR2 => N24,
      O => Q_varindex0000(0)
    );
  di_7_IBUF : X_BUF
    port map (
      I => di(7),
      O => di_7_IBUF_158
    );
  di_6_IBUF : X_BUF
    port map (
      I => di(6),
      O => di_6_IBUF_157
    );
  di_5_IBUF : X_BUF
    port map (
      I => di(5),
      O => di_5_IBUF_156
    );
  di_4_IBUF : X_BUF
    port map (
      I => di(4),
      O => di_4_IBUF_155
    );
  di_3_IBUF : X_BUF
    port map (
      I => di(3),
      O => di_3_IBUF_154
    );
  di_2_IBUF : X_BUF
    port map (
      I => di(2),
      O => di_2_IBUF_153
    );
  di_1_IBUF : X_BUF
    port map (
      I => di(1),
      O => di_1_IBUF_152
    );
  di_0_IBUF : X_BUF
    port map (
      I => di(0),
      O => di_0_IBUF_151
    );
  a_5_IBUF : X_BUF
    port map (
      I => a(5),
      O => a_5_IBUF_140
    );
  a_4_IBUF : X_BUF
    port map (
      I => a(4),
      O => a_4_IBUF_139
    );
  a_3_IBUF : X_BUF
    port map (
      I => a(3),
      O => a_3_IBUF_138
    );
  a_2_IBUF : X_BUF
    port map (
      I => a(2),
      O => a_2_IBUF_137
    );
  a_1_IBUF : X_BUF
    port map (
      I => a(1),
      O => a_1_IBUF_136
    );
  a_0_IBUF : X_BUF
    port map (
      I => a(0),
      O => a_0_IBUF_135
    );
  we_2_IBUF : X_BUF
    port map (
      I => we(2),
      O => we_2_IBUF_210
    );
  we_1_IBUF : X_BUF
    port map (
      I => we(1),
      O => we_1_IBUF_209
    );
  we_0_IBUF : X_BUF
    port map (
      I => we(0),
      O => we_0_IBUF_208
    );
  dpra_4_IBUF : X_BUF
    port map (
      I => dpra(4),
      O => dpra_4_IBUF_176
    );
  dpra_3_IBUF : X_BUF
    port map (
      I => dpra(3),
      O => dpra_3_IBUF_175
    );
  dpra_2_IBUF : X_BUF
    port map (
      I => dpra(2),
      O => dpra_2_IBUF_174
    );
  dpra_1_IBUF : X_BUF
    port map (
      I => dpra(1),
      O => dpra_1_IBUF_173
    );
  dpra_0_IBUF : X_BUF
    port map (
      I => dpra(0),
      O => dpra_0_IBUF_172
    );
  write_ctrl : X_LUT2
    generic map(
      INIT => X"4"
    )
    port map (
      ADR0 => a_4_IBUF_139,
      ADR1 => we_1_IBUF_209,
      O => write_ctrl_211
    );
  write_ctrl2 : X_LUT2
    generic map(
      INIT => X"4"
    )
    port map (
      ADR0 => a_5_IBUF_140,
      ADR1 => we_2_IBUF_210,
      O => write_ctrl2_213
    );
  Mram_r321_X_RAMD16 : X_RAMD16
    generic map(
      INIT => X"0000"
    )
    port map (
      RADR0 => dpra_0_IBUF_172,
      RADR1 => dpra_1_IBUF_173,
      RADR2 => dpra_2_IBUF_174,
      RADR3 => dpra_3_IBUF_175,
      WADR0 => a_0_IBUF_135,
      WADR1 => a_1_IBUF_136,
      WADR2 => a_2_IBUF_137,
      WADR3 => a_3_IBUF_138,
      I => di_4_IBUF_155,
      CLK => clk_BUFGP,
      WE => write_ctrl_211,
      O => N5
    );
  Mram_r321_X_RAMS16 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_4_IBUF_155,
      CLK => clk_BUFGP,
      WE => write_ctrl_211,
      O => N4
    );
  Mram_r322_X_RAMD16 : X_RAMD16
    generic map(
      INIT => X"0000"
    )
    port map (
      RADR0 => dpra_0_IBUF_172,
      RADR1 => dpra_1_IBUF_173,
      RADR2 => dpra_2_IBUF_174,
      RADR3 => dpra_3_IBUF_175,
      WADR0 => a_0_IBUF_135,
      WADR1 => a_1_IBUF_136,
      WADR2 => a_2_IBUF_137,
      WADR3 => a_3_IBUF_138,
      I => di_4_IBUF_155,
      CLK => clk_BUFGP,
      WE => write_ctrl1_212,
      O => N7
    );
  Mram_r322_X_RAMS16 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_4_IBUF_155,
      CLK => clk_BUFGP,
      WE => write_ctrl1_212,
      O => N6
    );
  Mram_r323_X_RAMD16 : X_RAMD16
    generic map(
      INIT => X"0000"
    )
    port map (
      RADR0 => dpra_0_IBUF_172,
      RADR1 => dpra_1_IBUF_173,
      RADR2 => dpra_2_IBUF_174,
      RADR3 => dpra_3_IBUF_175,
      WADR0 => a_0_IBUF_135,
      WADR1 => a_1_IBUF_136,
      WADR2 => a_2_IBUF_137,
      WADR3 => a_3_IBUF_138,
      I => di_5_IBUF_156,
      CLK => clk_BUFGP,
      WE => write_ctrl_211,
      O => N9
    );
  Mram_r323_X_RAMS16 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_5_IBUF_156,
      CLK => clk_BUFGP,
      WE => write_ctrl_211,
      O => N8
    );
  Mram_r324_X_RAMD16 : X_RAMD16
    generic map(
      INIT => X"0000"
    )
    port map (
      RADR0 => dpra_0_IBUF_172,
      RADR1 => dpra_1_IBUF_173,
      RADR2 => dpra_2_IBUF_174,
      RADR3 => dpra_3_IBUF_175,
      WADR0 => a_0_IBUF_135,
      WADR1 => a_1_IBUF_136,
      WADR2 => a_2_IBUF_137,
      WADR3 => a_3_IBUF_138,
      I => di_5_IBUF_156,
      CLK => clk_BUFGP,
      WE => write_ctrl1_212,
      O => N11
    );
  Mram_r324_X_RAMS16 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_5_IBUF_156,
      CLK => clk_BUFGP,
      WE => write_ctrl1_212,
      O => N10
    );
  Mram_r325_X_RAMD16 : X_RAMD16
    generic map(
      INIT => X"0000"
    )
    port map (
      RADR0 => dpra_0_IBUF_172,
      RADR1 => dpra_1_IBUF_173,
      RADR2 => dpra_2_IBUF_174,
      RADR3 => dpra_3_IBUF_175,
      WADR0 => a_0_IBUF_135,
      WADR1 => a_1_IBUF_136,
      WADR2 => a_2_IBUF_137,
      WADR3 => a_3_IBUF_138,
      I => di_6_IBUF_157,
      CLK => clk_BUFGP,
      WE => write_ctrl_211,
      O => N13
    );
  Mram_r325_X_RAMS16 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_6_IBUF_157,
      CLK => clk_BUFGP,
      WE => write_ctrl_211,
      O => N12
    );
  Mram_r326_X_RAMD16 : X_RAMD16
    generic map(
      INIT => X"0000"
    )
    port map (
      RADR0 => dpra_0_IBUF_172,
      RADR1 => dpra_1_IBUF_173,
      RADR2 => dpra_2_IBUF_174,
      RADR3 => dpra_3_IBUF_175,
      WADR0 => a_0_IBUF_135,
      WADR1 => a_1_IBUF_136,
      WADR2 => a_2_IBUF_137,
      WADR3 => a_3_IBUF_138,
      I => di_6_IBUF_157,
      CLK => clk_BUFGP,
      WE => write_ctrl1_212,
      O => N15
    );
  Mram_r326_X_RAMS16 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_6_IBUF_157,
      CLK => clk_BUFGP,
      WE => write_ctrl1_212,
      O => N14
    );
  Mram_r327_X_RAMD16 : X_RAMD16
    generic map(
      INIT => X"0000"
    )
    port map (
      RADR0 => dpra_0_IBUF_172,
      RADR1 => dpra_1_IBUF_173,
      RADR2 => dpra_2_IBUF_174,
      RADR3 => dpra_3_IBUF_175,
      WADR0 => a_0_IBUF_135,
      WADR1 => a_1_IBUF_136,
      WADR2 => a_2_IBUF_137,
      WADR3 => a_3_IBUF_138,
      I => di_7_IBUF_158,
      CLK => clk_BUFGP,
      WE => write_ctrl_211,
      O => N17
    );
  Mram_r327_X_RAMS16 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_7_IBUF_158,
      CLK => clk_BUFGP,
      WE => write_ctrl_211,
      O => N16
    );
  Mram_r328_X_RAMD16 : X_RAMD16
    generic map(
      INIT => X"0000"
    )
    port map (
      RADR0 => dpra_0_IBUF_172,
      RADR1 => dpra_1_IBUF_173,
      RADR2 => dpra_2_IBUF_174,
      RADR3 => dpra_3_IBUF_175,
      WADR0 => a_0_IBUF_135,
      WADR1 => a_1_IBUF_136,
      WADR2 => a_2_IBUF_137,
      WADR3 => a_3_IBUF_138,
      I => di_7_IBUF_158,
      CLK => clk_BUFGP,
      WE => write_ctrl1_212,
      O => N19
    );
  Mram_r328_X_RAMS16 : X_RAMS16
    generic map(
      INIT => X"0000"
    )
    port map (
      ADR0 => a_0_IBUF_135,
      ADR1 => a_1_IBUF_136,
      ADR2 => a_2_IBUF_137,
      ADR3 => a_3_IBUF_138,
      I => di_7_IBUF_158,
      CLK => clk_BUFGP,
      WE => write_ctrl1_212,
      O => N18
    );
  clk_BUFGP_BUFG : X_CKBUF
    port map (
      I => clk_BUFGP_IBUFG_106,
      O => clk_BUFGP
    );
  clk_BUFGP_IBUFG : X_CKBUF
    port map (
      I => clk,
      O => clk_BUFGP_IBUFG_106
    );
  dpo_0_OBUF : X_OBUF
    port map (
      I => dpo_0_OBUF_163,
      O => dpo(0)
    );
  dpo_1_OBUF : X_OBUF
    port map (
      I => dpo_1_OBUF_164,
      O => dpo(1)
    );
  dpo_2_OBUF : X_OBUF
    port map (
      I => dpo_2_OBUF_165,
      O => dpo(2)
    );
  dpo_3_OBUF : X_OBUF
    port map (
      I => dpo_3_OBUF_166,
      O => dpo(3)
    );
  o16_0_OBUF : X_OBUF
    port map (
      I => o16_0_OBUF_185,
      O => o16(0)
    );
  o16_1_OBUF : X_OBUF
    port map (
      I => o16_1_OBUF_186,
      O => o16(1)
    );
  o16_2_OBUF : X_OBUF
    port map (
      I => o16_2_OBUF_187,
      O => o16(2)
    );
  o16_3_OBUF : X_OBUF
    port map (
      I => o16_3_OBUF_188,
      O => o16(3)
    );
  o16_4_OBUF : X_OBUF
    port map (
      I => o16_4_OBUF_189,
      O => o16(4)
    );
  o16_5_OBUF : X_OBUF
    port map (
      I => o16_5_OBUF_190,
      O => o16(5)
    );
  o16_6_OBUF : X_OBUF
    port map (
      I => o16_6_OBUF_191,
      O => o16(6)
    );
  o16_7_OBUF : X_OBUF
    port map (
      I => o16_7_OBUF_192,
      O => o16(7)
    );
  o64_0_OBUF : X_OBUF
    port map (
      I => q64(0),
      O => o64(0)
    );
  o64_1_OBUF : X_OBUF
    port map (
      I => q64(1),
      O => o64(1)
    );
  spo_0_OBUF : X_OBUF
    port map (
      I => spo_0_OBUF_201,
      O => spo(0)
    );
  spo_1_OBUF : X_OBUF
    port map (
      I => spo_1_OBUF_202,
      O => spo(1)
    );
  spo_2_OBUF : X_OBUF
    port map (
      I => spo_2_OBUF_203,
      O => spo(2)
    );
  spo_3_OBUF : X_OBUF
    port map (
      I => spo_3_OBUF_204,
      O => spo(3)
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

