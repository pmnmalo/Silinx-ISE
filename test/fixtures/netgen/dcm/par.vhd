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
-- Device	: 3s250ecp132-4 (PRODUCTION 1.27 2013-10-13)
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
    en : in STD_LOGIC := 'X';
    locked : out STD_LOGIC;
    c2x : out STD_LOGIC_VECTOR ( 7 downto 0 );
    cdv : out STD_LOGIC_VECTOR ( 7 downto 0 );
    cfx : out STD_LOGIC_VECTOR ( 7 downto 0 );
    c0 : out STD_LOGIC_VECTOR ( 7 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal clkfx_b : STD_LOGIC;
  signal Mcount_nfx_cy_1_Q : STD_LOGIC;
  signal Mcount_nfx_cy_3_Q : STD_LOGIC;
  signal en_r_367 : STD_LOGIC;
  signal clk0_b : STD_LOGIC;
  signal Mcount_n0_cy_1_Q : STD_LOGIC;
  signal Mcount_n0_cy_3_Q : STD_LOGIC;
  signal clkdv_b : STD_LOGIC;
  signal Mcount_ndv_cy_1_Q : STD_LOGIC;
  signal Mcount_ndv_cy_3_Q : STD_LOGIC;
  signal locked_OBUF_401 : STD_LOGIC;
  signal clkfx_u : STD_LOGIC;
  signal clkdv_u : STD_LOGIC;
  signal clk2x_u : STD_LOGIC;
  signal clk0_u : STD_LOGIC;
  signal clk2x_b : STD_LOGIC;
  signal Maccum_n2x_cy_5_11_SW0_O : STD_LOGIC;
  signal nfx_0_DXMUX_453 : STD_LOGIC;
  signal nfx_0_XORF_451 : STD_LOGIC;
  signal nfx_0_LOGIC_ONE_450 : STD_LOGIC;
  signal nfx_0_CYINIT_449 : STD_LOGIC;
  signal nfx_0_CYSELF_440 : STD_LOGIC;
  signal nfx_0_BXINV_438 : STD_LOGIC;
  signal nfx_0_DYMUX_434 : STD_LOGIC;
  signal nfx_0_XORG_432 : STD_LOGIC;
  signal nfx_0_CYMUXG_431 : STD_LOGIC;
  signal Mcount_nfx_cy_0_Q : STD_LOGIC;
  signal nfx_0_LOGIC_ZERO_429 : STD_LOGIC;
  signal nfx_0_CYSELG_420 : STD_LOGIC;
  signal nfx_0_G : STD_LOGIC;
  signal nfx_0_CLKINV_418 : STD_LOGIC;
  signal nfx_2_DXMUX_501 : STD_LOGIC;
  signal nfx_2_XORF_499 : STD_LOGIC;
  signal nfx_2_CYINIT_498 : STD_LOGIC;
  signal nfx_2_F : STD_LOGIC;
  signal nfx_2_DYMUX_485 : STD_LOGIC;
  signal nfx_2_XORG_483 : STD_LOGIC;
  signal Mcount_nfx_cy_2_Q : STD_LOGIC;
  signal nfx_2_CYSELF_481 : STD_LOGIC;
  signal nfx_2_CYMUXFAST_480 : STD_LOGIC;
  signal nfx_2_CYAND_479 : STD_LOGIC;
  signal nfx_2_FASTCARRY_478 : STD_LOGIC;
  signal nfx_2_CYMUXG2_477 : STD_LOGIC;
  signal nfx_2_CYMUXF2_476 : STD_LOGIC;
  signal nfx_2_LOGIC_ZERO_475 : STD_LOGIC;
  signal nfx_2_CYSELG_466 : STD_LOGIC;
  signal nfx_2_G : STD_LOGIC;
  signal nfx_2_CLKINV_464 : STD_LOGIC;
  signal nfx_4_DXMUX_549 : STD_LOGIC;
  signal nfx_4_XORF_547 : STD_LOGIC;
  signal nfx_4_CYINIT_546 : STD_LOGIC;
  signal nfx_4_F : STD_LOGIC;
  signal nfx_4_DYMUX_533 : STD_LOGIC;
  signal nfx_4_XORG_531 : STD_LOGIC;
  signal Mcount_nfx_cy_4_Q : STD_LOGIC;
  signal nfx_4_CYSELF_529 : STD_LOGIC;
  signal nfx_4_CYMUXFAST_528 : STD_LOGIC;
  signal nfx_4_CYAND_527 : STD_LOGIC;
  signal nfx_4_FASTCARRY_526 : STD_LOGIC;
  signal nfx_4_CYMUXG2_525 : STD_LOGIC;
  signal nfx_4_CYMUXF2_524 : STD_LOGIC;
  signal nfx_4_LOGIC_ZERO_523 : STD_LOGIC;
  signal nfx_4_CYSELG_514 : STD_LOGIC;
  signal nfx_4_G : STD_LOGIC;
  signal nfx_4_CLKINV_512 : STD_LOGIC;
  signal nfx_6_DXMUX_590 : STD_LOGIC;
  signal nfx_6_XORF_588 : STD_LOGIC;
  signal nfx_6_LOGIC_ZERO_587 : STD_LOGIC;
  signal nfx_6_CYINIT_586 : STD_LOGIC;
  signal nfx_6_CYSELF_577 : STD_LOGIC;
  signal nfx_6_F : STD_LOGIC;
  signal nfx_6_DYMUX_572 : STD_LOGIC;
  signal nfx_6_XORG_570 : STD_LOGIC;
  signal Mcount_nfx_cy_6_Q : STD_LOGIC;
  signal nfx_7_rt_567 : STD_LOGIC;
  signal nfx_6_CLKINV_559 : STD_LOGIC;
  signal n0_0_DXMUX_639 : STD_LOGIC;
  signal n0_0_XORF_637 : STD_LOGIC;
  signal n0_0_LOGIC_ONE_636 : STD_LOGIC;
  signal n0_0_CYINIT_635 : STD_LOGIC;
  signal n0_0_CYSELF_626 : STD_LOGIC;
  signal n0_0_BXINV_624 : STD_LOGIC;
  signal n0_0_DYMUX_619 : STD_LOGIC;
  signal n0_0_XORG_617 : STD_LOGIC;
  signal n0_0_CYMUXG_616 : STD_LOGIC;
  signal Mcount_n0_cy_0_Q : STD_LOGIC;
  signal n0_0_LOGIC_ZERO_614 : STD_LOGIC;
  signal n0_0_CYSELG_605 : STD_LOGIC;
  signal n0_0_G : STD_LOGIC;
  signal n0_0_CLKINV_603 : STD_LOGIC;
  signal n0_0_CEINV_602 : STD_LOGIC;
  signal n0_2_DXMUX_691 : STD_LOGIC;
  signal n0_2_XORF_689 : STD_LOGIC;
  signal n0_2_CYINIT_688 : STD_LOGIC;
  signal n0_2_F : STD_LOGIC;
  signal n0_2_DYMUX_674 : STD_LOGIC;
  signal n0_2_XORG_672 : STD_LOGIC;
  signal Mcount_n0_cy_2_Q : STD_LOGIC;
  signal n0_2_CYSELF_670 : STD_LOGIC;
  signal n0_2_CYMUXFAST_669 : STD_LOGIC;
  signal n0_2_CYAND_668 : STD_LOGIC;
  signal n0_2_FASTCARRY_667 : STD_LOGIC;
  signal n0_2_CYMUXG2_666 : STD_LOGIC;
  signal n0_2_CYMUXF2_665 : STD_LOGIC;
  signal n0_2_LOGIC_ZERO_664 : STD_LOGIC;
  signal n0_2_CYSELG_655 : STD_LOGIC;
  signal n0_2_G : STD_LOGIC;
  signal n0_2_CLKINV_653 : STD_LOGIC;
  signal n0_2_CEINV_652 : STD_LOGIC;
  signal n0_4_DXMUX_743 : STD_LOGIC;
  signal n0_4_XORF_741 : STD_LOGIC;
  signal n0_4_CYINIT_740 : STD_LOGIC;
  signal n0_4_F : STD_LOGIC;
  signal n0_4_DYMUX_726 : STD_LOGIC;
  signal n0_4_XORG_724 : STD_LOGIC;
  signal Mcount_n0_cy_4_Q : STD_LOGIC;
  signal n0_4_CYSELF_722 : STD_LOGIC;
  signal n0_4_CYMUXFAST_721 : STD_LOGIC;
  signal n0_4_CYAND_720 : STD_LOGIC;
  signal n0_4_FASTCARRY_719 : STD_LOGIC;
  signal n0_4_CYMUXG2_718 : STD_LOGIC;
  signal n0_4_CYMUXF2_717 : STD_LOGIC;
  signal n0_4_LOGIC_ZERO_716 : STD_LOGIC;
  signal n0_4_CYSELG_707 : STD_LOGIC;
  signal n0_4_G : STD_LOGIC;
  signal n0_4_CLKINV_705 : STD_LOGIC;
  signal n0_4_CEINV_704 : STD_LOGIC;
  signal n0_6_DXMUX_788 : STD_LOGIC;
  signal n0_6_XORF_786 : STD_LOGIC;
  signal n0_6_LOGIC_ZERO_785 : STD_LOGIC;
  signal n0_6_CYINIT_784 : STD_LOGIC;
  signal n0_6_CYSELF_775 : STD_LOGIC;
  signal n0_6_F : STD_LOGIC;
  signal n0_6_DYMUX_769 : STD_LOGIC;
  signal n0_6_XORG_767 : STD_LOGIC;
  signal Mcount_n0_cy_6_Q : STD_LOGIC;
  signal n0_7_rt_764 : STD_LOGIC;
  signal n0_6_CLKINV_756 : STD_LOGIC;
  signal n0_6_CEINV_755 : STD_LOGIC;
  signal ndv_0_DXMUX_835 : STD_LOGIC;
  signal ndv_0_XORF_833 : STD_LOGIC;
  signal ndv_0_LOGIC_ONE_832 : STD_LOGIC;
  signal ndv_0_CYINIT_831 : STD_LOGIC;
  signal ndv_0_CYSELF_822 : STD_LOGIC;
  signal ndv_0_BXINV_820 : STD_LOGIC;
  signal ndv_0_DYMUX_816 : STD_LOGIC;
  signal ndv_0_XORG_814 : STD_LOGIC;
  signal ndv_0_CYMUXG_813 : STD_LOGIC;
  signal Mcount_ndv_cy_0_Q : STD_LOGIC;
  signal ndv_0_LOGIC_ZERO_811 : STD_LOGIC;
  signal ndv_0_CYSELG_802 : STD_LOGIC;
  signal ndv_0_G : STD_LOGIC;
  signal ndv_0_CLKINV_800 : STD_LOGIC;
  signal ndv_2_DXMUX_883 : STD_LOGIC;
  signal ndv_2_XORF_881 : STD_LOGIC;
  signal ndv_2_CYINIT_880 : STD_LOGIC;
  signal ndv_2_F : STD_LOGIC;
  signal ndv_2_DYMUX_867 : STD_LOGIC;
  signal ndv_2_XORG_865 : STD_LOGIC;
  signal Mcount_ndv_cy_2_Q : STD_LOGIC;
  signal ndv_2_CYSELF_863 : STD_LOGIC;
  signal ndv_2_CYMUXFAST_862 : STD_LOGIC;
  signal ndv_2_CYAND_861 : STD_LOGIC;
  signal ndv_2_FASTCARRY_860 : STD_LOGIC;
  signal ndv_2_CYMUXG2_859 : STD_LOGIC;
  signal ndv_2_CYMUXF2_858 : STD_LOGIC;
  signal ndv_2_LOGIC_ZERO_857 : STD_LOGIC;
  signal ndv_2_CYSELG_848 : STD_LOGIC;
  signal ndv_2_G : STD_LOGIC;
  signal ndv_2_CLKINV_846 : STD_LOGIC;
  signal ndv_4_DXMUX_931 : STD_LOGIC;
  signal ndv_4_XORF_929 : STD_LOGIC;
  signal ndv_4_CYINIT_928 : STD_LOGIC;
  signal ndv_4_F : STD_LOGIC;
  signal ndv_4_DYMUX_915 : STD_LOGIC;
  signal ndv_4_XORG_913 : STD_LOGIC;
  signal Mcount_ndv_cy_4_Q : STD_LOGIC;
  signal ndv_4_CYSELF_911 : STD_LOGIC;
  signal ndv_4_CYMUXFAST_910 : STD_LOGIC;
  signal ndv_4_CYAND_909 : STD_LOGIC;
  signal ndv_4_FASTCARRY_908 : STD_LOGIC;
  signal ndv_4_CYMUXG2_907 : STD_LOGIC;
  signal ndv_4_CYMUXF2_906 : STD_LOGIC;
  signal ndv_4_LOGIC_ZERO_905 : STD_LOGIC;
  signal ndv_4_CYSELG_896 : STD_LOGIC;
  signal ndv_4_G : STD_LOGIC;
  signal ndv_4_CLKINV_894 : STD_LOGIC;
  signal ndv_6_DXMUX_972 : STD_LOGIC;
  signal ndv_6_XORF_970 : STD_LOGIC;
  signal ndv_6_LOGIC_ZERO_969 : STD_LOGIC;
  signal ndv_6_CYINIT_968 : STD_LOGIC;
  signal ndv_6_CYSELF_959 : STD_LOGIC;
  signal ndv_6_F : STD_LOGIC;
  signal ndv_6_DYMUX_954 : STD_LOGIC;
  signal ndv_6_XORG_952 : STD_LOGIC;
  signal Mcount_ndv_cy_6_Q : STD_LOGIC;
  signal ndv_7_rt_949 : STD_LOGIC;
  signal ndv_6_CLKINV_941 : STD_LOGIC;
  signal cfx_2_O : STD_LOGIC;
  signal cfx_3_O : STD_LOGIC;
  signal cfx_4_O : STD_LOGIC;
  signal cfx_5_O : STD_LOGIC;
  signal en_INBUF : STD_LOGIC;
  signal cfx_6_O : STD_LOGIC;
  signal cfx_7_O : STD_LOGIC;
  signal clk_INBUF : STD_LOGIC;
  signal c0_0_O : STD_LOGIC;
  signal c0_1_O : STD_LOGIC;
  signal c0_2_O : STD_LOGIC;
  signal c0_3_O : STD_LOGIC;
  signal cdv_0_O : STD_LOGIC;
  signal c0_4_O : STD_LOGIC;
  signal cdv_1_O : STD_LOGIC;
  signal c0_5_O : STD_LOGIC;
  signal cdv_2_O : STD_LOGIC;
  signal c0_6_O : STD_LOGIC;
  signal cdv_3_O : STD_LOGIC;
  signal c0_7_O : STD_LOGIC;
  signal cdv_4_O : STD_LOGIC;
  signal cdv_5_O : STD_LOGIC;
  signal cdv_6_O : STD_LOGIC;
  signal cdv_7_O : STD_LOGIC;
  signal c2x_0_O : STD_LOGIC;
  signal c2x_1_O : STD_LOGIC;
  signal c2x_2_O : STD_LOGIC;
  signal c2x_3_O : STD_LOGIC;
  signal c2x_4_O : STD_LOGIC;
  signal c2x_5_O : STD_LOGIC;
  signal c2x_6_O : STD_LOGIC;
  signal locked_O : STD_LOGIC;
  signal c2x_7_O : STD_LOGIC;
  signal cfx_0_O : STD_LOGIC;
  signal cfx_1_O : STD_LOGIC;
  signal u_dcm_CLK90 : STD_LOGIC;
  signal u_dcm_CLK180 : STD_LOGIC;
  signal u_dcm_CLK270 : STD_LOGIC;
  signal u_dcm_CLK2X180 : STD_LOGIC;
  signal u_dcm_CLKFX180 : STD_LOGIC;
  signal u_dcm_STATUS7 : STD_LOGIC;
  signal u_dcm_STATUS6 : STD_LOGIC;
  signal u_dcm_STATUS5 : STD_LOGIC;
  signal u_dcm_STATUS4 : STD_LOGIC;
  signal u_dcm_STATUS3 : STD_LOGIC;
  signal u_dcm_STATUS2 : STD_LOGIC;
  signal u_dcm_STATUS1 : STD_LOGIC;
  signal u_dcm_STATUS0 : STD_LOGIC;
  signal u_dcm_PSDONE : STD_LOGIC;
  signal u_dcm_PSCLKINV_1265 : STD_LOGIC;
  signal u_dcm_CLKFB_BUF_1264 : STD_LOGIC;
  signal u_dcm_CLKIN_BUF_1263 : STD_LOGIC;
  signal u_bdv_S_INVNOT : STD_LOGIC;
  signal u_bdv_I0_INV : STD_LOGIC;
  signal u_b2x_S_INVNOT : STD_LOGIC;
  signal u_b2x_I0_INV : STD_LOGIC;
  signal u_bfx_S_INVNOT : STD_LOGIC;
  signal u_bfx_I0_INV : STD_LOGIC;
  signal u_b0_S_INVNOT : STD_LOGIC;
  signal u_b0_I0_INV : STD_LOGIC;
  signal n2x_4_DXMUX_1326 : STD_LOGIC;
  signal Result_4_1 : STD_LOGIC;
  signal Maccum_n2x_cy_3_pack_2 : STD_LOGIC;
  signal n2x_4_CLKINV_1309 : STD_LOGIC;
  signal n2x_7_DXMUX_1356 : STD_LOGIC;
  signal Result_7_1 : STD_LOGIC;
  signal Maccum_n2x_cy_5_11_SW0_O_pack_2 : STD_LOGIC;
  signal n2x_7_CLKINV_1339 : STD_LOGIC;
  signal n2x_1_DYMUX_1374 : STD_LOGIC;
  signal Result_1_1 : STD_LOGIC;
  signal n2x_1_CLKINV_1364 : STD_LOGIC;
  signal n2x_3_DXMUX_1408 : STD_LOGIC;
  signal Result_3_1 : STD_LOGIC;
  signal n2x_3_DYMUX_1397 : STD_LOGIC;
  signal Result_2_1 : STD_LOGIC;
  signal n2x_3_CLKINV_1388 : STD_LOGIC;
  signal n2x_6_DXMUX_1442 : STD_LOGIC;
  signal Result_6_1 : STD_LOGIC;
  signal n2x_6_DYMUX_1431 : STD_LOGIC;
  signal Result_5_1 : STD_LOGIC;
  signal n2x_6_CLKINV_1422 : STD_LOGIC;
  signal en_r_DYMUX_1451 : STD_LOGIC;
  signal en_r_CLKINV_1449 : STD_LOGIC;
  signal n2x_0_DYMUX_1462 : STD_LOGIC;
  signal n2x_0_BYINV_1461 : STD_LOGIC;
  signal n2x_0_SRINV_1460 : STD_LOGIC;
  signal n2x_0_CLKINV_1459 : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal NLW_u_dcm_DSSEN_UNCONNECTED : STD_LOGIC;
  signal nfx : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal n0 : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal ndv : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal n2x : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal Maccum_n2x_cy : STD_LOGIC_VECTOR ( 3 downto 3 );
  signal Mcount_nfx_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal Mcount_n0_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal Mcount_ndv_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
begin
  nfx_0_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X35Y64"
    )
    port map (
      O => nfx_0_LOGIC_ZERO_429
    );
  nfx_0_LOGIC_ONE : X_ONE
    generic map(
      LOC => "SLICE_X35Y64"
    )
    port map (
      O => nfx_0_LOGIC_ONE_450
    );
  nfx_0_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X35Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_0_XORF_451,
      O => nfx_0_DXMUX_453
    );
  nfx_0_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X35Y64"
    )
    port map (
      I0 => nfx_0_CYINIT_449,
      I1 => Mcount_nfx_lut(0),
      O => nfx_0_XORF_451
    );
  nfx_0_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X35Y64"
    )
    port map (
      IA => nfx_0_LOGIC_ONE_450,
      IB => nfx_0_CYINIT_449,
      SEL => nfx_0_CYSELF_440,
      O => Mcount_nfx_cy_0_Q
    );
  nfx_0_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X35Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_0_BXINV_438,
      O => nfx_0_CYINIT_449
    );
  nfx_0_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_nfx_lut(0),
      O => nfx_0_CYSELF_440
    );
  nfx_0_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X35Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => '0',
      O => nfx_0_BXINV_438
    );
  nfx_0_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X35Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_0_XORG_432,
      O => nfx_0_DYMUX_434
    );
  nfx_0_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X35Y64"
    )
    port map (
      I0 => Mcount_nfx_cy_0_Q,
      I1 => nfx_0_G,
      O => nfx_0_XORG_432
    );
  nfx_0_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X35Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_0_CYMUXG_431,
      O => Mcount_nfx_cy_1_Q
    );
  nfx_0_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X35Y64"
    )
    port map (
      IA => nfx_0_LOGIC_ZERO_429,
      IB => Mcount_nfx_cy_0_Q,
      SEL => nfx_0_CYSELG_420,
      O => nfx_0_CYMUXG_431
    );
  nfx_0_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X35Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_0_G,
      O => nfx_0_CYSELG_420
    );
  nfx_0_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X35Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => clkfx_b,
      O => nfx_0_CLKINV_418
    );
  nfx_1 : X_FF
    generic map(
      LOC => "SLICE_X35Y64",
      INIT => '0'
    )
    port map (
      I => nfx_0_DYMUX_434,
      CE => VCC,
      CLK => nfx_0_CLKINV_418,
      SET => GND,
      RST => GND,
      O => nfx(1)
    );
  nfx_2_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X35Y65"
    )
    port map (
      O => nfx_2_LOGIC_ZERO_475
    );
  nfx_2_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X35Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_2_XORF_499,
      O => nfx_2_DXMUX_501
    );
  nfx_2_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X35Y65"
    )
    port map (
      I0 => nfx_2_CYINIT_498,
      I1 => nfx_2_F,
      O => nfx_2_XORF_499
    );
  nfx_2_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X35Y65"
    )
    port map (
      IA => nfx_2_LOGIC_ZERO_475,
      IB => nfx_2_CYINIT_498,
      SEL => nfx_2_CYSELF_481,
      O => Mcount_nfx_cy_2_Q
    );
  nfx_2_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y65"
    )
    port map (
      IA => nfx_2_LOGIC_ZERO_475,
      IB => nfx_2_LOGIC_ZERO_475,
      SEL => nfx_2_CYSELF_481,
      O => nfx_2_CYMUXF2_476
    );
  nfx_2_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X35Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_nfx_cy_1_Q,
      O => nfx_2_CYINIT_498
    );
  nfx_2_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_2_F,
      O => nfx_2_CYSELF_481
    );
  nfx_2_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X35Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_2_XORG_483,
      O => nfx_2_DYMUX_485
    );
  nfx_2_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X35Y65"
    )
    port map (
      I0 => Mcount_nfx_cy_2_Q,
      I1 => nfx_2_G,
      O => nfx_2_XORG_483
    );
  nfx_2_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X35Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_2_CYMUXFAST_480,
      O => Mcount_nfx_cy_3_Q
    );
  nfx_2_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X35Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_nfx_cy_1_Q,
      O => nfx_2_FASTCARRY_478
    );
  nfx_2_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X35Y65"
    )
    port map (
      I0 => nfx_2_CYSELG_466,
      I1 => nfx_2_CYSELF_481,
      O => nfx_2_CYAND_479
    );
  nfx_2_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X35Y65"
    )
    port map (
      IA => nfx_2_CYMUXG2_477,
      IB => nfx_2_FASTCARRY_478,
      SEL => nfx_2_CYAND_479,
      O => nfx_2_CYMUXFAST_480
    );
  nfx_2_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y65"
    )
    port map (
      IA => nfx_2_LOGIC_ZERO_475,
      IB => nfx_2_CYMUXF2_476,
      SEL => nfx_2_CYSELG_466,
      O => nfx_2_CYMUXG2_477
    );
  nfx_2_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X35Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_2_G,
      O => nfx_2_CYSELG_466
    );
  nfx_2_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X35Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => clkfx_b,
      O => nfx_2_CLKINV_464
    );
  nfx_4_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X35Y66"
    )
    port map (
      O => nfx_4_LOGIC_ZERO_523
    );
  nfx_4_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X35Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_4_XORF_547,
      O => nfx_4_DXMUX_549
    );
  nfx_4_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X35Y66"
    )
    port map (
      I0 => nfx_4_CYINIT_546,
      I1 => nfx_4_F,
      O => nfx_4_XORF_547
    );
  nfx_4_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X35Y66"
    )
    port map (
      IA => nfx_4_LOGIC_ZERO_523,
      IB => nfx_4_CYINIT_546,
      SEL => nfx_4_CYSELF_529,
      O => Mcount_nfx_cy_4_Q
    );
  nfx_4_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y66"
    )
    port map (
      IA => nfx_4_LOGIC_ZERO_523,
      IB => nfx_4_LOGIC_ZERO_523,
      SEL => nfx_4_CYSELF_529,
      O => nfx_4_CYMUXF2_524
    );
  nfx_4_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X35Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_nfx_cy_3_Q,
      O => nfx_4_CYINIT_546
    );
  nfx_4_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_4_F,
      O => nfx_4_CYSELF_529
    );
  nfx_4_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X35Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_4_XORG_531,
      O => nfx_4_DYMUX_533
    );
  nfx_4_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X35Y66"
    )
    port map (
      I0 => Mcount_nfx_cy_4_Q,
      I1 => nfx_4_G,
      O => nfx_4_XORG_531
    );
  nfx_4_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X35Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_nfx_cy_3_Q,
      O => nfx_4_FASTCARRY_526
    );
  nfx_4_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X35Y66"
    )
    port map (
      I0 => nfx_4_CYSELG_514,
      I1 => nfx_4_CYSELF_529,
      O => nfx_4_CYAND_527
    );
  nfx_4_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X35Y66"
    )
    port map (
      IA => nfx_4_CYMUXG2_525,
      IB => nfx_4_FASTCARRY_526,
      SEL => nfx_4_CYAND_527,
      O => nfx_4_CYMUXFAST_528
    );
  nfx_4_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y66"
    )
    port map (
      IA => nfx_4_LOGIC_ZERO_523,
      IB => nfx_4_CYMUXF2_524,
      SEL => nfx_4_CYSELG_514,
      O => nfx_4_CYMUXG2_525
    );
  nfx_4_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X35Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_4_G,
      O => nfx_4_CYSELG_514
    );
  nfx_4_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X35Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => clkfx_b,
      O => nfx_4_CLKINV_512
    );
  nfx_6_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X35Y67"
    )
    port map (
      O => nfx_6_LOGIC_ZERO_587
    );
  nfx_6_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X35Y67",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_6_XORF_588,
      O => nfx_6_DXMUX_590
    );
  nfx_6_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X35Y67"
    )
    port map (
      I0 => nfx_6_CYINIT_586,
      I1 => nfx_6_F,
      O => nfx_6_XORF_588
    );
  nfx_6_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X35Y67"
    )
    port map (
      IA => nfx_6_LOGIC_ZERO_587,
      IB => nfx_6_CYINIT_586,
      SEL => nfx_6_CYSELF_577,
      O => Mcount_nfx_cy_6_Q
    );
  nfx_6_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X35Y67",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_4_CYMUXFAST_528,
      O => nfx_6_CYINIT_586
    );
  nfx_6_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y67",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_6_F,
      O => nfx_6_CYSELF_577
    );
  nfx_6_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X35Y67",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx_6_XORG_570,
      O => nfx_6_DYMUX_572
    );
  nfx_6_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X35Y67"
    )
    port map (
      I0 => Mcount_nfx_cy_6_Q,
      I1 => nfx_7_rt_567,
      O => nfx_6_XORG_570
    );
  nfx_6_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X35Y67",
      PATHPULSE => 638 ps
    )
    port map (
      I => clkfx_b,
      O => nfx_6_CLKINV_559
    );
  nfx_7 : X_FF
    generic map(
      LOC => "SLICE_X35Y67",
      INIT => '0'
    )
    port map (
      I => nfx_6_DYMUX_572,
      CE => VCC,
      CLK => nfx_6_CLKINV_559,
      SET => GND,
      RST => GND,
      O => nfx(7)
    );
  nfx_7_rt : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X35Y67"
    )
    port map (
      ADR0 => VCC,
      ADR1 => nfx(7),
      ADR2 => VCC,
      ADR3 => VCC,
      O => nfx_7_rt_567
    );
  n0_0_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X15Y64"
    )
    port map (
      O => n0_0_LOGIC_ZERO_614
    );
  n0_0_LOGIC_ONE : X_ONE
    generic map(
      LOC => "SLICE_X15Y64"
    )
    port map (
      O => n0_0_LOGIC_ONE_636
    );
  n0_0_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X15Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_0_XORF_637,
      O => n0_0_DXMUX_639
    );
  n0_0_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X15Y64"
    )
    port map (
      I0 => n0_0_CYINIT_635,
      I1 => Mcount_n0_lut(0),
      O => n0_0_XORF_637
    );
  n0_0_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X15Y64"
    )
    port map (
      IA => n0_0_LOGIC_ONE_636,
      IB => n0_0_CYINIT_635,
      SEL => n0_0_CYSELF_626,
      O => Mcount_n0_cy_0_Q
    );
  n0_0_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X15Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_0_BXINV_624,
      O => n0_0_CYINIT_635
    );
  n0_0_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X15Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_n0_lut(0),
      O => n0_0_CYSELF_626
    );
  n0_0_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X15Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => '0',
      O => n0_0_BXINV_624
    );
  n0_0_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X15Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_0_XORG_617,
      O => n0_0_DYMUX_619
    );
  n0_0_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X15Y64"
    )
    port map (
      I0 => Mcount_n0_cy_0_Q,
      I1 => n0_0_G,
      O => n0_0_XORG_617
    );
  n0_0_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X15Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_0_CYMUXG_616,
      O => Mcount_n0_cy_1_Q
    );
  n0_0_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X15Y64"
    )
    port map (
      IA => n0_0_LOGIC_ZERO_614,
      IB => Mcount_n0_cy_0_Q,
      SEL => n0_0_CYSELG_605,
      O => n0_0_CYMUXG_616
    );
  n0_0_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X15Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_0_G,
      O => n0_0_CYSELG_605
    );
  n0_0_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X15Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk0_b,
      O => n0_0_CLKINV_603
    );
  n0_0_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X15Y64",
      PATHPULSE => 638 ps
    )
    port map (
      I => en_r_367,
      O => n0_0_CEINV_602
    );
  n0_2_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X15Y65"
    )
    port map (
      O => n0_2_LOGIC_ZERO_664
    );
  n0_2_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X15Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_2_XORF_689,
      O => n0_2_DXMUX_691
    );
  n0_2_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X15Y65"
    )
    port map (
      I0 => n0_2_CYINIT_688,
      I1 => n0_2_F,
      O => n0_2_XORF_689
    );
  n0_2_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X15Y65"
    )
    port map (
      IA => n0_2_LOGIC_ZERO_664,
      IB => n0_2_CYINIT_688,
      SEL => n0_2_CYSELF_670,
      O => Mcount_n0_cy_2_Q
    );
  n0_2_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X15Y65"
    )
    port map (
      IA => n0_2_LOGIC_ZERO_664,
      IB => n0_2_LOGIC_ZERO_664,
      SEL => n0_2_CYSELF_670,
      O => n0_2_CYMUXF2_665
    );
  n0_2_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X15Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_n0_cy_1_Q,
      O => n0_2_CYINIT_688
    );
  n0_2_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X15Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_2_F,
      O => n0_2_CYSELF_670
    );
  n0_2_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X15Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_2_XORG_672,
      O => n0_2_DYMUX_674
    );
  n0_2_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X15Y65"
    )
    port map (
      I0 => Mcount_n0_cy_2_Q,
      I1 => n0_2_G,
      O => n0_2_XORG_672
    );
  n0_2_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X15Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_2_CYMUXFAST_669,
      O => Mcount_n0_cy_3_Q
    );
  n0_2_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X15Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_n0_cy_1_Q,
      O => n0_2_FASTCARRY_667
    );
  n0_2_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X15Y65"
    )
    port map (
      I0 => n0_2_CYSELG_655,
      I1 => n0_2_CYSELF_670,
      O => n0_2_CYAND_668
    );
  n0_2_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X15Y65"
    )
    port map (
      IA => n0_2_CYMUXG2_666,
      IB => n0_2_FASTCARRY_667,
      SEL => n0_2_CYAND_668,
      O => n0_2_CYMUXFAST_669
    );
  n0_2_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X15Y65"
    )
    port map (
      IA => n0_2_LOGIC_ZERO_664,
      IB => n0_2_CYMUXF2_665,
      SEL => n0_2_CYSELG_655,
      O => n0_2_CYMUXG2_666
    );
  n0_2_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X15Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_2_G,
      O => n0_2_CYSELG_655
    );
  n0_2_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X15Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk0_b,
      O => n0_2_CLKINV_653
    );
  n0_2_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X15Y65",
      PATHPULSE => 638 ps
    )
    port map (
      I => en_r_367,
      O => n0_2_CEINV_652
    );
  n0_4_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X15Y66"
    )
    port map (
      O => n0_4_LOGIC_ZERO_716
    );
  n0_4_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X15Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_4_XORF_741,
      O => n0_4_DXMUX_743
    );
  n0_4_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X15Y66"
    )
    port map (
      I0 => n0_4_CYINIT_740,
      I1 => n0_4_F,
      O => n0_4_XORF_741
    );
  n0_4_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X15Y66"
    )
    port map (
      IA => n0_4_LOGIC_ZERO_716,
      IB => n0_4_CYINIT_740,
      SEL => n0_4_CYSELF_722,
      O => Mcount_n0_cy_4_Q
    );
  n0_4_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X15Y66"
    )
    port map (
      IA => n0_4_LOGIC_ZERO_716,
      IB => n0_4_LOGIC_ZERO_716,
      SEL => n0_4_CYSELF_722,
      O => n0_4_CYMUXF2_717
    );
  n0_4_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X15Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_n0_cy_3_Q,
      O => n0_4_CYINIT_740
    );
  n0_4_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X15Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_4_F,
      O => n0_4_CYSELF_722
    );
  n0_4_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X15Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_4_XORG_724,
      O => n0_4_DYMUX_726
    );
  n0_4_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X15Y66"
    )
    port map (
      I0 => Mcount_n0_cy_4_Q,
      I1 => n0_4_G,
      O => n0_4_XORG_724
    );
  n0_4_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X15Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_n0_cy_3_Q,
      O => n0_4_FASTCARRY_719
    );
  n0_4_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X15Y66"
    )
    port map (
      I0 => n0_4_CYSELG_707,
      I1 => n0_4_CYSELF_722,
      O => n0_4_CYAND_720
    );
  n0_4_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X15Y66"
    )
    port map (
      IA => n0_4_CYMUXG2_718,
      IB => n0_4_FASTCARRY_719,
      SEL => n0_4_CYAND_720,
      O => n0_4_CYMUXFAST_721
    );
  n0_4_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X15Y66"
    )
    port map (
      IA => n0_4_LOGIC_ZERO_716,
      IB => n0_4_CYMUXF2_717,
      SEL => n0_4_CYSELG_707,
      O => n0_4_CYMUXG2_718
    );
  n0_4_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X15Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_4_G,
      O => n0_4_CYSELG_707
    );
  n0_4_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X15Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk0_b,
      O => n0_4_CLKINV_705
    );
  n0_4_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X15Y66",
      PATHPULSE => 638 ps
    )
    port map (
      I => en_r_367,
      O => n0_4_CEINV_704
    );
  n0_6_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X15Y67"
    )
    port map (
      O => n0_6_LOGIC_ZERO_785
    );
  n0_6_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X15Y67",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_6_XORF_786,
      O => n0_6_DXMUX_788
    );
  n0_6_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X15Y67"
    )
    port map (
      I0 => n0_6_CYINIT_784,
      I1 => n0_6_F,
      O => n0_6_XORF_786
    );
  n0_6_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X15Y67"
    )
    port map (
      IA => n0_6_LOGIC_ZERO_785,
      IB => n0_6_CYINIT_784,
      SEL => n0_6_CYSELF_775,
      O => Mcount_n0_cy_6_Q
    );
  n0_6_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X15Y67",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_4_CYMUXFAST_721,
      O => n0_6_CYINIT_784
    );
  n0_6_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X15Y67",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_6_F,
      O => n0_6_CYSELF_775
    );
  n0_6_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X15Y67",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0_6_XORG_767,
      O => n0_6_DYMUX_769
    );
  n0_6_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X15Y67"
    )
    port map (
      I0 => Mcount_n0_cy_6_Q,
      I1 => n0_7_rt_764,
      O => n0_6_XORG_767
    );
  n0_6_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X15Y67",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk0_b,
      O => n0_6_CLKINV_756
    );
  n0_6_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X15Y67",
      PATHPULSE => 638 ps
    )
    port map (
      I => en_r_367,
      O => n0_6_CEINV_755
    );
  n0_7 : X_FF
    generic map(
      LOC => "SLICE_X15Y67",
      INIT => '0'
    )
    port map (
      I => n0_6_DYMUX_769,
      CE => n0_6_CEINV_755,
      CLK => n0_6_CLKINV_756,
      SET => GND,
      RST => GND,
      O => n0(7)
    );
  n0_7_rt : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X15Y67"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => n0(7),
      ADR3 => VCC,
      O => n0_7_rt_764
    );
  ndv_0_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X51Y60"
    )
    port map (
      O => ndv_0_LOGIC_ZERO_811
    );
  ndv_0_LOGIC_ONE : X_ONE
    generic map(
      LOC => "SLICE_X51Y60"
    )
    port map (
      O => ndv_0_LOGIC_ONE_832
    );
  ndv_0_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y60",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_0_XORF_833,
      O => ndv_0_DXMUX_835
    );
  ndv_0_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X51Y60"
    )
    port map (
      I0 => ndv_0_CYINIT_831,
      I1 => Mcount_ndv_lut(0),
      O => ndv_0_XORF_833
    );
  ndv_0_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X51Y60"
    )
    port map (
      IA => ndv_0_LOGIC_ONE_832,
      IB => ndv_0_CYINIT_831,
      SEL => ndv_0_CYSELF_822,
      O => Mcount_ndv_cy_0_Q
    );
  ndv_0_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X51Y60",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_0_BXINV_820,
      O => ndv_0_CYINIT_831
    );
  ndv_0_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X51Y60",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_ndv_lut(0),
      O => ndv_0_CYSELF_822
    );
  ndv_0_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y60",
      PATHPULSE => 638 ps
    )
    port map (
      I => '0',
      O => ndv_0_BXINV_820
    );
  ndv_0_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y60",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_0_XORG_814,
      O => ndv_0_DYMUX_816
    );
  ndv_0_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X51Y60"
    )
    port map (
      I0 => Mcount_ndv_cy_0_Q,
      I1 => ndv_0_G,
      O => ndv_0_XORG_814
    );
  ndv_0_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X51Y60",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_0_CYMUXG_813,
      O => Mcount_ndv_cy_1_Q
    );
  ndv_0_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X51Y60"
    )
    port map (
      IA => ndv_0_LOGIC_ZERO_811,
      IB => Mcount_ndv_cy_0_Q,
      SEL => ndv_0_CYSELG_802,
      O => ndv_0_CYMUXG_813
    );
  ndv_0_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X51Y60",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_0_G,
      O => ndv_0_CYSELG_802
    );
  ndv_0_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y60",
      PATHPULSE => 638 ps
    )
    port map (
      I => clkdv_b,
      O => ndv_0_CLKINV_800
    );
  ndv_1 : X_FF
    generic map(
      LOC => "SLICE_X51Y60",
      INIT => '0'
    )
    port map (
      I => ndv_0_DYMUX_816,
      CE => VCC,
      CLK => ndv_0_CLKINV_800,
      SET => GND,
      RST => GND,
      O => ndv(1)
    );
  ndv_2_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X51Y61"
    )
    port map (
      O => ndv_2_LOGIC_ZERO_857
    );
  ndv_2_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y61",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_2_XORF_881,
      O => ndv_2_DXMUX_883
    );
  ndv_2_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X51Y61"
    )
    port map (
      I0 => ndv_2_CYINIT_880,
      I1 => ndv_2_F,
      O => ndv_2_XORF_881
    );
  ndv_2_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X51Y61"
    )
    port map (
      IA => ndv_2_LOGIC_ZERO_857,
      IB => ndv_2_CYINIT_880,
      SEL => ndv_2_CYSELF_863,
      O => Mcount_ndv_cy_2_Q
    );
  ndv_2_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X51Y61"
    )
    port map (
      IA => ndv_2_LOGIC_ZERO_857,
      IB => ndv_2_LOGIC_ZERO_857,
      SEL => ndv_2_CYSELF_863,
      O => ndv_2_CYMUXF2_858
    );
  ndv_2_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X51Y61",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_ndv_cy_1_Q,
      O => ndv_2_CYINIT_880
    );
  ndv_2_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X51Y61",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_2_F,
      O => ndv_2_CYSELF_863
    );
  ndv_2_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y61",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_2_XORG_865,
      O => ndv_2_DYMUX_867
    );
  ndv_2_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X51Y61"
    )
    port map (
      I0 => Mcount_ndv_cy_2_Q,
      I1 => ndv_2_G,
      O => ndv_2_XORG_865
    );
  ndv_2_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X51Y61",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_2_CYMUXFAST_862,
      O => Mcount_ndv_cy_3_Q
    );
  ndv_2_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X51Y61",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_ndv_cy_1_Q,
      O => ndv_2_FASTCARRY_860
    );
  ndv_2_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X51Y61"
    )
    port map (
      I0 => ndv_2_CYSELG_848,
      I1 => ndv_2_CYSELF_863,
      O => ndv_2_CYAND_861
    );
  ndv_2_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X51Y61"
    )
    port map (
      IA => ndv_2_CYMUXG2_859,
      IB => ndv_2_FASTCARRY_860,
      SEL => ndv_2_CYAND_861,
      O => ndv_2_CYMUXFAST_862
    );
  ndv_2_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X51Y61"
    )
    port map (
      IA => ndv_2_LOGIC_ZERO_857,
      IB => ndv_2_CYMUXF2_858,
      SEL => ndv_2_CYSELG_848,
      O => ndv_2_CYMUXG2_859
    );
  ndv_2_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X51Y61",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_2_G,
      O => ndv_2_CYSELG_848
    );
  ndv_2_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y61",
      PATHPULSE => 638 ps
    )
    port map (
      I => clkdv_b,
      O => ndv_2_CLKINV_846
    );
  ndv_4_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X51Y62"
    )
    port map (
      O => ndv_4_LOGIC_ZERO_905
    );
  ndv_4_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y62",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_4_XORF_929,
      O => ndv_4_DXMUX_931
    );
  ndv_4_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X51Y62"
    )
    port map (
      I0 => ndv_4_CYINIT_928,
      I1 => ndv_4_F,
      O => ndv_4_XORF_929
    );
  ndv_4_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X51Y62"
    )
    port map (
      IA => ndv_4_LOGIC_ZERO_905,
      IB => ndv_4_CYINIT_928,
      SEL => ndv_4_CYSELF_911,
      O => Mcount_ndv_cy_4_Q
    );
  ndv_4_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X51Y62"
    )
    port map (
      IA => ndv_4_LOGIC_ZERO_905,
      IB => ndv_4_LOGIC_ZERO_905,
      SEL => ndv_4_CYSELF_911,
      O => ndv_4_CYMUXF2_906
    );
  ndv_4_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X51Y62",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_ndv_cy_3_Q,
      O => ndv_4_CYINIT_928
    );
  ndv_4_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X51Y62",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_4_F,
      O => ndv_4_CYSELF_911
    );
  ndv_4_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y62",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_4_XORG_913,
      O => ndv_4_DYMUX_915
    );
  ndv_4_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X51Y62"
    )
    port map (
      I0 => Mcount_ndv_cy_4_Q,
      I1 => ndv_4_G,
      O => ndv_4_XORG_913
    );
  ndv_4_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X51Y62",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcount_ndv_cy_3_Q,
      O => ndv_4_FASTCARRY_908
    );
  ndv_4_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X51Y62"
    )
    port map (
      I0 => ndv_4_CYSELG_896,
      I1 => ndv_4_CYSELF_911,
      O => ndv_4_CYAND_909
    );
  ndv_4_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X51Y62"
    )
    port map (
      IA => ndv_4_CYMUXG2_907,
      IB => ndv_4_FASTCARRY_908,
      SEL => ndv_4_CYAND_909,
      O => ndv_4_CYMUXFAST_910
    );
  ndv_4_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X51Y62"
    )
    port map (
      IA => ndv_4_LOGIC_ZERO_905,
      IB => ndv_4_CYMUXF2_906,
      SEL => ndv_4_CYSELG_896,
      O => ndv_4_CYMUXG2_907
    );
  ndv_4_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X51Y62",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_4_G,
      O => ndv_4_CYSELG_896
    );
  ndv_4_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y62",
      PATHPULSE => 638 ps
    )
    port map (
      I => clkdv_b,
      O => ndv_4_CLKINV_894
    );
  ndv_6_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X51Y63"
    )
    port map (
      O => ndv_6_LOGIC_ZERO_969
    );
  ndv_6_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y63",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_6_XORF_970,
      O => ndv_6_DXMUX_972
    );
  ndv_6_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X51Y63"
    )
    port map (
      I0 => ndv_6_CYINIT_968,
      I1 => ndv_6_F,
      O => ndv_6_XORF_970
    );
  ndv_6_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X51Y63"
    )
    port map (
      IA => ndv_6_LOGIC_ZERO_969,
      IB => ndv_6_CYINIT_968,
      SEL => ndv_6_CYSELF_959,
      O => Mcount_ndv_cy_6_Q
    );
  ndv_6_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X51Y63",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_4_CYMUXFAST_910,
      O => ndv_6_CYINIT_968
    );
  ndv_6_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X51Y63",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_6_F,
      O => ndv_6_CYSELF_959
    );
  ndv_6_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y63",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv_6_XORG_952,
      O => ndv_6_DYMUX_954
    );
  ndv_6_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X51Y63"
    )
    port map (
      I0 => Mcount_ndv_cy_6_Q,
      I1 => ndv_7_rt_949,
      O => ndv_6_XORG_952
    );
  ndv_6_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y63",
      PATHPULSE => 638 ps
    )
    port map (
      I => clkdv_b,
      O => ndv_6_CLKINV_941
    );
  ndv_7 : X_FF
    generic map(
      LOC => "SLICE_X51Y63",
      INIT => '0'
    )
    port map (
      I => ndv_6_DYMUX_954,
      CE => VCC,
      CLK => ndv_6_CLKINV_941,
      SET => GND,
      RST => GND,
      O => ndv(7)
    );
  ndv_7_rt : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X51Y63"
    )
    port map (
      ADR0 => ndv(7),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => ndv_7_rt_949
    );
  cfx_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD26"
    )
    port map (
      I => cfx_2_O,
      O => cfx(2)
    );
  cfx_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD27"
    )
    port map (
      I => cfx_3_O,
      O => cfx(3)
    );
  cfx_4_OBUF : X_OBUF
    generic map(
      LOC => "PAD33"
    )
    port map (
      I => cfx_4_O,
      O => cfx(4)
    );
  cfx_5_OBUF : X_OBUF
    generic map(
      LOC => "PAD34"
    )
    port map (
      I => cfx_5_O,
      O => cfx(5)
    );
  en_IBUF : X_BUF
    generic map(
      LOC => "IPAD157",
      PATHPULSE => 638 ps
    )
    port map (
      I => en,
      O => en_INBUF
    );
  cfx_6_OBUF : X_OBUF
    generic map(
      LOC => "PAD35"
    )
    port map (
      I => cfx_6_O,
      O => cfx(6)
    );
  cfx_7_OBUF : X_OBUF
    generic map(
      LOC => "PAD36"
    )
    port map (
      I => cfx_7_O,
      O => cfx(7)
    );
  u_ibufg : X_BUF
    generic map(
      LOC => "IPAD22",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk,
      O => clk_INBUF
    );
  c0_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD4"
    )
    port map (
      I => c0_0_O,
      O => c0(0)
    );
  c0_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD5"
    )
    port map (
      I => c0_1_O,
      O => c0(1)
    );
  c0_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD11"
    )
    port map (
      I => c0_2_O,
      O => c0(2)
    );
  c0_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD12"
    )
    port map (
      I => c0_3_O,
      O => c0(3)
    );
  cdv_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD42"
    )
    port map (
      I => cdv_0_O,
      O => cdv(0)
    );
  c0_4_OBUF : X_OBUF
    generic map(
      LOC => "PAD14"
    )
    port map (
      I => c0_4_O,
      O => c0(4)
    );
  cdv_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD43"
    )
    port map (
      I => cdv_1_O,
      O => cdv(1)
    );
  c0_5_OBUF : X_OBUF
    generic map(
      LOC => "PAD15"
    )
    port map (
      I => c0_5_O,
      O => c0(5)
    );
  cdv_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD46"
    )
    port map (
      I => cdv_2_O,
      O => cdv(2)
    );
  c0_6_OBUF : X_OBUF
    generic map(
      LOC => "PAD19"
    )
    port map (
      I => c0_6_O,
      O => c0(6)
    );
  cdv_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD47"
    )
    port map (
      I => cdv_3_O,
      O => cdv(3)
    );
  c0_7_OBUF : X_OBUF
    generic map(
      LOC => "PAD20"
    )
    port map (
      I => c0_7_O,
      O => c0(7)
    );
  cdv_4_OBUF : X_OBUF
    generic map(
      LOC => "PAD48"
    )
    port map (
      I => cdv_4_O,
      O => cdv(4)
    );
  cdv_5_OBUF : X_OBUF
    generic map(
      LOC => "PAD49"
    )
    port map (
      I => cdv_5_O,
      O => cdv(5)
    );
  cdv_6_OBUF : X_OBUF
    generic map(
      LOC => "PAD57"
    )
    port map (
      I => cdv_6_O,
      O => cdv(6)
    );
  cdv_7_OBUF : X_OBUF
    generic map(
      LOC => "PAD59"
    )
    port map (
      I => cdv_7_O,
      O => cdv(7)
    );
  c2x_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD60"
    )
    port map (
      I => c2x_0_O,
      O => c2x(0)
    );
  c2x_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD62"
    )
    port map (
      I => c2x_1_O,
      O => c2x(1)
    );
  c2x_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD63"
    )
    port map (
      I => c2x_2_O,
      O => c2x(2)
    );
  c2x_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD64"
    )
    port map (
      I => c2x_3_O,
      O => c2x(3)
    );
  c2x_4_OBUF : X_OBUF
    generic map(
      LOC => "PAD65"
    )
    port map (
      I => c2x_4_O,
      O => c2x(4)
    );
  c2x_5_OBUF : X_OBUF
    generic map(
      LOC => "PAD67"
    )
    port map (
      I => c2x_5_O,
      O => c2x(5)
    );
  c2x_6_OBUF : X_OBUF
    generic map(
      LOC => "PAD68"
    )
    port map (
      I => c2x_6_O,
      O => c2x(6)
    );
  locked_OBUF : X_OBUF
    generic map(
      LOC => "PAD2"
    )
    port map (
      I => locked_O,
      O => locked
    );
  c2x_7_OBUF : X_OBUF
    generic map(
      LOC => "PAD69"
    )
    port map (
      I => c2x_7_O,
      O => c2x(7)
    );
  cfx_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD23"
    )
    port map (
      I => cfx_0_O,
      O => cfx(0)
    );
  cfx_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD24"
    )
    port map (
      I => cfx_1_O,
      O => cfx(1)
    );
  u_dcm_PSCLKINV : X_BUF
    generic map(
      LOC => "DCM_X0Y1",
      PATHPULSE => 638 ps
    )
    port map (
      I => '0',
      O => u_dcm_PSCLKINV_1265
    );
  u_dcm : X_DCM_SP
    generic map(
      DUTY_CYCLE_CORRECTION => TRUE,
      FACTORY_JF => X"C080",
      CLKDV_DIVIDE => 2.500000,
      CLKFX_DIVIDE => 2,
      CLKFX_MULTIPLY => 3,
      CLKOUT_PHASE_SHIFT => "NONE",
      CLKIN_PERIOD => 20.000000,
      DESKEW_ADJUST => "7",
      DFS_FREQUENCY_MODE => "LOW",
      STARTUP_WAIT => FALSE,
      CLK_FEEDBACK => "1X",
      DLL_FREQUENCY_MODE => "LOW",
      CLKIN_DIVIDE_BY_2 => FALSE,
      PHASE_SHIFT => 0,
      LOC => "DCM_X0Y1"
    )
    port map (
      CLKIN => u_dcm_CLKIN_BUF_1263,
      CLKFB => u_dcm_CLKFB_BUF_1264,
      RST => '0',
      DSSEN => NLW_u_dcm_DSSEN_UNCONNECTED,
      PSINCDEC => '0',
      PSEN => '0',
      PSCLK => u_dcm_PSCLKINV_1265,
      PSDONE => u_dcm_PSDONE,
      LOCKED => locked_OBUF_401,
      CLKFX180 => u_dcm_CLKFX180,
      CLKFX => clkfx_u,
      CLKDV => clkdv_u,
      CLK2X180 => u_dcm_CLK2X180,
      CLK2X => clk2x_u,
      CLK270 => u_dcm_CLK270,
      CLK180 => u_dcm_CLK180,
      CLK90 => u_dcm_CLK90,
      CLK0 => clk0_u,
      STATUS(7) => u_dcm_STATUS7,
      STATUS(6) => u_dcm_STATUS6,
      STATUS(5) => u_dcm_STATUS5,
      STATUS(4) => u_dcm_STATUS4,
      STATUS(3) => u_dcm_STATUS3,
      STATUS(2) => u_dcm_STATUS2,
      STATUS(1) => u_dcm_STATUS1,
      STATUS(0) => u_dcm_STATUS0
    );
  u_dcm_CLKFB_BUF : X_BUF
    generic map(
      LOC => "DCM_X0Y1",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk0_b,
      O => u_dcm_CLKFB_BUF_1264
    );
  u_dcm_CLKIN_BUF : X_BUF
    generic map(
      LOC => "DCM_X0Y1",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_INBUF,
      O => u_dcm_CLKIN_BUF_1263
    );
  u_bdv : X_BUFGMUX
    generic map(
      LOC => "BUFGMUX_X2Y11"
    )
    port map (
      I0 => u_bdv_I0_INV,
      I1 => GND,
      S => u_bdv_S_INVNOT,
      O => clkdv_b
    );
  u_bdv_SINV : X_INV
    generic map(
      LOC => "BUFGMUX_X2Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => u_bdv_S_INVNOT
    );
  u_bdv_I0_USED : X_BUF
    generic map(
      LOC => "BUFGMUX_X2Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => clkdv_u,
      O => u_bdv_I0_INV
    );
  u_b2x : X_BUFGMUX
    generic map(
      LOC => "BUFGMUX_X1Y11"
    )
    port map (
      I0 => u_b2x_I0_INV,
      I1 => GND,
      S => u_b2x_S_INVNOT,
      O => clk2x_b
    );
  u_b2x_SINV : X_INV
    generic map(
      LOC => "BUFGMUX_X1Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => u_b2x_S_INVNOT
    );
  u_b2x_I0_USED : X_BUF
    generic map(
      LOC => "BUFGMUX_X1Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk2x_u,
      O => u_b2x_I0_INV
    );
  u_bfx : X_BUFGMUX
    generic map(
      LOC => "BUFGMUX_X1Y10"
    )
    port map (
      I0 => u_bfx_I0_INV,
      I1 => GND,
      S => u_bfx_S_INVNOT,
      O => clkfx_b
    );
  u_bfx_SINV : X_INV
    generic map(
      LOC => "BUFGMUX_X1Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => u_bfx_S_INVNOT
    );
  u_bfx_I0_USED : X_BUF
    generic map(
      LOC => "BUFGMUX_X1Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => clkfx_u,
      O => u_bfx_I0_INV
    );
  u_b0 : X_BUFGMUX
    generic map(
      LOC => "BUFGMUX_X2Y10"
    )
    port map (
      I0 => u_b0_I0_INV,
      I1 => GND,
      S => u_b0_S_INVNOT,
      O => clk0_b
    );
  u_b0_SINV : X_INV
    generic map(
      LOC => "BUFGMUX_X2Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => u_b0_S_INVNOT
    );
  u_b0_I0_USED : X_BUF
    generic map(
      LOC => "BUFGMUX_X2Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk0_u,
      O => u_b0_I0_INV
    );
  n2x_4_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => Result_4_1,
      O => n2x_4_DXMUX_1326
    );
  n2x_4_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_n2x_cy_3_pack_2,
      O => Maccum_n2x_cy(3)
    );
  n2x_4_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk2x_b,
      O => n2x_4_CLKINV_1309
    );
  Maccum_n2x_cy_3_11 : X_LUT4
    generic map(
      INIT => X"8880",
      LOC => "SLICE_X48Y43"
    )
    port map (
      ADR0 => n2x(3),
      ADR1 => n2x(2),
      ADR2 => n2x(0),
      ADR3 => n2x(1),
      O => Maccum_n2x_cy_3_pack_2
    );
  n2x_7_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => Result_7_1,
      O => n2x_7_DXMUX_1356
    );
  n2x_7_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_n2x_cy_5_11_SW0_O_pack_2,
      O => Maccum_n2x_cy_5_11_SW0_O
    );
  n2x_7_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk2x_b,
      O => n2x_7_CLKINV_1339
    );
  Maccum_n2x_cy_5_11_SW0 : X_LUT4
    generic map(
      INIT => X"3F3F",
      LOC => "SLICE_X48Y42"
    )
    port map (
      ADR0 => VCC,
      ADR1 => n2x(6),
      ADR2 => n2x(4),
      ADR3 => VCC,
      O => Maccum_n2x_cy_5_11_SW0_O_pack_2
    );
  n2x_1_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X50Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => Result_1_1,
      O => n2x_1_DYMUX_1374
    );
  n2x_1_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X50Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk2x_b,
      O => n2x_1_CLKINV_1364
    );
  Maccum_n2x_xor_1_11 : X_LUT4
    generic map(
      INIT => X"F00F",
      LOC => "SLICE_X50Y42"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => n2x(0),
      ADR3 => n2x(1),
      O => Result_1_1
    );
  n2x_3_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X49Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => Result_3_1,
      O => n2x_3_DXMUX_1408
    );
  n2x_3_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X49Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => Result_2_1,
      O => n2x_3_DYMUX_1397
    );
  n2x_3_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X49Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk2x_b,
      O => n2x_3_CLKINV_1388
    );
  Maccum_n2x_xor_2_11 : X_LUT4
    generic map(
      INIT => X"11EE",
      LOC => "SLICE_X49Y43"
    )
    port map (
      ADR0 => n2x(1),
      ADR1 => n2x(0),
      ADR2 => VCC,
      ADR3 => n2x(2),
      O => Result_2_1
    );
  n2x_6_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X49Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => Result_6_1,
      O => n2x_6_DXMUX_1442
    );
  n2x_6_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X49Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => Result_5_1,
      O => n2x_6_DYMUX_1431
    );
  n2x_6_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X49Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk2x_b,
      O => n2x_6_CLKINV_1422
    );
  Maccum_n2x_xor_5_11 : X_LUT4
    generic map(
      INIT => X"7788",
      LOC => "SLICE_X49Y42"
    )
    port map (
      ADR0 => n2x(4),
      ADR1 => Maccum_n2x_cy(3),
      ADR2 => VCC,
      ADR3 => n2x(5),
      O => Result_5_1
    );
  en_r_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X12Y57",
      PATHPULSE => 638 ps
    )
    port map (
      I => en_INBUF,
      O => en_r_DYMUX_1451
    );
  en_r_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X12Y57",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk0_b,
      O => en_r_CLKINV_1449
    );
  n2x_0_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => n2x_0_BYINV_1461,
      O => n2x_0_DYMUX_1462
    );
  n2x_0_BYINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => n2x_0_BYINV_1461
    );
  n2x_0_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => n2x(0),
      O => n2x_0_SRINV_1460
    );
  n2x_0_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk2x_b,
      O => n2x_0_CLKINV_1459
    );
  Mcount_nfx_lut_0_INV_0 : X_LUT4
    generic map(
      INIT => X"00FF",
      LOC => "SLICE_X35Y64"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => nfx(0),
      O => Mcount_nfx_lut(0)
    );
  nfx_0 : X_FF
    generic map(
      LOC => "SLICE_X35Y64",
      INIT => '0'
    )
    port map (
      I => nfx_0_DXMUX_453,
      CE => VCC,
      CLK => nfx_0_CLKINV_418,
      SET => GND,
      RST => GND,
      O => nfx(0)
    );
  nfx_3 : X_FF
    generic map(
      LOC => "SLICE_X35Y65",
      INIT => '0'
    )
    port map (
      I => nfx_2_DYMUX_485,
      CE => VCC,
      CLK => nfx_2_CLKINV_464,
      SET => GND,
      RST => GND,
      O => nfx(3)
    );
  nfx_2 : X_FF
    generic map(
      LOC => "SLICE_X35Y65",
      INIT => '0'
    )
    port map (
      I => nfx_2_DXMUX_501,
      CE => VCC,
      CLK => nfx_2_CLKINV_464,
      SET => GND,
      RST => GND,
      O => nfx(2)
    );
  nfx_5 : X_FF
    generic map(
      LOC => "SLICE_X35Y66",
      INIT => '0'
    )
    port map (
      I => nfx_4_DYMUX_533,
      CE => VCC,
      CLK => nfx_4_CLKINV_512,
      SET => GND,
      RST => GND,
      O => nfx(5)
    );
  nfx_4 : X_FF
    generic map(
      LOC => "SLICE_X35Y66",
      INIT => '0'
    )
    port map (
      I => nfx_4_DXMUX_549,
      CE => VCC,
      CLK => nfx_4_CLKINV_512,
      SET => GND,
      RST => GND,
      O => nfx(4)
    );
  Maccum_n2x_xor_4_11 : X_LUT4
    generic map(
      INIT => X"0FF0",
      LOC => "SLICE_X48Y43"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => Maccum_n2x_cy(3),
      ADR3 => n2x(4),
      O => Result_4_1
    );
  n2x_4 : X_FF
    generic map(
      LOC => "SLICE_X48Y43",
      INIT => '0'
    )
    port map (
      I => n2x_4_DXMUX_1326,
      CE => VCC,
      CLK => n2x_4_CLKINV_1309,
      SET => GND,
      RST => GND,
      O => n2x(4)
    );
  Maccum_n2x_xor_7_11 : X_LUT4
    generic map(
      INIT => X"CC6C",
      LOC => "SLICE_X48Y42"
    )
    port map (
      ADR0 => n2x(5),
      ADR1 => n2x(7),
      ADR2 => Maccum_n2x_cy(3),
      ADR3 => Maccum_n2x_cy_5_11_SW0_O,
      O => Result_7_1
    );
  n2x_7 : X_FF
    generic map(
      LOC => "SLICE_X48Y42",
      INIT => '0'
    )
    port map (
      I => n2x_7_DXMUX_1356,
      CE => VCC,
      CLK => n2x_7_CLKINV_1339,
      SET => GND,
      RST => GND,
      O => n2x(7)
    );
  n2x_1 : X_FF
    generic map(
      LOC => "SLICE_X50Y42",
      INIT => '0'
    )
    port map (
      I => n2x_1_DYMUX_1374,
      CE => VCC,
      CLK => n2x_1_CLKINV_1364,
      SET => GND,
      RST => GND,
      O => n2x(1)
    );
  n2x_2 : X_FF
    generic map(
      LOC => "SLICE_X49Y43",
      INIT => '0'
    )
    port map (
      I => n2x_3_DYMUX_1397,
      CE => VCC,
      CLK => n2x_3_CLKINV_1388,
      SET => GND,
      RST => GND,
      O => n2x(2)
    );
  Maccum_n2x_xor_3_11 : X_LUT4
    generic map(
      INIT => X"37C8",
      LOC => "SLICE_X49Y43"
    )
    port map (
      ADR0 => n2x(1),
      ADR1 => n2x(2),
      ADR2 => n2x(0),
      ADR3 => n2x(3),
      O => Result_3_1
    );
  n2x_3 : X_FF
    generic map(
      LOC => "SLICE_X49Y43",
      INIT => '0'
    )
    port map (
      I => n2x_3_DXMUX_1408,
      CE => VCC,
      CLK => n2x_3_CLKINV_1388,
      SET => GND,
      RST => GND,
      O => n2x(3)
    );
  n2x_5 : X_FF
    generic map(
      LOC => "SLICE_X49Y42",
      INIT => '0'
    )
    port map (
      I => n2x_6_DYMUX_1431,
      CE => VCC,
      CLK => n2x_6_CLKINV_1422,
      SET => GND,
      RST => GND,
      O => n2x(5)
    );
  Maccum_n2x_xor_6_11 : X_LUT4
    generic map(
      INIT => X"78F0",
      LOC => "SLICE_X49Y42"
    )
    port map (
      ADR0 => n2x(4),
      ADR1 => Maccum_n2x_cy(3),
      ADR2 => n2x(6),
      ADR3 => n2x(5),
      O => Result_6_1
    );
  n2x_6 : X_FF
    generic map(
      LOC => "SLICE_X49Y42",
      INIT => '0'
    )
    port map (
      I => n2x_6_DXMUX_1442,
      CE => VCC,
      CLK => n2x_6_CLKINV_1422,
      SET => GND,
      RST => GND,
      O => n2x(6)
    );
  en_r : X_FF
    generic map(
      LOC => "SLICE_X12Y57",
      INIT => '0'
    )
    port map (
      I => en_r_DYMUX_1451,
      CE => VCC,
      CLK => en_r_CLKINV_1449,
      SET => GND,
      RST => GND,
      O => en_r_367
    );
  n2x_0 : X_SFF
    generic map(
      LOC => "SLICE_X51Y42",
      INIT => '0'
    )
    port map (
      I => n2x_0_DYMUX_1462,
      CE => VCC,
      CLK => n2x_0_CLKINV_1459,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => n2x_0_SRINV_1460,
      O => n2x(0)
    );
  ndv_6 : X_FF
    generic map(
      LOC => "SLICE_X51Y63",
      INIT => '0'
    )
    port map (
      I => ndv_6_DXMUX_972,
      CE => VCC,
      CLK => ndv_6_CLKINV_941,
      SET => GND,
      RST => GND,
      O => ndv(6)
    );
  nfx_6 : X_FF
    generic map(
      LOC => "SLICE_X35Y67",
      INIT => '0'
    )
    port map (
      I => nfx_6_DXMUX_590,
      CE => VCC,
      CLK => nfx_6_CLKINV_559,
      SET => GND,
      RST => GND,
      O => nfx(6)
    );
  n0_1 : X_FF
    generic map(
      LOC => "SLICE_X15Y64",
      INIT => '0'
    )
    port map (
      I => n0_0_DYMUX_619,
      CE => n0_0_CEINV_602,
      CLK => n0_0_CLKINV_603,
      SET => GND,
      RST => GND,
      O => n0(1)
    );
  Mcount_n0_lut_0_INV_0 : X_LUT4
    generic map(
      INIT => X"5555",
      LOC => "SLICE_X15Y64"
    )
    port map (
      ADR0 => n0(0),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcount_n0_lut(0)
    );
  n0_0 : X_FF
    generic map(
      LOC => "SLICE_X15Y64",
      INIT => '0'
    )
    port map (
      I => n0_0_DXMUX_639,
      CE => n0_0_CEINV_602,
      CLK => n0_0_CLKINV_603,
      SET => GND,
      RST => GND,
      O => n0(0)
    );
  n0_3 : X_FF
    generic map(
      LOC => "SLICE_X15Y65",
      INIT => '0'
    )
    port map (
      I => n0_2_DYMUX_674,
      CE => n0_2_CEINV_652,
      CLK => n0_2_CLKINV_653,
      SET => GND,
      RST => GND,
      O => n0(3)
    );
  n0_2 : X_FF
    generic map(
      LOC => "SLICE_X15Y65",
      INIT => '0'
    )
    port map (
      I => n0_2_DXMUX_691,
      CE => n0_2_CEINV_652,
      CLK => n0_2_CLKINV_653,
      SET => GND,
      RST => GND,
      O => n0(2)
    );
  n0_5 : X_FF
    generic map(
      LOC => "SLICE_X15Y66",
      INIT => '0'
    )
    port map (
      I => n0_4_DYMUX_726,
      CE => n0_4_CEINV_704,
      CLK => n0_4_CLKINV_705,
      SET => GND,
      RST => GND,
      O => n0(5)
    );
  n0_4 : X_FF
    generic map(
      LOC => "SLICE_X15Y66",
      INIT => '0'
    )
    port map (
      I => n0_4_DXMUX_743,
      CE => n0_4_CEINV_704,
      CLK => n0_4_CLKINV_705,
      SET => GND,
      RST => GND,
      O => n0(4)
    );
  n0_6 : X_FF
    generic map(
      LOC => "SLICE_X15Y67",
      INIT => '0'
    )
    port map (
      I => n0_6_DXMUX_788,
      CE => n0_6_CEINV_755,
      CLK => n0_6_CLKINV_756,
      SET => GND,
      RST => GND,
      O => n0(6)
    );
  Mcount_ndv_lut_0_INV_0 : X_LUT4
    generic map(
      INIT => X"5555",
      LOC => "SLICE_X51Y60"
    )
    port map (
      ADR0 => ndv(0),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcount_ndv_lut(0)
    );
  ndv_0 : X_FF
    generic map(
      LOC => "SLICE_X51Y60",
      INIT => '0'
    )
    port map (
      I => ndv_0_DXMUX_835,
      CE => VCC,
      CLK => ndv_0_CLKINV_800,
      SET => GND,
      RST => GND,
      O => ndv(0)
    );
  ndv_3 : X_FF
    generic map(
      LOC => "SLICE_X51Y61",
      INIT => '0'
    )
    port map (
      I => ndv_2_DYMUX_867,
      CE => VCC,
      CLK => ndv_2_CLKINV_846,
      SET => GND,
      RST => GND,
      O => ndv(3)
    );
  ndv_2 : X_FF
    generic map(
      LOC => "SLICE_X51Y61",
      INIT => '0'
    )
    port map (
      I => ndv_2_DXMUX_883,
      CE => VCC,
      CLK => ndv_2_CLKINV_846,
      SET => GND,
      RST => GND,
      O => ndv(2)
    );
  ndv_5 : X_FF
    generic map(
      LOC => "SLICE_X51Y62",
      INIT => '0'
    )
    port map (
      I => ndv_4_DYMUX_915,
      CE => VCC,
      CLK => ndv_4_CLKINV_894,
      SET => GND,
      RST => GND,
      O => ndv(5)
    );
  ndv_4 : X_FF
    generic map(
      LOC => "SLICE_X51Y62",
      INIT => '0'
    )
    port map (
      I => ndv_4_DXMUX_931,
      CE => VCC,
      CLK => ndv_4_CLKINV_894,
      SET => GND,
      RST => GND,
      O => ndv(4)
    );
  nfx_0_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X35Y64"
    )
    port map (
      ADR0 => nfx(1),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => nfx_0_G
    );
  nfx_2_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X35Y65"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => nfx(2),
      ADR3 => VCC,
      O => nfx_2_F
    );
  nfx_2_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X35Y65"
    )
    port map (
      ADR0 => VCC,
      ADR1 => nfx(3),
      ADR2 => VCC,
      ADR3 => VCC,
      O => nfx_2_G
    );
  nfx_4_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X35Y66"
    )
    port map (
      ADR0 => nfx(4),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => nfx_4_F
    );
  nfx_4_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X35Y66"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => nfx(5),
      O => nfx_4_G
    );
  nfx_6_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X35Y67"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => nfx(6),
      ADR3 => VCC,
      O => nfx_6_F
    );
  n0_0_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X15Y64"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => n0(1),
      O => n0_0_G
    );
  n0_2_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X15Y65"
    )
    port map (
      ADR0 => VCC,
      ADR1 => n0(2),
      ADR2 => VCC,
      ADR3 => VCC,
      O => n0_2_F
    );
  n0_2_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X15Y65"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => n0(3),
      ADR3 => VCC,
      O => n0_2_G
    );
  n0_4_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X15Y66"
    )
    port map (
      ADR0 => n0(4),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => n0_4_F
    );
  n0_4_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X15Y66"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => n0(5),
      O => n0_4_G
    );
  n0_6_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X15Y67"
    )
    port map (
      ADR0 => VCC,
      ADR1 => n0(6),
      ADR2 => VCC,
      ADR3 => VCC,
      O => n0_6_F
    );
  ndv_0_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X51Y60"
    )
    port map (
      ADR0 => VCC,
      ADR1 => ndv(1),
      ADR2 => VCC,
      ADR3 => VCC,
      O => ndv_0_G
    );
  ndv_2_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X51Y61"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => ndv(2),
      ADR3 => VCC,
      O => ndv_2_F
    );
  ndv_2_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X51Y61"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => ndv(3),
      O => ndv_2_G
    );
  ndv_4_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X51Y62"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => ndv(4),
      ADR3 => VCC,
      O => ndv_4_F
    );
  ndv_4_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X51Y62"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => ndv(5),
      O => ndv_4_G
    );
  ndv_6_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X51Y63"
    )
    port map (
      ADR0 => VCC,
      ADR1 => ndv(6),
      ADR2 => VCC,
      ADR3 => VCC,
      O => ndv_6_F
    );
  cfx_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD26",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx(2),
      O => cfx_2_O
    );
  cfx_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD27",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx(3),
      O => cfx_3_O
    );
  cfx_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD33",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx(4),
      O => cfx_4_O
    );
  cfx_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD34",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx(5),
      O => cfx_5_O
    );
  cfx_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD35",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx(6),
      O => cfx_6_O
    );
  cfx_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD36",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx(7),
      O => cfx_7_O
    );
  c0_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD4",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0(0),
      O => c0_0_O
    );
  c0_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD5",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0(1),
      O => c0_1_O
    );
  c0_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD11",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0(2),
      O => c0_2_O
    );
  c0_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD12",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0(3),
      O => c0_3_O
    );
  cdv_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD42",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv(0),
      O => cdv_0_O
    );
  c0_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD14",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0(4),
      O => c0_4_O
    );
  cdv_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD43",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv(1),
      O => cdv_1_O
    );
  c0_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD15",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0(5),
      O => c0_5_O
    );
  cdv_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD46",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv(2),
      O => cdv_2_O
    );
  c0_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD19",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0(6),
      O => c0_6_O
    );
  cdv_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD47",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv(3),
      O => cdv_3_O
    );
  c0_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD20",
      PATHPULSE => 638 ps
    )
    port map (
      I => n0(7),
      O => c0_7_O
    );
  cdv_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD48",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv(4),
      O => cdv_4_O
    );
  cdv_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD49",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv(5),
      O => cdv_5_O
    );
  cdv_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD57",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv(6),
      O => cdv_6_O
    );
  cdv_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD59",
      PATHPULSE => 638 ps
    )
    port map (
      I => ndv(7),
      O => cdv_7_O
    );
  c2x_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD60",
      PATHPULSE => 638 ps
    )
    port map (
      I => n2x(0),
      O => c2x_0_O
    );
  c2x_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD62",
      PATHPULSE => 638 ps
    )
    port map (
      I => n2x(1),
      O => c2x_1_O
    );
  c2x_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD63",
      PATHPULSE => 638 ps
    )
    port map (
      I => n2x(2),
      O => c2x_2_O
    );
  c2x_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD64",
      PATHPULSE => 638 ps
    )
    port map (
      I => n2x(3),
      O => c2x_3_O
    );
  c2x_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD65",
      PATHPULSE => 638 ps
    )
    port map (
      I => n2x(4),
      O => c2x_4_O
    );
  c2x_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD67",
      PATHPULSE => 638 ps
    )
    port map (
      I => n2x(5),
      O => c2x_5_O
    );
  c2x_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD68",
      PATHPULSE => 638 ps
    )
    port map (
      I => n2x(6),
      O => c2x_6_O
    );
  locked_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD2",
      PATHPULSE => 638 ps
    )
    port map (
      I => locked_OBUF_401,
      O => locked_O
    );
  c2x_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD69",
      PATHPULSE => 638 ps
    )
    port map (
      I => n2x(7),
      O => c2x_7_O
    );
  cfx_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD23",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx(0),
      O => cfx_0_O
    );
  cfx_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD24",
      PATHPULSE => 638 ps
    )
    port map (
      I => nfx(1),
      O => cfx_1_O
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

