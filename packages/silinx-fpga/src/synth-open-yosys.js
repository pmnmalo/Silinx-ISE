// Running Yosys (#405: out of core/synth-open.js): what a failed run says (#153), its output as lines, the readable
// blobs of a scope, and the source of a worker that runs Yosys's WebAssembly build.


/**
 * What a failed Yosys run says (#153): { message, code, crash }. Yosys's own error exit has an exit
 * code; anything else is a crash of its WebAssembly module, e.g. a C++ exception it does not catch
 * (std::bad_alloc when the browser gives it no more memory), which reaches JavaScript as a
 * WebAssembly.Exception, or a RangeError, without a usable message.
 */
export function yosysError(e) {
  if (e?.code !== undefined) return { message: `Yosys failed (exit code ${e.code})`, code: e.code, crash: false };
  const wasmException = typeof WebAssembly !== 'undefined' && WebAssembly.Exception && e instanceof WebAssembly.Exception;
  const what = wasmException ? 'an exception inside its WebAssembly module that it does not handle (out of memory?)'
    : typeof e?.message === 'string' && e.message ? e.message
    : e?.name || (e != null && typeof e !== 'object' ? String(e) : `an error without a message (${Object.prototype.toString.call(e)})`);
  return { message: `Yosys failed: ${what}`, code: undefined, crash: true };
}

/** Text of a Yosys output file (YoWASP gives strings, or bytes for binary files). */
export const asText = v => (typeof v === 'string' ? v : v instanceof Uint8Array ? new TextDecoder().decode(v) : '');

/**
 * Line splitter for Yosys's stdout / stderr byte streams: feed(bytes) calls onLine for each complete
 * line, feed.end() (the end of the run) flushes the rest. YoWASP 0.70 calls the stream with null after
 * each write (a flush, even in the middle of a line: "Warning: " then the message): not the end. The
 * lines are plain text: Yosys 0.70 colours its log (ANSI escapes, "\x1b[93mWarning: \x1b[0m…") even
 * when it is not a terminal, and its option --no-color is unknown to the earlier versions; the escapes
 * are dropped here (one place for every run).
 */
export function lineStream(onLine) {
  const dec = new TextDecoder();
  const plain = l => l.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  let buf = '';
  const feed = bytes => {
    if (!bytes) return;
    buf += dec.decode(bytes, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) { onLine(plain(buf.slice(0, i).replace(/\r$/, ''))); buf = buf.slice(i + 1); }
  };
  // (the rest: a last line with no newline; not the escapes alone that end Yosys 0.70's output)
  feed.end = () => { buf = plain(buf + dec.decode()); if (buf) onLine(buf); buf = ''; };
  return feed;
}

/**
 * Blobs readable in a worker of a page with an opaque origin (#556): in WebKit (Safari), a worker of a page
 * opened from file:// (the single-file edition) cannot read any Blob, whatever started it: every read fails
 * (NotReadableError, "Cannot load blob:null/…"), YoWASP's own among them (it reads Yosys's resources with
 * `new Blob(chunks).arrayBuffer()`), so that Yosys could not start. There (self.origin 'null': in Chrome and
 * Firefox too, where it changes nothing) Blob is replaced by one that keeps its bytes and reads them in
 * JavaScript. Self-contained: yosysWorkerSource puts its text into the Yosys workers. Returns whether it did.
 */
export function readableBlobs(scope = globalThis) {
  const Native = scope.Blob;
  if (!Native || scope.origin !== 'null' || Native.readable) return false;
  // (the bytes of each Blob made here; null when a part is a Blob made elsewhere, which only the
  // browser can read: such a Blob is read as before)
  const kept = new WeakMap();
  const bytesOf = p => p instanceof ArrayBuffer ? new Uint8Array(p)
    : ArrayBuffer.isView(p) ? new Uint8Array(p.buffer, p.byteOffset, p.byteLength)
    : p instanceof Native ? kept.get(p) ?? null
    : new TextEncoder().encode(String(p));
  class ReadableBlob extends Native {
    constructor(parts = [], options) {
      super(parts, options);
      const chunks = [...parts].map(bytesOf);
      if (chunks.includes(null)) { kept.set(this, null); return; }
      const all = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const c of chunks) { all.set(c, at); at += c.length; }
      kept.set(this, all);
    }
    async arrayBuffer() { const b = kept.get(this); return b ? b.slice().buffer : super.arrayBuffer(); }
    async text() { const b = kept.get(this); return b ? new TextDecoder().decode(b) : super.text(); }
    async bytes() { const b = kept.get(this); return b ? b.slice() : super.bytes(); }
    stream() {
      const b = kept.get(this);
      return b ? new ReadableStream({ start(c) { if (b.length) c.enqueue(b.slice()); c.close(); } }) : super.stream();
    }
    slice(start, end, type) {
      const b = kept.get(this);
      return b ? new ReadableBlob([b.slice(start, end)], { type: type ?? '' }) : super.slice(start, end, type);
    }
  }
  ReadableBlob.readable = true;
  scope.Blob = ReadableBlob;
  return true;
}

/**
 * Yosys's bundle checked before it is imported (#1445): when the build wrote its SHA-256 (scope.SILINX_ASSET_INTEGRITY,
 * by its path under assets/: the single-file edition and the site, web/js/asset-cache.js), the bundle is fetched
 * (through the scope's fetch: the asset cache's, which keeps a copy only when it is the asset) and its digest compared;
 * it differs: an error, and Yosys is not imported. Nothing written for it (unbuilt: the local server, the tests), or no
 * SubtleCrypto (an http page that is not localhost): the URL as it is. Resolves to the URL to import. The import then
 * reads the same URL again (the browser's HTTP cache, normally): a module cannot be imported from the bytes checked,
 * since a worker of a file:// page cannot import a blob: URL in WebKit, and script-src would need blob: elsewhere.
 * Self-contained: yosysWorkerSource writes its text into the Yosys workers.
 */
export async function verifiedYosysUrl(url, scope = globalThis) {
  const i = url.lastIndexOf('/assets/');
  const want = i >= 0 ? scope.SILINX_ASSET_INTEGRITY?.[url.slice(i + 8)] : undefined;
  if (!want || !scope.crypto?.subtle) return url;
  const res = await scope.fetch(url);
  if (!res.ok) throw new Error(`Yosys could not be fetched (${res.status}): ${url}`);
  let bin = '';
  for (const b of new Uint8Array(await scope.crypto.subtle.digest('SHA-256', await res.arrayBuffer()))) bin += String.fromCharCode(b);
  if (`sha256-${scope.btoa(bin)}` !== want) throw new Error(`Yosys's bundle on the site is not the one this page was built with (its SHA-256 differs): not run (${url})`);
  return url;
}

/**
 * The code of a Yosys worker (as web/js/yosys-worker.js) that loads Yosys from bundleUrl (YoWASP's
 * gen/bundle.js): for a worker started from a Blob, with no file of its own. A classic worker's code
 * (Yosys by a dynamic import, which a classic worker may do, a static one not): a page opened from
 * file:// (the single-file edition, an opaque origin) cannot start a module worker from a Blob (#512);
 * its Blobs made readable first (readableBlobs: WebKit, #556); the bundle's SHA-256 checked first when the
 * build wrote it (verifiedYosysUrl, #1445).
 */
export function yosysWorkerSource(bundleUrl) {
  return `(${readableBlobs})(self);
const yosys = (${verifiedYosysUrl})(${JSON.stringify(String(bundleUrl))}, self).then(u => import(u));
const lineStream = ${lineStream};
const asText = ${asText};
const yosysError = ${yosysError};
const runYosysOnce = (${yosysRunner})(lineStream, asText, yosysError);
self.onmessage = async ({ data: { id, args, files } }) => {
  try { const { runYosys } = await yosys; self.postMessage({ id, files: await runYosysOnce(runYosys, args, files, line => self.postMessage({ id, line })) }); }
  catch (e) { self.postMessage({ id, error: e.message, code: e.code, crash: e.crash }); }
};
`;
}

/**
 * One run of Yosys, for every place that runs it (Node, its worker threads, the page's workers, the
 * browser edition's flow worker and its Blob workers, #403): runYosys (YoWASP's) with args and files;
 * Yosys's lines to onLine (lineStream); its output files as text (asText); an error as yosysError
 * says ({ message, code, crash }: the pools run a crashed one again). opts: more options of runYosys
 * (fetchProgress).
 */
export const runYosysOnce = yosysRunner(lineStream, asText, yosysError);

/** runYosysOnce made from its three helpers, given as arguments: yosysWorkerSource writes this
 *  function's text into a Blob worker's code, where only what it is given exists (a bundler renames
 *  the module's own names, #403). */
function yosysRunner(lineStream, asText, yosysError) {
  return async (runYosys, args, files, onLine = () => {}, opts = {}) => {
    const out = lineStream(onLine);
    try {
      const res = await runYosys(args, files, { stdout: out, stderr: out, ...opts });
      out.end();
      return Object.fromEntries(Object.entries(res).map(([k, v]) => [k, asText(v)]));
    } catch (e) {
      out.end();
      const { message, code, crash } = yosysError(e);
      throw Object.assign(new Error(message), { code, crash });
    }
  };
}
