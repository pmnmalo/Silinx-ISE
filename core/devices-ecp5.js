// Silinx - the ECP5 parts (#2302's family in the device database), named as Lattice orders them (LFE5U-85F) in lower case.
//
// Sources: Lattice FPGA-DS-02012 (ECP5 and ECP5-5G Family Data Sheet), Table 1.1: the LUTs, the 18 Kbit sysMEM blocks,
// the distributed RAM, the 18x18 multipliers, the PLLs and the user I/O of each package; the LUTs of the 25F, 45F and 85F
// are those nextpnr-ecp5's chip databases count (its TRELLIS_COMB), the 12F's the data sheet's 12K. LFE5UM adds SERDES
// to LFE5U, LFE5UM5G faster SERDES (its speed grade -8 only): the same fabric. The packages as nextpnr-ecp5 names them
// (--package CABGA381), in lower case.

const pkgs = o => Object.fromEntries(Object.entries(o).map(([k, userIo]) => [k, { userIo }]));

const FABRIC = {
  '12f': { luts: 12288, ebr: 32, mult: 28, plls: 2, dramKb: 97, packages: { cabga256: 197, csfbga285: 118, cabga381: 197, tqfp144: 98 } },
  '25f': { luts: 24288, ebr: 56, mult: 28, plls: 2, dramKb: 194, packages: { cabga256: 197, csfbga285: 118, cabga381: 197, tqfp144: 98 } },
  '45f': { luts: 43848, ebr: 108, mult: 72, plls: 4, dramKb: 351, packages: { cabga256: 197, csfbga285: 118, cabga381: 203, cabga554: 245 } },
  '85f': { luts: 83640, ebr: 208, mult: 156, plls: 4, dramKb: 669, packages: { csfbga285: 118, cabga381: 205, cabga554: 259, cabga756: 365 } },
};

function ecp5(prefix, size, speeds) {
  const f = FABRIC[size];
  return {
    part: `${prefix}-${size}`, family: 'ecp5', logicCells: f.luts, slices: f.luts / 2, luts: f.luts, ffs: f.luts, distRamBits: f.dramKb * 1024,   // (a slice: 2 LUT4s, 2 flip-flops)
    brams: f.ebr, bramSize: 18, bramBits: f.ebr * 18 * 1024, dsp: f.mult, multipliers: f.mult, dspType: 'MULT18X18D', dcms: 0, plls: f.plls,
    maxUserIo: Math.max(...Object.values(f.packages)), packages: pkgs(f.packages), speeds,
  };
}

export const ECP5_FAMILY = {
  id: 'ecp5', name: 'ECP5', displayName: 'ECP5', datasheet: 'FPGA-DS-02012', webpack: false,
  speeds: { '-6': 'Standard', '-7': 'Mid', '-8': 'Fastest' }, ioStandards: ['LVCMOS33', 'LVCMOS25', 'LVCMOS18', 'LVCMOS15', 'LVCMOS12', 'LVDS', 'SSTL15_I', 'SSTL135_I'],
  note: 'Implemented by the open toolchain only (Yosys, nextpnr-ecp5, ecppack: Project Trellis); its constraints are LPF.',
};

export const ECP5_PACKAGES = {
  cabga256: '256-ball Chip-Array BGA (caBGA, 14 x 14 mm)', csfbga285: '285-ball Chip-Scale BGA (csfBGA, 10 x 10 mm)', cabga381: '381-ball Chip-Array BGA (caBGA, 17 x 17 mm)',
  cabga554: '554-ball Chip-Array BGA (caBGA, 23 x 23 mm)', cabga756: '756-ball Chip-Array BGA (caBGA, 27 x 27 mm)', tqfp144: '144-pin Thin Quad Flat Pack (TQFP)',
};

const STD = ['-6', '-7', '-8'];
export const ECP5_DEVICES = [
  ...['12f', '25f', '45f', '85f'].map(s => ecp5('lfe5u', s, STD)),
  ...['25f', '45f', '85f'].map(s => ecp5('lfe5um', s, STD)),
  ...['25f', '45f', '85f'].map(s => ecp5('lfe5um5g', s, ['-8'])),
];
