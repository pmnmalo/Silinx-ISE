// Stage S6-F (#728): a block RAM's or a DSP48A1's bits from its settings, by db/<device>-hard.json (ana-hard6.mjs):
// its slot's base with each setting's option set and cleared (a combination measured as one first), INIT_A / INIT_B / SRVAL_A / SRVAL_B's bits, and the
// contents (INIT_xx, INITP_xx) in the BRAM frames from the site's first bit (a RAMB16BWER with neither port 36 bits wide
// in its narrow order). Shared by residual6.mjs and the tests; in the Silinx toolchain since #732
// (packages/silinx-fpga/src/fpga/s6/bitgen-hard.js), here with the base settings of gen-hard6.mjs.
import { hardBase } from './gen-hard6.mjs';
import { HARD_TYPES, predictHard as predictHardS6 } from '../../packages/silinx-fpga/src/fpga/s6/bitgen-hard.js';

export { HARD_TYPES, hexBits, fieldIndices } from '../../packages/silinx-fpga/src/fpga/s6/bitgen-hard.js';

/** An instance's bits (bitgen-hard.js predictHard) with the types' base settings of gen-hard6.mjs. */
export const predictHard = (inst, device, dev, hard, pins = new Set()) => predictHardS6(inst, device, dev, hard, pins, Object.fromEntries(HARD_TYPES.map(t => [t, hardBase(t)])));
