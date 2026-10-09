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
-- Device	: 3s500efg320-4
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
    oe2 : in STD_LOGIC := 'X';
    oe : in STD_LOGIC := 'X';
    io : inout STD_LOGIC_VECTOR ( 7 downto 0 );
    z : out STD_LOGIC_VECTOR ( 3 downto 0 );
    din_r : out STD_LOGIC_VECTOR ( 7 downto 0 );
    dout : in STD_LOGIC_VECTOR ( 7 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal N01 : STD_LOGIC;
  signal N11 : STD_LOGIC;
  signal N2 : STD_LOGIC;
  signal N3 : STD_LOGIC;
  signal N4 : STD_LOGIC;
  signal N5 : STD_LOGIC;
  signal N6 : STD_LOGIC;
  signal N7 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal dout_0_IBUF_69 : STD_LOGIC;
  signal dout_1_IBUF_70 : STD_LOGIC;
  signal dout_2_IBUF_71 : STD_LOGIC;
  signal dout_3_IBUF_72 : STD_LOGIC;
  signal dout_4_IBUF_73 : STD_LOGIC;
  signal dout_5_IBUF_74 : STD_LOGIC;
  signal dout_6_IBUF_75 : STD_LOGIC;
  signal dout_7_IBUF_76 : STD_LOGIC;
  signal oe2_IBUF_87 : STD_LOGIC;
  signal oe_IBUF_88 : STD_LOGIC;
  signal oe_inv : STD_LOGIC;
  signal oe_r_90 : STD_LOGIC;
  signal oe_r_inv : STD_LOGIC;
  signal z_0_OBUFT_96 : STD_LOGIC;
  signal z_1_OBUFT_97 : STD_LOGIC;
  signal z_2_OBUFT_98 : STD_LOGIC;
  signal z_3_OBUFT_99 : STD_LOGIC;
  signal clk_BUFGP_IBUFG_34 : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal cap : STD_LOGIC_VECTOR ( 7 downto 0 );
begin
  oe_r : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => oe2_IBUF_87,
      O => oe_r_90,
      CE => VCC,
      SET => GND,
      RST => GND
    );
  cap_0 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => N7,
      O => cap(0),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  cap_1 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => N6,
      O => cap(1),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  cap_2 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => N5,
      O => cap(2),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  cap_3 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => N4,
      O => cap(3),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  cap_4 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => N3,
      O => cap(4),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  cap_5 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => N2,
      O => cap(5),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  cap_6 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => N11,
      O => cap(6),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  cap_7 : X_FF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => N01,
      O => cap(7),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  Mxor_z_xor0000_Result_3_1 : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => dout_7_IBUF_76,
      ADR1 => dout_3_IBUF_72,
      O => z_3_OBUFT_99
    );
  Mxor_z_xor0000_Result_2_1 : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => dout_6_IBUF_75,
      ADR1 => dout_2_IBUF_71,
      O => z_2_OBUFT_98
    );
  Mxor_z_xor0000_Result_1_1 : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => dout_5_IBUF_74,
      ADR1 => dout_1_IBUF_70,
      O => z_1_OBUFT_97
    );
  Mxor_z_xor0000_Result_0_1 : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => dout_4_IBUF_73,
      ADR1 => dout_0_IBUF_69,
      O => z_0_OBUFT_96
    );
  oe2_IBUF : X_BUF
    port map (
      I => oe2,
      O => oe2_IBUF_87
    );
  oe_IBUF : X_BUF
    port map (
      I => oe,
      O => oe_IBUF_88
    );
  dout_7_IBUF : X_BUF
    port map (
      I => dout(7),
      O => dout_7_IBUF_76
    );
  dout_6_IBUF : X_BUF
    port map (
      I => dout(6),
      O => dout_6_IBUF_75
    );
  dout_5_IBUF : X_BUF
    port map (
      I => dout(5),
      O => dout_5_IBUF_74
    );
  dout_4_IBUF : X_BUF
    port map (
      I => dout(4),
      O => dout_4_IBUF_73
    );
  dout_3_IBUF : X_BUF
    port map (
      I => dout(3),
      O => dout_3_IBUF_72
    );
  dout_2_IBUF : X_BUF
    port map (
      I => dout(2),
      O => dout_2_IBUF_71
    );
  dout_1_IBUF : X_BUF
    port map (
      I => dout(1),
      O => dout_1_IBUF_70
    );
  dout_0_IBUF : X_BUF
    port map (
      I => dout(0),
      O => dout_0_IBUF_69
    );
  oe_inv1_INV_0 : X_INV
    port map (
      I => oe_IBUF_88,
      O => oe_inv
    );
  oe_r_inv1_INV_0 : X_INV
    port map (
      I => oe_r_90,
      O => oe_r_inv
    );
  io_7_IOBUF_IBUF : X_BUF
    port map (
      I => io(7),
      O => N01
    );
  io_6_IOBUF_IBUF : X_BUF
    port map (
      I => io(6),
      O => N11
    );
  io_5_IOBUF_IBUF : X_BUF
    port map (
      I => io(5),
      O => N2
    );
  io_4_IOBUF_IBUF : X_BUF
    port map (
      I => io(4),
      O => N3
    );
  io_3_IOBUF_IBUF : X_BUF
    port map (
      I => io(3),
      O => N4
    );
  io_2_IOBUF_IBUF : X_BUF
    port map (
      I => io(2),
      O => N5
    );
  io_1_IOBUF_IBUF : X_BUF
    port map (
      I => io(1),
      O => N6
    );
  io_0_IOBUF_IBUF : X_BUF
    port map (
      I => io(0),
      O => N7
    );
  clk_BUFGP_BUFG : X_CKBUF
    port map (
      I => clk_BUFGP_IBUFG_34,
      O => clk_BUFGP
    );
  clk_BUFGP_IBUFG : X_CKBUF
    port map (
      I => clk,
      O => clk_BUFGP_IBUFG_34
    );
  din_r_0_OBUF : X_OBUF
    port map (
      I => cap(0),
      O => din_r(0)
    );
  din_r_1_OBUF : X_OBUF
    port map (
      I => cap(1),
      O => din_r(1)
    );
  din_r_2_OBUF : X_OBUF
    port map (
      I => cap(2),
      O => din_r(2)
    );
  din_r_3_OBUF : X_OBUF
    port map (
      I => cap(3),
      O => din_r(3)
    );
  din_r_4_OBUF : X_OBUF
    port map (
      I => cap(4),
      O => din_r(4)
    );
  din_r_5_OBUF : X_OBUF
    port map (
      I => cap(5),
      O => din_r(5)
    );
  din_r_6_OBUF : X_OBUF
    port map (
      I => cap(6),
      O => din_r(6)
    );
  din_r_7_OBUF : X_OBUF
    port map (
      I => cap(7),
      O => din_r(7)
    );
  io_0_IOBUF_OBUFT : X_OBUFT
    port map (
      I => dout_0_IBUF_69,
      CTL => oe_inv,
      O => io(0)
    );
  io_1_IOBUF_OBUFT : X_OBUFT
    port map (
      I => dout_1_IBUF_70,
      CTL => oe_inv,
      O => io(1)
    );
  io_2_IOBUF_OBUFT : X_OBUFT
    port map (
      I => dout_2_IBUF_71,
      CTL => oe_inv,
      O => io(2)
    );
  io_3_IOBUF_OBUFT : X_OBUFT
    port map (
      I => dout_3_IBUF_72,
      CTL => oe_inv,
      O => io(3)
    );
  io_4_IOBUF_OBUFT : X_OBUFT
    port map (
      I => dout_4_IBUF_73,
      CTL => oe_inv,
      O => io(4)
    );
  io_5_IOBUF_OBUFT : X_OBUFT
    port map (
      I => dout_5_IBUF_74,
      CTL => oe_inv,
      O => io(5)
    );
  io_6_IOBUF_OBUFT : X_OBUFT
    port map (
      I => dout_6_IBUF_75,
      CTL => oe_inv,
      O => io(6)
    );
  io_7_IOBUF_OBUFT : X_OBUFT
    port map (
      I => dout_7_IBUF_76,
      CTL => oe_inv,
      O => io(7)
    );
  z_0_OBUFT : X_OBUFT
    port map (
      I => z_0_OBUFT_96,
      CTL => oe_r_inv,
      O => z(0)
    );
  z_1_OBUFT : X_OBUFT
    port map (
      I => z_1_OBUFT_97,
      CTL => oe_r_inv,
      O => z(1)
    );
  z_2_OBUFT : X_OBUFT
    port map (
      I => z_2_OBUFT_98,
      CTL => oe_r_inv,
      O => z(2)
    );
  z_3_OBUFT : X_OBUFT
    port map (
      I => z_3_OBUFT_99,
      CTL => oe_r_inv,
      O => z(3)
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

