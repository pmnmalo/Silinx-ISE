// Xilinx device + development board database (every family ISE 14.7 WebPACK can implement).
//
// Sources:
//  * Spartan-3E parts/packages/resources: Xilinx DS312 "Spartan-3E FPGA Family Data Sheet" v4.2,
//    Table 1 (resources) and Table 2 (available user I/Os per package).
//  * Other families: see the "Families" section below (UG631 WebPACK table + family data sheets).
//  * Spartan-3E Starter Kit: Xilinx UG230 board UCF (as distributed with the kit).
//  * Basys2: Digilent "Basys2_100_250General.ucf" (rev C board).
//  * Nexys2: Digilent "Nexys2_500General.ucf" / "Nexys2_1200General.ucf" (LD4..LD7 differ by die).
//  * Boards added later name their source file / URL in `source` / `sourceUrl`.
//
// Board resources list pins LSB first (pins[0] is bit 0). A resource with `verified:false`
// was not cross-checked against an official file and must be checked by the user;
// `iostandardVerified:false` flags an IOSTANDARD chosen by Silinx where the bank voltage is
// jumper-selectable or not stated by the source.
//
// `DEVICES` (the original Spartan-3E-only view) is kept unchanged for compatibility; the
// multi-family data is in FAMILIES / PARTS, with findPart / validateDevice covering all parts.

import { familyOfPart } from '../packages/silinx-fpga/src/parts.js';
import { FAMILY } from './family.js';
import { BOARDS } from './boards.js';
import { ICE40_FAMILY, ICE40_DEVICES, ICE40_PACKAGES } from './devices-ice40.js';
export { FAMILY } from './family.js';
export { BOARDS } from './boards.js';

/**
 * Parts. userIo = maximum user I/O (I/O + input-only) per package, from DS312 Table 2.
 * speeds: speed grades available. (XC3S500E in VQ(G)100 is -4 only.)
 */
export const DEVICES = {
  family: FAMILY,
  familyName: 'Spartan-3E',
  parts: [
    {
      part: 'xc3s100e', systemGates: 100_000, logicCells: 2160, clbs: 240, slices: 960,
      luts: 1920, ffs: 1920, distRamBits: 15 * 1024, brams: 4, bramBits: 72 * 1024,
      multipliers: 4, dcms: 2, maxUserIo: 108,
      packages: { vq100: { userIo: 66, inputOnly: 7 }, cp132: { userIo: 83, inputOnly: 11 }, tq144: { userIo: 108, inputOnly: 28 } },
      speeds: ['-4', '-5'],
    },
    {
      part: 'xc3s250e', systemGates: 250_000, logicCells: 5508, clbs: 612, slices: 2448,
      luts: 4896, ffs: 4896, distRamBits: 38 * 1024, brams: 12, bramBits: 216 * 1024,
      multipliers: 12, dcms: 4, maxUserIo: 172,
      packages: {
        vq100: { userIo: 66, inputOnly: 7 }, cp132: { userIo: 92, inputOnly: 7 }, tq144: { userIo: 108, inputOnly: 28 },
        pq208: { userIo: 158, inputOnly: 32 }, ft256: { userIo: 172, inputOnly: 40 },
      },
      speeds: ['-4', '-5'],
    },
    {
      part: 'xc3s500e', systemGates: 500_000, logicCells: 10476, clbs: 1164, slices: 4656,
      luts: 9312, ffs: 9312, distRamBits: 73 * 1024, brams: 20, bramBits: 360 * 1024,
      multipliers: 20, dcms: 4, maxUserIo: 232,
      packages: {
        vq100: { userIo: 66, inputOnly: 7, speeds: ['-4'], note: 'Pb-free VQG100 only' },
        cp132: { userIo: 92, inputOnly: 7 }, pq208: { userIo: 158, inputOnly: 32 },
        ft256: { userIo: 190, inputOnly: 41 }, fg320: { userIo: 232, inputOnly: 56 },
      },
      speeds: ['-4', '-5'],
    },
    {
      part: 'xc3s1200e', systemGates: 1_200_000, logicCells: 19512, clbs: 2168, slices: 8672,
      luts: 17344, ffs: 17344, distRamBits: 136 * 1024, brams: 28, bramBits: 504 * 1024,
      multipliers: 28, dcms: 8, maxUserIo: 304,
      packages: { ft256: { userIo: 190, inputOnly: 40 }, fg320: { userIo: 250, inputOnly: 56 }, fg400: { userIo: 304, inputOnly: 72 } },
      speeds: ['-4', '-5'],
    },
    {
      part: 'xc3s1600e', systemGates: 1_600_000, logicCells: 33192, clbs: 3688, slices: 14752,
      luts: 29504, ffs: 29504, distRamBits: 231 * 1024, brams: 36, bramBits: 648 * 1024,
      multipliers: 36, dcms: 8, maxUserIo: 376,
      packages: { fg320: { userIo: 250, inputOnly: 56 }, fg400: { userIo: 304, inputOnly: 72 }, fg484: { userIo: 376, inputOnly: 82 } },
      speeds: ['-4', '-5'],
    },
  ],
  packages: {
    vq100: '100-pin Very Thin Quad Flat Pack (VQFP)',
    cp132: '132-ball Chip-Scale Package (CSP)',
    tq144: '144-pin Thin Quad Flat Pack (TQFP)',
    pq208: '208-pin Plastic Quad Flat Pack (PQFP)',
    ft256: '256-ball Fine-Pitch Thin BGA (FTBGA)',
    fg320: '320-ball Fine-Pitch BGA (FBGA)',
    fg400: '400-ball Fine-Pitch BGA (FBGA)',
    fg484: '484-ball Fine-Pitch BGA (FBGA)',
  },
  speeds: { '-4': 'Standard performance', '-5': 'High performance' },
  iostandards: ['LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12', 'LVTTL', 'PCI33_3',
    'SSTL2_I', 'SSTL18_I', 'HSTL_I_18', 'HSTL_III_18', 'LVDS_25', 'RSDS_25', 'MINI_LVDS_25', 'LVPECL_25',
    'BLVDS_25', 'DIFF_SSTL2_I', 'DIFF_SSTL18_I', 'DIFF_HSTL_I_18', 'DIFF_HSTL_III_18'],
  driveStrengths: { LVCMOS33: [2, 4, 6, 8, 12, 16], LVTTL: [2, 4, 6, 8, 12, 16], LVCMOS25: [2, 4, 6, 8, 12], LVCMOS18: [2, 4, 6, 8], LVCMOS15: [2, 4, 6], LVCMOS12: [2] },
};

// Every Spartan-3E part above belongs to the spartan3e family.
for (const p of DEVICES.parts) p.family = FAMILY;

// ---------------------------------------------------------------------------------------------
// Families (only the parts ISE 14.7 WebPACK can implement)
// ---------------------------------------------------------------------------------------------
//
// WebPACK scope: UG631 (v14.7) "ISE Design Suite 14: Release Notes, Installation, and Licensing",
// Table 2-1 "Architecture Support", ISE WebPACK Tool column:
//   Zynq-7000: XC7Z010, XC7Z020, XC7Z030           Virtex-4: LX15, LX25, SX25, FX12
//   Virtex-5: LX30, LX50, LX20T-LX50T, FX30T (SXT: none)   Virtex-6: LX75T   Virtex-7: none
//   Kintex-7: XC7K70T, XC7K160T                     Artix-7: XC7A100T, XC7A200T
//   Spartan-3: XC3S50 - XC3S1500(L)                 Spartan-3A/-3AN/-3E: all
//   Spartan-3A DSP: XC3SD1800A                      Spartan-6: XC6SLX4 - XC6SLX75T
//
// Resource / package / speed-grade sources (Xilinx data sheets, fetched from docs.amd.com):
//   DS099 v3.1 (Spartan-3) Tables 1, 3, 4      DS529 v2.1 (Spartan-3A) Tables 1-3
//   DS557 (Spartan-3AN) Tables 2, 4, 5         DS610 v3.0 (Spartan-3A DSP) Tables 1, 2, 15
//   DS160 v2.0 (Spartan-6) Tables 1-3 + DS162 Table 26 (speed grades per device)
//   DS112 v3.1 (Virtex-4) Tables 1, 2 + DS302 Table 14       DS100 v5.1 (Virtex-5) Tables 1, 2 + DS202 Table 54
//   DS150 v2.5 (Virtex-6) Tables 1, 2, 4      DS180 v2.6.1 (7 series) Tables 4-7, 12    DS190 (Zynq-7000) Tables 1-3, 7
// I/O standard lists: the family DC & switching data sheets (DS099, DS312, DS529, DS610, DS162, DS302,
// DS202, DS152, DS181, DS182, DS187).
//
// Package keys are the package names used in ISE part strings (xc6slx9-2csg324). userIo = maximum
// user I/O (incl. input-only pins) in that package; inputOnly where the data sheet lists it; gts =
// multi-gigabit transceivers bonded out. `verified:false` marks values that could not be checked
// against a primary source.

const K = 1024;
const SPARTAN3_GEN_BITGEN = 'Full Spartan-3 generation option set (ConfigRate, *Pin pull-ups, DCMShutdown, ...)';
const MODERN_BITGEN = 'Spartan-6 / Virtex-4/5/6 / 7-series bitgen rejects several Spartan-3-only options; use the conservative set (CRC, UnusedPin, StartUpClk, DONE/GTS/GWE cycles, Security).';

export const FAMILIES = [
  {
    id: 'spartan3', name: 'Spartan3', displayName: 'Spartan-3', xiseFamily: 'Spartan3', xiseVerified: false,
    datasheet: 'DS099', webpack: true, webpackParts: 'XC3S50 - XC3S1500(L)', bitgen: SPARTAN3_GEN_BITGEN,
    speeds: { '-4': 'Standard performance', '-5': 'High performance (commercial only)' },
    ioStandards: ['LVTTL', 'LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12', 'PCI33_3',
      'GTL', 'GTLP', 'GTL_DCI', 'GTLP_DCI', 'HSTL_I', 'HSTL_III', 'HSTL_I_18', 'HSTL_II_18', 'HSTL_III_18',
      'HSTL_I_DCI', 'HSTL_III_DCI', 'HSTL_I_DCI_18', 'HSTL_II_DCI_18', 'HSTL_III_DCI_18',
      'SSTL18_I', 'SSTL18_II', 'SSTL2_I', 'SSTL2_II', 'SSTL18_I_DCI', 'SSTL2_I_DCI', 'SSTL2_II_DCI',
      'LVDCI_33', 'LVDCI_25', 'LVDCI_18', 'LVDCI_15', 'LVDCI_DV2_33', 'LVDCI_DV2_25', 'LVDCI_DV2_18', 'LVDCI_DV2_15',
      'LVDS_25', 'LVDS_25_DCI', 'LVDSEXT_25', 'LVDSEXT_25_DCI', 'BLVDS_25', 'LDT_25', 'ULVDS_25', 'RSDS_25', 'LVPECL_25',
      'DIFF_HSTL_II_18', 'DIFF_HSTL_II_18_DCI', 'DIFF_SSTL2_II', 'DIFF_SSTL2_II_DCI'],
  },
  {
    id: 'spartan3e', name: 'Spartan3E', displayName: 'Spartan-3E', xiseFamily: 'Spartan3E', xiseVerified: true,
    datasheet: 'DS312', webpack: true, webpackParts: 'all', bitgen: SPARTAN3_GEN_BITGEN,
    speeds: DEVICES.speeds, ioStandards: DEVICES.iostandards,
  },
  {
    id: 'spartan3a', name: 'Spartan3A and Spartan3AN', displayName: 'Spartan-3A / 3AN', xiseFamily: 'Spartan3A and Spartan3AN', xiseVerified: true,
    datasheet: 'DS529 / DS557', webpack: true, webpackParts: 'all', bitgen: SPARTAN3_GEN_BITGEN,
    speeds: { '-4': 'Standard performance', '-5': 'High performance (commercial only)' },
    ioStandards: ['LVTTL', 'LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12', 'PCI33_3', 'PCI66_3',
      'HSTL_I', 'HSTL_III', 'HSTL_I_18', 'HSTL_II_18', 'HSTL_III_18', 'SSTL18_I', 'SSTL18_II', 'SSTL2_I', 'SSTL2_II', 'SSTL3_I', 'SSTL3_II',
      'LVDS_25', 'LVDS_33', 'BLVDS_25', 'LVPECL_25', 'LVPECL_33', 'MINI_LVDS_25', 'MINI_LVDS_33', 'PPDS_25', 'PPDS_33',
      'RSDS_25', 'RSDS_33', 'TMDS_33', 'DIFF_HSTL_I', 'DIFF_HSTL_III', 'DIFF_HSTL_I_18', 'DIFF_HSTL_II_18', 'DIFF_HSTL_III_18',
      'DIFF_SSTL18_I', 'DIFF_SSTL18_II', 'DIFF_SSTL2_I', 'DIFF_SSTL2_II', 'DIFF_SSTL3_I', 'DIFF_SSTL3_II'],
  },
  {
    id: 'spartan3adsp', name: 'Spartan3A DSP', displayName: 'Spartan-3A DSP', xiseFamily: 'Spartan3A DSP', xiseVerified: false,
    datasheet: 'DS610', webpack: true, webpackParts: 'XC3SD1800A only (XC3SD3400A needs a full ISE edition)', bitgen: SPARTAN3_GEN_BITGEN,
    speeds: { '-4': 'Standard performance', '-5': 'High performance (commercial only)' },
    ioStandards: null, // same SelectIO as Spartan-3A (filled below)
  },
  {
    id: 'spartan6', name: 'Spartan6', displayName: 'Spartan-6', xiseFamily: 'Spartan6', xiseVerified: true,
    datasheet: 'DS160 / DS162', webpack: true, webpackParts: 'XC6SLX4 - XC6SLX75T (LX100/LX150/LX100T/LX150T need a full ISE edition)', bitgen: MODERN_BITGEN,
    speeds: { '-1L': 'Low power (LX only, 1.0V core)', '-2': 'Standard', '-3': 'High performance', '-3N': 'High performance, no memory controller (MCB) support' },
    ioStandards: ['LVTTL', 'LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12', 'LVCMOS18_JEDEC', 'LVCMOS15_JEDEC', 'LVCMOS12_JEDEC',
      'PCI33_3', 'PCI66_3', 'I2C', 'SMBUS', 'SDIO', 'MOBILE_DDR',
      'HSTL_I', 'HSTL_II', 'HSTL_III', 'HSTL_I_18', 'HSTL_II_18', 'HSTL_III_18',
      'SSTL3_I', 'SSTL3_II', 'SSTL2_I', 'SSTL2_II', 'SSTL18_I', 'SSTL18_II', 'SSTL15_II',
      'LVDS_25', 'LVDS_33', 'BLVDS_25', 'LVPECL_25', 'LVPECL_33', 'MINI_LVDS_25', 'MINI_LVDS_33', 'PPDS_25', 'PPDS_33',
      'RSDS_25', 'RSDS_33', 'TMDS_33', 'DISPLAY_PORT', 'DIFF_MOBILE_DDR',
      'DIFF_HSTL_I', 'DIFF_HSTL_II', 'DIFF_HSTL_III', 'DIFF_HSTL_I_18', 'DIFF_HSTL_II_18', 'DIFF_HSTL_III_18',
      'DIFF_SSTL3_I', 'DIFF_SSTL3_II', 'DIFF_SSTL2_I', 'DIFF_SSTL2_II', 'DIFF_SSTL18_I', 'DIFF_SSTL18_II', 'DIFF_SSTL15_II'],
  },
  {
    id: 'virtex4', name: 'Virtex4', displayName: 'Virtex-4', xiseFamily: 'Virtex4', xiseVerified: false,
    datasheet: 'DS112 / DS302', webpack: true, webpackParts: 'XC4VLX15, XC4VLX25, XC4VSX25, XC4VFX12', bitgen: MODERN_BITGEN,
    speeds: { '-10': 'Standard', '-11': 'Mid', '-12': 'High performance (commercial only)' },
    ioStandards: ['LVTTL', 'LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12', 'PCI33_3', 'PCI66_3', 'PCIX',
      'GTL', 'GTLP', 'GTL_DCI', 'GTLP_DCI', 'HSTL_I', 'HSTL_II', 'HSTL_III', 'HSTL_IV', 'HSTL_I_18', 'HSTL_II_18', 'HSTL_III_18', 'HSTL_IV_18',
      'HSTL_I_DCI', 'HSTL_II_DCI', 'HSTL_III_DCI', 'HSTL_IV_DCI', 'HSTL_I_DCI_18', 'HSTL_II_DCI_18', 'HSTL_III_DCI_18', 'HSTL_IV_DCI_18',
      'SSTL2_I', 'SSTL2_II', 'SSTL18_I', 'SSTL18_II', 'SSTL2_I_DCI', 'SSTL2_II_DCI', 'SSTL18_I_DCI', 'SSTL18_II_DCI',
      'LVDCI_33', 'LVDCI_25', 'LVDCI_18', 'LVDCI_15', 'LVDCI_DV2_25', 'LVDCI_DV2_18', 'LVDCI_DV2_15',
      'HSLVDCI_33', 'HSLVDCI_25', 'HSLVDCI_18', 'HSLVDCI_15',
      'LVDS_25', 'LVDSEXT_25', 'LDT_25', 'ULVDS_25', 'BLVDS_25', 'LVPECL_25', 'RSDS_25'],
  },
  {
    id: 'virtex5', name: 'Virtex5', displayName: 'Virtex-5', xiseFamily: 'Virtex5', xiseVerified: false,
    datasheet: 'DS100 / DS202', webpack: true, webpackParts: 'XC5VLX30, XC5VLX50, XC5VLX20T, XC5VLX30T, XC5VLX50T, XC5VFX30T', bitgen: MODERN_BITGEN,
    speeds: { '-1': 'Standard', '-2': 'Mid', '-3': 'High performance (not on every device)' },
    ioStandards: ['LVTTL', 'LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12', 'PCI33_3', 'PCI66_3', 'PCIX',
      'GTL', 'GTLP', 'GTL_DCI', 'GTLP_DCI', 'HSTL_I', 'HSTL_II', 'HSTL_III', 'HSTL_IV', 'HSTL_I_12', 'HSTL_I_18', 'HSTL_II_18', 'HSTL_III_18', 'HSTL_IV_18',
      'HSTL_I_DCI', 'HSTL_II_DCI', 'HSTL_II_T_DCI', 'HSTL_III_DCI', 'HSTL_IV_DCI', 'HSTL_I_DCI_18', 'HSTL_II_DCI_18', 'HSTL_II_T_DCI_18', 'HSTL_III_DCI_18', 'HSTL_IV_DCI_18',
      'SSTL2_I', 'SSTL2_II', 'SSTL18_I', 'SSTL18_II', 'SSTL2_I_DCI', 'SSTL2_II_DCI', 'SSTL2_II_T_DCI', 'SSTL18_I_DCI', 'SSTL18_II_DCI', 'SSTL18_II_T_DCI',
      'LVDCI_33', 'LVDCI_25', 'LVDCI_18', 'LVDCI_15', 'LVDCI_DV2_25', 'LVDCI_DV2_18', 'LVDCI_DV2_15',
      'HSLVDCI_33', 'HSLVDCI_25', 'HSLVDCI_18', 'HSLVDCI_15',
      'LVDS_25', 'LVDSEXT_25', 'LDT_25', 'ULVDS_25', 'BLVDS_25', 'LVPECL_25', 'RSDS_25',
      'DIFF_HSTL_I', 'DIFF_HSTL_II', 'DIFF_HSTL_I_18', 'DIFF_HSTL_II_18', 'DIFF_HSTL_I_DCI', 'DIFF_HSTL_II_DCI', 'DIFF_HSTL_I_DCI_18', 'DIFF_HSTL_II_DCI_18',
      'DIFF_SSTL2_I', 'DIFF_SSTL2_II', 'DIFF_SSTL18_I', 'DIFF_SSTL18_II', 'DIFF_SSTL2_I_DCI', 'DIFF_SSTL2_II_DCI', 'DIFF_SSTL18_I_DCI', 'DIFF_SSTL18_II_DCI'],
  },
  {
    id: 'virtex6', name: 'Virtex6', displayName: 'Virtex-6', xiseFamily: 'Virtex6', xiseVerified: false,
    datasheet: 'DS150 / DS152', webpack: true, webpackParts: 'XC6VLX75T', bitgen: MODERN_BITGEN,
    speeds: { '-1': 'Standard', '-2': 'Mid', '-3': 'High performance', '-1L': 'Low power (0.9V core)' },
    note: 'Virtex-6 I/O banks support at most 2.5V (no LVCMOS33/LVTTL).',
    ioStandards: ['LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12',
      'HSTL_I', 'HSTL_II', 'HSTL_III', 'HSTL_I_12', 'HSTL_I_18', 'HSTL_II_18', 'HSTL_III_18',
      'HSTL_I_DCI', 'HSTL_II_DCI', 'HSTL_II_T_DCI', 'HSTL_III_DCI', 'HSTL_I_DCI_18', 'HSTL_II_DCI_18', 'HSTL_III_DCI_18',
      'SSTL2_I', 'SSTL2_II', 'SSTL18_I', 'SSTL18_II', 'SSTL15', 'SSTL2_I_DCI', 'SSTL2_II_DCI', 'SSTL2_II_T_DCI',
      'SSTL18_I_DCI', 'SSTL18_II_DCI', 'SSTL18_II_T_DCI', 'SSTL15_DCI', 'SSTL15_T_DCI',
      'LVDCI_25', 'LVDCI_18', 'LVDCI_15', 'LVDCI_DV2_25', 'LVDCI_DV2_18', 'LVDCI_DV2_15', 'HSLVDCI_25', 'HSLVDCI_18', 'HSLVDCI_15',
      'LVDS_25', 'LVDSEXT_25', 'LDT_25', 'BLVDS_25', 'LVPECL_25', 'RSDS_25',
      'DIFF_HSTL_I', 'DIFF_HSTL_II', 'DIFF_HSTL_I_18', 'DIFF_HSTL_II_18', 'DIFF_HSTL_I_DCI', 'DIFF_HSTL_II_DCI', 'DIFF_HSTL_I_DCI_18', 'DIFF_HSTL_II_DCI_18',
      'DIFF_SSTL2_I', 'DIFF_SSTL2_II', 'DIFF_SSTL18_I', 'DIFF_SSTL18_II', 'DIFF_SSTL15',
      'DIFF_SSTL2_I_DCI', 'DIFF_SSTL2_II_DCI', 'DIFF_SSTL2_II_T_DCI', 'DIFF_SSTL18_I_DCI', 'DIFF_SSTL18_II_DCI', 'DIFF_SSTL18_II_T_DCI', 'DIFF_SSTL15_DCI', 'DIFF_SSTL15_T_DCI'],
  },
  {
    id: 'artix7', name: 'Artix7', displayName: 'Artix-7', xiseFamily: 'Artix7', xiseVerified: false,
    datasheet: 'DS180 / DS181', webpack: true, webpackParts: 'XC7A100T, XC7A200T (smaller Artix-7 parts are Vivado-only)', bitgen: MODERN_BITGEN,
    speeds: { '-1': 'Standard', '-2': 'Mid', '-3': 'High performance' },
    note: 'Artix-7 has only High-Range (1.2V-3.3V) I/O banks. Low-power grades (-2L/-1L) exist but are not listed here (not verified in ISE 14.7).',
    ioStandards: ['LVTTL', 'LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12', 'PCI33_3', 'MOBILE_DDR', 'HSUL_12',
      'HSTL_I', 'HSTL_II', 'HSTL_I_12', 'HSTL_I_18', 'HSTL_II_18', 'SSTL18_I', 'SSTL18_II', 'SSTL15', 'SSTL135', 'SSTL12',
      'LVDS_25', 'BLVDS_25', 'MINI_LVDS_25', 'PPDS_25', 'RSDS_25', 'TMDS_33',
      'DIFF_HSTL_I', 'DIFF_HSTL_II', 'DIFF_HSTL_I_12', 'DIFF_HSTL_I_18', 'DIFF_HSTL_II_18', 'DIFF_HSUL_12', 'DIFF_MOBILE_DDR',
      'DIFF_SSTL18_I', 'DIFF_SSTL18_II', 'DIFF_SSTL15', 'DIFF_SSTL135', 'DIFF_SSTL12'],
  },
  {
    id: 'kintex7', name: 'Kintex7', displayName: 'Kintex-7', xiseFamily: 'Kintex7', xiseVerified: false,
    datasheet: 'DS180 / DS182', webpack: true, webpackParts: 'XC7K70T, XC7K160T', bitgen: MODERN_BITGEN,
    speeds: { '-1': 'Standard', '-2': 'Mid', '-3': 'High performance' },
    note: 'Kintex-7 mixes High-Range (up to 3.3V) and High-Performance (up to 1.8V, DCI) banks; HP-only standards are valid only in HP banks.',
    ioStandards: ['LVTTL', 'LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12', 'PCI33_3', 'MOBILE_DDR', 'HSUL_12',
      'HSTL_I', 'HSTL_II', 'HSTL_I_12', 'HSTL_I_18', 'HSTL_II_18', 'HSTL_I_DCI', 'HSTL_II_DCI', 'HSTL_II_T_DCI',
      'SSTL18_I', 'SSTL18_II', 'SSTL15', 'SSTL135', 'SSTL12', 'SSTL18_I_DCI', 'SSTL18_II_DCI', 'SSTL15_DCI', 'SSTL15_T_DCI',
      'SSTL135_DCI', 'SSTL12_DCI', 'SSTL12_T_DCI', 'LVDCI_18', 'LVDCI_15', 'LVDCI_DV2_18', 'LVDCI_DV2_15', 'HSLVDCI_18', 'HSLVDCI_15',
      'LVDS', 'LVDS_25', 'BLVDS_25', 'MINI_LVDS_25', 'PPDS_25', 'RSDS_25', 'TMDS_33',
      'DIFF_HSTL_I', 'DIFF_HSTL_II', 'DIFF_HSTL_I_12', 'DIFF_HSTL_I_18', 'DIFF_HSTL_II_18', 'DIFF_HSUL_12', 'DIFF_MOBILE_DDR',
      'DIFF_SSTL18_I', 'DIFF_SSTL18_II', 'DIFF_SSTL15', 'DIFF_SSTL135', 'DIFF_SSTL12'],
  },
  {
    id: 'zynq', name: 'Zynq', displayName: 'Zynq-7000', xiseFamily: 'Zynq', xiseVerified: false,
    datasheet: 'DS190 / DS187', webpack: true, webpackParts: 'XC7Z010, XC7Z020, XC7Z030 (XC7Z015 is not supported by ISE at all)', bitgen: MODERN_BITGEN,
    speeds: { '-1': 'Standard', '-2': 'Mid', '-3': 'High performance' },
    note: 'Zynq designs in ISE go through XPS/PlanAhead; the PS (ARM) side needs the processing-system IP. Z-7010/7020 have HR banks only; Z-7030 adds HP banks.',
    ioStandards: null, // Artix-7 (HR) + Kintex-7 (HP) SelectIO; filled below
  },
];

FAMILIES.push(ICE40_FAMILY);   // (last: the ISE families first in the pickers)
const famById = Object.fromEntries(FAMILIES.map(f => [f.id, f]));
famById.spartan3adsp.ioStandards = famById.spartan3a.ioStandards;
famById.zynq.ioStandards = [...new Set([...famById.artix7.ioStandards, ...famById.kintex7.ioStandards, 'I2C', 'SDIO'])];

// Helpers keep the tables below close to the data-sheet layout.
const pk = (userIo, extra = {}) => ({ userIo, ...extra });
const S3_SPEEDS = ['-4', '-5'];
const S6_LX = ['-1L', '-2', '-3', '-3N'];
const S6_LXT = ['-2', '-3', '-3N'];

/** Spartan-3 generation part (CLB = 4 slices, slice = 2 LUT4 + 2 FF, 18 Kb block RAMs, 18x18 multipliers, DCMs). */
function s3gen(family, part, { gates, cells, clbs, slices, distKb, bramKb, mults, dsp48a, dcms, maxIo, packages, speeds = S3_SPEEDS, ...rest }) {
  const sl = slices ?? clbs * 4;
  return {
    part, family, systemGates: gates, logicCells: cells, clbs: clbs ?? sl / 4, slices: sl, luts: sl * 2, ffs: sl * 2,
    distRamBits: distKb * K, brams: bramKb / 18, bramBits: bramKb * K,
    multipliers: mults ?? dsp48a, ...(dsp48a ? { dsp: dsp48a, dspType: 'DSP48A' } : {}),
    dcms, maxUserIo: maxIo, packages, speeds, ...rest,
  };
}

/**
 * Spartan-6 / Virtex / 7-series part. lutsPerSlice: 4 (S6/V5/V6/7), 2 (V4); ffsPerSlice: 8 (S6/V6/7), 4 (V5), 2 (V4).
 * bramSize 18 or 36 (Kb) is the native block size counted by `brams`.
 */
function modern(family, part, { cells, slices, lutsPerSlice = 4, ffsPerSlice = 8, ffs, luts, distKb, bramSize, brams, dsp, dspType, clock, maxIo, packages, speeds, ...rest }) {
  return {
    part, family, logicCells: cells, slices, luts: luts ?? slices * lutsPerSlice, ffs: ffs ?? slices * ffsPerSlice,
    distRamBits: distKb != null ? distKb * K : undefined, brams, bramSize, bramBits: brams * bramSize * K,
    ...(bramSize === 36 ? { bram18: brams * 2 } : {}),
    dsp, dspType, multipliers: dsp, // every DSP slice contains one hardware multiplier
    dcms: clock.dcm || 0, plls: clock.pll || 0, mmcms: clock.mmcm || 0, cmts: clock.cmt || 0,
    maxUserIo: maxIo, packages, speeds, ...rest,
  };
}

const NEW_PARTS = [
  // ---- Spartan-3 (DS099 Table 1 / Table 3). CP132 is discontinued (still selectable in ISE). ----
  s3gen('spartan3', 'xc3s50', { gates: 50_000, cells: 1728, clbs: 192, distKb: 12, bramKb: 72, mults: 4, dcms: 2, maxIo: 124,
    packages: { vq100: pk(63), cp132: pk(89, { note: 'discontinued package' }), tq144: pk(97), pq208: pk(124) } }),
  s3gen('spartan3', 'xc3s200', { gates: 200_000, cells: 4320, clbs: 480, distKb: 30, bramKb: 216, mults: 12, dcms: 4, maxIo: 173,
    packages: { vq100: pk(63), tq144: pk(97), pq208: pk(141), ft256: pk(173) } }),
  s3gen('spartan3', 'xc3s400', { gates: 400_000, cells: 8064, clbs: 896, distKb: 56, bramKb: 288, mults: 16, dcms: 4, maxIo: 264,
    packages: { tq144: pk(97), pq208: pk(141), ft256: pk(173), fg320: pk(221), fg456: pk(264) } }),
  s3gen('spartan3', 'xc3s1000', { gates: 1_000_000, cells: 17280, clbs: 1920, distKb: 120, bramKb: 432, mults: 24, dcms: 4, maxIo: 391,
    packages: { ft256: pk(173), fg320: pk(221), fg456: pk(333), fg676: pk(391) } }),
  s3gen('spartan3', 'xc3s1500', { gates: 1_500_000, cells: 29952, clbs: 3328, distKb: 208, bramKb: 576, mults: 32, dcms: 4, maxIo: 487,
    packages: { fg320: pk(221), fg456: pk(333), fg676: pk(487) } }),
  // Spartan-3L (low-power) parts: listed as "XC3S1500(L)" in UG631; DS313 (Spartan-3L) not fetched.
  s3gen('spartan3', 'xc3s1000l', { gates: 1_000_000, cells: 17280, clbs: 1920, distKb: 120, bramKb: 432, mults: 24, dcms: 4, maxIo: 391,
    packages: { ft256: pk(173), fg320: pk(221), fg456: pk(333) }, speeds: ['-4'], verified: false,
    note: 'Spartan-3L low-power variant (discontinued). Resources assumed equal to XC3S1000; packages/speed grades not verified.' }),
  s3gen('spartan3', 'xc3s1500l', { gates: 1_500_000, cells: 29952, clbs: 3328, distKb: 208, bramKb: 576, mults: 32, dcms: 4, maxIo: 487,
    packages: { fg320: pk(221), fg456: pk(333), fg676: pk(487) }, speeds: ['-4'], verified: false,
    note: 'Spartan-3L low-power variant (discontinued). Resources assumed equal to XC3S1500; packages/speed grades not verified.' }),

  // ---- Spartan-3A (DS529 Tables 1, 2; -4/-5 per Table 3). (n) = input-only pins. ----
  s3gen('spartan3a', 'xc3s50a', { gates: 50_000, cells: 1584, slices: 704, distKb: 11, bramKb: 54, mults: 3, dcms: 2, maxIo: 144,
    packages: { vq100: pk(68, { inputOnly: 13 }), tq144: pk(108, { inputOnly: 7 }), ft256: pk(144, { inputOnly: 32 }) } }),
  s3gen('spartan3a', 'xc3s200a', { gates: 200_000, cells: 4032, slices: 1792, distKb: 28, bramKb: 288, mults: 16, dcms: 4, maxIo: 248,
    packages: { vq100: pk(68, { inputOnly: 13 }), ft256: pk(195, { inputOnly: 35 }), fg320: pk(248, { inputOnly: 56 }) } }),
  s3gen('spartan3a', 'xc3s400a', { gates: 400_000, cells: 8064, slices: 3584, distKb: 56, bramKb: 360, mults: 20, dcms: 4, maxIo: 311,
    packages: { ft256: pk(195, { inputOnly: 35 }), fg320: pk(251, { inputOnly: 59 }), fg400: pk(311, { inputOnly: 63 }) } }),
  s3gen('spartan3a', 'xc3s700a', { gates: 700_000, cells: 13248, slices: 5888, distKb: 92, bramKb: 360, mults: 20, dcms: 8, maxIo: 372,
    packages: { ft256: pk(161, { inputOnly: 13 }), fg400: pk(311, { inputOnly: 63 }), fg484: pk(372, { inputOnly: 84 }) } }),
  s3gen('spartan3a', 'xc3s1400a', { gates: 1_400_000, cells: 25344, slices: 11264, distKb: 176, bramKb: 576, mults: 32, dcms: 8, maxIo: 502,
    packages: { ft256: pk(161, { inputOnly: 13 }), fg484: pk(375, { inputOnly: 87 }), fg676: pk(502, { inputOnly: 94 }) } }),

  // ---- Spartan-3AN (DS557 Tables 2, 4, 5): Spartan-3A die + in-package SPI flash; Pb-free (G) packages. ----
  s3gen('spartan3a', 'xc3s50an', { gates: 50_000, cells: 1584, slices: 704, distKb: 11, bramKb: 54, mults: 3, dcms: 2, maxIo: 144, flashBits: 1 * K * K,
    note: 'DS557 Table 2 gives 108 max user I/O (TQG144); the discontinued FTG256 option has 144.',
    packages: { tqg144: pk(108, { inputOnly: 7 }), ftg256: pk(144, { inputOnly: 32, note: 'discontinued (XCN13016)' }) } }),
  s3gen('spartan3a', 'xc3s200an', { gates: 200_000, cells: 4032, slices: 1792, distKb: 28, bramKb: 288, mults: 16, dcms: 4, maxIo: 195, flashBits: 4 * K * K,
    packages: { ftg256: pk(195, { inputOnly: 35 }) } }),
  s3gen('spartan3a', 'xc3s400an', { gates: 400_000, cells: 8064, slices: 3584, distKb: 56, bramKb: 360, mults: 20, dcms: 4, maxIo: 311, flashBits: 4 * K * K,
    packages: { ftg256: pk(195, { inputOnly: 35 }), fgg400: pk(311, { inputOnly: 63 }) } }),
  s3gen('spartan3a', 'xc3s700an', { gates: 700_000, cells: 13248, slices: 5888, distKb: 92, bramKb: 360, mults: 20, dcms: 8, maxIo: 372, flashBits: 8 * K * K,
    packages: { fgg484: pk(372, { inputOnly: 84 }) } }),
  s3gen('spartan3a', 'xc3s1400an', { gates: 1_400_000, cells: 25344, slices: 11264, distKb: 176, bramKb: 576, mults: 32, dcms: 8, maxIo: 502, flashBits: 16 * K * K,
    packages: { fgg484: pk(375, { inputOnly: 87, note: 'discontinued (XCN13016)' }), fgg676: pk(502, { inputOnly: 94 }) } }),

  // ---- Spartan-3A DSP (DS610 Tables 1, 2, 15). XC3SD3400A is not in WebPACK. ----
  s3gen('spartan3adsp', 'xc3sd1800a', { gates: 1_800_000, cells: 37440, slices: 16640, distKb: 260, bramKb: 1512, dsp48a: 84, dcms: 8, maxIo: 519,
    packages: { cs484: pk(309, { inputOnly: 60 }), fg676: pk(519, { inputOnly: 110 }) } }),

  // ---- Spartan-6 (DS160 Tables 1, 2; speed grades DS162 Table 26). CMT = 2 DCM + 1 PLL. ----
  modern('spartan6', 'xc6slx4', { cells: 3840, slices: 600, ffs: 4800, distKb: 75, bramSize: 18, brams: 12, dsp: 8, dspType: 'DSP48A1', clock: { cmt: 2, dcm: 4, pll: 2 }, maxIo: 132, mcb: 0,
    packages: { cpg196: pk(106), tqg144: pk(102), csg225: pk(132) }, speeds: ['-1L', '-2', '-3'] }),
  modern('spartan6', 'xc6slx9', { cells: 9152, slices: 1430, ffs: 11440, distKb: 90, bramSize: 18, brams: 32, dsp: 16, dspType: 'DSP48A1', clock: { cmt: 2, dcm: 4, pll: 2 }, maxIo: 200, mcb: 2,
    packages: { cpg196: pk(106), tqg144: pk(102), csg225: pk(160), ftg256: pk(186), csg324: pk(200) }, speeds: S6_LX }),
  modern('spartan6', 'xc6slx16', { cells: 14579, slices: 2278, ffs: 18224, distKb: 136, bramSize: 18, brams: 32, dsp: 32, dspType: 'DSP48A1', clock: { cmt: 2, dcm: 4, pll: 2 }, maxIo: 232, mcb: 2,
    packages: { cpg196: pk(106), csg225: pk(160), ftg256: pk(186), csg324: pk(232) }, speeds: S6_LX }),
  modern('spartan6', 'xc6slx25', { cells: 24051, slices: 3758, ffs: 30064, distKb: 229, bramSize: 18, brams: 52, dsp: 38, dspType: 'DSP48A1', clock: { cmt: 2, dcm: 4, pll: 2 }, maxIo: 266, mcb: 2,
    packages: { ftg256: pk(186), csg324: pk(226), fgg484: pk(266) }, speeds: S6_LX }),
  modern('spartan6', 'xc6slx45', { cells: 43661, slices: 6822, ffs: 54576, distKb: 401, bramSize: 18, brams: 116, dsp: 58, dspType: 'DSP48A1', clock: { cmt: 4, dcm: 8, pll: 4 }, maxIo: 358, mcb: 2,
    packages: { csg324: pk(218), fgg484: pk(316), csg484: pk(320), fgg676: pk(358) }, speeds: S6_LX }),
  modern('spartan6', 'xc6slx75', { cells: 74637, slices: 11662, ffs: 93296, distKb: 692, bramSize: 18, brams: 172, dsp: 132, dspType: 'DSP48A1', clock: { cmt: 6, dcm: 12, pll: 6 }, maxIo: 408, mcb: 4,
    packages: { fgg484: pk(280), csg484: pk(328), fgg676: pk(408) }, speeds: S6_LX }),
  modern('spartan6', 'xc6slx25t', { cells: 24051, slices: 3758, ffs: 30064, distKb: 229, bramSize: 18, brams: 52, dsp: 38, dspType: 'DSP48A1', clock: { cmt: 2, dcm: 4, pll: 2 }, maxIo: 250, mcb: 2, pcie: 1, gtp: 2,
    packages: { csg324: pk(190, { gts: 2 }), fgg484: pk(250, { gts: 2 }) }, speeds: S6_LXT }),
  modern('spartan6', 'xc6slx45t', { cells: 43661, slices: 6822, ffs: 54576, distKb: 401, bramSize: 18, brams: 116, dsp: 58, dspType: 'DSP48A1', clock: { cmt: 4, dcm: 8, pll: 4 }, maxIo: 296, mcb: 2, pcie: 1, gtp: 4,
    packages: { csg324: pk(190, { gts: 4 }), fgg484: pk(296, { gts: 4 }), csg484: pk(296, { gts: 4 }) }, speeds: S6_LXT }),
  modern('spartan6', 'xc6slx75t', { cells: 74637, slices: 11662, ffs: 93296, distKb: 692, bramSize: 18, brams: 172, dsp: 132, dspType: 'DSP48A1', clock: { cmt: 6, dcm: 12, pll: 6 }, maxIo: 348, mcb: 4, pcie: 1, gtp: 8,
    packages: { fgg484: pk(268, { gts: 4 }), csg484: pk(292, { gts: 4 }), fgg676: pk(348, { gts: 8 }) }, speeds: S6_LXT }),

  // ---- Virtex-4 (DS112 Tables 1, 2; DS302 Table 14). Slice = 2 LUT4 + 2 FF; XtremeDSP = DSP48. ----
  modern('virtex4', 'xc4vlx15', { cells: 13824, slices: 6144, lutsPerSlice: 2, ffsPerSlice: 2, distKb: 96, bramSize: 18, brams: 48, dsp: 32, dspType: 'DSP48', clock: { dcm: 4 }, pmcds: 0, maxIo: 320,
    packages: { sf363: pk(240), ff668: pk(320), ff676: pk(320) }, speeds: ['-10', '-11', '-12'] }),
  modern('virtex4', 'xc4vlx25', { cells: 24192, slices: 10752, lutsPerSlice: 2, ffsPerSlice: 2, distKb: 168, bramSize: 18, brams: 72, dsp: 48, dspType: 'DSP48', clock: { dcm: 8 }, pmcds: 4, maxIo: 448,
    packages: { sf363: pk(240), ff668: pk(448) }, speeds: ['-10', '-11', '-12'] }),
  modern('virtex4', 'xc4vsx25', { cells: 23040, slices: 10240, lutsPerSlice: 2, ffsPerSlice: 2, distKb: 160, bramSize: 18, brams: 128, dsp: 128, dspType: 'DSP48', clock: { dcm: 4 }, pmcds: 0, maxIo: 320,
    packages: { ff668: pk(320) }, speeds: ['-10', '-11', '-12'] }),
  modern('virtex4', 'xc4vfx12', { cells: 12312, slices: 5472, lutsPerSlice: 2, ffsPerSlice: 2, distKb: 86, bramSize: 18, brams: 36, dsp: 32, dspType: 'DSP48', clock: { dcm: 4 }, pmcds: 0, maxIo: 320, powerpc: 1, emacs: 2,
    packages: { sf363: pk(240), ff668: pk(320) }, speeds: ['-10', '-11', '-12'] }),

  // ---- Virtex-5 (DS100 Tables 1, 2; DS202 Table 54). Slice = 4 LUT6 + 4 FF; CMT = 2 DCM + 1 PLL. ----
  modern('virtex5', 'xc5vlx30', { slices: 4800, ffsPerSlice: 4, distKb: 320, bramSize: 36, brams: 32, dsp: 32, dspType: 'DSP48E', clock: { cmt: 2, dcm: 4, pll: 2 }, maxIo: 400,
    packages: { ff324: pk(220), ff676: pk(400) }, speeds: ['-1', '-2', '-3'] }),
  modern('virtex5', 'xc5vlx50', { slices: 7200, ffsPerSlice: 4, distKb: 480, bramSize: 36, brams: 48, dsp: 48, dspType: 'DSP48E', clock: { cmt: 6, dcm: 12, pll: 6 }, maxIo: 560,
    packages: { ff324: pk(220), ff676: pk(440), ff1153: pk(560) }, speeds: ['-1', '-2', '-3'] }),
  modern('virtex5', 'xc5vlx20t', { slices: 3120, ffsPerSlice: 4, distKb: 210, bramSize: 36, brams: 26, dsp: 24, dspType: 'DSP48E', clock: { cmt: 1, dcm: 2, pll: 1 }, maxIo: 172, pcie: 1, emacs: 2, gtp: 4,
    packages: { ff323: pk(172, { gts: 4 }) }, speeds: ['-1', '-2'] }),
  modern('virtex5', 'xc5vlx30t', { slices: 4800, ffsPerSlice: 4, distKb: 320, bramSize: 36, brams: 36, dsp: 32, dspType: 'DSP48E', clock: { cmt: 2, dcm: 4, pll: 2 }, maxIo: 360, pcie: 1, emacs: 4, gtp: 8,
    packages: { ff323: pk(172, { gts: 4 }), ff665: pk(360, { gts: 8 }) }, speeds: ['-1', '-2', '-3'] }),
  modern('virtex5', 'xc5vlx50t', { slices: 7200, ffsPerSlice: 4, distKb: 480, bramSize: 36, brams: 60, dsp: 48, dspType: 'DSP48E', clock: { cmt: 6, dcm: 12, pll: 6 }, maxIo: 480, pcie: 1, emacs: 4, gtp: 12,
    packages: { ff665: pk(360, { gts: 8 }), ff1136: pk(480, { gts: 12 }) }, speeds: ['-1', '-2', '-3'] }),
  modern('virtex5', 'xc5vfx30t', { slices: 5120, ffsPerSlice: 4, distKb: 380, bramSize: 36, brams: 68, dsp: 64, dspType: 'DSP48E', clock: { cmt: 2, dcm: 4, pll: 2 }, maxIo: 360, powerpc: 1, pcie: 1, emacs: 4, gtx: 8,
    packages: { ff665: pk(360, { gts: 8 }) }, speeds: ['-1', '-2', '-3'] }),

  // ---- Virtex-6 (DS150 Tables 1, 2, 4). Slice = 4 LUT6 + 8 FF; CMT = 2 MMCM. ----
  modern('virtex6', 'xc6vlx75t', { cells: 74496, slices: 11640, distKb: 1045, bramSize: 36, brams: 156, dsp: 288, dspType: 'DSP48E1', clock: { cmt: 3, mmcm: 6 }, maxIo: 360, pcie: 1, emacs: 4, gtx: 12,
    packages: { ff484: pk(240, { gts: 8 }), ff784: pk(360, { gts: 12 }) }, speeds: ['-1', '-2', '-3', '-1L'] }),

  // ---- Artix-7 / Kintex-7 (DS180 Tables 4-7, 12). CMT = 1 MMCM + 1 PLL. HR/HP = bank types. ----
  modern('artix7', 'xc7a100t', { cells: 101440, slices: 15850, distKb: 1188, bramSize: 36, brams: 135, dsp: 240, dspType: 'DSP48E1', clock: { cmt: 6, mmcm: 6, pll: 6 }, maxIo: 300, pcie: 1, gtp: 8, xadc: 1,
    packages: { csg324: pk(210), ftg256: pk(170), fgg484: pk(285, { gts: 4 }), fgg676: pk(300, { gts: 8 }) }, speeds: ['-1', '-2', '-3'] }),
  modern('artix7', 'xc7a200t', { cells: 215360, slices: 33650, distKb: 2888, bramSize: 36, brams: 365, dsp: 740, dspType: 'DSP48E1', clock: { cmt: 10, mmcm: 10, pll: 10 }, maxIo: 500, pcie: 1, gtp: 16, xadc: 1,
    packages: { sbg484: pk(285, { gts: 4 }), fbg484: pk(285, { gts: 4 }), fbg676: pk(400, { gts: 8 }), ffg1156: pk(500, { gts: 16 }) }, speeds: ['-1', '-2', '-3'] }),
  modern('kintex7', 'xc7k70t', { cells: 65600, slices: 10250, distKb: 838, bramSize: 36, brams: 135, dsp: 240, dspType: 'DSP48E1', clock: { cmt: 6, mmcm: 6, pll: 6 }, maxIo: 300, pcie: 1, gtx: 8, xadc: 1,
    packages: { fbg484: pk(285, { hr: 185, hp: 100, gts: 4 }), fbg676: pk(300, { hr: 200, hp: 100, gts: 8 }) }, speeds: ['-1', '-2', '-3'] }),
  modern('kintex7', 'xc7k160t', { cells: 162240, slices: 25350, distKb: 2188, bramSize: 36, brams: 325, dsp: 600, dspType: 'DSP48E1', clock: { cmt: 8, mmcm: 8, pll: 8 }, maxIo: 400, pcie: 1, gtx: 8, xadc: 1,
    packages: { fbg484: pk(285, { hr: 185, hp: 100, gts: 4 }), fbg676: pk(400, { hr: 250, hp: 150, gts: 8 }), ffg676: pk(400, { hr: 250, hp: 150, gts: 8 }) }, speeds: ['-1', '-2', '-3'] }),

  // ---- Zynq-7000 (DS190 Tables 1-3, 5, 7). userIo = programmable-logic SelectIO (PS MIO pins listed as psIo). ----
  modern('zynq', 'xc7z010', { cells: 28_000, slices: 4400, luts: 17600, ffs: 35200, bramSize: 36, brams: 60, dsp: 80, dspType: 'DSP48E1', clock: { cmt: 2, mmcm: 2, pll: 2 }, maxIo: 100, xadc: 1, processor: 'dual Cortex-A9',
    packages: { clg225: pk(54, { psIo: 84 }), clg400: pk(100, { psIo: 128 }) }, speeds: ['-1', '-2', '-3'] }),
  modern('zynq', 'xc7z020', { cells: 85_000, slices: 13300, luts: 53200, ffs: 106400, bramSize: 36, brams: 140, dsp: 220, dspType: 'DSP48E1', clock: { cmt: 4, mmcm: 4, pll: 4 }, maxIo: 200, xadc: 1, processor: 'dual Cortex-A9',
    packages: { clg400: pk(125, { psIo: 128 }), clg484: pk(200, { psIo: 128 }) }, speeds: ['-1', '-2', '-3'] }),
  modern('zynq', 'xc7z030', { cells: 125_000, slices: 19650, luts: 78600, ffs: 157200, bramSize: 36, brams: 265, dsp: 400, dspType: 'DSP48E1', clock: { cmt: 5, mmcm: 5, pll: 5 }, maxIo: 250, pcie: 1, gtx: 4, xadc: 1, processor: 'dual Cortex-A9',
    packages: { sbg485: pk(150, { hr: 50, hp: 100, gts: 4, psIo: 128 }), fbg484: pk(163, { hr: 100, hp: 63, gts: 4, psIo: 128 }),
      fbg676: pk(250, { hr: 100, hp: 150, gts: 4, psIo: 128 }), ffg676: pk(250, { hr: 100, hp: 150, gts: 4, psIo: 128 }) }, speeds: ['-1', '-2', '-3'] }),
];

/** Every part of every WebPACK family (Spartan-3E entries are the same objects as DEVICES.parts). */
export const PARTS = [...DEVICES.parts, ...NEW_PARTS, ...ICE40_DEVICES];
for (const p of PARTS) {
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  if (p.verified === undefined) p.verified = true;
}

/** Package descriptions for every package key used above. */
export const PACKAGES = {
  ...ICE40_PACKAGES,
  ...DEVICES.packages,
  cp132: '132-ball Chip-Scale Package (CSP)', fg456: '456-ball Fine-Pitch BGA (FBGA)', fg676: '676-ball Fine-Pitch BGA (FBGA)',
  tqg144: '144-pin Thin Quad Flat Pack, Pb-free (TQFP)', ftg256: '256-ball Fine-Pitch Thin BGA, Pb-free',
  fgg400: '400-ball Fine-Pitch BGA, Pb-free', fgg484: '484-ball Fine-Pitch BGA, Pb-free', fgg676: '676-ball Fine-Pitch BGA, Pb-free',
  cs484: '484-ball Chip-Scale BGA (0.8 mm)', cpg196: '196-ball Chip-Scale BGA, 0.5 mm, Pb-free', csg225: '225-ball Chip-Scale BGA, 0.8 mm, Pb-free',
  csg324: '324-ball Chip-Scale BGA, 0.8 mm, Pb-free', csg484: '484-ball Chip-Scale BGA, 0.8 mm, Pb-free',
  sf363: '363-ball Flip-Chip Fine-Pitch BGA', ff323: '323-ball Flip-Chip BGA', ff324: '324-ball Flip-Chip BGA', ff484: '484-ball Flip-Chip BGA',
  ff665: '665-ball Flip-Chip BGA', ff668: '668-ball Flip-Chip BGA', ff676: '676-ball Flip-Chip BGA', ff784: '784-ball Flip-Chip BGA',
  ff1136: '1136-ball Flip-Chip BGA', ff1153: '1153-ball Flip-Chip BGA',
  sbg484: '484-ball Lidless Flip-Chip BGA, 0.8 mm', fbg484: '484-ball Lidless Flip-Chip BGA, 1.0 mm', fbg676: '676-ball Lidless Flip-Chip BGA',
  ffg676: '676-ball Flip-Chip BGA, Pb-free', ffg1156: '1156-ball Flip-Chip BGA, Pb-free',
  clg225: '225-ball Wire-Bond Chip-Scale BGA, 0.8 mm', clg400: '400-ball Wire-Bond Chip-Scale BGA, 0.8 mm', clg484: '484-ball Wire-Bond Chip-Scale BGA, 0.8 mm',
  sbg485: '485-ball Lidless Flip-Chip BGA, 0.8 mm',
};

const partIndex = new Map(PARTS.map(p => [p.part, p]));

/** Part record (any family) by name, case-insensitive; also accepts a full ISE part string (xc6slx9-2csg324). */
export function findPart(part) {
  const s = String(part || '').trim().toLowerCase();
  if (partIndex.has(s)) return partIndex.get(s);
  // a full ISE part string: <part>-<package><speed> or <part>-<speed>-<package>
  const m = /^([a-z0-9]+)-[a-z0-9-]+$/.exec(s);
  return m ? partIndex.get(m[1]) || null : null;
}

/** Family record by id ('spartan6') or by ISE name ('Spartan6', 'Spartan3A and Spartan3AN'). */
export function findFamily(id) {
  const s = String(id || '').trim().toLowerCase();
  return famById[s] || FAMILIES.find(f => f.name.toLowerCase() === s || f.xiseFamily?.toLowerCase() === s) || null;
}

/** Parts of a family (id or ISE name); empty list for unknown families. */
export function partsOfFamily(family) {
  const f = findFamily(family);
  return f ? PARTS.filter(p => p.family === f.id) : [];
}

/** Family id of a part ('xc6slx9' -> 'spartan6'); falls back to name-based detection for parts outside the DB. */
export function familyOf(part) {
  return findPart(part)?.family || familyOfPart(String(part || '').split('-')[0]) || null;
}

/**
 * Validate a { part, package, speed } triple of any WebPACK family. Returns a list of problems
 * (empty = ok). A `family` field is not checked: the part name decides the family (projects created
 * before multi-family support carry family 'spartan3e' whatever the part).
 */
export function validateDevice(dev) {
  const errs = [];
  const p = findPart(dev?.part);
  if (!p) {
    const fam = familyOfPart(dev?.part);
    return [fam
      ? `part '${dev?.part}' (${findFamily(fam)?.displayName || fam}) is not supported by ISE 14.7 WebPACK / not in the Silinx device database`
      : `unknown part '${dev?.part}'`];
  }
  const pk = p.packages[String(dev.package || '').toLowerCase()];
  if (!pk) errs.push(`${p.part} is not available in package '${dev.package}' (valid: ${Object.keys(p.packages).join(', ')})`);
  const speeds = pk?.speeds || p.speeds;
  if (!speeds.length) return errs;   // (a family with no speed grades: the iCE40's)
  const sp = String(dev.speed ?? '');
  if (!speeds.includes(sp.startsWith('-') ? sp : `-${sp}`)) errs.push(`speed grade '${dev.speed}' not available for ${p.part}-${dev.package} (valid: ${speeds.join(', ')})`);
  return errs;
}

export function findBoard(id) {
  return BOARDS.find(b => b.id === id) || null;
}

/**
 * Resolve a board (+ optional variant id, or a device part to pick the variant) into
 * { board, device, resources } with variant overrides applied.
 */
export function resolveBoard(id, { variant, part } = {}) {
  const b = findBoard(id);
  if (!b) return null;
  let v = null;
  if (b.variants) {
    v = b.variants.find(x => x.id === variant)
      || (part && b.variants.find(x => x.device.part === String(part).toLowerCase()))
      || b.variants.find(x => x.default) || b.variants[0];
  }
  const ov = v?.resourceOverrides || {};
  const resources = b.resources.map(r => (ov[r.name] ? { ...r, ...ov[r.name] } : { ...r }));
  return { board: b, variant: v, device: { ...(v?.device || b.device) }, resources };
}

/** Boards of the original Spartan-3E-only database: the default getDeviceDb() view. */
export const LEGACY_BOARD_IDS = ['s3e-starter', 'basys2', 'nexys2'];

/**
 * Full DB for GET /api/devices.
 *
 * Always present: every key of DEVICES (family, familyName, packages, speeds, iostandards,
 * driveStrengths), `families` (FAMILIES, each with its `parts` names), `allParts` (PARTS) and
 * `allBoards` (BOARDS). `packages` covers every package key of every family.
 *
 * `parts` / `boards`: by default the original Spartan-3E view (DEVICES.parts and the three
 * original boards) so existing clients keep working; with { all: true } every WebPACK part and
 * every board (family/familyName are then null / 'All ...').
 */
export function getDeviceDb({ all = true } = {}) {
  const families = FAMILIES.map(f => ({ ...f, parts: PARTS.filter(p => p.family === f.id).map(p => p.part) }));
  const base = { ...DEVICES, packages: { ...PACKAGES }, families, allParts: PARTS, allBoards: BOARDS };
  if (all) return { ...base, family: null, familyName: 'All ISE 14.7 WebPACK families', parts: PARTS, boards: BOARDS };
  return { ...base, parts: DEVICES.parts, boards: BOARDS.filter(b => LEGACY_BOARD_IDS.includes(b.id)) };
}
