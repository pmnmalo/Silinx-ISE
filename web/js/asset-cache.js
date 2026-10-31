// The browser edition's versioned assets kept in Cache Storage (#967): Yosys in WebAssembly
// (assets/vendor/yowasp-yosys/<its version>/gen/*, 16.7 MB gzipped), nextpnr in WebAssembly and its chip databases
// (assets/vendor/nextpnr-spartan/<its version>/gen|chipdb/*, #2136) and the device descriptions and the
// bit database (assets/<version>/devices|bitdb/*). Their URLs name their version, so that what one holds
// never changes: they are read from the cache with no request at all. The browser's HTTP cache kept them
// 10 minutes only (GitHub Pages' max-age=600), and its revalidation downloaded Yosys again whenever the
// site had been deployed since (its ETags are the files' times of deployment: every push to main).
// - assetFetch(scope): the scope's fetch replaced by one that reads and fills the cache, for the flow
//   worker and the Yosys workers (YoWASP's bundle takes globalThis.fetch when it loads: replaced before);
//   self-contained, its text goes into the Yosys Blob workers (assetFetchSource);
// - prefetchAssets: what a device's Implement needs, fetched into the cache when a project opens;
// - pruneAssetCache: the entries of this edition's other versions deleted.
// Each asset's SHA-256, which the build writes into the page (scripts/build-standalone.mjs, #1237: the layout's
// integrity, by the path under assets/; a worker's scope.SILINX_ASSET_INTEGRITY), is checked before a copy is
// kept or used: a truncated download, or an entry another page of the same site put there, is not used.
// Where Cache Storage is not available (a page opened from a file: an opaque origin; an http page that
// is not localhost) nothing changes: the HTTP cache, as before.

export const ASSET_CACHE = 'silinx-assets';
/** Is url one of the versioned assets (its content never changes)? */
export const isVersionedAsset = url => /\/vendor\/yowasp-yosys\/\d[^/]*\/gen\/[^/?#]+$|\/vendor\/nextpnr-spartan\/\d[^/]*\/(gen|chipdb)\/[^/?#]+$|\/assets\/(\d+\.\d+\.\d+[^/]*|dev-[0-9a-f]+)\/(devices|bitdb)\/[^/?#]+$/.test(String(url));

/** The scope's fetch reads the versioned assets from Cache Storage, and puts there those it fetches. Returns
 *  whether it replaced it. Self-contained: assetFetchSource writes its text into the Yosys Blob workers. */
export function assetFetch(scope = globalThis, name = 'silinx-assets') {
  const net = scope.fetch;
  if (typeof net !== 'function' || net.assetCache) return false;
  const versioned = url => /\/vendor\/yowasp-yosys\/\d[^/]*\/gen\/[^/?#]+$|\/assets\/(\d+\.\d+\.\d+[^/]*|dev-[0-9a-f]+)\/(devices|bitdb)\/[^/?#]+$/.test(url);
  const open = () => { try { return scope.caches ? scope.caches.open(name) : null; } catch { return null; } };   // (an opaque origin throws)
  // the SHA-256 the build wrote for url (none: not checked), and a response's body checked against it (null: it differs)
  const expected = url => { const i = url.lastIndexOf('/assets/'); return i >= 0 ? scope.SILINX_ASSET_INTEGRITY?.[url.slice(i + 8)] : undefined; };
  const checked = async (res, want) => {
    const buf = await res.arrayBuffer();
    let bin = '';
    for (const b of new Uint8Array(await scope.crypto.subtle.digest('SHA-256', buf))) bin += String.fromCharCode(b);
    return `sha256-${scope.btoa(bin)}` === want ? new Response(buf, { status: res.status, statusText: res.statusText, headers: res.headers }) : null;
  };
  const cached = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input?.url;
    if (!url || !versioned(url) || (init?.method && init.method !== 'GET')) return net.call(scope, input, init);
    const want = expected(url);
    let cache = null;
    try {
      cache = await open();
      const hit = cache && await cache.match(url);
      if (hit && !want) return hit;
      const ok = hit && await checked(hit, want);
      if (ok) return ok;
      if (hit) await cache.delete(url);   // (not the asset: fetched again)
    } catch { cache = null; }
    const res = await net.call(scope, input, init);
    if (!cache || !res.ok || res.status !== 200) return res;
    // (kept as it is read: the copy goes into the cache while the caller reads the response; a full disk keeps nothing)
    if (!want) { cache.put(url, res.clone()).catch(() => {}); return res; }
    // checked first: kept only when it is the asset (a download that differs is given as it came, not kept)
    const copy = res.clone(), ok = await checked(res, want);
    if (ok) { cache.put(url, ok.clone()).catch(() => {}); return ok; }
    return copy;
  };
  cached.assetCache = true;
  scope.fetch = cached;
  return true;
}

/** The code that installs assetFetch in a worker, for the front of a Yosys Blob worker's code (packages/silinx-fpga/src/synth-open.js
 *  yosysWorkerSource): run before its import of YoWASP's bundle. */
export const assetFetchSource = (integrity = globalThis.SILINX_ASSET_INTEGRITY) =>
  `self.SILINX_ASSET_INTEGRITY = ${JSON.stringify(integrity || null)};\n(${assetFetch})(self, ${JSON.stringify(ASSET_CACHE)});\n`;

const cacheOf = async (scope = globalThis) => { try { return scope.caches ? await scope.caches.open(ASSET_CACHE) : null; } catch { return null; } };

/** check(url, res) -> the response to keep (its body checked against the asset's SHA-256, when the build gave one), or null. */
function integrityCheck(scope) {
  return async (url, res) => {
    const i = url.lastIndexOf('/assets/');
    const want = i >= 0 ? scope.SILINX_ASSET_INTEGRITY?.[url.slice(i + 8)] : undefined;
    if (!want) return res;
    const buf = await res.arrayBuffer();
    return await assetDigest(buf, scope) === want ? new Response(buf, { status: res.status, statusText: res.statusText, headers: res.headers }) : null;
  };
}
/** 'sha256-<base64>' of bytes, as the build writes it (scripts/build-standalone.mjs). */
export async function assetDigest(buf, scope = globalThis) {
  let bin = '';
  for (const b of new Uint8Array(await scope.crypto.subtle.digest('SHA-256', buf))) bin += String.fromCharCode(b);
  return `sha256-${scope.btoa(bin)}`;
}

/** Is url in the cache? (false where there is no cache) */
export async function assetCached(url, scope = globalThis) {
  try { return !!await (await cacheOf(scope))?.match(String(url)); } catch { return false; }
}

/** The files of Yosys's bundle (YoWASP's gen/): what its first run fetches. */
export const YOSYS_FILES = ['bundle.js', 'yosys.core.wasm', 'yosys.core2.wasm', 'yosys.core3.wasm', 'yosys.core4.wasm', 'yosys-resources.0.tar'];

/** The files of nextpnr's bundle (its gen/, #2136) and a device's chip database beside it: what its first run fetches. */
export const NEXTPNR_FILES = ['bundle.js', 'nextpnr-himbaechel-spartan3e.core.wasm', 'nextpnr-himbaechel-spartan3e.core2.wasm',
  'nextpnr-himbaechel-spartan3e.core3.wasm', 'nextpnr-himbaechel-spartan3e.core4.wasm', 'nextpnr-himbaechel-spartan3e-resources.0.tar'];
export const nextpnrChipdb = device => `../chipdb/chipdb-${device}.bin.gz`;

/**
 * Fetch urls into the cache, one at a time, those it holds skipped: { fetched, bytes } (bytes: as their Content-Length says, compressed).
 * Nothing without a cache, with Save-Data, or on a 2G/3G connection. A failure stops quietly (the run fetches them).
 */
export async function prefetchAssets(urls, { scope = globalThis, fetchFn = scope.fetch?.bind(scope) } = {}) {
  const out = { fetched: 0, bytes: 0 };
  const conn = scope.navigator?.connection;
  if (conn?.saveData || /(^|-)[23]g$/.test(conn?.effectiveType || '')) return out;
  const cache = await cacheOf(scope);
  if (!cache || !fetchFn) return out;
  const check = integrityCheck(scope);
  for (const url of urls.map(String)) {
    try {
      if (await cache.match(url)) continue;
      const res = await fetchFn(url);
      if (!res.ok) continue;
      const bytes = Number(res.headers.get('content-length')) || 0;
      const ok = await check(url, res);
      if (!ok) continue;   // (not the asset: not kept, the run fetches it)
      await cache.put(url, ok);
      out.fetched++; out.bytes += bytes;
    } catch { break; }
  }
  return out;
}

/** Delete the cached versioned assets under root (this edition's assets/) that are not under one of the keep prefixes
 *  (this version's): what an update left. The other edition's (the site's dev/ beside its root) are not touched. */
export async function pruneAssetCache(root, keep, { scope = globalThis } = {}) {
  const cache = await cacheOf(scope);
  if (!cache) return 0;
  let n = 0;
  for (const req of await cache.keys()) {
    const u = req.url;
    if (!u.startsWith(root) || !isVersionedAsset(u) || keep.some(k => u.startsWith(k))) continue;
    if (await cache.delete(req)) n++;
  }
  return n;
}
