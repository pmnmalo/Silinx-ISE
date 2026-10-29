// Silinx - the Spartan-6 devices of the Silinx toolchain (#722; the plan: research/s6/README.md, #1): the parts of
// the Nexys3 and the Atlys, their configuration facts as UG380 (Spartan-6 FPGA Configuration User Guide) documents
// them, until the measurements on ISE's bitgen (#724) replace them, and the developer flag under which the open
// flow takes these parts with the steps it has for them. Without the flag nothing changes: the Spartan-6 boards are
// built with ISE.
//
// Isomorphic ES module (browser + Node), no DOM.

/** The Spartan-6 parts of the boards: the part of a .bit header for the boards' package, the IDCODE, the frame
 *  length in 16-bit words and the size of the configuration bitstream in bits (UG380's table, the packets and the
 *  frames), measured: false while they are the documents' values. */
export const S6_DEVICES = {
  xc6slx16: { device: 'xc6slx16', pkg: 'csg324', board: 'Nexys3', part: '6slx16csg324', idcode: 0x04002093, frameWords: 65, configBits: 3731264, measured: false },
  xc6slx45: { device: 'xc6slx45', pkg: 'csg324', board: 'Atlys', part: '6slx45csg324', idcode: 0x04008093, frameWords: 65, configBits: 11939296, measured: false },
};

/** The steps of the Silinx toolchain for the Spartan-6 so far: the synthesis and its simulation model (#720). */
export const S6_OPEN_STEPS = ['synth', 'postsynth'];

/** The developer flag: SILINX_SPARTAN6_OPEN=1 in the environment of the server (none in the browser). */
const SPARTAN6_FLAG = 'SILINX_SPARTAN6_OPEN';
export const spartan6Open = (env = globalThis.process?.env) => env?.[SPARTAN6_FLAG] === '1';

/**
 * Can the Silinx toolchain take this Spartan-6 part (dev 'xc6slx16', pkg 'csg324'), under the flag?
 * { available, steps (S6_OPEN_STEPS), reason }.
 */
export function s6OpenStatus(dev, pkg, part) {
  const d = S6_DEVICES[dev];
  const list = Object.values(S6_DEVICES).map(x => `${x.device.toUpperCase()} (${x.pkg.toUpperCase()}, ${x.board})`).join(', ');
  if (!d) return { available: false, reason: `the Silinx toolchain for the Spartan-6 is for the ${list} only (${SPARTAN6_FLAG}): use an ISE mode for the ${dev}` };
  if (pkg !== d.pkg) return { available: false, reason: `the Silinx toolchain for the Spartan-6 has the ${dev} in the ${d.pkg} package only (${SPARTAN6_FLAG}): use an ISE mode for the ${pkg}` };
  return { available: true, steps: S6_OPEN_STEPS,
    reason: `${part}: the Spartan-6 under development (${SPARTAN6_FLAG}): ${S6_OPEN_STEPS.map(s => ({ synth: 'synthesis', postsynth: 'the post-synthesis simulation model' })[s]).join(' and ')} only, no implementation yet (#1)` };
}
