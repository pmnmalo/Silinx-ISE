// The browser edition installable as an app (#1051): the site's index.html links its web app manifest
// (scripts/pwa.mjs), and this registers the service worker beside it (web/js/sw.js), scoped to the
// edition's folder (the stable edition's root, dev/). Not in the downloaded Silinx.html (no manifest
// link; a page opened from a file has no service worker) nor in the application (its page has none).

/** The service worker of the page ({ url, scope }), null where there is none. */
export function serviceWorkerOf(doc = globalThis.document, loc = globalThis.location) {
  if (!/^https?:$/.test(loc?.protocol || '')) return null;
  const href = doc?.querySelector?.('link[rel="manifest"]')?.href;
  return href ? { url: new URL('sw.js', href).href, scope: new URL('./', href).href } : null;
}

/** Register it: the registration, null where there is none or the browser refused it (said in the console's log). */
export async function registerServiceWorker({ nav = globalThis.navigator, doc, loc } = {}) {
  const sw = serviceWorkerOf(doc, loc);
  if (!sw || !nav?.serviceWorker) return null;
  try { return await nav.serviceWorker.register(sw.url, { scope: sw.scope }); } catch (e) {
    console.info(`Silinx: the page is not kept for offline use (${e.message})`);
    return null;
  }
}
