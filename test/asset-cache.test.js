// The browser edition's versioned assets in Cache Storage (web/js/asset-cache.js, #967), with a fake
// Cache Storage and a fake network: what is versioned, a hit read with no request, a miss fetched and
// kept, what is never kept (other URLs, other methods, failures), no cache at all (an opaque origin),
// the fetch in a Yosys Blob worker's code, the prefetch (once, not with Save-Data or on 3G) and the
// pruning of the other versions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { isVersionedAsset, assetFetch, assetFetchSource, assetCached, prefetchAssets, pruneAssetCache, assetDigest, ASSET_CACHE, YOSYS_FILES } from '../web/js/asset-cache.js';

const SITE = 'https://pmnmalo.github.io/Silinx-ISE/';
const WASM = `${SITE}assets/vendor/yowasp-yosys/0.70.1258/gen/yosys.core.wasm`;
const GRAPH = `${SITE}assets/15.12.0/devices/xc3s250ecp132-4.json.gz`;

class FakeCache {
  constructor() { this.map = new Map(); this.puts = []; }
  async match(url) { const r = this.map.get(String(url)); return r ? r.clone() : undefined; }
  async put(url, res) { this.puts.push(String(url)); this.map.set(String(url), new Response(await res.arrayBuffer(), { status: res.status, headers: res.headers })); }
  async keys() { return [...this.map.keys()].map(url => ({ url })); }
  async delete(req) { return this.map.delete(typeof req === 'string' ? req : req.url); }
}
/** A scope (a worker's self) with a fake network and a fake Cache Storage (caches: false, none; 'throws': an opaque origin's). */
function scope({ caches = true, status = 200 } = {}) {
  const cache = new FakeCache(), requests = [];
  const s = {
    requests, cache, crypto: globalThis.crypto, btoa: globalThis.btoa,
    fetch: async (input, init) => {
      const url = typeof input === 'string' ? input : input.href || input.url;
      requests.push([url, init?.method || 'GET']);
      return new Response(`body of ${url}`, { status, headers: { 'content-length': String(`body of ${url}`.length) } });
    },
  };
  if (caches === 'throws') Object.defineProperty(s, 'caches', { get() { throw new Error('SecurityError: opaque origin'); } });
  else if (caches) s.caches = { open: async name => { assert.equal(name, ASSET_CACHE); return cache; } };
  return s;
}
const settle = () => new Promise(r => setTimeout(r, 10));

test('#967 the versioned assets: Yosys and nextpnr (#2136) of a version, a version\'s (or a development build\'s) device descriptions and bit database', () => {
  for (const u of [WASM, `${SITE}assets/vendor/yowasp-yosys/0.70.1258/gen/bundle.js`, GRAPH, `${SITE}assets/15.12.0/bitdb/s3e-tiles.json`,
    `${SITE}dev/assets/dev-770bf18/devices/xc3s500efg320-4.json.gz`, `${SITE}dev/assets/vendor/yowasp-yosys/0.71.3/gen/yosys-resources.0.tar`,
    // nextpnr's bundle and its chip databases (#2136)
    `${SITE}assets/vendor/nextpnr-spartan/0.11.2/gen/bundle.js`, `${SITE}assets/vendor/nextpnr-spartan/0.11.2/gen/nextpnr-himbaechel-spartan3e.core.wasm`,
    `${SITE}dev/assets/vendor/nextpnr-spartan/0.11.2/chipdb/chipdb-xc3s250e.bin.gz`])
    assert.equal(isVersionedAsset(u), true, u);
  // unversioned: the local server's Yosys and the tests' assets, the page, version.json; a folder; a query
  for (const u of ['http://127.0.0.1:8/vendor/yowasp-yosys/gen/yosys.core.wasm', 'http://127.0.0.1:8/vendor/nextpnr-spartan/gen/bundle.js', `${SITE}assets/vendor/nextpnr-spartan/0.11.2/package.json`, 'http://127.0.0.1:8/assets/devices/xc3s250ecp132-4.json.gz', SITE, `${SITE}version.json`,
    `${SITE}assets/15.12.0/devices/`, `${GRAPH}?x=1`, `${SITE}assets/latest/devices/a.json.gz`])
    assert.equal(isVersionedAsset(u), false, u);
});

test('#967 assetFetch: a miss is fetched and kept, the next fetch of it reads the cache with no request', async () => {
  const s = scope();
  assert.equal(assetFetch(s), true);
  assert.equal(assetFetch(s), false, 'installed once');
  const a = await s.fetch(WASM);
  assert.equal(await a.text(), `body of ${WASM}`);
  await settle();
  assert.deepEqual(s.cache.puts, [WASM]);
  const b = await s.fetch(new URL(WASM));
  assert.equal(await b.text(), `body of ${WASM}`);
  assert.deepEqual(s.requests, [[WASM, 'GET']], 'the second from the cache');
  assert.equal(await assetCached(WASM, s), true);
  assert.equal(await assetCached(GRAPH, s), false);
});

test('#967 assetFetch: other URLs and methods go to the network, never kept; a failed response is not kept', async () => {
  const s = scope();
  assetFetch(s);
  await s.fetch(`${SITE}version.json`);
  await s.fetch(`${SITE}version.json`);
  await s.fetch(GRAPH, { method: 'POST' });
  assert.equal(s.requests.length, 3);
  const bad = scope({ status: 404 });
  assetFetch(bad);
  assert.equal((await bad.fetch(GRAPH)).status, 404);
  await bad.fetch(GRAPH);
  await settle();
  assert.deepEqual(bad.cache.puts, []);
  assert.equal(bad.requests.length, 2);
});

test('#967 assetFetch with no Cache Storage (none, or an opaque origin\'s that throws: a page opened from a file): the network, as before', async () => {
  for (const caches of [false, 'throws']) {
    const s = scope({ caches });
    assetFetch(s);
    assert.equal(await (await s.fetch(WASM)).text(), `body of ${WASM}`);
    await s.fetch(WASM);
    assert.equal(s.requests.length, 2, String(caches));
    assert.equal(await assetCached(WASM, s), false);
    assert.deepEqual(await prefetchAssets([WASM], { scope: s }), { fetched: 0, bytes: 0 });
    assert.equal(await pruneAssetCache(`${SITE}assets/`, [], { scope: s }), 0);
  }
});

test('#967 assetFetchSource: the code at the front of a Yosys Blob worker installs the cache on its self, before Yosys loads', async () => {
  const s = scope();
  const src = assetFetchSource();
  new Function('self', src)(s);   // (the worker's code, its global self)
  assert.equal(s.fetch.assetCache, true);
  await (await s.fetch(WASM)).text();
  await settle();
  await s.fetch(WASM);
  assert.equal(s.requests.length, 1);
});

test('#967 prefetchAssets: what is not cached yet, one at a time; not with Save-Data or on a 2G/3G connection; a network failure stops it', async () => {
  const s = scope();
  const urls = [GRAPH, ...YOSYS_FILES.map(f => new URL(f, WASM).href)];
  const r = await prefetchAssets(urls, { scope: s });
  assert.equal(r.fetched, urls.length);
  assert.equal(r.bytes, urls.reduce((n, u) => n + `body of ${u}`.length, 0));
  assert.deepEqual(s.cache.puts, urls);
  assert.deepEqual(await prefetchAssets(urls, { scope: s }), { fetched: 0, bytes: 0 }, 'all there: nothing fetched');
  assert.equal(s.requests.length, urls.length);
  for (const connection of [{ saveData: true }, { effectiveType: '3g' }, { effectiveType: 'slow-2g' }]) {
    const t = scope();
    t.navigator = { connection };
    assert.deepEqual(await prefetchAssets(urls, { scope: t }), { fetched: 0, bytes: 0 }, JSON.stringify(connection));
    assert.equal(t.requests.length, 0);
  }
  const ok4g = scope();
  ok4g.navigator = { connection: { effectiveType: '4g' } };
  assert.equal((await prefetchAssets([GRAPH], { scope: ok4g })).fetched, 1);
  const off = scope();
  let n = 0;
  const r2 = await prefetchAssets(urls, { scope: off, fetchFn: async u => { if (++n === 2) throw new TypeError('Failed to fetch'); return off.fetch(u); } });
  assert.deepEqual(r2, { fetched: 1, bytes: `body of ${GRAPH}`.length });
  assert.equal(n, 2, 'stopped at the failure');
});

test('#967 pruneAssetCache: this edition\'s other versions deleted; this version\'s, the other edition\'s and unversioned entries kept', async () => {
  const s = scope();
  const keep = [`${SITE}assets/15.13.0/`, `${SITE}assets/vendor/yowasp-yosys/0.71.0/gen/`];
  const urls = {
    old: [`${SITE}assets/15.12.0/devices/a.json.gz`, `${SITE}assets/15.12.0/bitdb/s3e-tiles.json`, `${SITE}assets/vendor/yowasp-yosys/0.70.1258/gen/yosys.core.wasm`],
    kept: [`${SITE}assets/15.13.0/devices/a.json.gz`, `${SITE}assets/vendor/yowasp-yosys/0.71.0/gen/yosys.core.wasm`,
      `${SITE}dev/assets/dev-770bf18/devices/a.json.gz`, `${SITE}dev/assets/vendor/yowasp-yosys/0.70.1258/gen/bundle.js`, `${SITE}assets/other.json`],
  };
  for (const u of [...urls.old, ...urls.kept]) s.cache.map.set(u, new Response('x'));
  assert.equal(await pruneAssetCache(`${SITE}assets/`, keep, { scope: s }), urls.old.length);
  assert.deepEqual([...s.cache.map.keys()].sort(), [...urls.kept].sort());
  // the development edition's own: its older builds go, the stable edition's stay
  assert.equal(await pruneAssetCache(`${SITE}dev/assets/`, [`${SITE}dev/assets/dev-abc1234/`, `${SITE}dev/assets/vendor/yowasp-yosys/0.70.1258/gen/`], { scope: s }), 1);
  assert.equal(s.cache.map.has(`${SITE}assets/15.13.0/devices/a.json.gz`), true);
});

// #1237: each asset's SHA-256 (the build's, by its path under assets/), as Node computes it
const sha = text => `sha256-${crypto.createHash('sha256').update(text).digest('base64')}`;
const key = url => url.slice(url.lastIndexOf('/assets/') + 8);

test('#1237 assetDigest: the SHA-256 the build writes (base64, sha256- prefix)', async () => {
  assert.equal(await assetDigest(new TextEncoder().encode('abc')), sha('abc'));
  assert.equal(await assetDigest(new ArrayBuffer(0)), sha(''));
});

test('#1237 assetFetch with the assets\' SHA-256: a good copy used, a copy that differs dropped and fetched again, a download that differs not kept', async () => {
  const s = scope();
  s.SILINX_ASSET_INTEGRITY = { [key(WASM)]: sha(`body of ${WASM}`), [key(GRAPH)]: sha('the real graph') };
  assetFetch(s);
  // a download that is the asset: kept, then read from the cache with no request
  assert.equal(await (await s.fetch(WASM)).text(), `body of ${WASM}`);
  await settle();
  assert.deepEqual(s.cache.puts, [WASM]);
  assert.equal(await (await s.fetch(WASM)).text(), `body of ${WASM}`);
  assert.equal(s.requests.length, 1);
  // a cached copy that differs (truncated, or put there by another page of the site): dropped, fetched again, kept anew
  s.cache.map.set(WASM, new Response('poisoned', { status: 200 }));
  assert.equal(await (await s.fetch(WASM)).text(), `body of ${WASM}`);
  await settle();
  assert.equal(s.requests.length, 2);
  assert.equal(await (await s.cache.match(WASM)).text(), `body of ${WASM}`);
  // a download that differs from the build's: given as it came (the run says what fails), never kept
  assert.equal(await (await s.fetch(GRAPH)).text(), `body of ${GRAPH}`);
  await settle();
  assert.equal(await assetCached(GRAPH, s), false);
  await s.fetch(GRAPH);
  assert.equal(s.requests.length, 4, 'fetched again each time');
  // an asset the build gave no SHA-256 (a test's, the local server's): as before, kept unchecked
  const other = `${SITE}assets/15.12.0/bitdb/s3e-tiles.json`;
  s.cache.map.set(other, new Response('anything'));
  assert.equal(await (await s.fetch(other)).text(), 'anything');
});

test('#1237 prefetchAssets with the assets\' SHA-256: a download that differs is not kept', async () => {
  const s = scope();
  s.SILINX_ASSET_INTEGRITY = { [key(GRAPH)]: sha(`body of ${GRAPH}`), [key(WASM)]: sha('not what the network says') };
  const r = await prefetchAssets([GRAPH, WASM], { scope: s });
  assert.deepEqual(r, { fetched: 1, bytes: `body of ${GRAPH}`.length });
  assert.deepEqual(s.cache.puts, [GRAPH]);
  assert.equal(await (await s.cache.match(GRAPH)).text(), `body of ${GRAPH}`);
});

test('#1237 assetFetchSource: the Yosys worker\'s code carries the SHA-256 and checks its cached copies', async () => {
  const s = scope();
  const src = assetFetchSource({ [key(WASM)]: sha(`body of ${WASM}`) });
  assert.match(src, /^self\.SILINX_ASSET_INTEGRITY = \{"vendor\/yowasp-yosys\/0\.70\.1258\/gen\/yosys\.core\.wasm":"sha256-[^"]+"\};\n/);
  new Function('self', src)(s);
  s.cache.map.set(WASM, new Response('poisoned'));
  assert.equal(await (await s.fetch(WASM)).text(), `body of ${WASM}`);
  assert.equal(s.requests.length, 1, 'the poisoned copy not used');
  assert.match(assetFetchSource(), /^self\.SILINX_ASSET_INTEGRITY = null;\n/, 'none given: nothing checked');
});
