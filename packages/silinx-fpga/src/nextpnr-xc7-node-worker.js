// Silinx toolchain - a worker thread of nextpnrXc7Node's runApart (nextpnr-xc7-node.js, #3825): nextpnr-himbaechel-xc7, one run.
//   in:  { args, files }        out: { line } … then { files } or { error }
import { parentPort } from 'node:worker_threads';
import { nextpnrIo } from './nextpnr-io.js';

const np = nextpnrIo(() => import('@silinx/nextpnr-himbaechel-xc7'), 'runNextpnrHimbaechelXilinx');
parentPort.on('message', async ({ args, files }) => {
  try { parentPort.postMessage({ files: await np.run(args, files, line => parentPort.postMessage({ line })) }); }
  catch (e) { parentPort.postMessage({ error: e.message }); }
});
