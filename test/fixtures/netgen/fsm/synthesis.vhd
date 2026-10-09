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
    rst : in STD_LOGIC := 'X';
    found : out STD_LOGIC;
    go : in STD_LOGIC := 'X';
    x : in STD_LOGIC := 'X';
    phase : out STD_LOGIC_VECTOR ( 1 downto 0 );
    light : out STD_LOGIC_VECTOR ( 2 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal N1 : STD_LOGIC;
  signal N14 : STD_LOGIC;
  signal N16 : STD_LOGIC;
  signal N24 : STD_LOGIC;
  signal N25 : STD_LOGIC;
  signal N26 : STD_LOGIC;
  signal N27 : STD_LOGIC;
  signal clk_BUFGP_8 : STD_LOGIC;
  signal found_OBUF_10 : STD_LOGIC;
  signal found_or0000 : STD_LOGIC;
  signal go_IBUF_13 : STD_LOGIC;
  signal light_0_OBUF_17 : STD_LOGIC;
  signal light_2_OBUF_18 : STD_LOGIC;
  signal phase_0_OBUF_21 : STD_LOGIC;
  signal rst_IBUF_23 : STD_LOGIC;
  signal st_FSM_FFd1_24 : STD_LOGIC;
  signal st_FSM_FFd1_In : STD_LOGIC;
  signal st_FSM_FFd2_26 : STD_LOGIC;
  signal timer_mux0000_0_111_30 : STD_LOGIC;
  signal timer_mux0000_0_24_31 : STD_LOGIC;
  signal timer_mux0000_0_60_32 : STD_LOGIC;
  signal timer_mux0000_0_61_33 : STD_LOGIC;
  signal timer_mux0000_0_70 : STD_LOGIC;
  signal tl_FSM_FFd1_37 : STD_LOGIC;
  signal tl_FSM_FFd2_38 : STD_LOGIC;
  signal tl_FSM_FFd2_In_39 : STD_LOGIC;
  signal x_IBUF_41 : STD_LOGIC;
  signal timer : STD_LOGIC_VECTOR ( 2 downto 0 );
  signal timer_mux0000 : STD_LOGIC_VECTOR ( 2 downto 1 );
begin
  XST_VCC : VCC
    port map (
      P => N1
    );
  found_2 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_8,
      D => N1,
      R => found_or0000,
      Q => found_OBUF_10
    );
  timer_0 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_8,
      D => timer_mux0000(2),
      R => rst_IBUF_23,
      Q => timer(0)
    );
  timer_1 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_8,
      D => timer_mux0000(1),
      R => rst_IBUF_23,
      Q => timer(1)
    );
  st_FSM_FFd1 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_8,
      D => st_FSM_FFd1_In,
      R => rst_IBUF_23,
      Q => st_FSM_FFd1_24
    );
  st_FSM_FFd2 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_8,
      D => x_IBUF_41,
      R => rst_IBUF_23,
      Q => st_FSM_FFd2_26
    );
  tl_FSM_FFd2 : FDR
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_8,
      D => tl_FSM_FFd2_In_39,
      R => rst_IBUF_23,
      Q => tl_FSM_FFd2_38
    );
  tl_FSM_Out11 : LUT2
    generic map(
      INIT => X"2"
    )
    port map (
      I0 => tl_FSM_FFd2_38,
      I1 => tl_FSM_FFd1_37,
      O => light_0_OBUF_17
    );
  tl_or00011 : LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      I0 => tl_FSM_FFd2_38,
      I1 => tl_FSM_FFd1_37,
      O => phase_0_OBUF_21
    );
  st_FSM_FFd1_In1 : LUT3
    generic map(
      INIT => X"A8"
    )
    port map (
      I0 => st_FSM_FFd2_26,
      I1 => st_FSM_FFd1_24,
      I2 => x_IBUF_41,
      O => st_FSM_FFd1_In
    );
  found_or00001 : LUT4
    generic map(
      INIT => X"FBFF"
    )
    port map (
      I0 => rst_IBUF_23,
      I1 => st_FSM_FFd1_24,
      I2 => st_FSM_FFd2_26,
      I3 => x_IBUF_41,
      O => found_or0000
    );
  tl_FSM_FFd1_In_SW0 : LUT4
    generic map(
      INIT => X"EF08"
    )
    port map (
      I0 => tl_FSM_FFd2_38,
      I1 => timer(2),
      I2 => timer(1),
      I3 => tl_FSM_FFd1_37,
      O => N14
    );
  tl_FSM_FFd2_In : LUT4
    generic map(
      INIT => X"CE0E"
    )
    port map (
      I0 => go_IBUF_13,
      I1 => tl_FSM_FFd2_38,
      I2 => tl_FSM_FFd1_37,
      I3 => N16,
      O => tl_FSM_FFd2_In_39
    );
  timer_mux0000_0_24 : LUT4
    generic map(
      INIT => X"3301"
    )
    port map (
      I0 => go_IBUF_13,
      I1 => timer(1),
      I2 => tl_FSM_FFd2_38,
      I3 => tl_FSM_FFd1_37,
      O => timer_mux0000_0_24_31
    );
  rst_IBUF : IBUF
    port map (
      I => rst,
      O => rst_IBUF_23
    );
  go_IBUF : IBUF
    port map (
      I => go,
      O => go_IBUF_13
    );
  x_IBUF : IBUF
    port map (
      I => x,
      O => x_IBUF_41
    );
  found_OBUF : OBUF
    port map (
      I => found_OBUF_10,
      O => found
    );
  phase_1_OBUF : OBUF
    port map (
      I => tl_FSM_FFd1_37,
      O => phase(1)
    );
  phase_0_OBUF : OBUF
    port map (
      I => phase_0_OBUF_21,
      O => phase(0)
    );
  light_2_OBUF : OBUF
    port map (
      I => light_2_OBUF_18,
      O => light(2)
    );
  light_1_OBUF : OBUF
    port map (
      I => tl_FSM_FFd1_37,
      O => light(1)
    );
  light_0_OBUF : OBUF
    port map (
      I => light_0_OBUF_17,
      O => light(0)
    );
  timer_2 : FDRS
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_8,
      D => timer_mux0000_0_70,
      R => rst_IBUF_23,
      S => timer_mux0000_0_61_33,
      Q => timer(2)
    );
  timer_mux0000_0_701 : LUT3
    generic map(
      INIT => X"A8"
    )
    port map (
      I0 => timer(2),
      I1 => timer_mux0000_0_111_30,
      I2 => timer_mux0000_0_24_31,
      O => timer_mux0000_0_70
    );
  tl_FSM_FFd1 : FDRE
    generic map(
      INIT => '0'
    )
    port map (
      C => clk_BUFGP_8,
      CE => timer(0),
      D => N14,
      R => rst_IBUF_23,
      Q => tl_FSM_FFd1_37
    );
  timer_mux0000_0_61 : LUT4
    generic map(
      INIT => X"CD00"
    )
    port map (
      I0 => go_IBUF_13,
      I1 => tl_FSM_FFd2_38,
      I2 => tl_FSM_FFd1_37,
      I3 => timer_mux0000_0_60_32,
      O => timer_mux0000_0_61_33
    );
  clk_BUFGP : BUFGP
    port map (
      I => clk,
      O => clk_BUFGP_8
    );
  tl_FSM_Out41_INV_0 : INV
    port map (
      I => tl_FSM_FFd2_38,
      O => light_2_OBUF_18
    );
  timer_mux0000_2_Q : MUXF5
    port map (
      I0 => N24,
      I1 => N25,
      S => tl_FSM_FFd1_37,
      O => timer_mux0000(2)
    );
  timer_mux0000_2_F : LUT3
    generic map(
      INIT => X"51"
    )
    port map (
      I0 => timer(0),
      I1 => go_IBUF_13,
      I2 => tl_FSM_FFd2_38,
      O => N24
    );
  timer_mux0000_2_G : LUT4
    generic map(
      INIT => X"5515"
    )
    port map (
      I0 => timer(0),
      I1 => tl_FSM_FFd2_38,
      I2 => timer(1),
      I3 => timer(2),
      O => N25
    );
  timer_mux0000_1_Q : MUXF5
    port map (
      I0 => N26,
      I1 => N27,
      S => tl_FSM_FFd2_38,
      O => timer_mux0000(1)
    );
  timer_mux0000_1_F : LUT4
    generic map(
      INIT => X"6606"
    )
    port map (
      I0 => timer(0),
      I1 => timer(1),
      I2 => go_IBUF_13,
      I3 => tl_FSM_FFd1_37,
      O => N26
    );
  timer_mux0000_1_G : LUT4
    generic map(
      INIT => X"6426"
    )
    port map (
      I0 => timer(0),
      I1 => timer(1),
      I2 => tl_FSM_FFd1_37,
      I3 => timer(2),
      O => N27
    );
  tl_FSM_FFd2_In_SW0 : LUT3_L
    generic map(
      INIT => X"FB"
    )
    port map (
      I0 => timer(2),
      I1 => timer(1),
      I2 => timer(0),
      LO => N16
    );
  timer_mux0000_0_111 : LUT4_L
    generic map(
      INIT => X"3331"
    )
    port map (
      I0 => go_IBUF_13,
      I1 => timer(0),
      I2 => tl_FSM_FFd2_38,
      I3 => tl_FSM_FFd1_37,
      LO => timer_mux0000_0_111_30
    );
  timer_mux0000_0_60 : LUT3_L
    generic map(
      INIT => X"40"
    )
    port map (
      I0 => timer(2),
      I1 => timer(0),
      I2 => timer(1),
      LO => timer_mux0000_0_60_32
    );

end STRUCTURE;

