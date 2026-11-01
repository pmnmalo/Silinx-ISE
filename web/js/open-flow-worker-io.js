// The browser edition's io of the Silinx toolchain's flow (packages/silinx-fpga/src/open-flow-core.js runFlow), out of its
// Web Worker (web/js/open-flow-worker.js, #2388): the files in memory (store), each line, file and report posted to the page.
// A test runs a back end of its own through it in a worker (test/ui/flow-worker-backend.test.js).
//   post(message)                       the worker's postMessage to the page: { line }, { write, data }, { report }
//   sources, simSources, ucf, ucfName   the run's (as runFlow's io takes them)
//   files                               { name: text } of the build folder, an earlier run's
//   device, bitDb, yosys, nextpnr       as runFlow's io takes them

/** { io, store }: runFlow's io in the browser, and the files it holds (store: { name: text or bytes }). */
export function workerIo({ post, sources, simSources = [], ucf = null, ucfName = null, files = {}, device = null, bitDb = null, yosys = null, nextpnr = null }) {
  const store = { ...(files || {}) };
  const io = {
    log: line => post({ line }),
    sources: () => sources,
    simSources: () => simSources,
    ucf, ucfName,
    device,
    bitDb,
    yosys,
    nextpnr,
    write: (name, d) => {
      const path = `build/${name}`;
      store[name] = d;
      post({ write: path, data: d });
      return path;
    },
    read: name => {
      if (store[name] !== undefined) return typeof store[name] === 'string' ? store[name] : null;
      const k = Object.keys(store).find(x => x.toLowerCase() === name.toLowerCase());   // (a VHDL top: lower case, #31)
      return k && typeof store[k] === 'string' ? store[k] : null;
    },
    save: report => post({ report: JSON.parse(JSON.stringify(report)) }),
  };
  return { io, store };
}
