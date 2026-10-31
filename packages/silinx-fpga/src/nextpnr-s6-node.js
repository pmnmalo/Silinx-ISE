// Silinx toolchain - nextpnr for the Spartan-6 in Node (#2138): io.nextpnrS6 of the flow's nextpnr engine
// (open-flow-nextpnr-s6.js), from the WebAssembly package of nextpnr-himbaechel with the spartan6 micro-architecture (the
// fork pmnmalo/nextpnr-spartan's release, @silinx/nextpnr-himbaechel-spartan6), loaded on its first use (the runner:
// nextpnr-io.js).
import { nextpnrIo } from './nextpnr-io.js';

/** io.nextpnrS6 in this process: { run(args, files, onLine) -> files, chipdb(part) -> Uint8Array }. */
export const nextpnrS6Node = () => nextpnrIo(() => import('@silinx/nextpnr-himbaechel-spartan6'), 'runNextpnrHimbaechelSpartan6');
