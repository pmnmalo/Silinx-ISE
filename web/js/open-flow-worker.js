// Web Worker: the Silinx toolchain's flow (core/open-flow-core.js: synthesis with Yosys in
// WebAssembly, pack, place and route, timing, bitstream) in the browser edition, off the page's thread.
// The device description, the bit database and Yosys are fetched from `assets` (the site's
// assets/ folder; web/js/open-flow-browser.js chooses it).
//   in:  { spec, sources: [{ path, lang, text }], simSources (the test benches), ucf, ucfName, files: { name: text }, assets }
//   out: { line } … { write: name, data } … { report } … then { done: { ok, report, error, view } }
import { runOpenFlow } from '/core/open-flow-core.js';
import { loadDevice } from '/core/fpga/device.js';
import { dbFileNames, dbFilesFrom, makeBitDb } from '/core/fpga/bitdb.js';
import { lineStream, asText, yosysError, yosysWorkerSource } from '/core/synth-open.js';
import { yosysPool } from './yosys-client.js';
import { parseXdl, fpgaModel, deviceGrid, MODEL_VERSION } from '/core/xdl.js';

const fetchOk = async (url, what) => {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${what} could not be loaded (${url}: HTTP ${r.status})`);
  return r;
};
async function gunzipJson(res) {
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

// the Yosys workers, by the URL of Yosys: kept from one run of the flow to the next
const pools = new Map();

self.onmessage = async ({ data }) => {
  const { spec, sources, simSources = [], ucf, ucfName, files, assets } = data;
  const post = m => self.postMessage(m);
  try {
    const base = new URL(assets);
    // what the flow needs, fetched before it starts (it reads them synchronously)
    post({ line: `Loading the device description of ${spec.part} and its bit database…` });
    const graph = await gunzipJson(await fetchOk(new URL(`devices/${spec.graph}`, base), 'the device description'));
    const device = loadDevice(graph);
    const names = dbFileNames(spec.device, spec.pkg);
    const json = {};
    await Promise.all(Object.entries(names).map(async ([k, f]) => {
      const r = await fetch(new URL(`bitdb/${f}`, base));
      json[k] = r.ok ? await r.json() : null;
    }));
    if (!json.layout || !json.tiles) throw new Error(`no bit database for ${spec.device} on the site`);
    const db = makeBitDb(dbFilesFrom(json, spec.pkg), device, spec.part);
    // Yosys, compiled to WebAssembly (YoWASP): fetched once, then cached by the browser; in workers of
    // this worker (#279), the synthesis's mappings from the same netlist in parallel (web/js/yosys-client.js),
    // or in this worker's own thread where it cannot start them
    const bundle = new URL('vendor/yowasp-yosys/gen/bundle.js', base).href;
    let runYosys = null, loading = false;
    const inThread = async (args, yfiles, onLine) => {
      if (!runYosys) ({ runYosys } = await import(bundle));
      const out = lineStream(onLine);
      try {
        const res = await runYosys(args, yfiles, { stdout: out, stderr: out });
        out.end();
        return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, asText(v)]));
      } catch (e) {
        out.end();
        const { message, code } = yosysError(e);
        throw Object.assign(new Error(message), { code });
      }
    };
    let pool = null;
    if (!pools.has(bundle) && typeof Worker !== 'undefined') {
      try {
        const url = URL.createObjectURL(new Blob([yosysWorkerSource(bundle)], { type: 'text/javascript' }));
        pools.set(bundle, yosysPool({ spawn: () => new Worker(url, { type: 'module' }) }));
      } catch { pools.set(bundle, null); }
    }
    pool = pools.get(bundle) || null;
    const yosys = Object.assign(async (args, yfiles, onLine) => {
      if (!loading) { loading = true; post({ line: 'Loading Yosys (WebAssembly: downloaded once, then kept by the browser)…' }); }
      if (pool) {
        try { return await pool(args, yfiles, onLine); } catch (e) {
          if (!e.workerFailed) throw e;
          // no worker here (a browser without workers in workers, or a blocked Blob): this thread from now on
          pools.set(bundle, pool = null);
        }
      }
      return inThread(args, yfiles, onLine);
    }, { parallel: pool ? pool.parallel : 1 });
    const store = { ...(files || {}) };
    const io = {
      log: line => post({ line }),
      sources: () => sources,
      simSources: () => simSources,
      ucf, ucfName,
      device: () => device,
      bitDb: () => db,
      yosys,
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
    const res = await runOpenFlow(spec, io);
    // the FPGA view's model, from the routed design
    let view = null;
    if (res.ok && typeof store['open/routed.xdl'] === 'string') {
      try { view = { available: true, source: 'open', modelVersion: MODEL_VERSION, ...fpgaModel(parseXdl(store['open/routed.xdl']), deviceGrid(device)) }; } catch (e) { post({ line: `WARNING:Silinx - the FPGA view could not be built: ${e.message}` }); }
    }
    post({ done: { ok: res.ok, report: res.report, error: res.error, view } });
  } catch (e) {
    post({ line: `ERROR:Silinx - ${e.message}` });
    post({ line: `=== SILINX FAILED ${spec?.steps?.[0] || 'synth'} (exit 1) ===` });
    post({ done: { ok: false, error: e.message } });
  }
};
