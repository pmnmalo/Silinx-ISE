// Silinx toolchain - nextpnr for the Spartan-6 in Node (#2138): io.nextpnrS6 of the flow's nextpnr engine
// (open-flow-nextpnr-s6.js), from the WebAssembly package of nextpnr-himbaechel with the spartan6 micro-architecture (the
// fork pmnmalo/nextpnr-spartan's release, @silinx/nextpnr-himbaechel-spartan6), loaded on its first use (the runner:
// nextpnr-io.js).
import { nextpnrIo } from './nextpnr-io.js';
import { withChipdbFetch } from './nextpnr-chipdb-node.js';

/** io.nextpnrS6 in this process: { run(args, files, onLine) -> files, chipdb(part, log) -> Uint8Array } (a database the release zip left out: downloaded, #2329). */
export const nextpnrS6Node = () => withChipdbFetch(nextpnrIo(() => import('@silinx/nextpnr-himbaechel-spartan6'), 'runNextpnrHimbaechelSpartan6'));
