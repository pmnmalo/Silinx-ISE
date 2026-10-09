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
    spo : out STD_LOGIC_VECTOR ( 3 downto 0 );
    dpo : out STD_LOGIC_VECTOR ( 3 downto 0 );
    o16 : out STD_LOGIC_VECTOR ( 7 downto 0 );
    o64 : out STD_LOGIC_VECTOR ( 1 downto 0 );
    di : in STD_LOGIC_VECTOR ( 7 downto 0 );
    a : in STD_LOGIC_VECTOR ( 5 downto 0 );
    we : in STD_LOGIC_VECTOR ( 2 downto 0 );
    dpra : in STD_LOGIC_VECTOR ( 4 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal a_4_IBUF_434 : STD_LOGIC;
  signal di_0_IBUF_435 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal write_ctrl2_0 : STD_LOGIC;
  signal a_0_IBUF_438 : STD_LOGIC;
  signal a_1_IBUF_439 : STD_LOGIC;
  signal a_2_IBUF_440 : STD_LOGIC;
  signal a_3_IBUF_441 : STD_LOGIC;
  signal N22 : STD_LOGIC;
  signal write_ctrl3_0 : STD_LOGIC;
  signal N24 : STD_LOGIC;
  signal di_1_IBUF_445 : STD_LOGIC;
  signal N26 : STD_LOGIC;
  signal N28 : STD_LOGIC;
  signal di_4_IBUF_455 : STD_LOGIC;
  signal di_5_IBUF_458 : STD_LOGIC;
  signal di_6_IBUF_461 : STD_LOGIC;
  signal di_7_IBUF_463 : STD_LOGIC;
  signal dpra_0_IBUF_467 : STD_LOGIC;
  signal dpra_1_IBUF_468 : STD_LOGIC;
  signal dpra_2_IBUF_469 : STD_LOGIC;
  signal dpra_3_IBUF_470 : STD_LOGIC;
  signal dpra_4_IBUF_471 : STD_LOGIC;
  signal a_5_IBUF_472 : STD_LOGIC;
  signal we_0_IBUF_474 : STD_LOGIC;
  signal we_1_IBUF_476 : STD_LOGIC;
  signal we_2_IBUF_477 : STD_LOGIC;
  signal N12_0 : STD_LOGIC;
  signal N14_0 : STD_LOGIC;
  signal write_ctrl_0 : STD_LOGIC;
  signal N16_0 : STD_LOGIC;
  signal N18_0 : STD_LOGIC;
  signal write_ctrl1_0 : STD_LOGIC;
  signal N9_0 : STD_LOGIC;
  signal N11_0 : STD_LOGIC;
  signal N5_0 : STD_LOGIC;
  signal N7_0 : STD_LOGIC;
  signal N17_0 : STD_LOGIC;
  signal N19_0 : STD_LOGIC;
  signal N13_0 : STD_LOGIC;
  signal N15_0 : STD_LOGIC;
  signal N4_0 : STD_LOGIC;
  signal N6_0 : STD_LOGIC;
  signal N8_0 : STD_LOGIC;
  signal N10_0 : STD_LOGIC;
  signal N22_F5MUX_553 : STD_LOGIC;
  signal Mram_r641_F_551 : STD_LOGIC;
  signal N22_DIF_MUX_539 : STD_LOGIC;
  signal Mram_r641_G_537 : STD_LOGIC;
  signal N22_DIG_MUX_525 : STD_LOGIC;
  signal N22_CLKINV_523 : STD_LOGIC;
  signal N22_WSF : STD_LOGIC;
  signal N22_WSG : STD_LOGIC;
  signal N22_SRINV_517 : STD_LOGIC;
  signal N22_SLICEWE0USED_515 : STD_LOGIC;
  signal N22_BXINV_514 : STD_LOGIC;
  signal N24_F5MUX_607 : STD_LOGIC;
  signal Mram_r642_F_605 : STD_LOGIC;
  signal N24_DIF_MUX_593 : STD_LOGIC;
  signal Mram_r642_G_591 : STD_LOGIC;
  signal N24_DIG_MUX_579 : STD_LOGIC;
  signal N24_CLKINV_577 : STD_LOGIC;
  signal N24_WSF : STD_LOGIC;
  signal N24_WSG : STD_LOGIC;
  signal N24_SRINV_571 : STD_LOGIC;
  signal N24_SLICEWE0USED_569 : STD_LOGIC;
  signal N24_BXINV_568 : STD_LOGIC;
  signal N26_F5MUX_661 : STD_LOGIC;
  signal Mram_r643_F_659 : STD_LOGIC;
  signal N26_DIF_MUX_647 : STD_LOGIC;
  signal Mram_r643_G_645 : STD_LOGIC;
  signal N26_DIG_MUX_633 : STD_LOGIC;
  signal N26_CLKINV_631 : STD_LOGIC;
  signal N26_WSF : STD_LOGIC;
  signal N26_WSG : STD_LOGIC;
  signal N26_SRINV_625 : STD_LOGIC;
  signal N26_SLICEWE0USED_623 : STD_LOGIC;
  signal N26_BXINV_622 : STD_LOGIC;
  signal N28_F5MUX_715 : STD_LOGIC;
  signal Mram_r644_F_713 : STD_LOGIC;
  signal N28_DIF_MUX_701 : STD_LOGIC;
  signal Mram_r644_G_699 : STD_LOGIC;
  signal N28_DIG_MUX_687 : STD_LOGIC;
  signal N28_CLKINV_685 : STD_LOGIC;
  signal N28_WSF : STD_LOGIC;
  signal N28_WSG : STD_LOGIC;
  signal N28_SRINV_679 : STD_LOGIC;
  signal N28_SLICEWE0USED_677 : STD_LOGIC;
  signal N28_BXINV_676 : STD_LOGIC;
  signal di_0_INBUF : STD_LOGIC;
  signal di_1_INBUF : STD_LOGIC;
  signal clk_INBUF : STD_LOGIC;
  signal di_2_INBUF : STD_LOGIC;
  signal o16_0_O : STD_LOGIC;
  signal dpo_0_O : STD_LOGIC;
  signal di_3_INBUF : STD_LOGIC;
  signal o16_1_O : STD_LOGIC;
  signal dpo_1_O : STD_LOGIC;
  signal di_4_INBUF : STD_LOGIC;
  signal o16_2_O : STD_LOGIC;
  signal dpo_2_O : STD_LOGIC;
  signal di_5_INBUF : STD_LOGIC;
  signal o16_3_O : STD_LOGIC;
  signal dpo_3_O : STD_LOGIC;
  signal di_6_INBUF : STD_LOGIC;
  signal o16_4_O : STD_LOGIC;
  signal di_7_INBUF : STD_LOGIC;
  signal o16_5_O : STD_LOGIC;
  signal o16_6_O : STD_LOGIC;
  signal o16_7_O : STD_LOGIC;
  signal dpra_0_INBUF : STD_LOGIC;
  signal dpra_1_INBUF : STD_LOGIC;
  signal dpra_2_INBUF : STD_LOGIC;
  signal dpra_3_INBUF : STD_LOGIC;
  signal dpra_4_INBUF : STD_LOGIC;
  signal a_0_INBUF : STD_LOGIC;
  signal a_1_INBUF : STD_LOGIC;
  signal a_2_INBUF : STD_LOGIC;
  signal a_3_INBUF : STD_LOGIC;
  signal a_4_INBUF : STD_LOGIC;
  signal a_5_INBUF : STD_LOGIC;
  signal o64_0_O : STD_LOGIC;
  signal we_0_INBUF : STD_LOGIC;
  signal o64_1_O : STD_LOGIC;
  signal we_1_INBUF : STD_LOGIC;
  signal we_2_INBUF : STD_LOGIC;
  signal spo_0_O : STD_LOGIC;
  signal spo_1_O : STD_LOGIC;
  signal spo_2_O : STD_LOGIC;
  signal spo_3_O : STD_LOGIC;
  signal clk_BUFGP_BUFG_S_INVNOT : STD_LOGIC;
  signal clk_BUFGP_BUFG_I0_INV : STD_LOGIC;
  signal q64_1_DXMUX_1034 : STD_LOGIC;
  signal q64_1_DYMUX_1022 : STD_LOGIC;
  signal q64_1_CLKINV_1013 : STD_LOGIC;
  signal write_ctrl_1059 : STD_LOGIC;
  signal spo_2_OBUF_1050 : STD_LOGIC;
  signal write_ctrl1_1083 : STD_LOGIC;
  signal spo_3_OBUF_1074 : STD_LOGIC;
  signal dpo_1_OBUF_1107 : STD_LOGIC;
  signal dpo_0_OBUF_1099 : STD_LOGIC;
  signal dpo_3_OBUF_1131 : STD_LOGIC;
  signal dpo_2_OBUF_1123 : STD_LOGIC;
  signal o16_7_OBUF_1184 : STD_LOGIC;
  signal o16_7_OBUF_DIF_MUX_1172 : STD_LOGIC;
  signal o16_0_OBUF_1168 : STD_LOGIC;
  signal o16_7_OBUF_DIG_MUX_1156 : STD_LOGIC;
  signal o16_7_OBUF_CLKINV_1154 : STD_LOGIC;
  signal o16_7_OBUF_SRINV_1148 : STD_LOGIC;
  signal N5 : STD_LOGIC;
  signal N5_DIF_MUX_1223 : STD_LOGIC;
  signal N4 : STD_LOGIC;
  signal N5_DIG_MUX_1208 : STD_LOGIC;
  signal N5_CLKINV_1206 : STD_LOGIC;
  signal N5_SRINV_1200 : STD_LOGIC;
  signal o16_6_OBUF_1288 : STD_LOGIC;
  signal o16_6_OBUF_DIF_MUX_1276 : STD_LOGIC;
  signal o16_1_OBUF_1272 : STD_LOGIC;
  signal o16_6_OBUF_DIG_MUX_1260 : STD_LOGIC;
  signal o16_6_OBUF_CLKINV_1258 : STD_LOGIC;
  signal o16_6_OBUF_SRINV_1252 : STD_LOGIC;
  signal N7 : STD_LOGIC;
  signal N7_DIF_MUX_1327 : STD_LOGIC;
  signal N6 : STD_LOGIC;
  signal N7_DIG_MUX_1312 : STD_LOGIC;
  signal N7_CLKINV_1310 : STD_LOGIC;
  signal N7_SRINV_1304 : STD_LOGIC;
  signal o16_5_OBUF_1392 : STD_LOGIC;
  signal o16_5_OBUF_DIF_MUX_1380 : STD_LOGIC;
  signal o16_2_OBUF_1376 : STD_LOGIC;
  signal o16_5_OBUF_DIG_MUX_1364 : STD_LOGIC;
  signal o16_5_OBUF_CLKINV_1362 : STD_LOGIC;
  signal o16_5_OBUF_SRINV_1356 : STD_LOGIC;
  signal N9 : STD_LOGIC;
  signal N9_DIF_MUX_1431 : STD_LOGIC;
  signal N8 : STD_LOGIC;
  signal N9_DIG_MUX_1416 : STD_LOGIC;
  signal N9_CLKINV_1414 : STD_LOGIC;
  signal N9_SRINV_1408 : STD_LOGIC;
  signal o16_4_OBUF_1496 : STD_LOGIC;
  signal o16_4_OBUF_DIF_MUX_1484 : STD_LOGIC;
  signal o16_3_OBUF_1480 : STD_LOGIC;
  signal o16_4_OBUF_DIG_MUX_1468 : STD_LOGIC;
  signal o16_4_OBUF_CLKINV_1466 : STD_LOGIC;
  signal o16_4_OBUF_SRINV_1460 : STD_LOGIC;
  signal N11 : STD_LOGIC;
  signal N11_DIF_MUX_1535 : STD_LOGIC;
  signal N10 : STD_LOGIC;
  signal N11_DIG_MUX_1520 : STD_LOGIC;
  signal N11_CLKINV_1518 : STD_LOGIC;
  signal N11_SRINV_1512 : STD_LOGIC;
  signal N13 : STD_LOGIC;
  signal N13_DIF_MUX_1586 : STD_LOGIC;
  signal N12 : STD_LOGIC;
  signal N13_DIG_MUX_1571 : STD_LOGIC;
  signal N13_CLKINV_1569 : STD_LOGIC;
  signal N13_SRINV_1563 : STD_LOGIC;
  signal N15 : STD_LOGIC;
  signal N15_DIF_MUX_1637 : STD_LOGIC;
  signal N14 : STD_LOGIC;
  signal N15_DIG_MUX_1622 : STD_LOGIC;
  signal N15_CLKINV_1620 : STD_LOGIC;
  signal N15_SRINV_1614 : STD_LOGIC;
  signal N17 : STD_LOGIC;
  signal N17_DIF_MUX_1688 : STD_LOGIC;
  signal N16 : STD_LOGIC;
  signal N17_DIG_MUX_1673 : STD_LOGIC;
  signal N17_CLKINV_1671 : STD_LOGIC;
  signal N17_SRINV_1665 : STD_LOGIC;
  signal N19 : STD_LOGIC;
  signal N19_DIF_MUX_1739 : STD_LOGIC;
  signal N18 : STD_LOGIC;
  signal N19_DIG_MUX_1724 : STD_LOGIC;
  signal N19_CLKINV_1722 : STD_LOGIC;
  signal N19_SRINV_1716 : STD_LOGIC;
  signal write_ctrl3_1775 : STD_LOGIC;
  signal write_ctrl2_1766 : STD_LOGIC;
  signal spo_1_OBUF_1799 : STD_LOGIC;
  signal spo_0_OBUF_1791 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_G_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_G_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_G_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_G_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_G_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_G_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_G_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_G_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_F_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_F_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_F_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_F_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_F_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_F_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_F_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r641_F_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_G_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_G_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_G_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_G_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_G_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_G_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_G_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_G_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_F_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_F_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_F_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_F_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_F_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_F_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_F_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r642_F_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_G_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_G_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_G_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_G_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_G_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_G_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_G_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_G_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_F_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_F_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_F_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_F_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_F_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_F_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_F_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r643_F_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_G_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_G_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_G_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_G_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_G_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_G_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_G_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_G_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_F_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_F_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_F_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_F_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_F_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_F_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_F_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r644_F_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r161_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r161_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r161_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r161_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r161_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r161_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r161_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r161_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r168_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r168_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r168_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r168_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r168_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r168_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r168_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r168_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_G_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_G_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_G_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_G_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_G_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_G_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_G_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_G_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_F_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_F_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_F_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_F_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_F_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_F_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_F_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r321_SLICEM_F_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r162_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r162_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r162_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r162_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r162_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r162_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r162_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r162_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r167_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r167_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r167_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r167_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r167_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r167_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r167_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r167_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_G_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_G_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_G_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_G_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_G_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_G_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_G_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_G_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_F_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_F_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_F_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_F_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_F_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_F_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_F_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r322_SLICEM_F_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r163_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r163_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r163_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r163_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r163_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r163_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r163_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r163_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r166_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r166_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r166_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r166_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r166_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r166_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r166_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r166_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_G_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_G_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_G_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_G_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_G_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_G_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_G_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_G_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_G_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_G_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_G_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_G_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_G_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_G_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_G_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_G_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_F_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_F_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_F_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_F_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_F_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_F_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_F_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r327_SLICEM_F_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_G_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_G_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_G_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_G_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_G_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_G_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_G_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_G_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_F_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_F_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_F_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_F_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_F_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r328_SLICEM_F_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_F_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_F_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_F_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_F_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_F_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_F_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_F_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r323_SLICEM_F_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r164_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r164_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r164_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r164_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r164_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r164_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r164_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r164_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r165_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r165_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r165_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r165_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r165_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r165_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r165_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r165_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_G_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_G_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_G_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_G_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_G_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_G_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_G_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_G_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_F_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_F_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_F_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_F_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_F_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_F_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_F_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r324_SLICEM_F_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_G_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_G_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_G_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_G_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_G_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_G_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_G_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_G_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_F_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_F_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_F_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_F_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_F_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_F_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_F_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r325_SLICEM_F_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_G_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_G_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_G_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_G_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_G_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_G_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_G_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_G_WADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_F_RADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_F_RADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_F_RADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_F_RADR4 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_F_WADR1 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_F_WADR2 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_F_WADR3 : STD_LOGIC;
  signal NlwBufferSignal_Mram_r326_SLICEM_F_WADR4 : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal NlwInverterSignal_Mram_r641_F_WE_WSGAND_WE0 : STD_LOGIC;
  signal NlwInverterSignal_Mram_r642_F_WE_WSGAND_WE0 : STD_LOGIC;
  signal NlwInverterSignal_Mram_r643_F_WE_WSGAND_WE0 : STD_LOGIC;
  signal NlwInverterSignal_Mram_r644_F_WE_WSGAND_WE0 : STD_LOGIC;
  signal q64 : STD_LOGIC_VECTOR ( 1 downto 0 );
  signal Q_varindex0000 : STD_LOGIC_VECTOR ( 1 downto 0 );
begin
  N22_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => N22_F5MUX_553,
      O => N22
    );
  N22_F5MUX : X_MUX2
    generic map(
      LOC => "SLICE_X48Y58"
    )
    port map (
      IA => Mram_r641_G_537,
      IB => Mram_r641_F_551,
      SEL => N22_BXINV_514,
      O => N22_F5MUX_553
    );
  N22_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => N22_DIG_MUX_525,
      O => N22_DIF_MUX_539
    );
  N22_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_4_IBUF_434,
      O => N22_BXINV_514
    );
  N22_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_0_IBUF_435,
      O => N22_DIG_MUX_525
    );
  N22_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl2_0,
      O => N22_SRINV_517
    );
  N22_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => N22_CLKINV_523
    );
  N22_SLICEWE0USED : X_BUF
    generic map(
      LOC => "SLICE_X48Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => N22_BXINV_514,
      O => N22_SLICEWE0USED_515
    );
  N24_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y57",
      PATHPULSE => 638 ps
    )
    port map (
      I => N24_F5MUX_607,
      O => N24
    );
  N24_F5MUX : X_MUX2
    generic map(
      LOC => "SLICE_X48Y57"
    )
    port map (
      IA => Mram_r642_G_591,
      IB => Mram_r642_F_605,
      SEL => N24_BXINV_568,
      O => N24_F5MUX_607
    );
  N24_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y57",
      PATHPULSE => 638 ps
    )
    port map (
      I => N24_DIG_MUX_579,
      O => N24_DIF_MUX_593
    );
  N24_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y57",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_4_IBUF_434,
      O => N24_BXINV_568
    );
  N24_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y57",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_0_IBUF_435,
      O => N24_DIG_MUX_579
    );
  N24_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y57",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl3_0,
      O => N24_SRINV_571
    );
  N24_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y57",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => N24_CLKINV_577
    );
  N24_SLICEWE0USED : X_BUF
    generic map(
      LOC => "SLICE_X48Y57",
      PATHPULSE => 638 ps
    )
    port map (
      I => N24_BXINV_568,
      O => N24_SLICEWE0USED_569
    );
  N26_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y59",
      PATHPULSE => 638 ps
    )
    port map (
      I => N26_F5MUX_661,
      O => N26
    );
  N26_F5MUX : X_MUX2
    generic map(
      LOC => "SLICE_X48Y59"
    )
    port map (
      IA => Mram_r643_G_645,
      IB => Mram_r643_F_659,
      SEL => N26_BXINV_622,
      O => N26_F5MUX_661
    );
  N26_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y59",
      PATHPULSE => 638 ps
    )
    port map (
      I => N26_DIG_MUX_633,
      O => N26_DIF_MUX_647
    );
  N26_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y59",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_4_IBUF_434,
      O => N26_BXINV_622
    );
  N26_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y59",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_1_IBUF_445,
      O => N26_DIG_MUX_633
    );
  N26_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y59",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl2_0,
      O => N26_SRINV_625
    );
  N26_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y59",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => N26_CLKINV_631
    );
  N26_SLICEWE0USED : X_BUF
    generic map(
      LOC => "SLICE_X48Y59",
      PATHPULSE => 638 ps
    )
    port map (
      I => N26_BXINV_622,
      O => N26_SLICEWE0USED_623
    );
  N28_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y56",
      PATHPULSE => 638 ps
    )
    port map (
      I => N28_F5MUX_715,
      O => N28
    );
  N28_F5MUX : X_MUX2
    generic map(
      LOC => "SLICE_X48Y56"
    )
    port map (
      IA => Mram_r644_G_699,
      IB => Mram_r644_F_713,
      SEL => N28_BXINV_676,
      O => N28_F5MUX_715
    );
  N28_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y56",
      PATHPULSE => 638 ps
    )
    port map (
      I => N28_DIG_MUX_687,
      O => N28_DIF_MUX_701
    );
  N28_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y56",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_4_IBUF_434,
      O => N28_BXINV_676
    );
  N28_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y56",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_1_IBUF_445,
      O => N28_DIG_MUX_687
    );
  N28_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y56",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl3_0,
      O => N28_SRINV_679
    );
  N28_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y56",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => N28_CLKINV_685
    );
  N28_SLICEWE0USED : X_BUF
    generic map(
      LOC => "SLICE_X48Y56",
      PATHPULSE => 638 ps
    )
    port map (
      I => N28_BXINV_676,
      O => N28_SLICEWE0USED_677
    );
  di_0_IBUF : X_BUF
    generic map(
      LOC => "PAD64",
      PATHPULSE => 638 ps
    )
    port map (
      I => di(0),
      O => di_0_INBUF
    );
  di_0_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD64",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_0_INBUF,
      O => di_0_IBUF_435
    );
  di_1_IBUF : X_BUF
    generic map(
      LOC => "PAD65",
      PATHPULSE => 638 ps
    )
    port map (
      I => di(1),
      O => di_1_INBUF
    );
  di_1_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD65",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_1_INBUF,
      O => di_1_IBUF_445
    );
  clk_BUFGP_IBUFG : X_BUF
    generic map(
      LOC => "IPAD22",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk,
      O => clk_INBUF
    );
  di_2_IBUF : X_BUF
    generic map(
      LOC => "PAD67",
      PATHPULSE => 638 ps
    )
    port map (
      I => di(2),
      O => di_2_INBUF
    );
  o16_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD2"
    )
    port map (
      I => o16_0_O,
      O => o16(0)
    );
  dpo_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD27"
    )
    port map (
      I => dpo_0_O,
      O => dpo(0)
    );
  di_3_IBUF : X_BUF
    generic map(
      LOC => "PAD68",
      PATHPULSE => 638 ps
    )
    port map (
      I => di(3),
      O => di_3_INBUF
    );
  o16_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD4"
    )
    port map (
      I => o16_1_O,
      O => o16(1)
    );
  dpo_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD33"
    )
    port map (
      I => dpo_1_O,
      O => dpo(1)
    );
  di_4_IBUF : X_BUF
    generic map(
      LOC => "PAD69",
      PATHPULSE => 638 ps
    )
    port map (
      I => di(4),
      O => di_4_INBUF
    );
  di_4_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD69",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_4_INBUF,
      O => di_4_IBUF_455
    );
  o16_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD5"
    )
    port map (
      I => o16_2_O,
      O => o16(2)
    );
  dpo_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD34"
    )
    port map (
      I => dpo_2_O,
      O => dpo(2)
    );
  di_5_IBUF : X_BUF
    generic map(
      LOC => "PAD70",
      PATHPULSE => 638 ps
    )
    port map (
      I => di(5),
      O => di_5_INBUF
    );
  di_5_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD70",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_5_INBUF,
      O => di_5_IBUF_458
    );
  o16_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD11"
    )
    port map (
      I => o16_3_O,
      O => o16(3)
    );
  dpo_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD35"
    )
    port map (
      I => dpo_3_O,
      O => dpo(3)
    );
  di_6_IBUF : X_BUF
    generic map(
      LOC => "PAD72",
      PATHPULSE => 638 ps
    )
    port map (
      I => di(6),
      O => di_6_INBUF
    );
  di_6_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD72",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_6_INBUF,
      O => di_6_IBUF_461
    );
  o16_4_OBUF : X_OBUF
    generic map(
      LOC => "PAD12"
    )
    port map (
      I => o16_4_O,
      O => o16(4)
    );
  di_7_IBUF : X_BUF
    generic map(
      LOC => "PAD74",
      PATHPULSE => 638 ps
    )
    port map (
      I => di(7),
      O => di_7_INBUF
    );
  di_7_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD74",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_7_INBUF,
      O => di_7_IBUF_463
    );
  o16_5_OBUF : X_OBUF
    generic map(
      LOC => "PAD14"
    )
    port map (
      I => o16_5_O,
      O => o16(5)
    );
  o16_6_OBUF : X_OBUF
    generic map(
      LOC => "PAD15"
    )
    port map (
      I => o16_6_O,
      O => o16(6)
    );
  o16_7_OBUF : X_OBUF
    generic map(
      LOC => "PAD19"
    )
    port map (
      I => o16_7_O,
      O => o16(7)
    );
  dpra_0_IBUF : X_BUF
    generic map(
      LOC => "PAD57",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra(0),
      O => dpra_0_INBUF
    );
  dpra_0_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD57",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_0_INBUF,
      O => dpra_0_IBUF_467
    );
  dpra_1_IBUF : X_BUF
    generic map(
      LOC => "PAD59",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra(1),
      O => dpra_1_INBUF
    );
  dpra_1_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD59",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_1_INBUF,
      O => dpra_1_IBUF_468
    );
  dpra_2_IBUF : X_BUF
    generic map(
      LOC => "PAD60",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra(2),
      O => dpra_2_INBUF
    );
  dpra_2_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD60",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_2_INBUF,
      O => dpra_2_IBUF_469
    );
  dpra_3_IBUF : X_BUF
    generic map(
      LOC => "PAD62",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra(3),
      O => dpra_3_INBUF
    );
  dpra_3_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD62",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_3_INBUF,
      O => dpra_3_IBUF_470
    );
  dpra_4_IBUF : X_BUF
    generic map(
      LOC => "PAD63",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra(4),
      O => dpra_4_INBUF
    );
  dpra_4_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD63",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_4_INBUF,
      O => dpra_4_IBUF_471
    );
  a_0_IBUF : X_BUF
    generic map(
      LOC => "IPAD61",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(0),
      O => a_0_INBUF
    );
  a_0_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD61",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_INBUF,
      O => a_0_IBUF_438
    );
  a_1_IBUF : X_BUF
    generic map(
      LOC => "PAD43",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(1),
      O => a_1_INBUF
    );
  a_1_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD43",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_INBUF,
      O => a_1_IBUF_439
    );
  a_2_IBUF : X_BUF
    generic map(
      LOC => "PAD46",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(2),
      O => a_2_INBUF
    );
  a_2_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD46",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_INBUF,
      O => a_2_IBUF_440
    );
  a_3_IBUF : X_BUF
    generic map(
      LOC => "PAD47",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(3),
      O => a_3_INBUF
    );
  a_3_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD47",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_INBUF,
      O => a_3_IBUF_441
    );
  a_4_IBUF : X_BUF
    generic map(
      LOC => "PAD48",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(4),
      O => a_4_INBUF
    );
  a_4_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD48",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_4_INBUF,
      O => a_4_IBUF_434
    );
  a_5_IBUF : X_BUF
    generic map(
      LOC => "PAD49",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(5),
      O => a_5_INBUF
    );
  a_5_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD49",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_5_INBUF,
      O => a_5_IBUF_472
    );
  o64_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD36"
    )
    port map (
      I => o64_0_O,
      O => o64(0)
    );
  we_0_IBUF : X_BUF
    generic map(
      LOC => "IPAD157",
      PATHPULSE => 638 ps
    )
    port map (
      I => we(0),
      O => we_0_INBUF
    );
  we_0_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD157",
      PATHPULSE => 638 ps
    )
    port map (
      I => we_0_INBUF,
      O => we_0_IBUF_474
    );
  o64_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD42"
    )
    port map (
      I => o64_1_O,
      O => o64(1)
    );
  we_1_IBUF : X_BUF
    generic map(
      LOC => "IPAD114",
      PATHPULSE => 638 ps
    )
    port map (
      I => we(1),
      O => we_1_INBUF
    );
  we_1_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD114",
      PATHPULSE => 638 ps
    )
    port map (
      I => we_1_INBUF,
      O => we_1_IBUF_476
    );
  we_2_IBUF : X_BUF
    generic map(
      LOC => "IPAD21",
      PATHPULSE => 638 ps
    )
    port map (
      I => we(2),
      O => we_2_INBUF
    );
  we_2_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD21",
      PATHPULSE => 638 ps
    )
    port map (
      I => we_2_INBUF,
      O => we_2_IBUF_477
    );
  spo_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD20"
    )
    port map (
      I => spo_0_O,
      O => spo(0)
    );
  spo_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD23"
    )
    port map (
      I => spo_1_O,
      O => spo(1)
    );
  spo_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD24"
    )
    port map (
      I => spo_2_O,
      O => spo(2)
    );
  spo_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD26"
    )
    port map (
      I => spo_3_O,
      O => spo(3)
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
  q64_1_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X49Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => Q_varindex0000(1),
      O => q64_1_DXMUX_1034
    );
  q64_1_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X49Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => Q_varindex0000(0),
      O => q64_1_DYMUX_1022
    );
  q64_1_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X49Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => q64_1_CLKINV_1013
    );
  inst_LPM_MUX811 : X_LUT4
    generic map(
      INIT => X"F3C0",
      LOC => "SLICE_X49Y58"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_5_IBUF_472,
      ADR2 => N24,
      ADR3 => N22,
      O => Q_varindex0000(0)
    );
  write_ctrl_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl_1059,
      O => write_ctrl_0
    );
  inst_LPM_MUX211 : X_LUT4
    generic map(
      INIT => X"F0CC",
      LOC => "SLICE_X39Y42"
    )
    port map (
      ADR0 => VCC,
      ADR1 => N12_0,
      ADR2 => N14_0,
      ADR3 => a_4_IBUF_434,
      O => spo_2_OBUF_1050
    );
  write_ctrl1_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl1_1083,
      O => write_ctrl1_0
    );
  inst_LPM_MUX311 : X_LUT4
    generic map(
      INIT => X"CCF0",
      LOC => "SLICE_X39Y43"
    )
    port map (
      ADR0 => VCC,
      ADR1 => N18_0,
      ADR2 => N16_0,
      ADR3 => a_4_IBUF_434,
      O => spo_3_OBUF_1074
    );
  inst_LPM_MUX411 : X_LUT4
    generic map(
      INIT => X"AFA0",
      LOC => "SLICE_X39Y53"
    )
    port map (
      ADR0 => N7_0,
      ADR1 => VCC,
      ADR2 => dpra_4_IBUF_471,
      ADR3 => N5_0,
      O => dpo_0_OBUF_1099
    );
  inst_LPM_MUX611 : X_LUT4
    generic map(
      INIT => X"E4E4",
      LOC => "SLICE_X48Y44"
    )
    port map (
      ADR0 => dpra_4_IBUF_471,
      ADR1 => N13_0,
      ADR2 => N15_0,
      ADR3 => VCC,
      O => dpo_2_OBUF_1123
    );
  o16_7_OBUF_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X30Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_7_IBUF_463,
      O => o16_7_OBUF_DIF_MUX_1172
    );
  o16_7_OBUF_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X30Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_0_IBUF_435,
      O => o16_7_OBUF_DIG_MUX_1156
    );
  o16_7_OBUF_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X30Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => we_0_IBUF_474,
      O => o16_7_OBUF_SRINV_1148
    );
  o16_7_OBUF_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X30Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => o16_7_OBUF_CLKINV_1154
    );
  N5_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y52",
      PATHPULSE => 638 ps
    )
    port map (
      I => N5,
      O => N5_0
    );
  N5_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y52",
      PATHPULSE => 638 ps
    )
    port map (
      I => N5_DIG_MUX_1208,
      O => N5_DIF_MUX_1223
    );
  N5_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y52",
      PATHPULSE => 638 ps
    )
    port map (
      I => N4,
      O => N4_0
    );
  N5_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y52",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_4_IBUF_455,
      O => N5_DIG_MUX_1208
    );
  N5_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y52",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl_0,
      O => N5_SRINV_1200
    );
  N5_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y52",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => N5_CLKINV_1206
    );
  o16_6_OBUF_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X28Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_6_IBUF_461,
      O => o16_6_OBUF_DIF_MUX_1276
    );
  o16_6_OBUF_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X28Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_1_IBUF_445,
      O => o16_6_OBUF_DIG_MUX_1260
    );
  o16_6_OBUF_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X28Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => we_0_IBUF_474,
      O => o16_6_OBUF_SRINV_1252
    );
  o16_6_OBUF_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X28Y58",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => o16_6_OBUF_CLKINV_1258
    );
  N7_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y50",
      PATHPULSE => 638 ps
    )
    port map (
      I => N7,
      O => N7_0
    );
  N7_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y50",
      PATHPULSE => 638 ps
    )
    port map (
      I => N7_DIG_MUX_1312,
      O => N7_DIF_MUX_1327
    );
  N7_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y50",
      PATHPULSE => 638 ps
    )
    port map (
      I => N6,
      O => N6_0
    );
  N7_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y50",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_4_IBUF_455,
      O => N7_DIG_MUX_1312
    );
  N7_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y50",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl1_0,
      O => N7_SRINV_1304
    );
  N7_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y50",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => N7_CLKINV_1310
    );
  o16_5_OBUF_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X28Y52",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_5_IBUF_458,
      O => o16_5_OBUF_DIF_MUX_1380
    );
  o16_5_OBUF_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X28Y52",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_2_INBUF,
      O => o16_5_OBUF_DIG_MUX_1364
    );
  o16_5_OBUF_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X28Y52",
      PATHPULSE => 638 ps
    )
    port map (
      I => we_0_IBUF_474,
      O => o16_5_OBUF_SRINV_1356
    );
  o16_5_OBUF_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X28Y52",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => o16_5_OBUF_CLKINV_1362
    );
  N9_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => N9,
      O => N9_0
    );
  N9_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => N9_DIG_MUX_1416,
      O => N9_DIF_MUX_1431
    );
  N9_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => N8,
      O => N8_0
    );
  N9_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_5_IBUF_458,
      O => N9_DIG_MUX_1416
    );
  N9_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl_0,
      O => N9_SRINV_1408
    );
  N9_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => N9_CLKINV_1414
    );
  o16_4_OBUF_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X28Y55",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_4_IBUF_455,
      O => o16_4_OBUF_DIF_MUX_1484
    );
  o16_4_OBUF_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X28Y55",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_3_INBUF,
      O => o16_4_OBUF_DIG_MUX_1468
    );
  o16_4_OBUF_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X28Y55",
      PATHPULSE => 638 ps
    )
    port map (
      I => we_0_IBUF_474,
      O => o16_4_OBUF_SRINV_1460
    );
  o16_4_OBUF_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X28Y55",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => o16_4_OBUF_CLKINV_1466
    );
  N11_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y51",
      PATHPULSE => 638 ps
    )
    port map (
      I => N11,
      O => N11_0
    );
  N11_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y51",
      PATHPULSE => 638 ps
    )
    port map (
      I => N11_DIG_MUX_1520,
      O => N11_DIF_MUX_1535
    );
  N11_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y51",
      PATHPULSE => 638 ps
    )
    port map (
      I => N10,
      O => N10_0
    );
  N11_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y51",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_5_IBUF_458,
      O => N11_DIG_MUX_1520
    );
  N11_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y51",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl1_0,
      O => N11_SRINV_1512
    );
  N11_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y51",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => N11_CLKINV_1518
    );
  N13_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X38Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => N13,
      O => N13_0
    );
  N13_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => N13_DIG_MUX_1571,
      O => N13_DIF_MUX_1586
    );
  N13_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X38Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => N12,
      O => N12_0
    );
  N13_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_6_IBUF_461,
      O => N13_DIG_MUX_1571
    );
  N13_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl_0,
      O => N13_SRINV_1563
    );
  N13_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => N13_CLKINV_1569
    );
  N15_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => N15,
      O => N15_0
    );
  N15_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => N15_DIG_MUX_1622,
      O => N15_DIF_MUX_1637
    );
  N15_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => N14,
      O => N14_0
    );
  N15_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_6_IBUF_461,
      O => N15_DIG_MUX_1622
    );
  N15_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl1_0,
      O => N15_SRINV_1614
    );
  N15_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => N15_CLKINV_1620
    );
  N17_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => N17,
      O => N17_0
    );
  N17_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => N17_DIG_MUX_1673,
      O => N17_DIF_MUX_1688
    );
  N17_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => N16,
      O => N16_0
    );
  N17_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_7_IBUF_463,
      O => N17_DIG_MUX_1673
    );
  N17_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl_0,
      O => N17_SRINV_1665
    );
  N17_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y43",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => N17_CLKINV_1671
    );
  N19_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y47",
      PATHPULSE => 638 ps
    )
    port map (
      I => N19,
      O => N19_0
    );
  N19_DIF_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y47",
      PATHPULSE => 638 ps
    )
    port map (
      I => N19_DIG_MUX_1724,
      O => N19_DIF_MUX_1739
    );
  N19_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X48Y47",
      PATHPULSE => 638 ps
    )
    port map (
      I => N18,
      O => N18_0
    );
  N19_DIG_MUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y47",
      PATHPULSE => 638 ps
    )
    port map (
      I => di_7_IBUF_463,
      O => N19_DIG_MUX_1724
    );
  N19_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y47",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl1_0,
      O => N19_SRINV_1716
    );
  N19_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y47",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => N19_CLKINV_1722
    );
  write_ctrl3_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X49Y59",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl3_1775,
      O => write_ctrl3_0
    );
  write_ctrl3_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X49Y59",
      PATHPULSE => 638 ps
    )
    port map (
      I => write_ctrl2_1766,
      O => write_ctrl2_0
    );
  write_ctrl2 : X_LUT4
    generic map(
      INIT => X"3300",
      LOC => "SLICE_X49Y59"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_5_IBUF_472,
      ADR2 => VCC,
      ADR3 => we_2_IBUF_477,
      O => write_ctrl2_1766
    );
  inst_LPM_MUX11 : X_LUT4
    generic map(
      INIT => X"CACA",
      LOC => "SLICE_X38Y52"
    )
    port map (
      ADR0 => N4_0,
      ADR1 => N6_0,
      ADR2 => a_4_IBUF_434,
      ADR3 => VCC,
      O => spo_0_OBUF_1791
    );
  Mram_r641_G : X_RAMD16
    generic map(
      INIT => X"2492",
      LOC => "SLICE_X48Y58"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r641_G_RADR1,
      RADR1 => NlwBufferSignal_Mram_r641_G_RADR2,
      RADR2 => NlwBufferSignal_Mram_r641_G_RADR3,
      RADR3 => NlwBufferSignal_Mram_r641_G_RADR4,
      WADR0 => NlwBufferSignal_Mram_r641_G_WADR1,
      WADR1 => NlwBufferSignal_Mram_r641_G_WADR2,
      WADR2 => NlwBufferSignal_Mram_r641_G_WADR3,
      WADR3 => NlwBufferSignal_Mram_r641_G_WADR4,
      I => N22_DIG_MUX_525,
      CLK => N22_CLKINV_523,
      WE => N22_WSG,
      O => Mram_r641_G_537
    );
  Mram_r641_F : X_RAMD16
    generic map(
      INIT => X"9249",
      LOC => "SLICE_X48Y58"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r641_F_RADR1,
      RADR1 => NlwBufferSignal_Mram_r641_F_RADR2,
      RADR2 => NlwBufferSignal_Mram_r641_F_RADR3,
      RADR3 => NlwBufferSignal_Mram_r641_F_RADR4,
      WADR0 => NlwBufferSignal_Mram_r641_F_WADR1,
      WADR1 => NlwBufferSignal_Mram_r641_F_WADR2,
      WADR2 => NlwBufferSignal_Mram_r641_F_WADR3,
      WADR3 => NlwBufferSignal_Mram_r641_F_WADR4,
      I => N22_DIF_MUX_539,
      CLK => N22_CLKINV_523,
      WE => N22_WSF,
      O => Mram_r641_F_551
    );
  Mram_r642_G : X_RAMD16
    generic map(
      INIT => X"4924",
      LOC => "SLICE_X48Y57"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r642_G_RADR1,
      RADR1 => NlwBufferSignal_Mram_r642_G_RADR2,
      RADR2 => NlwBufferSignal_Mram_r642_G_RADR3,
      RADR3 => NlwBufferSignal_Mram_r642_G_RADR4,
      WADR0 => NlwBufferSignal_Mram_r642_G_WADR1,
      WADR1 => NlwBufferSignal_Mram_r642_G_WADR2,
      WADR2 => NlwBufferSignal_Mram_r642_G_WADR3,
      WADR3 => NlwBufferSignal_Mram_r642_G_WADR4,
      I => N24_DIG_MUX_579,
      CLK => N24_CLKINV_577,
      WE => N24_WSG,
      O => Mram_r642_G_591
    );
  Mram_r642_F : X_RAMD16
    generic map(
      INIT => X"2492",
      LOC => "SLICE_X48Y57"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r642_F_RADR1,
      RADR1 => NlwBufferSignal_Mram_r642_F_RADR2,
      RADR2 => NlwBufferSignal_Mram_r642_F_RADR3,
      RADR3 => NlwBufferSignal_Mram_r642_F_RADR4,
      WADR0 => NlwBufferSignal_Mram_r642_F_WADR1,
      WADR1 => NlwBufferSignal_Mram_r642_F_WADR2,
      WADR2 => NlwBufferSignal_Mram_r642_F_WADR3,
      WADR3 => NlwBufferSignal_Mram_r642_F_WADR4,
      I => N24_DIF_MUX_593,
      CLK => N24_CLKINV_577,
      WE => N24_WSF,
      O => Mram_r642_F_605
    );
  Mram_r643_G : X_RAMD16
    generic map(
      INIT => X"4924",
      LOC => "SLICE_X48Y59"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r643_G_RADR1,
      RADR1 => NlwBufferSignal_Mram_r643_G_RADR2,
      RADR2 => NlwBufferSignal_Mram_r643_G_RADR3,
      RADR3 => NlwBufferSignal_Mram_r643_G_RADR4,
      WADR0 => NlwBufferSignal_Mram_r643_G_WADR1,
      WADR1 => NlwBufferSignal_Mram_r643_G_WADR2,
      WADR2 => NlwBufferSignal_Mram_r643_G_WADR3,
      WADR3 => NlwBufferSignal_Mram_r643_G_WADR4,
      I => N26_DIG_MUX_633,
      CLK => N26_CLKINV_631,
      WE => N26_WSG,
      O => Mram_r643_G_645
    );
  Mram_r643_F : X_RAMD16
    generic map(
      INIT => X"2492",
      LOC => "SLICE_X48Y59"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r643_F_RADR1,
      RADR1 => NlwBufferSignal_Mram_r643_F_RADR2,
      RADR2 => NlwBufferSignal_Mram_r643_F_RADR3,
      RADR3 => NlwBufferSignal_Mram_r643_F_RADR4,
      WADR0 => NlwBufferSignal_Mram_r643_F_WADR1,
      WADR1 => NlwBufferSignal_Mram_r643_F_WADR2,
      WADR2 => NlwBufferSignal_Mram_r643_F_WADR3,
      WADR3 => NlwBufferSignal_Mram_r643_F_WADR4,
      I => N26_DIF_MUX_647,
      CLK => N26_CLKINV_631,
      WE => N26_WSF,
      O => Mram_r643_F_659
    );
  Mram_r644_G : X_RAMD16
    generic map(
      INIT => X"9249",
      LOC => "SLICE_X48Y56"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r644_G_RADR1,
      RADR1 => NlwBufferSignal_Mram_r644_G_RADR2,
      RADR2 => NlwBufferSignal_Mram_r644_G_RADR3,
      RADR3 => NlwBufferSignal_Mram_r644_G_RADR4,
      WADR0 => NlwBufferSignal_Mram_r644_G_WADR1,
      WADR1 => NlwBufferSignal_Mram_r644_G_WADR2,
      WADR2 => NlwBufferSignal_Mram_r644_G_WADR3,
      WADR3 => NlwBufferSignal_Mram_r644_G_WADR4,
      I => N28_DIG_MUX_687,
      CLK => N28_CLKINV_685,
      WE => N28_WSG,
      O => Mram_r644_G_699
    );
  Mram_r644_F : X_RAMD16
    generic map(
      INIT => X"4924",
      LOC => "SLICE_X48Y56"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r644_F_RADR1,
      RADR1 => NlwBufferSignal_Mram_r644_F_RADR2,
      RADR2 => NlwBufferSignal_Mram_r644_F_RADR3,
      RADR3 => NlwBufferSignal_Mram_r644_F_RADR4,
      WADR0 => NlwBufferSignal_Mram_r644_F_WADR1,
      WADR1 => NlwBufferSignal_Mram_r644_F_WADR2,
      WADR2 => NlwBufferSignal_Mram_r644_F_WADR3,
      WADR3 => NlwBufferSignal_Mram_r644_F_WADR4,
      I => N28_DIF_MUX_701,
      CLK => N28_CLKINV_685,
      WE => N28_WSF,
      O => Mram_r644_F_713
    );
  q64_0 : X_FF
    generic map(
      LOC => "SLICE_X49Y58",
      INIT => '0'
    )
    port map (
      I => q64_1_DYMUX_1022,
      CE => VCC,
      CLK => q64_1_CLKINV_1013,
      SET => GND,
      RST => GND,
      O => q64(0)
    );
  inst_LPM_MUX911 : X_LUT4
    generic map(
      INIT => X"FC30",
      LOC => "SLICE_X49Y58"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_5_IBUF_472,
      ADR2 => N26,
      ADR3 => N28,
      O => Q_varindex0000(1)
    );
  q64_1 : X_FF
    generic map(
      LOC => "SLICE_X49Y58",
      INIT => '0'
    )
    port map (
      I => q64_1_DXMUX_1034,
      CE => VCC,
      CLK => q64_1_CLKINV_1013,
      SET => GND,
      RST => GND,
      O => q64(1)
    );
  write_ctrl : X_LUT4
    generic map(
      INIT => X"00F0",
      LOC => "SLICE_X39Y42"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => we_1_IBUF_476,
      ADR3 => a_4_IBUF_434,
      O => write_ctrl_1059
    );
  write_ctrl1 : X_LUT4
    generic map(
      INIT => X"F000",
      LOC => "SLICE_X39Y43"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => we_1_IBUF_476,
      ADR3 => a_4_IBUF_434,
      O => write_ctrl1_1083
    );
  inst_LPM_MUX511 : X_LUT4
    generic map(
      INIT => X"AFA0",
      LOC => "SLICE_X39Y53"
    )
    port map (
      ADR0 => N11_0,
      ADR1 => VCC,
      ADR2 => dpra_4_IBUF_471,
      ADR3 => N9_0,
      O => dpo_1_OBUF_1107
    );
  inst_LPM_MUX711 : X_LUT4
    generic map(
      INIT => X"CCAA",
      LOC => "SLICE_X48Y44"
    )
    port map (
      ADR0 => N17_0,
      ADR1 => N19_0,
      ADR2 => VCC,
      ADR3 => dpra_4_IBUF_471,
      O => dpo_3_OBUF_1131
    );
  Mram_r161 : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X30Y58"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r161_RADR1,
      RADR1 => NlwBufferSignal_Mram_r161_RADR2,
      RADR2 => NlwBufferSignal_Mram_r161_RADR3,
      RADR3 => NlwBufferSignal_Mram_r161_RADR4,
      WADR0 => NlwBufferSignal_Mram_r161_WADR1,
      WADR1 => NlwBufferSignal_Mram_r161_WADR2,
      WADR2 => NlwBufferSignal_Mram_r161_WADR3,
      WADR3 => NlwBufferSignal_Mram_r161_WADR4,
      I => o16_7_OBUF_DIG_MUX_1156,
      CLK => o16_7_OBUF_CLKINV_1154,
      WE => o16_7_OBUF_SRINV_1148,
      O => o16_0_OBUF_1168
    );
  Mram_r168 : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X30Y58"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r168_RADR1,
      RADR1 => NlwBufferSignal_Mram_r168_RADR2,
      RADR2 => NlwBufferSignal_Mram_r168_RADR3,
      RADR3 => NlwBufferSignal_Mram_r168_RADR4,
      WADR0 => NlwBufferSignal_Mram_r168_WADR1,
      WADR1 => NlwBufferSignal_Mram_r168_WADR2,
      WADR2 => NlwBufferSignal_Mram_r168_WADR3,
      WADR3 => NlwBufferSignal_Mram_r168_WADR4,
      I => o16_7_OBUF_DIF_MUX_1172,
      CLK => o16_7_OBUF_CLKINV_1154,
      WE => o16_7_OBUF_SRINV_1148,
      O => o16_7_OBUF_1184
    );
  Mram_r321_SLICEM_G : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y52"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r321_SLICEM_G_RADR1,
      RADR1 => NlwBufferSignal_Mram_r321_SLICEM_G_RADR2,
      RADR2 => NlwBufferSignal_Mram_r321_SLICEM_G_RADR3,
      RADR3 => NlwBufferSignal_Mram_r321_SLICEM_G_RADR4,
      WADR0 => NlwBufferSignal_Mram_r321_SLICEM_G_WADR1,
      WADR1 => NlwBufferSignal_Mram_r321_SLICEM_G_WADR2,
      WADR2 => NlwBufferSignal_Mram_r321_SLICEM_G_WADR3,
      WADR3 => NlwBufferSignal_Mram_r321_SLICEM_G_WADR4,
      I => N5_DIG_MUX_1208,
      CLK => N5_CLKINV_1206,
      WE => N5_SRINV_1200,
      O => N4
    );
  Mram_r321_SLICEM_F : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y52"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r321_SLICEM_F_RADR1,
      RADR1 => NlwBufferSignal_Mram_r321_SLICEM_F_RADR2,
      RADR2 => NlwBufferSignal_Mram_r321_SLICEM_F_RADR3,
      RADR3 => NlwBufferSignal_Mram_r321_SLICEM_F_RADR4,
      WADR0 => NlwBufferSignal_Mram_r321_SLICEM_F_WADR1,
      WADR1 => NlwBufferSignal_Mram_r321_SLICEM_F_WADR2,
      WADR2 => NlwBufferSignal_Mram_r321_SLICEM_F_WADR3,
      WADR3 => NlwBufferSignal_Mram_r321_SLICEM_F_WADR4,
      I => N5_DIF_MUX_1223,
      CLK => N5_CLKINV_1206,
      WE => N5_SRINV_1200,
      O => N5
    );
  Mram_r162 : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X28Y58"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r162_RADR1,
      RADR1 => NlwBufferSignal_Mram_r162_RADR2,
      RADR2 => NlwBufferSignal_Mram_r162_RADR3,
      RADR3 => NlwBufferSignal_Mram_r162_RADR4,
      WADR0 => NlwBufferSignal_Mram_r162_WADR1,
      WADR1 => NlwBufferSignal_Mram_r162_WADR2,
      WADR2 => NlwBufferSignal_Mram_r162_WADR3,
      WADR3 => NlwBufferSignal_Mram_r162_WADR4,
      I => o16_6_OBUF_DIG_MUX_1260,
      CLK => o16_6_OBUF_CLKINV_1258,
      WE => o16_6_OBUF_SRINV_1252,
      O => o16_1_OBUF_1272
    );
  Mram_r167 : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X28Y58"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r167_RADR1,
      RADR1 => NlwBufferSignal_Mram_r167_RADR2,
      RADR2 => NlwBufferSignal_Mram_r167_RADR3,
      RADR3 => NlwBufferSignal_Mram_r167_RADR4,
      WADR0 => NlwBufferSignal_Mram_r167_WADR1,
      WADR1 => NlwBufferSignal_Mram_r167_WADR2,
      WADR2 => NlwBufferSignal_Mram_r167_WADR3,
      WADR3 => NlwBufferSignal_Mram_r167_WADR4,
      I => o16_6_OBUF_DIF_MUX_1276,
      CLK => o16_6_OBUF_CLKINV_1258,
      WE => o16_6_OBUF_SRINV_1252,
      O => o16_6_OBUF_1288
    );
  Mram_r322_SLICEM_G : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y50"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r322_SLICEM_G_RADR1,
      RADR1 => NlwBufferSignal_Mram_r322_SLICEM_G_RADR2,
      RADR2 => NlwBufferSignal_Mram_r322_SLICEM_G_RADR3,
      RADR3 => NlwBufferSignal_Mram_r322_SLICEM_G_RADR4,
      WADR0 => NlwBufferSignal_Mram_r322_SLICEM_G_WADR1,
      WADR1 => NlwBufferSignal_Mram_r322_SLICEM_G_WADR2,
      WADR2 => NlwBufferSignal_Mram_r322_SLICEM_G_WADR3,
      WADR3 => NlwBufferSignal_Mram_r322_SLICEM_G_WADR4,
      I => N7_DIG_MUX_1312,
      CLK => N7_CLKINV_1310,
      WE => N7_SRINV_1304,
      O => N6
    );
  Mram_r322_SLICEM_F : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y50"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r322_SLICEM_F_RADR1,
      RADR1 => NlwBufferSignal_Mram_r322_SLICEM_F_RADR2,
      RADR2 => NlwBufferSignal_Mram_r322_SLICEM_F_RADR3,
      RADR3 => NlwBufferSignal_Mram_r322_SLICEM_F_RADR4,
      WADR0 => NlwBufferSignal_Mram_r322_SLICEM_F_WADR1,
      WADR1 => NlwBufferSignal_Mram_r322_SLICEM_F_WADR2,
      WADR2 => NlwBufferSignal_Mram_r322_SLICEM_F_WADR3,
      WADR3 => NlwBufferSignal_Mram_r322_SLICEM_F_WADR4,
      I => N7_DIF_MUX_1327,
      CLK => N7_CLKINV_1310,
      WE => N7_SRINV_1304,
      O => N7
    );
  Mram_r163 : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X28Y52"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r163_RADR1,
      RADR1 => NlwBufferSignal_Mram_r163_RADR2,
      RADR2 => NlwBufferSignal_Mram_r163_RADR3,
      RADR3 => NlwBufferSignal_Mram_r163_RADR4,
      WADR0 => NlwBufferSignal_Mram_r163_WADR1,
      WADR1 => NlwBufferSignal_Mram_r163_WADR2,
      WADR2 => NlwBufferSignal_Mram_r163_WADR3,
      WADR3 => NlwBufferSignal_Mram_r163_WADR4,
      I => o16_5_OBUF_DIG_MUX_1364,
      CLK => o16_5_OBUF_CLKINV_1362,
      WE => o16_5_OBUF_SRINV_1356,
      O => o16_2_OBUF_1376
    );
  Mram_r166 : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X28Y52"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r166_RADR1,
      RADR1 => NlwBufferSignal_Mram_r166_RADR2,
      RADR2 => NlwBufferSignal_Mram_r166_RADR3,
      RADR3 => NlwBufferSignal_Mram_r166_RADR4,
      WADR0 => NlwBufferSignal_Mram_r166_WADR1,
      WADR1 => NlwBufferSignal_Mram_r166_WADR2,
      WADR2 => NlwBufferSignal_Mram_r166_WADR3,
      WADR3 => NlwBufferSignal_Mram_r166_WADR4,
      I => o16_5_OBUF_DIF_MUX_1380,
      CLK => o16_5_OBUF_CLKINV_1362,
      WE => o16_5_OBUF_SRINV_1356,
      O => o16_5_OBUF_1392
    );
  Mram_r323_SLICEM_G : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y53"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r323_SLICEM_G_RADR1,
      RADR1 => NlwBufferSignal_Mram_r323_SLICEM_G_RADR2,
      RADR2 => NlwBufferSignal_Mram_r323_SLICEM_G_RADR3,
      RADR3 => NlwBufferSignal_Mram_r323_SLICEM_G_RADR4,
      WADR0 => NlwBufferSignal_Mram_r323_SLICEM_G_WADR1,
      WADR1 => NlwBufferSignal_Mram_r323_SLICEM_G_WADR2,
      WADR2 => NlwBufferSignal_Mram_r323_SLICEM_G_WADR3,
      WADR3 => NlwBufferSignal_Mram_r323_SLICEM_G_WADR4,
      I => N9_DIG_MUX_1416,
      CLK => N9_CLKINV_1414,
      WE => N9_SRINV_1408,
      O => N8
    );
  Mram_r327_SLICEM_G : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y43"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r327_SLICEM_G_RADR1,
      RADR1 => NlwBufferSignal_Mram_r327_SLICEM_G_RADR2,
      RADR2 => NlwBufferSignal_Mram_r327_SLICEM_G_RADR3,
      RADR3 => NlwBufferSignal_Mram_r327_SLICEM_G_RADR4,
      WADR0 => NlwBufferSignal_Mram_r327_SLICEM_G_WADR1,
      WADR1 => NlwBufferSignal_Mram_r327_SLICEM_G_WADR2,
      WADR2 => NlwBufferSignal_Mram_r327_SLICEM_G_WADR3,
      WADR3 => NlwBufferSignal_Mram_r327_SLICEM_G_WADR4,
      I => N17_DIG_MUX_1673,
      CLK => N17_CLKINV_1671,
      WE => N17_SRINV_1665,
      O => N16
    );
  Mram_r327_SLICEM_F : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y43"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r327_SLICEM_F_RADR1,
      RADR1 => NlwBufferSignal_Mram_r327_SLICEM_F_RADR2,
      RADR2 => NlwBufferSignal_Mram_r327_SLICEM_F_RADR3,
      RADR3 => NlwBufferSignal_Mram_r327_SLICEM_F_RADR4,
      WADR0 => NlwBufferSignal_Mram_r327_SLICEM_F_WADR1,
      WADR1 => NlwBufferSignal_Mram_r327_SLICEM_F_WADR2,
      WADR2 => NlwBufferSignal_Mram_r327_SLICEM_F_WADR3,
      WADR3 => NlwBufferSignal_Mram_r327_SLICEM_F_WADR4,
      I => N17_DIF_MUX_1688,
      CLK => N17_CLKINV_1671,
      WE => N17_SRINV_1665,
      O => N17
    );
  Mram_r328_SLICEM_G : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y47"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r328_SLICEM_G_RADR1,
      RADR1 => NlwBufferSignal_Mram_r328_SLICEM_G_RADR2,
      RADR2 => NlwBufferSignal_Mram_r328_SLICEM_G_RADR3,
      RADR3 => NlwBufferSignal_Mram_r328_SLICEM_G_RADR4,
      WADR0 => NlwBufferSignal_Mram_r328_SLICEM_G_WADR1,
      WADR1 => NlwBufferSignal_Mram_r328_SLICEM_G_WADR2,
      WADR2 => NlwBufferSignal_Mram_r328_SLICEM_G_WADR3,
      WADR3 => NlwBufferSignal_Mram_r328_SLICEM_G_WADR4,
      I => N19_DIG_MUX_1724,
      CLK => N19_CLKINV_1722,
      WE => N19_SRINV_1716,
      O => N18
    );
  Mram_r328_SLICEM_F : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y47"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r328_SLICEM_F_RADR1,
      RADR1 => dpra_1_IBUF_468,
      RADR2 => dpra_2_IBUF_469,
      RADR3 => NlwBufferSignal_Mram_r328_SLICEM_F_RADR4,
      WADR0 => NlwBufferSignal_Mram_r328_SLICEM_F_WADR1,
      WADR1 => NlwBufferSignal_Mram_r328_SLICEM_F_WADR2,
      WADR2 => NlwBufferSignal_Mram_r328_SLICEM_F_WADR3,
      WADR3 => NlwBufferSignal_Mram_r328_SLICEM_F_WADR4,
      I => N19_DIF_MUX_1739,
      CLK => N19_CLKINV_1722,
      WE => N19_SRINV_1716,
      O => N19
    );
  write_ctrl3 : X_LUT4
    generic map(
      INIT => X"CC00",
      LOC => "SLICE_X49Y59"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_5_IBUF_472,
      ADR2 => VCC,
      ADR3 => we_2_IBUF_477,
      O => write_ctrl3_1775
    );
  inst_LPM_MUX111 : X_LUT4
    generic map(
      INIT => X"D8D8",
      LOC => "SLICE_X38Y52"
    )
    port map (
      ADR0 => a_4_IBUF_434,
      ADR1 => N10_0,
      ADR2 => N8_0,
      ADR3 => VCC,
      O => spo_1_OBUF_1799
    );
  Mram_r323_SLICEM_F : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y53"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r323_SLICEM_F_RADR1,
      RADR1 => NlwBufferSignal_Mram_r323_SLICEM_F_RADR2,
      RADR2 => NlwBufferSignal_Mram_r323_SLICEM_F_RADR3,
      RADR3 => NlwBufferSignal_Mram_r323_SLICEM_F_RADR4,
      WADR0 => NlwBufferSignal_Mram_r323_SLICEM_F_WADR1,
      WADR1 => NlwBufferSignal_Mram_r323_SLICEM_F_WADR2,
      WADR2 => NlwBufferSignal_Mram_r323_SLICEM_F_WADR3,
      WADR3 => NlwBufferSignal_Mram_r323_SLICEM_F_WADR4,
      I => N9_DIF_MUX_1431,
      CLK => N9_CLKINV_1414,
      WE => N9_SRINV_1408,
      O => N9
    );
  Mram_r164 : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X28Y55"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r164_RADR1,
      RADR1 => NlwBufferSignal_Mram_r164_RADR2,
      RADR2 => NlwBufferSignal_Mram_r164_RADR3,
      RADR3 => NlwBufferSignal_Mram_r164_RADR4,
      WADR0 => NlwBufferSignal_Mram_r164_WADR1,
      WADR1 => NlwBufferSignal_Mram_r164_WADR2,
      WADR2 => NlwBufferSignal_Mram_r164_WADR3,
      WADR3 => NlwBufferSignal_Mram_r164_WADR4,
      I => o16_4_OBUF_DIG_MUX_1468,
      CLK => o16_4_OBUF_CLKINV_1466,
      WE => o16_4_OBUF_SRINV_1460,
      O => o16_3_OBUF_1480
    );
  Mram_r165 : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X28Y55"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r165_RADR1,
      RADR1 => NlwBufferSignal_Mram_r165_RADR2,
      RADR2 => NlwBufferSignal_Mram_r165_RADR3,
      RADR3 => NlwBufferSignal_Mram_r165_RADR4,
      WADR0 => NlwBufferSignal_Mram_r165_WADR1,
      WADR1 => NlwBufferSignal_Mram_r165_WADR2,
      WADR2 => NlwBufferSignal_Mram_r165_WADR3,
      WADR3 => NlwBufferSignal_Mram_r165_WADR4,
      I => o16_4_OBUF_DIF_MUX_1484,
      CLK => o16_4_OBUF_CLKINV_1466,
      WE => o16_4_OBUF_SRINV_1460,
      O => o16_4_OBUF_1496
    );
  Mram_r324_SLICEM_G : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y51"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r324_SLICEM_G_RADR1,
      RADR1 => NlwBufferSignal_Mram_r324_SLICEM_G_RADR2,
      RADR2 => NlwBufferSignal_Mram_r324_SLICEM_G_RADR3,
      RADR3 => NlwBufferSignal_Mram_r324_SLICEM_G_RADR4,
      WADR0 => NlwBufferSignal_Mram_r324_SLICEM_G_WADR1,
      WADR1 => NlwBufferSignal_Mram_r324_SLICEM_G_WADR2,
      WADR2 => NlwBufferSignal_Mram_r324_SLICEM_G_WADR3,
      WADR3 => NlwBufferSignal_Mram_r324_SLICEM_G_WADR4,
      I => N11_DIG_MUX_1520,
      CLK => N11_CLKINV_1518,
      WE => N11_SRINV_1512,
      O => N10
    );
  Mram_r324_SLICEM_F : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y51"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r324_SLICEM_F_RADR1,
      RADR1 => NlwBufferSignal_Mram_r324_SLICEM_F_RADR2,
      RADR2 => NlwBufferSignal_Mram_r324_SLICEM_F_RADR3,
      RADR3 => NlwBufferSignal_Mram_r324_SLICEM_F_RADR4,
      WADR0 => NlwBufferSignal_Mram_r324_SLICEM_F_WADR1,
      WADR1 => NlwBufferSignal_Mram_r324_SLICEM_F_WADR2,
      WADR2 => NlwBufferSignal_Mram_r324_SLICEM_F_WADR3,
      WADR3 => NlwBufferSignal_Mram_r324_SLICEM_F_WADR4,
      I => N11_DIF_MUX_1535,
      CLK => N11_CLKINV_1518,
      WE => N11_SRINV_1512,
      O => N11
    );
  Mram_r325_SLICEM_G : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X38Y43"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r325_SLICEM_G_RADR1,
      RADR1 => NlwBufferSignal_Mram_r325_SLICEM_G_RADR2,
      RADR2 => NlwBufferSignal_Mram_r325_SLICEM_G_RADR3,
      RADR3 => NlwBufferSignal_Mram_r325_SLICEM_G_RADR4,
      WADR0 => NlwBufferSignal_Mram_r325_SLICEM_G_WADR1,
      WADR1 => NlwBufferSignal_Mram_r325_SLICEM_G_WADR2,
      WADR2 => NlwBufferSignal_Mram_r325_SLICEM_G_WADR3,
      WADR3 => NlwBufferSignal_Mram_r325_SLICEM_G_WADR4,
      I => N13_DIG_MUX_1571,
      CLK => N13_CLKINV_1569,
      WE => N13_SRINV_1563,
      O => N12
    );
  Mram_r325_SLICEM_F : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X38Y43"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r325_SLICEM_F_RADR1,
      RADR1 => NlwBufferSignal_Mram_r325_SLICEM_F_RADR2,
      RADR2 => NlwBufferSignal_Mram_r325_SLICEM_F_RADR3,
      RADR3 => NlwBufferSignal_Mram_r325_SLICEM_F_RADR4,
      WADR0 => NlwBufferSignal_Mram_r325_SLICEM_F_WADR1,
      WADR1 => NlwBufferSignal_Mram_r325_SLICEM_F_WADR2,
      WADR2 => NlwBufferSignal_Mram_r325_SLICEM_F_WADR3,
      WADR3 => NlwBufferSignal_Mram_r325_SLICEM_F_WADR4,
      I => N13_DIF_MUX_1586,
      CLK => N13_CLKINV_1569,
      WE => N13_SRINV_1563,
      O => N13
    );
  Mram_r326_SLICEM_G : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y42"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r326_SLICEM_G_RADR1,
      RADR1 => NlwBufferSignal_Mram_r326_SLICEM_G_RADR2,
      RADR2 => NlwBufferSignal_Mram_r326_SLICEM_G_RADR3,
      RADR3 => NlwBufferSignal_Mram_r326_SLICEM_G_RADR4,
      WADR0 => NlwBufferSignal_Mram_r326_SLICEM_G_WADR1,
      WADR1 => NlwBufferSignal_Mram_r326_SLICEM_G_WADR2,
      WADR2 => NlwBufferSignal_Mram_r326_SLICEM_G_WADR3,
      WADR3 => NlwBufferSignal_Mram_r326_SLICEM_G_WADR4,
      I => N15_DIG_MUX_1622,
      CLK => N15_CLKINV_1620,
      WE => N15_SRINV_1614,
      O => N14
    );
  Mram_r326_SLICEM_F : X_RAMD16
    generic map(
      INIT => X"0000",
      LOC => "SLICE_X48Y42"
    )
    port map (
      RADR0 => NlwBufferSignal_Mram_r326_SLICEM_F_RADR1,
      RADR1 => NlwBufferSignal_Mram_r326_SLICEM_F_RADR2,
      RADR2 => NlwBufferSignal_Mram_r326_SLICEM_F_RADR3,
      RADR3 => NlwBufferSignal_Mram_r326_SLICEM_F_RADR4,
      WADR0 => NlwBufferSignal_Mram_r326_SLICEM_F_WADR1,
      WADR1 => NlwBufferSignal_Mram_r326_SLICEM_F_WADR2,
      WADR2 => NlwBufferSignal_Mram_r326_SLICEM_F_WADR3,
      WADR3 => NlwBufferSignal_Mram_r326_SLICEM_F_WADR4,
      I => N15_DIF_MUX_1637,
      CLK => N15_CLKINV_1620,
      WE => N15_SRINV_1614,
      O => N15
    );
  Mram_r641_F_WE_WSFAND : X_AND2
    generic map(
      LOC => "SLICE_X48Y58"
    )
    port map (
      I0 => N22_SLICEWE0USED_515,
      I1 => N22_SRINV_517,
      O => N22_WSF
    );
  Mram_r641_F_WE_WSGAND : X_AND2
    generic map(
      LOC => "SLICE_X48Y58"
    )
    port map (
      I0 => NlwInverterSignal_Mram_r641_F_WE_WSGAND_WE0,
      I1 => N22_SRINV_517,
      O => N22_WSG
    );
  Mram_r642_F_WE_WSFAND : X_AND2
    generic map(
      LOC => "SLICE_X48Y57"
    )
    port map (
      I0 => N24_SLICEWE0USED_569,
      I1 => N24_SRINV_571,
      O => N24_WSF
    );
  Mram_r642_F_WE_WSGAND : X_AND2
    generic map(
      LOC => "SLICE_X48Y57"
    )
    port map (
      I0 => NlwInverterSignal_Mram_r642_F_WE_WSGAND_WE0,
      I1 => N24_SRINV_571,
      O => N24_WSG
    );
  Mram_r643_F_WE_WSFAND : X_AND2
    generic map(
      LOC => "SLICE_X48Y59"
    )
    port map (
      I0 => N26_SLICEWE0USED_623,
      I1 => N26_SRINV_625,
      O => N26_WSF
    );
  Mram_r643_F_WE_WSGAND : X_AND2
    generic map(
      LOC => "SLICE_X48Y59"
    )
    port map (
      I0 => NlwInverterSignal_Mram_r643_F_WE_WSGAND_WE0,
      I1 => N26_SRINV_625,
      O => N26_WSG
    );
  Mram_r644_F_WE_WSFAND : X_AND2
    generic map(
      LOC => "SLICE_X48Y56"
    )
    port map (
      I0 => N28_SLICEWE0USED_677,
      I1 => N28_SRINV_679,
      O => N28_WSF
    );
  Mram_r644_F_WE_WSGAND : X_AND2
    generic map(
      LOC => "SLICE_X48Y56"
    )
    port map (
      I0 => NlwInverterSignal_Mram_r644_F_WE_WSGAND_WE0,
      I1 => N28_SRINV_679,
      O => N28_WSG
    );
  o16_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD2",
      PATHPULSE => 638 ps
    )
    port map (
      I => o16_0_OBUF_1168,
      O => o16_0_O
    );
  dpo_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD27",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpo_0_OBUF_1099,
      O => dpo_0_O
    );
  o16_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD4",
      PATHPULSE => 638 ps
    )
    port map (
      I => o16_1_OBUF_1272,
      O => o16_1_O
    );
  dpo_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD33",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpo_1_OBUF_1107,
      O => dpo_1_O
    );
  o16_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD5",
      PATHPULSE => 638 ps
    )
    port map (
      I => o16_2_OBUF_1376,
      O => o16_2_O
    );
  dpo_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD34",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpo_2_OBUF_1123,
      O => dpo_2_O
    );
  o16_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD11",
      PATHPULSE => 638 ps
    )
    port map (
      I => o16_3_OBUF_1480,
      O => o16_3_O
    );
  dpo_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD35",
      PATHPULSE => 638 ps
    )
    port map (
      I => dpo_3_OBUF_1131,
      O => dpo_3_O
    );
  o16_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD12",
      PATHPULSE => 638 ps
    )
    port map (
      I => o16_4_OBUF_1496,
      O => o16_4_O
    );
  o16_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD14",
      PATHPULSE => 638 ps
    )
    port map (
      I => o16_5_OBUF_1392,
      O => o16_5_O
    );
  o16_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD15",
      PATHPULSE => 638 ps
    )
    port map (
      I => o16_6_OBUF_1288,
      O => o16_6_O
    );
  o16_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD19",
      PATHPULSE => 638 ps
    )
    port map (
      I => o16_7_OBUF_1184,
      O => o16_7_O
    );
  o64_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD36",
      PATHPULSE => 638 ps
    )
    port map (
      I => q64(0),
      O => o64_0_O
    );
  o64_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD42",
      PATHPULSE => 638 ps
    )
    port map (
      I => q64(1),
      O => o64_1_O
    );
  spo_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD20",
      PATHPULSE => 638 ps
    )
    port map (
      I => spo_0_OBUF_1791,
      O => spo_0_O
    );
  spo_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD23",
      PATHPULSE => 638 ps
    )
    port map (
      I => spo_1_OBUF_1799,
      O => spo_1_O
    );
  spo_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD24",
      PATHPULSE => 638 ps
    )
    port map (
      I => spo_2_OBUF_1050,
      O => spo_2_O
    );
  spo_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD26",
      PATHPULSE => 638 ps
    )
    port map (
      I => spo_3_OBUF_1074,
      O => spo_3_O
    );
  NlwBufferBlock_Mram_r641_G_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r641_G_RADR1
    );
  NlwBufferBlock_Mram_r641_G_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r641_G_RADR2
    );
  NlwBufferBlock_Mram_r641_G_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r641_G_RADR3
    );
  NlwBufferBlock_Mram_r641_G_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r641_G_RADR4
    );
  NlwBufferBlock_Mram_r641_G_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r641_G_WADR1
    );
  NlwBufferBlock_Mram_r641_G_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r641_G_WADR2
    );
  NlwBufferBlock_Mram_r641_G_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r641_G_WADR3
    );
  NlwBufferBlock_Mram_r641_G_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r641_G_WADR4
    );
  NlwBufferBlock_Mram_r641_F_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r641_F_RADR1
    );
  NlwBufferBlock_Mram_r641_F_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r641_F_RADR2
    );
  NlwBufferBlock_Mram_r641_F_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r641_F_RADR3
    );
  NlwBufferBlock_Mram_r641_F_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r641_F_RADR4
    );
  NlwBufferBlock_Mram_r641_F_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r641_F_WADR1
    );
  NlwBufferBlock_Mram_r641_F_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r641_F_WADR2
    );
  NlwBufferBlock_Mram_r641_F_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r641_F_WADR3
    );
  NlwBufferBlock_Mram_r641_F_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r641_F_WADR4
    );
  NlwBufferBlock_Mram_r642_G_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r642_G_RADR1
    );
  NlwBufferBlock_Mram_r642_G_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r642_G_RADR2
    );
  NlwBufferBlock_Mram_r642_G_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r642_G_RADR3
    );
  NlwBufferBlock_Mram_r642_G_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r642_G_RADR4
    );
  NlwBufferBlock_Mram_r642_G_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r642_G_WADR1
    );
  NlwBufferBlock_Mram_r642_G_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r642_G_WADR2
    );
  NlwBufferBlock_Mram_r642_G_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r642_G_WADR3
    );
  NlwBufferBlock_Mram_r642_G_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r642_G_WADR4
    );
  NlwBufferBlock_Mram_r642_F_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r642_F_RADR1
    );
  NlwBufferBlock_Mram_r642_F_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r642_F_RADR2
    );
  NlwBufferBlock_Mram_r642_F_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r642_F_RADR3
    );
  NlwBufferBlock_Mram_r642_F_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r642_F_RADR4
    );
  NlwBufferBlock_Mram_r642_F_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r642_F_WADR1
    );
  NlwBufferBlock_Mram_r642_F_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r642_F_WADR2
    );
  NlwBufferBlock_Mram_r642_F_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r642_F_WADR3
    );
  NlwBufferBlock_Mram_r642_F_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r642_F_WADR4
    );
  NlwBufferBlock_Mram_r643_G_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r643_G_RADR1
    );
  NlwBufferBlock_Mram_r643_G_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r643_G_RADR2
    );
  NlwBufferBlock_Mram_r643_G_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r643_G_RADR3
    );
  NlwBufferBlock_Mram_r643_G_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r643_G_RADR4
    );
  NlwBufferBlock_Mram_r643_G_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r643_G_WADR1
    );
  NlwBufferBlock_Mram_r643_G_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r643_G_WADR2
    );
  NlwBufferBlock_Mram_r643_G_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r643_G_WADR3
    );
  NlwBufferBlock_Mram_r643_G_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r643_G_WADR4
    );
  NlwBufferBlock_Mram_r643_F_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r643_F_RADR1
    );
  NlwBufferBlock_Mram_r643_F_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r643_F_RADR2
    );
  NlwBufferBlock_Mram_r643_F_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r643_F_RADR3
    );
  NlwBufferBlock_Mram_r643_F_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r643_F_RADR4
    );
  NlwBufferBlock_Mram_r643_F_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r643_F_WADR1
    );
  NlwBufferBlock_Mram_r643_F_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r643_F_WADR2
    );
  NlwBufferBlock_Mram_r643_F_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r643_F_WADR3
    );
  NlwBufferBlock_Mram_r643_F_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r643_F_WADR4
    );
  NlwBufferBlock_Mram_r644_G_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r644_G_RADR1
    );
  NlwBufferBlock_Mram_r644_G_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r644_G_RADR2
    );
  NlwBufferBlock_Mram_r644_G_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r644_G_RADR3
    );
  NlwBufferBlock_Mram_r644_G_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r644_G_RADR4
    );
  NlwBufferBlock_Mram_r644_G_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r644_G_WADR1
    );
  NlwBufferBlock_Mram_r644_G_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r644_G_WADR2
    );
  NlwBufferBlock_Mram_r644_G_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r644_G_WADR3
    );
  NlwBufferBlock_Mram_r644_G_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r644_G_WADR4
    );
  NlwBufferBlock_Mram_r644_F_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r644_F_RADR1
    );
  NlwBufferBlock_Mram_r644_F_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r644_F_RADR2
    );
  NlwBufferBlock_Mram_r644_F_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r644_F_RADR3
    );
  NlwBufferBlock_Mram_r644_F_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r644_F_RADR4
    );
  NlwBufferBlock_Mram_r644_F_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r644_F_WADR1
    );
  NlwBufferBlock_Mram_r644_F_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r644_F_WADR2
    );
  NlwBufferBlock_Mram_r644_F_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r644_F_WADR3
    );
  NlwBufferBlock_Mram_r644_F_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r644_F_WADR4
    );
  NlwBufferBlock_Mram_r161_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r161_RADR1
    );
  NlwBufferBlock_Mram_r161_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r161_RADR2
    );
  NlwBufferBlock_Mram_r161_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r161_RADR3
    );
  NlwBufferBlock_Mram_r161_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r161_RADR4
    );
  NlwBufferBlock_Mram_r161_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r161_WADR1
    );
  NlwBufferBlock_Mram_r161_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r161_WADR2
    );
  NlwBufferBlock_Mram_r161_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r161_WADR3
    );
  NlwBufferBlock_Mram_r161_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r161_WADR4
    );
  NlwBufferBlock_Mram_r168_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r168_RADR1
    );
  NlwBufferBlock_Mram_r168_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r168_RADR2
    );
  NlwBufferBlock_Mram_r168_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r168_RADR3
    );
  NlwBufferBlock_Mram_r168_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r168_RADR4
    );
  NlwBufferBlock_Mram_r168_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r168_WADR1
    );
  NlwBufferBlock_Mram_r168_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r168_WADR2
    );
  NlwBufferBlock_Mram_r168_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r168_WADR3
    );
  NlwBufferBlock_Mram_r168_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r168_WADR4
    );
  NlwBufferBlock_Mram_r321_SLICEM_G_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r321_SLICEM_G_RADR1
    );
  NlwBufferBlock_Mram_r321_SLICEM_G_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r321_SLICEM_G_RADR2
    );
  NlwBufferBlock_Mram_r321_SLICEM_G_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r321_SLICEM_G_RADR3
    );
  NlwBufferBlock_Mram_r321_SLICEM_G_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r321_SLICEM_G_RADR4
    );
  NlwBufferBlock_Mram_r321_SLICEM_G_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r321_SLICEM_G_WADR1
    );
  NlwBufferBlock_Mram_r321_SLICEM_G_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r321_SLICEM_G_WADR2
    );
  NlwBufferBlock_Mram_r321_SLICEM_G_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r321_SLICEM_G_WADR3
    );
  NlwBufferBlock_Mram_r321_SLICEM_G_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r321_SLICEM_G_WADR4
    );
  NlwBufferBlock_Mram_r321_SLICEM_F_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_0_IBUF_467,
      O => NlwBufferSignal_Mram_r321_SLICEM_F_RADR1
    );
  NlwBufferBlock_Mram_r321_SLICEM_F_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_1_IBUF_468,
      O => NlwBufferSignal_Mram_r321_SLICEM_F_RADR2
    );
  NlwBufferBlock_Mram_r321_SLICEM_F_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_2_IBUF_469,
      O => NlwBufferSignal_Mram_r321_SLICEM_F_RADR3
    );
  NlwBufferBlock_Mram_r321_SLICEM_F_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_3_IBUF_470,
      O => NlwBufferSignal_Mram_r321_SLICEM_F_RADR4
    );
  NlwBufferBlock_Mram_r321_SLICEM_F_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r321_SLICEM_F_WADR1
    );
  NlwBufferBlock_Mram_r321_SLICEM_F_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r321_SLICEM_F_WADR2
    );
  NlwBufferBlock_Mram_r321_SLICEM_F_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r321_SLICEM_F_WADR3
    );
  NlwBufferBlock_Mram_r321_SLICEM_F_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r321_SLICEM_F_WADR4
    );
  NlwBufferBlock_Mram_r162_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r162_RADR1
    );
  NlwBufferBlock_Mram_r162_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r162_RADR2
    );
  NlwBufferBlock_Mram_r162_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r162_RADR3
    );
  NlwBufferBlock_Mram_r162_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r162_RADR4
    );
  NlwBufferBlock_Mram_r162_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r162_WADR1
    );
  NlwBufferBlock_Mram_r162_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r162_WADR2
    );
  NlwBufferBlock_Mram_r162_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r162_WADR3
    );
  NlwBufferBlock_Mram_r162_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r162_WADR4
    );
  NlwBufferBlock_Mram_r167_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r167_RADR1
    );
  NlwBufferBlock_Mram_r167_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r167_RADR2
    );
  NlwBufferBlock_Mram_r167_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r167_RADR3
    );
  NlwBufferBlock_Mram_r167_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r167_RADR4
    );
  NlwBufferBlock_Mram_r167_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r167_WADR1
    );
  NlwBufferBlock_Mram_r167_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r167_WADR2
    );
  NlwBufferBlock_Mram_r167_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r167_WADR3
    );
  NlwBufferBlock_Mram_r167_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r167_WADR4
    );
  NlwBufferBlock_Mram_r322_SLICEM_G_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r322_SLICEM_G_RADR1
    );
  NlwBufferBlock_Mram_r322_SLICEM_G_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r322_SLICEM_G_RADR2
    );
  NlwBufferBlock_Mram_r322_SLICEM_G_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r322_SLICEM_G_RADR3
    );
  NlwBufferBlock_Mram_r322_SLICEM_G_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r322_SLICEM_G_RADR4
    );
  NlwBufferBlock_Mram_r322_SLICEM_G_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r322_SLICEM_G_WADR1
    );
  NlwBufferBlock_Mram_r322_SLICEM_G_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r322_SLICEM_G_WADR2
    );
  NlwBufferBlock_Mram_r322_SLICEM_G_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r322_SLICEM_G_WADR3
    );
  NlwBufferBlock_Mram_r322_SLICEM_G_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r322_SLICEM_G_WADR4
    );
  NlwBufferBlock_Mram_r322_SLICEM_F_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_0_IBUF_467,
      O => NlwBufferSignal_Mram_r322_SLICEM_F_RADR1
    );
  NlwBufferBlock_Mram_r322_SLICEM_F_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_1_IBUF_468,
      O => NlwBufferSignal_Mram_r322_SLICEM_F_RADR2
    );
  NlwBufferBlock_Mram_r322_SLICEM_F_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_2_IBUF_469,
      O => NlwBufferSignal_Mram_r322_SLICEM_F_RADR3
    );
  NlwBufferBlock_Mram_r322_SLICEM_F_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_3_IBUF_470,
      O => NlwBufferSignal_Mram_r322_SLICEM_F_RADR4
    );
  NlwBufferBlock_Mram_r322_SLICEM_F_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r322_SLICEM_F_WADR1
    );
  NlwBufferBlock_Mram_r322_SLICEM_F_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r322_SLICEM_F_WADR2
    );
  NlwBufferBlock_Mram_r322_SLICEM_F_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r322_SLICEM_F_WADR3
    );
  NlwBufferBlock_Mram_r322_SLICEM_F_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r322_SLICEM_F_WADR4
    );
  NlwBufferBlock_Mram_r163_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r163_RADR1
    );
  NlwBufferBlock_Mram_r163_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r163_RADR2
    );
  NlwBufferBlock_Mram_r163_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r163_RADR3
    );
  NlwBufferBlock_Mram_r163_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r163_RADR4
    );
  NlwBufferBlock_Mram_r163_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r163_WADR1
    );
  NlwBufferBlock_Mram_r163_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r163_WADR2
    );
  NlwBufferBlock_Mram_r163_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r163_WADR3
    );
  NlwBufferBlock_Mram_r163_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r163_WADR4
    );
  NlwBufferBlock_Mram_r166_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r166_RADR1
    );
  NlwBufferBlock_Mram_r166_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r166_RADR2
    );
  NlwBufferBlock_Mram_r166_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r166_RADR3
    );
  NlwBufferBlock_Mram_r166_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r166_RADR4
    );
  NlwBufferBlock_Mram_r166_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r166_WADR1
    );
  NlwBufferBlock_Mram_r166_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r166_WADR2
    );
  NlwBufferBlock_Mram_r166_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r166_WADR3
    );
  NlwBufferBlock_Mram_r166_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r166_WADR4
    );
  NlwBufferBlock_Mram_r323_SLICEM_G_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r323_SLICEM_G_RADR1
    );
  NlwBufferBlock_Mram_r323_SLICEM_G_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r323_SLICEM_G_RADR2
    );
  NlwBufferBlock_Mram_r323_SLICEM_G_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r323_SLICEM_G_RADR3
    );
  NlwBufferBlock_Mram_r323_SLICEM_G_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r323_SLICEM_G_RADR4
    );
  NlwBufferBlock_Mram_r323_SLICEM_G_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r323_SLICEM_G_WADR1
    );
  NlwBufferBlock_Mram_r323_SLICEM_G_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r323_SLICEM_G_WADR2
    );
  NlwBufferBlock_Mram_r323_SLICEM_G_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r323_SLICEM_G_WADR3
    );
  NlwBufferBlock_Mram_r323_SLICEM_G_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r323_SLICEM_G_WADR4
    );
  NlwBufferBlock_Mram_r327_SLICEM_G_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r327_SLICEM_G_RADR1
    );
  NlwBufferBlock_Mram_r327_SLICEM_G_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r327_SLICEM_G_RADR2
    );
  NlwBufferBlock_Mram_r327_SLICEM_G_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r327_SLICEM_G_RADR3
    );
  NlwBufferBlock_Mram_r327_SLICEM_G_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r327_SLICEM_G_RADR4
    );
  NlwBufferBlock_Mram_r327_SLICEM_G_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r327_SLICEM_G_WADR1
    );
  NlwBufferBlock_Mram_r327_SLICEM_G_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r327_SLICEM_G_WADR2
    );
  NlwBufferBlock_Mram_r327_SLICEM_G_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r327_SLICEM_G_WADR3
    );
  NlwBufferBlock_Mram_r327_SLICEM_G_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r327_SLICEM_G_WADR4
    );
  NlwBufferBlock_Mram_r327_SLICEM_F_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_0_IBUF_467,
      O => NlwBufferSignal_Mram_r327_SLICEM_F_RADR1
    );
  NlwBufferBlock_Mram_r327_SLICEM_F_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_1_IBUF_468,
      O => NlwBufferSignal_Mram_r327_SLICEM_F_RADR2
    );
  NlwBufferBlock_Mram_r327_SLICEM_F_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_2_IBUF_469,
      O => NlwBufferSignal_Mram_r327_SLICEM_F_RADR3
    );
  NlwBufferBlock_Mram_r327_SLICEM_F_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_3_IBUF_470,
      O => NlwBufferSignal_Mram_r327_SLICEM_F_RADR4
    );
  NlwBufferBlock_Mram_r327_SLICEM_F_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r327_SLICEM_F_WADR1
    );
  NlwBufferBlock_Mram_r327_SLICEM_F_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r327_SLICEM_F_WADR2
    );
  NlwBufferBlock_Mram_r327_SLICEM_F_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r327_SLICEM_F_WADR3
    );
  NlwBufferBlock_Mram_r327_SLICEM_F_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r327_SLICEM_F_WADR4
    );
  NlwBufferBlock_Mram_r328_SLICEM_G_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r328_SLICEM_G_RADR1
    );
  NlwBufferBlock_Mram_r328_SLICEM_G_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r328_SLICEM_G_RADR2
    );
  NlwBufferBlock_Mram_r328_SLICEM_G_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r328_SLICEM_G_RADR3
    );
  NlwBufferBlock_Mram_r328_SLICEM_G_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r328_SLICEM_G_RADR4
    );
  NlwBufferBlock_Mram_r328_SLICEM_G_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r328_SLICEM_G_WADR1
    );
  NlwBufferBlock_Mram_r328_SLICEM_G_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r328_SLICEM_G_WADR2
    );
  NlwBufferBlock_Mram_r328_SLICEM_G_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r328_SLICEM_G_WADR3
    );
  NlwBufferBlock_Mram_r328_SLICEM_G_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r328_SLICEM_G_WADR4
    );
  NlwBufferBlock_Mram_r328_SLICEM_F_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_0_IBUF_467,
      O => NlwBufferSignal_Mram_r328_SLICEM_F_RADR1
    );
  NlwBufferBlock_Mram_r328_SLICEM_F_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_3_IBUF_470,
      O => NlwBufferSignal_Mram_r328_SLICEM_F_RADR4
    );
  NlwBufferBlock_Mram_r328_SLICEM_F_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r328_SLICEM_F_WADR1
    );
  NlwBufferBlock_Mram_r328_SLICEM_F_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r328_SLICEM_F_WADR2
    );
  NlwBufferBlock_Mram_r328_SLICEM_F_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r328_SLICEM_F_WADR3
    );
  NlwBufferBlock_Mram_r328_SLICEM_F_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r328_SLICEM_F_WADR4
    );
  NlwBufferBlock_Mram_r323_SLICEM_F_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_0_IBUF_467,
      O => NlwBufferSignal_Mram_r323_SLICEM_F_RADR1
    );
  NlwBufferBlock_Mram_r323_SLICEM_F_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_1_IBUF_468,
      O => NlwBufferSignal_Mram_r323_SLICEM_F_RADR2
    );
  NlwBufferBlock_Mram_r323_SLICEM_F_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_2_IBUF_469,
      O => NlwBufferSignal_Mram_r323_SLICEM_F_RADR3
    );
  NlwBufferBlock_Mram_r323_SLICEM_F_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_3_IBUF_470,
      O => NlwBufferSignal_Mram_r323_SLICEM_F_RADR4
    );
  NlwBufferBlock_Mram_r323_SLICEM_F_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r323_SLICEM_F_WADR1
    );
  NlwBufferBlock_Mram_r323_SLICEM_F_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r323_SLICEM_F_WADR2
    );
  NlwBufferBlock_Mram_r323_SLICEM_F_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r323_SLICEM_F_WADR3
    );
  NlwBufferBlock_Mram_r323_SLICEM_F_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r323_SLICEM_F_WADR4
    );
  NlwBufferBlock_Mram_r164_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r164_RADR1
    );
  NlwBufferBlock_Mram_r164_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r164_RADR2
    );
  NlwBufferBlock_Mram_r164_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r164_RADR3
    );
  NlwBufferBlock_Mram_r164_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r164_RADR4
    );
  NlwBufferBlock_Mram_r164_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r164_WADR1
    );
  NlwBufferBlock_Mram_r164_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r164_WADR2
    );
  NlwBufferBlock_Mram_r164_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r164_WADR3
    );
  NlwBufferBlock_Mram_r164_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r164_WADR4
    );
  NlwBufferBlock_Mram_r165_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r165_RADR1
    );
  NlwBufferBlock_Mram_r165_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r165_RADR2
    );
  NlwBufferBlock_Mram_r165_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r165_RADR3
    );
  NlwBufferBlock_Mram_r165_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r165_RADR4
    );
  NlwBufferBlock_Mram_r165_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r165_WADR1
    );
  NlwBufferBlock_Mram_r165_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r165_WADR2
    );
  NlwBufferBlock_Mram_r165_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r165_WADR3
    );
  NlwBufferBlock_Mram_r165_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r165_WADR4
    );
  NlwBufferBlock_Mram_r324_SLICEM_G_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r324_SLICEM_G_RADR1
    );
  NlwBufferBlock_Mram_r324_SLICEM_G_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r324_SLICEM_G_RADR2
    );
  NlwBufferBlock_Mram_r324_SLICEM_G_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r324_SLICEM_G_RADR3
    );
  NlwBufferBlock_Mram_r324_SLICEM_G_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r324_SLICEM_G_RADR4
    );
  NlwBufferBlock_Mram_r324_SLICEM_G_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r324_SLICEM_G_WADR1
    );
  NlwBufferBlock_Mram_r324_SLICEM_G_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r324_SLICEM_G_WADR2
    );
  NlwBufferBlock_Mram_r324_SLICEM_G_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r324_SLICEM_G_WADR3
    );
  NlwBufferBlock_Mram_r324_SLICEM_G_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r324_SLICEM_G_WADR4
    );
  NlwBufferBlock_Mram_r324_SLICEM_F_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_0_IBUF_467,
      O => NlwBufferSignal_Mram_r324_SLICEM_F_RADR1
    );
  NlwBufferBlock_Mram_r324_SLICEM_F_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_1_IBUF_468,
      O => NlwBufferSignal_Mram_r324_SLICEM_F_RADR2
    );
  NlwBufferBlock_Mram_r324_SLICEM_F_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_2_IBUF_469,
      O => NlwBufferSignal_Mram_r324_SLICEM_F_RADR3
    );
  NlwBufferBlock_Mram_r324_SLICEM_F_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_3_IBUF_470,
      O => NlwBufferSignal_Mram_r324_SLICEM_F_RADR4
    );
  NlwBufferBlock_Mram_r324_SLICEM_F_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r324_SLICEM_F_WADR1
    );
  NlwBufferBlock_Mram_r324_SLICEM_F_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r324_SLICEM_F_WADR2
    );
  NlwBufferBlock_Mram_r324_SLICEM_F_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r324_SLICEM_F_WADR3
    );
  NlwBufferBlock_Mram_r324_SLICEM_F_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r324_SLICEM_F_WADR4
    );
  NlwBufferBlock_Mram_r325_SLICEM_G_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r325_SLICEM_G_RADR1
    );
  NlwBufferBlock_Mram_r325_SLICEM_G_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r325_SLICEM_G_RADR2
    );
  NlwBufferBlock_Mram_r325_SLICEM_G_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r325_SLICEM_G_RADR3
    );
  NlwBufferBlock_Mram_r325_SLICEM_G_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r325_SLICEM_G_RADR4
    );
  NlwBufferBlock_Mram_r325_SLICEM_G_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r325_SLICEM_G_WADR1
    );
  NlwBufferBlock_Mram_r325_SLICEM_G_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r325_SLICEM_G_WADR2
    );
  NlwBufferBlock_Mram_r325_SLICEM_G_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r325_SLICEM_G_WADR3
    );
  NlwBufferBlock_Mram_r325_SLICEM_G_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r325_SLICEM_G_WADR4
    );
  NlwBufferBlock_Mram_r325_SLICEM_F_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_0_IBUF_467,
      O => NlwBufferSignal_Mram_r325_SLICEM_F_RADR1
    );
  NlwBufferBlock_Mram_r325_SLICEM_F_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_1_IBUF_468,
      O => NlwBufferSignal_Mram_r325_SLICEM_F_RADR2
    );
  NlwBufferBlock_Mram_r325_SLICEM_F_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_2_IBUF_469,
      O => NlwBufferSignal_Mram_r325_SLICEM_F_RADR3
    );
  NlwBufferBlock_Mram_r325_SLICEM_F_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_3_IBUF_470,
      O => NlwBufferSignal_Mram_r325_SLICEM_F_RADR4
    );
  NlwBufferBlock_Mram_r325_SLICEM_F_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r325_SLICEM_F_WADR1
    );
  NlwBufferBlock_Mram_r325_SLICEM_F_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r325_SLICEM_F_WADR2
    );
  NlwBufferBlock_Mram_r325_SLICEM_F_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r325_SLICEM_F_WADR3
    );
  NlwBufferBlock_Mram_r325_SLICEM_F_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r325_SLICEM_F_WADR4
    );
  NlwBufferBlock_Mram_r326_SLICEM_G_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r326_SLICEM_G_RADR1
    );
  NlwBufferBlock_Mram_r326_SLICEM_G_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r326_SLICEM_G_RADR2
    );
  NlwBufferBlock_Mram_r326_SLICEM_G_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r326_SLICEM_G_RADR3
    );
  NlwBufferBlock_Mram_r326_SLICEM_G_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r326_SLICEM_G_RADR4
    );
  NlwBufferBlock_Mram_r326_SLICEM_G_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r326_SLICEM_G_WADR1
    );
  NlwBufferBlock_Mram_r326_SLICEM_G_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r326_SLICEM_G_WADR2
    );
  NlwBufferBlock_Mram_r326_SLICEM_G_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r326_SLICEM_G_WADR3
    );
  NlwBufferBlock_Mram_r326_SLICEM_G_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r326_SLICEM_G_WADR4
    );
  NlwBufferBlock_Mram_r326_SLICEM_F_RADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_0_IBUF_467,
      O => NlwBufferSignal_Mram_r326_SLICEM_F_RADR1
    );
  NlwBufferBlock_Mram_r326_SLICEM_F_RADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_1_IBUF_468,
      O => NlwBufferSignal_Mram_r326_SLICEM_F_RADR2
    );
  NlwBufferBlock_Mram_r326_SLICEM_F_RADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_2_IBUF_469,
      O => NlwBufferSignal_Mram_r326_SLICEM_F_RADR3
    );
  NlwBufferBlock_Mram_r326_SLICEM_F_RADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => dpra_3_IBUF_470,
      O => NlwBufferSignal_Mram_r326_SLICEM_F_RADR4
    );
  NlwBufferBlock_Mram_r326_SLICEM_F_WADR1 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_438,
      O => NlwBufferSignal_Mram_r326_SLICEM_F_WADR1
    );
  NlwBufferBlock_Mram_r326_SLICEM_F_WADR2 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_439,
      O => NlwBufferSignal_Mram_r326_SLICEM_F_WADR2
    );
  NlwBufferBlock_Mram_r326_SLICEM_F_WADR3 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_440,
      O => NlwBufferSignal_Mram_r326_SLICEM_F_WADR3
    );
  NlwBufferBlock_Mram_r326_SLICEM_F_WADR4 : X_BUF
    generic map(
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_441,
      O => NlwBufferSignal_Mram_r326_SLICEM_F_WADR4
    );
  NlwBlock_top_GND : X_ZERO
    port map (
      O => GND
    );
  NlwBlock_top_VCC : X_ONE
    port map (
      O => VCC
    );
  NlwInverterBlock_Mram_r641_F_WE_WSGAND_WE0 : X_INV
    port map (
      I => N22_SLICEWE0USED_515,
      O => NlwInverterSignal_Mram_r641_F_WE_WSGAND_WE0
    );
  NlwInverterBlock_Mram_r642_F_WE_WSGAND_WE0 : X_INV
    port map (
      I => N24_SLICEWE0USED_569,
      O => NlwInverterSignal_Mram_r642_F_WE_WSGAND_WE0
    );
  NlwInverterBlock_Mram_r643_F_WE_WSGAND_WE0 : X_INV
    port map (
      I => N26_SLICEWE0USED_623,
      O => NlwInverterSignal_Mram_r643_F_WE_WSGAND_WE0
    );
  NlwInverterBlock_Mram_r644_F_WE_WSGAND_WE0 : X_INV
    port map (
      I => N28_SLICEWE0USED_677,
      O => NlwInverterSignal_Mram_r644_F_WE_WSGAND_WE0
    );
  NlwBlockROC : X_ROC
    port map (O => GSR);
  NlwBlockTOC : X_TOC
    port map (O => GTS);

end STRUCTURE;

