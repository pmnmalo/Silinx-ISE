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
  signal clk_BUFGP_1 : STD_LOGIC;
  signal clr_IBUF_3 : STD_LOGIC;
  signal d_0_IBUF_8 : STD_LOGIC;
  signal d_1_IBUF_9 : STD_LOGIC;
  signal d_2_IBUF_10 : STD_LOGIC;
  signal d_3_IBUF_11 : STD_LOGIC;
  signal g3_BUFGP_14 : STD_LOGIC;
  signal g_BUFGP_15 : STD_LOGIC;
  signal ge_IBUF_17 : STD_LOGIC;
  signal l1_0_1_19 : STD_LOGIC;
  signal l1_1_1_21 : STD_LOGIC;
  signal l1_2_1_23 : STD_LOGIC;
  signal l1_3_1_25 : STD_LOGIC;
  signal l3_28 : STD_LOGIC;
  signal l3_xor0000 : STD_LOGIC;
  signal pre_IBUF_31 : STD_LOGIC;
  signal l1 : STD_LOGIC_VECTOR ( 3 downto 0 );
  signal l2 : STD_LOGIC_VECTOR ( 1 downto 0 );
  signal r : STD_LOGIC_VECTOR ( 3 downto 0 );
begin
  r_0 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_1,
      D => l1(0),
      Q => r(0)
    );
  r_1 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_1,
      D => l1(1),
      Q => r(1)
    );
  r_2 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_1,
      D => l1(2),
      Q => r(2)
    );
  r_3 : FD
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_1,
      D => l1(3),
      Q => r(3)
    );
  l3 : LD
    generic map(
      INIT => '0'
    )
    port map (
      D => l3_xor0000,
      G => g3_BUFGP_14,
      Q => l3_28
    );
  l2_0 : LDP_1
    generic map(
      INIT => '1'
    )
    port map (
      D => d_2_IBUF_10,
      G => g_BUFGP_15,
      PRE => pre_IBUF_31,
      Q => l2(0)
    );
  l2_1 : LDP_1
    generic map(
      INIT => '1'
    )
    port map (
      D => d_3_IBUF_11,
      G => g_BUFGP_15,
      PRE => pre_IBUF_31,
      Q => l2(1)
    );
  l1_0 : LDCE
    generic map(
      INIT => '0'
    )
    port map (
      CLR => clr_IBUF_3,
      D => d_0_IBUF_8,
      G => g_BUFGP_15,
      GE => ge_IBUF_17,
      Q => l1(0)
    );
  l1_1 : LDCE
    generic map(
      INIT => '0'
    )
    port map (
      CLR => clr_IBUF_3,
      D => d_1_IBUF_9,
      G => g_BUFGP_15,
      GE => ge_IBUF_17,
      Q => l1(1)
    );
  l1_2 : LDCE
    generic map(
      INIT => '0'
    )
    port map (
      CLR => clr_IBUF_3,
      D => d_2_IBUF_10,
      G => g_BUFGP_15,
      GE => ge_IBUF_17,
      Q => l1(2)
    );
  l1_3 : LDCE
    generic map(
      INIT => '0'
    )
    port map (
      CLR => clr_IBUF_3,
      D => d_3_IBUF_11,
      G => g_BUFGP_15,
      GE => ge_IBUF_17,
      Q => l1(3)
    );
  Mxor_l3_xor0000_Result1 : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => d_1_IBUF_9,
      I1 => d_0_IBUF_8,
      O => l3_xor0000
    );
  clr_IBUF : IBUF
    port map (
      I => clr,
      O => clr_IBUF_3
    );
  ge_IBUF : IBUF
    port map (
      I => ge,
      O => ge_IBUF_17
    );
  pre_IBUF : IBUF
    port map (
      I => pre,
      O => pre_IBUF_31
    );
  d_3_IBUF : IBUF
    port map (
      I => d(3),
      O => d_3_IBUF_11
    );
  d_2_IBUF : IBUF
    port map (
      I => d(2),
      O => d_2_IBUF_10
    );
  d_1_IBUF : IBUF
    port map (
      I => d(1),
      O => d_1_IBUF_9
    );
  d_0_IBUF : IBUF
    port map (
      I => d(0),
      O => d_0_IBUF_8
    );
  q3_OBUF : OBUF
    port map (
      I => l3_28,
      O => q3
    );
  q1_3_OBUF : OBUF
    port map (
      I => l1_3_1_25,
      O => q1(3)
    );
  q1_2_OBUF : OBUF
    port map (
      I => l1_2_1_23,
      O => q1(2)
    );
  q1_1_OBUF : OBUF
    port map (
      I => l1_1_1_21,
      O => q1(1)
    );
  q1_0_OBUF : OBUF
    port map (
      I => l1_0_1_19,
      O => q1(0)
    );
  q2_1_OBUF : OBUF
    port map (
      I => l2(1),
      O => q2(1)
    );
  q2_0_OBUF : OBUF
    port map (
      I => l2(0),
      O => q2(0)
    );
  qr_3_OBUF : OBUF
    port map (
      I => r(3),
      O => qr(3)
    );
  qr_2_OBUF : OBUF
    port map (
      I => r(2),
      O => qr(2)
    );
  qr_1_OBUF : OBUF
    port map (
      I => r(1),
      O => qr(1)
    );
  qr_0_OBUF : OBUF
    port map (
      I => r(0),
      O => qr(0)
    );
  g_BUFGP : BUFGP
    port map (
      I => g,
      O => g_BUFGP_15
    );
  clk_BUFGP : BUFGP
    port map (
      I => clk,
      O => clk_BUFGP_1
    );
  g3_BUFGP : BUFGP
    port map (
      I => g3,
      O => g3_BUFGP_14
    );
  l1_3_1 : LDCE
    generic map(
      INIT => '0'
    )
    port map (
      CLR => clr_IBUF_3,
      D => d_3_IBUF_11,
      G => g_BUFGP_15,
      GE => ge_IBUF_17,
      Q => l1_3_1_25
    );
  l1_2_1 : LDCE
    generic map(
      INIT => '0'
    )
    port map (
      CLR => clr_IBUF_3,
      D => d_2_IBUF_10,
      G => g_BUFGP_15,
      GE => ge_IBUF_17,
      Q => l1_2_1_23
    );
  l1_1_1 : LDCE
    generic map(
      INIT => '0'
    )
    port map (
      CLR => clr_IBUF_3,
      D => d_1_IBUF_9,
      G => g_BUFGP_15,
      GE => ge_IBUF_17,
      Q => l1_1_1_21
    );
  l1_0_1 : LDCE
    generic map(
      INIT => '0'
    )
    port map (
      CLR => clr_IBUF_3,
      D => d_0_IBUF_8,
      G => g_BUFGP_15,
      GE => ge_IBUF_17,
      Q => l1_0_1_19
    );

end STRUCTURE;

