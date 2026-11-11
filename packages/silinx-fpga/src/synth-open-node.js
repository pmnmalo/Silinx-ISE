// Silinx - open synthesis in Node: run() for synth-open.js with Yosys from @yowasp/yosys in
// this process (the browser runs it in a Web Worker instead: web/js/yosys-worker.js). Kept apart
// from synth-open.js so that the page never imports the Node-only loader.
import { Worker } from 'node:worker_threads';
import os from 'node:os';
import { runYosysOnce } from './synth-open.js';

/**
 * run() for Node: Yosys from @yowasp/yosys in this process. With a signal (its fifth argument, { signal }), in a worker
 * thread of its own instead, terminated when the signal aborts (Yosys's -timeout does nothing in WebAssembly: the
 * formal checks' time limit, #3261): the run rejected (aborted: true).
 */
export async function yosysNode(args, files, onLine = () => {}, _onProgress, { signal } = {}) {
  if (signal) return yosysStoppable(args, files, onLine, signal);
  const { runYosys } = await import('@yowasp/yosys');
  return runYosysOnce(runYosys, args, files, onLine, { fetchProgress: () => {} });
}

// one run in a worker thread of its own, terminated when the signal aborts
function yosysStoppable(args, files, onLine, signal) {
  const stopped = () => Object.assign(new Error('Yosys was stopped'), { aborted: true });
  if (signal.aborted) return Promise.reject(stopped());
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./synth-open-node-worker.js', import.meta.url));
    const end = (f, x) => { signal.removeEventListener('abort', abort); w.terminate(); f(x); };
    const abort = () => end(reject, stopped());
    signal.addEventListener('abort', abort, { once: true });
    w.on('message', m => {
      if (m.line !== undefined) onLine(m.line);
      else if (m.error) end(reject, Object.assign(new Error(m.error), { code: m.code, crash: m.crash }));
      else end(resolve, m.files);
    });
    w.on('error', e => end(reject, new Error(`Yosys failed: ${e.message}`)));
    w.postMessage({ id: 1, args, files });
  });
}

/**
 * run() for Node with Yosys in worker threads (#86): the runs the open synthesis makes at once (its
 * mappings from the same netlist) go in parallel, up to n Yosys at a time (4, fewer on fewer cores: one core is left to the rest),
 * the others queued. A worker is kept for the next runs (its WebAssembly module compiled once) and does
 * not keep the process alive while idle. Its errors are yosysNode's.
 */
export function yosysWorkers(n = Math.min(4, Math.max(1, (os.availableParallelism?.() ?? os.cpus().length) - 1))) {
  const idle = [], queue = [];
  let count = 0, seq = 0;
  const start = () => {
    const w = new Worker(new URL('./synth-open-node-worker.js', import.meta.url));
    w.on('message', m => {
      const job = w.job;
      if (!job || m.id !== job.id) return;
      if (m.line !== undefined) { job.onLine(m.line); return; }
      w.job = null;
      if (m.error) job.reject(Object.assign(new Error(m.error), { code: m.code, crash: m.crash }));
      else job.resolve(m.files);
      next(w);
    });
    w.on('error', e => {
      // the worker died: its run fails, the next runs start another
      count--;
      w.job?.reject(new Error(`Yosys failed: ${e.message}`));
      w.job = null;
      if (queue.length && count < n) next(start());
    });
    count++;
    return w;
  };
  // the next queued run on worker w, or w idle (not keeping the process alive)
  const next = w => {
    const job = queue.shift();
    if (!job) { w.unref(); idle.push(w); return; }
    w.job = job;
    w.ref();
    w.postMessage({ id: job.id, args: job.args, files: job.files });
  };
  const run = (args, files, onLine = () => {}) => new Promise((resolve, reject) => {
    queue.push({ id: ++seq, args, files, onLine, resolve, reject });
    if (idle.length) next(idle.pop());
    else if (count < n) next(start());
  });
  // (how many at a time: synth-open.js starts the runs it may not need when there are enough, #277)
  run.parallel = n;
  return run;
}
