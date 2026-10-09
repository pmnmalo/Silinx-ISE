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
    led : out STD_LOGIC_VECTOR ( 7 downto 0 );
    btn : in STD_LOGIC_VECTOR ( 1 downto 0 );
    sw : in STD_LOGIC_VECTOR ( 3 downto 0 )
  );
end top;

architecture STRUCTURE of top is
  signal u_pre_tick_1021 : STD_LOGIC;
  signal clk_BUFGP : STD_LOGIC;
  signal u_speed_ticks_or0000_0 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_1_Q : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_3_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_1_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_3_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_5_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_7_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_9_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_11_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_13_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_15_Q : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_7_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_1_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_3_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_5_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_7_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_9_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_11_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_13_Q : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_15_Q : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000 : STD_LOGIC;
  signal step : STD_LOGIC;
  signal sw_0_IBUF_1145 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_1_Q : STD_LOGIC;
  signal u_knight_Mcount_count_cy_3_Q : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000 : STD_LOGIC;
  signal sw_1_IBUF_1171 : STD_LOGIC;
  signal sw_2_IBUF_1172 : STD_LOGIC;
  signal sw_3_IBUF_1173 : STD_LOGIC;
  signal u_speed_N7 : STD_LOGIC;
  signal u_speed_deb_s_1176 : STD_LOGIC;
  signal u_speed_deb_f_1177 : STD_LOGIC;
  signal u_speed_N9_0 : STD_LOGIC;
  signal u_speed_Mcount_level_val_0 : STD_LOGIC;
  signal u_speed_level_and0000_SW0_O : STD_LOGIC;
  signal u_speed_level_and0000_0 : STD_LOGIC;
  signal u_speed_Mcount_level_val1_SW0_O : STD_LOGIC;
  signal u_speed_slower_sync_1184 : STD_LOGIC;
  signal u_speed_level_or0000_0 : STD_LOGIC;
  signal u_speed_step_reg_1186 : STD_LOGIC;
  signal u_speed_faster_sync_1188 : STD_LOGIC;
  signal u_speed_faster_meta_1202 : STD_LOGIC;
  signal u_speed_slower_meta_1203 : STD_LOGIC;
  signal u_speed_ticks_0_DXMUX_1254 : STD_LOGIC;
  signal u_speed_ticks_0_XORF_1252 : STD_LOGIC;
  signal u_speed_ticks_0_LOGIC_ONE_1251 : STD_LOGIC;
  signal u_speed_ticks_0_CYINIT_1250 : STD_LOGIC;
  signal u_speed_ticks_0_CYSELF_1241 : STD_LOGIC;
  signal u_speed_ticks_0_BXINV_1239 : STD_LOGIC;
  signal u_speed_ticks_0_DYMUX_1233 : STD_LOGIC;
  signal u_speed_ticks_0_XORG_1231 : STD_LOGIC;
  signal u_speed_ticks_0_CYMUXG_1230 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_0_Q : STD_LOGIC;
  signal u_speed_ticks_0_LOGIC_ZERO_1228 : STD_LOGIC;
  signal u_speed_ticks_0_CYSELG_1219 : STD_LOGIC;
  signal u_speed_ticks_0_G : STD_LOGIC;
  signal u_speed_ticks_0_SRINV_1217 : STD_LOGIC;
  signal u_speed_ticks_0_CLKINV_1216 : STD_LOGIC;
  signal u_speed_ticks_0_CEINV_1215 : STD_LOGIC;
  signal u_speed_ticks_2_DXMUX_1310 : STD_LOGIC;
  signal u_speed_ticks_2_XORF_1308 : STD_LOGIC;
  signal u_speed_ticks_2_CYINIT_1307 : STD_LOGIC;
  signal u_speed_ticks_2_F : STD_LOGIC;
  signal u_speed_ticks_2_DYMUX_1292 : STD_LOGIC;
  signal u_speed_ticks_2_XORG_1290 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_2_Q : STD_LOGIC;
  signal u_speed_ticks_2_CYSELF_1288 : STD_LOGIC;
  signal u_speed_ticks_2_CYMUXFAST_1287 : STD_LOGIC;
  signal u_speed_ticks_2_CYAND_1286 : STD_LOGIC;
  signal u_speed_ticks_2_FASTCARRY_1285 : STD_LOGIC;
  signal u_speed_ticks_2_CYMUXG2_1284 : STD_LOGIC;
  signal u_speed_ticks_2_CYMUXF2_1283 : STD_LOGIC;
  signal u_speed_ticks_2_LOGIC_ZERO_1282 : STD_LOGIC;
  signal u_speed_ticks_2_CYSELG_1273 : STD_LOGIC;
  signal u_speed_ticks_2_G : STD_LOGIC;
  signal u_speed_ticks_2_SRINV_1271 : STD_LOGIC;
  signal u_speed_ticks_2_CLKINV_1270 : STD_LOGIC;
  signal u_speed_ticks_2_CEINV_1269 : STD_LOGIC;
  signal u_speed_ticks_4_DXMUX_1366 : STD_LOGIC;
  signal u_speed_ticks_4_XORF_1364 : STD_LOGIC;
  signal u_speed_ticks_4_CYINIT_1363 : STD_LOGIC;
  signal u_speed_ticks_4_F : STD_LOGIC;
  signal u_speed_ticks_4_DYMUX_1348 : STD_LOGIC;
  signal u_speed_ticks_4_XORG_1346 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_4_Q : STD_LOGIC;
  signal u_speed_ticks_4_CYSELF_1344 : STD_LOGIC;
  signal u_speed_ticks_4_CYMUXFAST_1343 : STD_LOGIC;
  signal u_speed_ticks_4_CYAND_1342 : STD_LOGIC;
  signal u_speed_ticks_4_FASTCARRY_1341 : STD_LOGIC;
  signal u_speed_ticks_4_CYMUXG2_1340 : STD_LOGIC;
  signal u_speed_ticks_4_CYMUXF2_1339 : STD_LOGIC;
  signal u_speed_ticks_4_LOGIC_ZERO_1338 : STD_LOGIC;
  signal u_speed_ticks_4_CYSELG_1329 : STD_LOGIC;
  signal u_speed_ticks_4_G : STD_LOGIC;
  signal u_speed_ticks_4_SRINV_1327 : STD_LOGIC;
  signal u_speed_ticks_4_CLKINV_1326 : STD_LOGIC;
  signal u_speed_ticks_4_CEINV_1325 : STD_LOGIC;
  signal u_speed_ticks_6_DXMUX_1415 : STD_LOGIC;
  signal u_speed_ticks_6_XORF_1413 : STD_LOGIC;
  signal u_speed_ticks_6_LOGIC_ZERO_1412 : STD_LOGIC;
  signal u_speed_ticks_6_CYINIT_1411 : STD_LOGIC;
  signal u_speed_ticks_6_CYSELF_1402 : STD_LOGIC;
  signal u_speed_ticks_6_F : STD_LOGIC;
  signal u_speed_ticks_6_DYMUX_1395 : STD_LOGIC;
  signal u_speed_ticks_6_XORG_1393 : STD_LOGIC;
  signal u_speed_Mcount_ticks_cy_6_Q : STD_LOGIC;
  signal u_speed_ticks_7_rt_1390 : STD_LOGIC;
  signal u_speed_ticks_6_SRINV_1382 : STD_LOGIC;
  signal u_speed_ticks_6_CLKINV_1381 : STD_LOGIC;
  signal u_speed_ticks_6_CEINV_1380 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_0_XORF_1455 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_0_LOGIC_ONE_1454 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_0_CYINIT_1453 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_0_CYSELF_1444 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_0_BXINV_1442 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_0_XORG_1440 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_0_CYMUXG_1439 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_0_Q : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_0_LOGIC_ZERO_1437 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_0_CYSELG_1428 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_0_G : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_2_XORF_1493 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_2_CYINIT_1492 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_2_F : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_2_XORG_1481 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_2_Q : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_2_CYSELF_1479 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_2_CYMUXFAST_1478 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_2_CYAND_1477 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_2_FASTCARRY_1476 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_2_CYMUXG2_1475 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_2_CYMUXF2_1474 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_2_LOGIC_ZERO_1473 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_2_CYSELG_1464 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_2_G : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_4_XORF_1531 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_4_CYINIT_1530 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_4_F : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_4_XORG_1519 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_4_Q : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_4_CYSELF_1517 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_4_CYMUXFAST_1516 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_4_CYAND_1515 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_4_FASTCARRY_1514 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_4_CYMUXG2_1513 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_4_CYMUXF2_1512 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_4_LOGIC_ZERO_1511 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_4_CYSELG_1502 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_4_G : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_6_XORF_1569 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_6_CYINIT_1568 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_6_F : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_6_XORG_1557 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_6_Q : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_6_CYSELF_1555 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_6_CYMUXFAST_1554 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_6_CYAND_1553 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_6_FASTCARRY_1552 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_6_CYMUXG2_1551 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_6_CYMUXF2_1550 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_6_LOGIC_ZERO_1549 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_6_CYSELG_1540 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_6_G : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_8_XORF_1607 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_8_CYINIT_1606 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_8_F : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_8_XORG_1595 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_8_Q : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_8_CYSELF_1593 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_8_CYMUXFAST_1592 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_8_CYAND_1591 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_8_FASTCARRY_1590 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_8_CYMUXG2_1589 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_8_CYMUXF2_1588 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_8_LOGIC_ZERO_1587 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_8_CYSELG_1578 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_8_G : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_10_XORF_1645 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_10_CYINIT_1644 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_10_F : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_10_XORG_1633 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_10_Q : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_10_CYSELF_1631 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_10_CYMUXFAST_1630 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_10_CYAND_1629 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_10_FASTCARRY_1628 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_10_CYMUXG2_1627 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_10_CYMUXF2_1626 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_10_LOGIC_ZERO_1625 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_10_CYSELG_1616 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_10_G : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_12_XORF_1683 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_12_CYINIT_1682 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_12_F : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_12_XORG_1671 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_12_Q : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_12_CYSELF_1669 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_12_CYMUXFAST_1668 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_12_CYAND_1667 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_12_FASTCARRY_1666 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_12_CYMUXG2_1665 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_12_CYMUXF2_1664 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_12_LOGIC_ZERO_1663 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_12_CYSELG_1654 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_12_G : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_14_XORF_1721 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_14_CYINIT_1720 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_14_F : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_14_XORG_1709 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_14_Q : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_14_CYSELF_1707 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_14_CYMUXFAST_1706 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_14_CYAND_1705 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_14_FASTCARRY_1704 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_14_CYMUXG2_1703 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_14_CYMUXF2_1702 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_14_LOGIC_ZERO_1701 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_14_CYSELG_1692 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_14_G : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_16_XORF_1759 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_16_CYINIT_1758 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_16_F : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_16_XORG_1747 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_16_Q : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_16_CYSELF_1745 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_16_CYMUXFAST_1744 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_16_CYAND_1743 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_16_FASTCARRY_1742 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_16_CYMUXG2_1741 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_16_CYMUXF2_1740 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_16_LOGIC_ZERO_1739 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_16_CYSELG_1730 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_16_G : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_18_XORF_1790 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_18_LOGIC_ZERO_1789 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_18_CYINIT_1788 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_18_CYSELF_1779 : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_18_F : STD_LOGIC;
  signal u_speed_cnt_s_next_addsub0000_18_XORG_1776 : STD_LOGIC;
  signal u_speed_Madd_cnt_s_next_addsub0000_cy_18_Q : STD_LOGIC;
  signal u_speed_cnt_s_19_rt_1773 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYINIT_1821 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CY0F_1820 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYSELF_1814 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_1_BXINV_1812 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYMUXG_1811 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_0_Q : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CY0G_1809 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYSELG_1802 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CY0F_1852 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYSELF_1845 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYMUXFAST_1844 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYAND_1843 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_3_FASTCARRY_1842 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYMUXG2_1841 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYMUXF2_1840 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CY0G_1839 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYSELG_1831 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CY0F_1883 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYSELF_1876 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYMUXFAST_1875 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYAND_1874 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_5_FASTCARRY_1873 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYMUXG2_1872 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYMUXF2_1871 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CY0G_1870 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYSELG_1863 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CY0F_1914 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYSELF_1907 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYMUXFAST_1906 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYAND_1905 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_7_FASTCARRY_1904 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYMUXG2_1903 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYMUXF2_1902 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CY0G_1901 : STD_LOGIC;
  signal u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYSELG_1892 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_0_XORF_1949 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_0_LOGIC_ONE_1948 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_0_CYINIT_1947 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_0_CYSELF_1938 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_0_BXINV_1936 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_0_XORG_1934 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_0_CYMUXG_1933 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_0_Q : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_0_LOGIC_ZERO_1931 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_0_CYSELG_1922 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_0_G : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_2_XORF_1987 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_2_CYINIT_1986 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_2_F : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_2_XORG_1975 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_2_Q : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_2_CYSELF_1973 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_2_CYMUXFAST_1972 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_2_CYAND_1971 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_2_FASTCARRY_1970 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_2_CYMUXG2_1969 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_2_CYMUXF2_1968 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_2_LOGIC_ZERO_1967 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_2_CYSELG_1958 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_2_G : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_4_XORF_2025 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_4_CYINIT_2024 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_4_F : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_4_XORG_2013 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_4_Q : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_4_CYSELF_2011 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_4_CYMUXFAST_2010 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_4_CYAND_2009 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_4_FASTCARRY_2008 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_4_CYMUXG2_2007 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_4_CYMUXF2_2006 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_4_LOGIC_ZERO_2005 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_4_CYSELG_1996 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_4_G : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_6_XORF_2063 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_6_CYINIT_2062 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_6_F : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_6_XORG_2051 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_6_Q : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_6_CYSELF_2049 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_6_CYMUXFAST_2048 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_6_CYAND_2047 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_6_FASTCARRY_2046 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_6_CYMUXG2_2045 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_6_CYMUXF2_2044 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_6_LOGIC_ZERO_2043 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_6_CYSELG_2034 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_6_G : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_8_XORF_2101 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_8_CYINIT_2100 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_8_F : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_8_XORG_2089 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_8_Q : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_8_CYSELF_2087 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_8_CYMUXFAST_2086 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_8_CYAND_2085 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_8_FASTCARRY_2084 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_8_CYMUXG2_2083 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_8_CYMUXF2_2082 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_8_LOGIC_ZERO_2081 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_8_CYSELG_2072 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_8_G : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_10_XORF_2139 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_10_CYINIT_2138 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_10_F : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_10_XORG_2127 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_10_Q : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_10_CYSELF_2125 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_10_CYMUXFAST_2124 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_10_CYAND_2123 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_10_FASTCARRY_2122 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_10_CYMUXG2_2121 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_10_CYMUXF2_2120 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_10_LOGIC_ZERO_2119 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_10_CYSELG_2110 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_10_G : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_12_XORF_2177 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_12_CYINIT_2176 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_12_F : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_12_XORG_2165 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_12_Q : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_12_CYSELF_2163 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_12_CYMUXFAST_2162 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_12_CYAND_2161 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_12_FASTCARRY_2160 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_12_CYMUXG2_2159 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_12_CYMUXF2_2158 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_12_LOGIC_ZERO_2157 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_12_CYSELG_2148 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_12_G : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_14_XORF_2215 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_14_CYINIT_2214 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_14_F : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_14_XORG_2203 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_14_Q : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_14_CYSELF_2201 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_14_CYMUXFAST_2200 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_14_CYAND_2199 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_14_FASTCARRY_2198 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_14_CYMUXG2_2197 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_14_CYMUXF2_2196 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_14_LOGIC_ZERO_2195 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_14_CYSELG_2186 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_14_G : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_16_XORF_2253 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_16_CYINIT_2252 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_16_F : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_16_XORG_2241 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_16_Q : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_16_CYSELF_2239 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_16_CYMUXFAST_2238 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_16_CYAND_2237 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_16_FASTCARRY_2236 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_16_CYMUXG2_2235 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_16_CYMUXF2_2234 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_16_LOGIC_ZERO_2233 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_16_CYSELG_2224 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_16_G : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_18_XORF_2284 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_18_LOGIC_ZERO_2283 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_18_CYINIT_2282 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_18_CYSELF_2273 : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_18_F : STD_LOGIC;
  signal u_speed_cnt_f_next_addsub0000_18_XORG_2270 : STD_LOGIC;
  signal u_speed_Madd_cnt_f_next_addsub0000_cy_18_Q : STD_LOGIC;
  signal u_speed_cnt_f_19_rt_2267 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYINIT_2314 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYSELF_2308 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_BXINV_2306 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYMUXG_2305 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_LOGIC_ZERO_2303 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYSELG_2297 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYSELF_2338 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYMUXFAST_2337 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYAND_2336 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_FASTCARRY_2335 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYMUXG2_2334 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYMUXF2_2333 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_LOGIC_ZERO_2332 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYSELG_2326 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_LOGIC_ZERO_2359 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_CYINIT_2358 : STD_LOGIC;
  signal u_speed_cnt_f_next_cmp_eq0000_CYSELF_2352 : STD_LOGIC;
  signal u_knight_count_0_DXMUX_2408 : STD_LOGIC;
  signal u_knight_count_0_XORF_2406 : STD_LOGIC;
  signal u_knight_count_0_LOGIC_ONE_2405 : STD_LOGIC;
  signal u_knight_count_0_CYINIT_2404 : STD_LOGIC;
  signal u_knight_count_0_CYSELF_2395 : STD_LOGIC;
  signal u_knight_count_0_BXINV_2393 : STD_LOGIC;
  signal u_knight_count_0_DYMUX_2387 : STD_LOGIC;
  signal u_knight_count_0_XORG_2385 : STD_LOGIC;
  signal u_knight_count_0_CYMUXG_2384 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_0_Q : STD_LOGIC;
  signal u_knight_count_0_LOGIC_ZERO_2382 : STD_LOGIC;
  signal u_knight_count_0_CYSELG_2373 : STD_LOGIC;
  signal u_knight_count_0_G : STD_LOGIC;
  signal u_knight_count_0_SRINV_2371 : STD_LOGIC;
  signal u_knight_count_0_CLKINV_2370 : STD_LOGIC;
  signal u_knight_count_0_CEINV_2369 : STD_LOGIC;
  signal u_knight_count_2_DXMUX_2464 : STD_LOGIC;
  signal u_knight_count_2_XORF_2462 : STD_LOGIC;
  signal u_knight_count_2_CYINIT_2461 : STD_LOGIC;
  signal u_knight_count_2_F : STD_LOGIC;
  signal u_knight_count_2_DYMUX_2446 : STD_LOGIC;
  signal u_knight_count_2_XORG_2444 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_2_Q : STD_LOGIC;
  signal u_knight_count_2_CYSELF_2442 : STD_LOGIC;
  signal u_knight_count_2_CYMUXFAST_2441 : STD_LOGIC;
  signal u_knight_count_2_CYAND_2440 : STD_LOGIC;
  signal u_knight_count_2_FASTCARRY_2439 : STD_LOGIC;
  signal u_knight_count_2_CYMUXG2_2438 : STD_LOGIC;
  signal u_knight_count_2_CYMUXF2_2437 : STD_LOGIC;
  signal u_knight_count_2_LOGIC_ZERO_2436 : STD_LOGIC;
  signal u_knight_count_2_CYSELG_2427 : STD_LOGIC;
  signal u_knight_count_2_G : STD_LOGIC;
  signal u_knight_count_2_SRINV_2425 : STD_LOGIC;
  signal u_knight_count_2_CLKINV_2424 : STD_LOGIC;
  signal u_knight_count_2_CEINV_2423 : STD_LOGIC;
  signal u_knight_count_4_DXMUX_2520 : STD_LOGIC;
  signal u_knight_count_4_XORF_2518 : STD_LOGIC;
  signal u_knight_count_4_CYINIT_2517 : STD_LOGIC;
  signal u_knight_count_4_F : STD_LOGIC;
  signal u_knight_count_4_DYMUX_2502 : STD_LOGIC;
  signal u_knight_count_4_XORG_2500 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_4_Q : STD_LOGIC;
  signal u_knight_count_4_CYSELF_2498 : STD_LOGIC;
  signal u_knight_count_4_CYMUXFAST_2497 : STD_LOGIC;
  signal u_knight_count_4_CYAND_2496 : STD_LOGIC;
  signal u_knight_count_4_FASTCARRY_2495 : STD_LOGIC;
  signal u_knight_count_4_CYMUXG2_2494 : STD_LOGIC;
  signal u_knight_count_4_CYMUXF2_2493 : STD_LOGIC;
  signal u_knight_count_4_LOGIC_ZERO_2492 : STD_LOGIC;
  signal u_knight_count_4_CYSELG_2483 : STD_LOGIC;
  signal u_knight_count_4_G : STD_LOGIC;
  signal u_knight_count_4_SRINV_2481 : STD_LOGIC;
  signal u_knight_count_4_CLKINV_2480 : STD_LOGIC;
  signal u_knight_count_4_CEINV_2479 : STD_LOGIC;
  signal u_knight_count_6_DXMUX_2569 : STD_LOGIC;
  signal u_knight_count_6_XORF_2567 : STD_LOGIC;
  signal u_knight_count_6_LOGIC_ZERO_2566 : STD_LOGIC;
  signal u_knight_count_6_CYINIT_2565 : STD_LOGIC;
  signal u_knight_count_6_CYSELF_2556 : STD_LOGIC;
  signal u_knight_count_6_F : STD_LOGIC;
  signal u_knight_count_6_DYMUX_2549 : STD_LOGIC;
  signal u_knight_count_6_XORG_2547 : STD_LOGIC;
  signal u_knight_Mcount_count_cy_6_Q : STD_LOGIC;
  signal u_knight_count_7_rt_2544 : STD_LOGIC;
  signal u_knight_count_6_SRINV_2536 : STD_LOGIC;
  signal u_knight_count_6_CLKINV_2535 : STD_LOGIC;
  signal u_knight_count_6_CEINV_2534 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYINIT_2603 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYSELF_2597 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_BXINV_2595 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYMUXG_2594 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_LOGIC_ZERO_2592 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYSELG_2586 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYSELF_2627 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYMUXFAST_2626 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYAND_2625 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_FASTCARRY_2624 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYMUXG2_2623 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYMUXF2_2622 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_LOGIC_ZERO_2621 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYSELG_2615 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_LOGIC_ZERO_2648 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_CYINIT_2647 : STD_LOGIC;
  signal u_speed_cnt_s_next_cmp_eq0000_CYSELF_2641 : STD_LOGIC;
  signal led_0_O : STD_LOGIC;
  signal btn_0_INBUF : STD_LOGIC;
  signal led_1_O : STD_LOGIC;
  signal btn_1_INBUF : STD_LOGIC;
  signal led_2_O : STD_LOGIC;
  signal clk_INBUF : STD_LOGIC;
  signal led_3_O : STD_LOGIC;
  signal led_4_O : STD_LOGIC;
  signal led_5_O : STD_LOGIC;
  signal led_6_O : STD_LOGIC;
  signal led_7_O : STD_LOGIC;
  signal sw_0_INBUF : STD_LOGIC;
  signal sw_1_INBUF : STD_LOGIC;
  signal sw_2_INBUF : STD_LOGIC;
  signal sw_3_INBUF : STD_LOGIC;
  signal clk_BUFGP_BUFG_S_INVNOT : STD_LOGIC;
  signal clk_BUFGP_BUFG_I0_INV : STD_LOGIC;
  signal u_speed_Mcount_level_val : STD_LOGIC;
  signal u_speed_N7_pack_1 : STD_LOGIC;
  signal u_speed_level_and0000_2805 : STD_LOGIC;
  signal u_speed_level_and0000_SW0_O_pack_1 : STD_LOGIC;
  signal u_speed_Mcount_level_val1_2829 : STD_LOGIC;
  signal u_speed_Mcount_level_val1_SW0_O_pack_1 : STD_LOGIC;
  signal u_speed_cnt_s_1_DXMUX_2865 : STD_LOGIC;
  signal u_speed_cnt_s_1_DYMUX_2853 : STD_LOGIC;
  signal u_speed_cnt_s_1_SRINV_2845 : STD_LOGIC;
  signal u_speed_cnt_s_1_CLKINV_2844 : STD_LOGIC;
  signal u_speed_cnt_s_3_DXMUX_2903 : STD_LOGIC;
  signal u_speed_cnt_s_3_DYMUX_2891 : STD_LOGIC;
  signal u_speed_cnt_s_3_SRINV_2883 : STD_LOGIC;
  signal u_speed_cnt_s_3_CLKINV_2882 : STD_LOGIC;
  signal u_speed_cnt_s_5_DXMUX_2941 : STD_LOGIC;
  signal u_speed_cnt_s_5_DYMUX_2929 : STD_LOGIC;
  signal u_speed_cnt_s_5_SRINV_2921 : STD_LOGIC;
  signal u_speed_cnt_s_5_CLKINV_2920 : STD_LOGIC;
  signal u_speed_cnt_s_7_DXMUX_2979 : STD_LOGIC;
  signal u_speed_cnt_s_7_DYMUX_2967 : STD_LOGIC;
  signal u_speed_cnt_s_7_SRINV_2959 : STD_LOGIC;
  signal u_speed_cnt_s_7_CLKINV_2958 : STD_LOGIC;
  signal u_speed_cnt_s_9_DXMUX_3017 : STD_LOGIC;
  signal u_speed_cnt_s_9_DYMUX_3005 : STD_LOGIC;
  signal u_speed_cnt_s_9_SRINV_2997 : STD_LOGIC;
  signal u_speed_cnt_s_9_CLKINV_2996 : STD_LOGIC;
  signal u_speed_level_or0000 : STD_LOGIC;
  signal u_speed_state_reg_0_DYMUX_3043 : STD_LOGIC;
  signal u_speed_state_next : STD_LOGIC;
  signal u_speed_state_reg_0_SRINV_3033 : STD_LOGIC;
  signal u_speed_state_reg_0_CLKINV_3032 : STD_LOGIC;
  signal u_speed_ticks_or0000 : STD_LOGIC;
  signal u_speed_step_reg_DYMUX_3075 : STD_LOGIC;
  signal u_speed_step_next : STD_LOGIC;
  signal u_speed_step_reg_SRINV_3065 : STD_LOGIC;
  signal u_speed_step_reg_CLKINV_3064 : STD_LOGIC;
  signal u_speed_N9 : STD_LOGIC;
  signal u_speed_level_1_REVUSED_3113 : STD_LOGIC;
  signal u_speed_level_1_DYMUX_3112 : STD_LOGIC;
  signal u_speed_level_1_SRINV_3102 : STD_LOGIC;
  signal u_speed_level_1_CLKINV_3101 : STD_LOGIC;
  signal u_speed_level_1_CEINV_3100 : STD_LOGIC;
  signal u_speed_deb_f_not0001 : STD_LOGIC;
  signal u_speed_level_2_REVUSED_3153 : STD_LOGIC;
  signal u_speed_level_2_DYMUX_3152 : STD_LOGIC;
  signal u_speed_level_2_SRINV_3143 : STD_LOGIC;
  signal u_speed_level_2_CLKINV_3142 : STD_LOGIC;
  signal u_speed_level_2_CEINV_3141 : STD_LOGIC;
  signal u_speed_cnt_f_1_DXMUX_3201 : STD_LOGIC;
  signal u_speed_cnt_f_1_DYMUX_3189 : STD_LOGIC;
  signal u_speed_cnt_f_1_SRINV_3181 : STD_LOGIC;
  signal u_speed_cnt_f_1_CLKINV_3180 : STD_LOGIC;
  signal u_speed_cnt_f_3_DXMUX_3239 : STD_LOGIC;
  signal u_speed_cnt_f_3_DYMUX_3227 : STD_LOGIC;
  signal u_speed_cnt_f_3_SRINV_3219 : STD_LOGIC;
  signal u_speed_cnt_f_3_CLKINV_3218 : STD_LOGIC;
  signal u_speed_cnt_f_5_DXMUX_3277 : STD_LOGIC;
  signal u_speed_cnt_f_5_DYMUX_3265 : STD_LOGIC;
  signal u_speed_cnt_f_5_SRINV_3257 : STD_LOGIC;
  signal u_speed_cnt_f_5_CLKINV_3256 : STD_LOGIC;
  signal u_speed_cnt_f_11_DXMUX_3315 : STD_LOGIC;
  signal u_speed_cnt_f_11_DYMUX_3303 : STD_LOGIC;
  signal u_speed_cnt_f_11_SRINV_3295 : STD_LOGIC;
  signal u_speed_cnt_f_11_CLKINV_3294 : STD_LOGIC;
  signal u_speed_cnt_f_7_DXMUX_3353 : STD_LOGIC;
  signal u_speed_cnt_f_7_DYMUX_3341 : STD_LOGIC;
  signal u_speed_cnt_f_7_SRINV_3333 : STD_LOGIC;
  signal u_speed_cnt_f_7_CLKINV_3332 : STD_LOGIC;
  signal u_speed_cnt_f_13_DXMUX_3391 : STD_LOGIC;
  signal u_speed_cnt_f_13_DYMUX_3379 : STD_LOGIC;
  signal u_speed_cnt_f_13_SRINV_3371 : STD_LOGIC;
  signal u_speed_cnt_f_13_CLKINV_3370 : STD_LOGIC;
  signal u_speed_cnt_f_9_DXMUX_3429 : STD_LOGIC;
  signal u_speed_cnt_f_9_DYMUX_3417 : STD_LOGIC;
  signal u_speed_cnt_f_9_SRINV_3409 : STD_LOGIC;
  signal u_speed_cnt_f_9_CLKINV_3408 : STD_LOGIC;
  signal u_speed_cnt_s_11_DXMUX_3467 : STD_LOGIC;
  signal u_speed_cnt_s_11_DYMUX_3455 : STD_LOGIC;
  signal u_speed_cnt_s_11_SRINV_3447 : STD_LOGIC;
  signal u_speed_cnt_s_11_CLKINV_3446 : STD_LOGIC;
  signal u_speed_cnt_f_15_DXMUX_3505 : STD_LOGIC;
  signal u_speed_cnt_f_15_DYMUX_3493 : STD_LOGIC;
  signal u_speed_cnt_f_15_SRINV_3485 : STD_LOGIC;
  signal u_speed_cnt_f_15_CLKINV_3484 : STD_LOGIC;
  signal u_speed_cnt_s_13_DXMUX_3543 : STD_LOGIC;
  signal u_speed_cnt_s_13_DYMUX_3531 : STD_LOGIC;
  signal u_speed_cnt_s_13_SRINV_3523 : STD_LOGIC;
  signal u_speed_cnt_s_13_CLKINV_3522 : STD_LOGIC;
  signal u_speed_cnt_f_17_DXMUX_3581 : STD_LOGIC;
  signal u_speed_cnt_f_17_DYMUX_3569 : STD_LOGIC;
  signal u_speed_cnt_f_17_SRINV_3561 : STD_LOGIC;
  signal u_speed_cnt_f_17_CLKINV_3560 : STD_LOGIC;
  signal u_speed_cnt_s_15_DXMUX_3619 : STD_LOGIC;
  signal u_speed_cnt_s_15_DYMUX_3607 : STD_LOGIC;
  signal u_speed_cnt_s_15_SRINV_3599 : STD_LOGIC;
  signal u_speed_cnt_s_15_CLKINV_3598 : STD_LOGIC;
  signal u_speed_cnt_f_19_DXMUX_3657 : STD_LOGIC;
  signal u_speed_cnt_f_19_DYMUX_3645 : STD_LOGIC;
  signal u_speed_cnt_f_19_SRINV_3637 : STD_LOGIC;
  signal u_speed_cnt_f_19_CLKINV_3636 : STD_LOGIC;
  signal u_speed_cnt_s_17_DXMUX_3695 : STD_LOGIC;
  signal u_speed_cnt_s_17_DYMUX_3683 : STD_LOGIC;
  signal u_speed_cnt_s_17_SRINV_3675 : STD_LOGIC;
  signal u_speed_cnt_s_17_CLKINV_3674 : STD_LOGIC;
  signal u_speed_cnt_s_19_DXMUX_3733 : STD_LOGIC;
  signal u_speed_cnt_s_19_DYMUX_3721 : STD_LOGIC;
  signal u_speed_cnt_s_19_SRINV_3713 : STD_LOGIC;
  signal u_speed_cnt_s_19_CLKINV_3712 : STD_LOGIC;
  signal u_knight_pattern_1_DXMUX_3774 : STD_LOGIC;
  signal u_knight_pattern_1_DYMUX_3760 : STD_LOGIC;
  signal u_knight_pattern_1_SRINV_3750 : STD_LOGIC;
  signal u_knight_pattern_1_CLKINV_3749 : STD_LOGIC;
  signal u_knight_pattern_1_CEINV_3748 : STD_LOGIC;
  signal u_knight_pattern_3_DXMUX_3816 : STD_LOGIC;
  signal u_knight_pattern_3_DYMUX_3802 : STD_LOGIC;
  signal u_knight_pattern_3_SRINV_3793 : STD_LOGIC;
  signal u_knight_pattern_3_CLKINV_3792 : STD_LOGIC;
  signal u_knight_pattern_3_CEINV_3791 : STD_LOGIC;
  signal u_knight_pattern_5_DXMUX_3858 : STD_LOGIC;
  signal u_knight_pattern_5_DYMUX_3844 : STD_LOGIC;
  signal u_knight_pattern_5_SRINV_3835 : STD_LOGIC;
  signal u_knight_pattern_5_CLKINV_3834 : STD_LOGIC;
  signal u_knight_pattern_5_CEINV_3833 : STD_LOGIC;
  signal u_knight_pattern_7_DXMUX_3900 : STD_LOGIC;
  signal u_knight_pattern_7_DYMUX_3885 : STD_LOGIC;
  signal u_knight_pattern_7_SRINV_3876 : STD_LOGIC;
  signal u_knight_pattern_7_CLKINV_3875 : STD_LOGIC;
  signal u_knight_pattern_7_CEINV_3874 : STD_LOGIC;
  signal u_pre_cnt_0_or0000 : STD_LOGIC;
  signal u_speed_level_and0001 : STD_LOGIC;
  signal u_knight_dir_0_not0001 : STD_LOGIC;
  signal step_pack_1 : STD_LOGIC;
  signal u_speed_faster_meta_DYMUX_3961 : STD_LOGIC;
  signal u_speed_faster_meta_SRINV_3959 : STD_LOGIC;
  signal u_speed_faster_meta_CLKINV_3958 : STD_LOGIC;
  signal u_speed_faster_sync_DYMUX_3973 : STD_LOGIC;
  signal u_speed_faster_sync_SRINV_3971 : STD_LOGIC;
  signal u_speed_faster_sync_CLKINV_3970 : STD_LOGIC;
  signal u_pre_cnt_0_DYMUX_3985 : STD_LOGIC;
  signal u_pre_cnt_0_BYINV_3984 : STD_LOGIC;
  signal u_pre_cnt_0_SRINV_3983 : STD_LOGIC;
  signal u_pre_cnt_0_CLKINV_3982 : STD_LOGIC;
  signal u_speed_slower_meta_DYMUX_3997 : STD_LOGIC;
  signal u_speed_slower_meta_SRINV_3995 : STD_LOGIC;
  signal u_speed_slower_meta_CLKINV_3994 : STD_LOGIC;
  signal u_speed_deb_s_not0001 : STD_LOGIC;
  signal u_speed_level_0_DXMUX_4026 : STD_LOGIC;
  signal u_speed_level_0_REVUSED_4024 : STD_LOGIC;
  signal u_speed_level_0_SRINV_4022 : STD_LOGIC;
  signal u_speed_level_0_CLKINV_4021 : STD_LOGIC;
  signal u_speed_level_0_CEINV_4020 : STD_LOGIC;
  signal u_speed_slower_sync_DYMUX_4040 : STD_LOGIC;
  signal u_speed_slower_sync_SRINV_4038 : STD_LOGIC;
  signal u_speed_slower_sync_CLKINV_4037 : STD_LOGIC;
  signal led_1_OBUF_4066 : STD_LOGIC;
  signal led_0_OBUF_4059 : STD_LOGIC;
  signal u_pre_tick_or0000 : STD_LOGIC;
  signal u_speed_deb_f_DYMUX_4090 : STD_LOGIC;
  signal u_speed_deb_f_SRINV_4088 : STD_LOGIC;
  signal u_speed_deb_f_CLKINV_4087 : STD_LOGIC;
  signal u_speed_deb_f_CEINV_4086 : STD_LOGIC;
  signal led_3_OBUF_4117 : STD_LOGIC;
  signal led_2_OBUF_4110 : STD_LOGIC;
  signal led_5_OBUF_4141 : STD_LOGIC;
  signal led_4_OBUF_4134 : STD_LOGIC;
  signal u_pre_tick_DYMUX_4151 : STD_LOGIC;
  signal u_pre_tick_BYINV_4150 : STD_LOGIC;
  signal u_pre_tick_SRINV_4149 : STD_LOGIC;
  signal u_pre_tick_CLKINV_4148 : STD_LOGIC;
  signal u_knight_dir_0_DYMUX_4165 : STD_LOGIC;
  signal u_knight_dir_0_SRINV_4163 : STD_LOGIC;
  signal u_knight_dir_0_CLKINV_4162 : STD_LOGIC;
  signal u_knight_dir_0_CEINV_4161 : STD_LOGIC;
  signal u_speed_deb_s_DYMUX_4180 : STD_LOGIC;
  signal u_speed_deb_s_SRINV_4178 : STD_LOGIC;
  signal u_speed_deb_s_CLKINV_4177 : STD_LOGIC;
  signal u_speed_deb_s_CEINV_4176 : STD_LOGIC;
  signal led_7_OBUF_4207 : STD_LOGIC;
  signal led_6_OBUF_4200 : STD_LOGIC;
  signal VCC : STD_LOGIC;
  signal GND : STD_LOGIC;
  signal u_speed_ticks : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal u_speed_cnt_s : STD_LOGIC_VECTOR ( 19 downto 0 );
  signal u_speed_cnt_s_next_addsub0000 : STD_LOGIC_VECTOR ( 19 downto 0 );
  signal u_speed_level : STD_LOGIC_VECTOR ( 2 downto 0 );
  signal u_speed_cnt_f : STD_LOGIC_VECTOR ( 19 downto 0 );
  signal u_speed_cnt_f_next_addsub0000 : STD_LOGIC_VECTOR ( 19 downto 0 );
  signal u_knight_count : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal u_speed_state_reg : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_knight_pattern : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal u_knight_dir : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_pre_cnt : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_speed_Mcount_ticks_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_speed_Madd_cnt_s_next_addsub0000_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_speed_Mcompar_step_next_cmp_ge0000_lut : STD_LOGIC_VECTOR ( 7 downto 0 );
  signal u_speed_Madd_cnt_f_next_addsub0000_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_speed_cnt_f_next_cmp_eq0000_wg_lut : STD_LOGIC_VECTOR ( 4 downto 0 );
  signal u_speed_cnt_f_next_cmp_eq0000_wg_cy : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_knight_Mcount_count_lut : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_speed_cnt_s_next_cmp_eq0000_wg_lut : STD_LOGIC_VECTOR ( 4 downto 0 );
  signal u_speed_cnt_s_next_cmp_eq0000_wg_cy : STD_LOGIC_VECTOR ( 0 downto 0 );
  signal u_speed_cnt_s_next : STD_LOGIC_VECTOR ( 19 downto 0 );
  signal u_speed_Result : STD_LOGIC_VECTOR ( 2 downto 1 );
  signal u_speed_cnt_f_next : STD_LOGIC_VECTOR ( 19 downto 0 );
  signal u_knight_pattern_mux0001 : STD_LOGIC_VECTOR ( 7 downto 0 );
begin
  u_speed_ticks_0_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X27Y28"
    )
    port map (
      O => u_speed_ticks_0_LOGIC_ZERO_1228
    );
  u_speed_ticks_0_LOGIC_ONE : X_ONE
    generic map(
      LOC => "SLICE_X27Y28"
    )
    port map (
      O => u_speed_ticks_0_LOGIC_ONE_1251
    );
  u_speed_ticks_0_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X27Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_0_XORF_1252,
      O => u_speed_ticks_0_DXMUX_1254
    );
  u_speed_ticks_0_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X27Y28"
    )
    port map (
      I0 => u_speed_ticks_0_CYINIT_1250,
      I1 => u_speed_Mcount_ticks_lut(0),
      O => u_speed_ticks_0_XORF_1252
    );
  u_speed_ticks_0_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X27Y28"
    )
    port map (
      IA => u_speed_ticks_0_LOGIC_ONE_1251,
      IB => u_speed_ticks_0_CYINIT_1250,
      SEL => u_speed_ticks_0_CYSELF_1241,
      O => u_speed_Mcount_ticks_cy_0_Q
    );
  u_speed_ticks_0_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X27Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_0_BXINV_1239,
      O => u_speed_ticks_0_CYINIT_1250
    );
  u_speed_ticks_0_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X27Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcount_ticks_lut(0),
      O => u_speed_ticks_0_CYSELF_1241
    );
  u_speed_ticks_0_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X27Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => '0',
      O => u_speed_ticks_0_BXINV_1239
    );
  u_speed_ticks_0_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X27Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_0_XORG_1231,
      O => u_speed_ticks_0_DYMUX_1233
    );
  u_speed_ticks_0_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X27Y28"
    )
    port map (
      I0 => u_speed_Mcount_ticks_cy_0_Q,
      I1 => u_speed_ticks_0_G,
      O => u_speed_ticks_0_XORG_1231
    );
  u_speed_ticks_0_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X27Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_0_CYMUXG_1230,
      O => u_speed_Mcount_ticks_cy_1_Q
    );
  u_speed_ticks_0_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X27Y28"
    )
    port map (
      IA => u_speed_ticks_0_LOGIC_ZERO_1228,
      IB => u_speed_Mcount_ticks_cy_0_Q,
      SEL => u_speed_ticks_0_CYSELG_1219,
      O => u_speed_ticks_0_CYMUXG_1230
    );
  u_speed_ticks_0_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X27Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_0_G,
      O => u_speed_ticks_0_CYSELG_1219
    );
  u_speed_ticks_0_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X27Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_or0000_0,
      O => u_speed_ticks_0_SRINV_1217
    );
  u_speed_ticks_0_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X27Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_ticks_0_CLKINV_1216
    );
  u_speed_ticks_0_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X27Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_pre_tick_1021,
      O => u_speed_ticks_0_CEINV_1215
    );
  u_speed_ticks_2_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X27Y29"
    )
    port map (
      O => u_speed_ticks_2_LOGIC_ZERO_1282
    );
  u_speed_ticks_2_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X27Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_2_XORF_1308,
      O => u_speed_ticks_2_DXMUX_1310
    );
  u_speed_ticks_2_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X27Y29"
    )
    port map (
      I0 => u_speed_ticks_2_CYINIT_1307,
      I1 => u_speed_ticks_2_F,
      O => u_speed_ticks_2_XORF_1308
    );
  u_speed_ticks_2_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X27Y29"
    )
    port map (
      IA => u_speed_ticks_2_LOGIC_ZERO_1282,
      IB => u_speed_ticks_2_CYINIT_1307,
      SEL => u_speed_ticks_2_CYSELF_1288,
      O => u_speed_Mcount_ticks_cy_2_Q
    );
  u_speed_ticks_2_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X27Y29"
    )
    port map (
      IA => u_speed_ticks_2_LOGIC_ZERO_1282,
      IB => u_speed_ticks_2_LOGIC_ZERO_1282,
      SEL => u_speed_ticks_2_CYSELF_1288,
      O => u_speed_ticks_2_CYMUXF2_1283
    );
  u_speed_ticks_2_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X27Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcount_ticks_cy_1_Q,
      O => u_speed_ticks_2_CYINIT_1307
    );
  u_speed_ticks_2_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X27Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_2_F,
      O => u_speed_ticks_2_CYSELF_1288
    );
  u_speed_ticks_2_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X27Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_2_XORG_1290,
      O => u_speed_ticks_2_DYMUX_1292
    );
  u_speed_ticks_2_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X27Y29"
    )
    port map (
      I0 => u_speed_Mcount_ticks_cy_2_Q,
      I1 => u_speed_ticks_2_G,
      O => u_speed_ticks_2_XORG_1290
    );
  u_speed_ticks_2_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X27Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_2_CYMUXFAST_1287,
      O => u_speed_Mcount_ticks_cy_3_Q
    );
  u_speed_ticks_2_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X27Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcount_ticks_cy_1_Q,
      O => u_speed_ticks_2_FASTCARRY_1285
    );
  u_speed_ticks_2_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X27Y29"
    )
    port map (
      I0 => u_speed_ticks_2_CYSELG_1273,
      I1 => u_speed_ticks_2_CYSELF_1288,
      O => u_speed_ticks_2_CYAND_1286
    );
  u_speed_ticks_2_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X27Y29"
    )
    port map (
      IA => u_speed_ticks_2_CYMUXG2_1284,
      IB => u_speed_ticks_2_FASTCARRY_1285,
      SEL => u_speed_ticks_2_CYAND_1286,
      O => u_speed_ticks_2_CYMUXFAST_1287
    );
  u_speed_ticks_2_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X27Y29"
    )
    port map (
      IA => u_speed_ticks_2_LOGIC_ZERO_1282,
      IB => u_speed_ticks_2_CYMUXF2_1283,
      SEL => u_speed_ticks_2_CYSELG_1273,
      O => u_speed_ticks_2_CYMUXG2_1284
    );
  u_speed_ticks_2_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X27Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_2_G,
      O => u_speed_ticks_2_CYSELG_1273
    );
  u_speed_ticks_2_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X27Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_or0000_0,
      O => u_speed_ticks_2_SRINV_1271
    );
  u_speed_ticks_2_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X27Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_ticks_2_CLKINV_1270
    );
  u_speed_ticks_2_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X27Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_pre_tick_1021,
      O => u_speed_ticks_2_CEINV_1269
    );
  u_speed_ticks_4_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X27Y30"
    )
    port map (
      O => u_speed_ticks_4_LOGIC_ZERO_1338
    );
  u_speed_ticks_4_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X27Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_4_XORF_1364,
      O => u_speed_ticks_4_DXMUX_1366
    );
  u_speed_ticks_4_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X27Y30"
    )
    port map (
      I0 => u_speed_ticks_4_CYINIT_1363,
      I1 => u_speed_ticks_4_F,
      O => u_speed_ticks_4_XORF_1364
    );
  u_speed_ticks_4_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X27Y30"
    )
    port map (
      IA => u_speed_ticks_4_LOGIC_ZERO_1338,
      IB => u_speed_ticks_4_CYINIT_1363,
      SEL => u_speed_ticks_4_CYSELF_1344,
      O => u_speed_Mcount_ticks_cy_4_Q
    );
  u_speed_ticks_4_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X27Y30"
    )
    port map (
      IA => u_speed_ticks_4_LOGIC_ZERO_1338,
      IB => u_speed_ticks_4_LOGIC_ZERO_1338,
      SEL => u_speed_ticks_4_CYSELF_1344,
      O => u_speed_ticks_4_CYMUXF2_1339
    );
  u_speed_ticks_4_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X27Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcount_ticks_cy_3_Q,
      O => u_speed_ticks_4_CYINIT_1363
    );
  u_speed_ticks_4_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X27Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_4_F,
      O => u_speed_ticks_4_CYSELF_1344
    );
  u_speed_ticks_4_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X27Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_4_XORG_1346,
      O => u_speed_ticks_4_DYMUX_1348
    );
  u_speed_ticks_4_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X27Y30"
    )
    port map (
      I0 => u_speed_Mcount_ticks_cy_4_Q,
      I1 => u_speed_ticks_4_G,
      O => u_speed_ticks_4_XORG_1346
    );
  u_speed_ticks_4_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X27Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcount_ticks_cy_3_Q,
      O => u_speed_ticks_4_FASTCARRY_1341
    );
  u_speed_ticks_4_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X27Y30"
    )
    port map (
      I0 => u_speed_ticks_4_CYSELG_1329,
      I1 => u_speed_ticks_4_CYSELF_1344,
      O => u_speed_ticks_4_CYAND_1342
    );
  u_speed_ticks_4_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X27Y30"
    )
    port map (
      IA => u_speed_ticks_4_CYMUXG2_1340,
      IB => u_speed_ticks_4_FASTCARRY_1341,
      SEL => u_speed_ticks_4_CYAND_1342,
      O => u_speed_ticks_4_CYMUXFAST_1343
    );
  u_speed_ticks_4_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X27Y30"
    )
    port map (
      IA => u_speed_ticks_4_LOGIC_ZERO_1338,
      IB => u_speed_ticks_4_CYMUXF2_1339,
      SEL => u_speed_ticks_4_CYSELG_1329,
      O => u_speed_ticks_4_CYMUXG2_1340
    );
  u_speed_ticks_4_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X27Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_4_G,
      O => u_speed_ticks_4_CYSELG_1329
    );
  u_speed_ticks_4_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X27Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_or0000_0,
      O => u_speed_ticks_4_SRINV_1327
    );
  u_speed_ticks_4_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X27Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_ticks_4_CLKINV_1326
    );
  u_speed_ticks_4_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X27Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_pre_tick_1021,
      O => u_speed_ticks_4_CEINV_1325
    );
  u_speed_ticks_6_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X27Y31"
    )
    port map (
      O => u_speed_ticks_6_LOGIC_ZERO_1412
    );
  u_speed_ticks_6_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X27Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_6_XORF_1413,
      O => u_speed_ticks_6_DXMUX_1415
    );
  u_speed_ticks_6_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X27Y31"
    )
    port map (
      I0 => u_speed_ticks_6_CYINIT_1411,
      I1 => u_speed_ticks_6_F,
      O => u_speed_ticks_6_XORF_1413
    );
  u_speed_ticks_6_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X27Y31"
    )
    port map (
      IA => u_speed_ticks_6_LOGIC_ZERO_1412,
      IB => u_speed_ticks_6_CYINIT_1411,
      SEL => u_speed_ticks_6_CYSELF_1402,
      O => u_speed_Mcount_ticks_cy_6_Q
    );
  u_speed_ticks_6_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X27Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_4_CYMUXFAST_1343,
      O => u_speed_ticks_6_CYINIT_1411
    );
  u_speed_ticks_6_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X27Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_6_F,
      O => u_speed_ticks_6_CYSELF_1402
    );
  u_speed_ticks_6_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X27Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_6_XORG_1393,
      O => u_speed_ticks_6_DYMUX_1395
    );
  u_speed_ticks_6_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X27Y31"
    )
    port map (
      I0 => u_speed_Mcount_ticks_cy_6_Q,
      I1 => u_speed_ticks_7_rt_1390,
      O => u_speed_ticks_6_XORG_1393
    );
  u_speed_ticks_6_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X27Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_or0000_0,
      O => u_speed_ticks_6_SRINV_1382
    );
  u_speed_ticks_6_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X27Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_ticks_6_CLKINV_1381
    );
  u_speed_ticks_6_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X27Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_pre_tick_1021,
      O => u_speed_ticks_6_CEINV_1380
    );
  u_speed_ticks_7_rt : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X27Y31"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_ticks(7),
      O => u_speed_ticks_7_rt_1390
    );
  u_speed_cnt_s_next_addsub0000_0_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X39Y29"
    )
    port map (
      O => u_speed_cnt_s_next_addsub0000_0_LOGIC_ZERO_1437
    );
  u_speed_cnt_s_next_addsub0000_0_LOGIC_ONE : X_ONE
    generic map(
      LOC => "SLICE_X39Y29"
    )
    port map (
      O => u_speed_cnt_s_next_addsub0000_0_LOGIC_ONE_1454
    );
  u_speed_cnt_s_next_addsub0000_0_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_0_XORF_1455,
      O => u_speed_cnt_s_next_addsub0000(0)
    );
  u_speed_cnt_s_next_addsub0000_0_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X39Y29"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_0_CYINIT_1453,
      I1 => u_speed_Madd_cnt_s_next_addsub0000_lut(0),
      O => u_speed_cnt_s_next_addsub0000_0_XORF_1455
    );
  u_speed_cnt_s_next_addsub0000_0_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X39Y29"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_0_LOGIC_ONE_1454,
      IB => u_speed_cnt_s_next_addsub0000_0_CYINIT_1453,
      SEL => u_speed_cnt_s_next_addsub0000_0_CYSELF_1444,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_0_Q
    );
  u_speed_cnt_s_next_addsub0000_0_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X39Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_0_BXINV_1442,
      O => u_speed_cnt_s_next_addsub0000_0_CYINIT_1453
    );
  u_speed_cnt_s_next_addsub0000_0_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X39Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_lut(0),
      O => u_speed_cnt_s_next_addsub0000_0_CYSELF_1444
    );
  u_speed_cnt_s_next_addsub0000_0_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X39Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => '0',
      O => u_speed_cnt_s_next_addsub0000_0_BXINV_1442
    );
  u_speed_cnt_s_next_addsub0000_0_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_0_XORG_1440,
      O => u_speed_cnt_s_next_addsub0000(1)
    );
  u_speed_cnt_s_next_addsub0000_0_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X39Y29"
    )
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy_0_Q,
      I1 => u_speed_cnt_s_next_addsub0000_0_G,
      O => u_speed_cnt_s_next_addsub0000_0_XORG_1440
    );
  u_speed_cnt_s_next_addsub0000_0_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_0_CYMUXG_1439,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_1_Q
    );
  u_speed_cnt_s_next_addsub0000_0_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X39Y29"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_0_LOGIC_ZERO_1437,
      IB => u_speed_Madd_cnt_s_next_addsub0000_cy_0_Q,
      SEL => u_speed_cnt_s_next_addsub0000_0_CYSELG_1428,
      O => u_speed_cnt_s_next_addsub0000_0_CYMUXG_1439
    );
  u_speed_cnt_s_next_addsub0000_0_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X39Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_0_G,
      O => u_speed_cnt_s_next_addsub0000_0_CYSELG_1428
    );
  u_speed_cnt_s_next_addsub0000_2_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X39Y30"
    )
    port map (
      O => u_speed_cnt_s_next_addsub0000_2_LOGIC_ZERO_1473
    );
  u_speed_cnt_s_next_addsub0000_2_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_2_XORF_1493,
      O => u_speed_cnt_s_next_addsub0000(2)
    );
  u_speed_cnt_s_next_addsub0000_2_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X39Y30"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_2_CYINIT_1492,
      I1 => u_speed_cnt_s_next_addsub0000_2_F,
      O => u_speed_cnt_s_next_addsub0000_2_XORF_1493
    );
  u_speed_cnt_s_next_addsub0000_2_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X39Y30"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_2_LOGIC_ZERO_1473,
      IB => u_speed_cnt_s_next_addsub0000_2_CYINIT_1492,
      SEL => u_speed_cnt_s_next_addsub0000_2_CYSELF_1479,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_2_Q
    );
  u_speed_cnt_s_next_addsub0000_2_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y30"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_2_LOGIC_ZERO_1473,
      IB => u_speed_cnt_s_next_addsub0000_2_LOGIC_ZERO_1473,
      SEL => u_speed_cnt_s_next_addsub0000_2_CYSELF_1479,
      O => u_speed_cnt_s_next_addsub0000_2_CYMUXF2_1474
    );
  u_speed_cnt_s_next_addsub0000_2_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X39Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_1_Q,
      O => u_speed_cnt_s_next_addsub0000_2_CYINIT_1492
    );
  u_speed_cnt_s_next_addsub0000_2_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X39Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_2_F,
      O => u_speed_cnt_s_next_addsub0000_2_CYSELF_1479
    );
  u_speed_cnt_s_next_addsub0000_2_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_2_XORG_1481,
      O => u_speed_cnt_s_next_addsub0000(3)
    );
  u_speed_cnt_s_next_addsub0000_2_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X39Y30"
    )
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy_2_Q,
      I1 => u_speed_cnt_s_next_addsub0000_2_G,
      O => u_speed_cnt_s_next_addsub0000_2_XORG_1481
    );
  u_speed_cnt_s_next_addsub0000_2_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_2_CYMUXFAST_1478,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_3_Q
    );
  u_speed_cnt_s_next_addsub0000_2_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X39Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_1_Q,
      O => u_speed_cnt_s_next_addsub0000_2_FASTCARRY_1476
    );
  u_speed_cnt_s_next_addsub0000_2_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X39Y30"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_2_CYSELG_1464,
      I1 => u_speed_cnt_s_next_addsub0000_2_CYSELF_1479,
      O => u_speed_cnt_s_next_addsub0000_2_CYAND_1477
    );
  u_speed_cnt_s_next_addsub0000_2_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X39Y30"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_2_CYMUXG2_1475,
      IB => u_speed_cnt_s_next_addsub0000_2_FASTCARRY_1476,
      SEL => u_speed_cnt_s_next_addsub0000_2_CYAND_1477,
      O => u_speed_cnt_s_next_addsub0000_2_CYMUXFAST_1478
    );
  u_speed_cnt_s_next_addsub0000_2_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y30"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_2_LOGIC_ZERO_1473,
      IB => u_speed_cnt_s_next_addsub0000_2_CYMUXF2_1474,
      SEL => u_speed_cnt_s_next_addsub0000_2_CYSELG_1464,
      O => u_speed_cnt_s_next_addsub0000_2_CYMUXG2_1475
    );
  u_speed_cnt_s_next_addsub0000_2_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X39Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_2_G,
      O => u_speed_cnt_s_next_addsub0000_2_CYSELG_1464
    );
  u_speed_cnt_s_next_addsub0000_4_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X39Y31"
    )
    port map (
      O => u_speed_cnt_s_next_addsub0000_4_LOGIC_ZERO_1511
    );
  u_speed_cnt_s_next_addsub0000_4_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_4_XORF_1531,
      O => u_speed_cnt_s_next_addsub0000(4)
    );
  u_speed_cnt_s_next_addsub0000_4_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X39Y31"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_4_CYINIT_1530,
      I1 => u_speed_cnt_s_next_addsub0000_4_F,
      O => u_speed_cnt_s_next_addsub0000_4_XORF_1531
    );
  u_speed_cnt_s_next_addsub0000_4_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X39Y31"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_4_LOGIC_ZERO_1511,
      IB => u_speed_cnt_s_next_addsub0000_4_CYINIT_1530,
      SEL => u_speed_cnt_s_next_addsub0000_4_CYSELF_1517,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_4_Q
    );
  u_speed_cnt_s_next_addsub0000_4_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y31"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_4_LOGIC_ZERO_1511,
      IB => u_speed_cnt_s_next_addsub0000_4_LOGIC_ZERO_1511,
      SEL => u_speed_cnt_s_next_addsub0000_4_CYSELF_1517,
      O => u_speed_cnt_s_next_addsub0000_4_CYMUXF2_1512
    );
  u_speed_cnt_s_next_addsub0000_4_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X39Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_3_Q,
      O => u_speed_cnt_s_next_addsub0000_4_CYINIT_1530
    );
  u_speed_cnt_s_next_addsub0000_4_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X39Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_4_F,
      O => u_speed_cnt_s_next_addsub0000_4_CYSELF_1517
    );
  u_speed_cnt_s_next_addsub0000_4_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_4_XORG_1519,
      O => u_speed_cnt_s_next_addsub0000(5)
    );
  u_speed_cnt_s_next_addsub0000_4_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X39Y31"
    )
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy_4_Q,
      I1 => u_speed_cnt_s_next_addsub0000_4_G,
      O => u_speed_cnt_s_next_addsub0000_4_XORG_1519
    );
  u_speed_cnt_s_next_addsub0000_4_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_4_CYMUXFAST_1516,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_5_Q
    );
  u_speed_cnt_s_next_addsub0000_4_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X39Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_3_Q,
      O => u_speed_cnt_s_next_addsub0000_4_FASTCARRY_1514
    );
  u_speed_cnt_s_next_addsub0000_4_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X39Y31"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_4_CYSELG_1502,
      I1 => u_speed_cnt_s_next_addsub0000_4_CYSELF_1517,
      O => u_speed_cnt_s_next_addsub0000_4_CYAND_1515
    );
  u_speed_cnt_s_next_addsub0000_4_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X39Y31"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_4_CYMUXG2_1513,
      IB => u_speed_cnt_s_next_addsub0000_4_FASTCARRY_1514,
      SEL => u_speed_cnt_s_next_addsub0000_4_CYAND_1515,
      O => u_speed_cnt_s_next_addsub0000_4_CYMUXFAST_1516
    );
  u_speed_cnt_s_next_addsub0000_4_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y31"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_4_LOGIC_ZERO_1511,
      IB => u_speed_cnt_s_next_addsub0000_4_CYMUXF2_1512,
      SEL => u_speed_cnt_s_next_addsub0000_4_CYSELG_1502,
      O => u_speed_cnt_s_next_addsub0000_4_CYMUXG2_1513
    );
  u_speed_cnt_s_next_addsub0000_4_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X39Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_4_G,
      O => u_speed_cnt_s_next_addsub0000_4_CYSELG_1502
    );
  u_speed_cnt_s_next_addsub0000_6_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X39Y32"
    )
    port map (
      O => u_speed_cnt_s_next_addsub0000_6_LOGIC_ZERO_1549
    );
  u_speed_cnt_s_next_addsub0000_6_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_6_XORF_1569,
      O => u_speed_cnt_s_next_addsub0000(6)
    );
  u_speed_cnt_s_next_addsub0000_6_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X39Y32"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_6_CYINIT_1568,
      I1 => u_speed_cnt_s_next_addsub0000_6_F,
      O => u_speed_cnt_s_next_addsub0000_6_XORF_1569
    );
  u_speed_cnt_s_next_addsub0000_6_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X39Y32"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_6_LOGIC_ZERO_1549,
      IB => u_speed_cnt_s_next_addsub0000_6_CYINIT_1568,
      SEL => u_speed_cnt_s_next_addsub0000_6_CYSELF_1555,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_6_Q
    );
  u_speed_cnt_s_next_addsub0000_6_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y32"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_6_LOGIC_ZERO_1549,
      IB => u_speed_cnt_s_next_addsub0000_6_LOGIC_ZERO_1549,
      SEL => u_speed_cnt_s_next_addsub0000_6_CYSELF_1555,
      O => u_speed_cnt_s_next_addsub0000_6_CYMUXF2_1550
    );
  u_speed_cnt_s_next_addsub0000_6_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X39Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_5_Q,
      O => u_speed_cnt_s_next_addsub0000_6_CYINIT_1568
    );
  u_speed_cnt_s_next_addsub0000_6_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X39Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_6_F,
      O => u_speed_cnt_s_next_addsub0000_6_CYSELF_1555
    );
  u_speed_cnt_s_next_addsub0000_6_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_6_XORG_1557,
      O => u_speed_cnt_s_next_addsub0000(7)
    );
  u_speed_cnt_s_next_addsub0000_6_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X39Y32"
    )
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy_6_Q,
      I1 => u_speed_cnt_s_next_addsub0000_6_G,
      O => u_speed_cnt_s_next_addsub0000_6_XORG_1557
    );
  u_speed_cnt_s_next_addsub0000_6_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_6_CYMUXFAST_1554,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_7_Q
    );
  u_speed_cnt_s_next_addsub0000_6_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X39Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_5_Q,
      O => u_speed_cnt_s_next_addsub0000_6_FASTCARRY_1552
    );
  u_speed_cnt_s_next_addsub0000_6_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X39Y32"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_6_CYSELG_1540,
      I1 => u_speed_cnt_s_next_addsub0000_6_CYSELF_1555,
      O => u_speed_cnt_s_next_addsub0000_6_CYAND_1553
    );
  u_speed_cnt_s_next_addsub0000_6_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X39Y32"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_6_CYMUXG2_1551,
      IB => u_speed_cnt_s_next_addsub0000_6_FASTCARRY_1552,
      SEL => u_speed_cnt_s_next_addsub0000_6_CYAND_1553,
      O => u_speed_cnt_s_next_addsub0000_6_CYMUXFAST_1554
    );
  u_speed_cnt_s_next_addsub0000_6_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y32"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_6_LOGIC_ZERO_1549,
      IB => u_speed_cnt_s_next_addsub0000_6_CYMUXF2_1550,
      SEL => u_speed_cnt_s_next_addsub0000_6_CYSELG_1540,
      O => u_speed_cnt_s_next_addsub0000_6_CYMUXG2_1551
    );
  u_speed_cnt_s_next_addsub0000_6_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X39Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_6_G,
      O => u_speed_cnt_s_next_addsub0000_6_CYSELG_1540
    );
  u_speed_cnt_s_next_addsub0000_8_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X39Y33"
    )
    port map (
      O => u_speed_cnt_s_next_addsub0000_8_LOGIC_ZERO_1587
    );
  u_speed_cnt_s_next_addsub0000_8_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_8_XORF_1607,
      O => u_speed_cnt_s_next_addsub0000(8)
    );
  u_speed_cnt_s_next_addsub0000_8_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X39Y33"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_8_CYINIT_1606,
      I1 => u_speed_cnt_s_next_addsub0000_8_F,
      O => u_speed_cnt_s_next_addsub0000_8_XORF_1607
    );
  u_speed_cnt_s_next_addsub0000_8_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X39Y33"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_8_LOGIC_ZERO_1587,
      IB => u_speed_cnt_s_next_addsub0000_8_CYINIT_1606,
      SEL => u_speed_cnt_s_next_addsub0000_8_CYSELF_1593,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_8_Q
    );
  u_speed_cnt_s_next_addsub0000_8_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y33"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_8_LOGIC_ZERO_1587,
      IB => u_speed_cnt_s_next_addsub0000_8_LOGIC_ZERO_1587,
      SEL => u_speed_cnt_s_next_addsub0000_8_CYSELF_1593,
      O => u_speed_cnt_s_next_addsub0000_8_CYMUXF2_1588
    );
  u_speed_cnt_s_next_addsub0000_8_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X39Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_7_Q,
      O => u_speed_cnt_s_next_addsub0000_8_CYINIT_1606
    );
  u_speed_cnt_s_next_addsub0000_8_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X39Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_8_F,
      O => u_speed_cnt_s_next_addsub0000_8_CYSELF_1593
    );
  u_speed_cnt_s_next_addsub0000_8_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_8_XORG_1595,
      O => u_speed_cnt_s_next_addsub0000(9)
    );
  u_speed_cnt_s_next_addsub0000_8_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X39Y33"
    )
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy_8_Q,
      I1 => u_speed_cnt_s_next_addsub0000_8_G,
      O => u_speed_cnt_s_next_addsub0000_8_XORG_1595
    );
  u_speed_cnt_s_next_addsub0000_8_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_8_CYMUXFAST_1592,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_9_Q
    );
  u_speed_cnt_s_next_addsub0000_8_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X39Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_7_Q,
      O => u_speed_cnt_s_next_addsub0000_8_FASTCARRY_1590
    );
  u_speed_cnt_s_next_addsub0000_8_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X39Y33"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_8_CYSELG_1578,
      I1 => u_speed_cnt_s_next_addsub0000_8_CYSELF_1593,
      O => u_speed_cnt_s_next_addsub0000_8_CYAND_1591
    );
  u_speed_cnt_s_next_addsub0000_8_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X39Y33"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_8_CYMUXG2_1589,
      IB => u_speed_cnt_s_next_addsub0000_8_FASTCARRY_1590,
      SEL => u_speed_cnt_s_next_addsub0000_8_CYAND_1591,
      O => u_speed_cnt_s_next_addsub0000_8_CYMUXFAST_1592
    );
  u_speed_cnt_s_next_addsub0000_8_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y33"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_8_LOGIC_ZERO_1587,
      IB => u_speed_cnt_s_next_addsub0000_8_CYMUXF2_1588,
      SEL => u_speed_cnt_s_next_addsub0000_8_CYSELG_1578,
      O => u_speed_cnt_s_next_addsub0000_8_CYMUXG2_1589
    );
  u_speed_cnt_s_next_addsub0000_8_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X39Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_8_G,
      O => u_speed_cnt_s_next_addsub0000_8_CYSELG_1578
    );
  u_speed_cnt_s_next_addsub0000_10_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X39Y34"
    )
    port map (
      O => u_speed_cnt_s_next_addsub0000_10_LOGIC_ZERO_1625
    );
  u_speed_cnt_s_next_addsub0000_10_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_10_XORF_1645,
      O => u_speed_cnt_s_next_addsub0000(10)
    );
  u_speed_cnt_s_next_addsub0000_10_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X39Y34"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_10_CYINIT_1644,
      I1 => u_speed_cnt_s_next_addsub0000_10_F,
      O => u_speed_cnt_s_next_addsub0000_10_XORF_1645
    );
  u_speed_cnt_s_next_addsub0000_10_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X39Y34"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_10_LOGIC_ZERO_1625,
      IB => u_speed_cnt_s_next_addsub0000_10_CYINIT_1644,
      SEL => u_speed_cnt_s_next_addsub0000_10_CYSELF_1631,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_10_Q
    );
  u_speed_cnt_s_next_addsub0000_10_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y34"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_10_LOGIC_ZERO_1625,
      IB => u_speed_cnt_s_next_addsub0000_10_LOGIC_ZERO_1625,
      SEL => u_speed_cnt_s_next_addsub0000_10_CYSELF_1631,
      O => u_speed_cnt_s_next_addsub0000_10_CYMUXF2_1626
    );
  u_speed_cnt_s_next_addsub0000_10_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X39Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_9_Q,
      O => u_speed_cnt_s_next_addsub0000_10_CYINIT_1644
    );
  u_speed_cnt_s_next_addsub0000_10_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X39Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_10_F,
      O => u_speed_cnt_s_next_addsub0000_10_CYSELF_1631
    );
  u_speed_cnt_s_next_addsub0000_10_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_10_XORG_1633,
      O => u_speed_cnt_s_next_addsub0000(11)
    );
  u_speed_cnt_s_next_addsub0000_10_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X39Y34"
    )
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy_10_Q,
      I1 => u_speed_cnt_s_next_addsub0000_10_G,
      O => u_speed_cnt_s_next_addsub0000_10_XORG_1633
    );
  u_speed_cnt_s_next_addsub0000_10_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_10_CYMUXFAST_1630,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_11_Q
    );
  u_speed_cnt_s_next_addsub0000_10_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X39Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_9_Q,
      O => u_speed_cnt_s_next_addsub0000_10_FASTCARRY_1628
    );
  u_speed_cnt_s_next_addsub0000_10_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X39Y34"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_10_CYSELG_1616,
      I1 => u_speed_cnt_s_next_addsub0000_10_CYSELF_1631,
      O => u_speed_cnt_s_next_addsub0000_10_CYAND_1629
    );
  u_speed_cnt_s_next_addsub0000_10_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X39Y34"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_10_CYMUXG2_1627,
      IB => u_speed_cnt_s_next_addsub0000_10_FASTCARRY_1628,
      SEL => u_speed_cnt_s_next_addsub0000_10_CYAND_1629,
      O => u_speed_cnt_s_next_addsub0000_10_CYMUXFAST_1630
    );
  u_speed_cnt_s_next_addsub0000_10_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y34"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_10_LOGIC_ZERO_1625,
      IB => u_speed_cnt_s_next_addsub0000_10_CYMUXF2_1626,
      SEL => u_speed_cnt_s_next_addsub0000_10_CYSELG_1616,
      O => u_speed_cnt_s_next_addsub0000_10_CYMUXG2_1627
    );
  u_speed_cnt_s_next_addsub0000_10_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X39Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_10_G,
      O => u_speed_cnt_s_next_addsub0000_10_CYSELG_1616
    );
  u_speed_cnt_s_next_addsub0000_12_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X39Y35"
    )
    port map (
      O => u_speed_cnt_s_next_addsub0000_12_LOGIC_ZERO_1663
    );
  u_speed_cnt_s_next_addsub0000_12_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_12_XORF_1683,
      O => u_speed_cnt_s_next_addsub0000(12)
    );
  u_speed_cnt_s_next_addsub0000_12_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X39Y35"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_12_CYINIT_1682,
      I1 => u_speed_cnt_s_next_addsub0000_12_F,
      O => u_speed_cnt_s_next_addsub0000_12_XORF_1683
    );
  u_speed_cnt_s_next_addsub0000_12_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X39Y35"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_12_LOGIC_ZERO_1663,
      IB => u_speed_cnt_s_next_addsub0000_12_CYINIT_1682,
      SEL => u_speed_cnt_s_next_addsub0000_12_CYSELF_1669,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_12_Q
    );
  u_speed_cnt_s_next_addsub0000_12_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y35"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_12_LOGIC_ZERO_1663,
      IB => u_speed_cnt_s_next_addsub0000_12_LOGIC_ZERO_1663,
      SEL => u_speed_cnt_s_next_addsub0000_12_CYSELF_1669,
      O => u_speed_cnt_s_next_addsub0000_12_CYMUXF2_1664
    );
  u_speed_cnt_s_next_addsub0000_12_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X39Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_11_Q,
      O => u_speed_cnt_s_next_addsub0000_12_CYINIT_1682
    );
  u_speed_cnt_s_next_addsub0000_12_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X39Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_12_F,
      O => u_speed_cnt_s_next_addsub0000_12_CYSELF_1669
    );
  u_speed_cnt_s_next_addsub0000_12_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_12_XORG_1671,
      O => u_speed_cnt_s_next_addsub0000(13)
    );
  u_speed_cnt_s_next_addsub0000_12_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X39Y35"
    )
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy_12_Q,
      I1 => u_speed_cnt_s_next_addsub0000_12_G,
      O => u_speed_cnt_s_next_addsub0000_12_XORG_1671
    );
  u_speed_cnt_s_next_addsub0000_12_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_12_CYMUXFAST_1668,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_13_Q
    );
  u_speed_cnt_s_next_addsub0000_12_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X39Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_11_Q,
      O => u_speed_cnt_s_next_addsub0000_12_FASTCARRY_1666
    );
  u_speed_cnt_s_next_addsub0000_12_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X39Y35"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_12_CYSELG_1654,
      I1 => u_speed_cnt_s_next_addsub0000_12_CYSELF_1669,
      O => u_speed_cnt_s_next_addsub0000_12_CYAND_1667
    );
  u_speed_cnt_s_next_addsub0000_12_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X39Y35"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_12_CYMUXG2_1665,
      IB => u_speed_cnt_s_next_addsub0000_12_FASTCARRY_1666,
      SEL => u_speed_cnt_s_next_addsub0000_12_CYAND_1667,
      O => u_speed_cnt_s_next_addsub0000_12_CYMUXFAST_1668
    );
  u_speed_cnt_s_next_addsub0000_12_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y35"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_12_LOGIC_ZERO_1663,
      IB => u_speed_cnt_s_next_addsub0000_12_CYMUXF2_1664,
      SEL => u_speed_cnt_s_next_addsub0000_12_CYSELG_1654,
      O => u_speed_cnt_s_next_addsub0000_12_CYMUXG2_1665
    );
  u_speed_cnt_s_next_addsub0000_12_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X39Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_12_G,
      O => u_speed_cnt_s_next_addsub0000_12_CYSELG_1654
    );
  u_speed_cnt_s_next_addsub0000_14_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X39Y36"
    )
    port map (
      O => u_speed_cnt_s_next_addsub0000_14_LOGIC_ZERO_1701
    );
  u_speed_cnt_s_next_addsub0000_14_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_14_XORF_1721,
      O => u_speed_cnt_s_next_addsub0000(14)
    );
  u_speed_cnt_s_next_addsub0000_14_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X39Y36"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_14_CYINIT_1720,
      I1 => u_speed_cnt_s_next_addsub0000_14_F,
      O => u_speed_cnt_s_next_addsub0000_14_XORF_1721
    );
  u_speed_cnt_s_next_addsub0000_14_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X39Y36"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_14_LOGIC_ZERO_1701,
      IB => u_speed_cnt_s_next_addsub0000_14_CYINIT_1720,
      SEL => u_speed_cnt_s_next_addsub0000_14_CYSELF_1707,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_14_Q
    );
  u_speed_cnt_s_next_addsub0000_14_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y36"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_14_LOGIC_ZERO_1701,
      IB => u_speed_cnt_s_next_addsub0000_14_LOGIC_ZERO_1701,
      SEL => u_speed_cnt_s_next_addsub0000_14_CYSELF_1707,
      O => u_speed_cnt_s_next_addsub0000_14_CYMUXF2_1702
    );
  u_speed_cnt_s_next_addsub0000_14_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X39Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_13_Q,
      O => u_speed_cnt_s_next_addsub0000_14_CYINIT_1720
    );
  u_speed_cnt_s_next_addsub0000_14_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X39Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_14_F,
      O => u_speed_cnt_s_next_addsub0000_14_CYSELF_1707
    );
  u_speed_cnt_s_next_addsub0000_14_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_14_XORG_1709,
      O => u_speed_cnt_s_next_addsub0000(15)
    );
  u_speed_cnt_s_next_addsub0000_14_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X39Y36"
    )
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy_14_Q,
      I1 => u_speed_cnt_s_next_addsub0000_14_G,
      O => u_speed_cnt_s_next_addsub0000_14_XORG_1709
    );
  u_speed_cnt_s_next_addsub0000_14_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_14_CYMUXFAST_1706,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_15_Q
    );
  u_speed_cnt_s_next_addsub0000_14_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X39Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_13_Q,
      O => u_speed_cnt_s_next_addsub0000_14_FASTCARRY_1704
    );
  u_speed_cnt_s_next_addsub0000_14_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X39Y36"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_14_CYSELG_1692,
      I1 => u_speed_cnt_s_next_addsub0000_14_CYSELF_1707,
      O => u_speed_cnt_s_next_addsub0000_14_CYAND_1705
    );
  u_speed_cnt_s_next_addsub0000_14_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X39Y36"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_14_CYMUXG2_1703,
      IB => u_speed_cnt_s_next_addsub0000_14_FASTCARRY_1704,
      SEL => u_speed_cnt_s_next_addsub0000_14_CYAND_1705,
      O => u_speed_cnt_s_next_addsub0000_14_CYMUXFAST_1706
    );
  u_speed_cnt_s_next_addsub0000_14_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y36"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_14_LOGIC_ZERO_1701,
      IB => u_speed_cnt_s_next_addsub0000_14_CYMUXF2_1702,
      SEL => u_speed_cnt_s_next_addsub0000_14_CYSELG_1692,
      O => u_speed_cnt_s_next_addsub0000_14_CYMUXG2_1703
    );
  u_speed_cnt_s_next_addsub0000_14_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X39Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_14_G,
      O => u_speed_cnt_s_next_addsub0000_14_CYSELG_1692
    );
  u_speed_cnt_s_next_addsub0000_16_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X39Y37"
    )
    port map (
      O => u_speed_cnt_s_next_addsub0000_16_LOGIC_ZERO_1739
    );
  u_speed_cnt_s_next_addsub0000_16_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_16_XORF_1759,
      O => u_speed_cnt_s_next_addsub0000(16)
    );
  u_speed_cnt_s_next_addsub0000_16_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X39Y37"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_16_CYINIT_1758,
      I1 => u_speed_cnt_s_next_addsub0000_16_F,
      O => u_speed_cnt_s_next_addsub0000_16_XORF_1759
    );
  u_speed_cnt_s_next_addsub0000_16_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X39Y37"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_16_LOGIC_ZERO_1739,
      IB => u_speed_cnt_s_next_addsub0000_16_CYINIT_1758,
      SEL => u_speed_cnt_s_next_addsub0000_16_CYSELF_1745,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_16_Q
    );
  u_speed_cnt_s_next_addsub0000_16_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y37"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_16_LOGIC_ZERO_1739,
      IB => u_speed_cnt_s_next_addsub0000_16_LOGIC_ZERO_1739,
      SEL => u_speed_cnt_s_next_addsub0000_16_CYSELF_1745,
      O => u_speed_cnt_s_next_addsub0000_16_CYMUXF2_1740
    );
  u_speed_cnt_s_next_addsub0000_16_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X39Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_15_Q,
      O => u_speed_cnt_s_next_addsub0000_16_CYINIT_1758
    );
  u_speed_cnt_s_next_addsub0000_16_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X39Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_16_F,
      O => u_speed_cnt_s_next_addsub0000_16_CYSELF_1745
    );
  u_speed_cnt_s_next_addsub0000_16_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_16_XORG_1747,
      O => u_speed_cnt_s_next_addsub0000(17)
    );
  u_speed_cnt_s_next_addsub0000_16_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X39Y37"
    )
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy_16_Q,
      I1 => u_speed_cnt_s_next_addsub0000_16_G,
      O => u_speed_cnt_s_next_addsub0000_16_XORG_1747
    );
  u_speed_cnt_s_next_addsub0000_16_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X39Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_s_next_addsub0000_cy_15_Q,
      O => u_speed_cnt_s_next_addsub0000_16_FASTCARRY_1742
    );
  u_speed_cnt_s_next_addsub0000_16_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X39Y37"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_16_CYSELG_1730,
      I1 => u_speed_cnt_s_next_addsub0000_16_CYSELF_1745,
      O => u_speed_cnt_s_next_addsub0000_16_CYAND_1743
    );
  u_speed_cnt_s_next_addsub0000_16_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X39Y37"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_16_CYMUXG2_1741,
      IB => u_speed_cnt_s_next_addsub0000_16_FASTCARRY_1742,
      SEL => u_speed_cnt_s_next_addsub0000_16_CYAND_1743,
      O => u_speed_cnt_s_next_addsub0000_16_CYMUXFAST_1744
    );
  u_speed_cnt_s_next_addsub0000_16_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X39Y37"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_16_LOGIC_ZERO_1739,
      IB => u_speed_cnt_s_next_addsub0000_16_CYMUXF2_1740,
      SEL => u_speed_cnt_s_next_addsub0000_16_CYSELG_1730,
      O => u_speed_cnt_s_next_addsub0000_16_CYMUXG2_1741
    );
  u_speed_cnt_s_next_addsub0000_16_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X39Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_16_G,
      O => u_speed_cnt_s_next_addsub0000_16_CYSELG_1730
    );
  u_speed_cnt_s_next_addsub0000_18_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X39Y38"
    )
    port map (
      O => u_speed_cnt_s_next_addsub0000_18_LOGIC_ZERO_1789
    );
  u_speed_cnt_s_next_addsub0000_18_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_18_XORF_1790,
      O => u_speed_cnt_s_next_addsub0000(18)
    );
  u_speed_cnt_s_next_addsub0000_18_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X39Y38"
    )
    port map (
      I0 => u_speed_cnt_s_next_addsub0000_18_CYINIT_1788,
      I1 => u_speed_cnt_s_next_addsub0000_18_F,
      O => u_speed_cnt_s_next_addsub0000_18_XORF_1790
    );
  u_speed_cnt_s_next_addsub0000_18_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X39Y38"
    )
    port map (
      IA => u_speed_cnt_s_next_addsub0000_18_LOGIC_ZERO_1789,
      IB => u_speed_cnt_s_next_addsub0000_18_CYINIT_1788,
      SEL => u_speed_cnt_s_next_addsub0000_18_CYSELF_1779,
      O => u_speed_Madd_cnt_s_next_addsub0000_cy_18_Q
    );
  u_speed_cnt_s_next_addsub0000_18_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X39Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_16_CYMUXFAST_1744,
      O => u_speed_cnt_s_next_addsub0000_18_CYINIT_1788
    );
  u_speed_cnt_s_next_addsub0000_18_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X39Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_18_F,
      O => u_speed_cnt_s_next_addsub0000_18_CYSELF_1779
    );
  u_speed_cnt_s_next_addsub0000_18_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X39Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_addsub0000_18_XORG_1776,
      O => u_speed_cnt_s_next_addsub0000(19)
    );
  u_speed_cnt_s_next_addsub0000_18_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X39Y38"
    )
    port map (
      I0 => u_speed_Madd_cnt_s_next_addsub0000_cy_18_Q,
      I1 => u_speed_cnt_s_19_rt_1773,
      O => u_speed_cnt_s_next_addsub0000_18_XORG_1776
    );
  u_speed_cnt_s_19_rt : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X39Y38"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_s(19),
      O => u_speed_cnt_s_19_rt_1773
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X29Y28"
    )
    port map (
      IA => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CY0F_1820,
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYINIT_1821,
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYSELF_1814,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_0_Q
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_BXINV_1812,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYINIT_1821
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks(0),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CY0F_1820
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcompar_step_next_cmp_ge0000_lut(0),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYSELF_1814
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_1_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_BXINV_1812
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X29Y28"
    )
    port map (
      IA => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CY0G_1809,
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy_0_Q,
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYSELG_1802,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYMUXG_1811
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks(1),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CY0G_1809
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X29Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcompar_step_next_cmp_ge0000_lut(1),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYSELG_1802
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_1_Q : X_LUT4
    generic map(
      INIT => X"AA99",
      LOC => "SLICE_X29Y28"
    )
    port map (
      ADR0 => u_speed_ticks(1),
      ADR1 => u_speed_level(1),
      ADR2 => VCC,
      ADR3 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(1)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y29"
    )
    port map (
      IA => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CY0F_1852,
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CY0F_1852,
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYSELF_1845,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYMUXF2_1840
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CY0F_1852
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcompar_step_next_cmp_ge0000_lut(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYSELF_1845
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_3_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcompar_step_next_cmp_ge0000_cy_1_CYMUXG_1811,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_FASTCARRY_1842
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X29Y29"
    )
    port map (
      I0 => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYSELG_1831,
      I1 => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYSELF_1845,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYAND_1843
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X29Y29"
    )
    port map (
      IA => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYMUXG2_1841,
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_FASTCARRY_1842,
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYAND_1843,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYMUXFAST_1844
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y29"
    )
    port map (
      IA => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CY0G_1839,
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYMUXF2_1840,
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYSELG_1831,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYMUXG2_1841
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks(3),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CY0G_1839
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X29Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcompar_step_next_cmp_ge0000_lut(3),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYSELG_1831
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_3_Q : X_LUT4
    generic map(
      INIT => X"9999",
      LOC => "SLICE_X29Y29"
    )
    port map (
      ADR0 => u_speed_ticks(3),
      ADR1 => u_speed_level(2),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(3)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y30"
    )
    port map (
      IA => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CY0F_1883,
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CY0F_1883,
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYSELF_1876,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYMUXF2_1871
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks(4),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CY0F_1883
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcompar_step_next_cmp_ge0000_lut(4),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYSELF_1876
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_5_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcompar_step_next_cmp_ge0000_cy_3_CYMUXFAST_1844,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_FASTCARRY_1873
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X29Y30"
    )
    port map (
      I0 => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYSELG_1863,
      I1 => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYSELF_1876,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYAND_1874
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X29Y30"
    )
    port map (
      IA => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYMUXG2_1872,
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_FASTCARRY_1873,
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYAND_1874,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYMUXFAST_1875
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y30"
    )
    port map (
      IA => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CY0G_1870,
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYMUXF2_1871,
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYSELG_1863,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYMUXG2_1872
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks(5),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CY0G_1870
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X29Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcompar_step_next_cmp_ge0000_lut(5),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYSELG_1863
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_5_Q : X_LUT4
    generic map(
      INIT => X"9393",
      LOC => "SLICE_X29Y30"
    )
    port map (
      ADR0 => u_speed_level(2),
      ADR1 => u_speed_ticks(5),
      ADR2 => u_speed_level(1),
      ADR3 => VCC,
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(5)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y31"
    )
    port map (
      IA => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CY0F_1914,
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CY0F_1914,
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYSELF_1907,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYMUXF2_1902
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CY0F : X_BUF
    generic map(
      LOC => "SLICE_X29Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks(6),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CY0F_1914
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X29Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcompar_step_next_cmp_ge0000_lut(6),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYSELF_1907
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_7_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X29Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYMUXFAST_1906,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_Q
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_7_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X29Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcompar_step_next_cmp_ge0000_cy_5_CYMUXFAST_1875,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_FASTCARRY_1904
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X29Y31"
    )
    port map (
      I0 => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYSELG_1892,
      I1 => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYSELF_1907,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYAND_1905
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X29Y31"
    )
    port map (
      IA => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYMUXG2_1903,
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_FASTCARRY_1904,
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYAND_1905,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYMUXFAST_1906
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X29Y31"
    )
    port map (
      IA => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CY0G_1901,
      IB => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYMUXF2_1902,
      SEL => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYSELG_1892,
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYMUXG2_1903
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CY0G : X_BUF
    generic map(
      LOC => "SLICE_X29Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks(7),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CY0G_1901
    );
  u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X29Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcompar_step_next_cmp_ge0000_lut(7),
      O => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_CYSELG_1892
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_7_1_INV_0 : X_LUT4
    generic map(
      INIT => X"3333",
      LOC => "SLICE_X29Y31"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_ticks(7),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(7)
    );
  u_speed_cnt_f_next_addsub0000_0_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y33"
    )
    port map (
      O => u_speed_cnt_f_next_addsub0000_0_LOGIC_ZERO_1931
    );
  u_speed_cnt_f_next_addsub0000_0_LOGIC_ONE : X_ONE
    generic map(
      LOC => "SLICE_X33Y33"
    )
    port map (
      O => u_speed_cnt_f_next_addsub0000_0_LOGIC_ONE_1948
    );
  u_speed_cnt_f_next_addsub0000_0_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_0_XORF_1949,
      O => u_speed_cnt_f_next_addsub0000(0)
    );
  u_speed_cnt_f_next_addsub0000_0_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X33Y33"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_0_CYINIT_1947,
      I1 => u_speed_Madd_cnt_f_next_addsub0000_lut(0),
      O => u_speed_cnt_f_next_addsub0000_0_XORF_1949
    );
  u_speed_cnt_f_next_addsub0000_0_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X33Y33"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_0_LOGIC_ONE_1948,
      IB => u_speed_cnt_f_next_addsub0000_0_CYINIT_1947,
      SEL => u_speed_cnt_f_next_addsub0000_0_CYSELF_1938,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_0_Q
    );
  u_speed_cnt_f_next_addsub0000_0_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X33Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_0_BXINV_1936,
      O => u_speed_cnt_f_next_addsub0000_0_CYINIT_1947
    );
  u_speed_cnt_f_next_addsub0000_0_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_lut(0),
      O => u_speed_cnt_f_next_addsub0000_0_CYSELF_1938
    );
  u_speed_cnt_f_next_addsub0000_0_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X33Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => '0',
      O => u_speed_cnt_f_next_addsub0000_0_BXINV_1936
    );
  u_speed_cnt_f_next_addsub0000_0_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_0_XORG_1934,
      O => u_speed_cnt_f_next_addsub0000(1)
    );
  u_speed_cnt_f_next_addsub0000_0_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X33Y33"
    )
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy_0_Q,
      I1 => u_speed_cnt_f_next_addsub0000_0_G,
      O => u_speed_cnt_f_next_addsub0000_0_XORG_1934
    );
  u_speed_cnt_f_next_addsub0000_0_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_0_CYMUXG_1933,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_1_Q
    );
  u_speed_cnt_f_next_addsub0000_0_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X33Y33"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_0_LOGIC_ZERO_1931,
      IB => u_speed_Madd_cnt_f_next_addsub0000_cy_0_Q,
      SEL => u_speed_cnt_f_next_addsub0000_0_CYSELG_1922,
      O => u_speed_cnt_f_next_addsub0000_0_CYMUXG_1933
    );
  u_speed_cnt_f_next_addsub0000_0_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_0_G,
      O => u_speed_cnt_f_next_addsub0000_0_CYSELG_1922
    );
  u_speed_cnt_f_next_addsub0000_2_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y34"
    )
    port map (
      O => u_speed_cnt_f_next_addsub0000_2_LOGIC_ZERO_1967
    );
  u_speed_cnt_f_next_addsub0000_2_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_2_XORF_1987,
      O => u_speed_cnt_f_next_addsub0000(2)
    );
  u_speed_cnt_f_next_addsub0000_2_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X33Y34"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_2_CYINIT_1986,
      I1 => u_speed_cnt_f_next_addsub0000_2_F,
      O => u_speed_cnt_f_next_addsub0000_2_XORF_1987
    );
  u_speed_cnt_f_next_addsub0000_2_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X33Y34"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_2_LOGIC_ZERO_1967,
      IB => u_speed_cnt_f_next_addsub0000_2_CYINIT_1986,
      SEL => u_speed_cnt_f_next_addsub0000_2_CYSELF_1973,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_2_Q
    );
  u_speed_cnt_f_next_addsub0000_2_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y34"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_2_LOGIC_ZERO_1967,
      IB => u_speed_cnt_f_next_addsub0000_2_LOGIC_ZERO_1967,
      SEL => u_speed_cnt_f_next_addsub0000_2_CYSELF_1973,
      O => u_speed_cnt_f_next_addsub0000_2_CYMUXF2_1968
    );
  u_speed_cnt_f_next_addsub0000_2_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X33Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_1_Q,
      O => u_speed_cnt_f_next_addsub0000_2_CYINIT_1986
    );
  u_speed_cnt_f_next_addsub0000_2_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_2_F,
      O => u_speed_cnt_f_next_addsub0000_2_CYSELF_1973
    );
  u_speed_cnt_f_next_addsub0000_2_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_2_XORG_1975,
      O => u_speed_cnt_f_next_addsub0000(3)
    );
  u_speed_cnt_f_next_addsub0000_2_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X33Y34"
    )
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy_2_Q,
      I1 => u_speed_cnt_f_next_addsub0000_2_G,
      O => u_speed_cnt_f_next_addsub0000_2_XORG_1975
    );
  u_speed_cnt_f_next_addsub0000_2_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_2_CYMUXFAST_1972,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_3_Q
    );
  u_speed_cnt_f_next_addsub0000_2_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_1_Q,
      O => u_speed_cnt_f_next_addsub0000_2_FASTCARRY_1970
    );
  u_speed_cnt_f_next_addsub0000_2_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y34"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_2_CYSELG_1958,
      I1 => u_speed_cnt_f_next_addsub0000_2_CYSELF_1973,
      O => u_speed_cnt_f_next_addsub0000_2_CYAND_1971
    );
  u_speed_cnt_f_next_addsub0000_2_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y34"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_2_CYMUXG2_1969,
      IB => u_speed_cnt_f_next_addsub0000_2_FASTCARRY_1970,
      SEL => u_speed_cnt_f_next_addsub0000_2_CYAND_1971,
      O => u_speed_cnt_f_next_addsub0000_2_CYMUXFAST_1972
    );
  u_speed_cnt_f_next_addsub0000_2_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y34"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_2_LOGIC_ZERO_1967,
      IB => u_speed_cnt_f_next_addsub0000_2_CYMUXF2_1968,
      SEL => u_speed_cnt_f_next_addsub0000_2_CYSELG_1958,
      O => u_speed_cnt_f_next_addsub0000_2_CYMUXG2_1969
    );
  u_speed_cnt_f_next_addsub0000_2_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_2_G,
      O => u_speed_cnt_f_next_addsub0000_2_CYSELG_1958
    );
  u_speed_cnt_f_next_addsub0000_4_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y35"
    )
    port map (
      O => u_speed_cnt_f_next_addsub0000_4_LOGIC_ZERO_2005
    );
  u_speed_cnt_f_next_addsub0000_4_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_4_XORF_2025,
      O => u_speed_cnt_f_next_addsub0000(4)
    );
  u_speed_cnt_f_next_addsub0000_4_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X33Y35"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_4_CYINIT_2024,
      I1 => u_speed_cnt_f_next_addsub0000_4_F,
      O => u_speed_cnt_f_next_addsub0000_4_XORF_2025
    );
  u_speed_cnt_f_next_addsub0000_4_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X33Y35"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_4_LOGIC_ZERO_2005,
      IB => u_speed_cnt_f_next_addsub0000_4_CYINIT_2024,
      SEL => u_speed_cnt_f_next_addsub0000_4_CYSELF_2011,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_4_Q
    );
  u_speed_cnt_f_next_addsub0000_4_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y35"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_4_LOGIC_ZERO_2005,
      IB => u_speed_cnt_f_next_addsub0000_4_LOGIC_ZERO_2005,
      SEL => u_speed_cnt_f_next_addsub0000_4_CYSELF_2011,
      O => u_speed_cnt_f_next_addsub0000_4_CYMUXF2_2006
    );
  u_speed_cnt_f_next_addsub0000_4_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X33Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_3_Q,
      O => u_speed_cnt_f_next_addsub0000_4_CYINIT_2024
    );
  u_speed_cnt_f_next_addsub0000_4_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_4_F,
      O => u_speed_cnt_f_next_addsub0000_4_CYSELF_2011
    );
  u_speed_cnt_f_next_addsub0000_4_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_4_XORG_2013,
      O => u_speed_cnt_f_next_addsub0000(5)
    );
  u_speed_cnt_f_next_addsub0000_4_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X33Y35"
    )
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy_4_Q,
      I1 => u_speed_cnt_f_next_addsub0000_4_G,
      O => u_speed_cnt_f_next_addsub0000_4_XORG_2013
    );
  u_speed_cnt_f_next_addsub0000_4_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_4_CYMUXFAST_2010,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_5_Q
    );
  u_speed_cnt_f_next_addsub0000_4_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_3_Q,
      O => u_speed_cnt_f_next_addsub0000_4_FASTCARRY_2008
    );
  u_speed_cnt_f_next_addsub0000_4_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y35"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_4_CYSELG_1996,
      I1 => u_speed_cnt_f_next_addsub0000_4_CYSELF_2011,
      O => u_speed_cnt_f_next_addsub0000_4_CYAND_2009
    );
  u_speed_cnt_f_next_addsub0000_4_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y35"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_4_CYMUXG2_2007,
      IB => u_speed_cnt_f_next_addsub0000_4_FASTCARRY_2008,
      SEL => u_speed_cnt_f_next_addsub0000_4_CYAND_2009,
      O => u_speed_cnt_f_next_addsub0000_4_CYMUXFAST_2010
    );
  u_speed_cnt_f_next_addsub0000_4_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y35"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_4_LOGIC_ZERO_2005,
      IB => u_speed_cnt_f_next_addsub0000_4_CYMUXF2_2006,
      SEL => u_speed_cnt_f_next_addsub0000_4_CYSELG_1996,
      O => u_speed_cnt_f_next_addsub0000_4_CYMUXG2_2007
    );
  u_speed_cnt_f_next_addsub0000_4_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_4_G,
      O => u_speed_cnt_f_next_addsub0000_4_CYSELG_1996
    );
  u_speed_cnt_f_next_addsub0000_6_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y36"
    )
    port map (
      O => u_speed_cnt_f_next_addsub0000_6_LOGIC_ZERO_2043
    );
  u_speed_cnt_f_next_addsub0000_6_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_6_XORF_2063,
      O => u_speed_cnt_f_next_addsub0000(6)
    );
  u_speed_cnt_f_next_addsub0000_6_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X33Y36"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_6_CYINIT_2062,
      I1 => u_speed_cnt_f_next_addsub0000_6_F,
      O => u_speed_cnt_f_next_addsub0000_6_XORF_2063
    );
  u_speed_cnt_f_next_addsub0000_6_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X33Y36"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_6_LOGIC_ZERO_2043,
      IB => u_speed_cnt_f_next_addsub0000_6_CYINIT_2062,
      SEL => u_speed_cnt_f_next_addsub0000_6_CYSELF_2049,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_6_Q
    );
  u_speed_cnt_f_next_addsub0000_6_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y36"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_6_LOGIC_ZERO_2043,
      IB => u_speed_cnt_f_next_addsub0000_6_LOGIC_ZERO_2043,
      SEL => u_speed_cnt_f_next_addsub0000_6_CYSELF_2049,
      O => u_speed_cnt_f_next_addsub0000_6_CYMUXF2_2044
    );
  u_speed_cnt_f_next_addsub0000_6_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X33Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_5_Q,
      O => u_speed_cnt_f_next_addsub0000_6_CYINIT_2062
    );
  u_speed_cnt_f_next_addsub0000_6_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_6_F,
      O => u_speed_cnt_f_next_addsub0000_6_CYSELF_2049
    );
  u_speed_cnt_f_next_addsub0000_6_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_6_XORG_2051,
      O => u_speed_cnt_f_next_addsub0000(7)
    );
  u_speed_cnt_f_next_addsub0000_6_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X33Y36"
    )
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy_6_Q,
      I1 => u_speed_cnt_f_next_addsub0000_6_G,
      O => u_speed_cnt_f_next_addsub0000_6_XORG_2051
    );
  u_speed_cnt_f_next_addsub0000_6_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_6_CYMUXFAST_2048,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_7_Q
    );
  u_speed_cnt_f_next_addsub0000_6_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_5_Q,
      O => u_speed_cnt_f_next_addsub0000_6_FASTCARRY_2046
    );
  u_speed_cnt_f_next_addsub0000_6_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y36"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_6_CYSELG_2034,
      I1 => u_speed_cnt_f_next_addsub0000_6_CYSELF_2049,
      O => u_speed_cnt_f_next_addsub0000_6_CYAND_2047
    );
  u_speed_cnt_f_next_addsub0000_6_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y36"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_6_CYMUXG2_2045,
      IB => u_speed_cnt_f_next_addsub0000_6_FASTCARRY_2046,
      SEL => u_speed_cnt_f_next_addsub0000_6_CYAND_2047,
      O => u_speed_cnt_f_next_addsub0000_6_CYMUXFAST_2048
    );
  u_speed_cnt_f_next_addsub0000_6_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y36"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_6_LOGIC_ZERO_2043,
      IB => u_speed_cnt_f_next_addsub0000_6_CYMUXF2_2044,
      SEL => u_speed_cnt_f_next_addsub0000_6_CYSELG_2034,
      O => u_speed_cnt_f_next_addsub0000_6_CYMUXG2_2045
    );
  u_speed_cnt_f_next_addsub0000_6_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_6_G,
      O => u_speed_cnt_f_next_addsub0000_6_CYSELG_2034
    );
  u_speed_cnt_f_next_addsub0000_8_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y37"
    )
    port map (
      O => u_speed_cnt_f_next_addsub0000_8_LOGIC_ZERO_2081
    );
  u_speed_cnt_f_next_addsub0000_8_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_8_XORF_2101,
      O => u_speed_cnt_f_next_addsub0000(8)
    );
  u_speed_cnt_f_next_addsub0000_8_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X33Y37"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_8_CYINIT_2100,
      I1 => u_speed_cnt_f_next_addsub0000_8_F,
      O => u_speed_cnt_f_next_addsub0000_8_XORF_2101
    );
  u_speed_cnt_f_next_addsub0000_8_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X33Y37"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_8_LOGIC_ZERO_2081,
      IB => u_speed_cnt_f_next_addsub0000_8_CYINIT_2100,
      SEL => u_speed_cnt_f_next_addsub0000_8_CYSELF_2087,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_8_Q
    );
  u_speed_cnt_f_next_addsub0000_8_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y37"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_8_LOGIC_ZERO_2081,
      IB => u_speed_cnt_f_next_addsub0000_8_LOGIC_ZERO_2081,
      SEL => u_speed_cnt_f_next_addsub0000_8_CYSELF_2087,
      O => u_speed_cnt_f_next_addsub0000_8_CYMUXF2_2082
    );
  u_speed_cnt_f_next_addsub0000_8_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X33Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_7_Q,
      O => u_speed_cnt_f_next_addsub0000_8_CYINIT_2100
    );
  u_speed_cnt_f_next_addsub0000_8_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_8_F,
      O => u_speed_cnt_f_next_addsub0000_8_CYSELF_2087
    );
  u_speed_cnt_f_next_addsub0000_8_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_8_XORG_2089,
      O => u_speed_cnt_f_next_addsub0000(9)
    );
  u_speed_cnt_f_next_addsub0000_8_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X33Y37"
    )
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy_8_Q,
      I1 => u_speed_cnt_f_next_addsub0000_8_G,
      O => u_speed_cnt_f_next_addsub0000_8_XORG_2089
    );
  u_speed_cnt_f_next_addsub0000_8_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_8_CYMUXFAST_2086,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_9_Q
    );
  u_speed_cnt_f_next_addsub0000_8_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_7_Q,
      O => u_speed_cnt_f_next_addsub0000_8_FASTCARRY_2084
    );
  u_speed_cnt_f_next_addsub0000_8_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y37"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_8_CYSELG_2072,
      I1 => u_speed_cnt_f_next_addsub0000_8_CYSELF_2087,
      O => u_speed_cnt_f_next_addsub0000_8_CYAND_2085
    );
  u_speed_cnt_f_next_addsub0000_8_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y37"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_8_CYMUXG2_2083,
      IB => u_speed_cnt_f_next_addsub0000_8_FASTCARRY_2084,
      SEL => u_speed_cnt_f_next_addsub0000_8_CYAND_2085,
      O => u_speed_cnt_f_next_addsub0000_8_CYMUXFAST_2086
    );
  u_speed_cnt_f_next_addsub0000_8_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y37"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_8_LOGIC_ZERO_2081,
      IB => u_speed_cnt_f_next_addsub0000_8_CYMUXF2_2082,
      SEL => u_speed_cnt_f_next_addsub0000_8_CYSELG_2072,
      O => u_speed_cnt_f_next_addsub0000_8_CYMUXG2_2083
    );
  u_speed_cnt_f_next_addsub0000_8_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_8_G,
      O => u_speed_cnt_f_next_addsub0000_8_CYSELG_2072
    );
  u_speed_cnt_f_next_addsub0000_10_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y38"
    )
    port map (
      O => u_speed_cnt_f_next_addsub0000_10_LOGIC_ZERO_2119
    );
  u_speed_cnt_f_next_addsub0000_10_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_10_XORF_2139,
      O => u_speed_cnt_f_next_addsub0000(10)
    );
  u_speed_cnt_f_next_addsub0000_10_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X33Y38"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_10_CYINIT_2138,
      I1 => u_speed_cnt_f_next_addsub0000_10_F,
      O => u_speed_cnt_f_next_addsub0000_10_XORF_2139
    );
  u_speed_cnt_f_next_addsub0000_10_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X33Y38"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_10_LOGIC_ZERO_2119,
      IB => u_speed_cnt_f_next_addsub0000_10_CYINIT_2138,
      SEL => u_speed_cnt_f_next_addsub0000_10_CYSELF_2125,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_10_Q
    );
  u_speed_cnt_f_next_addsub0000_10_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y38"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_10_LOGIC_ZERO_2119,
      IB => u_speed_cnt_f_next_addsub0000_10_LOGIC_ZERO_2119,
      SEL => u_speed_cnt_f_next_addsub0000_10_CYSELF_2125,
      O => u_speed_cnt_f_next_addsub0000_10_CYMUXF2_2120
    );
  u_speed_cnt_f_next_addsub0000_10_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X33Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_9_Q,
      O => u_speed_cnt_f_next_addsub0000_10_CYINIT_2138
    );
  u_speed_cnt_f_next_addsub0000_10_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_10_F,
      O => u_speed_cnt_f_next_addsub0000_10_CYSELF_2125
    );
  u_speed_cnt_f_next_addsub0000_10_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_10_XORG_2127,
      O => u_speed_cnt_f_next_addsub0000(11)
    );
  u_speed_cnt_f_next_addsub0000_10_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X33Y38"
    )
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy_10_Q,
      I1 => u_speed_cnt_f_next_addsub0000_10_G,
      O => u_speed_cnt_f_next_addsub0000_10_XORG_2127
    );
  u_speed_cnt_f_next_addsub0000_10_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_10_CYMUXFAST_2124,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_11_Q
    );
  u_speed_cnt_f_next_addsub0000_10_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_9_Q,
      O => u_speed_cnt_f_next_addsub0000_10_FASTCARRY_2122
    );
  u_speed_cnt_f_next_addsub0000_10_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y38"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_10_CYSELG_2110,
      I1 => u_speed_cnt_f_next_addsub0000_10_CYSELF_2125,
      O => u_speed_cnt_f_next_addsub0000_10_CYAND_2123
    );
  u_speed_cnt_f_next_addsub0000_10_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y38"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_10_CYMUXG2_2121,
      IB => u_speed_cnt_f_next_addsub0000_10_FASTCARRY_2122,
      SEL => u_speed_cnt_f_next_addsub0000_10_CYAND_2123,
      O => u_speed_cnt_f_next_addsub0000_10_CYMUXFAST_2124
    );
  u_speed_cnt_f_next_addsub0000_10_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y38"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_10_LOGIC_ZERO_2119,
      IB => u_speed_cnt_f_next_addsub0000_10_CYMUXF2_2120,
      SEL => u_speed_cnt_f_next_addsub0000_10_CYSELG_2110,
      O => u_speed_cnt_f_next_addsub0000_10_CYMUXG2_2121
    );
  u_speed_cnt_f_next_addsub0000_10_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_10_G,
      O => u_speed_cnt_f_next_addsub0000_10_CYSELG_2110
    );
  u_speed_cnt_f_next_addsub0000_12_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y39"
    )
    port map (
      O => u_speed_cnt_f_next_addsub0000_12_LOGIC_ZERO_2157
    );
  u_speed_cnt_f_next_addsub0000_12_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_12_XORF_2177,
      O => u_speed_cnt_f_next_addsub0000(12)
    );
  u_speed_cnt_f_next_addsub0000_12_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X33Y39"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_12_CYINIT_2176,
      I1 => u_speed_cnt_f_next_addsub0000_12_F,
      O => u_speed_cnt_f_next_addsub0000_12_XORF_2177
    );
  u_speed_cnt_f_next_addsub0000_12_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X33Y39"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_12_LOGIC_ZERO_2157,
      IB => u_speed_cnt_f_next_addsub0000_12_CYINIT_2176,
      SEL => u_speed_cnt_f_next_addsub0000_12_CYSELF_2163,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_12_Q
    );
  u_speed_cnt_f_next_addsub0000_12_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y39"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_12_LOGIC_ZERO_2157,
      IB => u_speed_cnt_f_next_addsub0000_12_LOGIC_ZERO_2157,
      SEL => u_speed_cnt_f_next_addsub0000_12_CYSELF_2163,
      O => u_speed_cnt_f_next_addsub0000_12_CYMUXF2_2158
    );
  u_speed_cnt_f_next_addsub0000_12_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X33Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_11_Q,
      O => u_speed_cnt_f_next_addsub0000_12_CYINIT_2176
    );
  u_speed_cnt_f_next_addsub0000_12_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_12_F,
      O => u_speed_cnt_f_next_addsub0000_12_CYSELF_2163
    );
  u_speed_cnt_f_next_addsub0000_12_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_12_XORG_2165,
      O => u_speed_cnt_f_next_addsub0000(13)
    );
  u_speed_cnt_f_next_addsub0000_12_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X33Y39"
    )
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy_12_Q,
      I1 => u_speed_cnt_f_next_addsub0000_12_G,
      O => u_speed_cnt_f_next_addsub0000_12_XORG_2165
    );
  u_speed_cnt_f_next_addsub0000_12_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_12_CYMUXFAST_2162,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_13_Q
    );
  u_speed_cnt_f_next_addsub0000_12_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_11_Q,
      O => u_speed_cnt_f_next_addsub0000_12_FASTCARRY_2160
    );
  u_speed_cnt_f_next_addsub0000_12_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y39"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_12_CYSELG_2148,
      I1 => u_speed_cnt_f_next_addsub0000_12_CYSELF_2163,
      O => u_speed_cnt_f_next_addsub0000_12_CYAND_2161
    );
  u_speed_cnt_f_next_addsub0000_12_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y39"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_12_CYMUXG2_2159,
      IB => u_speed_cnt_f_next_addsub0000_12_FASTCARRY_2160,
      SEL => u_speed_cnt_f_next_addsub0000_12_CYAND_2161,
      O => u_speed_cnt_f_next_addsub0000_12_CYMUXFAST_2162
    );
  u_speed_cnt_f_next_addsub0000_12_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y39"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_12_LOGIC_ZERO_2157,
      IB => u_speed_cnt_f_next_addsub0000_12_CYMUXF2_2158,
      SEL => u_speed_cnt_f_next_addsub0000_12_CYSELG_2148,
      O => u_speed_cnt_f_next_addsub0000_12_CYMUXG2_2159
    );
  u_speed_cnt_f_next_addsub0000_12_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_12_G,
      O => u_speed_cnt_f_next_addsub0000_12_CYSELG_2148
    );
  u_speed_cnt_f_next_addsub0000_14_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y40"
    )
    port map (
      O => u_speed_cnt_f_next_addsub0000_14_LOGIC_ZERO_2195
    );
  u_speed_cnt_f_next_addsub0000_14_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_14_XORF_2215,
      O => u_speed_cnt_f_next_addsub0000(14)
    );
  u_speed_cnt_f_next_addsub0000_14_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X33Y40"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_14_CYINIT_2214,
      I1 => u_speed_cnt_f_next_addsub0000_14_F,
      O => u_speed_cnt_f_next_addsub0000_14_XORF_2215
    );
  u_speed_cnt_f_next_addsub0000_14_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X33Y40"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_14_LOGIC_ZERO_2195,
      IB => u_speed_cnt_f_next_addsub0000_14_CYINIT_2214,
      SEL => u_speed_cnt_f_next_addsub0000_14_CYSELF_2201,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_14_Q
    );
  u_speed_cnt_f_next_addsub0000_14_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y40"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_14_LOGIC_ZERO_2195,
      IB => u_speed_cnt_f_next_addsub0000_14_LOGIC_ZERO_2195,
      SEL => u_speed_cnt_f_next_addsub0000_14_CYSELF_2201,
      O => u_speed_cnt_f_next_addsub0000_14_CYMUXF2_2196
    );
  u_speed_cnt_f_next_addsub0000_14_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X33Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_13_Q,
      O => u_speed_cnt_f_next_addsub0000_14_CYINIT_2214
    );
  u_speed_cnt_f_next_addsub0000_14_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_14_F,
      O => u_speed_cnt_f_next_addsub0000_14_CYSELF_2201
    );
  u_speed_cnt_f_next_addsub0000_14_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_14_XORG_2203,
      O => u_speed_cnt_f_next_addsub0000(15)
    );
  u_speed_cnt_f_next_addsub0000_14_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X33Y40"
    )
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy_14_Q,
      I1 => u_speed_cnt_f_next_addsub0000_14_G,
      O => u_speed_cnt_f_next_addsub0000_14_XORG_2203
    );
  u_speed_cnt_f_next_addsub0000_14_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_14_CYMUXFAST_2200,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_15_Q
    );
  u_speed_cnt_f_next_addsub0000_14_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_13_Q,
      O => u_speed_cnt_f_next_addsub0000_14_FASTCARRY_2198
    );
  u_speed_cnt_f_next_addsub0000_14_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y40"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_14_CYSELG_2186,
      I1 => u_speed_cnt_f_next_addsub0000_14_CYSELF_2201,
      O => u_speed_cnt_f_next_addsub0000_14_CYAND_2199
    );
  u_speed_cnt_f_next_addsub0000_14_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y40"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_14_CYMUXG2_2197,
      IB => u_speed_cnt_f_next_addsub0000_14_FASTCARRY_2198,
      SEL => u_speed_cnt_f_next_addsub0000_14_CYAND_2199,
      O => u_speed_cnt_f_next_addsub0000_14_CYMUXFAST_2200
    );
  u_speed_cnt_f_next_addsub0000_14_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y40"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_14_LOGIC_ZERO_2195,
      IB => u_speed_cnt_f_next_addsub0000_14_CYMUXF2_2196,
      SEL => u_speed_cnt_f_next_addsub0000_14_CYSELG_2186,
      O => u_speed_cnt_f_next_addsub0000_14_CYMUXG2_2197
    );
  u_speed_cnt_f_next_addsub0000_14_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_14_G,
      O => u_speed_cnt_f_next_addsub0000_14_CYSELG_2186
    );
  u_speed_cnt_f_next_addsub0000_16_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y41"
    )
    port map (
      O => u_speed_cnt_f_next_addsub0000_16_LOGIC_ZERO_2233
    );
  u_speed_cnt_f_next_addsub0000_16_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_16_XORF_2253,
      O => u_speed_cnt_f_next_addsub0000(16)
    );
  u_speed_cnt_f_next_addsub0000_16_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X33Y41"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_16_CYINIT_2252,
      I1 => u_speed_cnt_f_next_addsub0000_16_F,
      O => u_speed_cnt_f_next_addsub0000_16_XORF_2253
    );
  u_speed_cnt_f_next_addsub0000_16_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X33Y41"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_16_LOGIC_ZERO_2233,
      IB => u_speed_cnt_f_next_addsub0000_16_CYINIT_2252,
      SEL => u_speed_cnt_f_next_addsub0000_16_CYSELF_2239,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_16_Q
    );
  u_speed_cnt_f_next_addsub0000_16_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y41"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_16_LOGIC_ZERO_2233,
      IB => u_speed_cnt_f_next_addsub0000_16_LOGIC_ZERO_2233,
      SEL => u_speed_cnt_f_next_addsub0000_16_CYSELF_2239,
      O => u_speed_cnt_f_next_addsub0000_16_CYMUXF2_2234
    );
  u_speed_cnt_f_next_addsub0000_16_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X33Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_15_Q,
      O => u_speed_cnt_f_next_addsub0000_16_CYINIT_2252
    );
  u_speed_cnt_f_next_addsub0000_16_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_16_F,
      O => u_speed_cnt_f_next_addsub0000_16_CYSELF_2239
    );
  u_speed_cnt_f_next_addsub0000_16_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_16_XORG_2241,
      O => u_speed_cnt_f_next_addsub0000(17)
    );
  u_speed_cnt_f_next_addsub0000_16_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X33Y41"
    )
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy_16_Q,
      I1 => u_speed_cnt_f_next_addsub0000_16_G,
      O => u_speed_cnt_f_next_addsub0000_16_XORG_2241
    );
  u_speed_cnt_f_next_addsub0000_16_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X33Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Madd_cnt_f_next_addsub0000_cy_15_Q,
      O => u_speed_cnt_f_next_addsub0000_16_FASTCARRY_2236
    );
  u_speed_cnt_f_next_addsub0000_16_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X33Y41"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_16_CYSELG_2224,
      I1 => u_speed_cnt_f_next_addsub0000_16_CYSELF_2239,
      O => u_speed_cnt_f_next_addsub0000_16_CYAND_2237
    );
  u_speed_cnt_f_next_addsub0000_16_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X33Y41"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_16_CYMUXG2_2235,
      IB => u_speed_cnt_f_next_addsub0000_16_FASTCARRY_2236,
      SEL => u_speed_cnt_f_next_addsub0000_16_CYAND_2237,
      O => u_speed_cnt_f_next_addsub0000_16_CYMUXFAST_2238
    );
  u_speed_cnt_f_next_addsub0000_16_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X33Y41"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_16_LOGIC_ZERO_2233,
      IB => u_speed_cnt_f_next_addsub0000_16_CYMUXF2_2234,
      SEL => u_speed_cnt_f_next_addsub0000_16_CYSELG_2224,
      O => u_speed_cnt_f_next_addsub0000_16_CYMUXG2_2235
    );
  u_speed_cnt_f_next_addsub0000_16_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X33Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_16_G,
      O => u_speed_cnt_f_next_addsub0000_16_CYSELG_2224
    );
  u_speed_cnt_f_next_addsub0000_18_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X33Y42"
    )
    port map (
      O => u_speed_cnt_f_next_addsub0000_18_LOGIC_ZERO_2283
    );
  u_speed_cnt_f_next_addsub0000_18_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_18_XORF_2284,
      O => u_speed_cnt_f_next_addsub0000(18)
    );
  u_speed_cnt_f_next_addsub0000_18_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X33Y42"
    )
    port map (
      I0 => u_speed_cnt_f_next_addsub0000_18_CYINIT_2282,
      I1 => u_speed_cnt_f_next_addsub0000_18_F,
      O => u_speed_cnt_f_next_addsub0000_18_XORF_2284
    );
  u_speed_cnt_f_next_addsub0000_18_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X33Y42"
    )
    port map (
      IA => u_speed_cnt_f_next_addsub0000_18_LOGIC_ZERO_2283,
      IB => u_speed_cnt_f_next_addsub0000_18_CYINIT_2282,
      SEL => u_speed_cnt_f_next_addsub0000_18_CYSELF_2273,
      O => u_speed_Madd_cnt_f_next_addsub0000_cy_18_Q
    );
  u_speed_cnt_f_next_addsub0000_18_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X33Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_16_CYMUXFAST_2238,
      O => u_speed_cnt_f_next_addsub0000_18_CYINIT_2282
    );
  u_speed_cnt_f_next_addsub0000_18_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X33Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_18_F,
      O => u_speed_cnt_f_next_addsub0000_18_CYSELF_2273
    );
  u_speed_cnt_f_next_addsub0000_18_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X33Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_addsub0000_18_XORG_2270,
      O => u_speed_cnt_f_next_addsub0000(19)
    );
  u_speed_cnt_f_next_addsub0000_18_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X33Y42"
    )
    port map (
      I0 => u_speed_Madd_cnt_f_next_addsub0000_cy_18_Q,
      I1 => u_speed_cnt_f_19_rt_2267,
      O => u_speed_cnt_f_next_addsub0000_18_XORG_2270
    );
  u_speed_cnt_f_19_rt : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X33Y42"
    )
    port map (
      ADR0 => u_speed_cnt_f(19),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_f_19_rt_2267
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X35Y37"
    )
    port map (
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_LOGIC_ZERO_2303
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X35Y37"
    )
    port map (
      IA => u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_LOGIC_ZERO_2303,
      IB => u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYINIT_2314,
      SEL => u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYSELF_2308,
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy(0)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X35Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_BXINV_2306,
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYINIT_2314
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_cmp_eq0000_wg_lut(0),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYSELF_2308
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X35Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_BXINV_2306
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X35Y37"
    )
    port map (
      IA => u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_LOGIC_ZERO_2303,
      IB => u_speed_cnt_f_next_cmp_eq0000_wg_cy(0),
      SEL => u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYSELG_2297,
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYMUXG_2305
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X35Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_cmp_eq0000_wg_lut(1),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYSELG_2297
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_1_Q : X_LUT4
    generic map(
      INIT => X"0001",
      LOC => "SLICE_X35Y37"
    )
    port map (
      ADR0 => u_speed_cnt_f(9),
      ADR1 => u_speed_cnt_f(12),
      ADR2 => u_speed_cnt_f(3),
      ADR3 => u_speed_cnt_f(8),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(1)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X35Y38"
    )
    port map (
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_LOGIC_ZERO_2332
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y38"
    )
    port map (
      IA => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_LOGIC_ZERO_2332,
      IB => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_LOGIC_ZERO_2332,
      SEL => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYSELF_2338,
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYMUXF2_2333
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_cmp_eq0000_wg_lut(2),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYSELF_2338
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X35Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_cmp_eq0000_wg_cy_1_CYMUXG_2305,
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_FASTCARRY_2335
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X35Y38"
    )
    port map (
      I0 => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYSELG_2326,
      I1 => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYSELF_2338,
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYAND_2336
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X35Y38"
    )
    port map (
      IA => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYMUXG2_2334,
      IB => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_FASTCARRY_2335,
      SEL => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYAND_2336,
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYMUXFAST_2337
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X35Y38"
    )
    port map (
      IA => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_LOGIC_ZERO_2332,
      IB => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYMUXF2_2333,
      SEL => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYSELG_2326,
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYMUXG2_2334
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X35Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_cmp_eq0000_wg_lut(3),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYSELG_2326
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_3_Q : X_LUT4
    generic map(
      INIT => X"0001",
      LOC => "SLICE_X35Y38"
    )
    port map (
      ADR0 => u_speed_cnt_f(17),
      ADR1 => u_speed_cnt_f(15),
      ADR2 => u_speed_cnt_f(0),
      ADR3 => u_speed_cnt_f(14),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(3)
    );
  u_speed_cnt_f_next_cmp_eq0000_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X35Y39"
    )
    port map (
      O => u_speed_cnt_f_next_cmp_eq0000_LOGIC_ZERO_2359
    );
  u_speed_cnt_f_next_cmp_eq0000_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X35Y39"
    )
    port map (
      IA => u_speed_cnt_f_next_cmp_eq0000_LOGIC_ZERO_2359,
      IB => u_speed_cnt_f_next_cmp_eq0000_CYINIT_2358,
      SEL => u_speed_cnt_f_next_cmp_eq0000_CYSELF_2352,
      O => u_speed_cnt_f_next_cmp_eq0000
    );
  u_speed_cnt_f_next_cmp_eq0000_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X35Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_cmp_eq0000_wg_cy_3_CYMUXFAST_2337,
      O => u_speed_cnt_f_next_cmp_eq0000_CYINIT_2358
    );
  u_speed_cnt_f_next_cmp_eq0000_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X35Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next_cmp_eq0000_wg_lut(4),
      O => u_speed_cnt_f_next_cmp_eq0000_CYSELF_2352
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_4_Q : X_LUT4
    generic map(
      INIT => X"0001",
      LOC => "SLICE_X35Y39"
    )
    port map (
      ADR0 => u_speed_cnt_f(19),
      ADR1 => u_speed_cnt_f(2),
      ADR2 => u_speed_cnt_f(16),
      ADR3 => u_speed_cnt_f(18),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(4)
    );
  u_knight_count_0_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X21Y13"
    )
    port map (
      O => u_knight_count_0_LOGIC_ZERO_2382
    );
  u_knight_count_0_LOGIC_ONE : X_ONE
    generic map(
      LOC => "SLICE_X21Y13"
    )
    port map (
      O => u_knight_count_0_LOGIC_ONE_2405
    );
  u_knight_count_0_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X21Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_0_XORF_2406,
      O => u_knight_count_0_DXMUX_2408
    );
  u_knight_count_0_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X21Y13"
    )
    port map (
      I0 => u_knight_count_0_CYINIT_2404,
      I1 => u_knight_Mcount_count_lut(0),
      O => u_knight_count_0_XORF_2406
    );
  u_knight_count_0_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X21Y13"
    )
    port map (
      IA => u_knight_count_0_LOGIC_ONE_2405,
      IB => u_knight_count_0_CYINIT_2404,
      SEL => u_knight_count_0_CYSELF_2395,
      O => u_knight_Mcount_count_cy_0_Q
    );
  u_knight_count_0_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X21Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_0_BXINV_2393,
      O => u_knight_count_0_CYINIT_2404
    );
  u_knight_count_0_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X21Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_Mcount_count_lut(0),
      O => u_knight_count_0_CYSELF_2395
    );
  u_knight_count_0_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X21Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => '0',
      O => u_knight_count_0_BXINV_2393
    );
  u_knight_count_0_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X21Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_0_XORG_2385,
      O => u_knight_count_0_DYMUX_2387
    );
  u_knight_count_0_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X21Y13"
    )
    port map (
      I0 => u_knight_Mcount_count_cy_0_Q,
      I1 => u_knight_count_0_G,
      O => u_knight_count_0_XORG_2385
    );
  u_knight_count_0_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X21Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_0_CYMUXG_2384,
      O => u_knight_Mcount_count_cy_1_Q
    );
  u_knight_count_0_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X21Y13"
    )
    port map (
      IA => u_knight_count_0_LOGIC_ZERO_2382,
      IB => u_knight_Mcount_count_cy_0_Q,
      SEL => u_knight_count_0_CYSELG_2373,
      O => u_knight_count_0_CYMUXG_2384
    );
  u_knight_count_0_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X21Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_0_G,
      O => u_knight_count_0_CYSELG_2373
    );
  u_knight_count_0_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X21Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_knight_count_0_SRINV_2371
    );
  u_knight_count_0_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X21Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_knight_count_0_CLKINV_2370
    );
  u_knight_count_0_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X21Y13",
      PATHPULSE => 638 ps
    )
    port map (
      I => step,
      O => u_knight_count_0_CEINV_2369
    );
  u_knight_count_2_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X21Y14"
    )
    port map (
      O => u_knight_count_2_LOGIC_ZERO_2436
    );
  u_knight_count_2_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X21Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_2_XORF_2462,
      O => u_knight_count_2_DXMUX_2464
    );
  u_knight_count_2_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X21Y14"
    )
    port map (
      I0 => u_knight_count_2_CYINIT_2461,
      I1 => u_knight_count_2_F,
      O => u_knight_count_2_XORF_2462
    );
  u_knight_count_2_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X21Y14"
    )
    port map (
      IA => u_knight_count_2_LOGIC_ZERO_2436,
      IB => u_knight_count_2_CYINIT_2461,
      SEL => u_knight_count_2_CYSELF_2442,
      O => u_knight_Mcount_count_cy_2_Q
    );
  u_knight_count_2_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X21Y14"
    )
    port map (
      IA => u_knight_count_2_LOGIC_ZERO_2436,
      IB => u_knight_count_2_LOGIC_ZERO_2436,
      SEL => u_knight_count_2_CYSELF_2442,
      O => u_knight_count_2_CYMUXF2_2437
    );
  u_knight_count_2_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X21Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_Mcount_count_cy_1_Q,
      O => u_knight_count_2_CYINIT_2461
    );
  u_knight_count_2_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X21Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_2_F,
      O => u_knight_count_2_CYSELF_2442
    );
  u_knight_count_2_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X21Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_2_XORG_2444,
      O => u_knight_count_2_DYMUX_2446
    );
  u_knight_count_2_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X21Y14"
    )
    port map (
      I0 => u_knight_Mcount_count_cy_2_Q,
      I1 => u_knight_count_2_G,
      O => u_knight_count_2_XORG_2444
    );
  u_knight_count_2_COUTUSED : X_BUF
    generic map(
      LOC => "SLICE_X21Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_2_CYMUXFAST_2441,
      O => u_knight_Mcount_count_cy_3_Q
    );
  u_knight_count_2_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X21Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_Mcount_count_cy_1_Q,
      O => u_knight_count_2_FASTCARRY_2439
    );
  u_knight_count_2_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X21Y14"
    )
    port map (
      I0 => u_knight_count_2_CYSELG_2427,
      I1 => u_knight_count_2_CYSELF_2442,
      O => u_knight_count_2_CYAND_2440
    );
  u_knight_count_2_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X21Y14"
    )
    port map (
      IA => u_knight_count_2_CYMUXG2_2438,
      IB => u_knight_count_2_FASTCARRY_2439,
      SEL => u_knight_count_2_CYAND_2440,
      O => u_knight_count_2_CYMUXFAST_2441
    );
  u_knight_count_2_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X21Y14"
    )
    port map (
      IA => u_knight_count_2_LOGIC_ZERO_2436,
      IB => u_knight_count_2_CYMUXF2_2437,
      SEL => u_knight_count_2_CYSELG_2427,
      O => u_knight_count_2_CYMUXG2_2438
    );
  u_knight_count_2_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X21Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_2_G,
      O => u_knight_count_2_CYSELG_2427
    );
  u_knight_count_2_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X21Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_knight_count_2_SRINV_2425
    );
  u_knight_count_2_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X21Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_knight_count_2_CLKINV_2424
    );
  u_knight_count_2_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X21Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => step,
      O => u_knight_count_2_CEINV_2423
    );
  u_knight_count_4_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X21Y15"
    )
    port map (
      O => u_knight_count_4_LOGIC_ZERO_2492
    );
  u_knight_count_4_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X21Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_4_XORF_2518,
      O => u_knight_count_4_DXMUX_2520
    );
  u_knight_count_4_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X21Y15"
    )
    port map (
      I0 => u_knight_count_4_CYINIT_2517,
      I1 => u_knight_count_4_F,
      O => u_knight_count_4_XORF_2518
    );
  u_knight_count_4_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X21Y15"
    )
    port map (
      IA => u_knight_count_4_LOGIC_ZERO_2492,
      IB => u_knight_count_4_CYINIT_2517,
      SEL => u_knight_count_4_CYSELF_2498,
      O => u_knight_Mcount_count_cy_4_Q
    );
  u_knight_count_4_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X21Y15"
    )
    port map (
      IA => u_knight_count_4_LOGIC_ZERO_2492,
      IB => u_knight_count_4_LOGIC_ZERO_2492,
      SEL => u_knight_count_4_CYSELF_2498,
      O => u_knight_count_4_CYMUXF2_2493
    );
  u_knight_count_4_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X21Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_Mcount_count_cy_3_Q,
      O => u_knight_count_4_CYINIT_2517
    );
  u_knight_count_4_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X21Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_4_F,
      O => u_knight_count_4_CYSELF_2498
    );
  u_knight_count_4_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X21Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_4_XORG_2500,
      O => u_knight_count_4_DYMUX_2502
    );
  u_knight_count_4_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X21Y15"
    )
    port map (
      I0 => u_knight_Mcount_count_cy_4_Q,
      I1 => u_knight_count_4_G,
      O => u_knight_count_4_XORG_2500
    );
  u_knight_count_4_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X21Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_Mcount_count_cy_3_Q,
      O => u_knight_count_4_FASTCARRY_2495
    );
  u_knight_count_4_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X21Y15"
    )
    port map (
      I0 => u_knight_count_4_CYSELG_2483,
      I1 => u_knight_count_4_CYSELF_2498,
      O => u_knight_count_4_CYAND_2496
    );
  u_knight_count_4_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X21Y15"
    )
    port map (
      IA => u_knight_count_4_CYMUXG2_2494,
      IB => u_knight_count_4_FASTCARRY_2495,
      SEL => u_knight_count_4_CYAND_2496,
      O => u_knight_count_4_CYMUXFAST_2497
    );
  u_knight_count_4_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X21Y15"
    )
    port map (
      IA => u_knight_count_4_LOGIC_ZERO_2492,
      IB => u_knight_count_4_CYMUXF2_2493,
      SEL => u_knight_count_4_CYSELG_2483,
      O => u_knight_count_4_CYMUXG2_2494
    );
  u_knight_count_4_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X21Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_4_G,
      O => u_knight_count_4_CYSELG_2483
    );
  u_knight_count_4_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X21Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_knight_count_4_SRINV_2481
    );
  u_knight_count_4_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X21Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_knight_count_4_CLKINV_2480
    );
  u_knight_count_4_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X21Y15",
      PATHPULSE => 638 ps
    )
    port map (
      I => step,
      O => u_knight_count_4_CEINV_2479
    );
  u_knight_count_6_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X21Y16"
    )
    port map (
      O => u_knight_count_6_LOGIC_ZERO_2566
    );
  u_knight_count_6_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X21Y16",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_6_XORF_2567,
      O => u_knight_count_6_DXMUX_2569
    );
  u_knight_count_6_XORF : X_XOR2
    generic map(
      LOC => "SLICE_X21Y16"
    )
    port map (
      I0 => u_knight_count_6_CYINIT_2565,
      I1 => u_knight_count_6_F,
      O => u_knight_count_6_XORF_2567
    );
  u_knight_count_6_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X21Y16"
    )
    port map (
      IA => u_knight_count_6_LOGIC_ZERO_2566,
      IB => u_knight_count_6_CYINIT_2565,
      SEL => u_knight_count_6_CYSELF_2556,
      O => u_knight_Mcount_count_cy_6_Q
    );
  u_knight_count_6_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X21Y16",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_4_CYMUXFAST_2497,
      O => u_knight_count_6_CYINIT_2565
    );
  u_knight_count_6_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X21Y16",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_6_F,
      O => u_knight_count_6_CYSELF_2556
    );
  u_knight_count_6_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X21Y16",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_count_6_XORG_2547,
      O => u_knight_count_6_DYMUX_2549
    );
  u_knight_count_6_XORG : X_XOR2
    generic map(
      LOC => "SLICE_X21Y16"
    )
    port map (
      I0 => u_knight_Mcount_count_cy_6_Q,
      I1 => u_knight_count_7_rt_2544,
      O => u_knight_count_6_XORG_2547
    );
  u_knight_count_6_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X21Y16",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_knight_count_6_SRINV_2536
    );
  u_knight_count_6_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X21Y16",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_knight_count_6_CLKINV_2535
    );
  u_knight_count_6_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X21Y16",
      PATHPULSE => 638 ps
    )
    port map (
      I => step,
      O => u_knight_count_6_CEINV_2534
    );
  u_knight_count_7_rt : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X21Y16"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_knight_count(7),
      O => u_knight_count_7_rt_2544
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X37Y33"
    )
    port map (
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_LOGIC_ZERO_2592
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X37Y33"
    )
    port map (
      IA => u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_LOGIC_ZERO_2592,
      IB => u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYINIT_2603,
      SEL => u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYSELF_2597,
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy(0)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X37Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_BXINV_2595,
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYINIT_2603
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X37Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_cmp_eq0000_wg_lut(0),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYSELF_2597
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_BXINV : X_BUF
    generic map(
      LOC => "SLICE_X37Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_BXINV_2595
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYMUXG : X_MUX2
    generic map(
      LOC => "SLICE_X37Y33"
    )
    port map (
      IA => u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_LOGIC_ZERO_2592,
      IB => u_speed_cnt_s_next_cmp_eq0000_wg_cy(0),
      SEL => u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYSELG_2586,
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYMUXG_2594
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X37Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_cmp_eq0000_wg_lut(1),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYSELG_2586
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_1_Q : X_LUT4
    generic map(
      INIT => X"0001",
      LOC => "SLICE_X37Y33"
    )
    port map (
      ADR0 => u_speed_cnt_s(8),
      ADR1 => u_speed_cnt_s(3),
      ADR2 => u_speed_cnt_s(9),
      ADR3 => u_speed_cnt_s(12),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(1)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X37Y34"
    )
    port map (
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_LOGIC_ZERO_2621
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYMUXF2 : X_MUX2
    generic map(
      LOC => "SLICE_X37Y34"
    )
    port map (
      IA => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_LOGIC_ZERO_2621,
      IB => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_LOGIC_ZERO_2621,
      SEL => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYSELF_2627,
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYMUXF2_2622
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X37Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_cmp_eq0000_wg_lut(2),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYSELF_2627
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_FASTCARRY : X_BUF
    generic map(
      LOC => "SLICE_X37Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_cmp_eq0000_wg_cy_1_CYMUXG_2594,
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_FASTCARRY_2624
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYAND : X_AND2
    generic map(
      LOC => "SLICE_X37Y34"
    )
    port map (
      I0 => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYSELG_2615,
      I1 => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYSELF_2627,
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYAND_2625
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYMUXFAST : X_MUX2
    generic map(
      LOC => "SLICE_X37Y34"
    )
    port map (
      IA => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYMUXG2_2623,
      IB => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_FASTCARRY_2624,
      SEL => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYAND_2625,
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYMUXFAST_2626
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYMUXG2 : X_MUX2
    generic map(
      LOC => "SLICE_X37Y34"
    )
    port map (
      IA => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_LOGIC_ZERO_2621,
      IB => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYMUXF2_2622,
      SEL => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYSELG_2615,
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYMUXG2_2623
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYSELG : X_BUF
    generic map(
      LOC => "SLICE_X37Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_cmp_eq0000_wg_lut(3),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYSELG_2615
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_3_Q : X_LUT4
    generic map(
      INIT => X"0001",
      LOC => "SLICE_X37Y34"
    )
    port map (
      ADR0 => u_speed_cnt_s(0),
      ADR1 => u_speed_cnt_s(14),
      ADR2 => u_speed_cnt_s(17),
      ADR3 => u_speed_cnt_s(15),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(3)
    );
  u_speed_cnt_s_next_cmp_eq0000_LOGIC_ZERO : X_ZERO
    generic map(
      LOC => "SLICE_X37Y35"
    )
    port map (
      O => u_speed_cnt_s_next_cmp_eq0000_LOGIC_ZERO_2648
    );
  u_speed_cnt_s_next_cmp_eq0000_CYMUXF : X_MUX2
    generic map(
      LOC => "SLICE_X37Y35"
    )
    port map (
      IA => u_speed_cnt_s_next_cmp_eq0000_LOGIC_ZERO_2648,
      IB => u_speed_cnt_s_next_cmp_eq0000_CYINIT_2647,
      SEL => u_speed_cnt_s_next_cmp_eq0000_CYSELF_2641,
      O => u_speed_cnt_s_next_cmp_eq0000
    );
  u_speed_cnt_s_next_cmp_eq0000_CYINIT : X_BUF
    generic map(
      LOC => "SLICE_X37Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_cmp_eq0000_wg_cy_3_CYMUXFAST_2626,
      O => u_speed_cnt_s_next_cmp_eq0000_CYINIT_2647
    );
  u_speed_cnt_s_next_cmp_eq0000_CYSELF : X_BUF
    generic map(
      LOC => "SLICE_X37Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next_cmp_eq0000_wg_lut(4),
      O => u_speed_cnt_s_next_cmp_eq0000_CYSELF_2641
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_4_Q : X_LUT4
    generic map(
      INIT => X"0001",
      LOC => "SLICE_X37Y35"
    )
    port map (
      ADR0 => u_speed_cnt_s(16),
      ADR1 => u_speed_cnt_s(18),
      ADR2 => u_speed_cnt_s(19),
      ADR3 => u_speed_cnt_s(2),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(4)
    );
  led_0_OBUF : X_OBUF
    generic map(
      LOC => "PAD110"
    )
    port map (
      I => led_0_O,
      O => led(0)
    );
  btn_0_IBUF : X_BUF
    generic map(
      LOC => "IPAD61",
      PATHPULSE => 638 ps
    )
    port map (
      I => btn(0),
      O => btn_0_INBUF
    );
  led_1_OBUF : X_OBUF
    generic map(
      LOC => "PAD90"
    )
    port map (
      I => led_1_O,
      O => led(1)
    );
  btn_1_IBUF : X_BUF
    generic map(
      LOC => "PAD34",
      PATHPULSE => 638 ps
    )
    port map (
      I => btn(1),
      O => btn_1_INBUF
    );
  led_2_OBUF : X_OBUF
    generic map(
      LOC => "PAD105"
    )
    port map (
      I => led_2_O,
      O => led(2)
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
  led_3_OBUF : X_OBUF
    generic map(
      LOC => "PAD106"
    )
    port map (
      I => led_3_O,
      O => led(3)
    );
  led_4_OBUF : X_OBUF
    generic map(
      LOC => "PAD109"
    )
    port map (
      I => led_4_O,
      O => led(4)
    );
  led_5_OBUF : X_OBUF
    generic map(
      LOC => "PAD112"
    )
    port map (
      I => led_5_O,
      O => led(5)
    );
  led_6_OBUF : X_OBUF
    generic map(
      LOC => "PAD111"
    )
    port map (
      I => led_6_O,
      O => led(6)
    );
  led_7_OBUF : X_OBUF
    generic map(
      LOC => "PAD153"
    )
    port map (
      I => led_7_O,
      O => led(7)
    );
  sw_0_IBUF : X_BUF
    generic map(
      LOC => "PAD92",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw(0),
      O => sw_0_INBUF
    );
  sw_0_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD92",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_INBUF,
      O => sw_0_IBUF_1145
    );
  sw_1_IBUF : X_BUF
    generic map(
      LOC => "PAD133",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw(1),
      O => sw_1_INBUF
    );
  sw_1_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD133",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_1_INBUF,
      O => sw_1_IBUF_1171
    );
  sw_2_IBUF : X_BUF
    generic map(
      LOC => "PAD136",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw(2),
      O => sw_2_INBUF
    );
  sw_2_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD136",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_2_INBUF,
      O => sw_2_IBUF_1172
    );
  sw_3_IBUF : X_BUF
    generic map(
      LOC => "PAD5",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw(3),
      O => sw_3_INBUF
    );
  sw_3_IFF_IMUX : X_BUF
    generic map(
      LOC => "PAD5",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_3_INBUF,
      O => sw_3_IBUF_1173
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
  u_speed_Mcount_level_val_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X31Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcount_level_val,
      O => u_speed_Mcount_level_val_0
    );
  u_speed_Mcount_level_val_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X31Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_N7_pack_1,
      O => u_speed_N7
    );
  u_speed_Mcount_level_val22 : X_LUT4
    generic map(
      INIT => X"1000",
      LOC => "SLICE_X31Y30"
    )
    port map (
      ADR0 => u_speed_deb_f_1177,
      ADR1 => u_speed_state_reg(0),
      ADR2 => u_speed_N9_0,
      ADR3 => u_speed_deb_s_1176,
      O => u_speed_N7_pack_1
    );
  u_speed_level_and0000_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X30Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_level_and0000_2805,
      O => u_speed_level_and0000_0
    );
  u_speed_level_and0000_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X30Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_level_and0000_SW0_O_pack_1,
      O => u_speed_level_and0000_SW0_O
    );
  u_speed_level_and0000_SW0 : X_LUT4
    generic map(
      INIT => X"FCFF",
      LOC => "SLICE_X30Y32"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_state_reg(0),
      ADR2 => sw_0_IBUF_1145,
      ADR3 => u_speed_deb_f_1177,
      O => u_speed_level_and0000_SW0_O_pack_1
    );
  u_speed_Mcount_level_val1_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X30Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcount_level_val1_SW0_O_pack_1,
      O => u_speed_Mcount_level_val1_SW0_O
    );
  u_speed_Mcount_level_val1_SW0 : X_LUT4
    generic map(
      INIT => X"1100",
      LOC => "SLICE_X30Y33"
    )
    port map (
      ADR0 => u_speed_level(0),
      ADR1 => u_speed_state_reg(0),
      ADR2 => VCC,
      ADR3 => u_speed_deb_f_1177,
      O => u_speed_Mcount_level_val1_SW0_O_pack_1
    );
  u_speed_cnt_s_1_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(1),
      O => u_speed_cnt_s_1_DXMUX_2865
    );
  u_speed_cnt_s_1_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(0),
      O => u_speed_cnt_s_1_DYMUX_2853
    );
  u_speed_cnt_s_1_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_s_1_SRINV_2845
    );
  u_speed_cnt_s_1_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_s_1_CLKINV_2844
    );
  u_speed_cnt_s_next_0_1 : X_LUT4
    generic map(
      INIT => X"0600",
      LOC => "SLICE_X38Y28"
    )
    port map (
      ADR0 => u_speed_deb_s_1176,
      ADR1 => u_speed_slower_sync_1184,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(0),
      O => u_speed_cnt_s_next(0)
    );
  u_speed_cnt_s_3_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(3),
      O => u_speed_cnt_s_3_DXMUX_2903
    );
  u_speed_cnt_s_3_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(2),
      O => u_speed_cnt_s_3_DYMUX_2891
    );
  u_speed_cnt_s_3_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_s_3_SRINV_2883
    );
  u_speed_cnt_s_3_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_s_3_CLKINV_2882
    );
  u_speed_cnt_s_next_2_1 : X_LUT4
    generic map(
      INIT => X"1040",
      LOC => "SLICE_X38Y30"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_cmp_eq0000,
      ADR1 => u_speed_slower_sync_1184,
      ADR2 => u_speed_cnt_s_next_addsub0000(2),
      ADR3 => u_speed_deb_s_1176,
      O => u_speed_cnt_s_next(2)
    );
  u_speed_cnt_s_5_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(5),
      O => u_speed_cnt_s_5_DXMUX_2941
    );
  u_speed_cnt_s_5_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(4),
      O => u_speed_cnt_s_5_DYMUX_2929
    );
  u_speed_cnt_s_5_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_s_5_SRINV_2921
    );
  u_speed_cnt_s_5_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_s_5_CLKINV_2920
    );
  u_speed_cnt_s_next_4_1 : X_LUT4
    generic map(
      INIT => X"0600",
      LOC => "SLICE_X38Y31"
    )
    port map (
      ADR0 => u_speed_slower_sync_1184,
      ADR1 => u_speed_deb_s_1176,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_cnt_s_next_addsub0000(4),
      O => u_speed_cnt_s_next(4)
    );
  u_speed_cnt_s_7_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(7),
      O => u_speed_cnt_s_7_DXMUX_2979
    );
  u_speed_cnt_s_7_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(6),
      O => u_speed_cnt_s_7_DYMUX_2967
    );
  u_speed_cnt_s_7_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_s_7_SRINV_2959
    );
  u_speed_cnt_s_7_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_s_7_CLKINV_2958
    );
  u_speed_cnt_s_next_6_1 : X_LUT4
    generic map(
      INIT => X"1040",
      LOC => "SLICE_X38Y32"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_cmp_eq0000,
      ADR1 => u_speed_slower_sync_1184,
      ADR2 => u_speed_cnt_s_next_addsub0000(6),
      ADR3 => u_speed_deb_s_1176,
      O => u_speed_cnt_s_next(6)
    );
  u_speed_cnt_s_9_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(9),
      O => u_speed_cnt_s_9_DXMUX_3017
    );
  u_speed_cnt_s_9_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(8),
      O => u_speed_cnt_s_9_DYMUX_3005
    );
  u_speed_cnt_s_9_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_s_9_SRINV_2997
    );
  u_speed_cnt_s_9_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y33",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_s_9_CLKINV_2996
    );
  u_speed_cnt_s_next_8_1 : X_LUT4
    generic map(
      INIT => X"1400",
      LOC => "SLICE_X38Y33"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_cmp_eq0000,
      ADR1 => u_speed_slower_sync_1184,
      ADR2 => u_speed_deb_s_1176,
      ADR3 => u_speed_cnt_s_next_addsub0000(8),
      O => u_speed_cnt_s_next(8)
    );
  u_speed_state_reg_0_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X31Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_level_or0000,
      O => u_speed_level_or0000_0
    );
  u_speed_state_reg_0_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X31Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_state_next,
      O => u_speed_state_reg_0_DYMUX_3043
    );
  u_speed_state_reg_0_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X31Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_state_reg_0_SRINV_3033
    );
  u_speed_state_reg_0_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X31Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_state_reg_0_CLKINV_3032
    );
  u_speed_state_next_0_mux00001 : X_LUT4
    generic map(
      INIT => X"FAFA",
      LOC => "SLICE_X31Y32"
    )
    port map (
      ADR0 => u_speed_deb_f_1177,
      ADR1 => VCC,
      ADR2 => u_speed_deb_s_1176,
      ADR3 => VCC,
      O => u_speed_state_next
    );
  u_speed_step_reg_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X26Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_ticks_or0000,
      O => u_speed_ticks_or0000_0
    );
  u_speed_step_reg_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X26Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_step_next,
      O => u_speed_step_reg_DYMUX_3075
    );
  u_speed_step_reg_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X26Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_step_reg_SRINV_3065
    );
  u_speed_step_reg_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X26Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_step_reg_CLKINV_3064
    );
  u_speed_step_next1 : X_LUT4
    generic map(
      INIT => X"8888",
      LOC => "SLICE_X26Y29"
    )
    port map (
      ADR0 => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_Q,
      ADR1 => u_pre_tick_1021,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_step_next
    );
  u_speed_level_1_XUSED : X_BUF
    generic map(
      LOC => "SLICE_X30Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_N9,
      O => u_speed_N9_0
    );
  u_speed_level_1_REVUSED : X_BUF
    generic map(
      LOC => "SLICE_X30Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_level_and0001,
      O => u_speed_level_1_REVUSED_3113
    );
  u_speed_level_1_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X30Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Result(1),
      O => u_speed_level_1_DYMUX_3112
    );
  u_speed_level_1_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X30Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcount_level_val1_2829,
      O => u_speed_level_1_SRINV_3102
    );
  u_speed_level_1_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X30Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_level_1_CLKINV_3101
    );
  u_speed_level_1_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X30Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_level_or0000_0,
      O => u_speed_level_1_CEINV_3100
    );
  u_speed_level_2_REVUSED : X_BUF
    generic map(
      LOC => "SLICE_X31Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcount_level_val_0,
      O => u_speed_level_2_REVUSED_3153
    );
  u_speed_level_2_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X31Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Result(2),
      O => u_speed_level_2_DYMUX_3152
    );
  u_speed_level_2_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X31Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_level_and0000_0,
      O => u_speed_level_2_SRINV_3143
    );
  u_speed_level_2_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X31Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_level_2_CLKINV_3142
    );
  u_speed_level_2_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X31Y31",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_level_or0000_0,
      O => u_speed_level_2_CEINV_3141
    );
  u_speed_cnt_f_1_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(1),
      O => u_speed_cnt_f_1_DXMUX_3201
    );
  u_speed_cnt_f_1_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(0),
      O => u_speed_cnt_f_1_DYMUX_3189
    );
  u_speed_cnt_f_1_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_f_1_SRINV_3181
    );
  u_speed_cnt_f_1_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_f_1_CLKINV_3180
    );
  u_speed_cnt_f_next_0_1 : X_LUT4
    generic map(
      INIT => X"0600",
      LOC => "SLICE_X32Y32"
    )
    port map (
      ADR0 => u_speed_faster_sync_1188,
      ADR1 => u_speed_deb_f_1177,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_cnt_f_next_addsub0000(0),
      O => u_speed_cnt_f_next(0)
    );
  u_speed_cnt_f_3_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(3),
      O => u_speed_cnt_f_3_DXMUX_3239
    );
  u_speed_cnt_f_3_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(2),
      O => u_speed_cnt_f_3_DYMUX_3227
    );
  u_speed_cnt_f_3_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_f_3_SRINV_3219
    );
  u_speed_cnt_f_3_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_f_3_CLKINV_3218
    );
  u_speed_ticks_0 : X_SFF
    generic map(
      LOC => "SLICE_X27Y28",
      INIT => '0'
    )
    port map (
      I => u_speed_ticks_0_DXMUX_1254,
      CE => u_speed_ticks_0_CEINV_1215,
      CLK => u_speed_ticks_0_CLKINV_1216,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_ticks_0_SRINV_1217,
      O => u_speed_ticks(0)
    );
  u_speed_cnt_f_next_2_1 : X_LUT4
    generic map(
      INIT => X"1040",
      LOC => "SLICE_X32Y35"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_cmp_eq0000,
      ADR1 => u_speed_deb_f_1177,
      ADR2 => u_speed_cnt_f_next_addsub0000(2),
      ADR3 => u_speed_faster_sync_1188,
      O => u_speed_cnt_f_next(2)
    );
  u_speed_cnt_f_5_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(5),
      O => u_speed_cnt_f_5_DXMUX_3277
    );
  u_speed_cnt_f_5_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(4),
      O => u_speed_cnt_f_5_DYMUX_3265
    );
  u_speed_cnt_f_5_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_f_5_SRINV_3257
    );
  u_speed_cnt_f_5_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_f_5_CLKINV_3256
    );
  u_speed_cnt_f_next_4_1 : X_LUT4
    generic map(
      INIT => X"1400",
      LOC => "SLICE_X32Y34"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_cmp_eq0000,
      ADR1 => u_speed_deb_f_1177,
      ADR2 => u_speed_faster_sync_1188,
      ADR3 => u_speed_cnt_f_next_addsub0000(4),
      O => u_speed_cnt_f_next(4)
    );
  u_speed_cnt_f_11_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(11),
      O => u_speed_cnt_f_11_DXMUX_3315
    );
  u_speed_cnt_f_11_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(10),
      O => u_speed_cnt_f_11_DYMUX_3303
    );
  u_speed_cnt_f_11_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_f_11_SRINV_3295
    );
  u_speed_cnt_f_11_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_f_11_CLKINV_3294
    );
  u_speed_cnt_f_next_10_1 : X_LUT4
    generic map(
      INIT => X"0060",
      LOC => "SLICE_X32Y38"
    )
    port map (
      ADR0 => u_speed_faster_sync_1188,
      ADR1 => u_speed_deb_f_1177,
      ADR2 => u_speed_cnt_f_next_addsub0000(10),
      ADR3 => u_speed_cnt_f_next_cmp_eq0000,
      O => u_speed_cnt_f_next(10)
    );
  u_speed_cnt_f_7_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(7),
      O => u_speed_cnt_f_7_DXMUX_3353
    );
  u_speed_cnt_f_7_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(6),
      O => u_speed_cnt_f_7_DYMUX_3341
    );
  u_speed_cnt_f_7_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_f_7_SRINV_3333
    );
  u_speed_cnt_f_7_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_f_7_CLKINV_3332
    );
  u_speed_cnt_f_next_6_1 : X_LUT4
    generic map(
      INIT => X"1040",
      LOC => "SLICE_X32Y37"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_cmp_eq0000,
      ADR1 => u_speed_deb_f_1177,
      ADR2 => u_speed_cnt_f_next_addsub0000(6),
      ADR3 => u_speed_faster_sync_1188,
      O => u_speed_cnt_f_next(6)
    );
  u_speed_cnt_f_13_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(13),
      O => u_speed_cnt_f_13_DXMUX_3391
    );
  u_speed_cnt_f_13_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(12),
      O => u_speed_cnt_f_13_DYMUX_3379
    );
  u_speed_cnt_f_13_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_f_13_SRINV_3371
    );
  u_speed_cnt_f_13_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y39",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_f_13_CLKINV_3370
    );
  u_speed_cnt_f_next_12_1 : X_LUT4
    generic map(
      INIT => X"1200",
      LOC => "SLICE_X32Y39"
    )
    port map (
      ADR0 => u_speed_deb_f_1177,
      ADR1 => u_speed_cnt_f_next_cmp_eq0000,
      ADR2 => u_speed_faster_sync_1188,
      ADR3 => u_speed_cnt_f_next_addsub0000(12),
      O => u_speed_cnt_f_next(12)
    );
  u_speed_cnt_f_9_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X34Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(9),
      O => u_speed_cnt_f_9_DXMUX_3429
    );
  u_speed_cnt_f_9_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X34Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(8),
      O => u_speed_cnt_f_9_DYMUX_3417
    );
  u_speed_cnt_f_9_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X34Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_f_9_SRINV_3409
    );
  u_speed_cnt_f_9_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X34Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_f_9_CLKINV_3408
    );
  u_speed_cnt_f_next_8_1 : X_LUT4
    generic map(
      INIT => X"1400",
      LOC => "SLICE_X34Y36"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_cmp_eq0000,
      ADR1 => u_speed_deb_f_1177,
      ADR2 => u_speed_faster_sync_1188,
      ADR3 => u_speed_cnt_f_next_addsub0000(8),
      O => u_speed_cnt_f_next(8)
    );
  u_speed_cnt_s_11_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(11),
      O => u_speed_cnt_s_11_DXMUX_3467
    );
  u_speed_cnt_s_11_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(10),
      O => u_speed_cnt_s_11_DYMUX_3455
    );
  u_speed_cnt_s_11_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_s_11_SRINV_3447
    );
  u_speed_cnt_s_11_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y35",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_s_11_CLKINV_3446
    );
  u_speed_cnt_s_next_10_1 : X_LUT4
    generic map(
      INIT => X"0060",
      LOC => "SLICE_X38Y35"
    )
    port map (
      ADR0 => u_speed_slower_sync_1184,
      ADR1 => u_speed_deb_s_1176,
      ADR2 => u_speed_cnt_s_next_addsub0000(10),
      ADR3 => u_speed_cnt_s_next_cmp_eq0000,
      O => u_speed_cnt_s_next(10)
    );
  u_speed_cnt_f_15_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(15),
      O => u_speed_cnt_f_15_DXMUX_3505
    );
  u_speed_cnt_f_15_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(14),
      O => u_speed_cnt_f_15_DYMUX_3493
    );
  u_speed_cnt_f_15_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_f_15_SRINV_3485
    );
  u_speed_cnt_f_15_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_f_15_CLKINV_3484
    );
  u_speed_Mcount_ticks_lut_0_INV_0 : X_LUT4
    generic map(
      INIT => X"5555",
      LOC => "SLICE_X27Y28"
    )
    port map (
      ADR0 => u_speed_ticks(0),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_Mcount_ticks_lut(0)
    );
  u_speed_cnt_f_next_14_1 : X_LUT4
    generic map(
      INIT => X"0060",
      LOC => "SLICE_X32Y41"
    )
    port map (
      ADR0 => u_speed_faster_sync_1188,
      ADR1 => u_speed_deb_f_1177,
      ADR2 => u_speed_cnt_f_next_addsub0000(14),
      ADR3 => u_speed_cnt_f_next_cmp_eq0000,
      O => u_speed_cnt_f_next(14)
    );
  u_speed_cnt_s_13_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(13),
      O => u_speed_cnt_s_13_DXMUX_3543
    );
  u_speed_cnt_s_13_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(12),
      O => u_speed_cnt_s_13_DYMUX_3531
    );
  u_speed_cnt_s_13_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_s_13_SRINV_3523
    );
  u_speed_cnt_s_13_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y34",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_s_13_CLKINV_3522
    );
  u_speed_cnt_s_next_12_1 : X_LUT4
    generic map(
      INIT => X"1200",
      LOC => "SLICE_X38Y34"
    )
    port map (
      ADR0 => u_speed_slower_sync_1184,
      ADR1 => u_speed_cnt_s_next_cmp_eq0000,
      ADR2 => u_speed_deb_s_1176,
      ADR3 => u_speed_cnt_s_next_addsub0000(12),
      O => u_speed_cnt_s_next(12)
    );
  u_speed_cnt_f_17_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(17),
      O => u_speed_cnt_f_17_DXMUX_3581
    );
  u_speed_cnt_f_17_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(16),
      O => u_speed_cnt_f_17_DYMUX_3569
    );
  u_speed_cnt_f_17_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_f_17_SRINV_3561
    );
  u_speed_cnt_f_17_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y40",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_f_17_CLKINV_3560
    );
  u_speed_cnt_f_next_16_1 : X_LUT4
    generic map(
      INIT => X"1200",
      LOC => "SLICE_X32Y40"
    )
    port map (
      ADR0 => u_speed_deb_f_1177,
      ADR1 => u_speed_cnt_f_next_cmp_eq0000,
      ADR2 => u_speed_faster_sync_1188,
      ADR3 => u_speed_cnt_f_next_addsub0000(16),
      O => u_speed_cnt_f_next(16)
    );
  u_speed_cnt_s_15_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(15),
      O => u_speed_cnt_s_15_DXMUX_3619
    );
  u_speed_cnt_s_15_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(14),
      O => u_speed_cnt_s_15_DYMUX_3607
    );
  u_speed_cnt_s_15_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_s_15_SRINV_3599
    );
  u_speed_cnt_s_15_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y37",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_s_15_CLKINV_3598
    );
  u_speed_cnt_s_next_14_1 : X_LUT4
    generic map(
      INIT => X"1040",
      LOC => "SLICE_X38Y37"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_cmp_eq0000,
      ADR1 => u_speed_slower_sync_1184,
      ADR2 => u_speed_cnt_s_next_addsub0000(14),
      ADR3 => u_speed_deb_s_1176,
      O => u_speed_cnt_s_next(14)
    );
  u_speed_cnt_f_19_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(19),
      O => u_speed_cnt_f_19_DXMUX_3657
    );
  u_speed_cnt_f_19_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_f_next(18),
      O => u_speed_cnt_f_19_DYMUX_3645
    );
  u_speed_cnt_f_19_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_f_19_SRINV_3637
    );
  u_speed_cnt_f_19_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y42",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_f_19_CLKINV_3636
    );
  u_speed_ticks_1 : X_SFF
    generic map(
      LOC => "SLICE_X27Y28",
      INIT => '0'
    )
    port map (
      I => u_speed_ticks_0_DYMUX_1233,
      CE => u_speed_ticks_0_CEINV_1215,
      CLK => u_speed_ticks_0_CLKINV_1216,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_ticks_0_SRINV_1217,
      O => u_speed_ticks(1)
    );
  u_speed_cnt_f_next_18_1 : X_LUT4
    generic map(
      INIT => X"1040",
      LOC => "SLICE_X32Y42"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_cmp_eq0000,
      ADR1 => u_speed_deb_f_1177,
      ADR2 => u_speed_cnt_f_next_addsub0000(18),
      ADR3 => u_speed_faster_sync_1188,
      O => u_speed_cnt_f_next(18)
    );
  u_speed_cnt_s_17_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(17),
      O => u_speed_cnt_s_17_DXMUX_3695
    );
  u_speed_cnt_s_17_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(16),
      O => u_speed_cnt_s_17_DYMUX_3683
    );
  u_speed_cnt_s_17_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_s_17_SRINV_3675
    );
  u_speed_cnt_s_17_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y36",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_s_17_CLKINV_3674
    );
  u_speed_cnt_s_next_16_1 : X_LUT4
    generic map(
      INIT => X"1200",
      LOC => "SLICE_X38Y36"
    )
    port map (
      ADR0 => u_speed_slower_sync_1184,
      ADR1 => u_speed_cnt_s_next_cmp_eq0000,
      ADR2 => u_speed_deb_s_1176,
      ADR3 => u_speed_cnt_s_next_addsub0000(16),
      O => u_speed_cnt_s_next(16)
    );
  u_speed_cnt_s_19_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(19),
      O => u_speed_cnt_s_19_DXMUX_3733
    );
  u_speed_cnt_s_19_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_cnt_s_next(18),
      O => u_speed_cnt_s_19_DYMUX_3721
    );
  u_speed_cnt_s_19_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_cnt_s_19_SRINV_3713
    );
  u_speed_cnt_s_19_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y38",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_cnt_s_19_CLKINV_3712
    );
  u_speed_cnt_s_next_18_1 : X_LUT4
    generic map(
      INIT => X"1040",
      LOC => "SLICE_X38Y38"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_cmp_eq0000,
      ADR1 => u_speed_slower_sync_1184,
      ADR2 => u_speed_cnt_s_next_addsub0000(18),
      ADR3 => u_speed_deb_s_1176,
      O => u_speed_cnt_s_next(18)
    );
  u_knight_pattern_1_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X20Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_pattern_mux0001(1),
      O => u_knight_pattern_1_DXMUX_3774
    );
  u_knight_pattern_1_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X20Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_pattern_mux0001(0),
      O => u_knight_pattern_1_DYMUX_3760
    );
  u_knight_pattern_1_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X20Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_knight_pattern_1_SRINV_3750
    );
  u_knight_pattern_1_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X20Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_knight_pattern_1_CLKINV_3749
    );
  u_knight_pattern_1_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X20Y12",
      PATHPULSE => 638 ps
    )
    port map (
      I => step,
      O => u_knight_pattern_1_CEINV_3748
    );
  u_knight_pattern_mux0001_0_1 : X_LUT4
    generic map(
      INIT => X"CC00",
      LOC => "SLICE_X20Y12"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_knight_pattern(1),
      ADR2 => VCC,
      ADR3 => u_knight_dir(0),
      O => u_knight_pattern_mux0001(0)
    );
  u_knight_pattern_3_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X18Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_pattern_mux0001(3),
      O => u_knight_pattern_3_DXMUX_3816
    );
  u_knight_pattern_3_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X18Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_pattern_mux0001(2),
      O => u_knight_pattern_3_DYMUX_3802
    );
  u_knight_pattern_3_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X18Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_knight_pattern_3_SRINV_3793
    );
  u_knight_pattern_3_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X18Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_knight_pattern_3_CLKINV_3792
    );
  u_knight_pattern_3_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X18Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => step,
      O => u_knight_pattern_3_CEINV_3791
    );
  u_knight_pattern_mux0001_2_1 : X_LUT4
    generic map(
      INIT => X"DD88",
      LOC => "SLICE_X18Y14"
    )
    port map (
      ADR0 => u_knight_dir(0),
      ADR1 => u_knight_pattern(3),
      ADR2 => VCC,
      ADR3 => u_knight_pattern(1),
      O => u_knight_pattern_mux0001(2)
    );
  u_knight_pattern_5_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X19Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_pattern_mux0001(5),
      O => u_knight_pattern_5_DXMUX_3858
    );
  u_knight_pattern_5_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X19Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_pattern_mux0001(4),
      O => u_knight_pattern_5_DYMUX_3844
    );
  u_knight_pattern_5_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X19Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_knight_pattern_5_SRINV_3835
    );
  u_knight_pattern_5_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X19Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_knight_pattern_5_CLKINV_3834
    );
  u_knight_pattern_5_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X19Y14",
      PATHPULSE => 638 ps
    )
    port map (
      I => step,
      O => u_knight_pattern_5_CEINV_3833
    );
  u_knight_pattern_mux0001_4_1 : X_LUT4
    generic map(
      INIT => X"AAF0",
      LOC => "SLICE_X19Y14"
    )
    port map (
      ADR0 => u_knight_pattern(5),
      ADR1 => VCC,
      ADR2 => u_knight_pattern(3),
      ADR3 => u_knight_dir(0),
      O => u_knight_pattern_mux0001(4)
    );
  u_knight_pattern_7_DXMUX : X_BUF
    generic map(
      LOC => "SLICE_X18Y17",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_pattern_mux0001(7),
      O => u_knight_pattern_7_DXMUX_3900
    );
  u_knight_pattern_7_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X18Y17",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_pattern_mux0001(6),
      O => u_knight_pattern_7_DYMUX_3885
    );
  u_knight_pattern_7_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X18Y17",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_knight_pattern_7_SRINV_3876
    );
  u_knight_pattern_7_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X18Y17",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_knight_pattern_7_CLKINV_3875
    );
  u_knight_pattern_7_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X18Y17",
      PATHPULSE => 638 ps
    )
    port map (
      I => step,
      O => u_knight_pattern_7_CEINV_3874
    );
  u_knight_pattern_mux0001_6_1 : X_LUT4
    generic map(
      INIT => X"EE22",
      LOC => "SLICE_X18Y17"
    )
    port map (
      ADR0 => u_knight_pattern(5),
      ADR1 => u_knight_dir(0),
      ADR2 => VCC,
      ADR3 => u_knight_pattern(7),
      O => u_knight_pattern_mux0001(6)
    );
  u_speed_level_and00011 : X_LUT4
    generic map(
      INIT => X"00CC",
      LOC => "SLICE_X30Y28"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_N7,
      ADR2 => VCC,
      ADR3 => sw_0_IBUF_1145,
      O => u_speed_level_and0001
    );
  u_knight_dir_0_not0001_YUSED : X_BUF
    generic map(
      LOC => "SLICE_X19Y17",
      PATHPULSE => 638 ps
    )
    port map (
      I => step_pack_1,
      O => step
    );
  step1 : X_LUT4
    generic map(
      INIT => X"4444",
      LOC => "SLICE_X19Y17"
    )
    port map (
      ADR0 => sw_2_IBUF_1172,
      ADR1 => u_speed_step_reg_1186,
      ADR2 => VCC,
      ADR3 => VCC,
      O => step_pack_1
    );
  u_speed_faster_meta_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X38Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => btn_1_INBUF,
      O => u_speed_faster_meta_DYMUX_3961
    );
  u_speed_faster_meta_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_faster_meta_SRINV_3959
    );
  u_speed_faster_meta_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X38Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_faster_meta_CLKINV_3958
    );
  u_speed_faster_sync_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X36Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_faster_meta_1202,
      O => u_speed_faster_sync_DYMUX_3973
    );
  u_speed_faster_sync_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X36Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_faster_sync_SRINV_3971
    );
  u_speed_faster_sync_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X36Y53",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_faster_sync_CLKINV_3970
    );
  u_pre_cnt_0_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X30Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_pre_cnt_0_BYINV_3984,
      O => u_pre_cnt_0_DYMUX_3985
    );
  u_pre_cnt_0_BYINV : X_BUF
    generic map(
      LOC => "SLICE_X30Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => u_pre_cnt_0_BYINV_3984
    );
  u_pre_cnt_0_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X30Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_pre_cnt_0_or0000,
      O => u_pre_cnt_0_SRINV_3983
    );
  u_pre_cnt_0_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X30Y29",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_pre_cnt_0_CLKINV_3982
    );
  u_speed_slower_meta_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X48Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => btn_0_INBUF,
      O => u_speed_slower_meta_DYMUX_3997
    );
  u_speed_slower_meta_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_slower_meta_SRINV_3995
    );
  u_speed_slower_meta_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X48Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_slower_meta_CLKINV_3994
    );
  u_speed_deb_s_not00011 : X_LUT4
    generic map(
      INIT => X"30C0",
      LOC => "SLICE_X36Y32"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_slower_sync_1184,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_deb_s_1176,
      O => u_speed_deb_s_not0001
    );
  u_speed_level_0_DXMUX : X_INV
    generic map(
      LOC => "SLICE_X30Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_level(0),
      O => u_speed_level_0_DXMUX_4026
    );
  u_speed_level_0_REVUSED : X_BUF
    generic map(
      LOC => "SLICE_X30Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_Mcount_level_val_0,
      O => u_speed_level_0_REVUSED_4024
    );
  u_speed_level_0_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X30Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_level_and0000_0,
      O => u_speed_level_0_SRINV_4022
    );
  u_speed_level_0_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X30Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_level_0_CLKINV_4021
    );
  u_speed_level_0_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X30Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_level_or0000_0,
      O => u_speed_level_0_CEINV_4020
    );
  u_speed_slower_sync_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X39Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_slower_meta_1203,
      O => u_speed_slower_sync_DYMUX_4040
    );
  u_speed_slower_sync_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X39Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_slower_sync_SRINV_4038
    );
  u_speed_slower_sync_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X39Y41",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_slower_sync_CLKINV_4037
    );
  Mxor_led_Result_0_1 : X_LUT4
    generic map(
      INIT => X"47B8",
      LOC => "SLICE_X20Y13"
    )
    port map (
      ADR0 => u_knight_count(0),
      ADR1 => sw_1_IBUF_1171,
      ADR2 => u_knight_pattern(0),
      ADR3 => sw_3_IBUF_1173,
      O => led_0_OBUF_4059
    );
  u_pre_tick_or00001 : X_LUT4
    generic map(
      INIT => X"FF33",
      LOC => "SLICE_X28Y28"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_pre_cnt(0),
      ADR2 => VCC,
      ADR3 => sw_0_IBUF_1145,
      O => u_pre_tick_or0000
    );
  u_speed_deb_f_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X32Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_faster_sync_1188,
      O => u_speed_deb_f_DYMUX_4090
    );
  u_speed_deb_f_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_deb_f_SRINV_4088
    );
  u_speed_deb_f_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_deb_f_CLKINV_4087
    );
  u_speed_deb_f_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X32Y30",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_deb_f_not0001,
      O => u_speed_deb_f_CEINV_4086
    );
  Mxor_led_Result_2_1 : X_LUT4
    generic map(
      INIT => X"369C",
      LOC => "SLICE_X20Y15"
    )
    port map (
      ADR0 => sw_1_IBUF_1171,
      ADR1 => sw_3_IBUF_1173,
      ADR2 => u_knight_pattern(2),
      ADR3 => u_knight_count(2),
      O => led_2_OBUF_4110
    );
  Mxor_led_Result_4_1 : X_LUT4
    generic map(
      INIT => X"2D78",
      LOC => "SLICE_X19Y15"
    )
    port map (
      ADR0 => sw_1_IBUF_1171,
      ADR1 => u_knight_count(4),
      ADR2 => sw_3_IBUF_1173,
      ADR3 => u_knight_pattern(4),
      O => led_4_OBUF_4134
    );
  u_pre_tick_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X26Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_pre_tick_BYINV_4150,
      O => u_pre_tick_DYMUX_4151
    );
  u_pre_tick_BYINV : X_BUF
    generic map(
      LOC => "SLICE_X26Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => '1',
      O => u_pre_tick_BYINV_4150
    );
  u_pre_tick_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X26Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_pre_tick_or0000,
      O => u_pre_tick_SRINV_4149
    );
  u_pre_tick_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X26Y28",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_pre_tick_CLKINV_4148
    );
  u_knight_dir_0_DYMUX : X_INV
    generic map(
      LOC => "SLICE_X20Y16",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_dir(0),
      O => u_knight_dir_0_DYMUX_4165
    );
  u_knight_dir_0_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X20Y16",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_knight_dir_0_SRINV_4163
    );
  u_knight_dir_0_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X20Y16",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_knight_dir_0_CLKINV_4162
    );
  u_knight_dir_0_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X20Y16",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_knight_dir_0_not0001,
      O => u_knight_dir_0_CEINV_4161
    );
  u_speed_deb_s_DYMUX : X_BUF
    generic map(
      LOC => "SLICE_X37Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_slower_sync_1184,
      O => u_speed_deb_s_DYMUX_4180
    );
  u_speed_deb_s_SRINV : X_BUF
    generic map(
      LOC => "SLICE_X37Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => sw_0_IBUF_1145,
      O => u_speed_deb_s_SRINV_4178
    );
  u_speed_deb_s_CLKINV : X_BUF
    generic map(
      LOC => "SLICE_X37Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => clk_BUFGP,
      O => u_speed_deb_s_CLKINV_4177
    );
  u_speed_deb_s_CEINV : X_BUF
    generic map(
      LOC => "SLICE_X37Y32",
      PATHPULSE => 638 ps
    )
    port map (
      I => u_speed_deb_s_not0001,
      O => u_speed_deb_s_CEINV_4176
    );
  Mxor_led_Result_6_1 : X_LUT4
    generic map(
      INIT => X"56A6",
      LOC => "SLICE_X16Y16"
    )
    port map (
      ADR0 => sw_3_IBUF_1173,
      ADR1 => u_knight_pattern(6),
      ADR2 => sw_1_IBUF_1171,
      ADR3 => u_knight_count(6),
      O => led_6_OBUF_4200
    );
  u_speed_ticks_3 : X_SFF
    generic map(
      LOC => "SLICE_X27Y29",
      INIT => '0'
    )
    port map (
      I => u_speed_ticks_2_DYMUX_1292,
      CE => u_speed_ticks_2_CEINV_1269,
      CLK => u_speed_ticks_2_CLKINV_1270,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_ticks_2_SRINV_1271,
      O => u_speed_ticks(3)
    );
  u_speed_ticks_2 : X_SFF
    generic map(
      LOC => "SLICE_X27Y29",
      INIT => '0'
    )
    port map (
      I => u_speed_ticks_2_DXMUX_1310,
      CE => u_speed_ticks_2_CEINV_1269,
      CLK => u_speed_ticks_2_CLKINV_1270,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_ticks_2_SRINV_1271,
      O => u_speed_ticks(2)
    );
  u_speed_ticks_5 : X_SFF
    generic map(
      LOC => "SLICE_X27Y30",
      INIT => '0'
    )
    port map (
      I => u_speed_ticks_4_DYMUX_1348,
      CE => u_speed_ticks_4_CEINV_1325,
      CLK => u_speed_ticks_4_CLKINV_1326,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_ticks_4_SRINV_1327,
      O => u_speed_ticks(5)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_2_Q : X_LUT4
    generic map(
      INIT => X"CC93",
      LOC => "SLICE_X29Y29"
    )
    port map (
      ADR0 => u_speed_level(0),
      ADR1 => u_speed_ticks(2),
      ADR2 => u_speed_level(1),
      ADR3 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(2)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_4_Q : X_LUT4
    generic map(
      INIT => X"A955",
      LOC => "SLICE_X29Y30"
    )
    port map (
      ADR0 => u_speed_ticks(4),
      ADR1 => u_speed_level(0),
      ADR2 => u_speed_level(1),
      ADR3 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(4)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_6_Q : X_LUT4
    generic map(
      INIT => X"9555",
      LOC => "SLICE_X29Y31"
    )
    port map (
      ADR0 => u_speed_ticks(6),
      ADR1 => u_speed_level(0),
      ADR2 => u_speed_level(1),
      ADR3 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(6)
    );
  u_speed_Madd_cnt_f_next_addsub0000_lut_0_INV_0 : X_LUT4
    generic map(
      INIT => X"5555",
      LOC => "SLICE_X33Y33"
    )
    port map (
      ADR0 => u_speed_cnt_f(0),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_Madd_cnt_f_next_addsub0000_lut(0)
    );
  u_speed_ticks_4 : X_SFF
    generic map(
      LOC => "SLICE_X27Y30",
      INIT => '0'
    )
    port map (
      I => u_speed_ticks_4_DXMUX_1366,
      CE => u_speed_ticks_4_CEINV_1325,
      CLK => u_speed_ticks_4_CLKINV_1326,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_ticks_4_SRINV_1327,
      O => u_speed_ticks(4)
    );
  u_speed_ticks_7 : X_SFF
    generic map(
      LOC => "SLICE_X27Y31",
      INIT => '0'
    )
    port map (
      I => u_speed_ticks_6_DYMUX_1395,
      CE => u_speed_ticks_6_CEINV_1380,
      CLK => u_speed_ticks_6_CLKINV_1381,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_ticks_6_SRINV_1382,
      O => u_speed_ticks(7)
    );
  u_speed_ticks_6 : X_SFF
    generic map(
      LOC => "SLICE_X27Y31",
      INIT => '0'
    )
    port map (
      I => u_speed_ticks_6_DXMUX_1415,
      CE => u_speed_ticks_6_CEINV_1380,
      CLK => u_speed_ticks_6_CLKINV_1381,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_ticks_6_SRINV_1382,
      O => u_speed_ticks(6)
    );
  u_speed_Madd_cnt_s_next_addsub0000_lut_0_INV_0 : X_LUT4
    generic map(
      INIT => X"3333",
      LOC => "SLICE_X39Y29"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_cnt_s(0),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_Madd_cnt_s_next_addsub0000_lut(0)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_0_Q : X_LUT4
    generic map(
      INIT => X"0001",
      LOC => "SLICE_X35Y37"
    )
    port map (
      ADR0 => u_speed_cnt_f(5),
      ADR1 => u_speed_cnt_f(7),
      ADR2 => u_speed_cnt_f(4),
      ADR3 => u_speed_cnt_f(6),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(0)
    );
  u_speed_cnt_f_next_cmp_eq0000_wg_lut_2_Q : X_LUT4
    generic map(
      INIT => X"0004",
      LOC => "SLICE_X35Y38"
    )
    port map (
      ADR0 => u_speed_cnt_f(11),
      ADR1 => u_speed_cnt_f(1),
      ADR2 => u_speed_cnt_f(10),
      ADR3 => u_speed_cnt_f(13),
      O => u_speed_cnt_f_next_cmp_eq0000_wg_lut(2)
    );
  u_speed_Mcompar_step_next_cmp_ge0000_lut_0_Q : X_LUT4
    generic map(
      INIT => X"AAA9",
      LOC => "SLICE_X29Y28"
    )
    port map (
      ADR0 => u_speed_ticks(0),
      ADR1 => u_speed_level(0),
      ADR2 => u_speed_level(1),
      ADR3 => u_speed_level(2),
      O => u_speed_Mcompar_step_next_cmp_ge0000_lut(0)
    );
  u_knight_count_1 : X_SFF
    generic map(
      LOC => "SLICE_X21Y13",
      INIT => '0'
    )
    port map (
      I => u_knight_count_0_DYMUX_2387,
      CE => u_knight_count_0_CEINV_2369,
      CLK => u_knight_count_0_CLKINV_2370,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_count_0_SRINV_2371,
      O => u_knight_count(1)
    );
  u_knight_Mcount_count_lut_0_INV_0 : X_LUT4
    generic map(
      INIT => X"3333",
      LOC => "SLICE_X21Y13"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_knight_count(0),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_knight_Mcount_count_lut(0)
    );
  u_knight_count_0 : X_SFF
    generic map(
      LOC => "SLICE_X21Y13",
      INIT => '0'
    )
    port map (
      I => u_knight_count_0_DXMUX_2408,
      CE => u_knight_count_0_CEINV_2369,
      CLK => u_knight_count_0_CLKINV_2370,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_count_0_SRINV_2371,
      O => u_knight_count(0)
    );
  u_knight_count_3 : X_SFF
    generic map(
      LOC => "SLICE_X21Y14",
      INIT => '0'
    )
    port map (
      I => u_knight_count_2_DYMUX_2446,
      CE => u_knight_count_2_CEINV_2423,
      CLK => u_knight_count_2_CLKINV_2424,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_count_2_SRINV_2425,
      O => u_knight_count(3)
    );
  u_knight_count_2 : X_SFF
    generic map(
      LOC => "SLICE_X21Y14",
      INIT => '0'
    )
    port map (
      I => u_knight_count_2_DXMUX_2464,
      CE => u_knight_count_2_CEINV_2423,
      CLK => u_knight_count_2_CLKINV_2424,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_count_2_SRINV_2425,
      O => u_knight_count(2)
    );
  u_speed_cnt_s_next_9_1 : X_LUT4
    generic map(
      INIT => X"0208",
      LOC => "SLICE_X38Y33"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_addsub0000(9),
      ADR1 => u_speed_slower_sync_1184,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_deb_s_1176,
      O => u_speed_cnt_s_next(9)
    );
  u_speed_cnt_s_9 : X_SFF
    generic map(
      LOC => "SLICE_X38Y33",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_9_DXMUX_3017,
      CE => VCC,
      CLK => u_speed_cnt_s_9_CLKINV_2996,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_9_SRINV_2997,
      O => u_speed_cnt_s(9)
    );
  u_speed_state_reg_0 : X_SFF
    generic map(
      LOC => "SLICE_X31Y32",
      INIT => '0'
    )
    port map (
      I => u_speed_state_reg_0_DYMUX_3043,
      CE => VCC,
      CLK => u_speed_state_reg_0_CLKINV_3032,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_state_reg_0_SRINV_3033,
      O => u_speed_state_reg(0)
    );
  u_speed_level_or00001 : X_LUT4
    generic map(
      INIT => X"FF0E",
      LOC => "SLICE_X31Y32"
    )
    port map (
      ADR0 => u_speed_deb_s_1176,
      ADR1 => u_speed_deb_f_1177,
      ADR2 => u_speed_state_reg(0),
      ADR3 => sw_0_IBUF_1145,
      O => u_speed_level_or0000
    );
  u_speed_step_reg : X_SFF
    generic map(
      LOC => "SLICE_X26Y29",
      INIT => '0'
    )
    port map (
      I => u_speed_step_reg_DYMUX_3075,
      CE => VCC,
      CLK => u_speed_step_reg_CLKINV_3064,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_step_reg_SRINV_3065,
      O => u_speed_step_reg_1186
    );
  u_speed_ticks_or00001 : X_LUT4
    generic map(
      INIT => X"FF88",
      LOC => "SLICE_X26Y29"
    )
    port map (
      ADR0 => u_speed_Mcompar_step_next_cmp_ge0000_cy_7_Q,
      ADR1 => u_pre_tick_1021,
      ADR2 => VCC,
      ADR3 => sw_0_IBUF_1145,
      O => u_speed_ticks_or0000
    );
  u_speed_Result_1_1 : X_LUT4
    generic map(
      INIT => X"C33C",
      LOC => "SLICE_X30Y31"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_level(1),
      ADR2 => u_speed_level(0),
      ADR3 => u_speed_deb_f_1177,
      O => u_speed_Result(1)
    );
  u_speed_level_1 : X_SFF
    generic map(
      LOC => "SLICE_X30Y31",
      INIT => '0'
    )
    port map (
      I => u_speed_level_1_DYMUX_3112,
      CE => u_speed_level_1_CEINV_3100,
      CLK => u_speed_level_1_CLKINV_3101,
      SET => GND,
      RST => GND,
      SSET => u_speed_level_1_REVUSED_3113,
      SRST => u_speed_level_1_SRINV_3102,
      O => u_speed_level(1)
    );
  u_speed_Mcount_level_val211 : X_LUT4
    generic map(
      INIT => X"8800",
      LOC => "SLICE_X30Y31"
    )
    port map (
      ADR0 => u_speed_level(2),
      ADR1 => u_speed_level(1),
      ADR2 => VCC,
      ADR3 => u_speed_level(0),
      O => u_speed_N9
    );
  u_speed_Result_2_1 : X_LUT4
    generic map(
      INIT => X"DB24",
      LOC => "SLICE_X31Y31"
    )
    port map (
      ADR0 => u_speed_level(0),
      ADR1 => u_speed_deb_f_1177,
      ADR2 => u_speed_level(1),
      ADR3 => u_speed_level(2),
      O => u_speed_Result(2)
    );
  u_speed_cnt_s_next_1_1 : X_LUT4
    generic map(
      INIT => X"0208",
      LOC => "SLICE_X38Y28"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_addsub0000(1),
      ADR1 => u_speed_slower_sync_1184,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_deb_s_1176,
      O => u_speed_cnt_s_next(1)
    );
  u_speed_cnt_s_1 : X_SFF
    generic map(
      LOC => "SLICE_X38Y28",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_1_DXMUX_2865,
      CE => VCC,
      CLK => u_speed_cnt_s_1_CLKINV_2844,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_1_SRINV_2845,
      O => u_speed_cnt_s(1)
    );
  u_speed_cnt_s_2 : X_SFF
    generic map(
      LOC => "SLICE_X38Y30",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_3_DYMUX_2891,
      CE => VCC,
      CLK => u_speed_cnt_s_3_CLKINV_2882,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_3_SRINV_2883,
      O => u_speed_cnt_s(2)
    );
  u_speed_cnt_s_next_3_1 : X_LUT4
    generic map(
      INIT => X"0408",
      LOC => "SLICE_X38Y30"
    )
    port map (
      ADR0 => u_speed_slower_sync_1184,
      ADR1 => u_speed_cnt_s_next_addsub0000(3),
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_deb_s_1176,
      O => u_speed_cnt_s_next(3)
    );
  u_speed_cnt_s_3 : X_SFF
    generic map(
      LOC => "SLICE_X38Y30",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_3_DXMUX_2903,
      CE => VCC,
      CLK => u_speed_cnt_s_3_CLKINV_2882,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_3_SRINV_2883,
      O => u_speed_cnt_s(3)
    );
  u_speed_cnt_s_4 : X_SFF
    generic map(
      LOC => "SLICE_X38Y31",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_5_DYMUX_2929,
      CE => VCC,
      CLK => u_speed_cnt_s_5_CLKINV_2920,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_5_SRINV_2921,
      O => u_speed_cnt_s(4)
    );
  u_speed_cnt_s_next_5_1 : X_LUT4
    generic map(
      INIT => X"0208",
      LOC => "SLICE_X38Y31"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_addsub0000(5),
      ADR1 => u_speed_slower_sync_1184,
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_deb_s_1176,
      O => u_speed_cnt_s_next(5)
    );
  u_speed_cnt_s_5 : X_SFF
    generic map(
      LOC => "SLICE_X38Y31",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_5_DXMUX_2941,
      CE => VCC,
      CLK => u_speed_cnt_s_5_CLKINV_2920,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_5_SRINV_2921,
      O => u_speed_cnt_s(5)
    );
  u_speed_cnt_s_6 : X_SFF
    generic map(
      LOC => "SLICE_X38Y32",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_7_DYMUX_2967,
      CE => VCC,
      CLK => u_speed_cnt_s_7_CLKINV_2958,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_7_SRINV_2959,
      O => u_speed_cnt_s(6)
    );
  u_speed_cnt_s_next_7_1 : X_LUT4
    generic map(
      INIT => X"0408",
      LOC => "SLICE_X38Y32"
    )
    port map (
      ADR0 => u_speed_slower_sync_1184,
      ADR1 => u_speed_cnt_s_next_addsub0000(7),
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_deb_s_1176,
      O => u_speed_cnt_s_next(7)
    );
  u_speed_cnt_s_7 : X_SFF
    generic map(
      LOC => "SLICE_X38Y32",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_7_DXMUX_2979,
      CE => VCC,
      CLK => u_speed_cnt_s_7_CLKINV_2958,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_7_SRINV_2959,
      O => u_speed_cnt_s(7)
    );
  u_speed_cnt_s_8 : X_SFF
    generic map(
      LOC => "SLICE_X38Y33",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_9_DYMUX_3005,
      CE => VCC,
      CLK => u_speed_cnt_s_9_CLKINV_2996,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_9_SRINV_2997,
      O => u_speed_cnt_s(8)
    );
  u_knight_count_5 : X_SFF
    generic map(
      LOC => "SLICE_X21Y15",
      INIT => '0'
    )
    port map (
      I => u_knight_count_4_DYMUX_2502,
      CE => u_knight_count_4_CEINV_2479,
      CLK => u_knight_count_4_CLKINV_2480,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_count_4_SRINV_2481,
      O => u_knight_count(5)
    );
  u_knight_count_4 : X_SFF
    generic map(
      LOC => "SLICE_X21Y15",
      INIT => '0'
    )
    port map (
      I => u_knight_count_4_DXMUX_2520,
      CE => u_knight_count_4_CEINV_2479,
      CLK => u_knight_count_4_CLKINV_2480,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_count_4_SRINV_2481,
      O => u_knight_count(4)
    );
  u_knight_count_7 : X_SFF
    generic map(
      LOC => "SLICE_X21Y16",
      INIT => '0'
    )
    port map (
      I => u_knight_count_6_DYMUX_2549,
      CE => u_knight_count_6_CEINV_2534,
      CLK => u_knight_count_6_CLKINV_2535,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_count_6_SRINV_2536,
      O => u_knight_count(7)
    );
  u_knight_count_6 : X_SFF
    generic map(
      LOC => "SLICE_X21Y16",
      INIT => '0'
    )
    port map (
      I => u_knight_count_6_DXMUX_2569,
      CE => u_knight_count_6_CEINV_2534,
      CLK => u_knight_count_6_CLKINV_2535,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_count_6_SRINV_2536,
      O => u_knight_count(6)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_0_Q : X_LUT4
    generic map(
      INIT => X"0001",
      LOC => "SLICE_X37Y33"
    )
    port map (
      ADR0 => u_speed_cnt_s(5),
      ADR1 => u_speed_cnt_s(6),
      ADR2 => u_speed_cnt_s(4),
      ADR3 => u_speed_cnt_s(7),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(0)
    );
  u_speed_cnt_s_next_cmp_eq0000_wg_lut_2_Q : X_LUT4
    generic map(
      INIT => X"0002",
      LOC => "SLICE_X37Y34"
    )
    port map (
      ADR0 => u_speed_cnt_s(1),
      ADR1 => u_speed_cnt_s(10),
      ADR2 => u_speed_cnt_s(11),
      ADR3 => u_speed_cnt_s(13),
      O => u_speed_cnt_s_next_cmp_eq0000_wg_lut(2)
    );
  u_pre_cnt_0_or00001 : X_LUT4
    generic map(
      INIT => X"FFCC",
      LOC => "SLICE_X30Y28"
    )
    port map (
      ADR0 => VCC,
      ADR1 => sw_0_IBUF_1145,
      ADR2 => VCC,
      ADR3 => u_pre_cnt(0),
      O => u_pre_cnt_0_or0000
    );
  u_knight_dir_0_not00011 : X_LUT4
    generic map(
      INIT => X"D800",
      LOC => "SLICE_X19Y17"
    )
    port map (
      ADR0 => u_knight_dir(0),
      ADR1 => u_knight_pattern(1),
      ADR2 => u_knight_pattern(6),
      ADR3 => step,
      O => u_knight_dir_0_not0001
    );
  u_speed_faster_meta : X_SFF
    generic map(
      LOC => "SLICE_X38Y53",
      INIT => '0'
    )
    port map (
      I => u_speed_faster_meta_DYMUX_3961,
      CE => VCC,
      CLK => u_speed_faster_meta_CLKINV_3958,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_faster_meta_SRINV_3959,
      O => u_speed_faster_meta_1202
    );
  u_speed_faster_sync : X_SFF
    generic map(
      LOC => "SLICE_X36Y53",
      INIT => '0'
    )
    port map (
      I => u_speed_faster_sync_DYMUX_3973,
      CE => VCC,
      CLK => u_speed_faster_sync_CLKINV_3970,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_faster_sync_SRINV_3971,
      O => u_speed_faster_sync_1188
    );
  u_pre_cnt_0 : X_SFF
    generic map(
      LOC => "SLICE_X30Y29",
      INIT => '0'
    )
    port map (
      I => u_pre_cnt_0_DYMUX_3985,
      CE => VCC,
      CLK => u_pre_cnt_0_CLKINV_3982,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_pre_cnt_0_SRINV_3983,
      O => u_pre_cnt(0)
    );
  u_speed_slower_meta : X_SFF
    generic map(
      LOC => "SLICE_X48Y41",
      INIT => '0'
    )
    port map (
      I => u_speed_slower_meta_DYMUX_3997,
      CE => VCC,
      CLK => u_speed_slower_meta_CLKINV_3994,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_slower_meta_SRINV_3995,
      O => u_speed_slower_meta_1203
    );
  u_speed_Mcount_level_val3 : X_LUT4
    generic map(
      INIT => X"FCFC",
      LOC => "SLICE_X31Y30"
    )
    port map (
      ADR0 => VCC,
      ADR1 => sw_0_IBUF_1145,
      ADR2 => u_speed_N7,
      ADR3 => VCC,
      O => u_speed_Mcount_level_val
    );
  u_speed_level_and0000 : X_LUT4
    generic map(
      INIT => X"0001",
      LOC => "SLICE_X30Y32"
    )
    port map (
      ADR0 => u_speed_level(0),
      ADR1 => u_speed_level(2),
      ADR2 => u_speed_level(1),
      ADR3 => u_speed_level_and0000_SW0_O,
      O => u_speed_level_and0000_2805
    );
  u_speed_Mcount_level_val1 : X_LUT4
    generic map(
      INIT => X"FF10",
      LOC => "SLICE_X30Y33"
    )
    port map (
      ADR0 => u_speed_level(1),
      ADR1 => u_speed_level(2),
      ADR2 => u_speed_Mcount_level_val1_SW0_O,
      ADR3 => sw_0_IBUF_1145,
      O => u_speed_Mcount_level_val1_2829
    );
  u_speed_cnt_s_0 : X_SFF
    generic map(
      LOC => "SLICE_X38Y28",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_1_DYMUX_2853,
      CE => VCC,
      CLK => u_speed_cnt_s_1_CLKINV_2844,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_1_SRINV_2845,
      O => u_speed_cnt_s(0)
    );
  u_speed_level_2 : X_SFF
    generic map(
      LOC => "SLICE_X31Y31",
      INIT => '1'
    )
    port map (
      I => u_speed_level_2_DYMUX_3152,
      CE => u_speed_level_2_CEINV_3141,
      CLK => u_speed_level_2_CLKINV_3142,
      SET => GND,
      RST => GND,
      SSET => u_speed_level_2_REVUSED_3153,
      SRST => u_speed_level_2_SRINV_3143,
      O => u_speed_level(2)
    );
  u_speed_deb_f_not00011 : X_LUT4
    generic map(
      INIT => X"6600",
      LOC => "SLICE_X31Y31"
    )
    port map (
      ADR0 => u_speed_deb_f_1177,
      ADR1 => u_speed_faster_sync_1188,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_f_next_cmp_eq0000,
      O => u_speed_deb_f_not0001
    );
  u_speed_cnt_f_0 : X_SFF
    generic map(
      LOC => "SLICE_X32Y32",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_1_DYMUX_3189,
      CE => VCC,
      CLK => u_speed_cnt_f_1_CLKINV_3180,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_1_SRINV_3181,
      O => u_speed_cnt_f(0)
    );
  u_speed_cnt_f_next_1_1 : X_LUT4
    generic map(
      INIT => X"0208",
      LOC => "SLICE_X32Y32"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_addsub0000(1),
      ADR1 => u_speed_faster_sync_1188,
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_deb_f_1177,
      O => u_speed_cnt_f_next(1)
    );
  u_speed_cnt_f_1 : X_SFF
    generic map(
      LOC => "SLICE_X32Y32",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_1_DXMUX_3201,
      CE => VCC,
      CLK => u_speed_cnt_f_1_CLKINV_3180,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_1_SRINV_3181,
      O => u_speed_cnt_f(1)
    );
  u_speed_cnt_f_2 : X_SFF
    generic map(
      LOC => "SLICE_X32Y35",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_3_DYMUX_3227,
      CE => VCC,
      CLK => u_speed_cnt_f_3_CLKINV_3218,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_3_SRINV_3219,
      O => u_speed_cnt_f(2)
    );
  u_speed_cnt_f_next_3_1 : X_LUT4
    generic map(
      INIT => X"0440",
      LOC => "SLICE_X32Y35"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_cmp_eq0000,
      ADR1 => u_speed_cnt_f_next_addsub0000(3),
      ADR2 => u_speed_faster_sync_1188,
      ADR3 => u_speed_deb_f_1177,
      O => u_speed_cnt_f_next(3)
    );
  u_speed_cnt_f_3 : X_SFF
    generic map(
      LOC => "SLICE_X32Y35",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_3_DXMUX_3239,
      CE => VCC,
      CLK => u_speed_cnt_f_3_CLKINV_3218,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_3_SRINV_3219,
      O => u_speed_cnt_f(3)
    );
  u_speed_cnt_f_4 : X_SFF
    generic map(
      LOC => "SLICE_X32Y34",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_5_DYMUX_3265,
      CE => VCC,
      CLK => u_speed_cnt_f_5_CLKINV_3256,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_5_SRINV_3257,
      O => u_speed_cnt_f(4)
    );
  u_speed_cnt_f_next_5_1 : X_LUT4
    generic map(
      INIT => X"0220",
      LOC => "SLICE_X32Y34"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_addsub0000(5),
      ADR1 => u_speed_cnt_f_next_cmp_eq0000,
      ADR2 => u_speed_faster_sync_1188,
      ADR3 => u_speed_deb_f_1177,
      O => u_speed_cnt_f_next(5)
    );
  u_speed_cnt_f_5 : X_SFF
    generic map(
      LOC => "SLICE_X32Y34",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_5_DXMUX_3277,
      CE => VCC,
      CLK => u_speed_cnt_f_5_CLKINV_3256,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_5_SRINV_3257,
      O => u_speed_cnt_f(5)
    );
  u_speed_cnt_s_14 : X_SFF
    generic map(
      LOC => "SLICE_X38Y37",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_15_DYMUX_3607,
      CE => VCC,
      CLK => u_speed_cnt_s_15_CLKINV_3598,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_15_SRINV_3599,
      O => u_speed_cnt_s(14)
    );
  u_speed_cnt_s_next_15_1 : X_LUT4
    generic map(
      INIT => X"0440",
      LOC => "SLICE_X38Y37"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_cmp_eq0000,
      ADR1 => u_speed_cnt_s_next_addsub0000(15),
      ADR2 => u_speed_deb_s_1176,
      ADR3 => u_speed_slower_sync_1184,
      O => u_speed_cnt_s_next(15)
    );
  u_speed_cnt_s_15 : X_SFF
    generic map(
      LOC => "SLICE_X38Y37",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_15_DXMUX_3619,
      CE => VCC,
      CLK => u_speed_cnt_s_15_CLKINV_3598,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_15_SRINV_3599,
      O => u_speed_cnt_s(15)
    );
  u_speed_cnt_f_18 : X_SFF
    generic map(
      LOC => "SLICE_X32Y42",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_19_DYMUX_3645,
      CE => VCC,
      CLK => u_speed_cnt_f_19_CLKINV_3636,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_19_SRINV_3637,
      O => u_speed_cnt_f(18)
    );
  u_speed_cnt_f_next_19_1 : X_LUT4
    generic map(
      INIT => X"0408",
      LOC => "SLICE_X32Y42"
    )
    port map (
      ADR0 => u_speed_deb_f_1177,
      ADR1 => u_speed_cnt_f_next_addsub0000(19),
      ADR2 => u_speed_cnt_f_next_cmp_eq0000,
      ADR3 => u_speed_faster_sync_1188,
      O => u_speed_cnt_f_next(19)
    );
  u_speed_cnt_f_19 : X_SFF
    generic map(
      LOC => "SLICE_X32Y42",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_19_DXMUX_3657,
      CE => VCC,
      CLK => u_speed_cnt_f_19_CLKINV_3636,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_19_SRINV_3637,
      O => u_speed_cnt_f(19)
    );
  u_speed_cnt_s_16 : X_SFF
    generic map(
      LOC => "SLICE_X38Y36",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_17_DYMUX_3683,
      CE => VCC,
      CLK => u_speed_cnt_s_17_CLKINV_3674,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_17_SRINV_3675,
      O => u_speed_cnt_s(16)
    );
  u_speed_cnt_s_next_17_1 : X_LUT4
    generic map(
      INIT => X"0220",
      LOC => "SLICE_X38Y36"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_addsub0000(17),
      ADR1 => u_speed_cnt_s_next_cmp_eq0000,
      ADR2 => u_speed_deb_s_1176,
      ADR3 => u_speed_slower_sync_1184,
      O => u_speed_cnt_s_next(17)
    );
  u_speed_cnt_s_17 : X_SFF
    generic map(
      LOC => "SLICE_X38Y36",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_17_DXMUX_3695,
      CE => VCC,
      CLK => u_speed_cnt_s_17_CLKINV_3674,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_17_SRINV_3675,
      O => u_speed_cnt_s(17)
    );
  u_speed_cnt_s_18 : X_SFF
    generic map(
      LOC => "SLICE_X38Y38",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_19_DYMUX_3721,
      CE => VCC,
      CLK => u_speed_cnt_s_19_CLKINV_3712,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_19_SRINV_3713,
      O => u_speed_cnt_s(18)
    );
  u_speed_cnt_s_next_19_1 : X_LUT4
    generic map(
      INIT => X"0408",
      LOC => "SLICE_X38Y38"
    )
    port map (
      ADR0 => u_speed_slower_sync_1184,
      ADR1 => u_speed_cnt_s_next_addsub0000(19),
      ADR2 => u_speed_cnt_s_next_cmp_eq0000,
      ADR3 => u_speed_deb_s_1176,
      O => u_speed_cnt_s_next(19)
    );
  u_speed_cnt_s_19 : X_SFF
    generic map(
      LOC => "SLICE_X38Y38",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_19_DXMUX_3733,
      CE => VCC,
      CLK => u_speed_cnt_s_19_CLKINV_3712,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_19_SRINV_3713,
      O => u_speed_cnt_s(19)
    );
  u_speed_cnt_f_10 : X_SFF
    generic map(
      LOC => "SLICE_X32Y38",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_11_DYMUX_3303,
      CE => VCC,
      CLK => u_speed_cnt_f_11_CLKINV_3294,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_11_SRINV_3295,
      O => u_speed_cnt_f(10)
    );
  u_speed_cnt_f_next_11_1 : X_LUT4
    generic map(
      INIT => X"0048",
      LOC => "SLICE_X32Y38"
    )
    port map (
      ADR0 => u_speed_deb_f_1177,
      ADR1 => u_speed_cnt_f_next_addsub0000(11),
      ADR2 => u_speed_faster_sync_1188,
      ADR3 => u_speed_cnt_f_next_cmp_eq0000,
      O => u_speed_cnt_f_next(11)
    );
  u_speed_cnt_f_11 : X_SFF
    generic map(
      LOC => "SLICE_X32Y38",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_11_DXMUX_3315,
      CE => VCC,
      CLK => u_speed_cnt_f_11_CLKINV_3294,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_11_SRINV_3295,
      O => u_speed_cnt_f(11)
    );
  u_speed_cnt_f_6 : X_SFF
    generic map(
      LOC => "SLICE_X32Y37",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_7_DYMUX_3341,
      CE => VCC,
      CLK => u_speed_cnt_f_7_CLKINV_3332,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_7_SRINV_3333,
      O => u_speed_cnt_f(6)
    );
  u_speed_cnt_f_next_7_1 : X_LUT4
    generic map(
      INIT => X"0440",
      LOC => "SLICE_X32Y37"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_cmp_eq0000,
      ADR1 => u_speed_cnt_f_next_addsub0000(7),
      ADR2 => u_speed_faster_sync_1188,
      ADR3 => u_speed_deb_f_1177,
      O => u_speed_cnt_f_next(7)
    );
  u_speed_cnt_f_7 : X_SFF
    generic map(
      LOC => "SLICE_X32Y37",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_7_DXMUX_3353,
      CE => VCC,
      CLK => u_speed_cnt_f_7_CLKINV_3332,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_7_SRINV_3333,
      O => u_speed_cnt_f(7)
    );
  u_speed_cnt_f_12 : X_SFF
    generic map(
      LOC => "SLICE_X32Y39",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_13_DYMUX_3379,
      CE => VCC,
      CLK => u_speed_cnt_f_13_CLKINV_3370,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_13_SRINV_3371,
      O => u_speed_cnt_f(12)
    );
  u_speed_cnt_f_next_13_1 : X_LUT4
    generic map(
      INIT => X"0028",
      LOC => "SLICE_X32Y39"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_addsub0000(13),
      ADR1 => u_speed_deb_f_1177,
      ADR2 => u_speed_faster_sync_1188,
      ADR3 => u_speed_cnt_f_next_cmp_eq0000,
      O => u_speed_cnt_f_next(13)
    );
  u_speed_cnt_f_13 : X_SFF
    generic map(
      LOC => "SLICE_X32Y39",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_13_DXMUX_3391,
      CE => VCC,
      CLK => u_speed_cnt_f_13_CLKINV_3370,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_13_SRINV_3371,
      O => u_speed_cnt_f(13)
    );
  u_speed_cnt_f_8 : X_SFF
    generic map(
      LOC => "SLICE_X34Y36",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_9_DYMUX_3417,
      CE => VCC,
      CLK => u_speed_cnt_f_9_CLKINV_3408,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_9_SRINV_3409,
      O => u_speed_cnt_f(8)
    );
  u_speed_cnt_f_next_9_1 : X_LUT4
    generic map(
      INIT => X"0440",
      LOC => "SLICE_X34Y36"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_cmp_eq0000,
      ADR1 => u_speed_cnt_f_next_addsub0000(9),
      ADR2 => u_speed_faster_sync_1188,
      ADR3 => u_speed_deb_f_1177,
      O => u_speed_cnt_f_next(9)
    );
  u_speed_cnt_f_9 : X_SFF
    generic map(
      LOC => "SLICE_X34Y36",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_9_DXMUX_3429,
      CE => VCC,
      CLK => u_speed_cnt_f_9_CLKINV_3408,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_9_SRINV_3409,
      O => u_speed_cnt_f(9)
    );
  u_speed_cnt_s_10 : X_SFF
    generic map(
      LOC => "SLICE_X38Y35",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_11_DYMUX_3455,
      CE => VCC,
      CLK => u_speed_cnt_s_11_CLKINV_3446,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_11_SRINV_3447,
      O => u_speed_cnt_s(10)
    );
  u_speed_cnt_s_next_11_1 : X_LUT4
    generic map(
      INIT => X"0048",
      LOC => "SLICE_X38Y35"
    )
    port map (
      ADR0 => u_speed_slower_sync_1184,
      ADR1 => u_speed_cnt_s_next_addsub0000(11),
      ADR2 => u_speed_deb_s_1176,
      ADR3 => u_speed_cnt_s_next_cmp_eq0000,
      O => u_speed_cnt_s_next(11)
    );
  u_speed_cnt_s_11 : X_SFF
    generic map(
      LOC => "SLICE_X38Y35",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_11_DXMUX_3467,
      CE => VCC,
      CLK => u_speed_cnt_s_11_CLKINV_3446,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_11_SRINV_3447,
      O => u_speed_cnt_s(11)
    );
  u_speed_cnt_f_14 : X_SFF
    generic map(
      LOC => "SLICE_X32Y41",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_15_DYMUX_3493,
      CE => VCC,
      CLK => u_speed_cnt_f_15_CLKINV_3484,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_15_SRINV_3485,
      O => u_speed_cnt_f(14)
    );
  u_speed_cnt_f_next_15_1 : X_LUT4
    generic map(
      INIT => X"0048",
      LOC => "SLICE_X32Y41"
    )
    port map (
      ADR0 => u_speed_deb_f_1177,
      ADR1 => u_speed_cnt_f_next_addsub0000(15),
      ADR2 => u_speed_faster_sync_1188,
      ADR3 => u_speed_cnt_f_next_cmp_eq0000,
      O => u_speed_cnt_f_next(15)
    );
  u_speed_cnt_f_15 : X_SFF
    generic map(
      LOC => "SLICE_X32Y41",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_15_DXMUX_3505,
      CE => VCC,
      CLK => u_speed_cnt_f_15_CLKINV_3484,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_15_SRINV_3485,
      O => u_speed_cnt_f(15)
    );
  u_speed_cnt_s_12 : X_SFF
    generic map(
      LOC => "SLICE_X38Y34",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_13_DYMUX_3531,
      CE => VCC,
      CLK => u_speed_cnt_s_13_CLKINV_3522,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_13_SRINV_3523,
      O => u_speed_cnt_s(12)
    );
  u_speed_cnt_s_next_13_1 : X_LUT4
    generic map(
      INIT => X"0028",
      LOC => "SLICE_X38Y34"
    )
    port map (
      ADR0 => u_speed_cnt_s_next_addsub0000(13),
      ADR1 => u_speed_slower_sync_1184,
      ADR2 => u_speed_deb_s_1176,
      ADR3 => u_speed_cnt_s_next_cmp_eq0000,
      O => u_speed_cnt_s_next(13)
    );
  u_speed_cnt_s_13 : X_SFF
    generic map(
      LOC => "SLICE_X38Y34",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_s_13_DXMUX_3543,
      CE => VCC,
      CLK => u_speed_cnt_s_13_CLKINV_3522,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_s_13_SRINV_3523,
      O => u_speed_cnt_s(13)
    );
  u_speed_cnt_f_16 : X_SFF
    generic map(
      LOC => "SLICE_X32Y40",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_17_DYMUX_3569,
      CE => VCC,
      CLK => u_speed_cnt_f_17_CLKINV_3560,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_17_SRINV_3561,
      O => u_speed_cnt_f(16)
    );
  u_speed_cnt_f_next_17_1 : X_LUT4
    generic map(
      INIT => X"0028",
      LOC => "SLICE_X32Y40"
    )
    port map (
      ADR0 => u_speed_cnt_f_next_addsub0000(17),
      ADR1 => u_speed_deb_f_1177,
      ADR2 => u_speed_faster_sync_1188,
      ADR3 => u_speed_cnt_f_next_cmp_eq0000,
      O => u_speed_cnt_f_next(17)
    );
  u_speed_cnt_f_17 : X_SFF
    generic map(
      LOC => "SLICE_X32Y40",
      INIT => '0'
    )
    port map (
      I => u_speed_cnt_f_17_DXMUX_3581,
      CE => VCC,
      CLK => u_speed_cnt_f_17_CLKINV_3560,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_cnt_f_17_SRINV_3561,
      O => u_speed_cnt_f(17)
    );
  u_knight_pattern_0 : X_SFF
    generic map(
      LOC => "SLICE_X20Y12",
      INIT => '1'
    )
    port map (
      I => u_knight_pattern_1_DYMUX_3760,
      CE => u_knight_pattern_1_CEINV_3748,
      CLK => u_knight_pattern_1_CLKINV_3749,
      SET => GND,
      RST => GND,
      SSET => u_knight_pattern_1_SRINV_3750,
      SRST => GND,
      O => u_knight_pattern(0)
    );
  u_knight_pattern_mux0001_1_1 : X_LUT4
    generic map(
      INIT => X"F3C0",
      LOC => "SLICE_X20Y12"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_knight_dir(0),
      ADR2 => u_knight_pattern(2),
      ADR3 => u_knight_pattern(0),
      O => u_knight_pattern_mux0001(1)
    );
  u_knight_pattern_1 : X_SFF
    generic map(
      LOC => "SLICE_X20Y12",
      INIT => '0'
    )
    port map (
      I => u_knight_pattern_1_DXMUX_3774,
      CE => u_knight_pattern_1_CEINV_3748,
      CLK => u_knight_pattern_1_CLKINV_3749,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_pattern_1_SRINV_3750,
      O => u_knight_pattern(1)
    );
  u_knight_pattern_2 : X_SFF
    generic map(
      LOC => "SLICE_X18Y14",
      INIT => '0'
    )
    port map (
      I => u_knight_pattern_3_DYMUX_3802,
      CE => u_knight_pattern_3_CEINV_3791,
      CLK => u_knight_pattern_3_CLKINV_3792,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_pattern_3_SRINV_3793,
      O => u_knight_pattern(2)
    );
  u_knight_pattern_mux0001_3_1 : X_LUT4
    generic map(
      INIT => X"B8B8",
      LOC => "SLICE_X18Y14"
    )
    port map (
      ADR0 => u_knight_pattern(4),
      ADR1 => u_knight_dir(0),
      ADR2 => u_knight_pattern(2),
      ADR3 => VCC,
      O => u_knight_pattern_mux0001(3)
    );
  u_knight_pattern_3 : X_SFF
    generic map(
      LOC => "SLICE_X18Y14",
      INIT => '0'
    )
    port map (
      I => u_knight_pattern_3_DXMUX_3816,
      CE => u_knight_pattern_3_CEINV_3791,
      CLK => u_knight_pattern_3_CLKINV_3792,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_pattern_3_SRINV_3793,
      O => u_knight_pattern(3)
    );
  u_knight_pattern_4 : X_SFF
    generic map(
      LOC => "SLICE_X19Y14",
      INIT => '0'
    )
    port map (
      I => u_knight_pattern_5_DYMUX_3844,
      CE => u_knight_pattern_5_CEINV_3833,
      CLK => u_knight_pattern_5_CLKINV_3834,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_pattern_5_SRINV_3835,
      O => u_knight_pattern(4)
    );
  u_knight_pattern_mux0001_5_1 : X_LUT4
    generic map(
      INIT => X"F3C0",
      LOC => "SLICE_X19Y14"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_knight_dir(0),
      ADR2 => u_knight_pattern(6),
      ADR3 => u_knight_pattern(4),
      O => u_knight_pattern_mux0001(5)
    );
  u_knight_pattern_5 : X_SFF
    generic map(
      LOC => "SLICE_X19Y14",
      INIT => '0'
    )
    port map (
      I => u_knight_pattern_5_DXMUX_3858,
      CE => u_knight_pattern_5_CEINV_3833,
      CLK => u_knight_pattern_5_CLKINV_3834,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_pattern_5_SRINV_3835,
      O => u_knight_pattern(5)
    );
  u_knight_pattern_6 : X_SFF
    generic map(
      LOC => "SLICE_X18Y17",
      INIT => '0'
    )
    port map (
      I => u_knight_pattern_7_DYMUX_3885,
      CE => u_knight_pattern_7_CEINV_3874,
      CLK => u_knight_pattern_7_CLKINV_3875,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_pattern_7_SRINV_3876,
      O => u_knight_pattern(6)
    );
  u_knight_pattern_mux0001_7_1 : X_LUT4
    generic map(
      INIT => X"00CC",
      LOC => "SLICE_X18Y17"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_knight_pattern(6),
      ADR2 => VCC,
      ADR3 => u_knight_dir(0),
      O => u_knight_pattern_mux0001(7)
    );
  u_knight_pattern_7 : X_SFF
    generic map(
      LOC => "SLICE_X18Y17",
      INIT => '0'
    )
    port map (
      I => u_knight_pattern_7_DXMUX_3900,
      CE => u_knight_pattern_7_CEINV_3874,
      CLK => u_knight_pattern_7_CLKINV_3875,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_pattern_7_SRINV_3876,
      O => u_knight_pattern(7)
    );
  u_knight_dir_0 : X_SFF
    generic map(
      LOC => "SLICE_X20Y16",
      INIT => '0'
    )
    port map (
      I => u_knight_dir_0_DYMUX_4165,
      CE => u_knight_dir_0_CEINV_4161,
      CLK => u_knight_dir_0_CLKINV_4162,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_knight_dir_0_SRINV_4163,
      O => u_knight_dir(0)
    );
  u_speed_deb_s : X_SFF
    generic map(
      LOC => "SLICE_X37Y32",
      INIT => '0'
    )
    port map (
      I => u_speed_deb_s_DYMUX_4180,
      CE => u_speed_deb_s_CEINV_4176,
      CLK => u_speed_deb_s_CLKINV_4177,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_deb_s_SRINV_4178,
      O => u_speed_deb_s_1176
    );
  Mxor_led_Result_7_1 : X_LUT4
    generic map(
      INIT => X"656A",
      LOC => "SLICE_X16Y16"
    )
    port map (
      ADR0 => sw_3_IBUF_1173,
      ADR1 => u_knight_count(7),
      ADR2 => sw_1_IBUF_1171,
      ADR3 => u_knight_pattern(7),
      O => led_7_OBUF_4207
    );
  u_speed_level_0 : X_SFF
    generic map(
      LOC => "SLICE_X30Y30",
      INIT => '1'
    )
    port map (
      I => u_speed_level_0_DXMUX_4026,
      CE => u_speed_level_0_CEINV_4020,
      CLK => u_speed_level_0_CLKINV_4021,
      SET => GND,
      RST => GND,
      SSET => u_speed_level_0_REVUSED_4024,
      SRST => u_speed_level_0_SRINV_4022,
      O => u_speed_level(0)
    );
  u_speed_slower_sync : X_SFF
    generic map(
      LOC => "SLICE_X39Y41",
      INIT => '0'
    )
    port map (
      I => u_speed_slower_sync_DYMUX_4040,
      CE => VCC,
      CLK => u_speed_slower_sync_CLKINV_4037,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_slower_sync_SRINV_4038,
      O => u_speed_slower_sync_1184
    );
  Mxor_led_Result_1_1 : X_LUT4
    generic map(
      INIT => X"53AC",
      LOC => "SLICE_X20Y13"
    )
    port map (
      ADR0 => u_knight_count(1),
      ADR1 => u_knight_pattern(1),
      ADR2 => sw_1_IBUF_1171,
      ADR3 => sw_3_IBUF_1173,
      O => led_1_OBUF_4066
    );
  u_speed_deb_f : X_SFF
    generic map(
      LOC => "SLICE_X32Y30",
      INIT => '0'
    )
    port map (
      I => u_speed_deb_f_DYMUX_4090,
      CE => u_speed_deb_f_CEINV_4086,
      CLK => u_speed_deb_f_CLKINV_4087,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_speed_deb_f_SRINV_4088,
      O => u_speed_deb_f_1177
    );
  Mxor_led_Result_3_1 : X_LUT4
    generic map(
      INIT => X"53AC",
      LOC => "SLICE_X20Y15"
    )
    port map (
      ADR0 => u_knight_count(3),
      ADR1 => u_knight_pattern(3),
      ADR2 => sw_1_IBUF_1171,
      ADR3 => sw_3_IBUF_1173,
      O => led_3_OBUF_4117
    );
  Mxor_led_Result_5_1 : X_LUT4
    generic map(
      INIT => X"1DE2",
      LOC => "SLICE_X19Y15"
    )
    port map (
      ADR0 => u_knight_pattern(5),
      ADR1 => sw_1_IBUF_1171,
      ADR2 => u_knight_count(5),
      ADR3 => sw_3_IBUF_1173,
      O => led_5_OBUF_4141
    );
  u_pre_tick : X_SFF
    generic map(
      LOC => "SLICE_X26Y28",
      INIT => '0'
    )
    port map (
      I => u_pre_tick_DYMUX_4151,
      CE => VCC,
      CLK => u_pre_tick_CLKINV_4148,
      SET => GND,
      RST => GND,
      SSET => GND,
      SRST => u_pre_tick_SRINV_4149,
      O => u_pre_tick_1021
    );
  u_speed_ticks_0_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X27Y28"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_ticks(1),
      O => u_speed_ticks_0_G
    );
  u_speed_ticks_2_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X27Y29"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_ticks(2),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_ticks_2_F
    );
  u_speed_ticks_2_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X27Y29"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => u_speed_ticks(3),
      ADR3 => VCC,
      O => u_speed_ticks_2_G
    );
  u_speed_ticks_4_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X27Y30"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => u_speed_ticks(4),
      ADR3 => VCC,
      O => u_speed_ticks_4_F
    );
  u_speed_ticks_4_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X27Y30"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_ticks(5),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_ticks_4_G
    );
  u_speed_ticks_6_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X27Y31"
    )
    port map (
      ADR0 => u_speed_ticks(6),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_ticks_6_F
    );
  u_speed_cnt_s_next_addsub0000_0_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X39Y29"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_s(1),
      O => u_speed_cnt_s_next_addsub0000_0_G
    );
  u_speed_cnt_s_next_addsub0000_2_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X39Y30"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => u_speed_cnt_s(2),
      ADR3 => VCC,
      O => u_speed_cnt_s_next_addsub0000_2_F
    );
  u_speed_cnt_s_next_addsub0000_2_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X39Y30"
    )
    port map (
      ADR0 => u_speed_cnt_s(3),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_s_next_addsub0000_2_G
    );
  u_speed_cnt_s_next_addsub0000_4_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X39Y31"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_cnt_s(4),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_s_next_addsub0000_4_F
    );
  u_speed_cnt_s_next_addsub0000_4_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X39Y31"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_s(5),
      O => u_speed_cnt_s_next_addsub0000_4_G
    );
  u_speed_cnt_s_next_addsub0000_6_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X39Y32"
    )
    port map (
      ADR0 => u_speed_cnt_s(6),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_s_next_addsub0000_6_F
    );
  u_speed_cnt_s_next_addsub0000_6_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X39Y32"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => u_speed_cnt_s(7),
      ADR3 => VCC,
      O => u_speed_cnt_s_next_addsub0000_6_G
    );
  u_speed_cnt_s_next_addsub0000_8_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X39Y33"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_s(8),
      O => u_speed_cnt_s_next_addsub0000_8_F
    );
  u_speed_cnt_s_next_addsub0000_8_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X39Y33"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => u_speed_cnt_s(9),
      ADR3 => VCC,
      O => u_speed_cnt_s_next_addsub0000_8_G
    );
  u_speed_cnt_s_next_addsub0000_10_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X39Y34"
    )
    port map (
      ADR0 => u_speed_cnt_s(10),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_s_next_addsub0000_10_F
    );
  u_speed_cnt_s_next_addsub0000_10_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X39Y34"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => u_speed_cnt_s(11),
      ADR3 => VCC,
      O => u_speed_cnt_s_next_addsub0000_10_G
    );
  u_speed_cnt_s_next_addsub0000_12_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X39Y35"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_s(12),
      O => u_speed_cnt_s_next_addsub0000_12_F
    );
  u_speed_cnt_s_next_addsub0000_12_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X39Y35"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_cnt_s(13),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_s_next_addsub0000_12_G
    );
  u_speed_cnt_s_next_addsub0000_14_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X39Y36"
    )
    port map (
      ADR0 => u_speed_cnt_s(14),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_s_next_addsub0000_14_F
    );
  u_speed_cnt_s_next_addsub0000_14_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X39Y36"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_s(15),
      O => u_speed_cnt_s_next_addsub0000_14_G
    );
  u_speed_cnt_s_next_addsub0000_16_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X39Y37"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_cnt_s(16),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_s_next_addsub0000_16_F
    );
  u_speed_cnt_s_next_addsub0000_16_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X39Y37"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => u_speed_cnt_s(17),
      ADR3 => VCC,
      O => u_speed_cnt_s_next_addsub0000_16_G
    );
  u_speed_cnt_s_next_addsub0000_18_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X39Y38"
    )
    port map (
      ADR0 => u_speed_cnt_s(18),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_s_next_addsub0000_18_F
    );
  u_speed_cnt_f_next_addsub0000_0_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X33Y33"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_f(1),
      O => u_speed_cnt_f_next_addsub0000_0_G
    );
  u_speed_cnt_f_next_addsub0000_2_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X33Y34"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_cnt_f(2),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_f_next_addsub0000_2_F
    );
  u_speed_cnt_f_next_addsub0000_2_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X33Y34"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => u_speed_cnt_f(3),
      ADR3 => VCC,
      O => u_speed_cnt_f_next_addsub0000_2_G
    );
  u_speed_cnt_f_next_addsub0000_4_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X33Y35"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_f(4),
      O => u_speed_cnt_f_next_addsub0000_4_F
    );
  u_speed_cnt_f_next_addsub0000_4_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X33Y35"
    )
    port map (
      ADR0 => u_speed_cnt_f(5),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_f_next_addsub0000_4_G
    );
  u_speed_cnt_f_next_addsub0000_6_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X33Y36"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_f(6),
      O => u_speed_cnt_f_next_addsub0000_6_F
    );
  u_speed_cnt_f_next_addsub0000_6_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X33Y36"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_cnt_f(7),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_f_next_addsub0000_6_G
    );
  u_speed_cnt_f_next_addsub0000_8_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X33Y37"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_f(8),
      O => u_speed_cnt_f_next_addsub0000_8_F
    );
  u_speed_cnt_f_next_addsub0000_8_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X33Y37"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_cnt_f(9),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_f_next_addsub0000_8_G
    );
  u_speed_cnt_f_next_addsub0000_10_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X33Y38"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => u_speed_cnt_f(10),
      ADR3 => VCC,
      O => u_speed_cnt_f_next_addsub0000_10_F
    );
  u_speed_cnt_f_next_addsub0000_10_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X33Y38"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_cnt_f(11),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_f_next_addsub0000_10_G
    );
  u_speed_cnt_f_next_addsub0000_12_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X33Y39"
    )
    port map (
      ADR0 => u_speed_cnt_f(12),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_f_next_addsub0000_12_F
    );
  u_speed_cnt_f_next_addsub0000_12_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X33Y39"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_f(13),
      O => u_speed_cnt_f_next_addsub0000_12_G
    );
  u_speed_cnt_f_next_addsub0000_14_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X33Y40"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_f(14),
      O => u_speed_cnt_f_next_addsub0000_14_F
    );
  u_speed_cnt_f_next_addsub0000_14_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X33Y40"
    )
    port map (
      ADR0 => u_speed_cnt_f(15),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_f_next_addsub0000_14_G
    );
  u_speed_cnt_f_next_addsub0000_16_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X33Y41"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_speed_cnt_f(16),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_speed_cnt_f_next_addsub0000_16_F
    );
  u_speed_cnt_f_next_addsub0000_16_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X33Y41"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => u_speed_cnt_f(17),
      ADR3 => VCC,
      O => u_speed_cnt_f_next_addsub0000_16_G
    );
  u_speed_cnt_f_next_addsub0000_18_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X33Y42"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_speed_cnt_f(18),
      O => u_speed_cnt_f_next_addsub0000_18_F
    );
  u_knight_count_0_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X21Y13"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_knight_count(1),
      O => u_knight_count_0_G
    );
  u_knight_count_2_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X21Y14"
    )
    port map (
      ADR0 => u_knight_count(2),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_knight_count_2_F
    );
  u_knight_count_2_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"FF00",
      LOC => "SLICE_X21Y14"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => u_knight_count(3),
      O => u_knight_count_2_G
    );
  u_knight_count_4_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"CCCC",
      LOC => "SLICE_X21Y15"
    )
    port map (
      ADR0 => VCC,
      ADR1 => u_knight_count(4),
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_knight_count_4_F
    );
  u_knight_count_4_G_X_LUT4 : X_LUT4
    generic map(
      INIT => X"F0F0",
      LOC => "SLICE_X21Y15"
    )
    port map (
      ADR0 => VCC,
      ADR1 => VCC,
      ADR2 => u_knight_count(5),
      ADR3 => VCC,
      O => u_knight_count_4_G
    );
  u_knight_count_6_F_X_LUT4 : X_LUT4
    generic map(
      INIT => X"AAAA",
      LOC => "SLICE_X21Y16"
    )
    port map (
      ADR0 => u_knight_count(6),
      ADR1 => VCC,
      ADR2 => VCC,
      ADR3 => VCC,
      O => u_knight_count_6_F
    );
  led_0_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD110",
      PATHPULSE => 638 ps
    )
    port map (
      I => led_0_OBUF_4059,
      O => led_0_O
    );
  led_1_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD90",
      PATHPULSE => 638 ps
    )
    port map (
      I => led_1_OBUF_4066,
      O => led_1_O
    );
  led_2_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD105",
      PATHPULSE => 638 ps
    )
    port map (
      I => led_2_OBUF_4110,
      O => led_2_O
    );
  led_3_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD106",
      PATHPULSE => 638 ps
    )
    port map (
      I => led_3_OBUF_4117,
      O => led_3_O
    );
  led_4_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD109",
      PATHPULSE => 638 ps
    )
    port map (
      I => led_4_OBUF_4134,
      O => led_4_O
    );
  led_5_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD112",
      PATHPULSE => 638 ps
    )
    port map (
      I => led_5_OBUF_4141,
      O => led_5_O
    );
  led_6_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD111",
      PATHPULSE => 638 ps
    )
    port map (
      I => led_6_OBUF_4200,
      O => led_6_O
    );
  led_7_OUTPUT_OFF_OMUX : X_BUF
    generic map(
      LOC => "PAD153",
      PATHPULSE => 638 ps
    )
    port map (
      I => led_7_OBUF_4207,
      O => led_7_O
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

