// Web Worker: the Silinx toolchain's flow (packages/silinx-fpga/src/open-flow-core.js: synthesis with Yosys in
// WebAssembly, pack, place and route, timing, bitstream) in the browser edition, off the page's thread.
// The device description, the bit database and Yosys are fetched from `assets` (the site's
// assets/ folder; web/js/open-flow-browser.js chooses it).
//   in:  { spec, sources: [{ path, lang, text }], simSources (the test benches), ucf, ucfName, files: { name: text }, assets, yosys (its bundle's URL) }
//   out: { line } … { write: name, data } … { report } … then { done: { ok, report, error, view } }
//   in:  { prepare: { graph, device, pkg, nextpnr }, assets, yosys, nextpnr, root }: what a run of that device fetches
//        (nextpnr and the device's chip database too when prepare.nextpnr: the project's engine is not Silinx's, #2136),
//        fetched into Cache Storage (web/js/asset-cache.js, #967), this edition's other versions deleted from it
//   out: { done: { fetched, bytes, pruned } }
import { runOpenFlow } from '/core/flow-ide.js';
import { loadDevice, dbFileNames, dbFilesFrom, makeBitDb, nextpnrIo, ice40Io, runYosysOnce, yosysWorkerSource, readableBlobs } from '/packages/silinx-fpga/src/index.js';
import { yosysPool } from './yosys-client.js';
import { workerIo } from './open-flow-worker-io.js';
import { parseXdl, fpgaModel, deviceGrid, MODEL_VERSION } from '/packages/silinx-fpga/src/parts.js';
import { ice40FromTarball } from './nextpnr-ice40-browser.js';
import { assetFetch, assetFetchSource, assetCached, prefetchAssets, pruneAssetCache, YOSYS_FILES, NEXTPNR_FILES, nextpnrChipdb } from './asset-cache.js';

// (Yosys in this worker's own thread, where it cannot start workers of its own: its Blobs readable, #556)
readableBlobs();
// the versioned assets from Cache Storage (#967): this worker's fetches, Yosys's in its thread among them
const netFetch = self.fetch.bind(self);
assetFetch(self);

const fetchOk = async (url, what) => {
  const r = await fetch(url);
  // (a page downloaded long ago: the site keeps the assets of its last releases only, #487)
  if (r.status === 404) throw new Error(`${what} could not be loaded (${url}: HTTP 404): the site no longer has this version's files; download the current Silinx-ISE.html`);
  if (!r.ok) throw new Error(`${what} could not be loaded (${url}: HTTP ${r.status})`);
  return r;
};
async function gunzipJson(res) {
  const stream = res.body.pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text());
}

// the Yosys workers, by the URL of Yosys: kept from one run of the flow to the next
const pools = new Map();
const loaded = new Set();   // (the URLs of Yosys a run of this worker has loaded)
// a Yosys worker's code: the cache first, then Yosys (packages/silinx-fpga/src/synth-open.js)
const yosysSource = bundle => assetFetchSource() + yosysWorkerSource(bundle);

/** What a run of the device fetches, fetched into the cache: { fetched, bytes, pruned }. */
async function prepare({ prepare: d, assets, yosys, nextpnr, root }) {
  const base = new URL(assets);
  // (this version's nextpnr kept, its gen/ and chipdb/, whatever this project's engine)
  const pruned = await pruneAssetCache(root, [base.href, new URL('.', yosys).href, ...(nextpnr ? [new URL('..', nextpnr).href] : [])]);
  const urls = [new URL(`devices/${d.graph}`, base), ...Object.values(dbFileNames(d.device, d.pkg)).map(f => new URL(`bitdb/${f}`, base)),
    ...YOSYS_FILES.map(f => new URL(f, yosys)),
    ...(nextpnr && d.nextpnr ? [...NEXTPNR_FILES, nextpnrChipdb(d.device)].map(f => new URL(f, nextpnr)) : [])];
  return { ...await prefetchAssets(urls, { fetchFn: netFetch }), pruned };
}
// the last device description and bit database loaded (1.6-2.5 MB gzipped): the next run of the same
// device uses them again (the flow does not change them) instead of fetching and parsing them anew
let lastDevice = null;   // { key, device, db }

// nextpnr in this worker's thread (#2136), from its bundle; the log says what the wait is the first time
const nextpnrs = new Map();
function nextpnrBrowser(url, post) {
  if (!nextpnrs.has(url)) nextpnrs.set(url, nextpnrIo(() => import(url)));
  const io = nextpnrs.get(url);
  return {
    run: io.run,
    chipdb: async part => {
      if (!loaded.has(`${url} ${part}`)) {
        loaded.add(`${url} ${part}`);
        post({ line: `Loading nextpnr and the chip database of ${part} (WebAssembly, about 7 MB: once, then kept by this browser)…` });
      }
      return io.chipdb(part);
    },
  };
}

// the iCE40's nextpnr and icepack (#2295): YoWASP's bundle served by the local server (its URL), or its package from npm's
// registry, kept by this browser (the published editions: its { url, integrity }, #2444)
const ice40s = new Map();
function ice40Browser(where, post) {
  const key = where.url || where;
  if (!ice40s.has(key)) ice40s.set(key, ice40Io(() => (where.url ? ice40FromTarball(where, { log: line => post({ line }) }) : import(where))));
  return ice40s.get(key);
}

self.onmessage = async ({ data }) => {
  const { spec, sources, simSources = [], ucf, ucfName, files, assets, yosys: yosysUrl, nextpnr: nextpnrUrl, nextpnrIce40: ice40Url } = data;
  // every message carries the run's id (web/js/open-flow-browser.js: each run hears only its own)
  const post = m => self.postMessage({ ...m, id: data.id });
  if (data.integrity) self.SILINX_ASSET_INTEGRITY = data.integrity;   // (the assets' SHA-256, #1237: this worker's fetches and its Yosys workers')
  if (data.prepare) { post({ done: await prepare(data).catch(e => ({ fetched: 0, bytes: 0, pruned: 0, error: e.message })) }); return; }
  try {
    const base = new URL(assets);
    // what the flow needs, fetched before it starts (it reads them synchronously)
    const key = [base.href, spec.graph, spec.device, spec.pkg, spec.part].join('|');
    // (a family with its own tools has no device description here: the iCE40's, #2295)
    if (spec.graph && lastDevice?.key !== key) {
      lastDevice = null;
      post({ line: `Loading the device description of ${spec.part} and its bit database…` });
      const graph = await gunzipJson(await fetchOk(new URL(`devices/${spec.graph}`, base), 'the device description'));
      const dev = loadDevice(graph);
      const names = dbFileNames(spec.device, spec.pkg);
      const json = {};
      await Promise.all(Object.entries(names).map(async ([k, f]) => {
        const r = await fetch(new URL(`bitdb/${f}`, base));
        json[k] = r.ok ? await r.json() : null;
      }));
      if (!json.layout || !json.tiles) throw new Error(`no bit database for ${spec.device} on the site`);
      lastDevice = { key, device: dev, db: makeBitDb(dbFilesFrom(json, spec.pkg), dev, spec.part) };
    }
    const { device, db } = lastDevice || {};
    // Yosys, compiled to WebAssembly (YoWASP): fetched once, then kept in Cache Storage (#967); in workers of
    // this worker (#279), the synthesis's mappings from the same netlist in parallel (web/js/yosys-client.js),
    // or in this worker's own thread where it cannot start them
    // (its versioned path: web/js/open-flow-browser.js yosysBundleUrl)
    const bundle = yosysUrl || new URL('vendor/yowasp-yosys/gen/bundle.js', base).href;
    let runYosys = null, loading = false;
    const inThread = async (args, yfiles, onLine) => {
      if (!runYosys) ({ runYosys } = await import(bundle));
      return runYosysOnce(runYosys, args, yfiles, onLine);
    };
    let pool = null;
    if (!pools.has(bundle) && typeof Worker !== 'undefined') {
      try {
        const url = URL.createObjectURL(new Blob([yosysSource(bundle)], { type: 'text/javascript' }));
        pools.set(bundle, yosysPool({ spawn: () => new Worker(url) }));   // (classic workers: from a file:// page too, #512)
      } catch { pools.set(bundle, null); }
    }
    pool = pools.get(bundle) || null;
    const yosys = Object.assign(async (args, yfiles, onLine) => {
      if (!loading) {
        loading = true;
        // (what the wait is: the first time, a download of 16.7 MB, #967)
        const kept = loaded.has(bundle) || await assetCached(new URL('yosys.core.wasm', bundle));
        loaded.add(bundle);
        post({ line: kept ? 'Loading Yosys (WebAssembly, kept by this browser)…'
          : 'Downloading Yosys, the synthesis tool (WebAssembly, about 17 MB: once, then kept by this browser)…' });
      }
      if (pool) {
        try { return await pool(args, yfiles, onLine); } catch (e) {
          if (!e.workerFailed) throw e;
          // no worker here (a browser without workers in workers, or a blocked Blob: WebKit's from a file://
          // page, #556): this thread from now on
          pools.set(bundle, pool = null);
        }
      }
      return inThread(args, yfiles, onLine);
    }, { parallel: pool ? pool.parallel : 1 });
    const { io, store } = workerIo({ post, sources, simSources, ucf, ucfName, files, device: () => device, bitDb: () => db, yosys,
      // (the nextpnr engine's, #2136: its bundle and the device's chip database fetched on its first use, then kept by the cache)
      nextpnr: ice40Url ? { ice40: ice40Browser(ice40Url, post) }
        : spec.engine && spec.engine !== 'silinx' ? { spartan3e: nextpnrBrowser(nextpnrUrl || new URL('vendor/nextpnr-spartan/gen/bundle.js', base).href, post) } : null });
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
