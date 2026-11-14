// Web Worker: the Silinx toolchain's flow (packages/silinx-fpga/src/open-flow-core.js: synthesis with Yosys in
// WebAssembly, pack, place and route, timing, bitstream) in the browser edition, off the page's thread.
// The device description, the bit database and Yosys are fetched from `assets` (the site's
// assets/ folder; web/js/open-flow-browser.js chooses it).
//   in:  { spec, sources: [{ path, lang, text }], simSources (the test benches), ucf, ucfName, files: { name: text }, assets, yosys (its bundle's URL),
//          nextpnr, nextpnrS6, nextpnrXc7 (Silinx's nextpnr bundles: the Spartan-3E's, the Spartan-6's, the 7-series'), nextpnrOwn }
//   out: { line } … { write: name, data } … { report } … then { done: { ok, report, error, view } }
//   in:  { prepare: { graph, part, family, device, pkg, nextpnr }, assets, yosys, nextpnr, root }: what a run of that device fetches
//        (nextpnr and the device's chip database too when prepare.nextpnr: the project's engine is not Silinx's, #2136; the
//        7-series': no device description, its bit database bitdb/xc7/<part>.json.gz and nextpnr-himbaechel-xc7, #3143),
//        fetched into Cache Storage (web/js/asset-cache.js, #967), this edition's other versions deleted from it
//   out: { done: { fetched, bytes, pruned } }
import { runOpenFlow } from '/core/flow-ide.js';
import { familyProfile } from '/core/family-profile.js';
import { loadDevice, dbFileNames, dbFilesFrom, makeBitDb, fetchBitDbS6, s6DbNames, bitDbXc7, nextpnrIo, ice40Io, ecp5Io, gowinIo, runYosysOnce, yosysWorkerSource, readableBlobs } from '/packages/silinx-fpga/src/index.js';
import { yosysPool } from './yosys-client.js';
import { workerIo } from './open-flow-worker-io.js';
import { parseXdl, fpgaModel, deviceGrid, MODEL_VERSION } from '/packages/silinx-fpga/src/parts.js';
import { ice40FromTarball } from './nextpnr-ice40-browser.js';
import { routerFallback } from './nextpnr-router-fallback.js';
import { assetFetch, assetFetchSource, assetCached, prefetchAssets, pruneAssetCache, YOSYS_FILES, nextpnrFiles, nextpnrChipdb } from './asset-cache.js';

// (Yosys in this worker's own thread, where it cannot start workers of its own: its Blobs readable, #556)
readableBlobs();
// the versioned assets from Cache Storage (#967): this worker's fetches, Yosys's in its thread among them
const netFetch = self.fetch.bind(self);
assetFetch(self);

const fetchOk = async (url, what) => {
  const r = await fetch(url);
  // (a page downloaded long ago: the site keeps the assets of its last releases only, #487)
  if (r.status === 404) throw new Error(`${what} could not be loaded (${url}: HTTP 404): the site no longer has this version's files; download the current Silinx.html`);
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
async function prepare({ prepare: d, assets, yosys, nextpnr, keep, root }) {
  const base = new URL(assets);
  // (this version's nextpnr kept, its gen/ and chipdb/, whatever this project's engine; nextpnr: the family's, #2288; keep: this
  // version's every nextpnr bundle, the other families' too, #3143)
  const pruned = await pruneAssetCache(root, [base.href, new URL('.', yosys).href, ...(keep || (nextpnr ? [nextpnr] : [])).map(u => new URL('..', u).href)]);
  const urls = [...(d.graph ? [new URL(`devices/${d.graph}`, base)] : []), ...dbUrls(d, base),
    ...YOSYS_FILES.map(f => new URL(f, yosys)),
    ...(nextpnr && d.nextpnr ? [...nextpnrFiles(uarchOf(d.family)).map(f => new URL(f, nextpnr)), await chipdbUrl(d, nextpnr)] : [])];
  return { ...await prefetchAssets(urls, { fetchFn: netFetch }), pruned };
}
// a family's nextpnr micro-architecture (the name of its WebAssembly files): its profile's, else the Spartan-3E's or -6's
const uarchOf = family => { const f = familyProfile(family).openFlow; return f?.uarch || (f?.bitDb === 's6' ? 'spartan6' : 'spartan3e'); };
// the URL of a device's chip database: beside the bundle, by the device's name; the package's own (its chipdbUrl) where a
// part takes another device's (the 7-series': the xc7a35t the xc7a50t's, #3143)
const chipdbUrl = async (d, nextpnr) => (familyProfile(d.family).openFlow?.uarch ? (await import(nextpnr)).chipdbUrl(d.part) : new URL(nextpnrChipdb(d.device), nextpnr));
// a device's bit database files: the Spartan-3E's in bitdb/, the Spartan-6's in bitdb/s6 (#2103)
// (the 7-series': one gzipped file per part in bitdb/xc7, #3143)
const dbUrls = (d, base) => (familyProfile(d.family).openFlow?.bitDb === 's6' ? s6DbNames(d.part).map(n => new URL(`bitdb/s6/${n}.json`, base))
  : familyProfile(d.family).openFlow?.bitDb === 'xc7' ? [xc7DbUrl(d.part, base)]
  : Object.values(dbFileNames(d.device, d.pkg)).map(f => new URL(`bitdb/${f}`, base)));
const xc7DbUrl = (part, base) => new URL(`bitdb/xc7/${part}.json.gz`, base);
// the Spartan-6's bit databases (fpga/s6/bitdb.js fetchBitDbS6: the same object as the server's loadBitDbS6)
const fetchS6Db = (part, base) => fetchBitDbS6(part, async f => {
  const r = await fetch(new URL(`bitdb/s6/${f}`, base));
  return r.ok ? r.json() : null;
});
// the last device description and bit database loaded (1.6-2.5 MB gzipped): the next run of the same
// device uses them again (the flow does not change them) instead of fetching and parsing them anew
let lastDevice = null;   // { key, device, db }

// nextpnr in this worker's thread (#2136), from its bundle; the log says what the wait is the first time
const nextpnrs = new Map();
const xc7 = familyProfile('artix7').openFlow;
function nextpnrBrowser(url, post, runner, mb = 7) {
  if (!nextpnrs.has(url)) nextpnrs.set(url, nextpnrIo(() => import(url), runner));
  const io = nextpnrs.get(url);
  return {
    run: io.run,
    chipdb: async part => {
      if (!loaded.has(`${url} ${part}`)) {
        loaded.add(`${url} ${part}`);
        post({ line: `Loading nextpnr and the chip database of ${part} (WebAssembly, about ${mb} MB: once, then kept by this browser)…` });
      }
      return io.chipdb(part);
    },
  };
}

// a family's nextpnr and packer of YoWASP's (the iCE40's icepack #2295, the ECP5's ecppack #2302; the Gowin's nextpnr alone #2303): their bundle served by the
// local server (its URL), or their package from npm's registry, kept by this browser (the published editions: its { url,
// integrity }, #2444); own: { family, where, tools, mb }
// (the family the page names compared with these only: never a function looked up by its name, #3662, #3753)
const OWN_IO = [['ice40', ice40Io], ['ecp5', ecp5Io], ['gowin', gowinIo]];
function ownIo(family) {
  const io = OWN_IO.find(([f]) => f === family)?.[1];
  if (!io) throw new Error(`the family '${family}' has no tools of its own in the browser`);
  return io;
}
const owns = new Map();
function ownBrowser({ family, where, tools, mb }, post) {
  const key = `${family} ${where.url || where}`;
  const cache = tools ? { tools, mb, cache: `silinx-${tools.split(' ')[0]}` } : {};
  let mod = null;
  const load = () => (mod ||= where.url ? ice40FromTarball(where, { log: line => post({ line }), ...cache }) : import(where));
  // (a file of the package: kept with its download, or beside the bundle the local server serves; the Gowin's, #2303)
  const file = async name => {
    const m = await load();
    if (m.packageFile) return m.packageFile(name);
    const r = await fetch(new URL(`../${name}`, where));
    return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
  };
  if (!owns.has(key)) {
    const io = ownIo(family);
    owns.set(key, io(load, file));
  }
  return owns.get(key);
}

self.onmessage = async ({ data }) => {
  const { spec, sources, simSources = [], ucf, ucfName, files, assets, yosys: yosysUrl, nextpnr: nextpnrUrl, nextpnrS6: nextpnrS6Url, nextpnrXc7: nextpnrXc7Url, nextpnrIce40: ice40Url, nextpnrOwn } = data;
  // (the iCE40's bundle by its own key, as before #2302)
  const own = nextpnrOwn || (ice40Url && { family: 'ice40', where: ice40Url });
  // every message carries the run's id (web/js/open-flow-browser.js: each run hears only its own)
  const post = m => self.postMessage({ ...m, id: data.id });
  if (data.integrity) self.SILINX_ASSET_INTEGRITY = data.integrity;   // (the assets' SHA-256, #1237: this worker's fetches and its Yosys workers')
  if (data.prepare) { post({ done: await prepare(data).catch(e => ({ fetched: 0, bytes: 0, pruned: 0, error: e.message })) }); return; }
  try {
    const base = new URL(assets);
    // what the flow needs, fetched before it starts (it reads them synchronously)
    const key = [base.href, spec.family, spec.graph, spec.device, spec.pkg, spec.part].join('|');
    // (a family with its own tools has no device description here: the iCE40's, #2295)
    if (spec.graph && lastDevice?.key !== key) {
      lastDevice = null;
      post({ line: `Loading the device description of ${spec.part} and its bit database…` });
      const graph = await gunzipJson(await fetchOk(new URL(`devices/${spec.graph}`, base), 'the device description'));
      const dev = loadDevice(graph);
      if (familyProfile(spec.family).openFlow?.bitDb === 's6') {
        const db = await fetchS6Db(spec.part, base);
        if (!db.slices.lut || !db.iob) throw new Error(`no bit database for ${spec.device} on the site`);
        lastDevice = { key, device: dev, db };
      } else {
        const names = dbFileNames(spec.device, spec.pkg);
        const json = {};
        await Promise.all(Object.entries(names).map(async ([k, f]) => {
          const r = await fetch(new URL(`bitdb/${f}`, base));
          json[k] = r.ok ? await r.json() : null;
        }));
        if (!json.layout || !json.tiles) throw new Error(`no bit database for ${spec.device} on the site`);
        lastDevice = { key, device: dev, db: makeBitDb(dbFilesFrom(json, spec.pkg), dev, spec.part) };
      }
    } else if (familyProfile(spec.family).openFlow?.bitDb === 'xc7' && lastDevice?.key !== key) {
      // (the 7-series': no device description, Project X-Ray's bit database of the part, #3143)
      lastDevice = null;
      post({ line: `Loading the bit database of ${spec.part}…` });
      const r = await fetch(xc7DbUrl(spec.part, base));
      if (r.status === 404) throw new Error(`no 7-series bit database for the ${spec.part} on the site`);
      if (!r.ok) throw new Error(`the bit database could not be loaded (${xc7DbUrl(spec.part, base)}: HTTP ${r.status})`);
      lastDevice = { key, device: null, db: bitDbXc7(await gunzipJson(r)) };
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
      // (the nextpnr engine's, #2136: its bundle and the device's chip database fetched on its first use, then kept by the
      // cache; the Spartan-6's, #2288)
      nextpnr: own ? { [own.family]: ownBrowser(own, post) }
        : spec.engine && spec.engine !== 'silinx' ? {
          spartan3e: nextpnrBrowser(nextpnrUrl || new URL('vendor/nextpnr-spartan/gen/bundle.js', base).href, post),
          spartan6: nextpnrBrowser(nextpnrS6Url || new URL('vendor/nextpnr-spartan6/gen/bundle.js', base).href, post, 'runNextpnrHimbaechelSpartan6', 5),
          // (the 7-series', #3143: router2 as the local server's, router1 where it runs out of this browser's memory)
          xc7: routerFallback(nextpnrBrowser(nextpnrXc7Url || new URL('vendor/nextpnr-xc7/gen/bundle.js', base).href, post, xc7.runner, xc7.mb)),
        } : null });
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
