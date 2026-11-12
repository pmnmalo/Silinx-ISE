// Silinx - the Gowin parts (#2303's family in the device database): the GW1NR-9C of the Tang Nano 9K, the one part whose
// device nextpnr-himbaechel-gowin is given here (packages/silinx-fpga/src/open-flow-gowin.js GOWIN_DEVICES).
//
// Sources: Gowin DS117 (GW1NR series data sheet), Table 1-1 and the package table: the LUT4s, flip-flops, shadow SRAM, the
// 18 Kbit block SRAMs, the 18x18 multipliers, the PLLs and the QN88P's user I/O; nextpnr-himbaechel-gowin's chip database
// counts the same LUT4s, flip-flops, block SRAMs, multipliers and rPLLs. Its speed grade C6/I5, written -6.

export const GOWIN_FAMILY = {
  id: 'gowin', name: 'Gowin GW1N', displayName: 'Gowin GW1N', datasheet: 'DS117', webpack: false,
  speeds: { '-6': 'C6/I5' }, ioStandards: ['LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12', 'LVDS25', 'SSTL15', 'SSTL18_I'],
  note: 'Implemented by the open toolchain only (Yosys, nextpnr-himbaechel-gowin: Project Apicula, and gowin_pack, Silinx\'s port of Apicula\'s); its constraints are CST.',
};

export const GOWIN_PACKAGES = { qn88: '88-pad QFN (QN88P)' };

export const GOWIN_DEVICES_DB = [
  {
    part: 'gw1nr-9c', family: 'gowin', logicCells: 8640, slices: 4320, luts: 8640, ffs: 6480, distRamBits: 17280,   // (a slice of nextpnr's: 2 LUT4s)
    brams: 26, bramSize: 18, bramBits: 26 * 18 * 1024, dsp: 20, multipliers: 20, dspType: 'MULT18X18', dcms: 0, plls: 2,
    maxUserIo: 71, packages: { qn88: { userIo: 71 } }, speeds: ['-6'], psram: '64 Mbit',
  },
];
