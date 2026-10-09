--------------------------------------------------------------------------------
-- Copyright (c) 1995-2013 Xilinx, Inc.  All rights reserved.
--------------------------------------------------------------------------------
--   ____  ____
--  /   /\/   /
-- /___/  \  /    Vendor: Xilinx
-- \   \   \/     Version: P.20131013
--  \   \         Application: netgen
--  /   /         Filename: top_timesim.vhd
-- /___/   /\     Timestamp: (removed)
-- \   \  /  \
--  \___\/\___\
--
-- Command	: -intstyle xflow -sim -ofmt vhdl -w -pcf top.pcf top.ncd netgen/par/top_timesim.vhd
-- Device	: 3s500efg320-4 (PRODUCTION 1.27 2013-10-13)
-- Input file	: top.ncd
-- Output file	: netgen/par/top_timesim.vhd
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
    oe2 : in STD_LOGIC := 'X';
    oe : in STD_LOGIC := 'X';
    io : inout STD_LOGIC_VECTOR ( 7 downto 0 );
    z : out STD_LOGIC_VECTOR ( 3 downto 0 );
    din_r : out STD_LOGIC_VECTOR ( 7 downto 0 );
    dout : in STD_LOGIC_VECTOR ( 7 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal clk_BUFGP : STD_LOGIC;
  signal oe_IBUF_153 : STD_LOGIC;
  signal dout_0_IBUF_154 : STD_LOGIC;
  signal dout_1_IBUF_156 : STD_LOGIC;
  signal dout_2_IBUF_158 : STD_LOGIC;
  signal dout_3_IBUF_160 : STD_LOGIC;
  signal dout_4_IBUF_162 : STD_LOGIC;
  signal dout_5_IBUF_164 : STD_LOGIC;
  signal dout_6_IBUF_165 : STD_LOGIC;
  signal dout_7_IBUF_166 : STD_LOGIC;
  signal oe_r_168 : STD_LOGIC;
  signal clk_INBUF : STD_LOGIC;
  signal din_r_0_O : STD_LOGIC;
  signal din_r_0_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal din_r_0_OUTPUT_OTCLK1INV_187 : STD_LOGIC;
  signal din_r_1_O : STD_LOGIC;
  signal din_r_1_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal din_r_1_OUTPUT_OTCLK1INV_204 : STD_LOGIC;
  signal din_r_2_O : STD_LOGIC;
  signal din_r_2_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal din_r_2_OUTPUT_OTCLK1INV_221 : STD_LOGIC;
  signal oe_INBUF : STD_LOGIC;
  signal dout_0_INBUF : STD_LOGIC;
  signal din_r_3_O : STD_LOGIC;
  signal din_r_3_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal din_r_3_OUTPUT_OTCLK1INV_250 : STD_LOGIC;
  signal dout_1_INBUF : STD_LOGIC;
  signal din_r_4_O : STD_LOGIC;
  signal din_r_4_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal din_r_4_OUTPUT_OTCLK1INV_273 : STD_LOGIC;
  signal dout_2_INBUF : STD_LOGIC;
  signal din_r_5_O : STD_LOGIC;
  signal din_r_5_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal din_r_5_OUTPUT_OTCLK1INV_296 : STD_LOGIC;
  signal dout_3_INBUF : STD_LOGIC;
  signal din_r_6_O : STD_LOGIC;
  signal din_r_6_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal din_r_6_OUTPUT_OTCLK1INV_319 : STD_LOGIC;
  signal dout_4_INBUF : STD_LOGIC;
  signal din_r_7_O : STD_LOGIC;
  signal din_r_7_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal din_r_7_OUTPUT_OTCLK1INV_342 : STD_LOGIC;
  signal dout_5_INBUF : STD_LOGIC;
  signal dout_6_INBUF : STD_LOGIC;
  signal dout_7_INBUF : STD_LOGIC;
  signal io_0_O : STD_LOGIC;
  signal io_0_T : STD_LOGIC;
  signal io_0_INBUF : STD_LOGIC;
  signal io_1_O : STD_LOGIC;
  signal io_1_T : STD_LOGIC;
  signal io_1_INBUF : STD_LOGIC;
  signal io_2_O : STD_LOGIC;
  signal io_2_T : STD_LOGIC;
  signal io_2_INBUF : STD_LOGIC;
  signal io_3_O : STD_LOGIC;
  signal io_3_T : STD_LOGIC;
  signal io_3_INBUF : STD_LOGIC;
  signal io_4_O : STD_LOGIC;
  signal io_4_T : STD_LOGIC;
  signal io_4_INBUF : STD_LOGIC;
  signal io_5_O : STD_LOGIC;
  signal io_5_T : STD_LOGIC;
  signal io_5_INBUF : STD_LOGIC;
  signal io_6_O : STD_LOGIC;
  signal io_6_T : STD_LOGIC;
  signal io_6_INBUF : STD_LOGIC;
  signal io_7_O : STD_LOGIC;
  signal io_7_T : STD_LOGIC;
  signal io_7_INBUF : STD_LOGIC;
  signal z_0_O : STD_LOGIC;
  signal z_0_T : STD_LOGIC;
  signal z_1_O : STD_LOGIC;
  signal z_1_T : STD_LOGIC;
  signal z_2_O : STD_LOGIC;
  signal z_2_T : STD_LOGIC;
  signal z_3_O : STD_LOGIC;
  signal z_3_T : STD_LOGIC;
  signal oe2_INBUF : STD_LOGIC;
  signal oe2_IFF_ICLK1INV_610 : STD_LOGIC;
  signal oe2_IFF_IDDRIN_MUX_608 : STD_LOGIC;
  signal clk_BUFGP_BUFG_S_INVNOT : STD_LOGIC;
  signal clk_BUFGP_BUFG_I0_INV : STD_LOGIC;
  signal z_0_OBUFT_631 : STD_LOGIC;
  signal z_1_OBUFT_643 : STD_LOGIC;
  signal z_2_OBUFT_655 : STD_LOGIC;
  signal z_3_OBUFT_667 : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal cap : STD_LOGIC_VECTOR ( 7 downto 0 );
begin
  clk_BUFGP_IBUFG : X_BUF
    generic map(
      LOC => "IPAD29",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk,
      O => clk_INBUF
    );
  din_r_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD40"
    )
    port map (
      I => din_r_0_O,
      O => din_r(0)
    );
  din_r_0_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD40",
      PATHPULSE => 638 ps
    )
    port map (
      I => io_0_INBUF,
      O => din_r_0_OUTPUT_OFF_ODDRIN1_MUX
    );
  din_r_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD40",
      PATHPULSE => 638 ps
    )
    port map (
      I => cap(0),
      O => din_r_0_O
    );
  cap_0 : X_FF
    generic map(
      LOC => "PAD40",
      INIT => '0'
    )
    port map (
      I => din_r_0_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => din_r_0_OUTPUT_OTCLK1INV_187,
      SET => GND,
      RST => GND,
      O => cap(0)
    );
  din_r_0_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD40",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => din_r_0_OUTPUT_OTCLK1INV_187
    );
  din_r_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD41"
    )
    port map (
      I => din_r_1_O,
      O => din_r(1)
    );
  din_r_1_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD41",
      PATHPULSE => 638 ps
    )
    port map (
      I => io_1_INBUF,
      O => din_r_1_OUTPUT_OFF_ODDRIN1_MUX
    );
  din_r_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD41",
      PATHPULSE => 638 ps
    )
    port map (
      I => cap(1),
      O => din_r_1_O
    );
  cap_1 : X_FF
    generic map(
      LOC => "PAD41",
      INIT => '0'
    )
    port map (
      I => din_r_1_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => din_r_1_OUTPUT_OTCLK1INV_204,
      SET => GND,
      RST => GND,
      O => cap(1)
    );
  din_r_1_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD41",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => din_r_1_OUTPUT_OTCLK1INV_204
    );
  din_r_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD44"
    )
    port map (
      I => din_r_2_O,
      O => din_r(2)
    );
  din_r_2_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD44",
      PATHPULSE => 638 ps
    )
    port map (
      I => io_2_INBUF,
      O => din_r_2_OUTPUT_OFF_ODDRIN1_MUX
    );
  din_r_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD44",
      PATHPULSE => 638 ps
    )
    port map (
      I => cap(2),
      O => din_r_2_O
    );
  cap_2 : X_FF
    generic map(
      LOC => "PAD44",
      INIT => '0'
    )
    port map (
      I => din_r_2_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => din_r_2_OUTPUT_OTCLK1INV_221,
      SET => GND,
      RST => GND,
      O => cap(2)
    );
  din_r_2_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD44",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => din_r_2_OUTPUT_OTCLK1INV_221
    );
  oe_IBUF : X_BUF
    generic map(
      LOC => "PAD2",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe,
      O => oe_INBUF
    );
  oe_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD2",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe_INBUF,
      O => oe_IBUF_153
    );
  dout_0_IBUF : X_BUF
    generic map(
      LOC => "PAD5",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout(0),
      O => dout_0_INBUF
    );
  dout_0_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD5",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_0_INBUF,
      O => dout_0_IBUF_154
    );
  din_r_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD45"
    )
    port map (
      I => din_r_3_O,
      O => din_r(3)
    );
  din_r_3_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD45",
      PATHPULSE => 638 ps
    )
    port map (
      I => io_3_INBUF,
      O => din_r_3_OUTPUT_OFF_ODDRIN1_MUX
    );
  din_r_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD45",
      PATHPULSE => 638 ps
    )
    port map (
      I => cap(3),
      O => din_r_3_O
    );
  cap_3 : X_FF
    generic map(
      LOC => "PAD45",
      INIT => '0'
    )
    port map (
      I => din_r_3_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => din_r_3_OUTPUT_OTCLK1INV_250,
      SET => GND,
      RST => GND,
      O => cap(3)
    );
  din_r_3_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD45",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => din_r_3_OUTPUT_OTCLK1INV_250
    );
  dout_1_IBUF : X_BUF
    generic map(
      LOC => "PAD6",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout(1),
      O => dout_1_INBUF
    );
  dout_1_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD6",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_1_INBUF,
      O => dout_1_IBUF_156
    );
  din_r_4_OBUF : X_OBUF
    generic map(
      LOC => "PAD48"
    )
    port map (
      I => din_r_4_O,
      O => din_r(4)
    );
  din_r_4_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD48",
      PATHPULSE => 638 ps
    )
    port map (
      I => io_4_INBUF,
      O => din_r_4_OUTPUT_OFF_ODDRIN1_MUX
    );
  din_r_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD48",
      PATHPULSE => 638 ps
    )
    port map (
      I => cap(4),
      O => din_r_4_O
    );
  cap_4 : X_FF
    generic map(
      LOC => "PAD48",
      INIT => '0'
    )
    port map (
      I => din_r_4_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => din_r_4_OUTPUT_OTCLK1INV_273,
      SET => GND,
      RST => GND,
      O => cap(4)
    );
  din_r_4_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD48",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => din_r_4_OUTPUT_OTCLK1INV_273
    );
  dout_2_IBUF : X_BUF
    generic map(
      LOC => "PAD8",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout(2),
      O => dout_2_INBUF
    );
  dout_2_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD8",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_2_INBUF,
      O => dout_2_IBUF_158
    );
  din_r_5_OBUF : X_OBUF
    generic map(
      LOC => "PAD49"
    )
    port map (
      I => din_r_5_O,
      O => din_r(5)
    );
  din_r_5_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD49",
      PATHPULSE => 638 ps
    )
    port map (
      I => io_5_INBUF,
      O => din_r_5_OUTPUT_OFF_ODDRIN1_MUX
    );
  din_r_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD49",
      PATHPULSE => 638 ps
    )
    port map (
      I => cap(5),
      O => din_r_5_O
    );
  cap_5 : X_FF
    generic map(
      LOC => "PAD49",
      INIT => '0'
    )
    port map (
      I => din_r_5_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => din_r_5_OUTPUT_OTCLK1INV_296,
      SET => GND,
      RST => GND,
      O => cap(5)
    );
  din_r_5_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD49",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => din_r_5_OUTPUT_OTCLK1INV_296
    );
  dout_3_IBUF : X_BUF
    generic map(
      LOC => "PAD11",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout(3),
      O => dout_3_INBUF
    );
  dout_3_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD11",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_3_INBUF,
      O => dout_3_IBUF_160
    );
  din_r_6_OBUF : X_OBUF
    generic map(
      LOC => "PAD50"
    )
    port map (
      I => din_r_6_O,
      O => din_r(6)
    );
  din_r_6_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD50",
      PATHPULSE => 638 ps
    )
    port map (
      I => io_6_INBUF,
      O => din_r_6_OUTPUT_OFF_ODDRIN1_MUX
    );
  din_r_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD50",
      PATHPULSE => 638 ps
    )
    port map (
      I => cap(6),
      O => din_r_6_O
    );
  cap_6 : X_FF
    generic map(
      LOC => "PAD50",
      INIT => '0'
    )
    port map (
      I => din_r_6_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => din_r_6_OUTPUT_OTCLK1INV_319,
      SET => GND,
      RST => GND,
      O => cap(6)
    );
  din_r_6_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD50",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => din_r_6_OUTPUT_OTCLK1INV_319
    );
  dout_4_IBUF : X_BUF
    generic map(
      LOC => "PAD12",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout(4),
      O => dout_4_INBUF
    );
  dout_4_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD12",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_4_INBUF,
      O => dout_4_IBUF_162
    );
  din_r_7_OBUF : X_OBUF
    generic map(
      LOC => "PAD51"
    )
    port map (
      I => din_r_7_O,
      O => din_r(7)
    );
  din_r_7_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD51",
      PATHPULSE => 638 ps
    )
    port map (
      I => io_7_INBUF,
      O => din_r_7_OUTPUT_OFF_ODDRIN1_MUX
    );
  din_r_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD51",
      PATHPULSE => 638 ps
    )
    port map (
      I => cap(7),
      O => din_r_7_O
    );
  cap_7 : X_FF
    generic map(
      LOC => "PAD51",
      INIT => '0'
    )
    port map (
      I => din_r_7_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => din_r_7_OUTPUT_OTCLK1INV_342,
      SET => GND,
      RST => GND,
      O => cap(7)
    );
  din_r_7_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD51",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => din_r_7_OUTPUT_OTCLK1INV_342
    );
  dout_5_IBUF : X_BUF
    generic map(
      LOC => "PAD15",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout(5),
      O => dout_5_INBUF
    );
  dout_5_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD15",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_5_INBUF,
      O => dout_5_IBUF_164
    );
  dout_6_IBUF : X_BUF
    generic map(
      LOC => "PAD17",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout(6),
      O => dout_6_INBUF
    );
  dout_6_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD17",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_6_INBUF,
      O => dout_6_IBUF_165
    );
  dout_7_IBUF : X_BUF
    generic map(
      LOC => "PAD18",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout(7),
      O => dout_7_INBUF
    );
  dout_7_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD18",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_7_INBUF,
      O => dout_7_IBUF_166
    );
  io_0_IOBUF_OBUFT : X_OBUFT
    generic map(
      LOC => "PAD19"
    )
    port map (
      I => io_0_O,
      CTL => io_0_T,
      O => io(0)
    );
  io_0_IOBUF_IBUF : X_BUF
    generic map(
      LOC => "PAD19",
      PATHPULSE => 638 ps
    )
    port map (
      I => io(0),
      O => io_0_INBUF
    );
  io_1_IOBUF_OBUFT : X_OBUFT
    generic map(
      LOC => "PAD20"
    )
    port map (
      I => io_1_O,
      CTL => io_1_T,
      O => io(1)
    );
  io_1_IOBUF_IBUF : X_BUF
    generic map(
      LOC => "PAD20",
      PATHPULSE => 638 ps
    )
    port map (
      I => io(1),
      O => io_1_INBUF
    );
  io_2_IOBUF_OBUFT : X_OBUFT
    generic map(
      LOC => "PAD23"
    )
    port map (
      I => io_2_O,
      CTL => io_2_T,
      O => io(2)
    );
  io_2_IOBUF_IBUF : X_BUF
    generic map(
      LOC => "PAD23",
      PATHPULSE => 638 ps
    )
    port map (
      I => io(2),
      O => io_2_INBUF
    );
  io_3_IOBUF_OBUFT : X_OBUFT
    generic map(
      LOC => "PAD24"
    )
    port map (
      I => io_3_O,
      CTL => io_3_T,
      O => io(3)
    );
  io_3_IOBUF_IBUF : X_BUF
    generic map(
      LOC => "PAD24",
      PATHPULSE => 638 ps
    )
    port map (
      I => io(3),
      O => io_3_INBUF
    );
  io_4_IOBUF_OBUFT : X_OBUFT
    generic map(
      LOC => "PAD25"
    )
    port map (
      I => io_4_O,
      CTL => io_4_T,
      O => io(4)
    );
  io_4_IOBUF_IBUF : X_BUF
    generic map(
      LOC => "PAD25",
      PATHPULSE => 638 ps
    )
    port map (
      I => io(4),
      O => io_4_INBUF
    );
  io_5_IOBUF_OBUFT : X_OBUFT
    generic map(
      LOC => "PAD37"
    )
    port map (
      I => io_5_O,
      CTL => io_5_T,
      O => io(5)
    );
  io_5_IOBUF_IBUF : X_BUF
    generic map(
      LOC => "PAD37",
      PATHPULSE => 638 ps
    )
    port map (
      I => io(5),
      O => io_5_INBUF
    );
  io_6_IOBUF_OBUFT : X_OBUFT
    generic map(
      LOC => "PAD38"
    )
    port map (
      I => io_6_O,
      CTL => io_6_T,
      O => io(6)
    );
  io_6_IOBUF_IBUF : X_BUF
    generic map(
      LOC => "PAD38",
      PATHPULSE => 638 ps
    )
    port map (
      I => io(6),
      O => io_6_INBUF
    );
  io_7_IOBUF_OBUFT : X_OBUFT
    generic map(
      LOC => "PAD39"
    )
    port map (
      I => io_7_O,
      CTL => io_7_T,
      O => io(7)
    );
  io_7_IOBUF_IBUF : X_BUF
    generic map(
      LOC => "PAD39",
      PATHPULSE => 638 ps
    )
    port map (
      I => io(7),
      O => io_7_INBUF
    );
  z_0_OBUFT : X_OBUFT
    generic map(
      LOC => "PAD53"
    )
    port map (
      I => z_0_O,
      CTL => z_0_T,
      O => z(0)
    );
  z_1_OBUFT : X_OBUFT
    generic map(
      LOC => "PAD56"
    )
    port map (
      I => z_1_O,
      CTL => z_1_T,
      O => z(1)
    );
  z_2_OBUFT : X_OBUFT
    generic map(
      LOC => "PAD57"
    )
    port map (
      I => z_2_O,
      CTL => z_2_T,
      O => z(2)
    );
  z_3_OBUFT : X_OBUFT
    generic map(
      LOC => "PAD65"
    )
    port map (
      I => z_3_O,
      CTL => z_3_T,
      O => z(3)
    );
  oe2_IBUF : X_BUF
    generic map(
      LOC => "PAD4",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe2,
      O => oe2_INBUF
    );
  oe_r : X_FF
    generic map(
      LOC => "PAD4",
      INIT => '0'
    )
    port map (
      I => oe2_IFF_IDDRIN_MUX_608,
      CE => VCC,
      CLK => oe2_IFF_ICLK1INV_610,
      SET => GND,
      RST => GND,
      O => oe_r_168
    );
  oe2_IFF_IDDRIN_MUX : X_BUF
    generic map(
      LOC => "PAD4",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe2_INBUF,
      O => oe2_IFF_IDDRIN_MUX_608
    );
  oe2_IFF_ICLK1INV : X_BUF
    generic map(
      LOC => "PAD4",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => oe2_IFF_ICLK1INV_610
    );
  clk_BUFGP_BUFG : X_BUFGMUX
    generic map(
      LOC => "BUFGMUX_X2Y11"
    )
    port map (
      I0 => clk_BUFGP_BUFG_I0_INV,
      I1 => GND,
      S => clk_BUFGP_BUFG_S_INVNOT,
      O => clk_BUFGP
    );
  clk_BUFGP_BUFG_SINV : X_INV
    generic map(
      LOC => "BUFGMUX_X2Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => clk_BUFGP_BUFG_S_INVNOT
    );
  clk_BUFGP_BUFG_I0_USED : X_BUF
    generic map(
      LOC => "BUFGMUX_X2Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_INBUF,
      O => clk_BUFGP_BUFG_I0_INV
    );
  Mxor_z_xor0000_Result_0_1 : X_LUT4
    generic map(
      INIT => X"5A5A",
      LOC => "SLICE_X23Y91"
    )
    port map (
      ADR0 => dout_0_IBUF_154,
      ADR1 => VCC,
      ADR2 => dout_4_IBUF_162,
      ADR3 => VCC,
      O => z_0_OBUFT_631
    );
  Mxor_z_xor0000_Result_1_1 : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X42Y91"
    )
    port map (
      ADR0 => dout_1_IBUF_156,
      ADR1 => dout_5_IBUF_164,
      ADR2 => VCC,
      ADR3 => VCC,
      O => z_1_OBUFT_643
    );
  Mxor_z_xor0000_Result_2_1 : X_LUT4
    generic map(
      INIT => X"33CC",
      LOC => "SLICE_X42Y90"
    )
    port map (
      ADR0 => VCC,
      ADR1 => dout_6_IBUF_165,
      ADR2 => VCC,
      ADR3 => dout_2_IBUF_158,
      O => z_2_OBUFT_655
    );
  Mxor_z_xor0000_Result_3_1 : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X45Y90"
    )
    port map (
      ADR0 => dout_3_IBUF_160,
      ADR1 => dout_7_IBUF_166,
      ADR2 => VCC,
      ADR3 => VCC,
      O => z_3_OBUFT_667
    );
  io_0_OUTPUT_TFF_TMUX : X_INV
    generic map(
      LOC => "PAD19",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe_IBUF_153,
      O => io_0_T
    );
  io_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD19",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_0_IBUF_154,
      O => io_0_O
    );
  io_1_OUTPUT_TFF_TMUX : X_INV
    generic map(
      LOC => "PAD20",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe_IBUF_153,
      O => io_1_T
    );
  io_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD20",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_1_IBUF_156,
      O => io_1_O
    );
  io_2_OUTPUT_TFF_TMUX : X_INV
    generic map(
      LOC => "PAD23",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe_IBUF_153,
      O => io_2_T
    );
  io_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD23",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_2_IBUF_158,
      O => io_2_O
    );
  io_3_OUTPUT_TFF_TMUX : X_INV
    generic map(
      LOC => "PAD24",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe_IBUF_153,
      O => io_3_T
    );
  io_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD24",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_3_IBUF_160,
      O => io_3_O
    );
  io_4_OUTPUT_TFF_TMUX : X_INV
    generic map(
      LOC => "PAD25",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe_IBUF_153,
      O => io_4_T
    );
  io_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD25",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_4_IBUF_162,
      O => io_4_O
    );
  io_5_OUTPUT_TFF_TMUX : X_INV
    generic map(
      LOC => "PAD37",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe_IBUF_153,
      O => io_5_T
    );
  io_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD37",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_5_IBUF_164,
      O => io_5_O
    );
  io_6_OUTPUT_TFF_TMUX : X_INV
    generic map(
      LOC => "PAD38",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe_IBUF_153,
      O => io_6_T
    );
  io_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD38",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_6_IBUF_165,
      O => io_6_O
    );
  io_7_OUTPUT_TFF_TMUX : X_INV
    generic map(
      LOC => "PAD39",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe_IBUF_153,
      O => io_7_T
    );
  io_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD39",
      PATHPULSE => 638 ps
    )
    port map (
      I => dout_7_IBUF_166,
      O => io_7_O
    );
  z_0_OUTPUT_TFF_TMUX : X_INV
    generic map(
      LOC => "PAD53",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe_r_168,
      O => z_0_T
    );
  z_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD53",
      PATHPULSE => 638 ps
    )
    port map (
      I => z_0_OBUFT_631,
      O => z_0_O
    );
  z_1_OUTPUT_TFF_TMUX : X_INV
    generic map(
      LOC => "PAD56",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe_r_168,
      O => z_1_T
    );
  z_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD56",
      PATHPULSE => 638 ps
    )
    port map (
      I => z_1_OBUFT_643,
      O => z_1_O
    );
  z_2_OUTPUT_TFF_TMUX : X_INV
    generic map(
      LOC => "PAD57",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe_r_168,
      O => z_2_T
    );
  z_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD57",
      PATHPULSE => 638 ps
    )
    port map (
      I => z_2_OBUFT_655,
      O => z_2_O
    );
  z_3_OUTPUT_TFF_TMUX : X_INV
    generic map(
      LOC => "PAD65",
      PATHPULSE => 638 ps
    )
    port map (
      I => oe_r_168,
      O => z_3_T
    );
  z_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD65",
      PATHPULSE => 638 ps
    )
    port map (
      I => z_3_OBUFT_667,
      O => z_3_O
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

