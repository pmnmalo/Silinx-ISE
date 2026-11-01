// The static editions' Content-Security-Policy and versioned assets (#487): server/csp.js (one policy
// for the server's header and the pages' <meta>), the usage counter's script added to it
// (scripts/site-analytics.mjs), the assets' URLs of a built page (web/js/open-flow-browser.js LAYOUT).
// The built pages themselves, and the app under their policy: test/ui/standalone.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { contentSecurityPolicy, inlineScriptHashes, scriptHash, withMetaCsp, metaCsp, addSources } from '../server/csp.js';
import { addAnalytics } from '../scripts/site-analytics.mjs';
import './ui/core-hooks.js';   // (/core/… of the browser's modules)

const directives = (csp) => Object.fromEntries(csp.split('; ').map((d) => d.split(' ')).map(([k, ...v]) => [k, v]));

test('#487 scriptHash / inlineScriptHashes: SHA-256 in base64 of each inline script\'s text, as the browser hashes it', () => {
  // the empty text's digest, a published constant
  assert.equal(scriptHash(''), "'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='");
  const page = '<script>a()</script><script src="x.js"></script><script type="module">\nb();\n</script><script type="text/plain" id="n">t</script>';
  const ref = (t) => `'sha256-${crypto.createHash('sha256').update(t, 'utf8').digest('base64')}'`;
  assert.deepEqual(inlineScriptHashes(page), [ref('a()'), ref('\nb();\n'), ref('t')]);
  assert.deepEqual(inlineScriptHashes('<p>no script</p>'), []);
});

test('#487 contentSecurityPolicy: the server\'s header and a page\'s <meta> (no frame-ancestors), extra origins', () => {
  const header = directives(contentSecurityPolicy({ hashes: ["'sha256-x'"] }));
  assert.deepEqual(header, {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-eval'", "'wasm-unsafe-eval'", "'sha256-x'"],
    'worker-src': ["'self'", 'blob:'],
    'connect-src': ["'self'", 'https://api.github.com', 'https://raw.githubusercontent.com', 'https://registry.npmjs.org'],
    'img-src': ["'self'", 'data:', 'blob:'],
    'style-src': ["'self'", "'unsafe-inline'"],
    'font-src': ["'self'", 'data:'],
    'object-src': ["'none'"],
    'base-uri': ["'none'"],
    'frame-ancestors': ["'none'"],
    'form-action': ["'self'"],
  });
  const meta = directives(contentSecurityPolicy({ hashes: ["'sha256-y'"], scripts: ['https://a.test'], connect: ['https://a.test'], meta: true }));
  assert.equal(meta['frame-ancestors'], undefined);
  assert.deepEqual(meta['script-src'], ["'self'", "'unsafe-eval'", "'wasm-unsafe-eval'", 'https://a.test', "'sha256-y'"]);
  assert.deepEqual(meta['connect-src'], ["'self'", 'https://api.github.com', 'https://raw.githubusercontent.com', 'https://registry.npmjs.org', 'https://a.test']);
});

test('#487 withMetaCsp / metaCsp / addSources: the <meta> first in <head>, replaced in place, quotes escaped', () => {
  const page = '<!doctype html><html><head>\n<meta charset="utf-8">\n<title>t</title><script>x()</script></head><body></body></html>';
  const csp = contentSecurityPolicy({ hashes: inlineScriptHashes(page), meta: true });
  const out = withMetaCsp(page, csp);
  assert.ok(out.indexOf('http-equiv="Content-Security-Policy"') > out.indexOf('<meta charset="utf-8">'));
  assert.ok(out.indexOf('http-equiv="Content-Security-Policy"') < out.indexOf('<script>'));
  assert.equal(metaCsp(out), csp);
  assert.doesNotMatch(out.match(/<meta http-equiv[^>]*>/)[0], /content="[^"]*'[^"]*"[^"]*"/, 'one attribute value');
  // replaced, not added twice
  const again = withMetaCsp(out, 'default-src \'none\'; x "q"');
  assert.equal(again.split('http-equiv="Content-Security-Policy"').length, 2);
  assert.equal(metaCsp(again), 'default-src \'none\'; x "q"');
  assert.match(again, /content="default-src 'none'; x &quot;q&quot;"/);
  assert.equal(metaCsp(page), null);
  assert.throws(() => withMetaCsp('<html><head></head></html>', csp), /no <meta charset="utf-8">/);
  assert.equal(addSources("script-src 'self'; img-src 'self'", 'img-src', ['https://b.test', "'self'"]), "script-src 'self'; img-src 'self' https://b.test");
});

test('#487 the usage counter added to a page with a policy: its loader\'s hash, its script\'s and its counts\' origins', () => {
  const page = withMetaCsp('<!doctype html><html><head><meta charset="utf-8"></head><body><script>app()</script></body></html>', contentSecurityPolicy({ hashes: [scriptHash('app()')], meta: true }));
  const out = addAnalytics(page, 'silinx');
  const d = directives(metaCsp(out));
  // every inline script of the page is allowed by its hash: the application's and the loader; the counter's script by
  // its one versioned URL (#1439), not its host
  assert.deepEqual(d['script-src'], ["'self'", "'unsafe-eval'", "'wasm-unsafe-eval'", ...inlineScriptHashes(out), 'https://gc.zgo.at/count.v5.js']);
  assert.deepEqual(d['connect-src'], ["'self'", 'https://api.github.com', 'https://raw.githubusercontent.com', 'https://registry.npmjs.org', 'https://silinx.goatcounter.com']);
  assert.deepEqual(d['img-src'], ["'self'", 'data:', 'blob:', 'https://silinx.goatcounter.com']);
  assert.equal(addAnalytics(out, 'silinx'), out, 'once');
  // a page without a policy: none added
  assert.equal(metaCsp(addAnalytics('<html><body></body></html>', 'silinx')), null);
});

test('#487 the assets\' URLs of a built page: its version\'s folder next to the page served, on the site it names opened from a file; Yosys shared', async () => {
  const layout = { dir: '15.12.0/', yosys: '../vendor/yowasp-yosys/0.70.1258/gen/bundle.js', site: 'https://pmnmalo.github.io/Silinx-ISE/' };
  globalThis.SILINX_ASSET_LAYOUT = layout;
  delete globalThis.SILINX_ASSETS;
  try {
    const { assetsBase, yosysBundleUrl, assetsRoot } = await import('../web/js/open-flow-browser.js?layout=1');
    assert.equal(assetsBase({ protocol: 'file:', href: 'file:///tmp/Downloads/Silinx-ISE.html' }), 'https://pmnmalo.github.io/Silinx-ISE/assets/15.12.0/');
    assert.equal(assetsBase({ protocol: 'https:', href: 'https://pmnmalo.github.io/Silinx-ISE/' }), 'https://pmnmalo.github.io/Silinx-ISE/assets/15.12.0/');
    assert.equal(assetsBase({ protocol: 'https:', href: 'https://pmnmalo.github.io/Silinx-ISE/dev/index.html' }), 'https://pmnmalo.github.io/Silinx-ISE/dev/assets/15.12.0/');
    assert.equal(yosysBundleUrl('https://pmnmalo.github.io/Silinx-ISE/assets/15.12.0/'), 'https://pmnmalo.github.io/Silinx-ISE/assets/vendor/yowasp-yosys/0.70.1258/gen/bundle.js');
    // the folder of every version's assets (the cache's other versions pruned under it, #967): each edition's own
    assert.equal(assetsRoot('https://pmnmalo.github.io/Silinx-ISE/assets/15.12.0/'), 'https://pmnmalo.github.io/Silinx-ISE/assets/');
    assert.equal(assetsRoot('https://pmnmalo.github.io/Silinx-ISE/dev/assets/15.12.0/'), 'https://pmnmalo.github.io/Silinx-ISE/dev/assets/');
    // a test's SILINX_ASSETS replaces them
    globalThis.SILINX_ASSETS = 'http://127.0.0.1:9/assets/x/';
    assert.equal(assetsBase({ protocol: 'file:', href: 'file:///x.html' }), 'http://127.0.0.1:9/assets/x/');
  } finally { delete globalThis.SILINX_ASSET_LAYOUT; delete globalThis.SILINX_ASSETS; }
  // unbuilt (the module as it is in web/js): the unversioned folder, as the tests' servers have it
  const { assetsBase, yosysBundleUrl, assetsRoot } = await import('../web/js/open-flow-browser.js?layout=0');
  assert.equal(assetsBase({ protocol: 'http:', href: 'http://127.0.0.1:8/' }), 'http://127.0.0.1:8/assets/');
  assert.equal(assetsRoot('http://127.0.0.1:8/assets/'), 'http://127.0.0.1:8/assets/');
  assert.equal(yosysBundleUrl('http://127.0.0.1:8/assets/'), 'http://127.0.0.1:8/assets/vendor/yowasp-yosys/gen/bundle.js');
});
