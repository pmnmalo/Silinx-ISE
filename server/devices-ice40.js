// The iCE40's parts (#2461), a family with no ISE: its own back end (packages/silinx-fpga/src/open-flow-ice40.js).
//
// Sources: Lattice FPGA-DS-02029 (iCE40 LP/HX) and FPGA-DS-02008 (iCE40 UltraPlus) for the logic cells, the 4 Kb block RAMs,
// the DSPs, the SPRAMs and the PLLs; the packages and each one's user I/O from nextpnr-ice40's own chip database, which
// test/devices-ice40.test.js asks again. A part has no speed grades here: nextpnr-ice40 has none. iCE5LP (u1k, u2k, u4k) is left out.
const ice40 = (part, { cells, ram = 0, dsp = 0, spram = 0, plls = 0, packages }) => ({
  family: 'ice40', part, logicCells: cells, slices: cells / 8, luts: cells, ffs: cells, brams: ram, bramBits: ram * 4096, multipliers: dsp, spram, dcms: plls,
  maxUserIo: Math.max(...Object.values(packages)), packages: Object.fromEntries(Object.entries(packages).map(([k, userIo]) => [k, { userIo }])), speeds: [],
});

export const ICE40_FAMILY = {
  id: 'ice40', name: 'iCE40', displayName: 'iCE40', xiseFamily: null, xiseVerified: false, webpack: false,
  datasheet: 'Lattice FPGA-DS-02029 / FPGA-DS-02008', speeds: {}, ioStandards: ['SB_LVCMOS'],
  note: 'Lattice iCE40, through nextpnr-ice40 and icepack; no ISE.',
};

export const ICE40_DEVICES = [
  ice40('ice40lp384', { cells: 384, packages: { qn32: 21, cm36: 25, cm49: 37 } }),
  ice40('ice40lp1k', { cells: 1280, ram: 16, plls: 1, packages: { swg16tr: 10, cm36: 25, cm49: 35, cm81: 63, cb81: 62, qn84: 67, cm121: 95, cb121: 92 } }),
  ice40('ice40lp4k', { cells: 3520, ram: 20, plls: 2, packages: { cm81: 63, cm121: 93, cm225: 167 } }),
  ice40('ice40lp8k', { cells: 7680, ram: 32, plls: 2, packages: { cm81: 63, cm121: 93, cm225: 178 } }),
  ice40('ice40hx1k', { cells: 1280, ram: 16, plls: 1, packages: { vq100: 72, cb132: 95, tq144: 96 } }),
  ice40('ice40hx4k', { cells: 3520, ram: 20, plls: 2, packages: { bg121: 93, cb132: 95, tq144: 107 } }),
  ice40('ice40hx8k', { cells: 7680, ram: 32, plls: 2, packages: { bg121: 93, cb132: 95, cm225: 178, ct256: 206 } }),
  ice40('ice40up3k', { cells: 2800, ram: 20, dsp: 4, spram: 4, plls: 1, packages: { sg48: 39, uwg30: 21 } }),
  ice40('ice40up5k', { cells: 5280, ram: 30, dsp: 8, spram: 4, plls: 1, packages: { sg48: 39, uwg30: 21 } }),
];

export const ICE40_PACKAGES = {
  swg16tr: '16-ball Wafer-Level Chip-Scale Package', uwg30: '30-ball Wafer-Level Chip-Scale Package', qn32: '32-pin QFN', sg48: '48-pin QFN', qn84: '84-pin QFN',
  cm36: '36-ball ucBGA', cm49: '49-ball ucBGA', cm81: '81-ball ucBGA', cm121: '121-ball ucBGA', cm225: '225-ball ucBGA',
  cb81: '81-ball csBGA', cb121: '121-ball csBGA', cb132: '132-ball csBGA', bg121: '121-ball caBGA', ct256: '256-ball caBGA', vq100: '100-pin VQFP', tq144: '144-pin TQFP',
};
