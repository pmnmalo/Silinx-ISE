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
  signal ge_IBUF_125 : STD_LOGIC;
  signal clr_IBUF_127 : STD_LOGIC;
  signal pre_IBUF_129 : STD_LOGIC;
  signal g_BUFGP : STD_LOGIC;
  signal d_0_IBUF_131 : STD_LOGIC;
  signal g3_BUFGP : STD_LOGIC;
  signal d_1_IBUF_134 : STD_LOGIC;
  signal d_2_IBUF_135 : STD_LOGIC;
  signal d_3_IBUF_136 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal g_INBUF : STD_LOGIC;
  signal ge_INBUF : STD_LOGIC;
  signal clk_INBUF : STD_LOGIC;
  signal clr_INBUF : STD_LOGIC;
  signal g3_INBUF : STD_LOGIC;
  signal pre_INBUF : STD_LOGIC;
  signal q1_0_O : STD_LOGIC;
  signal q1_0_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal q1_0_OUTPUT_OFF_PCICE_MUX_199 : STD_LOGIC;
  signal l1_0_1_204 : STD_LOGIC;
  signal q1_0_OUTPUT_OTCLK1INVNOT : STD_LOGIC;
  signal q3_O : STD_LOGIC;
  signal q3_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal l3_224 : STD_LOGIC;
  signal q3_OUTPUT_OTCLK1INVNOT : STD_LOGIC;
  signal q1_1_O : STD_LOGIC;
  signal q1_1_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal q1_1_OUTPUT_OFF_PCICE_MUX_247 : STD_LOGIC;
  signal l1_1_1_252 : STD_LOGIC;
  signal q1_1_OUTPUT_OTCLK1INVNOT : STD_LOGIC;
  signal q1_2_O : STD_LOGIC;
  signal q1_2_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal q1_2_OUTPUT_OFF_PCICE_MUX_278 : STD_LOGIC;
  signal l1_2_1_283 : STD_LOGIC;
  signal q1_2_OUTPUT_OTCLK1INVNOT : STD_LOGIC;
  signal q1_3_O : STD_LOGIC;
  signal q1_3_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal q1_3_OUTPUT_OFF_PCICE_MUX_309 : STD_LOGIC;
  signal l1_3_1_314 : STD_LOGIC;
  signal q1_3_OUTPUT_OTCLK1INVNOT : STD_LOGIC;
  signal q2_0_O : STD_LOGIC;
  signal q2_0_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal q2_0_OUTPUT_OTCLK1INV_331 : STD_LOGIC;
  signal q2_1_O : STD_LOGIC;
  signal q2_1_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal q2_1_OUTPUT_OTCLK1INV_355 : STD_LOGIC;
  signal d_0_INBUF : STD_LOGIC;
  signal qr_0_O : STD_LOGIC;
  signal qr_0_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal qr_0_OUTPUT_OTCLK1INV_382 : STD_LOGIC;
  signal d_1_INBUF : STD_LOGIC;
  signal qr_1_O : STD_LOGIC;
  signal qr_1_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal qr_1_OUTPUT_OTCLK1INV_405 : STD_LOGIC;
  signal d_2_INBUF : STD_LOGIC;
  signal qr_2_O : STD_LOGIC;
  signal qr_2_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal qr_2_OUTPUT_OTCLK1INV_428 : STD_LOGIC;
  signal d_3_INBUF : STD_LOGIC;
  signal qr_3_O : STD_LOGIC;
  signal qr_3_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal qr_3_OUTPUT_OTCLK1INV_451 : STD_LOGIC;
  signal g3_BUFGP_BUFG_S_INVNOT : STD_LOGIC;
  signal g3_BUFGP_BUFG_I0_INV : STD_LOGIC;
  signal clk_BUFGP_BUFG_S_INVNOT : STD_LOGIC;
  signal clk_BUFGP_BUFG_I0_INV : STD_LOGIC;
  signal g_BUFGP_BUFG_S_INVNOT : STD_LOGIC;
  signal g_BUFGP_BUFG_I0_INV : STD_LOGIC;
  signal l1_1_DXMUX_495 : STD_LOGIC;
  signal l1_1_DYMUX_486 : STD_LOGIC;
  signal l1_1_SRINV_484 : STD_LOGIC;
  signal l1_1_CLKINVNOT : STD_LOGIC;
  signal l1_1_CEINV_482 : STD_LOGIC;
  signal l3_xor0000 : STD_LOGIC;
  signal l1_3_DXMUX_535 : STD_LOGIC;
  signal l1_3_DYMUX_526 : STD_LOGIC;
  signal l1_3_SRINV_524 : STD_LOGIC;
  signal l1_3_CLKINVNOT : STD_LOGIC;
  signal l1_3_CEINV_522 : STD_LOGIC;
  signal q1_0_OUTPUT_OFF_OFF1_RSTAND_206 : STD_LOGIC;
  signal q1_1_OUTPUT_OFF_OFF1_RSTAND_254 : STD_LOGIC;
  signal q1_2_OUTPUT_OFF_OFF1_RSTAND_285 : STD_LOGIC;
  signal q1_3_OUTPUT_OFF_OFF1_RSTAND_316 : STD_LOGIC;
  signal q2_0_OUTPUT_OFF_OFF1_SET : STD_LOGIC;
  signal q2_1_OUTPUT_OFF_OFF1_SET : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal NlwInverterSignal_l3_CLK : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal NlwInverterSignal_l1_0_1_CLK : STD_LOGIC;
  signal NlwInverterSignal_l1_1_CLK : STD_LOGIC;
  signal NlwInverterSignal_l1_2_CLK : STD_LOGIC;
  signal NlwInverterSignal_l1_3_CLK : STD_LOGIC;
  signal NlwInverterSignal_l1_1_1_CLK : STD_LOGIC;
  signal NlwInverterSignal_l1_2_1_CLK : STD_LOGIC;
  signal NlwInverterSignal_l1_3_1_CLK : STD_LOGIC;
  signal NlwInverterSignal_l1_0_CLK : STD_LOGIC;
  signal NlwInverterSignal_l2_0_CLK : STD_LOGIC;
  signal NlwInverterSignal_l2_1_CLK : STD_LOGIC;
  signal l1 : STD_LOGIC_VECTOR ( 3 downto 0 );
  signal l2 : STD_LOGIC_VECTOR ( 1 downto 0 );
  signal r : STD_LOGIC_VECTOR ( 3 downto 0 );
begin
  g_BUFGP_IBUFG : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => g,
      O => g_INBUF
    );
  ge_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => ge,
      O => ge_INBUF
    );
  ge_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => ge_INBUF,
      O => ge_IBUF_125
    );
  clk_BUFGP_IBUFG : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk,
      O => clk_INBUF
    );
  clr_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clr,
      O => clr_INBUF
    );
  clr_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clr_INBUF,
      O => clr_IBUF_127
    );
  g3_BUFGP_IBUFG : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => g3,
      O => g3_INBUF
    );
  pre_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => pre,
      O => pre_INBUF
    );
  pre_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => pre_INBUF,
      O => pre_IBUF_129
    );
  q1_0_OBUF : X_OBUF
    port map (
      I => q1_0_O,
      O => q1(0)
    );
  q1_0_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_0_IBUF_131,
      O => q1_0_OUTPUT_OFF_ODDRIN1_MUX
    );
  q1_0_OUTPUT_OFF_PCICE_MUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => ge_IBUF_125,
      O => q1_0_OUTPUT_OFF_PCICE_MUX_199
    );
  q1_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => l1_0_1_204,
      O => q1_0_O
    );
  q1_0_OUTPUT_OTCLK1INV : X_INV
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => g_BUFGP,
      O => q1_0_OUTPUT_OTCLK1INVNOT
    );
  q3_OBUF : X_OBUF
    port map (
      I => q3_O,
      O => q3
    );
  q3_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => l3_xor0000,
      O => q3_OUTPUT_OFF_ODDRIN1_MUX
    );
  q3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => l3_224,
      O => q3_O
    );
  l3 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      I => q3_OUTPUT_OFF_ODDRIN1_MUX,
      GE => VCC,
      CLK => NlwInverterSignal_l3_CLK,
      SET => GND,
      RST => GND,
      O => l3_224
    );
  q3_OUTPUT_OTCLK1INV : X_INV
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => g3_BUFGP,
      O => q3_OUTPUT_OTCLK1INVNOT
    );
  q1_1_OBUF : X_OBUF
    port map (
      I => q1_1_O,
      O => q1(1)
    );
  q1_1_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_1_IBUF_134,
      O => q1_1_OUTPUT_OFF_ODDRIN1_MUX
    );
  q1_1_OUTPUT_OFF_PCICE_MUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => ge_IBUF_125,
      O => q1_1_OUTPUT_OFF_PCICE_MUX_247
    );
  q1_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => l1_1_1_252,
      O => q1_1_O
    );
  q1_1_OUTPUT_OTCLK1INV : X_INV
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => g_BUFGP,
      O => q1_1_OUTPUT_OTCLK1INVNOT
    );
  q1_2_OBUF : X_OBUF
    port map (
      I => q1_2_O,
      O => q1(2)
    );
  q1_2_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_2_IBUF_135,
      O => q1_2_OUTPUT_OFF_ODDRIN1_MUX
    );
  q1_2_OUTPUT_OFF_PCICE_MUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => ge_IBUF_125,
      O => q1_2_OUTPUT_OFF_PCICE_MUX_278
    );
  q1_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => l1_2_1_283,
      O => q1_2_O
    );
  q1_2_OUTPUT_OTCLK1INV : X_INV
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => g_BUFGP,
      O => q1_2_OUTPUT_OTCLK1INVNOT
    );
  q1_3_OBUF : X_OBUF
    port map (
      I => q1_3_O,
      O => q1(3)
    );
  q1_3_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_3_IBUF_136,
      O => q1_3_OUTPUT_OFF_ODDRIN1_MUX
    );
  q1_3_OUTPUT_OFF_PCICE_MUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => ge_IBUF_125,
      O => q1_3_OUTPUT_OFF_PCICE_MUX_309
    );
  q1_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => l1_3_1_314,
      O => q1_3_O
    );
  q1_3_OUTPUT_OTCLK1INV : X_INV
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => g_BUFGP,
      O => q1_3_OUTPUT_OTCLK1INVNOT
    );
  q2_0_OBUF : X_OBUF
    port map (
      I => q2_0_O,
      O => q2(0)
    );
  q2_0_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_2_IBUF_135,
      O => q2_0_OUTPUT_OFF_ODDRIN1_MUX
    );
  q2_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => l2(0),
      O => q2_0_O
    );
  q2_0_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => g_BUFGP,
      O => q2_0_OUTPUT_OTCLK1INV_331
    );
  q2_1_OBUF : X_OBUF
    port map (
      I => q2_1_O,
      O => q2(1)
    );
  q2_1_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_3_IBUF_136,
      O => q2_1_OUTPUT_OFF_ODDRIN1_MUX
    );
  q2_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => l2(1),
      O => q2_1_O
    );
  q2_1_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => g_BUFGP,
      O => q2_1_OUTPUT_OTCLK1INV_355
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
      O => d_0_IBUF_131
    );
  qr_0_OBUF : X_OBUF
    port map (
      I => qr_0_O,
      O => qr(0)
    );
  qr_0_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => l1(0),
      O => qr_0_OUTPUT_OFF_ODDRIN1_MUX
    );
  qr_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => r(0),
      O => qr_0_O
    );
  r_0 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => qr_0_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => qr_0_OUTPUT_OTCLK1INV_382,
      SET => GND,
      RST => GND,
      O => r(0)
    );
  qr_0_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => qr_0_OUTPUT_OTCLK1INV_382
    );
  d_1_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d(1),
      O => d_1_INBUF
    );
  d_1_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_1_INBUF,
      O => d_1_IBUF_134
    );
  qr_1_OBUF : X_OBUF
    port map (
      I => qr_1_O,
      O => qr(1)
    );
  qr_1_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => l1(1),
      O => qr_1_OUTPUT_OFF_ODDRIN1_MUX
    );
  qr_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => r(1),
      O => qr_1_O
    );
  r_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => qr_1_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => qr_1_OUTPUT_OTCLK1INV_405,
      SET => GND,
      RST => GND,
      O => r(1)
    );
  qr_1_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => qr_1_OUTPUT_OTCLK1INV_405
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
      O => d_2_IBUF_135
    );
  qr_2_OBUF : X_OBUF
    port map (
      I => qr_2_O,
      O => qr(2)
    );
  qr_2_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => l1(2),
      O => qr_2_OUTPUT_OFF_ODDRIN1_MUX
    );
  qr_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => r(2),
      O => qr_2_O
    );
  r_2 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => qr_2_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => qr_2_OUTPUT_OTCLK1INV_428,
      SET => GND,
      RST => GND,
      O => r(2)
    );
  qr_2_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => qr_2_OUTPUT_OTCLK1INV_428
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
      O => d_3_IBUF_136
    );
  qr_3_OBUF : X_OBUF
    port map (
      I => qr_3_O,
      O => qr(3)
    );
  qr_3_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => l1(3),
      O => qr_3_OUTPUT_OFF_ODDRIN1_MUX
    );
  qr_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => r(3),
      O => qr_3_O
    );
  r_3 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      I => qr_3_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => qr_3_OUTPUT_OTCLK1INV_451,
      SET => GND,
      RST => GND,
      O => r(3)
    );
  qr_3_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => qr_3_OUTPUT_OTCLK1INV_451
    );
  g3_BUFGP_BUFG : X_BUFGMUX
    port map (
      I0 => g3_BUFGP_BUFG_I0_INV,
      I1 => GND,
      S => g3_BUFGP_BUFG_S_INVNOT,
      O => g3_BUFGP
    );
  g3_BUFGP_BUFG_SINV : X_INV
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => g3_BUFGP_BUFG_S_INVNOT
    );
  g3_BUFGP_BUFG_I0_USED : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => g3_INBUF,
      O => g3_BUFGP_BUFG_I0_INV
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
  g_BUFGP_BUFG : X_BUFGMUX
    port map (
      I0 => g_BUFGP_BUFG_I0_INV,
      I1 => GND,
      S => g_BUFGP_BUFG_S_INVNOT,
      O => g_BUFGP
    );
  g_BUFGP_BUFG_SINV : X_INV
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => g_BUFGP_BUFG_S_INVNOT
    );
  g_BUFGP_BUFG_I0_USED : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => g_INBUF,
      O => g_BUFGP_BUFG_I0_INV
    );
  l1_1_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_1_IBUF_134,
      O => l1_1_DXMUX_495
    );
  l1_1_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_0_IBUF_131,
      O => l1_1_DYMUX_486
    );
  l1_1_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clr_IBUF_127,
      O => l1_1_SRINV_484
    );
  l1_1_CLKINV : X_INV
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => g_BUFGP,
      O => l1_1_CLKINVNOT
    );
  l1_1_CEINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => ge_IBUF_125,
      O => l1_1_CEINV_482
    );
  Mxor_l3_xor0000_Result1 : X_LUT4
    generic map(
      INIT => X"6666"
    )
    port map (
      ADR0 => d_1_IBUF_134,
      ADR1 => d_0_IBUF_131,
      ADR2 => VCC,
      ADR3 => VCC,
      O => l3_xor0000
    );
  l1_3_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_3_IBUF_136,
      O => l1_3_DXMUX_535
    );
  l1_3_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => d_2_IBUF_135,
      O => l1_3_DYMUX_526
    );
  l1_3_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clr_IBUF_127,
      O => l1_3_SRINV_524
    );
  l1_3_CLKINV : X_INV
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => g_BUFGP,
      O => l1_3_CLKINVNOT
    );
  l1_3_CEINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => ge_IBUF_125,
      O => l1_3_CEINV_522
    );
  l1_0_1 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      I => q1_0_OUTPUT_OFF_ODDRIN1_MUX,
      GE => q1_0_OUTPUT_OFF_PCICE_MUX_199,
      CLK => NlwInverterSignal_l1_0_1_CLK,
      SET => GND,
      RST => q1_0_OUTPUT_OFF_OFF1_RSTAND_206,
      O => l1_0_1_204
    );
  q1_0_OUTPUT_OFF_OFF1_RSTAND : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clr_IBUF_127,
      O => q1_0_OUTPUT_OFF_OFF1_RSTAND_206
    );
  l1_1 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      I => l1_1_DXMUX_495,
      GE => l1_1_CEINV_482,
      CLK => NlwInverterSignal_l1_1_CLK,
      SET => GND,
      RST => l1_1_SRINV_484,
      O => l1(1)
    );
  l1_2 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      I => l1_3_DYMUX_526,
      GE => l1_3_CEINV_522,
      CLK => NlwInverterSignal_l1_2_CLK,
      SET => GND,
      RST => l1_3_SRINV_524,
      O => l1(2)
    );
  l1_3 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      I => l1_3_DXMUX_535,
      GE => l1_3_CEINV_522,
      CLK => NlwInverterSignal_l1_3_CLK,
      SET => GND,
      RST => l1_3_SRINV_524,
      O => l1(3)
    );
  l1_1_1 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      I => q1_1_OUTPUT_OFF_ODDRIN1_MUX,
      GE => q1_1_OUTPUT_OFF_PCICE_MUX_247,
      CLK => NlwInverterSignal_l1_1_1_CLK,
      SET => GND,
      RST => q1_1_OUTPUT_OFF_OFF1_RSTAND_254,
      O => l1_1_1_252
    );
  q1_1_OUTPUT_OFF_OFF1_RSTAND : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clr_IBUF_127,
      O => q1_1_OUTPUT_OFF_OFF1_RSTAND_254
    );
  l1_2_1 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      I => q1_2_OUTPUT_OFF_ODDRIN1_MUX,
      GE => q1_2_OUTPUT_OFF_PCICE_MUX_278,
      CLK => NlwInverterSignal_l1_2_1_CLK,
      SET => GND,
      RST => q1_2_OUTPUT_OFF_OFF1_RSTAND_285,
      O => l1_2_1_283
    );
  q1_2_OUTPUT_OFF_OFF1_RSTAND : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clr_IBUF_127,
      O => q1_2_OUTPUT_OFF_OFF1_RSTAND_285
    );
  l1_3_1 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      I => q1_3_OUTPUT_OFF_ODDRIN1_MUX,
      GE => q1_3_OUTPUT_OFF_PCICE_MUX_309,
      CLK => NlwInverterSignal_l1_3_1_CLK,
      SET => GND,
      RST => q1_3_OUTPUT_OFF_OFF1_RSTAND_316,
      O => l1_3_1_314
    );
  q1_3_OUTPUT_OFF_OFF1_RSTAND : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clr_IBUF_127,
      O => q1_3_OUTPUT_OFF_OFF1_RSTAND_316
    );
  l1_0 : X_LATCHE
    generic map(
      INIT => '0'
    )
    port map (
      I => l1_1_DYMUX_486,
      GE => l1_1_CEINV_482,
      CLK => NlwInverterSignal_l1_0_CLK,
      SET => GND,
      RST => l1_1_SRINV_484,
      O => l1(0)
    );
  l2_0 : X_LATCHE
    generic map(
      INIT => '1'
    )
    port map (
      I => q2_0_OUTPUT_OFF_ODDRIN1_MUX,
      GE => VCC,
      CLK => NlwInverterSignal_l2_0_CLK,
      SET => q2_0_OUTPUT_OFF_OFF1_SET,
      RST => GND,
      O => l2(0)
    );
  q2_0_OUTPUT_OFF_OFF1_SETOR : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => pre_IBUF_129,
      O => q2_0_OUTPUT_OFF_OFF1_SET
    );
  l2_1 : X_LATCHE
    generic map(
      INIT => '1'
    )
    port map (
      I => q2_1_OUTPUT_OFF_ODDRIN1_MUX,
      GE => VCC,
      CLK => NlwInverterSignal_l2_1_CLK,
      SET => q2_1_OUTPUT_OFF_OFF1_SET,
      RST => GND,
      O => l2(1)
    );
  q2_1_OUTPUT_OFF_OFF1_SETOR : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => pre_IBUF_129,
      O => q2_1_OUTPUT_OFF_OFF1_SET
    );
  NlwBlock_top_VCC : X_ONE
    port map (
      O => VCC
    );
  NlwInverterBlock_l3_CLK : X_INV
    port map (
      I => q3_OUTPUT_OTCLK1INVNOT,
      O => NlwInverterSignal_l3_CLK
    );
  NlwBlock_top_GND : X_ZERO
    port map (
      O => GND
    );
  NlwInverterBlock_l1_0_1_CLK : X_INV
    port map (
      I => q1_0_OUTPUT_OTCLK1INVNOT,
      O => NlwInverterSignal_l1_0_1_CLK
    );
  NlwInverterBlock_l1_1_CLK : X_INV
    port map (
      I => l1_1_CLKINVNOT,
      O => NlwInverterSignal_l1_1_CLK
    );
  NlwInverterBlock_l1_2_CLK : X_INV
    port map (
      I => l1_3_CLKINVNOT,
      O => NlwInverterSignal_l1_2_CLK
    );
  NlwInverterBlock_l1_3_CLK : X_INV
    port map (
      I => l1_3_CLKINVNOT,
      O => NlwInverterSignal_l1_3_CLK
    );
  NlwInverterBlock_l1_1_1_CLK : X_INV
    port map (
      I => q1_1_OUTPUT_OTCLK1INVNOT,
      O => NlwInverterSignal_l1_1_1_CLK
    );
  NlwInverterBlock_l1_2_1_CLK : X_INV
    port map (
      I => q1_2_OUTPUT_OTCLK1INVNOT,
      O => NlwInverterSignal_l1_2_1_CLK
    );
  NlwInverterBlock_l1_3_1_CLK : X_INV
    port map (
      I => q1_3_OUTPUT_OTCLK1INVNOT,
      O => NlwInverterSignal_l1_3_1_CLK
    );
  NlwInverterBlock_l1_0_CLK : X_INV
    port map (
      I => l1_1_CLKINVNOT,
      O => NlwInverterSignal_l1_0_CLK
    );
  NlwInverterBlock_l2_0_CLK : X_INV
    port map (
      I => q2_0_OUTPUT_OTCLK1INV_331,
      O => NlwInverterSignal_l2_0_CLK
    );
  NlwInverterBlock_l2_1_CLK : X_INV
    port map (
      I => q2_1_OUTPUT_OTCLK1INV_355,
      O => NlwInverterSignal_l2_1_CLK
    );
  NlwBlockROC : X_ROC
    port map (O => GSR);
  NlwBlockTOC : X_TOC
    port map (O => GTS);

end STRUCTURE;

