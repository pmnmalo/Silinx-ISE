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
    q20 : out STD_LOGIC;
    ce : in STD_LOGIC := 'X';
    q : out STD_LOGIC_VECTOR ( 3 downto 0 );
    qf : out STD_LOGIC_VECTOR ( 1 downto 0 );
    d : in STD_LOGIC_VECTOR ( 3 downto 0 );
    tap : in STD_LOGIC_VECTOR ( 3 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal Mshreg_f0_7 : STD_LOGIC;
  signal Mshreg_f1_7 : STD_LOGIC;
  signal Mshreg_fix_19_0 : STD_LOGIC;
  signal Mshreg_fix_19_1 : STD_LOGIC;
  signal N2 : STD_LOGIC;
  signal N3 : STD_LOGIC;
  signal ce_IBUF_45 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal d_0_IBUF_52 : STD_LOGIC;
  signal d_1_IBUF_53 : STD_LOGIC;
  signal d_2_IBUF_54 : STD_LOGIC;
  signal d_3_IBUF_55 : STD_LOGIC;
  signal q_0_OBUF_66 : STD_LOGIC;
  signal q_1_OBUF_67 : STD_LOGIC;
  signal q_2_OBUF_68 : STD_LOGIC;
  signal q_3_OBUF_69 : STD_LOGIC;
  signal tap_0_IBUF_76 : STD_LOGIC;
  signal tap_1_IBUF_77 : STD_LOGIC;
  signal tap_2_IBUF_78 : STD_LOGIC;
  signal tap_3_IBUF_79 : STD_LOGIC;
  signal clk_BUFGP_IBUFG_2 : STD_LOGIC;
  signal Mshreg_f1_7_CLKNOT_11 : STD_LOGIC;
  signal Mshreg_f1_7_CE : STD_LOGIC;
  signal Mshreg_fix_19_0_CE : STD_LOGIC;
  signal Mshreg_fix_19_0_Q : STD_LOGIC;
  signal Mshreg_fix_19_1_CE : STD_LOGIC;
  signal Mshreg_f0_7_CLKNOT_37 : STD_LOGIC;
  signal Mshreg_f0_7_CE : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal NLW_Mshreg_q_0_0_Q15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mshreg_q_1_0_Q15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mshreg_q_2_0_Q15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mshreg_q_3_0_Q15_UNCONNECTED : STD_LOGIC;
  signal NlwInverterSignal_f1_7_C : STD_LOGIC;
  signal NlwInverterSignal_f0_7_C : STD_LOGIC;
  signal NLW_Mshreg_f1_7_SRL16E_Q15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mshreg_fix_19_1_SRL16E_Q15_UNCONNECTED : STD_LOGIC;
  signal NLW_Mshreg_f0_7_SRL16E_Q15_UNCONNECTED : STD_LOGIC;
  signal dr : STD_LOGIC_VECTOR ( 1 downto 0 );
  signal f0 : STD_LOGIC_VECTOR ( 7 downto 7 );
  signal f1 : STD_LOGIC_VECTOR ( 7 downto 7 );
  signal fix : STD_LOGIC_VECTOR ( 19 downto 19 );
begin
  dr_0 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => d_2_IBUF_54,
      O => dr(0),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  dr_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => d_3_IBUF_55,
      O => dr(1),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  Mshreg_q_0_0 : X_SRLC16E
    generic map(
      INIT => X"0021"
    )
    port map (
      A0 => tap_0_IBUF_76,
      A1 => tap_1_IBUF_77,
      A2 => tap_2_IBUF_78,
      A3 => tap_3_IBUF_79,
      CE => ce_IBUF_45,
      CLK => clk_BUFGP,
      D => d_0_IBUF_52,
      Q => q_0_OBUF_66,
      Q15 => NLW_Mshreg_q_0_0_Q15_UNCONNECTED
    );
  Mshreg_q_1_0 : X_SRLC16E
    generic map(
      INIT => X"0222"
    )
    port map (
      A0 => tap_0_IBUF_76,
      A1 => tap_1_IBUF_77,
      A2 => tap_2_IBUF_78,
      A3 => tap_3_IBUF_79,
      CE => ce_IBUF_45,
      CLK => clk_BUFGP,
      D => d_1_IBUF_53,
      Q => q_1_OBUF_67,
      Q15 => NLW_Mshreg_q_1_0_Q15_UNCONNECTED
    );
  Mshreg_q_2_0 : X_SRLC16E
    generic map(
      INIT => X"0024"
    )
    port map (
      A0 => tap_0_IBUF_76,
      A1 => tap_1_IBUF_77,
      A2 => tap_2_IBUF_78,
      A3 => tap_3_IBUF_79,
      CE => ce_IBUF_45,
      CLK => clk_BUFGP,
      D => d_2_IBUF_54,
      Q => q_2_OBUF_68,
      Q15 => NLW_Mshreg_q_2_0_Q15_UNCONNECTED
    );
  Mshreg_q_3_0 : X_SRLC16E
    generic map(
      INIT => X"0228"
    )
    port map (
      A0 => tap_0_IBUF_76,
      A1 => tap_1_IBUF_77,
      A2 => tap_2_IBUF_78,
      A3 => tap_3_IBUF_79,
      CE => ce_IBUF_45,
      CLK => clk_BUFGP,
      D => d_3_IBUF_55,
      Q => q_3_OBUF_69,
      Q15 => NLW_Mshreg_q_3_0_Q15_UNCONNECTED
    );
  ce_IBUF : X_BUF
    port map (
      I => ce,
      O => ce_IBUF_45
    );
  d_3_IBUF : X_BUF
    port map (
      I => d(3),
      O => d_3_IBUF_55
    );
  d_2_IBUF : X_BUF
    port map (
      I => d(2),
      O => d_2_IBUF_54
    );
  d_1_IBUF : X_BUF
    port map (
      I => d(1),
      O => d_1_IBUF_53
    );
  d_0_IBUF : X_BUF
    port map (
      I => d(0),
      O => d_0_IBUF_52
    );
  tap_3_IBUF : X_BUF
    port map (
      I => tap(3),
      O => tap_3_IBUF_79
    );
  tap_2_IBUF : X_BUF
    port map (
      I => tap(2),
      O => tap_2_IBUF_78
    );
  tap_1_IBUF : X_BUF
    port map (
      I => tap(1),
      O => tap_1_IBUF_77
    );
  tap_0_IBUF : X_BUF
    port map (
      I => tap(0),
      O => tap_0_IBUF_76
    );
  XST_GND : X_ZERO
    port map (
      O => N2
    );
  XST_VCC : X_ONE
    port map (
      O => N3
    );
  f1_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => NlwInverterSignal_f1_7_C,
      I => Mshreg_f1_7,
      O => f1(7),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  fix_19 : X_FF
    generic map(
      INIT => '1'
    )
    port map (
      CLK => clk_BUFGP,
      I => Mshreg_fix_19_1,
      O => fix(19),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  f0_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => NlwInverterSignal_f0_7_C,
      I => Mshreg_f0_7,
      O => f0(7),
      CE => VCC,
      SET => GND,
      RST => GND
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
  Mshreg_f1_7_VCC : X_ONE
    port map (
      O => Mshreg_f1_7_CE
    );
  Mshreg_f1_7_CLKNOT : X_INV
    port map (
      I => clk_BUFGP,
      O => Mshreg_f1_7_CLKNOT_11
    );
  Mshreg_f1_7_SRL16E : X_SRLC16E
    generic map(
      INIT => X"0000"
    )
    port map (
      D => dr(1),
      CE => Mshreg_f1_7_CE,
      CLK => Mshreg_f1_7_CLKNOT_11,
      A3 => N2,
      A2 => N3,
      A1 => N3,
      A0 => N2,
      Q => Mshreg_f1_7,
      Q15 => NLW_Mshreg_f1_7_SRL16E_Q15_UNCONNECTED
    );
  Mshreg_fix_19_0_VCC : X_ONE
    port map (
      O => Mshreg_fix_19_0_CE
    );
  Mshreg_fix_19_0_SRLC16E : X_SRLC16E
    generic map(
      INIT => X"421F"
    )
    port map (
      D => d_0_IBUF_52,
      CE => Mshreg_fix_19_0_CE,
      CLK => clk_BUFGP,
      A3 => N3,
      A2 => N3,
      A1 => N3,
      A0 => N3,
      Q => Mshreg_fix_19_0_Q,
      Q15 => Mshreg_fix_19_0
    );
  Mshreg_fix_19_1_VCC : X_ONE
    port map (
      O => Mshreg_fix_19_1_CE
    );
  Mshreg_fix_19_1_SRL16E : X_SRLC16E
    generic map(
      INIT => X"0000"
    )
    port map (
      D => Mshreg_fix_19_0,
      CE => Mshreg_fix_19_1_CE,
      CLK => clk_BUFGP,
      A3 => N2,
      A2 => N2,
      A1 => N3,
      A0 => N2,
      Q => Mshreg_fix_19_1,
      Q15 => NLW_Mshreg_fix_19_1_SRL16E_Q15_UNCONNECTED
    );
  Mshreg_f0_7_VCC : X_ONE
    port map (
      O => Mshreg_f0_7_CE
    );
  Mshreg_f0_7_CLKNOT : X_INV
    port map (
      I => clk_BUFGP,
      O => Mshreg_f0_7_CLKNOT_37
    );
  Mshreg_f0_7_SRL16E : X_SRLC16E
    generic map(
      INIT => X"0000"
    )
    port map (
      D => dr(0),
      CE => Mshreg_f0_7_CE,
      CLK => Mshreg_f0_7_CLKNOT_37,
      A3 => N2,
      A2 => N3,
      A1 => N3,
      A0 => N2,
      Q => Mshreg_f0_7,
      Q15 => NLW_Mshreg_f0_7_SRL16E_Q15_UNCONNECTED
    );
  q20_OBUF : X_OBUF
    port map (
      I => fix(19),
      O => q20
    );
  q_0_OBUF : X_OBUF
    port map (
      I => q_0_OBUF_66,
      O => q(0)
    );
  q_1_OBUF : X_OBUF
    port map (
      I => q_1_OBUF_67,
      O => q(1)
    );
  q_2_OBUF : X_OBUF
    port map (
      I => q_2_OBUF_68,
      O => q(2)
    );
  q_3_OBUF : X_OBUF
    port map (
      I => q_3_OBUF_69,
      O => q(3)
    );
  qf_0_OBUF : X_OBUF
    port map (
      I => f0(7),
      O => qf(0)
    );
  qf_1_OBUF : X_OBUF
    port map (
      I => f1(7),
      O => qf(1)
    );
  NlwBlock_top_VCC : X_ONE
    port map (
      O => VCC
    );
  NlwBlock_top_GND : X_ZERO
    port map (
      O => GND
    );
  NlwInverterBlock_f1_7_C : X_INV
    port map (
      I => clk_BUFGP,
      O => NlwInverterSignal_f1_7_C
    );
  NlwInverterBlock_f0_7_C : X_INV
    port map (
      I => clk_BUFGP,
      O => NlwInverterSignal_f0_7_C
    );
  NlwBlockROC : X_ROC
    port map (O => GSR);
  NlwBlockTOC : X_TOC
    port map (O => GTS);

end STRUCTURE;

