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
-- Device	: xc3s500e-4-fg320
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
  signal clk_BUFGP_17 : STD_LOGIC;
  signal dout_0_IBUF_34 : STD_LOGIC;
  signal dout_1_IBUF_35 : STD_LOGIC;
  signal dout_2_IBUF_36 : STD_LOGIC;
  signal dout_3_IBUF_37 : STD_LOGIC;
  signal dout_4_IBUF_38 : STD_LOGIC;
  signal dout_5_IBUF_39 : STD_LOGIC;
  signal dout_6_IBUF_40 : STD_LOGIC;
  signal dout_7_IBUF_41 : STD_LOGIC;
  signal oe2_IBUF_52 : STD_LOGIC;
  signal oe_IBUF_53 : STD_LOGIC;
  signal oe_inv : STD_LOGIC;
  signal oe_r_55 : STD_LOGIC;
  signal oe_r_inv : STD_LOGIC;
  signal z_0_OBUFT_61 : STD_LOGIC;
  signal z_1_OBUFT_62 : STD_LOGIC;
  signal z_2_OBUFT_63 : STD_LOGIC;
  signal z_3_OBUFT_64 : STD_LOGIC;
  signal cap : STD_LOGIC_VECTOR ( 7 downto 0 );
begin
  oe_r : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_17,
      D => oe2_IBUF_52,
      Q => oe_r_55
    );
  cap_0 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_17,
      D => N7,
      Q => cap(0)
    );
  cap_1 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_17,
      D => N6,
      Q => cap(1)
    );
  cap_2 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_17,
      D => N5,
      Q => cap(2)
    );
  cap_3 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_17,
      D => N4,
      Q => cap(3)
    );
  cap_4 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_17,
      D => N3,
      Q => cap(4)
    );
  cap_5 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_17,
      D => N2,
      Q => cap(5)
    );
  cap_6 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_17,
      D => N11,
      Q => cap(6)
    );
  cap_7 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_17,
      D => N01,
      Q => cap(7)
    );
  Mxor_z_xor0000_Result_3_1 : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => dout_7_IBUF_41,
      I1 => dout_3_IBUF_37,
      O => z_3_OBUFT_64
    );
  Mxor_z_xor0000_Result_2_1 : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => dout_6_IBUF_40,
      I1 => dout_2_IBUF_36,
      O => z_2_OBUFT_63
    );
  Mxor_z_xor0000_Result_1_1 : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => dout_5_IBUF_39,
      I1 => dout_1_IBUF_35,
      O => z_1_OBUFT_62
    );
  Mxor_z_xor0000_Result_0_1 : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => dout_4_IBUF_38,
      I1 => dout_0_IBUF_34,
      O => z_0_OBUFT_61
    );
  oe2_IBUF : IBUF
    port map (
      I => oe2,
      O => oe2_IBUF_52
    );
  oe_IBUF : IBUF
    port map (
      I => oe,
      O => oe_IBUF_53
    );
  dout_7_IBUF : IBUF
    port map (
      I => dout(7),
      O => dout_7_IBUF_41
    );
  dout_6_IBUF : IBUF
    port map (
      I => dout(6),
      O => dout_6_IBUF_40
    );
  dout_5_IBUF : IBUF
    port map (
      I => dout(5),
      O => dout_5_IBUF_39
    );
  dout_4_IBUF : IBUF
    port map (
      I => dout(4),
      O => dout_4_IBUF_38
    );
  dout_3_IBUF : IBUF
    port map (
      I => dout(3),
      O => dout_3_IBUF_37
    );
  dout_2_IBUF : IBUF
    port map (
      I => dout(2),
      O => dout_2_IBUF_36
    );
  dout_1_IBUF : IBUF
    port map (
      I => dout(1),
      O => dout_1_IBUF_35
    );
  dout_0_IBUF : IBUF
    port map (
      I => dout(0),
      O => dout_0_IBUF_34
    );
  io_7_IOBUF : IOBUF
    port map (
      I => dout_7_IBUF_41,
      T => oe_inv,
      O => N01,
      IO => io(7)
    );
  io_6_IOBUF : IOBUF
    port map (
      I => dout_6_IBUF_40,
      T => oe_inv,
      O => N11,
      IO => io(6)
    );
  io_5_IOBUF : IOBUF
    port map (
      I => dout_5_IBUF_39,
      T => oe_inv,
      O => N2,
      IO => io(5)
    );
  io_4_IOBUF : IOBUF
    port map (
      I => dout_4_IBUF_38,
      T => oe_inv,
      O => N3,
      IO => io(4)
    );
  io_3_IOBUF : IOBUF
    port map (
      I => dout_3_IBUF_37,
      T => oe_inv,
      O => N4,
      IO => io(3)
    );
  io_2_IOBUF : IOBUF
    port map (
      I => dout_2_IBUF_36,
      T => oe_inv,
      O => N5,
      IO => io(2)
    );
  io_1_IOBUF : IOBUF
    port map (
      I => dout_1_IBUF_35,
      T => oe_inv,
      O => N6,
      IO => io(1)
    );
  io_0_IOBUF : IOBUF
    port map (
      I => dout_0_IBUF_34,
      T => oe_inv,
      O => N7,
      IO => io(0)
    );
  z_3_OBUFT : OBUFT
    port map (
      I => z_3_OBUFT_64,
      T => oe_r_inv,
      O => z(3)
    );
  z_2_OBUFT : OBUFT
    port map (
      I => z_2_OBUFT_63,
      T => oe_r_inv,
      O => z(2)
    );
  z_1_OBUFT : OBUFT
    port map (
      I => z_1_OBUFT_62,
      T => oe_r_inv,
      O => z(1)
    );
  z_0_OBUFT : OBUFT
    port map (
      I => z_0_OBUFT_61,
      T => oe_r_inv,
      O => z(0)
    );
  din_r_7_OBUF : OBUF
    port map (
      I => cap(7),
      O => din_r(7)
    );
  din_r_6_OBUF : OBUF
    port map (
      I => cap(6),
      O => din_r(6)
    );
  din_r_5_OBUF : OBUF
    port map (
      I => cap(5),
      O => din_r(5)
    );
  din_r_4_OBUF : OBUF
    port map (
      I => cap(4),
      O => din_r(4)
    );
  din_r_3_OBUF : OBUF
    port map (
      I => cap(3),
      O => din_r(3)
    );
  din_r_2_OBUF : OBUF
    port map (
      I => cap(2),
      O => din_r(2)
    );
  din_r_1_OBUF : OBUF
    port map (
      I => cap(1),
      O => din_r(1)
    );
  din_r_0_OBUF : OBUF
    port map (
      I => cap(0),
      O => din_r(0)
    );
  clk_BUFGP : BUFGP
    port map (
      I => clk,
      O => clk_BUFGP_17
    );
  oe_inv1_INV_0 : INV
    port map (
      I => oe_IBUF_53,
      O => oe_inv
    );
  oe_r_inv1_INV_0 : INV
    port map (
      I => oe_r_55,
      O => oe_r_inv
    );

end STRUCTURE;

