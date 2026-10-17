// Silinx - a worker thread of yosysWorkers (core/synth-open-node.js): Yosys from @yowasp/yosys, one run
// at a time.
//   in:  { id, args, files }        out: { id, line } … then { id, files } or { id, error, code }
import { parentPort } from 'node:worker_threads';
import { runYosys } from '@yowasp/yosys';
import { lineStream, asText } from './synth-open.js';

parentPort.on('message', async ({ id, args, files }) => {
  const out = lineStream(line => parentPort.postMessage({ id, line }));
  try {
    const res = await runYosys(args, files, { stdout: out, stderr: out, fetchProgress: () => {} });
    out.end();
    parentPort.postMessage({ id, files: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, asText(v)])) });
  } catch (e) {
    out.end();
    parentPort.postMessage({ id, error: `Yosys failed${e.code !== undefined ? ` (exit code ${e.code})` : `: ${e.message}`}`, code: e.code });
  }
});
