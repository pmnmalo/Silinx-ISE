// The iCE40's nextpnr and icepack in the browser's editions (#2444): the package @yowasp/nextpnr-ice40's tarball (78 MB, every
// iCE40's chip database: too much for the site to keep per version), at the version and the SHA-512 of package-lock.json,
// downloaded by the first run from npm's registry and kept in Cache Storage. Its bundle runs from its files in memory: a function
// of its text (the Content-Security-Policy allows eval, not Blob scripts), its import.meta.url and its fetch of its own files
// given to it, so that it needs no URL of its own.
import { checkIntegrity, untgz } from '/core/tgz.js';

export const ICE40_CACHE = 'silinx-nextpnr-ice40';
const BASE = 'https://silinx.invalid/gen/bundle.js';
const AsyncFunction = (async () => {}).constructor;

/** The package's module from its files ({ 'gen/bundle.js': bytes, 'gen/…': bytes }). */
export async function ice40FromFiles(files) {
  const bundle = files['gen/bundle.js'];
  if (!bundle) throw new Error('no gen/bundle.js in nextpnr-ice40\'s package');
  const names = [];
  const source = new TextDecoder().decode(bundle).replaceAll('import.meta.url', JSON.stringify(BASE)).replaceAll('globalThis.fetch', 'fetch')
    .replace(/^export \{([^}]*)\};?\s*$/m, (_, list) => {
      for (const n of list.split(',').map(s => s.trim()).filter(Boolean)) names.push(n.split(/\s+as\s+/));
      return `return { ${names.map(([a, b]) => `${b || a}: ${a}`).join(', ')} };`;
    });
  if (!names.length) throw new Error('nextpnr-ice40\'s bundle has no exports');
  const ownFetch = async url => {
    const data = files[`gen/${String(url).split('/').pop()}`];
    if (!data) return new Response(null, { status: 404 });
    return new Response(data, { headers: { 'Content-Type': String(url).endsWith('.wasm') ? 'application/wasm' : 'application/octet-stream' } });
  };
  return new AsyncFunction('fetch', source)(ownFetch);
}

const openCache = async () => { try { return globalThis.caches ? await caches.open(ICE40_CACHE) : null; } catch { return null; } };   // (an opaque origin throws)

/** The package's module from its { url, integrity }: kept, or downloaded (log says so) and kept. */
export async function ice40FromTarball({ url, integrity }, { log = () => {}, fetchFn = fetch } = {}) {
  const cache = await openCache();
  let bytes = null;
  const kept = await cache?.match(url).catch(() => null);
  if (kept) {
    bytes = new Uint8Array(await kept.arrayBuffer());
    try { await checkIntegrity(bytes, integrity); } catch { bytes = null; }
  }
  if (!bytes) {
    log(`Downloading nextpnr-ice40 and icepack (about 80 MB, from ${new URL(url).host}: once, then kept by this browser)…`);
    let response;
    try {
      response = await fetchFn(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bytes = new Uint8Array(await response.arrayBuffer());
    } catch (e) {
      throw new Error(`nextpnr-ice40 could not be downloaded from ${url} (${e.message})`);
    }
    await checkIntegrity(bytes, integrity).catch(e => { throw new Error(`nextpnr-ice40 downloaded from ${url}: ${e.message}: not used`); });
    if (cache) {
      // (this version's alone)
      for (const k of await cache.keys().catch(() => [])) if (k.url !== url) await cache.delete(k).catch(() => {});
      await cache.put(url, new Response(bytes)).catch(() => {});
    }
  }
  return ice40FromFiles(await untgz(bytes));
}
