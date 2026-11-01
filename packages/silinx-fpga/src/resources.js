// Silinx - the resources of a device (#790, part of #787): what a part has and how many, the ones every
// family shares (slices, LUTs, flip-flops, distributed RAM, I/O) and the family's own (Spartan-3E's RAMB16,
// MULT18X18SIO, DCM; Spartan-6's RAMB8BWER / RAMB16BWER, DSP48A1, DCM / PLL, BUFIO2 / BUFH, MCB), each with
// the UNISIM primitives that use it. One description read by the schematic library, the templates, the
// wizards, the reports and the checks (#791-#796).
//
// The counts come from the part records of server/devices.js (DS312 / DS160 tables; the page has them as
// S.devices.parts): this module adds what those records lack, the clock buffers of each family and the
// primitive names. The Spartan-3, 3A, 3A DSP and Virtex-4 have the common resources and their global clock
// buffers (#821); a part of another family has the common resources only.
//
// Isomorphic ES module (browser + Node), no DOM.
//
// API:
//   resourcesOf(part, pkg?)        the resources of a part record, in report order, with their counts
//   resourceCount(part, id, pkg?)  the count of one resource on a part (0: none; null: not known)
//   familyResources(family)        the resources of a family, without counts
//   primitivesOf(family)           the primitives of a family that use a counted resource: { name, resource }
//   resourceOfPrimitive(family, n) the resource a primitive uses on a family (null: none counted)
//   RESOURCE_FAMILIES              the families with all their own resources described

const label = (en, pt) => ({ en, pt });

// the names of a group of primitives
const withVariants = (names, suffixes) => names.flatMap(n => suffixes.map(s => n + s));
const FF_PRIMS = [...withVariants(['FD', 'FDC', 'FDCE', 'FDE', 'FDP', 'FDPE', 'FDR', 'FDRE', 'FDS', 'FDSE', 'FDRS', 'FDRSE', 'FDCP', 'FDCPE'], ['', '_1']),
  ...withVariants(['LD', 'LDC', 'LDCE', 'LDE', 'LDP', 'LDPE'], ['', '_1'])];
const luts = n => withVariants(Array.from({ length: n }, (_, i) => `LUT${i + 1}`), ['', '_L', '_D']);
const S3_DRAM_PRIMS = ['RAM16X1S', 'RAM16X1S_1', 'RAM32X1S', 'RAM32X1S_1', 'RAM64X1S', 'RAM64X1S_1', 'RAM16X1D', 'RAM16X1D_1', 'RAM32X1D', 'RAM64X1D',
  'SRL16', 'SRL16_1', 'SRL16E', 'SRL16E_1', 'SRLC16', 'SRLC16_1', 'SRLC16E', 'SRLC16E_1'];
const IO_PRIMS = ['IBUF', 'IBUFG', 'OBUF', 'OBUFT', 'IOBUF', 'IBUF_LVCMOS33', 'IBUFG_LVCMOS33', 'OBUF_LVCMOS33'];
// a Spartan-3 block RAM: RAMB16_S<w> (single port), RAMB16_S<a>_S<b> (dual port, a <= b)
const RAMB16_WIDTHS = [1, 2, 4, 9, 18, 36];
const RAMB16_PRIMS = [...RAMB16_WIDTHS.map(w => `RAMB16_S${w}`),
  ...RAMB16_WIDTHS.flatMap((a, i) => RAMB16_WIDTHS.slice(i).map(b => `RAMB16_S${a}_S${b}`))];
const BUFG_PRIMS = ['BUFG', 'BUFGP', 'BUFGCE', 'BUFGCE_1', 'BUFGMUX', 'BUFGMUX_1'];

// The common resources: count(part, pkg) from the part record. `report`: the line of ISE's MAP report.
const common = ({ lutInputs, lutReport, ffReport, dram }) => [
  { id: 'ffs', label: label('Flip-flops', 'Flip-flops'), report: ffReport, count: p => p.ffs, primitives: FF_PRIMS },
  { id: 'luts', label: label(`${lutInputs}-input LUTs`, `LUTs de ${lutInputs} entradas`), report: lutReport, count: p => p.luts, primitives: luts(lutInputs) },
  { id: 'slices', label: label('Slices', 'Slices'), report: 'Number of occupied Slices', count: p => p.slices, primitives: [] },
  { id: 'distRam', label: label('Distributed RAM (bits)', 'RAM distribuída (bits)'), report: null, count: p => p.distRamBits, primitives: dram },
  { id: 'iob', label: label('User I/O', 'E/S do utilizador'), report: 'Number of bonded IOBs',
    count: (p, pkg) => (pkg ? p.packages?.[String(pkg).toLowerCase()]?.userIo ?? null : p.maxUserIo), primitives: IO_PRIMS },
];

// the common resources of the 4-input LUT families (the Spartan-3 generation, Virtex-4) and of the 6-input ones
const LUT4_COMMON = common({ lutInputs: 4, lutReport: 'Number of 4 input LUTs', ffReport: 'Number of Slice Flip Flops', dram: S3_DRAM_PRIMS });
const LUT6_COMMON = common({ lutInputs: 6, lutReport: 'Number of Slice LUTs', ffReport: 'Number of Slice Registers', dram: S3_DRAM_PRIMS });
const globalBuffers = (n, report = 'Number of BUFGMUXs', primitives = BUFG_PRIMS) =>
  ({ id: 'bufgmux', label: label('Global clock buffers', 'Buffers globais de relógio'), report, count: () => n, primitives });

// the BUFH of the Spartan-6 parts (an LXT part has its LX's)
const BUFH = { xc6slx4: 128, xc6slx9: 128, xc6slx16: 128, xc6slx25: 160, xc6slx45: 256, xc6slx75: 384 };

/** The resources of each family described here. A count is a function of the part record (and package);
 *  a fixed number is the family's own (the same on every part, the data sheet's or the user guide's). */
const FAMILY_RESOURCES = {
  // server/devices-ice40.js; the ids as the iCE40's synthesis reports them (open-flow-ice40.js)
  ice40: [
    { id: 'ffs', label: label('Flip-flops', 'Flip-flops'), report: 'Number of flip-flops', count: p => p.ffs,
      primitives: ['SB_DFF', 'SB_DFFE', 'SB_DFFSR', 'SB_DFFR', 'SB_DFFSS', 'SB_DFFS', 'SB_DFFESR', 'SB_DFFER', 'SB_DFFESS', 'SB_DFFES', 'SB_DFFN', 'SB_DFFNE', 'SB_DFFNSR', 'SB_DFFNR', 'SB_DFFNSS', 'SB_DFFNS', 'SB_DFFNESR', 'SB_DFFNER', 'SB_DFFNESS', 'SB_DFFNES'] },
    { id: 'luts', label: label('4-input LUTs', 'LUTs de 4 entradas'), report: 'Number of LUT4s', count: p => p.luts, primitives: ['SB_LUT4'] },
    { id: 'iob', label: label('User I/O', 'E/S do utilizador'), report: 'Number of IOs',
      count: (p, pkg) => (pkg ? p.packages?.[String(pkg).toLowerCase()]?.userIo ?? null : p.maxUserIo), primitives: ['SB_IO'] },
    { id: 'ramb16', label: label('Block RAM (4 Kb)', 'RAM de bloco (4 Kb)'), report: 'Number of RAM4Ks', count: p => p.brams, primitives: ['SB_RAM40_4K', 'SB_RAM40_4KNR', 'SB_RAM40_4KNW', 'SB_RAM40_4KNRNW'] },
    { id: 'mult18x18', label: label('DSPs', 'DSPs'), report: 'Number of DSPs', count: p => p.multipliers, primitives: ['SB_MAC16'] },
    { id: 'bufgmux', label: label('Global buffers', 'Buffers globais'), report: 'Number of global buffers', count: () => 8, primitives: ['SB_GB', 'SB_GB_IO'] },
    { id: 'dcm', label: label('PLLs', 'PLLs'), report: 'Number of PLLs', count: p => p.dcms, primitives: ['SB_PLL40_CORE', 'SB_PLL40_PAD', 'SB_PLL40_2_PAD', 'SB_PLL40_2F_CORE', 'SB_PLL40_2F_PAD'] },
  ],
  // DS312 Table 1; the global clock buffers: 24 BUFGMUX on every part (DS312 "Clocking Infrastructure",
  // and the device reports of the shipped devices, packages/silinx-fpga/devices/)
  spartan3e: [
    ...LUT4_COMMON,
    { id: 'ramb16', label: label('Block RAM (18 Kb)', 'RAM de bloco (18 Kb)'), report: 'Number of RAMB16s', count: p => p.brams, primitives: RAMB16_PRIMS },
    { id: 'mult18x18', label: label('18×18 multipliers', 'Multiplicadores 18×18'), report: 'Number of MULT18X18SIOs', count: p => p.multipliers,
      primitives: ['MULT18X18', 'MULT18X18S', 'MULT18X18SIO'] },
    globalBuffers(24),
    { id: 'dcm', label: label('DCMs', 'DCMs'), report: 'Number of DCMs', count: p => p.dcms, primitives: ['DCM_SP', 'DCM'] },
  ],
  // DS160 Table 1 (a CMT is 2 DCM + 1 PLL; an 18 Kb block RAM is one RAMB16BWER or two RAMB8BWER); the
  // clock buffers from ISE's device report of every part (xdl -report, #820): 16 BUFGMUX and 32 BUFIO2 on
  // every part, 32 BUFH per clock region row
    spartan6: [
    ...common({ lutInputs: 6, lutReport: 'Number of Slice LUTs', ffReport: 'Number of Slice Registers',
      dram: [...S3_DRAM_PRIMS, 'SRLC32E', 'RAM32M', 'RAM64M', 'RAM128X1S', 'RAM128X1D', 'RAM256X1S'] }),
    { id: 'ramb16bwer', label: label('Block RAM (18 Kb)', 'RAM de bloco (18 Kb)'), report: 'Number of RAMB16BWERs', count: p => p.brams, primitives: ['RAMB16BWER'] },
    { id: 'ramb8bwer', label: label('Block RAM (9 Kb halves)', 'RAM de bloco (metades de 9 Kb)'), report: 'Number of RAMB8BWERs', count: p => 2 * p.brams,
      primitives: ['RAMB8BWER'], shares: { with: 'ramb16bwer', per: 2 } },
    { id: 'dsp48a1', label: label('DSP slices', 'Slices DSP'), report: 'Number of DSP48A1s', count: p => p.dsp, primitives: ['DSP48A1'] },
    globalBuffers(16, 'Number of BUFG/BUFGMUXs'),
    { id: 'bufio2', label: label('I/O clock buffers', 'Buffers de relógio de E/S'), report: 'Number of BUFIO2/BUFIO2_2CLKs', count: () => 32, primitives: ['BUFIO2', 'BUFIO2_2CLK'] },
    { id: 'bufh', label: label('Horizontal clock buffers', 'Buffers horizontais de relógio'), report: 'Number of BUFHs',
      count: p => BUFH[p.part.replace(/t$/, '')] ?? null, primitives: ['BUFH', 'BUFHCE'] },
    { id: 'dcm', label: label('DCMs', 'DCMs'), report: 'Number of DCM/DCM_CLKGENs', count: p => p.dcms, primitives: ['DCM_SP', 'DCM_CLKGEN'] },
    { id: 'pll', label: label('PLLs', 'PLLs'), report: 'Number of PLL_ADVs', count: p => p.plls, primitives: ['PLL_BASE', 'PLL_ADV'] },
    { id: 'mcb', label: label('Memory controllers', 'Controladores de memória'), report: 'Number of MCBs', count: p => p.mcb ?? 0, primitives: ['MCB'] },
  ],
  // the families whose XST takes -bufg (server/ise.js, #821): the common resources and the global clock
  // buffers, the same on every part (DS099, DS529, DS610, DS112; ISE's device reports): 8 BUFGMUX on the
  // Spartan-3, 24 on the Spartan-3A / 3A DSP, 32 BUFGCTRL on the Virtex-4
  spartan3: [...LUT4_COMMON, globalBuffers(8)],
  spartan3a: [...LUT4_COMMON, globalBuffers(24)],
  spartan3adsp: [...LUT4_COMMON, globalBuffers(24)],
  virtex4: [...LUT4_COMMON, globalBuffers(32, 'Number of BUFG/BUFGCTRLs', [...BUFG_PRIMS, 'BUFGCTRL'])],
};

/** The families whose own resources are all described (the Spartan-3, 3A, 3A DSP and Virtex-4 have their
 *  global clock buffers only, the others none: the common ones). */
export const RESOURCE_FAMILIES = ['spartan3e', 'spartan6'];

const definitions = family => FAMILY_RESOURCES[family] || (/^(spartan3|virtex4)/.test(family || '') ? LUT4_COMMON : LUT6_COMMON);

const strip = ({ count, ...r }) => ({ ...r, primitives: [...r.primitives], ...(r.shares ? { shares: { ...r.shares } } : {}) });
const checkPart = part => {
  if (!part || typeof part !== 'object' || !part.part) throw new TypeError(`a part record is needed (server/devices.js findPart, S.devices.parts), not ${JSON.stringify(part)}`);
  return part;
};

/**
 * The resources of a family ('spartan3e', 'spartan6'; another family has the common ones), in the order
 * of ISE's MAP report: [{ id, label: { en, pt }, report, primitives, shares? }]. `report` is the line of
 * the MAP report (null: none); `shares` says the resource takes the same sites as another (a RAMB8BWER
 * is half of a RAMB16BWER's: { with: 'ramb16bwer', per: 2 }).
 */
export function familyResources(family) {
  return definitions(family).map(strip);
}

/**
 * The resources of a part (a record of server/devices.js: findPart(), S.devices.parts) with their counts
 * on it: familyResources' entries with `count` (null: not known). pkg: the package, for the I/O
 * ('cp132'); without it the part's maximum user I/O. A resource the part lacks has count 0.
 */
export function resourcesOf(part, pkg = null) {
  const p = checkPart(part);
  return definitions(p.family).map(r => {
    const n = r.count(p, pkg);
    return { ...strip(r), count: Number.isFinite(n) ? n : null };
  });
}

/** The count of the resource `id` on a part (0: the part does not have it; null: not known). An id no
 *  family has is an error. */
export function resourceCount(part, id, pkg = null) {
  const p = checkPart(part);
  const r = definitions(p.family).find(x => x.id === id);
  if (r) {
    const n = r.count(p, pkg);
    return Number.isFinite(n) ? n : null;
  }
  if (Object.values(FAMILY_RESOURCES).some(list => list.some(x => x.id === id))) return 0;
  throw new RangeError(`unknown resource '${id}'`);
}

/** The primitives of a family that use a counted resource, in the resources' order: [{ name, resource }]. */
export function primitivesOf(family) {
  return definitions(family).flatMap(r => r.primitives.map(name => ({ name, resource: r.id })));
}

/** The resource a primitive (its UNISIM name, any case) uses on a family; null when none counted here. */
export function resourceOfPrimitive(family, name) {
  const n = String(name || '').toUpperCase();
  return definitions(family).find(r => r.primitives.includes(n))?.id ?? null;
}
