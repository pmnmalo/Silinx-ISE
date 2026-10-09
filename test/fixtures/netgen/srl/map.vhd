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
    clk : in STD_LOGIC := 'X';
    q20 : out STD_LOGIC;
    ce : in STD_LOGIC := 'X';
    q : out STD_LOGIC_VECTOR ( 3 downto 0 );
    qf : out STD_LOGIC_VECTOR ( 1 downto 0 );
    d : in STD_LOGIC_VECTOR ( 3 downto 0 );
    tap : in STD_LOGIC_VECTOR ( 3 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal d_0_IBUF_124 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal d_2_IBUF_132 : STD_LOGIC;
  signal d_3_IBUF_135 : STD_LOGIC;
  signal tap_0_IBUF_136 : STD_LOGIC;
  signal tap_1_IBUF_139 : STD_LOGIC;
  signal ce_IBUF_141 : STD_LOGIC;
  signal tap_2_IBUF_142 : STD_LOGIC;
  signal tap_3_IBUF_143 : STD_LOGIC;
  signal fix_19_DXMUX_188 : STD_LOGIC;
  signal Mshreg_fix_19_1 : STD_LOGIC;
  signal fix_19_DIF_MUX_177 : STD_LOGIC;
  signal fix_19_GMC15 : STD_LOGIC;
  signal fix_19_DIG_MUX_162 : STD_LOGIC;
  signal fix_19_CLKINV_160 : STD_LOGIC;
  signal fix_19_SRINV_154 : STD_LOGIC;
  signal clk_INBUF : STD_LOGIC;
  signal d_0_INBUF : STD_LOGIC;
  signal d_1_INBUF : STD_LOGIC;
  signal q_0_O : STD_LOGIC;
  signal d_2_INBUF : STD_LOGIC;
  signal q_1_O : STD_LOGIC;
  signal qf_0_O : STD_LOGIC;
  signal d_3_INBUF : STD_LOGIC;
  signal tap_0_INBUF : STD_LOGIC;
  signal q_2_O : STD_LOGIC;
  signal qf_1_O : STD_LOGIC;
  signal q20_O : STD_LOGIC;
  signal tap_1_INBUF : STD_LOGIC;
  signal q_3_O : STD_LOGIC;
  signal ce_INBUF : STD_LOGIC;
  signal tap_2_INBUF : STD_LOGIC;
  signal tap_3_INBUF : STD_LOGIC;
  signal clk_BUFGP_BUFG_S_INVNOT : STD_LOGIC;
  signal clk_BUFGP_BUFG_I0_INV : STD_LOGIC;
  signal f0_7_DYMUX_338 : STD_LOGIC;
  signal Mshreg_f0_7 : STD_LOGIC;
  signal f0_7_DIG_MUX_327 : STD_LOGIC;
  signal f0_7_CLKINVNOT : STD_LOGIC;
  signal f0_7_WSG : STD_LOGIC;
  signal f0_7_SRINV_321 : STD_LOGIC;
  signal f1_7_DYMUX_367 : STD_LOGIC;
  signal Mshreg_f1_7 : STD_LOGIC;
  signal f1_7_DIG_MUX_356 : STD_LOGIC;
  signal f1_7_CLKINVNOT : STD_LOGIC;
  signal f1_7_WSG : STD_LOGIC;
  signal f1_7_SRINV_350 : STD_LOGIC;
  signal q_3_OBUF_413 : STD_LOGIC;
  signal q_3_OBUF_DIF_MUX_405 : STD_LOGIC;
  signal q_0_OBUF_401 : STD_LOGIC;
  signal q_3_OBUF_DIG_MUX_393 : STD_LOGIC;
  signal q_3_OBUF_CLKINV_391 : STD_LOGIC;
  signal q_3_OBUF_SRINV_385 : STD_LOGIC;
  signal q_2_OBUF_458 : STD_LOGIC;
  signal q_2_OBUF_DIF_MUX_450 : STD_LOGIC;
  signal q_1_OBUF_446 : STD_LOGIC;
  signal q_2_OBUF_DIG_MUX_438 : STD_LOGIC;
  signal q_2_OBUF_CLKINV_436 : STD_LOGIC;
  signal q_2_OBUF_SRINV_430 : STD_LOGIC;
  signal dr_1_DXMUX_473 : STD_LOGIC;
  signal dr_1_DYMUX_468 : STD_LOGIC;
  signal dr_1_CLKINV_466 : STD_LOGIC;
  signal fix_19_G_SHIFTOUT : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal NLW_Mshreg_f1_7_SRL16E_Q15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mshreg_q_3_0_Q15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mshreg_q_0_0_Q15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mshreg_q_2_0_Q15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mshreg_q_1_0_Q15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mshreg_fix_19_1_SRL16E_Q15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mshreg_f0_7_SRL16E_Q15_UNCONNECTED : STD_LOGIC;
  signal fix : STD_LOGIC_VECTOR ( 19 downto 19 );
  signal f0 : STD_LOGIC_VECTOR ( 7 downto 7 );
  signal f1 : STD_LOGIC_VECTOR ( 7 downto 7 );
  signal dr : STD_LOGIC_VECTOR ( 1 downto 0 );
begin
  fix_19_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Mshreg_fix_19_1,
      O => fix_19_DXMUX_188
    );
  fix_19_DIF_MUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => fix_19_GMC15,
      O => fix_19_DIF_MUX_177
    );
  fix_19_DIG_MUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_0_IBUF_124,
      O => fix_19_DIG_MUX_162
    );
  fix_19_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => fix_19_SRINV_154
    );
  fix_19_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => fix_19_CLKINV_160
    );
  clk_BUFGP_IBUFG : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk,
      O => clk_INBUF
    );
  d_0_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d(0),
      O => d_0_INBUF
    );
  d_0_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_0_INBUF,
      O => d_0_IBUF_124
    );
  d_1_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d(1),
      O => d_1_INBUF
    );
  q_0_OBUF : X_OBUF
    port map (
      I => q_0_O,
      O => q(0)
    );
  d_2_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d(2),
      O => d_2_INBUF
    );
  d_2_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_2_INBUF,
      O => d_2_IBUF_132
    );
  q_1_OBUF : X_OBUF
    port map (
      I => q_1_O,
      O => q(1)
    );
  qf_0_OBUF : X_OBUF
    port map (
      I => qf_0_O,
      O => qf(0)
    );
  d_3_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d(3),
      O => d_3_INBUF
    );
  d_3_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_3_INBUF,
      O => d_3_IBUF_135
    );
  tap_0_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tap(0),
      O => tap_0_INBUF
    );
  tap_0_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tap_0_INBUF,
      O => tap_0_IBUF_136
    );
  q_2_OBUF : X_OBUF
    port map (
      I => q_2_O,
      O => q(2)
    );
  qf_1_OBUF : X_OBUF
    port map (
      I => qf_1_O,
      O => qf(1)
    );
  q20_OBUF : X_OBUF
    port map (
      I => q20_O,
      O => q20
    );
  tap_1_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tap(1),
      O => tap_1_INBUF
    );
  tap_1_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tap_1_INBUF,
      O => tap_1_IBUF_139
    );
  q_3_OBUF : X_OBUF
    port map (
      I => q_3_O,
      O => q(3)
    );
  ce_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => ce,
      O => ce_INBUF
    );
  ce_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => ce_INBUF,
      O => ce_IBUF_141
    );
  tap_2_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tap(2),
      O => tap_2_INBUF
    );
  tap_2_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tap_2_INBUF,
      O => tap_2_IBUF_142
    );
  tap_3_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tap(3),
      O => tap_3_INBUF
    );
  tap_3_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tap_3_INBUF,
      O => tap_3_IBUF_143
    );
  clk_BUFGP_BUFG : X_BUFGMUX
    port map (
      I0 => clk_BUFGP_BUFG_I0_INV,
      I1 => GND,
      S => clk_BUFGP_BUFG_S_INVNOT,
      O => clk_BUFGP
    );
  clk_BUFGP_BUFG_SINV : X_INV
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => clk_BUFGP_BUFG_S_INVNOT
    );
  clk_BUFGP_BUFG_I0_USED : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_INBUF,
      O => clk_BUFGP_BUFG_I0_INV
    );
  f0_7_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Mshreg_f0_7,
      O => f0_7_DYMUX_338
    );
  f0_7_DIG_MUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dr(0),
      O => f0_7_DIG_MUX_327
    );
  f0_7_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => f0_7_SRINV_321
    );
  f0_7_CLKINV : X_INV
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => f0_7_CLKINVNOT
    );
  f1_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => f1_7_DYMUX_367,
      CE => VCC,
      CLK => f1_7_CLKINVNOT,
      SET => GND,
      RST => GND,
      O => f1(7)
    );
  Mshreg_f1_7_SRL16E : X_SRLC16E
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => GND,
      A1 => VCC,
      A2 => VCC,
      A3 => GND,
      D => f1_7_DIG_MUX_356,
      CE => f1_7_WSG,
      CLK => f1_7_CLKINVNOT,
      Q => Mshreg_f1_7,
      Q15 => NLW_Mshreg_f1_7_SRL16E_Q15_UNCONNECTED
    );
  f1_7_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => Mshreg_f1_7,
      O => f1_7_DYMUX_367
    );
  f1_7_DIG_MUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dr(1),
      O => f1_7_DIG_MUX_356
    );
  f1_7_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => f1_7_SRINV_350
    );
  f1_7_CLKINV : X_INV
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => f1_7_CLKINVNOT
    );
  Mshreg_q_3_0 : X_SRLC16E
    generic map(
      INIT => X"0228"
    )
    port map (
      A0 => tap_0_IBUF_136,
      A1 => tap_1_IBUF_139,
      A2 => tap_2_IBUF_142,
      A3 => tap_3_IBUF_143,
      D => q_3_OBUF_DIF_MUX_405,
      CE => q_3_OBUF_SRINV_385,
      CLK => q_3_OBUF_CLKINV_391,
      Q => q_3_OBUF_413,
      Q15 => NLW_Mshreg_q_3_0_Q15_UNCONNECTED
    );
  Mshreg_q_0_0 : X_SRLC16E
    generic map(
      INIT => X"0021"
    )
    port map (
      A0 => tap_0_IBUF_136,
      A1 => tap_1_IBUF_139,
      A2 => tap_2_IBUF_142,
      A3 => tap_3_IBUF_143,
      D => q_3_OBUF_DIG_MUX_393,
      CE => q_3_OBUF_SRINV_385,
      CLK => q_3_OBUF_CLKINV_391,
      Q => q_0_OBUF_401,
      Q15 => NLW_Mshreg_q_0_0_Q15_UNCONNECTED
    );
  q_3_OBUF_DIF_MUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_3_IBUF_135,
      O => q_3_OBUF_DIF_MUX_405
    );
  q_3_OBUF_DIG_MUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_0_IBUF_124,
      O => q_3_OBUF_DIG_MUX_393
    );
  q_3_OBUF_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => ce_IBUF_141,
      O => q_3_OBUF_SRINV_385
    );
  q_3_OBUF_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => q_3_OBUF_CLKINV_391
    );
  Mshreg_q_2_0 : X_SRLC16E
    generic map(
      INIT => X"0024"
    )
    port map (
      A0 => tap_0_IBUF_136,
      A1 => tap_1_IBUF_139,
      A2 => tap_2_IBUF_142,
      A3 => tap_3_IBUF_143,
      D => q_2_OBUF_DIF_MUX_450,
      CE => q_2_OBUF_SRINV_430,
      CLK => q_2_OBUF_CLKINV_436,
      Q => q_2_OBUF_458,
      Q15 => NLW_Mshreg_q_2_0_Q15_UNCONNECTED
    );
  Mshreg_q_1_0 : X_SRLC16E
    generic map(
      INIT => X"0222"
    )
    port map (
      A0 => tap_0_IBUF_136,
      A1 => tap_1_IBUF_139,
      A2 => tap_2_IBUF_142,
      A3 => tap_3_IBUF_143,
      D => q_2_OBUF_DIG_MUX_438,
      CE => q_2_OBUF_SRINV_430,
      CLK => q_2_OBUF_CLKINV_436,
      Q => q_1_OBUF_446,
      Q15 => NLW_Mshreg_q_1_0_Q15_UNCONNECTED
    );
  q_2_OBUF_DIF_MUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_2_IBUF_132,
      O => q_2_OBUF_DIF_MUX_450
    );
  q_2_OBUF_DIG_MUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_1_INBUF,
      O => q_2_OBUF_DIG_MUX_438
    );
  q_2_OBUF_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => ce_IBUF_141,
      O => q_2_OBUF_SRINV_430
    );
  q_2_OBUF_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => q_2_OBUF_CLKINV_436
    );
  dr_0 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => dr_1_DYMUX_468,
      CE => VCC,
      CLK => dr_1_CLKINV_466,
      SET => GND,
      RST => GND,
      O => dr(0)
    );
  dr_1_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_3_IBUF_135,
      O => dr_1_DXMUX_473
    );
  dr_1_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_2_IBUF_132,
      O => dr_1_DYMUX_468
    );
  dr_1_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => dr_1_CLKINV_466
    );
  Mshreg_fix_19_0_SRLC16E : X_SRLC16E
    generic map(
      INIT => X"421F"
    )
    port map (
      A0 => GND,
      A1 => GND,
      A2 => GND,
      A3 => GND,
      D => fix_19_DIG_MUX_162,
      CE => fix_19_SRINV_154,
      CLK => fix_19_CLKINV_160,
      Q => fix_19_G_SHIFTOUT,
      Q15 => fix_19_GMC15
    );
  Mshreg_fix_19_1_SRL16E : X_SRLC16E
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => GND,
      A1 => VCC,
      A2 => GND,
      A3 => GND,
      D => fix_19_DIF_MUX_177,
      CE => fix_19_SRINV_154,
      CLK => fix_19_CLKINV_160,
      Q => Mshreg_fix_19_1,
      Q15 => NLW_Mshreg_fix_19_1_SRL16E_Q15_UNCONNECTED
    );
  fix_19 : X_FF
    generic map(
      INIT => '1'
    )
    port map (
      I => fix_19_DXMUX_188,
      CE => VCC,
      CLK => fix_19_CLKINV_160,
      SET => GND,
      RST => GND,
      O => fix(19)
    );
  dr_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => dr_1_DXMUX_473,
      CE => VCC,
      CLK => dr_1_CLKINV_466,
      SET => GND,
      RST => GND,
      O => dr(1)
    );
  Mshreg_f0_7_SRL16E : X_SRLC16E
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => GND,
      A1 => VCC,
      A2 => VCC,
      A3 => GND,
      D => f0_7_DIG_MUX_327,
      CE => f0_7_WSG,
      CLK => f0_7_CLKINVNOT,
      Q => Mshreg_f0_7,
      Q15 => NLW_Mshreg_f0_7_SRL16E_Q15_UNCONNECTED
    );
  f0_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => f0_7_DYMUX_338,
      CE => VCC,
      CLK => f0_7_CLKINVNOT,
      SET => GND,
      RST => GND,
      O => f0(7)
    );
  q_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => q_0_OBUF_401,
      O => q_0_O
    );
  q_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => q_1_OBUF_446,
      O => q_1_O
    );
  qf_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => f0(7),
      O => qf_0_O
    );
  q_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => q_2_OBUF_458,
      O => q_2_O
    );
  qf_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => f1(7),
      O => qf_1_O
    );
  q20_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => fix(19),
      O => q20_O
    );
  q_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => q_3_OBUF_413,
      O => q_3_O
    );
  Mshreg_f0_7_SRL16E_CE_WSGAND : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => f0_7_SRINV_321,
      O => f0_7_WSG
    );
  Mshreg_f1_7_SRL16E_CE_WSGAND : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => f1_7_SRINV_350,
      O => f1_7_WSG
    );
  NlwBlock_top_GND : X_ZERO
    port map (
      O => GND
    );
  NlwBlock_top_VCC : X_ONE
    port map (
      O => VCC
    );
  NlwBlockROC : X_ROC
    port map (O => GSR);
  NlwBlockTOC : X_TOC
    port map (O => GTS);

end STRUCTURE;

