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
    q20 : out STD_LOGIC;
    ce : in STD_LOGIC := 'X';
    q : out STD_LOGIC_VECTOR ( 3 downto 0 );
    qf : out STD_LOGIC_VECTOR ( 1 downto 0 );
    d : in STD_LOGIC_VECTOR ( 3 downto 0 );
    tap : in STD_LOGIC_VECTOR ( 3 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal Mshreg_f0_7_0 : STD_LOGIC;
  signal Mshreg_f1_7_1 : STD_LOGIC;
  signal Mshreg_fix_19_0_2 : STD_LOGIC;
  signal Mshreg_fix_19_1_3 : STD_LOGIC;
  signal N2 : STD_LOGIC;
  signal N3 : STD_LOGIC;
  signal ce_IBUF_7 : STD_LOGIC;
  signal clk_BUFGP_9 : STD_LOGIC;
  signal d_0_IBUF_14 : STD_LOGIC;
  signal d_1_IBUF_15 : STD_LOGIC;
  signal d_2_IBUF_16 : STD_LOGIC;
  signal d_3_IBUF_17 : STD_LOGIC;
  signal q_0_OBUF_28 : STD_LOGIC;
  signal q_1_OBUF_29 : STD_LOGIC;
  signal q_2_OBUF_30 : STD_LOGIC;
  signal q_3_OBUF_31 : STD_LOGIC;
  signal tap_0_IBUF_38 : STD_LOGIC;
  signal tap_1_IBUF_39 : STD_LOGIC;
  signal tap_2_IBUF_40 : STD_LOGIC;
  signal tap_3_IBUF_41 : STD_LOGIC;
  signal NLW_Mshreg_fix_19_0_Q_UNCONNECTED : STD_LOGIC;
  signal dr : STD_LOGIC_VECTOR ( 1 downto 0 );
  signal f0 : STD_LOGIC_VECTOR ( 7 downto 7 );
  signal f1 : STD_LOGIC_VECTOR ( 7 downto 7 );
  signal fix : STD_LOGIC_VECTOR ( 19 downto 19 );
begin
  dr_0 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_9,
      D => d_2_IBUF_16,
      Q => dr(0)
    );
  dr_1 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_9,
      D => d_3_IBUF_17,
      Q => dr(1)
    );
  Mshreg_q_0_0 : SRL16E
    generic map(
      INIT => X"0021"
    )
    port map (
      A0 => tap_0_IBUF_38,
      A1 => tap_1_IBUF_39,
      A2 => tap_2_IBUF_40,
      A3 => tap_3_IBUF_41,
      CE => ce_IBUF_7,
      CLK => clk_BUFGP_9,
      D => d_0_IBUF_14,
      Q => q_0_OBUF_28
    );
  Mshreg_q_1_0 : SRL16E
    generic map(
      INIT => X"0222"
    )
    port map (
      A0 => tap_0_IBUF_38,
      A1 => tap_1_IBUF_39,
      A2 => tap_2_IBUF_40,
      A3 => tap_3_IBUF_41,
      CE => ce_IBUF_7,
      CLK => clk_BUFGP_9,
      D => d_1_IBUF_15,
      Q => q_1_OBUF_29
    );
  Mshreg_q_2_0 : SRL16E
    generic map(
      INIT => X"0024"
    )
    port map (
      A0 => tap_0_IBUF_38,
      A1 => tap_1_IBUF_39,
      A2 => tap_2_IBUF_40,
      A3 => tap_3_IBUF_41,
      CE => ce_IBUF_7,
      CLK => clk_BUFGP_9,
      D => d_2_IBUF_16,
      Q => q_2_OBUF_30
    );
  Mshreg_q_3_0 : SRL16E
    generic map(
      INIT => X"0228"
    )
    port map (
      A0 => tap_0_IBUF_38,
      A1 => tap_1_IBUF_39,
      A2 => tap_2_IBUF_40,
      A3 => tap_3_IBUF_41,
      CE => ce_IBUF_7,
      CLK => clk_BUFGP_9,
      D => d_3_IBUF_17,
      Q => q_3_OBUF_31
    );
  ce_IBUF : IBUF
    port map (
      I => ce,
      O => ce_IBUF_7
    );
  d_3_IBUF : IBUF
    port map (
      I => d(3),
      O => d_3_IBUF_17
    );
  d_2_IBUF : IBUF
    port map (
      I => d(2),
      O => d_2_IBUF_16
    );
  d_1_IBUF : IBUF
    port map (
      I => d(1),
      O => d_1_IBUF_15
    );
  d_0_IBUF : IBUF
    port map (
      I => d(0),
      O => d_0_IBUF_14
    );
  tap_3_IBUF : IBUF
    port map (
      I => tap(3),
      O => tap_3_IBUF_41
    );
  tap_2_IBUF : IBUF
    port map (
      I => tap(2),
      O => tap_2_IBUF_40
    );
  tap_1_IBUF : IBUF
    port map (
      I => tap(1),
      O => tap_1_IBUF_39
    );
  tap_0_IBUF : IBUF
    port map (
      I => tap(0),
      O => tap_0_IBUF_38
    );
  q20_OBUF : OBUF
    port map (
      I => fix(19),
      O => q20
    );
  q_3_OBUF : OBUF
    port map (
      I => q_3_OBUF_31,
      O => q(3)
    );
  q_2_OBUF : OBUF
    port map (
      I => q_2_OBUF_30,
      O => q(2)
    );
  q_1_OBUF : OBUF
    port map (
      I => q_1_OBUF_29,
      O => q(1)
    );
  q_0_OBUF : OBUF
    port map (
      I => q_0_OBUF_28,
      O => q(0)
    );
  qf_1_OBUF : OBUF
    port map (
      I => f1(7),
      O => qf(1)
    );
  qf_0_OBUF : OBUF
    port map (
      I => f0(7),
      O => qf(0)
    );
  clk_BUFGP : BUFGP
    port map (
      I => clk,
      O => clk_BUFGP_9
    );
  XST_GND : GND
    port map (
      G => N2
    );
  XST_VCC : VCC
    port map (
      P => N3
    );
  Mshreg_f1_7 : SRL16_1
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => N2,
      A1 => N3,
      A2 => N3,
      A3 => N2,
      CLK => clk_BUFGP_9,
      D => dr(1),
      Q => Mshreg_f1_7_1
    );
  f1_7 : FD_1
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_9,
      D => Mshreg_f1_7_1,
      Q => f1(7)
    );
  Mshreg_fix_19_0 : SRLC16
    generic map(
      INIT => X"421F"
    )
    port map (
      A0 => N3,
      A1 => N3,
      A2 => N3,
      A3 => N3,
      CLK => clk_BUFGP_9,
      D => d_0_IBUF_14,
      Q => NLW_Mshreg_fix_19_0_Q_UNCONNECTED,
      Q15 => Mshreg_fix_19_0_2
    );
  Mshreg_fix_19_1 : SRL16
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => N2,
      A1 => N3,
      A2 => N2,
      A3 => N2,
      CLK => clk_BUFGP_9,
      D => Mshreg_fix_19_0_2,
      Q => Mshreg_fix_19_1_3
    );
  fix_19 : FD
    generic map(
      INIT => '1'
    )
    port map (
      C => clk_BUFGP_9,
      D => Mshreg_fix_19_1_3,
      Q => fix(19)
    );
  Mshreg_f0_7 : SRL16_1
    generic map(
      INIT => X"0000"
    )
    port map (
      A0 => N2,
      A1 => N3,
      A2 => N3,
      A3 => N2,
      CLK => clk_BUFGP_9,
      D => dr(0),
      Q => Mshreg_f0_7_0
    );
  f0_7 : FD_1
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_9,
      D => Mshreg_f0_7_0,
      Q => f0(7)
    );

end STRUCTURE;

