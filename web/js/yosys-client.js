// The page's side of web/js/yosys-worker.js: run(args, files, onLine) for packages/silinx-fpga/src/synth-open.js, with
// Yosys in Web Workers (kept: the WebAssembly module is fetched and compiled once in each). The runs the
// open synthesis makes at once (its mappings from the same netlist) go in parallel, up to WORKERS at a
// time, the others queued (#276): 2 when the device has the cores and the memory for them (each Yosys
// takes about 2 GB on a design such as pong), 1 otherwise.
// When Yosys crashes rather than stops on an error of the design (no exit code: an exception inside
// its WebAssembly module, e.g. out of memory), the worker is replaced and the run made once more in
// the new one, whose memory is fresh (#153); from then on one Yosys at a time.
// The browser edition's flow worker (web/js/open-flow-worker.js) keeps a pool of its own (#279), its
// workers started from packages/silinx-fpga/src/synth-open.js yosysWorkerSource (it has no file to start them from in the
// single-file edition).
const nav = globalThis.navigator || {};
export const WORKERS = (nav.hardwareConcurrency || 1) >= 4 && (nav.deviceMemory === undefined || nav.deviceMemory >= 8) ? 2 : 1;

/**
 * A pool of Yosys workers: run(args, files, onLine, onProgress) -> the output files; run.parallel, how many
 * at a time. spawn() starts a worker that answers as web/js/yosys-worker.js does.
 */
export function yosysPool({ spawn = () => new Worker('/js/yosys-worker.js', { type: 'module' }), workers = WORKERS } = {}) {
  let max = workers, seq = 0;
  const idle = [], busy = new Set(), queue = [];

  function startWorker() {
    const w = spawn();
    w.job = null;
    w.onmessage = ({ data }) => {
      w.answered = true;
      const p = w.job;
      if (!p || data.id !== p.id) return;
      if (data.line !== undefined) { p.onLine(data.line); return; }
      if (data.progress !== undefined) { p.onProgress?.(data.progress); return; }
      w.job = null;
      if (data.error && data.crash && !p.retried) { again(w, p, data.error); return; }
      if (data.error) p.reject(Object.assign(new Error(data.error), { code: data.code }));
      else p.resolve(data.files);
      busy.delete(w);
      idle.push(w);
      next();
    };
    w.onerror = e => {
      const p = w.job;
      w.job = null;
      // a worker that answered before fails at run time (an exception outside Yosys's own error
      // handling): as a crash, its run once more in a new worker; the pool goes on (#400)
      if (w.answered && p && !p.retried) { again(w, p, `the Yosys worker failed: ${e.message || 'an error'}`); return; }
      // one that could not start (e.g. the module was not found): its run fails as such (the flow
      // worker then runs Yosys in its own thread), the next ones start afresh
      busy.delete(w);
      w.terminate();
      p?.reject(Object.assign(new Error(`the Yosys worker failed: ${e.message || 'could not be loaded'}`), { workerFailed: !w.answered }));
      next();
    };
    return w;
  }

  // a fresh worker for this run (and the next ones), one Yosys at a time; the failed one ended
  function again(w, p, why) {
    p.onLine(`${why}: Yosys is started again (a new worker) and the synthesis run once more`);
    max = 1;
    busy.delete(w);
    w.terminate();
    queue.unshift({ ...p, retried: true });
    next();
  }

  // the queued runs onto the idle workers, or new ones up to max (fewer kept when max went down)
  function next() {
    while (queue.length) {
      while (idle.length && busy.size + idle.length > max) idle.pop().terminate();
      const w = idle.pop() || (busy.size < max ? startWorker() : null);
      if (!w) return;
      const p = queue.shift();
      w.job = { ...p, id: ++seq };
      busy.add(w);
      w.postMessage({ id: w.job.id, args: p.args, files: p.files });
    }
  }

  const run = (args, files, onLine = () => {}, onProgress) =>
    new Promise((resolve, reject) => { queue.push({ resolve, reject, onLine, onProgress, args, files }); next(); });
  // (how many at a time, for packages/silinx-fpga/src/synth-open.js)
  Object.defineProperty(run, 'parallel', { get: () => max });
  return run;
}

const page = yosysPool();
/** run() for packages/silinx-fpga/src/synth-open.js. onProgress(0…1) while the WebAssembly module is being fetched. */
export function yosysBrowser(args, files, onLine = () => {}, onProgress) {
  return page(args, files, onLine, onProgress);
}
Object.defineProperty(yosysBrowser, 'parallel', { get: () => page.parallel });
