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
    we_a : in STD_LOGIC := 'X';
    we_b : in STD_LOGIC := 'X';
    we_s : in STD_LOGIC := 'X';
    en_a : in STD_LOGIC := 'X';
    en_b : in STD_LOGIC := 'X';
    do_a : out STD_LOGIC_VECTOR ( 15 downto 0 );
    do_b : out STD_LOGIC_VECTOR ( 15 downto 0 );
    do_s : out STD_LOGIC_VECTOR ( 31 downto 0 );
    addr_a : in STD_LOGIC_VECTOR ( 9 downto 0 );
    addr_b : in STD_LOGIC_VECTOR ( 9 downto 0 );
    di_a : in STD_LOGIC_VECTOR ( 15 downto 0 );
    di_b : in STD_LOGIC_VECTOR ( 15 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal do_b_13_OBUF_572 : STD_LOGIC;
  signal di_a_11_IBUF_573 : STD_LOGIC;
  signal addr_b_9_IBUF_574 : STD_LOGIC;
  signal do_b_14_OBUF_575 : STD_LOGIC;
  signal di_a_12_IBUF_576 : STD_LOGIC;
  signal do_b_15_OBUF_577 : STD_LOGIC;
  signal di_a_13_IBUF_578 : STD_LOGIC;
  signal di_a_14_IBUF_579 : STD_LOGIC;
  signal di_a_15_IBUF_580 : STD_LOGIC;
  signal di_b_10_IBUF_582 : STD_LOGIC;
  signal di_b_11_IBUF_583 : STD_LOGIC;
  signal di_b_12_IBUF_584 : STD_LOGIC;
  signal en_a_IBUF_585 : STD_LOGIC;
  signal en_b_IBUF_586 : STD_LOGIC;
  signal do_a_0_OBUF_587 : STD_LOGIC;
  signal di_b_13_IBUF_588 : STD_LOGIC;
  signal do_a_1_OBUF_589 : STD_LOGIC;
  signal di_b_14_IBUF_590 : STD_LOGIC;
  signal do_a_2_OBUF_591 : STD_LOGIC;
  signal di_b_15_IBUF_592 : STD_LOGIC;
  signal we_a_IBUF_593 : STD_LOGIC;
  signal do_a_3_OBUF_594 : STD_LOGIC;
  signal we_b_IBUF_595 : STD_LOGIC;
  signal do_b_0_OBUF_596 : STD_LOGIC;
  signal do_a_4_OBUF_597 : STD_LOGIC;
  signal do_b_1_OBUF_598 : STD_LOGIC;
  signal do_a_5_OBUF_599 : STD_LOGIC;
  signal di_a_0_IBUF_600 : STD_LOGIC;
  signal do_b_2_OBUF_601 : STD_LOGIC;
  signal do_a_6_OBUF_602 : STD_LOGIC;
  signal di_a_1_IBUF_603 : STD_LOGIC;
  signal do_b_3_OBUF_604 : STD_LOGIC;
  signal do_a_7_OBUF_605 : STD_LOGIC;
  signal di_a_2_IBUF_606 : STD_LOGIC;
  signal do_b_4_OBUF_607 : STD_LOGIC;
  signal do_a_8_OBUF_608 : STD_LOGIC;
  signal di_a_3_IBUF_609 : STD_LOGIC;
  signal do_b_5_OBUF_610 : STD_LOGIC;
  signal do_a_9_OBUF_611 : STD_LOGIC;
  signal di_b_0_IBUF_612 : STD_LOGIC;
  signal di_a_4_IBUF_613 : STD_LOGIC;
  signal do_b_6_OBUF_614 : STD_LOGIC;
  signal di_b_1_IBUF_615 : STD_LOGIC;
  signal di_a_5_IBUF_616 : STD_LOGIC;
  signal do_b_7_OBUF_617 : STD_LOGIC;
  signal di_b_2_IBUF_618 : STD_LOGIC;
  signal di_a_6_IBUF_619 : STD_LOGIC;
  signal we_s_IBUF_620 : STD_LOGIC;
  signal do_b_8_OBUF_621 : STD_LOGIC;
  signal di_b_3_IBUF_622 : STD_LOGIC;
  signal di_a_7_IBUF_623 : STD_LOGIC;
  signal do_b_9_OBUF_624 : STD_LOGIC;
  signal di_b_4_IBUF_625 : STD_LOGIC;
  signal di_a_8_IBUF_626 : STD_LOGIC;
  signal di_b_5_IBUF_627 : STD_LOGIC;
  signal di_a_9_IBUF_628 : STD_LOGIC;
  signal di_b_6_IBUF_629 : STD_LOGIC;
  signal di_b_7_IBUF_630 : STD_LOGIC;
  signal di_b_8_IBUF_631 : STD_LOGIC;
  signal di_b_9_IBUF_632 : STD_LOGIC;
  signal do_s_0_OBUF_633 : STD_LOGIC;
  signal do_s_10_OBUF_634 : STD_LOGIC;
  signal do_s_1_OBUF_635 : STD_LOGIC;
  signal do_s_11_OBUF_636 : STD_LOGIC;
  signal do_s_2_OBUF_637 : STD_LOGIC;
  signal do_s_20_OBUF_638 : STD_LOGIC;
  signal do_s_12_OBUF_639 : STD_LOGIC;
  signal do_s_3_OBUF_640 : STD_LOGIC;
  signal do_s_21_OBUF_641 : STD_LOGIC;
  signal do_s_13_OBUF_642 : STD_LOGIC;
  signal do_s_4_OBUF_643 : STD_LOGIC;
  signal do_s_30_OBUF_644 : STD_LOGIC;
  signal do_s_22_OBUF_645 : STD_LOGIC;
  signal do_s_14_OBUF_646 : STD_LOGIC;
  signal do_s_5_OBUF_647 : STD_LOGIC;
  signal do_s_31_OBUF_648 : STD_LOGIC;
  signal do_s_23_OBUF_649 : STD_LOGIC;
  signal do_s_15_OBUF_650 : STD_LOGIC;
  signal do_s_6_OBUF_651 : STD_LOGIC;
  signal addr_a_0_IBUF_652 : STD_LOGIC;
  signal do_s_24_OBUF_653 : STD_LOGIC;
  signal do_s_16_OBUF_654 : STD_LOGIC;
  signal do_s_7_OBUF_655 : STD_LOGIC;
  signal addr_a_1_IBUF_656 : STD_LOGIC;
  signal do_s_25_OBUF_657 : STD_LOGIC;
  signal do_s_17_OBUF_658 : STD_LOGIC;
  signal do_s_8_OBUF_659 : STD_LOGIC;
  signal do_a_10_OBUF_660 : STD_LOGIC;
  signal addr_a_2_IBUF_661 : STD_LOGIC;
  signal do_s_26_OBUF_662 : STD_LOGIC;
  signal do_s_18_OBUF_663 : STD_LOGIC;
  signal do_s_9_OBUF_664 : STD_LOGIC;
  signal do_a_11_OBUF_665 : STD_LOGIC;
  signal addr_a_3_IBUF_666 : STD_LOGIC;
  signal do_s_27_OBUF_667 : STD_LOGIC;
  signal do_s_19_OBUF_668 : STD_LOGIC;
  signal do_a_12_OBUF_669 : STD_LOGIC;
  signal addr_b_0_IBUF_670 : STD_LOGIC;
  signal addr_a_4_IBUF_671 : STD_LOGIC;
  signal do_s_28_OBUF_672 : STD_LOGIC;
  signal do_a_13_OBUF_673 : STD_LOGIC;
  signal addr_b_1_IBUF_674 : STD_LOGIC;
  signal addr_a_5_IBUF_675 : STD_LOGIC;
  signal do_s_29_OBUF_676 : STD_LOGIC;
  signal do_a_14_OBUF_677 : STD_LOGIC;
  signal addr_b_2_IBUF_678 : STD_LOGIC;
  signal addr_a_6_IBUF_679 : STD_LOGIC;
  signal do_a_15_OBUF_680 : STD_LOGIC;
  signal addr_b_3_IBUF_681 : STD_LOGIC;
  signal addr_a_7_IBUF_682 : STD_LOGIC;
  signal addr_b_4_IBUF_683 : STD_LOGIC;
  signal addr_a_8_IBUF_684 : STD_LOGIC;
  signal addr_b_5_IBUF_685 : STD_LOGIC;
  signal addr_a_9_IBUF_686 : STD_LOGIC;
  signal do_b_10_OBUF_687 : STD_LOGIC;
  signal addr_b_6_IBUF_688 : STD_LOGIC;
  signal do_b_11_OBUF_689 : STD_LOGIC;
  signal addr_b_7_IBUF_690 : STD_LOGIC;
  signal do_b_12_OBUF_691 : STD_LOGIC;
  signal di_a_10_IBUF_692 : STD_LOGIC;
  signal addr_b_8_IBUF_693 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal do_b_13_O : STD_LOGIC;
  signal di_a_11_INBUF : STD_LOGIC;
  signal addr_b_9_INBUF : STD_LOGIC;
  signal do_b_14_O : STD_LOGIC;
  signal di_a_12_INBUF : STD_LOGIC;
  signal do_b_15_O : STD_LOGIC;
  signal di_a_13_INBUF : STD_LOGIC;
  signal di_a_14_INBUF : STD_LOGIC;
  signal di_a_15_INBUF : STD_LOGIC;
  signal clk_INBUF : STD_LOGIC;
  signal di_b_10_INBUF : STD_LOGIC;
  signal di_b_11_INBUF : STD_LOGIC;
  signal di_b_12_INBUF : STD_LOGIC;
  signal en_a_INBUF : STD_LOGIC;
  signal en_b_INBUF : STD_LOGIC;
  signal do_a_0_O : STD_LOGIC;
  signal di_b_13_INBUF : STD_LOGIC;
  signal do_a_1_O : STD_LOGIC;
  signal di_b_14_INBUF : STD_LOGIC;
  signal do_a_2_O : STD_LOGIC;
  signal di_b_15_INBUF : STD_LOGIC;
  signal we_a_INBUF : STD_LOGIC;
  signal do_a_3_O : STD_LOGIC;
  signal we_b_INBUF : STD_LOGIC;
  signal do_b_0_O : STD_LOGIC;
  signal do_a_4_O : STD_LOGIC;
  signal do_b_1_O : STD_LOGIC;
  signal do_a_5_O : STD_LOGIC;
  signal di_a_0_INBUF : STD_LOGIC;
  signal do_b_2_O : STD_LOGIC;
  signal do_a_6_O : STD_LOGIC;
  signal di_a_1_INBUF : STD_LOGIC;
  signal do_b_3_O : STD_LOGIC;
  signal do_a_7_O : STD_LOGIC;
  signal di_a_2_INBUF : STD_LOGIC;
  signal do_b_4_O : STD_LOGIC;
  signal do_a_8_O : STD_LOGIC;
  signal di_a_3_INBUF : STD_LOGIC;
  signal do_b_5_O : STD_LOGIC;
  signal do_a_9_O : STD_LOGIC;
  signal di_b_0_INBUF : STD_LOGIC;
  signal di_a_4_INBUF : STD_LOGIC;
  signal do_b_6_O : STD_LOGIC;
  signal di_b_1_INBUF : STD_LOGIC;
  signal di_a_5_INBUF : STD_LOGIC;
  signal do_b_7_O : STD_LOGIC;
  signal di_b_2_INBUF : STD_LOGIC;
  signal di_a_6_INBUF : STD_LOGIC;
  signal we_s_INBUF : STD_LOGIC;
  signal do_b_8_O : STD_LOGIC;
  signal di_b_3_INBUF : STD_LOGIC;
  signal di_a_7_INBUF : STD_LOGIC;
  signal do_b_9_O : STD_LOGIC;
  signal di_b_4_INBUF : STD_LOGIC;
  signal di_a_8_INBUF : STD_LOGIC;
  signal di_b_5_INBUF : STD_LOGIC;
  signal di_a_9_INBUF : STD_LOGIC;
  signal di_b_6_INBUF : STD_LOGIC;
  signal di_b_7_INBUF : STD_LOGIC;
  signal di_b_8_INBUF : STD_LOGIC;
  signal di_b_9_INBUF : STD_LOGIC;
  signal do_s_0_O : STD_LOGIC;
  signal do_s_10_O : STD_LOGIC;
  signal do_s_1_O : STD_LOGIC;
  signal do_s_11_O : STD_LOGIC;
  signal do_s_2_O : STD_LOGIC;
  signal do_s_20_O : STD_LOGIC;
  signal do_s_12_O : STD_LOGIC;
  signal do_s_3_O : STD_LOGIC;
  signal do_s_21_O : STD_LOGIC;
  signal do_s_13_O : STD_LOGIC;
  signal do_s_4_O : STD_LOGIC;
  signal do_s_30_O : STD_LOGIC;
  signal do_s_22_O : STD_LOGIC;
  signal do_s_14_O : STD_LOGIC;
  signal do_s_5_O : STD_LOGIC;
  signal do_s_31_O : STD_LOGIC;
  signal do_s_23_O : STD_LOGIC;
  signal do_s_15_O : STD_LOGIC;
  signal do_s_6_O : STD_LOGIC;
  signal addr_a_0_INBUF : STD_LOGIC;
  signal do_s_24_O : STD_LOGIC;
  signal do_s_16_O : STD_LOGIC;
  signal do_s_7_O : STD_LOGIC;
  signal addr_a_1_INBUF : STD_LOGIC;
  signal do_s_25_O : STD_LOGIC;
  signal do_s_17_O : STD_LOGIC;
  signal do_s_8_O : STD_LOGIC;
  signal do_a_10_O : STD_LOGIC;
  signal addr_a_2_INBUF : STD_LOGIC;
  signal do_s_26_O : STD_LOGIC;
  signal do_s_18_O : STD_LOGIC;
  signal do_s_9_O : STD_LOGIC;
  signal do_a_11_O : STD_LOGIC;
  signal addr_a_3_INBUF : STD_LOGIC;
  signal do_s_27_O : STD_LOGIC;
  signal do_s_19_O : STD_LOGIC;
  signal do_a_12_O : STD_LOGIC;
  signal addr_b_0_INBUF : STD_LOGIC;
  signal addr_a_4_INBUF : STD_LOGIC;
  signal do_s_28_O : STD_LOGIC;
  signal do_a_13_O : STD_LOGIC;
  signal addr_b_1_INBUF : STD_LOGIC;
  signal addr_a_5_INBUF : STD_LOGIC;
  signal do_s_29_O : STD_LOGIC;
  signal do_a_14_O : STD_LOGIC;
  signal addr_b_2_INBUF : STD_LOGIC;
  signal addr_a_6_INBUF : STD_LOGIC;
  signal do_a_15_O : STD_LOGIC;
  signal addr_b_3_INBUF : STD_LOGIC;
  signal addr_a_7_INBUF : STD_LOGIC;
  signal addr_b_4_INBUF : STD_LOGIC;
  signal addr_a_8_INBUF : STD_LOGIC;
  signal addr_b_5_INBUF : STD_LOGIC;
  signal addr_a_9_INBUF : STD_LOGIC;
  signal do_b_10_O : STD_LOGIC;
  signal addr_b_6_INBUF : STD_LOGIC;
  signal do_b_11_O : STD_LOGIC;
  signal addr_b_7_INBUF : STD_LOGIC;
  signal do_b_12_O : STD_LOGIC;
  signal di_a_10_INBUF : STD_LOGIC;
  signal addr_b_8_INBUF : STD_LOGIC;
  signal clk_BUFGP_BUFG_S_INVNOT : STD_LOGIC;
  signal clk_BUFGP_BUFG_I0_INV : STD_LOGIC;
  signal Mram_tdp_DOPB1 : STD_LOGIC;
  signal Mram_tdp_DOPB0 : STD_LOGIC;
  signal Mram_tdp_DOPA1 : STD_LOGIC;
  signal Mram_tdp_DOPA0 : STD_LOGIC;
  signal Mram_sdp_DOPB3 : STD_LOGIC;
  signal Mram_sdp_DOPB2 : STD_LOGIC;
  signal Mram_sdp_DOPB1 : STD_LOGIC;
  signal Mram_sdp_DOPB0 : STD_LOGIC;
  signal Mram_sdp_DOPA3 : STD_LOGIC;
  signal Mram_sdp_DOPA2 : STD_LOGIC;
  signal Mram_sdp_DOPA1 : STD_LOGIC;
  signal Mram_sdp_DOPA0 : STD_LOGIC;
  signal Mram_sdp_DOA31 : STD_LOGIC;
  signal Mram_sdp_DOA30 : STD_LOGIC;
  signal Mram_sdp_DOA29 : STD_LOGIC;
  signal Mram_sdp_DOA28 : STD_LOGIC;
  signal Mram_sdp_DOA27 : STD_LOGIC;
  signal Mram_sdp_DOA26 : STD_LOGIC;
  signal Mram_sdp_DOA25 : STD_LOGIC;
  signal Mram_sdp_DOA24 : STD_LOGIC;
  signal Mram_sdp_DOA23 : STD_LOGIC;
  signal Mram_sdp_DOA22 : STD_LOGIC;
  signal Mram_sdp_DOA21 : STD_LOGIC;
  signal Mram_sdp_DOA20 : STD_LOGIC;
  signal Mram_sdp_DOA19 : STD_LOGIC;
  signal Mram_sdp_DOA18 : STD_LOGIC;
  signal Mram_sdp_DOA17 : STD_LOGIC;
  signal Mram_sdp_DOA16 : STD_LOGIC;
  signal Mram_sdp_DOA15 : STD_LOGIC;
  signal Mram_sdp_DOA14 : STD_LOGIC;
  signal Mram_sdp_DOA13 : STD_LOGIC;
  signal Mram_sdp_DOA12 : STD_LOGIC;
  signal Mram_sdp_DOA11 : STD_LOGIC;
  signal Mram_sdp_DOA10 : STD_LOGIC;
  signal Mram_sdp_DOA9 : STD_LOGIC;
  signal Mram_sdp_DOA8 : STD_LOGIC;
  signal Mram_sdp_DOA7 : STD_LOGIC;
  signal Mram_sdp_DOA6 : STD_LOGIC;
  signal Mram_sdp_DOA5 : STD_LOGIC;
  signal Mram_sdp_DOA4 : STD_LOGIC;
  signal Mram_sdp_DOA3 : STD_LOGIC;
  signal Mram_sdp_DOA2 : STD_LOGIC;
  signal Mram_sdp_DOA1 : STD_LOGIC;
  signal Mram_sdp_DOA0 : STD_LOGIC;
  signal Mram_sdp_DIPB3 : STD_LOGIC;
  signal Mram_sdp_DIPB2 : STD_LOGIC;
  signal Mram_sdp_DIPB1 : STD_LOGIC;
  signal Mram_sdp_DIPB0 : STD_LOGIC;
  signal Mram_sdp_DIB31 : STD_LOGIC;
  signal Mram_sdp_DIB30 : STD_LOGIC;
  signal Mram_sdp_DIB29 : STD_LOGIC;
  signal Mram_sdp_DIB28 : STD_LOGIC;
  signal Mram_sdp_DIB27 : STD_LOGIC;
  signal Mram_sdp_DIB26 : STD_LOGIC;
  signal Mram_sdp_DIB25 : STD_LOGIC;
  signal Mram_sdp_DIB24 : STD_LOGIC;
  signal Mram_sdp_DIB23 : STD_LOGIC;
  signal Mram_sdp_DIB22 : STD_LOGIC;
  signal Mram_sdp_DIB21 : STD_LOGIC;
  signal Mram_sdp_DIB20 : STD_LOGIC;
  signal Mram_sdp_DIB19 : STD_LOGIC;
  signal Mram_sdp_DIB18 : STD_LOGIC;
  signal Mram_sdp_DIB17 : STD_LOGIC;
  signal Mram_sdp_DIB16 : STD_LOGIC;
  signal Mram_sdp_DIB15 : STD_LOGIC;
  signal Mram_sdp_DIB14 : STD_LOGIC;
  signal Mram_sdp_DIB13 : STD_LOGIC;
  signal Mram_sdp_DIB12 : STD_LOGIC;
  signal Mram_sdp_DIB11 : STD_LOGIC;
  signal Mram_sdp_DIB10 : STD_LOGIC;
  signal Mram_sdp_DIB9 : STD_LOGIC;
  signal Mram_sdp_DIB8 : STD_LOGIC;
  signal Mram_sdp_DIB7 : STD_LOGIC;
  signal Mram_sdp_DIB6 : STD_LOGIC;
  signal Mram_sdp_DIB5 : STD_LOGIC;
  signal Mram_sdp_DIB4 : STD_LOGIC;
  signal Mram_sdp_DIB3 : STD_LOGIC;
  signal Mram_sdp_DIB2 : STD_LOGIC;
  signal Mram_sdp_DIB1 : STD_LOGIC;
  signal Mram_sdp_DIB0 : STD_LOGIC;
  signal GND : STD_LOGIC;
begin
  do_b_13_OBUF : X_OBUF
    port map (
      I => do_b_13_O,
      O => do_b(13)
    );
  di_a_11_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(11),
      O => di_a_11_INBUF
    );
  di_a_11_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_11_INBUF,
      O => di_a_11_IBUF_573
    );
  addr_b_9_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(9),
      O => addr_b_9_INBUF
    );
  addr_b_9_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_9_INBUF,
      O => addr_b_9_IBUF_574
    );
  do_b_14_OBUF : X_OBUF
    port map (
      I => do_b_14_O,
      O => do_b(14)
    );
  di_a_12_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(12),
      O => di_a_12_INBUF
    );
  di_a_12_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_12_INBUF,
      O => di_a_12_IBUF_576
    );
  do_b_15_OBUF : X_OBUF
    port map (
      I => do_b_15_O,
      O => do_b(15)
    );
  di_a_13_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(13),
      O => di_a_13_INBUF
    );
  di_a_13_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_13_INBUF,
      O => di_a_13_IBUF_578
    );
  di_a_14_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(14),
      O => di_a_14_INBUF
    );
  di_a_14_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_14_INBUF,
      O => di_a_14_IBUF_579
    );
  di_a_15_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(15),
      O => di_a_15_INBUF
    );
  di_a_15_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_15_INBUF,
      O => di_a_15_IBUF_580
    );
  clk_BUFGP_IBUFG : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => clk,
      O => clk_INBUF
    );
  di_b_10_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(10),
      O => di_b_10_INBUF
    );
  di_b_10_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_10_INBUF,
      O => di_b_10_IBUF_582
    );
  di_b_11_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(11),
      O => di_b_11_INBUF
    );
  di_b_11_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_11_INBUF,
      O => di_b_11_IBUF_583
    );
  di_b_12_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(12),
      O => di_b_12_INBUF
    );
  di_b_12_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_12_INBUF,
      O => di_b_12_IBUF_584
    );
  en_a_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => en_a,
      O => en_a_INBUF
    );
  en_a_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => en_a_INBUF,
      O => en_a_IBUF_585
    );
  en_b_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => en_b,
      O => en_b_INBUF
    );
  en_b_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => en_b_INBUF,
      O => en_b_IBUF_586
    );
  do_a_0_OBUF : X_OBUF
    port map (
      I => do_a_0_O,
      O => do_a(0)
    );
  di_b_13_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(13),
      O => di_b_13_INBUF
    );
  di_b_13_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_13_INBUF,
      O => di_b_13_IBUF_588
    );
  do_a_1_OBUF : X_OBUF
    port map (
      I => do_a_1_O,
      O => do_a(1)
    );
  di_b_14_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(14),
      O => di_b_14_INBUF
    );
  di_b_14_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_14_INBUF,
      O => di_b_14_IBUF_590
    );
  do_a_2_OBUF : X_OBUF
    port map (
      I => do_a_2_O,
      O => do_a(2)
    );
  di_b_15_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(15),
      O => di_b_15_INBUF
    );
  di_b_15_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_15_INBUF,
      O => di_b_15_IBUF_592
    );
  we_a_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => we_a,
      O => we_a_INBUF
    );
  we_a_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => we_a_INBUF,
      O => we_a_IBUF_593
    );
  do_a_3_OBUF : X_OBUF
    port map (
      I => do_a_3_O,
      O => do_a(3)
    );
  we_b_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => we_b,
      O => we_b_INBUF
    );
  we_b_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => we_b_INBUF,
      O => we_b_IBUF_595
    );
  do_b_0_OBUF : X_OBUF
    port map (
      I => do_b_0_O,
      O => do_b(0)
    );
  do_a_4_OBUF : X_OBUF
    port map (
      I => do_a_4_O,
      O => do_a(4)
    );
  do_b_1_OBUF : X_OBUF
    port map (
      I => do_b_1_O,
      O => do_b(1)
    );
  do_a_5_OBUF : X_OBUF
    port map (
      I => do_a_5_O,
      O => do_a(5)
    );
  di_a_0_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(0),
      O => di_a_0_INBUF
    );
  di_a_0_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_0_INBUF,
      O => di_a_0_IBUF_600
    );
  do_b_2_OBUF : X_OBUF
    port map (
      I => do_b_2_O,
      O => do_b(2)
    );
  do_a_6_OBUF : X_OBUF
    port map (
      I => do_a_6_O,
      O => do_a(6)
    );
  di_a_1_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(1),
      O => di_a_1_INBUF
    );
  di_a_1_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_1_INBUF,
      O => di_a_1_IBUF_603
    );
  do_b_3_OBUF : X_OBUF
    port map (
      I => do_b_3_O,
      O => do_b(3)
    );
  do_a_7_OBUF : X_OBUF
    port map (
      I => do_a_7_O,
      O => do_a(7)
    );
  di_a_2_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(2),
      O => di_a_2_INBUF
    );
  di_a_2_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_2_INBUF,
      O => di_a_2_IBUF_606
    );
  do_b_4_OBUF : X_OBUF
    port map (
      I => do_b_4_O,
      O => do_b(4)
    );
  do_a_8_OBUF : X_OBUF
    port map (
      I => do_a_8_O,
      O => do_a(8)
    );
  di_a_3_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(3),
      O => di_a_3_INBUF
    );
  di_a_3_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_3_INBUF,
      O => di_a_3_IBUF_609
    );
  do_b_5_OBUF : X_OBUF
    port map (
      I => do_b_5_O,
      O => do_b(5)
    );
  do_a_9_OBUF : X_OBUF
    port map (
      I => do_a_9_O,
      O => do_a(9)
    );
  di_b_0_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(0),
      O => di_b_0_INBUF
    );
  di_b_0_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_0_INBUF,
      O => di_b_0_IBUF_612
    );
  di_a_4_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(4),
      O => di_a_4_INBUF
    );
  di_a_4_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_4_INBUF,
      O => di_a_4_IBUF_613
    );
  do_b_6_OBUF : X_OBUF
    port map (
      I => do_b_6_O,
      O => do_b(6)
    );
  di_b_1_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(1),
      O => di_b_1_INBUF
    );
  di_b_1_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_1_INBUF,
      O => di_b_1_IBUF_615
    );
  di_a_5_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(5),
      O => di_a_5_INBUF
    );
  di_a_5_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_5_INBUF,
      O => di_a_5_IBUF_616
    );
  do_b_7_OBUF : X_OBUF
    port map (
      I => do_b_7_O,
      O => do_b(7)
    );
  di_b_2_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(2),
      O => di_b_2_INBUF
    );
  di_b_2_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_2_INBUF,
      O => di_b_2_IBUF_618
    );
  di_a_6_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(6),
      O => di_a_6_INBUF
    );
  di_a_6_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_6_INBUF,
      O => di_a_6_IBUF_619
    );
  we_s_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => we_s,
      O => we_s_INBUF
    );
  we_s_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => we_s_INBUF,
      O => we_s_IBUF_620
    );
  do_b_8_OBUF : X_OBUF
    port map (
      I => do_b_8_O,
      O => do_b(8)
    );
  di_b_3_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(3),
      O => di_b_3_INBUF
    );
  di_b_3_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_3_INBUF,
      O => di_b_3_IBUF_622
    );
  di_a_7_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(7),
      O => di_a_7_INBUF
    );
  di_a_7_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_7_INBUF,
      O => di_a_7_IBUF_623
    );
  do_b_9_OBUF : X_OBUF
    port map (
      I => do_b_9_O,
      O => do_b(9)
    );
  di_b_4_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(4),
      O => di_b_4_INBUF
    );
  di_b_4_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_4_INBUF,
      O => di_b_4_IBUF_625
    );
  di_a_8_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(8),
      O => di_a_8_INBUF
    );
  di_a_8_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_8_INBUF,
      O => di_a_8_IBUF_626
    );
  di_b_5_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(5),
      O => di_b_5_INBUF
    );
  di_b_5_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_5_INBUF,
      O => di_b_5_IBUF_627
    );
  di_a_9_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(9),
      O => di_a_9_INBUF
    );
  di_a_9_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_9_INBUF,
      O => di_a_9_IBUF_628
    );
  di_b_6_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(6),
      O => di_b_6_INBUF
    );
  di_b_6_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_6_INBUF,
      O => di_b_6_IBUF_629
    );
  di_b_7_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(7),
      O => di_b_7_INBUF
    );
  di_b_7_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_7_INBUF,
      O => di_b_7_IBUF_630
    );
  di_b_8_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(8),
      O => di_b_8_INBUF
    );
  di_b_8_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_8_INBUF,
      O => di_b_8_IBUF_631
    );
  di_b_9_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b(9),
      O => di_b_9_INBUF
    );
  di_b_9_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_b_9_INBUF,
      O => di_b_9_IBUF_632
    );
  do_s_0_OBUF : X_OBUF
    port map (
      I => do_s_0_O,
      O => do_s(0)
    );
  do_s_10_OBUF : X_OBUF
    port map (
      I => do_s_10_O,
      O => do_s(10)
    );
  do_s_1_OBUF : X_OBUF
    port map (
      I => do_s_1_O,
      O => do_s(1)
    );
  do_s_11_OBUF : X_OBUF
    port map (
      I => do_s_11_O,
      O => do_s(11)
    );
  do_s_2_OBUF : X_OBUF
    port map (
      I => do_s_2_O,
      O => do_s(2)
    );
  do_s_20_OBUF : X_OBUF
    port map (
      I => do_s_20_O,
      O => do_s(20)
    );
  do_s_12_OBUF : X_OBUF
    port map (
      I => do_s_12_O,
      O => do_s(12)
    );
  do_s_3_OBUF : X_OBUF
    port map (
      I => do_s_3_O,
      O => do_s(3)
    );
  do_s_21_OBUF : X_OBUF
    port map (
      I => do_s_21_O,
      O => do_s(21)
    );
  do_s_13_OBUF : X_OBUF
    port map (
      I => do_s_13_O,
      O => do_s(13)
    );
  do_s_4_OBUF : X_OBUF
    port map (
      I => do_s_4_O,
      O => do_s(4)
    );
  do_s_30_OBUF : X_OBUF
    port map (
      I => do_s_30_O,
      O => do_s(30)
    );
  do_s_22_OBUF : X_OBUF
    port map (
      I => do_s_22_O,
      O => do_s(22)
    );
  do_s_14_OBUF : X_OBUF
    port map (
      I => do_s_14_O,
      O => do_s(14)
    );
  do_s_5_OBUF : X_OBUF
    port map (
      I => do_s_5_O,
      O => do_s(5)
    );
  do_s_31_OBUF : X_OBUF
    port map (
      I => do_s_31_O,
      O => do_s(31)
    );
  do_s_23_OBUF : X_OBUF
    port map (
      I => do_s_23_O,
      O => do_s(23)
    );
  do_s_15_OBUF : X_OBUF
    port map (
      I => do_s_15_O,
      O => do_s(15)
    );
  do_s_6_OBUF : X_OBUF
    port map (
      I => do_s_6_O,
      O => do_s(6)
    );
  addr_a_0_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(0),
      O => addr_a_0_INBUF
    );
  addr_a_0_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_0_INBUF,
      O => addr_a_0_IBUF_652
    );
  do_s_24_OBUF : X_OBUF
    port map (
      I => do_s_24_O,
      O => do_s(24)
    );
  do_s_16_OBUF : X_OBUF
    port map (
      I => do_s_16_O,
      O => do_s(16)
    );
  do_s_7_OBUF : X_OBUF
    port map (
      I => do_s_7_O,
      O => do_s(7)
    );
  addr_a_1_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(1),
      O => addr_a_1_INBUF
    );
  addr_a_1_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_1_INBUF,
      O => addr_a_1_IBUF_656
    );
  do_s_25_OBUF : X_OBUF
    port map (
      I => do_s_25_O,
      O => do_s(25)
    );
  do_s_17_OBUF : X_OBUF
    port map (
      I => do_s_17_O,
      O => do_s(17)
    );
  do_s_8_OBUF : X_OBUF
    port map (
      I => do_s_8_O,
      O => do_s(8)
    );
  do_a_10_OBUF : X_OBUF
    port map (
      I => do_a_10_O,
      O => do_a(10)
    );
  addr_a_2_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(2),
      O => addr_a_2_INBUF
    );
  addr_a_2_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_2_INBUF,
      O => addr_a_2_IBUF_661
    );
  do_s_26_OBUF : X_OBUF
    port map (
      I => do_s_26_O,
      O => do_s(26)
    );
  do_s_18_OBUF : X_OBUF
    port map (
      I => do_s_18_O,
      O => do_s(18)
    );
  do_s_9_OBUF : X_OBUF
    port map (
      I => do_s_9_O,
      O => do_s(9)
    );
  do_a_11_OBUF : X_OBUF
    port map (
      I => do_a_11_O,
      O => do_a(11)
    );
  addr_a_3_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(3),
      O => addr_a_3_INBUF
    );
  addr_a_3_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_3_INBUF,
      O => addr_a_3_IBUF_666
    );
  do_s_27_OBUF : X_OBUF
    port map (
      I => do_s_27_O,
      O => do_s(27)
    );
  do_s_19_OBUF : X_OBUF
    port map (
      I => do_s_19_O,
      O => do_s(19)
    );
  do_a_12_OBUF : X_OBUF
    port map (
      I => do_a_12_O,
      O => do_a(12)
    );
  addr_b_0_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(0),
      O => addr_b_0_INBUF
    );
  addr_b_0_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_0_INBUF,
      O => addr_b_0_IBUF_670
    );
  addr_a_4_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(4),
      O => addr_a_4_INBUF
    );
  addr_a_4_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_4_INBUF,
      O => addr_a_4_IBUF_671
    );
  do_s_28_OBUF : X_OBUF
    port map (
      I => do_s_28_O,
      O => do_s(28)
    );
  do_a_13_OBUF : X_OBUF
    port map (
      I => do_a_13_O,
      O => do_a(13)
    );
  addr_b_1_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(1),
      O => addr_b_1_INBUF
    );
  addr_b_1_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_1_INBUF,
      O => addr_b_1_IBUF_674
    );
  addr_a_5_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(5),
      O => addr_a_5_INBUF
    );
  addr_a_5_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_5_INBUF,
      O => addr_a_5_IBUF_675
    );
  do_s_29_OBUF : X_OBUF
    port map (
      I => do_s_29_O,
      O => do_s(29)
    );
  do_a_14_OBUF : X_OBUF
    port map (
      I => do_a_14_O,
      O => do_a(14)
    );
  addr_b_2_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(2),
      O => addr_b_2_INBUF
    );
  addr_b_2_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_2_INBUF,
      O => addr_b_2_IBUF_678
    );
  addr_a_6_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(6),
      O => addr_a_6_INBUF
    );
  addr_a_6_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_6_INBUF,
      O => addr_a_6_IBUF_679
    );
  do_a_15_OBUF : X_OBUF
    port map (
      I => do_a_15_O,
      O => do_a(15)
    );
  addr_b_3_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(3),
      O => addr_b_3_INBUF
    );
  addr_b_3_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_3_INBUF,
      O => addr_b_3_IBUF_681
    );
  addr_a_7_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(7),
      O => addr_a_7_INBUF
    );
  addr_a_7_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_7_INBUF,
      O => addr_a_7_IBUF_682
    );
  addr_b_4_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(4),
      O => addr_b_4_INBUF
    );
  addr_b_4_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_4_INBUF,
      O => addr_b_4_IBUF_683
    );
  addr_a_8_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(8),
      O => addr_a_8_INBUF
    );
  addr_a_8_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_8_INBUF,
      O => addr_a_8_IBUF_684
    );
  addr_b_5_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(5),
      O => addr_b_5_INBUF
    );
  addr_b_5_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_5_INBUF,
      O => addr_b_5_IBUF_685
    );
  addr_a_9_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a(9),
      O => addr_a_9_INBUF
    );
  addr_a_9_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_a_9_INBUF,
      O => addr_a_9_IBUF_686
    );
  do_b_10_OBUF : X_OBUF
    port map (
      I => do_b_10_O,
      O => do_b(10)
    );
  addr_b_6_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(6),
      O => addr_b_6_INBUF
    );
  addr_b_6_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_6_INBUF,
      O => addr_b_6_IBUF_688
    );
  do_b_11_OBUF : X_OBUF
    port map (
      I => do_b_11_O,
      O => do_b(11)
    );
  addr_b_7_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(7),
      O => addr_b_7_INBUF
    );
  addr_b_7_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_7_INBUF,
      O => addr_b_7_IBUF_690
    );
  do_b_12_OBUF : X_OBUF
    port map (
      I => do_b_12_O,
      O => do_b(12)
    );
  di_a_10_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a(10),
      O => di_a_10_INBUF
    );
  di_a_10_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => di_a_10_INBUF,
      O => di_a_10_IBUF_692
    );
  addr_b_8_IBUF : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b(8),
      O => addr_b_8_INBUF
    );
  addr_b_8_IFF_IMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => addr_b_8_INBUF,
      O => addr_b_8_IBUF_693
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
  Mram_tdp : X_RAMB16_S18_S18
    generic map(
      INIT_A => X"00000",
      INIT_B => X"00000",
      SRVAL_A => X"00000",
      SRVAL_B => X"00000",
      WRITE_MODE_A => "READ_FIRST",
      WRITE_MODE_B => "WRITE_FIRST",
      INIT_00 => X"002D002A002700240021001E001B001800150012000F000C0009000600030000",
      INIT_01 => X"005D005A005700540051004E004B004800450042003F003C0039003600330030",
      INIT_02 => X"008D008A008700840081007E007B007800750072006F006C0069006600630060",
      INIT_03 => X"00BD00BA00B700B400B100AE00AB00A800A500A2009F009C0099009600930090",
      INIT_04 => X"00ED00EA00E700E400E100DE00DB00D800D500D200CF00CC00C900C600C300C0",
      INIT_05 => X"011D011A011701140111010E010B01080105010200FF00FC00F900F600F300F0",
      INIT_06 => X"014D014A014701440141013E013B013801350132012F012C0129012601230120",
      INIT_07 => X"017D017A017701740171016E016B016801650162015F015C0159015601530150",
      INIT_08 => X"01AD01AA01A701A401A1019E019B019801950192018F018C0189018601830180",
      INIT_09 => X"01DD01DA01D701D401D101CE01CB01C801C501C201BF01BC01B901B601B301B0",
      INIT_0A => X"020D020A02070204020101FE01FB01F801F501F201EF01EC01E901E601E301E0",
      INIT_0B => X"023D023A023702340231022E022B022802250222021F021C0219021602130210",
      INIT_0C => X"026D026A026702640261025E025B025802550252024F024C0249024602430240",
      INIT_0D => X"029D029A029702940291028E028B028802850282027F027C0279027602730270",
      INIT_0E => X"02CD02CA02C702C402C102BE02BB02B802B502B202AF02AC02A902A602A302A0",
      INIT_0F => X"02FD02FA02F702F402F102EE02EB02E802E502E202DF02DC02D902D602D302D0",
      INIT_10 => X"032D032A032703240321031E031B031803150312030F030C0309030603030300",
      INIT_11 => X"035D035A035703540351034E034B034803450342033F033C0339033603330330",
      INIT_12 => X"038D038A038703840381037E037B037803750372036F036C0369036603630360",
      INIT_13 => X"03BD03BA03B703B403B103AE03AB03A803A503A2039F039C0399039603930390",
      INIT_14 => X"03ED03EA03E703E403E103DE03DB03D803D503D203CF03CC03C903C603C303C0",
      INIT_15 => X"041D041A041704140411040E040B04080405040203FF03FC03F903F603F303F0",
      INIT_16 => X"044D044A044704440441043E043B043804350432042F042C0429042604230420",
      INIT_17 => X"047D047A047704740471046E046B046804650462045F045C0459045604530450",
      INIT_18 => X"04AD04AA04A704A404A1049E049B049804950492048F048C0489048604830480",
      INIT_19 => X"04DD04DA04D704D404D104CE04CB04C804C504C204BF04BC04B904B604B304B0",
      INIT_1A => X"050D050A05070504050104FE04FB04F804F504F204EF04EC04E904E604E304E0",
      INIT_1B => X"053D053A053705340531052E052B052805250522051F051C0519051605130510",
      INIT_1C => X"056D056A056705640561055E055B055805550552054F054C0549054605430540",
      INIT_1D => X"059D059A059705940591058E058B058805850582057F057C0579057605730570",
      INIT_1E => X"05CD05CA05C705C405C105BE05BB05B805B505B205AF05AC05A905A605A305A0",
      INIT_1F => X"05FD05FA05F705F405F105EE05EB05E805E505E205DF05DC05D905D605D305D0",
      INIT_20 => X"062D062A062706240621061E061B061806150612060F060C0609060606030600",
      INIT_21 => X"065D065A065706540651064E064B064806450642063F063C0639063606330630",
      INIT_22 => X"068D068A068706840681067E067B067806750672066F066C0669066606630660",
      INIT_23 => X"06BD06BA06B706B406B106AE06AB06A806A506A2069F069C0699069606930690",
      INIT_24 => X"06ED06EA06E706E406E106DE06DB06D806D506D206CF06CC06C906C606C306C0",
      INIT_25 => X"071D071A071707140711070E070B07080705070206FF06FC06F906F606F306F0",
      INIT_26 => X"074D074A074707440741073E073B073807350732072F072C0729072607230720",
      INIT_27 => X"077D077A077707740771076E076B076807650762075F075C0759075607530750",
      INIT_28 => X"07AD07AA07A707A407A1079E079B079807950792078F078C0789078607830780",
      INIT_29 => X"07DD07DA07D707D407D107CE07CB07C807C507C207BF07BC07B907B607B307B0",
      INIT_2A => X"080D080A08070804080107FE07FB07F807F507F207EF07EC07E907E607E307E0",
      INIT_2B => X"083D083A083708340831082E082B082808250822081F081C0819081608130810",
      INIT_2C => X"086D086A086708640861085E085B085808550852084F084C0849084608430840",
      INIT_2D => X"089D089A089708940891088E088B088808850882087F087C0879087608730870",
      INIT_2E => X"08CD08CA08C708C408C108BE08BB08B808B508B208AF08AC08A908A608A308A0",
      INIT_2F => X"08FD08FA08F708F408F108EE08EB08E808E508E208DF08DC08D908D608D308D0",
      INIT_30 => X"092D092A092709240921091E091B091809150912090F090C0909090609030900",
      INIT_31 => X"095D095A095709540951094E094B094809450942093F093C0939093609330930",
      INIT_32 => X"098D098A098709840981097E097B097809750972096F096C0969096609630960",
      INIT_33 => X"09BD09BA09B709B409B109AE09AB09A809A509A2099F099C0999099609930990",
      INIT_34 => X"09ED09EA09E709E409E109DE09DB09D809D509D209CF09CC09C909C609C309C0",
      INIT_35 => X"0A1D0A1A0A170A140A110A0E0A0B0A080A050A0209FF09FC09F909F609F309F0",
      INIT_36 => X"0A4D0A4A0A470A440A410A3E0A3B0A380A350A320A2F0A2C0A290A260A230A20",
      INIT_37 => X"0A7D0A7A0A770A740A710A6E0A6B0A680A650A620A5F0A5C0A590A560A530A50",
      INIT_38 => X"0AAD0AAA0AA70AA40AA10A9E0A9B0A980A950A920A8F0A8C0A890A860A830A80",
      INIT_39 => X"0ADD0ADA0AD70AD40AD10ACE0ACB0AC80AC50AC20ABF0ABC0AB90AB60AB30AB0",
      INIT_3A => X"0B0D0B0A0B070B040B010AFE0AFB0AF80AF50AF20AEF0AEC0AE90AE60AE30AE0",
      INIT_3B => X"0B3D0B3A0B370B340B310B2E0B2B0B280B250B220B1F0B1C0B190B160B130B10",
      INIT_3C => X"0B6D0B6A0B670B640B610B5E0B5B0B580B550B520B4F0B4C0B490B460B430B40",
      INIT_3D => X"0B9D0B9A0B970B940B910B8E0B8B0B880B850B820B7F0B7C0B790B760B730B70",
      INIT_3E => X"0BCD0BCA0BC70BC40BC10BBE0BBB0BB80BB50BB20BAF0BAC0BA90BA60BA30BA0",
      INIT_3F => X"0BFD0BFA0BF70BF40BF10BEE0BEB0BE80BE50BE20BDF0BDC0BD90BD60BD30BD0",
      INITP_00 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_01 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_02 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_03 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_04 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_05 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_06 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_07 => X"0000000000000000000000000000000000000000000000000000000000000000",
      SETUP_ALL => 227 ps,
      SETUP_READ_FIRST => 227 ps
    )
    port map (
      CLKA => clk_BUFGP,
      CLKB => clk_BUFGP,
      ENA => en_a_IBUF_585,
      ENB => en_b_IBUF_586,
      SSRA => '0',
      SSRB => '0',
      WEA => we_a_IBUF_593,
      WEB => we_b_IBUF_595,
      ADDRA(9) => addr_a_9_IBUF_686,
      ADDRA(8) => addr_a_8_IBUF_684,
      ADDRA(7) => addr_a_7_IBUF_682,
      ADDRA(6) => addr_a_6_IBUF_679,
      ADDRA(5) => addr_a_5_IBUF_675,
      ADDRA(4) => addr_a_4_IBUF_671,
      ADDRA(3) => addr_a_3_IBUF_666,
      ADDRA(2) => addr_a_2_IBUF_661,
      ADDRA(1) => addr_a_1_IBUF_656,
      ADDRA(0) => addr_a_0_IBUF_652,
      ADDRB(9) => addr_b_9_IBUF_574,
      ADDRB(8) => addr_b_8_IBUF_693,
      ADDRB(7) => addr_b_7_IBUF_690,
      ADDRB(6) => addr_b_6_IBUF_688,
      ADDRB(5) => addr_b_5_IBUF_685,
      ADDRB(4) => addr_b_4_IBUF_683,
      ADDRB(3) => addr_b_3_IBUF_681,
      ADDRB(2) => addr_b_2_IBUF_678,
      ADDRB(1) => addr_b_1_IBUF_674,
      ADDRB(0) => addr_b_0_IBUF_670,
      DIA(15) => di_a_15_IBUF_580,
      DIA(14) => di_a_14_IBUF_579,
      DIA(13) => di_a_13_IBUF_578,
      DIA(12) => di_a_12_IBUF_576,
      DIA(11) => di_a_11_IBUF_573,
      DIA(10) => di_a_10_IBUF_692,
      DIA(9) => di_a_9_IBUF_628,
      DIA(8) => di_a_8_IBUF_626,
      DIA(7) => di_a_7_IBUF_623,
      DIA(6) => di_a_6_IBUF_619,
      DIA(5) => di_a_5_IBUF_616,
      DIA(4) => di_a_4_IBUF_613,
      DIA(3) => di_a_3_IBUF_609,
      DIA(2) => di_a_2_IBUF_606,
      DIA(1) => di_a_1_IBUF_603,
      DIA(0) => di_a_0_IBUF_600,
      DIPA(1) => '0',
      DIPA(0) => '0',
      DIB(15) => di_b_15_IBUF_592,
      DIB(14) => di_b_14_IBUF_590,
      DIB(13) => di_b_13_IBUF_588,
      DIB(12) => di_b_12_IBUF_584,
      DIB(11) => di_b_11_IBUF_583,
      DIB(10) => di_b_10_IBUF_582,
      DIB(9) => di_b_9_IBUF_632,
      DIB(8) => di_b_8_IBUF_631,
      DIB(7) => di_b_7_IBUF_630,
      DIB(6) => di_b_6_IBUF_629,
      DIB(5) => di_b_5_IBUF_627,
      DIB(4) => di_b_4_IBUF_625,
      DIB(3) => di_b_3_IBUF_622,
      DIB(2) => di_b_2_IBUF_618,
      DIB(1) => di_b_1_IBUF_615,
      DIB(0) => di_b_0_IBUF_612,
      DIPB(1) => '0',
      DIPB(0) => '0',
      DOA(15) => do_a_15_OBUF_680,
      DOA(14) => do_a_14_OBUF_677,
      DOA(13) => do_a_13_OBUF_673,
      DOA(12) => do_a_12_OBUF_669,
      DOA(11) => do_a_11_OBUF_665,
      DOA(10) => do_a_10_OBUF_660,
      DOA(9) => do_a_9_OBUF_611,
      DOA(8) => do_a_8_OBUF_608,
      DOA(7) => do_a_7_OBUF_605,
      DOA(6) => do_a_6_OBUF_602,
      DOA(5) => do_a_5_OBUF_599,
      DOA(4) => do_a_4_OBUF_597,
      DOA(3) => do_a_3_OBUF_594,
      DOA(2) => do_a_2_OBUF_591,
      DOA(1) => do_a_1_OBUF_589,
      DOA(0) => do_a_0_OBUF_587,
      DOPA(1) => Mram_tdp_DOPA1,
      DOPA(0) => Mram_tdp_DOPA0,
      DOB(15) => do_b_15_OBUF_577,
      DOB(14) => do_b_14_OBUF_575,
      DOB(13) => do_b_13_OBUF_572,
      DOB(12) => do_b_12_OBUF_691,
      DOB(11) => do_b_11_OBUF_689,
      DOB(10) => do_b_10_OBUF_687,
      DOB(9) => do_b_9_OBUF_624,
      DOB(8) => do_b_8_OBUF_621,
      DOB(7) => do_b_7_OBUF_617,
      DOB(6) => do_b_6_OBUF_614,
      DOB(5) => do_b_5_OBUF_610,
      DOB(4) => do_b_4_OBUF_607,
      DOB(3) => do_b_3_OBUF_604,
      DOB(2) => do_b_2_OBUF_601,
      DOB(1) => do_b_1_OBUF_598,
      DOB(0) => do_b_0_OBUF_596,
      DOPB(1) => Mram_tdp_DOPB1,
      DOPB(0) => Mram_tdp_DOPB0
    );
  Mram_sdp : X_RAMB16_S36_S36
    generic map(
      INIT_A => X"000000000",
      INIT_B => X"000000000",
      SRVAL_A => X"000000000",
      SRVAL_B => X"000000000",
      WRITE_MODE_A => "READ_FIRST",
      WRITE_MODE_B => "WRITE_FIRST",
      INIT_00 => X"0000000000000000000000000000000000000000000000000000000000000000",
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
      INITP_00 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_01 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_02 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_03 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_04 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_05 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_06 => X"0000000000000000000000000000000000000000000000000000000000000000",
      INITP_07 => X"0000000000000000000000000000000000000000000000000000000000000000",
      SETUP_ALL => 227 ps,
      SETUP_READ_FIRST => 227 ps
    )
    port map (
      CLKA => clk_BUFGP,
      CLKB => clk_BUFGP,
      ENA => '1',
      ENB => '1',
      SSRA => '0',
      SSRB => '0',
      WEA => we_s_IBUF_620,
      WEB => '0',
      ADDRA(8) => addr_a_8_IBUF_684,
      ADDRA(7) => addr_a_7_IBUF_682,
      ADDRA(6) => addr_a_6_IBUF_679,
      ADDRA(5) => addr_a_5_IBUF_675,
      ADDRA(4) => addr_a_4_IBUF_671,
      ADDRA(3) => addr_a_3_IBUF_666,
      ADDRA(2) => addr_a_2_IBUF_661,
      ADDRA(1) => addr_a_1_IBUF_656,
      ADDRA(0) => addr_a_0_IBUF_652,
      ADDRB(8) => addr_b_8_IBUF_693,
      ADDRB(7) => addr_b_7_IBUF_690,
      ADDRB(6) => addr_b_6_IBUF_688,
      ADDRB(5) => addr_b_5_IBUF_685,
      ADDRB(4) => addr_b_4_IBUF_683,
      ADDRB(3) => addr_b_3_IBUF_681,
      ADDRB(2) => addr_b_2_IBUF_678,
      ADDRB(1) => addr_b_1_IBUF_674,
      ADDRB(0) => addr_b_0_IBUF_670,
      DIA(31) => di_b_15_IBUF_592,
      DIA(30) => di_b_14_IBUF_590,
      DIA(29) => di_b_13_IBUF_588,
      DIA(28) => di_b_12_IBUF_584,
      DIA(27) => di_b_11_IBUF_583,
      DIA(26) => di_b_10_IBUF_582,
      DIA(25) => di_b_9_IBUF_632,
      DIA(24) => di_b_8_IBUF_631,
      DIA(23) => di_b_7_IBUF_630,
      DIA(22) => di_b_6_IBUF_629,
      DIA(21) => di_b_5_IBUF_627,
      DIA(20) => di_b_4_IBUF_625,
      DIA(19) => di_b_3_IBUF_622,
      DIA(18) => di_b_2_IBUF_618,
      DIA(17) => di_b_1_IBUF_615,
      DIA(16) => di_b_0_IBUF_612,
      DIA(15) => di_a_15_IBUF_580,
      DIA(14) => di_a_14_IBUF_579,
      DIA(13) => di_a_13_IBUF_578,
      DIA(12) => di_a_12_IBUF_576,
      DIA(11) => di_a_11_IBUF_573,
      DIA(10) => di_a_10_IBUF_692,
      DIA(9) => di_a_9_IBUF_628,
      DIA(8) => di_a_8_IBUF_626,
      DIA(7) => di_a_7_IBUF_623,
      DIA(6) => di_a_6_IBUF_619,
      DIA(5) => di_a_5_IBUF_616,
      DIA(4) => di_a_4_IBUF_613,
      DIA(3) => di_a_3_IBUF_609,
      DIA(2) => di_a_2_IBUF_606,
      DIA(1) => di_a_1_IBUF_603,
      DIA(0) => di_a_0_IBUF_600,
      DIPA(3) => '0',
      DIPA(2) => '0',
      DIPA(1) => '0',
      DIPA(0) => '0',
      DIB(31) => Mram_sdp_DIB31,
      DIB(30) => Mram_sdp_DIB30,
      DIB(29) => Mram_sdp_DIB29,
      DIB(28) => Mram_sdp_DIB28,
      DIB(27) => Mram_sdp_DIB27,
      DIB(26) => Mram_sdp_DIB26,
      DIB(25) => Mram_sdp_DIB25,
      DIB(24) => Mram_sdp_DIB24,
      DIB(23) => Mram_sdp_DIB23,
      DIB(22) => Mram_sdp_DIB22,
      DIB(21) => Mram_sdp_DIB21,
      DIB(20) => Mram_sdp_DIB20,
      DIB(19) => Mram_sdp_DIB19,
      DIB(18) => Mram_sdp_DIB18,
      DIB(17) => Mram_sdp_DIB17,
      DIB(16) => Mram_sdp_DIB16,
      DIB(15) => Mram_sdp_DIB15,
      DIB(14) => Mram_sdp_DIB14,
      DIB(13) => Mram_sdp_DIB13,
      DIB(12) => Mram_sdp_DIB12,
      DIB(11) => Mram_sdp_DIB11,
      DIB(10) => Mram_sdp_DIB10,
      DIB(9) => Mram_sdp_DIB9,
      DIB(8) => Mram_sdp_DIB8,
      DIB(7) => Mram_sdp_DIB7,
      DIB(6) => Mram_sdp_DIB6,
      DIB(5) => Mram_sdp_DIB5,
      DIB(4) => Mram_sdp_DIB4,
      DIB(3) => Mram_sdp_DIB3,
      DIB(2) => Mram_sdp_DIB2,
      DIB(1) => Mram_sdp_DIB1,
      DIB(0) => Mram_sdp_DIB0,
      DIPB(3) => Mram_sdp_DIPB3,
      DIPB(2) => Mram_sdp_DIPB2,
      DIPB(1) => Mram_sdp_DIPB1,
      DIPB(0) => Mram_sdp_DIPB0,
      DOA(31) => Mram_sdp_DOA31,
      DOA(30) => Mram_sdp_DOA30,
      DOA(29) => Mram_sdp_DOA29,
      DOA(28) => Mram_sdp_DOA28,
      DOA(27) => Mram_sdp_DOA27,
      DOA(26) => Mram_sdp_DOA26,
      DOA(25) => Mram_sdp_DOA25,
      DOA(24) => Mram_sdp_DOA24,
      DOA(23) => Mram_sdp_DOA23,
      DOA(22) => Mram_sdp_DOA22,
      DOA(21) => Mram_sdp_DOA21,
      DOA(20) => Mram_sdp_DOA20,
      DOA(19) => Mram_sdp_DOA19,
      DOA(18) => Mram_sdp_DOA18,
      DOA(17) => Mram_sdp_DOA17,
      DOA(16) => Mram_sdp_DOA16,
      DOA(15) => Mram_sdp_DOA15,
      DOA(14) => Mram_sdp_DOA14,
      DOA(13) => Mram_sdp_DOA13,
      DOA(12) => Mram_sdp_DOA12,
      DOA(11) => Mram_sdp_DOA11,
      DOA(10) => Mram_sdp_DOA10,
      DOA(9) => Mram_sdp_DOA9,
      DOA(8) => Mram_sdp_DOA8,
      DOA(7) => Mram_sdp_DOA7,
      DOA(6) => Mram_sdp_DOA6,
      DOA(5) => Mram_sdp_DOA5,
      DOA(4) => Mram_sdp_DOA4,
      DOA(3) => Mram_sdp_DOA3,
      DOA(2) => Mram_sdp_DOA2,
      DOA(1) => Mram_sdp_DOA1,
      DOA(0) => Mram_sdp_DOA0,
      DOPA(3) => Mram_sdp_DOPA3,
      DOPA(2) => Mram_sdp_DOPA2,
      DOPA(1) => Mram_sdp_DOPA1,
      DOPA(0) => Mram_sdp_DOPA0,
      DOB(31) => do_s_31_OBUF_648,
      DOB(30) => do_s_30_OBUF_644,
      DOB(29) => do_s_29_OBUF_676,
      DOB(28) => do_s_28_OBUF_672,
      DOB(27) => do_s_27_OBUF_667,
      DOB(26) => do_s_26_OBUF_662,
      DOB(25) => do_s_25_OBUF_657,
      DOB(24) => do_s_24_OBUF_653,
      DOB(23) => do_s_23_OBUF_649,
      DOB(22) => do_s_22_OBUF_645,
      DOB(21) => do_s_21_OBUF_641,
      DOB(20) => do_s_20_OBUF_638,
      DOB(19) => do_s_19_OBUF_668,
      DOB(18) => do_s_18_OBUF_663,
      DOB(17) => do_s_17_OBUF_658,
      DOB(16) => do_s_16_OBUF_654,
      DOB(15) => do_s_15_OBUF_650,
      DOB(14) => do_s_14_OBUF_646,
      DOB(13) => do_s_13_OBUF_642,
      DOB(12) => do_s_12_OBUF_639,
      DOB(11) => do_s_11_OBUF_636,
      DOB(10) => do_s_10_OBUF_634,
      DOB(9) => do_s_9_OBUF_664,
      DOB(8) => do_s_8_OBUF_659,
      DOB(7) => do_s_7_OBUF_655,
      DOB(6) => do_s_6_OBUF_651,
      DOB(5) => do_s_5_OBUF_647,
      DOB(4) => do_s_4_OBUF_643,
      DOB(3) => do_s_3_OBUF_640,
      DOB(2) => do_s_2_OBUF_637,
      DOB(1) => do_s_1_OBUF_635,
      DOB(0) => do_s_0_OBUF_633,
      DOPB(3) => Mram_sdp_DOPB3,
      DOPB(2) => Mram_sdp_DOPB2,
      DOPB(1) => Mram_sdp_DOPB1,
      DOPB(0) => Mram_sdp_DOPB0
    );
  do_b_13_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_13_OBUF_572,
      O => do_b_13_O
    );
  do_b_14_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_14_OBUF_575,
      O => do_b_14_O
    );
  do_b_15_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_15_OBUF_577,
      O => do_b_15_O
    );
  do_a_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_0_OBUF_587,
      O => do_a_0_O
    );
  do_a_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_1_OBUF_589,
      O => do_a_1_O
    );
  do_a_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_2_OBUF_591,
      O => do_a_2_O
    );
  do_a_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_3_OBUF_594,
      O => do_a_3_O
    );
  do_b_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_0_OBUF_596,
      O => do_b_0_O
    );
  do_a_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_4_OBUF_597,
      O => do_a_4_O
    );
  do_b_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_1_OBUF_598,
      O => do_b_1_O
    );
  do_a_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_5_OBUF_599,
      O => do_a_5_O
    );
  do_b_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_2_OBUF_601,
      O => do_b_2_O
    );
  do_a_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_6_OBUF_602,
      O => do_a_6_O
    );
  do_b_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_3_OBUF_604,
      O => do_b_3_O
    );
  do_a_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_7_OBUF_605,
      O => do_a_7_O
    );
  do_b_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_4_OBUF_607,
      O => do_b_4_O
    );
  do_a_8_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_8_OBUF_608,
      O => do_a_8_O
    );
  do_b_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_5_OBUF_610,
      O => do_b_5_O
    );
  do_a_9_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_9_OBUF_611,
      O => do_a_9_O
    );
  do_b_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_6_OBUF_614,
      O => do_b_6_O
    );
  do_b_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_7_OBUF_617,
      O => do_b_7_O
    );
  do_b_8_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_8_OBUF_621,
      O => do_b_8_O
    );
  do_b_9_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_9_OBUF_624,
      O => do_b_9_O
    );
  do_s_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_0_OBUF_633,
      O => do_s_0_O
    );
  do_s_10_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_10_OBUF_634,
      O => do_s_10_O
    );
  do_s_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_1_OBUF_635,
      O => do_s_1_O
    );
  do_s_11_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_11_OBUF_636,
      O => do_s_11_O
    );
  do_s_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_2_OBUF_637,
      O => do_s_2_O
    );
  do_s_20_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_20_OBUF_638,
      O => do_s_20_O
    );
  do_s_12_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_12_OBUF_639,
      O => do_s_12_O
    );
  do_s_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_3_OBUF_640,
      O => do_s_3_O
    );
  do_s_21_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_21_OBUF_641,
      O => do_s_21_O
    );
  do_s_13_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_13_OBUF_642,
      O => do_s_13_O
    );
  do_s_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_4_OBUF_643,
      O => do_s_4_O
    );
  do_s_30_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_30_OBUF_644,
      O => do_s_30_O
    );
  do_s_22_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_22_OBUF_645,
      O => do_s_22_O
    );
  do_s_14_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_14_OBUF_646,
      O => do_s_14_O
    );
  do_s_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_5_OBUF_647,
      O => do_s_5_O
    );
  do_s_31_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_31_OBUF_648,
      O => do_s_31_O
    );
  do_s_23_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_23_OBUF_649,
      O => do_s_23_O
    );
  do_s_15_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_15_OBUF_650,
      O => do_s_15_O
    );
  do_s_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_6_OBUF_651,
      O => do_s_6_O
    );
  do_s_24_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_24_OBUF_653,
      O => do_s_24_O
    );
  do_s_16_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_16_OBUF_654,
      O => do_s_16_O
    );
  do_s_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_7_OBUF_655,
      O => do_s_7_O
    );
  do_s_25_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_25_OBUF_657,
      O => do_s_25_O
    );
  do_s_17_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_17_OBUF_658,
      O => do_s_17_O
    );
  do_s_8_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_8_OBUF_659,
      O => do_s_8_O
    );
  do_a_10_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_10_OBUF_660,
      O => do_a_10_O
    );
  do_s_26_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_26_OBUF_662,
      O => do_s_26_O
    );
  do_s_18_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_18_OBUF_663,
      O => do_s_18_O
    );
  do_s_9_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_9_OBUF_664,
      O => do_s_9_O
    );
  do_a_11_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_11_OBUF_665,
      O => do_a_11_O
    );
  do_s_27_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_27_OBUF_667,
      O => do_s_27_O
    );
  do_s_19_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_19_OBUF_668,
      O => do_s_19_O
    );
  do_a_12_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_12_OBUF_669,
      O => do_a_12_O
    );
  do_s_28_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_28_OBUF_672,
      O => do_s_28_O
    );
  do_a_13_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_13_OBUF_673,
      O => do_a_13_O
    );
  do_s_29_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_s_29_OBUF_676,
      O => do_s_29_O
    );
  do_a_14_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_14_OBUF_677,
      O => do_a_14_O
    );
  do_a_15_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_a_15_OBUF_680,
      O => do_a_15_O
    );
  do_b_10_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_10_OBUF_687,
      O => do_b_10_O
    );
  do_b_11_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_11_OBUF_689,
      O => do_b_11_O
    );
  do_b_12_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => do_b_12_OBUF_691,
      O => do_b_12_O
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

