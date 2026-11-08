// The browser edition installable as an app (#1051): what its service worker does with each request
// (web/js/sw-policy.js), the worker itself (web/js/sw.js, bundled as the site's sw.js by scripts/pwa.mjs)
// run on a fake Cache Storage and network, its registration (web/js/pwa.js), the manifest and the page's
// link to it. The site in a browser, installable and opened with the site out of reach:
// test/ui/standalone.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { SHELL, pageCacheName, route, staleCaches } from '../web/js/sw-policy.js';
import { serviceWorkerOf, registerServiceWorker } from '../web/js/pwa.js';
import { ICONS, THEME, webManifest, withManifestLink, writePwa } from '../scripts/pwa.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://pmnmalo.github.io/Silinx-ISE/';
const DEV = `${SITE}dev/`;

test('#1051 route: the page network-first, the manifest and icons kept, the versioned assets from their cache, nothing else intercepted', () => {
  const nav = (url) => route({ url, mode: 'navigate' }, SITE);
  const get = (url, scope = SITE) => route({ url, mode: 'cors' }, scope);
  assert.equal(nav(SITE), 'page');
  assert.equal(nav(`${SITE}index.html`), 'page');
  assert.equal(nav(`${SITE}?project=x`), 'page');
  assert.equal(get(SITE), 'network', 'the page fetched, not opened (the update check reads version.json)');
  assert.equal(nav(`${SITE}Silinx.html`), 'network', 'the downloaded file');
  for (const f of SHELL) assert.equal(get(`${SITE}${f}`), 'shell', f);
  assert.equal(get(`${SITE}icons/other.png`), 'network');
  assert.equal(get(`${SITE}version.json`), 'network');
  assert.equal(get(`${SITE}sw.js`), 'network');
  assert.equal(get(`${SITE}assets/vendor/yowasp-yosys/0.70.1258/gen/bundle.js`), 'asset');
  assert.equal(get(`${SITE}assets/15.12.0/devices/xc3s250ecp132-4.json.gz`), 'asset');
  assert.equal(get(`${SITE}assets/dev-83fea1b/bitdb/s3e-tiles.json`), 'asset');
  assert.equal(get(`${SITE}assets/devices/xc3s250ecp132-4.json.gz`), 'network', 'the unversioned assets of before #487');
  // another origin (GitHub's API, the usage counter), another method
  assert.equal(get('https://api.github.com/repos/pmnmalo/Silinx-ISE/releases/latest'), 'network');
  assert.equal(get('https://gc.zgo.at/count.js'), 'network');
  assert.equal(route({ url: `${SITE}manifest.webmanifest`, method: 'POST' }, SITE), 'network');
  assert.equal(route({}, SITE), 'network');
  assert.equal(route({ url: SITE, mode: 'navigate' }, undefined), 'network');
  // the root's worker leaves dev/ to the development edition's own; that one has the same rules in its folder
  assert.equal(nav(DEV), 'network');
  assert.equal(get(`${DEV}manifest.webmanifest`), 'network');
  assert.equal(get(`${DEV}assets/dev-83fea1b/bitdb/s3e-tiles.json`), 'network');
  assert.equal(route({ url: DEV, mode: 'navigate' }, DEV), 'page');
  assert.equal(get(`${DEV}manifest.webmanifest`, DEV), 'shell');
  assert.equal(get(`${DEV}assets/dev-83fea1b/bitdb/s3e-tiles.json`, DEV), 'asset');
  assert.equal(route({ url: SITE, mode: 'navigate' }, DEV), 'network', 'outside its scope');
});

test('#1051 pageCacheName / staleCaches: an update deletes its edition\'s other builds\' caches, never the other edition\'s or the assets\'', () => {
  const cur = pageCacheName(SITE, '15.13.0');
  assert.equal(cur, `silinx-page ${SITE} 15.13.0`);
  const names = [pageCacheName(SITE, '15.12.0'), cur, pageCacheName(DEV, 'dev:abc1234 (2026-10-22 10:00)'), 'silinx-assets', 'other'];
  assert.deepEqual(staleCaches(names, SITE, cur), [pageCacheName(SITE, '15.12.0')]);
  const dev = pageCacheName(DEV, 'dev:def5678 (2026-10-22 11:00)');
  assert.deepEqual(staleCaches([...names, dev], DEV, dev), [pageCacheName(DEV, 'dev:abc1234 (2026-10-22 10:00)')]);
  assert.deepEqual(staleCaches([], SITE, cur), []);
});

test('#1051 serviceWorkerOf / registerServiceWorker: only a page served over HTTP(S) that links a manifest; a refusal is not an error', async () => {
  const doc = (href) => ({ querySelector: (sel) => (sel === 'link[rel="manifest"]' && href ? { href } : null) });
  const loc = (href) => new URL(href);
  assert.deepEqual(serviceWorkerOf(doc(`${SITE}manifest.webmanifest`), loc(SITE)), { url: `${SITE}sw.js`, scope: SITE });
  assert.deepEqual(serviceWorkerOf(doc(`${DEV}manifest.webmanifest`), loc(`${DEV}index.html`)), { url: `${DEV}sw.js`, scope: DEV });
  assert.equal(serviceWorkerOf(doc(null), loc(`${SITE}Silinx.html`)), null, 'no manifest: the downloaded file');
  assert.equal(serviceWorkerOf(doc('file:///x/manifest.webmanifest'), loc('file:///x/Silinx.html')), null, 'a file');
  assert.equal(serviceWorkerOf(undefined, undefined), null);
  const calls = [];
  const nav = { serviceWorker: { register: async (url, opts) => { calls.push([url, opts]); return { scope: opts.scope }; } } };
  assert.deepEqual(await registerServiceWorker({ nav, doc: doc(`${SITE}manifest.webmanifest`), loc: loc(SITE) }), { scope: SITE });
  assert.deepEqual(calls, [[`${SITE}sw.js`, { scope: SITE }]]);
  assert.equal(await registerServiceWorker({ nav: {}, doc: doc(`${SITE}manifest.webmanifest`), loc: loc(SITE) }), null, 'no service workers');
  assert.equal(await registerServiceWorker({ nav, doc: doc(null), loc: loc(SITE) }), null);
  assert.equal(calls.length, 1);
  const info = [];
  const orig = console.info;
  console.info = (m) => info.push(m);
  try {
    const refusing = { serviceWorker: { register: async () => { throw new Error('the operation is insecure'); } } };
    assert.equal(await registerServiceWorker({ nav: refusing, doc: doc(`${SITE}manifest.webmanifest`), loc: loc(SITE) }), null);
  } finally { console.info = orig; }
  assert.deepEqual(info, ['Silinx: the page is not kept for offline use (the operation is insecure)']);
});

test('#1051 the manifest: each edition an app of its own, standalone, started and scoped in its folder; icons the files the worker keeps', () => {
  const m = webManifest();
  assert.deepEqual(m, {
    id: './', name: 'Silinx', short_name: 'Silinx',
    description: 'An ISE-like FPGA IDE for teaching digital systems: design, simulate and implement for Spartan-3E boards, in the browser.',
    lang: 'en', start_url: './', scope: './', display: 'standalone', background_color: '#ffffff', theme_color: THEME, icons: ICONS,
  });
  const d = webManifest({ dev: true });
  assert.deepEqual([d.name, d.short_name], ['Silinx (development)', 'Silinx dev']);
  assert.deepEqual(ICONS.map((i) => [i.sizes, i.purpose]), [['192x192', 'any'], ['512x512', 'any'], ['512x512', 'maskable']]);
  assert.deepEqual(ICONS.map((i) => i.src), SHELL.filter((f) => f.startsWith('icons/')));
  // the PNGs at the sizes they are said to have (their IHDR's width and height)
  for (const i of ICONS) {
    const png = fs.readFileSync(path.join(ROOT, 'web', i.src));
    assert.equal(png.subarray(1, 4).toString(), 'PNG', i.src);
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, i.sizes, i.src);
  }
});

test('#1051 withManifestLink: the manifest and the theme colour at the end of <head>, once; a page without <head> refused', () => {
  const page = '<!doctype html><html><head><meta charset="utf-8"><title>t</title></head><body></body></html>';
  const out = withManifestLink(page);
  assert.equal(out, `<!doctype html><html><head><meta charset="utf-8"><title>t</title><link rel="manifest" href="manifest.webmanifest">\n<meta name="theme-color" content="${THEME}">\n</head><body></body></html>`);
  assert.equal(withManifestLink(out), out);
  assert.throws(() => withManifestLink('<p>x</p>'), /no <\/head>/);
});

// ---- the worker, bundled as the site gets it, run on fakes: Cache Storage (by URL), the network (a map of
// URL → body, or a refusal), its events
class FakeCache {
  constructor() { this.m = new Map(); }
  async match(u) { return this.m.get(typeof u === 'string' ? u : u.url)?.clone() ?? undefined; }
  async put(u, res) { this.m.set(typeof u === 'string' ? u : u.url, res); }
  async addAll(reqs) { for (const r of reqs) { const res = await this.net(r); if (!res.ok) throw new TypeError(`addAll: ${r.url} ${res.status}`); await this.put(r.url, res); } }
}
async function loadWorker(scope, label) {
  const site = fs.mkdtempSync(path.join(os.tmpdir(), 'silinx-pwa-'));
  try {
    await writePwa(site, { esbuild: await import('esbuild'), label, dev: false });
    const files = fs.readdirSync(site).sort();
    assert.deepEqual(files, ['icons', 'manifest.webmanifest', 'sw.js']);
    assert.deepEqual(fs.readdirSync(path.join(site, 'icons')).sort(), ['silinx-192.png', 'silinx-512.png', 'silinx-maskable-512.png']);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(site, 'manifest.webmanifest'), 'utf8')), webManifest());
    const code = fs.readFileSync(path.join(site, 'sw.js'), 'utf8');
    assert.doesNotMatch(code, /\bimport\b|\bexport\b/, 'a classic script: no modules');
    const net = { files: new Map(), down: false, asked: [] };
    const fetch = async (req) => {
      const url = typeof req === 'string' ? req : req.url;
      net.asked.push(url);
      if (net.down) throw new TypeError('Failed to fetch');
      return net.files.has(url) ? new Response(net.files.get(url), { status: 200 }) : new Response('', { status: 404 });
    };
    const stores = new Map();
    const caches = {
      async open(n) { if (!stores.has(n)) { const c = new FakeCache(); c.net = fetch; stores.set(n, c); } return stores.get(n); },
      async keys() { return [...stores.keys()]; },
      async delete(n) { return stores.delete(n); },
    };
    const on = {};
    const state = { skipped: false, claimed: false };
    const self = {
      registration: { scope }, addEventListener: (t, f) => { on[t] = f; },
      skipWaiting: async () => { state.skipped = true; }, clients: { claim: async () => { state.claimed = true; } },
    };
    vm.runInNewContext(code, { self, caches, fetch, Request, Response, URL, console });
    const fire = async (type, init = {}) => {
      let wait = null, answer = null;
      on[type]?.({ ...init, waitUntil: (p) => { wait = p; }, respondWith: (p) => { answer = p; } });
      await wait;
      return answer && await answer;
    };
    return { net, stores, state, fire };
  } finally { fs.rmSync(site, { recursive: true, force: true }); }
}

test('#1051 the worker: installed keeps the page and SHELL; the page from the network, kept, from its copy offline; the assets read from their cache', async () => {
  const label = '15.13.0';
  const w = await loadWorker(SITE, label);
  const CACHE = pageCacheName(SITE, label);
  for (const u of [SITE, ...SHELL.map((f) => `${SITE}${f}`)]) w.net.files.set(u, `v1 ${u}`);
  // an older build's cache, the development edition's, the assets'
  for (const n of [pageCacheName(SITE, '15.12.0'), pageCacheName(DEV, 'dev:x'), 'silinx-assets']) w.stores.set(n, new FakeCache());
  await w.fire('install');
  assert.ok(w.state.skipped);
  assert.deepEqual([...w.stores.get(CACHE).m.keys()].sort(), [SITE, ...SHELL.map((f) => `${SITE}${f}`)].sort());
  await w.fire('activate');
  assert.ok(w.state.claimed);
  assert.deepEqual([...w.stores.keys()].sort(), [CACHE, pageCacheName(DEV, 'dev:x'), 'silinx-assets'].sort());
  const req = (url, mode = 'cors') => ({ request: { url, mode, method: 'GET' } });
  // the page: the network's, kept
  w.net.files.set(SITE, 'v2 page');
  assert.equal(await (await w.fire('fetch', req(SITE, 'navigate'))).text(), 'v2 page');
  assert.equal(await (await w.stores.get(CACHE).match(SITE)).text(), 'v2 page');
  // a 404 is not kept (a deployment under way): answered as it is
  w.net.files.delete(SITE);
  assert.equal((await w.fire('fetch', req(`${SITE}index.html`, 'navigate'))).status, 404);
  assert.equal(await (await w.stores.get(CACHE).match(SITE)).text(), 'v2 page');
  // no network: the kept page; the manifest from the cache, with no request
  w.net.down = true;
  w.net.asked.length = 0;
  assert.equal(await (await w.fire('fetch', req(`${SITE}index.html`, 'navigate'))).text(), 'v2 page');
  assert.equal(await (await w.fire('fetch', req(`${SITE}manifest.webmanifest`))).text(), `v1 ${SITE}manifest.webmanifest`);
  assert.deepEqual(w.net.asked, [`${SITE}index.html`]);
  // a versioned asset: from the assets' cache (#967) when it is there, else fetched and put there
  const bundle = `${SITE}assets/vendor/yowasp-yosys/0.70.1258/gen/bundle.js`;
  await w.stores.get('silinx-assets').put(bundle, new Response('yosys'));
  assert.equal(await (await w.fire('fetch', req(bundle))).text(), 'yosys');
  const dev = `${SITE}assets/dev-83fea1b/bitdb/s3e-tiles.json`;
  await assert.rejects(w.fire('fetch', req(dev)), /Failed to fetch/, 'not kept, no network: the request fails as it would');
  w.net.down = false;
  w.net.files.set(dev, 'tiles');
  assert.equal(await (await w.fire('fetch', req(dev))).text(), 'tiles');
  await new Promise((ok) => setImmediate(ok));
  assert.equal(await (await w.stores.get('silinx-assets').match(dev)).text(), 'tiles');
  // nothing else answered by the worker: version.json, another origin, dev/
  for (const u of [`${SITE}version.json`, 'https://api.github.com/x', `${DEV}index.html`]) assert.equal(await w.fire('fetch', req(u, u.endsWith('.html') ? 'navigate' : 'cors')), null, u);
  // no network and no kept page: the navigation fails as it would without the worker
  w.stores.delete(CACHE);
  w.net.down = true;
  await assert.rejects(w.fire('fetch', req(SITE, 'navigate')), /Failed to fetch/);
});

test('#1051 the worker\'s install fails when the site lacks a file it keeps (the old worker stays)', async () => {
  const w = await loadWorker(SITE, '15.13.0');
  w.net.files.set(SITE, 'page');
  await assert.rejects(w.fire('install'), /addAll: .*manifest\.webmanifest 404/);
  assert.equal(w.state.skipped, false);
});
