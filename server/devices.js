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

import { familyOfPart } from '../core/family.js';

export const FAMILY = 'spartan3e';

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
export const PARTS = [...DEVICES.parts, ...NEW_PARTS];
for (const p of PARTS) {
  for (const k of Object.keys(p)) if (p[k] === undefined) delete p[k];
  if (p.verified === undefined) p.verified = true;
}

/** Package descriptions for every package key used above. */
export const PACKAGES = {
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
  return partIndex.get(s) || partIndex.get(s.split('-')[0]) || null;
}

/** Family record by id ('spartan6') or by ISE name ('Spartan6', 'Spartan3A and Spartan3AN'). */
export function findFamily(id) {
  const s = String(id || '').trim().toLowerCase();
  return famById[s] || FAMILIES.find(f => f.name.toLowerCase() === s || f.xiseFamily.toLowerCase() === s) || null;
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
  const sp = String(dev.speed ?? '');
  if (!speeds.includes(sp.startsWith('-') ? sp : `-${sp}`)) errs.push(`speed grade '${dev.speed}' not available for ${p.part}-${dev.package} (valid: ${speeds.join(', ')})`);
  return errs;
}

// ---------------------------------------------------------------------------------------------
// Boards
// ---------------------------------------------------------------------------------------------

const S3E_UCF = 'Xilinx UG230 Spartan-3E Starter Kit UCF';
const BASYS2_UCF = 'Digilent Basys2_100_250General.ucf (rev C)';
const NEXYS2_UCF = 'Digilent Nexys2_500General.ucf / Nexys2_1200General.ucf';
const NEXYS3_UCF = 'Digilent Nexys3_Master.ucf (rev B board)';
const ATLYS_UCF = 'Digilent AtlysGeneral.ucf (rev C board)';
const MIMASV2_UCF = 'Numato Lab MimasV2.ucf (numato/samplecode)';
const CMODS6_UCF = 'Cmod S6 UCF from ZipCPU/s6soc (derived from Digilent\'s Cmod S6 UCF)';
const S3A_UCF = 'Xilinx UG334 Spartan-3A/3AN Starter Kit UCF listings';
const S3_UCF = 'Xilinx UG130 Spartan-3 Starter Kit board pin tables';
const PAPILIO_UCF = 'Gadget Factory BPC3003_2.03+.ucf (Papilio_One.ucf)';
const ELBERTV2_UCF = 'Numato Lab Elbertv2.ucf (numato/samplecode)';

export const BOARDS = [
  {
    id: 's3e-starter',
    name: 'Xilinx Spartan-3E Starter Kit (Digilent, rev D)',
    vendor: 'Xilinx / Digilent',
    device: { family: FAMILY, part: 'xc3s500e', package: 'fg320', speed: '-4' },
    // On-board USB is an embedded Xilinx Platform Cable USB. JTAG chain (iMPACT numbering):
    // 1 = XC3S500E FPGA, 2 = XCF04S Platform Flash PROM, 3 = XC2C64A CoolRunner-II CPLD.
    jtagChain: [{ name: 'xc3s500e', role: 'fpga' }, { name: 'xcf04s', role: 'prom' }, { name: 'xc2c64a', role: 'cpld' }],
    flash: { type: 'xcf', part: 'xcf04s', xcf: true, verified: true,
      others: [{ type: 'spi', part: 'm25p16' }, { type: 'bpi', part: 'Intel StrataFlash 128 Mbit (28F128J3)' }],
      note: 'XCF04S Platform Flash (Master Serial); also 16 Mbit SPI flash and 128 Mbit parallel StrataFlash (UG230).' },
    programmer: {
      preferred: 'impact',
      tools: {
        impact: { cable: 'auto', position: 1 },
        xc3sprog: { cable: 'xpc', position: 0, note: 'Embedded Platform Cable needs its firmware loaded (fxload xusb_emb.hex) on Linux.' },
        openFPGALoader: { cable: 'xilinxPlatformCableUsb', position: 0, verified: false, onboard: false,
          note: 'openFPGALoader XPCU support targets external Platform Cable USB (03fd:0013/000d); the kit\'s embedded cable (03fd:0008 after firmware) is not listed. Use an external JTAG cable on J28 instead.' },
      },
    },
    source: S3E_UCF,
    resources: [
      { name: 'clk', label: '50 MHz oscillator', pins: ['C9'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', extra: { period: '20 ns' } },
      { name: 'clk_aux', label: 'Auxiliary clock socket (8-pin DIP)', pins: ['B8'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock' },
      { name: 'clk_sma', label: 'SMA clock input', pins: ['A10'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock' },
      { name: 'led', label: 'LEDs LD0..LD7', pins: ['F12', 'E12', 'E11', 'F11', 'C11', 'D11', 'E9', 'F9'], dir: 'out', iostandard: 'LVTTL', slew: 'slow', drive: 8, group: 'LEDs', extra: { activeHigh: true } },
      { name: 'sw', label: 'Slide switches SW0..SW3', pins: ['L13', 'L14', 'H18', 'N17'], dir: 'in', iostandard: 'LVTTL', pull: 'up', group: 'Switches' },
      { name: 'btn_east', label: 'Push button EAST', pins: ['H13'], dir: 'in', iostandard: 'LVTTL', pull: 'down', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'btn_north', label: 'Push button NORTH', pins: ['V4'], dir: 'in', iostandard: 'LVTTL', pull: 'down', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'btn_south', label: 'Push button SOUTH', pins: ['K17'], dir: 'in', iostandard: 'LVTTL', pull: 'down', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'btn_west', label: 'Push button WEST', pins: ['D18'], dir: 'in', iostandard: 'LVTTL', pull: 'down', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'rot_a', label: 'Rotary encoder A', pins: ['K18'], dir: 'in', iostandard: 'LVTTL', pull: 'up', group: 'Rotary encoder' },
      { name: 'rot_b', label: 'Rotary encoder B', pins: ['G18'], dir: 'in', iostandard: 'LVTTL', pull: 'up', group: 'Rotary encoder' },
      { name: 'rot_center', label: 'Rotary encoder push', pins: ['V16'], dir: 'in', iostandard: 'LVTTL', pull: 'down', group: 'Rotary encoder' },
      { name: 'rs232_dce_rxd', label: 'RS-232 DCE (female) RXD', pins: ['R7'], dir: 'in', iostandard: 'LVTTL', group: 'RS-232' },
      { name: 'rs232_dce_txd', label: 'RS-232 DCE (female) TXD', pins: ['M14'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'slow', group: 'RS-232' },
      { name: 'rs232_dte_rxd', label: 'RS-232 DTE (male) RXD', pins: ['U8'], dir: 'in', iostandard: 'LVTTL', group: 'RS-232' },
      { name: 'rs232_dte_txd', label: 'RS-232 DTE (male) TXD', pins: ['M13'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'slow', group: 'RS-232' },
      { name: 'vga_red', label: 'VGA red (1 bit)', pins: ['H14'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_green', label: 'VGA green (1 bit)', pins: ['H15'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_blue', label: 'VGA blue (1 bit)', pins: ['G15'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_hsync', label: 'VGA HSYNC', pins: ['F15'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_vsync', label: 'VGA VSYNC', pins: ['F14'], dir: 'out', iostandard: 'LVTTL', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'ps2_clk', label: 'PS/2 clock', pins: ['G14'], dir: 'inout', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'PS/2' },
      { name: 'ps2_data', label: 'PS/2 data', pins: ['G13'], dir: 'inout', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'PS/2' },
      // Character LCD (HD44780-compatible, 4-bit interface on SF_D<11:8>). The data lines are
      // shared with the StrataFlash: drive sf_ce0 high to disable the flash when using the LCD.
      { name: 'lcd_e', label: 'LCD enable', pins: ['M18'], dir: 'out', iostandard: 'LVCMOS33', drive: 4, slew: 'slow', group: 'LCD' },
      { name: 'lcd_rs', label: 'LCD register select', pins: ['L18'], dir: 'out', iostandard: 'LVCMOS33', drive: 4, slew: 'slow', group: 'LCD' },
      { name: 'lcd_rw', label: 'LCD read/write', pins: ['L17'], dir: 'out', iostandard: 'LVCMOS33', drive: 4, slew: 'slow', group: 'LCD' },
      { name: 'lcd_d', label: 'LCD data DB4..DB7 (SF_D<8..11>)', pins: ['R15', 'R16', 'P17', 'M15'], dir: 'inout', iostandard: 'LVCMOS33', drive: 4, slew: 'slow', group: 'LCD' },
      { name: 'sf_ce0', label: 'StrataFlash CE0 (drive 1 when using the LCD)', pins: ['D16'], dir: 'out', iostandard: 'LVCMOS33', drive: 4, slew: 'slow', group: 'LCD' },
    ],
  },
  {
    id: 'basys2',
    name: 'Digilent Basys2',
    vendor: 'Digilent',
    device: { family: FAMILY, part: 'xc3s250e', package: 'cp132', speed: '-4' },
    variants: [
      { id: '100', label: 'Basys2-100 (XC3S100E)', device: { family: FAMILY, part: 'xc3s100e', package: 'cp132', speed: '-4' } },
      { id: '250', label: 'Basys2-250 (XC3S250E)', device: { family: FAMILY, part: 'xc3s250e', package: 'cp132', speed: '-4' }, default: true },
    ],
    deviceNotes: 'Speed grade: both -4 and -5 appear in Basys2 tutorials; check the marking on your chip. The bitstream itself is the same for either grade (only timing analysis differs).',
    speedVerified: false,
    // Adept USB (Cypress FX2, Digilent firmware). JTAG chain in scan order as reported over USB
    // (adepttool, verified on a Basys2-250): XCF02S PROM first, then the FPGA.
    jtagChain: [{ name: 'xcf02s', role: 'prom' }, { name: 'xc3s100e/xc3s250e', role: 'fpga' }],
    flash: { type: 'xcf', part: 'xcf02s', xcf: true, verified: true },
    programmer: {
      preferred: 'djtgcfg',
      tools: {
        adepttool: { device: 0, position: 0, onboard: true, note: 'Open-source driver for the on-board Adept USB (github.com/mwkmwkmwk/adepttool); works on macOS where Digilent Adept is not available. Install with scripts/install-adepttool.sh.' },
        djtgcfg: { device: 'Basys2', position: 0 },
        impact: { cable: 'auto', position: 1, note: 'iMPACT only sees the board through the Digilent plug-in (digilent_plugin) or an external JTAG cable on the 6-pin header.' },
        xc3sprog: { cable: 'jtaghs1', position: 0, verified: false, onboard: false, note: 'On-board Adept USB is not an FTDI device; xc3sprog requires an external FTDI-based cable (e.g. JTAG-HS1/HS2) on the JTAG header.' },
        openFPGALoader: { cable: 'digilent_hs2', position: 0, verified: false, onboard: false, note: 'Only via an external FTDI JTAG cable on the JTAG header; the on-board Adept USB is not supported.' },
      },
    },
    source: BASYS2_UCF,
    resources: [
      { name: 'mclk', label: 'MCLK oscillator (25/50/100 MHz via JP4, default 50 MHz)', pins: ['B8'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', clockDedicatedRoute: false, extra: { period: '20 ns' } },
      { name: 'uclk', label: 'User clock socket IC6', pins: ['M6'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', clockDedicatedRoute: false },
      { name: 'led', label: 'LEDs LD0..LD7', pins: ['M5', 'M11', 'P7', 'P6', 'N5', 'N4', 'P4', 'G1'], dir: 'out', iostandard: 'LVCMOS33', group: 'LEDs', extra: { activeHigh: true } },
      { name: 'sw', label: 'Slide switches SW0..SW7', pins: ['P11', 'L3', 'K3', 'B4', 'G3', 'F3', 'E2', 'N3'], dir: 'in', iostandard: 'LVCMOS33', group: 'Switches' },
      { name: 'btn', label: 'Push buttons BTN0..BTN3', pins: ['G12', 'C11', 'M4', 'A7'], dir: 'in', iostandard: 'LVCMOS33', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'seg', label: '7-segment cathodes CA..CG (active low)', pins: ['L14', 'H12', 'N14', 'N11', 'P12', 'L13', 'M12'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true, order: 'seg[0]=CA ... seg[6]=CG' } },
      { name: 'dp', label: '7-segment decimal point (active low)', pins: ['N13'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true } },
      { name: 'an', label: '7-segment anodes AN0..AN3 (active low)', pins: ['F12', 'J12', 'M13', 'K14'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true } },
      { name: 'vga_red', label: 'VGA red RED0..RED2', pins: ['C14', 'D13', 'F13'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_green', label: 'VGA green GRN0..GRN2', pins: ['F14', 'G13', 'G14'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_blue', label: 'VGA blue BLU1..BLU2 (2 bits)', pins: ['H13', 'J13'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_hsync', label: 'VGA HSYNC', pins: ['J14'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_vsync', label: 'VGA VSYNC', pins: ['K13'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'ps2_clk', label: 'PS/2 clock', pins: ['B1'], dir: 'inout', iostandard: 'LVCMOS33', pull: 'up', drive: 2, group: 'PS/2' },
      { name: 'ps2_data', label: 'PS/2 data', pins: ['C3'], dir: 'inout', iostandard: 'LVCMOS33', pull: 'up', drive: 2, group: 'PS/2' },
      { name: 'ja', label: 'Pmod JA (JA1..JA4)', pins: ['B2', 'A3', 'J3', 'B5'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'jb', label: 'Pmod JB (JB1..JB4)', pins: ['C6', 'B6', 'C5', 'B7'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'jc', label: 'Pmod JC (JC1..JC4)', pins: ['A9', 'B9', 'A10', 'C9'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'jd', label: 'Pmod JD (JD1..JD4)', pins: ['C12', 'A13', 'C13', 'D12'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
    ],
  },
  {
    id: 'nexys2',
    name: 'Digilent Nexys2',
    vendor: 'Digilent',
    device: { family: FAMILY, part: 'xc3s500e', package: 'fg320', speed: '-4' },
    variants: [
      { id: '500', label: 'Nexys2-500 (XC3S500E)', device: { family: FAMILY, part: 'xc3s500e', package: 'fg320', speed: '-4' }, default: true },
      // LD4..LD7 are routed to pins whose type differs between the 500K and 1200K dies.
      { id: '1200', label: 'Nexys2-1200 (XC3S1200E)', device: { family: FAMILY, part: 'xc3s1200e', package: 'fg320', speed: '-4' },
        resourceOverrides: { led: { pins: ['J14', 'J15', 'K15', 'K14', 'E16', 'P16', 'E4', 'P4'] } } },
    ],
    // Adept USB (Cypress FX2). JTAG chain: 0 = FPGA, 1 = XCF04S PROM.
    jtagChain: [{ name: 'xc3s500e/xc3s1200e', role: 'fpga' }, { name: 'xcf04s', role: 'prom' }],
    flash: { type: 'xcf', part: 'xcf04s', xcf: true, verified: true, others: [{ type: 'bpi', part: 'Intel StrataFlash 128 Mbit' }],
      note: 'XCF04S Platform Flash; the 16 MB parallel StrataFlash is shared with the 16 MB Cellular RAM bus.' },
    programmer: {
      preferred: 'djtgcfg',
      tools: {
        djtgcfg: { device: 'Nexys2', position: 0 },
        impact: { cable: 'auto', position: 1, note: 'iMPACT only sees the board through the Digilent plug-in or an external JTAG cable on J5.' },
        xc3sprog: { cable: 'jtaghs1', position: 0, verified: false, onboard: false, note: 'On-board Adept USB is not an FTDI device; use an external FTDI-based cable on the JTAG header.' },
        openFPGALoader: { cable: 'digilent_hs2', position: 0, verified: false, note: 'Only via an external FTDI JTAG cable; the on-board Adept USB is not supported.' },
      },
    },
    source: NEXYS2_UCF,
    resources: [
      { name: 'clk', label: '50 MHz oscillator', pins: ['B8'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', extra: { period: '20 ns' } },
      { name: 'clk1', label: 'Clock socket IC7 (GCLK1)', pins: ['U9'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock' },
      { name: 'led', label: 'LEDs LD0..LD7 (pins for XC3S500E; 1200E variant overrides LD4..LD7)', pins: ['J14', 'J15', 'K15', 'K14', 'E17', 'P15', 'F4', 'R4'], dir: 'out', iostandard: 'LVCMOS33', group: 'LEDs', extra: { activeHigh: true } },
      { name: 'sw', label: 'Slide switches SW0..SW7', pins: ['G18', 'H18', 'K18', 'K17', 'L14', 'L13', 'N17', 'R17'], dir: 'in', iostandard: 'LVCMOS33', group: 'Switches' },
      { name: 'btn', label: 'Push buttons BTN0..BTN3', pins: ['B18', 'D18', 'E18', 'H13'], dir: 'in', iostandard: 'LVCMOS33', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'seg', label: '7-segment cathodes CA..CG (active low)', pins: ['L18', 'F18', 'D17', 'D16', 'G14', 'J17', 'H14'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true, order: 'seg[0]=CA ... seg[6]=CG' } },
      { name: 'dp', label: '7-segment decimal point (active low)', pins: ['C17'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true } },
      { name: 'an', label: '7-segment anodes AN0..AN3 (active low)', pins: ['F17', 'H17', 'C18', 'F15'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true } },
      { name: 'vga_red', label: 'VGA red RED0..RED2', pins: ['R9', 'T8', 'R8'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_green', label: 'VGA green GRN0..GRN2', pins: ['N8', 'P8', 'P6'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_blue', label: 'VGA blue BLU1..BLU2 (2 bits)', pins: ['U5', 'U4'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_hsync', label: 'VGA HSYNC', pins: ['T4'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_vsync', label: 'VGA VSYNC', pins: ['U3'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'ps2_clk', label: 'PS/2 clock', pins: ['R12'], dir: 'inout', iostandard: 'LVCMOS33', group: 'PS/2' },
      { name: 'ps2_data', label: 'PS/2 data', pins: ['P11'], dir: 'inout', iostandard: 'LVCMOS33', group: 'PS/2' },
      { name: 'rs232_rx', label: 'RS-232 RXD', pins: ['U6'], dir: 'in', iostandard: 'LVCMOS33', group: 'RS-232' },
      { name: 'rs232_tx', label: 'RS-232 TXD', pins: ['P9'], dir: 'out', iostandard: 'LVCMOS33', group: 'RS-232' },
      { name: 'ja', label: 'Pmod JA (JA1-4, JA7-10)', pins: ['L15', 'K12', 'L17', 'M15', 'K13', 'L16', 'M14', 'M16'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'jb', label: 'Pmod JB (JB1-4, JB7-10)', pins: ['M13', 'R18', 'R15', 'T17', 'P17', 'R16', 'T18', 'U18'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'jc', label: 'Pmod JC (JC1-4, JC7-10)', pins: ['G15', 'J16', 'G13', 'H16', 'H15', 'F14', 'G16', 'J12'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
    ],
  },
  // ===========================================================================================
  // Boards added with multi-family support. jtagChain is listed in TDI->TDO order (iMPACT
  // numbering: entry 0 = iMPACT position 1).
  // ===========================================================================================
  {
    id: 'nexys3',
    name: 'Digilent Nexys3',
    vendor: 'Digilent',
    device: { family: 'spartan6', part: 'xc6slx16', package: 'csg324', speed: '-3' },
    // Adept USB2 (Cypress FX2, Digilent firmware). Only the FPGA is in the JTAG chain.
    jtagChain: [{ name: 'xc6slx16', role: 'fpga' }],
    flash: { type: 'bpi', part: '128 Mbit Micron/Numonyx parallel PCM (BPI) + 128 Mbit quad-SPI PCM', xcf: false, verified: false,
      note: 'No Platform Flash: configure from the parallel PCM (BPI) or the quad-SPI PCM; program them with Digilent Adept or iMPACT indirect programming.' },
    programmer: {
      preferred: 'djtgcfg',
      tools: {
        djtgcfg: { device: 'Nexys3', position: 0, onboard: true },
        impact: { cable: 'auto', position: 1, note: 'iMPACT only sees the board through the Digilent plug-in or an external JTAG cable.' },
        xc3sprog: { cable: 'jtaghs1', position: 0, verified: false, onboard: false, note: 'On-board Adept USB is not an FTDI device; use an external FTDI-based cable on the JTAG header.' },
        openFPGALoader: { cable: 'digilent_hs2', position: 0, verified: false, onboard: false, note: 'Only via an external FTDI JTAG cable; the on-board Adept USB (FX2) is not supported.' },
      },
    },
    source: NEXYS3_UCF,
    sourceUrl: 'https://gist.github.com/kf4x/7406106 (verbatim copy of Digilent Nexys3_Master.ucf, rev B); cross-checked with https://gist.github.com/Gnnng/e276926e8fd323b988e6',
    resources: [
      { name: 'clk', label: '100 MHz oscillator (GCLK)', pins: ['V10'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', extra: { period: '10 ns' } },
      { name: 'led', label: 'LEDs LD0..LD7', pins: ['U16', 'V16', 'U15', 'V15', 'M11', 'N11', 'R11', 'T11'], dir: 'out', iostandard: 'LVCMOS33', group: 'LEDs', extra: { activeHigh: true } },
      { name: 'sw', label: 'Slide switches SW0..SW7', pins: ['T10', 'T9', 'V9', 'M8', 'N8', 'U8', 'V8', 'T5'], dir: 'in', iostandard: 'LVCMOS33', group: 'Switches' },
      { name: 'btn', label: 'Push buttons BTNS (centre), BTNU, BTNL, BTND, BTNR', pins: ['B8', 'A8', 'C4', 'C9', 'D9'], dir: 'in', iostandard: 'LVCMOS33', group: 'Buttons', extra: { activeHigh: true, order: 'btn[0]=BTNS btn[1]=BTNU btn[2]=BTNL btn[3]=BTND btn[4]=BTNR' } },
      { name: 'seg', label: '7-segment cathodes CA..CG (active low)', pins: ['T17', 'T18', 'U17', 'U18', 'M14', 'N14', 'L14'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true, order: 'seg[0]=CA ... seg[6]=CG' } },
      { name: 'dp', label: '7-segment decimal point (active low)', pins: ['M13'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true } },
      { name: 'an', label: '7-segment anodes AN0..AN3 (active low)', pins: ['N16', 'N15', 'P18', 'P17'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true } },
      { name: 'vga_red', label: 'VGA red RED0..RED2', pins: ['U7', 'V7', 'N7'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_green', label: 'VGA green GRN0..GRN2', pins: ['P8', 'T6', 'V6'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_blue', label: 'VGA blue BLU1..BLU2 (2 bits)', pins: ['R7', 'T7'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_hsync', label: 'VGA HSYNC', pins: ['N6'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_vsync', label: 'VGA VSYNC', pins: ['P7'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'uart_rx', label: 'USB-UART RXD (MCU-RX, into FPGA)', pins: ['N17'], dir: 'in', iostandard: 'LVCMOS33', group: 'USB-UART' },
      { name: 'uart_tx', label: 'USB-UART TXD (MCU-TX, from FPGA)', pins: ['N18'], dir: 'out', iostandard: 'LVCMOS33', group: 'USB-UART' },
      { name: 'ps2_kbd_clk', label: 'USB HID host (PIC24) keyboard PS/2 clock', pins: ['L12'], dir: 'inout', iostandard: 'LVCMOS33', group: 'PS/2 (USB HID)' },
      { name: 'ps2_kbd_data', label: 'USB HID host (PIC24) keyboard PS/2 data', pins: ['J13'], dir: 'inout', iostandard: 'LVCMOS33', group: 'PS/2 (USB HID)' },
      { name: 'ps2_mouse_clk', label: 'USB HID host (PIC24) mouse PS/2 clock', pins: ['L13'], dir: 'inout', iostandard: 'LVCMOS33', group: 'PS/2 (USB HID)' },
      { name: 'ps2_mouse_data', label: 'USB HID host (PIC24) mouse PS/2 data', pins: ['K14'], dir: 'inout', iostandard: 'LVCMOS33', group: 'PS/2 (USB HID)' },
      { name: 'ja', label: 'Pmod JA (JA1-4, JA7-10)', pins: ['T12', 'V12', 'N10', 'P11', 'M10', 'N9', 'U11', 'V11'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'jb', label: 'Pmod JB (JB1-4, JB7-10)', pins: ['K2', 'K1', 'L4', 'L3', 'J3', 'J1', 'K3', 'K5'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'jc', label: 'Pmod JC (JC1-4, JC7-10)', pins: ['H3', 'L7', 'K6', 'G3', 'G1', 'J7', 'J6', 'F2'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'jd', label: 'Pmod JD (JD1-4, JD7-10; XC6SLX16 die only)', pins: ['G11', 'F10', 'F11', 'E11', 'D12', 'C12', 'F12', 'E12'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod' },
      { name: 'exp_io_p', label: 'VHDCI EXP-IO1_P..EXP-IO20_P', pins: ['B2', 'D6', 'B3', 'B4', 'C5', 'B6', 'C7', 'D8', 'B9', 'D11', 'C10', 'G9', 'B11', 'B12', 'C13', 'B14', 'F13', 'C15', 'D14', 'B16'], dir: 'inout', iostandard: 'LVCMOS33', group: 'VHDCI' },
      { name: 'exp_io_n', label: 'VHDCI EXP-IO1_N..EXP-IO20_N', pins: ['A2', 'C6', 'A3', 'A4', 'A5', 'A6', 'A7', 'C8', 'A9', 'C11', 'A10', 'F9', 'A11', 'A12', 'A13', 'A14', 'E13', 'A15', 'C14', 'A16'], dir: 'inout', iostandard: 'LVCMOS33', group: 'VHDCI' },
    ],
  },
  {
    id: 'atlys',
    name: 'Digilent Atlys',
    vendor: 'Digilent',
    device: { family: 'spartan6', part: 'xc6slx45', package: 'csg324', speed: '-3' },
    deviceNotes: 'FPGA bank voltages (Atlys reference manual): banks 0 and 1 = 3.3V, bank 2 = 2.5V or 3.3V selected by JP12 (VHDCI, Pmod, SW4-6, LD7, reset button), bank 3 = 1.8V (DDR2; BTNU/L/D/R/C and SW7 are also on bank 3).',
    jtagChain: [{ name: 'xc6slx45', role: 'fpga' }],
    flash: { type: 'spi', part: 'n25q128', sizeMbit: 128, xcf: false, verified: true, note: 'Numonyx N25Q128 quad SPI flash (Atlys reference manual section 5); program with Adept or iMPACT indirect SPI.' },
    programmer: {
      preferred: 'djtgcfg',
      tools: {
        djtgcfg: { device: 'Atlys', position: 0, onboard: true },
        impact: { cable: 'auto', position: 1, note: 'iMPACT only sees the board through the Digilent plug-in or an external JTAG cable.' },
        xc3sprog: { cable: 'jtaghs1', position: 0, verified: false, onboard: false, note: 'On-board Adept USB is not an FTDI device; use an external FTDI-based cable.' },
        openFPGALoader: { cable: 'digilent_hs2', position: 0, verified: false, onboard: false, note: 'Only via an external FTDI JTAG cable; the on-board Adept USB (FX2) is not supported.' },
      },
    },
    source: ATLYS_UCF,
    sourceUrl: 'https://raw.githubusercontent.com/toddbranch/ECE383/master/datasheets/AtlysGeneral.ucf (verbatim copy of Digilent AtlysGeneral.ucf, rev C; identical to the copy in lcbcFoo/ReonV)',
    resources: [
      { name: 'clk', label: '100 MHz oscillator (GCLK)', pins: ['L15'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', extra: { period: '10 ns' } },
      { name: 'led', label: 'LEDs LD0..LD7 (LD7 on bank 2)', pins: ['U18', 'M14', 'N14', 'L14', 'M13', 'D4', 'P16', 'N12'], dir: 'out', iostandard: 'LVCMOS33', group: 'LEDs', extra: { activeHigh: true } },
      { name: 'sw', label: 'Slide switches SW0..SW7 (SW4-6 bank 2, SW7 bank 3)', pins: ['A10', 'D14', 'C14', 'P15', 'P12', 'R5', 'T5', 'E4'], dir: 'in', iostandard: 'LVCMOS33', group: 'Switches', iostandardVerified: false },
      { name: 'btn', label: 'Push buttons BTNU, BTNL, BTND, BTNR, BTNC (bank 3, 1.8V)', pins: ['N4', 'P4', 'P3', 'F6', 'F5'], dir: 'in', iostandard: 'LVCMOS18', group: 'Buttons', iostandardVerified: false, extra: { activeHigh: true, order: 'btn[0]=BTNU btn[1]=BTNL btn[2]=BTND btn[3]=BTNR btn[4]=BTNC' } },
      { name: 'btn_reset', label: 'RESET push button (M0/RESET, bank 2)', pins: ['T15'], dir: 'in', iostandard: 'LVCMOS33', group: 'Buttons', iostandardVerified: false },
      { name: 'uart_rx', label: 'USB-UART RXD (into FPGA)', pins: ['A16'], dir: 'in', iostandard: 'LVCMOS33', group: 'USB-UART' },
      { name: 'uart_tx', label: 'USB-UART TXD (from FPGA)', pins: ['B16'], dir: 'out', iostandard: 'LVCMOS33', group: 'USB-UART' },
      { name: 'ac97_bitclk', label: 'AC97 codec BIT_CLK', pins: ['L13'], dir: 'in', iostandard: 'LVCMOS33', group: 'Audio (AC97)' },
      { name: 'ac97_sdi', label: 'AC97 codec SDATA_IN (codec -> FPGA)', pins: ['T18'], dir: 'in', iostandard: 'LVCMOS33', group: 'Audio (AC97)' },
      { name: 'ac97_sdo', label: 'AC97 codec SDATA_OUT (FPGA -> codec)', pins: ['N16'], dir: 'out', iostandard: 'LVCMOS33', group: 'Audio (AC97)' },
      { name: 'ac97_sync', label: 'AC97 codec SYNC', pins: ['U17'], dir: 'out', iostandard: 'LVCMOS33', group: 'Audio (AC97)' },
      { name: 'ac97_reset', label: 'AC97 codec RESET', pins: ['T17'], dir: 'out', iostandard: 'LVCMOS33', group: 'Audio (AC97)' },
      { name: 'ja', label: 'Pmod JA (JA1-4, JA7-10; "JB" in the Digilent UCF; bank 2)', pins: ['T3', 'R3', 'P6', 'N5', 'V9', 'T9', 'V4', 'T4'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Pmod', iostandardVerified: false },
      { name: 'vhdci_io1', label: 'VHDCI channel 1 (EXP-IO1_P..EXP-IO20_P; bank 2)', pins: ['U16', 'U15', 'U13', 'M11', 'R11', 'T12', 'N10', 'M10', 'U11', 'R10', 'U10', 'R8', 'M8', 'U8', 'U7', 'N7', 'T6', 'R7', 'N6', 'U5'], dir: 'inout', iostandard: 'LVCMOS33', group: 'VHDCI', iostandardVerified: false },
      { name: 'vhdci_io2', label: 'VHDCI channel 2 (EXP-IO1_N..EXP-IO20_N; bank 2)', pins: ['V16', 'V15', 'V13', 'N11', 'T11', 'V12', 'P11', 'N9', 'V11', 'T10', 'V10', 'T8', 'N8', 'V8', 'V7', 'P8', 'V6', 'T7', 'P7', 'V5'], dir: 'inout', iostandard: 'LVCMOS33', group: 'VHDCI', iostandardVerified: false },
    ],
  },
  {
    id: 'mimas-v2',
    name: 'Numato Mimas V2',
    vendor: 'Numato Lab',
    device: { family: 'spartan6', part: 'xc6slx9', package: 'csg324', speed: '-2' },
    deviceNotes: 'Numato documents the FPGA as XC6SLX9 in CSG324; the -2 speed grade is the commonly used setting (check your chip marking).',
    speedVerified: false,
    jtagChain: [{ name: 'xc6slx9', role: 'fpga' }],
    flash: { type: 'spi', part: 'm25p16', sizeMbit: 16, xcf: false, verified: true, note: 'Written through the on-board USB (PIC18 USB-serial) with Numato\'s MimasV2Config tool; JTAG programming needs an external cable on the JTAG header.' },
    programmer: {
      preferred: 'impact',
      vendorTool: {
        name: 'MimasV2Config (Numato)', onboard: true,
        command: 'python -m MimasV2.Config <SERIAL_PORT> <design.bin>',
        url: 'https://github.com/numato/samplecode/tree/master/FPGA/MimasV2/tools/configuration/python',
        note: 'Programs the SPI flash with a .bin file (generate with bitgen -g Binary:yes) over the board\'s USB serial port. Not a JTAG tool.',
      },
      tools: {
        impact: { cable: 'auto', position: 1, onboard: false, note: 'Needs an external Xilinx/Digilent JTAG cable on the JTAG header; the on-board USB only reaches the SPI flash (vendorTool).' },
        openFPGALoader: { cable: 'digilent_hs2', position: 0, onboard: false, verified: false, note: 'Only via an external FTDI JTAG cable on the JTAG header.' },
        xc3sprog: { cable: 'jtaghs2', position: 0, onboard: false, verified: false, note: 'Only via an external FTDI JTAG cable on the JTAG header.' },
      },
    },
    source: MIMASV2_UCF,
    sourceUrl: 'https://github.com/numato/samplecode/blob/master/FPGA/MimasV2/mimasV2Demo/ucf/MimasV2.ucf (+ mimasV2UartDemo/ucf/mimasV2.ucf for the UART TX pin)',
    resources: [
      { name: 'clk', label: '100 MHz oscillator', pins: ['V10'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', extra: { period: '10 ns' } },
      { name: 'led', label: 'LEDs LED0..LED7', pins: ['P15', 'P16', 'N15', 'N16', 'U17', 'U18', 'T17', 'T18'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'LEDs', extra: { activeHigh: true } },
      { name: 'dip', label: 'DIP switches DPSwitch0..7', pins: ['C17', 'C18', 'D17', 'D18', 'E18', 'E16', 'F18', 'F17'], dir: 'in', iostandard: 'LVCMOS33', pull: 'up', group: 'Switches' },
      { name: 'btn', label: 'Push buttons Switch0..5', pins: ['M18', 'L18', 'M16', 'L17', 'K17', 'K18'], dir: 'in', iostandard: 'LVCMOS33', pull: 'up', group: 'Buttons' },
      { name: 'seg', label: '7-segment segments SevenSegment[0..7] (Numato UCF order)', pins: ['A5', 'C6', 'D6', 'C5', 'C4', 'A4', 'B4', 'A3'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: '7-segment' },
      { name: 'seg_en', label: '7-segment digit enables SevenSegmentEnable[0..2]', pins: ['B2', 'A2', 'B3'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: '7-segment' },
      { name: 'audio', label: 'Audio out Audio1, Audio2', pins: ['B16', 'A16'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'Audio' },
      { name: 'vga_red', label: 'VGA red Red[0..2]', pins: ['A9', 'B9', 'C9'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_green', label: 'VGA green Green[0..2]', pins: ['C10', 'A10', 'C11'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_blue', label: 'VGA blue Blue[1..2] (2 bits)', pins: ['B11', 'A11'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_hsync', label: 'VGA HSync', pins: ['B12'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_vsync', label: 'VGA VSync', pins: ['A12'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'uart_tx', label: 'USB-UART TX (from FPGA, via the on-board USB microcontroller)', pins: ['B8'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'USB-UART' },
      { name: 'io_p6', label: 'Header P6 IO_P6[0..7]', pins: ['U7', 'V7', 'T4', 'V4', 'U5', 'V5', 'R3', 'T3'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Headers' },
      { name: 'io_p7', label: 'Header P7 IO_P7[0..7]', pins: ['U8', 'V8', 'R8', 'T8', 'R5', 'T5', 'T9', 'V9'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Headers' },
      { name: 'io_p8', label: 'Header P8 IO_P8[0..7]', pins: ['R11', 'T11', 'R10', 'T10', 'U13', 'V13', 'U11', 'V11'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Headers' },
      { name: 'io_p9', label: 'Header P9 IO_P9[0..7]', pins: ['H17', 'H18', 'J16', 'J18', 'K15', 'K16', 'L15', 'L16'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Headers' },
    ],
  },
  {
    id: 'cmod-s6',
    name: 'Digilent Cmod S6',
    vendor: 'Digilent',
    device: { family: 'spartan6', part: 'xc6slx4', package: 'cpg196', speed: '-2' },
    deviceNotes: 'Device/speed grade taken from the board description; not cross-checked against Digilent\'s reference manual (the digilent.com reference site could not be fetched).',
    speedVerified: false,
    jtagChain: [{ name: 'xc6slx4', role: 'fpga' }],
    flash: { type: 'spi', part: null, xcf: false, verified: false, note: 'Quad-SPI configuration flash (part number not verified).' },
    programmer: {
      preferred: 'djtgcfg',
      tools: {
        djtgcfg: { device: 'CmodS6', position: 0, onboard: true, verified: false, note: 'Device name not verified; list attached boards with "djtgcfg enum".' },
        impact: { cable: 'auto', position: 1, note: 'iMPACT only sees the board through the Digilent plug-in.' },
        openFPGALoader: { cable: 'digilent', position: 0, onboard: false, verified: false, note: 'Not in openFPGALoader\'s board list; untested.' },
      },
    },
    source: CMODS6_UCF,
    sourceUrl: 'https://github.com/ZipCPU/s6soc/blob/master/cmod.ucf (derived from Digilent\'s Cmod S6 master UCF; not the official file)',
    resources: [
      { name: 'clk', label: '8 MHz oscillator (FPGA_GCLK)', pins: ['N8'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', verified: false, extra: { period: '125 ns' } },
      { name: 'led', label: 'LEDs LD0..LD3', pins: ['N3', 'P3', 'N4', 'P4'], dir: 'out', iostandard: 'LVCMOS33', group: 'LEDs', verified: false },
      { name: 'btn', label: 'Push buttons BTN0..BTN1', pins: ['P8', 'P9'], dir: 'in', iostandard: 'LVCMOS33', group: 'Buttons', verified: false },
    ],
  },
  {
    id: 's3a-starter',
    name: 'Xilinx Spartan-3A Starter Kit',
    vendor: 'Xilinx',
    device: { family: 'spartan3a', part: 'xc3s700a', package: 'fg484', speed: '-4' },
    variants: [
      { id: '700a', label: 'Spartan-3A Starter Kit (XC3S700A)', device: { family: 'spartan3a', part: 'xc3s700a', package: 'fg484', speed: '-4' }, default: true },
      { id: '700an', label: 'Spartan-3AN Starter Kit (XC3S700AN)', device: { family: 'spartan3a', part: 'xc3s700an', package: 'fgg484', speed: '-4' } },
    ],
    // UG334 fig. 12-17: iMPACT shows the XC3S700A(N) followed by the XCF04S Platform Flash.
    jtagChain: [{ name: 'xc3s700a/xc3s700an', role: 'fpga' }, { name: 'xcf04s', role: 'prom' }],
    flash: { type: 'xcf', part: 'xcf04s', xcf: true, verified: true,
      others: [{ type: 'spi', part: 'm25p16' }, { type: 'spi', part: 'at45db161d' }, { type: 'bpi', part: 'm29dw323dt' }],
      note: 'XCF04S Platform Flash (enable with J46, Master Serial mode); also 16 Mbit SPI (M25P16 / AT45DB161D, selected by J1) and 32 Mbit parallel NOR (BPI).' },
    programmer: {
      preferred: 'impact',
      tools: {
        impact: { cable: 'auto', position: 1, onboard: true },
        xc3sprog: { cable: 'xpc', position: 0, note: 'Embedded Platform Cable needs its firmware loaded (fxload xusb_emb.hex) on Linux.' },
        openFPGALoader: { cable: 'xilinxPlatformCableUsb', position: 0, verified: false, onboard: false, note: 'The kit\'s embedded Platform Cable USB is not a supported openFPGALoader cable; use an external JTAG cable.' },
      },
    },
    source: S3A_UCF,
    sourceUrl: 'Xilinx UG334 v1.1 "Spartan-3A/3AN FPGA Starter Kit Board User Guide" UCF listings (https://docs.amd.com/v/u/en-US/ug334)',
    resources: [
      { name: 'clk', label: '50 MHz oscillator', pins: ['E12'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', extra: { period: '20 ns' } },
      { name: 'clk_aux', label: 'Auxiliary clock socket', pins: ['V12'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock' },
      { name: 'clk_sma', label: 'SMA clock input', pins: ['U12'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock' },
      { name: 'led', label: 'LEDs LD0..LD7', pins: ['R20', 'T19', 'U20', 'U19', 'V19', 'V20', 'Y22', 'W21'], dir: 'out', iostandard: 'LVCMOS33', slew: 'slow', drive: 8, group: 'LEDs', extra: { activeHigh: true } },
      { name: 'sw', label: 'Slide switches SW0..SW3', pins: ['V8', 'U10', 'U8', 'T9'], dir: 'in', iostandard: 'LVCMOS33', group: 'Switches' },
      { name: 'btn_east', label: 'Push button EAST', pins: ['T16'], dir: 'in', iostandard: 'LVCMOS33', pull: 'down', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'btn_north', label: 'Push button NORTH', pins: ['T14'], dir: 'in', iostandard: 'LVCMOS33', pull: 'down', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'btn_south', label: 'Push button SOUTH', pins: ['T15'], dir: 'in', iostandard: 'LVCMOS33', pull: 'down', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'btn_west', label: 'Push button WEST', pins: ['U15'], dir: 'in', iostandard: 'LVCMOS33', pull: 'down', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'rot_a', label: 'Rotary encoder A', pins: ['T13'], dir: 'in', iostandard: 'LVCMOS33', pull: 'up', group: 'Rotary encoder' },
      { name: 'rot_b', label: 'Rotary encoder B', pins: ['R14'], dir: 'in', iostandard: 'LVCMOS33', pull: 'up', group: 'Rotary encoder' },
      { name: 'rot_center', label: 'Rotary encoder push', pins: ['R13'], dir: 'in', iostandard: 'LVCMOS33', pull: 'down', group: 'Rotary encoder' },
      { name: 'lcd_e', label: 'LCD enable', pins: ['AB4'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'LCD' },
      { name: 'lcd_rs', label: 'LCD register select', pins: ['Y14'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'LCD' },
      { name: 'lcd_rw', label: 'LCD read/write', pins: ['W13'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'LCD' },
      { name: 'lcd_db', label: 'LCD data DB0..DB7 (drive DB0..DB3 high in 4-bit mode)', pins: ['Y13', 'AB18', 'AB17', 'AB12', 'AA12', 'Y16', 'AB16', 'Y15'], dir: 'inout', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'LCD' },
      { name: 'vga_red', label: 'VGA red R0..R3', pins: ['A3', 'B3', 'B8', 'C8'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_green', label: 'VGA green G0..G3', pins: ['C5', 'D5', 'C6', 'D6'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_blue', label: 'VGA blue B0..B3', pins: ['C7', 'D7', 'B9', 'C9'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_hsync', label: 'VGA HSYNC', pins: ['C11'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'vga_vsync', label: 'VGA VSYNC', pins: ['B11'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'VGA' },
      { name: 'rs232_dce_rxd', label: 'RS-232 DCE (female) RXD', pins: ['E16'], dir: 'in', iostandard: 'LVCMOS33', group: 'RS-232' },
      { name: 'rs232_dce_txd', label: 'RS-232 DCE (female) TXD', pins: ['F15'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'RS-232' },
      { name: 'rs232_dte_rxd', label: 'RS-232 DTE (male) RXD', pins: ['F16'], dir: 'in', iostandard: 'LVCMOS33', group: 'RS-232' },
      { name: 'rs232_dte_txd', label: 'RS-232 DTE (male) TXD', pins: ['E15'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'RS-232' },
      { name: 'ps2_clk', label: 'PS/2 port 1 clock', pins: ['W12'], dir: 'inout', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'PS/2' },
      { name: 'ps2_data', label: 'PS/2 port 1 data', pins: ['V11'], dir: 'inout', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'PS/2' },
      { name: 'ps2_clk2', label: 'PS/2 port 2 clock (Y-splitter)', pins: ['U11'], dir: 'inout', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'PS/2' },
      { name: 'ps2_data2', label: 'PS/2 port 2 data (Y-splitter)', pins: ['Y12'], dir: 'inout', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'PS/2' },
      { name: 'aud', label: 'Audio jack AUD_L, AUD_R', pins: ['Y10', 'V10'], dir: 'out', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'Audio' },
      { name: 'j19_io', label: 'Header J19 J19_IO<1..4>', pins: ['Y18', 'W18', 'V17', 'W17'], dir: 'inout', iostandard: 'LVCMOS33', drive: 8, slew: 'slow', group: 'Headers' },
    ],
  },
  {
    id: 's3-starter',
    name: 'Digilent / Xilinx Spartan-3 Starter Board',
    vendor: 'Digilent / Xilinx',
    device: { family: 'spartan3', part: 'xc3s200', package: 'ft256', speed: '-4' },
    variants: [
      { id: '200', label: 'Spartan-3 Starter Board (XC3S200)', device: { family: 'spartan3', part: 'xc3s200', package: 'ft256', speed: '-4' }, default: true },
      { id: '1000', label: 'Spartan-3 Starter Board, 1000K version (XC3S1000)', device: { family: 'spartan3', part: 'xc3s1000', package: 'ft256', speed: '-4' }, verified: false,
        note: 'The 1000K kit ships an XCF04S instead of the XCF02S (not verified).' },
    ],
    deviceNotes: 'All FPGA I/O banks are powered at 3.3V; UG130 gives no IOSTANDARD, LVCMOS33 is used.',
    // UG130 fig. 11-1: TDI -> Spartan-3 FPGA -> XCF02S Platform Flash -> TDO.
    jtagChain: [{ name: 'xc3s200/xc3s1000', role: 'fpga' }, { name: 'xcf02s', role: 'prom' }],
    flash: { type: 'xcf', part: 'xcf02s', xcf: true, verified: true, note: 'XCF02S Platform Flash (JP1 selects default/flexible modes); 1000K variant: XCF04S (unverified).' },
    programmer: {
      preferred: 'impact',
      tools: {
        impact: { cable: 'auto', position: 1, onboard: false, note: 'No USB on the board: use the included Digilent JTAG3 parallel cable (J7), a Parallel Cable IV (J5) or a Platform Cable USB.' },
        xc3sprog: { cable: 'pp', position: 0, onboard: false, verified: false, note: 'Parallel-port cable (JTAG3/Parallel Cable III) or an external FTDI cable.' },
        openFPGALoader: { cable: 'digilent_hs2', position: 0, onboard: false, verified: false, note: 'Only via an external FTDI JTAG cable wired to J7.' },
      },
    },
    source: S3_UCF,
    sourceUrl: 'Xilinx UG130 v1.2 "Spartan-3 FPGA Starter Kit Board User Guide" pin tables 3-1, 3-2, 4-1..4-3, 5-1, 6-1, 7-1, 8-1 (https://docs.amd.com/v/u/en-US/ug130)',
    resources: [
      { name: 'clk', label: '50 MHz oscillator (IC4)', pins: ['T9'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', extra: { period: '20 ns' } },
      { name: 'clk_aux', label: 'Oscillator socket (IC8)', pins: ['D9'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock' },
      { name: 'led', label: 'LEDs LD0..LD7', pins: ['K12', 'P14', 'L12', 'N14', 'P13', 'N12', 'P12', 'P11'], dir: 'out', iostandard: 'LVCMOS33', group: 'LEDs', extra: { activeHigh: true } },
      { name: 'sw', label: 'Slide switches SW0..SW7', pins: ['F12', 'G12', 'H14', 'H13', 'J14', 'J13', 'K14', 'K13'], dir: 'in', iostandard: 'LVCMOS33', group: 'Switches' },
      { name: 'btn', label: 'Push buttons BTN0..BTN3 (BTN3 = user reset)', pins: ['M13', 'M14', 'L13', 'L14'], dir: 'in', iostandard: 'LVCMOS33', group: 'Buttons', extra: { activeHigh: true } },
      { name: 'seg', label: '7-segment cathodes A..G (active low)', pins: ['E14', 'G13', 'N15', 'P15', 'R16', 'F13', 'N16'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true, order: 'seg[0]=A ... seg[6]=G' } },
      { name: 'dp', label: '7-segment decimal point (active low)', pins: ['P16'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true } },
      { name: 'an', label: '7-segment anodes AN0..AN3 (active low)', pins: ['D14', 'G14', 'F14', 'E13'], dir: 'out', iostandard: 'LVCMOS33', group: '7-segment', extra: { activeLow: true } },
      { name: 'vga_red', label: 'VGA red (1 bit)', pins: ['R12'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_green', label: 'VGA green (1 bit)', pins: ['T12'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_blue', label: 'VGA blue (1 bit)', pins: ['R11'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_hsync', label: 'VGA HSYNC', pins: ['R9'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'vga_vsync', label: 'VGA VSYNC', pins: ['T10'], dir: 'out', iostandard: 'LVCMOS33', group: 'VGA' },
      { name: 'ps2_clk', label: 'PS/2 clock', pins: ['M16'], dir: 'inout', iostandard: 'LVCMOS33', group: 'PS/2' },
      { name: 'ps2_data', label: 'PS/2 data', pins: ['M15'], dir: 'inout', iostandard: 'LVCMOS33', group: 'PS/2' },
      { name: 'rs232_rxd', label: 'RS-232 RXD (DB9)', pins: ['T13'], dir: 'in', iostandard: 'LVCMOS33', group: 'RS-232' },
      { name: 'rs232_txd', label: 'RS-232 TXD (DB9)', pins: ['R13'], dir: 'out', iostandard: 'LVCMOS33', group: 'RS-232' },
      { name: 'rs232_rxd_a', label: 'Auxiliary RS-232 RXD-A (J1 stake pins)', pins: ['N10'], dir: 'in', iostandard: 'LVCMOS33', group: 'RS-232' },
      { name: 'rs232_txd_a', label: 'Auxiliary RS-232 TXD-A (J1 stake pins)', pins: ['T14'], dir: 'out', iostandard: 'LVCMOS33', group: 'RS-232' },
    ],
  },
  {
    id: 'papilio-one',
    name: 'Gadget Factory Papilio One',
    vendor: 'Gadget Factory',
    device: { family: 'spartan3e', part: 'xc3s500e', package: 'vq100', speed: '-4' },
    variants: [
      { id: '250', label: 'Papilio One 250K (XC3S250E)', device: { family: 'spartan3e', part: 'xc3s250e', package: 'vq100', speed: '-4' } },
      { id: '500', label: 'Papilio One 500K (XC3S500E)', device: { family: 'spartan3e', part: 'xc3s500e', package: 'vq100', speed: '-4' }, default: true },
    ],
    deviceNotes: 'The UCF targets board revision 2.03+ (32 MHz oscillator; Gadget Factory notes 32 MHz from revision 2.02 on). Older boards used a different oscillator frequency.',
    jtagChain: [{ name: 'xc3s250e/xc3s500e', role: 'fpga' }],
    flash: { type: 'spi', part: null, xcf: false, verified: false, note: 'SPI flash (4 Mbit class, part varies by revision) written via JTAG by papilio-prog / openFPGALoader -f / xc3sprog -I.' },
    programmer: {
      preferred: 'openFPGALoader',
      tools: {
        openFPGALoader: { cable: 'papilio', board: 'papilio_one', position: 0, onboard: true, note: 'On-board FT2232 (channel A = JTAG, channel B = UART). openFPGALoader board "papilio_one" is defined for the XC3S500E; for the 250K use -c papilio.' },
        xc3sprog: { cable: 'papilio', position: 0, onboard: true, note: 'xc3sprog cablelist entry "papilio" (FT2232, 0403:6010).' },
        impact: { cable: 'auto', position: 1, onboard: false, note: 'iMPACT does not drive FTDI cables; use openFPGALoader or xc3sprog.' },
      },
    },
    source: PAPILIO_UCF,
    sourceUrl: 'https://github.com/GadgetFactory/Arduino-Soft-Core/blob/master/sources/Papilio_One.ucf (Jack Gassett, BPC3003_2.03+.ucf)',
    resources: [
      { name: 'clk', label: '32 MHz oscillator', pins: ['P89'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', extra: { period: '31.25 ns' } },
      { name: 'uart_rx', label: 'USB-UART RXD (FT2232 channel B -> FPGA)', pins: ['P88'], dir: 'in', iostandard: 'LVCMOS33', group: 'USB-UART' },
      { name: 'uart_tx', label: 'USB-UART TXD (FPGA -> FT2232 channel B)', pins: ['P90'], dir: 'out', iostandard: 'LVCMOS33', drive: 4, slew: 'slow', group: 'USB-UART' },
      { name: 'wing_a', label: 'Wing A0..A15 (Wing1 column A)', pins: ['P18', 'P23', 'P26', 'P33', 'P35', 'P40', 'P53', 'P57', 'P60', 'P62', 'P65', 'P67', 'P70', 'P79', 'P84', 'P86'], dir: 'inout', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'Wings' },
      { name: 'wing_b', label: 'Wing B0..B15 (Wing1 column B)', pins: ['P85', 'P83', 'P78', 'P71', 'P68', 'P66', 'P63', 'P61', 'P58', 'P54', 'P41', 'P36', 'P34', 'P32', 'P25', 'P22'], dir: 'inout', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'Wings' },
      { name: 'wing_c', label: 'Wing C0..C15 (Wing2 column A)', pins: ['P91', 'P92', 'P94', 'P95', 'P98', 'P2', 'P3', 'P4', 'P5', 'P9', 'P10', 'P11', 'P12', 'P15', 'P16', 'P17'], dir: 'inout', iostandard: 'LVCMOS33', drive: 8, slew: 'fast', group: 'Wings' },
    ],
  },
  {
    id: 'elbert-v2',
    name: 'Numato Elbert V2',
    vendor: 'Numato Lab',
    device: { family: 'spartan3a', part: 'xc3s50a', package: 'tq144', speed: '-4' },
    deviceNotes: 'XC3S50A in TQG144 (ISE package name tq144); -4 per Numato\'s sample projects.',
    jtagChain: [{ name: 'xc3s50a', role: 'fpga' }],
    flash: { type: 'spi', part: 'm25p16', sizeMbit: 16, xcf: false, verified: true, note: 'Written through the on-board USB with Numato\'s Elbert V2 configuration tool (.bin file).' },
    programmer: {
      preferred: 'impact',
      vendorTool: {
        name: 'Elbert V2 Configuration Tool (Numato)', onboard: true,
        url: 'https://github.com/numato/samplecode/tree/master/FPGA/ElbertV2/tools',
        note: 'Programs the SPI flash over the on-board USB with a .bin file (bitgen -g Binary:yes). Not a JTAG tool.',
      },
      tools: {
        impact: { cable: 'auto', position: 1, onboard: false, verified: false, note: 'Needs an external JTAG cable on the board\'s JTAG header (not verified); the on-board USB only reaches the SPI flash (vendorTool).' },
        openFPGALoader: { cable: 'digilent_hs2', position: 0, onboard: false, verified: false, note: 'Only via an external FTDI JTAG cable.' },
        xc3sprog: { cable: 'jtaghs2', position: 0, onboard: false, verified: false, note: 'Only via an external FTDI JTAG cable.' },
      },
    },
    source: ELBERTV2_UCF,
    sourceUrl: 'https://github.com/numato/samplecode/blob/master/FPGA/ElbertV2/elbertV2Demo/ucf/Elbertv2.ucf',
    resources: [
      { name: 'clk', label: '12 MHz oscillator', pins: ['P129'], dir: 'in', iostandard: 'LVCMOS33', group: 'Clock', extra: { period: '83.333 ns' } },
      { name: 'led', label: 'LEDs LED0..LED7', pins: ['P46', 'P47', 'P48', 'P49', 'P50', 'P51', 'P54', 'P55'], dir: 'out', iostandard: 'LVCMOS33', drive: 12, slew: 'slow', group: 'LEDs', extra: { activeHigh: true } },
      { name: 'dip', label: 'DIP switches DPSwitch0..7', pins: ['P70', 'P69', 'P68', 'P64', 'P63', 'P60', 'P59', 'P58'], dir: 'in', iostandard: 'LVCMOS33', pull: 'up', group: 'Switches' },
      { name: 'btn', label: 'Push buttons Switch0..5', pins: ['P80', 'P79', 'P78', 'P77', 'P76', 'P75'], dir: 'in', iostandard: 'LVCMOS33', pull: 'up', group: 'Buttons' },
      { name: 'seg', label: '7-segment segments SevenSegment[0..7] (Numato UCF order)', pins: ['P114', 'P110', 'P111', 'P112', 'P113', 'P115', 'P116', 'P117'], dir: 'out', iostandard: 'LVCMOS33', drive: 12, slew: 'slow', group: '7-segment' },
      { name: 'seg_en', label: '7-segment digit enables Enable[0..2]', pins: ['P120', 'P121', 'P124'], dir: 'out', iostandard: 'LVCMOS33', drive: 12, slew: 'slow', group: '7-segment' },
      { name: 'vga_red', label: 'VGA red Red[0..2]', pins: ['P103', 'P104', 'P105'], dir: 'out', iostandard: 'LVCMOS33', drive: 12, slew: 'slow', group: 'VGA' },
      { name: 'vga_green', label: 'VGA green Green[0..2]', pins: ['P99', 'P101', 'P102'], dir: 'out', iostandard: 'LVCMOS33', drive: 12, slew: 'slow', group: 'VGA' },
      { name: 'vga_blue', label: 'VGA blue Blue[1..2] (2 bits)', pins: ['P96', 'P98'], dir: 'out', iostandard: 'LVCMOS33', drive: 12, slew: 'slow', group: 'VGA' },
      { name: 'vga_hsync', label: 'VGA HSync', pins: ['P93'], dir: 'out', iostandard: 'LVCMOS33', drive: 12, slew: 'slow', group: 'VGA' },
      { name: 'vga_vsync', label: 'VGA VSync', pins: ['P92'], dir: 'out', iostandard: 'LVCMOS33', drive: 12, slew: 'slow', group: 'VGA' },
      { name: 'audio', label: 'Audio AUDIO_L, AUDIO_R', pins: ['P88', 'P87'], dir: 'out', iostandard: 'LVCMOS33', drive: 12, slew: 'slow', group: 'Audio' },
      { name: 'io_p1', label: 'Header P1 IO_P1[0..7]', pins: ['P31', 'P32', 'P28', 'P30', 'P27', 'P29', 'P24', 'P25'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Headers' },
      { name: 'io_p2', label: 'Header P2 IO_P2[0..7]', pins: ['P10', 'P11', 'P7', 'P8', 'P3', 'P5', 'P4', 'P6'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Headers' },
      { name: 'io_p4', label: 'Header P4 IO_P4[0..7]', pins: ['P141', 'P143', 'P138', 'P139', 'P134', 'P135', 'P130', 'P132'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Headers' },
      { name: 'io_p5', label: 'Header P5 IO_P5[0..7]', pins: ['P125', 'P123', 'P127', 'P126', 'P131', 'P91', 'P142', 'P140'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Headers' },
      { name: 'io_p6', label: 'Header P6 IO_P6[0..7]', pins: ['P19', 'P21', 'P18', 'P20', 'P15', 'P16', 'P12', 'P13'], dir: 'inout', iostandard: 'LVCMOS33', group: 'Headers' },
    ],
  },
];

// Every resource above was transcribed from the source UCF named on its board; mark them.
for (const b of BOARDS) for (const r of b.resources) if (r.verified === undefined) r.verified = true;

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
