// Silinx toolchain - nextpnr in Node (#2136): io.nextpnr for the flow's nextpnr engine (open-flow-nextpnr.js), from the
// WebAssembly package of nextpnr-himbaechel with the spartan3e micro-architecture (the fork pmnmalo/nextpnr-spartan's
// release, @silinx/nextpnr-himbaechel-spartan3e), loaded on its first use (the runner: nextpnr-io.js, the browser's too).
import { nextpnrIo } from './nextpnr-io.js';
import { withChipdbFetch } from './nextpnr-chipdb-node.js';

/** io.nextpnr in this process: { run(args, files, onLine) -> files, chipdb(part, log) -> Uint8Array } (a database the release zip left out: downloaded, #2329). */
export const nextpnrNode = () => withChipdbFetch(nextpnrIo(() => import('@silinx/nextpnr-himbaechel-spartan3e')));
