// Lets plain Node tests import browser modules of web/js: they import the shared core modules by
// the absolute URL path the server serves them at ("/core/…"), mapped here to the repository's
// core/ directory. Import this module before the web/js module under test.
import module from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT_URL = pathToFileURL(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..') + path.sep).href;

if (typeof module.registerHooks === 'function') {
  module.registerHooks({
    resolve(specifier, context, next) {
      return next(specifier.startsWith('/core/') ? ROOT_URL + specifier.slice(1) : specifier, context);
    },
  });
} else {
  // Node 22 before registerHooks: an asynchronous loader thread
  module.register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s, c, n) { return n(s.startsWith('/core/') ? ${JSON.stringify(ROOT_URL)} + s.slice(1) : s, c); }`)}`);
}

// web/js/ui.js registers window listeners when it is loaded
globalThis.addEventListener ??= () => {};
