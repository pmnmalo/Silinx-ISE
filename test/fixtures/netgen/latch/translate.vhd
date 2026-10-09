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
    clr : in STD_LOGIC := 'X';
    g3 : in STD_LOGIC := 'X';
    ge : in STD_LOGIC := 'X';
    q3 : out STD_LOGIC;
    g : in STD_LOGIC := 'X';
    pre : in STD_LOGIC := 'X';
    q1 : out STD_LOGIC_VECTOR ( 3 downto 0 );
    q2 : out STD_LOGIC_VECTOR ( 1 downto 0 );
    qr : out STD_LOGIC_VECTOR ( 3 downto 0 );
    d : in STD_LOGIC_VECTOR ( 3 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal clk_BUFGP : STD_LOGIC;
  signal clr_IBUF_12 : STD_LOGIC;
  signal d_0_IBUF_17 : STD_LOGIC;
  signal d_1_IBUF_18 : STD_LOGIC;
  signal d_2_IBUF_19 : STD_LOGIC;
  signal d_3_IBUF_20 : STD_LOGIC;
  signal g3_BUFGP : STD_LOGIC;
  signal g_BUFGP : STD_LOGIC;
  signal ge_IBUF_26 : STD_LOGIC;
  signal l1_0_1_28 : STD_LOGIC;
  signal l1_1_1_30 : STD_LOGIC;
  signal l1_2_1_32 : STD_LOGIC;
  signal l1_3_1_34 : STD_LOGIC;
  signal l3_37 : STD_LOGIC;
  signal l3_xor0000 : STD_LOGIC;
  signal pre_IBUF_40 : STD_LOGIC;
  signal g_BUFGP_IBUFG_2 : STD_LOGIC;
  signal clk_BUFGP_IBUFG_5 : STD_LOGIC;
  signal g3_BUFGP_IBUFG_8 : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal NlwInverterSignal_l2_0_G : STD_LOGIC;
  signal NlwInverterSignal_l2_1_G : STD_LOGIC;
  signal l1 : STD_LOGIC_VECTOR ( 3 downto 0 );
  signal l2 : STD_LOGIC_VECTOR ( 1 downto 0 );
  signal r : STD_LOGIC_VECTOR ( 3 downto 0 );
begin
  r_0 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => l1(0),
      O => r(0),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  r_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => l1(1),
      O => r(1),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  r_2 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => l1(2),
      O => r(2),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  r_3 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => l1(3),
      O => r(3),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  l3 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      I => l3_xor0000,
      CLK => g3_BUFGP,
      O => l3_37,
      GE => VCC,
      SET => GND,
      RST => GND
    );
  l2_0 : X_LATCHE
    generic map(
      INIT => '1'
    )
    port map (
      I => d_2_IBUF_19,
      CLK => NlwInverterSignal_l2_0_G,
      SET => pre_IBUF_40,
      O => l2(0),
      GE => VCC,
      RST => GND
    );
  l2_1 : X_LATCHE
    generic map(
      INIT => '1'
    )
    port map (
      I => d_3_IBUF_20,
      CLK => NlwInverterSignal_l2_1_G,
      SET => pre_IBUF_40,
      O => l2(1),
      GE => VCC,
      RST => GND
    );
  l1_0 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      RST => clr_IBUF_12,
      I => d_0_IBUF_17,
      CLK => g_BUFGP,
      GE => ge_IBUF_26,
      O => l1(0),
      SET => GND
    );
  l1_1 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      RST => clr_IBUF_12,
      I => d_1_IBUF_18,
      CLK => g_BUFGP,
      GE => ge_IBUF_26,
      O => l1(1),
      SET => GND
    );
  l1_2 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      RST => clr_IBUF_12,
      I => d_2_IBUF_19,
      CLK => g_BUFGP,
      GE => ge_IBUF_26,
      O => l1(2),
      SET => GND
    );
  l1_3 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      RST => clr_IBUF_12,
      I => d_3_IBUF_20,
      CLK => g_BUFGP,
      GE => ge_IBUF_26,
      O => l1(3),
      SET => GND
    );
  Mxor_l3_xor0000_Result1 : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => d_1_IBUF_18,
      ADR1 => d_0_IBUF_17,
      O => l3_xor0000
    );
  clr_IBUF : X_BUF
    port map (
      I => clr,
      O => clr_IBUF_12
    );
  ge_IBUF : X_BUF
    port map (
      I => ge,
      O => ge_IBUF_26
    );
  pre_IBUF : X_BUF
    port map (
      I => pre,
      O => pre_IBUF_40
    );
  d_3_IBUF : X_BUF
    port map (
      I => d(3),
      O => d_3_IBUF_20
    );
  d_2_IBUF : X_BUF
    port map (
      I => d(2),
      O => d_2_IBUF_19
    );
  d_1_IBUF : X_BUF
    port map (
      I => d(1),
      O => d_1_IBUF_18
    );
  d_0_IBUF : X_BUF
    port map (
      I => d(0),
      O => d_0_IBUF_17
    );
  l1_3_1 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      RST => clr_IBUF_12,
      I => d_3_IBUF_20,
      CLK => g_BUFGP,
      GE => ge_IBUF_26,
      O => l1_3_1_34,
      SET => GND
    );
  l1_2_1 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      RST => clr_IBUF_12,
      I => d_2_IBUF_19,
      CLK => g_BUFGP,
      GE => ge_IBUF_26,
      O => l1_2_1_32,
      SET => GND
    );
  l1_1_1 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      RST => clr_IBUF_12,
      I => d_1_IBUF_18,
      CLK => g_BUFGP,
      GE => ge_IBUF_26,
      O => l1_1_1_30,
      SET => GND
    );
  l1_0_1 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      RST => clr_IBUF_12,
      I => d_0_IBUF_17,
      CLK => g_BUFGP,
      GE => ge_IBUF_26,
      O => l1_0_1_28,
      SET => GND
    );
  g_BUFGP_BUFG : X_CKBUF
    port map (
      I => g_BUFGP_IBUFG_2,
      O => g_BUFGP
    );
  g_BUFGP_IBUFG : X_CKBUF
    port map (
      I => g,
      O => g_BUFGP_IBUFG_2
    );
  clk_BUFGP_BUFG : X_CKBUF
    port map (
      I => clk_BUFGP_IBUFG_5,
      O => clk_BUFGP
    );
  clk_BUFGP_IBUFG : X_CKBUF
    port map (
      I => clk,
      O => clk_BUFGP_IBUFG_5
    );
  g3_BUFGP_BUFG : X_CKBUF
    port map (
      I => g3_BUFGP_IBUFG_8,
      O => g3_BUFGP
    );
  g3_BUFGP_IBUFG : X_CKBUF
    port map (
      I => g3,
      O => g3_BUFGP_IBUFG_8
    );
  q1_0_OBUF : X_OBUF
    port map (
      I => l1_0_1_28,
      O => q1(0)
    );
  q1_1_OBUF : X_OBUF
    port map (
      I => l1_1_1_30,
      O => q1(1)
    );
  q1_2_OBUF : X_OBUF
    port map (
      I => l1_2_1_32,
      O => q1(2)
    );
  q1_3_OBUF : X_OBUF
    port map (
      I => l1_3_1_34,
      O => q1(3)
    );
  q2_0_OBUF : X_OBUF
    port map (
      I => l2(0),
      O => q2(0)
    );
  q2_1_OBUF : X_OBUF
    port map (
      I => l2(1),
      O => q2(1)
    );
  q3_OBUF : X_OBUF
    port map (
      I => l3_37,
      O => q3
    );
  qr_0_OBUF : X_OBUF
    port map (
      I => r(0),
      O => qr(0)
    );
  qr_1_OBUF : X_OBUF
    port map (
      I => r(1),
      O => qr(1)
    );
  qr_2_OBUF : X_OBUF
    port map (
      I => r(2),
      O => qr(2)
    );
  qr_3_OBUF : X_OBUF
    port map (
      I => r(3),
      O => qr(3)
    );
  NlwBlock_top_VCC : X_ONE
    port map (
      O => VCC
    );
  NlwBlock_top_GND : X_ZERO
    port map (
      O => GND
    );
  NlwInverterBlock_l2_0_G : X_INV
    port map (
      I => g_BUFGP,
      O => NlwInverterSignal_l2_0_G
    );
  NlwInverterBlock_l2_1_G : X_INV
    port map (
      I => g_BUFGP,
      O => NlwInverterSignal_l2_1_G
    );
  NlwBlockROC : X_ROC
    port map (O => GSR);
  NlwBlockTOC : X_TOC
    port map (O => GTS);

end STRUCTURE;

