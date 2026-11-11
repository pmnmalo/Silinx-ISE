// Silinx toolchain - nextpnr for the 7-series in Node (#3146): io.nextpnr.xc7 of the 7-series' back end (open-flow-xc7.js),
// from the WebAssembly package of nextpnr-himbaechel with the xilinx micro-architecture (the fork pmnmalo/nextpnr-spartan's
// release, @silinx/nextpnr-himbaechel-xc7, #3143), loaded on its first use (the runner: nextpnr-io.js).
import { nextpnrIo } from './nextpnr-io.js';
import { withChipdbFetch } from './nextpnr-chipdb-node.js';

/** io.nextpnr.xc7 in this process: { run(args, files, onLine) -> files, chipdb(part, log) -> Uint8Array, router } (a database the
 *  release zip left out: downloaded, #2329). router2: 6 to 30 times faster than router1, its 1.1 GB (the xc7a35t) a server's to
 *  spare, not a browser tab's (#3143). */
export const nextpnrXc7Node = () => ({ ...withChipdbFetch(nextpnrIo(() => import('@silinx/nextpnr-himbaechel-xc7'), 'runNextpnrHimbaechelXilinx')), router: 'router2' });
