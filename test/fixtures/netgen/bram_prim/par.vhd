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
    we_a : in STD_LOGIC := 'X';
    we_b : in STD_LOGIC := 'X';
    dop_a : out STD_LOGIC;
    en_a : in STD_LOGIC := 'X';
    en_b : in STD_LOGIC := 'X';
    dip_a : in STD_LOGIC := 'X';
    ssr_a : in STD_LOGIC := 'X';
    ssr_b : in STD_LOGIC := 'X';
    do_a : out STD_LOGIC_VECTOR ( 7 downto 0 );
    do_b : out STD_LOGIC_VECTOR ( 31 downto 0 );
    do_c : out STD_LOGIC_VECTOR ( 15 downto 0 );
    dop_b : out STD_LOGIC_VECTOR ( 3 downto 0 );
    dop_c : out STD_LOGIC_VECTOR ( 1 downto 0 );
    addr_a : in STD_LOGIC_VECTOR ( 10 downto 0 );
    addr_b : in STD_LOGIC_VECTOR ( 8 downto 0 );
    di_a : in STD_LOGIC_VECTOR ( 7 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal addr_a_2_IBUF_496 : STD_LOGIC;
  signal addr_a_3_IBUF_497 : STD_LOGIC;
  signal addr_b_0_IBUF_498 : STD_LOGIC;
  signal addr_a_4_IBUF_499 : STD_LOGIC;
  signal addr_b_1_IBUF_500 : STD_LOGIC;
  signal addr_a_5_IBUF_501 : STD_LOGIC;
  signal addr_b_2_IBUF_502 : STD_LOGIC;
  signal addr_a_6_IBUF_503 : STD_LOGIC;
  signal addr_a_10_IBUF_504 : STD_LOGIC;
  signal addr_b_3_IBUF_505 : STD_LOGIC;
  signal addr_a_7_IBUF_506 : STD_LOGIC;
  signal dop_a_OBUF_507 : STD_LOGIC;
  signal addr_b_4_IBUF_508 : STD_LOGIC;
  signal addr_a_8_IBUF_509 : STD_LOGIC;
  signal addr_b_5_IBUF_510 : STD_LOGIC;
  signal addr_a_9_IBUF_511 : STD_LOGIC;
  signal do_b_10_OBUF_512 : STD_LOGIC;
  signal addr_b_6_IBUF_513 : STD_LOGIC;
  signal do_b_11_OBUF_514 : STD_LOGIC;
  signal addr_b_7_IBUF_515 : STD_LOGIC;
  signal do_b_20_OBUF_516 : STD_LOGIC;
  signal do_b_12_OBUF_517 : STD_LOGIC;
  signal addr_b_8_IBUF_518 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal en_b_IBUF_522 : STD_LOGIC;
  signal ssr_a_IBUF_523 : STD_LOGIC;
  signal we_a_IBUF_524 : STD_LOGIC;
  signal addr_a_1_IBUF_525 : STD_LOGIC;
  signal addr_a_0_IBUF_526 : STD_LOGIC;
  signal di_b_16_0 : STD_LOGIC;
  signal di_b_17_0 : STD_LOGIC;
  signal di_b_18_0 : STD_LOGIC;
  signal di_b_19_0 : STD_LOGIC;
  signal di_b_20_0 : STD_LOGIC;
  signal di_b_21_0 : STD_LOGIC;
  signal di_b_22_0 : STD_LOGIC;
  signal di_b_23_0 : STD_LOGIC;
  signal di_a_0_IBUF_535 : STD_LOGIC;
  signal di_a_1_IBUF_536 : STD_LOGIC;
  signal di_a_2_IBUF_537 : STD_LOGIC;
  signal di_a_3_IBUF_538 : STD_LOGIC;
  signal di_a_4_IBUF_539 : STD_LOGIC;
  signal di_a_5_IBUF_540 : STD_LOGIC;
  signal di_a_6_IBUF_541 : STD_LOGIC;
  signal di_a_7_IBUF_542 : STD_LOGIC;
  signal do_c_0_OBUF_544 : STD_LOGIC;
  signal do_c_1_OBUF_545 : STD_LOGIC;
  signal do_c_2_OBUF_546 : STD_LOGIC;
  signal do_c_3_OBUF_547 : STD_LOGIC;
  signal do_c_4_OBUF_548 : STD_LOGIC;
  signal do_c_5_OBUF_549 : STD_LOGIC;
  signal do_c_6_OBUF_550 : STD_LOGIC;
  signal do_c_7_OBUF_551 : STD_LOGIC;
  signal do_c_8_OBUF_552 : STD_LOGIC;
  signal do_c_9_OBUF_553 : STD_LOGIC;
  signal do_c_10_OBUF_554 : STD_LOGIC;
  signal do_c_11_OBUF_555 : STD_LOGIC;
  signal do_c_12_OBUF_556 : STD_LOGIC;
  signal do_c_13_OBUF_557 : STD_LOGIC;
  signal do_c_14_OBUF_558 : STD_LOGIC;
  signal do_c_15_OBUF_559 : STD_LOGIC;
  signal dop_c_0_OBUF_560 : STD_LOGIC;
  signal dop_c_1_OBUF_561 : STD_LOGIC;
  signal en_a_IBUF_562 : STD_LOGIC;
  signal ssr_b_IBUF_563 : STD_LOGIC;
  signal we_b_IBUF_564 : STD_LOGIC;
  signal dip_a_IBUF_565 : STD_LOGIC;
  signal dip_b_2_0 : STD_LOGIC;
  signal do_a_0_OBUF_567 : STD_LOGIC;
  signal do_a_1_OBUF_568 : STD_LOGIC;
  signal do_a_2_OBUF_569 : STD_LOGIC;
  signal do_a_3_OBUF_570 : STD_LOGIC;
  signal do_a_4_OBUF_571 : STD_LOGIC;
  signal do_a_5_OBUF_572 : STD_LOGIC;
  signal do_a_6_OBUF_573 : STD_LOGIC;
  signal do_a_7_OBUF_574 : STD_LOGIC;
  signal do_b_0_OBUF_575 : STD_LOGIC;
  signal do_b_1_OBUF_576 : STD_LOGIC;
  signal do_b_2_OBUF_577 : STD_LOGIC;
  signal do_b_3_OBUF_578 : STD_LOGIC;
  signal do_b_4_OBUF_579 : STD_LOGIC;
  signal do_b_5_OBUF_580 : STD_LOGIC;
  signal do_b_6_OBUF_581 : STD_LOGIC;
  signal do_b_7_OBUF_582 : STD_LOGIC;
  signal do_b_8_OBUF_583 : STD_LOGIC;
  signal do_b_9_OBUF_584 : STD_LOGIC;
  signal do_b_13_OBUF_585 : STD_LOGIC;
  signal do_b_14_OBUF_586 : STD_LOGIC;
  signal do_b_15_OBUF_587 : STD_LOGIC;
  signal do_b_16_OBUF_588 : STD_LOGIC;
  signal do_b_17_OBUF_589 : STD_LOGIC;
  signal do_b_18_OBUF_590 : STD_LOGIC;
  signal do_b_19_OBUF_591 : STD_LOGIC;
  signal do_b_21_OBUF_592 : STD_LOGIC;
  signal do_b_22_OBUF_593 : STD_LOGIC;
  signal do_b_23_OBUF_594 : STD_LOGIC;
  signal do_b_24_OBUF_595 : STD_LOGIC;
  signal do_b_25_OBUF_596 : STD_LOGIC;
  signal do_b_26_OBUF_597 : STD_LOGIC;
  signal do_b_27_OBUF_598 : STD_LOGIC;
  signal do_b_28_OBUF_599 : STD_LOGIC;
  signal do_b_29_OBUF_600 : STD_LOGIC;
  signal do_b_30_OBUF_601 : STD_LOGIC;
  signal do_b_31_OBUF_602 : STD_LOGIC;
  signal dop_b_0_OBUF_603 : STD_LOGIC;
  signal dop_b_1_OBUF_604 : STD_LOGIC;
  signal dop_b_2_OBUF_605 : STD_LOGIC;
  signal dop_b_3_OBUF_606 : STD_LOGIC;
  signal addr_a_2_INBUF : STD_LOGIC;
  signal addr_a_3_INBUF : STD_LOGIC;
  signal addr_b_0_INBUF : STD_LOGIC;
  signal addr_a_4_INBUF : STD_LOGIC;
  signal addr_b_1_INBUF : STD_LOGIC;
  signal addr_a_5_INBUF : STD_LOGIC;
  signal addr_b_2_INBUF : STD_LOGIC;
  signal addr_a_6_INBUF : STD_LOGIC;
  signal addr_a_10_INBUF : STD_LOGIC;
  signal addr_b_3_INBUF : STD_LOGIC;
  signal addr_a_7_INBUF : STD_LOGIC;
  signal dop_a_O : STD_LOGIC;
  signal addr_b_4_INBUF : STD_LOGIC;
  signal addr_a_8_INBUF : STD_LOGIC;
  signal addr_b_5_INBUF : STD_LOGIC;
  signal addr_a_9_INBUF : STD_LOGIC;
  signal do_b_10_O : STD_LOGIC;
  signal addr_b_6_INBUF : STD_LOGIC;
  signal do_b_11_O : STD_LOGIC;
  signal addr_b_7_INBUF : STD_LOGIC;
  signal do_b_20_O : STD_LOGIC;
  signal do_b_12_O : STD_LOGIC;
  signal addr_b_8_INBUF : STD_LOGIC;
  signal clk_BUFGP_BUFG_S_INVNOT : STD_LOGIC;
  signal clk_BUFGP_BUFG_I0_INV : STD_LOGIC;
  signal do_b_21_O : STD_LOGIC;
  signal do_b_13_O : STD_LOGIC;
  signal do_b_30_O : STD_LOGIC;
  signal do_b_22_O : STD_LOGIC;
  signal do_b_14_O : STD_LOGIC;
  signal do_b_31_O : STD_LOGIC;
  signal do_b_23_O : STD_LOGIC;
  signal do_b_15_O : STD_LOGIC;
  signal do_b_24_O : STD_LOGIC;
  signal do_b_16_O : STD_LOGIC;
  signal do_b_25_O : STD_LOGIC;
  signal do_b_17_O : STD_LOGIC;
  signal do_c_10_O : STD_LOGIC;
  signal do_b_26_O : STD_LOGIC;
  signal do_b_18_O : STD_LOGIC;
  signal clk_INBUF : STD_LOGIC;
  signal do_c_11_O : STD_LOGIC;
  signal do_b_27_O : STD_LOGIC;
  signal do_b_19_O : STD_LOGIC;
  signal do_c_12_O : STD_LOGIC;
  signal do_b_28_O : STD_LOGIC;
  signal do_c_13_O : STD_LOGIC;
  signal do_b_29_O : STD_LOGIC;
  signal do_c_14_O : STD_LOGIC;
  signal en_a_INBUF : STD_LOGIC;
  signal en_b_INBUF : STD_LOGIC;
  signal do_c_15_O : STD_LOGIC;
  signal do_a_0_O : STD_LOGIC;
  signal do_a_1_O : STD_LOGIC;
  signal do_a_2_O : STD_LOGIC;
  signal we_a_INBUF : STD_LOGIC;
  signal do_a_3_O : STD_LOGIC;
  signal we_b_INBUF : STD_LOGIC;
  signal do_b_0_O : STD_LOGIC;
  signal do_a_4_O : STD_LOGIC;
  signal dop_b_0_O : STD_LOGIC;
  signal do_b_1_O : STD_LOGIC;
  signal do_a_5_O : STD_LOGIC;
  signal di_a_0_INBUF : STD_LOGIC;
  signal dop_b_1_O : STD_LOGIC;
  signal do_b_2_O : STD_LOGIC;
  signal do_a_6_O : STD_LOGIC;
  signal di_a_1_INBUF : STD_LOGIC;
  signal dop_b_2_O : STD_LOGIC;
  signal do_b_3_O : STD_LOGIC;
  signal do_a_7_O : STD_LOGIC;
  signal di_a_2_INBUF : STD_LOGIC;
  signal dop_b_3_O : STD_LOGIC;
  signal do_c_0_O : STD_LOGIC;
  signal do_b_4_O : STD_LOGIC;
  signal di_a_3_INBUF : STD_LOGIC;
  signal dop_c_0_O : STD_LOGIC;
  signal do_c_1_O : STD_LOGIC;
  signal do_b_5_O : STD_LOGIC;
  signal di_a_4_INBUF : STD_LOGIC;
  signal dop_c_1_O : STD_LOGIC;
  signal do_c_2_O : STD_LOGIC;
  signal do_b_6_O : STD_LOGIC;
  signal di_a_5_INBUF : STD_LOGIC;
  signal do_c_3_O : STD_LOGIC;
  signal do_b_7_O : STD_LOGIC;
  signal di_a_6_INBUF : STD_LOGIC;
  signal dip_a_INBUF : STD_LOGIC;
  signal do_c_4_O : STD_LOGIC;
  signal do_b_8_O : STD_LOGIC;
  signal di_a_7_INBUF : STD_LOGIC;
  signal do_c_5_O : STD_LOGIC;
  signal do_b_9_O : STD_LOGIC;
  signal do_c_6_O : STD_LOGIC;
  signal do_c_7_O : STD_LOGIC;
  signal do_c_8_O : STD_LOGIC;
  signal do_c_9_O : STD_LOGIC;
  signal ssr_a_INBUF : STD_LOGIC;
  signal ssr_b_INBUF : STD_LOGIC;
  signal addr_a_0_INBUF : STD_LOGIC;
  signal addr_a_1_INBUF : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal di_b : STD_LOGIC_VECTOR ( 23 downto 16 );
  signal dip_b : STD_LOGIC_VECTOR ( 2 downto 2 );
  signal NlwBufferSignal_u_s18_ADDR : STD_LOGIC_VECTOR ( 9 downto 0 );
  signal NlwBufferSignal_u_s18_DI : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal NlwBufferSignal_u_asym_ADDRA : STD_LOGIC_VECTOR ( 10 downto 0 );
  signal NlwBufferSignal_u_asym_ADDRB : STD_LOGIC_VECTOR ( 8 downto 0 );
  signal NlwBufferSignal_u_asym_DIA : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal NlwBufferSignal_u_asym_DIPA : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal NlwBufferSignal_u_asym_DIB : STD_LOGIC_VECTOR ( 31 downto 0 );
  signal NlwBufferSignal_u_asym_DIPB : STD_LOGIC_VECTOR ( 3 downto 0 );
begin
  addr_a_2_IBUF : X_BUF
    generic map(
      LOC => "IPAD209",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(2),
      O => addr_a_2_INBUF
    );
  addr_a_2_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD209",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_2_INBUF,
      O => addr_a_2_IBUF_496
    );
  addr_a_3_IBUF : X_BUF
    generic map(
      LOC => "IPAD204",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(3),
      O => addr_a_3_INBUF
    );
  addr_a_3_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD204",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_3_INBUF,
      O => addr_a_3_IBUF_497
    );
  addr_b_0_IBUF : X_BUF
    generic map(
      LOC => "IPAD119",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(0),
      O => addr_b_0_INBUF
    );
  addr_b_0_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD119",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_0_INBUF,
      O => addr_b_0_IBUF_498
    );
  addr_a_4_IBUF : X_BUF
    generic map(
      LOC => "IPAD199",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(4),
      O => addr_a_4_INBUF
    );
  addr_a_4_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD199",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_4_INBUF,
      O => addr_a_4_IBUF_499
    );
  addr_b_1_IBUF : X_BUF
    generic map(
      LOC => "IPAD112",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(1),
      O => addr_b_1_INBUF
    );
  addr_b_1_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD112",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_1_INBUF,
      O => addr_b_1_IBUF_500
    );
  addr_a_5_IBUF : X_BUF
    generic map(
      LOC => "IPAD194",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(5),
      O => addr_a_5_INBUF
    );
  addr_a_5_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD194",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_5_INBUF,
      O => addr_a_5_IBUF_501
    );
  addr_b_2_IBUF : X_BUF
    generic map(
      LOC => "IPAD108",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(2),
      O => addr_b_2_INBUF
    );
  addr_b_2_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD108",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_2_INBUF,
      O => addr_b_2_IBUF_502
    );
  addr_a_6_IBUF : X_BUF
    generic map(
      LOC => "IPAD189",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(6),
      O => addr_a_6_INBUF
    );
  addr_a_6_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD189",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_6_INBUF,
      O => addr_a_6_IBUF_503
    );
  addr_a_10_IBUF : X_BUF
    generic map(
      LOC => "IPAD174",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(10),
      O => addr_a_10_INBUF
    );
  addr_a_10_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD174",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_10_INBUF,
      O => addr_a_10_IBUF_504
    );
  addr_b_3_IBUF : X_BUF
    generic map(
      LOC => "IPAD103",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(3),
      O => addr_b_3_INBUF
    );
  addr_b_3_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD103",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_3_INBUF,
      O => addr_b_3_IBUF_505
    );
  addr_a_7_IBUF : X_BUF
    generic map(
      LOC => "IPAD184",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(7),
      O => addr_a_7_INBUF
    );
  addr_a_7_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD184",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_7_INBUF,
      O => addr_a_7_IBUF_506
    );
  dop_a_OBUF : X_OBUF
    generic map(
      LOC => "PAD14"
    )
    port map (
      I => dop_a_O,
      O => dop_a
    );
  addr_b_4_IBUF : X_BUF
    generic map(
      LOC => "IPAD98",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(4),
      O => addr_b_4_INBUF
    );
  addr_b_4_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD98",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_4_INBUF,
      O => addr_b_4_IBUF_508
    );
  addr_a_8_IBUF : X_BUF
    generic map(
      LOC => "IPAD180",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(8),
      O => addr_a_8_INBUF
    );
  addr_a_8_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD180",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_8_INBUF,
      O => addr_a_8_IBUF_509
    );
  addr_b_5_IBUF : X_BUF
    generic map(
      LOC => "IPAD93",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(5),
      O => addr_b_5_INBUF
    );
  addr_b_5_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD93",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_5_INBUF,
      O => addr_b_5_IBUF_510
    );
  addr_a_9_IBUF : X_BUF
    generic map(
      LOC => "IPAD175",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(9),
      O => addr_a_9_INBUF
    );
  addr_a_9_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD175",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_9_INBUF,
      O => addr_a_9_IBUF_511
    );
  do_b_10_OBUF : X_OBUF
    generic map(
      LOC => "PAD27"
    )
    port map (
      I => do_b_10_O,
      O => do_b(10)
    );
  addr_b_6_IBUF : X_BUF
    generic map(
      LOC => "IPAD88",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(6),
      O => addr_b_6_INBUF
    );
  addr_b_6_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD88",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_6_INBUF,
      O => addr_b_6_IBUF_513
    );
  do_b_11_OBUF : X_OBUF
    generic map(
      LOC => "PAD30"
    )
    port map (
      I => do_b_11_O,
      O => do_b(11)
    );
  addr_b_7_IBUF : X_BUF
    generic map(
      LOC => "IPAD83",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(7),
      O => addr_b_7_INBUF
    );
  addr_b_7_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD83",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_7_INBUF,
      O => addr_b_7_IBUF_515
    );
  do_b_20_OBUF : X_OBUF
    generic map(
      LOC => "PAD41"
    )
    port map (
      I => do_b_20_O,
      O => do_b(20)
    );
  do_b_12_OBUF : X_OBUF
    generic map(
      LOC => "PAD31"
    )
    port map (
      I => do_b_12_O,
      O => do_b(12)
    );
  addr_b_8_IBUF : X_BUF
    generic map(
      LOC => "IPAD78",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(8),
      O => addr_b_8_INBUF
    );
  addr_b_8_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD78",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_8_INBUF,
      O => addr_b_8_IBUF_518
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
  u_s18 : X_RAMB16_S18
    generic map(
      INIT_00 => X"FFFFEEEEDDDDCCCCBBBBAAAA9999888877776666555544443333222211110000",
      INIT_01 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_02 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_03 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_04 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_05 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_06 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_07 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_08 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_09 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_10 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_11 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_12 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_13 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_14 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_15 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_16 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_17 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_18 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_19 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_20 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_21 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_22 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_23 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_24 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_25 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_26 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_27 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_28 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_29 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_30 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_31 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_32 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_33 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_34 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_35 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_36 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_37 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_38 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_39 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_00 => X"000000000000000000000000000000000000000000000000000000001B1B1B1B",
      INITP_01 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_02 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_03 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_04 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_05 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_06 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_07 => X"0000000000000000000000000000000000000000000000000000000000000000",
      SRVAL => X"38001",
      INIT => X"00F0F",
      WRITE_MODE => "NO_CHANGE",
      LOC => "RAMB16_X0Y7"
    )
    port map (
      CLK => clk_BUFGP,
      EN => en_b_IBUF_522,
      SSR => ssr_a_IBUF_523,
      WE => we_a_IBUF_524,
      ADDR(9) => NlwBufferSignal_u_s18_ADDR(9),
      ADDR(8) => NlwBufferSignal_u_s18_ADDR(8),
      ADDR(7) => NlwBufferSignal_u_s18_ADDR(7),
      ADDR(6) => NlwBufferSignal_u_s18_ADDR(6),
      ADDR(5) => NlwBufferSignal_u_s18_ADDR(5),
      ADDR(4) => NlwBufferSignal_u_s18_ADDR(4),
      ADDR(3) => NlwBufferSignal_u_s18_ADDR(3),
      ADDR(2) => NlwBufferSignal_u_s18_ADDR(2),
      ADDR(1) => NlwBufferSignal_u_s18_ADDR(1),
      ADDR(0) => NlwBufferSignal_u_s18_ADDR(0),
      DI(15) => NlwBufferSignal_u_s18_DI(15),
      DI(14) => NlwBufferSignal_u_s18_DI(14),
      DI(13) => NlwBufferSignal_u_s18_DI(13),
      DI(12) => NlwBufferSignal_u_s18_DI(12),
      DI(11) => NlwBufferSignal_u_s18_DI(11),
      DI(10) => NlwBufferSignal_u_s18_DI(10),
      DI(9) => NlwBufferSignal_u_s18_DI(9),
      DI(8) => NlwBufferSignal_u_s18_DI(8),
      DI(7) => NlwBufferSignal_u_s18_DI(7),
      DI(6) => NlwBufferSignal_u_s18_DI(6),
      DI(5) => NlwBufferSignal_u_s18_DI(5),
      DI(4) => NlwBufferSignal_u_s18_DI(4),
      DI(3) => NlwBufferSignal_u_s18_DI(3),
      DI(2) => NlwBufferSignal_u_s18_DI(2),
      DI(1) => NlwBufferSignal_u_s18_DI(1),
      DI(0) => NlwBufferSignal_u_s18_DI(0),
      DIP(1) => '1',
      DIP(0) => '0',
      DO(15) => do_c_15_OBUF_559,
      DO(14) => do_c_14_OBUF_558,
      DO(13) => do_c_13_OBUF_557,
      DO(12) => do_c_12_OBUF_556,
      DO(11) => do_c_11_OBUF_555,
      DO(10) => do_c_10_OBUF_554,
      DO(9) => do_c_9_OBUF_553,
      DO(8) => do_c_8_OBUF_552,
      DO(7) => do_c_7_OBUF_551,
      DO(6) => do_c_6_OBUF_550,
      DO(5) => do_c_5_OBUF_549,
      DO(4) => do_c_4_OBUF_548,
      DO(3) => do_c_3_OBUF_547,
      DO(2) => do_c_2_OBUF_546,
      DO(1) => do_c_1_OBUF_545,
      DO(0) => do_c_0_OBUF_544,
      DOP(1) => dop_c_1_OBUF_561,
      DOP(0) => dop_c_0_OBUF_560
    );
  u_asym : X_RAMB16_S9_S36
    generic map(
      INIT_A => X"1A5",
      INIT_B => X"F01234567",
      SRVAL_A => X"03C",
      SRVAL_B => X"989ABCDEF",
      SIM_COLLISION_CHECK => "ALL",
      WRITE_MODE_A => "WRITE_FIRST",
      WRITE_MODE_B => "READ_FIRST",
      INIT_00 => X"00112233445566778899AABBCCDDEEFF0F1E2D3C4B5A69788796A5B4C3D2E1F0",
      INIT_01 => X"DEADBEEFCAFEBABE0123456789ABCDEFFEDCBA9876543210A5A5A5A55A5A5A5A",
      INIT_02 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_03 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_04 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_05 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_06 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_07 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_08 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_09 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_0F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_10 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_11 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_12 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_13 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_14 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_15 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_16 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_17 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_18 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_19 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_1F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_20 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_21 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_22 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_23 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_24 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_25 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_26 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_27 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_28 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_29 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_2F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_30 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_31 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_32 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_33 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_34 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_35 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_36 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_37 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_38 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_39 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3A => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3B => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3C => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3D => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3E => X"0000000000000000000000000000000000000000000000000000000000000000",
      INIT_3F => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_00 => X"000000000000000000000000000000000000000000000000F0F0F0F0A5A5C3C3",
      INITP_01 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_02 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_03 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_04 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_05 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_06 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_07 => X"0000000000000000000000000000000000000000000000000000000000000000",
      LOC => "RAMB16_X0Y9",
      SETUP_ALL => 227 ps,
      SETUP_READ_FIRST => 227 ps
    )
    port map (
      CLKA => clk_BUFGP,
      CLKB => clk_BUFGP,
      ENA => en_a_IBUF_562,
      ENB => en_b_IBUF_522,
      SSRA => ssr_a_IBUF_523,
      SSRB => ssr_b_IBUF_563,
      WEA => we_a_IBUF_524,
      WEB => we_b_IBUF_564,
      ADDRA(10) => NlwBufferSignal_u_asym_ADDRA(10),
      ADDRA(9) => NlwBufferSignal_u_asym_ADDRA(9),
      ADDRA(8) => NlwBufferSignal_u_asym_ADDRA(8),
      ADDRA(7) => NlwBufferSignal_u_asym_ADDRA(7),
      ADDRA(6) => NlwBufferSignal_u_asym_ADDRA(6),
      ADDRA(5) => NlwBufferSignal_u_asym_ADDRA(5),
      ADDRA(4) => NlwBufferSignal_u_asym_ADDRA(4),
      ADDRA(3) => NlwBufferSignal_u_asym_ADDRA(3),
      ADDRA(2) => NlwBufferSignal_u_asym_ADDRA(2),
      ADDRA(1) => NlwBufferSignal_u_asym_ADDRA(1),
      ADDRA(0) => NlwBufferSignal_u_asym_ADDRA(0),
      ADDRB(8) => NlwBufferSignal_u_asym_ADDRB(8),
      ADDRB(7) => NlwBufferSignal_u_asym_ADDRB(7),
      ADDRB(6) => NlwBufferSignal_u_asym_ADDRB(6),
      ADDRB(5) => NlwBufferSignal_u_asym_ADDRB(5),
      ADDRB(4) => NlwBufferSignal_u_asym_ADDRB(4),
      ADDRB(3) => NlwBufferSignal_u_asym_ADDRB(3),
      ADDRB(2) => NlwBufferSignal_u_asym_ADDRB(2),
      ADDRB(1) => NlwBufferSignal_u_asym_ADDRB(1),
      ADDRB(0) => NlwBufferSignal_u_asym_ADDRB(0),
      DIA(7) => NlwBufferSignal_u_asym_DIA(7),
      DIA(6) => NlwBufferSignal_u_asym_DIA(6),
      DIA(5) => NlwBufferSignal_u_asym_DIA(5),
      DIA(4) => NlwBufferSignal_u_asym_DIA(4),
      DIA(3) => NlwBufferSignal_u_asym_DIA(3),
      DIA(2) => NlwBufferSignal_u_asym_DIA(2),
      DIA(1) => NlwBufferSignal_u_asym_DIA(1),
      DIA(0) => NlwBufferSignal_u_asym_DIA(0),
      DIPA(0) => NlwBufferSignal_u_asym_DIPA(0),
      DIB(31) => NlwBufferSignal_u_asym_DIB(31),
      DIB(30) => NlwBufferSignal_u_asym_DIB(30),
      DIB(29) => NlwBufferSignal_u_asym_DIB(29),
      DIB(28) => NlwBufferSignal_u_asym_DIB(28),
      DIB(27) => NlwBufferSignal_u_asym_DIB(27),
      DIB(26) => NlwBufferSignal_u_asym_DIB(26),
      DIB(25) => NlwBufferSignal_u_asym_DIB(25),
      DIB(24) => NlwBufferSignal_u_asym_DIB(24),
      DIB(23) => NlwBufferSignal_u_asym_DIB(23),
      DIB(22) => NlwBufferSignal_u_asym_DIB(22),
      DIB(21) => NlwBufferSignal_u_asym_DIB(21),
      DIB(20) => NlwBufferSignal_u_asym_DIB(20),
      DIB(19) => NlwBufferSignal_u_asym_DIB(19),
      DIB(18) => NlwBufferSignal_u_asym_DIB(18),
      DIB(17) => NlwBufferSignal_u_asym_DIB(17),
      DIB(16) => NlwBufferSignal_u_asym_DIB(16),
      DIB(15) => NlwBufferSignal_u_asym_DIB(15),
      DIB(14) => NlwBufferSignal_u_asym_DIB(14),
      DIB(13) => NlwBufferSignal_u_asym_DIB(13),
      DIB(12) => NlwBufferSignal_u_asym_DIB(12),
      DIB(11) => NlwBufferSignal_u_asym_DIB(11),
      DIB(10) => NlwBufferSignal_u_asym_DIB(10),
      DIB(9) => NlwBufferSignal_u_asym_DIB(9),
      DIB(8) => NlwBufferSignal_u_asym_DIB(8),
      DIB(7) => NlwBufferSignal_u_asym_DIB(7),
      DIB(6) => NlwBufferSignal_u_asym_DIB(6),
      DIB(5) => NlwBufferSignal_u_asym_DIB(5),
      DIB(4) => NlwBufferSignal_u_asym_DIB(4),
      DIB(3) => NlwBufferSignal_u_asym_DIB(3),
      DIB(2) => NlwBufferSignal_u_asym_DIB(2),
      DIB(1) => NlwBufferSignal_u_asym_DIB(1),
      DIB(0) => NlwBufferSignal_u_asym_DIB(0),
      DIPB(3) => NlwBufferSignal_u_asym_DIPB(3),
      DIPB(2) => NlwBufferSignal_u_asym_DIPB(2),
      DIPB(1) => NlwBufferSignal_u_asym_DIPB(1),
      DIPB(0) => NlwBufferSignal_u_asym_DIPB(0),
      DOA(7) => do_a_7_OBUF_574,
      DOA(6) => do_a_6_OBUF_573,
      DOA(5) => do_a_5_OBUF_572,
      DOA(4) => do_a_4_OBUF_571,
      DOA(3) => do_a_3_OBUF_570,
      DOA(2) => do_a_2_OBUF_569,
      DOA(1) => do_a_1_OBUF_568,
      DOA(0) => do_a_0_OBUF_567,
      DOPA(0) => dop_a_OBUF_507,
      DOB(31) => do_b_31_OBUF_602,
      DOB(30) => do_b_30_OBUF_601,
      DOB(29) => do_b_29_OBUF_600,
      DOB(28) => do_b_28_OBUF_599,
      DOB(27) => do_b_27_OBUF_598,
      DOB(26) => do_b_26_OBUF_597,
      DOB(25) => do_b_25_OBUF_596,
      DOB(24) => do_b_24_OBUF_595,
      DOB(23) => do_b_23_OBUF_594,
      DOB(22) => do_b_22_OBUF_593,
      DOB(21) => do_b_21_OBUF_592,
      DOB(20) => do_b_20_OBUF_516,
      DOB(19) => do_b_19_OBUF_591,
      DOB(18) => do_b_18_OBUF_590,
      DOB(17) => do_b_17_OBUF_589,
      DOB(16) => do_b_16_OBUF_588,
      DOB(15) => do_b_15_OBUF_587,
      DOB(14) => do_b_14_OBUF_586,
      DOB(13) => do_b_13_OBUF_585,
      DOB(12) => do_b_12_OBUF_517,
      DOB(11) => do_b_11_OBUF_514,
      DOB(10) => do_b_10_OBUF_512,
      DOB(9) => do_b_9_OBUF_584,
      DOB(8) => do_b_8_OBUF_583,
      DOB(7) => do_b_7_OBUF_582,
      DOB(6) => do_b_6_OBUF_581,
      DOB(5) => do_b_5_OBUF_580,
      DOB(4) => do_b_4_OBUF_579,
      DOB(3) => do_b_3_OBUF_578,
      DOB(2) => do_b_2_OBUF_577,
      DOB(1) => do_b_1_OBUF_576,
      DOB(0) => do_b_0_OBUF_575,
      DOPB(3) => dop_b_3_OBUF_606,
      DOPB(2) => dop_b_2_OBUF_605,
      DOPB(1) => dop_b_1_OBUF_604,
      DOPB(0) => dop_b_0_OBUF_603
    );
  di_b_21_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y49",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(21),
      O => di_b_21_0
    );
  di_b_not0001_5_1_INV_0 : X_LUT4
    generic map(
      INIT => X"3333",
      LOC => "SLICE_X33Y49"
    )
    port map (
      ADR0 => VCC,
      ADR1 => di_a_5_IBUF_540,
      ADR2 => VCC,
      ADR3 => VCC,
      O => di_b(21)
    );
  di_b_23_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X38Y52",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(23),
      O => di_b_23_0
    );
  di_b_not0001_7_1_INV_0 : X_LUT4
    generic map(
      INIT => X"00FF",
      LOC => "SLICE_X38Y52"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => di_a_7_IBUF_542,
      O => di_b(23)
    );
  dip_b_2_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X35Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => dip_b(2),
      O => dip_b_2_0
    );
  dip_b_not00011_INV_0 : X_LUT4
    generic map(
      INIT => X"3333",
      LOC => "SLICE_X35Y64"
    )
    port map (
      ADR0 => VCC,
      ADR1 => dip_a_IBUF_565,
      ADR2 => VCC,
      ADR3 => VCC,
      O => dip_b(2)
    );
  di_b_17_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X31Y54",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(17),
      O => di_b_17_0
    );
  di_b_17_1_INV_0 : X_LUT4
    generic map(
      INIT => X"0F0F",
      LOC => "SLICE_X31Y54"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => di_a_1_IBUF_536,
      ADR3 => VCC,
      O => di_b(17)
    );
  di_b_19_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X37Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(19),
      O => di_b_19_0
    );
  di_b_19_1_INV_0 : X_LUT4
    generic map(
      INIT => X"00FF",
      LOC => "SLICE_X37Y53"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => di_a_3_IBUF_538,
      O => di_b(19)
    );
  di_b_16_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X31Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(16),
      O => di_b_16_0
    );
  di_b_not0001_0_1_INV_0 : X_LUT4
    generic map(
      INIT => X"00FF",
      LOC => "SLICE_X31Y53"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => di_a_0_IBUF_535,
      O => di_b(16)
    );
  di_b_18_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X37Y54",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(18),
      O => di_b_18_0
    );
  di_b_not0001_2_1_INV_0 : X_LUT4
    generic map(
      INIT => X"0F0F",
      LOC => "SLICE_X37Y54"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => di_a_2_IBUF_537,
      ADR3 => VCC,
      O => di_b(18)
    );
  di_b_20_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X31Y52",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(20),
      O => di_b_20_0
    );
  di_b_20_1_INV_0 : X_LUT4
    generic map(
      INIT => X"0F0F",
      LOC => "SLICE_X31Y52"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => di_a_4_IBUF_539,
      ADR3 => VCC,
      O => di_b(20)
    );
  di_b_22_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y50",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(22),
      O => di_b_22_0
    );
  di_b_22_1_INV_0 : X_LUT4
    generic map(
      INIT => X"0F0F",
      LOC => "SLICE_X33Y50"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => di_a_6_IBUF_541,
      ADR3 => VCC,
      O => di_b(22)
    );
  do_b_21_OBUF : X_OBUF
    generic map(
      LOC => "PAD44"
    )
    port map (
      I => do_b_21_O,
      O => do_b(21)
    );
  do_b_13_OBUF : X_OBUF
    generic map(
      LOC => "PAD32"
    )
    port map (
      I => do_b_13_O,
      O => do_b(13)
    );
  do_b_30_OBUF : X_OBUF
    generic map(
      LOC => "PAD56"
    )
    port map (
      I => do_b_30_O,
      O => do_b(30)
    );
  do_b_22_OBUF : X_OBUF
    generic map(
      LOC => "PAD45"
    )
    port map (
      I => do_b_22_O,
      O => do_b(22)
    );
  do_b_14_OBUF : X_OBUF
    generic map(
      LOC => "PAD33"
    )
    port map (
      I => do_b_14_O,
      O => do_b(14)
    );
  do_b_31_OBUF : X_OBUF
    generic map(
      LOC => "PAD57"
    )
    port map (
      I => do_b_31_O,
      O => do_b(31)
    );
  do_b_23_OBUF : X_OBUF
    generic map(
      LOC => "PAD47"
    )
    port map (
      I => do_b_23_O,
      O => do_b(23)
    );
  do_b_15_OBUF : X_OBUF
    generic map(
      LOC => "PAD34"
    )
    port map (
      I => do_b_15_O,
      O => do_b(15)
    );
  do_b_24_OBUF : X_OBUF
    generic map(
      LOC => "PAD48"
    )
    port map (
      I => do_b_24_O,
      O => do_b(24)
    );
  do_b_16_OBUF : X_OBUF
    generic map(
      LOC => "PAD37"
    )
    port map (
      I => do_b_16_O,
      O => do_b(16)
    );
  do_b_25_OBUF : X_OBUF
    generic map(
      LOC => "PAD49"
    )
    port map (
      I => do_b_25_O,
      O => do_b(25)
    );
  do_b_17_OBUF : X_OBUF
    generic map(
      LOC => "PAD38"
    )
    port map (
      I => do_b_17_O,
      O => do_b(17)
    );
  do_c_10_OBUF : X_OBUF
    generic map(
      LOC => "PAD77"
    )
    port map (
      I => do_c_10_O,
      O => do_c(10)
    );
  do_b_26_OBUF : X_OBUF
    generic map(
      LOC => "PAD50"
    )
    port map (
      I => do_b_26_O,
      O => do_b(26)
    );
  do_b_18_OBUF : X_OBUF
    generic map(
      LOC => "PAD39"
    )
    port map (
      I => do_b_18_O,
      O => do_b(18)
    );
  clk_BUFGP_IBUFG : X_BUF
    generic map(
      LOC => "IPAD29",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk,
      O => clk_INBUF
    );
  do_c_11_OBUF : X_OBUF
    generic map(
      LOC => "PAD79"
    )
    port map (
      I => do_c_11_O,
      O => do_c(11)
    );
  do_b_27_OBUF : X_OBUF
    generic map(
      LOC => "PAD51"
    )
    port map (
      I => do_b_27_O,
      O => do_b(27)
    );
  do_b_19_OBUF : X_OBUF
    generic map(
      LOC => "PAD40"
    )
    port map (
      I => do_b_19_O,
      O => do_b(19)
    );
  do_c_12_OBUF : X_OBUF
    generic map(
      LOC => "PAD80"
    )
    port map (
      I => do_c_12_O,
      O => do_c(12)
    );
  do_b_28_OBUF : X_OBUF
    generic map(
      LOC => "PAD52"
    )
    port map (
      I => do_b_28_O,
      O => do_b(28)
    );
  do_c_13_OBUF : X_OBUF
    generic map(
      LOC => "PAD81"
    )
    port map (
      I => do_c_13_O,
      O => do_c(13)
    );
  do_b_29_OBUF : X_OBUF
    generic map(
      LOC => "PAD53"
    )
    port map (
      I => do_b_29_O,
      O => do_b(29)
    );
  do_c_14_OBUF : X_OBUF
    generic map(
      LOC => "PAD82"
    )
    port map (
      I => do_c_14_O,
      O => do_c(14)
    );
  en_a_IBUF : X_BUF
    generic map(
      LOC => "IPAD9",
      PATHPULSE => 638 ps
    )
    port map (
      I => en_a,
      O => en_a_INBUF
    );
  en_a_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD9",
      PATHPULSE => 638 ps
    )
    port map (
      I => en_a_INBUF,
      O => en_a_IBUF_562
    );
  en_b_IBUF : X_BUF
    generic map(
      LOC => "IPAD129",
      PATHPULSE => 638 ps
    )
    port map (
      I => en_b,
      O => en_b_INBUF
    );
  en_b_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD129",
      PATHPULSE => 638 ps
    )
    port map (
      I => en_b_INBUF,
      O => en_b_IBUF_522
    );
  do_c_15_OBUF : X_OBUF
    generic map(
      LOC => "PAD84"
    )
    port map (
      I => do_c_15_O,
      O => do_c(15)
    );
  do_a_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD2"
    )
    port map (
      I => do_a_0_O,
      O => do_a(0)
    );
  do_a_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD4"
    )
    port map (
      I => do_a_1_O,
      O => do_a(1)
    );
  do_a_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD5"
    )
    port map (
      I => do_a_2_O,
      O => do_a(2)
    );
  we_a_IBUF : X_BUF
    generic map(
      LOC => "IPAD228",
      PATHPULSE => 638 ps
    )
    port map (
      I => we_a,
      O => we_a_INBUF
    );
  we_a_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD228",
      PATHPULSE => 638 ps
    )
    port map (
      I => we_a_INBUF,
      O => we_a_IBUF_524
    );
  do_a_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD6"
    )
    port map (
      I => do_a_3_O,
      O => do_a(3)
    );
  we_b_IBUF : X_BUF
    generic map(
      LOC => "IPAD126",
      PATHPULSE => 638 ps
    )
    port map (
      I => we_b,
      O => we_b_INBUF
    );
  we_b_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD126",
      PATHPULSE => 638 ps
    )
    port map (
      I => we_b_INBUF,
      O => we_b_IBUF_564
    );
  do_b_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD15"
    )
    port map (
      I => do_b_0_O,
      O => do_b(0)
    );
  do_a_4_OBUF : X_OBUF
    generic map(
      LOC => "PAD7"
    )
    port map (
      I => do_a_4_O,
      O => do_a(4)
    );
  dop_b_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD60"
    )
    port map (
      I => dop_b_0_O,
      O => dop_b(0)
    );
  do_b_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD16"
    )
    port map (
      I => do_b_1_O,
      O => do_b(1)
    );
  do_a_5_OBUF : X_OBUF
    generic map(
      LOC => "PAD8"
    )
    port map (
      I => do_a_5_O,
      O => do_a(5)
    );
  di_a_0_IBUF : X_BUF
    generic map(
      LOC => "IPAD171",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(0),
      O => di_a_0_INBUF
    );
  di_a_0_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD171",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_0_INBUF,
      O => di_a_0_IBUF_535
    );
  dop_b_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD61"
    )
    port map (
      I => dop_b_1_O,
      O => dop_b(1)
    );
  do_b_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD17"
    )
    port map (
      I => do_b_2_O,
      O => do_b(2)
    );
  do_a_6_OBUF : X_OBUF
    generic map(
      LOC => "PAD11"
    )
    port map (
      I => do_a_6_O,
      O => do_a(6)
    );
  di_a_1_IBUF : X_BUF
    generic map(
      LOC => "IPAD170",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(1),
      O => di_a_1_INBUF
    );
  di_a_1_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD170",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_1_INBUF,
      O => di_a_1_IBUF_536
    );
  dop_b_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD62"
    )
    port map (
      I => dop_b_2_O,
      O => dop_b(2)
    );
  do_b_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD18"
    )
    port map (
      I => do_b_3_O,
      O => do_b(3)
    );
  do_a_7_OBUF : X_OBUF
    generic map(
      LOC => "PAD12"
    )
    port map (
      I => do_a_7_O,
      O => do_a(7)
    );
  di_a_2_IBUF : X_BUF
    generic map(
      LOC => "IPAD162",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(2),
      O => di_a_2_INBUF
    );
  di_a_2_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD162",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_2_INBUF,
      O => di_a_2_IBUF_537
    );
  dop_b_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD63"
    )
    port map (
      I => dop_b_3_O,
      O => dop_b(3)
    );
  do_c_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD65"
    )
    port map (
      I => do_c_0_O,
      O => do_c(0)
    );
  do_b_4_OBUF : X_OBUF
    generic map(
      LOC => "PAD19"
    )
    port map (
      I => do_b_4_O,
      O => do_b(4)
    );
  di_a_3_IBUF : X_BUF
    generic map(
      LOC => "IPAD159",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(3),
      O => di_a_3_INBUF
    );
  di_a_3_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD159",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_3_INBUF,
      O => di_a_3_IBUF_538
    );
  dop_c_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD85"
    )
    port map (
      I => dop_c_0_O,
      O => dop_c(0)
    );
  do_c_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD66"
    )
    port map (
      I => do_c_1_O,
      O => do_c(1)
    );
  do_b_5_OBUF : X_OBUF
    generic map(
      LOC => "PAD20"
    )
    port map (
      I => do_b_5_O,
      O => do_b(5)
    );
  di_a_4_IBUF : X_BUF
    generic map(
      LOC => "IPAD158",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(4),
      O => di_a_4_INBUF
    );
  di_a_4_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD158",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_4_INBUF,
      O => di_a_4_IBUF_539
    );
  dop_c_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD86"
    )
    port map (
      I => dop_c_1_O,
      O => dop_c(1)
    );
  do_c_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD67"
    )
    port map (
      I => do_c_2_O,
      O => do_c(2)
    );
  do_b_6_OBUF : X_OBUF
    generic map(
      LOC => "PAD23"
    )
    port map (
      I => do_b_6_O,
      O => do_b(6)
    );
  di_a_5_IBUF : X_BUF
    generic map(
      LOC => "IPAD152",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(5),
      O => di_a_5_INBUF
    );
  di_a_5_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD152",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_5_INBUF,
      O => di_a_5_IBUF_540
    );
  do_c_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD69"
    )
    port map (
      I => do_c_3_O,
      O => do_c(3)
    );
  do_b_7_OBUF : X_OBUF
    generic map(
      LOC => "PAD24"
    )
    port map (
      I => do_b_7_O,
      O => do_b(7)
    );
  di_a_6_IBUF : X_BUF
    generic map(
      LOC => "IPAD151",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(6),
      O => di_a_6_INBUF
    );
  di_a_6_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD151",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_6_INBUF,
      O => di_a_6_IBUF_541
    );
  dip_a_IBUF : X_BUF
    generic map(
      LOC => "IPAD137",
      PATHPULSE => 638 ps
    )
    port map (
      I => dip_a,
      O => dip_a_INBUF
    );
  dip_a_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD137",
      PATHPULSE => 638 ps
    )
    port map (
      I => dip_a_INBUF,
      O => dip_a_IBUF_565
    );
  do_c_4_OBUF : X_OBUF
    generic map(
      LOC => "PAD70"
    )
    port map (
      I => do_c_4_O,
      O => do_c(4)
    );
  do_b_8_OBUF : X_OBUF
    generic map(
      LOC => "PAD25"
    )
    port map (
      I => do_b_8_O,
      O => do_b(8)
    );
  di_a_7_IBUF : X_BUF
    generic map(
      LOC => "IPAD138",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(7),
      O => di_a_7_INBUF
    );
  di_a_7_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD138",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_7_INBUF,
      O => di_a_7_IBUF_542
    );
  do_c_5_OBUF : X_OBUF
    generic map(
      LOC => "PAD71"
    )
    port map (
      I => do_c_5_O,
      O => do_c(5)
    );
  do_b_9_OBUF : X_OBUF
    generic map(
      LOC => "PAD26"
    )
    port map (
      I => do_b_9_O,
      O => do_b(9)
    );
  do_c_6_OBUF : X_OBUF
    generic map(
      LOC => "PAD72"
    )
    port map (
      I => do_c_6_O,
      O => do_c(6)
    );
  do_c_7_OBUF : X_OBUF
    generic map(
      LOC => "PAD74"
    )
    port map (
      I => do_c_7_O,
      O => do_c(7)
    );
  do_c_8_OBUF : X_OBUF
    generic map(
      LOC => "PAD75"
    )
    port map (
      I => do_c_8_O,
      O => do_c(8)
    );
  do_c_9_OBUF : X_OBUF
    generic map(
      LOC => "PAD76"
    )
    port map (
      I => do_c_9_O,
      O => do_c(9)
    );
  ssr_a_IBUF : X_BUF
    generic map(
      LOC => "IPAD224",
      PATHPULSE => 638 ps
    )
    port map (
      I => ssr_a,
      O => ssr_a_INBUF
    );
  ssr_a_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD224",
      PATHPULSE => 638 ps
    )
    port map (
      I => ssr_a_INBUF,
      O => ssr_a_IBUF_523
    );
  ssr_b_IBUF : X_BUF
    generic map(
      LOC => "IPAD125",
      PATHPULSE => 638 ps
    )
    port map (
      I => ssr_b,
      O => ssr_b_INBUF
    );
  ssr_b_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD125",
      PATHPULSE => 638 ps
    )
    port map (
      I => ssr_b_INBUF,
      O => ssr_b_IBUF_563
    );
  addr_a_0_IBUF : X_BUF
    generic map(
      LOC => "IPAD219",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(0),
      O => addr_a_0_INBUF
    );
  addr_a_0_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD219",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_0_INBUF,
      O => addr_a_0_IBUF_526
    );
  addr_a_1_IBUF : X_BUF
    generic map(
      LOC => "IPAD214",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(1),
      O => addr_a_1_INBUF
    );
  addr_a_1_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD214",
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_1_INBUF,
      O => addr_a_1_IBUF_525
    );
  dop_a_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD14",
      PATHPULSE => 638 ps
    )
    port map (
      I => dop_a_OBUF_507,
      O => dop_a_O
    );
  do_b_10_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD27",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_10_OBUF_512,
      O => do_b_10_O
    );
  do_b_11_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD30",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_11_OBUF_514,
      O => do_b_11_O
    );
  do_b_20_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD41",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_20_OBUF_516,
      O => do_b_20_O
    );
  do_b_12_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD31",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_12_OBUF_517,
      O => do_b_12_O
    );
  do_b_21_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD44",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_21_OBUF_592,
      O => do_b_21_O
    );
  do_b_13_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD32",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_13_OBUF_585,
      O => do_b_13_O
    );
  do_b_30_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD56",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_30_OBUF_601,
      O => do_b_30_O
    );
  do_b_22_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD45",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_22_OBUF_593,
      O => do_b_22_O
    );
  do_b_14_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD33",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_14_OBUF_586,
      O => do_b_14_O
    );
  do_b_31_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD57",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_31_OBUF_602,
      O => do_b_31_O
    );
  do_b_23_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD47",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_23_OBUF_594,
      O => do_b_23_O
    );
  do_b_15_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD34",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_15_OBUF_587,
      O => do_b_15_O
    );
  do_b_24_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD48",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_24_OBUF_595,
      O => do_b_24_O
    );
  do_b_16_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD37",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_16_OBUF_588,
      O => do_b_16_O
    );
  do_b_25_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD49",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_25_OBUF_596,
      O => do_b_25_O
    );
  do_b_17_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD38",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_17_OBUF_589,
      O => do_b_17_O
    );
  do_c_10_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD77",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_10_OBUF_554,
      O => do_c_10_O
    );
  do_b_26_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD50",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_26_OBUF_597,
      O => do_b_26_O
    );
  do_b_18_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD39",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_18_OBUF_590,
      O => do_b_18_O
    );
  do_c_11_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD79",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_11_OBUF_555,
      O => do_c_11_O
    );
  do_b_27_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD51",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_27_OBUF_598,
      O => do_b_27_O
    );
  do_b_19_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD40",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_19_OBUF_591,
      O => do_b_19_O
    );
  do_c_12_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD80",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_12_OBUF_556,
      O => do_c_12_O
    );
  do_b_28_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD52",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_28_OBUF_599,
      O => do_b_28_O
    );
  do_c_13_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD81",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_13_OBUF_557,
      O => do_c_13_O
    );
  do_b_29_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD53",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_29_OBUF_600,
      O => do_b_29_O
    );
  do_c_14_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD82",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_14_OBUF_558,
      O => do_c_14_O
    );
  do_c_15_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD84",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_15_OBUF_559,
      O => do_c_15_O
    );
  do_a_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD2",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_0_OBUF_567,
      O => do_a_0_O
    );
  do_a_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD4",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_1_OBUF_568,
      O => do_a_1_O
    );
  do_a_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD5",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_2_OBUF_569,
      O => do_a_2_O
    );
  do_a_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD6",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_3_OBUF_570,
      O => do_a_3_O
    );
  do_b_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD15",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_0_OBUF_575,
      O => do_b_0_O
    );
  do_a_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD7",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_4_OBUF_571,
      O => do_a_4_O
    );
  dop_b_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD60",
      PATHPULSE => 638 ps
    )
    port map (
      I => dop_b_0_OBUF_603,
      O => dop_b_0_O
    );
  do_b_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD16",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_1_OBUF_576,
      O => do_b_1_O
    );
  do_a_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD8",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_5_OBUF_572,
      O => do_a_5_O
    );
  dop_b_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD61",
      PATHPULSE => 638 ps
    )
    port map (
      I => dop_b_1_OBUF_604,
      O => dop_b_1_O
    );
  do_b_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD17",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_2_OBUF_577,
      O => do_b_2_O
    );
  do_a_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD11",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_6_OBUF_573,
      O => do_a_6_O
    );
  dop_b_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD62",
      PATHPULSE => 638 ps
    )
    port map (
      I => dop_b_2_OBUF_605,
      O => dop_b_2_O
    );
  do_b_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD18",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_3_OBUF_578,
      O => do_b_3_O
    );
  do_a_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD12",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_7_OBUF_574,
      O => do_a_7_O
    );
  dop_b_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD63",
      PATHPULSE => 638 ps
    )
    port map (
      I => dop_b_3_OBUF_606,
      O => dop_b_3_O
    );
  do_c_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD65",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_0_OBUF_544,
      O => do_c_0_O
    );
  do_b_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD19",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_4_OBUF_579,
      O => do_b_4_O
    );
  dop_c_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD85",
      PATHPULSE => 638 ps
    )
    port map (
      I => dop_c_0_OBUF_560,
      O => dop_c_0_O
    );
  do_c_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD66",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_1_OBUF_545,
      O => do_c_1_O
    );
  do_b_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD20",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_5_OBUF_580,
      O => do_b_5_O
    );
  dop_c_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD86",
      PATHPULSE => 638 ps
    )
    port map (
      I => dop_c_1_OBUF_561,
      O => dop_c_1_O
    );
  do_c_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD67",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_2_OBUF_546,
      O => do_c_2_O
    );
  do_b_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD23",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_6_OBUF_581,
      O => do_b_6_O
    );
  do_c_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD69",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_3_OBUF_547,
      O => do_c_3_O
    );
  do_b_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD24",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_7_OBUF_582,
      O => do_b_7_O
    );
  do_c_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD70",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_4_OBUF_548,
      O => do_c_4_O
    );
  do_b_8_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD25",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_8_OBUF_583,
      O => do_b_8_O
    );
  do_c_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD71",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_5_OBUF_549,
      O => do_c_5_O
    );
  do_b_9_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD26",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_9_OBUF_584,
      O => do_b_9_O
    );
  do_c_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD72",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_6_OBUF_550,
      O => do_c_6_O
    );
  do_c_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD74",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_7_OBUF_551,
      O => do_c_7_O
    );
  do_c_8_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD75",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_8_OBUF_552,
      O => do_c_8_O
    );
  do_c_9_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD76",
      PATHPULSE => 638 ps
    )
    port map (
      I => do_c_9_OBUF_553,
      O => do_c_9_O
    );
  NlwBufferBlock_u_s18_ADDR_9_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_9_IBUF_511,
      O => NlwBufferSignal_u_s18_ADDR(9)
    );
  NlwBufferBlock_u_s18_ADDR_8_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_8_IBUF_509,
      O => NlwBufferSignal_u_s18_ADDR(8)
    );
  NlwBufferBlock_u_s18_ADDR_7_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_7_IBUF_506,
      O => NlwBufferSignal_u_s18_ADDR(7)
    );
  NlwBufferBlock_u_s18_ADDR_6_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_6_IBUF_503,
      O => NlwBufferSignal_u_s18_ADDR(6)
    );
  NlwBufferBlock_u_s18_ADDR_5_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_5_IBUF_501,
      O => NlwBufferSignal_u_s18_ADDR(5)
    );
  NlwBufferBlock_u_s18_ADDR_4_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_4_IBUF_499,
      O => NlwBufferSignal_u_s18_ADDR(4)
    );
  NlwBufferBlock_u_s18_ADDR_3_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_3_IBUF_497,
      O => NlwBufferSignal_u_s18_ADDR(3)
    );
  NlwBufferBlock_u_s18_ADDR_2_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_2_IBUF_496,
      O => NlwBufferSignal_u_s18_ADDR(2)
    );
  NlwBufferBlock_u_s18_ADDR_1_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_1_IBUF_525,
      O => NlwBufferSignal_u_s18_ADDR(1)
    );
  NlwBufferBlock_u_s18_ADDR_0_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_0_IBUF_526,
      O => NlwBufferSignal_u_s18_ADDR(0)
    );
  NlwBufferBlock_u_s18_DI_0_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_16_0,
      O => NlwBufferSignal_u_s18_DI(0)
    );
  NlwBufferBlock_u_s18_DI_1_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_17_0,
      O => NlwBufferSignal_u_s18_DI(1)
    );
  NlwBufferBlock_u_s18_DI_2_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_18_0,
      O => NlwBufferSignal_u_s18_DI(2)
    );
  NlwBufferBlock_u_s18_DI_3_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_19_0,
      O => NlwBufferSignal_u_s18_DI(3)
    );
  NlwBufferBlock_u_s18_DI_4_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_20_0,
      O => NlwBufferSignal_u_s18_DI(4)
    );
  NlwBufferBlock_u_s18_DI_5_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_21_0,
      O => NlwBufferSignal_u_s18_DI(5)
    );
  NlwBufferBlock_u_s18_DI_6_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_22_0,
      O => NlwBufferSignal_u_s18_DI(6)
    );
  NlwBufferBlock_u_s18_DI_7_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_23_0,
      O => NlwBufferSignal_u_s18_DI(7)
    );
  NlwBufferBlock_u_s18_DI_8_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_0_IBUF_535,
      O => NlwBufferSignal_u_s18_DI(8)
    );
  NlwBufferBlock_u_s18_DI_9_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_1_IBUF_536,
      O => NlwBufferSignal_u_s18_DI(9)
    );
  NlwBufferBlock_u_s18_DI_10_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_2_IBUF_537,
      O => NlwBufferSignal_u_s18_DI(10)
    );
  NlwBufferBlock_u_s18_DI_11_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_3_IBUF_538,
      O => NlwBufferSignal_u_s18_DI(11)
    );
  NlwBufferBlock_u_s18_DI_12_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_4_IBUF_539,
      O => NlwBufferSignal_u_s18_DI(12)
    );
  NlwBufferBlock_u_s18_DI_13_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_5_IBUF_540,
      O => NlwBufferSignal_u_s18_DI(13)
    );
  NlwBufferBlock_u_s18_DI_14_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_6_IBUF_541,
      O => NlwBufferSignal_u_s18_DI(14)
    );
  NlwBufferBlock_u_s18_DI_15_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_7_IBUF_542,
      O => NlwBufferSignal_u_s18_DI(15)
    );
  NlwBufferBlock_u_asym_ADDRA_10_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_10_IBUF_504,
      O => NlwBufferSignal_u_asym_ADDRA(10)
    );
  NlwBufferBlock_u_asym_ADDRA_9_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_9_IBUF_511,
      O => NlwBufferSignal_u_asym_ADDRA(9)
    );
  NlwBufferBlock_u_asym_ADDRA_8_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_8_IBUF_509,
      O => NlwBufferSignal_u_asym_ADDRA(8)
    );
  NlwBufferBlock_u_asym_ADDRA_7_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_7_IBUF_506,
      O => NlwBufferSignal_u_asym_ADDRA(7)
    );
  NlwBufferBlock_u_asym_ADDRA_6_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_6_IBUF_503,
      O => NlwBufferSignal_u_asym_ADDRA(6)
    );
  NlwBufferBlock_u_asym_ADDRA_5_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_5_IBUF_501,
      O => NlwBufferSignal_u_asym_ADDRA(5)
    );
  NlwBufferBlock_u_asym_ADDRA_4_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_4_IBUF_499,
      O => NlwBufferSignal_u_asym_ADDRA(4)
    );
  NlwBufferBlock_u_asym_ADDRA_3_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_3_IBUF_497,
      O => NlwBufferSignal_u_asym_ADDRA(3)
    );
  NlwBufferBlock_u_asym_ADDRA_2_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_2_IBUF_496,
      O => NlwBufferSignal_u_asym_ADDRA(2)
    );
  NlwBufferBlock_u_asym_ADDRA_1_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_1_IBUF_525,
      O => NlwBufferSignal_u_asym_ADDRA(1)
    );
  NlwBufferBlock_u_asym_ADDRA_0_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_0_IBUF_526,
      O => NlwBufferSignal_u_asym_ADDRA(0)
    );
  NlwBufferBlock_u_asym_ADDRB_8_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_8_IBUF_518,
      O => NlwBufferSignal_u_asym_ADDRB(8)
    );
  NlwBufferBlock_u_asym_ADDRB_7_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_7_IBUF_515,
      O => NlwBufferSignal_u_asym_ADDRB(7)
    );
  NlwBufferBlock_u_asym_ADDRB_6_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_6_IBUF_513,
      O => NlwBufferSignal_u_asym_ADDRB(6)
    );
  NlwBufferBlock_u_asym_ADDRB_5_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_5_IBUF_510,
      O => NlwBufferSignal_u_asym_ADDRB(5)
    );
  NlwBufferBlock_u_asym_ADDRB_4_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_4_IBUF_508,
      O => NlwBufferSignal_u_asym_ADDRB(4)
    );
  NlwBufferBlock_u_asym_ADDRB_3_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_3_IBUF_505,
      O => NlwBufferSignal_u_asym_ADDRB(3)
    );
  NlwBufferBlock_u_asym_ADDRB_2_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_2_IBUF_502,
      O => NlwBufferSignal_u_asym_ADDRB(2)
    );
  NlwBufferBlock_u_asym_ADDRB_1_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_1_IBUF_500,
      O => NlwBufferSignal_u_asym_ADDRB(1)
    );
  NlwBufferBlock_u_asym_ADDRB_0_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_0_IBUF_498,
      O => NlwBufferSignal_u_asym_ADDRB(0)
    );
  NlwBufferBlock_u_asym_DIA_0_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_0_IBUF_535,
      O => NlwBufferSignal_u_asym_DIA(0)
    );
  NlwBufferBlock_u_asym_DIA_1_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_1_IBUF_536,
      O => NlwBufferSignal_u_asym_DIA(1)
    );
  NlwBufferBlock_u_asym_DIA_2_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_2_IBUF_537,
      O => NlwBufferSignal_u_asym_DIA(2)
    );
  NlwBufferBlock_u_asym_DIA_3_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_3_IBUF_538,
      O => NlwBufferSignal_u_asym_DIA(3)
    );
  NlwBufferBlock_u_asym_DIA_4_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_4_IBUF_539,
      O => NlwBufferSignal_u_asym_DIA(4)
    );
  NlwBufferBlock_u_asym_DIA_5_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_5_IBUF_540,
      O => NlwBufferSignal_u_asym_DIA(5)
    );
  NlwBufferBlock_u_asym_DIA_6_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_6_IBUF_541,
      O => NlwBufferSignal_u_asym_DIA(6)
    );
  NlwBufferBlock_u_asym_DIA_7_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_7_IBUF_542,
      O => NlwBufferSignal_u_asym_DIA(7)
    );
  NlwBufferBlock_u_asym_DIPA_0_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dip_a_IBUF_565,
      O => NlwBufferSignal_u_asym_DIPA(0)
    );
  NlwBufferBlock_u_asym_DIB_0_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_0_IBUF_535,
      O => NlwBufferSignal_u_asym_DIB(0)
    );
  NlwBufferBlock_u_asym_DIB_1_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_17_0,
      O => NlwBufferSignal_u_asym_DIB(1)
    );
  NlwBufferBlock_u_asym_DIB_2_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_2_IBUF_537,
      O => NlwBufferSignal_u_asym_DIB(2)
    );
  NlwBufferBlock_u_asym_DIB_3_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_19_0,
      O => NlwBufferSignal_u_asym_DIB(3)
    );
  NlwBufferBlock_u_asym_DIB_4_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_20_0,
      O => NlwBufferSignal_u_asym_DIB(4)
    );
  NlwBufferBlock_u_asym_DIB_5_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_5_IBUF_540,
      O => NlwBufferSignal_u_asym_DIB(5)
    );
  NlwBufferBlock_u_asym_DIB_6_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_22_0,
      O => NlwBufferSignal_u_asym_DIB(6)
    );
  NlwBufferBlock_u_asym_DIB_7_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_7_IBUF_542,
      O => NlwBufferSignal_u_asym_DIB(7)
    );
  NlwBufferBlock_u_asym_DIB_8_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_4_IBUF_539,
      O => NlwBufferSignal_u_asym_DIB(8)
    );
  NlwBufferBlock_u_asym_DIB_9_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_5_IBUF_540,
      O => NlwBufferSignal_u_asym_DIB(9)
    );
  NlwBufferBlock_u_asym_DIB_10_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_6_IBUF_541,
      O => NlwBufferSignal_u_asym_DIB(10)
    );
  NlwBufferBlock_u_asym_DIB_11_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_7_IBUF_542,
      O => NlwBufferSignal_u_asym_DIB(11)
    );
  NlwBufferBlock_u_asym_DIB_12_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_0_IBUF_535,
      O => NlwBufferSignal_u_asym_DIB(12)
    );
  NlwBufferBlock_u_asym_DIB_13_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_1_IBUF_536,
      O => NlwBufferSignal_u_asym_DIB(13)
    );
  NlwBufferBlock_u_asym_DIB_14_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_2_IBUF_537,
      O => NlwBufferSignal_u_asym_DIB(14)
    );
  NlwBufferBlock_u_asym_DIB_15_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_3_IBUF_538,
      O => NlwBufferSignal_u_asym_DIB(15)
    );
  NlwBufferBlock_u_asym_DIB_16_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_16_0,
      O => NlwBufferSignal_u_asym_DIB(16)
    );
  NlwBufferBlock_u_asym_DIB_17_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_17_0,
      O => NlwBufferSignal_u_asym_DIB(17)
    );
  NlwBufferBlock_u_asym_DIB_18_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_18_0,
      O => NlwBufferSignal_u_asym_DIB(18)
    );
  NlwBufferBlock_u_asym_DIB_19_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_19_0,
      O => NlwBufferSignal_u_asym_DIB(19)
    );
  NlwBufferBlock_u_asym_DIB_20_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_20_0,
      O => NlwBufferSignal_u_asym_DIB(20)
    );
  NlwBufferBlock_u_asym_DIB_21_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_21_0,
      O => NlwBufferSignal_u_asym_DIB(21)
    );
  NlwBufferBlock_u_asym_DIB_22_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_22_0,
      O => NlwBufferSignal_u_asym_DIB(22)
    );
  NlwBufferBlock_u_asym_DIB_23_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_23_0,
      O => NlwBufferSignal_u_asym_DIB(23)
    );
  NlwBufferBlock_u_asym_DIB_24_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_0_IBUF_535,
      O => NlwBufferSignal_u_asym_DIB(24)
    );
  NlwBufferBlock_u_asym_DIB_25_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_1_IBUF_536,
      O => NlwBufferSignal_u_asym_DIB(25)
    );
  NlwBufferBlock_u_asym_DIB_26_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_2_IBUF_537,
      O => NlwBufferSignal_u_asym_DIB(26)
    );
  NlwBufferBlock_u_asym_DIB_27_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_3_IBUF_538,
      O => NlwBufferSignal_u_asym_DIB(27)
    );
  NlwBufferBlock_u_asym_DIB_28_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_4_IBUF_539,
      O => NlwBufferSignal_u_asym_DIB(28)
    );
  NlwBufferBlock_u_asym_DIB_29_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_5_IBUF_540,
      O => NlwBufferSignal_u_asym_DIB(29)
    );
  NlwBufferBlock_u_asym_DIB_30_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_6_IBUF_541,
      O => NlwBufferSignal_u_asym_DIB(30)
    );
  NlwBufferBlock_u_asym_DIB_31_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_7_IBUF_542,
      O => NlwBufferSignal_u_asym_DIB(31)
    );
  NlwBufferBlock_u_asym_DIPB_0_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dip_a_IBUF_565,
      O => NlwBufferSignal_u_asym_DIPB(0)
    );
  NlwBufferBlock_u_asym_DIPB_1_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dip_a_IBUF_565,
      O => NlwBufferSignal_u_asym_DIPB(1)
    );
  NlwBufferBlock_u_asym_DIPB_2_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dip_b_2_0,
      O => NlwBufferSignal_u_asym_DIPB(2)
    );
  NlwBufferBlock_u_asym_DIPB_3_Q : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dip_a_IBUF_565,
      O => NlwBufferSignal_u_asym_DIPB(3)
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

