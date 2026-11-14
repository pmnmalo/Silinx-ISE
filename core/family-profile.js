// The device families' profiles (#2310): what each family offers the interface, as data. The interface asks the
// profile (its clock manager, its block RAMs, its multiplier, its open flow, its Map's choice) instead of testing a family's name, so that
// a new family is an entry here (test/family-conditions.test.js keeps web/js free of family names in conditions).
// The resources' counts stay in the device resources model (packages/silinx-fpga/src/resources.js, #790): a profile
// names the resource, the part counts it.
import { ICE40_STEPS, ICE40_PARTS, ECP5_STEPS, ECP5_PARTS, GOWIN_STEPS, GOWIN_PARTS, XC7_STEPS } from '../packages/silinx-fpga/src/index.js';

export const FAMILY_PROFILES = {
  spartan3e: {
    // the Clocking Wizard's primitive: a DCM_SP, its fixed outputs, CLKIN_DIVIDE_BY_2 and PHASE_SHIFT (core/clocking.js)
    clock: { manager: 'dcm', primitive: 'DCM_SP', resource: 'dcm' },
    // the Block Memory wizard's unit: one RAMB16 of 18 Kbit (core/blockram.js)
    blockRam: { resource: 'ramb16', halves: false },
    multiplier: 'mult18x18',
    // the Silinx toolchain's: its parts, the bit database in bitdb/, and nextpnr as its engine (nextpnr-himbaechel-spartan3e, #2137)
    openFlow: { parts: /^xc3s\d+e$/, bitDb: 'bitdb', nextpnr: true },
  },
  spartan6: {
    // a PLL_BASE: six outputs from one VCO frequency, each with its phase
    clock: { manager: 'pll', primitive: 'PLL_BASE', resource: 'pll' },
    // halves of 9 Kbit: RAMB8BWER, and RAMB16BWER as two of them
    blockRam: { resource: 'ramb8bwer', halves: true },
    multiplier: 'dsp48a1',
    // the Nexys3's and Atlys's parts, the bit databases in bitdb/s6 (#2103), and nextpnr as its engine (nextpnr-himbaechel-spartan6, #2138, #2137)
    openFlow: { parts: /^xc6slx\d+$/, bitDb: 's6', nextpnr: true },
    // its Map's choice in Process Properties (#3138): Silinx's, or nextpnr's packer on trial (impl.s6Map)
    mapChoice: true,
  },
  artix7: {
    // the Silinx toolchain's 7-series back end (#3146), in the browser edition too (#3143): nextpnr-himbaechel-xc7 (its
    // micro-architecture uarch, its function runner; layout: the browser edition's key of its bundle, its chip databases in
    // ../chipdb beside it; mb: its WebAssembly and a chip database, the log's), Project X-Ray's bit databases in bitdb/xc7
    // (one per part: <part>.json.gz), its steps (nextpnr packs in its Place & Route)
    openFlow: { parts: /^xc7a\d+t$/, bitDb: 'xc7', nextpnr: true, uarch: 'xilinx', runner: 'runNextpnrHimbaechelXilinx', layout: 'nextpnrXc7', mb: 6, steps: XC7_STEPS },
    // its Place & Route's seeds in Process Properties (#3825): one, or the best of 3 (impl.xc7Seeds)
    seedsChoice: true,
  },
  ice40: {
    // its own tools (#2295): nextpnr-ice40 and icepack, their steps, no device description of the Silinx toolchain;
    // YoWASP's package, downloaded on first use (#2444)
    // (its parts, nextpnr-ice40's; layout: the browser edition's key of its bundle, #2444)
    openFlow: { tools: 'nextpnr-ice40', packer: 'icepack', package: '@yowasp/nextpnr-ice40', mb: 80, layout: 'nextpnrIce40', parts: new RegExp(`^ice40(${ICE40_PARTS.join('|')})$`), partOf: 'an iCE40 part', steps: ICE40_STEPS },
    // its board programmed: the .bin into its SPI flash (#2298)
    program: 'spi-flash',
  },
  ecp5: {
    // its own tools (#2302): nextpnr-ecp5 and ecppack (Project Trellis), as the iCE40's; no clock manager, block RAM or
    // multiplier wizard (their primitives the Xilinx families')
    openFlow: { tools: 'nextpnr-ecp5', packer: 'ecppack', package: '@yowasp/nextpnr-ecp5', mb: 30, layout: 'nextpnrEcp5', parts: new RegExp(`^(${Object.keys(ECP5_PARTS).join('|')})$`), partOf: 'an ECP5 part', steps: ECP5_STEPS },
    // its board programmed: the .bit loaded into the FPGA's SRAM (#2298)
    program: 'sram',
  },
  gowin: {
    // its own tools (#2303): nextpnr-himbaechel-gowin (Project Apicula) and gowin_pack, Silinx's port of Apicula's (the
    // package's is Python)
    openFlow: { tools: 'nextpnr-himbaechel-gowin', packer: 'gowin_pack', package: '@yowasp/nextpnr-himbaechel-gowin', mb: 32, layout: 'nextpnrGowin',
      parts: new RegExp(`^(${GOWIN_PARTS.join('|')})$`), partOf: 'a Gowin part', steps: GOWIN_STEPS },
    // its board programmed: the .fs loaded into the FPGA's SRAM (#2298)
    program: 'sram',
  },
};

const NONE = Object.freeze({});

/** The profile of a family id ('spartan3e', …): an empty one for a family with none (it offers none of these). */
export const familyProfile = family => FAMILY_PROFILES[family] || NONE;
