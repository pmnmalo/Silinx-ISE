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
-- Device	: 3s500efg320-4 (PRODUCTION 1.27 2013-10-13)
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
    rst : in STD_LOGIC := 'X';
    found : out STD_LOGIC;
    go : in STD_LOGIC := 'X';
    x : in STD_LOGIC := 'X';
    phase : out STD_LOGIC_VECTOR ( 1 downto 0 );
    light : out STD_LOGIC_VECTOR ( 2 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal go_IBUF_136 : STD_LOGIC;
  signal x_IBUF_137 : STD_LOGIC;
  signal tl_FSM_FFd1_139 : STD_LOGIC;
  signal tl_FSM_FFd2_140 : STD_LOGIC;
  signal found_OBUF_142 : STD_LOGIC;
  signal rst_IBUF_143 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal timer_mux0000_0_111_O : STD_LOGIC;
  signal timer_mux0000_0_24_0 : STD_LOGIC;
  signal timer_mux0000_0_60_O : STD_LOGIC;
  signal tl_FSM_FFd2_In_SW0_O : STD_LOGIC;
  signal st_FSM_FFd1_154 : STD_LOGIC;
  signal st_FSM_FFd2_155 : STD_LOGIC;
  signal clk_INBUF : STD_LOGIC;
  signal go_INBUF : STD_LOGIC;
  signal x_INBUF : STD_LOGIC;
  signal light_0_O : STD_LOGIC;
  signal light_1_O : STD_LOGIC;
  signal light_2_O : STD_LOGIC;
  signal phase_0_O : STD_LOGIC;
  signal phase_1_O : STD_LOGIC;
  signal found_O : STD_LOGIC;
  signal rst_INBUF : STD_LOGIC;
  signal clk_BUFGP_BUFG_S_INVNOT : STD_LOGIC;
  signal clk_BUFGP_BUFG_I0_INV : STD_LOGIC;
  signal timer_1_DXMUX_263 : STD_LOGIC;
  signal timer_1_F5MUX_261 : STD_LOGIC;
  signal N27 : STD_LOGIC;
  signal timer_1_BXINV_254 : STD_LOGIC;
  signal N26 : STD_LOGIC;
  signal timer_1_SRINV_247 : STD_LOGIC;
  signal timer_1_CLKINV_246 : STD_LOGIC;
  signal timer_0_DXMUX_297 : STD_LOGIC;
  signal timer_0_F5MUX_295 : STD_LOGIC;
  signal N25 : STD_LOGIC;
  signal timer_0_BXINV_288 : STD_LOGIC;
  signal N24 : STD_LOGIC;
  signal timer_0_SRINV_280 : STD_LOGIC;
  signal timer_0_CLKINV_279 : STD_LOGIC;
  signal timer_mux0000_0_111_O_pack_1 : STD_LOGIC;
  signal timer_2_REVUSED_326 : STD_LOGIC;
  signal timer_2_DYMUX_325 : STD_LOGIC;
  signal timer_mux0000_0_70 : STD_LOGIC;
  signal timer_2_SRINV_315 : STD_LOGIC;
  signal timer_2_CLKINV_314 : STD_LOGIC;
  signal timer_mux0000_0_61_360 : STD_LOGIC;
  signal timer_mux0000_0_60_O_pack_1 : STD_LOGIC;
  signal tl_FSM_FFd2_DXMUX_391 : STD_LOGIC;
  signal tl_FSM_FFd2_In_388 : STD_LOGIC;
  signal tl_FSM_FFd2_In_SW0_O_pack_2 : STD_LOGIC;
  signal tl_FSM_FFd2_SRINV_375 : STD_LOGIC;
  signal tl_FSM_FFd2_CLKINV_374 : STD_LOGIC;
  signal st_FSM_FFd2_DXMUX_432 : STD_LOGIC;
  signal found_or0000 : STD_LOGIC;
  signal st_FSM_FFd2_DYMUX_419 : STD_LOGIC;
  signal st_FSM_FFd1_In : STD_LOGIC;
  signal st_FSM_FFd2_SRINV_410 : STD_LOGIC;
  signal st_FSM_FFd2_CLKINV_409 : STD_LOGIC;
  signal timer_mux0000_0_24_470 : STD_LOGIC;
  signal tl_FSM_FFd1_DYMUX_460 : STD_LOGIC;
  signal N14 : STD_LOGIC;
  signal tl_FSM_FFd1_SRINV_452 : STD_LOGIC;
  signal tl_FSM_FFd1_CLKINV_451 : STD_LOGIC;
  signal tl_FSM_FFd1_CEINV_450 : STD_LOGIC;
  signal phase_0_OBUF_494 : STD_LOGIC;
  signal light_0_OBUF_485 : STD_LOGIC;
  signal found_OBUF_DYMUX_504 : STD_LOGIC;
  signal found_OBUF_BYINV_503 : STD_LOGIC;
  signal found_OBUF_SRINV_502 : STD_LOGIC;
  signal found_OBUF_CLKINV_501 : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal timer : STD_LOGIC_VECTOR ( 2 downto 0 );
begin
  clk_BUFGP_IBUFG : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk,
      O => clk_INBUF
    );
  go_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => go,
      O => go_INBUF
    );
  go_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => go_INBUF,
      O => go_IBUF_136
    );
  x_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => x,
      O => x_INBUF
    );
  x_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => x_INBUF,
      O => x_IBUF_137
    );
  light_0_OBUF : X_OBUF
    port map (
      I => light_0_O,
      O => light(0)
    );
  light_1_OBUF : X_OBUF
    port map (
      I => light_1_O,
      O => light(1)
    );
  light_2_OBUF : X_OBUF
    port map (
      I => light_2_O,
      O => light(2)
    );
  phase_0_OBUF : X_OBUF
    port map (
      I => phase_0_O,
      O => phase(0)
    );
  phase_1_OBUF : X_OBUF
    port map (
      I => phase_1_O,
      O => phase(1)
    );
  found_OBUF : X_OBUF
    port map (
      I => found_O,
      O => found
    );
  rst_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => rst,
      O => rst_INBUF
    );
  rst_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => rst_INBUF,
      O => rst_IBUF_143
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
  timer_1_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => timer_1_F5MUX_261,
      O => timer_1_DXMUX_263
    );
  timer_1_F5MUX : X_MUX2
    port map (
      IA => N26,
      IB => N27,
      SEL => timer_1_BXINV_254,
      O => timer_1_F5MUX_261
    );
  timer_1_BXINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tl_FSM_FFd2_140,
      O => timer_1_BXINV_254
    );
  timer_1_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => rst_IBUF_143,
      O => timer_1_SRINV_247
    );
  timer_1_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => timer_1_CLKINV_246
    );
  timer_mux0000_1_F : X_LUT4
    generic map(
      INIT => X"6606"
    )
    port map (
      ADR0 => timer(0),
      ADR1 => timer(1),
      ADR2 => go_IBUF_136,
      ADR3 => tl_FSM_FFd1_139,
      O => N26
    );
  timer_0_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => timer_0_F5MUX_295,
      O => timer_0_DXMUX_297
    );
  timer_0_F5MUX : X_MUX2
    port map (
      IA => N24,
      IB => N25,
      SEL => timer_0_BXINV_288,
      O => timer_0_F5MUX_295
    );
  timer_0_BXINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tl_FSM_FFd1_139,
      O => timer_0_BXINV_288
    );
  timer_0_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => rst_IBUF_143,
      O => timer_0_SRINV_280
    );
  timer_0_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => timer_0_CLKINV_279
    );
  timer_mux0000_2_F : X_LUT4
    generic map(
      INIT => X"5151"
    )
    port map (
      ADR0 => timer(0),
      ADR1 => go_IBUF_136,
      ADR2 => tl_FSM_FFd2_140,
      ADR3 => VCC,
      O => N24
    );
  timer_2_XUSED : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => timer_mux0000_0_111_O_pack_1,
      O => timer_mux0000_0_111_O
    );
  timer_2_REVUSED : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => timer_mux0000_0_61_360,
      O => timer_2_REVUSED_326
    );
  timer_2_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => timer_mux0000_0_70,
      O => timer_2_DYMUX_325
    );
  timer_2_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => rst_IBUF_143,
      O => timer_2_SRINV_315
    );
  timer_2_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => timer_2_CLKINV_314
    );
  timer_mux0000_0_61_YUSED : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => timer_mux0000_0_60_O_pack_1,
      O => timer_mux0000_0_60_O
    );
  timer_mux0000_0_60 : X_LUT4
    generic map(
      INIT => X"4040"
    )
    port map (
      ADR0 => timer(2),
      ADR1 => timer(0),
      ADR2 => timer(1),
      ADR3 => VCC,
      O => timer_mux0000_0_60_O_pack_1
    );
  tl_FSM_FFd2_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tl_FSM_FFd2_In_388,
      O => tl_FSM_FFd2_DXMUX_391
    );
  tl_FSM_FFd2_YUSED : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tl_FSM_FFd2_In_SW0_O_pack_2,
      O => tl_FSM_FFd2_In_SW0_O
    );
  tl_FSM_FFd2_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => rst_IBUF_143,
      O => tl_FSM_FFd2_SRINV_375
    );
  tl_FSM_FFd2_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => tl_FSM_FFd2_CLKINV_374
    );
  tl_FSM_FFd2_In_SW0 : X_LUT4
    generic map(
      INIT => X"FBFB"
    )
    port map (
      ADR0 => timer(2),
      ADR1 => timer(1),
      ADR2 => timer(0),
      ADR3 => VCC,
      O => tl_FSM_FFd2_In_SW0_O_pack_2
    );
  st_FSM_FFd2_DXMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => x_IBUF_137,
      O => st_FSM_FFd2_DXMUX_432
    );
  st_FSM_FFd2_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => st_FSM_FFd1_In,
      O => st_FSM_FFd2_DYMUX_419
    );
  st_FSM_FFd2_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => rst_IBUF_143,
      O => st_FSM_FFd2_SRINV_410
    );
  st_FSM_FFd2_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => st_FSM_FFd2_CLKINV_409
    );
  st_FSM_FFd1_In1 : X_LUT4
    generic map(
      INIT => X"A8A8"
    )
    port map (
      ADR0 => st_FSM_FFd2_155,
      ADR1 => st_FSM_FFd1_154,
      ADR2 => x_IBUF_137,
      ADR3 => VCC,
      O => st_FSM_FFd1_In
    );
  tl_FSM_FFd1_XUSED : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => timer_mux0000_0_24_470,
      O => timer_mux0000_0_24_0
    );
  tl_FSM_FFd1_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => N14,
      O => tl_FSM_FFd1_DYMUX_460
    );
  tl_FSM_FFd1_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => rst_IBUF_143,
      O => tl_FSM_FFd1_SRINV_452
    );
  tl_FSM_FFd1_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => tl_FSM_FFd1_CLKINV_451
    );
  tl_FSM_FFd1_CEINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => timer(0),
      O => tl_FSM_FFd1_CEINV_450
    );
  tl_FSM_Out11 : X_LUT4
    generic map(
      INIT => X"2222"
    )
    port map (
      ADR0 => tl_FSM_FFd2_140,
      ADR1 => tl_FSM_FFd1_139,
      ADR2 => VCC,
      ADR3 => VCC,
      O => light_0_OBUF_485
    );
  found_OBUF_DYMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => found_OBUF_BYINV_503,
      O => found_OBUF_DYMUX_504
    );
  found_OBUF_BYINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => found_OBUF_BYINV_503
    );
  found_OBUF_SRINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => found_or0000,
      O => found_OBUF_SRINV_502
    );
  found_OBUF_CLKINV : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => found_OBUF_CLKINV_501
    );
  timer_0 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      I => timer_0_DXMUX_297,
      CE => VCC,
      CLK => timer_0_CLKINV_279,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => timer_0_SRINV_280,
      O => timer(0)
    );
  timer_mux0000_0_701 : X_LUT4
    generic map(
      INIT => X"A8A8"
    )
    port map (
      ADR0 => timer(2),
      ADR1 => timer_mux0000_0_111_O,
      ADR2 => timer_mux0000_0_24_0,
      ADR3 => VCC,
      O => timer_mux0000_0_70
    );
  timer_2 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      I => timer_2_DYMUX_325,
      CE => VCC,
      CLK => timer_2_CLKINV_314,
      SET => GND,
      RST => GND,
      SSET => timer_2_REVUSED_326,
      SRST => timer_2_SRINV_315,
      O => timer(2)
    );
  timer_mux0000_0_111 : X_LUT4
    generic map(
      INIT => X"3331"
    )
    port map (
      ADR0 => go_IBUF_136,
      ADR1 => timer(0),
      ADR2 => tl_FSM_FFd2_140,
      ADR3 => tl_FSM_FFd1_139,
      O => timer_mux0000_0_111_O_pack_1
    );
  timer_mux0000_0_61 : X_LUT4
    generic map(
      INIT => X"CD00"
    )
    port map (
      ADR0 => go_IBUF_136,
      ADR1 => tl_FSM_FFd2_140,
      ADR2 => tl_FSM_FFd1_139,
      ADR3 => timer_mux0000_0_60_O,
      O => timer_mux0000_0_61_360
    );
  tl_FSM_FFd2_In : X_LUT4
    generic map(
      INIT => X"CE0E"
    )
    port map (
      ADR0 => go_IBUF_136,
      ADR1 => tl_FSM_FFd2_140,
      ADR2 => tl_FSM_FFd1_139,
      ADR3 => tl_FSM_FFd2_In_SW0_O,
      O => tl_FSM_FFd2_In_388
    );
  tl_FSM_FFd2 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      I => tl_FSM_FFd2_DXMUX_391,
      CE => VCC,
      CLK => tl_FSM_FFd2_CLKINV_374,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => tl_FSM_FFd2_SRINV_375,
      O => tl_FSM_FFd2_140
    );
  st_FSM_FFd1 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      I => st_FSM_FFd2_DYMUX_419,
      CE => VCC,
      CLK => st_FSM_FFd2_CLKINV_409,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => st_FSM_FFd2_SRINV_410,
      O => st_FSM_FFd1_154
    );
  found_or00001 : X_LUT4
    generic map(
      INIT => X"FBFF"
    )
    port map (
      ADR0 => rst_IBUF_143,
      ADR1 => st_FSM_FFd1_154,
      ADR2 => st_FSM_FFd2_155,
      ADR3 => x_IBUF_137,
      O => found_or0000
    );
  st_FSM_FFd2 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      I => st_FSM_FFd2_DXMUX_432,
      CE => VCC,
      CLK => st_FSM_FFd2_CLKINV_409,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => st_FSM_FFd2_SRINV_410,
      O => st_FSM_FFd2_155
    );
  tl_FSM_FFd1_In_SW0 : X_LUT4
    generic map(
      INIT => X"EF08"
    )
    port map (
      ADR0 => tl_FSM_FFd2_140,
      ADR1 => timer(2),
      ADR2 => timer(1),
      ADR3 => tl_FSM_FFd1_139,
      O => N14
    );
  tl_FSM_FFd1 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      I => tl_FSM_FFd1_DYMUX_460,
      CE => tl_FSM_FFd1_CEINV_450,
      CLK => tl_FSM_FFd1_CLKINV_451,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => tl_FSM_FFd1_SRINV_452,
      O => tl_FSM_FFd1_139
    );
  timer_mux0000_0_24 : X_LUT4
    generic map(
      INIT => X"3301"
    )
    port map (
      ADR0 => go_IBUF_136,
      ADR1 => timer(1),
      ADR2 => tl_FSM_FFd2_140,
      ADR3 => tl_FSM_FFd1_139,
      O => timer_mux0000_0_24_470
    );
  tl_or00011 : X_LUT4
    generic map(
      INIT => X"6666"
    )
    port map (
      ADR0 => tl_FSM_FFd2_140,
      ADR1 => tl_FSM_FFd1_139,
      ADR2 => VCC,
      ADR3 => VCC,
      O => phase_0_OBUF_494
    );
  found_228 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      I => found_OBUF_DYMUX_504,
      CE => VCC,
      CLK => found_OBUF_CLKINV_501,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => found_OBUF_SRINV_502,
      O => found_OBUF_142
    );
  timer_mux0000_1_G : X_LUT4
    generic map(
      INIT => X"6426"
    )
    port map (
      ADR0 => timer(0),
      ADR1 => timer(1),
      ADR2 => tl_FSM_FFd1_139,
      ADR3 => timer(2),
      O => N27
    );
  timer_1 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      I => timer_1_DXMUX_263,
      CE => VCC,
      CLK => timer_1_CLKINV_246,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => timer_1_SRINV_247,
      O => timer(1)
    );
  timer_mux0000_2_G : X_LUT4
    generic map(
      INIT => X"5515"
    )
    port map (
      ADR0 => timer(0),
      ADR1 => tl_FSM_FFd2_140,
      ADR2 => timer(1),
      ADR3 => timer(2),
      O => N25
    );
  light_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => light_0_OBUF_485,
      O => light_0_O
    );
  light_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tl_FSM_FFd1_139,
      O => light_1_O
    );
  light_2_OUTPUT_OFF_OMUX : X_INV
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tl_FSM_FFd2_140,
      O => light_2_O
    );
  phase_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => phase_0_OBUF_494,
      O => phase_0_O
    );
  phase_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => tl_FSM_FFd1_139,
      O => phase_1_O
    );
  found_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => found_OBUF_142,
      O => found_O
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

