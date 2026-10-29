// Silinx - a worker thread of yosysWorkers (core/synth-open-node.js): Yosys from @yowasp/yosys, one run
// at a time.
//   in:  { id, args, files }        out: { id, line } … then { id, files } or { id, error, code, crash }
import { parentPort } from 'node:worker_threads';
import { runYosys } from '@yowasp/yosys';
import { runYosysOnce } from './synth-open.js';

parentPort.on('message', async ({ id, args, files }) => {
  try { parentPort.postMessage({ id, files: await runYosysOnce(runYosys, args, files, line => parentPort.postMessage({ id, line }), { fetchProgress: () => {} }) }); }
  catch (e) { parentPort.postMessage({ id, error: e.message, code: e.code, crash: e.crash }); }
});
