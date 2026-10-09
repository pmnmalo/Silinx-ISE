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
    eq : out STD_LOGIC;
    sub : in STD_LOGIC := 'X';
    acc_en : in STD_LOGIC := 'X';
    lts : out STD_LOGIC;
    ltu : out STD_LOGIC;
    cin : in STD_LOGIC := 'X';
    s : out STD_LOGIC_VECTOR ( 16 downto 0 );
    acc : out STD_LOGIC_VECTOR ( 11 downto 0 );
    a : in STD_LOGIC_VECTOR ( 15 downto 0 );
    b : in STD_LOGIC_VECTOR ( 15 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal acc_en_IBUF_783 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal acc_0_785 : STD_LOGIC;
  signal a_0_IBUF_786 : STD_LOGIC;
  signal acc_1_787 : STD_LOGIC;
  signal a_1_IBUF_788 : STD_LOGIC;
  signal Maccum_acc_cy_1_Q : STD_LOGIC;
  signal acc_2_790 : STD_LOGIC;
  signal a_2_IBUF_791 : STD_LOGIC;
  signal acc_3_792 : STD_LOGIC;
  signal a_3_IBUF_793 : STD_LOGIC;
  signal Maccum_acc_cy_3_Q : STD_LOGIC;
  signal acc_4_795 : STD_LOGIC;
  signal a_4_IBUF_796 : STD_LOGIC;
  signal acc_5_797 : STD_LOGIC;
  signal a_5_IBUF_798 : STD_LOGIC;
  signal Maccum_acc_cy_5_Q : STD_LOGIC;
  signal acc_6_800 : STD_LOGIC;
  signal a_6_IBUF_801 : STD_LOGIC;
  signal acc_7_802 : STD_LOGIC;
  signal a_7_IBUF_803 : STD_LOGIC;
  signal Maccum_acc_cy_7_Q : STD_LOGIC;
  signal acc_8_805 : STD_LOGIC;
  signal a_8_IBUF_806 : STD_LOGIC;
  signal acc_9_807 : STD_LOGIC;
  signal a_9_IBUF_808 : STD_LOGIC;
  signal acc_10_810 : STD_LOGIC;
  signal a_10_IBUF_811 : STD_LOGIC;
  signal acc_11_812 : STD_LOGIC;
  signal a_11_IBUF_813 : STD_LOGIC;
  signal b_0_IBUF_815 : STD_LOGIC;
  signal b_1_IBUF_816 : STD_LOGIC;
  signal b_2_IBUF_818 : STD_LOGIC;
  signal b_3_IBUF_819 : STD_LOGIC;
  signal b_4_IBUF_821 : STD_LOGIC;
  signal b_5_IBUF_822 : STD_LOGIC;
  signal b_6_IBUF_824 : STD_LOGIC;
  signal b_7_IBUF_825 : STD_LOGIC;
  signal b_8_IBUF_827 : STD_LOGIC;
  signal b_9_IBUF_828 : STD_LOGIC;
  signal b_10_IBUF_830 : STD_LOGIC;
  signal b_11_IBUF_831 : STD_LOGIC;
  signal a_12_IBUF_833 : STD_LOGIC;
  signal b_12_IBUF_834 : STD_LOGIC;
  signal a_13_IBUF_835 : STD_LOGIC;
  signal b_13_IBUF_836 : STD_LOGIC;
  signal a_14_IBUF_838 : STD_LOGIC;
  signal b_14_IBUF_839 : STD_LOGIC;
  signal a_15_IBUF_840 : STD_LOGIC;
  signal b_15_IBUF_841 : STD_LOGIC;
  signal sub_IBUF_923 : STD_LOGIC;
  signal acc_0_DXMUX_969 : STD_LOGIC;
  signal acc_0_XORF_967 : STD_LOGIC;
  signal acc_0_CYINIT_966 : STD_LOGIC;
  signal acc_0_CY0F_965 : STD_LOGIC;
  signal acc_0_CYSELF_957 : STD_LOGIC;
  signal acc_0_BXINV_955 : STD_LOGIC;
  signal acc_0_DYMUX_950 : STD_LOGIC;
  signal acc_0_XORG_948 : STD_LOGIC;
  signal acc_0_CYMUXG_947 : STD_LOGIC;
  signal Maccum_acc_cy_0_Q : STD_LOGIC;
  signal acc_0_CY0G_945 : STD_LOGIC;
  signal acc_0_CYSELG_937 : STD_LOGIC;
  signal acc_0_CLKINV_935 : STD_LOGIC;
  signal acc_0_CEINV_934 : STD_LOGIC;
  signal acc_2_DXMUX_1022 : STD_LOGIC;
  signal acc_2_XORF_1020 : STD_LOGIC;
  signal acc_2_CYINIT_1019 : STD_LOGIC;
  signal acc_2_CY0F_1018 : STD_LOGIC;
  signal acc_2_DYMUX_1005 : STD_LOGIC;
  signal acc_2_XORG_1003 : STD_LOGIC;
  signal Maccum_acc_cy_2_Q : STD_LOGIC;
  signal acc_2_CYSELF_1001 : STD_LOGIC;
  signal acc_2_CYMUXFAST_1000 : STD_LOGIC;
  signal acc_2_CYAND_999 : STD_LOGIC;
  signal acc_2_FASTCARRY_998 : STD_LOGIC;
  signal acc_2_CYMUXG2_997 : STD_LOGIC;
  signal acc_2_CYMUXF2_996 : STD_LOGIC;
  signal acc_2_CY0G_995 : STD_LOGIC;
  signal acc_2_CYSELG_987 : STD_LOGIC;
  signal acc_2_CLKINV_985 : STD_LOGIC;
  signal acc_2_CEINV_984 : STD_LOGIC;
  signal acc_4_DXMUX_1075 : STD_LOGIC;
  signal acc_4_XORF_1073 : STD_LOGIC;
  signal acc_4_CYINIT_1072 : STD_LOGIC;
  signal acc_4_CY0F_1071 : STD_LOGIC;
  signal acc_4_DYMUX_1058 : STD_LOGIC;
  signal acc_4_XORG_1056 : STD_LOGIC;
  signal Maccum_acc_cy_4_Q : STD_LOGIC;
  signal acc_4_CYSELF_1054 : STD_LOGIC;
  signal acc_4_CYMUXFAST_1053 : STD_LOGIC;
  signal acc_4_CYAND_1052 : STD_LOGIC;
  signal acc_4_FASTCARRY_1051 : STD_LOGIC;
  signal acc_4_CYMUXG2_1050 : STD_LOGIC;
  signal acc_4_CYMUXF2_1049 : STD_LOGIC;
  signal acc_4_CY0G_1048 : STD_LOGIC;
  signal acc_4_CYSELG_1040 : STD_LOGIC;
  signal acc_4_CLKINV_1038 : STD_LOGIC;
  signal acc_4_CEINV_1037 : STD_LOGIC;
  signal acc_6_DXMUX_1128 : STD_LOGIC;
  signal acc_6_XORF_1126 : STD_LOGIC;
  signal acc_6_CYINIT_1125 : STD_LOGIC;
  signal acc_6_CY0F_1124 : STD_LOGIC;
  signal acc_6_DYMUX_1111 : STD_LOGIC;
  signal acc_6_XORG_1109 : STD_LOGIC;
  signal Maccum_acc_cy_6_Q : STD_LOGIC;
  signal acc_6_CYSELF_1107 : STD_LOGIC;
  signal acc_6_CYMUXFAST_1106 : STD_LOGIC;
  signal acc_6_CYAND_1105 : STD_LOGIC;
  signal acc_6_FASTCARRY_1104 : STD_LOGIC;
  signal acc_6_CYMUXG2_1103 : STD_LOGIC;
  signal acc_6_CYMUXF2_1102 : STD_LOGIC;
  signal acc_6_CY0G_1101 : STD_LOGIC;
  signal acc_6_CYSELG_1093 : STD_LOGIC;
  signal acc_6_CLKINV_1091 : STD_LOGIC;
  signal acc_6_CEINV_1090 : STD_LOGIC;
  signal acc_8_DXMUX_1181 : STD_LOGIC;
  signal acc_8_XORF_1179 : STD_LOGIC;
  signal acc_8_CYINIT_1178 : STD_LOGIC;
  signal acc_8_CY0F_1177 : STD_LOGIC;
  signal acc_8_DYMUX_1164 : STD_LOGIC;
  signal acc_8_XORG_1162 : STD_LOGIC;
  signal Maccum_acc_cy_8_Q : STD_LOGIC;
  signal acc_8_CYSELF_1160 : STD_LOGIC;
  signal acc_8_CYMUXFAST_1159 : STD_LOGIC;
  signal acc_8_CYAND_1158 : STD_LOGIC;
  signal acc_8_FASTCARRY_1157 : STD_LOGIC;
  signal acc_8_CYMUXG2_1156 : STD_LOGIC;
  signal acc_8_CYMUXF2_1155 : STD_LOGIC;
  signal acc_8_CY0G_1154 : STD_LOGIC;
  signal acc_8_CYSELG_1146 : STD_LOGIC;
  signal acc_8_CLKINV_1144 : STD_LOGIC;
  signal acc_8_CEINV_1143 : STD_LOGIC;
  signal acc_10_DXMUX_1226 : STD_LOGIC;
  signal acc_10_XORF_1224 : STD_LOGIC;
  signal acc_10_CYINIT_1223 : STD_LOGIC;
  signal acc_10_CY0F_1222 : STD_LOGIC;
  signal acc_10_CYSELF_1214 : STD_LOGIC;
  signal acc_10_DYMUX_1208 : STD_LOGIC;
  signal acc_10_XORG_1206 : STD_LOGIC;
  signal Maccum_acc_cy_10_Q : STD_LOGIC;
  signal acc_10_CLKINV_1196 : STD_LOGIC;
  signal acc_10_CEINV_1195 : STD_LOGIC;
  signal Mcompar_ltu_cy_1_CYINIT_1260 : STD_LOGIC;
  signal Mcompar_ltu_cy_1_CY0F_1259 : STD_LOGIC;
  signal Mcompar_ltu_cy_1_CYSELF_1251 : STD_LOGIC;
  signal Mcompar_ltu_cy_1_BXINV_1249 : STD_LOGIC;
  signal Mcompar_ltu_cy_1_CYMUXG_1248 : STD_LOGIC;
  signal Mcompar_ltu_cy_1_CY0G_1246 : STD_LOGIC;
  signal Mcompar_ltu_cy_1_CYSELG_1238 : STD_LOGIC;
  signal Mcompar_ltu_cy_3_CY0F_1291 : STD_LOGIC;
  signal Mcompar_ltu_cy_3_CYSELF_1282 : STD_LOGIC;
  signal Mcompar_ltu_cy_3_CYMUXFAST_1281 : STD_LOGIC;
  signal Mcompar_ltu_cy_3_CYAND_1280 : STD_LOGIC;
  signal Mcompar_ltu_cy_3_FASTCARRY_1279 : STD_LOGIC;
  signal Mcompar_ltu_cy_3_CYMUXG2_1278 : STD_LOGIC;
  signal Mcompar_ltu_cy_3_CYMUXF2_1277 : STD_LOGIC;
  signal Mcompar_ltu_cy_3_CY0G_1276 : STD_LOGIC;
  signal Mcompar_ltu_cy_3_CYSELG_1268 : STD_LOGIC;
  signal Mcompar_ltu_cy_5_CY0F_1322 : STD_LOGIC;
  signal Mcompar_ltu_cy_5_CYSELF_1313 : STD_LOGIC;
  signal Mcompar_ltu_cy_5_CYMUXFAST_1312 : STD_LOGIC;
  signal Mcompar_ltu_cy_5_CYAND_1311 : STD_LOGIC;
  signal Mcompar_ltu_cy_5_FASTCARRY_1310 : STD_LOGIC;
  signal Mcompar_ltu_cy_5_CYMUXG2_1309 : STD_LOGIC;
  signal Mcompar_ltu_cy_5_CYMUXF2_1308 : STD_LOGIC;
  signal Mcompar_ltu_cy_5_CY0G_1307 : STD_LOGIC;
  signal Mcompar_ltu_cy_5_CYSELG_1299 : STD_LOGIC;
  signal Mcompar_ltu_cy_7_CY0F_1353 : STD_LOGIC;
  signal Mcompar_ltu_cy_7_CYSELF_1344 : STD_LOGIC;
  signal Mcompar_ltu_cy_7_CYMUXFAST_1343 : STD_LOGIC;
  signal Mcompar_ltu_cy_7_CYAND_1342 : STD_LOGIC;
  signal Mcompar_ltu_cy_7_FASTCARRY_1341 : STD_LOGIC;
  signal Mcompar_ltu_cy_7_CYMUXG2_1340 : STD_LOGIC;
  signal Mcompar_ltu_cy_7_CYMUXF2_1339 : STD_LOGIC;
  signal Mcompar_ltu_cy_7_CY0G_1338 : STD_LOGIC;
  signal Mcompar_ltu_cy_7_CYSELG_1330 : STD_LOGIC;
  signal Mcompar_ltu_cy_9_CY0F_1384 : STD_LOGIC;
  signal Mcompar_ltu_cy_9_CYSELF_1375 : STD_LOGIC;
  signal Mcompar_ltu_cy_9_CYMUXFAST_1374 : STD_LOGIC;
  signal Mcompar_ltu_cy_9_CYAND_1373 : STD_LOGIC;
  signal Mcompar_ltu_cy_9_FASTCARRY_1372 : STD_LOGIC;
  signal Mcompar_ltu_cy_9_CYMUXG2_1371 : STD_LOGIC;
  signal Mcompar_ltu_cy_9_CYMUXF2_1370 : STD_LOGIC;
  signal Mcompar_ltu_cy_9_CY0G_1369 : STD_LOGIC;
  signal Mcompar_ltu_cy_9_CYSELG_1361 : STD_LOGIC;
  signal Mcompar_ltu_cy_11_CY0F_1415 : STD_LOGIC;
  signal Mcompar_ltu_cy_11_CYSELF_1406 : STD_LOGIC;
  signal Mcompar_ltu_cy_11_CYMUXFAST_1405 : STD_LOGIC;
  signal Mcompar_ltu_cy_11_CYAND_1404 : STD_LOGIC;
  signal Mcompar_ltu_cy_11_FASTCARRY_1403 : STD_LOGIC;
  signal Mcompar_ltu_cy_11_CYMUXG2_1402 : STD_LOGIC;
  signal Mcompar_ltu_cy_11_CYMUXF2_1401 : STD_LOGIC;
  signal Mcompar_ltu_cy_11_CY0G_1400 : STD_LOGIC;
  signal Mcompar_ltu_cy_11_CYSELG_1392 : STD_LOGIC;
  signal Mcompar_ltu_cy_13_CY0F_1446 : STD_LOGIC;
  signal Mcompar_ltu_cy_13_CYSELF_1437 : STD_LOGIC;
  signal Mcompar_ltu_cy_13_CYMUXFAST_1436 : STD_LOGIC;
  signal Mcompar_ltu_cy_13_CYAND_1435 : STD_LOGIC;
  signal Mcompar_ltu_cy_13_FASTCARRY_1434 : STD_LOGIC;
  signal Mcompar_ltu_cy_13_CYMUXG2_1433 : STD_LOGIC;
  signal Mcompar_ltu_cy_13_CYMUXF2_1432 : STD_LOGIC;
  signal Mcompar_ltu_cy_13_CY0G_1431 : STD_LOGIC;
  signal Mcompar_ltu_cy_13_CYSELG_1423 : STD_LOGIC;
  signal Mcompar_ltu_cy_15_CY0F_1477 : STD_LOGIC;
  signal Mcompar_ltu_cy_15_CYSELF_1468 : STD_LOGIC;
  signal Mcompar_ltu_cy_15_CYMUXFAST_1467 : STD_LOGIC;
  signal Mcompar_ltu_cy_15_CYAND_1466 : STD_LOGIC;
  signal Mcompar_ltu_cy_15_FASTCARRY_1465 : STD_LOGIC;
  signal Mcompar_ltu_cy_15_CYMUXG2_1464 : STD_LOGIC;
  signal Mcompar_ltu_cy_15_CYMUXF2_1463 : STD_LOGIC;
  signal Mcompar_ltu_cy_15_CY0G_1462 : STD_LOGIC;
  signal Mcompar_ltu_cy_15_CYSELG_1454 : STD_LOGIC;
  signal s_addsub0001_0_XORF_1512 : STD_LOGIC;
  signal s_addsub0001_0_CYINIT_1511 : STD_LOGIC;
  signal s_addsub0001_0_CY0F_1510 : STD_LOGIC;
  signal s_addsub0001_0_CYSELF_1502 : STD_LOGIC;
  signal s_addsub0001_0_XORG_1498 : STD_LOGIC;
  signal s_addsub0001_0_CYMUXG_1497 : STD_LOGIC;
  signal s_addsub0001_0_CY0G_1495 : STD_LOGIC;
  signal s_addsub0001_0_CYSELG_1487 : STD_LOGIC;
  signal s_addsub0001_2_XORF_1551 : STD_LOGIC;
  signal s_addsub0001_2_CYINIT_1550 : STD_LOGIC;
  signal s_addsub0001_2_CY0F_1549 : STD_LOGIC;
  signal s_addsub0001_2_XORG_1539 : STD_LOGIC;
  signal s_addsub0001_2_CYSELF_1537 : STD_LOGIC;
  signal s_addsub0001_2_CYMUXFAST_1536 : STD_LOGIC;
  signal s_addsub0001_2_CYAND_1535 : STD_LOGIC;
  signal s_addsub0001_2_FASTCARRY_1534 : STD_LOGIC;
  signal s_addsub0001_2_CYMUXG2_1533 : STD_LOGIC;
  signal s_addsub0001_2_CYMUXF2_1532 : STD_LOGIC;
  signal s_addsub0001_2_CY0G_1531 : STD_LOGIC;
  signal s_addsub0001_2_CYSELG_1523 : STD_LOGIC;
  signal s_addsub0001_4_XORF_1590 : STD_LOGIC;
  signal s_addsub0001_4_CYINIT_1589 : STD_LOGIC;
  signal s_addsub0001_4_CY0F_1588 : STD_LOGIC;
  signal s_addsub0001_4_XORG_1578 : STD_LOGIC;
  signal s_addsub0001_4_CYSELF_1576 : STD_LOGIC;
  signal s_addsub0001_4_CYMUXFAST_1575 : STD_LOGIC;
  signal s_addsub0001_4_CYAND_1574 : STD_LOGIC;
  signal s_addsub0001_4_FASTCARRY_1573 : STD_LOGIC;
  signal s_addsub0001_4_CYMUXG2_1572 : STD_LOGIC;
  signal s_addsub0001_4_CYMUXF2_1571 : STD_LOGIC;
  signal s_addsub0001_4_CY0G_1570 : STD_LOGIC;
  signal s_addsub0001_4_CYSELG_1562 : STD_LOGIC;
  signal s_addsub0001_6_XORF_1629 : STD_LOGIC;
  signal s_addsub0001_6_CYINIT_1628 : STD_LOGIC;
  signal s_addsub0001_6_CY0F_1627 : STD_LOGIC;
  signal s_addsub0001_6_XORG_1617 : STD_LOGIC;
  signal s_addsub0001_6_CYSELF_1615 : STD_LOGIC;
  signal s_addsub0001_6_CYMUXFAST_1614 : STD_LOGIC;
  signal s_addsub0001_6_CYAND_1613 : STD_LOGIC;
  signal s_addsub0001_6_FASTCARRY_1612 : STD_LOGIC;
  signal s_addsub0001_6_CYMUXG2_1611 : STD_LOGIC;
  signal s_addsub0001_6_CYMUXF2_1610 : STD_LOGIC;
  signal s_addsub0001_6_CY0G_1609 : STD_LOGIC;
  signal s_addsub0001_6_CYSELG_1601 : STD_LOGIC;
  signal s_addsub0001_8_XORF_1668 : STD_LOGIC;
  signal s_addsub0001_8_CYINIT_1667 : STD_LOGIC;
  signal s_addsub0001_8_CY0F_1666 : STD_LOGIC;
  signal s_addsub0001_8_XORG_1656 : STD_LOGIC;
  signal s_addsub0001_8_CYSELF_1654 : STD_LOGIC;
  signal s_addsub0001_8_CYMUXFAST_1653 : STD_LOGIC;
  signal s_addsub0001_8_CYAND_1652 : STD_LOGIC;
  signal s_addsub0001_8_FASTCARRY_1651 : STD_LOGIC;
  signal s_addsub0001_8_CYMUXG2_1650 : STD_LOGIC;
  signal s_addsub0001_8_CYMUXF2_1649 : STD_LOGIC;
  signal s_addsub0001_8_CY0G_1648 : STD_LOGIC;
  signal s_addsub0001_8_CYSELG_1640 : STD_LOGIC;
  signal s_addsub0001_10_XORF_1707 : STD_LOGIC;
  signal s_addsub0001_10_CYINIT_1706 : STD_LOGIC;
  signal s_addsub0001_10_CY0F_1705 : STD_LOGIC;
  signal s_addsub0001_10_XORG_1695 : STD_LOGIC;
  signal s_addsub0001_10_CYSELF_1693 : STD_LOGIC;
  signal s_addsub0001_10_CYMUXFAST_1692 : STD_LOGIC;
  signal s_addsub0001_10_CYAND_1691 : STD_LOGIC;
  signal s_addsub0001_10_FASTCARRY_1690 : STD_LOGIC;
  signal s_addsub0001_10_CYMUXG2_1689 : STD_LOGIC;
  signal s_addsub0001_10_CYMUXF2_1688 : STD_LOGIC;
  signal s_addsub0001_10_CY0G_1687 : STD_LOGIC;
  signal s_addsub0001_10_CYSELG_1679 : STD_LOGIC;
  signal s_addsub0001_12_XORF_1746 : STD_LOGIC;
  signal s_addsub0001_12_CYINIT_1745 : STD_LOGIC;
  signal s_addsub0001_12_CY0F_1744 : STD_LOGIC;
  signal s_addsub0001_12_XORG_1734 : STD_LOGIC;
  signal s_addsub0001_12_CYSELF_1732 : STD_LOGIC;
  signal s_addsub0001_12_CYMUXFAST_1731 : STD_LOGIC;
  signal s_addsub0001_12_CYAND_1730 : STD_LOGIC;
  signal s_addsub0001_12_FASTCARRY_1729 : STD_LOGIC;
  signal s_addsub0001_12_CYMUXG2_1728 : STD_LOGIC;
  signal s_addsub0001_12_CYMUXF2_1727 : STD_LOGIC;
  signal s_addsub0001_12_CY0G_1726 : STD_LOGIC;
  signal s_addsub0001_12_CYSELG_1718 : STD_LOGIC;
  signal s_addsub0001_14_XORF_1785 : STD_LOGIC;
  signal s_addsub0001_14_CYINIT_1784 : STD_LOGIC;
  signal s_addsub0001_14_CY0F_1783 : STD_LOGIC;
  signal s_addsub0001_14_XORG_1773 : STD_LOGIC;
  signal s_addsub0001_14_CYSELF_1771 : STD_LOGIC;
  signal s_addsub0001_14_CYMUXFAST_1770 : STD_LOGIC;
  signal s_addsub0001_14_CYAND_1769 : STD_LOGIC;
  signal s_addsub0001_14_FASTCARRY_1768 : STD_LOGIC;
  signal s_addsub0001_14_CYMUXG2_1767 : STD_LOGIC;
  signal s_addsub0001_14_CYMUXF2_1766 : STD_LOGIC;
  signal s_addsub0001_14_CY0G_1765 : STD_LOGIC;
  signal s_addsub0001_14_CYSELG_1757 : STD_LOGIC;
  signal Mcompar_lts_cy_1_CYINIT_1816 : STD_LOGIC;
  signal Mcompar_lts_cy_1_CY0F_1815 : STD_LOGIC;
  signal Mcompar_lts_cy_1_CYSELF_1807 : STD_LOGIC;
  signal Mcompar_lts_cy_1_BXINV_1805 : STD_LOGIC;
  signal Mcompar_lts_cy_1_CYMUXG_1804 : STD_LOGIC;
  signal Mcompar_lts_cy_1_CY0G_1802 : STD_LOGIC;
  signal Mcompar_lts_cy_1_CYSELG_1794 : STD_LOGIC;
  signal Mcompar_lts_cy_3_CY0F_1847 : STD_LOGIC;
  signal Mcompar_lts_cy_3_CYSELF_1838 : STD_LOGIC;
  signal Mcompar_lts_cy_3_CYMUXFAST_1837 : STD_LOGIC;
  signal Mcompar_lts_cy_3_CYAND_1836 : STD_LOGIC;
  signal Mcompar_lts_cy_3_FASTCARRY_1835 : STD_LOGIC;
  signal Mcompar_lts_cy_3_CYMUXG2_1834 : STD_LOGIC;
  signal Mcompar_lts_cy_3_CYMUXF2_1833 : STD_LOGIC;
  signal Mcompar_lts_cy_3_CY0G_1832 : STD_LOGIC;
  signal Mcompar_lts_cy_3_CYSELG_1824 : STD_LOGIC;
  signal Mcompar_lts_cy_5_CY0F_1878 : STD_LOGIC;
  signal Mcompar_lts_cy_5_CYSELF_1869 : STD_LOGIC;
  signal Mcompar_lts_cy_5_CYMUXFAST_1868 : STD_LOGIC;
  signal Mcompar_lts_cy_5_CYAND_1867 : STD_LOGIC;
  signal Mcompar_lts_cy_5_FASTCARRY_1866 : STD_LOGIC;
  signal Mcompar_lts_cy_5_CYMUXG2_1865 : STD_LOGIC;
  signal Mcompar_lts_cy_5_CYMUXF2_1864 : STD_LOGIC;
  signal Mcompar_lts_cy_5_CY0G_1863 : STD_LOGIC;
  signal Mcompar_lts_cy_5_CYSELG_1855 : STD_LOGIC;
  signal Mcompar_lts_cy_7_CY0F_1909 : STD_LOGIC;
  signal Mcompar_lts_cy_7_CYSELF_1900 : STD_LOGIC;
  signal Mcompar_lts_cy_7_CYMUXFAST_1899 : STD_LOGIC;
  signal Mcompar_lts_cy_7_CYAND_1898 : STD_LOGIC;
  signal Mcompar_lts_cy_7_FASTCARRY_1897 : STD_LOGIC;
  signal Mcompar_lts_cy_7_CYMUXG2_1896 : STD_LOGIC;
  signal Mcompar_lts_cy_7_CYMUXF2_1895 : STD_LOGIC;
  signal Mcompar_lts_cy_7_CY0G_1894 : STD_LOGIC;
  signal Mcompar_lts_cy_7_CYSELG_1886 : STD_LOGIC;
  signal Mcompar_lts_cy_9_CY0F_1940 : STD_LOGIC;
  signal Mcompar_lts_cy_9_CYSELF_1931 : STD_LOGIC;
  signal Mcompar_lts_cy_9_CYMUXFAST_1930 : STD_LOGIC;
  signal Mcompar_lts_cy_9_CYAND_1929 : STD_LOGIC;
  signal Mcompar_lts_cy_9_FASTCARRY_1928 : STD_LOGIC;
  signal Mcompar_lts_cy_9_CYMUXG2_1927 : STD_LOGIC;
  signal Mcompar_lts_cy_9_CYMUXF2_1926 : STD_LOGIC;
  signal Mcompar_lts_cy_9_CY0G_1925 : STD_LOGIC;
  signal Mcompar_lts_cy_9_CYSELG_1917 : STD_LOGIC;
  signal Mcompar_lts_cy_11_CY0F_1971 : STD_LOGIC;
  signal Mcompar_lts_cy_11_CYSELF_1962 : STD_LOGIC;
  signal Mcompar_lts_cy_11_CYMUXFAST_1961 : STD_LOGIC;
  signal Mcompar_lts_cy_11_CYAND_1960 : STD_LOGIC;
  signal Mcompar_lts_cy_11_FASTCARRY_1959 : STD_LOGIC;
  signal Mcompar_lts_cy_11_CYMUXG2_1958 : STD_LOGIC;
  signal Mcompar_lts_cy_11_CYMUXF2_1957 : STD_LOGIC;
  signal Mcompar_lts_cy_11_CY0G_1956 : STD_LOGIC;
  signal Mcompar_lts_cy_11_CYSELG_1948 : STD_LOGIC;
  signal Mcompar_lts_cy_13_CY0F_2002 : STD_LOGIC;
  signal Mcompar_lts_cy_13_CYSELF_1993 : STD_LOGIC;
  signal Mcompar_lts_cy_13_CYMUXFAST_1992 : STD_LOGIC;
  signal Mcompar_lts_cy_13_CYAND_1991 : STD_LOGIC;
  signal Mcompar_lts_cy_13_FASTCARRY_1990 : STD_LOGIC;
  signal Mcompar_lts_cy_13_CYMUXG2_1989 : STD_LOGIC;
  signal Mcompar_lts_cy_13_CYMUXF2_1988 : STD_LOGIC;
  signal Mcompar_lts_cy_13_CY0G_1987 : STD_LOGIC;
  signal Mcompar_lts_cy_13_CYSELG_1979 : STD_LOGIC;
  signal Mcompar_lts_cy_15_CY0F_2033 : STD_LOGIC;
  signal Mcompar_lts_cy_15_CYSELF_2024 : STD_LOGIC;
  signal Mcompar_lts_cy_15_CYMUXFAST_2023 : STD_LOGIC;
  signal Mcompar_lts_cy_15_CYAND_2022 : STD_LOGIC;
  signal Mcompar_lts_cy_15_FASTCARRY_2021 : STD_LOGIC;
  signal Mcompar_lts_cy_15_CYMUXG2_2020 : STD_LOGIC;
  signal Mcompar_lts_cy_15_CYMUXF2_2019 : STD_LOGIC;
  signal Mcompar_lts_cy_15_CY0G_2018 : STD_LOGIC;
  signal Mcompar_lts_cy_15_CYSELG_2010 : STD_LOGIC;
  signal s_addsub0000_0_XORF_2068 : STD_LOGIC;
  signal s_addsub0000_0_CYINIT_2067 : STD_LOGIC;
  signal s_addsub0000_0_CY0F_2066 : STD_LOGIC;
  signal s_addsub0000_0_CYSELF_2058 : STD_LOGIC;
  signal s_addsub0000_0_BXINV_2056 : STD_LOGIC;
  signal s_addsub0000_0_XORG_2054 : STD_LOGIC;
  signal s_addsub0000_0_CYMUXG_2053 : STD_LOGIC;
  signal s_addsub0000_0_CY0G_2051 : STD_LOGIC;
  signal s_addsub0000_0_CYSELG_2043 : STD_LOGIC;
  signal s_addsub0000_2_XORF_2107 : STD_LOGIC;
  signal s_addsub0000_2_CYINIT_2106 : STD_LOGIC;
  signal s_addsub0000_2_CY0F_2105 : STD_LOGIC;
  signal s_addsub0000_2_XORG_2095 : STD_LOGIC;
  signal s_addsub0000_2_CYSELF_2093 : STD_LOGIC;
  signal s_addsub0000_2_CYMUXFAST_2092 : STD_LOGIC;
  signal s_addsub0000_2_CYAND_2091 : STD_LOGIC;
  signal s_addsub0000_2_FASTCARRY_2090 : STD_LOGIC;
  signal s_addsub0000_2_CYMUXG2_2089 : STD_LOGIC;
  signal s_addsub0000_2_CYMUXF2_2088 : STD_LOGIC;
  signal s_addsub0000_2_CY0G_2087 : STD_LOGIC;
  signal s_addsub0000_2_CYSELG_2079 : STD_LOGIC;
  signal s_addsub0000_4_XORF_2146 : STD_LOGIC;
  signal s_addsub0000_4_CYINIT_2145 : STD_LOGIC;
  signal s_addsub0000_4_CY0F_2144 : STD_LOGIC;
  signal s_addsub0000_4_XORG_2134 : STD_LOGIC;
  signal s_addsub0000_4_CYSELF_2132 : STD_LOGIC;
  signal s_addsub0000_4_CYMUXFAST_2131 : STD_LOGIC;
  signal s_addsub0000_4_CYAND_2130 : STD_LOGIC;
  signal s_addsub0000_4_FASTCARRY_2129 : STD_LOGIC;
  signal s_addsub0000_4_CYMUXG2_2128 : STD_LOGIC;
  signal s_addsub0000_4_CYMUXF2_2127 : STD_LOGIC;
  signal s_addsub0000_4_CY0G_2126 : STD_LOGIC;
  signal s_addsub0000_4_CYSELG_2118 : STD_LOGIC;
  signal s_addsub0000_6_XORF_2185 : STD_LOGIC;
  signal s_addsub0000_6_CYINIT_2184 : STD_LOGIC;
  signal s_addsub0000_6_CY0F_2183 : STD_LOGIC;
  signal s_addsub0000_6_XORG_2173 : STD_LOGIC;
  signal s_addsub0000_6_CYSELF_2171 : STD_LOGIC;
  signal s_addsub0000_6_CYMUXFAST_2170 : STD_LOGIC;
  signal s_addsub0000_6_CYAND_2169 : STD_LOGIC;
  signal s_addsub0000_6_FASTCARRY_2168 : STD_LOGIC;
  signal s_addsub0000_6_CYMUXG2_2167 : STD_LOGIC;
  signal s_addsub0000_6_CYMUXF2_2166 : STD_LOGIC;
  signal s_addsub0000_6_CY0G_2165 : STD_LOGIC;
  signal s_addsub0000_6_CYSELG_2157 : STD_LOGIC;
  signal s_addsub0000_8_XORF_2224 : STD_LOGIC;
  signal s_addsub0000_8_CYINIT_2223 : STD_LOGIC;
  signal s_addsub0000_8_CY0F_2222 : STD_LOGIC;
  signal s_addsub0000_8_XORG_2212 : STD_LOGIC;
  signal s_addsub0000_8_CYSELF_2210 : STD_LOGIC;
  signal s_addsub0000_8_CYMUXFAST_2209 : STD_LOGIC;
  signal s_addsub0000_8_CYAND_2208 : STD_LOGIC;
  signal s_addsub0000_8_FASTCARRY_2207 : STD_LOGIC;
  signal s_addsub0000_8_CYMUXG2_2206 : STD_LOGIC;
  signal s_addsub0000_8_CYMUXF2_2205 : STD_LOGIC;
  signal s_addsub0000_8_CY0G_2204 : STD_LOGIC;
  signal s_addsub0000_8_CYSELG_2196 : STD_LOGIC;
  signal s_addsub0000_10_XORF_2263 : STD_LOGIC;
  signal s_addsub0000_10_CYINIT_2262 : STD_LOGIC;
  signal s_addsub0000_10_CY0F_2261 : STD_LOGIC;
  signal s_addsub0000_10_XORG_2251 : STD_LOGIC;
  signal s_addsub0000_10_CYSELF_2249 : STD_LOGIC;
  signal s_addsub0000_10_CYMUXFAST_2248 : STD_LOGIC;
  signal s_addsub0000_10_CYAND_2247 : STD_LOGIC;
  signal s_addsub0000_10_FASTCARRY_2246 : STD_LOGIC;
  signal s_addsub0000_10_CYMUXG2_2245 : STD_LOGIC;
  signal s_addsub0000_10_CYMUXF2_2244 : STD_LOGIC;
  signal s_addsub0000_10_CY0G_2243 : STD_LOGIC;
  signal s_addsub0000_10_CYSELG_2235 : STD_LOGIC;
  signal s_addsub0000_12_XORF_2302 : STD_LOGIC;
  signal s_addsub0000_12_CYINIT_2301 : STD_LOGIC;
  signal s_addsub0000_12_CY0F_2300 : STD_LOGIC;
  signal s_addsub0000_12_XORG_2290 : STD_LOGIC;
  signal s_addsub0000_12_CYSELF_2288 : STD_LOGIC;
  signal s_addsub0000_12_CYMUXFAST_2287 : STD_LOGIC;
  signal s_addsub0000_12_CYAND_2286 : STD_LOGIC;
  signal s_addsub0000_12_FASTCARRY_2285 : STD_LOGIC;
  signal s_addsub0000_12_CYMUXG2_2284 : STD_LOGIC;
  signal s_addsub0000_12_CYMUXF2_2283 : STD_LOGIC;
  signal s_addsub0000_12_CY0G_2282 : STD_LOGIC;
  signal s_addsub0000_12_CYSELG_2274 : STD_LOGIC;
  signal s_addsub0000_14_XORF_2341 : STD_LOGIC;
  signal s_addsub0000_14_CYINIT_2340 : STD_LOGIC;
  signal s_addsub0000_14_CY0F_2339 : STD_LOGIC;
  signal s_addsub0000_14_XORG_2329 : STD_LOGIC;
  signal s_addsub0000_14_CYSELF_2327 : STD_LOGIC;
  signal s_addsub0000_14_CYMUXFAST_2326 : STD_LOGIC;
  signal s_addsub0000_14_CYAND_2325 : STD_LOGIC;
  signal s_addsub0000_14_FASTCARRY_2324 : STD_LOGIC;
  signal s_addsub0000_14_CYMUXG2_2323 : STD_LOGIC;
  signal s_addsub0000_14_CYMUXF2_2322 : STD_LOGIC;
  signal s_addsub0000_14_CY0G_2321 : STD_LOGIC;
  signal s_addsub0000_14_CYSELG_2313 : STD_LOGIC;
  signal Mcompar_eq_cy_1_CYINIT_2386 : STD_LOGIC;
  signal Mcompar_eq_cy_1_CYSELF_2380 : STD_LOGIC;
  signal Mcompar_eq_cy_1_BXINV_2378 : STD_LOGIC;
  signal Mcompar_eq_cy_1_CYMUXG_2377 : STD_LOGIC;
  signal Mcompar_eq_cy_1_LOGIC_ZERO_2375 : STD_LOGIC;
  signal Mcompar_eq_cy_1_CYSELG_2369 : STD_LOGIC;
  signal Mcompar_eq_cy_3_CYSELF_2410 : STD_LOGIC;
  signal Mcompar_eq_cy_3_CYMUXFAST_2409 : STD_LOGIC;
  signal Mcompar_eq_cy_3_CYAND_2408 : STD_LOGIC;
  signal Mcompar_eq_cy_3_FASTCARRY_2407 : STD_LOGIC;
  signal Mcompar_eq_cy_3_CYMUXG2_2406 : STD_LOGIC;
  signal Mcompar_eq_cy_3_CYMUXF2_2405 : STD_LOGIC;
  signal Mcompar_eq_cy_3_LOGIC_ZERO_2404 : STD_LOGIC;
  signal Mcompar_eq_cy_3_CYSELG_2398 : STD_LOGIC;
  signal Mcompar_eq_cy_5_CYSELF_2440 : STD_LOGIC;
  signal Mcompar_eq_cy_5_CYMUXFAST_2439 : STD_LOGIC;
  signal Mcompar_eq_cy_5_CYAND_2438 : STD_LOGIC;
  signal Mcompar_eq_cy_5_FASTCARRY_2437 : STD_LOGIC;
  signal Mcompar_eq_cy_5_CYMUXG2_2436 : STD_LOGIC;
  signal Mcompar_eq_cy_5_CYMUXF2_2435 : STD_LOGIC;
  signal Mcompar_eq_cy_5_LOGIC_ZERO_2434 : STD_LOGIC;
  signal Mcompar_eq_cy_5_CYSELG_2428 : STD_LOGIC;
  signal eq_OBUF_CYSELF_2470 : STD_LOGIC;
  signal eq_OBUF_CYMUXFAST_2469 : STD_LOGIC;
  signal eq_OBUF_CYAND_2468 : STD_LOGIC;
  signal eq_OBUF_FASTCARRY_2467 : STD_LOGIC;
  signal eq_OBUF_CYMUXG2_2466 : STD_LOGIC;
  signal eq_OBUF_CYMUXF2_2465 : STD_LOGIC;
  signal eq_OBUF_LOGIC_ZERO_2464 : STD_LOGIC;
  signal eq_OBUF_CYSELG_2458 : STD_LOGIC;
  signal s_0_O : STD_LOGIC;
  signal s_0_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_0_2491 : STD_LOGIC;
  signal s_0_OUTPUT_OTCLK1INV_2485 : STD_LOGIC;
  signal s_1_O : STD_LOGIC;
  signal s_1_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_1_2508 : STD_LOGIC;
  signal s_1_OUTPUT_OTCLK1INV_2502 : STD_LOGIC;
  signal s_2_O : STD_LOGIC;
  signal s_2_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_2_2525 : STD_LOGIC;
  signal s_2_OUTPUT_OTCLK1INV_2519 : STD_LOGIC;
  signal cin_INBUF : STD_LOGIC;
  signal s_3_O : STD_LOGIC;
  signal s_3_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_3_2548 : STD_LOGIC;
  signal s_3_OUTPUT_OTCLK1INV_2542 : STD_LOGIC;
  signal acc_en_INBUF : STD_LOGIC;
  signal eq_O : STD_LOGIC;
  signal clk_INBUF : STD_LOGIC;
  signal s_4_O : STD_LOGIC;
  signal s_4_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_4_2585 : STD_LOGIC;
  signal s_4_OUTPUT_OTCLK1INV_2579 : STD_LOGIC;
  signal s_5_O : STD_LOGIC;
  signal s_5_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_5_2602 : STD_LOGIC;
  signal s_5_OUTPUT_OTCLK1INV_2596 : STD_LOGIC;
  signal s_6_O : STD_LOGIC;
  signal s_6_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_6_2619 : STD_LOGIC;
  signal s_6_OUTPUT_OTCLK1INV_2613 : STD_LOGIC;
  signal s_7_O : STD_LOGIC;
  signal s_7_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_7_2636 : STD_LOGIC;
  signal s_7_OUTPUT_OTCLK1INV_2630 : STD_LOGIC;
  signal acc_0_O : STD_LOGIC;
  signal s_8_O : STD_LOGIC;
  signal s_8_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_8_2661 : STD_LOGIC;
  signal s_8_OUTPUT_OTCLK1INV_2655 : STD_LOGIC;
  signal acc_1_O : STD_LOGIC;
  signal s_9_O : STD_LOGIC;
  signal s_9_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_9_2686 : STD_LOGIC;
  signal s_9_OUTPUT_OTCLK1INV_2680 : STD_LOGIC;
  signal acc_2_O : STD_LOGIC;
  signal acc_3_O : STD_LOGIC;
  signal acc_4_O : STD_LOGIC;
  signal acc_5_O : STD_LOGIC;
  signal acc_6_O : STD_LOGIC;
  signal acc_7_O : STD_LOGIC;
  signal acc_8_O : STD_LOGIC;
  signal acc_9_O : STD_LOGIC;
  signal s_10_O : STD_LOGIC;
  signal s_10_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_10_2767 : STD_LOGIC;
  signal s_10_OUTPUT_OTCLK1INV_2761 : STD_LOGIC;
  signal s_11_O : STD_LOGIC;
  signal s_11_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_11_2784 : STD_LOGIC;
  signal s_11_OUTPUT_OTCLK1INV_2778 : STD_LOGIC;
  signal s_12_O : STD_LOGIC;
  signal s_12_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_12_2801 : STD_LOGIC;
  signal s_12_OUTPUT_OTCLK1INV_2795 : STD_LOGIC;
  signal s_13_O : STD_LOGIC;
  signal s_13_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_13_2818 : STD_LOGIC;
  signal s_13_OUTPUT_OTCLK1INV_2812 : STD_LOGIC;
  signal s_14_O : STD_LOGIC;
  signal s_14_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_14_2835 : STD_LOGIC;
  signal s_14_OUTPUT_OTCLK1INV_2829 : STD_LOGIC;
  signal s_15_O : STD_LOGIC;
  signal s_15_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_15_2852 : STD_LOGIC;
  signal s_15_OUTPUT_OTCLK1INV_2846 : STD_LOGIC;
  signal s_16_O : STD_LOGIC;
  signal s_16_OUTPUT_OFF_ODDRIN1_MUX : STD_LOGIC;
  signal s_16_2869 : STD_LOGIC;
  signal s_16_OUTPUT_OTCLK1INV_2863 : STD_LOGIC;
  signal a_10_INBUF : STD_LOGIC;
  signal a_0_INBUF : STD_LOGIC;
  signal a_1_INBUF : STD_LOGIC;
  signal a_11_INBUF : STD_LOGIC;
  signal a_2_INBUF : STD_LOGIC;
  signal a_12_INBUF : STD_LOGIC;
  signal a_3_INBUF : STD_LOGIC;
  signal a_13_INBUF : STD_LOGIC;
  signal b_0_INBUF : STD_LOGIC;
  signal a_4_INBUF : STD_LOGIC;
  signal a_14_INBUF : STD_LOGIC;
  signal lts_O : STD_LOGIC;
  signal b_1_INBUF : STD_LOGIC;
  signal a_5_INBUF : STD_LOGIC;
  signal a_15_INBUF : STD_LOGIC;
  signal ltu_O : STD_LOGIC;
  signal b_2_INBUF : STD_LOGIC;
  signal a_6_INBUF : STD_LOGIC;
  signal b_3_INBUF : STD_LOGIC;
  signal a_7_INBUF : STD_LOGIC;
  signal acc_10_O : STD_LOGIC;
  signal b_4_INBUF : STD_LOGIC;
  signal b_10_INBUF : STD_LOGIC;
  signal a_8_INBUF : STD_LOGIC;
  signal acc_11_O : STD_LOGIC;
  signal b_5_INBUF : STD_LOGIC;
  signal b_11_INBUF : STD_LOGIC;
  signal a_9_INBUF : STD_LOGIC;
  signal b_6_INBUF : STD_LOGIC;
  signal b_12_INBUF : STD_LOGIC;
  signal sub_INBUF : STD_LOGIC;
  signal b_7_INBUF : STD_LOGIC;
  signal b_13_INBUF : STD_LOGIC;
  signal b_8_INBUF : STD_LOGIC;
  signal b_14_INBUF : STD_LOGIC;
  signal b_9_INBUF : STD_LOGIC;
  signal b_15_INBUF : STD_LOGIC;
  signal clk_BUFGP_BUFG_S_INVNOT : STD_LOGIC;
  signal clk_BUFGP_BUFG_I0_INV : STD_LOGIC;
  signal s_addsub0000_16_XORF_2356 : STD_LOGIC;
  signal s_addsub0000_16_CYINIT_2355 : STD_LOGIC;
  signal s_addsub0000_16_F : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal s_addsub0001 : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal Madd_s_addsub0001_cy : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal s_addsub0000 : STD_LOGIC_VECTOR ( 16 downto 0 );
  signal Msub_s_addsub0000_cy : STD_LOGIC_VECTOR ( 14 downto 0 );
  signal Maccum_acc_lut : STD_LOGIC_VECTOR ( 11 downto 0 );
  signal Mcompar_ltu_lut : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal Mcompar_ltu_cy : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal Madd_s_addsub0001_lut : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal Mcompar_lts_lut : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal Mcompar_lts_cy : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal Msub_s_addsub0000_lut : STD_LOGIC_VECTOR ( 15 downto 0 );
  signal Mcompar_eq_lut : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal Mcompar_eq_cy : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal s_mux0000 : STD_LOGIC_VECTOR ( 16 downto 0 );
begin
  acc_0_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_0_XORF_967,
      O => acc_0_DXMUX_969
    );
  acc_0_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X51Y36"
    )
    port map (
      I0 => acc_0_CYINIT_966,
      I1 => Maccum_acc_lut(0),
      O => acc_0_XORF_967
    );
  acc_0_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X51Y36"
    )
    port map (
      IA => acc_0_CY0F_965,
      IB => acc_0_CYINIT_966,
      SEL => acc_0_CYSELF_957,
      O => Maccum_acc_cy_0_Q
    );
  acc_0_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X51Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_0_BXINV_955,
      O => acc_0_CYINIT_966
    );
  acc_0_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X51Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_0_785,
      O => acc_0_CY0F_965
    );
  acc_0_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X51Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_lut(0),
      O => acc_0_CYSELF_957
    );
  acc_0_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => '0',
      O => acc_0_BXINV_955
    );
  acc_0_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_0_XORG_948,
      O => acc_0_DYMUX_950
    );
  acc_0_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X51Y36"
    )
    port map (
      I0 => Maccum_acc_cy_0_Q,
      I1 => Maccum_acc_lut(1),
      O => acc_0_XORG_948
    );
  acc_0_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X51Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_0_CYMUXG_947,
      O => Maccum_acc_cy_1_Q
    );
  acc_0_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X51Y36"
    )
    port map (
      IA => acc_0_CY0G_945,
      IB => Maccum_acc_cy_0_Q,
      SEL => acc_0_CYSELG_937,
      O => acc_0_CYMUXG_947
    );
  acc_0_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X51Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_1_787,
      O => acc_0_CY0G_945
    );
  acc_0_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X51Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_lut(1),
      O => acc_0_CYSELG_937
    );
  acc_0_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => acc_0_CLKINV_935
    );
  acc_0_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_en_IBUF_783,
      O => acc_0_CEINV_934
    );
  Maccum_acc_lut_1_Q : X_LUT4
    generic map(
      INIT => X"5A5A",
      LOC => "SLICE_X51Y36"
    )
    port map (
      ADR0 => acc_1_787,
      ADR1 => VCC,
      ADR2 => a_1_IBUF_788,
      ADR3 => VCC,
      O => Maccum_acc_lut(1)
    );
  acc_2_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_2_XORF_1020,
      O => acc_2_DXMUX_1022
    );
  acc_2_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X51Y37"
    )
    port map (
      I0 => acc_2_CYINIT_1019,
      I1 => Maccum_acc_lut(2),
      O => acc_2_XORF_1020
    );
  acc_2_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X51Y37"
    )
    port map (
      IA => acc_2_CY0F_1018,
      IB => acc_2_CYINIT_1019,
      SEL => acc_2_CYSELF_1001,
      O => Maccum_acc_cy_2_Q
    );
  acc_2_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X51Y37"
    )
    port map (
      IA => acc_2_CY0F_1018,
      IB => acc_2_CY0F_1018,
      SEL => acc_2_CYSELF_1001,
      O => acc_2_CYMUXF2_996
    );
  acc_2_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X51Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_cy_1_Q,
      O => acc_2_CYINIT_1019
    );
  acc_2_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X51Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_2_790,
      O => acc_2_CY0F_1018
    );
  acc_2_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X51Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_lut(2),
      O => acc_2_CYSELF_1001
    );
  acc_2_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_2_XORG_1003,
      O => acc_2_DYMUX_1005
    );
  acc_2_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X51Y37"
    )
    port map (
      I0 => Maccum_acc_cy_2_Q,
      I1 => Maccum_acc_lut(3),
      O => acc_2_XORG_1003
    );
  acc_2_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X51Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_2_CYMUXFAST_1000,
      O => Maccum_acc_cy_3_Q
    );
  acc_2_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X51Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_cy_1_Q,
      O => acc_2_FASTCARRY_998
    );
  acc_2_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X51Y37"
    )
    port map (
      I0 => acc_2_CYSELG_987,
      I1 => acc_2_CYSELF_1001,
      O => acc_2_CYAND_999
    );
  acc_2_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X51Y37"
    )
    port map (
      IA => acc_2_CYMUXG2_997,
      IB => acc_2_FASTCARRY_998,
      SEL => acc_2_CYAND_999,
      O => acc_2_CYMUXFAST_1000
    );
  acc_2_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X51Y37"
    )
    port map (
      IA => acc_2_CY0G_995,
      IB => acc_2_CYMUXF2_996,
      SEL => acc_2_CYSELG_987,
      O => acc_2_CYMUXG2_997
    );
  acc_2_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X51Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_3_792,
      O => acc_2_CY0G_995
    );
  acc_2_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X51Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_lut(3),
      O => acc_2_CYSELG_987
    );
  acc_2_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => acc_2_CLKINV_985
    );
  acc_2_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_en_IBUF_783,
      O => acc_2_CEINV_984
    );
  Maccum_acc_lut_3_Q : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X51Y37"
    )
    port map (
      ADR0 => acc_3_792,
      ADR1 => a_3_IBUF_793,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Maccum_acc_lut(3)
    );
  acc_4_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_4_XORF_1073,
      O => acc_4_DXMUX_1075
    );
  acc_4_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X51Y38"
    )
    port map (
      I0 => acc_4_CYINIT_1072,
      I1 => Maccum_acc_lut(4),
      O => acc_4_XORF_1073
    );
  acc_4_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X51Y38"
    )
    port map (
      IA => acc_4_CY0F_1071,
      IB => acc_4_CYINIT_1072,
      SEL => acc_4_CYSELF_1054,
      O => Maccum_acc_cy_4_Q
    );
  acc_4_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X51Y38"
    )
    port map (
      IA => acc_4_CY0F_1071,
      IB => acc_4_CY0F_1071,
      SEL => acc_4_CYSELF_1054,
      O => acc_4_CYMUXF2_1049
    );
  acc_4_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X51Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_cy_3_Q,
      O => acc_4_CYINIT_1072
    );
  acc_4_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X51Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_4_795,
      O => acc_4_CY0F_1071
    );
  acc_4_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X51Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_lut(4),
      O => acc_4_CYSELF_1054
    );
  acc_4_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_4_XORG_1056,
      O => acc_4_DYMUX_1058
    );
  acc_4_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X51Y38"
    )
    port map (
      I0 => Maccum_acc_cy_4_Q,
      I1 => Maccum_acc_lut(5),
      O => acc_4_XORG_1056
    );
  acc_4_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X51Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_4_CYMUXFAST_1053,
      O => Maccum_acc_cy_5_Q
    );
  acc_4_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X51Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_cy_3_Q,
      O => acc_4_FASTCARRY_1051
    );
  acc_4_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X51Y38"
    )
    port map (
      I0 => acc_4_CYSELG_1040,
      I1 => acc_4_CYSELF_1054,
      O => acc_4_CYAND_1052
    );
  acc_4_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X51Y38"
    )
    port map (
      IA => acc_4_CYMUXG2_1050,
      IB => acc_4_FASTCARRY_1051,
      SEL => acc_4_CYAND_1052,
      O => acc_4_CYMUXFAST_1053
    );
  acc_4_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X51Y38"
    )
    port map (
      IA => acc_4_CY0G_1048,
      IB => acc_4_CYMUXF2_1049,
      SEL => acc_4_CYSELG_1040,
      O => acc_4_CYMUXG2_1050
    );
  acc_4_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X51Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_5_797,
      O => acc_4_CY0G_1048
    );
  acc_4_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X51Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_lut(5),
      O => acc_4_CYSELG_1040
    );
  acc_4_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => acc_4_CLKINV_1038
    );
  acc_4_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_en_IBUF_783,
      O => acc_4_CEINV_1037
    );
  Maccum_acc_lut_5_Q : X_LUT4
    generic map(
      INIT => X"33CC",
      LOC => "SLICE_X51Y38"
    )
    port map (
      ADR0 => VCC,
      ADR1 => acc_5_797,
      ADR2 => VCC,
      ADR3 => a_5_IBUF_798,
      O => Maccum_acc_lut(5)
    );
  acc_6_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_6_XORF_1126,
      O => acc_6_DXMUX_1128
    );
  acc_6_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X51Y39"
    )
    port map (
      I0 => acc_6_CYINIT_1125,
      I1 => Maccum_acc_lut(6),
      O => acc_6_XORF_1126
    );
  acc_6_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X51Y39"
    )
    port map (
      IA => acc_6_CY0F_1124,
      IB => acc_6_CYINIT_1125,
      SEL => acc_6_CYSELF_1107,
      O => Maccum_acc_cy_6_Q
    );
  acc_6_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X51Y39"
    )
    port map (
      IA => acc_6_CY0F_1124,
      IB => acc_6_CY0F_1124,
      SEL => acc_6_CYSELF_1107,
      O => acc_6_CYMUXF2_1102
    );
  acc_6_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X51Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_cy_5_Q,
      O => acc_6_CYINIT_1125
    );
  acc_6_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X51Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_6_800,
      O => acc_6_CY0F_1124
    );
  acc_6_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X51Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_lut(6),
      O => acc_6_CYSELF_1107
    );
  acc_6_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_6_XORG_1109,
      O => acc_6_DYMUX_1111
    );
  acc_6_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X51Y39"
    )
    port map (
      I0 => Maccum_acc_cy_6_Q,
      I1 => Maccum_acc_lut(7),
      O => acc_6_XORG_1109
    );
  acc_6_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X51Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_6_CYMUXFAST_1106,
      O => Maccum_acc_cy_7_Q
    );
  acc_6_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X51Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_cy_5_Q,
      O => acc_6_FASTCARRY_1104
    );
  acc_6_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X51Y39"
    )
    port map (
      I0 => acc_6_CYSELG_1093,
      I1 => acc_6_CYSELF_1107,
      O => acc_6_CYAND_1105
    );
  acc_6_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X51Y39"
    )
    port map (
      IA => acc_6_CYMUXG2_1103,
      IB => acc_6_FASTCARRY_1104,
      SEL => acc_6_CYAND_1105,
      O => acc_6_CYMUXFAST_1106
    );
  acc_6_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X51Y39"
    )
    port map (
      IA => acc_6_CY0G_1101,
      IB => acc_6_CYMUXF2_1102,
      SEL => acc_6_CYSELG_1093,
      O => acc_6_CYMUXG2_1103
    );
  acc_6_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X51Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_7_802,
      O => acc_6_CY0G_1101
    );
  acc_6_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X51Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_lut(7),
      O => acc_6_CYSELG_1093
    );
  acc_6_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => acc_6_CLKINV_1091
    );
  acc_6_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_en_IBUF_783,
      O => acc_6_CEINV_1090
    );
  Maccum_acc_lut_7_Q : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X51Y39"
    )
    port map (
      ADR0 => acc_7_802,
      ADR1 => a_7_IBUF_803,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Maccum_acc_lut(7)
    );
  acc_8_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_8_XORF_1179,
      O => acc_8_DXMUX_1181
    );
  acc_8_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X51Y40"
    )
    port map (
      I0 => acc_8_CYINIT_1178,
      I1 => Maccum_acc_lut(8),
      O => acc_8_XORF_1179
    );
  acc_8_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X51Y40"
    )
    port map (
      IA => acc_8_CY0F_1177,
      IB => acc_8_CYINIT_1178,
      SEL => acc_8_CYSELF_1160,
      O => Maccum_acc_cy_8_Q
    );
  acc_8_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X51Y40"
    )
    port map (
      IA => acc_8_CY0F_1177,
      IB => acc_8_CY0F_1177,
      SEL => acc_8_CYSELF_1160,
      O => acc_8_CYMUXF2_1155
    );
  acc_8_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X51Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_cy_7_Q,
      O => acc_8_CYINIT_1178
    );
  acc_8_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X51Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_8_805,
      O => acc_8_CY0F_1177
    );
  acc_8_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X51Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_lut(8),
      O => acc_8_CYSELF_1160
    );
  acc_8_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_8_XORG_1162,
      O => acc_8_DYMUX_1164
    );
  acc_8_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X51Y40"
    )
    port map (
      I0 => Maccum_acc_cy_8_Q,
      I1 => Maccum_acc_lut(9),
      O => acc_8_XORG_1162
    );
  acc_8_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X51Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_cy_7_Q,
      O => acc_8_FASTCARRY_1157
    );
  acc_8_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X51Y40"
    )
    port map (
      I0 => acc_8_CYSELG_1146,
      I1 => acc_8_CYSELF_1160,
      O => acc_8_CYAND_1158
    );
  acc_8_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X51Y40"
    )
    port map (
      IA => acc_8_CYMUXG2_1156,
      IB => acc_8_FASTCARRY_1157,
      SEL => acc_8_CYAND_1158,
      O => acc_8_CYMUXFAST_1159
    );
  acc_8_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X51Y40"
    )
    port map (
      IA => acc_8_CY0G_1154,
      IB => acc_8_CYMUXF2_1155,
      SEL => acc_8_CYSELG_1146,
      O => acc_8_CYMUXG2_1156
    );
  acc_8_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X51Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_9_807,
      O => acc_8_CY0G_1154
    );
  acc_8_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X51Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_lut(9),
      O => acc_8_CYSELG_1146
    );
  acc_8_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => acc_8_CLKINV_1144
    );
  acc_8_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_en_IBUF_783,
      O => acc_8_CEINV_1143
    );
  Maccum_acc_lut_9_Q : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X51Y40"
    )
    port map (
      ADR0 => a_9_IBUF_808,
      ADR1 => acc_9_807,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Maccum_acc_lut(9)
    );
  acc_10_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_10_XORF_1224,
      O => acc_10_DXMUX_1226
    );
  acc_10_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X51Y41"
    )
    port map (
      I0 => acc_10_CYINIT_1223,
      I1 => Maccum_acc_lut(10),
      O => acc_10_XORF_1224
    );
  acc_10_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X51Y41"
    )
    port map (
      IA => acc_10_CY0F_1222,
      IB => acc_10_CYINIT_1223,
      SEL => acc_10_CYSELF_1214,
      O => Maccum_acc_cy_10_Q
    );
  acc_10_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X51Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_8_CYMUXFAST_1159,
      O => acc_10_CYINIT_1223
    );
  acc_10_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X51Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_10_810,
      O => acc_10_CY0F_1222
    );
  acc_10_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X51Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => Maccum_acc_lut(10),
      O => acc_10_CYSELF_1214
    );
  acc_10_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X51Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_10_XORG_1206,
      O => acc_10_DYMUX_1208
    );
  acc_10_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X51Y41"
    )
    port map (
      I0 => Maccum_acc_cy_10_Q,
      I1 => Maccum_acc_lut(11),
      O => acc_10_XORG_1206
    );
  acc_10_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => acc_10_CLKINV_1196
    );
  acc_10_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X51Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_en_IBUF_783,
      O => acc_10_CEINV_1195
    );
  Maccum_acc_lut_11_Q : X_LUT4
    generic map(
      INIT => X"0FF0",
      LOC => "SLICE_X51Y41"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => a_11_IBUF_813,
      ADR3 => acc_11_812,
      O => Maccum_acc_lut(11)
    );
  Mcompar_ltu_cy_1_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X35Y7"
    )
    port map (
      IA => Mcompar_ltu_cy_1_CY0F_1259,
      IB => Mcompar_ltu_cy_1_CYINIT_1260,
      SEL => Mcompar_ltu_cy_1_CYSELF_1251,
      O => Mcompar_ltu_cy(0)
    );
  Mcompar_ltu_cy_1_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X35Y7",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_cy_1_BXINV_1249,
      O => Mcompar_ltu_cy_1_CYINIT_1260
    );
  Mcompar_ltu_cy_1_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X35Y7",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_786,
      O => Mcompar_ltu_cy_1_CY0F_1259
    );
  Mcompar_ltu_cy_1_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y7",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(0),
      O => Mcompar_ltu_cy_1_CYSELF_1251
    );
  Mcompar_ltu_cy_1_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X35Y7",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => Mcompar_ltu_cy_1_BXINV_1249
    );
  Mcompar_ltu_cy_1_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X35Y7"
    )
    port map (
      IA => Mcompar_ltu_cy_1_CY0G_1246,
      IB => Mcompar_ltu_cy(0),
      SEL => Mcompar_ltu_cy_1_CYSELG_1238,
      O => Mcompar_ltu_cy_1_CYMUXG_1248
    );
  Mcompar_ltu_cy_1_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X35Y7",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_788,
      O => Mcompar_ltu_cy_1_CY0G_1246
    );
  Mcompar_ltu_cy_1_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X35Y7",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(1),
      O => Mcompar_ltu_cy_1_CYSELG_1238
    );
  Mcompar_ltu_lut_1_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X35Y7"
    )
    port map (
      ADR0 => a_1_IBUF_788,
      ADR1 => b_1_IBUF_816,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(1)
    );
  Mcompar_ltu_cy_3_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y8"
    )
    port map (
      IA => Mcompar_ltu_cy_3_CY0F_1291,
      IB => Mcompar_ltu_cy_3_CY0F_1291,
      SEL => Mcompar_ltu_cy_3_CYSELF_1282,
      O => Mcompar_ltu_cy_3_CYMUXF2_1277
    );
  Mcompar_ltu_cy_3_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X35Y8",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_791,
      O => Mcompar_ltu_cy_3_CY0F_1291
    );
  Mcompar_ltu_cy_3_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y8",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(2),
      O => Mcompar_ltu_cy_3_CYSELF_1282
    );
  Mcompar_ltu_cy_3_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X35Y8",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_cy_1_CYMUXG_1248,
      O => Mcompar_ltu_cy_3_FASTCARRY_1279
    );
  Mcompar_ltu_cy_3_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X35Y8"
    )
    port map (
      I0 => Mcompar_ltu_cy_3_CYSELG_1268,
      I1 => Mcompar_ltu_cy_3_CYSELF_1282,
      O => Mcompar_ltu_cy_3_CYAND_1280
    );
  Mcompar_ltu_cy_3_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X35Y8"
    )
    port map (
      IA => Mcompar_ltu_cy_3_CYMUXG2_1278,
      IB => Mcompar_ltu_cy_3_FASTCARRY_1279,
      SEL => Mcompar_ltu_cy_3_CYAND_1280,
      O => Mcompar_ltu_cy_3_CYMUXFAST_1281
    );
  Mcompar_ltu_cy_3_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y8"
    )
    port map (
      IA => Mcompar_ltu_cy_3_CY0G_1276,
      IB => Mcompar_ltu_cy_3_CYMUXF2_1277,
      SEL => Mcompar_ltu_cy_3_CYSELG_1268,
      O => Mcompar_ltu_cy_3_CYMUXG2_1278
    );
  Mcompar_ltu_cy_3_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X35Y8",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_793,
      O => Mcompar_ltu_cy_3_CY0G_1276
    );
  Mcompar_ltu_cy_3_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X35Y8",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(3),
      O => Mcompar_ltu_cy_3_CYSELG_1268
    );
  Mcompar_ltu_lut_3_Q : X_LUT4
    generic map(
      INIT => X"A5A5",
      LOC => "SLICE_X35Y8"
    )
    port map (
      ADR0 => a_3_IBUF_793,
      ADR1 => VCC,
      ADR2 => b_3_IBUF_819,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(3)
    );
  Mcompar_ltu_cy_5_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y9"
    )
    port map (
      IA => Mcompar_ltu_cy_5_CY0F_1322,
      IB => Mcompar_ltu_cy_5_CY0F_1322,
      SEL => Mcompar_ltu_cy_5_CYSELF_1313,
      O => Mcompar_ltu_cy_5_CYMUXF2_1308
    );
  Mcompar_ltu_cy_5_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X35Y9",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_4_IBUF_796,
      O => Mcompar_ltu_cy_5_CY0F_1322
    );
  Mcompar_ltu_cy_5_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y9",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(4),
      O => Mcompar_ltu_cy_5_CYSELF_1313
    );
  Mcompar_ltu_cy_5_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X35Y9",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_cy_3_CYMUXFAST_1281,
      O => Mcompar_ltu_cy_5_FASTCARRY_1310
    );
  Mcompar_ltu_cy_5_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X35Y9"
    )
    port map (
      I0 => Mcompar_ltu_cy_5_CYSELG_1299,
      I1 => Mcompar_ltu_cy_5_CYSELF_1313,
      O => Mcompar_ltu_cy_5_CYAND_1311
    );
  Mcompar_ltu_cy_5_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X35Y9"
    )
    port map (
      IA => Mcompar_ltu_cy_5_CYMUXG2_1309,
      IB => Mcompar_ltu_cy_5_FASTCARRY_1310,
      SEL => Mcompar_ltu_cy_5_CYAND_1311,
      O => Mcompar_ltu_cy_5_CYMUXFAST_1312
    );
  Mcompar_ltu_cy_5_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y9"
    )
    port map (
      IA => Mcompar_ltu_cy_5_CY0G_1307,
      IB => Mcompar_ltu_cy_5_CYMUXF2_1308,
      SEL => Mcompar_ltu_cy_5_CYSELG_1299,
      O => Mcompar_ltu_cy_5_CYMUXG2_1309
    );
  Mcompar_ltu_cy_5_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X35Y9",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_5_IBUF_798,
      O => Mcompar_ltu_cy_5_CY0G_1307
    );
  Mcompar_ltu_cy_5_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X35Y9",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(5),
      O => Mcompar_ltu_cy_5_CYSELG_1299
    );
  Mcompar_ltu_lut_5_Q : X_LUT4
    generic map(
      INIT => X"C3C3",
      LOC => "SLICE_X35Y9"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_5_IBUF_798,
      ADR2 => b_5_IBUF_822,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(5)
    );
  Mcompar_ltu_cy_7_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y10"
    )
    port map (
      IA => Mcompar_ltu_cy_7_CY0F_1353,
      IB => Mcompar_ltu_cy_7_CY0F_1353,
      SEL => Mcompar_ltu_cy_7_CYSELF_1344,
      O => Mcompar_ltu_cy_7_CYMUXF2_1339
    );
  Mcompar_ltu_cy_7_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X35Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_6_IBUF_801,
      O => Mcompar_ltu_cy_7_CY0F_1353
    );
  Mcompar_ltu_cy_7_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(6),
      O => Mcompar_ltu_cy_7_CYSELF_1344
    );
  Mcompar_ltu_cy_7_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X35Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_cy_5_CYMUXFAST_1312,
      O => Mcompar_ltu_cy_7_FASTCARRY_1341
    );
  Mcompar_ltu_cy_7_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X35Y10"
    )
    port map (
      I0 => Mcompar_ltu_cy_7_CYSELG_1330,
      I1 => Mcompar_ltu_cy_7_CYSELF_1344,
      O => Mcompar_ltu_cy_7_CYAND_1342
    );
  Mcompar_ltu_cy_7_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X35Y10"
    )
    port map (
      IA => Mcompar_ltu_cy_7_CYMUXG2_1340,
      IB => Mcompar_ltu_cy_7_FASTCARRY_1341,
      SEL => Mcompar_ltu_cy_7_CYAND_1342,
      O => Mcompar_ltu_cy_7_CYMUXFAST_1343
    );
  Mcompar_ltu_cy_7_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y10"
    )
    port map (
      IA => Mcompar_ltu_cy_7_CY0G_1338,
      IB => Mcompar_ltu_cy_7_CYMUXF2_1339,
      SEL => Mcompar_ltu_cy_7_CYSELG_1330,
      O => Mcompar_ltu_cy_7_CYMUXG2_1340
    );
  Mcompar_ltu_cy_7_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X35Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_7_IBUF_803,
      O => Mcompar_ltu_cy_7_CY0G_1338
    );
  Mcompar_ltu_cy_7_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X35Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(7),
      O => Mcompar_ltu_cy_7_CYSELG_1330
    );
  Mcompar_ltu_lut_7_Q : X_LUT4
    generic map(
      INIT => X"A5A5",
      LOC => "SLICE_X35Y10"
    )
    port map (
      ADR0 => a_7_IBUF_803,
      ADR1 => VCC,
      ADR2 => b_7_IBUF_825,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(7)
    );
  Mcompar_ltu_cy_9_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y11"
    )
    port map (
      IA => Mcompar_ltu_cy_9_CY0F_1384,
      IB => Mcompar_ltu_cy_9_CY0F_1384,
      SEL => Mcompar_ltu_cy_9_CYSELF_1375,
      O => Mcompar_ltu_cy_9_CYMUXF2_1370
    );
  Mcompar_ltu_cy_9_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X35Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_8_IBUF_806,
      O => Mcompar_ltu_cy_9_CY0F_1384
    );
  Mcompar_ltu_cy_9_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(8),
      O => Mcompar_ltu_cy_9_CYSELF_1375
    );
  Mcompar_ltu_cy_9_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X35Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_cy_7_CYMUXFAST_1343,
      O => Mcompar_ltu_cy_9_FASTCARRY_1372
    );
  Mcompar_ltu_cy_9_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X35Y11"
    )
    port map (
      I0 => Mcompar_ltu_cy_9_CYSELG_1361,
      I1 => Mcompar_ltu_cy_9_CYSELF_1375,
      O => Mcompar_ltu_cy_9_CYAND_1373
    );
  Mcompar_ltu_cy_9_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X35Y11"
    )
    port map (
      IA => Mcompar_ltu_cy_9_CYMUXG2_1371,
      IB => Mcompar_ltu_cy_9_FASTCARRY_1372,
      SEL => Mcompar_ltu_cy_9_CYAND_1373,
      O => Mcompar_ltu_cy_9_CYMUXFAST_1374
    );
  Mcompar_ltu_cy_9_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y11"
    )
    port map (
      IA => Mcompar_ltu_cy_9_CY0G_1369,
      IB => Mcompar_ltu_cy_9_CYMUXF2_1370,
      SEL => Mcompar_ltu_cy_9_CYSELG_1361,
      O => Mcompar_ltu_cy_9_CYMUXG2_1371
    );
  Mcompar_ltu_cy_9_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X35Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_9_IBUF_808,
      O => Mcompar_ltu_cy_9_CY0G_1369
    );
  Mcompar_ltu_cy_9_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X35Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(9),
      O => Mcompar_ltu_cy_9_CYSELG_1361
    );
  Mcompar_ltu_lut_9_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X35Y11"
    )
    port map (
      ADR0 => b_9_IBUF_828,
      ADR1 => a_9_IBUF_808,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(9)
    );
  Mcompar_ltu_cy_11_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y12"
    )
    port map (
      IA => Mcompar_ltu_cy_11_CY0F_1415,
      IB => Mcompar_ltu_cy_11_CY0F_1415,
      SEL => Mcompar_ltu_cy_11_CYSELF_1406,
      O => Mcompar_ltu_cy_11_CYMUXF2_1401
    );
  Mcompar_ltu_cy_11_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X35Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_10_IBUF_811,
      O => Mcompar_ltu_cy_11_CY0F_1415
    );
  Mcompar_ltu_cy_11_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(10),
      O => Mcompar_ltu_cy_11_CYSELF_1406
    );
  Mcompar_ltu_cy_11_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X35Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_cy_9_CYMUXFAST_1374,
      O => Mcompar_ltu_cy_11_FASTCARRY_1403
    );
  Mcompar_ltu_cy_11_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X35Y12"
    )
    port map (
      I0 => Mcompar_ltu_cy_11_CYSELG_1392,
      I1 => Mcompar_ltu_cy_11_CYSELF_1406,
      O => Mcompar_ltu_cy_11_CYAND_1404
    );
  Mcompar_ltu_cy_11_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X35Y12"
    )
    port map (
      IA => Mcompar_ltu_cy_11_CYMUXG2_1402,
      IB => Mcompar_ltu_cy_11_FASTCARRY_1403,
      SEL => Mcompar_ltu_cy_11_CYAND_1404,
      O => Mcompar_ltu_cy_11_CYMUXFAST_1405
    );
  Mcompar_ltu_cy_11_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y12"
    )
    port map (
      IA => Mcompar_ltu_cy_11_CY0G_1400,
      IB => Mcompar_ltu_cy_11_CYMUXF2_1401,
      SEL => Mcompar_ltu_cy_11_CYSELG_1392,
      O => Mcompar_ltu_cy_11_CYMUXG2_1402
    );
  Mcompar_ltu_cy_11_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X35Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_11_IBUF_813,
      O => Mcompar_ltu_cy_11_CY0G_1400
    );
  Mcompar_ltu_cy_11_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X35Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(11),
      O => Mcompar_ltu_cy_11_CYSELG_1392
    );
  Mcompar_ltu_lut_11_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X35Y12"
    )
    port map (
      ADR0 => a_11_IBUF_813,
      ADR1 => b_11_IBUF_831,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(11)
    );
  Mcompar_ltu_cy_13_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y13"
    )
    port map (
      IA => Mcompar_ltu_cy_13_CY0F_1446,
      IB => Mcompar_ltu_cy_13_CY0F_1446,
      SEL => Mcompar_ltu_cy_13_CYSELF_1437,
      O => Mcompar_ltu_cy_13_CYMUXF2_1432
    );
  Mcompar_ltu_cy_13_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X35Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_12_IBUF_833,
      O => Mcompar_ltu_cy_13_CY0F_1446
    );
  Mcompar_ltu_cy_13_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(12),
      O => Mcompar_ltu_cy_13_CYSELF_1437
    );
  Mcompar_ltu_cy_13_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X35Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_cy_11_CYMUXFAST_1405,
      O => Mcompar_ltu_cy_13_FASTCARRY_1434
    );
  Mcompar_ltu_cy_13_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X35Y13"
    )
    port map (
      I0 => Mcompar_ltu_cy_13_CYSELG_1423,
      I1 => Mcompar_ltu_cy_13_CYSELF_1437,
      O => Mcompar_ltu_cy_13_CYAND_1435
    );
  Mcompar_ltu_cy_13_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X35Y13"
    )
    port map (
      IA => Mcompar_ltu_cy_13_CYMUXG2_1433,
      IB => Mcompar_ltu_cy_13_FASTCARRY_1434,
      SEL => Mcompar_ltu_cy_13_CYAND_1435,
      O => Mcompar_ltu_cy_13_CYMUXFAST_1436
    );
  Mcompar_ltu_cy_13_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y13"
    )
    port map (
      IA => Mcompar_ltu_cy_13_CY0G_1431,
      IB => Mcompar_ltu_cy_13_CYMUXF2_1432,
      SEL => Mcompar_ltu_cy_13_CYSELG_1423,
      O => Mcompar_ltu_cy_13_CYMUXG2_1433
    );
  Mcompar_ltu_cy_13_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X35Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_13_IBUF_835,
      O => Mcompar_ltu_cy_13_CY0G_1431
    );
  Mcompar_ltu_cy_13_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X35Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(13),
      O => Mcompar_ltu_cy_13_CYSELG_1423
    );
  Mcompar_ltu_lut_13_Q : X_LUT4
    generic map(
      INIT => X"A5A5",
      LOC => "SLICE_X35Y13"
    )
    port map (
      ADR0 => a_13_IBUF_835,
      ADR1 => VCC,
      ADR2 => b_13_IBUF_836,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(13)
    );
  Mcompar_ltu_cy_15_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y14"
    )
    port map (
      IA => Mcompar_ltu_cy_15_CY0F_1477,
      IB => Mcompar_ltu_cy_15_CY0F_1477,
      SEL => Mcompar_ltu_cy_15_CYSELF_1468,
      O => Mcompar_ltu_cy_15_CYMUXF2_1463
    );
  Mcompar_ltu_cy_15_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X35Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_14_IBUF_838,
      O => Mcompar_ltu_cy_15_CY0F_1477
    );
  Mcompar_ltu_cy_15_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(14),
      O => Mcompar_ltu_cy_15_CYSELF_1468
    );
  Mcompar_ltu_cy_15_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X35Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_cy_13_CYMUXFAST_1436,
      O => Mcompar_ltu_cy_15_FASTCARRY_1465
    );
  Mcompar_ltu_cy_15_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X35Y14"
    )
    port map (
      I0 => Mcompar_ltu_cy_15_CYSELG_1454,
      I1 => Mcompar_ltu_cy_15_CYSELF_1468,
      O => Mcompar_ltu_cy_15_CYAND_1466
    );
  Mcompar_ltu_cy_15_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X35Y14"
    )
    port map (
      IA => Mcompar_ltu_cy_15_CYMUXG2_1464,
      IB => Mcompar_ltu_cy_15_FASTCARRY_1465,
      SEL => Mcompar_ltu_cy_15_CYAND_1466,
      O => Mcompar_ltu_cy_15_CYMUXFAST_1467
    );
  Mcompar_ltu_cy_15_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y14"
    )
    port map (
      IA => Mcompar_ltu_cy_15_CY0G_1462,
      IB => Mcompar_ltu_cy_15_CYMUXF2_1463,
      SEL => Mcompar_ltu_cy_15_CYSELG_1454,
      O => Mcompar_ltu_cy_15_CYMUXG2_1464
    );
  Mcompar_ltu_cy_15_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X35Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_15_IBUF_840,
      O => Mcompar_ltu_cy_15_CY0G_1462
    );
  Mcompar_ltu_cy_15_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X35Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_lut(15),
      O => Mcompar_ltu_cy_15_CYSELG_1454
    );
  Mcompar_ltu_lut_15_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X35Y14"
    )
    port map (
      ADR0 => a_15_IBUF_840,
      ADR1 => b_15_IBUF_841,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(15)
    );
  s_addsub0001_0_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_0_XORF_1512,
      O => s_addsub0001(0)
    );
  s_addsub0001_0_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X29Y23"
    )
    port map (
      I0 => s_addsub0001_0_CYINIT_1511,
      I1 => Madd_s_addsub0001_lut(0),
      O => s_addsub0001_0_XORF_1512
    );
  s_addsub0001_0_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X29Y23"
    )
    port map (
      IA => s_addsub0001_0_CY0F_1510,
      IB => s_addsub0001_0_CYINIT_1511,
      SEL => s_addsub0001_0_CYSELF_1502,
      O => Madd_s_addsub0001_cy(0)
    );
  s_addsub0001_0_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X29Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => cin_INBUF,
      O => s_addsub0001_0_CYINIT_1511
    );
  s_addsub0001_0_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X29Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_786,
      O => s_addsub0001_0_CY0F_1510
    );
  s_addsub0001_0_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X29Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(0),
      O => s_addsub0001_0_CYSELF_1502
    );
  s_addsub0001_0_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_0_XORG_1498,
      O => s_addsub0001(1)
    );
  s_addsub0001_0_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X29Y23"
    )
    port map (
      I0 => Madd_s_addsub0001_cy(0),
      I1 => Madd_s_addsub0001_lut(1),
      O => s_addsub0001_0_XORG_1498
    );
  s_addsub0001_0_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_0_CYMUXG_1497,
      O => Madd_s_addsub0001_cy(1)
    );
  s_addsub0001_0_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X29Y23"
    )
    port map (
      IA => s_addsub0001_0_CY0G_1495,
      IB => Madd_s_addsub0001_cy(0),
      SEL => s_addsub0001_0_CYSELG_1487,
      O => s_addsub0001_0_CYMUXG_1497
    );
  s_addsub0001_0_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X29Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_788,
      O => s_addsub0001_0_CY0G_1495
    );
  s_addsub0001_0_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X29Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(1),
      O => s_addsub0001_0_CYSELG_1487
    );
  Madd_s_addsub0001_lut_1_Q : X_LUT4
    generic map(
      INIT => X"55AA",
      LOC => "SLICE_X29Y23"
    )
    port map (
      ADR0 => a_1_IBUF_788,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => b_1_IBUF_816,
      O => Madd_s_addsub0001_lut(1)
    );
  s_addsub0001_2_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_2_XORF_1551,
      O => s_addsub0001(2)
    );
  s_addsub0001_2_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X29Y24"
    )
    port map (
      I0 => s_addsub0001_2_CYINIT_1550,
      I1 => Madd_s_addsub0001_lut(2),
      O => s_addsub0001_2_XORF_1551
    );
  s_addsub0001_2_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X29Y24"
    )
    port map (
      IA => s_addsub0001_2_CY0F_1549,
      IB => s_addsub0001_2_CYINIT_1550,
      SEL => s_addsub0001_2_CYSELF_1537,
      O => Madd_s_addsub0001_cy(2)
    );
  s_addsub0001_2_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y24"
    )
    port map (
      IA => s_addsub0001_2_CY0F_1549,
      IB => s_addsub0001_2_CY0F_1549,
      SEL => s_addsub0001_2_CYSELF_1537,
      O => s_addsub0001_2_CYMUXF2_1532
    );
  s_addsub0001_2_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X29Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(1),
      O => s_addsub0001_2_CYINIT_1550
    );
  s_addsub0001_2_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X29Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_791,
      O => s_addsub0001_2_CY0F_1549
    );
  s_addsub0001_2_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X29Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(2),
      O => s_addsub0001_2_CYSELF_1537
    );
  s_addsub0001_2_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_2_XORG_1539,
      O => s_addsub0001(3)
    );
  s_addsub0001_2_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X29Y24"
    )
    port map (
      I0 => Madd_s_addsub0001_cy(2),
      I1 => Madd_s_addsub0001_lut(3),
      O => s_addsub0001_2_XORG_1539
    );
  s_addsub0001_2_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_2_CYMUXFAST_1536,
      O => Madd_s_addsub0001_cy(3)
    );
  s_addsub0001_2_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X29Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(1),
      O => s_addsub0001_2_FASTCARRY_1534
    );
  s_addsub0001_2_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X29Y24"
    )
    port map (
      I0 => s_addsub0001_2_CYSELG_1523,
      I1 => s_addsub0001_2_CYSELF_1537,
      O => s_addsub0001_2_CYAND_1535
    );
  s_addsub0001_2_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X29Y24"
    )
    port map (
      IA => s_addsub0001_2_CYMUXG2_1533,
      IB => s_addsub0001_2_FASTCARRY_1534,
      SEL => s_addsub0001_2_CYAND_1535,
      O => s_addsub0001_2_CYMUXFAST_1536
    );
  s_addsub0001_2_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y24"
    )
    port map (
      IA => s_addsub0001_2_CY0G_1531,
      IB => s_addsub0001_2_CYMUXF2_1532,
      SEL => s_addsub0001_2_CYSELG_1523,
      O => s_addsub0001_2_CYMUXG2_1533
    );
  s_addsub0001_2_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X29Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_793,
      O => s_addsub0001_2_CY0G_1531
    );
  s_addsub0001_2_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X29Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(3),
      O => s_addsub0001_2_CYSELG_1523
    );
  Madd_s_addsub0001_lut_3_Q : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X29Y24"
    )
    port map (
      ADR0 => b_3_IBUF_819,
      ADR1 => a_3_IBUF_793,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Madd_s_addsub0001_lut(3)
    );
  s_addsub0001_4_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_4_XORF_1590,
      O => s_addsub0001(4)
    );
  s_addsub0001_4_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X29Y25"
    )
    port map (
      I0 => s_addsub0001_4_CYINIT_1589,
      I1 => Madd_s_addsub0001_lut(4),
      O => s_addsub0001_4_XORF_1590
    );
  s_addsub0001_4_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X29Y25"
    )
    port map (
      IA => s_addsub0001_4_CY0F_1588,
      IB => s_addsub0001_4_CYINIT_1589,
      SEL => s_addsub0001_4_CYSELF_1576,
      O => Madd_s_addsub0001_cy(4)
    );
  s_addsub0001_4_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y25"
    )
    port map (
      IA => s_addsub0001_4_CY0F_1588,
      IB => s_addsub0001_4_CY0F_1588,
      SEL => s_addsub0001_4_CYSELF_1576,
      O => s_addsub0001_4_CYMUXF2_1571
    );
  s_addsub0001_4_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X29Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(3),
      O => s_addsub0001_4_CYINIT_1589
    );
  s_addsub0001_4_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X29Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_4_IBUF_796,
      O => s_addsub0001_4_CY0F_1588
    );
  s_addsub0001_4_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X29Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(4),
      O => s_addsub0001_4_CYSELF_1576
    );
  s_addsub0001_4_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_4_XORG_1578,
      O => s_addsub0001(5)
    );
  s_addsub0001_4_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X29Y25"
    )
    port map (
      I0 => Madd_s_addsub0001_cy(4),
      I1 => Madd_s_addsub0001_lut(5),
      O => s_addsub0001_4_XORG_1578
    );
  s_addsub0001_4_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_4_CYMUXFAST_1575,
      O => Madd_s_addsub0001_cy(5)
    );
  s_addsub0001_4_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X29Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(3),
      O => s_addsub0001_4_FASTCARRY_1573
    );
  s_addsub0001_4_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X29Y25"
    )
    port map (
      I0 => s_addsub0001_4_CYSELG_1562,
      I1 => s_addsub0001_4_CYSELF_1576,
      O => s_addsub0001_4_CYAND_1574
    );
  s_addsub0001_4_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X29Y25"
    )
    port map (
      IA => s_addsub0001_4_CYMUXG2_1572,
      IB => s_addsub0001_4_FASTCARRY_1573,
      SEL => s_addsub0001_4_CYAND_1574,
      O => s_addsub0001_4_CYMUXFAST_1575
    );
  s_addsub0001_4_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y25"
    )
    port map (
      IA => s_addsub0001_4_CY0G_1570,
      IB => s_addsub0001_4_CYMUXF2_1571,
      SEL => s_addsub0001_4_CYSELG_1562,
      O => s_addsub0001_4_CYMUXG2_1572
    );
  s_addsub0001_4_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X29Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_5_IBUF_798,
      O => s_addsub0001_4_CY0G_1570
    );
  s_addsub0001_4_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X29Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(5),
      O => s_addsub0001_4_CYSELG_1562
    );
  Madd_s_addsub0001_lut_5_Q : X_LUT4
    generic map(
      INIT => X"3C3C",
      LOC => "SLICE_X29Y25"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_5_IBUF_798,
      ADR2 => b_5_IBUF_822,
      ADR3 => VCC,
      O => Madd_s_addsub0001_lut(5)
    );
  s_addsub0001_6_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_6_XORF_1629,
      O => s_addsub0001(6)
    );
  s_addsub0001_6_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X29Y26"
    )
    port map (
      I0 => s_addsub0001_6_CYINIT_1628,
      I1 => Madd_s_addsub0001_lut(6),
      O => s_addsub0001_6_XORF_1629
    );
  s_addsub0001_6_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X29Y26"
    )
    port map (
      IA => s_addsub0001_6_CY0F_1627,
      IB => s_addsub0001_6_CYINIT_1628,
      SEL => s_addsub0001_6_CYSELF_1615,
      O => Madd_s_addsub0001_cy(6)
    );
  s_addsub0001_6_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y26"
    )
    port map (
      IA => s_addsub0001_6_CY0F_1627,
      IB => s_addsub0001_6_CY0F_1627,
      SEL => s_addsub0001_6_CYSELF_1615,
      O => s_addsub0001_6_CYMUXF2_1610
    );
  s_addsub0001_6_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X29Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(5),
      O => s_addsub0001_6_CYINIT_1628
    );
  s_addsub0001_6_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X29Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_6_IBUF_801,
      O => s_addsub0001_6_CY0F_1627
    );
  s_addsub0001_6_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X29Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(6),
      O => s_addsub0001_6_CYSELF_1615
    );
  s_addsub0001_6_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_6_XORG_1617,
      O => s_addsub0001(7)
    );
  s_addsub0001_6_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X29Y26"
    )
    port map (
      I0 => Madd_s_addsub0001_cy(6),
      I1 => Madd_s_addsub0001_lut(7),
      O => s_addsub0001_6_XORG_1617
    );
  s_addsub0001_6_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_6_CYMUXFAST_1614,
      O => Madd_s_addsub0001_cy(7)
    );
  s_addsub0001_6_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X29Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(5),
      O => s_addsub0001_6_FASTCARRY_1612
    );
  s_addsub0001_6_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X29Y26"
    )
    port map (
      I0 => s_addsub0001_6_CYSELG_1601,
      I1 => s_addsub0001_6_CYSELF_1615,
      O => s_addsub0001_6_CYAND_1613
    );
  s_addsub0001_6_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X29Y26"
    )
    port map (
      IA => s_addsub0001_6_CYMUXG2_1611,
      IB => s_addsub0001_6_FASTCARRY_1612,
      SEL => s_addsub0001_6_CYAND_1613,
      O => s_addsub0001_6_CYMUXFAST_1614
    );
  s_addsub0001_6_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y26"
    )
    port map (
      IA => s_addsub0001_6_CY0G_1609,
      IB => s_addsub0001_6_CYMUXF2_1610,
      SEL => s_addsub0001_6_CYSELG_1601,
      O => s_addsub0001_6_CYMUXG2_1611
    );
  s_addsub0001_6_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X29Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_7_IBUF_803,
      O => s_addsub0001_6_CY0G_1609
    );
  s_addsub0001_6_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X29Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(7),
      O => s_addsub0001_6_CYSELG_1601
    );
  Madd_s_addsub0001_lut_7_Q : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X29Y26"
    )
    port map (
      ADR0 => b_7_IBUF_825,
      ADR1 => a_7_IBUF_803,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Madd_s_addsub0001_lut(7)
    );
  s_addsub0001_8_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_8_XORF_1668,
      O => s_addsub0001(8)
    );
  s_addsub0001_8_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X29Y27"
    )
    port map (
      I0 => s_addsub0001_8_CYINIT_1667,
      I1 => Madd_s_addsub0001_lut(8),
      O => s_addsub0001_8_XORF_1668
    );
  s_addsub0001_8_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X29Y27"
    )
    port map (
      IA => s_addsub0001_8_CY0F_1666,
      IB => s_addsub0001_8_CYINIT_1667,
      SEL => s_addsub0001_8_CYSELF_1654,
      O => Madd_s_addsub0001_cy(8)
    );
  s_addsub0001_8_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y27"
    )
    port map (
      IA => s_addsub0001_8_CY0F_1666,
      IB => s_addsub0001_8_CY0F_1666,
      SEL => s_addsub0001_8_CYSELF_1654,
      O => s_addsub0001_8_CYMUXF2_1649
    );
  s_addsub0001_8_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X29Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(7),
      O => s_addsub0001_8_CYINIT_1667
    );
  s_addsub0001_8_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X29Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_8_IBUF_806,
      O => s_addsub0001_8_CY0F_1666
    );
  s_addsub0001_8_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X29Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(8),
      O => s_addsub0001_8_CYSELF_1654
    );
  s_addsub0001_8_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_8_XORG_1656,
      O => s_addsub0001(9)
    );
  s_addsub0001_8_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X29Y27"
    )
    port map (
      I0 => Madd_s_addsub0001_cy(8),
      I1 => Madd_s_addsub0001_lut(9),
      O => s_addsub0001_8_XORG_1656
    );
  s_addsub0001_8_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_8_CYMUXFAST_1653,
      O => Madd_s_addsub0001_cy(9)
    );
  s_addsub0001_8_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X29Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(7),
      O => s_addsub0001_8_FASTCARRY_1651
    );
  s_addsub0001_8_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X29Y27"
    )
    port map (
      I0 => s_addsub0001_8_CYSELG_1640,
      I1 => s_addsub0001_8_CYSELF_1654,
      O => s_addsub0001_8_CYAND_1652
    );
  s_addsub0001_8_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X29Y27"
    )
    port map (
      IA => s_addsub0001_8_CYMUXG2_1650,
      IB => s_addsub0001_8_FASTCARRY_1651,
      SEL => s_addsub0001_8_CYAND_1652,
      O => s_addsub0001_8_CYMUXFAST_1653
    );
  s_addsub0001_8_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y27"
    )
    port map (
      IA => s_addsub0001_8_CY0G_1648,
      IB => s_addsub0001_8_CYMUXF2_1649,
      SEL => s_addsub0001_8_CYSELG_1640,
      O => s_addsub0001_8_CYMUXG2_1650
    );
  s_addsub0001_8_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X29Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_9_IBUF_808,
      O => s_addsub0001_8_CY0G_1648
    );
  s_addsub0001_8_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X29Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(9),
      O => s_addsub0001_8_CYSELG_1640
    );
  Madd_s_addsub0001_lut_9_Q : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X29Y27"
    )
    port map (
      ADR0 => b_9_IBUF_828,
      ADR1 => a_9_IBUF_808,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Madd_s_addsub0001_lut(9)
    );
  s_addsub0001_10_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_10_XORF_1707,
      O => s_addsub0001(10)
    );
  s_addsub0001_10_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X29Y28"
    )
    port map (
      I0 => s_addsub0001_10_CYINIT_1706,
      I1 => Madd_s_addsub0001_lut(10),
      O => s_addsub0001_10_XORF_1707
    );
  s_addsub0001_10_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X29Y28"
    )
    port map (
      IA => s_addsub0001_10_CY0F_1705,
      IB => s_addsub0001_10_CYINIT_1706,
      SEL => s_addsub0001_10_CYSELF_1693,
      O => Madd_s_addsub0001_cy(10)
    );
  s_addsub0001_10_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y28"
    )
    port map (
      IA => s_addsub0001_10_CY0F_1705,
      IB => s_addsub0001_10_CY0F_1705,
      SEL => s_addsub0001_10_CYSELF_1693,
      O => s_addsub0001_10_CYMUXF2_1688
    );
  s_addsub0001_10_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(9),
      O => s_addsub0001_10_CYINIT_1706
    );
  s_addsub0001_10_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_10_IBUF_811,
      O => s_addsub0001_10_CY0F_1705
    );
  s_addsub0001_10_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(10),
      O => s_addsub0001_10_CYSELF_1693
    );
  s_addsub0001_10_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_10_XORG_1695,
      O => s_addsub0001(11)
    );
  s_addsub0001_10_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X29Y28"
    )
    port map (
      I0 => Madd_s_addsub0001_cy(10),
      I1 => Madd_s_addsub0001_lut(11),
      O => s_addsub0001_10_XORG_1695
    );
  s_addsub0001_10_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_10_CYMUXFAST_1692,
      O => Madd_s_addsub0001_cy(11)
    );
  s_addsub0001_10_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(9),
      O => s_addsub0001_10_FASTCARRY_1690
    );
  s_addsub0001_10_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X29Y28"
    )
    port map (
      I0 => s_addsub0001_10_CYSELG_1679,
      I1 => s_addsub0001_10_CYSELF_1693,
      O => s_addsub0001_10_CYAND_1691
    );
  s_addsub0001_10_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X29Y28"
    )
    port map (
      IA => s_addsub0001_10_CYMUXG2_1689,
      IB => s_addsub0001_10_FASTCARRY_1690,
      SEL => s_addsub0001_10_CYAND_1691,
      O => s_addsub0001_10_CYMUXFAST_1692
    );
  s_addsub0001_10_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y28"
    )
    port map (
      IA => s_addsub0001_10_CY0G_1687,
      IB => s_addsub0001_10_CYMUXF2_1688,
      SEL => s_addsub0001_10_CYSELG_1679,
      O => s_addsub0001_10_CYMUXG2_1689
    );
  s_addsub0001_10_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_11_IBUF_813,
      O => s_addsub0001_10_CY0G_1687
    );
  s_addsub0001_10_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(11),
      O => s_addsub0001_10_CYSELG_1679
    );
  Madd_s_addsub0001_lut_11_Q : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X29Y28"
    )
    port map (
      ADR0 => a_11_IBUF_813,
      ADR1 => b_11_IBUF_831,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Madd_s_addsub0001_lut(11)
    );
  s_addsub0001_12_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_12_XORF_1746,
      O => s_addsub0001(12)
    );
  s_addsub0001_12_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X29Y29"
    )
    port map (
      I0 => s_addsub0001_12_CYINIT_1745,
      I1 => Madd_s_addsub0001_lut(12),
      O => s_addsub0001_12_XORF_1746
    );
  s_addsub0001_12_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X29Y29"
    )
    port map (
      IA => s_addsub0001_12_CY0F_1744,
      IB => s_addsub0001_12_CYINIT_1745,
      SEL => s_addsub0001_12_CYSELF_1732,
      O => Madd_s_addsub0001_cy(12)
    );
  s_addsub0001_12_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y29"
    )
    port map (
      IA => s_addsub0001_12_CY0F_1744,
      IB => s_addsub0001_12_CY0F_1744,
      SEL => s_addsub0001_12_CYSELF_1732,
      O => s_addsub0001_12_CYMUXF2_1727
    );
  s_addsub0001_12_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(11),
      O => s_addsub0001_12_CYINIT_1745
    );
  s_addsub0001_12_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_12_IBUF_833,
      O => s_addsub0001_12_CY0F_1744
    );
  s_addsub0001_12_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(12),
      O => s_addsub0001_12_CYSELF_1732
    );
  s_addsub0001_12_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_12_XORG_1734,
      O => s_addsub0001(13)
    );
  s_addsub0001_12_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X29Y29"
    )
    port map (
      I0 => Madd_s_addsub0001_cy(12),
      I1 => Madd_s_addsub0001_lut(13),
      O => s_addsub0001_12_XORG_1734
    );
  s_addsub0001_12_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_12_CYMUXFAST_1731,
      O => Madd_s_addsub0001_cy(13)
    );
  s_addsub0001_12_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(11),
      O => s_addsub0001_12_FASTCARRY_1729
    );
  s_addsub0001_12_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X29Y29"
    )
    port map (
      I0 => s_addsub0001_12_CYSELG_1718,
      I1 => s_addsub0001_12_CYSELF_1732,
      O => s_addsub0001_12_CYAND_1730
    );
  s_addsub0001_12_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X29Y29"
    )
    port map (
      IA => s_addsub0001_12_CYMUXG2_1728,
      IB => s_addsub0001_12_FASTCARRY_1729,
      SEL => s_addsub0001_12_CYAND_1730,
      O => s_addsub0001_12_CYMUXFAST_1731
    );
  s_addsub0001_12_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y29"
    )
    port map (
      IA => s_addsub0001_12_CY0G_1726,
      IB => s_addsub0001_12_CYMUXF2_1727,
      SEL => s_addsub0001_12_CYSELG_1718,
      O => s_addsub0001_12_CYMUXG2_1728
    );
  s_addsub0001_12_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_13_IBUF_835,
      O => s_addsub0001_12_CY0G_1726
    );
  s_addsub0001_12_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(13),
      O => s_addsub0001_12_CYSELG_1718
    );
  Madd_s_addsub0001_lut_13_Q : X_LUT4
    generic map(
      INIT => X"33CC",
      LOC => "SLICE_X29Y29"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_13_IBUF_835,
      ADR2 => VCC,
      ADR3 => b_13_IBUF_836,
      O => Madd_s_addsub0001_lut(13)
    );
  s_addsub0001_14_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_14_XORF_1785,
      O => s_addsub0001(14)
    );
  s_addsub0001_14_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X29Y30"
    )
    port map (
      I0 => s_addsub0001_14_CYINIT_1784,
      I1 => Madd_s_addsub0001_lut(14),
      O => s_addsub0001_14_XORF_1785
    );
  s_addsub0001_14_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X29Y30"
    )
    port map (
      IA => s_addsub0001_14_CY0F_1783,
      IB => s_addsub0001_14_CYINIT_1784,
      SEL => s_addsub0001_14_CYSELF_1771,
      O => Madd_s_addsub0001_cy(14)
    );
  s_addsub0001_14_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y30"
    )
    port map (
      IA => s_addsub0001_14_CY0F_1783,
      IB => s_addsub0001_14_CY0F_1783,
      SEL => s_addsub0001_14_CYSELF_1771,
      O => s_addsub0001_14_CYMUXF2_1766
    );
  s_addsub0001_14_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(13),
      O => s_addsub0001_14_CYINIT_1784
    );
  s_addsub0001_14_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_14_IBUF_838,
      O => s_addsub0001_14_CY0F_1783
    );
  s_addsub0001_14_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(14),
      O => s_addsub0001_14_CYSELF_1771
    );
  s_addsub0001_14_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_14_XORG_1773,
      O => s_addsub0001(15)
    );
  s_addsub0001_14_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X29Y30"
    )
    port map (
      I0 => Madd_s_addsub0001_cy(14),
      I1 => Madd_s_addsub0001_lut(15),
      O => s_addsub0001_14_XORG_1773
    );
  s_addsub0001_14_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0001_14_CYMUXFAST_1770,
      O => Madd_s_addsub0001_cy(15)
    );
  s_addsub0001_14_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_cy(13),
      O => s_addsub0001_14_FASTCARRY_1768
    );
  s_addsub0001_14_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X29Y30"
    )
    port map (
      I0 => s_addsub0001_14_CYSELG_1757,
      I1 => s_addsub0001_14_CYSELF_1771,
      O => s_addsub0001_14_CYAND_1769
    );
  s_addsub0001_14_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X29Y30"
    )
    port map (
      IA => s_addsub0001_14_CYMUXG2_1767,
      IB => s_addsub0001_14_FASTCARRY_1768,
      SEL => s_addsub0001_14_CYAND_1769,
      O => s_addsub0001_14_CYMUXFAST_1770
    );
  s_addsub0001_14_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y30"
    )
    port map (
      IA => s_addsub0001_14_CY0G_1765,
      IB => s_addsub0001_14_CYMUXF2_1766,
      SEL => s_addsub0001_14_CYSELG_1757,
      O => s_addsub0001_14_CYMUXG2_1767
    );
  s_addsub0001_14_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_15_IBUF_840,
      O => s_addsub0001_14_CY0G_1765
    );
  s_addsub0001_14_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => Madd_s_addsub0001_lut(15),
      O => s_addsub0001_14_CYSELG_1757
    );
  Madd_s_addsub0001_lut_15_Q : X_LUT4
    generic map(
      INIT => X"3C3C",
      LOC => "SLICE_X29Y30"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_15_IBUF_840,
      ADR2 => b_15_IBUF_841,
      ADR3 => VCC,
      O => Madd_s_addsub0001_lut(15)
    );
  Mcompar_lts_cy_1_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X33Y8"
    )
    port map (
      IA => Mcompar_lts_cy_1_CY0F_1815,
      IB => Mcompar_lts_cy_1_CYINIT_1816,
      SEL => Mcompar_lts_cy_1_CYSELF_1807,
      O => Mcompar_lts_cy(0)
    );
  Mcompar_lts_cy_1_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X33Y8",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_cy_1_BXINV_1805,
      O => Mcompar_lts_cy_1_CYINIT_1816
    );
  Mcompar_lts_cy_1_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X33Y8",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_786,
      O => Mcompar_lts_cy_1_CY0F_1815
    );
  Mcompar_lts_cy_1_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y8",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(0),
      O => Mcompar_lts_cy_1_CYSELF_1807
    );
  Mcompar_lts_cy_1_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X33Y8",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => Mcompar_lts_cy_1_BXINV_1805
    );
  Mcompar_lts_cy_1_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X33Y8"
    )
    port map (
      IA => Mcompar_lts_cy_1_CY0G_1802,
      IB => Mcompar_lts_cy(0),
      SEL => Mcompar_lts_cy_1_CYSELG_1794,
      O => Mcompar_lts_cy_1_CYMUXG_1804
    );
  Mcompar_lts_cy_1_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X33Y8",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_788,
      O => Mcompar_lts_cy_1_CY0G_1802
    );
  Mcompar_lts_cy_1_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y8",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(1),
      O => Mcompar_lts_cy_1_CYSELG_1794
    );
  Mcompar_lts_lut_1_Q : X_LUT4
    generic map(
      INIT => X"AA55",
      LOC => "SLICE_X33Y8"
    )
    port map (
      ADR0 => a_1_IBUF_788,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => b_1_IBUF_816,
      O => Mcompar_lts_lut(1)
    );
  Mcompar_lts_cy_3_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y9"
    )
    port map (
      IA => Mcompar_lts_cy_3_CY0F_1847,
      IB => Mcompar_lts_cy_3_CY0F_1847,
      SEL => Mcompar_lts_cy_3_CYSELF_1838,
      O => Mcompar_lts_cy_3_CYMUXF2_1833
    );
  Mcompar_lts_cy_3_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X33Y9",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_791,
      O => Mcompar_lts_cy_3_CY0F_1847
    );
  Mcompar_lts_cy_3_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y9",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(2),
      O => Mcompar_lts_cy_3_CYSELF_1838
    );
  Mcompar_lts_cy_3_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y9",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_cy_1_CYMUXG_1804,
      O => Mcompar_lts_cy_3_FASTCARRY_1835
    );
  Mcompar_lts_cy_3_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y9"
    )
    port map (
      I0 => Mcompar_lts_cy_3_CYSELG_1824,
      I1 => Mcompar_lts_cy_3_CYSELF_1838,
      O => Mcompar_lts_cy_3_CYAND_1836
    );
  Mcompar_lts_cy_3_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y9"
    )
    port map (
      IA => Mcompar_lts_cy_3_CYMUXG2_1834,
      IB => Mcompar_lts_cy_3_FASTCARRY_1835,
      SEL => Mcompar_lts_cy_3_CYAND_1836,
      O => Mcompar_lts_cy_3_CYMUXFAST_1837
    );
  Mcompar_lts_cy_3_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y9"
    )
    port map (
      IA => Mcompar_lts_cy_3_CY0G_1832,
      IB => Mcompar_lts_cy_3_CYMUXF2_1833,
      SEL => Mcompar_lts_cy_3_CYSELG_1824,
      O => Mcompar_lts_cy_3_CYMUXG2_1834
    );
  Mcompar_lts_cy_3_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X33Y9",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_793,
      O => Mcompar_lts_cy_3_CY0G_1832
    );
  Mcompar_lts_cy_3_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y9",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(3),
      O => Mcompar_lts_cy_3_CYSELG_1824
    );
  Mcompar_lts_lut_3_Q : X_LUT4
    generic map(
      INIT => X"C3C3",
      LOC => "SLICE_X33Y9"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_3_IBUF_793,
      ADR2 => b_3_IBUF_819,
      ADR3 => VCC,
      O => Mcompar_lts_lut(3)
    );
  Mcompar_lts_cy_5_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y10"
    )
    port map (
      IA => Mcompar_lts_cy_5_CY0F_1878,
      IB => Mcompar_lts_cy_5_CY0F_1878,
      SEL => Mcompar_lts_cy_5_CYSELF_1869,
      O => Mcompar_lts_cy_5_CYMUXF2_1864
    );
  Mcompar_lts_cy_5_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X33Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_4_IBUF_796,
      O => Mcompar_lts_cy_5_CY0F_1878
    );
  Mcompar_lts_cy_5_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(4),
      O => Mcompar_lts_cy_5_CYSELF_1869
    );
  Mcompar_lts_cy_5_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_cy_3_CYMUXFAST_1837,
      O => Mcompar_lts_cy_5_FASTCARRY_1866
    );
  Mcompar_lts_cy_5_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y10"
    )
    port map (
      I0 => Mcompar_lts_cy_5_CYSELG_1855,
      I1 => Mcompar_lts_cy_5_CYSELF_1869,
      O => Mcompar_lts_cy_5_CYAND_1867
    );
  Mcompar_lts_cy_5_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y10"
    )
    port map (
      IA => Mcompar_lts_cy_5_CYMUXG2_1865,
      IB => Mcompar_lts_cy_5_FASTCARRY_1866,
      SEL => Mcompar_lts_cy_5_CYAND_1867,
      O => Mcompar_lts_cy_5_CYMUXFAST_1868
    );
  Mcompar_lts_cy_5_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y10"
    )
    port map (
      IA => Mcompar_lts_cy_5_CY0G_1863,
      IB => Mcompar_lts_cy_5_CYMUXF2_1864,
      SEL => Mcompar_lts_cy_5_CYSELG_1855,
      O => Mcompar_lts_cy_5_CYMUXG2_1865
    );
  Mcompar_lts_cy_5_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X33Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_5_IBUF_798,
      O => Mcompar_lts_cy_5_CY0G_1863
    );
  Mcompar_lts_cy_5_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y10",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(5),
      O => Mcompar_lts_cy_5_CYSELG_1855
    );
  Mcompar_lts_lut_5_Q : X_LUT4
    generic map(
      INIT => X"C3C3",
      LOC => "SLICE_X33Y10"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_5_IBUF_798,
      ADR2 => b_5_IBUF_822,
      ADR3 => VCC,
      O => Mcompar_lts_lut(5)
    );
  Mcompar_lts_cy_7_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y11"
    )
    port map (
      IA => Mcompar_lts_cy_7_CY0F_1909,
      IB => Mcompar_lts_cy_7_CY0F_1909,
      SEL => Mcompar_lts_cy_7_CYSELF_1900,
      O => Mcompar_lts_cy_7_CYMUXF2_1895
    );
  Mcompar_lts_cy_7_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X33Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_6_IBUF_801,
      O => Mcompar_lts_cy_7_CY0F_1909
    );
  Mcompar_lts_cy_7_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(6),
      O => Mcompar_lts_cy_7_CYSELF_1900
    );
  Mcompar_lts_cy_7_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_cy_5_CYMUXFAST_1868,
      O => Mcompar_lts_cy_7_FASTCARRY_1897
    );
  Mcompar_lts_cy_7_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y11"
    )
    port map (
      I0 => Mcompar_lts_cy_7_CYSELG_1886,
      I1 => Mcompar_lts_cy_7_CYSELF_1900,
      O => Mcompar_lts_cy_7_CYAND_1898
    );
  Mcompar_lts_cy_7_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y11"
    )
    port map (
      IA => Mcompar_lts_cy_7_CYMUXG2_1896,
      IB => Mcompar_lts_cy_7_FASTCARRY_1897,
      SEL => Mcompar_lts_cy_7_CYAND_1898,
      O => Mcompar_lts_cy_7_CYMUXFAST_1899
    );
  Mcompar_lts_cy_7_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y11"
    )
    port map (
      IA => Mcompar_lts_cy_7_CY0G_1894,
      IB => Mcompar_lts_cy_7_CYMUXF2_1895,
      SEL => Mcompar_lts_cy_7_CYSELG_1886,
      O => Mcompar_lts_cy_7_CYMUXG2_1896
    );
  Mcompar_lts_cy_7_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X33Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_7_IBUF_803,
      O => Mcompar_lts_cy_7_CY0G_1894
    );
  Mcompar_lts_cy_7_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y11",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(7),
      O => Mcompar_lts_cy_7_CYSELG_1886
    );
  Mcompar_lts_lut_7_Q : X_LUT4
    generic map(
      INIT => X"C3C3",
      LOC => "SLICE_X33Y11"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_7_IBUF_803,
      ADR2 => b_7_IBUF_825,
      ADR3 => VCC,
      O => Mcompar_lts_lut(7)
    );
  Mcompar_lts_cy_9_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y12"
    )
    port map (
      IA => Mcompar_lts_cy_9_CY0F_1940,
      IB => Mcompar_lts_cy_9_CY0F_1940,
      SEL => Mcompar_lts_cy_9_CYSELF_1931,
      O => Mcompar_lts_cy_9_CYMUXF2_1926
    );
  Mcompar_lts_cy_9_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X33Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_8_IBUF_806,
      O => Mcompar_lts_cy_9_CY0F_1940
    );
  Mcompar_lts_cy_9_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(8),
      O => Mcompar_lts_cy_9_CYSELF_1931
    );
  Mcompar_lts_cy_9_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_cy_7_CYMUXFAST_1899,
      O => Mcompar_lts_cy_9_FASTCARRY_1928
    );
  Mcompar_lts_cy_9_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y12"
    )
    port map (
      I0 => Mcompar_lts_cy_9_CYSELG_1917,
      I1 => Mcompar_lts_cy_9_CYSELF_1931,
      O => Mcompar_lts_cy_9_CYAND_1929
    );
  Mcompar_lts_cy_9_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y12"
    )
    port map (
      IA => Mcompar_lts_cy_9_CYMUXG2_1927,
      IB => Mcompar_lts_cy_9_FASTCARRY_1928,
      SEL => Mcompar_lts_cy_9_CYAND_1929,
      O => Mcompar_lts_cy_9_CYMUXFAST_1930
    );
  Mcompar_lts_cy_9_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y12"
    )
    port map (
      IA => Mcompar_lts_cy_9_CY0G_1925,
      IB => Mcompar_lts_cy_9_CYMUXF2_1926,
      SEL => Mcompar_lts_cy_9_CYSELG_1917,
      O => Mcompar_lts_cy_9_CYMUXG2_1927
    );
  Mcompar_lts_cy_9_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X33Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_9_IBUF_808,
      O => Mcompar_lts_cy_9_CY0G_1925
    );
  Mcompar_lts_cy_9_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(9),
      O => Mcompar_lts_cy_9_CYSELG_1917
    );
  Mcompar_lts_lut_9_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X33Y12"
    )
    port map (
      ADR0 => b_9_IBUF_828,
      ADR1 => a_9_IBUF_808,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_lts_lut(9)
    );
  Mcompar_lts_cy_11_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y13"
    )
    port map (
      IA => Mcompar_lts_cy_11_CY0F_1971,
      IB => Mcompar_lts_cy_11_CY0F_1971,
      SEL => Mcompar_lts_cy_11_CYSELF_1962,
      O => Mcompar_lts_cy_11_CYMUXF2_1957
    );
  Mcompar_lts_cy_11_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X33Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_10_IBUF_811,
      O => Mcompar_lts_cy_11_CY0F_1971
    );
  Mcompar_lts_cy_11_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(10),
      O => Mcompar_lts_cy_11_CYSELF_1962
    );
  Mcompar_lts_cy_11_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_cy_9_CYMUXFAST_1930,
      O => Mcompar_lts_cy_11_FASTCARRY_1959
    );
  Mcompar_lts_cy_11_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y13"
    )
    port map (
      I0 => Mcompar_lts_cy_11_CYSELG_1948,
      I1 => Mcompar_lts_cy_11_CYSELF_1962,
      O => Mcompar_lts_cy_11_CYAND_1960
    );
  Mcompar_lts_cy_11_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y13"
    )
    port map (
      IA => Mcompar_lts_cy_11_CYMUXG2_1958,
      IB => Mcompar_lts_cy_11_FASTCARRY_1959,
      SEL => Mcompar_lts_cy_11_CYAND_1960,
      O => Mcompar_lts_cy_11_CYMUXFAST_1961
    );
  Mcompar_lts_cy_11_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y13"
    )
    port map (
      IA => Mcompar_lts_cy_11_CY0G_1956,
      IB => Mcompar_lts_cy_11_CYMUXF2_1957,
      SEL => Mcompar_lts_cy_11_CYSELG_1948,
      O => Mcompar_lts_cy_11_CYMUXG2_1958
    );
  Mcompar_lts_cy_11_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X33Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_11_IBUF_813,
      O => Mcompar_lts_cy_11_CY0G_1956
    );
  Mcompar_lts_cy_11_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(11),
      O => Mcompar_lts_cy_11_CYSELG_1948
    );
  Mcompar_lts_lut_11_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X33Y13"
    )
    port map (
      ADR0 => a_11_IBUF_813,
      ADR1 => b_11_IBUF_831,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_lts_lut(11)
    );
  Mcompar_lts_cy_13_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y14"
    )
    port map (
      IA => Mcompar_lts_cy_13_CY0F_2002,
      IB => Mcompar_lts_cy_13_CY0F_2002,
      SEL => Mcompar_lts_cy_13_CYSELF_1993,
      O => Mcompar_lts_cy_13_CYMUXF2_1988
    );
  Mcompar_lts_cy_13_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X33Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_12_IBUF_833,
      O => Mcompar_lts_cy_13_CY0F_2002
    );
  Mcompar_lts_cy_13_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(12),
      O => Mcompar_lts_cy_13_CYSELF_1993
    );
  Mcompar_lts_cy_13_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_cy_11_CYMUXFAST_1961,
      O => Mcompar_lts_cy_13_FASTCARRY_1990
    );
  Mcompar_lts_cy_13_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y14"
    )
    port map (
      I0 => Mcompar_lts_cy_13_CYSELG_1979,
      I1 => Mcompar_lts_cy_13_CYSELF_1993,
      O => Mcompar_lts_cy_13_CYAND_1991
    );
  Mcompar_lts_cy_13_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y14"
    )
    port map (
      IA => Mcompar_lts_cy_13_CYMUXG2_1989,
      IB => Mcompar_lts_cy_13_FASTCARRY_1990,
      SEL => Mcompar_lts_cy_13_CYAND_1991,
      O => Mcompar_lts_cy_13_CYMUXFAST_1992
    );
  Mcompar_lts_cy_13_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y14"
    )
    port map (
      IA => Mcompar_lts_cy_13_CY0G_1987,
      IB => Mcompar_lts_cy_13_CYMUXF2_1988,
      SEL => Mcompar_lts_cy_13_CYSELG_1979,
      O => Mcompar_lts_cy_13_CYMUXG2_1989
    );
  Mcompar_lts_cy_13_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X33Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_13_IBUF_835,
      O => Mcompar_lts_cy_13_CY0G_1987
    );
  Mcompar_lts_cy_13_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(13),
      O => Mcompar_lts_cy_13_CYSELG_1979
    );
  Mcompar_lts_lut_13_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X33Y14"
    )
    port map (
      ADR0 => a_13_IBUF_835,
      ADR1 => b_13_IBUF_836,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_lts_lut(13)
    );
  Mcompar_lts_cy_15_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y15"
    )
    port map (
      IA => Mcompar_lts_cy_15_CY0F_2033,
      IB => Mcompar_lts_cy_15_CY0F_2033,
      SEL => Mcompar_lts_cy_15_CYSELF_2024,
      O => Mcompar_lts_cy_15_CYMUXF2_2019
    );
  Mcompar_lts_cy_15_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X33Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_14_IBUF_838,
      O => Mcompar_lts_cy_15_CY0F_2033
    );
  Mcompar_lts_cy_15_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(14),
      O => Mcompar_lts_cy_15_CYSELF_2024
    );
  Mcompar_lts_cy_15_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_cy_13_CYMUXFAST_1992,
      O => Mcompar_lts_cy_15_FASTCARRY_2021
    );
  Mcompar_lts_cy_15_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y15"
    )
    port map (
      I0 => Mcompar_lts_cy_15_CYSELG_2010,
      I1 => Mcompar_lts_cy_15_CYSELF_2024,
      O => Mcompar_lts_cy_15_CYAND_2022
    );
  Mcompar_lts_cy_15_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y15"
    )
    port map (
      IA => Mcompar_lts_cy_15_CYMUXG2_2020,
      IB => Mcompar_lts_cy_15_FASTCARRY_2021,
      SEL => Mcompar_lts_cy_15_CYAND_2022,
      O => Mcompar_lts_cy_15_CYMUXFAST_2023
    );
  Mcompar_lts_cy_15_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y15"
    )
    port map (
      IA => Mcompar_lts_cy_15_CY0G_2018,
      IB => Mcompar_lts_cy_15_CYMUXF2_2019,
      SEL => Mcompar_lts_cy_15_CYSELG_2010,
      O => Mcompar_lts_cy_15_CYMUXG2_2020
    );
  Mcompar_lts_cy_15_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X33Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_15_IBUF_841,
      O => Mcompar_lts_cy_15_CY0G_2018
    );
  Mcompar_lts_cy_15_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_lut(15),
      O => Mcompar_lts_cy_15_CYSELG_2010
    );
  Mcompar_lts_lut_15_Q : X_LUT4
    generic map(
      INIT => X"C3C3",
      LOC => "SLICE_X33Y15"
    )
    port map (
      ADR0 => VCC,
      ADR1 => b_15_IBUF_841,
      ADR2 => a_15_IBUF_840,
      ADR3 => VCC,
      O => Mcompar_lts_lut(15)
    );
  s_addsub0000_0_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y22",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_0_XORF_2068,
      O => s_addsub0000(0)
    );
  s_addsub0000_0_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X28Y22"
    )
    port map (
      I0 => s_addsub0000_0_CYINIT_2067,
      I1 => Msub_s_addsub0000_lut(0),
      O => s_addsub0000_0_XORF_2068
    );
  s_addsub0000_0_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X28Y22"
    )
    port map (
      IA => s_addsub0000_0_CY0F_2066,
      IB => s_addsub0000_0_CYINIT_2067,
      SEL => s_addsub0000_0_CYSELF_2058,
      O => Msub_s_addsub0000_cy(0)
    );
  s_addsub0000_0_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X28Y22",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_0_BXINV_2056,
      O => s_addsub0000_0_CYINIT_2067
    );
  s_addsub0000_0_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X28Y22",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_0_IBUF_786,
      O => s_addsub0000_0_CY0F_2066
    );
  s_addsub0000_0_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X28Y22",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(0),
      O => s_addsub0000_0_CYSELF_2058
    );
  s_addsub0000_0_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X28Y22",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => s_addsub0000_0_BXINV_2056
    );
  s_addsub0000_0_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y22",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_0_XORG_2054,
      O => s_addsub0000(1)
    );
  s_addsub0000_0_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X28Y22"
    )
    port map (
      I0 => Msub_s_addsub0000_cy(0),
      I1 => Msub_s_addsub0000_lut(1),
      O => s_addsub0000_0_XORG_2054
    );
  s_addsub0000_0_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y22",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_0_CYMUXG_2053,
      O => Msub_s_addsub0000_cy(1)
    );
  s_addsub0000_0_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X28Y22"
    )
    port map (
      IA => s_addsub0000_0_CY0G_2051,
      IB => Msub_s_addsub0000_cy(0),
      SEL => s_addsub0000_0_CYSELG_2043,
      O => s_addsub0000_0_CYMUXG_2053
    );
  s_addsub0000_0_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X28Y22",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_IBUF_788,
      O => s_addsub0000_0_CY0G_2051
    );
  s_addsub0000_0_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X28Y22",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(1),
      O => s_addsub0000_0_CYSELG_2043
    );
  Msub_s_addsub0000_lut_1_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X28Y22"
    )
    port map (
      ADR0 => b_1_IBUF_816,
      ADR1 => a_1_IBUF_788,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Msub_s_addsub0000_lut(1)
    );
  s_addsub0000_2_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_2_XORF_2107,
      O => s_addsub0000(2)
    );
  s_addsub0000_2_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X28Y23"
    )
    port map (
      I0 => s_addsub0000_2_CYINIT_2106,
      I1 => Msub_s_addsub0000_lut(2),
      O => s_addsub0000_2_XORF_2107
    );
  s_addsub0000_2_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X28Y23"
    )
    port map (
      IA => s_addsub0000_2_CY0F_2105,
      IB => s_addsub0000_2_CYINIT_2106,
      SEL => s_addsub0000_2_CYSELF_2093,
      O => Msub_s_addsub0000_cy(2)
    );
  s_addsub0000_2_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y23"
    )
    port map (
      IA => s_addsub0000_2_CY0F_2105,
      IB => s_addsub0000_2_CY0F_2105,
      SEL => s_addsub0000_2_CYSELF_2093,
      O => s_addsub0000_2_CYMUXF2_2088
    );
  s_addsub0000_2_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X28Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(1),
      O => s_addsub0000_2_CYINIT_2106
    );
  s_addsub0000_2_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X28Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_IBUF_791,
      O => s_addsub0000_2_CY0F_2105
    );
  s_addsub0000_2_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X28Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(2),
      O => s_addsub0000_2_CYSELF_2093
    );
  s_addsub0000_2_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_2_XORG_2095,
      O => s_addsub0000(3)
    );
  s_addsub0000_2_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X28Y23"
    )
    port map (
      I0 => Msub_s_addsub0000_cy(2),
      I1 => Msub_s_addsub0000_lut(3),
      O => s_addsub0000_2_XORG_2095
    );
  s_addsub0000_2_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_2_CYMUXFAST_2092,
      O => Msub_s_addsub0000_cy(3)
    );
  s_addsub0000_2_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X28Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(1),
      O => s_addsub0000_2_FASTCARRY_2090
    );
  s_addsub0000_2_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X28Y23"
    )
    port map (
      I0 => s_addsub0000_2_CYSELG_2079,
      I1 => s_addsub0000_2_CYSELF_2093,
      O => s_addsub0000_2_CYAND_2091
    );
  s_addsub0000_2_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X28Y23"
    )
    port map (
      IA => s_addsub0000_2_CYMUXG2_2089,
      IB => s_addsub0000_2_FASTCARRY_2090,
      SEL => s_addsub0000_2_CYAND_2091,
      O => s_addsub0000_2_CYMUXFAST_2092
    );
  s_addsub0000_2_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y23"
    )
    port map (
      IA => s_addsub0000_2_CY0G_2087,
      IB => s_addsub0000_2_CYMUXF2_2088,
      SEL => s_addsub0000_2_CYSELG_2079,
      O => s_addsub0000_2_CYMUXG2_2089
    );
  s_addsub0000_2_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X28Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_IBUF_793,
      O => s_addsub0000_2_CY0G_2087
    );
  s_addsub0000_2_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X28Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(3),
      O => s_addsub0000_2_CYSELG_2079
    );
  Msub_s_addsub0000_lut_3_Q : X_LUT4
    generic map(
      INIT => X"AA55",
      LOC => "SLICE_X28Y23"
    )
    port map (
      ADR0 => a_3_IBUF_793,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => b_3_IBUF_819,
      O => Msub_s_addsub0000_lut(3)
    );
  s_addsub0000_4_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_4_XORF_2146,
      O => s_addsub0000(4)
    );
  s_addsub0000_4_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X28Y24"
    )
    port map (
      I0 => s_addsub0000_4_CYINIT_2145,
      I1 => Msub_s_addsub0000_lut(4),
      O => s_addsub0000_4_XORF_2146
    );
  s_addsub0000_4_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X28Y24"
    )
    port map (
      IA => s_addsub0000_4_CY0F_2144,
      IB => s_addsub0000_4_CYINIT_2145,
      SEL => s_addsub0000_4_CYSELF_2132,
      O => Msub_s_addsub0000_cy(4)
    );
  s_addsub0000_4_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y24"
    )
    port map (
      IA => s_addsub0000_4_CY0F_2144,
      IB => s_addsub0000_4_CY0F_2144,
      SEL => s_addsub0000_4_CYSELF_2132,
      O => s_addsub0000_4_CYMUXF2_2127
    );
  s_addsub0000_4_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X28Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(3),
      O => s_addsub0000_4_CYINIT_2145
    );
  s_addsub0000_4_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X28Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_4_IBUF_796,
      O => s_addsub0000_4_CY0F_2144
    );
  s_addsub0000_4_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X28Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(4),
      O => s_addsub0000_4_CYSELF_2132
    );
  s_addsub0000_4_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_4_XORG_2134,
      O => s_addsub0000(5)
    );
  s_addsub0000_4_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X28Y24"
    )
    port map (
      I0 => Msub_s_addsub0000_cy(4),
      I1 => Msub_s_addsub0000_lut(5),
      O => s_addsub0000_4_XORG_2134
    );
  s_addsub0000_4_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_4_CYMUXFAST_2131,
      O => Msub_s_addsub0000_cy(5)
    );
  s_addsub0000_4_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X28Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(3),
      O => s_addsub0000_4_FASTCARRY_2129
    );
  s_addsub0000_4_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X28Y24"
    )
    port map (
      I0 => s_addsub0000_4_CYSELG_2118,
      I1 => s_addsub0000_4_CYSELF_2132,
      O => s_addsub0000_4_CYAND_2130
    );
  s_addsub0000_4_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X28Y24"
    )
    port map (
      IA => s_addsub0000_4_CYMUXG2_2128,
      IB => s_addsub0000_4_FASTCARRY_2129,
      SEL => s_addsub0000_4_CYAND_2130,
      O => s_addsub0000_4_CYMUXFAST_2131
    );
  s_addsub0000_4_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y24"
    )
    port map (
      IA => s_addsub0000_4_CY0G_2126,
      IB => s_addsub0000_4_CYMUXF2_2127,
      SEL => s_addsub0000_4_CYSELG_2118,
      O => s_addsub0000_4_CYMUXG2_2128
    );
  s_addsub0000_4_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X28Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_5_IBUF_798,
      O => s_addsub0000_4_CY0G_2126
    );
  s_addsub0000_4_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X28Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(5),
      O => s_addsub0000_4_CYSELG_2118
    );
  Msub_s_addsub0000_lut_5_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X28Y24"
    )
    port map (
      ADR0 => a_5_IBUF_798,
      ADR1 => b_5_IBUF_822,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Msub_s_addsub0000_lut(5)
    );
  s_addsub0000_6_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_6_XORF_2185,
      O => s_addsub0000(6)
    );
  s_addsub0000_6_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X28Y25"
    )
    port map (
      I0 => s_addsub0000_6_CYINIT_2184,
      I1 => Msub_s_addsub0000_lut(6),
      O => s_addsub0000_6_XORF_2185
    );
  s_addsub0000_6_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X28Y25"
    )
    port map (
      IA => s_addsub0000_6_CY0F_2183,
      IB => s_addsub0000_6_CYINIT_2184,
      SEL => s_addsub0000_6_CYSELF_2171,
      O => Msub_s_addsub0000_cy(6)
    );
  s_addsub0000_6_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y25"
    )
    port map (
      IA => s_addsub0000_6_CY0F_2183,
      IB => s_addsub0000_6_CY0F_2183,
      SEL => s_addsub0000_6_CYSELF_2171,
      O => s_addsub0000_6_CYMUXF2_2166
    );
  s_addsub0000_6_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X28Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(5),
      O => s_addsub0000_6_CYINIT_2184
    );
  s_addsub0000_6_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X28Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_6_IBUF_801,
      O => s_addsub0000_6_CY0F_2183
    );
  s_addsub0000_6_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X28Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(6),
      O => s_addsub0000_6_CYSELF_2171
    );
  s_addsub0000_6_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_6_XORG_2173,
      O => s_addsub0000(7)
    );
  s_addsub0000_6_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X28Y25"
    )
    port map (
      I0 => Msub_s_addsub0000_cy(6),
      I1 => Msub_s_addsub0000_lut(7),
      O => s_addsub0000_6_XORG_2173
    );
  s_addsub0000_6_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_6_CYMUXFAST_2170,
      O => Msub_s_addsub0000_cy(7)
    );
  s_addsub0000_6_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X28Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(5),
      O => s_addsub0000_6_FASTCARRY_2168
    );
  s_addsub0000_6_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X28Y25"
    )
    port map (
      I0 => s_addsub0000_6_CYSELG_2157,
      I1 => s_addsub0000_6_CYSELF_2171,
      O => s_addsub0000_6_CYAND_2169
    );
  s_addsub0000_6_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X28Y25"
    )
    port map (
      IA => s_addsub0000_6_CYMUXG2_2167,
      IB => s_addsub0000_6_FASTCARRY_2168,
      SEL => s_addsub0000_6_CYAND_2169,
      O => s_addsub0000_6_CYMUXFAST_2170
    );
  s_addsub0000_6_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y25"
    )
    port map (
      IA => s_addsub0000_6_CY0G_2165,
      IB => s_addsub0000_6_CYMUXF2_2166,
      SEL => s_addsub0000_6_CYSELG_2157,
      O => s_addsub0000_6_CYMUXG2_2167
    );
  s_addsub0000_6_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X28Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_7_IBUF_803,
      O => s_addsub0000_6_CY0G_2165
    );
  s_addsub0000_6_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X28Y25",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(7),
      O => s_addsub0000_6_CYSELG_2157
    );
  Msub_s_addsub0000_lut_7_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X28Y25"
    )
    port map (
      ADR0 => a_7_IBUF_803,
      ADR1 => b_7_IBUF_825,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Msub_s_addsub0000_lut(7)
    );
  s_addsub0000_8_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_8_XORF_2224,
      O => s_addsub0000(8)
    );
  s_addsub0000_8_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X28Y26"
    )
    port map (
      I0 => s_addsub0000_8_CYINIT_2223,
      I1 => Msub_s_addsub0000_lut(8),
      O => s_addsub0000_8_XORF_2224
    );
  s_addsub0000_8_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X28Y26"
    )
    port map (
      IA => s_addsub0000_8_CY0F_2222,
      IB => s_addsub0000_8_CYINIT_2223,
      SEL => s_addsub0000_8_CYSELF_2210,
      O => Msub_s_addsub0000_cy(8)
    );
  s_addsub0000_8_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y26"
    )
    port map (
      IA => s_addsub0000_8_CY0F_2222,
      IB => s_addsub0000_8_CY0F_2222,
      SEL => s_addsub0000_8_CYSELF_2210,
      O => s_addsub0000_8_CYMUXF2_2205
    );
  s_addsub0000_8_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X28Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(7),
      O => s_addsub0000_8_CYINIT_2223
    );
  s_addsub0000_8_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X28Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_8_IBUF_806,
      O => s_addsub0000_8_CY0F_2222
    );
  s_addsub0000_8_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X28Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(8),
      O => s_addsub0000_8_CYSELF_2210
    );
  s_addsub0000_8_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_8_XORG_2212,
      O => s_addsub0000(9)
    );
  s_addsub0000_8_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X28Y26"
    )
    port map (
      I0 => Msub_s_addsub0000_cy(8),
      I1 => Msub_s_addsub0000_lut(9),
      O => s_addsub0000_8_XORG_2212
    );
  s_addsub0000_8_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_8_CYMUXFAST_2209,
      O => Msub_s_addsub0000_cy(9)
    );
  s_addsub0000_8_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X28Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(7),
      O => s_addsub0000_8_FASTCARRY_2207
    );
  s_addsub0000_8_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X28Y26"
    )
    port map (
      I0 => s_addsub0000_8_CYSELG_2196,
      I1 => s_addsub0000_8_CYSELF_2210,
      O => s_addsub0000_8_CYAND_2208
    );
  s_addsub0000_8_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X28Y26"
    )
    port map (
      IA => s_addsub0000_8_CYMUXG2_2206,
      IB => s_addsub0000_8_FASTCARRY_2207,
      SEL => s_addsub0000_8_CYAND_2208,
      O => s_addsub0000_8_CYMUXFAST_2209
    );
  s_addsub0000_8_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y26"
    )
    port map (
      IA => s_addsub0000_8_CY0G_2204,
      IB => s_addsub0000_8_CYMUXF2_2205,
      SEL => s_addsub0000_8_CYSELG_2196,
      O => s_addsub0000_8_CYMUXG2_2206
    );
  s_addsub0000_8_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X28Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_9_IBUF_808,
      O => s_addsub0000_8_CY0G_2204
    );
  s_addsub0000_8_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X28Y26",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(9),
      O => s_addsub0000_8_CYSELG_2196
    );
  Msub_s_addsub0000_lut_9_Q : X_LUT4
    generic map(
      INIT => X"CC33",
      LOC => "SLICE_X28Y26"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_9_IBUF_808,
      ADR2 => VCC,
      ADR3 => b_9_IBUF_828,
      O => Msub_s_addsub0000_lut(9)
    );
  s_addsub0000_10_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_10_XORF_2263,
      O => s_addsub0000(10)
    );
  s_addsub0000_10_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X28Y27"
    )
    port map (
      I0 => s_addsub0000_10_CYINIT_2262,
      I1 => Msub_s_addsub0000_lut(10),
      O => s_addsub0000_10_XORF_2263
    );
  s_addsub0000_10_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X28Y27"
    )
    port map (
      IA => s_addsub0000_10_CY0F_2261,
      IB => s_addsub0000_10_CYINIT_2262,
      SEL => s_addsub0000_10_CYSELF_2249,
      O => Msub_s_addsub0000_cy(10)
    );
  s_addsub0000_10_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y27"
    )
    port map (
      IA => s_addsub0000_10_CY0F_2261,
      IB => s_addsub0000_10_CY0F_2261,
      SEL => s_addsub0000_10_CYSELF_2249,
      O => s_addsub0000_10_CYMUXF2_2244
    );
  s_addsub0000_10_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X28Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(9),
      O => s_addsub0000_10_CYINIT_2262
    );
  s_addsub0000_10_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X28Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_10_IBUF_811,
      O => s_addsub0000_10_CY0F_2261
    );
  s_addsub0000_10_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X28Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(10),
      O => s_addsub0000_10_CYSELF_2249
    );
  s_addsub0000_10_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_10_XORG_2251,
      O => s_addsub0000(11)
    );
  s_addsub0000_10_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X28Y27"
    )
    port map (
      I0 => Msub_s_addsub0000_cy(10),
      I1 => Msub_s_addsub0000_lut(11),
      O => s_addsub0000_10_XORG_2251
    );
  s_addsub0000_10_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_10_CYMUXFAST_2248,
      O => Msub_s_addsub0000_cy(11)
    );
  s_addsub0000_10_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X28Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(9),
      O => s_addsub0000_10_FASTCARRY_2246
    );
  s_addsub0000_10_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X28Y27"
    )
    port map (
      I0 => s_addsub0000_10_CYSELG_2235,
      I1 => s_addsub0000_10_CYSELF_2249,
      O => s_addsub0000_10_CYAND_2247
    );
  s_addsub0000_10_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X28Y27"
    )
    port map (
      IA => s_addsub0000_10_CYMUXG2_2245,
      IB => s_addsub0000_10_FASTCARRY_2246,
      SEL => s_addsub0000_10_CYAND_2247,
      O => s_addsub0000_10_CYMUXFAST_2248
    );
  s_addsub0000_10_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y27"
    )
    port map (
      IA => s_addsub0000_10_CY0G_2243,
      IB => s_addsub0000_10_CYMUXF2_2244,
      SEL => s_addsub0000_10_CYSELG_2235,
      O => s_addsub0000_10_CYMUXG2_2245
    );
  s_addsub0000_10_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X28Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_11_IBUF_813,
      O => s_addsub0000_10_CY0G_2243
    );
  s_addsub0000_10_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X28Y27",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(11),
      O => s_addsub0000_10_CYSELG_2235
    );
  Msub_s_addsub0000_lut_11_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X28Y27"
    )
    port map (
      ADR0 => a_11_IBUF_813,
      ADR1 => b_11_IBUF_831,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Msub_s_addsub0000_lut(11)
    );
  s_addsub0000_12_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_12_XORF_2302,
      O => s_addsub0000(12)
    );
  s_addsub0000_12_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X28Y28"
    )
    port map (
      I0 => s_addsub0000_12_CYINIT_2301,
      I1 => Msub_s_addsub0000_lut(12),
      O => s_addsub0000_12_XORF_2302
    );
  s_addsub0000_12_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X28Y28"
    )
    port map (
      IA => s_addsub0000_12_CY0F_2300,
      IB => s_addsub0000_12_CYINIT_2301,
      SEL => s_addsub0000_12_CYSELF_2288,
      O => Msub_s_addsub0000_cy(12)
    );
  s_addsub0000_12_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y28"
    )
    port map (
      IA => s_addsub0000_12_CY0F_2300,
      IB => s_addsub0000_12_CY0F_2300,
      SEL => s_addsub0000_12_CYSELF_2288,
      O => s_addsub0000_12_CYMUXF2_2283
    );
  s_addsub0000_12_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X28Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(11),
      O => s_addsub0000_12_CYINIT_2301
    );
  s_addsub0000_12_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X28Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_12_IBUF_833,
      O => s_addsub0000_12_CY0F_2300
    );
  s_addsub0000_12_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X28Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(12),
      O => s_addsub0000_12_CYSELF_2288
    );
  s_addsub0000_12_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_12_XORG_2290,
      O => s_addsub0000(13)
    );
  s_addsub0000_12_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X28Y28"
    )
    port map (
      I0 => Msub_s_addsub0000_cy(12),
      I1 => Msub_s_addsub0000_lut(13),
      O => s_addsub0000_12_XORG_2290
    );
  s_addsub0000_12_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_12_CYMUXFAST_2287,
      O => Msub_s_addsub0000_cy(13)
    );
  s_addsub0000_12_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X28Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(11),
      O => s_addsub0000_12_FASTCARRY_2285
    );
  s_addsub0000_12_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X28Y28"
    )
    port map (
      I0 => s_addsub0000_12_CYSELG_2274,
      I1 => s_addsub0000_12_CYSELF_2288,
      O => s_addsub0000_12_CYAND_2286
    );
  s_addsub0000_12_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X28Y28"
    )
    port map (
      IA => s_addsub0000_12_CYMUXG2_2284,
      IB => s_addsub0000_12_FASTCARRY_2285,
      SEL => s_addsub0000_12_CYAND_2286,
      O => s_addsub0000_12_CYMUXFAST_2287
    );
  s_addsub0000_12_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y28"
    )
    port map (
      IA => s_addsub0000_12_CY0G_2282,
      IB => s_addsub0000_12_CYMUXF2_2283,
      SEL => s_addsub0000_12_CYSELG_2274,
      O => s_addsub0000_12_CYMUXG2_2284
    );
  s_addsub0000_12_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X28Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_13_IBUF_835,
      O => s_addsub0000_12_CY0G_2282
    );
  s_addsub0000_12_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X28Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(13),
      O => s_addsub0000_12_CYSELG_2274
    );
  Msub_s_addsub0000_lut_13_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X28Y28"
    )
    port map (
      ADR0 => a_13_IBUF_835,
      ADR1 => b_13_IBUF_836,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Msub_s_addsub0000_lut(13)
    );
  s_addsub0000_14_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_14_XORF_2341,
      O => s_addsub0000(14)
    );
  s_addsub0000_14_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X28Y29"
    )
    port map (
      I0 => s_addsub0000_14_CYINIT_2340,
      I1 => Msub_s_addsub0000_lut(14),
      O => s_addsub0000_14_XORF_2341
    );
  s_addsub0000_14_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X28Y29"
    )
    port map (
      IA => s_addsub0000_14_CY0F_2339,
      IB => s_addsub0000_14_CYINIT_2340,
      SEL => s_addsub0000_14_CYSELF_2327,
      O => Msub_s_addsub0000_cy(14)
    );
  s_addsub0000_14_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y29"
    )
    port map (
      IA => s_addsub0000_14_CY0F_2339,
      IB => s_addsub0000_14_CY0F_2339,
      SEL => s_addsub0000_14_CYSELF_2327,
      O => s_addsub0000_14_CYMUXF2_2322
    );
  s_addsub0000_14_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X28Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(13),
      O => s_addsub0000_14_CYINIT_2340
    );
  s_addsub0000_14_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X28Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_14_IBUF_838,
      O => s_addsub0000_14_CY0F_2339
    );
  s_addsub0000_14_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X28Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(14),
      O => s_addsub0000_14_CYSELF_2327
    );
  s_addsub0000_14_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_14_XORG_2329,
      O => s_addsub0000(15)
    );
  s_addsub0000_14_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X28Y29"
    )
    port map (
      I0 => Msub_s_addsub0000_cy(14),
      I1 => Msub_s_addsub0000_lut(15),
      O => s_addsub0000_14_XORG_2329
    );
  s_addsub0000_14_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X28Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_cy(13),
      O => s_addsub0000_14_FASTCARRY_2324
    );
  s_addsub0000_14_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X28Y29"
    )
    port map (
      I0 => s_addsub0000_14_CYSELG_2313,
      I1 => s_addsub0000_14_CYSELF_2327,
      O => s_addsub0000_14_CYAND_2325
    );
  s_addsub0000_14_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X28Y29"
    )
    port map (
      IA => s_addsub0000_14_CYMUXG2_2323,
      IB => s_addsub0000_14_FASTCARRY_2324,
      SEL => s_addsub0000_14_CYAND_2325,
      O => s_addsub0000_14_CYMUXFAST_2326
    );
  s_addsub0000_14_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X28Y29"
    )
    port map (
      IA => s_addsub0000_14_CY0G_2321,
      IB => s_addsub0000_14_CYMUXF2_2322,
      SEL => s_addsub0000_14_CYSELG_2313,
      O => s_addsub0000_14_CYMUXG2_2323
    );
  s_addsub0000_14_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X28Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_15_IBUF_840,
      O => s_addsub0000_14_CY0G_2321
    );
  s_addsub0000_14_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X28Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => Msub_s_addsub0000_lut(15),
      O => s_addsub0000_14_CYSELG_2313
    );
  Msub_s_addsub0000_lut_15_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X28Y29"
    )
    port map (
      ADR0 => a_15_IBUF_840,
      ADR1 => b_15_IBUF_841,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Msub_s_addsub0000_lut(15)
    );
  Mcompar_eq_cy_1_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y21"
    )
    port map (
      O => Mcompar_eq_cy_1_LOGIC_ZERO_2375
    );
  Mcompar_eq_cy_1_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X33Y21"
    )
    port map (
      IA => Mcompar_eq_cy_1_LOGIC_ZERO_2375,
      IB => Mcompar_eq_cy_1_CYINIT_2386,
      SEL => Mcompar_eq_cy_1_CYSELF_2380,
      O => Mcompar_eq_cy(0)
    );
  Mcompar_eq_cy_1_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X33Y21",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_eq_cy_1_BXINV_2378,
      O => Mcompar_eq_cy_1_CYINIT_2386
    );
  Mcompar_eq_cy_1_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y21",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_eq_lut(0),
      O => Mcompar_eq_cy_1_CYSELF_2380
    );
  Mcompar_eq_cy_1_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X33Y21",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => Mcompar_eq_cy_1_BXINV_2378
    );
  Mcompar_eq_cy_1_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X33Y21"
    )
    port map (
      IA => Mcompar_eq_cy_1_LOGIC_ZERO_2375,
      IB => Mcompar_eq_cy(0),
      SEL => Mcompar_eq_cy_1_CYSELG_2369,
      O => Mcompar_eq_cy_1_CYMUXG_2377
    );
  Mcompar_eq_cy_1_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y21",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_eq_lut(1),
      O => Mcompar_eq_cy_1_CYSELG_2369
    );
  Mcompar_eq_lut_1_Q : X_LUT4
    generic map(
      INIT => X"8241",
      LOC => "SLICE_X33Y21"
    )
    port map (
      ADR0 => a_3_IBUF_793,
      ADR1 => b_2_IBUF_818,
      ADR2 => a_2_IBUF_791,
      ADR3 => b_3_IBUF_819,
      O => Mcompar_eq_lut(1)
    );
  Mcompar_eq_cy_3_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y22"
    )
    port map (
      O => Mcompar_eq_cy_3_LOGIC_ZERO_2404
    );
  Mcompar_eq_cy_3_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y22"
    )
    port map (
      IA => Mcompar_eq_cy_3_LOGIC_ZERO_2404,
      IB => Mcompar_eq_cy_3_LOGIC_ZERO_2404,
      SEL => Mcompar_eq_cy_3_CYSELF_2410,
      O => Mcompar_eq_cy_3_CYMUXF2_2405
    );
  Mcompar_eq_cy_3_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y22",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_eq_lut(2),
      O => Mcompar_eq_cy_3_CYSELF_2410
    );
  Mcompar_eq_cy_3_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y22",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_eq_cy_1_CYMUXG_2377,
      O => Mcompar_eq_cy_3_FASTCARRY_2407
    );
  Mcompar_eq_cy_3_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y22"
    )
    port map (
      I0 => Mcompar_eq_cy_3_CYSELG_2398,
      I1 => Mcompar_eq_cy_3_CYSELF_2410,
      O => Mcompar_eq_cy_3_CYAND_2408
    );
  Mcompar_eq_cy_3_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y22"
    )
    port map (
      IA => Mcompar_eq_cy_3_CYMUXG2_2406,
      IB => Mcompar_eq_cy_3_FASTCARRY_2407,
      SEL => Mcompar_eq_cy_3_CYAND_2408,
      O => Mcompar_eq_cy_3_CYMUXFAST_2409
    );
  Mcompar_eq_cy_3_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y22"
    )
    port map (
      IA => Mcompar_eq_cy_3_LOGIC_ZERO_2404,
      IB => Mcompar_eq_cy_3_CYMUXF2_2405,
      SEL => Mcompar_eq_cy_3_CYSELG_2398,
      O => Mcompar_eq_cy_3_CYMUXG2_2406
    );
  Mcompar_eq_cy_3_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y22",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_eq_lut(3),
      O => Mcompar_eq_cy_3_CYSELG_2398
    );
  Mcompar_eq_lut_3_Q : X_LUT4
    generic map(
      INIT => X"8241",
      LOC => "SLICE_X33Y22"
    )
    port map (
      ADR0 => a_6_IBUF_801,
      ADR1 => b_7_IBUF_825,
      ADR2 => a_7_IBUF_803,
      ADR3 => b_6_IBUF_824,
      O => Mcompar_eq_lut(3)
    );
  Mcompar_eq_cy_5_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y23"
    )
    port map (
      O => Mcompar_eq_cy_5_LOGIC_ZERO_2434
    );
  Mcompar_eq_cy_5_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y23"
    )
    port map (
      IA => Mcompar_eq_cy_5_LOGIC_ZERO_2434,
      IB => Mcompar_eq_cy_5_LOGIC_ZERO_2434,
      SEL => Mcompar_eq_cy_5_CYSELF_2440,
      O => Mcompar_eq_cy_5_CYMUXF2_2435
    );
  Mcompar_eq_cy_5_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_eq_lut(4),
      O => Mcompar_eq_cy_5_CYSELF_2440
    );
  Mcompar_eq_cy_5_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_eq_cy_3_CYMUXFAST_2409,
      O => Mcompar_eq_cy_5_FASTCARRY_2437
    );
  Mcompar_eq_cy_5_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y23"
    )
    port map (
      I0 => Mcompar_eq_cy_5_CYSELG_2428,
      I1 => Mcompar_eq_cy_5_CYSELF_2440,
      O => Mcompar_eq_cy_5_CYAND_2438
    );
  Mcompar_eq_cy_5_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y23"
    )
    port map (
      IA => Mcompar_eq_cy_5_CYMUXG2_2436,
      IB => Mcompar_eq_cy_5_FASTCARRY_2437,
      SEL => Mcompar_eq_cy_5_CYAND_2438,
      O => Mcompar_eq_cy_5_CYMUXFAST_2439
    );
  Mcompar_eq_cy_5_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y23"
    )
    port map (
      IA => Mcompar_eq_cy_5_LOGIC_ZERO_2434,
      IB => Mcompar_eq_cy_5_CYMUXF2_2435,
      SEL => Mcompar_eq_cy_5_CYSELG_2428,
      O => Mcompar_eq_cy_5_CYMUXG2_2436
    );
  Mcompar_eq_cy_5_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y23",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_eq_lut(5),
      O => Mcompar_eq_cy_5_CYSELG_2428
    );
  Mcompar_eq_lut_5_Q : X_LUT4
    generic map(
      INIT => X"8241",
      LOC => "SLICE_X33Y23"
    )
    port map (
      ADR0 => a_10_IBUF_811,
      ADR1 => b_11_IBUF_831,
      ADR2 => a_11_IBUF_813,
      ADR3 => b_10_IBUF_830,
      O => Mcompar_eq_lut(5)
    );
  eq_OBUF_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y24"
    )
    port map (
      O => eq_OBUF_LOGIC_ZERO_2464
    );
  eq_OBUF_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y24"
    )
    port map (
      IA => eq_OBUF_LOGIC_ZERO_2464,
      IB => eq_OBUF_LOGIC_ZERO_2464,
      SEL => eq_OBUF_CYSELF_2470,
      O => eq_OBUF_CYMUXF2_2465
    );
  eq_OBUF_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_eq_lut(6),
      O => eq_OBUF_CYSELF_2470
    );
  eq_OBUF_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_eq_cy_5_CYMUXFAST_2439,
      O => eq_OBUF_FASTCARRY_2467
    );
  eq_OBUF_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y24"
    )
    port map (
      I0 => eq_OBUF_CYSELG_2458,
      I1 => eq_OBUF_CYSELF_2470,
      O => eq_OBUF_CYAND_2468
    );
  eq_OBUF_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y24"
    )
    port map (
      IA => eq_OBUF_CYMUXG2_2466,
      IB => eq_OBUF_FASTCARRY_2467,
      SEL => eq_OBUF_CYAND_2468,
      O => eq_OBUF_CYMUXFAST_2469
    );
  eq_OBUF_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y24"
    )
    port map (
      IA => eq_OBUF_LOGIC_ZERO_2464,
      IB => eq_OBUF_CYMUXF2_2465,
      SEL => eq_OBUF_CYSELG_2458,
      O => eq_OBUF_CYMUXG2_2466
    );
  eq_OBUF_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y24",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_eq_lut(7),
      O => eq_OBUF_CYSELG_2458
    );
  Mcompar_eq_lut_7_Q : X_LUT4
    generic map(
      INIT => X"8241",
      LOC => "SLICE_X33Y24"
    )
    port map (
      ADR0 => b_14_IBUF_839,
      ADR1 => a_15_IBUF_840,
      ADR2 => b_15_IBUF_841,
      ADR3 => a_14_IBUF_838,
      O => Mcompar_eq_lut(7)
    );
  s_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD2"
    )
    port map (
      I => s_0_O,
      O => s(0)
    );
  s_0_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD2",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(0),
      O => s_0_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD2",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_0_2491,
      O => s_0_O
    );
  s_0 : X_FF
    generic map(
      LOC => "PAD2",
      INIT => '0'
    )
    port map (
      I => s_0_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_0_OUTPUT_OTCLK1INV_2485,
      SET => GND,
      RST => GND,
      O => s_0_2491
    );
  s_0_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD2",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_0_OUTPUT_OTCLK1INV_2485
    );
  s_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD4"
    )
    port map (
      I => s_1_O,
      O => s(1)
    );
  s_1_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD4",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(1),
      O => s_1_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD4",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_1_2508,
      O => s_1_O
    );
  s_1 : X_FF
    generic map(
      LOC => "PAD4",
      INIT => '0'
    )
    port map (
      I => s_1_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_1_OUTPUT_OTCLK1INV_2502,
      SET => GND,
      RST => GND,
      O => s_1_2508
    );
  s_1_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD4",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_1_OUTPUT_OTCLK1INV_2502
    );
  s_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD5"
    )
    port map (
      I => s_2_O,
      O => s(2)
    );
  s_2_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD5",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(2),
      O => s_2_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD5",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_2_2525,
      O => s_2_O
    );
  s_2 : X_FF
    generic map(
      LOC => "PAD5",
      INIT => '0'
    )
    port map (
      I => s_2_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_2_OUTPUT_OTCLK1INV_2519,
      SET => GND,
      RST => GND,
      O => s_2_2525
    );
  s_2_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD5",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_2_OUTPUT_OTCLK1INV_2519
    );
  cin_IBUF : X_BUF
    generic map(
      LOC => "IPAD114",
      PATHPULSE => 638 ps
    )
    port map (
      I => cin,
      O => cin_INBUF
    );
  s_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD11"
    )
    port map (
      I => s_3_O,
      O => s(3)
    );
  s_3_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD11",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(3),
      O => s_3_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD11",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_3_2548,
      O => s_3_O
    );
  s_3 : X_FF
    generic map(
      LOC => "PAD11",
      INIT => '0'
    )
    port map (
      I => s_3_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_3_OUTPUT_OTCLK1INV_2542,
      SET => GND,
      RST => GND,
      O => s_3_2548
    );
  s_3_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD11",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_3_OUTPUT_OTCLK1INV_2542
    );
  acc_en_IBUF : X_BUF
    generic map(
      LOC => "IPAD21",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_en,
      O => acc_en_INBUF
    );
  acc_en_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD21",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_en_INBUF,
      O => acc_en_IBUF_783
    );
  eq_OBUF : X_OBUF
    generic map(
      LOC => "PAD46"
    )
    port map (
      I => eq_O,
      O => eq
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
  s_4_OBUF : X_OBUF
    generic map(
      LOC => "PAD12"
    )
    port map (
      I => s_4_O,
      O => s(4)
    );
  s_4_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD12",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(4),
      O => s_4_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD12",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_4_2585,
      O => s_4_O
    );
  s_4 : X_FF
    generic map(
      LOC => "PAD12",
      INIT => '0'
    )
    port map (
      I => s_4_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_4_OUTPUT_OTCLK1INV_2579,
      SET => GND,
      RST => GND,
      O => s_4_2585
    );
  s_4_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD12",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_4_OUTPUT_OTCLK1INV_2579
    );
  s_5_OBUF : X_OBUF
    generic map(
      LOC => "PAD14"
    )
    port map (
      I => s_5_O,
      O => s(5)
    );
  s_5_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD14",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(5),
      O => s_5_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD14",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_5_2602,
      O => s_5_O
    );
  s_5 : X_FF
    generic map(
      LOC => "PAD14",
      INIT => '0'
    )
    port map (
      I => s_5_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_5_OUTPUT_OTCLK1INV_2596,
      SET => GND,
      RST => GND,
      O => s_5_2602
    );
  s_5_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD14",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_5_OUTPUT_OTCLK1INV_2596
    );
  s_6_OBUF : X_OBUF
    generic map(
      LOC => "PAD15"
    )
    port map (
      I => s_6_O,
      O => s(6)
    );
  s_6_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD15",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(6),
      O => s_6_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD15",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_6_2619,
      O => s_6_O
    );
  s_6 : X_FF
    generic map(
      LOC => "PAD15",
      INIT => '0'
    )
    port map (
      I => s_6_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_6_OUTPUT_OTCLK1INV_2613,
      SET => GND,
      RST => GND,
      O => s_6_2619
    );
  s_6_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD15",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_6_OUTPUT_OTCLK1INV_2613
    );
  s_7_OBUF : X_OBUF
    generic map(
      LOC => "PAD19"
    )
    port map (
      I => s_7_O,
      O => s(7)
    );
  s_7_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD19",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(7),
      O => s_7_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD19",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_7_2636,
      O => s_7_O
    );
  s_7 : X_FF
    generic map(
      LOC => "PAD19",
      INIT => '0'
    )
    port map (
      I => s_7_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_7_OUTPUT_OTCLK1INV_2630,
      SET => GND,
      RST => GND,
      O => s_7_2636
    );
  s_7_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD19",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_7_OUTPUT_OTCLK1INV_2630
    );
  acc_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD47"
    )
    port map (
      I => acc_0_O,
      O => acc(0)
    );
  s_8_OBUF : X_OBUF
    generic map(
      LOC => "PAD20"
    )
    port map (
      I => s_8_O,
      O => s(8)
    );
  s_8_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD20",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(8),
      O => s_8_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_8_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD20",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_8_2661,
      O => s_8_O
    );
  s_8 : X_FF
    generic map(
      LOC => "PAD20",
      INIT => '0'
    )
    port map (
      I => s_8_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_8_OUTPUT_OTCLK1INV_2655,
      SET => GND,
      RST => GND,
      O => s_8_2661
    );
  s_8_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD20",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_8_OUTPUT_OTCLK1INV_2655
    );
  acc_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD48"
    )
    port map (
      I => acc_1_O,
      O => acc(1)
    );
  s_9_OBUF : X_OBUF
    generic map(
      LOC => "PAD23"
    )
    port map (
      I => s_9_O,
      O => s(9)
    );
  s_9_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD23",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(9),
      O => s_9_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_9_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD23",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_9_2686,
      O => s_9_O
    );
  s_9 : X_FF
    generic map(
      LOC => "PAD23",
      INIT => '0'
    )
    port map (
      I => s_9_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_9_OUTPUT_OTCLK1INV_2680,
      SET => GND,
      RST => GND,
      O => s_9_2686
    );
  s_9_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD23",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_9_OUTPUT_OTCLK1INV_2680
    );
  acc_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD49"
    )
    port map (
      I => acc_2_O,
      O => acc(2)
    );
  acc_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD57"
    )
    port map (
      I => acc_3_O,
      O => acc(3)
    );
  acc_4_OBUF : X_OBUF
    generic map(
      LOC => "PAD59"
    )
    port map (
      I => acc_4_O,
      O => acc(4)
    );
  acc_5_OBUF : X_OBUF
    generic map(
      LOC => "PAD60"
    )
    port map (
      I => acc_5_O,
      O => acc(5)
    );
  acc_6_OBUF : X_OBUF
    generic map(
      LOC => "PAD62"
    )
    port map (
      I => acc_6_O,
      O => acc(6)
    );
  acc_7_OBUF : X_OBUF
    generic map(
      LOC => "PAD63"
    )
    port map (
      I => acc_7_O,
      O => acc(7)
    );
  acc_8_OBUF : X_OBUF
    generic map(
      LOC => "PAD64"
    )
    port map (
      I => acc_8_O,
      O => acc(8)
    );
  acc_9_OBUF : X_OBUF
    generic map(
      LOC => "PAD65"
    )
    port map (
      I => acc_9_O,
      O => acc(9)
    );
  s_10_OBUF : X_OBUF
    generic map(
      LOC => "PAD24"
    )
    port map (
      I => s_10_O,
      O => s(10)
    );
  s_10_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD24",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(10),
      O => s_10_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_10_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD24",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_10_2767,
      O => s_10_O
    );
  s_10 : X_FF
    generic map(
      LOC => "PAD24",
      INIT => '0'
    )
    port map (
      I => s_10_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_10_OUTPUT_OTCLK1INV_2761,
      SET => GND,
      RST => GND,
      O => s_10_2767
    );
  s_10_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD24",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_10_OUTPUT_OTCLK1INV_2761
    );
  s_11_OBUF : X_OBUF
    generic map(
      LOC => "PAD26"
    )
    port map (
      I => s_11_O,
      O => s(11)
    );
  s_11_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD26",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(11),
      O => s_11_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_11_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD26",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_11_2784,
      O => s_11_O
    );
  s_11 : X_FF
    generic map(
      LOC => "PAD26",
      INIT => '0'
    )
    port map (
      I => s_11_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_11_OUTPUT_OTCLK1INV_2778,
      SET => GND,
      RST => GND,
      O => s_11_2784
    );
  s_11_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD26",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_11_OUTPUT_OTCLK1INV_2778
    );
  s_12_OBUF : X_OBUF
    generic map(
      LOC => "PAD27"
    )
    port map (
      I => s_12_O,
      O => s(12)
    );
  s_12_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD27",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(12),
      O => s_12_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_12_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD27",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_12_2801,
      O => s_12_O
    );
  s_12 : X_FF
    generic map(
      LOC => "PAD27",
      INIT => '0'
    )
    port map (
      I => s_12_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_12_OUTPUT_OTCLK1INV_2795,
      SET => GND,
      RST => GND,
      O => s_12_2801
    );
  s_12_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD27",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_12_OUTPUT_OTCLK1INV_2795
    );
  s_13_OBUF : X_OBUF
    generic map(
      LOC => "PAD33"
    )
    port map (
      I => s_13_O,
      O => s(13)
    );
  s_13_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD33",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(13),
      O => s_13_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_13_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD33",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_13_2818,
      O => s_13_O
    );
  s_13 : X_FF
    generic map(
      LOC => "PAD33",
      INIT => '0'
    )
    port map (
      I => s_13_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_13_OUTPUT_OTCLK1INV_2812,
      SET => GND,
      RST => GND,
      O => s_13_2818
    );
  s_13_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD33",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_13_OUTPUT_OTCLK1INV_2812
    );
  s_14_OBUF : X_OBUF
    generic map(
      LOC => "PAD34"
    )
    port map (
      I => s_14_O,
      O => s(14)
    );
  s_14_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD34",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(14),
      O => s_14_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_14_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD34",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_14_2835,
      O => s_14_O
    );
  s_14 : X_FF
    generic map(
      LOC => "PAD34",
      INIT => '0'
    )
    port map (
      I => s_14_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_14_OUTPUT_OTCLK1INV_2829,
      SET => GND,
      RST => GND,
      O => s_14_2835
    );
  s_14_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD34",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_14_OUTPUT_OTCLK1INV_2829
    );
  s_15_OBUF : X_OBUF
    generic map(
      LOC => "PAD35"
    )
    port map (
      I => s_15_O,
      O => s(15)
    );
  s_15_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD35",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(15),
      O => s_15_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_15_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD35",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_15_2852,
      O => s_15_O
    );
  s_15 : X_FF
    generic map(
      LOC => "PAD35",
      INIT => '0'
    )
    port map (
      I => s_15_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_15_OUTPUT_OTCLK1INV_2846,
      SET => GND,
      RST => GND,
      O => s_15_2852
    );
  s_15_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD35",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_15_OUTPUT_OTCLK1INV_2846
    );
  s_16_OBUF : X_OBUF
    generic map(
      LOC => "PAD36"
    )
    port map (
      I => s_16_O,
      O => s(16)
    );
  s_16_OUTPUT_OFF_O1_DDRMUX : X_BUF
    generic map(
      LOC => "PAD36",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_mux0000(16),
      O => s_16_OUTPUT_OFF_ODDRIN1_MUX
    );
  s_16_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD36",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_16_2869,
      O => s_16_O
    );
  s_16 : X_FF
    generic map(
      LOC => "PAD36",
      INIT => '0'
    )
    port map (
      I => s_16_OUTPUT_OFF_ODDRIN1_MUX,
      CE => VCC,
      CLK => s_16_OUTPUT_OTCLK1INV_2863,
      SET => GND,
      RST => GND,
      O => s_16_2869
    );
  s_16_OUTPUT_OTCLK1INV : X_BUF
    generic map(
      LOC => "PAD36",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => s_16_OUTPUT_OTCLK1INV_2863
    );
  a_10_IBUF : X_BUF
    generic map(
      LOC => "PAD88",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(10),
      O => a_10_INBUF
    );
  a_10_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD88",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_10_INBUF,
      O => a_10_IBUF_811
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
      O => a_0_IBUF_786
    );
  a_1_IBUF : X_BUF
    generic map(
      LOC => "PAD69",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(1),
      O => a_1_INBUF
    );
  a_1_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD69",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_1_INBUF,
      O => a_1_IBUF_788
    );
  a_11_IBUF : X_BUF
    generic map(
      LOC => "PAD90",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(11),
      O => a_11_INBUF
    );
  a_11_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD90",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_11_INBUF,
      O => a_11_IBUF_813
    );
  a_2_IBUF : X_BUF
    generic map(
      LOC => "PAD70",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(2),
      O => a_2_INBUF
    );
  a_2_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD70",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_2_INBUF,
      O => a_2_IBUF_791
    );
  a_12_IBUF : X_BUF
    generic map(
      LOC => "PAD91",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(12),
      O => a_12_INBUF
    );
  a_12_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD91",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_12_INBUF,
      O => a_12_IBUF_833
    );
  a_3_IBUF : X_BUF
    generic map(
      LOC => "PAD72",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(3),
      O => a_3_INBUF
    );
  a_3_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD72",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_3_INBUF,
      O => a_3_IBUF_793
    );
  a_13_IBUF : X_BUF
    generic map(
      LOC => "PAD92",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(13),
      O => a_13_INBUF
    );
  a_13_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD92",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_13_INBUF,
      O => a_13_IBUF_835
    );
  b_0_IBUF : X_BUF
    generic map(
      LOC => "PAD97",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(0),
      O => b_0_INBUF
    );
  b_0_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD97",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_0_INBUF,
      O => b_0_IBUF_815
    );
  a_4_IBUF : X_BUF
    generic map(
      LOC => "PAD74",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(4),
      O => a_4_INBUF
    );
  a_4_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD74",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_4_INBUF,
      O => a_4_IBUF_796
    );
  a_14_IBUF : X_BUF
    generic map(
      LOC => "PAD93",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(14),
      O => a_14_INBUF
    );
  a_14_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD93",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_14_INBUF,
      O => a_14_IBUF_838
    );
  lts_OBUF : X_OBUF
    generic map(
      LOC => "PAD43"
    )
    port map (
      I => lts_O,
      O => lts
    );
  b_1_IBUF : X_BUF
    generic map(
      LOC => "PAD98",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(1),
      O => b_1_INBUF
    );
  b_1_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD98",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_1_INBUF,
      O => b_1_IBUF_816
    );
  a_5_IBUF : X_BUF
    generic map(
      LOC => "PAD75",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(5),
      O => a_5_INBUF
    );
  a_5_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD75",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_5_INBUF,
      O => a_5_IBUF_798
    );
  a_15_IBUF : X_BUF
    generic map(
      LOC => "PAD94",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(15),
      O => a_15_INBUF
    );
  a_15_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD94",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_15_INBUF,
      O => a_15_IBUF_840
    );
  ltu_OBUF : X_OBUF
    generic map(
      LOC => "PAD42"
    )
    port map (
      I => ltu_O,
      O => ltu
    );
  b_2_IBUF : X_BUF
    generic map(
      LOC => "PAD105",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(2),
      O => b_2_INBUF
    );
  b_2_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD105",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_2_INBUF,
      O => b_2_IBUF_818
    );
  a_6_IBUF : X_BUF
    generic map(
      LOC => "PAD83",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(6),
      O => a_6_INBUF
    );
  a_6_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD83",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_6_INBUF,
      O => a_6_IBUF_801
    );
  b_3_IBUF : X_BUF
    generic map(
      LOC => "PAD106",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(3),
      O => b_3_INBUF
    );
  b_3_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD106",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_3_INBUF,
      O => b_3_IBUF_819
    );
  a_7_IBUF : X_BUF
    generic map(
      LOC => "PAD84",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(7),
      O => a_7_INBUF
    );
  a_7_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD84",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_7_INBUF,
      O => a_7_IBUF_803
    );
  acc_10_OBUF : X_OBUF
    generic map(
      LOC => "PAD67"
    )
    port map (
      I => acc_10_O,
      O => acc(10)
    );
  b_4_IBUF : X_BUF
    generic map(
      LOC => "PAD109",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(4),
      O => b_4_INBUF
    );
  b_4_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD109",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_4_INBUF,
      O => b_4_IBUF_821
    );
  b_10_IBUF : X_BUF
    generic map(
      LOC => "PAD132",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(10),
      O => b_10_INBUF
    );
  b_10_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD132",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_10_INBUF,
      O => b_10_IBUF_830
    );
  a_8_IBUF : X_BUF
    generic map(
      LOC => "PAD85",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(8),
      O => a_8_INBUF
    );
  a_8_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD85",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_8_INBUF,
      O => a_8_IBUF_806
    );
  acc_11_OBUF : X_OBUF
    generic map(
      LOC => "PAD68"
    )
    port map (
      I => acc_11_O,
      O => acc(11)
    );
  b_5_IBUF : X_BUF
    generic map(
      LOC => "PAD110",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(5),
      O => b_5_INBUF
    );
  b_5_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD110",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_5_INBUF,
      O => b_5_IBUF_822
    );
  b_11_IBUF : X_BUF
    generic map(
      LOC => "PAD133",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(11),
      O => b_11_INBUF
    );
  b_11_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD133",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_11_INBUF,
      O => b_11_IBUF_831
    );
  a_9_IBUF : X_BUF
    generic map(
      LOC => "PAD86",
      PATHPULSE => 638 ps
    )
    port map (
      I => a(9),
      O => a_9_INBUF
    );
  a_9_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD86",
      PATHPULSE => 638 ps
    )
    port map (
      I => a_9_INBUF,
      O => a_9_IBUF_808
    );
  b_6_IBUF : X_BUF
    generic map(
      LOC => "PAD111",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(6),
      O => b_6_INBUF
    );
  b_6_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD111",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_6_INBUF,
      O => b_6_IBUF_824
    );
  b_12_IBUF : X_BUF
    generic map(
      LOC => "PAD134",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(12),
      O => b_12_INBUF
    );
  b_12_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD134",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_12_INBUF,
      O => b_12_IBUF_834
    );
  sub_IBUF : X_BUF
    generic map(
      LOC => "IPAD157",
      PATHPULSE => 638 ps
    )
    port map (
      I => sub,
      O => sub_INBUF
    );
  sub_IFF_IMUX : X_BUF
    generic map(
      LOC => "IPAD157",
      PATHPULSE => 638 ps
    )
    port map (
      I => sub_INBUF,
      O => sub_IBUF_923
    );
  b_7_IBUF : X_BUF
    generic map(
      LOC => "PAD112",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(7),
      O => b_7_INBUF
    );
  b_7_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD112",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_7_INBUF,
      O => b_7_IBUF_825
    );
  b_13_IBUF : X_BUF
    generic map(
      LOC => "PAD135",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(13),
      O => b_13_INBUF
    );
  b_13_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD135",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_13_INBUF,
      O => b_13_IBUF_836
    );
  b_8_IBUF : X_BUF
    generic map(
      LOC => "PAD113",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(8),
      O => b_8_INBUF
    );
  b_8_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD113",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_8_INBUF,
      O => b_8_IBUF_827
    );
  b_14_IBUF : X_BUF
    generic map(
      LOC => "PAD136",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(14),
      O => b_14_INBUF
    );
  b_14_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD136",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_14_INBUF,
      O => b_14_IBUF_839
    );
  b_9_IBUF : X_BUF
    generic map(
      LOC => "PAD125",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(9),
      O => b_9_INBUF
    );
  b_9_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD125",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_9_INBUF,
      O => b_9_IBUF_828
    );
  b_15_IBUF : X_BUF
    generic map(
      LOC => "PAD140",
      PATHPULSE => 638 ps
    )
    port map (
      I => b(15),
      O => b_15_INBUF
    );
  b_15_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD140",
      PATHPULSE => 638 ps
    )
    port map (
      I => b_15_INBUF,
      O => b_15_IBUF_841
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
  s_mux0000_3_1 : X_LUT4
    generic map(
      INIT => X"AACC",
      LOC => "SLICE_X28Y35"
    )
    port map (
      ADR0 => s_addsub0000(3),
      ADR1 => s_addsub0001(3),
      ADR2 => VCC,
      ADR3 => sub_IBUF_923,
      O => s_mux0000(3)
    );
  s_mux0000_4_1 : X_LUT4
    generic map(
      INIT => X"AAF0",
      LOC => "SLICE_X28Y32"
    )
    port map (
      ADR0 => s_addsub0000(4),
      ADR1 => VCC,
      ADR2 => s_addsub0001(4),
      ADR3 => sub_IBUF_923,
      O => s_mux0000(4)
    );
  s_mux0000_10_1 : X_LUT4
    generic map(
      INIT => X"CFC0",
      LOC => "SLICE_X29Y39"
    )
    port map (
      ADR0 => VCC,
      ADR1 => s_addsub0000(10),
      ADR2 => sub_IBUF_923,
      ADR3 => s_addsub0001(10),
      O => s_mux0000(10)
    );
  s_mux0000_5_1 : X_LUT4
    generic map(
      INIT => X"CCAA",
      LOC => "SLICE_X28Y36"
    )
    port map (
      ADR0 => s_addsub0001(5),
      ADR1 => s_addsub0000(5),
      ADR2 => VCC,
      ADR3 => sub_IBUF_923,
      O => s_mux0000(5)
    );
  s_mux0000_11_1 : X_LUT4
    generic map(
      INIT => X"ACAC",
      LOC => "SLICE_X28Y39"
    )
    port map (
      ADR0 => s_addsub0000(11),
      ADR1 => s_addsub0001(11),
      ADR2 => sub_IBUF_923,
      ADR3 => VCC,
      O => s_mux0000(11)
    );
  s_mux0000_6_1 : X_LUT4
    generic map(
      INIT => X"E4E4",
      LOC => "SLICE_X26Y29"
    )
    port map (
      ADR0 => sub_IBUF_923,
      ADR1 => s_addsub0001(6),
      ADR2 => s_addsub0000(6),
      ADR3 => VCC,
      O => s_mux0000(6)
    );
  s_mux0000_7_1 : X_LUT4
    generic map(
      INIT => X"FC30",
      LOC => "SLICE_X24Y31"
    )
    port map (
      ADR0 => VCC,
      ADR1 => sub_IBUF_923,
      ADR2 => s_addsub0001(7),
      ADR3 => s_addsub0000(7),
      O => s_mux0000(7)
    );
  s_mux0000_0_1 : X_LUT4
    generic map(
      INIT => X"ACAC",
      LOC => "SLICE_X18Y33"
    )
    port map (
      ADR0 => s_addsub0000(0),
      ADR1 => s_addsub0001(0),
      ADR2 => sub_IBUF_923,
      ADR3 => VCC,
      O => s_mux0000(0)
    );
  s_mux0000_1_1 : X_LUT4
    generic map(
      INIT => X"E4E4",
      LOC => "SLICE_X19Y29"
    )
    port map (
      ADR0 => sub_IBUF_923,
      ADR1 => s_addsub0001(1),
      ADR2 => s_addsub0000(1),
      ADR3 => VCC,
      O => s_mux0000(1)
    );
  acc_1 : X_FF
    generic map(
      LOC => "SLICE_X51Y36",
      INIT => '0'
    )
    port map (
      I => acc_0_DYMUX_950,
      CE => acc_0_CEINV_934,
      CLK => acc_0_CLKINV_935,
      SET => GND,
      RST => GND,
      O => acc_1_787
    );
  Maccum_acc_lut_0_Q : X_LUT4
    generic map(
      INIT => X"55AA",
      LOC => "SLICE_X51Y36"
    )
    port map (
      ADR0 => acc_0_785,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => a_0_IBUF_786,
      O => Maccum_acc_lut(0)
    );
  acc_0 : X_FF
    generic map(
      LOC => "SLICE_X51Y36",
      INIT => '0'
    )
    port map (
      I => acc_0_DXMUX_969,
      CE => acc_0_CEINV_934,
      CLK => acc_0_CLKINV_935,
      SET => GND,
      RST => GND,
      O => acc_0_785
    );
  acc_3 : X_FF
    generic map(
      LOC => "SLICE_X51Y37",
      INIT => '0'
    )
    port map (
      I => acc_2_DYMUX_1005,
      CE => acc_2_CEINV_984,
      CLK => acc_2_CLKINV_985,
      SET => GND,
      RST => GND,
      O => acc_3_792
    );
  Maccum_acc_lut_2_Q : X_LUT4
    generic map(
      INIT => X"3C3C",
      LOC => "SLICE_X51Y37"
    )
    port map (
      ADR0 => VCC,
      ADR1 => acc_2_790,
      ADR2 => a_2_IBUF_791,
      ADR3 => VCC,
      O => Maccum_acc_lut(2)
    );
  Madd_s_addsub0001_lut_6_Q : X_LUT4
    generic map(
      INIT => X"55AA",
      LOC => "SLICE_X29Y26"
    )
    port map (
      ADR0 => a_6_IBUF_801,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => b_6_IBUF_824,
      O => Madd_s_addsub0001_lut(6)
    );
  Madd_s_addsub0001_lut_8_Q : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X29Y27"
    )
    port map (
      ADR0 => b_8_IBUF_827,
      ADR1 => a_8_IBUF_806,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Madd_s_addsub0001_lut(8)
    );
  Mcompar_ltu_lut_0_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X35Y7"
    )
    port map (
      ADR0 => a_0_IBUF_786,
      ADR1 => b_0_IBUF_815,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(0)
    );
  Mcompar_ltu_lut_2_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X35Y8"
    )
    port map (
      ADR0 => b_2_IBUF_818,
      ADR1 => a_2_IBUF_791,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(2)
    );
  Mcompar_ltu_lut_4_Q : X_LUT4
    generic map(
      INIT => X"C3C3",
      LOC => "SLICE_X35Y9"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_4_IBUF_796,
      ADR2 => b_4_IBUF_821,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(4)
    );
  Mcompar_ltu_lut_6_Q : X_LUT4
    generic map(
      INIT => X"CC33",
      LOC => "SLICE_X35Y10"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_6_IBUF_801,
      ADR2 => VCC,
      ADR3 => b_6_IBUF_824,
      O => Mcompar_ltu_lut(6)
    );
  Mcompar_ltu_lut_8_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X35Y11"
    )
    port map (
      ADR0 => b_8_IBUF_827,
      ADR1 => a_8_IBUF_806,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(8)
    );
  Mcompar_ltu_lut_10_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X35Y12"
    )
    port map (
      ADR0 => b_10_IBUF_830,
      ADR1 => a_10_IBUF_811,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(10)
    );
  Mcompar_ltu_lut_12_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X35Y13"
    )
    port map (
      ADR0 => b_12_IBUF_834,
      ADR1 => a_12_IBUF_833,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(12)
    );
  Mcompar_ltu_lut_14_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X35Y14"
    )
    port map (
      ADR0 => b_14_IBUF_839,
      ADR1 => a_14_IBUF_838,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_ltu_lut(14)
    );
  Msub_s_addsub0000_lut_0_Q : X_LUT4
    generic map(
      INIT => X"A5A5",
      LOC => "SLICE_X28Y22"
    )
    port map (
      ADR0 => a_0_IBUF_786,
      ADR1 => VCC,
      ADR2 => b_0_IBUF_815,
      ADR3 => VCC,
      O => Msub_s_addsub0000_lut(0)
    );
  Msub_s_addsub0000_lut_2_Q : X_LUT4
    generic map(
      INIT => X"CC33",
      LOC => "SLICE_X28Y23"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_2_IBUF_791,
      ADR2 => VCC,
      ADR3 => b_2_IBUF_818,
      O => Msub_s_addsub0000_lut(2)
    );
  Msub_s_addsub0000_lut_4_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X28Y24"
    )
    port map (
      ADR0 => a_4_IBUF_796,
      ADR1 => b_4_IBUF_821,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Msub_s_addsub0000_lut(4)
    );
  acc_2 : X_FF
    generic map(
      LOC => "SLICE_X51Y37",
      INIT => '0'
    )
    port map (
      I => acc_2_DXMUX_1022,
      CE => acc_2_CEINV_984,
      CLK => acc_2_CLKINV_985,
      SET => GND,
      RST => GND,
      O => acc_2_790
    );
  acc_5 : X_FF
    generic map(
      LOC => "SLICE_X51Y38",
      INIT => '0'
    )
    port map (
      I => acc_4_DYMUX_1058,
      CE => acc_4_CEINV_1037,
      CLK => acc_4_CLKINV_1038,
      SET => GND,
      RST => GND,
      O => acc_5_797
    );
  Maccum_acc_lut_4_Q : X_LUT4
    generic map(
      INIT => X"55AA",
      LOC => "SLICE_X51Y38"
    )
    port map (
      ADR0 => acc_4_795,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => a_4_IBUF_796,
      O => Maccum_acc_lut(4)
    );
  acc_4 : X_FF
    generic map(
      LOC => "SLICE_X51Y38",
      INIT => '0'
    )
    port map (
      I => acc_4_DXMUX_1075,
      CE => acc_4_CEINV_1037,
      CLK => acc_4_CLKINV_1038,
      SET => GND,
      RST => GND,
      O => acc_4_795
    );
  acc_7 : X_FF
    generic map(
      LOC => "SLICE_X51Y39",
      INIT => '0'
    )
    port map (
      I => acc_6_DYMUX_1111,
      CE => acc_6_CEINV_1090,
      CLK => acc_6_CLKINV_1091,
      SET => GND,
      RST => GND,
      O => acc_7_802
    );
  Maccum_acc_lut_6_Q : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X51Y39"
    )
    port map (
      ADR0 => a_6_IBUF_801,
      ADR1 => acc_6_800,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Maccum_acc_lut(6)
    );
  acc_6 : X_FF
    generic map(
      LOC => "SLICE_X51Y39",
      INIT => '0'
    )
    port map (
      I => acc_6_DXMUX_1128,
      CE => acc_6_CEINV_1090,
      CLK => acc_6_CLKINV_1091,
      SET => GND,
      RST => GND,
      O => acc_6_800
    );
  acc_9 : X_FF
    generic map(
      LOC => "SLICE_X51Y40",
      INIT => '0'
    )
    port map (
      I => acc_8_DYMUX_1164,
      CE => acc_8_CEINV_1143,
      CLK => acc_8_CLKINV_1144,
      SET => GND,
      RST => GND,
      O => acc_9_807
    );
  Maccum_acc_lut_8_Q : X_LUT4
    generic map(
      INIT => X"5A5A",
      LOC => "SLICE_X51Y40"
    )
    port map (
      ADR0 => acc_8_805,
      ADR1 => VCC,
      ADR2 => a_8_IBUF_806,
      ADR3 => VCC,
      O => Maccum_acc_lut(8)
    );
  acc_8 : X_FF
    generic map(
      LOC => "SLICE_X51Y40",
      INIT => '0'
    )
    port map (
      I => acc_8_DXMUX_1181,
      CE => acc_8_CEINV_1143,
      CLK => acc_8_CLKINV_1144,
      SET => GND,
      RST => GND,
      O => acc_8_805
    );
  acc_11 : X_FF
    generic map(
      LOC => "SLICE_X51Y41",
      INIT => '0'
    )
    port map (
      I => acc_10_DYMUX_1208,
      CE => acc_10_CEINV_1195,
      CLK => acc_10_CLKINV_1196,
      SET => GND,
      RST => GND,
      O => acc_11_812
    );
  Maccum_acc_lut_10_Q : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X51Y41"
    )
    port map (
      ADR0 => acc_10_810,
      ADR1 => a_10_IBUF_811,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Maccum_acc_lut(10)
    );
  acc_10 : X_FF
    generic map(
      LOC => "SLICE_X51Y41",
      INIT => '0'
    )
    port map (
      I => acc_10_DXMUX_1226,
      CE => acc_10_CEINV_1195,
      CLK => acc_10_CLKINV_1196,
      SET => GND,
      RST => GND,
      O => acc_10_810
    );
  Madd_s_addsub0001_lut_10_Q : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X29Y28"
    )
    port map (
      ADR0 => b_10_IBUF_830,
      ADR1 => a_10_IBUF_811,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Madd_s_addsub0001_lut(10)
    );
  Madd_s_addsub0001_lut_12_Q : X_LUT4
    generic map(
      INIT => X"55AA",
      LOC => "SLICE_X29Y29"
    )
    port map (
      ADR0 => a_12_IBUF_833,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => b_12_IBUF_834,
      O => Madd_s_addsub0001_lut(12)
    );
  Madd_s_addsub0001_lut_14_Q : X_LUT4
    generic map(
      INIT => X"5A5A",
      LOC => "SLICE_X29Y30"
    )
    port map (
      ADR0 => a_14_IBUF_838,
      ADR1 => VCC,
      ADR2 => b_14_IBUF_839,
      ADR3 => VCC,
      O => Madd_s_addsub0001_lut(14)
    );
  Madd_s_addsub0001_lut_0_Q : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X29Y23"
    )
    port map (
      ADR0 => a_0_IBUF_786,
      ADR1 => b_0_IBUF_815,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Madd_s_addsub0001_lut(0)
    );
  Madd_s_addsub0001_lut_2_Q : X_LUT4
    generic map(
      INIT => X"6666",
      LOC => "SLICE_X29Y24"
    )
    port map (
      ADR0 => b_2_IBUF_818,
      ADR1 => a_2_IBUF_791,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Madd_s_addsub0001_lut(2)
    );
  Madd_s_addsub0001_lut_4_Q : X_LUT4
    generic map(
      INIT => X"5A5A",
      LOC => "SLICE_X29Y25"
    )
    port map (
      ADR0 => a_4_IBUF_796,
      ADR1 => VCC,
      ADR2 => b_4_IBUF_821,
      ADR3 => VCC,
      O => Madd_s_addsub0001_lut(4)
    );
  Mcompar_lts_lut_8_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X33Y12"
    )
    port map (
      ADR0 => b_8_IBUF_827,
      ADR1 => a_8_IBUF_806,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_lts_lut(8)
    );
  Mcompar_lts_lut_10_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X33Y13"
    )
    port map (
      ADR0 => b_10_IBUF_830,
      ADR1 => a_10_IBUF_811,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_lts_lut(10)
    );
  Mcompar_lts_lut_12_Q : X_LUT4
    generic map(
      INIT => X"CC33",
      LOC => "SLICE_X33Y14"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_12_IBUF_833,
      ADR2 => VCC,
      ADR3 => b_12_IBUF_834,
      O => Mcompar_lts_lut(12)
    );
  Mcompar_lts_lut_14_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X33Y15"
    )
    port map (
      ADR0 => b_14_IBUF_839,
      ADR1 => a_14_IBUF_838,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_lts_lut(14)
    );
  Mcompar_lts_lut_0_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X33Y8"
    )
    port map (
      ADR0 => a_0_IBUF_786,
      ADR1 => b_0_IBUF_815,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_lts_lut(0)
    );
  Mcompar_lts_lut_2_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X33Y9"
    )
    port map (
      ADR0 => b_2_IBUF_818,
      ADR1 => a_2_IBUF_791,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Mcompar_lts_lut(2)
    );
  Mcompar_lts_lut_4_Q : X_LUT4
    generic map(
      INIT => X"A5A5",
      LOC => "SLICE_X33Y10"
    )
    port map (
      ADR0 => a_4_IBUF_796,
      ADR1 => VCC,
      ADR2 => b_4_IBUF_821,
      ADR3 => VCC,
      O => Mcompar_lts_lut(4)
    );
  Mcompar_lts_lut_6_Q : X_LUT4
    generic map(
      INIT => X"CC33",
      LOC => "SLICE_X33Y11"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_6_IBUF_801,
      ADR2 => VCC,
      ADR3 => b_6_IBUF_824,
      O => Mcompar_lts_lut(6)
    );
  Msub_s_addsub0000_lut_6_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X28Y25"
    )
    port map (
      ADR0 => b_6_IBUF_824,
      ADR1 => a_6_IBUF_801,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Msub_s_addsub0000_lut(6)
    );
  Msub_s_addsub0000_lut_8_Q : X_LUT4
    generic map(
      INIT => X"CC33",
      LOC => "SLICE_X28Y26"
    )
    port map (
      ADR0 => VCC,
      ADR1 => a_8_IBUF_806,
      ADR2 => VCC,
      ADR3 => b_8_IBUF_827,
      O => Msub_s_addsub0000_lut(8)
    );
  Msub_s_addsub0000_lut_10_Q : X_LUT4
    generic map(
      INIT => X"AA55",
      LOC => "SLICE_X28Y27"
    )
    port map (
      ADR0 => a_10_IBUF_811,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => b_10_IBUF_830,
      O => Msub_s_addsub0000_lut(10)
    );
  Msub_s_addsub0000_lut_12_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X28Y28"
    )
    port map (
      ADR0 => b_12_IBUF_834,
      ADR1 => a_12_IBUF_833,
      ADR2 => VCC,
      ADR3 => VCC,
      O => Msub_s_addsub0000_lut(12)
    );
  Msub_s_addsub0000_lut_14_Q : X_LUT4
    generic map(
      INIT => X"AA55",
      LOC => "SLICE_X28Y29"
    )
    port map (
      ADR0 => a_14_IBUF_838,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => b_14_IBUF_839,
      O => Msub_s_addsub0000_lut(14)
    );
  Mcompar_eq_lut_0_Q : X_LUT4
    generic map(
      INIT => X"8241",
      LOC => "SLICE_X33Y21"
    )
    port map (
      ADR0 => b_0_IBUF_815,
      ADR1 => b_1_IBUF_816,
      ADR2 => a_1_IBUF_788,
      ADR3 => a_0_IBUF_786,
      O => Mcompar_eq_lut(0)
    );
  Mcompar_eq_lut_2_Q : X_LUT4
    generic map(
      INIT => X"8241",
      LOC => "SLICE_X33Y22"
    )
    port map (
      ADR0 => b_5_IBUF_822,
      ADR1 => a_4_IBUF_796,
      ADR2 => b_4_IBUF_821,
      ADR3 => a_5_IBUF_798,
      O => Mcompar_eq_lut(2)
    );
  Mcompar_eq_lut_4_Q : X_LUT4
    generic map(
      INIT => X"9009",
      LOC => "SLICE_X33Y23"
    )
    port map (
      ADR0 => b_9_IBUF_828,
      ADR1 => a_9_IBUF_808,
      ADR2 => b_8_IBUF_827,
      ADR3 => a_8_IBUF_806,
      O => Mcompar_eq_lut(4)
    );
  Mcompar_eq_lut_6_Q : X_LUT4
    generic map(
      INIT => X"9009",
      LOC => "SLICE_X33Y24"
    )
    port map (
      ADR0 => a_12_IBUF_833,
      ADR1 => b_12_IBUF_834,
      ADR2 => b_13_IBUF_836,
      ADR3 => a_13_IBUF_835,
      O => Mcompar_eq_lut(6)
    );
  s_mux0000_16_1 : X_LUT4
    generic map(
      INIT => X"B8B8",
      LOC => "SLICE_X28Y35"
    )
    port map (
      ADR0 => s_addsub0000(16),
      ADR1 => sub_IBUF_923,
      ADR2 => Madd_s_addsub0001_cy(15),
      ADR3 => VCC,
      O => s_mux0000(16)
    );
  s_mux0000_15_1 : X_LUT4
    generic map(
      INIT => X"CCAA",
      LOC => "SLICE_X28Y32"
    )
    port map (
      ADR0 => s_addsub0001(15),
      ADR1 => s_addsub0000(15),
      ADR2 => VCC,
      ADR3 => sub_IBUF_923,
      O => s_mux0000(15)
    );
  s_mux0000_14_1 : X_LUT4
    generic map(
      INIT => X"B8B8",
      LOC => "SLICE_X29Y39"
    )
    port map (
      ADR0 => s_addsub0000(14),
      ADR1 => sub_IBUF_923,
      ADR2 => s_addsub0001(14),
      ADR3 => VCC,
      O => s_mux0000(14)
    );
  s_mux0000_13_1 : X_LUT4
    generic map(
      INIT => X"DD88",
      LOC => "SLICE_X28Y36"
    )
    port map (
      ADR0 => sub_IBUF_923,
      ADR1 => s_addsub0000(13),
      ADR2 => VCC,
      ADR3 => s_addsub0001(13),
      O => s_mux0000(13)
    );
  s_mux0000_12_1 : X_LUT4
    generic map(
      INIT => X"ACAC",
      LOC => "SLICE_X28Y39"
    )
    port map (
      ADR0 => s_addsub0000(12),
      ADR1 => s_addsub0001(12),
      ADR2 => sub_IBUF_923,
      ADR3 => VCC,
      O => s_mux0000(12)
    );
  s_mux0000_9_1 : X_LUT4
    generic map(
      INIT => X"EE44",
      LOC => "SLICE_X26Y29"
    )
    port map (
      ADR0 => sub_IBUF_923,
      ADR1 => s_addsub0001(9),
      ADR2 => VCC,
      ADR3 => s_addsub0000(9),
      O => s_mux0000(9)
    );
  s_mux0000_8_1 : X_LUT4
    generic map(
      INIT => X"FC30",
      LOC => "SLICE_X24Y31"
    )
    port map (
      ADR0 => VCC,
      ADR1 => sub_IBUF_923,
      ADR2 => s_addsub0001(8),
      ADR3 => s_addsub0000(8),
      O => s_mux0000(8)
    );
  s_mux0000_2_1 : X_LUT4
    generic map(
      INIT => X"CFC0",
      LOC => "SLICE_X18Y33"
    )
    port map (
      ADR0 => VCC,
      ADR1 => s_addsub0000(2),
      ADR2 => sub_IBUF_923,
      ADR3 => s_addsub0001(2),
      O => s_mux0000(2)
    );
  s_addsub0000_16_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X28Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_16_XORF_2356,
      O => s_addsub0000(16)
    );
  s_addsub0000_16_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X28Y30"
    )
    port map (
      I0 => s_addsub0000_16_CYINIT_2355,
      I1 => s_addsub0000_16_F,
      O => s_addsub0000_16_XORF_2356
    );
  s_addsub0000_16_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X28Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => s_addsub0000_14_CYMUXFAST_2326,
      O => s_addsub0000_16_CYINIT_2355
    );
  s_addsub0000_16_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FFFF",
      LOC => "SLICE_X28Y30"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => s_addsub0000_16_F
    );
  eq_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD46",
      PATHPULSE => 638 ps
    )
    port map (
      I => eq_OBUF_CYMUXFAST_2469,
      O => eq_O
    );
  acc_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD47",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_0_785,
      O => acc_0_O
    );
  acc_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD48",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_1_787,
      O => acc_1_O
    );
  acc_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD49",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_2_790,
      O => acc_2_O
    );
  acc_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD57",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_3_792,
      O => acc_3_O
    );
  acc_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD59",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_4_795,
      O => acc_4_O
    );
  acc_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD60",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_5_797,
      O => acc_5_O
    );
  acc_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD62",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_6_800,
      O => acc_6_O
    );
  acc_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD63",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_7_802,
      O => acc_7_O
    );
  acc_8_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD64",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_8_805,
      O => acc_8_O
    );
  acc_9_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD65",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_9_807,
      O => acc_9_O
    );
  lts_OUTPUT_OFF_OMUX : X_INV
    generic map(
      LOC => "PAD43",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_lts_cy_15_CYMUXFAST_2023,
      O => lts_O
    );
  ltu_OUTPUT_OFF_OMUX : X_INV
    generic map(
      LOC => "PAD42",
      PATHPULSE => 638 ps
    )
    port map (
      I => Mcompar_ltu_cy_15_CYMUXFAST_1467,
      O => ltu_O
    );
  acc_10_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD67",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_10_810,
      O => acc_10_O
    );
  acc_11_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD68",
      PATHPULSE => 638 ps
    )
    port map (
      I => acc_11_812,
      O => acc_11_O
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

