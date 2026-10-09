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
  signal clk_BUFGP : STD_LOGIC;
  signal found_OBUF_13 : STD_LOGIC;
  signal found_or0000 : STD_LOGIC;
  signal go_IBUF_16 : STD_LOGIC;
  signal light_0_OBUF_20 : STD_LOGIC;
  signal light_2_OBUF_21 : STD_LOGIC;
  signal phase_0_OBUF_24 : STD_LOGIC;
  signal rst_IBUF_26 : STD_LOGIC;
  signal st_FSM_FFd1_27 : STD_LOGIC;
  signal st_FSM_FFd1_In : STD_LOGIC;
  signal st_FSM_FFd2_29 : STD_LOGIC;
  signal timer_mux0000_0_111_33 : STD_LOGIC;
  signal timer_mux0000_0_24_34 : STD_LOGIC;
  signal timer_mux0000_0_60_35 : STD_LOGIC;
  signal timer_mux0000_0_61_36 : STD_LOGIC;
  signal timer_mux0000_0_70 : STD_LOGIC;
  signal tl_FSM_FFd1_40 : STD_LOGIC;
  signal tl_FSM_FFd2_41 : STD_LOGIC;
  signal tl_FSM_FFd2_In_42 : STD_LOGIC;
  signal x_IBUF_44 : STD_LOGIC;
  signal tl_FSM_FFd2_In_SW0_O : STD_LOGIC;
  signal timer_mux0000_0_111_O : STD_LOGIC;
  signal timer_mux0000_0_60_O : STD_LOGIC;
  signal clk_BUFGP_IBUFG_2 : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal timer : STD_LOGIC_VECTOR ( 2 downto 0 );
  signal timer_mux0000 : STD_LOGIC_VECTOR ( 2 downto 1 );
begin
  XST_VCC : X_ONE
    port map (
      O => N1
    );
  found_2 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => N1,
      SRST => found_or0000,
      O => found_OBUF_13,
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  timer_0 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => timer_mux0000(2),
      SRST => rst_IBUF_26,
      O => timer(0),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  timer_1 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => timer_mux0000(1),
      SRST => rst_IBUF_26,
      O => timer(1),
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  st_FSM_FFd1 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => st_FSM_FFd1_In,
      SRST => rst_IBUF_26,
      O => st_FSM_FFd1_27,
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  st_FSM_FFd2 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => x_IBUF_44,
      SRST => rst_IBUF_26,
      O => st_FSM_FFd2_29,
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  tl_FSM_FFd2 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => tl_FSM_FFd2_In_42,
      SRST => rst_IBUF_26,
      O => tl_FSM_FFd2_41,
      CE => VCC,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  tl_FSM_Out11 : X_LUT2
    generic map(
      INIT => X"2"
    )
    port map (
      ADR0 => tl_FSM_FFd2_41,
      ADR1 => tl_FSM_FFd1_40,
      O => light_0_OBUF_20
    );
  tl_or00011 : X_LUT2
    generic map(
      INIT => X"6"
    )
    port map (
      ADR0 => tl_FSM_FFd2_41,
      ADR1 => tl_FSM_FFd1_40,
      O => phase_0_OBUF_24
    );
  st_FSM_FFd1_In1 : X_LUT3
    generic map(
      INIT => X"A8"
    )
    port map (
      ADR0 => st_FSM_FFd2_29,
      ADR1 => st_FSM_FFd1_27,
      ADR2 => x_IBUF_44,
      O => st_FSM_FFd1_In
    );
  found_or00001 : X_LUT4
    generic map(
      INIT => X"FBFF"
    )
    port map (
      ADR0 => rst_IBUF_26,
      ADR1 => st_FSM_FFd1_27,
      ADR2 => st_FSM_FFd2_29,
      ADR3 => x_IBUF_44,
      O => found_or0000
    );
  tl_FSM_FFd1_In_SW0 : X_LUT4
    generic map(
      INIT => X"EF08"
    )
    port map (
      ADR0 => tl_FSM_FFd2_41,
      ADR1 => timer(2),
      ADR2 => timer(1),
      ADR3 => tl_FSM_FFd1_40,
      O => N14
    );
  tl_FSM_FFd2_In : X_LUT4
    generic map(
      INIT => X"CE0E"
    )
    port map (
      ADR0 => go_IBUF_16,
      ADR1 => tl_FSM_FFd2_41,
      ADR2 => tl_FSM_FFd1_40,
      ADR3 => N16,
      O => tl_FSM_FFd2_In_42
    );
  timer_mux0000_0_24 : X_LUT4
    generic map(
      INIT => X"3301"
    )
    port map (
      ADR0 => go_IBUF_16,
      ADR1 => timer(1),
      ADR2 => tl_FSM_FFd2_41,
      ADR3 => tl_FSM_FFd1_40,
      O => timer_mux0000_0_24_34
    );
  rst_IBUF : X_BUF
    port map (
      I => rst,
      O => rst_IBUF_26
    );
  go_IBUF : X_BUF
    port map (
      I => go,
      O => go_IBUF_16
    );
  x_IBUF : X_BUF
    port map (
      I => x,
      O => x_IBUF_44
    );
  timer_2 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      I => timer_mux0000_0_70,
      SRST => rst_IBUF_26,
      SSET => timer_mux0000_0_61_36,
      O => timer(2),
      CE => VCC,
      SET => GND,
      RST => GND
    );
  timer_mux0000_0_701 : X_LUT3
    generic map(
      INIT => X"A8"
    )
    port map (
      ADR0 => timer(2),
      ADR1 => timer_mux0000_0_111_33,
      ADR2 => timer_mux0000_0_24_34,
      O => timer_mux0000_0_70
    );
  tl_FSM_FFd1 : X_SFF
    generic map(
      INIT => '0'
    )
    port map (
      CLK => clk_BUFGP,
      CE => timer(0),
      I => N14,
      SRST => rst_IBUF_26,
      O => tl_FSM_FFd1_40,
      SET => GND,
      RST => GND,
      SSET => GND
    );
  timer_mux0000_0_61 : X_LUT4
    generic map(
      INIT => X"CD00"
    )
    port map (
      ADR0 => go_IBUF_16,
      ADR1 => tl_FSM_FFd2_41,
      ADR2 => tl_FSM_FFd1_40,
      ADR3 => timer_mux0000_0_60_35,
      O => timer_mux0000_0_61_36
    );
  tl_FSM_Out41_INV_0 : X_INV
    port map (
      I => tl_FSM_FFd2_41,
      O => light_2_OBUF_21
    );
  timer_mux0000_2_Q : X_MUX2
    port map (
      IA => N24,
      IB => N25,
      SEL => tl_FSM_FFd1_40,
      O => timer_mux0000(2)
    );
  timer_mux0000_2_F : X_LUT3
    generic map(
      INIT => X"51"
    )
    port map (
      ADR0 => timer(0),
      ADR1 => go_IBUF_16,
      ADR2 => tl_FSM_FFd2_41,
      O => N24
    );
  timer_mux0000_2_G : X_LUT4
    generic map(
      INIT => X"5515"
    )
    port map (
      ADR0 => timer(0),
      ADR1 => tl_FSM_FFd2_41,
      ADR2 => timer(1),
      ADR3 => timer(2),
      O => N25
    );
  timer_mux0000_1_Q : X_MUX2
    port map (
      IA => N26,
      IB => N27,
      SEL => tl_FSM_FFd2_41,
      O => timer_mux0000(1)
    );
  timer_mux0000_1_F : X_LUT4
    generic map(
      INIT => X"6606"
    )
    port map (
      ADR0 => timer(0),
      ADR1 => timer(1),
      ADR2 => go_IBUF_16,
      ADR3 => tl_FSM_FFd1_40,
      O => N26
    );
  timer_mux0000_1_G : X_LUT4
    generic map(
      INIT => X"6426"
    )
    port map (
      ADR0 => timer(0),
      ADR1 => timer(1),
      ADR2 => tl_FSM_FFd1_40,
      ADR3 => timer(2),
      O => N27
    );
  tl_FSM_FFd2_In_SW0_LUT3_L_BUF : X_BUF
    port map (
      I => tl_FSM_FFd2_In_SW0_O,
      O => N16
    );
  tl_FSM_FFd2_In_SW0 : X_LUT3
    generic map(
      INIT => X"FB"
    )
    port map (
      ADR0 => timer(2),
      ADR1 => timer(1),
      ADR2 => timer(0),
      O => tl_FSM_FFd2_In_SW0_O
    );
  timer_mux0000_0_111_LUT4_L_BUF : X_BUF
    port map (
      I => timer_mux0000_0_111_O,
      O => timer_mux0000_0_111_33
    );
  timer_mux0000_0_111 : X_LUT4
    generic map(
      INIT => X"3331"
    )
    port map (
      ADR0 => go_IBUF_16,
      ADR1 => timer(0),
      ADR2 => tl_FSM_FFd2_41,
      ADR3 => tl_FSM_FFd1_40,
      O => timer_mux0000_0_111_O
    );
  timer_mux0000_0_60_LUT3_L_BUF : X_BUF
    port map (
      I => timer_mux0000_0_60_O,
      O => timer_mux0000_0_60_35
    );
  timer_mux0000_0_60 : X_LUT3
    generic map(
      INIT => X"40"
    )
    port map (
      ADR0 => timer(2),
      ADR1 => timer(0),
      ADR2 => timer(1),
      O => timer_mux0000_0_60_O
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
  found_OBUF : X_OBUF
    port map (
      I => found_OBUF_13,
      O => found
    );
  light_0_OBUF : X_OBUF
    port map (
      I => light_0_OBUF_20,
      O => light(0)
    );
  light_1_OBUF : X_OBUF
    port map (
      I => tl_FSM_FFd1_40,
      O => light(1)
    );
  light_2_OBUF : X_OBUF
    port map (
      I => light_2_OBUF_21,
      O => light(2)
    );
  phase_0_OBUF : X_OBUF
    port map (
      I => phase_0_OBUF_24,
      O => phase(0)
    );
  phase_1_OBUF : X_OBUF
    port map (
      I => tl_FSM_FFd1_40,
      O => phase(1)
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

