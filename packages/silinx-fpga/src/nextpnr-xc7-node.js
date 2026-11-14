// Silinx toolchain - nextpnr for the 7-series in Node (#3146): io.nextpnr.xc7 of the 7-series' back end (open-flow-xc7.js),
// from the WebAssembly package of nextpnr-himbaechel with the xilinx micro-architecture (the fork pmnmalo/nextpnr-spartan's
// release, @silinx/nextpnr-himbaechel-xc7, #3143), loaded on its first use (the runner: nextpnr-io.js).
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { nextpnrIo } from './nextpnr-io.js';
import { withChipdbFetch } from './nextpnr-chipdb-node.js';

/** One run of nextpnr in a worker thread of its own (nextpnr-xc7-node-worker.js): run()'s arguments and result, so that several
 *  go at once (the best of 3 seeds, #3825); the process ended (Stop) ends it. */
function runXc7Apart(args, files, onLine = () => {}) {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./nextpnr-xc7-node-worker.js', import.meta.url));
    const end = (f, x) => { w.terminate(); f(x); };
    w.on('message', m => {
      if (m.line !== undefined) onLine(m.line);
      else if (m.error !== undefined) end(reject, new Error(m.error));
      else end(resolve, m.files);
    });
    w.on('error', e => end(reject, e));
    w.postMessage({ args, files });
  });
}

/** How many nextpnr runs at once this computer takes (#3825): router2's 1.1 GB each (the xc7a35t) and a core each, with
 *  4 GB and a core left to the rest; 1 or 3 (the best of 3 seeds). */
export const xc7Parallel = (mem = os.totalmem(), cores = os.availableParallelism?.() ?? os.cpus().length) =>
  (mem >= 8 * 2 ** 30 && cores >= 4 ? 3 : 1);

/** io.nextpnr.xc7 in this process: { run(args, files, onLine) -> files, chipdb(part, log) -> Uint8Array, router, runApart,
 *  parallel } (a database the release zip left out: downloaded, #2329). router2: 6 to 30 times faster than router1, its
 *  1.1 GB (the xc7a35t) a server's to spare, not a browser tab's (#3143); runApart: a run in a worker thread, parallel of them
 *  at once (#3825). In a process that may not start threads (Node's permission model without --allow-worker): none apart. */
export const nextpnrXc7Node = () => ({
  ...withChipdbFetch(nextpnrIo(() => import('@silinx/nextpnr-himbaechel-xc7'), 'runNextpnrHimbaechelXilinx')), router: 'router2',
  ...(process.permission?.has('worker') !== false && { runApart: runXc7Apart, parallel: xc7Parallel() }),
});
