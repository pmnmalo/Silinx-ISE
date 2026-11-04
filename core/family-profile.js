// The device families' profiles (#2310): what each family offers the interface, as data. The interface asks the
// profile (its clock manager, its block RAMs, its multiplier, its open flow) instead of testing a family's name, so that
// a new family is an entry here (test/family-conditions.test.js keeps web/js free of family names in conditions).
// The resources' counts stay in the device resources model (packages/silinx-fpga/src/resources.js, #790): a profile
// names the resource, the part counts it.
import { ICE40_STEPS } from '../packages/silinx-fpga/src/index.js';

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
  },
  ice40: {
    // its own tools (#2295): nextpnr-ice40 and icepack, their steps, no device description of the Silinx toolchain
    openFlow: { tools: 'nextpnr-ice40', steps: ICE40_STEPS },
  },
};

const NONE = Object.freeze({});

/** The profile of a family id ('spartan3e', …): an empty one for a family with none (it offers none of these). */
export const familyProfile = family => FAMILY_PROFILES[family] || NONE;
