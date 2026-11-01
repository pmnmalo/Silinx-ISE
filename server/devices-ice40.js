// Silinx - the iCE40 parts (#2295's family in the device database), by nextpnr-ice40's names.
//
// Sources: Lattice FPGA-DS-02029-4.3 (LP/HX), FPGA-DS-02008-2.4 (UltraPlus), FPGA-DS-02028-2.7 (Ultra), Table 2.1 of
// each; the packages are those the data sheet lists and nextpnr-ice40 accepts (--package), named as nextpnr names them.
// ice40u1k, u2k and u4k are Lattice's iCE5LP1K, 2K and 4K. The data sheets give no speed grades. DS-02029's "Maximum
// I/O" row disagrees with its package rows for the LP384, HX1K and HX4K: maxUserIo is the package rows' largest. Its
// CM225 row gives 178 for the LP4K, IceStorm's pin table and the "Maximum I/O" row 167: 167.

const pkgs = o => Object.fromEntries(Object.entries(o).map(([k, userIo]) => [k, { userIo }]));

function ice40(part, { luts, ebr, plls, dsp = 0, spram = 0, maxIo, packages, ...rest }) {
  return {
    part: `ice40${part}`, family: 'ice40', logicCells: luts, slices: Math.ceil(luts / 8), luts, ffs: luts, distRamBits: 0,   // (a slice: a logic block, 8 LUTs)
    brams: ebr, bramSize: 4, bramBits: ebr * 4 * 1024, dsp, multipliers: dsp, dspType: dsp ? 'SB_MAC16' : undefined,
    spram, spramBits: spram * 256 * 1024, dcms: 0, plls, maxUserIo: maxIo, packages: pkgs(packages), speeds: [], ...rest,
  };
}

export const ICE40_FAMILY = {
  id: 'ice40', name: 'iCE40', displayName: 'iCE40', datasheet: 'FPGA-DS-02029 / 02008 / 02028', webpack: false,
  speeds: {}, ioStandards: ['SB_LVCMOS'],
  note: 'Implemented by the open toolchain only (Yosys, nextpnr-ice40, icepack); its constraints are PCF.',
};

export const ICE40_PACKAGES = {
  swg16tr: '16-ball Wafer-Level Chip-Scale (WLCSP)', uwg30: '30-ball Wafer-Level Chip-Scale (WLCSP)', qn32: '32-pad QFN', sg48: '48-pad QFN',
  qn84: '84-pad QFN', cm36: '36-ball Chip-Scale BGA', cm49: '49-ball Chip-Scale BGA', cm81: '81-ball Chip-Scale BGA', cm121: '121-ball Chip-Scale BGA',
  cm225: '225-ball Chip-Scale BGA', cb81: '81-ball Chip-Scale BGA', cb121: '121-ball Chip-Scale BGA', cb132: '132-ball Chip-Scale BGA',
  bg121: '121-ball Fine-Pitch BGA', ct256: '256-ball Fine-Pitch BGA', vq100: '100-pin Very Thin Quad Flat Pack (VQFP)', tq144: '144-pin Thin Quad Flat Pack (TQFP)',
};

export const ICE40_DEVICES = [
  ice40('lp384', { luts: 384, ebr: 0, plls: 0, maxIo: 37, packages: { qn32: 21, cm36: 25, cm49: 37 } }),
  ice40('lp1k', { luts: 1280, ebr: 16, plls: 1, maxIo: 95, packages: { swg16tr: 10, cm36: 25, cm49: 35, cm81: 63, cm121: 95, cb81: 62, cb121: 92, qn84: 67 } }),
  ice40('lp4k', { luts: 3520, ebr: 20, plls: 2, maxIo: 167, packages: { cm81: 63, cm121: 93, cm225: 167 } }),
  ice40('lp8k', { luts: 7680, ebr: 32, plls: 2, maxIo: 178, packages: { cm81: 63, cm121: 93, cm225: 178 } }),
  ice40('hx1k', { luts: 1280, ebr: 16, plls: 1, maxIo: 96, packages: { vq100: 72, cb132: 95, tq144: 96 } }),
  ice40('hx4k', { luts: 3520, ebr: 20, plls: 2, maxIo: 107, packages: { bg121: 93, cb132: 95, tq144: 107 } }),
  ice40('hx8k', { luts: 7680, ebr: 32, plls: 2, maxIo: 206, packages: { bg121: 93, cb132: 95, cm225: 178, ct256: 206 } }),
  ice40('up3k', { luts: 2800, ebr: 20, plls: 1, dsp: 4, spram: 4, maxIo: 21, packages: { uwg30: 21 } }),
  ice40('up5k', { luts: 5280, ebr: 30, plls: 1, dsp: 8, spram: 4, maxIo: 39, packages: { uwg30: 21, sg48: 39 } }),
  ice40('u1k', { luts: 1100, ebr: 16, plls: 1, dsp: 2, maxIo: 39, packages: { sg48: 39 } }),
  ice40('u2k', { luts: 2048, ebr: 20, plls: 1, dsp: 4, maxIo: 39, packages: { sg48: 39 } }),
  ice40('u4k', { luts: 3520, ebr: 20, plls: 1, dsp: 4, maxIo: 39, packages: { sg48: 39 } }),
];
